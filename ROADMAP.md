# ROADMAP

This file is meant to be a living project map for future coding sessions.
Update it when a phase is completed, reframed, or split.

## Snapshot

Fast orientation: `docs/LW2B_CURRENT_STATE.md`

### Done recently
- gameplay/UI first pass
- forest harvesting pass completed:
  - each forest tile now stores `100 wood`
  - each worker trip takes `10 wood`
  - depleted forest converts into passable grass
  - workers can right-click forest and automatically return wood to base
- wood economy pass completed:
  - wood is now a real player resource alongside gold
  - HUD / UI / build costs / train costs / refunds now account for wood
  - AI now respects wood-gated costs too
- lumber mill tech pass v1 completed:
  - new `lumbermill` building added
  - `tower` now requires lumber mill tech
  - first-pass global upgrades added: `meleeAttack1`, `armor1`, `buildingHp1`
  - upgrades now run as timed research (`15s` each), not instant apply
- local command feedback markers
- online status strip
- `statusMsg` surfaced in online UI
- deterministic online apply order by owner (`0` then `1`)
- stable multi-id apply ordering for:
  - `move`
  - `attack`
  - `gather`
  - `stop`
- fixed spread table replaced with deterministic ring generator
- ring generator asymmetry fix applied
- blocked-step sidestep added for movement
- after sidestep, move path is rebuilt from current position to keep path and position coherent
- `repathCount` no longer burns on successful sidestep progress
- opening branch pass v1 added explicit eco / tempo / pressure framing in UI and opening intent state
- online lockstep hardened against duplicate per-tick packet replay and disconnect stalls
- opening branch pass v2 added a small contested-mine pressure hook for early-game clashes
- movement feel / interpolation pass corrected to use real step progress instead of one-tick smoothing
- movement rendering unified across real path-following states:
  - `move`
  - `attackMove` / pressure forward-commit movement
  - `gather: tomine`
  - `gather: returning`
  - `attack` chase
  - `build` move-to-site
- chase timing split so repath cadence and per-step visual cadence are no longer coupled
- balance foundation pass completed:
  - `src/balance/schema.ts`
  - `src/balance/base.ts`
  - `src/balance/races.ts`
  - `src/balance/resolver.ts`
  - `src/balance/openings.ts`
  - `src/balance/modifiers.ts`
  - `src/balance/report.ts`
- main stat read-paths migrated to the balance layer
- human wall override moved out of ad-hoc sim logic into balance resolution
- `npm run balance:report` added for quick matchup snapshots
- `src/balance/tuning.ts` added as a quick manual override layer for live balance tests
- performance hardening pass set 1 completed:
  - static blocked occupancy grid for non-unit blockers
  - deterministic A* heap
  - move/repath dedupe and cooldown
  - cheaper move-goal candidate selection with reused chosen path
  - streamlined deterministic target-acquisition scans for auto-attack / attack-move
- feedback / clarity micro-pass completed:
  - production panel for Town Hall / Barracks now clearly shows current unit, progress, percent, queue slots, and idle state
  - lightweight on-field attack and hit flashes added for melee and ranged combat readability
  - archer / troll ranged attacks now render simple readability-first projectile cues
- dedicated map-balance correction pass completed:
  - fixed unreachable contested mines on River Crossing
  - cleared blocked start macro pockets on Open Steppe and Timber Lanes
  - moved Stone Fords watch posts closer to the actual contest line
  - added richer reserves to center / farther mines across the map pool
- attack reissue exploit fix completed:
  - repeated attack reissue/right-click spam no longer resets attack cooldown
  - attack reissue now preserves current cooldown timing
- narrow adjacent input-spam audit completed:
  - no confirmed same-class exploit found in `stop`, `move`, `gather`, `build`, or resume-style command reissue paths

### Verified
- build green after each recent pass
- targeted review confirmed the main determinism blocker was removed
- targeted review confirmed multi-id ordering cleanup is clean
- targeted review found and helped close the ring asymmetry issue
- targeted review found and helped close the stale-path-after-sidestep issue
- live `SERVER` mode test after the April 2026 desync fixes stayed synchronized through tower builds in a Serbia <-> Russia run
- lightweight online desync diagnostics are now available for future live repros
- focused anti-desync pass completed:
  - mutation-safe, order-stable per-tick entity command processing
  - deterministic tie-break tightening in key nearest/selection paths
  - targeted determinism regression tests added
- network audit reports are now checked into repo root:
  - `NETWORK_AUDIT_2026-04-21.md`
  - `NETWORK_MECHANICS_AUDIT_2026-04-21.md`

### Known remaining caution
- blocked-step sidestep still depends on same-tick entity processing order
- if entity iteration ever diverges between peers, that area becomes more sensitive
- this is not the next small polish item, it is a broader sim-order discipline topic
- do not introduce dynamic unit occupancy as a live mutable grid in-path yet; if needed later, use snapshot/fixed-phase discipline
- keep all perf throttling tick-based only, never wall-clock/runtime-budget based
- any heap/path selection changes must keep deterministic tie-break rules explicit
- neutral ownership exists in the data model, passes 1-2 are now done in the highest-risk AI/UI/economy/modifier paths, but semantic cleanup is still incomplete elsewhere
- pass 2 intentionally did not touch renderer/game/net or presentation-only enemy labeling, to avoid mixing semantic cleanup with broader refactor scope
- avoid accumulating too many authored opening/combat bonus rules before combined live tests prove they are worth the complexity

## Strategic priority

Core design priority is now:
- human gameplay first
- decision variety first
- interesting actions first
- gameplay and faction feel changes before more infra work
- AI as support, not as the main source of depth

Guiding principle:

> Variety, interest, and replayability should come primarily from player choices, timing branches, map pressure, composition decisions, and action diversity, not from AI behavior.

In practice, this means the project should optimize for:
- different viable openings
- different midgame plans
- different tactical actions within the same match
- different risk / reward lines
- different army identities and map interactions

The game should become more replayable because players can do different meaningful things, not because the AI becomes more elaborate.

## Review rule

If a pass touches any of these:
- multiplayer determinism
- multi-id commands
- apply order
- pathfinding / repath / spread
- online movement simulation

then after the pass:
1. run build
2. run targeted review
3. resolve small review findings immediately if possible
4. do not leave that review run hanging around

If a pass is only UI/local render, targeted review is not required every time.

## Next passes

Immediate project note:
- map-balance correction pass v1 is now done
- wood / lumber-mill economy pass is now in and needs explicit gameplay verification
- lumber-mill upgrades now have a fixed `15s` research window and should be validated as timed, deterministic state transitions
- next useful step is live validation, not another blind architecture pass
- neutral-ownership semantic cleanup pass 1 is now done:
  - semantic ownership helpers added
  - highest-risk AI/UI/economy opposing-player shortcuts replaced
  - neutral no longer leaks into the main enemy-player lookup paths in those files
- neutral-ownership semantic cleanup pass 2 is now done:
  - `src/balance/modifiers.ts` contested-mine logic now uses explicit opposing-player Town Hall resolution
  - neutral is excluded from that modifier path instead of being treated as generic non-self ownership
  - the diff stayed intentionally narrow and reviewable
- remaining cleanup should now be kept as **one more small `/new` pass**, not widened into a broad refactor:
  - pass 3: `src/render/renderer.ts`, `src/game.ts`, `src/net/netcmd.ts` sanity sweep and leftover shortcut cleanup
- if more map work is needed later, keep it point-fix only and driven by concrete spawn-side findings

Infrastructure note:
- the balance foundation is now good enough
- a simple manual tuning layer now exists in `src/balance/tuning.ts` for fast live-test balance edits
- the recent `SERVER` mode desync chain was fixed in `src/net/session.ts`; keep future netcode edits narrow and reviewable
- lightweight desync diagnostics now exist in `src/net/session.ts`, `src/game.ts`, and `src/render/ui.ts` for live comparison
- avoid deeper balance-system plumbing unless a concrete gameplay iteration need appears
- next sessions should primarily spend energy on gameplay changes, playtests, faction identity tuning, and now map fairness tuning

Performance note:
- immediate next perf target remains `combat.ts` LOS checks via blocker/grid lookup
- but this is no longer the next `/new` priority unless map work is blocked
- after LOS pass, likely order is:
  1. allocation churn reduction (`shift`, repeated arrays/maps/strings in hot paths)
  2. only then reconsider spatial buckets if profiling still points there

## Immediate verification pass: forest + lumber mill

Goal:
- verify that the newly added wood loop is mechanically correct, readable, and not silently broken

Checklist:
- forest starts at `100 wood` per tile
- worker takes `10 wood` per gather cycle
- worker returns wood to Town Hall / Great Hall automatically
- player wood increases only on return
- depleted forest becomes passable grass
- cleared tile updates pathing correctly
- lumber mill can be built normally
- tower is properly gated behind lumber mill
- lumber mill upgrades spend resources correctly and cannot be bought twice
- each lumber mill upgrade has a visible `15s` research phase before effects apply
- `Melee +1` affects melee combat correctly
- `Armor +1` affects military armor correctly
- `Building HP +15%` affects existing and future player buildings correctly

Determinism follow-up for future `/new`:
- before changing command-processing order, run the determinism regression tests first as a baseline
- after changes, rerun and compare; do not merge order/selection changes without deterministic pass confirmation

If any issue appears, prefer narrow mechanical fixes over more feature expansion.

## Phase C. Branching gameplay decisions
Goal: make early and midgame branch into distinct player plans.

Current branch status:
- v1 established eco / tempo / pressure framing and opening intent support
- v2 added a small mechanical payoff around contested mines during the early opening window
- opening and combat logic now live in dedicated balance modules, so next step should be playtest-guided gameplay tuning, not another support-layer pass
- opening branch pass v3 added human-first branch differentiation:
  - eco now has a Human home-defense damage window after commitment
  - tempo now has a Human contested-mine timing damage window after commitment
  - pressure remains the forward-commit branch

Focus ideas:
- economy vs army timing
- one-base pressure vs greed
- defend now vs expand now
- basic unit mix decisions instead of one obvious mass strategy
- incentives for committing early tempo or delayed power
- make contested resource interaction produce real opening divergence, not just extra text
- prefer divergence through map incentives, timing, production shape, and opportunity cost before adding more narrow combat bonus windows

Definition of done:
- first minutes of a match allow multiple plausible plans
- matches no longer collapse into one default build and one default push timing
- players can choose between safer and greedier lines with real consequences
- eco / tempo / pressure produce visibly different early map behavior in actual playtests

Suggested commit themes:
- `design: add stronger early-game branching and timing choices`
- `gameplay: introduce pressure-vs-greed decision points`

## Phase D. Interesting action layer
Goal: increase the number of meaningful things a player can actively do during a match.

Focus ideas:
- worker harassment opportunities
- expansion denial
- map poking and scouting pressure
- choke hold / choke break interactions
- commit vs fake pressure possibilities
- split pressure or reinforcement disruption if the current systems can support it simply

Definition of done:
- players can create advantage through action variety, not only by amassing units
- there are multiple active ways to interact with the opponent besides one frontal push
- matches generate more tactical stories and swings

Suggested commit themes:
- `gameplay: add harassment and map-pressure action hooks`
- `design: widen tactical action variety`

## Phase E. Army composition depth
Goal: make army composition itself a meaningful decision.

Focus ideas:
- clearer frontline / support roles
- stronger reasons to mix unit types
- anti-greed or anti-structure pressure options
- simple, readable counter-shaping without bloated complexity

Definition of done:
- army composition communicates a plan
- choosing what to train feels strategic, not automatic
- different compositions imply different strengths, weaknesses, and actions

Suggested commit themes:
- `design: strengthen army roles and composition choices`
- `balance: make core unit roles more expressive`

## Phase F. Map pressure and expansion gameplay
Goal: make the map itself generate decisions and conflict.

Status:
- prerequisite fairness pass on the existing map pool is done
- current need is live validation plus any small follow-up corrections that show up in matches

Immediate map-balance checklist:
- validate that each start can macro/build cleanly in real play
- validate that contested mines are now worth fighting over instead of being dead map objects
- validate that center-rich mines create better expansion tension without forced snowball
- validate watch-post leverage, blockers, and rich-center objectives as a combined system rather than independent features
- watch for stacked positional advantage where early center hold also gives the cleanest mine access and safest route leverage

Focus ideas:
- contested resource points
- risky expansions
- valuable choke zones
- routes for raid / harass / flank pressure
- map positions worth taking, denying, or defending

Definition of done:
- players move because the map creates incentives, not only because it is time to attack
- map control becomes a meaningful concept
- expansions create new timing windows, defensive dilemmas, and comeback opportunities
- the current map pool no longer gives obvious side-based unfair advantage

Suggested commit themes:
- `design: add contested expansion and map-pressure incentives`
- `maps: create stronger positional stakes`
- `maps: rebalance current ladder pool for fair starts and routes`

## Phase G. Feedback / clarity pass
Goal: make the richer game easier to read at a glance and reduce silent failure.

Status:
- first readability micro-pass is done for production visibility and combat readability
- next follow-up here should come from fresh playtest notes, not speculative UI expansion

Focus ideas:
- failed action feedback:
  - not enough gold
  - food full
  - queue full
  - invalid placement
- clearer production/build state
- stronger population cap signal
- cleaner rally point information
- UI support for any new branching or action systems added earlier

Definition of done:
- less silent failure
- production state becomes quickly readable
- players can tell why an action failed without guessing
- new gameplay decisions are communicated clearly enough to use well

Suggested commit theme:
- `ui: surface failed actions and clearer production feedback`

## Phase G2. Movement feel and render readability
Goal: make unit motion feel legible and alive without changing sim rules or abandoning the current pixel/retro style.

Status:
- main interpolation foundation is now in place and works across the major movement states
- plain move is confirmed improved in live check
- remaining follow-up here should come from concrete playtest findings, not another speculative motion pass

Why this matters:
- current tile-to-tile motion reads as jumps, not travel
- the main visual debt is temporal readability, not art direction
- strongest gains should come from render-only work, not sim/network rewrites

Guiding rule:
- keep all motion-feel work render-only unless a concrete gameplay reason proves otherwise
- do not move prev/render positions into synced sim state
- do not couple visual smoothing to wall-clock-dependent gameplay logic

Short plan:
1. render interpolation foundation
   - compute `alpha` from `simAccum / SIM_TICK_MS` in `src/game.ts`
   - pass `alpha` into `src/render/renderer.ts`
   - keep a client-only render cache for `prevPos/currPos/facing/bobPhase`
   - draw entities at interpolated positions instead of raw tile snaps
2. motion readability pass
   - add tiny walk bob for moving units
   - add facing/directional readability from move direction
   - keep offsets small and pixel-clean, no jelly motion
3. step FX / local polish
   - add tiny step dust / landing puff as local visual effects only
   - cap particle count and avoid visual noise

Files to start with:
- `src/game.ts`
- `src/render/renderer.ts`
- optional later split: `src/render/interpolation.ts`, `src/render/fx.ts`

What not to do first:
- no 8-direction sprite-sheet project
- no heavy particles, blur, glow, or modern smooth FX
- no sim/net changes just to improve motion feel

Expected delivery order:
- PR1: interpolation foundation, lowest risk, biggest immediate gain
- PR2: walk bob + facing, low-to-medium risk, strong readability gain
- PR3: step dust + polish, medium risk, easy to overtune

Definition of done:
- movement no longer reads as raw tile teleporting
- players can parse direction and motion intent faster
- the game feels more alive while keeping the same retro/pixel identity
- no new determinism surface is introduced
- all command-driven path-following branches use the same visual movement model unless a concrete exception is justified

## Phase H. AI support pass
Goal: let AI participate in the improved game without pretending AI is the main source of variety.

Status:
- baseline fairness pass done:
  - removed offline extra-worker cheat
  - removed early opening insta-lock advantage
  - reduced production / worker-pull abuse patterns
- difficulty split pass done:
  - easy now leans softer macro / slower pressure
  - medium now plays the most even tempo-pressure baseline
  - hard now leans faster map-control pressure without hidden stat/resource cheats

Focus ideas:
- basic reaction to greed, pressure, and harassment
- use expansions or defend them at a simple level
- avoid obviously broken production loops
- support solo testing of the now-richer match structure
- keep difficulty differences primarily in behavior feel, not invisible bonuses

Definition of done:
- AI can exercise the main systems well enough for practice and solo play
- AI does not need to be brilliant, it just should not collapse the intended gameplay shape
- easy / medium / hard feel meaningfully different in live playtests
- stronger difficulties should feel tougher mostly through timing, routing, and commitment choices, not cheating

Suggested commit theme:
- `ai: support branching gameplay and map pressure basics`

## Later, only if still needed
This is intentionally postponed until gameplay depth and match variety are stronger.

Possible topics:
- adaptive delay light
- telemetry polish
- desync warning hashes
- stronger sim-order discipline if future reviews justify it

Not before:
- movement feel is clearly improved
- decision variety is visibly stronger
- action diversity is present in real matches
- gameplay/UI passes have delivered visible value

## Suggested sequencing for future sessions
1. map-balance pass on the current pool
2. direct gameplay/balance tuning from playtest evidence
3. branching gameplay decisions
4. interesting action layer
5. army composition depth
6. map pressure and expansion gameplay
7. feedback / clarity pass
8. AI support pass
9. only then revisit deeper network work or more balance tooling if a concrete problem remains

## Recent commit themes
- `net: normalize multi-unit command ordering for determinism safety`
- `net: replace fixed move spread table with deterministic ring generator`
- `sim: repath after blocked-step sidestep to keep move paths coherent`

## Session bootstrap note
A good restart prompt for future `/new` sessions should mention:
- gameplay/UI first pass done
- main determinism blocker fixed and reviewed
- duplicate-packet + disconnect-stall lockstep issues fixed
- build green
- balance foundation now exists under `src/balance/`
- opening and combat modifiers were migrated into balance modules
- `npm run balance:report` exists for quick snapshot checks
- current strategic priority is gameplay variety through player decisions and action diversity
- latest readability micro-pass landed:
  - production panel readability for Town Hall / Barracks
  - attack / hit feedback pulses
  - simple ranged projectile visuals
- determinism guardrail result from latest pass:
  - no net architecture change
  - no hit-timing rewrite
  - visual-event data only, for presentation
- perf hardening pass set 1 already landed and is pushed:
  - blocked static occupancy grid
  - deterministic A* heap
  - move/repath path-cost reductions
  - streamlined target-acquisition scans
- determinism guardrails for next perf passes:
  - static blockers or tick snapshots only
  - tick-based throttling only
  - explicit heap/path tie-breaks
  - no risky dynamic unit occupancy yet
- map-balance pass, fairness follow-up, and destructible blocker v1 have landed; current strategic priority is now post-blocker gameplay depth, not more blind map churn
- next concrete target for `/new`: run a narrow gameplay-upgrade pass that adds strategic branching through a very small number of meaningful upgrade choices, then verify them against the updated maps and blocker timings
- separate worthwhile audit track: inspect the codebase for unnecessary state growth, stale per-entity work after death/removal, duplicate movement plumbing, and only safe/necessary optimizations

## Current gameplay roadmap after map pass + blockers

### Where the project stands now
- opening-branch pass is done
- AI fairness / difficulty-feel pass is done
- dedicated map-balance / map-variety pass is done
- destructible barrier blockers v1 are in on a narrow rollout
- current blocker rollout is limited to:
  - `map05` / Timber Lanes
  - `map06` / Crown Pit
- current gameplay reading:
  - match geography is healthier and less fake
  - maps now offer better route pressure, greed-vs-safety mining, and local information fights
  - the next missing layer is not more map novelty first, but stronger army-style / timing branching

### Current interpretation
The map work improved the floor.
The next pass should improve the ceiling.

Meaning:
- less focus on adding more terrain gimmicks immediately
- more focus on giving players distinct ways to convert map state into a winning plan
- prefer strategic variety through style, timing, and composition identity before adding more content types

## Ownership architecture pass before blocker verification

### Goal
Introduce a true neutral-side model for map-owned objects before treating blocker gameplay results as trustworthy.

### Why this now
Current ownership logic is still fundamentally two-sided:
- `Owner = 0 | 1`
- many systems assume `owner !== myOwner` means enemy
- blockers currently risk inheriting player-side semantics instead of world-side semantics

This is now a design and architecture issue, not just a blocker bug.
It also unlocks future neutral camps, guarded mines, and map objectives cleanly.

### Required owner model
Move toward explicit ownership buckets:
- `PLAYER_1 = 0`
- `PLAYER_2 = 1`
- `NEUTRAL = 2`

Important:
- neutral is not a third full economy faction
- neutral is a world-side bucket for map entities and future neutral units/camps

### Core rule change
Stop relying on raw checks like:
- `owner !== myOwner`
- `owner === 0`
- `owner === 1`

Prefer semantic helpers instead, for example:
- `isPlayerOwner(owner)`
- `isNeutralOwner(owner)`
- `areHostile(a, b)`
- `canAttack(attacker, target)`
- `usesEconomy(owner)`
- `usesRaceProfile(owner)`

### First-pass implementation scope
1. Expand `Owner` type to include neutral
2. Spawn blockers as `NEUTRAL`
3. Audit combat targeting so neutral is attackable by both players
4. Audit AI target selection so neutral does not masquerade as player-owned enemy infrastructure
5. Audit resolver / race lookup so neutral entities do not try to read race data from player race arrays
6. Audit UI / render colors and selection so neutral reads as neutral, not as side 0 or side 1
7. Keep economy / population / opening-plan logic player-only

### Safety rule
Do not widen this into general multi-faction RTS architecture yet.
The goal is a narrow, safe three-bucket ownership model, not a full N-player refactor.

### Done condition
This pass is successful when:
- blockers are truly neutral in sim and UI
- both players can attack them normally
- neutral objects do not pollute race/economy/opening-plan logic
- the codebase no longer assumes every non-self entity is the opposing player

## Post-blocker verification priority

### Goal
Confirm that blockers create optional midgame route-timing decisions instead of a mandatory scripted break pattern.

### What to verify first
1. `map05` / Timber Lanes as the primary blocker test map
   - best candidate for clean blocker signal
   - corridor identity already supports alternate-angle play
   - blocker should open a useful side angle, not the only real route

2. `map06` / Crown Pit as the stress-test map
   - useful for checking whether blockers become win-more around an already center-heavy map
   - if blocker use only helps the side that already owns center, the feature is too snowball-friendly there

### Blocker verification questions
- Is ignoring the blocker still a valid full game plan?
- Does early blocker damage create a real opportunity cost?
- Does midgame blocker break open a new angle rather than a solved script?
- Does fake pressure on the blocker create meaningful reactions?
- Is the blocker sometimes broken and sometimes ignored across repeated games?

### Interpretation rule
- If a blocker is broken almost every game at the same timing, it is too central.
- If a blocker is almost never touched, it is too irrelevant.
- If it mainly benefits the already-winning player, it is acting as a snowball amplifier, not a variety tool.

## Next major gameplay track: upgrade branching pass

### Why this is next
Documentation direction and current gameplay feeling now point to the same answer:
- map-side variety improved meaningfully
- blockers added dynamic route potential
- the weakest remaining layer is army-side strategic branching

Therefore the next best gameplay step is:
- a narrow upgrade pass
- focused on style identity, not on content count

### Design goal
Add strategic branching without exploding balance surface, UI complexity, or tech-tree sprawl.

Upgrades should answer:
- "How do I want to win this match?"
not:
- "How do I buy the generic best stat boost?"

### Scope rule
Do not add a large upgrade tree.
Start with only 2 to 3 strong, readable, deliberately different branches.

## Upgrade pass v1 direction

### Branch 1. Field Tempo
Purpose:
- reward initiative, faster map presence, and better punishment windows

Desired gameplay effect:
- stronger timing around contested mines
- better use of flanks, lane pivots, and post-blocker openings
- more credible early-midgame initiative style

Recommended mechanical shape:
- small movement-speed bonus for core mobile army units
- or small train-time improvement for core military production after research completes
- or both, but only if the total result stays clearly below auto-pick territory

Identity test:
- player should feel "I chose initiative and timing"

### Branch 2. Line Hold
Purpose:
- reward positional staying power and stronger control of fixed contest spaces

Desired gameplay effect:
- better hold on fords, watch-post lines, lane mouths, and expansion approaches
- stronger answer to fast pressure without becoming passive auto-defense

Recommended mechanical shape:
- small survivability bump for frontline core units
- ideally armor and/or hp, not a generic damage spike

Identity test:
- player should feel "I chose to own space and survive the first clash"

### Branch 3. Long Reach
Purpose:
- reward shape control, better pre-engage posture, and punishment of bad enemy entries

Desired gameplay effect:
- stronger use of approach geometry on routes, chokes, ring entries, and mine access lines
- more distinct ranged-control style without introducing a toxic kite-only meta

Recommended mechanical shape:
- small range or ranged cadence improvement for backline units
- if range is too fragile, prefer attack cadence or sight-linked support value instead

Identity test:
- player should feel "I chose to win the approach and fight geometry"

## Upgrade pass v1 implementation constraints

### Hard constraints
- no new unit for this pass
- no new building for this pass
- no second resource
- no hero layer
- no bloated faction-specific labyrinth yet
- no upgrade that is just obviously best in every normal game

### Soft constraints
- prefer centralized quick-tune knobs in `src/balance/tuning.ts`
- prefer reuse of the existing opening / modifier patterns where appropriate
- keep first-pass numbers visible in gameplay feeling, but narrow enough that rollback is cheap

## Practical implementation recommendation

### Suggested first implementation order
1. Keep blocker rollout narrow and verify it with live/manual tests
2. Add upgrade system support only as much as needed for v1
3. Implement exactly three upgrade choices with strong identity
4. Test on the updated map pool, especially:
   - `map05` / Timber Lanes
   - `map06` / Crown Pit
   - `map04` / Stone Fords
5. Watch for auto-pick behavior and flattening
6. Tune or remove weak branches before adding any new content class

### Code-shape recommendation
Use the current lightweight balance architecture as the foundation:
- `src/balance/base.ts` for default unit baselines
- `src/balance/tuning.ts` for quick test-facing knobs
- `src/balance/modifiers.ts` for narrow state-aware combat deltas where needed
- existing opening-plan implementation as the model for small, readable player-choice state

Prefer a compact upgrade-state model over a giant tech framework.
The first pass only needs enough structure to support deliberate branch choice and resolved stat effects.

## Success criteria for upgrade pass v1
- players can name their chosen style in plain language after the match
- different branches produce visibly different route and fight behavior
- map geometry matters more because army style now interacts with it differently
- no branch becomes an obvious universal first pick
- the game feels deeper, not merely busier

## Deferred until after upgrade pass evaluation
Only revisit these if upgrade branching still leaves gameplay too flat:
1. one new unit
2. new building for a real tech branch
3. heroes as a late experimental layer
4. second resource as a much later, much more expensive experiment
