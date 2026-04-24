import assert from 'node:assert/strict';
import { buildMapById } from '../data/maps';
import { createWorld } from './world';
import { spawnEntity } from './entities';
import { processBuild, processGather } from './economy';
import type { Entity, GameState } from '../types';

function makeState(): GameState {
  const map = buildMapById(1);
  return createWorld(map, ['human', 'orc']);
}

function testReturningWorkerPassesThroughMixedTrafficNearTownhall(): void {
  const state = makeState();
  const townhall = spawnEntity(state, 'townhall', 0, { x: 10, y: 10 });
  const mine = spawnEntity(state, 'goldmine', 2, { x: 30, y: 30 });
  mine.goldReserve = 1000;

  const mover = spawnEntity(state, 'worker', 0, { x: townhall.pos.x + 10, y: townhall.pos.y + 10 });
  const alliedBlocker = spawnEntity(state, 'footman', 0, { x: mover.pos.x + 1, y: mover.pos.y });
  const enemyBlocker = spawnEntity(state, 'grunt', 1, { x: mover.pos.x + 2, y: mover.pos.y });

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
    { x: alliedBlocker.pos.x, y: alliedBlocker.pos.y },
    { x: enemyBlocker.pos.x, y: enemyBlocker.pos.y },
    { x: enemyBlocker.pos.x + 1, y: enemyBlocker.pos.y },
  ];
  moverCache._gatherReturnTarget = { x: enemyBlocker.pos.x + 1, y: enemyBlocker.pos.y };

  state.tick = 999;
  processGather(state, mover);
  state.tick += 999;
  processGather(state, mover);

  assert.deepEqual(mover.pos, { x: townhall.pos.x + 12, y: townhall.pos.y + 10 }, 'returning worker should follow path directly through unit traffic without sidestep/repath churn');
  assert.deepEqual(alliedBlocker.pos, { x: townhall.pos.x + 11, y: townhall.pos.y + 10 }, 'allied stationary combat unit should not be displaced by worker travel');
  assert.deepEqual(enemyBlocker.pos, { x: townhall.pos.x + 12, y: townhall.pos.y + 10 }, 'other traffic units should not be displaced by worker travel');
}

function testGatherTravelWorkerPassesThroughEnemyAndAlliedUnits(): void {
  const state = makeState();
  spawnEntity(state, 'townhall', 0, { x: 10, y: 10 });
  const mine = spawnEntity(state, 'goldmine', 2, { x: 34, y: 20 });
  mine.goldReserve = 1000;

  const worker = spawnEntity(state, 'worker', 0, { x: 20, y: 20 });
  const enemyBlocker = spawnEntity(state, 'grunt', 1, { x: 21, y: 20 });
  const alliedBlocker = spawnEntity(state, 'archer', 0, { x: 22, y: 20 });

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
    { x: enemyBlocker.pos.x, y: enemyBlocker.pos.y },
    { x: alliedBlocker.pos.x, y: alliedBlocker.pos.y },
    { x: alliedBlocker.pos.x + 1, y: alliedBlocker.pos.y },
  ];
  workerCache._gatherTarget = { x: alliedBlocker.pos.x + 1, y: alliedBlocker.pos.y };

  state.tick = 999;
  processGather(state, worker);
  state.tick += 999;
  processGather(state, worker);

  assert.deepEqual(worker.pos, { x: 22, y: 20 }, 'to-resource worker should follow path directly through mixed unit traffic without sidestep');
  assert.deepEqual(enemyBlocker.pos, { x: 21, y: 20 }, 'enemy traffic remains soft and is not displaced');
  assert.deepEqual(alliedBlocker.pos, { x: 22, y: 20 }, 'allied traffic remains soft and is not displaced');
  assert.equal(worker.cmd?.type, 'gather', 'worker should keep gather command after transparent pass sequence');
}

function testBuildMovementWorkerPassesThroughTownhallLaneTraffic(): void {
  const state = makeState();
  spawnEntity(state, 'townhall', 0, { x: 10, y: 10 });
  const worker = spawnEntity(state, 'worker', 0, { x: 20, y: 20 });
  const enemyBlocker = spawnEntity(state, 'grunt', 1, { x: 21, y: 20 });

  const site = spawnEntity(state, 'construction', 0, { x: 26, y: 20 });
  site.constructionOf = 'barracks';
  site.hp = 0;
  site.hpMax = 100;

  worker.cmd = {
    type: 'build',
    building: 'barracks',
    pos: { x: 26, y: 20 },
    siteId: site.id,
    phase: 'moving',
    stepTick: 0,
  };

  const workerCache = worker as Entity & {
    _buildPath?: { x: number; y: number }[];
    _buildApproachTarget?: { x: number; y: number };
  };
  workerCache._buildPath = [
    { x: enemyBlocker.pos.x, y: enemyBlocker.pos.y },
    { x: enemyBlocker.pos.x + 1, y: enemyBlocker.pos.y },
  ];
  workerCache._buildApproachTarget = { x: enemyBlocker.pos.x + 1, y: enemyBlocker.pos.y };

  state.tick = 999;
  processBuild(state, worker);

  assert.deepEqual(worker.pos, { x: 21, y: 20 }, 'builder should pass through lane traffic while approaching site');
  assert.deepEqual(enemyBlocker.pos, { x: 21, y: 20 }, 'blocking traffic should not be displaced during build travel pass-through');
}

function run(): void {
  testReturningWorkerPassesThroughMixedTrafficNearTownhall();
  testGatherTravelWorkerPassesThroughEnemyAndAlliedUnits();
  testBuildMovementWorkerPassesThroughTownhallLaneTraffic();
  console.log('worker traffic tests passed');
}

run();
