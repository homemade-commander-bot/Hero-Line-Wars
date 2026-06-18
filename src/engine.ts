// ---------------------------------------------------------------------------
// Pure simulation engine. No DOM, no audio, no canvas — main.ts (browser)
// and sim.ts (node, balance testing) both drive this through step().
// v0.3: teams are made of PLAYERS — each commander (human or AI) owns a
// hero, a wallet, an income, a barracks tier and a send gate. Castles are
// shared by the team. 1v1 and 3v3 run on the same code.
// ---------------------------------------------------------------------------

import type {
  AbilityDef, Buff, GameEvent, GameState, HeroDerived, HeroState,
  PlayerState, SummonState, TeamId, TeamState, TowerState, UnitState, Vec, Zone, ZoneKind,
} from './types';
import { C, DIFFICULTY, armorReduction, castlePos, clampToArena, fountainPos, laneCenterX, laneOf, mulberry32, xpNeed } from './data/constants';
import { ABILITY_BY_ID, HERO_BY_ID, HEROES } from './data/heroes';
import { UNIT_BY_ID, bounty } from './data/units';
import { FORGED_ITEMS, ITEM_BY_ID, itemWorth } from './data/items';
import { flowDir, invalidateFlow } from './flowfield';

// ------------------------------------------------------------------ helpers

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function heroDef(h: HeroState) {
  return HERO_BY_ID[h.defId];
}
export function abilityOf(h: HeroState, slot: number): AbilityDef {
  return ABILITY_BY_ID[h.loadout[slot]];
}
export function allPlayers(g: GameState): PlayerState[] {
  return [...g.teams[0].players, ...g.teams[1].players];
}
export function playerById(g: GameState, id: number): PlayerState {
  return allPlayers(g).find(p => p.id === id)!;
}
export function livingHeroes(g: GameState, team: TeamId): HeroState[] {
  return g.teams[team].players.filter(p => !p.hero.dead).map(p => p.hero);
}
function nearestHero(g: GameState, team: TeamId, pos: Vec): HeroState | null {
  let best: HeroState | null = null;
  let bd = Infinity;
  for (const p of g.teams[team].players) {
    if (p.hero.dead) continue;
    const d0 = dist(p.hero.pos, pos);
    if (d0 < bd) { bd = d0; best = p.hero; }
  }
  return best;
}

function hasTower(g: GameState, lane: TeamId): boolean {
  for (const tw of g.towers) if (tw.lane === lane) return true;
  return false;
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
  teamSize: 1 | 3;
  heroIds: string[]; // length teamSize*2 — team 0 players first, then team 1
  loadouts: string[][]; // 3 ability ids each, same order
  humanPlayer: number; // global player index, or -1 for all-AI spectate
  difficulty: import('./data/constants').Difficulty | [import('./data/constants').Difficulty, import('./data/constants').Difficulty];
  seed?: number;
}

export function randomLoadout(heroId: string, rng: () => number): string[] {
  const def = HERO_BY_ID[heroId];
  return def.slots.map(opts => opts[Math.floor(rng() * opts.length)].id);
}

/** Draw `count` distinct heroes. */
export function randomHeroes(rng: () => number, count: number): string[] {
  const pool = HEROES.map(h => h.id);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

const ALLY_NAMES = ['Aldric', 'Berenice', 'Caspar', 'Drusilla', 'Edmund', 'Fenna'];

function newHero(team: TeamId, playerId: number, heroId: string, loadout: string[]): HeroState {
  const def = HERO_BY_ID[heroId];
  const fp = fountainPos(team);
  const h: HeroState = {
    defId: heroId,
    team,
    player: playerId,
    pos: { x: fp.x, y: fp.y - 60 },
    facing: team === 0 ? 1 : -1,
    level: 1,
    xp: 0,
    ranks: [0, 0, 0, 0],
    skillPoints: 1, // a point at level 1 to learn a first ability
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

function newPlayer(
  id: number, team: TeamId, slot: number, heroId: string, loadout: string[],
  human: boolean, diff: import('./data/constants').Difficulty,
): PlayerState {
  const d = DIFFICULTY[diff];
  return {
    id,
    team,
    name: human ? 'You' : ALLY_NAMES[(id * 2 + slot) % ALLY_NAMES.length],
    human,
    gold: C.START_GOLD,
    income: C.START_INCOME,
    baseLevel: 1,
    sendQueue: [],
    nextSpawnAt: 0,
    statUp: { str: 0, agi: 0, int: 0, dmg: 0, armor: 0 },
    repairReadyAt: 0,
    repairCount: 0,
    hero: newHero(team, id, heroId, loadout),
    input: { move: { x: 0, y: 0 }, moveTo: null, aim: { x: laneCenterX(team), y: 450 }, cast: [false, false, false, false], useItem: [false, false, false, false, false, false] },
    ai: human ? null : {
      nextThinkAt: 1 + id * 0.21,
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
    },
    stats: { kills: 0, sent: 0, goldEarned: 0, dmgToCastle: 0, incomeGained: 0, leaks: 0, peakIncome: C.START_INCOME },
  };
}

export function newGame(opts: NewGameOpts): GameState {
  const rng = mulberry32(opts.seed ?? ((Math.random() * 2 ** 31) | 0));
  const n = opts.teamSize;
  const castleHp = Math.round(C.CASTLE_HP * (1 + C.CASTLE_HP_PER_ALLY * (n - 1)));
  const teams: [TeamState, TeamState] = [0, 1].map(tid => ({
    id: tid as TeamId,
    name: tid === 0 ? 'Dawnhold' : 'Duskreach',
    castleHp,
    castleMaxHp: castleHp,
    castleShotAt: 0,
    volleyAt: 0,
    maxKeep: 1 as const,
    underdog: false,
    lastStand: false,
    forgeMastery: 0,
    forgeComplete: false,
    players: [],
  })) as [TeamState, TeamState];

  let pid = 0;
  for (const tid of [0, 1] as TeamId[]) {
    const diff = Array.isArray(opts.difficulty) ? opts.difficulty[tid] : opts.difficulty;
    for (let s = 0; s < n; s++) {
      const idx = tid * n + s;
      teams[tid].players.push(newPlayer(
        pid, tid, s, opts.heroIds[idx], opts.loadouts[idx],
        pid === opts.humanPlayer, diff,
      ));
      pid++;
    }
  }

  return {
    t: 0,
    over: false,
    winner: -1,
    teams,
    units: [],
    projectiles: [],
    zones: [],
    summons: [],
    towers: [],
    runes: [],
    towerVersion: [0, 0],
    nextWildAt: [12, 14],
    nextRuneAt: C.RUNE_PERIOD,
    clashPhase: 'none',
    clashUntil: 0,
    nextClashAt: C.CLASH_FIRST,
    clashScore: [0, 0],
    clashNum: 0,
    bossPhase: 'none',
    bossUntil: 0,
    nextBossAt: C.BOSS_FIRST,
    bossNum: 0,
    bossLane: -1,
    bossId: -1,
    nextIncomeAt: C.INCOME_PERIOD,
    twilightLevel: 0,
    nextTwilightAt: C.TWILIGHT_AT,
    events: [],
    nextId: 1,
    rng,
    discovered: [[], []],
  };
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
    ms: def.ms * C.HERO_MS_MULT * (1 + itemMs + bMsPct),
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
  silent?: boolean;
  noBounty?: boolean;
  fromHero?: HeroState; // lifesteal / ignite / kill attribution
  isAbility?: boolean;
  killerPlayer?: number; // attribution when no hero ref (zones, summons)
  bountyMult?: number; // towers pay reduced bounty — great defense ≠ free riches
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
  if (g.teams[srcTeam].underdog) amount *= C.UNDERDOG_DMG;
  u.hp -= amount;
  if (o.fromHero) {
    if (o.fromHero.d.lifesteal > 0 && kind === 'phys') healHero(o.fromHero, amount * o.fromHero.d.lifesteal);
    if (o.isAbility) {
      for (const it of o.fromHero.items) {
        if (it && ITEM_BY_ID[it.defId].proc === 'ignite') { addDot(u, 12, 3, g.t); break; }
      }
    }
  }
  if (!o.silent) emit(g, { t: 'dmg', pos: { ...u.pos }, amount, kind, target: 'unit', team: srcTeam });
  if (u.hp <= 0) {
    u.hp = -1e9;
    killUnit(g, u, srcTeam, o.noBounty ?? false, o.fromHero, o.killerPlayer, o.bountyMult ?? 1);
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

function killUnit(g: GameState, u: UnitState, killerTeam: TeamId, noBounty: boolean, killerHero?: HeroState, killerPlayerId?: number, bountyMult = 1) {
  const def = UNIT_BY_ID[u.defId];
  const defTeam = g.teams[u.lane];
  // The Siege boss has its own death: scaled bounty, no horde recycling
  if (def.special === 'boss') { slayBoss(g, u, defTeam, killerHero, killerPlayerId); return; }
  // resolve the earner: the killing hero's owner, else explicit, else a random defender
  let earner: PlayerState;
  if (killerHero && killerHero.team === u.lane) earner = playerById(g, killerHero.player);
  else if (killerPlayerId !== undefined) earner = playerById(g, killerPlayerId);
  else earner = defTeam.players[Math.floor(g.rng() * defTeam.players.length)];

  // Archmage's Folio: every death is a footnote
  if (killerHero && !killerHero.dead) {
    for (const it of killerHero.items) {
      if (it && ITEM_BY_ID[it.defId].proc === 'manaleech') {
        killerHero.mana = Math.min(killerHero.d.maxMana, killerHero.mana + 6);
        break;
      }
    }
  }

  if (!noBounty) {
    const b = Math.round(bounty(def, u.raised) * bountyMult);
    earner.gold += b;
    earner.stats.goldEarned += b;
    earner.stats.kills += 1;
    const xp = b * C.XP_PCT;
    for (const p of defTeam.players) {
      if (p.hero.dead) continue;
      // full xp to the killer's hero, assist xp to lane-mates
      addXp(g, p.hero, p === earner ? xp : xp * 0.5);
    }
    emit(g, { t: 'gold', team: defTeam.id, amount: b, pos: { ...u.pos }, player: earner.id });
  }
  emit(g, { t: 'death', pos: { ...u.pos }, defId: u.defId, tier: def.tier, lane: u.lane });

  // Imp Saboteur: death detonation hits defending heroes & their summons
  if (def.special === 'explode') {
    for (const p of defTeam.players) {
      if (!p.hero.dead && dist(p.hero.pos, u.pos) < 95) dmgHero(g, p.hero, 90, 'magic');
    }
    for (const s of g.summons) {
      if (s.owner === u.lane && dist(s.pos, u.pos) < 95) dmgSummon(g, s, 90, u.owner);
    }
    emit(g, { t: 'impact', pos: { ...u.pos }, r: 95, theme: { c1: '#ff5e2b', c2: '#ffb347' }, kind: 'explode' });
  }
  // Plaguemonger: rot is contagious
  const plagueHero = defTeam.players.map(p => p.hero).find(h => !h.dead && h.buffs.some(b => b.plagueSpread));
  if (u.dots.length > 0 && plagueHero) {
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
      const nx = g.units[i];
      if (nx.hp > 0 && nx.defId === 'necro' && nx.owner === u.owner && nx.lane === u.lane &&
        nx.raisedCount < 8 && dist(nx.pos, u.pos) < 220) {
        nx.raisedCount++;
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

export function dmgHero(g: GameState, h: HeroState, raw: number, kind: 'phys' | 'magic', srcUnit?: UnitState, attacker?: HeroState): void {
  if (h.dead || g.over) return;
  const player = playerById(g, h.player);
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
  for (const b of h.buffs) {
    if (b.shield && b.shield > 0 && amount > 0) {
      const soak = Math.min(b.shield, amount);
      b.shield -= soak;
      amount -= soak;
    }
  }
  if (srcUnit) {
    let reflect = 0;
    for (const b of h.buffs) reflect += b.reflect ?? 0;
    if (reflect > 0) dmgUnit(g, srcUnit, raw * reflect, 'magic', h.team, { silent: true, killerPlayer: h.player });
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
  emit(g, { t: 'dmg', pos: { ...h.pos }, amount, kind, target: 'hero', team: h.team });
  if (h.hp <= 0) {
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
    player.input.moveTo = null;
    if (g.clashPhase === 'active') {
      // a knockout — scored, rewarded, no respawn until the clash ends
      h.respawnAt = Infinity;
      const koTeam = (attacker ? attacker.team : (1 - h.team)) as TeamId;
      g.clashScore[koTeam]++;
      if (attacker) {
        const ap = playerById(g, attacker.player);
        ap.gold += C.CLASH_KO_GOLD;
        ap.stats.goldEarned += C.CLASH_KO_GOLD;
      }
      emit(g, { t: 'clashKO', team: h.team, pos: { ...h.pos }, by: koTeam });
      return;
    }
    h.respawnAt = g.t + C.RESPAWN_BASE + C.RESPAWN_PER_LVL * h.level;
    const enemy = g.teams[1 - h.team];
    const reward = Math.round((C.HERO_KILL_GOLD + 12 * h.level) / enemy.players.length);
    for (const p of enemy.players) {
      p.gold += reward;
      p.stats.goldEarned += reward;
    }
    emit(g, { t: 'heroDeath', team: h.team, pos: { ...h.pos } });
    emit(g, { t: 'gold', team: enemy.id, amount: reward });
  }
}

function dmgSummon(g: GameState, s: SummonState, amount: number, srcTeam: TeamId) {
  s.hp -= amount;
  emit(g, { t: 'dmg', pos: { ...s.pos }, amount, kind: 'phys', target: 'summon', team: srcTeam });
}

export function dmgCastle(g: GameState, team: TeamState, amount: number, attackerPlayer: PlayerState) {
  if (g.over) return;
  team.castleHp -= amount;
  attackerPlayer.stats.dmgToCastle += amount;
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
    h.skillPoints++; // a skill point each level — spend it to rank up an ability
    h.d = computeDerived(h);
    healHero(h, h.d.maxHp * 0.15);
    h.mana = Math.min(h.d.maxMana, h.mana + h.d.maxMana * 0.15);
    emit(g, { t: 'levelup', team: h.team, level: h.level, pos: { ...h.pos }, player: h.player });
    need = xpNeed(h.level);
  }
}

// ------------------------------------------------------------------ economy

export function trySend(g: GameState, pl: PlayerState, defId: string, priceMult = 1): boolean {
  const def = UNIT_BY_ID[defId];
  if (!def || g.over) return false;
  if (pl.baseLevel < def.tier) {
    emit(g, { t: 'deny', team: pl.team, player: pl.id, msg: `Requires Keep ${'I'.repeat(def.tier)}` });
    return false;
  }
  if (pl.sendQueue.length >= C.QUEUE_CAP) {
    emit(g, { t: 'deny', team: pl.team, player: pl.id, msg: 'The gate is congested' });
    return false;
  }
  const cost = def.cost * priceMult;
  if (pl.gold < cost) {
    emit(g, { t: 'deny', team: pl.team, player: pl.id, msg: 'Not enough gold' });
    return false;
  }
  pl.gold -= cost;
  pl.income += def.income;
  pl.stats.incomeGained += def.income;
  pl.stats.sent++;
  pl.stats.peakIncome = Math.max(pl.stats.peakIncome, pl.income);
  pl.sendQueue.push(defId);
  emit(g, { t: 'send', team: pl.team, defId });
  return true;
}

/**
 * If `newId` is the last missing component of some forge the player can
 * otherwise complete, return that forge — so a full inventory can still buy
 * the piece that immediately collapses into the finished item.
 */
function completableForge(items: (import('./types').ItemState | null)[], newId: string): import('./data/items').ItemDef | null {
  for (const f of FORGED_ITEMS) {
    const comps = f.components ?? [];
    if (!comps.includes(newId)) continue;
    const pool = items.filter(Boolean).map(i => i!.defId);
    const need = [...comps];
    need.splice(need.indexOf(newId), 1); // the bought piece supplies one component
    let ok = true;
    for (const c of need) {
      const idx = pool.indexOf(c);
      if (idx === -1) { ok = false; break; }
      pool.splice(idx, 1);
    }
    if (ok) return f;
  }
  return null;
}

export function tryBuyItem(g: GameState, pl: PlayerState, itemId: string, priceMult = 1): boolean {
  const def = ITEM_BY_ID[itemId];
  if (!def || def.tier !== 'basic' || g.over) return false;
  const h = pl.hero;
  const cost = def.cost * priceMult;
  let slot = h.items.findIndex(s => s === null);

  if (slot === -1) {
    // inventory full — only allowed if this purchase finishes a forge outright
    const f = completableForge(h.items, itemId);
    if (!f) {
      emit(g, { t: 'deny', team: pl.team, player: pl.id, msg: 'Inventory is full' });
      return false;
    }
    if (pl.gold < cost) {
      emit(g, { t: 'deny', team: pl.team, player: pl.id, msg: 'Not enough gold' });
      return false;
    }
    pl.gold -= cost;
    // consume the other components, drop the finished item in the freed slot
    const need = (f.components ?? []).slice();
    need.splice(need.indexOf(itemId), 1);
    for (const c of need) {
      const i = h.items.findIndex(s => s !== null && s.defId === c);
      if (i >= 0) h.items[i] = null;
    }
    const free = h.items.findIndex(s => s === null);
    h.items[free] = { defId: f.id, readyAt: g.t + (f.proc === 'kingsguard' ? 10 : 0), counter: 0, used: false, boughtAt: g.t };
    if (!g.discovered[pl.team].includes(f.id)) { g.discovered[pl.team].push(f.id); checkForgeMastery(g, pl.team); }
    emit(g, { t: 'buy', team: pl.team, itemId });
    emit(g, { t: 'forge', team: pl.team, itemId: f.id, player: pl.id });
    autoForge(g, pl); // in case it cascades into a further forge
    h.d = computeDerived(h);
    return true;
  }

  if (pl.gold < cost) {
    emit(g, { t: 'deny', team: pl.team, player: pl.id, msg: 'Not enough gold' });
    return false;
  }
  pl.gold -= cost;
  h.items[slot] = { defId: itemId, readyAt: 0, counter: 0, used: false, boughtAt: g.t };
  emit(g, { t: 'buy', team: pl.team, itemId });
  autoForge(g, pl);
  h.d = computeDerived(h);
  return true;
}

/** Refund value for selling slot `slot`. Basics bought < UNDO_WINDOW ago refund fully. */
export function sellValue(g: GameState, pl: PlayerState, slot: number): { gold: number; undo: boolean } | null {
  const it = pl.hero.items[slot];
  if (!it) return null;
  const def = ITEM_BY_ID[it.defId];
  const worth = itemWorth(it.defId);
  const undo = def.tier === 'basic' && g.t - it.boughtAt < C.UNDO_WINDOW;
  return { gold: undo ? worth : Math.floor(worth * C.SELL_PCT), undo };
}

export function trySellItem(g: GameState, pl: PlayerState, slot: number): boolean {
  if (g.over) return false;
  const sv = sellValue(g, pl, slot);
  if (!sv) return false;
  const it = pl.hero.items[slot]!;
  pl.hero.items[slot] = null;
  pl.gold += sv.gold;
  emit(g, { t: 'sell', team: pl.team, player: pl.id, itemId: it.defId, refund: sv.gold });
  pl.hero.d = computeDerived(pl.hero);
  return true;
}

/** The forge acts unbidden: hold the right pieces and they become something else. */
function autoForge(g: GameState, pl: PlayerState) {
  const h = pl.hero;
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
        h.items[free] = { defId: f.id, readyAt: g.t + (f.proc === 'kingsguard' ? 10 : 0), counter: 0, used: false, boughtAt: g.t };
        if (!g.discovered[pl.team].includes(f.id)) { g.discovered[pl.team].push(f.id); checkForgeMastery(g, pl.team); }
        emit(g, { t: 'forge', team: pl.team, itemId: f.id, player: pl.id });
        changed = true;
      }
    }
  }
}

export function statCost(pl: PlayerState, key: keyof PlayerState['statUp']): number {
  const base = key === 'dmg' || key === 'armor' ? C.STAT_COST_DMG : C.STAT_COST;
  return Math.round(base * Math.pow(C.STAT_GROWTH, pl.statUp[key]));
}

export function tryBuyStat(g: GameState, pl: PlayerState, key: keyof PlayerState['statUp'], priceMult = 1): boolean {
  if (pl.statUp[key] >= C.STAT_CAP) {
    emit(g, { t: 'deny', team: pl.team, player: pl.id, msg: 'Training maxed' });
    return false;
  }
  const cost = statCost(pl, key) * priceMult;
  if (g.over || pl.gold < cost) {
    if (!g.over) emit(g, { t: 'deny', team: pl.team, player: pl.id, msg: 'Not enough gold' });
    return false;
  }
  pl.gold -= cost;
  pl.statUp[key]++;
  const h = pl.hero;
  if (key === 'dmg') h.bonus.dmg += C.DMG_GAIN;
  else if (key === 'armor') h.bonus.armor += C.ARMOR_GAIN;
  else h.bonus[key] += C.STAT_GAIN;
  h.d = computeDerived(h);
  return true;
}

export function tryUpgradeKeep(g: GameState, pl: PlayerState, priceMult = 1): boolean {
  if (pl.baseLevel >= 3 || g.over) return false;
  const target = (pl.baseLevel + 1) as 2 | 3;
  const cost = C.KEEP_COSTS[target] * priceMult;
  if (pl.gold < cost) {
    emit(g, { t: 'deny', team: pl.team, player: pl.id, msg: 'Not enough gold' });
    return false;
  }
  pl.gold -= cost;
  pl.baseLevel = target;
  const team = g.teams[pl.team];
  if (target > team.maxKeep) {
    // first commander to reach a tier raises the walls for everyone
    team.maxKeep = target;
    team.castleMaxHp += C.KEEP_HP_BONUS[target];
    team.castleHp = Math.min(team.castleMaxHp, team.castleHp + C.KEEP_HEAL[target]);
  }
  emit(g, { t: 'upgrade', team: pl.team, level: target });
  return true;
}

export function repairCost(pl: PlayerState): number {
  return Math.round(C.REPAIR_COST * Math.pow(C.REPAIR_GROWTH, pl.repairCount));
}

export function tryRepair(g: GameState, pl: PlayerState, priceMult = 1): boolean {
  if (g.over || g.t < pl.repairReadyAt) return false;
  const team = g.teams[pl.team];
  if (team.castleHp >= team.castleMaxHp) return false;
  const cost = repairCost(pl) * priceMult;
  if (pl.gold < cost) {
    emit(g, { t: 'deny', team: pl.team, player: pl.id, msg: 'Not enough gold' });
    return false;
  }
  pl.gold -= cost;
  pl.repairCount++;
  team.castleHp = Math.min(team.castleMaxHp, team.castleHp + C.REPAIR_AMOUNT);
  pl.repairReadyAt = g.t + C.REPAIR_CD;
  emit(g, { t: 'repair', team: pl.team });
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
  const hp0 = def.neutral ? def.hp : Math.round(def.hp * C.UNIT_HP_MULT);
  const u: UnitState = {
    id: g.nextId++,
    defId,
    lane,
    owner,
    pos: p,
    hp: hp0,
    maxHp: hp0,
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

function spawnSummon(g: GameState, owner: TeamId, ownerPlayer: number, kind: SummonState['kind'], pos: Vec, hp: number, dmg: number, range: number, speed: number, dur: number, theme: { c1: string; c2: string }): SummonState {
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
  s.player = ownerPlayer;
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

// rank → power multiplier (the player's investment on top of innate level scaling)
const BASIC_RANK_MULT = [0, 0.8, 0.95, 1.1, 1.25, 1.4];
const ULT_RANK_MULT = [0, 0.9, 1.1, 1.3];
const ULT_RANK_LEVEL = [6, 11, 16]; // hero level required for ult rank 1/2/3
export const MAX_BASIC_RANK = 5;
export const MAX_ULT_RANK = 3;

export function rankMult(slot: number, rank: number): number {
  if (slot === 3) return ULT_RANK_MULT[rank] ?? 0;
  return BASIC_RANK_MULT[rank] ?? 0;
}
export function canAlloc(h: HeroState, slot: number): boolean {
  if (h.skillPoints <= 0) return false;
  const rank = h.ranks[slot];
  if (slot === 3) return rank < MAX_ULT_RANK && h.level >= ULT_RANK_LEVEL[rank];
  return rank < MAX_BASIC_RANK;
}

export function allocSkill(g: GameState, pl: PlayerState, slot: number): boolean {
  const h = pl.hero;
  if (g.over || !canAlloc(h, slot)) return false;
  h.ranks[slot]++;
  h.skillPoints--;
  emit(g, { t: 'skillup', team: pl.team, player: pl.id, slot, rank: h.ranks[slot], pos: { ...h.pos } });
  return true;
}

function abilityDamage(ab: AbilityDef, h: HeroState): number {
  return ((ab.p.dmg ?? 0) + (ab.p.lvl ?? 0) * h.level) * h.d.spellAmp * rankMult(ab.slot, h.ranks[ab.slot]);
}

export function castAbility(g: GameState, pl: PlayerState, slot: number): boolean {
  const h = pl.hero;
  if (h.dead || g.over || h.channel || heroStunned(h) || heroFeared(h)) return false;
  const ab = abilityOf(h, slot);
  if (!ab) return false;
  if (h.ranks[slot] < 1) {
    emit(g, { t: 'deny', team: pl.team, player: pl.id, msg: slot === 3 ? `Learn your ultimate (skill point at level ${C.ULT_LEVEL})` : 'Spend a skill point to learn this ability' });
    return false;
  }
  if (g.t < h.cds[slot]) return false;
  if (h.mana < ab.mana) {
    emit(g, { t: 'deny', team: pl.team, player: pl.id, msg: 'Not enough mana' });
    return false;
  }
  // towers cost gold — a fortress competes with your war chest (checked before mana/cd spend)
  if (ab.kind === 'buildTower') {
    const gcost = ab.p.goldCost ?? 0;
    const isUlt = ab.id === 'citadel';
    const standing = g.towers.filter(tw => tw.player === pl.id && tw.kind !== 'citadel').length;
    if (!isUlt && standing >= C.TOWER_CAP) {
      emit(g, { t: 'deny', team: pl.team, player: pl.id, msg: 'Tower limit reached' });
      return false;
    }
    if (isUlt && g.towers.some(tw => tw.player === pl.id && tw.kind === 'citadel')) {
      emit(g, { t: 'deny', team: pl.team, player: pl.id, msg: 'Your Citadel already stands' });
      return false;
    }
    if (pl.gold < gcost) {
      emit(g, { t: 'deny', team: pl.team, player: pl.id, msg: `Need ${gcost}g to build` });
      return false;
    }
    pl.gold -= gcost;
  }
  const aim = clampToLane(pl.team, { ...pl.input.aim }, 24);
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
  for (let i = 0; i < times; i++) execAbility(g, pl, h, ab, aim);
  emit(g, { t: 'cast', team: pl.team, abId: ab.id, pos: { ...h.pos }, aim, ult: slot === 3 });
  return true;
}

function unitsInLane(g: GameState, lane: TeamId): UnitState[] {
  return g.units.filter(u => u.lane === lane && u.hp > 0);
}

function execAbility(g: GameState, pl: PlayerState, h: HeroState, ab: AbilityDef, aim: Vec) {
  const p = ab.p;
  const lane = pl.team;
  const rm = rankMult(ab.slot, h.ranks[ab.slot]); // rank investment scales the whole spell
  const dmg = abilityDamage(ab, h);
  const t = g.t;
  const inClash = clashActive(g);
  const clashFoes = (center: Vec, r: number) => inClash ? clashEnemyHeroes(g, pl.team, center, r) : [];
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
        dmgUnit(g, u, dmg * mult, 'magic', pl.team, { fromHero: h, isAbility: true });
      }
      for (const eh of clashFoes(h.pos, p.range)) {
        const ua = Math.atan2(eh.pos.y - h.pos.y, eh.pos.x - h.pos.x);
        let da = Math.abs(ua - angle); if (da > Math.PI) da = 2 * Math.PI - da;
        if (da <= p.arc / 2) hitHero(g, eh, dmg, 'magic', h);
      }
      emit(g, { t: 'impact', pos: { ...h.pos }, r: p.range, theme: ab.theme, kind: 'cone', ang: angle, arc: p.arc });
      break;
    }
    case 'targetStun': {
      if (inClash) {
        let foe: HeroState | null = null, bd = Infinity;
        for (const eh of clashEnemyHeroes(g, pl.team, h.pos, p.range)) { const d0 = dist(h.pos, eh.pos); if (d0 < bd) { bd = d0; foe = eh; } }
        if (foe) {
          heroStun(g, foe, p.stun);
          emit(g, { t: 'impact', pos: { ...foe.pos }, r: 50, theme: ab.theme, kind: 'smite', to: { ...h.pos } });
          hitHero(g, foe, dmg, 'magic', h);
        }
        break;
      }
      let best: UnitState | null = null;
      for (const u of foes()) {
        if (dist(h.pos, u.pos) > p.range) continue;
        if (!best || (p.strongest ? u.maxHp > best.maxHp : dist(h.pos, u.pos) < dist(h.pos, best.pos))) best = u;
      }
      if (best) {
        best.ccUntil = Math.max(best.ccUntil, t + p.stun);
        dmgUnit(g, best, dmg, 'magic', pl.team, { fromHero: h, isAbility: true });
        emit(g, { t: 'impact', pos: { ...best.pos }, r: 50, theme: ab.theme, kind: 'smite', to: { ...h.pos } });
      }
      break;
    }
    case 'nova': {
      for (const u of foes()) {
        const d0 = dist(h.pos, u.pos);
        if (d0 > p.r) continue;
        dmgUnit(g, u, dmg, 'magic', pl.team, { fromHero: h, isAbility: true });
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
      for (const eh of clashFoes(h.pos, p.r)) {
        hitHero(g, eh, dmg, 'magic', h);
        if (!eh.dead && (p.air || p.disarm)) heroStun(g, eh, (p.air || p.disarm)!);
      }
      emit(g, { t: 'impact', pos: { ...h.pos }, r: p.r, theme: ab.theme, kind: 'nova' });
      break;
    }
    case 'leapSlam': {
      const dx = aim.x - h.pos.x, dy = aim.y - h.pos.y;
      const len = Math.hypot(dx, dy) || 1;
      const reach = Math.min(len, p.dash);
      const from = { ...h.pos };
      const to = (inClash ? clampToArena : (q: Vec) => clampToLane(lane, q))({ x: h.pos.x + (dx / len) * reach, y: h.pos.y + (dy / len) * reach });
      h.pos = to;
      if (p.line) {
        for (const u of foes()) {
          const t0 = clamp(((u.pos.x - from.x) * (to.x - from.x) + (u.pos.y - from.y) * (to.y - from.y)) / (reach * reach || 1), 0, 1);
          const px = from.x + (to.x - from.x) * t0, py = from.y + (to.y - from.y) * t0;
          if (Math.hypot(u.pos.x - px, u.pos.y - py) <= p.width / 2 + 14) {
            const execute = p.execute && u.hp / u.maxHp < 0.35 ? 1 + p.execute : 1;
            dmgUnit(g, u, dmg * execute, 'magic', pl.team, { fromHero: h, isAbility: true });
          }
        }
        for (const eh of clashFoes(to, (p.width ?? 60) / 2 + 30)) hitHero(g, eh, dmg, 'magic', h);
        emit(g, { t: 'impact', pos: from, r: 0, theme: ab.theme, kind: 'dashline', to: { ...to } });
        emit(g, { t: 'impact', pos: { ...to }, r: 40, theme: ab.theme, kind: 'dashend' });
      } else {
        for (const u of foes()) {
          if (dist(to, u.pos) <= p.r) {
            dmgUnit(g, u, dmg, 'magic', pl.team, { fromHero: h, isAbility: true });
            if (p.stun && u.hp > 0) u.ccUntil = Math.max(u.ccUntil, t + p.stun);
          }
        }
        for (const eh of clashFoes(to, p.r)) { hitHero(g, eh, dmg, 'magic', h); if (!eh.dead && p.stun) heroStun(g, eh, p.stun); }
        if (p.zoneDps) {
          makeZone(g, pl, 'burn', { ...to }, p.zoneR, p.zoneDur, { dps: p.zoneDps * h.d.spellAmp }, ab.theme);
        }
        emit(g, { t: 'impact', pos: from, r: 0, theme: ab.theme, kind: 'dashline', to: { ...to } });
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
          owner: pl.team,
          pos: { ...h.pos },
          vel: { x: (dx / len) * p.speed, y: (dy / len) * p.speed },
          r: p.r,
          dmg,
          kind: 'magic',
          pierce: !!p.pierce,
          explodeR: p.explodeR ?? 0,
          explodeDmg: (p.explodeDmg ?? 0) * h.d.spellAmp * rm,
          dragX: p.drag ?? 0,
          slowPct: p.slow ?? 0,
          slowDur: p.slowDur ?? 0,
          dotDps: (p.dot ?? 0) * h.d.spellAmp * rm,
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
        healHero(h, ((p.heal ?? 0) + (p.healLvl ?? 0) * h.level) * rm + (p.healMissPct ?? 0) * missing);
      }
      if (p.manaGain) h.mana = Math.min(h.d.maxMana, h.mana + p.manaGain);
      if (p.dur && p.dur > 0) {
        const b: Buff = { id: ab.id, until: t + p.dur, theme: ab.id };
        if (p.shield) b.shield = (p.shield + (p.shieldLvl ?? 0) * h.level) * rm;
        if (p.reflect) b.reflect = p.reflect;
        if (p.asPct) b.asPct = p.asPct * rm;
        if (p.msPct) b.msPct = p.msPct * rm;
        if (p.dmgPct) b.dmgPct = p.dmgPct * rm;
        if (p.echoArrow) b.dmgPct = (b.dmgPct ?? 0) + p.echoArrow;
        if (p.dodge) b.dodge = p.dodge;
        if (p.armor) b.armor = p.armor;
        if (p.echo) b.echoSpell = true;
        if (p.spellAmp) b.spellAmp = p.spellAmp;
        if (p.blinkStrike) b.blinkStrike = true;
        if (p.plague) b.plagueSpread = true;
        if (p.lifesteal) b.lifesteal = p.lifesteal;
        if (p.auraDps) { b.auraDps = (p.auraDps + (p.auraLvl ?? 0) * h.level) * h.d.spellAmp * rm; b.auraR = p.auraR; }
        if (p.drainDps) { b.drainDps = (p.drainDps + (p.drainLvl ?? 0) * h.level) * h.d.spellAmp * rm; b.drainR = p.drainR; }
        h.buffs = h.buffs.filter(x => x.id !== ab.id);
        h.buffs.push(b);
        h.d = computeDerived(h);
      }
      emit(g, { t: 'impact', pos: { ...h.pos }, r: 30, theme: ab.theme, kind: 'blessing' });
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
        spawnSummon(g, lane, pl.id, kind, pos, (p.hp + h.level * 8) * rm, (p.dmg + h.level * 1.2) * rm, p.range, p.speed, p.dur, ab.theme);
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
        spawnSummon(g, lane, pl.id, 'decoy', from, p.decoyHp + h.level * 10, 0, 0, 0, p.decoyDur, ab.theme);
      }
      emit(g, { t: 'impact', pos: from, r: 30, theme: ab.theme, kind: 'blink', to: { ...h.pos } });
      break;
    }
    case 'wall': {
      makeZone(g, pl, 'wall', { ...aim }, p.len / 2, p.dur, { slow: p.slow, dps: p.dps * h.d.spellAmp * rm, len: p.len }, ab.theme);
      break;
    }
    case 'zone': {
      let kind: ZoneKind = 'gravity';
      const zp: Record<string, number> = {};
      if (p.root) { kind = 'root'; zp.root = p.root; zp.dps = (p.dps ?? 0) * h.d.spellAmp * rm; }
      else if (p.confuse) { kind = 'pollen'; zp.confuse = p.confuse; }
      else if (p.delay) { kind = 'collapse'; zp.dmg = dmg; zp.pull = p.pull ?? 0; }
      else if (p.blackhole) { kind = 'blackhole'; zp.dps = ((p.dps ?? 0) + (p.lvl ?? 0) * h.level) * h.d.spellAmp * rm; zp.pull = p.pull; zp.burst = (p.burst ?? 0) * h.d.spellAmp * rm; }
      else if (p.armor) { kind = 'banner'; zp.slow = p.slow; zp.armor = p.armor; }
      else if (ab.id === 'sporeburst') {
        kind = 'spore'; zp.dps = (p.dps ?? 0) * h.d.spellAmp * rm;
        for (const u of foes()) if (dist(aim, u.pos) <= p.r) dmgUnit(g, u, dmg, 'magic', pl.team, { fromHero: h, isAbility: true });
      }
      else if (p.blind) {
        kind = 'smog'; zp.blind = 1; zp.dps = (p.dps ?? 0) * h.d.spellAmp * rm;
        if (p.dmg) {
          for (const u of foes()) {
            if (dist(aim, u.pos) <= p.r) {
              dmgUnit(g, u, dmg, 'magic', pl.team, { fromHero: h, isAbility: true });
              if (u.hp > 0) u.missUntil = Math.max(u.missUntil, t + (p.blindDur ?? 2));
            }
          }
        }
      }
      else if (p.heal) { kind = 'sanctify'; zp.heal = (p.heal + (p.healLvl ?? 0) * h.level) * rm; zp.slow = p.slow ?? 0; }
      else if (ab.theme.shape === 'storm') { kind = 'storm'; zp.slow = p.slow ?? 0; zp.dps = ((p.dps ?? 0) + (p.lvl ?? 0) * h.level) * h.d.spellAmp * rm; }
      else { kind = 'gravity'; zp.slow = p.slow ?? 0; zp.dps = ((p.dps ?? 0) + (p.lvl ?? 0) * h.level) * h.d.spellAmp * rm; }
      const dur = kind === 'collapse' ? p.delay : (p.dur ?? 3);
      makeZone(g, pl, kind, { ...aim }, p.r, dur, zp, ab.theme);
      break;
    }
    case 'beam': {
      h.channel = { ability: ab.id, until: t + p.dur, startY: C.SPAWN_Y };
      makeZone(g, pl, ab.theme.shape === 'rats' ? 'rattide' : 'beamfire', { x: laneCenterX(lane), y: C.SPAWN_Y }, p.width, p.dur, {
        dps: (p.dps * h.d.spellAmp + h.level * 4) * rm,
        width: p.width,
        igniteDps: p.igniteDps * h.d.spellAmp * rm,
        igniteDur: p.igniteDur,
        dur: p.dur,
      }, ab.theme);
      break;
    }
    case 'transform': {
      const b: Buff = {
        id: ab.id, until: t + p.dur, theme: ab.id,
        dmgPct: (p.dmgPct ?? 0) * rm, armor: p.armor, scale: p.scale, cleaveArc: p.cleaveArc,
      };
      h.buffs = h.buffs.filter(x => x.id !== ab.id);
      h.buffs.push(b);
      h.d = computeDerived(h);
      healHero(h, h.d.maxHp * (p.healPct ?? 0));
      emit(g, { t: 'impact', pos: { ...h.pos }, r: 50, theme: ab.theme, kind: 'blessing' });
      break;
    }
    case 'barrage': {
      makeZone(g, pl, 'starfall', { ...aim }, p.r, p.dur, {
        dmg: dmg, slow: p.slow ?? 0, slowDur: p.slowDur ?? 1.5,
        interval: p.dur / p.count, count: p.count,
        smart: p.smart ?? 0, sweep: p.sweep ?? 0, hitR: p.hitR ?? 78, stun: p.stun ?? 0,
      }, ab.theme);
      break;
    }
    case 'callDown': {
      makeZone(g, pl, 'anvil', { ...aim }, p.r, p.delay, {
        dmg, stun: p.stun ?? 0,
        fieldDur: p.fieldDur ?? 0, fieldSlow: p.fieldSlow ?? 0, fieldDps: (p.fieldDps ?? 0) * h.d.spellAmp * rm,
      }, ab.theme);
      break;
    }
    case 'mobileZone': {
      makeZone(g, pl, 'tempest', { ...aim }, p.r, p.dur, {
        dps: (p.dps * h.d.spellAmp + h.level * 3) * rm, pull: p.pull, drift: p.drift,
      }, ab.theme);
      break;
    }
    case 'buildTower': {
      const count = p.count ?? 1;
      const spread = p.r * 2 + (p.spacing ?? 0);
      for (let i = 0; i < count; i++) {
        const off = count > 1 ? (i - (count - 1) / 2) * spread : 0;
        placeTower(g, pl, ab, { x: aim.x + off, y: aim.y });
      }
      break;
    }
  }
}

const TOWER_KIND: Record<string, import('./types').TowerKind> = {
  ballista: 'ballista', splinter: 'splinter', frostpylon: 'frost', tarpylon: 'tar',
  tempestcoil: 'tempest', flamebattery: 'flame', citadel: 'citadel',
};

/** A tower's live damage, drawn from its OWNER's items + training (not the hero's body). */
function towerDamage(tw: import('./types').TowerState, owner: HeroState): number {
  return tw.baseDmg + owner.d.sp * C.TOWER_SP_SCALE + owner.bonus.dmg * C.TOWER_DMG_SCALE;
}
function towerRange(tw: import('./types').TowerState, owner: HeroState): number {
  return tw.baseRange + owner.level * C.TOWER_RANGE_PER_LVL;
}

function placeTower(g: GameState, pl: PlayerState, ab: AbilityDef, aim: Vec) {
  const p = ab.p;
  const isUlt = ab.id === 'citadel';
  // tower cap (the Citadel doesn't count against it and is unique-ish)
  const mine = g.towers.filter(tw => tw.player === pl.id && tw.kind !== 'citadel').length;
  if (!isUlt && mine >= C.TOWER_CAP) {
    emit(g, { t: 'deny', team: pl.team, player: pl.id, msg: 'Tower limit reached — no more room in the works' });
    // refund: nothing spent yet returns, but the cast already paid mana/cd in castAbility.
    return;
  }
  const L = laneOf(pl.team);
  // build anywhere in your own lane (a little clearance from the gate & spawn mouth)
  const pos = {
    x: clamp(aim.x, L.x0 + p.r + 2, L.x1 - p.r - 2),
    y: clamp(aim.y, C.SPAWN_Y + 30, C.CASTLE_Y - 44),
  };
  // nudge off any tower it would overlap
  for (let tries = 0; tries < 8; tries++) {
    let clash: import('./types').TowerState | null = null;
    for (const tw of g.towers) {
      if (tw.lane === pl.team && dist(tw.pos, pos) < tw.r + p.r - 4) { clash = tw; break; }
    }
    if (!clash) break;
    const dx = pos.x - clash.pos.x, dy = pos.y - clash.pos.y;
    const d0 = Math.hypot(dx, dy) || 1;
    pos.x = clamp(clash.pos.x + (dx / d0) * (clash.r + p.r + 1), L.x0 + p.r + 2, L.x1 - p.r - 2);
    pos.y = clamp(clash.pos.y + (dy / d0) * (clash.r + p.r + 1), C.SPAWN_Y + 30, C.CASTLE_Y - 44);
  }
  const tw: import('./types').TowerState = {
    id: g.nextId++,
    kind: TOWER_KIND[ab.id] ?? 'ballista',
    lane: pl.team,
    player: pl.id,
    pos,
    r: p.r,
    hp: p.towerHp ?? 400,
    maxHp: p.towerHp ?? 400,
    baseDmg: (p.towerDmg ?? 0) * rankMult(ab.slot, pl.hero.ranks[ab.slot]),
    baseRange: p.towerRange ?? 0,
    fireRate: p.fireRate ?? 0.85,
    splash: p.splash ?? 0,
    bonusAir: p.bonusAir ?? 0,
    aura: !!p.aura,
    dot: p.dot ?? 0,
    slow: p.towerSlow ?? 0,
    attackReadyAt: 0,
    until: p.perm ? Infinity : g.t + (p.dur ?? 15),
    born: g.t,
    theme: ab.theme,
  };
  g.towers.push(tw);
  invalidateFlow(g, pl.team);
  emit(g, { t: 'tower', team: pl.team, player: pl.id, kind: tw.kind, pos: { ...pos } });
}

function makeZone(g: GameState, pl: PlayerState, kind: ZoneKind, pos: Vec, r: number, dur: number, p: Record<string, number>, theme: { c1: string; c2: string }): Zone {
  const z: Zone = {
    id: g.nextId++,
    kind,
    owner: pl.team,
    pos: clampToLane(pl.team, pos, 6),
    r,
    until: g.t + dur,
    nextTick: g.t,
    p,
    theme,
    born: g.t,
  };
  z.player = pl.id;
  g.zones.push(z);
  return z;
}

// -------------------------------------------------------------- item actives

export function tryUseItem(g: GameState, pl: PlayerState, slot: number): boolean {
  const h = pl.hero;
  const it = h.items[slot];
  if (!it || h.dead || g.over) return false;
  const def = ITEM_BY_ID[it.defId];
  if (def.proc !== 'galedash') return false;
  if (g.t < it.readyAt) return false;
  it.readyAt = g.t + 18;
  const aim = pl.input.aim;
  const dx = aim.x - h.pos.x, dy = aim.y - h.pos.y;
  const len = Math.hypot(dx, dy) || 1;
  h.pos = clampToLane(pl.team, { x: h.pos.x + (dx / len) * 260, y: h.pos.y + (dy / len) * 260 });
  emit(g, { t: 'impact', pos: { ...h.pos }, r: 40, theme: { c1: '#7df3df', c2: '#ffffff' }, kind: 'blink' });
  emit(g, { t: 'proc', pos: { ...h.pos }, itemId: it.defId });
  return true;
}

// ------------------------------------------------------------------ updates

function updateHero(g: GameState, pl: PlayerState, dt: number) {
  const h = pl.hero;
  const t = g.t;

  if (h.dead) {
    if (t >= h.respawnAt) {
      h.dead = false;
      const fp = fountainPos(pl.team);
      h.pos = { x: fp.x, y: fp.y - 50 };
      h.d = computeDerived(h);
      h.hp = h.d.maxHp;
      h.mana = h.d.maxMana;
      emit(g, { t: 'heroSpawn', team: pl.team, pos: { ...h.pos } });
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
        if (u.lane === pl.team && u.hp > 0 && dist(u.pos, h.pos) <= b.auraR) {
          dmgUnit(g, u, b.auraDps * dt, 'magic', pl.team, { silent: true, fromHero: h });
        }
      }
    }
    if (b.drainDps && b.drainR) {
      let drained = 0;
      for (const u of g.units) {
        if (u.lane === pl.team && u.hp > 0 && dist(u.pos, h.pos) <= b.drainR) {
          drained += dmgUnit(g, u, b.drainDps * dt, 'magic', pl.team, { silent: true, fromHero: h });
        }
      }
      healHero(h, drained);
    }
  }
  if (buffsChanged) h.d = computeDerived(h);

  // chill aura from Frost Revenants
  let chilled = false;
  for (const u of g.units) {
    if (u.hp > 0 && u.lane === pl.team && u.defId === 'revenant' && dist(u.pos, h.pos) < 165) { chilled = true; break; }
  }

  // regen + fountain
  healHero(h, h.d.hpRegen * dt);
  h.mana = Math.min(h.d.maxMana, h.mana + h.d.manaRegen * dt);
  const fp = fountainPos(pl.team);
  if (dist(h.pos, fp) < C.FOUNTAIN_R) {
    healHero(h, h.d.maxHp * C.FOUNTAIN_REGEN * dt);
    h.mana = Math.min(h.d.maxMana, h.mana + h.d.maxMana * C.FOUNTAIN_REGEN * dt);
  }

  if (h.hp <= 0) { dmgHero(g, h, 0.001, 'magic'); return; }

  // Crown of the Shattered King: periodic kingsguard
  for (const it of h.items) {
    if (it && ITEM_BY_ID[it.defId].proc === 'kingsguard' && t >= it.readyAt) {
      it.readyAt = t + 20;
      spawnSummon(g, pl.team, pl.id, 'knight', { x: h.pos.x + 30 * h.facing, y: h.pos.y }, 430, 30 + h.level * 1.5, 95, 210, 8, { c1: '#e3b341', c2: '#6a7a9a' });
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
    if (pl.input.cast[i]) {
      pl.input.cast[i] = false;
      castAbility(g, pl, i);
      if (h.channel) return;
    }
  }
  for (let i = 0; i < 6; i++) {
    if (pl.input.useItem[i]) {
      pl.input.useItem[i] = false;
      tryUseItem(g, pl, i);
    }
  }

  const inClash = clashActive(g);
  const clampPos = (p: Vec) => inClash ? clampToArena(p) : clampToLane(pl.team, p);

  // movement: keyboard vector overrides click orders; otherwise walk to moveTo
  if (!stunned) {
    let mx = pl.input.move.x, my = pl.input.move.y;
    if (Math.hypot(mx, my) > 0.01) pl.input.moveTo = null;
    else if (pl.input.moveTo) {
      const mt = pl.input.moveTo;
      const dx = mt.x - h.pos.x, dy = mt.y - h.pos.y;
      const d0 = Math.hypot(dx, dy);
      if (d0 < 8) pl.input.moveTo = null;
      else { mx = dx / d0; my = dy / d0; }
    }
    if (feared && !inClash) {
      const dx = fp.x - h.pos.x, dy = fp.y - h.pos.y;
      const len = Math.hypot(dx, dy) || 1;
      mx = dx / len; my = dy / len;
      pl.input.moveTo = null;
    }
    const len = Math.hypot(mx, my);
    if (len > 0.01) {
      const ms = h.d.ms * (chilled ? 0.75 : 1);
      const step = Math.min(ms * dt, pl.input.moveTo ? Math.hypot(pl.input.moveTo.x - h.pos.x, pl.input.moveTo.y - h.pos.y) : ms * dt);
      h.pos = clampPos({ x: h.pos.x + (mx / len) * step, y: h.pos.y + (my / len) * step });
      if (Math.abs(mx) > 0.1) h.facing = mx > 0 ? 1 : -1;
    }
  }

  // CLASH: fight the nearest enemy hero directly
  if (inClash && !stunned && !feared) {
    if (t >= h.attackReadyAt) {
      let foe: HeroState | null = null, bd = Infinity;
      for (const p of g.teams[1 - pl.team].players) {
        if (p.hero.dead) continue;
        const d0 = dist(h.pos, p.hero.pos);
        if (d0 < bd) { bd = d0; foe = p.hero; }
      }
      if (foe && bd <= h.d.range + 24) {
        h.attackReadyAt = t + h.d.atkInterval;
        h.attackAnimT = t;
        h.facing = foe.pos.x >= h.pos.x ? 1 : -1;
        const dmg = h.d.dmg;
        if (h.d.range > 200) emit(g, { t: 'impact', pos: { ...foe.pos }, r: 0, theme: { c1: heroDef(h).palette.glow, c2: '#ffffff' }, kind: 'smite', to: { x: h.pos.x, y: h.pos.y - 18 } });
        else emit(g, { t: 'impact', pos: { ...foe.pos }, r: 22, theme: { c1: heroDef(h).palette.glow, c2: '#ffffff' }, kind: 'cone', ang: Math.atan2(foe.pos.y - h.pos.y, foe.pos.x - h.pos.x), arc: 1.2 });
        hitHero(g, foe, dmg, 'phys', h);
      }
    }
    return; // no lane auto-attack in the arena
  }

  // auto-attack
  if (!stunned && !feared) {
    const interval = h.d.atkInterval * (chilled ? 1.25 : 1);
    if (t >= h.attackReadyAt) {
      let target: UnitState | null = null;
      let bestD = Infinity;
      for (const u of g.units) {
        if (u.lane !== pl.team || u.hp <= 0) continue;
        const d0 = dist(h.pos, u.pos);
        if (d0 < bestD) { bestD = d0; target = u; }
      }
      if (target && bestD <= h.d.range + 20) {
        h.attackReadyAt = t + interval;
        h.attackAnimT = t;
        h.facing = target.pos.x >= h.pos.x ? 1 : -1;
        if (h.buffs.some(b => b.blinkStrike) && bestD > 60) {
          h.pos = clampToLane(pl.team, { x: target.pos.x - 30 * Math.sign(target.pos.x - h.pos.x || 1), y: target.pos.y });
          emit(g, { t: 'impact', pos: { ...h.pos }, r: 24, theme: { c1: '#dffcf7', c2: '#1f6f6b' }, kind: 'blink' });
        }
        const underdog = g.teams[pl.team].underdog ? C.UNDERDOG_DMG : 1;
        const dmg = h.d.dmg * underdog;
        const cleaveArc = (h.d as any).cleaveArc as number;
        if (h.d.range > 200) {
          const dx = target.pos.x - h.pos.x, dy = target.pos.y - h.pos.y;
          const len = Math.hypot(dx, dy) || 1;
          g.projectiles.push({
            id: g.nextId++, owner: pl.team, pos: { x: h.pos.x, y: h.pos.y - 18 },
            vel: { x: (dx / len) * 900, y: (dy / len) * 900 },
            r: 14, dmg, kind: 'phys', pierce: false, explodeR: 0, explodeDmg: 0,
            dragX: 0, slowPct: 0, slowDur: 0, dotDps: 0, dotDur: 0, knock: 0, hitIds: [], boomerang: 0,
            origin: { ...h.pos }, maxDist: h.d.range + 140, targetUnit: target.id,
            theme: { c1: heroDef(h).palette.glow, c2: '#ffffff' }, ignite: 0,
          });
          g.projectiles[g.projectiles.length - 1].player = pl.id;
        } else if (cleaveArc > 0) {
          const angle = Math.atan2(target.pos.y - h.pos.y, target.pos.x - h.pos.x);
          for (const u of g.units) {
            if (u.lane !== pl.team || u.hp <= 0) continue;
            if (dist(h.pos, u.pos) > h.d.range + 30) continue;
            const ua = Math.atan2(u.pos.y - h.pos.y, u.pos.x - h.pos.x);
            let da = Math.abs(ua - angle);
            if (da > Math.PI) da = 2 * Math.PI - da;
            if (da <= cleaveArc / 2) dmgUnit(g, u, dmg, 'phys', pl.team, { fromHero: h });
          }
        } else {
          dmgUnit(g, target, dmg, 'phys', pl.team, { fromHero: h });
        }
        heroOnHitProcs(g, pl, h, target, dmg);
      }
    }
  }
}

function heroOnHitProcs(g: GameState, pl: PlayerState, h: HeroState, target: UnitState, dmg: number) {
  for (const it of h.items) {
    if (!it) continue;
    // Dragonmaw Cleaver: melee bites an arc (the colossus cleave supersedes it)
    if (ITEM_BY_ID[it.defId].proc === 'cleave' && h.d.range <= 200 && !(h.d as any).cleaveArc) {
      const angle = Math.atan2(target.pos.y - h.pos.y, target.pos.x - h.pos.x);
      for (const u of g.units) {
        if (u.lane !== pl.team || u.hp <= 0 || u.id === target.id) continue;
        if (dist(h.pos, u.pos) > h.d.range + 40) continue;
        let da = Math.abs(Math.atan2(u.pos.y - h.pos.y, u.pos.x - h.pos.x) - angle);
        if (da > Math.PI) da = 2 * Math.PI - da;
        if (da <= 0.85) dmgUnit(g, u, dmg * 0.35, 'phys', pl.team, { fromHero: h, silent: true });
      }
    }
    if (ITEM_BY_ID[it.defId].proc === 'chain') {
      it.counter++;
      if (it.counter >= 4) {
        it.counter = 0;
        const near = g.units
          .filter(u => u.lane === pl.team && u.hp > 0 && u.id !== target.id && dist(u.pos, target.pos) < 260)
          .sort((a, b) => dist(a.pos, target.pos) - dist(b.pos, target.pos))
          .slice(0, 3);
        const hit: Vec[] = [{ ...target.pos }];
        for (const u of near) {
          dmgUnit(g, u, 65 + h.level * 3, 'magic', pl.team, { fromHero: h });
          hit.push({ ...u.pos });
        }
        emit(g, { t: 'proc', pos: { ...target.pos }, itemId: it.defId, targets: hit });
      }
    }
  }
}

function updateUnits(g: GameState, dt: number) {
  const t = g.t;
  const len = g.units.length;
  for (let i = 0; i < len; i++) {
    const u = g.units[i];
    if (u.hp <= 0) continue;
    const def = UNIT_BY_ID[u.defId];
    const defTeam = g.teams[u.lane];
    u.bob += dt * 6;

    for (let j = u.dots.length - 1; j >= 0; j--) {
      const d0 = u.dots[j];
      if (t >= d0.until) { u.dots.splice(j, 1); continue; }
      dmgUnit(g, u, d0.dps * dt, 'magic', u.lane, { silent: true });
      if (u.hp <= 0) break;
    }
    if (u.hp <= 0) continue;

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
    const speed = def.speed * (1 + u.spdBuffPct) * slowMult * (def.neutral ? 1 : C.UNIT_SPEED_MULT);
    const dmgOut = def.dmg * (1 + u.dmgBuffPct) * (def.neutral ? 1 : C.UNIT_DMG_MULT);

    // wildlife: neutral, harmless, wanders the lane until hunted or it leaves
    if (u.wild) {
      if (u.despawnAt !== undefined && t >= u.despawnAt) { u.hp = -1e9; continue; }
      if (cc) continue;
      if (u.wanderAt === undefined || t >= u.wanderAt) {
        u.wanderAt = t + 1.4 + g.rng() * 1.6;
        const a = g.rng() * Math.PI * 2;
        u.wanderDir = { x: Math.cos(a), y: Math.sin(a) * 0.6 };
      }
      const L = laneOf(u.lane);
      u.pos.x += (u.wanderDir!.x) * speed * dt;
      u.pos.y += (u.wanderDir!.y) * speed * dt;
      // keep them loosely mid-lane
      u.pos.x = clamp(u.pos.x, L.x0 + 20, L.x1 - 20);
      u.pos.y = clamp(u.pos.y, C.SPAWN_Y + 60, C.CASTLE_Y - 90);
      continue;
    }

    if (cc) continue;

    if (feared) {
      u.pos.y -= speed * 1.1 * dt;
      u.pos.y = Math.max(C.SPAWN_Y - 30, u.pos.y);
      continue;
    }

    if (confused) {
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
    if (def.special === 'wyvern' && t >= u.specialReadyAt) {
      const hv = nearestHero(g, u.lane, u.pos);
      if (hv && dist(hv.pos, u.pos) < 330) {
        u.specialReadyAt = t + 2.5;
        dmgHero(g, hv, 70, 'magic', u);
        for (const s of g.summons) {
          if (s.owner === u.lane && dist(s.pos, hv.pos) < 100) dmgSummon(g, s, 70, u.owner);
        }
        emit(g, { t: 'impact', pos: { ...hv.pos }, r: 90, theme: { c1: '#c5ff7d', c2: '#2a4d33' }, kind: 'acid' });
      }
    }
    if (def.special === 'avatar') {
      if (t >= u.specialReadyAt) {
        const hv = nearestHero(g, u.lane, u.pos);
        const heroNear = hv && dist(hv.pos, u.pos) < 170;
        const summonNear = g.summons.some(s => s.owner === u.lane && dist(s.pos, u.pos) < 170);
        if (heroNear || summonNear) {
          u.specialReadyAt = t + 6;
          emit(g, { t: 'impact', pos: { ...u.pos }, r: 170, theme: { c1: '#ff4d4d', c2: '#2b2030' }, kind: 'slam' });
          for (const p of defTeam.players) {
            if (!p.hero.dead && dist(p.hero.pos, u.pos) < 170) {
              dmgHero(g, p.hero, 120, 'magic', u);
              p.hero.buffs.push({ id: 'avatarstun', until: t + 0.8, stun: true, theme: 'stun' });
            }
          }
          for (const s of g.summons) {
            if (s.owner === u.lane && dist(s.pos, u.pos) < 170) dmgSummon(g, s, 120, u.owner);
          }
        }
      }
      if (!u.roared && u.hp < u.maxHp * 0.5) {
        u.roared = true;
        for (const p of defTeam.players) {
          if (!p.hero.dead && dist(p.hero.pos, u.pos) < 420) {
            p.hero.buffs.push({ id: 'ruinfear', until: t + 1.0, fear: true, theme: 'fear' });
            p.hero.channel = null;
          }
        }
        emit(g, { t: 'impact', pos: { ...u.pos }, r: 420, theme: { c1: '#ff4d4d', c2: '#13101a' }, kind: 'roar' });
      }
    }
    if (def.special === 'boss') {
      // periodic earth-shattering slam: AoE damage + brief stun
      if (t >= u.specialReadyAt) {
        const hv = nearestHero(g, u.lane, u.pos);
        const heroNear = hv && dist(hv.pos, u.pos) < C.BOSS_SLAM_R;
        const summonNear = g.summons.some(s => s.owner === u.lane && dist(s.pos, u.pos) < C.BOSS_SLAM_R);
        if (heroNear || summonNear) {
          u.specialReadyAt = t + C.BOSS_SLAM_CD;
          emit(g, { t: 'impact', pos: { ...u.pos }, r: C.BOSS_SLAM_R, theme: { c1: '#ff7b2e', c2: '#140e16' }, kind: 'slam' });
          for (const p of defTeam.players) {
            if (!p.hero.dead && dist(p.hero.pos, u.pos) < C.BOSS_SLAM_R) {
              dmgHero(g, p.hero, C.BOSS_SLAM_DMG, 'magic', u);
              p.hero.buffs.push({ id: 'bossstun', until: t + C.BOSS_SLAM_STUN, stun: true, theme: 'stun' });
            }
          }
          for (const s of g.summons) {
            if (s.owner === u.lane && dist(s.pos, u.pos) < C.BOSS_SLAM_R) dmgSummon(g, s, C.BOSS_SLAM_DMG, u.owner);
          }
        }
      }
      // a world-shaking roar at half health routs the defenders, once
      if (!u.roared && u.hp < u.maxHp * 0.5) {
        u.roared = true;
        for (const p of defTeam.players) {
          if (!p.hero.dead && dist(p.hero.pos, u.pos) < C.BOSS_ROAR_R) {
            p.hero.buffs.push({ id: 'bossfear', until: t + 1.1, fear: true, theme: 'fear' });
            p.hero.channel = null;
          }
        }
        emit(g, { t: 'impact', pos: { ...u.pos }, r: C.BOSS_ROAR_R, theme: { c1: '#ff7b2e', c2: '#140e16' }, kind: 'roar' });
      }
    }

    if (u.state === 'march') {
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
        let blockTarget: SummonState | null = null;
        for (const s of g.summons) {
          if (s.owner === u.lane && s.kind !== 'decoy' && inAtkRange(s.pos, 10)) { blockTarget = s; break; }
        }
        const hv = nearestHero(g, u.lane, u.pos);
        if (blockTarget) {
          engaged = true;
          if (!disarmed && t >= u.attackReadyAt) {
            u.attackReadyAt = t + C.UNIT_ATK_PERIOD;
            if (!blinded) dmgSummon(g, blockTarget, dmgOut, u.owner);
          }
        } else if (hv && !disarmed && inAtkRange(hv.pos, def.special === 'harass' ? 0 : 14)) {
          engaged = def.special !== 'harass';
          if (t >= u.attackReadyAt) {
            u.attackReadyAt = t + C.UNIT_ATK_PERIOD;
            if (!blinded) {
              dmgHero(g, hv, dmgOut, 'phys', u);
              if (def.special === 'harass') emit(g, { t: 'impact', pos: { ...hv.pos }, r: 22, theme: { c1: '#b58ad1', c2: '#5d3a70' }, kind: 'claw' });
            }
          }
        }
      }

      // towers are destructible — a unit passing one smashes it; enough pressure razes the wall
      if (!engaged && !disarmed && !blinded && t >= u.attackReadyAt && g.towers.length > 0) {
        let twTarget: TowerState | null = null;
        let bd = Infinity;
        for (const w of g.towers) {
          if (w.lane !== u.lane) continue;
          const d = dist(w.pos, u.pos);
          if (d <= def.range + w.r + 6 && d < bd) { bd = d; twTarget = w; }
        }
        if (twTarget) {
          u.attackReadyAt = t + C.UNIT_ATK_PERIOD;
          engaged = true; // slow down while smashing it
          twTarget.hp -= dmgOut;
          if (twTarget.hp <= 0) emit(g, { t: 'impact', pos: { ...twTarget.pos }, r: twTarget.r, theme: twTarget.theme, kind: 'towerfall' });
        }
      }

      const moveMult = engaged ? C.UNIT_ENGAGE_SLOW : 1;
      const stepLen = speed * moveMult * dt;
      // towers don't wall the lane — units march on and just slide around them
      let mx = 0, my = 1;
      const cx = laneCenterX(u.lane);
      if (u.pos.y > C.CASTLE_Y - 220) mx += (cx - u.pos.x) * 0.012; // funnel toward the gate late
      if (g.towers.length > 0) {
        for (const tw of g.towers) {
          if (tw.lane !== u.lane) continue;
          const dx = u.pos.x - tw.pos.x, dy = u.pos.y - tw.pos.y;
          const d0 = Math.hypot(dx, dy);
          if (d0 < tw.r + 14 && d0 > 0.01) {
            const push = (tw.r + 14 - d0) / (tw.r + 14);
            mx += (dx / d0) * push * 1.6;
            my += (dy / d0) * push * 0.5; // mostly sideways — keep advancing
          }
        }
      }
      const ml = Math.hypot(mx, my) || 1;
      u.pos.x += (mx / ml) * stepLen;
      u.pos.y += (my / ml) * stepLen;

      if (u.pos.y >= C.CASTLE_Y - 22) {
        u.pos.y = C.CASTLE_Y - 22;
        // the boss doesn't camp the gate — it breaches the wall once and rampages off
        if (def.special === 'boss') { bossBreaches(g, u, defTeam); continue; }
        u.state = 'castle';
        // every defender feels the leak
        defTeam.players[0].stats.leaks++;
      }
    } else {
      if (!disarmed && !blinded && t >= u.attackReadyAt) {
        u.attackReadyAt = t + C.UNIT_ATK_PERIOD;
        let mult = def.special === 'siege' ? 3.5 : 1;
        mult *= C.CASTLE_DMG_BASE + C.TWILIGHT_CASTLE_DMG * g.twilightLevel;
        const attacker = playerById(g, ownerPlayerOf(g, u));
        dmgCastle(g, defTeam, dmgOut * mult, attacker);
        if (def.special === 'cutpurse') {
          const victim = defTeam.players[Math.floor(g.rng() * defTeam.players.length)];
          const steal = Math.min(2, victim.gold);
          victim.gold -= steal;
          attacker.gold += steal;
        }
      }
    }
  }
}

// sent units remember their sender via spawn order; fall back to a random teammate
function ownerPlayerOf(g: GameState, u: UnitState): number {
  const owner = u.player;
  if (owner !== undefined) return owner;
  const ps = g.teams[u.owner].players;
  return ps[Math.floor(g.rng() * ps.length)].id;
}

function updateTowers(g: GameState, dt: number) {
  const t = g.t;
  for (const tw of g.towers) {
    if (t >= tw.until || tw.hp <= 0) continue;
    const owner = playerById(g, tw.player);
    const oh = owner.hero;
    const range = towerRange(tw, oh);
    const antiAir = tw.kind === 'tempest' || tw.kind === 'citadel';

    // aura towers (frost / tar): continuously mire everything in range
    if (tw.aura) {
      if (t < tw.attackReadyAt) continue;
      tw.attackReadyAt = t + 0.25;
      const tick = towerDamage(tw, oh) * 0.25;
      for (const u of g.units) {
        if (u.lane !== tw.lane || u.hp <= 0 || u.wild) continue;
        if (dist(u.pos, tw.pos) > range) continue;
        applySlow(u, tw.slow, 0.45, t);
        if (tw.dot) addDot(u, tw.dot, 1, t);
        if (tick > 0) dmgUnit(g, u, tick, 'magic', tw.lane, { silent: true, killerPlayer: tw.player, bountyMult: C.TOWER_BOUNTY });
      }
      continue;
    }

    if (t < tw.attackReadyAt) continue;
    // target the invader deepest into the lane and in range (ground-only towers skip flyers)
    let tgt: UnitState | null = null;
    let bestY = -Infinity;
    for (const u of g.units) {
      if (u.lane !== tw.lane || u.hp <= 0 || u.wild) continue;
      if (UNIT_BY_ID[u.defId].flying && !antiAir) continue;
      if (dist(u.pos, tw.pos) > range) continue;
      if (u.pos.y > bestY) { bestY = u.pos.y; tgt = u; }
    }
    if (!tgt) continue;
    tw.attackReadyAt = t + tw.fireRate;
    const base = towerDamage(tw, oh);

    if (tw.splash > 0) {
      for (const u of g.units) {
        if (u.lane !== tw.lane || u.hp <= 0 || u.wild) continue;
        const fly = UNIT_BY_ID[u.defId].flying;
        if (fly && !antiAir) continue;
        if (dist(u.pos, tgt.pos) > tw.splash) continue;
        const dmg = base * (fly ? 1 + tw.bonusAir : 1);
        dmgUnit(g, u, dmg, 'magic', tw.lane, { killerPlayer: tw.player, bountyMult: C.TOWER_BOUNTY });
        if (u.hp > 0 && tw.slow) applySlow(u, tw.slow, 1.2, t);
        if (u.hp > 0 && tw.dot) addDot(u, tw.dot, 2.5, t);
      }
      emit(g, { t: 'impact', pos: { ...tgt.pos }, r: tw.splash, theme: tw.theme, kind: tw.kind === 'tempest' || tw.kind === 'citadel' ? 'bolt' : 'burst' });
    } else {
      // single-target bolt (homing)
      const fly = UNIT_BY_ID[tgt.defId].flying;
      const dmg = base * (fly ? 1 + tw.bonusAir : 1);
      g.projectiles.push({
        id: g.nextId++, owner: tw.lane, pos: { x: tw.pos.x, y: tw.pos.y - 22 },
        vel: { x: 0, y: 0 }, r: 12, dmg, kind: 'magic', pierce: false,
        explodeR: 0, explodeDmg: 0, dragX: 0, slowPct: tw.slow, slowDur: tw.slow ? 1 : 0,
        dotDps: tw.dot, dotDur: tw.dot ? 2.5 : 0, knock: 0, hitIds: [], boomerang: 0,
        origin: { ...tw.pos }, maxDist: range + 90, targetUnit: tgt.id,
        theme: tw.theme, ignite: 0, player: tw.player, towerShot: true,
      });
      const pr = g.projectiles[g.projectiles.length - 1];
      const dx = tgt.pos.x - pr.pos.x, dy = tgt.pos.y - pr.pos.y;
      const len = Math.hypot(dx, dy) || 1;
      pr.vel = { x: (dx / len) * 680, y: (dy / len) * 680 };
    }
  }
  // remove destroyed towers (units smash them down) or any timed-out ones
  for (let i = g.towers.length - 1; i >= 0; i--) {
    const tw = g.towers[i];
    if (t >= tw.until || tw.hp <= 0) {
      emit(g, { t: 'impact', pos: { ...tw.pos }, r: tw.r, theme: tw.theme, kind: tw.hp <= 0 ? 'towerfall' : 'blink' });
      g.towers.splice(i, 1);
      invalidateFlow(g, tw.lane);
    }
  }
}

function updateSummons(g: GameState, dt: number) {
  const t = g.t;
  for (const s of g.summons) {
    if (s.hp <= 0 || t >= s.until) continue;
    if (s.kind === 'decoy') continue;
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
      dmgUnit(g, tgt, s.dmg, 'phys', s.owner, { killerPlayer: s.player });
      if (s.kind === 'snapper') emit(g, { t: 'impact', pos: { ...tgt.pos }, r: 30, theme: s.theme, kind: 'chomp' });
    }
  }
}

function updateProjectiles(g: GameState, dt: number) {
  const t = g.t;
  for (const pr of g.projectiles) {
    if (pr.maxDist <= -1) continue;
    const ownerPlayer = pr.player !== undefined ? playerById(g, pr.player) : g.teams[pr.owner].players[0];
    const hero = ownerPlayer.hero;

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

    // CLASH: spell projectiles strike enemy heroes in the arena
    if (g.clashPhase === 'active' && !pr.towerShot) {
      for (const p of g.teams[1 - pr.owner].players) {
        const eh = p.hero;
        if (eh.dead || pr.hitIds.includes(-eh.player - 1)) continue;
        if (dist(eh.pos, pr.pos) > pr.r + 16) continue;
        pr.hitIds.push(-eh.player - 1);
        hitHero(g, eh, pr.dmg, pr.kind, hero);
        if (!pr.pierce && pr.boomerang === 0) { pr.maxDist = -2; break; }
      }
      if (pr.maxDist <= -1) continue;
    }

    for (const u of g.units) {
      if (u.lane !== pr.owner || u.hp <= 0 || pr.hitIds.includes(u.id)) continue;
      if (dist(u.pos, pr.pos) > pr.r + 15) continue;
      pr.hitIds.push(u.id);
      dmgUnit(g, u, pr.dmg, pr.kind, pr.owner, { fromHero: hero, isAbility: pr.kind === 'magic', bountyMult: pr.towerShot ? C.TOWER_BOUNTY : 1, killerPlayer: pr.player });
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
      if (!pr.pierce && pr.boomerang === 0) { pr.maxDist = -2; break; }
    }
  }
  g.projectiles = g.projectiles.filter(p => p.maxDist > -1);
}

function updateZones(g: GameState, dt: number) {
  const t = g.t;
  for (const z of g.zones) {
    const zPlayer = z.player;
    if (t >= z.until) {
      const clashBurst = (dmgv: number, stun?: number) => {
        if (g.clashPhase !== 'active' || zPlayer === undefined) return;
        const attacker = playerById(g, zPlayer).hero;
        for (const eh of clashEnemyHeroes(g, z.owner, z.pos, z.r)) { hitHero(g, eh, dmgv, 'magic', attacker); if (!eh.dead && stun) heroStun(g, eh, stun); }
      };
      if (z.kind === 'collapse') {
        for (const u of g.units) {
          if (u.lane === z.owner && u.hp > 0 && dist(u.pos, z.pos) <= z.r) {
            dmgUnit(g, u, z.p.dmg, 'magic', z.owner, { killerPlayer: zPlayer });
          }
        }
        clashBurst(z.p.dmg);
        emit(g, { t: 'impact', pos: { ...z.pos }, r: z.r, theme: z.theme, kind: 'collapse' });
      }
      if (z.kind === 'anvil') {
        for (const u of g.units) {
          if (u.lane === z.owner && u.hp > 0 && dist(u.pos, z.pos) <= z.r) {
            dmgUnit(g, u, z.p.dmg, 'magic', z.owner, { killerPlayer: zPlayer });
            if (u.hp > 0 && z.p.stun) u.ccUntil = Math.max(u.ccUntil, g.t + z.p.stun);
          }
        }
        clashBurst(z.p.dmg, z.p.stun);
        emit(g, { t: 'impact', pos: { ...z.pos }, r: z.r, theme: z.theme, kind: 'anvilhit' });
        if (z.p.fieldDur && zPlayer !== undefined) {
          makeZone(g, playerById(g, zPlayer), 'gravity', { ...z.pos }, z.r * 0.95, z.p.fieldDur, { slow: z.p.fieldSlow ?? 0.3, dps: z.p.fieldDps ?? 0 }, z.theme);
        }
      }
      if (z.kind === 'blackhole' && z.p.burst) {
        for (const u of g.units) {
          if (u.lane === z.owner && u.hp > 0 && dist(u.pos, z.pos) <= z.r * 1.2) {
            dmgUnit(g, u, z.p.burst, 'magic', z.owner, { killerPlayer: zPlayer });
          }
        }
        clashBurst(z.p.burst);
        emit(g, { t: 'impact', pos: { ...z.pos }, r: z.r * 1.2, theme: z.theme, kind: 'collapse' });
      }
      continue;
    }

    if (z.kind === 'tempest' && zPlayer !== undefined) {
      const aim = playerById(g, zPlayer).input.aim;
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

    for (const u of g.units) {
      if (u.lane !== z.owner || u.hp <= 0) continue;
      const def = UNIT_BY_ID[u.defId];
      let inside = false;
      if (z.kind === 'wall') {
        inside = Math.abs(u.pos.y - z.pos.y) < 30 && Math.abs(u.pos.x - z.pos.x) < z.p.len / 2;
        if (inside && def.flying) inside = false;
      } else if (z.kind === 'beamfire' || z.kind === 'rattide') {
        inside = Math.abs(u.pos.y - z.pos.y) < z.p.width;
      } else {
        inside = dist(u.pos, z.pos) <= z.r;
      }
      if (!inside) continue;
      if (z.p.dps) dmgUnit(g, u, z.p.dps * dt, 'magic', z.owner, { silent: true, killerPlayer: zPlayer });
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

    // CLASH: damaging zones also scorch enemy heroes standing in them
    if (g.clashPhase === 'active' && z.p.dps && zPlayer !== undefined) {
      const attacker = playerById(g, zPlayer).hero;
      for (const p of g.teams[1 - z.owner].players) {
        const eh = p.hero;
        if (eh.dead) continue;
        let inside: boolean;
        if (z.kind === 'wall') inside = Math.abs(eh.pos.y - z.pos.y) < 30 && Math.abs(eh.pos.x - z.pos.x) < z.p.len / 2;
        else if (z.kind === 'beamfire' || z.kind === 'rattide') inside = Math.abs(eh.pos.y - z.pos.y) < z.p.width;
        else inside = dist(eh.pos, z.pos) <= z.r;
        if (inside) hitHero(g, eh, z.p.dps * dt, 'magic', attacker);
      }
    }

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

    if (z.kind === 'starfall' && t >= z.nextTick) {
      z.nextTick = t + z.p.interval;
      z.p.i = (z.p.i ?? 0) + 1;
      let ip: Vec | null = null;
      if (g.clashPhase === 'active') {
        // in the arena, the barrage rains on enemy heroes
        const foes = g.teams[1 - z.owner].players.filter(p => !p.hero.dead);
        if (foes.length) ip = { ...foes[Math.floor(g.rng() * foes.length)].hero.pos };
      } else if (z.p.smart) {
        let best: UnitState | null = null;
        for (const u of g.units) {
          if (u.lane !== z.owner || u.hp <= 0) continue;
          if (!best || UNIT_BY_ID[u.defId].cost > UNIT_BY_ID[best.defId].cost) best = u;
        }
        if (best) ip = { ...best.pos };
      } else if (z.p.sweep) {
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
            dmgUnit(g, u, z.p.dmg, 'magic', z.owner, { killerPlayer: zPlayer });
            if (u.hp > 0 && z.p.slow) applySlow(u, z.p.slow, z.p.slowDur, t);
            if (u.hp > 0 && z.p.stun) u.ccUntil = Math.max(u.ccUntil, t + z.p.stun);
          }
        }
        if (g.clashPhase === 'active' && zPlayer !== undefined) {
          const attacker = playerById(g, zPlayer).hero;
          for (const eh of clashEnemyHeroes(g, z.owner, ip, hitR)) {
            hitHero(g, eh, z.p.dmg, 'magic', attacker);
            if (!eh.dead && z.p.stun) heroStun(g, eh, z.p.stun);
          }
        }
        const kind = z.theme.shape === 'bolt' ? 'bolt' : z.theme.shape === 'pillar' ? 'pillar' : 'star';
        emit(g, { t: 'impact', pos: ip, r: hitR, theme: z.theme, kind });
      }
    }
    if (z.kind === 'banner' && zPlayer !== undefined) {
      const h = playerById(g, zPlayer).hero;
      if (!h.dead && dist(h.pos, z.pos) <= z.r) {
        const ex = h.buffs.find(b => b.id === 'bannerarmor');
        if (ex) ex.until = t + 0.4;
        else { h.buffs.push({ id: 'bannerarmor', until: t + 0.4, armor: z.p.armor, theme: 'banner' }); h.d = computeDerived(h); }
      }
    }
    if (z.kind === 'sanctify' && zPlayer !== undefined) {
      const h = playerById(g, zPlayer).hero;
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
        const dps = C.CASTLE_DPS[team.maxKeep] * (1 + C.CASTLE_DPS_PER_ALLY * (team.players.length - 1));
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
  for (const pl of allPlayers(g)) {
    pl.gold += C.GOLD_DRIP * dt;
  }
  if (g.t >= g.nextIncomeAt) {
    g.nextIncomeAt += C.INCOME_PERIOD;
    for (const pl of allPlayers(g)) {
      const ts = g.teams[pl.team];
      const forgeMult = 1 + C.FORGE_INCOME_PER * ts.forgeMastery; // Forge-Mastery favor
      const amt = Math.round(pl.income * (ts.underdog ? C.UNDERDOG_INCOME : 1) * forgeMult);
      pl.gold += amt;
      pl.stats.goldEarned += amt;
      emit(g, { t: 'income', team: pl.team, amount: amt, player: pl.id });
    }
  }
  if (g.t >= g.nextTwilightAt) {
    g.nextTwilightAt += C.TWILIGHT_PERIOD;
    g.twilightLevel++;
    if (g.twilightLevel <= C.TWILIGHT_INCOME_CAP) {
      for (const pl of allPlayers(g)) {
        pl.income = Math.round(pl.income * C.TWILIGHT_INCOME);
      }
    }
    emit(g, { t: 'twilight', level: g.twilightLevel });
  }
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
  for (const pl of allPlayers(g)) {
    if (pl.sendQueue.length === 0) continue;
    if (g.t < pl.nextSpawnAt) continue;
    const defId = pl.sendQueue.shift()!;
    const u = spawnUnit(g, defId, pl.team, null);
    u.player = pl.id;
    const gate = Math.max(C.TWILIGHT_GATE_MIN, Math.pow(C.TWILIGHT_GATE, g.twilightLevel));
    pl.nextSpawnAt = g.t + C.SPAWN_INTERVAL[pl.baseLevel] * gate;
  }
}

// ----------------------------------------------------------- wildlife + runes

function updateWildlife(g: GameState) {
  for (const lane of [0, 1] as TeamId[]) {
    if (g.t < g.nextWildAt[lane]) continue;
    const wilds = g.units.filter(u => u.lane === lane && u.hp > 0 && u.wild).length;
    const invaders = g.units.filter(u => u.lane === lane && u.hp > 0 && !u.wild).length;
    const heroHome = g.teams[lane].players.some(p => !p.hero.dead);
    // keep a little wildlife around to farm; lean in harder when the lane is quiet
    if (wilds < C.WILD_MAX_PER_LANE && heroHome) {
      const roll = g.rng();
      const defId = roll < 0.58 ? 'gloomrat' : roll < 0.86 ? 'wisp' : 'tuskboar';
      const L = laneOf(lane);
      const u = spawnUnit(g, defId, (1 - lane) as TeamId, {
        x: L.x0 + 40 + g.rng() * (L.x1 - L.x0 - 80),
        y: C.SPAWN_Y + 120 + g.rng() * 300,
      });
      u.wild = true;
      u.owner = lane; // belongs to no sender; lane defender farms it
      u.despawnAt = g.t + C.WILD_DESPAWN;
    }
    // quiet lanes refresh wildlife faster, busy lanes slower
    const base = invaders < C.WILD_QUIET_UNITS ? C.WILD_PERIOD[0] : C.WILD_PERIOD[1] + 5;
    g.nextWildAt[lane] = g.t + base + g.rng() * 3;
  }
}

function updateRunes(g: GameState) {
  if (g.t >= g.nextRuneAt) {
    g.nextRuneAt = g.t + C.RUNE_PERIOD;
    for (const lane of [0, 1] as TeamId[]) {
      const kindRoll = g.rng();
      const kind = kindRoll < 0.5 ? 'bounty' : kindRoll < 0.78 ? 'haste' : 'power';
      const L = laneOf(lane);
      const pos = { x: laneCenterX(lane) + (g.rng() - 0.5) * (L.x1 - L.x0) * 0.5, y: C.SPAWN_Y + 200 + g.rng() * 240 };
      g.runes.push({ id: g.nextId++, kind, lane, pos, until: g.t + C.RUNE_LIFE, born: g.t });
      emit(g, { t: 'rune', kind, pos: { ...pos }, lane });
    }
  }
  for (let i = g.runes.length - 1; i >= 0; i--) {
    const rn = g.runes[i];
    if (g.t >= rn.until) { g.runes.splice(i, 1); continue; }
    // a defending hero who walks over it claims it
    const hv = nearestHero(g, rn.lane, rn.pos);
    if (hv && dist(hv.pos, rn.pos) < 34) {
      const pl = playerById(g, hv.player);
      if (rn.kind === 'bounty') {
        const amt = C.RUNE_BOUNTY + Math.floor(g.t / 60) * 8;
        pl.gold += amt;
        pl.stats.goldEarned += amt;
      } else if (rn.kind === 'haste') {
        hv.buffs.push({ id: 'runehaste', until: g.t + 8, msPct: 0.4, asPct: 0.3, theme: 'whisperwind' });
        hv.d = computeDerived(hv);
      } else {
        hv.buffs.push({ id: 'runepower', until: g.t + 10, dmgPct: 0.2, spellAmp: 0.2, theme: 'voidsight' });
        hv.d = computeDerived(hv);
      }
      emit(g, { t: 'runeGet', team: rn.lane, player: hv.player, kind: rn.kind, pos: { ...rn.pos } });
      g.runes.splice(i, 1);
    }
  }
}

/** Recompute a team's Forgemaster's Favor when their recipe set grows. */
function checkForgeMastery(g: GameState, team: TeamId) {
  const ts = g.teams[team];
  const count = g.discovered[team].length;
  if (count <= ts.forgeMastery) return;
  ts.forgeMastery = count;
  const complete = count >= FORGED_ITEMS.length;
  emit(g, { t: 'forgeMastery', team, count, complete });
  if (complete && !ts.forgeComplete) {
    ts.forgeComplete = true;
    // the Forgemaster's Favor: every hero tempered, the castle fortified
    for (const pl of ts.players) {
      pl.hero.bonus.str += C.FORGE_FULL_STATS;
      pl.hero.bonus.agi += C.FORGE_FULL_STATS;
      pl.hero.bonus.int += C.FORGE_FULL_STATS;
      pl.hero.d = computeDerived(pl.hero);
    }
    ts.castleMaxHp += C.FORGE_FULL_HEAL;
    ts.castleHp = Math.min(ts.castleMaxHp, ts.castleHp + C.FORGE_FULL_HEAL);
  }
}

// ------------------------------------------------------------------- the clash

export function clashActive(g: GameState): boolean {
  return g.clashPhase === 'active';
}

/** Enemy heroes of `team` standing within `r` of `center` (clash targeting). */
function clashEnemyHeroes(g: GameState, team: TeamId, center: Vec, r: number): HeroState[] {
  const out: HeroState[] = [];
  for (const p of g.teams[1 - team].players) {
    if (!p.hero.dead && dist(p.hero.pos, center) <= r) out.push(p.hero);
  }
  return out;
}

/** Hero-to-hero damage during the clash (handles KO scoring + attribution). */
function hitHero(g: GameState, target: HeroState, raw: number, kind: 'phys' | 'magic', attacker: HeroState) {
  if (target.dead || g.over) return;
  dmgHero(g, target, raw, kind, undefined, attacker);
}
function heroStun(g: GameState, h: HeroState, dur: number) {
  if (h.dead) return;
  h.buffs.push({ id: 'clashstun', until: g.t + Math.min(dur, 1.6), stun: true, theme: 'stun' });
}

function startClash(g: GameState) {
  g.clashPhase = 'active';
  g.clashUntil = g.t + C.CLASH_DUR;
  g.clashScore = [0, 0];
  g.clashNum++;
  const a = C.CLASH_ARENA;
  for (const tid of [0, 1] as TeamId[]) {
    const ps = g.teams[tid].players;
    const n = ps.length;
    ps.forEach((p, i) => {
      const h = p.hero;
      // everyone fights — revive the fallen for the duel
      h.dead = false;
      h.channel = null;
      h.buffs = h.buffs.filter(b => !b.stun && !b.fear);
      h.d = computeDerived(h);
      h.hp = h.d.maxHp;
      h.mana = h.d.maxMana;
      const side = tid === 0 ? -1 : 1;
      h.pos = {
        x: a.x + side * (70 + (i % 2) * 26),
        y: a.y + (i - (n - 1) / 2) * 74,
      };
      h.facing = side > 0 ? -1 : 1;
      p.input.moveTo = null;
      p.input.move = { x: 0, y: 0 };
      // brief spawn-in protection
      h.buffs.push({ id: 'clashguard', until: g.t + 1.2, theme: 'clashguard', shield: 60 });
    });
  }
  emit(g, { t: 'clashStart' });
}

function endClash(g: GameState) {
  const [s0, s1] = g.clashScore;
  // surviving-hero tiebreak if KOs are equal
  let alive0 = 0, alive1 = 0;
  for (const p of g.teams[0].players) if (!p.hero.dead) alive0++;
  for (const p of g.teams[1].players) if (!p.hero.dead) alive1++;
  let winner: TeamId | -1 = -1;
  if (s0 !== s1) winner = s0 > s1 ? 0 : 1;
  else if (alive0 !== alive1) winner = alive0 > alive1 ? 0 : 1;

  for (const tid of [0, 1] as TeamId[]) {
    for (const p of g.teams[tid].players) {
      const h = p.hero;
      h.dead = false;
      h.buffs = h.buffs.filter(b => b.id !== 'clashguard' && !b.stun && !b.fear);
      const fp = fountainPos(tid);
      h.pos = { x: fp.x, y: fp.y - 50 };
      h.d = computeDerived(h);
      h.hp = h.d.maxHp;
      h.mana = h.d.maxMana;
      h.respawnAt = 0;
      h.attackReadyAt = g.t + 0.5;
      p.input.moveTo = null;
      if (winner === tid) {
        p.gold += C.CLASH_WIN_GOLD;
        p.stats.goldEarned += C.CLASH_WIN_GOLD;
        h.buffs.push({ id: 'clashvictor', until: g.t + C.CLASH_VICTOR_DUR, dmgPct: C.CLASH_VICTOR_DMG, theme: 'clashvictor' });
        h.d = computeDerived(h);
      }
    }
  }
  g.clashPhase = 'none';
  g.nextClashAt = g.t + C.CLASH_PERIOD;
  emit(g, { t: 'clashEnd', winner });
}

function updateClash(g: GameState) {
  const t = g.t;
  if (g.clashPhase === 'none') {
    if (t >= g.nextClashAt) {
      g.clashPhase = 'warn';
      g.clashUntil = t + C.CLASH_WARN;
      emit(g, { t: 'clashWarn', secs: C.CLASH_WARN });
    }
    return;
  }
  if (g.clashPhase === 'warn') {
    if (t >= g.clashUntil) startClash(g);
    return;
  }
  // active
  if (t >= g.clashUntil) { endClash(g); return; }
  // end early if a whole team is down
  const down0 = g.teams[0].players.every(p => p.hero.dead);
  const down1 = g.teams[1].players.every(p => p.hero.dead);
  if (down0 || down1) endClash(g);
}

// -------------------------------------------------------------------- the siege

/** The beast is drawn to the mightiest keep: the lane with the most castle hp. */
function bossTargetLane(g: GameState): TeamId {
  const r0 = g.teams[0].castleHp / g.teams[0].castleMaxHp;
  const r1 = g.teams[1].castleHp / g.teams[1].castleMaxHp;
  if (r0 > r1 + 0.01) return 0;
  if (r1 > r0 + 0.01) return 1;
  return (g.bossNum % 2) as TeamId; // dead heat — alternate so neither is singled out
}

function spawnBoss(g: GameState) {
  const lane = (g.bossLane >= 0 ? g.bossLane : bossTargetLane(g)) as TeamId;
  const owner = (1 - lane) as TeamId; // spawnUnit derives lane = 1 - owner
  const pos = { x: laneCenterX(lane), y: C.SPAWN_Y + 8 };
  const u = spawnUnit(g, 'titan', owner, pos);
  const defenders = g.teams[lane].players.length;
  const hp = Math.round(
    (C.BOSS_HP_BASE + C.BOSS_HP_PER_MIN * (g.t / 60))
    * (1 + C.BOSS_HP_PER_ALLY * (defenders - 1))
    * (1 + C.BOSS_HP_PER_NUM * g.bossNum),
  );
  u.hp = u.maxHp = hp;
  g.bossId = u.id;
  g.bossPhase = 'active';
  g.bossNum++;
  emit(g, { t: 'bossSpawn', lane, pos: { ...pos }, num: g.bossNum });
}

/** Boss death: a fat, clock-scaled bounty + sustain reward; schedule the next. */
function slayBoss(g: GameState, u: UnitState, defTeam: TeamState, killerHero?: HeroState, killerPlayerId?: number) {
  let earner: PlayerState;
  if (killerHero && killerHero.team === defTeam.id && !killerHero.dead) earner = playerById(g, killerHero.player);
  else if (killerPlayerId !== undefined && playerById(g, killerPlayerId).team === defTeam.id) earner = playerById(g, killerPlayerId);
  else earner = defTeam.players[Math.floor(g.rng() * defTeam.players.length)];

  const gold = Math.round(C.BOSS_BOUNTY_BASE + C.BOSS_BOUNTY_PER_MIN * (g.t / 60));
  earner.gold += gold;
  earner.stats.goldEarned += gold;
  earner.stats.kills += 1;
  const xp = gold * C.XP_PCT;
  for (const p of defTeam.players) {
    if (p.hero.dead) continue;
    addXp(g, p.hero, p === earner ? xp : xp * 0.6); // the whole team shares the spoils
  }
  // the slayer's reward is sustain, not raw power — the beast hunts the leader,
  // so a damage spike here would only feed a snowball.
  if (!earner.hero.dead) {
    earner.hero.buffs.push({
      id: 'bossvigor', until: g.t + C.BOSS_VIGOR_DUR,
      lifesteal: C.BOSS_VIGOR_LIFESTEAL, hot: C.BOSS_VIGOR_REGEN, theme: 'bossvigor',
    });
    earner.hero.d = computeDerived(earner.hero);
  }
  emit(g, { t: 'death', pos: { ...u.pos }, defId: u.defId, tier: 3, lane: u.lane });
  emit(g, { t: 'gold', team: defTeam.id, amount: gold, pos: { ...u.pos }, player: earner.id });
  emit(g, { t: 'bossSlain', team: defTeam.id, pos: { ...u.pos }, gold });
  g.bossPhase = 'none';
  g.bossId = -1;
  g.bossLane = -1;
  g.nextBossAt = g.t + C.BOSS_PERIOD;
}

/** The boss reached the wall undefended: a heavy but bounded hit, then it leaves. */
function bossBreaches(g: GameState, u: UnitState, defTeam: TeamState) {
  const dmg = Math.round(defTeam.castleMaxHp * C.BOSS_LEAK_PCT);
  const attacker = playerById(g, ownerPlayerOf(g, u));
  dmgCastle(g, defTeam, dmg, attacker);
  defTeam.players[0].stats.leaks++;
  u.hp = -1e9; // despawn without paying a bounty — the defenders failed
  emit(g, { t: 'bossBreach', team: defTeam.id, pos: { ...u.pos }, amount: dmg });
  g.bossPhase = 'none';
  g.bossId = -1;
  g.bossLane = -1;
  g.nextBossAt = g.t + C.BOSS_PERIOD;
}

function updateBoss(g: GameState) {
  if (g.clashPhase !== 'none') return; // the arena duel takes precedence — no overlap
  const t = g.t;
  if (g.bossPhase === 'none') {
    if (t >= g.nextBossAt) {
      g.bossPhase = 'warn';
      g.bossUntil = t + C.BOSS_WARN;
      g.bossLane = bossTargetLane(g);
      emit(g, { t: 'bossWarn', lane: g.bossLane as TeamId, secs: C.BOSS_WARN });
    }
    return;
  }
  if (g.bossPhase === 'warn') {
    if (t >= g.bossUntil) spawnBoss(g);
    return;
  }
  // active: the boss lives in g.units (slayBoss handles its death). Safety net in
  // case it ever leaves play without a kill — don't let the timer wedge.
  if (!g.units.some(u => u.id === g.bossId && u.hp > 0)) {
    g.bossPhase = 'none';
    g.bossId = -1;
    g.bossLane = -1;
    g.nextBossAt = t + C.BOSS_PERIOD;
  }
}

// ---------------------------------------------------------------------- step

export function step(g: GameState, dt: number) {
  if (g.over) return;
  g.t += dt;
  updateClash(g);
  updateBoss(g);
  updateEconomy(g, dt);
  const clash = g.clashPhase === 'active';
  if (!clash) {
    // the lanes pause during the arena duel — it's a clean interlude
    updateSpawns(g);
    updateWildlife(g);
    updateRunes(g);
  }
  for (const pl of allPlayers(g)) updateHero(g, pl, dt);
  if (!clash) {
    updateUnits(g, dt);
    updateSummons(g, dt);
    updateTowers(g, dt);
  }
  updateProjectiles(g, dt); // hero spell projectiles fly in the arena too
  updateZones(g, dt);
  if (!clash) updateCastles(g);
  if (g.units.length > 0) g.units = g.units.filter(u => u.hp > 0);
  g.summons = g.summons.filter(s => s.hp > 0 && g.t < s.until);
}
