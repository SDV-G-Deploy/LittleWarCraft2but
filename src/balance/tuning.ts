import type { EntityKind, Race } from '../types';
import type { EntityStatOverride } from './schema';

export interface BalanceTuningConfig {
  races?: Partial<Record<Race, Partial<Record<EntityKind, EntityStatOverride>>>>;
}

export const BALANCE_TUNING: BalanceTuningConfig = {
  races: {
    human: {
      farm: {
        cost: { gold: 180, wood: 40 },
      },
      lumbermill: {
        cost: { gold: 160, wood: 60 },
      },
    },
    orc: {
      farm: {
        cost: { gold: 180, wood: 30 },
      },
      lumbermill: {
        cost: { gold: 160, wood: 60 },
      },
    },
  },
};
