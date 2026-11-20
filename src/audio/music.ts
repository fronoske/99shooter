/**
 * BGM の曲データと、曲の進め方（演出 A1）。音は鳴らさない純粋なロジック。
 * 実際に鳴らすのは engine.ts。
 *
 * - ハ長調、和音は C → G → Am → F（1 小節ずつ）を 2 回、計 8 小節で 1 周
 * - 1 小節 = 16 ステップ（16 分音符）
 * - ステージで倒した数（intensity 0〜1）に合わせて楽器が増える
 * - ステージが進むとテンポが上がる
 */

export const STEPS_PER_BAR = 16;
export const BARS = 8;
export const LOOP_STEPS = STEPS_PER_BAR * BARS;

/** MIDI ノート番号 → 周波数（Hz） */
export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** 1 小節ごとの和音（MIDI 番号、根音から） */
export const CHORDS: readonly (readonly number[])[] = [
  [60, 64, 67], // C
  [55, 59, 62], // G
  [57, 60, 64], // Am
  [53, 57, 60], // F
];

/** ステップ位置の和音 */
export function chordAtStep(step: number): readonly number[] {
  const bar = Math.floor(((step % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS / STEPS_PER_BAR);
  return CHORDS[bar % CHORDS.length];
}

/** 0 は休み。8 分音符ごと（1 小節 8 個）のメロディ。前半 4 小節と後半 4 小節で変える */
const MELODY_8THS: readonly number[] = [
  // C
  76, 79, 84, 0, 79, 76, 79, 0,
  // G
  74, 79, 83, 0, 81, 79, 74, 0,
  // Am
  72, 76, 81, 0, 79, 76, 72, 0,
  // F
  77, 81, 84, 0, 81, 0, 79, 0,
  // C
  79, 0, 76, 79, 84, 0, 0, 0,
  // G
  83, 0, 79, 83, 86, 0, 0, 0,
  // Am
  84, 83, 81, 79, 76, 0, 0, 0,
  // F
  77, 79, 81, 84, 0, 0, 79, 0,
];

export type Instrument = "marimba" | "bell" | "bass" | "kick" | "hat" | "clap" | "glock";

export interface NoteEvent {
  inst: Instrument;
  /** MIDI 番号（打楽器は 0） */
  midi: number;
  /** 音量（0〜1） */
  vel: number;
}

/** 鳴らす楽器のまとまり */
export interface Layers {
  chords: boolean;
  bass: boolean;
  drums: boolean;
  melody: boolean;
  /** 手拍子・16 分の刻み・メロディの 1 オクターブ上のきらきら */
  sparkle: boolean;
}

export type MusicMode = "title" | "stage";

/** 楽器が増えていくきっかけ（ステージで倒した数の割合） */
export const LAYER_THRESHOLDS = {
  drums: 0.25,
  melody: 0.5,
  sparkle: 0.75,
} as const;

export function layersFor(mode: MusicMode, intensity: number): Layers {
  if (mode === "title") {
    // タイトルは静かな版: 和音とメロディだけ
    return { chords: true, bass: false, drums: false, melody: true, sparkle: false };
  }
  return {
    chords: true,
    bass: true,
    drums: intensity >= LAYER_THRESHOLDS.drums,
    melody: intensity >= LAYER_THRESHOLDS.melody,
    sparkle: intensity >= LAYER_THRESHOLDS.sparkle,
  };
}

/** テンポ（BPM）。タイトルはゆっくり、ステージが進むと速くなる（上限あり） */
export function tempoFor(mode: MusicMode, stage: number): number {
  if (mode === "title") return 100;
  return Math.min(112 + (Math.max(1, stage) - 1) * 4, 136);
}

/** 16 分音符 1 つの長さ（秒） */
export function stepSeconds(bpm: number): number {
  return 60 / bpm / 4;
}

/** ステップで鳴らす音の一覧 */
export function eventsAtStep(step: number, layers: Layers): NoteEvent[] {
  const s = ((step % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS;
  const inBar = s % STEPS_PER_BAR;
  const chord = chordAtStep(s);
  const out: NoteEvent[] = [];

  // 和音: 8 分音符で 1-3-5-3 と上り下りする分散和音（木琴）
  if (layers.chords && inBar % 2 === 0) {
    const order = [0, 1, 2, 1];
    const tone = chord[order[(inBar / 2) % 4]];
    out.push({ inst: "marimba", midi: tone, vel: inBar === 0 ? 0.55 : 0.4 });
  }

  // ベース: 1 拍目に根音、3 拍目に 5 度（スマホのスピーカーでも聞こえる高さにする）
  if (layers.bass) {
    if (inBar === 0) out.push({ inst: "bass", midi: chord[0] - 12, vel: 0.7 });
    if (inBar === 8) out.push({ inst: "bass", midi: chord[2] - 12, vel: 0.55 });
    if (inBar === 14) out.push({ inst: "bass", midi: chord[0] - 12, vel: 0.4 });
  }

  // ドラム: 1・3 拍目にキック、裏拍にハイハット
  if (layers.drums) {
    if (inBar === 0 || inBar === 8) out.push({ inst: "kick", midi: 0, vel: 0.8 });
    if (inBar % 4 === 2) out.push({ inst: "hat", midi: 0, vel: 0.35 });
  }

  // メロディ（オルゴール）
  if (layers.melody && inBar % 2 === 0) {
    const note = MELODY_8THS[s / 2];
    if (note > 0) out.push({ inst: "bell", midi: note, vel: 0.5 });
  }

  // きらきら: 2・4 拍目に手拍子、16 分の刻み、メロディの 1 オクターブ上
  if (layers.sparkle) {
    if (inBar === 4 || inBar === 12) out.push({ inst: "clap", midi: 0, vel: 0.5 });
    if (inBar % 2 === 1) out.push({ inst: "hat", midi: 0, vel: 0.18 });
    if (inBar % 2 === 0) {
      const note = MELODY_8THS[s / 2];
      if (note > 0) out.push({ inst: "glock", midi: note + 12, vel: 0.22 });
    }
  }
  return out;
}

/**
 * 命中の効果音の音の高さ（演出 A2）。
 * そのときの和音の音を高い方へ並べたはしごの上を、れんぞくが続くほど上っていく。
 * どの高さでも曲の和音に合うので、BGM となじむ。3 つの音を続けて鳴らす。
 */
export function hitNotes(step: number, streak: number): number[] {
  const chord = chordAtStep(step);
  const ladder: number[] = [];
  for (let oct = 12; oct <= 36; oct += 12) for (const t of chord) ladder.push(t + oct);
  ladder.sort((a, b) => a - b);
  const start = Math.min(Math.max(0, streak - 1), ladder.length - 3);
  return ladder.slice(start, start + 3);
}
