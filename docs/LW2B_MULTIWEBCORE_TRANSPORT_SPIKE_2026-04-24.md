# LW2B MultiWebCore transport spike (2026-04-24)

## Chosen seam

The seam is LW2B's existing transport adapter boundary:

- `src/net/session.ts` (transport selection/orchestration)
- `src/net/session-core.ts` (transport-agnostic lockstep/handshake core)
- `src/net/transports/*` (concrete transport wiring)

Instead of rewriting gameplay or lockstep internals, this spike adds a third transport adapter (`mwc`) beside `peerjs` and `ws-relay`.

## What was added

- New transport mode: `mwc`
- New adapter: `src/net/transports/mwc-transport.ts`
  - opens WebSocket to MultiWebCore server
  - executes minimal protocol path:
    - `conn.hello`
    - host: `room.create`
    - guest: `room.join`
    - both: `room.readySet`
    - waits for `match.assigned` / `match.started`
  - uses `tick.inputSubmit` with command envelope `{ kind: 'lw2b-wire', wire: ... }`
  - consumes `tick.commit` and forwards only remote player's `lw2b-wire` payloads into LW2B core via `core.onConnData(...)`
- Online menu now exposes `MWC` transport selection and `?transport=mwc`
- i18n labels/hint for MWC transport mode

## Env/config

- New optional env for LW2B client: `VITE_MWC_WS_URL`
  - default fallback: same-origin `/mwc` (`ws://localhost:8787/mwc` without browser origin, or `wss://<host>/mwc` from browser origin)

## Current status of the spike

This is a real integration path at transport level:

- LW2B can now route its wire messages through MultiWebCore tick pipeline (instead of direct peer channel), using the existing LW2B session core unchanged.
- This is intentionally thin and provisional, designed to prove the boundary and message flow.

## Known limitations / assumptions

1. Commands are tunneled as opaque `lw2b-wire` payloads inside `tick.inputSubmit`.
   - good for spike speed
   - not final protocol shape
2. Target tick mapping is heuristic (`max(embeddedTick+2, serverTick+inputLead+1, monotonic)`), not yet tuned from live telemetry.
3. No reconnect/resync integration yet on LW2B side for this transport.
4. This assumes a running MultiWebCore server implementing current v0 message families.
5. Room code for guests is MultiWebCore `roomId`.

## Why this seam

It is the smallest game-facing proof:

- no simulation rewrite
- no broad netcode refactor
- no core overreach into LW2B semantics

It validates that LW2B can move from peer transport assumptions to a server-relayed path through the already-extracted transport boundary.
