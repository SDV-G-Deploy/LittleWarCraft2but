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

Infrastructure note:
- the balance foundation is now good enough
- avoid further balance-system plumbing unless a concrete gameplay iteration need appears
- next sessions should primarily spend energy on gameplay changes, playtests, and faction identity tuning

## Phase C. Branching gameplay decisions
Goal: make early and midgame branch into distinct player plans.

Current branch status:
- v1 established eco / tempo / pressure framing and opening intent support
- v2 added a small mechanical payoff around contested mines during the early opening window
- opening and combat logic now live in dedicated balance modules, so next step should be playtest-guided gameplay tuning, not another support-layer pass

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

Suggested commit themes:
- `design: add contested expansion and map-pressure incentives`
- `maps: create stronger positional stakes`

## Phase G. Feedback / clarity pass
Goal: make the richer game easier to read at a glance and reduce silent failure.

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

## Phase H. AI support pass
Goal: let AI participate in the improved game without pretending AI is the main source of variety.

Focus ideas:
- basic reaction to greed, pressure, and harassment
- use expansions or defend them at a simple level
- avoid obviously broken production loops
- support solo testing of the now-richer match structure

Definition of done:
- AI can exercise the main systems well enough for practice and solo play
- AI does not need to be brilliant, it just should not collapse the intended gameplay shape

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
1. branching gameplay decisions
2. direct gameplay/balance tuning from playtest evidence
3. interesting action layer
4. army composition depth
5. map pressure and expansion gameplay
6. feedback / clarity pass
7. AI support pass
8. only then revisit deeper network work or more balance tooling if a concrete problem remains

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
- next likely target is real gameplay tuning and playtest-guided faction/branch divergence work, unless a new bug changes priority
