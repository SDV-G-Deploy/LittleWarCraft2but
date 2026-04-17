/**
 * races.ts
 * Maps each Race to its concrete EntityKind choices, display labels,
 * and colour identity. Every piece of race-specific logic reads from here.
 */

import type { EntityKind, Race } from '../types';

export interface RaceConfig {
  name:         string;   // "Humans" / "Orcs"
  // Unit kinds
  worker:       EntityKind;
  soldier:      EntityKind;
  ranged:       EntityKind;
  // Display labels (shown in UI panel and menu)
  workerLabel:  string;   // "Peasant" / "Peon"
  soldierLabel: string;   // "Footman" / "Grunt"
  rangedLabel:  string;   // "Archer"  / "Troll"
  hallLabel:    string;   // "Town Hall" / "Great Hall"
  barrLabel:    string;   // "Barracks" / "War Mill"
  farmLabel:    string;   // "Farm"     / "Pig Farm"
  // Menu flavour
  tagline:     string;
  description: string;
  accentColor: string;    // dominant UI hue for this race
}

export const RACES: Record<Race, RaceConfig> = {
  human: {
    name:         'Humans',
    worker:       'worker',
    soldier:      'footman',
    ranged:       'archer',
    workerLabel:  'Peasant',
    soldierLabel: 'Footman',
    rangedLabel:  'Archer',
    hallLabel:    'Town Hall',
    barrLabel:    'Barracks',
    farmLabel:    'Farm',
    tagline:      'For the Alliance!',
    description:  'Balanced and disciplined. Archers provide long-range\nsupport while Footmen hold the line.',
    accentColor:  '#4488ff',
  },
  orc: {
    name:         'Orcs',
    worker:       'peon',
    soldier:      'grunt',
    ranged:       'troll',
    workerLabel:  'Peon',
    soldierLabel: 'Grunt',
    rangedLabel:  'Troll',
    hallLabel:    'Great Hall',
    barrLabel:    'War Mill',
    farmLabel:    'Pig Farm',
    tagline:      'Lok\'tar Ogar!',
    description:  'Brutal and powerful. Grunts hit harder but cost more.\nTrolls hurl axes at range.',
    accentColor:  '#cc4422',
  },
};

/** Given an owner index and races array, get that owner's RaceConfig. */
export function ownerRace(races: [Race, Race], owner: 0 | 1): RaceConfig {
  return RACES[races[owner]];
}
