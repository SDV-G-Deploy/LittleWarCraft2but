/**
 * Kingdom OS 2000 economy tests: pure-function behaviour, save/load,
 * offline progress, prestige, and the balance targets from docs/KINGDOM_OS.md.
 */
import assert from 'node:assert/strict';
import {
  ACHIEVEMENTS,
  ERA_GOAL,
  OFFLINE_CAP_SECONDS,
  applyOffline,
  availableUpgrades,
  baseGoldPerSecond,
  buildingCost,
  buildingVisible,
  buyBuilding,
  buyUpgrade,
  canPrestige,
  checkAchievements,
  choosePolicy,
  click,
  clickValue,
  createState,
  currentGoal,
  deserialize,
  formatDuration,
  formatNumber,
  goldPerSecond,
  openMail,
  patchesForLifetime,
  prestige,
  prestigeGain,
  serialize,
  tick,
  type KingdomState,
} from './kingdom-economy';
import { simulate } from './kingdom-sim';

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const withGold = (gold: number, s: KingdomState = createState()): KingdomState => ({ ...s, gold });

console.log('kingdom-economy');

test('formatNumber covers small, thousands and large tiers', () => {
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(1.25), '1.2');
  assert.equal(formatNumber(999), '999');
  assert.equal(formatNumber(1234), '1.23K');
  assert.equal(formatNumber(12_345_678), '12.3M');
  assert.equal(formatNumber(999_999), '999K');
  assert.equal(formatNumber(2.5e12), '2.50T');
  assert.equal(formatNumber(Infinity), '∞');
  assert.equal(formatDuration(59), '59s');
  assert.equal(formatDuration(3725), '1h 2m');
});

test('clicking mints gold and counts clicks without mutating input', () => {
  const s0 = createState();
  const { state: s1, gained } = click(s0);
  assert.equal(gained, 1);
  assert.equal(s1.gold, 1);
  assert.equal(s1.clicks, 1);
  assert.equal(s0.gold, 0, 'input state must not change');
});

test('building costs grow 15% per owned building', () => {
  assert.equal(buildingCost('peasant', 0), 10);
  assert.equal(buildingCost('peasant', 1), 12);
  assert.equal(buildingCost('peasant', 10), Math.ceil(10 * 1.15 ** 10));
});

test('buying a building spends gold and adds production', () => {
  const s = buyBuilding(withGold(10), 'peasant');
  assert.equal(s.gold, 0);
  assert.equal(s.buildings.peasant, 1);
  assert.ok(goldPerSecond(s) > 0);
  const broke = buyBuilding(withGold(5), 'peasant');
  assert.equal(broke.buildings.peasant, 0, 'cannot buy without gold');
});

test('tick is deterministic and linear in time', () => {
  let s = withGold(0);
  s = { ...s, buildings: { ...s.buildings, farm: 10 } };
  const a = tick(s, 10);
  let b = s;
  for (let i = 0; i < 100; i++) b = tick(b, 0.1);
  assert.ok(Math.abs(a.gold - b.gold) < 1e-6);
  assert.ok(Math.abs(a.gold - 10 * baseGoldPerSecond(s)) < 1e-6);
  assert.equal(tick(s, 0), s);
});

test('upgrades unlock, cost gold and double the target', () => {
  let s = { ...withGold(1000), buildings: { ...createState().buildings, peasant: 3 } };
  assert.ok(availableUpgrades(s).some((u) => u.id === 'plows'));
  const before = baseGoldPerSecond(s);
  s = buyUpgrade(s, 'plows');
  assert.ok(s.upgrades.includes('plows'));
  assert.ok(Math.abs(baseGoldPerSecond(s) - before * 2) < 1e-9);
  assert.equal(buyUpgrade(s, 'plows'), s, 'cannot buy twice');
  assert.equal(buyUpgrade(withGold(1e9), 'cache').upgrades.length, 0, 'hidden upgrades cannot be bought');
});

test('click upgrades and policies change click value', () => {
  let s = { ...withGold(1e6), clicks: 10, eraEarned: 2000 };
  s = buyUpgrade(s, 'mouse');
  assert.equal(clickValue(s), 2);
  s = choosePolicy(s, 'merchant');
  assert.equal(clickValue(s), 8);
  assert.equal(choosePolicy(s, 'agrarian').policy, 'merchant', 'policy is locked once signed');
  assert.equal(choosePolicy(createState(), 'idle').policy, null, 'policy needs the unlock');
});

test('buildings are revealed progressively', () => {
  const s = createState();
  assert.ok(buildingVisible(s, 'peasant'));
  assert.ok(!buildingVisible(s, 'farm'));
  assert.ok(buildingVisible({ ...s, buildings: { ...s.buildings, peasant: 1 } }, 'farm'));
  assert.ok(!buildingVisible({ ...s, buildings: { ...s.buildings, peasant: 1 } }, 'market'));
});

test('achievements unlock once and boost production by 2% each', () => {
  let s = { ...createState(), clicks: 1, buildings: { ...createState().buildings, peasant: 10 } };
  const before = baseGoldPerSecond(s);
  const r = checkAchievements(s);
  assert.ok(r.unlocked.some((a) => a.id === 'click1'));
  s = r.state;
  assert.ok(Math.abs(baseGoldPerSecond(s) - before * (1 + 0.02 * s.achievements.length)) < 1e-9);
  assert.equal(checkAchievements(s).unlocked.length, 0);
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length, 'ids are unique');
});

test('royal mail: treasure pays a lump sum, frenzy boosts then expires', () => {
  const s = { ...createState(), buildings: { ...createState().buildings, farm: 10 } };
  const t = openMail(s, 0.1);
  assert.equal(t.kind, 'treasure');
  assert.ok(Math.abs(t.gained - baseGoldPerSecond(s) * 60) < 1e-9);
  const f = openMail(s, 0.9);
  assert.equal(f.kind, 'frenzy');
  assert.equal(goldPerSecond(f.state), baseGoldPerSecond(f.state) * 5);
  const after = tick(f.state, 30);
  const expected = baseGoldPerSecond(s) * (20 * 5 + 10);
  assert.ok(Math.abs(after.gold - expected) < 1e-6, 'frenzy splits exactly at its end');
  assert.equal(after.boostMult, 1);
});

test('offline progress pays 50% (100% with Idle Throne), capped at 8h', () => {
  const s = { ...createState(), eraEarned: 5000, buildings: { ...createState().buildings, farm: 10 } };
  const gps = baseGoldPerSecond(s);
  const r = applyOffline(s, 3600);
  assert.ok(Math.abs(r.earned - gps * 3600 * 0.5) < 1e-6);
  const idle = choosePolicy(s, 'idle');
  assert.ok(Math.abs(applyOffline(idle, 3600).earned - baseGoldPerSecond(idle) * 3600) < 1e-6);
  const capped = applyOffline(s, 10 * 24 * 3600);
  assert.equal(capped.seconds, OFFLINE_CAP_SECONDS);
  assert.equal(applyOffline(s, -50).earned, 0, 'clock skew never removes gold');
});

test('prestige: needs 1M this era, grants patches, keeps trophies', () => {
  const s0 = { ...createState(), gold: 5, eraEarned: ERA_GOAL - 1, lifetimeEarned: ERA_GOAL - 1 };
  assert.ok(!canPrestige(s0));
  assert.equal(prestige(s0), s0);
  const s1 = checkAchievements({ ...s0, eraEarned: ERA_GOAL, lifetimeEarned: 4 * ERA_GOAL, clicks: 100 }).state;
  assert.equal(prestigeGain(s1), patchesForLifetime(4 * ERA_GOAL));
  assert.equal(patchesForLifetime(ERA_GOAL), 3);
  const p = prestige(s1);
  assert.equal(p.era, 1);
  assert.equal(p.gold, 0);
  assert.equal(p.patches, 6);
  assert.deepEqual(p.achievements, s1.achievements);
  assert.equal(p.buildings.peasant, 0);
  assert.equal(p.policy, null);
  assert.ok(clickValue(p) > 1, 'patches boost clicks too');
  assert.equal(prestigeGain(p), 0, 'patches are not double-counted');
});

test('save/load round-trips and rejects garbage', () => {
  let s = buyBuilding(withGold(500), 'peasant');
  s = { ...s, upgrades: ['mouse'], achievements: ['click1'], policy: 'agrarian', era: 2, patches: 7 };
  const loaded = deserialize(serialize(s, 1234));
  assert.ok(loaded);
  assert.deepEqual(loaded.state, s);
  assert.equal(loaded.savedAt, 1234);
  assert.equal(deserialize(null), null);
  assert.equal(deserialize('{nope'), null);
  assert.equal(deserialize('{"state":{"version":1}}'), null);
  const dirty = deserialize(JSON.stringify({ state: { version: 2, gold: -5, upgrades: ['mouse', 'hax', 'mouse'], policy: 'evil', buildings: { peasant: 'x' } }, savedAt: 'later' }));
  assert.ok(dirty);
  assert.equal(dirty.state.gold, 0);
  assert.deepEqual(dirty.state.upgrades, ['mouse']);
  assert.equal(dirty.state.policy, null);
  assert.equal(dirty.state.buildings.peasant, 0);
  assert.equal(dirty.savedAt, 0);
});

test('goal strip walks the onboarding chain', () => {
  let s = createState();
  assert.equal(currentGoal(s).id, 'mint');
  s = { ...s, eraEarned: 10, gold: 10 };
  assert.equal(currentGoal(s).id, 'peasant');
  s = buyBuilding(s, 'peasant');
  assert.equal(currentGoal(s).id, 'upgrade');
  const late = { ...createState(), era: 1, eraEarned: ERA_GOAL, lifetimeEarned: 9 * ERA_GOAL, patches: 3 };
  assert.equal(currentGoal(late).id, 'install');
});

// --- Balance targets (bot plays: greedy buyer, 3 clicks/sec, catches mail) ---

test('balance: first purchase affordable within ~10s, even at 1 click/sec', () => {
  const fast = simulate({ seconds: 30, clicksPerSecond: 3, policy: 'agrarian', catchMail: true });
  const slow = simulate({ seconds: 30, clicksPerSecond: 1, policy: 'agrarian', catchMail: true });
  assert.ok(fast.firstAffordableAt !== null && fast.firstAffordableAt <= 5, `fast ${fast.firstAffordableAt}`);
  assert.ok(slow.firstAffordableAt !== null && slow.firstAffordableAt <= 11, `slow ${slow.firstAffordableAt}`);
});

test('balance: meaningful choices (policy + several shop options) by ~2 min', () => {
  const r = simulate({ seconds: 130, clicksPerSecond: 3, policy: 'agrarian', catchMail: true });
  assert.ok(r.policyAt !== null && r.policyAt <= 130, `policy at ${r.policyAt}`);
  assert.ok(r.optionsAt120 >= 5, `options at 120s: ${r.optionsAt120}`);
});

test('balance: first era install within 8-13 min of active play, for every policy', () => {
  for (const policy of ['agrarian', 'merchant', 'idle'] as const) {
    const r = simulate({ seconds: 900, clicksPerSecond: 3, policy, catchMail: true });
    const t = r.prestigeReadyAt;
    assert.ok(t !== null && t >= 8 * 60 && t <= 13 * 60, `${policy}: prestige ready at ${t}`);
  }
});

test('balance: the second era is faster than the first', () => {
  const first = simulate({ seconds: 900, clicksPerSecond: 3, policy: 'agrarian', catchMail: true });
  const second = simulate({ seconds: 900, clicksPerSecond: 3, policy: 'agrarian', catchMail: true, start: prestige(first.state) });
  assert.ok(second.prestigeReadyAt !== null && first.prestigeReadyAt !== null);
  assert.ok(second.prestigeReadyAt < first.prestigeReadyAt, `${second.prestigeReadyAt} < ${first.prestigeReadyAt}`);
});

console.log(`kingdom-economy: ${passed} tests passed`);
