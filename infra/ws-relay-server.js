/* eslint-disable no-console */
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.WS_RELAY_PORT || 8082);
const PATH = process.env.WS_RELAY_PATH || '/ws-relay';
const MAX_MESSAGE_BYTES = Number(process.env.WS_RELAY_MAX_MESSAGE_BYTES || 16 * 1024);
const ROOM_TTL_MS = Number(process.env.WS_RELAY_ROOM_TTL_MS || 10 * 60 * 1000);

const rooms = new Map();

function now() { return Date.now(); }
function normalizeCode(v) { return String(v || '').trim().toUpperCase(); }
function send(ws, msg) {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(msg));
}
function closeWithError(ws, error) {
  send(ws, { type: 'error', error });
  ws.close(1008, error);
}

function ensureRoom(code) {
  let room = rooms.get(code);
  if (!room) {
    room = { host: null, guest: null, updatedAt: now() };
    rooms.set(code, room);
  }
  return room;
}

function cleanupRooms() {
  const t = now();
  for (const [code, room] of rooms) {
    if (!room.host && !room.guest) {
      rooms.delete(code);
      continue;
    }
    if (t - room.updatedAt > ROOM_TTL_MS) {
      if (room.host) room.host.close(1001, 'room-timeout');
      if (room.guest) room.guest.close(1001, 'room-timeout');
      rooms.delete(code);
    }
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server, path: PATH, maxPayload: MAX_MESSAGE_BYTES });

wss.on('connection', (ws) => {
  ws._roomCode = null;
  ws._role = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      closeWithError(ws, 'bad-json');
      return;
    }

    const type = msg?.type;
    if (type === 'host-create') {
      const code = normalizeCode(msg.code);
      if (!code) return closeWithError(ws, 'missing-code');
      const room = ensureRoom(code);
      if (room.host && room.host !== ws) return closeWithError(ws, 'host-exists');
      room.host = ws;
      room.updatedAt = now();
      ws._roomCode = code;
      ws._role = 'host';
      send(ws, { type: 'room-ready', role: 'host', code });
      if (room.guest) send(ws, { type: 'peer-joined' });
      return;
    }

    if (type === 'guest-join') {
      const code = normalizeCode(msg.code);
      if (!code) return closeWithError(ws, 'missing-code');
      const room = rooms.get(code);
      if (!room || !room.host) return closeWithError(ws, 'room-not-found');
      if (room.guest && room.guest !== ws) return closeWithError(ws, 'room-full');
      room.guest = ws;
      room.updatedAt = now();
      ws._roomCode = code;
      ws._role = 'guest';
      send(ws, { type: 'room-ready', role: 'guest', code });
      send(room.host, { type: 'peer-joined' });
      return;
    }

    if (type === 'relay-data') {
      const code = ws._roomCode;
      const role = ws._role;
      if (!code || !role) return closeWithError(ws, 'not-joined');
      const room = rooms.get(code);
      if (!room) return closeWithError(ws, 'room-not-found');
      const other = role === 'host' ? room.guest : room.host;
      room.updatedAt = now();
      if (other) send(other, { type: 'relay-data', payload: msg.payload });
      return;
    }

    if (type === 'leave') ws.close(1000, 'leave');
  });

  ws.on('close', () => {
    const code = ws._roomCode;
    const role = ws._role;
    if (!code || !role) return;
    const room = rooms.get(code);
    if (!room) return;

    if (role === 'host' && room.host === ws) {
      room.host = null;
      send(room.guest, { type: 'peer-left' });
    }
    if (role === 'guest' && room.guest === ws) {
      room.guest = null;
      send(room.host, { type: 'peer-left' });
    }
    room.updatedAt = now();
    if (!room.host && !room.guest) rooms.delete(code);
  });
});

setInterval(cleanupRooms, 30_000).unref();

server.listen(PORT, () => {
  console.log(`[ws-relay] listening on :${PORT}${PATH}`);
});
