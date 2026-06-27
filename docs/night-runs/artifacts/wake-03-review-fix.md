# Wake 03 review/fix checkpoint: spotlight readability

Date: 2026-06-27  
Wake: 03/15  
Cycle: 1/5  
Phase: review-fix  
Starting HEAD: `55fbdbc`

## Review target

Review the Wake 02 program spotlight and crown badge layer in local play. The specific risk from Wake 02 was that the active spotlight may be too large/bright, and the War program's magenta target may compete with Shade units at the portal.

## Initial finding

Code and Wake 02 screenshots show the spotlight is valuable but visually heavy:

- The active target fill can cover too much of the node art at desktop size.
- The route glow is thick enough to compete with units and base route lines.
- War uses the same magenta family as Shade units, which makes "target" and "enemy pressure" less distinct.

## Planned bounded fix

- Reduce active spotlight fill/ring size and opacity.
- Reduce active route glow width.
- Keep completed crown badges unchanged because they read clearly and do not dominate.
- Shift War spotlight tone away from Shade magenta if local screenshots confirm the competition.

## Acceptance checks

- `npm run build`
- `npm test`
- Headless Chromium screenshot after the fix showing the active target remains visible without overpowering the board.

## Result

Fixed in this wake:

- Reduced active spotlight route opacity/width.
- Reduced active target fill/ring size and opacity.
- Changed the War program spotlight from magenta to aqua so it no longer looks like Shade pressure.

Captured screenshots:

- `docs/night-runs/artifacts/wake-03-spotlight-review.png`
- `docs/night-runs/artifacts/wake-03-war-target-review.png`

Verification:

- `npm run build` passed.
- `npm test` passed.
- Screenshot review confirmed the Grow target remains visible but less dominant, and the War target is visually distinct from nearby Shade units.
