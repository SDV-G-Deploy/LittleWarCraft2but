import type { GameState, FogState, MapData, Race } from '../types';
import { MAP_W, MAP_H, SIM_HZ } from '../types';

export function createWorld(mapData: MapData, races: [Race, Race]): GameState {
  const fog: FogState[][] = Array.from({ length: MAP_H }, () =>
    Array.from<FogState>({ length: MAP_W }).fill('unseen'),
  );

  return {
    tick: 0,
    tiles:    mapData.tiles,
    fog,
    entities: [],
    blockedTiles: new Uint8Array(MAP_W * MAP_H),
    corpses:  [],
    nextId:   1,
    gold:     [500, 500],
    pop:      [0, 0],
    popCap:   [4, 4],
    races,
    mapName: mapData.name,
    mapDescription: mapData.description,
    contestedMineBonusUntilTick: SIM_HZ * 64,
    openingPlanSelected: [null, null],
    openingCommitmentClaimed: [false, false],
    recentAttackEvents: [],
    recentProjectileEvents: [],
  };
}
