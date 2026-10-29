/**
 * hud-overlays.ts
 * First-time-player overlays drawn on top of the game view:
 * objectives checklist, help/controls card, pause banner, HUD buttons,
 * and the end-of-match summary.
 */

import { t } from '../i18n';
import type { ObjectiveView, CompassDir } from '../sim/objectives';
import type { SideStats } from '../sim/match-stats';

export interface HudButton {
  x: number; y: number; w: number; h: number;
  action: string;
}

const C = {
  panel: 'rgba(14,16,22,0.86)',
  panelStroke: 'rgba(232,200,74,0.45)',
  gold: '#e8c84a',
  text: '#eae4d4',
  dim: 'rgba(234,228,212,0.62)',
  done: '#8fd99a',
  win: '#ffe97a',
  lose: '#ff6b6b',
  enemy: '#f5786a',
  you: '#6ab0f5',
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, stroke = C.panelStroke): void {
  roundRect(ctx, x, y, w, h, 6);
  ctx.fillStyle = C.panel;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Shrink-to-fit single-line text. */
export function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, weight: string, size: number, minSize = 9): void {
  let s = size;
  ctx.font = `${weight} ${s}px monospace`;
  while (s > minSize && ctx.measureText(text).width > maxW) {
    s--;
    ctx.font = `${weight} ${s}px monospace`;
  }
}

function button(ctx: CanvasRenderingContext2D, b: HudButton, label: string, hovered: boolean, accent = C.gold): void {
  roundRect(ctx, b.x, b.y, b.w, b.h, 4);
  ctx.fillStyle = hovered ? 'rgba(232,200,74,0.22)' : 'rgba(255,255,255,0.07)';
  ctx.fill();
  ctx.strokeStyle = hovered ? accent : 'rgba(232,200,74,0.5)';
  ctx.lineWidth = hovered ? 2 : 1;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = hovered ? accent : C.text;
  fitText(ctx, label, b.w - 10, 'bold', 13);
  ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 4);
  ctx.textAlign = 'left';
}

function isOver(b: HudButton, mx: number, my: number): boolean {
  return mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h;
}

// ─── Objectives ──────────────────────────────────────────────────────────────

function objectiveLabel(v: ObjectiveView): string {
  switch (v.id) {
    case 'gather': return t('obj_gather');
    case 'train_worker': return t('obj_train_worker');
    case 'gather_wood': return t('obj_gather_wood');
    case 'build_farm': return t('obj_build_farm');
    case 'build_barracks': return t('obj_build_barracks');
    case 'train_army': {
      const base = t('obj_train_army', { goal: v.progress?.goal ?? 4 });
      return v.progress ? `${base} ${v.progress.value}/${v.progress.goal}` : base;
    }
    case 'destroy_enemy': return t('obj_destroy_enemy');
  }
}

export function dirLabel(dir: CompassDir): string {
  switch (dir) {
    case 'n': return t('dir_n');
    case 'ne': return t('dir_ne');
    case 'e': return t('dir_e');
    case 'se': return t('dir_se');
    case 's': return t('dir_s');
    case 'sw': return t('dir_sw');
    case 'w': return t('dir_w');
    case 'nw': return t('dir_nw');
  }
}

/**
 * Checklist panel. When `compact` only the current step is shown (narrow
 * screens). When every setup step is done, only the final goal is shown.
 */
export function drawObjectivesPanel(
  ctx: CanvasRenderingContext2D,
  views: ObjectiveView[],
  x: number,
  y: number,
  maxW: number,
  enemyDir: CompassDir,
  compact: boolean,
  nowMs: number,
): void {
  const setupDone = views.every(v => v.id === 'destroy_enemy' || v.done);
  let rows: ObjectiveView[];
  if (setupDone) rows = views.filter(v => v.id === 'destroy_enemy');
  else if (compact) rows = views.filter(v => v.current);
  else rows = views;

  const extra: string[] = [];
  if (setupDone) {
    extra.push(t('obj_enemy_dir', { dir: dirLabel(enemyDir) }));
    extra.push(t('obj_attack_hint'));
  }

  const lineH = 17;
  const w = Math.max(160, Math.min(maxW, 300));
  const h = 24 + rows.length * lineH + extra.length * 15 + 6;
  panel(ctx, x, y, w, h);

  ctx.textAlign = 'left';
  ctx.fillStyle = C.gold;
  ctx.font = 'bold 11px monospace';
  ctx.fillText(t('obj_title'), x + 10, y + 16);
  const doneCount = views.filter(v => v.done).length;
  ctx.textAlign = 'right';
  ctx.fillStyle = C.dim;
  ctx.fillText(`${doneCount}/${views.length}`, x + w - 10, y + 16);
  ctx.textAlign = 'left';

  let ly = y + 24 + 12;
  const pulse = 0.55 + 0.45 * Math.sin(nowMs / 260);
  for (const v of rows) {
    const label = objectiveLabel(v);
    const mark = v.done ? '✓' : v.current ? '▸' : '·';
    ctx.fillStyle = v.done ? C.done : v.current ? `rgba(255,233,122,${pulse})` : C.dim;
    ctx.font = 'bold 12px monospace';
    ctx.fillText(mark, x + 10, ly);
    ctx.fillStyle = v.done ? C.done : v.current ? C.text : C.dim;
    fitText(ctx, label, w - 36, v.current ? 'bold' : 'normal', 12);
    ctx.fillText(label, x + 26, ly);
    ly += lineH;
  }
  for (const line of extra) {
    ctx.fillStyle = C.dim;
    fitText(ctx, line, w - 36, 'normal', 11);
    ctx.fillText(line, x + 26, ly - 2);
    ly += 15;
  }
}

// ─── HUD buttons (help / pause) ──────────────────────────────────────────────

export function layoutHudButtons(viewW: number, y: number, canPause: boolean): HudButton[] {
  const bw = 84; const bh = 28; const gap = 6;
  const out: HudButton[] = [];
  let x = viewW - 8 - bw;
  out.push({ x, y, w: bw, h: bh, action: 'hud:help' });
  if (canPause) {
    x -= bw + gap;
    out.push({ x, y, w: bw, h: bh, action: 'hud:pause' });
  }
  return out;
}

export function drawHudButtons(ctx: CanvasRenderingContext2D, buttons: HudButton[], paused: boolean, mx: number, my: number): void {
  for (const b of buttons) {
    const label = b.action === 'hud:help' ? t('hud_help') : paused ? t('hud_resume') : t('hud_pause');
    button(ctx, b, label, isOver(b, mx, my));
  }
}

// ─── Idle-worker chip ────────────────────────────────────────────────────────

export function drawIdleWorkersChip(
  ctx: CanvasRenderingContext2D,
  count: number,
  x: number,
  y: number,
  mx: number,
  my: number,
  nowMs: number,
): HudButton | null {
  if (count <= 0) return null;
  const label = t('hud_idle_workers', { count });
  ctx.font = 'bold 12px monospace';
  const w = Math.ceil(ctx.measureText(label).width) + 20;
  const b: HudButton = { x: x - w, y, w, h: 24, action: 'hud:idle' };
  const pulse = 0.5 + 0.5 * Math.sin(nowMs / 300);
  roundRect(ctx, b.x, b.y, b.w, b.h, 4);
  ctx.fillStyle = isOver(b, mx, my) ? 'rgba(110,72,20,0.95)' : 'rgba(70,46,14,0.9)';
  ctx.fill();
  ctx.strokeStyle = `rgba(255,210,120,${0.4 + 0.5 * pulse})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#ffd18a';
  ctx.textAlign = 'center';
  ctx.fillText(label, b.x + b.w / 2, b.y + 16);
  ctx.textAlign = 'left';
  return b;
}

// ─── Pause banner ────────────────────────────────────────────────────────────

export function drawPausedBanner(ctx: CanvasRenderingContext2D, viewW: number, viewH: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, viewW, viewH);
  const w = Math.min(420, viewW - 32); const h = 74;
  const x = (viewW - w) / 2; const y = viewH / 2 - h / 2;
  panel(ctx, x, y, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = C.gold;
  ctx.font = 'bold 26px monospace';
  ctx.fillText(t('paused'), viewW / 2, y + 34);
  ctx.fillStyle = C.dim;
  fitText(ctx, t('paused_hint'), w - 20, 'normal', 12);
  ctx.fillText(t('paused_hint'), viewW / 2, y + 56);
  ctx.textAlign = 'left';
}

// ─── Help / controls card ────────────────────────────────────────────────────

export function drawHelpOverlay(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, touch: boolean): void {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, viewW, viewH);

  const lines = [
    t('help_l1'), t('help_l2'), t('help_l3'), t('help_l4'),
    '', t('help_l5'), t('help_l6'), t('help_l7'),
    '', t('help_l8'), t('help_l9'),
  ];
  if (touch) lines.push('', t('help_touch'));

  const w = Math.min(640, viewW - 24);
  const lineH = 18;
  const naturalH = 70 + 36 + lines.length * lineH + 64;
  const scale = Math.min(1, (viewH - 24) / naturalH);
  const h = naturalH;
  const x = (viewW - w * scale) / 2;
  const y = Math.max(12, (viewH - h * scale) / 2);

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  panel(ctx, 0, 0, w, h, 'rgba(232,200,74,0.8)');

  ctx.textAlign = 'center';
  ctx.fillStyle = C.gold;
  ctx.font = 'bold 26px serif';
  ctx.fillText(t('help_title'), w / 2, 38);

  ctx.fillStyle = C.text;
  fitText(ctx, t('help_goal'), w - 32, 'bold', 13);
  ctx.fillText(t('help_goal'), w / 2, 66);

  ctx.textAlign = 'left';
  let ly = 100;
  for (const line of lines) {
    if (line) {
      ctx.fillStyle = C.text;
      fitText(ctx, line, w - 40, 'normal', 13);
      ctx.fillText(line, 20, ly);
    }
    ly += lineH;
  }
  ly += 4;
  ctx.textAlign = 'center';
  ctx.fillStyle = C.done;
  fitText(ctx, t('help_tip'), w - 32, 'normal', 12);
  ctx.fillText(t('help_tip'), w / 2, ly);
  ly += 28;
  const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 300);
  ctx.fillStyle = `rgba(255,233,122,${pulse})`;
  ctx.font = 'bold 15px monospace';
  ctx.fillText(t('help_dismiss'), w / 2, ly);
  ctx.textAlign = 'left';
  ctx.restore();
}

// ─── End-of-match summary ────────────────────────────────────────────────────

export interface EndScreenInput {
  title: string;
  titleColor: 'win' | 'lose';
  subtitle: string;
  meta: string;
  leftLabel: string;
  rightLabel: string;
  sides: [SideStats, SideStats]; // [left column, right column]
  canRematch: boolean;
}

export function drawEndScreen(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  input: EndScreenInput,
  mx: number,
  my: number,
): HudButton[] {
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, viewW, viewH);

  const [a, b] = input.sides;
  const rows: Array<[string, number, number]> = [
    [t('stat_gold'), a.goldMined, b.goldMined],
    [t('stat_wood'), a.woodHarvested, b.woodHarvested],
    [t('stat_trained'), a.unitsTrained, b.unitsTrained],
    [t('stat_peak'), a.peakArmy, b.peakArmy],
    [t('stat_lost'), a.unitsLost, b.unitsLost],
    [t('stat_built'), a.buildingsBuilt, b.buildingsBuilt],
    [t('stat_bldg_lost'), a.buildingsLost, b.buildingsLost],
  ];

  const w = Math.min(520, viewW - 24);
  const rowH = 24;
  const h = 150 + 28 + rows.length * rowH + 70;
  const scale = Math.min(1, (viewH - 24) / h);
  const x0 = (viewW - w * scale) / 2;
  const y0 = Math.max(12, (viewH - h * scale) / 2);

  ctx.save();
  ctx.translate(x0, y0);
  ctx.scale(scale, scale);
  panel(ctx, 0, 0, w, h, input.titleColor === 'win' ? 'rgba(255,233,122,0.85)' : 'rgba(255,107,107,0.8)');

  ctx.textAlign = 'center';
  ctx.fillStyle = input.titleColor === 'win' ? C.win : C.lose;
  ctx.font = 'bold 48px monospace';
  fitText(ctx, input.title, w - 24, 'bold', 48, 20);
  ctx.fillText(input.title, w / 2, 64);
  ctx.fillStyle = C.text;
  fitText(ctx, input.subtitle, w - 24, 'normal', 15);
  ctx.fillText(input.subtitle, w / 2, 96);
  ctx.fillStyle = C.dim;
  fitText(ctx, input.meta, w - 24, 'normal', 12);
  ctx.fillText(input.meta, w / 2, 120);

  // Table
  const colA = w - 170; const colB = w - 60;
  let ty = 160;
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = C.you;
  ctx.fillText(input.leftLabel, colA, ty);
  ctx.fillStyle = C.enemy;
  ctx.fillText(input.rightLabel, colB, ty);
  ty += 8;
  ctx.strokeStyle = 'rgba(232,200,74,0.3)';
  ctx.beginPath(); ctx.moveTo(20, ty); ctx.lineTo(w - 20, ty); ctx.stroke();
  ty += 20;
  for (const [label, va, vb] of rows) {
    ctx.textAlign = 'left';
    ctx.fillStyle = C.text;
    fitText(ctx, label, colA - 70, 'normal', 13);
    ctx.fillText(label, 24, ty);
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = va > vb ? C.win : C.text;
    ctx.fillText(String(va), colA, ty);
    ctx.fillStyle = vb > va ? C.win : C.text;
    ctx.fillText(String(vb), colB, ty);
    ty += rowH;
  }

  // Buttons (local coords → screen coords for hit testing)
  const btnH = 40;
  const btnY = h - btnH - 20;
  const local: Array<{ x: number; w: number; action: string; label: string }> = [];
  if (input.canRematch) {
    const bw = (w - 60) / 2;
    local.push({ x: 20, w: bw, action: 'end:rematch', label: t('end_rematch') });
    local.push({ x: 40 + bw, w: bw, action: 'end:menu', label: t('end_menu') });
  } else {
    local.push({ x: (w - 240) / 2, w: 240, action: 'end:menu', label: t('end_menu') });
  }
  const out: HudButton[] = [];
  for (const lb of local) {
    const screen: HudButton = {
      x: x0 + lb.x * scale, y: y0 + btnY * scale, w: lb.w * scale, h: btnH * scale, action: lb.action,
    };
    out.push(screen);
    button(ctx, { x: lb.x, y: btnY, w: lb.w, h: btnH, action: lb.action }, lb.label, isOver(screen, mx, my));
  }
  ctx.restore();
  ctx.textAlign = 'left';
  return out;
}
