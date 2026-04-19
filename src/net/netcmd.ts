/**
 * netcmd.ts
 * Serialisable game commands sent over the wire.
 * Each one maps 1-to-1 with a game action; peer applies them as owner=peerOwner.
 */

import type { EntityKind, GameState, OpeningPlan } from '../types';
import { SIM_HZ, isUnitKind, isWorkerKind } from '../types';
import { STATS } from '../data/units';
import { issueAttackCommand } from '../sim/combat';
import { issueGatherCommand, issueTrainCommand, issueBuildCommand, issueResumeBuildCommand } from '../sim/economy';
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
  | { k: 'resume';  workerId: number; siteId: number };

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
  const offsets = buildMoveSpreadOffsets(sorted.length);

  for (let i = 0; i < sorted.length; i++) {
    const offset = offsets[i] ?? { x: 0, y: 0 };
    assigned.set(sorted[i], { x: tx + offset.x, y: ty + offset.y });
  }

  return assigned;
}

function buildMoveFallbackDestinations(tx: number, ty: number): { x: number; y: number }[] {
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
        const fallbackDestinations = buildMoveFallbackDestinations(cmd.tx, cmd.ty);
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
        for (const id of sortUnitIds(cmd.ids)) {
          const e = getEntity(state, id);
          if (e && e.owner === owner && isUnitKind(e.kind)) issueAttackCommand(e, cmd.targetId, state.tick);
        }
        break;
      }
      case 'gather': {
        for (const id of sortUnitIds(cmd.ids)) {
          const e = getEntity(state, id);
          if (e && e.owner === owner && isWorkerKind(e.kind)) issueGatherCommand(e, cmd.mineId, state.tick);
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
          if (e && e.owner === owner) e.cmd = null;
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
        // Construction sites refund 100% (no work was wasted); finished buildings 80%
        const srcKind  = b.kind === 'construction' ? (b.constructionOf ?? b.kind) : b.kind;
        const refundPct = b.kind === 'construction' ? 1.0 : 0.8;
        state.gold[owner] += Math.floor((STATS[srcKind]?.cost ?? 0) * refundPct);
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
    }
  }
}
