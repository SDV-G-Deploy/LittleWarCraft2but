import assert from 'node:assert/strict';
import { buildMapById } from '../data/maps';
import { createWorld } from './world';
import { spawnEntity } from './entities';
import { processAttack, issueAttackCommand } from './combat';
import type { GameState } from '../types';

function makeState(): GameState {
  const map = buildMapById(1);
  return createWorld(map, ['human', 'orc']);
}

function testBlockedChaseRespectsMovementCadence(): void {
  const state = makeState();
  state.tick = 120;

  const attacker = spawnEntity(state, 'footman', 0, { x: 20, y: 20 });
  const target = spawnEntity(state, 'grunt', 1, { x: 24, y: 20 });

  // Hard-box attacker so only the occupied front tile exists, forcing blocked/repath chase outcome.
  spawnEntity(state, 'footman', 0, { x: 21, y: 20 });
  spawnEntity(state, 'wall', 2, { x: 19, y: 19 });
  spawnEntity(state, 'wall', 2, { x: 19, y: 20 });
  spawnEntity(state, 'wall', 2, { x: 19, y: 21 });
  spawnEntity(state, 'wall', 2, { x: 20, y: 19 });
  spawnEntity(state, 'wall', 2, { x: 20, y: 21 });
  spawnEntity(state, 'wall', 2, { x: 21, y: 19 });
  spawnEntity(state, 'wall', 2, { x: 21, y: 21 });

  const issued = issueAttackCommand(attacker, target.id, state.tick, state);
  assert.equal(issued, true);
  assert.equal(attacker.cmd?.type, 'attack');

  const before = attacker.cmd!.chaseStepTick;
  processAttack(state, attacker);

  assert.equal(before, 120, 'test setup must preserve initial chase step tick');
  assert.equal(attacker.cmd?.type, 'attack');
  assert.equal(
    attacker.cmd?.chaseStepTick,
    state.tick,
    'blocked/repath chase should still update chaseStepTick to preserve movement cadence and avoid per-tick thrash',
  );
}

function run(): void {
  testBlockedChaseRespectsMovementCadence();
  console.log('combat congestion tests passed');
}

run();
