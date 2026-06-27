# Wake 15 review/fix: opening decree closeout

Date: 2026-06-27
Wake: 15/15
Cycle: 5/5
Phase: review-fix
Starting HEAD: `a281e8c`

## Scope

Review the Wake 14 opening decree in the two fresh starts that matter most:

- Active Steward via mode select.
- AFK Sovereign via quick run.
- Mobile command panel first-row spacing while the first-decree hint is visible.

## Initial acceptance checks

- Fresh Active opening shows `First decree` and an enabled, highlighted `Harvest Boom`.
- Fresh AFK opening shows the same guidance and enabled first command.
- Mobile opening keeps the first row of edicts readable and reachable.
- After casting Harvest Boom, the opening hint and highlight clear immediately.
- `npm run build` passes.
- `npm test` runs if source code changes.

## Review notes

- Passed: fresh Active opening shows `First decree`, highlighted `Harvest Boom`, and the first command is enabled.
- Passed: fresh AFK opening through `Quick AFK Run` shows the same first-decree guidance and enabled first command.
- Passed: after casting `Harvest Boom`, the first-decree card and gold highlight clear immediately.
- Passed: mobile opening at `390x844` keeps the first row of edicts reachable; `Harvest Boom` sits at `743-811px`, inside the viewport.
- Note: the mobile command panel intentionally scrolls below the first row (`359px` content inside a `302px` panel), but the first action row is visible and readable.

## Captured screenshots

- `docs/night-runs/artifacts/wake-15-active-opening.png`
- `docs/night-runs/artifacts/wake-15-after-first-decree.png`
- `docs/night-runs/artifacts/wake-15-afk-opening.png`
- `docs/night-runs/artifacts/wake-15-mobile-opening.png`

## Machine QA

- `docs/night-runs/artifacts/wake-15-cdp-report.json`
