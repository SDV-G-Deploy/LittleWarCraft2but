import assert from 'node:assert/strict';
import { buildMapById } from '../data/maps';
import type { GameState } from '../types';
import { createWorld } from './world';
import { spawnEntity } from './entities';
import { issueMoveCommand, processCommandPass } from './commands';
import { issueAttackCommand } from './combat';
import { issueGatherCommand } from './economy';
import { resetMovementKpis, snapshotMovementKpis } from './movement-kpi';

function makeState(): GameState {
  const map = buildMapById(1);
  return createWorld(map, ['human', 'orc']);
}

function runTicks(state: GameState, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    processCommandPass(state);
    state.tick += 1;
  }
}

function scenarioPlainMoveBlockedRepath(): void {
  const state = makeState();
  resetMovementKpis();

  const mover = spawnEntity(state, 'footman', 0, { x: 20, y: 20 });
  spawnEntity(state, 'footman', 0, { x: 21, y: 20 });
  spawnEntity(state, 'wall', 2, { x: 19, y: 19 });
  spawnEntity(state, 'wall', 2, { x: 19, y: 20 });
  spawnEntity(state, 'wall', 2, { x: 19, y: 21 });
  spawnEntity(state, 'wall', 2, { x: 20, y: 19 });
  spawnEntity(state, 'wall', 2, { x: 20, y: 21 });
  spawnEntity(state, 'wall', 2, { x: 21, y: 19 });
  spawnEntity(state, 'wall', 2, { x: 21, y: 21 });

  const issued = issueMoveCommand(state, mover, 30, 20, false);
  assert.equal(issued, true);

  runTicks(state, 40);
  const kpi = snapshotMovementKpis(state.tick);
  assert.ok(kpi.move_blocked_ticks > 0, 'plain move scenario should produce blocked ticks');
  console.log('[kpi-baseline] plain-move', JSON.stringify(kpi));
}

function scenarioWorkerCycle(): void {
  const state = makeState();
  resetMovementKpis();

  spawnEntity(state, 'townhall', 0, { x: 10, y: 10 });
  const mine = spawnEntity(state, 'goldmine', 2, { x: 14, y: 10 });
  mine.goldReserve = 1000;
  const worker = spawnEntity(state, 'worker', 0, { x: 11, y: 10 });

  issueGatherCommand(state, worker, mine.id, state.tick);
  runTicks(state, 120);

  const kpi = snapshotMovementKpis(state.tick);
  assert.ok(kpi.worker_cycle_count >= 1, 'worker scenario should complete at least one cycle');
  assert.ok(kpi.worker_cycle_ticks_median > 0, 'worker cycle median should be measurable');
  console.log('[kpi-baseline] worker', JSON.stringify(kpi));
}

function scenarioCombatHoldAndChase(): void {
  const state = makeState();
  resetMovementKpis();

  const target = spawnEntity(state, 'grunt', 1, { x: 40, y: 40 });
  for (let y = 38; y <= 42; y++) {
    for (let x = 38; x <= 42; x++) {
      if (x === 40 && y === 40) continue;
      spawnEntity(state, 'wall', 2, { x, y });
    }
  }

  const attacker = spawnEntity(state, 'footman', 0, { x: 40, y: 42 });
  const issued = issueAttackCommand(attacker, target.id, state.tick, state);
  assert.equal(issued, true);

  runTicks(state, 20);
  const kpi = snapshotMovementKpis(state.tick);
  assert.ok(kpi.near_target_hold_ticks > 0, 'combat scenario should register near-target hold ticks');
  console.log('[kpi-baseline] combat', JSON.stringify(kpi));
}

function run(): void {
  scenarioPlainMoveBlockedRepath();
  scenarioWorkerCycle();
  scenarioCombatHoldAndChase();
  console.log('movement kpi baseline tests passed');
}

run();
