# LW2B current state (2026-04-25)

Short entrypoint for "where we are now" without re-reading all historical passes.

## One-line state

Core gameplay/movement recovery is stabilized, build is green, online stack is usable on `w2.kislota.today`, and the active priority is gameplay depth through map pressure plus player-choice branching, not broad network rewrites.

## What is currently true

- Movement/combat/worker recovery passes from 2026-04-24 are landed and documented.
- AI goal spread and worker return-retarget fixes are landed.
- MultiWebCore transport path has an end-to-end validation pass.
- Canonical production multiplayer origin remains `https://w2.kislota.today/`.

## Active focus

1. Validate and tune gameplay variety using the current map-pressure package.
2. Keep determinism-sensitive changes narrow and reviewable.
3. Advance simulation-mode design/implementation in small passes without disturbing online paths.

## Explicit non-focus (for now)

- No broad netcode rewrite.
- No rollback/reconciliation initiative.
- No large architecture churn without concrete blocker evidence.

## Canonical reading path

1. `../README.md`
2. `../ROADMAP.md`
3. `../NETWORK_ARCHITECTURE.md`
4. `README.md` (docs index)
5. `LW2B_GAMEPLAY_DOCTRINE_AND_CROSS_LAYER_INVARIANTS.md`
6. `LW2B_MOVEMENT_DOCTRINE_2026-04-23.md`

Then read the latest active pass docs as needed from `README.md`.
