/**
 * session.ts
 * PeerJS wrapper with input-buffering and a one-shot config handshake.
 *
 * Handshake (runs once, before any game ticks):
 *   Host sends { type:'config', race, mapId } immediately on channel open.
 *   Guest fires onConfig(cfg), menu updates its state, then calls startOnlineGame().
 *   This ensures both sides build GameState with the same races[] array.
 *
 * Game ticks (mini-lockstep):
 *   push(cmd)          – buffer a local command for scheduling
 *   exchange(tick)     – schedule local cmds for (tick + delay), send packet,
 *                        and return both sides' cmds when tick is ready
 */

import Peer, { DataConnection } from 'peerjs';
import type { NetCmd, TickPacket } from './netcmd';
import type { Race, MapId, EntityKind } from '../types';

interface RuntimePeerConfig {
  host: string;
  port: number;
  path: string;
  secure: boolean;
}

export type NetMode = 'public' | 'selfhost';

interface RuntimeNetConfig {
  peer: RuntimePeerConfig;
  iceServers: RTCIceServer[];
}

interface RuntimeIceConfigResponse {
  iceServers?: RTCIceServer[];
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function parseNumberEnv(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePath(path: string | undefined, fallback: string): string {
  const raw = (path ?? fallback).trim();
  if (!raw) return fallback;
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

function defaultPeerHost(): string {
  if (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost') {
    return window.location.hostname;
  }
  return '0.peerjs.com';
}

function defaultPeerSecure(): boolean {
  if (typeof window !== 'undefined') {
    return window.location.protocol === 'https:';
  }
  return true;
}

function parseIceServers(raw: string | undefined): RTCIceServer[] | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((entry): entry is RTCIceServer => !!entry && typeof entry === 'object' && 'urls' in entry);
  } catch {
    return null;
  }
}

function getPublicNetConfig(): RuntimeNetConfig {
  return {
    peer: {
      host: '0.peerjs.com',
      port: 443,
      path: '/',
      secure: true,
    },
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };
}

function getSelfHostedNetConfig(): RuntimeNetConfig {
  const host = (import.meta.env.VITE_PEER_HOST as string | undefined)?.trim() || defaultPeerHost();
  const secure = parseBooleanEnv(import.meta.env.VITE_PEER_SECURE as string | undefined, defaultPeerSecure());
  const port = parseNumberEnv(import.meta.env.VITE_PEER_PORT as string | undefined, secure ? 443 : 9000);
  const path = normalizePath(import.meta.env.VITE_PEER_PATH as string | undefined, '/');
  const iceServers = parseIceServers(import.meta.env.VITE_ICE_SERVERS as string | undefined) ?? [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  return {
    peer: { host, port, path, secure },
    iceServers,
  };
}

function getRuntimePeerConfig(mode: NetMode): RuntimeNetConfig {
  return mode === 'public' ? getPublicNetConfig() : getSelfHostedNetConfig();
}

async function fetchRuntimeIceServers(): Promise<RTCIceServer[] | null> {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return null;
  try {
    const response = await fetch('./api/ice', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as RuntimeIceConfigResponse;
    if (!payload || !Array.isArray(payload.iceServers)) return null;
    return payload.iceServers.filter((entry): entry is RTCIceServer => !!entry && typeof entry === 'object' && 'urls' in entry);
  } catch {
    return null;
  }
}

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

export interface SessionStats {
  waitingStallTicks: number;
  remoteAnnouncedUpToTick: number;
  currentDelayTicks: number;
  lastPacketAgeMs: number | null;
  lastInboundSummary: string | null;
}

export interface NetSession {
  role:    'host' | 'guest';
  code:    string;          // room code = host's PeerJS ID
  status:  SessionStatus;
  statusMsg: string;
  netMode: NetMode;

  onStatusChange?: () => void;
  /** Fired on BOTH sides once the full config is established.
   *  Host: fires after receiving guest's hello message.
   *  Guest: fires after receiving host's config reply. */
  onConfig?: (cfg: SessionConfig) => void;

  push(cmd: NetCmd): void;
  exchange(tick: number): TickExchange;
  getStats(): SessionStats;
  destroy(): void;
}

export interface TickExchange {
  ready: boolean;
  local: NetCmd[];
  remote: NetCmd[];
}

// ─── Internal message types ───────────────────────────────────────────────────

type WireMessage =
  | { type: 'hello';  race: string }                                     // guest → host
  | { type: 'config'; race: string; guestRace: string; mapId: number }   // host → guest
  | TickPacket & { type?: undefined };  // tick packets have no 'type' field

const VALID_RACES = new Set<Race>(['human', 'orc']);
const VALID_MAP_IDS = new Set<MapId>([1, 2, 3, 4, 5, 6]);
const VALID_BUILDINGS = new Set<EntityKind>(['townhall', 'barracks', 'farm', 'wall', 'tower']);
const VALID_TRAIN_UNITS = new Set<EntityKind>(['worker', 'footman', 'archer', 'knight', 'peon', 'grunt', 'troll', 'ogreFighter']);

const MAX_PACKET_BYTES = 16 * 1024;
const MAX_CMDS_PER_PACKET = 128;
const MAX_LOCAL_CMDS_PER_TICK = 128;
const MAX_QUEUED_REMOTE_TICKS = 128;
const MAX_QUEUED_REMOTE_CMDS = 1024;
const EXECUTION_DELAY_TICKS = 3;
const REMOTE_STALE_TICK_LIMIT = 64;
const INBOUND_RATE_WINDOW_MS = 1000;
const MAX_INBOUND_PACKETS_PER_WINDOW = 120;
const MAX_WAITING_STALL_TICKS = 180;
const ACCEPT_LOG_INTERVAL_TICKS = 40;

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
    case 'set_plan':
      return isInt(cmd.buildingId) && typeof cmd.plan === 'string' && (cmd.plan === 'eco' || cmd.plan === 'tempo' || cmd.plan === 'pressure');
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

export async function createSession(
  role:         'host' | 'guest',
  hostCode?:    string,                           // required when role === 'guest'
  hostConfig?:  Pick<SessionConfig, 'race' | 'mapId'>,  // required when role === 'host'
  guestRace?:   Race,                           // required when role === 'guest'
  netMode:      NetMode = 'selfhost',
): Promise<NetSession> {

  const safeHostConfig = hostConfig && isRace(hostConfig.race) && isMapId(hostConfig.mapId)
    ? hostConfig
    : undefined;
  const safeGuestRace: Race = isRace(guestRace) ? guestRace : 'human';

  let conn: DataConnection | null = null;
  let localBuf: NetCmd[] = [];
  const localQueue = new Map<number, NetCmd[]>();
  const remoteQueue = new Map<number, NetCmd[]>();
  const remoteReceivedTicks = new Set<number>();

  let queuedRemoteCmdCount = 0;
  let queuedLocalCmdCount = 0;
  let remoteAnnouncedUpToTick = -1;
  let waitingStallTicks = 0;
  let inboundWindowStartedAt = Date.now();
  let inboundPacketsInWindow = 0;
  let lastPacketReceivedAt: number | null = null;
  let lastInboundSummary: string | null = null;
  let lastAcceptedTickLogged = -1;

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
    for (const queuedTick of remoteReceivedTicks) {
      if (queuedTick < oldestAllowedTick) remoteReceivedTicks.delete(queuedTick);
    }
    for (const [queuedTick, cmds] of remoteQueue) {
      if (queuedTick < oldestAllowedTick) {
        queuedRemoteCmdCount -= cmds.length;
        remoteQueue.delete(queuedTick);
      }
    }
  }

  function dropStaleLocalTicks(currentTick: number): void {
    const oldestAllowedTick = currentTick - REMOTE_STALE_TICK_LIMIT;
    for (const [queuedTick, cmds] of localQueue) {
      if (queuedTick < oldestAllowedTick) {
        queuedLocalCmdCount -= cmds.length;
        localQueue.delete(queuedTick);
      }
    }
  }

  function summarizeInbound(summary: string, log: 'none' | 'info' | 'warn' = 'none'): void {
    lastInboundSummary = summary;
    if (log === 'info') console.info(`[net:in] ${summary}`);
    else if (log === 'warn') console.warn(`[net:in] ${summary}`);
  }

  function enqueueRemotePacket(pkt: TickPacket): void {
    remoteAnnouncedUpToTick = Math.max(remoteAnnouncedUpToTick, pkt.tick);
    remoteReceivedTicks.add(pkt.tick);

    if (pkt.cmds.length === 0) return;

    const prev = remoteQueue.get(pkt.tick);
    if (prev) {
      queuedRemoteCmdCount -= prev.length;
      remoteQueue.delete(pkt.tick);
    }

    remoteQueue.set(pkt.tick, [...pkt.cmds]);
    queuedRemoteCmdCount += pkt.cmds.length;

    while (remoteQueue.size > MAX_QUEUED_REMOTE_TICKS || queuedRemoteCmdCount > MAX_QUEUED_REMOTE_CMDS) {
      const oldestTick = Math.min(...remoteQueue.keys());
      const dropped = remoteQueue.get(oldestTick);
      if (!dropped) break;
      queuedRemoteCmdCount -= dropped.length;
      remoteQueue.delete(oldestTick);
    }
  }

  function enqueueLocalForTick(tick: number, cmds: NetCmd[]): void {
    if (cmds.length === 0) return;
    const prev = localQueue.get(tick);
    if (prev) {
      prev.push(...cmds);
    } else {
      localQueue.set(tick, [...cmds]);
    }
    queuedLocalCmdCount += cmds.length;

    while (localQueue.size > MAX_QUEUED_REMOTE_TICKS || queuedLocalCmdCount > MAX_QUEUED_REMOTE_CMDS) {
      const oldestTick = Math.min(...localQueue.keys());
      const dropped = localQueue.get(oldestTick);
      if (!dropped) break;
      queuedLocalCmdCount -= dropped.length;
      localQueue.delete(oldestTick);
    }
  }

  const session: NetSession = {
    role,
    code:      role === 'guest' ? (hostCode ?? '') : '',
    status:    'init',
    statusMsg: 'Initialising…',
    netMode,

    push(cmd) {
      if (localBuf.length < MAX_LOCAL_CMDS_PER_TICK) localBuf.push(cmd);
    },

    exchange(tick) {
      const scheduledTick = tick + EXECUTION_DELAY_TICKS;
      const toSend = localBuf;
      localBuf = [];
      enqueueLocalForTick(scheduledTick, toSend);

      // Send every sim tick so remote can advance lockstep even on empty-input ticks.
      if (conn?.open) {
        conn.send({ tick: scheduledTick, cmds: toSend } satisfies TickPacket);
      }

      dropStaleRemoteTicks(tick);
      dropStaleLocalTicks(tick);

      if (remoteAnnouncedUpToTick < tick || !remoteReceivedTicks.has(tick)) {
        waitingStallTicks++;
        if (waitingStallTicks > MAX_WAITING_STALL_TICKS) {
          failConnection('Connection closed: lockstep timeout waiting for peer');
        }
        return { ready: false, local: [], remote: [] };
      }

      waitingStallTicks = 0;

      const local = localQueue.get(tick) ?? [];
      if (local.length > 0) {
        queuedLocalCmdCount -= local.length;
        localQueue.delete(tick);
      }

      const remote = remoteQueue.get(tick) ?? [];
      if (remote.length > 0) {
        queuedRemoteCmdCount -= remote.length;
        remoteQueue.delete(tick);
      }

      return { ready: true, local, remote };
    },

    getStats() {
      return {
        waitingStallTicks,
        remoteAnnouncedUpToTick,
        currentDelayTicks: EXECUTION_DELAY_TICKS,
        lastPacketAgeMs: lastPacketReceivedAt === null ? null : Math.max(0, Date.now() - lastPacketReceivedAt),
        lastInboundSummary,
      };
    },

    destroy() {
      conn?.close();
      peer.destroy();
    },
  };

  // ── PeerJS setup ─────────────────────────────────────────────────────────────
  const runtimeNet = getRuntimePeerConfig(netMode);
  const runtimeIceServers = netMode === 'selfhost' ? await fetchRuntimeIceServers() : null;
  const peer = new Peer({
    host:   runtimeNet.peer.host,
    port:   runtimeNet.peer.port,
    path:   runtimeNet.peer.path,
    secure: runtimeNet.peer.secure,
    debug:  1,
    config: {
      iceServers: runtimeIceServers ?? runtimeNet.iceServers,
    },
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
        summarizeInbound(`reject tick=? reason=rate-limit`, 'warn');
        failConnection('Connection closed: inbound packet flood');
        return;
      }

      let approxSize = 0;
      try {
        approxSize = JSON.stringify(raw).length;
      } catch {
        summarizeInbound('reject tick=? reason=malformed-payload', 'warn');
        failConnection('Connection closed: malformed inbound payload');
        return;
      }
      if (approxSize > MAX_PACKET_BYTES) {
        summarizeInbound(`reject tick=? reason=packet-too-large bytes=${approxSize}`, 'warn');
        failConnection('Connection closed: inbound packet too large');
        return;
      }

      lastPacketReceivedAt = Date.now();
      const msg = raw as WireMessage;

      // Host receives guest's race → replies with full config → both start
      if (msg.type === 'hello' && role === 'host') {
        if (!safeHostConfig || !isRace(msg.race)) {
          summarizeInbound('reject tick=? type=hello reason=invalid-race', 'warn');
          session.status = 'error';
          session.statusMsg = 'Invalid multiplayer hello/config';
          session.onStatusChange?.();
          c.close();
          return;
        }
        summarizeInbound(`accept tick=? type=hello guestRace=${msg.race}`, 'info');
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
          summarizeInbound('reject tick=? type=config reason=invalid-config', 'warn');
          session.status = 'error';
          session.statusMsg = 'Invalid multiplayer config from host';
          session.onStatusChange?.();
          c.close();
          return;
        }
        summarizeInbound(`accept tick=? type=config map=${cfg.mapId} races=${cfg.race}/${cfg.guestRace}`, 'info');
        session.onConfig?.(cfg);
        return;
      }

      // Tick packet — only queue if there are actual commands
      const pkt = parseTickPacket(msg);
      if (pkt) {
        const summary = `accept tick=${pkt.tick} cmds=${pkt.cmds.length}`;
        if (pkt.tick !== lastAcceptedTickLogged && (pkt.tick % ACCEPT_LOG_INTERVAL_TICKS === 0 || pkt.cmds.length > 0)) {
          summarizeInbound(summary, 'info');
          lastAcceptedTickLogged = pkt.tick;
        } else {
          summarizeInbound(summary);
        }
        enqueueRemotePacket(pkt);
        return;
      }

      summarizeInbound('reject tick=? reason=unknown-payload-shape', 'warn');
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
