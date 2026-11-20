/**
 * 玉ストックの見た目の動き（演出 U1・P8）。
 * - 投げて空いたところは、残りの玉が左へ転がって詰める
 * - 新しい玉は右の画面外から転がってくる
 * - 投げられないときに押すと、その玉がぷるぷる揺れる
 *
 * ゲームのストック（並び順）は Game が決め、ここは見た目の位置だけを持つ。
 * 玉の数字はストック内で重複しないので、数字を玉の目印にする。
 */
import { LAYOUT, VIEW } from "../config";
import type { BallStock } from "../game/balls";
import { ballSlotPos } from "../game/layout";

/** 転がる速さ（px/秒） */
const ROLL_SPEED = 420;
/** 押して揺れる時間（秒） */
const WIGGLE_TIME = 0.35;

interface View {
  x: number;
  wiggle: number;
}

export interface BallSprite {
  /** ストック内の番号 */
  index: number;
  value: number;
  x: number;
  y: number;
  /** 回転（ラジアン）。転がっている間だけ回り、止まるとまっすぐに戻る */
  angle: number;
}

export class BallView {
  private views = new Map<number, View>();

  /** ステージ開始時に呼ぶ。次の update で全部の玉が右から転がってくる */
  reset(): void {
    this.views.clear();
  }

  update(dt: number, stock: BallStock): void {
    const present = new Set<number>();
    let newcomers = 0;
    stock.forEach((v, i) => {
      if (v === null) return;
      present.add(v);
      const target = ballSlotPos(i, stock.length).x;
      let view = this.views.get(v);
      if (!view) {
        // 右の画面外から。何個も同時に来るときは一列に並んで来る
        view = { x: VIEW.width + LAYOUT.ballRadius + 12 + newcomers * 72, wiggle: 0 };
        newcomers++;
        this.views.set(v, view);
      }
      const d = target - view.x;
      const step = ROLL_SPEED * dt;
      view.x = Math.abs(d) <= step ? target : view.x + Math.sign(d) * step;
      view.wiggle = Math.max(0, view.wiggle - dt);
    });
    for (const v of [...this.views.keys()]) if (!present.has(v)) this.views.delete(v);
  }

  sprites(stock: BallStock): BallSprite[] {
    const out: BallSprite[] = [];
    stock.forEach((v, i) => {
      if (v === null) return;
      const slot = ballSlotPos(i, stock.length);
      const view = this.views.get(v);
      const x = view?.x ?? slot.x;
      // 止まる位置との距離ぶん回す → 止まったときにちょうどまっすぐになる
      let angle = (x - slot.x) / LAYOUT.ballRadius;
      if (view && view.wiggle > 0) {
        const k = view.wiggle / WIGGLE_TIME;
        angle += Math.sin(view.wiggle * 45) * 0.3 * k;
      }
      out.push({ index: i, value: v, x, y: slot.y, angle });
    });
    return out;
  }

  /** 見えている位置で、押された玉のストック番号を返す（なければ -1） */
  hitTest(x: number, y: number, stock: BallStock): number {
    const r = LAYOUT.ballRadius * 1.3;
    let best = -1;
    let bestDist = r * r;
    for (const s of this.sprites(stock)) {
      const d = (x - s.x) ** 2 + (y - s.y) ** 2;
      if (d <= bestDist) {
        best = s.index;
        bestDist = d;
      }
    }
    return best;
  }

  /** 投げられないときに押された玉を揺らす */
  wiggle(value: number): void {
    const view = this.views.get(value);
    if (view) view.wiggle = WIGGLE_TIME;
  }
}
