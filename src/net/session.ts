/**
 * session.ts
 * PeerJS wrapper with input-buffering and a one-shot config handshake.
 *
 * Handshake (runs once, before any game ticks):
 *   Host sends { type:'config', race, mapId } immediately on channel open.
 *   Guest fires onConfig(cfg), menu updates its state, then calls startOnlineGame().
 *   This ensures both sides build GameState with the same races[] array.
 *
 * Game ticks:
 *   push(cmd)          – buffer a command for the current tick
 *   exchange(tick)     – flush local buffer, send to peer, return peer cmds or null
 */

import Peer, { DataConnection } from 'peerjs';
import type { NetCmd, TickPacket } from './netcmd';
import type { Race, MapId, EntityKind } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SessionStatus =
  | 'init'          // PeerJS opening
  | 'waiting'       // host: waiting for guest to connect
  | 'connecting'    // guest: dialling host
  | 'ready'         // data channel open, game can start
  | 'disconnected'  // peer left
  | 'error';

/** Full config agreed by both sides before the game starts. */
export interface SessionConfig {
  race:      Race;   // host's race  → races[0]
  guestRace: Race;   // guest's race → races[1]
  mapId:     MapId;
}

export interface NetSession {
  role:    'host' | 'guest';
  code:    string;          // room code = host's PeerJS ID
  status:  SessionStatus;
  statusMsg: string;

  onStatusChange?: () => void;
  /** Fired on BOTH sides once the full config is established.
   *  Host: fires after receiving guest's hello message.
   *  Guest: fires after receiving host's config reply. */
  onConfig?: (cfg: SessionConfig) => void;

  push(cmd: NetCmd): void;
  exchange(tick: number): NetCmd[] | null;
  destroy(): void;
}

// ─── Internal message types ───────────────────────────────────────────────────

type WireMessage =
  | { type: 'hello';  race: string }                                     // guest → host
  | { type: 'config'; race: string; guestRace: string; mapId: number }   // host → guest
  | TickPacket & { type?: undefined };  // tick packets have no 'type' field

const VALID_RACES = new Set<Race>(['human', 'orc']);
const VALID_MAP_IDS = new Set<MapId>([1, 2]);
const VALID_BUILDINGS = new Set<EntityKind>(['townhall', 'barracks', 'farm', 'wall']);
const VALID_TRAIN_UNITS = new Set<EntityKind>(['worker', 'footman', 'archer', 'peon', 'grunt', 'troll']);

const MAX_PACKET_BYTES = 16 * 1024;
const MAX_CMDS_PER_PACKET = 128;
const MAX_LOCAL_CMDS_PER_TICK = 128;
const MAX_QUEUED_REMOTE_TICKS = 128;
const MAX_QUEUED_REMOTE_CMDS = 1024;
const REMOTE_APPLY_DELAY_TICKS = 2;
const REMOTE_STALE_TICK_LIMIT = 64;
const INBOUND_RATE_WINDOW_MS = 1000;
const MAX_INBOUND_PACKETS_PER_WINDOW = 120;

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v);
}

function isRace(v: unknown): v is Race {
  return typeof v === 'string' && VALID_RACES.has(v as Race);
}

function isMapId(v: unknown): v is MapId {
  return isInt(v) && VALID_MAP_IDS.has(v as MapId);
}

function isIdArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.length <= 128 && v.every(isInt);
}

function isNetCmd(v: unknown): v is NetCmd {
  if (!v || typeof v !== 'object') return false;
  const cmd = v as Partial<NetCmd> & { k?: unknown };
  switch (cmd.k) {
    case 'move':
      return isIdArray(cmd.ids) && isInt(cmd.tx) && isInt(cmd.ty) && typeof cmd.atk === 'boolean';
    case 'attack':
      return isIdArray(cmd.ids) && isInt(cmd.targetId);
    case 'gather':
      return isIdArray(cmd.ids) && isInt(cmd.mineId);
    case 'train':
      return isInt(cmd.buildingId) && typeof cmd.unit === 'string' && VALID_TRAIN_UNITS.has(cmd.unit as EntityKind);
    case 'build':
      return isInt(cmd.workerId) && typeof cmd.building === 'string' && VALID_BUILDINGS.has(cmd.building as EntityKind) && isInt(cmd.tx) && isInt(cmd.ty);
    case 'stop':
      return isIdArray(cmd.ids);
    case 'rally':
      return isInt(cmd.buildingId) && isInt(cmd.tx) && isInt(cmd.ty);
    case 'demolish':
      return isInt(cmd.buildingId);
    case 'resume':
      return isInt(cmd.workerId) && isInt(cmd.siteId);
    default:
      return false;
  }
}

function parseTickPacket(v: unknown): TickPacket | null {
  if (!v || typeof v !== 'object') return null;
  const pkt = v as Partial<TickPacket>;
  if (!isInt(pkt.tick) || pkt.tick < 0 || !Array.isArray(pkt.cmds) || pkt.cmds.length > MAX_CMDS_PER_PACKET) return null;
  if (!pkt.cmds.every(isNetCmd)) return null;
  return { tick: pkt.tick, cmds: pkt.cmds };
}

function parseConfig(v: unknown): SessionConfig | null {
  if (!v || typeof v !== 'object') return null;
  const cfg = v as Partial<SessionConfig>;
  if (!isRace(cfg.race) || !isRace(cfg.guestRace) || !isMapId(cfg.mapId)) return null;
  return { race: cfg.race, guestRace: cfg.guestRace, mapId: cfg.mapId };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createSession(
  role:         'host' | 'guest',
  hostCode?:    string,                           // required when role === 'guest'
  hostConfig?:  Pick<SessionConfig, 'race' | 'mapId'>,  // required when role === 'host'
  guestRace?:   Race,                           // required when role === 'guest'
): NetSession {

  const safeHostConfig = hostConfig && isRace(hostConfig.race) && isMapId(hostConfig.mapId)
    ? hostConfig
    : undefined;
  const safeGuestRace: Race = isRace(guestRace) ? guestRace : 'human';

  let conn: DataConnection | null = null;
  let localBuf: NetCmd[] = [];
  const remoteQueue = new Map<number, NetCmd[]>();

  let queuedRemoteCmdCount = 0;
  let inboundWindowStartedAt = Date.now();
  let inboundPacketsInWindow = 0;

  function failConnection(reason: string): void {
    session.status = 'error';
    session.statusMsg = reason;
    session.onStatusChange?.();
    conn?.close();
  }

  function enforceInboundRateLimit(): boolean {
    const now = Date.now();
    if (now - inboundWindowStartedAt >= INBOUND_RATE_WINDOW_MS) {
      inboundWindowStartedAt = now;
      inboundPacketsInWindow = 0;
    }
    inboundPacketsInWindow++;
    return inboundPacketsInWindow <= MAX_INBOUND_PACKETS_PER_WINDOW;
  }

  function dropStaleRemoteTicks(currentTick: number): void {
    const oldestAllowedTick = currentTick - REMOTE_STALE_TICK_LIMIT;
    for (const [queuedTick, cmds] of remoteQueue) {
      if (queuedTick < oldestAllowedTick) {
        queuedRemoteCmdCount -= cmds.length;
        remoteQueue.delete(queuedTick);
      }
    }
  }

  function enqueueRemotePacket(pkt: TickPacket): void {
    if (pkt.cmds.length === 0) return;

    const prev = remoteQueue.get(pkt.tick);
    if (prev) {
      prev.push(...pkt.cmds);
    } else {
      remoteQueue.set(pkt.tick, [...pkt.cmds]);
    }
    queuedRemoteCmdCount += pkt.cmds.length;

    while (remoteQueue.size > MAX_QUEUED_REMOTE_TICKS || queuedRemoteCmdCount > MAX_QUEUED_REMOTE_CMDS) {
      const oldestTick = Math.min(...remoteQueue.keys());
      const dropped = remoteQueue.get(oldestTick);
      if (!dropped) break;
      queuedRemoteCmdCount -= dropped.length;
      remoteQueue.delete(oldestTick);
    }
  }

  const session: NetSession = {
    role,
    code:      role === 'guest' ? (hostCode ?? '') : '',
    status:    'init',
    statusMsg: 'Initialising…',

    push(cmd) {
      if (localBuf.length < MAX_LOCAL_CMDS_PER_TICK) localBuf.push(cmd);
    },

    exchange(tick) {
      const toSend = localBuf;
      localBuf = [];

      // Only send if there are commands (saves bandwidth; keepalive is PeerJS's job)
      if (conn?.open && toSend.length > 0) {
        conn.send({ tick, cmds: toSend } satisfies TickPacket);
      }

      dropStaleRemoteTicks(tick);

      if (remoteQueue.size === 0) return null;
      const applyUpToTick = tick - REMOTE_APPLY_DELAY_TICKS;
      if (applyUpToTick < 0) return null;

      const dueTicks = [...remoteQueue.keys()].filter(t => t <= applyUpToTick).sort((a, b) => a - b);
      if (dueTicks.length === 0) return null;

      const dueCmds: NetCmd[] = [];
      for (const dueTick of dueTicks) {
        const cmds = remoteQueue.get(dueTick);
        if (!cmds) continue;
        dueCmds.push(...cmds);
        queuedRemoteCmdCount -= cmds.length;
        remoteQueue.delete(dueTick);
      }

      return dueCmds.length > 0 ? dueCmds : null;
    },

    destroy() {
      conn?.close();
      peer.destroy();
    },
  };

  // ── PeerJS setup ─────────────────────────────────────────────────────────────
  const peer = new Peer({
    host:   '0.peerjs.com',
    port:   443,
    path:   '/',
    secure: true,
    debug:  0,
  });

  function setupConn(c: DataConnection) {
    conn = c;

    c.on('open', () => {
      if (role === 'guest') {
        // Guest announces its chosen race first; host replies with full config
        c.send({ type: 'hello', race: safeGuestRace } satisfies WireMessage);
        session.statusMsg = 'Connected! Sending race…';
      } else {
        session.statusMsg = 'Guest connected!';
      }
      session.status = 'ready';
      session.onStatusChange?.();
    });

    c.on('data', (raw) => {
      if (!enforceInboundRateLimit()) {
        failConnection('Connection closed: inbound packet flood');
        return;
      }

      let approxSize = 0;
      try {
        approxSize = JSON.stringify(raw).length;
      } catch {
        failConnection('Connection closed: malformed inbound payload');
        return;
      }
      if (approxSize > MAX_PACKET_BYTES) {
        failConnection('Connection closed: inbound packet too large');
        return;
      }

      const msg = raw as WireMessage;

      // Host receives guest's race → replies with full config → both start
      if (msg.type === 'hello' && role === 'host') {
        if (!safeHostConfig || !isRace(msg.race)) {
          session.status = 'error';
          session.statusMsg = 'Invalid multiplayer hello/config';
          session.onStatusChange?.();
          c.close();
          return;
        }
        const fullCfg: SessionConfig = {
          race:      safeHostConfig.race,
          guestRace: msg.race,
          mapId:     safeHostConfig.mapId,
        };
        c.send({ type: 'config', ...fullCfg } satisfies WireMessage);
        session.onConfig?.(fullCfg);
        return;
      }

      // Guest receives full config from host
      if (msg.type === 'config' && role === 'guest') {
        const cfg = parseConfig(msg);
        if (!cfg) {
          session.status = 'error';
          session.statusMsg = 'Invalid multiplayer config from host';
          session.onStatusChange?.();
          c.close();
          return;
        }
        session.onConfig?.(cfg);
        return;
      }

      // Tick packet — only queue if there are actual commands
      const pkt = parseTickPacket(msg);
      if (pkt) enqueueRemotePacket(pkt);
    });

    c.on('close', () => {
      session.status    = 'disconnected';
      session.statusMsg = 'Opponent disconnected';
      session.onStatusChange?.();
    });

    c.on('error', (err) => {
      session.status    = 'error';
      session.statusMsg = `Connection error: ${(err as Error).message}`;
      session.onStatusChange?.();
    });
  }

  peer.on('open', (id) => {
    if (role === 'host') {
      session.code      = id;
      session.status    = 'waiting';
      session.statusMsg = `Room code: ${id}`;
      session.onStatusChange?.();

      peer.on('connection', (c) => setupConn(c));
    } else {
      // Guest: session.code is already the host's code
      session.status    = 'connecting';
      session.statusMsg = 'Connecting to host…';
      session.onStatusChange?.();

      const c = peer.connect(hostCode!, { reliable: true, serialization: 'json' });
      setupConn(c);
    }
  });

  peer.on('error', (err) => {
    session.status    = 'error';
    session.statusMsg = `PeerJS error: ${(err as Error).message}`;
    session.onStatusChange?.();
  });

  return session;
}
