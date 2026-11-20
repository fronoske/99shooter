/**
 * 音を鳴らす部分（演出 A1・A2）。音声ファイル・ライブラリは使わず、Web Audio API で合成する。
 * 曲のデータと進め方は music.ts。
 *
 * - BGM は先読みスケジューラで鳴らす（25ms ごとに、0.12 秒先までの音を予約する）
 * - 効果音は曲と同じ調で、命中の音はそのときの和音に合わせる
 * - ハズレのときは BGM を少し小さくして、「ぽよん」を目立たせる
 * - iOS などはユーザー操作の中でないと音を出せないので、最初のタップで unlock() する
 */
import {
  eventsAtStep,
  hitNotes,
  layersFor,
  LOOP_STEPS,
  midiToHz,
  stepSeconds,
  tempoFor,
  type Instrument,
  type MusicMode,
} from "./music";

/** 音量の調整値 */
export const MIX = {
  master: 0.8,
  bgm: 0.32,
  sfx: 0.7,
  /** オルゴール・効果音にかける響き（リバーブ）の量 */
  reverbSend: 0.22,
  /** ハズレのときに BGM を下げる割合と、戻るまでの時間（秒） */
  duck: 0.4,
  duckTime: 0.45,
  /**
   * スタートしたときに BGM を止めておく時間（秒）。タイトルの曲をぴたっと止めて、
   * 合図の音のあとにステージの曲を始めると「スタートした！」感じが出る
   */
  startGap: 0.7,
} as const;

const LOOKAHEAD = 0.12;
const TICK_MS = 25;

export type SfxName = "tap" | "throw" | "hit" | "miss" | "streak" | "clear" | "gameOver" | "start";

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private bgmBus!: GainNode;
  private sfxBus!: GainNode;
  private reverb!: ConvolverNode;
  private noise!: AudioBuffer;

  private bgmEnabled = true;
  private sfxEnabled = true;

  private mode: MusicMode | null = null;
  private stage = 1;
  private intensity = 0;
  private playing = false;
  private step = 0;
  private nextStepTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  /** ユーザー操作の中で呼ぶ。初回に音の準備をして、止まっていれば再開する */
  unlock(): void {
    if (this.ctx === null) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.setup(this.ctx);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  get ready(): boolean {
    return this.ctx !== null;
  }

  private setup(ctx: AudioContext): void {
    this.master = ctx.createGain();
    this.master.gain.value = MIX.master;
    this.master.connect(ctx.destination);
    this.bgmBus = ctx.createGain();
    this.bgmBus.gain.value = this.bgmEnabled ? MIX.bgm : 0;
    this.bgmBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxEnabled ? MIX.sfx : 0;
    this.sfxBus.connect(this.master);

    // 響き: 減衰するノイズを畳み込みに使う簡易リバーブ
    this.reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.3);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    this.reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.6;
    this.reverb.connect(wet).connect(this.master);

    // 打楽器用のノイズ
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }

  setBgmEnabled(on: boolean): void {
    this.bgmEnabled = on;
    if (this.ctx) this.bgmBus.gain.setTargetAtTime(on ? MIX.bgm : 0, this.ctx.currentTime, 0.05);
  }

  setSfxEnabled(on: boolean): void {
    this.sfxEnabled = on;
    if (this.ctx) this.sfxBus.gain.setTargetAtTime(on ? MIX.sfx : 0, this.ctx.currentTime, 0.02);
  }

  // ---------------------------------------------------------------- BGM

  /**
   * 曲を最初から鳴らす。同じ曲がすでに鳴っていれば何もしない（stage は更新する）。
   * gap 秒を指定すると、今の曲をすぐ消して、その間は無音にしてから始める
   */
  playMusic(mode: MusicMode, stage = 1, gap = 0): void {
    this.stage = stage;
    if (this.mode === mode && this.playing) return;
    this.mode = mode;
    this.step = 0;
    this.intensity = 0;
    if (gap > 0) this.silence(gap);
    this.startScheduler(gap);
  }

  /** 先に予約済みの音も含めて BGM をすぐ消し、gap 秒後に元の音量へ戻す */
  private silence(gap: number): void {
    if (!this.ctx || !this.bgmEnabled) return;
    const t = this.ctx.currentTime;
    const g = this.bgmBus.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + 0.05);
    g.setValueAtTime(0, t + gap);
    g.linearRampToValueAtTime(MIX.bgm, t + gap + 0.02);
  }

  /** ステージで倒した数の割合（0〜1）。楽器の増え方に使う */
  setIntensity(e: number): void {
    this.intensity = Math.min(1, Math.max(0, e));
  }

  /** 一時停止（ポーズ）。再開すると続きから */
  pauseMusic(): void {
    this.stopScheduler();
  }

  resumeMusic(): void {
    if (this.mode !== null && !this.playing) this.startScheduler();
  }

  stopMusic(): void {
    this.stopScheduler();
    this.mode = null;
  }

  private startScheduler(delay = 0): void {
    this.stopScheduler();
    this.playing = true;
    if (!this.ctx) return; // unlock 後に tick が始まる
    this.nextStepTime = this.ctx.currentTime + 0.06 + delay;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  private stopScheduler(): void {
    this.playing = false;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** unlock 前に playMusic された曲を、unlock 後に鳴らし始める */
  startPendingMusic(): void {
    if (this.ctx && this.playing && this.timer === null) this.startScheduler();
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || this.mode === null) return;
    // 長く止まっていた（タブが裏にあった等）ときは、まとめて鳴らさずに今から再開する
    if (this.nextStepTime < ctx.currentTime - 0.2) this.nextStepTime = ctx.currentTime + 0.05;
    const dur = stepSeconds(tempoFor(this.mode, this.stage));
    const layers = layersFor(this.mode, this.intensity);
    while (this.nextStepTime < ctx.currentTime + LOOKAHEAD) {
      for (const ev of eventsAtStep(this.step, layers)) {
        this.voice(ev.inst, ev.midi, ev.vel, this.nextStepTime, this.bgmBus, dur);
      }
      this.nextStepTime += dur;
      this.step = (this.step + 1) % LOOP_STEPS;
    }
  }

  /** 今鳴っている曲の位置（効果音の高さを和音に合わせるため） */
  private currentStep(): number {
    return this.step;
  }

  // ---------------------------------------------------------------- 効果音

  /**
   * 効果音を鳴らす。streak は命中のときのれんぞく回数（音の高さが上がる）
   */
  sfx(name: SfxName, streak = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxEnabled || ctx.state !== "running") return;
    const t = ctx.currentTime + 0.005;
    const out = this.sfxBus;
    const step = this.currentStep();
    switch (name) {
      case "tap":
        this.voice("bell", 88, 0.35, t, out);
        break;
      case "throw":
        this.glide("triangle", 520, 1040, 0.09, 0.25, t, out);
        break;
      case "hit": {
        // 和音に合った 3 つの音を「ポロロン」と上へ。れんぞくが続くほど高くなる
        hitNotes(step, streak).forEach((m, i) => {
          this.voice("marimba", m, 0.7, t + i * 0.045, out);
          this.voice("bell", m, 0.35, t + i * 0.045, out);
        });
        break;
      }
      case "streak": {
        // れんぞくの節目: 上へ駆け上がるきらきら
        const base = hitNotes(step, streak + 2);
        [...base, base[0] + 12, base[1] + 12].forEach((m, i) => this.voice("glock", m, 0.35, t + 0.14 + i * 0.04, out));
        break;
      }
      case "miss":
        // 「ぽよん」: 下がってから少し戻る、はずむ音。叱る感じにしない
        this.boing(t, out);
        this.duckBgm(t);
        break;
      case "start":
        // スタートの合図: ド・ミ・ソ と上がって、最後に「ジャン」（BGM が止まっている間に鳴る）
        [72, 76, 79].forEach((m, i) => this.voice("bell", m, 0.45, t + i * 0.08, out));
        this.voice("marimba", 84, 0.7, t + 0.26, out, 0.4);
        this.voice("bell", 84, 0.4, t + 0.26, out, 0.6);
        this.voice("kick", 0, 0.6, t + 0.26, out);
        break;
      case "clear": {
        // ファンファーレ: ド・ミ・ソ・ド → 和音
        [72, 76, 79, 84].forEach((m, i) => {
          this.voice("marimba", m, 0.7, t + i * 0.1, out);
          this.voice("bell", m + 12, 0.3, t + i * 0.1, out);
        });
        const end = t + 0.42;
        for (const m of [72, 76, 79, 84]) this.voice("bell", m, 0.4, end, out, 0.8);
        this.voice("bass", 48, 0.7, end, out, 0.8);
        this.voice("kick", 0, 0.7, end, out);
        [96, 100, 103, 108].forEach((m, i) => this.voice("glock", m, 0.25, end + 0.15 + i * 0.05, out));
        break;
      }
      case "gameOver":
        // やさしく下がる: ソ・ミ・ド
        [67, 64, 60].forEach((m, i) => this.voice("marimba", m, 0.6, t + i * 0.22, out, 0.5));
        this.voice("bass", 48, 0.5, t + 0.66, out, 0.9);
        break;
    }
  }

  private duckBgm(t: number): void {
    if (!this.ctx || !this.bgmEnabled) return;
    const g = this.bgmBus.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(MIX.bgm * MIX.duck, t + 0.04);
    g.linearRampToValueAtTime(MIX.bgm, t + MIX.duckTime);
  }

  // ---------------------------------------------------------------- 楽器

  /** 楽器の音を 1 つ鳴らす。length は伸ばしたい長さ（秒、目安） */
  private voice(inst: Instrument, midi: number, vel: number, t: number, out: AudioNode, length = 0.25): void {
    const ctx = this.ctx!;
    const f = midiToHz(midi);
    switch (inst) {
      case "marimba": {
        // 木琴: サイン波＋高い倍音を短く
        this.tone("sine", f, vel, t, 0.005, Math.max(0.35, length), out);
        this.tone("sine", f * 4, vel * 0.18, t, 0.002, 0.06, out);
        break;
      }
      case "bell": {
        // オルゴール: サイン波＋3 倍音、長めに響かせてリバーブへ
        const decay = Math.max(0.6, length);
        this.tone("sine", f, vel * 0.8, t, 0.003, decay, out, true);
        this.tone("sine", f * 3, vel * 0.12, t, 0.002, decay * 0.4, out, true);
        break;
      }
      case "glock": {
        this.tone("triangle", f, vel, t, 0.002, 0.3, out, true);
        break;
      }
      case "bass": {
        this.tone("triangle", f, vel, t, 0.01, Math.max(0.25, length), out);
        this.tone("sine", f * 2, vel * 0.25, t, 0.01, 0.15, out);
        break;
      }
      case "kick": {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.frequency.setValueAtTime(160, t);
        osc.frequency.exponentialRampToValueAtTime(50, t + 0.12);
        g.gain.setValueAtTime(vel, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        osc.connect(g).connect(out);
        osc.start(t);
        osc.stop(t + 0.17);
        break;
      }
      case "hat":
        this.noiseHit("highpass", 7000, vel * 0.5, t, 0.04, out);
        break;
      case "clap":
        this.noiseHit("bandpass", 1500, vel, t, 0.09, out);
        this.noiseHit("bandpass", 1500, vel * 0.6, t + 0.012, 0.09, out);
        break;
    }
  }

  private tone(
    type: OscillatorType,
    freq: number,
    vel: number,
    t: number,
    attack: number,
    decay: number,
    out: AudioNode,
    reverb = false,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    osc.connect(g).connect(out);
    if (reverb) {
      const send = ctx.createGain();
      send.gain.value = MIX.reverbSend;
      g.connect(send).connect(this.reverb);
    }
    osc.start(t);
    osc.stop(t + attack + decay + 0.02);
  }

  private noiseHit(type: BiquadFilterType, freq: number, vel: number, t: number, decay: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    src.connect(filter).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.01);
  }

  private glide(type: OscillatorType, from: number, to: number, dur: number, vel: number, t: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.04);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private boing(t: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(190, t + 0.12);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.22);
    osc.frequency.exponentialRampToValueAtTime(240, t + 0.34);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.45, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.4);
  }
}
