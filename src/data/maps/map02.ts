/**
 * Map 02 — River Crossing
 *
 * A wide river (water) splits the map horizontally.
 * Two grass ford crossings allow passage.
 * Both players start on opposite sides of the river (top/bottom center).
 * Control the fords to gain access to enemy gold.
 */

import type { Tile, MapData } from '../../types';

const G = (): Tile => ({ kind: 'grass',   passable: true  });
const T = (): Tile => ({ kind: 'tree',    passable: false });
const W = (): Tile => ({ kind: 'water',   passable: false });
const M = (): Tile => ({ kind: 'goldmine',passable: false });

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

export function buildMap02(): MapData {
  const map: Tile[][] = Array.from({ length: 64 }, () =>
    Array.from({ length: 64 }, G),
  );

  // ── Border trees ──────────────────────────────────────────────────────────
  for (let i = 0; i < 64; i++) {
    map[0][i] = T(); map[63][i] = T();
    map[i][0] = T(); map[i][63] = T();
  }

  // ── River: horizontal water band y=27..36 ─────────────────────────────────
  fill(map, 1, 27, 62, 10, W);

  // ── West ford (grass path through river at x=8..13) ──────────────────────
  fill(map, 8,  27, 6, 10, G);

  // ── East ford (grass path through river at x=50..55) ─────────────────────
  fill(map, 50, 27, 6, 10, G);

  // ── Forest along river banks (funnels toward the fords) ──────────────────
  // South bank — blocks center, leaves ford approaches open
  fill(map, 14, 24, 12, 4, T);  // blocks between fords, south side
  fill(map, 40, 24, 10, 4, T);
  // North bank
  fill(map, 14, 37, 12, 4, T);  // blocks between fords, north side
  fill(map, 40, 37, 10, 4, T);

  // ── Tree clusters — bottom half (player side) ─────────────────────────────
  fill(map,  5, 15, 4, 8, T);   // left flank
  fill(map, 55, 15, 4, 8, T);   // right flank
  fill(map, 22, 10, 5, 5, T);   // near player base
  fill(map, 38, 10, 5, 5, T);

  // ── Tree clusters — top half (AI side) ────────────────────────────────────
  fill(map,  5, 40, 4, 8, T);   // left flank
  fill(map, 55, 40, 4, 8, T);   // right flank
  fill(map, 22, 47, 5, 5, T);   // near AI base
  fill(map, 38, 47, 5, 5, T);

  // ── Gold mines ────────────────────────────────────────────────────────────
  // Player side (bottom)
  fill(map, 20, 16, 2, 2, M);   // primary
  fill(map, 40, 16, 2, 2, M);   // secondary
  // AI side (top)
  fill(map, 20, 45, 2, 2, M);
  fill(map, 40, 45, 2, 2, M);
  // Contested — beside each ford (accessible after crossing river)
  fill(map,  6, 31, 2, 2, M);   // west ford mine, pulled off the border so both sides can actually mine it
  fill(map, 56, 31, 2, 2, M);   // east ford mine, mirrored inward for reachable contested access

  // Flank grass shelves behind the fords create a longer but safer wrap route.
  fill(map, 2, 23, 6, 4, G);
  fill(map, 56, 37, 6, 4, G);

  return {
    tiles:       map,
    playerStart: { x: 28, y: 8  },
    aiStart:     { x: 28, y: 51 },
    goldMines: [
      { x: 20, y: 16 },
      { x: 40, y: 16 },
      { x: 20, y: 45 },
      { x: 40, y: 45 },
      { x:  6, y: 31 },
      { x: 56, y: 31 },
    ],
    goldMineReserves: [1700, 1400, 1700, 1400, 2200, 2200],
    name:        'River Crossing',
    description: 'A wide river divides the map.\nFords, flank shelves, and rich side mines shape crossings.',
  };
}
