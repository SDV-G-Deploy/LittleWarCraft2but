import type { Entity, GameState } from '../types';
import { SIM_HZ, isUnitKind, isRangedUnit } from '../types';
import { STATS, ticksPerStep } from '../data/units';
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

    // Check if this intermediate tile holds a blocking building
    for (const e of state.entities) {
      if (isUnitKind(e.kind) || e.kind === 'wall' || e.kind === 'goldmine') continue;
      if (x >= e.pos.x && x < e.pos.x + e.tileW &&
          y >= e.pos.y && y < e.pos.y + e.tileH) {
        return false;
      }
    }
  }
  return true;
}

// ─── Process ─────────────────────────────────────────────────────────────────

export function processAttack(state: GameState, entity: Entity): void {
  if (!entity.cmd || entity.cmd.type !== 'attack') return;
  const cmd = entity.cmd;

  const target = getEntity(state, cmd.targetId);
  if (!target) { entity.cmd = null; return; }

  // Ranged units (archer, troll) only fight mobile units — not buildings or walls
  if (isRangedUnit(entity.kind) && !isUnitKind(target.kind)) { entity.cmd = null; return; }

  const stats  = STATS[entity.kind];
  const range  = stats?.range ?? 1;
  const dist   = distToEntity(entity.pos.x, entity.pos.y, target);
  const losOk  = range <= 1 || hasLOS(state, entity.pos.x, entity.pos.y, target.pos.x, target.pos.y);

  const myTownHall = state.entities.find(e => e.owner === entity.owner && e.kind === 'townhall');
  const enemyTownHall = state.entities.find(e => e.owner !== entity.owner && e.kind === 'townhall');
  const nearContestedMine = target.kind === 'goldmine' ? false : state.entities.some(e => {
    if (e.kind !== 'goldmine' || (e.goldReserve ?? 0) <= 0) return false;
    const myDist = myTownHall ? Math.hypot(e.pos.x - myTownHall.pos.x, e.pos.y - myTownHall.pos.y) : Infinity;
    const enemyDist = enemyTownHall ? Math.hypot(e.pos.x - enemyTownHall.pos.x, e.pos.y - enemyTownHall.pos.y) : Infinity;
    const isContested = (e.pos.x > 16 && e.pos.x < 48) || Math.abs(myDist - enemyDist) <= 8;
    if (!isContested) return false;
    const targetCx = target.pos.x + target.tileW / 2;
    const targetCy = target.pos.y + target.tileH / 2;
    const mineCx = e.pos.x + e.tileW / 2;
    const mineCy = e.pos.y + e.tileH / 2;
    return Math.hypot(targetCx - mineCx, targetCy - mineCy) <= 7;
  });

  if (dist <= range && losOk) {
    // ── In range with LOS: attack ───────────────────────────────────────────
    cmd.chasePath = [];
    if (state.tick < cmd.cooldownTick) return;

    const dmg       = stats?.damage ?? 0;
    const armor     = target.statArmor ?? STATS[target.kind]?.armor ?? 0;
    const workerPressureBonus = !isUnitKind(entity.kind) ? 0 : (target.kind === 'worker' || target.kind === 'peon') ? 1 : 0;
    const constructionPressureBonus = target.kind === 'construction' ? 1 : 0;
    const contestedMinePressureBonus = nearContestedMine && state.tick <= state.contestedMineBonusUntilTick && isUnitKind(entity.kind) ? 1 : 0;
    const openingPressureBonus = entity.openingPlan === 'pressure' && isUnitKind(entity.kind) && state.tick <= SIM_HZ * 18 ? 1 : 0;
    const netDmg    = Math.max(1, dmg - armor + workerPressureBonus + constructionPressureBonus + contestedMinePressureBonus + openingPressureBonus);
    target.hp      -= netDmg;
    target.underAttackTick = state.tick;
    cmd.cooldownTick = state.tick + (STATS[entity.kind]?.attackTicks ?? SIM_HZ);

    if (target.hp <= 0) {
      state.corpses.push({ pos: { ...target.pos }, owner: target.owner, deadTick: state.tick });
      killEntity(state, target.id);
      entity.cmd = null;
    }
  } else {
    // ── Out of range or no LOS: chase toward nearest footprint tile ─────────
    const tps = ticksPerStep(entity.kind);
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
