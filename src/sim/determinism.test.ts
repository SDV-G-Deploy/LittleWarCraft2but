import assert from 'node:assert/strict';
import { buildMapById } from '../data/maps';
import { createWorld } from './world';
import { spawnEntity } from './entities';
import { processCommandPass, autoAttackPass } from './commands';
import type { GameState } from '../types';

function makeState(): GameState {
  const map = buildMapById(1);
  return createWorld(map, ['human', 'orc']);
}

function testMutationSafeProcessPass(): void {
  const state = makeState();
  state.tick = 200;

  const victim = spawnEntity(state, 'worker', 1, { x: 10, y: 10 });
  victim.hp = 1;

  const attacker = spawnEntity(state, 'grunt', 0, { x: 11, y: 10 });
  attacker.cmd = {
    type: 'attack',
    targetId: victim.id,
    cooldownTick: 0,
    chasePath: [],
    chasePathTick: 0,
    chaseStepTick: 0,
  };

  const mover = spawnEntity(state, 'worker', 0, { x: 20, y: 20 });
  mover.cmd = {
    type: 'move',
    path: [{ x: 21, y: 20 }],
    stepTick: 0,
    attackMove: false,
    goal: { x: 21, y: 20 },
    lastPos: { x: 20, y: 20 },
    lastProgressTick: 0,
    repathCount: 0,
    blockedAllyStreak: 0,
    blockedAllyTile: null,
  };

  processCommandPass(state);

  assert.equal(state.entities.some(e => e.id === victim.id), false, 'victim should be removed');
  assert.equal(mover.pos.x, 21, 'mover should still process this tick after earlier removal');
}

function testAutoAttackTieBreakById(): void {
  const state = makeState();
  state.tick = 2;

  const unit = spawnEntity(state, 'footman', 0, { x: 30, y: 30 });
  const lowId = spawnEntity(state, 'peon', 1, { x: 29, y: 30 });
  const highId = spawnEntity(state, 'peon', 1, { x: 31, y: 30 });

  state.entities = [unit, highId, lowId];

  autoAttackPass(state);

  assert.equal(unit.cmd?.type, 'attack');
  assert.equal(unit.cmd?.targetId, lowId.id, 'equal-distance auto-target should pick lower entity id');
}

function run(): void {
  testMutationSafeProcessPass();
  testAutoAttackTieBreakById();
  console.log('determinism tests passed');
}

run();
