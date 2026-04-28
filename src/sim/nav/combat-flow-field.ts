import type { GameState, Vec2 } from '../../types';
import { MAP_H, MAP_W, isUnitKind } from '../../types';
import { isTileBlockedByEntity } from '../entities';

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

function isPassable(state: GameState, tx: number, ty: number): boolean {
  if (!inBounds(tx, ty)) return false;
  if (!state.tiles[ty][tx].passable) return false;
  if (isTileBlockedByEntity(state, tx, ty)) return false;
  return true;
}

function allowsDiagonalStep(state: GameState, fromX: number, fromY: number, dx: number, dy: number): boolean {
  if (dx === 0 || dy === 0) return true;
  const sideA = isPassable(state, fromX + dx, fromY);
  const sideB = isPassable(state, fromX, fromY + dy);
  return sideA || sideB;
}

function resolveGoal(state: GameState, sx: number, sy: number, gx: number, gy: number): Vec2 | null {
  if (isPassable(state, gx, gy)) return { x: gx, y: gy };

  let best: Vec2 | null = null;
  let bestDist = Infinity;
  for (const d of DIRS) {
    const nx = gx + d.x;
    const ny = gy + d.y;
    if (!isPassable(state, nx, ny)) continue;
    const dist = Math.max(Math.abs(sx - nx), Math.abs(sy - ny));
    if (dist < bestDist) {
      best = { x: nx, y: ny };
      bestDist = dist;
    }
  }
  return best;
}

function alliedOccupancyPenalty(state: GameState, moverId: number, moverOwner: number, tx: number, ty: number): number {
  let penalty = 0;
  for (const entity of state.entities) {
    if (entity.id === moverId) continue;
    if (entity.owner !== moverOwner) continue;
    if (!isUnitKind(entity.kind)) continue;
    if (entity.pos.x !== tx || entity.pos.y !== ty) continue;
    penalty += entity.cmd ? 10 : 18;
  }
  return penalty;
}

export function findCombatFlowFieldPath(
  state: GameState,
  moverId: number,
  moverOwner: number,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
): Vec2[] | null {
  if (sx === gx && sy === gy) return [];

  const goal = resolveGoal(state, sx, sy, gx, gy);
  if (!goal) return null;

  const dist = new Int32Array(MAP_W * MAP_H);
  dist.fill(INF);
  const visited = new Uint8Array(MAP_W * MAP_H);
  const parent = new Int32Array(MAP_W * MAP_H);
  parent.fill(-1);

  const open: { x: number; y: number; cost: number }[] = [{ x: sx, y: sy, cost: 0 }];
  dist[key(sx, sy)] = 0;

  while (open.length > 0) {
    let bestIndex = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i]!.cost < open[bestIndex]!.cost) bestIndex = i;
    }
    const current = open.splice(bestIndex, 1)[0]!;
    const currentKey = key(current.x, current.y);
    if (visited[currentKey]) continue;
    visited[currentKey] = 1;

    if (current.x === goal.x && current.y === goal.y) {
      const path: Vec2[] = [];
      let cursorKey = currentKey;
      while (cursorKey !== key(sx, sy)) {
        const x = cursorKey % MAP_W;
        const y = Math.floor(cursorKey / MAP_W);
        path.push({ x, y });
        cursorKey = parent[cursorKey]!;
        if (cursorKey < 0) return null;
      }
      path.reverse();
      return path;
    }

    for (const d of DIRS) {
      const nx = current.x + d.x;
      const ny = current.y + d.y;
      if (!inBounds(nx, ny)) continue;
      if (!(nx === goal.x && ny === goal.y) && !isPassable(state, nx, ny)) continue;
      if (!allowsDiagonalStep(state, current.x, current.y, d.x, d.y)) continue;

      const neighborKey = key(nx, ny);
      if (visited[neighborKey]) continue;

      const stepCost = (d.x !== 0 && d.y !== 0 ? 14 : 10) + alliedOccupancyPenalty(state, moverId, moverOwner, nx, ny);
      const nextCost = dist[currentKey]! + stepCost;
      if (nextCost >= dist[neighborKey]!) continue;

      dist[neighborKey] = nextCost;
      parent[neighborKey] = currentKey;
      const heuristic = Math.max(Math.abs(goal.x - nx), Math.abs(goal.y - ny)) * 10;
      open.push({ x: nx, y: ny, cost: nextCost + heuristic });
    }
  }

  return null;
}
