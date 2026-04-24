# LW2B AI difficulty pass (2026-04-22)

## Scope

This pass tightened AI behavior differences without adding cheats.

Implemented changes:
- lumber mill placement now prefers tiles close to forest
- tower tech requirement is enforced consistently in backend logic
- easy / medium / hard attack behavior was retuned
- AI upgrade policy now differs by difficulty

## Code changes

Main files touched in this pass:
- `src/sim/ai.ts`
- `src/sim/economy.ts`

Related commits:
- `9b8129a` - `ai: place lumber mill near forest and enforce tower lumber tech`
- `cec8b20` - `ai: tune difficulty behavior thresholds and upgrade policy`

## Behavior summary

### Easy

Easy AI now plays as a defensive map-control opponent.

Current behavior:
- does not make a deliberate assault push onto the enemy Town Hall
- reacts to nearby enemy units locally
- prioritizes economy, expansion opportunities, and holding territory instead of base rushing
- still builds a small army and can defend itself

Practical effect:
- easy should feel less suicidal and less like a weaker version of medium
- it behaves more like a turtling / expanding bot

### Medium

Medium AI is now the baseline "standard match" opponent.

Current behavior:
- enters attack mode only after reaching at least `7` combat units
- if the wave falls below the fallback threshold, returns to military buildup
- researches only about half of the available lumber-mill upgrades

Upgrade policy for medium is deterministic:
- doctrine is still researched first when affordable
- the regular upgrade ladder is traversed in stable order
- medium only takes alternating slots from that ladder

This keeps medium reproducible and intentionally below full optimization.

### Hard

Hard AI is now a stronger macro / tech opponent without cheating.

Current behavior:
- enters attack mode only after reaching at least `9` combat units
- returns to buildup if the active wave is depleted
- can build up to `4` towers
- researches the full upgrade ladder
- keeps the better lumber-mill placement logic from the earlier pass

Practical effect:
- hard commits later, with a denser army and stronger scaling
- its strength now comes more from better pacing and fuller tech use

## Upgrade logic details

The AI now uses the lumber-mill upgrade ladder:
- `meleeAttack`
- `armor`
- `buildingHp`

Difficulty split:
- easy: effectively limited by its passive macro profile and very high attack threshold
- medium: deterministic partial ladder coverage, about 50 percent
- hard: full ladder coverage up to max level

## Structure-placement details

### Lumber mill

Before this pass, the AI used a general-purpose build spot search.

Now:
- lumber mill placement scores legal candidate positions by forest proximity first
- fallback remains the generic build search if no good forest-adjacent spot exists

This reduces worker travel inefficiency for wood drop-off and makes the AI look more intentional.

### Tower prerequisites

Tower construction now requires both:
- `Barracks`
- `Lumber Mill`

This backend check now matches the UI expectation.

## Constraints / known limitations

This was kept intentionally narrow.

Not yet addressed:
- no explicit defense-recall behavior when the AI base is attacked
- tower placement is still generic, not yet "smart defensive placement"
- easy can still enter the assault state internally, but without a directed base-push target
- medium's "half upgrades" rule is simple and deterministic, not situationally optimized

## Recommended next pass

Best next improvement:
1. base defense recall when Town Hall / workers are threatened
2. smart tower placement near base approaches and vulnerable economic areas
3. phase-aware upgrade priorities after defensive logic is in place

That would make the AI feel much more intentional without breaking the no-cheat difficulty philosophy.
