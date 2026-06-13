# Changelog

## [0.3.0] — 2026-06-13

The "warbands patch": 3v3, economy fix, sell/undo, readable spells, and a layout cleanup.

### Added
- **3v3 mode** ("Warbands"): you + 2 AI allies vs 3 enemy commanders, chosen from a Battle picker on the menu. Full per-player economy refactor — every commander (human or AI) owns their own gold, income, keep tier, barracks gate and item build; castles are shared by the team and scale with team size (+55% hp, +40% archers per ally). Kill bounty/XP attributes to the killer with assist-XP to lane-mates. AI allies hold formation spread across the lane (`engine.ts`, `ai.ts`, `ui.ts`, `sim.ts`).
- **Enemy & ally intel**: each commander shows a portrait, level and live item build in the top bar, with a tooltip listing their full inventory — so you can finally scout what the enemy is building.
- **Sell & undo items**: right-click an inventory item to sell it (60% refund); a freshly-bought basic refunds in full within a 12s undo window.
- **Forge when full**: with a full 6-slot inventory you can still buy the component that *completes* a recipe — it consumes the held pieces and drops the finished item in place.
- **Readable spell FX**: dedicated transient-geometry system — cone slashes now draw a sweeping wedge, novas a spiked shockwave ring, smites/blinks a jagged caster-to-target bolt, buffs a rising column of light, slams a ground ring with debris.
- **Hero models 2.0**: bulkier, archetype-specific builds — storm-giant Joruun (wide tattooed torso, greaves), robed mages with layered hems and sleeves, plate warriors with tassets, pauldrons, chest emblems and gauntlets; Gorvana animates a tail, Sylri carries a glowing quiver, Maelis hovers legless on a void-wisp; faces gained brows/noses.

### Changed
- **Economy curve inverted** — the core fix. Higher-tier monsters now return *more* income per gold (goblin 12 → avatar 15.4 income per 100g), so teching up is the economic play and goblin-spam is no longer strictly optimal. The counterweight is upfront cost and bounty risk (a leaked golem pays the defender 180g).
- **Shop panel relocated** off the right lane to float over the central chasm (dead space) — both lanes now stay fully visible while shopping.

### Fixed
- Wyvern/avatar specials and Imp/Avatar AoE now correctly target the *nearest* defending hero in a multi-hero lane (previously assumed one hero per team).

### Balance / known issues
- 1v1: 24/24 and 40/40 sims in the 15–45 min window (median ~24 min). A team-1 side skew in 1v1 traced to hero-draw variance over the fixed seed set, not a mechanical bias (it vanishes in 3v3, 44–56% across sides).
- 3v3: 16/16 in window (median ~28 min); hero winrates 22–86% on small samples (n=7–11). Korrigan trends low, Vyrel/Baldric high — a tuning pass is warranted after human playtesting.

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
