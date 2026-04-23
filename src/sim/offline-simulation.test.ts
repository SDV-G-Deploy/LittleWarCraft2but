import assert from 'node:assert/strict';
import { buildMapById } from '../data/maps';
import { RACES } from '../data/races';
import { MINE_GOLD_INITIAL } from '../types';
import { createWorld } from './world';
import { spawnEntity } from './entities';
import { applyNetCmds } from '../net/netcmd';
import { createAI, tickAI } from './ai';
import type { GameState } from '../types';

function makeState(): GameState {
  const map = buildMapById(1);
  return createWorld(map, ['human', 'orc']);
}

function seedSimulationStart(state: GameState): void {
  const map = buildMapById(1);
  const p1Race = RACES[state.races[0]];
  const p2Race = RACES[state.races[1]];

  spawnEntity(state, 'townhall', 0, map.playerStart);
  spawnEntity(state, p1Race.worker, 0, { x: map.playerStart.x + 4, y: map.playerStart.y + 1 });

  spawnEntity(state, 'townhall', 1, map.aiStart);
  spawnEntity(state, p2Race.worker, 1, { x: map.aiStart.x + 1, y: map.aiStart.y + 3 });

  for (const [index, pos] of map.goldMines.entries()) {
    const mine = spawnEntity(state, 'goldmine', 2, pos);
    mine.goldReserve = map.goldMineReserves?.[index] ?? MINE_GOLD_INITIAL;
  }
}

function testOwnerLockRejectsForeignGameplayCommands(): void {
  const state = makeState();
  const myUnit = spawnEntity(state, 'footman', 0, { x: 20, y: 20 });
  const enemyUnit = spawnEntity(state, 'grunt', 1, { x: 24, y: 20 });

  applyNetCmds(state, [{ k: 'move', ids: [myUnit.id], tx: 21, ty: 20, atk: false }], 1);

  assert.equal(myUnit.cmd, null, 'foreign owner must not be able to issue move command on this unit');

  applyNetCmds(state, [{ k: 'move', ids: [enemyUnit.id], tx: 25, ty: 20, atk: false }], 1);
  assert.equal(enemyUnit.cmd?.type, 'move', 'command from matching owner should still apply');
}

function testOfflineSimulationTicksBothAIs(): void {
  const state = makeState();
  seedSimulationStart(state);

  const aiSide0 = createAI('easy');
  const aiSide1 = createAI('easy');

  tickAI(state, aiSide0, 0);
  tickAI(state, aiSide1, 1);

  assert.ok(aiSide0.nextDecisionTick > state.tick, 'side 0 AI must tick and schedule next decision');
  assert.ok(aiSide1.nextDecisionTick > state.tick, 'side 1 AI must tick and schedule next decision');

  const side0HasCommand = state.entities.some(e => e.owner === 0 && e.cmd !== null);
  const side1HasCommand = state.entities.some(e => e.owner === 1 && e.cmd !== null);

  assert.equal(side0HasCommand, true, 'side 0 should receive AI-issued commands in simulation mode');
  assert.equal(side1HasCommand, true, 'side 1 should receive AI-issued commands in simulation mode');
}

function run(): void {
  testOwnerLockRejectsForeignGameplayCommands();
  testOfflineSimulationTicksBothAIs();
  console.log('offline simulation tests passed');
}

run();
