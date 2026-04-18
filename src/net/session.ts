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

/** Full config agreed by both sides before the game starts. */
export interface SessionConfig {
  race:      string;   // host's race  → races[0]
  guestRace: string;   // guest's race → races[1]
  mapId:     number;
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

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createSession(
  role:         'host' | 'guest',
  hostCode?:    string,                           // required when role === 'guest'
  hostConfig?:  Pick<SessionConfig, 'race' | 'mapId'>,  // required when role === 'host'
  guestRace?:   string,                           // required when role === 'guest'
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

      // Only send if there are commands (saves bandwidth; keepalive is PeerJS's job)
      if (conn?.open && toSend.length > 0) {
        conn.send({ tick, cmds: toSend } satisfies TickPacket);
      }

      // Drain ALL buffered remote commands regardless of tick tag.
      // With no-lockstep netcode, commands are applied as soon as they arrive on
      // the next sim tick — exact-tick matching would discard every late packet.
      if (remoteQueue.size === 0) return null;
      const allCmds: NetCmd[] = [];
      for (const cmds of remoteQueue.values()) allCmds.push(...cmds);
      remoteQueue.clear();
      return allCmds.length > 0 ? allCmds : null;
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
        c.send({ type: 'hello', race: guestRace ?? 'human' } satisfies WireMessage);
        session.statusMsg = 'Connected! Sending race…';
      } else {
        session.statusMsg = 'Guest connected!';
      }
      session.status = 'ready';
      session.onStatusChange?.();
    });

    c.on('data', (raw) => {
      const msg = raw as WireMessage;

      // Host receives guest's race → replies with full config → both start
      if (msg.type === 'hello' && role === 'host' && hostConfig) {
        const fullCfg: SessionConfig = {
          race:      hostConfig.race,
          guestRace: msg.race,
          mapId:     hostConfig.mapId,
        };
        c.send({ type: 'config', ...fullCfg } satisfies WireMessage);
        session.onConfig?.(fullCfg);
        return;
      }

      // Guest receives full config from host
      if (msg.type === 'config' && role === 'guest') {
        session.onConfig?.({ race: msg.race, guestRace: msg.guestRace, mapId: msg.mapId });
        return;
      }

      // Tick packet — only queue if there are actual commands
      if (typeof (msg as TickPacket).tick === 'number' && Array.isArray((msg as TickPacket).cmds)) {
        const pkt = msg as TickPacket;
        if (pkt.cmds.length > 0) remoteQueue.set(pkt.tick, pkt.cmds);
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
