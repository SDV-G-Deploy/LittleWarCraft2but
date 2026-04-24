# LW2B balance system update — 2026-04-21

This note records the late-April 2026 balance and balance-system hardening pass.

## Gameplay balance changes

### Orc tower
- HP reduced from `560` to `500`
- Goal: keep Orc tower as the sturdier short-range defensive tower without making it too efficient at equal cost.

### Orc building HP upgrade
- Wood cost reduced from `100` to `80` per level
- Final path now costs `160 wood` total instead of `200 wood`
- Goal: remove excessive late-game wood tax from Orc defensive scaling.

## Balance-system changes

### 1. Added balance sheet CLI
New script:
- `npm run balance:sheet`

New file:
- `src/balance/balance-sheet-cli.ts`

The report now exposes in one place:
- unit and building stats
- gold / wood costs
- attack range
- sight
- movement speed
- attack/build timing
- supply provided
- target policy
- LOS policy
- upgrade targets

### 2. Added policy fields to balance schema
`src/balance/schema.ts` now supports:
- `targetPolicy`
- `losPolicy`
- `attackProfile`
- `upgradeGroups`

This moves important combat rules into balance data instead of leaving them only in hardcoded combat logic.

### 3. Moved combat behavior into balance data
Entity blueprints now define combat policy directly.
Examples:
- melee units and workers: can attack units / buildings / walls
- ranged units: can attack units only, require LOS
- towers: can attack units only, do not require LOS, elevated attack

### 4. Added upgrade groups
Supported groups:
- `military`
- `melee`
- `ranged`
- `building`

This allows upgrades and derived combat logic to target groups instead of hardcoded unit lists.

### 5. Replaced fragile hardcoded upgrade targeting in gameplay logic
The following systems now rely on upgrade groups and resolved stats instead of manual unit name lists:
- melee attack upgrade bonus
- armor upgrade application
- building HP upgrade application
- displayed attack / armor values in UI
- parts of opening-bonus eligibility checks

## Why this matters

Previously, adding a new unit required updating several separate hardcoded lists across combat, UI, modifiers, and upgrade logic.

Now, if a new unit is assigned the correct `upgradeGroups`, the upgrade pipeline is much less likely to silently miss it.

## Current state after this pass

The balance system is now stronger, but not fully data-driven yet.

Still intentionally left in code for now:
- contested-mine geometry rules
- opening-window logic
- some upgrade target hint text in UI
- special scenario modifiers that depend on map context or timing windows

Review follow-up note:
- the biggest remaining data-driven UI gap is still upgrade target hinting / display helper logic in `src/render/ui.ts`
- future cleanup should keep UI consuming balance metadata instead of maintaining parallel race-specific rule summaries

## Recommended next checks

### Live gameplay checks
- Human tower hold vs Orc tower hold
- Orc defensive timing with cheaper building HP upgrades
- whether Orc remains aggressive without becoming too comfortable in defense
- whether Human tower range advantage still reads clearly on real maps

### Next architecture steps
- generate upgrade target hint text from data instead of race-specific text strings
- optionally move some modifier magnitudes and timing windows into config
- keep an eye on authored modifier growth so balance remains readable and does not turn into stacked special-case combat scripting

## Validation performed
- `npm run build`
- `npm run balance:sheet`

Both passed after this update.
