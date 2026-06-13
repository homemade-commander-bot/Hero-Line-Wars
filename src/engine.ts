// ---------------------------------------------------------------------------
// Pure simulation engine. No DOM, no audio, no canvas — main.ts (browser)
// and sim.ts (node, balance testing) both drive this through step().
// Player and AI act through the same TeamInput; the engine cheats for no one.
// ---------------------------------------------------------------------------

import type {
  AbilityDef, Buff, GameEvent, GameState, HeroDerived, HeroState, ItemState,
  Projectile, SummonState, TeamId, TeamState, UnitState, Vec, Zone, ZoneKind,
} from './types';
import { C, DIFFICULTY, armorReduction, castlePos, fountainPos, laneCenterX, laneOf, mulberry32, xpNeed } from './data/constants';
import { ABILITY_BY_ID, HERO_BY_ID, HEROES } from './data/heroes';
import { UNIT_BY_ID, bounty } from './data/units';
import { BASIC_ITEMS, FORGED_ITEMS, ITEM_BY_ID } from './data/items';

// ------------------------------------------------------------------ helpers

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function heroDef(h: HeroState) {
  return HERO_BY_ID[h.defId];
}
export function abilityOf(h: HeroState, slot: number): AbilityDef {
  return ABILITY_BY_ID[h.loadout[slot]];
}

function clampToLane(team: TeamId, p: Vec, margin = 18): Vec {
  const L = laneOf(team);
  return {
    x: clamp(p.x, L.x0 + margin, L.x1 - margin),
    y: clamp(p.y, C.SPAWN_Y - 10, C.CASTLE_Y + 55),
  };
}

// ------------------------------------------------------------- game creation

export interface NewGameOpts {
  heroIds: [string, string];
  loadouts: [string[], string[]]; // 3 ability ids each (slots 0..2)
  ai: [boolean, boolean];
  difficulty: import('./data/constants').Difficulty | [import('./data/constants').Difficulty, import('./data/constants').Difficulty];
  seed?: number;
}

export function randomLoadout(heroId: string, rng: () => number): string[] {
  const def = HERO_BY_ID[heroId];
  return def.slots.map(opts => opts[Math.floor(rng() * opts.length)].id);
}

function newHero(team: TeamId, heroId: string, loadout: string[]): HeroState {
  const def = HERO_BY_ID[heroId];
  const fp = fountainPos(team);
  const h: HeroState = {
    defId: heroId,
    team,
    pos: { x: fp.x, y: fp.y - 60 },
    facing: team === 0 ? 1 : -1,
    level: 1,
    xp: 0,
    hp: 1,
    mana: 1,
    bonus: { str: 0, agi: 0, int: 0, dmg: 0, armor: 0 },
    items: [null, null, null, null, null, null],
    loadout: [...loadout, def.ult.id],
    cds: [0, 0, 0, 0],
    buffs: [],
    dead: false,
    respawnAt: 0,
    attackReadyAt: 0,
    attackAnimT: 0,
    channel: null,
    d: null as unknown as HeroDerived,
    blockReadyAt: 0,
    kills: 0,
  };
  h.d = computeDerived(h, false);
  h.hp = h.d.maxHp;
  h.mana = h.d.maxMana;
  return h;
}

function newTeam(id: TeamId, heroId: string, loadout: string[], isAi: boolean, diff: import('./data/constants').Difficulty): TeamState {
  const d = DIFFICULTY[diff];
  return {
    id,
    name: id === 0 ? 'Dawnhold' : 'Duskreach',
    gold: C.START_GOLD,
    income: C.START_INCOME,
    baseLevel: 1,
    castleHp: C.CASTLE_HP,
    castleMaxHp: C.CASTLE_HP,
    castleShotAt: 0,
    volleyAt: 0,
    repairReadyAt: 0,
    repairCount: 0,
    sendQueue: [],
    nextSpawnAt: 0,
    statUp: { str: 0, agi: 0, int: 0, dmg: 0, armor: 0 },
    underdog: false,
    lastStand: false,
    hero: newHero(id, heroId, loadout),
    input: { move: { x: 0, y: 0 }, moveTo: null, aim: { x: laneCenterX(id), y: 450 }, cast: [false, false, false, false], useItem: [false, false, false, false, false, false] },
    ai: isAi ? {
      nextThinkAt: 1 + id * 0.3,
      strategy: 'swarm',
      strategyUntil: 60,
      thinkInterval: d.thinkInterval,
      aimJitter: d.aimJitter,
      priceMult: d.priceMult,
      ultThreshold: d.ultThreshold,
      burstSaving: false,
      lastBuyAt: 0,
      buildIndex: 0,
      retreatPct: d.retreatPct,
      sendMult: d.sendMult,
    } : null,
    stats: { kills: 0, sent: 0, goldEarned: 0, dmgToCastle: 0, incomeGained: 0, leaks: 0, peakIncome: C.START_INCOME },
  };
}

export function newGame(opts: NewGameOpts): GameState {
  const rng = mulberry32(opts.seed ?? ((Math.random() * 2 ** 31) | 0));
  const g: GameState = {
    t: 0,
    over: false,
    winner: -1,
    teams: [
      newTeam(0, opts.heroIds[0], opts.loadouts[0], opts.ai[0], Array.isArray(opts.difficulty) ? opts.difficulty[0] : opts.difficulty),
      newTeam(1, opts.heroIds[1], opts.loadouts[1], opts.ai[1], Array.isArray(opts.difficulty) ? opts.difficulty[1] : opts.difficulty),
    ],
    units: [],
    projectiles: [],
    zones: [],
    summons: [],
    nextIncomeAt: C.INCOME_PERIOD,
    twilightLevel: 0,
    nextTwilightAt: C.TWILIGHT_AT,
    events: [],
    nextId: 1,
    rng,
    discovered: [[], []],
  };
  return g;
}

// --------------------------------------------------------------- derived stats

export function computeDerived(h: HeroState, applyHpDelta = true): HeroDerived {
  const def = HERO_BY_ID[h.defId];
  const lvl = h.level - 1;
  const str = def.base.str + def.growth.str * lvl + h.bonus.str;
  const agi = def.base.agi + def.growth.agi * lvl + h.bonus.agi;
  const int = def.base.int + def.growth.int * lvl + h.bonus.int;

  let itemDmg = 0, itemArmor = 0, itemHp = 0, itemAs = 0, itemMs = 0, itemSp = 0,
    itemRegen = 0, itemManaRegen = 0, itemCdr = 0, itemLifesteal = 0;
  for (const it of h.items) {
    if (!it) continue;
    const s = ITEM_BY_ID[it.defId].stats;
    itemDmg += s.dmg ?? 0; itemArmor += s.armor ?? 0; itemHp += s.hp ?? 0;
    itemAs += s.as ?? 0; itemMs += s.ms ?? 0; itemSp += s.sp ?? 0;
    itemRegen += s.regen ?? 0; itemManaRegen += s.manaRegen ?? 0; itemCdr += s.cdr ?? 0;
    itemLifesteal += s.lifesteal ?? 0;
  }

  let bDmgPct = 0, bAsPct = 0, bMsPct = 0, bArmor = 0, bSpellAmp = 0, bDodge = 0,
    bLifesteal = 0, scale = 1, cleave = 0;
  for (const b of h.buffs) {
    bDmgPct += b.dmgPct ?? 0; bAsPct += b.asPct ?? 0; bMsPct += b.msPct ?? 0;
    bArmor += b.armor ?? 0; bSpellAmp += b.spellAmp ?? 0; bDodge += b.dodge ?? 0;
    bLifesteal += b.lifesteal ?? 0;
    if (b.scale) scale = Math.max(scale, b.scale);
    if (b.cleaveArc) cleave = Math.max(cleave, b.cleaveArc);
  }

  const primary = def.attr === 'str' ? str : def.attr === 'agi' ? agi : int;
  const sp = int * C.SP_PER_INT + itemSp;
  const d: HeroDerived = {
    str, agi, int,
    maxHp: C.HP_BASE + str * C.HP_PER_STR + itemHp,
    maxMana: C.MANA_BASE + int * C.MANA_PER_INT,
    hpRegen: 0.8 + str * C.REGEN_PER_STR + itemRegen,
    manaRegen: 1.2 + int * C.MANA_REGEN_PER_INT + itemManaRegen,
    dmg: (def.baseDmg + primary + h.bonus.dmg + itemDmg) * (1 + bDmgPct),
    atkInterval: def.atkInterval / (1 + agi * C.AS_PER_AGI + itemAs + bAsPct),
    armor: agi * C.ARMOR_PER_AGI + h.bonus.armor + itemArmor + bArmor,
    sp,
    spellAmp: (1 + sp / 100) * (1 + bSpellAmp),
    ms: def.ms * (1 + itemMs + bMsPct),
    range: def.atkRange,
    dodge: Math.min(0.6, bDodge),
    lifesteal: bLifesteal + itemLifesteal,
    cdr: Math.min(0.4, itemCdr),
    scale,
  };
  (d as any).cleaveArc = cleave;
  if (applyHpDelta && h.d && d.maxHp > h.d.maxHp) h.hp += d.maxHp - h.d.maxHp;
  if (h.d) h.hp = Math.min(h.hp, d.maxHp);
  return d;
}

// ------------------------------------------------------------------- events

function emit(g: GameState, e: GameEvent) {
  g.events.push(e);
}

// ------------------------------------------------------------------- damage

interface DmgOpts {
  silent?: boolean;     // no event (dot ticks, auras)
  noBounty?: boolean;
  fromHero?: HeroState; // for lifesteal / ignite / underdog attribution
  isAbility?: boolean;
}

export function dmgUnit(g: GameState, u: UnitState, raw: number, kind: 'phys' | 'magic', srcTeam: TeamId, o: DmgOpts = {}): number {
  if (u.hp <= -1e8) return 0;
  const def = UNIT_BY_ID[u.defId];
  let amount = raw;
  if (kind === 'magic' && def.spellResist) amount *= 1 - def.spellResist;
  if (kind === 'phys' && def.flying && g.rng() < 0.35) {
    if (!o.silent) emit(g, { t: 'dmg', pos: { ...u.pos }, amount: 0, kind, target: 'unit', team: srcTeam });
    return 0;
  }
  // underdog favor: the defending team hits harder
  if (g.teams[srcTeam].underdog) amount *= C.UNDERDOG_DMG;
  u.hp -= amount;
  if (o.fromHero) {
    if (o.fromHero.d.lifesteal > 0 && kind === 'phys') healHero(o.fromHero, amount * o.fromHero.d.lifesteal);
    if (o.isAbility) {
      // Skyfire Grimoire: abilities ignite
      for (const it of o.fromHero.items) {
        if (it && ITEM_BY_ID[it.defId].proc === 'ignite') { addDot(u, 12, 3, g.t); break; }
      }
    }
  }
  if (!o.silent) emit(g, { t: 'dmg', pos: { ...u.pos }, amount, kind, target: 'unit', team: srcTeam });
  if (u.hp <= 0) {
    u.hp = -1e9;
    killUnit(g, u, srcTeam, o.noBounty ?? false, o.fromHero);
  }
  return amount;
}

function addDot(u: UnitState, dps: number, dur: number, t: number) {
  u.dots.push({ dps, until: t + dur });
  if (u.dots.length > 6) u.dots.shift();
}

export function applySlow(u: UnitState, pct: number, dur: number, t: number) {
  if (t > u.slowUntil || pct >= u.slowPct) {
    u.slowPct = pct;
    u.slowUntil = t + dur;
  }
}

function killUnit(g: GameState, u: UnitState, killerTeam: TeamId, noBounty: boolean, killerHero?: HeroState) {
  const def = UNIT_BY_ID[u.defId];
  const defender = g.teams[u.lane];
  // Archmage's Folio: every death is a footnote
  if (killerHero && !killerHero.dead) {
    for (const it of killerHero.items) {
      if (it && ITEM_BY_ID[it.defId].proc === 'manaleech') {
        killerHero.mana = Math.min(killerHero.d.maxMana, killerHero.mana + 6);
        break;
      }
    }
  }
  // bounty + xp always pay the defending team — a survived push is a payday
  if (!noBounty) {
    const b = bounty(def, u.raised);
    defender.gold += b;
    defender.stats.goldEarned += b;
    defender.stats.kills += 1;
    if (!defender.hero.dead) addXp(g, defender.hero, b * C.XP_PCT);
    emit(g, { t: 'gold', team: defender.id, amount: b, pos: { ...u.pos } });
  }
  emit(g, { t: 'death', pos: { ...u.pos }, defId: u.defId, tier: def.tier, lane: u.lane });

  // Imp Saboteur: death detonation hits the defending hero & their summons
  if (def.special === 'explode') {
    const h = defender.hero;
    if (!h.dead && dist(h.pos, u.pos) < 95) dmgHero(g, defender, 90, 'magic');
    for (const s of g.summons) {
      if (s.owner === u.lane && dist(s.pos, u.pos) < 95) dmgSummon(g, s, 90, u.owner);
    }
    emit(g, { t: 'impact', pos: { ...u.pos }, r: 95, theme: { c1: '#ff5e2b', c2: '#ffb347' }, kind: 'explode' });
  }
  // Plaguemonger: rot is contagious — dots jump to nearby monsters
  if (u.dots.length > 0 && !defender.hero.dead && defender.hero.buffs.some(b => b.plagueSpread)) {
    for (const v of g.units) {
      if (v.hp > 0 && v !== u && v.lane === u.lane && dist(v.pos, u.pos) < 135) {
        for (const d0 of u.dots) addDot(v, d0.dps, Math.max(0.8, d0.until - g.t), g.t);
      }
    }
    emit(g, { t: 'impact', pos: { ...u.pos }, r: 135, theme: { c1: '#9acd32', c2: '#4a5d23' }, kind: 'plague' });
  }
  // Necrothurge: a nearby allied corpse becomes a fresh skeleton
  if (!u.raised) {
    const len = g.units.length;
    for (let i = 0; i < len; i++) {
      const n = g.units[i];
      if (n.hp > 0 && n.defId === 'necro' && n.owner === u.owner && n.lane === u.lane &&
        n.raisedCount < 8 && dist(n.pos, u.pos) < 220) {
        n.raisedCount++;
        spawnUnit(g, 'skeleton', u.owner, { ...u.pos }, true);
        break;
      }
    }
  }
}

export function healHero(h: HeroState, amount: number) {
  if (h.dead) return;
  h.hp = Math.min(h.d.maxHp, h.hp + amount);
}

export function dmgHero(g: GameState, team: TeamState, raw: number, kind: 'phys' | 'magic', srcUnit?: UnitState): void {
  const h = team.hero;
  if (h.dead || g.over) return;
  let amount = raw;
  if (kind === 'phys') {
    if (g.rng() < h.d.dodge) return;
    amount *= 1 - armorReduction(h.d.armor);
  }
  // Bulwark of the Fallen Sun: flat block on cooldown
  for (const it of h.items) {
    if (it && ITEM_BY_ID[it.defId].proc === 'block' && g.t >= it.readyAt) {
      it.readyAt = g.t + 6;
      amount = Math.max(0, amount - 50);
      emit(g, { t: 'proc', pos: { ...h.pos }, itemId: it.defId });
      break;
    }
  }
  // shields absorb first
  for (const b of h.buffs) {
    if (b.shield && b.shield > 0 && amount > 0) {
      const soak = Math.min(b.shield, amount);
      b.shield -= soak;
      amount -= soak;
    }
  }
  // thorns
  if (srcUnit) {
    let reflect = 0;
    for (const b of h.buffs) reflect += b.reflect ?? 0;
    if (reflect > 0) dmgUnit(g, srcUnit, raw * reflect, 'magic', team.id, { silent: true });
    // Wyrmguard Plate: the cold remembers who struck it
    if (srcUnit.hp > 0 && UNIT_BY_ID[srcUnit.defId].range < 80) {
      for (const it of h.items) {
        if (it && ITEM_BY_ID[it.defId].proc === 'chillguard') {
          applySlow(srcUnit, 0.25, 1.5, g.t);
          break;
        }
      }
    }
  }
  if (amount <= 0) return;
  h.hp -= amount;
  emit(g, { t: 'dmg', pos: { ...h.pos }, amount, kind, target: 'hero', team: team.id });
  if (h.hp <= 0) {
    // Phoenix Diadem: once per battle, death is negotiable
    for (const it of h.items) {
      if (it && ITEM_BY_ID[it.defId].proc === 'revive' && !it.used) {
        it.used = true;
        h.hp = h.d.maxHp * 0.5;
        h.buffs = [];
        emit(g, { t: 'proc', pos: { ...h.pos }, itemId: it.defId });
        emit(g, { t: 'impact', pos: { ...h.pos }, r: 130, theme: { c1: '#ffb347', c2: '#ff5e2b' }, kind: 'phoenix' });
        return;
      }
    }
    h.hp = 0;
    h.dead = true;
    h.buffs = [];
    h.channel = null;
    h.respawnAt = g.t + C.RESPAWN_BASE + C.RESPAWN_PER_LVL * h.level;
    const enemy = g.teams[1 - team.id];
    const reward = C.HERO_KILL_GOLD + 12 * h.level;
    enemy.gold += reward;
    enemy.stats.goldEarned += reward;
    emit(g, { t: 'heroDeath', team: team.id, pos: { ...h.pos } });
    emit(g, { t: 'gold', team: enemy.id, amount: reward });
  }
}

function dmgSummon(g: GameState, s: SummonState, amount: number, srcTeam: TeamId) {
  s.hp -= amount;
  emit(g, { t: 'dmg', pos: { ...s.pos }, amount, kind: 'phys', target: 'summon', team: srcTeam });
}

export function dmgCastle(g: GameState, team: TeamState, amount: number, attackerTeam: TeamId) {
  if (g.over) return;
  team.castleHp -= amount;
  g.teams[attackerTeam].stats.dmgToCastle += amount;
  emit(g, { t: 'castleHit', team: team.id, amount });
  if (team.castleHp <= 0) {
    team.castleHp = 0;
    g.over = true;
    g.winner = (1 - team.id) as TeamId;
    emit(g, { t: 'win', team: g.winner });
  }
}

function addXp(g: GameState, h: HeroState, xp: number) {
  if (h.level >= C.MAX_LEVEL) return;
  h.xp += xp;
  let need = xpNeed(h.level);
  while (h.xp >= need && h.level < C.MAX_LEVEL) {
    h.xp -= need;
    h.level++;
    h.d = computeDerived(h);
    healHero(h, h.d.maxHp * 0.15);
    h.mana = Math.min(h.d.maxMana, h.mana + h.d.maxMana * 0.15);
    emit(g, { t: 'levelup', team: h.team, level: h.level, pos: { ...h.pos } });
    need = xpNeed(h.level);
  }
}

// ------------------------------------------------------------------ economy

export function trySend(g: GameState, team: TeamState, defId: string, priceMult = 1): boolean {
  const def = UNIT_BY_ID[defId];
  if (!def || g.over) return false;
  const needKeep = def.tier;
  if (team.baseLevel < needKeep) {
    emit(g, { t: 'deny', team: team.id, msg: `Requires Keep ${'I'.repeat(needKeep)}` });
    return false;
  }
  if (team.sendQueue.length >= C.QUEUE_CAP) {
    emit(g, { t: 'deny', team: team.id, msg: 'The gate is congested' });
    return false;
  }
  const cost = def.cost * priceMult;
  if (team.gold < cost) {
    emit(g, { t: 'deny', team: team.id, msg: 'Not enough gold' });
    return false;
  }
  team.gold -= cost;
  team.income += def.income;
  team.stats.incomeGained += def.income;
  team.stats.sent++;
  team.stats.peakIncome = Math.max(team.stats.peakIncome, team.income);
  team.sendQueue.push(defId);
  emit(g, { t: 'send', team: team.id, defId });
  return true;
}

export function tryBuyItem(g: GameState, team: TeamState, itemId: string, priceMult = 1): boolean {
  const def = ITEM_BY_ID[itemId];
  if (!def || def.tier !== 'basic' || g.over) return false;
  const h = team.hero;
  const slot = h.items.findIndex(s => s === null);
  if (slot === -1) {
    emit(g, { t: 'deny', team: team.id, msg: 'Inventory is full' });
    return false;
  }
  const cost = def.cost * priceMult;
  if (team.gold < cost) {
    emit(g, { t: 'deny', team: team.id, msg: 'Not enough gold' });
    return false;
  }
  team.gold -= cost;
  h.items[slot] = { defId: itemId, readyAt: 0, counter: 0, used: false };
  emit(g, { t: 'buy', team: team.id, itemId });
  autoForge(g, team);
  h.d = computeDerived(h);
  return true;
}

/** The forge acts unbidden: hold the right pieces and they become something else. */
function autoForge(g: GameState, team: TeamState) {
  const h = team.hero;
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of FORGED_ITEMS) {
      const comps = [...(f.components ?? [])];
      const slots: number[] = [];
      for (const c of comps) {
        const idx = h.items.findIndex((s, i) => s !== null && s.defId === c && !slots.includes(i));
        if (idx === -1) { slots.length = 0; break; }
        slots.push(idx);
      }
      if (slots.length === comps.length && comps.length > 0) {
        for (const i of slots) h.items[i] = null;
        const free = h.items.findIndex(s => s === null);
        h.items[free] = { defId: f.id, readyAt: g.t + (f.proc === 'kingsguard' ? 10 : 0), counter: 0, used: false };
        if (!g.discovered[team.id].includes(f.id)) g.discovered[team.id].push(f.id);
        emit(g, { t: 'forge', team: team.id, itemId: f.id });
        changed = true;
      }
    }
  }
}

export function statCost(team: TeamState, key: keyof TeamState['statUp']): number {
  const base = key === 'dmg' || key === 'armor' ? C.STAT_COST_DMG : C.STAT_COST;
  return Math.round(base * Math.pow(C.STAT_GROWTH, team.statUp[key]));
}

export function tryBuyStat(g: GameState, team: TeamState, key: keyof TeamState['statUp'], priceMult = 1): boolean {
  if (team.statUp[key] >= C.STAT_CAP) {
    emit(g, { t: 'deny', team: team.id, msg: 'Training maxed' });
    return false;
  }
  const cost = statCost(team, key) * priceMult;
  if (g.over || team.gold < cost) {
    if (!g.over) emit(g, { t: 'deny', team: team.id, msg: 'Not enough gold' });
    return false;
  }
  team.gold -= cost;
  team.statUp[key]++;
  const h = team.hero;
  if (key === 'dmg') h.bonus.dmg += C.DMG_GAIN;
  else if (key === 'armor') h.bonus.armor += C.ARMOR_GAIN;
  else h.bonus[key] += C.STAT_GAIN;
  h.d = computeDerived(h);
  return true;
}

export function tryUpgradeKeep(g: GameState, team: TeamState, priceMult = 1): boolean {
  if (team.baseLevel >= 3 || g.over) return false;
  const target = (team.baseLevel + 1) as 2 | 3;
  const cost = C.KEEP_COSTS[target] * priceMult;
  if (team.gold < cost) {
    emit(g, { t: 'deny', team: team.id, msg: 'Not enough gold' });
    return false;
  }
  team.gold -= cost;
  team.baseLevel = target;
  team.castleMaxHp += C.KEEP_HP_BONUS[target];
  team.castleHp = Math.min(team.castleMaxHp, team.castleHp + C.KEEP_HEAL[target]);
  emit(g, { t: 'upgrade', team: team.id, level: target });
  return true;
}

export function repairCost(team: TeamState): number {
  return Math.round(C.REPAIR_COST * Math.pow(C.REPAIR_GROWTH, team.repairCount));
}

export function tryRepair(g: GameState, team: TeamState, priceMult = 1): boolean {
  if (g.over || g.t < team.repairReadyAt) return false;
  if (team.castleHp >= team.castleMaxHp) return false;
  const cost = repairCost(team) * priceMult;
  if (team.gold < cost) {
    emit(g, { t: 'deny', team: team.id, msg: 'Not enough gold' });
    return false;
  }
  team.gold -= cost;
  team.repairCount++;
  team.castleHp = Math.min(team.castleMaxHp, team.castleHp + C.REPAIR_AMOUNT);
  team.repairReadyAt = g.t + C.REPAIR_CD;
  emit(g, { t: 'repair', team: team.id });
  return true;
}

// ------------------------------------------------------------------- spawns

function spawnUnit(g: GameState, defId: string, owner: TeamId, pos: Vec | null, raised = false): UnitState {
  const def = UNIT_BY_ID[defId];
  const lane = (1 - owner) as TeamId;
  const L = laneOf(lane);
  const p = pos ?? {
    x: laneCenterX(lane) + (g.rng() - 0.5) * (L.x1 - L.x0 - 140),
    y: C.SPAWN_Y + g.rng() * 26,
  };
  const u: UnitState = {
    id: g.nextId++,
    defId,
    lane,
    owner,
    pos: p,
    hp: def.hp,
    maxHp: def.hp,
    slowUntil: 0, slowPct: 0, ccUntil: 0, airborneUntil: 0, fearUntil: 0, confuseUntil: 0,
    missUntil: 0, disarmUntil: 0,
    dots: [],
    dmgBuffPct: 0, spdBuffPct: 0,
    attackReadyAt: 0,
    specialReadyAt: 0,
    raisedCount: 0,
    raised,
    roared: false,
    state: 'march',
    bob: g.rng() * Math.PI * 2,
  };
  g.units.push(u);
  emit(g, { t: 'spawn', pos: { ...p }, lane, defId });
  return u;
}

function spawnSummon(g: GameState, owner: TeamId, kind: SummonState['kind'], pos: Vec, hp: number, dmg: number, range: number, speed: number, dur: number, theme: { c1: string; c2: string }): SummonState {
  const s: SummonState = {
    id: g.nextId++,
    kind,
    owner,
    pos: clampToLane(owner, pos),
    hp, maxHp: hp, dmg, range, speed,
    until: g.t + dur,
    attackReadyAt: 0,
    theme,
  };
  g.summons.push(s);
  return s;
}

// ------------------------------------------------------------------ casting

function heroStunned(h: HeroState): boolean {
  return h.buffs.some(b => b.stun);
}
function heroFeared(h: HeroState): boolean {
  return h.buffs.some(b => b.fear);
}

function abilityDamage(ab: AbilityDef, h: HeroState): number {
  return ((ab.p.dmg ?? 0) + (ab.p.lvl ?? 0) * h.level) * h.d.spellAmp;
}

export function castAbility(g: GameState, team: TeamState, slot: number): boolean {
  const h = team.hero;
  if (h.dead || g.over || h.channel || heroStunned(h) || heroFeared(h)) return false;
  const ab = abilityOf(h, slot);
  if (!ab) return false;
  if (slot === 3 && h.level < C.ULT_LEVEL) {
    emit(g, { t: 'deny', team: team.id, msg: `Ultimate unlocks at level ${C.ULT_LEVEL}` });
    return false;
  }
  if (g.t < h.cds[slot]) return false;
  if (h.mana < ab.mana) {
    emit(g, { t: 'deny', team: team.id, msg: 'Not enough mana' });
    return false;
  }
  const aim = clampToLane(team.id, { ...team.input.aim }, 24);
  h.mana -= ab.mana;
  h.cds[slot] = g.t + ab.cd * (1 - h.d.cdr);
  h.facing = aim.x >= h.pos.x ? 1 : -1;

  let times = 1;
  if (slot !== 3) {
    const echoIdx = h.buffs.findIndex(b => b.echoSpell);
    if (echoIdx >= 0) {
      h.buffs.splice(echoIdx, 1);
      times = 2;
    }
  }
  for (let i = 0; i < times; i++) execAbility(g, team, h, ab, aim);
  emit(g, { t: 'cast', team: team.id, abId: ab.id, pos: { ...h.pos }, aim, ult: slot === 3 });
  return true;
}

function unitsInLane(g: GameState, lane: TeamId): UnitState[] {
  return g.units.filter(u => u.lane === lane && u.hp > 0);
}

function execAbility(g: GameState, team: TeamState, h: HeroState, ab: AbilityDef, aim: Vec) {
  const p = ab.p;
  const lane = team.id;
  const dmg = abilityDamage(ab, h);
  const t = g.t;
  const foes = () => unitsInLane(g, lane);

  switch (ab.kind) {
    case 'coneSlash': {
      const angle = Math.atan2(aim.y - h.pos.y, aim.x - h.pos.x);
      for (const u of foes()) {
        const d0 = dist(h.pos, u.pos);
        if (d0 > p.range) continue;
        const ua = Math.atan2(u.pos.y - h.pos.y, u.pos.x - h.pos.x);
        let da = Math.abs(ua - angle);
        if (da > Math.PI) da = 2 * Math.PI - da;
        if (da > p.arc / 2) continue;
        const def = UNIT_BY_ID[u.defId];
        const mult = def.tier >= 2 && p.tierBonus ? 1 + p.tierBonus : 1;
        dmgUnit(g, u, dmg * mult, 'magic', team.id, { fromHero: h, isAbility: true });
      }
      emit(g, { t: 'impact', pos: { ...h.pos }, r: p.range, theme: ab.theme, kind: 'cone' });
      break;
    }
    case 'targetStun': {
      let best: UnitState | null = null;
      for (const u of foes()) {
        if (dist(h.pos, u.pos) > p.range) continue;
        if (!best || (p.strongest ? u.maxHp > best.maxHp : dist(h.pos, u.pos) < dist(h.pos, best.pos))) best = u;
      }
      if (best) {
        best.ccUntil = Math.max(best.ccUntil, t + p.stun);
        dmgUnit(g, best, dmg, 'magic', team.id, { fromHero: h, isAbility: true });
        emit(g, { t: 'impact', pos: { ...best.pos }, r: 50, theme: ab.theme, kind: 'smite' });
      }
      break;
    }
    case 'nova': {
      for (const u of foes()) {
        const d0 = dist(h.pos, u.pos);
        if (d0 > p.r) continue;
        dmgUnit(g, u, dmg, 'magic', team.id, { fromHero: h, isAbility: true });
        if (u.hp <= 0) continue;
        if (p.knock) {
          const nx = (u.pos.x - h.pos.x) / (d0 || 1), ny = (u.pos.y - h.pos.y) / (d0 || 1);
          u.pos = clampToLane(lane, { x: u.pos.x + nx * p.knock, y: u.pos.y + ny * p.knock }, 10);
        }
        if (p.slow) applySlow(u, p.slow, p.slowDur ?? 2, t);
        if (p.fear) u.fearUntil = Math.max(u.fearUntil, t + p.fear);
        if (p.air) { u.airborneUntil = t + p.air; u.ccUntil = Math.max(u.ccUntil, t + p.air); }
        if (p.disarm) u.disarmUntil = Math.max(u.disarmUntil, t + p.disarm);
        if (p.dot) addDot(u, p.dot, p.dotDur ?? 3, t);
      }
      emit(g, { t: 'impact', pos: { ...h.pos }, r: p.r, theme: ab.theme, kind: 'nova' });
      break;
    }
    case 'leapSlam': {
      const dx = aim.x - h.pos.x, dy = aim.y - h.pos.y;
      const len = Math.hypot(dx, dy) || 1;
      const reach = Math.min(len, p.dash);
      const from = { ...h.pos };
      const to = clampToLane(lane, { x: h.pos.x + (dx / len) * reach, y: h.pos.y + (dy / len) * reach });
      h.pos = to;
      if (p.line) {
        for (const u of foes()) {
          // distance from u to segment from->to
          const t0 = clamp(((u.pos.x - from.x) * (to.x - from.x) + (u.pos.y - from.y) * (to.y - from.y)) / (reach * reach || 1), 0, 1);
          const px = from.x + (to.x - from.x) * t0, py = from.y + (to.y - from.y) * t0;
          if (Math.hypot(u.pos.x - px, u.pos.y - py) <= p.width / 2 + 14) {
            const execute = p.execute && u.hp / u.maxHp < 0.35 ? 1 + p.execute : 1;
            dmgUnit(g, u, dmg * execute, 'magic', team.id, { fromHero: h, isAbility: true });
          }
        }
        emit(g, { t: 'impact', pos: from, r: 0, theme: ab.theme, kind: 'dashline' });
        emit(g, { t: 'impact', pos: { ...to }, r: 40, theme: ab.theme, kind: 'dashend' });
      } else {
        for (const u of foes()) {
          if (dist(to, u.pos) <= p.r) {
            dmgUnit(g, u, dmg, 'magic', team.id, { fromHero: h, isAbility: true });
            if (p.stun && u.hp > 0) u.ccUntil = Math.max(u.ccUntil, t + p.stun);
          }
        }
        if (p.zoneDps) {
          makeZone(g, team.id, 'burn', { ...to }, p.zoneR, p.zoneDur, { dps: p.zoneDps * h.d.spellAmp }, ab.theme);
        }
        emit(g, { t: 'impact', pos: { ...to }, r: p.r, theme: ab.theme, kind: 'slam' });
      }
      break;
    }
    case 'projectile': {
      const count = p.count ?? 1;
      const targets: Vec[] = [];
      if (count > 1) {
        const sorted = foes().sort((a, b) => dist(h.pos, a.pos) - dist(h.pos, b.pos)).slice(0, count);
        for (const u of sorted) targets.push({ ...u.pos });
        while (targets.length < count) targets.push({ x: aim.x + (g.rng() - 0.5) * 120, y: aim.y + (g.rng() - 0.5) * 120 });
      } else {
        targets.push(aim);
      }
      for (const tg of targets) {
        const dx = tg.x - h.pos.x, dy = tg.y - h.pos.y;
        const len = Math.hypot(dx, dy) || 1;
        g.projectiles.push({
          id: g.nextId++,
          owner: team.id,
          pos: { ...h.pos },
          vel: { x: (dx / len) * p.speed, y: (dy / len) * p.speed },
          r: p.r,
          dmg,
          kind: 'magic',
          pierce: !!p.pierce,
          explodeR: p.explodeR ?? 0,
          explodeDmg: (p.explodeDmg ?? 0) * h.d.spellAmp,
          dragX: p.drag ?? 0,
          slowPct: p.slow ?? 0,
          slowDur: p.slowDur ?? 0,
          dotDps: (p.dot ?? 0) * h.d.spellAmp,
          dotDur: p.dotDur ?? 0,
          knock: p.knock ?? 0,
          hitIds: [],
          boomerang: p.boomerang ? 1 : 0,
          origin: { ...h.pos },
          maxDist: p.boomerang ? 430 : 900,
          targetUnit: -1,
          theme: ab.theme,
          ignite: 0,
        });
      }
      break;
    }
    case 'buffSelf': {
      if (p.heal || p.healMissPct) {
        const missing = h.d.maxHp - h.hp;
        healHero(h, (p.heal ?? 0) + (p.healLvl ?? 0) * h.level + (p.healMissPct ?? 0) * missing);
      }
      if (p.manaGain) h.mana = Math.min(h.d.maxMana, h.mana + p.manaGain);
      if (p.dur && p.dur > 0) {
        const b: Buff = { id: ab.id, until: t + p.dur, theme: ab.id };
        if (p.shield) b.shield = p.shield + (p.shieldLvl ?? 0) * h.level;
        if (p.reflect) b.reflect = p.reflect;
        if (p.asPct) b.asPct = p.asPct;
        if (p.msPct) b.msPct = p.msPct;
        if (p.dmgPct) b.dmgPct = p.dmgPct;
        if (p.echoArrow) b.dmgPct = (b.dmgPct ?? 0) + p.echoArrow;
        if (p.dodge) b.dodge = p.dodge;
        if (p.armor) b.armor = p.armor;
        if (p.echo) b.echoSpell = true;
        if (p.spellAmp) b.spellAmp = p.spellAmp;
        if (p.blinkStrike) b.blinkStrike = true;
        if (p.plague) b.plagueSpread = true;
        if (p.lifesteal) b.lifesteal = p.lifesteal;
        if (p.auraDps) { b.auraDps = (p.auraDps + (p.auraLvl ?? 0) * h.level) * h.d.spellAmp; b.auraR = p.auraR; }
        if (p.drainDps) { b.drainDps = (p.drainDps + (p.drainLvl ?? 0) * h.level) * h.d.spellAmp; b.drainR = p.drainR; }
        h.buffs = h.buffs.filter(x => x.id !== ab.id);
        h.buffs.push(b);
        h.d = computeDerived(h);
      }
      break;
    }
    case 'summon': {
      const kind = (ab.theme.shape ?? 'owl') as SummonState['kind'];
      const L = laneOf(lane);
      for (let i = 0; i < p.count; i++) {
        let pos: Vec;
        if (kind === 'snapper') {
          const spread = (L.x1 - L.x0 - 120) / Math.max(1, p.count - 1);
          pos = { x: L.x0 + 60 + spread * i, y: aim.y };
        } else {
          pos = { x: aim.x + (g.rng() - 0.5) * 110, y: aim.y + (g.rng() - 0.5) * 70 };
        }
        spawnSummon(g, lane, kind, pos, p.hp + h.level * 8, p.dmg + h.level * 1.2, p.range, p.speed, p.dur, ab.theme);
      }
      emit(g, { t: 'impact', pos: { ...aim }, r: 60, theme: ab.theme, kind: 'summon' });
      break;
    }
    case 'dash': {
      const dx = aim.x - h.pos.x, dy = aim.y - h.pos.y;
      const len = Math.hypot(dx, dy) || 1;
      const reach = Math.min(len, p.dist);
      const from = { ...h.pos };
      h.pos = clampToLane(lane, { x: h.pos.x + (dx / len) * reach, y: h.pos.y + (dy / len) * reach });
      if (p.decoy) {
        spawnSummon(g, lane, 'decoy', from, p.decoyHp + h.level * 10, 0, 0, 0, p.decoyDur, ab.theme);
      }
      emit(g, { t: 'impact', pos: from, r: 30, theme: ab.theme, kind: 'blink' });
      break;
    }
    case 'wall': {
      makeZone(g, team.id, 'wall', { ...aim }, p.len / 2, p.dur, { slow: p.slow, dps: p.dps * h.d.spellAmp, len: p.len }, ab.theme);
      break;
    }
    case 'zone': {
      let kind: ZoneKind = 'gravity';
      const zp: Record<string, number> = {};
      if (p.root) { kind = 'root'; zp.root = p.root; zp.dps = (p.dps ?? 0) * h.d.spellAmp; }
      else if (p.confuse) { kind = 'pollen'; zp.confuse = p.confuse; }
      else if (p.delay) { kind = 'collapse'; zp.dmg = dmg; zp.pull = p.pull ?? 0; }
      else if (p.blackhole) { kind = 'blackhole'; zp.dps = ((p.dps ?? 0) + (p.lvl ?? 0) * h.level) * h.d.spellAmp; zp.pull = p.pull; zp.burst = (p.burst ?? 0) * h.d.spellAmp; }
      else if (p.armor) { kind = 'banner'; zp.slow = p.slow; zp.armor = p.armor; }
      else if (ab.id === 'sporeburst') {
        kind = 'spore'; zp.dps = (p.dps ?? 0) * h.d.spellAmp;
        for (const u of foes()) if (dist(aim, u.pos) <= p.r) dmgUnit(g, u, dmg, 'magic', team.id, { fromHero: h, isAbility: true });
      }
      else if (p.blind) {
        kind = 'smog'; zp.blind = 1; zp.dps = (p.dps ?? 0) * h.d.spellAmp;
        if (p.dmg) {
          for (const u of foes()) {
            if (dist(aim, u.pos) <= p.r) {
              dmgUnit(g, u, dmg, 'magic', team.id, { fromHero: h, isAbility: true });
              if (u.hp > 0) u.missUntil = Math.max(u.missUntil, t + (p.blindDur ?? 2));
            }
          }
        }
      }
      else if (p.heal) { kind = 'sanctify'; zp.heal = p.heal + (p.healLvl ?? 0) * h.level; zp.slow = p.slow ?? 0; }
      else { kind = 'gravity'; zp.slow = p.slow ?? 0; zp.dps = ((p.dps ?? 0) + (p.lvl ?? 0) * h.level) * h.d.spellAmp; }
      const dur = kind === 'collapse' ? p.delay : (p.dur ?? 3);
      makeZone(g, team.id, kind, { ...aim }, p.r, dur, zp, ab.theme);
      break;
    }
    case 'beam': {
      h.channel = { ability: ab.id, until: t + p.dur, startY: C.SPAWN_Y };
      makeZone(g, team.id, ab.theme.shape === 'rats' ? 'rattide' : 'beamfire', { x: laneCenterX(lane), y: C.SPAWN_Y }, p.width, p.dur, {
        dps: p.dps * h.d.spellAmp + h.level * 4,
        width: p.width,
        igniteDps: p.igniteDps * h.d.spellAmp,
        igniteDur: p.igniteDur,
        dur: p.dur,
      }, ab.theme);
      break;
    }
    case 'transform': {
      const b: Buff = {
        id: ab.id, until: t + p.dur, theme: ab.id,
        dmgPct: p.dmgPct, armor: p.armor, scale: p.scale, cleaveArc: p.cleaveArc,
      };
      h.buffs = h.buffs.filter(x => x.id !== ab.id);
      h.buffs.push(b);
      h.d = computeDerived(h);
      healHero(h, h.d.maxHp * (p.healPct ?? 0));
      break;
    }
    case 'barrage': {
      makeZone(g, team.id, 'starfall', { ...aim }, p.r, p.dur, {
        dmg: dmg, slow: p.slow ?? 0, slowDur: p.slowDur ?? 1.5,
        interval: p.dur / p.count, count: p.count,
        smart: p.smart ?? 0, sweep: p.sweep ?? 0, hitR: p.hitR ?? 78, stun: p.stun ?? 0,
      }, ab.theme);
      break;
    }
    case 'callDown': {
      makeZone(g, team.id, 'anvil', { ...aim }, p.r, p.delay, {
        dmg, stun: p.stun ?? 0,
        fieldDur: p.fieldDur ?? 0, fieldSlow: p.fieldSlow ?? 0, fieldDps: (p.fieldDps ?? 0) * h.d.spellAmp,
      }, ab.theme);
      break;
    }
    case 'mobileZone': {
      makeZone(g, team.id, 'tempest', { ...aim }, p.r, p.dur, {
        dps: p.dps * h.d.spellAmp + h.level * 3, pull: p.pull, drift: p.drift,
      }, ab.theme);
      break;
    }
  }
}

function makeZone(g: GameState, owner: TeamId, kind: ZoneKind, pos: Vec, r: number, dur: number, p: Record<string, number>, theme: { c1: string; c2: string }): Zone {
  const z: Zone = {
    id: g.nextId++,
    kind, owner,
    pos: clampToLane(owner, pos, 6),
    r,
    until: g.t + dur,
    nextTick: g.t,
    p,
    theme,
    born: g.t,
  };
  g.zones.push(z);
  return z;
}

// -------------------------------------------------------------- item actives

export function tryUseItem(g: GameState, team: TeamState, slot: number): boolean {
  const h = team.hero;
  const it = h.items[slot];
  if (!it || h.dead || g.over) return false;
  const def = ITEM_BY_ID[it.defId];
  if (def.proc !== 'galedash') return false;
  if (g.t < it.readyAt) return false;
  it.readyAt = g.t + 18;
  const aim = team.input.aim;
  const dx = aim.x - h.pos.x, dy = aim.y - h.pos.y;
  const len = Math.hypot(dx, dy) || 1;
  h.pos = clampToLane(team.id, { x: h.pos.x + (dx / len) * 260, y: h.pos.y + (dy / len) * 260 });
  emit(g, { t: 'impact', pos: { ...h.pos }, r: 40, theme: { c1: '#7df3df', c2: '#ffffff' }, kind: 'blink' });
  emit(g, { t: 'proc', pos: { ...h.pos }, itemId: it.defId });
  return true;
}

// ------------------------------------------------------------------ updates

function updateHero(g: GameState, team: TeamState, dt: number) {
  const h = team.hero;
  const t = g.t;

  if (h.dead) {
    if (t >= h.respawnAt) {
      h.dead = false;
      const fp = fountainPos(team.id);
      h.pos = { x: fp.x, y: fp.y - 50 };
      h.d = computeDerived(h);
      h.hp = h.d.maxHp;
      h.mana = h.d.maxMana;
      emit(g, { t: 'heroSpawn', team: team.id, pos: { ...h.pos } });
    }
    return;
  }

  // expire buffs; tick hots/dots/auras
  let buffsChanged = false;
  for (let i = h.buffs.length - 1; i >= 0; i--) {
    const b = h.buffs[i];
    if (t >= b.until) { h.buffs.splice(i, 1); buffsChanged = true; continue; }
    if (b.hot) healHero(h, b.hot * dt);
    if (b.dot) { h.hp -= b.dot * dt; }
    if (b.auraDps && b.auraR) {
      for (const u of g.units) {
        if (u.lane === team.id && u.hp > 0 && dist(u.pos, h.pos) <= b.auraR) {
          dmgUnit(g, u, b.auraDps * dt, 'magic', team.id, { silent: true, fromHero: h });
        }
      }
    }
    if (b.drainDps && b.drainR) {
      let drained = 0;
      for (const u of g.units) {
        if (u.lane === team.id && u.hp > 0 && dist(u.pos, h.pos) <= b.drainR) {
          drained += dmgUnit(g, u, b.drainDps * dt, 'magic', team.id, { silent: true, fromHero: h });
        }
      }
      healHero(h, drained);
    }
  }
  if (buffsChanged) h.d = computeDerived(h);

  // chill aura from Frost Revenants
  let chilled = false;
  for (const u of g.units) {
    if (u.hp > 0 && u.lane === team.id && u.defId === 'revenant' && dist(u.pos, h.pos) < 165) { chilled = true; break; }
  }

  // regen + fountain
  healHero(h, h.d.hpRegen * dt);
  h.mana = Math.min(h.d.maxMana, h.mana + h.d.manaRegen * dt);
  const fp = fountainPos(team.id);
  if (dist(h.pos, fp) < C.FOUNTAIN_R) {
    healHero(h, h.d.maxHp * C.FOUNTAIN_REGEN * dt);
    h.mana = Math.min(h.d.maxMana, h.mana + h.d.maxMana * C.FOUNTAIN_REGEN * dt);
  }

  if (h.hp <= 0) { dmgHero(g, team, 0.001, 'magic'); return; } // dot deaths resolve through the pipeline

  // Crown of the Shattered King: periodic kingsguard
  for (const it of h.items) {
    if (it && ITEM_BY_ID[it.defId].proc === 'kingsguard' && t >= it.readyAt) {
      it.readyAt = t + 20;
      spawnSummon(g, team.id, 'knight', { x: h.pos.x + 30 * h.facing, y: h.pos.y }, 430, 30 + h.level * 1.5, 95, 210, 8, { c1: '#e3b341', c2: '#6a7a9a' });
      emit(g, { t: 'proc', pos: { ...h.pos }, itemId: it.defId });
    }
  }

  // channeling locks everything else
  if (h.channel) {
    if (t >= h.channel.until) h.channel = null;
    else return;
  }

  const stunned = heroStunned(h);
  const feared = heroFeared(h);

  // consume cast inputs
  for (let i = 0; i < 4; i++) {
    if (team.input.cast[i]) {
      team.input.cast[i] = false;
      castAbility(g, team, i);
      if (h.channel) return;
    }
  }
  for (let i = 0; i < 6; i++) {
    if (team.input.useItem[i]) {
      team.input.useItem[i] = false;
      tryUseItem(g, team, i);
    }
  }

  // movement: keyboard vector overrides click orders; otherwise walk to moveTo
  if (!stunned) {
    let mx = team.input.move.x, my = team.input.move.y;
    if (Math.hypot(mx, my) > 0.01) team.input.moveTo = null;
    else if (team.input.moveTo) {
      const mt = team.input.moveTo;
      const dx = mt.x - h.pos.x, dy = mt.y - h.pos.y;
      const d0 = Math.hypot(dx, dy);
      if (d0 < 8) team.input.moveTo = null;
      else { mx = dx / d0; my = dy / d0; }
    }
    if (feared) {
      const dx = fp.x - h.pos.x, dy = fp.y - h.pos.y;
      const len = Math.hypot(dx, dy) || 1;
      mx = dx / len; my = dy / len;
      team.input.moveTo = null;
    }
    const len = Math.hypot(mx, my);
    if (len > 0.01) {
      const ms = h.d.ms * (chilled ? 0.75 : 1);
      const step = Math.min(ms * dt, team.input.moveTo ? Math.hypot(team.input.moveTo.x - h.pos.x, team.input.moveTo.y - h.pos.y) : ms * dt);
      h.pos = clampToLane(team.id, { x: h.pos.x + (mx / len) * step, y: h.pos.y + (my / len) * step });
      if (Math.abs(mx) > 0.1) h.facing = mx > 0 ? 1 : -1;
    }
  }

  // auto-attack
  if (!stunned && !feared) {
    const interval = h.d.atkInterval * (chilled ? 1.25 : 1);
    if (t >= h.attackReadyAt) {
      let target: UnitState | null = null;
      let bestD = Infinity;
      for (const u of g.units) {
        if (u.lane !== team.id || u.hp <= 0) continue;
        const d0 = dist(h.pos, u.pos);
        if (d0 < bestD) { bestD = d0; target = u; }
      }
      if (target && bestD <= h.d.range + 20) {
        h.attackReadyAt = t + interval;
        h.attackAnimT = t;
        h.facing = target.pos.x >= h.pos.x ? 1 : -1;
        // Slipstream: attacks blink Vyrel to his victim
        if (h.buffs.some(b => b.blinkStrike) && bestD > 60) {
          h.pos = clampToLane(team.id, { x: target.pos.x - 30 * Math.sign(target.pos.x - h.pos.x || 1), y: target.pos.y });
          emit(g, { t: 'impact', pos: { ...h.pos }, r: 24, theme: { c1: '#dffcf7', c2: '#1f6f6b' }, kind: 'blink' });
        }
        const underdog = team.underdog ? C.UNDERDOG_DMG : 1;
        const dmg = h.d.dmg * underdog;
        const cleaveArc = (h.d as any).cleaveArc as number;
        if (h.d.range > 200) {
          // ranged: homing bolt
          const dx = target.pos.x - h.pos.x, dy = target.pos.y - h.pos.y;
          const len = Math.hypot(dx, dy) || 1;
          g.projectiles.push({
            id: g.nextId++, owner: team.id, pos: { x: h.pos.x, y: h.pos.y - 18 },
            vel: { x: (dx / len) * 900, y: (dy / len) * 900 },
            r: 14, dmg, kind: 'phys', pierce: false, explodeR: 0, explodeDmg: 0,
            dragX: 0, slowPct: 0, slowDur: 0, dotDps: 0, dotDur: 0, knock: 0, hitIds: [], boomerang: 0,
            origin: { ...h.pos }, maxDist: h.d.range + 140, targetUnit: target.id,
            theme: { c1: heroDef(h).palette.glow, c2: '#ffffff' }, ignite: 0,
          });
        } else if (cleaveArc > 0) {
          const angle = Math.atan2(target.pos.y - h.pos.y, target.pos.x - h.pos.x);
          for (const u of g.units) {
            if (u.lane !== team.id || u.hp <= 0) continue;
            if (dist(h.pos, u.pos) > h.d.range + 30) continue;
            const ua = Math.atan2(u.pos.y - h.pos.y, u.pos.x - h.pos.x);
            let da = Math.abs(ua - angle);
            if (da > Math.PI) da = 2 * Math.PI - da;
            if (da <= cleaveArc / 2) dmgUnit(g, u, dmg, 'phys', team.id, { fromHero: h });
          }
        } else {
          dmgUnit(g, target, dmg, 'phys', team.id, { fromHero: h });
        }
        heroOnHitProcs(g, team, h, target, dmg);
      }
    }
  }
}

function heroOnHitProcs(g: GameState, team: TeamState, h: HeroState, target: UnitState, dmg: number) {
  for (const it of h.items) {
    if (!it) continue;
    // Dragonmaw Cleaver: melee bites an arc (the colossus cleave supersedes it)
    if (ITEM_BY_ID[it.defId].proc === 'cleave' && h.d.range <= 200 && !(h.d as any).cleaveArc) {
      const angle = Math.atan2(target.pos.y - h.pos.y, target.pos.x - h.pos.x);
      for (const u of g.units) {
        if (u.lane !== team.id || u.hp <= 0 || u.id === target.id) continue;
        if (dist(h.pos, u.pos) > h.d.range + 40) continue;
        let da = Math.abs(Math.atan2(u.pos.y - h.pos.y, u.pos.x - h.pos.x) - angle);
        if (da > Math.PI) da = 2 * Math.PI - da;
        if (da <= 0.85) dmgUnit(g, u, dmg * 0.35, 'phys', team.id, { fromHero: h, silent: true });
      }
    }
    if (ITEM_BY_ID[it.defId].proc === 'chain') {
      it.counter++;
      if (it.counter >= 4) {
        it.counter = 0;
        const near = g.units
          .filter(u => u.lane === team.id && u.hp > 0 && u.id !== target.id && dist(u.pos, target.pos) < 260)
          .sort((a, b) => dist(a.pos, target.pos) - dist(b.pos, target.pos))
          .slice(0, 3);
        const hit: Vec[] = [{ ...target.pos }];
        for (const u of near) {
          dmgUnit(g, u, 65 + h.level * 3, 'magic', team.id, { fromHero: h });
          hit.push({ ...u.pos });
        }
        emit(g, { t: 'proc', pos: { ...target.pos }, itemId: it.defId, targets: hit });
      }
    }
  }
}

function updateUnits(g: GameState, dt: number) {
  const t = g.t;
  const len = g.units.length; // raised skeletons spawned this frame act next frame
  for (let i = 0; i < len; i++) {
    const u = g.units[i];
    if (u.hp <= 0) continue;
    const def = UNIT_BY_ID[u.defId];
    const defender = g.teams[u.lane];
    const hero = defender.hero;
    u.bob += dt * 6;

    // dots
    for (let j = u.dots.length - 1; j >= 0; j--) {
      const d0 = u.dots[j];
      if (t >= d0.until) { u.dots.splice(j, 1); continue; }
      dmgUnit(g, u, d0.dps * dt, 'magic', u.lane, { silent: true });
      if (u.hp <= 0) break;
    }
    if (u.hp <= 0) continue;

    // auras recomputed cheaply
    u.dmgBuffPct = 0; u.spdBuffPct = 0;
    if (def.special === 'pack') {
      let packs = 0;
      for (const v of g.units) {
        if (v !== u && v.hp > 0 && v.defId === 'wolf' && v.lane === u.lane && v.owner === u.owner && dist(v.pos, u.pos) < 130) packs++;
      }
      u.dmgBuffPct += Math.min(15, packs * 3) / def.dmg;
    }
    for (const v of g.units) {
      if (v.hp > 0 && v !== u && v.defId === 'banner' && v.lane === u.lane && v.owner === u.owner && dist(v.pos, u.pos) < 185) {
        u.dmgBuffPct += 0.2; u.spdBuffPct += 0.15;
        break;
      }
    }

    const cc = t < u.ccUntil || t < u.airborneUntil;
    const feared = t < u.fearUntil;
    const confused = t < u.confuseUntil;
    const disarmed = t < u.disarmUntil;
    const blinded = t < u.missUntil;
    const slowMult = t < u.slowUntil ? 1 - u.slowPct : 1;
    const speed = def.speed * (1 + u.spdBuffPct) * slowMult;
    const dmgOut = def.dmg * (1 + u.dmgBuffPct);

    if (cc) continue;

    if (feared) {
      u.pos.y -= speed * 1.1 * dt;
      u.pos.y = Math.max(C.SPAWN_Y - 30, u.pos.y);
      continue;
    }

    if (confused) {
      // pollen madness: savage the nearest creature, friend or foe
      let tgt: UnitState | null = null;
      let bd = 220;
      for (const v of g.units) {
        if (v === u || v.hp <= 0 || v.lane !== u.lane) continue;
        const d0 = dist(v.pos, u.pos);
        if (d0 < bd) { bd = d0; tgt = v; }
      }
      if (tgt) {
        if (bd > def.range + 14) {
          const dx = tgt.pos.x - u.pos.x, dy = tgt.pos.y - u.pos.y;
          const l0 = Math.hypot(dx, dy) || 1;
          u.pos.x += (dx / l0) * speed * dt;
          u.pos.y += (dy / l0) * speed * dt;
        } else if (!disarmed && t >= u.attackReadyAt) {
          u.attackReadyAt = t + C.UNIT_ATK_PERIOD;
          if (!blinded) dmgUnit(g, tgt, dmgOut, 'phys', u.lane);
        }
        continue;
      }
    }

    // specials with timers
    if (def.special === 'healer' && t >= u.specialReadyAt) {
      u.specialReadyAt = t + 0.5;
      let worst: UnitState | null = null;
      for (const v of g.units) {
        if (v.hp <= 0 || v === u || v.lane !== u.lane || v.owner !== u.owner) continue;
        if (v.hp >= v.maxHp || dist(v.pos, u.pos) > 235) continue;
        if (!worst || v.hp / v.maxHp < worst.hp / worst.maxHp) worst = v;
      }
      if (worst) {
        worst.hp = Math.min(worst.maxHp, worst.hp + 13);
        emit(g, { t: 'impact', pos: { ...worst.pos }, r: 16, theme: { c1: '#9fe8b0', c2: '#cfc4e8' }, kind: 'heal' });
      }
    }
    if (def.special === 'wyvern' && t >= u.specialReadyAt && !hero.dead && dist(hero.pos, u.pos) < 330) {
      u.specialReadyAt = t + 2.5;
      dmgHero(g, defender, 70, 'magic', u);
      for (const s of g.summons) {
        if (s.owner === u.lane && dist(s.pos, hero.pos) < 100) dmgSummon(g, s, 70, u.owner);
      }
      emit(g, { t: 'impact', pos: { ...hero.pos }, r: 90, theme: { c1: '#c5ff7d', c2: '#2a4d33' }, kind: 'acid' });
    }
    if (def.special === 'avatar') {
      if (t >= u.specialReadyAt) {
        const heroNear = !hero.dead && dist(hero.pos, u.pos) < 170;
        const summonNear = g.summons.some(s => s.owner === u.lane && dist(s.pos, u.pos) < 170);
        if (heroNear || summonNear) {
          u.specialReadyAt = t + 6;
          emit(g, { t: 'impact', pos: { ...u.pos }, r: 170, theme: { c1: '#ff4d4d', c2: '#2b2030' }, kind: 'slam' });
          if (heroNear) {
            dmgHero(g, defender, 120, 'magic', u);
            hero.buffs.push({ id: 'avatarstun', until: t + 0.8, stun: true, theme: 'stun' });
          }
          for (const s of g.summons) {
            if (s.owner === u.lane && dist(s.pos, u.pos) < 170) dmgSummon(g, s, 120, u.owner);
          }
        }
      }
      if (!u.roared && u.hp < u.maxHp * 0.5) {
        u.roared = true;
        if (!hero.dead && dist(hero.pos, u.pos) < 420) {
          hero.buffs.push({ id: 'ruinfear', until: t + 1.0, fear: true, theme: 'fear' });
          hero.channel = null;
        }
        emit(g, { t: 'impact', pos: { ...u.pos }, r: 420, theme: { c1: '#ff4d4d', c2: '#13101a' }, kind: 'roar' });
      }
    }

    if (u.state === 'march') {
      // engage: decoys taunt, then summons/hero in reach
      let engaged = false;
      let tauntTarget: SummonState | null = null;
      for (const s of g.summons) {
        if (s.owner !== u.lane) continue;
        if (s.kind === 'decoy' && dist(s.pos, u.pos) < 210) { tauntTarget = s; break; }
      }
      const inAtkRange = (p: Vec, extra = 14) => dist(p, u.pos) <= def.range + extra;

      if (tauntTarget) {
        engaged = true;
        if (inAtkRange(tauntTarget.pos)) {
          if (!disarmed && t >= u.attackReadyAt) {
            u.attackReadyAt = t + C.UNIT_ATK_PERIOD;
            if (!blinded) dmgSummon(g, tauntTarget, dmgOut, u.owner);
          }
        } else {
          const dx = tauntTarget.pos.x - u.pos.x, dy = tauntTarget.pos.y - u.pos.y;
          const l0 = Math.hypot(dx, dy) || 1;
          u.pos.x += (dx / l0) * speed * dt;
          u.pos.y += (dy / l0) * speed * dt;
          continue;
        }
      } else {
        // summons block the road
        let blockTarget: SummonState | null = null;
        for (const s of g.summons) {
          if (s.owner === u.lane && s.kind !== 'decoy' && inAtkRange(s.pos, 10)) { blockTarget = s; break; }
        }
        if (blockTarget) {
          engaged = true;
          if (!disarmed && t >= u.attackReadyAt) {
            u.attackReadyAt = t + C.UNIT_ATK_PERIOD;
            if (!blinded) dmgSummon(g, blockTarget, dmgOut, u.owner);
          }
        } else if (!hero.dead && !disarmed && inAtkRange(hero.pos, def.special === 'harass' ? 0 : 14)) {
          engaged = def.special !== 'harass'; // harpies strafe at full speed
          if (t >= u.attackReadyAt) {
            u.attackReadyAt = t + C.UNIT_ATK_PERIOD;
            if (!blinded) {
              dmgHero(g, defender, dmgOut, 'phys', u);
              if (def.special === 'harass') emit(g, { t: 'impact', pos: { ...hero.pos }, r: 22, theme: { c1: '#b58ad1', c2: '#5d3a70' }, kind: 'claw' });
            }
          }
        }
      }

      // march on
      const moveMult = engaged ? C.UNIT_ENGAGE_SLOW : 1;
      u.pos.y += speed * moveMult * dt;
      // mild lane funneling toward castle gate
      const cx = laneCenterX(u.lane);
      if (u.pos.y > C.CASTLE_Y - 220) u.pos.x += (cx - u.pos.x) * 0.35 * dt;

      if (u.pos.y >= C.CASTLE_Y - 22) {
        u.pos.y = C.CASTLE_Y - 22;
        u.state = 'castle';
        defender.stats.leaks++;
      }
    } else {
      // hammering the gate
      if (!disarmed && !blinded && t >= u.attackReadyAt) {
        u.attackReadyAt = t + C.UNIT_ATK_PERIOD;
        let mult = def.special === 'siege' ? 3.5 : 1;
        mult *= C.CASTLE_DMG_BASE + C.TWILIGHT_CASTLE_DMG * g.twilightLevel; // siege wins wars; twilight makes walls brittle
        dmgCastle(g, defender, dmgOut * mult, u.owner);
        if (def.special === 'cutpurse') {
          const steal = Math.min(2, defender.gold);
          defender.gold -= steal;
          g.teams[u.owner].gold += steal;
        }
      }
    }
  }
}

function updateSummons(g: GameState, dt: number) {
  const t = g.t;
  for (const s of g.summons) {
    if (s.hp <= 0 || t >= s.until) continue;
    if (s.kind === 'decoy') continue;
    // hunt nearest invader in our lane
    let tgt: UnitState | null = null;
    let bd = Infinity;
    for (const u of g.units) {
      if (u.lane !== s.owner || u.hp <= 0) continue;
      const d0 = dist(u.pos, s.pos);
      if (d0 < bd) { bd = d0; tgt = u; }
    }
    if (!tgt) continue;
    if (bd > s.range) {
      if (s.speed > 0 && bd < 650) {
        const dx = tgt.pos.x - s.pos.x, dy = tgt.pos.y - s.pos.y;
        const l0 = Math.hypot(dx, dy) || 1;
        s.pos.x += (dx / l0) * s.speed * dt;
        s.pos.y += (dy / l0) * s.speed * dt;
      }
    } else if (t >= s.attackReadyAt) {
      s.attackReadyAt = t + (s.kind === 'snapper' ? 1.1 : 0.9);
      dmgUnit(g, tgt, s.dmg, 'phys', s.owner);
      if (s.kind === 'snapper') emit(g, { t: 'impact', pos: { ...tgt.pos }, r: 30, theme: s.theme as any, kind: 'chomp' });
    }
  }
}

function updateProjectiles(g: GameState, dt: number) {
  const t = g.t;
  for (const pr of g.projectiles) {
    if (pr.maxDist <= -1) continue; // tombstoned
    const hero = g.teams[pr.owner].hero;

    if (pr.boomerang === 1 && dist(pr.pos, pr.origin) >= pr.maxDist) {
      pr.boomerang = 2;
      pr.hitIds.length = 0; // bites again on the way home
    }
    if (pr.boomerang === 2) {
      const dx = hero.pos.x - pr.pos.x, dy = hero.pos.y - pr.pos.y;
      const l0 = Math.hypot(dx, dy);
      if (l0 < 34 || hero.dead) { pr.maxDist = -2; continue; }
      const sp = Math.hypot(pr.vel.x, pr.vel.y) || 1;
      pr.vel.x = (dx / l0) * sp;
      pr.vel.y = (dy / l0) * sp;
    }
    if (pr.targetUnit >= 0) {
      const tu = g.units.find(u => u.id === pr.targetUnit && u.hp > 0);
      if (tu) {
        const dx = tu.pos.x - pr.pos.x, dy = tu.pos.y - pr.pos.y;
        const l0 = Math.hypot(dx, dy) || 1;
        const sp = Math.hypot(pr.vel.x, pr.vel.y);
        pr.vel.x = (dx / l0) * sp;
        pr.vel.y = (dy / l0) * sp;
      }
    }
    pr.pos.x += pr.vel.x * dt;
    pr.pos.y += pr.vel.y * dt;
    if (pr.boomerang === 0 && dist(pr.pos, pr.origin) > pr.maxDist) { pr.maxDist = -2; continue; }
    if (pr.pos.y < 40 || pr.pos.y > C.H - 20) { pr.maxDist = -2; continue; }

    for (const u of g.units) {
      if (u.lane !== pr.owner || u.hp <= 0 || pr.hitIds.includes(u.id)) continue;
      if (dist(u.pos, pr.pos) > pr.r + 15) continue;
      pr.hitIds.push(u.id);
      dmgUnit(g, u, pr.dmg, pr.kind, pr.owner, { fromHero: hero, isAbility: pr.kind === 'magic' });
      if (pr.slowPct && u.hp > 0) applySlow(u, pr.slowPct, pr.slowDur, t);
      if (pr.dotDps && u.hp > 0) addDot(u, pr.dotDps, pr.dotDur, t);
      if (pr.knock && u.hp > 0) {
        const sp = Math.hypot(pr.vel.x, pr.vel.y) || 1;
        u.pos.x += (pr.vel.x / sp) * pr.knock;
        u.pos.y += (pr.vel.y / sp) * pr.knock;
      }
      if (pr.dragX && u.hp > 0) {
        const dirx = hero.pos.x - u.pos.x, diry = hero.pos.y - u.pos.y;
        const l0 = Math.hypot(dirx, diry) || 1;
        u.pos.x += (dirx / l0) * pr.dragX;
        u.pos.y += (diry / l0) * pr.dragX;
      }
      if (pr.explodeR > 0) {
        for (const v of g.units) {
          if (v.lane !== pr.owner || v.hp <= 0 || v.id === u.id) continue;
          if (dist(v.pos, u.pos) <= pr.explodeR) dmgUnit(g, v, pr.explodeDmg, 'magic', pr.owner, { fromHero: hero, isAbility: true });
        }
        emit(g, { t: 'impact', pos: { ...u.pos }, r: pr.explodeR, theme: pr.theme, kind: 'burst' });
      }
      if (!pr.pierce && (pr.boomerang as number) === 0) { pr.maxDist = -2; break; }
    }
  }
  g.projectiles = g.projectiles.filter(p => p.maxDist > -1);
}

function updateZones(g: GameState, dt: number) {
  const t = g.t;
  for (const z of g.zones) {
    if (t >= z.until) {
      // death rattles
      if (z.kind === 'collapse') {
        for (const u of g.units) {
          if (u.lane === z.owner && u.hp > 0 && dist(u.pos, z.pos) <= z.r) {
            dmgUnit(g, u, z.p.dmg, 'magic', z.owner);
          }
        }
        emit(g, { t: 'impact', pos: { ...z.pos }, r: z.r, theme: z.theme, kind: 'collapse' });
      }
      if (z.kind === 'anvil') {
        // the sky delivers
        for (const u of g.units) {
          if (u.lane === z.owner && u.hp > 0 && dist(u.pos, z.pos) <= z.r) {
            dmgUnit(g, u, z.p.dmg, 'magic', z.owner);
            if (u.hp > 0 && z.p.stun) u.ccUntil = Math.max(u.ccUntil, g.t + z.p.stun);
          }
        }
        emit(g, { t: 'impact', pos: { ...z.pos }, r: z.r, theme: z.theme, kind: 'anvilhit' });
        if (z.p.fieldDur) {
          makeZone(g, z.owner, 'gravity', { ...z.pos }, z.r * 0.95, z.p.fieldDur, { slow: z.p.fieldSlow ?? 0.3, dps: z.p.fieldDps ?? 0 }, z.theme);
        }
      }
      if (z.kind === 'blackhole' && z.p.burst) {
        for (const u of g.units) {
          if (u.lane === z.owner && u.hp > 0 && dist(u.pos, z.pos) <= z.r * 1.2) {
            dmgUnit(g, u, z.p.burst, 'magic', z.owner);
          }
        }
        emit(g, { t: 'impact', pos: { ...z.pos }, r: z.r * 1.2, theme: z.theme, kind: 'collapse' });
      }
      continue;
    }

    if (z.kind === 'tempest') {
      const aim = g.teams[z.owner].input.aim;
      const dx = aim.x - z.pos.x, dy = aim.y - z.pos.y;
      const l0 = Math.hypot(dx, dy);
      if (l0 > 8) {
        z.pos.x += (dx / l0) * z.p.drift * dt;
        z.pos.y += (dy / l0) * z.p.drift * dt;
        const L = laneOf(z.owner);
        z.pos.x = clamp(z.pos.x, L.x0 + 20, L.x1 - 20);
        z.pos.y = clamp(z.pos.y, C.SPAWN_Y, C.CASTLE_Y);
      }
    }
    if (z.kind === 'beamfire' || z.kind === 'rattide') {
      const progress = clamp((t - z.born) / z.p.dur, 0, 1);
      z.pos.y = C.SPAWN_Y + (C.CASTLE_Y - 60 - C.SPAWN_Y) * progress;
    }

    // continuous effects
    for (const u of g.units) {
      if (u.lane !== z.owner || u.hp <= 0) continue;
      const def = UNIT_BY_ID[u.defId];
      let inside = false;
      if (z.kind === 'wall') {
        inside = Math.abs(u.pos.y - z.pos.y) < 30 && Math.abs(u.pos.x - z.pos.x) < z.p.len / 2;
        if (inside && def.flying) inside = false; // the gale parts for wings
      } else if (z.kind === 'beamfire' || z.kind === 'rattide') {
        inside = Math.abs(u.pos.y - z.pos.y) < z.p.width;
      } else {
        inside = dist(u.pos, z.pos) <= z.r;
      }
      if (!inside) continue;
      if (z.p.dps) dmgUnit(g, u, z.p.dps * dt, 'magic', z.owner, { silent: true });
      if (u.hp <= 0) continue;
      if (z.p.slow) applySlow(u, z.p.slow, 0.3, t);
      if (z.p.blind) u.missUntil = Math.max(u.missUntil, t + 0.4);
      if (z.p.pull) {
        const dx = z.pos.x - u.pos.x, dy = z.pos.y - u.pos.y;
        const l0 = Math.hypot(dx, dy) || 1;
        const pull = Math.min(z.p.pull * dt, l0);
        u.pos.x += (dx / l0) * pull;
        u.pos.y += (dy / l0) * pull;
      }
      if ((z.kind === 'beamfire' || z.kind === 'rattide') && z.p.igniteDps) addDot(u, z.p.igniteDps, z.p.igniteDur, t);
    }

    // one-shot applications
    if (!z.applied) {
      if (z.kind === 'root') {
        z.applied = true;
        for (const u of g.units) {
          if (u.lane === z.owner && u.hp > 0 && dist(u.pos, z.pos) <= z.r) {
            u.ccUntil = Math.max(u.ccUntil, t + z.p.root);
          }
        }
      } else if (z.kind === 'pollen') {
        z.applied = true;
        for (const u of g.units) {
          if (u.lane === z.owner && u.hp > 0 && dist(u.pos, z.pos) <= z.r) {
            u.confuseUntil = Math.max(u.confuseUntil, t + z.p.confuse);
          }
        }
      }
    }

    // ticking specials
    if (z.kind === 'starfall' && t >= z.nextTick) {
      z.nextTick = t + z.p.interval;
      z.p.i = (z.p.i ?? 0) + 1;
      let ip: Vec | null = null;
      if (z.p.smart) {
        // the sky picks its own targets: the costliest monster anywhere in the lane
        let best: UnitState | null = null;
        for (const u of g.units) {
          if (u.lane !== z.owner || u.hp <= 0) continue;
          if (!best || UNIT_BY_ID[u.defId].cost > UNIT_BY_ID[best.defId].cost) best = u;
        }
        if (best) ip = { ...best.pos };
      } else if (z.p.sweep) {
        // pillars march down the lane in order
        const L = laneOf(z.owner);
        const frac = (z.p.i - 1) / Math.max(1, (z.p.count ?? 8) - 1);
        ip = {
          x: laneCenterX(z.owner) + ((z.p.i % 2) ? -1 : 1) * (L.x1 - L.x0) * 0.17,
          y: C.SPAWN_Y + 50 + (C.CASTLE_Y - 130 - C.SPAWN_Y) * frac,
        };
      } else {
        const a = g.rng() * Math.PI * 2;
        const rr = Math.sqrt(g.rng()) * z.r;
        ip = { x: z.pos.x + Math.cos(a) * rr, y: z.pos.y + Math.sin(a) * rr };
      }
      if (ip) {
        const hitR = z.p.hitR ?? 78;
        for (const u of g.units) {
          if (u.lane === z.owner && u.hp > 0 && dist(u.pos, ip) <= hitR) {
            dmgUnit(g, u, z.p.dmg, 'magic', z.owner);
            if (u.hp > 0 && z.p.slow) applySlow(u, z.p.slow, z.p.slowDur, t);
            if (u.hp > 0 && z.p.stun) u.ccUntil = Math.max(u.ccUntil, t + z.p.stun);
          }
        }
        const kind = z.theme.shape === 'bolt' ? 'bolt' : z.theme.shape === 'pillar' ? 'pillar' : 'star';
        emit(g, { t: 'impact', pos: ip, r: hitR, theme: z.theme, kind });
      }
    }
    if (z.kind === 'banner') {
      const team = g.teams[z.owner];
      const h = team.hero;
      if (!h.dead && dist(h.pos, z.pos) <= z.r) {
        const ex = h.buffs.find(b => b.id === 'bannerarmor');
        if (ex) ex.until = t + 0.4;
        else { h.buffs.push({ id: 'bannerarmor', until: t + 0.4, armor: z.p.armor, theme: 'banner' }); h.d = computeDerived(h); }
      }
    }
    if (z.kind === 'sanctify') {
      const h = g.teams[z.owner].hero;
      if (!h.dead && dist(h.pos, z.pos) <= z.r) healHero(h, z.p.heal * dt);
    }
  }
  g.zones = g.zones.filter(z => t < z.until);
}

function updateCastles(g: GameState) {
  const t = g.t;
  for (const team of g.teams) {
    team.lastStand = team.castleHp / team.castleMaxHp < C.LASTSTAND_PCT;
    const cp = castlePos(team.id);
    if (t >= team.castleShotAt) {
      let tgt: UnitState | null = null;
      let bestY = -1;
      for (const u of g.units) {
        if (u.lane !== team.id || u.hp <= 0) continue;
        if (u.pos.y < C.CASTLE_Y - C.CASTLE_RANGE) continue;
        if (u.pos.y > bestY) { bestY = u.pos.y; tgt = u; }
      }
      if (tgt) {
        team.castleShotAt = t + C.CASTLE_SHOT_PERIOD;
        const dps = C.CASTLE_DPS[team.baseLevel];
        emit(g, { t: 'castleShot', team: team.id, from: { x: cp.x, y: cp.y - 70 }, to: { ...tgt.pos } });
        dmgUnit(g, tgt, dps * C.CASTLE_SHOT_PERIOD, 'phys', team.id);
      }
    }
    if (team.lastStand && t >= team.volleyAt) {
      team.volleyAt = t + C.VOLLEY_PERIOD;
      let any = false;
      for (const u of g.units) {
        if (u.lane === team.id && u.hp > 0 && u.pos.y > C.VOLLEY_Y) {
          dmgUnit(g, u, C.VOLLEY_DMG, 'magic', team.id);
          any = true;
        }
      }
      if (any) emit(g, { t: 'volley', team: team.id });
    }
  }
}

function updateEconomy(g: GameState, dt: number) {
  for (const team of g.teams) {
    team.gold += C.GOLD_DRIP * dt;
  }
  if (g.t >= g.nextIncomeAt) {
    g.nextIncomeAt += C.INCOME_PERIOD;
    for (const team of g.teams) {
      const amt = Math.round(team.income * (team.underdog ? C.UNDERDOG_INCOME : 1));
      team.gold += amt;
      team.stats.goldEarned += amt;
      emit(g, { t: 'income', team: team.id, amount: amt });
    }
  }
  if (g.t >= g.nextTwilightAt) {
    g.nextTwilightAt += C.TWILIGHT_PERIOD;
    g.twilightLevel++;
    if (g.twilightLevel <= C.TWILIGHT_INCOME_CAP) {
      for (const team of g.teams) {
        team.income = Math.round(team.income * C.TWILIGHT_INCOME);
      }
    }
    emit(g, { t: 'twilight', level: g.twilightLevel });
  }
  // underdog favor with hysteresis
  const pct0 = g.teams[0].castleHp / g.teams[0].castleMaxHp;
  const pct1 = g.teams[1].castleHp / g.teams[1].castleMaxHp;
  for (const team of g.teams) {
    const mine = team.id === 0 ? pct0 : pct1;
    const theirs = team.id === 0 ? pct1 : pct0;
    if (!team.underdog && mine + C.UNDERDOG_GAP_ON <= theirs) {
      team.underdog = true;
      emit(g, { t: 'underdog', team: team.id, on: true });
    } else if (team.underdog && mine + C.UNDERDOG_GAP_OFF >= theirs) {
      team.underdog = false;
      emit(g, { t: 'underdog', team: team.id, on: false });
    }
  }
}

function updateSpawns(g: GameState) {
  for (const team of g.teams) {
    if (team.sendQueue.length === 0) continue;
    if (g.t < team.nextSpawnAt) continue;
    const defId = team.sendQueue.shift()!;
    spawnUnit(g, defId, team.id, null);
    const gate = Math.max(C.TWILIGHT_GATE_MIN, Math.pow(C.TWILIGHT_GATE, g.twilightLevel));
    team.nextSpawnAt = g.t + C.SPAWN_INTERVAL[team.baseLevel] * gate;
  }
}

// ---------------------------------------------------------------------- step

export function step(g: GameState, dt: number) {
  if (g.over) return;
  g.t += dt;
  updateEconomy(g, dt);
  updateSpawns(g);
  updateHero(g, g.teams[0], dt);
  updateHero(g, g.teams[1], dt);
  updateUnits(g, dt);
  updateSummons(g, dt);
  updateProjectiles(g, dt);
  updateZones(g, dt);
  updateCastles(g);
  // sweep the dead
  if (g.units.length > 0) g.units = g.units.filter(u => u.hp > 0);
  g.summons = g.summons.filter(s => s.hp > 0 && g.t < s.until);
}

// -------------------------------------------------------------- random picks

export function randomHeroPair(rng: () => number): [string, string] {
  const a = HEROES[Math.floor(rng() * HEROES.length)].id;
  let b = HEROES[Math.floor(rng() * HEROES.length)].id;
  // mirror matches allowed but rerolled once for variety
  if (b === a) b = HEROES[Math.floor(rng() * HEROES.length)].id;
  return [a, b];
}
