# LW2B Worker Return Retarget Pass (2026-04-24)

Status: implemented narrow gather-return recovery pass
Commit: `ed9b5b9`

Related doctrine:
- `docs/LW2B_MOVEMENT_ARCH_AUDIT_AND_REFACTOR_BRIEF_2026-04-24.md`
- `docs/LW2B_WORKER_MOVEMENT_PASS_2026-04-24.md`
- `docs/LW2B_MOVEMENT_KPI_BASELINE_2026-04-24.md`

## Purpose

This note records the narrow worker-domain fix applied after live testing exposed a specific return-to-dropoff failure mode.

Observed live symptom:
- returning workers near base geometry or new buildings could keep retrying a stale return endpoint,
- bounce/repath in place,
- and appear to poke forever instead of selecting a healthier return approach.

This pass fixes that failure mode without rolling back transparent-through-units worker travel and without weakening building/static blocking.

## Problem statement

The issue was not that workers ignored buildings.
The issue was that return flow could become too sticky around a cached `_gatherReturnTarget` and `_gatherPath`.

That meant:
- if a chosen return approach became bad,
- or if the path to that exact approach stayed obstructed,
- the worker could keep retrying the same dead endpoint instead of reselection.

## Implemented changes

### 1. No-route guard for return phase

File:
- `src/sim/economy.ts`

What changed:
- when the return-phase dropoff target search finds no pathable return approach,
- the worker now stays in `gather/returning`,
- keeps carried resources,
- records blocked behavior,
- and does not falsely complete a deposit.

Why this matters:
- prevents fake success when no valid return route exists,
- keeps economy state honest,
- avoids masking pathing failure as successful delivery.

### 2. Sticky return target reset after repeated static blockage

File:
- `src/sim/economy.ts`

What changed:
- worker return flow now tracks:
  - `_gatherReturnNoProgressStreak`
  - `_gatherReturnLastPos`
- if the worker is repeatedly blocked,
- or repeatedly repaths without actual positional progress,
- cached `_gatherPath` and `_gatherReturnTarget` are cleared,
- forcing the next update to reselect a better dropoff-adjacent return target.

Why this matters:
- breaks stale endpoint loops,
- helps workers recover from newly created choke geometry,
- improves return robustness around tight townhall/base layouts.

### 3. State cleanup consistency

File:
- `src/sim/economy.ts`

What changed:
- gather-state cleanup now also clears the new return-progress bookkeeping fields.

## Test status

Validated before push with:
- `src/sim/worker-traffic.test.ts`
- full `npm test`

Added focused tests:
- `testReturningWorkerClearsStickyReturnTargetAfterRepeatedStaticBlock`
- `testReturningWorkerDoesNotDepositWhenNoDropoffRouteExists`

Result:
- all green for commit `ed9b5b9`

## What this pass intentionally did not change

This pass did **not**:
- remove static/building blocking,
- revert worker transparent-through-units travel,
- rewrite dropoff target selection globally,
- touch combat movement,
- touch plain move semantics.

It is a narrow recovery fix, not a broad movement rewrite.

## Honest risk

The reset thresholds are still heuristic.
In some very tight base chokes, a worker may still visibly hesitate before the stale target is discarded and a better return approach is chosen.

That tradeoff is acceptable for this pass because it:
- keeps the fix narrow,
- preserves existing movement architecture,
- and directly addresses the observed live failure mode.

## Recommended next step

The next high-value fix is AI/group-goal distribution.

Why:
- current live observations suggest that several mass-move or gather phases still send many units to one exact tile,
- causing avoidable one-point congestion and repeated move churn.

Best next direction:
- spread assault/massing arrival goals across a deterministic local ring,
- reuse rally-arrival logic beyond explicit rally usage,
- avoid issuing identical one-tile destinations to many units when a local spread is semantically better.
