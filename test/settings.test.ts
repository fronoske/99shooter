import { describe, expect, it } from "vitest";
import { LAYOUT, stageParams } from "../src/config";
import { Game } from "../src/game/game";
import { DEFAULT_SETTINGS, loadSettings, parseSettings, saveSettings } from "../src/settings";
import {
  applySettingButton,
  hitButton,
  pauseButton,
  pauseMenuButtons,
  settingsLayout,
  titleButtons,
} from "../src/ui/buttons";
import { hitBallSlot } from "../src/game/layout";

/** localStorage の代わり */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

describe("settings", () => {
  it("保存して読み込める", () => {
    const st = memoryStorage();
    const s = { difficulty: "hard" as const, bgm: false, se: false, vibration: true };
    saveSettings(s, st);
    expect(loadSettings(st)).toEqual(s);
  });

  it("保存がない・壊れているときは既定値", () => {
    const st = memoryStorage();
    expect(loadSettings(st)).toEqual(DEFAULT_SETTINGS);
    st.setItem("kuku-shooter.settings.v1", "{not json");
    expect(loadSettings(st)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ difficulty: "extreme", se: "yes", bgm: false })).toEqual({
      ...DEFAULT_SETTINGS,
      bgm: false,
    });
  });
});

describe("settings screen buttons", () => {
  it("ボタンで設定が変わる", () => {
    let s = { ...DEFAULT_SETTINGS };
    s = applySettingButton(s, "difficulty:easy")!;
    s = applySettingButton(s, "se:off")!;
    s = applySettingButton(s, "bgm:off")!;
    expect(s).toEqual({ difficulty: "easy", se: false, bgm: false, vibration: true });
    expect(applySettingButton(s, "back")).toBeNull();
  });

  it("選択中のボタンが現在の設定を表す", () => {
    const { buttons } = settingsLayout({ ...DEFAULT_SETTINGS, difficulty: "hard", se: false }, true);
    const selected = buttons.filter((b) => b.selected).map((b) => b.id);
    expect(selected).toEqual(["difficulty:hard", "se:off", "bgm:on", "vibration:on"]);
  });

  it("バイブレーション非対応の端末では押せない", () => {
    const { buttons } = settingsLayout(DEFAULT_SETTINGS, false);
    const vib = buttons.find((b) => b.id === "vibration:on")!;
    expect(vib.disabled).toBe(true);
    expect(hitButton(buttons, vib.x + 1, vib.y + 1)).toBeNull();
  });

  it("ボタン同士が重ならず画面内に収まる", () => {
    for (const buttons of [titleButtons(), settingsLayout(DEFAULT_SETTINGS, true).buttons, pauseMenuButtons(), [pauseButton()]]) {
      for (const b of buttons) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(360);
        expect(b.y + b.h).toBeLessThanOrEqual(640);
        for (const o of buttons) {
          if (o === b) continue;
          const overlap = b.x < o.x + o.w && o.x < b.x + b.w && b.y < o.y + o.h && o.y < b.y + b.h;
          expect(overlap).toBe(false);
        }
      }
    }
  });
});

describe("pause button", () => {
  it("上のバーの中にあり、玉から離れている", () => {
    const b = pauseButton();
    expect(b.y + b.h).toBeLessThanOrEqual(LAYOUT.hudHeight);
    for (const [x, y] of [[b.x, b.y], [b.x + b.w, b.y + b.h]]) expect(hitBallSlot(x, y)).toBe(-1);
  });
});

describe("difficulty", () => {
  it("むずかしいほど速く・頻繁に出て、正解玉が少なく、高得点", () => {
    const e = stageParams(1, "easy");
    const n = stageParams(1, "normal");
    const h = stageParams(1, "hard");
    expect(e.enemySpeed).toBeLessThan(n.enemySpeed);
    expect(n.enemySpeed).toBeLessThan(h.enemySpeed);
    expect(e.spawnInterval).toBeGreaterThan(n.spawnInterval);
    expect(n.spawnInterval).toBeGreaterThan(h.spawnInterval);
    expect(e.correctProbability).toBeGreaterThan(h.correctProbability);
    expect(e.scoreMultiplier).toBeLessThan(h.scoreMultiplier);
  });

  it("ゲームに難易度が反映される", () => {
    const g = new Game();
    g.startNewGame("hard");
    expect(g.params).toEqual(stageParams(1, "hard"));
    g.startNextStage();
    expect(g.params).toEqual(stageParams(2, "hard"));
  });
});
