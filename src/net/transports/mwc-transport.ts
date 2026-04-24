import type { SessionStatusView, TransportCoreBridge, WireMessage } from '../transport-types';

type MwcEnvelope = {
  v: '0';
  type: string;
  id: string;
  ts: number;
  payload: Record<string, unknown>;
  sessionId?: string;
  roomId?: string;
  matchId?: string;
  playerId?: string;
  replyTo?: string;
};

type TickWireCommand = {
  kind: 'lw2b-wire';
  wire: WireMessage;
};

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getRuntimeMwcUrl(): string {
  const configured = (import.meta.env.VITE_MWC_WS_URL as string | undefined)?.trim();
  if (configured) return configured;
  if (typeof window === 'undefined') return 'ws://localhost:8788';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.hostname}:8788`;
}

function isTickWireMessage(msg: WireMessage): msg is Extract<WireMessage, { tick: number; cmds: unknown[] }> {
  return typeof (msg as { tick?: unknown }).tick === 'number' && Array.isArray((msg as { cmds?: unknown }).cmds);
}

function sendEnvelope(ws: WebSocket, envelope: MwcEnvelope): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(envelope));
}

export async function wireMwcTransport(params: {
  role: 'host' | 'guest';
  hostCode?: string;
  core: TransportCoreBridge;
  session: SessionStatusView;
}): Promise<{ destroyPeer: () => void }> {
  const { role, hostCode, core, session } = params;
  const ws = new WebSocket(getRuntimeMwcUrl());

  let sessionId: string | null = null;
  let roomId: string | null = null;
  let matchId: string | null = null;
  let playerId: string | null = null;
  let currentServerTick = 0;
  let inputLeadTicks = 2;
  let nextTargetTick = 0;
  let openToCore = false;

  function markConnecting(): void {
    session.status = 'connecting';
    session.statusMsg = role === 'host' ? 'Connecting to MultiWebCore…' : 'Joining MultiWebCore room…';
    session.onStatusChange?.();
  }

  function submitWireMessage(wire: WireMessage): void {
    if (!sessionId || !matchId || !playerId) return;
    const embeddedTick = isTickWireMessage(wire) ? wire.tick : currentServerTick;
    const targetTick = Math.max(embeddedTick + 2, currentServerTick + inputLeadTicks + 1, nextTargetTick);
    nextTargetTick = targetTick + 1;

    const payload = {
      targetTick,
      commands: [{ kind: 'lw2b-wire', wire } satisfies TickWireCommand],
      clientFrame: null,
    };

    sendEnvelope(ws, {
      v: '0',
      type: 'tick.inputSubmit',
      id: makeId('lw2b_mwc_input'),
      ts: Date.now(),
      payload,
      sessionId,
      roomId: roomId ?? undefined,
      matchId,
      playerId,
    });
  }

  core.attachTransport({
    send: (msg) => submitWireMessage(msg),
    close: () => ws.close(),
    isOpen: () => ws.readyState === WebSocket.OPEN && openToCore,
  });

  markConnecting();

  ws.addEventListener('open', () => {
    sendEnvelope(ws, {
      v: '0',
      type: 'conn.hello',
      id: makeId('lw2b_mwc_hello'),
      ts: Date.now(),
      payload: {
        clientName: `lw2b-${role}`,
        clientVersion: '0.1.0-spike',
        capabilities: [],
        resumeToken: null,
        lastConfirmedTick: null,
      },
    });
  });

  ws.addEventListener('message', (ev) => {
    if (typeof ev.data !== 'string') return;

    let msg: MwcEnvelope;
    try {
      msg = JSON.parse(ev.data) as MwcEnvelope;
    } catch {
      core.onConnError('mwc:bad-json');
      return;
    }

    if (msg.type === 'conn.welcome') {
      const incomingSessionId = msg.payload.sessionId;
      if (typeof incomingSessionId !== 'string') {
        core.onConnError('mwc:missing-session-id');
        return;
      }
      sessionId = incomingSessionId;
      if (role === 'host') {
        sendEnvelope(ws, {
          v: '0',
          type: 'room.create',
          id: makeId('lw2b_mwc_room_create'),
          ts: Date.now(),
          payload: {
            gameKey: 'lw2b-spike',
            visibility: 'private',
            roomConfig: {
              simulationRateHz: 20,
              inputLeadTicks: 2,
              minPlayers: 2,
            },
          },
          sessionId,
        });
      } else {
        const requestedRoom = (hostCode ?? '').trim();
        if (!requestedRoom) {
          core.onConnError('mwc:missing-room-code');
          return;
        }
        roomId = requestedRoom;
        sendEnvelope(ws, {
          v: '0',
          type: 'room.join',
          id: makeId('lw2b_mwc_room_join'),
          ts: Date.now(),
          payload: {
            roomId: requestedRoom,
            joinToken: null,
          },
          sessionId,
        });
      }
      return;
    }

    if (msg.type === 'room.created') {
      const incomingRoomId = msg.payload.roomId;
      if (typeof incomingRoomId === 'string') {
        roomId = incomingRoomId;
        session.code = incomingRoomId;
        session.status = 'waiting';
        session.statusMsg = `Room code: ${incomingRoomId}`;
        session.onStatusChange?.();
      }
      sendEnvelope(ws, {
        v: '0',
        type: 'room.readySet',
        id: makeId('lw2b_mwc_host_ready'),
        ts: Date.now(),
        payload: { ready: true },
        sessionId: sessionId ?? undefined,
        roomId: roomId ?? undefined,
      });
      return;
    }

    if (msg.type === 'room.joined') {
      const incomingRoomId = msg.payload.roomId;
      if (typeof incomingRoomId === 'string') roomId = incomingRoomId;
      sendEnvelope(ws, {
        v: '0',
        type: 'room.readySet',
        id: makeId('lw2b_mwc_guest_ready'),
        ts: Date.now(),
        payload: { ready: true },
        sessionId: sessionId ?? undefined,
        roomId: roomId ?? undefined,
      });
      return;
    }

    if (msg.type === 'match.assigned') {
      if (typeof msg.payload.matchId === 'string') matchId = msg.payload.matchId;
      if (typeof msg.payload.playerId === 'string') playerId = msg.payload.playerId;
      if (typeof msg.payload.inputLeadTicks === 'number' && Number.isFinite(msg.payload.inputLeadTicks)) {
        inputLeadTicks = Math.max(1, Math.floor(msg.payload.inputLeadTicks));
      }
      return;
    }

    if (msg.type === 'match.started') {
      openToCore = true;
      core.onConnOpen();
      return;
    }

    if (msg.type === 'tick.advance') {
      const tick = msg.payload.tick;
      if (typeof tick === 'number' && Number.isFinite(tick)) {
        currentServerTick = Math.max(currentServerTick, Math.floor(tick));
      }
      return;
    }

    if (msg.type === 'tick.commit') {
      const tick = msg.payload.tick;
      if (typeof tick === 'number' && Number.isFinite(tick)) {
        currentServerTick = Math.max(currentServerTick, Math.floor(tick));
      }
      const inputs = msg.payload.inputs;
      if (!Array.isArray(inputs)) return;
      for (const input of inputs) {
        if (!input || typeof input !== 'object') continue;
        const inputPlayerId = (input as { playerId?: unknown }).playerId;
        if (typeof inputPlayerId === 'string' && playerId && inputPlayerId === playerId) continue;
        const commands = (input as { commands?: unknown }).commands;
        if (!Array.isArray(commands)) continue;
        for (const command of commands) {
          if (!command || typeof command !== 'object') continue;
          const kind = (command as { kind?: unknown }).kind;
          const wire = (command as { wire?: unknown }).wire;
          if (kind === 'lw2b-wire' && wire && typeof wire === 'object') {
            core.onConnData(wire);
          }
        }
      }
      return;
    }

    if (msg.type === 'tick.inputRejected') {
      const code = msg.payload.code;
      core.onConnError(`mwc:input-rejected:${typeof code === 'string' ? code : 'unknown'}`);
      return;
    }

    if (msg.type.startsWith('error.')) {
      const code = msg.payload.code;
      core.onPeerError(`mwc:${msg.type}:${typeof code === 'string' ? code : 'unknown'}`);
    }
  });

  ws.addEventListener('close', () => {
    openToCore = false;
    core.onConnClose();
  });

  ws.addEventListener('error', () => {
    core.onConnError('mwc:websocket-error');
  });

  return { destroyPeer: () => ws.close() };
}
