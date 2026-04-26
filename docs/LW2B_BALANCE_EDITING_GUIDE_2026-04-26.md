# LW2B balance editing guide — 2026-04-26

Purpose:
- document where unit/building stats and costs actually live now
- make future balance passes faster
- give a clear manual editing path for quick experiments without needing an assistant loop every time

---

## 1. Current source of truth

The actual balance source of truth is code under:

- `src/balance/base.ts`
- `src/balance/races.ts`
- `src/balance/tuning.ts`
- `src/balance/resolver.ts`

Important:
- `BALANCE_TABLE_2026-04-19.md` is a working snapshot / design sheet, not the live runtime source of truth
- the game uses resolved values from the balance layer, not markdown tables

Resolution order:

1. `base.ts`
2. race-specific overrides from `races.ts`
3. experiment / local tuning overrides from `tuning.ts`
4. merged final values via `resolver.ts`

So the effective runtime stat is:

`base value + race override + tuning override`

---

## 2. What each file is for

### `src/balance/base.ts`
Main balance database.

This file holds the base authored values for entities, including:
- HP
- damage
- armor
- range
- speed
- sight
- cost `{ gold, wood }`
- build time via `buildTicks`
- attack speed via `attackTicks`
- tile size
- supply provided
- tags / role text
- attack / LOS policy metadata

Edit this file when:
- you want to change the baseline value for a unit or building everywhere
- the stat is not meant to be race-specific only
- you are making a foundational balance change

Examples:
- footman base hp
- grunt base damage
- barracks base gold/wood cost
- tower base build time

### `src/balance/races.ts`
Race identity and race-specific overrides.

This file holds:
- race display names and labels
- race-specific entity overrides
- race-specific upgrade definitions
- race identity notes

Edit this file when:
- Human and Orc should intentionally differ
- the difference is part of faction identity
- you are tuning race upgrades

Current examples already in use:
- Human wall HP override
- Human tower stats override
- Orc tower stats override
- Human / Orc upgrade scaling and costs

### `src/balance/tuning.ts`
Thin experiment override layer.

This file is the best current place for fast manual tweaks.
It already supports per-race per-entity stat overrides and is merged after `base.ts` and `races.ts`.

Current examples in use:
- Human farm wood cost override
- Orc farm wood cost override
- Human / Orc lumbermill wood cost override

Edit this file when:
- you want a quick temporary test
- you want to avoid touching the larger base balance file
- you are comparing a few combinations during playtest

### `src/balance/resolver.ts`
Merge and final resolution logic.

This is not the main place to author balance numbers.
This file merges:
- base blueprint
- race override
- tuning override

Edit this file only when:
- the merge behavior itself should change
- a new balance layer or rule is being introduced
- the data model is expanding

Normally, balance edits should not start here.

---

## 3. Practical map: where to edit each parameter type

### Unit core stats
Edit:
- usually `src/balance/base.ts`
- sometimes `src/balance/races.ts`
- for quick experiments `src/balance/tuning.ts`

Parameters:
- `hp`
- `damage`
- `armor`
- `range`
- `speed`
- `sight`
- `attackTicks`
- `buildTicks`
- `cost.gold`
- `cost.wood`

### Building core stats
Edit:
- usually `src/balance/base.ts`
- race differences in `src/balance/races.ts`
- fast tests in `src/balance/tuning.ts`

Parameters:
- `hp`
- `armor`
- `range` for towers
- `damage` for towers
- `sight`
- `buildTicks`
- `cost.gold`
- `cost.wood`
- `supplyProvided`

### Race-specific identity pieces
Edit:
- `src/balance/races.ts`

Examples:
- Human wall HP
- Human vs Orc tower behavior
- upgrade magnitude per level
- upgrade max levels
- upgrade costs

### Quick economy / cost experiments
Best edit target:
- `src/balance/tuning.ts`

Good examples:
- farm cost changes
- lumbermill cost changes
- barracks timing or cost experiments
- wood-tax tuning for a race

### Display / labels only
Edit:
- `src/balance/races.ts`

Examples:
- `workerLabel`
- `soldierLabel`
- `towerLabel`
- `description`

---

## 4. Best current manual workflow for fast balance tests

If you want to test small balance variations yourself without touching too much code:

### Recommended workflow now
1. Change values in `src/balance/tuning.ts`
2. Run:
   - `npm run balance:sheet`
3. Check the generated terminal table for final merged values
4. Run the game / build / local test pass
5. Iterate on `tuning.ts`

Why this is the safest current operator path:
- smallest surface area
- easiest to diff
- least likely to break the broader balance structure
- keeps experiments separate from the base authored numbers

---

## 5. What is currently missing

The project does not yet have a fully ergonomic external balance table such as:
- one dedicated JSON file
- one CSV / spreadsheet import
- one compact all-entity tuning file covering all commonly changed stats

Right now the system is data-driven, but still code-authored.
That means manual editing is already possible, but it is not yet optimized for ultra-fast non-engineer iteration.

---

## 6. Recommended improvement path

If we want truly fast balance testing for future passes, the cleanest next step is:

### Option A. Expand `src/balance/tuning.ts` into the main operator panel
Recommended first improvement.

Target shape:
- one compact override object
- all commonly tuned fields allowed there
- one section per race
- one section for shared/global entity overrides

Why this is good:
- minimal architecture change
- no format migration required
- preserves current resolver model
- easiest short path to practical usability

Suggested goal:
- make `tuning.ts` the single file a designer can edit for 80 to 90 percent of balance experiments

### Option B. Add external balance data files
For example:
- `src/balance/tuning.shared.json`
- `src/balance/tuning.human.json`
- `src/balance/tuning.orc.json`

Pros:
- even easier manual editing
- possible future spreadsheet export/import

Cons:
- requires validation / loading layer
- more moving parts
- slightly larger deterministic-safety surface

Recommendation:
- do Option A first
- only move to external JSON tables if tuning frequency grows enough to justify it

---

## 7. Concrete future task to request

If you want this improved in a later pass, the request can be framed as:

> LW2B: improve the balance editing workflow so I can tweak unit/building stats from one compact manual table without touching multiple source files

Recommended implementation direction for that task:
- keep `base.ts` as stable baseline truth
- expand `tuning.ts` into a fuller operator-facing override table
- optionally add one generated docs view or exported markdown snapshot
- keep `balance:sheet` as the final verification command

---

## 8. Current verification command

Use:

```bash
npm run balance:sheet
```

This prints the effective merged balance sheet, including:
- unit stats
- building stats
- costs
- timings
- supply
- upgrade definitions

This is the best quick correctness check after manual edits.

---

## 9. Short operational summary

If changing balance manually right now:

- baseline numbers live in `src/balance/base.ts`
- race-specific differences live in `src/balance/races.ts`
- fastest safe manual tweaks should go into `src/balance/tuning.ts`
- final resolved values can be checked with `npm run balance:sheet`

For future UX improvement:
- promote `src/balance/tuning.ts` into the primary compact balance control table
- keep all deep architecture under the current resolver pipeline
