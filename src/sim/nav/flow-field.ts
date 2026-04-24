import type { GameState, Vec2 } from '../../types';
import { MAP_H, MAP_W } from '../../types';
import { isTileBlockedByEntity } from '../entities';
import { profiler } from '../profiler';
import type { FlowFieldCache, FlowFieldData } from './flow-field-cache';

const INF = 0x7fff;

const DIRS: Vec2[] = [
  { x: 1, y: 0 }, { x: -1, y: 0 },
  { x: 0, y: 1 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: -1, y: 1 },
  { x: 1, y: -1 }, { x: -1, y: -1 },
];

function key(x: number, y: number): number {
  return y * MAP_W + x;
}

function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
}

function passable(state: GameState, tx: number, ty: number): boolean {
  if (!inBounds(tx, ty)) return false;
  if (!state.tiles[ty][tx].passable) return false;
  if (isTileBlockedByEntity(state, tx, ty)) return false;
  return true;
}

function allowsDiagonalStep(state: GameState, fromX: number, fromY: number, dx: number, dy: number): boolean {
  if (dx === 0 || dy === 0) return true;
  const sideA = passable(state, fromX + dx, fromY);
  const sideB = passable(state, fromX, fromY + dy);
  return sideA || sideB;
}

function resolveGoal(state: GameState, sx: number, sy: number, gx: number, gy: number): Vec2 | null {
  if (passable(state, gx, gy)) return { x: gx, y: gy };

  let best: Vec2 | null = null;
  let bestDist = Infinity;
  for (const d of DIRS) {
    const nx = gx + d.x;
    const ny = gy + d.y;
    if (!passable(state, nx, ny)) continue;
    const dist = Math.max(Math.abs(sx - nx), Math.abs(sy - ny));
    if (dist < bestDist) {
      best = { x: nx, y: ny };
      bestDist = dist;
    }
  }
  return best;
}

function buildField(state: GameState, goal: Vec2): FlowFieldData {
  const dist = new Int16Array(MAP_W * MAP_H);
  dist.fill(INF);

  const queueX = new Int16Array(MAP_W * MAP_H);
  const queueY = new Int16Array(MAP_W * MAP_H);
  let qh = 0;
  let qt = 0;

  dist[key(goal.x, goal.y)] = 0;
  queueX[qt] = goal.x;
  queueY[qt] = goal.y;
  qt++;

  while (qh < qt) {
    const x = queueX[qh]!;
    const y = queueY[qh]!;
    qh++;

    const cur = dist[key(x, y)]!;
    const next = cur + 1;

    for (const d of DIRS) {
      const nx = x + d.x;
      const ny = y + d.y;
      if (!passable(state, nx, ny)) continue;
      if (!allowsDiagonalStep(state, nx, ny, -d.x, -d.y)) continue;

      const nk = key(nx, ny);
      if (dist[nk] <= next) continue;
      dist[nk] = next;
      queueX[qt] = nx;
      queueY[qt] = ny;
      qt++;
    }
  }

  return { goalX: goal.x, goalY: goal.y, dist };
}

export function findFlowFieldPath(
  state: GameState,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  cache?: FlowFieldCache,
): Vec2[] | null {
  const t0 = profiler.now();
  if (sx === gx && sy === gy) {
    profiler.recordFlowPath(profiler.now() - t0, true, false);
    return [];
  }

  const goal = resolveGoal(state, sx, sy, gx, gy);
  if (!goal) {
    profiler.recordFlowPath(profiler.now() - t0, false, false);
    return null;
  }

  cache?.beginTick(state.tick);
  let field = cache?.get(goal.x, goal.y) ?? null;
  const cacheHit = !!field;
  if (!field) {
    field = buildField(state, goal);
    cache?.set(field);
  }

  const path: Vec2[] = [];
  let cx = sx;
  let cy = sy;
  const maxSteps = MAP_W * MAP_H;

  for (let i = 0; i < maxSteps; i++) {
    if (cx === goal.x && cy === goal.y) {
      profiler.recordFlowPath(profiler.now() - t0, true, cacheHit);
      return path;
    }

    const cDist = field.dist[key(cx, cy)] ?? INF;
    let best: Vec2 | null = null;
    let bestDist = INF;

    for (const d of DIRS) {
      const nx = cx + d.x;
      const ny = cy + d.y;
      if (!inBounds(nx, ny)) continue;
      if (!(nx === goal.x && ny === goal.y) && !passable(state, nx, ny)) continue;
      if (!allowsDiagonalStep(state, cx, cy, d.x, d.y)) continue;

      const nDist = field.dist[key(nx, ny)] ?? INF;
      if (nDist >= bestDist) continue;
      if (cDist !== INF && nDist >= cDist) continue;
      bestDist = nDist;
      best = { x: nx, y: ny };
    }

    if (!best || bestDist === INF) {
      profiler.recordFlowPath(profiler.now() - t0, false, cacheHit);
      return null;
    }

    path.push(best);
    cx = best.x;
    cy = best.y;
  }

  profiler.recordFlowPath(profiler.now() - t0, false, cacheHit);
  return null;
}
