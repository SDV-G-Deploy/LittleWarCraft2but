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

function testAssaultRetargetUsesSpreadGoals(): void {
  const state = makeState();
  state.tick = 200;

  spawnEntity(state, 'townhall', 1, { x: 8, y: 8 });
  spawnEntity(state, 'townhall', 0, { x: 54, y: 54 });
  spawnEntity(state, 'goldmine', NEUTRAL, { x: 31, y: 32 });
  spawnEntity(state, 'goldmine', NEUTRAL, { x: 24, y: 24 });

  const s1 = spawnEntity(state, 'grunt', 1, { x: 10, y: 10 });
  const s2 = spawnEntity(state, 'grunt', 1, { x: 11, y: 10 });
  const s3 = spawnEntity(state, 'grunt', 1, { x: 10, y: 11 });
  const s4 = spawnEntity(state, 'grunt', 1, { x: 11, y: 11 });

  const ai = createAI('hard');
  ai.phase = 'assault';

  tickAI(state, ai, 1);

  const soldiers = [s1, s2, s3, s4];
  for (const soldier of soldiers) {
    assert.equal(soldier.cmd?.type, 'move', 'assault soldiers should get move retarget when no nearby enemies');
  }

  const moveGoals = soldiers.map(s => {
    assert.equal(s.cmd?.type, 'move');
    return s.cmd.goal;
  });
  const goalKeys = new Set(moveGoals.map(goal => `${goal.x},${goal.y}`));
  assert.ok(goalKeys.size >= 2, 'assault retarget should spread soldiers across nearby goals instead of one exact tile');
}

function run(): void {
  testAssaultRetargetUsesSpreadGoals();
  console.log('ai goal spread tests passed');
}

run();
