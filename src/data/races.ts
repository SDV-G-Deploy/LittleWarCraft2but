/**
 * races.ts
 * Compatibility forwarder for race display / unit mapping.
 */

import type { Race } from '../types';
import { RACE_BALANCE_PROFILES } from '../balance/races';
import type { RaceBalanceProfile, RaceDisplayProfile } from '../balance/schema';

export type RaceConfig = RaceDisplayProfile;

export const RACES: Record<Race, RaceConfig> = {
  human: RACE_BALANCE_PROFILES.human.display,
  orc: RACE_BALANCE_PROFILES.orc.display,
};

export function ownerRace(races: [Race, Race], owner: 0 | 1): RaceConfig {
  return RACES[races[owner]];
}

export function ownerRaceProfile(races: [Race, Race], owner: 0 | 1): RaceBalanceProfile {
  return RACE_BALANCE_PROFILES[races[owner]];
}
