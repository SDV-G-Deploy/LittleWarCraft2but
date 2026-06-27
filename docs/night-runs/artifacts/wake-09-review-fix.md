# Wake 09 review/fix: Royal Commission pass

Date: 2026-06-27
Wake: 09/15
Cycle: 3/5
Phase: review-fix
Starting HEAD: `7b41914`

## Review focus

Check the Wake 08 Royal Commission feature in local play:

- Is the commission choice readable on desktop and mobile?
- Can normal play continue behind the overlay?
- Are the three options balanced enough to feel like real bargains?
- Does choosing a commission leave the next program and HUD understandable?

## Initial observations

- Background play actions are blocked while the commission overlay is open.
- Restart/menu remain available, which is acceptable for a modal recovery path.
- The first mobile screenshot showed the bottom command panel bleeding through the glass commission card.
- Crystal Mandate was too close to a pure Rite shortcut because it granted crystal and gold while its morale penalty was easy to repair with Market Festival.

## Fixes

- Hid the command and advisor panels while the commission modal is open, keeping the resource strip visible for context.
- Made the commission card more opaque so the three bargains read cleanly on mobile and desktop.
- Tuned Crystal Mandate from `-8 Morale` and `+24 Gold` to `-10 Morale`, `+4 Threat`, and `+18 Gold`.

## Planned acceptance checks

- Passed: captured desktop and mobile commission screenshots after the visual fix.
- Passed: command panel opacity is `0` during the commission modal and returns to `1` after choosing a commission.
- Passed: choosing Crystal Mandate returned to `playing`, selected Rite, and surfaced `Commission Crystal`.
- Passed: `npm run build`.
- Passed: `npm test`.

## Captured screenshots

- `docs/night-runs/artifacts/wake-09-commission-desktop-fixed.png`
- `docs/night-runs/artifacts/wake-09-commission-mobile-fixed.png`
- `docs/night-runs/artifacts/wake-09-commission-crystal-post-choice-fixed.png`
