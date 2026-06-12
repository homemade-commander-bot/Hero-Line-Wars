# Changelog

## [0.1.0] — 2026-06-12

First playable release.

### Added
- Core Hero Line Wars loop: send monsters to raise permanent income, defend your own lane, raze the enemy castle (`src/engine.ts`).
- 6 champions × 7 unique abilities each (42 total, no crossover), with 3 choose-one category slots (Assault/Control/Arcana) + fixed signature ultimates with bespoke visuals (`src/data/heroes.ts`, `src/render.ts`).
- 14 sendable monsters across 3 keep tiers + 1 legendary, with real synergies (healer/banner/necromancer/chill auras, pack bonuses, death explosions, anti-castle siege, flyers) (`src/data/units.ts`).
- Item Forge: 8 basics + 6 secret auto-forged recipes hinted by an in-game riddle book; component "humming" hint; one forged-from-forged legendary (`src/data/items.ts`).
- War Council: repeatable stat training (capped at 12/track), scaling-cost castle repair, Keep I→II→III upgrades (tier unlocks, castle HP/archers, faster send gate).
- Economy: 30s income ticks, kill bounties (40% of cost), passive drip, hero kill rewards.
- Comeback mechanics: Underdog's Favor (+25% income/+12% damage when 25% behind), Last Stand castle volleys below 25% HP, repairs.
- Forced endgame: "The Twilight" at minute 35 — escalating castle brittleness + faster spawn gates each minute; income compounding capped at 8 stacks.
- AI opponent with 3 difficulties (Squire/Knight/Warlord) — same input interface and prices as the player (Squire pays a 15% markup as its handicap); counter-picking send strategies, kiting/retreat micro, ult timing.
- Spectate mode (AI vs AI) with up to 8× speed; pick/random hero modes.
- Procedural everything: canvas vector sprites for all units/heroes/map, particle system, six unique ultimate effects, WebAudio-synthesized SFX. Zero runtime deps, zero asset files.
- Headless balance sim (`npm run sim`): AI-vs-AI matches with duration/winrate reporting.

### Balance (from sim tuning)
- v1 problem: games stalemated past 50 min with runaway incomes (millions). Fixes: stat-training cap, scaling repair costs, Twilight castle-damage/gate escalation, queue cap (40), 1.8× baseline unit damage vs castles, XP at 0.8× bounty.
- Result: 24/24 knight-mirror sims inside the 15–45 min window (median ~36 min), zero timeouts. Hero winrates 40–70% on small samples (n≈10 each) — watch list: Vyrel high, Gorvana low.

### Known limitations
- Single map; no online multiplayer (AI opponent only).
- Hero winrate spreads are sim-derived with small samples; expect a balance pass after human playtesting.
