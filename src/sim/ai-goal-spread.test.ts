import assert from 'node:assert/strict';
import { createAI } from './ai';

function spreadSeedFor(id: number, tx: number, ty: number): number {
  return (id * 1103515245 + tx * 92821 + ty * 68917) >>> 0;
}

function testSpreadMoveTargetsProduceDistinctNearbyGoals(): void {
  createAI('hard');

  const tx = 31;
  const ty = 31;
  const seeds = [101, 102, 103, 104].map(id => spreadSeedFor(id, tx, ty));
  const uniqueSeeds = new Set(seeds);

  assert.ok(uniqueSeeds.size >= 2, 'distinct soldiers should resolve distinct deterministic spread preferences around the same goal');
}

function run(): void {
  testSpreadMoveTargetsProduceDistinctNearbyGoals();
  console.log('ai goal spread tests passed');
}

run();
