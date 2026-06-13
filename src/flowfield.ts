// ---------------------------------------------------------------------------
// Flow-field pathfinding for the maze mechanic. When the Wallwright drops
// towers in a lane, invading units must route around them. We BFS outward
// from the castle gate (the bottom edge) across a coarse grid, skipping
// tower-blocked cells, then every cell stores a unit vector pointing toward
// its lowest-distance neighbour — i.e. the shortest walkable way to the gate.
//
// Rebuilt only when a lane's towers change (towerVersion bumps). If a unit
// finds itself in an unreachable pocket (e.g. fully walled in), it falls back
// to steering straight at the gate so nothing ever gets permanently stuck.
// ---------------------------------------------------------------------------

import type { GameState, TeamId, TowerState, Vec } from './types';
import { C, laneOf } from './data/constants';

interface Field {
  version: number;
  x0: number; y0: number;
  cols: number; rows: number;
  dx: Float32Array; // flow vector per cell
  dy: Float32Array;
  reachable: Uint8Array;
}

const CELL = C.FLOW_CELL;
const cache: [Field | null, Field | null] = [null, null];

function build(lane: TeamId, towers: TowerState[], version: number): Field {
  const L = laneOf(lane);
  const x0 = L.x0 - 6;
  const y0 = C.SPAWN_Y - 12;
  const x1 = L.x1 + 6;
  const y1 = C.CASTLE_Y - 6;
  const cols = Math.max(1, Math.ceil((x1 - x0) / CELL));
  const rows = Math.max(1, Math.ceil((y1 - y0) / CELL));
  const n = cols * rows;

  const blocked = new Uint8Array(n);
  for (const tw of towers) {
    if (tw.lane !== lane) continue;
    const rad = tw.r;
    const minc = Math.max(0, Math.floor((tw.pos.x - rad - x0) / CELL));
    const maxc = Math.min(cols - 1, Math.floor((tw.pos.x + rad - x0) / CELL));
    const minr = Math.max(0, Math.floor((tw.pos.y - rad - y0) / CELL));
    const maxr = Math.min(rows - 1, Math.floor((tw.pos.y + rad - y0) / CELL));
    for (let r = minr; r <= maxr; r++) {
      for (let c = minc; c <= maxc; c++) {
        const cx = x0 + (c + 0.5) * CELL;
        const cy = y0 + (r + 0.5) * CELL;
        if (Math.hypot(cx - tw.pos.x, cy - tw.pos.y) <= rad + 4) blocked[r * cols + c] = 1;
      }
    }
  }

  const dist = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let qh = 0, qt = 0;
  // seed: the whole bottom row is "the gate" — units head for the nearest exit
  const gateRow = rows - 1;
  for (let c = 0; c < cols; c++) {
    const idx = gateRow * cols + c;
    if (!blocked[idx]) { dist[idx] = 0; queue[qt++] = idx; }
  }
  // 8-connected BFS (diagonal cost approximated as equal for smoother flow)
  while (qh < qt) {
    const idx = queue[qh++];
    const r = (idx / cols) | 0;
    const c = idx - r * cols;
    const d = dist[idx];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const nidx = nr * cols + nc;
        if (blocked[nidx] || dist[nidx] !== -1) continue;
        // forbid cutting diagonally between two blocked orthogonals
        if (dr && dc && (blocked[r * cols + nc] && blocked[nr * cols + c])) continue;
        dist[nidx] = d + 1;
        queue[qt++] = nidx;
      }
    }
  }

  const dx = new Float32Array(n);
  const dy = new Float32Array(n);
  const reachable = new Uint8Array(n);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (dist[idx] < 0) continue;
      reachable[idx] = 1;
      // point toward the neighbour with the smallest distance-to-gate
      let bestD = dist[idx], bx = 0, by = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const nidx = nr * cols + nc;
          if (dist[nidx] < 0) continue;
          if (dist[nidx] < bestD) { bestD = dist[nidx]; bx = dc; by = dr; }
        }
      }
      const len = Math.hypot(bx, by) || 1;
      dx[idx] = bx / len;
      dy[idx] = by / len;
    }
  }

  return { version, x0, y0, cols, rows, dx, dy, reachable };
}

export function getFlow(g: GameState, lane: TeamId): Field {
  const v = g.towerVersion[lane];
  let f = cache[lane];
  if (!f || f.version !== v) {
    f = build(lane, g.towers, v);
    cache[lane] = f;
  }
  return f;
}

/** Steering direction for a unit at `pos` heading to the gate. dy>0 is toward the castle. */
export function flowDir(g: GameState, lane: TeamId, pos: Vec): Vec {
  const f = getFlow(g, lane);
  const c = Math.min(f.cols - 1, Math.max(0, Math.floor((pos.x - f.x0) / CELL)));
  const r = Math.min(f.rows - 1, Math.max(0, Math.floor((pos.y - f.y0) / CELL)));
  const idx = r * f.cols + c;
  if (f.reachable[idx]) return { x: f.dx[idx], y: f.dy[idx] };
  // unreachable pocket — make a beeline for the gate so we never hard-stick
  return { x: 0, y: 1 };
}

export function invalidateFlow(g: GameState, lane: TeamId) {
  g.towerVersion[lane]++;
}
