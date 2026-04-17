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

// ─── State machine ────────────────────────────────────────────────────────────

type MenuScreen = 'title' | 'howtoplay' | 'race' | 'map';

interface MenuState {
  screen:      MenuScreen;
  playerRace:  Race;
  mapId:       MapId;
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
  };

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
      case 'new_game':   ms.screen = 'race';    break;
      case 'how_to_play':ms.screen = 'howtoplay';break;
      case 'back_title': ms.screen = 'title';   break;
      case 'back_race':  ms.screen = 'race';    break;
      case 'race_human': ms.playerRace = 'human'; ms.screen = 'map'; break;
      case 'race_orc':   ms.playerRace = 'orc';   ms.screen = 'map'; break;
      case 'map_1':      ms.mapId = 1; startGame(); break;
      case 'map_2':      ms.mapId = 2; startGame(); break;
    }
  }

  function startGame(): void {
    running = false;
    canvas.removeEventListener('click', onClick);
    window.removeEventListener('resize', resize);
    onStart({ playerRace: ms.playerRace, mapId: ms.mapId });
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
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouseX = e.clientX - r.left;
    mouseY = e.clientY - r.top;
  });

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
      { x: cx - 100, y: cy + 36,  w: 200, h: 38, label: '?  HOW TO PLAY', action: 'how_to_play', accent: '#88bbff' },
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

  // ─── Render loop ───────────────────────────────────────────────────────────
  function frame(): void {
    if (!running) return;

    drawBg();

    switch (ms.screen) {
      case 'title':    drawTitle_screen(); break;
      case 'howtoplay':drawHowToPlay();    break;
      case 'race':     drawRaceSelect();   break;
      case 'map':      drawMapSelect();    break;
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
