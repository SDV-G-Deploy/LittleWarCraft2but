import type { Entity, EntityKind, GameState, Vec2 } from '../types';
import { GATHER_TICKS, GATHER_AMOUNT, MAP_W, MAP_H, SIM_HZ, isUnitKind, isWorkerKind } from '../types';
import { ticksPerStep } from '../data/units';
import { getResolvedBuildTicks, getResolvedCost, getResolvedTileSize } from '../balance/resolver';
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
import { getEntity, spawnEntity, killEntity, isTileBlockedByEntity } from './entities';
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

function bestContestedMine(state: GameState, owner: 0 | 1): Entity | null {
  let best: Entity | null = null;
  let bestScore = -Infinity;
  const myTownHall = state.entities.find(e => e.owner === owner && e.kind === 'townhall');
  const enemyTownHall = state.entities.find(e => e.owner !== owner && e.kind === 'townhall');
  if (!myTownHall || !enemyTownHall) return null;

  for (const e of state.entities) {
    if (e.kind !== 'goldmine' || (e.goldReserve ?? 0) <= 0) continue;
    const myDist = Math.hypot(e.pos.x - myTownHall.pos.x, e.pos.y - myTownHall.pos.y);
    const enemyDist = Math.hypot(e.pos.x - enemyTownHall.pos.x, e.pos.y - enemyTownHall.pos.y);
    const centerBias = e.pos.x > 16 && e.pos.x < 48 ? 6 : 0;
    const score = (e.goldReserve ?? 0) / 100 + centerBias - Math.abs(myDist - enemyDist) * 0.2;
    if (score > bestScore) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

export function processGather(state: GameState, entity: Entity): void {
  if (!entity.cmd || entity.cmd.type !== 'gather') return;
  const cmd = entity.cmd;
  const ec  = entity as EntityWithCache;

  const clearGatherState = () => {
    ec._gatherPath = undefined;
  };

  const mine = getEntity(state, cmd.mineId);
  const mineDepleted = !mine || (mine.goldReserve ?? 0) <= 0;
  if (mineDepleted) {
    if (cmd.phase === 'returning' || (entity.carryGold ?? 0) > 0) {
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
    case 'tomine': {
      if (!mine) {
        clearGatherState();
        entity.cmd = null;
        return;
      }
      if (ec._gatherPath === undefined) {
        // target tile just above the mine
        const raw = findPath(state, entity.pos.x, entity.pos.y,
          mine.pos.x, mine.pos.y - 1);
        if (raw === null) {
          clearGatherState();
          entity.cmd = null;
          return;
        } // truly unreachable — give up
        ec._gatherPath = raw;
      }
      if (ec._gatherPath.length === 0) {
        // already adjacent — start mining
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
      if (!mine) {
        clearGatherState();
        entity.cmd = null;
        return;
      }
      const owner = entity.owner as 0 | 1;
      const openingPlan = state.openingPlanSelected[owner];
      const ecoGatherBonus = getEcoGatherBonus(openingPlan, state.openingCommitmentClaimed[owner], state.tick, entity);
      const take = Math.min(GATHER_AMOUNT + ecoGatherBonus, mine.goldReserve ?? 0);
      mine.goldReserve = (mine.goldReserve ?? 0) - take;
      entity.carryGold = take;
      cmd.phase = 'returning'; ec._gatherPath = undefined;
      break;
    }
    case 'returning': {
      const th = nearestTownHall(state, entity.owner as 0 | 1, entity.pos.x, entity.pos.y);
      if (!th) {
        clearGatherState();
        entity.cmd = null;
        return;
      }
      if (ec._gatherPath === undefined) {
        const dropX = th.pos.x + Math.floor(th.tileW / 2);
        const dropY = th.pos.y + th.tileH;
        const raw = findPath(state, entity.pos.x, entity.pos.y, dropX, dropY);
        // If path home is blocked, credit gold anyway and restart
        ec._gatherPath = raw ?? [];
      }
      if (ec._gatherPath.length === 0) {
        const owner = entity.owner as 0 | 1;
        state.gold[owner] += entity.carryGold ?? 0;
        if (shouldApplyEcoFirstReturnBonus(state.openingPlanSelected[owner], state.openingCommitmentClaimed[owner], state.tick, entity)) {
          entity.openingPlan = 'eco';
          entity.carryGold = Math.min(getEcoGatherBonusCap(), (entity.carryGold ?? 0) + getEcoGatherBonus('eco', false, state.tick, entity));
          state.gold[owner] += getEcoFirstReturnBonusGold();
          state.openingCommitmentClaimed[owner] = true;
        }
        entity.carryGold = 0;
        ec._gatherPath = undefined;
        if (mineDepleted) {
          entity.cmd = null;
          return;
        }
        cmd.phase = 'tomine';
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

export function refundCancelledTrainCommand(state: GameState, building: Entity): void {
  if (!building.cmd || building.cmd.type !== 'train') return;

  const owner = building.owner as 0 | 1;
  const queue = [building.cmd.unit, ...building.cmd.queue];
  for (const queuedUnit of queue) {
    state.gold[owner] += getResolvedCost(queuedUnit, state.races[owner]);
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
  if (state.gold[building.owner as 0 | 1] < cost) return false;
  if (state.pop[building.owner as 0 | 1] >= state.popCap[building.owner as 0 | 1]) return false;

  if (building.cmd?.type === 'train') {
    if (building.cmd.queue.length >= 5) return false;
    building.cmd.queue.push(unit);
    state.gold[building.owner as 0 | 1] -= cost;
    return true;
  }

  state.gold[building.owner as 0 | 1] -= cost;
  const owner = building.owner as 0 | 1;
  const openingPlan = state.openingPlanSelected[owner];
  let ticksLeft = getResolvedBuildTicks(unit, state.races[building.owner as 0 | 1]);
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
    ? state.entities.find(e => e.owner !== owner && e.kind === 'townhall')
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
    const rp   = moveTarget;
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
      };
    }
  }

  if (cmd.queue.length > 0) {
    const next = cmd.queue.shift()!;
    cmd.unit      = next;
    cmd.ticksLeft = getResolvedBuildTicks(next, state.races[owner]);
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

export function issueBuildCommand(
  state: GameState,
  worker: Entity,
  building: EntityKind,
  pos: Vec2,
  currentTick: number,
): boolean {
  if (building === 'tower') {
    const hasBarracks = state.entities.some(e => e.owner === worker.owner && e.kind === 'barracks');
    if (!hasBarracks) return false;
  }

  const stats = {
    ...getResolvedTileSize(building),
    buildTicks: getResolvedBuildTicks(building),
    cost: getResolvedCost(building),
  };
  const cost = stats.cost;
  if (state.gold[worker.owner as 0 | 1] < cost) return false;
  if (!isValidPlacement(state, building, pos.x, pos.y)) return false;

  state.gold[worker.owner as 0 | 1] -= cost;

  // Spawn the construction scaffold immediately so it:
  //  - Reserves the tile footprint (blocks further placement)
  //  - Shows the shadow on the map from this moment on
  //  - Tracks progress via hp (0 → buildTicks)
  const site = spawnEntity(state, 'construction', worker.owner as 0 | 1, pos);
  site.hp    = 0;
  site.hpMax = stats.buildTicks;
  site.tileW = stats.tileW;
  site.tileH = stats.tileH;
  site.constructionOf = building;

  worker.cmd = {
    type: 'build', building, pos: { ...pos },
    siteId: site.id,
    phase: 'moving', stepTick: currentTick,
  };
  (worker as EntityWithCache)._buildPath = undefined;
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
}

export function processBuild(state: GameState, entity: Entity): void {
  if (!entity.cmd || entity.cmd.type !== 'build') return;
  const cmd = entity.cmd;
  const ec  = entity as EntityWithCache;
  const tps = ticksPerStep(entity.kind);

  const clearBuildState = () => {
    ec._buildPath = undefined;
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
      ec._buildPath = findPath(state, entity.pos.x, entity.pos.y, adjX, adjY) ?? [];
    }
    if (ec._buildPath.length === 0) {
      cmd.phase = 'building';
      clearBuildState();
      return;
    }
    if (state.tick - cmd.stepTick < tps) return;
    const next = ec._buildPath.shift()!;
    entity.pos.x = next.x; entity.pos.y = next.y;
    cmd.stepTick = state.tick;
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
