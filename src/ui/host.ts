// Runs the fixed-timestep loop: advances the sim by whole ticks at the chosen speed, flushes events to
// listeners, and draws a frame with sub-tick interpolation. Faster speeds run more ticks, never bigger ones.
import { TICKS_PER_SECOND, objFootprint, type Game, type Speed } from "../sim";
import { Renderer, type DrawOptions } from "../render/renderer";
import { T } from "../data/terrain";
import { Camera } from "../render/camera";

const MAX_TICKS_PER_FRAME = 40;

export class Host {
  game: Game;
  readonly renderer: Renderer;
  readonly camera = new Camera();
  speed: Speed = 1;
  drawOptions: DrawOptions = {};
  /** (2026-09-26) Objects picked for a new group (ids), outlined on the floor. */
  picked: number[] = [];
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

  /** Outlines the picked objects (dropping any that are gone). */
  markPicked() {
    const g = this.game, w = g.state.map.w;
    this.picked = this.picked.filter((id) => g.objById.has(id));
    this.drawOptions.marks = this.picked.flatMap((id) => objFootprint(g.objById.get(id)!).map((p) => p.y * w + p.x));
  }

  setGame(g: Game) {
    this.game = g;
    this.picked = [];
    this.drawOptions.marks = null;
    this.renderer.setGame(g);
    // Start over the building and its way in (the lot can be far bigger than the screen).
    const m = g.state.map;
    let x0 = m.w, y0 = m.h, x1 = 0, y1 = 0;
    for (let i = 0; i < m.terrain.length; i++) if (m.terrain[i] === T.FLOOR && (!m.outdoor[i] || m.entrances.includes(i))) {
      const x = i % m.w, y = (i - x) / m.w;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const none = x0 > x1;
    this.camera.cx = none ? m.w / 2 : (x0 + x1 + 1) / 2;
    this.camera.cy = (none ? m.h / 2 : (y0 + y1 + 1) / 2) + 4;
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
    } else g.flushCommands(); // (Batch A, owner) Building works while paused.
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
