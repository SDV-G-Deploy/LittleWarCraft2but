# LittleWarCraft2but

A small RTS prototype focused on readable multiplayer-safe simulation and, now, on stronger gameplay variety through player decisions, action diversity, map pressure, and expressive army choices.

## Current status

Recent completed passes:
- gameplay/UI first pass
- local command feedback markers
- online status strip with `statusMsg`
- deterministic owner apply order in online sim (`0` then `1`)
- deterministic multi-unit command ordering for `move`, `attack`, `gather`, `stop`
- deterministic move spread generator for larger groups
- stuck/repath refinement with blocked-step sidestep + path rebuild
- opening branch pass v1 (eco / tempo / pressure framing + opening intent state)
- online lockstep hardening for duplicate tick packets + disconnect stall handling
- opening branch pass v2 contested-mine pressure hook
- targeted move-to-tile fix for single-unit orders, preserving spread only for multi-select moves
- start-of-match opening chooser overlay made explicit, visible, and auto-defaulted to Eco after 10s
- opening-choice UX polish: backdrop, intro pulse, and short "Opening locked" confirmation state

Current state:
- build green
- main multiplayer determinism blocker from review was fixed
- follow-up lockstep packet/disconnect issues were fixed too
- recent determinism-sensitive changes were verified with targeted review passes
- self-hosted online infra is live on `w2.kislota.today`
- PeerJS/TURN production wiring is aligned for `SERVER` mode manual tests
- DIRECT fallback remains available for comparison/fallback checks
- network safety is no longer the main design bottleneck
- gameplay variety is back to being the main design focus

## Core direction

The project is now optimized around this principle:

> Variety and replayability should come primarily from player choices, timing branches, composition decisions, action diversity, and map pressure, not from AI behavior.

Practical priority order:
1. gameplay variety and branching decisions
2. interesting player actions during a match
3. expressive army composition and map interaction
4. network safety/polish where needed
5. AI as support for solo play and testing, not as the main source of depth

Explicitly out of scope for now:
- adaptive delay work
- rollback/reconciliation
- large network rewrite

## Working principles

When a change touches any of the following:
- multiplayer determinism
- multi-id commands
- owner/apply order
- pathfinding, repath, spread
- online movement sim

then the expected workflow is:
1. make a small focused pass
2. run build
3. run a targeted review
4. resolve review findings immediately if they are small and local

For pure UI or local-render-only changes, targeted review is optional.

## Near-term design focus

The next meaningful gains should come from:
- branching early-game decisions
- richer tactical action options
- stronger army role clarity
- map pressure and expansion gameplay
- playtest-driven follow-up on whether eco / tempo / pressure now diverge enough in real matches

AI should be improved only after those systems create interesting matches on their own.

## How to play the opening branches

At the very start of the match, a large opening-choice overlay appears immediately and stays visible for the first 10 seconds.
- click **Eco**, **Tempo**, or **Pressure** to lock your opening
- if you do nothing, the game auto-selects **Eco** after 10 seconds
- the overlay now dims the battlefield slightly and pulses briefly at the start so the choice is hard to miss
- after you pick, a short `Opening locked` confirmation appears
- this choice is now presented directly at match start, not hidden behind Town Hall selection

The game now has three intended early plans:
- **Eco**: your first worker gets a one-time `+20 gold` boost, helping faster early saturation and safer growth
- **Tempo**: your first military timing arrives earlier, giving faster field presence at the cost of a weaker income curve
- **Pressure**: your first military unit commits forward immediately, using attack-move toward rally and a short speed boost for sharper first contact

Practical reading:
- **Eco** is the safer default when you want economy first
- **Tempo** is for taking the map a bit earlier without going all-in
- **Pressure** is for forcing an early tactical problem, especially around contested mines

Related map rule:
- during the early opening clash window, fights near contested mines hit harder, so early pressure and greedy mining collide more clearly

## Useful commands

```bash
npm install
npm run dev
npm run build
```

## Entry point and deployment shape

The canonical public entry point for the game is:
- `https://w2.kislota.today/`

Architecturally, `w2.kislota.today` is not just a static page host. It is the single public origin that fronts three roles:
- game client entry point (`/`)
- PeerJS signaling endpoint (`/peerjs`)
- runtime ICE config endpoint (`/api/ice`)

That same-origin shape matters because multiplayer should resolve through one stable public origin, while nginx routes traffic internally to the right service.

## Online infra config

Client networking is now env-driven to keep online hardening low-scope.

Supported Vite env vars:
- `VITE_PEER_HOST`
- `VITE_PEER_PORT`
- `VITE_PEER_PATH`
- `VITE_PEER_SECURE`
- `VITE_ICE_SERVERS` as a JSON array string

Runtime ICE override:
- client first tries `GET /api/ice`
- if unavailable, it falls back to `VITE_ICE_SERVERS`
- production self-host should prefer `/api/ice` with short-lived TURN credentials

Online menu now supports two runtime test modes:
- `SERVER` uses the self-hosted PeerJS/TURN config from the build env
- `DIRECT` uses public PeerJS (`0.peerjs.com`) plus browser STUN fallback

Share links preserve the selected mode via `?mode=public` when needed.
Room-code input is normalized before join, so copied codes/URLs with accidental surrounding whitespace do not cause avoidable guest connect failures.

Examples:
- client env example: `.env.example`
- self-host infra example: `infra/compose.yaml`
- coturn env example: `infra/.env.example`

PeerJS deployment note:
- production self-host terminates TLS at `https://w2.kislota.today`
- nginx proxies `/peerjs/*` to PeerJS while the server keeps `path=/`
- client must keep `VITE_PEER_PATH=/` to avoid `/peerjs/peerjs/id`
- with the default PeerJS key (`peerjs`), client path `/` maps to requests like `/peerjs/id`
- DIRECT mode remains available as a fallback and still uses public PeerJS + browser STUN

TURN note for Docker deployments:
- keep `--external-ip` set to the public host IP advertised to browsers
- keep `--relay-ip=0.0.0.0` inside the container unless the container actually owns the public IP
- open UDP/TCP `3478` plus the full relay range `49160-49200`
- prefer coturn shared-secret auth with short-lived credentials, served by `/api/ice`

Current production expectations:
- `https://w2.kislota.today/` is the player-facing entry point for starting the game
- `https://w2.kislota.today/peerjs/id` should respond successfully
- `https://w2.kislota.today/api/ice` should return short-lived ICE config
- `SERVER` defaults should resolve to:
  - `VITE_PEER_HOST=w2.kislota.today`
  - `VITE_PEER_PORT=443`
  - `VITE_PEER_PATH=/`
  - `VITE_PEER_SECURE=true`
- safe next step is real manual `SERVER` mode testing and fixing only concrete findings

## Notes on the latest fix pass

Movement bug review result:
- the main issue was not footprint rendering, click-to-tile conversion, or end-of-move completion logic
- single-unit right-click move orders were being routed through the same spread-assignment logic used for groups
- because the spiral spread starts at offset `(0,0)` and then assigns later offsets by sorted unit id, a single selected unit could receive a nearby offset destination instead of the exact clicked tile
- fix: preserve spread assignment for multi-unit move commands only, while single-unit move commands now target the exact clicked tile first and do not fan out through fallback spread positions unless part of a group order

Determinism note:
- the movement fix stays inside net command application and keeps deterministic ordering intact
- the opening-choice change is UI-first and uses the same existing synced `set_plan` path, so it does not add a new sim divergence surface

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for:
- recent completed work
- current strategic priorities
- next planned phases
- review rules for determinism-sensitive changes
- suggested commit themes
