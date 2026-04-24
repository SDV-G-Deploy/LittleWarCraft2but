import assert from 'node:assert/strict';
import { buildMapById } from '../../data/maps';
import { createWorld } from '../world';
import { spawnEntity } from '../entities';
import type { GameState } from '../../types';
import { findFlowFieldPath } from './flow-field';
import { createFlowFieldCache } from './flow-field-cache';

function makeState(): GameState {
  const map = buildMapById(1);
  return createWorld(map, ['human', 'orc']);
}

function testFlowFieldFindsPathToGoal(): void {
  const state = makeState();
  spawnEntity(state, 'footman', 0, { x: 5, y: 5 });

  const path = findFlowFieldPath(state, 5, 5, 12, 9);
  assert.ok(path, 'flow field should find path on open ground');
  assert.ok((path?.length ?? 0) > 0, 'path should contain at least one step');
  const last = path![path!.length - 1]!;
  assert.equal(last.x, 12);
  assert.equal(last.y, 9);
}

function testFlowFieldGoalCacheHitsWithinTick(): void {
  const state = makeState();
  const cache = createFlowFieldCache();

  const first = findFlowFieldPath(state, 5, 5, 12, 9, cache);
  assert.ok(first, 'first call should produce path');

  const second = findFlowFieldPath(state, 6, 5, 12, 9, cache);
  assert.ok(second, 'second call to same goal should also produce path');

  const stats = cache.getStats();
  assert.equal(stats.misses, 1, 'first field lookup should miss once');
  assert.ok(stats.hits >= 1, 'subsequent same-goal lookup should hit cache');
}

function run(): void {
  testFlowFieldFindsPathToGoal();
  testFlowFieldGoalCacheHitsWithinTick();
  console.log('flow field tests passed');
}

run();
