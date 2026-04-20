import { SIM_TICK_MS, TILE_SIZE, CORPSE_LIFE_TICKS, MINE_GOLD_INITIAL, SIM_HZ,
         isUnitKind, isWorkerKind, NEUTRAL, areHostile, type EntityKind, type Race, type MapId, type OpeningPlan, type AIDifficulty } from './types';
import { createWorld } from './sim/world';
import { spawnEntity, killEntity } from './sim/entities';
import { processCommand, issueMoveCommand, separateUnits, autoAttackPass } from './sim/commands';
import { issueAttackCommand } from './sim/combat';
import { issueGatherCommand, issueTrainCommand, issueBuildCommand, computePopCaps } from './sim/economy';
import { updateFog } from './sim/fogofwar';
import { createAI, tickAI, AIController } from './sim/ai';
import { profiler } from './sim/profiler';
import { render, drawMinimap, resetRenderCache, MINI_SCALE, MINI_W, MINI_H, MINI_PAD } from './render/renderer';
import { drawUi, drawGhostBuilding, UiButton } from './render/ui';
import { drawCommandMarkers, type CommandMarker } from './render/markers';
import { createCamera, clampCamera, screenToTile, screenToWorld } from './render/camera';
import { createKeyState } from './input/keyboard';
import { createMouseState } from './input/mouse';
import { STATS } from './data/units';
import { RACES } from './data/races';
import { buildMapById } from './data/maps';
import type { NetSession } from './net/session';
import { applyNetCmds, type NetCmd } from './net/netcmd';
import { t } from './i18n';

const CAM_SPEED   = 400;
const EDGE_ZONE   = 20;
const SELECT_DIST = TILE_SIZE * 0.6;
const UI_HEIGHT   = 96; // must match render/ui.ts PANEL_H
const OPENING_PLAN_LOCK_TICKS = SIM_HZ * 10;
const NET_DESYNC_CHECKSUM_INTERVAL_TICKS = SIM_HZ * 2;

function hashFNV1a(prev: number, str: string): number {
  let h = prev >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function cmdSignature(cmd: { type: string } | null): string {
  if (!cmd) return '-';
  const c = cmd as any;
  if (c.type === 'move') return `m:${c.goal?.x ?? 0},${c.goal?.y ?? 0}:${c.attackMove ? 1 : 0}:${c.path?.length ?? 0}`;
  if (c.type === 'attack') return `a:${c.targetId ?? -1}`;
  if (c.type === 'gather') return `g:${c.targetId ?? -1}:${c.resourceType ?? '?'}:${c.phase ?? '?'}:${c.waitTicks ?? 0}`;
  if (c.type === 'build') return `b:${c.building ?? '?'}:${c.pos?.x ?? 0},${c.pos?.y ?? 0}:${c.phase ?? '?'}`;
  if (c.type === 'train') return `t:${c.unit ?? '?'}:${c.ticksLeft ?? 0}:${c.queue?.length ?? 0}`;
  return c.type;
}

function computeDeterministicStateChecksum(state: { tick: number; entities: Array<{ id: number; owner: number; kind: string; pos: { x: number; y: number }; hp: number; cmd: { type: string } | null }>; gold: [number, number]; pop: [number, number]; popCap: [number, number] }): { tick: number; hashHex: string; entityCount: number } {
  let hash = 0x811c9dc5;
  hash = hashFNV1a(hash, `tick:${state.tick}|gold:${state.gold[0]},${state.gold[1]}|pop:${state.pop[0]},${state.pop[1]}|cap:${state.popCap[0]},${state.popCap[1]}`);
  const entities = [...state.entities].sort((a, b) => a.id - b.id);
  for (const e of entities) {
    hash = hashFNV1a(hash, `${e.id}|${e.owner}|${e.kind}|${e.pos.x},${e.pos.y}|${e.hp}|${cmdSignature(e.cmd)}`);
  }
  return { tick: state.tick, hashHex: hash.toString(16).padStart(8, '0'), entityCount: entities.length };
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface GameOptions {
  playerRace: Race;         // host's race → races[0] (same on both clients)
  guestRace?: Race;         // guest's race → races[1]; defaults to opposite if omitted
  mapId:      MapId;
  aiDifficulty?: AIDifficulty;
  net?:       NetSession;   // present → online 1v1, no AI
  myOwner?:   0 | 1;        // which owner this client controls (default 0)
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export function startGame(
  canvas: HTMLCanvasElement,
  options: GameOptions,
  onBackToMenu: () => void,
): void {
  const ctx = canvas.getContext('2d')!;

  // Reset cached render data from any prior game
  resetRenderCache();

  // In online mode guestRace is set from the handshake; offline defaults to opposite
  const aiRace: Race = options.guestRace ?? (options.playerRace === 'human' ? 'orc' : 'human');
  const mapData   = buildMapById(options.mapId);
  const state     = createWorld(mapData, [options.playerRace, aiRace]);
  // Camera starts at MY base: owner-0 → playerStart, owner-1 → aiStart
  const myStart   = (options.myOwner ?? 0) === 0 ? mapData.playerStart : mapData.aiStart;
  const cam       = createCamera(
    Math.max(0, myStart.x - 8),
    Math.max(0, myStart.y - 6),
  );
  const keysInput  = createKeyState();
  const mouseInput = createMouseState(canvas);
  const keys = keysInput.state;
  const mouse = mouseInput.state;

  const playerRC = RACES[options.playerRace];
  const aiRC     = RACES[aiRace];

  // ── Online / offline mode ──────────────────────────────────────────────────
  const net       = options.net ?? null;
  const myOwner   = options.myOwner ?? 0;
  const peerOwner = (myOwner === 0 ? 1 : 0) as 0 | 1;
  const myRC      = RACES[state.races[myOwner]];
  const commandMarkers: CommandMarker[] = [];
  let openingPlanFeedback: { plan: OpeningPlan; untilTick: number } | null = null;
  let lastNetChecksumLine = '';

  /**
   * Emit a command.
   * Offline: apply immediately.
   * Online: queue for delayed, symmetric mini-lockstep execution.
   */
  function pushMarker(kind: CommandMarker['kind'], tx: number, ty: number): void {
    commandMarkers.push({
      kind,
      wx: (tx + 0.5) * TILE_SIZE,
      wy: (ty + 0.5) * TILE_SIZE,
      createdAt: performance.now(),
      ttlMs: kind === 'attack' ? 420 : kind === 'error' ? 520 : kind === 'moveExact' ? 700 : 620,
      tileSize: kind === 'moveExact' ? TILE_SIZE : undefined,
    });
  }

  function showMoveRejectedMarker(tx: number, ty: number): void {
    pushMarker('error', tx, ty);
  }

  function emit(cmd: NetCmd): void {
    if (cmd.k === 'move') {
      pushMarker('move', cmd.tx, cmd.ty);
      if (cmd.ids.length === 1) pushMarker('moveExact', cmd.tx, cmd.ty);
    }
    else if (cmd.k === 'attack') {
      const target = state.entityById?.get(cmd.targetId);
      if (target) pushMarker('attack', target.pos.x + Math.floor(target.tileW / 2), target.pos.y + Math.floor(target.tileH / 2));
    } else if (cmd.k === 'gather') {
      const mine = state.entityById?.get(cmd.mineId);
      if (mine) pushMarker('gather', mine.pos.x, mine.pos.y);
    } else if (cmd.k === 'build') pushMarker('build', cmd.tx, cmd.ty);
    else if (cmd.k === 'rally') pushMarker('rally', cmd.tx, cmd.ty);

    if (net) {
      net.push(cmd);
    } else {
      applyNetCmds(state, [cmd], myOwner);
    }
  }

  // Mutable reference so onKeyDown always calls the cleanup-wrapped version
  let backToMenu = onBackToMenu;

  // ── Spawn player base ──────────────────────────────────────────────────────
  const ps = mapData.playerStart;
  spawnEntity(state, 'townhall',     0, ps);
  spawnEntity(state, playerRC.worker, 0, { x: ps.x + 4, y: ps.y + 1 });

  // ── Spawn gold mines ───────────────────────────────────────────────────────
  for (const [index, pos] of mapData.goldMines.entries()) {
    const mine = spawnEntity(state, 'goldmine', NEUTRAL, pos);
    mine.goldReserve = mapData.goldMineReserves?.[index] ?? MINE_GOLD_INITIAL;
  }

  // ── Spawn neutral destructible blockers ───────────────────────────────────
  for (const blocker of mapData.blockers ?? []) {
    const entity = spawnEntity(state, 'barrier', NEUTRAL, { x: blocker.x, y: blocker.y });
    entity.tileW = blocker.tileW ?? entity.tileW;
    entity.tileH = blocker.tileH ?? entity.tileH;
  }

  // ── Spawn AI / guest base ─────────────────────────────────────────────────
  const as_ = mapData.aiStart;
  spawnEntity(state, 'townhall',    1, as_);
  spawnEntity(state, aiRC.worker,   1, { x: as_.x + 1, y: as_.y + 3 });

  // ── AI controller ──────────────────────────────────────────────────────────
  const ai: AIController = createAI(options.aiDifficulty ?? 'medium');

  // ── Initial fog reveal ─────────────────────────────────────────────────────
  updateFog(state, myOwner);

  // ── Selection & UI state ───────────────────────────────────────────────────
  const selectedIds = new Set<number>();
  let uiButtons: UiButton[] = [];
  let placementMode: { building: EntityKind } | null = null;
  let gameResult: 'playing' | 'win' | 'lose' = 'playing';
  let attackMoveHeld = false;
  let forceAttackHeld = false;

  // ── Control groups ─────────────────────────────────────────────────────────
  const controlGroups = new Map<number, number[]>();
  const lastGroupTap  = new Map<number, number>();
  const DOUBLE_TAP_MS = 300;

  // ── Resize ─────────────────────────────────────────────────────────────────
  function resize(): void {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // ── Keyboard ───────────────────────────────────────────────────────────────
  function onKeyDown(e: KeyboardEvent): void {
    // Control-group bind (Ctrl/Meta + 1-9)
    if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      const slot = parseInt(e.key);
      const ids  = [...selectedIds].filter(id =>
        state.entities.some(en => en.id === id && en.owner === myOwner),
      );
      controlGroups.set(slot, ids);
      return;
    }

    // Control-group recall (1-9 alone)
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key >= '1' && e.key <= '9') {
      const slot  = parseInt(e.key);
      const group = controlGroups.get(slot);
      if (group) {
        const alive = group.filter(id => state.entities.some(en => en.id === id));
        controlGroups.set(slot, alive);
        selectedIds.clear();
        alive.forEach(id => selectedIds.add(id));
        const now = performance.now();
        if (now - (lastGroupTap.get(slot) ?? 0) < DOUBLE_TAP_MS && alive.length > 0) {
          let ax = 0; let ay = 0;
          alive.forEach(id => {
            const en = state.entities.find(x => x.id === id);
            if (en) { ax += en.pos.x; ay += en.pos.y; }
          });
          cam.x = ax / alive.length * TILE_SIZE - canvas.width  / 2;
          cam.y = ay / alive.length * TILE_SIZE - (canvas.height - UI_HEIGHT) / 2;
        }
        lastGroupTap.set(slot, now);
      }
      return;
    }

    // Global keys
    if (e.key === 'Escape') { placementMode = null; return; }
    if ((e.key === 'r' || e.key === 'R') && gameResult !== 'playing') {
      backToMenu(); return;
    }

    // S = Stop all selected player entities
    if (e.key === 's' || e.key === 'S') {
      const ids = [...selectedIds].filter(id => state.entities.some(en => en.id === id && en.owner === myOwner));
      if (ids.length) emit({ k: 'stop', ids });
      return;
    }

    // Context-sensitive hotkeys — use this player's race config
    const firstSel = [...selectedIds]
      .map(id => state.entities.find(en => en.id === id && en.owner === myOwner))
      .find(Boolean);

    if (firstSel) {
      // Worker build hotkeys (covers worker + peon)
      if (isWorkerKind(firstSel.kind)) {
        if (e.key === 'b' || e.key === 'B') { placementMode = { building: 'barracks' }; return; }
        if (e.key === 'f' || e.key === 'F') { placementMode = { building: 'farm' };     return; }
        if (e.key === 'g' || e.key === 'G') { placementMode = { building: 'tower' };    return; }
        if (e.key === 'w' || e.key === 'W') { placementMode = { building: 'wall' };     return; }
      }
      // Townhall training — race-appropriate worker
      if (firstSel.kind === 'townhall') {
        if (e.key === 'v' || e.key === 'V') { emit({ k: 'train', buildingId: firstSel.id, unit: myRC.worker });  return; }
      }
      // Barracks training
      if (firstSel.kind === 'barracks') {
        if (e.key === 't' || e.key === 'T') { emit({ k: 'train', buildingId: firstSel.id, unit: myRC.soldier }); return; }
        if (e.key === 'h' || e.key === 'H') { emit({ k: 'train', buildingId: firstSel.id, unit: myRC.heavy   }); return; }
      }
    }

    // A held = attack-move modifier and direct force-attack click modifier
    if (e.key === 'a' || e.key === 'A') {
      attackMoveHeld = true;
      forceAttackHeld = true;
    }
  }

  function onKeyUp(e: KeyboardEvent): void {
    if (e.key === 'a' || e.key === 'A') {
      attackMoveHeld = false;
      forceAttackHeld = false;
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup',   onKeyUp);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function unitAtWorld(wx: number, wy: number) {
    return state.entities.find(e => {
      if (!isUnitKind(e.kind)) return false;
      const ex = (e.pos.x + 0.5) * TILE_SIZE;
      const ey = (e.pos.y + 0.5) * TILE_SIZE;
      return Math.hypot(wx - ex, wy - ey) <= SELECT_DIST;
    });
  }

  function buildingAtTile(tx: number, ty: number) {
    return state.entities.find(e =>
      !isUnitKind(e.kind) &&
      tx >= e.pos.x && tx < e.pos.x + e.tileW &&
      ty >= e.pos.y && ty < e.pos.y + e.tileH,
    );
  }

  // ── Input ──────────────────────────────────────────────────────────────────
  function handleInput(): void {
    // Drag-box select (my units only)
    for (const drag of mouse.dragSelects) {
      if (!mouse.shiftHeld) selectedIds.clear();
      for (const e of state.entities) {
        if (e.owner !== myOwner || !isUnitKind(e.kind)) continue;
        const sx = (e.pos.x + 0.5) * TILE_SIZE - cam.x;
        const sy = (e.pos.y + 0.5) * TILE_SIZE - cam.y;
        if (sx >= drag.x1 && sx <= drag.x2 && sy >= drag.y1 && sy <= drag.y2) {
          selectedIds.add(e.id);
        }
      }
    }
    mouse.dragSelects.length = 0;

    // Minimap position
    const viewH_game = canvas.height - UI_HEIGHT;
    const miniX = canvas.width - MINI_W - MINI_PAD;
    const miniY = viewH_game   - MINI_H - MINI_PAD;

    // Click events
    for (const click of mouse.clicks) {
      // ── Minimap click: scroll camera ───────────────────────────────────────
      if (click.x >= miniX && click.x < miniX + MINI_W &&
          click.y >= miniY && click.y < miniY + MINI_H &&
          click.y < viewH_game) {
        const tileX = (click.x - miniX) / MINI_SCALE;
        const tileY = (click.y - miniY) / MINI_SCALE;
        cam.x = tileX * TILE_SIZE - canvas.width  / 2;
        cam.y = tileY * TILE_SIZE - viewH_game     / 2;
        clampCamera(cam, canvas.width, viewH_game);
        continue;
      }

      // Check if click hit a UI button
      if (click.button === 0) {
        const btn = uiButtons.find(b =>
          click.x >= b.x && click.x <= b.x + b.w &&
          click.y >= b.y && click.y <= b.y + b.h,
        );
        if (btn) { handleUiAction(btn.action); continue; }
      }

      // Don't process world clicks in the UI panel
      if (click.y > canvas.height - UI_HEIGHT) continue;

      const { wx, wy } = screenToWorld(click.x, click.y, cam);
      const { tx, ty } = screenToTile(click.x, click.y, cam);

      // Placement mode
      if (placementMode) {
        if (click.button === 0) {
          for (const id of selectedIds) {
            const worker = state.entities.find(e =>
              e.id === id && isWorkerKind(e.kind) && e.owner === myOwner);
            if (worker) {
              emit({ k: 'build', workerId: worker.id, building: placementMode.building, tx, ty });
              break;
            }
          }
          placementMode = null;
        } else if (click.button === 2) {
          placementMode = null;
        }
        continue;
      }

      if (click.button === 0) {
        // Left-click — select any entity (local UI only, not synced)
        const hitUnit     = unitAtWorld(wx, wy);
        const hitBuilding = buildingAtTile(tx, ty);
        const hit = hitUnit ?? hitBuilding ?? null;
        if (!mouse.shiftHeld) selectedIds.clear();
        if (hit) selectedIds.add(hit.id);

      } else if (click.button === 2 && selectedIds.size > 0) {
        const hitUnit     = unitAtWorld(wx, wy);
        const hitBuilding = buildingAtTile(tx, ty);

        // ── Rally point: right-click empty ground with building(s) selected ──
        if (!hitUnit && (!hitBuilding || hitBuilding.kind === 'goldmine')) {
          for (const id of selectedIds) {
            const bldg = state.entities.find(e =>
              e.id === id && e.owner === myOwner &&
              (e.kind === 'townhall' || e.kind === 'barracks'),
            );
            if (bldg) emit({ k: 'rally', buildingId: bldg.id, tx, ty });
          }
        }

        if (forceAttackHeld && hitUnit && areHostile(myOwner, hitUnit.owner)) {
          const attackerIds = [...selectedIds].filter(id => {
            const e = state.entities.find(en => en.id === id);
            return e && isUnitKind(e.kind) && e.owner === myOwner;
          });
          if (attackerIds.length) emit({ k: 'attack', ids: attackerIds, targetId: hitUnit.id });

        } else if (forceAttackHeld && hitBuilding && areHostile(myOwner, hitBuilding.owner) && hitBuilding.kind !== 'goldmine') {
          const attackerIds = [...selectedIds].filter(id => {
            const e = state.entities.find(en => en.id === id);
            return e && isUnitKind(e.kind) && e.owner === myOwner;
          });
          if (attackerIds.length) emit({ k: 'attack', ids: attackerIds, targetId: hitBuilding.id });

        } else if (hitUnit && areHostile(myOwner, hitUnit.owner)) {
          const attackerIds = [...selectedIds].filter(id => {
            const e = state.entities.find(en => en.id === id);
            return e && isUnitKind(e.kind) && e.owner === myOwner;
          });
          if (attackerIds.length) emit({ k: 'attack', ids: attackerIds, targetId: hitUnit.id });

        } else if (hitBuilding && areHostile(myOwner, hitBuilding.owner) && hitBuilding.kind !== 'goldmine') {
          const attackerIds = [...selectedIds].filter(id => {
            const e = state.entities.find(en => en.id === id);
            return e && isUnitKind(e.kind) && e.owner === myOwner;
          });
          if (attackerIds.length) emit({ k: 'attack', ids: attackerIds, targetId: hitBuilding.id });

        } else if (hitBuilding?.kind === 'construction' && hitBuilding.owner === myOwner) {
          // Resume / continue building this scaffold with selected workers
          const workerIds = [...selectedIds].filter(id => {
            const e = state.entities.find(en => en.id === id);
            return e && isWorkerKind(e.kind) && e.owner === myOwner;
          });
          for (const wid of workerIds) {
            emit({ k: 'resume', workerId: wid, siteId: hitBuilding.id });
          }

        } else if (hitBuilding?.kind === 'goldmine') {
          const workerIds = [...selectedIds].filter(id => {
            const e = state.entities.find(en => en.id === id);
            return e && isWorkerKind(e.kind) && e.owner === myOwner;
          });
          if (workerIds.length) emit({ k: 'gather', ids: workerIds, mineId: hitBuilding.id });

        } else if (state.tiles[ty]?.[tx]?.kind === 'tree' && (state.tiles[ty]?.[tx]?.woodReserve ?? 0) > 0) {
          const workerIds = [...selectedIds].filter(id => {
            const e = state.entities.find(en => en.id === id);
            return e && isWorkerKind(e.kind) && e.owner === myOwner;
          });
          if (workerIds.length) emit({ k: 'gather', ids: workerIds, mineId: ty * 64 + tx });

        } else {
          const moverIds = [...selectedIds].filter(id => {
            const e = state.entities.find(en => en.id === id);
            return e && isUnitKind(e.kind) && e.owner === myOwner;
          });
          if (moverIds.length) {
            const hadOrdersBefore = moverIds.some(id => {
              const e = state.entities.find(en => en.id === id);
              return !!e?.cmd;
            });
            emit({ k: 'move', ids: moverIds, tx, ty, atk: attackMoveHeld });
            const anyAccepted = moverIds.some(id => {
              const e = state.entities.find(en => en.id === id);
              return e?.cmd?.type === 'move';
            });
            if (!net && !anyAccepted && !hadOrdersBefore) {
              showMoveRejectedMarker(tx, ty);
            }
          }
        }
      }
    }
    mouse.clicks.length = 0;

    // Remove dead selections
    for (const id of selectedIds) {
      if (!state.entities.find(e => e.id === id)) selectedIds.delete(id);
    }
  }

  function setOpeningPlan(plan: OpeningPlan): void {
    if (state.openingPlanSelected[myOwner]) return;
    const building = state.entities.find(e =>
      e.owner === myOwner && (e.kind === 'townhall' || e.kind === 'barracks'));
    if (!building) return;
    emit({ k: 'set_plan', buildingId: building.id, plan });
    openingPlanFeedback = { plan, untilTick: state.tick + SIM_HZ * 2 };
  }

  function handleUiAction(action: string): void {
    const parts = action.split('|');
    let pendingPlan: OpeningPlan | null = null;
    let pendingAction = '';

    for (const part of parts) {
      if (part.startsWith('plan:')) {
        pendingPlan = part.slice(5) as OpeningPlan;
      } else if (part) {
        pendingAction = part;
      }
    }

    if (pendingPlan) {
      setOpeningPlan(pendingPlan);
      if (!pendingAction) return;
    }

    action = pendingAction;

    if (action === 'train_ranged') {
      for (const id of selectedIds) {
        const building = state.entities.find(e => e.id === id && e.kind === 'barracks' && e.owner === myOwner);
        if (building) { emit({ k: 'train', buildingId: building.id, unit: myRC.ranged }); break; }
      }
    } else if (action.startsWith('train:')) {
      const unit = action.slice(6) as EntityKind;
      for (const id of selectedIds) {
        const building = state.entities.find(e => e.id === id && !isUnitKind(e.kind) && e.owner === myOwner);
        if (building) { emit({ k: 'train', buildingId: building.id, unit }); break; }
      }
    } else if (action.startsWith('build:')) {
      placementMode = { building: action.slice(6) as EntityKind };

    } else if (action === 'stop') {
      const ids = [...selectedIds].filter(id => state.entities.some(en => en.id === id && en.owner === myOwner));
      if (ids.length) emit({ k: 'stop', ids });

    } else if (action === 'demolish') {
      for (const id of selectedIds) {
        const e = state.entities.find(en =>
          en.id === id && en.owner === myOwner && !isUnitKind(en.kind) && en.kind !== 'goldmine');
        if (!e) continue;
        emit({ k: 'demolish', buildingId: e.id });
        selectedIds.delete(id);
        break;
      }
    }
  }

  // ── Win / lose detection ───────────────────────────────────────────────────
  const BLDG_KINDS = new Set(['townhall', 'barracks', 'farm', 'tower']);
  function checkWinLose(): void {
    if (gameResult !== 'playing') return;
    const hasMyTH      = state.entities.some(e => e.owner === myOwner   && e.kind === 'townhall');
    const hasEnemyBldg = state.entities.some(e => e.owner === peerOwner && BLDG_KINDS.has(e.kind));
    if (!hasMyTH)      gameResult = 'lose';
    if (!hasEnemyBldg) gameResult = 'win';
  }

  // ── Sim tick ───────────────────────────────────────────────────────────────
  function simTick(): void {
    if (!state.openingPlanSelected[0] && state.tick > OPENING_PLAN_LOCK_TICKS) {
      state.openingPlanSelected[0] = 'eco';
      for (const en of state.entities) {
        if (en.owner === 0 && (en.kind === 'townhall' || en.kind === 'barracks')) en.openingPlan = 'eco';
      }
    }
    if (!state.openingPlanSelected[1] && state.tick > OPENING_PLAN_LOCK_TICKS) {
      state.openingPlanSelected[1] = 'eco';
      for (const en of state.entities) {
        if (en.owner === 1 && (en.kind === 'townhall' || en.kind === 'barracks')) en.openingPlan = 'eco';
      }
    }
    // Online mini-lockstep: advance only when this tick is ready on both sides.
    if (net) {
      if (net.status === 'disconnected' && gameResult === 'playing') {
        gameResult = 'win';
        return;
      }

      const exchange = net.exchange(state.tick);
      if (!exchange.ready) {
        if (net.status === 'disconnected' && gameResult === 'playing') {
          gameResult = 'win';
        }
        return;
      }
      if (myOwner === 0) {
        if (exchange.local.length > 0) applyNetCmds(state, exchange.local, 0);
        if (exchange.remote.length > 0) applyNetCmds(state, exchange.remote, 1);
      } else {
        if (exchange.remote.length > 0) applyNetCmds(state, exchange.remote, 0);
        if (exchange.local.length > 0) applyNetCmds(state, exchange.local, 1);
      }
    }

    state.tick++;

    if (state.recentAttackEvents) {
      state.recentAttackEvents = state.recentAttackEvents.filter(ev => state.tick - ev.tick <= 12);
    }
    if (state.recentProjectileEvents) {
      state.recentProjectileEvents = state.recentProjectileEvents.filter(ev => state.tick - ev.startTick <= ev.durationTicks + 6);
    }

    let p0 = profiler.now();
    for (const entity of state.entities) processCommand(state, entity);
    profiler.recordPhase('processCommand', profiler.now() - p0);

    p0 = profiler.now();
    autoAttackPass(state);
    profiler.recordPhase('autoAttackPassWrap', profiler.now() - p0);

    p0 = profiler.now();
    state.corpses = state.corpses.filter(c => state.tick - c.deadTick < CORPSE_LIFE_TICKS);
    profiler.recordPhase('corpsesFilter', profiler.now() - p0);

    p0 = profiler.now();
    computePopCaps(state);
    profiler.recordPhase('computePopCaps', profiler.now() - p0);

    p0 = profiler.now();
    separateUnits(state);
    profiler.recordPhase('separateUnits', profiler.now() - p0);

    p0 = profiler.now();
    updateFog(state, myOwner);
    profiler.recordPhase('updateFog', profiler.now() - p0);

    if (!net) {
      p0 = profiler.now();
      tickAI(state, ai);   // AI only runs in offline mode
      profiler.recordPhase('tickAI', profiler.now() - p0);
    }

    if (net && state.tick % NET_DESYNC_CHECKSUM_INTERVAL_TICKS === 0) {
      const digest = computeDeterministicStateChecksum(state);
      lastNetChecksumLine = `sync t${digest.tick} h${digest.hashHex} e${digest.entityCount}`;
      console.info(`[sync] ${lastNetChecksumLine} g${state.gold[0]}/${state.gold[1]} p${state.pop[0]}/${state.popCap[0]}-${state.pop[1]}/${state.popCap[1]}`);
    }

    checkWinLose();
    profiler.sampleState(state);

    // Online: also check if opponent disconnected
    if (net && net.status === 'disconnected' && gameResult === 'playing') {
      gameResult = 'win'; // opponent left
    }
  }

  // ── Result overlay ─────────────────────────────────────────────────────────
  function drawResultOverlay(): void {
    if (gameResult === 'playing') return;
    const w = canvas.width; const h = canvas.height;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = gameResult === 'win' ? '#ffe97a' : '#ff5555';
    ctx.font = 'bold 72px monospace';
    ctx.fillText(gameResult === 'win' ? t('victory') : t('defeat'), w / 2, h / 2 - 24);
    ctx.fillStyle = '#ccc';
    ctx.font = '22px monospace';
    ctx.fillText(t('press_r_menu'), w / 2, h / 2 + 30);
    ctx.textAlign = 'left';
  }

  function drawDragBox(): void {
    const d = mouse.activeDrag;
    if (!d) return;
    ctx.strokeStyle = 'rgba(0,255,136,0.85)';
    ctx.lineWidth = 1;
    ctx.strokeRect(d.x1, d.y1, d.x2 - d.x1, d.y2 - d.y1);
    ctx.fillStyle = 'rgba(0,255,136,0.07)';
    ctx.fillRect(d.x1, d.y1, d.x2 - d.x1, d.y2 - d.y1);
  }

  function drawGroupBadges(): void {
    let gx = 4;
    controlGroups.forEach((ids, slot) => {
      if (ids.length === 0) return;
      const alive = ids.filter(id => state.entities.some(e => e.id === id));
      if (alive.length === 0) return;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(gx, 28, 28, 18);
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      ctx.strokeRect(gx + 0.5, 28.5, 27, 17);
      ctx.fillStyle = '#ffee88';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${slot}:${alive.length}`, gx + 14, 41);
      ctx.textAlign = 'left';
      gx += 32;
    });
  }

  // ── Main loop ──────────────────────────────────────────────────────────────
  let lastTime = 0;
  let simAccum = 0;
  let running  = true;

  function loop(now: number): void {
    if (!running) return;
    const dt   = Math.min(now - lastTime, 100);
    lastTime   = now;
    const viewH = canvas.height;

    const spd  = CAM_SPEED * (dt / 1000);
    const edge = mouse.onCanvas;
    if (keys.ArrowLeft  || (edge && mouse.x < EDGE_ZONE))                 cam.x -= spd;
    if (keys.ArrowRight || (edge && mouse.x > canvas.width  - EDGE_ZONE)) cam.x += spd;
    if (keys.ArrowUp    || (edge && mouse.y < EDGE_ZONE))                 cam.y -= spd;
    if (keys.ArrowDown  || (edge && mouse.y > viewH - UI_HEIGHT - EDGE_ZONE && mouse.y < viewH - UI_HEIGHT)) cam.y += spd;
    clampCamera(cam, canvas.width, viewH - UI_HEIGHT);

    handleInput();

    let renderAlpha = 1;
    if (gameResult === 'playing') {
      simAccum += dt;
      while (simAccum >= SIM_TICK_MS) { simTick(); simAccum -= SIM_TICK_MS; }
      renderAlpha = simAccum / SIM_TICK_MS;
    }

    render(ctx, state, cam, canvas.width, viewH - UI_HEIGHT, selectedIds, myOwner, renderAlpha);
    drawMinimap(ctx, state, cam, canvas.width, viewH - UI_HEIGHT, myOwner);
    if (placementMode) {
      const { tx, ty } = screenToTile(mouse.x, mouse.y, cam);
      drawGhostBuilding(ctx, state, cam, placementMode.building, tx, ty);
    }
    drawDragBox();
    for (let i = commandMarkers.length - 1; i >= 0; i--) {
      if (now - commandMarkers[i].createdAt >= commandMarkers[i].ttlMs) commandMarkers.splice(i, 1);
    }
    drawCommandMarkers(ctx, cam, commandMarkers, now);
    uiButtons = drawUi(ctx, state, selectedIds, canvas.width, viewH, myOwner, net ? {
      status: net.status,
      statusMsg: lastNetChecksumLine ? `${net.statusMsg} | ${lastNetChecksumLine}` : net.statusMsg,
      stats: net.getStats(),
    } : null, openingPlanFeedback);
    drawGroupBadges();
    drawResultOverlay();

    requestAnimationFrame(loop);
  }

  // ── Cleanup on back-to-menu ────────────────────────────────────────────────
  // Re-assign `backToMenu` so the onKeyDown closure picks up the cleanup version
  backToMenu = () => {
    running = false;
    net?.destroy();
    keysInput.destroy();
    mouseInput.destroy();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup',   onKeyUp);
    window.removeEventListener('resize',  resize);
    onBackToMenu();
  };

  requestAnimationFrame((t) => { lastTime = t; requestAnimationFrame(loop); });
}
