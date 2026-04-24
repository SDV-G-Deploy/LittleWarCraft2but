# LW2B Movement Implementation Checklist (2026-04-24)

Status: implementation planning checklist
Scope: movement, pathfinding, crowd control, combat engagement, chase, worker traffic
Related:
- `docs/LW2B_MOVEMENT_REDESIGN_PLAN_2026-04-24_PRE_FINAL.md`
- `docs/LW2B_MOVEMENT_DOCTRINE_2026-04-23.md`
- `docs/LW2B_MOVEMENT_PATHING_PASSES_2026-04-22.md`
- `docs/LW2B_WORKER_MOVEMENT_PASS_2026-04-24.md`

---

## 1. Purpose

This checklist converts the redesign plan into a phased implementation sequence.

It is intended to answer:
- what to build first,
- what code areas are involved,
- what tests must exist,
- what risks to watch,
- what counts as done.

This is not a broad rewrite checklist.
Each phase should leave the game in a stable, testable state.

---

## 2. Global implementation rules

### Rules for the whole effort
- implement one movement domain at a time,
- avoid giant mixed refactors,
- keep rollback points after each phase,
- prefer deleting wrong generality over adding new policy flags,
- verify behavior by both tests and manual feel checks,
- do not let worker fixes leak combat semantics or vice versa.

### Core architecture rule
- shared helpers are allowed,
- shared semantics are not the goal.

### Code review rule
Every movement change should answer:
1. which domain does this belong to,
2. can this be narrower,
3. does this reduce or increase hidden state,
4. does it reduce visible jitter/thrash,
5. does it preserve determinism and browser affordability.

---

## 3. Phase 0. Freeze target semantics

## Objective
Make the target architecture explicit before further code changes.

## Main work
- finalize movement redesign docs,
- align doctrine docs,
- align worker-pass and pathing-pass notes,
- define movement domain boundaries in writing.

## Code areas
- no functional gameplay code required,
- docs only.

## Required outputs
- redesign plan exists,
- doctrine is synchronized,
- implementation checklist exists,
- terminology is stable: plain move / combat chase-engagement / worker traffic.

## Risks
- architecture drift if coding starts before semantic boundaries are agreed,
- reintroducing universal-core thinking via local “temporary” shortcuts.

## Done criteria
- docs exist and do not contradict each other,
- next coding phase can reference one stable target architecture.

---

## 4. Phase 1. Re-establish movement foundation

## Objective
Return to a simpler, readable functional base without blindly copying history.

## Main work
- identify which current shared helpers are still genuinely useful,
- reduce over-generalized movement behavior where it hides domain semantics,
- keep the low-cost parts that improve ordinary travel,
- ensure plain move remains the simplest semantic layer.

## Code areas
- `src/sim/movement.ts`
- `src/sim/commands.ts`
- possibly `src/sim/pathfinding.ts`

## Implementation tasks
- audit current shared step helpers and separate helper logic from domain meaning,
- keep occupancy/reservation helpers only where they pay for themselves,
- confirm plain move path-step behavior is understandable end to end,
- remove or avoid new generic flags that only exist to emulate worker/combat divergence.

## Required tests
- existing move command tests stay green,
- determinism tests stay green,
- rally/pathing tests stay green,
- no regression in adjacent/near-goal movement.

## Manual checks
- ordinary point-to-point move feels stable,
- units do not produce new weird stop-start behavior,
- move behavior remains cheap and predictable.

## Risks
- accidentally breaking move while trying to “clean architecture”,
- deleting helper behavior that actually prevents ugly same-tick conflicts,
- turning cleanup into another hidden rewrite.

## Done criteria
- plain move behavior is semantically simple,
- helper layer is smaller or clearer,
- no new worker/combat special cases were pushed back into plain move.

---

## 5. Phase 2. Worker traffic rewrite

## Objective
Make worker gather/build travel explicitly permissive and stop worker-induced shove/jitter failures.

## Main work
- make worker gather/build traffic throughput-first,
- stop workers from displacing allied stationary combat units,
- simplify worker traffic instead of stacking more swap exceptions,
- make dense economy lanes feel smooth enough.

## Code areas
- `src/sim/economy.ts`
- `src/sim/movement.ts`
- possibly worker-related selection logic in approach-target helpers

## Implementation tasks
- define worker-domain travel policy explicitly for:
  - gather -> toresource
  - gather -> returning
  - build -> moving
- make worker path planning treat unit traffic as soft or non-blocking relative to terrain/buildings,
- remove shove-heavy worker behavior against allied stationary combat units,
- replace displacement-heavy worker conflict handling with permissive continuation / transparent traversal semantics,
- simplify worker endpoint arrival behavior to avoid local pileup jitter.

## Required tests
Add or strengthen tests for:
- worker through allied worker lane,
- worker through mixed allied base traffic,
- worker through lane with standing allied frontline unit,
- worker return-to-townhall under congestion,
- builder approach to site under narrow-lane traffic,
- no worker-caused displacement of allied stationary combat units.

## Manual checks
- townhall lanes,
- mine approach,
- lumber return lanes,
- mixed worker/combat traffic inside base,
- repeated economy loops over time.

## Risks
- workers becoming visually too ghost-like,
- transparent logic accidentally leaking into combat units,
- endpoint arrival becoming too permissive and causing ugly overlap artifacts.

## Done criteria
- workers no longer visibly shove allied standing combat units,
- worker traffic no longer feels like combat traffic,
- economy throughput is improved,
- narrow base lanes look smoother,
- worker behavior is simpler to explain than before.

---

## 6. Phase 3. Combat melee engagement stabilization

## Objective
Stop rear melee thrash and make frontline engagement visually stable.

## Main work
- strengthen contact-slot logic,
- formalize staging-slot behavior,
- add anti-thrash rules for rear melee,
- make melee engagement depend on engagement structure rather than repeated occupied-tile pressure.

## Code areas
- `src/sim/combat.ts`
- possibly supporting helpers in `src/sim/movement.ts`

## Implementation tasks
- audit current `contactSlot` assignment behavior,
- add or strengthen staging-slot assignment for overflow melee,
- add cooldown or hold logic so rear melee do not constantly retry the same occupied frontline tile,
- make slot reassignment happen on meaningful state change rather than every noisy local fluctuation,
- preserve deterministic tie-breaking.

## Required tests
Add or strengthen tests for:
- two frontliners head-on, rear melee behind,
- occupied frontline tile with staged rear melee,
- one frontline unit dies or moves, staged unit rotates in,
- multi-attacker same-target engagement without contact-slot spam,
- dense melee front does not devolve into repeated poke-jitter.

## Manual checks
- small skirmish line,
- narrow choke front,
- sustained melee blob,
- reinforcement wave joining existing front.

## Risks
- overengineering combat engagement state,
- creating sluggish melee that waits too much,
- unintentionally breaking chase responsiveness.

## Done criteria
- rear melee stop visibly poking occupied allied frontline tiles,
- frontline lines look more stable,
- reinforcements join combat more cleanly,
- melee behavior looks smarter without becoming inert.

---

## 7. Phase 4. Combat chase refinement

## Objective
Make chase purposeful and compatible with engagement structure.

## Main work
- separate melee chase goals from raw target pressure,
- align chase with contact/staging logic,
- reduce congestion stupidity around contested fronts,
- keep ranged chase behavior distinct from melee chase behavior.

## Code areas
- `src/sim/combat.ts`
- `src/sim/pathfinding.ts`
- `src/sim/nav/flow-field.ts`
- `src/sim/nav/flow-field-cache.ts`

## Implementation tasks
- make melee chase target assigned engagement positions where possible,
- review when flow-field-first is helpful and when A* fallback should dominate,
- reduce pointless local chase pressure into already-unusable tiles,
- keep ranged units from collapsing into melee congestion when range behavior should suffice.

## Required tests
Add or strengthen tests for:
- open-field chase,
- choke chase,
- multiple melee chasing one moving target,
- ranged chase behind melee line,
- contested front with moving retreat target.

## Manual checks
- pursuit after broken frontline,
- melee chasing through congestion,
- ranged units maintaining usable distance,
- mixed-unit battle transitions.

## Risks
- chase becoming overcautious and sluggish,
- flow-field tuning causing odd macro routes,
- melee/ranged behavior accidentally converging again.

## Done criteria
- chase feels intentional,
- melee chase supports engagement stability,
- ranged chase avoids unnecessary frontline collapse,
- congestion looks less dumb during pursuit.

---

## 8. Phase 5. Plain move validation and cleanup

## Objective
Confirm plain move stayed clean while worker and combat domains diverged properly.

## Main work
- re-check plain move after combat/worker changes,
- remove leftover generic cruft,
- ensure helper layer still makes sense.

## Code areas
- `src/sim/commands.ts`
- `src/sim/movement.ts`
- `src/sim/pathfinding.ts`

## Implementation tasks
- remove temporary compatibility hacks that no longer belong,
- verify helper APIs are still domain-appropriate,
- confirm plain move did not inherit worker/combat branching by accident.

## Required tests
- move command tests,
- determinism tests,
- rally/pathing tests,
- any regression suite created in earlier phases.

## Manual checks
- ordinary move orders on open map,
- near-building navigation,
- group move to rally / exact tile / nearby tile.

## Risks
- cleanup reintroducing regressions,
- helper deletion breaking hidden but useful edge handling.

## Done criteria
- plain move remains simple and robust,
- leftover redesign scaffolding is reduced,
- domain separation is clearer in code than before.

---

## 9. Phase 6. Long-run verification and feel pass

## Objective
Prove the redesign works under actual gameplay-like load, not just unit tests.

## Main work
- long-run simulation checks,
- mixed economy/combat verification,
- manual feel evaluation,
- stress scenarios on lanes and fronts.

## Code areas
- tests and validation harnesses,
- no required gameplay-logic changes unless bugs are found.

## Required tests
- long-run smoke simulations,
- determinism verification,
- worker traffic regression suite,
- combat congestion regression suite,
- any offline observer/simulation tools already present.

## Manual checks
- base economy under sustained harvesting,
- skirmish plus economy running together,
- narrow lane worker traffic,
- sustained frontline melee,
- chase after line breaks.

## Risks
- tests passing while feel is still wrong,
- local fixes interacting badly only in longer sessions,
- hidden regressions in edge maps or mixed-unit scenarios.

## Done criteria
- no major visible jitter loops,
- no major economy traffic regressions,
- no obvious frontline thrash pattern,
- overall movement feels more alive and less dumb than current baseline.

---

## 10. Recommended test additions summary

## Worker-focused
- transparent worker lane traversal,
- worker mixed-traffic base return,
- worker no-shove against allied stationary combat,
- builder lane congestion,
- repeated harvest/deposit cycle under load.

## Combat-focused
- rear melee staging instead of poke-thrash,
- clean frontline rotation,
- chase-to-engagement transition,
- ranged-behind-melee spacing sanity,
- contested choke behavior.

## Plain move / shared
- deterministic resolution under same-tick destination conflict,
- bounded repath under repeated obstruction,
- near-goal arrival behavior,
- rally spread / nearby-goal fallback.

---

## 11. Recommended code ownership map

### Worker movement ownership
Primary: `src/sim/economy.ts`
Helpers only where needed: `src/sim/movement.ts`

### Plain move ownership
Primary: `src/sim/commands.ts`
Helpers: `src/sim/movement.ts`, `src/sim/pathfinding.ts`

### Combat movement ownership
Primary: `src/sim/combat.ts`
Helpers: `src/sim/movement.ts`, flow-field/pathfinding helpers

### Important ownership rule
If a behavior is primarily about:
- economy continuity -> it belongs to worker/economy logic,
- melee/ranged engagement quality -> it belongs to combat logic,
- generic destination travel -> it belongs to move logic.

Do not fix domain problems by hiding them in the wrong owner module.

---

## 12. Final implementation rule

When a movement fix is proposed, prefer this order:
1. narrower domain-specific fix,
2. simpler semantics,
3. deterministic local heuristic,
4. broader shared helper change only if clearly justified.

If a fix requires many policy booleans to preserve worker and combat behavior simultaneously, that is a sign the change is too broad.
