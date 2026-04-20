import type { Tile, MapData } from '../../types';

// ─── Tile factories ───────────────────────────────────────────────────────────

const G = (): Tile => ({ kind: 'grass',   passable: true  });
const T = (): Tile => ({ kind: 'tree',    passable: false });
const M = (): Tile => ({ kind: 'goldmine',passable: false });

// ─── Map builder ──────────────────────────────────────────────────────────────

function fill(
  map: Tile[][],
  x: number, y: number,
  w: number, h: number,
  fn: () => Tile,
): void {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      if (y + dy < 64 && x + dx < 64)
        map[y + dy][x + dx] = fn();
}

export function buildMap01(): MapData {
  // Start all grass
  const map: Tile[][] = Array.from({ length: 64 }, () =>
    Array.from({ length: 64 }, G),
  );

  // ── Border of trees ────────────────────────────────────────────────────────
  for (let i = 0; i < 64; i++) {
    map[0][i] = T(); map[63][i] = T();
    map[i][0] = T(); map[i][63] = T();
  }

  // ── Tree clusters ─────────────────────────────────────────────────────────
  fill(map,  5, 5,  5, 4, T);
  fill(map, 14, 8,  4, 6, T);
  fill(map,  8, 20, 3, 7, T);
  fill(map, 20, 3,  6, 3, T);
  fill(map, 38,  5, 5, 3, T);
  fill(map, 50, 12, 4, 5, T);
  fill(map, 44,  2, 3, 4, T);
  fill(map, 26, 22, 3, 20, T);
  fill(map, 29, 26, 5,  3, T);
  fill(map, 34, 30, 3,  8, T);
  fill(map,  5, 38, 4, 5, T);
  fill(map, 15, 44, 5, 4, T);
  fill(map,  9, 52, 3, 5, T);
  fill(map, 42, 48, 5, 5, T);
  fill(map, 54, 40, 4, 6, T);
  fill(map, 36, 55, 6, 3, T);

  // ── Gold mines (2×2 each) ─────────────────────────────────────────────────
  fill(map,  8, 52, 2, 2, M);
  fill(map, 13, 55, 2, 2, M);
  fill(map, 31, 32, 2, 2, M);
  fill(map, 52,  6, 2, 2, M);
  fill(map, 48, 10, 2, 2, M);

  return {
    tiles:       map,
    playerStart: { x: 3,  y: 50 },
    aiStart:     { x: 55, y: 5  },
    goldMines: [
      { x: 8,  y: 52 },
      { x: 13, y: 55 },
      { x: 31, y: 32 },
      { x: 52, y: 6  },
      { x: 48, y: 10 },
    ],
    goldMineReserves: [1500, 1500, 2200, 1500, 1500],
    name:        'Verdant Hills',
    description: 'Dense forests create a natural\nchokepoint in the center.',
  };
}
