import type { EntityKind, GameState } from '../types';
import { isUnitKind } from '../types';
import { hasUpgradeGroup } from './resolver';

export type DoctrineChoice = 'fieldTempo' | 'lineHold' | 'longReach';

export const DOCTRINE_COST = { gold: 125, wood: 80 } as const;

export function getDoctrine(owner: 0 | 1, state: GameState): DoctrineChoice | null {
  return state.upgrades[owner].doctrine;
}

export function getDoctrineArmorBonus(state: GameState, owner: 0 | 1, kind: EntityKind): number {
  if (state.upgrades[owner].doctrine !== 'lineHold') return 0;
  const race = state.races[owner];
  return isUnitKind(kind) && hasUpgradeGroup(kind, race, 'military') ? 1 : 0;
}

export function getDoctrineRangeBonus(state: GameState, owner: 0 | 1, kind: EntityKind): number {
  if (state.upgrades[owner].doctrine !== 'longReach') return 0;
  const race = state.races[owner];
  return isUnitKind(kind) && hasUpgradeGroup(kind, race, 'ranged') ? 1 : 0;
}

export function applyDoctrineTrainTicks(state: GameState, owner: 0 | 1, kind: EntityKind, ticks: number): number {
  if (!isUnitKind(kind)) return ticks;
  const race = state.races[owner];
  if (state.upgrades[owner].doctrine !== 'fieldTempo') return ticks;
  if (!hasUpgradeGroup(kind, race, 'military')) return ticks;
  return Math.max(1, Math.round(ticks * 0.9));
}
