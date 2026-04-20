import type { Entity, OpeningPlan, Owner } from '../types';
import { SIM_HZ, isUnitKind, isWorkerKind } from '../types';

export interface OpeningPlanPresentation {
  title: string;
  body: string;
  risk: string;
  buttonLabel: string;
}

export interface OpeningPlanDefinition {
  id: OpeningPlan;
  description: string;
  lockTicks: number;
  eco?: {
    firstReturnBonusGold: number;
    gatherBonus: number;
    gatherBonusCap: number;
  };
  tempo?: {
    firstMilitaryTrainMultiplier: number;
  };
  pressure?: {
    firstMilitarySpeedBoostMult: number;
    firstMilitarySpeedBoostTicks: number;
    attackMoveCommit: boolean;
    forwardCommitTicks: number;
  };
  ui: OpeningPlanPresentation;
}

export const OPENING_PLAN_LOCK_TICKS = SIM_HZ * 10;

export const OPENING_PLAN_DEFINITIONS: Record<OpeningPlan, OpeningPlanDefinition> = {
  eco: {
    id: 'eco',
    description: 'First worker cash-in gives bonus gold and bigger first gather, with Human home-defense payoff.',
    lockTicks: OPENING_PLAN_LOCK_TICKS,
    eco: {
      firstReturnBonusGold: 20,
      gatherBonus: 2,
      gatherBonusCap: 3,
    },
    ui: {
      title: 'Economy opening',
      body: 'First worker cash-in gives +20 gold and a fatter first mining trip (Human: early home defense hits harder)',
      risk: 'Risk: give up initiative if pressure arrives first',
      buttonLabel: 'Eco\n1st worker trip pays +20g, gathers bigger',
    },
  },
  tempo: {
    id: 'tempo',
    description: 'First military unit trains faster for earlier field timing, with Human contested-mine timing payoff.',
    lockTicks: OPENING_PLAN_LOCK_TICKS,
    tempo: {
      firstMilitaryTrainMultiplier: 0.65,
    },
    ui: {
      title: 'Tempo opening',
      body: 'First military unit trains 35% faster once (Human: better early contested-mine timing fights)',
      risk: 'Risk: if timing whiffs, eco falls behind',
      buttonLabel: 'Tempo\n1st military trains 35% faster',
    },
  },
  pressure: {
    id: 'pressure',
    description: 'First military unit commits forward and gets early movement pressure.',
    lockTicks: OPENING_PLAN_LOCK_TICKS,
    pressure: {
      firstMilitarySpeedBoostMult: 1.2,
      firstMilitarySpeedBoostTicks: SIM_HZ * 5,
      attackMoveCommit: true,
      forwardCommitTicks: SIM_HZ * 18,
    },
    ui: {
      title: 'Pressure opening',
      body: 'First military unit attack-moves forward, gets +20% speed for 5s, and hits harder early',
      risk: 'Risk: fragile if you overextend without control',
      buttonLabel: 'Pressure\n1st military commits forward and hits harder',
    },
  },
};

export function getOpeningPlanDefinition(plan: OpeningPlan): OpeningPlanDefinition {
  return OPENING_PLAN_DEFINITIONS[plan];
}

export function getOpeningPlanLockTicks(): number {
  return OPENING_PLAN_LOCK_TICKS;
}

export function isOpeningWindowActive(currentTick: number): boolean {
  return currentTick <= OPENING_PLAN_LOCK_TICKS;
}

export function canClaimOpeningCommitment(selectedPlan: OpeningPlan | null, claimed: boolean, currentTick: number): selectedPlan is OpeningPlan {
  return !!selectedPlan && !claimed && isOpeningWindowActive(currentTick);
}

export function getEcoGatherBonus(selectedPlan: OpeningPlan | null, claimed: boolean, currentTick: number, entity: Entity): number {
  if (!canClaimOpeningCommitment(selectedPlan, claimed, currentTick)) return 0;
  if (selectedPlan !== 'eco' || !isWorkerKind(entity.kind)) return 0;
  return OPENING_PLAN_DEFINITIONS.eco.eco?.gatherBonus ?? 0;
}

export function shouldApplyEcoFirstReturnBonus(selectedPlan: OpeningPlan | null, claimed: boolean, currentTick: number, entity: Entity): boolean {
  return canClaimOpeningCommitment(selectedPlan, claimed, currentTick) && selectedPlan === 'eco' && isWorkerKind(entity.kind);
}

export function getEcoFirstReturnBonusGold(): number {
  return OPENING_PLAN_DEFINITIONS.eco.eco?.firstReturnBonusGold ?? 0;
}

export function getEcoGatherBonusCap(): number {
  return OPENING_PLAN_DEFINITIONS.eco.eco?.gatherBonusCap ?? 0;
}

export function shouldApplyTempoFirstMilitaryTrainBonus(selectedPlan: OpeningPlan | null, claimed: boolean, currentTick: number, unitKind: Entity['kind']): boolean {
  return canClaimOpeningCommitment(selectedPlan, claimed, currentTick) && selectedPlan === 'tempo' && isUnitKind(unitKind) && !isWorkerKind(unitKind);
}

export function applyTempoTrainTicks(baseTicks: number): number {
  const mult = OPENING_PLAN_DEFINITIONS.tempo.tempo?.firstMilitaryTrainMultiplier ?? 1;
  return Math.max(1, Math.floor(baseTicks * mult));
}

export function shouldPressureCommitFirstUnit(selectedPlan: OpeningPlan | null, claimed: boolean, currentTick: number, entity: Entity): boolean {
  return canClaimOpeningCommitment(selectedPlan, claimed, currentTick) && selectedPlan === 'pressure' && isUnitKind(entity.kind) && !isWorkerKind(entity.kind);
}

export function getPressureSpeedBoostMult(): number {
  return OPENING_PLAN_DEFINITIONS.pressure.pressure?.firstMilitarySpeedBoostMult ?? 1;
}

export function getPressureSpeedBoostTicks(): number {
  return OPENING_PLAN_DEFINITIONS.pressure.pressure?.firstMilitarySpeedBoostTicks ?? 0;
}

export function getPressureForwardCommitTicks(): number {
  return OPENING_PLAN_DEFINITIONS.pressure.pressure?.forwardCommitTicks ?? 0;
}

export function shouldPressureAttackMoveCommit(selectedPlan: OpeningPlan | null, claimed: boolean, currentTick: number, entity: Entity): boolean {
  return shouldPressureCommitFirstUnit(selectedPlan, claimed, currentTick, entity)
    && !!OPENING_PLAN_DEFINITIONS.pressure.pressure?.attackMoveCommit;
}

export function getOpeningPlanPresentation(plan: OpeningPlan): OpeningPlanPresentation {
  return OPENING_PLAN_DEFINITIONS[plan].ui;
}
