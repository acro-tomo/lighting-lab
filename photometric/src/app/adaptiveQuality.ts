/**
 * 動的品質調整（Phase 2）。
 * フレーム時間のEMAを監視し、30fpsを下回ったら描画解像度スケールを段階的に
 * 下げ、余裕があれば（<18ms）戻す。ヒステリシス（クールダウン）で振動を防ぐ。
 * 照度計算・固定露出には一切影響しない（描画解像度のみ）。
 */
export class AdaptiveQuality {
  private emaMs = 16.7;
  private lastTime = 0;
  private cooldown = 0;
  private _scale = 1;

  constructor(
    private readonly onScaleChanged: (scale: number) => void,
    private readonly minScale = 0.6,
  ) {}

  get scale(): number {
    return this._scale;
  }

  /** 毎フレーム呼ぶ */
  tick(now: number): void {
    if (this.lastTime > 0) {
      const dt = Math.min(now - this.lastTime, 100);
      this.emaMs = this.emaMs * 0.9 + dt * 0.1;
    }
    this.lastTime = now;
    if (--this.cooldown > 0) return;

    if (this.emaMs > 33 && this._scale > this.minScale + 1e-3) {
      this._scale = Math.max(this.minScale, this._scale - 0.2);
      this.cooldown = 90; // 下げた直後は約1.5秒様子を見る
      this.onScaleChanged(this._scale);
    } else if (this.emaMs < 18 && this._scale < 1 - 1e-3) {
      this._scale = Math.min(1, this._scale + 0.2);
      this.cooldown = 180;
      this.onScaleChanged(this._scale);
    }
  }
}
