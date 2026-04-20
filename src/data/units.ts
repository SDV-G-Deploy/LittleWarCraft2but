import type { EntityKind, Race } from '../types';
import { BASE_ENTITY_BLUEPRINTS } from '../balance/base';
import { resolveEntityStats, ticksPerStepForResolved } from '../balance/resolver';

export interface UnitStats {
  hp: number;
  damage: number;
  armor: number;
  range: number;
  speed: number;
  sight: number;
  cost: number;
  woodCost: number;
  buildTicks: number;
  attackTicks: number;
  tileW: number;
  tileH: number;
}

function toUnitStats(kind: EntityKind): UnitStats {
  const base = BASE_ENTITY_BLUEPRINTS[kind];
  return {
    hp: base.hp,
    damage: base.damage,
    armor: base.armor,
    range: base.range,
    speed: base.speed,
    sight: base.sight,
    cost: base.cost.gold,
    woodCost: base.cost.wood,
    buildTicks: base.buildTicks,
    attackTicks: base.attackTicks,
    tileW: base.tileW,
    tileH: base.tileH,
  };
}

export const STATS: Partial<Record<EntityKind, UnitStats>> = Object.fromEntries(
  Object.keys(BASE_ENTITY_BLUEPRINTS).map((kind) => [kind, toUnitStats(kind as EntityKind)]),
) as Partial<Record<EntityKind, UnitStats>>;

export function getResolvedUnitStats(kind: EntityKind, race?: Race | null): UnitStats {
  const resolved = resolveEntityStats(kind, race);
  return {
    hp: resolved.hp,
    damage: resolved.damage,
    armor: resolved.armor,
    range: resolved.range,
    speed: resolved.speed,
    sight: resolved.sight,
    cost: resolved.cost.gold,
    woodCost: resolved.cost.wood,
    buildTicks: resolved.buildTicks,
    attackTicks: resolved.attackTicks,
    tileW: resolved.tileW,
    tileH: resolved.tileH,
  };
}

export function ticksPerStep(kind: EntityKind, race?: Race | null): number {
  return ticksPerStepForResolved(kind, race);
}
