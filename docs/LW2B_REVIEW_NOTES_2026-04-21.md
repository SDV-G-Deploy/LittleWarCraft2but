# LW2B Review Notes — 2026-04-21

This note records a direct in-repo code review and mechanic review pass.

It is intentionally practical.
It does not try to restate the whole project.
It captures the highest-value concrete findings that should shape the next cleanup and validation passes.

## Top 10 concrete review findings

### 1. `src/render/ui.ts`
Upgrade presentation is not fully aligned with the new balance-system direction.

Current issue:
- `getUpgradeTargetHint`
- `compactUpgradeTargetHint`
- small display helpers still hardcode race-specific target summaries

Why it matters:
- balance data already knows upgrade groups
- UI can still drift and lie after future unit additions or retunes

Recommendation:
- generate upgrade target summaries from resolved data / `upgradeGroups`
- keep UI as a consumer of balance metadata, not a second rules source

### 2. `src/render/ui.ts`
Some enemy-resolution logic still uses `owner !== myOwner` where the intended meaning is really opposing player, not any non-self owner.

Why it matters:
- neutral ownership already exists in the project model
- this pattern is fragile for blockers and future neutral map objects

Recommendation:
- introduce explicit helpers for opposing-player lookups
- avoid using broad `owner !== myOwner` for gameplay-semantic decisions

### 3. `src/render/ui.ts`
Displayed attack calculation currently uses a synthetic target owner flip for bonus preview:
- `owner: e.owner === 0 ? 1 : 0`

Why it matters:
- this is clever but brittle
- it assumes a two-player-only hostility shortcut instead of semantic target typing

Recommendation:
- move displayed attack preview toward target-class-aware or generic resolved-preview logic
- avoid owner-flip shortcuts in UI calculations

### 4. `src/sim/ai.ts`
AI target helpers still hardcode player-side assumptions around `owner === 0` and `(owner === 0 ? 1 : 0)`.

Why it matters:
- the project already introduced `NEUTRAL`
- blocker and future neutral-object interactions become less trustworthy if AI logic keeps old binary owner assumptions

Recommendation:
- add semantic helper functions for player-opponent resolution
- keep AI explicitly player-vs-player while safely ignoring neutral entities where intended

### 5. `src/render/renderer.ts`
Rendering is better about neutral-safe coloring than some UI/sim code, but sprite-owner indexing still assumes player-owned sprite banks for most building/unit visuals.

Why it matters:
- current neutral usage is narrow, so this is acceptable now
- future neutral renderables should not silently reuse player palette assumptions

Recommendation:
- keep neutral render expectations explicit when blockers or future neutral camps expand

### 6. `src/net/netcmd.ts`
The command layer is generally solid, but it still contains a lot of game-rule coupling:
- refunds
- upgrade application
- building HP propagation
- armor propagation

Why it matters:
- this is manageable now
- but future mechanics could make `applyNetCmds` too broad and harder to reason about

Recommendation:
- keep future additions narrow
- avoid turning `netcmd.ts` into a second gameplay hub

### 7. `src/sim/combat.ts`
`processAttack` is carrying multiple responsibilities at once:
- target validation
- LOS/range tests
- chase logic
- cooldown handling
- damage application
- visual event emission

Why it matters:
- the file is still understandable
- but this is a likely future maintenance hotspot

Recommendation:
- split by responsibility only when the next meaningful combat pass needs it
- do not do a cosmetic refactor without a concrete follow-up need

### 8. `src/sim/pathfinding.ts` + `src/sim/commands.ts`
Movement/pathing is in a much better state, but sidestep/repath remains the most sensitive simulation area.

Why it matters:
- current behavior is acceptable
- but this area still depends on deterministic processing discipline and should not accumulate casual tweaks

Recommendation:
- treat move/repath/sidestep as high-risk code
- only touch it for proven gameplay or determinism gains

### 9. `src/balance/modifiers.ts`
Opening differentiation and situational combat bonuses are effective, but the stack of context-sensitive modifiers is starting to become author-driven.

Why it matters:
- each rule is individually reasonable
- together they risk making matches feel too scripted instead of naturally strategic

Recommendation:
- prefer future differentiation through map incentives, route timing, opportunity cost, and production structure before adding more conditional damage windows

### 10. `src/data/maps/map05.ts` and `src/data/maps/map06.ts`
The current map direction is promising, but the combination of:
- rich center value
- contested-mine incentives
- route blockers
- watch-post leverage
can create stacked positional advantage if left unchecked.

Why it matters:
- the biggest remaining gameplay risk is no longer raw bot unfairness
- it is combined-system snowball and over-scripted center timing

Recommendation:
- validate maps as combined systems, not as isolated features
- test whether center control plus route leverage plus objective richness stacks too reliably for one side

## Main architecture conclusion
The highest-value cleanup pass is now:
- **neutral ownership semantic cleanup**

Not because the project is broken today, but because:
- the codebase has already outgrown pure binary owner assumptions
- blockers and future neutral objects need cleaner semantics
- several files still carry old `owner !== myOwner` / `owner === 0` shortcuts

## Main mechanic conclusion
The highest-value design caution is now:
- **avoid over-scripting depth through too many special-case combat bonuses**

The project is strongest when variety comes from:
- map shape
n- route timing
- economic opportunity cost
- composition and positioning

It is weaker when too much variety comes from narrowly-authored bonus windows.

## Recommended next moves
1. Run combined live validation for:
   - doctrines
   - contested mines
   - blockers
   - watch-post leverage
   - center-rich objective stacking
2. Keep UI upgrade summaries moving toward fully data-driven balance metadata
3. Finish the remaining neutral-semantics cleanup in small isolated passes
4. Avoid adding another layer of opening-specific combat bonuses until live tests prove it is needed

## Neutral ownership cleanup status update

### Completed now: `/new` pass 1 — semantic helper layer + highest-risk replacements
What landed:
- 3 small ownership helpers were added in `src/types.ts`
- highest-risk binary-owner shortcuts were cleaned in:
  - `src/sim/ai.ts`
  - `src/render/ui.ts`
  - `src/sim/economy.ts`
- explicit opposing-player resolution now covers the most important:
  - AI assault fallback Town Hall targeting
  - AI nearest enemy-player entity / unit target scans
  - AI contested / expansion mine enemy Town Hall resolution
  - UI gold-mine and rally semantic distance checks
  - UI displayed attack preview owner-flip shortcut
  - economy pressure fallback Town Hall resolution

Result:
- neutral no longer participates accidentally in the main enemy-player lookup paths in those files
- the diff stayed narrow and reviewable
- no balance, pathfinding, opening, or renderer-wide refactor scope was pulled in

### Intentionally not touched in this pass
These are left on later passes on purpose:
- `src/balance/modifiers.ts`
- `src/render/renderer.ts`
- `src/game.ts`
- `src/net/netcmd.ts`
- broad presentation-only wording like generic `PLAYER/ENEMY` labels where semantics were not gameplay-risky
- wider target-typing redesign beyond the small displayed-attack preview cleanup

Reason:
- they were real follow-up candidates, but touching them here would widen scope beyond the intended narrow first pass

## Recommended execution plan for future `/new`

This cleanup should now be finished in **one more small `/new` run**, not expanded into one broad pass.

### `/new` pass 2 — local semantic follow-through
Status: **done**

What landed:
- `src/balance/modifiers.ts`
- contested-mine modifier logic now resolves enemy Town Hall via explicit opposing-player lookup
- a player-only guard keeps neutral from entering that modifier path
- the broad local shortcut `owner !== attacker.owner` was removed from the enemy Town Hall resolution there

What this intentionally did **not** touch:
- `src/render/renderer.ts`
- `src/game.ts`
- `src/net/netcmd.ts`
- presentation-only `PLAYER/ENEMY` wording where semantics were not gameplay-risky
- wider attack-system or target-typing cleanup

Why:
- these are still real follow-up candidates
- but touching them in pass 2 would have widened scope beyond the intended narrow semantic cleanup

Definition of done reached:
- the remaining high-value local semantic enemy-resolution shortcut in `src/balance/modifiers.ts` is now explicit
- neutral no longer leaks into that contested/opening modifier helper path

### `/new` pass 3 — defensive cleanup + sanity sweep
Scope:
- follow through in:
  - `src/render/renderer.ts`
  - `src/game.ts`
  - `src/net/netcmd.ts`
- remove leftover binary-owner shortcuts that remain after passes 1 and 2
- review any still-broad presentation or flow sites that clearly want opposing-player semantics
- do a final consistency sweep for neutral-safe semantics

Explicit non-goals:
- no broad refactor
- no new mechanic layer
- no balance tuning piggybacked onto this cleanup

Definition of done:
- neutral reads as a world-side semantic owner across the reviewed surfaces
- player-only flows stay clearly player-only
- no accidental widening of scope happened during cleanup
