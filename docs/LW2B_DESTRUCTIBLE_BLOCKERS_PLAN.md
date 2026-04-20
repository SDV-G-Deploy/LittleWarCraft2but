# LW2B Destructible Blockers Plan

## Purpose
This document defines the narrowest useful first implementation of destructible route blockers for LW2B.

Goal: add dynamic path opening as a gameplay-variety layer without turning the game into a scripted blocker-rush meta and without exploding engine complexity.

## Why this feature exists
Destructible blockers are the fourth approved gameplay-variety direction after:
1. route variety
2. mine-risk variety
3. watch-point variety

They are worth adding because they can create:
- delayed route opening
- midgame attack-timing decisions
- defense reads around future geometry changes
- more match variation without adding full hero / second-resource systems

## Design principles
- Keep the first version narrow
- Map-authored, not procedural
- Readable at a glance
- Optional leverage, not mandatory every game
- Should create timing choices, not one solved script
- Must work with current deterministic simulation model

## First-version recommendation
Implement destructible blockers as neutral map-authored destructible objects that start as impassable and become passable after destruction.

Best first fantasy:
- barricades
or
- dense forest barriers / fallen timber walls

Recommendation:
Use a neutral "barrier" object first.
It is easier to read mechanically than pretending ordinary tree tiles are selectively destructible.
Visual theme can still be wooden barricade / forest debris.

## What the blocker should do
### Initial state
- Occupies fixed map tiles
- Blocks movement
- Can be attacked by both players
- Does not move
- Does not retaliate
- Has visible health state if possible

### Destroyed state
- Stops blocking movement
- Leaves behind passable ground or clear rubble state
- Remains visually understandable for a short time or permanently as broken debris

## Intended gameplay role
The blocker should sit on a secondary route or latent shortcut.

It should not:
- seal the only usable path between players
- hard-gate core mining access
- create mandatory "hit blocker at minute X" flow

It should:
- open an alternative angle
- threaten backline exposure
- reward scouting and timing
- create real uncertainty about where the next attack comes from

## Placement rules
Use blockers only where all of the following are true:
- Main route still exists without breaking the blocker
- Blocker opens a meaningful but not unstoppable alternative route
- The opened path does not instantly invalidate defender reaction time
- The blocker is contestable if the opponent wants to stop or punish the break attempt
- The route remains readable on minimap and main view

Avoid placing blockers:
- directly in front of starting bases
- on top of essential worker paths
- on the only path to a key expansion
- where ranged units can break them for free from completely safe positions

## Recommended first pass scope
### Phase 1
- Add blocker support to simulation and rendering
- Author 1 to 2 blockers on only 1 or 2 maps
- Use them on maps that already have strong route identity

Best candidates from current pool:
- `map05` / Timber Lanes
- `map06` / Crown Pit

Why:
- both already have meaningful route structure
- blocker openings would amplify existing map identity instead of inventing a new one from nothing

## Balance target for v1
A blocker should feel like:
- useful enough that players sometimes choose to break it
- slow or exposed enough that skipping it is still valid

If players break it every game at the same timing, it is too central.
If players never touch it, it is too weak or too irrelevant.

## Suggested baseline stats for first test
These are starting hypotheses, not final numbers.

### Barrier v1 target profile
- HP: medium-high, enough that a tiny early poke does not trivialize it
- Armor: low or zero for readability
- Damage: none
- Range: none
- Sight: none or minimal
- Supply / economy impact: none
- Ownership: neutral

Practical tuning goal:
- a small early force can start breaking it, but doing so costs real time and map presence
- a committed midgame force can open it deliberately as part of a timing push

## Engine implications
This is not just map editing. It needs simulation support.

## Required data-model changes
Need a neutral destructible entity type, for example:
- `barrier`
or
- `neutral_blocker`

It should live in the same resolved-balance / blueprint logic as other entities where practical.

Likely data requirements:
- kind
- hp / max hp
- tile size
- passability interaction
- optional death visual state
- optional map-authored id or placement metadata

## Map authoring changes
Current maps are tile-authored.
Blockers can be added in one of two ways:

### Option A, tile-level special marker
A tile kind or tile flag means "spawn blocker here".

Pros:
- simple to place on maps

Cons:
- mixes entity logic into terrain authoring
- harder to support multi-tile blocker objects cleanly

### Option B, map-authored neutral entity placements
Each map exports a list of blocker placements, similar in spirit to gold mine coordinates.

Pros:
- cleaner long-term model
- easier to support size, hp, and variants
- better separation between terrain and destructible objects

Recommendation:
Use **Option B**.
Destructible blockers behave more like neutral entities than terrain.

## Simulation tasks
### 1. Spawn blockers from map data
At map initialization, instantiate blocker entities from the map definition.

### 2. Make blockers targetable
Combat / targeting code must allow units to attack blockers when commanded or when blockers are the chosen attack target.

### 3. Path blocking while alive
Alive blockers must count as obstacles for movement/pathing.

### 4. Remove blocking on death
When blocker HP reaches zero:
- entity dies
- occupied tiles become traversable again
- pathing naturally updates through existing occupancy checks

### 5. Deterministic death behavior
Destruction must stay deterministic across lockstep multiplayer.
No client-side-only terrain mutation shortcuts.

## Rendering tasks
Need a clear visual distinction for:
- intact blocker
- damaged blocker, optional but useful
- destroyed state, rubble or clear ground

Readability rules:
- should be visible from normal gameplay zoom
- should not be confused with ordinary trees / rocks unless that is extremely clear
- if damaged visuals are expensive, use at least a health bar or obvious crack state

## UI / command behavior
Minimum viable behavior:
- player can attack-command the blocker
- blocker can be selected or at least hovered as a valid target
- if selected, show HP

Nice-to-have later:
- dedicated tooltip like "Destructible Barrier"
- minimap hint if readability needs it

## AI implications
AI must not ignore blockers forever and must not suicide into them blindly.

Minimum v1 AI behavior:
- do nothing special by default
- only attack blockers if they are directly commanded by scripted test logic or if a future dedicated rule is added

Recommended next step after first manual tests:
- add a narrow heuristic so AI may attack a blocker when it meaningfully shortens path to enemy or key target

Important:
Do not add ambitious blocker-strategy AI before human playtests prove the mechanic is worth it.

## Networking / determinism implications
Because LW2B uses deterministic multiplayer logic, blocker support must obey the same simulation rules as unit combat.

Must be true:
- blocker spawn is map-determined
- blocker HP changes only through synchronized commands / combat resolution
- blocker death and path opening happen on the same tick across peers

## Integration with balance system
The current balance system already supports base blueprints plus race-specific tuning overlays.
That is a good fit for blocker stats if blockers are represented as a normal entity kind.

Recommendation:
- define blocker base stats in `balance/base.ts`
- resolve through current balance resolver like other entities
- keep blocker tuning centralized so future tests can adjust HP or size in one place

This also aligns with the existing direction where human farm supply was moved into tuning for easier testing.

## Review of current balance system for future fast tests
The balance system is already moving in the right direction.

### Good now
- base entity blueprint layer exists
- race-specific tuning overlay exists
- runtime resolves final stats from base + race profile + tuning
- practical faction tweaks can already be made in a compact file like `src/balance/tuning.ts`

### What is still missing for really fast manual iteration
For future test workflows, the easiest improvement would be:
- keep all temporary live-test knobs in one small dedicated file
- group them by race / entity / feature
- avoid having test numbers spread across map files and multiple balance modules unless necessary

### Recommended next cleanup after blocker work starts
Create a clearer test-facing tuning structure, for example:
- `src/balance/tuning.ts` remains the single quick-edit entry point
- add comments / sections for:
  - unit tuning
  - building tuning
  - faction tuning
  - neutral entity tuning

If blocker stats arrive, this file becomes even more valuable as a manual test surface.

## Anti-patterns to avoid
Do not do these in v1:
- no blocker abilities
- no blocker loot rewards
- no blocker ownership conversion
- no explosion chains
- no map-wide blocker spam
- no blocker that is required every game to access the core map

## Success criteria for the first implementation
The first blocker pass is successful if:
- it works deterministically online
- it is readable immediately
- players sometimes choose to break it and sometimes ignore it
- it creates at least one real new attack timing without making the map feel scripted

## Proposed implementation order
1. Add blocker entity kind and base balance definition
2. Add map-level blocker placement support
3. Add spawn + occupancy + death/unblock simulation logic
4. Add rendering and minimal UI readability
5. Hand-author blockers on 1 or 2 maps only
6. Live-test manually
7. Tune HP / placement before any AI sophistication

## Recommendation
Do not start with a broad blocker rollout across the whole map pool.
Ship the mechanic narrowly on a small number of maps, validate that it genuinely adds route-timing variety, then expand only if it proves itself.
