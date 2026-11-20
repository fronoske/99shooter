/**
 * キャラクターの動き（段階 4）。時刻から見た目のずれを計算するだけの関数。
 * - P9: 敵は上のバーの下からふくらみながら現れ、左右にゆらゆら揺れながら降りる
 * - P5: 防衛ラインに近づいた敵はぷるぷる震え、ラインが濃くなる
 * - P10: 自分はゆらゆら揺れ、ときどきまばたきする
 *
 * どれも見た目だけで、当たり判定の位置は動かさない（基本ルール 1）。
 */
import { LAYOUT } from "../config";
import type { Enemy } from "../game/game";

export const MOTION = {
  /** 敵の左右のゆらゆら（px）と速さ（ラジアン/秒） */
  swayPx: 4,
  swaySpeed: 1.6,
  /** 敵の上下のふわふわ（px） */
  bobPx: 1.5,
  /** 上のバーの下から出てくるときの、最初の大きさ（1 で通常） */
  emergeScale: 0.8,
  /** 「危ない」と見なし始める、防衛ラインまでの距離（px） */
  dangerZone: 110,
  /** 危ないときの震えの幅（px）と速さ（ラジアン/秒） */
  tremblePx: 1.6,
  trembleSpeed: 38,
  /** 防衛ラインが濃くなるときの、ゆっくりした脈打ち（ラジアン/秒）。強い点滅にしない（基本ルール 4） */
  linePulseSpeed: 5,
  /** 自分のゆらゆら（ラジアン）と速さ（ラジアン/秒） */
  girlSway: 0.045,
  girlSwaySpeed: 2.4,
  /** まばたきの間隔（秒）と、目を閉じている時間（秒） */
  blinkInterval: 3.2,
  blinkTime: 0.13,
} as const;

/** 防衛ラインへの近さ。0 = 安全、1 = ラインに着いた */
export function dangerLevel(e: Enemy): number {
  const bottom = e.y + LAYOUT.enemyHeight;
  const d = LAYOUT.defenseLineY - bottom;
  return Math.min(1, Math.max(0, 1 - d / MOTION.dangerZone));
}

/** 画面の敵の中で、いちばん危ない敵の近さ */
export function maxDanger(enemies: readonly Enemy[]): number {
  return enemies.reduce((m, e) => Math.max(m, dangerLevel(e)), 0);
}

export interface EnemyMotion {
  dx: number;
  dy: number;
  scale: number;
}

/** 敵の見た目のずれ（ゆらゆら・ふくらみ・震え） */
export function enemyMotion(e: Enemy, time: number): EnemyMotion {
  // 敵ごとに揺れのタイミングをずらす
  const phase = e.id * 1.7;
  let dx = Math.sin(time * MOTION.swaySpeed + phase) * MOTION.swayPx;
  const dy = Math.sin(time * MOTION.swaySpeed * 1.3 + phase) * MOTION.bobPx;

  // 上のバーの下から出てくる間（下端がバーの下に出てから、全身が出るまで）は小さめからふくらむ
  const shown = (e.y + LAYOUT.enemyHeight - LAYOUT.hudHeight) / LAYOUT.enemyHeight;
  const k = Math.min(1, Math.max(0, shown));
  const scale = MOTION.emergeScale + (1 - MOTION.emergeScale) * (1 - (1 - k) ** 2);

  const danger = dangerLevel(e);
  if (danger > 0) dx += Math.sin(time * MOTION.trembleSpeed + phase) * MOTION.tremblePx * danger;

  return { dx, dy, scale };
}

export interface GirlMotion {
  /** 体の傾き（ラジアン） */
  sway: number;
  /** 目を閉じている */
  blink: boolean;
  /** 耳のゆれ（ラジアン） */
  ear: number;
}

export function girlMotion(time: number): GirlMotion {
  const s = Math.sin(time * MOTION.girlSwaySpeed);
  const inCycle = time % MOTION.blinkInterval;
  return {
    sway: s * MOTION.girlSway,
    blink: inCycle < MOTION.blinkTime,
    // 耳は体より少し遅れて、大きめに揺れる
    ear: Math.sin(time * MOTION.girlSwaySpeed - 0.6) * MOTION.girlSway * 2.5,
  };
}
