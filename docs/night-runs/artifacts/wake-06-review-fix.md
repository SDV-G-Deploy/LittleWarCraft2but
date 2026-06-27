# Wake 06 review/fix: Final Crown Protocol

Date: 2026-06-27
Wake: 06/15
Cycle: 2/5
Phase: review-fix
Starting HEAD: `95b5068`

## Review target

Inspect the Wake 05 `Final Crown Protocol` in actual play:

- desktop and mobile readability of the final target surge,
- whether `Final 2/3` and advisor copy are visible,
- whether the resource boost can make the final crown complete too quietly.

## Acceptance checks

- Passed: captured desktop and mobile final-protocol screenshots after the fix.
- Fixed: capped protocol-created objective resources below final program thresholds so the assist does not quietly finish Grow or Rite by itself.
- Passed: `npm run build`.
- Passed: `npm test`.

## Review notes

- Desktop final state stayed readable with `Final 2/3`, `Final Crown` advisor status, and the target surge centered on the Rite node.
- Mobile final state stayed readable; the advisor is hidden by design, but the command panel and crown chip clearly show `Final crown protocol` and `Final 2/3`.
- Post-fix automated runs stayed in `playing` at the final state:
  - desktop: Rite `68%`, Crystal `51`, Morale `51`;
  - mobile: Rite `88%`, Crystal `57`, Morale `77`.

Screenshots:

- `docs/night-runs/artifacts/wake-06-final-desktop-fixed.png`
- `docs/night-runs/artifacts/wake-06-final-mobile-fixed.png`
