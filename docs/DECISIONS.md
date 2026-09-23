# Decisions

Newest first. One entry per decision: date, what, why.

## 2026-09-23 · Project setup
- Stack per FOUNDATIONS §1: TypeScript 5.9, Vite 8, React 19 (UI only), Canvas 2D, `vite-plugin-singlefile` for one self-contained `index.html`.
- Layer rules enforced by a script (`scripts/check-boundaries.mjs`), not just convention.
- Playtest channel: each build published as a private Claude Artifact (playable in the Claude iPhone app). Netlify config included but optional.
- v0.2 prototype archived verbatim under `reference/v0.2/` as reference only.

## Open (need the owner)
- **Clock vs. population.** At "slow" (1 day ≈ 2 real min) a visit that looks like a few real minutes spans more than a calendar day. With realistic arrivals (~1–3K guests/day for a small locals casino) and 1:1 agents, thousands would be on the floor at once. Choose among: visible agents represent successive "visit threads" of real guests; fewer, 1:1 guests with money scales adjusted; or a slower calendar. Blocks M1 clock design. (FOUNDATIONS §26 flags this.)
