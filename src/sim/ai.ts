import type { AIDifficulty, Entity, EntityKind, GameState, LumberUpgradeKind, Race, Vec2 } from '../types';
import { MAP_H, MAP_W, SIM_HZ, isOwnedByOpposingPlayer, isUnitKind } from '../types';
import { RACES } from '../data/races';
import { RACE_BALANCE_PROFILES } from '../balance/races';
import { getResolvedCost, getResolvedTileSize } from '../balance/resolver';
import { DOCTRINE_COST } from '../balance/doctrines';
import { tryStartLumberUpgrade } from './upgrades';
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

function buildLocalRingOffsets(maxRadius: number): Vec2[] {
  const offsets: Vec2[] = [{ x: 0, y: 0 }];
  for (let r = 1; r <= maxRadius; r++) {
    for (let x = -r + 1; x <= r; x++) offsets.push({ x, y: -r });
    for (let y = -r + 1; y <= r; y++) offsets.push({ x: r, y });
    for (let x = r - 1; x >= -r; x--) offsets.push({ x, y: r });
    for (let y = r - 1; y >= -r; y--) offsets.push({ x: -r, y });
  }
  return offsets;
}

const AI_MOVE_SPREAD_OFFSETS = buildLocalRingOffsets(2);

function spreadMoveTargets(state: GameState, entity: Entity, tx: number, ty: number): Vec2[] {
  if (AI_MOVE_SPREAD_OFFSETS.length <= 1) return [{ x: tx, y: ty }];

  const ringSize = AI_MOVE_SPREAD_OFFSETS.length - 1;
  const seed = (entity.id * 1103515245 + tx * 92821 + ty * 68917) >>> 0;
  const preferred = 1 + (seed % ringSize);

  const orderedOffsets: Vec2[] = [AI_MOVE_SPREAD_OFFSETS[preferred], AI_MOVE_SPREAD_OFFSETS[0]];
  for (let i = 1; i <= ringSize; i++) {
    const idx = 1 + ((preferred - 1 + i) % ringSize);
    if (idx !== preferred) orderedOffsets.push(AI_MOVE_SPREAD_OFFSETS[idx]);
  }

  const seen = new Set<string>();
  const goals: Vec2[] = [];
  for (const offset of orderedOffsets) {
    const gx = Math.max(0, Math.min(MAP_W - 1, tx + offset.x));
    const gy = Math.max(0, Math.min(MAP_H - 1, ty + offset.y));
    const key = `${gx},${gy}`;
    if (seen.has(key)) continue;
    seen.add(key);
    goals.push({ x: gx, y: gy });
  }
  return goals;
}

function issueSpreadMoveCommand(state: GameState, entity: Entity, tx: number, ty: number): boolean {
  for (const goal of spreadMoveTargets(state, entity, tx, ty)) {
    if (issueMoveCommand(state, entity, goal.x, goal.y)) return true;
  }
  return false;
}

function preferredSpreadGoal(state: GameState, entity: Entity, tx: number, ty: number): Vec2 {
  return spreadMoveTargets(state, entity, tx, ty)[0] ?? { x: tx, y: ty };
}

export type AIStrategicIntent = 'stabilize' | 'fortify' | 'contest' | 'pressure' | 'regroup' | 'contain';
export type AIEconomicPosture = 'stable' | 'greed' | 'recover' | 'fortify';
export type AIAssaultPosture = 'probe' | 'contest' | 'commit' | 'contain' | 'regroup';

export interface AIRaceDoctrine {
  reserveBias: number;
  pressureBias: number;
  towerBias: number;
  economyGreedBias: number;
  rangedBias: number;
  heavyBias: number;
  frontlineBias: number;
}

export interface AIDifficultyPersonality {
  opportunism: number;
  caution: number;
  greedPunishBias: number;
  reserveDiscipline: number;
}

export interface AISnapshot {
  myArmySize: number;
  enemyArmyNearBase: number;
  myWorkersUnderThreat: number;
  myTownHallUnderThreat: boolean;
  contestedMineFavorable: boolean;
  safeExpansionExists: boolean;
  recentBaseThreat: boolean;
  nearbyEnemyArmyAtFront: number;
  nearbyFriendlyArmyAtFront: number;
  enemyTownHallDistance: number | null;
  recentFailedPush: boolean;
  recentWonLocalTrade: boolean;
}

const AI_RACE_DOCTRINES: Record<Race, AIRaceDoctrine> = {
  human: {
    reserveBias: 0.28,
    pressureBias: 0.15,
    towerBias: 0.2,
    economyGreedBias: 0.12,
    rangedBias: 0.08,
    heavyBias: -0.03,
    frontlineBias: 0.18,
  },
  orc: {
    reserveBias: 0.12,
    pressureBias: 0.32,
    towerBias: -0.02,
    economyGreedBias: 0.06,
    rangedBias: -0.05,
    heavyBias: 0.08,
    frontlineBias: -0.08,
  },
};

const AI_DIFFICULTY_PERSONALITIES: Record<AIDifficulty, AIDifficultyPersonality> = {
  easy: {
    opportunism: 0.12,
    caution: 0.82,
    greedPunishBias: 0.08,
    reserveDiscipline: 0.9,
  },
  medium: {
    opportunism: 0.42,
    caution: 0.52,
    greedPunishBias: 0.36,
    reserveDiscipline: 0.68,
  },
  hard: {
    opportunism: 0.76,
    caution: 0.36,
    greedPunishBias: 0.72,
    reserveDiscipline: 0.44,
  },
};

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
  doctrineChoice: 'fieldTempo' | 'lineHold' | 'longReach';
  baseDefenseRadius: number;
  defenseRecallWindowTicks: number;
  strategicIntent: AIStrategicIntent;
  economicPosture: AIEconomicPosture;
  assaultPosture: AIAssaultPosture;
  raceDoctrine: AIRaceDoctrine;
  difficultyPersonality: AIDifficultyPersonality;
  homeReserveMin: number;
  reserveReleaseUntilTick: number;
  lastIntentSwitchTick: number;
  lastBaseThreatTick: number;
  lastFailedPushTick: number;
  lastWonLocalTradeTick: number;
}

type ArmyMixPlan = {
  rangedRatio: number;
  heavyRatio: number;
  minFrontline: number;
};

type ArmyRole = 'reserve' | 'frontlineLine' | 'frontlineShock' | 'rangedFollow';

type ArmyRoleAssignment = {
  unit: Entity;
  role: ArmyRole;
};

type ArmyRolePlan = {
  assignments: ArmyRoleAssignment[];
  frontlineAnchor: Vec2 | null;
  harassmentAnchor: Vec2 | null;
  harassmentUnitIds: Set<number>;
};

type TargetSelectionRole = 'frontline' | 'rangedFollow' | 'harassment';

function createAIBase(difficulty: AIDifficulty): AIController {
  return {
    phase: 'economy',
    attackWaveSize: difficulty === 'easy' ? 99 : difficulty === 'hard' ? 9 : 7,
    difficulty,
    reactionDelayTicks: difficulty === 'easy' ? Math.round(SIM_HZ * 1.4) : difficulty === 'hard' ? Math.round(SIM_HZ * 0.55) : SIM_HZ,
    nextDecisionTick: 0,
    maxFarms: difficulty === 'easy' ? 2 : difficulty === 'hard' ? 4 : 3,
    maxTowers: difficulty === 'easy' ? 1 : difficulty === 'hard' ? 4 : 2,
    workerTarget: difficulty === 'easy' ? 3 : difficulty === 'hard' ? 5 : 4,
    openingPlan: difficulty === 'easy' ? 'eco' : difficulty === 'hard' ? 'pressure' : 'tempo',
    openingChoiceDelayTicks: difficulty === 'easy' ? Math.round(SIM_HZ * 8) : difficulty === 'hard' ? Math.round(SIM_HZ * 4) : Math.round(SIM_HZ * 6),
    preferredRangedRatio: difficulty === 'easy' ? 0.15 : difficulty === 'hard' ? 0.6 : 0.4,
    preferredHeavyCap: difficulty === 'easy' ? 1 : difficulty === 'hard' ? 3 : 2,
    assaultRetargetMine: difficulty !== 'easy',
    towerMinArmy: difficulty === 'easy' ? 6 : difficulty === 'hard' ? 4 : 5,
    fallbackWaveThreshold: difficulty === 'easy' ? 4 : difficulty === 'hard' ? 8 : 6,
    expansionMineMinArmy: difficulty === 'easy' ? 7 : difficulty === 'hard' ? 3 : 5,
    expansionMineReserveMin: difficulty === 'easy' ? 900 : difficulty === 'hard' ? 500 : 700,
    attackRetargetRadius: difficulty === 'easy' ? 7 : difficulty === 'hard' ? 4 : 6,
    attackBaseBias: difficulty === 'easy' ? 8 : difficulty === 'hard' ? 0 : 3,
    doctrineChoice: difficulty === 'easy' ? 'lineHold' : difficulty === 'hard' ? 'longReach' : 'fieldTempo',
    baseDefenseRadius: difficulty === 'easy' ? 10 : difficulty === 'hard' ? 12 : 11,
    defenseRecallWindowTicks: difficulty === 'easy' ? Math.round(SIM_HZ * 5) : difficulty === 'hard' ? Math.round(SIM_HZ * 6) : Math.round(SIM_HZ * 5),
    strategicIntent: 'stabilize',
    economicPosture: 'stable',
    assaultPosture: 'probe',
    raceDoctrine: AI_RACE_DOCTRINES.human,
    difficultyPersonality: AI_DIFFICULTY_PERSONALITIES[difficulty],
    homeReserveMin: difficulty === 'hard' ? 1 : 2,
    reserveReleaseUntilTick: -Infinity,
    lastIntentSwitchTick: 0,
    lastBaseThreatTick: -Infinity,
    lastFailedPushTick: -Infinity,
    lastWonLocalTradeTick: -Infinity,
  };
}

export function createAI(difficulty: AIDifficulty = 'medium'): AIController {
  return createAIBase(difficulty);
}

export function tickAI(state: GameState, ai: AIController, owner: 0 | 1 = 1): void {
  if (state.tick < ai.nextDecisionTick) return;

  ai.nextDecisionTick = state.tick + ai.reactionDelayTicks;

  const es = state.entities;
  const race = state.races[owner];
  applyDoctrineBias(ai, race);

  const myTH = es.find(e => e.owner === owner && e.kind === 'townhall');
  if (!myTH) return;

  const rc = RACES[race];
  const myBarracks = es.find(e => e.owner === owner && e.kind === 'barracks');
  const myLumberMill = es.find(e => e.owner === owner && e.kind === 'lumbermill');
  const myWorkers = es.filter(e => e.owner === owner && e.kind === rc.worker);
  const mySoldiers = es.filter(e => e.owner === owner &&
    (e.kind === rc.soldier || e.kind === rc.ranged || e.kind === rc.heavy));
  const farmCount = es.filter(e => e.owner === owner && e.kind === 'farm').length;
  const towerCount = es.filter(e => e.owner === owner && e.kind === 'tower').length;

  const buildingFarm = myWorkers.some(w => w.cmd?.type === 'build' && w.cmd.building === 'farm');
  const buildingBarracks = myWorkers.some(w => w.cmd?.type === 'build' && w.cmd.building === 'barracks');
  const buildingTower = myWorkers.some(w => w.cmd?.type === 'build' && w.cmd.building === 'tower');
  const buildingLumber = myWorkers.some(w => w.cmd?.type === 'build' && w.cmd.building === 'lumbermill');

  if (!state.openingPlanSelected[owner] && state.tick >= ai.openingChoiceDelayTicks) {
    state.openingPlanSelected[owner] = ai.openingPlan;
    for (const e of es) {
      if (e.owner === owner && (e.kind === 'townhall' || e.kind === 'barracks')) e.openingPlan = ai.openingPlan;
    }
  }

  const contestedMine = bestContestedMine(state, owner, ai);
  const expansionMine = bestExpansionMine(state, owner, ai);
  const defenseThreat = assessBaseThreat(state, ai, owner, myTH, myWorkers);
  const snapshot = evaluateAISnapshot(state, ai, owner, myTH, mySoldiers, defenseThreat, contestedMine, expansionMine);
  updateStrategicIntent(state, ai, snapshot);
  updateAssaultPosture(state, ai, snapshot);

  const woodDemand = estimateWoodDemand(state, ai, owner, myBarracks, myLumberMill, farmCount, towerCount, mySoldiers.length);
  keepGathering(state, myWorkers, woodDemand);

  if (defenseThreat.active) {
    ai.lastBaseThreatTick = state.tick;
    recallDefenders(state, myTH, mySoldiers, defenseThreat, ai.baseDefenseRadius, ai.homeReserveMin);
  }

  switch (ai.phase) {
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

    case 'military': {
      if (!myLumberMill && !buildingLumber && myBarracks) {
        const lumberCost = getResolvedCost('lumbermill', race);
        if (state.gold[owner] >= lumberCost.gold && state.wood[owner] >= lumberCost.wood) {
          const w = freeWorker(myWorkers);
          if (w) {
            const pos = findLumberMillSpot(state, myTH);
            if (pos) issueBuildCommand(state, w, 'lumbermill', pos, state.tick);
          }
        }
      }

      if (myLumberMill) {
        const nextUpgrade = pickNextUpgrade(state, ai, owner);
        if (nextUpgrade) tryStartLumberUpgrade(state, owner, nextUpgrade);
      }

      if (myBarracks) {
        const soldierCount = mySoldiers.filter(u => u.kind === rc.soldier).length;
        const rangedCount = mySoldiers.filter(u => u.kind === rc.ranged).length;
        const heavyCount = mySoldiers.filter(u => u.kind === rc.heavy).length;
        const totalArmy = soldierCount + rangedCount + heavyCount;
        const mixPlan = getArmyMixPlan(ai, totalArmy);
        const targetRangedCount = Math.max(0, Math.floor((totalArmy + 1) * mixPlan.rangedRatio));
        const targetHeavyCount = Math.min(ai.preferredHeavyCap, Math.max(0, Math.floor((totalArmy + 1) * mixPlan.heavyRatio)));

        const heavyCost = getResolvedCost(rc.heavy, race);
        const rangedCost = getResolvedCost(rc.ranged, race);
        const soldierCost = getResolvedCost(rc.soldier, race);
        const canHeavy = state.gold[owner] >= heavyCost.gold && state.wood[owner] >= heavyCost.wood;
        const canRanged = state.gold[owner] >= rangedCost.gold && state.wood[owner] >= rangedCost.wood;
        const canSoldier = state.gold[owner] >= soldierCost.gold && state.wood[owner] >= soldierCost.wood;

        const needFrontline = soldierCount < mixPlan.minFrontline;
        const wantHeavy = !needFrontline && heavyCount < targetHeavyCount && soldierCount >= mixPlan.minFrontline && canHeavy;
        const wantRanged = !wantHeavy && !needFrontline && rangedCount < targetRangedCount && soldierCount >= Math.max(1, mixPlan.minFrontline - 1) && canRanged;
        const nextUnit = wantHeavy ? rc.heavy : wantRanged ? rc.ranged : rc.soldier;
        const canTrainNext = wantHeavy ? canHeavy : wantRanged ? canRanged : canSoldier;
        const barracksBusy = myBarracks.cmd?.type === 'train';
        if (!barracksBusy && canTrainNext) issueTrainCommand(state, myBarracks, nextUnit);
      }
      if (!buildingFarm && state.popCap[owner] - state.pop[owner] <= 2 && farmCount < ai.maxFarms) {
        const w = freeWorker(myWorkers);
        if (w) {
          const pos = findBuildSpot(state, myTH, 'farm');
          if (pos) issueBuildCommand(state, w, 'farm', pos, state.tick);
        }
      }
      const towerCost = getResolvedCost('tower', race);
      if (!buildingTower && towerCount < ai.maxTowers && myBarracks && myLumberMill && mySoldiers.length >= ai.towerMinArmy && state.gold[owner] >= towerCost.gold && state.wood[owner] >= towerCost.wood) {
        const w = freeWorker(myWorkers);
        if (w) {
          const pos = findTowerBuildSpot(state, myTH, owner);
          if (pos) issueBuildCommand(state, w, 'tower', pos, state.tick);
        }
      }
      if (mySoldiers.length >= ai.attackWaveSize) {
        ai.phase = 'assault';
      }
      break;
    }

    case 'assault': {
      const opposingPlayerTH = es.find(e => isOwnedByOpposingPlayer(e, owner) && e.kind === 'townhall');
      const reserveCount = getHomeReserveCount(ai, mySoldiers.length, defenseThreat.active, state.tick);
      const armyRolePlan = assignArmyRoles(state, owner, myTH, mySoldiers, reserveCount, contestedMine, expansionMine, opposingPlayerTH, ai);
      const assaultAssignments = armyRolePlan.assignments.filter(entry => entry.role !== 'reserve');

      if (ai.assaultPosture === 'regroup' && myTH) {
        for (const { unit: s, role } of assaultAssignments) {
          if (s.cmd && s.cmd.type !== 'move') continue;
          const tx = role === 'rangedFollow' && armyRolePlan.frontlineAnchor
            ? Math.floor((armyRolePlan.frontlineAnchor.x + myTH.pos.x + 1) / 2)
            : Math.floor((s.pos.x + myTH.pos.x + 1) / 2);
          const ty = role === 'rangedFollow' && armyRolePlan.frontlineAnchor
            ? Math.floor((armyRolePlan.frontlineAnchor.y + myTH.pos.y + myTH.tileH) / 2)
            : Math.floor((s.pos.y + myTH.pos.y + myTH.tileH) / 2);
          const target = preferredSpreadGoal(state, s, tx, ty);
          if (!moveGoalNear(s, target.x, target.y)) issueSpreadMoveCommand(state, s, tx, ty);
        }
      } else {
        for (const { unit: s, role } of assaultAssignments) {
          if (s.cmd && s.cmd.type !== 'move') continue;

          if (armyRolePlan.harassmentUnitIds.has(s.id) && armyRolePlan.harassmentAnchor) {
            const nearestHarass = chooseWeightedTarget(state, s, owner, ai.attackRetargetRadius + 1, 'harassment');
            if (nearestHarass) {
              issueAttackCommand(s, nearestHarass.id, state.tick, state);
              continue;
            }

            const tx = armyRolePlan.harassmentAnchor.x;
            const ty = armyRolePlan.harassmentAnchor.y;
            const target = preferredSpreadGoal(state, s, tx, ty);
            if (!moveGoalNear(s, target.x, target.y)) issueSpreadMoveCommand(state, s, tx, ty);
            continue;
          }

          const nearest = role === 'rangedFollow'
            ? chooseWeightedTarget(state, s, owner, ai.attackRetargetRadius, 'rangedFollow')
            : ai.difficulty === 'easy'
              ? nearestPlayerUnit(state, s, owner, ai.attackRetargetRadius)
              : chooseWeightedTarget(state, s, owner, ai.attackRetargetRadius + (role === 'frontlineShock' ? 1 : 0), 'frontline');

          if (nearest) {
            issueAttackCommand(s, nearest.id, state.tick, state);
            if (snapshot.nearbyFriendlyArmyAtFront >= snapshot.nearbyEnemyArmyAtFront + 2) {
              ai.lastWonLocalTradeTick = state.tick;
            }
          } else if (role === 'rangedFollow' && armyRolePlan.frontlineAnchor) {
            const tx = armyRolePlan.frontlineAnchor.x;
            const ty = armyRolePlan.frontlineAnchor.y;
            const target = preferredSpreadGoal(state, s, tx, ty);
            if (!moveGoalNear(s, target.x, target.y)) issueSpreadMoveCommand(state, s, tx, ty);
          } else if (role === 'frontlineShock' && opposingPlayerTH && (ai.assaultPosture === 'commit' || ai.strategicIntent === 'pressure')) {
            const tx = opposingPlayerTH.pos.x + 1;
            const ty = opposingPlayerTH.pos.y + 2;
            const target = preferredSpreadGoal(state, s, tx, ty);
            if (!moveGoalNear(s, target.x, target.y)) issueSpreadMoveCommand(state, s, tx, ty);
          } else if ((ai.assaultPosture === 'contest' || ai.strategicIntent === 'contest') && contestedMine && Math.hypot(s.pos.x - contestedMine.pos.x, s.pos.y - contestedMine.pos.y) > ai.attackRetargetRadius) {
            const tx = contestedMine.pos.x;
            const ty = contestedMine.pos.y - 1;
            const target = preferredSpreadGoal(state, s, tx, ty);
            if (!moveGoalNear(s, target.x, target.y)) issueSpreadMoveCommand(state, s, tx, ty);
          } else if (ai.assaultPosture === 'contain' && contestedMine) {
            const tx = Math.floor((contestedMine.pos.x + (opposingPlayerTH?.pos.x ?? contestedMine.pos.x)) / 2);
            const ty = contestedMine.pos.y - 1;
            const target = preferredSpreadGoal(state, s, tx, ty);
            if (!moveGoalNear(s, target.x, target.y)) issueSpreadMoveCommand(state, s, tx, ty);
          } else if (expansionMine && mySoldiers.length >= ai.expansionMineMinArmy && ai.strategicIntent !== 'fortify') {
            const tx = expansionMine.pos.x;
            const ty = expansionMine.pos.y - 1;
            const target = preferredSpreadGoal(state, s, tx, ty);
            if (!moveGoalNear(s, target.x, target.y)) issueSpreadMoveCommand(state, s, tx, ty);
          } else if (opposingPlayerTH && ai.difficulty !== 'easy' && (ai.assaultPosture === 'commit' || ai.strategicIntent === 'pressure')) {
            const tx = opposingPlayerTH.pos.x + 1;
            const ty = opposingPlayerTH.pos.y + 2;
            const target = preferredSpreadGoal(state, s, tx, ty);
            if (!moveGoalNear(s, target.x, target.y)) issueSpreadMoveCommand(state, s, tx, ty);
          } else if (contestedMine && ai.assaultRetargetMine) {
            const tx = contestedMine.pos.x;
            const ty = contestedMine.pos.y - 1;
            const target = preferredSpreadGoal(state, s, tx, ty);
            if (!moveGoalNear(s, target.x, target.y)) issueSpreadMoveCommand(state, s, tx, ty);
          }
        }
      }

      for (const { unit: s, role } of armyRolePlan.assignments) {
        if (role !== 'reserve') continue;
        if (s.cmd && s.cmd.type !== 'move') continue;
        const tx = myTH.pos.x + 1;
        const ty = myTH.pos.y + myTH.tileH;
        const target = preferredSpreadGoal(state, s, tx, ty);
        if (!moveGoalNear(s, target.x, target.y)) issueSpreadMoveCommand(state, s, tx, ty);
      }

      if (mySoldiers.length <= ai.fallbackWaveThreshold || ai.assaultPosture === 'regroup') {
        ai.lastFailedPushTick = state.tick;
        const growth = ai.difficulty === 'easy' ? 1 : 2;
        const maxWave = ai.difficulty === 'hard' ? 11 : 12;
        ai.attackWaveSize = Math.min(maxWave, ai.attackWaveSize + growth);
        ai.phase = 'military';
      }
      break;
    }
  }
}

function applyDoctrineBias(ai: AIController, race: Race): void {
  const doctrine = AI_RACE_DOCTRINES[race];
  ai.raceDoctrine = doctrine;
  ai.homeReserveMin = Math.max(1, Math.round(1 + doctrine.reserveBias * 3 + ai.difficultyPersonality.reserveDiscipline));
  ai.preferredRangedRatio = clamp01(baseRangedRatioForDifficulty(ai.difficulty) + doctrine.rangedBias);
  ai.preferredHeavyCap = Math.max(1, Math.round(baseHeavyCapForDifficulty(ai.difficulty) + doctrine.heavyBias * 4));
  ai.towerMinArmy = Math.max(3, Math.round(baseTowerMinArmyForDifficulty(ai.difficulty) - doctrine.towerBias * 3));
  ai.workerTarget = Math.max(3, Math.round(baseWorkerTargetForDifficulty(ai.difficulty) + doctrine.economyGreedBias * 3));
  ai.attackWaveSize = Math.max(ai.fallbackWaveThreshold + 1, Math.round(baseAttackWaveForDifficulty(ai.difficulty) - doctrine.pressureBias * 3 - ai.difficultyPersonality.opportunism * 2 + ai.difficultyPersonality.caution));
}

function evaluateAISnapshot(
  state: GameState,
  ai: AIController,
  owner: 0 | 1,
  myTownHall: Entity,
  mySoldiers: Entity[],
  defenseThreat: DefenseThreatInfo,
  contestedMine: Entity | null,
  expansionMine: Entity | null,
): AISnapshot {
  const enemyArmyNearBase = state.entities.filter(e =>
    isOwnedByOpposingPlayer(e, owner) &&
    isUnitKind(e.kind) &&
    Math.hypot(e.pos.x - myTownHall.pos.x, e.pos.y - myTownHall.pos.y) <= ai.baseDefenseRadius + 2,
  ).length;
  const myWorkersUnderThreat = state.entities.filter(e => e.owner === owner && e.kind === RACES[state.races[owner]].worker && (e.underAttackTick ?? -Infinity) >= state.tick - ai.defenseRecallWindowTicks).length;
  const contestedMineFavorable = contestedMine !== null && (() => {
    const enemyTownHall = state.entities.find(e => isOwnedByOpposingPlayer(e, owner) && e.kind === 'townhall');
    if (!enemyTownHall) return false;
    const myDist = Math.hypot(contestedMine.pos.x - myTownHall.pos.x, contestedMine.pos.y - myTownHall.pos.y);
    const enemyDist = Math.hypot(contestedMine.pos.x - enemyTownHall.pos.x, contestedMine.pos.y - enemyTownHall.pos.y);
    return myDist <= enemyDist + 3;
  })();

  const frontReference = contestedMine ?? expansionMine;
  const nearbyFriendlyArmyAtFront = frontReference
    ? mySoldiers.filter(e => Math.hypot(e.pos.x - frontReference.pos.x, e.pos.y - frontReference.pos.y) <= 8).length
    : 0;
  const nearbyEnemyArmyAtFront = frontReference
    ? state.entities.filter(e => isOwnedByOpposingPlayer(e, owner) && isUnitKind(e.kind) && Math.hypot(e.pos.x - frontReference.pos.x, e.pos.y - frontReference.pos.y) <= 8).length
    : 0;
  const enemyTownHall = state.entities.find(e => isOwnedByOpposingPlayer(e, owner) && e.kind === 'townhall');

  return {
    myArmySize: mySoldiers.length,
    enemyArmyNearBase,
    myWorkersUnderThreat,
    myTownHallUnderThreat: defenseThreat.active && defenseThreat.severe,
    contestedMineFavorable,
    safeExpansionExists: expansionMine !== null && !defenseThreat.active,
    recentBaseThreat: ai.lastBaseThreatTick >= state.tick - ai.defenseRecallWindowTicks,
    nearbyFriendlyArmyAtFront,
    nearbyEnemyArmyAtFront,
    enemyTownHallDistance: enemyTownHall ? Math.hypot(enemyTownHall.pos.x - myTownHall.pos.x, enemyTownHall.pos.y - myTownHall.pos.y) : null,
    recentFailedPush: ai.lastFailedPushTick >= state.tick - Math.round(SIM_HZ * 20),
    recentWonLocalTrade: ai.lastWonLocalTradeTick >= state.tick - Math.round(SIM_HZ * 12),
  };
}

function updateStrategicIntent(state: GameState, ai: AIController, snapshot: AISnapshot): void {
  let nextIntent: AIStrategicIntent = ai.strategicIntent;
  let nextPosture: AIEconomicPosture = ai.economicPosture;

  if (snapshot.myTownHallUnderThreat || snapshot.enemyArmyNearBase >= 3 || snapshot.myWorkersUnderThreat >= 2) {
    nextIntent = 'fortify';
    nextPosture = 'fortify';
  } else if (snapshot.recentFailedPush && snapshot.myArmySize < ai.attackWaveSize + 1) {
    nextIntent = 'regroup';
    nextPosture = 'recover';
  } else if (snapshot.myArmySize < ai.attackWaveSize - 1 || snapshot.recentBaseThreat) {
    nextIntent = 'stabilize';
    nextPosture = snapshot.recentBaseThreat ? 'recover' : 'stable';
  } else if (snapshot.recentWonLocalTrade && snapshot.contestedMineFavorable) {
    nextIntent = 'contain';
    nextPosture = 'stable';
  } else if (snapshot.contestedMineFavorable && ai.raceDoctrine.pressureBias < 0.25) {
    nextIntent = 'contest';
    nextPosture = 'stable';
  } else if (snapshot.contestedMineFavorable || (snapshot.safeExpansionExists && ai.difficultyPersonality.opportunism > 0.35)) {
    nextIntent = 'pressure';
    nextPosture = snapshot.safeExpansionExists && ai.raceDoctrine.economyGreedBias > 0.1 ? 'greed' : 'stable';
  } else {
    nextIntent = ai.difficulty === 'easy' ? 'stabilize' : 'contest';
    nextPosture = 'stable';
  }

  if (nextIntent !== ai.strategicIntent) ai.lastIntentSwitchTick = state.tick;
  ai.strategicIntent = nextIntent;
  ai.economicPosture = nextPosture;
}

function updateAssaultPosture(state: GameState, ai: AIController, snapshot: AISnapshot): void {
  if (ai.strategicIntent === 'fortify') {
    ai.assaultPosture = 'regroup';
    return;
  }
  if (ai.strategicIntent === 'regroup' || snapshot.recentFailedPush) {
    ai.assaultPosture = 'regroup';
    return;
  }
  if (ai.strategicIntent === 'contain' || snapshot.recentWonLocalTrade) {
    ai.assaultPosture = 'contain';
    return;
  }
  if (ai.strategicIntent === 'pressure' && snapshot.nearbyFriendlyArmyAtFront >= snapshot.nearbyEnemyArmyAtFront) {
    ai.assaultPosture = snapshot.nearbyFriendlyArmyAtFront >= snapshot.nearbyEnemyArmyAtFront + 2 ? 'commit' : 'probe';
    return;
  }
  if (ai.strategicIntent === 'contest') {
    ai.assaultPosture = 'contest';
    return;
  }
  ai.assaultPosture = 'probe';
}

function getArmyMixPlan(ai: AIController, totalArmy: number): ArmyMixPlan {
  const doctrine = ai.raceDoctrine;

  if (ai.difficulty === 'easy') {
    if (totalArmy < 6) return { rangedRatio: clamp01(0 + doctrine.rangedBias), heavyRatio: clamp01(0 + doctrine.heavyBias * 0.5), minFrontline: Math.max(3, Math.round(4 + doctrine.frontlineBias)) };
    if (totalArmy < 11) return { rangedRatio: clamp01(0.2 + doctrine.rangedBias), heavyRatio: clamp01(0.1 + doctrine.heavyBias * 0.5), minFrontline: Math.max(3, Math.round(4 + doctrine.frontlineBias)) };
    return { rangedRatio: clamp01(0.28 + doctrine.rangedBias), heavyRatio: clamp01(0.18 + doctrine.heavyBias * 0.5), minFrontline: Math.max(4, Math.round(5 + doctrine.frontlineBias)) };
  }
  if (ai.difficulty === 'hard') {
    if (totalArmy < 4) return { rangedRatio: clamp01(0.2 + doctrine.rangedBias), heavyRatio: clamp01(0.05 + doctrine.heavyBias), minFrontline: Math.max(2, Math.round(2 + doctrine.frontlineBias)) };
    if (totalArmy < 8) return { rangedRatio: clamp01(0.45 + doctrine.rangedBias), heavyRatio: clamp01(0.25 + doctrine.heavyBias), minFrontline: Math.max(2, Math.round(2 + doctrine.frontlineBias)) };
    return { rangedRatio: clamp01(0.55 + doctrine.rangedBias), heavyRatio: clamp01(0.33 + doctrine.heavyBias), minFrontline: Math.max(2, Math.round(3 + doctrine.frontlineBias)) };
  }

  if (totalArmy < 5) return { rangedRatio: clamp01(0.1 + doctrine.rangedBias), heavyRatio: clamp01(0 + doctrine.heavyBias * 0.5), minFrontline: Math.max(2, Math.round(3 + doctrine.frontlineBias)) };
  if (totalArmy < 10) return { rangedRatio: clamp01(0.33 + doctrine.rangedBias), heavyRatio: clamp01(0.18 + doctrine.heavyBias), minFrontline: Math.max(2, Math.round(3 + doctrine.frontlineBias)) };
  return { rangedRatio: clamp01(0.42 + doctrine.rangedBias), heavyRatio: clamp01(0.25 + doctrine.heavyBias), minFrontline: Math.max(3, Math.round(4 + doctrine.frontlineBias)) };
}

function doctrineKind(choice: AIController['doctrineChoice']): LumberUpgradeKind {
  return choice === 'fieldTempo'
    ? 'doctrineFieldTempo'
    : choice === 'lineHold'
      ? 'doctrineLineHold'
      : 'doctrineLongReach';
}

function pickNextUpgrade(state: GameState, ai: AIController, owner: 0 | 1): LumberUpgradeKind | null {
  const upgrades = state.upgrades[owner];
  if (upgrades.pendingLumberUpgrade) return null;

  if (!upgrades.doctrine && state.gold[owner] >= DOCTRINE_COST.gold && state.wood[owner] >= DOCTRINE_COST.wood) {
    return doctrineKind(ai.doctrineChoice);
  }

  const raceUpgrades = RACE_BALANCE_PROFILES[state.races[owner]].upgrades;
  const ladder: Array<{ kind: LumberUpgradeKind; current: number; max: number; gold: number; wood: number; slot: number }> = [
    {
      kind: 'meleeAttack',
      current: upgrades.meleeAttackLevel,
      max: raceUpgrades.meleeAttack.maxLevel,
      gold: raceUpgrades.meleeAttack.cost.gold,
      wood: raceUpgrades.meleeAttack.cost.wood,
      slot: 0,
    },
    {
      kind: 'armor',
      current: upgrades.armorLevel,
      max: raceUpgrades.armor.maxLevel,
      gold: raceUpgrades.armor.cost.gold,
      wood: raceUpgrades.armor.cost.wood,
      slot: 1,
    },
    {
      kind: 'buildingHp',
      current: upgrades.buildingHpLevel,
      max: raceUpgrades.buildingHp.maxLevel,
      gold: raceUpgrades.buildingHp.cost.gold,
      wood: raceUpgrades.buildingHp.cost.wood,
      slot: 2,
    },
  ];

  const maxTier = Math.max(...ladder.map(entry => entry.max));
  for (let tier = 1; tier <= maxTier; tier++) {
    for (const entry of ladder) {
      if (entry.current >= tier || entry.max < tier) continue;
      if (ai.difficulty === 'medium' && ((tier - 1) * ladder.length + entry.slot) % 2 === 1) continue;
      if (state.gold[owner] < entry.gold || state.wood[owner] < entry.wood) continue;
      return entry.kind;
    }
  }

  return null;
}

function keepGathering(state: GameState, workers: Entity[], desiredWoodWorkers: number): void {
  const activeWoodWorkers = workers.filter(w => w.cmd?.type === 'gather' && w.cmd.resourceType === 'wood').length;
  let woodAssignmentsNeeded = Math.max(0, Math.min(desiredWoodWorkers, workers.length) - activeWoodWorkers);

  for (const w of workers) {
    if (w.cmd && w.cmd.type !== 'gather') continue;
    if (w.cmd?.type === 'gather') {
      const gatherCmd = w.cmd;
      if (gatherCmd.resourceType === 'gold') {
        const mine = state.entities.find(e => e.id === gatherCmd.targetId);
        if (mine && (mine.goldReserve ?? 0) > 0 && woodAssignmentsNeeded <= 0) continue;
      } else {
        const tx = gatherCmd.targetId % MAP_W;
        const ty = Math.floor(gatherCmd.targetId / MAP_W);
        const tile = state.tiles[ty]?.[tx];
        if (tile?.kind === 'tree' && (tile.woodReserve ?? 0) > 0) {
          continue;
        }
      }
    }

    if (woodAssignmentsNeeded > 0) {
      const treeId = nearestTree(state, w);
      if (treeId !== null) {
        issueGatherCommand(state, w, treeId, state.tick);
        woodAssignmentsNeeded--;
        continue;
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
    if (d < bestD || (d === bestD && best && e.id < best.id)) { bestD = d; best = e; }
  }
  return best;
}

function nearestTree(state: GameState, unit: Entity): number | null {
  let bestId: number | null = null;
  let bestD = Infinity;
  for (let ty = 0; ty < state.tiles.length; ty++) {
    for (let tx = 0; tx < state.tiles[ty].length; tx++) {
      const tile = state.tiles[ty][tx];
      if (tile?.kind !== 'tree' || (tile.woodReserve ?? 0) <= 0) continue;
      const d = Math.hypot(tx - unit.pos.x, ty - unit.pos.y);
      if (d < bestD) {
        bestD = d;
        bestId = ty * MAP_W + tx;
      }
    }
  }
  return bestId;
}

function footprintNearestTreeDistance(state: GameState, tx: number, ty: number, tileW: number, tileH: number): number {
  let best = Infinity;
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const tile = state.tiles[y]?.[x];
      if (tile?.kind !== 'tree' || (tile.woodReserve ?? 0) <= 0) continue;
      const nx = Math.max(tx, Math.min(x, tx + tileW - 1));
      const ny = Math.max(ty, Math.min(y, ty + tileH - 1));
      const d = Math.max(Math.abs(x - nx), Math.abs(y - ny));
      if (d < best) best = d;
    }
  }
  return best;
}

function findLumberMillSpot(state: GameState, anchor: Entity): Vec2 | null {
  let best: Vec2 | null = null;
  let bestScore = Infinity;
  const { tileW, tileH } = getResolvedTileSize('lumbermill');

  for (let r = 2; r <= 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const tx = anchor.pos.x + dx;
        const ty = anchor.pos.y + dy;
        if (!isValidPlacement(state, 'lumbermill', tx, ty)) continue;
        const treeDist = footprintNearestTreeDistance(state, tx, ty, tileW, tileH);
        const anchorDist = Math.max(Math.abs(dx), Math.abs(dy));
        const score = treeDist * 100 + anchorDist;
        if (!best || score < bestScore) {
          best = { x: tx, y: ty };
          bestScore = score;
        }
      }
    }
  }

  return best ?? findBuildSpot(state, anchor, 'lumbermill');
}

type DefenseThreatInfo = {
  active: boolean;
  severe: boolean;
  targets: Entity[];
  defendPoint: Vec2;
};

function assessBaseThreat(state: GameState, ai: AIController, owner: 0 | 1, myTownHall: Entity, myWorkers: Entity[]): DefenseThreatInfo {
  const recentWindowStart = state.tick - ai.defenseRecallWindowTicks;
  const nearbyEnemyUnits = state.entities.filter(e =>
    isOwnedByOpposingPlayer(e, owner) &&
    isUnitKind(e.kind) &&
    Math.hypot(e.pos.x - myTownHall.pos.x, e.pos.y - myTownHall.pos.y) <= ai.baseDefenseRadius,
  );
  const townHallUnderAttack = (myTownHall.underAttackTick ?? -Infinity) >= recentWindowStart;
  const attackedWorkers = myWorkers.filter(w => (w.underAttackTick ?? -Infinity) >= recentWindowStart);

  const targets = nearbyEnemyUnits.length > 0
    ? nearbyEnemyUnits
    : townHallUnderAttack || attackedWorkers.length > 0
      ? state.entities.filter(e =>
        isOwnedByOpposingPlayer(e, owner) &&
        isUnitKind(e.kind) &&
        Math.hypot(e.pos.x - myTownHall.pos.x, e.pos.y - myTownHall.pos.y) <= ai.baseDefenseRadius + 4,
      )
      : [];

  const severe = townHallUnderAttack || targets.length >= 4 || attackedWorkers.length >= 2;
  const workerFocus = attackedWorkers[0]?.pos;
  const targetFocus = targets[0]?.pos;
  return {
    active: targets.length > 0 || townHallUnderAttack || attackedWorkers.length > 0,
    severe,
    targets,
    defendPoint: workerFocus ?? targetFocus ?? { x: myTownHall.pos.x + 1, y: myTownHall.pos.y + myTownHall.tileH },
  };
}

function recallDefenders(state: GameState, myTownHall: Entity, mySoldiers: Entity[], threat: DefenseThreatInfo, defenseRadius: number, reserveMin: number): void {
  if (mySoldiers.length === 0) return;

  const desiredFraction = threat.severe ? 1 : 0.55;
  const desiredCount = Math.max(1, Math.ceil(mySoldiers.length * desiredFraction));
  const availableCount = Math.max(1, mySoldiers.length - Math.max(0, reserveMin));
  const finalCount = Math.min(desiredCount, availableCount);
  const sortedByBaseDistance = [...mySoldiers]
    .sort((a, b) => Math.hypot(a.pos.x - myTownHall.pos.x, a.pos.y - myTownHall.pos.y) - Math.hypot(b.pos.x - myTownHall.pos.x, b.pos.y - myTownHall.pos.y));

  for (const unit of sortedByBaseDistance.slice(0, finalCount)) {
    const target = nearestThreat(unit, threat.targets);
    if (target && Math.hypot(unit.pos.x - target.pos.x, unit.pos.y - target.pos.y) <= defenseRadius + 2) {
      issueAttackCommand(unit, target.id, state.tick, state);
      continue;
    }

    const moveTarget = preferredSpreadGoal(state, unit, threat.defendPoint.x, threat.defendPoint.y);
    if (!moveGoalNear(unit, moveTarget.x, moveTarget.y)) {
      issueSpreadMoveCommand(state, unit, threat.defendPoint.x, threat.defendPoint.y);
    }
  }
}

function nearestThreat(unit: Entity, threats: Entity[]): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const t of threats) {
    const d = Math.hypot(unit.pos.x - t.pos.x, unit.pos.y - t.pos.y);
    if (d < bestD || (d === bestD && best && t.id < best.id)) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

function estimateWoodDemand(state: GameState, ai: AIController, owner: 0 | 1, myBarracks: Entity | undefined, myLumberMill: Entity | undefined, farmCount: number, towerCount: number, soldierCount: number): number {
  let demand = 0;
  const wood = state.wood[owner];
  const races = state.races[owner];
  const farmCost = getResolvedCost('farm', races).wood;
  const lumberCost = getResolvedCost('lumbermill', races).wood;
  const towerCost = getResolvedCost('tower', races).wood;
  const soldierCost = getResolvedCost(RACES[races].soldier, races).wood;

  if (!myLumberMill) demand += lumberCost;
  if (state.popCap[owner] - state.pop[owner] <= 2 && farmCount < ai.maxFarms) demand += farmCost;
  if (myBarracks) demand += soldierCost * Math.max(1, Math.min(2, ai.attackWaveSize - soldierCount));
  if (myLumberMill && !state.upgrades[owner].doctrine) demand += DOCTRINE_COST.wood;
  if (myBarracks && soldierCount >= ai.towerMinArmy && towerCount < ai.maxTowers) demand += towerCost;
  if (ai.economicPosture === 'fortify') demand += towerCost;
  if (ai.economicPosture === 'greed') demand = Math.max(0, demand - Math.round(soldierCost * 0.5));

  if (wood < Math.max(40, demand)) return Math.min(3, Math.max(1, Math.ceil((Math.max(40, demand) - wood) / 60)));
  return wood < 120 ? 1 : 0;
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

function findTowerBuildSpot(state: GameState, myTownHall: Entity, owner: 0 | 1): Vec2 | null {
  const candidates: Vec2[] = [];
  const seen = new Set<string>();
  const push = (x: number, y: number) => {
    const key = `${x},${y}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ x, y });
  };

  const enemyTownHall = state.entities.find(e => isOwnedByOpposingPlayer(e, owner) && e.kind === 'townhall');
  if (enemyTownHall) {
    const dirX = Math.sign(enemyTownHall.pos.x - myTownHall.pos.x);
    const dirY = Math.sign(enemyTownHall.pos.y - myTownHall.pos.y);
    const sideX = dirY;
    const sideY = -dirX;
    for (const d of [4, 6, 8]) {
      const cx = myTownHall.pos.x + dirX * d;
      const cy = myTownHall.pos.y + dirY * d;
      push(cx, cy);
      push(cx + sideX, cy + sideY);
      push(cx - sideX, cy - sideY);
    }
  }

  const nearestMine = state.entities
    .filter(e => e.kind === 'goldmine' && (e.goldReserve ?? 0) > 0)
    .sort((a, b) => Math.hypot(a.pos.x - myTownHall.pos.x, a.pos.y - myTownHall.pos.y) - Math.hypot(b.pos.x - myTownHall.pos.x, b.pos.y - myTownHall.pos.y))[0];
  if (nearestMine) {
    push(nearestMine.pos.x - 1, nearestMine.pos.y - 1);
    push(nearestMine.pos.x + nearestMine.tileW, nearestMine.pos.y - 1);
    push(nearestMine.pos.x - 1, nearestMine.pos.y + nearestMine.tileH);
    push(nearestMine.pos.x + nearestMine.tileW, nearestMine.pos.y + nearestMine.tileH);
  }

  const lumberMill = state.entities.find(e => e.owner === owner && e.kind === 'lumbermill');
  if (lumberMill) {
    push(lumberMill.pos.x - 2, lumberMill.pos.y);
    push(lumberMill.pos.x + lumberMill.tileW + 1, lumberMill.pos.y);
    push(lumberMill.pos.x, lumberMill.pos.y + lumberMill.tileH + 1);
  }

  push(myTownHall.pos.x - 2, myTownHall.pos.y + 1);
  push(myTownHall.pos.x + myTownHall.tileW + 1, myTownHall.pos.y + 1);
  push(myTownHall.pos.x + 1, myTownHall.pos.y - 2);
  push(myTownHall.pos.x + 1, myTownHall.pos.y + myTownHall.tileH + 1);

  for (const candidate of candidates) {
    if (isValidPlacement(state, 'tower', candidate.x, candidate.y)) return candidate;
  }

  return findBuildSpot(state, myTownHall, 'tower');
}

function nearestPlayerEntity(state: GameState, unit: Entity, owner: 0 | 1, maxDistance = Infinity): Entity | null {
  let best: Entity | null = null; let bestD = Infinity;
  for (const e of state.entities) {
    if (!isOwnedByOpposingPlayer(e, owner) || e.kind === 'goldmine' || e.kind === 'barrier') continue;
    const d = Math.hypot(e.pos.x - unit.pos.x, e.pos.y - unit.pos.y);
    if (d > maxDistance) continue;
    if (d < bestD || (d === bestD && best && e.id < best.id)) { bestD = d; best = e; }
  }
  return best;
}

function nearestPlayerUnit(state: GameState, unit: Entity, owner: 0 | 1, maxDistance = Infinity): Entity | null {
  let best: Entity | null = null; let bestD = Infinity;
  for (const e of state.entities) {
    if (!isOwnedByOpposingPlayer(e, owner) || !isUnitKind(e.kind)) continue;
    const d = Math.hypot(e.pos.x - unit.pos.x, e.pos.y - unit.pos.y);
    if (d > maxDistance) continue;
    if (d < bestD || (d === bestD && best && e.id < best.id)) { bestD = d; best = e; }
  }
  return best;
}

function chooseWeightedTarget(
  state: GameState,
  unit: Entity,
  owner: 0 | 1,
  maxDistance: number,
  role: TargetSelectionRole,
): Entity | null {
  let best: Entity | null = null;
  let bestScore = -Infinity;

  for (const e of state.entities) {
    if (!isOwnedByOpposingPlayer(e, owner) || e.kind === 'goldmine' || e.kind === 'barrier') continue;
    const distance = Math.hypot(e.pos.x - unit.pos.x, e.pos.y - unit.pos.y);
    if (distance > maxDistance) continue;

    const score = scoreTargetForRole(state, unit, e, distance, role);
    if (score > bestScore || (score === bestScore && best && e.id < best.id)) {
      best = e;
      bestScore = score;
    }
  }

  return best;
}

function scoreTargetForRole(
  state: GameState,
  unit: Entity,
  target: Entity,
  distance: number,
  role: TargetSelectionRole,
): number {
  let score = -distance * (role === 'harassment' ? 0.55 : role === 'rangedFollow' ? 0.65 : 0.8);

  if (isUnitKind(target.kind)) score += 4;
  if (target.kind === 'townhall' || target.kind === 'barracks' || target.kind === 'tower' || target.kind === 'farm' || target.kind === 'lumbermill') score += role === 'frontline' ? 1.5 : -1;

  const missingHp = Math.max(0, (target.hpMax ?? target.hp) - target.hp);
  score += Math.min(4, missingHp / 25);

  const recentlyHit = (target.underAttackTick ?? -Infinity) >= state.tick - Math.round(SIM_HZ * 3);
  if (recentlyHit) score += 1.2;

  if (role === 'harassment') {
    if (target.kind === 'worker' || target.kind === 'peon') score += 8;
    if (target.kind === 'archer' || target.kind === 'troll') score += 5;
    if (target.kind === 'townhall') score -= 4;
    if (target.kind === 'tower') score -= 6;
  } else if (role === 'rangedFollow') {
    if (target.kind === 'archer' || target.kind === 'troll') score += 6;
    if (target.kind === 'worker' || target.kind === 'peon') score += 3;
    if (target.kind === 'tower') score -= 5;
  } else {
    if (target.kind === 'worker' || target.kind === 'peon') score += 1;
    if (target.kind === 'archer' || target.kind === 'troll') score += 2;
    if (target.kind === 'tower') score -= 1.5;
    if (target.kind === 'townhall') score += 2;
  }

  const targetIsRanged = target.kind === 'archer' || target.kind === 'troll';
  if (targetIsRanged && role !== 'frontline') score += 1.5;

  return score;
}

function bestContestedMine(state: GameState, owner: 0 | 1, ai: AIController): Entity | null {
  let best: Entity | null = null;
  let bestScore = -Infinity;
  const myTownHall = state.entities.find(e => e.owner === owner && e.kind === 'townhall');
  const enemyTownHall = state.entities.find(e => isOwnedByOpposingPlayer(e, owner) && e.kind === 'townhall');
  if (!myTownHall || !enemyTownHall) return null;

  for (const e of state.entities) {
    if (e.kind !== 'goldmine' || (e.goldReserve ?? 0) <= 0) continue;
    const myDist = Math.hypot(e.pos.x - myTownHall.pos.x, e.pos.y - myTownHall.pos.y);
    const enemyDist = Math.hypot(e.pos.x - enemyTownHall.pos.x, e.pos.y - enemyTownHall.pos.y);
    const centerBias = e.pos.x > 16 && e.pos.x < 48 ? 6 : 0;
    const score = (e.goldReserve ?? 0) / 100 + centerBias - Math.abs(myDist - enemyDist) * 0.2 - ai.attackBaseBias * 0.15;
    if (score > bestScore || (score === bestScore && best && e.id < best.id)) {
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
  const enemyTownHall = state.entities.find(e => isOwnedByOpposingPlayer(e, owner) && e.kind === 'townhall');
  if (!myTownHall || !enemyTownHall) return null;

  for (const e of state.entities) {
    if (e.kind !== 'goldmine' || (e.goldReserve ?? 0) < ai.expansionMineReserveMin) continue;
    const myDist = Math.hypot(e.pos.x - myTownHall.pos.x, e.pos.y - myTownHall.pos.y);
    const enemyDist = Math.hypot(e.pos.x - enemyTownHall.pos.x, e.pos.y - enemyTownHall.pos.y);
    if (myDist >= enemyDist) continue;
    const score = (e.goldReserve ?? 0) / 100 - myDist * 0.25 + enemyDist * 0.12;
    if (score > bestScore || (score === bestScore && best && e.id < best.id)) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

function getHomeReserveCount(ai: AIController, soldierCount: number, defenseActive: boolean, tick: number): number {
  if (soldierCount <= 1) return 0;
  const baseReserve = ai.homeReserveMin;
  if (defenseActive) ai.reserveReleaseUntilTick = tick + Math.round(SIM_HZ * 10);
  if (!defenseActive && tick <= ai.reserveReleaseUntilTick) return Math.max(0, Math.min(soldierCount - 1, baseReserve - 1));
  if (defenseActive || ai.strategicIntent === 'fortify') return Math.min(Math.max(0, soldierCount - 1), baseReserve + 1);
  if (ai.strategicIntent === 'pressure') return Math.max(0, baseReserve - 1);
  if (ai.strategicIntent === 'regroup') return Math.min(Math.max(0, soldierCount - 1), baseReserve + 1);
  return Math.min(Math.max(0, soldierCount - 1), baseReserve);
}

function assignArmyRoles(
  state: GameState,
  owner: 0 | 1,
  myTownHall: Entity,
  mySoldiers: Entity[],
  reserveCount: number,
  contestedMine: Entity | null,
  expansionMine: Entity | null,
  opposingPlayerTH: Entity | undefined,
  ai: AIController,
): ArmyRolePlan {
  const rc = RACES[state.races[owner]];
  const sorted = [...mySoldiers].sort((a, b) => a.id - b.id);
  const reserveIds = new Set(sorted.slice(0, reserveCount).map(unit => unit.id));
  const pressureTarget = ai.assaultPosture === 'contain'
    ? contestedMine ?? expansionMine ?? opposingPlayerTH ?? myTownHall
    : ai.assaultPosture === 'contest'
      ? contestedMine ?? expansionMine ?? opposingPlayerTH ?? myTownHall
      : opposingPlayerTH ?? contestedMine ?? expansionMine ?? myTownHall;
  const frontlineUnits = sorted.filter(unit => !reserveIds.has(unit.id) && unit.kind !== rc.ranged);
  const frontliner = frontlineUnits[0] ?? sorted.find(unit => !reserveIds.has(unit.id)) ?? null;
  const frontlineAnchor = frontliner ? computeFrontlineAnchor(frontliner, pressureTarget, myTownHall, ai, contestedMine) : null;
  const harassmentUnitIds = selectHarassmentUnits(ai, sorted, reserveIds, rc.ranged);
  const harassmentAnchor = harassmentUnitIds.size > 0
    ? computeHarassmentAnchor(myTownHall, contestedMine, expansionMine, opposingPlayerTH)
    : null;

  return {
    frontlineAnchor,
    harassmentAnchor,
    harassmentUnitIds,
    assignments: sorted.map(unit => ({
      unit,
      role: reserveIds.has(unit.id)
        ? 'reserve'
        : unit.kind === rc.ranged
          ? 'rangedFollow'
          : unit.kind === rc.heavy
            ? 'frontlineShock'
            : 'frontlineLine',
    })),
  };
}

function computeFrontlineAnchor(frontliner: Entity, pressureTarget: Entity, myTownHall: Entity, ai: AIController, contestedMine: Entity | null): Vec2 {
  if (ai.assaultPosture === 'regroup') {
    return {
      x: Math.floor((frontliner.pos.x + myTownHall.pos.x + 1) / 2),
      y: Math.floor((frontliner.pos.y + myTownHall.pos.y + myTownHall.tileH) / 2),
    };
  }

  if (contestedMine && ai.assaultPosture !== 'commit') {
    return {
      x: Math.floor((frontliner.pos.x + contestedMine.pos.x * 2) / 3),
      y: Math.floor((frontliner.pos.y + contestedMine.pos.y * 2) / 3),
    };
  }

  const ratio = ai.assaultPosture === 'commit' ? 0.82 : ai.assaultPosture === 'contain' ? 0.58 : ai.assaultPosture === 'contest' ? 0.64 : 0.72;
  return {
    x: Math.floor(frontliner.pos.x * (1 - ratio) + pressureTarget.pos.x * ratio),
    y: Math.floor(frontliner.pos.y * (1 - ratio) + pressureTarget.pos.y * ratio),
  };
}

function selectHarassmentUnits(ai: AIController, soldiers: Entity[], reserveIds: Set<number>, rangedKind: Entity['kind']): Set<number> {
  if (ai.difficulty !== 'hard' || soldiers.length < Math.max(ai.attackWaveSize + 2, 6) || ai.assaultPosture === 'regroup') return new Set<number>();
  const candidates = soldiers.filter(unit => !reserveIds.has(unit.id) && unit.kind === rangedKind).slice(0, 2);
  return new Set(candidates.map(unit => unit.id));
}

function computeHarassmentAnchor(
  myTownHall: Entity,
  contestedMine: Entity | null,
  expansionMine: Entity | null,
  opposingPlayerTH: Entity | undefined,
): Vec2 | null {
  const target = contestedMine ?? expansionMine ?? opposingPlayerTH;
  if (!target) return null;
  return {
    x: Math.floor((myTownHall.pos.x + target.pos.x * 2) / 3),
    y: Math.floor((myTownHall.pos.y + target.pos.y * 2) / 3),
  };
}

function baseAttackWaveForDifficulty(difficulty: AIDifficulty): number {
  return difficulty === 'easy' ? 99 : difficulty === 'hard' ? 9 : 7;
}

function baseWorkerTargetForDifficulty(difficulty: AIDifficulty): number {
  return difficulty === 'easy' ? 3 : difficulty === 'hard' ? 5 : 4;
}

function baseTowerMinArmyForDifficulty(difficulty: AIDifficulty): number {
  return difficulty === 'easy' ? 6 : difficulty === 'hard' ? 4 : 5;
}

function baseRangedRatioForDifficulty(difficulty: AIDifficulty): number {
  return difficulty === 'easy' ? 0.15 : difficulty === 'hard' ? 0.6 : 0.4;
}

function baseHeavyCapForDifficulty(difficulty: AIDifficulty): number {
  return difficulty === 'easy' ? 1 : difficulty === 'hard' ? 3 : 2;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
