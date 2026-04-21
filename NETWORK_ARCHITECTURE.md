# LW2B Network Architecture

This document captures the current multiplayer networking architecture for **LittleWarCraft2but (LW2B)**, the main dependency points around PeerJS / WebRTC / TURN, and the practical implications for connectivity, especially for players joining from Russia.

Related deep-dive reports from the latest audit pass:
- `NETWORK_AUDIT_2026-04-21.md`
- `NETWORK_MECHANICS_AUDIT_2026-04-21.md`

## Summary

LW2B currently uses a **client-hosted multiplayer model**:
- gameplay simulation runs in the clients
- online play uses **PeerJS + WebRTC data channels**
- a small self-hosted backend provides:
  - PeerJS signaling
  - runtime ICE configuration
  - TURN relay when direct peer connectivity fails

There is **no dedicated authoritative game server** in the current architecture.
This is important because it means connectivity issues can be addressed by moving or duplicating the networking backend without rewriting gameplay simulation.

## Current architecture shape

Public entry point:
- `https://w2.kislota.today/`

That public origin currently fronts three roles:
1. game client entry point (`/`)
2. PeerJS signaling endpoint (`/peerjs`)
3. runtime ICE config endpoint (`/api/ice`)

TURN relay is also part of the same production networking stack.

In practice, the current multiplayer backend is organized around one main public networking contour:
- domain: `w2.kislota.today`
- TURN/public IP: `116.203.107.226`
- infra host assumption: Hetzner-based deployment

## Main code and infra locations

### Client networking
- `src/net/session.ts`
- `src/menu.ts`

### Infra
- `infra/compose.yaml`
- `infra/nginx.conf`
- `infra/ice-server.js`
- `.env.example`
- `infra/.env.example`

## Runtime networking flow

### 1. Lobby / room flow
Lobby orchestration is client-side.

In `src/menu.ts`:
- host creates a session via `createSession('host', ...)`
- guest joins via `createSession('guest', joinCode, ...)`
- online mode can use `selfhost` or `public`

This means room creation/join UX does not depend on a separate gameplay server. It only depends on the networking bootstrap path working.

### 2. PeerJS / WebRTC session
In `src/net/session.ts` the game creates a PeerJS client roughly in this shape:
- `Peer(...)`
- `DataConnection`
- WebRTC data-channel-based command sync

Supported runtime modes:
- `public`
  - PeerJS host: `0.peerjs.com:443`
  - STUN fallback: Google STUN
- `selfhost`
  - PeerJS host/path/port/secure from `VITE_PEER_*`
  - ICE from `./api/ice`, with fallback to `VITE_ICE_SERVERS`

So the online path depends on these layers:
1. signaling reachability
2. ICE server reachability
3. TURN availability for relay cases
4. browser-to-browser WebRTC success

### 3. ICE / TURN flow
In self-hosted mode, the client first requests:
- `GET /api/ice`

That endpoint returns runtime ICE config, including TURN credentials.

In `infra/ice-server.js`:
- the API returns STUN config
- and TURN config using short-lived HMAC-based credentials

This is the correct shape for production TURN usage.

## Infra stack details

### `infra/compose.yaml`
Current self-hosted stack includes:
- `peerjs` (signaling server)
- `peerjs-https` (nginx with TLS termination)
- `coturn` (relay)
- `ice-api` (short-lived TURN credential endpoint)

### `infra/nginx.conf`
Nginx routes requests by path:
- `/peerjs` and `/peerjs/*` -> PeerJS
- `/api/ice` -> ice-api
- `/` -> game client

This same-origin setup keeps the multiplayer bootstrap under one public origin.

## Environment and deployment coupling

### Client env
In `.env.example` the current production-like defaults are:
- `VITE_PEER_HOST=w2.kislota.today`
- `VITE_PEER_PORT=443`
- `VITE_PEER_PATH=/`
- `VITE_PEER_SECURE=true`
- `VITE_ICE_SERVERS` includes `116.203.107.226:3478`

### Infra env
In `infra/.env.example`:
- `PEER_DOMAIN=w2.kislota.today`
- `TURN_REALM=w2.kislota.today`
- `TURN_EXTERNAL_IP=116.203.107.226`

## Current architecture dependency points

The current multiplayer path is tightly coupled to:
- domain `w2.kislota.today`
- public TURN IP `116.203.107.226`
- the current self-hosted ASN/provider profile

Those references also appear in deployment/docs paths such as:
- `.env.example`
- `infra/.env.example`
- `infra/nginx.conf`
- `infra/ice-server.js`
- `.github/workflows/deploy.yml`
- `README.md`

## Operational interpretation

The main online dependency is not gameplay hosting. The main online dependency is the **bootstrap chain**:
- can the client reach signaling
- can the client fetch ICE
- can the client use TURN when direct connectivity fails

If users in Russia have trouble connecting, the likely bottleneck is not “browser-to-browser” as an idea by itself.
The likely bottleneck is one or more of:
- reachability of the current signaling endpoint
- reachability of the current TURN endpoint
- routing/ASN/provider filtering or instability
- dependence on a single Hetzner-based network path

## What can be moved safely

Because gameplay sim is client-hosted, the following can be moved with relatively low product risk:
- PeerJS signaling backend
- `api/ice` backend
- TURN relay

This means LW2B can move or duplicate the networking backend **without rewriting gameplay logic**.

## Safe architectural conclusion

A dedicated authoritative game server is **not required** to improve connectivity.
The least risky path is to keep the current client simulation model and change only the networking backend topology.

## Recommended future architecture direction

### Recommended option: multi-endpoint networking backend
Preferred direction:
1. keep gameplay model unchanged
2. deploy one or more additional signaling/TURN stacks outside Hetzner
3. add runtime fallback between multiple networking endpoints

That would preserve:
- current lockstep model
- current gameplay implementation
- current lobby/join logic

while reducing dependence on one provider/path.

## Candidate migration patterns

### Option A, recommended
Deploy a second self-hosted networking stack on a different provider/region/ASN:
- PeerJS
- ice-api
- coturn

Then let the client choose or fail over between endpoints.

Benefits:
- smallest gameplay risk
- easiest to validate with real players
- directly targets the most likely accessibility problem

### Option B
Split static hosting from networking hosting:
- keep the game frontend wherever convenient
- move networking services to separate net-specific domains/origins

Benefits:
- easier infra iteration on the network layer
- lower coupling between game deploy and network deploy

### Option C
Keep current self-host path, but use public PeerJS as an emergency fallback.

Benefits:
- minimal infra work

Limitations:
- less predictable
- still not robust enough as the main path
- not a good long-term answer for inconsistent regional reachability

## Recommendation

The recommended architecture path for LW2B is:
- **do not rewrite the network model yet**
- **do not rely on a single PeerJS/TURN endpoint**
- **decouple signaling/ICE/TURN from the current Hetzner-only contour**
- **add multi-endpoint fallback for the networking backend**

In short:
- keep simulation as-is
- move or duplicate the networking bootstrap layer
- test reachability from Russia against alternate endpoints

## April 2026 server-mode desync incident and fix

A real live test surfaced a true mid-game lockstep divergence in `SERVER` mode.

Observed symptom:
- early and mid-game sync initially looked healthy
- later in the match, one player stopped seeing the opponent's units correctly
- the other player saw units frozen on stale positions
- the issue reproduced in a Serbia <-> Russia test path

Root-cause chain that was identified:
1. network command validation in `src/net/session.ts` accepted only a subset of building types
2. gameplay allowed `tower`, but the network validator did not
3. a tick containing `build tower` could therefore be rejected at parse/validation time
4. the old lockstep behavior could then continue past the missing logical input, creating a silent deterministic divergence

Targeted fixes that were applied:
- `tower` added to network build-command validation
- lockstep hardened so genuinely missing scheduled remote ticks cannot silently advance as empty input
- startup regression from an overly strict first hardening pass was corrected by switching to a contiguous remote-receipt watermark instead of requiring literal packet receipt for the earliest startup ticks
- empty replacement packets were prevented from wiping already queued commands for the same tick

Diagnostics that were added for live triage:
- inbound packet accept/reject summaries in `src/net/session.ts`
- lightweight periodic deterministic checksum logging in `src/game.ts`
- online UI strip can now surface the latest inbound-network summary

Live re-test result after the fix sequence:
- `SERVER` mode test succeeded
- towers were built during the test
- match stayed synchronized

Follow-up anti-desync hardening completed after that incident:
- per-tick entity command processing tightened to be mutation-safe and order-stable
- deterministic tie-break rules tightened in key nearest/selection logic
- targeted determinism regression tests added for this class of failure

Interpretation:
- the previous failure was a real lockstep/network bug, not random lag
- the initial fail-closed startup regression was introduced by a too-rigid first guardrail and was then corrected
- the current online path is materially healthier than the pre-fix state and is suitable for the next round of live tests

## Online infra update, under consideration

After the April 2026 live tests, the working hypothesis changed in an important way.

What the successful test appears to show:
- frontend served from GitHub Pages worked for a Russia-side player
- `SERVER` mode still worked against the existing self-hosted backend
- room creation/join and in-match sync were viable in that split setup

Current working interpretation:
- the existing PeerJS/TURN/self-hosted backend path on Hetzner is not fundamentally broken
- the more likely weak point for Russia access is the player-facing frontend origin `w2.kislota.today`, or something tightly coupled to its reachability path
- in practice, `GitHub Pages frontend + existing Hetzner networking backend` currently looks like a viable low-effort hobby/demo deployment shape

Important caution:
- this does **not** prove with 100% certainty that only the domain name itself was the issue
- it may still involve DNS, routing, TLS, domain reputation, or other reachability factors around the public entry origin
- however, it strongly suggests the multiplayer backend should not be treated as the primary failed component

Practical conclusion for now:
- keep the current backend shape as-is
- treat alternate frontend hosting as the lowest-effort compatibility lever
- do not rush into a larger networking rewrite while the current hobby/demo setup is now demonstrably usable

This update is intentionally marked **under consideration** rather than final architecture policy.
It should be revisited only if later live tests contradict it or if the project graduates from hobby/demo constraints.

## Immediate next implementation target

If this turns into execution work, the next technical step should be:
1. deploy a second networking stack outside Hetzner
2. parameterize multiple backend endpoints in runtime config
3. add endpoint selection or fallback in the client
4. validate room creation/join, direct connect, and TURN relay from Russia

## Non-goals for this document

This document describes the current architecture and the safest migration direction.
It does not propose:
- rollback networking
- authoritative server rewrite
- gameplay protocol redesign
- simulation rewrite

Those should remain out of scope unless the current model proves fundamentally insufficient.
