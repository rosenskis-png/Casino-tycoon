// Camera: center in tile units and one of four zoom levels (FOUNDATIONS §21). CSS pixels per tile per level;
// integer art scaling at 2× and 3× device pixel ratios for the three close levels.
export const ZOOM_PX = [64, 32, 16, 8] as const;
export const ZOOM_NAMES = ["Close", "Default", "Wide", "Overview"] as const;
export const DEFAULT_ZOOM = 1;

export class Camera {
  constructor(public cx = 0, public cy = 0, public level = DEFAULT_ZOOM) {}
  get tilePx() { return ZOOM_PX[this.level]; }
  /** Screen (CSS px) → tile coordinates (fractional). */
  toTile(sx: number, sy: number, vw: number, vh: number) {
    return { x: this.cx + (sx - vw / 2) / this.tilePx, y: this.cy + (sy - vh / 2) / this.tilePx };
  }
  clamp(w: number, h: number) {
    this.cx = Math.min(Math.max(this.cx, 0), w);
    this.cy = Math.min(Math.max(this.cy, 0), h);
  }
  /** Change level keeping the tile under (sx, sy) fixed on screen. */
  zoomAt(level: number, sx: number, sy: number, vw: number, vh: number) {
    level = Math.max(0, Math.min(ZOOM_PX.length - 1, level));
    if (level === this.level) return;
    const p = this.toTile(sx, sy, vw, vh);
    this.level = level;
    this.cx = p.x - (sx - vw / 2) / this.tilePx;
    this.cy = p.y - (sy - vh / 2) / this.tilePx;
  }
}
