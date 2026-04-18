import type { GameState, Vec2 } from '../types';
import { MAP_W, MAP_H } from '../types';
import { isTileBlockedByEntity } from './entities';

// ─── A* ───────────────────────────────────────────────────────────────────────

interface Node {
  x: number; y: number;
  g: number; h: number; f: number;
  parent: Node | null;
}

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  // Chebyshev distance — allows diagonal movement
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

function key(x: number, y: number): number {
  return y * MAP_W + x;
}

/** Returns true if unit-sized (1×1) entity can stand on tile. */
function passable(state: GameState, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
  if (!state.tiles[ty][tx].passable) return false;
  if (isTileBlockedByEntity(state, tx, ty)) return false;
  return true;
}

const DIRS: Vec2[] = [
  { x:  1, y:  0 }, { x: -1, y:  0 },
  { x:  0, y:  1 }, { x:  0, y: -1 },
  { x:  1, y:  1 }, { x: -1, y:  1 },
  { x:  1, y: -1 }, { x: -1, y: -1 },
];

/**
 * A* from (sx,sy) to (gx,gy) on the tile grid.
 * Returns an array of tile coords from the step AFTER start up to and
 * including goal, or null if no path found.
 */
export function findPath(
  state: GameState,
  sx: number, sy: number,
  gx: number, gy: number,
): Vec2[] | null {
  if (sx === gx && sy === gy) return [];

  // If goal is impassable, try to get adjacent instead
  if (!passable(state, gx, gy)) {
    let best: Vec2 | null = null;
    let bestDist = Infinity;
    for (const d of DIRS) {
      const nx = gx + d.x, ny = gy + d.y;
      if (passable(state, nx, ny)) {
        const dist = heuristic(sx, sy, nx, ny);
        if (dist < bestDist) { bestDist = dist; best = { x: nx, y: ny }; }
      }
    }
    if (!best) return null;
    gx = best.x; gy = best.y;
  }

  const open = new Map<number, Node>();
  const closed = new Set<number>();

  const start: Node = { x: sx, y: sy, g: 0, h: heuristic(sx, sy, gx, gy), f: 0, parent: null };
  start.f = start.h;
  open.set(key(sx, sy), start);

  while (open.size > 0) {
    // Pick node with lowest f
    let current: Node | null = null;
    for (const node of open.values()) {
      if (!current || node.f < current.f) current = node;
    }
    if (!current) break;

    if (current.x === gx && current.y === gy) {
      // Reconstruct path (exclude start, include goal)
      const path: Vec2[] = [];
      let n: Node | null = current;
      while (n && (n.x !== sx || n.y !== sy)) {
        path.unshift({ x: n.x, y: n.y });
        n = n.parent;
      }
      return path;
    }

    open.delete(key(current.x, current.y));
    closed.add(key(current.x, current.y));

    for (const d of DIRS) {
      const nx = current.x + d.x;
      const ny = current.y + d.y;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      if (!passable(state, nx, ny) && !(nx === gx && ny === gy)) continue;

      // Diagonal movement: avoid cutting through blocked corners,
      // but allow sliding past temporary unit traffic better.
      if (d.x !== 0 && d.y !== 0) {
        const sideA = passable(state, current.x + d.x, current.y);
        const sideB = passable(state, current.x, current.y + d.y);
        if (!sideA && !sideB) continue;
      }

      const stepCost = d.x !== 0 && d.y !== 0 ? 1.414 : 1;
      const g = current.g + stepCost;

      const existing = open.get(nk);
      if (existing && existing.g <= g) continue;

      const node: Node = {
        x: nx, y: ny,
        g,
        h: heuristic(nx, ny, gx, gy),
        f: g + heuristic(nx, ny, gx, gy),
        parent: current,
      };
      open.set(nk, node);
    }

    // Safety valve — avoid infinite loop on huge open maps
    if (closed.size > MAP_W * MAP_H * 2) return null;
  }

  return null;
}
