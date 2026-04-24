import type { Entity, EntityKind, GameState, Tile, Vec2 } from '../types';
import { GATHER_TICKS, GATHER_AMOUNT, MAP_W, MAP_H, SIM_HZ, isOwnedByOpposingPlayer, isUnitKind, isWorkerKind } from '../types';
import { ticksPerStep } from '../data/units';
import { getResolvedBuildTicks, getResolvedCost, getResolvedSupplyProvided, getResolvedTileSize } from '../balance/resolver';
import {
  applyTempoTrainTicks,
  getEcoFirstReturnBonusGold,
  getEcoGatherBonus,
  getEcoGatherBonusCap,
  getPressureForwardCommitTicks,
  getPressureSpeedBoostMult,
  getPressureSpeedBoostTicks,
  isOpeningWindowActive,
  shouldApplyEcoFirstReturnBonus,
  shouldApplyTempoFirstMilitaryTrainBonus,
  shouldPressureAttackMoveCommit,
} from '../balance/openings';
import { applyDoctrineTrainTicks } from '../balance/doctrines';
import { getEntity, spawnEntity, killEntity, isTileBlockedByEntity, setEntityFootprint } from './entities';
import { findPath } from './pathfinding';
import { markWorkerCycleComplete, markWorkerCycleStart, recordWorkerBlockedTick } from './movement-kpi';

// ─── Population ───────────────────────────────────────────────────────────────

/** Recompute pop / popCap for both owners — call once per sim tick. */
export function computePopCaps(state: GameState): void {
  for (let o = 0; o <= 1; o++) {
    const owner = o as 0 | 1;
    let cap = 0; let count = 0;
    for (const e of state.entities) {
      if (e.owner !== owner) continue;
      cap += getResolvedSupplyProvided(e.kind, state.races[owner]);
      if (isUnitKind(e.kind))    count++;   // walls & buildings don't count as pop
    }
    state.popCap[owner] = cap;
    state.pop[owner]    = count;
  }
}

// ─── Gather ───────────────────────────────────────────────────────────────────

function resolveGatherTarget(state: GameState, targetId: number): { resourceType: 'gold'; entity: Entity } | { resourceType: 'wood'; tile: Tile } | null {
  const entity = getEntity(state, targetId);
  if (entity && entity.kind === 'goldmine' && (entity.goldReserve ?? 0) > 0) {
    return { resourceType: 'gold', entity };
  }

  const tx = targetId % MAP_W;
  const ty = Math.floor(targetId / MAP_W);
  const tile = state.tiles[ty]?.[tx];
  if (tile?.kind === 'tree' && (tile.woodReserve ?? 0) > 0) {
    return { resourceType: 'wood', tile };
  }

  return null;
}

export function issueGatherCommand(state: GameState, entity: Entity, targetId: number, currentTick: number): void {
  const target = resolveGatherTarget(state, targetId);
  if (!target) return;
  entity.cmd = { type: 'gather', targetId, resourceType: target.resourceType, phase: 'toresource', waitTicks: currentTick };
  markWorkerCycleStart(entity.id, currentTick);
  entity.carryGold = 0;
  entity.carryWood = 0;
  (entity as EntityWithCache)._gatherPath = undefined;
  (entity as EntityWithCache)._gatherTarget = undefined;
  (entity as EntityWithCache)._gatherReturnTarget = undefined;
}

function nearestDropoff(state: GameState, owner: 0 | 1, px: number, py: number, resourceType: 'gold' | 'wood'): Entity | null {
  let best: Entity | null = null; let bestD = Infinity;
  for (const e of state.entities) {
    const valid = e.owner === owner && (e.kind === 'townhall' || (resourceType === 'wood' && e.kind === 'lumbermill'));
    if (!valid) continue;
    const d = Math.hypot(e.pos.x - px, e.pos.y - py);
    if (d < bestD || (d === bestD && best && e.id < best.id)) { bestD = d; best = e; }
  }
  return best;
}

type EntityWithCache = Entity & {
  _gatherPath?: Vec2[];
  _gatherTarget?: Vec2;
  _gatherReturnTarget?: Vec2;
  _gatherReturnNoProgressStreak?: number;
  _gatherReturnLastPos?: Vec2;
  _buildPath?:  Vec2[];
  _buildApproachTarget?: Vec2;
};

function replacePath(path: Vec2[], nextPath: Vec2[]): void {
  path.splice(0, path.length, ...nextPath);
}

function tryAdvanceWorkerTravel(
  state: GameState,
  worker: Entity,
  path: Vec2[],
  goal: Vec2,
  tryRepath?: () => Vec2[] | null,
): 'no-path' | 'moved' | 'repathed' | 'sidestep' | 'blocked' {
  if (path.length === 0) return 'no-path';

  const next = path[0]!;
  if (!state.tiles[next.y]?.[next.x]?.passable || isTileBlockedByEntity(state, next.x, next.y)) {
    const repath = tryRepath?.();
    if (repath && repath.length > 0) {
      replacePath(path, repath);
      return 'repathed';
    }
    return 'blocked';
  }

  worker.pos.x = next.x;
  worker.pos.y = next.y;
  path.shift();
  return 'moved';
}

function logBuildDebug(message: string): void {
  console.info(`[build-debug] ${message}`);
}

function getMineApproachTiles(state: GameState, mine: Entity): Vec2[] {
  const tiles: Vec2[] = [];
  for (let y = mine.pos.y - 1; y <= mine.pos.y + mine.tileH; y++) {
    for (let x = mine.pos.x - 1; x <= mine.pos.x + mine.tileW; x++) {
      const insideMine = x >= mine.pos.x && x < mine.pos.x + mine.tileW && y >= mine.pos.y && y < mine.pos.y + mine.tileH;
      if (insideMine) continue;
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
      if (!state.tiles[y]?.[x]?.passable) continue;
      tiles.push({ x, y });
    }
  }

  tiles.sort((a, b) => {
    const aBand = a.y < mine.pos.y ? 0 : a.y >= mine.pos.y + mine.tileH ? 2 : 1;
    const bBand = b.y < mine.pos.y ? 0 : b.y >= mine.pos.y + mine.tileH ? 2 : 1;
    if (aBand !== bBand) return aBand - bBand;
    const aSide = a.x < mine.pos.x ? 0 : a.x >= mine.pos.x + mine.tileW ? 2 : 1;
    const bSide = b.x < mine.pos.x ? 0 : b.x >= mine.pos.x + mine.tileW ? 2 : 1;
    if (aSide !== bSide) return aSide - bSide;
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  return tiles;
}

function getWorkerReservedApproachCount(state: GameState, entity: Entity, target: Vec2): number {
  let count = 0;
  for (const other of state.entities) {
    if (other.id === entity.id || other.owner !== entity.owner || !isWorkerKind(other.kind)) continue;
    const cache = other as EntityWithCache;
    if (cache._gatherTarget?.x === target.x && cache._gatherTarget?.y === target.y) count++;
    if (cache._gatherReturnTarget?.x === target.x && cache._gatherReturnTarget?.y === target.y) count++;
    if (cache._buildApproachTarget?.x === target.x && cache._buildApproachTarget?.y === target.y) count++;
  }
  return count;
}

function bestMineApproach(state: GameState, entity: Entity, mine: Entity): { target: Vec2; path: Vec2[] } | null {
  let best: { target: Vec2; path: Vec2[] } | null = null;
  let bestScore = Infinity;

  for (const target of getMineApproachTiles(state, mine)) {
    const path = findPath(state, entity.pos.x, entity.pos.y, target.x, target.y);
    if (path === null) continue;
    const reservedPenalty = getWorkerReservedApproachCount(state, entity, target) * 200;
    const score = path.length * 1000 + reservedPenalty + Math.abs(entity.pos.x - target.x) + Math.abs(entity.pos.y - target.y);
    if (!best || score < bestScore) {
      best = { target, path };
      bestScore = score;
      if (path.length === 0 && reservedPenalty === 0) return best;
    }
  }

  return best;
}

function bestContestedMine(state: GameState, owner: 0 | 1): Entity | null {
  let best: Entity | null = null;
  let bestScore = -Infinity;
  const myTownHall = state.entities.find(e => e.owner === owner && e.kind === 'townhall');
  const enemyTownHall = state.entities.find(e => isOwnedByOpposingPlayer(e, owner) && e.kind === 'townhall');
  if (!myTownHall || !enemyTownHall) return null;

  for (const e of state.entities) {
    if (e.kind !== 'goldmine' || (e.goldReserve ?? 0) <= 0) continue;
    const myDist = Math.hypot(e.pos.x - myTownHall.pos.x, e.pos.y - myTownHall.pos.y);
    const enemyDist = Math.hypot(e.pos.x - enemyTownHall.pos.x, e.pos.y - enemyTownHall.pos.y);
    const centerBias = e.pos.x > 16 && e.pos.x < 48 ? 6 : 0;
    const score = (e.goldReserve ?? 0) / 100 + centerBias - Math.abs(myDist - enemyDist) * 0.2;
    if (score > bestScore || (score === bestScore && best && e.id < best.id)) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

function getTreeApproachTiles(state: GameState, tx: number, ty: number): Vec2[] {
  const tiles: Vec2[] = [];
  for (let y = ty - 1; y <= ty + 1; y++) {
    for (let x = tx - 1; x <= tx + 1; x++) {
      if (x === tx && y === ty) continue;
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
      if (!state.tiles[y]?.[x]?.passable) continue;
      tiles.push({ x, y });
    }
  }
  tiles.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  return tiles;
}

function findNearestTreeTarget(state: GameState, entity: Entity, fromTx: number, fromTy: number): number | null {
  let bestId: number | null = null;
  let bestScore = Infinity;

  const radii = [8, 14, 22];
  for (const radius of radii) {
    for (let ty = Math.max(0, fromTy - radius); ty <= Math.min(MAP_H - 1, fromTy + radius); ty++) {
      for (let tx = Math.max(0, fromTx - radius); tx <= Math.min(MAP_W - 1, fromTx + radius); tx++) {
        const tile = state.tiles[ty]?.[tx];
        if (tile?.kind !== 'tree' || (tile.woodReserve ?? 0) <= 0) continue;
        const approach = bestTreeApproach(state, entity, tx, ty);
        if (!approach) continue;
        const directBias = Math.abs(tx - fromTx) + Math.abs(ty - fromTy);
        const score = approach.path.length * 1000 + directBias;
        if (score < bestScore) {
          bestScore = score;
          bestId = ty * MAP_W + tx;
        }
      }
    }
    if (bestId !== null) return bestId;
  }

  return null;
}

function bestTreeApproach(state: GameState, entity: Entity, tx: number, ty: number): { target: Vec2; path: Vec2[] } | null {
  let best: { target: Vec2; path: Vec2[] } | null = null;
  let bestScore = Infinity;

  for (const target of getTreeApproachTiles(state, tx, ty)) {
    const path = findPath(state, entity.pos.x, entity.pos.y, target.x, target.y);
    if (path === null) continue;
    const reservedPenalty = getWorkerReservedApproachCount(state, entity, target) * 200;
    const score = path.length * 1000 + reservedPenalty + Math.abs(entity.pos.x - target.x) + Math.abs(entity.pos.y - target.y);
    if (!best || score < bestScore) {
      best = { target, path };
      bestScore = score;
      if (path.length === 0 && reservedPenalty === 0) return best;
    }
  }

  return best;
}

export function processGather(state: GameState, entity: Entity): void {
  if (!entity.cmd || entity.cmd.type !== 'gather') return;
  const cmd = entity.cmd;
  markWorkerCycleStart(entity.id, state.tick);
  const ec  = entity as EntityWithCache;

  const clearGatherState = () => {
    ec._gatherPath = undefined;
    ec._gatherTarget = undefined;
    ec._gatherReturnTarget = undefined;
    ec._gatherReturnNoProgressStreak = undefined;
    ec._gatherReturnLastPos = undefined;
  };

  const lastTargetId = cmd.targetId;
  let target = resolveGatherTarget(state, cmd.targetId);
  let resourceDepleted = !target;
  if (resourceDepleted && cmd.resourceType === 'wood') {
    const searchTx = entity.pos.x;
    const searchTy = entity.pos.y;
    const nextTreeId = findNearestTreeTarget(state, entity, searchTx, searchTy);
    if (nextTreeId !== null) {
      cmd.targetId = nextTreeId;
      target = resolveGatherTarget(state, cmd.targetId);
      resourceDepleted = !target;
      if (target) {
        cmd.phase = 'toresource';
        cmd.waitTicks = state.tick;
        clearGatherState();
      }
    }
  }
  if (resourceDepleted) {
    if (cmd.phase === 'returning' || (entity.carryGold ?? 0) > 0 || (entity.carryWood ?? 0) > 0) {
      cmd.phase = 'returning';
      clearGatherState();
    } else {
      clearGatherState();
      entity.cmd = null;
      return;
    }
  }

  const tps = ticksPerStep(entity.kind);

  switch (cmd.phase) {
    case 'toresource': {
      if (!target) {
        clearGatherState();
        entity.cmd = null;
        return;
      }
      if (ec._gatherPath === undefined) {
        const approach = target.resourceType === 'gold'
          ? bestMineApproach(state, entity, target.entity)
          : bestTreeApproach(state, entity, cmd.targetId % MAP_W, Math.floor(cmd.targetId / MAP_W));
        if (approach === null) {
          clearGatherState();
          entity.cmd = null;
          return;
        }
        ec._gatherPath = approach.path;
        ec._gatherTarget = approach.target;
      }
      if (ec._gatherPath.length === 0) {
        cmd.phase = 'gathering'; cmd.waitTicks = state.tick; ec._gatherTarget = undefined; return;
      }
      if (state.tick - cmd.waitTicks < tps) return;
      const stepResult = tryAdvanceWorkerTravel(
        state,
        entity,
        ec._gatherPath,
        ec._gatherTarget!,
        () => {
          if (!ec._gatherTarget) return null;
          return findPath(state, entity.pos.x, entity.pos.y, ec._gatherTarget.x, ec._gatherTarget.y);
        },
      );
      cmd.waitTicks = state.tick;
      if (stepResult === 'blocked') {
        recordWorkerBlockedTick();
        return;
      }
      if (stepResult === 'repathed') return;
      if (ec._gatherPath.length === 0) {
        cmd.phase = 'gathering'; cmd.waitTicks = state.tick; ec._gatherPath = undefined; ec._gatherTarget = undefined;
      }
      break;
    }
    case 'gathering': {
      if (state.tick - cmd.waitTicks < GATHER_TICKS) return;
      if (!target) {
        clearGatherState();
        entity.cmd = null;
        return;
      }
      const owner = entity.owner as 0 | 1;
      const openingPlan = state.openingPlanSelected[owner];
      const ecoGatherBonus = cmd.resourceType === 'gold'
        ? getEcoGatherBonus(openingPlan, state.openingCommitmentClaimed[owner], state.tick, entity)
        : 0;
      if (cmd.resourceType === 'gold' && target.resourceType === 'gold') {
        const mine = target.entity;
        const take = Math.min(GATHER_AMOUNT + ecoGatherBonus, mine.goldReserve ?? 0);
        mine.goldReserve = (mine.goldReserve ?? 0) - take;
        entity.carryGold = take;
      } else if (cmd.resourceType === 'wood' && target.resourceType === 'wood') {
        const treeTile = target.tile;
        const take = Math.min(GATHER_AMOUNT, treeTile.woodReserve ?? 0);
        treeTile.woodReserve = (treeTile.woodReserve ?? 0) - take;
        entity.carryWood = take;
        if ((treeTile.woodReserve ?? 0) <= 0) {
          treeTile.woodReserve = 0;
          treeTile.kind = 'grass';
          treeTile.passable = true;
          delete treeTile.watchPost;
        }
      } else {
        clearGatherState();
        entity.cmd = null;
        return;
      }

      cmd.phase = 'returning'; ec._gatherPath = undefined;
      break;
    }
    case 'returning': {
      const dropoff = nearestDropoff(state, entity.owner as 0 | 1, entity.pos.x, entity.pos.y, cmd.resourceType);
      if (!dropoff) {
        clearGatherState();
        entity.cmd = null;
        return;
      }
      if (ec._gatherPath === undefined) {
        const dropTargets: Vec2[] = [];
        for (let y = dropoff.pos.y - 1; y <= dropoff.pos.y + dropoff.tileH; y++) {
          for (let x = dropoff.pos.x - 1; x <= dropoff.pos.x + dropoff.tileW; x++) {
            const inside = x >= dropoff.pos.x && x < dropoff.pos.x + dropoff.tileW && y >= dropoff.pos.y && y < dropoff.pos.y + dropoff.tileH;
            if (inside) continue;
            if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
            if (!state.tiles[y]?.[x]?.passable) continue;
            dropTargets.push({ x, y });
          }
        }
        dropTargets.sort((a, b) => {
          const da = Math.abs(a.x - entity.pos.x) + Math.abs(a.y - entity.pos.y);
          const db = Math.abs(b.x - entity.pos.x) + Math.abs(b.y - entity.pos.y);
          if (da !== db) return da - db;
          if (a.y !== b.y) return a.y - b.y;
          return a.x - b.x;
        });

        let bestReturn: { target: Vec2; path: Vec2[] } | null = null;
        let bestScore = Infinity;
        for (const target of dropTargets) {
          const raw = findPath(state, entity.pos.x, entity.pos.y, target.x, target.y);
          if (raw === null) continue;
          const reservedPenalty = getWorkerReservedApproachCount(state, entity, target) * 200;
          const score = raw.length * 1000 + reservedPenalty + Math.abs(entity.pos.x - target.x) + Math.abs(entity.pos.y - target.y);
          if (!bestReturn || score < bestScore) {
            bestReturn = { target, path: raw };
            bestScore = score;
            if (raw.length === 0 && reservedPenalty === 0) break;
          }
        }
        if (!bestReturn) {
          ec._gatherReturnTarget = undefined;
          ec._gatherPath = undefined;
          ec._gatherReturnNoProgressStreak = (ec._gatherReturnNoProgressStreak ?? 0) + 1;
          recordWorkerBlockedTick();
          return;
        }

        ec._gatherReturnTarget = bestReturn.target;
        ec._gatherPath = bestReturn.path;
        ec._gatherReturnLastPos = { x: entity.pos.x, y: entity.pos.y };
        ec._gatherReturnNoProgressStreak = 0;
      }
      if (ec._gatherPath.length === 0) {
        const owner = entity.owner as 0 | 1;
        state.gold[owner] += entity.carryGold ?? 0;
        state.wood[owner] += entity.carryWood ?? 0;
        if ((entity.carryGold ?? 0) > 0 && shouldApplyEcoFirstReturnBonus(state.openingPlanSelected[owner], state.openingCommitmentClaimed[owner], state.tick, entity)) {
          entity.openingPlan = 'eco';
          entity.carryGold = Math.min(getEcoGatherBonusCap(), (entity.carryGold ?? 0) + getEcoGatherBonus('eco', false, state.tick, entity));
          state.gold[owner] += getEcoFirstReturnBonusGold();
          state.openingCommitmentClaimed[owner] = true;
        }
        entity.carryGold = 0;
        entity.carryWood = 0;
        markWorkerCycleComplete(entity.id, state.tick);
        ec._gatherPath = undefined;
        if (resourceDepleted) {
          if (cmd.resourceType === 'wood') {
            const nextTreeId = findNearestTreeTarget(state, entity, entity.pos.x, entity.pos.y);
            if (nextTreeId !== null) {
              cmd.targetId = nextTreeId;
              cmd.phase = 'toresource';
              cmd.waitTicks = state.tick;
              clearGatherState();
              return;
            }
          }
          entity.cmd = null;
          return;
        }
        if (cmd.resourceType === 'wood' && cmd.targetId === lastTargetId) {
          const originalTx = lastTargetId % MAP_W;
          const originalTy = Math.floor(lastTargetId / MAP_W);
          const originalTile = state.tiles[originalTy]?.[originalTx];
          if (originalTile?.kind !== 'tree' || (originalTile.woodReserve ?? 0) <= 0) {
            const nextTreeId = findNearestTreeTarget(state, entity, entity.pos.x, entity.pos.y);
            if (nextTreeId !== null) cmd.targetId = nextTreeId;
          }
        }
        cmd.phase = 'toresource';
        return;
      }
      if (state.tick - cmd.waitTicks < tps) return;
      const stepResult = tryAdvanceWorkerTravel(
        state,
        entity,
        ec._gatherPath,
        ec._gatherReturnTarget ?? { x: dropoff.pos.x + Math.floor(dropoff.tileW / 2), y: dropoff.pos.y + dropoff.tileH },
        () => {
          const targetPos = ec._gatherReturnTarget;
          if (!targetPos) return null;
          return findPath(state, entity.pos.x, entity.pos.y, targetPos.x, targetPos.y);
        },
      );
      cmd.waitTicks = state.tick;
      if (stepResult === 'blocked') {
        recordWorkerBlockedTick();
        ec._gatherReturnNoProgressStreak = (ec._gatherReturnNoProgressStreak ?? 0) + 1;
        if ((ec._gatherReturnNoProgressStreak ?? 0) >= 2) {
          ec._gatherPath = undefined;
          ec._gatherReturnTarget = undefined;
        }
        return;
      }
      if (stepResult === 'repathed') {
        const lastPos = ec._gatherReturnLastPos;
        const noProgress = !lastPos || (lastPos.x === entity.pos.x && lastPos.y === entity.pos.y);
        ec._gatherReturnNoProgressStreak = noProgress ? (ec._gatherReturnNoProgressStreak ?? 0) + 1 : 0;
        ec._gatherReturnLastPos = { x: entity.pos.x, y: entity.pos.y };
        if ((ec._gatherReturnNoProgressStreak ?? 0) >= 4) {
          ec._gatherPath = undefined;
          ec._gatherReturnTarget = undefined;
        }
        return;
      }
      ec._gatherReturnNoProgressStreak = 0;
      ec._gatherReturnLastPos = { x: entity.pos.x, y: entity.pos.y };
      break;
    }
  }
}

// ─── Train ────────────────────────────────────────────────────────────────────

export function refundCancelledTrainCommand(state: GameState, building: Entity): void {
  if (!building.cmd || building.cmd.type !== 'train') return;

  const owner = building.owner as 0 | 1;
  const queue = [building.cmd.unit, ...building.cmd.queue];
  for (const queuedUnit of queue) {
    const cost = getResolvedCost(queuedUnit, state.races[owner]);
    state.gold[owner] += cost.gold;
    state.wood[owner] += cost.wood;
  }

  building.cmd = null;
}

export function issueTrainCommand(
  state: GameState,
  building: Entity,
  unit: EntityKind,
): boolean {
  if (!isUnitKind(unit)) return false; // only unit kinds can be trained
  const cost = getResolvedCost(unit, state.races[building.owner as 0 | 1]);
  if (state.gold[building.owner as 0 | 1] < cost.gold) return false;
  if (state.wood[building.owner as 0 | 1] < cost.wood) return false;
  if (state.pop[building.owner as 0 | 1] >= state.popCap[building.owner as 0 | 1]) return false;

  if (building.cmd?.type === 'train') {
    if (building.cmd.queue.length >= 5) return false;
    building.cmd.queue.push(unit);
    state.gold[building.owner as 0 | 1] -= cost.gold;
    state.wood[building.owner as 0 | 1] -= cost.wood;
    return true;
  }

  state.gold[building.owner as 0 | 1] -= cost.gold;
  state.wood[building.owner as 0 | 1] -= cost.wood;
  const owner = building.owner as 0 | 1;
  const openingPlan = state.openingPlanSelected[owner];
  let ticksLeft = getResolvedBuildTicks(unit, state.races[building.owner as 0 | 1]);
  ticksLeft = applyDoctrineTrainTicks(state, owner, unit, ticksLeft);
  let openingTempoCommit = false;

  if (shouldApplyTempoFirstMilitaryTrainBonus(openingPlan, state.openingCommitmentClaimed[owner], state.tick, unit)) {
    ticksLeft = applyTempoTrainTicks(ticksLeft);
    state.openingCommitmentClaimed[owner] = true;
    openingTempoCommit = true;
  }

  building.cmd = { type: 'train', unit, ticksLeft, queue: [], openingTempoCommit };
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

function isTileOccupiedByUnit(state: GameState, tx: number, ty: number): boolean {
  return state.entities.some(e => isUnitKind(e.kind) && e.pos.x === tx && e.pos.y === ty);
}

function pickRallyArrivalTile(state: GameState, preferred: Vec2, unitIdSeed: number): Vec2 {
  const candidates: Vec2[] = [];
  const pushUnique = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;
    if (candidates.some(c => c.x === x && c.y === y)) return;
    candidates.push({ x, y });
  };

  pushUnique(preferred.x, preferred.y);
  for (let r = 1; r <= 2; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        pushUnique(preferred.x + dx, preferred.y + dy);
      }
    }
  }

  if (candidates.length <= 1) return preferred;

  const start = Math.abs(unitIdSeed) % candidates.length;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[(start + i) % candidates.length]!;
    if (!state.tiles[c.y]?.[c.x]?.passable) continue;
    if (isTileBlockedByEntity(state, c.x, c.y)) continue;
    if (isTileOccupiedByUnit(state, c.x, c.y)) continue;
    return c;
  }

  return preferred;
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
  const owner = building.owner as 0 | 1;
  const openingPlan = state.openingPlanSelected[owner];

  let openingPressureAttackMove = false;
  const openingTempoContestMove = !!cmd.openingTempoCommit && !building.rallyPoint;
  const openingEcoHomeMove = openingPlan === 'eco'
    && !building.rallyPoint
    && isUnitKind(newUnit.kind)
    && !isWorkerKind(newUnit.kind)
    && !state.entities.some(e =>
      e.id !== newUnit.id
      && e.owner === owner
      && isUnitKind(e.kind)
      && !isWorkerKind(e.kind),
    );

  if (openingPlan && isOpeningWindowActive(state.tick)) {
    newUnit.openingPlan = openingPlan;

    if (!state.openingCommitmentClaimed[owner]) {
      if (openingPlan === 'eco' && isWorkerKind(newUnit.kind)) {
        newUnit.openingPlan = 'eco';
      } else if (shouldPressureAttackMoveCommit(openingPlan, state.openingCommitmentClaimed[owner], state.tick, newUnit)) {
        openingPressureAttackMove = true;
        newUnit.openingPlan = 'pressure';
        newUnit.pressureCommittedUntilTick = state.tick + getPressureForwardCommitTicks();
        state.openingCommitmentClaimed[owner] = true;
      }
    }
  }

  // Walk to rally point immediately if one is set.
  // Pressure fallback: if rally is unset, commit toward enemy Town Hall.
  const pressureFallbackTarget = openingPressureAttackMove && !building.rallyPoint
    ? state.entities.find(e => isOwnedByOpposingPlayer(e, owner) && e.kind === 'townhall')
    : null;
  const ecoFallbackTownHall = openingEcoHomeMove
    ? state.entities.find(e => e.owner === owner && e.kind === 'townhall')
    : null;
  const tempoFallbackMine = openingTempoContestMove ? bestContestedMine(state, owner) : null;
  const moveTarget = building.rallyPoint
    ? building.rallyPoint
    : tempoFallbackMine
      ? {
          x: tempoFallbackMine.pos.x,
          y: tempoFallbackMine.pos.y - 1,
        }
    : ecoFallbackTownHall
      ? {
          x: ecoFallbackTownHall.pos.x + Math.floor(ecoFallbackTownHall.tileW / 2),
          y: ecoFallbackTownHall.pos.y + ecoFallbackTownHall.tileH + 1,
        }
    : pressureFallbackTarget
      ? {
          x: pressureFallbackTarget.pos.x + Math.floor(pressureFallbackTarget.tileW / 2),
          y: pressureFallbackTarget.pos.y + Math.floor(pressureFallbackTarget.tileH / 2),
        }
      : null;

  if (moveTarget) {
    const rp = building.rallyPoint
      ? pickRallyArrivalTile(state, moveTarget, newUnit.id)
      : moveTarget;
    const path = findPath(state, spawnPos.x, spawnPos.y, rp.x, rp.y);
    if (path && path.length > 0) {
      newUnit.cmd = {
        type: 'move',
        path,
        stepTick: state.tick,
        attackMove: openingPressureAttackMove,
        speedMult: openingPressureAttackMove ? getPressureSpeedBoostMult() : undefined,
        speedMultUntilTick: openingPressureAttackMove
          ? (state.tick + getPressureSpeedBoostTicks())
          : undefined,
        goal: { ...rp },
        lastPos: { ...spawnPos },
        lastProgressTick: state.tick,
        repathCount: 0,
        blockedAllyStreak: 0,
        blockedAllyTile: null,
      };
    }
  }

  if (cmd.queue.length > 0) {
    const next = cmd.queue.shift()!;
    cmd.unit      = next;
    cmd.ticksLeft = getResolvedBuildTicks(next, state.races[owner]);
    cmd.ticksLeft = applyDoctrineTrainTicks(state, owner, next, cmd.ticksLeft);
    cmd.openingTempoCommit = false;
    if (shouldApplyTempoFirstMilitaryTrainBonus(openingPlan, state.openingCommitmentClaimed[owner], state.tick, next)) {
      cmd.ticksLeft = applyTempoTrainTicks(cmd.ticksLeft);
      state.openingCommitmentClaimed[owner] = true;
      cmd.openingTempoCommit = true;
    }
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
  const stats = getResolvedTileSize(building);
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

export function getPlacementBlockReason(
  state: GameState,
  building: EntityKind,
  tx: number,
  ty: number,
): string | null {
  const stats = getResolvedTileSize(building);
  for (let dy = 0; dy < stats.tileH; dy++) {
    for (let dx = 0; dx < stats.tileW; dx++) {
      const x = tx + dx; const y = ty + dy;
      if (x < 1 || y < 1 || x >= MAP_W - 1 || y >= MAP_H - 1) return `out-of-bounds tile=${x},${y}`;
      if (!state.tiles[y][x].passable) return `impassable tile=${x},${y} kind=${state.tiles[y][x].kind}`;
      const blocking = state.entities.find(e =>
        x >= e.pos.x && x < e.pos.x + e.tileW &&
        y >= e.pos.y && y < e.pos.y + e.tileH,
      );
      if (blocking) return `occupied tile=${x},${y} by=${blocking.kind}#${blocking.id} owner=${blocking.owner}`;
    }
  }
  return null;
}

export function issueBuildCommand(
  state: GameState,
  worker: Entity,
  building: EntityKind,
  pos: Vec2,
  currentTick: number,
): boolean {
  logBuildDebug(`attempt owner=${worker.owner} worker=${worker.id} kind=${worker.kind} building=${building} at=${pos.x},${pos.y} tick=${currentTick} gold=${state.gold[worker.owner as 0 | 1]} wood=${state.wood[worker.owner as 0 | 1]}`);
  if (building === 'tower') {
    const hasBarracks = state.entities.some(e => e.owner === worker.owner && e.kind === 'barracks');
    if (!hasBarracks) {
      logBuildDebug(`reject owner=${worker.owner} worker=${worker.id} building=${building} reason=missing-barracks`);
      return false;
    }
    const hasLumberMill = state.entities.some(e => e.owner === worker.owner && e.kind === 'lumbermill');
    if (!hasLumberMill) {
      logBuildDebug(`reject owner=${worker.owner} worker=${worker.id} building=${building} reason=missing-lumbermill`);
      return false;
    }
  }

  const stats = {
    ...getResolvedTileSize(building),
    buildTicks: getResolvedBuildTicks(building),
    cost: getResolvedCost(building, state.races[worker.owner as 0 | 1]),
  };
  const cost = stats.cost;
  if (state.gold[worker.owner as 0 | 1] < cost.gold) {
    logBuildDebug(`reject owner=${worker.owner} worker=${worker.id} building=${building} reason=insufficient-gold need=${cost.gold} have=${state.gold[worker.owner as 0 | 1]}`);
    return false;
  }
  if (state.wood[worker.owner as 0 | 1] < cost.wood) {
    logBuildDebug(`reject owner=${worker.owner} worker=${worker.id} building=${building} reason=insufficient-wood need=${cost.wood} have=${state.wood[worker.owner as 0 | 1]}`);
    return false;
  }
  const placementReason = getPlacementBlockReason(state, building, pos.x, pos.y);
  if (placementReason) {
    logBuildDebug(`reject owner=${worker.owner} worker=${worker.id} building=${building} reason=invalid-placement ${placementReason}`);
    return false;
  }

  state.gold[worker.owner as 0 | 1] -= cost.gold;
  state.wood[worker.owner as 0 | 1] -= cost.wood;

  // Spawn the construction scaffold immediately so it:
  //  - Reserves the tile footprint (blocks further placement)
  //  - Shows the shadow on the map from this moment on
  //  - Tracks progress via hp (0 → buildTicks)
  const site = spawnEntity(state, 'construction', worker.owner as 0 | 1, pos);
  site.hp    = 0;
  site.hpMax = stats.buildTicks;
  setEntityFootprint(state, site, stats.tileW, stats.tileH);
  site.constructionOf = building;
  logBuildDebug(`site-spawned owner=${worker.owner} worker=${worker.id} site=${site.id} building=${building} at=${pos.x},${pos.y} hpMax=${site.hpMax}`);

  worker.cmd = {
    type: 'build', building, pos: { ...pos },
    siteId: site.id,
    phase: 'moving', stepTick: currentTick,
  };
  (worker as EntityWithCache)._buildPath = undefined;
  (worker as EntityWithCache)._buildApproachTarget = undefined;
  logBuildDebug(`accepted owner=${worker.owner} worker=${worker.id} site=${site.id} building=${building} at=${pos.x},${pos.y}`);
  return true;
}

/** Send an existing worker to continue building an already-placed construction site. */
export function issueResumeBuildCommand(
  worker: Entity,
  site: Entity,
  currentTick: number,
): void {
  worker.cmd = {
    type: 'build',
    building: site.constructionOf!,
    pos: { ...site.pos },
    siteId: site.id,
    phase: 'moving',
    stepTick: currentTick,
  };
  (worker as EntityWithCache)._buildPath = undefined;
  (worker as EntityWithCache)._buildApproachTarget = undefined;
}

export function processBuild(state: GameState, entity: Entity): void {
  if (!entity.cmd || entity.cmd.type !== 'build') return;
  const cmd = entity.cmd;
  const ec  = entity as EntityWithCache;
  const tps = ticksPerStep(entity.kind);

  const clearBuildState = () => {
    ec._buildPath = undefined;
    ec._buildApproachTarget = undefined;
  };

  // Construction site must exist — if demolished, abandon this command
  const site = getEntity(state, cmd.siteId);
  if (!site || site.kind !== 'construction') {
    entity.cmd = null;
    clearBuildState();
    return;
  }

  if (cmd.phase === 'moving') {
    // Path to the tile just south of the building footprint (site blocks its own tiles)
    if (!ec._buildPath) {
      const bStats = getResolvedTileSize(cmd.building);
      const adjX   = cmd.pos.x + Math.floor((bStats.tileW ?? 1) / 2);
      const adjY   = cmd.pos.y + (bStats.tileH ?? 1);
      ec._buildApproachTarget = { x: adjX, y: adjY };
      ec._buildPath = findPath(state, entity.pos.x, entity.pos.y, adjX, adjY) ?? [];
    }
    if (ec._buildPath.length === 0) {
      cmd.phase = 'building';
      clearBuildState();
      return;
    }
    if (state.tick - cmd.stepTick < tps) return;
    const stepResult = tryAdvanceWorkerTravel(
      state,
      entity,
      ec._buildPath,
      ec._buildApproachTarget ?? cmd.pos,
      () => {
        const targetPos = ec._buildApproachTarget;
        if (!targetPos) return null;
        return findPath(state, entity.pos.x, entity.pos.y, targetPos.x, targetPos.y);
      },
    );
    cmd.stepTick = state.tick;
    if (stepResult === 'blocked') {
      recordWorkerBlockedTick();
      return;
    }
    if (stepResult === 'repathed') return;
    if (ec._buildPath.length === 0) {
      cmd.phase = 'building';
      clearBuildState();
    }

  } else {
    // Building phase — one HP tick of progress per sim step
    site.hp = Math.min(site.hp + 1, site.hpMax);
    if (site.hp >= site.hpMax) {
      // Construction complete: swap scaffold for the real building
      const { pos, owner } = site;
      killEntity(state, site.id);
      spawnEntity(state, cmd.building, owner, pos);
      entity.cmd = null;
      clearBuildState();
    }
  }
}
