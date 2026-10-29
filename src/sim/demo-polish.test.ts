/**
 * Tests for the first-time-player layer: match stats, objectives checklist,
 * and that observing a match does not change the deterministic simulation.
 */
import assert from 'node:assert/strict';
import { buildMapById } from '../data/maps';
import { createWorld } from './world';
import { spawnEntity, killEntity } from './entities';
import { processCommandPass, autoAttackPass, separateUnits } from './commands';
import { computePopCaps, issueGatherCommand } from './economy';
import { createAI, tickAI } from './ai';
import {
  createMatchStats,
  observeMatchTick,
  measureIncome,
  matchDurationSeconds,
  formatDuration,
} from './match-stats';
import {
  createObjectiveTracker,
  updateObjectives,
  setupComplete,
  compassDirection,
  ARMY_GOAL,
} from './objectives';
import type { GameState } from '../types';
import { SIM_HZ, NEUTRAL } from '../types';

function makeState(): GameState {
  const map = buildMapById(1);
  return createWorld(map, ['human', 'orc']);
}

function testStatsCountTrainedAndLost(): void {
  const state = makeState();
  spawnEntity(state, 'townhall', 0, { x: 4, y: 4 });
  spawnEntity(state, 'worker', 0, { x: 9, y: 5 });
  const stats = createMatchStats(state);

  // Baseline entities are not counted as trained/built.
  observeMatchTick(stats, state);
  assert.equal(stats.sides[0].unitsTrained, 0);
  assert.equal(stats.sides[0].buildingsBuilt, 0);

  const f1 = spawnEntity(state, 'footman', 0, { x: 12, y: 12 });
  spawnEntity(state, 'footman', 0, { x: 13, y: 12 });
  spawnEntity(state, 'worker', 0, { x: 14, y: 12 });
  spawnEntity(state, 'farm', 0, { x: 20, y: 20 });
  const grunt = spawnEntity(state, 'grunt', 1, { x: 30, y: 30 });
  state.tick++;
  observeMatchTick(stats, state);
  assert.equal(stats.sides[0].unitsTrained, 3);
  assert.equal(stats.sides[0].workersTrained, 1);
  assert.equal(stats.sides[0].militaryTrained, 2);
  assert.equal(stats.sides[0].buildingsBuilt, 1);
  assert.equal(stats.sides[0].peakArmy, 2);
  assert.equal(stats.sides[1].militaryTrained, 1);

  killEntity(state, f1.id);
  killEntity(state, grunt.id);
  state.tick++;
  observeMatchTick(stats, state);
  assert.equal(stats.sides[0].unitsLost, 1);
  assert.equal(stats.sides[1].unitsLost, 1);
  assert.equal(stats.sides[0].peakArmy, 2, 'peak army is a high-water mark');

  // Construction scaffolds and neutral entities are ignored.
  spawnEntity(state, 'construction', 0, { x: 40, y: 40 });
  state.tick++;
  observeMatchTick(stats, state);
  assert.equal(stats.sides[0].buildingsBuilt, 1);
}

function testIncomeMeasuresOnlyPositiveDeltas(): void {
  const state = makeState();
  const stats = createMatchStats(state);
  const g0 = state.gold[0];
  measureIncome(stats, state, () => { state.gold[0] += 25; state.wood[1] += 10; state.gold[1] -= 50; });
  assert.equal(stats.sides[0].goldMined, 25);
  assert.equal(stats.sides[1].woodHarvested, 10);
  assert.equal(stats.sides[1].goldMined, 0, 'spending is not income');
  assert.equal(state.gold[0], g0 + 25);
}

function testDurationFormatting(): void {
  const state = makeState();
  const stats = createMatchStats(state);
  stats.lastTick = stats.startTick + SIM_HZ * 125;
  assert.equal(matchDurationSeconds(stats), 125);
  assert.equal(formatDuration(125), '2:05');
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(3599), '59:59');
}

function testObjectivesProgressInOrder(): void {
  const state = makeState();
  const map = buildMapById(1);
  spawnEntity(state, 'townhall', 0, map.playerStart);
  const worker = spawnEntity(state, 'worker', 0, { x: map.playerStart.x + 4, y: map.playerStart.y + 1 });
  const tracker = createObjectiveTracker();

  let view = updateObjectives(tracker, state, 0);
  assert.equal(view.length, 6);
  assert.equal(view[0].id, 'gather');
  assert.equal(view[0].current, true);
  assert.equal(view.filter(v => v.current).length, 1, 'exactly one current step');

  const mine = state.entities.find(e => e.kind === 'goldmine');
  if (!mine) {
    const m = spawnEntity(state, 'goldmine', NEUTRAL, map.goldMines[0]);
    m.goldReserve = 1000;
  }
  const goldmine = state.entities.find(e => e.kind === 'goldmine')!;
  issueGatherCommand(state, worker, goldmine.id, state.tick);
  view = updateObjectives(tracker, state, 0);
  assert.equal(view[0].done, true, 'gather step done once a worker is gathering');
  assert.equal(view[1].current, true);

  spawnEntity(state, 'worker', 0, { x: map.playerStart.x + 5, y: map.playerStart.y + 2 });
  spawnEntity(state, 'farm', 0, { x: 20, y: 40 });
  spawnEntity(state, 'barracks', 0, { x: 24, y: 40 });
  view = updateObjectives(tracker, state, 0);
  assert.deepEqual(view.slice(0, 4).map(v => v.done), [true, true, true, true]);
  assert.equal(view[4].current, true);
  assert.deepEqual(view[4].progress, { value: 0, goal: ARMY_GOAL });
  assert.equal(setupComplete(tracker), false);

  for (let i = 0; i < ARMY_GOAL; i++) spawnEntity(state, 'footman', 0, { x: 30 + i, y: 30 });
  view = updateObjectives(tracker, state, 0);
  assert.equal(view[4].done, true);
  assert.equal(view[5].current, true);
  assert.equal(setupComplete(tracker), true);

  // Completed steps stay completed even if the building is lost later.
  const farm = state.entities.find(e => e.kind === 'farm' && e.owner === 0)!;
  killEntity(state, farm.id);
  view = updateObjectives(tracker, state, 0);
  assert.equal(view[2].done, true);

  view = updateObjectives(tracker, state, 0, 'win');
  assert.equal(view[5].done, true);
  assert.equal(view.some(v => v.current), false);
}

function testObjectivesIgnoreEnemyEntities(): void {
  const state = makeState();
  spawnEntity(state, 'farm', 1, { x: 20, y: 40 });
  spawnEntity(state, 'barracks', 1, { x: 24, y: 40 });
  const tracker = createObjectiveTracker();
  const view = updateObjectives(tracker, state, 0);
  assert.equal(view[2].done, false);
  assert.equal(view[3].done, false);
}

function testCompassDirection(): void {
  assert.equal(compassDirection({ x: 5, y: 50 }, { x: 55, y: 5 }), 'ne');
  assert.equal(compassDirection({ x: 5, y: 5 }, { x: 55, y: 50 }), 'se');
  assert.equal(compassDirection({ x: 30, y: 50 }, { x: 30, y: 5 }), 'n');
  assert.equal(compassDirection({ x: 50, y: 30 }, { x: 5, y: 30 }), 'w');
  assert.equal(compassDirection({ x: 5, y: 30 }, { x: 55, y: 30 }), 'e');
}

/** Observing a match (stats + objectives) must not perturb the simulation. */
function testObserversDoNotAffectDeterminism(): void {
  function run(observe: boolean): string {
    const map = buildMapById(1);
    const state = createWorld(map, ['human', 'orc']);
    spawnEntity(state, 'townhall', 0, map.playerStart);
    spawnEntity(state, 'worker', 0, { x: map.playerStart.x + 4, y: map.playerStart.y + 1 });
    for (const [i, pos] of map.goldMines.entries()) {
      const mine = spawnEntity(state, 'goldmine', NEUTRAL, pos);
      mine.goldReserve = map.goldMineReserves?.[i] ?? 10000;
    }
    spawnEntity(state, 'townhall', 1, map.aiStart);
    spawnEntity(state, 'peon', 1, { x: map.aiStart.x + 1, y: map.aiStart.y + 3 });
    const aiA = createAI('medium');
    const aiB = createAI('medium');
    const stats = createMatchStats(state);
    const tracker = createObjectiveTracker();
    for (let t = 0; t < SIM_HZ * 60; t++) {
      state.tick++;
      if (observe) measureIncome(stats, state, () => processCommandPass(state));
      else processCommandPass(state);
      autoAttackPass(state);
      computePopCaps(state);
      separateUnits(state);
      tickAI(state, aiA, 0);
      tickAI(state, aiB, 1);
      if (observe) {
        observeMatchTick(stats, state);
        updateObjectives(tracker, state, 0);
      }
    }
    if (observe) {
      assert.ok(stats.sides[0].goldMined > 0, 'AI side 0 should have mined gold in 60s');
      assert.ok(stats.sides[0].workersTrained > 0, 'AI side 0 should have trained workers in 60s');
    }
    return JSON.stringify({
      gold: state.gold, wood: state.wood, pop: state.pop,
      ents: state.entities.map(e => [e.id, e.kind, e.owner, e.pos.x, e.pos.y, e.hp]),
    });
  }
  assert.equal(run(true), run(false));
}

testStatsCountTrainedAndLost();
testIncomeMeasuresOnlyPositiveDeltas();
testDurationFormatting();
testObjectivesProgressInOrder();
testObjectivesIgnoreEnemyEntities();
testCompassDirection();
testObserversDoNotAffectDeterminism();
console.log('demo polish tests passed');
