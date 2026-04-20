import type { AIDifficulty, Entity, EntityKind, GameState, Vec2 } from '../types';
import { SIM_HZ, isUnitKind } from '../types';
import { RACES } from '../data/races';
import { getResolvedCost } from '../balance/resolver';
import {
  issueGatherCommand, issueTrainCommand,
  issueBuildCommand, isValidPlacement,
} from './economy';
import { issueAttackCommand } from './combat';
import { issueMoveCommand } from './commands';

function moveGoalNear(entity: Entity, tx: number, ty: number): boolean {
  return entity.cmd?.type === 'move' &&
    Math.max(Math.abs(entity.cmd.goal.x - tx), Math.abs(entity.cmd.goal.y - ty)) <= 1;
}

// ─── Controller state ─────────────────────────────────────────────────────────

export interface AIController {
  phase: 'economy' | 'military' | 'assault';
  attackWaveSize: number;
  difficulty: AIDifficulty;
  reactionDelayTicks: number;
  nextDecisionTick: number;
  maxFarms: number;
  maxTowers: number;
  workerTarget: number;
  openingPlan: 'eco' | 'tempo' | 'pressure';
}

export function createAI(difficulty: AIDifficulty = 'medium'): AIController {
  if (difficulty === 'easy') {
    return {
      phase: 'economy',
      attackWaveSize: 8,
      difficulty,
      reactionDelayTicks: Math.round(SIM_HZ * 1.4),
      nextDecisionTick: 0,
      maxFarms: 2,
      maxTowers: 1,
      workerTarget: 3,
      openingPlan: 'eco',
    };
  }
  if (difficulty === 'hard') {
    return {
      phase: 'economy',
      attackWaveSize: 5,
      difficulty,
      reactionDelayTicks: Math.round(SIM_HZ * 0.55),
      nextDecisionTick: 0,
      maxFarms: 4,
      maxTowers: 3,
      workerTarget: 5,
      openingPlan: 'pressure',
    };
  }
  return {
    phase: 'economy',
    attackWaveSize: 6,
    difficulty,
    reactionDelayTicks: SIM_HZ,
    nextDecisionTick: 0,
    maxFarms: 3,
    maxTowers: 2,
    workerTarget: 4,
    openingPlan: 'tempo',
  };
}

// ─── Main tick (runs at 1 Hz) ─────────────────────────────────────────────────

export function tickAI(state: GameState, ai: AIController): void {
  if (state.tick < ai.nextDecisionTick) return;

  ai.nextDecisionTick = state.tick + ai.reactionDelayTicks;

  const es = state.entities;

  const myTH = es.find(e => e.owner === 1 && e.kind === 'townhall');
  if (!myTH) return; // AI defeated — nothing to do

  // ── Race config for owner 1 ────────────────────────────────────────────────
  const rc = RACES[state.races[1]];

  const myBarracks = es.find(e  => e.owner === 1 && e.kind === 'barracks');
  const myWorkers  = es.filter(e => e.owner === 1 && e.kind === rc.worker);
  const mySoldiers = es.filter(e => e.owner === 1 &&
    (e.kind === rc.soldier || e.kind === rc.ranged || e.kind === rc.heavy));
  const farmCount  = es.filter(e => e.owner === 1 && e.kind === 'farm').length;
  const towerCount = es.filter(e => e.owner === 1 && e.kind === 'tower').length;

  // Flags: is a worker already tasked with building X?
  const buildingFarm     = myWorkers.some(w => w.cmd?.type === 'build' && w.cmd.building === 'farm');
  const buildingBarracks = myWorkers.some(w => w.cmd?.type === 'build' && w.cmd.building === 'barracks');
  const buildingTower    = myWorkers.some(w => w.cmd?.type === 'build' && w.cmd.building === 'tower');

  if (!state.openingPlanSelected[1]) {
    state.openingPlanSelected[1] = ai.openingPlan;
    for (const e of es) {
      if (e.owner === 1 && (e.kind === 'townhall' || e.kind === 'barracks')) e.openingPlan = ai.openingPlan;
    }
  }

  // Always keep workers on gold
  keepGathering(state, myWorkers);

  switch (ai.phase) {
    // ── Economy: build workforce, first farm, first barracks ─────────────────
    case 'economy': {
      if (myWorkers.length < ai.workerTarget) {
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
        const heavyCount   = mySoldiers.filter(u => u.kind === rc.heavy).length;
        const wantHeavy    = heavyCount < 2 && soldierCount >= 2 &&
                             state.gold[1] >= getResolvedCost(rc.heavy, state.races[1]);
        const wantRanged   = !wantHeavy && rangedCount < Math.floor((soldierCount + heavyCount) / 2) &&
                             state.gold[1] >= getResolvedCost(rc.ranged, state.races[1]);
        issueTrainCommand(state, myBarracks, wantHeavy ? rc.heavy : wantRanged ? rc.ranged : rc.soldier);
      }
      if (!buildingFarm && state.popCap[1] - state.pop[1] <= 2 && farmCount < ai.maxFarms) {
        const w = freeWorker(myWorkers);
        if (w) {
          const pos = findBuildSpot(state, myTH, 'farm');
          if (pos) issueBuildCommand(state, w, 'farm', pos, state.tick);
        }
      }
      if (!buildingTower && towerCount < ai.maxTowers && myBarracks && mySoldiers.length >= (ai.difficulty === 'easy' ? 5 : 4) && state.gold[1] >= getResolvedCost('tower', state.races[1])) {
        const w = freeWorker(myWorkers);
        if (w) {
          const pos = findBuildSpot(state, myTH, 'tower');
          if (pos) issueBuildCommand(state, w, 'tower', pos, state.tick);
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
      const contestedMine = bestContestedMine(state, 1);

      for (const s of mySoldiers) {
        if (s.cmd && s.cmd.type !== 'move') continue;

        const nearest = s.kind === rc.ranged
          ? (nearestPlayerUnit(state, s) ?? nearestPlayerEntity(state, s))
          : nearestPlayerEntity(state, s);

        if (nearest) {
          issueAttackCommand(s, nearest.id, state.tick);
        } else if (ai.difficulty !== 'easy' && contestedMine && Math.hypot(s.pos.x - contestedMine.pos.x, s.pos.y - contestedMine.pos.y) > (ai.difficulty === 'hard' ? 4 : 6)) {
          const tx = contestedMine.pos.x;
          const ty = contestedMine.pos.y - 1;
          if (!moveGoalNear(s, tx, ty)) issueMoveCommand(state, s, tx, ty);
        } else if (playerTH) {
          const tx = playerTH.pos.x + 1;
          const ty = playerTH.pos.y + 2;
          if (!moveGoalNear(s, tx, ty)) issueMoveCommand(state, s, tx, ty);
        }
      }

      if (mySoldiers.length === 0) {
        const growth = ai.difficulty === 'easy' ? 1 : 2;
        const maxWave = ai.difficulty === 'hard' ? 11 : 12;
        ai.attackWaveSize = Math.min(maxWave, ai.attackWaveSize + growth);
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

function bestContestedMine(state: GameState, owner: 0 | 1): Entity | null {
  let best: Entity | null = null;
  let bestScore = -Infinity;
  const myTownHall = state.entities.find(e => e.owner === owner && e.kind === 'townhall');
  const enemyTownHall = state.entities.find(e => e.owner !== owner && e.kind === 'townhall');
  if (!myTownHall || !enemyTownHall) return null;

  for (const e of state.entities) {
    if (e.kind !== 'goldmine' || (e.goldReserve ?? 0) <= 0) continue;
    const myDist = Math.hypot(e.pos.x - myTownHall.pos.x, e.pos.y - myTownHall.pos.y);
    const enemyDist = Math.hypot(e.pos.x - enemyTownHall.pos.x, e.pos.y - enemyTownHall.pos.y);
    const centerBias = e.pos.x > 16 && e.pos.x < 48 ? 6 : 0;
    const score = (e.goldReserve ?? 0) / 100 + centerBias - Math.abs(myDist - enemyDist) * 0.2;
    if (score > bestScore) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}
