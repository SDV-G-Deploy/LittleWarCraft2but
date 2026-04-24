# LW2B Movement Redesign Plan (2026-04-24, pre-final)

Status: pre-final engineering plan
Scope: movement, pathfinding, crowd control, battle engagement, chase behavior
Project: LW2B / LittleWarCraft2but

---

## 1. Purpose

This document defines the target redesign plan for LW2B movement after forensic review of movement history, worker-pathing regressions, combat congestion behavior, and gameplay-feel concerns.

The goal is not to produce the most theoretically elegant movement model.
The goal is to restore a movement system that feels alive, readable, deterministic enough, and robust for a lightweight browser RTS.

This plan is intentionally gameplay-first.

---

## 2. Executive summary

Current assessment:
- the current movement stack contains useful local improvements,
- but the overall result has become too layered and too generalized,
- worker traffic still feels wrong,
- melee engagement still produces visible rear-line thrash,
- overall movement readability has degraded compared with simpler earlier baselines.

Independent recommendation:
- do **not** keep the current generalized movement direction as the long-term base,
- use a **simpler rollback-style baseline** as the foundation,
- re-apply only the improvements that clearly help RTS gameplay,
- explicitly separate movement behavior by domain.

Recommended domain split:
1. plain move
2. combat chase / engagement
3. worker gather/build traffic

Core design rule:
- workers should be forgiving,
- combat movement may be sophisticated,
- plain move should stay moderate and deterministic.

---

## 3. Design goals

The redesigned movement system should:
- improve gameplay feel and perceived liveliness,
- reduce visible stupidity and jitter,
- preserve determinism where it matters,
- keep economy traffic reliable,
- keep melee engagement readable,
- avoid architecture-wide over-unification,
- stay affordable for a lightweight web browser RTS.

### Desired player-facing outcomes
- workers reliably reach resources and construction sites,
- workers do not visibly bully or displace standing frontline units,
- rear melee units do not repeatedly poke the same occupied frontline tile,
- battle lines look stable rather than twitchy,
- chase feels purposeful rather than dumb or chaotic,
- pathing errors degrade gracefully instead of producing repeated local spasms.

---

## 4. Non-goals

This redesign does **not** aim to introduce:
- advanced crowd simulation,
- ORCA / boids / full local steering systems,
- continuous physics-like collision,
- a single universal movement engine that semantically owns all command domains,
- expensive global replanning around moving units.

This redesign also does **not** optimize for movement realism first.
It optimizes for RTS readability, economy continuity, and stable outcomes.

---

## 5. Architectural decision

## 5.1 Domain separation is mandatory

LW2B movement must be treated as three distinct domains:

### A. Plain move
Standard movement orders for units traveling to a destination.

### B. Combat chase / engagement
Attack movement, target pursuit, frontline formation, melee access, ranged spacing.

### C. Worker gather/build traffic
Economy travel to resources, return-to-dropoff traffic, builder travel to site.

These domains may share low-level helpers, but they should not be forced into one generalized behavior model.

### Rule
Shared helpers are good.
Shared semantics are dangerous.

---

## 6. Recommended baseline strategy

## 6.1 Foundation choice

The recommended foundation is a **simpler rollback-style movement baseline**, closer in spirit to the more direct and readable behavior observed before the later layering wave.

This means:
- simpler base movement semantics,
- smaller local conflict rules,
- less generalized policy branching,
- fewer domain-crossing assumptions.

## 6.2 Do not revert blindly

The target is **not** a pure historical rollback.
The target is:
- rollback-style simplicity as foundation,
- plus selective retention of the best later ideas.

## 6.3 Improvements worth keeping

The following later ideas are still valuable and should be preserved or refined:
- deterministic reservation where it reduces same-tick tile conflict,
- bounded repath instead of uncontrolled retry loops,
- simple deterministic sidestep,
- combat-specific melee slotting/contact-slot concepts,
- congestion smoothing in chase where it improves combat readability,
- flow-field-first chase when it actually improves large-path pursuit.

## 6.4 What should not remain the architectural center

The following direction should not stay as the main long-term base:
- one semi-unified movement core stretched across move, chase, gather, and build,
- heavy reliance on policy flags to emulate domain differences,
- worker traffic behaving like combat traffic with extra exceptions,
- displacement-heavy worker behavior around allied combat lines.

---

## 7. Worker movement redesign

## 7.1 Problem statement

Workers currently still exhibit the wrong class of behavior:
- visible jitter,
- overreaction in traffic,
- shoving or displacing standing allied combat units,
- poor lane behavior near townhall, mine access, or building routes,
- too much dependence on strict shared collision rules.

For LW2B, this is the wrong tradeoff.

## 7.2 Design principle

Workers are a **special movement traffic class**.
Their job is not to participate in elegant congestion realism.
Their job is to preserve economy flow.

### Core worker rule
During gather/build travel, worker movement should be **permissive / transparent / economy-first**.

## 7.3 Worker target behavior

During these phases:
- gather -> toresource
- gather -> returning
- build -> moving

workers should:
- pass through unit traffic much more freely than combat units,
- avoid deadlocks aggressively,
- avoid visual pogo behavior,
- avoid displacing allied stationary combat units,
- prefer continuity over collision purity.

## 7.4 Recommended implementation direction

Recommended semantic model:
- worker path planning should treat units as soft or non-blocking compared with terrain/buildings,
- worker local movement should not shove allied stationary combat units,
- if local traffic conflict occurs, prefer bypass, permissive continuation, or temporary semantic pass-through,
- do not reintroduce generalized swap/displacement behavior as the worker default.

## 7.5 Worker invariants

The redesigned worker system must satisfy:
- workers do not stall the economy because of allied unit traffic,
- workers do not repeatedly jitter in narrow economy lanes,
- workers do not push stationary allied combat units out of formation,
- workers may look slightly fake if needed, but should look smooth enough in practice,
- economy continuity beats realism.

---

## 8. Plain move redesign

## 8.1 Role of plain move

Plain move should be:
- simple,
- deterministic,
- understandable,
- not over-engineered.

Plain move is not the place for deep combat semantics or economy exceptions.

## 8.2 Recommended stack

Preferred plain move stack:
- global route from flow-field or A* fallback,
- occupancy check,
- deterministic reservation where useful,
- simple sidestep,
- bounded repath,
- graceful stop/fail behavior instead of infinite retry energy.

## 8.3 Design rule

Plain move should solve ordinary travel problems well.
It should not attempt to become a full crowd negotiation layer.

---

## 9. Combat chase and engagement redesign

## 9.1 Problem statement

Combat is where visible movement stupidity hurts most.
The current remaining problem is not just path quality. It is engagement quality.

Observed/expected issues:
- rear melee units trying to enter already-occupied frontline tiles,
- contact-slot thrash,
- repeated local poke behavior behind an already-established line,
- congestion near contested fronts,
- chase behavior that is technically active but visually dumb.

## 9.2 Design principle

Combat movement is the one domain where sophistication is justified.
The goal is readable engagement, not just shortest-path arrival.

## 9.3 Melee engagement target model

Melee units should operate around an explicit engagement structure:
- target footprint,
- contact ring,
- assigned contact slot,
- staging ring,
- hold/wait behavior,
- controlled reassignment.

## 9.4 Required melee behavior

When a frontline contact tile is occupied by an allied engaged melee unit, a rear melee unit should not repeatedly attempt to walk into it.

Instead it should:
- hold a staging slot,
- wait or orbit lightly within bounded rules,
- re-evaluate assignment only when meaningful state changes,
- enter contact when the slot actually opens.

## 9.5 Suggested combat mechanics

Recommended combat-side features:
- stable contact slot assignment,
- staging slots for overflow melee,
- reassignment cooldowns,
- anti-thrash rules around occupied friendly engagement tiles,
- chase goals based on assigned slot, not only target center,
- ranged behavior that respects range bands and avoids unnecessary frontline collapse.

## 9.6 Combat invariants

The redesigned combat movement must satisfy:
- rear melee do not endlessly poke the same occupied friendly tile,
- frontline lines remain visually stable,
- chase does not collapse into mass self-blocking near contact,
- congestion degrades into waiting/staging rather than twitching.

---

## 10. Pathfinding strategy

## 10.1 Pathfinding responsibilities

Pathfinding should provide:
- a good macro route,
- predictable path quality,
- low enough cost for browser RTS runtime,
- compatibility with deterministic local step execution.

## 10.2 Pathfinding should not solve everything

Pathfinding should **not** try to fully solve:
- melee formation logic,
- detailed moving-unit crowd behavior,
- worker traffic semantics by itself.

Those belong to domain behavior layers.

## 10.3 Domain-specific pathing interpretation

### Plain move
- terrain/static blockers matter most,
- unit traffic handled mostly locally.

### Combat chase
- global path feeds combat engagement,
- final local goal should often be a combat slot rather than raw target tile.

### Worker traffic
- terrain/buildings remain hard constraints,
- unit traffic should be interpreted permissively.

---

## 11. Crowd control strategy

## 11.1 What LW2B needs

LW2B does not need advanced crowd simulation.
It needs **lightweight deterministic conflict handling**.

## 11.2 Preferred local tools

Keep and refine only the cheap tools that pay for themselves:
- stable processing order,
- per-tick reservation where useful,
- bounded sidestep,
- bounded repath,
- small local anti-thrash heuristics.

## 11.3 What to avoid

Avoid:
- generalized push/swap systems as a default movement language,
- complex negotiation between all unit categories,
- broad policy matrices that hide semantic differences instead of clarifying them.

## 11.4 Rule of thumb

Crowd control should smooth intent.
It should not replace intent.

---

## 12. Target implementation shape

## 12.1 Shared helpers allowed

Shared low-level helpers are acceptable for:
- tile occupancy checks,
- reservation bookkeeping,
- deterministic tie-break helpers,
- simple sidestep utilities,
- bounded repath helpers.

## 12.2 Domain-owned behavior

Each domain should still own its own meaning:

### Plain move owns
- destination travel behavior,
- stop/fail semantics,
- basic congestion fallback.

### Combat owns
- chase semantics,
- slot selection,
- range/LOS interaction,
- staging behavior,
- frontline anti-thrash.

### Worker owns
- gather/build travel semantics,
- permissive traffic rules,
- economy continuity behavior.

This is the intended balance:
- shared mechanics, separate semantics.

---

## 13. Validation and test matrix

## 13.1 Worker validation

Required worker scenarios:
- worker passes through allied worker lane without pathological jitter,
- worker reaches mine/tree through mixed allied traffic,
- worker returns to dropoff through narrow base traffic,
- worker does not displace stationary allied melee/ranged line,
- builder reaches site through congested base lane,
- economy remains stable under repeated travel.

## 13.2 Combat validation

Required combat scenarios:
- two melee frontliners engage head-on,
- rear melee arrive behind them,
- rear melee hold staging instead of repeatedly poking the same contact tile,
- contact opens and one staged unit rotates in cleanly,
- ranged units behind melee do not collapse formation unnecessarily.

## 13.3 Chase validation

Required chase scenarios:
- open-field chase,
- choke chase,
- multi-unit chase on same target,
- contested frontline with moving target,
- ranged chase under frontline congestion.

## 13.4 Long-run validation

Required long-run checks:
- multi-minute simulation smoke,
- economy plus combat simultaneously,
- no infinite jitter loops,
- no unbounded repath churn,
- no economy starvation caused by traffic logic,
- no visible frontline spasm behavior under sustained battle.

---

## 14. Rollout plan

## Phase 1. Freeze doctrine and target semantics
Create/update docs so the architecture is explicit:
- three movement domains,
- worker transparency policy,
- combat engagement policy,
- plain move simplicity policy.

## Phase 2. Re-establish foundation
Use simpler rollback-style movement semantics as the functional base.
Do not blindly copy history. Rebuild the intended base cleanly if needed.

## Phase 3. Worker pass first
Prioritize worker gather/build traffic repair:
- transparent/permissive worker travel,
- remove allied combat shove behavior,
- validate economy lanes.

## Phase 4. Combat melee stabilization
Implement or strengthen:
- contact slot stability,
- staging slots,
- anti-thrash logic,
- controlled rotation into engagement.

## Phase 5. Chase refinement
Tune combat chase behavior so it targets engagement positions rather than dumb direct pressure.
Keep ranged and melee needs separate.

## Phase 6. Verification pass
Run targeted tests and manual feel checks on:
- townhall/mine traffic,
- narrow lanes,
- head-on melee engagements,
- dense contested fronts,
- mixed economy/combat sessions.

## Phase 7. Cleanup
Remove leftover broad-policy cruft and preserve only the movement logic that is clearly justified by gameplay.

---

## 15. Rollback and safety strategy

Each phase should leave behind a stable checkpoint.
Do not attempt the full redesign as one giant movement rewrite.

Recommended safety rules:
- one domain-focused pass at a time,
- keep manual visual validation after each pass,
- maintain long-run smoke tests during the redesign,
- preserve rollback points after each phase.

---

## 16. Acceptance criteria

The redesign can be considered successful when:
- worker movement feels smooth enough and no longer looks like combat traffic,
- workers stop shoving allied standing frontline units,
- rear melee no longer visibly spam occupied friendly frontline tiles,
- battle lines read clearly during sustained melee,
- chase behavior looks purposeful,
- pathing remains affordable and stable for browser runtime,
- the code structure is simpler to reason about than the current layered state.

---

## 17. One-sentence plan summary

**Restore a simpler RTS-readable movement base, make worker traffic explicitly permissive, keep combat movement as the main place for sophistication, and reject further drift toward an over-generalized universal movement model.**
