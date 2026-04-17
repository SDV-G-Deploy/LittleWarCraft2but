import type { GameState, Entity } from '../types';
import { MAP_W, MAP_H, isUnitKind, isRangedUnit } from '../types';
import { findPath } from './pathfinding';
import { ticksPerStep } from '../data/units';
import { processAttack, issueAttackCommand } from './combat';
import { processGather, processTrain, processBuild } from './economy';
import { isTileBlockedByEntity } from './entities';

/** Issue a move-to-tile command on an entity. Replaces current command.
 *  Pass attackMove=true to make the unit auto-attack enemies seen en route. */
export function issueMoveCommand(
  state: GameState,
  entity: Entity,
  tx: number,
  ty: number,
  attackMove = false,
): void {
  const path = findPath(state, entity.pos.x, entity.pos.y, tx, ty);
  if (!path || path.length === 0) return;

  entity.cmd = { type: 'move', path, stepTick: state.tick, attackMove };
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

      if (cmd.path.length === 0) { entity.cmd = null; return; }

      const next = cmd.path.shift()!;
      entity.pos.x = next.x;
      entity.pos.y = next.y;
      cmd.stepTick = state.tick;
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
