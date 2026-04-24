# LW2B Changelog - Movement Recovery Passes (2026-04-24)

Status: consolidated recovery changelog
Range: movement/combat/AI stabilization work on 2026-04-24

This note summarizes the tightly-scoped recovery passes that were applied after extended movement instability, live AI-vs-AI testing, and architecture cleanup.

---

## High-level outcome

The project moved from broad movement frustration toward a much cleaner domain split and a set of narrow, evidence-driven fixes.

Key direction locked in:
- worker gather/build travel is transparent through units,
- static/building blocking is still respected,
- AI should not mass many units onto one exact tile when spread goals are better,
- combat engagement stability belongs in combat-domain logic,
- future tuning should use lightweight KPI baselines instead of intuition alone.

---

## Passes completed

### 1. Worker transparent-through-units travel
**Commit:** `5fea663`

What changed:
- worker gather/build local movement now treats unit traffic as non-authoritative,
- workers no longer use generic ally-block sidestep/repath behavior against units,
- workers no longer shove stationary allied combat units,
- endpoint occupancy checks against units were removed for gather/build travel.

Main effect:
- economy traffic became throughput-first instead of collision-pure.

---

### 2. Worker movement doctrine/docs lock-in
**Docs commit:** `1f58bca`

What changed:
- documentation was updated to reflect that transparent worker travel is a hard architecture rule, not a tentative idea.

---

### 3. Shared movement helper boundary cleanup
**Commit:** `7159783`

What changed:
- `tryAdvancePathWithAvoidance` was refactored to remove hidden overload semantics,
- ally-block policy ownership became explicit at callsites,
- shared helper intent became clearer.

Main effect:
- less hidden semantic coupling in `movement.ts`.

---

### 4. Combat stabilization pass, hold + chase-goal cleanup
**Commit:** `77c963e`

What changed:
- added near-target melee hold behavior when no slot is available,
- reduced pointless re-poke behavior into occupied frontline pressure,
- stabilized chase-goal reuse to reduce churn.

Main effect:
- calmer frontline behavior and reduced melee retry noise.

---

### 5. Combat stabilization docs sync
**Docs commit:** `99ff78e`

What changed:
- documented the narrow combat pass and its intended boundaries.

---

### 6. Lightweight KPI baseline instrumentation
**Commit:** `7b279ee`

What changed:
- added minimal counters for move/worker/combat behavior,
- added scenario-oriented KPI baseline test,
- added lightweight reporting hooks.

Main effect:
- future tuning can compare scenario outputs instead of relying only on feel.

---

### 7. KPI baseline docs sync
**Docs commit:** `03fecf7`

What changed:
- documented the lightweight KPI pass and recommended usage.

---

### 8. Worker return/dropoff retarget recovery
**Commit:** `ed9b5b9`

What changed:
- returning workers no longer loop forever on one stale cached return target,
- repeated blocked / repath-without-progress now clears stale return target/path,
- no-route return cases no longer falsely deposit resources.

Main effect:
- better recovery near townhall/building choke geometry.

---

### 9. Worker return retarget docs sync
**Docs commit:** `37673aa`

What changed:
- documented the return-retarget recovery pass and its design boundaries.

---

### 10. AI goal spread for massing/pressure/defense flows
**Commit:** `82103ae`

What changed:
- AI now uses deterministic local spread goals around shared targets,
- applied to assault, fallback pressure, expansion pressure, and defender recall movement.

Main effect:
- fewer cases where many units repeatedly try to occupy one identical tile.

---

### 11. AI goal spread docs sync
**Docs commit:** `d48e0ac`

What changed:
- documented the AI-side fix for single-tile group congestion.

---

### 12. Combat slot freshness / stale slot fix
**Commit:** `1ba4230`

What changed:
- melee slot assignment now refreshes within the same tick,
- stale per-target per-tick slot reuse was removed,
- slot stickiness is time-bounded via `contactSlotTick`.

Main effect:
- less rear-line jitter caused by stale contact/staging intent after earlier units move.

---

## What this likely fixed in live play

Most likely improvements from the combined passes:
- workers should stop getting ruined by mixed unit traffic near the base,
- returning workers should recover better from newly created static choke points,
- AI armies should less often jitter around one exact shared gather/move tile,
- melee fronts should look calmer and less idiotically twitchy,
- movement tuning is now more measurable.

---

## What still deserves live verification

The following still benefit from real play observation:
- base layouts where AI builds too close to townhall return lanes,
- very dense combat swarms for CPU/readability tradeoffs,
- whether AI spread radius should stay at the current level or be tuned,
- whether melee slot freshness needs tiny follow-up retuning after observation.

---

## Recommended next mode

At this point the best next step is **live testing first**, not another immediate rewrite.

If new issues appear, prefer narrow passes in this order:
1. AI build-lane guard near dropoff/townhall geometry
2. minor combat slot-stickiness retune if needed
3. KPI/scenario expansion only where a real live issue demands it

---

## Bottom line

This was a productive recovery sequence.
The movement stack is now:
- more domain-correct,
- less self-contradictory,
- less hostage to one-tile AI intent bugs,
- and more diagnosable than it was before.
