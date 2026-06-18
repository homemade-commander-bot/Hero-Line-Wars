// ---------------------------------------------------------------------------
// The Barracks — monsters you pay to march on the enemy's castle.
// Sending a unit PERMANENTLY raises your income. Tiers unlock with your Keep.
// Synergies are real: priests heal, banners embolden, necrothurges recycle.
// ---------------------------------------------------------------------------

import type { UnitDef } from '../types';

export const UNITS: UnitDef[] = [
  // ------------------------------------------------------------- Tier 1
  {
    id: 'goblin', name: 'Goblin Cutpurse', tier: 1, cost: 15, income: 1.8,
    hp: 78, dmg: 6, speed: 88, range: 30,
    special: 'cutpurse', trait: 'Fast. Hits on the castle also steal 2 gold.',
    pal: { a: '#6fae4e', b: '#3c5d2a', c: '#e3b341' },
  },
  {
    id: 'skeleton', name: 'Skeleton Footman', tier: 1, cost: 22, income: 2.7,
    hp: 130, dmg: 9, speed: 60, range: 30,
    trait: 'Cheap, tireless, replaceable. The backbone of every horde.',
    pal: { a: '#e8e4d8', b: '#9a948a', c: '#4a4440' },
  },
  {
    id: 'wolf', name: 'Briarfang Wolf', tier: 1, cost: 38, income: 4.8,
    hp: 178, dmg: 13, speed: 95, range: 32,
    special: 'pack', trait: 'Pack hunter: +3 damage per nearby wolf (max +15).',
    pal: { a: '#7a6a58', b: '#4a3f33', c: '#c9484e' },
  },
  {
    id: 'imp', name: 'Imp Saboteur', tier: 1, cost: 50, income: 6.5,
    hp: 96, dmg: 7, speed: 72, range: 28,
    special: 'explode', trait: 'Detonates on death: 90 damage to the enemy hero and summons nearby.',
    pal: { a: '#d14f3a', b: '#7a2820', c: '#ffb347' },
  },
  // ------------------------------------------------------------- Tier 2
  {
    id: 'ogre', name: 'Ogre Mauler', tier: 2, cost: 120, income: 16,
    hp: 1000, dmg: 30, speed: 48, range: 44,
    trait: 'A walking wall of meat. Soaks hero damage while the line advances.',
    pal: { a: '#9a8255', b: '#5d4d33', c: '#6fae4e' },
  },
  {
    id: 'priest', name: 'Grave Priest', tier: 2, cost: 150, income: 20,
    hp: 380, dmg: 12, speed: 55, range: 230,
    special: 'healer', trait: 'Mends the most wounded ally nearby (26 hp/s). Kill it first.',
    pal: { a: '#cfc4e8', b: '#5d5470', c: '#9fe8b0' },
  },
  {
    id: 'banner', name: 'Banner Wraith', tier: 2, cost: 170, income: 23,
    hp: 420, dmg: 10, speed: 55, range: 36,
    special: 'banner', trait: 'War-standard of the dead: nearby allies +20% damage, +15% speed.',
    pal: { a: '#6a7a9a', b: '#2d3a52', c: '#c9484e' },
  },
  {
    id: 'revenant', name: 'Frost Revenant', tier: 2, cost: 180, income: 25,
    hp: 520, dmg: 18, speed: 52, range: 40,
    special: 'chill', trait: 'Aura of grave-cold: the enemy hero attacks and moves 25% slower near it.',
    pal: { a: '#a8d8e8', b: '#4a7a9a', c: '#dff6ff' },
  },
  {
    id: 'harpy', name: 'Harpy Skyrender', tier: 2, cost: 160, income: 22,
    hp: 360, dmg: 20, speed: 75, range: 250,
    flying: true, special: 'harass', trait: 'Flies (35% of attacks miss her). Claws at the hero from above while marching.',
    pal: { a: '#b58ad1', b: '#5d3a70', c: '#e8cba8' },
  },
  // ------------------------------------------------------------- Tier 3
  {
    id: 'golem', name: 'Stone Golem', tier: 3, cost: 400, income: 58,
    hp: 2600, dmg: 34, speed: 40, range: 48,
    spellResist: 0.55, trait: 'Living granite: ignores 55% of spell damage. A mage\'s nightmare.',
    pal: { a: '#8a8a92', b: '#55555d', c: '#6de0e8' },
  },
  {
    id: 'necro', name: 'Necrothurge', tier: 3, cost: 450, income: 66,
    hp: 700, dmg: 16, speed: 50, range: 250,
    special: 'necro', trait: 'Raises a Skeleton Footman from each nearby allied death (max 8).',
    pal: { a: '#3d3d52', b: '#1f1f30', c: '#7dff8a' },
  },
  {
    id: 'siege', name: 'Siege Juggernaut', tier: 3, cost: 550, income: 81,
    hp: 1700, dmg: 26, speed: 42, range: 52,
    special: 'siege', trait: 'Engine of ruin: deals 3.5× damage to castles.',
    pal: { a: '#7a5d3a', b: '#4a3823', c: '#ff7733' },
  },
  {
    id: 'wyvern', name: 'Elder Wyvern', tier: 3, cost: 500, income: 74,
    hp: 1400, dmg: 30, speed: 60, range: 60,
    flying: true, special: 'wyvern', trait: 'Flies. Spits acid in an arc at the hero and summons every few seconds.',
    pal: { a: '#4e8a5d', b: '#2a4d33', c: '#c5ff7d' },
  },
  // ----------------------------------------------------------- Legendary
  {
    id: 'avatar', name: 'Avatar of Ruin', tier: 3, legendary: true, cost: 1200, income: 185,
    hp: 5200, dmg: 90, speed: 38, range: 70,
    spellResist: 0.28, special: 'avatar',
    trait: 'A god of endings. Earth-shattering slams; at half health it roars the hero into flight.',
    pal: { a: '#2b2030', b: '#13101a', c: '#ff4d4d' },
  },
];

// ----------------------------------------------------------- Wildlife
// Neutral creeps that wander the lanes during lulls. Farm them for gold.
export const WILDLIFE: UnitDef[] = [
  {
    id: 'gloomrat', name: 'Gloomrat', tier: 1, neutral: true, cost: 0, income: 0, bounty: 14,
    hp: 70, dmg: 0, speed: 70, range: 0,
    trait: 'Scurries the lane. Easy gold for an idle blade.',
    pal: { a: '#6a5a44', b: '#3a3024', c: '#c9484e' },
  },
  {
    id: 'wisp', name: 'Vale Wisp', tier: 1, neutral: true, cost: 0, income: 0, bounty: 22,
    hp: 50, dmg: 0, speed: 95, range: 0,
    trait: 'A drifting mote of old magic. Worth more, harder to pin.',
    pal: { a: '#9fe8d0', b: '#4a7a6a', c: '#dffff4' },
  },
  {
    id: 'tuskboar', name: 'Tusk Boar', tier: 1, neutral: true, cost: 0, income: 0, bounty: 38,
    hp: 230, dmg: 0, speed: 52, range: 0,
    trait: 'Stout and stubborn. A meaty payday if you can drop it.',
    pal: { a: '#7a5d44', b: '#4a3829', c: '#e8d8b0' },
  },
];

// ----------------------------------------------------------- The Siege
// A neutral world-boss. Never sold in the barracks — the engine spawns it,
// scales its health to the clock, and pays a fat bounty to whoever fells it.
export const BOSSES: UnitDef[] = [
  {
    id: 'titan', name: 'Korghul, the Wall-Eater', tier: 3, legendary: true, neutral: true,
    cost: 2400, income: 0, bounty: 220, // cost is only the AI's "how badly do I want this dead" weight
    hp: 2600, dmg: 46, speed: 34, range: 72,
    spellResist: 0.3, special: 'boss',
    trait: 'A mountain that walks. Drawn to the mightiest keep; slams the earth, roars the bold into flight, and eats walls.',
    pal: { a: '#3a2b3a', b: '#140e16', c: '#ff7b2e' },
  },
];

export const UNIT_BY_ID: Record<string, UnitDef> =
  Object.fromEntries([...UNITS, ...WILDLIFE, ...BOSSES].map(u => [u.id, u]));

export function bounty(def: UnitDef, raised: boolean): number {
  if (def.neutral) return def.bounty ?? 10;
  return raised ? 5 : Math.ceil(def.cost * 0.45);
}

/** Send hotkeys — every barracks unit has a key (number row, then T Y U I for tier 3). */
export const UNIT_HOTKEY: Record<string, string> = {
  goblin: '1', skeleton: '2', wolf: '3', imp: '4',
  ogre: '5', priest: '6', banner: '7', revenant: '8', harpy: '9',
  golem: '0', necro: 't', siege: 'y', wyvern: 'u', avatar: 'i',
};
export const HOTKEY_UNIT: Record<string, string> =
  Object.fromEntries(Object.entries(UNIT_HOTKEY).map(([u, k]) => [k, u]));
