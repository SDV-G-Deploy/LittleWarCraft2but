export interface MovementKpiSnapshot {
  ticks: number;
  move_repath_attempts: number;
  move_blocked_ticks: number;
  worker_cycle_ticks_total: number;
  worker_cycle_count: number;
  worker_cycle_ticks_median: number;
  worker_blocked_ticks: number;
  melee_slot_reassigns: number;
  combat_chase_repaths: number;
  near_target_hold_ticks: number;
}

type WorkerCycleState = {
  startTickByWorkerId: Map<number, number>;
  cycleDurations: number[];
};

const counters = {
  move_repath_attempts: 0,
  move_blocked_ticks: 0,
  worker_blocked_ticks: 0,
  melee_slot_reassigns: 0,
  combat_chase_repaths: 0,
  near_target_hold_ticks: 0,
};

const workerCycleState: WorkerCycleState = {
  startTickByWorkerId: new Map<number, number>(),
  cycleDurations: [],
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export function resetMovementKpis(): void {
  counters.move_repath_attempts = 0;
  counters.move_blocked_ticks = 0;
  counters.worker_blocked_ticks = 0;
  counters.melee_slot_reassigns = 0;
  counters.combat_chase_repaths = 0;
  counters.near_target_hold_ticks = 0;
  workerCycleState.startTickByWorkerId.clear();
  workerCycleState.cycleDurations = [];
}

export function recordMoveRepathAttempt(): void {
  counters.move_repath_attempts++;
}

export function recordMoveBlockedTick(): void {
  counters.move_blocked_ticks++;
}

export function recordWorkerBlockedTick(): void {
  counters.worker_blocked_ticks++;
}

export function recordMeleeSlotReassign(): void {
  counters.melee_slot_reassigns++;
}

export function recordCombatChaseRepath(): void {
  counters.combat_chase_repaths++;
}

export function recordNearTargetHoldTick(): void {
  counters.near_target_hold_ticks++;
}

export function markWorkerCycleStart(workerId: number, tick: number): void {
  if (!workerCycleState.startTickByWorkerId.has(workerId)) {
    workerCycleState.startTickByWorkerId.set(workerId, tick);
  }
}

export function markWorkerCycleComplete(workerId: number, tick: number): void {
  const startTick = workerCycleState.startTickByWorkerId.get(workerId);
  if (startTick === undefined) return;
  workerCycleState.cycleDurations.push(Math.max(0, tick - startTick));
  workerCycleState.startTickByWorkerId.set(workerId, tick);
}

export function snapshotMovementKpis(ticks: number): MovementKpiSnapshot {
  const worker_cycle_ticks_total = workerCycleState.cycleDurations.reduce((sum, t) => sum + t, 0);
  return {
    ticks,
    move_repath_attempts: counters.move_repath_attempts,
    move_blocked_ticks: counters.move_blocked_ticks,
    worker_cycle_ticks_total,
    worker_cycle_count: workerCycleState.cycleDurations.length,
    worker_cycle_ticks_median: median(workerCycleState.cycleDurations),
    worker_blocked_ticks: counters.worker_blocked_ticks,
    melee_slot_reassigns: counters.melee_slot_reassigns,
    combat_chase_repaths: counters.combat_chase_repaths,
    near_target_hold_ticks: counters.near_target_hold_ticks,
  };
}
