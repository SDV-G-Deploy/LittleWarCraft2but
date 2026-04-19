import type { Camera } from './camera';
import { worldToScreen } from './camera';
import { TILE_SIZE } from '../types';

export type CommandMarkerKind = 'move' | 'moveExact' | 'attack' | 'gather' | 'build' | 'rally' | 'error';

export interface CommandMarker {
  kind: CommandMarkerKind;
  wx: number;
  wy: number;
  createdAt: number;
  ttlMs: number;
  tileSize?: number;
}

const MARKER_COLORS: Record<CommandMarkerKind, string> = {
  move: '#66d9ff',
  moveExact: '#b8f0ff',
  attack: '#ff6b6b',
  gather: '#ffe066',
  build: '#88ff88',
  rally: '#c792ff',
  error: '#ff9f43',
};

export function drawCommandMarkers(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  markers: CommandMarker[],
  now: number,
): void {
  for (const marker of markers) {
    const age = now - marker.createdAt;
    if (age >= marker.ttlMs) continue;
    const t = age / marker.ttlMs;
    const alpha = 1 - t;
    const radius = 8 + t * 10;
    const markerTileSize = marker.tileSize ?? TILE_SIZE;
    const { sx, sy } = worldToScreen(marker.wx - markerTileSize / 2, marker.wy - markerTileSize / 2, cam);
    const cx = sx + markerTileSize / 2;
    const cy = sy + markerTileSize / 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = MARKER_COLORS[marker.kind];
    ctx.lineWidth = 2;

    if (marker.kind === 'attack' || marker.kind === 'error') {
      ctx.beginPath();
      ctx.moveTo(cx - radius, cy - radius);
      ctx.lineTo(cx + radius, cy + radius);
      ctx.moveTo(cx + radius, cy - radius);
      ctx.lineTo(cx - radius, cy + radius);
      ctx.stroke();
      if (marker.kind === 'error') {
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (marker.kind === 'build') {
      ctx.strokeRect(cx - radius, cy - radius, radius * 2, radius * 2);
    } else if (marker.kind === 'moveExact') {
      const tileRadius = markerTileSize * 0.5;
      ctx.strokeRect(cx - tileRadius, cy - tileRadius, markerTileSize, markerTileSize);
      ctx.beginPath();
      ctx.moveTo(cx - tileRadius, cy);
      ctx.lineTo(cx + tileRadius, cy);
      ctx.moveTo(cx, cy - tileRadius);
      ctx.lineTo(cx, cy + tileRadius);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      if (marker.kind === 'rally') {
        ctx.beginPath();
        ctx.moveTo(cx, cy - radius - 4);
        ctx.lineTo(cx, cy + radius + 4);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
