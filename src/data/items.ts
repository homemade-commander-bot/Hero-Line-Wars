// ---------------------------------------------------------------------------
// The Forge — eight honest tools, and six things the forgemaster won't
// explain. Hold the right pieces and the forge does the rest, unbidden.
// Recipes are never listed outright; the riddle book hints at them.
// ---------------------------------------------------------------------------

export interface ItemStats {
  dmg?: number;
  armor?: number;
  hp?: number;
  as?: number; // attack speed, fraction
  ms?: number; // move speed, fraction
  sp?: number; // spell power
  regen?: number; // hp/s
  manaRegen?: number;
  cdr?: number; // cooldown reduction, fraction
  lifesteal?: number; // fraction of attack damage returned as health
}

export type ItemProc =
  | 'chain'      // every 4th attack: chain lightning
  | 'block'      // blocks flat damage on a cooldown
  | 'revive'     // once per match: rise at half health
  | 'ignite'     // ability hits set targets burning
  | 'galedash'   // ACTIVE: dash on use
  | 'kingsguard' // periodically a spectral knight joins you
  | 'cleave'     // melee attacks splash to nearby monsters
  | 'manaleech'  // kills restore mana
  | 'chillguard'; // melee attackers are slowed

export interface ItemDef {
  id: string;
  name: string;
  cost: number; // basics: gold cost. forged: 0 (made, not bought)
  tier: 'basic' | 'forged';
  stats: ItemStats;
  proc?: ItemProc;
  procText?: string;
  components?: string[]; // item ids (may include forged items)
  riddle?: string; // shown in the Forgemaster's riddle book
  desc: string;
  theme: { c1: string; c2: string; glyph: string };
}

export const ITEMS: ItemDef[] = [
  // ------------------------------------------------------------- basics
  {
    id: 'whetstone', name: 'Whetstone Blade', cost: 150, tier: 'basic',
    stats: { dmg: 12 }, desc: 'A soldier\'s sword, kept honest. +12 damage.',
    theme: { c1: '#c9d4ee', c2: '#7a8aa8', glyph: 'sword' },
  },
  {
    id: 'ironbark', name: 'Ironbark Shield', cost: 150, tier: 'basic',
    stats: { armor: 4 }, desc: 'Cut from a tree that refused to fall. +4 armor.',
    theme: { c1: '#9a7d4e', c2: '#5d4a2a', glyph: 'shield' },
  },
  {
    id: 'boots', name: 'Swiftsilver Boots', cost: 200, tier: 'basic',
    stats: { ms: 0.14 }, desc: 'Quenched in quicksilver. +14% move speed.',
    theme: { c1: '#bfd0d8', c2: '#6a8a96', glyph: 'boot' },
  },
  {
    id: 'gauntlets', name: 'Falcon Gauntlets', cost: 175, tier: 'basic',
    stats: { as: 0.2 }, desc: 'Feather-light, falcon-fast. +20% attack speed.',
    theme: { c1: '#e3b341', c2: '#9a7820', glyph: 'fist' },
  },
  {
    id: 'orb', name: 'Emberglass Orb', cost: 200, tier: 'basic',
    stats: { sp: 20 }, desc: 'A coal that never went out, blown into glass. +20 spell power.',
    theme: { c1: '#ff7733', c2: '#7a2820', glyph: 'orb' },
  },
  {
    id: 'vial', name: 'Moonwell Vial', cost: 150, tier: 'basic',
    stats: { regen: 2.2, manaRegen: 1.2 }, desc: 'Water that remembers the moon. +2.2 hp/s, +1.2 mana/s.',
    theme: { a: '', c1: '#a8d8e8', c2: '#4a7a9a', glyph: 'vial' } as any,
  },
  {
    id: 'girdle', name: "Giant's Girdle", cost: 300, tier: 'basic',
    stats: { hp: 220 }, desc: 'Sized for someone who lost it badly. +220 health.',
    theme: { c1: '#c9484e', c2: '#5d2a2a', glyph: 'belt' },
  },
  {
    id: 'focus', name: 'Runed Focus', cost: 350, tier: 'basic',
    stats: { cdr: 0.12, manaRegen: 0.8 }, desc: 'Carved with patient runes. +12% cooldown reduction, +0.8 mana/s.',
    theme: { c1: '#9d6df0', c2: '#4a3f6e', glyph: 'rune' },
  },
  {
    id: 'longblade', name: "Knight's Longblade", cost: 320, tier: 'basic',
    stats: { dmg: 22 }, desc: 'Four feet of disagreement. +22 damage.',
    theme: { c1: '#dfe6ff', c2: '#5a6a8a', glyph: 'sword' },
  },
  {
    id: 'tome', name: 'Tome of the Magus', cost: 380, tier: 'basic',
    stats: { sp: 32 }, desc: 'Heavier every time you learn what\'s in it. +32 spell power.',
    theme: { c1: '#9d6df0', c2: '#2d2150', glyph: 'book' },
  },
  {
    id: 'plate', name: 'Dwarven Warplate', cost: 350, tier: 'basic',
    stats: { armor: 7 }, desc: 'Forged under a mountain, for people built like one. +7 armor.',
    theme: { c1: '#bfc8d8', c2: '#5a5a6e', glyph: 'shield' },
  },
  {
    id: 'charm', name: 'Wyrmscale Charm', cost: 250, tier: 'basic',
    stats: { hp: 150, manaRegen: 0.8 }, desc: 'One scale, still warm. +150 health, +0.8 mana/s.',
    theme: { c1: '#4e8a5d', c2: '#2a4d33', glyph: 'orb' },
  },
  // ------------------------------------------------------------- forged
  {
    id: 'stormfang', name: 'Stormfang', cost: 0, tier: 'forged',
    components: ['whetstone', 'gauntlets'],
    stats: { dmg: 22, as: 0.28 },
    proc: 'chain', procText: 'Every 4th attack: lightning leaps to 3 extra monsters.',
    riddle: 'Sharpen the falcon\'s talons, and the sky itself will bite.',
    desc: 'A blade that hums before thunder does.',
    theme: { c1: '#7db8ff', c2: '#e3b341', glyph: 'bolt' },
  },
  {
    id: 'aegissun', name: 'Bulwark of the Fallen Sun', cost: 0, tier: 'forged',
    components: ['ironbark', 'girdle'],
    stats: { armor: 7, hp: 330 },
    proc: 'block', procText: 'Every 6s: fully blocks 50 damage from one hit.',
    riddle: 'An oak heart beating in a giant\'s chest fears no dawn.',
    desc: 'The last shield raised at the Battle of Dusk. It held.',
    theme: { c1: '#ffd86b', c2: '#9a7d4e', glyph: 'sunshield' },
  },
  {
    id: 'phoenix', name: 'Phoenix Diadem', cost: 0, tier: 'forged',
    components: ['orb', 'vial'],
    stats: { sp: 32, regen: 3 },
    proc: 'revive', procText: 'Once per battle: death becomes fire, and you rise at half health.',
    riddle: 'Drown an ember in the moon\'s own well; it remembers the sun.',
    desc: 'Warm to the touch. Warmer when you die.',
    theme: { c1: '#ffb347', c2: '#ff5e2b', glyph: 'phoenix' },
  },
  {
    id: 'skyfire', name: 'Skyfire Grimoire', cost: 0, tier: 'forged',
    components: ['orb', 'focus'],
    stats: { sp: 38, cdr: 0.15 },
    proc: 'ignite', procText: 'Your abilities set monsters burning (12/s for 3s).',
    riddle: 'Bind patient runes to restless glass, and your words become wildfire.',
    desc: 'The pages turn themselves toward whatever you hate.',
    theme: { c1: '#ff5e2b', c2: '#9d6df0', glyph: 'book' },
  },
  {
    id: 'windriders', name: 'Windrider Sabatons', cost: 0, tier: 'forged',
    components: ['boots', 'gauntlets'],
    stats: { ms: 0.2, as: 0.24 },
    proc: 'galedash', procText: 'ACTIVE: ride the gale — dash 260px toward your aim (18s).',
    riddle: 'Teach your heels what the falcon knows.',
    desc: 'They never quite touch the ground.',
    theme: { c1: '#7df3df', c2: '#bfd0d8', glyph: 'wingboot' },
  },
  {
    id: 'bloodthorn', name: 'Bloodthorn Blade', cost: 0, tier: 'forged',
    components: ['whetstone', 'vial'],
    stats: { dmg: 16, regen: 2, lifesteal: 0.12 },
    riddle: 'Water a blade like a rose, and it learns to drink.',
    desc: 'The thorns point inward. That\'s where the blood is.',
    theme: { c1: '#c9484e', c2: '#5d2a2a', glyph: 'sword' },
  },
  {
    id: 'dragonmaw', name: 'Dragonmaw Cleaver', cost: 0, tier: 'forged',
    components: ['longblade', 'girdle'],
    stats: { dmg: 26, hp: 220 },
    proc: 'cleave', procText: 'Melee attacks bite a 35% arc into everything beside your target.',
    riddle: 'Feed a long blade a giant\'s appetite, and it will bite whole ranks.',
    desc: 'It is always slightly open.',
    theme: { c1: '#ff7733', c2: '#5d2a2a', glyph: 'sword' },
  },
  {
    id: 'folio', name: "Archmage's Folio", cost: 0, tier: 'forged',
    components: ['tome', 'focus'],
    stats: { sp: 36, cdr: 0.15 },
    proc: 'manaleech', procText: 'Every monster you kill is worth 6 mana. Every death, a footnote.',
    riddle: 'Bind patient runes into a hungry book, and every death becomes a footnote.',
    desc: 'The margins write themselves.',
    theme: { c1: '#c5a8ff', c2: '#2d2150', glyph: 'book' },
  },
  {
    id: 'wyrmguard', name: 'Wyrmguard Plate', cost: 0, tier: 'forged',
    components: ['plate', 'charm'],
    stats: { armor: 8, hp: 200 },
    proc: 'chillguard', procText: 'Melee attackers are frostbitten: 25% slower for 1.5s.',
    riddle: 'Scale over steel — the cold remembers who struck it.',
    desc: 'Frost creeps from the joints when it\'s angry.',
    theme: { c1: '#a8d8e8', c2: '#2a4d33', glyph: 'sunshield' },
  },
  {
    id: 'kingscrown', name: 'Crown of the Shattered King', cost: 0, tier: 'forged',
    components: ['aegissun', 'focus'],
    stats: { armor: 6, hp: 280, cdr: 0.12, manaRegen: 1 },
    proc: 'kingsguard', procText: 'Every 20s, a spectral kingsguard rises to defend you for 8s.',
    riddle: 'Three oaths — oak, rune, and giant\'s blood — crown the dead king anew.',
    desc: 'It fits anyone willing to be followed by ghosts.',
    theme: { c1: '#e3b341', c2: '#6a7a9a', glyph: 'crown' },
  },
];

export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map(i => [i.id, i]));
export const BASIC_ITEMS = ITEMS.filter(i => i.tier === 'basic');
export const FORGED_ITEMS = ITEMS.filter(i => i.tier === 'forged');

/** Total gold sunk into an item (for AI valuation): basics = cost, forged = sum of parts. */
export function itemWorth(id: string): number {
  const d = ITEM_BY_ID[id];
  if (!d) return 0;
  if (d.tier === 'basic') return d.cost;
  return (d.components ?? []).reduce((s, c) => s + itemWorth(c), 0);
}
