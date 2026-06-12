// ---------------------------------------------------------------------------
// Hero Line Wars — shared type definitions (no imports; everything depends on this)
// ---------------------------------------------------------------------------

export type TeamId = 0 | 1;
export type Attr = 'str' | 'agi' | 'int';

export interface Vec {
  x: number;
  y: number;
}

// ----------------------------------------------------------------- abilities

export type AbilityKind =
  | 'coneSlash'   // melee arc toward aim point
  | 'targetStun'  // strike a single (strongest/nearest) enemy: damage + stun
  | 'nova'        // radial burst around the hero (knockback / fear / lift options)
  | 'zone'        // ground effect at aim point (dot / slow / root / pull / confuse / delayed burst)
  | 'leapSlam'    // dash to point; AoE on impact or damage along the line
  | 'projectile'  // line projectile(s); pierce / explode / boomerang / drag options
  | 'buffSelf'    // self buff: stats, shield, heal, auras, echo
  | 'summon'      // allied creatures that defend the hero's lane
  | 'dash'        // blink / dash, optional decoy left behind
  | 'wall'        // flat zone perpendicular to the lane: heavy slow + chip damage
  | 'beam'        // ULT: channeled wave sweeping the whole lane
  | 'transform'   // ULT: temporary self-transformation
  | 'barrage'     // ULT: timed random impacts over a large area
  | 'mobileZone'; // ULT: roaming zone that drifts toward the aim point

export type AbilityCat = 'Assault' | 'Control' | 'Arcana' | 'Ultimate';

export interface AbilityTheme {
  c1: string; // primary glow color
  c2: string; // secondary color
  shape?: string; // visual/summon hint: 'owl' | 'snapper' | 'decoy' | 'slash' | ...
}

export interface AbilityDef {
  id: string;
  name: string;
  hero: string; // hero id — every ability belongs to exactly one hero
  cat: AbilityCat;
  slot: 0 | 1 | 2 | 3; // 3 = ultimate
  kind: AbilityKind;
  desc: string;
  cd: number;
  mana: number;
  p: Record<string, number>; // numeric parameters, by convention per kind
  theme: AbilityTheme;
}

// --------------------------------------------------------------------- heroes

export interface HeroPalette {
  skin: string;
  main: string; // armor / robe
  trim: string; // accents
  glow: string; // magic color
  hair: string;
}

export interface HeroDef {
  id: string;
  name: string;
  epithet: string;
  attr: Attr;
  blurb: string;
  base: { str: number; agi: number; int: number };
  growth: { str: number; agi: number; int: number }; // per level
  baseDmg: number; // + primary attribute = attack damage
  atkRange: number;
  atkInterval: number; // seconds per swing before attack speed
  ms: number; // move speed px/s
  weapon: 'sword' | 'axes' | 'bow' | 'blades' | 'orb' | 'staff';
  palette: HeroPalette;
  slots: [AbilityDef[], AbilityDef[], AbilityDef[]]; // 2 choices per slot
  ult: AbilityDef;
}

export interface Buff {
  id: string;
  until: number;
  // additive percentages stored as fractions (0.25 = +25%)
  dmgPct?: number;
  asPct?: number;
  msPct?: number;
  armor?: number;
  spellAmp?: number;
  dodge?: number;
  lifesteal?: number;
  reflect?: number; // fraction of damage returned to attacking units
  shield?: number; // remaining absorb pool (mutated)
  hot?: number; // heal per second
  dot?: number; // damage per second (magic, ignores armor)
  stun?: boolean;
  fear?: boolean; // forced retreat toward own fountain
  echoSpell?: boolean; // next non-ult spell casts twice
  cleaveArc?: number; // attacks hit all units in arc (radians), e.g. colossus
  scale?: number; // visual size multiplier
  blinkStrike?: boolean; // attacks teleport hero to target
  auraDps?: number; // burn aura around hero
  auraR?: number;
  drainDps?: number; // life drain aura (heals hero)
  drainR?: number;
  theme?: string; // render hint
}

export interface ItemState {
  defId: string;
  readyAt: number; // for actives / proc cooldowns
  counter: number; // for "every Nth hit" procs
  used: boolean;   // for one-time effects (phoenix revive)
}

export interface HeroState {
  defId: string;
  team: TeamId;
  pos: Vec;
  facing: number; // -1 left, 1 right (visual)
  level: number;
  xp: number;
  hp: number;
  mana: number;
  bonus: { str: number; agi: number; int: number; dmg: number; armor: number }; // from War Council training
  items: (ItemState | null)[];
  loadout: string[]; // 4 ability ids: slots 0,1,2 + ult
  cds: number[]; // ready-at times, len 4
  buffs: Buff[];
  dead: boolean;
  respawnAt: number;
  attackReadyAt: number;
  attackAnimT: number; // for render lunge
  channel: { ability: string; until: number; startY: number } | null;
  // computed each step (derived stats cache)
  d: HeroDerived;
  // proc bookkeeping
  blockReadyAt: number;
  kills: number;
}

export interface HeroDerived {
  str: number;
  agi: number;
  int: number;
  maxHp: number;
  maxMana: number;
  hpRegen: number;
  manaRegen: number;
  dmg: number;
  atkInterval: number;
  armor: number;
  sp: number; // spell power
  spellAmp: number; // final multiplier on ability damage
  ms: number;
  range: number;
  dodge: number;
  lifesteal: number;
  cdr: number;
  scale: number;
}

// ---------------------------------------------------------------------- units

export type UnitSpecial =
  | 'cutpurse' // castle hits also steal gold
  | 'pack'     // +dmg per nearby wolf
  | 'explode'  // detonates on death (hits hero + summons)
  | 'healer'   // heals lowest-hp allied unit
  | 'banner'   // aura: nearby allies +dmg +speed
  | 'chill'    // aura: slows hero attack/move
  | 'harass'   // shoots the hero at range while marching
  | 'necro'    // raises skeletons from nearby allied deaths
  | 'siege'    // multiplied damage vs castle
  | 'wyvern'   // AoE acid spit at hero/summons
  | 'avatar';  // boss: AoE slam + fear roar

export interface UnitDef {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  legendary?: boolean;
  cost: number;
  income: number;
  hp: number;
  dmg: number;
  speed: number;
  range: number; // attack range (vs hero/summons/castle)
  flying?: boolean; // 35% of hero attacks miss; immune to walls' chip
  spellResist?: number; // fraction of magic damage ignored
  special?: UnitSpecial;
  trait: string; // one-line description for cards
  pal: { a: string; b: string; c: string }; // sprite palette
}

export interface UnitState {
  id: number;
  defId: string;
  lane: TeamId; // lane it marches in == team that must defend it
  owner: TeamId; // sender
  pos: Vec;
  hp: number;
  maxHp: number;
  slowUntil: number;
  slowPct: number;
  ccUntil: number; // stun / root / airborne
  airborneUntil: number;
  fearUntil: number;
  confuseUntil: number;
  dots: { dps: number; until: number }[];
  dmgBuffPct: number; // from banner aura (recomputed)
  spdBuffPct: number;
  attackReadyAt: number;
  specialReadyAt: number; // healer / wyvern / avatar timers
  raisedCount: number; // necro
  raised: boolean; // is a raised skeleton (reduced bounty)
  roared: boolean; // avatar one-time fear
  state: 'march' | 'castle';
  bob: number; // render phase
}

// -------------------------------------------------------------------- summons

export type SummonKind = 'owl' | 'knight' | 'snapper' | 'decoy';

export interface SummonState {
  id: number;
  kind: SummonKind;
  owner: TeamId; // defends owner's lane
  pos: Vec;
  hp: number;
  maxHp: number;
  dmg: number;
  range: number;
  speed: number; // 0 = static
  until: number;
  attackReadyAt: number;
  theme: AbilityTheme;
}

// ---------------------------------------------------------------- projectiles

export interface Projectile {
  id: number;
  owner: TeamId; // hero's team; hits units marching in that team's lane
  pos: Vec;
  vel: Vec;
  r: number; // hit radius
  dmg: number;
  kind: 'phys' | 'magic';
  pierce: boolean;
  explodeR: number;
  explodeDmg: number;
  dragX: number; // pull hit units this many px toward hero x (briarlash)
  slowPct: number;
  slowDur: number;
  hitIds: number[];
  boomerang: 0 | 1 | 2; // 0 no, 1 outbound, 2 returning
  origin: Vec;
  maxDist: number;
  targetUnit: number; // homing autoattack arrows: unit id or -1
  theme: AbilityTheme;
  ignite: number; // dps applied as dot on hit (skyfire)
}

// ---------------------------------------------------------------------- zones

export type ZoneKind =
  | 'burn' | 'gravity' | 'root' | 'pollen' | 'banner' | 'spore'
  | 'collapse' | 'wall' | 'tempest' | 'blackhole' | 'starfall' | 'beamfire';

export interface Zone {
  id: number;
  kind: ZoneKind;
  owner: TeamId; // affects units in owner's lane
  pos: Vec;
  r: number;
  until: number;
  nextTick: number;
  p: Record<string, number>;
  theme: AbilityTheme;
  born: number;
  applied?: boolean; // one-shot zones (root, pollen)
}

// --------------------------------------------------------------------- events

export type GameEvent =
  | { t: 'dmg'; pos: Vec; amount: number; kind: 'phys' | 'magic'; target: 'unit' | 'hero' | 'castle' | 'summon'; team: TeamId }
  | { t: 'death'; pos: Vec; defId: string; tier: number; lane: TeamId }
  | { t: 'cast'; team: TeamId; abId: string; pos: Vec; aim: Vec; ult: boolean }
  | { t: 'impact'; pos: Vec; r: number; theme: AbilityTheme; kind: string }
  | { t: 'send'; team: TeamId; defId: string }
  | { t: 'spawn'; pos: Vec; lane: TeamId; defId: string }
  | { t: 'income'; team: TeamId; amount: number }
  | { t: 'gold'; team: TeamId; amount: number; pos?: Vec }
  | { t: 'levelup'; team: TeamId; level: number; pos: Vec }
  | { t: 'forge'; team: TeamId; itemId: string }
  | { t: 'buy'; team: TeamId; itemId: string }
  | { t: 'castleHit'; team: TeamId; amount: number }
  | { t: 'castleShot'; team: TeamId; from: Vec; to: Vec }
  | { t: 'volley'; team: TeamId }
  | { t: 'repair'; team: TeamId }
  | { t: 'upgrade'; team: TeamId; level: number }
  | { t: 'heroDeath'; team: TeamId; pos: Vec }
  | { t: 'heroSpawn'; team: TeamId; pos: Vec }
  | { t: 'underdog'; team: TeamId; on: boolean }
  | { t: 'twilight'; level: number }
  | { t: 'deny'; team: TeamId; msg: string }
  | { t: 'proc'; pos: Vec; itemId: string; targets?: Vec[] }
  | { t: 'win'; team: TeamId };

// ---------------------------------------------------------------------- input

export interface TeamInput {
  move: Vec; // -1..1 each axis
  aim: Vec; // map coords
  cast: boolean[]; // len 4, edge-triggered (consumed by engine)
  useItem: boolean[]; // len 6
}

// ----------------------------------------------------------------------- team

export interface TeamStats {
  kills: number;
  sent: number;
  goldEarned: number;
  dmgToCastle: number;
  incomeGained: number;
  leaks: number; // units that reached own castle
  peakIncome: number;
}

export interface AiState {
  nextThinkAt: number;
  strategy: string;
  strategyUntil: number;
  thinkInterval: number;
  aimJitter: number;
  priceMult: number; // self-handicap for easy AI
  ultThreshold: number; // gold value of wave required to ult
  burstSaving: boolean;
  lastBuyAt: number;
  buildIndex: number; // pointer into the item build order
  retreatPct: number; // hp fraction at which the AI hero falls back
  sendMult: number; // send-budget efficiency
}

export interface TeamState {
  id: TeamId;
  name: string;
  gold: number;
  income: number;
  baseLevel: 1 | 2 | 3;
  castleHp: number;
  castleMaxHp: number;
  castleShotAt: number;
  volleyAt: number;
  repairReadyAt: number;
  repairCount: number;
  sendQueue: string[];
  nextSpawnAt: number;
  statUp: { str: number; agi: number; int: number; dmg: number; armor: number };
  underdog: boolean;
  lastStand: boolean;
  hero: HeroState;
  input: TeamInput;
  ai: AiState | null;
  stats: TeamStats;
}

// ----------------------------------------------------------------------- game

export interface GameState {
  t: number;
  over: boolean;
  winner: TeamId | -1;
  teams: [TeamState, TeamState];
  units: UnitState[];
  projectiles: Projectile[];
  zones: Zone[];
  summons: SummonState[];
  nextIncomeAt: number;
  twilightLevel: number;
  nextTwilightAt: number;
  events: GameEvent[];
  nextId: number;
  rng: () => number;
  // discovered forged items this match (for the riddle book), per team
  discovered: [string[], string[]];
}
