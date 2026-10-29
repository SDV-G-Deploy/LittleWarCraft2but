/**
 * objectives.ts
 * First-match guidance: a short checklist of steps that walks a new player
 * from "one idle worker" to "destroy the enemy base".
 *
 * Pure, read-only over GameState: the tracker never mutates the simulation.
 */

import type { GameState, Vec2 } from '../types';
import { isUnitKind, isWorkerKind } from '../types';

export type ObjectiveId =
  | 'gather'
  | 'train_worker'
  | 'gather_wood'
  | 'build_farm'
  | 'build_barracks'
  | 'train_army'
  | 'destroy_enemy';

export const OBJECTIVE_ORDER: readonly ObjectiveId[] = [
  'gather',
  'train_worker',
  'gather_wood',
  'build_farm',
  'build_barracks',
  'train_army',
  'destroy_enemy',
];

/** Army size the "train_army" step asks for. */
export const ARMY_GOAL = 4;

export interface ObjectiveTracker {
  done: Set<ObjectiveId>;
}

export interface ObjectiveView {
  id: ObjectiveId;
  done: boolean;
  /** true for the first not-yet-done step (the one to highlight). */
  current: boolean;
  /** Optional progress counter, e.g. army 2/4. */
  progress?: { value: number; goal: number };
}

export function createObjectiveTracker(): ObjectiveTracker {
  return { done: new Set() };
}

interface OwnerCounts {
  workers: number;
  military: number;
  gathering: boolean;
  choppingWood: boolean;
  farms: number;
  barracks: number;
}

function countOwner(state: GameState, owner: 0 | 1): OwnerCounts {
  const c: OwnerCounts = { workers: 0, military: 0, gathering: false, choppingWood: false, farms: 0, barracks: 0 };
  for (const e of state.entities) {
    if (e.owner !== owner) continue;
    if (isUnitKind(e.kind)) {
      if (isWorkerKind(e.kind)) {
        c.workers++;
        if (e.cmd?.type === 'gather' || (e.carryGold ?? 0) > 0 || (e.carryWood ?? 0) > 0) c.gathering = true;
        if ((e.cmd?.type === 'gather' && e.cmd.resourceType === 'wood') || (e.carryWood ?? 0) > 0) c.choppingWood = true;
      } else {
        c.military++;
      }
    } else if (e.kind === 'farm') {
      c.farms++;
    } else if (e.kind === 'barracks') {
      c.barracks++;
    }
  }
  return c;
}

/**
 * Update the tracker from the current state and return the checklist view.
 * Steps, once completed, stay completed (losing your farm later does not
 * un-tick "build a farm").
 */
export function updateObjectives(
  tracker: ObjectiveTracker,
  state: GameState,
  owner: 0 | 1,
  result: 'playing' | 'win' | 'lose' = 'playing',
): ObjectiveView[] {
  const c = countOwner(state, owner);
  if (c.gathering) tracker.done.add('gather');
  if (c.workers >= 2) tracker.done.add('train_worker');
  if (c.choppingWood) tracker.done.add('gather_wood');
  if (c.farms >= 1) tracker.done.add('build_farm');
  if (c.barracks >= 1) tracker.done.add('build_barracks');
  if (c.military >= ARMY_GOAL) tracker.done.add('train_army');
  if (result === 'win') tracker.done.add('destroy_enemy');

  let currentAssigned = false;
  return OBJECTIVE_ORDER.map((id) => {
    const done = tracker.done.has(id);
    const current = !done && !currentAssigned;
    if (current) currentAssigned = true;
    const view: ObjectiveView = { id, done, current };
    if (id === 'train_army' && !done) view.progress = { value: Math.min(c.military, ARMY_GOAL), goal: ARMY_GOAL };
    return view;
  });
}

/** Ids of the owner's workers with no command (e.g. after a mine runs dry). */
export function idleWorkerIds(state: GameState, owner: 0 | 1): number[] {
  const ids: number[] = [];
  for (const e of state.entities) {
    if (e.owner === owner && isWorkerKind(e.kind) && !e.cmd) ids.push(e.id);
  }
  return ids;
}

/** True once every setup step (everything before "destroy_enemy") is done. */
export function setupComplete(tracker: ObjectiveTracker): boolean {
  return OBJECTIVE_ORDER.every((id) => id === 'destroy_enemy' || tracker.done.has(id));
}

export type CompassDir = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

/** Rough compass direction from `from` to `to` (screen coords: +y is south). */
export function compassDirection(from: Vec2, to: Vec2): CompassDir {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return 'n';
  // atan2 with north = 0, clockwise positive.
  const angle = (Math.atan2(dx, -dy) * 180) / Math.PI; // -180..180
  const norm = (angle + 360) % 360;
  const dirs: CompassDir[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
  return dirs[Math.round(norm / 45) % 8];
}
