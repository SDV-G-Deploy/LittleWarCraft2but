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
  heavy:        EntityKind;
  // Display labels (shown in UI panel and menu)
  workerLabel:  string;   // "Peasant" / "Peon"
  soldierLabel: string;   // "Footman" / "Grunt"
  rangedLabel:  string;   // "Archer"  / "Troll"
  heavyLabel:   string;   // "Knight"  / "Ogre Fighter"
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
    heavy:        'knight',
    workerLabel:  'Peasant',
    soldierLabel: 'Footman',
    rangedLabel:  'Archer',
    heavyLabel:   'Knight',
    hallLabel:    'Town Hall',
    barrLabel:    'Barracks',
    farmLabel:    'Farm',
    tagline:      'For the Alliance!',
    description:  'Balanced and disciplined. Footmen hold, Archers support,\nand Knights anchor elite frontlines.',
    accentColor:  '#4488ff',
  },
  orc: {
    name:         'Orcs',
    worker:       'peon',
    soldier:      'grunt',
    ranged:       'troll',
    heavy:        'ogreFighter',
    workerLabel:  'Peon',
    soldierLabel: 'Grunt',
    rangedLabel:  'Troll',
    heavyLabel:   'Ogre Fighter',
    hallLabel:    'Great Hall',
    barrLabel:    'War Mill',
    farmLabel:    'Pig Farm',
    tagline:      'Lok\'tar Ogar!',
    description:  'Brutal and powerful. Grunts brawl, Trolls pressure from range,\nand Ogre Fighters smash the front.',
    accentColor:  '#cc4422',
  },
};

/** Given an owner index and races array, get that owner's RaceConfig. */
export function ownerRace(races: [Race, Race], owner: 0 | 1): RaceConfig {
  return RACES[races[owner]];
}
