import { LAYOUT, SCORE } from "../config";

export interface ScoreConfig {
  basePoints: number;
  heightBonusMax: number;
  stageMultiplierStep: number;
  clearBonusPerStage: number;
}

/** ステージの得点倍率 */
export function stageMultiplier(stage: number, cfg: ScoreConfig = SCORE): number {
  return 1 + Math.max(0, stage - 1) * cfg.stageMultiplierStep;
}

/**
 * 敵を倒したときの得点。
 * enemyCenterY が高い（小さい）ほど高得点。10 点単位に丸める。
 * multiplier は難易度による得点倍率。
 */
export function defeatScore(
  enemyCenterY: number,
  stage: number,
  multiplier: number = 1,
  cfg: ScoreConfig = SCORE,
  topY: number = LAYOUT.hudHeight,
  bottomY: number = LAYOUT.defenseLineY,
): number {
  const ratio = Math.min(1, Math.max(0, (bottomY - enemyCenterY) / (bottomY - topY)));
  const raw = cfg.basePoints * (1 + cfg.heightBonusMax * ratio) * stageMultiplier(stage, cfg) * multiplier;
  return Math.round(raw / 10) * 10;
}

export function clearBonus(stage: number, multiplier: number = 1, cfg: ScoreConfig = SCORE): number {
  return Math.round((cfg.clearBonusPerStage * stage * multiplier) / 10) * 10;
}
