import assert from 'node:assert/strict';
import { buildMapById } from '../data/maps';
import { createWorld } from './world';
import { spawnEntity } from './entities';
import { processGather, issueGatherCommand } from './economy';
import { processCommandPass } from './commands';
import type { Entity, GameState } from '../types';

function makeState(): GameState {
  const map = buildMapById(1);
  return createWorld(map, ['human', 'orc']);
}

function testReturningWorkerCanSwapThroughAlliedWorkerTraffic(): void {
  const state = makeState();
  const townhall = spawnEntity(state, 'townhall', 0, { x: 10, y: 10 });
  const mine = spawnEntity(state, 'goldmine', 2, { x: 30, y: 30 });
  mine.goldReserve = 1000;

  const mover = spawnEntity(state, 'worker', 0, { x: townhall.pos.x + 10, y: townhall.pos.y + 10 });
  const blocker = spawnEntity(state, 'worker', 0, { x: mover.pos.x + 1, y: mover.pos.y });

  mover.carryGold = 10;
  mover.cmd = {
    type: 'gather',
    targetId: mine.id,
    resourceType: 'gold',
    phase: 'returning',
    waitTicks: 0,
  };

  const moverCache = mover as Entity & {
    _gatherPath?: { x: number; y: number }[];
    _gatherReturnTarget?: { x: number; y: number };
  };
  moverCache._gatherPath = [
    { x: blocker.pos.x, y: blocker.pos.y },
    { x: blocker.pos.x + 1, y: blocker.pos.y },
  ];
  moverCache._gatherReturnTarget = { x: blocker.pos.x + 1, y: blocker.pos.y };

  state.tick = 999;
  processGather(state, mover);

  assert.deepEqual(mover.pos, { x: townhall.pos.x + 11, y: townhall.pos.y + 10 }, 'returning worker should advance through allied worker traffic');
  assert.deepEqual(blocker.pos, { x: townhall.pos.x + 10, y: townhall.pos.y + 10 }, 'blocking worker should be swapped back to preserve single-tile occupancy');
}

function testReroutedWorkerCanBypassStationaryAlliedCombatInNarrowBarracksLane(): void {
  const state = makeState();
  spawnEntity(state, 'townhall', 0, { x: 10, y: 10 });
  spawnEntity(state, 'barracks', 0, { x: 17, y: 18 });
  const mine = spawnEntity(state, 'goldmine', 2, { x: 34, y: 20 });
  mine.goldReserve = 1000;

  const worker = spawnEntity(state, 'worker', 0, { x: 20, y: 20 });
  const alliedFrontliner = spawnEntity(state, 'footman', 0, { x: 21, y: 20 });
  alliedFrontliner.cmd = null;

  // Seal all sidestep tiles around the worker to model a narrow barracks-side lane.
  spawnEntity(state, 'wall', 0, { x: 19, y: 19 });
  spawnEntity(state, 'wall', 0, { x: 19, y: 20 });
  spawnEntity(state, 'wall', 0, { x: 19, y: 21 });
  spawnEntity(state, 'wall', 0, { x: 20, y: 19 });
  spawnEntity(state, 'wall', 0, { x: 20, y: 21 });
  spawnEntity(state, 'wall', 0, { x: 21, y: 19 });
  spawnEntity(state, 'wall', 0, { x: 21, y: 21 });

  worker.cmd = {
    type: 'gather',
    targetId: mine.id,
    resourceType: 'gold',
    phase: 'toresource',
    waitTicks: 0,
  };

  const workerCache = worker as Entity & {
    _gatherPath?: { x: number; y: number }[];
    _gatherTarget?: { x: number; y: number };
  };
  workerCache._gatherPath = [
    { x: alliedFrontliner.pos.x, y: alliedFrontliner.pos.y },
    { x: alliedFrontliner.pos.x + 1, y: alliedFrontliner.pos.y },
  ];
  workerCache._gatherTarget = { x: alliedFrontliner.pos.x + 1, y: alliedFrontliner.pos.y };

  state.tick = 999;
  processGather(state, worker);

  assert.deepEqual(worker.pos, { x: 21, y: 20 }, 'rerouted worker should pass the allied combat blocker in a narrow lane');
  assert.deepEqual(alliedFrontliner.pos, { x: 20, y: 20 }, 'stationary allied combat unit should be swapped backward to preserve single-tile occupancy');
  assert.equal(worker.cmd?.type, 'gather', 'worker should keep gather command after bypassing allied combat block');
}

function testWorkerSwapDoesNotStackIntoAlreadyOccupiedOriginTile(): void {
  const state = makeState();
  const mover = spawnEntity(state, 'worker', 0, { x: 20, y: 20 });
  const blocker = spawnEntity(state, 'worker', 0, { x: 21, y: 20 });
  spawnEntity(state, 'worker', 0, { x: 20, y: 20 });

  mover.cmd = {
    type: 'gather',
    targetId: 999,
    resourceType: 'gold',
    phase: 'toresource',
    waitTicks: 0,
  };

  const moverCache = mover as Entity & {
    _gatherPath?: { x: number; y: number }[];
    _gatherTarget?: { x: number; y: number };
  };
  moverCache._gatherPath = [
    { x: 21, y: 20 },
    { x: 22, y: 20 },
  ];
  moverCache._gatherTarget = { x: 22, y: 20 };

  state.tick = 999;
  processGather(state, mover);

  assert.notDeepEqual(mover.pos, { x: 21, y: 20 }, 'worker should not swap into blocker tile if origin tile cannot accept displaced ally');
  const occupantsAtOrigin = state.entities.filter(e => e.pos.x === 20 && e.pos.y === 20 && e.kind === 'worker');
  assert.equal(occupantsAtOrigin.length, 2, 'origin tile occupancy should not increase due to permissive swap');
}

function run(): void {
  testReturningWorkerCanSwapThroughAlliedWorkerTraffic();
  testReroutedWorkerCanBypassStationaryAlliedCombatInNarrowBarracksLane();
  testWorkerSwapDoesNotStackIntoAlreadyOccupiedOriginTile();
  console.log('worker traffic tests passed');
}

run();
