/**
 * netcmd.ts
 * Serialisable game commands sent over the wire.
 * Each one maps 1-to-1 with a game action; peer applies them as owner=peerOwner.
 */

import type { EntityKind, GameState } from '../types';
import { isUnitKind, isWorkerKind } from '../types';
import { STATS } from '../data/units';
import { issueAttackCommand } from '../sim/combat';
import { issueGatherCommand, issueTrainCommand, issueBuildCommand, issueResumeBuildCommand } from '../sim/economy';
import { issueMoveCommand } from '../sim/commands';
import { killEntity } from '../sim/entities';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NetCmd =
  | { k: 'move';    ids: number[]; tx: number; ty: number; atk: boolean }
  | { k: 'attack';  ids: number[]; targetId: number }
  | { k: 'gather';  ids: number[]; mineId: number }
  | { k: 'train';   buildingId: number; unit: EntityKind }
  | { k: 'build';   workerId: number; building: EntityKind; tx: number; ty: number }
  | { k: 'stop';    ids: number[] }
  | { k: 'rally';   buildingId: number; tx: number; ty: number }
  | { k: 'demolish';buildingId: number }
  | { k: 'resume';  workerId: number; siteId: number };

export interface TickPacket {
  tick: number;
  cmds: NetCmd[];
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
        for (const id of cmd.ids) {
          const e = state.entities.find(en => en.id === id && en.owner === owner && isUnitKind(en.kind));
          if (e) issueMoveCommand(state, e, cmd.tx, cmd.ty, cmd.atk);
        }
        break;
      }
      case 'attack': {
        for (const id of cmd.ids) {
          const e = state.entities.find(en => en.id === id && en.owner === owner && isUnitKind(en.kind));
          if (e) issueAttackCommand(e, cmd.targetId, state.tick);
        }
        break;
      }
      case 'gather': {
        for (const id of cmd.ids) {
          const e = state.entities.find(en => en.id === id && en.owner === owner && isWorkerKind(en.kind));
          if (e) issueGatherCommand(e, cmd.mineId, state.tick);
        }
        break;
      }
      case 'train': {
        const b = state.entities.find(en => en.id === cmd.buildingId && en.owner === owner);
        if (b) issueTrainCommand(state, b, cmd.unit);
        break;
      }
      case 'build': {
        const w = state.entities.find(en => en.id === cmd.workerId && en.owner === owner && isWorkerKind(en.kind));
        if (w) issueBuildCommand(state, w, cmd.building, { x: cmd.tx, y: cmd.ty }, state.tick);
        break;
      }
      case 'stop': {
        for (const id of cmd.ids) {
          const e = state.entities.find(en => en.id === id && en.owner === owner);
          if (e) e.cmd = null;
        }
        break;
      }
      case 'rally': {
        const b = state.entities.find(en => en.id === cmd.buildingId && en.owner === owner);
        if (b) b.rallyPoint = { x: cmd.tx, y: cmd.ty };
        break;
      }
      case 'demolish': {
        const b = state.entities.find(
          en => en.id === cmd.buildingId && en.owner === owner &&
                !isUnitKind(en.kind) && en.kind !== 'goldmine',
        );
        if (b) {
          // Construction sites refund 100% (no work was wasted); finished buildings 80%
          const srcKind  = b.kind === 'construction' ? (b.constructionOf ?? b.kind) : b.kind;
          const refundPct = b.kind === 'construction' ? 1.0 : 0.8;
          state.gold[owner] += Math.floor((STATS[srcKind]?.cost ?? 0) * refundPct);
          killEntity(state, b.id);
        }
        break;
      }
      case 'resume': {
        const w = state.entities.find(en =>
          en.id === cmd.workerId && en.owner === owner && isWorkerKind(en.kind));
        const s = state.entities.find(en =>
          en.id === cmd.siteId && en.owner === owner && en.kind === 'construction');
        if (w && s) issueResumeBuildCommand(w, s, state.tick);
        break;
      }
    }
  }
}
