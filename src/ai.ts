// ---------------------------------------------------------------------------
// The enemy warlord. Plays through the same TeamInput + shop calls as a
// human. No resource cheats: difficulty changes reaction speed, aim and
// (for Squire) a self-inflicted price markup.
// ---------------------------------------------------------------------------

import type { GameState, TeamId, TeamState, UnitState, Vec } from './types';
import { C, fountainPos, laneCenterX } from './data/constants';
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

function pickStrategy(g: GameState, team: TeamState): string {
  const enemy = g.teams[1 - team.id];
  const eDef = HERO_BY_ID[enemy.hero.defId];
  const pool = Object.entries(STRATS).filter(([, s]) => s.keep <= team.baseLevel);
  const weights = pool.map(([name]) => {
    let w = 1;
    // counter-picking: mages hate golems, melee hates wings, archers drown in bodies
    if (eDef.attr === 'int') {
      if (name === 'siege' || name === 'bruise' || name === 'doom') w += 1.6;
      if (name === 'swarm' && g.t > 600) w -= 0.5;
    }
    if (eDef.atkRange < 200) {
      if (name === 'assassin' || name === 'dragons' || name === 'chill') w += 1.4;
    } else {
      if (name === 'swarm' || name === 'wolves' || name === 'bruise' || name === 'recycler') w += 1.2;
    }
    if (name === 'doom' && team.gold < 1400) w = 0;
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

export function aiThink(g: GameState, teamId: TeamId) {
  const team = g.teams[teamId];
  const ai = team.ai;
  if (!ai || g.over) return;
  if (g.t < ai.nextThinkAt) return;
  ai.nextThinkAt = g.t + ai.thinkInterval;

  const skip = ai.priceMult > 1 ? 0.3 : ai.thinkInterval <= 0.55 ? 0 : 0.08;
  if (g.rng() < skip) return; // a moment of hesitation

  micro(g, team);
  macro(g, team);
}

// ------------------------------------------------------------------- micro

function micro(g: GameState, team: TeamState) {
  const ai = team.ai!;
  const h = team.hero;
  if (h.dead) return;
  const def = heroDef(h);
  const units = laneUnits(g, team.id);
  const fp = fountainPos(team.id);
  const hpPct = h.hp / h.d.maxHp;
  const input = team.input;

  // --- positioning -------------------------------------------------------
  let desired: Vec;
  const retreating = hpPct < ai.retreatPct || (hpPct < 0.55 && h.hp < 250);
  if (retreating) {
    desired = { x: fp.x, y: fp.y };
  } else if (units.length === 0) {
    desired = { x: laneCenterX(team.id), y: 540 };
  } else {
    // weighted toward the deepest threat
    let deepest = units[0];
    for (const u of units) if (u.pos.y > deepest.pos.y) deepest = u;
    const cl = bestCluster(units, 160)!;
    const focus = deepest.pos.y > 620 ? deepest.pos : cl.pos;
    if (def.atkRange > 200) {
      desired = { x: focus.x + (focus.x > laneCenterX(team.id) ? -60 : 60), y: focus.y + def.atkRange * 0.62 };
      // melee breathing room
      let nearestMelee = Infinity;
      for (const u of units) {
        const d0 = dist(u.pos, h.pos);
        if (UNIT_BY_ID[u.defId].range < 80 && d0 < nearestMelee) nearestMelee = d0;
      }
      if (nearestMelee < 110 && hpPct < 0.8) desired = { x: h.pos.x + (h.pos.x - focus.x), y: h.pos.y + 130 };
    } else {
      desired = { x: focus.x, y: focus.y + 26 };
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

  for (let slot = 0; slot < 4; slot++) {
    if (g.t < h.cds[slot]) continue;
    const ab = abilityOf(h, slot);
    if (!ab || h.mana < ab.mana) continue;
    if (slot === 3 && h.level < C.ULT_LEVEL) continue;

    const p = ab.p;
    let cast = false;

    if (slot === 3) {
      // ultimates wait for a wave worth the glory
      if (laneVal >= ai.ultThreshold || (emergencyY && laneVal >= ai.ultThreshold * 0.55) || (team.castleHp / team.castleMaxHp < 0.35 && units.length >= 4)) {
        switch (ab.kind) {
          case 'beam': cast = true; break; // sweeps the whole lane anyway
          case 'transform': {
            const near = units.filter(u => dist(u.pos, h.pos) < 320).length;
            cast = near >= 3;
            break;
          }
          case 'summon': aimAt({ x: cl.pos.x, y: Math.min(cl.pos.y + 60, 700) }); cast = true; break;
          case 'barrage': case 'mobileZone': aimAt(cl.pos); cast = true; break;
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
            // walls, roots and called strikes land a touch downstream to catch the march
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
          // escape hatch
          if (hpPct < 0.4 && units.some(u => dist(u.pos, h.pos) < 110)) {
            aimAt({ x: fp.x, y: fp.y });
            cast = true;
          }
          break;
        }
        case 'buffSelf': {
          const defensive = p.heal || p.healMissPct || p.shield || p.armor || p.dodge;
          const engagedBy = units.filter(u => dist(u.pos, h.pos) < 200).length;
          if (defensive) cast = hpPct < 0.55 || (hpPct < 0.78 && engagedBy >= 3);
          else cast = units.filter(u => dist(u.pos, h.pos) < 380).length >= 3;
          break;
        }
      }
    }
    if (cast) {
      team.input.cast[slot] = true;
      break; // one spell per think — looks human, prevents mana dumps
    }
  }
}

// ------------------------------------------------------------------- macro

function macro(g: GameState, team: TeamState) {
  const ai = team.ai!;
  const enemy = g.teams[1 - team.id];
  const t = g.t;

  // rotate strategy
  if (t >= ai.strategyUntil) {
    ai.strategy = pickStrategy(g, team);
    ai.strategyUntil = t + 75 + g.rng() * 35;
  }

  // keep upgrades: the backbone of the build
  const wantKeep2 = team.baseLevel === 1 && (t > 270 || team.income > 95);
  const wantKeep3 = team.baseLevel === 2 && (t > 800 || team.income > 260);
  const keepCost = C.KEEP_COSTS[team.baseLevel + 1] ?? Infinity;
  let reserve = 70;
  if (wantKeep2 || wantKeep3) {
    if (team.gold >= keepCost * ai.priceMult + 120) {
      tryUpgradeKeep(g, team, ai.priceMult);
    } else {
      // save toward it without strangling the war effort
      reserve += keepCost * 0.35;
    }
  }

  // repair when the walls are crumbling
  if (team.castleHp / team.castleMaxHp < 0.55 && team.gold > 450 && t >= team.repairReadyAt) {
    tryRepair(g, team, ai.priceMult);
  }

  // burst logic: when the defender is down, flood the gate
  const enemyDown = enemy.hero.dead;
  const enemyDesperate = enemy.castleHp / enemy.castleMaxHp < 0.32;
  let sendFrac = t < 300 ? 0.66 : t < 900 ? 0.52 : 0.58;
  if (enemyDown || enemyDesperate) sendFrac = 1.0;
  if (g.twilightLevel > 0) sendFrac = Math.max(sendFrac, 0.8);
  sendFrac *= ai.sendMult;

  // sends FIRST — income is the engine of the war; items eat the leftovers
  const strat = STRATS[ai.strategy] ?? STRATS.swarm;
  let budget = Math.max(0, (team.gold - reserve)) * sendFrac;
  let idx = 0, safety = 0;
  while (budget > 0 && safety++ < 40) {
    const defId = strat.list[idx % strat.list.length];
    const u = UNIT_BY_ID[defId];
    const eff = u.tier <= team.baseLevel ? defId : 'skeleton'; // locked tiers fall back to bones
    const cost = UNIT_BY_ID[eff].cost * ai.priceMult;
    if (cost > budget || cost > team.gold) break;
    if (!trySend(g, team, eff, ai.priceMult)) break;
    budget -= cost;
    idx++;
  }

  // items: follow the build with what's left
  buyItems(g, team);

  // spare gold becomes muscle
  if (team.gold > 520) {
    const h = team.hero;
    const attr = HERO_BY_ID[h.defId].attr;
    const roll = g.rng();
    const key = roll < 0.5 ? attr : roll < 0.78 ? 'dmg' : 'armor';
    tryBuyStat(g, team, key as any, ai.priceMult);
  }
}

function buyItems(g: GameState, team: TeamState) {
  const ai = team.ai!;
  const build = BUILDS[HERO_BY_ID[team.hero.defId].attr];
  if (ai.buildIndex >= build.length) return;
  const next = build[ai.buildIndex];
  const cost = (ITEM_BY_ID[next]?.cost ?? 9999) * ai.priceMult;
  // always leave a cushion so the gate never goes hungry
  if (team.gold < cost + 180) return;
  if (tryBuyItem(g, team, next, ai.priceMult)) {
    ai.buildIndex++;
    ai.lastBuyAt = g.t;
  }
}
