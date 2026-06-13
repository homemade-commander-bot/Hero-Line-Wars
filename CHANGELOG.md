# Changelog

## [0.2.0] — 2026-06-12

The "late-90s patch": art direction, controls, and content overhaul.

### Changed
- **Click-to-move**: click anywhere on the battlefield (either button) to order your hero there, with a WC3-style click marker; abilities aim at the cursor. WASD kept as an alternative (`src/main.ts`, `src/engine.ts`).
- **Complete art rewrite** (`src/render.ts`): outlined 3-tone-shaded sprites with walk cycles for all 14 monsters and 10 heroes (hero-specific headgear: plumed helms, horns, halos, rat-ears); painterly terrain — mottled dawn/dusk biomes, dirt roads with cobbles and worn ruts, a glowing magma chasm, plank bridge, scattered props (rocks, shrooms, bones, dead trees), runestone gate sentinels, drifting mist; castles rebuilt with brick courses, portcullis gates, conical-roofed towers, emblem banners and damage states; additive-glow magic, jagged lightning, light-pillar impacts; subtle UI bevels.

### Added
- **4 new champions** (10 total, 70 unique abilities): Thrainn Oathhammer (STR runesmith — sky-anvil callDown ult), Joruun Skybreaker (STR storm giant — smart-targeting bolt storm), Korrigan Vex (AGI plague assassin — rat-tide ult, contagion mechanics), Seraphine Dawnvoice (INT light cantor — blind, sanctified ground, sweeping light pillars).
- New combat mechanics: blind (attacks miss), disarm, execute damage, dot-spreading plague, knockback projectiles, delayed sky-strikes, smart/sweeping barrages, self-healing consecrated ground.
- **8 new items** (12 basics + 10 forged): Knight's Longblade, Tome of the Magus, Dwarven Warplate, Wyrmscale Charm; forged — Bloodthorn Blade (lifesteal), Dragonmaw Cleaver (melee cleave), Archmage's Folio (mana per kill), Wyrmguard Plate (chills attackers).
- AI plays all new content (build orders, callDown/mobileZone cast heuristics).

### Fixed
- AI economy stall: item purchases and keep savings starved the send budget; sends now take their cut first (`src/ai.ts`).
- Screen scaling now recomputes every frame with explicit translate+scale (was fragile flex+transform centering).
- HUD top-center refs (gold/income/clock) were never wired, crashing per-frame updates.

### Balance
- 30-match mirror sim: 100% in the 15–45 min window, median ~27 min, no timeouts. Hero winrates within 33–75% on small samples (n=2–9); Baldric buffed, Vyrel trimmed. Expect a tuning pass after human playtesting of the 4 new kits.

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
