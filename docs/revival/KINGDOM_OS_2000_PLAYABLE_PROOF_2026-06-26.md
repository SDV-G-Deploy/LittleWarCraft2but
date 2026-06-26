# Kingdom OS 2000 playable proof

Date: 2026-06-26  
Branch: `revival/playable-proof-2026-06-26`

## Thesis

Turn LW2B from an archived compact RTS into a new minimum beautiful playable proof:

> A bright glassy Windows-2000-like idle RTS command desk where a tiny kingdom runs by itself and the player steers it with royal edicts.

This pass intentionally does not continue the old roadmap. It tests a new emotional direction: playful, fast to understand, visual first, short-session, AFK-friendly, and easy to expand if it feels alive.

## First playable scope

Included:
- launchable browser game shell
- main menu
- mode select
- local playable run
- pause/resume
- restart/rematch
- end screen
- simulation speed control
- hidden debug overlay on backtick
- no networking

Core toy:
- resources: gold, grain, crystal, morale
- victory pressure: Glory reaches 100
- failure pressure: Threat reaches 100 or morale collapses
- workers and army grow or shrink
- autonomous economy ticks
- autonomous battle cadence
- random events
- player edicts with costs and cooldowns
- visible map nodes, lanes, units, sparks, and floating text

## Visual target

Direction:
- bright aqua/lime/cobalt/magenta palette
- glossy translucent panels
- early-2000s PC-game charm with modern polish
- toy-like fantasy kingdom
- no debug-box aesthetic in normal player view

Generated asset:
- `public/assets/revival/kingdom2000-bg.png`
- source generated through the built-in image generation tool
- prompt theme: glassy Windows 2000 fantasy idle RTS title/menu background, no text

## Implemented files

- `index.html`
- `src/main.ts`
- `src/revival/kingdom2000.ts`
- `src/revival/kingdom2000.css`
- `public/assets/revival/kingdom2000-bg.png`

## Verification

Commands:
- `npm ci`
- `npm run build`

Viewport screenshots captured with headless Chromium:
- `docs/revival/screenshots/menu-1440.png`
- `docs/revival/screenshots/play-1440.png`
- `docs/revival/screenshots/play-mobile.png`

Known repo-level note:
- `npm ci` still reports the archived repo's existing audit findings: 1 moderate `esbuild`, 2 high `ws`.

## Next strongest passes

1. Add sound and tiny UI chimes.
2. Add a stronger 90-second win arc with a memorable final surge.
3. Replace generated-background-only map readability with more intentional node art/sprites.
4. Add a second run modifier: "Crisis Desktop" or "Festival Desktop".
5. Add one bigger "oh cool" edict that visibly transforms the board.
