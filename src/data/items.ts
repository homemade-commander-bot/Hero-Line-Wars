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
}

export type ItemProc =
  | 'chain'      // every 4th attack: chain lightning
  | 'block'      // blocks flat damage on a cooldown
  | 'revive'     // once per match: rise at half health
  | 'ignite'     // ability hits set targets burning
  | 'galedash'   // ACTIVE: dash on use
  | 'kingsguard'; // periodically a spectral knight joins you

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
