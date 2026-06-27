# Wake 13 research: opening command moment

Date: 2026-06-27
Wake: 13/15
Cycle: 5/5
Phase: research
Starting HEAD: `7ee0351`

## Observed problem

By the end of Cycle 4, Kingdom OS 2000 has a much clearer middle and late game:

- Map targets and crown badges make the active program visible.
- The Royal Commission gives the middle game a deliberate choice.
- The Final Crown Protocol gives the last crown a recognizable climax.
- Council orders now translate late-game state into one actionable command.

The remaining weak moment is the first minute. The menu explains the premise, and the first log says Harvest Boom is the clean opening, but the player still lands on a dense command desk and has to infer the first click from several competing UI elements: meters, plan progress, edict grid, map labels, and advisor feed.

Evidence reviewed:

- Wake 12 screenshots: late-game Council order is readable after the layout fix.
- Fresh live opening screenshot: `docs/night-runs/artifacts/wake-13-opening-live.png`.
- Current `resetGame()`: starts on `growth`, sets `Harvest Boom` on a short cooldown, flashes the castle, and logs "First program: Grow the realm. Harvest Boom is the clean opening."
- Current Grow plan: first crown requires 18 Workers and 220 Grain, and Harvest Boom is the intended first edict.
- Current UI: the Council order can recommend Harvest Boom, but it is visually one informational card among many; the actual Harvest Boom button is not called out as the first command, and the initial cooldown makes it look inactive instead of guided.
- Live Pages returned HTTP 200.

## Player-facing hypothesis

If the game stages the first command as a short "first decree" moment, new players will understand the loop faster: read the current program, press the highlighted edict, see the farms react, then continue toward the first crown. This should make the game feel less like a dashboard and more like an approachable online game within the first 10 seconds.

## Implementation scope to investigate

Recommended next implementation: add a bounded opening decree layer that disappears after the player casts the first edict or after the first crown starts moving clearly.

- Add small state such as `openingHintDismissed` or derive from `elapsed`, `crowns`, and whether any edict has been cast.
- Highlight the intended first edict (`Harvest Boom`) while:
  - screen is `playing`,
  - active plan is `growth`,
  - crowns are `0`,
  - workers are still below the first target,
  - and the player has not cast an edict yet.
- Add a compact "First decree" chip or ribbon in the current-program card:
  - title: `First decree`
  - body: `Press Harvest Boom to start farms and workers.`
- Add a subtle glow/pulse on the Harvest Boom button, not on every edict.
- On first Harvest Boom cast, trigger a visible mini-reward:
  - log line that confirms the first decree,
  - existing farm burst/floater is enough if the edict button highlight turns off immediately.
- Do not add a new modal, tutorial screen, or permanent onboarding panel.

## Acceptance checks for next implementation

- A fresh Active or AFK run clearly highlights Harvest Boom as the first command.
- The hint is visible on desktop and mobile without covering the map or resource strip.
- The hint disappears after the first edict is cast.
- Royal Commission, Council orders, and Final Crown Protocol remain unchanged.
- `npm run build` passes.
- `npm test` passes if state/behavior code changes.
- Capture desktop and mobile screenshots of the opening hint, plus a post-first-edict screenshot showing it gone.

## Rejected alternatives

- A blocking tutorial modal: it would slow the first playable moment and compete with the existing mode/menu cards.
- More copy in the menu: the weak point is not premise explanation; it is translating the first playable screen into a first action.
- A broad onboarding system: too large for the final implementation pass and not necessary for the current game loop.
