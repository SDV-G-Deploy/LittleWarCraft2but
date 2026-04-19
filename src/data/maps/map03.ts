import type { Tile, MapData } from '../../types';

const G = (): Tile => ({ kind: 'grass', passable: true });
const T = (): Tile => ({ kind: 'tree', passable: false });
const M = (): Tile => ({ kind: 'goldmine', passable: false });
const R = (): Tile => ({ kind: 'rock', passable: false });
const P = (): Tile => ({ kind: 'grass', passable: true, watchPost: true });

function fill(map: Tile[][], x: number, y: number, w: number, h: number, fn: () => Tile): void {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (x + dx < 64 && y + dy < 64) map[y + dy][x + dx] = fn();
}

export function buildMap03(): MapData {
  const map: Tile[][] = Array.from({ length: 64 }, () => Array.from({ length: 64 }, G));

  for (let i = 0; i < 64; i++) {
    map[0][i] = T(); map[63][i] = T();
    map[i][0] = T(); map[i][63] = T();
  }

  // Light corner forests, center stays very open for early pressure rotations.
  fill(map, 6, 6, 8, 7, T);
  fill(map, 50, 6, 8, 7, T);
  fill(map, 6, 50, 8, 7, T);
  fill(map, 50, 50, 8, 7, T);
  fill(map, 23, 10, 4, 4, T);
  fill(map, 37, 50, 4, 4, T);
  // Light mid-map clutter so center is contested but not completely empty.
  fill(map, 25, 28, 3, 2, T);
  fill(map, 36, 34, 3, 2, T);
  fill(map, 22, 24, 2, 2, R);
  fill(map, 40, 38, 2, 2, R);

  map[27][31] = P();
  map[35][32] = P();

  fill(map, 12, 44, 2, 2, M);
  fill(map, 18, 50, 2, 2, M);
  fill(map, 50, 12, 2, 2, M);
  fill(map, 44, 18, 2, 2, M);
  fill(map, 31, 31, 2, 2, M); // highly contestable center mine

  return {
    tiles: map,
    playerStart: { x: 8, y: 48 },
    aiStart: { x: 48, y: 8 },
    goldMines: [
      { x: 12, y: 44 },
      { x: 18, y: 50 },
      { x: 50, y: 12 },
      { x: 44, y: 18 },
      { x: 31, y: 31 },
    ],
    name: 'Open Steppe',
    description: 'Wide open lanes force early scouting and pressure.\nWatch posts and center mine reward active map control.',
  };
}
