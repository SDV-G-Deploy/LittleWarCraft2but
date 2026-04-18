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

Current state:
- build green
- main multiplayer determinism blocker from review was fixed
- recent determinism-sensitive changes were verified with targeted review passes
- network safety is no longer the main design bottleneck

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

AI should be improved only after those systems create interesting matches on their own.

## Useful commands

```bash
npm install
npm run dev
npm run build
```

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for:
- recent completed work
- current strategic priorities
- next planned phases
- review rules for determinism-sensitive changes
- suggested commit themes
