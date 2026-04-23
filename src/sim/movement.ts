import type { Entity, GameState, Vec2 } from '../types';
import { MAP_H, MAP_W, isUnitKind, isWorkerKind } from '../types';
import { isTileBlockedByEntity } from './entities';

const NUDGE_DIRS = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 },
];

function replacePath(path: Vec2[], nextPath: Vec2[]): void {
  path.splice(0, path.length, ...nextPath);
}

type MovementResolutionState = {
  occupiedByUnitIdAtTickStart: Map<number, number>;
  reservedMoveDestByTile: Map<number, number>;
};

let movementResolutionState: MovementResolutionState | null = null;

function tileKey(x: number, y: number): number {
  return y * MAP_W + x;
}

function getEntityById(state: GameState, id: number): Entity | null {
  for (const entity of state.entities) {
    if (entity.id === id) return entity;
  }
  return null;
}

export function beginMovementResolutionTick(_tick: number, state?: GameState): void {
  if (!state) {
    movementResolutionState = null;
    return;
  }
  const occupiedByUnitIdAtTickStart = new Map<number, number>();
  for (const entity of state.entities) {
    if (!isUnitKind(entity.kind)) continue;
    occupiedByUnitIdAtTickStart.set(tileKey(entity.pos.x, entity.pos.y), entity.id);
  }
  movementResolutionState = {
    occupiedByUnitIdAtTickStart,
    reservedMoveDestByTile: new Map<number, number>(),
  };
}

export function endMovementResolutionTick(): void {
  movementResolutionState = null;
}

export function isTileOccupiedByOtherUnit(state: GameState, entity: Entity, tx: number, ty: number): boolean {
  return state.entities.some(other =>
    other.id !== entity.id &&
    isUnitKind(other.kind) &&
    other.pos.x === tx &&
    other.pos.y === ty,
  );
}

export function findDeterministicSidestep(state: GameState, entity: Entity, blocked: Vec2, goal: Vec2): Vec2 | null {
  let best: Vec2 | null = null;
  let bestScore = Infinity;

  for (const d of NUDGE_DIRS) {
    const nx = entity.pos.x + d.x;
    const ny = entity.pos.y + d.y;
    if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
    if (!state.tiles[ny][nx].passable) continue;
    if (isTileBlockedByEntity(state, nx, ny)) continue;
    if (isTileOccupiedByOtherUnit(state, entity, nx, ny)) continue;

    const blockedDist = Math.max(Math.abs(blocked.x - nx), Math.abs(blocked.y - ny));
    const goalDist = Math.max(Math.abs(goal.x - nx), Math.abs(goal.y - ny));
    const score = blockedDist * 100 + goalDist;
    if (!best || score < bestScore) {
      best = { x: nx, y: ny };
      bestScore = score;
    }
  }

  return best;
}

export type StepAvoidanceResult = 'no-path' | 'moved' | 'repathed' | 'sidestep' | 'blocked';

export type StepAvoidanceOptions = {
  allowAllyWorkerSwap?: boolean;
  allowWorkerSwapWithStationaryAlliedCombat?: boolean;
  useMoveReservation?: boolean;
  preferSidestepBeforeRepathOnAllyBlock?: boolean;
};

export type AllyBlockPolicyState = {
  blockedAllyStreak: number;
  blockedAllyTile: Vec2 | null;
};

const ALLY_BLOCK_WAIT_STEPS = 2;

export function createAllyBlockPolicyState(): AllyBlockPolicyState {
  return { blockedAllyStreak: 0, blockedAllyTile: null };
}

function resetAllyBlockPolicy(state: AllyBlockPolicyState): void {
  state.blockedAllyStreak = 0;
  state.blockedAllyTile = null;
}

function getOccupyingUnit(state: GameState, entity: Entity, tx: number, ty: number): Entity | null {
  if (movementResolutionState) {
    const occupantId = movementResolutionState.occupiedByUnitIdAtTickStart.get(tileKey(tx, ty));
    if (typeof occupantId === 'number' && occupantId !== entity.id) {
      return getEntityById(state, occupantId);
    }
    return null;
  }

  for (const other of state.entities) {
    if (other.id === entity.id) continue;
    if (!isUnitKind(other.kind)) continue;
    if (other.pos.x === tx && other.pos.y === ty) return other;
  }
  return null;
}

function shouldWaitForAllyBlock(policy: AllyBlockPolicyState, blocked: Vec2): boolean {
  const sameTile = policy.blockedAllyTile?.x === blocked.x && policy.blockedAllyTile?.y === blocked.y;
  if (sameTile) {
    policy.blockedAllyStreak++;
  } else {
    policy.blockedAllyTile = { x: blocked.x, y: blocked.y };
    policy.blockedAllyStreak = 1;
  }
  return policy.blockedAllyStreak <= ALLY_BLOCK_WAIT_STEPS;
}

function isStationaryForWorkerBypass(occupant: Entity): boolean {
  if (!occupant.cmd) return true;
  if (occupant.cmd.type === 'attack') return occupant.cmd.chasePath.length === 0;
  if (occupant.cmd.type === 'move') return occupant.cmd.path.length === 0;
  return false;
}

export function tryAdvancePathWithAvoidance(
  state: GameState,
  entity: Entity,
  path: Vec2[],
  goal: Vec2,
  allyBlockPolicyOrTryRepath?: AllyBlockPolicyState | (() => Vec2[] | null),
  tryRepathArg?: () => Vec2[] | null,
  options?: StepAvoidanceOptions,
): StepAvoidanceResult {
  let allyBlockPolicy: AllyBlockPolicyState;
  let tryRepath: (() => Vec2[] | null) | undefined;
  if (typeof allyBlockPolicyOrTryRepath === 'function') {
    allyBlockPolicy = createAllyBlockPolicyState();
    allyBlockPolicy.blockedAllyStreak = ALLY_BLOCK_WAIT_STEPS;
    tryRepath = allyBlockPolicyOrTryRepath;
  } else {
    allyBlockPolicy = allyBlockPolicyOrTryRepath ?? createAllyBlockPolicyState();
    if (!allyBlockPolicyOrTryRepath) allyBlockPolicy.blockedAllyStreak = ALLY_BLOCK_WAIT_STEPS;
    tryRepath = tryRepathArg;
  }

  if (path.length === 0) return 'no-path';

  const next = path[0]!;
  const occupant = getOccupyingUnit(state, entity, next.x, next.y);
  if (!occupant) {
    if (options?.useMoveReservation && movementResolutionState) {
      const nextKey = tileKey(next.x, next.y);
      const reservedBy = movementResolutionState.reservedMoveDestByTile.get(nextKey);
      if (typeof reservedBy === 'number' && reservedBy !== entity.id) {
        return 'blocked';
      }
      movementResolutionState.reservedMoveDestByTile.set(nextKey, entity.id);
    }

    resetAllyBlockPolicy(allyBlockPolicy);
    path.shift();
    entity.pos.x = next.x;
    entity.pos.y = next.y;
    return 'moved';
  }

  const blockedByAlly = occupant.owner === entity.owner;
  if (
    blockedByAlly
    && options?.allowAllyWorkerSwap
    && isWorkerKind(entity.kind)
    && isWorkerKind(occupant.kind)
  ) {
    const prevX = entity.pos.x;
    const prevY = entity.pos.y;
    entity.pos.x = next.x;
    entity.pos.y = next.y;
    occupant.pos.x = prevX;
    occupant.pos.y = prevY;
    path.shift();
    resetAllyBlockPolicy(allyBlockPolicy);
    return 'moved';
  }

  if (
    blockedByAlly
    && options?.allowWorkerSwapWithStationaryAlliedCombat
    && isWorkerKind(entity.kind)
    && !isWorkerKind(occupant.kind)
    && isStationaryForWorkerBypass(occupant)
  ) {
    const prevX = entity.pos.x;
    const prevY = entity.pos.y;
    entity.pos.x = next.x;
    entity.pos.y = next.y;
    occupant.pos.x = prevX;
    occupant.pos.y = prevY;
    path.shift();
    resetAllyBlockPolicy(allyBlockPolicy);
    return 'moved';
  }

  if (blockedByAlly && shouldWaitForAllyBlock(allyBlockPolicy, next)) {
    return 'blocked';
  }

  if (blockedByAlly && options?.preferSidestepBeforeRepathOnAllyBlock) {
    const sidestep = findDeterministicSidestep(state, entity, next, goal);
    if (sidestep) {
      entity.pos.x = sidestep.x;
      entity.pos.y = sidestep.y;

      const repathAfterSidestep = tryRepath?.();
      if (repathAfterSidestep && repathAfterSidestep.length > 0) {
        replacePath(path, repathAfterSidestep);
      }
      resetAllyBlockPolicy(allyBlockPolicy);
      return 'sidestep';
    }
  }

  const repath = tryRepath?.();
  if (repath && repath.length > 0) {
    resetAllyBlockPolicy(allyBlockPolicy);
    replacePath(path, repath);
    return 'repathed';
  }

  const sidestep = findDeterministicSidestep(state, entity, next, goal);
  if (!sidestep) return 'blocked';

  entity.pos.x = sidestep.x;
  entity.pos.y = sidestep.y;

  const repathAfterSidestep = tryRepath?.();
  if (repathAfterSidestep && repathAfterSidestep.length > 0) {
    replacePath(path, repathAfterSidestep);
  }
  resetAllyBlockPolicy(allyBlockPolicy);
  return 'sidestep';
}
