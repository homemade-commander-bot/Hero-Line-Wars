# Changelog

## [0.10.0] — 2026-06-18

**Champions reforged** — every hero hand-painted from the ground up, plus a real kiting mechanic.

### Changed
- **All 11 champions redrawn from scratch.** The old generic "weapon + recolor" humanoid is gone. Each hero now has a bespoke, hand-painted sprite with a distinct silhouette, layered armor or robes, flowing cloth, glowing arcana, and signature features — built to look powerful and unmistakably medieval-fantasy:
  - **Ser Baldric** — crested great-helm with a plume, heraldic tabard-cloak, a gold-cross kite shield and a gleaming longsword. **Gorvana** — scaled half-dragon hide with swept horns, a sweeping wing, a spaded tail, molten skin-cracks and twin axes. **Thrainn** — rune-etched plate with a glowing forge-heart, horned helm and braided beard, hefting a rune-banded maul. **Joruun** — a storm-giant's huge bare frame, crackling tattoos, a crown of static and lightning-wreathed fists.
  - **Tarvek** — a siege-engineer in a work-apron and brass goggles with a tool-belt, a floating blueprint-rune and a builder's maul. **Sylri** — a deep-hooded moon-ranger drawing a glowing longbow, quiver of moon-arrows on her back. **Vyrel** — a galewalker trailing a wind-scarf with twin curved blades and wind-streaks. **Korrigan** — the rat-king in a ragged cowl with a crown of teeth, twin gutter-knives and a loyal rat at his heel.
  - **Maelis** — a hovering void-sage with a tilted void-halo, a star-flecked robe and an orb of un-space. **Morrigan** — a verdant witch with an antler crown, vines and blossoms creeping up her robe, a living staff in bloom. **Seraphine** — a radiant cantor with a halo, wings of light, a gold stole and a swinging censer.
- **The hero-select screen is now a true gallery** — the cards and detail panel render the actual in-game champion sprite (full-length), not a simplified bust.

### Added
- **Kiting.** Sent monsters now **break off the march to fight a champion in close proximity** (within ~120 units): they stand and trade blows if you're in reach, or give chase if you back off — so a hero can body-block a wave and kite it away from the gate. Ranged heroes can pull, peck and reposition; melee heroes can hold the line. Harpies still skirmish on the move. (Aggro radius tuned so the lanes still flow and big waves still leak.)

### Balance
- Sim with kiting enabled: **0 timeouts** across 50 (1v1) + 16 (3v3) + 16 (warlord) matches. 1v1 median ~20.2 min (90% in the 15–45 window), 3v3 median ~24.2 min (100%), warlord median ~20.6 min (81%). Better defensive play kept matches comfortably in window.

## [0.9.0] — 2026-06-18

**The Siege** — a neutral world-boss that hunts the strongest keep.

### Added
- **The Siege.** Every few minutes (first at ~4:00, then ~every 3:40) **Korghul, the Wall-Eater** — a colossal neutral beast — claws out of the ground at the top of a lane and marches on that team's gate. It's drawn to the **mightiest keep**: it always targets the team currently *ahead* on castle health, so being in front carries a price (an anti-snowball event in the spirit of Underdog's Favor and the Twilight).
  - **Kill it, or pay the wall.** The besieged team must burst the boss down before it reaches the gate. Slay it and the killer pockets a fat, clock-scaled **bounty** (≈220g +26/min, shared as assist XP) plus a short **Slayer's Vigor** sustain buff (lifesteal + regen — deliberately *not* raw power, so winning the fight doesn't snowball the leader). Let it through and it **breaches the wall** for ~15% of max castle HP, then rampages off — heavy, but bounded; never an instant loss.
  - **A real fight.** The beast scales its health to the clock, the appearance count, and the number of defenders (so a 3v3 wall is a genuine co-op burn). It hits like a tier-3, throws a periodic **earth-shattering slam** (AoE damage + stun), and at half health looses a **world-shaking roar** that routs nearby heroes into flight. Every hero ability, tower, and summon damages it normally — focus fire wins.
  - **Presentation.** A molten warn-eruption with radiating cracks and a countdown at the spawn point, a **"⚠ KEEP UNDER SIEGE ⚠"** marker over the threatened castle, a hulking horned sprite with burning eyes, molten chest-cracks and clawed fists, a heavy health bar slung above it, a smoldering rune-ring at its feet, and full banners/flash/shake/stingers for the warning, the spawn, the slaying, and the breach.

### Balance
- Sim with sieges enabled: **0 timeouts** across 30 (1v1) + 16 (3v3) + 16 (warlord) matches. 1v1 median ~19.4 min (67% in the 15–45 window), 3v3 median ~23.2 min (100% in window), warlord median ~19.6 min (94%) — unchanged from the v0.8 baseline. Instrumented runs confirm ~4 sieges per game with defenders typically slaying 3 of 4; the bounded breach keeps a missed boss from ending the match on its own.

## [0.8.0] — 2026-06-14

**The Clash** — a recurring team-vs-team arena event that interrupts the lane war.

### Added
- **The Clash.** Every ~200s the war horns sound: a 6-second warning, then both teams are swept into a blood-moon arena at the center of the map for a 32-second hero-only duel. The lanes freeze (no marching, no income, no tower fire) while every hero — *including the fallen, who are revived for the fight* — teleports in at full health with a brief spawn shield, then it's a straight brawl.
  - **Scoring & rewards.** Knock an enemy hero out and they stay down for the rest of the Clash; first team to wipe the other (or lead on KOs when time runs out) wins. Winners take **+90 gold** each, every KO pays **+45 gold**, and the victors carry a **+15% damage "Clash Victor" buff** back to their lanes for 45s — a real swing in the macro game.
  - **Full ability combat in the arena.** Cones, novas, leaps, stuns, channeled zones (starfall, black holes, anvils), and projectiles all retarget onto enemy heroes inside the ring; auto-attacks chase the nearest foe. The AI fights the Clash with dedicated micro — kiting on ranged heroes, closing on melee, and spending its learned offensive abilities.
  - **Presentation.** Pulsing arena disc with rotating rune-rim, a giant warn countdown, a live **CLASH n — n** scoreboard with a depleting time bar, KO floaters, screen flash/shake, and horn/ult/defeat stingers.

### Balance
- Sim with Clashes enabled: **0 timeouts** across 30 matches; 1v1 median ~19.5 min (70% in the 15–45 window), 3v3 median ~25 min (100% in window). The lane freeze does not stall games — matches resolve cleanly and the gold swing rewards winning the brawl without ending the match on its own.

## [0.7.1] — 2026-06-14

Small fixes from playtest feedback.

### Fixed
- **Concede now asks for confirmation** ("Concede this battle?" with Confirm/Cancel) so you can't surrender by a stray click.
- **Top HUD no longer crowds the URL bar** — the board reserves a margin and centers within it, so income/castle status always sit clear of browser chrome.
- **Menu/README copy** no longer says "Two champions" (misleading for the 3v3 default) — now "Two keeps, two warbands."

## [0.7.0] — 2026-06-14

The "leveling & feel" patch — skill-point progression, faster pace, unit hotkeys, richer icons.

### Added
- **Skill-point leveling.** Each level grants a skill point; click an ability (or its green **+**) to learn or rank it up. Abilities you haven't learned can't be cast, and power scales with rank (basics rank 1–5, ultimate ranks at levels 6/11/16). Ability slots now show rank pips, a glowing LEARN/+ badge, and a "+N skill" badge on the portrait. The AI allocates its own points (opener first, ult on cooldown, then maxes its main).
- **Unit hotkeys.** Every barracks monster has a send key (number row `1`–`9` `0`, then `T Y U I` for tier 3); Shift sends ×5. Keys work whether or not the panel is open, and each unit card shows its key.

### Changed
- **Faster pace.** Default game speed is now 1.5× (options 1/1.5/2/3), the march is brisker, and heroes move a touch faster — the game no longer feels sluggish at base speed.
- **Ability icons** repainted as framed, glowing spell-tiles (theme-lit, bold motifs, ornate gold frames for ultimates) instead of thin line glyphs.
- **Early game rebalanced.** Heroes no longer trivialize early waves: with the skill system they start with a single learned ability, and tier-1 monsters are chunkier (+~30% base HP). Castles toughened (3000→3500) to keep matches from snowballing too fast.

### Balance
- 40-match sim: median ~20 min, 88% in the 15–45 window (a few early blowouts remain — weak early heroes can get snowballed). Tarvek ~55%. Hero spread is noisy on small samples and wants human playtesting.

## [0.6.0] — 2026-06-14

The "destructible towers" patch — from playtest feedback that a Tarvek with all his towers placed felt like a hero with no abilities left.

### Changed
- **Towers are now destroyed by enemy units.** Monsters marching past a tower smash it (the tower shows a health bar and collapses with a rubble burst when it falls). Since towers are permanent-until-killed, a defended lane is under constant attrition — Tarvek must keep rebuilding, so he always has something to do, and a strong enough push tears the wall down and breaks through.
- **Sent monsters buffed** — they were dying too easily and sends felt weak. All sent units now have +20% health and +6% damage (wildlife unaffected), so waves are more substantial and a leak hurts.

### Balance
- Destructibility is the clean fix for the "unbreakable wall" the tower rework had: a fully-set Tarvek used to auto-win (100% sim). Tuned across the extremes (over-nerfed to 27%, now landed at **~64%** on small samples) — a strong defensive specialist whose fortress can be overwhelmed. ~40+ towers are built-and-destroyed across a typical match. 1v1 sims ~98% in the 15–45 min window (median ~20 min).

## [0.5.0] — 2026-06-13

The "tower architect" patch: Tarvek reworked into a true tower-builder, plus an ability-visual fix.

### Changed
- **Tarvek the Wallwright fully reworked.** His abilities now build **one tower at a time, anywhere in your lane, on short cooldowns**, and the towers **stand permanently**. Pick a damage spire (Ballista/Splinter), an AoE anti-air coil (Tempest/Flame), and a slow pylon (Frost/Tar); the ultimate raises a single mega **Citadel of Ages**. Towers are **non-blocking** — units march on and slip around them (no more impassable maze).
- **Towers scale with the owner, not the hero.** A tower's damage grows with Tarvek's spell-power and attack-damage items + War-Council training (and range with his level) — invest in your gear, your towers get stronger. Read live at fire time.
- Towers cost **gold** to build (45–250g) on top of mana — a fortress competes with your war chest, the classic tower-defense tradeoff.
- **Anti-air matters:** ground towers (Ballista/Flame) can't hit flyers; only the Tempest Coil and Citadel shoot air (+60% vs flyers). The AI now counters a tower wall — sending flyers when it lacks anti-air, massing volume when it doesn't.

### Fixed
- **Joruun's Static Field** now renders as an actual roiling **storm cloud with lightning strikes**, not generic gravity rings.
- **Ability-ID collision bug:** Tarvek's Tempest tower shared the id `tempest` with Vyrel's ultimate, so that slot silently cast Vyrel's spell and built nothing. Renamed; audited all 11 heroes for duplicate ability ids (none remain).
- Towers pay **half bounty** on kills — a strong defense no longer doubles as free income.

### Balance
- Reworked Tarvek opened at a 100% sim winrate (permanent free scaling defense = unbreakable wall + economy snowball). Fixed structurally: non-blocking towers, an 8-tower cap (Citadel limited to one), gold cost, halved tower bounty, anti-air counters, and trimmed damage/scaling. Now ~67% on small samples — strong but beatable (fly over a no-anti-air set, or overwhelm with volume). 1v1 sims timeout-free, all in the 15–45 min window (median ~22 min).
- Deferred: the periodic team-vs-team "Clash"/boss event is still planned for a later patch.

## [0.4.0] — 2026-06-13

The "maze patch": a tower-building champion with real pathfinding, lull-fillers, a viewport fix, and a forge-set team reward.

### Added
- **Tarvek the Wallwright** (11th champion, INT engineer) — a tower-building, maze-making hero. His abilities place structures in his own lane: *Arrow Spire* / *Flame Battery* (damage turrets), *Bulwark Pylons* / *Tar Pylon* (blockers that maze the path), *Overclock* / *Bracewall* (empower & refresh your towers), and ultimate *Grand Bastion* (a fortress-spire). Towers expire, so the maze is actively maintained.
- **Flow-field pathfinding** (`flowfield.ts`): when towers stand in a lane, invading units BFS a route around them toward the gate — real mazing, lengthening the path and holding the wave in turret fire. Rebuilt only when a lane's towers change; units in a walled-off pocket fall back to a straight line so nothing ever gets permanently stuck (verified: 0 units stuck across the test, sims timeout-free).
- **Lull-fillers** — neutral **wildlife** (Gloomrats, Vale Wisps, Tusk Boars) wanders each lane to farm for gold during downtime, and **bounty relics** drop mid-lane every ~38s granting gold, haste, or spell-power when your hero walks over them.
- **Forgemaster's Favor** — a scaling team reward: every distinct recipe your warband forges grants the whole team +2% income; complete all 10 and every commander gains +6 to all stats and the castle is fortified by 1200. Progress shows in the Forge panel.
- **Hero signature auras** — each champion now emits a constant themed mote drift (Gorvana's embers, Joruun's arcs, Morrigan's leaves, Maelis's rising void-motes, …) and renders ~10% larger so heroes read above the horde.

### Fixed
- **Viewport / URL bar** — the fit now uses `visualViewport` and anchors to the top, so the top HUD is never hidden behind a browser's URL bar (the reported clipping).

### Balance
- 1v1 sims (30) timeout-free, 100% in the 15–45 min window (median ~21 min) — wildlife/relic farming nudges games a touch faster. Tarvek read strong (78%) on first pass; trimmed tower damage (~15%) and durations. Hero spread remains noisy on small samples; a broader tuning pass still pending human play.

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
