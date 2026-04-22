import type { NetCmd, TickPacket } from './netcmd';
import type { Race, MapId, EntityKind } from '../types';

export type SessionStatus =
  | 'init'
  | 'waiting'
  | 'connecting'
  | 'ready'
  | 'disconnected'
  | 'error';

export interface SessionConfig {
  race: Race;
  guestRace: Race;
  mapId: MapId;
}

export interface SessionStats {
  waitingStallTicks: number;
  remoteAnnouncedUpToTick: number;
  remoteContiguousUpToTick: number;
  currentDelayTicks: number;
  outboundPendingTicks: number;
  queuedRemoteTicks: number;
  queuedLocalTicks: number;
  lastPacketAgeMs: number | null;
  lastInboundSummary: string | null;
  rtcIceConnectionState: RTCIceConnectionState | null;
  rtcConnectionState: RTCPeerConnectionState | null;
  rtcIceGatheringState: RTCIceGatheringState | null;
  netDebugSummary: string;
}

export interface NetSession {
  role: 'host' | 'guest';
  code: string;
  status: SessionStatus;
  statusMsg: string;
  netMode: NetMode;

  onStatusChange?: () => void;
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

interface FriendlyError {
  userMessage: string;
  debugCode: string;
}

export type NetMode = 'public' | 'selfhost';

type WireMessage =
  | { type: 'hello'; race: string }
  | { type: 'config'; race: string; guestRace: string; mapId: number }
  | (TickPacket & { type?: undefined });

const VALID_RACES = new Set<Race>(['human', 'orc']);
const VALID_MAP_IDS = new Set<MapId>([1, 2, 3, 4, 5, 6]);
const VALID_BUILDINGS = new Set<EntityKind>(['townhall', 'barracks', 'lumbermill', 'farm', 'wall', 'tower']);
const VALID_TRAIN_UNITS = new Set<EntityKind>(['worker', 'footman', 'archer', 'knight', 'peon', 'grunt', 'troll', 'ogreFighter']);
const VALID_OPENING_PLANS = new Set(['eco', 'tempo', 'pressure'] as const);
const VALID_UPGRADES = new Set<Extract<NetCmd, { k: 'upgrade' }>['upgrade']>([
  'meleeAttack',
  'armor',
  'buildingHp',
  'doctrineFieldTempo',
  'doctrineLineHold',
  'doctrineLongReach',
]);

const MAX_PACKET_BYTES = 16 * 1024;
const MAX_CMDS_PER_PACKET = 128;
const MAX_LOCAL_CMDS_PER_TICK = 128;
const MAX_QUEUED_REMOTE_TICKS = 128;
const MAX_QUEUED_REMOTE_CMDS = 1024;
const EXECUTION_DELAY_TICKS = 3;
const REMOTE_STALE_TICK_LIMIT = 64;
const INBOUND_RATE_WINDOW_MS = 1000;
const MAX_INBOUND_PACKETS_PER_WINDOW = 120;
const MAX_WAITING_STALL_TICKS = 600;
const ACCEPT_LOG_INTERVAL_TICKS = 40;

function summarizeCmdKinds(cmds: NetCmd[]): string {
  if (cmds.length === 0) return 'none';
  const counts = new Map<string, number>();
  for (const cmd of cmds) counts.set(cmd.k, (counts.get(cmd.k) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([kind, count]) => `${kind}:${count}`).join(',');
}

function summarizeBuildCmd(cmd: Extract<NetCmd, { k: 'build' }>): string {
  return `worker=${cmd.workerId} building=${cmd.building} at=${cmd.tx},${cmd.ty}`;
}

function logBuildCmds(scope: string, cmds: NetCmd[]): void {
  const builds = cmds.filter((cmd): cmd is Extract<NetCmd, { k: 'build' }> => cmd.k === 'build');
  if (builds.length === 0) return;
  console.info(`[net:build] ${scope} ${builds.map(summarizeBuildCmd).join(' | ')}`);
}

function isInt(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v); }
function isRace(v: unknown): v is Race { return typeof v === 'string' && VALID_RACES.has(v as Race); }
function isMapId(v: unknown): v is MapId { return isInt(v) && VALID_MAP_IDS.has(v as MapId); }
function isIdArray(v: unknown): v is number[] { return Array.isArray(v) && v.length <= 128 && v.every(isInt); }

type NetCmdByKind<K extends NetCmd['k']> = Extract<NetCmd, { k: K }>;
const NET_CMD_VALIDATORS: { [K in NetCmd['k']]: (cmd: NetCmdByKind<K>) => boolean } = {
  move: (cmd) => isIdArray(cmd.ids) && isInt(cmd.tx) && isInt(cmd.ty) && typeof cmd.atk === 'boolean',
  attack: (cmd) => isIdArray(cmd.ids) && isInt(cmd.targetId),
  gather: (cmd) => isIdArray(cmd.ids) && isInt(cmd.mineId),
  train: (cmd) => isInt(cmd.buildingId) && VALID_TRAIN_UNITS.has(cmd.unit),
  build: (cmd) => isInt(cmd.workerId) && VALID_BUILDINGS.has(cmd.building) && isInt(cmd.tx) && isInt(cmd.ty),
  stop: (cmd) => isIdArray(cmd.ids),
  set_plan: (cmd) => isInt(cmd.buildingId) && VALID_OPENING_PLANS.has(cmd.plan),
  rally: (cmd) => isInt(cmd.buildingId) && isInt(cmd.tx) && isInt(cmd.ty) && (cmd.plan === undefined || VALID_OPENING_PLANS.has(cmd.plan)),
  demolish: (cmd) => isInt(cmd.buildingId),
  resume: (cmd) => isInt(cmd.workerId) && isInt(cmd.siteId),
  upgrade: (cmd) => isInt(cmd.buildingId) && VALID_UPGRADES.has(cmd.upgrade),
};

function isNetCmd(v: unknown): v is NetCmd {
  if (!v || typeof v !== 'object') return false;
  const cmd = v as { k?: unknown };
  if (typeof cmd.k !== 'string') return false;
  if (!(cmd.k in NET_CMD_VALIDATORS)) return false;
  const validator = NET_CMD_VALIDATORS[cmd.k as NetCmd['k']] as (cmd: NetCmd) => boolean;
  return validator(v as NetCmd);
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

interface CoreTransport {
  send(msg: WireMessage): void;
  close(): void;
  isOpen(): boolean;
}

interface SessionCoreInit {
  role: 'host' | 'guest';
  hostCode?: string;
  hostConfig?: Pick<SessionConfig, 'race' | 'mapId'>;
  guestRace?: Race;
  netMode: NetMode;
  destroyPeer: () => void;
}

export interface SessionCore {
  session: NetSession;
  attachTransport(transport: CoreTransport): void;
  onConnOpen(): void;
  onConnData(raw: unknown): void;
  onConnClose(): void;
  onConnError(rawMessage: string): void;
  onPeerError(rawMessage: string): void;
  updateRtcState(state: {
    iceConnectionState?: RTCIceConnectionState | null;
    connectionState?: RTCPeerConnectionState | null;
    iceGatheringState?: RTCIceGatheringState | null;
  }): void;
}

export function createSessionCore(init: SessionCoreInit): SessionCore {
  const { role, hostCode, hostConfig, guestRace, netMode, destroyPeer } = init;
  const safeHostConfig = hostConfig && isRace(hostConfig.race) && isMapId(hostConfig.mapId) ? hostConfig : undefined;
  const safeGuestRace: Race = isRace(guestRace) ? guestRace : 'human';

  let transport: CoreTransport | null = null;
  let localBuf: NetCmd[] = [];
  const localQueue = new Map<number, NetCmd[]>();
  const remoteQueue = new Map<number, NetCmd[]>();
  const remoteReceivedTicks = new Set<number>();
  const outboundPending = new Map<number, NetCmd[]>();

  let queuedRemoteCmdCount = 0;
  let queuedLocalCmdCount = 0;
  let remoteAnnouncedUpToTick = -1;
  let remoteContiguousUpToTick = EXECUTION_DELAY_TICKS - 1;
  let waitingStallTicks = 0;
  let inboundWindowStartedAt = Date.now();
  let inboundPacketsInWindow = 0;
  let lastPacketReceivedAt: number | null = null;
  let lastInboundSummary: string | null = null;
  let lastAcceptedTickLogged = -1;
  let rtcIceConnectionState: RTCIceConnectionState | null = null;
  let rtcConnectionState: RTCPeerConnectionState | null = null;
  let rtcIceGatheringState: RTCIceGatheringState | null = null;

  function getNetDebugSummary(): string {
    const ice = rtcIceConnectionState ?? '-';
    const connState = rtcConnectionState ?? '-';
    const gather = rtcIceGatheringState ?? '-';
    const age = lastPacketReceivedAt === null ? 'pkt=none' : `pkt=${Math.max(0, Date.now() - lastPacketReceivedAt)}ms`;
    return `ice=${ice} pc=${connState} gather=${gather} ${age}`;
  }

  function classifyError(message: string, source: 'peer' | 'conn' | 'lockstep'): FriendlyError {
    const text = message.toLowerCase();
    if (source === 'lockstep' || text.includes('lockstep timeout')) return { userMessage: 'Connection timed out waiting for peer data (possible UDP/TURN path issue).', debugCode: 'LOCKSTEP_TIMEOUT' };
    if (text.includes('network') || text.includes('failed to fetch') || text.includes('disconnected')) return { userMessage: 'Signaling/network path failed (check backend reachability and origin policy).', debugCode: 'SIGNALING_NETWORK' };
    if (text.includes('ice') || text.includes('webrtc') || text.includes('turn') || text.includes('stun')) return { userMessage: 'WebRTC ICE negotiation failed (relay/TCP/TLS route may be blocked).', debugCode: 'ICE_NEGOTIATION' };
    if (text.includes('peer-unavailable')) return { userMessage: 'Room not found or host offline.', debugCode: 'PEER_UNAVAILABLE' };
    return { userMessage: source === 'peer' ? 'Peer signaling failed.' : source === 'conn' ? 'Peer data channel failed.' : 'Online connection failed.', debugCode: 'UNKNOWN' };
  }

  function failConnection(reason: string): void {
    const friendly = classifyError(reason, 'lockstep');
    session.status = 'error';
    session.statusMsg = `${friendly.userMessage} [${friendly.debugCode}]`;
    console.warn(`[net:fail] ${reason} | ${getNetDebugSummary()}`);
    session.onStatusChange?.();
    transport?.close();
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
    for (const queuedTick of remoteReceivedTicks) if (queuedTick < oldestAllowedTick) remoteReceivedTicks.delete(queuedTick);
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
    while (remoteReceivedTicks.has(remoteContiguousUpToTick + 1)) {
      remoteReceivedTicks.delete(remoteContiguousUpToTick + 1);
      remoteContiguousUpToTick++;
    }
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
    if (prev) prev.push(...cmds);
    else localQueue.set(tick, [...cmds]);
    queuedLocalCmdCount += cmds.length;

    while (localQueue.size > MAX_QUEUED_REMOTE_TICKS || queuedLocalCmdCount > MAX_QUEUED_REMOTE_CMDS) {
      const oldestTick = Math.min(...localQueue.keys());
      const dropped = localQueue.get(oldestTick);
      if (!dropped) break;
      queuedLocalCmdCount -= dropped.length;
      localQueue.delete(oldestTick);
    }
  }

  function queueOutboundPacket(tick: number, cmds: NetCmd[]): void {
    const prev = outboundPending.get(tick);
    if (!prev) {
      outboundPending.set(tick, [...cmds]);
      logBuildCmds(`queue tick=${tick}`, cmds);
      return;
    }
    if (cmds.length === 0) return;
    prev.push(...cmds);
    logBuildCmds(`merge tick=${tick}`, cmds);
  }

  function flushOutboundPackets(): void {
    if (!transport?.isOpen() || outboundPending.size === 0) return;
    const ticks = [...outboundPending.keys()].sort((a, b) => a - b);
    for (const pendingTick of ticks) {
      const cmds = outboundPending.get(pendingTick);
      if (!cmds) continue;
      console.info(`[net:out] tick=${pendingTick} cmds=${cmds.length} kinds=${summarizeCmdKinds(cmds)}`);
      logBuildCmds(`send tick=${pendingTick}`, cmds);
      transport.send({ tick: pendingTick, cmds });
      outboundPending.delete(pendingTick);
    }
  }

  const session: NetSession = {
    role,
    code: role === 'guest' ? (hostCode ?? '') : '',
    status: 'init',
    statusMsg: 'Initialising…',
    netMode,

    push(cmd) {
      if (localBuf.length < MAX_LOCAL_CMDS_PER_TICK) {
        localBuf.push(cmd);
        if (cmd.k === 'build') console.info(`[net:build] local-buffer ${summarizeBuildCmd(cmd)}`);
      }
    },

    exchange(tick) {
      const scheduledTick = tick + EXECUTION_DELAY_TICKS;
      const toSend = localBuf;
      localBuf = [];
      if (toSend.length > 0) {
        console.info(`[net:exchange] now=${tick} scheduled=${scheduledTick} cmds=${toSend.length} kinds=${summarizeCmdKinds(toSend)}`);
        logBuildCmds(`exchange now=${tick} scheduled=${scheduledTick}`, toSend);
      }
      enqueueLocalForTick(scheduledTick, toSend);
      queueOutboundPacket(scheduledTick, toSend);
      flushOutboundPackets();

      dropStaleRemoteTicks(tick);
      dropStaleLocalTicks(tick);

      if (tick > remoteContiguousUpToTick) {
        waitingStallTicks++;
        if (waitingStallTicks > MAX_WAITING_STALL_TICKS) {
          failConnection(`Connection closed: lockstep timeout waiting for peer tick=${tick} contiguous=${remoteContiguousUpToTick} announced=${remoteAnnouncedUpToTick}`);
        }
        return { ready: false, local: [], remote: [] };
      }

      waitingStallTicks = 0;

      const local = localQueue.get(tick) ?? [];
      if (local.length > 0) {
        queuedLocalCmdCount -= local.length;
        localQueue.delete(tick);
        logBuildCmds(`apply-local tick=${tick}`, local);
      }

      const remote = remoteQueue.get(tick) ?? [];
      if (remote.length > 0) {
        queuedRemoteCmdCount -= remote.length;
        remoteQueue.delete(tick);
        logBuildCmds(`apply-remote tick=${tick}`, remote);
      }

      return { ready: true, local, remote };
    },

    getStats() {
      return {
        waitingStallTicks,
        remoteAnnouncedUpToTick,
        remoteContiguousUpToTick,
        currentDelayTicks: EXECUTION_DELAY_TICKS,
        outboundPendingTicks: outboundPending.size,
        queuedRemoteTicks: remoteQueue.size,
        queuedLocalTicks: localQueue.size,
        lastPacketAgeMs: lastPacketReceivedAt === null ? null : Math.max(0, Date.now() - lastPacketReceivedAt),
        lastInboundSummary,
        rtcIceConnectionState,
        rtcConnectionState,
        rtcIceGatheringState,
        netDebugSummary: getNetDebugSummary(),
      };
    },

    destroy() {
      transport?.close();
      destroyPeer();
    },
  };

  return {
    session,
    attachTransport(nextTransport) {
      transport = nextTransport;
    },
    onConnOpen() {
      flushOutboundPackets();
      if (!transport) return;
      if (role === 'guest') {
        transport.send({ type: 'hello', race: safeGuestRace });
        session.statusMsg = 'Connected! Sending race…';
      } else {
        session.statusMsg = 'Guest connected!';
      }
      session.status = 'ready';
      session.onStatusChange?.();
    },
    onConnData(raw) {
      if (!enforceInboundRateLimit()) {
        summarizeInbound('reject tick=? reason=rate-limit', 'warn');
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

      if (msg.type === 'hello' && role === 'host') {
        if (!safeHostConfig || !isRace(msg.race)) {
          summarizeInbound('reject tick=? type=hello reason=invalid-race', 'warn');
          session.status = 'error';
          session.statusMsg = 'Invalid multiplayer hello/config';
          session.onStatusChange?.();
          transport?.close();
          return;
        }
        summarizeInbound(`accept tick=? type=hello guestRace=${msg.race}`, 'info');
        const fullCfg: SessionConfig = { race: safeHostConfig.race, guestRace: msg.race, mapId: safeHostConfig.mapId };
        transport?.send({ type: 'config', ...fullCfg });
        session.onConfig?.(fullCfg);
        return;
      }

      if (msg.type === 'config' && role === 'guest') {
        const cfg = parseConfig(msg);
        if (!cfg) {
          summarizeInbound('reject tick=? type=config reason=invalid-config', 'warn');
          session.status = 'error';
          session.statusMsg = 'Invalid multiplayer config from host';
          session.onStatusChange?.();
          transport?.close();
          return;
        }
        summarizeInbound(`accept tick=? type=config map=${cfg.mapId} races=${cfg.race}/${cfg.guestRace}`, 'info');
        session.onConfig?.(cfg);
        return;
      }

      const pkt = parseTickPacket(msg);
      if (pkt) {
        const summary = `accept tick=${pkt.tick} cmds=${pkt.cmds.length}`;
        if (pkt.tick !== lastAcceptedTickLogged && (pkt.tick % ACCEPT_LOG_INTERVAL_TICKS === 0 || pkt.cmds.length > 0)) {
          summarizeInbound(summary, 'info');
          lastAcceptedTickLogged = pkt.tick;
        } else summarizeInbound(summary);

        if (pkt.cmds.length > 0) {
          console.info(`[net:in] tick=${pkt.tick} cmds=${pkt.cmds.length} kinds=${summarizeCmdKinds(pkt.cmds)}`);
          logBuildCmds(`recv tick=${pkt.tick}`, pkt.cmds);
        }
        enqueueRemotePacket(pkt);
        return;
      }

      summarizeInbound('reject tick=? reason=unknown-payload-shape', 'warn');
    },
    onConnClose() {
      if (session.status === 'error') {
        session.onStatusChange?.();
        return;
      }
      session.status = 'disconnected';
      session.statusMsg = 'Opponent disconnected';
      session.onStatusChange?.();
    },
    onConnError(rawMessage) {
      const friendly = classifyError(rawMessage, 'conn');
      session.status = 'error';
      session.statusMsg = `${friendly.userMessage} [${friendly.debugCode}]`;
      console.warn(`[net:conn-error] ${rawMessage} | ${getNetDebugSummary()}`);
      session.onStatusChange?.();
    },
    onPeerError(rawMessage) {
      const friendly = classifyError(rawMessage, 'peer');
      session.status = 'error';
      session.statusMsg = `${friendly.userMessage} [${friendly.debugCode}]`;
      console.warn(`[net:peer-error] ${rawMessage} | ${getNetDebugSummary()}`);
      session.onStatusChange?.();
    },
    updateRtcState(state) {
      if (state.iceConnectionState !== undefined) rtcIceConnectionState = state.iceConnectionState;
      if (state.connectionState !== undefined) rtcConnectionState = state.connectionState;
      if (state.iceGatheringState !== undefined) rtcIceGatheringState = state.iceGatheringState;
    },
  };
}
