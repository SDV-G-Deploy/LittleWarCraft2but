# LW2B Movement KPI Baseline (Lightweight)

Date: 2026-04-24

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
