import assert from 'node:assert/strict';
import { buildMapById } from '../data/maps';
import { createWorld } from './world';
import { spawnEntity } from './entities';
import { createAI, tickAI } from './ai';
import { NEUTRAL, SIM_HZ, type Entity, type GameState } from '../types';

function makeState(): GameState {
  const map = buildMapById(1);
  return createWorld(map, ['orc', 'human']);
}

function seedBase(state: GameState): { myTownHall: Entity; enemyTownHall: Entity; contestedMine: Entity } {
  const map = buildMapById(1);
  const myTownHall = spawnEntity(state, 'townhall', 1, map.aiStart);
  const enemyTownHall = spawnEntity(state, 'townhall', 0, map.playerStart);
  const contestedMine = spawnEntity(state, 'goldmine', NEUTRAL, { x: 31, y: 32 });
  spawnEntity(state, 'goldmine', NEUTRAL, { x: 12, y: 12 });
  spawnEntity(state, 'goldmine', NEUTRAL, { x: 52, y: 50 });
  return { myTownHall, enemyTownHall, contestedMine };
}

function seedLowArmyEndgame(state: GameState): { myTownHall: Entity; enemyTownHall: Entity; contestedMine: Entity } {
  const seeded = seedBase(state);
  spawnEntity(state, 'worker', 1, { x: seeded.myTownHall.pos.x + 1, y: seeded.myTownHall.pos.y + 3 });
  state.gold[1] = 0;
  state.wood[1] = 0;

  spawnEntity(state, 'footman', 1, { x: 26, y: 29 });
  spawnEntity(state, 'footman', 1, { x: 27, y: 29 });
  spawnEntity(state, 'archer', 1, { x: 25, y: 29 });
  spawnEntity(state, 'footman', 1, { x: 28, y: 29 });

  spawnEntity(state, 'tower', 0, { x: seeded.enemyTownHall.pos.x + 5, y: seeded.enemyTownHall.pos.y + 1 });

  state.tick = 800;
  return seeded;
}

function testEndgameDropsStaleFrontObjective(): void {
  const state = makeState();
  const { contestedMine } = seedLowArmyEndgame(state);

  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.lastPressureObjective = { type: 'contestedMine', targetId: contestedMine.id, anchor: { x: contestedMine.pos.x, y: contestedMine.pos.y - 1 } };
  ai.lastPressureObjectiveTick = state.tick - Math.round(SIM_HZ * 20);
  ai.lastObjectivePivotTick = state.tick - Math.round(SIM_HZ * 20);

  tickAI(state, ai, 1);

  assert.ok(ai.lastPressureObjective, 'objective should remain active, but not stale front lock');
  assert.notEqual(ai.lastPressureObjective?.type, 'contestedMine');
  assert.notEqual(ai.lastPressureObjective?.type, 'containFront');
  assert.notEqual(ai.lastPressureObjective?.type, 'expansionMine');
}

function testEndgamePivotsTowardEnemyBaseProgress(): void {
  const state = makeState();
  const { contestedMine } = seedLowArmyEndgame(state);

  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.lastPressureObjective = { type: 'containFront', targetId: contestedMine.id, anchor: { x: contestedMine.pos.x, y: contestedMine.pos.y - 1 } };
  ai.lastPressureObjectiveTick = state.tick - Math.round(SIM_HZ * 20);
  ai.lastObjectivePivotTick = state.tick - Math.round(SIM_HZ * 20);

  tickAI(state, ai, 1);

  assert.ok(ai.lastPressureObjective);
  assert.ok(
    ai.lastPressureObjective?.type === 'enemyApproach' || ai.lastPressureObjective?.type === 'pressureProduction',
    'endgame override should pivot toward enemy-base progress objective',
  );
}

function testEndgameReserveCapKeepsAttackMass(): void {
  const state = makeState();
  const { myTownHall, contestedMine } = seedLowArmyEndgame(state);

  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.homeReserveMin = 3;
  ai.lastPressureObjective = { type: 'contestedMine', targetId: contestedMine.id, anchor: { x: contestedMine.pos.x, y: contestedMine.pos.y - 1 } };
  ai.lastPressureObjectiveTick = state.tick - Math.round(SIM_HZ * 20);
  ai.lastObjectivePivotTick = state.tick - Math.round(SIM_HZ * 20);

  tickAI(state, ai, 1);

  const homeAnchor = { x: myTownHall.pos.x + 1, y: myTownHall.pos.y + myTownHall.tileH };
  const myArmy = state.entities.filter(e => e.owner === 1 && ['footman', 'archer'].includes(e.kind));
  const nearHomeCommands = myArmy.filter(u =>
    u.cmd?.type === 'move' && Math.hypot(u.cmd.goal.x - homeAnchor.x, u.cmd.goal.y - homeAnchor.y) <= 4,
  ).length;

  assert.ok(nearHomeCommands <= 1, `expected reserve cap <= 1 in endgame override, got ${nearHomeCommands}`);
}

function testSevereHomeThreatOverridesEndgamePush(): void {
  const state = makeState();
  const { myTownHall, contestedMine } = seedLowArmyEndgame(state);

  spawnEntity(state, 'grunt', 0, { x: myTownHall.pos.x + 1, y: myTownHall.pos.y + 1 });
  spawnEntity(state, 'grunt', 0, { x: myTownHall.pos.x + 2, y: myTownHall.pos.y + 1 });
  spawnEntity(state, 'grunt', 0, { x: myTownHall.pos.x + 1, y: myTownHall.pos.y + 2 });
  spawnEntity(state, 'grunt', 0, { x: myTownHall.pos.x + 2, y: myTownHall.pos.y + 2 });

  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.lastPressureObjective = { type: 'contestedMine', targetId: contestedMine.id, anchor: { x: contestedMine.pos.x, y: contestedMine.pos.y - 1 } };
  ai.lastPressureObjectiveTick = state.tick - Math.round(SIM_HZ * 20);
  ai.lastObjectivePivotTick = state.tick - Math.round(SIM_HZ * 20);

  tickAI(state, ai, 1);

  assert.equal(ai.assaultPosture, 'regroup');
  assert.equal(ai.lastPressureObjective?.type, 'homeGuard');
}

function testNonEndgameBehaviorUnchanged(): void {
  const state = makeState();
  const { contestedMine } = seedBase(state);
  spawnEntity(state, 'worker', 1, { x: 45, y: 12 });
  spawnEntity(state, 'worker', 1, { x: 44, y: 12 });
  state.gold[1] = 200;
  state.tick = 820;

  spawnEntity(state, 'footman', 1, { x: 26, y: 29 });
  spawnEntity(state, 'footman', 1, { x: 27, y: 29 });
  spawnEntity(state, 'archer', 1, { x: 25, y: 29 });
  spawnEntity(state, 'footman', 1, { x: 28, y: 29 });

  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.lastPressureObjective = { type: 'contestedMine', targetId: contestedMine.id, anchor: { x: contestedMine.pos.x, y: contestedMine.pos.y - 1 } };
  ai.lastPressureObjectiveTick = state.tick - Math.round(SIM_HZ * 20);
  ai.lastObjectivePivotTick = state.tick;

  tickAI(state, ai, 1);

  assert.ok(ai.lastPressureObjective);
  assert.ok(
    ai.lastPressureObjective?.type === 'contestedMine' || ai.lastPressureObjective?.type === 'containFront',
    'outside narrow endgame override, existing contested/front behavior should remain',
  );
}

function run(): void {
  testEndgameDropsStaleFrontObjective();
  testEndgamePivotsTowardEnemyBaseProgress();
  testEndgameReserveCapKeepsAttackMass();
  testSevereHomeThreatOverridesEndgamePush();
  testNonEndgameBehaviorUnchanged();
  console.log('ai endgame objective tests passed');
}

run();
