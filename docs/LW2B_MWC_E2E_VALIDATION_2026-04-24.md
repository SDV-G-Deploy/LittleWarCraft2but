# LW2B MWC end-to-end validation (2026-04-24)

## Scope
Validated LW2B `mwc` transport path without protocol redesign:

`LW2B client transport -> /mwc websocket -> MultiWebCore room/match/tick flow`

Repo: `LittleWarCraft2but` (with live MWC server at `ws://127.0.0.1:8787/mwc`)

## What was validated
Using a LW2B-side integration probe (`src/net/mwc-transport.integration.test.ts`) against a real running MultiWebCore server:

1. connect (`conn.hello`/`conn.welcome`)
2. room create (host)
3. room join (guest)
4. ready + match start (`room.readySet` -> `match.assigned`/`match.started`)
5. tick/input flow (`tick.inputSubmit`)
6. remote command delivery (`tick.commit` payload unwrapped as `lw2b-wire`)

Also checked reconnect branch reachability from LW2B transport behavior:
- after socket close, LW2B transport does **not** auto-resume (`conn.resume` not implemented in LW2B transport path yet)

## Real status
- End-to-end transport path works for initial session and remote wire delivery.
- Reconnect/resync remains not wired in LW2B transport (known limit, not changed here).

## Failure points found and classification
### 1) Runtime config/readability gap (transport wiring/runtime)
- `mwc-transport.ts` previously read `import.meta.env.VITE_MWC_WS_URL` directly.
- In non-Vite runtime contexts this can break integration tooling/harnesses.
- Fix: guarded env lookup with Vite env + `process.env` + optional global override.

### 2) Input lead extraction gap (protocol field handling)
- Adapter only looked for `payload.inputLeadTicks` in `match.assigned`.
- MultiWebCore sends lead in `match.starting` and/or `match.assigned.matchConfig.inputLeadTicks`.
- Fix: read from `matchConfig` and `match.starting`.

### 3) Weak diagnostics during handshake/early-close (diagnostics)
- Early close/error did not include phase context.
- Fix: phase-aware diagnostics (`phase=...`) and better mapping for `error.auth` / `error.protocol` / `tick.resyncNeeded`.

## Diagnostics added
In `src/net/transports/mwc-transport.ts`:
- phase tracking (`connecting`, `hello_sent`, `welcomed`, `room_created`, `room_joined`, `match_assigned`, `match_started`)
- richer error strings including phase
- explicit handling for:
  - `match.starting` (lead ticks)
  - `tick.resyncNeeded` (reported clearly)
  - `error.auth` / `error.protocol` as connection errors
- clearer status text updates during room/join/match transitions

## Files changed
- `src/net/transports/mwc-transport.ts`
- `src/net/mwc-transport.integration.test.ts` (new)
- `docs/LW2B_MWC_E2E_VALIDATION_2026-04-24.md` (this report)

## Validation run
- `npx tsx src/net/mwc-transport.integration.test.ts`
- `npm test`
- `npx tsc -p tsconfig.json`

## Known limits (remaining)
1. LW2B transport still has no `conn.resume` send path, so reconnect/resync branch is not reachable from LW2B yet.
2. The integration probe requires a running MultiWebCore endpoint (`VITE_MWC_WS_URL`, default used: `ws://127.0.0.1:8787/mwc`).
