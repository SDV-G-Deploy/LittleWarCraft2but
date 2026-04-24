import type { EntityKind, Race } from '../types';

export interface CostProfile {
  gold: number;
  wood: number;
}

export interface TargetPolicy {
  canAttackUnits: boolean;
  canAttackBuildings: boolean;
  canAttackWalls: boolean;
  canAttackResources?: boolean;
}

export interface LOSPolicy {
  requiresLOS: boolean;
  elevated?: boolean;
}

export interface AttackProfile {
  projectile?: boolean;
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
  supplyProvided?: number;
  targetPolicy?: TargetPolicy;
  losPolicy?: LOSPolicy;
  attackProfile?: AttackProfile;
  upgradeGroups?: readonly UpgradeGroup[];
}

export type EntityClass = 'unit' | 'building' | 'resource' | 'scaffold';

export type UpgradeGroup = 'military' | 'melee' | 'ranged' | 'building';

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
  towerLabel: string;
  tagline: string;
  description: string;
  accentColor: string;
  lumberMillLabel: string;
}

export interface UpgradeDefinition {
  id: 'meleeAttack' | 'armor' | 'buildingHp';
  label: string;
  perLevel: number;
  maxLevel: number;
  cost: CostProfile;
  appliesTo: UpgradeGroup[];
}

export interface RaceBalanceProfile {
  race: Race;
  display: RaceDisplayProfile;
  entityOverrides: Partial<Record<EntityKind, EntityStatOverride>>;
  upgrades: {
    meleeAttack: UpgradeDefinition;
    armor: UpgradeDefinition;
    buildingHp: UpgradeDefinition;
  };
  identityNotes?: string[];
}

export interface ResolvedEntityStats extends EntityBalanceStats {
  kind: EntityKind;
  race: Race | null;
  class: EntityClass;
  tags: readonly string[];
  upgradeGroups?: readonly UpgradeGroup[];
  roleText?: string;
}
