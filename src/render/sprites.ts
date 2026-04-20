/**
 * sprites.ts
 * Pre-renders every game graphic to an offscreen HTMLCanvasElement at startup.
 * The renderer then blits these each frame with drawImage() — very fast.
 * Style: Warcraft II retro (earthy palette, chunky units, stone buildings).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpriteCache {
  // Terrain (one canvas per tile kind)
  grass:    HTMLCanvasElement;
  tree:     HTMLCanvasElement;
  water:    HTMLCanvasElement[];   // 4 animation frames
  rock:     HTMLCanvasElement;
  goldtile: HTMLCanvasElement;     // tile under the mine
  // Human units  [0]=player(blue) [1]=AI(red)
  worker:   [HTMLCanvasElement, HTMLCanvasElement];
  footman:  [HTMLCanvasElement, HTMLCanvasElement];
  archer:   [HTMLCanvasElement, HTMLCanvasElement];
  knight:   [HTMLCanvasElement, HTMLCanvasElement];
  // Orc units
  peon:     [HTMLCanvasElement, HTMLCanvasElement];
  grunt:    [HTMLCanvasElement, HTMLCanvasElement];
  troll:    [HTMLCanvasElement, HTMLCanvasElement];
  ogreFighter: [HTMLCanvasElement, HTMLCanvasElement];
  // Human buildings  [0]=player  [1]=AI
  townhall: [HTMLCanvasElement, HTMLCanvasElement];
  barracks: [HTMLCanvasElement, HTMLCanvasElement];
  lumbermill: [HTMLCanvasElement, HTMLCanvasElement];
  farm:     [HTMLCanvasElement, HTMLCanvasElement];
  wall:     [HTMLCanvasElement, HTMLCanvasElement];
  tower:    [HTMLCanvasElement, HTMLCanvasElement];
  // Orc buildings (same slot sizes as human counterparts)
  greathall: [HTMLCanvasElement, HTMLCanvasElement];
  warmill:   [HTMLCanvasElement, HTMLCanvasElement];
  pigsty:    [HTMLCanvasElement, HTMLCanvasElement];
  watchtower:[HTMLCanvasElement, HTMLCanvasElement];
  // Neutral
  barrier:  HTMLCanvasElement;
  goldmine: HTMLCanvasElement;
  // FX
  corpse:   HTMLCanvasElement;
}

// ─── Palette ─────────────────────────────────────────────────────────────────

const INK     = '#181412';          // dark outline (unused directly — kept for reference)
const SKIN    = '#d09060';
// Team colors: [player-blue, ai-red]
const TC_D  = ['#12246a', '#6a1212'] as const;
const TC_M  = ['#2848b8', '#b82828'] as const;
const TC_L  = ['#4878f0', '#f04848'] as const;
const TC_HL = ['#80b8ff', '#ffb0b0'] as const;
// Stone
const ST_VD = '#282420';
const ST_D  = '#403c30';
const ST_M  = '#605848';
const ST_L  = '#807868';
const ST_HL = '#b0a888';
// Wood
const WD_D  = '#3c1e08';
const WD_M  = '#6a3c14';
const WD_L  = '#9a5a28';
// Gold
const GD_D  = '#604c04';
const GD_M  = '#a88010';
const GD_L  = '#d8b020';
const GD_HL = '#fff098';
// Metal
const MT_D  = '#282828';
const MT_M  = '#585858';
const MT_L  = '#a8a8a8';
const MT_HL = '#e0e0e0';
// Greens (terrain + archer)
const GR_VD = '#1a3008';
const GR_D  = '#28480e';
const GR_M  = '#386018';
const GR_L  = '#4a8024';
const GR_HL = '#68aa38';

// ─── Canvas helpers ───────────────────────────────────────────────────────────

function oc(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

/** Simple deterministic LCG so terrain textures are always identical */
function rng(seed: number) {
  let s = seed | 0;
  return () => { s = (Math.imul(1664525, s) + 1013904223) | 0; return (s >>> 0) / 0x100000000; };
}

/** Fill a rounded rect */
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/** Draw crenellations along top edge */
function crenels(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, step: number, h: number) {
  for (let px = x; px < x + w; px += step) {
    ctx.fillRect(px, y - h, step - 2, h);
  }
}

/** Draw a stone-block texture inside a rectangle */
function stoneTexture(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  base: string, mid: string, light: string,
  rowH = 7, colW = 12,
): void {
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  let rowOffset = 0;
  for (let row = 0; row * rowH < h; row++) {
    const ry = y + row * rowH;
    const rh = Math.min(rowH - 1, h - row * rowH);
    rowOffset = (row % 2) * Math.floor(colW / 2);
    for (let col = -1; col * colW < w; col++) {
      const cx2 = x + col * colW + rowOffset;
      const cw = Math.min(colW - 1, w - col * colW - rowOffset + x);
      if (cw <= 0) continue;
      // Stone face
      ctx.fillStyle = mid;
      ctx.fillRect(cx2, ry, cw, rh);
      // Top highlight
      ctx.fillStyle = light;
      ctx.fillRect(cx2, ry, cw, 1);
      // Left highlight
      ctx.fillRect(cx2, ry, 1, rh);
    }
  }
  // Mortar lines (base color)
  ctx.fillStyle = base;
  for (let row = 0; row * rowH < h; row++) {
    ctx.fillRect(x, y + row * rowH - 1, w, 1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TERRAIN
// ═══════════════════════════════════════════════════════════════════════════════

function makeGrass(T: number): HTMLCanvasElement {
  const [c, ctx] = oc(T, T);
  const r = rng(1337);
  ctx.fillStyle = GR_M;
  ctx.fillRect(0, 0, T, T);
  // Texture tufts
  for (let i = 0; i < 20; i++) {
    const x = Math.floor(r() * T);
    const y = Math.floor(r() * T);
    ctx.fillStyle = r() > 0.55 ? GR_L : GR_D;
    ctx.fillRect(x, y, r() > 0.5 ? 2 : 1, 1);
  }
  // Subtle dark edge to define tile boundary when zoomed out
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(0, 0, T, 1);
  ctx.fillRect(0, 0, 1, T);
  return c;
}

function makeTree(T: number): HTMLCanvasElement {
  const [c, ctx] = oc(T, T);
  // Dark forest floor
  ctx.fillStyle = GR_VD;
  ctx.fillRect(0, 0, T, T);
  // Trunk
  ctx.fillStyle = WD_M;
  ctx.fillRect(T / 2 - 2, T - 8, 4, 8);
  ctx.fillStyle = WD_D;
  ctx.fillRect(T / 2 - 1, T - 8, 1, 8);
  // Three overlapping canopy circles
  const blob = (bx: number, by: number, br: number, col: string) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  };
  blob(T / 2 - 4, T / 2 + 2,  8, GR_VD);
  blob(T / 2 + 4, T / 2 + 2,  8, '#1e420a');
  blob(T / 2,     T / 2 - 3, 10, GR_D);
  blob(T / 2,     T / 2 - 3,  7, '#2e5610');
  // Highlight spot (sun shining top-left)
  ctx.fillStyle = 'rgba(120,200,80,0.18)';
  ctx.beginPath();
  ctx.arc(T / 2 - 3, T / 2 - 6, 4, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

function makeWater(T: number, frame: number): HTMLCanvasElement {
  const [c, ctx] = oc(T, T);
  ctx.fillStyle = '#0e2870';
  ctx.fillRect(0, 0, T, T);
  // Deep wave bands
  ctx.fillStyle = '#142e88';
  for (let y = 0; y < T; y += 6) {
    const oy = ((y + frame * 4) % T);
    ctx.fillRect(0, oy, T, 2);
  }
  // Lighter ripple lines with sine wobble
  ctx.strokeStyle = '#2858c0';
  ctx.lineWidth = 1;
  for (let row = 0; row < 3; row++) {
    const baseY = ((row * 11 + frame * 3) % (T + 4)) - 2;
    ctx.beginPath();
    for (let x = 0; x <= T; x += 2) {
      const y2 = baseY + Math.sin((x + frame * 5) * 0.35) * 2;
      x === 0 ? ctx.moveTo(x, y2) : ctx.lineTo(x, y2);
    }
    ctx.stroke();
  }
  // Sparkle highlights
  const r = rng(frame * 31 + 7);
  ctx.fillStyle = 'rgba(120,180,255,0.55)';
  for (let i = 0; i < 2; i++) {
    ctx.fillRect(Math.floor(r() * (T - 3)), Math.floor(r() * (T - 2)), 3, 1);
  }
  return c;
}

function makeRock(T: number): HTMLCanvasElement {
  const [c, ctx] = oc(T, T);
  ctx.fillStyle = ST_D;
  ctx.fillRect(0, 0, T, T);
  // Two large rock masses
  const block = (x: number, y: number, w: number, h: number, face: string, top: string) => {
    ctx.fillStyle = face;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = top;
    ctx.fillRect(x, y, w, 3);
    ctx.fillStyle = ST_D;
    ctx.fillRect(x + w - 1, y, 1, h);
    ctx.fillRect(x, y + h - 1, w, 1);
  };
  block(1, 1, 14, 13, ST_M, ST_L);
  block(17, 2, 13, 11, '#505040', ST_M);
  block(4, 16, 24, 13, ST_M, ST_HL);
  // Crack lines
  ctx.fillStyle = ST_VD;
  ctx.fillRect(15, 0, 2, 15);
  ctx.fillRect(0, 14, T, 2);
  return c;
}

function makeGoldTile(T: number): HTMLCanvasElement {
  const [c, ctx] = oc(T, T);
  const r = rng(2023);
  ctx.fillStyle = '#3a3020';
  ctx.fillRect(0, 0, T, T);
  // Scattered pebble/earth patches
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(r() * T);
    const y = Math.floor(r() * T);
    ctx.fillStyle = r() > 0.5 ? '#4a4030' : '#504838';
    ctx.fillRect(x, y, 2, 2);
  }
  // Gold flecks
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = GD_M;
    ctx.fillRect(Math.floor(r() * (T - 2)), Math.floor(r() * (T - 2)), 2, 1);
  }
  return c;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNITS  (all 32×32)
// ═══════════════════════════════════════════════════════════════════════════════

function unitShadow(ctx: CanvasRenderingContext2D, T: number) {
  ctx.save();
  ctx.globalAlpha = 0.38;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(T / 2, T - 4, T * 0.28, T * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function makeWorker(T: number, owner: 0 | 1): HTMLCanvasElement {
  const [c, ctx] = oc(T, T);
  const cx = T / 2;

  unitShadow(ctx, T);

  // ── Legs ──
  ctx.fillStyle = '#6a3c14';
  ctx.fillRect(cx - 5, 20, 4, 7);
  ctx.fillRect(cx + 1, 20, 4, 7);
  // Boots
  ctx.fillStyle = '#1c0c04';
  ctx.fillRect(cx - 6, 26, 6, 3);
  ctx.fillRect(cx,     26, 6, 3);

  // ── Tunic body ──
  ctx.fillStyle = '#7a4818';
  ctx.beginPath();
  ctx.moveTo(cx - 7, 13);
  ctx.lineTo(cx + 7, 13);
  ctx.lineTo(cx + 6, 22);
  ctx.lineTo(cx - 6, 22);
  ctx.closePath();
  ctx.fill();
  // Team-color belt
  ctx.fillStyle = TC_M[owner];
  ctx.fillRect(cx - 6, 19, 12, 3);

  // ── Left arm ──
  ctx.fillStyle = SKIN;
  ctx.fillRect(cx - 9, 14, 3, 7);

  // ── Axe (right side) ──
  // Handle
  ctx.fillStyle = WD_M;
  ctx.fillRect(cx + 7, 5, 2, 14);
  // Head (metal)
  ctx.fillStyle = MT_L;
  ctx.beginPath();
  ctx.moveTo(cx + 6,  5);
  ctx.lineTo(cx + 14, 3);
  ctx.lineTo(cx + 14, 11);
  ctx.lineTo(cx + 6,  12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = MT_HL;
  ctx.fillRect(cx + 7, 3, 6, 2); // highlight on blade top
  ctx.fillStyle = MT_D;
  ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.stroke();

  // ── Head ──
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(cx, 10, 6, 0, Math.PI * 2);
  ctx.fill();
  // Hair
  ctx.fillStyle = '#3a1c08';
  ctx.beginPath();
  ctx.arc(cx, 9, 6, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - 6, 6, 12, 3); // top of hair
  // Eyes
  ctx.fillStyle = INK;
  ctx.fillRect(cx - 3, 11, 2, 1);
  ctx.fillRect(cx + 1, 11, 2, 1);

  // Faint outline around head
  ctx.strokeStyle = '#2a1408';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(cx, 10, 6, 0, Math.PI * 2);
  ctx.stroke();

  return c;
}

function makeFootman(T: number, owner: 0 | 1): HTMLCanvasElement {
  const [c, ctx] = oc(T, T);
  const cx = T / 2;

  unitShadow(ctx, T);

  // ── Legs (armored greaves) ──
  ctx.fillStyle = TC_D[owner];
  ctx.fillRect(cx - 5, 19, 5, 8);
  ctx.fillRect(cx + 1, 19, 5, 8);
  // Boots (steel toe)
  ctx.fillStyle = MT_M;
  ctx.fillRect(cx - 6, 26, 7, 3);
  ctx.fillRect(cx,     26, 7, 3);

  // ── Shield (left side) ──
  ctx.fillStyle = TC_M[owner];
  ctx.fillRect(cx - 12, 12, 7, 11);
  // Shield boss (gold center)
  ctx.fillStyle = GD_L;
  ctx.beginPath();
  ctx.arc(cx - 8, 17, 2, 0, Math.PI * 2);
  ctx.fill();
  // Shield rim
  ctx.strokeStyle = TC_D[owner]; ctx.lineWidth = 1;
  ctx.strokeRect(cx - 12, 12, 7, 11);

  // ── Armored torso ──
  ctx.fillStyle = TC_M[owner];
  ctx.beginPath();
  ctx.moveTo(cx - 6, 12);
  ctx.lineTo(cx + 8, 12);
  ctx.lineTo(cx + 7, 21);
  ctx.lineTo(cx - 5, 21);
  ctx.closePath();
  ctx.fill();
  // Chest highlight
  ctx.fillStyle = TC_L[owner];
  ctx.fillRect(cx - 4, 13, 8, 2);
  // Belt buckle
  ctx.fillStyle = GD_L;
  ctx.fillRect(cx - 1, 20, 3, 2);

  // ── Sword arm (right) ──
  ctx.fillStyle = MT_M;
  ctx.fillRect(cx + 7, 14, 3, 8);
  // Sword blade
  ctx.fillStyle = MT_HL;
  ctx.fillRect(cx + 9, 5, 2, 13);
  ctx.fillStyle = GD_L;
  ctx.fillRect(cx + 8, 13, 4, 2); // crossguard
  ctx.fillStyle = WD_M;
  ctx.fillRect(cx + 9, 15, 2, 4); // grip

  // ── Helmet ──
  ctx.fillStyle = MT_M;
  ctx.beginPath();
  ctx.arc(cx + 1, 9, 7, 0, Math.PI * 2);
  ctx.fill();
  // Helmet dome highlight
  ctx.fillStyle = MT_L;
  ctx.beginPath();
  ctx.arc(cx - 1, 7, 4, 0, Math.PI * 2);
  ctx.fill();
  // Nose guard
  ctx.fillStyle = MT_D;
  ctx.fillRect(cx + 1, 10, 2, 5);
  // Cheek guards
  ctx.fillStyle = MT_M;
  ctx.fillRect(cx - 4, 12, 4, 4);
  ctx.fillRect(cx + 4, 12, 4, 4);
  // Eyes (visor slit)
  ctx.fillStyle = INK;
  ctx.fillRect(cx - 3, 10, 3, 1);
  ctx.fillRect(cx + 3, 10, 3, 1);

  return c;
}

function makeArcher(T: number, owner: 0 | 1): HTMLCanvasElement {
  const [c, ctx] = oc(T, T);
  const cx = T / 2;

  unitShadow(ctx, T);

  // ── Legs (leather) ──
  ctx.fillStyle = '#4a3010';
  ctx.fillRect(cx - 4, 19, 3, 8);
  ctx.fillRect(cx + 1, 19, 3, 8);
  // Boots
  ctx.fillStyle = '#1c0c04';
  ctx.fillRect(cx - 5, 26, 5, 3);
  ctx.fillRect(cx + 1, 26, 5, 3);

  // ── Cloak/Tunic (green ranger style) ──
  ctx.fillStyle = GR_D;
  ctx.beginPath();
  ctx.moveTo(cx - 6, 13);
  ctx.lineTo(cx + 6, 13);
  ctx.lineTo(cx + 5, 22);
  ctx.lineTo(cx - 5, 22);
  ctx.closePath();
  ctx.fill();
  // Team color trim on cloak
  ctx.fillStyle = TC_M[owner];
  ctx.fillRect(cx - 6, 13, 2, 9);
  ctx.fillRect(cx + 4, 13, 2, 9);

  // ── Bow (left side, arc shape) ──
  ctx.strokeStyle = WD_M;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx - 11, 14, 9, -Math.PI * 0.55, Math.PI * 0.55);
  ctx.stroke();
  // Bow string
  ctx.strokeStyle = 'rgba(200,180,140,0.8)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - 11 + 9 * Math.cos(-Math.PI * 0.55), 14 + 9 * Math.sin(-Math.PI * 0.55));
  ctx.lineTo(cx - 11 + 9 * Math.cos(Math.PI * 0.55),  14 + 9 * Math.sin(Math.PI * 0.55));
  ctx.stroke();
  // Arrow on bow
  ctx.strokeStyle = WD_L;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 5, 7);
  ctx.lineTo(cx - 5, 20);
  ctx.stroke();
  ctx.fillStyle = MT_L;
  ctx.fillRect(cx - 6, 6, 3, 3);  // arrowhead

  // ── Quiver (right side) ──
  ctx.fillStyle = WD_D;
  ctx.fillRect(cx + 5, 13, 4, 8);
  ctx.fillStyle = WD_M;
  ctx.fillRect(cx + 6, 11, 2, 3); // arrow tails
  ctx.fillRect(cx + 7, 10, 1, 4);

  // ── Hood + head ──
  ctx.fillStyle = GR_VD;
  ctx.beginPath();
  ctx.arc(cx, 9, 7, 0, Math.PI * 2);
  ctx.fill();
  // Hood peak (pointed)
  ctx.beginPath();
  ctx.moveTo(cx - 5, 6);
  ctx.lineTo(cx, 0);
  ctx.lineTo(cx + 5, 6);
  ctx.fill();
  // Team color trim on hood
  ctx.fillStyle = TC_M[owner];
  ctx.fillRect(cx - 7, 12, 14, 2);
  // Face (small window in hood)
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(cx, 10, 4, 0, Math.PI * 2);
  ctx.fill();
  // Eyes
  ctx.fillStyle = INK;
  ctx.fillRect(cx - 2, 10, 1, 1);
  ctx.fillRect(cx + 1, 10, 1, 1);

  return c;
}

function makeKnight(T: number, owner: 0 | 1): HTMLCanvasElement {
  const [c, ctx] = oc(T, T);
  const cx = T / 2;

  unitShadow(ctx, T);

  ctx.fillStyle = TC_D[owner];
  ctx.fillRect(cx - 6, 18, 5, 9);
  ctx.fillRect(cx + 1, 18, 5, 9);
  ctx.fillStyle = MT_M;
  ctx.fillRect(cx - 7, 26, 7, 3);
  ctx.fillRect(cx, 26, 7, 3);

  ctx.fillStyle = TC_D[owner];
  ctx.fillRect(cx - 13, 13, 7, 11);
  ctx.fillStyle = TC_L[owner];
  ctx.fillRect(cx - 12, 14, 5, 9);
  ctx.fillStyle = MT_HL;
  ctx.fillRect(cx - 10, 17, 2, 2);

  ctx.fillStyle = MT_M;
  ctx.beginPath();
  ctx.moveTo(cx - 7, 12);
  ctx.lineTo(cx + 8, 12);
  ctx.lineTo(cx + 7, 23);
  ctx.lineTo(cx - 6, 23);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = TC_M[owner];
  ctx.fillRect(cx - 4, 14, 9, 3);
  ctx.fillStyle = GD_L;
  ctx.fillRect(cx - 1, 20, 3, 2);

  ctx.fillStyle = MT_HL;
  ctx.fillRect(cx + 9, 4, 2, 14);
  ctx.fillStyle = GD_L;
  ctx.fillRect(cx + 8, 13, 4, 2);
  ctx.fillStyle = WD_M;
  ctx.fillRect(cx + 9, 15, 2, 4);

  ctx.fillStyle = MT_M;
  ctx.beginPath();
  ctx.arc(cx + 1, 8, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = MT_HL;
  ctx.beginPath();
  ctx.arc(cx - 1, 6, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = TC_HL[owner];
  ctx.fillRect(cx, 2, 2, 5);
  ctx.fillStyle = MT_D;
  ctx.fillRect(cx + 1, 9, 2, 6);
  ctx.fillStyle = INK;
  ctx.fillRect(cx - 3, 10, 2, 1);
  ctx.fillRect(cx + 3, 10, 2, 1);

  return c;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUILDINGS
// ═══════════════════════════════════════════════════════════════════════════════

function makeTownhall(T: number, owner: 0 | 1): HTMLCanvasElement {
  const W = T * 3; const H = T * 3;
  const [c, ctx] = oc(W, H);

  // ── Foundation / base stone ──
  stoneTexture(ctx, 0, 0, W, H, ST_VD, ST_D, ST_M, 8, 13);

  // ── Corner towers ──
  const tower = (tx: number, ty: number, tr: number) => {
    ctx.fillStyle = ST_D;
    ctx.beginPath();
    ctx.arc(tx, ty, tr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ST_M;
    ctx.beginPath();
    ctx.arc(tx - 2, ty - 2, tr - 3, 0, Math.PI * 2);
    ctx.fill();
    // Crenels around tower top
    ctx.fillStyle = ST_L;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      ctx.fillRect(
        tx + Math.cos(ang) * (tr - 2) - 2,
        ty + Math.sin(ang) * (tr - 2) - 2, 4, 4,
      );
    }
    // Team color flag on each corner
    ctx.fillStyle = TC_M[owner];
    ctx.fillRect(tx - 1, ty - tr - 8, 2, 8);
    ctx.fillStyle = TC_L[owner];
    ctx.beginPath();
    ctx.moveTo(tx + 1, ty - tr - 8);
    ctx.lineTo(tx + 7, ty - tr - 5);
    ctx.lineTo(tx + 1, ty - tr - 2);
    ctx.fill();
  };
  tower(14, 14, 12);
  tower(W - 14, 14, 12);
  tower(14, H - 14, 11);
  tower(W - 14, H - 14, 11);

  // ── Central hall roof ──
  ctx.fillStyle = ST_M;
  ctx.fillRect(22, 22, W - 44, H - 44);
  // Roof peak (darker center stripe)
  ctx.fillStyle = ST_D;
  ctx.fillRect(W / 2 - 3, 22, 6, H - 44);
  // Roof highlight ridge
  ctx.fillStyle = ST_HL;
  ctx.fillRect(W / 2 - 1, 22, 2, H - 44);

  // ── Gate arch at bottom center ──
  ctx.fillStyle = ST_VD;
  // Arch shape
  ctx.beginPath();
  ctx.rect(W / 2 - 10, H - 22, 20, 22);
  ctx.fill();
  ctx.fillStyle = '#080604';
  ctx.beginPath();
  ctx.arc(W / 2, H - 22, 10, Math.PI, 0, false);
  ctx.fill();
  // Door frame
  ctx.strokeStyle = ST_M; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(W / 2, H - 22, 10, Math.PI, 0, false);
  ctx.stroke();
  ctx.strokeRect(W / 2 - 10, H - 22, 20, 22);

  // ── Team color banner above gate ──
  ctx.fillStyle = TC_D[owner];
  ctx.fillRect(W / 2 - 12, H - 36, 24, 10);
  ctx.fillStyle = TC_M[owner];
  ctx.fillRect(W / 2 - 10, H - 35, 20, 8);
  // Cross emblem
  ctx.fillStyle = TC_HL[owner];
  ctx.fillRect(W / 2 - 1, H - 35, 2, 8);
  ctx.fillRect(W / 2 - 5, H - 32, 10, 2);

  // ── Window slits ──
  ctx.fillStyle = '#040404';
  for (const [wx, wy] of [[24, 30], [W-28, 30], [24, H-36], [W-28, H-36]]) {
    ctx.fillRect(wx, wy, 4, 8);
    ctx.fillRect(wx + 1, wy - 1, 2, 1); // arch top
  }

  // ── Outer wall top crenellations ──
  ctx.fillStyle = ST_M;
  crenels(ctx, 2, 6, W - 4, 6, 8);
  // Bottom edge shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, H - 3, W, 3);
  ctx.fillRect(W - 3, 0, 3, H);

  return c;
}

function makeBarracks(T: number, owner: 0 | 1): HTMLCanvasElement {
  const W = T * 3; const H = T * 2;
  const [c, ctx] = oc(W, H);

  stoneTexture(ctx, 0, 0, W, H, ST_VD, ST_D, ST_L, 9, 14);

  // ── Flat roof with raised battlements ──
  ctx.fillStyle = ST_M;
  ctx.fillRect(0, 0, W, 14);
  ctx.fillStyle = ST_L;
  ctx.fillRect(0, 0, W, 4);  // highlight
  crenels(ctx, 2, 10, W - 4, 7, 9);

  // ── Front wall ──
  ctx.fillStyle = ST_D;
  ctx.fillRect(2, 14, W - 4, H - 14);

  // ── Main gate (wide double door) ──
  const gx = W / 2 - 12;
  ctx.fillStyle = WD_D;
  ctx.fillRect(gx, H - 26, 24, 26);
  ctx.fillStyle = WD_M;
  ctx.fillRect(gx + 2, H - 24, 10, 24);
  ctx.fillRect(gx + 14, H - 24, 10, 24);
  // Door studs
  ctx.fillStyle = MT_M;
  for (const [dx, dy] of [[3, 6], [3, 14], [3, 20], [11, 6], [11, 14], [11, 20]]) {
    ctx.beginPath();
    ctx.arc(gx + dx + 2, H - 24 + dy, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // For right door panel
  for (const [dx, dy] of [[17, 6], [17, 14], [17, 20], [23, 6], [23, 14], [23, 20]]) {
    ctx.beginPath();
    ctx.arc(gx + dx - 2, H - 24 + dy, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Door frame
  ctx.strokeStyle = ST_VD; ctx.lineWidth = 2;
  ctx.strokeRect(gx, H - 26, 24, 26);

  // ── Arrow slits ──
  ctx.fillStyle = '#040404';
  for (const wx of [14, W - 18]) {
    ctx.fillRect(wx, H - 36, 4, 12);
    ctx.fillRect(wx - 2, H - 34, 8, 4);  // horizontal slit
  }

  // ── Flagpole + pennant ──
  ctx.fillStyle = WD_L;
  ctx.fillRect(W - 14, 0, 2, 22);
  ctx.fillStyle = TC_M[owner];
  ctx.beginPath();
  ctx.moveTo(W - 12, 2);
  ctx.lineTo(W - 2,  8);
  ctx.lineTo(W - 12, 14);
  ctx.fill();
  ctx.fillStyle = TC_HL[owner];
  ctx.fillRect(W - 12, 2, 8, 3);

  // ── Corner pilasters ──
  ctx.fillStyle = ST_L;
  ctx.fillRect(0, 14, 6, H - 14);
  ctx.fillRect(W - 6, 14, 6, H - 14);
  // Highlight on left pilaster
  ctx.fillStyle = ST_HL;
  ctx.fillRect(0, 14, 2, H - 14);

  // Bottom shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(0, H - 2, W, 2);

  return c;
}

function makeLumberMill(T: number, owner: 0 | 1): HTMLCanvasElement {
  const W = T * 3; const H = T * 2;
  const [c, ctx] = oc(W, H);

  ctx.fillStyle = '#4b3420';
  ctx.fillRect(0, 8, W, H - 8);
  stoneTexture(ctx, 0, H - 14, W, 14, ST_VD, ST_D, ST_L, 8, 10);

  ctx.fillStyle = WD_D;
  ctx.fillRect(4, 10, W - 8, H - 20);
  ctx.fillStyle = WD_M;
  for (let x = 6; x < W - 6; x += 8) {
    ctx.fillRect(x, 12, 4, H - 24);
  }
  ctx.fillStyle = WD_L;
  for (let y = 14; y < H - 10; y += 8) {
    ctx.fillRect(4, y, W - 8, 2);
  }

  ctx.fillStyle = ST_M;
  ctx.beginPath();
  ctx.moveTo(2, 14);
  ctx.lineTo(W / 2, 0);
  ctx.lineTo(W - 2, 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = ST_L;
  ctx.beginPath();
  ctx.moveTo(6, 14);
  ctx.lineTo(W / 2, 4);
  ctx.lineTo(W - 6, 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = TC_M[owner];
  ctx.fillRect(W / 2 - 2, 4, 4, 10);

  const wheelCx = 18;
  const wheelCy = H - 16;
  ctx.strokeStyle = WD_D;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(wheelCx, wheelCy, 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = WD_L;
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8;
    ctx.beginPath();
    ctx.moveTo(wheelCx, wheelCy);
    ctx.lineTo(wheelCx + Math.cos(a) * 9, wheelCy + Math.sin(a) * 9);
    ctx.stroke();
  }
  ctx.fillStyle = MT_M;
  ctx.beginPath();
  ctx.arc(wheelCx, wheelCy, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#040404';
  ctx.fillRect(W - 26, H - 34, 10, 16);
  ctx.fillRect(W - 42, H - 30, 8, 12);
  ctx.fillStyle = ST_D;
  ctx.fillRect(W - 24, H - 42, 6, 12);
  ctx.fillRect(W - 40, H - 38, 4, 10);

  ctx.fillStyle = WD_M;
  ctx.fillRect(W - 22, H - 16, 18, 4);
  ctx.fillRect(W - 20, H - 20, 16, 4);
  ctx.fillStyle = WD_L;
  ctx.fillRect(W - 24, H - 16, 2, 10);
  ctx.fillRect(W - 10, H - 16, 2, 10);
  ctx.fillRect(W - 28, H - 12, 24, 3);

  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, H - 2, W, 2);

  return c;
}

function makeFarm(T: number, owner: 0 | 1): HTMLCanvasElement {
  const W = T * 2; const H = T * 2;
  const [c, ctx] = oc(W, H);

  // ── Crop field (alternating rows) ──
  ctx.fillStyle = '#2a4c10';
  ctx.fillRect(0, 0, W, H);
  for (let row = 0; row < 7; row++) {
    ctx.fillStyle = row % 2 === 0 ? '#3a6418' : '#2a4c10';
    ctx.fillRect(18, row * 9, W - 20, 9);
    // Crop dots
    ctx.fillStyle = '#4a8020';
    for (let col = 0; col < 5; col++) {
      ctx.fillRect(20 + col * 8, row * 9 + 3, 3, 3);
    }
  }

  // ── Fence ──
  ctx.fillStyle = WD_M;
  ctx.fillRect(0, 0, W, 3);           // top rail
  ctx.fillRect(0, H - 3, W, 3);       // bottom rail
  ctx.fillRect(0, 0, 3, H);           // left rail
  ctx.fillRect(W - 3, 0, 3, H);       // right rail
  // Fence posts
  ctx.fillStyle = WD_L;
  for (let x = 0; x < W; x += 10) {
    ctx.fillRect(x, 0, 3, H);         // only posts on verticals
  }
  ctx.fillStyle = WD_L;
  for (let y = 10; y < H - 10; y += 10) {
    ctx.fillRect(0, y, W, 2);         // horizontal fence boards
  }

  // ── Farmhouse (upper-left) ──
  ctx.fillStyle = '#603010'; // log walls
  ctx.fillRect(0, 0, 18, 36);
  stoneTexture(ctx, 1, 1, 16, 34, '#4a2008', WD_M, WD_L, 7, 8);
  // Roof (pitched, team color) - drawn as trapezoid
  ctx.fillStyle = TC_D[owner];
  ctx.beginPath();
  ctx.moveTo(-1, 16);
  ctx.lineTo(9, 4);
  ctx.lineTo(19, 16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = TC_M[owner];
  ctx.beginPath();
  ctx.moveTo(0, 16);
  ctx.lineTo(9, 5);
  ctx.lineTo(18, 16);
  ctx.closePath();
  ctx.fill();
  // Ridge line
  ctx.fillStyle = TC_HL[owner];
  ctx.fillRect(8, 4, 2, 12);
  // Door
  ctx.fillStyle = WD_D;
  ctx.fillRect(4, 24, 8, 12);
  ctx.fillStyle = '#080400';
  ctx.fillRect(5, 25, 6, 11);
  // Window
  ctx.fillStyle = '#a0c8e8';
  ctx.fillRect(10, 20, 6, 6);
  ctx.fillStyle = WD_D;
  ctx.fillRect(12, 20, 1, 6); // cross
  ctx.fillRect(10, 23, 6, 1);

  // ── Team color weathervane / sign ──
  ctx.fillStyle = TC_M[owner];
  ctx.fillRect(8, 0, 2, 5);

  return c;
}

function makeWall(T: number, owner: 0 | 1): HTMLCanvasElement {
  const [c, ctx] = oc(T, T);

  stoneTexture(ctx, 0, 6, T, T - 6, ST_D, ST_M, ST_HL, 8, 12);

  // ── Crenellations (top, 3 merlons) ──
  ctx.fillStyle = ST_M;
  ctx.fillRect(0, 0, 9, 10);
  ctx.fillRect(11, 0, 10, 10);
  ctx.fillRect(23, 0, 9, 10);
  ctx.fillStyle = ST_L;
  ctx.fillRect(0, 0, 9, 2);
  ctx.fillRect(11, 0, 10, 2);
  ctx.fillRect(23, 0, 9, 2);

  // ── Team color top edge ──
  ctx.fillStyle = TC_D[owner];
  ctx.fillRect(0, 0, T, 2);

  // ── Dark gaps between merlons ──
  ctx.fillStyle = ST_VD;
  ctx.fillRect(9, 0, 2, 10);
  ctx.fillRect(21, 0, 2, 10);

  // Side shadows
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(T - 2, 0, 2, T);
  ctx.fillRect(0, T - 2, T, 2);

  return c;
}

function makeTower(T: number, owner: 0 | 1, orc: boolean): HTMLCanvasElement {
  const W = T * 2; const H = T * 2;
  const [c, ctx] = oc(W, H);

  const baseDark = orc ? '#201608' : ST_VD;
  const baseMid  = orc ? '#362612' : ST_D;
  const baseLite = orc ? '#4a3620' : ST_L;
  stoneTexture(ctx, 0, 10, W, H - 10, baseDark, baseMid, baseLite, 8, 12);

  ctx.fillStyle = baseMid;
  ctx.fillRect(0, 0, W, 12);
  ctx.fillStyle = orc ? '#4e3824' : ST_L;
  crenels(ctx, 1, 10, W - 2, 8, 8);

  ctx.fillStyle = TC_D[owner];
  ctx.fillRect(0, 0, W, 2);

  ctx.fillStyle = '#120c08';
  ctx.fillRect(W / 2 - 7, H - 20, 14, 20);
  ctx.beginPath();
  ctx.arc(W / 2, H - 20, 7, Math.PI, 0);
  ctx.fill();

  if (orc) {
    ctx.fillStyle = ORC_TUSK;
    ctx.beginPath(); ctx.moveTo(8, 4); ctx.lineTo(10, -3); ctx.lineTo(12, 4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(W - 12, 4); ctx.lineTo(W - 10, -3); ctx.lineTo(W - 8, 4); ctx.fill();
  } else {
    ctx.fillStyle = ST_HL;
    ctx.fillRect(W / 2 - 1, 2, 2, 8);
  }

  return c;
}

function makeBarrier(T: number): HTMLCanvasElement {
  const W = T * 2; const H = T;
  const [c, ctx] = oc(W, H);

  ctx.fillStyle = WD_D;
  ctx.fillRect(0, 5, W, H - 5);
  ctx.fillStyle = WD_M;
  for (let x = 1; x < W - 1; x += 8) {
    ctx.fillRect(x, 3, 6, H - 5);
    ctx.fillStyle = WD_L;
    ctx.fillRect(x, 3, 1, H - 5);
    ctx.fillStyle = WD_M;
  }

  ctx.fillStyle = MT_D;
  ctx.fillRect(0, H - 5, W, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(W - 2, 0, 2, H);

  return c;
}

function makeGoldmine(T: number): HTMLCanvasElement {
  const W = T * 2; const H = T * 2;
  const [c, ctx] = oc(W, H);

  // ── Rocky hillside ──
  stoneTexture(ctx, 0, 0, W, H, '#282018', '#3c3020', '#504838', 9, 14);

  // ── Mine entrance (dark arch) ──
  const ex = W / 2 - 14; const ew = 28;
  const ey = H / 2 - 4;  const eh = H / 2 + 4;
  ctx.fillStyle = '#080604';
  ctx.fillRect(ex, ey, ew, eh);
  ctx.beginPath();
  ctx.arc(W / 2, ey, 14, Math.PI, 0);
  ctx.fill();
  // Arch glow (gold)
  ctx.strokeStyle = GD_L; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(W / 2, ey, 14, Math.PI, 0);
  ctx.stroke();
  ctx.strokeRect(ex, ey, ew, eh);
  // Inner glow
  ctx.strokeStyle = GD_HL; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(W / 2, ey, 12, Math.PI, 0);
  ctx.stroke();

  // ── Wooden support frame ──
  ctx.fillStyle = WD_M;
  ctx.fillRect(ex - 2, ey - 2, 4, eh + 4);  // left post
  ctx.fillRect(ex + ew - 2, ey - 2, 4, eh + 4); // right post
  ctx.fillRect(ex - 2, ey - 4, ew + 6, 4);  // top beam
  // Wood detail
  ctx.fillStyle = WD_L;
  ctx.fillRect(ex - 1, ey - 2, 1, eh + 2);
  ctx.fillRect(ex + ew - 1, ey - 2, 1, eh + 2);

  // ── Gold nuggets scattered around entrance ──
  const nuggets: Array<[number, number]> = [
    [ex - 8, ey + 6], [ex + ew + 4, ey + 8],
    [W / 2 - 4, ey - 8], [W / 2 + 4, ey - 6],
    [ex + 4, ey + eh + 2], [ex + ew - 8, ey + eh],
  ];
  for (const [nx, ny] of nuggets) {
    ctx.fillStyle = GD_D;
    ctx.fillRect(nx, ny, 5, 4);
    ctx.fillStyle = GD_L;
    ctx.fillRect(nx + 1, ny, 3, 2);
    ctx.fillStyle = GD_HL;
    ctx.fillRect(nx + 1, ny, 2, 1);
  }

  // ── Rock details (cracks and facets) ──
  ctx.fillStyle = '#1a1408';
  ctx.fillRect(8, 4, 1, 20);
  ctx.fillRect(W - 9, 8, 1, 16);

  return c;
}

function makeCorpse(T: number): HTMLCanvasElement {
  const [c, ctx] = oc(T, T);
  // Small dark cross/X shape
  ctx.fillStyle = '#404040';
  ctx.save();
  ctx.translate(T / 2, T / 2);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-6, -2, 12, 4);
  ctx.fillRect(-2, -6, 4, 12);
  ctx.restore();
  ctx.fillStyle = '#202020';
  ctx.save();
  ctx.translate(T / 2, T / 2);
  ctx.rotate(-Math.PI / 4);
  ctx.fillRect(-4, -1, 8, 3);
  ctx.fillRect(-1, -4, 3, 8);
  ctx.restore();
  return c;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORC UNITS  (all 32×32)
// ═══════════════════════════════════════════════════════════════════════════════

// Orc skin / earth tones
const ORC_SKIN_D  = '#3a5c18';
const ORC_SKIN_M  = '#4e7820';
const ORC_SKIN_L  = '#64961e';
const ORC_TUSK    = '#d4c890';
const ORC_LEATHER = '#5a3010';
const ORC_LEATHER_L = '#7a4820';
// Troll skin
const TRL_SKIN_D = '#3a4870';
const TRL_SKIN_M = '#4a5c90';
const TRL_SKIN_L = '#5c70aa';

function makePeon(T: number, owner: 0 | 1): HTMLCanvasElement {
  const [c, ctx] = oc(T, T);
  const cx = T / 2;

  unitShadow(ctx, T);

  // ── Legs (bare, orc-green) ──
  ctx.fillStyle = ORC_SKIN_M;
  ctx.fillRect(cx - 5, 20, 4, 7);
  ctx.fillRect(cx + 1, 20, 4, 7);
  // Crude foot wraps
  ctx.fillStyle = ORC_LEATHER;
  ctx.fillRect(cx - 6, 26, 6, 3);
  ctx.fillRect(cx,     26, 6, 3);

  // ── Ragged tunic ──
  ctx.fillStyle = ORC_LEATHER;
  ctx.beginPath();
  ctx.moveTo(cx - 7, 13);
  ctx.lineTo(cx + 7, 13);
  ctx.lineTo(cx + 6, 22);
  ctx.lineTo(cx - 6, 22);
  ctx.closePath();
  ctx.fill();
  // Team-color crude belt
  ctx.fillStyle = TC_M[owner];
  ctx.fillRect(cx - 6, 19, 12, 3);

  // ── Left arm (bare skin) ──
  ctx.fillStyle = ORC_SKIN_M;
  ctx.fillRect(cx - 9, 14, 3, 7);

  // ── Crude pick (right side) ──
  ctx.fillStyle = WD_D;
  ctx.fillRect(cx + 7, 6, 2, 13);
  // Bone/stone pick head
  ctx.fillStyle = '#c0b890';
  ctx.beginPath();
  ctx.moveTo(cx + 6, 7);
  ctx.lineTo(cx + 14, 4);
  ctx.lineTo(cx + 13, 10);
  ctx.lineTo(cx + 6,  11);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e0d8a8';
  ctx.fillRect(cx + 7, 4, 5, 2);

  // ── Orc head ──
  ctx.fillStyle = ORC_SKIN_M;
  ctx.beginPath();
  ctx.arc(cx, 10, 6, 0, Math.PI * 2);
  ctx.fill();
  // Dark hair / mohawk stub
  ctx.fillStyle = '#1a1008';
  ctx.beginPath();
  ctx.arc(cx, 9, 6, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - 2, 4, 4, 5); // mohawk ridge
  // Tusks
  ctx.fillStyle = ORC_TUSK;
  ctx.fillRect(cx - 4, 13, 2, 3);
  ctx.fillRect(cx + 2, 13, 2, 3);
  // Eyes (red)
  ctx.fillStyle = '#cc2020';
  ctx.fillRect(cx - 3, 10, 2, 1);
  ctx.fillRect(cx + 1, 10, 2, 1);

  ctx.strokeStyle = '#1a2808';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(cx, 10, 6, 0, Math.PI * 2);
  ctx.stroke();

  return c;
}

function makeGrunt(T: number, owner: 0 | 1): HTMLCanvasElement {
  const [c, ctx] = oc(T, T);
  const cx = T / 2;

  unitShadow(ctx, T);

  // ── Armored legs ──
  ctx.fillStyle = ORC_LEATHER;
  ctx.fillRect(cx - 6, 19, 5, 8);
  ctx.fillRect(cx + 1, 19, 5, 8);
  // Studded boots
  ctx.fillStyle = '#1c0c04';
  ctx.fillRect(cx - 7, 26, 7, 3);
  ctx.fillRect(cx,     26, 7, 3);
  // Boot studs
  ctx.fillStyle = MT_M;
  ctx.fillRect(cx - 5, 27, 2, 2);
  ctx.fillRect(cx + 2, 27, 2, 2);

  // ── Crude shield (left side, bone/metal) ──
  ctx.fillStyle = '#3c2c10';
  ctx.fillRect(cx - 13, 12, 7, 12);
  // Shield face (team color)
  ctx.fillStyle = TC_D[owner];
  ctx.fillRect(cx - 12, 13, 5, 10);
  // Skull emblem on shield
  ctx.fillStyle = '#d0c880';
  ctx.beginPath();
  ctx.arc(cx - 10, 18, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3c2c10';
  ctx.fillRect(cx - 11, 19, 2, 2); // jaw
  ctx.fillRect(cx - 9,  19, 2, 2);

  // ── Heavy armored torso ──
  ctx.fillStyle = TC_D[owner];
  ctx.beginPath();
  ctx.moveTo(cx - 7, 12);
  ctx.lineTo(cx + 8, 12);
  ctx.lineTo(cx + 7, 22);
  ctx.lineTo(cx - 6, 22);
  ctx.closePath();
  ctx.fill();
  // Armor highlight
  ctx.fillStyle = TC_M[owner];
  ctx.fillRect(cx - 5, 13, 9, 2);
  // Rivet details
  ctx.fillStyle = MT_L;
  ctx.fillRect(cx - 4, 17, 2, 2);
  ctx.fillRect(cx + 2, 17, 2, 2);

  // ── Great axe (right side) ──
  ctx.fillStyle = WD_D;
  ctx.fillRect(cx + 8, 4, 2, 18);
  // Axe blade (large, brutal)
  ctx.fillStyle = MT_M;
  ctx.beginPath();
  ctx.moveTo(cx + 8, 5);
  ctx.lineTo(cx + 17, 1);
  ctx.lineTo(cx + 18, 13);
  ctx.lineTo(cx + 8, 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = MT_HL;
  ctx.fillRect(cx + 9, 2, 7, 2);
  // Back spike
  ctx.fillStyle = MT_L;
  ctx.beginPath();
  ctx.moveTo(cx + 8, 7);
  ctx.lineTo(cx + 4, 4);
  ctx.lineTo(cx + 8, 10);
  ctx.fill();

  // ── Orc head (larger, more tusks) ──
  ctx.fillStyle = ORC_SKIN_D;
  ctx.beginPath();
  ctx.arc(cx + 1, 9, 7, 0, Math.PI * 2);
  ctx.fill();
  // Battle helmet (open-faced)
  ctx.fillStyle = MT_D;
  ctx.beginPath();
  ctx.arc(cx + 1, 7, 7, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(cx - 5, 7, 3, 5);  // left cheek guard
  ctx.fillRect(cx + 5, 7, 3, 5);  // right cheek guard
  ctx.fillStyle = MT_M;
  ctx.fillRect(cx - 4, 7, 2, 4);
  // Face
  ctx.fillStyle = ORC_SKIN_M;
  ctx.beginPath();
  ctx.arc(cx + 1, 11, 4, 0, Math.PI * 2);
  ctx.fill();
  // Large tusks
  ctx.fillStyle = ORC_TUSK;
  ctx.fillRect(cx - 3, 13, 3, 5);
  ctx.fillRect(cx + 2, 13, 3, 5);
  // Red eyes
  ctx.fillStyle = '#ff2020';
  ctx.fillRect(cx - 2, 10, 2, 2);
  ctx.fillRect(cx + 3, 10, 2, 2);

  return c;
}

function makeTroll(T: number, owner: 0 | 1): HTMLCanvasElement {
  const [c, ctx] = oc(T, T);
  const cx = T / 2;

  unitShadow(ctx, T);

  // ── Long legs (trolls are tall) ──
  ctx.fillStyle = TRL_SKIN_D;
  ctx.fillRect(cx - 4, 18, 3, 9);
  ctx.fillRect(cx + 1, 18, 3, 9);
  // Large flat feet
  ctx.fillStyle = TRL_SKIN_M;
  ctx.fillRect(cx - 5, 26, 5, 3);
  ctx.fillRect(cx + 1, 26, 5, 3);

  // ── Minimal loincloth ──
  ctx.fillStyle = ORC_LEATHER;
  ctx.fillRect(cx - 4, 17, 8, 5);
  // Team color band
  ctx.fillStyle = TC_M[owner];
  ctx.fillRect(cx - 4, 17, 8, 2);

  // ── Throwing arm (right) ──
  ctx.fillStyle = TRL_SKIN_M;
  ctx.fillRect(cx + 6, 11, 3, 8);
  // Axe in hand
  ctx.fillStyle = WD_M;
  ctx.fillRect(cx + 9, 7, 2, 10);
  ctx.fillStyle = MT_L;
  ctx.beginPath();
  ctx.moveTo(cx + 9, 8);
  ctx.lineTo(cx + 15, 6);
  ctx.lineTo(cx + 15, 13);
  ctx.lineTo(cx + 9, 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = MT_HL;
  ctx.fillRect(cx + 10, 6, 4, 2);

  // ── Quiver of axes (back, right side) ──
  ctx.fillStyle = ORC_LEATHER_L;
  ctx.fillRect(cx + 5, 12, 3, 6);
  ctx.fillStyle = MT_M;
  ctx.fillRect(cx + 6, 10, 1, 4); // axe handle sticking up
  ctx.fillRect(cx + 7, 11, 1, 3);

  // ── Left arm ──
  ctx.fillStyle = TRL_SKIN_M;
  ctx.fillRect(cx - 8, 11, 3, 7);

  // ── Torso (lanky) ──
  ctx.fillStyle = TRL_SKIN_D;
  ctx.beginPath();
  ctx.moveTo(cx - 5, 11);
  ctx.lineTo(cx + 6, 11);
  ctx.lineTo(cx + 5, 19);
  ctx.lineTo(cx - 4, 19);
  ctx.closePath();
  ctx.fill();
  // Team color warpaint stripe on chest
  ctx.fillStyle = TC_L[owner];
  ctx.fillRect(cx - 1, 12, 2, 6);

  // ── Troll head (elongated, tusks pointing up) ──
  ctx.fillStyle = TRL_SKIN_M;
  ctx.beginPath();
  ctx.ellipse(cx, 8, 5, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Mohawk
  ctx.fillStyle = TC_M[owner];
  ctx.fillRect(cx - 1, 1, 2, 7);
  ctx.fillRect(cx - 2, 2, 4, 4);
  // Tusks pointing upward
  ctx.fillStyle = ORC_TUSK;
  ctx.fillRect(cx - 4, 5, 2, 5);
  ctx.fillRect(cx + 2, 5, 2, 5);
  // Eyes (yellow/amber)
  ctx.fillStyle = '#d0a020';
  ctx.fillRect(cx - 2, 8, 2, 2);
  ctx.fillRect(cx + 1, 8, 2, 2);
  ctx.fillStyle = '#1a1008';
  ctx.fillRect(cx - 2, 8, 1, 1);
  ctx.fillRect(cx + 2, 8, 1, 1);

  return c;
}

function makeOgreFighter(T: number, owner: 0 | 1): HTMLCanvasElement {
  const [c, ctx] = oc(T, T);
  const cx = T / 2;

  unitShadow(ctx, T);

  ctx.fillStyle = ORC_LEATHER;
  ctx.fillRect(cx - 6, 18, 5, 9);
  ctx.fillRect(cx + 2, 18, 5, 9);
  ctx.fillStyle = '#1c0c04';
  ctx.fillRect(cx - 7, 26, 7, 3);
  ctx.fillRect(cx + 1, 26, 7, 3);

  ctx.fillStyle = TC_D[owner];
  ctx.fillRect(cx - 14, 13, 7, 12);
  ctx.fillStyle = TC_M[owner];
  ctx.fillRect(cx - 13, 14, 5, 10);
  ctx.fillStyle = MT_M;
  ctx.fillRect(cx - 11, 17, 2, 2);

  ctx.fillStyle = TC_D[owner];
  ctx.beginPath();
  ctx.moveTo(cx - 8, 11);
  ctx.lineTo(cx + 9, 11);
  ctx.lineTo(cx + 8, 23);
  ctx.lineTo(cx - 7, 23);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = TC_M[owner];
  ctx.fillRect(cx - 5, 13, 11, 3);

  ctx.fillStyle = WD_D;
  ctx.fillRect(cx + 8, 5, 3, 17);
  ctx.fillStyle = MT_M;
  ctx.beginPath();
  ctx.moveTo(cx + 8, 6);
  ctx.lineTo(cx + 18, 3);
  ctx.lineTo(cx + 18, 14);
  ctx.lineTo(cx + 8, 15);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = MT_HL;
  ctx.fillRect(cx + 9, 4, 8, 2);

  ctx.fillStyle = ORC_SKIN_D;
  ctx.beginPath();
  ctx.arc(cx + 1, 8, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = MT_D;
  ctx.beginPath();
  ctx.arc(cx + 1, 6, 8, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = ORC_SKIN_M;
  ctx.beginPath();
  ctx.arc(cx + 1, 10, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ORC_TUSK;
  ctx.fillRect(cx - 4, 13, 3, 5);
  ctx.fillRect(cx + 3, 13, 3, 5);
  ctx.fillStyle = '#ff2020';
  ctx.fillRect(cx - 2, 10, 2, 2);
  ctx.fillRect(cx + 3, 10, 2, 2);

  return c;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORC BUILDINGS
// ═══════════════════════════════════════════════════════════════════════════════

function makeGreatHall(T: number, owner: 0 | 1): HTMLCanvasElement {
  const W = T * 3; const H = T * 3;
  const [c, ctx] = oc(W, H);

  // ── Darker, rougher stone base ──
  stoneTexture(ctx, 0, 0, W, H, '#1c1810', '#302818', '#484030', 9, 15);

  // ── Bone/spike decorations on corners ──
  const spike = (sx: number, sy: number) => {
    ctx.fillStyle = '#c0b080';
    ctx.beginPath();
    ctx.moveTo(sx, sy + 8);
    ctx.lineTo(sx + 3, sy);
    ctx.lineTo(sx + 6, sy + 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e0d0a0';
    ctx.fillRect(sx + 2, sy, 2, 5);
  };
  for (const [sx, sy] of [[4,2],[12,0],[20,2],[W-26,2],[W-18,0],[W-10,2]]) spike(sx, sy);

  // ── Corner towers (rougher than human) ──
  const orcTower = (tx: number, ty: number, tr: number) => {
    ctx.fillStyle = '#2a2018';
    ctx.beginPath();
    ctx.arc(tx, ty, tr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3c3020';
    ctx.beginPath();
    ctx.arc(tx - 2, ty - 2, tr - 3, 0, Math.PI * 2);
    ctx.fill();
    // Spikes around top
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2;
      ctx.fillStyle = ORC_TUSK;
      ctx.beginPath();
      ctx.moveTo(tx + Math.cos(ang) * (tr - 1), ty + Math.sin(ang) * (tr - 1));
      ctx.lineTo(tx + Math.cos(ang) * (tr + 4), ty + Math.sin(ang) * (tr + 4));
      ctx.lineTo(tx + Math.cos(ang + 0.3) * (tr - 1), ty + Math.sin(ang + 0.3) * (tr - 1));
      ctx.fill();
    }
    // Team color banner
    ctx.fillStyle = TC_D[owner];
    ctx.fillRect(tx - 1, ty - tr - 8, 2, 8);
    ctx.fillStyle = TC_M[owner];
    ctx.beginPath();
    ctx.moveTo(tx + 1, ty - tr - 8);
    ctx.lineTo(tx + 7, ty - tr - 5);
    ctx.lineTo(tx + 1, ty - tr - 2);
    ctx.fill();
  };
  orcTower(14, 14, 12);
  orcTower(W - 14, 14, 12);
  orcTower(14, H - 14, 11);
  orcTower(W - 14, H - 14, 11);

  // ── Central hall ──
  ctx.fillStyle = '#302010';
  ctx.fillRect(22, 22, W - 44, H - 44);
  ctx.fillStyle = '#281808';
  ctx.fillRect(W / 2 - 3, 22, 6, H - 44);

  // ── Skull gate at bottom ──
  ctx.fillStyle = '#100c08';
  ctx.beginPath();
  ctx.rect(W / 2 - 10, H - 22, 20, 22);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(W / 2, H - 22, 10, Math.PI, 0, false);
  ctx.fill();
  // Gate frame (bone colored)
  ctx.strokeStyle = '#c0a868'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(W / 2, H - 22, 10, Math.PI, 0, false);
  ctx.stroke();
  ctx.strokeRect(W / 2 - 10, H - 22, 20, 22);

  // ── Team color orc banner above gate ──
  ctx.fillStyle = TC_D[owner];
  ctx.fillRect(W / 2 - 12, H - 36, 24, 10);
  ctx.fillStyle = TC_M[owner];
  ctx.fillRect(W / 2 - 10, H - 35, 20, 8);
  // Skull emblem on banner
  ctx.fillStyle = ORC_TUSK;
  ctx.beginPath();
  ctx.arc(W / 2, H - 31, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = TC_D[owner];
  ctx.fillRect(W / 2 - 2, H - 29, 2, 2);
  ctx.fillRect(W / 2 + 1, H - 29, 2, 2);

  // ── Window slits ──
  ctx.fillStyle = '#040404';
  for (const [wx, wy] of [[24, 30], [W-28, 30], [24, H-36], [W-28, H-36]]) {
    ctx.fillRect(wx, wy, 4, 8);
    ctx.fillRect(wx + 1, wy - 1, 2, 1);
  }

  // Bottom shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, H - 3, W, 3);
  ctx.fillRect(W - 3, 0, 3, H);

  return c;
}

function makeWarMill(T: number, owner: 0 | 1): HTMLCanvasElement {
  const W = T * 3; const H = T * 2;
  const [c, ctx] = oc(W, H);

  stoneTexture(ctx, 0, H - 16, W, 16, '#201808', '#342810', '#4a3818', 8, 12);

  ctx.fillStyle = '#24160a';
  ctx.fillRect(4, 10, W - 8, H - 18);
  ctx.fillStyle = WD_D;
  for (let x = 8; x < W - 8; x += 10) {
    ctx.fillRect(x, 10, 5, H - 18);
  }
  ctx.fillStyle = WD_M;
  for (let y = 14; y < H - 10; y += 8) {
    ctx.fillRect(4, y, W - 8, 2);
  }

  ctx.fillStyle = '#362010';
  ctx.beginPath();
  ctx.moveTo(2, 14);
  ctx.lineTo(W / 2, 2);
  ctx.lineTo(W - 2, 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#4a2c18';
  ctx.beginPath();
  ctx.moveTo(6, 14);
  ctx.lineTo(W / 2, 5);
  ctx.lineTo(W - 6, 14);
  ctx.closePath();
  ctx.fill();

  for (const sx of [10, 24, 38, 52, 66, 80]) {
    ctx.fillStyle = ORC_TUSK;
    ctx.beginPath();
    ctx.moveTo(sx, 8);
    ctx.lineTo(sx + 2, 0);
    ctx.lineTo(sx + 5, 8);
    ctx.fill();
  }

  const wheelCx = 20;
  const wheelCy = H - 18;
  ctx.strokeStyle = '#1f1208';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(wheelCx, wheelCy, 11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = WD_M;
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8;
    ctx.beginPath();
    ctx.moveTo(wheelCx, wheelCy);
    ctx.lineTo(wheelCx + Math.cos(a) * 10, wheelCy + Math.sin(a) * 10);
    ctx.stroke();
  }
  ctx.fillStyle = MT_M;
  ctx.beginPath();
  ctx.arc(wheelCx, wheelCy, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#120804';
  ctx.fillRect(W - 26, H - 34, 12, 18);
  ctx.fillRect(W - 44, H - 30, 9, 13);
  ctx.fillStyle = '#3a2616';
  ctx.fillRect(W - 23, H - 44, 7, 12);
  ctx.fillRect(W - 41, H - 39, 5, 10);

  ctx.fillStyle = WD_D;
  ctx.fillRect(W - 30, H - 15, 24, 4);
  ctx.fillRect(W - 26, H - 19, 18, 4);
  ctx.fillStyle = WD_L;
  ctx.fillRect(W - 32, H - 15, 2, 9);
  ctx.fillRect(W - 10, H - 15, 2, 9);
  ctx.fillRect(W - 36, H - 11, 30, 3);

  ctx.fillStyle = TC_M[owner];
  ctx.fillRect(W / 2 - 2, 4, 4, 10);
  ctx.fillStyle = WD_D;
  ctx.fillRect(W / 2 + 14, 4, 2, 16);
  ctx.fillStyle = TC_M[owner];
  ctx.beginPath();
  ctx.moveTo(W / 2 + 16, 5);
  ctx.lineTo(W / 2 + 26, 10);
  ctx.lineTo(W / 2 + 16, 15);
  ctx.fill();

  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(0, H - 2, W, 2);

  return c;
}

function makePigsty(T: number, owner: 0 | 1): HTMLCanvasElement {
  const W = T * 2; const H = T * 2;
  const [c, ctx] = oc(W, H);

  // ── Muddy ground ──
  ctx.fillStyle = '#3a2808';
  ctx.fillRect(0, 0, W, H);
  // Mud patches
  const r = rng(9999);
  for (let i = 0; i < 20; i++) {
    ctx.fillStyle = r() > 0.5 ? '#4a3410' : '#2a1c04';
    ctx.fillRect(
      Math.floor(r() * (W - 4)),
      Math.floor(r() * (H - 4)), 4, 3,
    );
  }

  // ── Crude plank fence ──
  ctx.fillStyle = WD_D;
  ctx.fillRect(0, 0, W, 3);
  ctx.fillRect(0, H - 3, W, 3);
  ctx.fillRect(0, 0, 3, H);
  ctx.fillRect(W - 3, 0, 3, H);
  // Fence posts (rough, uneven)
  ctx.fillStyle = WD_M;
  for (let x = 0; x < W; x += 9) ctx.fillRect(x, 0, 3, H);
  ctx.fillStyle = WD_D;
  for (let y = 9; y < H - 9; y += 9) ctx.fillRect(0, y, W, 2);

  // ── Ramshackle sty building (upper right) ──
  ctx.fillStyle = WD_D;
  ctx.fillRect(W / 2, 0, W / 2 - 1, H / 2 + 4);
  stoneTexture(ctx, W / 2 + 1, 1, W / 2 - 3, H / 2 + 2, '#2a1808', WD_D, WD_M, 6, 7);
  // Crude thatched roof
  ctx.fillStyle = '#6a5020';
  ctx.beginPath();
  ctx.moveTo(W / 2, H / 2 - 4);
  ctx.lineTo(W - 2, H / 2 - 4);
  ctx.lineTo(W - 2, 0);
  ctx.lineTo(W / 2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#8a6828';
  ctx.fillRect(W / 2, 0, W / 2 - 2, 4);
  // Team color rag on post
  ctx.fillStyle = WD_D;
  ctx.fillRect(W - 6, 0, 2, 14);
  ctx.fillStyle = TC_M[owner];
  ctx.beginPath();
  ctx.moveTo(W - 4, 2); ctx.lineTo(W - 4, 10); ctx.lineTo(W + 2, 6); ctx.closePath();
  ctx.fill();

  // ── Two pig shapes ──
  const pig = (px: number, py: number) => {
    ctx.fillStyle = '#e0a0a0';
    ctx.beginPath();
    ctx.ellipse(px, py, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px - 5, py - 1, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c08080';
    ctx.beginPath();
    ctx.arc(px - 6, py - 1, 2, 0, Math.PI * 2);
    ctx.fill();
    // Legs
    ctx.fillStyle = '#c08080';
    ctx.fillRect(px - 4, py + 3, 2, 3);
    ctx.fillRect(px + 1, py + 3, 2, 3);
  };
  pig(10, 42);
  pig(24, 52);

  return c;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

export function buildSpriteCache(T: number): SpriteCache {
  return {
    // Terrain
    grass:    makeGrass(T),
    tree:     makeTree(T),
    water:    [0, 1, 2, 3].map(f => makeWater(T, f)),
    rock:     makeRock(T),
    goldtile: makeGoldTile(T),
    // Human units
    worker:   [makeWorker(T, 0), makeWorker(T, 1)],
    footman:  [makeFootman(T, 0), makeFootman(T, 1)],
    archer:   [makeArcher(T, 0), makeArcher(T, 1)],
    knight:   [makeKnight(T, 0), makeKnight(T, 1)],
    // Orc units
    peon:     [makePeon(T, 0),  makePeon(T, 1)],
    grunt:    [makeGrunt(T, 0), makeGrunt(T, 1)],
    troll:    [makeTroll(T, 0), makeTroll(T, 1)],
    ogreFighter: [makeOgreFighter(T, 0), makeOgreFighter(T, 1)],
    // Human buildings
    townhall: [makeTownhall(T, 0), makeTownhall(T, 1)],
    barracks: [makeBarracks(T, 0), makeBarracks(T, 1)],
    lumbermill: [makeLumberMill(T, 0), makeLumberMill(T, 1)],
    farm:     [makeFarm(T, 0), makeFarm(T, 1)],
    wall:     [makeWall(T, 0), makeWall(T, 1)],
    tower:    [makeTower(T, 0, false), makeTower(T, 1, false)],
    // Orc buildings
    greathall: [makeGreatHall(T, 0), makeGreatHall(T, 1)],
    warmill:   [makeWarMill(T, 0),   makeWarMill(T, 1)],
    pigsty:    [makePigsty(T, 0),    makePigsty(T, 1)],
    watchtower:[makeTower(T, 0, true), makeTower(T, 1, true)],
    // Neutral
    barrier:  makeBarrier(T),
    goldmine: makeGoldmine(T),
    // FX
    corpse:   makeCorpse(T),
  };
}
