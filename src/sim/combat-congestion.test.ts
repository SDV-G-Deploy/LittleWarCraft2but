import assert from 'node:assert/strict';
import { buildMapById } from '../data/maps';
import { createWorld } from './world';
import { spawnEntity } from './entities';
import { processAttack, issueAttackCommand } from './combat';
import { processCommandPass } from './commands';
import { ticksPerStep } from '../data/units';
import type { GameState } from '../types';

function makeState(): GameState {
  const map = buildMapById(1);
  return createWorld(map, ['human', 'orc']);
}

function testBlockedChaseRespectsMovementCadence(): void {
  const state = makeState();
  state.tick = 120;

  const attacker = spawnEntity(state, 'footman', 0, { x: 20, y: 20 });
  const target = spawnEntity(state, 'grunt', 1, { x: 24, y: 20 });

  // Hard-box attacker so only the occupied front tile exists, forcing blocked/repath chase outcome.
  spawnEntity(state, 'footman', 0, { x: 21, y: 20 });
  spawnEntity(state, 'wall', 2, { x: 19, y: 19 });
  spawnEntity(state, 'wall', 2, { x: 19, y: 20 });
  spawnEntity(state, 'wall', 2, { x: 19, y: 21 });
  spawnEntity(state, 'wall', 2, { x: 20, y: 19 });
  spawnEntity(state, 'wall', 2, { x: 20, y: 21 });
  spawnEntity(state, 'wall', 2, { x: 21, y: 19 });
  spawnEntity(state, 'wall', 2, { x: 21, y: 21 });

  const issued = issueAttackCommand(attacker, target.id, state.tick, state);
  assert.equal(issued, true);
  assert.equal(attacker.cmd?.type, 'attack');

  const before = attacker.cmd!.chaseStepTick;
  processAttack(state, attacker);

  assert.equal(before, 120, 'test setup must preserve initial chase step tick');
  assert.equal(attacker.cmd?.type, 'attack');
  assert.equal(
    attacker.cmd?.chaseStepTick,
    state.tick,
    'blocked/repath chase should still update chaseStepTick to preserve movement cadence and avoid per-tick thrash',
  );
}

function testMeleeManyVsOneUsesDistinctContactAndStagingSlots(): void {
  const state = makeState();
  state.tick = 1;

  const target = spawnEntity(state, 'grunt', 1, { x: 40, y: 40 });
  // Leave only two contact slots open (west/east), block the rest.
  spawnEntity(state, 'wall', 2, { x: 39, y: 39 });
  spawnEntity(state, 'wall', 2, { x: 40, y: 39 });
  spawnEntity(state, 'wall', 2, { x: 41, y: 39 });
  spawnEntity(state, 'wall', 2, { x: 39, y: 41 });
  spawnEntity(state, 'wall', 2, { x: 40, y: 41 });
  spawnEntity(state, 'wall', 2, { x: 41, y: 41 });

  const attackers = [
    spawnEntity(state, 'footman', 0, { x: 35, y: 40 }),
    spawnEntity(state, 'footman', 0, { x: 35, y: 41 }),
    spawnEntity(state, 'footman', 0, { x: 35, y: 42 }),
    spawnEntity(state, 'footman', 0, { x: 35, y: 43 }),
    spawnEntity(state, 'footman', 0, { x: 35, y: 44 }),
  ];

  for (const attacker of attackers) {
    const issued = issueAttackCommand(attacker, target.id, state.tick, state);
    assert.equal(issued, true);
  }

  for (let i = 0; i < 20; i++) {
    processCommandPass(state);
    state.tick += 1;
  }

  const claimed = attackers
    .map(a => a.cmd?.type === 'attack' ? a.cmd.contactSlot : undefined)
    .filter((slot): slot is { x: number; y: number } => !!slot);
  assert.equal(claimed.length, 2, 'only available melee contact slots should be claimed');
  const claimedKeys = new Set(claimed.map(slot => `${slot.x},${slot.y}`));
  assert.equal(claimedKeys.size, 2, 'different attackers must claim different contact slots');
}

function testRearMeleeHoldsWhenNoFrontlineSlotsAreAvailable(): void {
  const state = makeState();
  state.tick = 1;

  const target = spawnEntity(state, 'grunt', 1, { x: 40, y: 40 });

  // Fully surround target so no contact/staging slots exist.
  for (let y = 38; y <= 42; y++) {
    for (let x = 38; x <= 42; x++) {
      if (x === 40 && y === 40) continue;
      spawnEntity(state, 'wall', 2, { x, y });
    }
  }

  const attacker = spawnEntity(state, 'footman', 0, { x: 40, y: 42 });
  const issued = issueAttackCommand(attacker, target.id, state.tick, state);
  assert.equal(issued, true);

  const chasePathTicks: number[] = [];
  const positions: string[] = [];

  for (let i = 0; i < 8; i++) {
    processCommandPass(state);
    chasePathTicks.push(attacker.cmd?.type === 'attack' ? attacker.cmd.chasePathTick : -1);
    positions.push(`${attacker.pos.x},${attacker.pos.y}`);
    state.tick += 1;
  }

  assert.deepEqual(new Set(positions), new Set(['40,42']), 'rear melee should hold instead of thrashing into occupied frontline');
  assert.ok(new Set(chasePathTicks).size <= 2, 'hold mode should avoid per-tick chase retries/churn');
  assert.equal(attacker.cmd?.type, 'attack');
  assert.equal(attacker.cmd?.chasePath.length, 0, 'no pointless chase path should be retained while holding');
  assert.deepEqual(attacker.cmd?.chaseGoal, { x: 40, y: 42 }, 'hold-mode chase goal should stay pinned to current tile');
}

function testMeleeAssignmentsRefreshWithinTickAfterFrontlinerStepsForward(): void {
  const state = makeState();
  state.tick = 1;

  const target = spawnEntity(state, 'grunt', 1, { x: 40, y: 40 });

  // Leave exactly one contact slot (39,40) and one staging slot (38,40).
  for (let y = 39; y <= 41; y++) {
    for (let x = 39; x <= 41; x++) {
      if (x === 40 && y === 40) continue;
      if (x === 39 && y === 40) continue;
      spawnEntity(state, 'wall', 2, { x, y });
    }
  }
  for (let y = 38; y <= 42; y++) {
    for (let x = 38; x <= 42; x++) {
      if (x >= 39 && x <= 41 && y >= 39 && y <= 41) continue;
      if (x === 38 && y === 40) continue;
      if (Math.max(Math.abs(x - 40), Math.abs(y - 40)) === 2) {
        spawnEntity(state, 'wall', 2, { x, y });
      }
    }
  }

  const frontliner = spawnEntity(state, 'footman', 0, { x: 38, y: 40 });
  const rear = spawnEntity(state, 'footman', 0, { x: 37, y: 40 });

  assert.equal(issueAttackCommand(frontliner, target.id, state.tick, state), true);
  assert.equal(issueAttackCommand(rear, target.id, state.tick, state), true);

  state.tick += ticksPerStep(frontliner.kind, state.races[frontliner.owner]);

  processAttack(state, frontliner);
  assert.deepEqual(frontliner.pos, { x: 39, y: 40 }, 'frontliner should step into sole contact slot first');

  processAttack(state, rear);
  assert.equal(rear.cmd?.type, 'attack');
  assert.deepEqual(rear.cmd?.chaseGoal, { x: 38, y: 40 }, 'rear unit should retarget fresh staging slot opened earlier in this tick');
}

function run(): void {
  testBlockedChaseRespectsMovementCadence();
  testMeleeManyVsOneUsesDistinctContactAndStagingSlots();
  testRearMeleeHoldsWhenNoFrontlineSlotsAreAvailable();
  testMeleeAssignmentsRefreshWithinTickAfterFrontlinerStepsForward();
  console.log('combat congestion tests passed');
}

run();
