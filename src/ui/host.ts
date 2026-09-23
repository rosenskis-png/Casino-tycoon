// Runs the fixed-timestep loop: advances the sim by whole ticks at the chosen speed, flushes events to
// listeners, and draws a frame with sub-tick interpolation. Faster speeds run more ticks, never bigger ones.
import { TICKS_PER_SECOND, type Game, type Speed } from "../sim";
import { Renderer, type DrawOptions } from "../render/renderer";
import { Camera } from "../render/camera";

const MAX_TICKS_PER_FRAME = 40;

export class Host {
  game: Game;
  readonly renderer: Renderer;
  readonly camera = new Camera();
  speed: Speed = 1;
  drawOptions: DrawOptions = {};
  /** Shows hidden values and field overlays (engine testing; players earn these through research later). */
  debug = false;
  /** Rolling frame stats for the debug panel. */
  stats = { fps: 0, simMs: 0, drawMs: 0, ticksPerFrame: 0 };
  private acc = 0;
  private last = 0;
  private raf = 0;
  private frames = 0;
  private fpsT = 0;
  private listeners = new Set<() => void>();
  private gameListeners = new Set<(g: Game) => void>();
  private uiT = 0;

  constructor(public canvas: HTMLCanvasElement, game: Game) {
    this.renderer = new Renderer(canvas);
    this.game = game;
    this.setGame(game);
  }

  setGame(g: Game) {
    this.game = g;
    this.renderer.setGame(g);
    this.camera.cx = g.state.map.w / 2;
    this.camera.cy = g.state.map.h / 2 + 4;
    this.acc = 0;
    for (const l of this.gameListeners) l(g);
    this.notify();
  }

  onGame(fn: (g: Game) => void) { this.gameListeners.add(fn); return () => { this.gameListeners.delete(fn); }; }
  /** UI refresh subscription (called ~5× a second and on demand). */
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  notify() { for (const l of this.listeners) l(); }

  setSpeed(s: Speed) { this.speed = s; this.notify(); }

  start() {
    const loop = (now: number) => { this.frame(now); this.raf = requestAnimationFrame(loop); };
    this.last = performance.now();
    this.raf = requestAnimationFrame(loop);
  }
  stop() { cancelAnimationFrame(this.raf); }

  private frame(now: number) {
    const dt = Math.min(100, now - this.last);
    this.last = now;
    const g = this.game;
    let n = 0;
    const t0 = performance.now();
    if (this.speed > 0) {
      this.acc += (dt / 1000) * TICKS_PER_SECOND * this.speed;
      n = Math.floor(this.acc);
      if (n > MAX_TICKS_PER_FRAME) { n = MAX_TICKS_PER_FRAME; this.acc = n; }
      for (let k = 0; k < n; k++) g.step();
      this.acc -= n;
    }
    const t1 = performance.now();
    g.bus.flush();
    const rect = this.canvas.getBoundingClientRect();
    this.renderer.draw(this.camera, rect.width, rect.height, window.devicePixelRatio || 1, this.speed > 0 ? this.acc : 0, this.drawOptions);
    const t2 = performance.now();
    const k = 0.1;
    this.stats.simMs += (t1 - t0 - this.stats.simMs) * k;
    this.stats.drawMs += (t2 - t1 - this.stats.drawMs) * k;
    this.stats.ticksPerFrame += (n - this.stats.ticksPerFrame) * k;
    this.frames++;
    if (now - this.fpsT >= 1000) { this.stats.fps = (this.frames * 1000) / (now - this.fpsT); this.frames = 0; this.fpsT = now; }
    if (now - this.uiT >= 200) { this.uiT = now; this.notify(); }
  }
}
