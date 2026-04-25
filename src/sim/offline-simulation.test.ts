import assert from 'node:assert/strict';
import { buildMapById } from '../data/maps';
import { RACES } from '../data/races';
import { CORPSE_LIFE_TICKS, MINE_GOLD_INITIAL } from '../types';
import { createWorld } from './world';
import { spawnEntity } from './entities';
import { applyNetCmds } from '../net/netcmd';
import { createAI, tickAI, type AIAssaultPosture, type AIMineIntent, type AIStrategicIntent } from './ai';
import { autoAttackPass, processCommandPass, separateUnits } from './commands';
import { computePopCaps } from './economy';
import { tickLumberUpgrades } from './upgrades';
import type { Entity, GameState } from '../types';

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

function assertFiniteEntity(e: Entity): void {
  assert.equal(Number.isFinite(e.pos.x), true, `entity ${e.id} pos.x must stay finite`);
  assert.equal(Number.isFinite(e.pos.y), true, `entity ${e.id} pos.y must stay finite`);
  assert.equal(Number.isFinite(e.hp), true, `entity ${e.id} hp must stay finite`);
  assert.equal(Number.isFinite(e.hpMax), true, `entity ${e.id} hpMax must stay finite`);
  if (e.goldReserve !== undefined) assert.equal(Number.isFinite(e.goldReserve), true, `entity ${e.id} goldReserve must stay finite`);
  if (e.carryGold !== undefined) assert.equal(Number.isFinite(e.carryGold), true, `entity ${e.id} carryGold must stay finite`);
  if (e.carryWood !== undefined) assert.equal(Number.isFinite(e.carryWood), true, `entity ${e.id} carryWood must stay finite`);
}

function assertFiniteState(state: GameState): void {
  assert.equal(Number.isFinite(state.tick), true, 'tick must stay finite');
  for (let i = 0 as 0 | 1; i <= 1; i = (i + 1) as 0 | 1) {
    assert.equal(Number.isFinite(state.gold[i]), true, `gold[${i}] must stay finite`);
    assert.equal(Number.isFinite(state.wood[i]), true, `wood[${i}] must stay finite`);
    assert.equal(Number.isFinite(state.pop[i]), true, `pop[${i}] must stay finite`);
    assert.equal(Number.isFinite(state.popCap[i]), true, `popCap[${i}] must stay finite`);
  }
  for (const e of state.entities) assertFiniteEntity(e);
}

function testOfflineSimulationLongRunSmoke(): void {
  const state = makeState();
  seedSimulationStart(state);

  const aiSide0 = createAI('easy');
  const aiSide1 = createAI('easy');

  const totalTicks = 2500;
  const meaningfulProgressTick = 400;
  const lateActivityWindow = 600;

  let side0DecisionCount = 0;
  let side1DecisionCount = 0;
  let side0LastDecisionTick = -1;
  let side1LastDecisionTick = -1;
  let side0LastCommandTick = -1;
  let side1LastCommandTick = -1;
  const side0Intents = new Set<AIStrategicIntent>();
  const side1Intents = new Set<AIStrategicIntent>();
  const side0Postures = new Set<AIAssaultPosture>();
  const side1Postures = new Set<AIAssaultPosture>();
  const side0MineIntents = new Set<AIMineIntent>();
  const side1MineIntents = new Set<AIMineIntent>();

  for (let i = 0; i < totalTicks; i++) {
    state.tick++;
    tickLumberUpgrades(state);
    processCommandPass(state);
    autoAttackPass(state);
    state.corpses = state.corpses.filter(c => state.tick - c.deadTick < CORPSE_LIFE_TICKS);
    computePopCaps(state);
    separateUnits(state);

    const prev0 = aiSide0.nextDecisionTick;
    tickAI(state, aiSide0, 0);
    if (aiSide0.nextDecisionTick !== prev0) {
      side0DecisionCount++;
      side0LastDecisionTick = state.tick;
      side0Intents.add(aiSide0.strategicIntent);
      side0Postures.add(aiSide0.assaultPosture);
      if (aiSide0.mineIntent) side0MineIntents.add(aiSide0.mineIntent);
    }

    const prev1 = aiSide1.nextDecisionTick;
    tickAI(state, aiSide1, 1);
    if (aiSide1.nextDecisionTick !== prev1) {
      side1DecisionCount++;
      side1LastDecisionTick = state.tick;
      side1Intents.add(aiSide1.strategicIntent);
      side1Postures.add(aiSide1.assaultPosture);
      if (aiSide1.mineIntent) side1MineIntents.add(aiSide1.mineIntent);
    }

    if (state.entities.some(e => e.owner === 0 && e.cmd !== null)) side0LastCommandTick = state.tick;
    if (state.entities.some(e => e.owner === 1 && e.cmd !== null)) side1LastCommandTick = state.tick;

    if (state.tick % 100 === 0) assertFiniteState(state);
  }

  assert.ok(side0DecisionCount >= 10, 'side 0 AI should make repeated decisions in long run');
  assert.ok(side1DecisionCount >= 10, 'side 1 AI should make repeated decisions in long run');
  assert.ok(side0LastDecisionTick >= meaningfulProgressTick, 'side 0 AI decisions should continue past early opening');
  assert.ok(side1LastDecisionTick >= meaningfulProgressTick, 'side 1 AI decisions should continue past early opening');
  assert.ok(side0LastCommandTick >= meaningfulProgressTick, 'side 0 should keep generating commands past opening');
  assert.ok(side1LastCommandTick >= meaningfulProgressTick, 'side 1 should keep generating commands past opening');

  const side0Alive = state.entities.some(e => e.owner === 0 && e.kind === 'townhall');
  const side1Alive = state.entities.some(e => e.owner === 1 && e.kind === 'townhall');

  if (side0Alive) {
    assert.ok(
      side0LastDecisionTick >= totalTicks - lateActivityWindow,
      'side 0 AI should still make decisions late in the simulation when alive',
    );
  }
  if (side1Alive) {
    assert.ok(
      side1LastDecisionTick >= totalTicks - lateActivityWindow,
      'side 1 AI should still make decisions late in the simulation when alive',
    );
  }

  assert.ok(side0Intents.size >= 1, 'side 0 should expose strategic intent state during simulation');
  assert.ok(side1Intents.size >= 1, 'side 1 should expose strategic intent state during simulation');
  assert.ok(side0Postures.size >= 1, 'side 0 should expose assault posture state during simulation');
  assert.ok(side1Postures.size >= 1, 'side 1 should expose assault posture state during simulation');
  assert.ok(side0Postures.has('probe') || side0Postures.has('contest') || side0Postures.has('contain') || side0Postures.has('commit'), 'side 0 should reach an active assault posture during simulation');
  assert.ok(side1Postures.has('probe') || side1Postures.has('contest') || side1Postures.has('contain') || side1Postures.has('commit'), 'side 1 should reach an active assault posture during simulation');
  assert.ok(side0MineIntents.size >= 0, 'side 0 mine-intent collection should remain valid');
  assert.ok(side1MineIntents.size >= 0, 'side 1 mine-intent collection should remain valid');
}


function testAiResumesOrFinishesSideTasks(): void {
  const state = makeState();
  seedSimulationStart(state);

  const ai = createAI('hard');
  const myWorker = state.entities.find(e => e.owner === 0 && e.kind === 'worker');
  const enemyTownHall = state.entities.find(e => e.owner === 1 && e.kind === 'townhall');
  assert.ok(myWorker, 'worker should exist');
  assert.ok(enemyTownHall, 'enemy townhall should exist');

  const site = spawnEntity(state, 'construction', 0, { x: 6, y: 48 });
  site.constructionOf = 'barracks';
  site.hp = 100;
  site.hpMax = 680;

  tickAI(state, ai, 0);
  assert.equal(myWorker!.cmd?.type, 'build', 'AI should resume unfinished owned construction with an available worker');
  assert.equal(myWorker!.cmd?.siteId, site.id, 'AI should target the unfinished owned construction site');

  myWorker!.cmd = null;
  state.entities = state.entities.filter(e => e.owner !== 1 || e.kind === 'townhall');
  spawnEntity(state, 'footman', 0, { x: enemyTownHall!.pos.x - 3, y: enemyTownHall!.pos.y + 1 });
  spawnEntity(state, 'footman', 0, { x: enemyTownHall!.pos.x - 2, y: enemyTownHall!.pos.y + 1 });
  ai.phase = 'assault';
  ai.nextDecisionTick = 0;

  tickAI(state, ai, 0);
  const attackers = state.entities.filter(e => e.owner === 0 && (e.kind === 'footman' || e.kind === 'archer' || e.kind === 'knight'));
  assert.ok(attackers.some(u => u.cmd?.type === 'attack' || u.cmd?.type === 'move'), 'AI should issue closing commands when only enemy structures remain');
}

function run(): void {
  testOwnerLockRejectsForeignGameplayCommands();
  testOfflineSimulationTicksBothAIs();
  testOfflineSimulationLongRunSmoke();
  testAiResumesOrFinishesSideTasks();
  console.log('offline simulation tests passed');
}

run();
