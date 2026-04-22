# LW2B movement and pathing passes (2026-04-22)

## Scope

This note records the narrow movement/pathing fixes that were applied after observing cases where units appeared to push into each other, especially during chase behavior and in tighter movement situations.

These changes were intentionally kept incremental and low-risk.

## Problem summary

Observed issue:
- units could look like they were trying to walk into each other
- this was most noticeable during attack chase, head-on movement, and local congestion

Likely causes before the fixes:
- chase movement used weaker blocking logic than normal move behavior
- pathfinding primarily respected static blockers, not moving unit pressure
- multiple units could effectively contest the same target tile in the same tick

## Pass 1: chase occupancy safety fix

Commit:
- `74e3232` - `combat: avoid stepping chase units into occupied tiles`

Main effect:
- attack-chase now checks whether the next tile is already occupied by another unit before advancing
- if blocked, the active chase path is dropped instead of trying to force movement through another unit

Why it matters:
- removes the most obvious "walk into each other" failure mode in combat chase
- especially helpful for head-on contact and narrow approach cases

## Pass 2: unify avoidance between move and chase

Commit:
- `fe9857a` - `sim: unify path advance avoidance for move and chase`

Files:
- `src/sim/movement.ts`
- `src/sim/commands.ts`
- `src/sim/combat.ts`

Main effect:
- move and attack-chase now use the same shared avoidance helper
- shared logic handles:
  - occupancy checks
  - repath attempts
  - deterministic sidestep attempts
  - clean path reset on failure

Why it matters:
- chase no longer behaves as a simpler or more collision-prone movement mode
- movement rules are more consistent across command types

## Pass 3: deterministic per-tick tile reservation

Commit:
- `03890f7` - `sim: add deterministic per-tick tile reservations for movement`

Files:
- `src/sim/movement.ts`
- `src/sim/commands.ts`

Main effect:
- target tiles can now be reserved during the current movement resolution tick
- a unit trying to move or sidestep must reserve the destination tile first
- if another unit already reserved that tile earlier in the same tick, the step is blocked
- reservations live only for the current command-processing tick

Why it matters:
- reduces cases where multiple units try to enter the same tile at once
- improves crowd behavior without introducing heavy multi-agent movement logic
- keeps resolution deterministic via stable processing order

## Design philosophy for these passes

These fixes intentionally do **not** attempt a full pathfinding overhaul.

Goals were:
- reduce visible movement stupidity
- preserve determinism
- keep the code changes narrow
- avoid destabilizing command/combat systems

Non-goals in this pass series:
- full dynamic pathfinding around moving units
- advanced crowd simulation
- complex swap/negotiation systems between units
- expensive global replanning

## Remaining limitations

Even after these fixes, some classes of movement roughness may still remain:
- tight choke congestion
- local deadlocks in dense formations
- awkward traffic around buildings or worker-heavy base areas
- simple resolution priority favoring stable tick order instead of higher-level movement intent

This is acceptable for now because the current goal was to improve feel safely, not to rewrite the movement engine.

## Recommended next step

Best next step before more movement code changes:
- run a short verification pass focused on movement feel
- confirm what still looks wrong after the three narrow fixes
- only then decide whether a dedicated choke/congestion pass is needed

That keeps future work evidence-driven instead of speculative.


## RTS movement design guardrails (added after external best-practice review)

These principles refine the movement refactor plan without changing its core direction.

### 1. Unify stepping, not all command semantics
The target is one shared movement step core, not one mega-command system.
Keep move / chase / gather / build domain state machines separate.
Unify only the path-step execution layer.

### 2. Prioritize readability and predictability over cleverness
For LW2B, good RTS movement should mean:
- consistent outcomes
- low surprise
- fewer stuck cases
- understandable congestion behavior
not maximum physical realism or overly smart crowd simulation.

### 3. Keep global pathing and local avoidance separate
Preserve the split between:
- path planning / target selection
- local step execution / occupancy / reservation / sidestep / repath
This should remain explicit in code ownership.

### 4. Use one movement core with policy profiles
The shared step layer should support policy-level variation for:
- move
- chase
- gather approach
- build approach
Differences should come from explicit policy flags or small strategy inputs, not separate ad hoc movement implementations.

### 5. Treat arrival / stop behavior as a first-class concern
Movement quality is not only route-taking. It also includes:
- how units stop near goals
- whether late arrivals push arrived units
- whether traffic around goals forms ugly tails or waves
Do not solve this in the current pass unless necessary, but keep the API and tests compatible with future arrival-behavior refinement.

### 6. Do not introduce advanced crowd systems prematurely
Do not add ORCA-style systems, complex boids layers, or deep crowd simulation unless the unified simpler system clearly hits real gameplay limits.
Current preference:
- deterministic heuristics
- cheap local avoidance
- stable tie-breaking
- testable behavior

### 7. Protect determinism above all during refactor
Avoid changes that implicitly alter:
- stable processing order
- tie-break behavior
- cadence timing anchors
- lockstep-visible command semantics

### 8. Judge success by RTS feel, not algorithm prestige
Success criteria for the refactor:
- fewer contradictory movement rules
- less duplication
- fewer obvious stuck/reject edge cases
- same or better determinism confidence
- better player control feel
