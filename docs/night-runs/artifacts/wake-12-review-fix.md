# Wake 12 review/fix: Council order pass

Date: 2026-06-27
Wake: 12/15
Cycle: 4/5
Phase: review-fix
Starting HEAD: `f922239`

## Review focus

Review the Wake 11 Council order feature:

- Does the order remain readable in normal play and final-crown play?
- Do high-Threat and low-Morale states select appropriate urgent copy?
- Does the added order card make the mobile command panel too tall?
- Are there regressions in build/test or the deployed page?

## Planned checks

- Inspect current code and Wake 11 screenshots.
- Capture at least one fresh screenshot after any fix or confirmation pass.
- Run `npm run build`.
- Run `npm test` if code changes.

## Findings

- The Council order logic selected useful final-crown recovery copy in the fresh run: `Steady Citizens` with a `Market Festival` instruction when Morale dropped below the final-push comfort range.
- Desktop had a readability regression from Wake 11: the same Council order appeared both in the left current-program card and in the right advisor feed.
- Mobile still needs the current-program copy because the advisor panel is hidden under `760px`.

## Fix

- Hid the current-program Council order by default.
- Restored it under the existing mobile breakpoint where `.k2k-advisor-panel` is hidden.
- Left the advisor-feed Council order visible on desktop.

## Verification

- Passed: `npm run build`.
- Skipped: `npm test`, because the fix is CSS-only and does not change game logic.
- Passed: headless Chromium reached `Final 2/3` through the Sky-Road commission path.
- Passed: desktop screenshot shows one Council order in the advisor feed and none in the left current-program card.
- Passed: mobile screenshot shows the Council order in the current-program card while the advisor panel is unavailable.

## Captured screenshots

- `docs/night-runs/artifacts/wake-12-council-desktop-fixed.png`
- `docs/night-runs/artifacts/wake-12-council-mobile-fixed.png`

## Final screenshot state

- Screen: `playing`
- Crowns: `Final 2/3`
- Program: `Light the Crystal Rite`
- Council order: `Steady Citizens - Cast Market Festival now. The final push fails if Morale keeps sliding.`
- Threat: `47`
- Focus: `100`
- Morale: `46`
