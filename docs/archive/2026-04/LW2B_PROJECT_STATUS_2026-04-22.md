# LW2B project status (2026-04-22)

## Canonical short status

LW2B has moved past the earlier narrow remote-guest-build blocker.
That issue is now considered fixed in live project reality.

The main open project problem is now **Russia-facing online accessibility**.
This should be treated as a layered reachability/product problem, not as a single gameplay bug.

## What is currently true

### Gameplay / simulation / local project state
- the project has a stronger structural base now: doctrine, invariants, balance-system hardening, AI difficulty passes, and recent movement/pathing work all exist in repo docs/code
- guest build parity is no longer the active blocker
- the broad online path is healthier than earlier failing tests first suggested
- movement work on 2026-04-22 and 2026-04-23 exposed that the more ambitious reservation/shared-core direction was too fragile in live gameplay and has since been rolled back to a simpler baseline
- current movement state is improved versus the broken refactor, but plain unit traffic is still an active gameplay-quality concern and should be treated as unfinished rather than solved

### Live realtime infra
- production canonical origin is `w2.kislota.today`
- same-origin realtime paths are expected for `/peerjs`, `/api/ice`, `/ws-relay`, and `/mwc`
- `nginx`, `peerjs`, `coturn`, `ice-api`, and MultiWebCore transport are live in that stack
- TURN/TLS on `443` remains part of the live baseline

### Active product/network risk
The current open problem is best split into separate layers:
1. frontend reachability from Russia-facing networks
2. signaling reachability to the self-hosted backend
3. TURN / WebRTC establishment quality on those networks
4. whether fallback transport should become a product feature instead of relying on pure PeerJS/WebRTC success

## Current repo-level signals

### New design track now prepared
- simulation mode v1 is now documented in `docs/LW2B_SIMULATION_MODE_DESIGN_2026-04-23.md`
- agreed implementation framing is intentionally narrow:
  - `mode` in `GameOptions`
  - simulation-specific side config for two AI-controlled sides
  - owner-parameterized AI
  - observer-only input/render gating
  - no broad fog/state/control-model rewrite
  - no online/net refactor in this pass


### Docs now relevant for resume
- `docs/LW2B_PROJECT_DEVELOPMENT_PLAN_2026-04-22.md`
- `docs/LW2B_GAMEPLAY_DOCTRINE_AND_CROSS_LAYER_INVARIANTS.md`
- `docs/LW2B_HELSINKI_REALTIME_STATUS_2026-04-22.md`
- `docs/planning/NEXT_MULTIPLAYER_TESTS.md`
- `docs/LW2B_WS_RELAY_FALLBACK_MINI_DESIGN_2026-04-22.md`
- `docs/LW2B_WS_RELAY_FALLBACK_IMPLEMENTATION_DRAFT_2026-04-22.md`

### Current code-level direction visible in repo
Recent branch-head commits indicate active transport/fallback work already exists:
- `b037a29` `refactor(net): extract session core from peerjs transport`
- `6e24933` `refactor(net): extract peerjs transport module and transport types`
- `46fe475` `net: add manual ws-relay transport path and selector`

Recent gameplay-side movement commits also matter for current context:
- `407eaf9` `rollback(sim): restore simpler movement baseline`
- `21a3018` `fix(sim): preserve move path after sidestep`

The repo therefore reflects both:
- a practical fallback-transport direction on the network side
- a deliberate retreat to a simpler movement baseline on the gameplay side after live regressions in the more complex movement refactor

## Recommended active framing

Do not frame LW2B as blocked by guest build anymore.
Do not frame it as a broad infra collapse either.

The best current framing is:
- gameplay-side critical blocker reduced
- infra baseline exists and works enough for real matches
- open problem is regional accessibility / transport reliability for Russia-facing users
- ws-relay fallback is now part of the meaningful active solution space

## Best next actions

1. Validate Russia-facing behavior using the current repo state, including ws-relay mode where appropriate
2. Keep frontend accessibility separate from realtime transport diagnosis
3. Capture exact PeerJS / ICE / relay failure wording from Russia-side tests
4. Update product guidance so hard-network users can choose the better transport path intentionally
5. Treat plain unit traffic / collision behavior as the active gameplay-side movement issue, with future work framed as a narrow `simplified movement v2` pass instead of another broad refactor
6. Keep docs and brief aligned with this framing
