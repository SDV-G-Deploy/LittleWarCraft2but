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
      towerLabel: 'Guard Tower',
      tagline: 'For the Alliance!',
      description: 'Balanced and disciplined. Footmen hold, Archers support,\nand Knights anchor elite frontlines.',
      accentColor: '#4488ff',
    },
    entityOverrides: {
      wall: {
        hp: 260,
      },
      tower: {
        hp: 390,
        damage: 8,
        armor: 1,
        range: 7,
        sight: 9,
        attackTicks: Math.round(0.9 * 20),
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
      towerLabel: 'Watch Tower',
      tagline: "Lok'tar Ogar!",
      description: 'Brutal and powerful. Grunts brawl, Trolls pressure from range,\nand Ogre Fighters smash the front.',
      accentColor: '#cc4422',
    },
    entityOverrides: {
      tower: {
        hp: 560,
        damage: 12,
        armor: 3,
        range: 5,
        sight: 7,
        attackTicks: Math.round(1.4 * 20),
      },
    },
    identityNotes: ['Shock-pressure faction, stronger raw contact.'],
  },
};
