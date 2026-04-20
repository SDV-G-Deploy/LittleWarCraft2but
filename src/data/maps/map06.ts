import type { Tile, MapData } from '../../types';

const G = (): Tile => ({ kind: 'grass', passable: true });
const T = (): Tile => ({ kind: 'tree', passable: false });
const M = (): Tile => ({ kind: 'goldmine', passable: false });
const R = (): Tile => ({ kind: 'rock', passable: false });
const P = (): Tile => ({ kind: 'grass', passable: true, watchPost: true });

function fill(map: Tile[][], x: number, y: number, w: number, h: number, fn: () => Tile): void {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (x + dx < 64 && y + dy < 64) map[y + dy][x + dx] = fn();
}

export function buildMap06(): MapData {
  const map: Tile[][] = Array.from({ length: 64 }, () => Array.from({ length: 64 }, G));

  for (let i = 0; i < 64; i++) {
    map[0][i] = T(); map[63][i] = T();
    map[i][0] = T(); map[i][63] = T();
  }

  // Central ring-like blockers with 4 entries around a high-value center.
  fill(map, 22, 22, 20, 4, T);
  fill(map, 22, 38, 20, 4, T);
  fill(map, 22, 26, 4, 12, T);
  fill(map, 38, 26, 4, 12, T);

  // Carve entry gates (slightly wider for less binary hold/lock gameplay).
  fill(map, 29, 22, 6, 4, G);
  fill(map, 29, 38, 6, 4, G);
  fill(map, 22, 29, 4, 6, G);
  fill(map, 38, 29, 4, 6, G);

  fill(map, 27, 27, 2, 2, R);
  fill(map, 35, 35, 2, 2, R);

  // Slight flank clutter so center is still the fastest route.
  fill(map, 8, 28, 5, 8, T);
  fill(map, 51, 28, 5, 8, T);

  map[27][31] = P();
  map[29][29] = P();

  fill(map, 12, 12, 2, 2, M);
  fill(map, 50, 50, 2, 2, M);
  fill(map, 12, 50, 2, 2, M);
  fill(map, 50, 12, 2, 2, M);
  fill(map, 31, 31, 2, 2, M);
  fill(map, 29, 27, 2, 2, M);

  return {
    tiles: map,
    playerStart: { x: 8, y: 8 },
    aiStart: { x: 50, y: 50 },
    goldMines: [
      { x: 12, y: 12 },
      { x: 50, y: 50 },
      { x: 12, y: 50 },
      { x: 50, y: 12 },
      { x: 31, y: 31 },
      { x: 29, y: 27 },
    ],
    goldMineReserves: [1600, 1600, 1400, 1400, 2400, 2400],
    name: 'Crown Pit',
    description: 'Rich center ring creates a hard contest point.\nWatch posts, entries, and mine risk shape pit control.',
  };
}
