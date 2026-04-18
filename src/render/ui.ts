import type { Entity, EntityKind, GameState, OpeningPlan } from '../types';
import type { SessionStats, SessionStatus } from '../net/session';
import { SIM_HZ, TILE_SIZE, isUnitKind, isWorkerKind } from '../types';
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
  onlineStatus?: { status: SessionStatus; statusMsg: string; stats: SessionStats } | null,
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

  if (onlineStatus) drawOnlineStrip(ctx, viewW, panelY, onlineStatus);

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

function drawOnlineStrip(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  panelY: number,
  onlineStatus: { status: SessionStatus; statusMsg: string; stats: SessionStats },
): void {
  const { status, stats } = onlineStatus;
  const label =
    status === 'ready' && stats.waitingStallTicks === 0 ? 'Online: stable' :
    status === 'ready' ? 'Waiting for peer…' :
    status === 'disconnected' ? 'Online: disconnected' :
    status === 'error' ? 'Online: error' :
    'Online: connecting…';
  const detail = onlineStatus.statusMsg || label;
  const color =
    status === 'error' ? '#ff8888' :
    status === 'disconnected' ? '#ffb366' :
    stats.waitingStallTicks > 0 ? '#ffe97a' :
    '#88ffcc';

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(viewW - 248, panelY + 6, 240, 32);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.strokeRect(viewW - 247.5, panelY + 6.5, 239, 31);
  ctx.fillStyle = color;
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(label, viewW - 240, panelY + 16);

  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  ctx.font = '10px monospace';
  ctx.fillText(detail.slice(0, 30), viewW - 240, panelY + 27);

  const ageText = stats.lastPacketAgeMs === null ? 'no packets yet' : `${Math.round(stats.lastPacketAgeMs)}ms ago`;
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(ageText, viewW - 16, panelY + 21);
  ctx.textAlign = 'left';
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

function inferOpeningPlan(state: GameState, owner: 0 | 1, entity?: Entity | null): OpeningPlan {
  if (entity?.openingPlan) return entity.openingPlan;

  const ownerEntities = state.entities.filter(en => en.owner === owner);
  const townHall = ownerEntities.find(en => en.kind === 'townhall');
  const barracks = ownerEntities.find(en => en.kind === 'barracks');
  const workers = ownerEntities.filter(en => isWorkerKind(en.kind)).length;
  const army = ownerEntities.filter(en => isUnitKind(en.kind) && !isWorkerKind(en.kind));
  const ranged = army.filter(en => en.kind === ownerRace(state.races, owner).ranged).length;
  const gold = state.gold[owner];

  if (barracks?.openingPlan) return barracks.openingPlan;
  if (townHall?.openingPlan) return townHall.openingPlan;
  if (!barracks && workers < 4) return 'eco';
  if (barracks && ranged > 0) return 'pressure';
  if (!barracks && gold >= 300) return 'tempo';
  if (army.length >= 3 && ranged * 2 >= army.length) return 'pressure';
  return 'tempo';
}

function openingPlanText(plan: OpeningPlan): { title: string; body: string; risk: string } {
  switch (plan) {
    case 'eco':
      return {
        title: 'Economy opening',
        body: 'Safer worker growth, slower first map presence',
        risk: 'Risk: give up initiative if pressure arrives first',
      };
    case 'pressure':
      return {
        title: 'Pressure opening',
        body: 'Forward rally and sharper ranged route pressure',
        risk: 'Risk: fragile if you overextend without control',
      };
    case 'tempo':
    default:
      return {
        title: 'Tempo opening',
        body: 'Earlier army timing, weaker income curve',
        risk: 'Risk: if timing whiffs, eco falls behind',
      };
  }
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

    const roleLabel =
      e.kind === rc.soldier ? 'Role: frontline anchor' :
      e.kind === rc.ranged ? 'Role: backline pressure' :
      isWorkerKind(e.kind) ? 'Role: eco / build' :
      null;
    if (roleLabel) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '10px monospace';
      ctx.fillText(roleLabel, x, y); y += LINE - 1;
    }
  }

  // ── Gold mine reserve ───────────────────────────────────────────────────────
  if (e.kind === 'goldmine') {
    ctx.fillStyle = '#ffe97a';
    ctx.font = '11px monospace';
    ctx.fillText(`Gold remaining: ${e.goldReserve ?? 0}`, x, y); y += LINE;

    const myTownHall = state.entities.find(en => en.owner === myOwner && en.kind === 'townhall');
    const enemyTownHall = state.entities.find(en => en.owner !== myOwner && en.kind === 'townhall');
    const myDist = myTownHall ? Math.hypot(e.pos.x - myTownHall.pos.x, e.pos.y - myTownHall.pos.y) : Infinity;
    const enemyDist = enemyTownHall ? Math.hypot(e.pos.x - enemyTownHall.pos.x, e.pos.y - enemyTownHall.pos.y) : Infinity;
    const distanceGap = Math.abs(myDist - enemyDist);
    const nearCenter = e.pos.x > 16 && e.pos.x < 48;
    const isContested = nearCenter || distanceGap <= 8;
    const mineLabel = isContested ? 'Contested mine, control matters' : myDist < enemyDist
      ? 'Safer mine, eco anchor'
      : 'Outer mine, route pressure matters';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '10px monospace';
    ctx.fillText(mineLabel, x, y); y += LINE - 1;

    const actionHint = isContested
      ? 'Bring army or rally here before workers'
      : myDist < enemyDist
        ? 'Good target for worker saturation'
        : 'Take it when you can defend the route';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText(actionHint, x, y); y += LINE - 1;

    if (isContested && state.tick <= state.contestedMineBonusUntilTick) {
      const secondsLeft = Math.ceil((state.contestedMineBonusUntilTick - state.tick) / SIM_HZ);
      ctx.fillStyle = 'rgba(255,200,120,0.60)';
      ctx.fillText(`Opening clash window: +1 pressure damage nearby for ${secondsLeft}s`, x, y); y += LINE - 1;
    }
  }

  // ── Food slots (farms / town halls) ────────────────────────────────────────
  if (e.kind === 'farm' || e.kind === 'townhall') {
    ctx.fillStyle = '#ffcc88';
    ctx.font = '11px monospace';
    ctx.fillText('+4 food slots', x, y); y += LINE;
  }

  // ── Pop + treasury (player-owned, non-goldmine) ─────────────────────────────
  if (e.owner === myOwner && e.kind !== 'goldmine') {
    const pop = state.pop[myOwner];
    const popCap = state.popCap[myOwner];
    const popFull = pop >= popCap;
    const popNearFull = !popFull && popCap > 0 && popCap - pop <= 1;
    ctx.fillStyle = popFull ? '#ff6666' : popNearFull ? '#ffbb66' : '#88ff88';
    ctx.font = '11px monospace';
    ctx.fillText(`Pop: ${pop}/${popCap}`, x, y);
    ctx.fillStyle = '#ffe97a';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`${state.gold[myOwner]}g`, x + 90, y);
    y += LINE;

    if (popFull || popNearFull) {
      ctx.fillStyle = popFull ? '#ff7777' : '#ffcc88';
      ctx.font = '10px monospace';
      ctx.fillText(popFull ? 'Food full, add Farm now' : 'Food almost full, prep Farm', x, y);
      y += LINE - 1;
    }
  }

  // ── Carry gold (workers) ────────────────────────────────────────────────────
  if (e.carryGold) {
    ctx.fillStyle = '#ffe97a';
    ctx.font = '11px monospace';
    ctx.fillText(`Carrying: ${e.carryGold}g`, x, y); y += LINE;
  }

  // ── Under attack clarity ───────────────────────────────────────────────────
  if (typeof e.underAttackTick === 'number' && state.tick - e.underAttackTick <= SIM_HZ * 2) {
    ctx.fillStyle = '#ff7777';
    ctx.font = 'bold 10px monospace';
    if (isWorkerKind(e.kind)) {
      ctx.fillText('Harassed, pull back or defend', x, y); y += LINE - 1;
    } else if (e.kind === 'construction') {
      ctx.fillText('Build under pressure', x, y); y += LINE - 1;
    } else {
      ctx.fillText('Under attack', x, y); y += LINE - 1;
    }
  }

  // ── Opening branch framing (townhall / barracks, player-owned) ─────────────
  if ((e.kind === 'townhall' || e.kind === 'barracks') && e.owner === myOwner) {
    const openingPlan = inferOpeningPlan(state, myOwner, e);
    const openingCopy = openingPlanText(openingPlan);
    ctx.fillStyle = '#88d8ff';
    ctx.font = '10px monospace';
    ctx.fillText(`${openingCopy.title}: ${openingPlan.toUpperCase()}`, x, y); y += LINE - 1;
    ctx.fillStyle = 'rgba(255,255,255,0.52)';
    ctx.fillText(openingCopy.body, x, y); y += LINE - 1;
    ctx.fillStyle = 'rgba(255,220,140,0.55)';
    ctx.fillText(openingCopy.risk, x, y); y += LINE - 1;
  }

  // ── Rally point (townhall / barracks, player-owned) ────────────────────────
  if ((e.kind === 'townhall' || e.kind === 'barracks') && e.owner === myOwner) {
    ctx.font = '10px monospace';
    if (e.rallyPoint) {
      ctx.fillStyle = '#ffe840';
      ctx.fillText(`Rally → (${e.rallyPoint.x}, ${e.rallyPoint.y})`, x, y); y += LINE - 1;
      const myTownHall = state.entities.find(en => en.owner === myOwner && en.kind === 'townhall');
      const enemyTownHall = state.entities.find(en => en.owner !== myOwner && en.kind === 'townhall');
      const myDist = myTownHall ? Math.hypot(e.rallyPoint.x - myTownHall.pos.x, e.rallyPoint.y - myTownHall.pos.y) : Infinity;
      const enemyDist = enemyTownHall ? Math.hypot(e.rallyPoint.x - enemyTownHall.pos.x, e.rallyPoint.y - enemyTownHall.pos.y) : Infinity;
      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      const openingPlan = inferOpeningPlan(state, myOwner, e);
      const rallyText = Math.abs(myDist - enemyDist) <= 8
        ? (openingPlan === 'eco'
            ? 'Contested rally, you are leaving eco comfort'
            : openingPlan === 'tempo'
              ? 'Forward rally, good for first contest timing'
              : 'Forward rally, ideal for pressure fights')
        : myDist < enemyDist
          ? (openingPlan === 'pressure'
              ? 'Safe rally, pressure is not fully committed yet'
              : openingPlan === 'tempo'
                ? 'Safe rally, lets tempo army stabilize first'
                : 'Safe rally, good for macro buildup')
          : (openingPlan === 'pressure'
              ? 'Deep rally, pressure branch is fully committed'
              : 'Deep rally, commit only with map control');
      ctx.fillText(rallyText, x, y); y += LINE - 1;
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
    const barracksCost = STATS['barracks']?.cost ?? 360;
    const workerBusy = e.cmd?.type === 'train';
    const ownerEntities = state.entities.filter(en => en.owner === myOwner);
    const barracks = ownerEntities.find(en => en.kind === 'barracks');
    const workers = ownerEntities.filter(en => isWorkerKind(en.kind)).length;
    const canTempo = !barracks && state.gold[myOwner] >= Math.max(0, barracksCost - 120);
    const canPressure = !!barracks || !!e.rallyPoint;

    addButton(`${rc.workerLabel} [V]\n[${workerCost}g]`, `train:${rc.worker}`,
      state.gold[myOwner] < workerCost);
    if (!workerBusy && state.gold[myOwner] >= workerCost) {
      addButton(
        `${workers < 4 ? 'Eco branch' : 'Eco branch'}\nworker saturation`,
        `plan:eco|train:${rc.worker}`,
      );
    }
    addButton(
      canTempo ? 'Tempo branch\nprep barracks timing' : 'Tempo branch\nsave for barracks',
      'plan:tempo',
      false,
    );
    addButton(
      canPressure ? 'Pressure branch\nforward rally setup' : 'Pressure branch\nset rally, then commit',
      'plan:pressure',
      false,
    );
  }
  if (e.kind === 'barracks') {
    const soldierCost = STATS[rc.soldier]?.cost ?? 80;
    const rangedCost  = STATS[rc.ranged]?.cost  ?? 100;
    const myUnits = state.entities.filter(en => en.owner === myOwner && isUnitKind(en.kind));
    const soldierCount = myUnits.filter(en => en.kind === rc.soldier).length;
    const rangedCount = myUnits.filter(en => en.kind === rc.ranged).length;
    const queue = e.cmd?.type === 'train' ? [e.cmd.unit, ...e.cmd.queue] : [];
    const queuedSoldiers = queue.filter(kind => kind === rc.soldier).length;
    const queuedRanged = queue.filter(kind => kind === rc.ranged).length;
    const frontlineLead = soldierCount + queuedSoldiers - (rangedCount + queuedRanged);
    const wantsFrontline = frontlineLead <= 1;
    const wantsRanged = rangedCount + queuedRanged < Math.max(1, Math.floor((soldierCount + queuedSoldiers) / 2));

    addButton(`${rc.soldierLabel} [T]\n[${soldierCost}g]`, `train:${rc.soldier}`,
      state.gold[myOwner] < soldierCost);
    addButton(`${rc.rangedLabel} [A]\n[${rangedCost}g]`, `train:${rc.ranged}`,
      state.gold[myOwner] < rangedCost);
    if (state.gold[myOwner] >= soldierCost) {
      addButton(
        wantsFrontline ? 'Tempo branch\nfrontline now' : 'Frontline add\nhold the line',
        `plan:tempo|train:${rc.soldier}`,
      );
    }
    if (state.gold[myOwner] >= rangedCost) {
      addButton(
        wantsRanged ? 'Pressure branch\nranged timing' : 'Backline add\nkeep pressure up',
        `plan:pressure|train:${rc.ranged}`,
      );
    }
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
    if (state.gold[myOwner] >= wallCost) {
      addButton('Hold line\nquick wall', 'build:wall');
    }
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
