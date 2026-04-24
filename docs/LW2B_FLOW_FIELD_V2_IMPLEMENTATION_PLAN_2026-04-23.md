# LW2B Flow Field v2 Implementation Plan

Date: 2026-04-23
Status: planning / patch-ready checklist

Related doctrine:
- `docs/LW2B_MOVEMENT_DOCTRINE_2026-04-23.md`

## Why this plan exists

This implementation plan should be read together with:
- `docs/LW2B_MOVEMENT_DOCTRINE_2026-04-23.md`

The doctrine defines the architectural guardrails:
- do not rebuild one universal movement core for all domains,
- keep workers forgiving and economy-first,
- concentrate movement sophistication mainly in combat,
- keep plain move deterministic and moderate.

Current LW2B movement is already cleaner than a naive RTS baseline:
- unit move uses A* plus deterministic sidestep/repath
- combat chase uses assigned contact slots plus A*
- worker traffic has separate ally-block handling
- command processing already runs in stable entity-id order

That gives a strong base, but several movement paths are still individually replanning against live occupancy:
- `src/sim/commands.ts` move commands
- `src/sim/combat.ts` chase movement
- `src/sim/economy.ts` gather/build travel

On a 64x64 map and 20 Hz sim, the next practical step is not a full crowd-sim rewrite. The right move is:

**Flow Field v2 for shared goals + deterministic local avoidance + A* fallback for edge cases.**

---

## Current code hotspots

### Existing files involved
- `src/sim/pathfinding.ts`
  - current A* grid pathfinder
- `src/sim/movement.ts`
  - deterministic sidestep / ally-block policy
- `src/sim/commands.ts`
  - unit move command pipeline
- `src/sim/combat.ts`
  - chase pathing and melee slot assignment
- `src/sim/economy.ts`
  - worker gather/build travel
- `src/sim/profiler.ts`
  - existing path / movement metrics
- `src/types.ts`
  - command/state types

### Important constraints already visible in code
- deterministic processing order already exists via stable entity id sorting
- movement behavior is tile-based
- most logic is discrete and lockstep-friendly already
- profiler and determinism tests already exist, so rollout can be verified instead of guessed

---

## Target architecture

### Keep
- `findPath()` A* as fallback
- `tryAdvancePathWithAvoidance()` style local resolution logic
- melee slot assignment in combat
- worker-specific traffic policy

### Add
- shared flow fields for common goals
- cached direction maps keyed by goal + passability revision + mode
- reservation-first local step resolution
- nav debug counters and determinism/hash coverage

### Do not do yet
- ORCA / RVO as primary movement core
- float-based local steering
- per-tick full dynamic flow rebuilds for every unit
- one universal movement FSM for combat + workers + build + gather

---

## Proposed file/module plan

### New files

#### `src/sim/nav/nav-types.ts`
Own all nav-specific types.

Suggested contents:
- `Dir8`
- `FlowField`
- `FlowKey`
- `NavIntent`
- `NavReservation`
- `NavDebugStats`
- `FlowMode` (`move`, `combatChase`, `workerTravel`, `workerReturn`, `buildApproach`)

#### `src/sim/nav/flow-field.ts`
Build integration map + direction map.

Suggested exports:
- `buildFlowField(state, goal, options)`
- `directionToVec(dir)`
- `desiredStepFromFlow(flow, pos)`

#### `src/sim/nav/flow-cache.ts`
Manage reuse and invalidation.

Suggested exports:
- `beginNavTick(state)`
- `endNavTick()`
- `ensureFlowField(state, goal, mode, passabilityRevision)`
- `invalidateFlowFields(reason)`

#### `src/sim/nav/local-avoidance.ts`
Central deterministic reservation layer.

Suggested exports:
- `beginMovementResolutionTick(tick)`
- `registerNavIntent(intent)`
- `resolveReservationsDeterministic()`
- `stepUnitWithReservation(...)`

This may absorb or wrap parts of current `src/sim/movement.ts`.

#### `src/sim/nav/nav-debug.ts`
Debug counters, overlay data, stuck-rate helpers.

Suggested exports:
- `recordFlowBuild(...)`
- `recordFlowCacheHit(...)`
- `recordNavBlocked(...)`
- `recordNavFallback(...)`
- `snapshotNavDebugState(...)`

### Existing files to change

#### `src/types.ts`
Extend command state.

For `move` command add fields like:
- `flowGoal: Vec2 | null`
- `flowMode: 'move'`
- `flowDirty: boolean`
- `sidestepCooldown?: number`

For `attack` command add fields like:
- `chaseFlowGoal?: Vec2`
- `chaseFlowDirty?: boolean`

For worker cache state in economy, later add optional flow references instead of only `_gatherPath` / `_buildPath`.

#### `src/sim/commands.ts`
Primary integration point for unit move.

#### `src/sim/combat.ts`
Keep melee slotting, but switch chase travel to shared flow when possible.

#### `src/sim/economy.ts`
Workers should migrate later, after combat move is stable.

#### `src/sim/profiler.ts`
Add nav counters for flow builds, cache hits, reservation conflicts, fallback usage.

#### `src/render/renderer.ts`
Optional debug overlay for flow arrows / reservation winners.

---

## Concrete rollout sequence

## Phase 1, safe nav foundation

### Goal
Add nav modules without changing gameplay yet.

### Checklist
1. Create `src/sim/nav/` directory.
2. Add `nav-types.ts`.
3. Add `flow-field.ts` with:
   - integer-only integration cost grid
   - 8-direction best-dir grid
   - reachable mask
4. Add `flow-cache.ts` with a simple in-memory map.
5. Add tests for:
   - direction field on open terrain
   - obstacle avoidance around blockers
   - determinism of field generation

### Acceptance
- no gameplay path changed yet
- tests pass
- field generation is deterministic and cheap on 64x64

---

## Phase 2, move-command integration

### Goal
Convert only plain move commands to flow-driven movement.

### Files
- `src/sim/commands.ts`
- `src/types.ts`
- `src/sim/movement.ts` or new `src/sim/nav/local-avoidance.ts`

### Checklist
1. On `issueMoveCommand()`:
   - keep requested goal logic
   - still use current fallback candidate selection for unreachable goals
   - initialize flow metadata on command
2. In `processCommand()` move case:
   - replace repeated path dependence with `ensureFlowField(...)`
   - use `desiredStepFromFlow(...)`
   - if no valid dir, fallback to old A*
3. Keep old `cmd.path` for temporary compatibility during migration, but treat it as fallback path, not main source of truth.
4. Preserve current stuck/repath counters, but redefine repath as:
   - refresh fallback goal
   - or A* fallback path when flow gives no advance

### Acceptance
- unit move commands work with feature flag on
- open-field army movement causes fewer A* calls
- determinism test still passes

---

## Phase 3, reservation-first local avoidance

### Goal
Stop letting each moving unit independently discover conflicts too late.

### Files
- `src/sim/movement.ts` or `src/sim/nav/local-avoidance.ts`
- `src/sim/commands.ts`

### Checklist
1. Add per-tick reservation buffer sized to `MAP_W * MAP_H`.
2. First pass:
   - collect intended next tile for each moving unit
3. Resolve in stable order:
   - priority
   - then unit id
4. Second pass:
   - winners move
   - losers wait or sidestep deterministically
5. Keep worker-domain permissive traffic as a separate rule, not global behavior.

This can include full worker transparency in economy scenarios if that proves cleaner than extending swap-only heuristics.

### Acceptance
- reduced “walk into same tile then react” jitter
- narrow choke behavior becomes more stable
- no nondeterministic tie breaks

---

## Phase 4, combat chase migration

### Goal
Move attack chase off repeated raw A* where possible.

### Files
- `src/sim/combat.ts`
- `src/types.ts`

### Checklist
1. Keep `pickChaseGoal()` and melee `contactSlot` logic.
2. Use chosen chase goal as input to flow field.
3. For multiple attackers converging on same target band/ring, let them share the same field when goals match.
4. Keep A* fallback when:
   - target moves too much
   - assigned contact tile becomes unreachable
   - flow field says unreachable
5. Do not touch attack resolution, LOS, or cooldown logic.

### Acceptance
- melee congestion remains at least as good as current behavior
- fewer chase-path rebuilds in clustered fights
- `combat-congestion.test.ts` still passes or improves

---

## Phase 5, worker travel migration

### Goal
Bring workers onto the new nav system carefully, while keeping open the simpler fallback that workers may remain a largely transparent traffic class.

### Files
- `src/sim/economy.ts`

### Checklist
1. Migrate only travel phases first:
   - gather `toresource`
   - gather `returning`
   - build `moving`
2. Keep resource and build FSM phases unchanged.
3. Preserve worker-specific permissive traffic behavior.
4. Prefer simpler transparent-worker rules over accumulating special-case swap logic if live testing shows that is cleaner.
5. Keep point A* fallback for special approach tiles around mines/trees/build sites.

### Acceptance
- `worker-traffic.test.ts` still passes
- no regressions in gather/build completion
- worker deadlocks not worse than baseline
- townhall return lanes behave better in live-like mixed-unit traffic

---

## Real file-level patch checklist

## 1. `src/types.ts`

### Move command
Add optional flow metadata to the existing move command, not a new command type.

Suggested additions:
- `flowGoal?: Vec2 | null`
- `flowMode?: 'move'`
- `flowDirty?: boolean`
- `sidestepCooldown?: number`

### Attack command
Suggested additions:
- `chaseFlowGoal?: Vec2`
- `chaseFlowDirty?: boolean`

Reason: keep serialization and command handling incremental.

---

## 2. `src/sim/pathfinding.ts`

Keep A* mostly as is.

### Add later if useful
- `findPathWithStaticPassability(...)`
- helper to expose a passability mask hash/revision source

Do not rip out current code.

---

## 3. `src/sim/movement.ts`

This file is the best current bridge point.

### Keep
- `findDeterministicSidestep()`
- ally-block policy state
- `tryAdvancePathWithAvoidance()` as fallback path helper

### Add
- reservation buffers
- flow-step helper path
- maybe split into:
  - `movement.ts` legacy wrapper
  - `nav/local-avoidance.ts` new engine

Recommended direction: keep public compatibility in `movement.ts`, but move new logic into `nav/`.

---

## 4. `src/sim/commands.ts`

This is the first real gameplay integration target.

### In `issueMoveCommand()`
- keep `findNearbyMoveGoal()` for goal fallback selection
- initialize flow fields on command creation
- keep `path` populated only as fallback path

### In `processCommand()` move case
Replace the current “path is always primary” assumption.

Target logic:
1. if cooldown not elapsed, return
2. ensure flow field for `cmd.goal`
3. get desired next tile from flow
4. register reservation intent
5. apply result
6. fallback to current `tryAdvancePathWithAvoidance()` path behavior only when flow cannot produce a valid step

Note: because the current `processCommandPass()` is one-pass per entity, you will likely want a staged move resolution for move commands only.

Minimal practical option:
- first collect move-capable entities
- precompute intents
- then resolve/apply

That means `processCommandPass()` will need a small structural split.

---

## 5. `src/sim/combat.ts`

### Keep untouched
- range checks
- LOS
- damage and cooldown
- melee slot assignment

### Change
Current chase logic:
- rebuilds `chasePath` by `findPath(...)`
- advances with `tryAdvancePathWithAvoidance(...)`

New target logic:
- `pickChaseGoal(...)`
- get or build flow field to that goal
- attempt flow-driven step
- fallback to current chasePath A* only when needed

This is a good place to stay conservative. Combat is more fragile than plain move.

---

## 6. `src/sim/economy.ts`

### Keep for now
- approach tile selection around mines/trees/buildings
- build/gather FSM logic

### Migrate later
- replace `_gatherPath` / `_buildPath` primary use with optional flow travel state
- still permit exact A* for the final approach tile

The worker system already has special traffic behavior. Do not flatten it into generic unit logic.
If needed, simplify it further by making workers transparent instead of adding more layered local collision exceptions.

---

## 7. `src/sim/profiler.ts`

Add counters:
- `flowBuildCalls`
- `flowBuildMsTotal`
- `flowCacheHits`
- `flowFallbackAStar`
- `navReservationConflicts`
- `navBlocked`
- `navSidestep`

Also add sampled sizes:
- active flow-driven movers
- active flow cache entries

This matters because the whole point is reducing pathfinding pressure and visible congestion.

---

## Test plan

### Add tests
- `src/sim/flow-field.test.ts`
- `src/sim/nav-determinism.test.ts`
- `src/sim/nav-cache.test.ts`

### Re-run existing tests with special attention
- `src/sim/determinism.test.ts`
- `src/sim/move-command.test.ts`
- `src/sim/movement-policy.test.ts`
- `src/sim/combat-congestion.test.ts`
- `src/sim/worker-traffic.test.ts`
- `src/sim/rally-pathing.test.ts`

### Suggested new acceptance scenarios
1. 20+ units same destination in open field
2. 20+ units through a 1-2 tile choke
3. melee surround on moving target
4. two worker streams crossing each other near a townhall
5. workers returning to townhall through mixed worker + combat-unit base traffic under transparent-worker rules
6. replayed identical command stream yields identical hash/checksum

---

## Determinism rules

These should stay hard constraints:
- integer-only movement decision logic
- no `Math.random()` for tie breaks
- stable entity-id ordering
- stable direction preference ordering
- cache keys based only on deterministic state
- no iteration order dependence on uncontrolled object key order

If a tie-break is needed, use explicit numeric order:
- priority desc
- entity id asc
- tile index asc

---

## Doctrine alignment

This plan is valid only while staying aligned with the movement doctrine.

That means in practice:
- use flow-field improvements mainly for plain move and combat,
- do not use this plan as a reason to re-unify worker traffic with combat movement,
- prefer worker-specific permissive fixes over worker realism,
- prefer simpler transparent-worker behavior over layered exception trees when both solve the same economy issue,
- reject abstractions that require many policy flags just to preserve worker behavior.

## Recommended first commit sequence

### Commit 1
`nav: add flow-field core and cache scaffolding`

### Commit 2
`nav: add deterministic reservation layer for move intents`

### Commit 3
`move: route plain move commands through flow field with a-star fallback`

### Commit 4
`combat: use flow-driven chase toward assigned goals`

### Commit 5
`economy: migrate worker travel phases to flow-aware movement`

### Commit 6
`debug: add nav profiling, determinism checks, and overlays`

---

## Recommendation

If you want the highest signal-to-risk next step, start with this exact slice:

1. implement `src/sim/nav/flow-field.ts`
2. implement `src/sim/nav/flow-cache.ts`
3. patch only `src/sim/commands.ts` plain move path
4. add metrics in `src/sim/profiler.ts`
5. run determinism + move + congestion tests

That is the smallest change that meaningfully improves future work and makes the next coding passes much easier.

---

## Update after worker traffic pass (2026-04-24)

A narrow worker-only traffic pass was implemented and pushed in:
- commit `86d0cea`
- see `docs/LW2B_WORKER_MOVEMENT_PASS_2026-04-24.md`

What this means for the plan:
- the architectural direction is unchanged
- do **not** reinterpret that worker pass as a step toward universal movement unification
- worker fixes remain local economy-domain corrections
- main future flow-field work should still concentrate on plain move first, then combat

Practical consequence:
- worker congestion can continue to receive narrow doctrine-compatible fixes
- one valid next worker fix is to make worker/peon traffic fully transparent in economy scenarios if live-like testing supports it
- but the main structural nav work is still `move` first, `combat` second, workers later and carefully
