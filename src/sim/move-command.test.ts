import assert from 'node:assert/strict';
import { buildMapById } from '../data/maps';
import { createWorld } from './world';
import { spawnEntity } from './entities';
import { issueMoveCommand, processCommandPass } from './commands';
import type { GameState } from '../types';

function makeState(): GameState {
  const map = buildMapById(1);
  return createWorld(map, ['human', 'orc']);
}

function testAdjacentMoveAcceptedAndExecutes(): void {
  const state = makeState();
  const unit = spawnEntity(state, 'footman', 0, { x: 20, y: 20 });

  const issued = issueMoveCommand(state, unit, 21, 20, false);
  assert.equal(issued, true, 'adjacent move should be accepted');
  assert.equal(unit.cmd?.type, 'move', 'unit should receive move command');

  for (let i = 0; i < 10; i++) {
    state.tick++;
    processCommandPass(state);
    if (unit.pos.x === 21 && unit.pos.y === 20) break;
  }
  assert.equal(unit.pos.x, 21, 'unit should move to adjacent tile on next command pass');
  assert.equal(unit.pos.y, 20);
}

function testBlockedAdjacentTileRejected(): void {
  const state = makeState();
  const unit = spawnEntity(state, 'footman', 0, { x: 0, y: 0 });
  spawnEntity(state, 'wall', 0, { x: 1, y: 0 });
  spawnEntity(state, 'wall', 0, { x: 0, y: 1 });
  spawnEntity(state, 'wall', 0, { x: 1, y: 1 });

  const issued = issueMoveCommand(state, unit, 1, 0, false);
  assert.equal(issued, false, 'move into blocked adjacent tile should be rejected');
  assert.equal(unit.cmd, null, 'unit should remain idle when blocked adjacent move is rejected');
}

function testSameTileNoOpAccepted(): void {
  const state = makeState();
  const unit = spawnEntity(state, 'footman', 0, { x: 20, y: 20 });

  const issued = issueMoveCommand(state, unit, 20, 20, false);
  assert.equal(issued, true, 'same-tile move should be accepted as no-op');
  assert.equal(unit.cmd, null, 'same-tile move should not create a movement path');
}

function run(): void {
  testAdjacentMoveAcceptedAndExecutes();
  testBlockedAdjacentTileRejected();
  testSameTileNoOpAccepted();
  console.log('move command tests passed');
}

run();
