import assert from 'node:assert/strict';
import { buildMapById } from '../data/maps';
import { createWorld } from './world';
import { spawnEntity } from './entities';
import { createAllyBlockPolicyState, tryAdvancePathWithAvoidance } from './movement';
import type { GameState } from '../types';

function makeState(): GameState {
  const map = buildMapById(1);
  return createWorld(map, ['human', 'orc']);
}

function testAllyBlockWaitBudgetThenSidestep(): void {
  const state = makeState();
  const mover = spawnEntity(state, 'footman', 0, { x: 20, y: 20 });
  spawnEntity(state, 'footman', 0, { x: 21, y: 20 });

  const path = [{ x: 21, y: 20 }, { x: 22, y: 20 }];
  const policy = createAllyBlockPolicyState();

  const first = tryAdvancePathWithAvoidance(state, mover, path, { x: 22, y: 20 }, policy);
  const second = tryAdvancePathWithAvoidance(state, mover, path, { x: 22, y: 20 }, policy);
  const third = tryAdvancePathWithAvoidance(state, mover, path, { x: 22, y: 20 }, policy);

  assert.equal(first, 'blocked', 'first allied blockage should consume wait budget');
  assert.equal(second, 'blocked', 'second allied blockage should still wait');
  assert.equal(third, 'sidestep', 'after short wait budget, unit should attempt deterministic sidestep');
  assert.notEqual(mover.pos.x, 20, 'sidestep should move unit off origin x');
}

function testWorkerSwapWhenEconomyFlowOptionEnabled(): void {
  const state = makeState();
  const mover = spawnEntity(state, 'worker', 0, { x: 20, y: 20 });
  const blocker = spawnEntity(state, 'worker', 0, { x: 21, y: 20 });

  const path = [{ x: 21, y: 20 }, { x: 22, y: 20 }];
  const policy = createAllyBlockPolicyState();

  const step = tryAdvancePathWithAvoidance(
    state,
    mover,
    path,
    { x: 22, y: 20 },
    policy,
    undefined,
    { allowAllyWorkerSwap: true },
  );

  assert.equal(step, 'moved', 'economy worker flow should allow allied worker swap');
  assert.deepEqual(mover.pos, { x: 21, y: 20 }, 'mover should advance into blocked tile after swap');
  assert.deepEqual(blocker.pos, { x: 20, y: 20 }, 'blocking worker should be swapped back');
  assert.equal(path.length, 1, 'path should consume one step after successful swap movement');
}

function testWorkerPrefersSidestepBeforeRepathWhenBlockedByAlliedCombatUnit(): void {
  const state = makeState();
  const worker = spawnEntity(state, 'worker', 0, { x: 20, y: 20 });
  spawnEntity(state, 'footman', 0, { x: 21, y: 20 });

  const path = [{ x: 21, y: 20 }, { x: 22, y: 20 }];
  const policy = createAllyBlockPolicyState();

  const first = tryAdvancePathWithAvoidance(
    state,
    worker,
    path,
    { x: 22, y: 20 },
    policy,
    () => [{ x: 21, y: 20 }, { x: 22, y: 20 }],
    { preferSidestepBeforeRepathOnAllyBlock: true },
  );
  const second = tryAdvancePathWithAvoidance(
    state,
    worker,
    path,
    { x: 22, y: 20 },
    policy,
    () => [{ x: 21, y: 20 }, { x: 22, y: 20 }],
    { preferSidestepBeforeRepathOnAllyBlock: true },
  );
  const third = tryAdvancePathWithAvoidance(
    state,
    worker,
    path,
    { x: 22, y: 20 },
    policy,
    () => [{ x: 21, y: 20 }, { x: 22, y: 20 }],
    { preferSidestepBeforeRepathOnAllyBlock: true },
  );

  assert.equal(first, 'blocked');
  assert.equal(second, 'blocked');
  assert.equal(third, 'sidestep', 'worker should sidestep allied combat block instead of repathing to the same blocked tile');
  assert.notDeepEqual(worker.pos, { x: 20, y: 20 }, 'worker should move off origin to break ally-block loop');
}

function testWorkerBypassSwapDoesNotApplyToMovingAlliedCombatUnit(): void {
  const state = makeState();
  const worker = spawnEntity(state, 'worker', 0, { x: 20, y: 20 });
  const ally = spawnEntity(state, 'footman', 0, { x: 21, y: 20 });
  ally.cmd = {
    type: 'move',
    path: [{ x: 22, y: 20 }],
    stepTick: 0,
    attackMove: false,
    goal: { x: 22, y: 20 },
    lastPos: { x: 21, y: 20 },
    lastProgressTick: 0,
    repathCount: 0,
    blockedAllyStreak: 0,
    blockedAllyTile: null,
  };

  const path = [{ x: 21, y: 20 }, { x: 22, y: 20 }];
  const policy = createAllyBlockPolicyState();

  const first = tryAdvancePathWithAvoidance(
    state,
    worker,
    path,
    { x: 22, y: 20 },
    policy,
    undefined,
    { allowWorkerSwapWithStationaryAlliedCombat: true },
  );

  assert.equal(first, 'blocked', 'worker bypass swap should not displace allied combat units that are already moving');
  assert.deepEqual(worker.pos, { x: 20, y: 20 });
  assert.deepEqual(ally.pos, { x: 21, y: 20 });
}

function run(): void {
  testAllyBlockWaitBudgetThenSidestep();
  testWorkerSwapWhenEconomyFlowOptionEnabled();
  testWorkerPrefersSidestepBeforeRepathWhenBlockedByAlliedCombatUnit();
  testWorkerBypassSwapDoesNotApplyToMovingAlliedCombatUnit();
  console.log('movement policy tests passed');
}

run();
