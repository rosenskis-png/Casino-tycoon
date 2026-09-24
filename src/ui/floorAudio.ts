// The floor as heard from the camera (docs/spec/audio.md): sounds fade with distance from the middle of the view
// and with zoom, and pan left or right; an ambient murmur follows the crowd in view; game rounds on screen
// make their sounds (a few at a time); nightclubs play their track from the dance floor and show lounges play
// during a show. Reads the sim, never writes it.
import { OBJECTS } from "../data/objects";
import { CLUB_TRACKS, SHOW_TRACK } from "../data/music";
import { play, setAmbient } from "../platform/audio";
import { MusicPlayer } from "../platform/music";
import { showPhase, type PlacedObject } from "../sim";
import type { Host } from "./host";

/** How much of the floor you hear at each zoom level (close … overview). */
const ZOOM_GAIN = [1, 0.85, 0.55, 0.3];
/** Sound of a round finishing at a game, by table family ("slot" for machines). */
const ROUND_SOUND: Record<string, string> = { slot: "reels", vpoker: "card", blackjack: "cards", baccarat: "cards", poker: "chips", roulette: "spin", keno: "ball", bingo: "ball", sports: "roar" };

const centre = (o: PlacedObject) => ({ x: o.x + (o.w ?? 1) / 2, y: o.y + (o.h ?? 1) / 2 });

export class FloorAudio {
  /** Off on the title screen. Ducked while you play a game yourself. */
  enabled = true;
  duck = 1;
  private seen = new Map<number, number>();
  private music = new Map<number, { p: MusicPlayer; track: string }>();
  private shows = new Map<number, string>();
  private timer: number;

  constructor(private host: Host) {
    this.timer = window.setInterval(() => this.update(), 200);
  }

  dispose() { clearInterval(this.timer); this.silence(); }

  /** Gain (0-1) and pan for a sound at tile (x, y), heard from the camera; `reach` stretches the distance. */
  place(x: number, y: number, reach = 1): { gain: number; pan: number } {
    const cam = this.host.camera, r = this.host.canvas.getBoundingClientRect();
    const hw = Math.max(1, r.width / 2 / cam.tilePx), hh = Math.max(1, r.height / 2 / cam.tilePx);
    const nx = (x - cam.cx) / hw, ny = (y - cam.cy) / hh, d = Math.hypot(nx, ny) / reach;
    const near = d <= 1 ? 1 - 0.35 * d : Math.max(0, 0.65 - 0.65 * (d - 1));
    return { gain: near * ZOOM_GAIN[cam.level] * this.duck, pan: Math.max(-1, Math.min(1, nx)) * 0.6 };
  }

  private silence() {
    setAmbient(0);
    for (const m of this.music.values()) m.p.stop();
    this.music.clear();
  }

  private update() {
    const h = this.host, g = h.game, s = g.state;
    if (!this.enabled || h.speed === 0) { this.silence(); return; }
    const cam = h.camera, r = h.canvas.getBoundingClientRect();
    const hw = r.width / 2 / cam.tilePx, hh = r.height / 2 / cam.tilePx;
    const inView = (x: number, y: number) => Math.abs(x - cam.cx) <= hw + 1 && Math.abs(y - cam.cy) <= hh + 1;
    let crowd = 0;
    for (const a of s.agents) if (a.role === "guest" && !a.hidden && inView(a.x, a.y)) crowd++;
    const busy = Math.min(1, crowd / 30);
    setAmbient(busy * ZOOM_GAIN[cam.level] * this.duck);
    const rounds: { id: string; x: number; y: number }[] = [];
    const slots: PlacedObject[] = [], bars: PlacedObject[] = [];
    const wantMusic = new Map<number, { track: string; gain: number; pan: number }>();
    for (const o of s.objects) {
      const def = OBJECTS[o.kind], c = centre(o);
      if (def.slot || def.game) {
        const last = this.seen.get(o.id);
        this.seen.set(o.id, o.last.tick);
        const fam = def.slot ? "slot" : def.game!;
        if (last !== undefined && o.last.tick > last && inView(c.x, c.y) && ROUND_SOUND[fam]) rounds.push({ id: ROUND_SOUND[fam], ...c });
        if (def.slot && inView(c.x, c.y)) slots.push(o);
      } else if (def.serves === "thirst" && inView(c.x, c.y)) bars.push(o);
      else if (def.serves === "club" || def.serves === "show") {
        let track = "";
        if (def.serves === "club") track = CLUB_TRACKS[o.track ?? 0] ?? CLUB_TRACKS[0];
        else {
          const ph = showPhase(o, s.tick).phase, was = this.shows.get(o.id);
          this.shows.set(o.id, ph);
          if (was === "on" && ph !== "on" && inView(c.x, c.y)) play("applause", this.place(c.x, c.y));
          if (ph === "on") track = SHOW_TRACK;
        }
        if (!track) continue;
        const p = this.place(c.x, c.y, 1.4);
        if (p.gain > 0.03) wantMusic.set(o.id, { track, ...p });
      }
    }
    // A few round sounds at a time, whichever came up.
    for (let k = 0; k < 2 && rounds.length; k++) {
      const q = rounds.splice(Math.floor(Math.random() * rounds.length), 1)[0];
      const p = this.place(q.x, q.y);
      play(q.id, { gain: p.gain * 0.6, pan: p.pan });
    }
    // The machines' idle chimes and the bars' glassware, now and then, louder the busier it is.
    if (slots.length && Math.random() < 0.12 + 0.3 * busy) { const o = slots[Math.floor(Math.random() * slots.length)], c = centre(o), p = this.place(c.x, c.y); play("chime", { gain: p.gain * 0.5, pan: p.pan }); }
    if (bars.length && Math.random() < 0.1 * busy + 0.02) { const o = bars[Math.floor(Math.random() * bars.length)], c = centre(o), p = this.place(c.x, c.y); play("glass", p); }
    // Music: the two loudest sources play.
    const keep = [...wantMusic.entries()].sort((a, b) => b[1].gain - a[1].gain).slice(0, 2);
    const ids = new Set(keep.map(([id]) => id));
    for (const [id, m] of this.music) if (!ids.has(id) || m.track !== wantMusic.get(id)!.track) { m.p.stop(); this.music.delete(id); }
    for (const [id, w] of keep) {
      let m = this.music.get(id);
      if (!m) { m = { p: new MusicPlayer(w.track), track: w.track }; if (!m.p.start(w.gain, w.pan)) continue; this.music.set(id, m); }
      else m.p.place(w.gain, w.pan);
    }
    // Forget sold objects.
    if (this.seen.size > s.objects.length * 2) this.seen.clear();
  }
}
