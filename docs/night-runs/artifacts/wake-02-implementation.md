# Wake 02 implementation checkpoint: program spotlight

Date: 2026-06-27  
Wake: 02/15  
Cycle: 1/5  
Phase: implementation  
Starting HEAD: `4afb74b`

## Scope

Implement the Wake 01 recommendation as one bounded player-visible improvement:

- Make the active royal program visible on the map, not only in the command panel.
- Give completed programs a short crown ceremony and a persistent board marker.
- Avoid balance changes and unrelated UI restructuring.

## Planned files

- `src/revival/kingdom2000.ts`
- `src/revival/kingdom2000.css` only if DOM/CSS polish is needed
- `docs/night-runs/2026-06-27-kingdom-os-night.md`

## Acceptance checks

- `npm run build`
- `npm test`
- Headless Chromium desktop and mobile screenshots showing the program spotlight.
- First-program completion can be forced locally and shows persistent completed-state markers.
