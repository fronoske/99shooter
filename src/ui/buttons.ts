import { DIFFICULTIES, DIFFICULTY, LAYOUT, VIEW } from "../config";
import { VOLUME_LEVELS, type Settings, type VolumeLevel } from "../settings";

/** 画面上のボタン（論理座標、左上基準） */
export interface Button {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  /** 選択中（設定の現在値） */
  selected?: boolean;
  /** 押せない */
  disabled?: boolean;
  /** 目立たせるボタン */
  primary?: boolean;
}

/** 設定画面の各行の見出し */
export interface SettingRow {
  label: string;
  y: number;
  /** 補足（小さい文字） */
  note?: string;
}

export function hitButton(buttons: readonly Button[], x: number, y: number): Button | null {
  for (const b of buttons) {
    if (!b.disabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

function centered(id: string, y: number, w: number, h: number, label: string, primary = false): Button {
  return { id, x: (VIEW.width - w) / 2, y, w, h, label, primary };
}

/** 横に等間隔で並べる */
function row(ids: string[], labels: string[], y: number, w: number, gap: number, h = 46): Button[] {
  const total = ids.length * w + (ids.length - 1) * gap;
  const left = (VIEW.width - total) / 2;
  return ids.map((id, i) => ({ id, x: left + i * (w + gap), y, w, h, label: labels[i] }));
}

export function titleButtons(): Button[] {
  return [
    centered("start", 390, 220, 60, "スタート", true),
    centered("settings", 470, 220, 50, "せってい"),
  ];
}

/** プレイ画面右上のポーズボタン（上のバーの中。玉から離して押し間違いを防ぐ） */
export function pauseButton(): Button {
  // 上のバー全体（ボタンの絵は出さない）。雲や玉とは離れているので押し間違えにくい（演出 C2）
  return { id: "pause", x: 0, y: 0, w: VIEW.width, h: LAYOUT.hudHeight, label: "" };
}

/** ポーズ画面のボタン。「やめる」は小さく地味にして押し間違いを防ぐ */
export function pauseMenuButtons(): Button[] {
  return [
    centered("resume", 290, 220, 64, "つづける", true),
    centered("quit", 430, 160, 44, "やめる"),
  ];
}

const ON_OFF = ["オン", "オフ"];

/** 音量の 6 段階のボタン。0 は「オフ」と書く */
function volumeRow(key: string, value: VolumeLevel, y: number): Button[] {
  const ids = VOLUME_LEVELS.map((v) => `${key}:${v}`);
  const labels = VOLUME_LEVELS.map((v) => (v === 0 ? "オフ" : String(v)));
  return row(ids, labels, y, 48, 6).map((b, i) => ({ ...b, selected: VOLUME_LEVELS[i] === value }));
}

function toggleRow(key: string, value: boolean, y: number, disabled = false): Button[] {
  return row([`${key}:on`, `${key}:off`], ON_OFF, y, 140, 20).map((b, i) => ({
    ...b,
    selected: !disabled && (i === 0) === value,
    disabled,
  }));
}

/** 設定画面のレイアウト */
export function settingsLayout(
  s: Settings,
  vibrationSupported: boolean,
): { rows: SettingRow[]; buttons: Button[] } {
  const rows: SettingRow[] = [
    { label: "むずかしさ", y: 120 },
    { label: "こうかおん", y: 236 },
    { label: "BGM", y: 336 },
    {
      label: "バイブレーション",
      y: 436,
      note: vibrationSupported ? undefined : "（この きかいでは つかえません）",
    },
  ];
  const buttons: Button[] = [
    ...row(
      DIFFICULTIES.map((d) => `difficulty:${d}`),
      DIFFICULTIES.map((d) => DIFFICULTY[d].label),
      142,
      104,
      8,
      50,
    ).map((b, i) => ({ ...b, selected: DIFFICULTIES[i] === s.difficulty })),
    ...volumeRow("seVolume", s.seVolume, 258),
    ...volumeRow("bgmVolume", s.bgmVolume, 358),
    ...toggleRow("vibration", s.vibration, 458, !vibrationSupported),
    centered("back", 560, 220, 50, "もどる", true),
  ];
  return { rows, buttons };
}

/**
 * 設定画面のボタン id を設定の変更に変換する。
 * 設定を変えないボタン（もどる など）は null。
 */
export function applySettingButton(s: Settings, id: string): Settings | null {
  const [key, value] = id.split(":");
  switch (key) {
    case "difficulty":
      return DIFFICULTIES.includes(value as Settings["difficulty"])
        ? { ...s, difficulty: value as Settings["difficulty"] }
        : null;
    case "seVolume":
    case "bgmVolume": {
      const v = Number(value);
      return (VOLUME_LEVELS as readonly number[]).includes(v) ? { ...s, [key]: v as VolumeLevel } : null;
    }
    case "vibration":
      return { ...s, vibration: value === "on" };
    default:
      return null;
  }
}
