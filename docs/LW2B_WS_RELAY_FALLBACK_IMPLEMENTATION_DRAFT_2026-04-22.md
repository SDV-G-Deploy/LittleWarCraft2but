# LW2B WebSocket Relay Fallback: Implementation Draft (2026-04-22)

## Goal
Add a **WebSocket relay fallback** for difficult networks while preserving:
- deterministic simulation
- existing `NetCmd` protocol
- existing lockstep scheduling semantics
- existing gameplay code in `src/game.ts`

This draft is intentionally practical and shaped around the current codebase.

## Current code reality

### Main touch points
- `src/net/session.ts`
  - currently mixes transport wiring and lockstep/session logic
  - this is the main extraction point
- `src/game.ts`
  - already uses a narrow `NetSession` surface:
    - `push`
    - `exchange`
    - `getStats`
    - `status`
    - `statusMsg`
    - `destroy`
- `src/menu.ts`
  - mostly only cares about:
    - `createSession(...)`
    - `onConfig`
    - `status/statusMsg`

### Existing mode naming constraint
Current `NetMode` is:
- `'public' | 'selfhost'`

That is currently about **PeerJS backend choice**, not about **transport type**.
So the cleanest next step is to avoid overloading that type.

## Recommended model split
Separate two concepts:

### 1. Signaling / backend preset
Keep existing PeerJS preset concept:
```ts
export type PeerBackendMode = 'public' | 'selfhost';
```

### 2. Transport selection
Add a new transport selector:
```ts
export type TransportMode = 'peerjs' | 'ws-relay' | 'auto';
```

This avoids confusing transport with backend host config.

## Proposed file structure

### Client-side
```text
src/net/
  session.ts                 // createSession + top-level composition
  session-core.ts            // shared lockstep/session logic
  transport-types.ts         // adapter interfaces and shared transport enums
  transports/
    peerjs-transport.ts
    ws-relay-transport.ts
```

### Server-side
Suggested minimal relay service:
```text
realtime/ws-relay-server.js
```

If desired later, it can be folded into an existing Node realtime service, but a small standalone process is the safest first implementation.

## Client-side target interfaces

### transport-types.ts
```ts
export type TransportKind = 'peerjs' | 'ws-relay';
export type TransportMode = 'peerjs' | 'ws-relay' | 'auto';
export type TransportStatus = 'init' | 'waiting' | 'connecting' | 'ready' | 'disconnected' | 'error';

export interface TransportAdapter {
  kind: TransportKind;
  role: 'host' | 'guest';
  code: string;
  status: TransportStatus;
  statusMsg: string;

  onOpen?: () => void;
  onData?: (msg: unknown) => void;
  onClose?: () => void;
  onError?: (err: Error) => void;
  onStatusChange?: () => void;

  send(msg: unknown): void;
  destroy(): void;
}
```

## SessionCore shape
`session-core.ts` should own:
- local command queue
- remote tick queue
- execution delay
- packet validation
- lockstep timeout handling
- stats collection
- config handshake state machine

It should **not** care whether data arrived through PeerJS or WSS.

### Suggested constructor shape
```ts
createSessionCore({
  adapter,
  role,
  code,
  onConfig,
  initialConfig,
  guestRace,
  peerBackendMode,
})
```

The core should expose the same `NetSession` interface already used by `game.ts`.

## session.ts after refactor
`session.ts` becomes orchestration instead of a giant mixed implementation.

Responsibilities:
- normalize creation options
- choose transport based on `transportMode`
- create `PeerJsTransport` or `WsRelayTransport`
- create `SessionCore`
- if `transportMode === 'auto'`, attempt PeerJS first, then fallback to ws-relay **before match start only**

## Proposed `createSession` API evolution
Current call sites in `menu.ts` look like:
```ts
createSession('host', undefined, { race, mapId }, undefined, netMode)
createSession('guest', code, undefined, guestRace, netMode)
```

Recommended safe evolution:
```ts
createSession(
  role,
  code?,
  hostCfg?,
  guestRace?,
  peerBackendMode: PeerBackendMode = 'selfhost',
  transportMode: TransportMode = 'peerjs',
)
```

To minimize churn, a second options-object refactor can wait.

## Pseudocode: `createSession(...)`
```ts
export async function createSession(...) {
  if (transportMode === 'peerjs') {
    const adapter = await createPeerJsTransport(...);
    return createSessionCore({ adapter, ... });
  }

  if (transportMode === 'ws-relay') {
    const adapter = await createWsRelayTransport(...);
    return createSessionCore({ adapter, ... });
  }

  // auto
  try {
    const peerAdapter = await createPeerJsTransport(...);
    return createSessionCore({
      adapter: peerAdapter,
      ...,
      fallbackFactory: async () => createWsRelayTransport(...),
      allowPregameFallback: true,
    });
  } catch {
    const wsAdapter = await createWsRelayTransport(...);
    return createSessionCore({ adapter: wsAdapter, ... });
  }
}
```

## Pseudocode: PeerJsTransport
```ts
export async function createPeerJsTransport(...): Promise<TransportAdapter> {
  const peer = new Peer(...);
  let conn: DataConnection | null = null;

  const adapter: TransportAdapter = {
    kind: 'peerjs',
    role,
    code,
    status: role === 'host' ? 'waiting' : 'connecting',
    statusMsg: role === 'host' ? 'Waiting for guest...' : 'Connecting...',
    send(msg) { conn?.send(msg); },
    destroy() {
      conn?.close();
      peer.destroy();
    },
  };

  // wire peer open / connection / error / data / close
  // update adapter.status + adapter.statusMsg
  // emit adapter callbacks

  return adapter;
}
```

## Pseudocode: WsRelayTransport
```ts
export async function createWsRelayTransport(...): Promise<TransportAdapter> {
  const ws = new WebSocket(url);

  const adapter: TransportAdapter = {
    kind: 'ws-relay',
    role,
    code,
    status: role === 'host' ? 'waiting' : 'connecting',
    statusMsg: role === 'host' ? 'Waiting for guest via relay...' : 'Connecting to relay...',
    send(msg) {
      ws.send(JSON.stringify({ type: 'relay-data', payload: msg }));
    },
    destroy() {
      ws.close();
    },
  };

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: role === 'host' ? 'host-create' : 'guest-join', code }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    // lifecycle events -> status changes
    // relay-data -> adapter.onData?.(msg.payload)
  };

  ws.onclose = () => {
    adapter.status = 'disconnected';
    adapter.onClose?.();
    adapter.onStatusChange?.();
  };

  ws.onerror = () => {
    adapter.status = 'error';
    adapter.onError?.(new Error('ws-relay-error'));
    adapter.onStatusChange?.();
  };

  return adapter;
}
```

## Minimal relay wire protocol
Keep it tiny and explicit.

### Client -> server
```json
{ "type": "host-create", "code": "ABCD" }
{ "type": "guest-join", "code": "ABCD" }
{ "type": "relay-data", "payload": { ...existing wire message... } }
{ "type": "leave" }
```

### Server -> client
```json
{ "type": "room-ready", "role": "host" }
{ "type": "peer-joined" }
{ "type": "peer-left" }
{ "type": "relay-data", "payload": { ... } }
{ "type": "error", "code": "room-full" }
```

## Minimal relay server responsibilities

### Must do
- room map by code
- max 2 peers
- explicit host/guest role assignment
- forward `relay-data` in arrival order
- cleanup on close
- message size limits
- packet rate limits
- idle room timeout cleanup

### Must not do yet
- run game sim
- rewrite commands
- apply lockstep logic server-side
- own authoritative world state

## Suggested relay server pseudocode
```js
const rooms = new Map();

function getOrCreateRoom(code) {
  let room = rooms.get(code);
  if (!room) {
    room = { host: null, guest: null, updatedAt: Date.now() };
    rooms.set(code, room);
  }
  return room;
}

wss.on('connection', (ws) => {
  let joinedRoom = null;
  let joinedRole = null;

  ws.on('message', (raw) => {
    const msg = safeParse(raw);
    if (!msg) return closeWithError(ws, 'bad-json');

    if (msg.type === 'host-create') {
      // attach as host if free
    } else if (msg.type === 'guest-join') {
      // attach as guest if room+slot available
    } else if (msg.type === 'relay-data') {
      // find opposite peer and forward payload
    }
  });

  ws.on('close', () => {
    // detach peer, notify other side, cleanup room if empty
  });
});
```

## Fallback policy
First implementation should be conservative.

### Recommended rule
Fallback from PeerJS to ws-relay only if:
- connection failed before `ready`, or
- transport died before match actually began

### Do not do yet
- mid-match hot migration from PeerJS to WSS
- dual transport active at once
- background transport racing after game start

## UI / menu impact
`src/menu.ts` should grow only a little.

### Recommended additions
- keep existing backend selector if needed
- add transport selector:
  - `Direct (PeerJS)`
  - `Relay (WSS)`
  - `Auto`

### Recommended default
- `Auto`
for self-hosted production once relay is ready

### Status copy examples
- `Trying direct connection...`
- `Direct connection failed, switching to relay...`
- `Connected via relay`

That will make network behavior much clearer to users.

## Environment/config additions
Likely new client env:
```env
VITE_WS_RELAY_URL=wss://rts.kislota.today/ws-relay
```

Existing PeerJS env can stay separate:
```env
VITE_PEER_HOST=...
VITE_PEER_PORT=...
VITE_PEER_PATH=...
VITE_PEER_SECURE=...
VITE_ICE_API_URL=...
```

## Recommended implementation order

### Step 1
Extract session core from `src/net/session.ts`
- no behavior change
- no new transport yet

### Step 2
Wrap current PeerJS behavior in `peerjs-transport.ts`
- still no behavior change

### Step 3
Add `ws-relay-transport.ts`
- manual transport select first

### Step 4
Add relay service
- tiny room-forwarding server

### Step 5
Add `auto` mode
- pre-game fallback only

### Step 6
Tune lockstep delay if relay paths need slightly more slack

## Checkpoints / tests

### Refactor parity
- existing PeerJS host/join still works
- existing menu flow still works
- `onConfig` still fires as before
- `game.ts` does not need structural changes

### WS relay parity
- host creates room
- guest joins room
- `hello/config` handshake succeeds
- both sides reach `ready`
- tick packets flow both ways
- disconnect propagates

### Fallback parity
- `auto` uses PeerJS when healthy
- `auto` switches to ws-relay on pre-game connect failure
- status messages clearly reveal chosen mode

## Main risks
- relay mode may need slightly looser waiting thresholds than direct path
- `session.ts` extraction may expose hidden assumptions between transport and lockstep
- status/error handling can become messy if not normalized early
- if relay service is folded into an existing process too early, debugging may get harder

## Current recommendation
The next practical coding move should be:
1. extract shared session core
2. wrap PeerJS into a transport adapter
3. stop and verify parity
4. only then add ws-relay

This gives the smallest risk path toward a real hard-network fallback.
