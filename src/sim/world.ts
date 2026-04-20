import type { GameState, FogState, MapData, Race } from '../types';
import { MAP_W, MAP_H, SIM_HZ, TREE_WOOD_INITIAL } from '../types';

export function createWorld(mapData: MapData, races: [Race, Race]): GameState {
  const fog: FogState[][] = Array.from({ length: MAP_H }, () =>
    Array.from<FogState>({ length: MAP_W }).fill('unseen'),
  );

  const tiles = mapData.tiles.map(row => row.map(tile => {
    const clone = { ...tile };
    if (clone.kind === 'tree' && typeof clone.woodReserve !== 'number') clone.woodReserve = TREE_WOOD_INITIAL;
    return clone;
  }));

  return {
    tick: 0,
    tiles,
    fog,
    entities: [],
    blockedTiles: new Uint8Array(MAP_W * MAP_H),
    corpses:  [],
    nextId:   1,
    gold:     [500, 500],
    wood:     [0, 0],
    pop:      [0, 0],
    popCap:   [4, 4],
    races,
    upgrades: [
      { meleeAttackLevel: 0, armorLevel: 0, buildingHpLevel: 0 },
      { meleeAttackLevel: 0, armorLevel: 0, buildingHpLevel: 0 },
    ],
    mapName: mapData.name,
    mapDescription: mapData.description,
    contestedMineBonusUntilTick: SIM_HZ * 64,
    openingPlanSelected: [null, null],
    openingCommitmentClaimed: [false, false],
    recentAttackEvents: [],
    recentProjectileEvents: [],
  };
}
