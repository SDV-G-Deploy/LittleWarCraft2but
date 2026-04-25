import type { Entity, EntityKind, GameState, OpeningPlan } from '../types';
import type { SessionStats, SessionStatus } from '../net/session';
import { SIM_HZ, TILE_SIZE, MAP_H, MAP_W, getOpposingPlayer, isOwnedByOpposingPlayer, isUnitKind, isWorkerKind, isNeutralOwner, usesRaceProfile } from '../types';
import { STATS } from '../data/units';
import { ownerRace, ownerRaceProfile } from '../data/races';
import { resolveEntityStatsForEntity, resolveEntityStatsForOwner, getResolvedBuildTicks, getResolvedCost, getResolvedHpMax, getResolvedSpeed, getResolvedSupplyProvided, getResolvedTileSize, hasUpgradeGroup } from '../balance/resolver';
import type { UpgradeGroup } from '../balance/schema';
import { resolveAttackBonus } from '../balance/modifiers';
import { getOpeningPlanLockTicks, getOpeningPlanPresentation } from '../balance/openings';
import { DOCTRINE_COST } from '../balance/doctrines';
import type { Camera } from './camera';
import { isValidPlacement } from '../sim/economy';
import { t, getLanguage } from '../i18n';
import { UI_PANEL_HEIGHT, getDockLayout, type Rect } from './ui-layout';

// ─── Layout constants ──────────────────────────────────────────────────────────

const PANEL_H    = UI_PANEL_HEIGHT;
const PORTRAIT_W = 80;
const CMD_GRID_COLS = 3;
const CMD_GRID_ROWS = 2;
const OPENING_PLAN_LOCK_TICKS = getOpeningPlanLockTicks();
const PRODUCTION_SLOTS = 5;

interface CommandButtonSpec {
  slot: number;
  label: string;
  action: string;
  disabled?: boolean;
  danger?: boolean;
}

const UI_THEME = {
  dock: {
    bg: 'rgba(28,22,17,0.90)',
    topLine: 'rgba(208,170,118,0.34)',
    grain: 'rgba(255,240,220,0.04)',
  },
  pane: {
    bg: 'rgba(46,35,26,0.82)',
    stroke: 'rgba(190,153,108,0.44)',
    title: 'rgba(245,225,191,0.72)',
    titleShadow: 'rgba(0,0,0,0.4)',
  },
  card: {
    bg: 'rgba(66,50,37,0.62)',
    stroke: 'rgba(196,162,116,0.34)',
    title: 'rgba(235,214,184,0.72)',
  },
  text: {
    primary: '#f0e2c8',
    secondary: 'rgba(230,220,200,0.72)',
    tertiary: 'rgba(222,210,188,0.5)',
  },
  accent: {
    gold: '#f2d382',
    wood: '#9ecf82',
    good: '#9ddf9f',
    warn: '#f2be7d',
    danger: '#e89b9b',
    info: '#a8c7ea',
  },
  button: {
    enabled: 'rgba(60,90,54,0.95)',
    enabledStroke: 'rgba(130,188,116,0.9)',
    enabledText: '#e2f5d8',
    disabled: 'rgba(52,44,36,0.92)',
    disabledStroke: 'rgba(152,130,106,0.45)',
    disabledText: 'rgba(175,156,136,0.8)',
    danger: 'rgba(104,56,52,0.95)',
    dangerStroke: 'rgba(220,116,108,0.85)',
    dangerText: '#ffd3cc',
    sheen: 'rgba(255,248,232,0.07)',
  },
  minimap: {
    frameOuter: 'rgba(12,10,8,0.7)',
    frameInner: 'rgba(84,66,49,0.9)',
    frameStroke: 'rgba(201,169,120,0.46)',
    frameInset: 'rgba(26,19,14,0.8)',
  },
} as const;

function drawHudChip(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string, value: string, accent: string, icon: 'gold' | 'wood' | 'supply'): void {
  ctx.fillStyle = 'rgba(50,38,28,0.92)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = UI_THEME.pane.stroke;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  const ix = x + 11;
  const iy = y + 11;
  if (icon === 'gold') {
    ctx.fillStyle = '#7a6208';
    ctx.beginPath();
    ctx.arc(ix + 8, iy + 8, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd85a';
    ctx.beginPath();
    ctx.arc(ix + 6, iy + 6, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (icon === 'wood') {
    ctx.fillStyle = '#6a3c14';
    ctx.fillRect(ix + 2, iy + 1, 10, 14);
    ctx.fillStyle = '#9a5a28';
    ctx.fillRect(ix, iy + 3, 10, 14);
    ctx.fillStyle = '#c58a52';
    ctx.fillRect(ix + 3, iy + 5, 2, 10);
    ctx.fillRect(ix + 7, iy + 5, 2, 10);
  } else {
    ctx.fillStyle = '#335533';
    ctx.fillRect(ix, iy + 5, 16, 10);
    ctx.fillStyle = '#88cc66';
    ctx.fillRect(ix + 2, iy + 7, 12, 6);
  }

  ctx.fillStyle = UI_THEME.text.secondary;
  ctx.font = 'bold 10px monospace';
  ctx.fillText(title, x + 34, y + 12);
  ctx.fillStyle = accent;
  ctx.font = 'bold 19px monospace';
  ctx.fillText(value, x + 34, y + 31);
}

function drawTopHud(ctx: CanvasRenderingContext2D, state: GameState, viewW: number, myOwner: 0 | 1): void {
  const gold = state.gold[myOwner];
  const wood = state.wood[myOwner];
  const pop = state.pop[myOwner];
  const popCap = state.popCap[myOwner];
  const popFull = pop >= popCap;
  const popNearFull = !popFull && popCap > 0 && popCap - pop <= 1;

  const topX = 8;
  const topY = 8;
  const gap = 6;
  const baseChipW = 118;
  const supplyChipW = 154;
  const warningW = 116;
  const chipH = 40;
  const showWarning = popFull || popNearFull;

  const totalW = baseChipW + gap + baseChipW + gap + supplyChipW + (showWarning ? gap + warningW : 0);
  const startX = Math.max(topX, Math.floor((viewW - totalW) / 2));

  let x = startX;
  drawHudChip(ctx, x, topY, baseChipW, chipH, 'GOLD', `${gold}`, UI_THEME.accent.gold, 'gold');
  x += baseChipW + gap;
  drawHudChip(ctx, x, topY, baseChipW, chipH, 'WOOD', `${wood}`, UI_THEME.accent.wood, 'wood');
  x += baseChipW + gap;
  drawHudChip(ctx, x, topY, supplyChipW, chipH, 'SUPPLY', `${pop}/${popCap}`, popFull ? UI_THEME.accent.danger : popNearFull ? UI_THEME.accent.warn : UI_THEME.accent.good, 'supply');
  x += supplyChipW + gap;

  if (showWarning) {
    ctx.fillStyle = popFull ? 'rgba(120,26,26,0.92)' : 'rgba(110,72,20,0.92)';
    ctx.fillRect(x, topY, warningW, chipH);
    ctx.strokeStyle = popFull ? 'rgba(255,120,120,0.5)' : 'rgba(255,210,120,0.4)';
    ctx.strokeRect(x + 0.5, topY + 0.5, warningW - 1, chipH - 1);
    ctx.fillStyle = popFull ? '#ff9c9c' : '#ffd18a';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(popFull ? t('food_full') : t('food_almost_full'), x + 12, topY + 24);
  }
}

function getMilitaryArmorBase(kind: EntityKind): number {
  return kind === 'footman' ? 4
    : kind === 'archer' ? 0
    : kind === 'knight' ? 6
    : kind === 'grunt' ? 4
    : kind === 'troll' ? 0
    : kind === 'ogreFighter' ? 4
    : 0;
}

function getPreviewOpposingTarget(state: GameState, entity: Entity): Entity {
  if (!usesRaceProfile(entity.owner)) return entity;
  return { ...entity, owner: getOpposingPlayer(entity.owner) };
}

function getUnitDisplayedAttack(state: GameState, e: Entity): number {
  const race = usesRaceProfile(e.owner) ? state.races[e.owner] : null;
  const base = resolveEntityStatsForEntity(state, e).damage;
  if (!hasUpgradeGroup(e.kind, race, 'melee')) return base;
  const bonus = resolveAttackBonus({ state, attacker: e, target: getPreviewOpposingTarget(state, e) });
  return base + bonus;
}

function getLumberMillUpgradeSummary(state: GameState, owner: 0 | 1): string[] {
  const profile = ownerRaceProfile(state.races, owner);
  const upgrades = state.upgrades[owner];
  const race = state.races[owner];
  const buildingHpNow = race === 'human'
    ? upgrades.buildingHpLevel * 20
    : upgrades.buildingHpLevel * 10;
  const doctrineLine = upgrades.doctrine
    ? `${t('doctrine_locked')}: ${upgrades.doctrine === 'fieldTempo' ? t('doctrine_field_tempo') : upgrades.doctrine === 'lineHold' ? t('doctrine_line_hold') : t('doctrine_long_reach')}`
    : `${t('doctrine_available')}: ${t('doctrine_pick_one')}`;
  return [
    `${t('upgrade_attack')}: +${profile.upgrades.meleeAttack.perLevel} ${t('upgrade_per_level')}, ${t('upgrade_level_word')} ${upgrades.meleeAttackLevel}/${profile.upgrades.meleeAttack.maxLevel}`,
    `${t('upgrade_defense')}: +${profile.upgrades.armor.perLevel} ${t('upgrade_per_level')}, ${t('upgrade_level_word')} ${upgrades.armorLevel}/${profile.upgrades.armor.maxLevel}`,
    `${t('upgrade_building_hp')}: +${profile.upgrades.buildingHp.perLevel}% ${t('upgrade_per_level')}, ${t('upgrade_level_word')} ${upgrades.buildingHpLevel}/${profile.upgrades.buildingHp.maxLevel} (${t('upgrade_now_bonus')} +${buildingHpNow}%)`,
    doctrineLine,
  ];
}

function getUpgradeableKindsForGroups(state: GameState, owner: 0 | 1, groups: readonly UpgradeGroup[]): EntityKind[] {
  const race = state.races[owner];
  return (Object.keys(STATS) as EntityKind[]).filter(kind => groups.every(group => hasUpgradeGroup(kind, race, group)));
}

function getEntityKindLabel(kind: EntityKind, race: 'human' | 'orc'): string {
  const display = ownerRaceProfile([race, race], 0).display;
  switch (kind) {
    case 'footman': return display.soldierLabel;
    case 'archer': return display.rangedLabel;
    case 'knight': return display.heavyLabel;
    case 'grunt': return display.soldierLabel;
    case 'troll': return display.rangedLabel;
    case 'ogreFighter': return display.heavyLabel;
    case 'townhall': return display.hallLabel;
    case 'barracks': return display.barrLabel;
    case 'lumbermill': return display.lumberMillLabel;
    case 'farm': return display.farmLabel;
    case 'tower': return display.towerLabel;
    case 'wall': return t('wall');
    default: return kind;
  }
}

function compactLabel(label: string): string {
  const lang = getLanguage();
  if (lang !== 'ru') return label;
  return label
    .replace('Футмен', 'Футм')
    .replace('Лучник', 'Лучн')
    .replace('Рыцарь', 'Рыц')
    .replace('Тролль', 'Трол');
}

function getUpgradeTargetHint(state: GameState, owner: 0 | 1, groups: readonly UpgradeGroup[]): string {
  const race = state.races[owner];
  const kinds = getUpgradeableKindsForGroups(state, owner, groups);
  if (groups.includes('building')) return t('upgrade_targets_buildings');
  return kinds.map(kind => getEntityKindLabel(kind, race)).join(', ');
}

function compactUpgradeTargetHint(state: GameState, owner: 0 | 1, groups: readonly UpgradeGroup[]): string {
  const race = state.races[owner];
  const kinds = getUpgradeableKindsForGroups(state, owner, groups);
  if (groups.includes('building')) return t('upgrade_targets_buildings');
  return kinds.map(kind => compactLabel(getEntityKindLabel(kind, race))).join(', ');
}

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
  const layout = getDockLayout(viewW, viewH);
  const panelY = layout.dock.y;
  const buttons: UiButton[] = [];

  // Panel background
  ctx.fillStyle = UI_THEME.dock.bg;
  ctx.fillRect(0, panelY, viewW, PANEL_H);
  ctx.fillStyle = UI_THEME.dock.grain;
  ctx.fillRect(0, panelY + 5, viewW, 2);
  ctx.strokeStyle = UI_THEME.dock.topLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, panelY);
  ctx.lineTo(viewW, panelY);
  ctx.stroke();

  drawTopHud(ctx, state, viewW, myOwner);
  if (onlineStatus) drawOnlineStrip(ctx, layout.centerPane, onlineStatus);
  drawOpeningChoiceOverlay(ctx, state, viewW, panelY, myOwner, buttons);
  drawOpeningChoiceConfirmation(ctx, state, viewW, myOwner, openingPlanFeedback);

  drawPane(ctx, layout.leftPane, 'SELECTION');
  drawPane(ctx, layout.centerPane, 'COMMAND');
  drawPane(ctx, layout.rightPane, 'MINIMAP');
  drawMinimapPaneFrame(ctx, layout.rightPane, layout.minimapRect);

  const sel = [...selectedIds]
    .map(id => state.entities.find(e => e.id === id))
    .filter((e): e is Entity => !!e);

  if (sel.length === 0) {
    drawEmptyPanel(ctx, panelY, viewW);
    return buttons;
  }

  if (sel.length === 1) {
    const e = sel[0];
    drawPortrait(ctx, e, layout.leftPane);
    drawEntityInfo(ctx, e, state, layout.leftPane, myOwner);
    drawCommandPane(ctx, e, state, layout.centerPane, buttons, myOwner);
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
  pane: Rect,
  onlineStatus: { status: SessionStatus; statusMsg: string; stats: SessionStats },
): void {
  const { status, stats } = onlineStatus;
  const likelyLocalStall = stats.localStallLikely && stats.waitingStallTicks > 0;
  const remoteWaitLikely =
    stats.waitingStallTicks >= 3
    && !likelyLocalStall
    && (stats.lastPacketAgeMs === null || stats.lastPacketAgeMs >= 120);
  const label =
    status === 'ready' && !remoteWaitLikely ? t('online_stable') :
    status === 'ready' ? t('online_waiting') :
    status === 'disconnected' ? t('online_disconnected') :
    status === 'error' ? t('online_error') :
    t('online_connecting');
  const detail =
    (status === 'error' || remoteWaitLikely)
      ? onlineStatus.statusMsg || stats.netDebugSummary || label
      : likelyLocalStall
        ? `local sim catch-up | ${stats.netDebugSummary}`
      : onlineStatus.stats.lastInboundSummary || stats.netDebugSummary || onlineStatus.statusMsg || label;
  const color =
    status === 'error' ? '#ff8888' :
    status === 'disconnected' ? '#ffb366' :
    remoteWaitLikely ? '#ffe97a' :
    '#88ffcc';

  const x = pane.x + Math.max(8, pane.w - 248);
  const y = pane.y + 6;

  ctx.fillStyle = 'rgba(30,23,17,0.7)';
  ctx.fillRect(x, y, 240, 32);
  ctx.strokeStyle = UI_THEME.card.stroke;
  ctx.strokeRect(x + 0.5, y + 0.5, 239, 31);
  ctx.fillStyle = color;
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 8, y + 10);

  ctx.fillStyle = UI_THEME.text.secondary;
  ctx.font = '10px monospace';
  ctx.fillText(detail.slice(0, 30), x + 8, y + 21);

  const ageText = stats.lastPacketAgeMs === null ? t('no_packets_yet') : t('ms_ago', { ms: Math.round(stats.lastPacketAgeMs) });
  ctx.fillStyle = UI_THEME.text.tertiary;
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(ageText, x + 232, y + 15);
  ctx.textAlign = 'left';
}

function drawPane(ctx: CanvasRenderingContext2D, rect: Rect, title: string): void {
  ctx.fillStyle = UI_THEME.pane.bg;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = UI_THEME.pane.stroke;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  ctx.fillStyle = UI_THEME.pane.titleShadow;
  ctx.font = 'bold 10px monospace';
  ctx.fillText(title, rect.x + 9, rect.y + 13);
  ctx.fillStyle = UI_THEME.pane.title;
  ctx.font = 'bold 10px monospace';
  ctx.fillText(title, rect.x + 8, rect.y + 12);
}

function drawMinimapPaneFrame(ctx: CanvasRenderingContext2D, pane: Rect, minimapRect: Rect): void {
  ctx.fillStyle = UI_THEME.minimap.frameOuter;
  ctx.fillRect(pane.x + 8, pane.y + 18, pane.w - 16, pane.h - 26);
  ctx.fillStyle = UI_THEME.minimap.frameInner;
  ctx.fillRect(minimapRect.x - 4, minimapRect.y - 4, minimapRect.w + 8, minimapRect.h + 8);
  ctx.strokeStyle = UI_THEME.minimap.frameStroke;
  ctx.lineWidth = 1;
  ctx.strokeRect(minimapRect.x - 3.5, minimapRect.y - 3.5, minimapRect.w + 7, minimapRect.h + 7);
  ctx.strokeStyle = UI_THEME.minimap.frameInset;
  ctx.strokeRect(minimapRect.x - 1.5, minimapRect.y - 1.5, minimapRect.w + 3, minimapRect.h + 3);

  const labelY = Math.min(pane.y + pane.h - 6, minimapRect.y + minimapRect.h + 12);
  ctx.fillStyle = UI_THEME.text.secondary;
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('MAP', minimapRect.x + minimapRect.w / 2, labelY);
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
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(t('select_a_unit'), viewW / 2, panelY + PANEL_H / 2 + 4);
  ctx.textAlign = 'left';
}

function drawPortrait(
  ctx: CanvasRenderingContext2D,
  e: Entity,
  pane: Rect,
): void {
  const px = pane.x + 8; const py = pane.y + 8;
  const pw = PORTRAIT_W - 16; const ph = PANEL_H - 16;
  const color = isNeutralOwner(e.owner) ? '#5a5248' : ['#4f6e96', '#965b52'][e.owner];
  ctx.fillStyle = 'rgba(20,16,12,0.7)';
  ctx.fillRect(px - 2, py - 2, pw + 4, ph + 4);
  ctx.fillStyle = color;
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = UI_THEME.card.stroke;
  ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);

  ctx.fillStyle = 'rgba(255,236,208,0.09)';
  ctx.fillRect(px + 6, py + 6, pw - 12, 18);

  ctx.fillStyle = isNeutralOwner(e.owner) ? '#bcbcbc' : ['#6ab0f5', '#f5786a'][e.owner];
  ctx.font = 'bold 26px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(e.kind[0].toUpperCase(), px + pw / 2, py + ph / 2 + 10);
  ctx.font = 'bold 10px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.fillText(isNeutralOwner(e.owner) ? 'NEUTRAL' : e.owner === 0 ? 'PLAYER' : 'ENEMY', px + pw / 2, py + 19);
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
    case 'Lumber Mill': return t('unit_lumber_mill');
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

function drawSectionCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string, tint: string = UI_THEME.card.bg): void {
  ctx.fillStyle = tint;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = UI_THEME.card.stroke;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = UI_THEME.card.title;
  ctx.font = 'bold 10px monospace';
  ctx.fillText(title, x + 8, y + 11);
}

function drawBadge(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, bg: string, fg = '#ffffff'): number {
  const w = Math.max(54, text.length * 7 + 12);
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, 16);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 15);
  ctx.fillStyle = fg;
  ctx.font = 'bold 10px monospace';
  ctx.fillText(text, x + 6, y + 11);
  return w;
}

function drawProductionPanel(
  ctx: CanvasRenderingContext2D,
  e: Entity,
  state: GameState,
  rect: Rect,
): void {
  if (!usesRaceProfile(e.owner)) return;
  const blockX = rect.x;
  const blockY = rect.y;
  const blockW = rect.w;
  const blockH = rect.h;
  const innerX = blockX + 8;
  const queueStartX = Math.max(blockX + Math.floor(blockW * 0.58), innerX + 120);
  const slotY = blockY + 17;

  drawSectionCard(ctx, blockX, blockY, blockW, blockH, t('production'), 'rgba(74,61,48,0.68)');

  ctx.fillStyle = UI_THEME.accent.info;
  ctx.font = 'bold 11px monospace';

  if (e.cmd?.type === 'train') {
    const trainBuildTicks = getResolvedBuildTicks(e.cmd.unit, usesRaceProfile(e.owner) ? state.races[e.owner] : null);
    const pct = Math.max(0, Math.min(100, Math.round(100 * (1 - e.cmd.ticksLeft / trainBuildTicks))));
    const currentLabel = formatQueueLabel(e.cmd.unit, e.owner, state);

    ctx.fillStyle = UI_THEME.text.primary;
    ctx.font = 'bold 13px monospace';
    ctx.fillText(currentLabel.toUpperCase(), innerX, blockY + 24);
    ctx.fillStyle = UI_THEME.text.secondary;
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`${pct}%`, blockX + 160, blockY + 24);

    drawProgressBar(ctx, innerX, blockY + 30, 170, UI_THEME.accent.info, pct);

    const visibleQueue = e.cmd.queue.slice(0, PRODUCTION_SLOTS);
    for (let i = 0; i < PRODUCTION_SLOTS; i++) {
      const sx = queueStartX + i * 19;
      const queued = visibleQueue[i];
      ctx.fillStyle = queued ? 'rgba(124,146,93,0.35)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(sx, slotY, 15, 15);
      ctx.strokeStyle = queued ? 'rgba(214,192,149,0.68)' : 'rgba(255,255,255,0.15)';
      ctx.strokeRect(sx + 0.5, slotY + 0.5, 14, 14);
      if (queued) {
        const label = formatQueueLabel(queued, e.owner, state);
        ctx.fillStyle = UI_THEME.text.primary;
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

  return;
}

function drawCommandPane(
  ctx: CanvasRenderingContext2D,
  e: Entity,
  state: GameState,
  pane: Rect,
  buttons: UiButton[],
  myOwner: 0 | 1,
): void {
  const productionH = 44;
  const productionRect: Rect = { x: pane.x + 8, y: pane.y + 20, w: pane.w - 16, h: productionH };
  const gridRect: Rect = { x: pane.x + 8, y: productionRect.y + productionH + 6, w: pane.w - 16, h: pane.h - productionH - 30 };

  if ((e.kind === 'townhall' || e.kind === 'barracks') && e.owner === myOwner) {
    drawProductionPanel(ctx, e, state, productionRect);
  } else {
    drawSectionCard(ctx, productionRect.x, productionRect.y, productionRect.w, productionRect.h, t('production'));
    ctx.fillStyle = UI_THEME.text.secondary;
    ctx.font = '11px monospace';
    ctx.fillText(t('no_unit_in_production'), productionRect.x + 8, productionRect.y + 24);
  }

  collectButtons(ctx, e, state, gridRect, buttons, myOwner);
}

function drawEntityInfo(
  ctx: CanvasRenderingContext2D,
  e: Entity,
  state: GameState,
  pane: Rect,
  myOwner: 0 | 1 = 0,
): void {
  const stats = resolveEntityStatsForEntity(state, e);
  const rc    = usesRaceProfile(e.owner) ? ownerRace(state.races, e.owner) : null;
  const x = pane.x + PORTRAIT_W + 12;
  const baseY = pane.y + 8;
  const infoW = pane.w - PORTRAIT_W - 20;
  const idRect: Rect = { x: x - 4, y: baseY, w: infoW, h: 32 };
  const coreRect: Rect = { x: x - 4, y: idRect.y + idRect.h + 4, w: infoW, h: 34 };
  const detailRect: Rect = { x: x - 4, y: coreRect.y + coreRect.h + 4, w: infoW, h: pane.h - (coreRect.y + coreRect.h + 4 - pane.y) - 8 };

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

  const LINE = 13;
  let y = detailRect.y + 20;

  drawSectionCard(ctx, idRect.x, idRect.y, idRect.w, idRect.h, 'IDENTITY');
  drawSectionCard(ctx, coreRect.x, coreRect.y, coreRect.w, coreRect.h, 'CORE STATE');
  drawSectionCard(ctx, detailRect.x, detailRect.y, detailRect.w, detailRect.h, 'DETAILS', 'rgba(62,48,35,0.54)');

  ctx.fillStyle = UI_THEME.text.primary;
  ctx.font = 'bold 15px monospace';
  ctx.fillText(displayName.toUpperCase(), x, idRect.y + 19);

  type BadgeInfo = { priority: number; text: string; bg: string; fg?: string };
  const badgeCandidates: BadgeInfo[] = [];
  if (typeof e.underAttackTick === 'number' && state.tick - e.underAttackTick <= SIM_HZ * 2) badgeCandidates.push({ priority: 1, text: 'UNDER ATTACK', bg: 'rgba(120,28,28,0.95)', fg: '#ffcccc' });
  if (e.cmd?.type === 'train' || e.cmd?.type === 'build') badgeCandidates.push({ priority: 2, text: 'PRODUCING', bg: 'rgba(42,73,118,0.95)', fg: '#d8ebff' });
  if (e.cmd?.type === 'gather' && e.cmd.phase === 'returning' && e.cmd.resourceType === 'wood') badgeCandidates.push({ priority: 3, text: 'RETURNING WOOD', bg: 'rgba(46,86,34,0.95)', fg: '#d6ffd0' });
  if (e.cmd?.type === 'gather' && e.cmd.phase === 'gathering' && e.cmd.resourceType === 'wood') badgeCandidates.push({ priority: 4, text: 'CHOPPING', bg: 'rgba(66,52,20,0.95)', fg: '#ffe0a8' });
  if (!e.cmd && stats && stats.speed > 0) badgeCandidates.push({ priority: 5, text: 'IDLE', bg: 'rgba(70,70,70,0.95)', fg: '#ededed' });
  badgeCandidates.sort((a, b) => a.priority - b.priority);
  let badgeX = x + Math.min(150, infoW - 114);
  badgeCandidates.slice(0, 2).forEach((badge) => {
    badgeX += drawBadge(ctx, badgeX, idRect.y + 8, badge.text, badge.bg, badge.fg) + 6;
  });

  ctx.fillStyle = UI_THEME.text.secondary;
  ctx.font = 'bold 12px monospace';
  ctx.fillText(`HP: ${e.hp} / ${getResolvedHpMax(e)}`, x, coreRect.y + 18);

  // ── Combat stats (mobile units only) ───────────────────────────────────────
  if (stats && stats.speed > 0) {
    const atkSpd = stats.attackTicks > 0
      ? (stats.attackTicks / 20).toFixed(1) + 's'
      : '—';
    const rngStr = stats.range > 1 ? `${stats.range}` : 'melee';
    const shownAtk = getUnitDisplayedAttack(state, e);
    const race = e.owner === 0 || e.owner === 1 ? state.races[e.owner] : null;
    const shownDef = hasUpgradeGroup(e.kind, race, 'military')
      ? (e.statArmor ?? stats.armor)
      : stats.armor;
    ctx.fillStyle = UI_THEME.accent.gold;
    ctx.font = '11px monospace';
    ctx.fillText(
      `ATK:${shownAtk}  DEF:${shownDef}  RNG:${rngStr}  SPD:${atkSpd}`,
      x, coreRect.y + 30,
    );

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
      ctx.fillStyle = UI_THEME.text.secondary;
      ctx.font = '11px monospace';
      ctx.fillText(roleLabel, x, y); y += LINE;
    }
  }
  if (stats && stats.speed === 0 && stats.range > 1) {
    const atkSpd = stats.attackTicks > 0
      ? (stats.attackTicks / 20).toFixed(1) + 's'
      : '—';
    ctx.fillStyle = UI_THEME.accent.gold;
    ctx.font = '11px monospace';
    ctx.fillText(
      `ATK:${stats.damage}  DEF:${stats.armor}  RNG:${stats.range}  SPD:${atkSpd}`,
      x, y,
    );
    y += LINE;
    ctx.fillStyle = UI_THEME.text.secondary;
    ctx.font = '11px monospace';
    ctx.fillText(t('role_static_defense'), x, y); y += LINE - 1;
  }

  // ── Gold mine reserve ───────────────────────────────────────────────────────
  if (e.kind === 'goldmine') {
    ctx.fillStyle = UI_THEME.accent.gold;
    ctx.font = '11px monospace';
    ctx.fillText(t('gold_remaining', { amount: e.goldReserve ?? 0 }), x, y); y += LINE;

    const myTownHall = state.entities.find(en => en.owner === myOwner && en.kind === 'townhall');
    const enemyTownHall = state.entities.find(en => isOwnedByOpposingPlayer(en, myOwner) && en.kind === 'townhall');
    const myDist = myTownHall ? Math.hypot(e.pos.x - myTownHall.pos.x, e.pos.y - myTownHall.pos.y) : Infinity;
    const enemyDist = enemyTownHall ? Math.hypot(e.pos.x - enemyTownHall.pos.x, e.pos.y - enemyTownHall.pos.y) : Infinity;
    const distanceGap = Math.abs(myDist - enemyDist);
    const nearCenter = e.pos.x > 16 && e.pos.x < 48;
    const isContested = nearCenter || distanceGap <= 8;
    const mineLabel = isContested ? t('mine_contested') : myDist < enemyDist
      ? t('mine_safer')
      : t('mine_outer');
    ctx.fillStyle = UI_THEME.text.secondary;
    ctx.font = '11px monospace';
    ctx.fillText(mineLabel, x, y); y += LINE - 1;

    const actionHint = isContested
      ? t('mine_hint_contested')
      : myDist < enemyDist
        ? t('mine_hint_safer')
        : t('mine_hint_outer');
    ctx.fillStyle = UI_THEME.text.tertiary;
    ctx.fillText(actionHint, x, y); y += LINE - 1;

    if (isContested && state.tick <= state.contestedMineBonusUntilTick) {
      const secondsLeft = Math.ceil((state.contestedMineBonusUntilTick - state.tick) / SIM_HZ);
      ctx.fillStyle = UI_THEME.accent.warn;
      ctx.fillText(t('clash_window', { seconds: secondsLeft }), x, y); y += LINE - 1;
    }
  }

  if (e.carryWood) {
    ctx.fillStyle = UI_THEME.accent.wood;
    ctx.font = 'bold 12px monospace';
    ctx.fillText(t('carrying_wood', { amount: e.carryWood }), x, y); y += LINE;
  }

  const centerX = Math.min(MAP_W - 1, Math.max(0, e.pos.x + Math.floor(e.tileW / 2)));
  const centerY = Math.min(MAP_H - 1, Math.max(0, e.pos.y + Math.floor(e.tileH / 2)));
  const centerTile = state.tiles[centerY]?.[centerX];
  if (centerTile?.watchPost && e.owner === myOwner && isUnitKind(e.kind)) {
    ctx.fillStyle = UI_THEME.accent.gold;
    ctx.font = '10px monospace';
    ctx.fillText(t('watch_post_1'), x, y); y += LINE - 1;
    ctx.fillStyle = UI_THEME.text.tertiary;
    ctx.fillText(t('watch_post_2'), x, y); y += LINE - 1;
  }

  // ── Food slots (farms / town halls) ────────────────────────────────────────
  if (e.kind === 'farm' || e.kind === 'townhall') {
    const supplyProvided = getResolvedSupplyProvided(e.kind, usesRaceProfile(e.owner) ? state.races[e.owner] : null);
    ctx.fillStyle = UI_THEME.accent.gold;
    ctx.font = 'bold 12px monospace';
    ctx.fillText(t('food_slots', { amount: supplyProvided }), x, y); y += LINE;
  }

  if (e.kind === 'lumbermill' && e.owner === myOwner) {
    ctx.fillStyle = UI_THEME.accent.wood;
    ctx.font = '11px monospace';
    for (const line of getLumberMillUpgradeSummary(state, myOwner)) {
      ctx.fillText(line, x, y); y += LINE - 1;
    }
  }

  // treasury + supply moved to top HUD

  // ── Carry gold (workers) ────────────────────────────────────────────────────
  if (e.carryGold) {
    ctx.fillStyle = UI_THEME.accent.gold;
    ctx.font = '11px monospace';
    ctx.fillText(t('carrying', { amount: e.carryGold }), x, y); y += LINE;
  }

  // ── Under attack clarity ───────────────────────────────────────────────────
  const isUnderAttackNow = typeof e.underAttackTick === 'number' && state.tick - e.underAttackTick <= SIM_HZ * 2;
  if (isUnderAttackNow) {
    ctx.fillStyle = UI_THEME.accent.danger;
    ctx.font = 'bold 10px monospace';
    if (isWorkerKind(e.kind)) {
      ctx.fillText(t('harassed'), x, y); y += LINE - 1;
    } else if (e.kind === 'construction') {
      ctx.fillText(t('build_under_pressure'), x, y); y += LINE - 1;
    }
  }

  // ── Opening branch framing (townhall / barracks, player-owned) ─────────────
  if ((e.kind === 'townhall' || e.kind === 'barracks') && e.owner === myOwner) {
    const selectedPlan = getSelectedOpeningPlan(state, myOwner);
    const openingSpent = state.openingCommitmentClaimed[myOwner];
    const canStillChoose = state.tick <= OPENING_PLAN_LOCK_TICKS;
    const openingCopy = selectedPlan ? openingPlanText(selectedPlan) : null;
    ctx.fillStyle = UI_THEME.accent.info;
    ctx.font = '10px monospace';
    ctx.fillText(t('opening_status', { title: openingCopy ? openingCopy.title : t('opening_not_selected') }), x, y); y += LINE - 1;
    ctx.fillStyle = UI_THEME.text.tertiary;
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
      ctx.fillStyle = UI_THEME.accent.warn;
      ctx.fillText(t('pressure_damage_window'), x, y); y += LINE - 1;
    }
  }

  // ── Rally point (townhall / barracks, player-owned) ────────────────────────
  if ((e.kind === 'townhall' || e.kind === 'barracks') && e.owner === myOwner) {
    ctx.font = '10px monospace';
    if (e.rallyPoint) {
      ctx.fillStyle = UI_THEME.accent.gold;
      ctx.fillText(t('rally_to', { x: e.rallyPoint.x, y: e.rallyPoint.y }), x, y); y += LINE - 1;
      const myTownHall = state.entities.find(en => en.owner === myOwner && en.kind === 'townhall');
      const enemyTownHall = state.entities.find(en => isOwnedByOpposingPlayer(en, myOwner) && en.kind === 'townhall');
      const myDist = myTownHall ? Math.hypot(e.rallyPoint.x - myTownHall.pos.x, e.rallyPoint.y - myTownHall.pos.y) : Infinity;
      const enemyDist = enemyTownHall ? Math.hypot(e.rallyPoint.x - enemyTownHall.pos.x, e.rallyPoint.y - enemyTownHall.pos.y) : Infinity;
      ctx.fillStyle = UI_THEME.text.secondary;
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
      ctx.fillStyle = UI_THEME.text.tertiary;
      ctx.fillText(t('rally_move'), x, y); y += LINE - 1;
    } else {
      ctx.fillStyle = UI_THEME.text.tertiary;
      ctx.fillText(t('rally_set'), x, y); y += LINE - 1;
      const selectedPlan = getSelectedOpeningPlan(state, myOwner);
      if (selectedPlan === 'eco') {
        ctx.fillStyle = UI_THEME.accent.wood;
        ctx.fillText(t('eco_fallback'), x, y); y += LINE - 1;
      }
      if (selectedPlan === 'tempo' && !state.openingCommitmentClaimed[myOwner]) {
        ctx.fillStyle = UI_THEME.accent.info;
        ctx.fillText(t('tempo_fallback'), x, y); y += LINE - 1;
      }
      if (selectedPlan === 'pressure' && !state.openingCommitmentClaimed[myOwner]) {
        ctx.fillStyle = UI_THEME.accent.warn;
        ctx.fillText(t('pressure_fallback'), x, y); y += LINE - 1;
        ctx.fillStyle = UI_THEME.text.tertiary;
        ctx.fillText(t('pressure_fallback_2'), x, y); y += LINE - 1;
      }
    }
  }

  // ── Training progress ───────────────────────────────────────────────────────
  // ── Build progress (shown on the worker) ───────────────────────────────────
  if (e.cmd?.type === 'build') {
    ctx.font = '11px monospace';
    if (e.cmd.phase === 'moving') {
      ctx.fillStyle = UI_THEME.accent.info;
      ctx.fillText(t('going_to_build', { building: e.cmd.building }), x, y); y += LINE;
    } else {
      ctx.fillStyle = UI_THEME.accent.good;
      ctx.fillText(t('building_click_site', { building: e.cmd.building }), x, y); y += LINE;
    }
  }

  // ── Construction site progress (shown on the scaffold entity) ──────────────
  if (e.kind === 'construction' && e.constructionOf) {
    const pct = Math.round(100 * e.hp / Math.max(1, e.hpMax));
    ctx.fillStyle = UI_THEME.accent.good;
    ctx.font = '11px monospace';
    ctx.fillText(t('built_pct', { building: e.constructionOf, pct }), x, y); y += LINE - 2;
    drawProgressBar(ctx, x, y, 150, '#44cc88', pct); y += 10;
    ctx.fillStyle = UI_THEME.text.tertiary;
    ctx.font = '10px monospace';
    ctx.fillText(t('continue_build'), x, y); y += LINE - 1;
  }

  // ── Gather status ───────────────────────────────────────────────────────────
  if (e.cmd?.type === 'gather') {
    ctx.fillStyle = UI_THEME.accent.gold;
    ctx.font = '11px monospace';
    const label =
      e.cmd.phase === 'gathering'  ? (e.cmd.resourceType === 'wood' ? t('chopping_wood') : t('mining')) :
      e.cmd.phase === 'returning'  ? (e.cmd.resourceType === 'wood' ? t('returning_wood') : t('returning_gold')) :
      t('walking_to_mine');
    ctx.fillText(label, x, y);
  }

  // ── Attack status ───────────────────────────────────────────────────────────
  if (e.cmd?.type === 'attack') {
    ctx.fillStyle = UI_THEME.accent.danger;
    ctx.font = '11px monospace';
    ctx.fillText(e.cmd.chasePath.length > 0 ? t('chasing') : t('attacking'), x, y);
  }

  // ── Move status ─────────────────────────────────────────────────────────────
  if (e.cmd?.type === 'move') {
    ctx.fillStyle = UI_THEME.accent.info;
    ctx.font = '11px monospace';
    ctx.fillText(t('moving'), x, y);
  }

  // ── Idle hint (player units only) ───────────────────────────────────────────
  if (e.owner === myOwner && !e.cmd && stats && stats.speed > 0) {
    ctx.fillStyle = UI_THEME.text.tertiary;
    ctx.font = '10px monospace';
    ctx.fillText(t('rmb_hint'), x, pane.y + pane.h - 8);
  }
}

function collectButtons(
  ctx: CanvasRenderingContext2D,
  e: Entity,
  state: GameState,
  gridRect: Rect,
  buttons: UiButton[],
  myOwner: 0 | 1 = 0,
): void {
  if (e.owner !== myOwner) return; // no buttons for enemy entities

  const rc        = ownerRace(state.races, myOwner); // player race config
  const specs: CommandButtonSpec[] = [];
  let nextSlot = 0;

  function addButton(label: string, action: string, disabled = false, danger = false, slot?: number): void {
    const gridCapacity = CMD_GRID_COLS * CMD_GRID_ROWS;
    const used = new Set(specs.map(spec => spec.slot));

    let targetSlot = typeof slot === 'number' ? slot : nextSlot;
    if (targetSlot < 0 || targetSlot >= gridCapacity || used.has(targetSlot)) {
      targetSlot = -1;
      for (let i = 0; i < gridCapacity; i++) {
        if (!used.has(i)) {
          targetSlot = i;
          break;
        }
      }
      if (targetSlot === -1) return;
    }

    nextSlot = Math.max(nextSlot, targetSlot + 1);
    specs.push({ slot: targetSlot, label, action, disabled, danger });
  }

  // ── Production buildings ────────────────────────────────────────────────────
  if (e.kind === 'townhall') {
    const workerCost = resolveEntityStatsForOwner(rc.worker, state.races, myOwner).cost;
    const barracksCost = getResolvedCost('barracks', state.races[myOwner]);
    const workerBusy = e.cmd?.type === 'train';
    const selectedPlan = getSelectedOpeningPlan(state, myOwner);
    addButton(`${translateDisplayLabel(rc.workerLabel)} [V]\n${workerCost.gold}g${workerCost.wood ? ` ${workerCost.wood}w` : ''}`, `train:${rc.worker}`,
      state.gold[myOwner] < workerCost.gold || state.wood[myOwner] < workerCost.wood, false, 0);
    if (!workerBusy && state.gold[myOwner] >= workerCost.gold && state.wood[myOwner] >= workerCost.wood) {
      addButton(t('worker_spike'), `train:${rc.worker}`, false, false, 3);
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

    addButton(`${translateDisplayLabel(rc.soldierLabel)} [T]\n${soldierCost.gold}g${soldierCost.wood ? ` ${soldierCost.wood}w` : ''}`, `train:${rc.soldier}`,
      state.gold[myOwner] < soldierCost.gold || state.wood[myOwner] < soldierCost.wood, false, 0);
    addButton(`${translateDisplayLabel(rc.rangedLabel)} [A]\n${rangedCost.gold}g${rangedCost.wood ? ` ${rangedCost.wood}w` : ''}`, 'train_ranged',
      state.gold[myOwner] < rangedCost.gold || state.wood[myOwner] < rangedCost.wood, false, 1);
    addButton(`${translateDisplayLabel(rc.heavyLabel)} [H]\n${heavyCost.gold}g${heavyCost.wood ? ` ${heavyCost.wood}w` : ''}`, `train:${rc.heavy}`,
      state.gold[myOwner] < heavyCost.gold || state.wood[myOwner] < heavyCost.wood, false, 2);
    if (state.gold[myOwner] >= soldierCost.gold && state.wood[myOwner] >= soldierCost.wood && wantsFrontline) {
      addButton(t('frontline_add'), `train:${rc.soldier}`, false, false, 3);
    }
    if (state.gold[myOwner] >= rangedCost.gold && state.wood[myOwner] >= rangedCost.wood && wantsRanged) {
      addButton(t('backline_add'), `train:${rc.ranged}`, false, false, 4);
    }
    if (state.gold[myOwner] >= heavyCost.gold && state.wood[myOwner] >= heavyCost.wood && wantsHeavy) {
      addButton(t('anchor_add'), `train:${rc.heavy}`, false, false, 5);
    }
  }

  // ── Worker build menu (workers + peons both show build buttons) ─────────────
  if (isWorkerKind(e.kind)) {
    const barrCost = getResolvedCost('barracks', state.races[myOwner]);
    const lumberCost = getResolvedCost('lumbermill', state.races[myOwner]);
    const farmCost = getResolvedCost('farm', state.races[myOwner]);
    const wallCost = getResolvedCost('wall', state.races[myOwner]);
    const towerCost = getResolvedCost('tower', state.races[myOwner]);
    const hasBarracks = state.entities.some(en => en.owner === myOwner && en.kind === 'barracks');
    const hasLumbermill = state.entities.some(en => en.owner === myOwner && en.kind === 'lumbermill');
    const barrLabel = translateDisplayLabel(rc.barrLabel);
    const farmLabel = translateDisplayLabel(rc.farmLabel);
    addButton(`${barrLabel} [B]\n${barrCost.gold}g${barrCost.wood ? ` ${barrCost.wood}w` : ''}`, 'build:barracks', state.gold[myOwner] < barrCost.gold || state.wood[myOwner] < barrCost.wood, false, 0);
    addButton(`${t('lumber_mill')} [L]\n${lumberCost.gold}g${lumberCost.wood ? ` ${lumberCost.wood}w` : ''}`, 'build:lumbermill', state.gold[myOwner] < lumberCost.gold || state.wood[myOwner] < lumberCost.wood || hasLumbermill, false, 1);
    addButton(`${farmLabel} [F]\n${farmCost.gold}g${farmCost.wood ? ` ${farmCost.wood}w` : ''}`, 'build:farm',     state.gold[myOwner] < farmCost.gold || state.wood[myOwner] < farmCost.wood, false, 2);
    addButton(`${translateDisplayLabel(rc.towerLabel)} [G]\n${towerCost.gold}g${towerCost.wood ? ` ${towerCost.wood}w` : ''}`, 'build:tower', state.gold[myOwner] < towerCost.gold || state.wood[myOwner] < towerCost.wood || !hasBarracks || !hasLumbermill, false, 3);
    addButton(`${t('wall')} [W]\n${wallCost.gold}g${wallCost.wood ? ` ${wallCost.wood}w` : ''}`,  'build:wall',     state.gold[myOwner] < wallCost.gold || state.wood[myOwner] < wallCost.wood, false, 4);
    if (e.cmd === null && state.gold[myOwner] >= wallCost.gold && state.wood[myOwner] >= wallCost.wood) {
      addButton(t('hold_line'), 'build:wall', false, false, 5);
    }
  }

  if (e.kind === 'lumbermill') {
    const upgrades = state.upgrades[myOwner];
    const lumberUpgradeBusy = upgrades.pendingLumberUpgrade !== null;
    const profile = ownerRaceProfile(state.races, myOwner);
    const race = state.races[myOwner];
    const melee = profile.upgrades.meleeAttack;
    const armor = profile.upgrades.armor;
    const buildingHp = profile.upgrades.buildingHp;
    addButton(`${t('upgrade_attack')} +${melee.perLevel} ${t('upgrade_level')} ${upgrades.meleeAttackLevel}/${melee.maxLevel}\n${compactUpgradeTargetHint(state, myOwner, melee.appliesTo)} ${melee.cost.wood}w`, 'upgrade:meleeAttack', lumberUpgradeBusy || upgrades.meleeAttackLevel >= melee.maxLevel || state.gold[myOwner] < melee.cost.gold || state.wood[myOwner] < melee.cost.wood, false, 0);
    addButton(`${t('upgrade_defense')} +${armor.perLevel} ${t('upgrade_level')} ${upgrades.armorLevel}/${armor.maxLevel}\n${compactUpgradeTargetHint(state, myOwner, armor.appliesTo)} ${armor.cost.wood}w`, 'upgrade:armor', lumberUpgradeBusy || upgrades.armorLevel >= armor.maxLevel || state.gold[myOwner] < armor.cost.gold || state.wood[myOwner] < armor.cost.wood, false, 1);
    addButton(`${t('upgrade_building_hp')} +${buildingHp.perLevel}% ${t('upgrade_level')} ${upgrades.buildingHpLevel}/${buildingHp.maxLevel}\n${compactUpgradeTargetHint(state, myOwner, buildingHp.appliesTo)} ${buildingHp.cost.wood}w`, 'upgrade:buildingHp', lumberUpgradeBusy || upgrades.buildingHpLevel >= buildingHp.maxLevel || state.gold[myOwner] < buildingHp.cost.gold || state.wood[myOwner] < buildingHp.cost.wood, false, 2);
    const doctrineLocked = upgrades.doctrine !== null;
    const doctrineUnaffordable = state.gold[myOwner] < DOCTRINE_COST.gold || state.wood[myOwner] < DOCTRINE_COST.wood;
    const doctrineCost = `${DOCTRINE_COST.gold}g ${DOCTRINE_COST.wood}w`;
    addButton(`${t('doctrine_field_tempo')}\n${t('doctrine_field_tempo_desc')} ${doctrineCost}`, 'upgrade:doctrineFieldTempo', lumberUpgradeBusy || doctrineLocked || doctrineUnaffordable, false, 3);
    addButton(`${t('doctrine_line_hold')}\n${t('doctrine_line_hold_desc')} ${doctrineCost}`, 'upgrade:doctrineLineHold', lumberUpgradeBusy || doctrineLocked || doctrineUnaffordable, false, 4);
    addButton(`${t('doctrine_long_reach')}\n${t('doctrine_long_reach_desc')} ${doctrineCost}`, 'upgrade:doctrineLongReach', lumberUpgradeBusy || doctrineLocked || doctrineUnaffordable, false, 5);
  }

  // ── Stop (any player unit/building with an active command) ──────────────────
  if (e.cmd !== null) {
    addButton(t('stop'), 'stop', false, false, 4);
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
    addButton(btnLabel, 'demolish', false, true, 5);
  }

  const gridCapacity = CMD_GRID_COLS * CMD_GRID_ROWS;
  const sorted = specs
    .filter(spec => spec.slot >= 0 && spec.slot < gridCapacity)
    .sort((a, b) => a.slot - b.slot);

  const gapX = 6;
  const gapY = 6;
  const cellW = Math.max(86, Math.floor((gridRect.w - gapX * (CMD_GRID_COLS - 1)) / CMD_GRID_COLS));
  const cellH = Math.max(24, Math.floor((gridRect.h - gapY * (CMD_GRID_ROWS - 1)) / CMD_GRID_ROWS));

  for (const spec of sorted) {
    const col = spec.slot % CMD_GRID_COLS;
    const row = Math.floor(spec.slot / CMD_GRID_COLS);
    const bx = gridRect.x + col * (cellW + gapX);
    const by = gridRect.y + row * (cellH + gapY);
    const enabled = !spec.disabled;
    drawButton(ctx, bx, by, cellW, cellH, spec.label, enabled, !!spec.danger);
    if (enabled) buttons.push({ x: bx, y: by, w: cellW, h: cellH, label: spec.label, action: spec.action });
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
    ctx.fillStyle = enabled ? UI_THEME.button.danger : UI_THEME.button.disabled;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = enabled ? UI_THEME.button.sheen : 'rgba(255,255,255,0.02)';
    ctx.fillRect(x + 2, y + 2, w - 4, 10);
    ctx.strokeStyle = enabled ? UI_THEME.button.dangerStroke : UI_THEME.button.disabledStroke;
  } else {
    ctx.fillStyle = enabled ? UI_THEME.button.enabled : UI_THEME.button.disabled;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = enabled ? UI_THEME.button.sheen : 'rgba(255,255,255,0.02)';
    ctx.fillRect(x + 2, y + 2, w - 4, 10);
    ctx.strokeStyle = enabled ? UI_THEME.button.enabledStroke : UI_THEME.button.disabledStroke;
  }
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (enabled && pulse > 0) {
    ctx.strokeStyle = `rgba(255,245,170,${0.2 + pulse * 0.45})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
  }

  ctx.fillStyle = enabled
    ? (danger ? UI_THEME.button.dangerText : UI_THEME.button.enabledText)
    : UI_THEME.button.disabledText;
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  const lines = label.split('\n');
  const lineH = 13;
  const startY = y + h / 2 - (lines.length - 1) * lineH / 2;
  lines.forEach((line, i) => ctx.fillText(line, x + w / 2, startY + i * lineH));
  ctx.textAlign = 'left';
}
