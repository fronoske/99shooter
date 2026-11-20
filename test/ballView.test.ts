import { describe, expect, it } from "vitest";
import { VIEW } from "../src/config";
import { ballSlotPos } from "../src/game/layout";
import { BallView } from "../src/render/ballView";

function settle(v: BallView, stock: (number | null)[], seconds = 3) {
  for (let t = 0; t < seconds; t += 1 / 60) v.update(1 / 60, stock);
}

describe("BallView", () => {
  it("新しい玉は右の画面外から転がってきて、止まるとまっすぐになる", () => {
    const v = new BallView();
    const stock = [1, 2, 3, 4, 5];
    v.update(0, stock);
    for (const s of v.sprites(stock)) expect(s.x).toBeGreaterThan(VIEW.width);
    settle(v, stock);
    v.sprites(stock).forEach((s, i) => {
      expect(s.x).toBe(ballSlotPos(i).x);
      expect(s.angle).toBe(0);
    });
  });

  it("投げて詰めると残りの玉は左へ転がり、補充の玉は右から来る", () => {
    const v = new BallView();
    let stock: (number | null)[] = [1, 2, 3, 4, 5];
    settle(v, stock);
    // 2 番目（数字 2）を投げた → 左に詰めて右端が空く
    stock = [1, 3, 4, 5, null];
    v.update(1 / 60, stock);
    const moving = v.sprites(stock).find((s) => s.value === 3)!;
    expect(moving.x).toBeGreaterThan(ballSlotPos(1).x);
    expect(moving.x).toBeLessThan(ballSlotPos(2).x);
    // 押した位置は見えている位置で判定する
    expect(v.hitTest(moving.x, moving.y, stock)).toBe(1);
    settle(v, stock);
    stock = [1, 3, 4, 5, 9];
    v.update(1 / 60, stock);
    expect(v.sprites(stock)[4].x).toBeGreaterThan(VIEW.width);
    settle(v, stock);
    expect(v.sprites(stock)[4].x).toBe(ballSlotPos(4).x);
  });

  it("揺らすと少しの間だけ傾き、すぐ戻る", () => {
    const v = new BallView();
    const stock = [1, 2, 3, 4, 5];
    settle(v, stock);
    v.wiggle(3);
    v.update(0.05, stock);
    expect(v.sprites(stock)[2].angle).not.toBe(0);
    settle(v, stock, 1);
    expect(v.sprites(stock)[2].angle).toBe(0);
  });
});
