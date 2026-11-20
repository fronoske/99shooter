/**
 * 命中・ハズレ・得点の演出（段階 3）。
 * - U4・P4: 倒した雲がふくらんで晴れ、お花ときらきらが弾ける
 * - P1: 命中した場所に式（7 × 8 = 56）を大きく出す
 * - P2: 式の下にほめことば
 * - P3: ハズレなしで 3 回以上続けて当てると「3 れんぞく！」。お花も増える（得点は変えない）
 * - P6: ハズレの玉が雲を通り抜けるとき、雲と玉が「ぽよん」と揺れる
 * - U5: 得点の数字が上のバーへ飛んでいき、着いたら得点が数え上がる
 * - P11: ステージクリアで花びらが降り、ハズレの少なさで星（★1〜3）がつく
 *
 * ゲームの判定・得点には関わらない（Game のイベントと状態を見て描くだけ）。
 * 問題の文字を隠さないよう、式・ほめことば・お花は敵より下の層に描く。
 */
import { LAYOUT, VIEW } from "../config";
import type { Enemy, FlyingBall, Game } from "../game/game";
import type { Rng } from "../game/rng";
import { drawCloud, drawFlower, drawSparkle, outlinedText } from "./sprites";
import { FONT, THEME } from "./theme";

/** 演出の時間などの調整値 */
export const EFFECT = {
  /** 雲が晴れて消えるまで（秒） */
  cloudFade: 0.3,
  /** 弾けるお花の数（基本）と、れんぞく 1 回ごとの追加数・上限 */
  flowers: 7,
  flowersPerStreak: 2,
  flowersMax: 17,
  /** お花が消えるまで（秒） */
  particleLife: 0.9,
  /** 式とほめことばを出している時間（秒） */
  equationLife: 1.2,
  /** 「れんぞく」を出し始める回数 */
  streakMin: 3,
  streakLife: 1.0,
  /** 得点が上のバーへ飛ぶ時間（秒） */
  scoreFlyTime: 0.6,
  /** ハズレで「ぽよん」と揺れる時間（秒） */
  wobbleTime: 0.4,
  /** これより高い位置で倒すと、特別なほめことば（防衛ライン 0 〜 画面上端 1） */
  highRatio: 0.6,
  /** ステージクリアの星: ハズレがこの回数以下なら ★3 / ★2。それより多いと ★1 */
  stars3MaxMisses: 0,
  stars2MaxMisses: 3,
  /** ステージクリア画面で降らせる花びらの数（1 秒あたり） */
  petalsPerSecond: 22,
} as const;

/** そのステージのハズレの回数から、星の数（1〜3） */
export function starsForMisses(misses: number): 1 | 2 | 3 {
  if (misses <= EFFECT.stars3MaxMisses) return 3;
  if (misses <= EFFECT.stars2MaxMisses) return 2;
  return 1;
}

/** 星の数に合わせたことば */
export const STAR_MESSAGES: Record<1 | 2 | 3, string> = {
  3: "パーフェクト！",
  2: "よくできました！",
  1: "クリア！",
};

const PRAISE = ["すごい！", "やったね！", "いいね！", "じょうず！", "せいかい！"];
const PRAISE_HIGH = ["かんぺき！", "てんさい！", "すごすぎる！"];
const FLOWER_COLORS = ["#ff8fb8", "#ffb3cf", "#ffffff", "#ffd166", "#d9c8ff"];

/** 上のバーの得点の位置（飛んでいく先） */
export const SCORE_POS = { x: VIEW.width - 50, y: 20 } as const;

interface Particle {
  kind: "flower" | "sparkle";
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  color: string;
  age: number;
}

interface Ghost {
  enemy: Enemy;
  age: number;
}

interface Popup {
  text: string;
  sub: string;
  subColor: string;
  x: number;
  y: number;
  age: number;
  life: number;
  size: number;
  /**
   * 文字の幅の上限（px）。式とほめことばは倒した敵のレーンの幅に収め、
   * 隣のレーンの敵と重ならないようにする（重なると、どちらかの文字が読めなくなる）
   */
  maxWidth: number;
}

interface ScoreFly {
  points: number;
  x: number;
  y: number;
  age: number;
}

/** 幅 maxWidth に収まる文字の大きさ（size を上限に縮める） */
function fitSize(ctx: CanvasRenderingContext2D, text: string, size: number, maxWidth: number): number {
  ctx.font = `bold ${size}px ${FONT}`;
  const w = ctx.measureText(text).width;
  return w <= maxWidth ? size : Math.floor((size * maxWidth) / w);
}

export class Effects {
  /** ハズレなしで続けて当てた回数 */
  streak = 0;
  /** 上のバーに表示する得点（数え上がり中の値） */
  shownScore = 0;
  /** 得点が数え上がったときに、ぴょこっと大きくする残り時間 */
  scoreBump = 0;
  /** 演出の時計（秒）。ゆらゆら・まばたきなどの動きに使う。ポーズ中は進まない */
  time = 0;
  /** このステージのハズレの回数（ステージクリアの星に使う） */
  stageMisses = 0;

  private arrivedScore = 0;
  private particles: Particle[] = [];
  private ghosts: Ghost[] = [];
  private popups: Popup[] = [];
  private flies: ScoreFly[] = [];
  private petals: Particle[] = [];
  private petalCarry = 0;
  private wobbles = new Map<number, number>();
  private ballWobble = 0;
  /** 今飛んでいるハズレの玉が、すでに通り抜けた敵 */
  private passed = new Set<number>();

  constructor(private readonly rng: Rng = Math.random) {}

  /** ステージ開始時（新しいゲームを含む） */
  onStageStart(score: number): void {
    this.particles = [];
    this.ghosts = [];
    this.popups = [];
    this.flies = [];
    this.petals = [];
    this.stageMisses = 0;
    this.wobbles.clear();
    this.passed.clear();
    this.ballWobble = 0;
    this.shownScore = score;
    this.arrivedScore = score;
    if (score === 0) this.streak = 0;
  }

  onThrow(): void {
    this.passed.clear();
  }

  onMiss(): void {
    this.streak = 0;
    this.stageMisses++;
  }

  onHit(enemy: Enemy, points: number, ball: FlyingBall): void {
    this.streak++;
    const cx = enemy.x;
    const cy = enemy.y + LAYOUT.enemyHeight / 2;

    // 雲が晴れる（U4・P4）
    this.ghosts.push({ enemy: { ...enemy }, age: 0 });
    const extra = Math.max(0, this.streak - 1) * EFFECT.flowersPerStreak;
    const count = Math.min(EFFECT.flowers + extra, EFFECT.flowersMax);
    for (let i = 0; i < count; i++) this.particles.push(this.makeParticle(cx, cy, "flower"));
    // 玉はきらきらになって消える
    for (let i = 0; i < 5; i++) this.particles.push(this.makeParticle(ball.x, ball.y, "sparkle"));

    // 式とほめことば（P1・P2）
    const ratio = (LAYOUT.defenseLineY - cy) / (LAYOUT.defenseLineY - LAYOUT.hudHeight);
    const high = ratio >= EFFECT.highRatio;
    const words = high ? PRAISE_HIGH : PRAISE;
    const { a, b, answer } = enemy.problem;
    const thin = " "; // 細いスペース（読みやすさを保ちつつ幅を詰める）
    this.popups.push({
      text: `${a}${thin}×${thin}${b}${thin}=${thin}${answer}`,
      sub: words[Math.floor(this.rng() * words.length)],
      subColor: high ? THEME.scoreText : THEME.pink,
      x: cx,
      y: Math.max(cy, LAYOUT.hudHeight + 16),
      age: 0,
      life: EFFECT.equationLife,
      size: 24,
      maxWidth: VIEW.width / LAYOUT.laneCount - 6,
    });

    // れんぞく（P3）
    if (this.streak >= EFFECT.streakMin) {
      this.popups.push({
        text: `${this.streak} れんぞく！`,
        sub: "",
        subColor: "",
        x: VIEW.width / 2,
        y: LAYOUT.defenseLineY - 40,
        age: 0,
        life: EFFECT.streakLife,
        size: 22,
        maxWidth: VIEW.width,
      });
    }

    // 得点が上のバーへ飛ぶ（U5）
    this.flies.push({ points, x: cx, y: enemy.y, age: 0 });
  }

  private makeParticle(x: number, y: number, kind: Particle["kind"]): Particle {
    const a = this.rng() * Math.PI * 2;
    const speed = kind === "flower" ? 140 + this.rng() * 110 : 60 + this.rng() * 80;
    return {
      kind,
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 20,
      rot: this.rng() * Math.PI,
      vr: (this.rng() - 0.5) * 6,
      size: kind === "flower" ? 9 + this.rng() * 4 : 5 + this.rng() * 3,
      color: kind === "flower" ? FLOWER_COLORS[Math.floor(this.rng() * FLOWER_COLORS.length)] : THEME.yellow,
      age: 0,
    };
  }

  update(dt: number, game: Game): void {
    this.time += dt;
    for (const p of this.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2.5 * dt;
      p.vy = p.vy * (1 - 2.5 * dt) + 25 * dt; // ふわっと少し落ちる
      p.rot += p.vr * dt;
    }
    this.particles = this.particles.filter((p) => p.age < EFFECT.particleLife);
    for (const g of this.ghosts) g.age += dt;
    this.ghosts = this.ghosts.filter((g) => g.age < EFFECT.cloudFade);
    for (const p of this.popups) p.age += dt;
    this.popups = this.popups.filter((p) => p.age < p.life);

    for (const f of this.flies) f.age += dt;
    for (const f of this.flies.filter((f) => f.age >= EFFECT.scoreFlyTime)) {
      this.arrivedScore += f.points;
      this.scoreBump = 0.25;
    }
    this.flies = this.flies.filter((f) => f.age < EFFECT.scoreFlyTime);
    // 着いた得点まで数え上げる
    if (this.shownScore < this.arrivedScore) {
      const step = Math.max(300 * dt, (this.arrivedScore - this.shownScore) * 10 * dt);
      this.shownScore = Math.min(this.arrivedScore, Math.round(this.shownScore + step));
    }
    this.scoreBump = Math.max(0, this.scoreBump - dt);

    // ステージクリア画面では花びらを降らせる（P11）
    if (game.phase === "stageClear") {
      this.petalCarry += EFFECT.petalsPerSecond * dt;
      while (this.petalCarry >= 1) {
        this.petalCarry--;
        this.petals.push({
          kind: "flower",
          x: this.rng() * VIEW.width,
          y: -12,
          vx: (this.rng() - 0.5) * 30,
          vy: 50 + this.rng() * 60,
          rot: this.rng() * Math.PI,
          vr: (this.rng() - 0.5) * 3,
          size: 6 + this.rng() * 5,
          color: FLOWER_COLORS[Math.floor(this.rng() * FLOWER_COLORS.length)],
          age: this.rng() * 10, // 横ゆれのタイミングをばらばらにするための初期値
        });
      }
    }
    for (const p of this.petals) {
      p.age += dt;
      p.x += (p.vx + Math.sin(p.age * 2.2) * 25) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.petals = this.petals.filter((p) => p.y < VIEW.height + 20);

    // ハズレの玉が雲を通り抜けたら「ぽよん」（P6）
    for (const [id, t] of this.wobbles) {
      if (t - dt <= 0) this.wobbles.delete(id);
      else this.wobbles.set(id, t - dt);
    }
    this.ballWobble = Math.max(0, this.ballWobble - dt);
    const b = game.flying;
    if (b && b.targetId === null && b.t > 0) {
      for (const e of game.enemies) {
        if (this.passed.has(e.id)) continue;
        const inX = Math.abs(b.x - e.x) < LAYOUT.enemyWidth / 2 + LAYOUT.ballRadius * 0.5;
        const inY = b.y > e.y - LAYOUT.ballRadius * 0.5 && b.y < e.y + LAYOUT.enemyHeight + LAYOUT.ballRadius * 0.5;
        if (inX && inY) {
          this.passed.add(e.id);
          this.wobbles.set(e.id, EFFECT.wobbleTime);
          this.ballWobble = EFFECT.wobbleTime;
        }
      }
    }
  }

  /** 上のバーに出す得点。プレイ中は数え上がり中の値、それ以外は本当の得点 */
  displayScore(game: Game): number {
    return game.phase === "playing" || game.phase === "paused" ? this.shownScore : game.score;
  }

  /** 敵の「ぽよん」の伸び縮み（横, 縦） */
  enemyScale(id: number): [number, number] {
    const t = this.wobbles.get(id);
    if (t === undefined) return [1, 1];
    const k = t / EFFECT.wobbleTime;
    const w = Math.sin((1 - k) * Math.PI * 3) * 0.12 * k;
    return [1 + w, 1 - w];
  }

  /** ハズレの玉の「ぽよん」の大きさ */
  ballScale(): number {
    const k = this.ballWobble / EFFECT.wobbleTime;
    return 1 + Math.sin((1 - k) * Math.PI * 3) * 0.15 * k;
  }

  /** 敵より下の層: 晴れる雲、お花、式、ほめことば、れんぞく */
  drawUnder(ctx: CanvasRenderingContext2D): void {
    for (const g of this.ghosts) {
      const k = g.age / EFFECT.cloudFade;
      const e = g.enemy;
      const cy = e.y + LAYOUT.enemyHeight / 2;
      const s = 1 + 0.35 * k;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.translate(e.x, cy);
      ctx.scale(s, s);
      ctx.translate(-e.x, -cy);
      drawCloud(ctx, e.x, e.y, LAYOUT.enemyWidth, LAYOUT.enemyHeight, e.id, "");
      ctx.restore();
    }

    for (const p of this.particles) {
      const k = p.age / EFFECT.particleLife;
      ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      const size = p.size * (k < 0.15 ? 0.4 + (k / 0.15) * 0.6 : 1);
      if (p.kind === "flower") drawFlower(ctx, p.x, p.y, size, p.color, p.rot);
      else drawSparkle(ctx, p.x, p.y, size, p.color, p.rot);
    }
    ctx.globalAlpha = 1;

    for (const p of this.popups) {
      const k = p.age / p.life;
      // ぽんっと大きく出てから落ち着き、最後は上に浮かびながら消える
      const pop = p.age < 0.12 ? 0.5 + (p.age / 0.12) * 0.7 : p.age < 0.22 ? 1.2 - ((p.age - 0.12) / 0.1) * 0.2 : 1;
      const fade = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      const rise = k > 0.75 ? ((k - 0.75) / 0.25) * 20 : 0;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y - rise);
      ctx.scale(pop, pop);
      const size = fitSize(ctx, p.text, p.size, p.maxWidth);
      outlinedText(ctx, p.text, 0, 0, size, THEME.text, THEME.textOutline, 5);
      if (p.sub) {
        const subSize = fitSize(ctx, p.sub, 17, p.maxWidth);
        outlinedText(ctx, p.sub, 0, size / 2 + subSize / 2 + 4, subSize, p.subColor, THEME.textOutline, 4);
      }
      ctx.restore();
    }
  }

  /** ステージクリア画面の花びら（画面全体に重ねる） */
  drawPetals(ctx: CanvasRenderingContext2D): void {
    for (const p of this.petals) drawFlower(ctx, p.x, p.y, p.size, p.color, p.rot);
  }

  /** いちばん上の層: 上のバーへ飛んでいく得点 */
  drawOver(ctx: CanvasRenderingContext2D): void {
    for (const f of this.flies) {
      const k = f.age / EFFECT.scoreFlyTime;
      // 少しためてから、加速して上のバーへ
      const e = k * k;
      const x = f.x + (SCORE_POS.x - f.x) * e;
      const y = f.y - 14 * Math.sin(Math.min(1, k * 3)) + (SCORE_POS.y - f.y) * e;
      outlinedText(ctx, `+${f.points}`, x, y, 20 - 6 * e, THEME.scoreText, THEME.textOutline, 5);
    }
  }
}
