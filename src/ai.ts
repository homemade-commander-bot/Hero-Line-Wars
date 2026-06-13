// ---------------------------------------------------------------------------
// The AI commanders. Each AI player runs the same TeamInput + shop calls as
// a human. No resource cheats: difficulty changes reaction speed, aim and
// (for Squire) a self-inflicted price markup. In 3v3 your allies are these.
// ---------------------------------------------------------------------------

import type { GameState, HeroState, PlayerState, TeamId, UnitState, Vec } from './types';
import { C, fountainPos, laneCenterX, laneOf } from './data/constants';
import { HERO_BY_ID } from './data/heroes';
import { UNIT_BY_ID } from './data/units';
import { ITEM_BY_ID } from './data/items';
import {
  abilityOf, heroDef, tryBuyItem, tryBuyStat, tryRepair, trySend, tryUpgradeKeep,
} from './engine';

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

// item build orders per attribute (basics only; the forge does the rest)
const BUILDS: Record<string, string[]> = {
  str: ['girdle', 'ironbark', 'whetstone', 'vial', 'longblade', 'girdle', 'plate', 'charm', 'gauntlets', 'whetstone', 'focus'],
  agi: ['whetstone', 'gauntlets', 'boots', 'gauntlets', 'whetstone', 'vial', 'girdle', 'ironbark', 'longblade', 'girdle', 'plate'],
  int: ['orb', 'vial', 'tome', 'focus', 'orb', 'focus', 'charm', 'plate', 'girdle', 'boots', 'vial'],
};

// send strategies by keep level
const STRATS: Record<string, { keep: number; list: string[] }> = {
  swarm: { keep: 1, list: ['skeleton', 'skeleton', 'goblin', 'wolf'] },
  wolves: { keep: 1, list: ['wolf', 'wolf', 'imp', 'goblin'] },
  sappers: { keep: 1, list: ['imp', 'goblin', 'imp', 'skeleton'] },
  bruise: { keep: 2, list: ['ogre', 'priest', 'ogre', 'banner'] },
  assassin: { keep: 2, list: ['harpy', 'imp', 'revenant', 'harpy'] },
  chill: { keep: 2, list: ['revenant', 'ogre', 'priest', 'banner'] },
  siege: { keep: 3, list: ['golem', 'siege', 'priest', 'banner'] },
  dragons: { keep: 3, list: ['wyvern', 'wyvern', 'banner', 'priest'] },
  recycler: { keep: 3, list: ['necro', 'skeleton', 'skeleton', 'ogre', 'skeleton'] },
  doom: { keep: 3, list: ['avatar', 'priest', 'banner', 'ogre'] },
};

function pickStrategy(g: GameState, pl: PlayerState): string {
  // read a random enemy commander and counter them
  const foes = g.teams[1 - pl.team].players;
  const eDef = HERO_BY_ID[foes[Math.floor(g.rng() * foes.length)].hero.defId];
  const pool = Object.entries(STRATS).filter(([, s]) => s.keep <= pl.baseLevel);
  const weights = pool.map(([name]) => {
    let w = 1;
    if (eDef.attr === 'int') {
      if (name === 'siege' || name === 'bruise' || name === 'doom') w += 1.6;
      if (name === 'swarm' && g.t > 600) w -= 0.5;
    }
    if (eDef.atkRange < 200) {
      if (name === 'assassin' || name === 'dragons' || name === 'chill') w += 1.4;
    } else {
      if (name === 'swarm' || name === 'wolves' || name === 'bruise' || name === 'recycler') w += 1.2;
    }
    if (name === 'doom' && pl.gold < 1400) w = 0;
    return Math.max(0.05, w);
  });
  let total = weights.reduce((a, b) => a + b, 0);
  let roll = g.rng() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i][0];
  }
  return pool[pool.length - 1][0];
}

interface Cluster { pos: Vec; count: number; value: number; }

function laneUnits(g: GameState, lane: TeamId): UnitState[] {
  return g.units.filter(u => u.lane === lane && u.hp > 0);
}

function unitValue(u: UnitState): number {
  return u.raised ? 12 : UNIT_BY_ID[u.defId].cost;
}

function bestCluster(units: UnitState[], r: number): Cluster | null {
  let best: Cluster | null = null;
  for (const u of units) {
    let count = 0, value = 0;
    for (const v of units) {
      if (dist(u.pos, v.pos) <= r) { count++; value += unitValue(v); }
    }
    if (!best || value > best.value) best = { pos: { ...u.pos }, count, value };
  }
  return best;
}

function totalValue(units: UnitState[]): number {
  return units.reduce((s, u) => s + unitValue(u), 0);
}

export function aiThink(g: GameState, pl: PlayerState) {
  const ai = pl.ai;
  if (!ai || g.over) return;
  if (g.t < ai.nextThinkAt) return;
  ai.nextThinkAt = g.t + ai.thinkInterval;

  const skip = ai.priceMult > 1 ? 0.3 : ai.thinkInterval <= 0.55 ? 0 : 0.08;
  if (g.rng() < skip) return; // a moment of hesitation

  micro(g, pl);
  macro(g, pl);
}

// ------------------------------------------------------------------- micro

function micro(g: GameState, pl: PlayerState) {
  const ai = pl.ai!;
  const h = pl.hero;
  if (h.dead) return;
  const def = heroDef(h);
  const units = laneUnits(g, pl.team);
  const fp = fountainPos(pl.team);
  const hpPct = h.hp / h.d.maxHp;
  const input = pl.input;
  input.moveTo = null; // AI steers directly

  // allies hold formation: spread across the lane by slot
  const slot = g.teams[pl.team].players.indexOf(pl);
  const n = g.teams[pl.team].players.length;
  const L = laneOf(pl.team);
  const spreadX = n > 1 ? (slot - (n - 1) / 2) * (L.x1 - L.x0) * 0.26 : 0;

  // --- positioning -------------------------------------------------------
  let desired: Vec;
  const retreating = hpPct < ai.retreatPct || (hpPct < 0.55 && h.hp < 250);
  if (retreating) {
    desired = { x: fp.x, y: fp.y };
  } else if (units.length === 0) {
    desired = { x: laneCenterX(pl.team) + spreadX, y: 540 };
  } else {
    let deepest = units[0];
    for (const u of units) if (u.pos.y > deepest.pos.y) deepest = u;
    const cl = bestCluster(units, 160)!;
    const focus = deepest.pos.y > 620 ? deepest.pos : cl.pos;
    if (def.atkRange > 200) {
      desired = { x: focus.x + spreadX * 0.5 + (focus.x > laneCenterX(pl.team) ? -60 : 60), y: focus.y + def.atkRange * 0.62 };
      let nearestMelee = Infinity;
      for (const u of units) {
        const d0 = dist(u.pos, h.pos);
        if (UNIT_BY_ID[u.defId].range < 80 && d0 < nearestMelee) nearestMelee = d0;
      }
      if (nearestMelee < 110 && hpPct < 0.8) desired = { x: h.pos.x + (h.pos.x - focus.x), y: h.pos.y + 130 };
    } else {
      desired = { x: focus.x + spreadX * 0.35, y: focus.y + 26 };
    }
  }
  const dx = desired.x - h.pos.x, dy = desired.y - h.pos.y;
  const l0 = Math.hypot(dx, dy);
  input.move = l0 < 14 ? { x: 0, y: 0 } : { x: dx / l0, y: dy / l0 };

  // --- aiming + casting ----------------------------------------------------
  if (units.length === 0 || h.channel) return;
  const cl = bestCluster(units, 145)!;
  const jit = () => (g.rng() - 0.5) * 2 * ai.aimJitter;
  const aimAt = (p: Vec) => { input.aim = { x: p.x + jit(), y: p.y + jit() }; };
  aimAt(cl.pos);

  const emergencyY = units.some(u => u.pos.y > 690);
  const laneVal = totalValue(units);

  for (let slot2 = 0; slot2 < 4; slot2++) {
    if (g.t < h.cds[slot2]) continue;
    const ab = abilityOf(h, slot2);
    if (!ab || h.mana < ab.mana) continue;
    if (slot2 === 3 && h.level < C.ULT_LEVEL) continue;

    const p = ab.p;
    let cast = false;

    if (slot2 === 3) {
      if (laneVal >= ai.ultThreshold || (emergencyY && laneVal >= ai.ultThreshold * 0.55) || (g.teams[pl.team].castleHp / g.teams[pl.team].castleMaxHp < 0.35 && units.length >= 4)) {
        switch (ab.kind) {
          case 'beam': cast = true; break;
          case 'transform': {
            const near = units.filter(u => dist(u.pos, h.pos) < 320).length;
            cast = near >= 3;
            break;
          }
          case 'summon': aimAt({ x: cl.pos.x, y: Math.min(cl.pos.y + 60, 700) }); cast = true; break;
          case 'barrage': case 'mobileZone': case 'callDown': aimAt(cl.pos); cast = true; break;
          case 'buildTower': aimAt({ x: laneCenterX(pl.team), y: 470 }); cast = true; break; // grand bastion mid-lane
          case 'zone': aimAt(cl.pos); cast = cl.count >= 3; break;
          default: cast = true;
        }
      }
    } else {
      switch (ab.kind) {
        case 'coneSlash': case 'nova': {
          const reach = (p.range ?? p.r ?? 160) + 30;
          const near = units.filter(u => dist(u.pos, h.pos) <= reach);
          cast = near.length >= 3 || totalValue(near) >= 100 || (emergencyY && near.length >= 1);
          break;
        }
        case 'targetStun': {
          const big = units.find(u => dist(u.pos, h.pos) <= (p.range ?? 250) && u.maxHp >= 380);
          if (big) { aimAt(big.pos); cast = true; }
          else if (emergencyY) { cast = units.some(u => dist(u.pos, h.pos) <= (p.range ?? 250)); }
          break;
        }
        case 'zone': case 'wall': case 'callDown': case 'mobileZone': {
          if (cl.count >= 3 || cl.value >= 130 || emergencyY) {
            aimAt({ x: cl.pos.x, y: cl.pos.y + (ab.kind === 'wall' ? 70 : ab.kind === 'callDown' ? 45 : 18) });
            cast = true;
          }
          break;
        }
        case 'projectile': {
          cast = cl.count >= 2 || cl.value >= 110 || emergencyY;
          break;
        }
        case 'leapSlam': {
          const hpOk = hpPct > 0.45;
          cast = hpOk && (cl.count >= 3 || cl.value >= 140) && dist(cl.pos, h.pos) <= (p.dash ?? 280);
          break;
        }
        case 'summon': {
          cast = laneVal >= 260 || units.some(u => UNIT_BY_ID[u.defId].tier === 3);
          if (cast) aimAt({ x: cl.pos.x, y: cl.pos.y + 40 });
          break;
        }
        case 'dash': {
          if (hpPct < 0.4 && units.some(u => dist(u.pos, h.pos) < 110)) {
            aimAt({ x: fp.x, y: fp.y });
            cast = true;
          }
          break;
        }
        case 'buffSelf': {
          const defensive = p.heal || p.healMissPct || p.shield || p.armor || p.dodge;
          const engagedBy = units.filter(u => dist(u.pos, h.pos) < 200).length;
          if (p.empowerTowers) cast = g.towers.some(tw => tw.player === pl.id) && (cl.count >= 3 || hpPct < 0.6);
          else if (defensive) cast = hpPct < 0.55 || (hpPct < 0.78 && engagedBy >= 3);
          else cast = units.filter(u => dist(u.pos, h.pos) < 380).length >= 3;
          break;
        }
        case 'buildTower': {
          // build the maze: cap towers, place them mid-lane to lengthen the path
          const myTowers = g.towers.filter(tw => tw.player === pl.id).length;
          if (myTowers < 7 && (cl.count >= 2 || laneVal >= 80)) {
            // alternate sides so the path zig-zags
            const side = (myTowers % 2) ? 0.62 : 0.38;
            const L = laneOf(pl.team);
            aimAt({ x: L.x0 + (L.x1 - L.x0) * side, y: 300 + (myTowers % 3) * 130 });
            cast = true;
          }
          break;
        }
      }
    }
    if (cast) {
      input.cast[slot2] = true;
      break; // one spell per think — looks human, prevents mana dumps
    }
  }
}

// ------------------------------------------------------------------- macro

function macro(g: GameState, pl: PlayerState) {
  const ai = pl.ai!;
  const enemyTeam = g.teams[1 - pl.team];
  const t = g.t;

  if (t >= ai.strategyUntil) {
    ai.strategy = pickStrategy(g, pl);
    ai.strategyUntil = t + 75 + g.rng() * 35;
  }

  const wantKeep2 = pl.baseLevel === 1 && (t > 270 || pl.income > 95);
  const wantKeep3 = pl.baseLevel === 2 && (t > 800 || pl.income > 260);
  const keepCost = C.KEEP_COSTS[pl.baseLevel + 1] ?? Infinity;
  let reserve = 70;
  if (wantKeep2 || wantKeep3) {
    if (pl.gold >= keepCost * ai.priceMult + 120) {
      tryUpgradeKeep(g, pl, ai.priceMult);
    } else {
      reserve += keepCost * 0.35;
    }
  }

  const myTeam = g.teams[pl.team];
  if (myTeam.castleHp / myTeam.castleMaxHp < 0.55 && pl.gold > 450 && t >= pl.repairReadyAt) {
    tryRepair(g, pl, ai.priceMult);
  }

  // burst logic: when defenders are down, flood the gate
  const deadFoes = enemyTeam.players.filter(p => p.hero.dead).length;
  const allDown = deadFoes === enemyTeam.players.length;
  const enemyDesperate = enemyTeam.castleHp / enemyTeam.castleMaxHp < 0.32;
  let sendFrac = t < 300 ? 0.66 : t < 900 ? 0.52 : 0.58;
  if (allDown || enemyDesperate) sendFrac = 1.0;
  else if (deadFoes > 0) sendFrac += 0.18;
  if (g.twilightLevel > 0) sendFrac = Math.max(sendFrac, 0.8);
  sendFrac *= ai.sendMult;

  // sends FIRST — income is the engine of the war; items eat the leftovers
  const strat = STRATS[ai.strategy] ?? STRATS.swarm;
  let budget = Math.max(0, (pl.gold - reserve)) * sendFrac;
  let idx = 0, safety = 0;
  while (budget > 0 && safety++ < 40) {
    const defId = strat.list[idx % strat.list.length];
    const u = UNIT_BY_ID[defId];
    const eff = u.tier <= pl.baseLevel ? defId : 'skeleton';
    const cost = UNIT_BY_ID[eff].cost * ai.priceMult;
    if (cost > budget || cost > pl.gold) break;
    if (!trySend(g, pl, eff, ai.priceMult)) break;
    budget -= cost;
    idx++;
  }

  buyItems(g, pl);

  if (pl.gold > 520) {
    const attr = HERO_BY_ID[pl.hero.defId].attr;
    const roll = g.rng();
    const key = roll < 0.5 ? attr : roll < 0.78 ? 'dmg' : 'armor';
    tryBuyStat(g, pl, key as any, ai.priceMult);
  }
}

function buyItems(g: GameState, pl: PlayerState) {
  const ai = pl.ai!;
  const build = BUILDS[HERO_BY_ID[pl.hero.defId].attr];
  if (ai.buildIndex >= build.length) return;
  const next = build[ai.buildIndex];
  const cost = (ITEM_BY_ID[next]?.cost ?? 9999) * ai.priceMult;
  if (pl.gold < cost + 180) return;
  if (tryBuyItem(g, pl, next, ai.priceMult)) {
    ai.buildIndex++;
    ai.lastBuyAt = g.t;
  }
}
