import { describe, expect, it } from "vitest";
import { Game, type Enemy, type FlyingBall } from "../src/game/game";
import { makeProblem } from "../src/game/problems";
import { EFFECT, Effects } from "../src/render/effects";

function enemy(id: number, y = 200): Enemy {
  return { id, problem: makeProblem(7, 8), lane: 0, x: 100, y };
}
const ball = { x: 100, y: 220 } as FlyingBall;
const idleGame = { flying: null, enemies: [], phase: "playing", score: 0 } as unknown as Game;

function run(fx: Effects, game: Game, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) fx.update(1 / 60, game);
}

describe("Effects", () => {
  it("れんぞくはハズレで 0 に戻る", () => {
    const fx = new Effects(() => 0.5);
    fx.onHit(enemy(1), 100, ball);
    fx.onHit(enemy(2), 100, ball);
    fx.onHit(enemy(3), 100, ball);
    expect(fx.streak).toBe(3);
    fx.onMiss();
    expect(fx.streak).toBe(0);
  });

  it("得点は数字が上のバーに着いてから数え上がる", () => {
    const fx = new Effects(() => 0.5);
    fx.onStageStart(0);
    fx.onHit(enemy(1), 230, ball);
    run(fx, idleGame, EFFECT.scoreFlyTime / 2);
    expect(fx.shownScore).toBe(0);
    run(fx, idleGame, 2);
    expect(fx.shownScore).toBe(230);
  });

  it("プレイ中以外は本当の得点を出す（クリアボーナスなど）", () => {
    const fx = new Effects();
    fx.onStageStart(0);
    expect(fx.displayScore({ phase: "stageClear", score: 1500 } as Game)).toBe(1500);
    expect(fx.displayScore({ phase: "playing", score: 1500 } as Game)).toBe(0);
  });

  it("ハズレの玉が雲を通り抜けると、その雲が「ぽよん」と揺れる", () => {
    const fx = new Effects();
    const e = enemy(5);
    const flying = { targetId: null, t: 0.5, x: 100, y: 222 } as FlyingBall;
    const game = { flying, enemies: [e], phase: "playing", score: 0 } as unknown as Game;
    fx.update(1 / 60, game);
    fx.update(1 / 60, game);
    expect(fx.enemyScale(5)).not.toEqual([1, 1]);
    run(fx, game, EFFECT.wobbleTime + 0.1);
    // 同じ玉で同じ雲は 1 回だけ揺れる
    expect(fx.enemyScale(5)).toEqual([1, 1]);
  });

  it("実際のゲームで命中すると式の演出が出て、ゲームの得点は演出と関係なく入る", () => {
    const fx = new Effects();
    const g = new Game(undefined, {
      onHit: (en, p, b) => fx.onHit(en, p, b),
      onStageStart: () => fx.onStageStart(g.score),
    });
    g.startNewGame();
    const answers = new Set(g.enemies.map((x) => x.problem.answer));
    g.throwBall(g.stock.findIndex((v) => v !== null && answers.has(v)));
    while (g.flying) g.update(1 / 60);
    expect(g.score).toBeGreaterThan(0);
    expect(fx.streak).toBe(1);
    expect(fx.shownScore).toBe(0);
  });
});
