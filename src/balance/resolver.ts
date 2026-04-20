import type { Entity, EntityKind, GameState, Owner, Race } from '../types';
import { SIM_HZ, usesRaceProfile } from '../types';
import { BASE_ENTITY_BLUEPRINTS } from './base';
import { RACE_BALANCE_PROFILES } from './races';
import type { EntityBalanceStats, EntityBlueprint, RaceBalanceProfile, ResolvedEntityStats } from './schema';
import { BALANCE_TUNING } from './tuning';

function mergeEntityStats(base: EntityBlueprint, override?: Partial<EntityBalanceStats> & { cost?: { gold?: number } }): EntityBalanceStats {
  return {
    hp: override?.hp ?? base.hp,
    damage: override?.damage ?? base.damage,
    armor: override?.armor ?? base.armor,
    range: override?.range ?? base.range,
    speed: override?.speed ?? base.speed,
    sight: override?.sight ?? base.sight,
    cost: {
      gold: override?.cost?.gold ?? base.cost.gold,
    },
    buildTicks: override?.buildTicks ?? base.buildTicks,
    attackTicks: override?.attackTicks ?? base.attackTicks,
    tileW: override?.tileW ?? base.tileW,
    tileH: override?.tileH ?? base.tileH,
    supplyProvided: override?.supplyProvided ?? base.supplyProvided,
  };
}

export function resolveRaceProfile(race: Race): RaceBalanceProfile {
  return RACE_BALANCE_PROFILES[race];
}

export function resolveEntityBlueprint(kind: EntityKind, race?: Race | null): EntityBlueprint {
  const base = BASE_ENTITY_BLUEPRINTS[kind];
  if (!base) throw new Error(`No base blueprint for ${kind}`);
  if (!race) return base;

  const profile = resolveRaceProfile(race);
  const raceOverride = profile.entityOverrides[kind];
  const tuningOverride = BALANCE_TUNING.races?.[race]?.[kind];
  const mergedStats = mergeEntityStats(
    {
      ...base,
      ...mergeEntityStats(base, raceOverride),
    },
    tuningOverride,
  );
  return {
    ...base,
    ...mergedStats,
    cost: mergedStats.cost,
  };
}

export function resolveEntityStats(kind: EntityKind, race?: Race | null): ResolvedEntityStats {
  const blueprint = resolveEntityBlueprint(kind, race);
  return {
    kind: blueprint.kind,
    race: race ?? null,
    class: blueprint.class,
    hp: blueprint.hp,
    damage: blueprint.damage,
    armor: blueprint.armor,
    range: blueprint.range,
    speed: blueprint.speed,
    sight: blueprint.sight,
    cost: blueprint.cost,
    buildTicks: blueprint.buildTicks,
    attackTicks: blueprint.attackTicks,
    tileW: blueprint.tileW,
    tileH: blueprint.tileH,
    supplyProvided: blueprint.supplyProvided,
    tags: blueprint.tags,
    roleText: blueprint.roleText,
  };
}

export function resolveEntityStatsForOwner(kind: EntityKind, races: [Race, Race], owner: Owner): ResolvedEntityStats {
  const race = usesRaceProfile(owner) ? (races[owner] ?? 'human') : null;
  return resolveEntityStats(kind, race);
}

export function resolveEntityStatsForEntity(state: GameState, entity: Entity): ResolvedEntityStats {
  const race = usesRaceProfile(entity.owner) ? (state.races[entity.owner] ?? 'human') : null;
  return resolveEntityStats(entity.kind, race);
}

export function applyResolvedStatsToEntity(entity: Entity, stats: ResolvedEntityStats): void {
  entity.tileW = stats.tileW;
  entity.tileH = stats.tileH;
  entity.sightRadius = stats.sight;
  entity.statHpMax = stats.hp;
  entity.statArmor = stats.armor;
}

export function getResolvedHpMax(entity: Entity): number {
  return entity.statHpMax ?? BASE_ENTITY_BLUEPRINTS[entity.kind].hp;
}

export function getResolvedArmor(entity: Entity): number {
  return entity.statArmor ?? BASE_ENTITY_BLUEPRINTS[entity.kind].armor;
}

export function getResolvedCost(kind: EntityKind, race?: Race | null): number {
  return resolveEntityStats(kind, race).cost.gold;
}

export function getResolvedBuildTicks(kind: EntityKind, race?: Race | null): number {
  return resolveEntityStats(kind, race).buildTicks;
}

export function getResolvedAttackTicks(kind: EntityKind, race?: Race | null): number {
  return resolveEntityStats(kind, race).attackTicks;
}

export function getResolvedRange(kind: EntityKind, race?: Race | null): number {
  return resolveEntityStats(kind, race).range;
}

export function getResolvedDamage(kind: EntityKind, race?: Race | null): number {
  return resolveEntityStats(kind, race).damage;
}

export function getResolvedSpeed(kind: EntityKind, race?: Race | null): number {
  return resolveEntityStats(kind, race).speed;
}

export function getResolvedTileSize(kind: EntityKind, race?: Race | null): { tileW: number; tileH: number } {
  const stats = resolveEntityStats(kind, race);
  return { tileW: stats.tileW, tileH: stats.tileH };
}

export function getResolvedSupplyProvided(kind: EntityKind, race?: Race | null): number {
  return resolveEntityStats(kind, race).supplyProvided ?? 0;
}

export function ticksPerStepForResolved(kind: EntityKind, race?: Race | null): number {
  const speed = resolveEntityStats(kind, race).speed;
  if (speed === 0) return Infinity;
  return Math.max(1, Math.round(SIM_HZ / speed));
}
