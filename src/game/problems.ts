import type { Rng } from "./rng";
import { randInt } from "./rng";

/** 九九の問題 */
export interface Problem {
  a: number;
  b: number;
  answer: number;
}

export function problemKey(p: Pick<Problem, "a" | "b">): string {
  return `${p.a}x${p.b}`;
}

export function makeProblem(a: number, b: number): Problem {
  return { a, b, answer: a * b };
}

/** 九九（1〜9 × 1〜9）の答えになり得る数（重複なし・昇順） */
export const ALL_PRODUCTS: readonly number[] = (() => {
  const set = new Set<number>();
  for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) set.add(a * b);
  return [...set].sort((x, y) => x - y);
})();

/**
 * 指定された段から問題を 1 つ作る。
 * `excludeKeys` に含まれる問題（画面上にすでにある問題）は避ける。
 * 候補がない場合は null。
 */
export function generateProblem(
  rng: Rng,
  dans: readonly number[],
  excludeKeys: ReadonlySet<string>,
): Problem | null {
  const candidates: Problem[] = [];
  for (const a of dans) {
    for (let b = 1; b <= 9; b++) {
      if (!excludeKeys.has(problemKey({ a, b }))) candidates.push(makeProblem(a, b));
    }
  }
  if (candidates.length === 0) return null;
  return candidates[randInt(rng, 0, candidates.length - 1)];
}

/**
 * 問題に対する「惜しい」答え（同じ段の前後、隣の段の同じ数）。
 * いずれも九九の答えになり得る数。
 */
export function nearMissAnswers(p: Problem): number[] {
  const out = new Set<number>();
  const add = (a: number, b: number) => {
    if (a >= 1 && a <= 9 && b >= 1 && b <= 9) out.add(a * b);
  };
  add(p.a, p.b - 1);
  add(p.a, p.b + 1);
  add(p.a - 1, p.b);
  add(p.a + 1, p.b);
  out.delete(p.answer);
  return [...out];
}

