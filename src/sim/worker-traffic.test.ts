import assert from 'node:assert/strict';
import { buildMapById } from '../data/maps';
import { createWorld } from './world';
import { spawnEntity } from './entities';
import { processGather } from './economy';
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

function run(): void {
  testReturningWorkerCanSwapThroughAlliedWorkerTraffic();
  console.log('worker traffic tests passed');
}

run();
