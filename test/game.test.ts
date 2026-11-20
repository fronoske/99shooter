import { describe, expect, it } from "vitest";
import { BALL, LAYOUT } from "../src/config";
import { LAUNCH_POS } from "../src/game/layout";
import { hasCorrectBall } from "../src/game/balls";
import { Game } from "../src/game/game";
import { comboMultiplier, defeatScore } from "../src/game/scoring";

function run(game: Game, seconds: number, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) game.update(dt);
}

/** 正解玉のスロット番号 */
function correctSlot(game: Game): number {
  const answers = new Set(game.enemies.map((e) => e.problem.answer));
  return game.stock.findIndex((v) => v !== null && answers.has(v));
}

describe("Game", () => {
  it("開始直後に敵が 1 匹いて正解玉がある", () => {
    const g = new Game();
    g.startNewGame();
    expect(g.phase).toBe("playing");
    expect(g.enemies).toHaveLength(1);
    expect(hasCorrectBall(g.stock, g.problems())).toBe(true);
  });

  it("正解玉を投げると敵が消えて得点が入り、玉が補充される", () => {
    const g = new Game();
    g.startNewGame();
    const slot = correctSlot(g);
    const before = [...g.stock];
    expect(g.throwBall(slot)).toBe(true);
    // 投げた玉が抜けて残りが左に詰まり、右端が空く
    expect(g.stock).toEqual([...before.slice(0, slot), ...before.slice(slot + 1), null]);
    // 飛行中は投げられない
    expect(g.throwBall((slot + 1) % g.stock.length)).toBe(false);
    run(g, 1.5);
    expect(g.defeatedCount).toBe(1);
    expect(g.score).toBeGreaterThan(0);
    expect(g.flying).toBeNull();
    expect(g.stock.every((v) => v !== null)).toBe(true);
  });

  it("ハズレ玉は素通りして画面外に消え、玉が補充される", () => {
    const g = new Game();
    g.startNewGame();
    const answers = new Set(g.enemies.map((e) => e.problem.answer));
    const slot = g.stock.findIndex((v) => v !== null && !answers.has(v));
    expect(slot).toBeGreaterThanOrEqual(0);
    g.throwBall(slot);
    expect(g.flying?.targetId).toBeNull();
    run(g, 1.5);
    expect(g.flying).toBeNull();
    expect(g.defeatedCount).toBe(0);
    expect(g.enemies.length).toBeGreaterThanOrEqual(1);
    expect(g.stock.every((v) => v !== null)).toBe(true);
  });

  it("敵が 0 匹になったら次の敵の答えを玉に入れておき、敵が出ても玉の数字は変わらない", () => {
    const g = new Game();
    g.startNewGame();
    expect(g.enemies).toHaveLength(1);
    g.throwBall(correctSlot(g));
    // 2 匹目が出る前に倒しきる（玉は 1 フレームで届かないので少しずつ進める）
    while (g.flying !== null) g.update(1 / 60);
    expect(g.enemies).toHaveLength(0);
    const next = g.nextProblem!;
    expect(next).not.toBeNull();
    expect(g.stock).toContain(next.answer);
    const before = [...g.stock];
    while (g.enemies.length === 0) g.update(1 / 60);
    expect(g.enemies[0].problem).toEqual(next);
    expect(g.stock).toEqual(before);
  });

  it("玉の数字が変わるのは補充されたスロットだけで、一番下の敵の答えは常に手持ちにある", () => {
    for (let round = 0; round < 20; round++) {
      const g = new Game();
      g.startNewGame();
      let thrown = -1;
      let guard = 0;
      while (g.phase === "playing" && guard++ < 100000) {
        if (g.canThrow) {
          // 正解とハズレを交互に投げる
          const answers = new Set(g.enemies.map((e) => e.problem.answer));
          const wantCorrect = guard % 2 === 0;
          let slot = g.stock.findIndex((v) => v !== null && answers.has(v) === wantCorrect);
          if (slot < 0) slot = 0;
          g.throwBall(slot);
          // 残りは左に詰まり、補充は必ず右端に入る
          thrown = g.stock.length - 1;
          expect(g.stock[thrown]).toBeNull();
        }
        const before = [...g.stock];
        g.update(1 / 60);
        g.stock.forEach((v, i) => {
          if (i !== thrown) expect(v).toBe(before[i]);
        });
        if (g.enemies.length > 0 && g.flying === null) {
          expect(hasCorrectBall(g.stock, g.problems())).toBe(true);
          // 一番下の敵の答えは必ず手持ちにある
          expect(g.stock).toContain(g.lowestEnemy()!.problem.answer);
        }
      }
    }
  });

  it("敵が防衛ラインに着いたらゲームオーバー", () => {
    const g = new Game();
    g.startNewGame();
    run(g, 120);
    expect(g.phase).toBe("gameOver");
  });

  it("規定数倒すとステージクリアし、次のステージは難しくなる", () => {
    const g = new Game();
    g.startNewGame();
    const speed1 = g.params.enemySpeed;
    let guard = 0;
    while (g.phase === "playing" && guard++ < 100000) {
      if (g.canThrow && g.enemies.length > 0) {
        const slot = correctSlot(g);
        expect(slot).toBeGreaterThanOrEqual(0);
        g.throwBall(slot);
      }
      g.update(1 / 60);
    }
    expect(g.phase).toBe("stageClear");
    expect(g.defeatedCount).toBe(g.params.enemiesToClear);
    g.startNextStage();
    expect(g.stage).toBe(2);
    expect(g.params.enemySpeed).toBeGreaterThan(speed1);
  });
});

describe("ball fairness", () => {
  /** 再現可能な乱数（mulberry32） */
  function seeded(seed: number) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("当てた直後に補充された玉（右端）だけが正解になりやすい、という偏りがない", () => {
    const rng = seeded(42);
    let newest = 0;
    let newestCorrect = 0;
    let others = 0;
    let othersCorrect = 0;
    for (let round = 0; round < 60; round++) {
      let lastWasHit = false;
      const g = new Game(seeded(round + 1), {
        onHit: () => (lastWasHit = true),
        onMiss: () => (lastWasHit = false),
      });
      g.startNewGame();
      let wait = 2;
      let guard = 0;
      while (g.phase === "playing" && guard++ < 200000) {
        wait -= 1 / 60;
        if (g.canThrow && g.enemies.length > 0 && wait <= 0) {
          // 2 秒おきに、8 割は一番下の敵の正解、2 割はハズレを投げる
          wait = 2;
          const answers = new Set(g.enemies.map((e) => e.problem.answer));
          const wrong = g.stock.findIndex((v) => v !== null && !answers.has(v));
          const low = g.stock.indexOf(g.lowestEnemy()!.problem.answer);
          g.throwBall(rng() < 0.8 || wrong < 0 ? low : wrong);
        }
        const flying = g.flying !== null;
        g.update(1 / 60);
        if (flying && g.flying === null && g.phase === "playing" && lastWasHit) {
          const answers = new Set(g.ballProblems().map((p) => p.answer));
          const last = g.stock.length - 1;
          newest++;
          if (answers.has(g.stock[last]!)) newestCorrect++;
          for (const v of g.stock.slice(0, last)) {
            others++;
            if (v !== null && answers.has(v)) othersCorrect++;
          }
        }
      }
    }
    const newestRate = newestCorrect / newest;
    const othersRate = othersCorrect / others;
    // 直す前は 右端 約 85% / ほかの玉 約 10% だった
    expect(Math.abs(newestRate - othersRate)).toBeLessThan(0.12);
  });
});

describe("throw motion", () => {
  it("「ため」の間は飛ばず、その後に手の位置から飛んでいく", () => {
    const g = new Game();
    g.startNewGame();
    g.throwBall(correctSlot(g));
    g.update(BALL.windup / 2);
    expect(g.flying!.t).toBe(0);
    g.update(BALL.windup);
    expect(g.flying!.t).toBeGreaterThan(0);
  });

  it("ハズレの玉は曲がりながら上へ飛び、画面外に消える", () => {
    const g = new Game();
    g.startNewGame();
    const answers = new Set(g.enemies.map((e) => e.problem.answer));
    g.throwBall(g.stock.findIndex((v) => v !== null && !answers.has(v)));
    let maxSide = 0;
    while (g.flying) {
      maxSide = Math.max(maxSide, Math.abs(g.flying.x - LAUNCH_POS.x));
      g.update(1 / 60);
    }
    // 真上に向かう線から横にずれている＝曲がっている
    expect(maxSide).toBeGreaterThan(20);
    expect(g.defeatedCount).toBe(0);
  });
});

describe("pause", () => {
  it("ポーズ中は敵も玉も止まり、再開すると続きから動く", () => {
    const g = new Game();
    g.startNewGame();
    run(g, 2);
    g.throwBall(correctSlot(g));
    run(g, 0.1);
    expect(g.pause()).toBe(true);
    expect(g.phase).toBe("paused");
    const enemyY = g.enemies.map((e) => e.y);
    const ball = { ...g.flying! };
    // 長く止めていてもゲームオーバーにならない
    run(g, 300);
    expect(g.phase).toBe("paused");
    expect(g.enemies.map((e) => e.y)).toEqual(enemyY);
    expect(g.flying).toEqual(ball);
    expect(g.throwBall(0)).toBe(false);
    g.resume();
    expect(g.phase).toBe("playing");
    run(g, 0.1);
    expect(g.enemies[0].y).toBeGreaterThan(enemyY[0]);
  });

  it("やめるとタイトルへ戻る", () => {
    const g = new Game();
    g.startNewGame();
    g.pause();
    g.quit();
    expect(g.phase).toBe("title");
    expect(g.enemies).toHaveLength(0);
  });

  it("プレイ中以外ではポーズできない", () => {
    const g = new Game();
    expect(g.pause()).toBe(false);
    g.quit();
    expect(g.phase).toBe("title");
  });
});

describe("combo bonus", () => {
  it("倍率は 1 回目 ×1.0 から 0.1 ずつ上がり、×2.0 で止まる", () => {
    expect(comboMultiplier(1)).toBe(1);
    expect(comboMultiplier(2)).toBe(1.1);
    expect(comboMultiplier(5)).toBe(1.4);
    expect(comboMultiplier(11)).toBe(2);
    expect(comboMultiplier(50)).toBe(2);
  });

  it("続けて当てると数え上がって得点が増え、ハズレで 0 に戻る", () => {
    const g = new Game();
    const gained: number[] = [];
    let last = 0;
    g.startNewGame();
    for (let i = 0; i < 3; i++) {
      while (g.enemies.length === 0) g.update(1 / 60);
      // 同じ高さで倒して比べられるよう、敵を同じ位置に置く
      g.enemies[0].y = 100;
      g.throwBall(correctSlot(g));
      while (g.flying) g.update(1 / 60);
      gained.push(g.score - last);
      last = g.score;
    }
    expect(g.streak).toBe(3);
    expect(gained[2]).toBeGreaterThan(gained[0]);

    while (g.enemies.length === 0) g.update(1 / 60);
    const answers = new Set(g.enemies.map((e) => e.problem.answer));
    g.throwBall(g.stock.findIndex((v) => v !== null && !answers.has(v)));
    while (g.flying) g.update(1 / 60);
    expect(g.streak).toBe(0);
  });

  it("新しいゲームで 0 に戻る", () => {
    const g = new Game();
    g.streak = 7;
    g.startNewGame();
    expect(g.streak).toBe(0);
  });
});

describe("defeatScore", () => {
  it("高い位置で倒すほど高得点、ステージが進むほど高得点", () => {
    const high = defeatScore(LAYOUT.hudHeight, 1);
    const low = defeatScore(LAYOUT.defenseLineY, 1);
    expect(high).toBeGreaterThan(low);
    expect(defeatScore(200, 3)).toBeGreaterThan(defeatScore(200, 1));
  });
});
