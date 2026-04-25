# LW2B AI Implementation Plan (2026-04-25)

Status: implementation blueprint  
Scope: safe incremental plan for making LW2B opponents less wooden, more race-distinct, and more strategically expressive without breaking determinism discipline

Related docs:
- `docs/LW2B_AI_OPPONENT_DEEP_AUDIT_2026-04-25.md`
- `docs/LW2B_AI_DIFFICULTY_PASS_2026-04-22.md`
- `docs/LW2B_AI_GOAL_SPREAD_PASS_2026-04-24.md`
- `docs/LW2B_SIMULATION_MODE_DESIGN_2026-04-23.md`

Primary implementation target:
- `src/sim/ai.ts`

Secondary likely targets:
- `src/types.ts`
- `src/balance/races.ts`
- `src/data/races.ts`
- `src/sim/offline-simulation.test.ts`
- new AI-specific tests under `src/sim/`

---

## Goal

Make AI opponents feel:
- less linear,
- less threshold-scripted,
- more race-distinct,
- more intentional in attack/defense posture,
- better at map-pressure choices,
- still deterministic,
- still no-cheat,
- still compatible with existing offline simulation and online architecture.

This plan intentionally does **not** propose a full AI rewrite.
The better strategy is to layer strategic behavior on top of the current AI skeleton.

---

## Design principles

1. Keep the current `economy / military / assault` phase machine as the base.
2. Add a lightweight **intent layer above it**, not a new giant planner.
3. Keep all AI decisions derived only from synced game state.
4. Preserve deterministic tie-breaks and stable ordering.
5. Avoid coupling AI improvement with broad movement/pathfinding rewrites.
6. Add tests at each phase before widening behavior.
7. Prefer narrow passes with visible gameplay payoff.

---

## Core implementation idea

The current AI controller is too scalar-driven.
It needs a few new structured behavior layers:

1. **Race doctrine**
2. **Difficulty personality**
3. **Strategic intent**
4. **Assault posture**
5. **Light role split / reserve logic**
6. **Map-pressure intent for mines and pushes**

These should be incremental additions to `AIController`, not a separate subsystem with duplicated state.

---

## Proposed controller expansion

Current `AIController` already contains good scalar knobs.
Do not remove them yet.
Add structured fields alongside them.

## New enums / state concepts

### Strategic intent

Recommended first pass:
- `stabilize`
- `fortify`
- `contest`
- `expand`
- `pressure`
- `commitPush`
- `regroup`
- `contain`

### Economic posture

Recommended first pass:
- `stable`
- `greed`
- `recover`
- `fortify`

### Assault posture

Recommended first pass:
- `probe`
- `contest`
- `commit`
- `contain`
- `regroup`

### Mine intent

Recommended first pass:
- `deny`
- `take`
- `guard`
- `baitFight`

### Defense posture

Recommended first pass:
- `lineHold`
- `workerGuard`
- `fullRecall`
- `tradeAndCounter`

---

## Proposed `AIController` additions

These are conceptual fields, not exact final names.

```ts
strategicIntent: 'stabilize' | 'fortify' | 'contest' | 'expand' | 'pressure' | 'commitPush' | 'regroup' | 'contain';
economicPosture: 'stable' | 'greed' | 'recover' | 'fortify';
assaultPosture: 'probe' | 'contest' | 'commit' | 'contain' | 'regroup';
defensePosture: 'lineHold' | 'workerGuard' | 'fullRecall' | 'tradeAndCounter';
mineIntent: 'deny' | 'take' | 'guard' | 'baitFight' | null;

raceDoctrine: AIRaceDoctrine;
difficultyPersonality: AIDifficultyPersonality;

homeReserveMin: number;
harassGroupMax: number;
frontlineAnchorRatio: number;
rangedFollowDistance: number;

lastIntentSwitchTick: number;
lastFailedPushTick: number;
lastWonLocalTradeTick: number;
lastBaseThreatTick: number;
lastMineContestTick: number;
```

Important:
these are still lightweight.
The goal is short-term memory and posture, not a long historical planner.

---

## New supporting data tables

## 1. Race doctrine table

Add a dedicated race doctrine table.
This can live in `src/sim/ai.ts` first for speed, or later be moved into a small balance/config module.

### Example shape

```ts
interface AIRaceDoctrine {
  economyRisk: number;
  reserveBias: number;
  pressureBias: number;
  regroupDiscipline: number;
  towerBias: number;
  expansionBias: number;
  rangedPreservationBias: number;
  frontlinePreference: number;
  harassmentBias: number;
  preferredDefensePosture: 'lineHold' | 'workerGuard' | 'fullRecall' | 'tradeAndCounter';
}
```

### Human doctrine target
- higher reserve bias
- higher ranged preservation bias
- higher regroup discipline
- stronger line-hold preference
- lower reckless pressure bias
- slightly higher tower / layered defense preference

### Orc doctrine target
- higher pressure bias
- higher harassment bias
- lower regroup threshold after local success
- higher willingness to continue contact
- lower reserve bias than Humans
- stronger shock/frontline commitment

This is the cleanest route to distinct race feel without cheating.

---

## 2. Difficulty personality table

Keep existing scalar presets, but split “personality” out from pure thresholds.

### Example shape

```ts
interface AIDifficultyPersonality {
  opportunism: number;
  patience: number;
  greedPunishBias: number;
  splitPressureBias: number;
  fallbackDiscipline: number;
  regroupDelayBias: number;
  adaptationRate: number;
}
```

### Easy target
- readable
- less exploitative
- less split pressure
- more territorial and defensive
- still coherent, not just weak

### Medium target
- balanced and reliable
- one coherent plan at a time
- moderate adaptation

### Hard target
- more opportunistic
- better greed punishment
- better momentum conversion
- more likely to use partial-force pressure and posture changes

This matters because current difficulty mostly changes strength, not personality.

---

## Functional changes by implementation phase

## Phase 1, safest high-value pass

### Goal
Realize race and difficulty feel differences without yet changing the core phase machine too much.

### Work items

1. Add race doctrine table
2. Add difficulty personality table
3. Bind those into existing scalar choices:
   - worker target bias
n   - tower thresholds
   - ranged/heavy ratios
   - fallback wave threshold
   - reserve fraction for defense recall
4. Add simple home reserve logic
5. Add first-pass economy posture selection

### Minimal code touch points
- `createAI()`
- `getArmyMixPlan()`
- `estimateWoodDemand()`
- `recallDefenders()`
- tower build gating in `military`
- assault fallback threshold handling

### Intended result
- Human and Orc begin to feel different even on same difficulty
- Easy / Medium / Hard feel more like different temperaments
- no major control-flow rewrite yet

### Risk
Low

### Tests to add
- Human vs Orc doctrine values are distinct and deterministic
- reserve logic leaves expected home defenders under threat
- composition mix differs by race doctrine in equivalent army sizes
- no regression in existing simulation smoke tests

---

## Phase 2, strategic intent layer

Status: implemented on 2026-04-25 as first assault-posture pass. See also `docs/LW2B_AI_PHASE2_ASSAULT_POSTURE_PASS_2026-04-25.md`.

### Goal
Add a small adaptive layer above current phases.

### Work items

1. Add `strategicIntent`
2. Add `updateStrategicIntent(state, ai, owner, snapshot)` helper
3. Derive intent from synced match state:
   - nearby threat
   - army size and losses
   - expansion opportunities
   - contested mine access
   - recent local win/loss markers
4. Allow intent to modulate existing phase behavior

### Example transition rules

#### `stabilize`
Enter when:
- early game with insufficient army,
- recent base pressure,
- recent failed push,
- weak eco and low reserve.

#### `fortify`
Enter when:
- base threat repeated,
- worker damage repeated,
- enemy local pressure outpaces current army.

#### `contest`
Enter when:
- contested mine is favorable,
- local army sufficient,
- no strong reason for full base push.

#### `expand`
Enter when:
- safe expansion available,
- current map pressure near home is low,
- economy can support it.

#### `pressure`
Enter when:
- local superiority exists,
- enemy greed/exposure is detected,
- race/difficulty bias encourages it.

#### `commitPush`
Enter when:
- the army is ready,
- local momentum or timing is favorable,
- fallback risk acceptable.

#### `regroup`
Enter when:
- recent push lost too much coherence,
- frontline collapsed,
- current assault target is too costly.

#### `contain`
Enter when:
- forward pressure is good,
- but a full dive is not yet favorable,
- map-control hold is preferable to overextension.

### Intended result
The AI starts changing its plan based on the match instead of only executing its preset.

### Risk
Medium

### Tests to add
- deterministic strategic intent switching from equivalent state snapshots
- failed push causes regroup transition
- repeated base pressure causes fortify transition
- favorable contested mine state causes contest or pressure transition

---

## Phase 3, assault posture expansion

Status: implemented on 2026-04-25 as role split / anchor / bounded harassment / role-aware targeting pass. See also `docs/LW2B_AI_PHASE3_ROLE_SPLIT_PASS_2026-04-25.md`.

Update after Phase 2:
- a first posture layer is now already in place (`probe`, `contest`, `commit`, `contain`, `regroup`)
- this phase has now deepened the tactical consequences of those postures through deterministic role split, frontline anchoring, ranged follow behavior, real bounded reserve handling, a small hard-only harassment subgroup, role-aware target weighting, heavy-vs-line frontline split, and reserve-release hysteresis

### Goal
Make combat movement and pressure behavior less linear.

### Work items

Implemented in this pass:
1. deepen posture-aware assault logic rather than only adding the state layer
2. add deterministic role split for `reserve`, `frontlineLine`, `frontlineShock`, and `rangedFollow`
3. add explicit frontline anchor behavior
4. add real reserve hold-near-home movement
5. add bounded hard-only harassment staging
6. add role-aware target weighting for local combat decisions
7. split frontline behavior between line units and heavy shock units
8. add reserve-release hysteresis to reduce oscillation
9. stop treating every assault as a pure march-to-target flow

### Recommended posture semantics

#### `probe`
- move toward pressure zone
- do not fully dive if support is thin
- attack nearby exposed targets

#### `contest`
- prioritize contested mine area control
- avoid deep base overcommit
- hold useful local ground after arrival

#### `commit`
- push deeper toward key enemy asset
- lower retreat threshold
- higher chase willingness

#### `contain`
- hold pressure zone
- deny mine / route / expansion
- do not feed into base defenses blindly

#### `regroup`
- fall back toward rally or midpoint anchor
- wait for cohesion / numbers recovery
- re-enter attack only after stability returns

### Minimal tactical metrics needed
- nearby friendly count
- nearby enemy count
- distance to home anchor
- distance to target zone
- recent damage or recent ally losses near local area

### Intended result
The AI stops feeling like it only knows “go there or attack nearest thing”.

### Risk
Medium

### Tests added / extended
- regroup posture retargets away from deep dive
- ranged follow respects frontline anchor behavior
- reserve units stay home-side during assault
- bounded harassment subgroup appears only in constrained conditions
- harassment prefers exposed workers over low-value structures
- ranged follow prefers nearby enemy ranged when appropriate
- heavy shock units can lean deeper than line units
- reserve-release hysteresis reduces immediate post-threat dumping
- offline simulation still reaches active posture states
- current goal spread tests remain green

---

## Phase 4, light squad / role split

Update after implemented Phase 3:
- a meaningful light role split is now already present
- the remaining Phase 4 value is to deepen role quality rather than introduce the first split

### Goal
Deepen the existing light role split without introducing full formations.

### Work items

1. Deepen mine-intent and pressure-conversion behavior
2. Improve contain-vs-convert decisions after local wins
3. Refine reserve sizing and reserve release conditions further if needed
4. Keep deterministic ordering by entity id
5. Avoid growing this into a full squad/formation subsystem

### Example approach

- sort military units by stable key
- classify by unit kind and doctrine
- reserve first N units for home defense if needed
- assign ranged to follow frontline anchor band
- assign harass subgroup only if army size is above threshold and personality allows it

### Important constraint

This is not a formation system.
It is a deterministic role split using existing command primitives.

### Intended result
- stronger frontline/backline readability
- less single-mass behavior
- more believable tactical presence

### Risk
Medium

### Tests to add
- deterministic role assignment for same game state remains stable as role logic deepens
- mine-intent transitions remain deterministic
- contain-vs-convert decisions stay stable under equivalent snapshots
- reserve release conditions do not cause oscillation

---

## Phase 5, mine intent and map-pressure deepening

### Goal
Turn mine targeting from destination scoring into real map intent.

### Work items

1. Add `mineIntent`
2. Differentiate between:
   - deny
   - take
   - guard
   - baitFight
3. Connect mine intent to strategic intent and assault posture
4. Let race/difficulty bias influence whether a favorable mine becomes:
   - a macro conversion,
   - a fight magnet,
   - a denial zone.

### Intended result
Map pressure becomes more legible and less generic.
This matches the broader LW2B design doctrine better than raw base-rush bias.

### Risk
Low to medium

### Tests to add
- same mine state yields stable mine-intent result
- Humans more often convert favorable space into guard/take
- Orcs more often convert into deny/baitFight under pressure bias

---

## Concrete helper functions to add

These are recommended helper boundaries to keep `tickAI()` from becoming unmanageable.

```ts
function evaluateAISnapshot(state, ai, owner): AISnapshot
function updateStrategicIntent(state, ai, owner, snapshot): void
function updateEconomicPosture(state, ai, owner, snapshot): void
function updateDefensePosture(state, ai, owner, snapshot): void
function updateAssaultPosture(state, ai, owner, snapshot): void
function chooseMineIntent(state, ai, owner, snapshot): AIMineIntent | null
function assignArmyRoles(state, ai, owner, snapshot, soldiers): AIArmyRoles
function shouldRegroup(state, ai, owner, snapshot): boolean
function shouldCommitPush(state, ai, owner, snapshot): boolean
```

### Suggested `AISnapshot`

Keep it compact and deterministic.

```ts
interface AISnapshot {
  myArmySize: number;
  enemyArmyNearBase: number;
  nearbyFriendlyArmyAtFront: number;
  nearbyEnemyArmyAtFront: number;
  myWorkersUnderThreat: number;
  myTownHallUnderThreat: boolean;
  safeExpansionExists: boolean;
  contestedMineFavorable: boolean;
  enemyTownHallDistance: number | null;
  recentBaseThreat: boolean;
  recentFailedPush: boolean;
  recentWonLocalTrade: boolean;
}
```

Do not let this become a giant analysis object.
It only needs enough information to support posture changes.

---

## Test plan

Current test suite already includes:
- determinism tests
- movement / congestion tests
- goal spread test
- offline simulation smoke tests

That is a good base.
Add focused AI tests instead of relying only on visual playtest.

## Recommended new tests

### `src/sim/ai-doctrine.test.ts`
Validate:
- Human and Orc doctrine values differ as intended
- doctrine application is deterministic
- no undefined doctrine paths exist

### `src/sim/ai-intent.test.ts`
Validate:
- intent transitions from crafted game states are stable
- repeated threat causes fortify
- safe expansion state enables expand
- failed push enables regroup

### `src/sim/ai-role-split.test.ts`
Validate:
- army role partitioning is deterministic
- reserve sizes obey posture/doctrine
- ranged units classify into follow role correctly

### `src/sim/ai-posture.test.ts`
Validate:
- assault posture changes destination/behavior choice deterministically
- contain does not deep-dive by default
- regroup moves toward safer anchor

### Extend `src/sim/offline-simulation.test.ts`
Add assertions for:
- late-game posture changes still occur
- both sides continue issuing varied command types
- no AI deadlock after regroup transitions

---

## Build / validation workflow

For each phase:
1. implement the narrow pass
2. run targeted new AI tests
3. run full `npm test`
4. run `npm run build`
5. inspect for online-risk spillover
6. only then continue to the next phase

Suggested command rhythm:
- `npm test`
- `npm run build`

Do not stack multiple AI phases before validation.

---

## What to avoid

1. Do not attempt a giant utility-AI rewrite.
2. Do not mix this pass with broad movement architecture changes.
3. Do not bundle low-level combat retarget rewrite and high-level strategic intent in one diff.
4. Do not introduce hidden cheats to simulate intelligence.
5. Do not make race feel depend only on stat changes.
6. Do not let `tickAI()` become one giant monolith; factor helpers early.

---

## Recommended first implementation pass

If only one pass is taken next, the best choice is:

### First implementation pass recommendation
- add race doctrine table
- add difficulty personality table
- add strategic intent skeleton with only 4 live states first:
  - `stabilize`
  - `fortify`
  - `contest`
  - `pressure`
- add simple home reserve logic
- use intent to modulate:
  - worker target bias
  - tower timing
  - attack-wave threshold
  - fallback behavior
  - contested-mine vs base-push preference

### Why this is the best first pass

Because it gives the highest behavior gain for the lowest engine risk.
It should already produce noticeably less wooden matches without requiring full role split or complex assault choreography.

---

## Acceptance criteria for the overall AI improvement track

The track should be considered successful when all of the following become true in practical playtests:

1. Human AI and Orc AI are recognizable as different strategic opponents.
2. Easy / Medium / Hard differ by behavior character, not only speed and density.
3. AI can visibly switch posture during a match.
4. AI attacks no longer feel like a single destination ladder with local reaction only.
5. Defensive behavior looks more intentional and less all-or-nothing.
6. Map pressure around mines feels purposeful.
7. Offline simulation remains stable.
8. Determinism-sensitive paths remain disciplined.
9. No-cheat philosophy is preserved.

---

## Final recommendation

Proceed in layered passes, not a rewrite.

Best order:
1. doctrine + personality
2. strategic intent
3. assault posture + regroup
4. role split
5. mine intent deepening

That sequence should give LW2B a much more expressive opponent AI while staying aligned with the project's broader doctrine:
variety through meaningful gameplay structure and map pressure, not fake AI tricks.
