# NETWORK MECHANICS AUDIT (Gameplay/Determinism)
Date: 2026-04-21
Repo: `LittleWarCraft2but`

## Scope reviewed
- Net command schema/validation/apply path (`src/net/session.ts`, `src/net/netcmd.ts`)
- Main online sim tick/order (`src/game.ts`)
- Gameplay systems under lockstep:
  - movement/attack/auto-attack (`src/sim/commands.ts`, `src/sim/combat.ts`)
  - economy/gather/train/build/rally/opening effects (`src/sim/economy.ts`)
  - upgrades/doctrines (`src/sim/upgrades.ts`)
  - entity lifecycle/indexing (`src/sim/entities.ts`)
  - pathfinding determinism (`src/sim/pathfinding.ts`)

## Likely safe areas
- **All normal player actions route through `NetCmd` in online mode** (`emit` -> `net.push` -> `exchange` -> `applyNetCmds`).
- **Command execution owner ordering is deterministic** (owner 0 then owner 1 on both peers).
- **`ids` are sorted before application** for move/attack/gather/stop, reducing selection-order drift.
- **Race/building/upgrades are resolved from shared sim state**, not local UI.
- **No sim-time randomness found** (`Math.random` not used in core sim).
- **Online mode disables AI**, removing a major nondeterministic branch.

## Risky or suspicious areas

### 1) Entity-array mutation during per-tick iteration (HIGH)
`simTick()` runs `for (const entity of state.entities) processCommand(...)` while command processing can `spawnEntity` / `killEntity` / `splice`.

Why risky:
- Determinism depends on both peers mutating `state.entities` in identical moments and iteration behavior staying identical.
- Any small prior divergence can amplify because target selection, nearest scans, and auto-attack all iterate this same array.

Potential impact:
- desync cascades in combat/economy command processing order.

### 2) Gameplay decisions rely on `state.entities` encounter order without explicit tie-breaks (MEDIUM)
Examples:
- nearest target acquisition
- nearest dropoff selection
- several `find`/`some`-based choices in gather/train/opening fallbacks.

Why risky:
- if entity order diverges once, tie situations can pick different targets/paths and continue diverging.

### 3) Net validation is permissive for train/build command semantics (MEDIUM gameplay integrity, LOW desync)
`train`/`build` packet validation checks shapes, but not strict gameplay legality per building/race in net layer.
- `train`: any unit kind can be sent for any owned building id.
- `build`: includes high-impact building kinds (including townhall).

Why it matters:
- More “unexpected accepted actions” than “not registered” behavior in online games.
- Usually deterministic (both peers accept), but can look like sync bug/exploit.

### 4) Gather tree-id encoding uses hardcoded width in input path (`ty * 64 + tx`) (LOW now, HIGH if map width changes)
Seen in online click path and AI helpers.

Why risky:
- Current maps are 64 wide, so it works now.
- If map width becomes variable later, gather target decoding can mismatch and produce silent wrong/ignored gathers.

### 5) Desync checksum omits major mechanic state (MEDIUM observability risk)
Checksum currently excludes:
- upgrades/doctrine state
- pending upgrades timers
- tile resource reserves (wood/gold depletion details)
- opening-plan/commit flags
- some dynamic transient gameplay state

Why risky:
- real desyncs can exist while checksum still matches (false negatives).

## Possible desync vectors
- Divergence in `state.entities` ordering after spawn/kill during iteration, then different target/path choices in tie cases.
- Edge-case simultaneous combat/build/train interactions where array mutation timing differs after an earlier small mismatch.
- Future variable map width with hardcoded gather target encoding.

## Possible “not registering” vectors
- Valid packet shape but command rejected in sim legality checks (`isValidPlacement`, missing target/site, wrong ownership, depleted resource).
- Rally set to unreachable/out-of-bounds targets, causing no follow-up movement.
- Opening-plan lock window expiration (`set_plan` after lock tick) silently ignored.

## Severity / priority
1. **HIGH**: make per-tick entity processing order explicitly stable and mutation-safe.
2. **MEDIUM**: deterministic tie-breaks for nearest/selection scans (id, position).
3. **MEDIUM**: tighten net command semantic validation (building/unit legality, race/building constraints).
4. **MEDIUM**: strengthen sync checksum coverage.
5. **LOW (current)** / **HIGH (future)**: remove hardcoded 64 from gather id encoding paths.

## Recommended checks/tests
- Deterministic replay test: same command log on two clients, assert full state equality every N ticks (not only checksum hash).
- Stress scenario tests:
  - simultaneous kills/spawns during large battles
  - mass training completion same tick
  - many workers retargeting depleted wood simultaneously
- Tie-case tests with mirrored entities at equal distance; verify identical target pick by explicit tie-break.
- Fuzz invalid-but-shaped net commands; ensure explicit reject reason and no partial side effects.
- Extend checksum to include upgrades, pending timers, opening flags, and resource reserves.

## Final verdict
- **Current online mechanics are mostly lockstep-safe for normal play**, and core command routing is correct.
- **Main desync risk is iteration/mutation/order sensitivity around `state.entities`**, not obvious random sources.
- **Main “not registering” risk is silent command invalidation in edge cases plus permissive packet semantics that can produce surprising accepted behavior.**
- Recommend addressing the HIGH/MEDIUM items before scaling online complexity further.
