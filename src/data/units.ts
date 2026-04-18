import type { EntityKind } from '../types';
import { SIM_HZ } from '../types';

export interface UnitStats {
  hp: number;
  damage: number;
  armor: number;
  range: number;       // attack range in tiles
  speed: number;       // movement speed in tiles/s (0 for buildings)
  sight: number;       // sight radius in tiles
  cost: number;        // gold cost
  buildTicks: number;  // sim ticks to train/construct
  attackTicks: number; // sim ticks between attacks (0 = can't attack)
  tileW: number;
  tileH: number;
}

export const STATS: Partial<Record<EntityKind, UnitStats>> = {
  // ── Human units ──────────────────────────────────────────────────────────────
  worker: {
    hp: 30,  damage: 3, armor: 0, range: 1,
    speed: 4, sight: 4, cost: 55,  buildTicks: SIM_HZ * 9,
    attackTicks: SIM_HZ,
    tileW: 1, tileH: 1,
  },
  footman: {
    hp: 72,  damage: 8, armor: 3, range: 1,
    speed: 4, sight: 5, cost: 85,  buildTicks: SIM_HZ * 14,
    attackTicks: SIM_HZ,
    tileW: 1, tileH: 1,
  },
  archer: {
    hp: 34,  damage: 8, armor: 0, range: 5,
    speed: 4, sight: 7, cost: 95, buildTicks: SIM_HZ * 17,
    attackTicks: Math.round(SIM_HZ * 1.4),
    tileW: 1, tileH: 1,
  },
  knight: {
    hp: 125, damage: 14, armor: 5, range: 1,
    speed: 4, sight: 5, cost: 165, buildTicks: SIM_HZ * 21,
    attackTicks: Math.round(SIM_HZ * 1.5),
    tileW: 1, tileH: 1,
  },
  // ── Orc units ────────────────────────────────────────────────────────────────
  peon: {
    // Same utility as worker, different visual — same cost/stats for balance
    hp: 30,  damage: 3, armor: 0, range: 1,
    speed: 4, sight: 4, cost: 55,  buildTicks: SIM_HZ * 9,
    attackTicks: SIM_HZ,
    tileW: 1, tileH: 1,
  },
  grunt: {
    // Beefier than footman: more HP, more damage, slower attack, costs more
    hp: 92,  damage: 10, armor: 4, range: 1,
    speed: 3, sight: 5, cost: 105, buildTicks: SIM_HZ * 17,
    attackTicks: Math.round(SIM_HZ * 1.2),
    tileW: 1, tileH: 1,
  },
  troll: {
    // Shorter range than archer, higher damage per hit, same cost
    hp: 36,  damage: 10, armor: 0, range: 4,
    speed: 4, sight: 7, cost: 95, buildTicks: SIM_HZ * 17,
    attackTicks: Math.round(SIM_HZ * 1.4),
    tileW: 1, tileH: 1,
  },
  ogreFighter: {
    hp: 150, damage: 16, armor: 4, range: 1,
    speed: 3, sight: 5, cost: 180, buildTicks: SIM_HZ * 23,
    attackTicks: Math.round(SIM_HZ * 1.8),
    tileW: 1, tileH: 1,
  },
  // ── Buildings (shared by both races, sprite varies by owner's race) ──────────
  townhall: {
    hp: 1200, damage: 0, armor: 5, range: 0,
    speed: 0, sight: 8, cost: 0,   buildTicks: 0,
    attackTicks: 0,
    tileW: 3, tileH: 3,
  },
  barracks: {
    hp: 800,  damage: 0, armor: 3, range: 0,
    speed: 0, sight: 4, cost: 360, buildTicks: SIM_HZ * 34,
    attackTicks: 0,
    tileW: 3, tileH: 2,
  },
  farm: {
    hp: 400,  damage: 0, armor: 1, range: 0,
    speed: 0, sight: 4, cost: 180, buildTicks: SIM_HZ * 18,
    attackTicks: 0,
    tileW: 2, tileH: 2,
  },
  wall: {
    hp: 200, damage: 0, armor: 5, range: 0,
    speed: 0, sight: 6, cost: 50, buildTicks: SIM_HZ * 5,
    attackTicks: 0,
    tileW: 1, tileH: 1,
  },
  // ── Construction scaffold (tileW/tileH/hp/hpMax overridden at spawn time) ────
  construction: {
    hp: 1, damage: 0, armor: 0, range: 0,
    speed: 0, sight: 0, cost: 0, buildTicks: 1,
    attackTicks: 0,
    tileW: 1, tileH: 1,
  },
  // ── Resource node ────────────────────────────────────────────────────────────
  goldmine: {
    hp: 9999, damage: 0, armor: 0, range: 0,
    speed: 0, sight: 0, cost: 0,   buildTicks: 0,
    attackTicks: 0,
    tileW: 2, tileH: 2,
  },
};

/** Sim ticks between each tile step for a given entity kind. */
export function ticksPerStep(kind: EntityKind): number {
  const s = STATS[kind];
  if (!s || s.speed === 0) return Infinity;
  return Math.max(1, Math.round(SIM_HZ / s.speed));
}
