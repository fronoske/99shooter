import { describe, expect, it } from "vitest";
import {
  chordAtStep,
  eventsAtStep,
  hitNotes,
  LAYER_THRESHOLDS,
  layersFor,
  LOOP_STEPS,
  STEPS_PER_BAR,
  tempoFor,
} from "../src/audio/music";
import { candyColorIndex } from "../src/render/theme";

const pc = (m: number) => ((m % 12) + 12) % 12;

describe("music", () => {
  it("倒した数に合わせて楽器が増える", () => {
    const at = (e: number) => layersFor("stage", e);
    expect(at(0)).toEqual({ chords: true, bass: true, drums: false, melody: false, sparkle: false });
    expect(at(LAYER_THRESHOLDS.drums).drums).toBe(true);
    expect(at(LAYER_THRESHOLDS.melody).melody).toBe(true);
    expect(at(1)).toEqual({ chords: true, bass: true, drums: true, melody: true, sparkle: true });
    // タイトルは静か
    expect(layersFor("title", 1).drums).toBe(false);
  });

  it("ステージが進むとテンポが上がり、上限で止まる", () => {
    expect(tempoFor("stage", 2)).toBeGreaterThan(tempoFor("stage", 1));
    expect(tempoFor("stage", 100)).toBe(136);
    expect(tempoFor("title", 1)).toBeLessThan(tempoFor("stage", 1));
  });

  it("和音とベースの音は、その小節の和音の音だけ（曲が濁らない）", () => {
    const all = layersFor("stage", 1);
    for (let s = 0; s < LOOP_STEPS; s++) {
      const chord = chordAtStep(s).map(pc);
      for (const ev of eventsAtStep(s, all)) {
        if (ev.inst === "marimba" || ev.inst === "bass") expect(chord).toContain(pc(ev.midi));
      }
    }
  });

  it("メロディは小節の頭（強拍）では和音の音になっている", () => {
    const all = layersFor("stage", 1);
    for (let bar = 0; bar < LOOP_STEPS / STEPS_PER_BAR; bar++) {
      const s = bar * STEPS_PER_BAR;
      const bell = eventsAtStep(s, all).find((e) => e.inst === "bell");
      if (bell) expect(chordAtStep(s).map(pc)).toContain(pc(bell.midi));
    }
  });

  it("命中の音はそのときの和音の音で、れんぞくが続くほど高くなる", () => {
    for (let s = 0; s < LOOP_STEPS; s += 4) {
      const chord = chordAtStep(s).map(pc);
      for (const m of hitNotes(s, 1)) expect(chord).toContain(pc(m));
    }
    expect(hitNotes(0, 5)[0]).toBeGreaterThan(hitNotes(0, 1)[0]);
    // 上限で止まる（高くなりすぎない）
    expect(hitNotes(0, 99)).toEqual(hitNotes(0, 50));
  });
});

describe("candy color", () => {
  it("数の大きさで色が決まる（1〜20 / 21〜40 / 41〜81）", () => {
    expect([1, 20].map(candyColorIndex)).toEqual([0, 0]);
    expect([21, 40].map(candyColorIndex)).toEqual([1, 1]);
    expect([42, 81].map(candyColorIndex)).toEqual([2, 2]);
  });
});

describe("volume", () => {
  it("0 は無音、3 が標準、段階が上がるほど大きい", async () => {
    const { volumeGain } = await import("../src/audio/engine");
    expect(volumeGain(0)).toBe(0);
    expect(volumeGain(3)).toBe(1);
    for (let l = 1; l < 5; l++) expect(volumeGain(l + 1)).toBeGreaterThan(volumeGain(l));
  });
});
