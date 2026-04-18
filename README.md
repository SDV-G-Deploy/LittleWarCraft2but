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

Current state:
- build green
- main multiplayer determinism blocker from review was fixed
- follow-up lockstep packet/disconnect issues were fixed too
- recent determinism-sensitive changes were verified with targeted review passes
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

## Useful commands

```bash
npm install
npm run dev
npm run build
```

## Online infra config

Client networking is now env-driven to keep online hardening low-scope.

Supported Vite env vars:
- `VITE_PEER_HOST`
- `VITE_PEER_PORT`
- `VITE_PEER_PATH`
- `VITE_PEER_SECURE`
- `VITE_ICE_SERVERS` as a JSON array string

Online menu now supports two runtime test modes:
- `SERVER` uses the self-hosted PeerJS/TURN config from the build env
- `DIRECT` uses public PeerJS (`0.peerjs.com`) plus browser STUN fallback

Share links preserve the selected mode via `?mode=public` when needed.

Examples:
- client env example: `.env.example`
- self-host infra example: `infra/compose.yaml`
- coturn env example: `infra/.env.example`

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for:
- recent completed work
- current strategic priorities
- next planned phases
- review rules for determinism-sensitive changes
- suggested commit themes
