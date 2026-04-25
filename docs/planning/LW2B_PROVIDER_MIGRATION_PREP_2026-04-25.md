# LW2B provider migration prep (2026-04-25)

Purpose: migration-ready source audit for moving realtime backend off current Helsinki contour toward a provider/route profile with better Russia reachability.

Scope: networking backend only (signaling/ICE/TURN/relay). Gameplay simulation model stays unchanged.

## 1) Current source inventory (migration source of truth)

## 1.1 Live vs historical

- **Current canonical docs**: `README.md`, `NETWORK_ARCHITECTURE.md`, `docs/LW2B_CURRENT_STATE.md`
- **Historical snapshot (do not treat as current config)**: `docs/archive/2026-04/LW2B_HELSINKI_REALTIME_STATUS_2026-04-22.md`
- **Historical domains still present in templates/examples**: `game.example.com` (safe placeholder), and prior `rts.kislota.today` phase in archived notes

## 1.2 Host roles (current stack shape)

- **Frontend/public entry**: `w2.kislota.today` (static app)
- **Realtime contour (actively movable)**: signaling + ICE + TURN + ws-relay + MWC websocket path
- **No authoritative game server**: deterministic sim remains client-side

## 1.3 Services and ports

From `infra/compose.yaml` + `infra/nginx.conf`:

- `peerjs` (container `9000`, proxied)
- `ice-api` (container `8081`, proxied as `/api/ice`)
- `ws-relay` (container `8082`, proxied as `/ws-relay`)
- `mwc` (container `8787`, proxied as `/mwc`)
- `nginx` (public `80`, `443`)
- `coturn`:
  - `3478/tcp+udp`
  - `${TURN_TLS_PORT}/tcp` (default `5349`)
  - relay range `49160-49200/tcp+udp`

## 1.4 Runtime config sources

- **Client build-time env**: `.env.example`, GitHub Actions `/.github/workflows/deploy.yml`
- **Infra env**: `infra/.env` (runtime), `infra/.env.example` (template)
- **ICE generation logic**: `infra/ice-server.js`
- **Reverse proxy/routing/CORS**: `infra/nginx.conf`
- **Transport fallback server**: `infra/ws-relay-server.js`

## 1.5 Domain and cert/deploy contours

- TLS termination and path routing handled by nginx
- Cert paths expected from Let’s Encrypt-style layout in `infra/certbot/conf/live/<domain>/...`
- TURN TLS cert/key consumed by coturn from mounted cert path
- Frontend build deploys via GitHub Pages workflow; backend runtime is separate operational contour

## 2) Migration checklist

Use this as execution checklist for provider move.

## 2.1 Must preserve

- [ ] Path contract: `/peerjs`, `/api/ice`, `/ws-relay`, `/mwc`
- [ ] ICE API behavior: short-lived TURN credentials (HMAC secret model)
- [ ] TURN transports: UDP+TCP on `3478`, TLS fallback (`turns`) on TLS port
- [ ] Allowed frontend origins for ICE/CORS aligned with actual frontend hosts
- [ ] Existing client env interface (`VITE_PEER_*`, `VITE_ICE_API_URL`, `VITE_WS_RELAY_URL`, `VITE_MWC_WS_URL`)

## 2.2 Must rotate on cutover

- [ ] `TURN_STATIC_AUTH_SECRET`
- [ ] Any long-lived TURN username/password fallback values still stored in CI/repo variables
- [ ] TLS certificates on new host (new issuance or clean copy under controlled process)

## 2.3 Must recreate on target provider

- [ ] Docker/runtime stack (`peerjs`, `nginx`, `coturn`, `ice-api`, `ws-relay`, optional `mwc`)
- [ ] Firewall rules for required ports/protocols
- [ ] DNS records and health checks
- [ ] Cert renewal workflow and post-renew reload/restart policy
- [ ] Logging baseline for `/api/ice`, `/peerjs` websocket upgrades, TURN auth/alloc failures

## 2.4 Intentionally drop / avoid carrying forward

- [ ] Historical domain coupling and assumptions from archived Helsinki phase
- [ ] Secrets/default creds in build-time defaults
- [ ] Any stale one-off manual workaround that is not documented in current canonical docs

## 3) Provider comparison template (LW2B-focused)

Score each provider 1..5 (5 best). Keep notes evidence-based from real field tests.

| Criterion (LW2B) | Weight | VDSina NL | Aeza | Notes |
|---|---:|---:|---:|---|
| Russia network reachability (real users) | 5 |  |  | |
| UDP stability for TURN 3478/relay range | 5 |  |  | |
| TCP/TLS 443 and websocket reliability | 5 |  |  | |
| ASN/provider diversity vs current contour | 4 |  |  | |
| Packet loss/jitter to RU + EU probes | 4 |  |  | |
| IPv4 quality (clean reputation, low blocking) | 4 |  |  | |
| Operational simplicity (rebuild/recover speed) | 3 |  |  | |
| Abuse/anti-VoIP policy risk | 3 |  |  | |
| Cost at 1-2 vCPU pilot size | 2 |  |  | |
| Total weighted score | — |  |  | |

Acceptance gate before canonical switch:
- At least one RU path can create/join and finish a real match with stable command flow.
- No regression vs current baseline for non-RU users.

## 4) Cutover skeleton (parallel bring-up, low-risk)

## Phase A, parallel target bring-up

1. Provision target VPS and install stack from `infra/` with target-specific env.
2. Use **new backend hostname** (prefer neutral, e.g. `rtc.<domain>`), keep current production unchanged.
3. Verify health endpoints and websocket upgrades.
4. Verify TURN allocation on target (UDP, TCP, TLS).

## Phase B, controlled client exposure

1. Build/test branch pointing only selected testers to new backend env values.
2. Run RU + EU matrix tests:
   - frontend load
   - room create/join
   - in-match sync 10+ minutes
   - reconnect/disconnect behavior
3. Capture exact failure class per layer (frontend, signaling, ICE, relay).

## Phase C, progressive traffic shift

1. Keep old backend hot as rollback path.
2. Move main frontend runtime env to new backend.
3. Keep synthetic checks on both old and new backends for 24-72h.
4. If failure spikes, instant rollback by env flip (no gameplay code rollback).

## Phase D, stabilization and cleanup

1. Rotate old backend secrets after final cutover.
2. Archive old host as cold standby or decommission deliberately.
3. Update canonical docs (`README.md`, `NETWORK_ARCHITECTURE.md`, `docs/LW2B_CURRENT_STATE.md`) with final chosen contour.

## Rollback trigger (simple)

Rollback immediately if any of the following appears during cutover window:
- sustained room creation/join failures,
- match-start success but recurrent mid-match disconnect/desync linked to transport reachability,
- major RU success-rate drop vs pilot baseline.

Rollback method: restore previous backend env values and DNS/routing state, keep new host for postmortem.