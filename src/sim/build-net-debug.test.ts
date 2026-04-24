import assert from 'node:assert/strict';
import { buildMapById } from '../data/maps';
import { applyNetCmds, type NetCmd } from '../net/netcmd';
import { spawnEntity } from './entities';
import { createWorld } from './world';
import { getResolvedCost } from '../balance/resolver';
import type { Entity, GameState } from '../types';

function makeState(): GameState {
  const map = buildMapById(1);
  return createWorld(map, ['human', 'orc']);
}

function spawnStartingBases(state: GameState): { hostWorker: Entity; guestWorker: Entity } {
  const hostTownhall = spawnEntity(state, 'townhall', 0, { x: 6, y: 6 });
  const guestTownhall = spawnEntity(state, 'townhall', 1, { x: 46, y: 46 });
  const hostWorker = spawnEntity(state, 'worker', 0, { x: hostTownhall.pos.x + 4, y: hostTownhall.pos.y + 1 });
  const guestWorker = spawnEntity(state, 'peon', 1, { x: guestTownhall.pos.x + 4, y: guestTownhall.pos.y + 1 });
  state.wood[0] = 300;
  state.wood[1] = 300;
  return { hostWorker, guestWorker };
}

function countSites(state: GameState, owner: 0 | 1): number {
  return state.entities.filter(e => e.owner === owner && e.kind === 'construction').length;
}

function findSite(state: GameState, owner: 0 | 1): Entity | undefined {
  return state.entities.find(e => e.owner === owner && e.kind === 'construction');
}

function testBuildApplyParityForBothOwners(): void {
  const state = makeState();
  const { hostWorker, guestWorker } = spawnStartingBases(state);

  const barracksCostHost = getResolvedCost('barracks', state.races[0]);
  const barracksCostGuest = getResolvedCost('barracks', state.races[1]);
  const hostGoldBefore = state.gold[0];
  const hostWoodBefore = state.wood[0];
  const guestGoldBefore = state.gold[1];
  const guestWoodBefore = state.wood[1];

  applyNetCmds(state, [{ k: 'build', workerId: hostWorker.id, building: 'barracks', tx: 18, ty: 18 }], 0);
  applyNetCmds(state, [{ k: 'build', workerId: guestWorker.id, building: 'barracks', tx: 40, ty: 40 }], 1);

  assert.equal(countSites(state, 0), 1, 'host owner should create one construction site');
  assert.equal(countSites(state, 1), 1, 'guest owner should create one construction site');
  assert.equal(state.gold[0], hostGoldBefore - barracksCostHost.gold, 'host gold should be debited');
  assert.equal(state.wood[0], hostWoodBefore - barracksCostHost.wood, 'host wood should be debited');
  assert.equal(state.gold[1], guestGoldBefore - barracksCostGuest.gold, 'guest gold should be debited');
  assert.equal(state.wood[1], guestWoodBefore - barracksCostGuest.wood, 'guest wood should be debited');

  const hostSite = findSite(state, 0);
  const guestSite = findSite(state, 1);
  assert.ok(hostSite, 'host site must exist');
  assert.ok(guestSite, 'guest site must exist');
  assert.equal(hostWorker.cmd?.type, 'build');
  assert.equal(guestWorker.cmd?.type, 'build');
  assert.equal(hostWorker.cmd?.siteId, hostSite.id);
  assert.equal(guestWorker.cmd?.siteId, guestSite.id);
}

function testGuestBuildRejectsWrongWorkerOwner(): void {
  const state = makeState();
  const { hostWorker } = spawnStartingBases(state);
  const guestGoldBefore = state.gold[1];
  const guestWoodBefore = state.wood[1];

  const cmd: NetCmd = { k: 'build', workerId: hostWorker.id, building: 'barracks', tx: 40, ty: 40 };
  applyNetCmds(state, [cmd], 1);

  assert.equal(countSites(state, 1), 0, 'guest owner must not create a site using host worker id');
  assert.equal(state.gold[1], guestGoldBefore, 'guest gold should remain unchanged on reject');
  assert.equal(state.wood[1], guestWoodBefore, 'guest wood should remain unchanged on reject');
}

function testGuestBuildRejectsOccupiedPlacementWithoutSideEffects(): void {
  const state = makeState();
  const { guestWorker } = spawnStartingBases(state);
  spawnEntity(state, 'farm', 1, { x: 40, y: 40 });
  const guestGoldBefore = state.gold[1];
  const guestWoodBefore = state.wood[1];

  applyNetCmds(state, [{ k: 'build', workerId: guestWorker.id, building: 'barracks', tx: 40, ty: 40 }], 1);

  assert.equal(countSites(state, 1), 0, 'occupied placement should not spawn a construction site');
  assert.equal(state.gold[1], guestGoldBefore, 'guest gold should remain unchanged on invalid placement');
  assert.equal(state.wood[1], guestWoodBefore, 'guest wood should remain unchanged on invalid placement');
  assert.equal(guestWorker.cmd, null, 'guest worker should remain idle after rejected build');
}

function run(): void {
  testBuildApplyParityForBothOwners();
  testGuestBuildRejectsWrongWorkerOwner();
  testGuestBuildRejectsOccupiedPlacementWithoutSideEffects();
  console.log('build net debug tests passed');
}

run();
