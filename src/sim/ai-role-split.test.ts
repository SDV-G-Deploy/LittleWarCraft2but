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
  testReserveStaysNearHomeDuringAssault();
  console.log('ai role split tests passed');
}

run();
