/**
 * Headless "bot player" for Kingdom OS balance checks. Pure + deterministic.
 * Used by the unit tests (balance targets) and `npm run kingdom:balance`.
 */
import {
  BUILDINGS,
  type BuildingId,
  type KingdomState,
  type PolicyId,
  availableUpgrades,
  buildingVisible,
  buyBuilding,
  buyUpgrade,
  canPrestige,
  checkAchievements,
  choosePolicy,
  click,
  clickValue,
  createState,
  goldPerSecond,
  mailInterval,
  nextBuildingCost,
  openMail,
  policyUnlocked,
  tick,
} from './kingdom-economy';

export interface SimOptions {
  seconds: number;
  clicksPerSecond: number;
  policy: PolicyId;
  /** Open every Royal Mail that appears (alternating treasure/frenzy). */
  catchMail: boolean;
  start?: KingdomState;
}

export interface SimEvent {
  t: number;
  what: string;
}

export interface SimResult {
  state: KingdomState;
  events: SimEvent[];
  /** First moment the cheapest shop item was affordable (what a human would buy). */
  firstAffordableAt: number | null;
  firstPurchaseAt: number | null;
  policyAt: number | null;
  prestigeReadyAt: number | null;
  /** Every distinct affordable option count sampled at 120 s. */
  optionsAt120: number;
  samples: Array<{ t: number; gold: number; gps: number; earned: number; buildings: number }>;
}

type Option = { kind: 'building'; id: BuildingId; cost: number } | { kind: 'upgrade'; id: string; cost: number };

function income(s: KingdomState, cps: number): number {
  return goldPerSecond(s) + clickValue(s) * cps;
}

function options(s: KingdomState): Option[] {
  const out: Option[] = [];
  for (const b of BUILDINGS) if (buildingVisible(s, b.id)) out.push({ kind: 'building', id: b.id, cost: nextBuildingCost(s, b.id) });
  for (const u of availableUpgrades(s)) out.push({ kind: 'upgrade', id: u.id, cost: u.cost });
  return out;
}

function apply(s: KingdomState, o: Option): KingdomState {
  return o.kind === 'building' ? buyBuilding(s, o.id) : buyUpgrade(s, o.id);
}

/** Pick the option with the best (time-to-afford + payback) score. */
function bestOption(s: KingdomState, cps: number): Option | null {
  const now = Math.max(income(s, cps), 0.01);
  let best: Option | null = null;
  let bestScore = Infinity;
  for (const o of options(s)) {
    const after = apply({ ...s, gold: s.gold + o.cost }, o);
    const delta = income(after, cps) - now;
    if (delta <= 0) continue;
    const score = Math.max(0, o.cost - s.gold) / now + o.cost / delta;
    if (score < bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best;
}

export function simulate(opts: SimOptions): SimResult {
  const dt = 0.1;
  let s = opts.start ?? createState();
  const events: SimEvent[] = [];
  const samples: SimResult['samples'] = [];
  let firstPurchaseAt: number | null = null;
  let firstAffordableAt: number | null = null;
  let policyAt: number | null = null;
  let prestigeReadyAt: number | null = null;
  let optionsAt120 = 0;
  let clickDebt = 0;
  let nextMail = 60;
  let mailRoll = 0;
  const steps = Math.round(opts.seconds / dt);
  for (let i = 1; i <= steps; i++) {
    const t = i * dt;
    s = tick(s, dt);
    clickDebt += opts.clicksPerSecond * dt;
    while (clickDebt >= 1) {
      clickDebt -= 1;
      s = click(s).state;
    }
    if (opts.catchMail && t >= nextMail) {
      s = openMail(s, mailRoll % 2 === 0 ? 0.1 : 0.9).state;
      mailRoll += 1;
      nextMail = t + mailInterval(s);
      events.push({ t, what: 'mail' });
    }
    if (!s.policy && policyUnlocked(s)) {
      s = choosePolicy(s, opts.policy);
      policyAt = t;
      events.push({ t, what: `policy ${opts.policy}` });
    }
    if (firstAffordableAt === null && options(s).some((o) => s.gold >= o.cost)) firstAffordableAt = t;
    // Buy greedily (several per step if affordable).
    for (let guard = 0; guard < 20; guard++) {
      const o = bestOption(s, opts.clicksPerSecond);
      if (!o || s.gold < o.cost) break;
      s = apply(s, o);
      if (firstPurchaseAt === null) firstPurchaseAt = t;
      events.push({ t, what: `${o.kind} ${o.id}` });
    }
    s = checkAchievements(s).state;
    if (prestigeReadyAt === null && canPrestige(s)) {
      prestigeReadyAt = t;
      events.push({ t, what: 'prestige ready' });
    }
    if (Math.abs(t - 120) < dt / 2) optionsAt120 = options(s).length + (s.policy ? 1 : 0);
    if (Math.round(t * 10) % 300 === 0) {
      samples.push({ t, gold: s.gold, gps: goldPerSecond(s), earned: s.eraEarned, buildings: BUILDINGS.reduce((n, b) => n + s.buildings[b.id], 0) });
    }
  }
  return { state: s, events, firstAffordableAt, firstPurchaseAt, policyAt, prestigeReadyAt, optionsAt120, samples };
}

