// ---------------------------------------------------------------------------
// Canvas renderer: the Sundered Vale, its monsters, heroes, magic and ruin.
// All sprites are procedural vector art — no image assets.
// Icon painters are exported for the DOM UI (shops, ability bar, portraits).
// ---------------------------------------------------------------------------

import type { AbilityDef, GameEvent, GameState, HeroState, SummonState, TeamId, UnitState, Vec, Zone } from './types';
import { C, castlePos, fountainPos, laneCenterX, laneOf, xpNeed } from './data/constants';
import { ABILITY_BY_ID, HERO_BY_ID } from './data/heroes';
import { UNIT_BY_ID } from './data/units';
import { ITEM_BY_ID, type ItemDef } from './data/items';
import { heroDef } from './engine';

type Ctx = CanvasRenderingContext2D;

// ------------------------------------------------------------ tiny helpers

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function circle(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}
function poly(ctx: Ctx, pts: number[][]) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

// ------------------------------------------------------------ unit sprites

/** Draw a unit mini (centered at 0,0; ~28px tall at scale 1). */
export function paintUnit(ctx: Ctx, defId: string, t: number, scale = 1, walking = true) {
  const def = UNIT_BY_ID[defId];
  const { a, b, c } = def.pal;
  const bob = walking ? Math.sin(t * 7) * 1.6 : 0;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(0, bob);
  switch (defId) {
    case 'goblin': {
      ctx.fillStyle = b; rr(ctx, -5, -4, 10, 12, 3); ctx.fill(); // tunic
      ctx.fillStyle = a; circle(ctx, 0, -9, 5.5); ctx.fill(); // head
      poly(ctx, [[-5, -11], [-9, -16], [-3, -12]]); ctx.fill(); // ears
      poly(ctx, [[5, -11], [9, -16], [3, -12]]); ctx.fill();
      ctx.fillStyle = c; circle(ctx, 5, 2, 3); ctx.fill(); // coin purse
      ctx.fillStyle = '#fff'; ctx.fillRect(-3, -10, 2, 2); ctx.fillRect(2, -10, 2, 2);
      break;
    }
    case 'skeleton': {
      ctx.strokeStyle = a; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 7); ctx.stroke(); // spine
      ctx.beginPath(); ctx.moveTo(-6, -1); ctx.lineTo(6, -1); ctx.moveTo(-5, 3); ctx.lineTo(5, 3); ctx.stroke(); // ribs
      ctx.fillStyle = a; circle(ctx, 0, -10, 5.5); ctx.fill();
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-3.4, -11.5, 2.6, 3); ctx.fillRect(0.8, -11.5, 2.6, 3);
      ctx.strokeStyle = b; ctx.beginPath(); ctx.moveTo(6, -2); ctx.lineTo(12, -8); ctx.stroke(); // rusty sword
      break;
    }
    case 'wolf': {
      ctx.fillStyle = a;
      poly(ctx, [[-11, 2], [-6, -5], [5, -6], [12, -1], [9, 5], [-7, 6]]); ctx.fill(); // body
      circle(ctx, 10, -4, 4.5); ctx.fill(); // head
      poly(ctx, [[8, -8], [7, -13], [11, -9]]); ctx.fill(); // ear
      ctx.fillStyle = c; circle(ctx, 11.5, -4.5, 1.2); ctx.fill(); // eye
      ctx.fillStyle = b; poly(ctx, [[-11, 2], [-16, -2], [-12, 4]]); ctx.fill(); // tail
      break;
    }
    case 'imp': {
      ctx.fillStyle = a; circle(ctx, 0, -2, 7); ctx.fill();
      circle(ctx, 0, -11, 5); ctx.fill();
      ctx.fillStyle = b; poly(ctx, [[-4, -14], [-7, -20], [-1, -15]]); ctx.fill();
      poly(ctx, [[4, -14], [7, -20], [1, -15]]); ctx.fill();
      ctx.fillStyle = c; circle(ctx, 0, -2, 3 + Math.sin(t * 10) * 0.8); ctx.fill(); // glowing belly bomb
      ctx.fillStyle = '#fff'; ctx.fillRect(-3, -12, 2, 2); ctx.fillRect(1, -12, 2, 2);
      break;
    }
    case 'ogre': {
      ctx.fillStyle = a; rr(ctx, -10, -8, 20, 20, 6); ctx.fill(); // slab body
      ctx.fillStyle = b; rr(ctx, -10, 4, 20, 8, 3); ctx.fill(); // loincloth
      circle(ctx, 0, -13, 7); ctx.fillStyle = a; ctx.fill();
      ctx.fillStyle = '#5d1f1f'; circle(ctx, -2.5, -14, 1.5); ctx.fill(); circle(ctx, 2.5, -14, 1.5); ctx.fill();
      ctx.strokeStyle = b; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(10, -4); ctx.lineTo(18, -14); ctx.stroke(); // club
      ctx.fillStyle = b; circle(ctx, 18, -14, 4); ctx.fill();
      break;
    }
    case 'priest': {
      ctx.fillStyle = b; poly(ctx, [[-7, 10], [0, -8], [7, 10]]); ctx.fill(); // robe
      ctx.fillStyle = a; circle(ctx, 0, -11, 5); ctx.fill();
      ctx.fillStyle = b; poly(ctx, [[-5, -12], [0, -20], [5, -12]]); ctx.fill(); // hood
      ctx.strokeStyle = c; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(9, -16); ctx.lineTo(9, -4); ctx.moveTo(5, -12); ctx.lineTo(13, -12); ctx.stroke(); // staff-cross
      break;
    }
    case 'banner': {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = a; poly(ctx, [[-6, 10], [0, -10], [6, 10]]); ctx.fill(); // wraith shroud
      ctx.fillStyle = b; circle(ctx, 0, -12, 4.5); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = b; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(8, 10); ctx.lineTo(8, -20); ctx.stroke();
      ctx.fillStyle = c; poly(ctx, [[8, -20], [20, -16], [8, -11]]); ctx.fill(); // war banner
      break;
    }
    case 'revenant': {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = a; poly(ctx, [[-8, 10], [0, -12], [8, 10]]); ctx.fill();
      ctx.fillStyle = c; circle(ctx, 0, -13, 5); ctx.fill();
      ctx.fillStyle = b; circle(ctx, -2, -14, 1.4); ctx.fill(); circle(ctx, 2, -14, 1.4); ctx.fill();
      ctx.globalAlpha = 1;
      // frost crystals
      ctx.strokeStyle = c; ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const ang = t * 1.5 + (i * Math.PI * 2) / 3;
        ctx.beginPath(); ctx.moveTo(Math.cos(ang) * 12, -2 + Math.sin(ang) * 6); ctx.lineTo(Math.cos(ang) * 16, -2 + Math.sin(ang) * 9); ctx.stroke();
      }
      break;
    }
    case 'harpy': {
      const flap = Math.sin(t * 9) * 6;
      ctx.fillStyle = a;
      poly(ctx, [[-3, -2], [-16, -6 - flap], [-6, 2]]); ctx.fill(); // wings
      poly(ctx, [[3, -2], [16, -6 - flap], [6, 2]]); ctx.fill();
      ctx.fillStyle = b; rr(ctx, -4, -6, 8, 12, 3); ctx.fill();
      ctx.fillStyle = c; circle(ctx, 0, -9, 4.5); ctx.fill();
      ctx.fillStyle = a; poly(ctx, [[0, -8], [4, -6], [0, -5]]); ctx.fill(); // beak
      break;
    }
    case 'golem': {
      ctx.fillStyle = a; rr(ctx, -11, -10, 22, 22, 5); ctx.fill();
      ctx.fillStyle = b; rr(ctx, -8, -16, 16, 10, 4); ctx.fill(); // head slab
      ctx.fillStyle = c; ctx.fillRect(-5, -13, 3, 3); ctx.fillRect(2, -13, 3, 3); // rune eyes
      ctx.strokeStyle = c; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(0, 4); ctx.lineTo(6, -2); ctx.stroke(); // cracks aglow
      ctx.fillStyle = b; rr(ctx, -15, -6, 5, 12, 2); ctx.fill(); rr(ctx, 10, -6, 5, 12, 2); ctx.fill(); // fists
      break;
    }
    case 'necro': {
      ctx.fillStyle = a; poly(ctx, [[-8, 11], [0, -10], [8, 11]]); ctx.fill();
      ctx.fillStyle = b; poly(ctx, [[-6, -10], [0, -19], [6, -10]]); ctx.fill();
      ctx.fillStyle = c; circle(ctx, 0, -12, 3.5); ctx.fill(); // glow under hood
      ctx.strokeStyle = c; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-10, -16); ctx.lineTo(-10, 6); ctx.stroke();
      circle(ctx, -10, -18, 3); ctx.stroke(); // skull staff
      break;
    }
    case 'siege': {
      ctx.fillStyle = b; rr(ctx, -13, -6, 26, 16, 4); ctx.fill(); // hull
      ctx.fillStyle = a; rr(ctx, -10, -14, 20, 9, 3); ctx.fill(); // ram housing
      ctx.fillStyle = c; circle(ctx, -7, 10, 4); ctx.fill(); circle(ctx, 7, 10, 4); ctx.fill(); // wheels
      ctx.strokeStyle = c; ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, -20 + Math.sin(t * 4) * 2); ctx.stroke(); // ram head
      ctx.fillStyle = c; circle(ctx, 0, -21 + Math.sin(t * 4) * 2, 3.4); ctx.fill();
      break;
    }
    case 'wyvern': {
      const flap = Math.sin(t * 7) * 8;
      ctx.fillStyle = a;
      poly(ctx, [[-2, -4], [-20, -10 - flap], [-8, 3]]); ctx.fill();
      poly(ctx, [[2, -4], [20, -10 - flap], [8, 3]]); ctx.fill();
      ctx.fillStyle = b; poly(ctx, [[-4, 8], [0, -10], [4, 8]]); ctx.fill(); // body
      circle(ctx, 0, -10, 5); ctx.fill();
      ctx.fillStyle = c; circle(ctx, -1.8, -11, 1.3); ctx.fill(); circle(ctx, 1.8, -11, 1.3); ctx.fill();
      poly(ctx, [[-3, 8], [0, 16], [3, 8]]); ctx.fillStyle = b; ctx.fill(); // tail
      break;
    }
    case 'avatar': {
      const pulse = 1 + Math.sin(t * 3) * 0.05;
      ctx.scale(pulse, pulse);
      ctx.fillStyle = b; rr(ctx, -14, -12, 28, 26, 7); ctx.fill();
      ctx.fillStyle = a; rr(ctx, -11, -20, 22, 12, 5); ctx.fill();
      ctx.fillStyle = c; ctx.fillRect(-7, -17, 4, 4); ctx.fillRect(3, -17, 4, 4); // burning eyes
      // horns
      ctx.strokeStyle = c; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-10, -20); ctx.quadraticCurveTo(-18, -26, -16, -34); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(10, -20); ctx.quadraticCurveTo(18, -26, 16, -34); ctx.stroke();
      // molten cracks
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(-2, 2); ctx.lineTo(-6, 9); ctx.moveTo(8, -4); ctx.lineTo(2, 2); ctx.lineTo(6, 9); ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

// ----------------------------------------------------------- hero sprites

export function paintHero(ctx: Ctx, h: HeroState, t: number, g?: GameState) {
  const def = HERO_BY_ID[h.defId];
  const p = def.palette;
  const scale = (h.d?.scale ?? 1) * 1.25;
  const colossus = h.buffs.some(b => b.id === 'colossus');
  const channeling = !!h.channel;
  const lunge = Math.max(0, 1 - (t - h.attackAnimT) * 4); // attack thrust
  ctx.save();
  ctx.scale(scale * (h.facing === -1 ? -1 : 1), scale);
  const bob = Math.sin(t * 4 + (h.team ? 2 : 0)) * 1.2;
  ctx.translate(0, bob);

  if (colossus) {
    // golden god-rays
    ctx.save();
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 6; i++) {
      const a = t * 0.8 + (i * Math.PI) / 3;
      ctx.strokeStyle = '#ffd86b';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(Math.cos(a) * 46, -10 + Math.sin(a) * 46); ctx.stroke();
    }
    ctx.restore();
  }

  // legs
  ctx.strokeStyle = p.main; ctx.lineWidth = 3.4;
  ctx.beginPath(); ctx.moveTo(-3, 6); ctx.lineTo(-4, 14); ctx.moveTo(3, 6); ctx.lineTo(4, 14); ctx.stroke();
  // torso by archetype
  ctx.fillStyle = p.main;
  if (def.weapon === 'orb' || def.weapon === 'staff') {
    poly(ctx, [[-8, 12], [-5, -6], [5, -6], [8, 12]]); ctx.fill(); // robe
    ctx.fillStyle = p.trim; ctx.fillRect(-5, -2, 10, 2.2); // sash
  } else {
    rr(ctx, -6.5, -7, 13, 15, 4); ctx.fill();
    ctx.fillStyle = p.trim; ctx.fillRect(-6.5, -2, 13, 2.4); // belt
  }
  // cape
  ctx.fillStyle = p.trim;
  ctx.globalAlpha = 0.65;
  poly(ctx, [[-6, -6], [-12 - Math.sin(t * 3) * 2, 10], [-5, 8]]); ctx.fill();
  ctx.globalAlpha = 1;
  // head
  ctx.fillStyle = p.skin; circle(ctx, 0, -12, 5.2); ctx.fill();
  ctx.fillStyle = p.hair;
  ctx.beginPath(); ctx.arc(0, -13.5, 5.4, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
  // weapon (drawn on facing side, with attack lunge)
  const wx = 8 + lunge * 7;
  ctx.strokeStyle = p.glow; ctx.fillStyle = p.glow; ctx.lineWidth = 2.6;
  switch (def.weapon) {
    case 'sword':
      ctx.save(); ctx.translate(wx, -2); ctx.rotate(-0.5 + lunge * 0.6);
      ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(0, -14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-3.4, 0); ctx.lineTo(3.4, 0); ctx.stroke();
      ctx.restore();
      // shield on off-hand
      ctx.fillStyle = p.main; ctx.strokeStyle = p.trim; ctx.lineWidth = 1.6;
      rr(ctx, -13, -7, 7, 11, 3); ctx.fill(); ctx.stroke();
      break;
    case 'axes':
      for (const side of [1, -0.45]) {
        ctx.save(); ctx.translate(wx * side, -3); ctx.rotate((-0.7 + lunge) * side);
        ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, -10); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -10, 5, Math.PI * 0.1, Math.PI * 0.9); ctx.fill();
        ctx.restore();
      }
      break;
    case 'bow':
      ctx.save(); ctx.translate(wx, -4);
      ctx.beginPath(); ctx.arc(0, 0, 9, -Math.PI / 2.3, Math.PI / 2.3); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Math.cos(-Math.PI / 2.3) * 9, Math.sin(-Math.PI / 2.3) * 9); ctx.lineTo(Math.cos(Math.PI / 2.3) * 9, Math.sin(Math.PI / 2.3) * 9); ctx.stroke();
      ctx.restore();
      break;
    case 'blades':
      for (const side of [1, -0.4]) {
        ctx.save(); ctx.translate(9 * side + lunge * 6, -2); ctx.rotate((0.5 + lunge * 0.8) * side);
        ctx.beginPath(); ctx.moveTo(0, 3); ctx.quadraticCurveTo(5, -4, 1, -12); ctx.stroke();
        ctx.restore();
      }
      break;
    case 'orb': {
      const orbY = -6 + Math.sin(t * 3) * 2;
      const grad = ctx.createRadialGradient(wx, orbY, 1, wx, orbY, 7);
      grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.4, p.glow); grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad; circle(ctx, wx, orbY, 7); ctx.fill();
      break;
    }
    case 'staff':
      ctx.beginPath(); ctx.moveTo(wx, 12); ctx.lineTo(wx, -16); ctx.stroke();
      // living bloom
      ctx.fillStyle = p.glow; circle(ctx, wx, -17, 3.4 + Math.sin(t * 5) * 0.8); ctx.fill();
      ctx.fillStyle = p.trim; circle(ctx, wx, -17, 1.6); ctx.fill();
      break;
  }
  // channel glow (wyrmfire wings)
  if (channeling) {
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#ff5e2b';
    const f = Math.sin(t * 10) * 3;
    poly(ctx, [[-4, -8], [-26, -18 - f], [-10, 0]]); ctx.fill();
    poly(ctx, [[4, -8], [26, -18 - f], [10, 0]]); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // shield bubble
  const shielded = h.buffs.some(b => (b.shield ?? 0) > 0);
  if (shielded) {
    ctx.save();
    ctx.globalAlpha = 0.35 + Math.sin(t * 6) * 0.1;
    ctx.strokeStyle = '#ffe9a0'; ctx.lineWidth = 2;
    circle(ctx, 0, -6, 24 * scale); ctx.stroke();
    ctx.restore();
  }
}

// --------------------------------------------------------------- summons

export function paintSummon(ctx: Ctx, s: SummonState, t: number) {
  ctx.save();
  switch (s.kind) {
    case 'owl': {
      const flap = Math.sin(t * 10 + s.id) * 4;
      ctx.fillStyle = s.theme.c1; ctx.globalAlpha = 0.9;
      poly(ctx, [[-2, 0], [-12, -4 - flap], [-4, 3]]); ctx.fill();
      poly(ctx, [[2, 0], [12, -4 - flap], [4, 3]]); ctx.fill();
      circle(ctx, 0, -2, 5); ctx.fill();
      ctx.fillStyle = '#fff'; circle(ctx, -1.8, -3, 1.3); ctx.fill(); circle(ctx, 1.8, -3, 1.3); ctx.fill();
      break;
    }
    case 'knight': {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = s.theme.c2; rr(ctx, -5, -6, 10, 13, 3); ctx.fill();
      ctx.fillStyle = s.theme.c1; circle(ctx, 0, -10, 4.4); ctx.fill();
      poly(ctx, [[0, -16], [2, -10], [-2, -10]]); ctx.fill(); // plume
      ctx.strokeStyle = s.theme.c1; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(7, 2); ctx.lineTo(12, -8); ctx.stroke();
      break;
    }
    case 'snapper': {
      const open = (Math.sin(t * 6 + s.id) + 1) / 2;
      ctx.fillStyle = s.theme.c2;
      ctx.strokeStyle = s.theme.c1; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-3, 10); ctx.quadraticCurveTo(-6, -2, 0, -6); ctx.quadraticCurveTo(6, -2, 3, 10); ctx.fill(); // stem
      // jaws
      ctx.fillStyle = s.theme.c1;
      ctx.save(); ctx.translate(0, -8);
      ctx.rotate(-0.3 - open * 0.5);
      poly(ctx, [[0, 0], [12, -3], [10, 2]]); ctx.fill();
      ctx.rotate(0.6 + open * 1.0);
      poly(ctx, [[0, 0], [12, 3], [10, -2]]); ctx.fill();
      ctx.restore();
      // teeth dots
      ctx.fillStyle = '#fff';
      circle(ctx, 7, -11 - open * 3, 1); ctx.fill();
      circle(ctx, 7, -5 + open * 3, 1); ctx.fill();
      break;
    }
    case 'decoy': {
      ctx.globalAlpha = 0.45 + Math.sin(t * 8) * 0.12;
      ctx.fillStyle = s.theme.c1;
      poly(ctx, [[-6, 12], [-4, -6], [4, -6], [6, 12]]); ctx.fill();
      circle(ctx, 0, -10, 4.6); ctx.fill();
      break;
    }
  }
  ctx.restore();
}

// ----------------------------------------------------------- icon painters

export function unitIconCanvas(defId: string, size = 44): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const def = UNIT_BY_ID[defId];
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#2a2438'); grad.addColorStop(1, '#171221');
  ctx.fillStyle = grad; rr(ctx, 0, 0, size, size, 6); ctx.fill();
  ctx.strokeStyle = def.legendary ? '#ff4d4d' : def.tier === 3 ? '#e3b341' : def.tier === 2 ? '#8a9bd1' : '#5d6b7a';
  ctx.lineWidth = 2; rr(ctx, 1, 1, size - 2, size - 2, 5); ctx.stroke();
  ctx.translate(size / 2, size / 2 + 6);
  paintUnit(ctx, defId, 1.2, size / 34, false);
  return cv;
}

export function heroPortraitCanvas(heroId: string, size = 64): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const def = HERO_BY_ID[heroId];
  const p = def.palette;
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#221c33'); grad.addColorStop(1, '#0e0b16');
  ctx.fillStyle = grad; rr(ctx, 0, 0, size, size, 8); ctx.fill();
  // glow halo
  const rg = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  rg.addColorStop(0, p.glow + '55'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, size, size);
  // bust: shoulders + head, larger than the field sprite
  const cx = size / 2, cy = size * 0.58;
  ctx.fillStyle = p.main;
  poly(ctx, [[cx - size * 0.32, size], [cx - size * 0.18, cy], [cx + size * 0.18, cy], [cx + size * 0.32, size]]); ctx.fill();
  ctx.fillStyle = p.trim; ctx.fillRect(cx - size * 0.2, cy + size * 0.12, size * 0.4, size * 0.05);
  ctx.fillStyle = p.skin; circle(ctx, cx, cy - size * 0.14, size * 0.17); ctx.fill();
  ctx.fillStyle = p.hair;
  ctx.beginPath(); ctx.arc(cx, cy - size * 0.18, size * 0.18, Math.PI * 0.9, Math.PI * 2.1); ctx.fill();
  ctx.fillStyle = '#0e0b16';
  ctx.fillRect(cx - size * 0.09, cy - size * 0.16, size * 0.05, size * 0.04);
  ctx.fillRect(cx + size * 0.04, cy - size * 0.16, size * 0.05, size * 0.04);
  ctx.strokeStyle = p.glow; ctx.lineWidth = 2; rr(ctx, 1, 1, size - 2, size - 2, 7); ctx.stroke();
  return cv;
}

export function abilityIconCanvas(ab: AbilityDef, size = 48): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, ab.theme.c2); grad.addColorStop(1, '#0e0b16');
  ctx.fillStyle = grad; rr(ctx, 0, 0, size, size, 8); ctx.fill();
  const cx = size / 2, cy = size / 2;
  ctx.strokeStyle = ab.theme.c1; ctx.fillStyle = ab.theme.c1; ctx.lineWidth = 2.6;
  // glyph by kind
  switch (ab.kind) {
    case 'coneSlash':
      ctx.beginPath(); ctx.arc(cx - 6, cy + 4, size * 0.38, -0.9, 0.7); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx - 6, cy + 4, size * 0.24, -0.9, 0.7); ctx.stroke();
      break;
    case 'targetStun':
      circle(ctx, cx, cy, size * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - size * 0.42); ctx.lineTo(cx, cy + size * 0.42); ctx.moveTo(cx - size * 0.42, cy); ctx.lineTo(cx + size * 0.42, cy); ctx.stroke();
      break;
    case 'nova':
      circle(ctx, cx, cy, size * 0.16); ctx.fill();
      circle(ctx, cx, cy, size * 0.3); ctx.stroke();
      ctx.globalAlpha = 0.5; circle(ctx, cx, cy, size * 0.4); ctx.stroke(); ctx.globalAlpha = 1;
      break;
    case 'zone':
      ctx.globalAlpha = 0.4; circle(ctx, cx, cy + 4, size * 0.32); ctx.fill(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.ellipse(cx, cy + 4, size * 0.36, size * 0.16, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'leapSlam':
      ctx.beginPath(); ctx.moveTo(cx - size * 0.3, cy + size * 0.25);
      ctx.quadraticCurveTo(cx, cy - size * 0.45, cx + size * 0.28, cy + size * 0.2); ctx.stroke();
      poly(ctx, [[cx + size * 0.28, cy + size * 0.2], [cx + size * 0.36, cy - 0], [cx + size * 0.14, cy + size * 0.08]]); ctx.fill();
      break;
    case 'projectile':
      ctx.beginPath(); ctx.moveTo(cx - size * 0.34, cy + size * 0.3); ctx.lineTo(cx + size * 0.3, cy - size * 0.26); ctx.stroke();
      poly(ctx, [[cx + size * 0.3, cy - size * 0.26], [cx + size * 0.34, cy - size * 0.05], [cx + size * 0.12, cy - size * 0.18]]); ctx.fill();
      break;
    case 'buffSelf':
      poly(ctx, [[cx, cy - size * 0.32], [cx + size * 0.26, cy + size * 0.05], [cx + size * 0.1, cy + size * 0.05], [cx + size * 0.1, cy + size * 0.32], [cx - size * 0.1, cy + size * 0.32], [cx - size * 0.1, cy + size * 0.05], [cx - size * 0.26, cy + size * 0.05]]);
      ctx.fill();
      break;
    case 'summon':
      circle(ctx, cx, cy, size * 0.3); ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        circle(ctx, cx + Math.cos(a) * size * 0.3, cy + Math.sin(a) * size * 0.3, 2.4); ctx.fill();
      }
      break;
    case 'dash':
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = 0.35 + i * 0.3;
        ctx.beginPath(); ctx.moveTo(cx - size * 0.32 + i * 8, cy + size * 0.18); ctx.lineTo(cx - size * 0.06 + i * 8, cy - size * 0.18); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    case 'wall':
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(cx + i * 9, cy - size * 0.3); ctx.quadraticCurveTo(cx + i * 9 + 4, cy, cx + i * 9, cy + size * 0.3); ctx.stroke();
      }
      break;
    case 'beam':
      ctx.beginPath(); ctx.moveTo(cx - size * 0.36, cy - size * 0.2);
      ctx.quadraticCurveTo(cx, cy + size * 0.5, cx + size * 0.36, cy - size * 0.2);
      ctx.quadraticCurveTo(cx, cy + size * 0.1, cx - size * 0.36, cy - size * 0.2);
      ctx.fill();
      break;
    case 'transform':
      poly(ctx, [[cx, cy - size * 0.36], [cx + size * 0.32, cy + size * 0.3], [cx - size * 0.32, cy + size * 0.3]]); ctx.stroke();
      circle(ctx, cx, cy + size * 0.04, size * 0.1); ctx.fill();
      break;
    case 'barrage':
      for (const [dx, dy, r] of [[-10, -6, 3], [4, -12, 2.4], [10, 2, 3.4], [-4, 8, 2.2]] as const) {
        circle(ctx, cx + dx, cy + dy, r); ctx.fill();
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.moveTo(cx + dx + 6, cy + dy - 8); ctx.lineTo(cx + dx, cy + dy); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      break;
    case 'mobileZone':
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.ellipse(cx, cy - 8 + i * 8, size * (0.12 + i * 0.09), size * 0.06, 0, 0, Math.PI * 2); ctx.stroke();
      }
      break;
  }
  ctx.strokeStyle = ab.cat === 'Ultimate' ? '#ffd86b' : '#00000000';
  if (ab.cat === 'Ultimate') { ctx.lineWidth = 2; rr(ctx, 1, 1, size - 2, size - 2, 7); ctx.stroke(); }
  return cv;
}

export function itemIconCanvas(def: ItemDef, size = 40): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, def.tier === 'forged' ? '#3a2c14' : '#262033');
  grad.addColorStop(1, '#0e0b16');
  ctx.fillStyle = grad; rr(ctx, 0, 0, size, size, 7); ctx.fill();
  ctx.strokeStyle = def.tier === 'forged' ? '#e3b341' : '#5d6b7a';
  ctx.lineWidth = 2; rr(ctx, 1, 1, size - 2, size - 2, 6); ctx.stroke();
  const cx = size / 2, cy = size / 2;
  ctx.strokeStyle = def.theme.c1; ctx.fillStyle = def.theme.c1; ctx.lineWidth = 2.4;
  switch (def.theme.glyph) {
    case 'sword':
      ctx.beginPath(); ctx.moveTo(cx - 8, cy + 9); ctx.lineTo(cx + 7, cy - 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 9, cy + 2); ctx.lineTo(cx - 2, cy + 9); ctx.stroke();
      break;
    case 'shield':
      poly(ctx, [[cx, cy - 10], [cx + 9, cy - 5], [cx + 7, cy + 6], [cx, cy + 11], [cx - 7, cy + 6], [cx - 9, cy - 5]]); ctx.stroke();
      break;
    case 'boot':
      poly(ctx, [[cx - 6, cy - 10], [cx + 1, cy - 10], [cx + 1, cy + 2], [cx + 9, cy + 6], [cx + 9, cy + 10], [cx - 6, cy + 10]]); ctx.fill();
      break;
    case 'fist':
      rr(ctx, cx - 8, cy - 6, 13, 13, 4); ctx.fill();
      ctx.fillRect(cx + 4, cy - 3, 6, 7);
      break;
    case 'orb': {
      const rg = ctx.createRadialGradient(cx, cy, 1, cx, cy, 10);
      rg.addColorStop(0, '#fff'); rg.addColorStop(0.5, def.theme.c1); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; circle(ctx, cx, cy, 10); ctx.fill();
      break;
    }
    case 'vial':
      poly(ctx, [[cx - 3, cy - 10], [cx + 3, cy - 10], [cx + 3, cy - 4], [cx + 8, cy + 7], [cx - 8, cy + 7]]); ctx.stroke();
      ctx.globalAlpha = 0.6;
      poly(ctx, [[cx - 5, cy + 2], [cx + 5, cy + 2], [cx + 7, cy + 6], [cx - 7, cy + 6]]); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case 'belt':
      rr(ctx, cx - 10, cy - 4, 20, 8, 3); ctx.stroke();
      rr(ctx, cx - 3, cy - 6, 6, 12, 2); ctx.fill();
      break;
    case 'rune':
      circle(ctx, cx, cy, 9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy + 9); ctx.moveTo(cx - 7, cy - 5); ctx.lineTo(cx + 7, cy + 5); ctx.stroke();
      break;
    case 'bolt':
      poly(ctx, [[cx + 2, cy - 11], [cx - 7, cy + 2], [cx - 1, cy + 2], [cx - 3, cy + 11], [cx + 7, cy - 2], [cx + 1, cy - 2]]); ctx.fill();
      break;
    case 'sunshield':
      poly(ctx, [[cx, cy - 10], [cx + 9, cy - 5], [cx + 7, cy + 6], [cx, cy + 11], [cx - 7, cy + 6], [cx - 9, cy - 5]]); ctx.stroke();
      circle(ctx, cx, cy, 4); ctx.fill();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 5.4, cy + Math.sin(a) * 5.4); ctx.lineTo(cx + Math.cos(a) * 7.4, cy + Math.sin(a) * 7.4); ctx.stroke();
      }
      break;
    case 'phoenix':
      ctx.beginPath(); ctx.arc(cx, cy + 2, 8, Math.PI, 0); ctx.stroke();
      for (const dx of [-6, 0, 6]) {
        ctx.beginPath(); ctx.moveTo(cx + dx, cy + 1); ctx.quadraticCurveTo(cx + dx + 2, cy - 7, cx + dx, cy - 11); ctx.stroke();
      }
      break;
    case 'book':
      rr(ctx, cx - 8, cy - 9, 16, 18, 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy + 9); ctx.stroke();
      ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.moveTo(cx - 5, cy - 4); ctx.lineTo(cx - 2, cy - 4); ctx.moveTo(cx + 2, cy - 4); ctx.lineTo(cx + 5, cy - 4); ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    case 'wingboot':
      poly(ctx, [[cx - 7, cy - 8], [cx, cy - 8], [cx, cy + 2], [cx + 8, cy + 6], [cx + 8, cy + 9], [cx - 7, cy + 9]]); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - 7, cy - 4); ctx.lineTo(cx - 13, cy - 9); ctx.moveTo(cx - 7, cy); ctx.lineTo(cx - 12, cy - 3); ctx.stroke();
      break;
    case 'crown':
      poly(ctx, [[cx - 9, cy + 6], [cx - 9, cy - 4], [cx - 4, cy + 0], [cx, cy - 7], [cx + 4, cy + 0], [cx + 9, cy - 4], [cx + 9, cy + 6]]); ctx.fill();
      break;
  }
  return cv;
}

// ------------------------------------------------------------ particle pool

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number;
  c: string; kind: 'dot' | 'spark' | 'ember' | 'smoke' | 'star' | 'leaf' | 'ring';
  grav?: number;
}
interface Floater {
  x: number; y: number; vy: number; text: string; color: string;
  size: number; life: number; maxLife: number; bold: boolean;
}
interface Beam { x1: number; y1: number; x2: number; y2: number; c: string; life: number; maxLife: number; w: number; }

// ------------------------------------------------------------ the renderer

export class Renderer {
  ctx: Ctx;
  terrain: HTMLCanvasElement;
  particles: Particle[] = [];
  floaters: Floater[] = [];
  beams: Beam[] = [];
  shake = 0;
  flash = 0;
  flashColor = '#ffffff';
  banner: { text: string; sub: string; life: number; maxLife: number; color: string } | null = null;

  constructor(public canvas: HTMLCanvasElement) {
    this.canvas.width = C.W;
    this.canvas.height = C.H;
    this.ctx = canvas.getContext('2d')!;
    this.terrain = document.createElement('canvas');
    this.terrain.width = C.W;
    this.terrain.height = C.H;
    this.paintTerrain(this.terrain.getContext('2d')!);
  }

  // ---------------------------------------------------------- static map
  paintTerrain(ctx: Ctx) {
    // night vale gradient
    const bg = ctx.createLinearGradient(0, 0, 0, C.H);
    bg.addColorStop(0, '#101426');
    bg.addColorStop(0.5, '#15192b');
    bg.addColorStop(1, '#0d1b18');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, C.W, C.H);

    // scattered stars
    for (let i = 0; i < 90; i++) {
      const x = (i * 137.5) % C.W;
      const y = (i * 73.3) % 100;
      ctx.fillStyle = `rgba(255,255,255,${0.2 + (i % 5) * 0.08})`;
      ctx.fillRect(x, y, 1.6, 1.6);
    }
    // twin moons
    for (const [mx, my, mr, mc] of [[330, 64, 26, '#cfd8ff'], [1280, 50, 17, '#ffd9c4']] as const) {
      const mg = ctx.createRadialGradient(mx, my, 2, mx, my, mr * 2.2);
      mg.addColorStop(0, mc + 'cc'); mg.addColorStop(0.4, mc + '33'); mg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = mg; circle(ctx, mx, my, mr * 2.2); ctx.fill();
      ctx.fillStyle = mc; circle(ctx, mx, my, mr); ctx.fill();
      ctx.fillStyle = mc === '#cfd8ff' ? '#b9c4f2' : '#f2c4ac';
      circle(ctx, mx - mr * 0.3, my - mr * 0.2, mr * 0.2); ctx.fill();
      circle(ctx, mx + mr * 0.35, my + mr * 0.3, mr * 0.14); ctx.fill();
    }

    // the sundered chasm down the middle
    const mid = C.W / 2;
    const ch = ctx.createLinearGradient(mid - 180, 0, mid + 180, 0);
    ch.addColorStop(0, 'rgba(0,0,0,0)');
    ch.addColorStop(0.5, '#05060d');
    ch.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ch;
    ctx.fillRect(mid - 180, 100, 360, C.H - 100);
    // chasm glow veins
    ctx.strokeStyle = 'rgba(125,184,255,0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      let y = 160 + i * 150;
      ctx.moveTo(mid - 40 + (i % 2) * 30, y);
      for (let k = 0; k < 4; k++) {
        y += 28;
        ctx.lineTo(mid - 40 + (i % 2) * 30 + Math.sin(i * 3 + k * 2) * 26, y);
      }
      ctx.stroke();
    }
    // runic sigils floating in the chasm
    for (let i = 0; i < 4; i++) {
      const y = 220 + i * 160;
      ctx.strokeStyle = 'rgba(157,109,240,0.5)';
      ctx.lineWidth = 1.6;
      circle(ctx, mid, y, 14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mid - 8, y + 6); ctx.lineTo(mid, y - 9); ctx.lineTo(mid + 8, y + 6); ctx.stroke();
    }
    // rope bridge
    ctx.strokeStyle = '#4a3823'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(mid - 160, 452); ctx.quadraticCurveTo(mid, 472, mid + 160, 452); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mid - 160, 432); ctx.quadraticCurveTo(mid, 452, mid + 160, 432); ctx.stroke();
    ctx.lineWidth = 2;
    for (let i = 0; i <= 10; i++) {
      const x = mid - 160 + i * 32;
      const sag = Math.sin((i / 10) * Math.PI) * 19;
      ctx.beginPath(); ctx.moveTo(x, 432 + sag); ctx.lineTo(x, 452 + sag); ctx.stroke();
    }

    // lanes
    for (const team of [0, 1] as TeamId[]) {
      const L = laneOf(team);
      const lw = L.x1 - L.x0;
      // grass apron
      const ap = ctx.createLinearGradient(L.x0 - 36, 0, L.x1 + 36, 0);
      ap.addColorStop(0, 'rgba(0,0,0,0)');
      ap.addColorStop(0.5, team === 0 ? '#16251f' : '#251a20');
      ap.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ap;
      ctx.fillRect(L.x0 - 36, C.SPAWN_Y - 50, lw + 72, C.CASTLE_Y - C.SPAWN_Y + 130);
      // cobble road
      const road = ctx.createLinearGradient(L.x0, 0, L.x1, 0);
      road.addColorStop(0, '#23202c');
      road.addColorStop(0.5, '#2e2a3a');
      road.addColorStop(1, '#23202c');
      ctx.fillStyle = road;
      rr(ctx, L.x0, C.SPAWN_Y - 30, lw, C.CASTLE_Y - C.SPAWN_Y + 60, 26);
      ctx.fill();
      // cobbles
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      for (let i = 0; i < 240; i++) {
        const x = L.x0 + 14 + ((i * 97.3) % (lw - 28));
        const y = C.SPAWN_Y - 16 + ((i * 53.7) % (C.CASTLE_Y - C.SPAWN_Y + 30));
        ctx.beginPath(); ctx.ellipse(x, y, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
      }
      // edge stones
      ctx.strokeStyle = 'rgba(190,200,230,0.18)';
      ctx.lineWidth = 3;
      rr(ctx, L.x0, C.SPAWN_Y - 30, lw, C.CASTLE_Y - C.SPAWN_Y + 60, 26);
      ctx.stroke();
      // grass tufts
      ctx.strokeStyle = team === 0 ? 'rgba(111,174,78,0.5)' : 'rgba(174,94,111,0.45)';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 70; i++) {
        const x = L.x0 - 26 + ((i * 89.1) % (lw + 52));
        const y = C.SPAWN_Y - 36 + ((i * 151.7) % (C.CASTLE_Y - C.SPAWN_Y + 100));
        if (x > L.x0 + 6 && x < L.x1 - 6) continue;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y - 6); ctx.moveTo(x, y); ctx.lineTo(x + 2.5, y - 5); ctx.stroke();
      }
      // torch posts
      ctx.fillStyle = '#3a3022';
      for (const side of [L.x0 - 14, L.x1 + 14]) {
        for (let y = 220; y < C.CASTLE_Y - 60; y += 170) {
          ctx.fillRect(side - 2.4, y - 26, 4.8, 26);
        }
      }
    }
    ctx.font = '600 15px Cinzel, Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(125,184,255,0.65)';
    ctx.fillText('DAWNHOLD', laneCenterX(0), C.H - 12);
    ctx.fillStyle = 'rgba(255,122,92,0.65)';
    ctx.fillText('DUSKREACH', laneCenterX(1), C.H - 12);
  }

  // --------------------------------------------------------------- events
  consume(events: GameEvent[], g: GameState, playerTeam: TeamId) {
    for (const e of events) {
      switch (e.t) {
        case 'dmg': {
          if (e.amount <= 0) {
            this.float(e.pos, 'MISS', '#9aa7b8', 12, false);
            break;
          }
          if (this.floaters.length < 70) {
            const col = e.target === 'hero' ? '#ff6b5c' : e.kind === 'magic' ? '#9d8cff' : '#f2e9d8';
            this.float(e.pos, String(Math.round(e.amount)), col, e.target === 'hero' ? 15 : 12.5, e.amount >= 100);
          }
          break;
        }
        case 'death': {
          const def = UNIT_BY_ID[e.defId];
          this.burst(e.pos, 5 + def.tier * 4, def.pal.a, 'dot', 2.4);
          this.burst(e.pos, 3 + def.tier * 2, '#d8d2c4', 'spark', 2);
          if (def.tier === 3) this.shakeIt(def.legendary ? 9 : 4);
          break;
        }
        case 'cast': {
          const ab = ABILITY_BY_ID[e.abId];
          this.burst(e.pos, 8, ab.theme.c1, 'spark', 3);
          if (e.ult) {
            this.shakeIt(8);
            this.flashScreen(ab.theme.c1, 0.22);
            this.showBanner(ab.name.toUpperCase(), '', ab.theme.c1, 2);
          }
          break;
        }
        case 'impact': {
          const th = e.theme;
          switch (e.kind) {
            case 'star':
              this.beam(e.pos.x + 60, e.pos.y - 130, e.pos.x, e.pos.y, th.c1, 0.3, 3);
              this.burst(e.pos, 12, th.c1, 'star', 3);
              this.ring(e.pos, th.c2, 3);
              break;
            case 'explode': case 'burst': case 'slam': case 'collapse':
              this.burst(e.pos, Math.min(26, 8 + e.r / 10), th.c1, e.kind === 'collapse' ? 'star' : 'ember', 3);
              this.ring(e.pos, th.c1, e.kind === 'slam' ? 4 : 3);
              if (e.r > 120) this.shakeIt(4);
              break;
            case 'roar':
              this.ring(e.pos, th.c1, 6);
              this.shakeIt(7);
              break;
            case 'nova': case 'cone':
              this.ring(e.pos, th.c1, 3);
              this.burst(e.pos, 10, th.c1, 'spark', 3);
              break;
            case 'heal':
              this.burst(e.pos, 3, th.c1, 'dot', 1.4);
              break;
            case 'blink':
              this.burst(e.pos, 9, th.c1, 'smoke', 2);
              break;
            case 'phoenix':
              this.burst(e.pos, 30, '#ffb347', 'ember', 4);
              this.ring(e.pos, '#ff5e2b', 5);
              this.shakeIt(5);
              break;
            case 'acid':
              this.burst(e.pos, 8, th.c1, 'dot', 2.4);
              break;
            case 'chomp':
              this.burst(e.pos, 5, th.c1, 'spark', 2);
              break;
            default:
              this.burst(e.pos, 7, th.c1, 'spark', 2.4);
          }
          break;
        }
        case 'gold':
          if (e.pos && this.floaters.length < 78) this.float({ x: e.pos.x, y: e.pos.y - 14 }, `+${Math.round(e.amount)}`, '#ffd86b', 11.5, false);
          break;
        case 'income': {
          const cp = castlePos(e.team);
          this.float({ x: cp.x, y: cp.y - 96 }, `INCOME +${e.amount}`, '#ffd86b', 17, true);
          this.burst({ x: cp.x, y: cp.y - 70 }, 12, '#ffd86b', 'spark', 2.6);
          break;
        }
        case 'levelup':
          this.float({ x: e.pos.x, y: e.pos.y - 30 }, 'LEVEL UP!', '#ffe9a0', 16, true);
          this.ring(e.pos, '#ffe9a0', 3);
          break;
        case 'forge': {
          const item = ITEM_BY_ID[e.itemId];
          const h = g.teams[e.team].hero;
          this.float({ x: h.pos.x, y: h.pos.y - 40 }, `⚒ ${item.name}`, '#e3b341', 15, true);
          this.burst(h.pos, 16, '#e3b341', 'spark', 3.4);
          break;
        }
        case 'castleHit': {
          const cp = castlePos(e.team);
          if (Math.random() < 0.3) this.burst({ x: cp.x + (Math.random() - 0.5) * 70, y: cp.y - 40 }, 4, '#ff8866', 'ember', 2);
          if (e.team === playerTeam && Math.random() < 0.2) this.shakeIt(1.6);
          break;
        }
        case 'castleShot':
          this.beam(e.from.x, e.from.y, e.to.x, e.to.y, '#ffe9a0', 0.16, 1.6);
          break;
        case 'volley': {
          const L = laneOf(e.team);
          for (let i = 0; i < 8; i++) {
            const x = L.x0 + 30 + Math.random() * (L.x1 - L.x0 - 60);
            const y = C.VOLLEY_Y + Math.random() * 200;
            this.beam(castlePos(e.team).x, castlePos(e.team).y - 80, x, y, '#ffd86b', 0.22, 1.4);
          }
          break;
        }
        case 'repair': {
          const cp = castlePos(e.team);
          this.float({ x: cp.x, y: cp.y - 80 }, 'REPAIRED', '#9fe8b0', 14, true);
          this.burst({ x: cp.x, y: cp.y - 40 }, 10, '#9fe8b0', 'spark', 2.4);
          break;
        }
        case 'upgrade': {
          const cp = castlePos(e.team);
          this.showBanner(`${e.team === 0 ? 'DAWNHOLD' : 'DUSKREACH'} — KEEP ${'I'.repeat(e.level)}`, 'New monsters unlocked', '#e3b341', 2.6);
          this.ring({ x: cp.x, y: cp.y - 40 }, '#e3b341', 6);
          this.shakeIt(3);
          break;
        }
        case 'heroDeath':
          this.burst(e.pos, 24, '#2b2030', 'smoke', 3.4);
          this.burst(e.pos, 12, '#ff6b5c', 'spark', 3);
          this.shakeIt(6);
          break;
        case 'heroSpawn':
          this.beam(e.pos.x, e.pos.y - 160, e.pos.x, e.pos.y, '#ffffff', 0.4, 6);
          this.burst(e.pos, 14, '#cfd8ff', 'spark', 3);
          break;
        case 'underdog':
          if (e.on) this.showBanner(`${e.team === 0 ? 'DAWNHOLD' : 'DUSKREACH'} RISES`, "Underdog's Favor: +25% income, +12% damage", '#7db8ff', 3);
          break;
        case 'twilight':
          this.flashScreen('#9d6df0', 0.3);
          this.showBanner(`TWILIGHT ${'✦'.repeat(Math.min(6, e.level))}`, 'The walls grow brittle. The gates howl.', '#9d6df0', 2.8);
          this.shakeIt(5);
          break;
        case 'proc': {
          if (e.itemId === 'stormfang' && e.targets) {
            for (let i = 0; i + 1 < e.targets.length; i++) {
              this.beam(e.targets[i].x, e.targets[i].y, e.targets[i + 1].x, e.targets[i + 1].y, '#7db8ff', 0.25, 2.6);
            }
          }
          break;
        }
        case 'win':
          this.flashScreen(e.team === playerTeam ? '#ffd86b' : '#1a1430', 0.5);
          this.shakeIt(10);
          break;
      }
    }
  }

  // ------------------------------------------------------------ fx helpers
  burst(pos: Vec, n: number, c: string, kind: Particle['kind'], speed: number) {
    if (this.particles.length > 520) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.3 + Math.random() * 0.7) * speed * 60;
      this.particles.push({
        x: pos.x, y: pos.y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - (kind === 'ember' ? 40 : 0),
        life: 0, maxLife: 0.4 + Math.random() * 0.6,
        size: kind === 'smoke' ? 5 + Math.random() * 5 : 1.6 + Math.random() * 2.4,
        c, kind,
        grav: kind === 'spark' || kind === 'star' ? 140 : kind === 'smoke' ? -30 : 0,
      });
    }
  }
  ring(pos: Vec, c: string, scale: number) {
    this.particles.push({ x: pos.x, y: pos.y, vx: 0, vy: 0, life: 0, maxLife: 0.45, size: scale * 16, c, kind: 'ring' });
  }
  beam(x1: number, y1: number, x2: number, y2: number, c: string, life: number, w: number) {
    this.beams.push({ x1, y1, x2, y2, c, life, maxLife: life, w });
  }
  float(pos: Vec, text: string, color: string, size: number, bold: boolean) {
    this.floaters.push({ x: pos.x + (Math.random() - 0.5) * 14, y: pos.y - 12, vy: -42, text, color, size, life: 0, maxLife: bold ? 1.5 : 1.0, bold });
  }
  shakeIt(n: number) { this.shake = Math.min(14, this.shake + n); }
  flashScreen(c: string, a: number) { this.flash = Math.max(this.flash, a); this.flashColor = c; }
  showBanner(text: string, sub: string, color: string, dur: number) {
    this.banner = { text, sub, life: dur, maxLife: dur, color };
  }

  // ---------------------------------------------------------------- frame
  draw(g: GameState, dt: number, playerTeam: TeamId) {
    const ctx = this.ctx;
    const t = g.t;
    ctx.save();
    ctx.clearRect(0, 0, C.W, C.H);
    if (this.shake > 0.1) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      this.shake *= Math.pow(0.0018, dt); // fast decay
    } else this.shake = 0;

    ctx.drawImage(this.terrain, 0, 0);

    // twilight dusk tint
    if (g.twilightLevel > 0) {
      ctx.fillStyle = `rgba(120,70,200,${Math.min(0.18, 0.05 + g.twilightLevel * 0.02)})`;
      ctx.fillRect(0, 0, C.W, C.H);
    }

    this.drawTorches(ctx, t);
    this.drawPortals(ctx, g, t);
    for (const z of g.zones) this.drawZone(ctx, z, g, t);
    this.drawFountains(ctx, g, t);
    this.drawCastles(ctx, g, t);

    // units sorted by y for painter's depth
    const sorted = [...g.units].sort((a, b) => a.pos.y - b.pos.y);
    for (const u of sorted) this.drawUnit(ctx, u, g, t);
    for (const s of g.summons) {
      ctx.save();
      ctx.translate(s.pos.x, s.pos.y);
      // soft shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(0, 12, 9, 3.4, 0, 0, Math.PI * 2); ctx.fill();
      paintSummon(ctx, s, t);
      if (s.maxHp > 0 && s.hp < s.maxHp) this.bar(ctx, -10, -22, 20, 3, s.hp / s.maxHp, '#9fe8b0');
      ctx.restore();
    }
    for (const team of g.teams) this.drawHero(ctx, team.hero, g, t);
    for (const pr of g.projectiles) this.drawProjectile(ctx, pr, t);

    this.drawParticles(ctx, dt);
    this.drawBeams(ctx, dt);
    this.drawFloaters(ctx, dt);

    // full-screen flash
    if (this.flash > 0.005) {
      ctx.globalAlpha = this.flash;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, C.W, C.H);
      ctx.globalAlpha = 1;
      this.flash *= Math.pow(0.001, dt);
    }
    // event banner
    if (this.banner) {
      const b = this.banner;
      b.life -= dt;
      if (b.life <= 0) this.banner = null;
      else {
        const a = Math.min(1, b.life / 0.4, (b.maxLife - b.life) / 0.25);
        ctx.globalAlpha = a;
        ctx.textAlign = 'center';
        ctx.font = '900 44px Cinzel, Georgia, serif';
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color; ctx.shadowBlur = 24;
        ctx.fillText(b.text, C.W / 2, 200);
        ctx.shadowBlur = 0;
        if (b.sub) {
          ctx.font = '600 19px Cinzel, Georgia, serif';
          ctx.fillStyle = '#f2e9d8';
          ctx.fillText(b.sub, C.W / 2, 234);
        }
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  drawTorches(ctx: Ctx, t: number) {
    for (const team of [0, 1] as TeamId[]) {
      const L = laneOf(team);
      for (const side of [L.x0 - 14, L.x1 + 14]) {
        for (let y = 220; y < C.CASTLE_Y - 60; y += 170) {
          const fl = Math.sin(t * 9 + y + side) * 1.6;
          const grad = ctx.createRadialGradient(side, y - 30, 1, side, y - 30, 14);
          grad.addColorStop(0, 'rgba(255,200,100,0.8)');
          grad.addColorStop(1, 'rgba(255,120,40,0)');
          ctx.fillStyle = grad;
          circle(ctx, side, y - 30, 14); ctx.fill();
          ctx.fillStyle = '#ffcf6b';
          ctx.beginPath();
          ctx.ellipse(side + fl * 0.4, y - 31 - Math.abs(fl), 2.6, 5 + fl, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  drawPortals(ctx: Ctx, g: GameState, t: number) {
    for (const team of [0, 1] as TeamId[]) {
      const x = laneCenterX(team);
      const y = C.SPAWN_Y - 26;
      const congested = g.teams[1 - team].sendQueue.length; // queue of the SENDER feeding this lane
      ctx.save();
      ctx.translate(x, y);
      // stone arch
      ctx.strokeStyle = '#4a4458';
      ctx.lineWidth = 10;
      ctx.beginPath(); ctx.arc(0, 14, 46, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = '#39334a';
      ctx.fillRect(-52, 8, 12, 22); ctx.fillRect(40, 8, 12, 22);
      // swirling void
      const swirl = ctx.createRadialGradient(0, 16, 2, 0, 16, 42);
      const cc = team === 0 ? '#ff7a5c' : '#7db8ff'; // portal glows with the ATTACKER's color
      swirl.addColorStop(0, '#fff');
      swirl.addColorStop(0.35, cc);
      swirl.addColorStop(1, 'rgba(8,8,16,0.9)');
      ctx.globalAlpha = 0.75 + Math.sin(t * 3) * 0.1;
      ctx.fillStyle = swirl;
      ctx.beginPath(); ctx.arc(0, 16, 41, Math.PI, 0); ctx.fill();
      ctx.globalAlpha = 1;
      // rotating glyph ring
      ctx.strokeStyle = cc;
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const a = t * 1.2 + (i / 5) * Math.PI;
        const px = Math.cos(a) * 30, py = 16 - Math.abs(Math.sin(a)) * 22;
        ctx.globalAlpha = 0.6;
        ctx.strokeRect(px - 2.4, py - 2.4, 4.8, 4.8);
      }
      ctx.globalAlpha = 1;
      if (congested > 0) {
        ctx.font = '700 13px Cinzel, Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = cc;
        ctx.fillText(`⚔ ${congested}`, 0, -44);
      }
      ctx.restore();
    }
  }

  drawFountains(ctx: Ctx, g: GameState, t: number) {
    for (const team of [0, 1] as TeamId[]) {
      const fp = fountainPos(team);
      ctx.save();
      ctx.translate(fp.x, fp.y);
      const pulse = 0.8 + Math.sin(t * 2.4) * 0.2;
      const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, 34 * pulse);
      grad.addColorStop(0, 'rgba(159,232,176,0.7)');
      grad.addColorStop(1, 'rgba(159,232,176,0)');
      ctx.fillStyle = grad;
      circle(ctx, 0, 0, 34 * pulse); ctx.fill();
      ctx.strokeStyle = '#7a8a96';
      ctx.lineWidth = 3;
      circle(ctx, 0, 0, 18); ctx.stroke();
      ctx.fillStyle = 'rgba(159,232,200,0.8)';
      circle(ctx, 0, 0, 13); ctx.fill();
      for (let i = 0; i < 3; i++) {
        const a = t * 2 + (i * Math.PI * 2) / 3;
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        circle(ctx, Math.cos(a) * 8, Math.sin(a) * 5 - 4, 1.8); ctx.fill();
      }
      ctx.restore();
    }
  }

  drawCastles(ctx: Ctx, g: GameState, t: number) {
    for (const team of g.teams) {
      const cp = castlePos(team.id);
      const main = team.id === 0 ? '#3c63b0' : '#b03c4e';
      const light = team.id === 0 ? '#7db8ff' : '#ff7a5c';
      ctx.save();
      ctx.translate(cp.x, cp.y);
      // glow when in last stand
      if (team.lastStand) {
        const gr = ctx.createRadialGradient(0, -30, 10, 0, -30, 130);
        gr.addColorStop(0, 'rgba(255,80,60,0.30)');
        gr.addColorStop(1, 'rgba(255,80,60,0)');
        ctx.fillStyle = gr;
        circle(ctx, 0, -30, 130); ctx.fill();
      }
      // walls
      ctx.fillStyle = '#3a3548';
      rr(ctx, -120, -38, 240, 76, 8); ctx.fill();
      ctx.fillStyle = '#2c283a';
      for (let i = -110; i <= 96; i += 26) ctx.fillRect(i, -46, 15, 12); // crenellations
      // gate
      ctx.fillStyle = '#1c1826';
      ctx.beginPath(); ctx.arc(0, 16, 30, Math.PI, 0); ctx.fill();
      ctx.fillRect(-30, 16, 60, 22);
      ctx.strokeStyle = '#4a4458'; ctx.lineWidth = 3;
      for (let i = -20; i <= 20; i += 10) { ctx.beginPath(); ctx.moveTo(i, -8); ctx.lineTo(i, 36); ctx.stroke(); }
      // keep towers — one per keep level
      for (let k = 0; k < team.baseLevel; k++) {
        const tx = (k - (team.baseLevel - 1) / 2) * 64;
        ctx.fillStyle = '#454058';
        rr(ctx, tx - 19, -96, 38, 62, 5); ctx.fill();
        ctx.fillStyle = '#2c283a';
        for (let i = -16; i <= 6; i += 11) ctx.fillRect(tx + i, -103, 8, 9);
        // window glow
        ctx.fillStyle = light;
        rr(ctx, tx - 5, -82, 10, 14, 4); ctx.fill();
        // banner
        ctx.fillStyle = main;
        ctx.beginPath();
        ctx.moveTo(tx + 19, -92);
        ctx.lineTo(tx + 19 + 20, -86 + Math.sin(t * 3 + k) * 2);
        ctx.lineTo(tx + 19, -76);
        ctx.fill();
      }
      // castle hp bar
      const pct = team.castleHp / team.castleMaxHp;
      this.bar(ctx, -90, -118, 180, 9, pct, pct < 0.25 ? '#ff5e4d' : pct < 0.55 ? '#ffb347' : light);
      ctx.restore();
    }
  }

  drawUnit(ctx: Ctx, u: UnitState, g: GameState, t: number) {
    const def = UNIT_BY_ID[u.defId];
    ctx.save();
    const air = g.t < u.airborneUntil;
    const lift = air ? -26 - Math.sin((u.airborneUntil - g.t) * 6) * 4 : 0;
    ctx.translate(u.pos.x, u.pos.y + lift);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath(); ctx.ellipse(0, 12 - lift, def.tier >= 3 ? 14 : 9, def.tier >= 3 ? 5 : 3.4, 0, 0, Math.PI * 2); ctx.fill();
    if (def.flying) {
      ctx.translate(0, -16 + Math.sin(t * 2.4 + u.bob) * 4);
    }
    // status tints
    const slowed = g.t < u.slowUntil;
    const stunned = g.t < u.ccUntil && !air;
    const confused = g.t < u.confuseUntil;
    const feared = g.t < u.fearUntil;
    paintUnit(ctx, u.defId, t + u.bob, def.tier === 3 ? 1.35 : def.legendary ? 1.6 : 1, !stunned);
    if (slowed) {
      ctx.strokeStyle = 'rgba(140,210,255,0.8)';
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + t * 0.5;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * 10, -4 + Math.sin(a) * 10); ctx.lineTo(Math.cos(a) * 13, -4 + Math.sin(a) * 13); ctx.stroke();
      }
    }
    if (stunned) {
      for (let i = 0; i < 3; i++) {
        const a = t * 5 + (i * Math.PI * 2) / 3;
        ctx.fillStyle = '#ffe9a0';
        circle(ctx, Math.cos(a) * 10, -22 + Math.sin(a) * 3, 1.8); ctx.fill();
      }
    }
    if (confused) {
      ctx.fillStyle = '#ffd1ec';
      ctx.font = '10px serif'; ctx.textAlign = 'center';
      ctx.fillText('?', 6, -20);
      ctx.fillText('?', -6, -24);
    }
    if (feared) {
      ctx.fillStyle = '#c5a8ff';
      ctx.font = '10px serif'; ctx.textAlign = 'center';
      ctx.fillText('!', 0, -22);
    }
    // dots burning
    if (u.dots.length > 0 && Math.random() < 0.25) {
      this.burst({ x: u.pos.x, y: u.pos.y - 8 }, 1, '#ff8c42', 'ember', 1.2);
    }
    // hp bar
    const w = def.tier >= 3 ? 30 : 20;
    this.bar(ctx, -w / 2, def.legendary ? -42 : -28, w, 3.2, u.hp / u.maxHp, u.owner === 1 ? '#7db8ff' : '#ff7a5c');
    ctx.restore();
  }

  drawHero(ctx: Ctx, h: HeroState, g: GameState, t: number) {
    if (h.dead) {
      // grave marker fades during respawn
      const team = g.teams[h.team];
      const fp = fountainPos(h.team);
      const remain = Math.max(0, h.respawnAt - g.t);
      ctx.save();
      ctx.translate(fp.x, fp.y - 54);
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = '#9aa7b8';
      ctx.font = '700 16px Cinzel, Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(`☠ ${Math.ceil(remain)}s`, 0, 0);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(h.pos.x, h.pos.y);
    const def = HERO_BY_ID[h.defId];
    // team ring
    ctx.strokeStyle = h.team === 0 ? 'rgba(125,184,255,0.65)' : 'rgba(255,122,92,0.65)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 13, 15 * (h.d?.scale ?? 1), 5.4 * (h.d?.scale ?? 1), 0, 0, Math.PI * 2); ctx.stroke();
    // buff glow
    for (const b of h.buffs) {
      if (b.theme && b.until - g.t > 0.05 && b.theme !== 'stun' && b.theme !== 'fear') {
        const ab = ABILITY_BY_ID[b.theme];
        if (ab) {
          ctx.globalAlpha = 0.22 + Math.sin(t * 5) * 0.07;
          const grad = ctx.createRadialGradient(0, -6, 2, 0, -6, 26);
          grad.addColorStop(0, ab.theme.c1);
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
          circle(ctx, 0, -6, 26); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }
    paintHero(ctx, h, t, g);
    // stun stars / fear mark
    if (h.buffs.some(b => b.stun)) {
      for (let i = 0; i < 3; i++) {
        const a = t * 5 + (i * Math.PI * 2) / 3;
        ctx.fillStyle = '#ffe9a0';
        circle(ctx, Math.cos(a) * 13, -30 + Math.sin(a) * 3, 2.2); ctx.fill();
      }
    }
    if (h.buffs.some(b => b.fear)) {
      ctx.fillStyle = '#ff4d4d';
      ctx.font = '700 16px serif'; ctx.textAlign = 'center';
      ctx.fillText('!', 0, -34);
    }
    // bars + level
    const sc = h.d?.scale ?? 1;
    this.bar(ctx, -17, -34 * sc, 34, 4, h.hp / h.d.maxHp, h.team === 0 ? '#7df3a0' : '#ff9a7a');
    this.bar(ctx, -17, -29 * sc, 34, 2.6, h.mana / h.d.maxMana, '#7db8ff');
    ctx.fillStyle = '#0e0b16';
    circle(ctx, 21, -30 * sc, 8); ctx.fill();
    ctx.strokeStyle = '#e3b341'; ctx.lineWidth = 1.4;
    circle(ctx, 21, -30 * sc, 8); ctx.stroke();
    ctx.fillStyle = '#ffe9a0';
    ctx.font = '700 10px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(h.level), 21, -30 * sc + 0.5);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  drawProjectile(ctx: Ctx, pr: { pos: Vec; vel: Vec; theme: { c1: string; c2: string }; boomerang: number; kind: string; r: number }, t: number) {
    ctx.save();
    ctx.translate(pr.pos.x, pr.pos.y);
    const ang = Math.atan2(pr.vel.y, pr.vel.x);
    if (pr.boomerang) {
      // spinning axe
      ctx.rotate(t * 18);
      ctx.strokeStyle = pr.theme.c1; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.stroke();
      ctx.fillStyle = pr.theme.c1;
      ctx.beginPath(); ctx.arc(7, 0, 5, -Math.PI / 2, Math.PI / 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-7, 0, 5, Math.PI / 2, -Math.PI / 2); ctx.fill();
    } else if (pr.kind === 'phys') {
      // arrow / bolt
      ctx.rotate(ang);
      ctx.strokeStyle = pr.theme.c1; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(7, 0); ctx.stroke();
      ctx.fillStyle = pr.theme.c1;
      poly(ctx, [[7, 0], [2, -3], [2, 3]]); ctx.fill();
      ctx.globalAlpha = 0.4;
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-18, 0); ctx.stroke();
    } else {
      // magic bolt with glow trail
      const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, pr.r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.4, pr.theme.c1);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      circle(ctx, 0, 0, pr.r); ctx.fill();
      ctx.rotate(ang);
      ctx.globalAlpha = 0.5;
      const tr = ctx.createLinearGradient(-30, 0, 0, 0);
      tr.addColorStop(0, 'rgba(0,0,0,0)');
      tr.addColorStop(1, pr.theme.c1);
      ctx.fillStyle = tr;
      poly(ctx, [[-30, -2], [0, -4], [0, 4], [-30, 2]]); ctx.fill();
    }
    ctx.restore();
  }

  drawZone(ctx: Ctx, z: Zone, g: GameState, t: number) {
    const remain = z.until - g.t;
    const age = g.t - z.born;
    ctx.save();
    ctx.translate(z.pos.x, z.pos.y);
    switch (z.kind) {
      case 'burn': {
        ctx.globalAlpha = Math.min(0.55, remain);
        const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, z.r);
        grad.addColorStop(0, '#ff8c42');
        grad.addColorStop(0.6, '#c2401f');
        grad.addColorStop(1, 'rgba(80,20,0,0)');
        ctx.fillStyle = grad;
        circle(ctx, 0, 0, z.r); ctx.fill();
        if (Math.random() < 0.5) this.burst({ x: z.pos.x + (Math.random() - 0.5) * z.r * 1.4, y: z.pos.y + (Math.random() - 0.5) * z.r }, 1, '#ffb347', 'ember', 1);
        break;
      }
      case 'gravity': {
        ctx.globalAlpha = 0.5;
        for (let i = 0; i < 3; i++) {
          const rr0 = z.r * (1 - ((t * 0.5 + i / 3) % 1));
          ctx.strokeStyle = z.theme.c1;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.5 * (rr0 / z.r);
          ctx.beginPath(); ctx.ellipse(0, 0, rr0, rr0 * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
        }
        break;
      }
      case 'root': {
        ctx.globalAlpha = Math.min(0.8, remain * 2);
        ctx.strokeStyle = z.theme.c1;
        ctx.lineWidth = 2.4;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + (z.id % 7);
          const rx = Math.cos(a) * z.r * 0.75, ry = Math.sin(a) * z.r * 0.45;
          ctx.beginPath();
          ctx.moveTo(rx, ry + 6);
          ctx.quadraticCurveTo(rx + 5, ry - 8, rx - 3, ry - 16 - Math.sin(t * 4 + i) * 3);
          ctx.stroke();
        }
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = z.theme.c1;
        ctx.beginPath(); ctx.ellipse(0, 0, z.r * 0.8, z.r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'spore': case 'pollen': {
        ctx.globalAlpha = Math.min(0.5, remain);
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + t * 0.6;
          ctx.fillStyle = i % 2 ? z.theme.c1 : z.theme.c2;
          circle(ctx, Math.cos(a) * z.r * 0.5, Math.sin(a) * z.r * 0.3, 8 + Math.sin(t * 3 + i) * 3);
          ctx.fill();
        }
        break;
      }
      case 'banner': {
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = z.theme.c2; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, -34); ctx.stroke();
        ctx.fillStyle = z.theme.c1;
        poly(ctx, [[0, -34], [24 + Math.sin(t * 4) * 3, -27], [0, -19]]); ctx.fill();
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = z.theme.c1;
        ctx.beginPath(); ctx.ellipse(0, 0, z.r, z.r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'collapse': {
        const p = Math.min(1, age / Math.max(0.05, z.until - z.born));
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = z.theme.c1;
        ctx.lineWidth = 3 + p * 3;
        circle(ctx, 0, 0, z.r * (1 - p * 0.7)); ctx.stroke();
        const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, z.r * (1 - p * 0.5));
        grad.addColorStop(0, '#ffffffaa');
        grad.addColorStop(0.5, z.theme.c1 + '66');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        circle(ctx, 0, 0, z.r * (1 - p * 0.5)); ctx.fill();
        break;
      }
      case 'wall': {
        ctx.globalAlpha = Math.min(0.75, remain);
        for (let i = 0; i < 12; i++) {
          const x = -z.p.len / 2 + (i / 11) * z.p.len;
          const wob = Math.sin(t * 10 + i * 1.7) * 5;
          ctx.strokeStyle = i % 2 ? z.theme.c1 : z.theme.c2;
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(x, 18);
          ctx.quadraticCurveTo(x + wob, 0, x, -20);
          ctx.stroke();
        }
        break;
      }
      case 'tempest': {
        // THE TORNADO
        ctx.globalAlpha = 0.85;
        for (let i = 0; i < 6; i++) {
          const ry = -i * 13;
          const rw = 12 + i * 11;
          const sway = Math.sin(t * 7 + i * 0.9) * (3 + i);
          ctx.strokeStyle = i % 2 ? z.theme.c1 : z.theme.c2;
          ctx.lineWidth = 3.4 - i * 0.35;
          ctx.beginPath();
          ctx.ellipse(sway, ry, rw, rw * 0.34, 0, t * 8 + i, t * 8 + i + Math.PI * 1.6);
          ctx.stroke();
        }
        // debris
        for (let i = 0; i < 4; i++) {
          const a = t * 9 + (i * Math.PI) / 2;
          const rr0 = 20 + ((t * 60 + i * 23) % 40);
          ctx.fillStyle = '#8a7a5d';
          ctx.fillRect(Math.cos(a) * rr0 - 2, -30 - ((t * 50 + i * 31) % 50) + Math.sin(a) * rr0 * 0.3, 4, 4);
        }
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = z.theme.c1;
        ctx.beginPath(); ctx.ellipse(0, 4, z.r, z.r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'blackhole': {
        // EVENT HORIZON
        const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, z.r);
        grad.addColorStop(0, '#000000');
        grad.addColorStop(0.35, '#0a0618');
        grad.addColorStop(0.55, z.theme.c2 + '88');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        circle(ctx, 0, 0, z.r); ctx.fill();
        // accretion ring
        ctx.save();
        ctx.rotate(t * 2.2);
        ctx.strokeStyle = z.theme.c2;
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.ellipse(0, 0, z.r * 0.42, z.r * 0.16, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#6de0e8';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.ellipse(0, 0, z.r * 0.52, z.r * 0.2, 0, 0.6, Math.PI * 1.4); ctx.stroke();
        ctx.restore();
        // infalling streaks
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + t * 3;
          const d0 = z.r * (1 - ((t * 0.9 + i * 0.13) % 1));
          ctx.strokeStyle = z.theme.c2;
          ctx.globalAlpha = 0.7 * (d0 / z.r);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * d0, Math.sin(a) * d0 * 0.7);
          ctx.lineTo(Math.cos(a) * (d0 - 14), Math.sin(a) * (d0 - 14) * 0.7);
          ctx.stroke();
        }
        // bright photon ring
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6;
        circle(ctx, 0, 0, z.r * 0.3); ctx.stroke();
        break;
      }
      case 'starfall': {
        ctx.globalAlpha = 0.16 + Math.sin(t * 5) * 0.05;
        const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, z.r);
        grad.addColorStop(0, z.theme.c1);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        circle(ctx, 0, 0, z.r); ctx.fill();
        break;
      }
      case 'beamfire': {
        // RIVER OF DRAGONFIRE — full lane width at the sweeping front
        const L = laneOf(z.owner);
        ctx.restore(); // leave local transform; paint in world space
        ctx.save();
        const w = z.p.width;
        const grad = ctx.createLinearGradient(0, z.pos.y - w, 0, z.pos.y + w);
        grad.addColorStop(0, 'rgba(255,94,43,0)');
        grad.addColorStop(0.45, '#ff5e2b');
        grad.addColorStop(0.55, '#ffd86b');
        grad.addColorStop(1, 'rgba(255,94,43,0)');
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = grad;
        ctx.fillRect(L.x0 + 4, z.pos.y - w, L.x1 - L.x0 - 8, w * 2);
        // flame tongues
        for (let i = 0; i < 14; i++) {
          const x = L.x0 + 20 + (i / 13) * (L.x1 - L.x0 - 40);
          const fl = Math.sin(t * 11 + i * 2.3) * 12;
          ctx.fillStyle = i % 2 ? '#ffb347' : '#ff5e2b';
          poly(ctx, [[x - 7, z.pos.y], [x, z.pos.y - w * 0.8 - fl], [x + 7, z.pos.y]]);
          ctx.fill();
        }
        if (Math.random() < 0.8) {
          this.burst({ x: L.x0 + 20 + Math.random() * (L.x1 - L.x0 - 40), y: z.pos.y }, 2, '#ffb347', 'ember', 2);
        }
        break;
      }
    }
    ctx.restore();
  }

  drawParticles(ctx: Ctx, dt: number) {
    ctx.save();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.grav) p.vy += p.grav * dt;
      const a = 1 - p.life / p.maxLife;
      ctx.globalAlpha = a;
      switch (p.kind) {
        case 'ring': {
          const r = p.size * (0.3 + (p.life / p.maxLife) * 1.4);
          ctx.strokeStyle = p.c;
          ctx.lineWidth = 3 * a;
          circle(ctx, p.x, p.y, r); ctx.stroke();
          break;
        }
        case 'smoke':
          ctx.fillStyle = p.c;
          ctx.globalAlpha = a * 0.4;
          circle(ctx, p.x, p.y, p.size * (1 + p.life * 2)); ctx.fill();
          break;
        case 'star':
          ctx.fillStyle = p.c;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.life * 6);
          for (let k = 0; k < 4; k++) {
            ctx.rotate(Math.PI / 2);
            poly(ctx, [[0, -p.size * 1.8], [p.size * 0.4, 0], [-p.size * 0.4, 0]]);
            ctx.fill();
          }
          ctx.restore();
          break;
        default:
          ctx.fillStyle = p.c;
          circle(ctx, p.x, p.y, p.size * a); ctx.fill();
      }
    }
    ctx.restore();
  }

  drawBeams(ctx: Ctx, dt: number) {
    ctx.save();
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      if (b.life <= 0) { this.beams.splice(i, 1); continue; }
      const a = b.life / b.maxLife;
      ctx.globalAlpha = a;
      ctx.strokeStyle = b.c;
      ctx.lineWidth = b.w;
      ctx.shadowColor = b.c;
      ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  drawFloaters(ctx: Ctx, dt: number) {
    ctx.save();
    ctx.textAlign = 'center';
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life += dt;
      if (f.life >= f.maxLife) { this.floaters.splice(i, 1); continue; }
      f.y += f.vy * dt;
      f.vy *= 1 - dt * 1.4;
      const a = 1 - Math.pow(f.life / f.maxLife, 2);
      ctx.globalAlpha = a;
      ctx.font = `${f.bold ? '800' : '600'} ${f.size}px Georgia, serif`;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }

  bar(ctx: Ctx, x: number, y: number, w: number, h: number, pct: number, color: string) {
    ctx.fillStyle = 'rgba(8,6,14,0.85)';
    rr(ctx, x - 1, y - 1, w + 2, h + 2, 2); ctx.fill();
    if (pct > 0) {
      ctx.fillStyle = color;
      rr(ctx, x, y, Math.max(1.5, w * Math.min(1, pct)), h, 1.6); ctx.fill();
    }
  }
}
