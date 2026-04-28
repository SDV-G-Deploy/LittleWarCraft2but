import assert from 'node:assert/strict';
import { buildMapById } from '../data/maps';
import { createWorld } from './world';
import { spawnEntity } from './entities';
import { autoAttackPass } from './commands';
import { processAttack, issueAttackCommand } from './combat';
import type { Command, GameState } from '../types';

function makeState(): GameState {
  const map = buildMapById(1);
  return createWorld(map, ['human', 'orc']);
}

function testIdleMeleeRetaliatesAgainstRecentRangedAttackerOutsideSight(): void {
  const state = makeState();
  state.tick = 100;

  const footman = spawnEntity(state, 'footman', 0, { x: 20, y: 20 });
  const troll = spawnEntity(state, 'troll', 1, { x: 24, y: 20 });

  footman.sightRadius = 3;
  troll.sightRadius = 6;

  assert.equal(issueAttackCommand(troll, footman.id, state.tick, state), true);
  processAttack(state, troll);

  assert.equal(footman.cmd, null, 'victim should still be idle before defensive auto-retaliation pass');
  assert.equal(footman.lastAttackerId, troll.id);
  assert.equal(footman.lastAttackedByTick, state.tick);

  autoAttackPass(state);

  const retaliationCmd = footman.cmd as Command | null;
  assert.ok(retaliationCmd && retaliationCmd.type === 'attack');
  if (!retaliationCmd || retaliationCmd.type !== 'attack') throw new Error('expected attack retaliation command');
  assert.equal(retaliationCmd.targetId, troll.id, 'idle melee should retaliate against recent ranged attacker even outside normal sight');
}

function run(): void {
  testIdleMeleeRetaliatesAgainstRecentRangedAttackerOutsideSight();
  console.log('defensive retaliation tests passed');
}

run();
