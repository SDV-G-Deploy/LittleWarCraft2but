import type { GameState } from '../types';
import { MAP_W, MAP_H } from '../types';

const WATCH_POST_BONUS = 4;

/**
 * Update fog-of-war state once per sim tick.
 * Call AFTER entities have moved for this tick.
 *
 * Algorithm:
 *   1. Decay every 'visible' tile → 'explored'  (so tiles you leave go grey)
 *   2. Stamp 'visible' circle around each player-owned entity
 */
export function updateFog(state: GameState, playerOwner: 0 | 1 = 0): void {
  const { fog, entities } = state;

  // Step 1 — decay
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (fog[y][x] === 'visible') fog[y][x] = 'explored';
    }
  }

  // Step 2 — reveal
  for (const e of entities) {
    if (e.owner !== playerOwner) continue;   // only this player's entities reveal fog
    const cx = e.pos.x + Math.floor(e.tileW / 2);
    const cy = e.pos.y + Math.floor(e.tileH / 2);
    const tile = state.tiles[cy]?.[cx];
    const r = e.sightRadius + (tile?.watchPost ? WATCH_POST_BONUS : 0);
    if (r <= 0) continue;

    // Use centre of entity footprint
    const r2 = r * r;

    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const tx = cx + dx;
        const ty = cy + dy;
        if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
        fog[ty][tx] = 'visible';
      }
    }
  }
}
