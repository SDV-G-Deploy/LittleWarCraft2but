# Wake 14 implementation: opening decree

Date: 2026-06-27
Wake: 14/15
Cycle: 5/5
Phase: implementation
Starting HEAD: `7c5dafe`

## Scope

Implement the Wake 13 recommendation as one bounded player-visible improvement: a fresh run should stage Harvest Boom as the first decree, show a compact hint in the current-program card, and clear the hint as soon as the first edict is cast.

## Intended changes

- Add a small first-edict state flag reset with each run.
- Derive an opening-decree condition from playing screen, Growth plan, zero crowns, and no edict cast yet.
- Render a compact `First decree` prompt in the current-program card.
- Highlight only the Harvest Boom edict while the prompt is active.
- Log a confirmation line when the first decree is issued.

## Acceptance checks

- Passed: fresh Active opening highlights Harvest Boom and shows the `First decree` prompt.
- Passed: opening hint is visible on desktop and mobile.
- Passed: mobile opening keeps the highlighted Harvest Boom button above the fold after removing the duplicate mobile Council order during the opening decree.
- Passed: hint and highlight clear immediately after Harvest Boom is cast.
- Passed: `npm run build`.
- Passed: `npm test`.
- Captured opening and post-edict screenshots.

## Captured screenshots

- `docs/night-runs/artifacts/wake-14-opening-desktop.png`
- `docs/night-runs/artifacts/wake-14-opening-mobile.png`
- `docs/night-runs/artifacts/wake-14-after-first-decree.png`

## Visual QA notes

- Desktop opening: `First decree` appears in the current-program card, Harvest Boom has the gold pulse treatment, and the Advisor Feed still carries the Council order.
- Mobile opening: the command panel shows the first-decree prompt and the first row of edicts; Harvest Boom is visible at `743-811px` in an `844px` viewport.
- Post-decree: the first-decree prompt is gone, Harvest Boom is no longer highlighted, and the feed logs `First decree fulfilled: farms wake up and the Grow crown is moving.`
