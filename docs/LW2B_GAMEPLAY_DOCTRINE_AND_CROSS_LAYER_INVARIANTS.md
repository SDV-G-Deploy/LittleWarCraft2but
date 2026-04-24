# LW2B gameplay doctrine and cross-layer invariants

Practical reference for future AI, UI, net, and balance passes.
Goal: preserve intended game feel while changing implementation details.

Update note, 2026-04-24:
Movement redesign work should follow the dedicated movement doctrine and redesign docs.
This document only adds high-level gameplay guardrails that movement changes must not violate.

## 1) Faction identity (intended)

### Humans
- More stable and defensive early profile.
- Better reliability around home/contested timing windows.
- Cleaner baseline for eco and tempo branches.

### Orcs
- More brute-force pressure identity.
- Better raw melee scaling path and threat density.
- Should feel heavier and riskier, not "Human with different sprites".

### Identity guardrail
- Race differences should come from timing, scaling profile, and role feel.
- Avoid hard gimmicks that erase decision quality or map play.

## 2) Match pacing feel (early / mid / late)

### Early game
- Opening choice must matter immediately: Eco vs Tempo vs Pressure.
- Contested-mine interaction is the primary early conflict driver.
- Early fights should create readable opportunity cost, not random snowball spikes.

### Mid game
- Expansion, route control, and composition choices become primary.
- Lumber + upgrade timing should meaningfully shape power windows.
- Tactical pressure should reward map decisions more than pure APM spam.

### Late game
- Army composition and upgrade state decide outcomes more than opening bonuses.
- Macro errors should still be punishable; game should not collapse into instant deathballs.
- Closing a lead should require execution on map, not scripted inevitability.

## 3) AI difficulty feel (intended)

### Easy
- Defensive / local-reactive sparring bot.
- Prioritizes economy and map holding over deliberate base-kill pushes.
- Teaches flow and counters without oppressive aggression.

### Medium
- Baseline "real match" bot.
- Uses coherent attack/buildup cycles and partial upgrade coverage.
- Should punish obvious mistakes but leave comeback room.

### Hard
- Strong macro/tech pressure without cheating.
- Denser timing windows, fuller upgrades, tighter economy usage.
- Wins through better pacing and decisions, not hidden resource bonuses.

## 4) Cross-layer invariants (UI ↔ sim ↔ net)

1. **Legality parity**
   - Any action shown as legal in UI must be legal in sim.
   - Any action rejected by sim must not be silently accepted over net.

2. **Prerequisite parity**
   - Tech/build prerequisites (example: Tower requires Barracks + Lumber Mill) must be identical in UI hints, sim checks, and network command validation path.

3. **Ownership semantics parity**
   - Player/enemy/neutral ownership meaning must be consistent across render labels, AI targeting, economy logic, and net serialization.
   - Neutral must never leak into "enemy player" shortcuts.

4. **Cost/payment parity**
   - Gold/wood costs and refunds come from resolved balance data, not duplicated constants.
   - UI display cost, sim deduction, and net-observed result must match exactly.

5. **Supply/state parity**
   - Supply cap/usage and "cannot train" reasons must be deterministic and identical between local and network sessions.

6. **Deterministic command application**
   - Same command stream + same tick order => same result.
   - Multi-id commands and owner/apply order are invariant-critical.

7. **Timing visibility parity**
   - Research/build/train timers shown in UI must reflect sim timing, not client-local guesses.

8. **Authority boundary clarity**
   - UI suggests and requests; sim decides.
   - Net transports intent and validated results, not alternative game rules.

## 5) Anti-goals (what to avoid)

- Do not make AI difficulty by hidden cheats.
- Do not add race flavor by one-off exceptions scattered across files.
- Do not let UI promise actions that sim/net can reject for different reasons.
- Do not tune balance through isolated unit stats while ignoring map pressure systems.
- Do not ship broad cross-layer rewrites without small deterministic passes and regression checks.
- Do not let movement changes reduce economy continuity or frontline readability in the name of cleaner abstraction.
- Do not solve worker traffic and combat engagement with one generalized semantic model if gameplay feel gets worse.
