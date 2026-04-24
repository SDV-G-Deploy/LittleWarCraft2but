import { TILE_SIZE, MAP_W, MAP_H } from '../types';

export interface Camera {
  x: number; // world-space pixels, top-left of viewport
  y: number;
}

export function createCamera(startTileX: number, startTileY: number): Camera {
  return {
    x: startTileX * TILE_SIZE,
    y: startTileY * TILE_SIZE,
  };
}

/** Clamp camera so it never scrolls outside the map. */
export function clampCamera(cam: Camera, viewW: number, viewH: number): void {
  const maxX = MAP_W * TILE_SIZE - viewW;
  const maxY = MAP_H * TILE_SIZE - viewH;
  cam.x = Math.max(0, Math.min(cam.x, Math.max(0, maxX)));
  cam.y = Math.max(0, Math.min(cam.y, Math.max(0, maxY)));
}

/** World pixel → screen pixel */
export function worldToScreen(
  wx: number, wy: number, cam: Camera,
): { sx: number; sy: number } {
  return { sx: wx - cam.x, sy: wy - cam.y };
}

/** Screen pixel → world pixel */
export function screenToWorld(
  sx: number, sy: number, cam: Camera,
): { wx: number; wy: number } {
  return { wx: sx + cam.x, wy: sy + cam.y };
}

/** Screen pixel → tile coordinate (integer) */
export function screenToTile(
  sx: number, sy: number, cam: Camera,
): { tx: number; ty: number } {
  const { wx, wy } = screenToWorld(sx, sy, cam);
  return { tx: Math.floor(wx / TILE_SIZE), ty: Math.floor(wy / TILE_SIZE) };
}

/** Tile coordinate → world pixel (top-left of tile) */
export function tileToWorld(tx: number, ty: number): { wx: number; wy: number } {
  return { wx: tx * TILE_SIZE, wy: ty * TILE_SIZE };
}
