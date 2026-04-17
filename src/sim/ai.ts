import type { Entity, EntityKind, GameState, Vec2 } from '../types';
import { SIM_HZ, isUnitKind } from '../types';
import { STATS } from '../data/units';
import { RACES } from '../data/races';
import {
  issueGatherCommand, issueTrainCommand,
  issueBuildCommand, isValidPlacement,
} from './economy';
import { issueAttackCommand } from './combat';
import { issueMoveCommand } from './commands';

// ─── Controller state ─────────────────────────────────────────────────────────

export interface AIController {
  phase:          'economy' | 'military' | 'assault';
  attackWaveSize: number;   // grows each wave: 6 → 8 → 10 → 12
}

export function createAI(): AIController {
  return { phase: 'economy', attackWaveSize: 6 };
}

// ─── Main tick (runs at 1 Hz) ─────────────────────────────────────────────────

export function tickAI(state: GameState, ai: AIController): void {
  if (state.tick % SIM_HZ !== 0) return;

  const es = state.entities;

  const myTH = es.find(e => e.owner === 1 && e.kind === 'townhall');
  if (!myTH) return; // AI defeated — nothing to do

  // ── Race config for owner 1 ────────────────────────────────────────────────
  const rc = RACES[state.races[1]];

  const myBarracks = es.find(e  => e.owner === 1 && e.kind === 'barracks');
  const myWorkers  = es.filter(e => e.owner === 1 && e.kind === rc.worker);
  const mySoldiers = es.filter(e => e.owner === 1 &&
    (e.kind === rc.soldier || e.kind === rc.ranged));
  const farmCount  = es.filter(e => e.owner === 1 && e.kind === 'farm').length;

  // Flags: is a worker already tasked with building X?
  const buildingFarm     = myWorkers.some(w => w.cmd?.type === 'build' && w.cmd.building === 'farm');
  const buildingBarracks = myWorkers.some(w => w.cmd?.type === 'build' && w.cmd.building === 'barracks');

  // Always keep workers on gold
  keepGathering(state, myWorkers);

  switch (ai.phase) {
    // ── Economy: build workforce, first farm, first barracks ─────────────────
    case 'economy': {
      if (myWorkers.length < 4) {
        issueTrainCommand(state, myTH, rc.worker);
      }
      if (farmCount === 0 && !buildingFarm && myWorkers.length >= 2) {
        const w = freeWorker(myWorkers);
        if (w) {
          const pos = findBuildSpot(state, myTH, 'farm');
          if (pos) issueBuildCommand(state, w, 'farm', pos, state.tick);
        }
      }
      if (farmCount > 0 && !myBarracks && !buildingBarracks && myWorkers.length >= 3) {
        const w = freeWorker(myWorkers);
        if (w) {
          const pos = findBuildSpot(state, myTH, 'barracks');
          if (pos && issueBuildCommand(state, w, 'barracks', pos, state.tick)) {
            ai.phase = 'military';
          }
        }
      }
      break;
    }

    // ── Military: train soldiers, expand pop cap, wait for wave ──────────────
    case 'military': {
      if (myBarracks) {
        const soldierCount = mySoldiers.filter(u => u.kind === rc.soldier).length;
        const rangedCount  = mySoldiers.filter(u => u.kind === rc.ranged).length;
        const wantRanged   = rangedCount < Math.floor(soldierCount / 2) &&
                             state.gold[1] >= (STATS[rc.ranged]?.cost ?? 100);
        issueTrainCommand(state, myBarracks, wantRanged ? rc.ranged : rc.soldier);
      }
      if (!buildingFarm && state.popCap[1] - state.pop[1] <= 2 && farmCount < 3) {
        const w = freeWorker(myWorkers);
        if (w) {
          const pos = findBuildSpot(state, myTH, 'farm');
          if (pos) issueBuildCommand(state, w, 'farm', pos, state.tick);
        }
      }
      if (mySoldiers.length >= ai.attackWaveSize) {
        ai.phase = 'assault';
      }
      break;
    }

    // ── Assault: send army toward player base ─────────────────────────────────
    case 'assault': {
      const playerTH = es.find(e => e.owner === 0 && e.kind === 'townhall');

      for (const s of mySoldiers) {
        if (s.cmd && s.cmd.type !== 'move') continue;

        const nearest = s.kind === rc.ranged
          ? (nearestPlayerUnit(state, s) ?? nearestPlayerEntity(state, s))
          : nearestPlayerEntity(state, s);

        if (nearest) {
          issueAttackCommand(s, nearest.id, state.tick);
        } else if (playerTH) {
          issueMoveCommand(state, s, playerTH.pos.x + 1, playerTH.pos.y + 2);
        }
      }

      if (mySoldiers.length === 0) {
        ai.attackWaveSize = Math.min(12, ai.attackWaveSize + 2);
        ai.phase = 'military';
      }
      break;
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function keepGathering(state: GameState, workers: Entity[]): void {
  for (const w of workers) {
    if (w.cmd && w.cmd.type !== 'gather') continue;
    if (w.cmd?.type === 'gather') {
      const mine = state.entities.find(e => e.id === (w.cmd as Extract<typeof w.cmd, {type:'gather'}>).mineId);
      if (mine && (mine.goldReserve ?? 0) > 0) continue;
    }
    const mine = nearestMine(state, w);
    if (mine) issueGatherCommand(w, mine.id, state.tick);
  }
}

function freeWorker(workers: Entity[]): Entity | undefined {
  return workers.find(w => !w.cmd) ?? workers.find(w => w.cmd?.type === 'gather');
}

function nearestMine(state: GameState, unit: Entity): Entity | null {
  let best: Entity | null = null; let bestD = Infinity;
  for (const e of state.entities) {
    if (e.kind !== 'goldmine' || (e.goldReserve ?? 0) <= 0) continue;
    const d = Math.hypot(e.pos.x - unit.pos.x, e.pos.y - unit.pos.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function findBuildSpot(state: GameState, anchor: Entity, kind: EntityKind): Vec2 | null {
  for (let r = 2; r <= 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const tx = anchor.pos.x + dx;
        const ty = anchor.pos.y + dy;
        if (isValidPlacement(state, kind, tx, ty)) return { x: tx, y: ty };
      }
    }
  }
  return null;
}

function nearestPlayerEntity(state: GameState, unit: Entity): Entity | null {
  let best: Entity | null = null; let bestD = Infinity;
  for (const e of state.entities) {
    if (e.owner !== 0 || e.kind === 'goldmine') continue;
    const d = Math.hypot(e.pos.x - unit.pos.x, e.pos.y - unit.pos.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function nearestPlayerUnit(state: GameState, unit: Entity): Entity | null {
  let best: Entity | null = null; let bestD = Infinity;
  for (const e of state.entities) {
    if (e.owner !== 0 || !isUnitKind(e.kind)) continue;
    const d = Math.hypot(e.pos.x - unit.pos.x, e.pos.y - unit.pos.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}
