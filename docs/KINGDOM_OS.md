# Kingdom OS 2000

**An idle kingdom builder disguised as a retro desktop operating system.**
It ships next to the LittleWarCraft2but RTS as a small side game: `kingdom.html`
(linked from the bottom of the RTS main menu as "Kingdom OS — idle side game").

> Click the Royal Coin to mint gold, build things that mint it for you, then
> "install the next Kingdom OS" to restart with permanent boosts.

## What it was, and what changed

The first Kingdom OS 2000 (June 2026, see `docs/revival/` and `docs/night-runs/`)
was a 3-crown *survival* run: Glory, Threat, Focus, Morale, four resources,
six cooldown edicts, three "programs", a commission and a final protocol. It
looked great but players could not tell what to do, there was no saving, and a run
could be lost without understanding why.

This version keeps the art direction (the glassy aqua/lime/gold "Windows 2000 meets
toy kingdom" look and the isometric kingdom wallpaper) and rebuilds the game as a
clear incremental loop with one resource, gold:

| Before | Now |
| --- | --- |
| 8 meters, 6 cooldown edicts, win/lose | One number (gold), click → build → upgrade → new era |
| No save | Autosave every 10 s + on tab close, offline earnings |
| Text-only advisor feed | Guided onboarding by "Crownie", a goal bar, toasts |
| Desktop theme as decoration | The OS *is* the UI: windows, taskbar, Start menu, pop-up mail, "installing" a new OS version is the prestige |

## How to play

1. **Click the Royal Coin** (Treasury window) to mint gold by hand.
2. **Build** in the Control Panel: Peasant → Sunmill Farm → Bubble Market → Crystal Mine →
   Wizard Tower → Sky Portal. Each makes gold every second. Each copy costs 15% more.
   Higher tiers stay hidden ("???") until you have earned half their price.
3. **Upgrades** appear as you grow; most double one building's output. Golden Mouse and
   Treasury Hotkey make clicks scale with your income.
4. At 1,000 gold earned, sign **one Royal Policy** for the era:
   - *Agrarian Decree*: Peasants and Farms ×3 (builders)
   - *Merchant Charter*: clicks ×4, Markets ×2 (active clickers)
   - *Idle Throne*: all production ×1.3 and 100% offline earnings (people with lives)
5. **Royal Mail** windows pop up every ~90 s (×2 with the Mail Filter upgrade).
   Open one for 60 s of income or a ×5 frenzy for 20 s.
6. **Trophies** (27) each add +2% to all production and are never lost.
7. Earn **1M gold in one era** and *install the next Kingdom OS*
   (2000 → ME → XP → Vista → 7 → Build N). You restart with **patches**:
   `patches_total = floor(3 × sqrt(lifetime_gold / 1M))`, each +10% to everything,
   including clicks. Trophies stay.
8. **Offline**: closing the tab keeps the kingdom earning at 50% speed (100% with Idle Throne),
   capped at 8 hours. A "Welcome back" dialog shows the haul.

The taskbar has Start (help, save, sound, back to the RTS, reset), an RTS shortcut, and a
sound toggle in the tray. Esc closes dialogs. Every control is a real `<button>`/link with a label.

## Design notes

**Clarity first.** The first screen says what the game is in one line and three numbered
steps. After "Start my kingdom", Crownie points at exactly one thing at a time (coin →
Peasant → gold/sec → goal bar). The goal bar always shows the next concrete objective with a
progress bar; it walks through: mint 10 gold, hire a Peasant, buy an upgrade, build a Farm,
unlock and sign a Policy, open a Market, reach 100 gold/sec, dig a Mine, then "earn 1M to
install the next OS".

**Juice.** Coin squish + floating "+N" + sparks per click, green highlight on anything
affordable, shake + buzz when you can't afford, slide-in reveal for new buildings/upgrades,
icons popping into the "realm" strip as you build, tray-balloon toasts for trophies, a
wiggling pop-up mail window, and a full-screen "Installing Kingdom OS ME…" progress bar for
prestige. All sounds are synthesized with WebAudio (no assets); mute persists.
`prefers-reduced-motion` disables animations.

**Layout.** Desktop: goal bar on top, Treasury window left, Control Panel (Build /
Upgrades / Trophies / Next OS tabs) right, taskbar at the bottom. Phones (≤760 px): a compact
treasury row (gold, gold/sec, coin) above the tabbed panel; nothing scrolls horizontally.

## Balance curve

Measured with the bot in `src/revival/kingdom-sim.ts` (greedy buyer that weighs
time-to-afford + payback, catches every mail). Run `npm run kingdom:balance`.

| Player profile | 1st item affordable | Policy unlock | Era install ready |
| --- | --- | --- | --- |
| 1 click/s, Agrarian | 10 s | 2m55s | 11m32s |
| 3 click/s, Agrarian | 3 s | 1m44s | 9m55s |
| 3 click/s, Merchant | 3 s | 1m44s | 9m19s |
| 3 click/s, Idle Throne | 3 s | 1m44s | 11m33s |
| 6 click/s, Merchant | 2 s | 1m00s | 8m24s |

Curve for 3 clicks/s, Agrarian (first era):

| Minute | Gold/sec | Earned this era | Buildings |
| --- | --- | --- | --- |
| 1 | 3.8 | 505 | 7 |
| 2 | 29 | 1.5K | 18 |
| 3 | 195 | 17.6K | 42 |
| 5 | 606 | 71.7K | 59 |
| 7 | 1.6K | 336K | 80 |
| 10 | 5.1K | 1.27M | 95 |

Era 2 (with 8 patches) reaches its install in about 4.5 minutes, so every reset is visibly
faster. The Playwright run that plays through the real UI (fewer clicks, at most 4 purchases
per step) reached 1M at about 10 minutes of simulated time.

Targets pinned by unit tests (`src/revival/kingdom-economy.test.ts`):
first purchase affordable ≤ 11 s even at 1 click/s; a policy plus 5 or more shop options by
about 2 min; first install between 8 and 13 min for every policy; era 2 faster than era 1.

Base numbers (cost / gold per sec): Peasant 10 / 0.1, Farm 100 / 1, Market 1.1K / 8,
Mine 12K / 47, Tower 130K / 260, Portal 1.4M / 1.4K; cost growth ×1.15 per copy.

## Code map

| File | Role |
| --- | --- |
| `kingdom.html` → `src/kingdom-main.ts` | Entry page (second Vite input next to `index.html`) |
| `src/revival/kingdom-economy.ts` | **Pure, deterministic rules**: content tables, production, actions, prestige, offline, goals, save format, number formatting. No DOM/`Date`/`Math.random`. |
| `src/revival/kingdom-sim.ts` | Headless bot player for balance tests |
| `src/revival/kingdom-economy.test.ts` | Unit tests, part of `npm test` (`npm run test:kingdom` alone) |
| `src/revival/kingdom-balance-cli.ts` | `npm run kingdom:balance` prints the curve |
| `src/revival/kingdom2000.ts` | UI shell: DOM, input, onboarding, mail, toasts, storage, debug hook |
| `src/revival/kingdom-sound.ts` | WebAudio synth sound effects |
| `src/revival/kingdom2000.css` | All styling (`kos-` prefix) |
| `public/assets/revival/kingdom2000-bg.png` | Wallpaper art (from the original proof) |

**Save format.** `localStorage["kingdom-os-2000:save:v2"] = { state, savedAt }`; UI prefs
(tutorial step, mute, tab) live in `kingdom-os-2000:ui:v2`. Every storage call is wrapped in
try/catch; a blocked storage just means no persistence. `deserialize` validates every field
and drops unknown ids, so a corrupted or tampered save loads as a sane state.

**Debug hook (dev only).** With `npm run dev`, or a build made with `VITE_KINGDOM_DEBUG=1`,
`window.__kingdom` exposes `advance(seconds)`, `setTimeScale(n)`, `state()`, `save()`, and
`mail()`. The normal `npm run build` (what GitHub Pages ships) does not contain it.

## Ideas for later

- Buy ×10 / ×max toggle once the building counts get large.
- A second prestige layer ("Service Packs") and patch-spent upgrades instead of a flat +10%.
- Pixel-art sprites for the realm strip in place of the vector icons.
- Tie-in with the RTS: e.g. a Kingdom OS trophy that unlocks a cosmetic banner in skirmish.
