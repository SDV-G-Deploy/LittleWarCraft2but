# Tower attack fix, 2026-04-20

## Problem
Towers could enter a permanent loop:

- `ATTACKING`
- `CANCEL`
- `ATTACKING`
- `CANCEL`

and never actually fire.

A deeper follow-up also showed tower LOS and range geometry were inconsistent with the intended design for a tall building.

## Root causes

### 1. Invalid auto-target acquisition for towers
`autoAttackPass()` could assign a tower an `attack` command for a target that was visible, but not actually attackable at that moment.

That meant:
- tower acquired target by sight
- `processAttack()` validated actual attackability
- static attacker immediately cancelled when target was out of range or lacked LOS
- next auto-attack pass reacquired the same target
- loop repeated forever

### 2. Multi-tile attacker geometry bug
Tower attack checks were effectively using a single origin tile (`attacker.pos`, top-left) instead of proper footprint-to-footprint geometry.

This created two problems:
- false range / LOS failures for 2x2 towers
- self-blocking LOS cases where the ray passed through another tile of the tower's own footprint

### 3. Tower LOS did not match intended design
Before the fix:
- walls were transparent to LOS
- goldmines were transparent to LOS
- ordinary buildings blocked LOS

That meant towers behaved like low-height ranged attackers for building obstruction, which did not match the intended "high tower shoots over buildings" design.

## Fix applied

### `src/sim/commands.ts`
Auto-targeting for armed buildings now only accepts unit targets that are attackable right now via shared combat validation.

### `src/sim/combat.ts`
Added shared attackability validation and corrected geometry.

Key changes:
- introduced shared `isTargetAttackableNow(...)`
- switched attack validation to footprint-to-footprint distance
- updated LOS checks to test all relevant origin/target footprint tile pairs
- ignored LOS traversal inside the attacker's own footprint
- made `tower` elevated by design: within valid range, towers do not require building-blocked LOS

## Intended post-fix behavior

### Towers
- attack only targets they can actually fire at now
- do not self-cancel loop on visible-but-invalid targets
- use footprint-aware geometry
- can shoot over buildings / objects as a tall structure
- still require valid target type and valid range

### Archers / other ranged units
- still behave as low-height ranged attackers
- walls remain transparent
- ordinary buildings still block LOS

## Design note
This fix intentionally separates tower behavior from regular ranged-unit LOS rules.

That is not an accident. Towers are treated as elevated structures and therefore should not inherit the same obstruction model as archers.

## Validation
- `npm run build` passed after the fix

## Follow-up to consider
Potential remaining cleanup:
- `acquireNearestTarget()` still ranks proximity using top-left to top-left style distance, not full footprint-aware proximity
- this should not reintroduce the firing bug, but may cause suboptimal target priority in edge cases
