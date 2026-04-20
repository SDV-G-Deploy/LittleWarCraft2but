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
- precise single-unit move feedback marker to show the exact commanded destination tile
- gameplay micro-pass: stronger opening contrast via fatter first Eco cash-in and harder early Pressure hit
- balance foundation pass: `schema/base/races/resolver` added under `src/balance/`
- race-aware stat read-path migration completed across sim/UI
- opening definitions moved into `src/balance/openings.ts`
- combat bonus rules moved into `src/balance/modifiers.ts`
- balance report foundation added via `src/balance/report.ts` and `npm run balance:report`
- quick manual balance tuning file added at `src/balance/tuning.ts`
- dedicated map-balance pass landed for the shipped pool:
  - fixed unreachable contested mines on River Crossing
  - cleared blocked spawn macro space on Open Steppe and Timber Lanes
  - pulled Stone Fords watch posts closer to the actual contest line
  - gave center / farther mines larger reserves than safe home-side mines

Current state:
- build green
- forest harvesting is now in the game:
  - each forest tile starts with `100 wood`
  - each worker harvest cycle takes `10 wood`
  - when a forest tile reaches `0`, it turns into passable grass
  - workers can right-click forest to harvest it and return wood automatically to Town Hall / Great Hall
- wood is now a real economy resource shown in HUD/UI and required by units/buildings
- lumber mill tech pass is now in the game:
  - `Lumber Mill` is a new tech building
  - towers now require both `Barracks` and `Lumber Mill`
  - Lumber Mill sells first-pass global upgrades:
    - `Melee +1`
    - `Armor +1`
    - `Building HP +15%`
- main multiplayer determinism blocker from review was fixed
- follow-up lockstep packet/disconnect issues were fixed too
- recent determinism-sensitive changes were verified with targeted review passes
- a later live `SERVER` mode desync was reproduced, diagnosed, and fixed
- self-hosted online infra is live on `w2.kislota.today`
- PeerJS/TURN production wiring is aligned for `SERVER` mode manual tests
- live re-test after the desync fix stayed synchronized even with tower builds
- DIRECT fallback remains available for comparison/fallback checks
- network safety is no longer the main design bottleneck
- balance-system foundation is now in place and now includes a simple manual tuning layer for fast gameplay iteration
- gameplay variety is back to being the main design focus
- performance hardening pass set 1 landed:
  - static blocked occupancy grid for non-unit blockers
  - A* open-set heap with deterministic tie-break
  - move/repath dedupe and cheaper move-goal path selection
  - cheaper deterministic target-acquisition scans for auto-attack and attack-move
- feedback/clarity pass landed for playtest readability:
  - production panel for Town Hall / Barracks now shows current unit, big progress, explicit percent, visible queue slots, and clear idle state
  - melee and ranged attacks now emit lightweight on-field attack / hit flashes
  - archer / troll shots now render simple readability-first projectile cues
- latest pass stayed in UI/render-first scope; no netcode or hit-timing rewrite was introduced
- movement interpolation fix pass landed across all major path-following states:
  - plain `move`
  - `attackMove` / pressure forward-commit movement
  - `gather` travel to mine and return-to-base travel
  - `attack` chase movement
  - `build` move-to-site travel
- movement feel is now driven by real step progress instead of one-tick-only render smoothing
- next performance target should be LOS checks via grid/blocker cache, not risky dynamic unit occupancy

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
- map balance and start-position fairness
- branching early-game decisions
- richer tactical action options
- stronger army role clarity
- map pressure and expansion gameplay
- playtest-driven follow-up on whether eco / tempo / pressure now diverge enough in real matches

Immediate next `/new` target:
- verify the new forest/wood/lumber-mill loop end to end in live/manual play
- confirm workers can harvest forest, carry wood home, and credit it correctly
- confirm depleted forest turns into passable grass and pathing updates correctly
- confirm Lumber Mill can be built, towers are gated by it, and all three upgrades apply correctly
- only after that, return to broader map-balance validation and follow-up point edits

AI support pass is now good enough to stop being the blocker.
The next likely source of unfair matches is map imbalance, not bot behavior.

## How to play the opening branches

At the very start of the match, a large opening-choice overlay appears immediately and stays visible for the first 10 seconds.
- click **Eco**, **Tempo**, or **Pressure** to lock your opening
- if you do nothing, the game auto-selects **Eco** after 10 seconds
- the overlay now dims the battlefield slightly and pulses briefly at the start so the choice is hard to miss
- after you pick, a short `Opening locked` confirmation appears
- this choice is now presented directly at match start, not hidden behind Town Hall selection

The game now has three intended early plans:
- **Eco**: your first worker now gets a stronger first cash-in, with `+20 gold` plus a slightly bigger first mining trip, helping faster early saturation and safer growth
- **Tempo**: your first military timing arrives earlier, giving faster field presence at the cost of a weaker income curve
- **Pressure**: your first military unit commits forward immediately, using attack-move toward rally, a short speed boost, and a brief early damage edge for sharper first contact

Practical reading:
- **Eco** is the safer default when you want economy first
- **Tempo** is for taking the map a bit earlier without going all-in
- **Pressure** is for forcing an early tactical problem, especially around contested mines

Related map rule:
- during the early opening clash window, fights near contested mines hit harder, so early pressure and greedy mining collide more clearly

## Quick balance tuning

For fast live tests, edit:
- `src/balance/tuning.ts`

Current layering is:
1. `src/balance/base.ts`
2. `src/balance/races.ts`
3. `src/balance/tuning.ts`

Use `tuning.ts` for quick temporary overrides without touching the base faction definitions.
Example:
- `human.farm.supplyProvided = 5`
- `human.footman.armor = 5`
- `orc.grunt.cost.gold = 110`

After changes:
- run `npm run build`
- test live on `w2.kislota.today`

## Current wood / lumber-mill verification checklist

Use this checklist in the next validation session:
- build a worker economy and harvest at least one forest tile
- confirm each forest tile starts at `100 wood`
- confirm each trip removes `10 wood`
- confirm worker returns wood automatically to Town Hall / Great Hall
- confirm HUD wood value increases after return, not on chop start
- confirm tile becomes passable grass at `0 wood`
- confirm units can path through the cleared tile after depletion
- build a `Lumber Mill`
- confirm `Tower` is blocked before Lumber Mill and available after Lumber Mill
- buy `Melee +1`, then confirm melee units deal +1 damage
- buy `Armor +1`, then confirm military units gain +1 armor
- buy `Building HP +15%`, then confirm existing player buildings gain HP and new ones inherit the bonus

## Useful commands

```bash
npm install
npm run dev
npm run build
npm run balance:report
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
- current network architecture notes: `NETWORK_ARCHITECTURE.md`

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

Opening contrast micro-pass:
- Eco now converts its first worker payoff into a clearer early economy spike instead of only a small invisible bonus
- Pressure now gets a committed first-unit damage window tied to its forward push, so the branch lands harder in first contact instead of reading mostly as a pathing gimmick
- Tempo stays the clean timing branch, preserving its identity as the low-complexity middle option

Movement feel follow-up:
- the first walk-animation pass had two partial fixes before the real root cause was isolated
- confirmed root issue for plain movement was one-tick interpolation, while actual tile travel spans multiple sim ticks
- follow-up audit then unified render interpolation across all real path-following movement states:
  - `move`
  - `gather` (`tomine`, `returning`)
  - `attack` chase
  - `build` move-to-site
  - pressure / attack-move variants that already use move-path stepping
- chase logic now separates repath timing from per-step visual progress timing, reducing hidden coupling in movement rendering

Attack reissue exploit fix and adjacent-input audit:
- fixed an attack-click spam exploit where repeated attack reissue/right-click spam could effectively reset attack cooldown
- fix behavior: reissuing attack now preserves the existing cooldown instead of granting a fresh attack-timing window
- narrow adjacent audit result: same-class exploit was not confirmed for `stop`, `move`, `gather`, `build`, or resume-style command reissue paths

Balance foundation pass:
- base stats now live in `src/balance/base.ts`
- permanent race overrides now live in `src/balance/races.ts`
- resolved stat access flows through `src/balance/resolver.ts`
- opening balance definitions live in `src/balance/openings.ts`
- combat bonus rules live in `src/balance/modifiers.ts`
- pure snapshot/report helpers live in `src/balance/report.ts`
- `src/data/units.ts` and `src/data/races.ts` currently remain compatibility forwarders during migration

Determinism note:
- the movement interpolation pass is render-first and keeps synced sim movement tile-based
- smoothing now reads progress from existing deterministic step timers / paths instead of adding a new gameplay-time source
- the opening-choice change is UI-first and uses the same existing synced `set_plan` path, so it does not add a new sim divergence surface
- the exact move feedback marker is render-only command feedback and does not affect simulation or online state
- the opening contrast pass only reuses existing synced sim state (`openingPlanSelected`, `openingCommitmentClaimed`, unit-local `openingPlan`) and does not introduce new nondeterministic inputs
- the latest clarity pass keeps combat timing unchanged and uses lightweight visual-event state only for presentation, so no new network-model rewrite surface was introduced

## Network architecture documentation

For the current multiplayer architecture, deployment coupling, the April 2026 live desync incident/fix, and the current online infra update under consideration for Russia-facing access, see:
- [NETWORK_ARCHITECTURE.md](./NETWORK_ARCHITECTURE.md)

## Roadmap

With the balance foundation now in place, the next major work should bias toward gameplay changes, playtests, faction feel, and now map fairness, not more infrastructure unless a concrete balancing workflow gap appears.

Current near-term project priority:
- fix the map pool, because current maps are now considered materially imbalanced
- after that, continue gameplay/map-pressure tuning on top of the corrected maps
- keep movement-feel follow-ups and perf follow-ups secondary unless a concrete blocker appears

See [ROADMAP.md](./ROADMAP.md) for:
- recent completed work
- current strategic priorities
- next planned phases
- review rules for determinism-sensitive changes
- the movement-feel/render-readability plan for future `/new` sessions
- suggested commit themes

Archived balance-system planning drafts are kept in `docs/planning/archive/`.
