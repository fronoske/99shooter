/** 0 以上 1 未満の乱数を返す関数（テスト時に差し替え可能にするため注入する） */
export type Rng = () => number;

export const defaultRng: Rng = Math.random;

/** min 以上 max 以下の整数 */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[randInt(rng, 0, items.length - 1)];
}
