import { BALL, LAYOUT, VIEW } from "../config";

/** i 番目の玉スロットの中心座標 */
export function ballSlotPos(i: number, count: number = BALL.stockSize): { x: number; y: number } {
  const w = VIEW.width / count;
  return { x: w * (i + 0.5), y: LAYOUT.ballSlotY };
}

/** 論理座標 (x, y) がどの玉スロットに当たるか（なければ -1） */
export function hitBallSlot(x: number, y: number, count: number = BALL.stockSize): number {
  const r = LAYOUT.ballRadius * 1.3;
  for (let i = 0; i < count; i++) {
    const p = ballSlotPos(i, count);
    if ((x - p.x) ** 2 + (y - p.y) ** 2 <= r * r) return i;
  }
  return -1;
}

/** レーンの中心 X */
export function laneCenterX(lane: number): number {
  const w = VIEW.width / LAYOUT.laneCount;
  return w * (lane + 0.5);
}

export const PLAYER_POS = { x: VIEW.width / 2, y: LAYOUT.playerY } as const;

/** 玉を投げる位置（自分が頭の上に持ち上げた手の位置） */
export const LAUNCH_POS = { x: PLAYER_POS.x, y: PLAYER_POS.y - 34 } as const;
