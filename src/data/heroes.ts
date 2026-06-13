// ---------------------------------------------------------------------------
// The six champions of the Sundered Vale.
// Every ability belongs to exactly one hero — there is no crossover.
// Each hero picks ONE ability per category slot (Assault / Control / Arcana);
// the Ultimate is their signature and cannot be changed.
// ---------------------------------------------------------------------------

import type { AbilityDef, AbilityCat, AbilityKind, AbilityTheme, HeroDef } from '../types';

function ab(
  hero: string, slot: 0 | 1 | 2 | 3, cat: AbilityCat, kind: AbilityKind,
  id: string, name: string, desc: string, cd: number, mana: number,
  p: Record<string, number>, theme: AbilityTheme,
): AbilityDef {
  return { id, name, hero, cat, slot, kind, desc, cd, mana, p, theme };
}

// ============================================================ SER BALDRIC ====
const baldric: HeroDef = {
  id: 'baldric',
  name: 'Ser Baldric',
  epithet: 'the Unbroken',
  attr: 'str',
  blurb: 'Last knight of a fallen order. His shield has outlived three kingdoms, and he intends for it to outlive a fourth.',
  base: { str: 24, agi: 14, int: 14 },
  growth: { str: 2.85, agi: 1.4, int: 1.4 },
  baseDmg: 29, atkRange: 95, atkInterval: 1.25, ms: 150,
  weapon: 'sword',
  palette: { skin: '#e8b88a', main: '#8d99b8', trim: '#e3b341', glow: '#ffd86b', hair: '#b9852f' },
  slots: [
    [
      ab('baldric', 0, 'Assault', 'coneSlash', 'shieldbreaker', 'Shieldbreaker Cleave',
        'Sweep a crushing arc. Deals bonus damage to Tier 2+ monsters — built to fell ogres and worse.',
        7, 22, { dmg: 70, lvl: 9, range: 155, arc: 2.0, tierBonus: 0.45 }, { c1: '#ffd86b', c2: '#fff3c4', shape: 'slash' }),
      ab('baldric', 0, 'Assault', 'targetStun', 'oathstrike', 'Oathstrike',
        'Smite the mightiest foe before you. Heavy damage and a stunning blow that names them oathbreaker.',
        9, 26, { dmg: 100, lvl: 13, stun: 1.1, range: 240, strongest: 1 }, { c1: '#ffe9a0', c2: '#e3b341' }),
    ],
    [
      ab('baldric', 1, 'Control', 'nova', 'rampart', 'Rampart Slam',
        'Drive your shield into the earth. Nearby enemies are thrown back and slowed by the shockwave.',
        10, 30, { dmg: 55, lvl: 7, r: 175, knock: 120, slow: 0.35, slowDur: 2.2 }, { c1: '#c9d4ee', c2: '#8d99b8' }),
      ab('baldric', 1, 'Control', 'zone', 'bannervale', 'Banner of the Vale',
        'Plant the old kingdom\'s banner. Enemies beneath it trudge as if through mud; Baldric standing near it is granted stone-like armor.',
        14, 30, { r: 185, dur: 6, slow: 0.32, armor: 9 }, { c1: '#e3b341', c2: '#3c63b0' }),
    ],
    [
      ab('baldric', 2, 'Arcana', 'buffSelf', 'aegisdawn', 'Aegis of Dawn',
        'Raise a shield of morning light that absorbs damage and scorches attackers with a third of what it endures.',
        12, 30, { dur: 4.5, shield: 130, shieldLvl: 17, reflect: 0.33 }, { c1: '#fff3c4', c2: '#ffd86b' }),
      ab('baldric', 2, 'Arcana', 'buffSelf', 'vigor', "Crusader's Vigor",
        'A battle-prayer that knits wounds shut and quickens the stride.',
        11, 28, { dur: 3, heal: 95, healLvl: 14, msPct: 0.32 }, { c1: '#ffffff', c2: '#ffd86b' }),
    ],
  ],
  ult: ab('baldric', 3, 'Ultimate', 'transform', 'colossus', 'Sunforged Colossus',
    'Baldric becomes a giant of living gold. Massive damage, iron skin, and every swing cleaves the whole line. The Vale remembers its protector.',
    75, 90, { dur: 12, dmgPct: 0.75, scale: 1.55, armor: 10, healPct: 0.25, cleaveArc: 2.4 }, { c1: '#ffd86b', c2: '#fff8e1' }),
};

// =========================================================== GORVANA ========
const gorvana: HeroDef = {
  id: 'gorvana',
  name: 'Gorvana',
  epithet: 'Emberhide',
  attr: 'str',
  blurb: 'Half-dragon war-chief of the Ashfang clans. Her scales still smolder from the volcano that should have killed her.',
  base: { str: 25, agi: 13, int: 13 },
  growth: { str: 3.0, agi: 1.5, int: 1.2 },
  baseDmg: 31, atkRange: 100, atkInterval: 1.35, ms: 155,
  weapon: 'axes',
  palette: { skin: '#c96f4a', main: '#5d2a2a', trim: '#ff7733', glow: '#ff5e2b', hair: '#2b1c1c' },
  slots: [
    [
      ab('gorvana', 0, 'Assault', 'leapSlam', 'magmamaul', 'Magma Maul',
        'Leap and bring both axes down, splitting the earth into a pool of burning magma.',
        10, 32, { dash: 270, dmg: 86, lvl: 10, r: 145, zoneDps: 24, zoneDur: 3.5, zoneR: 125 }, { c1: '#ff5e2b', c2: '#ffb347' }),
      ab('gorvana', 0, 'Assault', 'projectile', 'twinfang', 'Twin Fang Axes',
        'Hurl both axes spinning through the line — they bite once going out and once coming home.',
        8, 26, { dmg: 70, lvl: 9, speed: 430, r: 28, pierce: 1, boomerang: 1 }, { c1: '#ffb347', c2: '#5d2a2a' }),
    ],
    [
      ab('gorvana', 1, 'Control', 'nova', 'cinderroar', 'Roar of Cinders',
        'A dragon-roar of sparks and terror. Enemies flee burning, cinders eating at them as they run.',
        13, 34, { dmg: 40, lvl: 5, r: 195, fear: 1.4, dot: 18, dotDur: 3 }, { c1: '#ff5e2b', c2: '#3d2020' }),
      ab('gorvana', 1, 'Control', 'nova', 'tailsweep', 'Tail Sweep',
        'Her tail strikes like a siege ram — everything around her is hurled away.',
        9, 26, { dmg: 68, lvl: 8, r: 155, knock: 160 }, { c1: '#c96f4a', c2: '#ff7733' }),
    ],
    [
      ab('gorvana', 2, 'Arcana', 'buffSelf', 'emberhide', 'Emberhide',
        'Her scales ignite. Enemies near her burn just for daring to stand close.',
        14, 30, { dur: 6, auraDps: 22, auraLvl: 3, auraR: 135 }, { c1: '#ff7733', c2: '#ff5e2b' }),
      ab('gorvana', 2, 'Arcana', 'buffSelf', 'dragonblood', 'Dragonblood Surge',
        'Old blood answers old wounds — heals fiercely, and fiercer still the closer she stands to death.',
        13, 26, { heal: 75, healLvl: 10, healMissPct: 0.3, dur: 0 }, { c1: '#ff4d4d', c2: '#ff9966' }),
    ],
  ],
  ult: ab('gorvana', 3, 'Ultimate', 'beam', 'wyrmfire', 'Avatar of the Burning Wyrm',
    'Wings of flame unfurl and Gorvana breathes a river of dragonfire that rolls down the entire lane, igniting everything it touches.',
    80, 100, { dur: 3.6, dps: 240, width: 95, igniteDps: 26, igniteDur: 3 }, { c1: '#ff5e2b', c2: '#ffd86b' }),
};

// ============================================================= SYLRI ========
const sylri: HeroDef = {
  id: 'sylri',
  name: 'Sylri',
  epithet: 'Nightwhisper',
  attr: 'agi',
  blurb: 'A moonlit ranger exiled from the Silverwood for an arrow she never regretted. The stars still answer when she calls.',
  base: { str: 15, agi: 24, int: 13 },
  growth: { str: 1.4, agi: 2.8, int: 1.4 },
  baseDmg: 21, atkRange: 430, atkInterval: 1.28, ms: 160,
  weapon: 'bow',
  palette: { skin: '#e8cba8', main: '#4a3f6e', trim: '#b59ce8', glow: '#c5a8ff', hair: '#dfe6ff' },
  slots: [
    [
      ab('sylri', 0, 'Assault', 'projectile', 'moonpiercer', 'Moonpiercer',
        'One arrow, fletched with moonlight, drilled clean through everything in its path.',
        7, 24, { dmg: 80, lvl: 10, speed: 700, r: 20, pierce: 1 }, { c1: '#c5a8ff', c2: '#ffffff' }),
      ab('sylri', 0, 'Assault', 'projectile', 'twinshade', 'Twinshade Volley',
        'Loose a fan of three shadow-arrows that seek the nearest marchers.',
        8, 26, { dmg: 56, lvl: 7, speed: 620, r: 18, count: 3 }, { c1: '#8a6fd1', c2: '#4a3f6e' }),
    ],
    [
      ab('sylri', 1, 'Control', 'zone', 'thornsnare', 'Thorned Snare',
        'A hidden ring of silver thorns springs shut — everything caught is rooted and bleeds.',
        11, 28, { r: 115, root: 2.2, dps: 14, dur: 3 }, { c1: '#9fe8b0', c2: '#4a3f6e' }),
      ab('sylri', 1, 'Control', 'dash', 'veilstep', 'Veilstep',
        'Step through shadow, leaving a whispering double behind. Monsters cannot resist striking at the lie.',
        12, 26, { dist: 250, decoy: 1, decoyHp: 220, decoyDur: 3.5 }, { c1: '#4a3f6e', c2: '#c5a8ff', shape: 'decoy' }),
    ],
    [
      ab('sylri', 2, 'Arcana', 'buffSelf', 'whisperwind', 'Whisperwind',
        'The wind itself draws her bow — vastly faster shots, each followed by a phantom arrow.',
        13, 30, { dur: 5, asPct: 0.5, echoArrow: 0.4 }, { c1: '#dfe6ff', c2: '#b59ce8' }),
      ab('sylri', 2, 'Arcana', 'summon', 'sylvanmurmur', 'Sylvan Murmur',
        'Two owl-spirits of the old wood answer her call and rake the enemy line with talons of light.',
        16, 36, { count: 2, dur: 11, hp: 130, dmg: 17, range: 260, speed: 170 }, { c1: '#c5a8ff', c2: '#ffffff', shape: 'owl' }),
    ],
  ],
  ult: ab('sylri', 3, 'Ultimate', 'barrage', 'starfall', 'Rain of Falling Stars',
    'Sylri looses one arrow into the night sky — and the sky answers with fourteen. Falling stars hammer the field, searing and slowing all they strike.',
    80, 100, { dur: 4.5, count: 14, r: 270, dmg: 92, lvl: 6, slow: 0.35, slowDur: 1.6 }, { c1: '#c5a8ff', c2: '#fff8e1' }),
};

// ============================================================= VYREL ========
const vyrel: HeroDef = {
  id: 'vyrel',
  name: 'Vyrel',
  epithet: 'the Galewalker',
  attr: 'agi',
  blurb: 'A duelist who bargained with the four winds and won three. The fourth follows him, waiting for its rematch.',
  base: { str: 16, agi: 25, int: 12 },
  growth: { str: 1.8, agi: 2.9, int: 1.3 },
  baseDmg: 25, atkRange: 125, atkInterval: 0.95, ms: 175,
  weapon: 'blades',
  palette: { skin: '#d9b08c', main: '#1f6f6b', trim: '#aef3e7', glow: '#7df3df', hair: '#e8e3d3' },
  slots: [
    [
      ab('vyrel', 0, 'Assault', 'leapSlam', 'zephyrslash', 'Zephyr Slash',
        'Become the wind: dash through the line, blades out. Everything along the path is cut.',
        8, 24, { dash: 310, dmg: 76, lvl: 9, line: 1, width: 75, r: 0 }, { c1: '#7df3df', c2: '#ffffff' }),
      ab('vyrel', 0, 'Assault', 'nova', 'cycloneedge', 'Cyclone Edge',
        'Spin into a ring of blades — a circle of cuts no shield can face all at once.',
        8, 26, { dmg: 74, lvl: 9, r: 165 }, { c1: '#aef3e7', c2: '#1f6f6b' }),
    ],
    [
      ab('vyrel', 1, 'Control', 'nova', 'updraft', 'Updraft',
        'A pillar of rising wind flings nearby enemies into the air, helpless until they land.',
        11, 30, { dmg: 36, lvl: 4, r: 175, air: 1.25 }, { c1: '#dffcf7', c2: '#7df3df' }),
      ab('vyrel', 1, 'Control', 'wall', 'windwall', 'Wind Wall',
        'Raise a howling wall across the lane. Monsters claw through it slowly, flayed by the gale.',
        13, 30, { len: 230, dur: 4.5, slow: 0.6, dps: 9 }, { c1: '#aef3e7', c2: '#dffcf7' }),
    ],
    [
      ab('vyrel', 2, 'Arcana', 'buffSelf', 'tailwind', 'Tailwind',
        'The third wind carries him: faster strikes, faster steps, and a quarter of all blows miss entirely.',
        12, 26, { dur: 5, asPct: 0.35, msPct: 0.35, dodge: 0.27 }, { c1: '#7df3df', c2: '#ffffff' }),
      ab('vyrel', 2, 'Arcana', 'buffSelf', 'slipstream', 'Slipstream',
        'For a breath, distance forgets him — every attack blinks Vyrel to its target, and his blades strike harder.',
        14, 30, { dur: 6, dmgPct: 0.22, blinkStrike: 1 }, { c1: '#dffcf7', c2: '#1f6f6b' }),
    ],
  ],
  ult: ab('vyrel', 3, 'Ultimate', 'mobileZone', 'tempest', 'Eye of the Tempest',
    'The fourth wind gets its rematch. Vyrel unleashes a roaming tornado that you steer with your gaze, dragging monsters into its shredding heart.',
    85, 100, { dur: 7, r: 135, dps: 88, pull: 65, drift: 95 }, { c1: '#7df3df', c2: '#cfd8dc' }),
};

// ============================================================= MAELIS ========
const maelis: HeroDef = {
  id: 'maelis',
  name: 'Maelis',
  epithet: 'the Hollow Sage',
  attr: 'int',
  blurb: 'He looked into the space between stars and something looked back. Now they share the body, and both of them do the math.',
  base: { str: 14, agi: 13, int: 25 },
  growth: { str: 1.4, agi: 1.3, int: 2.9 },
  baseDmg: 20, atkRange: 390, atkInterval: 1.3, ms: 150,
  weapon: 'orb',
  palette: { skin: '#cfc4e8', main: '#2d2150', trim: '#6de0e8', glow: '#9d6df0', hair: '#1a1430' },
  slots: [
    [
      ab('maelis', 0, 'Assault', 'projectile', 'riftbolt', 'Riftbolt',
        'A shard of un-space that punches through the line and detonates into hungry static.',
        7, 22, { dmg: 80, lvl: 10, speed: 540, r: 22, pierce: 1, explodeR: 95, explodeDmg: 44 }, { c1: '#9d6df0', c2: '#6de0e8' }),
      ab('maelis', 0, 'Assault', 'zone', 'collapsingstar', 'Collapsing Star',
        'Plant a dying star. It inhales for a heartbeat, dragging monsters inward — then goes out, violently.',
        10, 34, { r: 155, delay: 1.1, dmg: 115, lvl: 14, pull: 95, dur: 1.1 }, { c1: '#6de0e8', c2: '#2d2150' }),
    ],
    [
      ab('maelis', 1, 'Control', 'targetStun', 'nullcage', 'Null Cage',
        'Fold the strongest monster on the field into a pocket of nothing. It waits there, politely, until released.',
        12, 30, { dmg: 52, lvl: 6, stun: 2.2, range: 360, strongest: 1 }, { c1: '#6de0e8', c2: '#9d6df0' }),
      ab('maelis', 1, 'Control', 'zone', 'gravitywell', 'Gravity Well',
        'A patch of the lane remembers what it owes the void. Everything inside is crushed and slowed.',
        12, 32, { r: 155, dur: 3.5, slow: 0.5, dps: 26, lvl: 3 }, { c1: '#2d2150', c2: '#9d6df0' }),
    ],
    [
      ab('maelis', 2, 'Arcana', 'buffSelf', 'astralecho', 'Astral Echo',
        'The other one casts too. Your next spell happens twice.',
        16, 20, { dur: 8, echo: 1 }, { c1: '#cfc4e8', c2: '#6de0e8' }),
      ab('maelis', 2, 'Arcana', 'buffSelf', 'voidsight', 'Voidsight',
        'See the seams of things. Spells bite 30% deeper, and stolen starlight refills his mana.',
        14, 10, { dur: 6, spellAmp: 0.3, manaGain: 38 }, { c1: '#6de0e8', c2: '#2d2150' }),
    ],
  ],
  ult: ab('maelis', 3, 'Ultimate', 'zone', 'eventhorizon', 'Event Horizon',
    'Maelis opens the door he was warned about. A black sun swallows the lane — monsters spiral helplessly into the light-drinking heart, and when it closes, little is left.',
    90, 110, { r: 205, dur: 3.8, pull: 150, dps: 105, lvl: 7, burst: 150, blackhole: 1 }, { c1: '#1a1430', c2: '#9d6df0' }),
};

// ============================================================ MORRIGAN =======
const morrigan: HeroDef = {
  id: 'morrigan',
  name: 'Morrigan',
  epithet: 'Thornheart',
  attr: 'int',
  blurb: 'The Verdant Witch of the Sundered Vale. The forest loved her so much it grew through her. She considers this an upgrade.',
  base: { str: 15, agi: 14, int: 24 },
  growth: { str: 1.5, agi: 1.4, int: 2.8 },
  baseDmg: 21, atkRange: 370, atkInterval: 1.25, ms: 152,
  weapon: 'staff',
  palette: { skin: '#bfe3b0', main: '#2e4d2a', trim: '#e85fb0', glow: '#7dff8a', hair: '#5d2a52' },
  slots: [
    [
      ab('morrigan', 0, 'Assault', 'projectile', 'briarlash', 'Briarlash',
        'A whip of living briar cracks down the lane, cutting deep and hauling the wounded toward her.',
        7, 24, { dmg: 80, lvl: 10, speed: 820, r: 24, pierce: 1, drag: 110 }, { c1: '#7dff8a', c2: '#2e4d2a' }),
      ab('morrigan', 0, 'Assault', 'zone', 'sporeburst', 'Sporeburst',
        'Lob a swollen seed-pod that bursts into choking spores. The poison keeps working long after the bang.',
        9, 28, { r: 135, dmg: 58, lvl: 7, dps: 17, dur: 4 }, { c1: '#e85fb0', c2: '#7dff8a' }),
    ],
    [
      ab('morrigan', 1, 'Control', 'zone', 'strangleroots', 'Strangleroots',
        'Roots erupt and seize everything in the circle, squeezing while they hold.',
        12, 32, { r: 145, root: 1.9, dps: 15, dur: 3 }, { c1: '#2e4d2a', c2: '#7dff8a' }),
      ab('morrigan', 1, 'Control', 'zone', 'pollendaze', 'Pollen Daze',
        'A cloud of sweet madness. Monsters forget their orders and turn tooth and claw on each other.',
        14, 34, { r: 155, confuse: 2.8, dur: 0.5 }, { c1: '#ffd1ec', c2: '#e85fb0' }),
    ],
    [
      ab('morrigan', 2, 'Arcana', 'buffSelf', 'lifebloom', 'Lifebloom',
        'Hungry vines drink the life of everything near her and feed it back as her own.',
        13, 30, { dur: 6, drainDps: 19, drainLvl: 2.5, drainR: 175 }, { c1: '#7dff8a', c2: '#e85fb0' }),
      ab('morrigan', 2, 'Arcana', 'buffSelf', 'thornskin', 'Thornskin',
        'Bark and thorn sheathe her skin — hard to wound, and the wounding cuts both ways.',
        12, 26, { dur: 6, armor: 9, reflect: 0.45 }, { c1: '#2e4d2a', c2: '#bfe3b0' }),
    ],
  ],
  ult: ab('morrigan', 3, 'Ultimate', 'summon', 'gardenofteeth', 'Garden of Teeth',
    'Morrigan plants three seeds and the lane grows a garden of snapping, man-high jaws. The garden is always hungry. The garden is very fond of her.',
    85, 100, { count: 3, dur: 11, hp: 320, dmg: 68, range: 130, speed: 0 }, { c1: '#7dff8a', c2: '#e85fb0', shape: 'snapper' }),
};

// ============================================================ THRAINN =======
const thrainn: HeroDef = {
  id: 'thrainn',
  name: 'Thrainn',
  epithet: 'Oathhammer',
  attr: 'str',
  blurb: 'Last runesmith of the Under-Forge. He carries the hammer that built the mountain — and the grudge that emptied it.',
  base: { str: 26, agi: 12, int: 14 },
  growth: { str: 2.9, agi: 1.2, int: 1.5 },
  baseDmg: 29, atkRange: 90, atkInterval: 1.45, ms: 145,
  weapon: 'hammer',
  palette: { skin: '#e0a47a', main: '#6e5a3a', trim: '#6de0e8', glow: '#7df3ff', hair: '#d14f2a' },
  slots: [
    [
      ab('thrainn', 0, 'Assault', 'leapSlam', 'anvilfall', 'Anvilfall',
        'A short leap, a long fall. The hammer lands like a verdict, stunning everything around the dent.',
        10, 30, { dash: 230, dmg: 82, lvl: 10, r: 140, stun: 0.9 }, { c1: '#7df3ff', c2: '#6e5a3a' }),
      ab('thrainn', 0, 'Assault', 'projectile', 'hammerwave', 'Runic Hammerwave',
        'Slam the road and send a wave of rune-force rolling up the lane, battering monsters backward.',
        8, 26, { dmg: 64, lvl: 9, speed: 380, r: 34, pierce: 1, knock: 55 }, { c1: '#6de0e8', c2: '#3a4a6e' }),
    ],
    [
      ab('thrainn', 1, 'Control', 'zone', 'chains', 'Chains of Khaz',
        'Rune-chains erupt from the stone and hold the circle fast. The mountain does not let go quickly.',
        12, 32, { r: 150, root: 2.0, dps: 12, dur: 3 }, { c1: '#7df3ff', c2: '#5a5a6e' }),
      ab('thrainn', 1, 'Control', 'wall', 'seismicrift', 'Seismic Rift',
        'Crack the lane open. What tries to cross the fissure does so slowly, and bleeding.',
        13, 30, { len: 240, dur: 4.5, slow: 0.55, dps: 11 }, { c1: '#e0a47a', c2: '#6e5a3a' }),
    ],
    [
      ab('thrainn', 2, 'Arcana', 'buffSelf', 'runeward', 'Runeward',
        'The old defensive runes flare awake — a shield of light and a skin of stone.',
        12, 30, { dur: 5, shield: 120, shieldLvl: 15, armor: 7 }, { c1: '#7df3ff', c2: '#6e5a3a' }),
      ab('thrainn', 2, 'Arcana', 'buffSelf', 'forgeheart', 'Forgeheart',
        'Stoke the furnace behind the ribs: wounds close and the hammer falls heavier.',
        13, 28, { heal: 70, healLvl: 10, dur: 5, dmgPct: 0.25 }, { c1: '#ff8c42', c2: '#6e5a3a' }),
    ],
  ],
  ult: ab('thrainn', 3, 'Ultimate', 'callDown', 'anvilofages', 'The Anvil of Ages',
    'Thrainn names a spot and the Under-Forge answers: a mountain-sized anvil falls out of the sky, flattening and stunning the line, leaving a field of grinding runes.',
    80, 95, { r: 175, delay: 1.2, dmg: 300, lvl: 14, stun: 1.6, fieldDur: 4, fieldSlow: 0.4, fieldDps: 30 }, { c1: '#7df3ff', c2: '#2a3a4e' }),
};

// =========================================================== SERAPHINE ======
const seraphine: HeroDef = {
  id: 'seraphine',
  name: 'Seraphine',
  epithet: 'Dawnvoice',
  attr: 'int',
  blurb: 'High cantor of a cathedral that no longer exists. The hymns survived her congregation. They are not gentle hymns.',
  base: { str: 14, agi: 13, int: 26 },
  growth: { str: 1.5, agi: 1.3, int: 3.0 },
  baseDmg: 20, atkRange: 400, atkInterval: 1.3, ms: 150,
  weapon: 'censer',
  palette: { skin: '#f2d4b0', main: '#f2ead8', trim: '#e3b341', glow: '#fff3c4', hair: '#9a5d2a' },
  slots: [
    [
      ab('seraphine', 0, 'Assault', 'projectile', 'aurumlance', 'Lance of Aurum',
        'A spear of compressed dawn, sung straight through the line.',
        7, 24, { dmg: 84, lvl: 10, speed: 760, r: 20, pierce: 1 }, { c1: '#fff3c4', c2: '#e3b341' }),
      ab('seraphine', 0, 'Assault', 'zone', 'censerburst', 'Censer Burst',
        'Hurl the burning censer: holy smoke sears the circle and leaves monsters swinging blind.',
        9, 28, { r: 140, dmg: 62, lvl: 8, blind: 1, blindDur: 2.2, dps: 10, dur: 2.5 }, { c1: '#fff3c4', c2: '#9a5d2a' }),
    ],
    [
      ab('seraphine', 1, 'Control', 'zone', 'choirchains', 'Choir of Chains',
        'A hymn with hooks in it. Everything in the circle drags its feet against the harmony.',
        12, 30, { r: 160, dur: 3.5, slow: 0.55, dps: 18, lvl: 3 }, { c1: '#e3b341', c2: '#f2ead8' }),
      ab('seraphine', 1, 'Control', 'zone', 'sanctified', 'Sanctified Ground',
        'Consecrate the road: enemies wade against the light while it knits her wounds shut.',
        13, 32, { r: 165, dur: 5, slow: 0.35, heal: 28, healLvl: 3 }, { c1: '#fff3c4', c2: '#7db8ff' }),
    ],
    [
      ab('seraphine', 2, 'Arcana', 'buffSelf', 'benediction', 'Benediction',
        'A verse for herself, for once — health restored and a choir-shield against what comes next.',
        12, 30, { heal: 80, healLvl: 12, dur: 4, shield: 90, shieldLvl: 12 }, { c1: '#fff3c4', c2: '#e3b341' }),
      ab('seraphine', 2, 'Arcana', 'buffSelf', 'litany', 'Litany of Zeal',
        'The fast hymn. The dangerous one. Spells bite deeper and the censer swings double-time.',
        14, 26, { dur: 6, asPct: 0.35, spellAmp: 0.25 }, { c1: '#e3b341', c2: '#9a5d2a' }),
    ],
  ],
  ult: ab('seraphine', 3, 'Ultimate', 'barrage', 'judgement', 'Judgement Choir',
    'Seraphine sings the verse that ended the cathedral: pillars of dawn descend one by one down the entire lane, each a held note made lethal.',
    85, 105, { dur: 4.2, count: 9, r: 600, dmg: 105, lvl: 9, sweep: 1, hitR: 95, slow: 0.3, slowDur: 1.4 }, { c1: '#fff3c4', c2: '#e3b341', shape: 'pillar' }),
};

// ============================================================ KORRIGAN ======
const korrigan: HeroDef = {
  id: 'korrigan',
  name: 'Korrigan',
  epithet: 'Vex of the Undergutter',
  attr: 'agi',
  blurb: 'The sewers under the Vale have a king. He has knives, a crown of teeth, and ten thousand loyal subjects with tails.',
  base: { str: 14, agi: 26, int: 13 },
  growth: { str: 1.4, agi: 3.0, int: 1.3 },
  baseDmg: 22, atkRange: 115, atkInterval: 0.9, ms: 170,
  weapon: 'blades',
  palette: { skin: '#b8a88a', main: '#3d4a2a', trim: '#9acd32', glow: '#b8e35c', hair: '#2a2a20' },
  slots: [
    [
      ab('korrigan', 0, 'Assault', 'projectile', 'festeringfan', 'Festering Fan',
        'A fan of gutter-knives, each kissed with something that keeps working after the cut.',
        8, 26, { dmg: 48, lvl: 7, speed: 600, r: 18, count: 3, dot: 14, dotDur: 3.5 }, { c1: '#b8e35c', c2: '#3d4a2a' }),
      ab('korrigan', 0, 'Assault', 'leapSlam', 'gutterlunge', 'Gutter Lunge',
        'A rat-quick dash through the line — the wounded are opened to the bone.',
        9, 26, { dash: 290, dmg: 66, lvl: 9, line: 1, width: 65, execute: 0.9 }, { c1: '#9acd32', c2: '#2a2a20' }),
    ],
    [
      ab('korrigan', 1, 'Control', 'mobileZone', 'ratswarm', 'Rat Swarm',
        'Whistle up a knee-high tide of subjects that follows your gaze, gnawing and tangling.',
        14, 32, { dur: 5, r: 95, dps: 22, pull: 0, drift: 120 }, { c1: '#8a7a5d', c2: '#3d4a2a' }),
      ab('korrigan', 1, 'Control', 'zone', 'chokingsmog', 'Choking Smog',
        'A bottle of the Undergutter\'s finest air. Monsters in the cloud swing at memories.',
        13, 30, { r: 150, dur: 3.5, blind: 1, dps: 8 }, { c1: '#6a7a5d', c2: '#3d4a2a' }),
    ],
    [
      ab('korrigan', 2, 'Arcana', 'buffSelf', 'verminskin', 'Verminskin',
        'Move like something that has survived a thousand boots: faster, and half the blows find nothing.',
        12, 26, { dur: 5, msPct: 0.4, dodge: 0.3 }, { c1: '#b8e35c', c2: '#2a2a20' }),
      ab('korrigan', 2, 'Arcana', 'buffSelf', 'plaguemonger', 'Plaguemonger',
        'For a while, his poisons are ambitious — anything that dies rotting passes the rot along.',
        14, 30, { dur: 7, plague: 1, dmgPct: 0.12 }, { c1: '#9acd32', c2: '#4a5d23' }),
    ],
  ],
  ult: ab('korrigan', 3, 'Ultimate', 'beam', 'thousandteeth', 'King of a Thousand Teeth',
    'Korrigan raises his crown and the Undergutter empties: a living tide of rats washes down the whole lane, gnawing everything above ankle height.',
    85, 100, { dur: 4.2, dps: 190, width: 85, igniteDps: 18, igniteDur: 3 }, { c1: '#8a7a5d', c2: '#3d4a2a', shape: 'rats' }),
};

// ============================================================= JORUUN =======
const joruun: HeroDef = {
  id: 'joruun',
  name: 'Joruun',
  epithet: 'Skybreaker',
  attr: 'str',
  blurb: 'A storm giant who lost a bet with the sky and must carry its weather until he wins it back. He is trying very hard to win it back.',
  base: { str: 25, agi: 12, int: 16 },
  growth: { str: 2.8, agi: 1.2, int: 1.8 },
  baseDmg: 30, atkRange: 105, atkInterval: 1.4, ms: 148,
  weapon: 'fists',
  palette: { skin: '#8aa8c4', main: '#2d3a52', trim: '#ffe9a0', glow: '#ffec8a', hair: '#dfe6ff' },
  slots: [
    [
      ab('joruun', 0, 'Assault', 'targetStun', 'thunderfist', 'Thunderfist',
        'One punch, with the sky behind it. The biggest thing in reach learns about lightning.',
        9, 26, { dmg: 105, lvl: 13, stun: 1.0, range: 230, strongest: 1 }, { c1: '#ffec8a', c2: '#2d3a52' }),
      ab('joruun', 0, 'Assault', 'projectile', 'stormhurl', 'Stormhurl',
        'Tear a boulder from the road, wrap it in lightning, and bowl it through the line.',
        8, 28, { dmg: 70, lvl: 9, speed: 460, r: 30, pierce: 0, explodeR: 110, explodeDmg: 50 }, { c1: '#ffe9a0', c2: '#5a6a8a' }),
    ],
    [
      ab('joruun', 1, 'Control', 'zone', 'staticfield', 'Static Field',
        'Ground a stormcloud. Everything inside crackles, slows, and regrets its choice of road.',
        12, 32, { r: 160, dur: 4, slow: 0.45, dps: 22, lvl: 3 }, { c1: '#ffec8a', c2: '#2d3a52' }),
      ab('joruun', 1, 'Control', 'nova', 'galeclap', 'Galeclap',
        'Clap once. The thunderhead knocks the weapons out of every hand around him.',
        11, 30, { dmg: 42, lvl: 5, r: 175, knock: 60, disarm: 2.2 }, { c1: '#dfe6ff', c2: '#8aa8c4' }),
    ],
    [
      ab('joruun', 2, 'Arcana', 'buffSelf', 'chargedhide', 'Charged Hide',
        'His skin hums with stored voltage — attackers taste it back, and his fists fall faster.',
        13, 28, { dur: 6, reflect: 0.4, asPct: 0.3 }, { c1: '#ffec8a', c2: '#8aa8c4' }),
      ab('joruun', 2, 'Arcana', 'buffSelf', 'stormheart', 'Stormheart',
        'Swallow a little of the storm he carries. It is not good for him. It is very good for him.',
        13, 24, { heal: 85, healLvl: 11, manaGain: 30, dur: 0 }, { c1: '#dfe6ff', c2: '#2d3a52' }),
    ],
  ],
  ult: ab('joruun', 3, 'Ultimate', 'barrage', 'openskywrath', 'Wrath of the Open Sky',
    'Joruun lets go of the sky he carries. For six seconds the storm picks its own fights — bolt after bolt hunting the costliest monsters anywhere in his lane.',
    85, 100, { dur: 6, count: 11, r: 600, dmg: 95, lvl: 9, smart: 1, hitR: 85, stun: 0.4 }, { c1: '#ffec8a', c2: '#2d3a52', shape: 'bolt' }),
};

// ---------------------------------------------------------------------------

export const HEROES: HeroDef[] = [baldric, gorvana, thrainn, joruun, sylri, vyrel, korrigan, maelis, morrigan, seraphine];

export const HERO_BY_ID: Record<string, HeroDef> = Object.fromEntries(HEROES.map(h => [h.id, h]));

const allAbilities: AbilityDef[] = HEROES.flatMap(h => [...h.slots.flat(), h.ult]);
export const ABILITY_BY_ID: Record<string, AbilityDef> = Object.fromEntries(allAbilities.map(a => [a.id, a]));

export const ATTR_LABEL: Record<string, string> = { str: 'Strength', agi: 'Agility', int: 'Intellect' };
export const ATTR_COLOR: Record<string, string> = { str: '#ff7a5c', agi: '#7df3a0', int: '#7db8ff' };
