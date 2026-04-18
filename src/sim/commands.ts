import type { GameState, Entity, Vec2 } from '../types';
import { MAP_W, MAP_H, isUnitKind, isRangedUnit } from '../types';
import { findPath } from './pathfinding';
import { ticksPerStep } from '../data/units';
import { processAttack, issueAttackCommand } from './combat';
import { processGather, processTrain, processBuild } from './economy';
import { isTileBlockedByEntity } from './entities';

/** Issue a move-to-tile command on an entity. Replaces current command.
 *  Pass attackMove=true to make the unit auto-attack enemies seen en route. */
const MOVE_STUCK_TICKS = 14;
const MOVE_REPATH_LIMIT = 5;
const MOVE_FALLBACK_RADIUS = 3;

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

function findNearbyMoveGoal(state: GameState, entity: Entity, tx: number, ty: number): Vec2 | null {
  const clamped = clampGoalToMap(tx, ty);
  const candidates: Vec2[] = [clamped];
  for (let r = 1; r <= MOVE_FALLBACK_RADIUS; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        candidates.push(clampGoalToMap(clamped.x + dx, clamped.y + dy));
      }
    }
  }

  let best: Vec2 | null = null;
  let bestPath: Vec2[] | null = null;
  for (const c of candidates) {
    const path = findPath(state, entity.pos.x, entity.pos.y, c.x, c.y);
    if (!path) continue;
    if (!bestPath || path.length < bestPath.length) {
      best = c;
      bestPath = path;
    }
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
  const goal = findNearbyMoveGoal(state, entity, tx, ty);
  if (!goal) return false;

  const path = findPath(state, entity.pos.x, entity.pos.y, goal.x, goal.y);
  if (!path || path.length === 0) return false;

  entity.cmd = {
    type: 'move',
    path,
    stepTick: state.tick,
    attackMove,
    goal,
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

const NUDGE_DIRS = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 },
];

/**
 * Push stacked units apart. Call once per sim tick.
 * Only nudges stationary units — units already walking sort themselves out.
 */
export function separateUnits(state: GameState): void {
  if (state.tick % 3 !== 0) return; // run every 3 ticks (~150 ms)

  const units = state.entities.filter(e => isUnitKind(e.kind));

  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    if (!isStationary(a)) continue;

    for (let j = i + 1; j < units.length; j++) {
      const b = units[j];
      if (a.pos.x !== b.pos.x || a.pos.y !== b.pos.y) continue;
      if (!isStationary(b)) continue;

      // Both units are stationary on the same tile — nudge b to nearest free tile
      for (const d of NUDGE_DIRS) {
        const nx = b.pos.x + d.x;
        const ny = b.pos.y + d.y;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
        if (!state.tiles[ny][nx].passable) continue;
        if (isTileBlockedByEntity(state, nx, ny)) continue;
        if (units.some((u, k) => k !== j && u.pos.x === nx && u.pos.y === ny)) continue;
        b.pos.x = nx;
        b.pos.y = ny;
        break;
      }
    }
  }
}

/**
 * Auto-attack: idle units automatically engage the nearest visible enemy.
 * Runs every 2 ticks. Handles both player and AI units.
 */
export function autoAttackPass(state: GameState): void {
  if (state.tick % 2 !== 0) return;

  for (const unit of state.entities) {
    if (!isUnitKind(unit.kind)) continue;
    if (unit.cmd !== null) continue; // already has orders

    let best: Entity | null = null;
    let bestD = Infinity;
    for (const t of state.entities) {
      if (t.owner === unit.owner) continue;
      if (t.kind === 'goldmine') continue;
      if (isRangedUnit(unit.kind) && !isUnitKind(t.kind)) continue; // archers skip buildings
      const d = Math.hypot(t.pos.x - unit.pos.x, t.pos.y - unit.pos.y);
      if (d <= unit.sightRadius && d < bestD) { bestD = d; best = t; }
    }
    if (best) issueAttackCommand(unit, best.id, state.tick);
  }
}

/** Process one sim tick for a single entity's current command. */
export function processCommand(state: GameState, entity: Entity): void {
  if (!entity.cmd) return;

  switch (entity.cmd.type) {
    case 'move': {
      const cmd = entity.cmd;

      // Attack-move: intercept any enemy that enters sight range while walking
      if (cmd.attackMove) {
        let best: Entity | null = null;
        let bestD = Infinity;
        for (const t of state.entities) {
          if (t.owner === entity.owner || t.kind === 'goldmine') continue;
          if (isRangedUnit(entity.kind) && !isUnitKind(t.kind)) continue;
          const d = Math.hypot(t.pos.x - entity.pos.x, t.pos.y - entity.pos.y);
          if (d <= entity.sightRadius && d < bestD) { bestD = d; best = t; }
        }
        if (best) { issueAttackCommand(entity, best.id, state.tick); return; }
      }

      const tps = ticksPerStep(entity.kind);
      if (state.tick - cmd.stepTick < tps) return;

      if (entity.pos.x !== cmd.lastPos.x || entity.pos.y !== cmd.lastPos.y) {
        cmd.lastPos = { ...entity.pos };
        cmd.lastProgressTick = state.tick;
      } else if (state.tick - cmd.lastProgressTick >= MOVE_STUCK_TICKS && cmd.repathCount < MOVE_REPATH_LIMIT) {
        const fallbackGoal = findNearbyMoveGoal(state, entity, cmd.goal.x, cmd.goal.y);
        const newPath = fallbackGoal
          ? findPath(state, entity.pos.x, entity.pos.y, fallbackGoal.x, fallbackGoal.y)
          : null;
        cmd.lastProgressTick = state.tick;
        cmd.lastPos = { ...entity.pos };
        cmd.repathCount++;
        if (fallbackGoal && newPath && newPath.length > 0) {
          cmd.goal = fallbackGoal;
          cmd.path = newPath;
          cmd.stepTick = state.tick;
        }
      }

      if (cmd.path.length === 0) { entity.cmd = null; return; }

      const next = cmd.path[0]!;
      if (isTileOccupiedByOtherUnit(state, entity, next.x, next.y)) {
        if (cmd.repathCount < MOVE_REPATH_LIMIT) {
          const fallbackGoal = findNearbyMoveGoal(state, entity, cmd.goal.x, cmd.goal.y);
          const newPath = fallbackGoal
            ? findPath(state, entity.pos.x, entity.pos.y, fallbackGoal.x, fallbackGoal.y)
            : null;
          cmd.repathCount++;
          if (fallbackGoal && newPath && newPath.length > 0) {
            cmd.goal = fallbackGoal;
            cmd.path = newPath;
            cmd.stepTick = state.tick;
            return;
          }
        }

        const sidestep = findDeterministicSidestep(state, entity, next);
        cmd.lastProgressTick = state.tick;
        cmd.lastPos = { ...entity.pos };

        if (sidestep) {
          entity.pos.x = sidestep.x;
          entity.pos.y = sidestep.y;
          const fallbackGoal = findNearbyMoveGoal(state, entity, cmd.goal.x, cmd.goal.y);
          const newPath = fallbackGoal
            ? findPath(state, entity.pos.x, entity.pos.y, fallbackGoal.x, fallbackGoal.y)
            : null;
          cmd.stepTick = state.tick;
          cmd.lastPos = { ...entity.pos };
          cmd.lastProgressTick = state.tick;
          if (fallbackGoal && newPath && newPath.length > 0) {
            cmd.goal = fallbackGoal;
            cmd.path = newPath;
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
        cmd.lastPos = { ...entity.pos };
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
