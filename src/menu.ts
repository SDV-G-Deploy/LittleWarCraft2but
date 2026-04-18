/**
 * menu.ts
 * Full-canvas main menu with title → race select → map select flow.
 * Calls back into the game with the chosen GameOptions.
 */

import type { Race, MapId, Tile } from './types';
import type { GameOptions } from './game';
import { RACES } from './data/races';
import { buildMap01 } from './data/maps/map01';
import { buildMap02 } from './data/maps/map02';
import { createSession } from './net/session';
import type { NetSession } from './net/session';

// ─── State machine ────────────────────────────────────────────────────────────

type MenuScreen = 'title' | 'howtoplay' | 'race' | 'map' | 'online';

interface MenuState {
  screen:      MenuScreen;
  playerRace:  Race;
  mapId:       MapId;
  // Online lobby
  netRole?:    'host' | 'guest';
  netSession?: NetSession;
  joinCode:    string;      // text being typed in the join field
  guestRace:   Race;        // race the joining player picks
}

// ─── Colours ──────────────────────────────────────────────────────────────────

const BG_TOP    = '#0a0c14';
const BG_BOT    = '#12181f';
const GOLD      = '#e8c84a';
const GOLD_DIM  = '#a08830';
const WHITE     = '#f0ead8';
const GREY      = '#6a7080';
const PANEL_BG  = 'rgba(255,255,255,0.04)';
const PANEL_BD  = 'rgba(255,255,255,0.10)';

// ─── Button type ──────────────────────────────────────────────────────────────

interface MenuButton {
  x: number; y: number; w: number; h: number;
  label: string;
  action: string;
  accent?: string;
}

// ─── Map thumbnail cache ──────────────────────────────────────────────────────

let thumbnailCache: Map<MapId, HTMLCanvasElement> | null = null;

function getThumbnail(mapId: MapId): HTMLCanvasElement {
  if (!thumbnailCache) thumbnailCache = new Map();
  if (thumbnailCache.has(mapId)) return thumbnailCache.get(mapId)!;

  const mapData = mapId === 2 ? buildMap02() : buildMap01();
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
    playerRace: 'human',
    mapId:      1,
    joinCode:   '',
    guestRace:  'orc',
  };

  // ── Auto-fill join code from URL param (?room=CODE) ─────────────────────
  // Pre-fill the room code but don't auto-connect — guest picks their own
  // race first, then clicks JOIN.
  const urlParams = new URLSearchParams(window.location.search);
  const urlRoom   = urlParams.get('room');
  if (urlRoom) {
    ms.screen   = 'online';
    ms.joinCode = urlRoom;
  }

  let buttons: MenuButton[] = [];
  let running = true;

  // ── Resize ─────────────────────────────────────────────────────────────────
  function resize(): void {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
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
  function handleAction(action: string): void {
    switch (action) {
      case 'new_game':    ms.screen = 'race';     break;
      case 'online':      ms.screen = 'online';   break;
      case 'how_to_play': ms.screen = 'howtoplay';break;
      case 'back_title':  ms.screen = 'title'; ms.netSession?.destroy(); ms.netSession = undefined; break;
      case 'back_race':   ms.screen = 'race';     break;
      case 'race_human':  ms.playerRace = 'human'; ms.screen = 'map'; break;
      case 'race_orc':    ms.playerRace = 'orc';   ms.screen = 'map'; break;
      case 'map_1':       ms.mapId = 1; startGame(); break;
      case 'map_2':       ms.mapId = 2; startGame(); break;

      case 'host_game': {
        ms.netSession?.destroy();
        ms.netRole    = 'host';
        ms.netSession = createSession('host', undefined, { race: ms.playerRace, mapId: ms.mapId });
        // Host starts game after receiving guest's hello (which includes guest race)
        ms.netSession.onConfig = (cfg) => {
          ms.guestRace = cfg.guestRace;
          startOnlineGame();
        };
        break;
      }
      case 'join_game': {
        if (ms.joinCode.length < 4) break;
        ms.netSession?.destroy();
        ms.netRole    = 'guest';
        // Pass guest's chosen race so it's sent in the hello message
        ms.netSession = createSession('guest', ms.joinCode, undefined, ms.guestRace);
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
        } else if (action.startsWith('set_map_')) {
          ms.mapId = parseInt(action.slice(8)) as MapId;
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
    } else if (e.key.length === 1 && ms.joinCode.length < 36) {
      ms.joinCode += e.key;
    } else if (e.key === 'Enter') {
      handleAction('join_game');
    }
  }
  window.addEventListener('keydown', onKeyDown);
  const origRemove = () => {
    canvas.removeEventListener('click', onClick);
    canvas.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', onKeyDown);
  };

  function startGame(): void {
    running = false;
    origRemove();
    onStart({ playerRace: ms.playerRace, mapId: ms.mapId });
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
    ctx.font = 'bold 56px serif';
    ctx.fillText('Little Warcraft', cx + 3, y + 3);

    // Gold gradient fill
    const tg = ctx.createLinearGradient(0, y - 50, 0, y + 10);
    tg.addColorStop(0, '#fff4aa');
    tg.addColorStop(0.5, GOLD);
    tg.addColorStop(1, GOLD_DIM);
    ctx.fillStyle = tg;
    ctx.fillText('Little Warcraft', cx, y);

    ctx.fillStyle = GREY;
    ctx.font = '16px monospace';
    ctx.fillText('A tiny Warcraft II tribute', cx, y + 28);
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
    ctx.font = `bold 15px monospace`;
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

  function isHovered(btn: MenuButton): boolean {
    return mouseX >= btn.x && mouseX <= btn.x + btn.w &&
           mouseY >= btn.y && mouseY <= btn.y + btn.h;
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
      { x: cx - 100, y: cy - 20,  w: 200, h: 44, label: '⚔  NEW GAME',    action: 'new_game',    accent: GOLD },
      { x: cx - 100, y: cy + 36,  w: 200, h: 38, label: '🌐  ONLINE 1v1',  action: 'online',      accent: '#44ddaa' },
      { x: cx - 100, y: cy + 86,  w: 200, h: 34, label: '?  HOW TO PLAY', action: 'how_to_play', accent: '#88bbff' },
    ];

    buttons = btns;
    for (const b of btns) drawButton(b, isHovered(b));

    ctx.textAlign = 'center';
    ctx.fillStyle = '#444a5a';
    ctx.font = '12px monospace';
    ctx.fillText('Arrow keys / WASD to scroll · Click to select · Right-click to command', cx, canvas.height - 14);
  }

  // ─── Screen: How To Play ───────────────────────────────────────────────────
  function drawHowToPlay(): void {
    const cx = canvas.width / 2;
    const W  = Math.min(640, canvas.width - 40);
    const x0 = cx - W / 2;
    let   y  = canvas.height * 0.08;

    ctx.textAlign = 'center';
    ctx.fillStyle = GOLD;
    ctx.font      = 'bold 28px serif';
    ctx.fillText('How to Play', cx, y); y += 36;

    ctx.strokeStyle = GOLD_DIM;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + W, y); ctx.stroke();
    y += 18;

    const sections: Array<{ heading: string; lines: string[] }> = [
      {
        heading: 'Goal',
        lines: [
          'Destroy all enemy buildings to win. Lose your Town Hall and it\'s over.',
        ],
      },
      {
        heading: 'Economy',
        lines: [
          'Workers (Peasant / Peon) gather gold from mines.',
          'Build Farms to raise your population cap.',
          'Build a Barracks to train soldiers.',
        ],
      },
      {
        heading: 'Combat',
        lines: [
          'Right-click an enemy to attack.',
          'Hold A then right-click to issue an attack-move order.',
          'Ranged units (Archer / Troll) hang back and shoot from distance.',
        ],
      },
      {
        heading: 'Controls',
        lines: [
          'Arrow keys or edge-scroll  — pan camera',
          'Left-click / drag          — select units',
          'Right-click                — move / attack / gather',
          'V  — train worker (Town Hall selected)',
          'T / A  — train soldier / ranged (Barracks selected)',
          'B / F / W  — build Barracks / Farm / Wall (Worker selected)',
          '1–9  — control groups   (Ctrl+# to assign, # to recall)',
          'S  — stop selected units',
          'R  — return to menu (after game ends)',
        ],
      },
      {
        heading: 'Rally Points',
        lines: [
          'Right-click empty ground with a building selected to set a rally point.',
          'Newly trained units will automatically march there.',
        ],
      },
    ];

    for (const sec of sections) {
      ctx.textAlign = 'left';
      ctx.fillStyle = GOLD;
      ctx.font      = 'bold 14px monospace';
      ctx.fillText(sec.heading.toUpperCase(), x0, y); y += 18;

      ctx.fillStyle = WHITE;
      ctx.font      = '13px monospace';
      for (const line of sec.lines) {
        ctx.fillText('  ' + line, x0, y); y += 17;
      }
      y += 8;
    }

    // Back button
    const backBtn: MenuButton = {
      x: cx - 80, y: Math.max(y + 10, canvas.height - 70),
      w: 160, h: 38, label: '← BACK', action: 'back_title',
    };
    buttons = [backBtn];
    drawButton(backBtn, isHovered(backBtn));
  }

  // ─── Screen: Race Select ───────────────────────────────────────────────────
  function drawRaceSelect(): void {
    const cx = canvas.width  / 2;
    const cy = canvas.height / 2;

    ctx.textAlign = 'center';
    ctx.fillStyle = GOLD;
    ctx.font      = 'bold 28px serif';
    ctx.fillText('Choose Your Race', cx, cy - 150);

    const cardW  = 240;
    const cardH  = 280;
    const gap    = 40;
    const leftX  = cx - gap / 2 - cardW;
    const rightX = cx + gap / 2;
    const cardY  = cy - 120;

    const races: Race[] = ['human', 'orc'];
    const actions       = ['race_human', 'race_orc'];
    const newBtns: MenuButton[] = [];

    for (let i = 0; i < 2; i++) {
      const rc     = RACES[races[i]];
      const cardX  = i === 0 ? leftX : rightX;
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
      ctx.fillText(rc.name, cardX + cardW / 2, cardY + 38);

      // Tagline
      ctx.fillStyle = GOLD_DIM;
      ctx.font      = 'italic 13px serif';
      ctx.fillText(`"${rc.tagline}"`, cardX + cardW / 2, cardY + 60);

      // Unit roster
      const units = [
        { label: rc.workerLabel,  desc: 'Builder & gatherer' },
        { label: rc.soldierLabel, desc: 'Melee warrior' },
        { label: rc.rangedLabel,  desc: 'Ranged attacker' },
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
      for (const line of rc.description.split('\n')) {
        ctx.fillText(line, cardX + cardW / 2, descY);
        descY += 15;
      }

      // Select button
      const selBtn: MenuButton = {
        x: cardX + 20, y: cardY + cardH - 48,
        w: cardW - 40, h: 34,
        label: `PLAY AS ${rc.name.toUpperCase()}`,
        action,
        accent,
      };
      newBtns.push(selBtn);
      drawButton(selBtn, isHovered(selBtn));
    }

    // Back button
    const backBtn: MenuButton = {
      x: 20, y: 20, w: 90, h: 32,
      label: '← BACK', action: 'back_title',
    };
    newBtns.push(backBtn);
    drawButton(backBtn, isHovered(backBtn));

    buttons = newBtns;
  }

  // ─── Screen: Map Select ────────────────────────────────────────────────────
  function drawMapSelect(): void {
    const cx = canvas.width  / 2;
    const cy = canvas.height / 2;
    const rc = RACES[ms.playerRace];

    ctx.textAlign = 'center';
    ctx.fillStyle = rc.accentColor;
    ctx.font      = `bold 13px monospace`;
    ctx.fillText(`Playing as: ${rc.name}  ·  "${rc.tagline}"`, cx, cy - 168);

    ctx.fillStyle = GOLD;
    ctx.font      = 'bold 28px serif';
    ctx.fillText('Choose a Map', cx, cy - 142);

    interface MapInfo {
      id:    MapId;
      name:  string;
      desc:  string[];
      action:string;
    }
    const maps: MapInfo[] = [
      {
        id:     1,
        name:   'Verdant Hills',
        desc:   [
          'Open field with scattered forest.',
          'Classic 1v1 layout.',
          'Good for beginners.',
        ],
        action: 'map_1',
      },
      {
        id:     2,
        name:   'River Crossing',
        desc:   [
          'A river splits the field in two.',
          'Two narrow fords to contest.',
          'Strategic chokepoints.',
        ],
        action: 'map_2',
      },
    ];

    const cardW = 240;
    const cardH = 300;
    const gap   = 40;
    const leftX  = cx - gap / 2 - cardW;
    const rightX = cx + gap / 2;
    const cardY  = cy - 100;
    const thumbH = 120;

    const newBtns: MenuButton[] = [];

    for (let i = 0; i < maps.length; i++) {
      const m      = maps[i];
      const cardX  = i === 0 ? leftX : rightX;
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
      const buildMap = i === 0 ? buildMap01() : buildMap02();
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
      ctx.fillText('● You', cardX + 8, cardY + thumbH + 20);
      ctx.fillStyle = '#cc4422';
      ctx.fillText('● Enemy', cardX + 60, cardY + thumbH + 20);

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
        label: `PLAY ${m.name.toUpperCase()}`,
        action: m.action,
        accent: GOLD,
      };
      newBtns.push(selBtn);
      drawButton(selBtn, isHovered(selBtn));
    }

    // Back button
    const backBtn: MenuButton = {
      x: 20, y: 20, w: 90, h: 32,
      label: '← BACK', action: 'back_race',
    };
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
    ctx.fillText('Online 1v1', cx, cy - 160);

    ctx.fillStyle = GREY;
    ctx.font      = '13px monospace';
    ctx.fillText('Host a game and share the link, or enter a code to join.', cx, cy - 130);

    // ── HOST panel ─────────────────────────────────────────────────────────────
    const hx = cx - 280; const hy = cy - 100; const hw = 240; const hh = 200;
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(hx, hy, hw, hh);
    ctx.strokeStyle = '#44ddaa';
    ctx.lineWidth   = 1;
    ctx.strokeRect(hx + 0.5, hy + 0.5, hw - 1, hh - 1);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#44ddaa';
    ctx.font      = 'bold 16px monospace';
    ctx.fillText('HOST A GAME', hx + hw / 2, hy + 26);

    ctx.fillStyle = GREY;
    ctx.font      = '11px monospace';
    ctx.fillText('Pick your race & map first.', hx + hw / 2, hy + 50);
    ctx.fillText('Then host — share the link.', hx + hw / 2, hy + 65);
    ctx.fillText('Opponent joins automatically.', hx + hw / 2, hy + 80);

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
    for (let i = 0; i < 2; i++) {
      const mapId = (i + 1) as MapId;
      const mapName = i === 0 ? 'Verdant Hills' : 'River Crossing';
      const bx  = hx + 10 + i * 112;
      const by  = hy + 132;
      const sel = ms.mapId === mapId;
      ctx.fillStyle = sel ? '#44446688' : 'rgba(0,0,0,0.2)';
      ctx.fillRect(bx, by, 102, 28);
      ctx.strokeStyle = sel ? GOLD : '#444';
      ctx.strokeRect(bx + 0.5, by + 0.5, 101, 27);
      ctx.fillStyle = sel ? GOLD : GREY;
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(mapName, bx + 51, by + 18);
      newBtns.push({ x: bx, y: by, w: 102, h: 28, label: mapName, action: `set_map_${mapId}` });
    }

    const hostBtn: MenuButton = { x: hx + 20, y: hy + hh - 44, w: hw - 40, h: 34, label: 'HOST GAME', action: 'host_game', accent: '#44ddaa' };
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
        const link   = `${origin}?room=${sess.code}`;
        ctx.fillStyle = WHITE;
        ctx.font      = '11px monospace';
        ctx.fillText('Share link:', hx + hw / 2, hy + hh + 36);
        ctx.fillStyle = '#aaddff';
        // Truncate for display
        const display = link.length > 50 ? link.slice(0, 47) + '…' : link;
        ctx.fillText(display, hx + hw / 2, hy + hh + 52);
        ctx.fillStyle = GREY;
        ctx.fillText('(click to copy)', hx + hw / 2, hy + hh + 68);

        // Invisible button for copy-to-clipboard
        newBtns.push({ x: hx, y: hy + hh + 24, w: hw, h: 50, label: '', action: `copy_link:${link}` });
      }
    }

    // ── JOIN panel ─────────────────────────────────────────────────────────────
    const jx = cx + 40; const jy = cy - 100; const jw = 240; const jh = 200;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(jx, jy, jw, jh);
    ctx.strokeStyle = '#88bbff';
    ctx.lineWidth   = 1;
    ctx.strokeRect(jx + 0.5, jy + 0.5, jw - 1, jh - 1);

    ctx.fillStyle = '#88bbff';
    ctx.font      = 'bold 16px monospace';
    ctx.fillText('JOIN A GAME', jx + jw / 2, jy + 26);

    ctx.fillStyle = GREY;
    ctx.font      = '11px monospace';
    ctx.fillText('Pick your race, enter room code,', jx + jw / 2, jy + 50);
    ctx.fillText('then click JOIN.', jx + jw / 2, jy + 65);

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
    ctx.fillText(ms.joinCode || 'type room code…', jx + jw / 2, codeY + 21);

    ctx.fillStyle = GREY;
    ctx.font      = '10px monospace';
    ctx.fillText('(keyboard — backspace to delete)', jx + jw / 2, jy + 152);

    const joinBtn: MenuButton = { x: jx + 20, y: jy + jh - 44, w: jw - 40, h: 34, label: 'JOIN GAME', action: 'join_game', accent: '#88bbff' };
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
    const backBtn: MenuButton = { x: 20, y: 20, w: 90, h: 32, label: '← BACK', action: 'back_title' };
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
      case 'online':   drawOnlineScreen(); break;
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
