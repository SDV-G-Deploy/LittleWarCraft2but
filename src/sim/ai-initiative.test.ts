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

function testOrcParityChoosesProbePressureAndMeaningfulCommands(): void {
  const { state, contestedMine } = seedParityState(['human', 'orc'], 1);
  seedOrcParityArmy(state);

  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.homeReserveMin = 0;
  tickAI(state, ai, 1);

  assert.equal(ai.assaultPosture, 'probe');
  assert.ok(ai.raceDoctrine.harassBias > 0);
  assert.equal(ai.lastPressureObjective?.type, 'harassWorkers');

  const units = combatUnits(state, 1);
  assert.ok(units.length >= 3);
  const commanded = units.filter(u => u.cmd && (u.cmd.type === 'move' || u.cmd.type === 'attack'));
  assert.ok(commanded.length >= units.length - 1, 'orc parity front should actively command nearly all assault units');
  assert.ok(commanded.some(u => u.cmd?.type === 'move' && (u.cmd.goal.x < contestedMine.pos.x || u.cmd.goal.y > contestedMine.pos.y)), 'orc should issue forward pressure / harassment movement instead of static holds');
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

function testNoCommandStarvationOnStaleParityCommands(): void {
  const { state } = seedParityState(['human', 'orc'], 1);
  seedOrcParityArmy(state);

  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.homeReserveMin = 0;

  const units = combatUnits(state, 1);
  units[0].cmd = null;
  units[1].cmd = { type: 'move', goal: { x: units[1].pos.x, y: units[1].pos.y }, path: [], stepTick: 0, attackMove: false, lastPos: { ...units[1].pos }, lastProgressTick: 0, repathCount: 0, blockedAllyStreak: 0, blockedAllyTile: null };
  units[2].cmd = { type: 'move', goal: { x: units[2].pos.x + 1, y: units[2].pos.y + 1 }, path: [{ x: units[2].pos.x + 1, y: units[2].pos.y + 1 }], stepTick: 0, attackMove: false, lastPos: { ...units[2].pos }, lastProgressTick: 0, repathCount: 3, blockedAllyStreak: 8, blockedAllyTile: null };

  tickAI(state, ai, 1);

  const commanded = units.filter(u => u.cmd && (u.cmd.type === 'move' || u.cmd.type === 'attack'));
  assert.ok(commanded.length >= units.length - 1, 'stale/null assault commands should be replaced for nearly all assault units in parity state');
}

function run(): void {
  testHumanParityChoosesContainAndMeaningfulCommands();
  testOrcParityChoosesProbePressureAndMeaningfulCommands();
  testRaceDivergenceOnSameParitySetup();
  testNoCommandStarvationOnStaleParityCommands();
  console.log('ai initiative tests passed');
}

run();
