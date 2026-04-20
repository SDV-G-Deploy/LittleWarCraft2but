# ROADMAP

This file is meant to be a living project map for future coding sessions.
Update it when a phase is completed, reframed, or split.

## Snapshot

### Done recently
- gameplay/UI first pass
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

### Verified
- build green after each recent pass
- targeted review confirmed the main determinism blocker was removed
- targeted review confirmed multi-id ordering cleanup is clean
- targeted review found and helped close the ring asymmetry issue
- targeted review found and helped close the stale-path-after-sidestep issue

### Known remaining caution
- blocked-step sidestep still depends on same-tick entity processing order
- if entity iteration ever diverges between peers, that area becomes more sensitive
- this is not the next small polish item, it is a broader sim-order discipline topic
- do not introduce dynamic unit occupancy as a live mutable grid in-path yet; if needed later, use snapshot/fixed-phase discipline
- keep all perf throttling tick-based only, never wall-clock/runtime-budget based
- any heap/path selection changes must keep deterministic tie-break rules explicit

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
- next useful step is live validation, not another blind architecture pass
- if more map work is needed, keep it point-fix only and driven by concrete spawn-side findings

Infrastructure note:
- the balance foundation is now good enough
- a simple manual tuning layer now exists in `src/balance/tuning.ts` for fast live-test balance edits
- avoid deeper balance-system plumbing unless a concrete gameplay iteration need appears
- next sessions should primarily spend energy on gameplay changes, playtests, faction identity tuning, and now map fairness tuning

Performance note:
- immediate next perf target remains `combat.ts` LOS checks via blocker/grid lookup
- but this is no longer the next `/new` priority unless map work is blocked
- after LOS pass, likely order is:
  1. allocation churn reduction (`shift`, repeated arrays/maps/strings in hot paths)
  2. only then reconsider spatial buckets if profiling still points there

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
- next concrete target for `/new`: do a dedicated map-balance pass across the current pool, focusing first on spawn fairness, mine fairness, choke asymmetry, watch-post leverage, and route symmetry; prefer small map edits with explicit fairness reasoning, and only return to perf work like LOS-through-grid in `src/sim/combat.ts` after map work is no longer the main blocker
- separate worthwhile audit track: inspect the codebase for unnecessary state growth, stale per-entity work after death/removal, duplicate movement plumbing, and only safe/necessary optimizations
