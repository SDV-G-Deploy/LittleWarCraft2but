/**
 * match-stats.ts
 * Read-only match statistics for the end-of-match screen.
 *
 * The tracker only *observes* GameState (entity set diffing + resource deltas);
 * it never mutates simulation state, so it cannot affect determinism.
 */

import type { EntityKind, GameState } from '../types';
import { isUnitKind, isWorkerKind, SIM_HZ } from '../types';

/** Building kinds that count for "built" / "destroyed" stats. */
const STAT_BUILDING_KINDS = new Set<EntityKind>([
  'townhall', 'barracks', 'lumbermill', 'farm', 'tower', 'wall',
]);

export interface SideStats {
  unitsTrained: number;
  workersTrained: number;
  militaryTrained: number;
  unitsLost: number;
  buildingsBuilt: number;
  buildingsLost: number;
  goldMined: number;
  woodHarvested: number;
  peakArmy: number;
}

export interface MatchStats {
  sides: [SideStats, SideStats];
  startTick: number;
  lastTick: number;
  /** id → {owner, kind} for every tracked owned entity seen last observation. */
  known: Map<number, { owner: 0 | 1; kind: EntityKind }>;
}

function emptySide(): SideStats {
  return {
    unitsTrained: 0,
    workersTrained: 0,
    militaryTrained: 0,
    unitsLost: 0,
    buildingsBuilt: 0,
    buildingsLost: 0,
    goldMined: 0,
    woodHarvested: 0,
    peakArmy: 0,
  };
}

function isTracked(kind: EntityKind): boolean {
  return isUnitKind(kind) || STAT_BUILDING_KINDS.has(kind);
}

function ownerIndex(owner: number): 0 | 1 | null {
  return owner === 0 || owner === 1 ? owner : null;
}

/**
 * Create a tracker. Call it *after* the starting units/buildings are spawned so
 * they are treated as the baseline rather than as "trained"/"built".
 */
export function createMatchStats(state: GameState): MatchStats {
  const stats: MatchStats = {
    sides: [emptySide(), emptySide()],
    startTick: state.tick,
    lastTick: state.tick,
    known: new Map(),
  };
  for (const e of state.entities) {
    const owner = ownerIndex(e.owner);
    if (owner === null || !isTracked(e.kind)) continue;
    stats.known.set(e.id, { owner, kind: e.kind });
  }
  updatePeakArmy(stats, state);
  return stats;
}

function updatePeakArmy(stats: MatchStats, state: GameState): void {
  const army: [number, number] = [0, 0];
  for (const e of state.entities) {
    const owner = ownerIndex(e.owner);
    if (owner === null) continue;
    if (isUnitKind(e.kind) && !isWorkerKind(e.kind)) army[owner]++;
  }
  for (const o of [0, 1] as const) {
    if (army[o] > stats.sides[o].peakArmy) stats.sides[o].peakArmy = army[o];
  }
}

/** Record resources gathered (positive deltas only). */
export function recordIncome(stats: MatchStats, owner: 0 | 1, gold: number, wood: number): void {
  if (gold > 0) stats.sides[owner].goldMined += gold;
  if (wood > 0) stats.sides[owner].woodHarvested += wood;
}

/**
 * Snapshot resources, run `step` (the sim phase that deposits gathered
 * resources), and record the positive change as income.
 */
export function measureIncome(stats: MatchStats, state: GameState, step: () => void): void {
  const g0 = state.gold[0]; const g1 = state.gold[1];
  const w0 = state.wood[0]; const w1 = state.wood[1];
  step();
  recordIncome(stats, 0, state.gold[0] - g0, state.wood[0] - w0);
  recordIncome(stats, 1, state.gold[1] - g1, state.wood[1] - w1);
}

/** Diff the entity set against the previous observation. Call once per sim tick. */
export function observeMatchTick(stats: MatchStats, state: GameState): void {
  const seen = new Set<number>();
  for (const e of state.entities) {
    const owner = ownerIndex(e.owner);
    if (owner === null || !isTracked(e.kind)) continue;
    seen.add(e.id);
    if (stats.known.has(e.id)) continue;
    stats.known.set(e.id, { owner, kind: e.kind });
    const side = stats.sides[owner];
    if (isUnitKind(e.kind)) {
      side.unitsTrained++;
      if (isWorkerKind(e.kind)) side.workersTrained++;
      else side.militaryTrained++;
    } else {
      side.buildingsBuilt++;
    }
  }
  for (const [id, info] of stats.known) {
    if (seen.has(id)) continue;
    stats.known.delete(id);
    const side = stats.sides[info.owner];
    if (isUnitKind(info.kind)) side.unitsLost++;
    else side.buildingsLost++;
  }
  updatePeakArmy(stats, state);
  stats.lastTick = state.tick;
}

export function matchDurationSeconds(stats: MatchStats): number {
  return Math.max(0, Math.floor((stats.lastTick - stats.startTick) / SIM_HZ));
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}
