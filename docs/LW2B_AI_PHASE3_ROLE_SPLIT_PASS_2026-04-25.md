# LW2B AI Phase 3 role split pass (2026-04-25)

Status: implemented  
Scope: turn assault posture into visibly different army handling with deterministic role split, frontline anchoring, ranged follow behavior, bounded hard-mode harassment, role-aware target selection, melee/heavy frontline differentiation, and reserve-release discipline

Primary file:
- `src/sim/ai.ts`

Related docs:
- `docs/LW2B_AI_PHASE2_ASSAULT_POSTURE_PASS_2026-04-25.md`
- `docs/LW2B_AI_IMPLEMENTATION_PLAN_2026-04-25.md`

Related tests:
- `src/sim/ai-role-split.test.ts`
- `src/sim/ai-posture.test.ts`
- `src/sim/offline-simulation.test.ts`

---

## Purpose

Phase 2 gave the AI posture language.
But most of the army still behaved too much like one mass with a slightly different destination.

This Phase 3 pass focuses on the next most visible gameplay lever:
- make frontline and backline behave differently,
- keep a real bounded reserve near home,
- give ranged units a follow relationship instead of full frontline walk-in,
- and let hard AI stage a small harassment subgroup without blowing up determinism.

The point is not formations.
The point is to stop the army from reading like one blob with one target.

---

## Implemented behavior layers

## 1. Deterministic assault role split

Assault army handling now assigns units into explicit roles:
- `reserve`
- `frontlineLine`
- `frontlineShock`
- `rangedFollow`

Assignment properties:
- deterministic ordering by unit id,
- bounded reserve count from existing home-reserve logic,
- ranged units preferentially classified into follow role,
- standard melee units form the line-holding front,
- heavy units form the shock layer of the front.

### Effect

The AI now has a lightweight tactical decomposition without needing a full squad or formation system.

---

## 2. Real bounded home reserve behavior

Previously, reserve logic mostly affected which units were omitted from the main assault slice.

Now reserve units also receive explicit home-side movement behavior:
- they bias toward Town Hall space,
- they avoid joining the deep assault flow by default,
- they remain a real bounded defensive presence.

### Effect

This reduces the feeling that “reserve” is only a bookkeeping number.
It becomes visible on the field.

---

## 3. Frontline anchor added

Phase 3 introduces a `frontlineAnchor` concept.
It is computed deterministically from:
- current posture,
- current pressure target,
- a leading non-ranged assault unit,
- and objective-space bias when a contested mine exists.

Anchor behavior:
- `commit` pushes deeper,
- `contest` and `contain` stay more objective-space oriented,
- `regroup` pulls the anchor back toward home.

### Effect

The army has a more legible “where the fight line should be” reference instead of only a raw destination ladder.

---

## 4. Ranged follow behavior

Ranged units no longer just inherit the same march pattern as frontline units.

Current behavior:
- if a local valid target exists, they still attack,
- otherwise they bias toward the frontline anchor,
- in regroup they fall back through the anchor path instead of desynchronizing into arbitrary retreat lines.

### Effect

Backline units read more like support pressure and less like melee units with different stats.

---

## 5. Hard-mode bounded harassment subgroup

A narrow Phase 3.1 extension was added in the same pass:
- hard difficulty can peel off a very small ranged harassment subgroup,
- subgroup size is bounded,
- subgroup is disabled for regroup,
- subgroup stages toward a separate `harassmentAnchor` rather than full deep dive.

Current harassment behavior is intentionally conservative:
- use only a small slice of eligible ranged units,
- prefer local unit hits when available,
- otherwise stage short of the deepest target.

### Effect

Hard AI gains a little more pressure texture without turning into noisy split-map chaos.

---

## 6. Role-aware target selection

Phase 3.2 adds weighted target choice on top of the movement/role layer.

Current weighting is deterministic and role-sensitive:
- `harassment` prefers workers, exposed ranged, and damaged soft targets,
- `rangedFollow` prefers enemy ranged and other efficient soft targets,
- `frontline` remains more direct but is no longer purely nearest-target driven.

Signals currently used include:
- distance,
- missing HP,
- recent damage state,
- target class,
- role-specific penalties for bad dive targets like towers.

### Effect

The AI no longer just arrives in a better shape.
It also converts contact into better focus fire and pressure value.

---

## 7. Objective-space anchor improvement

When a contested mine exists and the AI is not in full `commit`, frontline anchoring now leans more heavily toward that contested objective space.

### Effect

Pressure near mines and map-control points becomes more readable and less base-tunnel-visioned.

---

## What was intentionally not done yet

This pass still does **not** include:
- full formation logic,
- broad pathfinding redesign,
- full mine-intent layer,
- multi-squad planner behavior,
- deep utility-style tactical planner.

That is deliberate.
This pass was about visible tactical readability with low system risk.

---

## Test coverage

Added / extended:
- `src/sim/ai-role-split.test.ts`
- `src/sim/offline-simulation.test.ts`

Coverage focus:
- ranged units follow the frontline anchor instead of overrunning it,
- hard AI can form a bounded harassment subgroup,
- harassment prefers exposed workers over low-value structures,
- ranged follow prefers nearby enemy ranged when appropriate,
- heavy shock units can lean deeper than line units,
- reserve release discipline avoids immediate full reserve dump after recent threat,
- reserve units stay home-side during assault,
- offline simulation still reaches active assault postures.

Validation status for this pass:
- `npm test` ✅
- `npm run build` ✅

---

## Practical gameplay expectation

After this pass, the AI should feel:
- less like one marching blob,
- more readable in frontline/backline behavior,
- more capable of holding a home-side reserve,
- slightly more textural on hard through small harassment staging,
- better at choosing useful local targets,
- better at expressing pressure around contested objective space,
- less twitchy when transitioning out of defense.

This is still not a full tactical AI.
But it is a strong step toward armies that look intentional instead of merely redirected.

---

## Recommended next pass

Best next continuation after this pass:
- mine-intent and pressure-conversion deepening,
- smarter convert-vs-contain rules after local success,
- later, broader objective-layer pressure planning.

Current follow-up note:
- `docs/LW2B_AI_PHASE4_MINE_INTENT_DESIGN_2026-04-25.md`

Why this is next:
- role split now exists,
- target selection is now materially better,
- frontline heavy/line distinction now exists,
- the next strongest gain is teaching the AI what to do with won space, not only how to move and focus within it.
