import type { GameState, TileKind, Entity } from '../types';
import { TILE_SIZE, MAP_W, MAP_H, CORPSE_LIFE_TICKS, isUnitKind, isNeutralOwner, usesRaceProfile } from '../types';
import { ticksPerStep } from '../data/units';
import type { Camera } from './camera';
import { worldToScreen } from './camera';
import { buildSpriteCache, type SpriteCache } from './sprites';
import { t } from '../i18n';

// ─── Sprite cache (built once on first render) ────────────────────────────────

let sprites: SpriteCache | null = null;
function getSprites(): SpriteCache {
  if (!sprites) sprites = buildSpriteCache(TILE_SIZE);
  return sprites;
}

interface UnitRenderState {
  facingX: -1 | 0 | 1;
}

interface UnitMotionSample {
  nextX: number;
  nextY: number;
  progress: number;
}

const unitRenderCache = new Map<number, UnitRenderState>();

function getUnitMotionSample(
  e: Entity,
  state: GameState,
  alpha: number,
): UnitMotionSample | null {
  if (!e.cmd) return null;

  let next: { x: number; y: number } | null = null;
  let tps = ticksPerStep(e.kind, usesRaceProfile(e.owner) ? state.races[e.owner] : null);
  let stepTick = state.tick;

  if (e.cmd.type === 'move') {
    if (e.cmd.path.length === 0) return null;
    next = e.cmd.path[0]!;
    const baseTps = ticksPerStep(e.kind, usesRaceProfile(e.owner) ? state.races[e.owner] : null);
    const speedBoostActive =
      typeof e.cmd.speedMult === 'number' &&
      e.cmd.speedMult > 1 &&
      typeof e.cmd.speedMultUntilTick === 'number' &&
      state.tick <= e.cmd.speedMultUntilTick;
    const speedMult = e.cmd.speedMult ?? 1;
    tps = speedBoostActive
      ? Math.max(1, Math.floor(baseTps / speedMult))
      : baseTps;
    stepTick = e.cmd.stepTick;
  } else if (e.cmd.type === 'attack') {
    if (e.cmd.chasePath.length === 0) return null;
    next = e.cmd.chasePath[0]!;
    stepTick = e.cmd.chaseStepTick;
  } else if (e.cmd.type === 'gather') {
    if (e.cmd.phase !== 'toresource' && e.cmd.phase !== 'returning') return null;
    const gatherPath = (e as Entity & { _gatherPath?: { x: number; y: number }[] })._gatherPath;
    if (!Array.isArray(gatherPath) || gatherPath.length === 0) return null;
    next = gatherPath[0]!;
    stepTick = e.cmd.waitTicks;
  } else if (e.cmd.type === 'build') {
    if (e.cmd.phase !== 'moving') return null;
    const buildPath = (e as Entity & { _buildPath?: { x: number; y: number }[] })._buildPath;
    if (!Array.isArray(buildPath) || buildPath.length === 0) return null;
    next = buildPath[0]!;
    tps = ticksPerStep(e.kind);
    stepTick = e.cmd.stepTick;
  }

  if (!next) return null;

  const elapsedTicks = Math.max(0, state.tick - stepTick) + alpha;
  const progress = Math.max(0, Math.min(1, elapsedTicks / Math.max(1, tps)));
  return {
    nextX: next.x,
    nextY: next.y,
    progress,
  };
}

/** Call when starting a new game so the minimap terrain cache regenerates. */
export function resetRenderCache(): void {
  minimapTerrain = null;
  unitRenderCache.clear();
  // sprites are race-independent (all races baked in) so no reset needed
}

// ─── Visual constants ─────────────────────────────────────────────────────────

const SELECTION_COLOR = '#00ff88';
const FOG_UNSEEN      = 'rgba(0,0,0,1.00)';
const FOG_EXPLORED    = 'rgba(0,0,0,0.58)';
const GRID_COLOR      = 'rgba(0,0,0,0.07)';

// ─── Minimap constants (exported so game.ts can share them) ──────────────────

export const MINI_SCALE = 2;                    // px per map tile
export const MINI_W     = MAP_W * MINI_SCALE;   // 128
export const MINI_H     = MAP_H * MINI_SCALE;   // 128
export const MINI_PAD   = 8;                    // gap from canvas edges

/** Terrain colours for the minimap — one fill per tile kind */
const MINI_TILE_COLORS: Record<TileKind, string> = {
  grass:    '#3a6a2a',
  tree:     '#1a4010',
  water:    '#1a2a6a',
  rock:     '#5a5050',
  goldmine: '#7a6a10',
};

// ─── Minimap terrain cache (built once, tiles never change) ──────────────────

let minimapTerrain: HTMLCanvasElement | null = null;
let minimapTerrainSignature = '';

function buildMinimapTerrainSignature(state: GameState): string {
  const rows: string[] = [];
  for (let ty = 0; ty < MAP_H; ty++) {
    let row = '';
    for (let tx = 0; tx < MAP_W; tx++) {
      const tile = state.tiles[ty][tx];
      row += tile.kind[0] + (tile.watchPost ? '1' : '0');
    }
    rows.push(row);
  }
  return rows.join('|');
}

function buildMinimapTerrain(state: GameState): HTMLCanvasElement {
  const mc    = document.createElement('canvas');
  mc.width    = MINI_W;
  mc.height   = MINI_H;
  const mctx  = mc.getContext('2d')!;
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const tile = state.tiles[ty][tx];
      mctx.fillStyle = MINI_TILE_COLORS[tile.kind];
      mctx.fillRect(tx * MINI_SCALE, ty * MINI_SCALE, MINI_SCALE, MINI_SCALE);
      if (tile.watchPost) {
        mctx.fillStyle = '#f4d35e';
        mctx.fillRect(tx * MINI_SCALE, ty * MINI_SCALE, MINI_SCALE, MINI_SCALE);
      }
    }
  }
  return mc;
}

// ─── Main render ──────────────────────────────────────────────────────────────

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cam: Camera,
  viewW: number,
  viewH: number,
  selectedIds: Set<number>,
  myOwner: 0 | 1 = 0,
  alpha = 1,
): void {
  const sp = getSprites();

  ctx.clearRect(0, 0, viewW, viewH);
  // Crisp pixel rendering for retro look
  ctx.imageSmoothingEnabled = false;

  drawTiles(ctx, sp, state, cam, viewW, viewH);
  drawCorpses(ctx, sp, state, cam);
  drawEntities(ctx, sp, state, cam, selectedIds, myOwner, alpha);
  drawCombatVisuals(ctx, state, cam, myOwner);
  drawRallyPoints(ctx, state, cam, selectedIds, myOwner);
  drawFog(ctx, state, cam, viewW, viewH);
  drawHUD(ctx, state, myOwner);
}

// ─── Minimap ──────────────────────────────────────────────────────────────────

/**
 * Draw the 128×128 minimap in the bottom-right corner of the game viewport.
 * Call AFTER render() so it sits on top of the game view.
 */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cam: Camera,
  viewW: number,
  viewH_game: number,
  myOwner: 0 | 1 = 0,
): void {
  const nextSignature = buildMinimapTerrainSignature(state);
  if (!minimapTerrain || minimapTerrainSignature !== nextSignature) {
    minimapTerrain = buildMinimapTerrain(state);
    minimapTerrainSignature = nextSignature;
  }

  const MX = viewW      - MINI_W - MINI_PAD;
  const MY = viewH_game - MINI_H - MINI_PAD;

  // ── Border frame ─────────────────────────────────────────────────────────
  ctx.fillStyle   = '#111';
  ctx.fillRect(MX - 3, MY - 3, MINI_W + 6, MINI_H + 6);
  ctx.strokeStyle = '#666';
  ctx.lineWidth   = 1;
  ctx.strokeRect(MX - 2.5, MY - 2.5, MINI_W + 5, MINI_H + 5);
  ctx.strokeStyle = '#333';
  ctx.strokeRect(MX - 1.5, MY - 1.5, MINI_W + 3, MINI_H + 3);

  // ── Terrain layer ─────────────────────────────────────────────────────────
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(minimapTerrain, MX, MY);

  // ── Fog overlay ───────────────────────────────────────────────────────────
  // 4096 fillRect calls per frame — well within 60fps budget
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const fog = state.fog[ty][tx];
      if (fog === 'visible') continue;
      ctx.fillStyle = fog === 'unseen'
        ? 'rgba(0,0,0,0.95)'
        : 'rgba(0,0,0,0.50)';
      ctx.fillRect(MX + tx * MINI_SCALE, MY + ty * MINI_SCALE, MINI_SCALE, MINI_SCALE);
    }
  }

  // ── Entity dots ───────────────────────────────────────────────────────────
  for (const e of state.entities) {
    if (e.kind === 'goldmine') {
      // Show once explored
      const fog = state.fog[Math.min(MAP_H - 1, e.pos.y)][Math.min(MAP_W - 1, e.pos.x)];
      if (fog === 'unseen') continue;
      ctx.fillStyle = '#ffe840';
    } else if (isNeutralOwner(e.owner)) {
      ctx.fillStyle = '#b8b8b8';
    } else if (e.owner !== myOwner) {
      // Enemy: obey fog rules (same as entityVisible in main render)
      const cy  = Math.min(MAP_H - 1, Math.max(0, e.pos.y + Math.floor(e.tileH / 2)));
      const cx  = Math.min(MAP_W - 1, Math.max(0, e.pos.x + Math.floor(e.tileW / 2)));
      const fog = state.fog[cy][cx];
      if (isUnitKind(e.kind) && fog !== 'visible') continue;
      if (!isUnitKind(e.kind) && fog === 'unseen') continue;
      ctx.fillStyle = '#ff4444';
    } else {
      ctx.fillStyle = '#4488ff'; // own units
    }

    // Units → 2×2 dot; buildings → scaled to footprint
    const dw = isUnitKind(e.kind) ? MINI_SCALE : e.tileW * MINI_SCALE;
    const dh = isUnitKind(e.kind) ? MINI_SCALE : e.tileH * MINI_SCALE;
    ctx.fillRect(
      MX + e.pos.x * MINI_SCALE,
      MY + e.pos.y * MINI_SCALE,
      dw, dh,
    );
  }

  // ── Camera viewport rectangle ─────────────────────────────────────────────
  const vx = (cam.x / TILE_SIZE) * MINI_SCALE;
  const vy = (cam.y / TILE_SIZE) * MINI_SCALE;
  const vw = (viewW      / TILE_SIZE) * MINI_SCALE;
  const vh = (viewH_game / TILE_SIZE) * MINI_SCALE;
  ctx.strokeStyle = 'rgba(255,255,255,0.80)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(MX + vx, MY + vy, vw, vh);

  // ── Label ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.font      = '9px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('MAP', MX + MINI_W - 2, MY + MINI_H - 2);
  ctx.textAlign = 'left';
}

// ─── Tiles ────────────────────────────────────────────────────────────────────

function tileSprite(sp: SpriteCache, kind: TileKind, tick: number): HTMLCanvasElement {
  switch (kind) {
    case 'grass':    return sp.grass;
    case 'tree':     return sp.tree;
    case 'water':    return sp.water[Math.floor(tick / 10) % 4];
    case 'rock':     return sp.rock;
    case 'goldmine': return sp.goldtile;
    default:         return sp.grass;
  }
}

function drawTiles(
  ctx: CanvasRenderingContext2D,
  sp: SpriteCache,
  state: GameState,
  cam: Camera,
  viewW: number,
  viewH: number,
): void {
  const startTX = Math.max(0, Math.floor(cam.x / TILE_SIZE));
  const startTY = Math.max(0, Math.floor(cam.y / TILE_SIZE));
  const endTX   = Math.min(MAP_W - 1, startTX + Math.ceil(viewW / TILE_SIZE) + 1);
  const endTY   = Math.min(MAP_H - 1, startTY + Math.ceil(viewH / TILE_SIZE) + 1);

  for (let ty = startTY; ty <= endTY; ty++) {
    for (let tx = startTX; tx <= endTX; tx++) {
      const tile = state.tiles[ty][tx];
      const { sx, sy } = worldToScreen(tx * TILE_SIZE, ty * TILE_SIZE, cam);
      ctx.drawImage(tileSprite(sp, tile.kind, state.tick), sx, sy, TILE_SIZE, TILE_SIZE);
      if (tile.watchPost) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 232, 120, 0.9)';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx + 7.5, sy + 7.5, TILE_SIZE - 15, TILE_SIZE - 15);
        ctx.beginPath();
        ctx.moveTo(sx + TILE_SIZE / 2, sy + 8);
        ctx.lineTo(sx + TILE_SIZE / 2, sy + TILE_SIZE - 8);
        ctx.moveTo(sx + 8, sy + TILE_SIZE / 2);
        ctx.lineTo(sx + TILE_SIZE - 8, sy + TILE_SIZE / 2);
        ctx.stroke();
        ctx.restore();
      }
      // Subtle grid line
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    }
  }
}

// ─── Corpses ──────────────────────────────────────────────────────────────────

function drawCorpses(
  ctx: CanvasRenderingContext2D,
  sp: SpriteCache,
  state: GameState,
  cam: Camera,
): void {
  for (const c of state.corpses) {
    const age   = state.tick - c.deadTick;
    const alpha = Math.max(0, 1 - age / CORPSE_LIFE_TICKS);
    if (alpha <= 0) continue;
    const { sx, sy } = worldToScreen(c.pos.x * TILE_SIZE, c.pos.y * TILE_SIZE, cam);
    ctx.save();
    ctx.globalAlpha = alpha * 0.75;
    ctx.drawImage(sp.corpse, sx, sy, TILE_SIZE, TILE_SIZE);
    ctx.restore();
  }
}

// ─── Entities ─────────────────────────────────────────────────────────────────

/**
 * Fog visibility rules (WC2-style):
 *  - Own units/buildings: always visible
 *  - Gold mines: visible once explored
 *  - Enemy units: visible only in 'visible' fog cells
 *  - Enemy buildings: visible once explored (remembered after scouting)
 */
function entityVisible(state: GameState, e: Entity, myOwner: 0 | 1): boolean {
  // Player's own entities (not goldmines) are always visible
  if (e.owner === myOwner && e.kind !== 'goldmine') return true;
  const cx    = Math.min(MAP_W - 1, Math.max(0, e.pos.x + Math.floor(e.tileW / 2)));
  const cy    = Math.min(MAP_H - 1, Math.max(0, e.pos.y + Math.floor(e.tileH / 2)));
  const fog   = state.fog[cy][cx];
  const enemy = !isNeutralOwner(e.owner) && e.owner !== myOwner;
  // Enemy units only visible in actively-visible cells
  if (enemy && isUnitKind(e.kind)) return fog === 'visible';
  // Everything else (buildings, mines) visible once explored
  return fog !== 'unseen';
}

function drawEntities(
  ctx: CanvasRenderingContext2D,
  sp: SpriteCache,
  state: GameState,
  cam: Camera,
  selectedIds: Set<number>,
  myOwner: 0 | 1 = 0,
  alpha = 1,
): void {
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  const visibleUnitIds = new Set<number>();

  for (const e of state.entities) {
    if (!isUnitKind(e.kind)) continue;
    visibleUnitIds.add(e.id);
  }

  for (const id of unitRenderCache.keys()) {
    if (!visibleUnitIds.has(id)) unitRenderCache.delete(id);
  }

  // Draw buildings first, units on top
  for (const pass of [false, true] as const) {
    for (const e of state.entities) {
      if (!entityVisible(state, e, myOwner)) continue;
      const isUnit = isUnitKind(e.kind);
      if (isUnit !== pass) continue;

      let renderX = e.pos.x;
      let renderY = e.pos.y;
      let stepProgress = 0;
      let moving = false;
      let renderState: UnitRenderState | undefined;
      if (isUnit) {
        renderState = unitRenderCache.get(e.id);
        if (!renderState) {
          renderState = { facingX: 0 };
          unitRenderCache.set(e.id, renderState);
        }

        const motion = getUnitMotionSample(e, state, clampedAlpha);
        if (motion) {
          const dx = motion.nextX - e.pos.x;
          if (dx !== 0) renderState.facingX = dx > 0 ? 1 : -1;

          renderX = e.pos.x + (motion.nextX - e.pos.x) * motion.progress;
          renderY = e.pos.y + (motion.nextY - e.pos.y) * motion.progress;
          stepProgress = motion.progress;
          moving = true;
        }
      }

      const wx = renderX * TILE_SIZE;
      const wy = renderY * TILE_SIZE;
      const { sx, sy } = worldToScreen(wx, wy, cam);
      const selected = selectedIds.has(e.id);
      const pw = e.tileW * TILE_SIZE;
      const ph = e.tileH * TILE_SIZE;

      if (isUnit) {
        drawUnit(ctx, sp, e, sx, sy, selected, renderState, stepProgress, moving);
      } else {
        drawBuilding(ctx, sp, e, sx, sy, pw, ph, selected, state);
      }
    }
  }
}

function drawCombatVisuals(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cam: Camera,
  myOwner: 0 | 1,
): void {
  const attackEvents = state.recentAttackEvents ?? [];
  const entityById = state.entityById;
  for (const ev of attackEvents) {
    const age = state.tick - ev.tick;
    if (age < 0 || age > 8) continue;

    const attacker = entityById?.get(ev.attackerId) ?? state.entities.find(e => e.id === ev.attackerId);
    const target = entityById?.get(ev.targetId) ?? state.entities.find(e => e.id === ev.targetId);

    if (attacker && entityVisible(state, attacker, myOwner)) {
      const { sx, sy } = worldToScreen(attacker.pos.x * TILE_SIZE, attacker.pos.y * TILE_SIZE, cam);
      const alpha = Math.max(0, 1 - age / 8);
      const pulse = 0.55 + 0.45 * (1 - age / 8);
      ctx.save();
      ctx.strokeStyle = ev.ranged
        ? `rgba(255, 226, 120, ${0.55 * alpha})`
        : `rgba(255, 150, 120, ${0.55 * alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx + TILE_SIZE / 2, sy + TILE_SIZE / 2, TILE_SIZE * pulse * 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (target && entityVisible(state, target, myOwner)) {
      const tx = target.pos.x * TILE_SIZE + (target.tileW * TILE_SIZE) / 2;
      const ty = target.pos.y * TILE_SIZE + (target.tileH * TILE_SIZE) / 2;
      const { sx, sy } = worldToScreen(tx, ty, cam);
      const alpha = Math.max(0, 1 - age / 8);
      const radius = 4 + age * 1.4;
      ctx.save();
      ctx.strokeStyle = `rgba(255, 245, 210, ${0.75 * alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  const projectileEvents = state.recentProjectileEvents ?? [];
  for (const ev of projectileEvents) {
    const age = state.tick - ev.startTick;
    if (age < 0 || age > ev.durationTicks + 4) continue;

    const progress = Math.min(1, age / Math.max(1, ev.durationTicks));
    const px = (ev.start.x + (ev.end.x - ev.start.x) * progress) * TILE_SIZE;
    const py = (ev.start.y + (ev.end.y - ev.start.y) * progress) * TILE_SIZE;
    const { sx, sy } = worldToScreen(px, py, cam);

    if (progress < 1) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 232, 96, 0.95)';
      ctx.beginPath();
      ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx - 4, sy);
      ctx.lineTo(sx + 4, sy);
      ctx.stroke();
      ctx.restore();
      continue;
    }

    const impactAge = age - ev.durationTicks;
    const impactAlpha = Math.max(0, 1 - impactAge / 4);
    if (impactAlpha <= 0) continue;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 240, 180, ${0.75 * impactAlpha})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx - 4, sy - 4);
    ctx.lineTo(sx + 4, sy + 4);
    ctx.moveTo(sx + 4, sy - 4);
    ctx.lineTo(sx - 4, sy + 4);
    ctx.stroke();
    ctx.restore();
  }
}

function drawUnit(
  ctx: CanvasRenderingContext2D,
  sp: SpriteCache,
  e: Entity,
  sx: number, sy: number,
  selected: boolean,
  renderState?: UnitRenderState,
  stepProgress = 0,
  moving = false,
): void {
  const facingX = renderState?.facingX ?? 0;
  const bobOffset = moving ? Math.round(Math.sin(Math.min(1, stepProgress) * Math.PI) * -1) : 0;
  const bodySx = Math.round(sx);
  const bodySy = Math.round(sy + bobOffset);
  const cx = bodySx + TILE_SIZE / 2;
  const cy = bodySy + TILE_SIZE / 2;

  // Selection ring
  if (selected) {
    ctx.beginPath();
    ctx.arc(cx, cy, TILE_SIZE * 0.48, 0, Math.PI * 2);
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Sprite (covers both races)
  const spriteSheet =
    e.kind === 'worker'       ? sp.worker       :
    e.kind === 'footman'      ? sp.footman      :
    e.kind === 'archer'       ? sp.archer       :
    e.kind === 'knight'       ? sp.knight       :
    e.kind === 'peon'         ? sp.peon         :
    e.kind === 'grunt'        ? sp.grunt        :
    e.kind === 'troll'        ? sp.troll        :
                               sp.ogreFighter;
  const sprite = spriteSheet[e.owner as 0 | 1];
  ctx.save();
  if (facingX < 0) {
    ctx.translate(bodySx + TILE_SIZE, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(sprite, 0, bodySy, TILE_SIZE, TILE_SIZE);
  } else {
    ctx.drawImage(sprite, bodySx, bodySy, TILE_SIZE, TILE_SIZE);
  }
  ctx.restore();

  if (moving && facingX !== 0) {
    const dirColor = isNeutralOwner(e.owner)
      ? 'rgba(210, 210, 210, 0.35)'
      : e.owner === 0
        ? 'rgba(128, 184, 255, 0.35)'
        : 'rgba(255, 176, 176, 0.35)';
    ctx.fillStyle = dirColor;
    const tipX = facingX > 0 ? bodySx + TILE_SIZE - 2 : bodySx + 2;
    ctx.beginPath();
    ctx.moveTo(tipX, bodySy + TILE_SIZE / 2);
    ctx.lineTo(tipX - facingX * 4, bodySy + TILE_SIZE / 2 - 3);
    ctx.lineTo(tipX - facingX * 4, bodySy + TILE_SIZE / 2 + 3);
    ctx.closePath();
    ctx.fill();
  }

  // HP bar
  drawHpBar(ctx, bodySx, bodySy, TILE_SIZE, 3, e.hp / e.hpMax);

  // Small carrying-gold indicator
  if (e.carryGold) {
    ctx.fillStyle = '#ffe840';
    ctx.beginPath();
    ctx.arc(bodySx + TILE_SIZE - 4, bodySy + 4, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (e.carryWood) {
    ctx.fillStyle = '#79c85b';
    ctx.fillRect(bodySx + TILE_SIZE - 8, bodySy + 1, 6, 6);
  }

  // Quick role readability
  if (e.kind === 'archer' || e.kind === 'troll') {
    ctx.strokeStyle = 'rgba(255, 232, 64, 0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(bodySx + TILE_SIZE / 2, bodySy + TILE_SIZE / 2, TILE_SIZE * 0.22, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (e.kind === 'knight' || e.kind === 'ogreFighter') {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bodySx + 6.5, bodySy + 6.5, TILE_SIZE - 13, TILE_SIZE - 13);
  }
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  sp: SpriteCache,
  e: Entity,
  sx: number, sy: number,
  pw: number, ph: number,
  selected: boolean,
  state: GameState,
): void {
  // Selection ring
  if (selected) {
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 2;
    ctx.strokeRect(sx - 2, sy - 2, pw + 4, ph + 4);
  }

  // For construction scaffolds, render the target building's sprite at
  // partial opacity; a full scaffolding overlay always shows on top.
  const isConstruction = e.kind === 'construction';
  const renderKind     = isConstruction ? (e.constructionOf ?? 'barracks') : e.kind;

  if (isConstruction) {
    // Opacity scales from 30% (just started) to 80% (almost done)
    ctx.save();
    ctx.globalAlpha = 0.30 + 0.50 * (e.hp / Math.max(1, e.hpMax));
  }

  // Sprite — building look varies by owner's race
  const ownerRace = usesRaceProfile(e.owner) ? (state.races[e.owner] ?? 'human') : 'human';
  const isOrc     = ownerRace === 'orc';
  let sprite: HTMLCanvasElement;
  if (renderKind === 'goldmine') {
    sprite = sp.goldmine;
  } else if (renderKind === 'barrier') {
    sprite = sp.barrier;
  } else if (renderKind === 'lumbermill') {
    sprite = isOrc ? sp.warmill[e.owner as 0 | 1] : sp.lumbermill[e.owner as 0 | 1];
  } else if (renderKind === 'wall') {
    sprite = sp.wall[e.owner as 0 | 1];
  } else if (renderKind === 'townhall') {
    sprite = isOrc ? sp.greathall[e.owner as 0 | 1] : sp.townhall[e.owner as 0 | 1];
  } else if (renderKind === 'barracks') {
    sprite = isOrc ? sp.warmill[e.owner as 0 | 1]   : sp.barracks[e.owner as 0 | 1];
  } else if (renderKind === 'tower') {
    sprite = isOrc ? sp.watchtower[e.owner as 0 | 1] : sp.tower[e.owner as 0 | 1];
  } else {
    // farm / anything else
    sprite = isOrc ? sp.pigsty[e.owner as 0 | 1]    : sp.farm[e.owner as 0 | 1];
  }
  ctx.drawImage(sprite, sx, sy, pw, ph);

  // HP bar — for construction sites this doubles as a build-progress bar
  drawHpBar(ctx, sx, sy, pw, e.kind === 'wall' ? 3 : 5, e.hp / Math.max(1, e.hpMax));

  // Scaffolding overlay — always shown on construction sites
  if (isConstruction) {
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#c8b068';
    ctx.lineWidth = 1.5;
    for (let x = sx; x < sx + pw; x += 8) {
      ctx.beginPath(); ctx.moveTo(x, sy); ctx.lineTo(x + ph, sy + ph); ctx.stroke();
    }
    for (let y = sy; y < sy + ph; y += 8) {
      ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + pw, y + pw); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawHpBar(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number,
  w: number, h: number,
  frac: number,
): void {
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(sx, sy - h - 2, w, h);
  const col = frac > 0.6 ? '#38cc38' : frac > 0.3 ? '#d8c020' : '#cc2828';
  ctx.fillStyle = col;
  ctx.fillRect(sx, sy - h - 2, Math.round(w * frac), h);
}

// ─── Rally point markers ──────────────────────────────────────────────────────

/**
 * Draw a dashed line + gold flag for every selected production building
 * that has a rally point set. Drawn BEFORE fog so flags in dark territory
 * get covered naturally.
 */
function drawRallyPoints(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cam: Camera,
  selectedIds: Set<number>,
  myOwner: 0 | 1,
): void {
  for (const e of state.entities) {
    if (e.owner !== myOwner) continue;
    if (!e.rallyPoint) continue;
    if (e.kind !== 'townhall' && e.kind !== 'barracks') continue;
    if (!selectedIds.has(e.id)) continue; // only show for selected buildings

    // Building centre in screen coords
    const bCX = (e.pos.x + e.tileW / 2) * TILE_SIZE;
    const bCY = (e.pos.y + e.tileH / 2) * TILE_SIZE;
    const { sx: bsx, sy: bsy } = worldToScreen(bCX, bCY, cam);

    // Rally tile centre in screen coords
    const rCX = (e.rallyPoint.x + 0.5) * TILE_SIZE;
    const rCY = (e.rallyPoint.y + 0.5) * TILE_SIZE;
    const { sx: rsx, sy: rsy } = worldToScreen(rCX, rCY, cam);

    ctx.save();

    // Dashed line from building centre → rally tile
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,220,0,0.65)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(bsx, bsy);
    ctx.lineTo(rsx, rsy);
    ctx.stroke();
    ctx.setLineDash([]); // reset

    // Gold flag at rally point (pole + triangle pennant)
    ctx.fillStyle = '#c8a020';
    ctx.fillRect(rsx - 1, rsy - 12, 2, 14);     // pole
    ctx.fillStyle = '#ffe840';
    ctx.beginPath();
    ctx.moveTo(rsx + 1, rsy - 12);               // pennant
    ctx.lineTo(rsx + 9, rsy - 8);
    ctx.lineTo(rsx + 1, rsy - 4);
    ctx.closePath();
    ctx.fill();

    // Small dot at flag base
    ctx.fillStyle = '#c8a020';
    ctx.beginPath();
    ctx.arc(rsx, rsy + 2, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// ─── Fog ──────────────────────────────────────────────────────────────────────

function drawFog(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cam: Camera,
  viewW: number,
  viewH: number,
): void {
  const startTX = Math.max(0, Math.floor(cam.x / TILE_SIZE));
  const startTY = Math.max(0, Math.floor(cam.y / TILE_SIZE));
  const endTX   = Math.min(MAP_W - 1, startTX + Math.ceil(viewW / TILE_SIZE) + 1);
  const endTY   = Math.min(MAP_H - 1, startTY + Math.ceil(viewH / TILE_SIZE) + 1);

  for (let ty = startTY; ty <= endTY; ty++) {
    for (let tx = startTX; tx <= endTX; tx++) {
      const fog = state.fog[ty][tx];
      if (fog === 'visible') continue;
      const { sx, sy } = worldToScreen(tx * TILE_SIZE, ty * TILE_SIZE, cam);
      ctx.fillStyle = fog === 'unseen' ? FOG_UNSEEN : FOG_EXPLORED;
      ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
    }
  }
}

// ─── HUD ──────────────────────────────────────────────────────────────────────

function drawHUD(ctx: CanvasRenderingContext2D, state: GameState, myOwner: 0 | 1 = 0): void {
  const popFull = state.pop[myOwner] >= state.popCap[myOwner];
  const openingWindowTicks = Math.max(0, state.contestedMineBonusUntilTick - state.tick);
  // Backdrop
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(4, 4, 420, 36);
  // Gold icon (small yellow diamond)
  ctx.fillStyle = '#e8c828';
  ctx.beginPath();
  ctx.moveTo(14, 10); ctx.lineTo(19, 15); ctx.lineTo(14, 20); ctx.lineTo(9, 15);
  ctx.closePath();
  ctx.fill();
  // Text
  ctx.fillStyle = '#ffe97a';
  ctx.font = 'bold 13px monospace';
  ctx.fillText(`${state.gold[myOwner]}g`, 24, 20);
  ctx.fillStyle = '#8fdc6d';
  ctx.fillText(`${state.wood[myOwner]}w`, 24, 36);
  // Pop icon (small person silhouette)
  ctx.fillStyle = popFull ? '#ff5555' : '#55dd55';
  ctx.beginPath();
  ctx.arc(94, 11, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(90, 15, 8, 8);
  ctx.fillStyle = popFull ? '#ff8888' : '#88ff88';
  ctx.fillText(`${state.pop[myOwner]} / ${state.popCap[myOwner]}`, 106, 20);
  // Tick (small clock icon)
  ctx.fillStyle = '#888880';
  ctx.font = '11px monospace';
  ctx.fillText(`⏱ ${state.tick}`, 200, 20);

  // Map pressure hint
  const myTownHall = state.entities.find(e => e.owner === myOwner && e.kind === 'townhall');
  const enemyTownHall = state.entities.find(e => e.owner !== myOwner && e.kind === 'townhall');
  const contestedMines = state.entities.filter(e => {
    if (e.kind !== 'goldmine') return false;
    if (!myTownHall || !enemyTownHall) return e.pos.x > 16 && e.pos.x < 48;
    const myDist = Math.hypot(e.pos.x - myTownHall.pos.x, e.pos.y - myTownHall.pos.y);
    const enemyDist = Math.hypot(e.pos.x - enemyTownHall.pos.x, e.pos.y - enemyTownHall.pos.y);
    return e.pos.x > 16 && e.pos.x < 48 || Math.abs(myDist - enemyDist) <= 8;
  }).length;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '10px monospace';
  const mapLabel = state.mapName ?? t('map_label_fallback');
  const pressureHint = contestedMines >= 2
    ? t('pressure_hint_many')
    : contestedMines > 0
      ? t('pressure_hint_some')
      : t('pressure_hint_none');
  const openingHook = openingWindowTicks > 0
    ? `  |  ${t('opening_hook', { seconds: Math.ceil(openingWindowTicks / 20) })}`
    : '';
  ctx.fillText(`${mapLabel}  |  ${pressureHint}${openingHook}`, 4, 34);
}
