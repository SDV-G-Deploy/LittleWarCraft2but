/**
 * Kingdom OS 2000 — an idle kingdom builder dressed as a retro desktop OS.
 *
 * This file is the UI shell only: DOM, input, animation, sound, storage.
 * All game rules live in ./kingdom-economy.ts (pure, unit-tested).
 */
import {
  ACHIEVEMENTS,
  BUILDINGS,
  ERA_GOAL,
  POLICIES,
  type BuildingId,
  type KingdomState,
  type PolicyId,
  applyOffline,
  availableUpgrades,
  baseGoldPerSecond,
  boostActive,
  buildingUnitGps,
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
  eraName,
  formatDuration,
  formatNumber,
  globalMultiplier,
  goldPerSecond,
  mailInterval,
  nextBuildingCost,
  offlineRate,
  openMail,
  policyUnlocked,
  prestige,
  prestigeGain,
  serialize,
  tick,
  UPGRADES,
} from './kingdom-economy';
import { createSoundBoard, type Sfx } from './kingdom-sound';

const SAVE_KEY = 'kingdom-os-2000:save:v2';
const UI_KEY = 'kingdom-os-2000:ui:v2';
const AUTOSAVE_SECONDS = 10;
const RTS_URL = './index.html';
const BG_URL = `${import.meta.env.BASE_URL}assets/revival/kingdom2000-bg.png`;

type Tab = 'build' | 'upgrades' | 'trophies' | 'os';

interface UiMeta {
  /** Onboarding step; see TUTORIAL. -1 = finished/dismissed. */
  tutorial: number;
  muted: boolean;
  tab: Tab;
  policyPrompted: boolean;
  installPrompted: boolean;
}

// ---------------------------------------------------------------------------
// Storage helpers (every access guarded: private mode / blocked storage)
// ---------------------------------------------------------------------------

function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function storageRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function loadUi(): UiMeta {
  const fallback: UiMeta = { tutorial: 0, muted: false, tab: 'build', policyPrompted: false, installPrompted: false };
  try {
    const raw = storageGet(UI_KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw) as Partial<UiMeta>;
    return {
      tutorial: typeof data.tutorial === 'number' ? data.tutorial : 0,
      muted: data.muted === true,
      tab: (['build', 'upgrades', 'trophies', 'os'] as Tab[]).includes(data.tab as Tab) ? (data.tab as Tab) : 'build',
      policyPrompted: data.policyPrompted === true,
      installPrompted: data.installPrompted === true,
    };
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Icons (inline SVG, glassy toy style)
// ---------------------------------------------------------------------------

const ICONS: Record<BuildingId | 'crown', string> = {
  crown:
    '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 46 L12 18 L24 32 L32 12 L40 32 L52 18 L56 46 Z" fill="#ffd84f" stroke="#a86b00" stroke-width="3" stroke-linejoin="round"/><rect x="8" y="46" width="48" height="8" rx="3" fill="#ffb800" stroke="#a86b00" stroke-width="3"/><circle cx="32" cy="36" r="4" fill="#ff4bd8"/><circle cx="20" cy="40" r="3" fill="#3edcff"/><circle cx="44" cy="40" r="3" fill="#3edcff"/></svg>',
  peasant:
    '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="15" r="7" fill="#ffd9b0" stroke="#7a4b1f" stroke-width="2"/><path d="M9 13 Q20 2 31 13 Z" fill="#e2a640" stroke="#7a4b1f" stroke-width="2"/><path d="M10 37 Q10 24 20 24 Q30 24 30 37 Z" fill="#3fa34d" stroke="#1d5a26" stroke-width="2"/></svg>',
  farm:
    '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="14" y="18" width="12" height="19" fill="#f4e3c1" stroke="#7a4b1f" stroke-width="2"/><path d="M12 19 L20 11 L28 19 Z" fill="#d9534f" stroke="#7a2b1f" stroke-width="2"/><g stroke="#2f6fd6" stroke-width="3" stroke-linecap="round"><line x1="20" y1="13" x2="20" y2="2"/><line x1="20" y1="13" x2="31" y2="13"/><line x1="20" y1="13" x2="9" y2="13"/><line x1="20" y1="13" x2="20" y2="24"/></g><circle cx="20" cy="13" r="2.5" fill="#fff"/></svg>',
  market:
    '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M4 16 L20 5 L36 16 Z" fill="#ff5df1" stroke="#8a1a7e" stroke-width="2"/><path d="M4 16 h32 v4 a4 4 0 0 1 -8 0 a4 4 0 0 1 -8 0 a4 4 0 0 1 -8 0 a4 4 0 0 1 -8 0 Z" fill="#fff" stroke="#8a1a7e" stroke-width="2"/><rect x="8" y="22" width="24" height="14" fill="#ffe66d" stroke="#8a6a00" stroke-width="2"/><circle cx="20" cy="29" r="3" fill="#ffb800"/></svg>',
  mine:
    '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M4 37 Q20 6 36 37 Z" fill="#7a6a5a" stroke="#3b2f25" stroke-width="2"/><path d="M14 30 L20 14 L26 30 L20 35 Z" fill="#3ff7ff" stroke="#0b6f8f" stroke-width="2"/><path d="M20 14 L20 35" stroke="#bffcff" stroke-width="1.5"/></svg>',
  tower:
    '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="13" y="14" width="14" height="23" fill="#c9d6ff" stroke="#3a3f8f" stroke-width="2"/><path d="M10 15 L20 2 L30 15 Z" fill="#6b4bff" stroke="#2a1a8f" stroke-width="2"/><rect x="17" y="20" width="6" height="7" rx="3" fill="#ffe85c"/><circle cx="20" cy="2.5" r="2" fill="#ffe85c"/></svg>',
  portal:
    '<svg viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="20" cy="20" rx="13" ry="17" fill="#8d22ff" stroke="#3f0b8f" stroke-width="2"/><ellipse cx="20" cy="20" rx="8" ry="12" fill="#3ff7ff" opacity=".85"/><ellipse cx="20" cy="20" rx="3" ry="6" fill="#fff"/></svg>',
};

const UPGRADE_ICON =
  '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="5" y="8" width="30" height="24" rx="3" fill="#e9f6ff" stroke="#235a9f" stroke-width="2"/><rect x="5" y="8" width="30" height="6" fill="#2f6fd6"/><path d="M13 27 L20 18 L27 27 Z" fill="#3fbf5a" stroke="#1d5a26" stroke-width="2"/></svg>';

// ---------------------------------------------------------------------------
// Onboarding script
// ---------------------------------------------------------------------------

interface TutorialStep {
  text: string;
  target?: string;
  button?: string;
  /** Step is finished when this returns true (checked every frame). */
  done?: (s: KingdomState) => boolean;
}

const TUTORIAL: TutorialStep[] = [
  {
    text: "Hi, I'm <b>Crownie</b>, your Royal Assistant! Your kingdom runs on gold. <b>Click the Royal Coin</b> to mint some.",
    target: '[data-coin]',
    done: (s) => s.gold >= 10 || s.buildings.peasant > 0,
  },
  {
    text: 'Great! Now <b>hire a Peasant</b>. Peasants mint gold <b>every second</b> — even while this tab is closed.',
    target: '[data-building="peasant"]',
    done: (s) => s.buildings.peasant > 0,
  },
  {
    text: 'See <b>gold/sec</b> go up? That is the whole game: buy things that make gold, to afford bigger things. The <b>Goal bar</b> at the top always says what to do next.',
    target: '[data-goal]',
    button: 'Got it',
    done: (s) => s.upgrades.length > 0 || s.buildings.farm > 0,
  },
  {
    text: 'Pro tip: <b>Upgrades</b> double what things make. And if a <b>Royal Mail</b> window pops up, open it for free gold. The big goal: earn <b>1M gold</b> to install the next Kingdom OS.',
    button: 'Let me play',
  },
];

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export function runKingdom2000(root: HTMLElement): () => void {
  const ui = loadUi();
  const sound = createSoundBoard(ui.muted);

  const loaded = deserialize(storageGet(SAVE_KEY));
  let state: KingdomState = loaded ? loaded.state : createState();
  const hadSave = !!loaded && (loaded.state.lifetimeEarned > 0 || loaded.state.clicks > 0);
  let offlineReport: { earned: number; seconds: number } | null = null;
  if (loaded && loaded.savedAt > 0) {
    const away = (Date.now() - loaded.savedAt) / 1000;
    const r = applyOffline(state, away);
    state = r.state;
    if (r.earned > 0 && r.seconds >= 30) offlineReport = { earned: r.earned, seconds: r.seconds };
  }
  // Trophies earned offline are granted silently.
  state = checkAchievements(state).state;

  root.innerHTML = `
    <div class="kos" data-screen="boot">
      <div class="kos-wallpaper" style="background-image:url('${BG_URL}')" aria-hidden="true"></div>

      <section class="kos-boot" aria-labelledby="kos-boot-title">
        <div class="kos-boot-card">
          <div class="kos-boot-logo">${ICONS.crown}</div>
          <p class="kos-kicker">Idle kingdom builder · LittleWarCraft2but side game</p>
          <h1 id="kos-boot-title">Kingdom OS <span>2000</span></h1>
          <p class="kos-pitch">Your kingdom is an operating system. <b>Click</b> to mint gold, <b>build</b> things that mint it for you, then <b>upgrade the OS</b> for permanent boosts.</p>
          <ol class="kos-steps">
            <li><span>1</span><b>Click</b> the Royal Coin</li>
            <li><span>2</span><b>Build</b> peasants, farms, mines…</li>
            <li><span>3</span><b>Install</b> the next Kingdom OS</li>
          </ol>
          <div class="kos-boot-actions">
            <button type="button" class="kos-btn kos-btn-primary" data-action="boot">${hadSave ? 'Continue my kingdom' : 'Start my kingdom'}</button>
            <a class="kos-btn kos-btn-ghost" href="${RTS_URL}">← Back to the RTS</a>
          </div>
          <p class="kos-boot-meta" data-boot-meta></p>
        </div>
      </section>

      <div class="kos-desktop" aria-hidden="true">
        <header class="kos-goalbar" data-goal role="status" aria-live="polite">
          <span class="kos-goal-label">Goal</span>
          <span class="kos-goal-text" data-goal-text></span>
          <span class="kos-goal-bar"><i data-goal-fill></i></span>
        </header>

        <section class="kos-win kos-win-treasury" aria-label="Treasury">
          <div class="kos-titlebar"><span class="kos-titlebar-icon">${ICONS.crown}</span><span>Treasury.exe</span><span class="kos-titlebar-btns" aria-hidden="true"><i>_</i><i>□</i><i>×</i></span></div>
          <div class="kos-treasury-body">
            <div class="kos-wealth">
              <div class="kos-gold"><strong data-gold>0</strong><span>gold</span></div>
              <div class="kos-gps"><b data-gps>0</b> gold/sec <em data-boost hidden>×5 FRENZY</em></div>
              <div class="kos-era-chip" data-era-chip></div>
            </div>
            <button type="button" class="kos-coin" data-coin aria-label="Royal Coin: click to mint gold">
              <span class="kos-coin-face">${ICONS.crown}</span>
              <span class="kos-coin-value" data-click-value>+1</span>
            </button>
            <div class="kos-realm" data-realm aria-label="Your realm"></div>
          </div>
        </section>

        <section class="kos-win kos-win-shop" aria-label="Kingdom control panel">
          <div class="kos-titlebar"><span class="kos-titlebar-icon">${UPGRADE_ICON}</span><span>Control Panel</span><span class="kos-titlebar-btns" aria-hidden="true"><i>_</i><i>□</i><i>×</i></span></div>
          <nav class="kos-tabs" role="tablist" aria-label="Panels">
            <button type="button" role="tab" data-tab="build">Build</button>
            <button type="button" role="tab" data-tab="upgrades">Upgrades <span class="kos-badge" data-badge="upgrades" hidden></span></button>
            <button type="button" role="tab" data-tab="trophies">Trophies <span class="kos-count" data-badge="trophies"></span></button>
            <button type="button" role="tab" data-tab="os">Next OS <span class="kos-badge" data-badge="os" hidden></span></button>
          </nav>
          <div class="kos-panel" data-panel="build" role="tabpanel"></div>
          <div class="kos-panel" data-panel="upgrades" role="tabpanel"></div>
          <div class="kos-panel" data-panel="trophies" role="tabpanel"></div>
          <div class="kos-panel" data-panel="os" role="tabpanel"></div>
        </section>
      </div>

      <div class="kos-assistant" data-assistant hidden role="dialog" aria-label="Royal Assistant">
        <div class="kos-crownie" aria-hidden="true">${ICONS.crown}<i></i><i></i></div>
        <div class="kos-bubble">
          <p data-assistant-text></p>
          <div class="kos-bubble-actions">
            <button type="button" class="kos-btn kos-btn-small kos-btn-primary" data-action="assistant-next" hidden></button>
            <button type="button" class="kos-btn kos-btn-small kos-btn-ghost" data-action="assistant-skip">Skip tips</button>
          </div>
        </div>
      </div>

      <div class="kos-mail-layer" data-mail-layer></div>
      <div class="kos-fx" data-fx aria-hidden="true"></div>
      <div class="kos-toasts" data-toasts aria-live="polite"></div>

      <div class="kos-startmenu" data-startmenu hidden role="menu" aria-label="Start menu">
        <div class="kos-startmenu-side" aria-hidden="true">Kingdom<b>OS</b></div>
        <div class="kos-startmenu-items">
          <button type="button" role="menuitem" data-action="help">❓ How to play</button>
          <button type="button" role="menuitem" data-action="save">💾 Save now</button>
          <button type="button" role="menuitem" data-action="mute-menu">🔊 Sound on/off</button>
          <a role="menuitem" href="${RTS_URL}">⚔️ Back to the RTS</a>
          <hr />
          <button type="button" role="menuitem" data-action="reset" class="is-danger">⏻ Reset kingdom…</button>
        </div>
      </div>

      <footer class="kos-taskbar" aria-label="Taskbar">
        <button type="button" class="kos-start" data-action="start" aria-haspopup="menu" aria-expanded="false"><span class="kos-start-icon">${ICONS.crown}</span>Start</button>
        <a class="kos-task kos-task-rts" href="${RTS_URL}" title="Back to the LittleWarCraft2but RTS">⚔️ <span>RTS</span></a>
        <span class="kos-task kos-task-era" data-task-era></span>
        <span class="kos-tray">
          <span class="kos-saved" data-saved aria-live="off">saved</span>
          <button type="button" class="kos-tray-btn" data-action="mute" aria-pressed="false" aria-label="Mute sound"></button>
          <span class="kos-clock" data-clock></span>
        </span>
      </footer>

      <div class="kos-modal-layer" data-modal hidden>
        <div class="kos-win kos-dialog" role="dialog" aria-modal="true" aria-labelledby="kos-dialog-title">
          <div class="kos-titlebar"><span class="kos-titlebar-icon">${ICONS.crown}</span><span id="kos-dialog-title" data-dialog-title></span><button type="button" class="kos-titlebar-close" data-action="close-modal" aria-label="Close">×</button></div>
          <div class="kos-dialog-body" data-dialog-body></div>
        </div>
      </div>
    </div>
  `;

  const $ = <T extends Element = HTMLElement>(sel: string): T => {
    const el = root.querySelector<T>(sel);
    if (!el) throw new Error(`Kingdom OS: missing ${sel}`);
    return el;
  };

  const shell = $('.kos');
  const desktop = $('.kos-desktop');
  const goldEl = $('[data-gold]');
  const gpsEl = $('[data-gps]');
  const boostEl = $('[data-boost]');
  const eraChip = $('[data-era-chip]');
  const coin = $<HTMLButtonElement>('[data-coin]');
  const clickValueEl = $('[data-click-value]');
  const realm = $('[data-realm]');
  const goalText = $('[data-goal-text]');
  const goalFill = $('[data-goal-fill]');
  const goalBar = $('[data-goal]');
  const panels: Record<Tab, HTMLElement> = {
    build: $('[data-panel="build"]'),
    upgrades: $('[data-panel="upgrades"]'),
    trophies: $('[data-panel="trophies"]'),
    os: $('[data-panel="os"]'),
  };
  const badgeUpgrades = $('[data-badge="upgrades"]');
  const badgeTrophies = $('[data-badge="trophies"]');
  const badgeOs = $('[data-badge="os"]');
  const assistant = $('[data-assistant]');
  const assistantText = $('[data-assistant-text]');
  const assistantNext = $<HTMLButtonElement>('[data-action="assistant-next"]');
  const mailLayer = $('[data-mail-layer]');
  const fx = $('[data-fx]');
  const toasts = $('[data-toasts]');
  const startMenu = $('[data-startmenu]');
  const startButton = $<HTMLButtonElement>('[data-action="start"]');
  const muteButton = $<HTMLButtonElement>('[data-action="mute"]');
  const savedEl = $('[data-saved]');
  const clockEl = $('[data-clock]');
  const taskEra = $('[data-task-era]');
  const modal = $('[data-modal]');
  const dialogTitle = $('[data-dialog-title]');
  const dialogBody = $('[data-dialog-body]');
  const bootMeta = $('[data-boot-meta]');

  let raf = 0;
  let last = performance.now();
  let timeScale = 1;
  let sinceSave = 0;
  let sinceHud = 1;
  let booted = false;
  let mailTimer = 25; // first mail after ~25s of an era with income
  let mailOpen = false;
  let lastModalFocus: HTMLElement | null = null;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  // Structure keys: panels are rebuilt only when what they list changes.
  const keys: Record<Tab, string> = { build: '', upgrades: '', trophies: '', os: '' };
  const seenBuildings = new Set<BuildingId>(BUILDINGS.filter((b) => buildingVisible(state, b.id)).map((b) => b.id));
  const seenUpgrades = new Set<string>(availableUpgrades(state).map((u) => u.id));
  let realmKey = '';

  if (loaded) bootMeta.textContent = `${eraName(state.era)} · ${formatNumber(state.gold)} gold · ${formatNumber(baseGoldPerSecond(state))}/sec`;

  // ------------------------------------------------------------------ save

  function save(manual = false): void {
    const ok = storageSet(SAVE_KEY, serialize(state, Date.now()));
    sinceSave = 0;
    if (ok) {
      savedEl.classList.remove('is-flash');
      void savedEl.offsetWidth;
      savedEl.classList.add('is-flash');
    } else if (manual) {
      toast('Could not save', 'Your browser is blocking storage. Progress lasts until you close the tab.', 'bad');
    }
  }

  function saveUi(): void {
    storageSet(UI_KEY, JSON.stringify(ui));
  }

  // ------------------------------------------------------------------ fx

  function play(sfx: Sfx): void {
    sound.play(sfx);
  }

  function floatText(text: string, x: number, y: number, tone: 'gold' | 'good' | 'bad' = 'gold'): void {
    const el = document.createElement('span');
    el.className = `kos-float is-${tone}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    fx.appendChild(el);
    window.setTimeout(() => el.remove(), 1000);
  }

  function sparkle(x: number, y: number, count: number): void {
    if (reducedMotion) return;
    if (fx.childElementCount > 120) return;
    for (let i = 0; i < count; i++) {
      const el = document.createElement('i');
      el.className = 'kos-spark';
      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 60;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      el.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
      el.style.setProperty('--hue', `${[48, 186, 310][i % 3]}`);
      fx.appendChild(el);
      window.setTimeout(() => el.remove(), 700);
    }
  }

  function centerOf(el: Element): { x: number; y: number } {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function toast(title: string, body: string, tone: 'good' | 'bad' | 'trophy' | 'info' = 'info'): void {
    const el = document.createElement('div');
    el.className = `kos-toast is-${tone}`;
    el.innerHTML = `<b></b><span></span>`;
    (el.querySelector('b') as HTMLElement).textContent = title;
    (el.querySelector('span') as HTMLElement).textContent = body;
    toasts.prepend(el);
    while (toasts.childElementCount > 3) toasts.lastElementChild?.remove();
    window.setTimeout(() => el.classList.add('is-leaving'), 3600);
    window.setTimeout(() => el.remove(), 4000);
  }

  // ------------------------------------------------------------------ rules glue

  function afterChange(): void {
    const r = checkAchievements(state);
    state = r.state;
    for (const a of r.unlocked) {
      toast(`🏆 Trophy: ${a.name}`, `${a.hint} (+2% production)`, 'trophy');
      play('trophy');
    }
    sinceHud = 1; // refresh now
  }

  function doClick(e?: MouseEvent | KeyboardEvent): void {
    const r = click(state);
    state = r.state;
    play('click');
    coin.classList.remove('is-pressed');
    void coin.offsetWidth;
    coin.classList.add('is-pressed');
    let x: number;
    let y: number;
    if (e instanceof MouseEvent && e.clientX > 0) {
      x = e.clientX;
      y = e.clientY;
    } else {
      ({ x, y } = centerOf(coin));
    }
    floatText(`+${formatNumber(r.gained)}`, x, y - 10);
    sparkle(x, y, 5);
    afterChange();
  }

  function doBuyBuilding(id: BuildingId, button: HTMLElement): void {
    const before = state;
    state = buyBuilding(state, id);
    if (state === before) {
      play('error');
      button.classList.remove('is-denied');
      void button.offsetWidth;
      button.classList.add('is-denied');
      return;
    }
    play('buy');
    const { x, y } = centerOf(button);
    floatText(`+1 ${BUILDINGS.find((b) => b.id === id)?.name ?? ''}`, x, y, 'good');
    sparkle(x, y, 8);
    afterChange();
  }

  function doBuyUpgrade(id: string, button: HTMLElement): void {
    const before = state;
    state = buyUpgrade(state, id);
    if (state === before) {
      play('error');
      return;
    }
    play('upgrade');
    const { x, y } = centerOf(button);
    sparkle(x, y, 14);
    const def = UPGRADES.find((u) => u.id === id);
    if (def) toast(`Installed ${def.name}`, def.effect, 'good');
    afterChange();
  }

  function doPolicy(id: PolicyId): void {
    const before = state;
    state = choosePolicy(state, id);
    if (state === before) return;
    play('upgrade');
    const def = POLICIES.find((p) => p.id === id);
    if (def) toast(`Signed: ${def.name}`, def.effect, 'good');
    closeModal();
    afterChange();
    save();
  }

  function doInstall(): void {
    if (!canPrestige(state)) return;
    const gain = prestigeGain(state);
    const nextName = eraName(state.era + 1);
    closeModal();
    play('install');
    shell.classList.add('is-installing');
    const overlay = document.createElement('div');
    overlay.className = 'kos-install';
    overlay.innerHTML = `<div class="kos-install-card"><div class="kos-boot-logo">${ICONS.crown}</div><p>Installing</p><h2></h2><div class="kos-install-bar"><i></i></div><small>Keeping trophies · adding ${gain} patches</small></div>`;
    (overlay.querySelector('h2') as HTMLElement).textContent = nextName;
    shell.appendChild(overlay);
    window.setTimeout(
      () => {
        state = prestige(state);
        ui.policyPrompted = false;
        ui.installPrompted = false;
        saveUi();
        for (const k of Object.keys(keys) as Tab[]) keys[k] = '';
        seenBuildings.clear();
        seenUpgrades.clear();
        mailTimer = 25;
        afterChange();
        save();
        shell.classList.remove('is-installing');
        overlay.classList.add('is-done');
        window.setTimeout(() => overlay.remove(), 500);
        toast(`Welcome to ${nextName}`, `+${gain} patches: everything now makes ${formatNumber(state.patches * 10)}% more.`, 'trophy');
        setTab('build');
      },
      reducedMotion ? 300 : 2200,
    );
  }

  // ------------------------------------------------------------------ mail

  function spawnMail(): void {
    if (mailOpen) return;
    mailOpen = true;
    play('mail');
    const el = document.createElement('div');
    el.className = 'kos-win kos-mail';
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-label', 'Royal Mail');
    const maxX = Math.max(8, window.innerWidth - 250);
    const maxY = Math.max(70, window.innerHeight - 220);
    el.style.left = `${8 + Math.random() * (maxX - 8)}px`;
    el.style.top = `${70 + Math.random() * (maxY - 70)}px`;
    el.innerHTML = `
      <div class="kos-titlebar"><span>📨 Royal Mail</span></div>
      <div class="kos-mail-body"><p>You've got mail from the Crown!</p>
      <button type="button" class="kos-btn kos-btn-primary kos-btn-small" data-mail-open>Open it</button></div>`;
    mailLayer.appendChild(el);
    const btn = el.querySelector<HTMLButtonElement>('[data-mail-open]');
    const expire = window.setTimeout(() => {
      el.classList.add('is-leaving');
      window.setTimeout(() => el.remove(), 400);
      mailOpen = false;
    }, 13000);
    btn?.addEventListener('click', () => {
      window.clearTimeout(expire);
      const r = openMail(state, Math.random());
      state = r.state;
      play('open');
      const { x, y } = centerOf(el);
      sparkle(x, y, 18);
      if (r.kind === 'treasure') {
        floatText(`+${formatNumber(r.gained)}`, x, y, 'good');
        toast('Royal Mail: treasure!', `The Crown sent ${formatNumber(r.gained)} gold.`, 'good');
      } else {
        toast('Royal Mail: FRENZY!', 'All production ×5 for 20 seconds.', 'good');
      }
      el.remove();
      mailOpen = false;
      afterChange();
    });
  }

  // ------------------------------------------------------------------ modal

  function openModal(title: string, html: string): void {
    lastModalFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogTitle.textContent = title;
    dialogBody.innerHTML = html;
    modal.hidden = false;
    const focusable = dialogBody.querySelector<HTMLElement>('button, a') ?? $<HTMLElement>('[data-action="close-modal"]');
    focusable.focus();
  }

  function closeModal(): void {
    if (modal.hidden) return;
    modal.hidden = true;
    lastModalFocus?.focus?.();
  }

  function showPolicyModal(): void {
    ui.policyPrompted = true;
    saveUi();
    openModal(
      'Sign a Royal Policy',
      `<p>Pick <b>one</b> policy for this era. It lasts until you install the next Kingdom OS, then you can pick again.</p>
       <div class="kos-policy-grid">${POLICIES.map(
         (p) => `<button type="button" class="kos-policy" data-policy="${p.id}"><strong>${p.name}</strong><em>${p.pitch}</em><span>${p.effect}</span></button>`,
       ).join('')}</div>`,
    );
  }

  function showInstallModal(): void {
    const gain = prestigeGain(state);
    openModal(
      `Install ${eraName(state.era + 1)}?`,
      `<p class="kos-dialog-lede">A fresh install wipes this era but makes every future era faster.</p>
       <ul class="kos-install-list">
         <li class="is-good">+${gain} patches → +${gain * 10}% to all gold, forever (now ${state.patches})</li>
         <li class="is-good">Keep all ${state.achievements.length} trophies (+2% each)</li>
         <li class="is-bad">Reset gold, buildings, upgrades and your Royal Policy</li>
       </ul>
       <div class="kos-dialog-actions">
         <button type="button" class="kos-btn kos-btn-primary" data-action="install-confirm">Install now</button>
         <button type="button" class="kos-btn kos-btn-ghost" data-action="close-modal">Not yet</button>
       </div>`,
    );
  }

  function showHelp(): void {
    openModal(
      'How to play Kingdom OS 2000',
      `<ol class="kos-help">
        <li><b>Click the Royal Coin</b> to mint gold by hand.</li>
        <li><b>Build</b> Peasants, Farms, Markets, Mines, Towers and Portals. Each makes gold every second, forever. Each one costs 15% more than the last.</li>
        <li><b>Upgrades</b> appear as your kingdom grows. Most double a building's output.</li>
        <li>At 1,000 gold, sign a <b>Royal Policy</b>: one strategic choice per era.</li>
        <li><b>Royal Mail</b> pops up now and then. Open it for a gold bonus or a ×5 frenzy.</li>
        <li><b>Trophies</b> each add +2% to everything.</li>
        <li>At 1M gold earned in an era, <b>install the next Kingdom OS</b>: restart with permanent patches (+10% each). Each era goes faster.</li>
        <li>Closed the tab? Your kingdom keeps earning at ${Math.round(offlineRate(state) * 100)}% speed for up to 8 hours.</li>
      </ol>
      <p class="kos-muted">Saves automatically every ${AUTOSAVE_SECONDS}s in this browser.</p>`,
    );
  }

  function showReset(): void {
    openModal(
      'Reset kingdom?',
      `<p>This deletes <b>everything</b>: gold, buildings, trophies, patches and eras. It cannot be undone.</p>
       <div class="kos-dialog-actions">
         <button type="button" class="kos-btn kos-btn-danger" data-action="reset-confirm">Delete my kingdom</button>
         <button type="button" class="kos-btn kos-btn-ghost" data-action="close-modal">Cancel</button>
       </div>`,
    );
  }

  function showWelcomeBack(report: { earned: number; seconds: number }): void {
    openModal(
      'Welcome back, Your Majesty',
      `<p class="kos-dialog-lede">While you were away for <b>${formatDuration(report.seconds)}</b>, your kingdom earned</p>
       <p class="kos-big-number">+${formatNumber(report.earned)} gold</p>
       <p class="kos-muted">Offline earnings run at ${Math.round(offlineRate(state) * 100)}% speed, up to 8 hours.</p>
       <div class="kos-dialog-actions"><button type="button" class="kos-btn kos-btn-primary" data-action="close-modal">Collect</button></div>`,
    );
  }

  // ------------------------------------------------------------------ tabs & panels

  function setTab(tab: Tab): void {
    ui.tab = tab;
    saveUi();
    for (const t of Object.keys(panels) as Tab[]) {
      panels[t].hidden = t !== tab;
      const btn = root.querySelector<HTMLElement>(`[data-tab="${t}"]`);
      btn?.setAttribute('aria-selected', String(t === tab));
      btn?.classList.toggle('is-active', t === tab);
    }
    sinceHud = 1;
  }

  function renderBuildPanel(): void {
    const visible = BUILDINGS.filter((b) => buildingVisible(state, b.id));
    const hiddenNext = BUILDINGS.find((b) => !buildingVisible(state, b.id));
    const key = visible.map((b) => b.id).join(',') + `|${hiddenNext?.id ?? ''}|${state.policy}|${state.upgrades.length}`;
    if (key !== keys.build) {
      keys.build = key;
      panels.build.innerHTML =
        visible
          .map((b) => {
            const isNew = !seenBuildings.has(b.id);
            seenBuildings.add(b.id);
            return `
          <button type="button" class="kos-row kos-building ${isNew ? 'is-new' : ''}" data-building="${b.id}">
            <span class="kos-row-icon">${ICONS[b.id]}</span>
            <span class="kos-row-main">
              <strong>${b.name}</strong>
              <small>${b.flavor}</small>
              <em data-each></em>
            </span>
            <span class="kos-row-side">
              <span class="kos-owned" data-owned></span>
              <span class="kos-cost" data-cost></span>
            </span>
          </button>`;
          })
          .join('') +
        (hiddenNext
          ? `<div class="kos-row kos-locked" aria-label="Locked building"><span class="kos-row-icon">?</span><span class="kos-row-main"><strong>???</strong><small>Earn ${formatNumber(hiddenNext.baseCost * 0.5)} gold this era to reveal.</small></span></div>`
          : '');
    }
    for (const b of visible) {
      const row = panels.build.querySelector<HTMLButtonElement>(`[data-building="${b.id}"]`);
      if (!row) continue;
      const cost = nextBuildingCost(state, b.id);
      const affordable = state.gold >= cost;
      row.classList.toggle('is-affordable', affordable);
      row.setAttribute('aria-disabled', String(!affordable));
      const each = buildingUnitGps(state, b.id) * globalMultiplier(state);
      setText(row.querySelector('[data-owned]'), String(state.buildings[b.id]));
      setText(row.querySelector('[data-cost]'), `${formatNumber(cost)} g`);
      setText(row.querySelector('[data-each]'), `+${formatNumber(each)}/sec each`);
      row.setAttribute('aria-label', `Buy ${b.name} for ${formatNumber(cost)} gold. Owned ${state.buildings[b.id]}. Makes ${formatNumber(each)} gold per second each.`);
    }
  }

  function renderUpgradesPanel(): void {
    const list = availableUpgrades(state);
    const key = list.map((u) => u.id).join(',');
    if (key !== keys.upgrades) {
      keys.upgrades = key;
      const fresh = list.filter((u) => !seenUpgrades.has(u.id));
      if (fresh.length && booted && state.eraTime > 1) {
        toast('New upgrade available', fresh.map((u) => u.name).join(', '), 'info');
      }
      panels.upgrades.innerHTML = list.length
        ? list
            .map((u) => {
              const isNew = !seenUpgrades.has(u.id);
              seenUpgrades.add(u.id);
              return `
            <button type="button" class="kos-row kos-upgrade ${isNew ? 'is-new' : ''}" data-upgrade="${u.id}" aria-label="Buy ${u.name} for ${formatNumber(u.cost)} gold: ${u.effect}">
              <span class="kos-row-icon">${UPGRADE_ICON}</span>
              <span class="kos-row-main"><strong>${u.name}</strong><small>${u.flavor}</small><em>${u.effect}</em></span>
              <span class="kos-row-side"><span class="kos-cost">${formatNumber(u.cost)} g</span></span>
            </button>`;
            })
            .join('')
        : `<p class="kos-empty">No upgrades yet. Keep building — new ones appear as your kingdom grows.</p>`;
      const owned = UPGRADES.filter((u) => state.upgrades.includes(u.id));
      if (owned.length) {
        panels.upgrades.insertAdjacentHTML(
          'beforeend',
          `<p class="kos-subhead">Installed (${owned.length})</p><div class="kos-installed">${owned
            .map((u) => `<span title="${u.effect}">${u.name}</span>`)
            .join('')}</div>`,
        );
      }
    }
    let affordable = 0;
    for (const u of list) {
      const row = panels.upgrades.querySelector<HTMLElement>(`[data-upgrade="${u.id}"]`);
      const ok = state.gold >= u.cost;
      if (ok) affordable++;
      row?.classList.toggle('is-affordable', ok);
      row?.setAttribute('aria-disabled', String(!ok));
    }
    badgeUpgrades.hidden = affordable === 0;
    badgeUpgrades.textContent = String(affordable);
  }

  function renderTrophiesPanel(): void {
    const key = state.achievements.join(',');
    badgeTrophies.textContent = `${state.achievements.length}/${ACHIEVEMENTS.length}`;
    if (key === keys.trophies) return;
    keys.trophies = key;
    panels.trophies.innerHTML = `
      <p class="kos-subhead">${state.achievements.length} of ${ACHIEVEMENTS.length} unlocked · +${state.achievements.length * 2}% to all production</p>
      <div class="kos-trophies">${ACHIEVEMENTS.map((a) => {
        const done = state.achievements.includes(a.id);
        return `<div class="kos-trophy ${done ? 'is-done' : ''}"><span>${done ? '🏆' : '🔒'}</span><b>${done ? a.name : '???'}</b><small>${a.hint}</small></div>`;
      }).join('')}</div>`;
  }

  function renderOsPanel(): void {
    const ready = canPrestige(state);
    const pct = Math.min(100, (state.eraEarned / ERA_GOAL) * 100);
    const key = `${state.era}|${state.policy}|${policyUnlocked(state)}|${ready}|${state.patches}|${prestigeGain(state)}`;
    badgeOs.hidden = !(ready || (policyUnlocked(state) && !state.policy));
    badgeOs.textContent = '!';
    if (key !== keys.os) {
      keys.os = key;
      const policy = POLICIES.find((p) => p.id === state.policy);
      panels.os.innerHTML = `
        <div class="kos-os-card">
          <p class="kos-subhead">Currently running</p>
          <h3>${eraName(state.era)}</h3>
          <p>Patches installed: <b>${state.patches}</b> (+${state.patches * 10}% to everything)</p>
        </div>
        <div class="kos-os-card">
          <p class="kos-subhead">Royal Policy (one per era)</p>
          ${
            policy
              ? `<h3>${policy.name}</h3><p>${policy.effect}</p>`
              : policyUnlocked(state)
                ? `<p>You can sign a policy now.</p><button type="button" class="kos-btn kos-btn-primary" data-action="policy">Choose a policy</button>`
                : `<p>Unlocks after earning 1,000 gold this era.</p>`
          }
        </div>
        <div class="kos-os-card kos-os-next ${ready ? 'is-ready' : ''}">
          <p class="kos-subhead">Next version</p>
          <h3>${eraName(state.era + 1)}</h3>
          <p>Earn 1M gold this era to install it. You restart, but keep trophies and gain <b>patches</b> (+10% each, forever).</p>
          <div class="kos-meter"><i data-os-fill></i></div>
          <p class="kos-muted" data-os-progress></p>
          <button type="button" class="kos-btn kos-btn-primary" data-action="install" ${ready ? '' : 'disabled'}>${ready ? `Install for +${prestigeGain(state)} patches` : 'Not ready yet'}</button>
        </div>`;
    }
    const fill = panels.os.querySelector<HTMLElement>('[data-os-fill]');
    if (fill) fill.style.width = `${pct}%`;
    setText(panels.os.querySelector('[data-os-progress]'), `${formatNumber(state.eraEarned)} / ${formatNumber(ERA_GOAL)} gold earned this era`);
  }

  function renderRealm(): void {
    const parts: string[] = [];
    let key = '';
    for (const b of BUILDINGS) {
      const n = state.buildings[b.id];
      const shown = Math.min(n, b.id === 'peasant' ? 10 : 6);
      key += `${b.id}${shown}${n > shown ? '+' : ''};`;
      for (let i = 0; i < shown; i++) parts.push(`<span class="kos-realm-item" data-k="${b.id}-${i}">${ICONS[b.id]}</span>`);
      if (n > shown) parts.push(`<span class="kos-realm-more">+${n - shown}</span>`);
    }
    if (key === realmKey) return;
    const previous = new Set(Array.from(realm.querySelectorAll<HTMLElement>('[data-k]')).map((el) => el.dataset.k));
    realmKey = key;
    realm.innerHTML = parts.length ? parts.join('') : '<span class="kos-realm-empty">Your realm is empty. Hire a Peasant!</span>';
    if (previous.size || parts.length) {
      for (const el of Array.from(realm.querySelectorAll<HTMLElement>('[data-k]'))) {
        if (!previous.has(el.dataset.k)) el.classList.add('is-new');
      }
    }
  }

  function setText(el: Element | null, text: string): void {
    if (el && el.textContent !== text) el.textContent = text;
  }

  // ------------------------------------------------------------------ assistant

  function renderAssistant(): void {
    let step: TutorialStep | null = null;
    if (ui.tutorial >= 0 && ui.tutorial < TUTORIAL.length) {
      const current = TUTORIAL[ui.tutorial];
      if (current.done?.(state)) {
        ui.tutorial += 1;
        saveUi();
        return renderAssistant();
      }
      step = current;
    }
    root.querySelectorAll('.kos-spotlight').forEach((el) => el.classList.remove('kos-spotlight'));
    if (!step || !booted || !modal.hidden) {
      assistant.hidden = true;
      return;
    }
    assistant.hidden = false;
    if (assistantText.innerHTML !== step.text) assistantText.innerHTML = step.text;
    assistantNext.hidden = !step.button;
    assistantNext.textContent = step.button ?? '';
    if (step.target) {
      const target = root.querySelector(step.target);
      target?.classList.add('kos-spotlight');
      if (step.target.startsWith('[data-building') && ui.tab !== 'build') setTab('build');
    }
  }

  // ------------------------------------------------------------------ HUD

  function renderHud(): void {
    const gps = goldPerSecond(state);
    setText(goldEl, formatNumber(state.gold));
    setText(gpsEl, formatNumber(gps));
    boostEl.hidden = !boostActive(state);
    setText(eraChip, `${eraName(state.era)}${state.patches ? ` · ${state.patches} patches` : ''}`);
    setText(taskEra, eraName(state.era).replace(/ \(.*\)$/, ''));
    setText(clickValueEl, `+${formatNumber(clickValue(state))}`);
    const goal = currentGoal(state);
    setText(goalText, goal.text);
    goalFill.style.width = `${Math.round(goal.progress * 100)}%`;
    goalBar.classList.toggle('is-install', goal.id === 'install');
    renderBuildPanel();
    renderUpgradesPanel();
    renderTrophiesPanel();
    renderOsPanel();
    renderRealm();
    renderAssistant();
    const now = new Date();
    setText(clockEl, `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    renderMute();

    // One-time prompts for the big moments.
    if (booted && modal.hidden) {
      if (policyUnlocked(state) && !state.policy && !ui.policyPrompted) showPolicyModal();
      else if (canPrestige(state) && !ui.installPrompted) {
        ui.installPrompted = true;
        saveUi();
        toast('Next Kingdom OS ready!', 'Open the Next OS tab to install it and gain patches.', 'trophy');
        play('trophy');
      }
    }
  }

  function renderMute(): void {
    setText(muteButton, sound.muted ? '🔇' : '🔊');
    muteButton.setAttribute('aria-pressed', String(sound.muted));
    muteButton.setAttribute('aria-label', 'Mute sound');
    muteButton.title = sound.muted ? 'Sound is off' : 'Sound is on';
  }

  // ------------------------------------------------------------------ loop

  function advance(seconds: number): void {
    // Fixed steps keep frenzy boundaries and achievements honest.
    let remaining = seconds;
    while (remaining > 0) {
      const step = Math.min(1, remaining);
      state = tick(state, step);
      remaining -= step;
      if (booted && baseGoldPerSecond(state) > 0) {
        mailTimer -= step;
        if (mailTimer <= 0) {
          mailTimer = mailInterval(state) * (0.75 + Math.random() * 0.5);
          spawnMail();
        }
      }
    }
    const r = checkAchievements(state);
    state = r.state;
    for (const a of r.unlocked) {
      toast(`🏆 Trophy: ${a.name}`, `${a.hint} (+2% production)`, 'trophy');
      play('trophy');
    }
  }

  function frame(now: number): void {
    const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
    last = now;
    if (booted) {
      advance(dt * timeScale);
      sinceSave += dt;
      if (sinceSave >= AUTOSAVE_SECONDS) save();
    }
    sinceHud += dt;
    if (sinceHud >= 0.1) {
      sinceHud = 0;
      renderHud();
    }
    raf = requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------ input

  function boot(): void {
    if (booted) return;
    booted = true;
    sound.unlock();
    play('boot');
    shell.dataset.screen = 'desktop';
    desktop.removeAttribute('aria-hidden');
    setTab(ui.tab);
    renderHud();
    if (offlineReport) showWelcomeBack(offlineReport);
    else coin.focus({ preventScroll: true });
  }

  function onClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    sound.unlock();

    if (!startMenu.hidden && !target.closest('[data-startmenu]') && !target.closest('[data-action="start"]')) toggleStart(false);

    if (target.closest('[data-coin]')) return doClick(event);

    const building = target.closest<HTMLElement>('[data-building]');
    if (building) return doBuyBuilding(building.dataset.building as BuildingId, building);

    const upgrade = target.closest<HTMLElement>('[data-upgrade]');
    if (upgrade) return doBuyUpgrade(upgrade.dataset.upgrade as string, upgrade);

    const policy = target.closest<HTMLElement>('[data-policy]');
    if (policy) return doPolicy(policy.dataset.policy as PolicyId);

    const tab = target.closest<HTMLElement>('[data-tab]');
    if (tab) {
      play('open');
      return setTab(tab.dataset.tab as Tab);
    }

    if (target === modal) return closeModal();

    const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
    switch (action) {
      case 'boot':
        return boot();
      case 'start':
        return toggleStart(startMenu.hidden);
      case 'mute':
      case 'mute-menu':
        sound.setMuted(!sound.muted);
        ui.muted = sound.muted;
        saveUi();
        sound.unlock();
        play('open');
        toggleStart(false);
        renderMute();
        if (!sound.muted) toast('Sound on', 'Clicks, coins and fanfares are back.', 'info');
        return;
      case 'help':
        toggleStart(false);
        return showHelp();
      case 'save':
        toggleStart(false);
        save(true);
        toast('Kingdom saved', 'Autosave also runs every 10 seconds.', 'good');
        return;
      case 'reset':
        toggleStart(false);
        return showReset();
      case 'reset-confirm':
        storageRemove(SAVE_KEY);
        storageRemove(UI_KEY);
        state = createState();
        Object.assign(ui, { tutorial: 0, policyPrompted: false, installPrompted: false, tab: 'build' });
        saveUi();
        for (const k of Object.keys(keys) as Tab[]) keys[k] = '';
        seenBuildings.clear();
        seenUpgrades.clear();
        realmKey = '';
        mailTimer = 25;
        closeModal();
        save();
        setTab('build');
        toast('Fresh install', 'A brand-new kingdom. Click the Royal Coin!', 'info');
        return;
      case 'close-modal':
        return closeModal();
      case 'policy':
        return showPolicyModal();
      case 'install':
        return showInstallModal();
      case 'install-confirm':
        return doInstall();
      case 'assistant-next':
        ui.tutorial += 1;
        saveUi();
        play('open');
        sinceHud = 1;
        return;
      case 'assistant-skip':
        ui.tutorial = -1;
        saveUi();
        sinceHud = 1;
        return;
    }
  }

  function toggleStart(open: boolean): void {
    startMenu.hidden = !open;
    startButton.setAttribute('aria-expanded', String(open));
    startButton.classList.toggle('is-active', open);
    if (open) {
      play('open');
      startMenu.querySelector<HTMLElement>('button, a')?.focus();
    }
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (!modal.hidden) closeModal();
      else if (!startMenu.hidden) toggleStart(false);
      return;
    }
    if (!booted && (event.key === 'Enter' || event.key === ' ') && document.activeElement === document.body) {
      event.preventDefault();
      boot();
    }
  }

  function onHide(): void {
    if (booted) save();
  }

  // Keep the coin from double-firing on touch (pointer + click) while still
  // supporting keyboard activation through the native click event.
  shell.addEventListener('click', onClick);
  window.addEventListener('keydown', onKey);
  window.addEventListener('pagehide', onHide);
  document.addEventListener('visibilitychange', onHide);

  // Debug hook: dev server, or a build made with VITE_KINGDOM_DEBUG=1. Never in the shipped build.
  if (import.meta.env.DEV || import.meta.env.VITE_KINGDOM_DEBUG === '1') {
    (window as unknown as { __kingdom?: unknown }).__kingdom = {
      advance: (seconds: number) => {
        advance(seconds);
        sinceHud = 1;
      },
      setTimeScale: (n: number) => {
        timeScale = Math.max(0, n);
      },
      state: () => JSON.parse(JSON.stringify(state)) as KingdomState,
      save: () => save(),
      mail: () => spawnMail(),
    };
  }

  setTab(ui.tab);
  renderHud();
  if (new URLSearchParams(window.location.search).has('play')) boot();
  else $<HTMLButtonElement>('[data-action="boot"]').focus({ preventScroll: true });
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    if (booted) save();
    shell.removeEventListener('click', onClick);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('pagehide', onHide);
    document.removeEventListener('visibilitychange', onHide);
  };
}
