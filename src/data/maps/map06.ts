import type { Tile, MapData } from '../../types';

const G = (): Tile => ({ kind: 'grass', passable: true });
const T = (): Tile => ({ kind: 'tree', passable: false });
const M = (): Tile => ({ kind: 'goldmine', passable: false });

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

  // Carve entry gates.
  fill(map, 30, 22, 4, 4, G);
  fill(map, 30, 38, 4, 4, G);
  fill(map, 22, 30, 4, 4, G);
  fill(map, 38, 30, 4, 4, G);

  // Slight flank clutter so center is still the fastest route.
  fill(map, 8, 28, 5, 8, T);
  fill(map, 51, 28, 5, 8, T);

  fill(map, 12, 12, 2, 2, M);
  fill(map, 50, 50, 2, 2, M);
  fill(map, 12, 50, 2, 2, M);
  fill(map, 50, 12, 2, 2, M);
  fill(map, 31, 31, 2, 2, M);
  fill(map, 28, 31, 2, 2, M);
  fill(map, 34, 31, 2, 2, M);

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
      { x: 28, y: 31 },
      { x: 34, y: 31 },
    ],
    name: 'Crown Pit',
    description: 'Rich center ring creates a hard contest point.\nHold gates, then break into the pit.',
  };
}
