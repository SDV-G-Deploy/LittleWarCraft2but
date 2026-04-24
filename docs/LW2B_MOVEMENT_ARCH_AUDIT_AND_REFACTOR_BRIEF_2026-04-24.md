# LW2B Movement Architecture Audit + Refactor Brief (for OpenClaw)

Date: 2026-04-24  
Audience: OpenClaw implementation pass owner  
Project: LittleWarCraft2but (browser RTS)

---

## 1) Purpose

This document is a **handoff-ready engineering brief** that converts current movement analysis into an execution plan.

Goals:
- stabilize movement quality for a small browser RTS,
- preserve lockstep determinism,
- keep worker economy flow robust,
- improve melee/chase readability,
- avoid reintroducing a universal over-generalized movement core.

---

## 2) Current architecture snapshot (ground truth)

### Domain split currently present (good)
- Plain move: `src/sim/commands.ts` + `src/sim/movement.ts`
- Combat chase/engagement movement: `src/sim/combat.ts` + shared local step helper
- Worker gather/build travel: domain-owned logic in `src/sim/economy.ts`

### Key properties currently present
- Stable per-tick entity-id processing order.
- Tick-scoped movement-resolution state in shared movement layer.
- Deterministic reservation support for ordinary move commands.
- Flow-field-first route trial with A* fallback for plain move goals.
- Worker-domain travel semantics isolated from generic move policy.

### Why this is the right baseline
The codebase already shows that broad movement unification caused fragility in live-like traffic, and the project now benefits from domain-local semantics.

---

## 3) Architecture contract (must not be violated)

### Rule A — Domain separation is mandatory
Do not implement one semantic movement engine for:
- move,
- combat chase,
- gather/build worker travel.

Shared helpers are allowed; shared semantics are not the target.

### Rule B — Determinism over cleverness
Never trade deterministic outcomes for local movement “smartness”.

### Rule C — Worker throughput over realism
Worker traffic may be permissive/fake if that protects economy continuity.
Do not let workers become shove-heavy actors against allied stationary combat lines.

### Rule D — Combat sophistication belongs in combat domain
Fix rear-line thrash and front stability via combat engagement structure (slot/staging/anti-thrash), not via generalized crowd rules.

---

## 4) Risk register (current)

| ID | Domain | Risk | Severity | Symptoms | Primary Mitigation |
|---|---|---|---|---|---|
| R1 | Plain move | Local deadlock/repath churn in dense groups | High | units stall/jitter in chokepoints | keep bounded repath + deterministic reservation + strict stuck metrics |
| R2 | Combat | Rear melee re-poking occupied frontline tile | High | twitchy front, ugly reinforcement behavior | staging-slot + anti-thrash hold logic |
| R3 | Worker | Base-lane congestion around dropoff/mine | High | delayed returns, economic collapse feel | keep worker-domain permissive movement and endpoint guardrails |
| R4 | Cross-domain | Semantic leakage from worker/combat into plain move | High | flag explosion and hard-to-reason outcomes | domain-owned policies only |
| R5 | Performance | Pathing overhead spikes on browser | Medium | frame spikes in larger armies | keep flow-field as support optimization, not full dynamic crowd sim |
| R6 | Verification | “Looks okay” but no hard movement KPIs | High | regressions caught late in manual play | add objective movement KPI gates in CI |

---

## 5) Metrics contract (add before large refactor)

Implement and log these KPIs at minimum:

### Plain move KPIs
- `move_stuck_events_per_1k_ticks`
- `move_repath_attempts_per_1k_ticks`
- `move_repath_success_ratio`
- `median_move_time_to_goal`

### Combat KPIs
- `melee_retargets_per_1k_ticks`
- `rear_melee_wait_ratio`
- `chase_repath_attempts_per_1k_ticks`
- `contact_slot_reassign_rate`

### Worker KPIs
- `median_worker_cycle_ticks` (gather→return)
- `worker_queue_depth_near_dropoff`
- `worker_arrival_block_retries`
- `worker_stall_events_per_1k_ticks`

### Determinism KPIs
- hash parity pass/fail over deterministic scenario set
- command-order invariance checks for movement-sensitive scenes

Pass/fail gating recommendation:
- no KPI regression > 10% on baseline scenarios unless explicitly approved in PR notes.

---

## 6) Scenario suite (required)

Create/extend deterministic test scenarios:

1. **PlainMove-Choke-12Units**
2. **PlainMove-HeadOn-Contention**
3. **Combat-Frontline-2x2-Reinforce**
4. **Combat-Choke-RangedBackline**
5. **Worker-Townhall-Lane-MixedTraffic**
6. **Worker-Mine-Approach-HighConcurrency**
7. **Worker-Build-Approach-NarrowLane**
8. **LongRun-OfflineSimulation-PathingStability**

Each scenario should emit KPI snapshots and deterministic pass signal.

---

## 7) Implementation plan (OpenClaw execution order)

## Phase 0 — Verification foundation (must do first)
Deliverables:
- KPI capture hooks in profiler/nav debug,
- scenario suite skeleton + baseline recordings,
- CI target job for movement KPI + determinism checks.

Done when:
- baseline numbers are captured and committed,
- movement PRs can be judged against objective data.

---

## Phase 1 — Plain move hardening (narrow)
Scope:
- `src/sim/commands.ts`
- `src/sim/movement.ts`
- optional profiler wiring

Tasks:
- preserve current simple semantics,
- tighten congestion behavior only where KPI-proven,
- avoid adding domain-specific flags to shared move helper.

Exit criteria:
- no regressions in adjacent/no-op/reservation tests,
- improved or neutral plain-move KPIs,
- determinism unchanged.

---

## Phase 2 — Worker traffic reliability pass
Scope:
- `src/sim/economy.ts`
- worker traffic tests

Tasks:
- keep worker travel explicitly domain-owned,
- optimize for throughput and anti-stall behavior,
- preserve non-displacement of allied stationary combat units,
- refine endpoint handling (dropoff/resource/build approach) to reduce visible pileups.

Exit criteria:
- better worker cycle KPIs,
- no new deterministic failures,
- no semantic leakage into plain/combat movement.

---

## Phase 3 — Combat engagement stabilization
Scope:
- `src/sim/combat.ts`
- combat congestion tests

Tasks:
- formalize staging behavior for rear melee,
- add anti-thrash retry/hold logic,
- reduce pointless pressure into occupied frontline tiles,
- keep ranged behavior distinct.

Exit criteria:
- reduced combat thrash KPIs,
- visually stable frontline behavior in manual check scenes,
- no move-domain regressions.

---

## Phase 4 — Performance polish (only after correctness)
Scope:
- flow-field cache usage and pathing hot paths

Tasks:
- optimize only KPI-proven hotspots,
- avoid algorithmic rewrites without clear benefit,
- keep browser affordability as priority.

Exit criteria:
- lower average pathing CPU cost in heavy scenes,
- no gameplay/semantics regression.

---

## 8) PR policy for OpenClaw movement work

Every movement PR must include:
1. domain label: `plain-move` / `combat` / `worker`,
2. KPI before/after table,
3. determinism test result,
4. explicit statement: “no cross-domain semantic leakage introduced” (or explain intentional exception),
5. rollback note: how to revert safely.

PRs lacking KPI evidence should be considered incomplete.

---

## 9) Anti-pattern checklist (hard fail)

Reject changes that:
- reintroduce one universal movement semantic core across all domains,
- add multiple policy booleans to force worker/combat divergence inside shared move helper,
- improve theoretical local correctness while worsening economy continuity,
- introduce non-deterministic tie resolution,
- widen scope without scenario/KPI evidence.

---

## 10) Minimal task ticket set (copy to tracker)

1. `MOV-001` Add movement KPI capture + baseline snapshots.
2. `MOV-002` Add deterministic scenario suite scaffolding + reporters.
3. `MOV-003` Plain-move congestion hardening (KPI-driven, narrow).
4. `MOV-004` Worker throughput/endpoint pass (economy-domain local).
5. `MOV-005` Combat staging/anti-thrash stabilization.
6. `MOV-006` Pathing performance pass (post-correctness only).

---

## 11) One-line directive for OpenClaw

**Keep domain boundaries strict, prove every movement change with deterministic scenario KPIs, and optimize gameplay readability/throughput before algorithm elegance.**
