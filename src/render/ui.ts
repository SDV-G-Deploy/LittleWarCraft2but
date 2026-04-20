import type { Entity, EntityKind, GameState, OpeningPlan } from '../types';
import type { SessionStats, SessionStatus } from '../net/session';
import { SIM_HZ, TILE_SIZE, MAP_H, MAP_W, isUnitKind, isWorkerKind, isNeutralOwner, usesRaceProfile } from '../types';
import { STATS } from '../data/units';
import { RACES, ownerRace } from '../data/races';
import { resolveEntityStatsForEntity, resolveEntityStatsForOwner, getResolvedBuildTicks, getResolvedCost, getResolvedHpMax, getResolvedSpeed, getResolvedSupplyProvided, getResolvedTileSize } from '../balance/resolver';
import { getOpeningPlanLockTicks, getOpeningPlanPresentation } from '../balance/openings';
import type { Camera } from './camera';
import { isValidPlacement } from '../sim/economy';
import { t, getLanguage } from '../i18n';

// ─── Layout constants ──────────────────────────────────────────────────────────

const PANEL_H    = 96;
const BTN_W      = 100;
const BTN_H      = 32;
const BTN_PAD    = 8;
const PORTRAIT_W = 80;
const MAX_BTN_COLS = 6;
const OPENING_PLAN_LOCK_TICKS = getOpeningPlanLockTicks();
const PRODUCTION_SLOTS = 5;

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
  openingPlanFeedback?: { plan: OpeningPlan; untilTick: number } | null,
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
  drawOpeningChoiceOverlay(ctx, state, viewW, panelY, myOwner, buttons);
  drawOpeningChoiceConfirmation(ctx, state, viewW, myOwner, openingPlanFeedback);

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
      const color = isNeutralOwner(e.owner) ? '#8e8e8e' : ['#6ab0f5', '#f5786a'][e.owner];
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
    status === 'ready' && stats.waitingStallTicks === 0 ? t('online_stable') :
    status === 'ready' ? t('online_waiting') :
    status === 'disconnected' ? t('online_disconnected') :
    status === 'error' ? t('online_error') :
    t('online_connecting');
  const detail = onlineStatus.stats.lastInboundSummary || onlineStatus.statusMsg || label;
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

  const ageText = stats.lastPacketAgeMs === null ? t('no_packets_yet') : t('ms_ago', { ms: Math.round(stats.lastPacketAgeMs) });
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(ageText, viewW - 16, panelY + 21);
  ctx.textAlign = 'left';
}

function drawOpeningChoiceOverlay(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewW: number,
  panelY: number,
  myOwner: 0 | 1,
  buttons: UiButton[],
): void {
  const selectedPlan = state.openingPlanSelected[myOwner];
  const ticksLeft = OPENING_PLAN_LOCK_TICKS - state.tick;
  if (selectedPlan || ticksLeft < 0) return;

  const overlayW = Math.min(700, viewW - 24);
  const compact = overlayW < 560;
  const veryNarrow = overlayW < 400;
  const gap = compact ? 8 : 12;
  const columns = veryNarrow ? 1 : (compact ? 2 : 3);
  const buttonH = veryNarrow ? 34 : (compact ? 38 : 42);
  const buttonAreaW = overlayW - 32;
  const buttonW = columns === 1
    ? buttonAreaW
    : Math.floor((buttonAreaW - gap * (columns - 1)) / columns);
  const rows = Math.ceil(3 / columns);
  const headerPad = compact ? 76 : 60;
  const overlayH = headerPad + rows * buttonH + (rows - 1) * gap + 16;
  const x = Math.floor((viewW - overlayW) / 2);
  const y = 12;
  const pulse = 0.5 + 0.5 * Math.sin(state.tick * 0.28);
  const introPulse = state.tick <= SIM_HZ * 2;

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, 0, viewW, panelY);

  ctx.fillStyle = 'rgba(9,16,28,0.94)';
  ctx.fillRect(x, y, overlayW, overlayH);
  ctx.strokeStyle = 'rgba(136,216,255,0.85)';
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 0.5, y + 0.5, overlayW - 1, overlayH - 1);
  if (introPulse) {
    ctx.strokeStyle = `rgba(255,230,140,${0.35 + pulse * 0.35})`;
    ctx.lineWidth = 5;
    ctx.strokeRect(x - 2.5, y - 2.5, overlayW + 4, overlayH + 4);
  }

  ctx.fillStyle = '#f5fbff';
  ctx.font = compact ? 'bold 16px monospace' : 'bold 18px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(t('choose_opening', { seconds: Math.ceil(ticksLeft / SIM_HZ) }), x + 16, y + 24);
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = '12px monospace';
  ctx.fillText(t('opening_pick_once'), x + 16, y + 44);
  ctx.fillStyle = 'rgba(255,230,140,0.92)';
  ctx.font = 'bold 12px monospace';
  if (compact) {
    ctx.fillText(t('opening_choice_banner'), x + 16, y + 60);
  } else {
    ctx.fillText(t('opening_choice_banner'), x + overlayW - 220, y + 24);
  }

  const btnY = y + headerPad;
  const labels = [
    { label: getOpeningPlanPresentation('eco').buttonLabel, action: 'plan:eco' },
    { label: getOpeningPlanPresentation('tempo').buttonLabel, action: 'plan:tempo' },
    { label: getOpeningPlanPresentation('pressure').buttonLabel, action: 'plan:pressure' },
  ];
  for (let i = 0; i < labels.length; i++) {
    const row = Math.floor(i / columns);
    const col = i % columns;
    const rowCount = row === rows - 1 ? labels.length - row * columns : columns;
    const rowTotalW = rowCount * buttonW + (rowCount - 1) * gap;
    const rowStartX = x + Math.floor((overlayW - rowTotalW) / 2);
    const bx = rowStartX + col * (buttonW + gap);
    const by = btnY + row * (buttonH + gap);
    const item = labels[i];
    drawButton(ctx, bx, by, buttonW, buttonH, item.label, true, false, introPulse ? pulse : 0);
    buttons.push({ x: bx, y: by, w: buttonW, h: buttonH, label: item.label, action: item.action });
  }
}

function drawOpeningChoiceConfirmation(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewW: number,
  myOwner: 0 | 1,
  openingPlanFeedback?: { plan: OpeningPlan; untilTick: number } | null,
): void {
  const selectedPlan = state.openingPlanSelected[myOwner];
  if (!selectedPlan) return;

  const feedbackActive = openingPlanFeedback && state.tick <= openingPlanFeedback.untilTick;
  if (!feedbackActive) return;

  const copy = openingPlanText(openingPlanFeedback.plan);
  const w = Math.min(360, viewW - 32);
  const h = 52;
  const x = Math.floor((viewW - w) / 2);
  const y = 18;

  ctx.fillStyle = 'rgba(8,24,14,0.9)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(130,255,170,0.9)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  ctx.fillStyle = '#d8ffe5';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(t('opening_locked', { title: copy.title }), x + w / 2, y + 21);
  ctx.fillStyle = 'rgba(216,255,229,0.82)';
  ctx.font = '11px monospace';
  ctx.fillText(copy.body, x + w / 2, y + 38, w - 20);
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
  ctx.fillText(t('select_a_unit'), viewW / 2, panelY + PANEL_H / 2 + 4);
  ctx.textAlign = 'left';
}

function drawPortrait(
  ctx: CanvasRenderingContext2D,
  e: Entity,
  panelY: number,
): void {
  const px = 8; const py = panelY + 8;
  const pw = PORTRAIT_W - 16; const ph = PANEL_H - 16;
  const color = isNeutralOwner(e.owner) ? '#4c4c4c' : ['#3a6aaa', '#aa3a3a'][e.owner];
  ctx.fillStyle = color;
  ctx.fillRect(px, py, pw, ph);

  ctx.fillStyle = isNeutralOwner(e.owner) ? '#bcbcbc' : ['#6ab0f5', '#f5786a'][e.owner];
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(e.kind[0].toUpperCase(), px + pw / 2, py + ph / 2 + 8);
  ctx.textAlign = 'left';
}

function getSelectedOpeningPlan(state: GameState, owner: 0 | 1): OpeningPlan | null {
  return state.openingPlanSelected[owner] ?? (state.tick > OPENING_PLAN_LOCK_TICKS ? 'eco' : null);
}

function openingPlanText(plan: OpeningPlan): { title: string; body: string; risk: string } {
  const base = getOpeningPlanPresentation(plan);
  if (getLanguage() === 'en') return base;
  if (plan === 'eco') {
    return {
      title: t('opening_name_eco'),
      body: 'Первый рабочий приносит +20 золота и сильнее разгоняет стартовую добычу',
      risk: 'Риск: можно отдать инициативу, если давление прилетит раньше',
    };
  }
  if (plan === 'tempo') {
    return {
      title: t('opening_name_tempo'),
      body: 'Первый боевой юнит один раз обучается на 35% быстрее',
      risk: 'Риск: если тайминг не заходит, экономика отстаёт',
    };
  }
  return {
    title: t('opening_name_pressure'),
    body: 'Первый боевой юнит форвард-коммитится, ускоряется и сильнее давит в начале',
    risk: 'Риск: хрупко, если переехать слишком глубоко без контроля',
  };
}

function translateDisplayLabel(label: string): string {
  if (getLanguage() === 'en') return label;
  switch (label) {
    case 'Peasant': return t('unit_peasant');
    case 'Peon': return t('unit_peon');
    case 'Footman': return t('unit_footman');
    case 'Archer': return t('unit_archer');
    case 'Knight': return t('unit_knight');
    case 'Grunt': return t('unit_grunt');
    case 'Troll': return t('unit_troll');
    case 'Ogre Fighter': return t('unit_ogre_fighter');
    case 'Town Hall': return t('unit_town_hall');
    case 'Great Hall': return t('unit_great_hall');
    case 'Barracks': return t('unit_barracks');
    case 'War Mill': return t('unit_war_mill');
    case 'Farm': return t('unit_farm');
    case 'Pig Farm': return t('unit_pig_farm');
    case 'Guard Tower': return t('unit_guard_tower');
    case 'Watch Tower': return t('unit_watch_tower');
    default: return label;
  }
}

function formatQueueLabel(kind: EntityKind, owner: 0 | 1, state: GameState): string {
  const rc = ownerRace(state.races, owner);
  return kind === rc.worker ? translateDisplayLabel(rc.workerLabel)
    : kind === rc.soldier ? translateDisplayLabel(rc.soldierLabel)
    : kind === rc.ranged ? translateDisplayLabel(rc.rangedLabel)
    : kind === rc.heavy ? translateDisplayLabel(rc.heavyLabel)
    : kind;
}

function drawProductionPanel(
  ctx: CanvasRenderingContext2D,
  e: Entity,
  state: GameState,
  x: number,
  y: number,
): number {
  if (!usesRaceProfile(e.owner)) return y;
  const blockX = x;
  const blockY = y - 2;
  const blockW = 300;
  const blockH = 44;
  const innerX = blockX + 8;
  const queueStartX = blockX + 195;
  const slotY = blockY + 17;

  ctx.fillStyle = 'rgba(110,160,255,0.12)';
  ctx.fillRect(blockX, blockY, blockW, blockH);
  ctx.strokeStyle = 'rgba(120,180,255,0.42)';
  ctx.strokeRect(blockX + 0.5, blockY + 0.5, blockW - 1, blockH - 1);

  ctx.fillStyle = '#9fd0ff';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(t('production'), innerX, blockY + 10);

  if (e.cmd?.type === 'train') {
    const trainBuildTicks = getResolvedBuildTicks(e.cmd.unit, usesRaceProfile(e.owner) ? state.races[e.owner] : null);
    const pct = Math.max(0, Math.min(100, Math.round(100 * (1 - e.cmd.ticksLeft / trainBuildTicks))));
    const currentLabel = formatQueueLabel(e.cmd.unit, e.owner, state);

    ctx.fillStyle = '#f3fbff';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(currentLabel.toUpperCase(), innerX, blockY + 24);
    ctx.fillStyle = '#cfe7ff';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`${pct}%`, blockX + 160, blockY + 24);

    drawProgressBar(ctx, innerX, blockY + 30, 170, '#52a7ff', pct);

    const visibleQueue = e.cmd.queue.slice(0, PRODUCTION_SLOTS);
    for (let i = 0; i < PRODUCTION_SLOTS; i++) {
      const sx = queueStartX + i * 19;
      const queued = visibleQueue[i];
      ctx.fillStyle = queued ? 'rgba(112,164,255,0.30)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(sx, slotY, 15, 15);
      ctx.strokeStyle = queued ? 'rgba(170,210,255,0.65)' : 'rgba(255,255,255,0.15)';
      ctx.strokeRect(sx + 0.5, slotY + 0.5, 14, 14);
      if (queued) {
        const label = formatQueueLabel(queued, e.owner, state);
        ctx.fillStyle = '#f7fbff';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label[0]?.toUpperCase() ?? '?', sx + 8, slotY + 11);
        ctx.textAlign = 'left';
      }
    }

    const extra = Math.max(0, e.cmd.queue.length - PRODUCTION_SLOTS);
    if (extra > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`+${extra}`, queueStartX + PRODUCTION_SLOTS * 19 + 3, slotY + 11);
    }
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(t('idle'), innerX, blockY + 24);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.font = '10px monospace';
    ctx.fillText(t('no_unit_in_production'), innerX, blockY + 36);

    for (let i = 0; i < PRODUCTION_SLOTS; i++) {
      const sx = queueStartX + i * 19;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(sx, slotY, 15, 15);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.strokeRect(sx + 0.5, slotY + 0.5, 14, 14);
    }
  }

  return y + blockH + 2;
}

function drawEntityInfo(
  ctx: CanvasRenderingContext2D,
  e: Entity,
  state: GameState,
  panelY: number,
  x: number,
  myOwner: 0 | 1 = 0,
): void {
  const stats = resolveEntityStatsForEntity(state, e);
  const rc    = usesRaceProfile(e.owner) ? ownerRace(state.races, e.owner) : null;
  const isProductionBuilding = (e.kind === 'townhall' || e.kind === 'barracks') && e.owner === myOwner;

  // ── Race-aware display name ─────────────────────────────────────────────────
  const displayName =
    rc && e.kind === rc.worker  ? translateDisplayLabel(rc.workerLabel)  :
    rc && e.kind === rc.soldier ? translateDisplayLabel(rc.soldierLabel) :
    rc && e.kind === rc.ranged  ? translateDisplayLabel(rc.rangedLabel)  :
    rc && e.kind === rc.heavy   ? translateDisplayLabel(rc.heavyLabel)   :
    rc && e.kind === 'townhall' ? translateDisplayLabel(rc.hallLabel)    :
    rc && e.kind === 'barracks' ? translateDisplayLabel(rc.barrLabel)    :
    rc && e.kind === 'farm'     ? translateDisplayLabel(rc.farmLabel)    :
    rc && e.kind === 'tower'    ? translateDisplayLabel(rc.towerLabel)   :
    e.kind === 'goldmine' ? t('gold_mine')  :
    e.kind === 'barrier' ? 'DESTRUCTIBLE BARRIER' :
    isNeutralOwner(e.owner) ? 'NEUTRAL' : e.kind.toUpperCase();

  // Running Y cursor — everything flows downward from here
  const LINE = 13;
  let y = panelY + 16;

  // ── Name ───────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#eee';
  ctx.font = 'bold 13px monospace';
  ctx.fillText(displayName.toUpperCase(), x, y); y += LINE + 1;

  if (isProductionBuilding) {
    y = drawProductionPanel(ctx, e, state, x, y);
  }

  // ── HP ─────────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#aaa';
  ctx.font = '11px monospace';
  ctx.fillText(`HP: ${e.hp} / ${getResolvedHpMax(e)}`, x, y); y += LINE;

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

    const roleLabel = rc
      ? (
        e.kind === rc.heavy ? t('role_elite_frontline') :
        e.kind === rc.soldier ? t('role_frontline') :
        e.kind === rc.ranged ? t('role_backline') :
        isWorkerKind(e.kind) ? t('role_eco') :
        null
      )
      : (isNeutralOwner(e.owner) ? 'world object' : null);
    if (roleLabel) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '10px monospace';
      ctx.fillText(roleLabel, x, y); y += LINE - 1;
    }
  }
  if (stats && stats.speed === 0 && stats.range > 1) {
    const atkSpd = stats.attackTicks > 0
      ? (stats.attackTicks / 20).toFixed(1) + 's'
      : '—';
    ctx.fillStyle = '#ffcc88';
    ctx.font = '10px monospace';
    ctx.fillText(
      `ATK:${stats.damage}  DEF:${stats.armor}  RNG:${stats.range}  SPD:${atkSpd}`,
      x, y,
    ); y += LINE;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '10px monospace';
    ctx.fillText(t('role_static_defense'), x, y); y += LINE - 1;
  }

  // ── Gold mine reserve ───────────────────────────────────────────────────────
  if (e.kind === 'goldmine') {
    ctx.fillStyle = '#ffe97a';
    ctx.font = '11px monospace';
    ctx.fillText(t('gold_remaining', { amount: e.goldReserve ?? 0 }), x, y); y += LINE;

    const myTownHall = state.entities.find(en => en.owner === myOwner && en.kind === 'townhall');
    const enemyTownHall = state.entities.find(en => en.owner !== myOwner && en.kind === 'townhall');
    const myDist = myTownHall ? Math.hypot(e.pos.x - myTownHall.pos.x, e.pos.y - myTownHall.pos.y) : Infinity;
    const enemyDist = enemyTownHall ? Math.hypot(e.pos.x - enemyTownHall.pos.x, e.pos.y - enemyTownHall.pos.y) : Infinity;
    const distanceGap = Math.abs(myDist - enemyDist);
    const nearCenter = e.pos.x > 16 && e.pos.x < 48;
    const isContested = nearCenter || distanceGap <= 8;
    const mineLabel = isContested ? t('mine_contested') : myDist < enemyDist
      ? t('mine_safer')
      : t('mine_outer');
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '10px monospace';
    ctx.fillText(mineLabel, x, y); y += LINE - 1;

    const actionHint = isContested
      ? t('mine_hint_contested')
      : myDist < enemyDist
        ? t('mine_hint_safer')
        : t('mine_hint_outer');
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText(actionHint, x, y); y += LINE - 1;

    if (isContested && state.tick <= state.contestedMineBonusUntilTick) {
      const secondsLeft = Math.ceil((state.contestedMineBonusUntilTick - state.tick) / SIM_HZ);
      ctx.fillStyle = 'rgba(255,200,120,0.60)';
      ctx.fillText(t('clash_window', { seconds: secondsLeft }), x, y); y += LINE - 1;
    }
  }

  if (e.carryWood) {
    ctx.fillStyle = '#8fdc6d';
    ctx.font = '11px monospace';
    ctx.fillText(t('carrying_wood', { amount: e.carryWood }), x, y); y += LINE;
  }

  const centerX = Math.min(MAP_W - 1, Math.max(0, e.pos.x + Math.floor(e.tileW / 2)));
  const centerY = Math.min(MAP_H - 1, Math.max(0, e.pos.y + Math.floor(e.tileH / 2)));
  const centerTile = state.tiles[centerY]?.[centerX];
  if (centerTile?.watchPost && e.owner === myOwner && isUnitKind(e.kind)) {
    ctx.fillStyle = '#f4d35e';
    ctx.font = '10px monospace';
    ctx.fillText(t('watch_post_1'), x, y); y += LINE - 1;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText(t('watch_post_2'), x, y); y += LINE - 1;
  }

  // ── Food slots (farms / town halls) ────────────────────────────────────────
  if (e.kind === 'farm' || e.kind === 'townhall') {
    const supplyProvided = getResolvedSupplyProvided(e.kind, usesRaceProfile(e.owner) ? state.races[e.owner] : null);
    ctx.fillStyle = '#ffcc88';
    ctx.font = '11px monospace';
    ctx.fillText(t('food_slots', { amount: supplyProvided }), x, y); y += LINE;
  }

  // ── Pop + treasury (player-owned, non-goldmine) ─────────────────────────────
  if (e.owner === myOwner && e.kind !== 'goldmine') {
    const pop = state.pop[myOwner];
    const popCap = state.popCap[myOwner];
    const popFull = pop >= popCap;
    const popNearFull = !popFull && popCap > 0 && popCap - pop <= 1;
    ctx.fillStyle = popFull ? '#ff6666' : popNearFull ? '#ffbb66' : '#88ff88';
    ctx.font = '11px monospace';
    ctx.fillText(t('pop', { pop, cap: popCap }), x, y);
    ctx.fillStyle = '#ffe97a';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`${state.gold[myOwner]}g`, x + 90, y);
    ctx.fillStyle = '#8fdc6d';
    ctx.fillText(`${state.wood[myOwner]}w`, x + 140, y);
    y += LINE;

    if (popFull || popNearFull) {
      ctx.fillStyle = popFull ? '#ff7777' : '#ffcc88';
      ctx.font = '10px monospace';
      ctx.fillText(popFull ? t('food_full') : t('food_almost_full'), x, y);
      y += LINE - 1;
    }
  }

  // ── Carry gold (workers) ────────────────────────────────────────────────────
  if (e.carryGold) {
    ctx.fillStyle = '#ffe97a';
    ctx.font = '11px monospace';
    ctx.fillText(t('carrying', { amount: e.carryGold }), x, y); y += LINE;
  }

  // ── Under attack clarity ───────────────────────────────────────────────────
  if (typeof e.underAttackTick === 'number' && state.tick - e.underAttackTick <= SIM_HZ * 2) {
    ctx.fillStyle = '#ff7777';
    ctx.font = 'bold 10px monospace';
    if (isWorkerKind(e.kind)) {
      ctx.fillText(t('harassed'), x, y); y += LINE - 1;
    } else if (e.kind === 'construction') {
      ctx.fillText(t('build_under_pressure'), x, y); y += LINE - 1;
    } else {
      ctx.fillText(t('under_attack'), x, y); y += LINE - 1;
    }
  }

  // ── Opening branch framing (townhall / barracks, player-owned) ─────────────
  if ((e.kind === 'townhall' || e.kind === 'barracks') && e.owner === myOwner) {
    const selectedPlan = getSelectedOpeningPlan(state, myOwner);
    const openingSpent = state.openingCommitmentClaimed[myOwner];
    const canStillChoose = state.tick <= OPENING_PLAN_LOCK_TICKS;
    const openingCopy = selectedPlan ? openingPlanText(selectedPlan) : null;
    ctx.fillStyle = 'rgba(136,216,255,0.58)';
    ctx.font = '10px monospace';
    ctx.fillText(t('opening_status', { title: openingCopy ? openingCopy.title : t('opening_not_selected') }), x, y); y += LINE - 1;
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.fillText(
      selectedPlan
        ? (openingSpent ? t('opening_bonus_spent') : t('opening_bonus_ready'))
        : (canStillChoose ? t('opening_choose_now') : t('opening_auto_locked')),
      x,
      y,
    ); y += LINE - 1;
    if (openingCopy) {
      ctx.fillText(openingCopy.body, x, y); y += LINE - 1;
    }
    if (selectedPlan === 'pressure' && !openingSpent) {
      ctx.fillStyle = 'rgba(255,200,120,0.52)';
      ctx.fillText(t('pressure_damage_window'), x, y); y += LINE - 1;
    }
  }

  // ── Rally point (townhall / barracks, player-owned) ────────────────────────
  if ((e.kind === 'townhall' || e.kind === 'barracks') && e.owner === myOwner) {
    ctx.font = '10px monospace';
    if (e.rallyPoint) {
      ctx.fillStyle = '#ffe840';
      ctx.fillText(t('rally_to', { x: e.rallyPoint.x, y: e.rallyPoint.y }), x, y); y += LINE - 1;
      const myTownHall = state.entities.find(en => en.owner === myOwner && en.kind === 'townhall');
      const enemyTownHall = state.entities.find(en => en.owner !== myOwner && en.kind === 'townhall');
      const myDist = myTownHall ? Math.hypot(e.rallyPoint.x - myTownHall.pos.x, e.rallyPoint.y - myTownHall.pos.y) : Infinity;
      const enemyDist = enemyTownHall ? Math.hypot(e.rallyPoint.x - enemyTownHall.pos.x, e.rallyPoint.y - enemyTownHall.pos.y) : Infinity;
      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      const openingPlan = getSelectedOpeningPlan(state, myOwner) ?? 'tempo';
      const rallyText = Math.abs(myDist - enemyDist) <= 8
        ? (openingPlan === 'eco'
            ? t('rally_contested_eco')
            : openingPlan === 'tempo'
              ? t('rally_contested_tempo')
              : t('rally_contested_pressure'))
        : myDist < enemyDist
          ? (openingPlan === 'pressure'
              ? t('rally_safe_pressure')
              : openingPlan === 'tempo'
                ? t('rally_safe_tempo')
                : t('rally_safe_eco'))
          : (openingPlan === 'pressure'
              ? t('rally_deep_pressure')
              : t('rally_deep_other'));
      ctx.fillText(rallyText, x, y); y += LINE - 1;
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillText(t('rally_move'), x, y); y += LINE - 1;
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillText(t('rally_set'), x, y); y += LINE - 1;
      const selectedPlan = getSelectedOpeningPlan(state, myOwner);
      if (selectedPlan === 'eco') {
        ctx.fillStyle = 'rgba(160,230,180,0.42)';
        ctx.fillText(t('eco_fallback'), x, y); y += LINE - 1;
      }
      if (selectedPlan === 'tempo' && !state.openingCommitmentClaimed[myOwner]) {
        ctx.fillStyle = 'rgba(180,220,255,0.48)';
        ctx.fillText(t('tempo_fallback'), x, y); y += LINE - 1;
      }
      if (selectedPlan === 'pressure' && !state.openingCommitmentClaimed[myOwner]) {
        ctx.fillStyle = 'rgba(255,200,120,0.42)';
        ctx.fillText(t('pressure_fallback'), x, y); y += LINE - 1;
        ctx.fillStyle = 'rgba(255,170,120,0.34)';
        ctx.fillText(t('pressure_fallback_2'), x, y); y += LINE - 1;
      }
    }
  }

  // ── Training progress ───────────────────────────────────────────────────────
  // ── Build progress (shown on the worker) ───────────────────────────────────
  if (e.cmd?.type === 'build') {
    ctx.font = '11px monospace';
    if (e.cmd.phase === 'moving') {
      ctx.fillStyle = '#88ccff';
      ctx.fillText(t('going_to_build', { building: e.cmd.building }), x, y); y += LINE;
    } else {
      ctx.fillStyle = '#88ffcc';
      ctx.fillText(t('building_click_site', { building: e.cmd.building }), x, y); y += LINE;
    }
  }

  // ── Construction site progress (shown on the scaffold entity) ──────────────
  if (e.kind === 'construction' && e.constructionOf) {
    const pct = Math.round(100 * e.hp / Math.max(1, e.hpMax));
    ctx.fillStyle = '#88ffcc';
    ctx.font = '11px monospace';
    ctx.fillText(t('built_pct', { building: e.constructionOf, pct }), x, y); y += LINE - 2;
    drawProgressBar(ctx, x, y, 150, '#44cc88', pct); y += 10;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '10px monospace';
    ctx.fillText(t('continue_build'), x, y); y += LINE - 1;
  }

  // ── Gather status ───────────────────────────────────────────────────────────
  if (e.cmd?.type === 'gather') {
    ctx.fillStyle = '#ffe97a';
    ctx.font = '11px monospace';
    const label =
      e.cmd.phase === 'gathering'  ? t('mining')         :
      e.cmd.phase === 'returning'  ? t('returning_gold') :
      t('walking_to_mine');
    ctx.fillText(label, x, y);
  }

  // ── Attack status ───────────────────────────────────────────────────────────
  if (e.cmd?.type === 'attack') {
    ctx.fillStyle = '#ff8888';
    ctx.font = '11px monospace';
    ctx.fillText(e.cmd.chasePath.length > 0 ? t('chasing') : t('attacking'), x, y);
  }

  // ── Move status ─────────────────────────────────────────────────────────────
  if (e.cmd?.type === 'move') {
    ctx.fillStyle = '#aaddff';
    ctx.font = '11px monospace';
    ctx.fillText(t('moving'), x, y);
  }

  // ── Idle hint (player units only) ───────────────────────────────────────────
  if (e.owner === myOwner && !e.cmd && stats && stats.speed > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '10px monospace';
    ctx.fillText(t('rmb_hint'), x, panelY + PANEL_H - 8);
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
    const workerCost = resolveEntityStatsForOwner(rc.worker, state.races, myOwner).cost;
    const barracksCost = getResolvedCost('barracks', state.races[myOwner]);
    const workerBusy = e.cmd?.type === 'train';
    const selectedPlan = getSelectedOpeningPlan(state, myOwner);
    addButton(`${translateDisplayLabel(rc.workerLabel)} [V]\n[${workerCost.gold}g${workerCost.wood ? ` ${workerCost.wood}w` : ''}]`, `train:${rc.worker}`,
      state.gold[myOwner] < workerCost.gold || state.wood[myOwner] < workerCost.wood);
    if (!workerBusy && state.gold[myOwner] >= workerCost.gold && state.wood[myOwner] >= workerCost.wood) {
      addButton(t('worker_spike'), `train:${rc.worker}`);
    }
  }
  if (e.kind === 'barracks') {
    const soldierCost = resolveEntityStatsForOwner(rc.soldier, state.races, myOwner).cost;
    const rangedCost  = resolveEntityStatsForOwner(rc.ranged, state.races, myOwner).cost;
    const heavyCost   = resolveEntityStatsForOwner(rc.heavy, state.races, myOwner).cost;
    const myUnits = state.entities.filter(en => en.owner === myOwner && isUnitKind(en.kind));
    const soldierCount = myUnits.filter(en => en.kind === rc.soldier).length;
    const rangedCount = myUnits.filter(en => en.kind === rc.ranged).length;
    const heavyCount = myUnits.filter(en => en.kind === rc.heavy).length;
    const queue = e.cmd?.type === 'train' ? [e.cmd.unit, ...e.cmd.queue] : [];
    const queuedSoldiers = queue.filter(kind => kind === rc.soldier).length;
    const queuedRanged = queue.filter(kind => kind === rc.ranged).length;
    const queuedHeavy = queue.filter(kind => kind === rc.heavy).length;
    const frontlineMass = soldierCount + queuedSoldiers;
    const anchorCount = heavyCount + queuedHeavy;
    const wantsFrontline = frontlineMass - (rangedCount + queuedRanged) <= 1;
    const wantsRanged = rangedCount + queuedRanged < Math.max(1, Math.floor((frontlineMass + anchorCount) / 2));
    const wantsHeavy = anchorCount < 2 && frontlineMass >= 2;

    addButton(`${translateDisplayLabel(rc.soldierLabel)} [T]\n[${soldierCost.gold}g${soldierCost.wood ? ` ${soldierCost.wood}w` : ''}]`, `train:${rc.soldier}`,
      state.gold[myOwner] < soldierCost.gold || state.wood[myOwner] < soldierCost.wood);
    addButton(`${translateDisplayLabel(rc.rangedLabel)} [A]\n[${rangedCost.gold}g${rangedCost.wood ? ` ${rangedCost.wood}w` : ''}]`, 'train_ranged',
      state.gold[myOwner] < rangedCost.gold || state.wood[myOwner] < rangedCost.wood);
    addButton(`${translateDisplayLabel(rc.heavyLabel)} [H]\n[${heavyCost.gold}g${heavyCost.wood ? ` ${heavyCost.wood}w` : ''}]`, `train:${rc.heavy}`,
      state.gold[myOwner] < heavyCost.gold || state.wood[myOwner] < heavyCost.wood);
    if (state.gold[myOwner] >= soldierCost.gold && state.wood[myOwner] >= soldierCost.wood && wantsFrontline) {
      addButton(t('frontline_add'), `train:${rc.soldier}`);
    }
    if (state.gold[myOwner] >= rangedCost.gold && state.wood[myOwner] >= rangedCost.wood && wantsRanged) {
      addButton(t('backline_add'), `train:${rc.ranged}`);
    }
    if (state.gold[myOwner] >= heavyCost.gold && state.wood[myOwner] >= heavyCost.wood && wantsHeavy) {
      addButton(t('anchor_add'), `train:${rc.heavy}`);
    }
  }

  // ── Worker build menu (workers + peons both show build buttons) ─────────────
  if (isWorkerKind(e.kind)) {
    const barrCost = getResolvedCost('barracks', state.races[myOwner]);
    const farmCost = getResolvedCost('farm', state.races[myOwner]);
    const wallCost = getResolvedCost('wall', state.races[myOwner]);
    const towerCost = getResolvedCost('tower', state.races[myOwner]);
    const hasBarracks = state.entities.some(en => en.owner === myOwner && en.kind === 'barracks');
    const barrLabel = translateDisplayLabel(rc.barrLabel);
    const farmLabel = translateDisplayLabel(rc.farmLabel);
    addButton(`${barrLabel} [B]\n[${barrCost.gold}g${barrCost.wood ? ` ${barrCost.wood}w` : ''}]`, 'build:barracks', state.gold[myOwner] < barrCost.gold || state.wood[myOwner] < barrCost.wood);
    addButton(`${farmLabel} [F]\n[${farmCost.gold}g${farmCost.wood ? ` ${farmCost.wood}w` : ''}]`, 'build:farm',     state.gold[myOwner] < farmCost.gold || state.wood[myOwner] < farmCost.wood);
    addButton(`${translateDisplayLabel(rc.towerLabel)} [G]\n[${towerCost.gold}g${towerCost.wood ? ` ${towerCost.wood}w` : ''}]`, 'build:tower', state.gold[myOwner] < towerCost.gold || state.wood[myOwner] < towerCost.wood || !hasBarracks);
    addButton(`${t('wall')} [W]\n[${wallCost.gold}g${wallCost.wood ? ` ${wallCost.wood}w` : ''}]`,  'build:wall',     state.gold[myOwner] < wallCost.gold || state.wood[myOwner] < wallCost.wood);
    if (state.gold[myOwner] >= wallCost.gold && state.wood[myOwner] >= wallCost.wood) {
      addButton(t('hold_line'), 'build:wall');
    }
  }

  // ── Stop (any player unit/building with an active command) ──────────────────
  if (e.cmd !== null) {
    addButton(t('stop'), 'stop');
  }

  // ── Demolish / Cancel construction ─────────────────────────────────────────
  if (!isNeutralOwner(e.owner) && e.kind !== 'goldmine' && getResolvedSpeed(e.kind, usesRaceProfile(e.owner) ? state.races[e.owner] : null) === 0) {
    const isConst  = e.kind === 'construction';
    const srcKind  = isConst ? (e.constructionOf ?? e.kind) : e.kind;
    const refundCost = getResolvedCost(srcKind, usesRaceProfile(e.owner) ? state.races[e.owner] : null);
    const refundGold = Math.floor(refundCost.gold * (isConst ? 1.0 : 0.8));
    const refundWood = Math.floor(refundCost.wood * (isConst ? 1.0 : 0.8));
    const refund = `${refundGold}g${refundWood ? ` ${refundWood}w` : ''}`;
    const btnLabel = isConst ? t('cancel', { amount: refund }) : t('demolish', { amount: refund });
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
  const stats = getResolvedTileSize(building);
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
  pulse = 0,
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
  if (enabled && pulse > 0) {
    ctx.strokeStyle = `rgba(255,245,170,${0.2 + pulse * 0.45})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
  }

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
