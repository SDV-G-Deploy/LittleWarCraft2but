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

## Movement stabilization checkpoint after passes #1-#4

### What changed today
- Fixed adjacent one-tile move rejection and misleading offline move/error marker overlap.
- Extracted a shared movement step core for movement execution.
- Moved `move` and `chase` onto the shared movement core.
- Added movement policy profiles so movement semantics can stay role-specific.
- Partially unified worker travel onto the shared core while keeping economy state machines specialized.
- Fixed worker correctness bugs where unreachable travel could be mistaken for successful arrival:
  - unreachable build path no longer starts building remotely
  - unreachable return path no longer deposits resources remotely

### Current intended architecture
- Shared core owns: path-step execution, occupancy/reservation handling, repath hooks, step result statuses.
- Domain modules still own: move intent, chase/attack logic, gather logic, build logic, economic side effects.
- Worker movement remains intentionally softer/lighter than combat movement.
- This is a partial unification, not a mega-command rewrite.

### What we are consciously NOT doing yet
- No deep crowd simulation / ORCA / boids-style rewrite.
- No full merge of gather/build state machines into combat/move semantics.
- No lockstep scheduling or protocol changes.
- No further movement refactor pass until manual gameplay validation reveals a concrete need.

### Manual stabilization checklist
- Adjacent move: combat/military unit moves correctly to a neighboring valid tile.
- Blocked build path: worker does not begin building if path is impossible.
- Unblocked-later build path: worker retries and resumes sensibly after the route opens.
- Blocked return path: worker does not deposit without actually returning.
- Unblocked-later return path: worker eventually returns and deposits correctly.
- Multi-worker traffic near resource/dropoff stays lightweight and does not feel over-constrained.
- Combat choke traffic still feels deterministic and not obviously worse after refactor.

### Recommended next action
- Stop refactoring movement for now.
- Do short manual playtests.
- Only schedule the next pass if playtesting reveals a concrete new bug, regression, or remaining pain point.

## 2026-04-23 rollback and follow-up hotfix

After broader live testing, the newer movement architecture proved too fragile for real choke / base-entry traffic.

Observed regressions in live play:
- workers and other units could still collide in narrow flows in ways that felt worse than the older baseline
- the more complex reservation/shared-core direction introduced deadlock-like behavior and overly brittle local traffic semantics
- after the rollback to a simpler baseline, a narrower but important bug remained: during plain move traffic, a unit could sidestep around contact and then lose its remaining move intent, stopping early even though it had not reached its destination

### Practical conclusion from the rollback review
The project moved away from the more ambitious movement refactor direction.

Current preferred direction is now:
- keep a simpler movement baseline
- preserve deterministic order and lightweight local avoidance
- avoid over-unifying worker travel / build traffic / combat movement unless a change proves itself in manual play
- treat movement intent preservation as more important than clever local traffic behavior

### Live rollback checkpoint
Commits applied after the failed broader movement direction:
- `407eaf9` - `rollback(sim): restore simpler movement baseline`
- `21a3018` - `fix(sim): preserve move path after sidestep`

Main effect of the hotfix in `21a3018`:
- after a sidestep, if immediate repath does not succeed, the unit no longer drops the rest of its move path
- this preserves the original move command intent instead of silently cancelling movement after transient contact

### Updated movement lesson
The key failure of the reverted direction was not only collision handling itself.
It was allowing local avoidance failure to cancel global movement intent.

For future movement work, preserve these rules:
- local traffic issues must not silently erase a longer move order
- global route/goal and local step resolution should stay conceptually separate
- prefer wait / retry / periodic repath over command loss
- only reintroduce stronger traffic coordination if it is both deterministic and clearly better in real matches

### Next-pass framing
If a future `/new` session resumes movement work, the correct framing is:
- baseline is intentionally simpler again
- current high-value target is improving plain move traffic in a narrow, test-backed way
- do not reintroduce full reservation/shared worker-travel complexity by default
- if needed, pursue a small `simplified movement v2` rather than another broad refactor

