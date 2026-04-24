# LW2B Worker Movement Pass (2026-04-24)

Status: implemented and pushed
Commit: `86d0cea`

Related doctrine:
- `docs/LW2B_MOVEMENT_DOCTRINE_2026-04-23.md`
- `docs/LW2B_FLOW_FIELD_V2_IMPLEMENTATION_PLAN_2026-04-23.md`

## Purpose

This note records the narrow worker-only movement pass implemented after adopting the current movement doctrine.

The pass intentionally does **not** introduce a universal movement core.
It only tightens worker economy traffic behavior where congestion near bases, mines, and approach tiles can produce visible stalls or bad worker pileups.

## Doctrine alignment

This pass follows the current architecture rules:
- no universal movement core
- workers remain a forgiving, economy-first traffic class
- combat movement remains a separate sophistication track
- plain move remains deterministic and moderate

The implementation goal was:
- keep worker traffic permissive
- reduce bad worker stacking side-effects
- preserve determinism
- avoid broad movement coupling

## Implemented changes

### 1. Safer permissive worker swap behavior

File:
- `src/sim/movement.ts`

Worker permissive swap behavior was kept, but narrowed to avoid a bad cascade case.

What changed:
- worker-worker swap and worker-vs-stationary-allied-combat bypass still exist
- but the displaced allied unit is no longer swapped backward if the worker's origin tile is already occupied by another unit

Why this matters:
- permissive worker traffic is still allowed
- but it no longer amplifies local congestion into illegal-looking same-tile stacking through repeated swap cascades

### 2. Softer worker approach-tile spreading

File:
- `src/sim/economy.ts`

Worker travel toward gather/build/dropoff approach tiles now applies a soft penalty to already-reserved worker targets.

Applied to:
- mine approach selection
- tree approach selection
- dropoff return approach selection

Why this matters:
- workers do not all prefer the same locally-cheapest approach tile as aggressively as before
- throughput near mines and townhall/lumbermill edges is more distributed
- this helps congestion without introducing a generalized crowd model

### 3. Worker arrival guard for occupied approach tiles

File:
- `src/sim/economy.ts`

Workers in gather/build travel no longer blindly finalize arrival into an already-occupied worker tile.

Instead:
- if the final worker approach tile is still occupied, the worker waits and/or refreshes its target path state instead of collapsing into that tile

Why this matters:
- preserves the forgiving worker model
- reduces visible worker pileup at resource/build/dropoff approach endpoints
- stays local to worker economy logic instead of leaking new policy into all movement domains

## Test status

Validated before push with:
- `src/sim/worker-traffic.test.ts`
- `src/sim/movement-policy.test.ts`
- `src/sim/determinism.test.ts`
- `src/sim/combat-congestion.test.ts`
- `src/sim/rally-pathing.test.ts`
- full `npm test`

Result:
- all green at commit `86d0cea`

## Important limit / honest risk

This pass improves worker traffic, but it does **not** claim to solve every dense synthetic congestion scenario.

What it is meant to do:
- reduce bad local worker stacking behavior
- improve economy traffic robustness
- preserve current architecture boundaries

What it explicitly does **not** do:
- introduce a generalized traffic simulator
- unify workers with combat movement
- fully solve every extreme synthetic pileup stress pattern

That remaining work, if needed, should stay narrow and scenario-driven.

## Next-step note

The next useful validation is **not** a broad rewrite.
The next useful validation is a more live-like reproduction around townhall worker traffic lanes.

Planned handling:
- do that in a separate `/new` work thread
- evaluate from repo + docs again
- add only a narrow scenario test if it matches a real observed behavior
