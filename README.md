# LittleWarCraft2but

A small RTS demo built around deterministic client-hosted simulation, readable economy/combat/map play, and practical multiplayer transport experimentation.

## Project status

**Archived, demo complete.**

LW2B is no longer in active gameplay expansion. The project reached a useful demo/research endpoint, and further growth would require a broader content/design phase rather than routine continuation.

See:
- `PROJECT_STATUS.md`
- `docs/LW2B_CURRENT_STATE.md`
- `docs/FINAL_ASSESSMENT.md`

## What the project contains

LW2B includes:
- a working RTS gameplay loop: economy, production, combat, building, harvesting, and map play
- deterministic client-hosted simulation foundations
- wood economy and Lumber Mill tech gating
- opening-plan selection (`Eco`, `Tempo`, `Pressure`)
- race identity and doctrine/upgrade structure
- offline simulation mode for AI-vs-AI validation
- online runtime support for three transport paths in code:
  - `peerjs`
  - `ws-relay`
  - `mwc`
- a substantial AI/gameplay regression surface

## Why it was archived

LW2B already achieved most of the value available in its current compact scope.

The project proved out:
- deterministic RTS foundations
- map-pressure and contested-resource play
- AI posture/pressure/endgame work
- multiplayer transport experimentation

The next meaningful step would require a larger content/design phase, not just another tuning pass. Rather than stretching the project past its natural design ceiling, it is being preserved as a finished demo and reference archive.

## What remains useful

This repository remains useful as:
- a small experimental RTS demo
- a deterministic RTS reference implementation
- a source of AI, movement, economy, and transport experiments
- a documentation archive of the project's design and implementation passes

## Run / verify

Reference commands:

```bash
npm install
npm run build
npm test
npm run balance:report
npm run test:mwc-transport
```

## Code areas

- `src/sim/` simulation, economy, combat, AI, tests
- `src/net/` session logic, command validation, transports
- `src/render/` rendering, fog, UI, minimap, feedback
- `src/balance/` stat definitions, openings, modifiers, reports, tuning
- `src/data/` shipped maps and compatibility data tables
- `docs/` final-state docs, architecture notes, and historical pass docs
- `infra/` self-host infra and transport support services

## Recommended reading order

1. `PROJECT_STATUS.md`
2. `docs/LW2B_CURRENT_STATE.md`
3. `docs/FINAL_ASSESSMENT.md`
4. `ROADMAP.md`
5. `NETWORK_ARCHITECTURE.md`
6. `docs/README.md`

## Online / architecture note

LW2B uses client-hosted deterministic simulation. The online layer is the bootstrap and transport contour around that simulation: signaling, ICE/TURN, and supported transport paths.

Operationally, frontend delivery and realtime backend reachability should be treated as separate concerns. See `NETWORK_ARCHITECTURE.md` for the architecture framing and verification surfaces.

## Historical pass docs

Detailed pass-by-pass docs are preserved in `docs/`. Treat them as implementation history and reference material, not as an active development roadmap.
