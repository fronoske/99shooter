import "./style.css";
import { SoundPlayer } from "./audio/sound";
import { Vibrator, vibrationSupported } from "./audio/vibration";
import { Game } from "./game/game";
import { BallView } from "./render/ballView";
import { Effects } from "./render/effects";
import { Renderer, type UiState } from "./render/renderer";
import { loadSettings, saveSettings, type Settings } from "./settings";
import {
  applySettingButton,
  hitButton,
  pauseButton,
  pauseMenuButtons,
  settingsLayout,
  titleButtons,
} from "./ui/buttons";

/** 画面遷移直後の誤タップを防ぐ待ち時間（秒） */
const TAP_GUARD = 0.8;
/** 1 フレームの最大経過時間（タブ復帰時などの飛びを防ぐ） */
const MAX_DT = 1 / 20;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const sound = new SoundPlayer();
const vibrator = new Vibrator();

const ui: UiState = {
  settings: loadSettings(),
  vibrationSupported,
  balls: new BallView(),
  effects: new Effects(),
};

function applySettings(s: Settings): void {
  ui.settings = s;
  sound.enabled = s.se;
  vibrator.enabled = s.vibration;
}
applySettings(ui.settings);

const game = new Game(undefined, {
  onThrow: () => {
    sound.play("throw");
    ui.effects.onThrow();
  },
  onHit: (enemy, points, ball) => {
    sound.play("hit");
    vibrator.play("hit");
    ui.effects.onHit(enemy, points, ball);
  },
  onMiss: () => {
    sound.play("miss");
    ui.effects.onMiss();
  },
  onStageStart: () => {
    ui.balls.reset();
    ui.effects.onStageStart(game.score);
  },
  onPhaseChange: (phase) => {
    if (phase === "stageClear") sound.play("clear");
    if (phase === "gameOver") {
      sound.play("gameOver");
      vibrator.play("gameOver");
    }
  },
});

// ほかのアプリに切り替えた・画面が消えたときは自動でポーズする
document.addEventListener("visibilitychange", () => {
  if (document.hidden) game.pause();
});

renderer.resize();
window.addEventListener("resize", () => renderer.resize());

canvas.addEventListener("pointerdown", (ev) => {
  ev.preventDefault();
  // 音はユーザー操作の中でないと鳴らせないブラウザがあるため、毎回ここで有効化する
  sound.unlock();
  const { x, y } = renderer.toLogical(ev.clientX, ev.clientY);
  switch (game.phase) {
    case "title": {
      const b = hitButton(titleButtons(), x, y);
      if (b?.id === "start") {
        sound.play("tap");
        game.startNewGame(ui.settings.difficulty);
      } else if (b?.id === "settings") {
        sound.play("tap");
        game.openSettings();
      }
      break;
    }
    case "settings": {
      const b = hitButton(settingsLayout(ui.settings, vibrationSupported).buttons, x, y);
      if (b === null) break;
      if (b.id === "back") {
        sound.play("tap");
        game.backToTitle();
        break;
      }
      const next = applySettingButton(ui.settings, b.id);
      if (next === null) break;
      applySettings(next);
      // 保存は設定を変えたときだけ（起動時に保存すると、既定値を後で変えても反映されなくなる）
      saveSettings(next);
      // オンにした直後に確認できるよう、変更後の設定で鳴らす・震わせる
      sound.play("tap");
      if (b.id === "vibration:on") vibrator.play("hit");
      break;
    }
    case "playing": {
      if (hitButton([pauseButton()], x, y)) {
        sound.play("tap");
        game.pause();
        break;
      }
      // 見えている位置（転がっている途中も含む）で、押された玉を探す
      const slot = ui.balls.hitTest(x, y, game.stock);
      if (slot < 0) break;
      if (game.canThrow) {
        game.throwBall(slot);
      } else {
        // 玉が飛んでいる間は投げられない。押した玉が揺れて知らせる（演出 P8）
        const v = game.stock[slot];
        if (v !== null && v !== undefined) ui.balls.wiggle(v);
      }
      break;
    }
    case "paused": {
      const b = hitButton(pauseMenuButtons(), x, y);
      if (b?.id === "resume") {
        sound.play("tap");
        game.resume();
      } else if (b?.id === "quit") {
        sound.play("tap");
        game.quit();
      }
      break;
    }
    case "stageClear":
      if (game.phaseTime > TAP_GUARD) game.startNextStage();
      break;
    case "gameOver":
      if (game.phaseTime > TAP_GUARD) game.backToTitle();
      break;
  }
});

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, MAX_DT);
  last = now;
  game.update(dt);
  // ポーズ中などは玉の転がりも止める
  if (game.phase === "playing") ui.balls.update(dt, game.stock);
  if (game.phase !== "paused") ui.effects.update(dt, game);
  renderer.draw(game, ui);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
