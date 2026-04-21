const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.ICE_API_PORT || 8081);
const TURN_HOST = process.env.TURN_HOST || 'w2.kislota.today';
const TURN_PORT = Number(process.env.TURN_PORT || 3478);
const TURN_SECRET = process.env.TURN_STATIC_AUTH_SECRET;
const TURN_TTL_SECONDS = Number(process.env.TURN_TTL_SECONDS || 600);
const allowedOrigins = (process.env.ICE_ALLOWED_ORIGINS || process.env.ICE_ALLOWED_ORIGIN || 'https://w2.kislota.today')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!TURN_SECRET) {
  throw new Error('TURN_STATIC_AUTH_SECRET is required');
}

function makeTurnCredentials(sessionId = 'session') {
  const expiry = Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS;
  const username = `${expiry}:${sessionId}`;
  const credential = crypto.createHmac('sha1', TURN_SECRET).update(username).digest('base64');
  return { username, credential };
}

function buildIceConfig(sessionId) {
  const { username, credential } = makeTurnCredentials(sessionId);
  return {
    iceServers: [
      {
        urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
      },
      {
        urls: [
          `turn:${TURN_HOST}:${TURN_PORT}?transport=udp`,
          `turn:${TURN_HOST}:${TURN_PORT}?transport=tcp`,
        ],
        username,
        credential,
      },
    ],
    ttlSeconds: TURN_TTL_SECONDS,
  };
}

function setCors(res, origin) {
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  setCors(res, origin);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }

  if (req.method === 'GET' && req.url === '/api/ice') {
    const sessionId = crypto.randomBytes(8).toString('hex');
    const payload = JSON.stringify(buildIceConfig(sessionId));
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`ice api listening on :${PORT}`);
});
