import { describe, expect, it } from "vitest";
import { LAYOUT } from "../src/config";
import type { Enemy } from "../src/game/game";
import { makeProblem } from "../src/game/problems";
import { dangerLevel, enemyMotion, girlMotion, maxDanger, MOTION } from "../src/render/motion";

function enemyAtBottom(bottom: number, id = 1): Enemy {
  return { id, problem: makeProblem(2, 3), lane: 0, x: 45, y: bottom - LAYOUT.enemyHeight };
}

describe("motion", () => {
  it("防衛ラインに近いほど危ない（遠いと 0、着くと 1）", () => {
    expect(dangerLevel(enemyAtBottom(LAYOUT.defenseLineY - MOTION.dangerZone - 1))).toBe(0);
    expect(dangerLevel(enemyAtBottom(LAYOUT.defenseLineY - MOTION.dangerZone / 2))).toBeCloseTo(0.5);
    expect(dangerLevel(enemyAtBottom(LAYOUT.defenseLineY))).toBe(1);
    expect(maxDanger([enemyAtBottom(100), enemyAtBottom(LAYOUT.defenseLineY, 2)])).toBe(1);
    expect(maxDanger([])).toBe(0);
  });

  it("上のバーの下から出てくる間は小さめで、全身が出ると通常の大きさ", () => {
    const entering = enemyAtBottom(LAYOUT.hudHeight + 1);
    const shown = enemyAtBottom(LAYOUT.hudHeight + LAYOUT.enemyHeight + 10);
    expect(enemyMotion(entering, 0).scale).toBeLessThan(0.85);
    expect(enemyMotion(shown, 0).scale).toBe(1);
  });

  it("見た目のずれは小さく、敵の本当の位置は変えない", () => {
    const e = enemyAtBottom(LAYOUT.defenseLineY - 5);
    const before = { ...e };
    for (let t = 0; t < 5; t += 0.05) {
      const m = enemyMotion(e, t);
      expect(Math.abs(m.dx)).toBeLessThanOrEqual(MOTION.swayPx + MOTION.tremblePx);
      expect(Math.abs(m.dy)).toBeLessThanOrEqual(MOTION.bobPx);
    }
    expect(e).toEqual(before);
  });

  it("自分は一定の間隔で短くまばたきする", () => {
    let closed = 0;
    const step = 0.01;
    const total = MOTION.blinkInterval * 3;
    for (let t = 0; t < total; t += step) if (girlMotion(t).blink) closed += step;
    expect(closed).toBeCloseTo(MOTION.blinkTime * 3, 1);
  });
});
