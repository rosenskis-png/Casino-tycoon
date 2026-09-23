/* =====================================================================
   CASINO TYCOON  v0.1.0
   ---------------------------------------------------------------------
   Single-file React build. This JSX is the source of truth; the HTML
   build is generated from it.

   SECTIONS
     1. CONFIG        constants and tuning knobs
     2. REGISTRIES    fields, archetypes, objects, staff, research,
                      thoughts, insurance, levels (pure data)
     3. UTILS         rng, grid helpers, pathfinding, line of sight
     4. FIELDS        hidden spatial fields (the psychology layer)
     5. SYSTEMS       sim modules with lifecycle hooks
     6. ENGINE        game creation, time stepping, commands
     7. PERSISTENCE   storage adapter, save schema, migrations
     8. RENDERER      canvas drawing (reads state, never mutates sim)
     9. UI            React components
    10. APP           root component

   EXTENSION RULES (follow these and nothing else needs touching)
     - New placeable: add to OBJECTS. Games need a `game` block;
       amenities need `serves`. Archetypes opt in via `games`.
     - New guest type: add to ARCHETYPES and to a level's arrival mix.
     - New hidden field: add to FIELDS/RUNTIME_FIELDS and compute it in
       section 4. Archetype `prefs` can reference it immediately.
     - New mechanic: add a system to SYSTEMS. Hooks: frame, minute,
       every5, every10, hour, day, layout.
     - New level: add to LEVELS with status "open".
     - Save shape change: bump SAVE_SCHEMA and add a MIGRATIONS entry.
     - UI never mutates game state directly; it calls CMD.* only.
   ===================================================================== */
import React, { useState, useEffect, useRef } from "react";

/* ============================ 1. CONFIG ============================ */
export const VERSION = "0.2.0";
const SAVE_SCHEMA = 2;
const SAVE_KEY = "casinoTycoon.save";
const PROGRESS_KEY = "casinoTycoon.progress";
const MS_PER_GAME_MIN = 500; // 1x speed: one game hour = 30 real seconds
const SPEEDS = [0, 1, 2, 4, 8];
const MAX_CATCHUP_MIN = 180; // cap per frame so tab switches can't freeze
const SELL_REFUND = 0.6;
const ASSET_VALUE = 0.6; // casino value counts installed assets at 60%
const HANDPAY_THRESHOLD = 1200;
const NEED_THRESH = { bladder: 70, thirst: 65, hunger: 72 };
const NEED_CRIT = 90;
const WALK_TILES_PER_MIN = 1.6;
const STAFF_TILES_PER_MIN = 1.9;
const THOUGHT_INTERVAL = 45;
const MAX_NEWS = 40;
const INS_LOAD = 1.35; // insurer's markup over expected jackpot cost

/* =========================== 2. REGISTRIES ========================== */
// Hidden spatial fields, 0..100 per tile. Overlay colors are RGB.
const FIELDS = {
  TRF: { label: "Foot traffic", color: [80, 170, 255] },
  NRG: { label: "Noise and energy", color: [255, 96, 96] },
  PRS: { label: "Prestige", color: [255, 205, 80] },
  PRV: { label: "Privacy", color: [185, 125, 255] },
  EXV: { label: "Exit visibility", color: [110, 230, 140] },
  SRV: { label: "Surveillance", color: [90, 225, 225] },
  CRW: { label: "Crowding", color: [255, 150, 60] },
  DIRT: { label: "Dirt", color: [176, 124, 62] },
};
// Arrays allocated in the runtime (DIRT lives in saved state instead).
const RUNTIME_FIELDS = ["TRF", "NRG", "PRS", "PRV", "EXV", "SRV", "SRVV", "SRVH", "CRW", "ENC", "PRS0"];
const BASE_OVERLAYS = ["TRF", "DIRT"];

// prefs: weight per field (+ seeks high, - seeks low). SRVV = visible security.
// games: appeal per game object id. hours: 24 arrival weights.
const ARCHETYPES = {
  RET: {
    name: "Retiree", color: "#9ab8ff", budget: [60, 160], stay: [120, 300], speed: 0.8,
    needs: { bladder: 0.3, hunger: 0.15, thirst: 0.2, fatigue: 0.22 },
    prefs: { TRF: -1, PRV: 1, SRVV: 1, CRW: -1 },
    games: { penny: 1, classic: 0.8, vp: 0.3, prog: 0.6, blackjack: 0.2, roulette: 0.5 }, tableBet: 1,
    hours: [0.1, 0.05, 0.05, 0.05, 0.1, 0.2, 0.4, 0.7, 1, 1, 1, 1, 1, 1, 1, 0.9, 0.7, 0.5, 0.4, 0.3, 0.2, 0.15, 0.1, 0.1],
    atm: 0.05, tilt: 0.1, valueExpect: 1.6, satStart: [55, 70],
  },
  LOC: {
    name: "Local", color: "#ffd36b", budget: [80, 260], stay: [90, 240], speed: 1,
    needs: { bladder: 0.22, hunger: 0.16, thirst: 0.3, fatigue: 0.18 },
    prefs: { TRF: -1, PRV: 1, CRW: -1 },
    games: { penny: 0.4, classic: 0.8, vp: 1, prog: 0.5, blackjack: 0.7, roulette: 0.3, poker: 0.6 }, tableBet: 1.5,
    hours: [0.6, 0.5, 0.4, 0.3, 0.2, 0.2, 0.2, 0.3, 0.4, 0.5, 0.5, 0.6, 0.6, 0.6, 0.6, 0.7, 0.9, 1, 1, 1, 1, 0.9, 0.8, 0.7],
    atm: 0.2, tilt: 0.2, valueExpect: 1.5, satStart: [50, 65],
  },
  TOU: {
    name: "Tourist", color: "#7dffb0", budget: [100, 400], stay: [45, 150], speed: 1.1,
    needs: { bladder: 0.22, hunger: 0.2, thirst: 0.32, fatigue: 0.2 },
    prefs: { TRF: 1, NRG: 1, PRS: 1, EXV: 1, CRW: 0.5 },
    games: { penny: 1, classic: 0.4, vp: 0.2, prog: 0.9, blackjack: 0.6, roulette: 0.9, poker: 0.2 }, tableBet: 1.5,
    hours: [0.5, 0.3, 0.1, 0.05, 0.05, 0.05, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.6, 0.6, 0.6, 0.7, 0.8, 0.9, 1, 1, 1, 0.9, 0.7],
    atm: 0.3, tilt: 0.3, valueExpect: 0.9, satStart: [60, 75],
  },
  CHS: {
    name: "Chaser", color: "#ff8a7a", budget: [150, 600], stay: [180, 480], speed: 1,
    needs: { bladder: 0.2, hunger: 0.14, thirst: 0.3, fatigue: 0.14 },
    prefs: { NRG: 1, PRV: 1, EXV: -1, SRVV: -1 },
    games: { penny: 0.8, classic: 0.4, vp: 0.6, prog: 1, blackjack: 0.8, roulette: 0.8, poker: 0.4 }, tableBet: 3,
    hours: [0.8, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.3, 0.4, 0.5, 0.5, 0.5, 0.6, 0.6, 0.6, 0.6, 0.7, 0.8, 0.9, 1, 1, 1, 1, 0.9],
    atm: 0.75, tilt: 0.8, valueExpect: 0.7, satStart: [50, 65],
  },
  // Cheats look like tourists until caught. They avoid VISIBLE security only;
  // hidden cameras still catch them (detection uses total SRV).
  CHT: {
    name: "Slot cheat", color: "#c79bff", disguise: "TOU", cheat: true, budget: [40, 80], stay: [60, 150], speed: 1,
    needs: { bladder: 0.1, hunger: 0.05, thirst: 0.05, fatigue: 0.1 },
    prefs: { SRVV: -2, CRW: 1, NRG: 1 },
    games: { penny: 1, classic: 1, vp: 0.8, prog: 1 },
    hours: [0.9, 1, 1, 0.9, 0.6, 0.3, 0.2, 0.2, 0.2, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.9, 0.9, 0.9],
    atm: 0, tilt: 0, valueExpect: 0, satStart: [50, 50],
  },
};

// Guest appearance palettes. Cheats dress like tourists but always wear sunglasses.
const SKINS = ["#f3d0b0", "#e3b48c", "#c98f5f", "#9a6440", "#6b4228"];
const HAIRS = ["#2a1a12", "#4b2e1a", "#7b4a24", "#c8a060", "#161616", "#8a3020"];
const LOOKS = {
  RET: { hair: ["#e8e8e8", "#c9c9c9", "#b9b4d8", "#d8d0c0"], style: ["short", "short", "curly", "bald"], shirt: ["#a8d8c0", "#d8b0d8", "#f0c0a0", "#b0c8f0", "#f0e0a0"], pants: ["#c8b48c", "#8c8c9c", "#e8e0d0"], hat: ["visor", null, null, null] },
  LOC: { hair: HAIRS, style: ["short", "long", "short", "bald"], shirt: ["#2c3e6b", "#6b2c3a", "#556b2f", "#5a5a5a", "#3a5a6b", "#8a6a3a"], pants: ["#2e4a7a", "#3a3a44"], hat: ["cap", null, null] },
  TOU: { hair: HAIRS, style: ["short", "long", "curly"], shirt: ["#ff6b6b", "#4ecdc4", "#ffd93d", "#ff9f43", "#48dbfb", "#ff78c4"], pants: ["#e8d8b0", "#6bb0d8", "#f0f0f0"], hat: ["sun", null, null, null], pattern: true, shorts: true },
  CHS: { hair: HAIRS, style: ["short", "bald", "long"], shirt: ["#2a2a30", "#3a3440", "#1e2a3a", "#402a2a"], pants: ["#2e4a7a", "#26262c"], hat: ["hood", null, null] },
};
const WORKER_LOOKS = {
  janitor: { shirt: "#7f8794", pants: "#6a717c", hat: "cap", hatColor: "#5a616c", prop: "mop" },
  security: { shirt: "#24397f", pants: "#161d33", hat: "cap", hatColor: "#1a2656", badge: true },
  tech: { shirt: "#3a3a44", vest: "#f08c1e", pants: "#2e3440", prop: "toolbox" },
  bartender: { shirt: "#f0ece0", vest: "#1a1a1a", pants: "#1a1a1a", bowtie: true },
  dealer: { shirt: "#f0ece0", vest: "#6b1a24", pants: "#1a1a1a", bowtie: true },
  cook: { shirt: "#f4f4f4", pants: "#3a3a3a", hat: "chef" },
  cashier: { shirt: "#2e5a3a", pants: "#2a2a2a", vest: "#1e3a26" },
};

// Everything guests use has seats: [dx, dy, faceX, faceY, kind] in the unrotated frame,
// where the object's front faces south. Offsets outside the footprint sit on the surrounding floor.
// kinds: stool (sit), chair (sit), stand, hidden (inside a building).
// art: which renderer draws it. rotatable: can face any direction. zone: player-sized area.
const SEAT_FRONT = [[0, 1, 0, -1, "stool"]];
const SEAT_TABLE = [[0, 2, 0, -1, "stool"], [1, 2, 0, -1, "stool"], [2, 2, 0, -1, "stool"], [-1, 1, 1, 0, "stool"], [3, 1, -1, 0, "stool"]];
const OBJECTS = {
  penny: {
    name: "Penny Video", cat: "slots", w: 1, h: 1, cost: 4500, upkeep: 14, color: "#b8325e", icon: "🍒", art: "slot",
    tall: true, rotatable: true, seats: SEAT_FRONT, nrg: 2, reliability: 16000, reels: ["cherry", "plum", "bell", "bar", "seven"],
    game: { bet: 0.8, sph: 550, hold: 0.1, vol: "low", top: { p: 1 / 60000, pay: 800 } },
    desc: "High hold, tall cabinet. Earns the most per tile and drains wallets fastest. Blocks sightlines.",
  },
  classic: {
    name: "Classic Reels", cat: "slots", w: 1, h: 1, cost: 5200, upkeep: 12, color: "#c9a227", icon: "🔔", art: "slot",
    tall: false, rotatable: true, seats: SEAT_FRONT, nrg: 1, reliability: 22000, reels: ["seven", "bar", "bell", "cherry"],
    game: { bet: 2, sph: 420, hold: 0.055, vol: "med", top: { p: 1 / 80000, pay: 2500 } },
    desc: "Dollar three-reel with a low cabinet. Locals and retirees settle in for long sessions.",
  },
  vp: {
    name: "Video Poker", cat: "slots", w: 1, h: 1, cost: 6000, upkeep: 12, color: "#2f7fd1", icon: "🃏", art: "vp",
    tall: false, rotatable: true, seats: SEAT_FRONT, nrg: 1, reliability: 24000,
    game: { bet: 1.25, sph: 650, hold: 0.03, vol: "low", top: { p: 1 / 40000, pay: 1000 } },
    desc: "Lowest hold on the floor. The local's game: long play per dollar.",
  },
  prog: {
    name: "Horseshoe Link", cat: "slots", w: 1, h: 1, cost: 9500, upkeep: 20, color: "#7a3fd1", icon: "🐎", art: "slot",
    tall: true, rotatable: true, seats: SEAT_FRONT, nrg: 3, reliability: 14000, reels: ["shoe", "seven", "bell", "bar"],
    game: { bet: 2, sph: 450, hold: 0.12, vol: "med", progressive: { seed: 5000, rate: 0.015, p: 1 / 220000 } },
    desc: "Linked progressive. Every link machine feeds one shared jackpot meter. Big lure, big liability.",
  },
  blackjack: {
    name: "Blackjack", cat: "tables", w: 3, h: 2, cost: 14000, upkeep: 20, wage: 18, color: "#1f6b45", icon: "🂡", art: "blackjack",
    rotatable: true, seats: SEAT_TABLE, nrg: 1.5,
    game: { table: "blackjack", bet: 10, hph: 70, hold: 0.0225 },
    desc: "Five stools and a dealer ($18 an hour). Low edge, steady action, and a magnet for card counters later on.",
  },
  roulette: {
    name: "Roulette", cat: "tables", w: 3, h: 2, cost: 16000, upkeep: 20, wage: 18, color: "#1f6b45", icon: "🎡", art: "roulette",
    rotatable: true, seats: SEAT_TABLE, nrg: 2.5,
    game: { table: "roulette", bet: 5, hph: 40, hold: 0.0526 },
    desc: "Five stools and a croupier ($18 an hour). A tourist favorite that livens up the floor around it.",
  },
  poker: {
    name: "Poker Table", cat: "tables", w: 3, h: 2, cost: 12000, upkeep: 15, wage: 16, color: "#1f6b45", icon: "♠️", art: "poker",
    rotatable: true, seats: [...SEAT_TABLE, [0, -1, 0, 1, "stool"], [2, -1, 0, 1, "stool"]], nrg: 1,
    game: { table: "poker", bet: 5, hph: 30, hold: 0, rake: 0.1, rakeCap: 4 },
    desc: "Players play each other and the house takes a rake. Zero risk, thin margin, needs two players to deal.",
  },
  restroom: {
    name: "Restrooms", cat: "amenity", w: 2, h: 2, cost: 8000, upkeep: 25, color: "#3f7f9a", icon: "🚻", art: "restroom",
    tall: true, rotatable: true, serves: "bladder", useMin: [4, 8],
    seats: [[0, 2, 0, -1, "hidden"], [0, 2, 0, -1, "hidden"], [1, 2, 0, -1, "hidden"], [1, 2, 0, -1, "hidden"]],
    desc: "Resets bladder. Doors face the front. Too far and guests leave; very close and they skip the walk past your machines.",
  },
  bar: {
    name: "Bar", cat: "amenity", w: 2, h: 2, cost: 8200, zone: { min: 2, max: 7 }, costBase: 5000, costTile: 800, upkeepBase: 15, upkeepTile: 3,
    color: "#8a4b2a", icon: "🍸", art: "bar", rotatable: true, nrg: 3, serves: "thirst", useMin: [15, 35], price: 7, margin: 0.7, intox: 16, litter: 0.2,
    tiers: [{ area: 4, label: "Bar" }, { area: 9, label: "Lounge", prs: 8, price: 1.25 }, { area: 16, label: "Grand bar", prs: 14, price: 1.5, nrg: 1.3 }],
    desc: "Drag to size it. A counter with stools, plus high-tops when it's deep enough. At 9 tiles it becomes a lounge, at 16 a grand bar. Drinks loosen bets and cause incidents.",
  },
  snack: {
    name: "Diner", cat: "amenity", w: 2, h: 2, cost: 6600, zone: { min: 2, max: 7 }, costBase: 4000, costTile: 650, upkeepBase: 12, upkeepTile: 3,
    color: "#b86a1f", icon: "🍔", art: "diner", rotatable: true, nrg: 1, serves: "hunger", useMin: [12, 20], price: 11, margin: 0.5, relief: 25, litter: 0.35,
    tiers: [{ area: 4, label: "Snack counter" }, { area: 9, label: "Diner", price: 1.2, relief: 10 }, { area: 16, label: "Buffet", prs: 4, price: 1.4, relief: 20 }],
    desc: "Drag to size it. A lunch counter, plus tables when it's deep enough. At 9 tiles it's a diner, at 16 a buffet that rests guests longer. Messy.",
  },
  atm: {
    name: "ATM", cat: "amenity", w: 1, h: 1, cost: 3000, upkeep: 5, color: "#3c8d5a", icon: "🏧", art: "atm",
    tall: false, rotatable: true, serves: "cash", seats: [[0, 1, 0, -1, "stand"]], useMin: [2, 3], fee: 3.5, prs: -8, prsR: 2,
    desc: "Lets broke guests keep playing. Chasers love it. Looks predatory up close.",
  },
  plant: {
    name: "Potted Palm", cat: "decor", w: 1, h: 1, cost: 500, upkeep: 1, color: "#2d6a3e", icon: "🌴", art: "plant",
    tall: false, prs: 10, prsR: 2, desc: "Raises prestige nearby.",
  },
  partition: {
    name: "Partition", cat: "decor", w: 1, h: 1, cost: 400, upkeep: 0, color: "#5b4636", icon: "▮", art: "partition",
    tall: true, soundBlock: true,
    desc: "Blocks sight and sound. Builds privacy, and also hides cheats from your guards.",
  },
  camera: {
    name: "Ceiling Camera", cat: "decor", w: 1, h: 1, cost: 2000, upkeep: 6, color: "#20303a", icon: "📷", art: "camera",
    walkable: true, srv: 75, srvR: 4,
    desc: "Hidden surveillance. Catches cheats without making anyone feel watched.",
  },
  cage: {
    name: "Cashier Cage", cat: "structure", w: 2, h: 2, cost: 0, upkeep: 0, color: "#6e5a1e", icon: "💰", art: "cage",
    tall: true, fixed: true, serves: "cashout", seats: [[0, 2, 0, -1, "stand"], [1, 2, 0, -1, "stand"]], useMin: [2, 4],
    desc: "Winners cash out here before leaving. Its position sets the walk they take with their winnings.",
  },
};
const BUILD_CATS = [
  { id: "slots", label: "Slots" },
  { id: "tables", label: "Tables" },
  { id: "amenity", label: "Amenities" },
  { id: "decor", label: "Decor and security" },
];

const STAFF = {
  janitor: { name: "Janitor", wage: 14, color: "#ece6d6", mark: "J", desc: "Cleans dirt, litter, and worse." },
  security: {
    name: "Security guard", wage: 20, color: "#4a6cf0", mark: "S", srv: 80, srvR: 4,
    desc: "Visible surveillance. Deters cheats and handles drunks. Some guests dislike being watched.",
  },
  tech: { name: "Slot tech", wage: 22, color: "#f5a524", mark: "T", desc: "Repairs broken machines." },
};

const RESEARCH_FUNDING = [
  { id: 0, name: "None", cost: 0, pts: 0 },
  { id: 1, name: "Low", cost: 250, pts: 8 },
  { id: 2, name: "High", cost: 800, pts: 30 },
];
const RESEARCH = {
  camera: { name: "Ceiling cameras", pts: 40, unlocks: ["camera"], desc: "Hidden surveillance that catches cheats without spooking guests." },
  vp: { name: "Video poker", pts: 70, unlocks: ["vp"], desc: "Low-hold machines that locals love." },
  consultant: {
    name: "Floor consultant", pts: 60, overlays: ["NRG", "PRS", "PRV", "EXV", "SRV", "CRW"],
    desc: "Heatmaps of the floor qualities guests react to.",
  },
  tables: { name: "Table games", pts: 60, unlocks: ["blackjack", "roulette"], desc: "Blackjack and roulette tables, each with its own dealer." },
  poker: { name: "Poker room", pts: 80, unlocks: ["poker"], desc: "Poker tables that earn a rake instead of a house edge." },
  prog: { name: "Horseshoe Link", pts: 120, unlocks: ["prog"], desc: "A linked progressive jackpot. Big lure, big liability." },
};

const INSURANCE = [
  { id: "none", name: "None", cover: 0 },
  { id: "half", name: "Half", cover: 0.5 },
  { id: "full", name: "Full", cover: 0.9 },
];

// Thoughts are the legible symptoms of the hidden fields.
const THOUGHTS = {
  trfHi: { t: "Too many people walking past me.", bad: 1 },
  trfLo: { t: "It's dead back here.", bad: 1 },
  nrgHi: { t: "Too loud to think in here.", bad: 1 },
  nrgLo: { t: "This place needs more buzz.", bad: 1 },
  prsLo: { t: "This place looks run-down.", bad: 1 },
  prvLo: { t: "I feel exposed sitting here.", bad: 1 },
  exvLo: { t: "I can't even tell where the exit is.", bad: 1 },
  exvHi: { t: "The door keeps calling my name.", bad: 1 },
  srvLo: { t: "I wish there was some security around.", bad: 1 },
  srvHi: { t: "Security keeps eyeballing me.", bad: 1 },
  crwHi: { t: "Way too crowded in here.", bad: 1 },
  crwLo: { t: "Where is everybody?", bad: 1 },
  dirty: { t: "This floor is filthy.", bad: 1 },
  gTRF: { t: "Great people-watching here." },
  gNRG: { t: "Love the energy in here!" },
  gPRS: { t: "Classy little joint." },
  gPRV: { t: "Nice private spot." },
  gEXV: { t: "Easy to find my way around." },
  gSRVV: { t: "Good to see security around." },
  gCRW: { t: "Nice and uncrowded." },
  refuge: { t: "Love a seat with my back to the wall." },
  noRestroom: { t: "I really need a restroom!", bad: 1 },
  farRestroom: { t: "The restroom is a mile away.", bad: 1 },
  noBar: { t: "I could really use a drink.", bad: 1 },
  noFood: { t: "I'm starving.", bad: 1 },
  line: { t: "The line is ridiculous.", bad: 1 },
  noMachine: { t: "Every machine I like is taken.", bad: 1 },
  broken: { t: "My machine broke down!", bad: 1 },
  bigWin: { t: "I just hit it big!" },
  waitPlayers: { t: "Waiting on more players.", bad: 1 },
  broke: { t: "I'm tapped out." },
  atm: { t: "Just one more trip to the ATM..." },
  drunk: { t: "Whoa, the room is spinning.", bad: 1 },
  gross: { t: "Gross! Someone threw up!", bad: 1 },
  scene: { t: "Someone's making a scene.", bad: 1 },
  seeExit: { t: "Maybe I should call it a night." },
  tired: { t: "My feet are killing me.", bad: 1 },
  goodTime: { t: "What a great place!" },
  badTime: { t: "I'm never coming back here.", bad: 1 },
  goodValue: { t: "My money lasted forever today." },
  badValue: { t: "These machines ate my money fast.", bad: 1 },
};
// Which thought a field produces: lo = wanted high but got low; hi = wanted low but got high.
const FIELD_THOUGHTS = {
  TRF: { lo: "trfLo", hi: "trfHi", good: "gTRF" },
  NRG: { lo: "nrgLo", hi: "nrgHi", good: "gNRG" },
  PRS: { lo: "prsLo", hi: null, good: "gPRS" },
  PRV: { lo: "prvLo", hi: null, good: "gPRV" },
  EXV: { lo: "exvLo", hi: "exvHi", good: "gEXV" },
  SRVV: { lo: "srvLo", hi: "srvHi", good: "gSRVV" },
  CRW: { lo: "crwLo", hi: "crwHi", good: "gCRW" },
};

// Map legend: # wall or pillar, . floor, E entrance.
const L1_MAP = [
  "##############",
  "#............#",
  "#............#",
  "#............#",
  "#............#",
  "#............#",
  "#...#....#...#",
  "#............#",
  "#............#",
  "#............#",
  "#............#",
  "#............#",
  "#...#....#...#",
  "#............#",
  "#............#",
  "#............#",
  "#............#",
  "#............#",
  "#............#",
  "#####EEEE#####",
];

const LEVELS = [
  {
    id: "L1", num: 1, tier: "story", status: "open", name: "The Lucky Horseshoe", locale: "Boulder Highway, off the Strip",
    blurb:
      "A tired little locals joint with a handful of machines. Regulars and retirees keep the lights on, and a few tourists wander in. Build it into something worth real money.",
    goal: { type: "value", target: 250000, day: 21 },
    start: { cash: 40000, time: 8 * 60, reserve: 12000 },
    rep: { RET: 50, LOC: 50, TOU: 40, CHS: 45, CHT: 50 },
    arrivals: { perHour: 26, max: 140, mix: { LOC: 0.4, RET: 0.34, TOU: 0.15, CHS: 0.09, CHT: 0.02 } },
    prestigeBase: 22,
    tools: ["penny", "classic", "restroom", "bar", "snack", "atm", "plant", "partition"],
    research: ["camera", "tables", "vp", "consultant", "poker", "prog"],
    staff: ["janitor", "security", "tech"],
    map: L1_MAP,
    preplaced: [
      { type: "cage", x: 10, y: 1 },
      { type: "restroom", x: 1, y: 1 },
      { type: "classic", x: 4, y: 9 }, { type: "classic", x: 5, y: 9 }, { type: "classic", x: 6, y: 9 },
      { type: "classic", x: 7, y: 9 }, { type: "classic", x: 8, y: 9 }, { type: "classic", x: 9, y: 9 },
      { type: "penny", x: 5, y: 15 }, { type: "penny", x: 6, y: 15 }, { type: "penny", x: 7, y: 15 }, { type: "penny", x: 8, y: 15 },
    ],
    startStaff: { janitor: 1, tech: 1 },
    tips: [
      "Guests say what they think. Open Guests to read it.",
      "Every machine needs an open floor tile beside it for a stool.",
      "Keep cash above the cage reserve at midnight, or Gaming Control gets involved.",
      "Locals and retirees want calm and privacy. Tourists want buzz.",
      "Tall cabinets block sightlines. Low ones keep the floor open.",
      "Drag across the floor to size bars and diners. Bigger ones seat more and earn upgrades.",
      "Machines and tables face one way. Their stools need open floor in front.",
    ],
  },
  { id: "L2", num: 2, tier: "story", status: "construction", name: "Boardwalk Frontage", blurb: "Crowds stroll past the door all day. Get them inside." },
  { id: "L3", num: 3, tier: "story", status: "construction", name: "Sundowner Club", blurb: "Retirees and regulars. Comfort is everything." },
  { id: "L4", num: 4, tier: "story", status: "construction", name: "The River Belle", blurb: "A tiny floor on a docked riverboat. Every tile counts." },
  { id: "L5", num: 5, tier: "story", status: "construction", name: "The Labyrinth", blurb: "A tourist trap. How lost is too lost?" },
  { id: "L6", num: 6, tier: "story", status: "construction", name: "Convention Row", blurb: "Suits on weekdays, parties on weekends." },
  { id: "L7", num: 7, tier: "story", status: "construction", name: "Big Top Family Resort", blurb: "Families and chasers under one roof." },
  { id: "L8", num: 8, tier: "story", status: "construction", name: "Fight Night", blurb: "The arena next door empties onto your floor." },
  { id: "L9", num: 9, tier: "story", status: "construction", name: "The Pit", blurb: "Downtown. Sharp players, sharper cheats." },
  { id: "L10", num: 10, tier: "story", status: "construction", name: "Salon Privé", blurb: "Few guests. Enormous bets." },
  { id: "L11", num: 11, tier: "story", status: "construction", name: "The Pivot", blurb: "Turn a dying family casino into a luxury destination." },
  { id: "C1", num: 1, tier: "challenge", status: "construction", name: "Leveraged", blurb: "Private equity wants every penny, then a bankruptcy on schedule." },
  { id: "C2", num: 2, tier: "challenge", status: "construction", name: "The Laundromat", blurb: "Infinite money, a laundering quota, and raids." },
  { id: "C3", num: 3, tier: "challenge", status: "construction", name: "Heist Week", blurb: "A crew is casing your cage." },
  { id: "C4", num: 4, tier: "challenge", status: "construction", name: "Canal Palace", blurb: "Bridges are the only way across." },
  { id: "C5", num: 5, tier: "challenge", status: "construction", name: "High Seas", blurb: "Open only in international waters." },
  { id: "C6", num: 6, tier: "challenge", status: "construction", name: "Deadwood 1878", blurb: "Faro, candlelight, and gunfights." },
  { id: "C7", num: 7, tier: "challenge", status: "construction", name: "The Honest House", blurb: "Only fair games. Profit anyway." },
  { id: "C8", num: 8, tier: "challenge", status: "construction", name: "Cotai Megaresort", blurb: "Whales, junkets, and feng shui." },
  { id: "C9", num: 9, tier: "challenge", status: "construction", name: "Poker Palace", blurb: "Rake only. Zero house variance." },
];
const STORY_OPEN_AT_START = 5; // like RCT: first five story slots open, each win opens the next

/* ============================= 3. UTILS ============================= */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// Seeded RNG stored in state, so runs are reproducible from a save.
function rngNext(s) {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const R = {
  range: (s, a, b) => a + (b - a) * rngNext(s),
  int: (s, a, b) => a + Math.floor((b - a + 1) * rngNext(s)),
  pick: (s, arr) => arr[Math.floor(rngNext(s) * arr.length)],
  chance: (s, p) => rngNext(s) < p,
};
const newId = (s) => s.nextId++;
const fmt$ = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const dayOf = (t) => Math.floor(t / 1440) + 1;
const clockStr = (t) => {
  const m = ((Math.floor(t) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const getLevel = (id) => LEVELS.find((l) => l.id === id);
const tileIndex = (rt, a) => Math.floor(a.y) * rt.W + Math.floor(a.x);
const inBounds = (rt, x, y) => x >= 0 && y >= 0 && x < rt.W && y < rt.H;

function footprint(o) {
  const d = OBJECTS[o.type];
  const out = [];
  const w = o.w ?? d.w, h = o.h ?? d.h;
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push([o.x + dx, o.y + dy]);
  return out;
}

// Breadth-first distance map from a start tile over passable tiles.
function bfs(rt, start, pass, maxDist = 9999) {
  const { W, H, N } = rt;
  const dist = new Int16Array(N).fill(-1);
  const q = new Int32Array(N);
  let head = 0, tail = 0;
  dist[start] = 0;
  q[tail++] = start;
  while (head < tail) {
    const c = q[head++];
    const d = dist[c];
    if (d >= maxDist) continue;
    const cx = c % W, cy = (c / W) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = cx + DIRS[k][0], ny = cy + DIRS[k][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (dist[n] !== -1 || !pass[n]) continue;
      dist[n] = d + 1;
      q[tail++] = n;
    }
  }
  return dist;
}

// Walk back down the distance gradient. Returns tiles after the start, ending at target.
function pathFromDist(rt, dist, target) {
  const path = [];
  if (dist[target] < 0) return path;
  let c = target;
  let guard = 0;
  while (dist[c] > 0 && guard++ < 4000) {
    path.push(c);
    const cx = c % rt.W, cy = (c / rt.W) | 0;
    let next = -1;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!inBounds(rt, nx, ny)) continue;
      const n = ny * rt.W + nx;
      if (dist[n] === dist[c] - 1) { next = n; break; }
    }
    if (next < 0) break;
    c = next;
  }
  return path.reverse();
}

// Seat tiles a worker can stand on to service an object.
function accessTiles(rt, o) {
  const lay = rt.lay.get(o.id);
  return lay ? lay.seats.map((st) => st.i).filter((i) => i >= 0 && rt.walk[i]) : [];
}

// Bresenham line of sight; endpoints never block themselves.
function los(rt, x0, y0, x1, y1) {
  let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  for (let guard = 0; guard < 200; guard++) {
    if (x === x1 && y === y1) return true;
    if (!(x === x0 && y === y0) && rt.sight[y * rt.W + x]) return false;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return true;
}

function nearestWalk(rt, start) {
  if (rt.walk[start]) return start;
  const pass = new Uint8Array(rt.N);
  for (let i = 0; i < rt.N; i++) pass[i] = rt.tile[i] === 1 ? 0 : 1;
  const d = bfs(rt, start, pass);
  let best = -1, bd = 1e9;
  for (let i = 0; i < rt.N; i++) if (rt.walk[i] && d[i] >= 0 && d[i] < bd) { bd = d[i]; best = i; }
  return best;
}

function objAt(s, rt, x, y) {
  if (!inBounds(rt, x, y)) return null;
  const id = rt.occ[y * rt.W + x] || rt.zoneOf[y * rt.W + x];
  if (id) return rt.objById.get(id) || null;
  return s.objects.find((o) => OBJECTS[o.type].walkable && o.x === x && o.y === y) || null;
}

function mapEntrances(map) {
  const out = [];
  const W = map[0].length;
  map.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === "E") out.push(y * W + x); });
  return out;
}

/* ============================= 4. FIELDS ============================ */
// Runtime = derived caches rebuilt from state. Never saved.
function makeRuntime(s) {
  const W = s.map[0].length, H = s.map.length, N = W * H;
  const rt = {
    W, H, N,
    tile: new Uint8Array(N), occ: new Int32Array(N), walk: new Uint8Array(N),
    sight: new Uint8Array(N), sound: new Uint8Array(N),
    objById: new Map(), entrances: [], floorCount: 0,
    zoneOf: new Int32Array(N), lay: new Map(), seatAt: new Map(), seatUse: new Map(),
    doorFx: new Map(), jackpots: new Map(), buf: null,
    f: {}, footsteps: new Float32Array(N), pulses: [], fx: [], toasts: [], toastSeq: 0,
    layoutVer: 0, layer: null, layerKey: -1,
  };
  for (const k of RUNTIME_FIELDS) rt.f[k] = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = s.map[y][x], i = y * W + x;
      rt.tile[i] = ch === "#" ? 1 : ch === "E" ? 2 : 0;
      if (ch === "E") rt.entrances.push(i);
      if (ch !== "#") rt.floorCount++;
    }
  }
  rt.f.TRF.fill(15);
  rebuildLayout(s, rt);
  return rt;
}

/* ---------- object geometry ---------- */
// Rotation r: the object's front faces S, W, N, E for r = 0..3.
// Local frame: A tiles wide, B deep, front toward +v. xf maps local tiles to world offsets.
function xf(rot, A, B, u, v) {
  switch (rot & 3) {
    case 1: return [B - 1 - v, u];
    case 2: return [A - 1 - u, B - 1 - v];
    case 3: return [v, A - 1 - u];
    default: return [u, v];
  }
}
function xfDir(rot, dx, dy) {
  switch (rot & 3) {
    case 1: return [-dy, dx];
    case 2: return [-dx, -dy];
    case 3: return [dy, -dx];
    default: return [dx, dy];
  }
}
const dirOf = (fx, fy) => (fy > 0 ? 0 : fx < 0 ? 1 : fy < 0 ? 2 : 3); // 0 down, 1 left, 2 up, 3 right
function localDims(o) { return ((o.rot || 0) & 1) === 0 ? [o.w, o.h] : [o.h, o.w]; }
function worldDims(type, rot, w, h) {
  const d = OBJECTS[type];
  if (d.zone) return [w || d.zone.min, h || d.zone.min];
  return rot & 1 ? [d.h, d.w] : [d.w, d.h];
}
function zoneTier(o) {
  const d = OBJECTS[o.type];
  if (!d.tiers) return null;
  const a = o.w * o.h;
  let t = d.tiers[0];
  for (const x of d.tiers) if (a >= x.area) t = x;
  return t;
}
const placeCost = (type, w, h) => { const d = OBJECTS[type]; return d.zone ? d.costBase + d.costTile * w * h : d.cost; };
const objUpkeep = (o) => { const d = OBJECTS[o.type]; return d.zone ? d.upkeepBase + d.upkeepTile * o.w * o.h : d.upkeep || 0; };

// Cells (solid or walkable) and seats for an object, in world tiles.
// Zones: counter along the back row, stools in front of it, then rows of tables with chairs.
function objLayout(o) {
  const d = OBJECTS[o.type], rot = o.rot || 0;
  const [A, B] = localDims(o);
  const cells = [], seats = [];
  const T = (u, v) => { const [a, b] = xf(rot, A, B, u, v); return [o.x + a, o.y + b]; };
  const addSeat = (u, v, fu, fv, kind) => {
    const [x, y] = T(u, v);
    const [fx, fy] = xfDir(rot, fu, fv);
    seats.push({ x, y, fx, fy, kind, i: -1 });
  };
  if (d.zone) {
    for (let v = 0; v < B; v++) {
      for (let u = 0; u < A; u++) {
        let role = "walk";
        if (v === 0) role = "counter";
        else if (v === 1) { role = "seat"; addSeat(u, v, 0, -1, "stool"); }
        else if ((v - 2) % 2 === 0) {
          if (u % 3 === 1) role = "table";
          else if (u % 3 === 0 && u + 1 < A) { role = "seat"; addSeat(u, v, 1, 0, "chair"); }
          else if (u % 3 === 2) { role = "seat"; addSeat(u, v, -1, 0, "chair"); }
        }
        const [x, y] = T(u, v);
        cells.push({ x, y, u, v, role });
      }
    }
  } else {
    for (let v = 0; v < B; v++) for (let u = 0; u < A; u++) { const [x, y] = T(u, v); cells.push({ x, y, u, v, role: d.walkable ? "walk" : "solid" }); }
    for (const st of d.seats || []) addSeat(st[0], st[1], st[2], st[3], st[4] || "stool");
  }
  return { cells, seats, A, B };
}

// A seat is usable when nobody has it, its floor is open, and no one else is sitting on that tile.
function seatFree(rt, o, k) {
  const lay = rt.lay.get(o.id);
  const st = lay && lay.seats[k];
  if (!st || st.i < 0 || o.occ[k] || o.res[k] || !rt.walk[st.i]) return false;
  return st.kind === "hidden" || !rt.seatUse.has(st.i);
}

const SOLID = { solid: 1, counter: 1, table: 1 };
function rebuildLayout(s, rt) {
  const { W, N } = rt;
  rt.occ.fill(0);
  rt.zoneOf.fill(0);
  rt.objById.clear();
  rt.lay.clear();
  rt.seatAt.clear();
  rt.seatUse.clear();
  for (const o of s.objects) {
    rt.objById.set(o.id, o);
    const lay = objLayout(o);
    rt.lay.set(o.id, lay);
    for (const c of lay.cells) {
      if (!inBounds(rt, c.x, c.y)) continue;
      const i = c.y * W + c.x;
      if (SOLID[c.role]) rt.occ[i] = o.id;
      else rt.zoneOf[i] = o.id;
    }
    lay.seats.forEach((st, k) => {
      st.i = inBounds(rt, st.x, st.y) ? st.y * W + st.x : -1;
      if (st.i < 0) return;
      const arr = rt.seatAt.get(st.i) || [];
      arr.push({ o, k });
      rt.seatAt.set(st.i, arr);
    });
    if (!Array.isArray(o.occ)) o.occ = [];
    if (!Array.isArray(o.res)) o.res = [];
    for (let k = 0; k < lay.seats.length; k++) { o.occ[k] = o.occ[k] || 0; o.res[k] = o.res[k] || 0; }
    o.occ.length = lay.seats.length;
    o.res.length = lay.seats.length;
  }
  for (const g of s.guests) if (g.act && g.act.tile != null && !g.act.hidden) rt.seatUse.set(g.act.tile, g.id);
  for (let i = 0; i < N; i++) {
    const t = rt.tile[i], oid = rt.occ[i];
    const d = oid ? OBJECTS[rt.objById.get(oid).type] : null;
    rt.walk[i] = t !== 1 && !oid ? 1 : 0;
    rt.sight[i] = t === 1 || (d && d.tall) ? 1 : 0;
    rt.sound[i] = t === 1 || (d && d.soundBlock) ? 1 : 0;
  }
  computeLayoutFields(s, rt);
  computeNoise(s, rt);
  computeDynamicFields(s, rt);
  rt.layoutVer++;
}

function radiate(rt, arr, x0, y0, r, amp) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = x0 + dx, y = y0 + dy;
      if (!inBounds(rt, x, y)) continue;
      const d = Math.hypot(dx, dy);
      if (d > r + 0.01) continue;
      const i = y * rt.W + x;
      if (rt.tile[i] === 1 || !los(rt, x0, y0, x, y)) continue;
      arr[i] = Math.min(100, arr[i] + amp * (1 - d / (r + 1)));
    }
  }
}

// Fields that only change when the layout changes.
function computeLayoutFields(s, rt) {
  const { W, H, N, f } = rt;
  const L = getLevel(s.levelId);
  // Exit visibility: line of sight to any entrance, stronger when closer.
  f.EXV.fill(0);
  for (let i = 0; i < N; i++) {
    if (rt.tile[i] === 1) continue;
    const x = i % W, y = (i / W) | 0;
    let best = 0;
    for (const e of rt.entrances) {
      const ex = e % W, ey = (e / W) | 0;
      const d = Math.hypot(ex - x, ey - y);
      if (d > 14) continue;
      const v = 100 * (1 - d / 15);
      if (v > best && los(rt, x, y, ex, ey)) best = v;
    }
    f.EXV[i] = best;
  }
  // Hidden surveillance from cameras.
  f.SRVH.fill(0);
  for (const o of s.objects) {
    const d = OBJECTS[o.type];
    if (d.srv) radiate(rt, f.SRVH, o.x, o.y, d.srvR, d.srv);
  }
  // Static prestige from decor (and negative sources like ATMs).
  f.PRS0.fill(L.prestigeBase ?? 25);
  for (const o of s.objects) {
    const d = OBJECTS[o.type];
    if (!d.prs) continue;
    const r = d.prsR || 2;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = o.x + dx, y = o.y + dy;
        if (!inBounds(rt, x, y)) continue;
        const dd = Math.max(Math.abs(dx), Math.abs(dy));
        f.PRS0[y * W + x] += d.prs * (1 - dd / (r + 1));
      }
    }
  }
  // Zone tiers (lounges, buffets) lift prestige in and around them.
  for (const o of s.objects) {
    const t = zoneTier(o);
    if (!t || !t.prs) continue;
    for (let y = o.y - 1; y <= o.y + o.h; y++) for (let x = o.x - 1; x <= o.x + o.w; x++) if (inBounds(rt, x, y)) f.PRS0[y * W + x] += t.prs;
  }
  // Enclosure: solid tiles nearby (walls, machines, partitions). Feeds privacy.
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i / W) | 0;
    let e = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        const w = Math.abs(dx) <= 1 && Math.abs(dy) <= 1 ? 1 : 0.4;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) { e += w; continue; }
        const j = ny * W + nx;
        if (!rt.walk[j] && rt.tile[j] !== 2) e += w;
      }
    }
    f.ENC[i] = clamp((e / 14.4) * 140, 0, 100);
  }
}

// Noise travels through open floor and over machines, but not through walls or partitions.
function computeNoise(s, rt) {
  const { N, W, f } = rt;
  f.NRG.fill(0);
  const pass = new Uint8Array(N);
  for (let i = 0; i < N; i++) pass[i] = rt.sound[i] ? 0 : 1;
  const emit = (x, y, amp) => {
    if (amp <= 0) return;
    const dist = bfs(rt, y * W + x, pass, 5);
    for (let i = 0; i < N; i++) if (dist[i] >= 0) f.NRG[i] += amp * 10 * (1 - dist[i] / 6);
  };
  for (const o of s.objects) {
    const d = OBJECTS[o.type];
    if (!d.nrg) continue;
    const cap = (rt.lay.get(o.id) || { seats: [] }).seats.length || 1;
    let n = 0;
    for (const id of o.occ || []) if (id) n++;
    const act = d.game ? (n ? 0.3 + (0.7 * n) / cap : 0.25) : 0.3 + (0.7 * n) / cap;
    const tier = zoneTier(o);
    emit(o.x + (o.w >> 1), o.y + (o.h >> 1), d.nrg * (tier && tier.nrg ? tier.nrg : 1) * (0.35 + 0.65 * act));
  }
  for (const p of rt.pulses) emit(p.x, p.y, p.amp);
  for (const inc of s.incidents) if (inc.kind === "scene") emit(inc.x, inc.y, 3);
  for (let i = 0; i < N; i++) f.NRG[i] = Math.min(100, f.NRG[i]);
}

// Fields that move with people: crowding, visible security, derived prestige and privacy.
function computeDynamicFields(s, rt) {
  const { W, H, N, f } = rt;
  const cnt = new Float32Array(N);
  for (const g of s.guests) {
    if (g.act && g.act.hidden) continue;
    const x = Math.floor(g.x), y = Math.floor(g.y);
    if (inBounds(rt, x, y)) cnt[y * W + x]++;
  }
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i / W) | 0;
    let c = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (rt.tile[j] === 1) continue;
        n++;
        c += cnt[j];
      }
    }
    f.CRW[i] = n ? clamp((c / n) * 110, 0, 100) : 0;
  }
  f.SRVV.fill(0);
  for (const st of s.staff) {
    if (st.type !== "security") continue;
    const d = STAFF.security;
    radiate(rt, f.SRVV, Math.floor(st.x), Math.floor(st.y), d.srvR, d.srv);
  }
  for (let i = 0; i < N; i++) {
    f.SRV[i] = 100 - ((100 - f.SRVH[i]) * (100 - f.SRVV[i])) / 100;
    f.PRS[i] = clamp(f.PRS0[i] - s.dirt[i] * 0.5 - f.CRW[i] * 0.1, 0, 100);
    f.PRV[i] = clamp(f.ENC[i] * 0.75 + (100 - f.TRF[i]) * 0.25, 0, 100);
  }
}

// Hourly: footsteps become a smoothed traffic field.
function updateTraffic(s, rt) {
  const { N, f } = rt;
  for (let i = 0; i < N; i++) {
    f.TRF[i] = f.TRF[i] * 0.6 + Math.min(100, rt.footsteps[i] * 4) * 0.4;
    rt.footsteps[i] = 0;
  }
}

const fieldValue = (s, rt, key, i) => (key === "DIRT" ? s.dirt[i] : rt.f[key] ? rt.f[key][i] : 50);

// How much an archetype likes a tile, roughly -3..3.
function comfortAt(s, rt, A, i) {
  let c = 0;
  for (const k in A.prefs) c += (A.prefs[k] * (fieldValue(s, rt, k, i) - 50)) / 50;
  c -= Math.max(0, s.dirt[i] - 20) / 40;
  return c;
}

// A seat is a refuge when the tile behind the sitter is solid.
function isRefuge(rt, st) {
  const bx = st.x - st.fx, by = st.y - st.fy;
  if (!inBounds(rt, bx, by)) return true;
  const b = by * rt.W + bx;
  return !rt.walk[b] && rt.tile[b] !== 2;
}

/* ============================ 5. SYSTEMS ============================ */
function notify(s, rt, text, kind = "info") {
  rt.toastSeq++;
  rt.toasts.push({ id: `n${rt.toastSeq}`, text, kind });
  s.news.unshift({ t: s.time, text, kind });
  if (s.news.length > MAX_NEWS) s.news.length = MAX_NEWS;
}
function think(s, g, id) {
  g.thought = id;
  g.thoughtT = s.time;
  s.thoughtsToday[id] = (s.thoughtsToday[id] || 0) + 1;
}
function addDirt(s, rt, i, amt, spread = 0) {
  if (rt.tile[i] === 1) return;
  s.dirt[i] = Math.min(100, s.dirt[i] + amt);
  if (!spread) return;
  const x = i % rt.W, y = (i / rt.W) | 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (!inBounds(rt, nx, ny)) continue;
      const j = ny * rt.W + nx;
      if (rt.walk[j]) s.dirt[j] = Math.min(100, s.dirt[j] + spread);
    }
  }
}
const MIN_BET = {};
function minBetFor(a) {
  if (MIN_BET[a] != null) return MIN_BET[a];
  let m = Infinity;
  for (const [id, w] of Object.entries(ARCHETYPES[a].games)) if (w > 0 && OBJECTS[id]?.game) m = Math.min(m, OBJECTS[id].game.bet);
  return (MIN_BET[a] = m === Infinity ? 1 : m);
}

// Agents follow a path of tile indices. onStep may return true to stop (a diversion).
function moveAgent(rt, ag, dist, onStep) {
  while (dist > 0 && ag.path.length) {
    const n = ag.path[0];
    const nx = (n % rt.W) + 0.5, ny = Math.floor(n / rt.W) + 0.5;
    const dx = nx - ag.x, dy = ny - ag.y, d = Math.hypot(dx, dy);
    if (d > 0.01) ag.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 3) : dy < 0 ? 2 : 0;
    if (d <= dist) {
      ag.x = nx; ag.y = ny; dist -= d;
      ag.path.shift();
      if (onStep && onStep(n)) return;
    } else {
      ag.x += (dx / d) * dist; ag.y += (dy / d) * dist; dist = 0;
    }
  }
}

/* ---------- guests ---------- */
function pickLook(s, a) {
  const L = LOOKS[a === "CHT" ? "TOU" : a] || LOOKS.LOC;
  const p = (arr) => (arr && arr.length ? R.pick(s, arr) : null);
  return {
    skin: p(SKINS), hair: p(L.hair), style: p(L.style), shirt: p(L.shirt), pants: p(L.pants), hat: p(L.hat),
    pattern: !!L.pattern, shorts: !!L.shorts && R.chance(s, 0.7),
    glasses: a === "CHT" ? true : R.chance(s, a === "TOU" ? 0.12 : 0.05),
  };
}
function staffLook(s, type) {
  return { ...WORKER_LOOKS[type], skin: R.pick(s, SKINS), hair: R.pick(s, HAIRS), style: "short" };
}

function spawnGuest(s, rt, a) {
  const A = ARCHETYPES[a];
  const e = R.pick(s, rt.entrances);
  const budget = Math.round(R.range(s, A.budget[0], A.budget[1]));
  const g = {
    id: newId(s), a, disguise: A.disguise || a, look: pickLook(s, a), dir: 2,
    x: (e % rt.W) + 0.5, y: Math.floor(e / rt.W) + 0.5,
    path: [], goal: null, act: null,
    budget, bankIn: budget,
    needs: { bladder: R.range(s, 0, 35), hunger: R.range(s, 0, 40), thirst: R.range(s, 0, 40), fatigue: R.range(s, 0, 20) },
    intox: 0, sat: R.range(s, A.satStart[0], A.satStart[1]),
    arrived: s.time, stay: R.range(s, A.stay[0], A.stay[1]),
    played: 0, leaving: false, cashedOut: false, fails: 0, atmUses: 0,
    thought: null, thoughtT: -999, nextThink: s.time + R.int(s, 10, THOUGHT_INTERVAL),
  };
  s.guests.push(g);
  s.fin.today.visitors++;
  return g;
}

function releaseGoal(s, rt, g) {
  if (g.goal && g.goal.obj != null && g.goal.seat != null) {
    const o = rt.objById.get(g.goal.obj);
    if (o && o.res[g.goal.seat] === g.id) o.res[g.goal.seat] = 0;
  }
  g.goal = null;
  g.path = [];
}
function endAct(s, rt, g) {
  const a = g.act;
  if (!a) return;
  const o = a.obj != null ? rt.objById.get(a.obj) : null;
  if (o && a.seat != null && o.occ[a.seat] === g.id) o.occ[a.seat] = 0;
  if (a.tile != null && rt.seatUse.get(a.tile) === g.id) rt.seatUse.delete(a.tile);
  if (a.hidden && o) rt.doorFx.set(o.id, nowMs());
  g.act = null;
}
function removeGuest(s, rt, g) {
  endAct(s, rt, g);
  releaseGoal(s, rt, g);
  s.guests = s.guests.filter((x) => x !== g);
  s.incidents = s.incidents.filter((x) => x.gid !== g.id);
}

// The end of a visit is where satisfaction turns into reputation.
function finishVisit(s, rt, g) {
  const A = ARCHETYPES[g.a];
  if (A.cheat) { s.stats.cheatsEscaped++; return; }
  const lost = g.bankIn - g.budget;
  if (lost > 5) {
    const dv = clamp((g.played / lost - A.valueExpect) * 10, -15, 10);
    g.sat += dv;
    if (dv < -5) think(s, g, "badValue");
    else if (dv > 4) think(s, g, "goodValue");
  } else if (lost < -20) g.sat += 8;
  g.sat = clamp(g.sat, 0, 100);
  if (g.sat >= 75) think(s, g, "goodTime");
  else if (g.sat <= 30) think(s, g, "badTime");
  s.rep[g.a] = clamp((s.rep[g.a] ?? 50) + (g.sat - (s.rep[g.a] ?? 50)) * 0.03, 0, 100);
  s.fin.today.satSum += g.sat;
  s.fin.today.satN++;
  s.stats.visits[g.a] = (s.stats.visits[g.a] || 0) + 1;
}

function decide(s, rt, g) {
  const A = ARCHETYPES[g.a];
  const here = tileIndex(rt, g);
  const dist = bfs(rt, here, rt.walk);
  if (g.leaving) return startLeave(s, rt, g, dist);
  if (g.needs.fatigue > NEED_CRIT) { think(s, g, "tired"); return startLeave(s, rt, g, dist); }
  if (g.sat < 15 || s.time - g.arrived > g.stay) return startLeave(s, rt, g, dist);
  if (!A.cheat && rt.f.EXV[here] > 60 && g.sat < 55 && R.chance(s, 0.12)) {
    think(s, g, "seeExit");
    return startLeave(s, rt, g, dist);
  }
  if (!A.cheat) {
    for (const need of ["bladder", "thirst", "hunger"]) {
      if (g.needs[need] < NEED_THRESH[need]) continue;
      const r = goAmenity(s, rt, g, need, dist);
      if (r === true) return;
      if (r === "full") {
        think(s, g, "line");
        g.sat -= 3;
        if (need === "bladder" && g.needs.bladder > NEED_CRIT) return startLeave(s, rt, g, dist);
        continue;
      }
      think(s, g, need === "bladder" ? "noRestroom" : need === "thirst" ? "noBar" : "noFood");
      g.sat -= need === "bladder" ? 8 : 4;
      if (need === "bladder" || g.needs[need] > NEED_CRIT) return startLeave(s, rt, g, dist);
    }
    if (g.budget < minBetFor(g.a)) {
      if (g.atmUses < 2 && R.chance(s, A.atm) && goAmenity(s, rt, g, "cash", dist) === true) return;
      think(s, g, "broke");
      return startLeave(s, rt, g, dist);
    }
  }
  if (goPlay(s, rt, g, dist)) return;
  g.fails++;
  think(s, g, "noMachine");
  g.sat -= 3;
  if (g.fails > 3) return startLeave(s, rt, g, dist);
  wander(s, rt, g, dist);
}

function goPlay(s, rt, g, dist) {
  const A = ARCHETYPES[g.a];
  let best = null, bestScore = 0;
  for (const o of s.objects) {
    const d = OBJECTS[o.type];
    if (!d.game || o.broken) continue;
    const w = A.games[o.type] || 0;
    if (w <= 0) continue;
    const table = !!d.game.table;
    if (A.cheat && table) continue;
    if (!A.cheat && g.budget < d.game.bet) continue;
    const seats = rt.lay.get(o.id).seats;
    let players = 0;
    if (table) for (const id of o.occ) if (id) players++;
    for (let k = 0; k < seats.length; k++) {
      if (!seatFree(rt, o, k)) continue;
      const i = seats[k].i;
      if (dist[i] < 0) continue;
      const c = A.cheat ? (50 - rt.f.SRVV[i]) / 25 + (50 - rt.f.TRF[i]) / 100 : comfortAt(s, rt, A, i);
      const social = table ? 1 + 0.35 * Math.min(players, 3) : 1;
      const score = (w * social * Math.max(0.1, 1 + 0.3 * c) * R.range(s, 0.75, 1.25)) / (1 + dist[i] / 8);
      if (score > bestScore) { bestScore = score; best = { o, k, i }; }
    }
  }
  if (!best) return false;
  best.o.res[best.k] = g.id;
  g.goal = { kind: "play", obj: best.o.id, seat: best.k, tile: best.i };
  g.path = pathFromDist(rt, dist, best.i);
  g.fails = 0;
  if (!g.path.length) arrive(s, rt, g);
  return true;
}

// Returns true (heading there), "full" (exists but every seat is taken), or false (none reachable).
function goAmenity(s, rt, g, need, dist) {
  let best = null, bd = 1e9, exists = false;
  for (const o of s.objects) {
    if (OBJECTS[o.type].serves !== need) continue;
    const seats = rt.lay.get(o.id).seats;
    for (let k = 0; k < seats.length; k++) {
      const i = seats[k].i;
      if (i < 0 || dist[i] < 0) continue;
      exists = true;
      if (!seatFree(rt, o, k)) continue;
      if (dist[i] < bd) { bd = dist[i]; best = { o, k, i }; }
    }
  }
  if (!best) return exists ? "full" : false;
  best.o.res[best.k] = g.id;
  g.goal = { kind: "use", obj: best.o.id, seat: best.k, tile: best.i, need };
  g.path = pathFromDist(rt, dist, best.i);
  if (need === "bladder" && bd > 16) think(s, g, "farRestroom");
  if (!g.path.length) arrive(s, rt, g);
  return true;
}

function wander(s, rt, g, dist) {
  for (let k = 0; k < 30; k++) {
    const j = R.int(s, 0, rt.N - 1);
    if (dist[j] >= 2 && dist[j] <= 6) {
      g.goal = { kind: "wander" };
      g.path = pathFromDist(rt, dist, j);
      return;
    }
  }
  g.act = { kind: "idle", until: s.time + 3 };
}

function startLeave(s, rt, g, dist) {
  g.leaving = true;
  releaseGoal(s, rt, g);
  if (!dist) dist = bfs(rt, tileIndex(rt, g), rt.walk);
  if (!g.cashedOut && !ARCHETYPES[g.a].cheat && g.budget - g.bankIn >= 100 && goAmenity(s, rt, g, "cashout", dist) === true) return;
  let best = -1, bd = 1e9;
  for (const e of rt.entrances) if (dist[e] >= 0 && dist[e] < bd) { bd = dist[e]; best = e; }
  if (best < 0) { finishVisit(s, rt, g); removeGuest(s, rt, g); return; }
  g.goal = { kind: "exit" };
  g.path = pathFromDist(rt, dist, best);
  if (!g.path.length) arrive(s, rt, g);
}

function arrive(s, rt, g) {
  const goal = g.goal;
  if (!goal) return;
  const A = ARCHETYPES[g.a];
  if (goal.kind === "exit") { finishVisit(s, rt, g); removeGuest(s, rt, g); return; }
  if (goal.kind === "wander") { g.goal = null; return; }
  const o = rt.objById.get(goal.obj);
  const k = goal.seat;
  const st = o && rt.lay.get(o.id).seats[k];
  const ok = st && st.i === goal.tile && !o.broken && (!o.occ[k] || o.occ[k] === g.id) && (!o.res[k] || o.res[k] === g.id) &&
    (st.kind === "hidden" || !rt.seatUse.has(st.i) || rt.seatUse.get(st.i) === g.id);
  if (!ok) {
    if (o && o.res[k] === g.id) o.res[k] = 0;
    g.goal = null;
    return;
  }
  o.res[k] = 0;
  o.occ[k] = g.id;
  const hidden = st.kind === "hidden";
  if (hidden) rt.doorFx.set(o.id, nowMs());
  else rt.seatUse.set(st.i, g.id);
  g.x = st.x + 0.5;
  g.y = st.y + 0.5;
  g.dir = dirOf(st.fx, st.fy);
  const d = OBJECTS[o.type];
  if (goal.kind === "play") {
    let c = comfortAt(s, rt, A, st.i);
    if ((A.prefs.PRV || 0) > 0 && isRefuge(rt, st)) {
      c += 0.4;
      if (R.chance(s, 0.25)) think(s, g, "refuge");
    }
    const dwell = clamp(1 + 0.22 * c, 0.5, 1.7);
    const len = A.cheat ? R.range(s, 25, 70) : R.range(s, 40, 110) * dwell;
    g.act = { kind: "play", obj: o.id, seat: k, tile: st.i, until: s.time + len };
  } else {
    g.act = { kind: "use", obj: o.id, seat: k, tile: st.i, need: goal.need, hidden, until: s.time + R.range(s, d.useMin[0], d.useMin[1]) };
  }
  g.goal = null;
}

function completeUse(s, rt, g) {
  const a = g.act;
  const o = rt.objById.get(a.obj);
  endAct(s, rt, g);
  if (!o) return;
  const d = OBJECTS[o.type];
  const t = zoneTier(o) || {};
  o.stats.uses++;
  const spot = a.tile != null ? a.tile : tileIndex(rt, g);
  const earn = (rev, key) => { s.cash += rev; s.fin.today[key] += rev; o.stats.net += rev; o.stats.today += rev; };
  switch (d.serves) {
    case "bladder":
      g.needs.bladder = 0;
      addDirt(s, rt, spot, 5, 2);
      break;
    case "thirst":
      g.needs.thirst = 0;
      g.intox = Math.min(100, g.intox + d.intox);
      earn(d.price * (t.price || 1) * d.margin, "bar");
      if (R.chance(s, d.litter)) addDirt(s, rt, spot, 25, 8);
      break;
    case "hunger":
      g.needs.hunger = 0;
      g.needs.fatigue = Math.max(0, g.needs.fatigue - (d.relief || 0) - (t.relief || 0));
      earn(d.price * (t.price || 1) * d.margin, "food");
      if (R.chance(s, d.litter)) addDirt(s, rt, spot, 25, 8);
      break;
    case "cash": {
      const amt = Math.round(R.range(s, 60, 200) * (g.a === "CHS" ? 1.6 : 1));
      g.budget += amt;
      g.bankIn += amt;
      g.atmUses++;
      earn(d.fee, "atm");
      think(s, g, "atm");
      break;
    }
    case "cashout":
      g.cashedOut = true;
      startLeave(s, rt, g);
      break;
    default:
      break;
  }
}

// Exposure: walkers who step onto a free machine's stool may sit down on impulse.
function impulseCheck(s, rt, g, n) {
  const A = ARCHETYPES[g.a];
  if (A.cheat || !g.goal) return false;
  const gk = g.goal.kind;
  if (gk === "play") return false;
  let base = 0.025;
  if (gk === "wander") base = 0.2;
  else if (gk === "exit") base = g.budget > 5 ? 0.07 : 0;
  else if (gk === "use" && g.goal.need === "cashout") base = 0.16;
  else if (gk === "use" && g.needs[g.goal.need] > 85) base = 0;
  if (base <= 0) return false;
  const list = rt.seatAt.get(n);
  if (!list) return false;
  for (const { o, k } of list) {
    const d = OBJECTS[o.type];
    if (!d.game || d.game.table || o.broken || !seatFree(rt, o, k)) continue;
    const w = A.games[o.type] || 0;
    if (w <= 0 || g.budget < d.game.bet) continue;
    if (R.chance(s, base * w)) {
      releaseGoal(s, rt, g);
      const st = rt.lay.get(o.id).seats[k];
      o.occ[k] = g.id;
      rt.seatUse.set(n, g.id);
      g.dir = dirOf(st.fx, st.fy);
      g.act = { kind: "play", obj: o.id, seat: k, tile: n, until: s.time + R.range(s, 12, 35), impulse: true };
      return true;
    }
  }
  return false;
}

function periodicThought(s, rt, g) {
  const A = ARCHETYPES[g.a];
  if (g.act && g.act.hidden) return;
  const i = g.act && g.act.tile != null ? g.act.tile : tileIndex(rt, g);
  if (s.dirt[i] > 45) { think(s, g, "dirty"); return; }
  let worst = null, wv = 0, best = null, bv = 0;
  for (const k in A.prefs) {
    const c = (A.prefs[k] * (fieldValue(s, rt, k, i) - 50)) / 50;
    if (c < wv) { wv = c; worst = k; }
    if (c > bv) { bv = c; best = k; }
  }
  if (worst && wv < -0.35) {
    const ft = FIELD_THOUGHTS[worst];
    const id = ft ? (A.prefs[worst] > 0 ? ft.lo : ft.hi) : null;
    if (id) { think(s, g, id); return; }
  }
  if (best && bv > 0.5) {
    const id = FIELD_THOUGHTS[best]?.good;
    if (id) think(s, g, id);
  }
}

const guestSys = {
  id: "guests",
  frame(s, rt, dt) {
    for (const g of s.guests.slice()) {
      if (g.act || !g.path.length) continue;
      const A = ARCHETYPES[g.a];
      const sp = WALK_TILES_PER_MIN * A.speed * (1 - g.needs.fatigue / 300) * (g.intox > 60 ? 0.75 : 1);
      moveAgent(rt, g, sp * dt, (n) => {
        rt.footsteps[n] += 1;
        g.needs.fatigue = Math.min(100, g.needs.fatigue + 0.04);
        addDirt(s, rt, n, 0.03);
        return impulseCheck(s, rt, g, n);
      });
      if (!g.path.length && g.goal && !g.act) arrive(s, rt, g);
    }
  },
  minute(s, rt) {
    for (const g of s.guests.slice()) {
      if (!s.guests.includes(g)) continue;
      const A = ARCHETYPES[g.a];
      for (const k in A.needs) g.needs[k] = Math.min(100, g.needs[k] + A.needs[k]);
      g.intox = Math.max(0, g.intox - 0.06);
      if (!(g.act && g.act.hidden)) {
        const here = g.act && g.act.tile != null ? g.act.tile : tileIndex(rt, g);
        g.sat += comfortAt(s, rt, A, here) * (g.act ? 0.03 : 0.012);
      }
      for (const k of ["bladder", "hunger", "thirst"]) if (g.needs[k] > 80) g.sat -= 0.06;
      g.sat = clamp(g.sat, 0, 100);
      const a = g.act;
      if (a) {
        if (a.kind === "play") {
          const o = rt.objById.get(a.obj);
          const d = o && OBJECTS[o.type];
          const stop = !o || o.broken || s.time >= a.until || (!A.cheat && g.budget < d.game.bet) ||
            g.needs.bladder > NEED_CRIT || g.needs.thirst > NEED_CRIT + 5 || g.sat < 18;
          if (stop) {
            endAct(s, rt, g);
            if (g.leaving) startLeave(s, rt, g);
          }
        } else if (a.kind === "use") {
          if (s.time >= a.until) completeUse(s, rt, g);
        } else if (a.kind === "idle") {
          if (s.time >= a.until) g.act = null;
        } else g.act = null;
      }
      if (!s.guests.includes(g)) continue;
      if (g.intox > 70 && R.chance(s, 0.01)) think(s, g, "drunk");
      if (s.time >= g.nextThink) {
        periodicThought(s, rt, g);
        g.nextThink = s.time + THOUGHT_INTERVAL + R.int(s, 0, 15);
      }
      if (!g.act && !g.path.length && !g.goal) decide(s, rt, g);
    }
  },
  layout(s, rt) {
    for (const g of s.guests.slice()) {
      if (g.act && g.act.obj != null) {
        const o = rt.objById.get(g.act.obj);
        const st = o && rt.lay.get(o.id).seats[g.act.seat];
        const bad = !o || !st || st.i !== g.act.tile || (!g.act.hidden && !rt.walk[g.act.tile]);
        if (bad) endAct(s, rt, g);
      }
      if (g.goal) releaseGoal(s, rt, g);
      g.path = [];
      const i = tileIndex(rt, g);
      if (!rt.walk[i]) {
        const j = nearestWalk(rt, i);
        if (j >= 0) { g.x = (j % rt.W) + 0.5; g.y = Math.floor(j / rt.W) + 0.5; }
      }
    }
  },
};

const arrivalsSys = {
  id: "arrivals",
  minute(s, rt) {
    const L = getLevel(s.levelId);
    if (s.guests.length >= L.arrivals.max) return;
    const hr = Math.floor((s.time % 1440) / 60);
    let vis = 0;
    for (let i = 0; i < rt.N; i++) vis += rt.f.SRVV[i];
    vis /= Math.max(1, rt.floorCount) * 100;
    for (const [a, share] of Object.entries(L.arrivals.mix)) {
      const A = ARCHETYPES[a];
      let rate = (L.arrivals.perHour * share * A.hours[hr] * (0.3 + (1.4 * (s.rep[a] ?? 50)) / 100)) / 60;
      if (A.cheat) rate *= Math.max(0.2, 1 - vis * 3); // visible security deters cheats
      if (R.chance(s, rate)) spawnGuest(s, rt, a);
    }
  },
};

/* ---------- gaming ---------- */
const VOL_TEMPLATES = {
  low: [[0.28, 0.6], [0.12, 1.6], [0.04, 4], [0.008, 15], [0.0006, 80]],
  med: [[0.2, 0.8], [0.08, 2.5], [0.025, 7], [0.005, 30], [0.0004, 150]],
};
const PAYTABLES = {};
// Scale a volatility template so the machine returns exactly (1 - hold), net of top awards.
function paytable(type) {
  if (PAYTABLES[type]) return PAYTABLES[type];
  const g = OBJECTS[type].game;
  const tpl = VOL_TEMPLATES[g.vol] || VOL_TEMPLATES.low;
  const topEV = g.top ? (g.top.p * g.top.pay) / g.bet : 0;
  const prog = g.progressive ? g.progressive.rate : 0;
  const target = 1 - g.hold - topEV - prog;
  const raw = tpl.reduce((a, [p, m]) => a + p * m, 0);
  const k = target / raw;
  let cum = 0;
  return (PAYTABLES[type] = tpl.map(([p, m]) => { cum += p; return [cum, m * k]; }));
}

// Bets grow with drink and with chasing losses. Tables scale by the archetype's usual stake.
function betFor(g, d) {
  const A = ARCHETYPES[g.a];
  const lossFrac = Math.max(0, (g.bankIn - g.budget) / Math.max(1, g.bankIn));
  const base = d.game.table ? d.game.bet * (A.tableBet || 1) : d.game.bet;
  return Math.round(base * (1 + g.intox / 250 + A.tilt * lossFrac * 0.6) * 100) / 100;
}

function jackpot(s, rt, o, d, g, pay) {
  const ins = INSURANCE.find((x) => x.id === s.insurance) || INSURANCE[0];
  const rec = Math.round(pay * ins.cover);
  s.cash += rec;
  s.fin.today.insRecovered += rec;
  s.fin.today.jackpots += pay;
  s.stats.jackpots++;
  g.sat = Math.min(100, g.sat + 15);
  think(s, g, "bigWin");
  for (const h of s.guests) if (h !== g && Math.hypot(h.x - g.x, h.y - g.y) < 3.5) h.sat = Math.min(100, h.sat + 2);
  rt.pulses.push({ x: o.x, y: o.y, amp: 5, until: s.time + 30 });
  rt.jackpots.set(o.id, nowMs() + 6500);
  rt.fx.push({ kind: "coins", x: o.x + 0.5, y: o.y + 0.2, t: 0, life: 1.8, seed: o.id * 31 + s.time });
  rt.fx.push({ kind: "text", x: o.x + 0.5, y: o.y - 0.4, t: 0, life: 2.4, text: fmt$(pay) });
  const label = pay >= HANDPAY_THRESHOLD ? "Hand-pay jackpot" : "Jackpot";
  notify(s, rt, `${label}! ${fmt$(pay)} on ${d.name}${rec ? `. Insurance covered ${fmt$(rec)}.` : "."}`, "gold");
}

function spinOutcome(s, rt, o, d, bet, g) {
  const gm = d.game;
  if (gm.top && R.chance(s, gm.top.p)) { jackpot(s, rt, o, d, g, gm.top.pay); return gm.top.pay; }
  if (gm.progressive) {
    s.progressive.meter += bet * gm.progressive.rate;
    if (R.chance(s, gm.progressive.p)) {
      const pay = Math.round(s.progressive.meter);
      s.progressive.meter = gm.progressive.seed;
      jackpot(s, rt, o, d, g, pay);
      return pay;
    }
  }
  const r = rngNext(s);
  for (const [c, m] of paytable(o.type)) if (r < c) return bet * m;
  return 0;
}

// Table games settle a minute of hands for everyone seated at one table.
function tableMinute(s, rt, o, d, players) {
  const gm = d.game;
  const perMin = gm.hph / 60;
  let hands = Math.floor(perMin);
  if (R.chance(s, perMin - hands)) hands++;
  let coin = 0, paid = 0, rake = 0;
  for (let h = 0; h < hands; h++) {
    if (gm.table === "poker") {
      const live = players.filter((g) => g.budget >= gm.bet);
      if (live.length < 2) {
        for (const g of players) if (R.chance(s, 0.05)) think(s, g, "waitPlayers");
        break;
      }
      let pot = 0;
      for (const g of live) { const b = Math.min(g.budget, betFor(g, d)); g.budget -= b; pot += b; }
      const cut = Math.min(gm.rakeCap, pot * gm.rake);
      rake += cut;
      R.pick(s, live).budget += pot - cut;
      continue;
    }
    for (const g of players) {
      const bet = betFor(g, d);
      if (g.budget < bet) continue;
      g.budget -= bet;
      coin += bet;
      const r = rngNext(s);
      let win = 0;
      if (gm.table === "blackjack") win = r < 0.045 ? bet * 2.5 : r < 0.435 ? bet * 2 : r < 0.52 ? bet : 0;
      else if (R.chance(s, 0.8)) win = r < 18 / 38 ? bet * 2 : 0;
      else win = r < 1 / 38 ? bet * 36 : 0;
      g.budget += win;
      paid += win;
      if (win >= bet * 20) {
        think(s, g, "bigWin");
        g.sat = Math.min(100, g.sat + 10);
        rt.fx.push({ kind: "text", x: g.x, y: g.y - 0.8, t: 0, life: 2, text: fmt$(win) });
      }
    }
  }
  const net = coin - paid + rake;
  s.cash += net;
  s.fin.today.tables += net;
  o.stats.net += net;
  o.stats.today += net;
  o.stats.coin += coin;
}

const gamingSys = {
  id: "gaming",
  minute(s, rt) {
    const byId = new Map(s.guests.map((g) => [g.id, g]));
    for (const g of s.guests) {
      const a = g.act;
      if (!a || a.kind !== "play") continue;
      const o = rt.objById.get(a.obj);
      if (!o || o.broken) continue;
      const d = OBJECTS[o.type];
      if (d.game.table) continue;
      const A = ARCHETYPES[g.a];
      g.played++;
      if (A.cheat) {
        const take = R.range(s, 2, 5);
        s.cash -= take;
        s.fin.today.leakage += take;
        o.stats.net -= take;
        o.stats.today -= take;
        continue;
      }
      const perMin = d.game.sph / 60;
      let spins = Math.floor(perMin);
      if (R.chance(s, perMin - spins)) spins++;
      const bet = betFor(g, d);
      let coin = 0, paid = 0, done = 0;
      for (; done < spins; done++) {
        if (g.budget < bet) break;
        g.budget -= bet;
        coin += bet;
        const w = spinOutcome(s, rt, o, d, bet, g);
        g.budget += w;
        paid += w;
        if (R.chance(s, 1 / d.reliability)) { o.broken = true; done++; break; }
      }
      const net = coin - paid;
      s.cash += net;
      s.fin.today.slots += net;
      s.fin.today.spins[o.type] = (s.fin.today.spins[o.type] || 0) + done;
      o.stats.net += net;
      o.stats.today += net;
      o.stats.coin += coin;
      if (o.broken) {
        think(s, g, "broken");
        if (s.time - (rt.brokenNote ?? -999) > 60) { notify(s, rt, `A ${d.name} broke down.`, "warn"); rt.brokenNote = s.time; }
      }
    }
    for (const o of s.objects) {
      const d = OBJECTS[o.type];
      if (!d.game || !d.game.table) continue;
      const players = [];
      for (const id of o.occ) {
        const g = id && byId.get(id);
        if (g && g.act && g.act.kind === "play" && g.act.obj === o.id) players.push(g);
      }
      if (!players.length) continue;
      for (const g of players) g.played++;
      tableMinute(s, rt, o, d, players);
    }
  },
};

/* ---------- staff ---------- */
function makeStaff(s, entranceIdx, W, type) {
  return { id: newId(s), type, look: staffLook(s, type), dir: 2, x: (entranceIdx % W) + 0.5, y: Math.floor(entranceIdx / W) + 0.5, path: [], task: null };
}
function staffWander(s, rt, st, dist, r) {
  for (let k = 0; k < 20; k++) {
    const j = R.int(s, 0, rt.N - 1);
    if (dist[j] >= 2 && dist[j] <= r && rt.tile[j] === 0) { st.path = pathFromDist(rt, dist, j); return; }
  }
}
function janitorTick(s, rt, st, here) {
  if (st.task && st.task.kind === "clean") {
    const x = here % rt.W, y = (here / rt.W) | 0;
    let left = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (!inBounds(rt, nx, ny)) continue;
        const j = ny * rt.W + nx;
        if (s.dirt[j] > 0) { s.dirt[j] = Math.max(0, s.dirt[j] - (j === here ? 35 : 15)); left += s.dirt[j]; }
      }
    }
    if (left < 5) st.task = null;
    return;
  }
  const taken = s.staff.filter((o) => o !== st && o.task && o.task.kind === "clean").map((o) => o.task.tile);
  const dist = bfs(rt, here, rt.walk, 16);
  let best = -1, bs = 0;
  for (let j = 0; j < rt.N; j++) {
    if (dist[j] < 0 || s.dirt[j] < 10) continue;
    if (taken.some((t) => Math.abs((t % rt.W) - (j % rt.W)) + Math.abs(((t / rt.W) | 0) - ((j / rt.W) | 0)) < 3)) continue;
    const sc = s.dirt[j] - dist[j] * 1.5;
    if (sc > bs) { bs = sc; best = j; }
  }
  if (best >= 0) { st.task = { kind: "clean", tile: best }; st.path = pathFromDist(rt, dist, best); return; }
  if (R.chance(s, 0.3)) staffWander(s, rt, st, dist, 5);
}
function techTick(s, rt, st, here) {
  if (st.task) {
    const o = rt.objById.get(st.task.obj);
    if (!o || !o.broken) {
      if (o && o.claim === st.id) o.claim = 0;
      st.task = null;
    } else if (st.task.kind === "go") {
      st.task = { kind: "repair", obj: o.id, until: s.time + 20 };
      return;
    } else {
      if (s.time >= st.task.until) { o.broken = false; o.claim = 0; st.task = null; }
      return;
    }
  }
  const dist = bfs(rt, here, rt.walk);
  let best = null, bd = 1e9, seat = -1;
  for (const o of s.objects) {
    if (!o.broken || (o.claim && o.claim !== st.id)) continue;
    for (const i of accessTiles(rt, o)) if (dist[i] >= 0 && dist[i] < bd) { bd = dist[i]; best = o; seat = i; }
  }
  if (best) { best.claim = st.id; st.task = { kind: "go", obj: best.id }; st.path = pathFromDist(rt, dist, seat); return; }
  if (R.chance(s, 0.2)) staffWander(s, rt, st, dist, 4);
}
function securityTick(s, rt, st, here) {
  if (st.task && st.task.kind === "respond") {
    const inc = s.incidents.find((x) => x.id === st.task.inc);
    const g = inc && s.guests.find((x) => x.id === inc.gid);
    if (!inc || !g) {
      if (inc) s.incidents = s.incidents.filter((x) => x !== inc);
      st.task = null;
      return;
    }
    const gi = tileIndex(rt, g);
    const man = Math.abs((gi % rt.W) - (here % rt.W)) + Math.abs(((gi / rt.W) | 0) - ((here / rt.W) | 0));
    if (man <= 1) {
      s.incidents = s.incidents.filter((x) => x !== inc);
      removeGuest(s, rt, g);
      s.stats.scenesHandled++;
      notify(s, rt, "Security escorted a rowdy drunk out.", "info");
      st.task = null;
    } else {
      const dist = bfs(rt, here, rt.walk);
      st.path = pathFromDist(rt, dist, gi);
    }
    return;
  }
  const inc = s.incidents.find((x) => x.kind === "scene" && !x.guard);
  if (inc) {
    inc.guard = st.id;
    st.task = { kind: "respond", inc: inc.id };
    return;
  }
  if (R.chance(s, 0.35)) staffWander(s, rt, st, bfs(rt, here, rt.walk, 9), 8);
}
const staffSys = {
  id: "staff",
  frame(s, rt, dt) {
    for (const st of s.staff) if (st.path.length) moveAgent(rt, st, STAFF_TILES_PER_MIN * dt, null);
  },
  minute(s, rt) {
    for (const st of s.staff.slice()) {
      if (st.path.length) continue;
      const here = tileIndex(rt, st);
      if (st.type === "janitor") janitorTick(s, rt, st, here);
      else if (st.type === "tech") techTick(s, rt, st, here);
      else if (st.type === "security") securityTick(s, rt, st, here);
    }
  },
  layout(s, rt) {
    for (const st of s.staff) {
      st.path = [];
      if (st.task && st.task.obj != null) {
        const o = rt.objById.get(st.task.obj);
        if (o && o.claim === st.id) o.claim = 0;
      }
      if (st.task && st.task.kind !== "respond") st.task = null;
      const i = tileIndex(rt, st);
      if (!rt.walk[i]) {
        const j = nearestWalk(rt, i);
        if (j >= 0) { st.x = (j % rt.W) + 0.5; st.y = Math.floor(j / rt.W) + 0.5; }
      }
    }
  },
};

/* ---------- incidents and leakage ---------- */
const incidentSys = {
  id: "incidents",
  minute(s, rt) {
    for (const g of s.guests.slice()) {
      if (g.intox < 65 || !R.chance(s, 0.0035)) continue;
      const i = tileIndex(rt, g);
      if (R.chance(s, 0.6)) {
        addDirt(s, rt, i, 100, 45);
        for (const h of s.guests) if (h !== g && Math.hypot(h.x - g.x, h.y - g.y) < 2.5) { h.sat -= 6; think(s, h, "gross"); }
      } else if (!s.incidents.some((x) => x.gid === g.id)) {
        s.incidents.push({ id: newId(s), kind: "scene", gid: g.id, x: i % rt.W, y: (i / rt.W) | 0, start: s.time, guard: 0 });
        s.stats.scenes++;
        notify(s, rt, "A drunk guest is making a scene.", "warn");
      }
    }
    for (const inc of s.incidents.slice()) {
      if (inc.kind !== "scene") continue;
      const g = s.guests.find((x) => x.id === inc.gid);
      if (!g) { s.incidents = s.incidents.filter((x) => x !== inc); continue; }
      if (inc.guard && !s.staff.some((st) => st.id === inc.guard)) inc.guard = 0;
      inc.x = Math.floor(g.x);
      inc.y = Math.floor(g.y);
      for (const h of s.guests) {
        if (h === g || Math.hypot(h.x - g.x, h.y - g.y) > 3) continue;
        h.sat -= 0.35;
        if (R.chance(s, 0.03)) think(s, h, "scene");
      }
      if (s.time - inc.start > 45) {
        s.incidents = s.incidents.filter((x) => x !== inc);
        for (const h of s.guests) if (h !== g && Math.hypot(h.x - g.x, h.y - g.y) <= 3) h.sat -= 6;
        notify(s, rt, "A drunken scene went unhandled. Guests noticed.", "bad");
        endAct(s, rt, g);
        startLeave(s, rt, g);
      }
    }
    // Cheat detection uses total surveillance: hidden cameras count here.
    for (const g of s.guests.slice()) {
      if (!ARCHETYPES[g.a].cheat || !g.act || g.act.kind !== "play") continue;
      if (R.chance(s, (rt.f.SRV[g.act.tile] / 100) * 0.05)) {
        const o = rt.objById.get(g.act.obj);
        s.stats.cheatsCaught++;
        notify(s, rt, `Slot cheat caught at a ${o ? OBJECTS[o.type].name : "machine"}.`, "good");
        removeGuest(s, rt, g);
      }
    }
  },
};

/* ---------- money, research, goals ---------- */
function blankDay() {
  return {
    slots: 0, tables: 0, bar: 0, food: 0, atm: 0, insRecovered: 0,
    wages: 0, upkeep: 0, insurance: 0, research: 0, build: 0, sales: 0,
    jackpots: 0, leakage: 0, visitors: 0, satSum: 0, satN: 0, spins: {},
  };
}
function casinoValue(s) {
  let v = s.cash;
  for (const o of s.objects) { const d = OBJECTS[o.type]; if (!d.fixed) v += (o.cost ?? d.cost) * ASSET_VALUE; }
  return v;
}
function jackpotEV(s, spins) {
  let ev = 0;
  for (const [type, n] of Object.entries(spins || {})) {
    const g = OBJECTS[type]?.game;
    if (!g) continue;
    if (g.top) ev += n * g.top.p * g.top.pay;
    if (g.progressive) ev += n * g.progressive.p * Math.max(s.progressive.meter, g.progressive.seed);
  }
  return ev;
}
function insurancePremium(s, spins) {
  const ins = INSURANCE.find((x) => x.id === s.insurance) || INSURANCE[0];
  return Math.round(ins.cover * jackpotEV(s, spins) * INS_LOAD);
}
// Premium estimate for the UI: yesterday's play if we have it, else today's pace.
function premiumEstimate(s, id) {
  const ins = INSURANCE.find((x) => x.id === id) || INSURANCE[0];
  let spins = s.fin.yesterdaySpins;
  if (!spins) {
    const frac = Math.max(0.05, (s.time % 1440) / 1440);
    spins = {};
    for (const [k, v] of Object.entries(s.fin.today.spins)) spins[k] = v / frac;
  }
  return Math.round(ins.cover * jackpotEV(s, spins) * INS_LOAD);
}

const researchSys = {
  id: "research",
  day(s, rt) {
    const fund = RESEARCH_FUNDING[s.research.funding];
    const L = getLevel(s.levelId);
    const avail = (L.research || []).filter((id) => !s.research.done.includes(id));
    if (!fund || !fund.cost || !avail.length) return;
    s.cash -= fund.cost;
    s.fin.today.research += fund.cost;
    let cur = s.research.current;
    if (!cur || !avail.includes(cur)) cur = s.research.current = avail[0];
    s.research.progress[cur] = (s.research.progress[cur] || 0) + fund.pts;
    const item = RESEARCH[cur];
    if (s.research.progress[cur] >= item.pts) {
      s.research.done.push(cur);
      for (const t of item.unlocks || []) if (!s.unlocked.includes(t)) s.unlocked.push(t);
      for (const k of item.overlays || []) if (!s.overlays.includes(k)) s.overlays.push(k);
      s.research.current = avail.find((id) => id !== cur) || null;
      notify(s, rt, `Research complete: ${item.name}.`, "good");
    }
  },
};

const economySys = {
  id: "economy",
  hour(s) {
    let w = 0;
    for (const st of s.staff) w += STAFF[st.type].wage;
    for (const o of s.objects) w += OBJECTS[o.type].wage || 0; // dealers
    s.cash -= w;
    s.fin.today.wages += w;
  },
  day(s, rt) {
    let up = 0;
    for (const o of s.objects) up += objUpkeep(o);
    s.cash -= up;
    s.fin.today.upkeep += up;
    const prem = insurancePremium(s, s.fin.today.spins);
    s.cash -= prem;
    s.fin.today.insurance += prem;
    const T = s.fin.today;
    s.fin.history.push({ ...T, day: s.time / 1440, avgSat: T.satN ? T.satSum / T.satN : null, cashEnd: s.cash, value: casinoValue(s) });
    if (s.fin.history.length > 60) s.fin.history.shift();
    s.fin.yesterdaySpins = T.spins;
    s.fin.today = blankDay();
    s.thoughtsYday = s.thoughtsToday;
    s.thoughtsToday = {};
    for (const o of s.objects) o.stats.today = 0;
    const reserve = getLevel(s.levelId).start.reserve;
    if (s.cash < reserve) {
      s.reserveWarn++;
      notify(s, rt, `Gaming Control warning ${s.reserveWarn} of 3: cage cash is below the ${fmt$(reserve)} reserve.`, "bad");
    } else s.reserveWarn = 0;
  },
};

const goalSys = {
  id: "goals",
  day(s, rt) {
    if (s.outcome) return;
    const L = getLevel(s.levelId);
    const ended = s.time / 1440;
    const v = casinoValue(s);
    if (s.reserveWarn >= 3) {
      s.outcome = { result: "lose", day: ended, reason: "Gaming Control revoked your license. The cage sat below the required reserve three nights running." };
      return;
    }
    if (L.goal.type === "value") {
      if (v >= L.goal.target) {
        s.outcome = { result: "win", day: ended, value: v };
        notify(s, rt, "Scenario complete!", "gold");
      } else if (ended >= L.goal.day) {
        s.outcome = { result: "lose", day: ended, reason: `Casino value reached ${fmt$(v)} by the end of day ${L.goal.day}. The target was ${fmt$(L.goal.target)}.` };
      }
    }
  },
};

const fieldsSys = {
  id: "fields",
  every5: (s, rt) => computeDynamicFields(s, rt),
  every10(s, rt) {
    rt.pulses = rt.pulses.filter((p) => p.until > s.time);
    computeNoise(s, rt);
  },
  hour: (s, rt) => updateTraffic(s, rt),
};

// Order matters: research charges before the economy closes the books; goals read the closed books.
const SYSTEMS = [fieldsSys, arrivalsSys, gamingSys, guestSys, staffSys, incidentSys, researchSys, economySys, goalSys];

/* ============================= 6. ENGINE ============================ */
function makeObj(s, type, x, y, rot = 0, w = 0, h = 0) {
  const [ww, hh] = worldDims(type, rot, w, h);
  return {
    id: newId(s), type, x, y, rot, w: ww, h: hh, cost: placeCost(type, ww, hh),
    occ: [], res: [], broken: false, claim: 0, built: s.time, stats: { net: 0, today: 0, coin: 0, uses: 0 },
  };
}

export function newGame(levelId, seed) {
  const L = getLevel(levelId);
  const W = L.map[0].length, H = L.map.length;
  const s = {
    schema: SAVE_SCHEMA, version: VERSION, levelId,
    rng: (seed ?? Math.floor(Math.random() * 2147483647)) | 0,
    nextId: 1, time: L.start.time, frac: 0, speed: 1,
    map: L.map.slice(), objects: [], guests: [], staff: [], incidents: [],
    dirt: new Array(W * H).fill(0),
    cash: L.start.cash, reserveWarn: 0, rep: { ...L.rep },
    unlocked: [...L.tools], overlays: [...BASE_OVERLAYS],
    research: { funding: 1, current: (L.research || [])[0] || null, progress: {}, done: [] },
    insurance: "none", progressive: { meter: 5000 },
    fin: { today: blankDay(), history: [], yesterdaySpins: null },
    stats: { visits: {}, jackpots: 0, cheatsCaught: 0, cheatsEscaped: 0, scenes: 0, scenesHandled: 0 },
    thoughtsToday: {}, thoughtsYday: {}, news: [], outcome: null,
  };
  for (const p of L.preplaced || []) s.objects.push(makeObj(s, p.type, p.x, p.y, p.rot || 0, p.w, p.h));
  const ents = mapEntrances(L.map);
  for (const [t, n] of Object.entries(L.startStaff || {})) for (let k = 0; k < n; k++) s.staff.push(makeStaff(s, ents[k % ents.length], W, t));
  return s;
}

function runMinute(s, rt) {
  for (const sys of SYSTEMS) if (sys.minute) sys.minute(s, rt);
  const t = s.time;
  if (t % 5 === 0) for (const sys of SYSTEMS) if (sys.every5) sys.every5(s, rt);
  if (t % 10 === 0) for (const sys of SYSTEMS) if (sys.every10) sys.every10(s, rt);
  if (t % 60 === 0) for (const sys of SYSTEMS) if (sys.hour) sys.hour(s, rt);
  if (t % 1440 === 0) for (const sys of SYSTEMS) if (sys.day) sys.day(s, rt);
}

const simHalted = (s) => !!(s.outcome && !(s.outcome.result === "win" && s.outcome.ack));

// Advance by game minutes. Movement runs in small substeps; logic runs on minute boundaries.
export function advance(s, rt, dMin) {
  dMin = Math.min(dMin, MAX_CATCHUP_MIN);
  while (dMin > 1e-9 && !simHalted(s)) {
    const step = Math.min(dMin, 0.25, 1 - s.frac);
    for (const sys of SYSTEMS) if (sys.frame) sys.frame(s, rt, step);
    s.frac += step;
    dMin -= step;
    if (s.frac >= 1 - 1e-9) {
      s.frac = 0;
      s.time += 1;
      runMinute(s, rt);
    }
  }
}

function layoutChanged(s, rt) {
  rebuildLayout(s, rt);
  for (const sys of SYSTEMS) if (sys.layout) sys.layout(s, rt);
}

// Every walkable tile must stay reachable, and everything guests use needs a reachable seat.
function walkFor(rt, objects) {
  const walk = new Uint8Array(rt.N);
  for (let i = 0; i < rt.N; i++) walk[i] = rt.tile[i] !== 1 ? 1 : 0;
  for (const o of objects) for (const c of objLayout(o).cells) if (SOLID[c.role] && inBounds(rt, c.x, c.y)) walk[c.y * rt.W + c.x] = 0;
  return walk;
}
function connectivityOk(rt, objects) {
  const walk = walkFor(rt, objects);
  const dist = bfs(rt, rt.entrances[0], walk);
  for (let i = 0; i < rt.N; i++) if (walk[i] && dist[i] < 0) return false;
  for (const o of objects) {
    const d = OBJECTS[o.type];
    if (!(d.game || d.serves)) continue;
    let ok = false;
    for (const st of objLayout(o).seats) {
      if (!inBounds(rt, st.x, st.y)) continue;
      const i = st.y * rt.W + st.x;
      if (walk[i] && dist[i] >= 0) { ok = true; break; }
    }
    if (!ok) return false;
  }
  return true;
}
// Zones face their counter toward the wall they back onto.
function autoZoneRot(rt, x, y, w, h) {
  const solid = (X, Y) => !inBounds(rt, X, Y) || rt.tile[Y * rt.W + X] === 1 || !!rt.occ[Y * rt.W + X];
  const count = [0, 0, 0, 0];
  for (let i = 0; i < w; i++) { if (solid(x + i, y - 1)) count[0]++; if (solid(x + i, y + h)) count[2]++; }
  for (let j = 0; j < h; j++) { if (solid(x + w, y + j)) count[1]++; if (solid(x - 1, y + j)) count[3]++; }
  let best = 0;
  for (let r = 1; r < 4; r++) if (count[r] > count[best]) best = r;
  return best;
}

export const CMD = {
  canPlace(s, rt, type, x, y, rot = 0, w = 0, h = 0, ignoreId = 0) {
    const d = OBJECTS[type];
    if (!d) return { ok: false, msg: "Unknown item." };
    if (!ignoreId && !s.unlocked.includes(type)) return { ok: false, msg: "Research this first." };
    const r = d.rotatable ? rot & 3 : 0;
    if (d.zone) {
      if (!w || !h) { w = d.zone.min; h = d.zone.min; }
      if (w < d.zone.min || h < d.zone.min) return { ok: false, msg: `Make it at least ${d.zone.min} by ${d.zone.min}.` };
      if (w > d.zone.max || h > d.zone.max) return { ok: false, msg: `Too big. The limit is ${d.zone.max} by ${d.zone.max}.` };
    }
    const [ww, hh] = worldDims(type, r, w, h);
    const cand = { id: -1, type, x, y, rot: r, w: ww, h: hh };
    const cost = placeCost(type, ww, hh);
    for (let dy = 0; dy < hh; dy++) {
      for (let dx = 0; dx < ww; dx++) {
        const X = x + dx, Y = y + dy;
        if (!inBounds(rt, X, Y)) return { ok: false, msg: "That spot is off the floor.", cost, cand };
        if (rt.tile[Y * rt.W + X] !== 0) return { ok: false, msg: "You can't build on walls or the entrance.", cost, cand };
        const other = objAt(s, rt, X, Y);
        if (other && other.id !== ignoreId) return { ok: false, msg: "Something is already there.", cost, cand };
      }
    }
    if (!ignoreId && s.cash < cost) return { ok: false, msg: `You need ${fmt$(cost)} in cash.`, cost, cand };
    if (!d.walkable) {
      const objs = s.objects.filter((o) => o.id !== ignoreId);
      objs.push(cand);
      if (!connectivityOk(rt, objs)) return { ok: false, msg: "That would block an aisle or a seat.", cost, cand };
    }
    return { ok: true, cost, cand };
  },
  place(s, rt, type, x, y, rot = 0, w = 0, h = 0) {
    const c = CMD.canPlace(s, rt, type, x, y, rot, w, h);
    if (!c.ok) return c;
    s.cash -= c.cost;
    s.fin.today.build += c.cost;
    s.objects.push(makeObj(s, type, x, y, c.cand.rot, c.cand.w, c.cand.h));
    layoutChanged(s, rt);
    return { ok: true, cost: c.cost };
  },
  sell(s, rt, id) {
    const o = s.objects.find((x) => x.id === id);
    if (!o) return { ok: false, msg: "Nothing to sell there." };
    const d = OBJECTS[o.type];
    if (d.fixed) return { ok: false, msg: `The ${d.name} can't be sold.` };
    const refund = Math.round((o.cost ?? d.cost) * SELL_REFUND);
    s.cash += refund;
    s.fin.today.sales += refund;
    s.objects = s.objects.filter((x) => x !== o);
    layoutChanged(s, rt);
    return { ok: true, refund };
  },
  rotate(s, rt, id) {
    const o = s.objects.find((x) => x.id === id);
    if (!o) return { ok: false, msg: "Nothing to rotate." };
    const d = OBJECTS[o.type];
    if (!d.rotatable) return { ok: false, msg: "This can't be rotated." };
    for (let k = 1; k < 4; k++) {
      const rot = (o.rot + k) % 4;
      const [w, h] = d.zone ? [o.w, o.h] : worldDims(o.type, rot);
      if (!CMD.canPlace(s, rt, o.type, o.x, o.y, rot, w, h, o.id).ok) continue;
      for (const g of s.guests) {
        if (g.act && g.act.obj === o.id) endAct(s, rt, g);
        if (g.goal && g.goal.obj === o.id) releaseGoal(s, rt, g);
      }
      Object.assign(o, { rot, w, h, occ: [], res: [] });
      layoutChanged(s, rt);
      return { ok: true };
    }
    return { ok: false, msg: "There's no room to turn it here." };
  },
  hire(s, rt, type) {
    s.staff.push(makeStaff(s, R.pick(s, rt.entrances), rt.W, type));
    return { ok: true };
  },
  fire(s, rt, type) {
    const idx = s.staff.map((x) => x.type).lastIndexOf(type);
    if (idx < 0) return { ok: false };
    const st = s.staff[idx];
    if (st.task && st.task.obj != null) {
      const o = rt.objById.get(st.task.obj);
      if (o && o.claim === st.id) o.claim = 0;
    }
    for (const inc of s.incidents) if (inc.guard === st.id) inc.guard = 0;
    s.staff.splice(idx, 1);
    return { ok: true };
  },
  setInsurance(s, id) { s.insurance = id; },
  setFunding(s, n) { s.research.funding = n; },
  setResearch(s, id) { s.research.current = id; },
  setSpeed(s, n) { s.speed = n; },
  ackOutcome(s) { if (s.outcome) s.outcome.ack = true; },
};

/* =========================== 7. PERSISTENCE ========================= */
// Storage falls back to memory where localStorage is unavailable (sandboxed previews).
const memStore = {};
const Store = {
  get(k) {
    try { const v = window.localStorage.getItem(k); return v == null ? null : JSON.parse(v); }
    catch (e) { return memStore[k] ?? null; }
  },
  set(k, v) {
    const str = JSON.stringify(v);
    try { window.localStorage.setItem(k, str); }
    catch (e) { memStore[k] = JSON.parse(str); }
  },
  del(k) {
    try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ }
    delete memStore[k];
  },
};
// MIGRATIONS[n] upgrades a schema-n save to schema n+1.
const MIGRATIONS = {
  // 0.1 -> 0.2: seat-based objects, sized zones, rotation, and guest appearance.
  1: (s) => {
    for (const o of s.objects) {
      const d = OBJECTS[o.type];
      if (!d) continue;
      o.rot = 0;
      [o.w, o.h] = worldDims(o.type, 0, 2, 2);
      o.cost = placeCost(o.type, o.w, o.h);
      o.occ = [];
      o.res = [];
      delete o.occupant;
      delete o.reserved;
      delete o.users;
    }
    for (const g of s.guests) { g.act = null; g.goal = null; g.path = []; g.dir = 0; if (!g.look) g.look = pickLook(s, g.a); }
    for (const st of s.staff) { st.task = null; st.path = []; st.dir = 0; if (!st.look) st.look = staffLook(s, st.type); }
    s.incidents = [];
    s.fin.today.tables = s.fin.today.tables || 0;
    s.schema = 2;
    return s;
  },
};

function saveGame(s) { Store.set(SAVE_KEY, { savedAt: Date.now(), state: s }); }
function loadGame() {
  const pack = Store.get(SAVE_KEY);
  if (!pack || !pack.state) return null;
  let s = pack.state;
  if (typeof s.schema !== "number" || s.schema > SAVE_SCHEMA) return null;
  while (s.schema < SAVE_SCHEMA) {
    const m = MIGRATIONS[s.schema];
    if (!m) return null;
    s = m(s);
  }
  return getLevel(s.levelId) ? s : null;
}
function clearSave() { Store.del(SAVE_KEY); }
function loadProgress() {
  const p = Store.get(PROGRESS_KEY);
  return p && Array.isArray(p.completed) ? p : { completed: [], version: VERSION };
}
function saveProgress(p) { Store.set(PROGRESS_KEY, p); }
function isUnlocked(level, progress) {
  if (level.status !== "open") return false;
  if (level.tier === "story") {
    const story = LEVELS.filter((l) => l.tier === "story");
    const wins = story.filter((l) => progress.completed.includes(l.id)).length;
    return story.indexOf(level) < STORY_OPEN_AT_START + wins;
  }
  return false;
}

/* ============================ 8. RENDERER =========================== */
// Pixel-art pipeline: the world is drawn at PX pixels per tile into a low-res buffer,
// then scaled to the screen with smoothing off. Objects are drawn by ART[OBJECTS[type].art],
// so a new object only needs a new ART entry. Each art registers draw calls into three passes:
// flat (floors, tabletops, stools), sorted (anything with height, painted back to front), ceiling.
const PX = 16;
let C = null; // pixel context for the frame being drawn
const P = (c, x, y, w = 1, h = 1) => { C.fillStyle = c; C.fillRect(x, y, w, h); };
const HASH = (i) => {
  let x = Math.imul(i + 1, 2654435761) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 1274126177) >>> 0;
  return ((x ^ (x >>> 16)) % 10007) / 10007;
};
const HASH2 = (a, b) => HASH(a * 7919 + b * 104729);
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => clamp(Math.round(v + amt * 255), 0, 255);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
const SHADES = new Map();
const dk = (hex, amt = -0.2) => { const k = hex + amt; let v = SHADES.get(k); if (!v) { v = shade(hex, amt); SHADES.set(k, v); } return v; };
function makeLayerCanvas(w, h) {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}
const WORKERS = new Map();
function workerLook(kind, id) {
  const k = `${kind}:${id}`;
  let v = WORKERS.get(k);
  if (!v) {
    v = { ...WORKER_LOOKS[kind], skin: SKINS[Math.floor(HASH(id * 3 + 1) * SKINS.length)], hair: HAIRS[Math.floor(HASH(id * 5 + 2) * HAIRS.length)], style: "short" };
    WORKERS.set(k, v);
  }
  return v;
}

/* ---------- static floor ---------- */
function floorRGB(x, y, style) {
  const lx = x & 15, ly = y & 15;
  if (style === "wood") {
    const row = ly >> 2;
    const seam = (ly & 3) === 3 || ((lx + row * 5 + (x >> 4) * 3) & 15) === 0;
    return seam ? [58, 34, 22] : row & 1 ? [96, 58, 36] : [106, 64, 40];
  }
  if (style === "check") return ((lx >> 2) + (ly >> 2)) & 1 ? [40, 36, 40] : [224, 218, 204];
  const dd = Math.abs(lx - 7.5) + Math.abs(ly - 7.5);
  if (dd === 6) return [178, 134, 60];
  if (dd <= 2) return [40, 132, 122];
  if ((lx === 0 || lx === 15) && (ly === 0 || ly === 15)) return [38, 108, 100];
  return ((lx + ly) & 3) === 0 ? [72, 21, 35] : [84, 25, 41];
}
function wallRGB(rt, x, y) {
  const tx = x >> 4, ty = y >> 4, lx = x & 15, ly = y & 15;
  const border = tx === 0 || ty === 0 || tx === rt.W - 1 || ty === rt.H - 1;
  if (!border) return floorRGB(x, y);
  if (ty === 0) {
    if (ly < 10) return (x >> 1) & 1 ? [104, 24, 38] : [92, 20, 32];
    if (ly === 10) return [212, 166, 74];
    return ly === 15 ? [30, 18, 12] : [52, 30, 20];
  }
  if (ty === rt.H - 1) return ly === 0 ? [150, 112, 50] : [28, 18, 12];
  if ((tx === 0 && lx === 15) || (tx === rt.W - 1 && lx === 0)) return [150, 112, 50];
  return [34, 22, 16];
}
function entranceRGB(x, y) {
  const ly = y & 15;
  if (ly === 0) return [150, 112, 50];
  if (ly === 2 || ly === 13) return [212, 166, 74];
  return [142, 28, 30];
}
function buildStaticLayer(s, rt) {
  rt.layerKey = rt.layoutVer;
  const Wp = rt.W * PX, Hp = rt.H * PX;
  if (!rt.layer) rt.layer = makeLayerCanvas(Wp, Hp);
  const g = rt.layer && rt.layer.getContext ? rt.layer.getContext("2d") : null;
  if (!g) return;
  const zoneStyle = new Map();
  for (const o of s.objects) {
    const d = OBJECTS[o.type];
    if (!d.zone) continue;
    const st = d.art === "bar" ? "wood" : "check";
    for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) zoneStyle.set(y * rt.W + x, st);
  }
  const img = g.createImageData ? g.createImageData(Wp, Hp) : null;
  if (!img || !img.data) return;
  const px = img.data;
  for (let y = 0; y < Hp; y++) {
    for (let x = 0; x < Wp; x++) {
      const i = (y >> 4) * rt.W + (x >> 4), t = rt.tile[i];
      const col = t === 1 ? wallRGB(rt, x, y) : t === 2 ? entranceRGB(x, y) : floorRGB(x, y, zoneStyle.get(i));
      const k = (y * Wp + x) * 4;
      px[k] = col[0]; px[k + 1] = col[1]; px[k + 2] = col[2]; px[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

/* ---------- small shapes ---------- */
function roundedRect(x, y, w, h, r, c) {
  for (let j = 0; j < h; j++) {
    const dy = j < r ? r - j : j >= h - r ? j - (h - r - 1) : 0;
    const inset = dy ? r - Math.round(Math.sqrt(Math.max(0, r * r - dy * dy))) : 0;
    P(c, x + inset, y + j, w - inset * 2, 1);
  }
}
function disc(cx, cy, r, c) {
  for (let j = -r; j <= r; j++) { const w = Math.round(Math.sqrt(r * r - j * j)); P(c, cx - w, cy + j, w * 2 + 1, 1); }
}
function drawStool(x, y) {
  P("rgba(0,0,0,0.28)", x - 2, y + 3, 5, 1);
  P("#b8893a", x, y + 1, 1, 2);
  P("#6b1a1a", x - 2, y, 5, 1);
  P("#b03636", x - 2, y - 1, 5, 1);
}
function drawChair(x, y, fx, fy) {
  P("rgba(0,0,0,0.28)", x - 2, y + 2, 5, 1);
  P("#6b3a22", x - 2, y - 1, 5, 3);
  P("#8a5030", x - 2, y - 1, 5, 1);
  if (fx > 0) P("#4a2614", x - 3, y - 4, 1, 6);
  else if (fx < 0) P("#4a2614", x + 3, y - 4, 1, 6);
  else if (fy > 0) P("#4a2614", x - 2, y - 4, 5, 2);
}
function card(x, y, down, h) {
  P("rgba(0,0,0,0.3)", x + 1, y + 1, 3, 4);
  P(down ? "#b02838" : "#f6f6f6", x, y, 3, 4);
  if (!down) P(h < 0.5 ? "#d02020" : "#141414", x + 1, y + 1, 1, 2);
}

/* ---------- people ---------- */
function drawHat(R, lk, side, back) {
  const h = lk.hat;
  if (!h) return;
  const c = lk.hatColor || (h === "sun" ? "#e0c070" : h === "visor" ? "#f2f2f2" : h === "chef" ? "#fafafa" : h === "hood" ? lk.shirt : "#3a5a8a");
  if (h === "hood") {
    if (side) { R(-2, 0, 4, 2, c); R(1, 2, 1, 3, c); }
    else { R(-2, 0, 5, 2, c); R(-2, 2, 1, 3, c); R(2, 2, 1, 3, c); if (back) R(-2, 2, 5, 3, c); }
    return;
  }
  if (h === "chef") { R(-2, -3, 5, 4, c); return; }
  if (h === "sun") { R(-1, 0, 3, 1, c); R(side ? -3 : -3, 1, side ? 6 : 7, 1, dk(c)); return; }
  if (h === "visor") { R(-2, 1, 5, 1, c); if (!back) R(side ? -3 : -2, 2, side ? 2 : 5, 1, "#3a8a5a"); return; }
  R(-1, 0, 3, 1, c);
  R(-2, 1, side ? 4 : 5, 1, c);
  if (!back) R(side ? -3 : -2, 2, side ? 2 : 5, 1, dk(c, -0.15));
}
// x = center column, y = feet row (world pixels). dir: 0 down, 1 left, 2 up, 3 right.
function drawPerson(x, y, lk, pose, dir, frame, opt = {}) {
  const sit = pose === "sit";
  const T = y - (sit ? 10 : 12);
  const mir = dir === 3, side = dir === 1 || dir === 3, back = dir === 2;
  const R = (dx, row, w, h, c) => { C.fillStyle = c; C.fillRect(mir ? x - dx - w + 1 : x + dx, T + row, w, h); };
  const skin = lk.skin || "#e3b48c", hair = lk.hair || "#2a1a12", shirt = lk.shirt || "#777777", pants = lk.pants || "#2e3440", shoe = "#241810";
  const hc = lk.style === "bald" ? skin : hair;
  const sd = dk(shirt);
  if (!opt.half) { C.fillStyle = "rgba(0,0,0,0.3)"; C.fillRect(x - 3, y + (sit ? 2 : 0), 7, 2); }
  if (sit) drawStool(x, y + 1);
  if (!side) {
    R(-1, 0, 3, 1, hc);
    R(-2, 1, 5, 1, hc);
    if (back) { R(-2, 2, 5, 2, hc); R(-1, 4, 3, 1, lk.style === "bald" ? skin : hc); }
    else {
      R(-2, 2, 5, 1, hc); R(-1, 2, 3, 1, skin); R(-2, 3, 5, 1, skin); R(-1, 4, 3, 1, skin);
      if (lk.glasses) { R(-2, 3, 2, 1, "#101010"); R(1, 3, 2, 1, "#101010"); }
      else { R(-1, 3, 1, 1, "#1b1010"); R(1, 3, 1, 1, "#1b1010"); }
    }
    if (lk.style === "long") { R(-3, 2, 1, 4, hc); R(3, 2, 1, 4, hc); if (back) R(-2, 4, 5, 2, hc); }
    if (lk.style === "curly") { R(-3, 1, 1, 2, hc); R(3, 1, 1, 2, hc); }
  } else {
    R(-1, 0, 3, 1, hc); R(-2, 1, 4, 1, hc); R(-2, 2, 3, 2, skin); R(1, 2, 1, 2, hc); R(-1, 4, 2, 1, skin);
    R(-2, 3, lk.glasses ? 2 : 1, 1, lk.glasses ? "#101010" : "#1b1010");
    if (lk.style === "long") R(1, 2, 1, 4, hc);
  }
  drawHat(R, lk, side, back);
  const f = pose === "walk" ? frame : 0;
  if (!side) {
    R(-3, 5, 7, 2, shirt);
    R(-2, 7, 5, 2, shirt);
    const lh = f === 1 ? 7 : 8, rh = f === 3 ? 7 : 8;
    if (lh === 8) R(-3, 7, 1, 1, sd);
    R(-3, lh, 1, 1, skin);
    if (opt.armUp) { R(3, 3, 1, 3, sd); R(3, 3, 1, 1, skin); }
    else { if (rh === 8) R(3, 7, 1, 1, sd); R(3, rh, 1, 1, skin); }
    if (lk.vest) { if (back) R(-2, 5, 5, 4, lk.vest); else { R(-2, 5, 1, 4, lk.vest); R(2, 5, 1, 4, lk.vest); } }
    if (!back) {
      if (lk.pattern) { R(-1, 6, 1, 1, "#fff6c8"); R(1, 7, 1, 1, "#fff6c8"); R(-2, 8, 1, 1, "#fff6c8"); }
      if (lk.bowtie) R(-1, 5, 3, 1, "#c02028");
      if (lk.badge) R(-2, 6, 1, 1, "#e8c040");
      if (opt.drink) { R(3, 6, 1, 2, "#e0a030"); R(3, 6, 1, 1, "#f4ecd8"); }
    }
  } else {
    R(-1, 5, 3, 4, shirt);
    R(0, 5, 1, 3, sd);
    if (lk.vest) R(1, 5, 1, 4, lk.vest);
    if (lk.pattern) R(-1, 6, 1, 1, "#fff6c8");
    R(opt.armUp ? -2 : f === 1 ? -1 : f === 3 ? 1 : 0, opt.armUp ? 6 : 8, 1, 1, skin);
    if (opt.drink) R(-2, 5, 1, 2, "#e0a030");
  }
  if (opt.half) return;
  const low = lk.shorts ? skin : pants;
  if (!sit) {
    if (!side) {
      R(-2, 9, 5, 1, pants);
      const leg = (dx, up) => {
        R(dx, 10, 2, 1, pants);
        if (up) R(dx, 11, 2, 1, shoe);
        else { R(dx, 11, 2, 1, low); R(dx, 12, 2, 1, shoe); }
      };
      leg(-2, f === 1);
      leg(1, f === 3);
    } else {
      R(-1, 9, 3, 1, pants);
      if (f === 1 || f === 3) { R(-2, 10, 1, 2, low); R(1, 10, 1, 2, low); R(-3, 12, 2, 1, shoe); R(1, 12, 2, 1, shoe); }
      else { R(-1, 10, 2, 2, low); R(-2, 12, 3, 1, shoe); }
    }
  } else if (!side) {
    R(-2, 9, 5, 1, pants);
    if (!back) { R(-2, 10, 2, 1, low); R(1, 10, 2, 1, low); R(-2, 11, 2, 1, shoe); R(1, 11, 2, 1, shoe); }
  } else {
    R(-3, 9, 4, 1, pants);
    R(-3, 10, 1, 1, low);
    R(-4, 11, 2, 1, shoe);
  }
  if (lk.prop === "mop") { R(4, 3, 1, 9, "#8a6a3a"); R(3, 12, 3, 1, "#d0d0d0"); }
  if (lk.prop === "toolbox") { R(3, 9, 3, 2, "#c83030"); R(4, 8, 1, 1, "#707070"); }
}

/* ---------- slots ---------- */
const SYM = {
  cherry: ["..g", "r.r", "r.r"], seven: ["rrr", "..r", ".r."], bell: [".y.", "yyy", "yyy"],
  bar: ["...", "kkk", "..."], plum: [".p.", "ppp", ".p."], shoe: ["o.o", "o.o", "ooo"],
};
const SYMC = { r: "#d8202c", g: "#2e9a3a", y: "#e0a818", k: "#1c1c1c", p: "#8a3ab8", o: "#b8862a" };
const REEL_FLICKER = ["#f4ead2", "#e8c040", "#d8202c", "#f4ead2"];
function drawSym(name, x, y, top, bot) {
  const m = SYM[name];
  if (!m) return;
  for (let r = 0; r < 3; r++) {
    const yy = y + r;
    if (yy < top || yy > bot) continue;
    for (let c = 0; c < 3; c++) if (m[r][c] !== ".") P(SYMC[m[r][c]], x + c, yy);
  }
}
function reelResult(o, syms, ci, r, jp) {
  const n = syms.length;
  if (jp) return Math.max(0, syms.indexOf("seven"));
  const a = Math.floor(HASH2(o.id, ci * 3) * n), b = Math.floor(HASH2(o.id, ci * 3 + 1) * n);
  if (r === 0) return a;
  if (r === 1) return b;
  let c = Math.floor(HASH2(o.id, ci * 3 + 2) * n);
  if (a === b && c === a) c = (c + 1) % n; // three of a kind only ever shows on a real jackpot
  return c;
}
function drawReels(o, d, x, y, now, busy, jp) {
  const syms = d.reels || ["cherry", "bell", "seven", "bar"], n = syms.length;
  P("#f4ead2", x, y, 11, 7);
  const t = now + o.id * 613, ph = t % 2600, ci = busy ? Math.floor(t / 2600) : o.id;
  for (let r = 0; r < 3; r++) {
    const rx = x + r * 4;
    if (busy && !jp && ph < 700 + r * 280) {
      const off = Math.floor(now / 35) % 4, base = Math.floor(now / 140) + r * 2;
      for (let k = -1; k <= 2; k++) drawSym(syms[(((base - k) % n) + n) % n], rx, y - 2 + off + k * 4, y, y + 6);
    } else {
      const res = reelResult(o, syms, ci, r, jp);
      drawSym(syms[(res + n - 1) % n], rx, y - 2, y, y + 6);
      drawSym(syms[res], rx, y + 2, y, y + 6);
      drawSym(syms[(res + 1) % n], rx, y + 6, y, y + 6);
    }
  }
  P("#2a1810", x + 3, y, 1, 7);
  P("#2a1810", x + 7, y, 1, 7);
  P("rgba(255,255,255,0.35)", x, y, 11, 1);
  if (jp && Math.floor(now / 150) & 1) P("#e02020", x, y + 3, 11, 1);
}
function drawVP(o, x, y, now, busy, jp) {
  P("#0c2a7a", x, y, 11, 7);
  const ci = busy ? Math.floor((now + o.id * 431) / 1700) : o.id;
  for (let i = 0; i < 5; i++) {
    const cx = x + 1 + i * 2;
    P(jp ? ((Math.floor(now / 120) + i) & 1 ? "#fff4b0" : "#ffffff") : i & 1 ? "#e4e4e4" : "#fafafa", cx, y + 1, 2, 4);
    P(jp || HASH2(o.id + i, ci) < 0.5 ? "#d02020" : "#141414", cx, y + 2, 1, 1);
    if (busy && HASH2(o.id * 3 + i, ci) < 0.4) P("#f0d040", cx, y + 6, 2, 1);
  }
}
function drawSlot(o, d, env) {
  const { now, rt } = env;
  const x0 = o.x * PX, y0 = o.y * PX, rot = o.rot || 0;
  const top = y0 + (d.tall ? -6 : -2);
  const body = d.color, bd = dk(body, -0.25), bl = dk(body, 0.18);
  const jp = (rt.jackpots.get(o.id) || 0) > now;
  const busy = !!(o.occ && o.occ[0]);
  const flash = jp && Math.floor(now / 90) & 1;
  P("rgba(0,0,0,0.3)", x0 + 2, y0 + 13, 13, 3);
  if (rot === 0) {
    P(bd, x0 + 1, top, 14, y0 + 15 - top);
    P(body, x0 + 2, top, 12, y0 + 14 - top);
    P(flash ? "#fff7c0" : bl, x0 + 2, top, 12, d.tall ? 4 : 2);
    if (d.tall) for (let i = 0; i < 4; i++) {
      const lit = jp || ((Math.floor(now / (busy ? 160 : 600)) + i) & 3) === 0;
      P(lit ? "#fff2a0" : bd, x0 + 3 + i * 3, top + 1, 2, 2);
    }
    const sy = y0 + (d.tall ? -1 : 1);
    P("#140c0a", x0 + 2, sy - 1, 13, 9);
    if (o.broken) { P("#2a1a1a", x0 + 3, sy, 11, 7); if (Math.floor(now / 300) & 1) P("#e03030", x0 + 7, sy + 2, 2, 3); }
    else if (d.art === "vp") drawVP(o, x0 + 3, sy, now, busy, jp);
    else drawReels(o, d, x0 + 3, sy, now, busy, jp);
    P(bd, x0 + 2, sy + 8, 12, 2);
    P(busy ? "#ffdd55" : "#7a5a2a", x0 + 4, sy + 8, 2, 1);
    P(busy ? "#ff6060" : "#6a2a2a", x0 + 10, sy + 8, 2, 1);
    P("#0c0808", x0 + 5, y0 + 13, 6, 1);
  } else if (rot === 2) {
    P(bd, x0 + 1, top, 14, y0 + 15 - top);
    P(dk(body, -0.12), x0 + 2, top + 1, 12, y0 + 13 - top);
    for (let k = 0; k < 3; k++) P(bd, x0 + 4, top + 4 + k * 3, 8, 1);
    P(flash ? "#fff7c0" : bd, x0 + 2, top, 12, 2);
  } else {
    const west = rot === 1;
    P(bd, x0 + 3, top, 10, y0 + 15 - top);
    P(body, x0 + 4, top, 8, y0 + 14 - top);
    P(flash ? "#fff7c0" : bl, x0 + 4, top, 8, d.tall ? 3 : 2);
    const sx = west ? x0 + 3 : x0 + 11;
    P("#140c0a", sx, y0 + (d.tall ? -1 : 1), 2, 8);
    if (o.broken) { if (Math.floor(now / 300) & 1) P("#e03030", sx, y0 + 2, 2, 2); }
    else P(busy ? REEL_FLICKER[(Math.floor(now / 90) + o.id) % REEL_FLICKER.length] : "#e8dcc0", sx + (west ? 0 : 1), y0 + (d.tall ? 1 : 3), 1, 4);
  }
  if (o.broken && Math.floor(now / 400) & 1) { P("rgba(160,160,160,0.7)", x0 + 6, top - 3, 2, 2); P("rgba(160,160,160,0.45)", x0 + 8, top - 6, 2, 2); }
}

/* ---------- tables ---------- */
// Tabletops are drawn in their unrotated frame and turned with the canvas, so art is written once.
function withLocal(o, fn) {
  const [A, B] = localDims(o);
  C.save();
  C.translate(o.x * PX + (o.w * PX) / 2, o.y * PX + (o.h * PX) / 2);
  C.rotate(((o.rot || 0) * Math.PI) / 2);
  C.translate(-(A * PX) / 2, -(B * PX) / 2);
  fn(A * PX, B * PX);
  C.restore();
}
function localToWorld(o, lx, ly) {
  const [A, B] = localDims(o);
  const dx = lx - (A * PX) / 2, dy = ly - (B * PX) / 2;
  const r = (o.rot || 0) & 3;
  const [rx, ry] = r === 1 ? [-dy, dx] : r === 2 ? [-dx, -dy] : r === 3 ? [dy, -dx] : [dx, dy];
  return [Math.round(o.x * PX + (o.w * PX) / 2 + rx), Math.round(o.y * PX + (o.h * PX) / 2 + ry)];
}
const TABLE_SPOTS = [[8, 25], [24, 25], [40, 25], [5, 18], [43, 18], [12, 8], [36, 8]];
const CARD_OFF = [[-2, -8], [-2, -8], [-2, -8], [3, -3], [-6, -3], [-2, 3], [-2, 3]];
const CHIP_COL = ["#e04040", "#3a8ae0", "#f0c040", "#40c070", "#c060e0", "#f08030", "#e0e0e0"];
function chips(x, y, c, n = 2) { for (let k = 0; k < n; k++) { P(dk(c, -0.25), x, y - k + 1, 2, 1); P(c, x, y - k, 2, 1); } }
function bjSurface(o, now) {
  roundedRect(1, 9, 46, 22, 9, "#4a2a14");
  roundedRect(3, 10, 42, 19, 8, "#1f6b45");
  P("#2a8055", 8, 12, 32, 1);
  P("#1a1010", 16, 10, 16, 3);
  for (let i = 0; i < 7; i++) P(CHIP_COL[i % 5], 17 + i * 2, 11);
  P("#3a2a2a", 37, 11, 5, 4);
  P("#f4f4f4", 38, 12, 3, 1);
  P("#2f8a5a", 10, 20, 28, 1);
  const busy = o.occ.map(Boolean);
  for (let k = 0; k < 5; k++) {
    const [sx, sy] = TABLE_SPOTS[k];
    P("#3a9a68", sx - 1, sy - 3, 3, 1);
    if (busy[k]) chips(sx - 1, sy - 2, CHIP_COL[k]);
  }
  if (!busy.some(Boolean)) return;
  const t = (now + o.id * 777) % 5200, round = Math.floor((now + o.id * 777) / 5200);
  if (t > 4400) return;
  const order = [];
  for (let r = 0; r < 2; r++) { for (let k = 0; k < 5; k++) if (busy[k]) order.push([k, r]); order.push([-1, r]); }
  order.slice(0, Math.floor(t / 320)).forEach(([k, r]) => {
    const [cx, cy] = k < 0 ? [21 + r * 4, 14] : [TABLE_SPOTS[k][0] + CARD_OFF[k][0] + r * 2, TABLE_SPOTS[k][1] + CARD_OFF[k][1]];
    card(cx, cy, k < 0 && r === 1 && t < 2900, HASH2(o.id, round * 13 + k * 2 + r));
  });
}
function rouletteSurface(o, now) {
  roundedRect(1, 5, 46, 26, 5, "#4a2a14");
  roundedRect(3, 7, 42, 22, 4, "#1f6b45");
  const cx = 12, cy = 18;
  const any = o.occ.some(Boolean);
  const t = (now + o.id * 997) % 7000, round = Math.floor((now + o.id * 997) / 7000);
  disc(cx, cy, 8, "#6b3a1a");
  disc(cx, cy, 7, "#2a1810");
  const a = (now * (any ? 0.003 : 0.0008)) % (Math.PI * 2);
  for (let k = 0; k < 18; k++) {
    const ang = a + (k * Math.PI * 2) / 18;
    const c = k === 0 ? "#2e9a3a" : k & 1 ? "#c81e2a" : "#141414";
    P(c, Math.round(cx + Math.cos(ang) * 5), Math.round(cy + Math.sin(ang) * 5));
    P(c, Math.round(cx + Math.cos(ang) * 4), Math.round(cy + Math.sin(ang) * 4));
  }
  disc(cx, cy, 2, "#8a5a2a");
  P("#d4a64a", cx - 1, cy - 1, 3, 3);
  for (let k = 0; k < 4; k++) { const ang = a + (k * Math.PI) / 2; P("#e8c060", Math.round(cx + Math.cos(ang) * 3), Math.round(cy + Math.sin(ang) * 3)); }
  let bang, br;
  if (any && t < 3800) { const p = t / 3800; bang = -22 * (1 - (1 - p) * (1 - p)); br = 7; }
  else if (any && t < 4600) { const p = (t - 3800) / 800; bang = -22 - p * 1.5; br = 7 - p * 2; }
  else { bang = a + 1.3 + round; br = 5; }
  P("#ffffff", Math.round(cx + Math.cos(bang) * br), Math.round(cy + Math.sin(bang) * br));
  P("#2e9a3a", 23, 10, 2, 12);
  for (let c = 0; c < 10; c++) for (let r = 0; r < 3; r++) P((c + r) & 1 ? "#c81e2a" : "#141414", 25 + c * 2, 10 + r * 4, 2, 4);
  P("#c81e2a", 25, 24, 6, 3);
  P("#141414", 31, 24, 6, 3);
  P("#2f8a5a", 37, 24, 8, 3);
  if (!any || t > 6000) return;
  for (let k = 0; k < 5; k++) {
    if (!o.occ[k] || t < 300 + k * 200) continue;
    const h1 = HASH2(o.id * 5 + k, round), h2 = HASH2(o.id * 7 + k, round + 99);
    chips(25 + Math.floor(h1 * 18), 11 + Math.floor(h2 * 15), CHIP_COL[k]);
  }
}
function pokerSurface(o, now) {
  for (let yy = 4; yy <= 28; yy++) {
    const dy = (yy - 16) / 12.5, hw = Math.round(22 * Math.sqrt(Math.max(0, 1 - dy * dy)));
    P("#4a2a14", 24 - hw, yy, hw * 2, 1);
    if (yy > 5 && yy < 27) { const fw = Math.max(0, hw - 2); P("#1f6b45", 24 - fw, yy, fw * 2, 1); }
  }
  P("#2a8055", 12, 9, 24, 1);
  const seated = [];
  o.occ.forEach((id, k) => { if (id) seated.push(k); });
  for (const k of seated) { const [sx, sy] = TABLE_SPOTS[k]; chips(sx - 1, sy + (k >= 5 ? 2 : -3), CHIP_COL[k], 3); }
  if (seated.length < 2) { P("#b02838", 22, 12, 3, 4); P("#b02838", 23, 11, 3, 4); return; }
  const t = (now + o.id * 611) % 9000, round = Math.floor((now + o.id * 611) / 9000);
  const winner = seated[Math.floor(HASH2(o.id, round) * seated.length)];
  for (const k of seated) {
    const [sx, sy] = TABLE_SPOTS[k], [ox, oy] = CARD_OFF[k];
    const show = t > 7000 && k === winner;
    card(sx + ox, sy + oy, !show, HASH2(k, round));
    card(sx + ox + 2, sy + oy, !show, HASH2(k + 9, round));
  }
  const nc = t < 2500 ? 0 : t < 4000 ? 3 : t < 5500 ? 4 : 5;
  for (let i = 0; i < nc; i++) card(14 + i * 4, 13, false, HASH2(o.id + i, round));
  const pot = Math.min(4, 1 + Math.floor(t / 2000));
  if (t < 7600) chips(23, 21, "#f0c040", pot);
}
const TABLE_SURF = { blackjack: bjSurface, roulette: rouletteSurface, poker: pokerSurface };
const DEALER_AT = { blackjack: [24, 13], roulette: [30, 10], poker: [24, 7] };

/* ---------- bars and diners ---------- */
const BOTTLES = ["#3a8a3a", "#b06a20", "#d8d8c0", "#6a2a8a", "#2a5aa0", "#a02a2a"];
function zoneSurface(o, d, env, w) {
  const bar = d.art === "bar";
  const tier = zoneTier(o) || {};
  const now = env.now;
  const lay = env.rt.lay.get(o.id);
  if (bar) {
    P("#2a160c", 0, 0, w, 6);
    for (let x = 1; x < w - 1; x += 3) { const c = BOTTLES[Math.floor(HASH2(o.id, x) * BOTTLES.length)]; P(c, x, 2, 2, 3); P(c, x, 1); }
    P("#5a3520", 0, 5, w, 1);
    if (tier.prs) P(Math.floor(now / 700 + o.id) % 5 ? "#ff4fd8" : "#9a2a80", 2, 0, w - 4, 1);
  } else {
    P("#d8d2c4", 0, 0, w, 6);
    for (let x = 2; x < w - 2; x += 6) { P("#b8bcc4", x, 1, 4, 3); P(HASH2(o.id, x) < 0.5 ? "#c8702a" : "#6a9a3a", x + 1, 2, 2, 1); }
    if (tier.relief >= 20) for (let x = 3; x < w - 2; x += 6) { const up = Math.floor(now / 250 + x) % 4; P("rgba(255,255,255,0.6)", x + (up & 1), -up, 1, 1); }
  }
  P(bar ? "#8a5a34" : "#e4ded0", 0, 6, w, 4);
  P(bar ? "#a8703f" : "#f6f2e8", 0, 6, w, 1);
  P(bar ? "#5a3520" : "#c83a3a", 0, 10, w, 5);
  P(bar ? "#d4a64a" : "#e8e8e8", 0, 13, w, 1);
  const [A] = localDims(o);
  for (let u = 0; u < A; u++) {
    if (!o.occ[u]) continue;
    if (bar) { P("#e0a030", u * PX + 7, 7, 2, 2); P("#f4ecd8", u * PX + 7, 7, 2, 1); }
    else { P("#f4f4f4", u * PX + 5, 7, 5, 2); P("#c8702a", u * PX + 6, 7, 3, 1); }
  }
  for (const c of lay.cells) {
    if (c.role !== "table") continue;
    const tx = c.u * PX, ty = c.v * PX;
    const near = lay.seats.some((st, k) => o.occ[k] && Math.abs(st.x - c.x) + Math.abs(st.y - c.y) === 1);
    if (bar) {
      disc(tx + 8, ty + 8, 4, "#3a2214");
      disc(tx + 8, ty + 8, 3, "#6b4226");
      P(Math.floor(now / 200 + c.u) % 3 ? "#f0c040" : "#ff8a30", tx + 8, ty + 6);
      if (near) P("#e0a030", tx + 6, ty + 8, 1, 2);
    } else {
      P("#8a5a34", tx + 3, ty + 3, 10, 10);
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if ((i + j) & 1) P("#d84040", tx + 4 + i * 2, ty + 4 + j * 2, 2, 2); else P("#f0ece4", tx + 4 + i * 2, ty + 4 + j * 2, 2, 2);
      if (near) { P("#ffffff", tx + 5, ty + 6, 3, 2); P("#c8702a", tx + 6, ty + 6); }
    }
  }
}

/* ---------- buildings and props ---------- */
function drawBuilding(o, env, kind) {
  const x0 = o.x * PX, y0 = o.y * PX, w = o.w * PX, h = o.h * PX, rot = o.rot || 0, now = env.now;
  const roofTop = y0 - 8, wallTop = y0 + h - 12;
  const cage = kind === "cage";
  const wallC = cage ? "#5a3a1a" : "#8ab8c8";
  P("rgba(0,0,0,0.3)", x0 + 2, y0 + h - 1, w, 3);
  P(wallC, x0, wallTop, w, 12);
  P(dk(wallC, -0.2), x0, y0 + h - 2, w, 2);
  if (!cage) for (let yy = wallTop + 3; yy < y0 + h - 2; yy += 3) P("rgba(255,255,255,0.12)", x0, yy, w, 1);
  P(cage ? "#3a2a14" : "#d8d0bc", x0, roofTop, w, wallTop - roofTop);
  for (let yy = roofTop + 3; yy < wallTop - 2; yy += 4) P(cage ? "#4a3618" : "#c8c0aa", x0 + 1, yy, w - 2, 1);
  P(cage ? "#d4a64a" : "#3f7f9a", x0, wallTop - 2, w, 2);
  const cx = x0 + w / 2, cy = roofTop + Math.floor((wallTop - roofTop) / 2);
  if (cage) {
    const dollar = [".xx", "xx.", ".xx", "xx.", ".x."];
    dollar.forEach((row, j) => { for (let i = 0; i < 3; i++) if (row[i] === "x") P("#ffd36b", cx - 1 + i, cy - 3 + j); });
    for (const wx of [x0 + 3, x0 + 19]) {
      P("#1a1008", wx, wallTop + 1, 10, 8);
      drawPerson(wx + 5, wallTop + 12, workerLook("cashier", o.id + wx), "stand", 0, 0, { half: true });
      for (let bx = wx; bx < wx + 10; bx += 2) P("#d4a64a", bx, wallTop + 1, 1, 8);
      P("#d4a64a", wx, wallTop + 8, 10, 1);
    }
    return;
  }
  P("#ffffff", cx - 5, cy - 2, 1, 1); P("#ffffff", cx - 6, cy - 1, 3, 2); P("#ffffff", cx - 6, cy + 1, 1, 2); P("#ffffff", cx - 4, cy + 1, 1, 2);
  P("#ffffff", cx + 4, cy - 2, 1, 1); P("#ffffff", cx + 3, cy - 1, 3, 1); P("#ffffff", cx + 2, cy, 5, 2); P("#ffffff", cx + 3, cy + 2, 1, 1); P("#ffffff", cx + 5, cy + 2, 1, 1);
  const open = now - (env.rt.doorFx.get(o.id) || -1e9) < 500;
  const door = (x, y, dw, dh) => { P(open ? "#140e0a" : "#6b4428", x, y, dw, dh); if (!open) P("#d4a64a", x + dw - 2, y + (dh >> 1), 1, 1); };
  if (rot === 0) { door(x0 + 4, wallTop + 2, 8, 10); door(x0 + 20, wallTop + 2, 8, 10); }
  else if (rot === 2) { door(x0 + 4, roofTop, 8, 3); door(x0 + 20, roofTop, 8, 3); }
  else { const dx = rot === 1 ? x0 : x0 + w - 3; door(dx, y0 + 2, 3, 9); door(dx, y0 + 18, 3, 9); }
}
function drawAtm(o, env) {
  const x0 = o.x * PX, y0 = o.y * PX, rot = o.rot || 0;
  P("rgba(0,0,0,0.3)", x0 + 3, y0 + 13, 11, 2);
  P("#2e5a48", x0 + 3, y0 - 4, 10, 18);
  P("#3c8d5a", x0 + 4, y0 - 3, 8, 16);
  if (rot === 0) {
    P("#0a1a24", x0 + 5, y0 - 1, 6, 5);
    P(Math.floor(env.now / 600) & 1 ? "#7fd0ff" : "#5ab0e0", x0 + 6, y0, 4, 3);
    P("#1a1a1a", x0 + 5, y0 + 6, 6, 3);
    for (let i = 0; i < 3; i++) P("#c0c0c0", x0 + 6 + i * 2, y0 + 7);
    P("#101010", x0 + 6, y0 + 11, 4, 1);
  } else if (rot === 2) for (let k = 0; k < 3; k++) P("#2e5a48", x0 + 5, y0 + k * 4, 6, 1);
  else P("#7fd0ff", rot === 1 ? x0 + 4 : x0 + 11, y0, 1, 3);
}
function drawPlant(o) {
  const x0 = o.x * PX, y0 = o.y * PX, cx = x0 + 8;
  P("rgba(0,0,0,0.3)", x0 + 3, y0 + 13, 10, 2);
  P("#9a5a32", x0 + 5, y0 + 8, 6, 6);
  P("#b8703f", x0 + 4, y0 + 8, 8, 2);
  P("#6b3a20", x0 + 5, y0 + 13, 6, 1);
  P("#6a4a2a", cx, y0 + 1, 1, 7);
  const g1 = "#2d7a3e", g2 = "#3fa050", g3 = "#1f5a2e";
  P(g2, cx - 5, y0 - 3, 5, 2); P(g2, cx + 1, y0 - 3, 5, 2); P(g1, cx - 6, y0 - 1, 3, 2); P(g1, cx + 4, y0 - 1, 3, 2);
  P(g3, cx - 2, y0 - 5, 5, 2); P(g2, cx - 1, y0 - 7, 3, 2); P(g1, cx - 4, y0 + 1, 2, 2); P(g1, cx + 3, y0 + 1, 2, 2); P(g3, cx - 1, y0 - 2, 3, 3);
}
function drawPartition(o) {
  const x0 = o.x * PX, y0 = o.y * PX;
  P("rgba(0,0,0,0.3)", x0, y0 + 14, 16, 3);
  P("#8a6a4a", x0, y0 - 6, 16, 6);
  P("#d4a64a", x0, y0, 16, 1);
  P("#5b4636", x0, y0 + 1, 16, 14);
  P("#4a3828", x0 + 2, y0 + 3, 5, 10);
  P("#4a3828", x0 + 9, y0 + 3, 5, 10);
}
function drawPillar(x0, y0) {
  P("rgba(0,0,0,0.35)", x0 + 3, y0 + 13, 13, 3);
  P("#2a1810", x0 + 2, y0 - 12, 12, 27);
  P("#3a2217", x0 + 3, y0 - 11, 10, 25);
  P("#4a2e1e", x0 + 5, y0 - 10, 2, 21);
  P("#d4a64a", x0 + 2, y0 - 14, 12, 3);
  P("#d4a64a", x0 + 2, y0 - 3, 12, 1);
  P("#d4a64a", x0 + 2, y0 + 12, 12, 2);
}

const ART = {
  slot: (o, d, env) => env.sort(o.y * PX + 14, () => drawSlot(o, d, env)),
  vp: (o, d, env) => env.sort(o.y * PX + 14, () => drawSlot(o, d, env)),
  atm: (o, d, env) => env.sort(o.y * PX + 13, () => drawAtm(o, env)),
  plant: (o, d, env) => env.sort(o.y * PX + 14, () => drawPlant(o)),
  partition: (o, d, env) => env.sort(o.y * PX + 15, () => drawPartition(o)),
  restroom: (o, d, env) => env.sort((o.y + o.h) * PX - 1, () => drawBuilding(o, env, "restroom")),
  cage: (o, d, env) => env.sort((o.y + o.h) * PX - 1, () => drawBuilding(o, env, "cage")),
  camera: (o, d, env) => env.ceil(() => {
    const x0 = o.x * PX, y0 = o.y * PX;
    P("rgba(16,22,28,0.85)", x0 + 5, y0 + 5, 6, 4);
    P("rgba(16,22,28,0.85)", x0 + 6, y0 + 4, 4, 1);
    P("#5fd3d3", x0 + 7, y0 + 6, 2, 2);
    if (Math.floor(env.now / 700) & 1) P("#ff3030", x0 + 10, y0 + 5);
  }),
};
function artTable(o, d, env) {
  env.flat(() => withLocal(o, () => TABLE_SURF[d.art](o, env.now)));
  const [lx, ly] = DEALER_AT[d.art];
  const [wx, wy] = localToWorld(o, lx, ly);
  const [fx, fy] = xfDir(o.rot || 0, 0, 1);
  const busy = o.occ.some(Boolean);
  env.sort(wy, () => drawPerson(wx, wy, workerLook("dealer", o.id), "stand", dirOf(fx, fy), 0, { half: true, armUp: busy && Math.floor(env.now / 320) % 3 === 0 }));
}
function artZone(o, d, env) {
  env.flat(() => withLocal(o, (w) => zoneSurface(o, d, env, w)));
  const [A] = localDims(o);
  const n = Math.max(1, Math.ceil(A / 4));
  const seg = (A * PX - 8) / n;
  const [fx, fy] = xfDir(o.rot || 0, 0, 1);
  for (let i = 0; i < n; i++) {
    const lx = Math.round(4 + seg * i + seg * (0.5 + 0.45 * Math.sin(env.now / 2600 + i * 2.1 + o.id)));
    const [wx, wy] = localToWorld(o, lx, 12);
    env.sort(wy, () => drawPerson(wx, wy, workerLook(d.art === "bar" ? "bartender" : "cook", o.id * 10 + i), "stand", dirOf(fx, fy), 0, { half: true }));
  }
}
ART.blackjack = artTable;
ART.roulette = artTable;
ART.poker = artTable;
ART.bar = artZone;
ART.diner = artZone;

/* ---------- agents ---------- */
// Where an agent is drawn, in world pixels (feet). Seated guests tuck in toward what they're using.
function agentPose(rt, g, now) {
  const a = g.act;
  if (a && (a.kind === "play" || a.kind === "use") && a.obj != null) {
    const o = rt.objById.get(a.obj);
    const st = o && rt.lay.get(o.id).seats[a.seat];
    if (st) {
      const d = OBJECTS[o.type];
      const dir = dirOf(st.fx, st.fy);
      const sx = st.x * PX + 8, sy = st.y * PX + 8;
      if (st.kind === "stool" || st.kind === "chair") {
        const slot = d.game && !d.game.table;
        return {
          x: sx + st.fx * 3, y: sy + 3 + st.fy * 3, pose: "sit", dir,
          armUp: (slot && Math.floor(now / 450 + g.id) % 4 === 0) || (d.game && d.game.table && Math.floor(now / 900 + g.id) % 6 === 0),
          drink: d.serves === "thirst" && Math.floor(now / 1600 + g.id) % 3 === 0,
        };
      }
      return { x: sx + st.fx * 2, y: sy + 5 + st.fy * 2, pose: "stand", dir };
    }
  }
  const walking = g.path && g.path.length && !a;
  return { x: Math.round(g.x * PX), y: Math.round(g.y * PX) + 4, pose: walking ? "walk" : "stand", dir: g.dir || 0 };
}
export function agentDrawPos(rt, g) {
  const p = agentPose(rt, g, nowMs());
  return { x: p.x / PX, y: (p.y - 6) / PX };
}

function buildScene(s, rt, ui, now) {
  const env = { s, rt, now, flatL: [], sortL: [], ceilL: [] };
  env.flat = (fn) => env.flatL.push(fn);
  env.sort = (y, fn) => env.sortL.push([y, fn]);
  env.ceil = (fn) => env.ceilL.push(fn);
  for (const o of s.objects) {
    const d = OBJECTS[o.type];
    const art = ART[d.art];
    if (art) art(o, d, env);
    // Empty stools and chairs wait at every open seat.
    const lay = rt.lay.get(o.id);
    if (!lay) continue;
    lay.seats.forEach((st, k) => {
      if ((st.kind !== "stool" && st.kind !== "chair") || st.i < 0 || !rt.walk[st.i] || o.occ[k] || rt.seatUse.has(st.i)) return;
      const x = st.x * PX + 8 + st.fx * 3, y = st.y * PX + 12 + st.fy * 3;
      env.flat(() => (st.kind === "chair" ? drawChair(x, y, st.fx, st.fy) : drawStool(x, y)));
    });
  }
  for (let i = 0; i < rt.N; i++) {
    if (rt.tile[i] !== 1) continue;
    const x = i % rt.W, y = (i / rt.W) | 0;
    if (x === 0 || y === 0 || x === rt.W - 1 || y === rt.H - 1) continue;
    env.sort(y * PX + 15, () => drawPillar(x * PX, y * PX));
  }
  for (const g of s.guests) {
    if (g.act && g.act.hidden) continue;
    const p = agentPose(rt, g, now);
    const lk = g.look || { skin: "#e3b48c", shirt: ARCHETYPES[g.disguise]?.color || "#888888" };
    const frame = Math.floor(now / 130 + g.id) % 4;
    env.sort(p.y, () => drawPerson(p.x, p.y, lk, p.pose, p.dir, frame, p));
    const T = p.y - (p.pose === "sit" ? 10 : 12);
    const scene = s.incidents.some((x) => x.gid === g.id);
    const fresh = g.thought && s.time - g.thoughtT < 10 && (THOUGHTS[g.thought]?.bad || g.thought === "bigWin");
    if (scene || fresh) env.ceil(() => {
      if (scene) { if (Math.floor(now / 250) & 1) { P("#e5484d", p.x, T - 7, 2, 4); P("#e5484d", p.x, T - 2, 2, 1); } return; }
      P("#fffaf0", p.x + 2, T - 6, 5, 4);
      P("#fffaf0", p.x + 2, T - 2, 1, 1);
      P(THOUGHTS[g.thought]?.bad ? "#e5484d" : "#3cbf6a", p.x + 3, T - 5, 3, 2);
    });
    if (ui.sel && ui.sel.kind === "guest" && ui.sel.id === g.id) env.ceil(() => {
      const bob = Math.floor(now / 200) & 1;
      P("#fff4d6", p.x - 2, T - 9 - bob, 5, 1);
      P("#fff4d6", p.x - 1, T - 8 - bob, 3, 1);
      P("#fff4d6", p.x, T - 7 - bob, 1, 1);
    });
  }
  for (const st of s.staff) {
    const walking = st.path && st.path.length;
    const x = Math.round(st.x * PX), y = Math.round(st.y * PX) + 4;
    const lk = st.look || workerLook(st.type, st.id);
    const frame = Math.floor(now / 130 + st.id) % 4;
    env.sort(y, () => drawPerson(x, y, lk, walking ? "walk" : "stand", st.dir || 0, frame));
  }
  if (ui.sel && ui.sel.kind === "obj") {
    const o = rt.objById.get(ui.sel.id);
    if (o) env.ceil(() => {
      const x0 = o.x * PX - 1, y0 = o.y * PX - 1, x1 = (o.x + o.w) * PX, y1 = (o.y + o.h) * PX, c = "#fff4d6";
      P(c, x0, y0, 4, 1); P(c, x0, y0, 1, 4); P(c, x1 - 3, y0, 4, 1); P(c, x1, y0, 1, 4);
      P(c, x0, y1, 4, 1); P(c, x0, y1 - 3, 1, 4); P(c, x1 - 3, y1, 4, 1); P(c, x1, y1 - 3, 1, 4);
    });
  }
  if (ui.ghost && OBJECTS[ui.ghost.type]) env.ceil(() => drawGhost(ui.ghost, rt));
  return env;
}

// Placement preview: footprint, solid parts, and seat dots, so capacity is visible before you buy.
function drawGhost(gh, rt) {
  const d = OBJECTS[gh.type];
  const [w, h] = d.zone ? [gh.w, gh.h] : worldDims(gh.type, gh.rot || 0);
  const col = gh.ok ? "90,230,140" : "229,72,77";
  P(`rgba(${col},0.22)`, gh.x * PX, gh.y * PX, w * PX, h * PX);
  const lay = objLayout({ type: gh.type, x: gh.x, y: gh.y, rot: gh.rot || 0, w, h });
  for (const c of lay.cells) if (SOLID[c.role]) P(`rgba(${col},0.35)`, c.x * PX + 1, c.y * PX + 1, PX - 2, PX - 2);
  for (const st of lay.seats) P(`rgba(${col},0.95)`, st.x * PX + 6, st.y * PX + 6, 4, 4);
  P(`rgba(${col},0.95)`, gh.x * PX, gh.y * PX, w * PX, 1);
  P(`rgba(${col},0.95)`, gh.x * PX, (gh.y + h) * PX - 1, w * PX, 1);
  P(`rgba(${col},0.95)`, gh.x * PX, gh.y * PX, 1, h * PX);
  P(`rgba(${col},0.95)`, (gh.x + w) * PX - 1, gh.y * PX, 1, h * PX);
  const r = d.srvR || d.prsR;
  if (r) for (let k = 0; k < 32; k++) { const a = (k / 32) * Math.PI * 2; P(`rgba(${col},0.8)`, Math.round((gh.x + 0.5) * PX + Math.cos(a) * (r + 0.5) * PX), Math.round((gh.y + 0.5) * PX + Math.sin(a) * (r + 0.5) * PX)); }
}

function drawDirt(s, rt) {
  for (let i = 0; i < rt.N; i++) {
    const dv = s.dirt[i];
    if (dv < 6) continue;
    const x0 = (i % rt.W) * PX, y0 = Math.floor(i / rt.W) * PX;
    if (dv > 80) { P("#6f8a24", x0 + 5, y0 + 6, 6, 4); P("#8aa632", x0 + 6, y0 + 5, 4, 1); P("#8aa632", x0 + 4, y0 + 7, 1, 2); P("#5a7020", x0 + 8, y0 + 9, 3, 2); }
    const n = Math.min(10, Math.floor(dv / 9));
    for (let k = 0; k < n; k++) P(k & 1 ? "#3a2412" : "#6a6058", x0 + 1 + Math.floor(HASH2(i, k) * 14), y0 + 1 + Math.floor(HASH2(i, k + 50) * 14), k % 3 === 0 ? 2 : 1, 1);
  }
}

function drawWorldFx(rt, dt) {
  for (const f of rt.fx) {
    f.t += dt;
    const k = f.t / f.life;
    if (f.kind === "coins") {
      for (let j = 0; j < 14; j++) {
        const a = -Math.PI / 2 + (HASH2(f.seed, j) - 0.5) * 2.4, sp = 30 + HASH2(f.seed, j + 40) * 40;
        const x = f.x * PX + Math.cos(a) * sp * f.t, y = f.y * PX + Math.sin(a) * sp * f.t + 60 * f.t * f.t;
        P(k < 0.8 || j & 1 ? "#ffd43b" : "#c8961e", Math.round(x), Math.round(y), 2, 2);
      }
    } else if (f.kind === "ring") {
      const r = PX * (0.4 + f.t * 1.6);
      for (let j = 0; j < 28; j++) { const a = (j / 28) * Math.PI * 2; P(`rgba(255,212,59,${1 - k})`, Math.round(f.x * PX + Math.cos(a) * r), Math.round(f.y * PX + Math.sin(a) * r)); }
    }
  }
}

export function drawGame(ctx, s, rt, view, ui, dtReal) {
  const now = nowMs();
  const { ts, ox, oy, cw, ch, dpr } = view;
  const Wp = rt.W * PX, Hp = rt.H * PX;
  if (!rt.buf) rt.buf = makeLayerCanvas(Wp, Hp);
  if (rt.layerKey !== rt.layoutVer) buildStaticLayer(s, rt);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#140c09";
  ctx.fillRect(0, 0, cw, ch);
  const g = rt.buf && rt.buf.getContext ? rt.buf.getContext("2d") : null;
  if (!g) return;
  C = g;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, Wp, Hp);
  if (rt.layer) g.drawImage(rt.layer, 0, 0);
  drawDirt(s, rt);
  const env = buildScene(s, rt, ui, now);
  for (const fn of env.flatL) fn();
  if (ui.overlay && FIELDS[ui.overlay]) {
    const arr = ui.overlay === "DIRT" ? s.dirt : rt.f[ui.overlay];
    const col = FIELDS[ui.overlay].color;
    for (let i = 0; i < rt.N; i++) {
      if (rt.tile[i] === 1) continue;
      const v = clamp(arr[i] / 100, 0, 1);
      P(`rgba(${col[0]},${col[1]},${col[2]},${0.06 + v * 0.6})`, (i % rt.W) * PX, Math.floor(i / rt.W) * PX, PX, PX);
    }
  }
  env.sortL.sort((a, b) => a[0] - b[0]);
  for (const [, fn] of env.sortL) fn();
  for (const fn of env.ceilL) fn();
  const dt = (dtReal || 16) / 1000;
  drawWorldFx(rt, dt);
  C = null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(rt.buf, ox, oy, rt.W * ts, rt.H * ts);
  for (const f of rt.fx) {
    if (f.kind !== "text") continue;
    const k = f.t / f.life;
    const sx = ox + f.x * ts, sy = oy + f.y * ts - f.t * ts * 0.9;
    ctx.font = `700 ${Math.round(Math.max(14, ts * 0.65))}px "Barlow Semi Condensed", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(26,15,10,${1 - k})`;
    ctx.fillStyle = `rgba(255,222,120,${1 - k})`;
    ctx.strokeText(f.text, sx, sy);
    ctx.fillText(f.text, sx, sy);
  }
  rt.fx = rt.fx.filter((f) => f.t < f.life);
  let texts = 0;
  for (let i = rt.fx.length - 1; i >= 0; i--) if (rt.fx[i].kind === "text" && ++texts > 4) rt.fx.splice(i, 1);
}

/* =============================== 9. UI ============================== */
// Design tokens: oxblood carpet, mahogany and brass panels (an RCT-window homage),
// felt green for actions. Limelight for marquee display type, Barlow Semi Condensed for UI.
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Limelight&family=Barlow+Semi+Condensed:wght@400;500;600;700&display=swap');
.ct-root{--carpet:#4c1726;--wood:#2b1810;--wood2:#3a2217;--wood3:#4a2d1e;--brass:#d4a64a;--brass2:#8f6d2c;--felt:#1f5c3f;--felt2:#2a7a54;--cream:#f1e3c4;--cream2:#bfae8e;--red:#e5484d;--gold:#ffd36b;
position:fixed;inset:0;background:#140c09;color:var(--cream);font-family:"Barlow Semi Condensed",system-ui,sans-serif;font-size:15px;line-height:1.35;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;overflow:hidden;box-sizing:border-box;
padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)}
.ct-root *,.ct-root *::before,.ct-root *::after{box-sizing:border-box}
:where(.ct-root button){font:inherit;color:inherit;cursor:pointer;border:0;background:none;padding:0;margin:0}
.ct-root button:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.ct-num{font-variant-numeric:tabular-nums}
.ct-win{background:linear-gradient(var(--wood2),var(--wood));border:1px solid #120a07;box-shadow:inset 0 0 0 2px var(--brass2),inset 0 0 0 3px #120a07,0 8px 24px rgba(0,0,0,.5);border-radius:6px}
.ct-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:0 16px;border-radius:5px;background:linear-gradient(var(--felt2),var(--felt));box-shadow:inset 0 1px 0 rgba(255,255,255,.18),inset 0 0 0 1px rgba(0,0,0,.35),0 2px 0 #0c2618;font-weight:600;font-size:16px}
.ct-btn:active{transform:translateY(1px)}
.ct-btn.alt{background:linear-gradient(var(--wood3),var(--wood2));box-shadow:inset 0 0 0 1px var(--brass2),0 2px 0 #120a07}
.ct-btn.danger{background:linear-gradient(#b8323a,#8c2229)}
.ct-btn.wide{width:100%}
.ct-btn[disabled]{opacity:.45}
.ct-menu{height:100%;overflow-y:auto;padding:20px 16px 40px;background:radial-gradient(120% 60% at 50% 0%,#5a1a2c 0%,#2a0e16 45%,#140c09 100%);user-select:none}
.ct-menu-inner{max-width:560px;margin:0 auto}
.ct-marquee{position:relative;margin:8px auto 22px;padding:30px 20px 24px;text-align:center;border-radius:14px;background:linear-gradient(#3a2217,#241409);box-shadow:inset 0 0 0 3px var(--brass),inset 0 0 0 5px #120a07,0 12px 40px rgba(0,0,0,.6)}
.ct-marquee h1{margin:0;font-family:"Limelight",Georgia,serif;font-weight:400;font-size:clamp(40px,12vw,64px);line-height:.95;color:var(--gold);text-shadow:0 0 18px rgba(255,200,90,.45),0 3px 0 #6b4a12}
.ct-marquee p{margin:12px auto 0;max-width:30ch;color:var(--cream2);font-size:15px}
.ct-bulbs{position:absolute;inset:9px;pointer-events:none}
.ct-bulbs i{position:absolute;width:7px;height:7px;border-radius:50%;background:#ffe9a8;box-shadow:0 0 8px 2px rgba(255,210,110,.8);animation:ct-bulb 1.2s steps(2) infinite}
@keyframes ct-bulb{50%{opacity:.25;box-shadow:none}}
.ct-menu h2{font-family:"Limelight",Georgia,serif;font-weight:400;font-size:22px;color:var(--brass);margin:26px 0 10px}
.ct-levels{display:grid;gap:10px}
.ct-level{display:flex;gap:12px;align-items:center;width:100%;text-align:left;padding:12px 14px;min-height:64px}
.ct-level .n{flex:none;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-family:"Limelight",Georgia,serif;font-size:17px;color:#2b1810;background:radial-gradient(circle at 35% 30%,#ffe7a3,#c9962f 70%);box-shadow:inset 0 0 0 3px #f5dc9a,inset 0 0 0 5px #9a7424,0 2px 4px rgba(0,0,0,.5)}
.ct-level .t{flex:1;min-width:0}
.ct-level .t b{display:block;font-size:17px;font-weight:600}
.ct-level .t small{display:block;color:var(--cream2);font-size:13.5px}
.ct-level .s{flex:none;max-width:9em;font-size:13px;color:var(--cream2);text-align:right}
.ct-level.open .s{color:var(--gold);font-weight:600}
.ct-level.locked{opacity:.55}
.ct-level.locked .n{filter:grayscale(1)}
.ct-level.done .s{color:#9be3b0}
.ct-game{position:absolute;inset:0;display:flex;flex-direction:column}
.ct-top{flex:none;padding:6px 8px 7px;background:linear-gradient(#3a2217,#2b1810);box-shadow:inset 0 -2px 0 var(--brass2),0 2px 8px rgba(0,0,0,.5);z-index:3}
.ct-top-row{display:flex;align-items:center;gap:8px}
.ct-top-row+.ct-top-row{margin-top:6px}
.ct-cash{font-weight:700;font-size:20px;line-height:1.1}
.ct-cash.neg{color:var(--red)}
.ct-sub{font-size:12.5px;color:var(--cream2)}
.ct-clock{margin-left:auto;text-align:right}
.ct-clock b{font-size:17px}
.ct-iconbtn{flex:none;width:40px;height:40px;border-radius:6px;display:grid;place-items:center;background:rgba(0,0,0,.25);box-shadow:inset 0 0 0 1px var(--brass2);font-size:18px}
.ct-iconbtn.on{background:var(--brass);color:#1a0f0a}
.ct-speed{flex:none;display:flex;border-radius:6px;overflow:hidden;box-shadow:inset 0 0 0 1px var(--brass2)}
.ct-speed button{min-width:40px;height:36px;font-weight:600;font-size:14px;border-right:1px solid rgba(0,0,0,.35)}
.ct-speed button:last-child{border-right:0}
.ct-speed button.on{background:var(--brass);color:#1a0f0a}
.ct-goalbar{flex:1;height:8px;border-radius:4px;background:rgba(0,0,0,.4);overflow:hidden;box-shadow:inset 0 0 0 1px rgba(212,166,74,.35)}
.ct-goalbar i{display:block;height:100%;background:linear-gradient(90deg,var(--brass2),var(--gold))}
.ct-stage{position:relative;flex:1;min-height:0;overflow:hidden}
.ct-stage canvas{display:block;touch-action:none}
.ct-tabs{flex:none;display:grid;grid-template-columns:repeat(5,1fr);background:linear-gradient(#2b1810,#1d110b);box-shadow:inset 0 2px 0 var(--brass2);z-index:3}
.ct-tabs button{min-height:54px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:12.5px;color:var(--cream2)}
.ct-tabs button span{font-size:19px;line-height:1}
.ct-tabs button.on{color:var(--gold);background:rgba(212,166,74,.12)}
.ct-sheet{position:absolute;left:0;right:0;bottom:0;max-height:62%;overflow-y:auto;z-index:4;border-radius:10px 10px 0 0;padding:12px 14px 18px;animation:ct-up .18s ease-out;user-select:text}
@keyframes ct-up{from{transform:translateY(24px);opacity:0}}
.ct-sheet h3{font-family:"Limelight",Georgia,serif;font-weight:400;font-size:21px;color:var(--brass);margin:0 0 10px;display:flex;align-items:center;justify-content:space-between}
.ct-sheet h4{margin:16px 0 6px;font-size:15.5px;font-weight:600;color:var(--cream)}
.ct-close{width:38px;height:38px;border-radius:50%;background:rgba(0,0,0,.3);font-size:17px}
.ct-seg{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.ct-seg button{min-height:38px;padding:0 13px;border-radius:19px;background:rgba(0,0,0,.28);box-shadow:inset 0 0 0 1px var(--brass2);font-size:14px}
.ct-seg button.on{background:var(--brass);color:#1a0f0a;font-weight:600}
.ct-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px}
.ct-item{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 6px;border-radius:6px;background:rgba(0,0,0,.25);box-shadow:inset 0 0 0 1px rgba(212,166,74,.3);min-height:98px;text-align:center}
.ct-item .sw{width:40px;height:40px;border-radius:8px;display:grid;place-items:center;font-size:21px;box-shadow:inset 0 0 0 2px rgba(0,0,0,.3)}
.ct-item b{font-size:14px;font-weight:600;line-height:1.1}
.ct-item em{font-style:normal;font-size:13px;color:var(--gold)}
.ct-item em.neg{color:#ff8a8a}
.ct-item[disabled]{opacity:.5}
.ct-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(212,166,74,.15)}
.ct-row .grow{flex:1;min-width:0}
.ct-row small{display:block;color:var(--cream2);font-size:13px}
.ct-stepper{display:flex;align-items:center;gap:8px}
.ct-stepper button{width:42px;height:42px;border-radius:6px;background:rgba(0,0,0,.3);box-shadow:inset 0 0 0 1px var(--brass2);font-size:20px;font-weight:700}
.ct-stepper button[disabled]{opacity:.4}
.ct-stepper span{min-width:22px;text-align:center;font-weight:700;font-size:17px}
.ct-table{display:grid;grid-template-columns:1fr auto auto;gap:3px 14px;font-size:14.5px}
.ct-table .h{color:var(--cream2);font-size:12.5px}
.ct-table .v{text-align:right;font-variant-numeric:tabular-nums}
.ct-table .neg{color:#ff9a9a}
.ct-table .pos{color:#a7e8bb}
.ct-table .tot{font-weight:700;border-top:1px solid rgba(212,166,74,.3);padding-top:4px}
.ct-kv{display:grid;grid-template-columns:1fr auto;gap:3px 12px;font-size:14.5px}
.ct-kv .v{text-align:right;font-variant-numeric:tabular-nums}
.ct-bar{height:7px;border-radius:4px;background:rgba(0,0,0,.4);overflow:hidden}
.ct-bar i{display:block;height:100%}
.ct-note{color:var(--cream2);font-size:13px;margin:10px 0 0}
.ct-list{margin:4px 0 0;padding-left:18px;color:var(--cream2);font-size:14px}
.ct-list li{margin:3px 0}
.ct-thought{display:flex;gap:10px;align-items:baseline;padding:5px 0;font-size:14.5px;border-bottom:1px solid rgba(212,166,74,.1)}
.ct-thought .c{flex:none;min-width:36px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.ct-thought.bad .c{color:#ff9a9a}
.ct-thought.good .c{color:#a7e8bb}
.ct-rep{display:grid;grid-template-columns:5.5em 1fr 2.5em;gap:8px;align-items:center;font-size:14px;margin:4px 0}
.ct-rep .v{text-align:right;font-variant-numeric:tabular-nums}
.ct-toasts{position:absolute;left:8px;right:8px;top:8px;display:flex;flex-direction:column;gap:6px;z-index:6;pointer-events:none;align-items:center}
.ct-toast{max-width:460px;padding:8px 12px;border-radius:6px;font-size:14px;background:rgba(43,24,16,.96);box-shadow:inset 0 0 0 1px var(--brass2),0 4px 14px rgba(0,0,0,.5)}
.ct-toast.gold{box-shadow:inset 0 0 0 2px var(--gold),0 4px 14px rgba(0,0,0,.5);color:var(--gold);font-weight:600}
.ct-toast.bad{box-shadow:inset 0 0 0 1px var(--red),0 4px 14px rgba(0,0,0,.5)}
.ct-toast.good{box-shadow:inset 0 0 0 1px #5cc98a,0 4px 14px rgba(0,0,0,.5)}
.ct-toast.warn{box-shadow:inset 0 0 0 1px #f5a524,0 4px 14px rgba(0,0,0,.5)}
.ct-insp{position:absolute;left:8px;right:8px;bottom:8px;z-index:4;padding:12px 14px;max-width:420px;margin:0 auto}
.ct-insp-head{display:flex;align-items:center;gap:10px;margin-bottom:6px}
.ct-insp-head b{font-size:17px;flex:1}
.ct-dot{width:14px;height:14px;border-radius:50%;box-shadow:0 0 0 2px #1a0f0a}
.ct-quote{margin:8px 0 2px;font-style:italic;color:var(--cream)}
.ct-needs{display:grid;grid-template-columns:5em 1fr;gap:5px 10px;align-items:center;font-size:13.5px;margin-top:8px}
.ct-tool{position:absolute;left:8px;right:8px;bottom:8px;z-index:4;padding:10px 12px;display:flex;gap:12px;align-items:center;max-width:520px;margin:0 auto}
.ct-tool small{display:block;color:var(--cream2);font-size:13px}
.ct-overlays{position:absolute;right:8px;top:8px;z-index:5;padding:10px 10px 4px;width:min(300px,calc(100% - 16px))}
.ct-legend{position:absolute;left:8px;top:8px;z-index:3;padding:6px 10px;font-size:12.5px;display:flex;align-items:center;gap:8px}
.ct-legend i{display:block;width:70px;height:8px;border-radius:4px}
.ct-modal{position:absolute;inset:0;z-index:10;display:grid;place-items:center;padding:18px;background:rgba(10,5,3,.74)}
.ct-modal>.ct-win{width:min(440px,100%);max-height:100%;overflow-y:auto;padding:20px 18px}
.ct-modal h2{font-family:"Limelight",Georgia,serif;font-weight:400;color:var(--gold);font-size:27px;margin:0 0 2px;line-height:1.1}
.ct-modal .loc{color:var(--cream2);margin:0 0 12px}
.ct-modal p{margin:0 0 10px}
.ct-modal .btns{display:grid;gap:8px;margin-top:14px}
.ct-objective{padding:10px 12px;border-radius:6px;background:rgba(0,0,0,.28);box-shadow:inset 0 0 0 1px var(--brass2);margin:10px 0}
.ct-objective small{display:block;color:var(--cream2);margin-top:4px}
@media (prefers-reduced-motion:reduce){.ct-bulbs i{animation:none}.ct-sheet{animation:none}}
`;

function Bulbs() {
  const n = 24, items = [];
  for (let k = 0; k < n; k++) {
    const t = k / n;
    let x, y;
    if (t < 0.3) { x = (t / 0.3) * 100; y = 0; }
    else if (t < 0.5) { x = 100; y = ((t - 0.3) / 0.2) * 100; }
    else if (t < 0.8) { x = 100 - ((t - 0.5) / 0.3) * 100; y = 100; }
    else { x = 0; y = 100 - ((t - 0.8) / 0.2) * 100; }
    items.push(<i key={k} style={{ left: `calc(${x}% - 3.5px)`, top: `calc(${y}% - 3.5px)`, animationDelay: `${(k % 2) * 0.6}s` }} />);
  }
  return <div className="ct-bulbs" aria-hidden="true">{items}</div>;
}

function Confirm({ title, text, yes, onYes, onNo }) {
  return (
    <div className="ct-modal" role="dialog" aria-modal="true">
      <div className="ct-win">
        <h2>{title}</h2>
        <p>{text}</p>
        <div className="btns">
          <button className="ct-btn danger wide" onClick={onYes}>{yes}</button>
          <button className="ct-btn alt wide" onClick={onNo}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function LevelCard({ l, progress, onPlay }) {
  const open = isUnlocked(l, progress);
  const done = progress.completed.includes(l.id);
  const status = l.status === "construction" ? "🔒 Under construction" : !open ? "🔒 Locked" : done ? "✓ Completed" : "Play";
  return (
    <button className={`ct-level ct-win ${open ? "open" : "locked"} ${done ? "done" : ""}`} disabled={!open} onClick={open ? onPlay : undefined}>
      <span className="n">{l.num}</span>
      <span className="t"><b>{l.name}</b><small>{l.blurb}</small></span>
      <span className="s">{status}</span>
    </button>
  );
}

function Menu({ progress, save, onNew, onContinue }) {
  const [confirm, setConfirm] = useState(null);
  const story = LEVELS.filter((l) => l.tier === "story");
  const chal = LEVELS.filter((l) => l.tier === "challenge");
  const play = (l) => (save ? setConfirm(l) : onNew(l.id));
  const saveLevel = save && getLevel(save.levelId);
  return (
    <div className="ct-menu">
      <div className="ct-menu-inner">
        <div className="ct-marquee">
          <Bulbs />
          <h1>Casino Tycoon</h1>
          <p>Build a casino floor people can't bring themselves to leave.</p>
        </div>
        {saveLevel && (
          <button className="ct-btn wide" onClick={onContinue}>Continue {saveLevel.name}, day {dayOf(save.time)}</button>
        )}
        <h2>Scenarios</h2>
        <div className="ct-levels">
          {story.map((l) => <LevelCard key={l.id} l={l} progress={progress} onPlay={() => play(l)} />)}
        </div>
        <h2>Challenge scenarios</h2>
        <div className="ct-levels">
          {chal.map((l) => <LevelCard key={l.id} l={l} progress={progress} />)}
        </div>
        <h2>Free play</h2>
        <div className="ct-levels">
          <div className="ct-level ct-win locked">
            <span className="n">∞</span>
            <span className="t"><b>Free play</b><small>Design your own casino on an empty lot, with adjustable starting money.</small></span>
            <span className="s">🔒 Under construction</span>
          </div>
        </div>
        <p className="ct-note" style={{ textAlign: "center", marginTop: 28 }}>Version {VERSION}. Progress saves on this device.</p>
      </div>
      {confirm && (
        <Confirm
          title="Start over?"
          text={`Starting ${confirm.name} replaces your saved game.`}
          yes="Start new game"
          onYes={() => { const id = confirm.id; setConfirm(null); onNew(id); }}
          onNo={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

const satColor = (v) => (v >= 65 ? "#5cc98a" : v >= 40 ? "#f5c542" : "#e5484d");
function Bar({ v, color }) {
  return <div className="ct-bar"><i style={{ width: `${clamp(v, 0, 100)}%`, background: color }} /></div>;
}

function TopBar({ s, onSpeed, onMenu, onEye, eyeOn }) {
  const L = getLevel(s.levelId);
  const v = casinoValue(s);
  const pct = clamp(v / L.goal.target, 0, 1) * 100;
  const left = L.goal.day - dayOf(s.time) + 1;
  return (
    <header className="ct-top">
      <div className="ct-top-row">
        <div>
          <div className={`ct-cash ct-num ${s.cash < 0 ? "neg" : ""}`}>{fmt$(s.cash)}</div>
          <div className="ct-sub ct-num">Value {fmt$(v)} of {fmt$(L.goal.target)}</div>
        </div>
        <div className="ct-clock">
          <b className="ct-num">Day {dayOf(s.time)}, {clockStr(s.time)}</b>
          <div className="ct-sub">{left > 1 ? `${left} days left` : left === 1 ? "Final day" : "Past the deadline"}</div>
        </div>
        <button className="ct-iconbtn" aria-label="Pause menu" onClick={onMenu}>☰</button>
      </div>
      <div className="ct-top-row">
        <div className="ct-speed" role="group" aria-label="Game speed">
          {SPEEDS.map((n) => (
            <button key={n} className={s.speed === n ? "on" : ""} onClick={() => onSpeed(n)} aria-label={n ? `${n}x speed` : "Pause"}>
              {n ? `${n}×` : "❚❚"}
            </button>
          ))}
        </div>
        <div className="ct-goalbar" aria-label="Progress toward the goal"><i style={{ width: `${pct}%` }} /></div>
        <button className={`ct-iconbtn ${eyeOn ? "on" : ""}`} aria-label="Heatmaps" onClick={onEye}>👁</button>
      </div>
    </header>
  );
}

function BuildPanel({ s, onPick, onSellMode }) {
  const L = getLevel(s.levelId);
  const [cat, setCat] = useState("slots");
  const researchable = new Set((L.research || []).flatMap((r) => RESEARCH[r].unlocks || []));
  const items = Object.entries(OBJECTS).filter(([id, d]) => d.cat === cat && (L.tools.includes(id) || researchable.has(id)));
  return (
    <div>
      <div className="ct-seg">
        {BUILD_CATS.map((c) => (
          <button key={c.id} className={cat === c.id ? "on" : ""} onClick={() => setCat(c.id)}>{c.label}</button>
        ))}
      </div>
      <div className="ct-grid">
        {items.map(([id, d]) => {
          const unlocked = s.unlocked.includes(id);
          return (
            <button key={id} className="ct-item" disabled={!unlocked} onClick={() => onPick(id)}>
              <span className="sw" style={{ background: d.color }}>{d.icon}</span>
              <b>{d.name}</b>
              <em className={unlocked && s.cash < d.cost ? "neg" : ""}>{unlocked ? (d.zone ? `From ${fmt$(d.cost)}` : fmt$(d.cost)) : "Needs research"}</em>
            </button>
          );
        })}
      </div>
      <p className="ct-note">Pick an item, then tap the floor to place it. Bars and diners: drag to size them.</p>
      <div style={{ marginTop: 10 }}>
        <button className="ct-btn alt wide" onClick={onSellMode}>Sell items</button>
      </div>
    </div>
  );
}

function StaffPanel({ s, rt, onChange }) {
  const L = getLevel(s.levelId);
  const total = s.staff.reduce((a, st) => a + STAFF[st.type].wage, 0);
  const dealers = s.objects.reduce((a, o) => a + (OBJECTS[o.type].wage || 0), 0);
  return (
    <div>
      {L.staff.map((t) => {
        const d = STAFF[t];
        const n = s.staff.filter((x) => x.type === t).length;
        return (
          <div className="ct-row" key={t}>
            <div className="grow">
              <b>{d.name}</b>
              <small>{fmt$(d.wage)} an hour. {d.desc}</small>
            </div>
            <div className="ct-stepper">
              <button aria-label={`Fire a ${d.name}`} disabled={!n} onClick={() => { CMD.fire(s, rt, t); onChange(); }}>−</button>
              <span className="ct-num">{n}</span>
              <button aria-label={`Hire a ${d.name}`} onClick={() => { CMD.hire(s, rt, t); onChange(); }}>+</button>
            </div>
          </div>
        );
      })}
      <p className="ct-note">Payroll is {fmt$(total)} an hour, around the clock ({fmt$(total * 24)} a day).</p>
      {dealers > 0 && <p className="ct-note">Table dealers add {fmt$(dealers)} an hour. They come with their tables. Bartenders and cooks are included in bar and diner upkeep.</p>}
    </div>
  );
}

const MONEY_ROWS = [
  { k: "slots", label: "Slot win", sign: 1 },
  { k: "tables", label: "Table win and rake", sign: 1 },
  { k: "bar", label: "Bar", sign: 1 },
  { k: "food", label: "Snack bar", sign: 1 },
  { k: "atm", label: "ATM fees", sign: 1 },
  { k: "insRecovered", label: "Insurance payouts", sign: 1 },
  { k: "sales", label: "Equipment sold", sign: 1 },
  { k: "wages", label: "Wages and dealers", sign: -1 },
  { k: "upkeep", label: "Upkeep (midnight)", sign: -1 },
  { k: "insurance", label: "Insurance premium (midnight)", sign: -1 },
  { k: "research", label: "Research (midnight)", sign: -1 },
  { k: "build", label: "Construction", sign: -1 },
  { k: "leakage", label: "Unexplained machine losses", sign: -1 },
];

function MoneyPanel({ s, onChange }) {
  const L = getLevel(s.levelId);
  const T = s.fin.today;
  const Y = s.fin.history[s.fin.history.length - 1] || null;
  const net = (d) => MONEY_ROWS.reduce((a, r) => a + r.sign * (d[r.k] || 0), 0);
  const cell = (d, r) => {
    if (!d) return <span className="v">–</span>;
    const v = r.sign * (d[r.k] || 0);
    return <span className={`v ${v < 0 ? "neg" : v > 0 ? "pos" : ""}`}>{fmt$(v)}</span>;
  };
  const reserveOk = s.cash >= L.start.reserve;
  const avail = (L.research || []).filter((id) => !s.research.done.includes(id));
  return (
    <div>
      <div className="ct-kv">
        <span>Cash</span><span className="v">{fmt$(s.cash)}</span>
        <span>Casino value</span><span className="v">{fmt$(casinoValue(s))}</span>
        <span>Cage reserve required at midnight</span>
        <span className="v" style={{ color: reserveOk ? "#a7e8bb" : "#ff9a9a" }}>{fmt$(L.start.reserve)}</span>
      </div>
      {s.reserveWarn > 0 && (
        <p className="ct-note" style={{ color: "#ff9a9a" }}>Gaming Control warnings: {s.reserveWarn} of 3. A third straight night below the reserve ends the scenario.</p>
      )}

      <h4>Profit and loss</h4>
      <div className="ct-table">
        <span className="h" /><span className="h v">Today so far</span><span className="h v">Yesterday</span>
        {MONEY_ROWS.map((r) => (
          <React.Fragment key={r.k}>
            <span>{r.label}</span>{cell(T, r)}{cell(Y, r)}
          </React.Fragment>
        ))}
        <span className="tot">Net</span>
        <span className={`v tot ${net(T) < 0 ? "neg" : "pos"}`}>{fmt$(net(T))}</span>
        <span className={`v tot ${Y && net(Y) < 0 ? "neg" : "pos"}`}>{Y ? fmt$(net(Y)) : "–"}</span>
      </div>
      <p className="ct-note">Slot win is what players lost, after all payouts. Jackpots paid today: {fmt$(T.jackpots)}.</p>

      <h4>Jackpot insurance</h4>
      <div className="ct-seg">
        {INSURANCE.map((ins) => (
          <button key={ins.id} className={s.insurance === ins.id ? "on" : ""} onClick={() => { CMD.setInsurance(s, ins.id); onChange(); }}>
            {ins.name}{ins.cover ? `, about ${fmt$(premiumEstimate(s, ins.id))} a day` : ""}
          </button>
        ))}
      </div>
      <p className="ct-note" style={{ marginTop: 0 }}>Insurance repays part of every top-award jackpot. It costs more than it pays on average, but it smooths out the nights that could sink your reserve.</p>

      <h4>Research</h4>
      <div className="ct-seg">
        {RESEARCH_FUNDING.map((f) => (
          <button key={f.id} className={s.research.funding === f.id ? "on" : ""} onClick={() => { CMD.setFunding(s, f.id); onChange(); }}>
            {f.name}{f.cost ? `, ${fmt$(f.cost)} a day` : ""}
          </button>
        ))}
      </div>
      {(L.research || []).map((id) => {
        const r = RESEARCH[id];
        const done = s.research.done.includes(id);
        const cur = s.research.current === id;
        const p = s.research.progress[id] || 0;
        return (
          <button key={id} className="ct-row" style={{ width: "100%", textAlign: "left" }} disabled={done} onClick={() => { CMD.setResearch(s, id); onChange(); }}>
            <div className="grow">
              <b>{r.name}</b>{cur && !done ? " (researching)" : ""}{done ? " (done)" : ""}
              <small>{r.desc}</small>
              {!done && <div style={{ marginTop: 5 }}><Bar v={(p / r.pts) * 100} color={cur ? "#d4a64a" : "#8f6d2c"} /></div>}
            </div>
          </button>
        );
      })}
      {!avail.length && <p className="ct-note">Everything available here has been researched.</p>}
    </div>
  );
}

function GuestsPanel({ s }) {
  const L = getLevel(s.levelId);
  const counts = {};
  for (const g of s.guests) counts[g.disguise] = (counts[g.disguise] || 0) + 1;
  const merged = {};
  for (const src of [s.thoughtsYday, s.thoughtsToday]) for (const [k, v] of Object.entries(src || {})) merged[k] = (merged[k] || 0) + v;
  const list = Object.entries(merged).filter(([k]) => THOUGHTS[k]).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const T = s.fin.today;
  const Y = s.fin.history[s.fin.history.length - 1];
  const shown = Object.keys(L.arrivals.mix).filter((a) => !ARCHETYPES[a].cheat);
  return (
    <div>
      <div className="ct-kv">
        <span>Guests inside now</span><span className="v">{s.guests.length}</span>
        <span>Visitors today</span><span className="v">{T.visitors}</span>
        <span>Average happiness at exit, today</span><span className="v">{T.satN ? Math.round(T.satSum / T.satN) : "–"}</span>
        <span>Average happiness at exit, yesterday</span><span className="v">{Y && Y.avgSat != null ? Math.round(Y.avgSat) : "–"}</span>
      </div>
      <h4>What guests are thinking (last two days)</h4>
      {list.length ? list.map(([k, v]) => (
        <div key={k} className={`ct-thought ${THOUGHTS[k].bad ? "bad" : "good"}`}>
          <span className="c">{v}</span><span>{THOUGHTS[k].t}</span>
        </div>
      )) : <p className="ct-note">No thoughts yet. Give it an hour or two.</p>}
      <h4>Reputation</h4>
      <p className="ct-note" style={{ marginTop: 0 }}>Happy guests spread the word, and more of their kind show up.</p>
      {shown.map((a) => (
        <div key={a} className="ct-rep">
          <span>{ARCHETYPES[a].name}</span>
          <Bar v={s.rep[a] ?? 50} color={ARCHETYPES[a].color} />
          <span className="v">{Math.round(s.rep[a] ?? 50)}</span>
        </div>
      ))}
      <h4>On the floor</h4>
      {shown.map((a) => (
        <div key={a} className="ct-rep">
          <span>{ARCHETYPES[a].name}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="ct-dot" style={{ background: ARCHETYPES[a].color, width: 10, height: 10 }} />
          </span>
          <span className="v">{counts[a] || 0}</span>
        </div>
      ))}
    </div>
  );
}

function GoalPanel({ s }) {
  const L = getLevel(s.levelId);
  const v = casinoValue(s);
  const left = L.goal.day - dayOf(s.time) + 1;
  return (
    <div>
      <b style={{ fontSize: 17 }}>{L.name}</b>
      <div className="ct-note" style={{ marginTop: 2 }}>{L.locale}</div>
      <div className="ct-objective">
        <div>Reach a casino value of {fmt$(L.goal.target)} by the end of day {L.goal.day}.</div>
        <div style={{ margin: "8px 0 4px" }}><Bar v={(v / L.goal.target) * 100} color="#d4a64a" /></div>
        <small>{fmt$(v)} so far. {left > 0 ? `${left} ${left === 1 ? "day" : "days"} left.` : "Deadline passed."} Value is cash plus 60% of what your equipment cost.</small>
      </div>
      <h4>Tips</h4>
      <ul className="ct-list">{L.tips.map((t) => <li key={t}>{t}</li>)}</ul>
      <h4>Floor record</h4>
      <div className="ct-kv">
        <span>Jackpots hit</span><span className="v">{s.stats.jackpots}</span>
        <span>Cheats caught</span><span className="v">{s.stats.cheatsCaught}</span>
        <span>Drunken scenes</span><span className="v">{s.stats.scenes}</span>
        <span>Progressive meter</span><span className="v">{fmt$(s.progressive.meter)}</span>
      </div>
      <h4>Recent events</h4>
      {s.news.length ? (
        <ul className="ct-list">
          {s.news.slice(0, 8).map((n, i) => <li key={i}>Day {dayOf(n.t)}, {clockStr(n.t)}: {n.text}</li>)}
        </ul>
      ) : <p className="ct-note">Nothing yet.</p>}
    </div>
  );
}

function guestActivity(rt, g) {
  const a = g.act;
  if (a) {
    const o = a.obj != null ? rt.objById.get(a.obj) : null;
    const n = o ? OBJECTS[o.type].name : "";
    if (a.kind === "play") return `Playing ${n}`;
    if (a.hidden) return `In the ${n.toLowerCase()}`;
    if (a.kind === "use") return o && o.type === "cage" ? "Cashing out" : `At the ${n}`;
    if (a.kind === "wait") return `Waiting in line for the ${n}`;
    return "Looking around";
  }
  const k = g.goal && g.goal.kind;
  if (k === "play") return "Heading to a machine";
  if (k === "use") { const o = rt.objById.get(g.goal.obj); return o ? `Heading to the ${OBJECTS[o.type].name}` : "Walking"; }
  if (k === "exit") return "Leaving";
  if (k === "wander") return "Wandering";
  return "Deciding what to do";
}

function Inspector({ s, rt, sel, onClose, onSell, onRotate }) {
  if (sel.kind === "guest") {
    const g = s.guests.find((x) => x.id === sel.id);
    if (!g) return null;
    const A = ARCHETYPES[g.disguise] || ARCHETYPES[g.a];
    return (
      <div className="ct-insp ct-win">
        <div className="ct-insp-head">
          <span className="ct-dot" style={{ background: A.color }} />
          <b>{A.name}</b>
          <button className="ct-close" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="ct-kv">
          <span>{guestActivity(rt, g)}</span><span className="v" />
          <span>Gambling money left</span><span className="v">{fmt$(g.budget)}</span>
        </div>
        {g.thought && THOUGHTS[g.thought] && <p className="ct-quote">“{THOUGHTS[g.thought].t}”</p>}
        <div className="ct-needs">
          <span>Happiness</span><Bar v={g.sat} color={satColor(g.sat)} />
          <span>Bladder</span><Bar v={g.needs.bladder} color="#7ab8ff" />
          <span>Thirst</span><Bar v={g.needs.thirst} color="#5fd3d3" />
          <span>Hunger</span><Bar v={g.needs.hunger} color="#f5a524" />
          <span>Tiredness</span><Bar v={g.needs.fatigue} color="#bfae8e" />
          {g.intox > 5 && (<><span>Tipsiness</span><Bar v={g.intox} color="#c79bff" /></>)}
        </div>
      </div>
    );
  }
  const o = s.objects.find((x) => x.id === sel.id);
  if (!o) return null;
  const d = OBJECTS[o.type];
  const lay = rt.lay.get(o.id);
  const seats = lay ? lay.seats.length : 0;
  const used = (o.occ || []).filter(Boolean).length;
  const tier = zoneTier(o);
  const status = o.broken ? "Broken, needs a slot tech" : seats ? `${used} of ${seats} ${lay.seats[0].kind === "hidden" ? "stalls" : "seats"} in use` : "";
  return (
    <div className="ct-insp ct-win">
      <div className="ct-insp-head">
        <span className="ct-dot" style={{ background: d.color }} />
        <b>{tier ? `${d.name}: ${tier.label}` : d.name}</b>
        <button className="ct-close" aria-label="Close" onClick={onClose}>✕</button>
      </div>
      <div className="ct-kv">
        {status && (<><span>Status</span><span className="v">{status}</span></>)}
        {d.zone && (<><span>Size</span><span className="v">{o.w} by {o.h}</span></>)}
        {(d.game || d.price || d.fee) && (<><span>Earned today</span><span className="v">{fmt$(o.stats.today)}</span></>)}
        {(d.game || d.price || d.fee) && (<><span>Earned since built</span><span className="v">{fmt$(o.stats.net)}</span></>)}
        {d.game && d.game.table !== "poker" && (<><span>House edge</span><span className="v">{(d.game.hold * 100).toFixed(1)}%</span></>)}
        {d.wage && (<><span>Dealer wage</span><span className="v">{fmt$(d.wage)} an hour</span></>)}
        {d.serves && !d.game && (<><span>Visits</span><span className="v">{o.stats.uses}</span></>)}
      </div>
      <p className="ct-note">{d.desc}</p>
      {!d.fixed && (
        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          {d.rotatable && <button className="ct-btn alt" style={{ flex: 1 }} onClick={() => onRotate(o.id)}>Rotate</button>}
          <button className="ct-btn alt" style={{ flex: 2 }} onClick={() => onSell(o.id)}>Sell for {fmt$((o.cost ?? d.cost) * SELL_REFUND)}</button>
        </div>
      )}
    </div>
  );
}

function ToolBar({ tool, s, ghost, onDone, onRotate }) {
  const d = tool.mode === "build" ? OBJECTS[tool.type] : null;
  let info = null;
  if (d && d.zone) {
    if (ghost && ghost.type === tool.type && ghost.w) {
      const t = zoneTier({ type: tool.type, w: ghost.w, h: ghost.h });
      const n = objLayout({ type: tool.type, x: 0, y: 0, rot: ghost.rot || 0, w: ghost.w, h: ghost.h }).seats.length;
      info = `${ghost.w} by ${ghost.h} ${t ? t.label.toLowerCase() : ""} with ${n} seats for ${fmt$(placeCost(tool.type, ghost.w, ghost.h))}.${ghost.ok || !ghost.msg ? "" : ` ${ghost.msg}`}`;
    } else info = "Drag across the floor to size it. A tap places the smallest size.";
  }
  return (
    <div className="ct-tool ct-win">
      <div style={{ flex: 1, minWidth: 0 }}>
        {d ? (
          <>
            <b>{d.name}</b>{" "}
            {!d.zone && <span className="ct-num" style={{ color: s.cash >= d.cost ? "var(--gold)" : "#ff9a9a" }}>{fmt$(d.cost)}</span>}
            <small>{info || d.desc}</small>
          </>
        ) : (
          <>
            <b>Sell mode</b>
            <small>Tap an item to sell it for 60% of what you paid.</small>
          </>
        )}
      </div>
      {d && d.rotatable && !d.zone && <button className="ct-btn alt" aria-label="Rotate" onClick={onRotate}>⟳</button>}
      <button className="ct-btn" onClick={onDone}>Done</button>
    </div>
  );
}

function OverlayPicker({ s, value, onPick }) {
  const locked = Object.keys(FIELDS).filter((k) => !s.overlays.includes(k));
  return (
    <div className="ct-overlays ct-win">
      <div className="ct-seg" style={{ marginBottom: 6 }}>
        <button className={!value ? "on" : ""} onClick={() => onPick(null)}>Off</button>
        {s.overlays.filter((k) => FIELDS[k]).map((k) => (
          <button key={k} className={value === k ? "on" : ""} onClick={() => onPick(k)}>{FIELDS[k].label}</button>
        ))}
      </div>
      {locked.length > 0 && <p className="ct-note" style={{ margin: "0 0 6px" }}>Research the floor consultant to unlock {locked.length} more heatmaps.</p>}
    </div>
  );
}

function Legend({ k }) {
  const c = FIELDS[k].color.join(",");
  return (
    <div className="ct-legend ct-win">
      <span>{FIELDS[k].label}</span>
      <span className="ct-sub">low</span>
      <i style={{ background: `linear-gradient(90deg, rgba(${c},0.08), rgba(${c},0.75))` }} />
      <span className="ct-sub">high</span>
    </div>
  );
}

function Briefing({ L, onStart }) {
  return (
    <div className="ct-modal" role="dialog" aria-modal="true">
      <div className="ct-win">
        <h2>{L.name}</h2>
        <p className="loc">{L.locale}</p>
        <p>{L.blurb}</p>
        <div className="ct-objective">
          <b>Objective</b>
          <div>Reach a casino value of {fmt$(L.goal.target)} by the end of day {L.goal.day}.</div>
          <small>Value is your cash plus 60% of what your equipment cost. Keep at least {fmt$(L.start.reserve)} in the cage at midnight.</small>
        </div>
        <ul className="ct-list">{L.tips.slice(0, 3).map((t) => <li key={t}>{t}</li>)}</ul>
        <div className="btns">
          <button className="ct-btn wide" onClick={onStart}>Open the doors</button>
        </div>
      </div>
    </div>
  );
}

function EndModal({ s, onContinue, onRetry, onMenu }) {
  const o = s.outcome;
  const L = getLevel(s.levelId);
  if (o.result === "win") {
    return (
      <div className="ct-modal" role="dialog" aria-modal="true">
        <div className="ct-win">
          <h2>Scenario complete</h2>
          <p className="loc">{L.name}, day {o.day}</p>
          <p>Casino value reached {fmt$(o.value)}, beating the {fmt$(L.goal.target)} target.</p>
          <p className="ct-note">The next scenario is under construction and arrives in a future update.</p>
          <div className="btns">
            <button className="ct-btn wide" onClick={onContinue}>Keep playing</button>
            <button className="ct-btn alt wide" onClick={onMenu}>Main menu</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="ct-modal" role="dialog" aria-modal="true">
      <div className="ct-win">
        <h2>Scenario failed</h2>
        <p className="loc">{L.name}, day {o.day}</p>
        <p>{o.reason}</p>
        <div className="btns">
          <button className="ct-btn wide" onClick={onRetry}>Try again</button>
          <button className="ct-btn alt wide" onClick={onMenu}>Main menu</button>
        </div>
      </div>
    </div>
  );
}

function PauseMenu({ onResume, onSave, onRestart, onQuit }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="ct-modal" role="dialog" aria-modal="true">
      <div className="ct-win">
        <h2>Paused</h2>
        {!confirm ? (
          <div className="btns">
            <button className="ct-btn wide" onClick={onResume}>Resume</button>
            <button className="ct-btn alt wide" onClick={onSave}>Save game</button>
            <button className="ct-btn alt wide" onClick={() => setConfirm(true)}>Restart scenario</button>
            <button className="ct-btn alt wide" onClick={onQuit}>Save and quit to menu</button>
          </div>
        ) : (
          <>
            <p>Restarting wipes this run and replaces your saved game.</p>
            <div className="btns">
              <button className="ct-btn danger wide" onClick={onRestart}>Restart scenario</button>
              <button className="ct-btn alt wide" onClick={() => setConfirm(false)}>Keep playing</button>
            </div>
          </>
        )}
        <p className="ct-note">Casino Tycoon v{VERSION}</p>
      </div>
    </div>
  );
}

const TABS = [
  { id: "build", label: "Build", icon: "🛠️" },
  { id: "staff", label: "Staff", icon: "👔" },
  { id: "money", label: "Money", icon: "💵" },
  { id: "guests", label: "Guests", icon: "💬" },
  { id: "goal", label: "Goal", icon: "🏆" },
];

function Game({ initial, isNew, onExit, onComplete, onRestart }) {
  const sRef = useRef(initial);
  const rtRef = useRef(null);
  if (!rtRef.current) rtRef.current = makeRuntime(initial);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const viewRef = useRef({ ts: 20, ox: 0, oy: 0, cw: 1, ch: 1, dpr: 1 });
  const camRef = useRef({ zoom: 1, px: 0, py: 0 });
  const uiRef = useRef({ overlay: null, sel: null, ghost: null });
  const ptrs = useRef(new Map());
  const gesture = useRef(null);
  const dragRef = useRef(null);
  const [, setFrame] = useState(0);
  const refresh = () => setFrame((x) => x + 1);
  const [tab, setTab] = useState(null);
  const [tool, setTool] = useState(null);
  const [sel, setSel] = useState(null);
  const [overlay, setOverlay] = useState(null);
  const [picker, setPicker] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [menu, setMenu] = useState(false);
  const [brief, setBrief] = useState(!!isNew);
  const s = sRef.current;
  const rt = rtRef.current;
  const L = getLevel(s.levelId);
  const pausedRef = useRef(false);
  pausedRef.current = menu || brief || simHalted(s);
  uiRef.current.overlay = overlay;
  uiRef.current.sel = sel;

  const pushToast = (text, kind = "info", ms = 3200) => {
    const id = `u${Math.random().toString(36).slice(2)}`;
    setToasts((t) => [...t, { id, text, kind }].slice(-4));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  };

  const computeView = () => {
    const v = viewRef.current, cam = camRef.current, r = rtRef.current;
    const base = Math.max(8, Math.min(v.cw / r.W, v.ch / r.H));
    const ts = Math.max(8, Math.floor(base * cam.zoom));
    const mw = r.W * ts, mh = r.H * ts;
    const maxPx = Math.max(0, (mw - v.cw) / 2) + 24, maxPy = Math.max(0, (mh - v.ch) / 2) + 24;
    cam.px = clamp(cam.px, -maxPx, maxPx);
    cam.py = clamp(cam.py, -maxPy, maxPy);
    v.ts = ts;
    v.ox = Math.round((v.cw - mw) / 2 + cam.px);
    v.oy = Math.round((v.ch - mh) / 2 + cam.py);
  };

  // Keep the canvas matched to its container at device resolution.
  useEffect(() => {
    const wrap = wrapRef.current, cv = canvasRef.current;
    if (!wrap || !cv) return undefined;
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.max(1, Math.round(r.width * dpr));
      cv.height = Math.max(1, Math.round(r.height * dpr));
      cv.style.width = `${r.width}px`;
      cv.style.height = `${r.height}px`;
      Object.assign(viewRef.current, { cw: r.width, ch: r.height, dpr });
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(wrap);
    window.addEventListener("resize", fit);
    return () => { if (ro) ro.disconnect(); window.removeEventListener("resize", fit); };
  }, []);

  // Main loop: advance the sim, draw, surface notifications, autosave each new day.
  useEffect(() => {
    let raf = 0, last = nowMs(), lastUi = 0, lastDay = dayOf(sRef.current.time);
    const loop = (now) => {
      const dt = Math.min(250, Math.max(0, now - last));
      last = now;
      const st = sRef.current, r = rtRef.current;
      if (!pausedRef.current && st.speed > 0) advance(st, r, (dt * st.speed) / MS_PER_GAME_MIN);
      computeView();
      const cv = canvasRef.current;
      const ctx = cv && cv.getContext("2d");
      if (ctx) drawGame(ctx, st, r, viewRef.current, uiRef.current, dt);
      if (r.toasts.length) for (const t of r.toasts.splice(0)) pushToast(t.text, t.kind, 3800);
      const d = dayOf(st.time);
      if (d !== lastDay) { lastDay = d; saveGame(st); }
      if (now - lastUi > 250) { lastUi = now; refresh(); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Save when the app is backgrounded or closed.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "hidden") saveGame(sRef.current); };
    const onHide = () => saveGame(sRef.current);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", onHide); };
  }, []);

  // Record a win once, and drop selections that no longer exist.
  useEffect(() => {
    if (s.outcome && s.outcome.result === "win" && !s.outcome.recorded) {
      s.outcome.recorded = true;
      onComplete(s.levelId);
      saveGame(s);
    }
    if (sel) {
      const ok = sel.kind === "guest" ? s.guests.some((g) => g.id === sel.id) : s.objects.some((o) => o.id === sel.id);
      if (!ok) setSel(null);
    }
  });

  const localPt = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toTile = (p) => {
    const v = viewRef.current;
    const fx = (p.x - v.ox) / v.ts, fy = (p.y - v.oy) / v.ts;
    return { x: Math.floor(fx), y: Math.floor(fy), fx, fy };
  };

  // Zoom around a screen point so pinches and scrolls land where your fingers are.
  const zoomAt = (fx, fy, z) => {
    const v = viewRef.current, cam = camRef.current, r = rtRef.current;
    const base = Math.max(8, Math.min(v.cw / r.W, v.ch / r.H));
    const wx = (fx - v.ox) / v.ts, wy = (fy - v.oy) / v.ts;
    cam.zoom = clamp(z, 1, 4);
    const ts = Math.max(8, Math.floor(base * cam.zoom));
    cam.px = fx - wx * ts - (v.cw - r.W * ts) / 2;
    cam.py = fy - wy * ts - (v.ch - r.H * ts) / 2;
    computeView();
  };
  const zoneTool = !!(tool && tool.mode === "build" && OBJECTS[tool.type].zone);
  const ghostFor = (t) => {
    const st = sRef.current, r = rtRef.current;
    if (!tool || tool.mode !== "build") return null;
    const d = OBJECTS[tool.type];
    if (d.zone) {
      const a = dragRef.current ? dragRef.current.a : t;
      const rc = { x: Math.min(a.x, t.x), y: Math.min(a.y, t.y), w: Math.abs(a.x - t.x) + 1, h: Math.abs(a.y - t.y) + 1 };
      if (!dragRef.current || (rc.w === 1 && rc.h === 1)) { rc.w = d.zone.min; rc.h = d.zone.min; }
      const rot = autoZoneRot(r, rc.x, rc.y, rc.w, rc.h);
      const c = CMD.canPlace(st, r, tool.type, rc.x, rc.y, rot, rc.w, rc.h);
      return { type: tool.type, ...rc, rot, ok: c.ok, cost: c.cost, msg: c.msg };
    }
    const rot = tool.rot || 0;
    const [w, h] = worldDims(tool.type, rot);
    const c = CMD.canPlace(st, r, tool.type, t.x, t.y, rot);
    return { type: tool.type, x: t.x, y: t.y, w, h, rot, ok: c.ok, cost: c.cost, msg: c.msg };
  };
  const placeGhost = (gh) => {
    if (!gh) return;
    const res = CMD.place(sRef.current, rtRef.current, gh.type, gh.x, gh.y, gh.rot, gh.w, gh.h);
    if (!res.ok) pushToast(res.msg, "bad", 2200);
    uiRef.current.ghost = { ...gh, ok: res.ok };
    refresh();
  };

  const handleTap = (p) => {
    const st = sRef.current, r = rtRef.current;
    const t = toTile(p);
    if (tool && tool.mode === "build") { placeGhost(ghostFor(t)); return; }
    if (tool && tool.mode === "sell") {
      const o = objAt(st, r, t.x, t.y);
      if (!o) return;
      const name = OBJECTS[o.type].name;
      const res = CMD.sell(st, r, o.id);
      pushToast(res.ok ? `Sold the ${name} for ${fmt$(res.refund)}.` : res.msg, res.ok ? "info" : "bad", 2200);
      refresh();
      return;
    }
    let best = null, bd = 0.7;
    for (const g of st.guests) {
      if (g.act && g.act.hidden) continue;
      const dp = agentDrawPos(r, g);
      const d = Math.hypot(dp.x - t.fx, dp.y - t.fy);
      if (d < bd) { bd = d; best = g; }
    }
    if (best) { setSel({ kind: "guest", id: best.id }); setTab(null); return; }
    const o = objAt(st, r, t.x, t.y);
    if (o) { setSel({ kind: "obj", id: o.id }); setTab(null); return; }
    setSel(null);
  };

  const onDown = (e) => {
    const p = localPt(e);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    ptrs.current.set(e.pointerId, p);
    if (zoneTool && ptrs.current.size === 1) {
      const t = toTile(p);
      dragRef.current = { a: { x: t.x, y: t.y } };
      gesture.current = { kind: "zone" };
      uiRef.current.ghost = ghostFor(t);
      refresh();
      return;
    }
    if (ptrs.current.size === 1) gesture.current = { kind: "tap", sx: p.x, sy: p.y, px: camRef.current.px, py: camRef.current.py };
    else if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      gesture.current = { kind: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y), z0: camRef.current.zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }
  };
  const onMove = (e) => {
    const p = localPt(e);
    if (!ptrs.current.has(e.pointerId)) {
      if (e.pointerType === "mouse" && tool && tool.mode === "build") uiRef.current.ghost = ghostFor(toTile(p));
      return;
    }
    ptrs.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "zone") { uiRef.current.ghost = ghostFor(toTile(p)); refresh(); return; }
    if (g.kind === "pinch" && ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()];
      zoomAt(g.mx, g.my, (g.z0 * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, g.d0));
    } else if (g.kind === "tap" || g.kind === "pan") {
      const dx = p.x - g.sx, dy = p.y - g.sy;
      if (g.kind === "tap" && Math.hypot(dx, dy) > 10) g.kind = "pan";
      if (g.kind === "pan") { camRef.current.px = g.px + dx; camRef.current.py = g.py + dy; }
    }
  };
  const onUp = (e) => {
    const g = gesture.current;
    const p = ptrs.current.get(e.pointerId);
    ptrs.current.delete(e.pointerId);
    if (g && g.kind === "zone") {
      if (p) placeGhost(ghostFor(toTile(p)));
      dragRef.current = null;
      gesture.current = null;
      return;
    }
    if (g && g.kind === "tap" && p && ptrs.current.size === 0) handleTap(p);
    if (ptrs.current.size === 0) gesture.current = null;
    else if (g && g.kind === "pinch") gesture.current = { kind: "none" };
  };
  const onWheel = (e) => { const p = localPt(e); zoomAt(p.x, p.y, camRef.current.zoom * (e.deltaY < 0 ? 1.1 : 0.9)); };

  const pickTool = (type) => { setTool({ mode: "build", type, rot: 0 }); setTab(null); setSel(null); uiRef.current.ghost = null; };
  const endTool = () => { setTool(null); uiRef.current.ghost = null; };
  const quit = () => { saveGame(sRef.current); onExit(); };

  return (
    <div className="ct-game">
      <TopBar
        s={s}
        eyeOn={picker || !!overlay}
        onSpeed={(n) => { CMD.setSpeed(s, n); refresh(); }}
        onMenu={() => setMenu(true)}
        onEye={() => setPicker((v) => !v)}
      />
      <div className="ct-stage" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onWheel={onWheel}
          aria-label="Casino floor"
        />
        {overlay && !picker && <Legend k={overlay} />}
        {picker && <OverlayPicker s={s} value={overlay} onPick={(k) => { setOverlay(k); setPicker(false); }} />}
        <div className="ct-toasts" aria-live="polite">
          {toasts.map((t) => <div key={t.id} className={`ct-toast ${t.kind}`}>{t.text}</div>)}
        </div>
        {sel && !tool && !tab && (
          <Inspector
            s={s}
            rt={rt}
            sel={sel}
            onClose={() => setSel(null)}
            onSell={(id) => {
              const res = CMD.sell(s, rt, id);
              pushToast(res.ok ? `Sold for ${fmt$(res.refund)}.` : res.msg, res.ok ? "info" : "bad");
              setSel(null);
            }}
            onRotate={(id) => {
              const res = CMD.rotate(s, rt, id);
              if (!res.ok) pushToast(res.msg, "bad");
              refresh();
            }}
          />
        )}
        {tool && (
          <ToolBar
            tool={tool}
            s={s}
            ghost={uiRef.current.ghost}
            onDone={endTool}
            onRotate={() => { setTool((t) => ({ ...t, rot: ((t.rot || 0) + 1) % 4 })); uiRef.current.ghost = null; }}
          />
        )}
        {tab && (
          <div className="ct-sheet ct-win">
            <h3>
              {TABS.find((t) => t.id === tab).label}
              <button className="ct-close" aria-label="Close" onClick={() => setTab(null)}>✕</button>
            </h3>
            {tab === "build" && <BuildPanel s={s} onPick={pickTool} onSellMode={() => { setTool({ mode: "sell" }); setTab(null); setSel(null); }} />}
            {tab === "staff" && <StaffPanel s={s} rt={rt} onChange={refresh} />}
            {tab === "money" && <MoneyPanel s={s} onChange={refresh} />}
            {tab === "guests" && <GuestsPanel s={s} />}
            {tab === "goal" && <GoalPanel s={s} />}
          </div>
        )}
      </div>
      <nav className="ct-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "on" : ""}
            onClick={() => { setTab(tab === t.id ? null : t.id); endTool(); setPicker(false); }}
          >
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
      {brief && <Briefing L={L} onStart={() => setBrief(false)} />}
      {menu && (
        <PauseMenu
          onResume={() => setMenu(false)}
          onSave={() => { saveGame(s); pushToast("Game saved.", "good"); setMenu(false); }}
          onRestart={() => onRestart(s.levelId)}
          onQuit={quit}
        />
      )}
      {s.outcome && !s.outcome.ack && (
        <EndModal
          s={s}
          onContinue={() => { CMD.ackOutcome(s); saveGame(s); refresh(); }}
          onRetry={() => onRestart(s.levelId)}
          onMenu={quit}
        />
      )}
    </div>
  );
}

/* =============================== 10. APP ============================ */
export default function App() {
  const [session, setSession] = useState(null); // { s, isNew, key }
  const [progress, setProgress] = useState(() => loadProgress());
  const [save, setSave] = useState(() => loadGame());
  const start = (levelId) => {
    const s = newGame(levelId);
    saveGame(s);
    setSession({ s, isNew: true, key: Date.now() });
  };
  const cont = () => {
    const s = loadGame();
    if (!s) { setSave(null); return; }
    setSession({ s, isNew: false, key: Date.now() });
  };
  const exit = () => { setSave(loadGame()); setSession(null); };
  const complete = (levelId) => setProgress((p) => {
    if (p.completed.includes(levelId)) return p;
    const n = { ...p, completed: [...p.completed, levelId] };
    saveProgress(n);
    return n;
  });
  return (
    <div className="ct-root">
      <style>{CSS}</style>
      {session ? (
        <Game key={session.key} initial={session.s} isNew={session.isNew} onExit={exit} onComplete={complete} onRestart={start} />
      ) : (
        <Menu progress={progress} save={save} onNew={start} onContinue={cont} />
      )}
    </div>
  );
}

// Engine surface for tooling and future modules (the default export is the game).
export const __internals = {
  LEVELS, OBJECTS, ARCHETYPES, makeRuntime, casinoValue, saveGame, loadGame, clearSave,
  UI: { Menu, TopBar, BuildPanel, StaffPanel, MoneyPanel, GuestsPanel, GoalPanel, Inspector, Briefing, EndModal, PauseMenu },
};
