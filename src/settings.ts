import { DIFFICULTIES, type Difficulty } from "./config";

/** プレイヤーが設定画面で変えられる設定 */
export interface Settings {
  difficulty: Difficulty;
  /** BGM（BGM 自体は未実装。設定の保存のみ） */
  bgm: boolean;
  /** 効果音 */
  se: boolean;
  /** バイブレーション（対応端末のみ） */
  vibration: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  difficulty: "easy",
  bgm: true,
  se: true,
  vibration: true,
};

const STORAGE_KEY = "kuku-shooter.settings.v1";

/** 保存データを検証して Settings にする。壊れた値は既定値で補う */
export function parseSettings(raw: unknown): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS };
  if (typeof raw !== "object" || raw === null) return s;
  const r = raw as Record<string, unknown>;
  if (DIFFICULTIES.includes(r.difficulty as Difficulty)) s.difficulty = r.difficulty as Difficulty;
  if (typeof r.bgm === "boolean") s.bgm = r.bgm;
  if (typeof r.se === "boolean") s.se = r.se;
  if (typeof r.vibration === "boolean") s.vibration = r.vibration;
  return s;
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
