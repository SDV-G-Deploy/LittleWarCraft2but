import type { Entity, GameState, Vec2 } from '../types';
import { MAP_H, MAP_W, isUnitKind } from '../types';
import { isTileBlockedByEntity } from './entities';

const NUDGE_DIRS = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 },
];

function replacePath(path: Vec2[], nextPath: Vec2[]): void {
  path.splice(0, path.length, ...nextPath);
}

function tileKey(x: number, y: number): number {
  return y * MAP_W + x;
}

type MovementResolutionContext = {
  tick: number;
  reservations: Map<number, number>;
};

let movementResolutionContext: MovementResolutionContext | null = null;

export function beginMovementResolutionTick(tick: number): void {
  movementResolutionContext = { tick, reservations: new Map() };
}

export function endMovementResolutionTick(): void {
  movementResolutionContext = null;
}

function isTileReservedByOtherUnit(entity: Entity, tx: number, ty: number): boolean {
  const context = movementResolutionContext;
  if (!context) return false;
  const reservedBy = context.reservations.get(tileKey(tx, ty));
  return typeof reservedBy === 'number' && reservedBy !== entity.id;
}

function tryReserveTile(entity: Entity, tx: number, ty: number): boolean {
  const context = movementResolutionContext;
  if (!context) return true;
  const key = tileKey(tx, ty);
  const reservedBy = context.reservations.get(key);
  if (typeof reservedBy === 'number' && reservedBy !== entity.id) return false;
  context.reservations.set(key, entity.id);
  return true;
}

export function isTileOccupiedByOtherUnit(state: GameState, entity: Entity, tx: number, ty: number): boolean {
  if (isTileReservedByOtherUnit(entity, tx, ty)) return true;
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

export type MovementStepPolicy = {
  allowRepath: boolean;
  allowSidestep: boolean;
  clearPathOnSidestepRepathFailure: boolean;
};

export const MOVE_STEP_POLICY: MovementStepPolicy = {
  allowRepath: true,
  allowSidestep: true,
  clearPathOnSidestepRepathFailure: true,
};

export const CHASE_STEP_POLICY: MovementStepPolicy = {
  allowRepath: true,
  allowSidestep: true,
  clearPathOnSidestepRepathFailure: true,
};

type AdvanceMovementStepArgs = {
  state: GameState;
  entity: Entity;
  path: Vec2[];
  goal: Vec2;
  policy: MovementStepPolicy;
  tryRepath?: () => Vec2[] | null;
};

/**
 * Shared movement-step core. Domain systems (move/chase/gather/build travel)
 * can keep their own state machines while delegating per-step execution here.
 */
export function advanceMovementStepCore(args: AdvanceMovementStepArgs): StepAvoidanceResult {
  const { state, entity, path, goal, policy, tryRepath } = args;
  const canRepath = policy.allowRepath ? tryRepath : undefined;

  if (path.length === 0) return 'no-path';

  const next = path[0]!;
  if (!isTileOccupiedByOtherUnit(state, entity, next.x, next.y)) {
    if (!tryReserveTile(entity, next.x, next.y)) return 'blocked';
    path.shift();
    entity.pos.x = next.x;
    entity.pos.y = next.y;
    return 'moved';
  }

  const repath = canRepath?.();
  if (repath && repath.length > 0) {
    replacePath(path, repath);
    return 'repathed';
  }

  if (!policy.allowSidestep) return 'blocked';

  const sidestep = findDeterministicSidestep(state, entity, next, goal);
  if (!sidestep) return 'blocked';

  if (!tryReserveTile(entity, sidestep.x, sidestep.y)) return 'blocked';

  entity.pos.x = sidestep.x;
  entity.pos.y = sidestep.y;

  const repathAfterSidestep = canRepath?.();
  if (repathAfterSidestep && repathAfterSidestep.length > 0) {
    replacePath(path, repathAfterSidestep);
  } else if (policy.clearPathOnSidestepRepathFailure) {
    path.splice(0, path.length);
  }
  return 'sidestep';
}

export function tryAdvancePathWithAvoidance(
  state: GameState,
  entity: Entity,
  path: Vec2[],
  goal: Vec2,
  tryRepath?: () => Vec2[] | null,
): StepAvoidanceResult {
  return advanceMovementStepCore({
    state,
    entity,
    path,
    goal,
    policy: MOVE_STEP_POLICY,
    tryRepath,
  });
}
