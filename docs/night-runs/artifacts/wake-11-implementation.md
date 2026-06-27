# Wake 11 implementation: Council order readout

Date: 2026-06-27
Wake: 11/15
Cycle: 4/5
Phase: implementation
Starting HEAD: `3fb6bb6`

## Scope

Implement the Wake 10 recommendation as one bounded player-visible improvement: a state-derived "Council order" that tells the player the most useful next command during normal and final-crown play.

## Planned changes

- Add a small `councilOrder()` helper that derives severity, title, and body from existing Threat, Morale, Focus, current plan, resources, and edict availability.
- Render the order at the top of the desktop advisor feed.
- Render the same order inside the current-program card so mobile still gets the instruction while the advisor panel is hidden.
- Keep the copy concise and avoid adding new mechanics, resources, or modals.
- Style warning/critical states without changing the established glass UI direction.

## Acceptance checks

- Passed: `npm run build`.
- Passed: `npm test`.
- Passed: desktop final-protocol screenshot shows the Council order in the advisor feed.
- Passed: mobile final-protocol screenshot shows the Council order in the current-program card.
- Passed: automated UI playthrough reached playable `Final 2/3` through the Sky-Road commission path.

## Captured screenshots

- `docs/night-runs/artifacts/wake-11-council-desktop.png`
- `docs/night-runs/artifacts/wake-11-council-mobile.png`

## Final screenshot state

- Screen: `playing`
- Crowns: `Final 2/3`
- Program: `Light the Crystal Rite`
- Council order: `Finish Rite - Cast Crystal Foundry now. Crystal is the shortest path to the final rite.`
- Threat: `41`
- Focus: `100`
- Morale: `78`
