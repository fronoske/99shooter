/** バイブレーション。Android の Chrome などで対応。iPhone の Safari は非対応 */
export const vibrationSupported: boolean =
  typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

export type VibrationName = "hit" | "gameOver";

const PATTERNS: Record<VibrationName, number | number[]> = {
  hit: 30,
  gameOver: [120, 60, 240],
};

export class Vibrator {
  enabled = true;

  play(name: VibrationName): void {
    if (!this.enabled || !vibrationSupported) return;
    try {
      navigator.vibrate(PATTERNS[name]);
    } catch {
      // 非対応環境では何もしない
    }
  }
}
