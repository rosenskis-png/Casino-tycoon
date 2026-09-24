// The title screen (docs/spec/audio.md): the main theme, continue or start a new game, and the sound mixer.
import { useEffect, useState, type ReactNode } from "react";
import { SCENARIOS } from "../data/scenarios";
import { SOUND_CATS } from "../data/sounds";
import { THEME_TRACK } from "../data/music";
import { onAudio, play, setSound, soundSettings, unlockAudio } from "../platform/audio";
import { MusicPlayer } from "../platform/music";

/** Master volume, mute and one slider per category. */
export function SoundSettings() {
  const [s, set] = useState(soundSettings());
  const upd = (n: Parameters<typeof setSound>[0]) => { setSound(n); set(soundSettings()); };
  return (
    <div className="kv mixer">
      <b>Sound</b>
      <span><button className={`btn ${s.muted ? "" : "on"}`} style={{ minHeight: 32 }} onClick={() => upd({ muted: !s.muted })}>{s.muted ? "Off" : "On"}</button></span>
      <b>Volume</b>
      <span><input type="range" min={0} max={1} step={0.05} value={s.master} onChange={(e) => upd({ master: Number(e.target.value) })} /></span>
      {SOUND_CATS.map((c) => (
        <Fragment2 key={c.id} name={c.name}>
          <input type="range" min={0} max={1} step={0.05} value={s.cats[c.id]} onChange={(e) => upd({ cat: [c.id, Number(e.target.value)] })} onPointerUp={() => play(c.id === "ui" ? "click" : c.id === "games" ? "reels" : c.id === "crowd" ? "cheer" : "chime")} />
        </Fragment2>
      ))}
    </div>
  );
}
function Fragment2({ name, children }: { name: string; children: ReactNode }) {
  return <><b>{name}</b><span>{children}</span></>;
}

export function TitleScreen({ hasGame, scenario, onContinue, onNew }: { hasGame: boolean; scenario: string; onContinue: () => void; onNew: (scenario: string) => void }) {
  const [awake, setAwake] = useState(false);
  const [pane, setPane] = useState<"" | "new" | "sound">("");
  const [pick, setPick] = useState(scenario in SCENARIOS && !SCENARIOS[scenario].hidden ? scenario : Object.values(SCENARIOS).find((s) => !s.hidden)!.id);
  useEffect(() => {
    if (!awake) return;
    const theme = new MusicPlayer(THEME_TRACK);
    const off = onAudio(() => theme.start(1));
    return () => { off(); theme.stop(1.2); };
  }, [awake]);
  const wake = () => { if (!awake) { unlockAudio(); setAwake(true); } };
  const go = (f: () => void) => { play("click"); f(); };
  return (
    <div className="title" onPointerDown={wake}>
      <div className="marquee">
        <div className="bulbs" />
        <h1>CASINO<br />TYCOON</h1>
        <div className="bulbs" />
      </div>
      {!awake && <p className="tap">Tap to start</p>}
      {awake && pane === "" && (
        <div className="menu">
          <button className="btn big" onClick={() => go(onContinue)}>{hasGame ? "Continue" : "Play"}</button>
          <button className="btn big" onClick={() => go(() => setPane("new"))}>New game</button>
          <button className="btn big" onClick={() => go(() => setPane("sound"))}>Sound</button>
        </div>
      )}
      {awake && pane === "new" && (
        <div className="menu">
          {Object.values(SCENARIOS).filter((s) => !s.hidden).map((s) => (
            <button key={s.id} className={`btn big ${pick === s.id ? "on" : ""}`} onClick={() => go(() => setPick(s.id))}>{s.name}<small>{s.blurb}</small></button>
          ))}
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn" onClick={() => go(() => setPane(""))}>Back</button>
            <button className="btn danger" onClick={() => { if (!hasGame || confirm("Start a new game? Your autosave will be replaced.")) go(() => onNew(pick)); }}>Start</button>
          </div>
        </div>
      )}
      {awake && pane === "sound" && (
        <div className="menu">
          <SoundSettings />
          <button className="btn" onClick={() => go(() => setPane(""))}>Back</button>
        </div>
      )}
    </div>
  );
}
