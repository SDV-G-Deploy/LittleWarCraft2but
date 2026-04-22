export interface MenuTokens {
  colors: {
    bgTop: string;
    bgBot: string;
    gold: string;
    goldDim: string;
    text: string;
    textDim: string;
    panelBg: string;
    panelStroke: string;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  radius: {
    sm: number;
    md: number;
  };
  font: {
    title: string;
    subtitle: string;
    h1: string;
    h2: string;
    body: string;
    bodySm: string;
    button: string;
    buttonSm: string;
  };
  layout: {
    mapCardMinW: number;
    mapCardMaxW: number;
    mapCardH: number;
    mapThumbH: number;
    mapGridGapX: number;
    mapGridGapY: number;
    mapHeaderTopPad: number;
    mapHeaderPinnedH: number;
    mapContentBottomPad: number;
    raceCardH: number;
    raceGap: number;
    raceCardMinW: number;
    raceCardMaxW: number;
  };
}

export const MENU_BREAKPOINTS = {
  mapCols2: 860,
  mapCols3: 1280,
  raceStack: 920,
} as const;

export const MENU_TOKENS: MenuTokens = {
  colors: {
    bgTop: '#0a0c14',
    bgBot: '#12181f',
    gold: '#e8c84a',
    goldDim: '#a08830',
    text: '#f0ead8',
    textDim: '#6a7080',
    panelBg: 'rgba(255,255,255,0.04)',
    panelStroke: 'rgba(255,255,255,0.10)',
  },
  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 28,
  },
  radius: {
    sm: 4,
    md: 8,
  },
  font: {
    title: 'bold 56px serif',
    subtitle: '16px monospace',
    h1: 'bold 28px serif',
    h2: 'bold 22px serif',
    body: '13px monospace',
    bodySm: '11px monospace',
    button: 'bold 15px monospace',
    buttonSm: 'bold 12px monospace',
  },
  layout: {
    mapCardMinW: 220,
    mapCardMaxW: 300,
    mapCardH: 260,
    mapThumbH: 120,
    mapGridGapX: 18,
    mapGridGapY: 16,
    mapHeaderTopPad: 16,
    mapHeaderPinnedH: 120,
    mapContentBottomPad: 18,
    raceCardH: 280,
    raceGap: 40,
    raceCardMinW: 240,
    raceCardMaxW: 360,
  },
};
