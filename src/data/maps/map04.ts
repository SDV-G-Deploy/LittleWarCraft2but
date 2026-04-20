import type { Tile, MapData } from '../../types';

const G = (): Tile => ({ kind: 'grass', passable: true });
const T = (): Tile => ({ kind: 'tree', passable: false });
const W = (): Tile => ({ kind: 'water', passable: false });
const M = (): Tile => ({ kind: 'goldmine', passable: false });
const R = (): Tile => ({ kind: 'rock', passable: false });
const P = (): Tile => ({ kind: 'grass', passable: true, watchPost: true });

function fill(map: Tile[][], x: number, y: number, w: number, h: number, fn: () => Tile): void {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (x + dx < 64 && y + dy < 64) map[y + dy][x + dx] = fn();
}

export function buildMap04(): MapData {
  const map: Tile[][] = Array.from({ length: 64 }, () => Array.from({ length: 64 }, G));

  for (let i = 0; i < 64; i++) {
    map[0][i] = T(); map[63][i] = T();
    map[i][0] = T(); map[i][63] = T();
  }

  // Vertical river splits left-right halves, three fords.
  fill(map, 27, 1, 10, 62, W);
  fill(map, 27, 10, 10, 4, G);
  fill(map, 27, 29, 10, 6, G); // widened middle crossing to reduce hard-lock choke abuse
  fill(map, 27, 50, 10, 4, G);

  // Funnel approaches to crossings.
  fill(map, 22, 16, 5, 10, T);
  fill(map, 37, 38, 5, 10, T);
  fill(map, 22, 39, 5, 8, T);
  fill(map, 37, 17, 5, 8, T);

  fill(map, 24, 27, 3, 2, R);
  fill(map, 37, 35, 3, 2, R);

  map[28][31] = P();
  map[33][32] = P();

  fill(map, 8, 20, 2, 2, M);
  fill(map, 8, 42, 2, 2, M);
  fill(map, 54, 20, 2, 2, M);
  fill(map, 54, 42, 2, 2, M);
  fill(map, 31, 31, 2, 2, M); // middle ford objective

  return {
    tiles: map,
    playerStart: { x: 8, y: 30 },
    aiStart: { x: 52, y: 30 },
    goldMines: [
      { x: 8, y: 20 },
      { x: 8, y: 42 },
      { x: 54, y: 20 },
      { x: 54, y: 42 },
      { x: 31, y: 31 },
    ],
    goldMineReserves: [1600, 1400, 1600, 1400, 2300],
    name: 'Stone Fords',
    description: 'A vertical river creates repeated ford fights.\nMidline watch posts and uneven mine safety sharpen timing.',
  };
}
