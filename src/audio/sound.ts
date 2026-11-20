/**
 * 仮の効果音。Web Audio API で簡単な電子音を鳴らす。
 * 演出を作り込むときに音源ファイルへ差し替える想定。
 */
export type SoundName = "tap" | "throw" | "hit" | "miss" | "clear" | "gameOver";

/** [周波数(Hz), 長さ(秒)] の並び。周波数 0 は休符 */
type Note = [number, number];

interface SoundDef {
  wave: OscillatorType;
  notes: Note[];
  volume: number;
}

const SOUNDS: Record<SoundName, SoundDef> = {
  tap: { wave: "square", notes: [[1000, 0.03]], volume: 0.08 },
  throw: { wave: "triangle", notes: [[520, 0.03], [780, 0.04]], volume: 0.15 },
  hit: { wave: "square", notes: [[880, 0.05], [1320, 0.1]], volume: 0.12 },
  miss: { wave: "sawtooth", notes: [[300, 0.06], [200, 0.12]], volume: 0.08 },
  clear: {
    wave: "square",
    notes: [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.3]],
    volume: 0.12,
  },
  gameOver: {
    wave: "triangle",
    notes: [[392, 0.18], [330, 0.18], [262, 0.4]],
    volume: 0.2,
  },
};

export class SoundPlayer {
  enabled = true;
  private ctx: AudioContext | null = null;

  /**
   * ユーザー操作（タップ）の中で呼ぶ。
   * iOS Safari などは、ユーザー操作の中でないと音を鳴らせないため。
   */
  unlock(): void {
    if (this.ctx === null) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  play(name: SoundName): void {
    const ctx = this.ctx;
    if (!this.enabled || ctx === null || ctx.state !== "running") return;
    const def = SOUNDS[name];
    let t = ctx.currentTime;
    for (const [freq, dur] of def.notes) {
      if (freq > 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = def.wave;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(def.volume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur);
      }
      t += dur;
    }
  }
}
