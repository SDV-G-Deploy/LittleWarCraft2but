# LW2B Mini Design: WebSocket Relay Fallback Transport (2026-04-22)

## Goal
Add a **WebSocket relay fallback** for online matches when PeerJS/WebRTC cannot establish a usable data path, while keeping deterministic gameplay and lockstep semantics unchanged.

## Current touch points (code reality)
- `src/game.ts` already depends on an abstract-ish `NetSession` surface (`push`, `exchange`, `getStats`, `status`, `statusMsg`, `destroy`).
- `src/menu.ts` only needs `createSession(...)` and receives status/config callbacks.
- `src/net/session.ts` mixes two responsibilities today:
  1. transport/session wiring (PeerJS + handshake + connection lifecycle)
  2. lockstep tick queueing, validation, scheduling, timeout handling.

This makes `session.ts` the main insertion point for fallback support.

## Minimal target architecture
1. Keep lockstep logic and `NetCmd` protocol exactly as-is.
2. Introduce a tiny internal transport adapter interface.
3. Implement two adapters:
   - `PeerJsTransport` (existing behavior)
   - `WsRelayTransport` (new fallback)
4. Keep one shared lockstep/session core using adapter callbacks.

### Proposed transport adapter shape
```ts
interface TransportAdapter {
  kind: 'peerjs' | 'ws-relay';
  role: 'host' | 'guest';
  code: string;
  status: 'init' | 'waiting' | 'connecting' | 'ready' | 'disconnected' | 'error';
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

The lockstep/validation code in `session.ts` can then consume adapter events and stay transport-agnostic.

## WebSocket relay responsibilities (minimal room server)
A relay server is only for forwarding ordered JSON messages per room, not simulation.

Required responsibilities:
- Create/join room by code.
- Enforce max 2 clients per room.
- Tag each connection as `host`/`guest`.
- Broadcast messages to the other peer in arrival order.
- Emit join/leave/error events.
- Optional inactivity timeout cleanup for dead rooms.

Non-goals:
- No authoritative sim, no command validation semantics beyond basic size/rate limits.
- No replay/resync/state ownership.

## Wire/protocol strategy
Reuse existing wire messages from `session.ts`:
- `{type:'hello', race}`
- `{type:'config', race, guestRace, mapId}`
- tick packets `{tick, cmds}`

So gameplay/command protocol does not change.

## Session creation and fallback behavior
Keep external API stable:
- `createSession('host'|'guest', ... , netMode)` remains callable from menu.

Add one net mode variant (example):
- `'auto'` (try PeerJS first, then WS relay)

Practical sequence:
1. Start PeerJS adapter.
2. If peer status reaches `ready`, stay on PeerJS.
3. If PeerJS fails with connect/ICE timeout class before game starts, tear down and start WS relay adapter.
4. Preserve same `SessionConfig` handshake path and same `NetSession` interface to `game.ts`.

## Suggested migration plan (small safe steps)
1. **Extract shared lockstep core** inside `session.ts` (no behavior change).
2. **Wrap current PeerJS path as adapter** (still no behavior change).
3. **Add WS relay adapter + tiny Node relay service** (new capability).
4. **Add pre-game fallback in `createSession`** (`auto` mode or feature-flagged).
5. **Add focused tests** for adapter parity + startup handshake + timeout behavior.

## Risks / notes
- **Latency/jitter**: WS relay adds an extra hop, so fixed delay `+3` may be tighter on some routes.
- **Ordering guarantees**: WS preserves per-connection order, but server broadcast path must not reorder.
- **Backpressure**: avoid unbounded room queues in relay under slow clients.
- **Security/abuse**: rate limit message size/frequency server-side similarly to client guards.
- **Error taxonomy drift**: keep user-facing status/debug codes consistent across PeerJS and WS fallback.

## Why this is low-risk for LW2B
- Deterministic sim and `applyNetCmds` stay untouched.
- `game.ts` and most menu flow can remain unchanged.
- Scope is concentrated in `src/net/session.ts` + new relay service and env config.
- Existing command validation/timeouts remain reusable.
