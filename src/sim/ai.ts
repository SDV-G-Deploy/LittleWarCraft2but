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
  openingChoiceDelayTicks: number;
  preferredRangedRatio: number;
  preferredHeavyCap: number;
  assaultRetargetMine: boolean;
  towerMinArmy: number;
  fallbackWaveThreshold: number;
  expansionMineMinArmy: number;
  expansionMineReserveMin: number;
  attackRetargetRadius: number;
  attackBaseBias: number;
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
      openingChoiceDelayTicks: Math.round(SIM_HZ * 8),
      preferredRangedRatio: 0.15,
      preferredHeavyCap: 1,
      assaultRetargetMine: false,
      towerMinArmy: 6,
      fallbackWaveThreshold: 2,
      expansionMineMinArmy: 7,
      expansionMineReserveMin: 900,
      attackRetargetRadius: 7,
      attackBaseBias: 8,
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
      openingChoiceDelayTicks: Math.round(SIM_HZ * 4),
      preferredRangedRatio: 0.6,
      preferredHeavyCap: 3,
      assaultRetargetMine: true,
      towerMinArmy: 4,
      fallbackWaveThreshold: 4,
      expansionMineMinArmy: 3,
      expansionMineReserveMin: 500,
      attackRetargetRadius: 4,
      attackBaseBias: 0,
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
    openingChoiceDelayTicks: Math.round(SIM_HZ * 6),
    preferredRangedRatio: 0.4,
    preferredHeavyCap: 2,
    assaultRetargetMine: true,
    towerMinArmy: 5,
    fallbackWaveThreshold: 3,
    expansionMineMinArmy: 5,
    expansionMineReserveMin: 700,
    attackRetargetRadius: 6,
    attackBaseBias: 3,
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

  if (!state.openingPlanSelected[1] && state.tick >= ai.openingChoiceDelayTicks) {
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
        const targetRangedCount = Math.max(1, Math.floor((soldierCount + heavyCount) * ai.preferredRangedRatio));
        const wantHeavy    = heavyCount < ai.preferredHeavyCap && soldierCount >= (ai.difficulty === 'hard' ? 2 : 3) &&
                             state.gold[1] >= getResolvedCost(rc.heavy, state.races[1]);
        const wantRanged   = !wantHeavy && rangedCount < targetRangedCount &&
                             state.gold[1] >= getResolvedCost(rc.ranged, state.races[1]);
        const nextUnit = wantHeavy ? rc.heavy : wantRanged ? rc.ranged : rc.soldier;
        const barracksBusy = myBarracks.cmd?.type === 'train';
        if (!barracksBusy) issueTrainCommand(state, myBarracks, nextUnit);
      }
      if (!buildingFarm && state.popCap[1] - state.pop[1] <= 2 && farmCount < ai.maxFarms) {
        const w = freeWorker(myWorkers);
        if (w) {
          const pos = findBuildSpot(state, myTH, 'farm');
          if (pos) issueBuildCommand(state, w, 'farm', pos, state.tick);
        }
      }
      if (!buildingTower && towerCount < ai.maxTowers && myBarracks && mySoldiers.length >= ai.towerMinArmy && state.gold[1] >= getResolvedCost('tower', state.races[1])) {
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
      const contestedMine = bestContestedMine(state, 1, ai);
      const expansionMine = bestExpansionMine(state, 1, ai);

      for (const s of mySoldiers) {
        if (s.cmd && s.cmd.type !== 'move') continue;

        const nearest = s.kind === rc.ranged
          ? (nearestPlayerUnit(state, s, ai.attackRetargetRadius) ?? nearestPlayerEntity(state, s, ai.attackRetargetRadius))
          : nearestPlayerEntity(state, s, ai.attackRetargetRadius);

        if (nearest) {
          issueAttackCommand(s, nearest.id, state.tick, state);
        } else if (ai.assaultRetargetMine && contestedMine && Math.hypot(s.pos.x - contestedMine.pos.x, s.pos.y - contestedMine.pos.y) > ai.attackRetargetRadius) {
          const tx = contestedMine.pos.x;
          const ty = contestedMine.pos.y - 1;
          if (!moveGoalNear(s, tx, ty)) issueMoveCommand(state, s, tx, ty);
        } else if (expansionMine && mySoldiers.length >= ai.expansionMineMinArmy) {
          const tx = expansionMine.pos.x;
          const ty = expansionMine.pos.y - 1;
          if (!moveGoalNear(s, tx, ty)) issueMoveCommand(state, s, tx, ty);
        } else if (playerTH) {
          const tx = playerTH.pos.x + 1;
          const ty = playerTH.pos.y + 2;
          if (!moveGoalNear(s, tx, ty)) issueMoveCommand(state, s, tx, ty);
        }
      }

      if (mySoldiers.length <= ai.fallbackWaveThreshold) {
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
      const gatherCmd = w.cmd;
      if (gatherCmd.resourceType === 'gold') {
        const mine = state.entities.find(e => e.id === gatherCmd.targetId);
        if (mine && (mine.goldReserve ?? 0) > 0) continue;
      } else {
        const tx = gatherCmd.targetId % 64;
        const ty = Math.floor(gatherCmd.targetId / 64);
        const tile = state.tiles[ty]?.[tx];
        if (tile?.kind === 'tree' && (tile.woodReserve ?? 0) > 0) continue;
      }
    }
    const mine = nearestMine(state, w);
    if (mine) issueGatherCommand(state, w, mine.id, state.tick);
  }
}

function freeWorker(workers: Entity[]): Entity | undefined {
  return workers.find(w => !w.cmd)
    ?? workers.find(w => w.cmd?.type === 'gather' && (w.carryGold ?? 0) === 0);
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

function nearestPlayerEntity(state: GameState, unit: Entity, maxDistance = Infinity): Entity | null {
  let best: Entity | null = null; let bestD = Infinity;
  for (const e of state.entities) {
    if (e.owner !== 0 || e.kind === 'goldmine' || e.kind === 'barrier') continue;
    const d = Math.hypot(e.pos.x - unit.pos.x, e.pos.y - unit.pos.y);
    if (d > maxDistance) continue;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function nearestPlayerUnit(state: GameState, unit: Entity, maxDistance = Infinity): Entity | null {
  let best: Entity | null = null; let bestD = Infinity;
  for (const e of state.entities) {
    if (e.owner !== 0 || !isUnitKind(e.kind)) continue;
    const d = Math.hypot(e.pos.x - unit.pos.x, e.pos.y - unit.pos.y);
    if (d > maxDistance) continue;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function bestContestedMine(state: GameState, owner: 0 | 1, ai: AIController): Entity | null {
  let best: Entity | null = null;
  let bestScore = -Infinity;
  const myTownHall = state.entities.find(e => e.owner === owner && e.kind === 'townhall');
  const enemyTownHall = state.entities.find(e => e.owner === (owner === 0 ? 1 : 0) && e.kind === 'townhall');
  if (!myTownHall || !enemyTownHall) return null;

  for (const e of state.entities) {
    if (e.kind !== 'goldmine' || (e.goldReserve ?? 0) <= 0) continue;
    const myDist = Math.hypot(e.pos.x - myTownHall.pos.x, e.pos.y - myTownHall.pos.y);
    const enemyDist = Math.hypot(e.pos.x - enemyTownHall.pos.x, e.pos.y - enemyTownHall.pos.y);
    const centerBias = e.pos.x > 16 && e.pos.x < 48 ? 6 : 0;
    const score = (e.goldReserve ?? 0) / 100 + centerBias - Math.abs(myDist - enemyDist) * 0.2 - ai.attackBaseBias * 0.15;
    if (score > bestScore) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

function bestExpansionMine(state: GameState, owner: 0 | 1, ai: AIController): Entity | null {
  let best: Entity | null = null;
  let bestScore = -Infinity;
  const myTownHall = state.entities.find(e => e.owner === owner && e.kind === 'townhall');
  const enemyTownHall = state.entities.find(e => e.owner === (owner === 0 ? 1 : 0) && e.kind === 'townhall');
  if (!myTownHall || !enemyTownHall) return null;

  for (const e of state.entities) {
    if (e.kind !== 'goldmine' || (e.goldReserve ?? 0) < ai.expansionMineReserveMin) continue;
    const myDist = Math.hypot(e.pos.x - myTownHall.pos.x, e.pos.y - myTownHall.pos.y);
    const enemyDist = Math.hypot(e.pos.x - enemyTownHall.pos.x, e.pos.y - enemyTownHall.pos.y);
    if (myDist >= enemyDist) continue;
    const score = (e.goldReserve ?? 0) / 100 - myDist * 0.25 + enemyDist * 0.12;
    if (score > bestScore) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}
