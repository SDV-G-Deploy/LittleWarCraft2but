import { MAP_H, MAP_W } from '../types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const UI_PANEL_HEIGHT = 132;

export const MINI_SCALE = 2;
export const MINI_W = MAP_W * MINI_SCALE;
export const MINI_H = MAP_H * MINI_SCALE;
export const MINI_PAD = 8;

export interface DockLayout {
  dock: Rect;
  leftPane: Rect;
  centerPane: Rect;
  rightPane: Rect;
  minimapRect: Rect;
}

export function getDockLayout(viewW: number, viewH: number): DockLayout {
  const dock: Rect = { x: 0, y: viewH - UI_PANEL_HEIGHT, w: viewW, h: UI_PANEL_HEIGHT };
  const outerPad = 8;
  const gap = 8;
  const innerY = dock.y + outerPad;
  const innerH = dock.h - outerPad * 2;
  const rightW = MINI_W + MINI_PAD * 2;
  const leftW = Math.min(390, Math.max(300, Math.floor(viewW * 0.34)));
  const centerW = Math.max(180, dock.w - outerPad * 2 - leftW - rightW - gap * 2);

  const leftPane: Rect = { x: dock.x + outerPad, y: innerY, w: leftW, h: innerH };
  const centerPane: Rect = { x: leftPane.x + leftPane.w + gap, y: innerY, w: centerW, h: innerH };
  const rightPane: Rect = { x: centerPane.x + centerPane.w + gap, y: innerY, w: rightW, h: innerH };

  const minimapRect: Rect = {
    x: rightPane.x + Math.floor((rightPane.w - MINI_W) / 2),
    y: rightPane.y + Math.floor((rightPane.h - MINI_H) / 2),
    w: MINI_W,
    h: MINI_H,
  };

  return { dock, leftPane, centerPane, rightPane, minimapRect };
}

