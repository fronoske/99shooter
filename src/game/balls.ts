import type { Problem } from "./problems";
import { ALL_PRODUCTS, nearMissAnswers } from "./problems";
import type { Rng } from "./rng";
import { pick, randInt } from "./rng";

/** 玉のストック。null は空きスロット（投げた玉が飛行中） */
export type BallStock = (number | null)[];

export interface BallPickOptions {
  /** 正解玉を選ぶ確率 */
  correctProbability: number;
  /** ハズレ玉を選ぶとき「惜しい答え」を優先する確率 */
  nearMissProbability?: number;
}

function answersOf(problems: readonly Problem[]): Set<number> {
  return new Set(problems.map((p) => p.answer));
}

function stockValues(stock: BallStock): Set<number> {
  const s = new Set<number>();
  for (const v of stock) if (v !== null) s.add(v);
  return s;
}

/** ストックに画面上の敵の答えと一致する玉があるか */
export function hasCorrectBall(stock: BallStock, problems: readonly Problem[]): boolean {
  const answers = answersOf(problems);
  return stock.some((v) => v !== null && answers.has(v));
}

/** ストックにまだない正解の数（候補がなければ null） */
function pickCorrect(rng: Rng, problems: readonly Problem[], used: Set<number>): number | null {
  const candidates = [...answersOf(problems)].filter((v) => !used.has(v));
  return candidates.length > 0 ? pick(rng, candidates) : null;
}

/** ストックにまだないハズレの数 */
function pickWrong(
  rng: Rng,
  problems: readonly Problem[],
  used: Set<number>,
  nearMissProbability: number,
): number {
  const answers = answersOf(problems);
  const ok = (v: number) => !answers.has(v) && !used.has(v);

  if (rng() < nearMissProbability) {
    const near = new Set<number>();
    for (const p of problems) for (const v of nearMissAnswers(p)) if (ok(v)) near.add(v);
    if (near.size > 0) return pick(rng, [...near]);
  }
  const all = ALL_PRODUCTS.filter(ok);
  if (all.length > 0) return pick(rng, all);
  // 九九の答えの種類（36 種）を使い切ることは通常ないが、念のため九九外の数で埋める
  let v = 82;
  while (used.has(v) || answers.has(v)) v++;
  return v;
}

/**
 * 空きスロットに入れる玉の数字を 1 つ決める。
 * ストック内での重複は避ける。
 */
export function pickBallValue(
  rng: Rng,
  stock: BallStock,
  problems: readonly Problem[],
  opts: BallPickOptions,
): number {
  const used = stockValues(stock);
  if (rng() < opts.correctProbability) {
    const c = pickCorrect(rng, problems, used);
    if (c !== null) return c;
  }
  return pickWrong(rng, problems, used, opts.nearMissProbability ?? 0.7);
}

/**
 * ストックに正解玉が 1 つもなければ、玉を 1 つ正解に差し替える。
 * `preferredSlots` が指定されていれば、その中から差し替えるスロットを選ぶ
 * （補充したばかりの玉を優先し、もとからある玉の数字を変えないため）。
 * 画面上に敵がいない、または空きスロットしかない場合は何もしない。
 * 破壊的に stock を更新し、差し替えたスロット番号（なければ -1）を返す。
 */
export function ensureCorrectBall(
  rng: Rng,
  stock: BallStock,
  problems: readonly Problem[],
  preferredSlots: readonly number[] = [],
): number {
  if (problems.length === 0 || hasCorrectBall(stock, problems)) return -1;
  const preferred = preferredSlots.filter((i) => stock[i] !== null && stock[i] !== undefined);
  const candidates =
    preferred.length > 0 ? preferred : stock.flatMap((v, i) => (v !== null ? [i] : []));
  if (candidates.length === 0) return -1;
  const slot = candidates[randInt(rng, 0, candidates.length - 1)];
  const used = stockValues(stock);
  used.delete(stock[slot]!);
  const c = pickCorrect(rng, problems, used);
  if (c === null) return -1;
  stock[slot] = c;
  return slot;
}

/**
 * 空きスロットをすべて埋めた上で、正解玉の存在を保証する。
 * - `requiredAnswer` が指定され、ストックにその数字がなければ、今回埋めたスロットの 1 つをその数字にする
 *   （一番下の敵の答えを必ず持たせるため）
 * - それでも正解玉が足りないときは、今回埋めたスロットを正解にする
 * いずれの場合も、もとからある玉の数字は変えない。
 */
export function fillStock(
  rng: Rng,
  stock: BallStock,
  problems: readonly Problem[],
  opts: BallPickOptions,
  requiredAnswer: number | null = null,
): void {
  const filled: number[] = [];
  for (let i = 0; i < stock.length; i++) {
    if (stock[i] === null) {
      stock[i] = pickBallValue(rng, stock, problems, opts);
      filled.push(i);
    }
  }
  if (requiredAnswer !== null && filled.length > 0 && !stock.includes(requiredAnswer)) {
    stock[filled[randInt(rng, 0, filled.length - 1)]] = requiredAnswer;
  }
  ensureCorrectBall(rng, stock, problems, filled);
}
