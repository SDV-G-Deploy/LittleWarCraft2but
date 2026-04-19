import type { GameState } from '../types';

interface SimProfiler {
  enabled: boolean;
  now(): number;
  recordFindPath(ms: number, found: boolean, closedCount: number, maxOpenCount: number): void;
  recordMoveStuck(): void;
  recordMoveRepath(success: boolean): void;
  recordMoveSidestep(success: boolean): void;
  recordAutoAttack(ms: number): void;
  recordPhase(name: string, ms: number): void;
  sampleState(state: GameState): void;
}

type CounterMap = Record<string, number>;

function createNoopProfiler(): SimProfiler {
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const noop = () => {};
  return {
    enabled: false,
    now,
    recordFindPath: noop,
    recordMoveStuck: noop,
    recordMoveRepath: noop,
    recordMoveSidestep: noop,
    recordAutoAttack: noop,
    recordPhase: noop,
    sampleState: noop,
  };
}

function isEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const search = new URLSearchParams(window.location.search);
    if (search.get('profile') === '1' || search.has('profile')) return true;
    return window.localStorage?.getItem('lw2.profile') === '1';
  } catch {
    return false;
  }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function createProfiler(): SimProfiler {
  if (!isEnabled()) return createNoopProfiler();

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const s = {
    windowStartTick: 0,
    sampleTicks: 0,
    entityCountTotal: 0,
    entityCountMax: 0,
    movePathLenTotal: 0,
    movePathLenMax: 0,
    chasePathLenTotal: 0,
    chasePathLenMax: 0,
    gatherPathLenTotal: 0,
    gatherPathLenMax: 0,
    buildPathLenTotal: 0,
    buildPathLenMax: 0,

    findPathCalls: 0,
    findPathNoPath: 0,
    findPathMsTotal: 0,
    findPathMsMax: 0,
    findPathClosedTotal: 0,
    findPathClosedMax: 0,
    findPathOpenMax: 0,

    moveStuck: 0,
    moveRepath: 0,
    moveRepathOk: 0,
    moveSidestep: 0,
    moveSidestepOk: 0,

    autoAttackCalls: 0,
    autoAttackMsTotal: 0,
    autoAttackMsMax: 0,

    phaseMsTotal: {} as CounterMap,
    phaseMsMax: {} as CounterMap,
  };

  function resetWindow(tick: number): void {
    s.windowStartTick = tick;
    s.sampleTicks = 0;
    s.entityCountTotal = 0;
    s.entityCountMax = 0;
    s.movePathLenTotal = 0;
    s.movePathLenMax = 0;
    s.chasePathLenTotal = 0;
    s.chasePathLenMax = 0;
    s.gatherPathLenTotal = 0;
    s.gatherPathLenMax = 0;
    s.buildPathLenTotal = 0;
    s.buildPathLenMax = 0;

    s.findPathCalls = 0;
    s.findPathNoPath = 0;
    s.findPathMsTotal = 0;
    s.findPathMsMax = 0;
    s.findPathClosedTotal = 0;
    s.findPathClosedMax = 0;
    s.findPathOpenMax = 0;

    s.moveStuck = 0;
    s.moveRepath = 0;
    s.moveRepathOk = 0;
    s.moveSidestep = 0;
    s.moveSidestepOk = 0;

    s.autoAttackCalls = 0;
    s.autoAttackMsTotal = 0;
    s.autoAttackMsMax = 0;

    s.phaseMsTotal = {};
    s.phaseMsMax = {};
  }

  function flushIfNeeded(tick: number): void {
    if (tick - s.windowStartTick < 200) return;
    const samples = Math.max(1, s.sampleTicks);
    const fpCalls = Math.max(1, s.findPathCalls);
    const aaCalls = Math.max(1, s.autoAttackCalls);

    const phaseSummary = Object.keys(s.phaseMsTotal)
      .sort((a, b) => (s.phaseMsTotal[b] ?? 0) - (s.phaseMsTotal[a] ?? 0))
      .map((k) => {
        const total = s.phaseMsTotal[k] ?? 0;
        const avg = total / samples;
        const max = s.phaseMsMax[k] ?? 0;
        return `${k}:avg=${round(avg)}ms,max=${round(max)}ms`;
      })
      .join(' | ');

    console.log(
      `[profile] ticks ${s.windowStartTick}-${tick}` +
      ` entities(avg/max)=${round(s.entityCountTotal / samples)}/${s.entityCountMax}` +
      ` movePath(avg/max)=${round(s.movePathLenTotal / samples)}/${s.movePathLenMax}` +
      ` chasePath(avg/max)=${round(s.chasePathLenTotal / samples)}/${s.chasePathLenMax}` +
      ` gatherPath(avg/max)=${round(s.gatherPathLenTotal / samples)}/${s.gatherPathLenMax}` +
      ` buildPath(avg/max)=${round(s.buildPathLenTotal / samples)}/${s.buildPathLenMax}` +
      ` findPath(calls=${s.findPathCalls},null=${s.findPathNoPath},avg=${round(s.findPathMsTotal / fpCalls)}ms,max=${round(s.findPathMsMax)}ms,closedAvg=${round(s.findPathClosedTotal / fpCalls)},closedMax=${s.findPathClosedMax},openMax=${s.findPathOpenMax})` +
      ` move(stuck=${s.moveStuck},repath=${s.moveRepath},repathOk=${s.moveRepathOk},sidestep=${s.moveSidestep},sidestepOk=${s.moveSidestepOk})` +
      ` autoAttack(calls=${s.autoAttackCalls},avg=${round(s.autoAttackMsTotal / aaCalls)}ms,max=${round(s.autoAttackMsMax)}ms)` +
      (phaseSummary ? ` phases(${phaseSummary})` : ''),
    );

    resetWindow(tick + 1);
  }

  resetWindow(0);
  console.log('[profile] enabled (?profile=1 or localStorage lw2.profile=1)');

  return {
    enabled: true,
    now,
    recordFindPath(ms: number, found: boolean, closedCount: number, maxOpenCount: number): void {
      s.findPathCalls++;
      if (!found) s.findPathNoPath++;
      s.findPathMsTotal += ms;
      if (ms > s.findPathMsMax) s.findPathMsMax = ms;
      s.findPathClosedTotal += closedCount;
      if (closedCount > s.findPathClosedMax) s.findPathClosedMax = closedCount;
      if (maxOpenCount > s.findPathOpenMax) s.findPathOpenMax = maxOpenCount;
    },
    recordMoveStuck(): void {
      s.moveStuck++;
    },
    recordMoveRepath(success: boolean): void {
      s.moveRepath++;
      if (success) s.moveRepathOk++;
    },
    recordMoveSidestep(success: boolean): void {
      s.moveSidestep++;
      if (success) s.moveSidestepOk++;
    },
    recordAutoAttack(ms: number): void {
      s.autoAttackCalls++;
      s.autoAttackMsTotal += ms;
      if (ms > s.autoAttackMsMax) s.autoAttackMsMax = ms;
    },
    recordPhase(name: string, ms: number): void {
      s.phaseMsTotal[name] = (s.phaseMsTotal[name] ?? 0) + ms;
      s.phaseMsMax[name] = Math.max(s.phaseMsMax[name] ?? 0, ms);
    },
    sampleState(state: GameState): void {
      s.sampleTicks++;
      const entities = state.entities.length;
      s.entityCountTotal += entities;
      s.entityCountMax = Math.max(s.entityCountMax, entities);

      let movePathLen = 0;
      let chasePathLen = 0;
      let gatherPathLen = 0;
      let buildPathLen = 0;

      for (const e of state.entities) {
        if (e.cmd?.type === 'move') movePathLen += e.cmd.path.length;
        if (e.cmd?.type === 'attack') chasePathLen += e.cmd.chasePath.length;

        const anyE = e as any;
        if (Array.isArray(anyE._gatherPath)) gatherPathLen += anyE._gatherPath.length;
        if (Array.isArray(anyE._buildPath)) buildPathLen += anyE._buildPath.length;
      }

      s.movePathLenTotal += movePathLen;
      s.movePathLenMax = Math.max(s.movePathLenMax, movePathLen);
      s.chasePathLenTotal += chasePathLen;
      s.chasePathLenMax = Math.max(s.chasePathLenMax, chasePathLen);
      s.gatherPathLenTotal += gatherPathLen;
      s.gatherPathLenMax = Math.max(s.gatherPathLenMax, gatherPathLen);
      s.buildPathLenTotal += buildPathLen;
      s.buildPathLenMax = Math.max(s.buildPathLenMax, buildPathLen);

      flushIfNeeded(state.tick);
    },
  };
}

export const profiler = createProfiler();
