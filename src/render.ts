// ---------------------------------------------------------------------------
// Canvas renderer v2 — "the late-90s patch."
// Painted look: 3-tone shading, dark outlines, walk cycles, textured terrain,
// additive-glow magic. Still 100% procedural; no assets.
// ---------------------------------------------------------------------------

import type { AbilityDef, GameEvent, GameState, HeroState, SummonState, TeamId, UnitState, Vec, Zone } from './types';
import { C, castlePos, fountainPos, laneCenterX, laneOf } from './data/constants';
import { ABILITY_BY_ID, HERO_BY_ID } from './data/heroes';
import { UNIT_BY_ID } from './data/units';
import { ITEM_BY_ID, type ItemDef } from './data/items';

type Ctx = CanvasRenderingContext2D;

// ------------------------------------------------------------ paint helpers

const OUTLINE = 'rgba(12,9,20,0.85)';

/** shade a #rrggbb color: amt>0 lightens toward white, amt<0 darkens. */
function sh(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

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

/** shaded ellipse: lit from above, outlined. The bread and butter of every sprite. */
function blob(ctx: Ctx, x: number, y: number, rx: number, ry: number, color: string, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  const g = ctx.createLinearGradient(0, -ry, 0, ry);
  g.addColorStop(0, sh(color, 0.22));
  g.addColorStop(0.55, color);
  g.addColorStop(1, sh(color, -0.3));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.restore();
}

/** shaded polygon with outline. */
function plate(ctx: Ctx, pts: number[][], color: string) {
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  const g = ctx.createLinearGradient(0, minY, 0, maxY);
  g.addColorStop(0, sh(color, 0.2));
  g.addColorStop(0.6, color);
  g.addColorStop(1, sh(color, -0.28));
  poly(ctx, pts);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

/** an outlined limb stroke — legs, arms, hafts. */
function limb(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, w: number, color: string) {
  ctx.lineCap = 'round';
  ctx.lineWidth = w + 2.4;
  ctx.strokeStyle = OUTLINE;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

/** small white glint highlight. */
function glint(ctx: Ctx, x: number, y: number, len: number, ang: number, a = 0.75) {
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(ang) * len / 2, y - Math.sin(ang) * len / 2);
  ctx.lineTo(x + Math.cos(ang) * len / 2, y + Math.sin(ang) * len / 2);
  ctx.stroke();
  ctx.restore();
}

function glowCircle(ctx: Ctx, x: number, y: number, r: number, c1: string, a = 1) {
  const g = ctx.createRadialGradient(x, y, 1, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, c1);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  circle(ctx, x, y, r);
  ctx.fill();
  ctx.restore();
}

// deterministic pseudo-random for prop placement
function hash(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// =========================================================== unit sprites ==

/** Walk-cycle phase helpers. */
function gait(t: number) {
  const ph = Math.sin(t * 8);
  return { ph, leg: ph * 4, arm: -ph * 3, bob: Math.abs(Math.sin(t * 8)) * -1.6 };
}

export function paintUnit(ctx: Ctx, defId: string, t: number, scale = 1, walking = true) {
  const def = UNIT_BY_ID[defId];
  const { a, b, c } = def.pal;
  const G = walking ? gait(t) : { ph: 0, leg: 0, arm: 0, bob: 0 };
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(0, G.bob);
  switch (defId) {
    case 'goblin': {
      limb(ctx, -3, 4, -4 + G.leg, 12, 3, sh(a, -0.25));
      limb(ctx, 3, 4, 4 - G.leg, 12, 3, sh(a, -0.25));
      plate(ctx, [[-6, -4], [6, -4], [5, 7], [-5, 7]], b); // ragged tunic
      blob(ctx, 0, -9, 5.5, 5, a); // head
      plate(ctx, [[-5, -11], [-11, -16], [-4, -8]], a); // ears
      plate(ctx, [[5, -11], [11, -16], [4, -8]], a);
      ctx.fillStyle = '#ffe9a0'; ctx.fillRect(-3, -10.5, 2, 2); ctx.fillRect(1.4, -10.5, 2, 2); // eyes
      blob(ctx, 5.5, 3, 3, 3.4, c); // coin purse
      glint(ctx, 5, 1.6, 3, -0.7);
      limb(ctx, -5, 0, -9 - G.arm, 4, 2.4, a); // dagger arm
      limb(ctx, -9 - G.arm, 4, -12 - G.arm, 1, 1.8, '#c9d4ee');
      break;
    }
    case 'skeleton': {
      limb(ctx, -2.5, 4, -3.5 + G.leg, 13, 2.6, '#d8d2c4');
      limb(ctx, 2.5, 4, 3.5 - G.leg, 13, 2.6, '#d8d2c4');
      // ribcage
      blob(ctx, 0, 0, 5.5, 6.5, a);
      ctx.strokeStyle = sh(a, -0.4); ctx.lineWidth = 1.2;
      for (let i = -3; i <= 3; i += 2.2) { ctx.beginPath(); ctx.moveTo(-4.5, i); ctx.lineTo(4.5, i); ctx.stroke(); }
      blob(ctx, 0, -10, 5.4, 5.2, a); // skull
      ctx.fillStyle = '#14101f';
      ctx.fillRect(-3.4, -11.5, 2.6, 2.8); ctx.fillRect(0.9, -11.5, 2.6, 2.8);
      ctx.fillRect(-1.4, -7.8, 2.8, 1.2); // jaw line
      limb(ctx, 5, -1, 9 + G.arm, 3, 2.2, a); // sword arm
      limb(ctx, 9 + G.arm, 3, 14 + G.arm, -4, 2, '#9a948a'); // rusty blade
      // round shield
      blob(ctx, -8, 0, 4, 5, b);
      break;
    }
    case 'wolf': {
      limb(ctx, -7, 4, -8 + G.leg, 11, 3, sh(a, -0.2));
      limb(ctx, 6, 4, 7 - G.leg, 11, 3, sh(a, -0.2));
      blob(ctx, -1, 0, 11, 6, a, -0.08); // body
      blob(ctx, 9, -5, 5.5, 4.6, a); // head
      plate(ctx, [[7, -9], [5.5, -15], [10.5, -10]], sh(a, -0.1)); // ear
      plate(ctx, [[13, -5], [18, -3.4], [13, -2]], sh(a, 0.1)); // muzzle
      ctx.fillStyle = c; circle(ctx, 11, -6, 1.3); ctx.fill(); // eye
      plate(ctx, [[-11, -1], [-17, -6], [-12, 3]], sh(a, -0.15)); // tail
      // briar collar
      ctx.strokeStyle = '#4e6a3a'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(5, -2, 4.4, 0.4, 2.6); ctx.stroke();
      break;
    }
    case 'imp': {
      limb(ctx, -2.5, 4, -4 + G.leg, 11, 2.6, sh(a, -0.2));
      limb(ctx, 2.5, 4, 4 - G.leg, 11, 2.6, sh(a, -0.2));
      blob(ctx, 0, -1, 7, 7.5, a); // round body
      blob(ctx, 0, -11, 5, 4.6, a); // head
      plate(ctx, [[-4, -14], [-8, -21], [-1.4, -14.5]], b); // horns
      plate(ctx, [[4, -14], [8, -21], [1.4, -14.5]], b);
      ctx.fillStyle = '#fff'; ctx.fillRect(-3, -12, 2, 2); ctx.fillRect(1.2, -12, 2, 2);
      // glowing belly bomb
      glowCircle(ctx, 0, -1, 6 + Math.sin(t * 10) * 1.4, c, 0.9);
      ctx.fillStyle = sh(c, -0.2); circle(ctx, 0, -1, 2.6); ctx.fill();
      // fuse spark
      glowCircle(ctx, 0, -8.4, 2.4, '#ffe9a0', 0.8);
      break;
    }
    case 'ogre': {
      limb(ctx, -5, 8, -6 + G.leg, 17, 5, sh(a, -0.25));
      limb(ctx, 5, 8, 6 - G.leg, 17, 5, sh(a, -0.25));
      blob(ctx, 0, 0, 12, 11, a); // slab of torso
      plate(ctx, [[-11, 5], [11, 5], [9, 12], [-9, 12]], b); // loincloth
      // belly shading + scars
      ctx.strokeStyle = sh(a, -0.35); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-5, -2); ctx.lineTo(-1, 2); ctx.moveTo(3, -4); ctx.lineTo(6, -1); ctx.stroke();
      blob(ctx, 0, -14, 7.4, 6.6, a); // head
      ctx.fillStyle = '#5d1f1f'; circle(ctx, -2.6, -15, 1.6); ctx.fill(); circle(ctx, 2.6, -15, 1.6); ctx.fill();
      plate(ctx, [[-2, -11], [2, -11], [3, -9.4], [-3, -9.4]], sh(a, -0.2)); // underbite
      ctx.fillStyle = '#e8e4d8'; ctx.fillRect(-2.6, -11.4, 1.6, 2); ctx.fillRect(1, -11.4, 1.6, 2); // tusks
      // spiked club arm
      limb(ctx, 10, -4, 16 + G.arm, 2, 4.4, a);
      limb(ctx, 16 + G.arm, 2, 21 + G.arm, -10, 4, b);
      blob(ctx, 21 + G.arm, -12, 5, 6, b);
      ctx.fillStyle = '#d8d2c4';
      for (const [sx, sy] of [[-3, -4], [3, -5], [0, 2]]) { ctx.fillRect(21 + G.arm + sx, -12 + sy, 1.6, 1.6); }
      break;
    }
    case 'priest': {
      plate(ctx, [[-8, 12], [-4, -7], [4, -7], [8, 12]], b); // robe
      plate(ctx, [[-8, 12], [-2, 8], [2, 8], [8, 12]], sh(b, -0.25)); // hem shadow
      blob(ctx, 0, -10, 5.2, 4.8, a);
      plate(ctx, [[-5.4, -10], [0, -19], [5.4, -10]], b); // hood
      ctx.fillStyle = c; ctx.fillRect(-2.6, -11.4, 1.8, 1.8); ctx.fillRect(0.9, -11.4, 1.8, 1.8); // glowing eyes
      // censer-staff with skull
      limb(ctx, 7, -4, 10, 8, 2.2, sh(b, -0.2));
      limb(ctx, 10, -4, 10, -14, 2, sh(b, 0.1));
      blob(ctx, 10, -16, 3, 3, '#e8e4d8');
      glowCircle(ctx, 10, -16, 5 + Math.sin(t * 5), c, 0.55);
      break;
    }
    case 'banner': {
      ctx.globalAlpha = 0.88;
      plate(ctx, [[-7, 11], [-3, -9], [3, -9], [7, 11]], a); // shroud
      plate(ctx, [[-7, 11], [-2, 6], [2, 6], [7, 11]], sh(a, -0.3));
      blob(ctx, 0, -11, 4.6, 4.4, sh(a, 0.15));
      ctx.fillStyle = c; ctx.fillRect(-2.4, -12, 1.7, 1.7); ctx.fillRect(0.8, -12, 1.7, 1.7);
      ctx.globalAlpha = 1;
      // the war-standard
      limb(ctx, 8, 11, 8, -22, 2.2, '#6a5a3a');
      const wave = Math.sin(t * 4) * 2.5;
      plate(ctx, [[8, -22], [24 + wave, -18], [22 + wave, -13], [8, -11]], c);
      ctx.fillStyle = sh(c, 0.35);
      circle(ctx, 13.4, -16.6, 2.2); ctx.fill(); // emblem
      blob(ctx, 8, -23.4, 1.8, 1.8, '#e3b341'); // finial
      break;
    }
    case 'revenant': {
      ctx.globalAlpha = 0.92;
      plate(ctx, [[-8.4, 11], [-3, -11], [3, -11], [8.4, 11]], a);
      plate(ctx, [[-8.4, 11], [0, 4], [8.4, 11]], sh(a, -0.3));
      blob(ctx, 0, -13, 5.2, 5, c);
      ctx.fillStyle = b; circle(ctx, -2, -14, 1.5); ctx.fill(); circle(ctx, 2, -14, 1.5); ctx.fill();
      ctx.globalAlpha = 1;
      // orbiting frost shards
      for (let i = 0; i < 4; i++) {
        const ang = t * 1.8 + (i * Math.PI) / 2;
        const sx = Math.cos(ang) * 13, sy = -2 + Math.sin(ang) * 7;
        plate(ctx, [[sx, sy - 4], [sx + 2.4, sy + 1], [sx, sy + 4], [sx - 2.4, sy + 1]], '#dff6ff');
      }
      glowCircle(ctx, 0, -2, 16, '#a8d8e8', 0.25);
      break;
    }
    case 'harpy': {
      const flap = Math.sin(t * 9) * 7;
      plate(ctx, [[-3, -3], [-18, -8 - flap], [-14, -2 - flap * 0.5], [-5, 2]], a); // layered wings
      plate(ctx, [[3, -3], [18, -8 - flap], [14, -2 - flap * 0.5], [5, 2]], a);
      plate(ctx, [[-3, -1], [-13, -3 - flap * 0.7], [-4, 3]], sh(a, -0.2));
      plate(ctx, [[3, -1], [13, -3 - flap * 0.7], [4, 3]], sh(a, -0.2));
      blob(ctx, 0, 0, 4.6, 7, b); // body
      limb(ctx, -2, 6, -3, 12, 1.8, sh(c, -0.3)); // talons
      limb(ctx, 2, 6, 3, 12, 1.8, sh(c, -0.3));
      blob(ctx, 0, -9, 4.6, 4.2, c); // head
      ctx.fillStyle = '#2a1a30'; circle(ctx, -1.7, -9.6, 1.1); ctx.fill(); circle(ctx, 1.7, -9.6, 1.1); ctx.fill();
      plate(ctx, [[0, -8], [4.6, -6.4], [0, -5.2]], '#e3b341'); // beak
      ctx.fillStyle = a; // wild hair
      ctx.beginPath(); ctx.arc(0, -11.4, 4.4, Math.PI * 0.9, Math.PI * 2.1); ctx.fill();
      break;
    }
    case 'golem': {
      limb(ctx, -6, 8, -7 + G.leg * 0.5, 18, 6.4, sh(a, -0.2));
      limb(ctx, 6, 8, 7 - G.leg * 0.5, 18, 6.4, sh(a, -0.2));
      blob(ctx, 0, -1, 12.6, 11.4, a); // boulder torso
      plate(ctx, [[-9, -14], [9, -14], [7.4, -5], [-7.4, -5]], b); // head slab
      ctx.fillStyle = c; ctx.fillRect(-5.4, -11.6, 3, 3); ctx.fillRect(2.4, -11.6, 3, 3); // rune eyes
      glowCircle(ctx, 0, -10, 9, c, 0.16);
      // glowing cracks
      ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(-1, 3); ctx.lineTo(-4, 8); ctx.moveTo(6, -3); ctx.lineTo(2, 2); ctx.stroke();
      ctx.globalAlpha = 1;
      // fists
      blob(ctx, -15, 0 + G.arm * 0.4, 4.6, 5.6, b);
      blob(ctx, 15, 0 - G.arm * 0.4, 4.6, 5.6, b);
      // moss
      ctx.fillStyle = '#4e6a3a';
      circle(ctx, -8, -8, 2); ctx.fill(); circle(ctx, 9, 4, 1.6); ctx.fill();
      break;
    }
    case 'necro': {
      plate(ctx, [[-8.4, 12], [-3.4, -9], [3.4, -9], [8.4, 12]], a);
      plate(ctx, [[-8.4, 12], [0, 5], [8.4, 12]], sh(a, -0.35));
      // rune trim on robe
      ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.moveTo(-6, 8); ctx.lineTo(6, 8); ctx.stroke();
      ctx.globalAlpha = 1;
      plate(ctx, [[-6, -9], [0, -19.4], [6, -9]], b); // deep hood
      glowCircle(ctx, 0, -12, 4.4, c, 0.85); // face-glow
      // skull staff
      limb(ctx, -9, -16, -9, 8, 2.2, sh(b, 0.2));
      blob(ctx, -9, -18.5, 3.2, 3, '#e8e4d8');
      ctx.fillStyle = '#14101f'; ctx.fillRect(-10.4, -19.4, 1.2, 1.4); ctx.fillRect(-8, -19.4, 1.2, 1.4);
      glowCircle(ctx, -9, -18.5, 6 + Math.sin(t * 6) * 1.4, c, 0.5);
      break;
    }
    case 'siege': {
      // wheels
      for (const wx of [-9, 7]) {
        blob(ctx, wx, 10, 4.6, 4.6, sh(b, -0.25));
        ctx.strokeStyle = sh(b, 0.3); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(wx - 3, 10); ctx.lineTo(wx + 3, 10); ctx.moveTo(wx, 7); ctx.lineTo(wx, 13); ctx.stroke();
      }
      plate(ctx, [[-14, -5], [14, -5], [12, 8], [-12, 8]], b); // hull
      // armor plating lines + rivets
      ctx.strokeStyle = sh(b, -0.35); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.stroke();
      ctx.fillStyle = sh(b, 0.3);
      for (const rx of [-10, -4, 2, 8]) { circle(ctx, rx, -2.6, 0.9); ctx.fill(); }
      plate(ctx, [[-10, -13], [10, -13], [8, -5], [-8, -5]], a); // ram housing
      // the ram head — molten
      const ramY = Math.sin(t * 4) * 2.4;
      limb(ctx, 0, -10, 0, -20 + ramY, 3.4, sh(c, -0.15));
      blob(ctx, 0, -22 + ramY, 4.4, 4.2, c);
      glowCircle(ctx, 0, -22 + ramY, 7, c, 0.6);
      // pennant
      limb(ctx, 11, -13, 11, -22, 1.4, '#6a5a3a');
      plate(ctx, [[11, -22], [19, -19.4], [11, -17]], c);
      break;
    }
    case 'wyvern': {
      const flap = Math.sin(t * 7) * 9;
      // big membrane wings, two-tone
      plate(ctx, [[-3, -5], [-22, -12 - flap], [-19, -3 - flap * 0.4], [-8, 3]], b);
      plate(ctx, [[3, -5], [22, -12 - flap], [19, -3 - flap * 0.4], [8, 3]], b);
      plate(ctx, [[-4, -4], [-16, -8 - flap * 0.8], [-7, 2]], sh(a, 0.1));
      plate(ctx, [[4, -4], [16, -8 - flap * 0.8], [7, 2]], sh(a, 0.1));
      blob(ctx, 0, 0, 5, 8.4, b); // body
      // plated belly
      ctx.strokeStyle = sh(b, 0.25); ctx.lineWidth = 1.2;
      for (let i = -3; i < 6; i += 2.4) { ctx.beginPath(); ctx.moveTo(-2.8, i); ctx.lineTo(2.8, i); ctx.stroke(); }
      blob(ctx, 0, -10.4, 4.8, 4.2, b); // head
      plate(ctx, [[-1.4, -13], [0, -17.4], [1.4, -13]], sh(b, -0.2)); // crest
      ctx.fillStyle = c; circle(ctx, -1.8, -11, 1.2); ctx.fill(); circle(ctx, 1.8, -11, 1.2); ctx.fill();
      plate(ctx, [[-3.4, 7], [0, 17], [3.4, 7]], b); // tail
      plate(ctx, [[0, 14], [3.4, 19], [-1, 17.4]], sh(c, -0.2)); // stinger
      break;
    }
    case 'avatar': {
      const pulse = 1 + Math.sin(t * 3) * 0.04;
      ctx.scale(pulse, pulse);
      glowCircle(ctx, 0, -6, 30, c, 0.22);
      limb(ctx, -7, 10, -9 + G.leg * 0.4, 22, 7, sh(b, -0.1));
      limb(ctx, 7, 10, 9 - G.leg * 0.4, 22, 7, sh(b, -0.1));
      blob(ctx, 0, -2, 15, 13.4, b); // tower of a torso
      plate(ctx, [[-12, -17], [12, -17], [9.4, -6], [-9.4, -6]], a); // crowned head-block
      // burning eyes + mouth-grate
      ctx.fillStyle = c;
      ctx.fillRect(-7, -14.4, 4, 4); ctx.fillRect(3, -14.4, 4, 4);
      glowCircle(ctx, -5, -12.4, 5, c, 0.7); glowCircle(ctx, 5, -12.4, 5, c, 0.7);
      ctx.fillStyle = sh(c, -0.25);
      for (const mx of [-4, -1, 2]) ctx.fillRect(mx, -8.4, 1.6, 2.2);
      // great horns
      ctx.lineWidth = 4; ctx.strokeStyle = OUTLINE;
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(10 * s, -17); ctx.quadraticCurveTo(20 * s, -25, 17 * s, -36); ctx.stroke();
      }
      ctx.lineWidth = 2.6; ctx.strokeStyle = sh(c, 0.1);
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(10 * s, -17); ctx.quadraticCurveTo(20 * s, -25, 17 * s, -36); ctx.stroke();
      }
      // molten fault-lines
      ctx.strokeStyle = c; ctx.lineWidth = 1.8; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(-9, -4); ctx.lineTo(-3, 2); ctx.lineTo(-7, 9); ctx.moveTo(9, -4); ctx.lineTo(3, 2); ctx.lineTo(7, 9); ctx.stroke();
      ctx.globalAlpha = 1;
      // fists like kegs
      blob(ctx, -17, 2 + G.arm * 0.5, 5.4, 6.4, a);
      blob(ctx, 17, 2 - G.arm * 0.5, 5.4, 6.4, a);
      break;
    }
  }
  ctx.restore();
}

// ========================================================== hero sprites ===

function paintWeapon(ctx: Ctx, weapon: string, p: { glow: string; main: string; trim: string }, t: number, lunge: number) {
  const wx = 9 + lunge * 8;
  switch (weapon) {
    case 'sword': {
      ctx.save();
      ctx.translate(wx, -3);
      ctx.rotate(-0.55 + lunge * 0.7);
      limb(ctx, 0, 5, 0, -2, 2.6, '#6a5a3a'); // grip
      limb(ctx, -4.4, -1, 4.4, -1, 2.2, p.trim); // crossguard
      limb(ctx, 0, -1, 0, -17, 3, '#cfd8e8'); // blade
      glint(ctx, 0.8, -9, 9, -1.45);
      ctx.restore();
      // kite shield
      plate(ctx, [[-15, -9], [-8, -9], [-7, -1], [-11.4, 5], [-16, -1]], p.main);
      ctx.fillStyle = p.trim; circle(ctx, -11.5, -4, 2); ctx.fill();
      break;
    }
    case 'axes': {
      for (const s of [1, -0.5]) {
        ctx.save();
        ctx.translate(wx * s, -3);
        ctx.rotate((-0.7 + lunge) * s);
        limb(ctx, 0, 7, 0, -10, 2.4, '#6a5a3a');
        plate(ctx, [[0, -10], [7, -14], [8, -7], [0, -6]], '#cfd8e8');
        glint(ctx, 4.4, -10.4, 5, -0.5);
        ctx.restore();
      }
      break;
    }
    case 'bow': {
      ctx.save();
      ctx.translate(wx, -5);
      ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(0, 0, 10, -Math.PI / 2.2, Math.PI / 2.2); ctx.stroke();
      ctx.strokeStyle = '#e8e4d8'; ctx.lineWidth = 1;
      const ax = Math.cos(Math.PI / 2.2) * 10, ay = Math.sin(Math.PI / 2.2) * 10;
      ctx.beginPath(); ctx.moveTo(ax, -ay); ctx.lineTo(-2 - lunge * 4, 0); ctx.lineTo(ax, ay); ctx.stroke();
      limb(ctx, -2 - lunge * 4, 0, 8, 0, 1.4, p.glow); // nocked arrow
      ctx.restore();
      break;
    }
    case 'blades': {
      for (const s of [1, -0.45]) {
        ctx.save();
        ctx.translate(10 * s + lunge * 7, -2);
        ctx.rotate((0.5 + lunge * 0.9) * s);
        limb(ctx, 0, 3, 1.4 * s, -3, 2, '#6a5a3a');
        ctx.strokeStyle = OUTLINE; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(0, -3); ctx.quadraticCurveTo(6 * s, -7, 2 * s, -15); ctx.stroke();
        ctx.strokeStyle = '#cfd8e8'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(0, -3); ctx.quadraticCurveTo(6 * s, -7, 2 * s, -15); ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'orb': {
      const oy = -7 + Math.sin(t * 3) * 2.4;
      glowCircle(ctx, wx + 1, oy, 9, p.glow, 0.9);
      blob(ctx, wx + 1, oy, 3, 3, sh(p.glow, -0.1));
      break;
    }
    case 'staff': {
      limb(ctx, wx, 13, wx, -18, 2.6, '#5a4a30');
      // living bloom
      const bl = 3.4 + Math.sin(t * 5) * 0.8;
      glowCircle(ctx, wx, -19.4, bl * 2.4, p.glow, 0.8);
      for (let i = 0; i < 5; i++) {
        const a2 = t * 2 + (i * Math.PI * 2) / 5;
        blob(ctx, wx + Math.cos(a2) * bl, -19.4 + Math.sin(a2) * bl, 1.6, 2.4, p.trim, a2);
      }
      break;
    }
    case 'hammer': {
      ctx.save();
      ctx.translate(wx, -2);
      ctx.rotate(-0.5 + lunge * 0.9);
      limb(ctx, 0, 8, 0, -12, 2.8, '#6a5a3a');
      plate(ctx, [[-7, -18], [7, -18], [8.4, -9], [-8.4, -9]], '#9aa7b8'); // great head
      ctx.fillStyle = p.glow; ctx.globalAlpha = 0.9;
      ctx.fillRect(-4, -15.4, 8, 2); // glowing rune band
      ctx.globalAlpha = 1;
      glint(ctx, 4, -17, 5, 0);
      ctx.restore();
      break;
    }
    case 'censer': {
      // swinging thurible on a chain
      const sw = Math.sin(t * 3.4) * 0.5 + lunge;
      ctx.save();
      ctx.translate(wx - 2, -8);
      ctx.rotate(sw * 0.5);
      ctx.strokeStyle = '#c9a84a'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 11); ctx.stroke();
      blob(ctx, 0, 14, 4, 4.6, '#c9a84a');
      ctx.fillStyle = OUTLINE;
      for (const hy of [12.4, 15.4]) ctx.fillRect(-3, hy, 6, 1);
      glowCircle(ctx, 0, 14, 8, p.glow, 0.55);
      ctx.restore();
      break;
    }
    case 'fists': {
      for (const s of [1, -0.6]) {
        blob(ctx, (11 + lunge * 7) * s, -1, 4.6, 5, '#5a6a8a');
        glowCircle(ctx, (11 + lunge * 7) * s, -1, 7, p.glow, 0.35 + lunge * 0.4);
      }
      break;
    }
  }
}

/** Hero-specific headgear painted over the head. */
function paintHeadgear(ctx: Ctx, heroId: string, p: { main: string; trim: string; glow: string; hair: string }, t: number) {
  switch (heroId) {
    case 'baldric': // full helm with plume
      plate(ctx, [[-5.4, -16], [5.4, -16], [5.8, -10], [-5.8, -10]], sh(p.main, 0.15));
      ctx.fillStyle = '#14101f'; ctx.fillRect(-4, -14.4, 8, 2.2); // visor slit
      plate(ctx, [[-1.4, -16], [0, -23], [3.4, -21], [1.4, -15.4]], p.trim); // plume
      break;
    case 'gorvana': // swept horns
      for (const s of [-1, 1]) {
        ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3.4;
        ctx.beginPath(); ctx.moveTo(4 * s, -15); ctx.quadraticCurveTo(9 * s, -20, 7.4 * s, -25); ctx.stroke();
        ctx.strokeStyle = '#d8c8a8'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(4 * s, -15); ctx.quadraticCurveTo(9 * s, -20, 7.4 * s, -25); ctx.stroke();
      }
      break;
    case 'thrainn': // hood + magnificent beard
      plate(ctx, [[-5.4, -15], [0, -19.4], [5.4, -15], [4.4, -11], [-4.4, -11]], p.main);
      plate(ctx, [[-4.4, -10], [4.4, -10], [2.4, -1], [0, 1], [-2.4, -1]], p.hair); // the beard
      ctx.strokeStyle = sh(p.hair, -0.25); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-2, -7); ctx.lineTo(-1.4, -2); ctx.moveTo(2, -7); ctx.lineTo(1.4, -2); ctx.stroke();
      break;
    case 'joruun': // crown of static
      for (let i = 0; i < 4; i++) {
        const a2 = t * 6 + (i * Math.PI) / 2;
        const sx = Math.cos(a2) * 6.4, sy = -17 + Math.sin(a2) * 2;
        ctx.strokeStyle = p.glow; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 2, sy - 3.4); ctx.lineTo(sx + 3.4, sy - 1.4); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      break;
    case 'sylri': // deep hood, silver fringe
      plate(ctx, [[-5.8, -13], [0, -19], [5.8, -13], [4.4, -9.4], [-4.4, -9.4]], p.main);
      ctx.fillStyle = p.hair; ctx.fillRect(-4, -11.4, 8, 1.4);
      break;
    case 'vyrel': // wind-scarf
      plate(ctx, [[-5.4, -14.4], [5.4, -14.4], [4.4, -11], [-4.4, -11]], p.trim);
      const fl = Math.sin(t * 6) * 3;
      plate(ctx, [[4, -13], [13, -15 - fl], [12, -11.4 - fl], [4.4, -11]], p.trim);
      break;
    case 'korrigan': // rat-eared hood
      plate(ctx, [[-5.4, -13], [0, -17.4], [5.4, -13], [4.4, -9.4], [-4.4, -9.4]], p.main);
      for (const s of [-1, 1]) plate(ctx, [[3.4 * s, -16], [6.4 * s, -22], [1 * s, -17]], p.main);
      break;
    case 'maelis': { // hovering void-halo
      ctx.strokeStyle = p.glow; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.ellipse(0, -19.4 + Math.sin(t * 2) * 1, 7, 2.2, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }
    case 'morrigan': // antler circlet
      for (const s of [-1, 1]) {
        ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(3.4 * s, -15.4); ctx.quadraticCurveTo(7 * s, -21, 5.4 * s, -24); ctx.stroke();
        ctx.strokeStyle = '#7a5d3a'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(3.4 * s, -15.4); ctx.quadraticCurveTo(7 * s, -21, 5.4 * s, -24); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(5.8 * s, -20); ctx.lineTo(8 * s, -22); ctx.stroke();
      }
      break;
    case 'seraphine': { // radiant halo
      glowCircle(ctx, 0, -16, 11, p.glow, 0.5);
      ctx.strokeStyle = p.trim; ctx.lineWidth = 1.6;
      circle(ctx, 0, -16, 8.4); ctx.stroke();
      break;
    }
  }
}

export function paintHero(ctx: Ctx, h: HeroState, t: number, g?: GameState) {
  const def = HERO_BY_ID[h.defId];
  const p = def.palette;
  const scale = (h.d?.scale ?? 1) * 1.42;
  const colossus = h.buffs.some(b => b.id === 'colossus');
  const channeling = !!h.channel;
  const lunge = Math.max(0, 1 - (t - h.attackAnimT) * 4);
  const G = gait(t * 0.6);
  ctx.save();
  ctx.scale(scale * (h.facing === -1 ? -1 : 1), scale);
  ctx.translate(0, Math.sin(t * 2.6 + (h.team ? 2 : 0)) * 1);

  if (colossus) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 7; i++) {
      const a2 = t * 0.8 + (i * Math.PI * 2) / 7;
      ctx.strokeStyle = '#ffd86b';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(Math.cos(a2) * 52, -8 + Math.sin(a2) * 52); ctx.stroke();
    }
    ctx.restore();
  }

  // cape behind everything
  const capeWave = Math.sin(t * 3) * 2.6;
  plate(ctx, [[-4, -8], [-13 - capeWave, 4], [-10 - capeWave * 0.6, 13], [-3, 9]], sh(p.trim, -0.25));

  // legs
  limb(ctx, -3, 6, -4, 15, 3.4, sh(p.main, -0.3));
  limb(ctx, 3, 6, 4, 15, 3.4, sh(p.main, -0.3));
  // boots
  blob(ctx, -4, 15.4, 2.8, 1.8, sh(p.main, -0.45));
  blob(ctx, 4, 15.4, 2.8, 1.8, sh(p.main, -0.45));

  // torso by archetype
  if (def.weapon === 'orb' || def.weapon === 'staff' || def.weapon === 'censer') {
    plate(ctx, [[-8.4, 13], [-5.4, -8], [5.4, -8], [8.4, 13]], p.main); // robe
    plate(ctx, [[-8.4, 13], [-2, 8], [2, 8], [8.4, 13]], sh(p.main, -0.3));
    plate(ctx, [[-5.4, -2], [5.4, -2], [5, 0.4], [-5, 0.4]], p.trim); // sash
  } else {
    plate(ctx, [[-7, -8], [7, -8], [6.4, 9], [-6.4, 9]], p.main); // cuirass
    plate(ctx, [[-6.4, -1], [6.4, -1], [6, 1.6], [-6, 1.6]], p.trim); // belt
    blob(ctx, 0, 1.4, 1.6, 1.6, sh(p.trim, 0.3)); // buckle
    // pauldrons
    blob(ctx, -7.4, -7.4, 3.4, 2.8, sh(p.main, 0.12));
    blob(ctx, 7.4, -7.4, 3.4, 2.8, sh(p.main, 0.12));
    glint(ctx, -3, -6, 5, -0.5, 0.35);
  }

  // head
  blob(ctx, 0, -13, 5.4, 5, p.skin);
  ctx.fillStyle = p.hair;
  ctx.beginPath(); ctx.arc(0, -14.4, 5.4, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
  ctx.fillStyle = '#14101f';
  ctx.fillRect(1.2, -13.6, 1.6, 1.6); ctx.fillRect(-2.8, -13.6, 1.6, 1.6); // eyes
  paintHeadgear(ctx, h.defId, p, t);

  paintWeapon(ctx, def.weapon, p, t, lunge);

  // channel wings (wyrmfire) / rat-call (thousandteeth)
  if (channeling) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.75;
    const f = Math.sin(t * 10) * 3;
    const wc = h.channel!.ability === 'thousandteeth' ? '#b8e35c' : '#ff5e2b';
    plate(ctx, [[-4, -9], [-27, -19 - f], [-11, -1]], wc);
    plate(ctx, [[4, -9], [27, -19 - f], [11, -1]], wc);
    ctx.restore();
  }
  ctx.restore();

  // shield bubble
  if (h.buffs.some(b => (b.shield ?? 0) > 0)) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.3 + Math.sin(t * 6) * 0.08;
    ctx.strokeStyle = '#ffe9a0';
    ctx.lineWidth = 2;
    circle(ctx, 0, -7, 26 * scale);
    ctx.stroke();
    ctx.restore();
  }
}

// ============================================================== summons ====

export function paintSummon(ctx: Ctx, s: SummonState, t: number) {
  ctx.save();
  switch (s.kind) {
    case 'owl': {
      const flap = Math.sin(t * 10 + s.id) * 5;
      ctx.globalAlpha = 0.92;
      plate(ctx, [[-2, 0], [-13, -5 - flap], [-10, 1 - flap * 0.4], [-3, 3]], s.theme.c1);
      plate(ctx, [[2, 0], [13, -5 - flap], [10, 1 - flap * 0.4], [3, 3]], s.theme.c1);
      blob(ctx, 0, -2, 5, 5.6, sh(s.theme.c1, -0.12));
      ctx.fillStyle = '#fff'; circle(ctx, -1.8, -3.4, 1.5); ctx.fill(); circle(ctx, 1.8, -3.4, 1.5); ctx.fill();
      ctx.fillStyle = '#14101f'; circle(ctx, -1.8, -3.4, 0.7); ctx.fill(); circle(ctx, 1.8, -3.4, 0.7); ctx.fill();
      plate(ctx, [[-1, -1.4], [1, -1.4], [0, 0.6]], '#e3b341');
      glowCircle(ctx, 0, -2, 10, s.theme.c1, 0.25);
      break;
    }
    case 'knight': {
      ctx.globalAlpha = 0.88;
      limb(ctx, -2.4, 4, -3.4, 11, 2.6, sh(s.theme.c2, -0.2));
      limb(ctx, 2.4, 4, 3.4, 11, 2.6, sh(s.theme.c2, -0.2));
      plate(ctx, [[-5.4, -7], [5.4, -7], [4.8, 6], [-4.8, 6]], s.theme.c2);
      blob(ctx, 0, -10.4, 4.6, 4.2, s.theme.c1);
      plate(ctx, [[-1, -14], [0, -19], [2.4, -17], [1, -13.4]], s.theme.c1); // plume
      limb(ctx, 6, 1, 11, -9, 2.2, '#cfd8e8');
      glowCircle(ctx, 0, -4, 13, s.theme.c1, 0.22);
      break;
    }
    case 'snapper': {
      const open = (Math.sin(t * 6 + s.id) + 1) / 2;
      plate(ctx, [[-3.4, 11], [-5.4, 0], [0, -6], [5.4, 0], [3.4, 11]], s.theme.c2); // stem
      // leaves at base
      plate(ctx, [[-3, 9], [-11, 6], [-4, 12]], sh(s.theme.c2, 0.15));
      plate(ctx, [[3, 9], [11, 6], [4, 12]], sh(s.theme.c2, 0.15));
      ctx.save();
      ctx.translate(0, -8);
      ctx.rotate(-0.3 - open * 0.55);
      plate(ctx, [[0, 0], [13, -4], [11, 2.4]], s.theme.c1); // upper jaw
      ctx.fillStyle = '#fff';
      for (const tx of [4, 7.4, 10]) { poly(ctx, [[tx, -1.4], [tx + 1.4, 1], [tx - 1.4, 1]]); ctx.fill(); }
      ctx.rotate(0.6 + open * 1.1);
      plate(ctx, [[0, 0], [13, 4], [11, -2.4]], sh(s.theme.c1, -0.15)); // lower jaw
      ctx.restore();
      break;
    }
    case 'decoy': {
      ctx.globalAlpha = 0.4 + Math.sin(t * 8) * 0.12;
      plate(ctx, [[-6, 12], [-4, -7], [4, -7], [6, 12]], s.theme.c1);
      blob(ctx, 0, -10.4, 4.6, 4.4, s.theme.c1);
      glowCircle(ctx, 0, -2, 14, s.theme.c1, 0.4);
      break;
    }
  }
  ctx.restore();
}

// ========================================================= icon painters ===

export function unitIconCanvas(defId: string, size = 44): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const def = UNIT_BY_ID[defId];
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#2e2840');
  grad.addColorStop(1, '#15111f');
  ctx.fillStyle = grad;
  rr(ctx, 0, 0, size, size, 6);
  ctx.fill();
  ctx.strokeStyle = def.legendary ? '#ff4d4d' : def.tier === 3 ? '#e3b341' : def.tier === 2 ? '#8a9bd1' : '#5d6b7a';
  ctx.lineWidth = 2;
  rr(ctx, 1, 1, size - 2, size - 2, 5);
  ctx.stroke();
  ctx.translate(size / 2, size / 2 + 6);
  paintUnit(ctx, defId, 1.2, size / 36, false);
  return cv;
}

export function heroPortraitCanvas(heroId: string, size = 64): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const def = HERO_BY_ID[heroId];
  const p = def.palette;
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#241d38');
  grad.addColorStop(1, '#0e0b16');
  ctx.fillStyle = grad;
  rr(ctx, 0, 0, size, size, 8);
  ctx.fill();
  const rg = ctx.createRadialGradient(size / 2, size * 0.42, 4, size / 2, size * 0.42, size * 0.7);
  rg.addColorStop(0, p.glow + '44');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, size, size);
  // bust
  ctx.save();
  ctx.translate(size / 2, size * 0.74);
  ctx.scale(size / 46, size / 46);
  plate(ctx, [[-13, 12], [-8, -6], [8, -6], [13, 12]], p.main);
  blob(ctx, -8.4, -5, 4, 3.4, sh(p.main, 0.12));
  blob(ctx, 8.4, -5, 4, 3.4, sh(p.main, 0.12));
  blob(ctx, 0, -12, 6.4, 6, p.skin);
  ctx.fillStyle = p.hair;
  ctx.beginPath(); ctx.arc(0, -13.6, 6.4, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
  ctx.fillStyle = '#14101f';
  ctx.fillRect(1.4, -12.4, 2, 2); ctx.fillRect(-3.4, -12.4, 2, 2);
  ctx.save();
  ctx.scale(1.18, 1.18);
  paintHeadgear(ctx, heroId, p, 1);
  ctx.restore();
  ctx.restore();
  ctx.strokeStyle = p.glow;
  ctx.lineWidth = 2;
  rr(ctx, 1, 1, size - 2, size - 2, 7);
  ctx.stroke();
  // bevel
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(3, size - 4); ctx.lineTo(3, 3); ctx.lineTo(size - 4, 3); ctx.stroke();
  return cv;
}

export function abilityIconCanvas(ab: AbilityDef, size = 48): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, ab.theme.c2);
  grad.addColorStop(1, '#0e0b16');
  ctx.fillStyle = grad;
  rr(ctx, 0, 0, size, size, 8);
  ctx.fill();
  const rg = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size * 0.66);
  rg.addColorStop(0, ab.theme.c1 + '33');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;
  ctx.strokeStyle = ab.theme.c1;
  ctx.fillStyle = ab.theme.c1;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
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
      poly(ctx, [[cx + size * 0.28, cy + size * 0.2], [cx + size * 0.36, cy], [cx + size * 0.14, cy + size * 0.08]]); ctx.fill();
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
        const a2 = (i / 5) * Math.PI * 2 - Math.PI / 2;
        circle(ctx, cx + Math.cos(a2) * size * 0.3, cy + Math.sin(a2) * size * 0.3, 2.4); ctx.fill();
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
      for (const [dx, dy, r0] of [[-10, -6, 3], [4, -12, 2.4], [10, 2, 3.4], [-4, 8, 2.2]] as const) {
        circle(ctx, cx + dx, cy + dy, r0); ctx.fill();
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
    case 'callDown':
      poly(ctx, [[cx - size * 0.22, cy - size * 0.3], [cx + size * 0.22, cy - size * 0.3], [cx + size * 0.13, cy - size * 0.04], [cx - size * 0.13, cy - size * 0.04]]); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx, cy - size * 0.02); ctx.lineTo(cx, cy + size * 0.2); ctx.stroke();
      poly(ctx, [[cx - 6, cy + size * 0.16], [cx + 6, cy + size * 0.16], [cx, cy + size * 0.32]]); ctx.fill();
      break;
  }
  if (ab.cat === 'Ultimate') {
    ctx.strokeStyle = '#ffd86b';
    ctx.lineWidth = 2;
    rr(ctx, 1, 1, size - 2, size - 2, 7);
    ctx.stroke();
  }
  return cv;
}

export function itemIconCanvas(def: ItemDef, size = 40): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, def.tier === 'forged' ? '#43361a' : '#2a2438');
  grad.addColorStop(1, '#0e0b16');
  ctx.fillStyle = grad;
  rr(ctx, 0, 0, size, size, 7);
  ctx.fill();
  ctx.strokeStyle = def.tier === 'forged' ? '#e3b341' : '#5d6b7a';
  ctx.lineWidth = 2;
  rr(ctx, 1, 1, size - 2, size - 2, 6);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(3, size - 4); ctx.lineTo(3, 3); ctx.lineTo(size - 4, 3); ctx.stroke();
  const cx = size / 2, cy = size / 2;
  ctx.strokeStyle = def.theme.c1;
  ctx.fillStyle = def.theme.c1;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
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
      const rg2 = ctx.createRadialGradient(cx, cy, 1, cx, cy, 10);
      rg2.addColorStop(0, '#fff');
      rg2.addColorStop(0.5, def.theme.c1);
      rg2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg2;
      circle(ctx, cx, cy, 10); ctx.fill();
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
        const a2 = (i / 8) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a2) * 5.4, cy + Math.sin(a2) * 5.4); ctx.lineTo(cx + Math.cos(a2) * 7.4, cy + Math.sin(a2) * 7.4); ctx.stroke();
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
      poly(ctx, [[cx - 9, cy + 6], [cx - 9, cy - 4], [cx - 4, cy], [cx, cy - 7], [cx + 4, cy], [cx + 9, cy - 4], [cx + 9, cy + 6]]); ctx.fill();
      break;
  }
  return cv;
}

// ========================================================== particle pool ==

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
interface Beam { x1: number; y1: number; x2: number; y2: number; c: string; life: number; maxLife: number; w: number; jag?: boolean; }
interface Marker { x: number; y: number; life: number; maxLife: number; }
interface Pillar { x: number; y: number; life: number; maxLife: number; c1: string; c2: string; }

// ============================================================ the renderer =

export class Renderer {
  ctx: Ctx;
  terrain: HTMLCanvasElement;
  particles: Particle[] = [];
  floaters: Floater[] = [];
  beams: Beam[] = [];
  markers: Marker[] = [];
  pillars: Pillar[] = [];
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

  clickMarker(p: Vec) {
    this.markers.push({ x: p.x, y: p.y, life: 0, maxLife: 0.6 });
  }

  // ------------------------------------------------------------ terrain ---
  paintTerrain(ctx: Ctx) {
    // night sky into dark meadow
    const bg = ctx.createLinearGradient(0, 0, 0, C.H);
    bg.addColorStop(0, '#0d1124');
    bg.addColorStop(0.28, '#131830');
    bg.addColorStop(0.5, '#16203022');
    bg.addColorStop(1, '#0c1a16');
    ctx.fillStyle = '#101626';
    ctx.fillRect(0, 0, C.W, C.H);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, C.W, C.H);

    // stars
    for (let i = 0; i < 110; i++) {
      const x = hash(i) * C.W;
      const y = hash(i + 500) * 95;
      ctx.fillStyle = `rgba(255,255,255,${0.18 + hash(i + 900) * 0.4})`;
      ctx.fillRect(x, y, 1.6, 1.6);
    }
    // twin moons
    for (const [mx, my, mr, mc] of [[330, 60, 26, '#cfd8ff'], [1280, 48, 17, '#ffd9c4']] as const) {
      const mg = ctx.createRadialGradient(mx, my, 2, mx, my, mr * 2.4);
      mg.addColorStop(0, mc + 'cc');
      mg.addColorStop(0.4, mc + '2a');
      mg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = mg;
      circle(ctx, mx, my, mr * 2.4); ctx.fill();
      ctx.fillStyle = mc;
      circle(ctx, mx, my, mr); ctx.fill();
      ctx.fillStyle = sh(mc.slice(0, 7), -0.12);
      circle(ctx, mx - mr * 0.3, my - mr * 0.2, mr * 0.2); ctx.fill();
      circle(ctx, mx + mr * 0.35, my + mr * 0.3, mr * 0.14); ctx.fill();
      circle(ctx, mx + mr * 0.1, my - mr * 0.45, mr * 0.1); ctx.fill();
    }

    // ---- ground mottling: two biomes (dawn green / dusk mauve)
    for (let i = 0; i < 900; i++) {
      const x = hash(i * 3) * C.W;
      const y = 110 + hash(i * 3 + 1) * (C.H - 130);
      const r0 = 8 + hash(i * 3 + 2) * 26;
      const dusk = x > C.W / 2;
      const tone = hash(i * 7) < 0.5
        ? (dusk ? '#1d1620' : '#13201a')
        : (dusk ? '#241a26' : '#18271f');
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = tone;
      ctx.beginPath();
      ctx.ellipse(x, y, r0, r0 * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // grass speckle
    for (let i = 0; i < 1400; i++) {
      const x = hash(i * 11) * C.W;
      const y = 120 + hash(i * 11 + 5) * (C.H - 150);
      const dusk = x > C.W / 2;
      ctx.fillStyle = dusk ? 'rgba(174,94,121,0.16)' : 'rgba(111,174,98,0.16)';
      ctx.fillRect(x, y, 1.6, 2.6);
    }

    // ---- the sundered chasm with a magma vein
    const mid = C.W / 2;
    const ch = ctx.createLinearGradient(mid - 190, 0, mid + 190, 0);
    ch.addColorStop(0, 'rgba(0,0,0,0)');
    ch.addColorStop(0.32, '#080a14');
    ch.addColorStop(0.5, '#04050c');
    ch.addColorStop(0.68, '#080a14');
    ch.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ch;
    ctx.fillRect(mid - 190, 105, 380, C.H - 105);
    // jagged cliff lips
    for (const side of [-1, 1]) {
      ctx.fillStyle = side < 0 ? '#1a2430' : '#241a28';
      ctx.beginPath();
      ctx.moveTo(mid + side * 150, 105);
      for (let y = 105; y < C.H; y += 36) {
        ctx.lineTo(mid + side * (150 - hash(y * side) * 26), y + 18);
      }
      ctx.lineTo(mid + side * 190, C.H);
      ctx.lineTo(mid + side * 190, 105);
      ctx.fill();
      // highlight rim
      ctx.strokeStyle = side < 0 ? 'rgba(125,184,255,0.18)' : 'rgba(255,122,92,0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mid + side * 150, 105);
      for (let y = 105; y < C.H; y += 36) {
        ctx.lineTo(mid + side * (150 - hash(y * side) * 26), y + 18);
      }
      ctx.stroke();
    }
    // magma river at the bottom of the world
    const magma = ctx.createLinearGradient(mid - 60, 0, mid + 60, 0);
    magma.addColorStop(0, 'rgba(120,30,10,0)');
    magma.addColorStop(0.5, 'rgba(255,94,43,0.55)');
    magma.addColorStop(1, 'rgba(120,30,10,0)');
    ctx.fillStyle = magma;
    ctx.fillRect(mid - 60, 130, 120, C.H - 130);
    ctx.strokeStyle = 'rgba(255,180,80,0.5)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    let wx0 = mid;
    ctx.moveTo(wx0, 130);
    for (let y = 130; y < C.H; y += 30) {
      wx0 = mid + Math.sin(y * 0.045) * 22;
      ctx.lineTo(wx0, y);
    }
    ctx.stroke();

    // rope bridge with planks
    ctx.strokeStyle = '#3a2c1a';
    ctx.lineWidth = 4;
    for (const by of [430, 452]) {
      ctx.beginPath();
      ctx.moveTo(mid - 165, by);
      ctx.quadraticCurveTo(mid, by + 22, mid + 165, by);
      ctx.stroke();
    }
    for (let i = 0; i <= 12; i++) {
      const x = mid - 160 + i * 26.6;
      const sag = Math.sin((i / 12) * Math.PI) * 21;
      ctx.fillStyle = i % 2 ? '#5a4226' : '#4e3920';
      ctx.fillRect(x - 9, 432 + sag, 18, 7);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 9, 432 + sag, 18, 7);
    }

    // ---- lanes
    for (const team of [0, 1] as TeamId[]) {
      const L = laneOf(team);
      const lw = L.x1 - L.x0;
      // packed-dirt road with worn edges
      const road = ctx.createLinearGradient(L.x0, 0, L.x1, 0);
      const dirtA = team === 0 ? '#2e2a24' : '#2e2429';
      const dirtB = team === 0 ? '#3a352c' : '#3a2c33';
      road.addColorStop(0, dirtA);
      road.addColorStop(0.5, dirtB);
      road.addColorStop(1, dirtA);
      ctx.fillStyle = road;
      rr(ctx, L.x0, C.SPAWN_Y - 30, lw, C.CASTLE_Y - C.SPAWN_Y + 62, 30);
      ctx.fill();
      // faint wheel ruts, worn in patches
      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 4;
      for (const rx of [laneCenterX(team) - 60, laneCenterX(team) + 60]) {
        for (let y = C.SPAWN_Y + 20; y < C.CASTLE_Y - 40; y += 110) {
          ctx.beginPath();
          ctx.moveTo(rx + Math.sin(y * 0.02 + team) * 9, y);
          ctx.quadraticCurveTo(rx + Math.sin((y + 30) * 0.02 + team) * 9 + 3, y + 35, rx + Math.sin((y + 70) * 0.02 + team) * 9, y + 70);
          ctx.stroke();
        }
      }
      // cobble clusters
      for (let i = 0; i < 130; i++) {
        const x = L.x0 + 16 + hash(i * 13 + team * 99) * (lw - 32);
        const y = C.SPAWN_Y - 10 + hash(i * 13 + 7 + team * 99) * (C.CASTLE_Y - C.SPAWN_Y + 20);
        const r0 = 3 + hash(i * 13 + 3) * 5;
        ctx.fillStyle = `rgba(${team === 0 ? '150,150,170' : '170,140,150'},${0.1 + hash(i) * 0.12})`;
        ctx.beginPath();
        ctx.ellipse(x, y, r0, r0 * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(x, y - 1, r0 * 0.8, r0 * 0.4, 0, Math.PI, Math.PI * 2);
        ctx.stroke();
      }
      // worn edge fade into grass
      for (const ex of [L.x0, L.x1]) {
        const eg = ctx.createLinearGradient(ex - 14, 0, ex + 14, 0);
        const into = ex === L.x0 ? 1 : -1;
        eg.addColorStop(into > 0 ? 0 : 1, 'rgba(10,16,12,0.5)');
        eg.addColorStop(into > 0 ? 1 : 0, 'rgba(0,0,0,0)');
        ctx.fillStyle = eg;
        ctx.fillRect(ex - 14, C.SPAWN_Y - 30, 28, C.CASTLE_Y - C.SPAWN_Y + 62);
      }
      // border stones
      for (let y = C.SPAWN_Y - 16; y < C.CASTLE_Y + 20; y += 34) {
        for (const ex of [L.x0 - 4, L.x1 + 4]) {
          const r0 = 4 + hash(y * 3 + ex) * 3;
          ctx.fillStyle = '#3d4252';
          ctx.beginPath();
          ctx.ellipse(ex, y + hash(ex + y) * 8, r0, r0 * 0.7, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(200,210,240,0.16)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(ex, y + hash(ex + y) * 8 - 1.4, r0 * 0.7, r0 * 0.35, 0, Math.PI, Math.PI * 2);
          ctx.stroke();
        }
      }
      // torch posts
      for (const side of [L.x0 - 16, L.x1 + 16]) {
        for (let y = 230; y < C.CASTLE_Y - 70; y += 165) {
          ctx.fillStyle = '#2a2218';
          ctx.fillRect(side - 3, y - 30, 6, 32);
          ctx.fillStyle = '#3d3322';
          ctx.fillRect(side - 4.4, y - 32, 8.8, 4);
        }
      }
    }

    // ---- props (deterministic placement, mirrored flavor per side)
    const props: [number, number, string][] = [];
    for (let i = 0; i < 26; i++) {
      const side = i % 2;
      const L = laneOf(side as TeamId);
      // scatter on the grass margins
      const onLeft = hash(i * 31) < 0.5;
      const x = onLeft ? L.x0 - 30 - hash(i * 17) * 40 : L.x1 + 30 + hash(i * 17) * 40;
      const y = 170 + hash(i * 23) * (C.H - 290);
      const kinds = side === 0 ? ['rock', 'shrub', 'mushroom', 'flower', 'stump'] : ['rock', 'deadtree', 'bones', 'mushroom2', 'stump'];
      props.push([x, y, kinds[Math.floor(hash(i * 41) * kinds.length)]]);
    }
    for (const [x, y, kind] of props) {
      if (x < 20 || x > C.W - 20) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(0, 4, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
      switch (kind) {
        case 'rock':
          blob(ctx, 0, 0, 8, 5.4, '#444a5d');
          blob(ctx, 5, 2, 4, 3, '#3a4050');
          glint(ctx, -2, -2.6, 5, -0.4, 0.25);
          break;
        case 'shrub':
          blob(ctx, 0, -2, 7.4, 6, '#1f4030');
          blob(ctx, -4, 0, 5, 4.4, '#26503a');
          blob(ctx, 4, -1, 4.4, 4, '#1a3628');
          break;
        case 'mushroom':
          limb(ctx, 0, 2, 0, -3, 2.4, '#d8d2c4');
          blob(ctx, 0, -5, 5, 3, '#7db8ff');
          ctx.fillStyle = '#fff'; circle(ctx, -1.4, -5.4, 0.8); ctx.fill();
          break;
        case 'mushroom2':
          limb(ctx, 0, 2, 0, -3, 2.4, '#c4b8a8');
          blob(ctx, 0, -5, 5, 3, '#c9484e');
          ctx.fillStyle = '#ffd9c4'; circle(ctx, 1.4, -5.4, 0.8); ctx.fill();
          break;
        case 'flower':
          limb(ctx, 0, 3, 0, -3, 1.2, '#2e5a3a');
          for (let k = 0; k < 5; k++) {
            const a2 = (k / 5) * Math.PI * 2;
            blob(ctx, Math.cos(a2) * 2.6, -4 + Math.sin(a2) * 2.6, 1.7, 1.7, '#e8cba8');
          }
          ctx.fillStyle = '#e3b341'; circle(ctx, 0, -4, 1.4); ctx.fill();
          break;
        case 'stump':
          blob(ctx, 0, 0, 6, 4, '#4e3920');
          blob(ctx, 0, -1.4, 4.4, 2.6, '#6a5236');
          ctx.strokeStyle = '#4e3920'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.ellipse(0, -1.4, 2.6, 1.4, 0, 0, Math.PI * 2); ctx.stroke();
          break;
        case 'deadtree':
          limb(ctx, 0, 2, 0, -14, 3, '#3a2c2a');
          limb(ctx, 0, -8, -6, -14, 1.8, '#3a2c2a');
          limb(ctx, 0, -10, 5, -16, 1.8, '#3a2c2a');
          break;
        case 'bones':
          ctx.strokeStyle = '#c4bca8'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(4, 2); ctx.moveTo(-3, 3); ctx.lineTo(5, -1); ctx.stroke();
          blob(ctx, -6, -1, 2.6, 2.2, '#d8d2c4');
          break;
      }
      ctx.restore();
    }

    // runestone sentinels by each spawn gate
    for (const team of [0, 1] as TeamId[]) {
      for (const side of [-1, 1]) {
        const x = laneCenterX(team) + side * 78;
        const y = C.SPAWN_Y - 4;
        plate(ctx, [[x - 7, y + 8], [x - 5, y - 18], [x, y - 24], [x + 5, y - 18], [x + 7, y + 8]], '#3d4252');
        ctx.fillStyle = team === 0 ? '#7db8ff' : '#ff7a5c';
        ctx.globalAlpha = 0.8;
        ctx.fillRect(x - 1.4, y - 16, 2.8, 14);
        ctx.fillRect(x - 5, y - 8, 10, 2.4);
        ctx.globalAlpha = 1;
      }
    }

    ctx.font = '600 15px Cinzel, Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(125,184,255,0.6)';
    ctx.fillText('DAWNHOLD', laneCenterX(0), C.H - 10);
    ctx.fillStyle = 'rgba(255,122,92,0.6)';
    ctx.fillText('DUSKREACH', laneCenterX(1), C.H - 10);
  }

  // -------------------------------------------------------------- events --
  consume(events: GameEvent[], g: GameState, playerTeam: TeamId) {
    for (const e of events) {
      switch (e.t) {
        case 'dmg': {
          if (e.amount <= 0) {
            this.float(e.pos, 'MISS', '#9aa7b8', 12, false);
            break;
          }
          if (this.floaters.length < 70) {
            const col = e.target === 'hero' ? '#ff6b5c' : e.kind === 'magic' ? '#a89aff' : '#f2e9d8';
            this.float(e.pos, String(Math.round(e.amount)), col, e.target === 'hero' ? 15 : 12.5, e.amount >= 100);
          }
          break;
        }
        case 'death': {
          const def = UNIT_BY_ID[e.defId];
          this.burst(e.pos, 6 + def.tier * 4, def.pal.a, 'dot', 2.4);
          this.burst(e.pos, 4 + def.tier * 2, '#d8d2c4', 'spark', 2);
          if (def.tier === 3) this.shakeIt(def.legendary ? 9 : 4);
          break;
        }
        case 'cast': {
          const ab = ABILITY_BY_ID[e.abId];
          this.burst(e.pos, 9, ab.theme.c1, 'spark', 3);
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
              this.beam(e.pos.x + 60, e.pos.y - 140, e.pos.x, e.pos.y, th.c1, 0.3, 3);
              this.burst(e.pos, 12, th.c1, 'star', 3);
              this.ring(e.pos, th.c2, 3);
              break;
            case 'bolt':
              this.beam(e.pos.x + (Math.random() - 0.5) * 30, e.pos.y - 320, e.pos.x, e.pos.y, th.c1, 0.22, 3.4, true);
              this.burst(e.pos, 14, th.c1, 'spark', 4);
              this.ring(e.pos, th.c1, 2.4);
              this.flashScreen('#ffffff', 0.06);
              break;
            case 'pillar':
              this.pillars.push({ x: e.pos.x, y: e.pos.y, life: 0, maxLife: 0.5, c1: th.c1, c2: th.c2 });
              this.burst(e.pos, 10, th.c1, 'spark', 2.6);
              this.ring(e.pos, th.c1, 3);
              break;
            case 'anvilhit':
              this.ring(e.pos, th.c1, 5.4);
              this.burst(e.pos, 26, '#9aa7b8', 'smoke', 3);
              this.burst(e.pos, 16, th.c1, 'spark', 4);
              this.shakeIt(9);
              break;
            case 'plague':
              this.ring(e.pos, '#9acd32', 3.4);
              this.burst(e.pos, 8, '#9acd32', 'dot', 2);
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
          this.float({ x: cp.x, y: cp.y - 100 }, `INCOME +${e.amount}`, '#ffd86b', 17, true);
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
              this.beam(e.targets[i].x, e.targets[i].y, e.targets[i + 1].x, e.targets[i + 1].y, '#7db8ff', 0.25, 2.6, true);
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

  // ---------------------------------------------------------- fx helpers --
  burst(pos: Vec, n: number, c: string, kind: Particle['kind'], speed: number) {
    if (this.particles.length > 560) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.3 + Math.random() * 0.7) * speed * 60;
      this.particles.push({
        x: pos.x, y: pos.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - (kind === 'ember' ? 40 : 0),
        life: 0,
        maxLife: 0.4 + Math.random() * 0.6,
        size: kind === 'smoke' ? 5 + Math.random() * 5 : 1.6 + Math.random() * 2.4,
        c, kind,
        grav: kind === 'spark' || kind === 'star' ? 140 : kind === 'smoke' ? -30 : 0,
      });
    }
  }
  ring(pos: Vec, c: string, scale: number) {
    this.particles.push({ x: pos.x, y: pos.y, vx: 0, vy: 0, life: 0, maxLife: 0.45, size: scale * 16, c, kind: 'ring' });
  }
  beam(x1: number, y1: number, x2: number, y2: number, c: string, life: number, w: number, jag = false) {
    this.beams.push({ x1, y1, x2, y2, c, life, maxLife: life, w, jag });
  }
  float(pos: Vec, text: string, color: string, size: number, bold: boolean) {
    this.floaters.push({ x: pos.x + (Math.random() - 0.5) * 14, y: pos.y - 12, vy: -42, text, color, size, life: 0, maxLife: bold ? 1.5 : 1.0, bold });
  }
  shakeIt(n: number) { this.shake = Math.min(14, this.shake + n); }
  flashScreen(c: string, a: number) { this.flash = Math.max(this.flash, a); this.flashColor = c; }
  showBanner(text: string, sub: string, color: string, dur: number) {
    this.banner = { text, sub, life: dur, maxLife: dur, color };
  }

  // -------------------------------------------------------------- frame ---
  draw(g: GameState, dt: number, playerTeam: TeamId) {
    const ctx = this.ctx;
    const t = g.t;
    ctx.save();
    ctx.clearRect(0, 0, C.W, C.H);
    if (this.shake > 0.1) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      this.shake *= Math.pow(0.0018, dt);
    } else this.shake = 0;

    ctx.drawImage(this.terrain, 0, 0);
    this.drawMagmaGlints(ctx, t);
    if (g.twilightLevel > 0) {
      ctx.fillStyle = `rgba(120,70,200,${Math.min(0.18, 0.05 + g.twilightLevel * 0.02)})`;
      ctx.fillRect(0, 0, C.W, C.H);
    }
    this.drawMist(ctx, t);
    this.drawTorches(ctx, t);
    this.drawPortals(ctx, g, t);
    this.drawMarkers(ctx, dt, playerTeam);
    for (const z of g.zones) this.drawZone(ctx, z, g, t);
    this.drawFountains(ctx, g, t);
    this.drawCastles(ctx, g, t);

    const sorted = [...g.units].sort((a, b) => a.pos.y - b.pos.y);
    for (const u of sorted) this.drawUnit(ctx, u, g, t);
    for (const s of g.summons) {
      ctx.save();
      ctx.translate(s.pos.x, s.pos.y);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(0, 12, 9, 3.4, 0, 0, Math.PI * 2); ctx.fill();
      paintSummon(ctx, s, t);
      if (s.maxHp > 0 && s.hp < s.maxHp) this.bar(ctx, -10, -22, 20, 3, s.hp / s.maxHp, '#9fe8b0');
      ctx.restore();
    }
    for (const team of g.teams) this.drawHero(ctx, team.hero, g, t);
    for (const pr of g.projectiles) this.drawProjectile(ctx, pr, t);

    this.drawPillars(ctx, dt);
    this.drawParticles(ctx, dt);
    this.drawBeams(ctx, dt);
    this.drawFloaters(ctx, dt);

    if (this.flash > 0.005) {
      ctx.globalAlpha = this.flash;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, C.W, C.H);
      ctx.globalAlpha = 1;
      this.flash *= Math.pow(0.001, dt);
    }
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
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 24;
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

  drawMagmaGlints(ctx: Ctx, t: number) {
    const mid = C.W / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const y = 180 + ((t * 26 + i * 160) % (C.H - 220));
      const x = mid + Math.sin(y * 0.045) * 22;
      ctx.globalAlpha = 0.3 + Math.sin(t * 3 + i) * 0.15;
      const g0 = ctx.createRadialGradient(x, y, 1, x, y, 16);
      g0.addColorStop(0, '#ffb347');
      g0.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g0;
      circle(ctx, x, y, 16);
      ctx.fill();
    }
    ctx.restore();
  }

  drawMist(ctx: Ctx, t: number) {
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const x = ((t * (7 + i * 3) + i * 700) % (C.W + 1100)) - 550;
      const y = 300 + i * 220;
      ctx.globalAlpha = 0.028 + i * 0.008;
      ctx.fillStyle = '#cfd8ff';
      ctx.beginPath();
      ctx.ellipse(x, y, 520, 60, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawTorches(ctx: Ctx, t: number) {
    for (const team of [0, 1] as TeamId[]) {
      const L = laneOf(team);
      for (const side of [L.x0 - 16, L.x1 + 16]) {
        for (let y = 230; y < C.CASTLE_Y - 70; y += 165) {
          const fl = Math.sin(t * 9 + y + side) * 1.6;
          glowCircle(ctx, side, y - 34, 17, 'rgba(255,170,80,1)'.replace('1)', '0.9)'), 0.5);
          ctx.fillStyle = '#ffcf6b';
          ctx.beginPath();
          ctx.ellipse(side + fl * 0.4, y - 35 - Math.abs(fl), 2.8, 5.4 + fl, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ff8c42';
          ctx.beginPath();
          ctx.ellipse(side + fl * 0.3, y - 33, 1.8, 3.2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  drawPortals(ctx: Ctx, g: GameState, t: number) {
    for (const team of [0, 1] as TeamId[]) {
      const x = laneCenterX(team);
      const y = C.SPAWN_Y - 26;
      const congested = g.teams[1 - team].sendQueue.length;
      ctx.save();
      ctx.translate(x, y);
      // stone arch, dressed
      ctx.lineWidth = 12;
      ctx.strokeStyle = '#2e2a3c';
      ctx.beginPath(); ctx.arc(0, 14, 47, Math.PI, 0); ctx.stroke();
      ctx.lineWidth = 9;
      ctx.strokeStyle = '#4a4458';
      ctx.beginPath(); ctx.arc(0, 14, 46, Math.PI, 0); ctx.stroke();
      // keystone + voussoirs
      ctx.fillStyle = '#5d5470';
      for (let i = 0; i <= 6; i++) {
        const a2 = Math.PI + (i / 6) * Math.PI;
        const kx = Math.cos(a2) * 46, ky = 14 + Math.sin(a2) * 46;
        ctx.save();
        ctx.translate(kx, ky);
        ctx.rotate(a2 + Math.PI / 2);
        ctx.fillRect(-5, -5, 10, 10);
        ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.2;
        ctx.strokeRect(-5, -5, 10, 10);
        ctx.restore();
      }
      plate(ctx, [[-56, 8], [-42, 8], [-42, 30], [-56, 30]], '#39334a');
      plate(ctx, [[42, 8], [56, 8], [56, 30], [42, 30]], '#39334a');
      // swirling void
      const cc = team === 0 ? '#ff7a5c' : '#7db8ff';
      const swirl = ctx.createRadialGradient(0, 16, 2, 0, 16, 42);
      swirl.addColorStop(0, '#fff');
      swirl.addColorStop(0.35, cc);
      swirl.addColorStop(1, 'rgba(8,8,16,0.95)');
      ctx.globalAlpha = 0.78 + Math.sin(t * 3) * 0.1;
      ctx.fillStyle = swirl;
      ctx.beginPath(); ctx.arc(0, 16, 41, Math.PI, 0); ctx.fill();
      ctx.globalAlpha = 1;
      // rotating glyphs
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = cc;
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const a2 = t * 1.2 + (i / 5) * Math.PI;
        const px = Math.cos(a2) * 30, py = 16 - Math.abs(Math.sin(a2)) * 22;
        ctx.globalAlpha = 0.6;
        ctx.strokeRect(px - 2.4, py - 2.4, 4.8, 4.8);
      }
      ctx.restore();
      if (congested > 0) {
        ctx.font = '700 13px Cinzel, Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = cc;
        ctx.fillText(`⚔ ${congested}`, 0, -50);
      }
      ctx.restore();
    }
  }

  drawMarkers(ctx: Ctx, dt: number, playerTeam: TeamId) {
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      m.life += dt;
      if (m.life >= m.maxLife) { this.markers.splice(i, 1); continue; }
      const p = m.life / m.maxLife;
      const a = 1 - p;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.globalAlpha = a;
      // WC3-style converging chevrons + shrinking ring
      ctx.strokeStyle = '#ffd86b';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(0, 0, 22 * (1 - p * 0.55), 9 * (1 - p * 0.55), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffe9a0';
      for (let k = 0; k < 4; k++) {
        const ang = (k * Math.PI) / 2 + Math.PI / 4;
        const d0 = 26 * (1 - p);
        const cx2 = Math.cos(ang) * d0, cy2 = Math.sin(ang) * d0 * 0.45;
        ctx.save();
        ctx.translate(cx2, cy2);
        ctx.rotate(ang + Math.PI);
        poly(ctx, [[0, 0], [7, -3], [7, 3]]);
        ctx.fill();
        ctx.restore();
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
      glowCircle(ctx, 0, 0, 36 * pulse, 'rgba(159,232,176,0.9)', 0.4);
      // stone basin
      blob(ctx, 0, 2, 20, 8.4, '#4a5564');
      const wat = ctx.createRadialGradient(0, 0, 2, 0, 0, 14);
      wat.addColorStop(0, '#bff2dc');
      wat.addColorStop(1, '#3d8a78');
      ctx.fillStyle = wat;
      ctx.beginPath(); ctx.ellipse(0, 0, 14, 5.6, 0, 0, Math.PI * 2); ctx.fill();
      // shimmer
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        const a2 = t * 2 + (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a2) * 5, Math.sin(a2) * 2 - 1, 3, 1, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // rising motes
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.7 + i / 3) % 1;
        ctx.globalAlpha = (1 - ph) * 0.7;
        ctx.fillStyle = '#bff2dc';
        circle(ctx, Math.sin(i * 9 + t) * 8, -ph * 26, 1.6);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawCastles(ctx: Ctx, g: GameState, t: number) {
    for (const team of g.teams) {
      const cp = castlePos(team.id);
      const main = team.id === 0 ? '#3c63b0' : '#b03c4e';
      const light = team.id === 0 ? '#7db8ff' : '#ff7a5c';
      const stone = team.id === 0 ? '#3f3a52' : '#4a3844';
      const pct = team.castleHp / team.castleMaxHp;
      ctx.save();
      ctx.translate(cp.x, cp.y);
      if (team.lastStand) {
        glowCircle(ctx, 0, -30, 130, 'rgba(255,80,60,1)', 0.3);
      }
      // curtain wall with brick courses
      plate(ctx, [[-125, -40], [125, -40], [120, 40], [-120, 40]], stone);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      for (let y = -30; y < 36; y += 11) {
        ctx.beginPath(); ctx.moveTo(-119, y); ctx.lineTo(119, y); ctx.stroke();
        for (let x = -110 + (y % 22 === 0 ? 0 : 11); x < 120; x += 22) {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 11); ctx.stroke();
        }
      }
      // crenellations
      for (let i = -115; i <= 100; i += 26) {
        plate(ctx, [[i, -49], [i + 15, -49], [i + 15, -38], [i, -38]], sh(stone, 0.12));
      }
      // gate arch + portcullis
      ctx.fillStyle = '#15101e';
      ctx.beginPath(); ctx.arc(0, 18, 31, Math.PI, 0); ctx.fill();
      ctx.fillRect(-31, 18, 62, 22);
      const gateGlow = ctx.createRadialGradient(0, 26, 2, 0, 26, 30);
      gateGlow.addColorStop(0, light + '44');
      gateGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gateGlow;
      ctx.fillRect(-31, -8, 62, 48);
      ctx.strokeStyle = '#5a5470';
      ctx.lineWidth = 2.6;
      for (let i = -22; i <= 22; i += 9) { ctx.beginPath(); ctx.moveTo(i, -6); ctx.lineTo(i, 38); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(-26, 8); ctx.lineTo(26, 8); ctx.moveTo(-29, 24); ctx.lineTo(29, 24); ctx.stroke();
      // gate arch dressing
      ctx.strokeStyle = sh(stone, 0.22);
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 18, 33, Math.PI, 0); ctx.stroke();
      // keep towers — one per level, with conical roofs
      for (let k = 0; k < team.baseLevel; k++) {
        const tx = (k - (team.baseLevel - 1) / 2) * 70;
        plate(ctx, [[tx - 20, -98], [tx + 20, -98], [tx + 17, -36], [tx - 17, -36]], sh(stone, 0.08));
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        for (let y = -90; y < -40; y += 10) { ctx.beginPath(); ctx.moveTo(tx - 17, y); ctx.lineTo(tx + 17, y); ctx.stroke(); }
        // conical roof with shingle strokes
        plate(ctx, [[tx - 23, -98], [tx, -132], [tx + 23, -98]], main);
        ctx.strokeStyle = sh(main, -0.3);
        ctx.lineWidth = 1.2;
        for (let s = 1; s < 4; s++) {
          ctx.beginPath();
          ctx.moveTo(tx - 23 + s * 6, -98 - s * 1.4);
          ctx.lineTo(tx, -132 + s * 2);
          ctx.stroke();
        }
        // glowing window
        plate(ctx, [[tx - 5, -84], [tx + 5, -84], [tx + 5, -68], [tx - 5, -68]], '#15101e');
        glowCircle(ctx, tx, -76, 9, light, 0.5);
        ctx.fillStyle = light;
        ctx.globalAlpha = 0.8;
        rr(ctx, tx - 3.4, -82, 6.8, 12, 3);
        ctx.fill();
        ctx.globalAlpha = 1;
        // banner
        const wave = Math.sin(t * 3 + k) * 2.4;
        limb(ctx, tx + 20, -126, tx + 20, -98, 1.6, '#2a2436');
        plate(ctx, [[tx + 20, -124], [tx + 42 + wave, -118], [tx + 20, -106]], main);
        ctx.fillStyle = sh(main, 0.4);
        if (team.id === 0) { circle(ctx, tx + 28, -115, 3.4); ctx.fill(); } // sun
        else { ctx.beginPath(); ctx.arc(tx + 28, -115, 3.4, 0.6, Math.PI * 2 - 0.6); ctx.fill(); } // crescent
      }
      // damage states: cracks + smoke
      if (pct < 0.6) {
        ctx.strokeStyle = 'rgba(8,6,14,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-70, -36); ctx.lineTo(-58, -16); ctx.lineTo(-66, 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(64, -30); ctx.lineTo(52, -8); ctx.lineTo(60, 12); ctx.stroke();
      }
      if (pct < 0.35 && Math.random() < 0.2) {
        this.burst({ x: cp.x + (Math.random() - 0.5) * 140, y: cp.y - 44 }, 1, '#6a6a7a', 'smoke', 1.4);
      }
      if (team.lastStand && Math.random() < 0.3) {
        this.burst({ x: cp.x + (Math.random() - 0.5) * 100, y: cp.y - 50 }, 1, '#ff8c42', 'ember', 2);
      }
      // castle hp bar
      this.bar(ctx, -90, -148, 180, 9, pct, pct < 0.25 ? '#ff5e4d' : pct < 0.55 ? '#ffb347' : light);
      ctx.restore();
    }
  }

  drawUnit(ctx: Ctx, u: UnitState, g: GameState, t: number) {
    const def = UNIT_BY_ID[u.defId];
    ctx.save();
    const air = g.t < u.airborneUntil;
    const lift = air ? -26 - Math.sin((u.airborneUntil - g.t) * 6) * 4 : 0;
    ctx.translate(u.pos.x, u.pos.y + lift);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 12 - lift, def.tier >= 3 ? 15 : 9.4, def.tier >= 3 ? 5 : 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    if (def.flying) ctx.translate(0, -16 + Math.sin(t * 2.4 + u.bob) * 4);

    const slowed = g.t < u.slowUntil;
    const stunned = g.t < u.ccUntil && !air;
    const confused = g.t < u.confuseUntil;
    const feared = g.t < u.fearUntil;
    const blinded = g.t < u.missUntil;
    paintUnit(ctx, u.defId, t + u.bob, def.tier === 3 ? 1.35 : def.legendary ? 1.6 : 1.05, !stunned);
    if (slowed) {
      ctx.strokeStyle = 'rgba(140,210,255,0.8)';
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) {
        const a2 = (i / 3) * Math.PI * 2 + t * 0.5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a2) * 10, -4 + Math.sin(a2) * 10);
        ctx.lineTo(Math.cos(a2) * 13, -4 + Math.sin(a2) * 13);
        ctx.stroke();
      }
    }
    if (stunned) {
      for (let i = 0; i < 3; i++) {
        const a2 = t * 5 + (i * Math.PI * 2) / 3;
        ctx.fillStyle = '#ffe9a0';
        circle(ctx, Math.cos(a2) * 10, -22 + Math.sin(a2) * 3, 1.8);
        ctx.fill();
      }
    }
    if (confused) {
      ctx.fillStyle = '#ffd1ec';
      ctx.font = '10px serif';
      ctx.textAlign = 'center';
      ctx.fillText('?', 6, -20);
      ctx.fillText('?', -6, -24);
    }
    if (feared) {
      ctx.fillStyle = '#c5a8ff';
      ctx.font = '10px serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', 0, -22);
    }
    if (blinded) {
      ctx.fillStyle = 'rgba(180,180,160,0.8)';
      ctx.font = '9px serif';
      ctx.textAlign = 'center';
      ctx.fillText('✱', 0, -25);
    }
    if (u.dots.length > 0 && Math.random() < 0.25) {
      this.burst({ x: u.pos.x, y: u.pos.y - 8 }, 1, '#ff8c42', 'ember', 1.2);
    }
    const w = def.tier >= 3 ? 30 : 20;
    this.bar(ctx, -w / 2, def.legendary ? -44 : -29, w, 3.2, u.hp / u.maxHp, u.owner === 1 ? '#7db8ff' : '#ff7a5c');
    ctx.restore();
  }

  drawHero(ctx: Ctx, h: HeroState, g: GameState, t: number) {
    if (h.dead) {
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
    // team ring
    ctx.strokeStyle = h.team === 0 ? 'rgba(125,184,255,0.7)' : 'rgba(255,122,92,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 14, 16 * (h.d?.scale ?? 1), 5.8 * (h.d?.scale ?? 1), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 14, 13 * (h.d?.scale ?? 1), 4.4 * (h.d?.scale ?? 1), 0, 0, Math.PI * 2);
    ctx.fill();
    // buff glow
    for (const b of h.buffs) {
      if (b.theme && b.until - g.t > 0.05 && b.theme !== 'stun' && b.theme !== 'fear') {
        const ab = ABILITY_BY_ID[b.theme];
        if (ab) {
          glowCircle(ctx, 0, -6, 27, ab.theme.c1, 0.25 + Math.sin(t * 5) * 0.06);
        }
      }
    }
    paintHero(ctx, h, t, g);
    if (h.buffs.some(b => b.stun)) {
      for (let i = 0; i < 3; i++) {
        const a2 = t * 5 + (i * Math.PI * 2) / 3;
        ctx.fillStyle = '#ffe9a0';
        circle(ctx, Math.cos(a2) * 13, -32 + Math.sin(a2) * 3, 2.2);
        ctx.fill();
      }
    }
    if (h.buffs.some(b => b.fear)) {
      ctx.fillStyle = '#ff4d4d';
      ctx.font = '700 16px serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', 0, -36);
    }
    const sc = h.d?.scale ?? 1;
    this.bar(ctx, -17, -36 * sc, 34, 4, h.hp / h.d.maxHp, h.team === 0 ? '#7df3a0' : '#ff9a7a');
    this.bar(ctx, -17, -31 * sc, 34, 2.6, h.mana / h.d.maxMana, '#7db8ff');
    ctx.fillStyle = '#0e0b16';
    circle(ctx, 21, -32 * sc, 8); ctx.fill();
    ctx.strokeStyle = '#e3b341';
    ctx.lineWidth = 1.4;
    circle(ctx, 21, -32 * sc, 8); ctx.stroke();
    ctx.fillStyle = '#ffe9a0';
    ctx.font = '700 10px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(h.level), 21, -32 * sc + 0.5);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  drawProjectile(ctx: Ctx, pr: { pos: Vec; vel: Vec; theme: { c1: string; c2: string }; boomerang: number; kind: string; r: number }, t: number) {
    ctx.save();
    ctx.translate(pr.pos.x, pr.pos.y);
    const ang = Math.atan2(pr.vel.y, pr.vel.x);
    if (pr.boomerang) {
      ctx.rotate(t * 18);
      limb(ctx, -8, 0, 8, 0, 2.6, '#6a5a3a');
      plate(ctx, [[6, -5], [11, -2], [11, 2], [6, 5]], '#cfd8e8');
      plate(ctx, [[-6, -5], [-11, -2], [-11, 2], [-6, 5]], '#cfd8e8');
      glowCircle(ctx, 0, 0, 10, pr.theme.c1, 0.4);
    } else if (pr.kind === 'phys') {
      ctx.rotate(ang);
      ctx.globalAlpha = 0.45;
      const tr = ctx.createLinearGradient(-22, 0, 0, 0);
      tr.addColorStop(0, 'rgba(0,0,0,0)');
      tr.addColorStop(1, pr.theme.c1);
      ctx.fillStyle = tr;
      poly(ctx, [[-22, -1.4], [0, -2.4], [0, 2.4], [-22, 1.4]]);
      ctx.fill();
      ctx.globalAlpha = 1;
      limb(ctx, -8, 0, 6, 0, 1.8, '#d8cfa8');
      plate(ctx, [[6, -3], [11, 0], [6, 3]], pr.theme.c1);
      plate(ctx, [[-8, -2.6], [-11, 0], [-8, 2.6]], '#e8e4d8');
    } else {
      glowCircle(ctx, 0, 0, pr.r + 5, pr.theme.c1, 0.95);
      ctx.rotate(ang);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55;
      const tr = ctx.createLinearGradient(-34, 0, 0, 0);
      tr.addColorStop(0, 'rgba(0,0,0,0)');
      tr.addColorStop(1, pr.theme.c1);
      ctx.fillStyle = tr;
      poly(ctx, [[-34, -2.4], [0, -4.4], [0, 4.4], [-34, 2.4]]);
      ctx.fill();
      ctx.restore();
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
        circle(ctx, 0, 0, z.r);
        ctx.fill();
        if (Math.random() < 0.5) this.burst({ x: z.pos.x + (Math.random() - 0.5) * z.r * 1.4, y: z.pos.y + (Math.random() - 0.5) * z.r }, 1, '#ffb347', 'ember', 1);
        break;
      }
      case 'gravity': {
        for (let i = 0; i < 3; i++) {
          const rr0 = z.r * (1 - ((t * 0.5 + i / 3) % 1));
          ctx.strokeStyle = z.theme.c1;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.5 * (rr0 / z.r);
          ctx.beginPath();
          ctx.ellipse(0, 0, rr0, rr0 * 0.6, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }
      case 'root': {
        ctx.globalAlpha = Math.min(0.8, remain * 2);
        ctx.strokeStyle = z.theme.c1;
        ctx.lineWidth = 2.4;
        for (let i = 0; i < 8; i++) {
          const a2 = (i / 8) * Math.PI * 2 + (z.id % 7);
          const rx = Math.cos(a2) * z.r * 0.75, ry = Math.sin(a2) * z.r * 0.45;
          ctx.beginPath();
          ctx.moveTo(rx, ry + 6);
          ctx.quadraticCurveTo(rx + 5, ry - 8, rx - 3, ry - 16 - Math.sin(t * 4 + i) * 3);
          ctx.stroke();
        }
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = z.theme.c1;
        ctx.beginPath();
        ctx.ellipse(0, 0, z.r * 0.8, z.r * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'spore': case 'pollen': case 'smog': {
        ctx.globalAlpha = Math.min(0.5, remain);
        for (let i = 0; i < 7; i++) {
          const a2 = (i / 7) * Math.PI * 2 + t * 0.6;
          ctx.fillStyle = i % 2 ? z.theme.c1 : z.theme.c2;
          circle(ctx, Math.cos(a2) * z.r * 0.5, Math.sin(a2) * z.r * 0.3, 9 + Math.sin(t * 3 + i) * 3);
          ctx.fill();
        }
        break;
      }
      case 'sanctify': {
        ctx.globalAlpha = Math.min(0.8, remain);
        ctx.strokeStyle = z.theme.c1;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, z.r * 0.92, z.r * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.14;
        const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, z.r);
        grad.addColorStop(0, z.theme.c1);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        circle(ctx, 0, 0, z.r);
        ctx.fill();
        // rising light motes
        ctx.globalAlpha = 0.8;
        for (let i = 0; i < 5; i++) {
          const ph = (t * 0.5 + i / 5) % 1;
          ctx.fillStyle = z.theme.c1;
          ctx.globalAlpha = (1 - ph) * 0.7;
          circle(ctx, Math.sin(i * 7 + t * 0.8) * z.r * 0.6, -ph * 34, 1.8);
          ctx.fill();
        }
        break;
      }
      case 'banner': {
        ctx.globalAlpha = 0.85;
        limb(ctx, 0, 10, 0, -34, 3, z.theme.c2);
        const wave = Math.sin(t * 4) * 3;
        plate(ctx, [[0, -34], [24 + wave, -27], [0, -19]], z.theme.c1);
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = z.theme.c1;
        ctx.beginPath();
        ctx.ellipse(0, 0, z.r, z.r * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'collapse': {
        const p = Math.min(1, age / Math.max(0.05, z.until - z.born));
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = z.theme.c1;
        ctx.lineWidth = 3 + p * 3;
        circle(ctx, 0, 0, z.r * (1 - p * 0.7));
        ctx.stroke();
        const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, z.r * (1 - p * 0.5));
        grad.addColorStop(0, '#ffffffaa');
        grad.addColorStop(0.5, z.theme.c1 + '66');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        circle(ctx, 0, 0, z.r * (1 - p * 0.5));
        ctx.fill();
        break;
      }
      case 'anvil': {
        // target rune + the falling anvil silhouette
        const p = Math.min(1, age / Math.max(0.05, z.until - z.born));
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = z.theme.c1;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.ellipse(0, 0, z.r * 0.9, z.r * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(0, 0, z.r * 0.55, z.r * 0.3, 0, 0, Math.PI * 2);
        ctx.stroke();
        // runes around the rim
        for (let i = 0; i < 6; i++) {
          const a2 = (i / 6) * Math.PI * 2 + t;
          ctx.fillStyle = z.theme.c1;
          ctx.fillRect(Math.cos(a2) * z.r * 0.72 - 2, Math.sin(a2) * z.r * 0.4 - 2, 4, 4);
        }
        // incoming anvil
        const ay = -420 * (1 - p);
        ctx.globalAlpha = Math.min(1, p * 1.6);
        plate(ctx, [[-34, ay - 20], [34, ay - 20], [22, ay], [12, ay], [12, ay + 12], [-12, ay + 12], [-12, ay], [-22, ay]], '#5a6474');
        glint(ctx, 0, ay - 17, 30, 0, 0.5);
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
        for (let i = 0; i < 4; i++) {
          const a2 = t * 9 + (i * Math.PI) / 2;
          const rr0 = 20 + ((t * 60 + i * 23) % 40);
          ctx.fillStyle = '#8a7a5d';
          ctx.fillRect(Math.cos(a2) * rr0 - 2, -30 - ((t * 50 + i * 31) % 50) + Math.sin(a2) * rr0 * 0.3, 4, 4);
        }
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = z.theme.c1;
        ctx.beginPath();
        ctx.ellipse(0, 4, z.r, z.r * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'blackhole': {
        const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, z.r);
        grad.addColorStop(0, '#000000');
        grad.addColorStop(0.35, '#0a0618');
        grad.addColorStop(0.55, z.theme.c2 + '88');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        circle(ctx, 0, 0, z.r);
        ctx.fill();
        ctx.save();
        ctx.rotate(t * 2.2);
        ctx.strokeStyle = z.theme.c2;
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.ellipse(0, 0, z.r * 0.42, z.r * 0.16, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#6de0e8';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(0, 0, z.r * 0.52, z.r * 0.2, 0, 0.6, Math.PI * 1.4);
        ctx.stroke();
        ctx.restore();
        for (let i = 0; i < 7; i++) {
          const a2 = (i / 7) * Math.PI * 2 + t * 3;
          const d0 = z.r * (1 - ((t * 0.9 + i * 0.13) % 1));
          ctx.strokeStyle = z.theme.c2;
          ctx.globalAlpha = 0.7 * (d0 / z.r);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a2) * d0, Math.sin(a2) * d0 * 0.7);
          ctx.lineTo(Math.cos(a2) * (d0 - 14), Math.sin(a2) * (d0 - 14) * 0.7);
          ctx.stroke();
        }
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6;
        circle(ctx, 0, 0, z.r * 0.3);
        ctx.stroke();
        break;
      }
      case 'starfall': {
        ctx.globalAlpha = 0.16 + Math.sin(t * 5) * 0.05;
        const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, z.r);
        grad.addColorStop(0, z.theme.c1);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        circle(ctx, 0, 0, Math.min(z.r, 320));
        ctx.fill();
        break;
      }
      case 'beamfire': {
        const L = laneOf(z.owner);
        ctx.restore();
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
      case 'rattide': {
        // a living carpet at the wavefront
        const L = laneOf(z.owner);
        ctx.restore();
        ctx.save();
        const w = z.p.width;
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#2a2418';
        ctx.fillRect(L.x0 + 4, z.pos.y - w * 0.7, L.x1 - L.x0 - 8, w * 1.4);
        ctx.globalAlpha = 1;
        for (let i = 0; i < 38; i++) {
          const x = L.x0 + 14 + hash(i * 5) * (L.x1 - L.x0 - 28);
          const yy = z.pos.y + Math.sin(t * 9 + i * 2.7) * w * 0.55 - 4;
          const rx = 4.4 + hash(i * 9) * 2.4;
          ctx.fillStyle = i % 3 === 0 ? '#5a4a36' : i % 3 === 1 ? '#4a3c2c' : '#6a5a44';
          ctx.beginPath();
          ctx.ellipse(x, yy, rx, rx * 0.5, Math.sin(t * 10 + i), 0, Math.PI * 2);
          ctx.fill();
          // tails
          ctx.strokeStyle = '#3a3024';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(x - rx, yy);
          ctx.quadraticCurveTo(x - rx - 5, yy + Math.sin(t * 12 + i) * 3, x - rx - 8, yy);
          ctx.stroke();
        }
        // kicked-up dust
        if (Math.random() < 0.7) {
          this.burst({ x: L.x0 + 20 + Math.random() * (L.x1 - L.x0 - 40), y: z.pos.y + w * 0.5 }, 1, '#8a7a5d', 'smoke', 1.4);
        }
        break;
      }
    }
    ctx.restore();
  }

  drawPillars(ctx: Ctx, dt: number) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = this.pillars.length - 1; i >= 0; i--) {
      const p = this.pillars[i];
      p.life += dt;
      if (p.life >= p.maxLife) { this.pillars.splice(i, 1); continue; }
      const a = 1 - p.life / p.maxLife;
      const w = 26 * (0.6 + a * 0.4);
      const grad = ctx.createLinearGradient(p.x - w, 0, p.x + w, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, p.c1);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = a * 0.8;
      ctx.fillStyle = grad;
      ctx.fillRect(p.x - w, 60, w * 2, p.y - 60);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.c2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, w * 1.1, w * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
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
      const additive = p.kind === 'spark' || p.kind === 'star' || p.kind === 'ring' || p.kind === 'ember';
      ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
      switch (p.kind) {
        case 'ring': {
          const r0 = p.size * (0.3 + (p.life / p.maxLife) * 1.4);
          ctx.strokeStyle = p.c;
          ctx.lineWidth = 3 * a;
          circle(ctx, p.x, p.y, r0);
          ctx.stroke();
          break;
        }
        case 'smoke':
          ctx.fillStyle = p.c;
          ctx.globalAlpha = a * 0.4;
          circle(ctx, p.x, p.y, p.size * (1 + p.life * 2));
          ctx.fill();
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
          circle(ctx, p.x, p.y, p.size * a);
          ctx.fill();
      }
    }
    ctx.restore();
  }

  drawBeams(ctx: Ctx, dt: number) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      if (b.life <= 0) { this.beams.splice(i, 1); continue; }
      const a = b.life / b.maxLife;
      ctx.globalAlpha = a;
      ctx.strokeStyle = b.c;
      ctx.lineWidth = b.w;
      ctx.shadowColor = b.c;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      if (b.jag) {
        // jagged lightning path
        const segs = 6;
        ctx.moveTo(b.x1, b.y1);
        for (let s = 1; s < segs; s++) {
          const f = s / segs;
          const mx = b.x1 + (b.x2 - b.x1) * f + (hash(i * 7 + s) - 0.5) * 26;
          const my = b.y1 + (b.y2 - b.y1) * f + (hash(i * 13 + s) - 0.5) * 12;
          ctx.lineTo(mx, my);
        }
        ctx.lineTo(b.x2, b.y2);
      } else {
        ctx.moveTo(b.x1, b.y1);
        ctx.lineTo(b.x2, b.y2);
      }
      ctx.stroke();
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
    rr(ctx, x - 1, y - 1, w + 2, h + 2, 2);
    ctx.fill();
    if (pct > 0) {
      const g0 = ctx.createLinearGradient(0, y, 0, y + h);
      g0.addColorStop(0, sh(color.startsWith('#') ? color : '#7df3a0', 0.25));
      g0.addColorStop(1, color);
      ctx.fillStyle = g0;
      rr(ctx, x, y, Math.max(1.5, w * Math.min(1, pct)), h, 1.6);
      ctx.fill();
    }
  }
}
