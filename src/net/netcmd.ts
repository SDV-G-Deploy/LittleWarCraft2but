/**
 * netcmd.ts
 * Serialisable game commands sent over the wire.
 * Each one maps 1-to-1 with a game action; peer applies them as owner=peerOwner.
 */

import type { EntityKind, GameState, OpeningPlan, Race } from '../types';
import { SIM_HZ, isUnitKind, isWorkerKind, areHostile } from '../types';
import { getResolvedCost } from '../balance/resolver';
import { RACE_BALANCE_PROFILES } from '../balance/races';
import { hasUpgradeGroup, resolveEntityStats } from '../balance/resolver';
import { DOCTRINE_COST } from '../balance/doctrines';
import { issueAttackCommand } from '../sim/combat';
import { issueGatherCommand, issueTrainCommand, issueBuildCommand, issueResumeBuildCommand, refundCancelledTrainCommand } from '../sim/economy';
import { issueMoveCommand } from '../sim/commands';
import { getEntity, killEntity } from '../sim/entities';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NetCmd =
  | { k: 'move';    ids: number[]; tx: number; ty: number; atk: boolean }
  | { k: 'attack';  ids: number[]; targetId: number }
  | { k: 'gather';  ids: number[]; mineId: number }
  | { k: 'train';   buildingId: number; unit: EntityKind }
  | { k: 'build';   workerId: number; building: EntityKind; tx: number; ty: number }
  | { k: 'stop';    ids: number[] }
  | { k: 'set_plan'; buildingId: number; plan: OpeningPlan }
  | { k: 'rally';   buildingId: number; tx: number; ty: number; plan?: OpeningPlan }
  | { k: 'demolish';buildingId: number }
  | { k: 'resume';  workerId: number; siteId: number }
  | { k: 'upgrade'; buildingId: number; upgrade: 'meleeAttack' | 'armor' | 'buildingHp' | 'doctrineFieldTempo' | 'doctrineLineHold' | 'doctrineLongReach' };

function getBuildingHpMultiplier(race: Race, level: number): number {
  return race === 'human' ? 1 + (level * 20) / 100 : 1 + (level * 10) / 100;
}

export interface TickPacket {
  tick: number;
  cmds: NetCmd[];
}

function sortUnitIds(ids: number[]): number[] {
  return [...ids].sort((a, b) => a - b);
}

function buildMoveSpreadOffsets(count: number): { x: number; y: number }[] {
  const offsets: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  if (count <= 1) return offsets;

  for (let r = 1; offsets.length < count; r++) {
    for (let x = -r + 1; x <= r && offsets.length < count; x++) {
      offsets.push({ x, y: -r });
    }
    for (let y = -r + 1; y <= r && offsets.length < count; y++) {
      offsets.push({ x: r, y });
    }
    for (let x = r - 1; x >= -r && offsets.length < count; x--) {
      offsets.push({ x, y: r });
    }
    for (let y = r - 1; y >= -r && offsets.length < count; y--) {
      offsets.push({ x: -r, y });
    }
  }

  return offsets;
}

function assignMoveDestinations(ids: number[], tx: number, ty: number): Map<number, { x: number; y: number }> {
  const assigned = new Map<number, { x: number; y: number }>();
  const sorted = sortUnitIds(ids);

  if (sorted.length <= 1) {
    if (sorted.length === 1) assigned.set(sorted[0], { x: tx, y: ty });
    return assigned;
  }

  const offsets = buildMoveSpreadOffsets(sorted.length);
  for (let i = 0; i < sorted.length; i++) {
    const offset = offsets[i] ?? { x: 0, y: 0 };
    assigned.set(sorted[i], { x: tx + offset.x, y: ty + offset.y });
  }

  return assigned;
}

function buildMoveFallbackDestinations(ids: number[], tx: number, ty: number): { x: number; y: number }[] {
  if (ids.length <= 1) return [];
  return buildMoveSpreadOffsets(9)
    .slice(1)
    .map(offset => ({ x: tx + offset.x, y: ty + offset.y }));
}

// ─── Apply ────────────────────────────────────────────────────────────────────

/** Apply a list of net commands as the given owner. */
export function applyNetCmds(
  state: GameState,
  cmds: NetCmd[],
  owner: 0 | 1,
): void {
  for (const cmd of cmds) {
    switch (cmd.k) {
      case 'move': {
        const destinations = assignMoveDestinations(cmd.ids, cmd.tx, cmd.ty);
        const fallbackDestinations = buildMoveFallbackDestinations(cmd.ids, cmd.tx, cmd.ty);
        for (const id of sortUnitIds(cmd.ids)) {
          const e = getEntity(state, id);
          if (!e || e.owner !== owner || !isUnitKind(e.kind)) continue;

          const primary = destinations.get(id) ?? { x: cmd.tx, y: cmd.ty };
          let issued = issueMoveCommand(state, e, primary.x, primary.y, cmd.atk);
          if (!issued) {
            issued = issueMoveCommand(state, e, cmd.tx, cmd.ty, cmd.atk);
          }
          if (!issued) {
            for (const fallback of fallbackDestinations) {
              issued = issueMoveCommand(state, e, fallback.x, fallback.y, cmd.atk);
              if (issued) break;
            }
          }
        }
        break;
      }
      case 'attack': {
        const target = getEntity(state, cmd.targetId);
        if (!target || target.kind === 'goldmine' || !areHostile(owner, target.owner)) break;
        for (const id of sortUnitIds(cmd.ids)) {
          const e = getEntity(state, id);
          if (e && e.owner === owner && isUnitKind(e.kind)) issueAttackCommand(e, cmd.targetId, state.tick, state);
        }
        break;
      }
      case 'gather': {
        for (const id of sortUnitIds(cmd.ids)) {
          const e = getEntity(state, id);
          if (e && e.owner === owner && isWorkerKind(e.kind)) issueGatherCommand(state, e, cmd.mineId, state.tick);
        }
        break;
      }
      case 'train': {
        const b = getEntity(state, cmd.buildingId);
        if (b && b.owner === owner) issueTrainCommand(state, b, cmd.unit);
        break;
      }
      case 'build': {
        const w = getEntity(state, cmd.workerId);
        if (w && w.owner === owner && isWorkerKind(w.kind)) issueBuildCommand(state, w, cmd.building, { x: cmd.tx, y: cmd.ty }, state.tick);
        break;
      }
      case 'stop': {
        for (const id of sortUnitIds(cmd.ids)) {
          const e = getEntity(state, id);
          if (!e || e.owner !== owner) continue;
          if (e.cmd?.type === 'train') {
            refundCancelledTrainCommand(state, e);
            continue;
          }
          e.cmd = null;
          (e as typeof e & { _gatherPath?: unknown; _buildPath?: unknown })._gatherPath = undefined;
          (e as typeof e & { _gatherPath?: unknown; _buildPath?: unknown })._buildPath = undefined;
        }
        break;
      }
      case 'set_plan': {
        const b = getEntity(state, cmd.buildingId);
        const canLockPlan = state.tick <= SIM_HZ * 10 && !state.openingPlanSelected[owner];
        if (b && b.owner === owner && (b.kind === 'townhall' || b.kind === 'barracks') && canLockPlan) {
          state.openingPlanSelected[owner] = cmd.plan;
          for (const en of state.entities) {
            if (en.owner === owner && (en.kind === 'townhall' || en.kind === 'barracks')) en.openingPlan = cmd.plan;
          }
        }
        break;
      }
      case 'rally': {
        const b = getEntity(state, cmd.buildingId);
        if (b && b.owner === owner) {
          b.rallyPoint = { x: cmd.tx, y: cmd.ty };
          if (cmd.plan && !state.openingPlanSelected[owner]) {
            state.openingPlanSelected[owner] = cmd.plan;
          }
        }
        break;
      }
      case 'demolish': {
        const b = getEntity(state, cmd.buildingId);
        if (!b || b.owner !== owner || isUnitKind(b.kind) || b.kind === 'goldmine') break;
        if (b.kind === 'construction') {
          for (const e of state.entities) {
            if (e.owner !== owner || e.cmd?.type !== 'build' || e.cmd.siteId !== b.id) continue;
            e.cmd = null;
            (e as typeof e & { _buildPath?: unknown })._buildPath = undefined;
          }
        }
        // Construction sites refund 100% (no work was wasted); finished buildings 80%
        const srcKind  = b.kind === 'construction' ? (b.constructionOf ?? b.kind) : b.kind;
        const refundPct = b.kind === 'construction' ? 1.0 : 0.8;
        const refund = getResolvedCost(srcKind, state.races[owner]);
        state.gold[owner] += Math.floor(refund.gold * refundPct);
        state.wood[owner] += Math.floor(refund.wood * refundPct);
        killEntity(state, b.id);
        break;
      }
      case 'resume': {
        const w = getEntity(state, cmd.workerId);
        const s = getEntity(state, cmd.siteId);
        if (w && s && w.owner === owner && s.owner === owner && isWorkerKind(w.kind) && s.kind === 'construction') {
          issueResumeBuildCommand(w, s, state.tick);
        }
        break;
      }
      case 'upgrade': {
        const b = getEntity(state, cmd.buildingId);
        if (!b || b.owner !== owner || b.kind !== 'lumbermill') break;
        const upgrades = state.upgrades[owner];
        if (cmd.upgrade === 'doctrineFieldTempo' || cmd.upgrade === 'doctrineLineHold' || cmd.upgrade === 'doctrineLongReach') {
          if (upgrades.doctrine) break;
          if (state.gold[owner] < DOCTRINE_COST.gold || state.wood[owner] < DOCTRINE_COST.wood) break;
          state.gold[owner] -= DOCTRINE_COST.gold;
          state.wood[owner] -= DOCTRINE_COST.wood;
          upgrades.doctrine = cmd.upgrade === 'doctrineFieldTempo'
            ? 'fieldTempo'
            : cmd.upgrade === 'doctrineLineHold'
              ? 'lineHold'
              : 'longReach';
          break;
        }
        const race = state.races[owner];
        const defs = RACE_BALANCE_PROFILES[race].upgrades;
        const config = cmd.upgrade === 'meleeAttack' ? defs.meleeAttack : cmd.upgrade === 'armor' ? defs.armor : defs.buildingHp;
        const levelKey = cmd.upgrade === 'meleeAttack' ? 'meleeAttackLevel' : cmd.upgrade === 'armor' ? 'armorLevel' : 'buildingHpLevel';
        const currentLevel = upgrades[levelKey];
        if (currentLevel >= config.maxLevel) break;
        const cost = config.cost;
        if (state.gold[owner] < cost.gold || state.wood[owner] < cost.wood) break;
        state.gold[owner] -= cost.gold;
        state.wood[owner] -= cost.wood;
        upgrades[levelKey] = currentLevel + 1;
        if (cmd.upgrade === 'buildingHp') {
          const prevMult = getBuildingHpMultiplier(race, currentLevel);
          const nextMult = getBuildingHpMultiplier(race, currentLevel + 1);
          for (const e of state.entities) {
            if (e.owner !== owner || e.kind === 'goldmine' || isUnitKind(e.kind)) continue;
            const baseMax = Math.round(e.hpMax / prevMult);
            const nextMax = Math.round(baseMax * nextMult);
            const hpRatio = e.hpMax > 0 ? e.hp / e.hpMax : 1;
            e.hpMax = nextMax;
            e.hp = Math.round(nextMax * hpRatio);
            e.statHpMax = nextMax;
          }
        }
        if (cmd.upgrade === 'armor') {
          for (const e of state.entities) {
            if (e.owner !== owner || !isUnitKind(e.kind)) continue;
            if (!hasUpgradeGroup(e.kind, race, 'military')) continue;
            const baseArmor = resolveEntityStats(e.kind, race).armor;
            const perLevel = race === 'human' ? 2 : 1;
            e.statArmor = baseArmor + upgrades.armorLevel * perLevel;
          }
        }
        break;
      }
    }
  }
}
