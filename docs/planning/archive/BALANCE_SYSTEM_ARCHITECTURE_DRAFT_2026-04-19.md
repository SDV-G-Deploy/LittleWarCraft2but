# LittleWarCraft2but Balance System Architecture Draft

Date: 2026-04-19
Status: working architecture draft
Purpose: turn current ad-hoc balance logic into a deterministic-safe, data-driven, experiment-friendly system

---

## 1. Problem statement

Current project state is good enough for targeted balance edits, but not yet good enough for fast iteration.

Right now balance logic is split across:
- `src/data/units.ts` for base stats
- `src/data/races.ts` for race mapping and labels
- `src/sim/combat.ts` for combat-time bonus logic
- `src/sim/economy.ts` for opening bonuses, train timing changes, gather bonuses, pressure movement bonuses
- `src/sim/entities.ts` for race-specific wall HP override
- `src/render/ui.ts` for role and explanatory text
- markdown docs for design intent and patch notes

This creates 5 problems:

1. hard to know the true source of a unit's effective behavior
2. hard to run experiments cleanly
3. easy to forget hidden special cases
4. docs and code drift apart
5. balance changes risk turning into combat/economy code edits instead of data edits

The goal is **not** a giant engine rewrite.
The goal is to build a thin balance system layer above the deterministic sim.

---

## 2. Design goals

The balance system should be:

- deterministic-safe
- typed
- data-driven
- easy to inspect
- easy to diff
- easy to experiment with
- explicit about why a bonus exists
- able to support faction identity, openings, and contextual modifiers

The sim should remain the execution engine.
The balance layer should define what numbers and modifiers the sim executes.

---

## 3. Target architecture

Use a 4-layer model.

## Layer A. Core simulation
Files already present:
- `src/sim/*`
- `src/net/*`
- `src/game.ts`

Responsibilities:
- movement
- command application
- pathfinding
- combat execution
- economy execution
- deterministic state transitions

This layer should avoid owning design intent directly.
It should ask the balance layer for resolved values.

## Layer B. Balance data model
New directory:
- `src/balance/`

Responsibilities:
- define base entity blueprints
- define race profiles
- define opening profiles
- define contextual modifier rules
- define optional presets for experiments

This layer is the source of truth for balance.

## Layer C. Balance resolver
New files in `src/balance/`

Responsibilities:
- merge base blueprint + race overrides + context modifiers
- return resolved effective stats and active bonuses
- provide one canonical path for sim and UI to ask "what are this entity's effective stats right now?"

## Layer D. Design ops / experiment tooling
New docs and scripts.

Responsibilities:
- generate matchup tables
- compare presets
- document patch hypotheses
- reduce accidental drift between design intent and implementation

---

## 4. Proposed file structure

```text
src/
  balance/
    schema.ts
    base.ts
    races.ts
    openings.ts
    modifiers.ts
    presets/
      baseline.ts
      human_hold_v1.ts
      orc_pressure_v1.ts
    resolver.ts
    report.ts
```

Supporting docs:

```text
docs/
  balance/
    patches/
      2026-04-19-human-hold.md
    playtests/
      TEMPLATE.md
```

Optional scripts later:

```text
scripts/
  balance-report.ts
  balance-diff.ts
```

---

## 5. Core schema

This should stay small and explicit.

## 5.1 Blueprint types

### `EntityBlueprint`
Purpose:
- the raw base stats and tags for a unit/building kind

Suggested fields:
- `kind`
- `class: unit | building | resource | scaffold`
- `hp`
- `damage`
- `armor`
- `range`
- `speed`
- `sight`
- `cost`
- `buildTicks`
- `attackTicks`
- `tileW`
- `tileH`
- `tags: string[]`
- `roleText?`

Examples of tags:
- `frontline`
- `backline`
- `worker`
- `heavy`
- `structure`
- `fortified`
- `pressure`

### `RaceBalanceProfile`
Purpose:
- define faction identity overrides that are always true for that race

Suggested fields:
- `race`
- `display`
- `entityOverrides`
- `modifierRules`
- `identityNotes`

Example usage:
- Human wall HP override
- later human structure bonus, if desired

### `OpeningProfile`
Purpose:
- define early-plan effects in one place

Suggested fields:
- `id: eco | tempo | pressure`
- `durationTicks`
- `claimMode`
- `modifiers`
- `description`
- `uiText`

### `ModifierRule`
Purpose:
- formalize every contextual stat or damage modifier

Suggested fields:
- `id`
- `phase: resolveStats | onTrain | onGather | onAttack | onSpawn | ui`
- `when(context) => boolean`
- `apply(payload) => payload`
- `priority`
- `description`

Important note:
The function bodies can remain TS, but the structure must be centralized and named.
The main improvement is not "no code".
The improvement is "all modifier code lives in one model, not scattered across sim files".

### `BalancePreset`
Purpose:
- switch between experimental balance sets without editing core definitions ad hoc

Suggested fields:
- `id`
- `extends`
- `entityPatches`
- `raceProfilePatches`
- `openingProfilePatches`
- `modifierPatches`
- `notes`

---

## 6. Resolver responsibilities

Create one canonical resolver module.

Suggested API:

- `getBaseBlueprint(kind)`
- `getRaceProfile(race)`
- `resolveEntityBlueprint(kind, race)`
- `resolveEntityStats(state, entity)`
- `resolveAttackContext(state, attacker, target)`
- `getActiveOpeningProfile(state, owner)`
- `getActiveModifierRules(context)`

The sim should stop hardcoding special cases where possible.

For example, instead of:
- `combat.ts` computing multiple inline bonuses
- `economy.ts` knowing tempo train multiplier and eco gather bonus directly

It should do something more like:
- ask resolver for effective attack package
- ask resolver for gather modifier
- ask resolver for train-time modifier

This keeps deterministic execution but moves intent into one place.

---

## 7. What should move first

Do **not** refactor everything at once.
Use a staged migration.

## Stage 1. Centralize static stats and race overrides

Goal:
- no behavior change
- establish one truth source

Move into `src/balance/`:
- base stats from `src/data/units.ts`
- race mapping/identity from `src/data/races.ts`
- wall HP override from `src/sim/entities.ts`

Result:
- spawning and UI can resolve effective HP/armor/range from balance resolver
- `src/data/units.ts` can become a compatibility shim temporarily

## Stage 2. Centralize opening plan modifiers

Move from `src/sim/economy.ts` into balance profiles/modifiers:
- eco opening bonus gold
- eco gather bonus
- tempo training speed bonus
- pressure first unit speed boost
- pressure first-unit attack-move commit
- opening lock duration

Result:
- opening behavior is readable as a design object, not hidden constants

## Stage 3. Centralize combat modifiers

Move from `src/sim/combat.ts` into named modifier rules:
- worker pressure bonus
- construction pressure bonus
- contested mine bonus
- opening pressure bonus
- any future structure or line-holding bonuses

Result:
- combat.ts becomes simpler and more generic

## Stage 4. Make UI read from resolver, not mixed local heuristics

Move role and explanation descriptors into balance data where possible.

Result:
- UI descriptions stay synced with actual balance identity

## Stage 5. Add reports and preset comparison

Add scriptable outputs:
- matchup matrix
- cost efficiency report
- preset diff report

Result:
- easier iteration and less guesswork

---

## 8. Recommended concrete file contents

## `src/balance/schema.ts`
Contains:
- shared types
- interfaces for blueprint, profile, modifier, preset, resolve context

## `src/balance/base.ts`
Contains:
- all base entity definitions
- tags and role descriptors

Example:
- footman tagged `frontline`, `disciplined`, `hold`
- grunt tagged `frontline`, `shock`, `pressure`
- archer tagged `backline`, `support`, `positional`

## `src/balance/races.ts`
Contains:
- Human profile
- Orc profile
- display identity and permanent race-level overrides

Example:
- human wall hp override
- future structure-specific or reinforcement-specific identity rules

## `src/balance/openings.ts`
Contains:
- eco/tempo/pressure definitions
- lock durations
- what commitment means
- which modifiers activate

## `src/balance/modifiers.ts`
Contains named rules such as:
- `eco_opening_gather_bonus`
- `eco_opening_first_return_bonus`
- `tempo_opening_first_train_time_bonus`
- `pressure_opening_first_unit_speed_bonus`
- `pressure_opening_first_contact_damage`
- `anti_worker_pressure_bonus`
- `construction_break_bonus`
- `contested_mine_clash_bonus`

## `src/balance/presets/baseline.ts`
Contains current default balance

## `src/balance/resolver.ts`
Contains the actual merging logic and stable helpers for sim/UI

## `src/balance/report.ts`
Contains pure calculation helpers for:
- TTK
- DPS vs target
- HP-per-gold
- attack breakpoints
- matchup summaries

This file should be usable from a script or test harness.

---

## 9. Determinism rules for the balance system

This part is critical.

The balance layer must remain deterministic.
Therefore:

1. no wall-clock time
2. no randomness unless seeded and already part of shared sim state
3. no iteration over unordered object keys if outcome depends on order
4. no modifier using environment/local platform conditions
5. all active modifier decisions must depend only on shared game state and command history

Safe inputs:
- entity kind
- owner
- owner race
- current tick
- opening selection state
- map/entity positions
- target kind
- build state
- contested area checks computed from shared state

Unsafe inputs:
- local UI state
- browser-only runtime info
- non-replicated debug flags

---

## 10. What not to do

Avoid these traps:

### Trap 1. Giant over-engineered rules engine
Do not build a general-purpose RPG status-effect platform.
The game is still small. Keep the model explicit.

### Trap 2. Pure JSON everywhere
Do not move everything into untyped JSON too early.
Use typed TS first. Validation can come later.

### Trap 3. Full rewrite in one pass
Too risky for deterministic sim and too slow.
Use staged migration.

### Trap 4. Hiding design intent in comments only
If a bonus exists for faction identity, opening identity, or harassment shaping, encode that in the profile/modifier naming.

---

## 11. First concrete migration pass I recommend

If doing this incrementally, the best first real implementation pass is:

### Pass A. Balance foundation

Deliverables:
- create `src/balance/schema.ts`
- create `src/balance/base.ts`
- create `src/balance/races.ts`
- create `src/balance/resolver.ts`
- move current static stats and human wall override into that system
- keep current sim behavior unchanged
- adapt spawn/UI/combat to read through resolver where simple
- keep `src/data/units.ts` only as a temporary shim if helpful

Why this first:
- highest leverage
- low conceptual risk
- sets the shape for everything else
- does not yet force a deep opening/combat modifier migration

### Pass B. Opening system migration

Deliverables:
- add `src/balance/openings.ts`
- move opening constants and train/gather modifiers out of `economy.ts`
- resolver helper functions for opening-plan effects

### Pass C. Combat modifier migration

Deliverables:
- add `src/balance/modifiers.ts`
- centralize attack bonuses and contextual damage logic

### Pass D. Report tooling

Deliverables:
- `scripts/balance-report.ts`
- generate markdown or console tables from current preset

---

## 12. Suggested operating workflow after migration

For each future balance pass:

1. create or update a patch note in `docs/balance/patches/`
2. edit balance data, not scattered sim logic
3. run build
4. run balance report
5. if sim-sensitive behavior changed, do targeted determinism review
6. playtest against checklist
7. update balance table / verdict

This creates a repeatable balance process instead of ad-hoc tweaks.

---

## 13. Playtest checklist template

Use a short stable checklist after each meaningful balance pass:

- Human eco vs Orc tempo
- Human wall + archer hold
- open-field Footman/Grunt contact
- Archer/Troll spacing behavior
- contested mine first clash
- Knight/Ogre parity in mixed armies
- does one opening become obviously dominant?

Record:
- expected
- observed
- surprising side-effect
- next action

---

## 14. Short verdict

The right next step is **not** more one-off number tweaking.
The right next step is a **balance foundation refactor** that creates:

- one source of truth
- one stat resolver
- named opening/modifier rules
- experimental presets
- report tooling

That is the smallest system that will let LittleWarCraft2but evolve safely and quickly.
