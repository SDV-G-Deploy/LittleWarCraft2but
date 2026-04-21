import type { Entity, GameState, ProjectileVisualEvent } from '../types';
import { MAP_H, MAP_W, SIM_HZ, isUnitKind, isRangedUnit, canAttack, usesRaceProfile } from '../types';
import { getEntity } from './entities';
import { ticksPerStep } from '../data/units';
import { getResolvedArmor, getResolvedAttackTicks, getResolvedDamage, getResolvedRange, getResolvedSpeed, resolveEntityStats } from '../balance/resolver';
import { resolveAttackBonus } from '../balance/modifiers';
import { getDoctrineArmorBonus, getDoctrineRangeBonus } from '../balance/doctrines';
import { killEntity } from './entities';
import { findPath } from './pathfinding';

// ─── Issue ────────────────────────────────────────────────────────────────────

export function issueAttackCommand(entity: Entity, targetId: number, currentTick: number, state?: GameState): boolean {
  const target = state ? getEntity(state, targetId) : undefined;
  if (target) {
    if (target.kind === 'goldmine') return false;
    if (!canAttack(entity.owner, target.owner)) return false;
  }

  const existingAttack = entity.cmd?.type === 'attack' ? entity.cmd : null;

  entity.cmd = {
    type: 'attack',
    targetId,
    // Preserve fire cadence across re-issue (same-target spam and retarget).
    cooldownTick: existingAttack?.cooldownTick ?? 0,
    chasePath: [],
    chasePathTick: currentTick, // align movement cadence to now, not epoch
    chaseStepTick: currentTick,
  };
  return true;
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

/**
 * Chebyshev distance between attacker and target footprints.
 * Falls back to point→footprint when attacker is 1×1.
 */
function distBetweenEntities(attacker: Entity, target: Entity): number {
  const ax0 = attacker.pos.x;
  const ay0 = attacker.pos.y;
  const ax1 = attacker.pos.x + attacker.tileW - 1;
  const ay1 = attacker.pos.y + attacker.tileH - 1;

  const tx0 = target.pos.x;
  const ty0 = target.pos.y;
  const tx1 = target.pos.x + target.tileW - 1;
  const ty1 = target.pos.y + target.tileH - 1;

  const nx = Math.max(tx0, Math.min(ax0, tx1));
  const ny = Math.max(ty0, Math.min(ay0, ty1));
  const mx = Math.max(ax0, Math.min(tx0, ax1));
  const my = Math.max(ay0, Math.min(ty0, ay1));
  return chebyshev(nx, ny, mx, my);
}

export function isTargetAttackableNow(state: GameState, attacker: Entity, target: Entity): boolean {
  const race = usesRaceProfile(attacker.owner) ? state.races[attacker.owner] : null;
  const resolved = resolveEntityStats(attacker.kind, race);
  const owner = attacker.owner as 0 | 1;
  const range = resolved.range + (usesRaceProfile(attacker.owner) ? getDoctrineRangeBonus(state, owner, attacker.kind) : 0);
  if (distBetweenEntities(attacker, target) > range) return false;
  if (range <= 1) return true;
  if (!resolved.losPolicy?.requiresLOS) return true;
  return hasLOSToEntity(state, attacker, target, range);
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
function hasLOS(state: GameState, ax: number, ay: number, bx: number, by: number, attacker?: Entity): boolean {
  let x = ax, y = ay;
  const dx = Math.abs(bx - ax), dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
  let err = dx + dy;

  while (x !== bx || y !== by) {
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
    if (x === bx && y === by) break; // reached target tile — stop

    // Ignore tiles inside the attacker's own footprint.
    if (attacker &&
        x >= attacker.pos.x && x < attacker.pos.x + attacker.tileW &&
        y >= attacker.pos.y && y < attacker.pos.y + attacker.tileH) {
      continue;
    }

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
  for (let ay = attacker.pos.y; ay < attacker.pos.y + attacker.tileH; ay++) {
    for (let ax = attacker.pos.x; ax < attacker.pos.x + attacker.tileW; ax++) {
      for (let ty = target.pos.y; ty < target.pos.y + target.tileH; ty++) {
        for (let tx = target.pos.x; tx < target.pos.x + target.tileW; tx++) {
          if (chebyshev(ax, ay, tx, ty) > range) continue;
          if (hasLOS(state, ax, ay, tx, ty, attacker)) return true;
        }
      }
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

  const clearAttackState = () => {
    cmd.chasePath = [];
  };

  const target = getEntity(state, cmd.targetId);
  if (!target) {
    clearAttackState();
    entity.cmd = null;
    return;
  }

  const isStaticAttacker = getResolvedSpeed(entity.kind, usesRaceProfile(entity.owner) ? state.races[entity.owner] : null) === 0;
  if (isStaticAttacker && !isUnitKind(target.kind)) {
    clearAttackState();
    entity.cmd = null;
    return;
  }

  if (!canAttack(entity.owner, target.owner)) {
    clearAttackState();
    entity.cmd = null;
    return;
  }

  const attackerRace = usesRaceProfile(entity.owner) ? state.races[entity.owner] : null;
  const attackerStats = resolveEntityStats(entity.kind, attackerRace);
  const targetIsUnit = isUnitKind(target.kind);
  const targetIsWall = target.kind === 'wall';
  const targetIsBuilding =
    !targetIsUnit &&
    !targetIsWall &&
    target.kind !== 'goldmine' &&
    target.kind !== 'barrier';
  if (
    (targetIsUnit && !attackerStats.targetPolicy?.canAttackUnits) ||
    (targetIsWall && !attackerStats.targetPolicy?.canAttackWalls) ||
    (targetIsBuilding && !attackerStats.targetPolicy?.canAttackBuildings)
  ) {
    clearAttackState();
    entity.cmd = null;
    return;
  }

  if (isTargetAttackableNow(state, entity, target)) {
    // ── In range with LOS: attack ───────────────────────────────────────────
    cmd.chasePath = [];
    if (state.tick < cmd.cooldownTick) return;

    const dmg       = getResolvedDamage(entity.kind, usesRaceProfile(entity.owner) ? state.races[entity.owner] : null);
    const armor     = getResolvedArmor(target) + (usesRaceProfile(target.owner) ? getDoctrineArmorBonus(state, target.owner as 0 | 1, target.kind) : 0);
    const attackBonus = resolveAttackBonus({ state, attacker: entity, target });
    const netDmg    = Math.max(1, dmg - armor + attackBonus);
    pushAttackVisual(state, entity, target);
    target.hp      -= netDmg;
    target.underAttackTick = state.tick;
    cmd.cooldownTick = state.tick + getResolvedAttackTicks(entity.kind, usesRaceProfile(entity.owner) ? state.races[entity.owner] : null);

    if (target.hp <= 0) {
      state.corpses.push({ pos: { ...target.pos }, owner: target.owner, deadTick: state.tick });
      killEntity(state, target.id);
      clearAttackState();
      entity.cmd = null;
    }
  } else {
    if (isStaticAttacker) {
      clearAttackState();
      entity.cmd = null;
      return;
    }
    // ── Out of range or no LOS: chase toward nearest footprint tile ─────────
    const tps = ticksPerStep(entity.kind, usesRaceProfile(entity.owner) ? state.races[entity.owner] : null);
    if (state.tick - cmd.chaseStepTick < tps) return;

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
      cmd.chaseStepTick = state.tick;
    }
  }
}
