# LW2B Movement Tech Spec, Phase 1 + Phase 2 (2026-04-24)

Status: technical specification
Scope: movement foundation cleanup + worker traffic rewrite
Project: LW2B / LittleWarCraft2but
Related:
- `docs/LW2B_MOVEMENT_REDESIGN_PLAN_2026-04-24_PRE_FINAL.md`
- `docs/LW2B_MOVEMENT_IMPLEMENTATION_CHECKLIST_2026-04-24.md`
- `docs/LW2B_MOVEMENT_DOCTRINE_2026-04-23.md`
- `docs/LW2B_WORKER_MOVEMENT_PASS_2026-04-24.md`

---

## 1. Purpose

This document defines the exact technical target for the first two implementation phases of the movement redesign:

- **Phase 1:** re-establish a simpler movement foundation
- **Phase 2:** rewrite worker traffic semantics around gather/build travel

The goal of this spec is to make the first coding session focused and bounded.

This is not the full combat redesign spec.
Combat melee engagement and chase refinement are intentionally deferred to later phases.

---

## 2. Scope

## Included in this spec
- plain move foundation cleanup,
- helper/API cleanup around movement step behavior,
- worker gather/build movement semantics,
- worker traffic pathing interpretation,
- worker arrival behavior near resource/build/dropoff approach tiles,
- regression tests for worker traffic and plain move stability.

## Explicitly not included yet
- full melee contact/staging redesign,
- combat slot ownership changes,
- full chase retuning,
- ranged spacing redesign,
- broad pathfinding algorithm replacement,
- protocol/scheduling/lockstep changes.

---

## 3. Phase split

## Phase 1
### Re-establish movement foundation
Goal: simplify and clarify the base movement layer without destabilizing normal move behavior.

## Phase 2
### Worker traffic rewrite
Goal: make workers explicitly permissive/transparent during gather/build travel and eliminate worker-induced shove/jitter failures.

---

## 4. Current problems this spec is meant to solve

## 4.1 Foundation problems
- too much movement meaning is currently packed into shared local step behavior,
- policy-driven unification risks hiding important domain differences,
- plain move can become a dumping ground for worker/combat concerns.

## 4.2 Worker traffic problems
- workers still behave too much like collision-participating combat actors,
- workers may visibly jitter in congestion,
- workers may displace standing allied combat units,
- worker movement logic is still too shaped by strict shared traffic semantics,
- narrow worker fixes are accumulating without enough semantic simplification.

---

## 5. Technical design rules

## 5.1 Shared helper rule
Allowed:
- occupancy helpers,
- reservation bookkeeping,
- deterministic tie-break utilities,
- small path-step utilities.

Not desired:
- one shared semantic engine for move + chase + gather + build.

## 5.2 Domain ownership rule
- plain move behavior belongs to `commands.ts`,
- worker travel behavior belongs to `economy.ts`,
- combat engagement/chase belongs to `combat.ts`.

Helpers may live in `movement.ts`, but domain meaning should remain in the domain module.

## 5.3 Simplification rule
If a fix can be achieved by simplifying worker semantics, prefer that over adding another worker exception on top of a general collision model.

---

## 6. Phase 1 technical target

## 6.1 Objective
Make the base movement layer easier to reason about and explicitly keep plain move semantically narrow.

## 6.2 Target result
At the end of Phase 1:
- plain move is clearly the simplest movement domain,
- movement helpers are clearly helper-layer code rather than hidden policy owners,
- worker/combat divergence is not pushed back into plain move by new flags,
- all existing move stability tests remain green.

## 6.3 Code touch map
Primary:
- `src/sim/movement.ts`
- `src/sim/commands.ts`

Possible secondary review:
- `src/sim/pathfinding.ts`

## 6.4 Required audit work
During implementation, audit the following questions:
1. Which functions in `movement.ts` are pure helpers versus hidden domain behavior?
2. Which arguments/flags currently exist only because workers and combat do not truly share semantics?
3. Which plain-move behaviors are genuinely useful for ordinary move commands, and which are only legacy carryover from attempted unification?

## 6.5 Intended outcome in code structure
### `movement.ts` should ideally own only things like:
- occupancy utility logic,
- bounded reservation helpers,
- deterministic sidestep helpers,
- narrow path-step primitives where semantics stay generic.

### `commands.ts` should own:
- plain move command intent,
- ordinary repath cadence,
- move stop/fail semantics,
- any logic specific to generic destination travel.

## 6.6 Acceptable behaviors to keep in Phase 1
The following are acceptable to keep if they still help plain move:
- deterministic per-tick reservation,
- bounded repath,
- simple sidestep,
- nearby-goal fallback,
- stable tie-break order.

## 6.7 Behaviors to avoid extending in Phase 1
Do not further extend:
- generic step policies that mainly exist to preserve domain divergence,
- worker-specific semantics hidden in shared move helpers,
- combat engagement logic in plain move path stepping.

## 6.8 Phase 1 invariants
- plain move remains deterministic enough for existing expectations,
- plain move does not inherit new worker-specific rules,
- plain move does not inherit combat engagement rules,
- helper APIs become clearer or smaller, not broader.

## 6.9 Phase 1 test requirements
Must remain green:
- move command tests,
- determinism tests,
- rally/pathing tests,
- near-goal fallback behavior tests,
- any current move-policy tests relevant to plain move.

## 6.10 Phase 1 exit criteria
Phase 1 is done when:
- base movement layer is clearer,
- no meaningful plain-move regression is observed,
- worker and combat redesign still have clean places to live next.

---

## 7. Phase 2 technical target

## 7.1 Objective
Turn worker gather/build travel into an explicitly permissive traffic domain.

## 7.2 Worker scope in this phase
This phase covers worker movement during:
- gather -> toresource,
- gather -> returning,
- build -> moving.

This phase does not need to change the stationary gather/build action states themselves except where movement transition correctness requires it.

## 7.3 Target result
At the end of Phase 2:
- workers no longer visibly shove allied stationary combat units,
- worker traffic no longer feels like combat traffic,
- narrow economy lanes behave more smoothly,
- worker movement semantics are simpler to explain,
- worker path handling is throughput-first.

## 7.4 Core worker semantic rule
During gather/build travel, workers should be treated as a **permissive / transparent traffic class**.

Practical interpretation:
- terrain and building occupancy remain meaningful constraints,
- moving/stationary unit traffic should be treated much more softly,
- worker flow continuity matters more than collision purity.

## 7.5 Required worker behavior changes
### A. Worker vs allied stationary combat units
Workers should not displace allied stationary combat units during gather/build travel.

Preferred behavior order:
1. permissive continuation,
2. bypass if cheap,
3. semantic pass-through if needed,
4. wait/repath only as a last resort.

Not preferred:
- shove/displace frontline combat units.

### B. Worker vs worker traffic
Workers should not create visible jitter loops just because another worker temporarily occupies the locally preferred tile.

Preferred behavior:
- soft traversal,
- low-friction continuation,
- endpoint spreading only if it helps,
- no overcomplicated swap cascades.

### C. Worker vs mixed-unit base traffic
Workers should keep economy throughput through mixed traffic around townhall, mines, lumber routes, and build lanes.

### D. Worker approach/end behavior
Arrival logic near resource/build/dropoff approach tiles should not create repeated endpoint pogo behavior.

Preferred behavior:
- if the target approach tile is briefly contested, worker logic should resolve smoothly,
- do not let the final step become a repeated visible jitter loop,
- preserve correctness of gather/return/build transitions.

## 7.6 Code touch map
Primary:
- `src/sim/economy.ts`
- `src/sim/movement.ts`

Possible supporting review:
- any helper that currently enforces occupancy semantics for worker travel,
- approach-tile selection helpers in worker economy logic.

## 7.7 Recommended code ownership
### `economy.ts` should own
- worker travel intent,
- worker permissive traffic meaning,
- worker approach selection,
- worker arrival transition rules.

### `movement.ts` may support
- narrowly reusable primitives,
- optional worker-safe occupancy helpers if they remain simple and clearly named.

Do not move worker meaning into generic plain-move ownership.

## 7.8 Suggested implementation direction
The implementation does not need to be literally one specific algorithm, but it should approximate this design:

### Path interpretation
- treat units as soft or non-blocking for worker travel pathing,
- keep terrain/buildings as hard blockers.

### Local stepping
- worker travel should not use shove-heavy displacement against allied stationary combat units,
- worker conflict handling should prefer continuation over obstruction.

### Endpoint behavior
- if many workers converge, use narrow local smoothing rather than broad generalized crowd logic,
- preserve economy state correctness,
- avoid same visual failure recurring every tick.

## 7.9 Worker invariants
At the end of Phase 2, all of the following should be true:
- workers do not shove allied stationary combat units,
- workers can move through dense allied economy traffic more smoothly,
- workers remain bounded by map/building constraints,
- workers do not introduce illegal persistent tile stacking semantics outside intended temporary permissive behavior,
- worker behavior is more robust in townhall/mine/build lanes.

## 7.10 Phase 2 test requirements
Must add or strengthen tests for:
- worker through allied worker lane,
- worker through mixed allied unit lane,
- worker through lane containing stationary allied combat unit,
- worker return through congested dropoff approach,
- builder moving to site through narrow traffic,
- no worker-caused displacement of allied stationary combat units,
- repeated harvest/return cycles without visible logic collapse.

Existing tests that should remain green:
- determinism tests,
- worker traffic tests,
- movement policy tests where still relevant,
- rally/pathing tests,
- full test suite.

## 7.11 Manual verification scenarios
Must visually inspect:
- townhall return lane,
- mine approach,
- lumber return lane,
- mixed worker/combat traffic inside base,
- build lane with standing military units nearby,
- repeated economy loops over time.

## 7.12 Risks
- workers becoming too ghost-like visually,
- overly permissive behavior causing ugly temporary overlap artifacts,
- accidental leakage of worker transparency into combat traffic,
- worker correctness bugs in gather/return/build transition states.

## 7.13 Mitigations
- keep the change domain-local to worker travel,
- preserve hard blockers for terrain/buildings,
- use scenario-specific tests around worker endpoints,
- prefer simple permissive semantics over complex special-case swaps.

## 7.14 Phase 2 exit criteria
Phase 2 is done when:
- worker traffic visibly improves,
- allied frontline units stop being shoved by workers,
- economy lanes are smoother,
- the implementation is easier to explain than the current worker logic,
- full test suite stays green.

---

## 8. Out-of-scope notes for later phases

The following concerns are acknowledged but intentionally deferred:
- rear melee staging and anti-thrash,
- contact-slot ownership lifetime,
- melee reinforcement rotation,
- chase goal refinement around combat slots,
- ranged spacing behavior.

These belong to later combat-focused specs.

---

## 9. Recommended implementation order inside the coding session

## Step 1. Audit and trim Phase 1 boundaries
- inspect `movement.ts` and `commands.ts`,
- identify what stays generic and what does not,
- avoid large behavior changes unless needed.

## Step 2. Stabilize plain move semantics
- keep existing good behavior,
- reduce hidden domain leakage,
- keep tests green.

## Step 3. Implement worker semantic rewrite
- update worker path interpretation,
- update worker local movement behavior,
- update worker arrival behavior.

## Step 4. Add/adjust worker regression tests
- cover no-shove requirement,
- cover base-lane congestion,
- cover repeated economy loops.

## Step 5. Run full validation
- test suite,
- targeted manual scenarios,
- document any remaining known worker artifacts honestly.

---

## 10. Final summary

Phase 1 should make the movement base smaller and clearer.
Phase 2 should make workers explicitly permissive and throughput-first.

If Phase 2 still requires many collision exceptions to preserve worker feel, that is evidence the implementation is still too generalized and should be simplified further.
