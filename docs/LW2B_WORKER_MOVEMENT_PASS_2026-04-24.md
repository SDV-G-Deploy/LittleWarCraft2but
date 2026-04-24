# LW2B Worker Movement Pass (2026-04-24)

Status: updated with transparent-through-units worker travel contract pass
Commit: `86d0cea` (original pass), follow-up implemented in `5fea663`

Related doctrine:
- `docs/LW2B_MOVEMENT_DOCTRINE_2026-04-23.md`
- `docs/LW2B_FLOW_FIELD_V2_IMPLEMENTATION_PLAN_2026-04-23.md`

## Purpose

This note records the narrow worker-only movement pass implemented after adopting the current movement doctrine.

The pass intentionally does **not** introduce a universal movement core.
It only tightens worker economy traffic behavior where congestion near bases, mines, and approach tiles can produce visible stalls or bad worker pileups.

Update on 2026-04-24 later review:
This pass should now be understood as an intermediate stabilization checkpoint, not the final intended worker movement design.

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

### 3. Transparent-through-units gather/build local step semantics

File:
- `src/sim/economy.ts`

Worker gather/build travel now treats unit traffic as non-authoritative for local movement resolution.

What changed:
- gather/build local step no longer runs stationary-allied-combat sidestep logic
- gather/build arrival no longer waits/repaths when endpoint tiles are occupied by units
- worker travel still respects terrain passability, bounds, and static/building blockers

Why this matters:
- workers move through unit traffic directly during gather/build travel
- economy movement no longer enters ally-block sidestep/repath churn against units
- allied stationary combat units are not displaced/shoved by worker movement

## Test status

Validated before push with:
- `src/sim/worker-traffic.test.ts`
- `src/sim/movement-policy.test.ts`
- `src/sim/determinism.test.ts`
- `src/sim/combat-congestion.test.ts`
- `src/sim/rally-pathing.test.ts`
- full `npm test`

Result:
- all green for the transparent-worker follow-up in commit `5fea663`

## Important limit / honest risk

This section ended up being directionally correct: the pass improved worker traffic, but did not yet resolve the underlying design mismatch between economy traffic and stricter shared movement semantics.

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

## Updated design direction after live-like townhall scenario review

This updated direction now aligns with the broader redesign plan captured in:
- `docs/LW2B_MOVEMENT_REDESIGN_PLAN_2026-04-24_PRE_FINAL.md`

For this follow-up worker-traffic pass, the preferred simplification is now implemented as gather/build travel behavior:
- Human `worker` and Orc `peon` should be treated as **transparent worker traffic actors**
- workers should be able to pass through other workers
- workers should also be able to pass through other units when needed to preserve economy flow

This should be understood as a **worker-domain exception**, not as a global movement rule.
It stays doctrine-compatible because the goal is gameplay robustness, not collision realism.

Why this direction now looks correct:
- the main pain point is not abstract path optimality but visible congestion near townhall return lanes and base interiors
- live-like economy traffic around townhall creates repeated mixed-unit interference that narrow swap/spread heuristics only partially soften
- workers are utility actors, so readability cost from fake collision is lower than the gameplay cost of stalled harvesting and deposit loops
- symmetrical handling for both factions is cleaner than race- or state-specific worker traffic exceptions

Practical framing for the implemented pass:
- treat worker / peon movement as throughput-first
- prefer guaranteed economy continuity over collision purity
- keep this logic local to worker travel, return, gather, and build movement
- do not reinterpret it as a reason to make combat units transparent

Implemented conclusion:
- transparent/permissive worker travel is now the default gather/build rule,
- worker-vs-worker and worker-vs-mixed-unit traffic is simplified by letting workers traverse unit traffic directly,
- allied stationary combat units are not treated as shove candidates for economy traffic.

## Updated next-step note

The next useful step is still **not** a broad rewrite.
After this worker-domain fix, the recommended follow-up is:
- narrow movement boundary cleanup in shared helpers,
- then combat stabilization for rear-line thrash and frontline slot discipline,
- while preserving the worker transparent-through-units contract as a hard architectural rule.
