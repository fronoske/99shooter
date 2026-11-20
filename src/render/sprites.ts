/**
 * キャラクターの絵（Canvas の図形の組み合わせ）。
 * デザインは docs/presentation.md の「キャラクター」を参照。
 * どの関数も中心座標を基準に描き、ctx の状態は元に戻す。
 */
import { CANDY_COLORS, CLOUD_COLORS, FONT, GIRL_COLORS, THEME } from "./theme";

type Ctx = CanvasRenderingContext2D;

/** ふち付き文字（絵の上でも読みやすい） */
export function outlinedText(
  ctx: Ctx,
  s: string,
  x: number,
  y: number,
  size: number,
  color: string,
  outline: string = THEME.textOutline,
  outlineWidth = 4,
): void {
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = outlineWidth;
  ctx.strokeStyle = outline;
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

function circle(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 自分のポーズ（演出 U3）
 * - idle: ふつうに立っている
 * - raise: 玉を両手で頭の上に持ち上げている
 * - throw: えいっと投げたところ（手を高く伸ばす）
 */
export type GirlPose = "idle" | "raise" | "throw";

/** ポーズごとの手の位置（体の中心からの相対座標） */
const HANDS: Record<GirlPose, [number, number]> = {
  idle: [13, 11],
  // 頭の上の玉を両側から持つ（顔に隠れないよう、頭の横の外側）
  raise: [16, -32],
  throw: [17, -44],
};

/**
 * 自分: うさぎ耳フードの女の子。
 * (x, y) は体の中心。scale 1 で高さ約 70px（耳の先〜足）。
 */
/** 待機中の動き（演出 P10）。src/render/motion.ts の girlMotion で作る */
export interface GirlIdle {
  /** 体の傾き（ラジアン）。足元を軸に傾く */
  sway: number;
  /** 目を閉じている（まばたき） */
  blink: boolean;
  /** 耳のゆれ（ラジアン） */
  ear: number;
}

export function drawGirl(
  ctx: Ctx,
  x: number,
  y: number,
  scale = 1,
  pose: GirlPose = "idle",
  idle: GirlIdle = { sway: 0, blink: false, ear: 0 },
): void {
  const c = GIRL_COLORS;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  if (idle.sway !== 0) {
    ctx.translate(0, 25);
    ctx.rotate(idle.sway);
    ctx.translate(0, -25);
  }
  // 投げた瞬間は少し伸び上がる
  if (pose === "throw") {
    ctx.translate(0, 25);
    ctx.scale(1, 1.06);
    ctx.translate(0, -25);
  }
  const [hx, hy] = HANDS[pose];

  // 腕（そで）と手。顔より手前に描く
  const drawArms = () => {
    ctx.strokeStyle = c.dressShade;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(dir * 7, 7);
      // 手を上げるときは、肩から外側へふくらませて頭をよける
      const bulge = hy < 0 ? 22 : hx + 2;
      ctx.quadraticCurveTo(dir * bulge, (7 + hy) / 2, dir * hx, hy);
      ctx.stroke();
    }
    ctx.fillStyle = c.skin;
    circle(ctx, -hx, hy, 3.6);
    circle(ctx, hx, hy, 3.6);
  };

  // 足
  ctx.fillStyle = c.shoe;
  ellipse(ctx, -6, 25, 5, 3.5);
  ellipse(ctx, 6, 25, 5, 3.5);

  // ワンピース（すそが広がった形）
  ctx.fillStyle = c.dress;
  ctx.beginPath();
  ctx.moveTo(-8, 4);
  ctx.quadraticCurveTo(-17, 18, -16, 23);
  ctx.quadraticCurveTo(0, 27, 16, 23);
  ctx.quadraticCurveTo(17, 18, 8, 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = c.dressShade;
  ctx.beginPath();
  ctx.moveTo(-16, 23);
  ctx.quadraticCurveTo(0, 27, 16, 23);
  ctx.quadraticCurveTo(0, 30, -16, 23);
  ctx.fill();

  // うさぎ耳
  // 耳は付け根（頭の上）を軸にゆれる
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.translate(dir * 7, -20);
    ctx.rotate(dir * 0.18 + idle.ear * (dir === -1 ? 1 : 0.7));
    ctx.fillStyle = c.hood;
    ellipse(ctx, 0, -10, 5.5, 12);
    ctx.fillStyle = c.earInner;
    ellipse(ctx, 0, -9, 2.8, 8.5);
    ctx.restore();
  }

  // フード
  ctx.fillStyle = c.hood;
  circle(ctx, 0, -10, 15);
  // 顔
  ctx.fillStyle = c.skin;
  ellipse(ctx, 0, -8, 11.5, 10.5);

  // にっこり目（◠ ◠）
  ctx.strokeStyle = c.face;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  for (const ex of [-4.5, 4.5]) {
    ctx.beginPath();
    if (idle.blink) {
      // まばたき: 目を細い線に
      ctx.moveTo(ex - 2.4, -7.2);
      ctx.lineTo(ex + 2.4, -7.2);
    } else {
      ctx.arc(ex, -8, 2.6, Math.PI * 1.1, Math.PI * 1.9);
    }
    ctx.stroke();
  }
  // 口（ω）
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(-1.4, -3.5, 1.4, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.arc(1.4, -3.5, 1.4, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();
  // ほっぺ
  ctx.fillStyle = c.cheek;
  ellipse(ctx, -7.5, -4, 2.6, 1.8);
  ellipse(ctx, 7.5, -4, 2.6, 1.8);

  // 胸元のリボン
  ctx.fillStyle = c.ribbon;
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.lineTo(-6, 2.5);
  ctx.lineTo(-6, 9.5);
  ctx.closePath();
  ctx.moveTo(0, 6);
  ctx.lineTo(6, 2.5);
  ctx.lineTo(6, 9.5);
  ctx.closePath();
  ctx.fill();
  circle(ctx, 0, 6, 1.8);

  drawArms();

  ctx.restore();
}

/**
 * 敵: もこもこ雲のいたずらっ子。
 * (x, top) は当たり判定の矩形の中心 X と上端。w×h は当たり判定の大きさ。
 * もこもこは矩形の上に少しはみ出す（判定は変えない）。
 */
export function drawCloud(
  ctx: Ctx,
  x: number,
  top: number,
  w: number,
  h: number,
  colorIndex: number,
  label: string,
): void {
  const col = CLOUD_COLORS[colorIndex % CLOUD_COLORS.length];
  const left = x - w / 2;
  const bottom = top + h;

  const puffs = (dy: number) => {
    ctx.beginPath();
    // 下の平らな部分
    ctx.roundRect(left, top + 10 + dy, w, h - 10, 14);
    // 上のもこもこ
    ctx.moveTo(left + 31, top + 12 + dy);
    ctx.arc(left + 18, top + 12 + dy, 13, 0, Math.PI * 2);
    ctx.moveTo(x + 15, top + 4 + dy);
    ctx.arc(x, top + 4 + dy, 15, 0, Math.PI * 2);
    ctx.moveTo(left + w - 5, top + 12 + dy);
    ctx.arc(left + w - 18, top + 12 + dy, 13, 0, Math.PI * 2);
    ctx.fill();
  };

  // 白いふち（どの背景の上でも雲の形が分かるように）→ 下側の影 → 本体
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  const cy = top + h / 2;
  ctx.translate(x, cy + 1.5);
  ctx.scale(1 + 5 / w, 1 + 6 / h);
  ctx.translate(-x, -cy);
  puffs(0);
  ctx.restore();
  ctx.fillStyle = col.shade;
  puffs(3);
  ctx.fillStyle = col.body;
  puffs(0);

  // いたずら顔（上のもこもこに小さく）
  ctx.strokeStyle = THEME.text;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.lineWidth = 1.9;
  for (const ex of [-7, 7]) {
    ctx.beginPath();
    ctx.arc(x + ex, top + 1, 3, Math.PI * 0.15, Math.PI * 0.85); // ˘
    ctx.stroke();
  }
  ctx.fillStyle = THEME.text;
  ctx.beginPath();
  ctx.moveTo(x - 2.5, top + 6);
  ctx.lineTo(x + 2.5, top + 6);
  ctx.lineTo(x, top + 9);
  ctx.closePath();
  ctx.fill(); // ▽
  ctx.fillStyle = "rgba(255, 128, 170, 0.4)";
  ellipse(ctx, x - 11, top + 6, 2.6, 1.6);
  ellipse(ctx, x + 11, top + 6, 2.6, 1.6);

  // 問題（おなかに大きく）
  outlinedText(ctx, label, x, bottom - 15, 19, THEME.text, "rgba(255,255,255,0.85)", 4);
}

/**
 * 玉: 両端に包み紙のついたキャンディ。
 * (x, y) は中心、r は半径。中央は無地にして数字を読みやすくする。
 */
export function drawCandy(
  ctx: Ctx,
  x: number,
  y: number,
  r: number,
  colorIndex: number,
  value: number,
  dimmed = false,
  angle = 0,
  scale = 1,
): void {
  const col = CANDY_COLORS[colorIndex % CANDY_COLORS.length];
  ctx.save();
  if (dimmed) ctx.globalAlpha = 0.45;
  // 回転・拡大縮小は中心を原点にしてかける
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  x = 0;
  y = 0;

  // 包み紙（左右）
  ctx.fillStyle = col.shade;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + dir * (r - 4), y);
    ctx.lineTo(x + dir * (r + 6), y - 7);
    ctx.quadraticCurveTo(x + dir * (r + 4), y, x + dir * (r + 6), y + 7);
    ctx.closePath();
    ctx.fill();
  }

  // 本体
  ctx.fillStyle = col.body;
  circle(ctx, x, y, r);
  // ふちのしま模様（中央にはかからない）
  ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x, y, r - 3, a, a + 0.32);
    ctx.stroke();
  }
  // 中央の無地
  ctx.fillStyle = "#fffaf4";
  circle(ctx, x, y, r - 7);
  // つや
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ellipse(ctx, x - r * 0.5, y - r * 0.55, r * 0.2, r * 0.12, -0.6);

  // 数字
  ctx.font = `bold ${value >= 10 ? 21 : 23}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = THEME.text;
  ctx.fillText(String(value), x, y + 1);

  ctx.restore();
}

/** 5 枚の花びらのお花（演出 P4） */
export function drawFlower(ctx: Ctx, x: number, y: number, size: number, color: string, angle: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ellipse(ctx, Math.cos(a) * size * 0.55, Math.sin(a) * size * 0.55, size * 0.5, size * 0.38, a);
  }
  ctx.fillStyle = "#fff3b0";
  circle(ctx, 0, 0, size * 0.32);
  ctx.restore();
}

/** きらきらの星（4 つの角） */
export function drawSparkle(ctx: Ctx, x: number, y: number, size: number, color: string, angle: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? size : size * 0.3;
    const a = (i / 8) * Math.PI * 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 5 つの角の星（ステージクリアの評価: P11） */
export function drawStar(ctx: Ctx, x: number, y: number, r: number, fill: string, stroke: string): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}
