# Balance System Execution Plan

Date: 2026-04-19
Project: LittleWarCraft2but
Purpose: implement a balance-system foundation safely in small passes

---

## Goal

Turn the current ad-hoc balance logic into a deterministic-safe, data-driven balance layer without breaking the existing sim.

Target outcome:
- one source of truth for stats and race overrides
- one resolver for effective stats
- future opening/combat modifiers can migrate into named balance rules
- easier experiments and balance reports later

---

## Recommended execution order

## Commit 1. Balance schema + base data scaffold

### Deliverables
- create `src/balance/schema.ts`
- create `src/balance/base.ts`
- create `src/balance/races.ts`
- move current entity stat definitions into balance base data
- move permanent race-level identity overrides into balance race profiles
- keep behavior unchanged

### Constraints
- no gameplay change intended
- existing sim still allowed to consume old `src/data/units.ts` if needed temporarily
- this commit is about structure, not migration completeness

### Success criteria
- project builds
- new balance data layer exists and matches current values
- no sim behavior intentionally changed

---

## Commit 2. Balance resolver + compatibility shim

### Deliverables
- create `src/balance/resolver.ts`
- add helpers such as:
  - `resolveEntityStats(kind, race)`
  - `resolveEntityStatsForEntity(state, entity)`
  - `resolveRaceProfile(race)`
- adapt `src/data/units.ts` into a compatibility shim or thin forwarder where useful
- move human wall HP override logic out of `src/sim/entities.ts` into resolver-driven stat resolution

### Constraints
- keep runtime behavior unchanged
- do not refactor opening/combat modifier logic yet
- minimize churn in sim files

### Success criteria
- spawn path uses resolved stats rather than local exception logic
- UI can read effective values from the same source
- build passes

---

## Commit 3. Read-path migration in sim/UI

### Deliverables
- update the simplest read sites to use resolver instead of raw `STATS` where appropriate:
  - spawn/init stat reads
n  - armor/hp/range display reads
  - ticks-per-step source if cleanly possible
- reduce direct stat lookups that bypass race/profile resolution
- keep behavior unchanged

### Constraints
- no opening logic migration yet
- no combat modifier migration yet
- avoid touching network command semantics

### Success criteria
- most stat reads now flow through one system
- no hidden race-specific stat exception remains in sim files
- build passes

---

## Commit 4. Opening profile migration

### Deliverables
- create `src/balance/openings.ts`
- move opening constants and definitions from `src/sim/economy.ts` into opening profiles
- expose helper APIs from resolver or opening module for:
  - eco gather bonus
  - eco first return bonus
  - tempo first train-time bonus
  - pressure first unit movement/commit behavior
  - opening lock duration
- replace inline economy constants with named balance accessors

### Constraints
- preserve exact current opening behavior first
- do not redesign opening balance in this pass
- if deterministic behavior risk appears, do targeted review

### Success criteria
- `economy.ts` no longer owns opening-balance constants directly
- opening logic is readable from one place
- build passes

---

## Commit 5. Combat modifier migration

### Deliverables
- create `src/balance/modifiers.ts`
- move combat bonus logic from `src/sim/combat.ts` into named modifier rules/helpers:
  - worker pressure bonus
  - construction damage bonus
  - contested mine bonus
  - opening pressure bonus
- have combat ask the balance layer for resolved attack bonuses instead of assembling them inline

### Constraints
- preserve behavior first
- keep deterministic-safe ordering and calculations
- mandatory targeted sanity review after this pass

### Success criteria
- combat bonus sources are centralized and named
- `combat.ts` becomes simpler and more generic
- build passes
- targeted review passes

---

## Commit 6. Reporting / ops layer

### Deliverables
- create `src/balance/report.ts`
- add script entry for balance report generation
- support outputs like:
  - matchup matrix
  - TTK table
  - DPS vs target
  - hp-per-gold / damage-per-gold snapshots
- optionally support preset diff reporting later

### Constraints
- pure calculations only
- no runtime gameplay impact

### Success criteria
- balance analysis can be regenerated from code
- future tuning is easier and less manual

---

## Guardrails

### Always preserve determinism
No balance resolution may depend on:
- local browser-only state
- wall-clock time
- unordered iteration with outcome-sensitive order
- non-replicated flags

### Keep passes narrow
Each commit should either:
- restructure data access, or
- move one logic cluster into the balance layer

Not both plus extra design changes at the same time.

### Prefer compatibility shims during migration
Temporary forwards are good.
Large rewrites are not.

### If a pass touches online-sim-sensitive behavior
Do:
- `npm run build`
- targeted sanity review

---

## Practical stopping points

Good stop after Commit 2:
- balance foundation exists
- wall override no longer scattered
- future work has a safe landing zone

Good stop after Commit 4:
- openings become readable and systematized
- balance iteration speed improves a lot

Good stop after Commit 6:
- system is usable for repeatable balancing work

---

## Recommended implementation style

- small clean commits
- preserve behavior before improving behavior
- prefer explicit naming over generic abstraction
- optimize for clarity first, cleverness second

---

## Short execution summary

1. Build balance schema and data layer
2. Add resolver and move race overrides there
3. Migrate stat read paths
4. Migrate opening logic
5. Migrate combat modifiers
6. Add report tooling

That is the safest path to a real balance system.
