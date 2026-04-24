# Opening Branch Research and Implementation Plan

Date: 2026-04-18
Project: LittleWarCraft2but
Status: handoff document for next `/new` session

## Purpose

This document captures the current strategic analysis for the next meaningful gameplay push.
It is meant to let a fresh session continue implementation immediately, without re-deriving the design logic.

Primary goal:
- increase **human-first gameplay variety**
- increase **replayability through real opening branches**
- create **stronger early-game identity** without scope explosion

This is not a network plan and not an AI-first plan.

---

## Current project state

Already completed in recent cycles:
- gameplay/UI first pass
- multiplayer determinism blocker fix
- stable multi-id ordering
- deterministic move spread generator
- stuck/repath refinement
- opening branches pass (light)
- harassment-lite pass
- composition depth pass
- map-pressure-lite pass
- local command rejection feedback for move failures
- build green after recent passes
- README.md and ROADMAP.md already reframed around human-first gameplay variety

Important current frame:
- **human-first gameplay**
- main priority: **variety, interesting actions, replayability**
- variety should come mainly from:
  - branching gameplay decisions
  - action diversity
  - composition depth
  - map pressure / expansion gameplay
- AI is support, not roadmap center

Out of scope for now:
- rollback
- reconciliation
- adaptive delay rewrite
- larger network architecture work

Important process rule:
If a pass touches determinism-sensitive areas (apply order, pathfinding, spread, repath, online sim), then:
1. build
2. targeted review in `codex_alt`
3. resolve review findings

For pure UI/local render passes, targeted review is optional.

---

## Honest assessment of recent passes

### What delivered high value

#### 1. Safety / determinism fixes
These delivered the strongest immediate value because they removed actual risk and fragility.
Without this, further gameplay work would sit on shakier ground.

#### 2. Composition pass
This was useful because it pushed units toward clearer roles:
- melee more clearly frontline
- ranged more clearly backline pressure
- mixed army gained meaning

This improved strategic readability and slightly improved army identity.

### What delivered medium or support value

#### 3. Map-pressure-lite and UI/readability passes
These were directionally correct, but mostly a support layer.
They help players understand the map and decisions better, but they do not by themselves create a large gameplay leap.

Conclusion:
- these passes were useful
- but further ROI from more support-layer-only passes will diminish
- the next clearly stronger gain should come from **real opening structure**, not more hints alone

---

## Main design conclusion

## The next best pass is:
# **Opening branch pass with real tradeoffs**

Not just clarity.
Not just labels.
A small but real gameplay-shaping pass that gives the first minutes of a match multiple valid plans.

This is the best next move because early game structure determines:
- match identity
- tempo windows
- which unit mixes appear
- whether map pressure matters early or only later
- how replayable matches feel across repeated runs

If the opening is too linear, later variety is partially constrained even if the rest of the systems are decent.

---

## Design target

The game should offer **three readable early plans** with real opportunity cost.

## Branch A. Eco opener
Intent:
- faster worker saturation
- safer growth
- weaker early map control and weaker early army timing

What it should feel like:
- "I want a stronger economy and a later, more solid game"

What it should reward:
- cleaner income ramp
- stronger follow-up production
- better recovery if not punished

What it should risk:
- can lose map initiative
- vulnerable to earlier pressure
- may concede contested mine timing

## Branch B. Tempo opener
Intent:
- earlier barracks / earlier frontline unit timing
- stronger immediate field presence
- weaker economy curve

What it should feel like:
- "I want to own the first pressure window"

What it should reward:
- initiative
- ability to secure space, deny greed, or force reactions
- stronger early control over neutral ground

What it should risk:
- lower income if pressure does not convert
- weaker scaling if overcommitted

## Branch C. Pressure opener
Intent:
- slightly more committed pressure identity
- earlier ranged access / forward rally / mine contest setup
- less stable if the opponent stabilizes

What it should feel like:
- "I want to create a sharp tactical problem early"

What it should reward:
- stronger harassment or route pressure potential
- contested mine interaction becomes relevant earlier
- creates more tactical stories per match

What it should risk:
- fragile if mispositioned
- easier to punish if overextended
- may underperform if map pressure tools are used poorly

---

## What makes this pass valuable

This pass should improve:

### 1. Variety
Because players can choose different starts with different priorities instead of drifting into one default opener.

### 2. Replayability
Because the same matchup can branch differently depending on the chosen plan and reaction.

### 3. Interesting decisions
Because spending gold early should feel like choosing a trajectory, not merely executing the only obvious line.

### 4. Match identity
Because a match should start to "declare what kind of game it is" in the first minutes.

### 5. Pressure and counterplay structure
Because greed vs tempo vs pressure creates early punish windows and reaction windows.

---

## Important design constraint

This should remain a **small vertical pass**.
Do not add a giant new tech tree.
Do not add many new units.
Do not create a new heavy economy system.

The pass should come from:
- better opening actions
- better cost / timing expression
- better rally / production framing
- small systemic support for distinct starts

The right question is:
> What is the minimum systemic change that makes opening choices actually different?

---

## Recommended implementation direction

# Phase 1. Opening branch clarity and commitment framing
Goal:
make the available early plans explicit and usable through existing UI/actions.

### Candidate changes

#### 1. Town Hall branch buttons
Current town hall already has worker training plus an extra eco-style suggestion.
Expand this into clearer branch framing.

Possible buttons:
- `Eco branch\ntrain worker`
- `Tempo branch\nsave for barracks`
- `Pressure branch\nset forward rally`

Important note:
These should not all be fake flavor buttons.
At least some need to be backed by real state consequences or immediate support behavior.

#### 2. Barracks branch framing
Current barracks branch buttons already look at composition.
Extend that to early timing intent.

Possible phrasing:
- `Tempo branch\nfrontline now`
- `Pressure branch\nranged timing`
- maybe later `Hold ground\ndefensive mass`

#### 3. Rally guidance as branch support
The recent rally hints can support openings.
Push that a bit further:
- safe rally = macro / eco branch support
- forward rally = tempo branch support
- deep rally = pressure commit support

This is still support-layer work, but useful if combined with actual branch mechanics.

---

# Phase 2. Small real mechanics behind the branches
Goal:
make the opening choices materially different, not just better labeled.

## Strong recommendation:
use **small economic / timing / queue tradeoffs**, not new core systems.

### Option set A, recommended

#### A1. Worker-first eco support
Make the eco branch feel real by helping it commit to economy.
Possible minimal implementations:
- stronger UI recommendation when worker count is low and map pressure is not yet established
- maybe slight queue convenience / clarity improvements around worker production
- maybe a safer default rally recommendation near home economy

This alone is not enough, but it supports the branch.

#### A2. Earlier barracks timing branch support
Make the tempo branch feel real by making "save for barracks, hit early field presence" a readable and rewarded plan.
Possible support:
- stronger barracks timing prompts when worker count/gold line suggests tempo window
- barracks rally and first-unit framing aimed at immediate contest
- no stat rewrite needed yet

#### A3. Early ranged pressure branch support
This is the most delicate branch because it can collapse into either gimmick or dominant line.
Keep it light.
Possible support:
- stronger UI framing when ranged timing is plausible
- encourage forward rally + contested route usage
- do not overbuff ranged again here unless testing clearly shows the branch lacks teeth

### Important note
Do not immediately solve this with raw stat changes.
Stat changes are useful, but they can easily compress tempo too much, which was already a known caution from previous sanity review.

---

# Phase 3. One small systemic hook to make openings diverge more
This is the actual gameplay-shaping piece.

Recommended direction:
## **Branch-sensitive opening recommendations tied to real game state**

Meaning:
- not static buttons
- contextual branch prompts driven by:
  - worker count
  - current gold
  - whether barracks exists
  - current army count
  - map pressure location / rally state

This can produce a stronger feeling that the game "recognizes" distinct plans.

Examples:
- if no barracks, enough gold soon, and worker count is already decent → suggest `Tempo branch`
- if worker count is low and map is quiet → suggest `Eco branch`
- if barracks exists and ranged timing plus forward rally makes sense → suggest `Pressure branch`

This is still not a giant system, but it helps convert abstract strategy into usable action.

---

## Best minimal first implementation

If only one small pass is done next, it should be:

# **Opening branch pass v1**

### Scope
- improve Town Hall and Barracks branch prompts so they represent distinct early plans
- use current game state to decide which branch labels/prompts appear
- tie rally suggestions more clearly to branch identity
- avoid heavy balance rewrites in the first pass
- keep AI unchanged unless a tiny support tweak is trivial

### Why this first
Because it is the best ROI step between:
- pure cosmetic clarity, and
- risky balance/system changes

It is a good bridge pass that prepares later deeper opening mechanics.

---

## Candidate v1 implementation tasks

### Task 1. Town Hall opening prompts
Files likely involved:
- `src/render/ui.ts`

Add logic that evaluates opening state:
- current worker count
- current gold
- whether barracks exists
- current pop pressure
- maybe map proximity context if simple

Then present clearer opening prompts such as:
- `Eco branch\nworker saturation`
- `Tempo branch\nprep barracks timing`
- `Pressure branch\nforward rally setup`

### Task 2. Better branch-state descriptions in selection panel
Files likely involved:
- `src/render/ui.ts`

When Town Hall or Barracks is selected, add short contextual copy like:
- `Economy opening: safer growth, weaker early map`
- `Tempo opening: earlier army, slower income`
- `Pressure opening: contest route/mine, commit carefully`

This helps teach the branch consequences.

### Task 3. Link rally meaning more explicitly to opening plans
Files likely involved:
- `src/render/ui.ts`

The recent rally hints are a good base.
Extend them so rally becomes part of opening intent.
Example:
- near home: `Macro rally for safer reinforcement flow`
- mid-map: `Tempo rally for fast contest`
- forward/deep: `Pressure rally, risky if map control is weak`

### Task 4. Optional tiny AI support, only if trivial
Files likely involved:
- `src/sim/ai.ts`

Only if this is tiny and safe:
- allow AI to more consistently pick one early identity (eco-leaning or tempo-leaning)
- but this is optional and should not distract from the human-first pass

---

## Candidate v2 follow-up after that

If v1 lands cleanly and feels good, the next follow-up can add a small real mechanics edge.

Possible v2 directions:

### v2-A. Barracks timing tradeoff support
- slight early-game cost/timing adjustments that increase divergence between worker-first and barracks-first plans
- caution: easy to overtune tempo

### v2-B. Forward-rally pressure support
- strengthen the usefulness of setting aggressive rally points for pressure plans
- maybe better unit flow/readability for reinforcements

### v2-C. Contested mine opening interaction
- make early pressure plans and greedy plans collide more often around a resource point
- this is strong ROI if done carefully

---

## Risks and cautions

### 1. Cosmetic-only trap
Biggest risk:
- adding more labels and hints without making openings actually feel different

Avoid this by ensuring prompts are at least state-sensitive and shape player action.

### 2. Tempo overcompression
Previous sanity review already suggested economy/tempo might be getting too fast.
So avoid large stat pushes or large production-speed pushes in the next pass unless clearly justified.

### 3. Scope explosion
Do not try to simultaneously add:
- expansions as full new system
- many new counters
- deep AI changes
- new tech tree layers

Keep the pass narrow.

### 4. Network sensitivity creep
If implementation drifts into command semantics, production logic, or online-sim-sensitive mechanics, follow the full discipline:
- build
- targeted review

---

## Success criteria for the next pass

A good opening branch pass should make these statements more true:
- the first 2-4 minutes offer multiple plausible plans
- spending early gold feels like choosing a trajectory
- rally choice and first production choices communicate intent
- matches start to diverge earlier
- the player can understand why one opening is safer, greedier, or more aggressive

If after the pass the game only has nicer words but still one dominant obvious early line, the pass is incomplete.

---

## Recommended next implementation order

### Immediate next pass
1. Opening branch state evaluation in UI
2. Town Hall prompts for eco / tempo / pressure
3. Barracks prompts strengthened around opening identity
4. Selection-panel text that explains tradeoffs
5. build

### After that
6. playtest / inspect whether openings actually feel different
7. if not enough, add one small mechanics hook
8. only then consider balance nudges

---

## Suggested concrete next-session prompt

Use something close to this in `/new`:

```text
Продолжаем LittleWarCraft2but.

Текущий статус:
- gameplay/UI first pass сделан
- determinism blocker найден и исправлен
- stable multi-id ordering сделан
- deterministic move spread generator сделан
- stuck/repath refinement сделан
- opening branches / harassment-lite / composition depth / map-pressure-lite pass-ы сделаны
- group move safety issue near edges/chokes закрыт
- local move reject feedback сделан
- build green
- README.md и ROADMAP.md уже обновлены

Главная рамка:
- human-first gameplay
- основной приоритет: variety, interesting actions, replayability
- variety должно идти через branching gameplay decisions, action diversity, composition depth, map pressure
- AI только support layer
- не уходить в network rewrite

Новый приоритетный design task:
- сделать Opening Branch Pass v1
- цель: первые минуты матча должны яснее ветвиться в eco / tempo / pressure планы с реальными tradeoff’ами
- сначала проанализируй `OPENING_BRANCH_RESEARCH_2026-04-18.md`
- затем реализуй маленький vertical pass с лучшим ROI без scope explosion
- если правка залезет в determinism-sensitive логику, после этого: build + targeted review в codex_alt
```

---

## Short verdict

The project is now at the point where another small support-layer pass is not the best use of momentum.
The best next gain should come from making the opening itself branch more clearly into distinct plans.
That is the next most leverage-heavy change for gameplay variety.
