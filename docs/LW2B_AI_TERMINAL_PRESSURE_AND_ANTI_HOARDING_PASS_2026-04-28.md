# LW2B AI terminal pressure and anti-hoarding pass - 2026-04-28

## Scope

This pass targeted a narrower late-game AI weakness that remained after the endgame recovery / rally hotfix:

1. over-conservative reserve holding in crippled-enemy states
2. reluctance to convert local advantage into terminal pressure
3. objective drift toward mine / contain behavior when enemy should already be getting finished off

The goal was not to make AI globally more aggressive. The goal was to improve terminal conversion while preserving normal midgame contested-front behavior and existing severe-home-threat safety rails.

---

## What changed

### 1. Earlier finish-off commitment in crippled-enemy state

In `src/sim/ai.ts`:
- `updateAssaultPosture(...)`

Behavior change:
- when the enemy is already crippled and home is not under severe threat, assault posture now enters `commit` earlier
- commit threshold in this finish-off path was reduced to allow smaller surviving armies to keep pressure instead of stalling

Associated commit:
- `fca40fd` - `ai: tighten finish-off commit and reserve release`

### 2. Stronger reserve release during terminal pressure

In `src/sim/ai.ts`:
- `evaluateEndgamePressureOverride(...)`
- `getHomeReserveCount(...)`

Behavior change:
- crippled-enemy finish-off now releases home reserve more aggressively
- reserve cap drops to `0` in the narrow intended terminal cases
- small endgame override armies are less likely to hoard units at home when no severe base threat exists

Intent:
- reduce fake safety behavior where the AI keeps enough units back to fail the actual finish-off
- preserve safety rails when severe home threat is real

Associated commit:
- `fca40fd` - `ai: tighten finish-off commit and reserve release`

### 3. Terminal objective preference over mine / contain drift

In `src/sim/ai.ts`:
- `choosePressureObjective(...)`

Behavior change:
- under endgame override, objective selection now prefers terminal progress toward enemy production before drifting back into contested-mine / contain inertia
- this helps the AI finish off weakened opponents instead of spending too long on stale front pressure

Associated commit:
- `fca40fd` - `ai: tighten finish-off commit and reserve release`

---

## Stabilization follow-up

A follow-up verify pass found an important regression risk:
- the new endgame override could activate too early in non-endgame flow when the enemy was technically crippled but the current objective pivot was still fresh
- this widened the pass beyond the intended narrow terminal window

Stabilization in `src/sim/ai.ts`:
- tightened endgame override activation so fresh pivot state does not get overridden too early
- preserved contested/front behavior outside the narrow endgame override window

Also updated test coverage in `package.json`:
- `src/sim/ai-endgame-objective.test.ts` is now part of the main `npm test` suite

Associated commit:
- `97a5dff` - stabilization follow-up after Branch A verify

---

## Tests and verification

### Targeted coverage
- `src/sim/ai-endgame-objective.test.ts`
  - stale front objective is dropped in real endgame override
  - terminal objective pivots toward enemy-base progress
  - reserve cap stays tight in endgame override
  - severe home threat still overrides reckless finish-off
  - crippled enemy can force commit and zero reserve when safe
  - non-endgame contested/front behavior remains intact after stabilization

### Broader local evidence used in re-verify
- `src/sim/ai-assault-watchdog.test.ts`
- `src/sim/ai-initiative.test.ts`
- `src/sim/combat-congestion.test.ts`
- `src/sim/rally-pathing.test.ts`
- `src/sim/offline-simulation.test.ts`

Validation state after stabilization:
- targeted endgame objective test green
- `npm test` green
- `npm run build` green

---

## Current conclusion

Local confidence is now moderate-high that:
- terminal pressure / finish-off behavior improved versus the pre-pass expectation
- anti-hoarding improved in crippled-enemy states
- non-endgame contested/front behavior was preserved after stabilization

However, this is still not final live-match proof.

---

## Recommended next step

Do a short live AI-vs-AI verify focused on:
1. whether terminal finish-off is now more decisive
2. whether home-side hoarding is visibly reduced in crippled-enemy states
3. whether any remaining meaningful symptom still points back to barracks/rally melee jam

If live verify agrees with local evidence, the next candidate would be a careful Branch A pass 2 rather than a movement/pathfinding return.