import { BALL, LAYOUT, SPAWN, stageParams, type Difficulty, type StageParams } from "../config";
import { ensureCorrectBall, fillStock, type BallStock } from "./balls";
import { ballSlotPos, laneCenterX, LAUNCH_POS } from "./layout";
import { generateProblem, makeProblem, problemKey, type Problem } from "./problems";
import { defaultRng, pick, type Rng } from "./rng";
import { clearBonus, comboMultiplier, defeatScore } from "./scoring";

export type Phase = "title" | "settings" | "playing" | "paused" | "stageClear" | "gameOver";

export interface Enemy {
  id: number;
  problem: Problem;
  lane: number;
  /** 中心 X */
  x: number;
  /** 上端 Y */
  y: number;
}

export interface FlyingBall {
  value: number;
  x: number;
  y: number;
  /** 狙っている敵の id（一致する敵がいなければ null＝まっすぐ上へ素通り） */
  targetId: number | null;
  /** 投げた元のスロット */
  slot: number;
  /** 投げてからの経過秒（「ため」を含む） */
  age: number;
  /** 投げた元のスロットの位置（「ため」の間に、ここから手の位置へ動く） */
  fromX: number;
  fromY: number;
  /** 曲線上の進み具合（0 = 発射点、1 = 終点） */
  t: number;
  /** 曲がり具合（符号が曲がる向き） */
  curve: number;
}

export interface GameEvents {
  onThrow?: () => void;
  /** 命中した。ball は命中した瞬間の玉 */
  onHit?: (enemy: Enemy, points: number, ball: FlyingBall) => void;
  onMiss?: () => void;
  onPhaseChange?: (phase: Phase) => void;
  /** ステージが始まった（玉のストックが作り直された） */
  onStageStart?: () => void;
}

/** 玉と敵の当たり判定に使う半径（玉が敵の矩形に食い込んだら命中） */
const HIT_INSET = 6;
/** レーンで次の敵を出すために必要な、直前の敵との縦の間隔 */
const LANE_GAP = 16;

export class Game {
  phase: Phase = "title";
  /** 現在のフェーズに入ってからの経過秒 */
  phaseTime = 0;
  stage = 1;
  score = 0;
  difficulty: Difficulty = "easy";
  /** ハズレなしで続けて当てた回数（コンボ）。ステージをまたいで続き、ハズレか新しいゲームで 0 に戻る */
  streak = 0;
  params: StageParams = stageParams(1);
  enemies: Enemy[] = [];
  spawnedCount = 0;
  defeatedCount = 0;
  spawnTimer = 0;
  stock: BallStock = [];
  flying: FlyingBall | null = null;
  /**
   * 次に出す敵の問題（前もって決めておく）。
   * 画面に敵がいないときは、この問題の答えを正解玉としてストックに入れておく。
   */
  nextProblem: Problem | null = null;
  /** 直前のステージのクリアボーナス（クリア画面表示用） */
  lastClearBonus = 0;

  private nextEnemyId = 1;

  constructor(
    private readonly rng: Rng = defaultRng,
    private readonly events: GameEvents = {},
  ) {}

  /** 新しいゲームを最初のステージから始める */
  startNewGame(difficulty: Difficulty = this.difficulty): void {
    this.difficulty = difficulty;
    this.score = 0;
    this.streak = 0;
    this.startStage(1);
  }

  /** タイトルへ戻る（ゲームオーバー後・設定画面から） */
  backToTitle(): void {
    this.setPhase("title");
  }

  /** プレイ中に一時停止する。止めたら true */
  pause(): boolean {
    if (this.phase !== "playing") return false;
    this.setPhase("paused");
    return true;
  }

  /** 一時停止から再開する */
  resume(): void {
    if (this.phase === "paused") this.setPhase("playing");
  }

  /** 一時停止中にゲームをやめてタイトルへ戻る（得点は記録しない） */
  quit(): void {
    if (this.phase !== "paused") return;
    this.enemies = [];
    this.flying = null;
    this.setPhase("title");
  }

  /** タイトルから設定画面へ */
  openSettings(): void {
    this.setPhase("settings");
  }

  /** ステージクリア後に次のステージへ */
  startNextStage(): void {
    this.startStage(this.stage + 1);
  }

  startStage(stage: number): void {
    this.stage = stage;
    this.params = stageParams(stage, this.difficulty);
    this.enemies = [];
    this.spawnedCount = 0;
    this.defeatedCount = 0;
    this.flying = null;
    this.spawnTimer = this.params.spawnInterval;
    this.stock = new Array<number | null>(BALL.stockSize).fill(null);
    this.nextProblem = null;
    // 最初の敵をすぐ出し、その敵に対する正解玉を含むストックを作る
    this.trySpawnEnemy();
    this.refill();
    this.events.onStageStart?.();
    this.setPhase("playing");
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.phaseTime = 0;
    this.events.onPhaseChange?.(phase);
  }

  /** 画面上の敵の問題一覧 */
  problems(): Problem[] {
    return this.enemies.map((e) => e.problem);
  }

  /**
   * 玉の正解・ハズレを決める基準となる問題。
   * 画面に敵がいればその問題、いなければ次に出す敵の問題。
   */
  ballProblems(): Problem[] {
    if (this.enemies.length > 0) return this.problems();
    return this.nextProblem ? [this.nextProblem] : [];
  }

  /** 一番下（防衛ラインに最も近い）の敵 */
  lowestEnemy(): Enemy | null {
    let lowest: Enemy | null = null;
    for (const e of this.enemies) if (lowest === null || e.y > lowest.y) lowest = e;
    return lowest;
  }

  /**
   * ストックに必ず入れておく答え。
   * 一番下の敵の答え（敵がいなければ次に出す敵の答え）。
   * 九九が分かっていれば、一番下の敵はいつでも倒せるようにするため。
   *
   * 補充のときにだけ入れれば、この約束は保たれる:
   * - この玉を投げると一番下の敵に飛ぶので、玉がなくなるのは一番下の敵を倒したとき（＝補充がある）
   * - 敵は同じ速さで降りるので順番は入れ替わらず、新しい敵は一番上から出る
   */
  requiredAnswer(): number | null {
    return this.lowestEnemy()?.problem.answer ?? this.nextProblem?.answer ?? null;
  }

  get canThrow(): boolean {
    return this.phase === "playing" && this.flying === null;
  }

  /** スロット slot の玉を投げる。投げられたら true */
  throwBall(slot: number): boolean {
    if (!this.canThrow) return false;
    const value = this.stock[slot];
    if (value === null || value === undefined) return false;

    // 答えが一致する敵のうち、最も下（防衛ラインに近い）敵を狙う
    let target: Enemy | null = null;
    for (const e of this.enemies) {
      if (e.problem.answer === value && (target === null || e.y > target.y)) target = e;
    }
    // 投げた玉を抜いて残りを左に詰め、空きは右端に作る（補充される玉は右端に入る: 演出 U1）
    const from = ballSlotPos(slot, this.stock.length);
    this.stock.splice(slot, 1);
    this.stock.push(null);
    this.flying = {
      value,
      x: from.x,
      y: from.y,
      targetId: target?.id ?? null,
      slot,
      age: 0,
      fromX: from.x,
      fromY: from.y,
      t: 0,
      curve: (this.rng() < 0.5 ? -1 : 1) * BALL.curve,
    };
    this.events.onThrow?.();
    return true;
  }

  update(dt: number): void {
    this.phaseTime += dt;
    // 一時停止中は何も動かさない
    if (this.phase === "paused") return;
    if (this.phase !== "playing") return;

    this.updateSpawn(dt);
    this.updateEnemies(dt);
    if (this.phase !== "playing") return;
    this.updateFlying(dt);
  }

  private updateSpawn(dt: number): void {
    if (this.spawnedCount >= this.params.enemiesToClear) return;
    this.spawnTimer -= dt;
    // 画面に敵がいなくなったら待たずに次を出す
    if (this.enemies.length === 0) this.spawnTimer = Math.min(this.spawnTimer, 0.4);
    if (this.spawnTimer > 0) return;
    if (this.trySpawnEnemy()) {
      this.spawnTimer = this.params.spawnInterval;
      // 玉が飛んでいる間は、着弾後の補充で正解玉を入れるので何もしない
      // （飛んでいない玉の数字を途中で変えないため）。
      // 飛んでいなければ前もって正解玉を入れてあるので、通常は何も起きない（念のための保険）
      if (this.flying === null) ensureCorrectBall(this.rng, this.stock, this.problems());
    }
  }

  /** 敵を 1 匹出す。出せる場所・問題がなければ false（次フレームで再試行） */
  private trySpawnEnemy(): boolean {
    if (this.enemies.length >= this.params.maxEnemiesOnScreen) return false;
    if (this.spawnedCount >= this.params.enemiesToClear) return false;

    const freeLanes: number[] = [];
    for (let lane = 0; lane < LAYOUT.laneCount; lane++) {
      const blocked = this.enemies.some(
        (e) => e.lane === lane && e.y < LAYOUT.enemySpawnY + LAYOUT.enemyHeight + LANE_GAP,
      );
      if (!blocked) freeLanes.push(lane);
    }
    if (freeLanes.length === 0) return false;

    const exclude = new Set(this.enemies.map((e) => problemKey(e.problem)));
    // 前もって決めた問題は、その答えの玉が手持ちにあるときだけ使う（画面に敵がいないときは、補充で入れてある）。
    // なければ、今の手持ちに合わせて選び直す
    let problem = this.nextProblem;
    if (problem === null || exclude.has(problemKey(problem)) || !this.stock.includes(problem.answer)) {
      problem = this.chooseProblem(exclude);
    }
    if (problem === null) return false;

    const lane = pick(this.rng, freeLanes);
    this.enemies.push({
      id: this.nextEnemyId++,
      problem,
      lane,
      x: laneCenterX(lane),
      y: LAYOUT.enemySpawnY,
    });
    this.spawnedCount++;
    exclude.add(problemKey(problem));
    this.nextProblem = this.spawnedCount < this.params.enemiesToClear ? this.chooseProblem(exclude) : null;
    return true;
  }

  /**
   * 次に出す敵の問題を選ぶ。
   * SPAWN.matchHeldProbability の確率で、手持ちのハズレの玉（画面のどの敵の答えでもない玉）の数字が
   * 答えになる問題を選ぶ。もとからある玉があとから正解に変わるので、補充した玉ばかりが正解になるのを防げる。
   * 手持ちに合わせられないとき・確率で外れたときは、ふつうにランダムに選ぶ。
   */
  private chooseProblem(exclude: ReadonlySet<string>): Problem | null {
    if (this.rng() < SPAWN.matchHeldProbability) {
      const onScreen = new Set(this.enemies.map((e) => e.problem.answer));
      const candidates: Problem[] = [];
      for (const v of this.stock) {
        if (v === null || onScreen.has(v)) continue;
        for (const a of this.params.dans) {
          const b = v / a;
          if (Number.isInteger(b) && b >= 1 && b <= 9 && !exclude.has(problemKey({ a, b }))) {
            candidates.push(makeProblem(a, b));
          }
        }
      }
      if (candidates.length > 0) {
        // 玉ごとに選ばれやすさをそろえる（約数の多い数ばかり選ばれないように）
        const values = [...new Set(candidates.map((p) => p.answer))];
        const v = pick(this.rng, values);
        return pick(this.rng, candidates.filter((p) => p.answer === v));
      }
    }
    return generateProblem(this.rng, this.params.dans, exclude);
  }

  private updateEnemies(dt: number): void {
    for (const e of this.enemies) {
      e.y += this.params.enemySpeed * dt;
      if (e.y + LAYOUT.enemyHeight >= LAYOUT.defenseLineY) {
        this.flying = null;
        this.setPhase("gameOver");
        return;
      }
    }
  }

  private updateFlying(dt: number): void {
    const b = this.flying;
    if (b === null) return;
    b.age += dt;

    // 「ため」: スロットから手の位置へ、ぴょんと持ち上げる（まだ飛ばない）
    if (b.age < BALL.windup) {
      const k = b.age / BALL.windup;
      b.x = b.fromX + (LAUNCH_POS.x - b.fromX) * k;
      b.y = b.fromY + (LAUNCH_POS.y - b.fromY) * k - Math.sin(Math.PI * k) * 24;
      return;
    }

    const target = b.targetId === null ? undefined : this.enemies.find((e) => e.id === b.targetId);
    // 終点: 狙った敵の中心（敵は動くので毎フレーム更新）。一致する敵がいなければ真上の画面外
    const ex = target ? target.x : LAUNCH_POS.x;
    const ey = target ? target.y + LAYOUT.enemyHeight / 2 : -LAYOUT.ballRadius - 10;
    const sx = LAUNCH_POS.x;
    const sy = LAUNCH_POS.y;
    const dx = ex - sx;
    const dy = ey - sy;
    const chord = Math.hypot(dx, dy) || 1;
    // 2 次ベジェ曲線。制御点は中点から進行方向に垂直にずらす（演出 U2）
    const cx = (sx + ex) / 2 - (dy / chord) * b.curve * chord;
    const cy = (sy + ey) / 2 + (dx / chord) * b.curve * chord;
    // 曲線の長さの近似（弦の長さ＋ふくらみ）で割って、ほぼ一定の速さで進める
    const length = chord * (1 + (8 / 3) * (b.curve / 2) ** 2);
    b.t = Math.min(1, b.t + (BALL.speed * dt) / length);
    const u = 1 - b.t;
    b.x = u * u * sx + 2 * u * b.t * cx + b.t * b.t * ex;
    b.y = u * u * sy + 2 * u * b.t * cy + b.t * b.t * ey;

    if (target) {
      if (b.t >= 1 || this.touches(b, target)) this.hit(target);
      return;
    }
    // 一致する敵がいない玉は敵との当たり判定をしない（素通り）
    if (b.t >= 1) {
      this.flying = null;
      this.refill();
      this.streak = 0;
      this.events.onMiss?.();
    }
  }

  private touches(b: FlyingBall, e: Enemy): boolean {
    const halfW = LAYOUT.enemyWidth / 2 - HIT_INSET;
    const top = e.y + HIT_INSET;
    const bottom = e.y + LAYOUT.enemyHeight - HIT_INSET;
    const cx = Math.max(e.x - halfW, Math.min(b.x, e.x + halfW));
    const cy = Math.max(top, Math.min(b.y, bottom));
    return (b.x - cx) ** 2 + (b.y - cy) ** 2 <= LAYOUT.ballRadius ** 2;
  }

  private hit(enemy: Enemy): void {
    const ball = this.flying!;
    this.flying = null;
    this.enemies = this.enemies.filter((e) => e !== enemy);
    this.streak++;
    // 得点 = 高さ・ステージ・難易度・コンボボーナスの倍率をかけたもの
    const multiplier = this.params.scoreMultiplier * comboMultiplier(this.streak);
    const points = defeatScore(enemy.y + LAYOUT.enemyHeight / 2, this.stage, multiplier);
    this.score += points;
    this.defeatedCount++;
    this.events.onHit?.(enemy, points, ball);

    if (this.defeatedCount >= this.params.enemiesToClear) {
      this.lastClearBonus = clearBonus(this.stage, this.params.scoreMultiplier);
      this.score += this.lastClearBonus;
      this.setPhase("stageClear");
      return;
    }
    this.refill();
  }

  /** 空きスロット（投げた玉のスロット）を補充する */
  private refill(): void {
    fillStock(
      this.rng,
      this.stock,
      this.ballProblems(),
      { correctProbability: this.params.correctProbability },
      this.requiredAnswer(),
    );
  }

  /** 描画用：スロットの位置 */
  slotPos(i: number) {
    return ballSlotPos(i, this.stock.length);
  }
}
