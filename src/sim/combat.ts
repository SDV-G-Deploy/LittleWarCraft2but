import type { Entity, GameState, ProjectileVisualEvent } from '../types';
import { MAP_H, MAP_W, SIM_HZ, isUnitKind, isRangedUnit, canAttack, usesRaceProfile } from '../types';
import { getEntity } from './entities';
import { ticksPerStep } from '../data/units';
import { getResolvedArmor, getResolvedAttackTicks, getResolvedDamage, getResolvedRange, getResolvedSpeed, resolveEntityStats } from '../balance/resolver';
import { resolveAttackBonus } from '../balance/modifiers';
import { getDoctrineArmorBonus, getDoctrineRangeBonus } from '../balance/doctrines';
import { killEntity } from './entities';
import { isTileBlockedByEntity } from './entities';
import { findPath } from './pathfinding';
import { findFlowFieldPath } from './nav/flow-field';
import { createFlowFieldCache } from './nav/flow-field-cache';
import { tryAdvancePathWithAvoidance } from './movement';

const combatFlowFieldCache = createFlowFieldCache();

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

function isTileOccupiedByOtherUnit(state: GameState, entity: Entity, tx: number, ty: number): boolean {
  return state.entities.some(other =>
    other.id !== entity.id &&
    isUnitKind(other.kind) &&
    other.pos.x === tx &&
    other.pos.y === ty,
  );
}

function collectRingTiles(state: GameState, target: Entity, ringDist: number): { x: number; y: number }[] {
  const minX = Math.max(0, target.pos.x - ringDist);
  const maxX = Math.min(MAP_W - 1, target.pos.x + target.tileW - 1 + ringDist);
  const minY = Math.max(0, target.pos.y - ringDist);
  const maxY = Math.min(MAP_H - 1, target.pos.y + target.tileH - 1 + ringDist);

  const out: { x: number; y: number }[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (distToEntity(x, y, target) !== ringDist) continue;
      if (!state.tiles[y]?.[x]?.passable) continue;
      if (isTileBlockedByEntity(state, x, y)) continue;
      out.push({ x, y });
    }
  }
  return out;
}

function isMeleeAttacker(state: GameState, entity: Entity): boolean {
  const race = usesRaceProfile(entity.owner) ? state.races[entity.owner] : null;
  return resolveEntityStats(entity.kind, race).range <= 1;
}

function tileKey(x: number, y: number): number {
  return y * MAP_W + x;
}

function pickAssignedSlot(
  attacker: Entity,
  target: Entity,
  candidates: { x: number; y: number }[],
  reserved: Set<number>,
  occupiedByUnit: Map<number, number>,
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestScore = Infinity;
  const preferred = attacker.cmd?.type === 'attack' ? attacker.cmd.contactSlot : undefined;

  for (const c of candidates) {
    const key = tileKey(c.x, c.y);
    const unitIdOnTile = occupiedByUnit.get(key);
    if (unitIdOnTile !== undefined && unitIdOnTile !== attacker.id) continue;
    if (reserved.has(key)) continue;

    const travelDist = chebyshev(attacker.pos.x, attacker.pos.y, c.x, c.y);
    const stickyBonus = preferred && preferred.x === c.x && preferred.y === c.y ? -25 : 0;
    const tie = Math.abs((c.x * 31 + c.y * 17 + attacker.id * 13) % 7);
    const score = travelDist * 100 + distToEntity(c.x, c.y, target) * 10 + tie + stickyBonus;

    if (!best || score < bestScore) {
      best = c;
      bestScore = score;
    }
  }

  return best;
}

let cachedMeleeAssignmentsTick = -1;
const cachedMeleeAssignmentsByTarget = new Map<number, Map<number, { x: number; y: number }>>();

function computeMeleeApproachAssignments(state: GameState, target: Entity): Map<number, { x: number; y: number }> {
  if (cachedMeleeAssignmentsTick !== state.tick) {
    cachedMeleeAssignmentsTick = state.tick;
    cachedMeleeAssignmentsByTarget.clear();
  }

  const fromCache = cachedMeleeAssignmentsByTarget.get(target.id);
  if (fromCache) return fromCache;

  const attackers = state.entities
    .filter(entity =>
      isUnitKind(entity.kind) &&
      entity.cmd?.type === 'attack' &&
      entity.cmd.targetId === target.id &&
      isMeleeAttacker(state, entity),
    )
    .sort((a, b) => a.id - b.id);

  const contact = collectRingTiles(state, target, 1);
  const staging = collectRingTiles(state, target, 2);
  const reserved = new Set<number>();
  const occupiedByUnit = new Map<number, number>();
  for (const e of state.entities) {
    if (!isUnitKind(e.kind)) continue;
    occupiedByUnit.set(tileKey(e.pos.x, e.pos.y), e.id);
  }

  const assignments = new Map<number, { x: number; y: number }>();
  for (const attacker of attackers) {
    const chosenContact = pickAssignedSlot(attacker, target, contact, reserved, occupiedByUnit);
    if (chosenContact) {
      const key = tileKey(chosenContact.x, chosenContact.y);
      reserved.add(key);
      assignments.set(attacker.id, chosenContact);
      if (attacker.cmd?.type === 'attack') attacker.cmd.contactSlot = { ...chosenContact };
      continue;
    }

    const chosenStaging = pickAssignedSlot(attacker, target, staging, reserved, occupiedByUnit);
    if (chosenStaging) {
      const key = tileKey(chosenStaging.x, chosenStaging.y);
      reserved.add(key);
      assignments.set(attacker.id, chosenStaging);
      if (attacker.cmd?.type === 'attack') attacker.cmd.contactSlot = undefined;
    }
  }

  cachedMeleeAssignmentsByTarget.set(target.id, assignments);
  return assignments;
}

function pickChaseGoal(state: GameState, attacker: Entity, target: Entity, range: number): { x: number; y: number } {
  if (range <= 1 && isUnitKind(attacker.kind)) {
    const assignments = computeMeleeApproachAssignments(state, target);
    const assigned = assignments.get(attacker.id);
    if (assigned) return assigned;
  }

  const minX = Math.max(0, target.pos.x - range);
  const maxX = Math.min(MAP_W - 1, target.pos.x + target.tileW - 1 + range);
  const minY = Math.max(0, target.pos.y - range);
  const maxY = Math.min(MAP_H - 1, target.pos.y + target.tileH - 1 + range);

  let best: { x: number; y: number } | null = null;
  let bestScore = Infinity;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!state.tiles[y]?.[x]?.passable) continue;
      if (distToEntity(x, y, target) > range) continue;

      const occupiedByOther = state.entities.some(e =>
        e.id !== attacker.id &&
        isUnitKind(e.kind) &&
        e.pos.x === x &&
        e.pos.y === y,
      );

      let friendlyPressure = 0;
      for (const e of state.entities) {
        if (e.id === attacker.id || e.owner !== attacker.owner || !isUnitKind(e.kind)) continue;
        if (Math.max(Math.abs(e.pos.x - x), Math.abs(e.pos.y - y)) > 1) continue;
        if (e.cmd?.type === 'attack' && e.cmd.targetId === target.id) friendlyPressure += 2;
        else friendlyPressure += 1;
      }

      const travelDist = chebyshev(attacker.pos.x, attacker.pos.y, x, y);
      const edgeDist = distToEntity(x, y, target);
      const tieSpread = (Math.abs(x * 31 + y * 17 + attacker.id * 13) % 7);
      const score =
        (occupiedByOther ? 100000 : 0) +
        travelDist * 100 +
        edgeDist * 10 +
        friendlyPressure * 3 +
        tieSpread;

      if (!best || score < bestScore) {
        best = { x, y };
        bestScore = score;
      }
    }
  }

  if (best) return best;

  return {
    x: Math.max(target.pos.x, Math.min(attacker.pos.x, target.pos.x + target.tileW - 1)),
    y: Math.max(target.pos.y, Math.min(attacker.pos.y, target.pos.y + target.tileH - 1)),
  };
}

function findCombatChasePath(
  state: GameState,
  entity: Entity,
  goal: { x: number; y: number },
): { x: number; y: number }[] | null {
  const flowPath = findFlowFieldPath(state, entity.pos.x, entity.pos.y, goal.x, goal.y, combatFlowFieldCache);
  if (flowPath && (flowPath.length > 0 || (entity.pos.x === goal.x && entity.pos.y === goal.y))) {
    return flowPath;
  }

  const fallbackPath = findPath(state, entity.pos.x, entity.pos.y, goal.x, goal.y);
  return fallbackPath;
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
    cmd.contactSlot = undefined;
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

    const owner = entity.owner as 0 | 1;
    const range = attackerStats.range + (usesRaceProfile(entity.owner) ? getDoctrineRangeBonus(state, owner, entity.kind) : 0);

    if (cmd.chasePath.length === 0 || state.tick - cmd.chasePathTick >= SIM_HZ) {
      const chaseGoal = pickChaseGoal(state, entity, target, range);
      const chasePath = findCombatChasePath(state, entity, chaseGoal);
      cmd.chasePath = chasePath ?? [];
      cmd.chasePathTick = state.tick;
    }

    if (cmd.chasePath.length > 0) {
      const tryRepath = (): { x: number; y: number }[] | null => {
        const chaseGoal = pickChaseGoal(state, entity, target, range);
        const chasePath = findCombatChasePath(state, entity, chaseGoal);
        cmd.chasePathTick = state.tick;
        return chasePath;
      };

      const chaseGoal = pickChaseGoal(state, entity, target, range);
      const stepResult = tryAdvancePathWithAvoidance(state, entity, cmd.chasePath, chaseGoal, tryRepath);

      if (stepResult === 'moved' || stepResult === 'sidestep' || stepResult === 'repathed' || stepResult === 'blocked') {
        cmd.chaseStepTick = state.tick;
      }
    }
  }
}
