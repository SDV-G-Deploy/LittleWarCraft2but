import type { Tile, MapData } from '../../types';

const G = (): Tile => ({ kind: 'grass', passable: true });
const T = (): Tile => ({ kind: 'tree', passable: false });
const M = (): Tile => ({ kind: 'goldmine', passable: false });
const R = (): Tile => ({ kind: 'rock', passable: false });
const P = (): Tile => ({ kind: 'grass', passable: true, watchPost: true });

function fill(map: Tile[][], x: number, y: number, w: number, h: number, fn: () => Tile): void {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (x + dx < 64 && y + dy < 64) map[y + dy][x + dx] = fn();
}

export function buildMap05(): MapData {
  const map: Tile[][] = Array.from({ length: 64 }, () => Array.from({ length: 64 }, G));

  for (let i = 0; i < 64; i++) {
    map[0][i] = T(); map[63][i] = T();
    map[i][0] = T(); map[i][63] = T();
  }

  // Forest lanes: two long walls with staggered gaps create positional corridors.
  fill(map, 20, 1, 6, 62, T);
  fill(map, 38, 1, 6, 62, T);

  // Openings in lane walls.
  fill(map, 20, 10, 6, 7, G);
  fill(map, 20, 46, 6, 7, G);
  fill(map, 38, 16, 6, 7, G);
  fill(map, 38, 52, 6, 6, G);

  fill(map, 28, 18, 2, 6, R);
  fill(map, 34, 40, 2, 6, R);

  map[26][31] = P();
  map[30][27] = P();

  // Midline gates stay blocked by destructibles at start,
  // opening a faster route into the contested center only after commitment.
  fill(map, 20, 31, 6, 3, G);
  fill(map, 38, 31, 6, 3, G);

  // Side brush around starts.
  fill(map, 7, 14, 6, 5, T);
  fill(map, 51, 45, 6, 5, T);

  fill(map, 8, 26, 2, 2, M);
  fill(map, 8, 38, 2, 2, M);
  fill(map, 54, 25, 2, 2, M);
  fill(map, 54, 37, 2, 2, M);

  fill(map, 31, 31, 2, 2, M);

  return {
    tiles: map,
    playerStart: { x: 7, y: 7 },
    aiStart: { x: 51, y: 51 },
    goldMines: [
      { x: 8, y: 26 },
      { x: 8, y: 38 },
      { x: 54, y: 25 },
      { x: 54, y: 37 },
      { x: 31, y: 31 },
    ],
    goldMineReserves: [1600, 1450, 1600, 1450, 2300],
    blockers: [
      { x: 20, y: 31, tileW: 6, tileH: 3 },
      { x: 38, y: 31, tileW: 6, tileH: 3 },
    ],
    name: 'Timber Lanes',
    description: 'Tree walls split the map into staged corridors.\nLane choices, watch posts, and center value reward control.',
  };
}
