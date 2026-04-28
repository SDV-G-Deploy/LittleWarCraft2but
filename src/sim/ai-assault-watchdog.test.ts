import assert from 'node:assert/strict';
import { buildMapById } from '../data/maps';
import { createWorld } from './world';
import { spawnEntity } from './entities';
import { createAI, tickAI } from './ai';
import { NEUTRAL, type GameState } from '../types';

function makeState(): GameState {
  const map = buildMapById(1);
  return createWorld(map, ['human', 'orc']);
}

function seedMatch(state: GameState): void {
  const map = buildMapById(1);
  spawnEntity(state, 'townhall', 0, map.playerStart);
  spawnEntity(state, 'worker', 0, { x: map.playerStart.x + 3, y: map.playerStart.y + 1 });
  spawnEntity(state, 'townhall', 1, map.aiStart);
  spawnEntity(state, 'peon', 1, { x: map.aiStart.x + 1, y: map.aiStart.y + 3 });
  spawnEntity(state, 'goldmine', NEUTRAL, { x: 31, y: 32 });
}

function testStaleAttackTargetDoesNotBlockReevaluation(): void {
  const state = makeState();
  seedMatch(state);
  state.tick = 700;

  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.assaultPosture = 'commit';
  ai.strategicIntent = 'pressure';
  ai.homeReserveMin = 0;

  const grunt = spawnEntity(state, 'grunt', 1, { x: 24, y: 24 });
  const enemy = spawnEntity(state, 'footman', 0, { x: 28, y: 24 });

  grunt.cmd = {
    type: 'attack',
    targetId: 999999,
    cooldownTick: 0,
    chasePath: [],
    chasePathTick: 0,
    chaseStepTick: 0,
  };

  tickAI(state, ai, 1);

  assert.equal(grunt.cmd?.type, 'attack');
  assert.equal(grunt.cmd?.targetId, enemy.id, 'stale invalid attack should be replaced by fresh local target');
}

function testAssaultFinalFallbackMoveWhenNoUsefulCommandIssued(): void {
  const state = makeState();
  seedMatch(state);
  state.tick = 710;

  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.assaultPosture = 'probe';
  ai.strategicIntent = 'pressure';
  ai.homeReserveMin = 0;

  const grunt = spawnEntity(state, 'grunt', 1, { x: 20, y: 20 });

  grunt.cmd = {
    type: 'attack',
    targetId: 999999,
    cooldownTick: 0,
    chasePath: [],
    chasePathTick: 0,
    chaseStepTick: 0,
  };

  tickAI(state, ai, 1);

  assert.equal(grunt.cmd?.type, 'move');
  const moveCmd = grunt.cmd as Extract<GameState['entities'][number]['cmd'], { type: 'move' }> | null;
  assert.ok(moveCmd, 'expected fallback move command');
  assert.ok(moveCmd.path.length > 0, 'fallback move should issue a concrete path');
}

function testConservativeStaleAttackWatchdogForFarTarget(): void {
  const state = makeState();
  seedMatch(state);
  state.tick = 1000;

  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.assaultPosture = 'commit';
  ai.strategicIntent = 'pressure';
  ai.attackRetargetRadius = 4;
  ai.homeReserveMin = 0;

  const grunt = spawnEntity(state, 'grunt', 1, { x: 18, y: 18 });
  const farEnemy = spawnEntity(state, 'worker', 0, { x: 53, y: 53 });

  grunt.cmd = {
    type: 'attack',
    targetId: farEnemy.id,
    cooldownTick: 0,
    chasePath: [],
    chasePathTick: 0,
    chaseStepTick: 0,
  };

  tickAI(state, ai, 1);

  assert.notEqual(grunt.cmd?.type, 'attack', 'far stale attack should not keep blocking assault reevaluation');
}

function testConservativeMoveWatchdogReissuesRegroupMove(): void {
  const state = makeState();
  seedMatch(state);
  state.tick = 720;

  const ai = createAI('medium');
  ai.phase = 'assault';
  ai.assaultPosture = 'regroup';
  ai.strategicIntent = 'stabilize';
  ai.homeReserveMin = 0;

  const grunt = spawnEntity(state, 'grunt', 1, { x: 24, y: 24 });

  const oldStepTick = 10;
  grunt.cmd = {
    type: 'move',
    path: [{ x: 24, y: 24 }],
    stepTick: oldStepTick,
    attackMove: false,
    goal: { x: 25, y: 25 },
    lastPos: { x: 24, y: 24 },
    lastProgressTick: oldStepTick,
    repathCount: 3,
    blockedAllyStreak: 8,
    blockedAllyTile: { x: 25, y: 25 },
  };

  tickAI(state, ai, 1);

  assert.equal(grunt.cmd?.type, 'move');
  assert.equal(grunt.cmd?.stepTick, state.tick, 'stale move in regroup should be reissued immediately');
}

function testAttackWatchdogTreatsNoSpatialProgressAsStale(): void {
  const state = makeState();
  seedMatch(state);
  state.tick = 1000;

  const ai = createAI('hard');
  ai.phase = 'assault';
  ai.assaultPosture = 'commit';
  ai.strategicIntent = 'pressure';
  ai.attackRetargetRadius = 4;
  ai.homeReserveMin = 0;

  const grunt = spawnEntity(state, 'grunt', 1, { x: 18, y: 18 });
  const farEnemy = spawnEntity(state, 'worker', 0, { x: 53, y: 53 });
  const nearbyEnemy = spawnEntity(state, 'footman', 0, { x: 22, y: 19 });

  grunt.cmd = {
    type: 'attack',
    targetId: farEnemy.id,
    cooldownTick: 0,
    chasePath: [],
    chasePathTick: state.tick - 1,
    chaseStepTick: state.tick - 1,
    chaseProgressSampleTick: state.tick - 80,
    chaseProgressSamplePos: { x: 18, y: 18 },
    chaseProgressSampleDist: Math.hypot(53 - 18, 53 - 18),
  };

  tickAI(state, ai, 1);

  const cmd = grunt.cmd;
  assert.ok(cmd, 'stale attack should be reevaluated into a fresh command');
  if (cmd.type === 'attack') {
    assert.equal(cmd.targetId, nearbyEnemy.id, 'no-progress stale attack should be reassigned to a local threat');
    assert.notEqual(cmd.targetId, farEnemy.id, 'stale no-progress command must not remain locked on far target');
  } else {
    assert.equal(cmd.type, 'move', 'when no local target is selected, stale attack should still be reevaluated into movement');
  }
}

function testNoTownhallAssaultContinuity(): void {
  const state = makeState();
  const map = buildMapById(1);
  state.tick = 900;

  spawnEntity(state, 'townhall', 0, map.playerStart);
  const enemyWorker = spawnEntity(state, 'worker', 0, { x: map.playerStart.x + 5, y: map.playerStart.y + 3 });
  const grunt = spawnEntity(state, 'grunt', 1, { x: map.playerStart.x + 8, y: map.playerStart.y + 5 });

  const ai = createAI('hard');
  ai.phase = 'military';
  ai.assaultPosture = 'regroup';

  tickAI(state, ai, 1);

  assert.equal(ai.phase, 'assault', 'AI should stay operational in no-townhall army-only mode');
  assert.equal(grunt.cmd?.type, 'attack');
  assert.equal(grunt.cmd?.targetId, enemyWorker.id, 'remaining army should continue assaulting enemy units/structures');
}

function testNoTownhallRangedUnitCanContinueAssaultingEnemyStructures(): void {
  const state = makeState();
  const map = buildMapById(1);
  state.tick = 920;

  spawnEntity(state, 'townhall', 0, map.playerStart);
  const enemyFarm = spawnEntity(state, 'farm', 0, { x: map.playerStart.x + 5, y: map.playerStart.y + 3 });
  const troll = spawnEntity(state, 'troll', 1, { x: map.playerStart.x + 9, y: map.playerStart.y + 5 });

  const ai = createAI('hard');
  ai.phase = 'military';
  ai.assaultPosture = 'regroup';

  tickAI(state, ai, 1);

  assert.equal(ai.phase, 'assault', 'AI should stay operational in no-townhall army-only mode for ranged remnants too');
  assert.equal(troll.cmd?.type, 'attack');
  assert.equal(troll.cmd?.targetId, enemyFarm.id, 'ranged remnants should keep pressuring enemy structures instead of idling behind melee');
}

function run(): void {
  testStaleAttackTargetDoesNotBlockReevaluation();
  testAssaultFinalFallbackMoveWhenNoUsefulCommandIssued();
  testConservativeStaleAttackWatchdogForFarTarget();
  testConservativeMoveWatchdogReissuesRegroupMove();
  testAttackWatchdogTreatsNoSpatialProgressAsStale();
  testNoTownhallAssaultContinuity();
  testNoTownhallRangedUnitCanContinueAssaultingEnemyStructures();
  console.log('ai assault watchdog tests passed');
}

run();
