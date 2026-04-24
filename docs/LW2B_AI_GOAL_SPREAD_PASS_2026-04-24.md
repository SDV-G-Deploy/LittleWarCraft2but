# LW2B AI Goal Spread Pass (2026-04-24)

Status: implemented narrow AI/group-goal congestion reduction pass
Commit: `82103ae`

Related doctrine:
- `docs/LW2B_MOVEMENT_ARCH_AUDIT_AND_REFACTOR_BRIEF_2026-04-24.md`
- `docs/LW2B_COMBAT_STABILIZATION_PASS_2026-04-24.md`
- `docs/LW2B_WORKER_RETURN_RETARGET_PASS_2026-04-24.md`

## Purpose

This note records the narrow AI-side fix applied after live testing exposed a recurring single-tile congestion pattern.

Observed symptom:
- AI repeatedly sent many units toward one exact destination tile,
- one unit could occupy it,
- the others kept churning around that same point,
- producing visible gather/massing jitter and avoidable congestion.

This pass fixes that as an AI goal-assignment issue, not as a broad movement/pathfinding rewrite.

## Problem statement

The core issue was not that movement could never handle local crowding.
The issue was that several AI flows were issuing **one exact shared target tile** to many units.

That meant the movement layer had to absorb an avoidable pressure pattern created one layer above it.

## Implemented changes

### Deterministic local spread ring for AI goals

File:
- `src/sim/ai.ts`

What changed:
- AI retargeting now selects from a deterministic local spread ring around a base goal,
- instead of repeatedly issuing one exact tile to many units.

Applied to:
- assault retargeting toward contested mine,
- assault movement toward expansion mine,
- fallback pressure movement toward enemy townhall,
- defender recall movement toward defend point.

Why this matters:
- groups do not converge as aggressively on one exact occupancy point,
- arrival pressure is distributed more sanely,
- movement churn caused by AI one-tile intent is reduced before it reaches the pathing layer.

## Test status

Validated before push with:
- `src/sim/ai-goal-spread.test.ts`
- full `npm test`

Result:
- all green for commit `82103ae`

## What this pass intentionally did not change

This pass did **not**:
- add a full formation system,
- change low-level movement/pathfinding semantics,
- change combat slot logic,
- change worker movement,
- attempt perfect collision-free massing.

It is intentionally a narrow AI intent fix.

## Honest risk

Spread is deterministic and locally better, but not globally perfect.
In very dense groups, some overlap pressure can still occur.
That is acceptable because the pass is meant to remove the worst single-tile pathology, not solve all formation behavior.

## Recommended next step

The next best narrow pass is likely combat slot freshness / stale assignment cleanup.

Why:
- live testing still suggests some rear-line attack jitter remains,
- current hold logic improved the problem,
- but stale contact-slot intent may still create visible re-pressure behavior after sequential movement updates.
