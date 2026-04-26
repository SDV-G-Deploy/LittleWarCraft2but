# LW2B AI Assault Watchdog Pass (2026-04-26)

Status: landed in code, awaiting field validation

Note:
- this status means the pass exists in code history
- it does not by itself guarantee that the current HEAD is CI-green
- verify current build/test state separately

Related commit:
- `6d56efa` — `ai: add conservative assault stale watchdogs and fallback move`

Related docs:
- `docs/LW2B_AI_IMPLEMENTATION_PLAN_2026-04-25.md`
- `docs/LW2B_AI_PHASE3_ROLE_SPLIT_PASS_2026-04-25.md`
- `docs/LW2B_AI_PHASE4_MINE_INTENT_DESIGN_2026-04-25.md`
- `docs/LW2B_AI_OPPONENT_DEEP_AUDIT_2026-04-25.md`

## Goal

Reduce cases where AI-controlled combat units appear AFK during assault or regroup because they remain stuck on stale or no-longer-useful commands.

## What changed

Primary code target:
- `src/sim/ai.ts`

Test coverage added:
- `src/sim/ai-assault-watchdog.test.ts`
- `package.json` test chain updated to include the new targeted test

### 1. Conservative assault command reevaluation

Added helper logic in `src/sim/ai.ts`:
- `isAttackCommandStale(...)`
- `isMoveCommandStale(...)`
- `commandNeedsAssaultReevaluation(...)`

This replaces the previous overly rigid assault gating behavior where units with an existing non-`move` command were often skipped entirely.

New intent:
- keep useful active commands alone,
- allow stale / invalid / obviously non-useful assault commands to be reconsidered,
- avoid broad command-schema redesign in this pass.

### 2. Final fallback move in assault

Assault processing now attempts a conservative fallback `move` if a unit did not receive a useful attack or movement order through the normal branch logic.

Intent:
- every reevaluated assault unit should get a meaningful directional order,
- reduce visual and tactical dead-time where a unit keeps no productive role.

### 3. Conservative stale attack watchdog

`attack` is treated as stale when:
- the target no longer exists,
- the target is non-attackable or invalid for combat,
- or the target is still far away and the chase command has effectively aged out.

This is intentionally conservative to reduce retarget thrash.

### 4. Conservative stale move watchdog

`move` is treated as stale when:
- the path is empty,
- or congestion indicators imply prolonged blocking (`repathCount` + `blockedAllyStreak`).

Regroup behavior now reissues stale movement more aggressively than before.

## Why this pass is intentionally narrow

This pass does **not** introduce a large command/watchdog state redesign.
It avoids new persistent command telemetry fields and keeps the change localized to AI-side reevaluation heuristics.

That keeps the patch:
- reviewable,
- deterministic-friendly,
- lower-risk for current online and simulation behavior.

## Tests run

Targeted successful runs:
- `npx tsx src/sim/ai-assault-watchdog.test.ts`
- `npx tsx src/sim/ai-goal-spread.test.ts`
- `npx tsx src/sim/ai-doctrine.test.ts`
- `npx tsx src/sim/ai-posture.test.ts`
- `npx tsx src/sim/ai-mine-intent.test.ts`
- `npx tsx src/sim/offline-simulation.test.ts`

## Playtest watchpoints

Field validation should focus on:
1. mixed melee/ranged assault waves,
2. narrow choke congestion,
3. regroup after failed push,
4. finish-off behavior when enemy army collapses,
5. reserve units that previously looked inactive.

## Known limits

- This is heuristic stale detection, not full command lifecycle tracking.
- Some deeper pathfinding/congestion AFK edge cases may still remain.
- The pass favors low-risk behavior preservation over maximum aggressiveness.

## Recommended next step

If field testing shows clear improvement but remaining edge cases persist, the next safe expansion is a fuller watchdog pass with explicit command progress timestamps/counters shared across `ai.ts`, `combat.ts`, and `commands.ts`.
