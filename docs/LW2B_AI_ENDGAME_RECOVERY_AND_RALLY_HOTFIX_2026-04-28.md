# LW2B AI endgame recovery and rally hotfix - 2026-04-28

## Scope

This pass addressed three tightly related late-game / AI-vs-AI stability problems:

1. melee / attack-move units failing to retaliate against ranged chip damage outside normal sight
2. workerless AI getting stuck in tower-backed economic death spirals
3. fresh melee batches collapsing near barracks / rally release and failing to spread cleanly

The goal was to improve endgame continuity without breaking the general move/pathfinding model or introducing "magic" behaviors.

---

## What was fixed

### 1. Defensive retaliation memory for recent attackers

Implemented a local retaliation memory so units can answer a recent ranged attacker even when the attacker sits slightly outside ordinary sight rules.

Relevant changes:
- `src/types.ts`
  - added `lastAttackerId?: number`
  - added `lastAttackedByTick?: number`
- `src/sim/combat.ts`
  - damage application now records recent attacker identity on the target
- `src/sim/commands.ts`
  - added defensive retaliation memory handling
  - idle units can retaliate to recent ranged attackers
  - `move + attackMove` units can also pivot to recent attackers

Behavioral intent:
- do not make units globally omniscient
- do not alter normal plain-move logic
- only fix obviously bad "stand and die under ranged fire" behavior

Associated commits from this broader line:
- `0dd8d77` - `Add defensive retaliation against recent ranged attackers`
- `98564c0` - extended retaliation coverage for `move + attackMove`

---

### 2. Workerless recovery / tower salvage improvements

The AI previously could get trapped in a bad late-game state:
- workers dead
- army still alive
- towers still standing
- too few free resources to rebuild workers
- towers effectively freezing the game instead of enabling recovery

Implemented improvements in `src/sim/ai.ts`:
- `evaluateEconCollapse(...)`
- `evaluateRecoveryPriority(...)`
- `shouldAttemptEmergencyTowerSalvage(...)`
- emergency salvage path now supports workerless recovery more reliably

New behavior:
- workerless collapse can prioritize recovery even when the army is still non-trivial
- tower salvage is considered a valid path to restart economy
- in crippled-enemy situations, AI may salvage even the last tower to recover instead of staying in tower-backed deadlock
- severe home threat and cooldown guardrails remain in place

Associated commit:
- `15a89cf` - `Improve AI recovery from workerless collapse`
- `b831a94` - `Improve AI tower salvage and rally release`

---

### 3. Barracks / rally release spread for fresh melee

A separate local congestion issue was identified:
- newly trained footmen could cluster too tightly near barracks
- multiple fresh melee units could converge toward effectively the same local arrival area
- this could look like "only archers attack" while melee looped near production

Implemented in `src/sim/economy.ts`:
- expanded `findSpawnTile(...)` search pattern
- widened `pickRallyArrivalTile(...)` spread radius from `2` to `4`

Intent:
- reduce local post-train same-tile / same-corridor collapse
- improve initial release fan-out without changing general movement rules

Associated commit:
- `b831a94` - `Improve AI tower salvage and rally release`

---

## Tests added / updated

### Defensive retaliation
- `src/sim/defensive-retaliation.test.ts`
  - idle melee retaliates vs ranged attacker outside sight
  - attack-move melee retaliates vs ranged attacker outside sight

### AI econ / collapse / salvage
- `src/sim/ai-econ-collapse.test.ts`
  - workerless recovery remains prioritized when tower salvage path exists
  - crippled enemy state can allow salvaging the last tower for recovery
  - prior emergency salvage and recovery tests remain covered

### Rally release
- `src/sim/rally-pathing.test.ts`
  - occupied exact rally tile chooses nearby free tile
  - multiple fresh melee receive wider distributed arrival goals

All tests and build were green after the latest pass.

---

## What this pass intentionally did NOT do

### Not done: global "attack whoever is nearby" combat rewrite
Reason:
- would reduce focus-fire clarity
- would blur unit roles
- would likely hide decision-layer bugs instead of fixing them

### Not done: transparent allied movement / full overlap
Reason:
- too magical
- weak RTS feel
- treats symptom, not cause

### Not done: attack through buildings
Reason:
- breaks spatial logic
- undermines structure screens and choke gameplay

---

## Remaining likely issue after this pass

There is still a probable separate late-game behavior gap around:
- terminal push
- anti-hoarding behavior
- reluctance to fully finish off a crippled enemy

Likely next investigation zone in `src/sim/ai.ts`:
- `updateStrategicIntent(...)`
- `updateAssaultPosture(...)`
- `evaluateEndgamePressureOverride(...)`
- `getHomeReserveCount(...)`
- `assignArmyRoles(...)`

Working hypothesis:
- after local release and workerless recovery are improved, the next remaining blocker will be over-conservative endgame pressure logic rather than combat pathing itself

---

## Recommended next step

Run fresh AI-vs-AI observation again and verify:
1. whether workerless tower deadlocks are materially reduced
2. whether footman still loop near barracks in live simulation
3. whether the remaining visible weakness is now mostly terminal push / anti-hoarding

If yes, next pass should target:
- `terminal push / anti-hoarding`
- not general combat pathfinding
- and not broad target-selection chaos
