// ---------------------------------------------------------------------------
// Balance knobs. The headless sim (npm run sim) is tuned against these.
// ---------------------------------------------------------------------------

export const C = {
  // map (logical units; renderer scales)
  W: 1600,
  H: 900,
  LANES: [
    { x0: 95, x1: 565 },
    { x0: 1035, x1: 1505 },
  ],
  SPAWN_Y: 120,
  CASTLE_Y: 795,
  FOUNTAIN: 735, // y of healing fountain (next to castle)

  // economy
  START_GOLD: 275,
  START_INCOME: 30,
  INCOME_PERIOD: 30,
  GOLD_DRIP: 1.0, // passive gold per second
  BOUNTY_PCT: 0.40,
  XP_PCT: 0.8, // xp = bounty * this
  HERO_KILL_GOLD: 60, // + 12/level, paid to opposing team

  // castle
  CASTLE_HP: 3000,
  CASTLE_DPS: [0, 22, 32, 46], // by keep level (index 1..3)
  CASTLE_RANGE: 270,
  CASTLE_SHOT_PERIOD: 0.9,
  KEEP_COSTS: [0, 0, 750, 2100], // cost to REACH level (index = target level)
  KEEP_HP_BONUS: [0, 0, 1100, 1500],
  KEEP_HEAL: [0, 0, 650, 850],
  SPAWN_INTERVAL: [0, 0.85, 0.68, 0.52], // send-gate, by SENDER keep level
  QUEUE_CAP: 40, // max units waiting at the gate
  REPAIR_COST: 160,
  REPAIR_GROWTH: 1.4, // each repair costs more than the last
  REPAIR_AMOUNT: 320,
  REPAIR_CD: 45,

  // comeback mechanics
  UNDERDOG_GAP_ON: 0.25, // castle hp% deficit to trigger
  UNDERDOG_GAP_OFF: 0.10,
  UNDERDOG_INCOME: 1.25,
  UNDERDOG_DMG: 1.12,
  LASTSTAND_PCT: 0.25,
  VOLLEY_PERIOD: 5,
  VOLLEY_DMG: 45,
  VOLLEY_Y: 540, // volley hits units below this y

  // forced endgame: each Twilight stack escalates until somebody falls
  TWILIGHT_AT: 35 * 60,
  TWILIGHT_PERIOD: 60,
  TWILIGHT_INCOME: 1.3,
  TWILIGHT_INCOME_CAP: 8, // income stops compounding after this many stacks
  CASTLE_DMG_BASE: 1.8, // units always menace castles — leaks must matter
  TWILIGHT_CASTLE_DMG: 0.35, // +35% unit damage vs castles per stack
  TWILIGHT_GATE: 0.9, // spawn gate 10% faster per stack
  TWILIGHT_GATE_MIN: 0.3,

  // heroes
  MAX_LEVEL: 25,
  XP_BASE: 80,
  XP_GROW: 45,
  RESPAWN_BASE: 8,
  RESPAWN_PER_LVL: 0.45,
  FOUNTAIN_R: 130,
  FOUNTAIN_REGEN: 0.045, // % max per second
  HP_PER_STR: 21,
  REGEN_PER_STR: 0.055,
  MANA_PER_INT: 9,
  MANA_BASE: 70,
  HP_BASE: 150,
  MANA_REGEN_PER_INT: 0.05,
  AS_PER_AGI: 0.011,
  ARMOR_PER_AGI: 1 / 6,
  SP_PER_INT: 0.5,
  ARMOR_K: 0.055, // reduction = a*K/(1+a*K)
  ULT_LEVEL: 6,

  // war council training
  STAT_COST: 80,
  STAT_COST_DMG: 90,
  STAT_GROWTH: 1.18, // price multiplier per purchase
  STAT_GAIN: 4, // attribute points per purchase
  DMG_GAIN: 7,
  ARMOR_GAIN: 1.5,
  STAT_CAP: 12, // purchases per track — heroes cannot out-scale the horde forever

  // engine
  DT: 1 / 60,
  UNIT_ENGAGE_SLOW: 0.45, // units move at this fraction while fighting the hero
  UNIT_ATK_PERIOD: 1.0,
};

export type Difficulty = 'squire' | 'knight' | 'warlord';

export const DIFFICULTY: Record<Difficulty, {
  label: string; desc: string;
  thinkInterval: number; aimJitter: number; priceMult: number; ultThreshold: number;
  skipChance: number; // chance AI "hesitates" on a think tick
  retreatPct: number; // falls back to the fountain below this hp fraction
  sendMult: number; // send-budget efficiency
}> = {
  squire: { label: 'Squire', desc: 'A green recruit. Slow to react, wasteful with gold, fights past the point of sense.', thinkInterval: 1.5, aimJitter: 70, priceMult: 1.15, ultThreshold: 500, skipChance: 0.3, retreatPct: 0.17, sendMult: 0.78 },
  knight: { label: 'Knight', desc: 'A seasoned commander. Fair fight.', thinkInterval: 0.9, aimJitter: 28, priceMult: 1.0, ultThreshold: 360, skipChance: 0.08, retreatPct: 0.32, sendMult: 1.0 },
  warlord: { label: 'Warlord', desc: 'A merciless tactician. Punishes every mistake.', thinkInterval: 0.5, aimJitter: 8, priceMult: 1.0, ultThreshold: 280, skipChance: 0, retreatPct: 0.26, sendMult: 1.06 },
};

export function laneOf(team: number) {
  return C.LANES[team];
}
export function laneCenterX(team: number) {
  const L = C.LANES[team];
  return (L.x0 + L.x1) / 2;
}
export function castlePos(team: number) {
  return { x: laneCenterX(team), y: C.CASTLE_Y + 30 };
}
export function fountainPos(team: number) {
  const L = C.LANES[team];
  // fountain sits at the lane's outer edge near the castle
  return { x: team === 0 ? L.x0 + 55 : L.x1 - 55, y: C.FOUNTAIN };
}
export function xpNeed(level: number) {
  return C.XP_BASE + C.XP_GROW * (level - 1);
}
export function armorReduction(armor: number) {
  const k = armor * C.ARMOR_K;
  return k / (1 + k);
}
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
