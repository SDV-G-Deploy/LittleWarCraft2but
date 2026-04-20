import type { EntityKind, Race } from '../types';
import type { EntityStatOverride } from './schema';

export interface BalanceTuningConfig {
  races?: Partial<Record<Race, Partial<Record<EntityKind, EntityStatOverride>>>>;
}

export const BALANCE_TUNING: BalanceTuningConfig = {
  races: {
    human: {
      farm: {
        supplyProvided: 5,
      },
    },
  },
};
