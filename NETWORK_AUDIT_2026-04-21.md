# LW2B Network Audit (2026-04-21)

## Scope
Deep audit of current online architecture and flow, with extra emphasis on `SERVER` mode (`selfhost`) versus `DIRECT` mode (`public`), including failure surfaces around command validation, packet handling, lockstep startup, opening-plan selection, and infra coupling.

## Evidence inspected
- `src/net/session.ts`
- `src/net/netcmd.ts`
- `src/game.ts`
- `src/menu.ts`
- `infra/compose.yaml`
- `infra/nginx.conf`
- `infra/ice-server.js`
- `NETWORK_ARCHITECTURE.md`
- `.env.example`, `infra/.env.example`

Build validation:
- `npm run build` passed (TypeScript + Vite build green)

---

## 1) Architecture overview

### Gameplay network model
- Client-hosted deterministic simulation on both peers.
- Wire protocol transmits **intent commands** (`NetCmd`), not authoritative state snapshots.
- Per-tick mini-lockstep with fixed execution delay (`EXECUTION_DELAY_TICKS = 3`).
- A tick advances only when remote contiguous receipt watermark covers the required tick.

### Session lifecycle
1. Menu chooses mode:
   - `selfhost` (UI label: `SERVER`)
   - `public` (UI label: `DIRECT`)
2. PeerJS connection established.
3. One-shot pre-game handshake:
   - guest sends `hello` with race
   - host replies with `config` (host race, guest race, map)
4. Game starts only after config callback.
5. Runtime exchange sends one packet each sim tick (including empty ticks).

### Command pipeline
- Outbound: local inputs buffered, scheduled for `tick + 3`.
- Inbound: packet size/rate-limited, parsed, validated per command kind using typed validator map.
- Application: deterministic order with owner ordering fixed (`0` then `1`, adjusted by local ownership view in `game.ts`).

### Infra shape (server mode)
- Nginx TLS reverse proxy, static frontend + `/peerjs` + `/api/ice`.
- Self-hosted PeerJS signaling container.
- Coturn relay.
- ICE API issuing short-lived TURN HMAC credentials.

---

## 2) Strengths

1. **Good deterministic discipline in core loop**
   - Fixed owner apply order and deterministic ID sorting reduce divergence risk.

2. **Validator hardening significantly improved**
   - Typed validator map keyed by `NetCmd['k']` makes omissions harder than prior manual switch style.

3. **Lockstep startup/stall behavior improved**
   - Contiguous watermark logic avoids earlier startup deadlock class while still preventing silent missing-tick advance.

4. **Input safety guardrails are present**
   - Packet byte caps, per-window inbound rate caps, command count limits, queue caps.

5. **Operational diagnostics are practical**
   - Inbound accept/reject summaries and periodic deterministic checksum logging help live triage.

6. **Server-mode TURN design is structurally correct**
   - Runtime ICE endpoint with short-lived credentials is a good production pattern.

---

## 3) Risks, thin spots, and potential break points

### High severity

#### H1. No authenticated peer identity / message authenticity at protocol layer
- Current model trusts the connected data channel payload shape + value validation, but not cryptographic message authenticity at app protocol layer.
- For current hobby scope this may be acceptable, but for broader exposure, anti-tamper/abuse protections are limited.

#### H2. Single-connection fragility in live session
- Connection failure (`error`, lockstep timeout, disconnect) ends practical match continuity.
- No resume/rejoin or state resync path, so transient transport failure is match-fatal.

### Medium severity

#### M1. Schema drift risk is reduced, not eliminated
- Validator coverage is much better, but `NetCmd` evolution still requires aligned updates across:
  - emit paths
  - validator map
  - apply path
  - game semantics
- A mismatch can still produce rejects and lockstep timeout behavior.

#### M2. Lockstep fixed delay has no adaptive behavior
- Fixed `+3` delay is simple and deterministic but sensitive to jitter spikes.
- Under rough links, wait-stall can grow into timeout; no dynamic buffering/adaptation.

#### M3. Server-mode infra remains operationally single-stack
- One primary self-hosted stack/path remains a failure concentration point.
- If PeerJS/API/TURN host path degrades regionally, server mode quality drops sharply.

#### M4. Opening-plan timing is state-sensitive to early packet health
- Opening choice (`set_plan`/`rally.plan`) is gated by early tick window and commitment rules.
- Any repeated early waiting or packet issues can affect intended opening lock UX/timing outcomes.

### Low severity

#### L1. Minor env/doc inconsistency surface
- Some docs/examples still mention older static TURN credential expectations while runtime ICE HMAC flow is now primary.
- Not a runtime break by itself, but can cause deploy/operator misconfiguration.

#### L2. Debug checksum is log-only
- Useful for diagnosis, but no runtime automated desync breaker or reconciliation branch.

---

## 4) Focus area: prior validator/ack issue class (strategy/opening game start break)

This specific failure class was explicitly reviewed.

Findings:
- The earlier class (wire command accepted by gameplay semantics but rejected by network validator) is now materially better contained by typed `NET_CMD_VALIDATORS` coverage.
- Startup/early-tick handling has also been hardened away from “strict packet must exist for every early tick” behavior toward contiguous receipt watermark, reducing false startup stalls.
- Current logic sends empty packets every tick, which supports lockstep continuity even on idle input periods.

Residual risk:
- There is still no compile-time or runtime **cross-check harness** that proves every emitted command kind from UI/game paths remains validator-covered and semantically applied as intended after future edits.
- Recommendation: add targeted protocol regression tests and a command matrix fixture.

---

## 5) Server-mode specific findings (`selfhost` / UI: SERVER)

### What is solid
- End-to-end self-host stack is coherent: nginx routing, PeerJS signaling, TURN relay, runtime ICE endpoint.
- TURN credential issuance pattern is correct (ephemeral HMAC).
- Reverse proxy handling for `/peerjs` and websocket upgrade is explicitly addressed.

### Server-mode break points
1. **Infrastructure dependency concentration** (Medium)
   - PeerJS + ICE API + TURN all tied to same deployment contour.
2. **TURN secret/config correctness is critical** (Medium)
   - Wrong secret/realm/external IP breaks hard NAT users quickly.
3. **CORS/origin strictness can become accidental outage lever** (Low/Medium)
   - `ICE_ALLOWED_ORIGIN` strict matching is good for security but brittle if frontend origin changes.
4. **Operational scaling limits are static-tuned** (Low/Medium)
   - Current limit_req/connection limits and peerjs concurrent limits may need tuning under larger usage.

Server-mode conclusion:
- For intended small-scale usage, implementation is generally clean and credible.
- Reliability depends strongly on disciplined operations and config hygiene.

---

## 6) Direct-mode specific findings (`public` / UI: DIRECT)

### What is solid
- Useful fallback path with minimal infra dependency.
- Simpler to test/isolate versus self-host infra problems.

### Direct-mode limitations
1. **Less control over external signaling environment** (Medium)
   - Public peer infra is outside project control.
2. **No self-host TURN runtime enrichment in this path** (Medium)
   - Relies on browser/public STUN behavior and network conditions.
3. **Mode naming can mislead expectations** (Low)
   - `DIRECT` is still WebRTC/PeerJS mediated, not guaranteed raw direct socket path.

Direct-mode conclusion:
- Good fallback/comparison mode, but not ideal as a guaranteed primary competitive path.

---

## 7) Production-readiness assessment

### Verdict
- **Ready for hobby/demo and controlled live testing.**
- **Not yet fully production-hardened for larger public/competitive reliability expectations.**

Why:
- Core deterministic and protocol hygiene is notably improved and currently well-assembled.
- Remaining gaps are mostly in resilience and operational hardening, not baseline architecture correctness.

---

## 8) Prioritized recommendations

1. **P1: Add protocol regression harness (High value, low/medium effort)**
   - Command matrix tests for parse/validate/apply coverage including opening commands and edge timing.
   - Explicitly guard against prior validator drift class.

2. **P1: Add early-match multiplayer smoke scenario automation**
   - Include opening selection (`eco/tempo/pressure`), rally+plan interaction, first train/build/attack, and lockstep continuity checks.

3. **P2: Strengthen session resilience strategy**
   - At minimum, improve user-facing failure semantics and diagnostics.
   - Longer-term: consider lightweight rejoin/resync for transient drops.

4. **P2: Add infra redundancy/fallback for selfhost mode**
   - Multi-endpoint backend options or secondary stack path to reduce single-stack fragility.

5. **P3: Tighten deployment docs/examples**
   - Align all examples around runtime ICE HMAC flow, remove stale static-credential ambiguity.

6. **P3: Optional anti-abuse/auth hardening**
   - If scale grows, add stronger session authentication/integrity assumptions beyond shape validation.

---

## 9) Final audit summary

The online implementation is structurally good and much safer than the earlier failure period. The server-mode path is coherent and mostly clean for intended scope, with the biggest remaining risks in operational single-stack fragility and lack of deeper automated protocol regression coverage. The specific prior issue class (validator drift breaking multiplayer behavior around opening/early-game flow) has been meaningfully addressed, but should now be locked down with dedicated tests to prevent recurrence.
