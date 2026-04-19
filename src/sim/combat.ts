import type { Entity, GameState, ProjectileVisualEvent } from '../types';
import { MAP_H, MAP_W, SIM_HZ, isUnitKind, isRangedUnit } from '../types';
import { ticksPerStep } from '../data/units';
import { getResolvedArmor, getResolvedAttackTicks, getResolvedDamage, getResolvedRange } from '../balance/resolver';
import { resolveAttackBonus } from '../balance/modifiers';
import { getEntity, killEntity } from './entities';
import { findPath } from './pathfinding';

// ─── Issue ────────────────────────────────────────────────────────────────────

export function issueAttackCommand(entity: Entity, targetId: number, currentTick: number): void {
  entity.cmd = {
    type: 'attack',
    targetId,
    cooldownTick: 0,
    chasePath: [],
    chasePathTick: currentTick, // align movement cadence to now, not epoch
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/**
 * Chebyshev distance from (ax,ay) to the nearest tile of target's footprint.
 * For 1×1 units this equals plain chebyshev. For buildings it finds the edge.
 */
function distToEntity(ax: number, ay: number, target: Entity): number {
  const nx = Math.max(target.pos.x, Math.min(ax, target.pos.x + target.tileW - 1));
  const ny = Math.max(target.pos.y, Math.min(ay, target.pos.y + target.tileH - 1));
  return chebyshev(ax, ay, nx, ny);
}

function isLOSBlockingTile(state: GameState, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;

  // Fast path: this tile has no static footprint occupancy at all.
  if ((state.blockedTiles?.[ty * MAP_W + tx] ?? 0) === 0) return false;

  // Slow path only on occupied tiles: preserve gameplay semantics exactly.
  for (const e of state.entities) {
    if (isUnitKind(e.kind) || e.kind === 'wall' || e.kind === 'goldmine') continue;
    if (tx >= e.pos.x && tx < e.pos.x + e.tileW &&
        ty >= e.pos.y && ty < e.pos.y + e.tileH) {
      return true;
    }
  }
  return false;
}

/**
 * Bresenham line-of-sight check. Returns false if a non-wall building
 * occupies any tile between (ax,ay) and (bx,by).
 * Walls are transparent; trees/goldmines are ignored (only buildings block).
 */
function hasLOS(state: GameState, ax: number, ay: number, bx: number, by: number): boolean {
  let x = ax, y = ay;
  const dx = Math.abs(bx - ax), dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
  let err = dx + dy;

  while (x !== bx || y !== by) {
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
    if (x === bx && y === by) break; // reached target tile — stop

    // Check if this intermediate tile holds a LOS-blocking building.
    if (isLOSBlockingTile(state, x, y)) return false;
  }
  return true;
}

/**
 * LOS to an entity footprint, consistent with range geometry:
 * any target footprint tile that is both in range and visible is valid.
 */
function hasLOSToEntity(state: GameState, attacker: Entity, target: Entity, range: number): boolean {
  for (let ty = target.pos.y; ty < target.pos.y + target.tileH; ty++) {
    for (let tx = target.pos.x; tx < target.pos.x + target.tileW; tx++) {
      if (chebyshev(attacker.pos.x, attacker.pos.y, tx, ty) > range) continue;
      if (hasLOS(state, attacker.pos.x, attacker.pos.y, tx, ty)) return true;
    }
  }
  return false;
}

function pushAttackVisual(state: GameState, attacker: Entity, target: Entity): void {
  if (!state.recentAttackEvents) state.recentAttackEvents = [];
  state.recentAttackEvents.push({
    attackerId: attacker.id,
    targetId: target.id,
    tick: state.tick,
    ranged: isRangedUnit(attacker.kind),
  });

  if (!isRangedUnit(attacker.kind)) return;

  if (!state.recentProjectileEvents) state.recentProjectileEvents = [];
  const projectile: ProjectileVisualEvent = {
    attackerId: attacker.id,
    targetId: target.id,
    start: {
      x: attacker.pos.x + attacker.tileW / 2,
      y: attacker.pos.y + attacker.tileH / 2,
    },
    end: {
      x: target.pos.x + target.tileW / 2,
      y: target.pos.y + target.tileH / 2,
    },
    startTick: state.tick,
    durationTicks: 5,
  };
  state.recentProjectileEvents.push(projectile);
}

// ─── Process ─────────────────────────────────────────────────────────────────

export function processAttack(state: GameState, entity: Entity): void {
  if (!entity.cmd || entity.cmd.type !== 'attack') return;
  const cmd = entity.cmd;

  const target = getEntity(state, cmd.targetId);
  if (!target) { entity.cmd = null; return; }

  // Ranged units (archer, troll) only fight mobile units — not buildings or walls
  if (isRangedUnit(entity.kind) && !isUnitKind(target.kind)) { entity.cmd = null; return; }

  const range  = getResolvedRange(entity.kind, state.races[entity.owner]);
  const dist   = distToEntity(entity.pos.x, entity.pos.y, target);
  const losOk  = range <= 1 || hasLOSToEntity(state, entity, target, range);

  if (dist <= range && losOk) {
    // ── In range with LOS: attack ───────────────────────────────────────────
    cmd.chasePath = [];
    if (state.tick < cmd.cooldownTick) return;

    const dmg       = getResolvedDamage(entity.kind, state.races[entity.owner]);
    const armor     = getResolvedArmor(target);
    const attackBonus = resolveAttackBonus({ state, attacker: entity, target });
    const netDmg    = Math.max(1, dmg - armor + attackBonus);
    pushAttackVisual(state, entity, target);
    target.hp      -= netDmg;
    target.underAttackTick = state.tick;
    cmd.cooldownTick = state.tick + getResolvedAttackTicks(entity.kind, state.races[entity.owner]);

    if (target.hp <= 0) {
      state.corpses.push({ pos: { ...target.pos }, owner: target.owner, deadTick: state.tick });
      killEntity(state, target.id);
      entity.cmd = null;
    }
  } else {
    // ── Out of range or no LOS: chase toward nearest footprint tile ─────────
    const tps = ticksPerStep(entity.kind, state.races[entity.owner]);
    if ((state.tick - cmd.chasePathTick) % tps !== 0) return;

    if (cmd.chasePath.length === 0 || state.tick - cmd.chasePathTick >= SIM_HZ) {
      // Path toward nearest edge of target footprint (not just top-left corner)
      const nearX = Math.max(target.pos.x, Math.min(entity.pos.x, target.pos.x + target.tileW - 1));
      const nearY = Math.max(target.pos.y, Math.min(entity.pos.y, target.pos.y + target.tileH - 1));
      const path  = findPath(state, entity.pos.x, entity.pos.y, nearX, nearY);
      cmd.chasePath     = path ?? [];
      cmd.chasePathTick = state.tick;
    }

    if (cmd.chasePath.length > 0) {
      const next = cmd.chasePath.shift()!;
      entity.pos.x = next.x;
      entity.pos.y = next.y;
    }
  }
}
