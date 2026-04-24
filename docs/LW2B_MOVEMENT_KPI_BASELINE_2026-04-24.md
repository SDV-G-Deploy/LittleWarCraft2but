# LW2B Movement KPI Baseline (Lightweight)

Date: 2026-04-24
Status: implemented lightweight KPI/scenario baseline pass
Commit: `7b279ee`

This pass adds minimal instrumentation counters to support evidence-driven tuning without introducing a heavy framework.

## Added counters

- `move_repath_attempts`
- `move_blocked_ticks`
- `worker_cycle_ticks_total`
- `worker_cycle_count`
- `worker_cycle_ticks_median`
- `worker_blocked_ticks`
- `melee_slot_reassigns`
- `combat_chase_repaths`
- `near_target_hold_ticks`

## Where they are collected

- `src/sim/movement-kpi.ts`
- Move command flow (`src/sim/commands.ts`)
- Worker gather/build travel (`src/sim/economy.ts`)
- Combat chase/slot/hold flow (`src/sim/combat.ts`)

## Baseline scenario test

Run:

```bash
npm run test:movement-kpi
```

Scenario-oriented baseline coverage:

1. plain move blocked/repath pressure
2. worker gather-return cycle timing
3. combat near-target hold behavior

The test prints `[kpi-baseline]` JSON snapshots for each scenario.

## Why this pass matters

After the worker transparent-through-units fix, movement helper boundary cleanup, and combat stabilization pass, the project needed a way to measure whether future tuning actually helps.

This baseline layer is intentionally small:
- no heavy telemetry framework,
- no persistent reporting backend,
- no premature CI gate complexity.

It is meant to provide just enough measurement to compare future movement changes against known scenario outputs.

## Honest limits

These numbers are currently:
- scenario-specific,
- best used as smoke baselines,
- not yet full project-wide KPI gates.

That is intentional. The goal of this pass is to improve engineering feedback without making the codebase harder to reason about.

## Recommended use during active movement iteration

When evaluating a new movement/combat/worker change:
1. run `npm run test:movement-kpi`
2. compare emitted snapshot values
3. run full `npm test`
4. only then decide whether a tuning change actually improved the target behavior
