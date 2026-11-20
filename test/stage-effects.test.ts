import { describe, expect, it } from "vitest";
import type { Game } from "../src/game/game";
import { Effects, starsForMisses } from "../src/render/effects";
import { stageBackground, STAGE_BACKGROUNDS } from "../src/render/theme";

describe("stage clear reward", () => {
  it("ハズレの少なさで星の数が決まる", () => {
    expect(starsForMisses(0)).toBe(3);
    expect(starsForMisses(1)).toBe(2);
    expect(starsForMisses(3)).toBe(2);
    expect(starsForMisses(4)).toBe(1);
  });

  it("ハズレの回数はステージごとに数え直す", () => {
    const fx = new Effects();
    fx.onStageStart(0);
    fx.onMiss();
    fx.onMiss();
    expect(fx.stageMisses).toBe(2);
    fx.onStageStart(5000);
    expect(fx.stageMisses).toBe(0);
  });

  it("花びらはステージクリア画面でだけ降る", () => {
    const fx = new Effects();
    const draws: number[] = [];
    const ctx = new Proxy({}, { get: () => () => draws.push(1), set: () => true }) as unknown as CanvasRenderingContext2D;
    const playing = { phase: "playing", flying: null, enemies: [] } as unknown as Game;
    const clear = { phase: "stageClear", flying: null, enemies: [] } as unknown as Game;
    for (let i = 0; i < 60; i++) fx.update(1 / 60, playing);
    fx.drawPetals(ctx);
    expect(draws).toHaveLength(0);
    for (let i = 0; i < 60; i++) fx.update(1 / 60, clear);
    fx.drawPetals(ctx);
    expect(draws.length).toBeGreaterThan(0);
  });
});

describe("stage backgrounds", () => {
  it("ステージごとに背景が変わり、最後まで行ったら最初に戻る", () => {
    expect(stageBackground(1)).toBe(STAGE_BACKGROUNDS[0]);
    expect(stageBackground(2)).not.toBe(stageBackground(1));
    expect(stageBackground(STAGE_BACKGROUNDS.length + 1)).toBe(STAGE_BACKGROUNDS[0]);
  });
});
