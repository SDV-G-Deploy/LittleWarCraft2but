import assert from 'node:assert/strict';
import { buildMapById } from '../data/maps';
import { createWorld } from './world';
import { spawnEntity } from './entities';
import { createAI, tickAI } from './ai';
import { MINE_GOLD_INITIAL, NEUTRAL, type GameState, type Race } from '../types';

function makeState(races: [Race, Race] = ['human', 'orc']): GameState {
  const map = buildMapById(1);
  return createWorld(map, races);
}

function seedMatch(state: GameState, owner: 0 | 1 = 1): { myTownHall: ReturnType<typeof spawnEntity>; enemyTownHall: ReturnType<typeof spawnEntity> } {
  const map = buildMapById(1);
  const enemy = owner === 0 ? 1 : 0;
  const ownerStart = owner === 0 ? map.playerStart : map.aiStart;
  const enemyStart = owner === 0 ? map.aiStart : map.playerStart;

  const myTownHall = spawnEntity(state, 'townhall', owner, ownerStart);
  spawnEntity(state, state.races[owner] === 'human' ? 'worker' : 'peon', owner, { x: ownerStart.x + 1, y: ownerStart.y + 3 });
  const enemyTownHall = spawnEntity(state, 'townhall', enemy, enemyStart);
  spawnEntity(state, state.races[enemy] === 'human' ? 'worker' : 'peon', enemy, { x: enemyStart.x + 3, y: enemyStart.y + 1 });

  for (const pos of map.goldMines) {
    const mine = spawnEntity(state, 'goldmine', NEUTRAL, pos);
    mine.goldReserve = MINE_GOLD_INITIAL;
  }
  return { myTownHall, enemyTownHall };
}

function testContestedFrontAdvantageYieldsGuard(): void {
  const state = makeState();
  const { myTownHall, enemyTownHall } = seedMatch(state, 1);
  state.tick = 500;
  myTownHall.pos = { x: 52, y: 6 };
  enemyTownHall.pos = { x: 3, y: 55 };

  spawnEntity(state, 'grunt', 1, { x: 31, y: 31 });
  spawnEntity(state, 'grunt', 1, { x: 32, y: 31 });
  spawnEntity(state, 'footman', 0, { x: 35, y: 33 });

  const ai = createAI('easy');
  ai.phase = 'assault';

  tickAI(state, ai, 1);

  assert.equal(ai.mineIntent, 'guard', 'favorable contested mine with slight front advantage should convert to guard');
}

function testWonLocalTradeCanYieldBaitFight(): void {
  const state = makeState();
  const { myTownHall, enemyTownHall } = seedMatch(state, 1);
  state.tick = 520;
  myTownHall.pos = { x: 52, y: 6 };
  enemyTownHall.pos = { x: 3, y: 55 };

  spawnEntity(state, 'grunt', 1, { x: 30, y: 31 });
  spawnEntity(state, 'grunt', 1, { x: 31, y: 31 });
  spawnEntity(state, 'grunt', 1, { x: 32, y: 31 });
  spawnEntity(state, 'grunt', 1, { x: 33, y: 31 });
  spawnEntity(state, 'footman', 0, { x: 36, y: 34 });

  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.lastWonLocalTradeTick = state.tick;

  tickAI(state, ai, 1);

  assert.equal(ai.mineIntent, 'baitFight', 'aggressive doctrine with won local trade and strong contested advantage should choose baitFight');
}

function testWonLocalTradeNearSafeExpansionPrefersGuardOverTake(): void {
  const state = makeState(['orc', 'human']);
  const { myTownHall, enemyTownHall } = seedMatch(state, 1);
  state.tick = 500;
  myTownHall.pos = { x: 55, y: 5 };
  enemyTownHall.pos = { x: 26, y: 30 };

  spawnEntity(state, 'footman', 1, { x: 48, y: 10 });
  spawnEntity(state, 'footman', 1, { x: 49, y: 10 });
  spawnEntity(state, 'footman', 1, { x: 50, y: 10 });
  spawnEntity(state, 'footman', 1, { x: 51, y: 10 });
  spawnEntity(state, 'footman', 1, { x: 48, y: 11 });
  spawnEntity(state, 'footman', 1, { x: 49, y: 11 });
  spawnEntity(state, 'footman', 1, { x: 50, y: 11 });
  spawnEntity(state, 'footman', 1, { x: 51, y: 11 });
  spawnEntity(state, 'grunt', 0, { x: 28, y: 33 });

  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.lastWonLocalTradeTick = state.tick;

  tickAI(state, ai, 1);

  assert.equal(ai.economicPosture, 'greed', 'hard human doctrine should expose greed posture in safe expansion pressure state');
  assert.equal(ai.mineIntent, 'guard', 'recent local success near safe expansion should consolidate with guard before greed-converting to take');
}

function testSafeExpansionGreedYieldsTake(): void {
  const state = makeState(['orc', 'human']);
  const { myTownHall, enemyTownHall } = seedMatch(state, 1);
  state.tick = 500;
  myTownHall.pos = { x: 55, y: 5 };
  enemyTownHall.pos = { x: 26, y: 30 };

  spawnEntity(state, 'footman', 1, { x: 48, y: 10 });
  spawnEntity(state, 'footman', 1, { x: 49, y: 10 });
  spawnEntity(state, 'footman', 1, { x: 50, y: 10 });
  spawnEntity(state, 'footman', 1, { x: 51, y: 10 });
  spawnEntity(state, 'footman', 1, { x: 48, y: 11 });
  spawnEntity(state, 'footman', 1, { x: 49, y: 11 });
  spawnEntity(state, 'footman', 1, { x: 50, y: 11 });
  spawnEntity(state, 'footman', 1, { x: 51, y: 11 });
  spawnEntity(state, 'grunt', 0, { x: 28, y: 33 });

  const ai = createAI('hard');
  ai.phase = 'assault';

  tickAI(state, ai, 1);

  assert.equal(ai.economicPosture, 'greed', 'hard human doctrine should expose greed posture in safe expansion pressure state');
  assert.equal(ai.mineIntent, 'take', 'safe expansion with greed posture and no contested front edge should choose take');
}

function testRecentBaseThreatSuppressesTakeWithoutContestedEdge(): void {
  const state = makeState(['orc', 'human']);
  const { myTownHall, enemyTownHall } = seedMatch(state, 1);
  state.tick = 500;
  myTownHall.pos = { x: 55, y: 5 };
  enemyTownHall.pos = { x: 26, y: 30 };

  spawnEntity(state, 'footman', 1, { x: 48, y: 10 });
  spawnEntity(state, 'footman', 1, { x: 49, y: 10 });
  spawnEntity(state, 'footman', 1, { x: 50, y: 10 });
  spawnEntity(state, 'footman', 1, { x: 51, y: 10 });
  spawnEntity(state, 'footman', 1, { x: 48, y: 11 });
  spawnEntity(state, 'footman', 1, { x: 49, y: 11 });

  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.lastBaseThreatTick = state.tick;

  tickAI(state, ai, 1);

  assert.notEqual(ai.mineIntent, 'take', 'recent base threat should suppress greedy take conversion');
}

function testRecentBaseThreatWithContestedControlFallsBackToGuard(): void {
  const state = makeState();
  const { myTownHall, enemyTownHall } = seedMatch(state, 1);
  state.tick = 500;
  myTownHall.pos = { x: 52, y: 6 };
  enemyTownHall.pos = { x: 3, y: 55 };

  spawnEntity(state, 'grunt', 1, { x: 30, y: 31 });
  spawnEntity(state, 'grunt', 1, { x: 31, y: 31 });
  spawnEntity(state, 'grunt', 1, { x: 32, y: 31 });
  spawnEntity(state, 'footman', 0, { x: 36, y: 34 });

  const ai = createAI('medium');
  ai.phase = 'assault';
  ai.lastWonLocalTradeTick = state.tick;
  ai.lastBaseThreatTick = state.tick;

  tickAI(state, ai, 1);

  assert.equal(ai.mineIntent, 'guard', 'recent base threat should downgrade contested conversion to guard instead of take or baitFight');
}


function run(): void {
  testContestedFrontAdvantageYieldsGuard();
  testWonLocalTradeCanYieldBaitFight();
  testWonLocalTradeNearSafeExpansionPrefersGuardOverTake();
  testSafeExpansionGreedYieldsTake();
  testRecentBaseThreatSuppressesTakeWithoutContestedEdge();
  testRecentBaseThreatWithContestedControlFallsBackToGuard();
  console.log('ai mine intent tests passed');
}

run();
