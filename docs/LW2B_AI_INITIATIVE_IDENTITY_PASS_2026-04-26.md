# LW2B AI Initiative + Race Identity Pass (2026-04-26)

Status: landed in code, build/test green at implementation time

## Goal

Reduce passive equal-front behavior without rewriting the AI.

Main player-facing targets:
- fewer cases where assault units stand around under rough parity,
- more visible Human vs Orc behavioral identity,
- more deterministic active pressure without cheats.

## What changed

Primary code target:
- `src/sim/ai.ts`

Focused tests:
- `src/sim/ai-initiative.test.ts`
- existing doctrine/posture/mine-intent/watchdog/offline tests kept in validation chain

### 1. Race doctrine now affects behavior, not only scalar ratios

Added narrow doctrine fields such as:
- `probeBias`
- `guardBias`
- `containBias`
- `harassBias`
- `commitBias`
- `parityPressureBias`
- `rangedPreservationBias`
- `objectivePivotPatienceTicks`

Intent:
- Human is more positional, guard/contain oriented, and more careful with ranged support.
- Orc is more proactive, probe/harass oriented, and more willing to create pressure under parity.

### 2. Added lightweight pressure objective memory

Added minimal AI memory:
- `lastPressureObjective`
- `lastPressureObjectiveTick`
- `lastObjectivePivotTick`

This is not a planner. It only lets the AI keep or pivot a deterministic active objective instead of repeatedly falling back to the same stale front point forever.

### 3. Added deterministic active pressure objectives

Added helper flow:
- `choosePressureObjective(...)`
- `rememberPressureObjective(...)`
- `applyPressureObjectiveMovement(...)`

Supported compact objectives include:
- `homeGuard`
- `contestedMine`
- `containFront`
- `expansionMine`
- `enemyApproach`
- `harassWorkers`
- `pressureProduction`

### 4. Improved equal-front posture behavior

Under parity or slight local advantage:
- Human tends to convert into `contain` and hold meaningful contested space.
- Orc tends to convert into `probe` and apply forward pressure or worker harassment.
- Medium/Hard become more active than before, while Easy still stays comparatively readable.

### 5. Reduced assault command starvation

Pressure objectives now feed the assault branch before the final fallback move.
That means non-reserve assault units are more likely to receive:
- a relevant attack,
- a deterministic move toward a meaningful anchor,
- or a race-appropriate hold/contain position.

## Why this is intentionally not a full AI rewrite

This pass does not:
- replace the economy / military / assault state machine,
- rewrite movement, pathfinding, or combat,
- add random behavior,
- add hidden resource/stat advantages,
- touch netcode/transport.

The intent is a narrow behavior-layer improvement with low regression risk.

## Determinism notes

The pass stays deterministic by:
- using only synced game state,
- avoiding `Math.random` and wall-clock timing,
- preserving id-based stable ordering,
- using fixed doctrine values and tick-based pivot patience.

## Tests run

Targeted:
- `npx tsx src/sim/ai-initiative.test.ts`
- `npx tsx src/sim/ai-doctrine.test.ts`
- `npx tsx src/sim/ai-posture.test.ts`
- `npx tsx src/sim/ai-mine-intent.test.ts`
- `npx tsx src/sim/ai-assault-watchdog.test.ts`
- `npx tsx src/sim/offline-simulation.test.ts`

Full:
- `npm test`
- `npm run build`

## Playtest watchpoints

Focus field validation on:
1. parity fronts near contested mines,
2. Human contain behavior with mixed melee/ranged groups,
3. Orc pressure behavior when direct target access is not immediate,
4. whether harassment objectives over-pull units away from the main line,
5. whether any remaining inactivity is really movement/pathing related rather than AI decision related.

## Follow-up if needed

If remaining AFK-like behavior is still visible after this pass, the next step should be a deeper movement/progress-tracking follow-up, not a larger rewrite inside this pass.
