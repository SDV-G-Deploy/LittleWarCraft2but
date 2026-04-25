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

function testRecentFailedPushCausesRegroupPosture(): void {
  const state = makeState();
  seedMatch(state);
  state.tick = 300;
  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.lastFailedPushTick = state.tick;
  spawnEntity(state, 'grunt', 1, { x: 22, y: 22 });
  spawnEntity(state, 'grunt', 1, { x: 23, y: 22 });

  tickAI(state, ai, 1);

  assert.equal(ai.strategicIntent, 'regroup');
  assert.equal(ai.assaultPosture, 'regroup');
}

function testWonLocalTradePreservesNonRegroupPosture(): void {
  const state = makeState();
  seedMatch(state);
  state.tick = 400;
  spawnEntity(state, 'grunt', 1, { x: 22, y: 22 });
  spawnEntity(state, 'grunt', 1, { x: 23, y: 22 });
  spawnEntity(state, 'grunt', 1, { x: 22, y: 23 });

  const ai = createAI('hard');
  ai.lastWonLocalTradeTick = state.tick;
  ai.phase = 'assault';
  tickAI(state, ai, 1);

  assert.notEqual(ai.assaultPosture, 'regroup', 'successful local trade should not immediately collapse into regroup posture');
}

function run(): void {
  testRecentFailedPushCausesRegroupPosture();
  testWonLocalTradePreservesNonRegroupPosture();
  console.log('ai posture tests passed');
}

run();
