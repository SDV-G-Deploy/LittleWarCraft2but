# LW2B Combat Stabilization Pass (2026-04-24)

Status: implemented narrow combat-domain stabilization pass
Commit: `77c963e`

Related doctrine:
- `docs/LW2B_MOVEMENT_ARCH_AUDIT_AND_REFACTOR_BRIEF_2026-04-24.md`
- `docs/LW2B_MOVEMENT_DOCTRINE_2026-04-23.md`
- `docs/LW2B_GAMEPLAY_DOCTRINE_AND_CROSS_LAYER_INVARIANTS.md`

## Purpose

This note records the narrow combat-only stabilization pass applied after:
- worker transparent-through-units travel was locked in,
- movement helper boundary cleanup made shared semantics more explicit.

The goal of this pass was not to redesign combat movement from scratch.
The goal was to reduce visible melee frontline thrash in a combat-owned way.

## Problem statement

Before this pass, one of the ugliest failure patterns was:
- rear melee units repeatedly trying to pressure an already-occupied frontline tile,
- unnecessary chase-path recompute churn when the practical chase goal had not meaningfully changed,
- same-tick noise where engagement behavior looked twitchier than the tactical situation justified.

This produced a front that could feel noisy rather than stable.

## Doctrine alignment

This pass follows the active movement contract:
- combat sophistication belongs in `combat.ts`
- worker semantics stay local to worker/economy code
- shared movement helpers should not become the semantic owner of engagement behavior
- determinism remains more important than local cleverness

## Implemented changes

### 1. Near-target no-slot melee hold behavior

Files:
- `src/sim/combat.ts`
- `src/types.ts`

What changed:
- when a melee attacker is already near the target,
- and no contact slot or staging slot is currently available,
- the unit now holds instead of repeatedly re-poking the same occupied frontline pressure lane.

Why this matters:
- reduces rear-line melee thrash,
- lowers pointless local retry behavior,
- makes reinforcement behavior look calmer and more legible.

### 2. Chase-goal reuse to reduce churn

Files:
- `src/sim/combat.ts`
- `src/types.ts`

What changed:
- attack command state now tracks an optional `chaseGoal`,
- chase recompute is driven by goal change or cadence window,
- a single tick-local chase goal is reused during chase/repath attempts instead of letting the goal bounce noisily inside the same update.

Why this matters:
- reduces same-tick chase goal flip noise,
- lowers pointless chase retry/reassign churn,
- keeps frontline engagement more stable without broad architecture changes.

## Test status

Validated before push with:
- `src/sim/combat-congestion.test.ts`
- `src/sim/determinism.test.ts`
- `src/sim/movement-policy.test.ts`
- `src/sim/worker-traffic.test.ts`
- full `npm test`

Result:
- all green for commit `77c963e`

## Honest risk

This hold behavior is intentionally conservative.
In some choke situations, a rear melee unit may wait a bit longer for slot availability instead of attempting a more opportunistic local move.

That tradeoff is currently acceptable because the pass prioritizes:
- frontline readability,
- reduced pointless melee churn,
- stable combat-owned semantics.

## Outcome

This pass should be understood as a successful narrow stabilization step, not the final combat movement design.

What it improved:
- rear-line melee no longer pushes as idiotically into already-occupied frontline pressure,
- chase-path churn is lower,
- combat behavior is more stable while staying domain-local.

What it did not try to solve:
- full formation logic,
- advanced flank intelligence,
- large-scale combat crowd simulation,
- global movement architecture redesign.

## Recommended next step

The next highest-value step is not another broad refactor.
It is a **verification/KPI pass** that turns current movement and combat improvements into measurable scenario outputs.

Best next direction:
- add movement/combat KPI capture hooks,
- add scenario-oriented reporting for plain move / worker / combat scenes,
- establish baseline numbers so further tuning stays evidence-driven.
