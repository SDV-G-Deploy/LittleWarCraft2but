import assert from 'node:assert/strict';
import { buildMapById } from '../data/maps';
import { createWorld } from './world';
import { spawnEntity } from './entities';
import { createAI, tickAI } from './ai';
import { NEUTRAL, type GameState } from '../types';

function makeState(): GameState {
  const map = buildMapById(1);
  return createWorld(map, ['human', 'orc']);
}

function seedMatch(state: GameState): void {
  const map = buildMapById(1);
  spawnEntity(state, 'townhall', 0, map.playerStart);
  spawnEntity(state, 'worker', 0, { x: map.playerStart.x + 3, y: map.playerStart.y + 1 });
  spawnEntity(state, 'townhall', 1, map.aiStart);
  spawnEntity(state, 'peon', 1, { x: map.aiStart.x + 1, y: map.aiStart.y + 3 });
  spawnEntity(state, 'goldmine', NEUTRAL, { x: 31, y: 32 });
}

function testRangedUnitsFollowFrontlineAnchor(): void {
  const state = makeState();
  seedMatch(state);
  state.tick = 500;

  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.strategicIntent = 'pressure';
  ai.assaultPosture = 'commit';

  const gruntA = spawnEntity(state, 'grunt', 1, { x: 22, y: 22 });
  spawnEntity(state, 'grunt', 1, { x: 23, y: 22 });
  const troll = spawnEntity(state, 'troll', 1, { x: 18, y: 18 });
  spawnEntity(state, 'footman', 0, { x: 40, y: 40 });

  tickAI(state, ai, 1);

  assert.equal(gruntA.cmd?.type, 'move');
  assert.equal(troll.cmd?.type, 'move');
  assert.ok(troll.cmd && gruntA.cmd);
  assert.ok(troll.cmd.goal.x <= gruntA.cmd.goal.x, 'ranged follow should not overrun frontline anchor on x');
  assert.ok(troll.cmd.goal.y <= gruntA.cmd.goal.y, 'ranged follow should not overrun frontline anchor on y');
}

function testHardModeCanAssignBoundedHarassmentSubgroup(): void {
  const state = makeState();
  seedMatch(state);
  state.tick = 510;

  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.strategicIntent = 'pressure';
  ai.assaultPosture = 'probe';
  ai.attackWaveSize = 4;
  ai.homeReserveMin = 1;

  spawnEntity(state, 'grunt', 1, { x: 22, y: 22 });
  spawnEntity(state, 'grunt', 1, { x: 23, y: 22 });
  const trollA = spawnEntity(state, 'troll', 1, { x: 20, y: 20 });
  const trollB = spawnEntity(state, 'troll', 1, { x: 21, y: 20 });
  spawnEntity(state, 'footman', 0, { x: 34, y: 33 });

  tickAI(state, ai, 1);

  assert.equal(trollA.cmd?.type, 'move');
  assert.equal(trollB.cmd?.type, 'move');
  assert.ok(trollA.cmd && trollB.cmd);
  assert.ok(trollA.cmd.goal.x < 40, 'harassment subgroup should stage short of full base dive');
  assert.ok(trollB.cmd.goal.x < 40, 'harassment subgroup should stay bounded');
}

function testHarassmentPrefersWorkersOverStructures(): void {
  const state = makeState();
  seedMatch(state);
  state.tick = 515;

  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.strategicIntent = 'pressure';
  ai.assaultPosture = 'probe';
  ai.attackWaveSize = 4;
  ai.homeReserveMin = 1;

  spawnEntity(state, 'grunt', 1, { x: 22, y: 22 });
  spawnEntity(state, 'grunt', 1, { x: 23, y: 22 });
  const trollA = spawnEntity(state, 'troll', 1, { x: 29, y: 29 });
  const trollB = spawnEntity(state, 'troll', 1, { x: 30, y: 29 });
  const worker = spawnEntity(state, 'worker', 0, { x: 32, y: 30 });
  spawnEntity(state, 'farm', 0, { x: 32, y: 32 });

  tickAI(state, ai, 1);

  assert.equal(trollA.cmd?.type, 'attack');
  assert.equal(trollB.cmd?.type, 'attack');
  assert.equal(trollA.cmd?.targetId, worker.id, 'harassment should prefer exposed workers');
  assert.equal(trollB.cmd?.targetId, worker.id, 'harassment should prefer exposed workers');
}

function testRangedFollowPrefersEnemyRangedLocally(): void {
  const state = makeState();
  seedMatch(state);
  state.tick = 518;

  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.strategicIntent = 'pressure';
  ai.assaultPosture = 'commit';
  ai.homeReserveMin = 0;

  spawnEntity(state, 'grunt', 1, { x: 22, y: 22 });
  spawnEntity(state, 'grunt', 1, { x: 23, y: 22 });
  const troll = spawnEntity(state, 'troll', 1, { x: 29, y: 29 });
  const enemyWorker = spawnEntity(state, 'worker', 0, { x: 31, y: 30 });
  const enemyArcher = spawnEntity(state, 'archer', 0, { x: 31, y: 29 });

  tickAI(state, ai, 1);

  assert.equal(troll.cmd?.type, 'attack');
  assert.notEqual(enemyWorker.id, enemyArcher.id);
  assert.equal(troll.cmd?.targetId, enemyArcher.id, 'ranged follow should prefer nearby enemy ranged units');
}

function testHeavyFrontlineShockCanLeanDeeperThanLineUnits(): void {
  const state = makeState();
  seedMatch(state);
  state.tick = 519;

  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.strategicIntent = 'pressure';
  ai.assaultPosture = 'commit';
  ai.homeReserveMin = 0;

  const grunt = spawnEntity(state, 'grunt', 1, { x: 27, y: 27 });
  const ogre = spawnEntity(state, 'ogreFighter', 1, { x: 28, y: 27 });
  spawnEntity(state, 'troll', 1, { x: 26, y: 27 });
  spawnEntity(state, 'footman', 0, { x: 45, y: 40 });

  tickAI(state, ai, 1);

  assert.equal(grunt.cmd?.type, 'move');
  assert.equal(ogre.cmd?.type, 'move');
  assert.ok(grunt.cmd && ogre.cmd);
  assert.ok(ogre.cmd.goal.x >= grunt.cmd.goal.x, 'heavy shock unit should be allowed to lean deeper on x');
}

function testReserveReleaseDisciplineAfterThreat(): void {
  const state = makeState();
  seedMatch(state);
  state.tick = 521;

  const ai = createAI('medium');
  ai.phase = 'assault';
  ai.strategicIntent = 'stabilize';
  ai.assaultPosture = 'probe';
  ai.homeReserveMin = 2;
  ai.reserveReleaseUntilTick = state.tick + 30;

  const reserveA = spawnEntity(state, 'grunt', 1, { x: 24, y: 24 });
  const reserveB = spawnEntity(state, 'grunt', 1, { x: 25, y: 24 });
  spawnEntity(state, 'grunt', 1, { x: 26, y: 24 });
  spawnEntity(state, 'troll', 1, { x: 27, y: 24 });

  tickAI(state, ai, 1);

  const movedDeep = [reserveA, reserveB].filter(unit => unit.cmd?.type === 'move' && unit.cmd.goal.x >= 35).length;
  assert.ok(movedDeep <= 1, 'reserve release hysteresis should avoid dumping full reserve immediately after threat clears');
}

function testReserveStaysNearHomeDuringAssault(): void {
  const state = makeState();
  seedMatch(state);
  state.tick = 520;

  const ai = createAI('medium');
  ai.phase = 'assault';
  ai.strategicIntent = 'stabilize';
  ai.assaultPosture = 'probe';
  ai.homeReserveMin = 2;

  const reserveA = spawnEntity(state, 'grunt', 1, { x: 24, y: 24 });
  const reserveB = spawnEntity(state, 'grunt', 1, { x: 25, y: 24 });
  spawnEntity(state, 'grunt', 1, { x: 26, y: 24 });
  spawnEntity(state, 'troll', 1, { x: 27, y: 24 });

  tickAI(state, ai, 1);

  assert.equal(reserveA.cmd?.type, 'move');
  assert.equal(reserveB.cmd?.type, 'move');
  assert.ok(reserveA.cmd && reserveB.cmd);
  assert.ok(reserveA.cmd.goal.x < 35, 'reserve should stay home-side instead of joining deep assault');
  assert.ok(reserveB.cmd.goal.x < 35, 'reserve should stay home-side instead of joining deep assault');
}

function run(): void {
  testRangedUnitsFollowFrontlineAnchor();
  testHardModeCanAssignBoundedHarassmentSubgroup();
  testHarassmentPrefersWorkersOverStructures();
  testRangedFollowPrefersEnemyRangedLocally();
  testHeavyFrontlineShockCanLeanDeeperThanLineUnits();
  testReserveReleaseDisciplineAfterThreat();
  testReserveStaysNearHomeDuringAssault();
  console.log('ai role split tests passed');
}

run();
