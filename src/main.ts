import "./style.css";
import { AudioEngine, MIX } from "./audio/engine";
import { Vibrator, vibrationSupported } from "./audio/vibration";
import { Game, type Phase } from "./game/game";
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
const audio = new AudioEngine();
const vibrator = new Vibrator();

const ui: UiState = {
  settings: loadSettings(),
  vibrationSupported,
  balls: new BallView(),
  effects: new Effects(),
};

function applySettings(s: Settings): void {
  ui.settings = s;
  audio.setSfxVolume(s.seVolume);
  audio.setBgmVolume(s.bgmVolume);
  vibrator.enabled = s.vibration;
}
applySettings(ui.settings);

/** れんぞくの節目（この回数で特別な効果音） */
const isStreakMilestone = (n: number) => n === 3 || (n >= 5 && n % 5 === 0);

let prevPhase: Phase = "title";
const game = new Game(undefined, {
  onThrow: () => {
    audio.sfx("throw");
    ui.effects.onThrow();
  },
  onHit: (enemy, points, ball) => {
    ui.effects.onHit(enemy, points, ball, game.streak);
    audio.sfx("hit", ui.effects.streak);
    if (isStreakMilestone(ui.effects.streak)) audio.sfx("streak", ui.effects.streak);
    vibrator.play("hit");
  },
  onMiss: () => {
    audio.sfx("miss");
    ui.effects.onMiss();
  },
  onStageStart: () => {
    ui.balls.reset();
    ui.effects.onStageStart(game.score);
    audio.sfx("start");
  },
  onPhaseChange: (phase) => {
    // BGM の切り替え（演出 A1）
    switch (phase) {
      case "title":
        audio.playMusic("title");
        break;
      case "playing":
        if (prevPhase === "paused") audio.resumeMusic();
        // スタート・次のステージは、一瞬 BGM を止めて合図の音を聞かせてから始める
        else audio.playMusic("stage", game.stage, MIX.startGap);
        break;
      case "paused":
        audio.pauseMusic();
        break;
      case "stageClear":
        audio.stopMusic();
        audio.sfx("clear");
        break;
      case "gameOver":
        audio.stopMusic();
        audio.sfx("gameOver");
        vibrator.play("gameOver");
        break;
    }
    prevPhase = phase;
  },
});
// タイトルの曲。音は最初のタップのあとに鳴り始める
audio.playMusic("title");

// ほかのアプリに切り替えた・画面が消えたときは自動でポーズする
document.addEventListener("visibilitychange", () => {
  if (document.hidden) game.pause();
});

renderer.resize();
window.addEventListener("resize", () => renderer.resize());

canvas.addEventListener("pointerdown", (ev) => {
  ev.preventDefault();
  // 音はユーザー操作の中でないと鳴らせないブラウザがあるため、毎回ここで有効化する
  audio.unlock();
  audio.startPendingMusic();
  const { x, y } = renderer.toLogical(ev.clientX, ev.clientY);
  switch (game.phase) {
    case "title": {
      const b = hitButton(titleButtons(), x, y);
      if (b?.id === "start") {
        audio.sfx("tap");
        game.startNewGame(ui.settings.difficulty);
      } else if (b?.id === "settings") {
        audio.sfx("tap");
        game.openSettings();
      }
      break;
    }
    case "settings": {
      const b = hitButton(settingsLayout(ui.settings, vibrationSupported).buttons, x, y);
      if (b === null) break;
      if (b.id === "back") {
        audio.sfx("tap");
        game.backToTitle();
        break;
      }
      const next = applySettingButton(ui.settings, b.id);
      if (next === null) break;
      applySettings(next);
      // 保存は設定を変えたときだけ（起動時に保存すると、既定値を後で変えても反映されなくなる）
      saveSettings(next);
      // 変えた直後に確認できるよう、変更後の設定で鳴らす・震わせる
      // （効果音の音量は、命中の音で大きさを確かめられるようにする。BGM はタイトルの曲で確かめられる）
      if (b.id.startsWith("seVolume:")) audio.sfx("hit", 1);
      else audio.sfx("tap");
      if (b.id === "vibration:on") vibrator.play("hit");
      break;
    }
    case "playing": {
      if (hitButton([pauseButton()], x, y)) {
        audio.sfx("tap");
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
        audio.sfx("tap");
        game.resume();
      } else if (b?.id === "quit") {
        audio.sfx("tap");
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
  if (game.phase === "playing") {
    ui.balls.update(dt, game.stock);
    // 倒した数に合わせて BGM の楽器が増える
    audio.setIntensity(game.defeatedCount / game.params.enemiesToClear);
  }
  if (game.phase !== "paused") ui.effects.update(dt, game);
  renderer.draw(game, ui);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
