/**
 * ゲームの調整可能パラメータ。
 * 難易度・スコアのバランス調整はこのファイルだけで行えるようにする。
 */

/** 論理解像度（縦画面） */
export const VIEW = {
  width: 360,
  height: 640,
} as const;

/** 画面レイアウト（論理座標） */
export const LAYOUT = {
  /** 敵がここまで降りてきたらゲームオーバー（敵の下端で判定） */
  defenseLineY: 520,
  /** プレイヤーの中心 Y */
  playerY: 548,
  /** 玉スロットの中心 Y */
  ballSlotY: 605,
  /** 玉の半径 */
  ballRadius: 26,
  /** 敵の幅・高さ */
  enemyWidth: 78,
  enemyHeight: 44,
  /** 敵の出現レーン数 */
  laneCount: 4,
  /** 敵の出現 Y（敵の上端。画面外から入ってくる） */
  enemySpawnY: -44,
  /** HUD の高さ（敵の高さボーナス計算の上端） */
  hudHeight: 40,
} as const;

export const BALL = {
  /** ストックの玉の数 */
  stockSize: 5,
  /** 投げた玉の速さ（px/秒） */
  speed: 600,
  /**
   * 投げるまでの「ため」（秒）。玉を手に取って頭の上に持ち上げる時間。
   * この間は玉が飛ばないので、そのぶん届くのが遅くなる（演出 U3）
   */
  windup: 0.15,
  /**
   * 軌道の曲がり具合（演出 U2）。発射点から終点までの距離に対する、
   * 曲線の制御点の横ずれの割合。0 でまっすぐ。曲がる向きは投げるたびにランダム
   */
  curve: 0.25,
} as const;

export const SPAWN = {
  /**
   * 新しい敵の問題を、手持ちのハズレの玉に合わせて選ぶ確率。
   * 高いほど、もとからある玉があとから正解に変わりやすくなり、
   * 「補充されたばかりの玉が正解」という偏りが小さくなる
   */
  matchHeldProbability: 0.7,
} as const;

export const SCORE = {
  /** 敵 1 匹の基本点 */
  basePoints: 100,
  /**
   * 高さボーナスの最大倍率。
   * 防衛ライン上で倒すと ×1、画面最上部で倒すと ×(1 + heightBonusMax)
   */
  heightBonusMax: 2,
  /** ステージが 1 進むごとに加算される得点倍率 */
  stageMultiplierStep: 0.25,
  /** ステージクリアボーナス（× ステージ番号） */
  clearBonusPerStage: 500,
  /**
   * コンボボーナス: ハズレなしで続けて当てると、1 回ごとに得点倍率がこれだけ上がる
   * （1 回目 ×1.0、2 回目 ×1.1 …）。ハズレで ×1.0 に戻る
   */
  comboStep: 0.1,
  /** コンボボーナスの上限倍率 */
  comboMax: 2,
} as const;

/** 1 ステージの設定 */
export interface StageParams {
  /** クリアに必要な撃破数（＝そのステージで出現する敵の総数） */
  enemiesToClear: number;
  /** 敵の落下速度（px/秒） */
  enemySpeed: number;
  /** 敵の出現間隔（秒） */
  spawnInterval: number;
  /** 画面上の最大同時出現数 */
  maxEnemiesOnScreen: number;
  /** 出題する段（1〜9） */
  dans: number[];
  /** 補充時に正解玉（画面上の敵の答え）を選ぶ確率 */
  correctProbability: number;
  /** 得点倍率（難易度による） */
  scoreMultiplier: number;
}

export type Difficulty = "easy" | "normal" | "hard";

export const DIFFICULTIES: readonly Difficulty[] = ["easy", "normal", "hard"];

export interface DifficultyParams {
  /** 画面表示名 */
  label: string;
  /** 敵の落下速度の倍率 */
  speedScale: number;
  /** 敵の出現間隔の倍率（大きいほどゆっくり出る） */
  spawnIntervalScale: number;
  /** 最大同時出現数の増減 */
  maxEnemiesDelta: number;
  /** 補充時に正解玉を選ぶ確率 */
  correctProbability: number;
  /** 得点倍率（難しいほど高得点） */
  scoreMultiplier: number;
}

/** 難易度ごとの補正 */
export const DIFFICULTY: Record<Difficulty, DifficultyParams> = {
  easy: {
    label: "やさしい",
    speedScale: 1,
    spawnIntervalScale: 1,
    maxEnemiesDelta: 0,
    correctProbability: 0.4,
    scoreMultiplier: 1,
  },
  normal: {
    label: "ふつう",
    speedScale: 1.4,
    spawnIntervalScale: 0.75,
    maxEnemiesDelta: 1,
    correctProbability: 0.3,
    scoreMultiplier: 1.5,
  },
  hard: {
    label: "むずかしい",
    speedScale: 1.8,
    spawnIntervalScale: 0.6,
    maxEnemiesDelta: 2,
    correctProbability: 0.25,
    scoreMultiplier: 2,
  },
};

const ALL_DANS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * ステージ番号（1 始まり）と難易度から、そのステージの設定を決める。
 * ステージが進むほど速く・多く・頻繁になる（上限あり）。
 * 下の数値は「やさしい」の値（補正なし）で、難易度の補正を掛けて使う。
 */
export function stageParams(stage: number, difficulty: Difficulty = "easy"): StageParams {
  const n = Math.max(0, stage - 1);
  const d = DIFFICULTY[difficulty];
  const speed = Math.min(18 + n * 4, 60);
  const interval = Math.max(3.2 - n * 0.3, 1.0);
  const maxEnemies = Math.min(4 + Math.floor(n / 2), 8);
  return {
    enemiesToClear: 20,
    enemySpeed: speed * d.speedScale,
    spawnInterval: interval * d.spawnIntervalScale,
    maxEnemiesOnScreen: Math.max(2, maxEnemies + d.maxEnemiesDelta),
    dans: ALL_DANS,
    correctProbability: d.correctProbability,
    scoreMultiplier: d.scoreMultiplier,
  };
}
