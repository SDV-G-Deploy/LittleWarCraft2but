# LW2B AI Phase 4 mine-intent / pressure-conversion design note (2026-04-25)

Status: design note + implementation checkpoint  
Scope: compact design-first spec for the next AI pass after Phase 3 role split / target weighting work

Related docs:
- `docs/LW2B_AI_PHASE3_ROLE_SPLIT_PASS_2026-04-25.md`
- `docs/LW2B_AI_IMPLEMENTATION_PLAN_2026-04-25.md`
- `docs/LW2B_AI_PHASE2_ASSAULT_POSTURE_PASS_2026-04-25.md`

Primary target file for future implementation:
- `src/sim/ai.ts`

---

## Why this note exists

A direct implementation attempt for mine intent was started and then intentionally rolled back.

Reason:
- the desired mine-intent layer was still under-specified,
- synthetic test scenes did not surface stable behavior cleanly enough,
- forcing the pass at that stage would have produced decorative state instead of trustworthy behavior.

This note defines the next pass before code resumes.

---

## Phase 4 goal

Teach the AI to do something more meaningful with favorable map space than just:
- drift toward a mine,
- drift toward the enemy base,
- or hold a generic contain posture.

The target outcome is:
- clearer distinction between contesting a mine,
- taking a mine,
- guarding a gained mine,
- and using mine space to bait or force a favorable fight.

This is not just “choose a different destination”.
It is about converting local advantage into a more legible map-pressure decision.

---

## Mine-intent states to support

Recommended compact set:
- `deny`
- `take`
- `guard`
- `baitFight`

### `deny`
Use when:
- contested mine is favorable,
- pressure bias is high,
- AI wants to keep opponent off resource access,
- but does not yet want a deeper macro conversion.

Behavior target:
- move around contested mine space,
- pressure access lanes,
- keep posture aggressive,
- avoid overcommitting to full base dive unless stronger signals appear.

### `take`
Use when:
- expansion mine is safe enough,
- economy posture or race bias supports macro conversion,
- local pressure near home is low.

Behavior target:
- prefer expansion-side pressure/movement,
- treat gained map space as an economy conversion,
- avoid unnecessarily abandoning mine-side control immediately.

### `guard`
Use when:
- a favorable mine or near-safe mine already exists,
- local gains should be consolidated,
- overextension is less valuable than holding income/control.

Behavior target:
- hold space between mine and enemy approach,
- avoid drifting into a blind base push,
- preserve pressure while stabilizing territory.

### `baitFight`
Use when:
- local trade was recently favorable,
- race/difficulty bias wants pressure,
- mine space is a good place to force the next fight,
- but full commit still looks too expensive.

Behavior target:
- stay near contested objective space,
- threaten the mine strongly enough to pull enemy contact,
- prefer favorable local engagement over raw deep march.

---

## Recommended deterministic signals

Keep the first implementation narrow.
Do not build a giant snapshot object.

Recommended signals for the first real pass:

1. **contestedMineFavorable**
- already conceptually present in current AI snapshot logic
- should remain one of the main mine-intent gates

2. **safeExpansionExists**
- required for `take`
- should stay conservative

3. **recentWonLocalTrade**
- required to distinguish `guard` / `baitFight` from generic pressure

4. **recentBaseThreat**
- should suppress or downgrade mine conversion

5. **nearbyFriendlyArmyAtFront vs nearbyEnemyArmyAtFront**
- needed to avoid fake confidence at mine space

6. **enemyTownHallDistance**
- useful only as a supporting bias, not as the primary trigger

Important rule:
- do not let mine intent depend on fragile one-frame assumptions
- mine intent should emerge from a few stable state conditions, not tiny local noise

---

## Conversion rules after local success

This is the real heart of the next pass.

Current AI can win local contact, but still lacks a clear conversion layer.
The next implementation should decide between these outcomes:

### Win local trade near contested mine
Possible conversions:
- `guard` for lower-pressure / more disciplined doctrine
- `baitFight` for higher-pressure doctrine
- `commit` only if broader push conditions are already strong

### Win local trade while safe expansion exists
Possible conversions:
- `take` if economy posture is `greed` or race bias supports expansion
- `guard` if AI should secure map space before deeper conversion

### Win local trade but recent base threat exists
Possible conversions:
- do **not** greed-convert immediately
- prefer `guard` or even fall back to `stabilize`

### No local success, but contested mine favorable
Possible conversions:
- `deny` for aggressive doctrine
- `guard` / `contest` for disciplined doctrine

---

## Recommended implementation shape

Keep it small and explicit.

Suggested helper boundary:

```ts
function chooseMineIntent(state, ai, owner, snapshot): AIMineIntent | null
```

Recommended first integration points:
1. compute mine intent after strategic intent + assault posture update
2. let mine intent bias assault destination selection
3. let mine intent bias contain-vs-base-dive behavior
4. do not yet let mine intent rewrite the whole AI phase machine

That means:
- mine intent should initially be a control modifier,
- not a new giant planner layer.

---

## Implementation checkpoint, 2026-04-25

Phase 4 was resumed and now has a real first implementation in `src/sim/ai.ts`.

Implemented so far:
- `AIMineIntent = 'deny' | 'take' | 'guard' | 'baitFight'`
- `AIController.mineIntent: AIMineIntent | null`
- `chooseMineIntent(...)` runs after strategic intent and assault posture updates
- mine-intent now affects assault movement through a dedicated movement-bias helper
- crafted tests exist in `src/sim/ai-mine-intent.test.ts`

Phase 4.2 also tightened the decision surface:
- snapshot now tracks separate local front counts for contested-mine space and expansion-mine space
- `guard` / `baitFight` require clearer contested-front presence
- `take` now requires safe expansion plus non-losing local expansion presence
- favorable contested states are less likely to be incorrectly overridden by greedy expansion conversion
- recent base threat suppresses `take` unless mine-side control is clearly real

Phase 4.3 now tightens pressure-conversion after local success:
- recent won local trade near contested space now prefers `guard` or `baitFight` instead of drifting too easily into generic pressure or greed conversion
- recent won local trade near safe expansion no longer jumps straight into `take`; it can first consolidate through `guard`
- recent base threat now downgrades contested success into `guard` rather than allowing greed conversion
- contested-mine pressure is less easily overridden by expansion-side `take` heuristics when mine space is still strategically active

Side follow-up passes also completed on top of Phase 4:
- unfinished owned `construction` sites are now resumed by AI through conservative worker reassignment when no active builder remains
- collapse / finish-off behavior now activates when the enemy has no army and no workers left, so assault can close out remaining structures instead of drifting in contain/mine logic
- finish-off targeting now has clearer cleanup ordering (`townhall` > production > tower > farm > stray construction/other)
- closing pressure is more decisive because frontline anchoring pulls harder into remaining high-value structure targets during collapse states

Validation status for the implemented pass:
- `npm test` ✅
- `npm run build` ✅

Current caveat:
- `deny` remains intentionally conservative because contested-favorability gates are still narrow; this preserves determinism discipline, but likely still leaves some mine-space aggression on the table for a later pass

## Test strategy for the future implementation

Do not start with broad simulation-only confidence.
Use crafted state tests first.

Recommended tests:

### `src/sim/ai-mine-intent.test.ts`
Validate:
- favorable contested state can produce `guard` deterministically
- safe expansion state can produce `take`
- recent won local trade near contested mine can produce `baitFight`
- recent won local trade near safe expansion can prefer `guard` over immediate `take`
- recent base threat suppresses greedy conversion and can downgrade contested success into `guard`

### Extend `src/sim/offline-simulation.test.ts`
Validate:
- at least one side exposes non-null mine-intent state in sufficiently long simulations
- mine-intent states do not cause deadlock or command starvation
- AI resumes unfinished owned construction when the original builder is gone or no longer assigned
- AI issues finish-off commands when only enemy structures remain
- finish-off prefers high-value structures before low-value cleanup
Important:
- if crafted tests are hard to write cleanly, that is a design smell
- fix the decision surface before forcing the pass into code

---

## What to avoid in the next implementation

1. Do not add mine-intent as decorative state with no real behavioral consequence.
2. Do not force synthetic tests that only pass by overfitting weird setups.
3. Do not let mine intent override defense sanity.
4. Do not make `take` trigger too easily, or AI will become greed-blind.
5. Do not collapse `guard` and `contain` into identical behavior.

---

## Recommended next coding sequence

Phase 4.1 and 4.2 are now effectively complete as a safe first mine-intent pass.

Recommended next continuation:
1. distinguish movement/anchor behavior more clearly between `guard` and `baitFight`
2. decide whether `deny` should stay a posture modifier or become a stronger lane-pressure behavior
3. introduce lightweight `expand` strategic intent if it now improves readability instead of duplicating `take`
4. extend offline simulation assertions from “collection stays valid” toward occasional observed non-null mine-intent under stable long-run conditions
5. run `npm test`
6. run `npm run build`

This file should now be treated as the clean restart point for the next `/new` coding session.
