import { MENU_BREAKPOINTS, MENU_TOKENS } from './menu.tokens';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapGridLayout {
  cols: number;
  cardW: number;
  cardH: number;
  gapX: number;
  gapY: number;
  startX: number;
  firstRowY: number;
  thumbH: number;
  contentBottomY: number;
}

export interface RaceLayout {
  cols: number;
  cardW: number;
  cardH: number;
  gap: number;
  startX: number;
  cardY: number;
  rowGap: number;
}

export interface StickyMapHeaderLayout {
  pinnedTop: number;
  titleY: number;
  subtitleY: number;
  difficultyLabelY: number;
  diffButtonsY: number;
  headerBottomY: number;
}

function getMapCols(viewW: number): number {
  if (viewW >= MENU_BREAKPOINTS.mapCols3) return 3;
  if (viewW >= MENU_BREAKPOINTS.mapCols2) return 2;
  return 1;
}

export function getStickyMapHeaderLayout(viewH: number): StickyMapHeaderLayout {
  const top = MENU_TOKENS.layout.mapHeaderTopPad;
  return {
    pinnedTop: top,
    titleY: top + 26,
    subtitleY: top + 50,
    difficultyLabelY: top + 72,
    diffButtonsY: top + 82,
    headerBottomY: top + MENU_TOKENS.layout.mapHeaderPinnedH,
  };
}

export function getResponsiveMapGridLayout(viewW: number, viewH: number, mapCount: number, scrollY: number): MapGridLayout {
  const cols = Math.max(1, Math.min(3, getMapCols(viewW)));
  const gapX = MENU_TOKENS.layout.mapGridGapX;
  const gapY = MENU_TOKENS.layout.mapGridGapY;
  const sidePad = Math.max(24, Math.round(viewW * 0.05));
  const availableW = Math.max(220, viewW - sidePad * 2);
  const cardWFromCols = (availableW - (cols - 1) * gapX) / cols;
  const cardW = Math.max(MENU_TOKENS.layout.mapCardMinW, Math.min(MENU_TOKENS.layout.mapCardMaxW, Math.floor(cardWFromCols)));
  const gridW = cols * cardW + (cols - 1) * gapX;
  const startX = Math.floor((viewW - gridW) / 2);
  const cardH = MENU_TOKENS.layout.mapCardH;
  const thumbH = MENU_TOKENS.layout.mapThumbH;

  const header = getStickyMapHeaderLayout(viewH);
  const firstRowY = header.headerBottomY + MENU_TOKENS.spacing.sm + scrollY;

  const rows = Math.max(1, Math.ceil(mapCount / cols));
  const contentBottomY = firstRowY + (rows - 1) * (cardH + gapY) + cardH;

  return {
    cols,
    cardW,
    cardH,
    gapX,
    gapY,
    startX,
    firstRowY,
    thumbH,
    contentBottomY,
  };
}

export function getMapScrollRange(viewW: number, viewH: number, mapCount: number): { min: number; max: number } {
  const header = getStickyMapHeaderLayout(viewH);
  const layoutNoScroll = getResponsiveMapGridLayout(viewW, viewH, mapCount, 0);
  const contentTop = header.pinnedTop;
  const topMargin = 18;
  const bottomMargin = MENU_TOKENS.layout.mapContentBottomPad;
  const min = Math.min(0, viewH - bottomMargin - layoutNoScroll.contentBottomY);
  const max = Math.max(0, topMargin - contentTop);
  return { min, max };
}

export function clampMapScroll(v: number, range: { min: number; max: number }): number {
  return Math.max(range.min, Math.min(range.max, v));
}

export function getResponsiveRaceLayout(viewW: number, viewH: number): RaceLayout {
  const cols = viewW < MENU_BREAKPOINTS.raceStack ? 1 : 2;
  const gap = MENU_TOKENS.layout.raceGap;
  const cardH = MENU_TOKENS.layout.raceCardH;
  const sidePad = Math.max(20, Math.round(viewW * 0.05));
  const availableW = Math.max(260, viewW - sidePad * 2);
  const rowGap = 20;

  let cardW = cols === 1
    ? Math.min(MENU_TOKENS.layout.raceCardMaxW, Math.max(MENU_TOKENS.layout.raceCardMinW, availableW))
    : Math.floor((availableW - gap) / 2);

  cardW = Math.max(MENU_TOKENS.layout.raceCardMinW, Math.min(MENU_TOKENS.layout.raceCardMaxW, cardW));

  const rowW = cols * cardW + (cols - 1) * gap;
  const startX = Math.floor((viewW - rowW) / 2);

  const totalH = cols === 1 ? cardH * 2 + rowGap : cardH;
  const cardY = Math.floor((viewH - totalH) / 2) - 10;

  return {
    cols,
    cardW,
    cardH,
    gap,
    startX,
    cardY,
    rowGap,
  };
}
