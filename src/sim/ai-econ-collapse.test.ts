import assert from 'node:assert/strict';
import { buildMapById } from '../data/maps';
import { createWorld } from './world';
import { spawnEntity } from './entities';
import { createAI, tickAI } from './ai';
import { MAP_W, MINE_GOLD_INITIAL, NEUTRAL, type Entity, type GameState } from '../types';

function makeState(): GameState {
  const map = buildMapById(1);
  return createWorld(map, ['human', 'orc']);
}

function seedBase(state: GameState): { myTownHall: Entity; myWorker: Entity; enemyTownHall: Entity } {
  const map = buildMapById(1);
  const myTownHall = spawnEntity(state, 'townhall', 1, map.aiStart);
  const myWorker = spawnEntity(state, 'peon', 1, { x: map.aiStart.x + 1, y: map.aiStart.y + 3 });
  const enemyTownHall = spawnEntity(state, 'townhall', 0, map.playerStart);
  spawnEntity(state, 'worker', 0, { x: map.playerStart.x + 3, y: map.playerStart.y + 1 });
  for (const pos of map.goldMines) {
    const mine = spawnEntity(state, 'goldmine', NEUTRAL, pos);
    mine.goldReserve = MINE_GOLD_INITIAL;
  }
  return { myTownHall, myWorker, enemyTownHall };
}

function firstTreeId(state: GameState): number {
  for (let y = 0; y < state.tiles.length; y++) {
    for (let x = 0; x < state.tiles[y].length; x++) {
      const tile = state.tiles[y][x];
      if (tile?.kind === 'tree' && (tile.woodReserve ?? 0) > 0) return y * MAP_W + x;
    }
  }
  throw new Error('expected at least one tree tile');
}

function testSurvivingWorkerForcedToGoldInCollapse(): void {
  const state = makeState();
  const { myWorker } = seedBase(state);
  state.tick = 300;
  state.gold[1] = 0;
  state.wood[1] = 0;
  spawnEntity(state, 'grunt', 1, { x: 42, y: 10 });

  myWorker.cmd = {
    type: 'gather',
    targetId: firstTreeId(state),
    resourceType: 'wood',
    phase: 'toresource',
    waitTicks: 0,
  };

  const ai = createAI('hard');
  ai.phase = 'military';
  tickAI(state, ai, 1);

  assert.equal(myWorker.cmd?.type, 'gather');
  assert.equal(myWorker.cmd?.resourceType, 'gold');
}

function testTowerBuildSuppressedInCollapseState(): void {
  const state = makeState();
  const { myTownHall, myWorker } = seedBase(state);
  state.tick = 320;
  state.gold[1] = 0;
  state.wood[1] = 999;

  spawnEntity(state, 'barracks', 1, { x: myTownHall.pos.x + 4, y: myTownHall.pos.y });
  spawnEntity(state, 'lumbermill', 1, { x: myTownHall.pos.x - 4, y: myTownHall.pos.y });
  spawnEntity(state, 'grunt', 1, { x: 42, y: 10 });
  spawnEntity(state, 'grunt', 1, { x: 43, y: 10 });

  myWorker.cmd = null;

  const ai = createAI('hard');
  ai.phase = 'military';
  ai.towerMinArmy = 0;
  ai.maxTowers = 3;
  tickAI(state, ai, 1);

  const cmdType = (myWorker as { cmd: { type: string } | null }).cmd?.type ?? null;
  assert.notEqual(cmdType, 'build', 'collapse mode should suppress tower building branch');
}

function testLastArmyModeCanEnterAndStayInAssaultBelowWaveThreshold(): void {
  const enterState = makeState();
  seedBase(enterState);
  enterState.tick = 340;
  enterState.gold[1] = 0;
  spawnEntity(enterState, 'grunt', 1, { x: 42, y: 10 });
  spawnEntity(enterState, 'grunt', 1, { x: 43, y: 10 });

  const enterAI = createAI('hard');
  enterAI.phase = 'military';
  enterAI.attackWaveSize = 8;
  tickAI(enterState, enterAI, 1);
  assert.equal(enterAI.phase, 'assault', 'last-army mode should allow entering assault below normal wave size');

  const stayState = makeState();
  seedBase(stayState);
  stayState.tick = 360;
  stayState.gold[1] = 0;
  spawnEntity(stayState, 'grunt', 1, { x: 42, y: 10 });
  spawnEntity(stayState, 'grunt', 1, { x: 43, y: 10 });

  const stayAI = createAI('hard');
  stayAI.phase = 'assault';
  stayAI.fallbackWaveThreshold = 6;
  tickAI(stayState, stayAI, 1);
  assert.equal(stayAI.phase, 'assault', 'last-army mode should not drop out of assault only due to low wave size');
}

function testCollapseModeClearsWhenEconomyRecovers(): void {
  const state = makeState();
  const { myWorker } = seedBase(state);
  state.tick = 380;
  state.gold[1] = 70;
  spawnEntity(state, 'grunt', 1, { x: 42, y: 10 });
  spawnEntity(state, 'grunt', 1, { x: 43, y: 10 });

  const mine = state.entities.find(e => e.kind === 'goldmine');
  assert.ok(mine);
  myWorker.cmd = {
    type: 'gather',
    targetId: mine.id,
    resourceType: 'gold',
    phase: 'toresource',
    waitTicks: 0,
  };

  const ai = createAI('hard');
  ai.phase = 'military';
  ai.attackWaveSize = 8;
  tickAI(state, ai, 1);

  assert.equal(ai.phase, 'military', 'economy recovery should clear collapse mode and disable last-army assault override');
}

function testSevereBaseThreatOverridesLastArmyPush(): void {
  const state = makeState();
  const { myTownHall } = seedBase(state);
  state.tick = 410;
  state.gold[1] = 0;
  spawnEntity(state, 'grunt', 1, { x: 42, y: 10 });
  spawnEntity(state, 'grunt', 1, { x: 43, y: 10 });

  spawnEntity(state, 'footman', 0, { x: myTownHall.pos.x + 1, y: myTownHall.pos.y + 1 });
  spawnEntity(state, 'footman', 0, { x: myTownHall.pos.x + 2, y: myTownHall.pos.y + 1 });
  spawnEntity(state, 'footman', 0, { x: myTownHall.pos.x + 1, y: myTownHall.pos.y + 2 });
  spawnEntity(state, 'footman', 0, { x: myTownHall.pos.x + 2, y: myTownHall.pos.y + 2 });

  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.fallbackWaveThreshold = 6;
  tickAI(state, ai, 1);

  assert.equal(ai.assaultPosture, 'regroup');
  assert.equal(ai.phase, 'military', 'severe home threat should override last-army push and force regroup/fallback');
}

function run(): void {
  testSurvivingWorkerForcedToGoldInCollapse();
  testTowerBuildSuppressedInCollapseState();
  testLastArmyModeCanEnterAndStayInAssaultBelowWaveThreshold();
  testCollapseModeClearsWhenEconomyRecovers();
  testSevereBaseThreatOverridesLastArmyPush();
  console.log('ai econ collapse tests passed');
}

run();
