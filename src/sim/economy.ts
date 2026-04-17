import type { Entity, EntityKind, GameState, Vec2 } from '../types';
import { GATHER_TICKS, GATHER_AMOUNT, MAP_W, MAP_H, isUnitKind, isWorkerKind } from '../types';
import { STATS, ticksPerStep } from '../data/units';
import { getEntity, spawnEntity, isTileBlockedByEntity } from './entities';
import { findPath } from './pathfinding';

// ─── Population ───────────────────────────────────────────────────────────────

/** Recompute pop / popCap for both owners — call once per sim tick. */
export function computePopCaps(state: GameState): void {
  for (let o = 0; o <= 1; o++) {
    const owner = o as 0 | 1;
    let cap = 0; let count = 0;
    for (const e of state.entities) {
      if (e.owner !== owner) continue;
      if (e.kind === 'townhall') cap += 4;
      if (e.kind === 'farm')     cap += 4;
      if (isUnitKind(e.kind))    count++;   // walls & buildings don't count as pop
    }
    state.popCap[owner] = cap;
    state.pop[owner]    = count;
  }
}

// ─── Gather ───────────────────────────────────────────────────────────────────

export function issueGatherCommand(entity: Entity, mineId: number, currentTick: number): void {
  entity.cmd = { type: 'gather', mineId, phase: 'tomine', waitTicks: currentTick };
  entity.carryGold = 0;
  (entity as EntityWithCache)._gatherPath = undefined;
}

function nearestTownHall(state: GameState, owner: 0 | 1, px: number, py: number): Entity | null {
  let best: Entity | null = null; let bestD = Infinity;
  for (const e of state.entities) {
    if (e.kind !== 'townhall' || e.owner !== owner) continue;
    const d = Math.hypot(e.pos.x - px, e.pos.y - py);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

type EntityWithCache = Entity & {
  _gatherPath?: Vec2[];
  _buildPath?:  Vec2[];
};

export function processGather(state: GameState, entity: Entity): void {
  if (!entity.cmd || entity.cmd.type !== 'gather') return;
  const cmd = entity.cmd;
  const ec  = entity as EntityWithCache;

  const mine = getEntity(state, cmd.mineId);
  if (!mine || (mine.goldReserve ?? 0) <= 0) { entity.cmd = null; return; }

  const tps = ticksPerStep(entity.kind);

  switch (cmd.phase) {
    case 'tomine': {
      if (!ec._gatherPath || ec._gatherPath.length === 0) {
        // target tile just above the mine
        ec._gatherPath = findPath(state, entity.pos.x, entity.pos.y,
          mine.pos.x, mine.pos.y - 1) ?? [];
      }
      if (ec._gatherPath.length === 0) {
        cmd.phase = 'gathering'; cmd.waitTicks = state.tick; return;
      }
      if (state.tick - cmd.waitTicks < tps) return;
      const next = ec._gatherPath.shift()!;
      entity.pos.x = next.x; entity.pos.y = next.y;
      cmd.waitTicks = state.tick;
      if (ec._gatherPath.length === 0) {
        cmd.phase = 'gathering'; cmd.waitTicks = state.tick; ec._gatherPath = undefined;
      }
      break;
    }
    case 'gathering': {
      if (state.tick - cmd.waitTicks < GATHER_TICKS) return;
      const take = Math.min(GATHER_AMOUNT, mine.goldReserve ?? 0);
      mine.goldReserve = (mine.goldReserve ?? 0) - take;
      entity.carryGold = take;
      cmd.phase = 'returning'; ec._gatherPath = undefined;
      break;
    }
    case 'returning': {
      const th = nearestTownHall(state, entity.owner as 0 | 1, entity.pos.x, entity.pos.y);
      if (!th) { entity.cmd = null; return; }
      if (!ec._gatherPath || ec._gatherPath.length === 0) {
        const dropX = th.pos.x + Math.floor(th.tileW / 2);
        const dropY = th.pos.y + th.tileH;
        ec._gatherPath = findPath(state, entity.pos.x, entity.pos.y, dropX, dropY) ?? [];
      }
      if (ec._gatherPath.length === 0) {
        state.gold[entity.owner as 0 | 1] += entity.carryGold ?? 0;
        entity.carryGold = 0;
        cmd.phase = 'tomine'; ec._gatherPath = undefined;
        return;
      }
      if (state.tick - cmd.waitTicks < tps) return;
      const next = ec._gatherPath.shift()!;
      entity.pos.x = next.x; entity.pos.y = next.y;
      cmd.waitTicks = state.tick;
      break;
    }
  }
}

// ─── Train ────────────────────────────────────────────────────────────────────

export function issueTrainCommand(
  state: GameState,
  building: Entity,
  unit: EntityKind,
): boolean {
  if (!isUnitKind(unit)) return false; // only unit kinds can be trained
  const cost = STATS[unit]?.cost ?? 0;
  if (state.gold[building.owner as 0 | 1] < cost) return false;
  if (state.pop[building.owner as 0 | 1] >= state.popCap[building.owner as 0 | 1]) return false;

  if (building.cmd?.type === 'train') {
    if (building.cmd.queue.length >= 5) return false;
    building.cmd.queue.push(unit);
    state.gold[building.owner as 0 | 1] -= cost;
    return true;
  }

  state.gold[building.owner as 0 | 1] -= cost;
  building.cmd = { type: 'train', unit, ticksLeft: STATS[unit]!.buildTicks, queue: [] };
  return true;
}

/** Find the nearest walkable, unblocked tile to (sx, sy) for unit spawning. */
function findSpawnTile(state: GameState, sx: number, sy: number): Vec2 {
  const DIRS = [
    { x: 0, y: 0 },
    { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
    { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 },
    { x: 2, y: 0 }, { x: -2, y: 0 }, { x: 0, y: 2 }, { x: 0, y: -2 },
    { x: 2, y: 1 }, { x: -2, y: 1 }, { x: 2, y: -1 }, { x: -2, y: -1 },
  ];
  for (const d of DIRS) {
    const nx = sx + d.x; const ny = sy + d.y;
    if (nx < 1 || ny < 1 || nx >= MAP_W - 1 || ny >= MAP_H - 1) continue;
    if (!state.tiles[ny][nx].passable) continue;
    if (isTileBlockedByEntity(state, nx, ny)) continue;
    return { x: nx, y: ny };
  }
  return { x: sx, y: sy }; // last resort
}

export function processTrain(state: GameState, building: Entity): void {
  if (!building.cmd || building.cmd.type !== 'train') return;
  const cmd = building.cmd;
  cmd.ticksLeft--;
  if (cmd.ticksLeft > 0) return;

  // Spawn adjacent to building (below centre), avoiding blocked tiles
  const sx = building.pos.x + Math.floor(building.tileW / 2);
  const sy = building.pos.y + building.tileH;
  const spawnPos = findSpawnTile(state, sx, sy);
  const newUnit  = spawnEntity(state, cmd.unit, building.owner as 0 | 1, spawnPos);

  // Walk to rally point immediately if one is set
  if (building.rallyPoint) {
    const rp   = building.rallyPoint;
    const path = findPath(state, spawnPos.x, spawnPos.y, rp.x, rp.y);
    if (path && path.length > 0) {
      newUnit.cmd = { type: 'move', path, stepTick: state.tick, attackMove: false };
    }
  }

  if (cmd.queue.length > 0) {
    const next = cmd.queue.shift()!;
    cmd.unit      = next;
    cmd.ticksLeft = STATS[next]!.buildTicks;
  } else {
    building.cmd = null;
  }
}

// ─── Build ────────────────────────────────────────────────────────────────────

export function isValidPlacement(
  state: GameState,
  building: EntityKind,
  tx: number,
  ty: number,
): boolean {
  const stats = STATS[building];
  if (!stats) return false;
  for (let dy = 0; dy < stats.tileH; dy++) {
    for (let dx = 0; dx < stats.tileW; dx++) {
      const x = tx + dx; const y = ty + dy;
      if (x < 1 || y < 1 || x >= MAP_W - 1 || y >= MAP_H - 1) return false;
      if (!state.tiles[y][x].passable) return false;
      if (state.entities.some(e =>
        x >= e.pos.x && x < e.pos.x + e.tileW &&
        y >= e.pos.y && y < e.pos.y + e.tileH,
      )) return false;
    }
  }
  return true;
}

export function issueBuildCommand(
  state: GameState,
  worker: Entity,
  building: EntityKind,
  pos: Vec2,
  currentTick: number,
): boolean {
  const stats = STATS[building];
  if (!stats) return false;
  const cost = stats.cost;
  if (state.gold[worker.owner as 0 | 1] < cost) return false;
  if (!isValidPlacement(state, building, pos.x, pos.y)) return false;

  state.gold[worker.owner as 0 | 1] -= cost;
  worker.cmd = {
    type: 'build', building, pos: { ...pos },
    ticksLeft: stats.buildTicks,
    phase: 'moving', stepTick: currentTick,
  };
  (worker as EntityWithCache)._buildPath = undefined;
  return true;
}

export function processBuild(state: GameState, entity: Entity): void {
  if (!entity.cmd || entity.cmd.type !== 'build') return;
  const cmd = entity.cmd;
  const ec  = entity as EntityWithCache;
  const tps = ticksPerStep(entity.kind);

  if (cmd.phase === 'moving') {
    if (!ec._buildPath || ec._buildPath.length === 0) {
      ec._buildPath = findPath(state, entity.pos.x, entity.pos.y,
        cmd.pos.x, cmd.pos.y) ?? [];
    }
    if (ec._buildPath.length === 0) {
      cmd.phase = 'building'; return;
    }
    if (state.tick - cmd.stepTick < tps) return;
    const next = ec._buildPath.shift()!;
    entity.pos.x = next.x; entity.pos.y = next.y;
    cmd.stepTick = state.tick;
    if (ec._buildPath.length === 0) {
      cmd.phase = 'building'; ec._buildPath = undefined;
    }

  } else {
    // building phase — one tick per progress step
    cmd.ticksLeft--;
    if (cmd.ticksLeft <= 0) {
      spawnEntity(state, cmd.building, entity.owner as 0 | 1, cmd.pos);
      entity.cmd = null;
      ec._buildPath = undefined;
    }
  }
}
