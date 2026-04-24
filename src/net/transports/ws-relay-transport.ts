import type { TransportCoreBridge, SessionStatusView, WireMessage } from '../transport-types';

interface RelayServerEvent {
  type: 'room-ready' | 'peer-joined' | 'peer-left' | 'relay-data' | 'error';
  payload?: unknown;
  role?: 'host' | 'guest';
  code?: string;
  error?: string;
}

interface RelayClientEvent {
  type: 'host-create' | 'guest-join' | 'relay-data' | 'leave';
  code?: string;
  payload?: WireMessage;
}

function generateRoomCode(len = 6): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < len; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

function getRuntimeRelayUrl(): string {
  const configured = (import.meta.env.VITE_WS_RELAY_URL as string | undefined)?.trim();
  if (configured) return configured;
  if (typeof window === 'undefined') return 'ws://localhost:8082/ws-relay';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws-relay`;
}

function safeParseRelayEvent(raw: string): RelayServerEvent | null {
  try {
    const parsed = JSON.parse(raw) as RelayServerEvent;
    return parsed && typeof parsed === 'object' && typeof parsed.type === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function sendJson(ws: WebSocket, msg: RelayClientEvent): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
}

export async function wireWsRelayTransport(params: {
  role: 'host' | 'guest';
  hostCode?: string;
  core: TransportCoreBridge;
  session: SessionStatusView;
}): Promise<{ destroyPeer: () => void }> {
  const { role, hostCode, core, session } = params;
  const code = role === 'host' ? generateRoomCode() : (hostCode ?? '').trim();
  const ws = new WebSocket(getRuntimeRelayUrl());

  core.attachTransport({
    send: (msg) => sendJson(ws, { type: 'relay-data', payload: msg }),
    close: () => {
      if (ws.readyState === WebSocket.OPEN) sendJson(ws, { type: 'leave' });
      ws.close();
    },
    isOpen: () => ws.readyState === WebSocket.OPEN,
  });

  if (role === 'host') {
    session.code = code;
    session.status = 'waiting';
    session.statusMsg = `Room code: ${code}`;
    session.onStatusChange?.();
  } else {
    session.status = 'connecting';
    session.statusMsg = 'Connecting to relay host…';
    session.onStatusChange?.();
  }

  ws.addEventListener('open', () => {
    if (role === 'host') sendJson(ws, { type: 'host-create', code });
    else sendJson(ws, { type: 'guest-join', code });
  });

  ws.addEventListener('message', (ev) => {
    if (typeof ev.data !== 'string') return;
    const msg = safeParseRelayEvent(ev.data);
    if (!msg) {
      core.onConnError('relay:bad-json');
      return;
    }

    if (msg.type === 'room-ready') {
      if (msg.code) session.code = msg.code;
      if (msg.role === 'guest') core.onConnOpen();
      return;
    }

    if (msg.type === 'peer-joined') {
      core.onConnOpen();
      return;
    }

    if (msg.type === 'relay-data') {
      core.onConnData(msg.payload);
      return;
    }

    if (msg.type === 'peer-left') {
      core.onConnClose();
      return;
    }

    if (msg.type === 'error') {
      core.onPeerError(`relay:${msg.error ?? 'unknown'}`);
    }
  });

  ws.addEventListener('close', () => core.onConnClose());
  ws.addEventListener('error', () => core.onConnError('relay:websocket-error'));

  return { destroyPeer: () => ws.close() };
}
