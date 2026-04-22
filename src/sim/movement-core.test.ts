import assert from 'node:assert/strict';
import { buildMapById } from '../data/maps';
import { createWorld } from './world';
import { spawnEntity } from './entities';
import type { GameState, Vec2 } from '../types';
import {
  MOVE_STEP_POLICY,
  advanceMovementStepCore,
  beginMovementResolutionTick,
  endMovementResolutionTick,
  type MovementStepPolicy,
} from './movement';

function makeState(): GameState {
  const map = buildMapById(1);
  return createWorld(map, ['human', 'orc']);
}

function withMovementTick(state: GameState, fn: () => void): void {
  beginMovementResolutionTick(state.tick);
  try {
    fn();
  } finally {
    endMovementResolutionTick();
  }
}

function testCoreMovesOnOpenTile(): void {
  const state = makeState();
  const mover = spawnEntity(state, 'footman', 0, { x: 20, y: 20 });
  const path: Vec2[] = [{ x: 21, y: 20 }];

  withMovementTick(state, () => {
    const result = advanceMovementStepCore({
      state,
      entity: mover,
      path,
      goal: { x: 25, y: 20 },
      policy: MOVE_STEP_POLICY,
    });
    assert.equal(result, 'moved');
  });

  assert.equal(mover.pos.x, 21);
  assert.equal(mover.pos.y, 20);
  assert.equal(path.length, 0);
}

function testCoreKeepsDeterministicReservationOrder(): void {
  const state = makeState();
  const first = spawnEntity(state, 'footman', 0, { x: 20, y: 20 });
  const second = spawnEntity(state, 'footman', 0, { x: 22, y: 20 });

  const firstPath: Vec2[] = [{ x: 21, y: 20 }];
  const secondPath: Vec2[] = [{ x: 21, y: 20 }];

  withMovementTick(state, () => {
    const firstResult = advanceMovementStepCore({
      state,
      entity: first,
      path: firstPath,
      goal: { x: 21, y: 20 },
      policy: MOVE_STEP_POLICY,
    });
    const secondResult = advanceMovementStepCore({
      state,
      entity: second,
      path: secondPath,
      goal: { x: 21, y: 20 },
      policy: { ...MOVE_STEP_POLICY, allowSidestep: false },
    });

    assert.equal(firstResult, 'moved');
    assert.equal(secondResult, 'blocked');
  });

  assert.deepEqual(first.pos, { x: 21, y: 20 });
  assert.deepEqual(second.pos, { x: 22, y: 20 });
}

function testCoreCanDisableSidestepForFutureProfiles(): void {
  const state = makeState();
  const mover = spawnEntity(state, 'footman', 0, { x: 20, y: 20 });
  spawnEntity(state, 'footman', 1, { x: 21, y: 20 });
  const path: Vec2[] = [{ x: 21, y: 20 }, { x: 22, y: 20 }];

  const policy: MovementStepPolicy = {
    allowRepath: false,
    allowSidestep: false,
    clearPathOnSidestepRepathFailure: true,
  };

  withMovementTick(state, () => {
    const result = advanceMovementStepCore({
      state,
      entity: mover,
      path,
      goal: { x: 22, y: 20 },
      policy,
    });
    assert.equal(result, 'blocked');
  });

  assert.deepEqual(mover.pos, { x: 20, y: 20 });
  assert.equal(path.length, 2, 'path should stay intact when hard-blocked');
}

function run(): void {
  testCoreMovesOnOpenTile();
  testCoreKeepsDeterministicReservationOrder();
  testCoreCanDisableSidestepForFutureProfiles();
  console.log('movement core tests passed');
}

run();
