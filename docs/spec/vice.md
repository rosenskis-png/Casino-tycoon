# Vice, drugs and the hotel elevator (M9.6)

`src/sim/vice.ts` (escorts, hookups, drug use), `src/data/incidents.ts` (the catalog), `src/sim/street.ts` (hotel arrivals). FOUNDATIONS §3, §10, §12, §13, §22. The owner asked for this pass after M9.5; every design call here is Claude's, and every number is a starting value checked only against sanity flags until M11.

## The hotel elevator
- Some scenarios have one (Free Play and the Test Floor; not the Lucky Horseshoe): a fixed floor tile against a wall, drawn as brass lift doors. Nothing can be built on it.
- It is an entrance and an exit. Guests staying at the hotel arrive by it and leave by it: Conventioneers 80%, High rollers 60%, Tourists and Families 50%, Party guests 30%, Retirees 10%, Locals never. They skip the sidewalk and the curb-appeal glance.
- A **room comp** joins the Policies tab where there's an elevator: once earned (theoretical loss, like the other comps) the guest stays half as long again and likes the place a little more; the room costs the house $40.

## House rules
Two new policed categories with the usual levels (Ignore, Lenient, Moderate, Strict; Moderate by default):
- **Vice:** escorts working the floor, couples hooking up.
- **Drugs:** guests using something in a quiet spot.

## Escorts
- Not guests: workers from outside. How often they come depends on the vice rule (Ignore: about one a minute per 100 guests; Lenient two-thirds of that; Moderate a third; Strict a tenth: they still try their luck, and get shown out). At most one per 60 guests, six at a time. They come in by the elevator (or the street) and leave after about 3 minutes.
- An escort picks an adult guest nearby, winners and the drunk first, walks over and talks (a vice incident everyone nearby can see). The guest says yes with a chance set by their type's appetite for vice, how drunk they are and whether they're winning (× what security taught them about vice, M12). A guest who says yes leaves with them: by the elevator, where the room they take earns the house $50, or out the street door.
- **(M12, owner) On their arm:** a guest who says yes while playing a game keeps the escort at their side for the rest of the visit instead of leaving at once. Company erodes savvy like about two drinks (savvy × (1 − … − 0.35)), counts 0.3 toward tilt, and they bet as if a crowd of friends were watching ("Blow on the dice for me, sweetheart."). When they call it a night they go up together (the room, $50). A whale never takes one to the table.
- Guards step in by the vice rule (from Lenient up, when reported) and show the escort out. An officer who sees it costs 3 police standing and a fine.
- What the house gets: the room money, and the crowds who like it (Party guests and High rollers enjoy seeing vice; Families and Retirees hate it). What it costs: players walking off the floor, reports, and the police.

## Hookups
Two drunk adults (intoxication 0.35+, in a good mood) in a quiet spot (little foot traffic, no crowd) may hook up: a few seconds of kissing, then a clothed standing pose, hearts over both. A vice incident: guards step in by the rule; witnesses react by type.

## Drugs
- A few guests use (Party 15%, High rollers 5%, Conventioneers 4%, Locals and Tourists 3%, never Retirees, Families or children), at most twice a visit, only in a quiet spot and never with a guard in view (the usual deterrent applies).
- Using is a drugs incident. The guest is high for about 90 s: they bet 40% more, don't tire, and their mood lifts. 2% of uses are an overdose: they pass out (paramedics, as with drink).
- Guards step in by the drugs rule. An officer who sees it costs 6 police standing and a fine.

## Art
Escorts (short dresses or open shirts, bright, at pixel scale), the lift doors, a sparkle over a guest using and hearts over a hookup.

## Save
Schema 13: the map gains `lift` (tile or −1); house rules gain `vice` and `drugs`; guests gain `drugs` (0 never, else uses + 1) and `high`; escorts are a new visitor role.
