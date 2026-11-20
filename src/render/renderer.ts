import { BALL, DIFFICULTY, LAYOUT, VIEW } from "../config";
import type { Game, Phase } from "../game/game";
import { PLAYER_POS } from "../game/layout";
import type { Settings } from "../settings";
import { pauseMenuButtons, settingsLayout, titleButtons, type Button } from "../ui/buttons";
import type { BallView } from "./ballView";
import { STAR_MESSAGES, starsForMisses, type Effects } from "./effects";
import { enemyMotion, girlMotion, maxDanger, MOTION } from "./motion";
import { drawCandy, drawCloud, drawGirl, drawSparkle, drawStar, outlinedText, type GirlPose } from "./sprites";
import { candyColorIndex, FONT, stageBackground, STAGE_BACKGROUNDS, THEME, type StageBackground } from "./theme";

/** 描画に必要なゲーム外の状態 */
export interface UiState {
  settings: Settings;
  vibrationSupported: boolean;
  /** 玉ストックの見た目の位置 */
  balls: BallView;
  /** 命中・ハズレ・得点の演出 */
  effects: Effects;
}

/** 夜空の星（位置は決まった乱数で作る） */
const NIGHT_STARS = (() => {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: 22 }, () => ({
    x: rnd() * VIEW.width,
    y: LAYOUT.hudHeight + rnd() * (LAYOUT.defenseLineY - LAYOUT.hudHeight - 40),
    size: 3 + rnd() * 3.5,
    speed: 1 + rnd() * 2,
    phase: rnd() * Math.PI * 2,
  }));
})();

/** ステージクリア・ゲームオーバーのレイヤーが濃くなるまで（秒） */
const OVERLAY_FADE = 0.4;
/** ステージクリアの星が出始めるまでと、星どうしの間隔（秒） */
const STAR_DELAY = 0.35;
const STAR_INTERVAL = 0.25;
/** 画面の切り替えで、新しい画面がふわっと出てくるまで（秒）（P14） */
const TRANSITION_TIME = 0.35;

/** 投げた直後の「えいっ」のポーズを続ける時間（秒） */
const THROW_POSE_TIME = 0.22;
/** 手に持っているときのキャンディの大きさ（自分より大きくならないように） */
const HELD_SCALE = 0.6;
/** 手から離れて元の大きさに戻るまでの時間（秒） */
const GROW_TIME = 0.15;


export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not supported");
    this.ctx = ctx;
  }

  /**
   * 画面サイズに合わせてキャンバスを調整する。
   * 論理解像度 VIEW を維持して拡大縮小し、高 DPI にも対応する。
   */
  resize(): void {
    const scale = Math.min(window.innerWidth / VIEW.width, window.innerHeight / VIEW.height);
    const cssW = Math.floor(VIEW.width * scale);
    const cssH = Math.floor(VIEW.height * scale);
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
  }

  /** クライアント座標を論理座標へ変換 */
  toLogical(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * VIEW.width,
      y: ((clientY - rect.top) / rect.height) * VIEW.height,
    };
  }

  /** 画面の切り替え（P14）。前のフェーズと、切り替わった時刻 */
  private lastPhase: Phase | null = null;
  private transitionStart = -Infinity;

  draw(game: Game, ui: UiState): void {
    this.trackTransition(game.phase, ui.effects.time);
    this.drawScreen(game, ui);
    // 切り替わった直後は、背景色のレイヤーを薄くしていき、新しい画面をふわっと出す
    const k = (ui.effects.time - this.transitionStart) / TRANSITION_TIME;
    if (k >= 0 && k < 1) {
      this.ctx.globalAlpha = 1 - k;
      this.ctx.fillStyle = THEME.bgTop;
      this.ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      this.ctx.globalAlpha = 1;
    }
  }

  /**
   * ふわっと切り替える画面の組み合わせ。
   * ポーズの出入りはすぐ切り替える。ステージクリア・ゲームオーバーは、
   * プレイ画面の上にレイヤーが濃くなっていく形で切り替える（overlay）
   */
  private trackTransition(phase: Phase, time: number): void {
    const prev = this.lastPhase;
    this.lastPhase = phase;
    if (prev === null || prev === phase) return;
    if (prev === "paused" || phase === "paused") return;
    if (phase === "stageClear" || phase === "gameOver") return;
    this.transitionStart = time;
  }

  private drawScreen(game: Game, ui: UiState): void {
    const ctx = this.ctx;
    ctx.setTransform(this.canvas.width / VIEW.width, 0, 0, this.canvas.height / VIEW.height, 0, 0);
    // タイトル・設定は最初の背景、プレイ中はステージごとの背景（P12）
    const inMenu = game.phase === "title" || game.phase === "settings";
    this.drawBackground(inMenu ? STAGE_BACKGROUNDS[0] : stageBackground(game.stage), ui.effects.time);

    if (game.phase === "title") {
      this.drawTitle(ui);
      return;
    }
    if (game.phase === "settings") {
      this.drawSettings(ui);
      return;
    }

    if (game.phase === "paused") {
      // プレイ画面の上に半透明のレイヤーを重ね、うっすら見えるようにする
      this.drawField(game, ui);
      this.drawHud(game, ui, false);
      this.ctx.fillStyle = THEME.pauseOverlay;
      this.ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      this.drawPaused();
      return;
    }

    this.drawField(game, ui);
    this.drawHud(game, ui, game.phase === "playing");
    ui.effects.drawOver(this.ctx);
    if (game.phase === "stageClear") this.drawStageClear(game, ui);
    if (game.phase === "gameOver") this.drawGameOver(game);
  }

  private text(s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "center"): void {
    const ctx = this.ctx;
    ctx.font = `bold ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(s, x, y);
  }

  private drawBackground(bg: StageBackground, time: number): void {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    bg.stops.forEach((c, i) => g.addColorStop(i / (bg.stops.length - 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    if (bg.stars) {
      // 夜空の星。位置は固定で、ゆっくりまたたく
      for (const st of NIGHT_STARS) {
        ctx.globalAlpha = 0.45 + 0.4 * Math.sin(time * st.speed + st.phase);
        drawSparkle(ctx, st.x, st.y, st.size, "#ffffff", 0);
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawField(game: Game, ui: UiState): void {
    const ctx = this.ctx;

    // 防衛ライン。敵が近づくほど濃く太くなり、ゆっくり脈打つ（演出 P5）
    const danger = maxDanger(game.enemies);
    const pulse = danger > 0 ? (Math.sin(ui.effects.time * MOTION.linePulseSpeed) + 1) / 2 : 0;
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.45 * danger;
    ctx.strokeStyle = danger > 0.5 ? THEME.lineDanger : THEME.line;
    ctx.lineWidth = 2 + danger * (1.5 + pulse * 1.5);
    ctx.lineCap = "round";
    ctx.setLineDash([2, 8]);
    ctx.beginPath();
    ctx.moveTo(4, LAYOUT.defenseLineY);
    ctx.lineTo(VIEW.width - 4, LAYOUT.defenseLineY);
    ctx.stroke();
    ctx.restore();

    // 命中の演出（式・お花など）は、問題の文字を隠さないよう敵より下に描く
    ui.effects.drawUnder(ctx);

    // 敵（もこもこ雲）。ハズレの玉が通り抜けると「ぽよん」と伸び縮みする（P6）
    // 見た目だけ、ゆらゆら揺れ・上のバーの下からふくらみ・危ないと震える（P9・P5）
    for (const e of game.enemies) {
      const [sx, sy] = ui.effects.enemyScale(e.id);
      const m = enemyMotion(e, ui.effects.time);
      const cy = e.y + LAYOUT.enemyHeight / 2;
      ctx.save();
      ctx.translate(e.x + m.dx, cy + m.dy);
      ctx.scale(sx * m.scale, sy * m.scale);
      ctx.translate(-e.x, -cy);
      drawCloud(ctx, e.x, e.y, LAYOUT.enemyWidth, LAYOUT.enemyHeight, e.id, `${e.problem.a} × ${e.problem.b}`);
      ctx.restore();
    }

    // 自分（うさぎ耳の女の子）。投げている間はポーズを変える（演出 U3）
    const f = game.flying;
    let pose: GirlPose = "idle";
    if (f && f.age < BALL.windup) pose = "raise";
    else if (f && f.age < BALL.windup + THROW_POSE_TIME) pose = "throw";
    // 待っている間はゆらゆら揺れて、ときどきまばたき（P10）
    const idle = girlMotion(ui.effects.time);
    if (pose !== "idle") idle.sway = 0;
    drawGirl(ctx, PLAYER_POS.x, PLAYER_POS.y, 1, pose, idle);

    // 玉ストック（キャンディ）。位置は転がる動きを含めた見た目の位置（演出 U1）
    const canThrow = game.canThrow;
    for (const b of ui.balls.sprites(game.stock)) {
      drawCandy(ctx, b.x, b.y, LAYOUT.ballRadius, candyColorIndex(b.value), b.value, !canThrow, b.angle);
    }

    // 飛んでいる玉
    if (f) {
      let scale: number;
      let angle = 0;
      if (f.age < BALL.windup) {
        // 持ち上げるとき: 押された瞬間に「ぷにっ」とへこみ（P8）、手の大きさまで小さくなる
        const k = f.age / BALL.windup;
        scale = (1 - (1 - HELD_SCALE) * k) * (1 - 0.18 * Math.sin(Math.PI * Math.min(1, k * 2)));
      } else {
        // 手から離れたら元の大きさに戻りながら、くるくる回って飛ぶ
        const fly = f.age - BALL.windup;
        scale = Math.min(1, HELD_SCALE + ((1 - HELD_SCALE) * fly) / GROW_TIME);
        angle = fly * 6 * Math.sign(f.curve);
        if (f.targetId === null) scale *= ui.effects.ballScale();
      }
      drawCandy(ctx, f.x, f.y, LAYOUT.ballRadius, candyColorIndex(f.value), f.value, false, angle, scale);
    }
  }

  private drawHud(game: Game, ui: UiState, showPauseButton: boolean): void {
    const ctx = this.ctx;
    ctx.fillStyle = THEME.hudBg;
    ctx.fillRect(0, 0, VIEW.width, LAYOUT.hudHeight);
    ctx.fillStyle = THEME.hudLine;
    ctx.fillRect(0, LAYOUT.hudHeight - 2, VIEW.width, 2);
    this.text(`ステージ ${game.stage}`, 10, 20, 16, THEME.text, "left");
    this.text(`${game.defeatedCount} / ${game.params.enemiesToClear}`, 140, 20, 16, THEME.text);
    // 得点は、飛んできた数字が着くと数え上がり、ぴょこっと大きくなる（U5）
    const bump = 1 + ui.effects.scoreBump * 0.8;
    ctx.save();
    ctx.translate(VIEW.width - 26, 20);
    ctx.scale(bump, bump);
    this.text(`${ui.effects.displayScore(game)} てん`, 0, 0, 16, THEME.scoreText, "right");
    ctx.restore();

    if (showPauseButton) {
      // ポーズはバー全体をタップ。ボタンの絵は出さず、右端に小さな目印だけ出す
      ctx.fillStyle = THEME.note;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.roundRect(VIEW.width - 17, 13, 3.5, 14, 1.75);
      ctx.roundRect(VIEW.width - 11, 13, 3.5, 14, 1.75);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  private drawPaused(): void {
    outlinedText(this.ctx, "ポーズちゅう", VIEW.width / 2, 200, 30, THEME.text);
    this.drawButtons(pauseMenuButtons());
  }

  /** 画面全体に重ねるレイヤー。k（0〜1）でふわっと濃くなる（P14） */
  private overlay(k = 1): void {
    this.ctx.globalAlpha = k;
    this.ctx.fillStyle = THEME.overlay;
    this.ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    this.ctx.globalAlpha = 1;
  }

  private drawTitle(ui: UiState): void {
    const ctx = this.ctx;
    outlinedText(ctx, "くくシューター", VIEW.width / 2, 100, 36, THEME.pink, THEME.textOutline, 8);
    drawGirl(ctx, VIEW.width / 2, 212, 2, "idle", girlMotion(ui.effects.time));
    this.text("こたえの キャンディを タップして", VIEW.width / 2, 296, 15, THEME.text);
    this.text("くもの いたずらっこを やっつけよう！", VIEW.width / 2, 320, 15, THEME.text);
    this.text(`むずかしさ: ${DIFFICULTY[ui.settings.difficulty].label}`, VIEW.width / 2, 360, 14, THEME.note);
    this.drawButtons(titleButtons());
  }

  private drawSettings(ui: UiState): void {
    outlinedText(this.ctx, "せってい", VIEW.width / 2, 60, 28, THEME.pink, THEME.textOutline, 6);
    const { rows, buttons } = settingsLayout(ui.settings, ui.vibrationSupported);
    for (const r of rows) {
      this.text(r.label, 24, r.y, 17, THEME.text, "left");
      if (r.note) this.text(r.note, VIEW.width - 20, r.y, 12, THEME.note, "right");
    }
    this.drawButtons(buttons);
  }

  /** ぷっくりした角丸ボタンの形（影＋本体＋ふち） */
  private drawButtonShape(b: Button, bg: string, bordered: boolean): void {
    const ctx = this.ctx;
    const r = Math.min(b.h / 2, 18);
    ctx.fillStyle = THEME.buttonShadow;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y + 3, b.w, b.h, r);
    ctx.fill();
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, r);
    ctx.fill();
    if (bordered) {
      ctx.strokeStyle = THEME.buttonBorder;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  private drawButtons(buttons: readonly Button[]): void {
    for (const b of buttons) {
      let bg: string = THEME.button;
      let fg: string = THEME.buttonText;
      let bordered = true;
      if (b.disabled) {
        bg = THEME.buttonDisabled;
        fg = THEME.buttonDisabledText;
        bordered = false;
      } else if (b.selected) {
        bg = THEME.buttonSelected;
        fg = THEME.buttonSelectedText;
        bordered = false;
      } else if (b.primary) {
        bg = THEME.buttonPrimary;
        fg = THEME.buttonPrimaryText;
        bordered = false;
      }
      this.drawButtonShape(b, bg, bordered);
      this.text(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1, b.h >= 56 ? 24 : 18, fg);
    }
  }

  private drawStageClear(game: Game, ui: UiState): void {
    const ctx = this.ctx;
    const t = game.phaseTime;
    this.overlay(Math.min(1, t / OVERLAY_FADE));
    // 花びらが降る（P11）
    ui.effects.drawPetals(ctx);

    const cx = VIEW.width / 2;
    outlinedText(ctx, `ステージ ${game.stage} クリア！`, cx, 190, 30, THEME.pink, THEME.textOutline, 8);

    // 星（★1〜3）を 1 つずつ、ぽんっと出す
    const stars = starsForMisses(ui.effects.stageMisses);
    for (let i = 0; i < 3; i++) {
      const appear = t - STAR_DELAY - i * STAR_INTERVAL;
      if (appear < 0) continue;
      const pop = appear < 0.15 ? 0.4 + (appear / 0.15) * 0.8 : appear < 0.25 ? 1.2 - ((appear - 0.15) / 0.1) * 0.2 : 1;
      const on = i < stars;
      drawStar(ctx, cx + (i - 1) * 64, 262 - (i === 1 ? 8 : 0), 26 * pop, on ? THEME.yellow : "#ece4f2", on ? "#ffffff" : "#d8cce2");
    }
    const allShown = t > STAR_DELAY + 2 * STAR_INTERVAL + 0.2;
    if (allShown) outlinedText(ctx, STAR_MESSAGES[stars], cx, 318, 22, THEME.scoreText, THEME.textOutline, 6);

    this.text(`ハズレ ${ui.effects.stageMisses} かい`, cx, 356, 16, THEME.note);
    this.text(`クリアボーナス +${game.lastClearBonus}`, cx, 386, 18, THEME.text);
    this.text(`とくてん ${game.score}`, cx, 414, 18, THEME.text);
    if (t > 0.8) this.text("タップで つぎへ", cx, 480, 20, THEME.note);
  }

  private drawGameOver(game: Game): void {
    const ctx = this.ctx;
    this.overlay(Math.min(1, game.phaseTime / OVERLAY_FADE));
    outlinedText(ctx, "ゲームオーバー", VIEW.width / 2, 230, 32, THEME.text, THEME.textOutline, 8);
    this.text(`ステージ ${game.stage}`, VIEW.width / 2, 290, 18, THEME.text);
    this.text(`とくてん ${game.score}`, VIEW.width / 2, 320, 18, THEME.text);
    if (game.phaseTime > 0.8) this.text("タップで タイトルへ", VIEW.width / 2, 420, 20, THEME.note);
  }
}
