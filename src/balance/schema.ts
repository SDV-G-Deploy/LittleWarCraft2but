import type { EntityKind, Race } from '../types';

export interface CostProfile {
  gold: number;
}

export interface EntityBalanceStats {
  hp: number;
  damage: number;
  armor: number;
  range: number;
  speed: number;
  sight: number;
  cost: CostProfile;
  buildTicks: number;
  attackTicks: number;
  tileW: number;
  tileH: number;
}

export type EntityClass = 'unit' | 'building' | 'resource' | 'scaffold';

export interface EntityBlueprint extends EntityBalanceStats {
  kind: EntityKind;
  class: EntityClass;
  tags: string[];
  roleText?: string;
}

export type EntityStatOverride = Partial<EntityBalanceStats> & {
  cost?: Partial<CostProfile>;
};

export interface RaceIdentityUnitMap {
  worker: EntityKind;
  soldier: EntityKind;
  ranged: EntityKind;
  heavy: EntityKind;
}

export interface RaceDisplayProfile extends RaceIdentityUnitMap {
  name: string;
  workerLabel: string;
  soldierLabel: string;
  rangedLabel: string;
  heavyLabel: string;
  hallLabel: string;
  barrLabel: string;
  farmLabel: string;
  tagline: string;
  description: string;
  accentColor: string;
}

export interface RaceBalanceProfile {
  race: Race;
  display: RaceDisplayProfile;
  entityOverrides: Partial<Record<EntityKind, EntityStatOverride>>;
  identityNotes?: string[];
}

export interface ResolvedEntityStats extends EntityBalanceStats {
  kind: EntityKind;
  race: Race | null;
  class: EntityClass;
  tags: readonly string[];
  roleText?: string;
}
