import type { Race } from '../types';
import type { RaceBalanceProfile } from './schema';

export const RACE_BALANCE_PROFILES: Record<Race, RaceBalanceProfile> = {
  human: {
    race: 'human',
    display: {
      name: 'Humans',
      worker: 'worker',
      soldier: 'footman',
      ranged: 'archer',
      heavy: 'knight',
      workerLabel: 'Peasant',
      soldierLabel: 'Footman',
      rangedLabel: 'Archer',
      heavyLabel: 'Knight',
      hallLabel: 'Town Hall',
      barrLabel: 'Barracks',
      farmLabel: 'Farm',
      tagline: 'For the Alliance!',
      description: 'Balanced and disciplined. Footmen hold, Archers support,\nand Knights anchor elite frontlines.',
      accentColor: '#4488ff',
    },
    entityOverrides: {
      wall: {
        hp: 260,
      },
    },
    identityNotes: ['Stronger fortified play, safer line holding.'],
  },
  orc: {
    race: 'orc',
    display: {
      name: 'Orcs',
      worker: 'peon',
      soldier: 'grunt',
      ranged: 'troll',
      heavy: 'ogreFighter',
      workerLabel: 'Peon',
      soldierLabel: 'Grunt',
      rangedLabel: 'Troll',
      heavyLabel: 'Ogre Fighter',
      hallLabel: 'Great Hall',
      barrLabel: 'War Mill',
      farmLabel: 'Pig Farm',
      tagline: "Lok'tar Ogar!",
      description: 'Brutal and powerful. Grunts brawl, Trolls pressure from range,\nand Ogre Fighters smash the front.',
      accentColor: '#cc4422',
    },
    entityOverrides: {},
    identityNotes: ['Shock-pressure faction, stronger raw contact.'],
  },
};
