# LW2B AI Opponent Deep Audit (2026-04-25)

Status: read-only analytical research pass  
Scope: current opponent AI architecture, race/difficulty feel gaps, root-cause analysis of "wooden" behavior, and prioritized improvement roadmap  
Code reviewed primarily:
- `src/sim/ai.ts`
- `src/game.ts`
- `src/sim/offline-simulation.test.ts`
- `src/types.ts`
- `src/data/races.ts`
- `src/balance/races.ts`

Related existing docs:
- `docs/LW2B_AI_DIFFICULTY_PASS_2026-04-22.md`
- `docs/LW2B_AI_GOAL_SPREAD_PASS_2026-04-24.md`
- `docs/LW2B_SIMULATION_MODE_DESIGN_2026-04-23.md`
- `README.md`

---

## Executive summary

The current LW2B AI is not broken.
It is structurally too shallow.

The main problem is not one bug, one missing heuristic, or one pathing flaw.
The problem is that the AI still operates mostly as a narrow deterministic script with a small number of threshold-driven branches.

This creates the exact player-facing symptoms already observed:
- opponents feel wooden,
- matches become linear,
- difficulty mostly changes pacing and density instead of personality,
- Human AI and Orc AI do not feel strategically distinct enough,
- unit control is functional but topologically crude,
- the bot rarely appears to have an adaptive intention.

The current stack is good enough as a support AI for solo play and simulation.
It is not yet good enough to feel like a varied strategy opponent.

---

## Current AI architecture, as implemented

The AI core lives in `src/sim/ai.ts`.

At a high level, it uses:
- one controller object (`AIController`),
- one coarse phase machine:
  - `economy`
  - `military`
  - `assault`
- one decision cadence via `reactionDelayTicks`,
- deterministic owner-parameterized behavior,
- deterministic tie-breaking and movement spread helpers,
- no explicit cheating layer.

### What it does reasonably well already

The current AI already has several useful foundations:
- owner-parameterized logic for either side,
- economy basics,
- race-aware unit/building resolution through race profiles,
- basic army composition management,
- local base-threat assessment,
- defender recall,
- contested/expansion mine targeting heuristics,
- deterministic group-goal spread to reduce one-tile congestion,
- simulation-mode compatibility and long-run smoke coverage.

This is important because it means the next pass should not replace the AI wholesale.
The better move is to add a missing decision layer above the existing skeleton.

---

## Decision clusters, current behavior, and why the AI feels wooden

## 1. Economy cluster

### Current heuristic

The AI economy loop is straightforward:
- train workers until a fixed `workerTarget`,
- build the first farm,
- build barracks,
- build lumber mill when affordable,
- assign some workers to wood based on estimated wood demand,
- continue training from barracks.

Wood demand is estimated from a small set of projected costs:
- missing lumber mill,
- low supply margin,
- near-term soldier production,
- doctrine requirement,
- possible tower requirement.

### Why it creates wooden play

This economy is competent but highly generic.
It does not express a real economic style.

It does not meaningfully answer questions like:
- should I greed because the map is safe?
- should I over-invest in wood because my race profile wants ranged / tower posture?
- should I pause army growth to secure expansion timing?
- should I switch to survival mode after local military losses?

The result is that economy becomes a predictable ramp rather than part of a match narrative.

### Minimal fix

Add situational economy postures without changing the whole system:
- `stable`
- `greed`
- `recover`
- `fortify`

These can remain deterministic and only bias worker count, wood allocation, and tower timing.

### Stronger fix

Introduce an `economicIntent` layer derived from map state, pressure, and recent outcome:
- if recently defended a major base threat, prefer `recover`
- if nearest safe expansion is favorable, prefer `greed`
- if enemy pressure proximity is high, prefer `fortify`

### Determinism risk

Low, if driven only by synced game state and stable tie-breaks.

### Expected gameplay payoff

Moderate to high.
The AI starts looking less like a script and more like a side choosing a match posture.

---

## 2. Build placement cluster

### Current heuristic

Current build placement is utilitarian:
- general ring search around Town Hall for many buildings,
- lumber mill prefers forest adjacency,
- tower placement uses a candidate list biased by:
  - enemy Town Hall direction,
  - nearby mine corners,
  - lumber mill adjacency,
  - fallback Town Hall perimeter.

### Why it creates wooden play

Placement is practical, but still mostly generic.
It does not yet reflect strategic identity.

For example, current towers are “reasonable placements”, but not strongly tied to:
- chokepoint denial,
- vulnerable worker lanes,
- expansion cover,
- race-specific defense style,
- map geometry class.

This means structures rarely communicate a larger plan.

### Minimal fix

Add map-approach scoring for towers:
- path-to-Town-Hall interception value,
- mine-cover value,
- worker-lane-cover value,
- local choke leverage.

### Stronger fix

Introduce posture-sensitive placement:
- Human AI prefers layered hold and safer perimeter overlap,
- Orc AI prefers forward coverage and pressure-support tower positions.

### Determinism risk

Low to medium, depending on path-query usage.
Safe if reduced to deterministic tile scoring over synced geometry.

### Expected gameplay payoff

Moderate.
This will not solve AI depth alone, but it will make the bot feel more intentional and factional.

---

## 3. Composition cluster

### Current heuristic

Army composition is based on:
- fixed difficulty-biased ratios,
- current total army size,
- minimum frontline requirement,
- cap on heavy units,
- race-specific unit kinds and costs.

This means the AI does produce different unit names and different stat packages by race.
But the composition logic itself is almost race-agnostic.

### Why it creates wooden play

The AI builds a ratio, not a doctrine.

Human and Orc differ in unit templates, but not enough in composition intent.
The decision engine does not strongly encode ideas such as:
- Humans preserve line integrity and backline support,
- Orcs lean into shock timing and rough local superiority,
- Humans accept slower pushes for cleaner formation,
- Orcs more often spike pressure windows.

Right now the AI is basically asking:
- do I need frontline?
- can I afford heavy?
- am I under target ranged ratio?

That produces legality and functionality, but not identity.

### Minimal fix

Give each race a composition doctrine table separate from difficulty:
- preferred early unit sequence,
- minimum frontline tolerance,
- ranged transition timing,
- heavy timing threshold,
- fallback rebalancing behavior after losses.

### Stronger fix

Make composition react to observed enemy composition and map style:
- narrow map favors sturdier frontline,
- open map allows more ranged share,
- enemy tower-heavy posture reduces low-frontline greed,
- repeated failed pushes trigger reweighting.

### Determinism risk

Low.
This is one of the safest high-value AI improvements.

### Expected gameplay payoff

High.
This is one of the fastest ways to make Human and Orc feel genuinely different.

---

## 4. Defense cluster

### Current heuristic

Current defense behavior is better than before.
There is now:
- local threat assessment near base,
- recent under-attack checks,
- severity estimation,
- defender recall,
- attack order if the threat is close enough,
- otherwise move to a defend point with spread goals.

### Why it still feels limited

Defense is still largely reactive and local.
It answers “there is danger near my base” but not deeper strategic questions like:
- should I fully abandon assault to preserve economy?
- should I hold closer to workers or closer to the Town Hall?
- should I defend differently depending on race?
- should I leave a reserve at home even while attacking?
- should I allow a small raid through and counter-push elsewhere?

Because of that, defense works as a patch, not as a coherent style.

### Minimal fix

Add persistent home-reserve logic:
- leave a minimum reserve based on threat level and race doctrine,
- do not fully commit the army unless the map state clearly allows it.

### Stronger fix

Add defense posture types:
- `line_hold`
- `worker_guard`
- `full_recall`
- `trade_and_counter`

Then bind race and difficulty biases onto those postures.

### Determinism risk

Low.

### Expected gameplay payoff

High.
This is one of the most visible places where the AI can stop feeling topорно.

---

## 5. Assault cluster

### Current heuristic

Assault is currently the biggest weakness.

The current decision chain is close to:
1. if a nearby enemy target exists, attack it
2. else if assault-retarget-to-contested-mine applies, move there
3. else if expansion-mine condition applies, move there
4. else move toward the enemy Town Hall

There is deterministic goal spreading to reduce local congestion.
That improves movement feel, but it does not deepen strategy.

### Why it creates wooden play

This is not a real battle plan.
It is a destination ladder with local reaction.

Missing layers include:
- staging before engagement,
- lane choice,
- commit versus disengage logic,
- regroup threshold,
- target-class prioritization by army role,
- harassment split,
- partial-force pressure,
- containment behavior,
- retreat after a bad trade,
- pressure persistence after winning contact,
- map-control hold behavior instead of permanent re-issue of travel intent.

This is the single biggest reason the AI looks linear.

### Minimal fix

Add assault postures above destination selection:
- `probe`
- `contest`
- `commit_push`
- `contain`
- `regroup`

Each posture can still reuse existing move/attack primitives.

### Stronger fix

Introduce squad-level assignment:
- frontline group,
- ranged follow band,
- home reserve,
- harassment subgroup on hard only.

Even a primitive version of this would radically improve perceived intelligence.

### Determinism risk

Medium.
Not because it is unsafe conceptually, but because assault touches the densest command traffic.
This area needs narrow passes, deterministic assignment rules, and incremental test coverage.

### Expected gameplay payoff

Very high.
This is the highest-value improvement area in the whole AI stack.

---

## 6. Mine targeting and map-pressure cluster

### Current heuristic

The AI already scores:
- contested mines,
- expansion mines,
- distance relationships to both Town Halls,
- reserve threshold,
- light center bias.

This is one of the better current systems because it at least points the AI toward map objectives.

### Why it still feels insufficient

The system picks destinations, but not strategic meaning.

It does not yet robustly ask:
- should I hold this mine or merely deny it?
- should I commit workers here or just pressure the area?
- should this mine matter more because of my race or current doctrine?
- should I stop fighting for center and take the safer macro line?

So map pressure exists, but not yet as a layered plan.

### Minimal fix

Differentiate mine intents:
- `deny`
- `take`
- `guard`
- `bait_fight`

### Stronger fix

Fold mine logic into a broader strategic evaluator with posture memory:
- “I failed to hold center twice, switch to safe expansion bias”
- “I won local fight, convert to take-and-guard”

### Determinism risk

Low to medium.

### Expected gameplay payoff

High, especially because LW2B already wants variety through map pressure and branching decisions.

---

## Why Human AI and Orc AI currently feel too similar

This is the most important design diagnosis.

## What differs today

Race differences already exist at the data layer:
- different workers,
- different soldier/ranged/heavy units,
- different tower stats,
- different upgrade ladders,
- different textual faction identities.

That matters mechanically.
But it does not yet strongly shape the AI’s strategic behavior.

## What does not differ enough today

The behavior layer does not meaningfully encode:
- race-specific economy posture,
- race-specific army doctrine,
- race-specific risk tolerance,
- race-specific push timing,
- race-specific defense preference,
- race-specific target priorities,
- race-specific regroup discipline.

So although Humans and Orcs have different bodies, they still share almost the same mind.

## What the race feel should probably be

### Human AI, target feel
- more disciplined and shape-conscious
- better at hold-and-advance patterns
- more willing to maintain a stable line
- more likely to defend economy cleanly before overcommitting
- prefers clearer ranged support windows
- slightly more conservative on bad engages

### Orc AI, target feel
- rougher and more tempo-driven
- more willing to commit local trades
- more eager to punish exposed workers / expansions
- stronger forward posture bias
- more likely to convert momentum into continued pressure
- slightly less patient in static hold patterns

Those distinctions do not require cheats.
They require doctrine-level behavior biases.

---

## Why difficulty currently changes strength more than personality

Current difficulty preset logic changes many useful parameters:
- decision delay,
- worker target,
- farm/tower caps,
- opening plan,
- ratios,
- doctrine choice,
- attack thresholds,
- recall radius,
- retarget behavior.

This gives a real strength curve.
That is good.

But most of those values are scalar tunings, not different play identities.

## Current likely feel by difficulty

### Easy
- slower,
- more passive,
- less committed,
- less optimized.

### Medium
- standard baseline pacing.

### Hard
- denser,
- faster-reacting,
- fuller tech use,
- stronger pressure timing.

This is valid as a baseline ladder.
But it is not yet a memorable personality ladder.

## Better difficulty identity target

### Easy
- readable,
- territorial,
- defensive,
- less exploitative,
- should still look intentional rather than simply weaker.

### Medium
- balanced,
- does one coherent plan at a time,
- fewer unnecessary overcommits,
- good baseline opponent.

### Hard
- not merely faster,
- more opportunistic,
- better at converting map events into plan changes,
- capable of limited split intent,
- more punishing against greed and exposed macro.

---

## Root-cause analysis of “wooden” unit control

Player-facing “woodenness” comes from multiple layers interacting.

## 1. Army is mostly treated as one mass

Composition exists, but role separation is minimal.
This causes:
- clump movement,
- blunt contact behavior,
- weak frontline/backline distinction,
- crude reinforcement flow.

## 2. Destination logic is stronger than tactical logic

The AI knows where it wants to go more than how it wants to fight there.
That is why it can reach places but still feel topорно in combat presence.

## 3. There is little regrouping intelligence

The AI does not sufficiently express:
- “this push lost coherence”
- “reform before re-engaging”
- “do not keep refeeding into bad contact”

## 4. There is little partial commitment behavior

Many good RTS-feeling moments come from:
- some units hold,
- some units pressure,
- some units cover eco,
- some units chase a local opportunity.

Current AI mostly lacks this layered distribution.

## 5. The AI lacks match memory

It does not carry enough remembered intent such as:
- previous failed lane,
- previous successful local trade,
- current containment posture,
- recent mine denial outcome.

Without this, each decision feels stateless.
Stateless AI often feels wooden even when technically competent.

---

## Prioritized improvement roadmap

## Priority 1, highest value: add intent layer above the current phase machine

Add a lightweight strategic-intent layer while preserving the current core phases.

Recommended intent set:
- `stabilize`
- `fortify`
- `contest`
- `expand`
- `pressure`
- `commit_push`
- `regroup`
- `contain`

Important note:
this should sit above current `economy/military/assault`, not replace the sim architecture.

### Why this is priority 1

Because it attacks the deepest problem directly:
there is currently too little actual strategic branching.

### Risk

Medium, but manageable if done in narrow passes.

---

## Priority 2, very high value: race-specific doctrine behavior

Create a doctrine layer that makes Human and Orc AI behave differently even with the same difficulty.

Possible race doctrine fields:
- economic risk tolerance,
- reserve preference,
- push patience,
- ranged preservation bias,
- tower bias,
- expansion greed,
- preferred pressure window,
- regroup threshold.

### Why this is priority 2

Because right now race asymmetry is under-realized at the behavior layer.
This is the cleanest path to “Human AI vs Orc AI feels different”.

### Risk

Low.
This is one of the safest high-value additions.

---

## Priority 3, very high value: assault postures and regroup logic

Current assault should be expanded into a posture system.

Recommended additions:
- probe before full commit,
- retreat-to-rally or retreat-to-midpoint when trades go bad,
- hold pressure zone after winning local control,
- stop re-issuing pure march intent when no good fight exists,
- preserve some unit coherence before re-entering contact.

### Why this is priority 3

Because current combat/pressure behavior is the most visible source of linearity.

### Risk

Medium.
Requires narrow testing because command traffic is dense here.

---

## Priority 4, high value: squad/role decomposition

Do not jump directly to a full formation system.
Start with cheap role separation:
- frontline anchor group,
- ranged follow group,
- home reserve,
- optional harassment subgroup on hard.

### Why this matters

This directly addresses topорное mass-control behavior without requiring deep engine rewrite.

### Risk

Medium.
Worth doing after posture work begins.

---

## Priority 5, high value: posture-aware economy and tower play

Fold economy and placement into intent/doctrine.

Examples:
- fortify posture builds towers earlier,
- greed posture floats lower reserve for faster expansion window,
- Human fortify differs from Orc fortify,
- worker wood assignment shifts by doctrine.

### Risk

Low.

---

## Priority 6, medium value: opponent-model light

Do not build a giant analysis system.
Just add a small synced summary of the opponent state:
- estimated nearby army,
- enemy expansion presence,
- recent pressure near home,
- enemy tower density at target zone,
- relative army posture locally.

### Why it matters

This is enough to let the AI adapt without becoming a heavy rewrite.

### Risk

Low to medium.

---

## Low-risk / medium-risk / high-risk change classification

## Low-risk, high payoff
- race-specific composition doctrine
- race-specific reserve and defense bias
- posture-aware worker/wood allocation
- tower scoring improvements
- mine intent differentiation
- simple opponent summary metrics

## Medium-risk, very high payoff
- strategic intent layer
- assault posture expansion
- regroup logic
- squad/role decomposition
- pressure persistence / containment behavior

## High-risk, avoid bundling early
- full formation simulation
- deep low-level movement rewrite bundled with AI work
- broad combat-targeting overhaul plus posture plus pathfinding in one pass
- giant adaptive planner or utility-AI rewrite

Recommendation:
Do not chase a grand AI rewrite.
Do layered upgrades on top of the current deterministic architecture.

---

## Proposed implementation order

## Phase A, safest meaningful behavior pass
- add race doctrine tables
- add difficulty personality tables separate from scalar thresholds
- bind those tables into composition, reserve behavior, and economy posture

## Phase B, strategic depth pass
- add strategic intent state
- add intent transitions from synced map state
- keep existing economy/military/assault phases but modulate them through intent

## Phase C, combat-feel pass
- add assault postures and regroup logic
- add minimal squad role split
- keep deterministic assignment and stable tie-breaks

## Phase D, map-pressure pass
- upgrade mine logic from “best destination” into “mine intent”
- make contest / take / deny / guard decisions explicit

---

## Suggested target feel matrix

This is a design target, not a claim about current implementation.

### Human Easy
- defensive, readable, stable
- protects home well
- pushes late and modestly

### Human Medium
- disciplined baseline opponent
- cleaner line behavior
- balanced expansion and defense

### Human Hard
- strong formation-minded pressure
- better ranged preservation
- patient, punishing, controlled

### Orc Easy
- territorial bruiser, but still understandable
- rough local defense
- occasional pressure without deep follow-through

### Orc Medium
- proactive tempo opponent
- stronger local commitment than Human Medium
- more expansion punishment

### Orc Hard
- opportunistic shock-pressure opponent
- converts local wins into continued map pressure
- punishes greed aggressively

Current code does not yet realize this matrix strongly enough.

---

## Final conclusion

The current AI has a solid deterministic support foundation.
It already handles economy basics, race-aware unit resolution, base defense recall, map-objective targeting, and simulation-mode compatibility.

But the current opponent AI is still too close to a threshold-scripted controller.
That is why it feels wooden.

The most important next step is not more scalar tuning.
It is adding a lightweight behavior layer that introduces:
- strategic intent,
- race doctrine,
- better assault postures,
- limited role separation,
- and some short memory of recent match outcomes.

If those layers are added incrementally, LW2B can get a much more varied and expressive AI without violating determinism discipline or requiring a dangerous engine rewrite.

---

## Recommended next actionable document

Best follow-up doc after this audit:

`LW2B_AI_IMPLEMENTATION_PLAN_2026-04-25.md`

Recommended scope for that implementation plan:
- exact new controller fields,
- doctrine table schema,
- strategic intent transition rules,
- first-pass squad-role split,
- tests to add,
- pass order for safe incremental implementation.
