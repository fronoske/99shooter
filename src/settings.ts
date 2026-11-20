import { DIFFICULTIES, type Difficulty } from "./config";

/** 音量の段階。0 = 消す、5 = いちばん大きい */
export const VOLUME_MAX = 5;
export const VOLUME_LEVELS = [0, 1, 2, 3, 4, 5] as const;
export type VolumeLevel = (typeof VOLUME_LEVELS)[number];

/** プレイヤーが設定画面で変えられる設定 */
export interface Settings {
  difficulty: Difficulty;
  /** BGM の音量（0〜5） */
  bgmVolume: VolumeLevel;
  /** 効果音の音量（0〜5） */
  seVolume: VolumeLevel;
  /** バイブレーション（対応端末のみ） */
  vibration: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  difficulty: "easy",
  bgmVolume: 3,
  seVolume: 3,
  vibration: true,
};

const STORAGE_KEY = "kuku-shooter.settings.v1";

/** 保存データを検証して Settings にする。壊れた値は既定値で補う */
export function parseSettings(raw: unknown): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS };
  if (typeof raw !== "object" || raw === null) return s;
  const r = raw as Record<string, unknown>;
  if (DIFFICULTIES.includes(r.difficulty as Difficulty)) s.difficulty = r.difficulty as Difficulty;
  s.bgmVolume = parseVolume(r.bgmVolume, r.bgm, s.bgmVolume);
  s.seVolume = parseVolume(r.seVolume, r.se, s.seVolume);
  if (typeof r.vibration === "boolean") s.vibration = r.vibration;
  return s;
}

function isVolume(v: unknown): v is VolumeLevel {
  return typeof v === "number" && (VOLUME_LEVELS as readonly number[]).includes(v);
}

/**
 * 音量を読む。以前のオン・オフの保存データ（bgm / se: boolean）は、オン = 3、オフ = 0 として引き継ぐ
 */
function parseVolume(level: unknown, oldOnOff: unknown, fallback: VolumeLevel): VolumeLevel {
  if (isVolume(level)) return level;
  if (typeof oldOnOff === "boolean") return oldOnOff ? 3 : 0;
  return fallback;
}

export function loadSettings(storage: Storage | undefined = globalThis.localStorage): Settings {
  try {
    const json = storage?.getItem(STORAGE_KEY);
    return parseSettings(json ? JSON.parse(json) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings, storage: Storage | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // プライベートモードなどで保存できなくてもゲームは続ける
  }
}
