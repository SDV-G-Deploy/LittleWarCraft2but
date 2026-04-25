import assert from 'node:assert/strict';
import { createAI, tickAI } from './ai';
import { buildMapById } from '../data/maps';
import { createWorld } from './world';
import { spawnEntity } from './entities';
import { NEUTRAL, type GameState } from '../types';

function makeState(races: ['human', 'orc'] | ['orc', 'human']): GameState {
  const map = buildMapById(1);
  return createWorld(map, races);
}

function seedStart(state: GameState): void {
  const map = buildMapById(1);
  spawnEntity(state, 'townhall', 0, map.playerStart);
  spawnEntity(state, state.races[0] === 'human' ? 'worker' : 'peon', 0, { x: map.playerStart.x + 3, y: map.playerStart.y + 1 });
  spawnEntity(state, 'townhall', 1, map.aiStart);
  spawnEntity(state, state.races[1] === 'human' ? 'worker' : 'peon', 1, { x: map.aiStart.x + 1, y: map.aiStart.y + 3 });
  for (const pos of map.goldMines) spawnEntity(state, 'goldmine', NEUTRAL, pos);
}

function testRaceDoctrineDiffersByOwnerRace(): void {
  const humanState = makeState(['human', 'orc']);
  seedStart(humanState);
  const humanAI = createAI('medium');
  tickAI(humanState, humanAI, 0);

  const orcState = makeState(['orc', 'human']);
  seedStart(orcState);
  const orcAI = createAI('medium');
  tickAI(orcState, orcAI, 0);

  assert.notEqual(humanAI.raceDoctrine.pressureBias, orcAI.raceDoctrine.pressureBias, 'race doctrine should differ between human and orc owners');
  assert.notEqual(humanAI.raceDoctrine.reserveBias, orcAI.raceDoctrine.reserveBias, 'reserve bias should differ by race doctrine');
  assert.notEqual(humanAI.preferredRangedRatio, orcAI.preferredRangedRatio, 'applied doctrine should affect ranged ratio');
}

function testStrategicIntentFortifiesUnderImmediateBaseThreat(): void {
  const state = makeState(['human', 'orc']);
  seedStart(state);
  const map = buildMapById(1);
  spawnEntity(state, 'grunt', 1, { x: map.playerStart.x + 2, y: map.playerStart.y + 5 });
  spawnEntity(state, 'grunt', 1, { x: map.playerStart.x + 3, y: map.playerStart.y + 5 });
  spawnEntity(state, 'grunt', 1, { x: map.playerStart.x + 4, y: map.playerStart.y + 5 });

  const ai = createAI('medium');
  tickAI(state, ai, 0);

  assert.equal(ai.strategicIntent, 'fortify', 'base threat should switch AI into fortify intent');
  assert.equal(ai.economicPosture, 'fortify', 'base threat should also fortify economy posture');
}

function run(): void {
  testRaceDoctrineDiffersByOwnerRace();
  testStrategicIntentFortifiesUnderImmediateBaseThreat();
  console.log('ai doctrine tests passed');
}

run();
