import type { GameState, Vec2 } from '../types';
import { MAP_W, MAP_H } from '../types';
import { isTileBlockedByEntity } from './entities';
import { profiler } from './profiler';

// ─── A* ───────────────────────────────────────────────────────────────────────

interface Node {
  x: number; y: number;
  g: number; h: number; f: number;
  key: number;
  parent: Node | null;
}

class MinHeap {
  private data: Node[] = [];

  get size(): number {
    return this.data.length;
  }

  push(node: Node): void {
    this.data.push(node);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): Node | null {
    if (this.data.length === 0) return null;
    const first = this.data[0]!;
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.bubbleDown(0);
    }
    return first;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compareNodes(this.data[index]!, this.data[parent]!) >= 0) break;
      [this.data[index], this.data[parent]] = [this.data[parent]!, this.data[index]!];
      index = parent;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.data.length;
    while (true) {
      let smallest = index;
      const left = index * 2 + 1;
      const right = left + 1;

      if (left < length && compareNodes(this.data[left]!, this.data[smallest]!) < 0) smallest = left;
      if (right < length && compareNodes(this.data[right]!, this.data[smallest]!) < 0) smallest = right;
      if (smallest === index) break;

      [this.data[index], this.data[smallest]] = [this.data[smallest]!, this.data[index]!];
      index = smallest;
    }
  }
}

function compareNodes(a: Node, b: Node): number {
  if (a.f !== b.f) return a.f - b.f;
  if (a.h !== b.h) return a.h - b.h;
  return a.key - b.key;
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
  const t0 = profiler.now();
  let closedCount = 0;
  let maxOpenCount = 0;
  let found = false;

  if (sx === gx && sy === gy) {
    found = true;
    const result: Vec2[] = [];
    profiler.recordFindPath(profiler.now() - t0, found, closedCount, maxOpenCount);
    return result;
  }

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
    if (!best) {
      profiler.recordFindPath(profiler.now() - t0, found, closedCount, maxOpenCount);
      return null;
    }
    gx = best.x; gy = best.y;
  }

  const open = new Map<number, Node>();
  const heap = new MinHeap();
  const closed = new Set<number>();

  const startKey = key(sx, sy);
  const start: Node = { x: sx, y: sy, g: 0, h: heuristic(sx, sy, gx, gy), f: 0, key: startKey, parent: null };
  start.f = start.h;
  open.set(startKey, start);
  heap.push(start);
  maxOpenCount = 1;

  while (heap.size > 0) {
    let current: Node | null = heap.pop();
    while (current && open.get(current.key) !== current) current = heap.pop();
    if (!current) break;

    if (current.x === gx && current.y === gy) {
      // Reconstruct path (exclude start, include goal)
      const path: Vec2[] = [];
      let n: Node | null = current;
      while (n && (n.x !== sx || n.y !== sy)) {
        path.unshift({ x: n.x, y: n.y });
        n = n.parent;
      }
      found = true;
      closedCount = closed.size;
      profiler.recordFindPath(profiler.now() - t0, found, closedCount, maxOpenCount);
      return path;
    }

    open.delete(current.key);
    closed.add(current.key);

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
        key: nk,
        parent: current,
      };
      open.set(nk, node);
      heap.push(node);
      if (open.size > maxOpenCount) maxOpenCount = open.size;
    }

    // Safety valve — avoid infinite loop on huge open maps
    if (closed.size > MAP_W * MAP_H * 2) {
      closedCount = closed.size;
      profiler.recordFindPath(profiler.now() - t0, found, closedCount, maxOpenCount);
      return null;
    }
  }

  closedCount = closed.size;
  profiler.recordFindPath(profiler.now() - t0, found, closedCount, maxOpenCount);
  return null;
}
