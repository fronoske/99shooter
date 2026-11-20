import { describe, expect, it } from "vitest";
import { ensureCorrectBall, fillStock, hasCorrectBall, type BallStock } from "../src/game/balls";
import { makeProblem } from "../src/game/problems";

/** 再現可能な乱数（mulberry32） */
function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("fillStock", () => {
  it("常に正解玉を 1 つ以上含み、数字が重複しない", () => {
    for (let seed = 0; seed < 500; seed++) {
      const rng = seeded(seed);
      const problems = [makeProblem(1 + (seed % 9), 1 + ((seed * 7) % 9)), makeProblem(8, 9)];
      const stock: BallStock = [null, null, null, null, null];
      fillStock(rng, stock, problems, { correctProbability: 0.1 });
      expect(stock.every((v) => v !== null)).toBe(true);
      expect(new Set(stock).size).toBe(stock.length);
      expect(hasCorrectBall(stock, problems)).toBe(true);
    }
  });

  it("正解確率 0 でもハズレだけにはならない", () => {
    const stock: BallStock = [null, null, null, null, null];
    const problems = [makeProblem(3, 4)];
    fillStock(seeded(1), stock, problems, { correctProbability: 0 });
    expect(stock.filter((v) => v === 12)).toHaveLength(1);
  });

  it("ハズレ玉は画面上の敵の答えに一致しない九九の答え", () => {
    const stock: BallStock = [null, null, null, null, null];
    const problems = [makeProblem(3, 4)];
    fillStock(seeded(2), stock, problems, { correctProbability: 0 });
    for (const v of stock) {
      if (v === 12) continue;
      let isProduct = false;
      for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) if (a * b === v) isProduct = true;
      expect(isProduct).toBe(true);
    }
  });

  it("正解玉が足りないときは補充したスロットを正解にし、もとからある玉は変えない", () => {
    for (let seed = 0; seed < 200; seed++) {
      const stock: BallStock = [1, 2, null, 5, 7];
      fillStock(seeded(seed), stock, [makeProblem(6, 7)], { correctProbability: 0 });
      expect(stock).toEqual([1, 2, 42, 5, 7]);
    }
  });

  it("指定した答えがなければ、補充したスロットをその答えにする", () => {
    for (let seed = 0; seed < 200; seed++) {
      // 42（6×7 の答え）は正解としてすでにあるが、1（1×1 の答え）がない
      const stock: BallStock = [42, 2, null, 5, 7];
      fillStock(seeded(seed), stock, [makeProblem(6, 7), makeProblem(1, 1)], { correctProbability: 0.4 }, 1);
      expect(stock).toEqual([42, 2, 1, 5, 7]);
    }
  });

  it("指定した答えがすでにあれば、そのスロットは自由に選ばれる", () => {
    const stock: BallStock = [1, 2, null, 5, 7];
    fillStock(seeded(9), stock, [makeProblem(1, 1)], { correctProbability: 0 }, 1);
    expect(stock[2]).not.toBe(1);
    expect(new Set(stock).size).toBe(5);
  });

  it("敵がいなければ全部ハズレでもよい", () => {
    const stock: BallStock = [null, null, null];
    fillStock(seeded(3), stock, [], { correctProbability: 1 });
    expect(stock.every((v) => v !== null)).toBe(true);
  });
});

describe("ensureCorrectBall", () => {
  it("正解がなければ 1 つ差し替える", () => {
    const stock: BallStock = [1, 2, null, 5, 7];
    const slot = ensureCorrectBall(seeded(4), stock, [makeProblem(6, 7)]);
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(slot).not.toBe(2);
    expect(stock[slot]).toBe(42);
  });

  it("すでに正解があれば何もしない", () => {
    const stock: BallStock = [1, 42, 3];
    expect(ensureCorrectBall(seeded(5), stock, [makeProblem(6, 7)])).toBe(-1);
    expect(stock).toEqual([1, 42, 3]);
  });
});
