import type { GameState, Entity, Vec2 } from '../types';
import { MAP_W, MAP_H, isUnitKind, isRangedUnit } from '../types';
import { findPath } from './pathfinding';
import { ticksPerStep } from '../data/units';
import { processAttack, issueAttackCommand } from './combat';
import { processGather, processTrain, processBuild } from './economy';
import { isTileBlockedByEntity } from './entities';
import { profiler } from './profiler';

type TargetPredicate = (target: Entity) => boolean;

/** Issue a move-to-tile command on an entity. Replaces current command.
 *  Pass attackMove=true to make the unit auto-attack enemies seen en route. */
const MOVE_STUCK_TICKS = 14;
const MOVE_REPATH_LIMIT = 5;
const MOVE_FALLBACK_RADIUS = 3;
const MOVE_REPATH_COOLDOWN_TICKS = 8;
const MOVE_GOAL_PATH_TRIALS = 3;

function isTileOccupiedByOtherUnit(state: GameState, entity: Entity, tx: number, ty: number): boolean {
  return state.entities.some(other =>
    other.id !== entity.id &&
    isUnitKind(other.kind) &&
    other.pos.x === tx &&
    other.pos.y === ty,
  );
}

function findDeterministicSidestep(state: GameState, entity: Entity, blocked: Vec2): Vec2 | null {
  let best: Vec2 | null = null;
  let bestScore = Infinity;
  const goal = entity.cmd?.type === 'move' ? entity.cmd.goal : blocked;

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

function clampGoalToMap(tx: number, ty: number): Vec2 {
  return {
    x: Math.max(0, Math.min(MAP_W - 1, tx)),
    y: Math.max(0, Math.min(MAP_H - 1, ty)),
  };
}

function goalsNear(a: Vec2, b: Vec2): boolean {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;
}

function candidateGoalScore(origin: Vec2, preferred: Vec2, candidate: Vec2): number {
  const preferredDist = Math.max(Math.abs(preferred.x - candidate.x), Math.abs(preferred.y - candidate.y));
  const originDist = Math.max(Math.abs(origin.x - candidate.x), Math.abs(origin.y - candidate.y));
  return preferredDist * 1000 + originDist;
}

function buildMoveGoalCandidates(tx: number, ty: number): Vec2[] {
  const clamped = clampGoalToMap(tx, ty);
  const candidates: Vec2[] = [clamped];
  for (let r = 1; r <= MOVE_FALLBACK_RADIUS; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const candidate = clampGoalToMap(clamped.x + dx, clamped.y + dy);
        if (!candidates.some(existing => existing.x === candidate.x && existing.y === candidate.y)) {
          candidates.push(candidate);
        }
      }
    }
  }
  return candidates;
}

function findNearbyMoveGoal(state: GameState, entity: Entity, tx: number, ty: number): { goal: Vec2; path: Vec2[] } | null {
  const clamped = clampGoalToMap(tx, ty);
  const candidates = buildMoveGoalCandidates(tx, ty)
    .sort((a, b) => candidateGoalScore(entity.pos, clamped, a) - candidateGoalScore(entity.pos, clamped, b));

  let best: { goal: Vec2; path: Vec2[] } | null = null;
  let bestScore = Infinity;
  const maxTrials = Math.min(MOVE_GOAL_PATH_TRIALS, candidates.length);
  for (let i = 0; i < maxTrials; i++) {
    const c = candidates[i]!;
    const path = findPath(state, entity.pos.x, entity.pos.y, c.x, c.y);
    if (!path) continue;
    const goalDist = Math.max(Math.abs(clamped.x - c.x), Math.abs(clamped.y - c.y));
    const score = goalDist * 1000 + path.length;
    if (path.length === 0 && entity.pos.x === c.x && entity.pos.y === c.y) {
      return { goal: c, path };
    }
    if (!best || score < bestScore) {
      best = { goal: c, path };
      bestScore = score;
    }
  }

  if (best) return best;

  for (let i = maxTrials; i < candidates.length; i++) {
    const c = candidates[i]!;
    const path = findPath(state, entity.pos.x, entity.pos.y, c.x, c.y);
    if (!path) continue;
    return { goal: c, path };
  }

  return best;
}

export function issueMoveCommand(
  state: GameState,
  entity: Entity,
  tx: number,
  ty: number,
  attackMove = false,
): boolean {
  const requestedGoal = clampGoalToMap(tx, ty);
  if (entity.cmd?.type === 'move' &&
      entity.cmd.attackMove === attackMove &&
      goalsNear(entity.cmd.goal, requestedGoal) &&
      entity.cmd.path.length > 0) {
    return true;
  }

  const movePlan = findNearbyMoveGoal(state, entity, tx, ty);
  if (!movePlan || movePlan.path.length === 0) return false;

  entity.cmd = {
    type: 'move',
    path: movePlan.path,
    stepTick: state.tick,
    attackMove,
    goal: movePlan.goal,
    lastPos: { ...entity.pos },
    lastProgressTick: state.tick,
    repathCount: 0,
  };

  return true;
}

/** True if unit is standing still (idle or in a non-moving active phase). */
function isStationary(e: Entity): boolean {
  if (!e.cmd) return true;
  if (e.cmd.type === 'gather'  && e.cmd.phase === 'gathering') return true;
  if (e.cmd.type === 'build'   && e.cmd.phase === 'building')  return true;
  // Units in attack mode that are standing in place (no chase path) are stationary
  if (e.cmd.type === 'attack'  && e.cmd.chasePath.length === 0) return true;
  return false;
}

function canAttemptRepath(state: GameState, entity: Entity): boolean {
  return !entity.cmd || entity.cmd.type !== 'move' || state.tick - entity.cmd.lastProgressTick >= MOVE_REPATH_COOLDOWN_TICKS;
}

function acquireNearestTarget(
  state: GameState,
  unit: Entity,
  predicate: TargetPredicate,
): Entity | null {
  const sight = unit.sightRadius;
  let best: Entity | null = null;
  let bestDistSq = sight * sight + 1;

  for (const target of state.entities) {
    if (target.owner === unit.owner) continue;
    if (!predicate(target)) continue;
    const dx = target.pos.x - unit.pos.x;
    const dy = target.pos.y - unit.pos.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > sight * sight) continue;
    if (distSq < bestDistSq) {
      best = target;
      bestDistSq = distSq;
    }
  }

  return best;
}

const NUDGE_DIRS = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 },
];

/**
 * Push stacked units apart. Call once per sim tick.
 * Only nudges stationary units — units already walking sort themselves out.
 */
function tileKey(x: number, y: number): number {
  return y * MAP_W + x;
}

export function separateUnits(state: GameState): void {
  if (state.tick % 3 !== 0) return; // run every 3 ticks (~150 ms)

  const stationaryByTile = new Map<number, Entity[]>();
  const occupied = new Set<number>();

  for (const unit of state.entities) {
    if (!isUnitKind(unit.kind)) continue;

    occupied.add(tileKey(unit.pos.x, unit.pos.y));

    if (!isStationary(unit)) continue;
    const key = tileKey(unit.pos.x, unit.pos.y);
    const stack = stationaryByTile.get(key);
    if (stack) stack.push(unit);
    else stationaryByTile.set(key, [unit]);
  }

  for (const stack of stationaryByTile.values()) {
    if (stack.length <= 1) continue;

    for (let i = 1; i < stack.length; i++) {
      const unit = stack[i]!;
      occupied.delete(tileKey(unit.pos.x, unit.pos.y));

      for (const d of NUDGE_DIRS) {
        const nx = unit.pos.x + d.x;
        const ny = unit.pos.y + d.y;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
        if (!state.tiles[ny][nx].passable) continue;
        if (isTileBlockedByEntity(state, nx, ny)) continue;
        const nextKey = tileKey(nx, ny);
        if (occupied.has(nextKey)) continue;
        unit.pos.x = nx;
        unit.pos.y = ny;
        occupied.add(nextKey);
        break;
      }

      occupied.add(tileKey(unit.pos.x, unit.pos.y));
    }
  }
}

/**
 * Auto-attack: idle units automatically engage the nearest visible enemy.
 * Runs every 2 ticks. Handles both player and AI units.
 */
export function autoAttackPass(state: GameState): void {
  if (state.tick % 2 !== 0) return;

  const t0 = profiler.now();
  for (const unit of state.entities) {
    if (!isUnitKind(unit.kind)) continue;
    if (unit.cmd !== null) continue; // already has orders

    const best = acquireNearestTarget(state, unit, (target) => {
      if (target.kind === 'goldmine') return false;
      if (isRangedUnit(unit.kind) && !isUnitKind(target.kind)) return false;
      return true;
    });
    if (best) issueAttackCommand(unit, best.id, state.tick);
  }
  profiler.recordAutoAttack(profiler.now() - t0);
}

/** Process one sim tick for a single entity's current command. */
export function processCommand(state: GameState, entity: Entity): void {
  if (!entity.cmd) return;

  switch (entity.cmd.type) {
    case 'move': {
      const cmd = entity.cmd;

      // Attack-move: intercept any enemy that enters sight range while walking
      if (cmd.attackMove) {
        const best = acquireNearestTarget(state, entity, (target) => {
          if (target.kind === 'goldmine') return false;
          if (isRangedUnit(entity.kind) && !isUnitKind(target.kind)) return false;
          return true;
        });
        if (best) { issueAttackCommand(entity, best.id, state.tick); return; }
      }

      const baseTps = ticksPerStep(entity.kind, state.races[entity.owner]);
      const speedBoostActive =
        typeof cmd.speedMult === 'number' &&
        cmd.speedMult > 1 &&
        typeof cmd.speedMultUntilTick === 'number' &&
        state.tick <= cmd.speedMultUntilTick;
      const tps = speedBoostActive
        ? Math.max(1, Math.floor(baseTps / cmd.speedMult!))
        : baseTps;
      if (state.tick - cmd.stepTick < tps) return;

      if (entity.pos.x !== cmd.lastPos.x || entity.pos.y !== cmd.lastPos.y) {
        cmd.lastPos.x = entity.pos.x;
        cmd.lastPos.y = entity.pos.y;
        cmd.lastProgressTick = state.tick;
      } else if (state.tick - cmd.lastProgressTick >= MOVE_STUCK_TICKS && cmd.repathCount < MOVE_REPATH_LIMIT && canAttemptRepath(state, entity)) {
        profiler.recordMoveStuck();
        const movePlan = findNearbyMoveGoal(state, entity, cmd.goal.x, cmd.goal.y);
        cmd.lastProgressTick = state.tick;
        cmd.lastPos.x = entity.pos.x;
        cmd.lastPos.y = entity.pos.y;
        cmd.repathCount++;
        const repathOk = !!(movePlan && movePlan.path.length > 0);
        profiler.recordMoveRepath(repathOk);
        if (repathOk) {
          cmd.goal = movePlan!.goal;
          cmd.path = movePlan!.path;
          cmd.stepTick = state.tick;
        }
      }

      if (cmd.path.length === 0) { entity.cmd = null; return; }

      const next = cmd.path[0]!;
      if (isTileOccupiedByOtherUnit(state, entity, next.x, next.y)) {
        if (cmd.repathCount < MOVE_REPATH_LIMIT && canAttemptRepath(state, entity)) {
          const movePlan = findNearbyMoveGoal(state, entity, cmd.goal.x, cmd.goal.y);
          cmd.repathCount++;
          const repathOk = !!(movePlan && movePlan.path.length > 0);
          profiler.recordMoveRepath(repathOk);
          if (repathOk) {
            cmd.goal = movePlan!.goal;
            cmd.path = movePlan!.path;
            cmd.stepTick = state.tick;
            return;
          }
        }

        const sidestep = findDeterministicSidestep(state, entity, next);
        cmd.lastProgressTick = state.tick;
        cmd.lastPos.x = entity.pos.x;
        cmd.lastPos.y = entity.pos.y;

        const sidestepOk = !!sidestep;
        profiler.recordMoveSidestep(sidestepOk);

        if (sidestep) {
          entity.pos.x = sidestep.x;
          entity.pos.y = sidestep.y;
          const movePlan = findNearbyMoveGoal(state, entity, cmd.goal.x, cmd.goal.y);
          cmd.stepTick = state.tick;
          cmd.lastPos.x = entity.pos.x;
          cmd.lastPos.y = entity.pos.y;
          cmd.lastProgressTick = state.tick;
          if (movePlan && movePlan.path.length > 0) {
            cmd.goal = movePlan.goal;
            cmd.path = movePlan.path;
            cmd.repathCount = 0;
          } else {
            cmd.path = [];
          }
          return;
        }

        return;
      }

      cmd.path.shift();
      entity.pos.x = next.x;
      entity.pos.y = next.y;
      cmd.stepTick = state.tick;
      if (entity.pos.x !== cmd.lastPos.x || entity.pos.y !== cmd.lastPos.y) {
        cmd.lastPos.x = entity.pos.x;
        cmd.lastPos.y = entity.pos.y;
        cmd.lastProgressTick = state.tick;
      }
      break;
    }
    case 'attack': {
      processAttack(state, entity);
      break;
    }
    case 'gather': {
      processGather(state, entity);
      break;
    }
    case 'train': {
      processTrain(state, entity);
      break;
    }
    case 'build': {
      processBuild(state, entity);
      break;
    }
  }
}
