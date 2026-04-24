/**
 * menu.ts
 * Full-canvas main menu with title → race select → map select flow.
 * Calls back into the game with the chosen GameOptions.
 */

import type { Race, MapId, Tile, AIDifficulty, GameMode, SimulationSideConfig } from './types';
import type { GameOptions } from './game';
import { RACES } from './data/races';
import { MAP_CATALOG, buildMapById } from './data/maps';
import { createSession } from './net/session';
import type { NetSession, NetMode, TransportMode } from './net/session';
import { getLanguage, setLanguage, t, type Language } from './i18n';
import { MENU_TOKENS } from './menu.tokens';
import {
  clampMapScroll,
  getMapScrollRange,
  getResponsiveMapGridLayout,
  getResponsiveRaceLayout,
  getStickyMapHeaderLayout,
} from './menu.layout';

// ─── State machine ────────────────────────────────────────────────────────────

type MenuScreen = 'title' | 'howtoplay' | 'race' | 'map' | 'online' | 'simulation';

interface MenuState {
  screen:      MenuScreen;
  mode:        GameMode;
  playerRace:  Race;
  mapId:       MapId;
  aiDifficulty: AIDifficulty;
  simSides:    [SimulationSideConfig, SimulationSideConfig];
  language:    Language;
  // Online lobby
  netRole?:    'host' | 'guest';
  netSession?: NetSession;
  joinCode:    string;      // text being typed in the join field
  guestRace:   Race;        // race the joining player picks
  netMode:     NetMode;
  transportMode: TransportMode;
}

// ─── Colours ──────────────────────────────────────────────────────────────────

const BG_TOP = MENU_TOKENS.colors.bgTop;
const BG_BOT = MENU_TOKENS.colors.bgBot;
const GOLD = MENU_TOKENS.colors.gold;
const GOLD_DIM = MENU_TOKENS.colors.goldDim;
const WHITE = MENU_TOKENS.colors.text;
const GREY = MENU_TOKENS.colors.textDim;
const PANEL_BG = MENU_TOKENS.colors.panelBg;
const PANEL_BD = MENU_TOKENS.colors.panelStroke;

// ─── Button type ──────────────────────────────────────────────────────────────

interface MenuButton {
  x: number; y: number; w: number; h: number;
  label: string;
  action: string;
  accent?: string;
}

// ─── Map thumbnail cache ──────────────────────────────────────────────────────

let thumbnailCache: Map<MapId, HTMLCanvasElement> | null = null;

function translateUnitLabel(label: string): string {
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

function getThumbnail(mapId: MapId): HTMLCanvasElement {
  if (!thumbnailCache) thumbnailCache = new Map();
  if (thumbnailCache.has(mapId)) return thumbnailCache.get(mapId)!;

  const mapData = buildMapById(mapId);
  const W = mapData.tiles[0].length;
  const H = mapData.tiles.length;
  const off = document.createElement('canvas');
  off.width  = W;
  off.height = H;
  const ctx2 = off.getContext('2d')!;

  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      const tile: Tile = mapData.tiles[ty][tx];
      switch (tile.kind) {
        case 'grass':    ctx2.fillStyle = '#4a7a3a'; break;
        case 'tree':     ctx2.fillStyle = '#1a3a18'; break;
        case 'water':    ctx2.fillStyle = '#1a3a6a'; break;
        case 'goldmine': ctx2.fillStyle = '#c8a830'; break;
        default:         ctx2.fillStyle = '#4a7a3a';
      }
      ctx2.fillRect(tx, ty, 1, 1);
    }
  }

  // Mark player start (blue) and AI start (red)
  ctx2.fillStyle = '#4488ff';
  ctx2.fillRect(mapData.playerStart.x - 1, mapData.playerStart.y - 1, 3, 3);
  ctx2.fillStyle = '#cc4422';
  ctx2.fillRect(mapData.aiStart.x - 1, mapData.aiStart.y - 1, 3, 3);

  thumbnailCache.set(mapId, off);
  return off;
}

// ─── Entry ────────────────────────────────────────────────────────────────────

export function runMenu(
  canvas: HTMLCanvasElement,
  onStart: (options: GameOptions) => void,
): void {
  const ctx = canvas.getContext('2d')!;

  const ms: MenuState = {
    screen:     'title',
    mode:       'offline_skirmish',
    playerRace: 'human',
    mapId:      1,
    aiDifficulty: 'medium',
    simSides:   [
      { race: 'human', aiDifficulty: 'medium' },
      { race: 'orc', aiDifficulty: 'medium' },
    ],
    language:   getLanguage(),
    joinCode:   '',
    guestRace:  'orc',
    netMode:    'selfhost',
    transportMode: 'peerjs',
  };

  // ── Auto-fill join code from URL param (?room=CODE) ─────────────────────
  // Pre-fill the room code but don't auto-connect — guest picks their own
  // race first, then clicks JOIN.
  const urlParams = new URLSearchParams(window.location.search);
  const urlRoom   = urlParams.get('room');
  const urlMode   = urlParams.get('mode');
  const urlTransport = urlParams.get('transport');
  if (urlMode === 'public' || urlMode === 'selfhost') {
    ms.netMode = urlMode;
  }
  if (urlTransport === 'ws-relay' || urlTransport === 'peerjs' || urlTransport === 'mwc') {
    ms.transportMode = urlTransport;
  }
  if (urlRoom) {
    ms.screen   = 'online';
    ms.joinCode = urlRoom.trim();
  }

  let buttons: MenuButton[] = [];
  let running = true;
  let mapScrollY = 0;

  // ── Resize ─────────────────────────────────────────────────────────────────
  function resize(): void {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    mapScrollY = clampMapScroll(mapScrollY, getMapScrollRange(canvas.width, canvas.height, MAP_CATALOG.length));
  }
  resize();
  window.addEventListener('resize', resize);

  // ── Click handler ──────────────────────────────────────────────────────────
  function onClick(e: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    for (const btn of buttons) {
      if (mx >= btn.x && mx <= btn.x + btn.w &&
          my >= btn.y && my <= btn.y + btn.h) {
        handleAction(btn.action);
        return;
      }
    }
  }

  canvas.addEventListener('click', onClick);

  // ── Action handler ─────────────────────────────────────────────────────────
  async function handleAction(action: string): Promise<void> {
    switch (action) {
      case 'new_game':    ms.mode = 'offline_skirmish'; ms.screen = 'race';     break;
      case 'simulation':  ms.mode = 'offline_simulation'; ms.screen = 'simulation'; break;
      case 'online':      ms.screen = 'online';   break;
      case 'how_to_play': ms.screen = 'howtoplay';break;
      case 'back_title':  ms.screen = 'title'; ms.netSession?.destroy(); ms.netSession = undefined; break;
      case 'lang_en':     ms.language = 'en'; setLanguage('en'); break;
      case 'lang_ru':     ms.language = 'ru'; setLanguage('ru'); break;
      case 'back_race':   ms.screen = 'race';     break;
      case 'back_simulation': ms.screen = 'title'; break;
      case 'race_human':  ms.playerRace = 'human'; ms.screen = 'map'; break;
      case 'race_orc':    ms.playerRace = 'orc';   ms.screen = 'map'; break;
      case 'map_1':       ms.mapId = 1; startGame(); break;
      case 'map_2':       ms.mapId = 2; startGame(); break;
      case 'map_3':       ms.mapId = 3; startGame(); break;
      case 'map_4':       ms.mapId = 4; startGame(); break;
      case 'map_5':       ms.mapId = 5; startGame(); break;
      case 'map_6':       ms.mapId = 6; startGame(); break;
      case 'start_simulation': startSimulationGame(); break;

      case 'host_game': {
        ms.netSession?.destroy();
        ms.netRole    = 'host';
        ms.netSession = await createSession('host', undefined, { race: ms.playerRace, mapId: ms.mapId }, undefined, ms.netMode, ms.transportMode);
        // Host starts game after receiving guest's hello (which includes guest race)
        ms.netSession.onConfig = (cfg) => {
          ms.guestRace = cfg.guestRace;
          startOnlineGame();
        };
        break;
      }
      case 'join_game': {
        const normalizedJoinCode = ms.joinCode.trim();
        ms.joinCode = normalizedJoinCode;
        if (normalizedJoinCode.length < 4) break;
        ms.netSession?.destroy();
        ms.netRole    = 'guest';
        // Pass guest's chosen race so it's sent in the hello message
        ms.netSession = await createSession('guest', normalizedJoinCode, undefined, ms.guestRace, ms.netMode, ms.transportMode);
        // Guest starts game after receiving full config from host
        ms.netSession.onConfig = (cfg) => {
          ms.playerRace = cfg.race;
          ms.guestRace  = cfg.guestRace;
          ms.mapId      = cfg.mapId;
          startOnlineGame();
        };
        break;
      }
      default: {
        if (action.startsWith('set_race_')) {
          ms.playerRace = action.slice(9) as Race;
        } else if (action.startsWith('set_join_race_')) {
          ms.guestRace = action.slice(14) as Race;
        } else if (action.startsWith('set_sim_a_race_')) {
          ms.simSides[0].race = action.slice(15) as Race;
        } else if (action.startsWith('set_sim_b_race_')) {
          ms.simSides[1].race = action.slice(15) as Race;
        } else if (action.startsWith('set_sim_a_ai_')) {
          ms.simSides[0].aiDifficulty = action.slice(13) as AIDifficulty;
        } else if (action.startsWith('set_sim_b_ai_')) {
          ms.simSides[1].aiDifficulty = action.slice(13) as AIDifficulty;
        } else if (action.startsWith('set_map_')) {
          ms.mapId = parseInt(action.slice(8)) as MapId;
        } else if (action.startsWith('set_ai_')) {
          ms.aiDifficulty = action.slice(7) as AIDifficulty;
        } else if (action.startsWith('set_net_mode_')) {
          ms.netMode = action.slice(13) as NetMode;
          ms.netSession?.destroy();
          ms.netSession = undefined;
          ms.netRole = undefined;
        } else if (action.startsWith('set_transport_mode_')) {
          ms.transportMode = action.slice(19) as TransportMode;
          ms.netSession?.destroy();
          ms.netSession = undefined;
          ms.netRole = undefined;
        } else if (action.startsWith('copy_link:')) {
          navigator.clipboard?.writeText(action.slice(10)).catch(() => {});
        }
      }
    }
  }

  // ── Keyboard for join-code input ────────────────────────────────────────────
  function onKeyDown(e: KeyboardEvent): void {
    if (ms.screen !== 'online') return;
    if (e.key === 'Backspace') {
      ms.joinCode = ms.joinCode.slice(0, -1);
    } else if (e.key === 'Enter') {
      handleAction('join_game');
    } else if (e.key.length === 1 && ms.joinCode.length < 36) {
      if (/\s/.test(e.key)) return;
      ms.joinCode += e.key;
    }
  }
  window.addEventListener('keydown', onKeyDown);
  const origRemove = () => {
    canvas.removeEventListener('click', onClick);
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('wheel', onWheel);
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', onKeyDown);
  };

  function startGame(): void {
    running = false;
    origRemove();
    onStart({ playerRace: ms.playerRace, mapId: ms.mapId, aiDifficulty: ms.aiDifficulty, mode: ms.mode });
  }

  function startSimulationGame(): void {
    running = false;
    origRemove();
    onStart({
      playerRace: ms.simSides[0].race,
      guestRace: ms.simSides[1].race,
      mapId: ms.mapId,
      mode: 'offline_simulation',
      simSides: [
        { race: ms.simSides[0].race, aiDifficulty: ms.simSides[0].aiDifficulty },
        { race: ms.simSides[1].race, aiDifficulty: ms.simSides[1].aiDifficulty },
      ],
    });
  }

  function startOnlineGame(): void {
    if (!ms.netSession) return;
    running = false;
    origRemove();
    const myOwner: 0 | 1 = ms.netRole === 'host' ? 0 : 1;
    onStart({
      playerRace: ms.playerRace,   // host's race → races[0]
      guestRace:  ms.guestRace,    // guest's race → races[1]
      mapId:      ms.mapId,
      net:        ms.netSession,
      myOwner,
    });
  }

  // ── Gradient background ────────────────────────────────────────────────────
  function drawBg(): void {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, BG_TOP);
    grad.addColorStop(1, BG_BOT);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // ── Decorative title text ──────────────────────────────────────────────────
  function drawTitle(y: number): void {
    const cx = canvas.width / 2;
    ctx.textAlign = 'center';

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.font = MENU_TOKENS.font.title;
    ctx.fillText(t('game_title'), cx + 3, y + 3);

    // Gold gradient fill
    const tg = ctx.createLinearGradient(0, y - 50, 0, y + 10);
    tg.addColorStop(0, '#fff4aa');
    tg.addColorStop(0.5, GOLD);
    tg.addColorStop(1, GOLD_DIM);
    ctx.fillStyle = tg;
    ctx.fillText(t('game_title'), cx, y);

    ctx.fillStyle = GREY;
    ctx.font = MENU_TOKENS.font.subtitle;
    ctx.fillText(t('game_subtitle'), cx, y + 28);
  }

  // ── Generic button drawing ─────────────────────────────────────────────────
  function drawButton(btn: MenuButton, hovered: boolean): void {
    const accent = btn.accent ?? GOLD;
    const alpha  = hovered ? 0.18 : 0.06;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h);

    ctx.strokeStyle = hovered ? accent : PANEL_BD;
    ctx.lineWidth   = hovered ? 2 : 1;
    ctx.strokeRect(btn.x + 0.5, btn.y + 0.5, btn.w - 1, btn.h - 1);

    ctx.textAlign = 'center';
    ctx.fillStyle = hovered ? accent : WHITE;
    ctx.font = MENU_TOKENS.font.button;
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 5);
  }

  // ── Hover detection ────────────────────────────────────────────────────────
  let mouseX = 0;
  let mouseY = 0;
  const onMouseMove = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    mouseX = e.clientX - r.left;
    mouseY = e.clientY - r.top;
  };
  canvas.addEventListener('mousemove', onMouseMove);

  const onWheel = (e: WheelEvent) => {
    if (ms.screen !== 'map') return;
    const range = getMapScrollRange(canvas.width, canvas.height, MAP_CATALOG.length);
    if (range.min === range.max) return;
    mapScrollY = clampMapScroll(mapScrollY - e.deltaY, range);
    e.preventDefault();
  };
  canvas.addEventListener('wheel', onWheel, { passive: false });

  function isHovered(btn: MenuButton): boolean {
    return mouseX >= btn.x && mouseX <= btn.x + btn.w &&
           mouseY >= btn.y && mouseY <= btn.y + btn.h;
  }

  function drawLanguageToggle(newBtns: MenuButton[]): void {
    const items: Array<{ lang: Language; label: string; action: string }> = [
      { lang: 'en', label: t('lang_en'), action: 'lang_en' },
      { lang: 'ru', label: t('lang_ru'), action: 'lang_ru' },
    ];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const x = canvas.width - 126 + i * 54;
      const y = 18;
      const selected = ms.language === item.lang;
      ctx.fillStyle = selected ? 'rgba(232,200,74,0.18)' : 'rgba(255,255,255,0.04)';
      ctx.fillRect(x, y, 46, 28);
      ctx.strokeStyle = selected ? GOLD : PANEL_BD;
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, 45, 27);
      ctx.textAlign = 'center';
      ctx.fillStyle = selected ? GOLD : WHITE;
      ctx.font = MENU_TOKENS.font.buttonSm;
      ctx.fillText(item.label, x + 23, y + 18);
      newBtns.push({ x, y, w: 46, h: 28, label: item.label, action: item.action });
    }
  }

  // ─── Screen: Title ─────────────────────────────────────────────────────────
  function drawTitle_screen(): void {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    drawTitle(cy - 80);

    // Decorative divider
    ctx.strokeStyle = GOLD_DIM;
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(cx - 140, cy - 40);
    ctx.lineTo(cx + 140, cy - 40);
    ctx.stroke();
    ctx.setLineDash([]);

    const btns: MenuButton[] = [
      { x: cx - 100, y: cy - 28,  w: 200, h: 40, label: t('menu_new_game'),    action: 'new_game',    accent: GOLD },
      { x: cx - 100, y: cy + 22,  w: 200, h: 36, label: t('menu_simulation'),  action: 'simulation',  accent: '#d9b84a' },
      { x: cx - 100, y: cy + 68,  w: 200, h: 36, label: t('menu_online'),      action: 'online',      accent: '#44ddaa' },
      { x: cx - 100, y: cy + 114, w: 200, h: 32, label: t('menu_how_to_play'), action: 'how_to_play', accent: '#88bbff' },
    ];

    drawLanguageToggle(btns);
    buttons = btns;
    for (const b of btns) drawButton(b, isHovered(b));

    ctx.textAlign = 'center';
    ctx.fillStyle = '#444a5a';
    ctx.font = '12px monospace';
    ctx.fillText(t('menu_footer_hint'), cx, canvas.height - 14);
  }

  // ─── Screen: How To Play ───────────────────────────────────────────────────
  function drawHowToPlay(): void {
    const cx = canvas.width / 2;
    const W  = Math.min(640, canvas.width - 40);
    const x0 = cx - W / 2;
    const topPad = Math.max(24, Math.round(canvas.height * 0.06));
    let y = topPad;
    const compactHeader = canvas.height < 700;

    ctx.textAlign = 'center';
    ctx.fillStyle = GOLD;
    ctx.font      = compactHeader ? 'bold 24px serif' : 'bold 28px serif';
    ctx.fillText(t('how_to_play'), cx, y);
    y += compactHeader ? 30 : 36;

    ctx.strokeStyle = GOLD_DIM;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + W, y); ctx.stroke();
    y += compactHeader ? 14 : 18;

    const sections: Array<{ heading: string; lines: string[] }> = [
      { heading: t('how_goal'), lines: [t('how_goal_1')] },
      { heading: t('how_economy'), lines: [t('how_economy_1'), t('how_economy_2'), t('how_economy_3'), t('how_economy_4')] },
      { heading: t('how_pressure'), lines: [t('how_pressure_1'), t('how_pressure_2'), t('how_pressure_3'), t('how_pressure_4')] },
      { heading: t('how_combat'), lines: [t('how_combat_1'), t('how_combat_2'), t('how_combat_3')] },
      { heading: t('how_controls'), lines: [t('how_controls_1'), t('how_controls_2'), t('how_controls_3'), t('how_controls_4'), t('how_controls_5'), t('how_controls_6'), t('how_controls_7'), t('how_controls_8'), t('how_controls_9')] },
      { heading: t('how_openings'), lines: [t('how_openings_1'), t('how_openings_2'), t('how_openings_3'), t('how_openings_4')] },
      { heading: t('how_rally'), lines: [t('how_rally_1'), t('how_rally_2'), t('how_rally_3')] },
    ];

    const contentStartY = y;
    const rawContentHeight = sections.reduce((sum, sec) => sum + 18 + sec.lines.length * 17 + 8, 0);
    const backBtnH = 38;
    const minBackGap = 16;
    const availableContentBottom = canvas.height - backBtnH - minBackGap - 18;
    const availableContentHeight = Math.max(180, availableContentBottom - contentStartY);
    const contentScale = Math.max(0.72, Math.min(1, availableContentHeight / rawContentHeight));

    ctx.save();
    ctx.translate(x0, contentStartY);
    ctx.scale(contentScale, contentScale);

    let contentY = 0;
    for (const sec of sections) {
      ctx.textAlign = 'left';
      ctx.fillStyle = GOLD;
      ctx.font      = 'bold 14px monospace';
      ctx.fillText(sec.heading.toUpperCase(), 0, contentY); contentY += 18;

      ctx.fillStyle = WHITE;
      ctx.font      = '13px monospace';
      for (const line of sec.lines) {
        ctx.fillText('  ' + line, 0, contentY); contentY += 17;
      }
      contentY += 8;
    }
    ctx.restore();

    y = contentStartY + rawContentHeight * contentScale;

    // Back button
    const backBtn: MenuButton = {
      x: cx - 80, y: Math.max(y + 8, canvas.height - 62),
      w: 160, h: 38, label: t('back'), action: 'back_title',
    };
    buttons = [backBtn];
    drawButton(backBtn, isHovered(backBtn));
  }

  // ─── Screen: Race Select ───────────────────────────────────────────────────
  function drawRaceSelect(): void {
    const cx = canvas.width  / 2;
    const raceLayout = getResponsiveRaceLayout(canvas.width, canvas.height);

    ctx.textAlign = 'center';
    ctx.fillStyle = GOLD;
    ctx.font      = MENU_TOKENS.font.h1;
    ctx.fillText(t('choose_race'), cx, Math.max(80, raceLayout.cardY - 26));

    const cardW = raceLayout.cardW;
    const cardH = raceLayout.cardH;

    const races: Race[] = ['human', 'orc'];
    const actions       = ['race_human', 'race_orc'];
    const newBtns: MenuButton[] = [];

    for (let i = 0; i < 2; i++) {
      const rc     = RACES[races[i]];
      const raceName = races[i] === 'human' ? t('race_humans') : t('race_orcs');
      const cardX = raceLayout.cols === 1
        ? raceLayout.startX
        : raceLayout.startX + i * (cardW + raceLayout.gap);
      const cardY = raceLayout.cols === 1
        ? raceLayout.cardY + i * (cardH + raceLayout.rowGap)
        : raceLayout.cardY;
      const action = actions[i];
      const accent = rc.accentColor;

      // Card background
      const hov = mouseX >= cardX && mouseX <= cardX + cardW &&
                  mouseY >= cardY  && mouseY <= cardY + cardH;

      ctx.fillStyle = hov ? 'rgba(255,255,255,0.10)' : PANEL_BG;
      ctx.fillRect(cardX, cardY, cardW, cardH);
      ctx.strokeStyle = hov ? accent : PANEL_BD;
      ctx.lineWidth   = hov ? 2 : 1;
      ctx.strokeRect(cardX + 0.5, cardY + 0.5, cardW - 1, cardH - 1);

      // Accent stripe
      ctx.fillStyle = accent;
      ctx.fillRect(cardX, cardY, cardW, 4);

      // Race name
      ctx.textAlign = 'center';
      ctx.fillStyle = accent;
      ctx.font      = `bold 22px serif`;
      ctx.fillText(raceName, cardX + cardW / 2, cardY + 38);

      // Tagline
      ctx.fillStyle = GOLD_DIM;
      ctx.font      = 'italic 13px serif';
      ctx.fillText(`"${races[i] === 'human' ? t('tagline_humans') : t('tagline_orcs')}"`, cardX + cardW / 2, cardY + 60);

      // Unit roster
      const units = [
        { label: translateUnitLabel(rc.workerLabel),  desc: t('menu_unit_desc_worker') },
        { label: translateUnitLabel(rc.soldierLabel), desc: t('menu_unit_desc_frontline') },
        { label: translateUnitLabel(rc.rangedLabel),  desc: t('menu_unit_desc_backline') },
        { label: translateUnitLabel(rc.heavyLabel),   desc: t('menu_unit_desc_heavy') },
      ];
      let uy = cardY + 84;
      for (const u of units) {
        ctx.textAlign = 'left';
        ctx.fillStyle = WHITE;
        ctx.font      = 'bold 12px monospace';
        ctx.fillText('▸ ' + u.label, cardX + 14, uy);
        ctx.fillStyle = GREY;
        ctx.font      = '11px monospace';
        ctx.fillText(u.desc, cardX + 14, uy + 14);
        uy += 34;
      }

      // Description (multi-line, each line on its own row)
      let descY = cardY + 210;
      ctx.textAlign = 'center';
      ctx.fillStyle = GREY;
      ctx.font      = '11px monospace';
      const descriptionLines = races[i] === 'human'
        ? [t('race_desc_humans_1'), t('race_desc_humans_2')]
        : [t('race_desc_orcs_1'), t('race_desc_orcs_2')];
      for (const line of descriptionLines) {
        ctx.fillText(line, cardX + cardW / 2, descY);
        descY += 15;
      }

      // Select button
      const selBtn: MenuButton = {
        x: cardX + 20, y: cardY + cardH - 48,
        w: cardW - 40, h: 34,
        label: t('play_as', { name: raceName.toUpperCase() }),
        action,
        accent,
      };
      newBtns.push(selBtn);
      drawButton(selBtn, isHovered(selBtn));
    }

    // Back button
    const backBtn: MenuButton = {
      x: 20, y: 20, w: 90, h: 32,
      label: t('back'), action: 'back_title',
    };
    newBtns.push(backBtn);
    drawButton(backBtn, isHovered(backBtn));

    buttons = newBtns;
  }

  // ─── Screen: Map Select ────────────────────────────────────────────────────
  function drawMapSelect(): void {
    const scrollRange = getMapScrollRange(canvas.width, canvas.height, MAP_CATALOG.length);
    mapScrollY = clampMapScroll(mapScrollY, scrollRange);
    const cx = canvas.width  / 2;
    const rc = RACES[ms.playerRace];
    const header = getStickyMapHeaderLayout(canvas.height);
    const mapLayout = getResponsiveMapGridLayout(canvas.width, canvas.height, MAP_CATALOG.length, mapScrollY);
    const mapRaceName = ms.playerRace === 'human' ? t('race_humans') : t('race_orcs');
    const mapTagline = ms.playerRace === 'human' ? t('tagline_humans') : t('tagline_orcs');

    ctx.textAlign = 'center';
    ctx.fillStyle = rc.accentColor;
    ctx.font      = `bold 13px monospace`;
    ctx.fillText(t('playing_as', { name: mapRaceName, tagline: mapTagline }), cx, header.subtitleY);

    ctx.fillStyle = GOLD;
    ctx.font      = MENU_TOKENS.font.h1;
    ctx.fillText(t('choose_map'), cx, header.titleY);

    const newBtns: MenuButton[] = [];
    const difficultyDefs: Array<{ value: AIDifficulty; label: string; accent: string }> = [
      { value: 'easy', label: t('ai_easy'), accent: '#79d98a' },
      { value: 'medium', label: t('ai_medium'), accent: '#e8c84a' },
      { value: 'hard', label: t('ai_hard'), accent: '#ff8f66' },
    ];

    ctx.fillStyle = GREY;
    ctx.font = '11px monospace';
    ctx.fillText(t('choose_ai_difficulty'), cx, header.difficultyLabelY);

    const diffBtnY = header.diffButtonsY;
    const diffBtnW = 116;
    const diffGap = 12;
    const diffRowW = difficultyDefs.length * diffBtnW + (difficultyDefs.length - 1) * diffGap;
    const diffStartX = cx - Math.floor(diffRowW / 2);
    for (let i = 0; i < difficultyDefs.length; i++) {
      const def = difficultyDefs[i];
      const bx = diffStartX + i * (diffBtnW + diffGap);
      const by = diffBtnY;
      const selected = ms.aiDifficulty === def.value;
      ctx.fillStyle = selected ? `${def.accent}33` : 'rgba(255,255,255,0.04)';
      ctx.fillRect(bx, by, diffBtnW, 28);
      ctx.strokeStyle = selected ? def.accent : PANEL_BD;
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, diffBtnW - 1, 27);
      ctx.textAlign = 'center';
      ctx.fillStyle = selected ? def.accent : WHITE;
      ctx.font = 'bold 12px monospace';
      ctx.fillText(def.label, bx + diffBtnW / 2, by + 18);
      newBtns.push({ x: bx, y: by, w: diffBtnW, h: 28, label: def.label, action: `set_ai_${def.value}` });
    }

    const maps = MAP_CATALOG.map((m) => ({ ...m, action: `map_${m.id}` }));

    const { cardW, cardH, cols, gapX, gapY, startX, firstRowY, thumbH } = mapLayout;

    for (let i = 0; i < maps.length; i++) {
      const m      = maps[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cardX  = startX + col * (cardW + gapX);
      const cardY  = firstRowY + row * (cardH + gapY);
      const hov    = mouseX >= cardX && mouseX <= cardX + cardW &&
                     mouseY >= cardY  && mouseY <= cardY + cardH;

      // Card
      ctx.fillStyle = hov ? 'rgba(255,255,255,0.10)' : PANEL_BG;
      ctx.fillRect(cardX, cardY, cardW, cardH);
      ctx.strokeStyle = hov ? GOLD : PANEL_BD;
      ctx.lineWidth   = hov ? 2 : 1;
      ctx.strokeRect(cardX + 0.5, cardY + 0.5, cardW - 1, cardH - 1);

      // Map thumbnail — scaled from 1px/tile canvas
      const thumb = getThumbnail(m.id);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(thumb, cardX + 8, cardY + 8, cardW - 16, thumbH);
      ctx.imageSmoothingEnabled = true;
      // Border around thumbnail
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth   = 1;
      ctx.strokeRect(cardX + 8, cardY + 8, cardW - 16, thumbH);

      // Legend dots on thumbnail
      const tw = thumb.width;
      const th = thumb.height;
      const buildMap = buildMapById(m.id);
      const pxP = cardX + 8 + (buildMap.playerStart.x / tw) * (cardW - 16);
      const pyP = cardY + 8 + (buildMap.playerStart.y / th) * thumbH;
      const pxA = cardX + 8 + (buildMap.aiStart.x / tw) * (cardW - 16);
      const pyA = cardY + 8 + (buildMap.aiStart.y / th) * thumbH;

      ctx.fillStyle = '#4488ff';
      ctx.beginPath(); ctx.arc(pxP, pyP, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#cc4422';
      ctx.beginPath(); ctx.arc(pxA, pyA, 4, 0, Math.PI * 2); ctx.fill();

      // Legend
      ctx.textAlign = 'left';
      ctx.font      = '10px monospace';
      ctx.fillStyle = '#4488ff';
      ctx.fillText(ms.mode === 'offline_simulation' ? t('sim_side_a_legend') : t('you'), cardX + 8, cardY + thumbH + 20);
      ctx.fillStyle = '#cc4422';
      ctx.fillText(ms.mode === 'offline_simulation' ? t('sim_side_b_legend') : t('enemy'), cardX + 60, cardY + thumbH + 20);

      // Map name
      ctx.textAlign = 'center';
      ctx.fillStyle = WHITE;
      ctx.font      = 'bold 14px monospace';
      ctx.fillText(m.name, cardX + cardW / 2, cardY + thumbH + 38);

      // Description lines
      ctx.fillStyle = GREY;
      ctx.font      = '11px monospace';
      let dy = cardY + thumbH + 55;
      for (const line of m.desc) {
        ctx.fillText(line, cardX + cardW / 2, dy);
        dy += 16;
      }

      // Select button
      const selBtn: MenuButton = {
        x: cardX + 20, y: cardY + cardH - 48,
        w: cardW - 40, h: 34,
        label: ms.mode === 'offline_simulation' ? t('play_map', { name: m.name.toUpperCase() }) : t('play_map', { name: m.name.toUpperCase() }),
        action: m.action,
        accent: GOLD,
      };
      newBtns.push(selBtn);
      drawButton(selBtn, isHovered(selBtn));
    }

    // Back button
    const backBtn: MenuButton = {
      x: 20, y: 20, w: 90, h: 32,
      label: t('back'), action: 'back_race',
    };
    newBtns.push(backBtn);
    drawButton(backBtn, isHovered(backBtn));

    if (scrollRange.min !== scrollRange.max) {
      ctx.textAlign = 'right';
      ctx.fillStyle = GREY;
      ctx.font = '10px monospace';
      ctx.fillText(t('menu_scroll_more'), canvas.width - 14, canvas.height - 14);
    }

    buttons = newBtns;
  }

  function drawSimulationScreen(): void {
    const cx = canvas.width / 2;
    const top = Math.max(48, Math.round(canvas.height * 0.08));
    const newBtns: MenuButton[] = [];

    ctx.textAlign = 'center';
    ctx.fillStyle = GOLD;
    ctx.font = 'bold 28px serif';
    ctx.fillText(t('menu_simulation'), cx, top);

    ctx.fillStyle = GREY;
    ctx.font = '12px monospace';
    ctx.fillText(t('sim_observer_mode'), cx, top + 26);

    const panelY = top + 52;
    const panelW = Math.min(320, Math.floor(canvas.width * 0.38));
    const panelH = 180;
    const gap = 24;
    const leftX = cx - panelW - gap / 2;
    const rightX = cx + gap / 2;

    const sidePanels: Array<{ x: number; title: string; sideIndex: 0 | 1; accent: string }> = [
      { x: leftX, title: t('sim_side_a'), sideIndex: 0, accent: '#4488ff' },
      { x: rightX, title: t('sim_side_b'), sideIndex: 1, accent: '#cc4422' },
    ];

    const difficultyDefs: Array<{ value: AIDifficulty; label: string; accent: string }> = [
      { value: 'easy', label: t('ai_easy'), accent: '#79d98a' },
      { value: 'medium', label: t('ai_medium'), accent: '#e8c84a' },
      { value: 'hard', label: t('ai_hard'), accent: '#ff8f66' },
    ];

    for (const panel of sidePanels) {
      const side = ms.simSides[panel.sideIndex];
      ctx.fillStyle = PANEL_BG;
      ctx.fillRect(panel.x, panelY, panelW, panelH);
      ctx.strokeStyle = panel.accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(panel.x + 0.5, panelY + 0.5, panelW - 1, panelH - 1);

      ctx.fillStyle = panel.accent;
      ctx.font = 'bold 16px monospace';
      ctx.fillText(panel.title, panel.x + panelW / 2, panelY + 24);

      ctx.fillStyle = GREY;
      ctx.font = '11px monospace';
      ctx.fillText(panel.sideIndex === 0 ? t('sim_side_a_race') : t('sim_side_b_race'), panel.x + panelW / 2, panelY + 48);

      const raceDefs: Race[] = ['human', 'orc'];
      for (let i = 0; i < raceDefs.length; i++) {
        const race = raceDefs[i];
        const rc = RACES[race];
        const bx = panel.x + 22 + i * 138;
        const by = panelY + 58;
        const sel = side.race === race;
        ctx.fillStyle = sel ? `${rc.accentColor}44` : 'rgba(0,0,0,0.2)';
        ctx.fillRect(bx, by, 116, 28);
        ctx.strokeStyle = sel ? rc.accentColor : '#444';
        ctx.strokeRect(bx + 0.5, by + 0.5, 115, 27);
        ctx.fillStyle = sel ? rc.accentColor : GREY;
        ctx.font = 'bold 12px monospace';
        ctx.fillText(race === 'human' ? t('race_humans') : t('race_orcs'), bx + 58, by + 18);
        newBtns.push({ x: bx, y: by, w: 116, h: 28, label: race, action: `${panel.sideIndex === 0 ? 'set_sim_a_race_' : 'set_sim_b_race_'}${race}` });
      }

      ctx.fillStyle = GREY;
      ctx.font = '11px monospace';
      ctx.fillText(panel.sideIndex === 0 ? t('sim_side_a_difficulty') : t('sim_side_b_difficulty'), panel.x + panelW / 2, panelY + 112);

      for (let i = 0; i < difficultyDefs.length; i++) {
        const def = difficultyDefs[i];
        const bx = panel.x + 14 + i * 98;
        const by = panelY + 122;
        const sel = side.aiDifficulty === def.value;
        ctx.fillStyle = sel ? `${def.accent}33` : 'rgba(0,0,0,0.2)';
        ctx.fillRect(bx, by, 88, 28);
        ctx.strokeStyle = sel ? def.accent : '#444';
        ctx.strokeRect(bx + 0.5, by + 0.5, 87, 27);
        ctx.fillStyle = sel ? def.accent : GREY;
        ctx.font = 'bold 11px monospace';
        ctx.fillText(def.label, bx + 44, by + 18);
        newBtns.push({ x: bx, y: by, w: 88, h: 28, label: def.label, action: `${panel.sideIndex === 0 ? 'set_sim_a_ai_' : 'set_sim_b_ai_'}${def.value}` });
      }
    }

    ctx.fillStyle = GOLD;
    ctx.font = 'bold 22px serif';
    ctx.fillText(t('choose_map'), cx, panelY + panelH + 34);

    const mapDefs = MAP_CATALOG;
    for (let i = 0; i < mapDefs.length; i++) {
      const map = mapDefs[i];
      const col = i % 3;
      const row = Math.floor(i / 3);
      const bx = cx - 120 + col * 84;
      const by = panelY + panelH + 48 + row * 34;
      const sel = ms.mapId === map.id;
      ctx.fillStyle = sel ? '#44446688' : 'rgba(0,0,0,0.2)';
      ctx.fillRect(bx, by, 72, 26);
      ctx.strokeStyle = sel ? GOLD : '#444';
      ctx.strokeRect(bx + 0.5, by + 0.5, 71, 25);
      ctx.fillStyle = sel ? GOLD : GREY;
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`${map.id}`, bx + 36, by + 17);
      newBtns.push({ x: bx, y: by, w: 72, h: 26, label: map.name, action: `set_map_${map.id}` });
    }

    const startBtn: MenuButton = {
      x: cx - 120,
      y: panelY + panelH + 128,
      w: 240,
      h: 38,
      label: t('menu_simulation'),
      action: 'start_simulation',
      accent: GOLD,
    };
    newBtns.push(startBtn);
    drawButton(startBtn, isHovered(startBtn));

    const backBtn: MenuButton = { x: 20, y: 20, w: 90, h: 32, label: t('back'), action: 'back_simulation' };
    newBtns.push(backBtn);
    drawButton(backBtn, isHovered(backBtn));

    buttons = newBtns;
  }

  // ─── Screen: Online Lobby ──────────────────────────────────────────────────
  function drawOnlineScreen(): void {
    const cx = canvas.width  / 2;
    const cy = canvas.height / 2;
    const newBtns: MenuButton[] = [];

    ctx.textAlign = 'center';
    ctx.fillStyle = '#44ddaa';
    ctx.font      = 'bold 28px serif';
    ctx.fillText(t('online_1v1'), cx, cy - 160);

    ctx.fillStyle = GREY;
    ctx.font      = '13px monospace';
    ctx.fillText(t('online_intro'), cx, cy - 130);

    ctx.font = '11px monospace';
    ctx.fillStyle = GREY;
    ctx.fillText(t('connection_mode'), cx, cy - 106);

    const modeY = cy - 92;
    const modeDefs: Array<{ mode: NetMode; label: string; accent: string }> = [
      { mode: 'selfhost', label: t('mode_server'), accent: '#44ddaa' },
      { mode: 'public', label: t('mode_direct'), accent: '#88bbff' },
    ];
    for (let i = 0; i < modeDefs.length; i++) {
      const def = modeDefs[i];
      const bx = cx - 110 + i * 120;
      const by = modeY;
      const sel = ms.netMode === def.mode;
      ctx.fillStyle = sel ? `${def.accent}44` : 'rgba(0,0,0,0.2)';
      ctx.fillRect(bx, by, 100, 28);
      ctx.strokeStyle = sel ? def.accent : '#444';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, 99, 27);
      ctx.fillStyle = sel ? def.accent : GREY;
      ctx.font = 'bold 12px monospace';
      ctx.fillText(def.label, bx + 50, by + 18);
      newBtns.push({ x: bx, y: by, w: 100, h: 28, label: def.label, action: `set_net_mode_${def.mode}` });
    }

    ctx.fillStyle = GREY;
    ctx.font = '11px monospace';
    ctx.fillText(t('transport_mode'), cx, cy - 66);

    const transportDefs: Array<{ mode: TransportMode; label: string; accent: string }> = [
      { mode: 'peerjs', label: t('transport_peerjs'), accent: '#88bbff' },
      { mode: 'ws-relay', label: t('transport_ws_relay'), accent: '#ffbb66' },
      { mode: 'mwc', label: t('transport_mwc'), accent: '#44ddaa' },
    ];
    for (let i = 0; i < transportDefs.length; i++) {
      const def = transportDefs[i];
      const bx = cx - 110 + i * 120;
      const by = cy - 52;
      const sel = ms.transportMode === def.mode;
      ctx.fillStyle = sel ? `${def.accent}44` : 'rgba(0,0,0,0.2)';
      ctx.fillRect(bx, by, 100, 28);
      ctx.strokeStyle = sel ? def.accent : '#444';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, 99, 27);
      ctx.fillStyle = sel ? def.accent : GREY;
      ctx.font = 'bold 12px monospace';
      ctx.fillText(def.label, bx + 50, by + 18);
      newBtns.push({ x: bx, y: by, w: 100, h: 28, label: def.label, action: `set_transport_mode_${def.mode}` });
    }

    ctx.fillStyle = GREY;
    ctx.font = '10px monospace';
    const modeHint = ms.transportMode === 'ws-relay'
      ? t('transport_hint_ws_relay')
      : ms.transportMode === 'mwc'
        ? t('transport_hint_mwc')
        : ms.netMode === 'selfhost'
          ? t('mode_hint_server')
          : t('mode_hint_direct');
    ctx.fillText(modeHint, cx, cy - 18);

    // ── HOST panel ─────────────────────────────────────────────────────────────
    const hx = cx - 280; const hy = cy - 20; const hw = 240; const hh = 236;
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(hx, hy, hw, hh);
    ctx.strokeStyle = '#44ddaa';
    ctx.lineWidth   = 1;
    ctx.strokeRect(hx + 0.5, hy + 0.5, hw - 1, hh - 1);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#44ddaa';
    ctx.font      = 'bold 16px monospace';
    ctx.fillText(t('host_a_game'), hx + hw / 2, hy + 26);

    ctx.fillStyle = GREY;
    ctx.font      = '11px monospace';
    ctx.fillText(t('host_line_1'), hx + hw / 2, hy + 50);
    ctx.fillText(t('host_line_2'), hx + hw / 2, hy + 65);
    ctx.fillText(t('host_line_3'), hx + hw / 2, hy + 80);

    // Race buttons inside host panel
    const races: Race[] = ['human', 'orc'];
    for (let i = 0; i < 2; i++) {
      const rc  = RACES[races[i]];
      const bx  = hx + 10 + i * 112;
      const by  = hy + 96;
      const sel = ms.playerRace === races[i];
      ctx.fillStyle = sel ? `${rc.accentColor}44` : 'rgba(0,0,0,0.2)';
      ctx.fillRect(bx, by, 102, 28);
      ctx.strokeStyle = sel ? rc.accentColor : '#444';
      ctx.strokeRect(bx + 0.5, by + 0.5, 101, 27);
      ctx.fillStyle = sel ? rc.accentColor : GREY;
      ctx.font = 'bold 12px monospace';
      ctx.fillText(rc.name, bx + 51, by + 18);
      newBtns.push({ x: bx, y: by, w: 102, h: 28, label: rc.name, action: `set_race_${races[i]}` });
    }

    // Map buttons inside host panel
    for (let i = 0; i < MAP_CATALOG.length; i++) {
      const map = MAP_CATALOG[i];
      const col = i % 3;
      const row = Math.floor(i / 3);
      const bx  = hx + 10 + col * 76;
      const by  = hy + 132 + row * 30;
      const sel = ms.mapId === map.id;
      ctx.fillStyle = sel ? '#44446688' : 'rgba(0,0,0,0.2)';
      ctx.fillRect(bx, by, 70, 24);
      ctx.strokeStyle = sel ? GOLD : '#444';
      ctx.strokeRect(bx + 0.5, by + 0.5, 69, 23);
      ctx.fillStyle = sel ? GOLD : GREY;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${map.id}`, bx + 35, by + 16);
      newBtns.push({ x: bx, y: by, w: 70, h: 24, label: map.name, action: `set_map_${map.id}` });
    }

    const hostBtn: MenuButton = { x: hx + 20, y: hy + hh - 40, w: hw - 40, h: 30, label: t('host_game'), action: 'host_game', accent: '#44ddaa' };
    newBtns.push(hostBtn);
    drawButton(hostBtn, isHovered(hostBtn));

    // ── If session is active, show status ─────────────────────────────────────
    if (ms.netSession && ms.netRole === 'host') {
      const sess = ms.netSession;
      ctx.textAlign = 'center';
      ctx.fillStyle = sess.status === 'waiting' ? '#44ddaa' : sess.status === 'error' ? '#ff6666' : '#88ccff';
      ctx.font      = 'bold 13px monospace';
      ctx.fillText(sess.statusMsg, hx + hw / 2, hy + hh + 18);

      if (sess.status === 'waiting') {
        // Build shareable URL — race/map are negotiated in-protocol now
        const origin = window.location.origin + window.location.pathname;
        const modeParam = ms.netMode === 'public' ? '&mode=public' : '';
        const transportParam = ms.transportMode === 'peerjs' ? '' : `&transport=${ms.transportMode}`;
        const link   = `${origin}?room=${sess.code}${modeParam}${transportParam}`;
        ctx.fillStyle = WHITE;
        ctx.font      = '11px monospace';
        ctx.fillText(t('share_link'), hx + hw / 2, hy + hh + 36);
        ctx.fillStyle = '#aaddff';
        // Truncate for display
        const display = link.length > 50 ? link.slice(0, 47) + '…' : link;
        ctx.fillText(display, hx + hw / 2, hy + hh + 52);
        ctx.fillStyle = GREY;
        ctx.fillText(t('click_to_copy'), hx + hw / 2, hy + hh + 68);

        // Invisible button for copy-to-clipboard
        newBtns.push({ x: hx, y: hy + hh + 24, w: hw, h: 50, label: '', action: `copy_link:${link}` });
      }
    }

    // ── JOIN panel ─────────────────────────────────────────────────────────────
    const jx = cx + 40; const jy = cy - 20; const jw = 240; const jh = 200;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(jx, jy, jw, jh);
    ctx.strokeStyle = '#88bbff';
    ctx.lineWidth   = 1;
    ctx.strokeRect(jx + 0.5, jy + 0.5, jw - 1, jh - 1);

    ctx.fillStyle = '#88bbff';
    ctx.font      = 'bold 16px monospace';
    ctx.fillText(t('join_a_game'), jx + jw / 2, jy + 26);

    ctx.fillStyle = GREY;
    ctx.font      = '11px monospace';
    ctx.fillText(t('join_line_1'), jx + jw / 2, jy + 50);
    ctx.fillText(t('join_line_2'), jx + jw / 2, jy + 65);

    // Race picker inside join panel
    const joinRaces: Race[] = ['human', 'orc'];
    for (let i = 0; i < 2; i++) {
      const rc  = RACES[joinRaces[i]];
      const bx  = jx + 10 + i * 112;
      const by  = jy + 76;
      const sel = ms.guestRace === joinRaces[i];
      ctx.fillStyle = sel ? `${rc.accentColor}44` : 'rgba(0,0,0,0.2)';
      ctx.fillRect(bx, by, 102, 26);
      ctx.strokeStyle = sel ? rc.accentColor : '#444';
      ctx.lineWidth   = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, 101, 25);
      ctx.fillStyle  = sel ? rc.accentColor : GREY;
      ctx.font       = 'bold 12px monospace';
      ctx.textAlign  = 'center';
      ctx.fillText(rc.name, bx + 51, by + 17);
      newBtns.push({ x: bx, y: by, w: 102, h: 26, label: rc.name, action: `set_join_race_${joinRaces[i]}` });
    }

    // Code input display
    const codeY = jy + 110;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(jx + 12, codeY, jw - 24, 32);
    ctx.strokeStyle = '#88bbff';
    ctx.strokeRect(jx + 12.5, codeY + 0.5, jw - 25, 31);
    ctx.fillStyle   = ms.joinCode ? WHITE : GREY;
    ctx.font        = 'bold 14px monospace';
    ctx.fillText(ms.joinCode || t('type_room_code'), jx + jw / 2, codeY + 21);

    ctx.fillStyle = GREY;
    ctx.font      = '10px monospace';
    ctx.fillText(t('keyboard_delete'), jx + jw / 2, jy + 152);

    const joinBtn: MenuButton = { x: jx + 20, y: jy + jh - 44, w: jw - 40, h: 34, label: t('join_game'), action: 'join_game', accent: '#88bbff' };
    newBtns.push(joinBtn);
    drawButton(joinBtn, isHovered(joinBtn));

    if (ms.netSession && ms.netRole === 'guest') {
      const sess = ms.netSession;
      ctx.textAlign = 'center';
      ctx.fillStyle = sess.status === 'error' ? '#ff6666' : '#88ccff';
      ctx.font      = 'bold 13px monospace';
      ctx.fillText(sess.statusMsg, jx + jw / 2, jy + jh + 18);
    }

    // ── Back button ────────────────────────────────────────────────────────────
    const backBtn: MenuButton = { x: 20, y: 20, w: 90, h: 32, label: t('back'), action: 'back_title' };
    newBtns.push(backBtn);
    drawButton(backBtn, isHovered(backBtn));

    buttons = newBtns;
  }

  // ─── Render loop ───────────────────────────────────────────────────────────
  function frame(): void {
    if (!running) return;

    drawBg();

    switch (ms.screen) {
      case 'title':    drawTitle_screen(); break;
      case 'howtoplay':drawHowToPlay();    break;
      case 'race':     drawRaceSelect();   break;
      case 'map':      drawMapSelect();    break;
      case 'simulation': drawSimulationScreen(); break;
      case 'online':   drawOnlineScreen(); break;
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
