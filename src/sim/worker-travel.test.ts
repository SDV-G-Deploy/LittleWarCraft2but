import assert from 'node:assert/strict';
import { buildMapById } from '../data/maps';
import { createWorld } from './world';
import { spawnEntity } from './entities';
import { processCommandPass } from './commands';
import { issueBuildCommand } from './economy';
import type { GameState } from '../types';
import { MAP_H } from '../types';

function makeState(): GameState {
  const map = buildMapById(1);
  return createWorld(map, ['human', 'orc']);
}

function tick(state: GameState, count: number): void {
  for (let i = 0; i < count; i++) {
    state.tick++;
    processCommandPass(state);
  }
}

function sealVerticalWall(state: GameState, x: number): void {
  for (let y = 0; y < MAP_H; y++) {
    state.tiles[y]![x]!.passable = false;
  }
}

function testUnreachableBuildSiteDoesNotAutoBuild(): void {
  const state = makeState();
  const worker = spawnEntity(state, 'worker', 0, { x: 20, y: 20 });
  state.wood[0] = 500;

  sealVerticalWall(state, 25);
  const issued = issueBuildCommand(state, worker, 'barracks', { x: 30, y: 20 }, state.tick);
  assert.equal(issued, true, 'build command should be accepted');

  const site = state.entities.find(e => e.kind === 'construction' && e.owner === 0);
  assert.ok(site, 'construction site should be spawned');

  tick(state, 220);

  assert.equal(worker.cmd?.type, 'build');
  assert.equal(worker.cmd?.phase, 'moving', 'worker should stay in moving phase when unreachable');
  assert.equal(site!.hp, 0, 'site progress should not start when unreachable');
}

function testUnreachableReturnPathDoesNotInstantDeposit(): void {
  const state = makeState();
  const townhall = spawnEntity(state, 'townhall', 0, { x: 40, y: 20 });
  const mine = spawnEntity(state, 'goldmine', 1, { x: 20, y: 20 });
  const worker = spawnEntity(state, 'worker', 0, { x: 15, y: 20 });

  sealVerticalWall(state, 30);

  worker.carryGold = 100;
  worker.carryWood = 0;
  worker.cmd = {
    type: 'gather',
    targetId: mine.id,
    resourceType: 'gold',
    phase: 'returning',
    waitTicks: state.tick,
  };

  const goldBefore = state.gold[0];
  tick(state, 220);

  assert.equal(worker.cmd?.type, 'gather');
  assert.equal(worker.cmd?.phase, 'returning', 'worker should remain returning when dropoff path is unreachable');
  assert.equal(state.gold[0], goldBefore, 'gold must not be deposited without reaching dropoff');
  assert.equal(worker.carryGold, 100, 'worker should keep carried resource');
  assert.ok(townhall, 'keep TS from pruning townhall setup');
}

function testWorkerTravelIsSoftAndSingleStepDeterministic(): void {
  const state = makeState();
  spawnEntity(state, 'townhall', 0, { x: 12, y: 10 });
  const blocker = spawnEntity(state, 'worker', 0, { x: 11, y: 10 });
  const worker = spawnEntity(state, 'worker', 0, { x: 10, y: 10 });

  worker.carryGold = 50;
  worker.carryWood = 0;
  worker.cmd = {
    type: 'gather',
    targetId: 0,
    resourceType: 'gold',
    phase: 'returning',
    waitTicks: -999,
  };

  const before = { ...worker.pos };
  tick(state, 1);

  const stepDist = Math.max(Math.abs(worker.pos.x - before.x), Math.abs(worker.pos.y - before.y));
  assert.equal(stepDist, 1, 'worker travel should stay lightweight (single-tile progress per step)');
  assert.equal(worker.cmd?.type, 'gather');
  assert.equal(worker.cmd?.phase, 'returning');
  assert.equal(worker.carryGold, 50, 'worker should keep carried gold while traveling');
  assert.ok(blocker, 'keep blocker alive for scenario validity');
}

function run(): void {
  testUnreachableBuildSiteDoesNotAutoBuild();
  testUnreachableReturnPathDoesNotInstantDeposit();
  testWorkerTravelIsSoftAndSingleStepDeterministic();
  console.log('worker travel tests passed');
}

run();
