/**
 * 見た目の調整値（色・フォント）。
 * 演出の方針は docs/presentation.md を参照。
 * 文字は明るい背景の上でも読めるよう、濃いむらさきを基本にする。
 */

export const FONT = `"Hiragino Maru Gothic ProN", "Hiragino Sans", "BIZ UDPGothic", "Meiryo", sans-serif`;

export const THEME = {
  /** 背景のグラデーション（上 → 下） */
  bgTop: "#fde7f3",
  bgBottom: "#e8dcff",

  /** 文字の基本色 */
  text: "#5a3a6e",
  /** 補足の文字 */
  note: "#9a7fae",
  /** 文字のふち（明るい背景・絵の上で読みやすくする） */
  textOutline: "#ffffff",

  /** アクセント */
  pink: "#ff8fb8",
  yellow: "#ffd166",

  /** 上のバー */
  hudBg: "#fff7fb",
  hudLine: "#f3c6dc",

  /** 防衛ライン */
  line: "#ff8fb8",
  /** 敵が近づいたときの防衛ライン */
  lineDanger: "#ff4f8b",

  /** 得点の文字 */
  scoreText: "#ff6fa3",

  /** 画面全体に重ねるレイヤー（ステージクリア・ゲームオーバー） */
  overlay: "rgba(255, 246, 251, 0.78)",
  /** ポーズ画面のレイヤー。不透明度を上げるほどプレイ画面が見えにくくなる */
  pauseOverlay: "rgba(244, 233, 255, 0.82)",

  /** ボタン */
  button: "#ffffff",
  buttonText: "#5a3a6e",
  buttonBorder: "#e7cdf0",
  buttonPrimary: "#ff8fb8",
  buttonPrimaryText: "#ffffff",
  buttonSelected: "#8fd9c0",
  buttonSelectedText: "#24584a",
  buttonDisabled: "#efe8f3",
  buttonDisabledText: "#c3b6cc",
  /** ボタンの下の影（ぷっくり見せる） */
  buttonShadow: "rgba(150, 90, 160, 0.25)",
} as const;

/** 敵（もこもこ雲）の色。敵ごとに順番に使う */
export const CLOUD_COLORS = [
  { body: "#b8e6d8", shade: "#93d1bf" }, // ミント
  { body: "#d9c8ff", shade: "#bba6f0" }, // ライラック
  { body: "#ffd6e0", shade: "#f5b3c4" }, // ピーチ
] as const;

/** 玉（キャンディ）の色。番号は candyColorIndex で決める（小さい数 → 大きい数の順） */
export const CANDY_COLORS = [
  { body: "#ff9ec4", shade: "#f27aa9" }, // ピンク
  { body: "#f2c98f", shade: "#deaa66" }, // こむぎいろ
  { body: "#8fdcc3", shade: "#66c3a6" }, // ミント
] as const;

/** 自分（うさぎ耳の女の子）の色 */
export const GIRL_COLORS = {
  hood: "#ffb3cf",
  hoodShade: "#f58fb5",
  earInner: "#ffe0ec",
  skin: "#ffeadd",
  cheek: "rgba(255, 128, 170, 0.45)",
  face: "#5a3a6e",
  dress: "#d9c8ff",
  dressShade: "#bba6f0",
  ribbon: "#ff6fa3",
  shoe: "#a98bd6",
} as const;

/** ステージの背景（演出 P12）。ステージが進むと順番に変わり、最後まで行ったら最初に戻る */
export interface StageBackground {
  name: string;
  /** 上から下へのグラデーションの色 */
  stops: readonly string[];
  /** 夜空の星を出す */
  stars: boolean;
}

export const STAGE_BACKGROUNDS: readonly StageBackground[] = [
  // 文字（濃いむらさき）が読めるよう、どの背景も明るめのパステルにする
  { name: "あさ", stops: ["#fde7f3", "#e8dcff"], stars: false },
  { name: "ひる", stops: ["#dff3ff", "#e6fbef"], stars: false },
  { name: "ゆうがた", stops: ["#ffe3cf", "#ffd6e5", "#e6d6ff"], stars: false },
  { name: "よる", stops: ["#c9bdf0", "#e3dcfb"], stars: true },
];

export function stageBackground(stage: number): StageBackground {
  const n = STAGE_BACKGROUNDS.length;
  return STAGE_BACKGROUNDS[(((stage - 1) % n) + n) % n];
}

/**
 * キャンディの色で数の大きさを表す（演出 C1）。この値以下ならその色。
 * 1〜20 ピンク、21〜40 こむぎいろ、41〜81 ミント
 */
export const CANDY_BANDS = [20, 40, 81] as const;

/** 数字から CANDY_COLORS の番号を決める */
export function candyColorIndex(value: number): number {
  const i = CANDY_BANDS.findIndex((max) => value <= max);
  return i < 0 ? CANDY_BANDS.length - 1 : i;
}
