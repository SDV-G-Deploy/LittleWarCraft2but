import assert from 'node:assert/strict';
import { buildMapById } from '../data/maps';
import { createWorld } from './world';
import { spawnEntity } from './entities';
import { createAI, tickAI } from './ai';
import { NEUTRAL, type Entity, type GameState, type Race } from '../types';

function makeState(races: [Race, Race]): GameState {
  const map = buildMapById(1);
  return createWorld(map, races);
}

function seedParityState(races: [Race, Race], owner: 0 | 1): { state: GameState; contestedMine: Entity } {
  const state = makeState(races);
  const map = buildMapById(1);
  const enemy = owner === 0 ? 1 : 0;
  const ownerStart = owner === 0 ? map.playerStart : map.aiStart;
  const enemyStart = owner === 0 ? map.aiStart : map.playerStart;

  spawnEntity(state, 'townhall', owner, ownerStart);
  spawnEntity(state, state.races[owner] === 'human' ? 'worker' : 'peon', owner, { x: ownerStart.x + 1, y: ownerStart.y + 3 });
  spawnEntity(state, 'townhall', enemy, enemyStart);
  spawnEntity(state, state.races[enemy] === 'human' ? 'worker' : 'peon', enemy, { x: enemyStart.x + 3, y: enemyStart.y + 1 });

  const contestedMine = spawnEntity(state, 'goldmine', NEUTRAL, { x: 31, y: 32 });
  spawnEntity(state, 'goldmine', NEUTRAL, { x: 10, y: 12 });
  spawnEntity(state, 'goldmine', NEUTRAL, { x: 52, y: 50 });

  state.tick = 600;
  return { state, contestedMine };
}

function combatUnits(state: GameState, owner: 0 | 1): Entity[] {
  return state.entities.filter(e => e.owner === owner && ['footman', 'grunt', 'archer', 'troll', 'knight', 'ogreFighter'].includes(e.kind));
}

function seedHumanParityArmy(state: GameState): void {
  spawnEntity(state, 'footman', 1, { x: 27, y: 28 });
  spawnEntity(state, 'footman', 1, { x: 28, y: 29 });
  spawnEntity(state, 'archer', 1, { x: 26, y: 29 });
  spawnEntity(state, 'grunt', 0, { x: 34, y: 33 });
  spawnEntity(state, 'grunt', 0, { x: 35, y: 33 });
  spawnEntity(state, 'troll', 0, { x: 36, y: 34 });
}

function seedOrcParityArmy(state: GameState): void {
  spawnEntity(state, 'grunt', 1, { x: 27, y: 28 });
  spawnEntity(state, 'grunt', 1, { x: 28, y: 29 });
  spawnEntity(state, 'troll', 1, { x: 26, y: 29 });
  spawnEntity(state, 'footman', 0, { x: 34, y: 33 });
  spawnEntity(state, 'footman', 0, { x: 35, y: 33 });
  spawnEntity(state, 'archer', 0, { x: 36, y: 34 });
  spawnEntity(state, 'worker', 0, { x: 9, y: 49 });
}

function testHumanParityChoosesContainAndMeaningfulCommands(): void {
  const { state, contestedMine } = seedParityState(['orc', 'human'], 1);
  seedHumanParityArmy(state);

  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.homeReserveMin = 0;
  tickAI(state, ai, 1);

  assert.equal(ai.assaultPosture, 'contain');
  assert.ok(ai.raceDoctrine.guardBias > ai.raceDoctrine.harassBias);

  const units = combatUnits(state, 1);
  assert.ok(units.length >= 3);
  const commanded = units.filter(u => u.cmd && (u.cmd.type === 'move' || u.cmd.type === 'attack'));
  assert.ok(commanded.length >= units.length - 1, 'human parity front should actively command nearly all assault units');
  assert.ok(commanded.some(u => u.cmd?.type === 'move' && (u.cmd.goal.x > 40 || Math.abs(u.cmd.goal.x - contestedMine.pos.x) <= 8)), 'human should issue positional contain movement instead of idling');
}

function testOrcParityHarassmentStaysBounded(): void {
  const { state } = seedParityState(['human', 'orc'], 1);
  seedOrcParityArmy(state);
  spawnEntity(state, 'grunt', 1, { x: 29, y: 29 });
  spawnEntity(state, 'troll', 1, { x: 25, y: 28 });

  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.homeReserveMin = 0;
  tickAI(state, ai, 1);

  assert.equal(ai.assaultPosture, 'probe');
  assert.equal(ai.lastPressureObjective?.type, 'harassWorkers');

  const orcUnits = combatUnits(state, 1);
  const farHarassMoves = orcUnits.filter(u => u.cmd?.type === 'move' && u.cmd.goal.x <= 15 && u.cmd.goal.y >= 40);
  const frontlineMoves = orcUnits.filter(u => u.cmd?.type === 'move' && (u.cmd.goal.x >= 20 || u.cmd.goal.y <= 30));
  assert.ok(farHarassMoves.length < orcUnits.length, 'orc worker harassment should not pull the entire army off the front');
  assert.ok(frontlineMoves.length >= 1, 'main orc force should keep a front pressure objective');
}

function testExposedWorkerPreferredOverSafeWorker(): void {
  const { state } = seedParityState(['human', 'orc'], 1);
  seedOrcParityArmy(state);
  const enemyTownHall = state.entities.find(e => e.owner === 0 && e.kind === 'townhall');
  assert.ok(enemyTownHall);
  const safeWorker = state.entities.find(e => e.owner === 0 && e.kind === 'worker');
  assert.ok(safeWorker);
  safeWorker.pos = { x: enemyTownHall.pos.x + 1, y: enemyTownHall.pos.y + 1 };
  const exposedWorker = spawnEntity(state, 'worker', 0, { x: 18, y: 45 });
  exposedWorker.cmd = { type: 'gather', targetId: 3, resourceType: 'gold', phase: 'returning', waitTicks: 0 };

  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.homeReserveMin = 0;
  tickAI(state, ai, 1);

  assert.equal(ai.lastPressureObjective?.type, 'harassWorkers');
  assert.equal(ai.lastPressureObjective?.targetId, exposedWorker.id, 'exposed worker should be preferred over safe worker near town hall');
}

function testRaceDivergenceOnSameParitySetup(): void {
  const human = seedParityState(['orc', 'human'], 1);
  seedHumanParityArmy(human.state);
  const humanAI = createAI('hard');
  humanAI.phase = 'assault';
  humanAI.homeReserveMin = 0;
  tickAI(human.state, humanAI, 1);

  const orc = seedParityState(['human', 'orc'], 1);
  seedOrcParityArmy(orc.state);
  const orcAI = createAI('hard');
  orcAI.phase = 'assault';
  orcAI.homeReserveMin = 0;
  tickAI(orc.state, orcAI, 1);

  assert.notEqual(humanAI.assaultPosture, orcAI.assaultPosture, 'human and orc should diverge in parity posture');
  assert.notEqual(humanAI.raceDoctrine.guardBias > humanAI.raceDoctrine.harassBias, orcAI.raceDoctrine.guardBias > orcAI.raceDoctrine.harassBias, 'human and orc doctrine should point to different parity behaviors');
}

function testStaleMoveNearPressureObjectiveGetsReissued(): void {
  const { state } = seedParityState(['human', 'orc'], 1);
  seedOrcParityArmy(state);
  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.homeReserveMin = 0;
  ai.attackRetargetRadius = 0;

  const unit = combatUnits(state, 1).find(u => u.kind === 'troll');
  assert.ok(unit);
  unit.pos = { x: 9, y: 47 };
  unit.cmd = { type: 'move', goal: { x: 9, y: 48 }, path: [], stepTick: 0, attackMove: false, lastPos: { ...unit.pos }, lastProgressTick: 0, repathCount: 3, blockedAllyStreak: 8, blockedAllyTile: null };
  tickAI(state, ai, 1);

  assert.ok(unit.cmd);
  assert.equal(unit.cmd?.type, 'move');
  assert.ok((unit.cmd?.path.length ?? 0) > 0 || (unit.cmd?.blockedAllyStreak ?? 0) < 8, 'stale move near objective should be refreshed, not kept in stale blocked state');
}

function testInvalidPressureObjectiveDoesNotPersistForever(): void {
  const { state } = seedParityState(['human', 'orc'], 1);
  seedOrcParityArmy(state);
  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.homeReserveMin = 0;
  tickAI(state, ai, 1);

  const targetId = ai.lastPressureObjective?.targetId;
  assert.ok(targetId !== null && targetId !== undefined);
  state.entities = state.entities.filter(e => e.id !== targetId);
  state.tick += ai.reactionDelayTicks;
  tickAI(state, ai, 1);

  assert.notEqual(ai.lastPressureObjective?.targetId, targetId, 'dead/invalid pressure objective should be dropped or replaced on reevaluation');
}

function run(): void {
  testHumanParityChoosesContainAndMeaningfulCommands();
  testOrcParityHarassmentStaysBounded();
  testExposedWorkerPreferredOverSafeWorker();
  testRaceDivergenceOnSameParitySetup();
  testStaleMoveNearPressureObjectiveGetsReissued();
  testInvalidPressureObjectiveDoesNotPersistForever();
  console.log('ai initiative tests passed');
}

run();
