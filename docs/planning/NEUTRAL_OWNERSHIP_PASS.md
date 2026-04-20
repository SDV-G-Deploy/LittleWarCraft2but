# Neutral Ownership Pass

## Purpose
Introduce a narrow three-bucket ownership model so map-owned objects are handled correctly in simulation, UI, and future gameplay systems.

This pass exists primarily to fix destructible blockers correctly, but it also prepares the engine for future neutral camps, guarded mines, and other world-owned objectives.

## Target model
- `PLAYER_1 = 0`
- `PLAYER_2 = 1`
- `NEUTRAL = 2`

Important:
- `NEUTRAL` is not a third economy faction
- it does not use player economy, population, opening-plan, or race logic
- it is a world-side ownership bucket

## Why this pass is needed
Current ownership semantics are too binary:
- `Owner = 0 | 1`
- many systems assume `owner !== myOwner` means the opposing player
- blockers currently risk acting like player-owned structures instead of neutral map objects

That makes blocker gameplay results untrustworthy and blocks clean implementation of future neutral camps.

## First-pass goals
1. Expand owner semantics to include `NEUTRAL`
2. Spawn blockers as neutral
3. Make neutral objects attackable by both player sides when appropriate
4. Keep neutral entities out of player economy / race / opening-plan logic
5. Render neutral entities as neutral, not friendly or enemy-player colored

## Non-goals
- full N-player RTS support
- diplomacy system
- generalized alliance matrix
- neutral camp AI in this pass

## Recommended helper layer
Replace raw ownership assumptions with semantic helpers.

Recommended helpers:
- `isPlayerOwner(owner)`
- `isNeutralOwner(owner)`
- `areHostile(a, b)`
- `canAttack(attacker, target)`
- `usesEconomy(owner)`
- `usesRaceProfile(owner)`

## File-by-file checklist

### 1. `src/types.ts`
- expand `Owner` from `0 | 1` to `0 | 1 | 2`
- add named ownership constants if preferred
- add ownership helper functions
- keep player-only arrays typed carefully where still appropriate

### 2. `src/game.ts`
- spawn blockers as `NEUTRAL`
- audit loops that assume every entity owner maps into `state.races`

### 3. `src/balance/resolver.ts`
- ensure neutral entities resolve with `race = null`
- avoid reading `state.races[owner]` for neutral entities
- keep player-side race resolution unchanged for players 1 and 2

### 4. `src/sim/commands.ts`
- replace naive hostility checks where needed
- make neutral target acquisition explicit instead of relying on `target.owner !== unit.owner`

### 5. `src/sim/ai.ts`
- keep AI logic player-vs-player for strategic targeting
- ensure neutral blockers do not masquerade as enemy base assets
- allow future optional attack on neutral targets only by explicit logic

### 6. `src/sim/economy.ts`
- keep economy, pop, and opening-plan flows player-only
- ensure neutral entities cannot accidentally enter production/economy code paths

### 7. `src/net/netcmd.ts`
- keep ownership validation player-only for commands issued by player sides
- ensure neutral entities are not valid for player-only building/plan/rally ownership checks unless explicitly intended

### 8. `src/render/renderer.ts`
- give neutral entities a distinct readable color treatment
- avoid treating neutral as side 0 or side 1 for overlays and debug visuals
- ensure visibility logic does not auto-reveal neutral as 'friendly'

### 9. `src/render/ui.ts`
- avoid mapping neutral entities through player-race labels/colors
- ensure selected neutral entities display correctly
- ensure neutral entities do not expose player-only production or economy panels

## High-risk regression zones
- any `owner !== myOwner` assumption
- any `state.races[e.owner]` lookup
- any color palette indexed directly by owner
- any enemy-base search implemented as “find townhall where owner !== myOwner”
- any selection/UI logic that assumes non-self equals enemy player

## Recommended implementation order
1. types + ownership helpers
2. blocker spawn ownership fix
3. resolver / race safety
4. combat hostility cleanup
5. AI cleanup
6. renderer/UI neutral presentation
7. smoke test in AI game and online host/client scenario

## Done condition
This pass is successful when:
- blockers are truly neutral in simulation and UI
- both players can attack them normally
- neutral objects do not participate in economy/pop/opening-plan logic
- online host/client no longer gives blocker ownership semantics to player 1 / host
- the engine is ready for future neutral camps without another ownership rewrite
