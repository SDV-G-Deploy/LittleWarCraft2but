# LW2B AI Phase 2 assault posture pass (2026-04-25)

Status: implemented  
Scope: deepen strategic-intent transitions and add first real assault-posture/regroup behavior without broad rewrite

Primary file:
- `src/sim/ai.ts`

Related docs:
- `docs/LW2B_AI_OPPONENT_DEEP_AUDIT_2026-04-25.md`
- `docs/LW2B_AI_IMPLEMENTATION_PLAN_2026-04-25.md`
- `docs/LW2B_AI_DIFFICULTY_PASS_2026-04-22.md`

---

## Purpose

Phase 1 introduced the first real behavior layer:
- race doctrine,
- difficulty personality,
- strategic intent skeleton,
- economic posture,
- home reserve logic.

That pass made the AI less purely threshold-scripted, but assault behavior was still too close to a destination ladder.

This Phase 2 pass targets the next visible weakness:
- AI should not only decide **whether** to pressure,
- it should also decide **how** to pressure,
- and when to stop, regroup, or contain instead of blindly re-running the same push logic.

---

## Implemented behavior layers

## 1. Strategic intent expanded

Strategic intent now includes:
- `stabilize`
- `fortify`
- `contest`
- `pressure`
- `regroup`
- `contain`

New intent triggers include:
- recent failed push,
- recent won local trade,
- stronger front-state reads around contested/exposed zones,
- continued base-threat logic.

### Effect

The AI can now move through a more believable loop:
- stabilize,
- pressure,
- fail and regroup,
- recover and contest,
- win local space and contain.

This is still lightweight and deterministic, but it is materially less linear.

---

## 2. Assault posture layer added

New assault postures:
- `probe`
- `contest`
- `commit`
- `contain`
- `regroup`

This is the first explicit posture layer above the old “nearest target / mine / enemy base” fallback stack.

### Effect

The AI now distinguishes between:
- light pressure,
- map-objective contest,
- real commit,
- holding a pressure zone,
- and backing off to regroup.

This is a meaningful step toward an opponent that appears to have intention instead of only a route target.

---

## 3. Front-state snapshot deepened

The snapshot layer now includes:
- nearby friendly army at the active front,
- nearby enemy army at the active front,
- enemy Town Hall distance,
- recent failed push marker,
- recent won local trade marker.

### Effect

Posture selection is now informed not only by “is base threatened?” but also by a simple local read of whether the push is going well or badly.

---

## 4. Regroup logic added

When the AI detects:
- recent failed push,
- or pressure collapsing into bad local conditions,
- or an active fortify state,

it can now enter a regroup flow.

Current regroup behavior:
- assault posture becomes `regroup`,
- forces stop deep marching,
- they retarget toward a safer midpoint between current position and home anchor,
- if collapse conditions persist, AI falls back out of the assault phase.

### Effect

This is the first real “do not keep feeding forward” behavior.
That alone should reduce some of the wooden re-commit feel.

---

## 5. Contain behavior added

After a favorable local fight, the AI can now shift into `contain` instead of always converting immediately into a full base dive.

Current contain behavior is intentionally simple:
- pressure holds between contested objective space and deeper enemy territory,
- the AI stays more map-pressure oriented,
- it does not always interpret a local success as a green light for blind full commit.

### Effect

This is important for LW2B specifically because the project wants map pressure, branching pressure zones, and objective-space tension, not only base-rush behavior.

---

## What was intentionally not done yet

This pass still does **not** include:
- full squad decomposition,
- full formation behavior,
- harassment subgroup logic,
- deep target-class weighting,
- broad movement/pathfinding redesign,
- utility-AI rewrite.

That is intentional.
The goal was to get a large behavior win without destabilizing the sim.

---

## Test coverage

Added / extended:
- `src/sim/ai-posture.test.ts`
- `src/sim/offline-simulation.test.ts`

Coverage focus:
- base threat can force regroup posture,
- recent local success can keep AI in an aggressive/containing posture space,
- offline simulation continues exposing intent and assault posture state,
- no regression in full test/build pass.

Validation status for this pass:
- `npm test` ✅
- `npm run build` ✅

---

## Practical gameplay expectation

After this pass, the AI should begin to feel:
- less like one fixed march script,
- less eager to mindlessly refeed bad pushes,
- more capable of holding pressure space,
- more capable of stepping back after losing initiative,
- more readable in how it transitions between pressure states.

This does not finish the AI work.
But it should push the bot further away from “wooden threshold controller” and closer to “deterministic opponent with recognizable intent”.

---

## Recommended next pass

Best next continuation after this pass:

### Phase 3 candidate
- light squad / role split
- frontline anchor vs ranged follow behavior
- bounded home reserve group
- optional hard-mode harassment subgroup only if the first three remain stable

Why this is next:
- posture now exists,
- but army handling is still too mass-like,
- and role separation is the next strongest lever for making combat feel less topорно.
