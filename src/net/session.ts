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

// ─── Types ────────────────────────────────────────────────────────────────────

export type SessionStatus =
  | 'init'          // PeerJS opening
  | 'waiting'       // host: waiting for guest to connect
  | 'connecting'    // guest: dialling host
  | 'ready'         // data channel open, game can start
  | 'disconnected'  // peer left
  | 'error';

/** Config the host sends to guest on channel open. */
export interface SessionConfig {
  race:  string;   // host's playerRace  (races[0])
  mapId: number;
}

export interface NetSession {
  role:    'host' | 'guest';
  code:    string;          // room code = host's PeerJS ID
  status:  SessionStatus;
  statusMsg: string;

  onStatusChange?: () => void;
  /** Guest only: fired when host config arrives. Start game from here. */
  onConfig?: (cfg: SessionConfig) => void;

  push(cmd: NetCmd): void;
  exchange(tick: number): NetCmd[] | null;
  destroy(): void;
}

// ─── Internal message types ───────────────────────────────────────────────────

type WireMessage =
  | { type: 'config'; race: string; mapId: number }
  | TickPacket & { type?: undefined };  // tick packets have no 'type' field

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createSession(
  role:       'host' | 'guest',
  hostCode?:  string,          // required when role === 'guest'
  hostConfig?: SessionConfig,  // required when role === 'host'
): NetSession {

  let conn: DataConnection | null = null;
  let localBuf: NetCmd[] = [];
  const remoteQueue = new Map<number, NetCmd[]>();

  const session: NetSession = {
    role,
    code:      role === 'guest' ? (hostCode ?? '') : '',
    status:    'init',
    statusMsg: 'Initialising…',

    push(cmd) { localBuf.push(cmd); },

    exchange(tick) {
      const toSend = localBuf;
      localBuf = [];

      if (conn?.open) {
        conn.send({ tick, cmds: toSend } satisfies TickPacket);
      }

      const remote = remoteQueue.get(tick);
      if (remote !== undefined) {
        remoteQueue.delete(tick);
        return remote;
      }
      return null;
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
      // Host sends its config to guest as soon as the channel is ready
      if (role === 'host' && hostConfig) {
        c.send({ type: 'config', race: hostConfig.race, mapId: hostConfig.mapId } satisfies WireMessage);
      }
      session.status    = 'ready';
      session.statusMsg = 'Connected!';
      session.onStatusChange?.();
    });

    c.on('data', (raw) => {
      const msg = raw as WireMessage;

      // Config packet (guest only — host already has it)
      if (msg.type === 'config') {
        session.onConfig?.({ race: msg.race, mapId: msg.mapId });
        return;
      }

      // Tick packet
      if (typeof (msg as TickPacket).tick === 'number' && Array.isArray((msg as TickPacket).cmds)) {
        const pkt = msg as TickPacket;
        remoteQueue.set(pkt.tick, pkt.cmds);
      }
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
