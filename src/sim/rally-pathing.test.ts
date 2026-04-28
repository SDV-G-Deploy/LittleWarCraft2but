import assert from 'node:assert/strict';
import { buildMapById } from '../data/maps';
import { createWorld } from './world';
import { spawnEntity } from './entities';
import { processTrain } from './economy';
import type { GameState } from '../types';

function makeState(): GameState {
  const map = buildMapById(1);
  return createWorld(map, ['human', 'orc']);
}

function testRallyChoosesNearbyFreeTileWhenExactTileIsOccupied(): void {
  const state = makeState();
  const barracks = spawnEntity(state, 'barracks', 0, { x: 20, y: 20 });
  barracks.rallyPoint = { x: 30, y: 30 };

  // Occupy the exact rally tile with a friendly unit.
  spawnEntity(state, 'footman', 0, { x: 30, y: 30 });

  barracks.cmd = {
    type: 'train',
    unit: 'footman',
    ticksLeft: 1,
    queue: [],
  };

  processTrain(state, barracks);

  const trainees = state.entities.filter(e => e.owner === 0 && e.kind === 'footman');
  const spawned = trainees.find(e => e.pos.x !== 30 || e.pos.y !== 30);
  assert.ok(spawned, 'newly trained unit should spawn');
  assert.equal(spawned!.cmd?.type, 'move', 'newly trained unit should receive move command toward rally area');
  assert.notDeepEqual(spawned!.cmd!.goal, { x: 30, y: 30 }, 'occupied rally tile should not remain the exact move goal');
}

function testRallySpreadsMultipleFreshMeleeAcrossWiderArrivalTiles(): void {
  const state = makeState();
  const barracks = spawnEntity(state, 'barracks', 0, { x: 20, y: 20 });
  barracks.rallyPoint = { x: 30, y: 30 };

  for (let i = 0; i < 6; i++) {
    barracks.cmd = {
      type: 'train',
      unit: 'footman',
      ticksLeft: 1,
      queue: [],
    };
    processTrain(state, barracks);
  }

  const trainees = state.entities.filter((e): e is typeof e & { cmd: { type: 'move'; goal: { x: number; y: number } } } => e.owner === 0 && e.kind === 'footman' && e.cmd?.type === 'move');
  const uniqueGoals = new Set(trainees.map(e => `${e.cmd.goal.x},${e.cmd.goal.y}`));
  assert.ok(uniqueGoals.size >= 4, `expected wider rally spread for fresh melee cluster, got ${uniqueGoals.size} unique goals`);
}

function run(): void {
  testRallyChoosesNearbyFreeTileWhenExactTileIsOccupied();
  testRallySpreadsMultipleFreshMeleeAcrossWiderArrivalTiles();
  console.log('rally pathing tests passed');
}

run();
