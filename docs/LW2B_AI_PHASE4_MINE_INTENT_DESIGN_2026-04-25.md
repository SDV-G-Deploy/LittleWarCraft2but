# LW2B AI Phase 4 mine-intent / pressure-conversion design note (2026-04-25)

Status: design note  
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

## Test strategy for the future implementation

Do not start with broad simulation-only confidence.
Use crafted state tests first.

Recommended tests:

### `src/sim/ai-mine-intent.test.ts`
Validate:
- favorable contested state can produce `deny` or `guard` deterministically
- safe expansion state can produce `take`
- recent won local trade near contested mine can produce `baitFight` or `guard`
- recent base threat suppresses greedy conversion

### Extend `src/sim/offline-simulation.test.ts`
Validate:
- at least one side exposes non-null mine-intent state in sufficiently long simulations
- mine-intent states do not cause deadlock or command starvation

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

1. add compact `AIMineIntent` state
2. add crafted mine-intent tests first
3. implement only `deny` / `guard` / `take` if `baitFight` is still ambiguous
4. run `npm test`
5. run `npm run build`
6. only then widen into `baitFight`

This should be treated as the clean restart point for the next `/new` coding session.
