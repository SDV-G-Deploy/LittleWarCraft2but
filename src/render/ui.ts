import type { Entity, EntityKind, GameState } from '../types';
import { TILE_SIZE, isWorkerKind } from '../types';
import { STATS } from '../data/units';
import { RACES, ownerRace } from '../data/races';
import type { Camera } from './camera';
import { isValidPlacement } from '../sim/economy';

// ─── Layout constants ──────────────────────────────────────────────────────────

const PANEL_H    = 96;
const BTN_W      = 100;
const BTN_H      = 32;
const BTN_PAD    = 8;
const PORTRAIT_W = 80;
const MAX_BTN_COLS = 4;

export interface UiButton {
  x: number; y: number;
  w: number; h: number;
  label: string;
  action: string; // opaque key consumed by game.ts
}

// ─── Draw ──────────────────────────────────────────────────────────────────────

export function drawUi(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  selectedIds: Set<number>,
  viewW: number,
  viewH: number,
  myOwner: 0 | 1 = 0,
): UiButton[] {
  const panelY = viewH - PANEL_H;
  const buttons: UiButton[] = [];

  // Panel background
  ctx.fillStyle = 'rgba(20,20,20,0.85)';
  ctx.fillRect(0, panelY, viewW, PANEL_H);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, panelY);
  ctx.lineTo(viewW, panelY);
  ctx.stroke();

  const sel = [...selectedIds]
    .map(id => state.entities.find(e => e.id === id))
    .filter((e): e is Entity => !!e);

  if (sel.length === 0) {
    drawEmptyPanel(ctx, panelY, viewW);
    return buttons;
  }

  if (sel.length === 1) {
    const e = sel[0];
    drawPortrait(ctx, e, panelY);
    drawEntityInfo(ctx, e, state, panelY, PORTRAIT_W + BTN_PAD, myOwner);
    collectButtons(ctx, e, state, panelY, viewW, buttons, myOwner);
  } else {
    // Multiple — show small icons for each
    sel.slice(0, 10).forEach((e, i) => {
      const bx = 8 + i * (38);
      const by = panelY + 8;
      const color = ['#6ab0f5', '#f5786a'][e.owner];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(bx + 15, by + 15, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(e.kind[0].toUpperCase(), bx + 15, by + 18);
      ctx.textAlign = 'left';
      // Mini hp bar
      ctx.fillStyle = '#333';
      ctx.fillRect(bx + 2, by + 29, 26, 4);
      ctx.fillStyle = '#44dd44';
      ctx.fillRect(bx + 2, by + 29, Math.round(26 * e.hp / e.hpMax), 4);
    });
  }

  return buttons;
}

function drawEmptyPanel(
  ctx: CanvasRenderingContext2D,
  panelY: number,
  viewW: number,
): void {
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Select a unit', viewW / 2, panelY + PANEL_H / 2 + 4);
  ctx.textAlign = 'left';
}

function drawPortrait(
  ctx: CanvasRenderingContext2D,
  e: Entity,
  panelY: number,
): void {
  const px = 8; const py = panelY + 8;
  const pw = PORTRAIT_W - 16; const ph = PANEL_H - 16;
  const color = ['#3a6aaa', '#aa3a3a'][e.owner];
  ctx.fillStyle = color;
  ctx.fillRect(px, py, pw, ph);

  ctx.fillStyle = ['#6ab0f5', '#f5786a'][e.owner];
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(e.kind[0].toUpperCase(), px + pw / 2, py + ph / 2 + 8);
  ctx.textAlign = 'left';
}

function drawEntityInfo(
  ctx: CanvasRenderingContext2D,
  e: Entity,
  state: GameState,
  panelY: number,
  x: number,
  myOwner: 0 | 1 = 0,
): void {
  const stats = STATS[e.kind];
  const rc    = ownerRace(state.races, e.owner);

  // ── Race-aware display name ─────────────────────────────────────────────────
  const displayName =
    e.kind === rc.worker  ? rc.workerLabel  :
    e.kind === rc.soldier ? rc.soldierLabel :
    e.kind === rc.ranged  ? rc.rangedLabel  :
    e.kind === 'townhall' ? rc.hallLabel    :
    e.kind === 'barracks' ? rc.barrLabel    :
    e.kind === 'farm'     ? rc.farmLabel    :
    e.kind === 'goldmine' ? 'Gold Mine'     :
    e.kind.toUpperCase();

  // Running Y cursor — everything flows downward from here
  const LINE = 13;
  let y = panelY + 16;

  // ── Name ───────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#eee';
  ctx.font = 'bold 13px monospace';
  ctx.fillText(displayName.toUpperCase(), x, y); y += LINE + 1;

  // ── HP ─────────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#aaa';
  ctx.font = '11px monospace';
  ctx.fillText(`HP: ${e.hp} / ${e.hpMax}`, x, y); y += LINE;

  // ── Combat stats (mobile units only) ───────────────────────────────────────
  if (stats && stats.speed > 0) {
    const atkSpd = stats.attackTicks > 0
      ? (stats.attackTicks / 20).toFixed(1) + 's'
      : '—';
    const rngStr = stats.range > 1 ? `${stats.range}` : 'melee';
    ctx.fillStyle = '#ffcc88';
    ctx.font = '10px monospace';
    ctx.fillText(
      `ATK:${stats.damage}  DEF:${stats.armor}  RNG:${rngStr}  SPD:${atkSpd}`,
      x, y,
    ); y += LINE;
  }

  // ── Gold mine reserve ───────────────────────────────────────────────────────
  if (e.kind === 'goldmine') {
    ctx.fillStyle = '#ffe97a';
    ctx.font = '11px monospace';
    ctx.fillText(`Gold remaining: ${e.goldReserve ?? 0}`, x, y); y += LINE;
  }

  // ── Food slots (farms / town halls) ────────────────────────────────────────
  if (e.kind === 'farm' || e.kind === 'townhall') {
    ctx.fillStyle = '#ffcc88';
    ctx.font = '11px monospace';
    ctx.fillText('+4 food slots', x, y); y += LINE;
  }

  // ── Pop + treasury (player-owned, non-goldmine) ─────────────────────────────
  if (e.owner === myOwner && e.kind !== 'goldmine') {
    const popFull = state.pop[myOwner] >= state.popCap[myOwner];
    ctx.fillStyle = popFull ? '#ff6666' : '#88ff88';
    ctx.font = '11px monospace';
    ctx.fillText(`Pop: ${state.pop[myOwner]}/${state.popCap[myOwner]}`, x, y);
    ctx.fillStyle = '#ffe97a';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`${state.gold[myOwner]}g`, x + 90, y);
    y += LINE;
  }

  // ── Carry gold (workers) ────────────────────────────────────────────────────
  if (e.carryGold) {
    ctx.fillStyle = '#ffe97a';
    ctx.font = '11px monospace';
    ctx.fillText(`Carrying: ${e.carryGold}g`, x, y); y += LINE;
  }

  // ── Rally point (townhall / barracks, player-owned) ────────────────────────
  if ((e.kind === 'townhall' || e.kind === 'barracks') && e.owner === myOwner) {
    ctx.font = '10px monospace';
    if (e.rallyPoint) {
      ctx.fillStyle = '#ffe840';
      ctx.fillText(`Rally → (${e.rallyPoint.x}, ${e.rallyPoint.y})`, x, y); y += LINE - 1;
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillText('RMB empty ground to move rally', x, y); y += LINE - 1;
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillText('RMB empty ground: set rally', x, y); y += LINE - 1;
    }
  }

  // ── Training progress ───────────────────────────────────────────────────────
  if (e.cmd?.type === 'train') {
    const tStats = STATS[e.cmd.unit];
    const pct   = Math.round(100 * (1 - e.cmd.ticksLeft / (tStats?.buildTicks ?? 1)));
    ctx.fillStyle = '#88ccff';
    ctx.font = '11px monospace';
    ctx.fillText(`Training: ${e.cmd.unit} ${pct}%`, x, y); y += LINE - 2;
    drawProgressBar(ctx, x, y, 150, '#4488ff', pct); y += 8;
    if (e.cmd.queue.length > 0) {
      ctx.fillStyle = '#aaa';
      ctx.font = '10px monospace';
      ctx.fillText(`Queue: ${e.cmd.queue.join(', ')}`, x, y);
    }
  }

  // ── Build progress (shown on the worker) ───────────────────────────────────
  if (e.cmd?.type === 'build') {
    ctx.font = '11px monospace';
    if (e.cmd.phase === 'moving') {
      ctx.fillStyle = '#88ccff';
      ctx.fillText(`→ Going to build ${e.cmd.building}…`, x, y); y += LINE;
    } else {
      ctx.fillStyle = '#88ffcc';
      ctx.fillText(`Building ${e.cmd.building}… (click site)`, x, y); y += LINE;
    }
  }

  // ── Construction site progress (shown on the scaffold entity) ──────────────
  if (e.kind === 'construction' && e.constructionOf) {
    const pct = Math.round(100 * e.hp / Math.max(1, e.hpMax));
    ctx.fillStyle = '#88ffcc';
    ctx.font = '11px monospace';
    ctx.fillText(`${e.constructionOf}: ${pct}% built`, x, y); y += LINE - 2;
    drawProgressBar(ctx, x, y, 150, '#44cc88', pct); y += 10;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '10px monospace';
    ctx.fillText('RMB worker here to continue', x, y); y += LINE - 1;
  }

  // ── Gather status ───────────────────────────────────────────────────────────
  if (e.cmd?.type === 'gather') {
    ctx.fillStyle = '#ffe97a';
    ctx.font = '11px monospace';
    const label =
      e.cmd.phase === 'gathering'  ? 'Mining…'          :
      e.cmd.phase === 'returning'  ? 'Returning gold…'  :
      'Walking to mine…';
    ctx.fillText(label, x, y);
  }

  // ── Attack status ───────────────────────────────────────────────────────────
  if (e.cmd?.type === 'attack') {
    ctx.fillStyle = '#ff8888';
    ctx.font = '11px monospace';
    ctx.fillText(e.cmd.chasePath.length > 0 ? 'Chasing…' : 'Attacking!', x, y);
  }

  // ── Move status ─────────────────────────────────────────────────────────────
  if (e.cmd?.type === 'move') {
    ctx.fillStyle = '#aaddff';
    ctx.font = '11px monospace';
    ctx.fillText('Moving…', x, y);
  }

  // ── Idle hint (player units only) ───────────────────────────────────────────
  if (e.owner === myOwner && !e.cmd && stats && stats.speed > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '10px monospace';
    ctx.fillText('RMB: Move/Attack/Gather   A+RMB: Atk-Move', x, panelY + PANEL_H - 8);
  }
}

function collectButtons(
  ctx: CanvasRenderingContext2D,
  e: Entity,
  state: GameState,
  panelY: number,
  viewW: number,
  buttons: UiButton[],
  myOwner: 0 | 1 = 0,
): void {
  if (e.owner !== myOwner) return; // no buttons for enemy entities

  const rc        = RACES[state.races[myOwner]]; // player race config
  const btnStartX = viewW - (BTN_W + BTN_PAD) * MAX_BTN_COLS;
  let col = 0;

  function addButton(label: string, action: string, disabled = false, danger = false): void {
    const bx = btnStartX + col * (BTN_W + BTN_PAD);
    const by = panelY + (PANEL_H - BTN_H) / 2;
    drawButton(ctx, bx, by, BTN_W, BTN_H, label, !disabled, danger);
    if (!disabled) buttons.push({ x: bx, y: by, w: BTN_W, h: BTN_H, label, action });
    col++;
  }

  // ── Production buildings ────────────────────────────────────────────────────
  if (e.kind === 'townhall') {
    const workerCost = STATS[rc.worker]?.cost ?? 50;
    addButton(`${rc.workerLabel} [V]\n[${workerCost}g]`, `train:${rc.worker}`,
      state.gold[myOwner] < workerCost);
  }
  if (e.kind === 'barracks') {
    const soldierCost = STATS[rc.soldier]?.cost ?? 80;
    const rangedCost  = STATS[rc.ranged]?.cost  ?? 100;
    addButton(`${rc.soldierLabel} [T]\n[${soldierCost}g]`, `train:${rc.soldier}`,
      state.gold[myOwner] < soldierCost);
    addButton(`${rc.rangedLabel} [A]\n[${rangedCost}g]`, `train:${rc.ranged}`,
      state.gold[myOwner] < rangedCost);
  }

  // ── Worker build menu (workers + peons both show build buttons) ─────────────
  if (isWorkerKind(e.kind)) {
    const barrCost = STATS['barracks']?.cost ?? 400;
    const farmCost = STATS['farm']?.cost     ?? 250;
    const wallCost = STATS['wall']?.cost     ?? 50;
    const barrLabel = rc.barrLabel;
    const farmLabel = rc.farmLabel;
    addButton(`${barrLabel} [B]\n[${barrCost}g]`, 'build:barracks', state.gold[myOwner] < barrCost);
    addButton(`${farmLabel} [F]\n[${farmCost}g]`, 'build:farm',     state.gold[myOwner] < farmCost);
    addButton(`Wall [W]\n[${wallCost}g]`,          'build:wall',     state.gold[myOwner] < wallCost);
  }

  // ── Stop (any player unit/building with an active command) ──────────────────
  if (e.cmd !== null) {
    addButton('Stop\n[S]', 'stop');
  }

  // ── Demolish / Cancel construction ─────────────────────────────────────────
  if (e.kind !== 'goldmine' && (STATS[e.kind]?.speed ?? 1) === 0) {
    const isConst  = e.kind === 'construction';
    const srcKind  = isConst ? (e.constructionOf ?? e.kind) : e.kind;
    const refund   = Math.floor((STATS[srcKind]?.cost ?? 0) * (isConst ? 1.0 : 0.8));
    const btnLabel = isConst ? `Cancel\n[+${refund}g]` : `Demolish\n[+${refund}g]`;
    addButton(btnLabel, 'demolish', false, true);
  }
}

// ─── Ghost building overlay ────────────────────────────────────────────────────

export function drawGhostBuilding(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cam: Camera,
  building: EntityKind,
  tx: number,
  ty: number,
): void {
  const stats = STATS[building];
  if (!stats) return;
  const valid = isValidPlacement(state, building, tx, ty);

  const sx = tx * TILE_SIZE - cam.x;
  const sy = ty * TILE_SIZE - cam.y;
  const pw = stats.tileW * TILE_SIZE;
  const ph = stats.tileH * TILE_SIZE;

  ctx.globalAlpha = 0.55;
  ctx.fillStyle   = valid ? '#44ff88' : '#ff4444';
  ctx.fillRect(sx, sy, pw, ph);
  ctx.strokeStyle = valid ? '#00cc44' : '#cc0000';
  ctx.lineWidth   = 2;
  ctx.strokeRect(sx + 1, sy + 1, pw - 2, ph - 2);
  ctx.globalAlpha = 1;
}

function drawProgressBar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number,
  color: string,
  pct: number,
): void {
  ctx.fillStyle = '#222';
  ctx.fillRect(x, y, w, 5);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.round(w * pct / 100), 5);
}

function drawButton(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  label: string,
  enabled: boolean,
  danger = false,
): void {
  if (danger) {
    ctx.fillStyle = enabled ? '#4a1a1a' : '#2a2a2a';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = enabled ? '#cc3333' : '#555';
  } else {
    ctx.fillStyle = enabled ? '#2a4a2a' : '#2a2a2a';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = enabled ? '#44aa44' : '#555';
  }
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  ctx.fillStyle = enabled
    ? (danger ? '#ffaaaa' : '#ccffcc')
    : '#666';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  const lines = label.split('\n');
  const lineH = 13;
  const startY = y + h / 2 - (lines.length - 1) * lineH / 2;
  lines.forEach((line, i) => ctx.fillText(line, x + w / 2, startY + i * lineH));
  ctx.textAlign = 'left';
}
