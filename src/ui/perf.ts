// Performance test: measures sim cost per tick and draw cost per frame at several crowd sizes of real guests on a
// throwaway free-play game, then estimates the most agents that hold 60 fps at each speed. Run it on the phone.
import { Game, TICKS_PER_SECOND } from "../sim";
import { Renderer } from "../render/renderer";
import { Camera } from "../render/camera";

export interface PerfResult {
  samples: { agents: number; simMsPerTick: number; drawMsClose: number; drawMsFar: number }[];
  maxAgents: Record<number, number>;
  budgetMs: number;
}

const SIZES = [250, 1000, 2500, 5000, 10_000, 20_000];
const BUDGET_MS = 12; // of 16.7 ms per 60 fps frame, leaving room for the browser and UI

const pause = () => new Promise((r) => setTimeout(r, 0));

export async function perfTest(vw: number, vh: number, onProgress?: (msg: string) => void): Promise<PerfResult> {
  const g = Game.create("sandbox", 99);
  const canvas = document.createElement("canvas");
  const r = new Renderer(canvas);
  r.setGame(g);
  const cam = new Camera(g.state.map.w / 2, g.state.map.h / 2);
  const dpr = window.devicePixelRatio || 1;
  const samples: PerfResult["samples"] = [];
  for (const N of SIZES) {
    onProgress?.(`Testing ${N} agents…`);
    await pause();
    while (g.state.agents.length < N) {
      const before = g.state.agents.length;
      g.dispatch({ type: "spawnGuests", n: Math.min(5000, N - before) });
      g.step();
      if (g.state.agents.length <= before) break;
    }
    for (let k = 0; k < 60; k++) g.step(); // let them spread
    let t = performance.now();
    for (let k = 0; k < 120; k++) g.step();
    const simMsPerTick = (performance.now() - t) / 120;
    g.bus.flush();
    const drawAt = (level: number) => {
      cam.level = level;
      r.draw(cam, vw, vh, dpr, 0.5);
      const t0 = performance.now();
      for (let k = 0; k < 20; k++) r.draw(cam, vw, vh, dpr, k / 20);
      return (performance.now() - t0) / 20;
    };
    const drawMsClose = drawAt(1);
    const drawMsFar = drawAt(3);
    samples.push({ agents: N, simMsPerTick, drawMsClose, drawMsFar });
  }
  const maxAgents: Record<number, number> = {};
  for (const speed of [1, 2, 4, 8]) {
    const tpf = (speed * TICKS_PER_SECOND) / 60;
    const cost = (s: PerfResult["samples"][number]) => tpf * s.simMsPerTick + Math.max(s.drawMsClose, s.drawMsFar);
    let best = 0;
    for (let k = 0; k < samples.length; k++) {
      const c = cost(samples[k]);
      if (c <= BUDGET_MS) { best = samples[k].agents; continue; }
      const prev = k ? samples[k - 1] : { agents: 0, simMsPerTick: 0, drawMsClose: 0, drawMsFar: 0 };
      const cp = cost(prev);
      best = Math.round(prev.agents + ((BUDGET_MS - cp) / (c - cp)) * (samples[k].agents - prev.agents));
      break;
    }
    const last = samples[samples.length - 1];
    if (best === last.agents) best = Math.round((BUDGET_MS / cost(last)) * last.agents); // extrapolate linearly
    maxAgents[speed] = Math.max(0, best);
  }
  return { samples, maxAgents, budgetMs: BUDGET_MS };
}
