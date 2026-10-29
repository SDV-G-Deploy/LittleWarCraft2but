/**
 * Kingdom OS 2000 — economy core.
 *
 * Pure and deterministic: no DOM, no Date.now(), no Math.random(). Every
 * function takes a state and returns a new state (inputs are never mutated).
 * Time is passed in as seconds; randomness is passed in as a number in [0, 1).
 * The UI layer (kingdom2000.ts) owns the clock, rendering, sound and storage.
 *
 * Balance targets (see docs/KINGDOM_OS.md for the measured curve):
 *   - first purchase within ~10 s of clicking
 *   - real choices (buildings vs upgrades vs a Royal Policy) by ~2 min
 *   - first "Install next OS" (prestige) within ~10 min of active play
 */

export type BuildingId = 'peasant' | 'farm' | 'market' | 'mine' | 'tower' | 'portal';
export type PolicyId = 'agrarian' | 'merchant' | 'idle';

export interface BuildingDef {
  id: BuildingId;
  name: string;
  flavor: string;
  baseCost: number;
  baseGps: number;
}

export interface UpgradeDef {
  id: string;
  name: string;
  flavor: string;
  cost: number;
  /** Human-readable effect line. */
  effect: string;
  /** Shown in the shop once this returns true. */
  visible: (s: KingdomState) => boolean;
}

export interface PolicyDef {
  id: PolicyId;
  name: string;
  pitch: string;
  effect: string;
}

export interface AchievementDef {
  id: string;
  name: string;
  hint: string;
  done: (s: KingdomState) => boolean;
}

export interface KingdomState {
  version: 2;
  /** Spendable gold. */
  gold: number;
  /** Gold earned in the current era (drives prestige + unlocks). */
  eraEarned: number;
  /** Gold earned across every era (drives patch total). */
  lifetimeEarned: number;
  clicks: number;
  buildings: Record<BuildingId, number>;
  upgrades: string[];
  achievements: string[];
  policy: PolicyId | null;
  /** Prestige currency: each patch is a permanent +10% production. */
  patches: number;
  /** 0 = Kingdom OS 2000, 1 = ME, ... */
  era: number;
  /** Simulated seconds in the current era. */
  eraTime: number;
  /** Simulated seconds across all eras. */
  playTime: number;
  mailsCaught: number;
  /** Production multiplier from a Royal Mail frenzy, active until boostUntil (eraTime). */
  boostMult: number;
  boostUntil: number;
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export const COST_GROWTH = 1.15;
export const ERA_GOAL = 1_000_000;
export const PATCH_BONUS = 0.1;
export const ACHIEVEMENT_BONUS = 0.02;
export const OFFLINE_RATE = 0.5;
export const OFFLINE_RATE_IDLE_POLICY = 1;
export const OFFLINE_CAP_SECONDS = 8 * 3600;
export const POLICY_UNLOCK = 1_000;

export const BUILDINGS: BuildingDef[] = [
  { id: 'peasant', name: 'Peasant', flavor: 'Tills the royal fields. Never complains. Mostly.', baseCost: 10, baseGps: 0.1 },
  { id: 'farm', name: 'Sunmill Farm', flavor: 'A windmill wired to the treasury.', baseCost: 100, baseGps: 1 },
  { id: 'market', name: 'Bubble Market', flavor: 'Merchants trade shiny things for shinier things.', baseCost: 1_100, baseGps: 8 },
  { id: 'mine', name: 'Crystal Mine', flavor: 'Digs up crystals that are basically gold.', baseCost: 12_000, baseGps: 47 },
  { id: 'tower', name: 'Wizard Tower', flavor: 'Transmutes boredom into bullion.', baseCost: 130_000, baseGps: 260 },
  { id: 'portal', name: 'Sky Portal', flavor: 'Imports gold from a richer parallel kingdom.', baseCost: 1_400_000, baseGps: 1_400 },
];

const BUILDING_BY_ID = Object.fromEntries(BUILDINGS.map((b) => [b.id, b])) as Record<BuildingId, BuildingDef>;

type UpgradeEffect =
  | { kind: 'building'; building: BuildingId; mult: number }
  | { kind: 'click'; mult: number }
  | { kind: 'clickGps'; fraction: number }
  | { kind: 'global'; mult: number }
  | { kind: 'mail'; mult: number };

interface UpgradeSpec extends UpgradeDef {
  apply: UpgradeEffect;
}

const owned = (s: KingdomState, id: BuildingId, n: number) => s.buildings[id] >= n;

const UPGRADE_SPECS: UpgradeSpec[] = [
  { id: 'mouse', name: 'Ergonomic Mouse.exe', flavor: 'Two-button technology.', cost: 50, effect: 'Clicks ×2',
    visible: (s) => s.clicks >= 5 || s.eraEarned >= 25, apply: { kind: 'click', mult: 2 } },
  { id: 'plows', name: 'Iron Plows', flavor: 'Sharper than wooden ones, apparently.', cost: 150, effect: 'Peasants ×2',
    visible: (s) => owned(s, 'peasant', 3), apply: { kind: 'building', building: 'peasant', mult: 2 } },
  { id: 'windmill', name: 'Windmill Drivers', flavor: 'Plug-and-pray compatible.', cost: 900, effect: 'Farms ×2',
    visible: (s) => owned(s, 'farm', 3), apply: { kind: 'building', building: 'farm', mult: 2 } },
  { id: 'pitchforks', name: 'Turbo Pitchforks', flavor: 'Now with go-faster stripes.', cost: 2_500, effect: 'Peasants ×2',
    visible: (s) => owned(s, 'peasant', 15), apply: { kind: 'building', building: 'peasant', mult: 2 } },
  { id: 'goldmouse', name: 'Golden Mouse', flavor: 'Every click taps the whole economy.', cost: 4_000, effect: 'Clicks also give 1% of gold/sec',
    visible: (s) => s.eraEarned >= 2_000, apply: { kind: 'clickGps', fraction: 0.01 } },
  { id: 'ledgers', name: 'Bubble Ledgers', flavor: 'Double-entry, double-profit.', cost: 9_000, effect: 'Markets ×2',
    visible: (s) => owned(s, 'market', 3), apply: { kind: 'building', building: 'market', mult: 2 } },
  { id: 'mailfilter', name: 'Royal Mail Filter', flavor: 'Blocks spam, keeps treasure.', cost: 6_000, effect: 'Royal Mail arrives 2× as often',
    visible: (s) => s.mailsCaught >= 1, apply: { kind: 'mail', mult: 2 } },
  { id: 'rotation', name: 'Crop Rotation 98', flavor: 'Second edition.', cost: 15_000, effect: 'Farms ×2',
    visible: (s) => owned(s, 'farm', 15), apply: { kind: 'building', building: 'farm', mult: 2 } },
  { id: 'drills', name: 'Crystal Drills', flavor: 'Diamond-tipped, crystal-hungry.', cost: 90_000, effect: 'Mines ×2',
    visible: (s) => owned(s, 'mine', 3), apply: { kind: 'building', building: 'mine', mult: 2 } },
  { id: 'treasuryclick', name: 'Treasury Hotkey', flavor: 'Ctrl+Alt+Gold.', cost: 50_000, effect: 'Clicks give +2% of gold/sec',
    visible: (s) => s.eraEarned >= 25_000, apply: { kind: 'clickGps', fraction: 0.02 } },
  { id: 'bazaar', name: 'Online Bazaar', flavor: 'Dial-up commerce.', cost: 140_000, effect: 'Markets ×2',
    visible: (s) => owned(s, 'market', 15), apply: { kind: 'building', building: 'market', mult: 2 } },
  { id: 'defrag', name: 'Defragment the Realm', flavor: 'All the gold, now contiguous.', cost: 250_000, effect: 'All production ×1.5',
    visible: (s) => s.eraEarned >= 100_000, apply: { kind: 'global', mult: 1.5 } },
  { id: 'cache', name: 'Arcane Cache', flavor: 'Spells, pre-loaded.', cost: 900_000, effect: 'Wizard Towers ×2',
    visible: (s) => owned(s, 'tower', 3), apply: { kind: 'building', building: 'tower', mult: 2 } },
  { id: 'bandwidth', name: 'Portal Bandwidth', flavor: '56k to the multiverse.', cost: 9_000_000, effect: 'Sky Portals ×2',
    visible: (s) => owned(s, 'portal', 3), apply: { kind: 'building', building: 'portal', mult: 2 } },
];

export const UPGRADES: UpgradeDef[] = UPGRADE_SPECS;
const UPGRADE_BY_ID = Object.fromEntries(UPGRADE_SPECS.map((u) => [u.id, u])) as Record<string, UpgradeSpec>;

export const POLICIES: PolicyDef[] = [
  { id: 'agrarian', name: 'Agrarian Decree', pitch: 'For builders.', effect: 'Peasants and Farms ×3' },
  { id: 'merchant', name: 'Merchant Charter', pitch: 'For clickers.', effect: 'Clicks ×4, Markets ×2' },
  { id: 'idle', name: 'Idle Throne', pitch: 'For people with lives.', effect: 'All production ×1.3, offline earnings 100% (not 50%)' },
];

export const ERA_NAMES = [
  'Kingdom OS 2000',
  'Kingdom OS ME (Monarch Edition)',
  'Kingdom OS XP (eXtra Peasants)',
  'Kingdom OS Vista (Very Impressive Spires)',
  'Kingdom OS 7 (Seven Wonders)',
];

export function eraName(era: number): string {
  return ERA_NAMES[era] ?? `Kingdom OS Build ${era + 1}`;
}

const totalBuildings = (s: KingdomState) => BUILDINGS.reduce((n, b) => n + s.buildings[b.id], 0);

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'click1', name: 'Hello, World', hint: 'Mint your first gold.', done: (s) => s.clicks >= 1 },
  { id: 'click100', name: 'Repetitive Strain', hint: 'Click 100 times.', done: (s) => s.clicks >= 100 },
  { id: 'click1000', name: 'Mouse Wizard', hint: 'Click 1,000 times.', done: (s) => s.clicks >= 1_000 },
  { id: 'earn100', name: 'Pocket Change', hint: 'Earn 100 gold in one era.', done: (s) => s.eraEarned >= 100 },
  { id: 'earn1k', name: 'Small Fortune', hint: 'Earn 1,000 gold in one era.', done: (s) => s.eraEarned >= 1_000 },
  { id: 'earn10k', name: 'Royal Treasury', hint: 'Earn 10,000 gold in one era.', done: (s) => s.eraEarned >= 10_000 },
  { id: 'earn100k', name: 'Gold Overflow', hint: 'Earn 100,000 gold in one era.', done: (s) => s.eraEarned >= 100_000 },
  { id: 'earn1m', name: 'Millionaire Monarch', hint: 'Earn 1,000,000 gold in one era.', done: (s) => s.eraEarned >= 1_000_000 },
  { id: 'earn1b', name: 'Billion-Byte Kingdom', hint: 'Earn 1,000,000,000 gold in one era.', done: (s) => s.eraEarned >= 1e9 },
  ...BUILDINGS.map((b) => ({ id: `own-${b.id}`, name: `First ${b.name}`, hint: `Own a ${b.name}.`, done: (s: KingdomState) => s.buildings[b.id] >= 1 })),
  { id: 'peasant25', name: 'Peasant Union', hint: 'Own 25 Peasants.', done: (s) => s.buildings.peasant >= 25 },
  { id: 'build50', name: 'Urban Sprawl', hint: 'Own 50 buildings.', done: (s) => totalBuildings(s) >= 50 },
  { id: 'build150', name: 'Megalopolis.exe', hint: 'Own 150 buildings.', done: (s) => totalBuildings(s) >= 150 },
  { id: 'gps10', name: 'Trickle', hint: 'Reach 10 gold/sec.', done: (s) => goldPerSecond(s) >= 10 },
  { id: 'gps100', name: 'Stream', hint: 'Reach 100 gold/sec.', done: (s) => goldPerSecond(s) >= 100 },
  { id: 'gps1k', name: 'River of Gold', hint: 'Reach 1,000 gold/sec.', done: (s) => goldPerSecond(s) >= 1_000 },
  { id: 'gps10k', name: 'Golden Flood', hint: 'Reach 10,000 gold/sec.', done: (s) => goldPerSecond(s) >= 10_000 },
  { id: 'mail1', name: "You've Got Mail", hint: 'Open a Royal Mail.', done: (s) => s.mailsCaught >= 1 },
  { id: 'mail10', name: 'Inbox Zero', hint: 'Open 10 Royal Mails.', done: (s) => s.mailsCaught >= 10 },
  { id: 'policy', name: 'Statecraft', hint: 'Sign a Royal Policy.', done: (s) => s.policy !== null },
  { id: 'era1', name: 'System Upgrade', hint: 'Install the next Kingdom OS.', done: (s) => s.era >= 1 },
  { id: 'era3', name: 'Early Adopter', hint: 'Reach the 4th Kingdom OS.', done: (s) => s.era >= 3 },
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function emptyBuildings(): Record<BuildingId, number> {
  return { peasant: 0, farm: 0, market: 0, mine: 0, tower: 0, portal: 0 };
}

export function createState(): KingdomState {
  return {
    version: 2,
    gold: 0,
    eraEarned: 0,
    lifetimeEarned: 0,
    clicks: 0,
    buildings: emptyBuildings(),
    upgrades: [],
    achievements: [],
    policy: null,
    patches: 0,
    era: 0,
    eraTime: 0,
    playTime: 0,
    mailsCaught: 0,
    boostMult: 1,
    boostUntil: 0,
  };
}

function clone(s: KingdomState): KingdomState {
  return { ...s, buildings: { ...s.buildings }, upgrades: [...s.upgrades], achievements: [...s.achievements] };
}

// ---------------------------------------------------------------------------
// Derived numbers
// ---------------------------------------------------------------------------

export function buildingCost(id: BuildingId, ownedCount: number): number {
  return Math.ceil(BUILDING_BY_ID[id].baseCost * Math.pow(COST_GROWTH, ownedCount));
}

export function nextBuildingCost(s: KingdomState, id: BuildingId): number {
  return buildingCost(id, s.buildings[id]);
}

function upgradeEffects(s: KingdomState): UpgradeEffect[] {
  return s.upgrades.map((id) => UPGRADE_BY_ID[id]?.apply).filter((e): e is UpgradeEffect => !!e);
}

/** Per-unit gold/sec of one building, including upgrades and policy (not global multipliers). */
export function buildingUnitGps(s: KingdomState, id: BuildingId): number {
  let mult = 1;
  for (const e of upgradeEffects(s)) if (e.kind === 'building' && e.building === id) mult *= e.mult;
  if (s.policy === 'agrarian' && (id === 'peasant' || id === 'farm')) mult *= 3;
  if (s.policy === 'merchant' && id === 'market') mult *= 2;
  return BUILDING_BY_ID[id].baseGps * mult;
}

/** Multiplier applied to all production: patches, trophies, global upgrades, policy. */
export function globalMultiplier(s: KingdomState): number {
  let mult = (1 + s.patches * PATCH_BONUS) * (1 + s.achievements.length * ACHIEVEMENT_BONUS);
  for (const e of upgradeEffects(s)) if (e.kind === 'global') mult *= e.mult;
  if (s.policy === 'idle') mult *= 1.3;
  return mult;
}

export function boostActive(s: KingdomState): boolean {
  return s.boostMult > 1 && s.eraTime < s.boostUntil;
}

/** Gold per second without temporary boosts. */
export function baseGoldPerSecond(s: KingdomState): number {
  let sum = 0;
  for (const b of BUILDINGS) sum += s.buildings[b.id] * buildingUnitGps(s, b.id);
  return sum * globalMultiplier(s);
}

/** Gold per second right now, including a Royal Mail frenzy. */
export function goldPerSecond(s: KingdomState): number {
  return baseGoldPerSecond(s) * (boostActive(s) ? s.boostMult : 1);
}

export function clickValue(s: KingdomState): number {
  let mult = 1;
  let fraction = 0;
  for (const e of upgradeEffects(s)) {
    if (e.kind === 'click') mult *= e.mult;
    if (e.kind === 'clickGps') fraction += e.fraction;
  }
  if (s.policy === 'merchant') mult *= 4;
  const base = mult * (1 + s.patches * PATCH_BONUS);
  return base + goldPerSecond(s) * fraction;
}

/** Seconds between Royal Mail pop-ups (UI adds jitter). */
export function mailInterval(s: KingdomState): number {
  let mult = 1;
  for (const e of upgradeEffects(s)) if (e.kind === 'mail') mult *= e.mult;
  return 90 / mult;
}

export function offlineRate(s: KingdomState): number {
  return s.policy === 'idle' ? OFFLINE_RATE_IDLE_POLICY : OFFLINE_RATE;
}

// ---------------------------------------------------------------------------
// Actions (all return a new state)
// ---------------------------------------------------------------------------

function earn(s: KingdomState, amount: number): void {
  s.gold += amount;
  s.eraEarned += amount;
  s.lifetimeEarned += amount;
}

export function tick(state: KingdomState, dt: number): KingdomState {
  if (!(dt > 0)) return state;
  const s = clone(state);
  // Split at the boost boundary so a frenzy ending mid-tick is exact.
  let remaining = dt;
  while (remaining > 0) {
    const boosted = boostActive(s);
    const step = boosted ? Math.min(remaining, s.boostUntil - s.eraTime) : remaining;
    earn(s, goldPerSecond(s) * step);
    s.eraTime += step;
    s.playTime += step;
    remaining -= step;
  }
  if (!boostActive(s)) {
    s.boostMult = 1;
    s.boostUntil = 0;
  }
  return s;
}

export function click(state: KingdomState): { state: KingdomState; gained: number } {
  const s = clone(state);
  const gained = clickValue(state);
  s.clicks += 1;
  earn(s, gained);
  return { state: s, gained };
}

export function canBuyBuilding(s: KingdomState, id: BuildingId): boolean {
  return s.gold >= nextBuildingCost(s, id);
}

export function buyBuilding(state: KingdomState, id: BuildingId): KingdomState {
  const cost = nextBuildingCost(state, id);
  if (state.gold < cost) return state;
  const s = clone(state);
  s.gold -= cost;
  s.buildings[id] += 1;
  return s;
}

/** A building row is revealed once you could almost afford it or own the previous tier. */
export function buildingVisible(s: KingdomState, id: BuildingId): boolean {
  const index = BUILDINGS.findIndex((b) => b.id === id);
  if (index <= 0) return true;
  const prev = BUILDINGS[index - 1];
  return s.buildings[id] > 0 || s.buildings[prev.id] > 0 || s.eraEarned >= BUILDINGS[index].baseCost * 0.5;
}

export function availableUpgrades(s: KingdomState): UpgradeDef[] {
  return UPGRADE_SPECS.filter((u) => !s.upgrades.includes(u.id) && u.visible(s)).sort((a, b) => a.cost - b.cost);
}

export function buyUpgrade(state: KingdomState, id: string): KingdomState {
  const spec = UPGRADE_BY_ID[id];
  if (!spec || state.upgrades.includes(id) || !spec.visible(state) || state.gold < spec.cost) return state;
  const s = clone(state);
  s.gold -= spec.cost;
  s.upgrades.push(id);
  return s;
}

export function policyUnlocked(s: KingdomState): boolean {
  return s.eraEarned >= POLICY_UNLOCK || s.era > 0;
}

export function choosePolicy(state: KingdomState, id: PolicyId): KingdomState {
  if (state.policy || !policyUnlocked(state) || !POLICIES.some((p) => p.id === id)) return state;
  return { ...clone(state), policy: id };
}

/** Newly earned trophies (also returned in the new state). */
export function checkAchievements(state: KingdomState): { state: KingdomState; unlocked: AchievementDef[] } {
  const unlocked = ACHIEVEMENTS.filter((a) => !state.achievements.includes(a.id) && a.done(state));
  if (!unlocked.length) return { state, unlocked };
  const s = clone(state);
  s.achievements.push(...unlocked.map((a) => a.id));
  return { state: s, unlocked };
}

export type MailKind = 'treasure' | 'frenzy';

/**
 * Open a Royal Mail. `roll` in [0,1) picks the kind: treasure pays a lump sum
 * (60 s of production or 25 clicks, whichever is larger); frenzy multiplies
 * production ×5 for 20 s.
 */
export function openMail(state: KingdomState, roll: number): { state: KingdomState; kind: MailKind; gained: number } {
  const s = clone(state);
  s.mailsCaught += 1;
  if (roll < 0.6 || baseGoldPerSecond(s) <= 0) {
    const gained = Math.max(baseGoldPerSecond(s) * 60, clickValue(s) * 25, 25);
    earn(s, gained);
    return { state: s, kind: 'treasure', gained };
  }
  s.boostMult = 5;
  s.boostUntil = s.eraTime + 20;
  return { state: s, kind: 'frenzy', gained: 0 };
}

/** Total patches justified by lifetime earnings. */
export function patchesForLifetime(lifetime: number): number {
  return Math.floor(3 * Math.sqrt(Math.max(0, lifetime) / ERA_GOAL));
}

export function canPrestige(s: KingdomState): boolean {
  return s.eraEarned >= ERA_GOAL && prestigeGain(s) > 0;
}

export function prestigeGain(s: KingdomState): number {
  return Math.max(0, patchesForLifetime(s.lifetimeEarned) - s.patches);
}

/** Install the next Kingdom OS: reset the era, keep trophies, gain patches. */
export function prestige(state: KingdomState): KingdomState {
  if (!canPrestige(state)) return state;
  const fresh = createState();
  return {
    ...fresh,
    lifetimeEarned: state.lifetimeEarned,
    clicks: state.clicks,
    achievements: [...state.achievements],
    patches: state.patches + prestigeGain(state),
    era: state.era + 1,
    playTime: state.playTime,
    mailsCaught: state.mailsCaught,
  };
}

/** Credit time spent away. Boosts do not apply offline. */
export function applyOffline(state: KingdomState, secondsAway: number): { state: KingdomState; earned: number; seconds: number } {
  const seconds = Math.min(Math.max(0, secondsAway || 0), OFFLINE_CAP_SECONDS);
  const earned = baseGoldPerSecond(state) * seconds * offlineRate(state);
  if (earned <= 0) return { state, earned: 0, seconds };
  const s = clone(state);
  earn(s, earned);
  s.playTime += seconds;
  return { state: s, earned, seconds };
}

// ---------------------------------------------------------------------------
// Goals (the guided objective strip)
// ---------------------------------------------------------------------------

export interface Goal {
  id: string;
  text: string;
  progress: number;
}

const ratio = (value: number, target: number) => Math.max(0, Math.min(1, value / target));

export function currentGoal(s: KingdomState): Goal {
  const gps = baseGoldPerSecond(s);
  const goals: Array<Goal & { done: boolean }> = [
    { id: 'mint', text: 'Click the Royal Coin to mint 10 gold', progress: ratio(s.eraEarned, 10), done: s.eraEarned >= 10 || s.buildings.peasant > 0 },
    { id: 'peasant', text: 'Hire your first Peasant — it mints gold for you', progress: ratio(s.gold, nextBuildingCost(s, 'peasant')), done: s.buildings.peasant > 0 },
    { id: 'upgrade', text: 'Buy your first upgrade', progress: ratio(s.gold, availableUpgrades(s)[0]?.cost ?? 50), done: s.upgrades.length > 0 },
    { id: 'farm', text: 'Build a Sunmill Farm', progress: ratio(s.gold, nextBuildingCost(s, 'farm')), done: s.buildings.farm > 0 },
    { id: 'policy', text: `Earn ${POLICY_UNLOCK.toLocaleString('en-US')} gold to sign a Royal Policy`, progress: ratio(s.eraEarned, POLICY_UNLOCK), done: s.policy !== null },
    { id: 'market', text: 'Open a Bubble Market', progress: ratio(s.gold, nextBuildingCost(s, 'market')), done: s.buildings.market > 0 },
    { id: 'gps100', text: 'Reach 100 gold/sec', progress: ratio(gps, 100), done: gps >= 100 },
    { id: 'mine', text: 'Dig a Crystal Mine', progress: ratio(s.gold, nextBuildingCost(s, 'mine')), done: s.buildings.mine > 0 },
  ];
  const open = s.era === 0 ? goals.find((g) => !g.done) : undefined;
  if (open) return { id: open.id, text: open.text, progress: open.progress };
  if (canPrestige(s)) return { id: 'install', text: `Install ${eraName(s.era + 1)} for +${prestigeGain(s)} patches`, progress: 1 };
  return { id: 'era', text: `Earn 1M gold this era to install ${eraName(s.era + 1)}`, progress: ratio(s.eraEarned, ERA_GOAL) };
}

// ---------------------------------------------------------------------------
// Save / load
// ---------------------------------------------------------------------------

export interface SaveFile {
  state: KingdomState;
  savedAt: number;
}

export function serialize(state: KingdomState, savedAt: number): string {
  return JSON.stringify({ state, savedAt } satisfies SaveFile);
}

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

/** Parse a save; returns null for anything unreadable. Unknown ids are dropped. */
export function deserialize(raw: string | null): SaveFile | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const file = data as { state?: Partial<KingdomState>; savedAt?: unknown };
  const src = file.state;
  if (!src || typeof src !== 'object' || src.version !== 2) return null;
  const base = createState();
  const buildings = emptyBuildings();
  for (const b of BUILDINGS) buildings[b.id] = Math.floor(num(src.buildings?.[b.id]));
  const strings = (v: unknown, valid: Set<string>) =>
    Array.isArray(v) ? Array.from(new Set(v.filter((x): x is string => typeof x === 'string' && valid.has(x)))) : [];
  const policy = POLICIES.some((p) => p.id === src.policy) ? (src.policy as PolicyId) : null;
  const state: KingdomState = {
    ...base,
    gold: num(src.gold),
    eraEarned: num(src.eraEarned),
    lifetimeEarned: num(src.lifetimeEarned),
    clicks: Math.floor(num(src.clicks)),
    buildings,
    upgrades: strings(src.upgrades, new Set(UPGRADE_SPECS.map((u) => u.id))),
    achievements: strings(src.achievements, new Set(ACHIEVEMENTS.map((a) => a.id))),
    policy,
    patches: Math.floor(num(src.patches)),
    era: Math.floor(num(src.era)),
    eraTime: num(src.eraTime),
    playTime: num(src.playTime),
    mailsCaught: Math.floor(num(src.mailsCaught)),
    boostMult: Math.max(1, num(src.boostMult, 1)),
    boostUntil: num(src.boostUntil),
  };
  return { state, savedAt: num(file.savedAt) };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** 999 → "999", 1234 → "1.23K", 12_345_678 → "12.3M". Small fractions keep one decimal. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '∞';
  const sign = value < 0 ? '-' : '';
  const v = Math.abs(value);
  if (v < 10) return sign + (Math.floor(v * 10) / 10).toString();
  if (v < 1000) return sign + Math.floor(v).toString();
  const tier = Math.min(SUFFIXES.length - 1, Math.floor(Math.log10(v) / 3));
  const scaled = v / Math.pow(1000, tier);
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  const factor = Math.pow(10, digits);
  const text = (Math.floor(scaled * factor) / factor).toFixed(digits);
  return sign + text + SUFFIXES[tier];
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
