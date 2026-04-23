# LW2B Simulation Mode Design (2026-04-23)

## Goal

Add a third playable mode for offline matches:

- existing offline skirmish: human vs AI
- online match: human vs human
- new simulation mode: AI vs AI with the local user acting only as an observer

This mode should work both as:

- a player-facing "watch bots fight" feature
- an internal QA / balance / pathing observation tool

The key requirement is that this should be a real mode, not a fragile special-case hack on top of the current human-vs-AI flow.

## Product definition

In simulation mode, the local user should be able to:

- choose a map
- choose race for side A
- choose race for side B
- choose AI difficulty for side A
- choose AI difficulty for side B
- start the match and observe only

During the match, the observer should have:

- full map visibility
- free camera movement
- minimap navigation
- no command issuing
- no building placement
- no unit selection as a gameplay input path

The local user is not a participant in the match outcome.
They are an observer.

## Scope for v1

### In scope

- new match mode selectable from menu flow
- AI vs AI offline match startup
- per-side race selection
- per-side AI difficulty selection
- observer-only runtime behavior
- full visibility rendering in simulation mode
- correct end-of-match state for an observer
- preservation of existing offline skirmish behavior
- preservation of existing online mode behavior

### Explicitly out of scope for v1

- replay system
- save/load match state
- observer HUD with deep telemetry
- pause timeline UI
- fast-forward / speed controls
- follow-player / follow-army camera modes
- online spectator support
- more than two active sides

These can be added later if the base simulation-mode architecture stays clean.

## Recommended architecture

For v1, prefer a narrow implementation over a broad universal control-model refactor.

Current code still carries human-first assumptions in several places, especially around:

- owner `0` as the local player
- owner `1` as the AI/opponent
- fog being computed only for "my" side
- result wording framed as victory/defeat for the local participant

The right move for this pass is to introduce only the minimum new structure needed to support simulation mode safely.

Recommended v1 direction:

- add a match mode flag in `GameOptions`, for example:
  - `offline_skirmish`
  - `offline_simulation`
  - `online_pvp`
- add simulation-only side config, for example:
  - `simSides: [{ race, aiDifficulty }, { race, aiDifficulty }]`
- keep `myOwner` as an internal technical anchor where useful
- treat simulation as an observer-only runtime branch rather than a whole-project role-model rewrite

This keeps the implementation small, focused, and low-risk while still leaving room for a cleaner generalized control model later if the feature proves valuable.

## Why this v1 shape is preferable

It keeps simulation mode from becoming a one-off hack, but also avoids overengineering:

- input gating is still straightforward
- render rules can distinguish observer from participant cleanly
- result screen logic can avoid fake "victory/defeat" framing for a non-player
- online code stays untouched
- fog storage does not need a redesign
- future additions like pause, speed, HUD overlays, or demo mode remain possible

## Runtime design

### Startup

Simulation mode should:

- build the world normally
- spawn both starting bases normally
- create two AI controllers, one per side
- skip local-player gameplay control paths
- initialize camera to a sensible neutral or side-A start location

A practical v1 default is to start the camera near side A's base, while still allowing free movement immediately.

### AI ticking

Current offline mode creates a single AI controller and ticks AI once.
Simulation mode should instead:

- maintain one AI controller for owner 0
- maintain one AI controller for owner 1
- tick both each offline sim step

This should be implemented in a way that does not alter online mode, where AI remains disabled.

### Fog / visibility

Current fog state is computed for one player owner and the renderer uses that fog state for world and minimap visibility rules.

For v1, the safest approach is:

- keep existing fog logic intact for normal skirmish and online play
- add observer-aware render behavior in simulation mode
- when local view role is `observer`, render world/minimap with full visibility instead of trying to force a merged fog state

This is preferable to redesigning shared fog storage during the first implementation pass.

### Input model

Simulation mode should disable gameplay-affecting input paths:

- no movement orders
- no attack orders
- no gather orders
- no build orders
- no production clicks
- no opening-plan choice input if that is only intended for human-controlled players

Allowed observer inputs in v1:

- camera movement
- minimap navigation
- return to menu
- any already-safe non-gameplay UI navigation

### Result framing

Current result framing likely assumes the local user wins or loses.
Simulation mode should instead use observer-neutral wording such as:

- Humans win
- Orcs win
- Side A wins
- Side B wins

Exact wording can be chosen later, but it should not pretend the observer personally won or lost.

## File-level implementation areas

### `src/types.ts`

Likely additions:

- `GameMode` type for:
  - `offline_skirmish`
  - `offline_simulation`
  - `online_pvp`
- simulation-side config type with:
  - `race`
  - `aiDifficulty`
- narrow `GameOptions` expansion to carry `mode` and optional `simSides`

Goal: make runtime intent explicit without refactoring the full ownership/control model.

### `src/menu.ts`

Likely work:

- add a third mode selection path
- collect per-side race selection
- collect per-side difficulty selection
- pass expanded match options into `startGame`
- keep existing skirmish and online menu flows intact

This is likely the most visible UI change in v1.

### `src/game.ts`

Likely work:

- switch centrally on `mode`
- keep current offline skirmish path mostly intact
- add simulation branch that:
  - spawns both sides normally
  - creates two AI controllers
  - ticks both in offline simulation
  - disables gameplay command/input paths for the observer
  - keeps only safe observer controls like camera/minimap/menu
- adjust camera startup if needed
- update result-state wording selection

This is the core integration file for the feature.

### `src/render/renderer.ts`

Likely work:

- observer-aware visibility behavior
- minimap full-visibility rendering for simulation mode
- possibly observer-specific overlay text if desired later

The recommended v1 approach is render-side visibility override rather than deep fog-state redesign.

### `src/sim/ai.ts`

Likely work:

- parameterize AI by owner, for example `tickAI(state, ai, owner)`
- remove or fix implicit "AI is always owner 1" assumptions
- route all owner-sensitive reads and writes through the passed owner:
  - `state.races[...]`
  - `state.gold[...]`
  - `state.wood[...]`
  - `state.upgrades[...]`
  - `state.openingPlanSelected[...]`
- confirm opening, defense, target selection, and economy logic work symmetrically for both sides

This is the most important required refactor in the pass, but it should stay local to the AI layer.

### `src/i18n.ts`

Likely work:

- menu labels for simulation mode
- per-side AI labels if needed
- observer-oriented end-state strings

## Main risks

### 1. Human-first assumptions embedded across the stack

The biggest real risk is not conceptual complexity, but scattered assumptions that:

- side 0 is always the local human
- side 1 is always the AI
- local player always participates in win/loss framing

These assumptions may appear in menu logic, selection logic, renderer rules, minimap coloring, startup camera placement, and result overlays.

### 2. Fog/render coupling

Fog computation and visibility rendering are currently closely linked.
A first pass should avoid redesigning fog storage unless necessary.

### 3. UI leakage

Even if commands are blocked at a high level, some UI buttons or selection affordances may still appear active.
Observer mode should not expose misleading gameplay affordances.

### 4. AI owner asymmetry

This is the main technical risk.
`src/sim/ai.ts` appears to be strongly tied to owner `1` in multiple places, so dual-AI will not be reliable until owner-sensitive logic is parameterized cleanly.

### 5. Opening / doctrine / early-choice systems

If any early-match systems assume a human participant on one side, those assumptions must be either disabled or generalized for AI-vs-AI startup.

## Acceptance criteria for v1

The feature should be considered complete for v1 when all of the following are true:

1. A user can start a simulation-mode match from the menu.
2. The user can configure both sides with independent race and difficulty choices.
3. Both sides are actively controlled by AI throughout the match.
4. The local user cannot issue gameplay commands.
5. The full map is visible for the observer, including minimap readability.
6. The match resolves to a correct observer-facing outcome.
7. Standard offline skirmish still works as before.
8. Online mode still works as before.
9. No determinism-sensitive online code paths are unnecessarily touched.

## Recommended implementation order

### Phase 1: AI refactor first

- parameterize `src/sim/ai.ts` by owner
- confirm dual-AI ticking is technically viable before broader UI work
- keep this refactor local and do not mix it with net or renderer changes

### Phase 2: runtime support

- extend `GameOptions` with narrow `mode` support
- add AI-vs-AI startup in `src/game.ts`
- create and tick two AI controllers in simulation mode
- gate observer gameplay input and UI actions

### Phase 3: observer rendering

- add full-visibility render/minimap behavior for observer mode
- fix observer-facing result framing

### Phase 4: menu flow

- add simulation entry path in `src/menu.ts`
- add per-side race/difficulty configuration
- thread final simulation options into startup

### Phase 5: verification

- smoke test all menu entry paths
- smoke test normal skirmish
- smoke test online startup remains intact
- watch at least one full AI-vs-AI match per race pairing if practical
- confirm no misleading gameplay UI remains active in observer mode

## Recommendation

Proceed with a narrow v1 implementation.
Do not mix this pass with replay systems, speed controls, deep observer telemetry, or a broad controller-model rewrite.

The right goal is:

- narrow mode foundation in `GameOptions`
- owner-parameterized AI that can run for either side
- correct AI-vs-AI runtime
- correct observer UX
- no regression to existing skirmish/online flows
