type Screen = 'menu' | 'mode' | 'playing' | 'paused' | 'ended';
type EdictId = 'harvest' | 'muster' | 'crystal' | 'festival' | 'ward' | 'scout';
type EventKind = 'blessing' | 'raid' | 'market' | 'storm' | 'festival';
type PlanId = 'growth' | 'war' | 'ritual';

type Resources = {
  gold: number;
  grain: number;
  crystal: number;
  morale: number;
};

type Cost = Partial<Resources> & {
  focus?: number;
};

type Node = {
  id: string;
  label: string;
  x: number;
  y: number;
  owner: 'royal' | 'neutral' | 'shade';
  kind: 'castle' | 'farm' | 'mine' | 'tower' | 'portal' | 'market';
  pulse: number;
};

type Unit = {
  id: number;
  side: 'royal' | 'shade';
  lane: number;
  progress: number;
  speed: number;
  hp: number;
  power: number;
};

type FloatingText = {
  text: string;
  x: number;
  y: number;
  age: number;
  tone: 'good' | 'bad' | 'neutral';
};

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  tone: 'aqua' | 'gold' | 'pink';
};

type Ceremony = {
  planId: PlanId;
  nodeId: string;
  text: string;
  tone: Spark['tone'];
  age: number;
  duration: number;
};

type Edict = {
  id: EdictId;
  title: string;
  hotkey: string;
  body: string;
  cost: Cost;
  cooldown: number;
  apply: () => void;
};

type Plan = {
  id: PlanId;
  title: string;
  shortTitle: string;
  objective: string;
  hint: string;
  targetNodeId: string;
  routeEdges: number[];
  tone: Spark['tone'];
  ceremony: string;
  isDone: () => boolean;
  progress: () => number;
  reward: () => void;
};

type GameState = {
  screen: Screen;
  elapsed: number;
  day: number;
  resources: Resources;
  focus: number;
  maxFocus: number;
  crowns: number;
  army: number;
  workers: number;
  wards: number;
  insight: number;
  battleWins: number;
  glory: number;
  threat: number;
  enemyPower: number;
  speed: 1 | 2 | 4;
  pausedBeforeOverlay: Screen;
  selectedMode: 'afk' | 'active';
  activePlan: PlanId;
  completedPlans: PlanId[];
  finalProtocolStarted: boolean;
  finalProtocolAge: number;
  ending: 'victory' | 'defeat' | null;
  lastEventAt: number;
  lastBattleAt: number;
  lastAutosaveAt: number;
  log: string[];
};

const BG_URL = `${import.meta.env.BASE_URL}assets/revival/kingdom2000-bg.png`;

const EDGES: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [1, 4],
  [2, 3],
  [4, 5],
  [5, 3],
];

const NODE_DATA: Node[] = [
  { id: 'castle', label: 'Glass Keep', x: 0.68, y: 0.31, owner: 'royal', kind: 'castle', pulse: 0 },
  { id: 'mill', label: 'Sunmill', x: 0.36, y: 0.56, owner: 'royal', kind: 'farm', pulse: 0 },
  { id: 'mine', label: 'Blue Mine', x: 0.45, y: 0.76, owner: 'royal', kind: 'mine', pulse: 0 },
  { id: 'portal', label: 'Violet Gate', x: 0.78, y: 0.60, owner: 'shade', kind: 'portal', pulse: 0 },
  { id: 'market', label: 'Bubble Market', x: 0.55, y: 0.47, owner: 'neutral', kind: 'market', pulse: 0 },
  { id: 'tower', label: 'Cloud Tower', x: 0.70, y: 0.70, owner: 'neutral', kind: 'tower', pulse: 0 },
];

const RESOURCE_LABELS: Record<keyof Resources, string> = {
  gold: 'Gold',
  grain: 'Grain',
  crystal: 'Crystal',
  morale: 'Morale',
};

const COST_LABELS: Record<keyof Resources | 'focus', string> = {
  ...RESOURCE_LABELS,
  focus: 'Focus',
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function fmt(value: number): string {
  return `${Math.floor(value)}`;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function hasEnough(state: GameState, cost: Cost): boolean {
  if (state.focus < (cost.focus ?? 0)) return false;
  return (Object.keys(RESOURCE_LABELS) as Array<keyof Resources>).every(
    (key) => state.resources[key] >= (cost[key] ?? 0),
  );
}

function spend(state: GameState, cost: Cost): void {
  for (const key of Object.keys(RESOURCE_LABELS) as Array<keyof Resources>) {
    state.resources[key] -= cost[key] ?? 0;
  }
  state.focus -= cost.focus ?? 0;
}

function resourceText(cost: Cost): string {
  const order: Array<keyof Resources | 'focus'> = ['focus', 'gold', 'grain', 'crystal', 'morale'];
  const entries = order
    .map((key) => [key, cost[key] ?? 0] as const)
    .filter(([, value]) => value > 0);
  if (!entries.length) return 'Free';
  return entries.map(([key, value]) => `${value} ${COST_LABELS[key]}`).join(' / ');
}

export function runKingdom2000(root: HTMLElement): () => void {
  root.innerHTML = `
    <main class="k2k-shell" aria-label="Kingdom OS 2000 playable proof">
      <canvas class="k2k-canvas" aria-hidden="true"></canvas>
      <section class="k2k-topbar">
        <button class="k2k-logo" data-action="menu" type="button">
          <span class="k2k-logo-mark"></span>
          <span>
            <strong>Kingdom OS 2000</strong>
            <small>Playable proof build</small>
          </span>
        </button>
        <div class="k2k-system-buttons" aria-label="System controls">
          <button data-action="speed" type="button" title="Simulation speed">1x</button>
          <button data-action="pause" type="button" title="Pause">Pause</button>
          <button data-action="restart" type="button" title="Restart">Restart</button>
        </div>
      </section>
      <section class="k2k-resource-strip" aria-label="Resources"></section>
      <aside class="k2k-command-panel" aria-label="Edicts"></aside>
      <aside class="k2k-advisor-panel" aria-label="Advisor log"></aside>
      <section class="k2k-overlay" aria-live="polite"></section>
    </main>
  `;

  function mustGet<T extends Element>(selector: string): T {
    const found = root.querySelector<T>(selector);
    if (!found) throw new Error(`Kingdom OS 2000 shell missing ${selector}`);
    return found;
  }

  const shell = mustGet<HTMLElement>('.k2k-shell');
  const canvas = mustGet<HTMLCanvasElement>('.k2k-canvas');
  const resourceStrip = mustGet<HTMLElement>('.k2k-resource-strip');
  const commandPanel = mustGet<HTMLElement>('.k2k-command-panel');
  const advisorPanel = mustGet<HTMLElement>('.k2k-advisor-panel');
  const overlay = mustGet<HTMLElement>('.k2k-overlay');
  const speedButton = mustGet<HTMLButtonElement>('[data-action="speed"]');
  const pauseButton = mustGet<HTMLButtonElement>('[data-action="pause"]');

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable');
  const ctx: CanvasRenderingContext2D = context;

  const background = new Image();
  background.src = BG_URL;

  let raf = 0;
  let lastFrame = performance.now();
  let unitId = 1;
  let debug = false;

  const nodes = NODE_DATA.map((node) => ({ ...node }));
  const units: Unit[] = [];
  const floaters: FloatingText[] = [];
  const sparks: Spark[] = [];
  const cooldowns = new Map<EdictId, number>();
  let ceremony: Ceremony | null = null;

  const state: GameState = {
    screen: 'menu',
    elapsed: 0,
    day: 1,
    resources: { gold: 120, grain: 90, crystal: 18, morale: 72 },
    focus: 76,
    maxFocus: 100,
    crowns: 0,
    army: 8,
    workers: 10,
    wards: 1,
    insight: 0,
    battleWins: 0,
    glory: 8,
    threat: 18,
    enemyPower: 18,
    speed: 1,
    pausedBeforeOverlay: 'playing',
    selectedMode: 'afk',
    activePlan: 'growth',
    completedPlans: [],
    finalProtocolStarted: false,
    finalProtocolAge: 0,
    ending: null,
    lastEventAt: 0,
    lastBattleAt: 0,
    lastAutosaveAt: 0,
    log: [
      'Royal desktop loaded. The kingdom is waiting for a first edict.',
      'Goal: complete 3 royal programs before Shade Threat reaches 100.',
    ],
  };

  function resetGame(mode: 'afk' | 'active' = state.selectedMode): void {
    state.screen = 'playing';
    state.elapsed = 0;
    state.day = 1;
    state.resources = { gold: 120, grain: 90, crystal: 18, morale: 72 };
    state.focus = mode === 'active' ? 82 : 74;
    state.maxFocus = 100;
    state.crowns = 0;
    state.army = mode === 'active' ? 10 : 8;
    state.workers = mode === 'active' ? 11 : 10;
    state.wards = 1;
    state.insight = 0;
    state.battleWins = 0;
    state.glory = 8;
    state.threat = 18;
    state.enemyPower = 18;
    state.speed = 1;
    state.selectedMode = mode;
    state.activePlan = 'growth';
    state.completedPlans = [];
    state.finalProtocolStarted = false;
    state.finalProtocolAge = 0;
    state.ending = null;
    state.lastEventAt = 0;
    state.lastBattleAt = 0;
    state.lastAutosaveAt = 0;
    state.log = [
      mode === 'afk'
        ? 'AFK Sovereign: it is slower, but not self-winning. Check the current program and spend Focus.'
        : 'Active Steward: faster incidents, sharper reward, but Focus blocks button spam.',
      'First program: Grow the realm. Harvest Boom is the clean opening.',
    ];
    for (const node of nodes) {
      const base = NODE_DATA.find((item) => item.id === node.id);
      if (base) {
        node.owner = base.owner;
        node.pulse = 0;
      }
    }
    units.length = 0;
    floaters.length = 0;
    sparks.length = 0;
    ceremony = null;
    cooldowns.clear();
    setCooldown('harvest', 1.5);
    setCooldown('muster', 2.5);
    spawnUnit('royal', 1, 0.15);
    spawnUnit('shade', 4, 0.2);
    flashNode('castle');
    renderHud();
  }

  function plans(): Plan[] {
    return [
      {
        id: 'growth',
        title: 'Grow the Realm',
        shortTitle: 'Grow',
        objective: 'Reach 18 Workers and 220 Grain.',
        targetNodeId: 'mill',
        routeEdges: [0, 1, 2],
        tone: 'gold',
        ceremony: 'Farm crown installed',
        hint:
          state.workers < 18
            ? 'Use Harvest Boom. It turns morale and Focus into workers.'
            : 'Stockpile grain. Festivals can wait until the farms are stable.',
        isDone: () => state.workers >= 18 && state.resources.grain >= 220,
        progress: () => (clamp(state.workers / 18, 0, 1) + clamp(state.resources.grain / 220, 0, 1)) / 2,
        reward: () => {
          state.glory = clamp(state.glory + 16, 0, 100);
          state.resources.morale = clamp(state.resources.morale + 9, 0, 100);
          state.resources.gold += 42;
          addFloater('+1 crown', 0.36, 0.56, 'good');
          burst(0.36, 0.56, 'gold', 34);
          flashNode('mill');
          log('Program complete: Grow the Realm. Farms now fund the crown.');
        },
      },
      {
        id: 'war',
        title: 'Win the Sky-Road',
        shortTitle: 'War',
        objective: 'Win 2 patrol battles while Threat stays under 70.',
        targetNodeId: 'portal',
        routeEdges: [2, 3, 5],
        tone: 'aqua',
        ceremony: 'Sky-road crown secured',
        hint:
          state.battleWins < 2
            ? 'Muster first, then Scout or Ward if Threat climbs.'
            : 'You have the victories. Keep Threat under 70 until the crown ships.',
        isDone: () => state.battleWins >= 2 && state.threat < 70,
        progress: () => (clamp(state.battleWins / 2, 0, 1) + clamp((70 - state.threat) / 70, 0, 1)) / 2,
        reward: () => {
          state.glory = clamp(state.glory + 20, 0, 100);
          state.threat = clamp(state.threat - 14, 0, 100);
          state.enemyPower = clamp(state.enemyPower - 12, 8, 100);
          addFloater('+1 crown', 0.78, 0.60, 'good');
          burst(0.78, 0.60, 'gold', 38);
          flashNode('portal');
          log('Program complete: Win the Sky-Road. The Shade Gate lost tempo.');
        },
      },
      {
        id: 'ritual',
        title: 'Light the Crystal Rite',
        shortTitle: 'Rite',
        objective: 'Reach 70 Crystal and 82 Morale.',
        targetNodeId: 'mine',
        routeEdges: [0, 1],
        tone: 'aqua',
        ceremony: 'Crystal crown lit',
        hint:
          state.resources.crystal < 70
            ? 'Crystal Foundry builds the rite. Scout helps the mine breathe.'
            : 'Now lift morale with Market Festival before the desktop darkens.',
        isDone: () => state.resources.crystal >= 70 && state.resources.morale >= 82,
        progress: () =>
          (clamp(state.resources.crystal / 70, 0, 1) + clamp(state.resources.morale / 82, 0, 1)) / 2,
        reward: () => {
          state.glory = clamp(state.glory + 24, 0, 100);
          state.wards += 1;
          state.threat = clamp(state.threat - 10, 0, 100);
          addFloater('+1 crown', 0.45, 0.76, 'good');
          burst(0.45, 0.76, 'aqua', 42);
          flashNode('mine');
          log('Program complete: Light the Crystal Rite. The kingdom gleams harder.');
        },
      },
    ];
  }

  function currentPlan(): Plan {
    return plans().find((plan) => plan.id === state.activePlan) ?? plans()[0];
  }

  function log(message: string): void {
    state.log.unshift(message);
    state.log = state.log.slice(0, 7);
  }

  function setCooldown(id: EdictId, seconds: number): void {
    cooldowns.set(id, seconds);
  }

  function edicts(): Edict[] {
    return [
      {
        id: 'harvest',
        title: 'Harvest Boom',
        hotkey: 'Q',
        body: 'Best for Grow: workers and grain now, morale later.',
        cost: { focus: 18, morale: 6 },
        cooldown: 8,
        apply: () => {
          spend(state, { focus: 18, morale: 6 });
          state.workers += 3;
          state.resources.gold += 34;
          state.resources.grain += 42;
          state.glory += 2;
          state.threat = clamp(state.threat + 2, 0, 100);
          addFloater('+3 workers', 0.36, 0.56, 'good');
          burst(0.36, 0.56, 'gold', 18);
          flashNode('mill');
          log('Harvest Boom: growth jumps, but overworked farms add a little Threat.');
        },
      },
      {
        id: 'muster',
        title: 'Royal Muster',
        hotkey: 'W',
        body: 'Best for War: more army, more noise at the gate.',
        cost: { focus: 24, gold: 42, grain: 18 },
        cooldown: 10,
        apply: () => {
          spend(state, { focus: 24, gold: 42, grain: 18 });
          state.army += 6;
          state.resources.morale = clamp(state.resources.morale + 4, 0, 100);
          state.threat = clamp(state.threat + 3, 0, 100);
          spawnUnit('royal', 2, 0.05);
          addFloater('+6 army', 0.68, 0.31, 'good');
          burst(0.68, 0.31, 'aqua', 22);
          flashNode('castle');
          log('Royal Muster: glass knights queue onto the sky-road and draw attention.');
        },
      },
      {
        id: 'crystal',
        title: 'Crystal Foundry',
        hotkey: 'E',
        body: 'Best for Rite: crystal surge, morale gets brittle.',
        cost: { focus: 24, gold: 36, grain: 12 },
        cooldown: 12,
        apply: () => {
          spend(state, { focus: 24, gold: 36, grain: 12 });
          state.resources.crystal += 20;
          state.resources.morale = clamp(state.resources.morale - 3, 0, 100);
          state.glory += 6;
          addFloater('+20 crystal', 0.45, 0.76, 'good');
          burst(0.45, 0.76, 'aqua', 24);
          flashNode('mine');
          log('Crystal Foundry: the mine sings, but citizens squint at the glare.');
        },
      },
      {
        id: 'festival',
        title: 'Market Festival',
        hotkey: 'A',
        body: 'Morale rescue and safe Glory, paid in crystal.',
        cost: { focus: 28, crystal: 12, grain: 20 },
        cooldown: 14,
        apply: () => {
          spend(state, { focus: 28, crystal: 12, grain: 20 });
          state.resources.morale = clamp(state.resources.morale + 22, 0, 100);
          state.resources.gold += 24;
          state.glory += 8;
          addFloater('+22 morale', 0.55, 0.47, 'good');
          burst(0.55, 0.47, 'pink', 26);
          flashNode('market');
          log('Market Festival: citizens installed joy.exe successfully.');
        },
      },
      {
        id: 'ward',
        title: 'Guardian Ward',
        hotkey: 'S',
        body: 'Threat brake. Saves bad runs, delays economy.',
        cost: { focus: 22, crystal: 10, gold: 24 },
        cooldown: 15,
        apply: () => {
          spend(state, { focus: 22, crystal: 10, gold: 24 });
          state.wards += 1;
          state.threat = clamp(state.threat - 12, 0, 100);
          state.glory += 3;
          addFloater('-12 threat', 0.70, 0.70, 'good');
          burst(0.70, 0.70, 'aqua', 30);
          flashNode('tower');
          log('Guardian Ward: a translucent firewall wraps the kingdom.');
        },
      },
      {
        id: 'scout',
        title: 'Scout Sky-Road',
        hotkey: 'D',
        body: 'Cheap read: lower enemy power, gain insight.',
        cost: { focus: 16, grain: 16, morale: 4 },
        cooldown: 9,
        apply: () => {
          spend(state, { focus: 16, grain: 16, morale: 4 });
          state.insight += 1;
          state.enemyPower = clamp(state.enemyPower - 8, 8, 90);
          state.glory += 2;
          addFloater('+1 insight', 0.70, 0.70, 'good');
          burst(0.70, 0.70, 'gold', 16);
          flashNode('tower');
          log('Scout Sky-Road: patrols found a softer route through the clouds.');
        },
      },
    ];
  }

  function canCast(edict: Edict): boolean {
    return state.screen === 'playing' && (cooldowns.get(edict.id) ?? 0) <= 0 && hasEnough(state, edict.cost);
  }

  function castEdict(id: EdictId): void {
    const edict = edicts().find((item) => item.id === id);
    if (!edict || !canCast(edict)) {
      if (edict) log(`${edict.title} blocked: wait for Focus, resources, or cooldown.`);
      return;
    }
    edict.apply();
    setCooldown(edict.id, edict.cooldown);
    checkPlanCompletion();
    renderHud();
  }

  function checkPlanCompletion(): void {
    const plan = currentPlan();
    if (state.completedPlans.includes(plan.id) || !plan.isDone()) return;

    state.completedPlans.push(plan.id);
    state.crowns = state.completedPlans.length;
    startCrownCeremony(plan);
    plan.reward();

    const next = plans().find((item) => !state.completedPlans.includes(item.id));
    if (next) {
      state.activePlan = next.id;
      log(`Next program: ${next.title}. ${next.objective}`);
      if (state.crowns === 2) triggerFinalProtocol(next);
    } else {
      endGame('victory');
    }
  }

  function isFinalProtocolActive(): boolean {
    return state.finalProtocolStarted && state.crowns === 2 && !state.completedPlans.includes(state.activePlan);
  }

  function triggerFinalProtocol(plan: Plan): void {
    if (state.finalProtocolStarted) return;

    state.finalProtocolStarted = true;
    state.finalProtocolAge = 0;
    state.focus = clamp(state.focus + 42, 0, state.maxFocus);
    state.resources.morale =
      plan.id === 'ritual'
        ? raiseToward(state.resources.morale, 8, 78)
        : clamp(state.resources.morale + 8, 0, 100);
    state.threat = clamp(state.threat + 8, 0, 94);
    state.enemyPower = clamp(state.enemyPower + 5, 8, 100);

    if (plan.id === 'growth') {
      state.workers = raiseToward(state.workers, 2, 17);
      state.resources.grain = raiseToward(state.resources.grain, 58, 210);
      addFloater('+focus +farms', 0.36, 0.56, 'good');
    } else if (plan.id === 'war') {
      state.army += 5;
      state.resources.gold += 36;
      spawnUnit('royal', 2, 0.08);
      addFloater('+focus +army', 0.68, 0.31, 'good');
    } else {
      state.resources.crystal = raiseToward(state.resources.crystal, 20, 66);
      state.resources.gold += 28;
      addFloater('+focus +crystal', 0.45, 0.76, 'good');
    }

    const target = nodes.find((node) => node.id === plan.targetNodeId);
    if (target) {
      flashNode(target.id);
      addFloater('Final Crown', target.x, target.y - 0.08, 'good');
      burst(target.x, target.y, plan.tone, 72);
      burst(target.x, target.y, 'gold', 42);
    }
    flashNode('castle');
    burst(0.68, 0.31, 'gold', 34);
    spawnUnit('shade', 4, 0.96);
    log(`Final Crown Protocol: ${plan.shortTitle} is the last crown. Focus restored, Shade answered.`);
  }

  function raiseToward(value: number, gain: number, cap: number): number {
    return value >= cap ? value : Math.min(value + gain, cap);
  }

  function flashNode(id: string): void {
    const node = nodes.find((item) => item.id === id);
    if (node) node.pulse = 1;
  }

  function addFloater(text: string, x: number, y: number, tone: FloatingText['tone']): void {
    floaters.push({ text, x, y, age: 0, tone });
  }

  function startCrownCeremony(plan: Plan): void {
    const node = nodes.find((item) => item.id === plan.targetNodeId);
    if (!node) return;

    ceremony = {
      planId: plan.id,
      nodeId: node.id,
      text: plan.ceremony,
      tone: plan.tone,
      age: 0,
      duration: 2.8,
    };
    addFloater(plan.ceremony, node.x, node.y - 0.06, 'good');
    burst(node.x, node.y, 'gold', 46);
    log(`Crown ceremony: ${plan.ceremony}.`);
  }

  function burst(x: number, y: number, tone: Spark['tone'], count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.08 + Math.random() * 0.22;
      sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.8 + Math.random() * 0.7,
        tone,
      });
    }
  }

  function spawnUnit(side: Unit['side'], lane: number, progress = side === 'royal' ? 0 : 1): void {
    units.push({
      id: unitId++,
      side,
      lane,
      progress,
      speed: side === 'royal' ? 0.034 + Math.random() * 0.018 : 0.026 + Math.random() * 0.018,
      hp: side === 'royal' ? 12 : 10,
      power: side === 'royal' ? 3 + Math.random() * 2 : 2.8 + Math.random() * 2.5,
    });
  }

  function triggerEvent(): void {
    const events: Array<{ kind: EventKind; run: () => void }> = [
      {
        kind: 'blessing',
        run: () => {
          state.resources.crystal += 8 + state.insight * 2;
          state.glory += 3;
          addFloater('sky blessing', 0.50, 0.28, 'good');
          burst(0.50, 0.28, 'aqua', 20);
          log('Event: sky blessing cached fresh crystal packets.');
        },
      },
      {
        kind: 'raid',
        run: () => {
          state.threat += 9;
          state.enemyPower += 6;
          spawnUnit('shade', 4, 0.95);
          addFloater('shade raid', 0.78, 0.60, 'bad');
          burst(0.78, 0.60, 'pink', 18);
          log('Event: Shade Gate opened a raid window.');
        },
      },
      {
        kind: 'market',
        run: () => {
          state.resources.gold += 28;
          state.resources.grain += 18;
          addFloater('market ping', 0.55, 0.47, 'good');
          burst(0.55, 0.47, 'gold', 16);
          log('Event: Bubble Market paid out old invoices.');
        },
      },
      {
        kind: 'storm',
        run: () => {
          const wardBlock = state.wards > 0;
          if (wardBlock) {
            state.wards -= 1;
            state.glory += 2;
            log('Event: glass storm hit, but a Guardian Ward absorbed it.');
          } else {
            state.resources.grain = clamp(state.resources.grain - 28, 0, 999);
            state.resources.morale = clamp(state.resources.morale - 10, 0, 100);
            state.threat += 5;
            log('Event: glass storm cracked farms and morale.');
          }
          addFloater(wardBlock ? 'ward block' : 'storm damage', 0.36, 0.56, wardBlock ? 'good' : 'bad');
          burst(0.36, 0.56, wardBlock ? 'aqua' : 'pink', 22);
        },
      },
      {
        kind: 'festival',
        run: () => {
          state.resources.morale = clamp(state.resources.morale + 12, 0, 100);
          state.glory += 5;
          log('Event: spontaneous festival made the UI sparkle.');
          addFloater('+festival', 0.68, 0.31, 'good');
          burst(0.68, 0.31, 'pink', 24);
        },
      },
    ];
    const index = Math.floor(Math.random() * events.length);
    events[index].run();
  }

  function resolveBattle(): void {
    const royal = state.army + state.resources.morale * 0.12 + state.wards * 2 + Math.random() * 10;
    const shade = state.enemyPower + state.threat * 0.08 + Math.random() * 12;
    if (royal >= shade) {
      const gloryGain = 8 + Math.floor((royal - shade) / 5);
      state.glory = clamp(state.glory + gloryGain, 0, 100);
      state.enemyPower = clamp(state.enemyPower - 7, 8, 100);
      state.army = Math.max(3, state.army - Math.floor(3 + Math.random() * 4));
      state.battleWins += 1;
      addFloater(`+${gloryGain} glory`, 0.78, 0.60, 'good');
      burst(0.78, 0.60, 'gold', 30);
      log(`Battle: royal patrol won lane ${state.battleWins}/2 for the War program.`);
    } else {
      const threatGain = 8 + Math.floor((shade - royal) / 6);
      state.threat = clamp(state.threat + threatGain, 0, 100);
      state.army = Math.max(0, state.army - Math.floor(4 + Math.random() * 5));
      state.resources.morale = clamp(state.resources.morale - 8, 0, 100);
      addFloater(`+${threatGain} threat`, 0.70, 0.70, 'bad');
      burst(0.70, 0.70, 'pink', 26);
      log(`Battle: Shade pressure broke through for +${threatGain} Threat.`);
    }
  }

  function tick(dt: number): void {
    if (state.screen !== 'playing') return;

    const scaled = dt * state.speed;
    state.elapsed += scaled;
    state.day = 1 + Math.floor(state.elapsed / 12);

    for (const id of Array.from(cooldowns.keys())) {
      cooldowns.set(id, Math.max(0, (cooldowns.get(id) ?? 0) - scaled));
    }

    const activeBonus = state.selectedMode === 'active' ? 1.16 : 1;
    state.focus = clamp(
      state.focus + scaled * (state.selectedMode === 'active' ? 2.3 : 1.45),
      0,
      state.maxFocus,
    );
    state.resources.gold += scaled * (2.1 + state.workers * 0.16) * activeBonus;
    state.resources.grain += scaled * (1.6 + state.workers * 0.15) * activeBonus;
    state.resources.crystal += scaled * (0.25 + state.insight * 0.035);
    state.resources.morale = clamp(state.resources.morale + scaled * 0.17 - scaled * state.threat * 0.012, 0, 100);
    state.glory = clamp(state.glory + scaled * (state.resources.morale > 80 ? 0.025 : 0.01), 0, 100);
    state.threat = clamp(state.threat + scaled * (0.16 + state.enemyPower * 0.005) - state.wards * scaled * 0.02, 0, 100);
    state.enemyPower = clamp(state.enemyPower + scaled * 0.07, 8, 100);

    if (Math.floor(state.elapsed) % 7 === 0 && state.elapsed - state.lastAutosaveAt > 6.5) {
      state.lastAutosaveAt = state.elapsed;
      if (state.resources.gold > 140 && state.army < 18) {
        state.resources.gold -= 32;
        state.resources.grain = Math.max(0, state.resources.grain - 12);
        state.army += 2;
        spawnUnit('royal', 1, 0.08);
        log('Autopilot: barracks bought two units from surplus gold.');
      }
    }

    const eventCadence = state.selectedMode === 'active' ? 10 : 13;
    if (state.elapsed - state.lastEventAt > eventCadence) {
      state.lastEventAt = state.elapsed;
      triggerEvent();
    }

    if (state.elapsed - state.lastBattleAt > 16) {
      state.lastBattleAt = state.elapsed;
      resolveBattle();
    }

    if (Math.random() < scaled * 0.8) spawnUnit('royal', 1 + Math.floor(Math.random() * 2), 0.02);
    if (Math.random() < scaled * 0.62) spawnUnit('shade', 3 + Math.floor(Math.random() * 2), 0.98);

    updateUnits(scaled);
    updateEffects(scaled);
    checkPlanCompletion();
    if (state.screen !== 'playing') return;

    if (state.threat >= 100 || state.resources.morale <= 0) endGame('defeat');
  }

  function updateUnits(dt: number): void {
    for (const unit of units) {
      unit.progress += (unit.side === 'royal' ? 1 : -1) * unit.speed * dt;
      const jitter = Math.sin((state.elapsed + unit.id) * 3) * 0.0009;
      unit.progress += jitter;
    }

    for (let i = units.length - 1; i >= 0; i--) {
      const unit = units[i];
      if (unit.progress < -0.05 || unit.progress > 1.05 || unit.hp <= 0) units.splice(i, 1);
    }

    for (const a of units) {
      for (const b of units) {
        if (a === b || a.side === b.side || a.lane !== b.lane) continue;
        if (Math.abs(a.progress - b.progress) < 0.045) {
          a.hp -= b.power * dt * 0.35;
          b.hp -= a.power * dt * 0.35;
          if (Math.random() < dt * 3) {
            const p = lanePoint(a.lane, (a.progress + b.progress) / 2);
            burst(p.x, p.y, Math.random() > 0.5 ? 'gold' : 'pink', 2);
          }
        }
      }
    }
  }

  function updateEffects(dt: number): void {
    if (state.finalProtocolStarted) state.finalProtocolAge = Math.min(state.finalProtocolAge + dt, 30);
    for (const node of nodes) node.pulse = Math.max(0, node.pulse - dt * 1.4);
    if (ceremony) {
      ceremony.age += dt;
      if (ceremony.age > ceremony.duration) ceremony = null;
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      floaters[i].age += dt;
      if (floaters[i].age > 1.7) floaters.splice(i, 1);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const spark = sparks[i];
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.vy += 0.03 * dt;
      spark.life -= dt;
      if (spark.life <= 0) sparks.splice(i, 1);
    }
  }

  function endGame(result: 'victory' | 'defeat'): void {
    state.screen = 'ended';
    state.ending = result;
    log(result === 'victory' ? 'Victory: the glass kingdom shipped a beautiful proof.' : 'Defeat: Shade Threat filled the desktop.');
    renderHud();
  }

  function lanePoint(lane: number, progress: number): { x: number; y: number } {
    const [from, to] = EDGES[lane % EDGES.length];
    const a = nodes[from];
    const b = nodes[to];
    return {
      x: a.x + (b.x - a.x) * progress,
      y: a.y + (b.y - a.y) * progress,
    };
  }

  function resize(): void {
    const rect = shell.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    drawBackground(w, h);
    drawWorld(w, h);
    if (debug) drawDebug(w, h);
  }

  function drawBackground(w: number, h: number): void {
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, '#10c8ff');
    gradient.addColorStop(0.42, '#88f2ff');
    gradient.addColorStop(1, '#65ffbd');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    if (background.complete && background.naturalWidth > 0) {
      const scale = Math.max(w / background.naturalWidth, h / background.naturalHeight);
      const iw = background.naturalWidth * scale;
      const ih = background.naturalHeight * scale;
      ctx.globalAlpha = 0.88;
      ctx.drawImage(background, (w - iw) * 0.55, (h - ih) * 0.48, iw, ih);
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    for (let x = -80; x < w + 160; x += 96) {
      ctx.beginPath();
      ctx.moveTo(x + Math.sin(state.elapsed * 0.3) * 12, 0);
      ctx.lineTo(x - 220, h);
      ctx.stroke();
    }
    for (let y = 40; y < h; y += 110) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y + Math.cos(state.elapsed * 0.2) * 18);
      ctx.stroke();
    }
    ctx.restore();

    const veil = ctx.createLinearGradient(0, 0, 0, h);
    veil.addColorStop(0, 'rgba(255,255,255,0.18)');
    veil.addColorStop(0.5, 'rgba(255,255,255,0.02)');
    veil.addColorStop(1, 'rgba(10,60,120,0.22)');
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, w, h);
  }

  function drawWorld(w: number, h: number): void {
    const mapRect = getMapRect(w, h);
    ctx.save();
    ctx.translate(mapRect.x, mapRect.y);
    ctx.scale(mapRect.w, mapRect.h);

    drawRoutes();
    drawProgramSpotlight();
    for (const unit of units) drawUnit(unit);
    for (const node of nodes) drawNode(node);
    drawCompletedCrowns();
    if (ceremony) drawCeremony(ceremony);
    for (const spark of sparks) drawSpark(spark);
    for (const floater of floaters) drawFloater(floater);

    ctx.restore();
  }

  function getMapRect(w: number, h: number): { x: number; y: number; w: number; h: number } {
    const compact = w < 900;
    return compact
      ? { x: w * 0.04, y: h * 0.20, w: w * 0.92, h: h * 0.54 }
      : { x: w * 0.21, y: h * 0.10, w: w * 0.72, h: h * 0.73 };
  }

  function drawRoutes(): void {
    ctx.lineCap = 'round';
    for (let i = 0; i < EDGES.length; i++) {
      drawRoutePath(i);
      ctx.strokeStyle = 'rgba(255,255,255,0.72)';
      ctx.lineWidth = 0.014;
      ctx.stroke();
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(18,224,255,0.50)' : 'rgba(255,228,62,0.36)';
      ctx.lineWidth = 0.006;
      ctx.stroke();
    }
  }

  function drawRoutePath(index: number): void {
    const [from, to] = EDGES[index];
    const a = nodes[from];
    const b = nodes[to];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 - 0.05;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(mx, my, b.x, b.y);
  }

  function toneColor(tone: Spark['tone']): string {
    if (tone === 'aqua') return '#3ff7ff';
    if (tone === 'gold') return '#ffe85c';
    return '#ff5df1';
  }

  function drawProgramSpotlight(): void {
    if (state.screen !== 'playing' && state.screen !== 'paused') return;
    const plan = currentPlan();
    if (state.completedPlans.includes(plan.id)) return;
    const target = nodes.find((node) => node.id === plan.targetNodeId);
    if (!target) return;

    const color = toneColor(plan.tone);
    const finalActive = isFinalProtocolActive();
    const pulse = (Math.sin(state.elapsed * 3.4) + 1) / 2;
    const surge = finalActive ? 0.5 + Math.sin(state.elapsed * 5.2) * 0.5 : 0;
    const intro = finalActive ? clamp(state.finalProtocolAge / 2.4, 0, 1) : 0;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.46 + pulse * 0.18 + intro * 0.16;
    ctx.shadowColor = color;
    ctx.shadowBlur = 0.045 + pulse * 0.060 + intro * 0.070;
    for (const index of plan.routeEdges) {
      drawRoutePath(index);
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.014 + pulse * 0.004 + intro * 0.006;
      ctx.stroke();
      if (finalActive) {
        ctx.strokeStyle = 'rgba(255,255,255,0.78)';
        ctx.globalAlpha = 0.20 + surge * 0.28;
        ctx.lineWidth = 0.025 + surge * 0.012;
        ctx.stroke();
        ctx.globalAlpha = 0.46 + pulse * 0.18 + intro * 0.16;
      }
    }

    ctx.translate(target.x, target.y);
    if (finalActive) {
      ctx.globalAlpha = 0.34 + surge * 0.22;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.010;
      ctx.beginPath();
      ctx.arc(0, 0, 0.138 + surge * 0.055, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.012;
      ctx.beginPath();
      ctx.arc(0, 0, 0.196 + intro * 0.06 + surge * 0.04, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.58 + intro * 0.12;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 0.058 + pulse * 0.014 + intro * 0.010, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.94)';
    ctx.lineWidth = 0.006;
    ctx.beginPath();
    ctx.arc(0, 0, 0.086 + pulse * 0.018, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.90)';
    roundedRect(-0.008, -0.102, 0.016, 0.040, 0.006);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(-0.008, -0.102, 0.034, 0.016);
    ctx.strokeStyle = 'rgba(255,255,255,0.90)';
    ctx.lineWidth = 0.003;
    ctx.strokeRect(-0.008, -0.102, 0.034, 0.016);
    ctx.restore();
  }

  function drawCompletedCrowns(): void {
    for (const plan of plans()) {
      if (!state.completedPlans.includes(plan.id)) continue;
      const node = nodes.find((item) => item.id === plan.targetNodeId);
      if (!node) continue;
      drawCrownBadge(node.x + 0.054, node.y - 0.052, plan.tone);
    }
  }

  function drawCrownBadge(x: number, y: number, tone: Spark['tone']): void {
    const color = toneColor(tone);
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = color;
    ctx.shadowBlur = 0.045;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(0, 0, 0.030, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd84f';
    ctx.beginPath();
    ctx.moveTo(-0.017, 0.010);
    ctx.lineTo(-0.017, -0.010);
    ctx.lineTo(-0.007, -0.002);
    ctx.lineTo(0, -0.018);
    ctx.lineTo(0.007, -0.002);
    ctx.lineTo(0.017, -0.010);
    ctx.lineTo(0.017, 0.010);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(7,49,77,0.42)';
    ctx.lineWidth = 0.003;
    ctx.stroke();
    ctx.restore();
  }

  function drawCeremony(activeCeremony: Ceremony): void {
    const node = nodes.find((item) => item.id === activeCeremony.nodeId);
    if (!node) return;
    const t = clamp(activeCeremony.age / activeCeremony.duration, 0, 1);
    const color = toneColor(activeCeremony.tone);
    const alpha = t < 0.72 ? 1 : 1 - (t - 0.72) / 0.28;

    ctx.save();
    ctx.translate(node.x, node.y);
    ctx.globalAlpha = alpha;
    ctx.shadowColor = color;
    ctx.shadowBlur = 0.14;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.012;
    ctx.beginPath();
    ctx.arc(0, 0, 0.13 + t * 0.13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 0.19 + t * 0.12, 0, Math.PI * 2);
    ctx.stroke();

    drawCrownBadge(0, -0.148, activeCeremony.tone);
    ctx.restore();
  }

  function drawNode(node: Node): void {
    const color = node.owner === 'royal' ? '#3edcff' : node.owner === 'shade' ? '#ff4bd8' : '#ffe66d';
    const radius = node.kind === 'castle' ? 0.054 : node.kind === 'portal' ? 0.048 : 0.039;
    ctx.save();
    ctx.translate(node.x, node.y);
    ctx.shadowColor = color;
    ctx.shadowBlur = 0.055 + node.pulse * 0.08;

    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    roundedRect(-radius * 1.28, -radius * 0.9, radius * 2.56, radius * 1.8, radius * 0.44);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.82)';
    ctx.lineWidth = 0.006;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(0, 0, radius * (0.62 + node.pulse * 0.18), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(8,42,96,0.82)';
    ctx.font = '700 0.020px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(node.label, 0, radius * 1.45);
    ctx.restore();
  }

  function drawUnit(unit: Unit): void {
    const point = lanePoint(unit.lane, unit.progress);
    const sideOffset = unit.side === 'royal' ? -0.012 : 0.012;
    const x = point.x;
    const y = point.y + sideOffset + Math.sin((state.elapsed + unit.id) * 5) * 0.003;
    const color = unit.side === 'royal' ? '#f7fcff' : '#8d22ff';
    const trim = unit.side === 'royal' ? '#177bff' : '#ff4bd8';
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = trim;
    ctx.shadowBlur = 0.025;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 0.014, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = trim;
    ctx.fillRect(-0.010, -0.026, 0.020, 0.008);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 0.003;
    ctx.stroke();
    ctx.restore();
  }

  function drawSpark(spark: Spark): void {
    const color = spark.tone === 'aqua' ? '#3ff7ff' : spark.tone === 'gold' ? '#ffe85c' : '#ff5df1';
    ctx.save();
    ctx.globalAlpha = clamp(spark.life, 0, 1);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 0.04;
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, 0.006, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFloater(floater: FloatingText): void {
    const color = floater.tone === 'good' ? '#007c8f' : floater.tone === 'bad' ? '#9d0473' : '#334155';
    ctx.save();
    ctx.globalAlpha = 1 - floater.age / 1.7;
    ctx.translate(floater.x, floater.y - floater.age * 0.035);
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    roundedRect(-0.05, -0.020, 0.10, 0.032, 0.012);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = '800 0.017px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(floater.text, 0, 0.002);
    ctx.restore();
  }

  function drawDebug(w: number, h: number): void {
    ctx.save();
    ctx.fillStyle = 'rgba(0,20,30,0.65)';
    ctx.fillRect(12, h - 92, 290, 76);
    ctx.fillStyle = '#d8fbff';
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText(`elapsed=${state.elapsed.toFixed(1)} screen=${state.screen} speed=${state.speed}`, 24, h - 64);
    ctx.fillText(`units=${units.length} sparks=${sparks.length} mode=${state.selectedMode}`, 24, h - 42);
    ctx.fillText(`glory=${state.glory.toFixed(1)} threat=${state.threat.toFixed(1)}`, 24, h - 20);
    ctx.restore();
  }

  function roundedRect(x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  function renderHud(): void {
    shell.dataset.screen = state.screen;
    if (isFinalProtocolActive()) shell.dataset.finalProtocol = 'true';
    else delete shell.dataset.finalProtocol;
    speedButton.textContent = `${state.speed}x`;
    pauseButton.textContent = state.screen === 'paused' ? 'Resume' : 'Pause';

    resourceStrip.innerHTML = `
      ${renderMeter('glory', 'Glory', state.glory, '#10bce3')}
      ${renderMeter('threat', 'Threat', state.threat, '#f42fbf')}
      ${renderMeter('focus', 'Focus', state.focus, '#ffe14d')}
      ${renderChip('crowns', isFinalProtocolActive() ? `Final ${state.crowns}/3` : `${state.crowns}/3`)}
      ${renderChip('gold', fmt(state.resources.gold))}
      ${renderChip('grain', fmt(state.resources.grain))}
      ${renderChip('crystal', fmt(state.resources.crystal))}
      ${renderChip('morale', fmt(state.resources.morale))}
    `;

    commandPanel.innerHTML = `
      <header>
        <span>Royal Desktop</span>
        <strong>Day ${state.day}</strong>
      </header>
      ${renderPlanPanel()}
      <div class="k2k-edict-grid">
        ${edicts().map(renderEdict).join('')}
      </div>
      <div class="k2k-mini-status">
        <span>Workers <b>${state.workers}</b></span>
        <span>Army <b>${state.army}</b></span>
        <span>Wards <b>${state.wards}</b></span>
        <span>Insight <b>${state.insight}</b></span>
        <span>Mode <b>${state.selectedMode === 'afk' ? 'AFK' : 'Active'}</b></span>
      </div>
    `;

    advisorPanel.innerHTML = `
      <header>
        <span>Advisor Feed</span>
        <strong>${state.ending ? titleCase(state.ending) : isFinalProtocolActive() ? 'Final Crown' : state.screen === 'playing' ? 'Live' : 'Ready'}</strong>
      </header>
      <ol>
        <li class="k2k-feed-priority">${isFinalProtocolActive() ? 'Final Crown' : currentPlan().title}: ${currentPlan().objective}</li>
        ${state.log.map((entry) => `<li>${entry}</li>`).join('')}
      </ol>
    `;

    overlay.innerHTML = renderOverlay();
  }

  function renderMeter(id: string, label: string, value: number, color: string): string {
    return `
      <article class="k2k-meter" data-meter="${id}" style="--meter:${clamp(value, 0, 100)}; --meter-color:${color}">
        <span>${label}</span>
        <strong>${fmt(value)}</strong>
        <i></i>
      </article>
    `;
  }

  function renderChip(label: string, value: string): string {
    return `
      <article class="k2k-chip" data-kind="${label}">
        <span>${titleCase(label)}</span>
        <strong>${value}</strong>
      </article>
    `;
  }

  function renderPlanPanel(): string {
    const plan = currentPlan();
    const progress = Math.round(plan.progress() * 100);
    const finalActive = isFinalProtocolActive();
    return `
      <section class="k2k-plan-panel" aria-label="Current royal program">
        <div class="k2k-plan-current ${finalActive ? 'is-final' : ''}">
          <span>${finalActive ? 'Final crown protocol' : 'Current program'}</span>
          <strong>${plan.title}</strong>
          <p>${plan.objective}</p>
          <em>${finalActive ? 'Last crown active. Spend the restored Focus before Shade pressure converts the surge.' : plan.hint}</em>
          <i style="--plan-progress:${progress}"></i>
        </div>
        <div class="k2k-plan-grid" aria-label="Royal programs">
          ${plans()
            .map((item) => {
              const done = state.completedPlans.includes(item.id);
              const active = item.id === state.activePlan;
              return `
                <button data-plan="${item.id}" class="${active ? 'is-active' : ''} ${done ? 'is-done' : ''}" type="button" ${done ? 'disabled' : ''}>
                  <b>${done ? 'OK' : `${Math.round(item.progress() * 100)}%`}</b>
                  <span>${item.shortTitle}</span>
                </button>
              `;
            })
            .join('')}
        </div>
      </section>
    `;
  }

  function renderEdict(edict: Edict): string {
    const cd = cooldowns.get(edict.id) ?? 0;
    const affordable = hasEnough(state, edict.cost);
    const disabled = state.screen !== 'playing' || cd > 0 || !affordable;
    const reason = cd > 0 ? `${Math.ceil(cd)}s` : affordable ? resourceText(edict.cost) : `Need ${resourceText(edict.cost)}`;
    return `
      <button class="k2k-edict" data-edict="${edict.id}" type="button" ${disabled ? 'disabled' : ''}>
        <span class="k2k-hotkey">${edict.hotkey}</span>
        <strong>${edict.title}</strong>
        <small>${edict.body}</small>
        <em>${reason}</em>
      </button>
    `;
  }

  function renderOverlay(): string {
    if (state.screen === 'menu') {
      return `
        <div class="k2k-card k2k-title-card">
          <p class="k2k-kicker">Minimum Beautiful Playable</p>
          <h1>Kingdom OS 2000</h1>
          <p class="k2k-lede">A glassy idle RTS command desk: pick a royal program, spend Focus on edicts, and earn 3 crowns before Shade Threat fills the desktop.</p>
          <div class="k2k-actions">
            <button data-action="mode" type="button">Start</button>
            <button data-action="instant" type="button">Quick AFK Run</button>
          </div>
        </div>
      `;
    }

    if (state.screen === 'mode') {
      return `
        <div class="k2k-card k2k-mode-card">
          <p class="k2k-kicker">Choose first playable loop</p>
          <h2>How should the kingdom behave?</h2>
          <div class="k2k-mode-grid">
            <button data-mode="afk" type="button">
              <strong>AFK Sovereign</strong>
              <span>Slower pressure. Check the current program, spend Focus, and let the kingdom breathe between edicts.</span>
            </button>
            <button data-mode="active" type="button">
              <strong>Active Steward</strong>
              <span>Faster incidents. Good for a short test, but Focus makes every click a choice.</span>
            </button>
          </div>
        </div>
      `;
    }

    if (state.screen === 'paused') {
      return `
        <div class="k2k-card k2k-pause-card">
          <p class="k2k-kicker">System paused</p>
          <h2>Kingdom suspended</h2>
          <p>Nothing moves while the royal desktop is paused.</p>
          <div class="k2k-actions">
            <button data-action="resume" type="button">Resume</button>
            <button data-action="restart" type="button">Restart</button>
            <button data-action="menu" type="button">Menu</button>
          </div>
        </div>
      `;
    }

    if (state.screen === 'ended') {
      const victory = state.ending === 'victory';
      return `
        <div class="k2k-card k2k-end-card ${victory ? 'is-victory' : 'is-defeat'}">
          <p class="k2k-kicker">${victory ? 'Victory proof' : 'Recovery proof'}</p>
          <h2>${victory ? 'The glass kingdom shipped.' : 'Shade filled the desktop.'}</h2>
          <p>${victory ? 'All three royal programs reached proof. You balanced economy, patrol pressure, and the crystal rite.' : 'The loop has failure pressure. Pick one program at a time, keep Focus for wards, and do not spend every cooldown blindly.'}</p>
          <div class="k2k-scoreline">
            <span>Crowns <b>${state.crowns}/3</b></span>
            <span>Glory <b>${fmt(state.glory)}</b></span>
            <span>Threat <b>${fmt(state.threat)}</b></span>
            <span>Day <b>${state.day}</b></span>
          </div>
          <div class="k2k-actions">
            <button data-action="restart" type="button">Rematch</button>
            <button data-action="mode" type="button">Mode Select</button>
          </div>
        </div>
      `;
    }

    return '';
  }

  function handleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
    const edict = target.closest<HTMLElement>('[data-edict]')?.dataset.edict as EdictId | undefined;
    const mode = target.closest<HTMLElement>('[data-mode]')?.dataset.mode as 'afk' | 'active' | undefined;
    const plan = target.closest<HTMLElement>('[data-plan]')?.dataset.plan as PlanId | undefined;

    if (edict) {
      castEdict(edict);
      return;
    }

    if (mode) {
      resetGame(mode);
      return;
    }

    if (plan && !state.completedPlans.includes(plan)) {
      state.activePlan = plan;
      const selected = currentPlan();
      log(`Program selected: ${selected.title}. ${selected.hint}`);
      checkPlanCompletion();
      renderHud();
      return;
    }

    if (action === 'mode') {
      state.screen = 'mode';
      renderHud();
      return;
    }
    if (action === 'instant') {
      resetGame('afk');
      return;
    }
    if (action === 'pause') {
      if (state.screen === 'playing') {
        state.pausedBeforeOverlay = 'playing';
        state.screen = 'paused';
      } else if (state.screen === 'paused') {
        state.screen = state.pausedBeforeOverlay;
      }
      renderHud();
      return;
    }
    if (action === 'resume') {
      state.screen = 'playing';
      renderHud();
      return;
    }
    if (action === 'restart') {
      resetGame(state.selectedMode);
      return;
    }
    if (action === 'speed') {
      state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 4 : 1;
      renderHud();
      return;
    }
    if (action === 'menu') {
      state.screen = 'menu';
      state.ending = null;
      renderHud();
    }
  }

  function handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (state.screen === 'playing') state.screen = 'paused';
      else if (state.screen === 'paused') state.screen = 'playing';
      renderHud();
      return;
    }
    if (event.key.toLowerCase() === 'r') {
      resetGame(state.selectedMode);
      return;
    }
    if (event.key.toLowerCase() === '`') {
      debug = !debug;
      return;
    }
    const byKey = edicts().find((edict) => edict.hotkey.toLowerCase() === event.key.toLowerCase());
    if (byKey) castEdict(byKey.id);
  }

  function loop(now: number): void {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    tick(dt);
    draw();
    if (state.screen === 'playing') renderHud();
    raf = requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  shell.addEventListener('click', handleClick);
  window.addEventListener('keydown', handleKey);
  background.addEventListener('load', draw);

  const playParam = new URLSearchParams(window.location.search).get('play');
  resize();
  if (playParam === 'active' || playParam === 'afk') resetGame(playParam);
  else renderHud();
  raf = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    shell.removeEventListener('click', handleClick);
    window.removeEventListener('keydown', handleKey);
  };
}
