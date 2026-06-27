# Wake 08 implementation: Royal Commission choice

Date: 2026-06-27
Wake: 08/15
Cycle: 3/5
Phase: implementation
Starting HEAD: `9db7744`

## Scope

Implement the Wake 07 recommendation as one bounded player-visible improvement: a one-time royal commission choice after the first crown.

## Planned changes

- Add commission state to Kingdom OS 2000.
- Pause into a compact commission overlay after the first completed program.
- Offer Farm Charter, Sky-Road Contract, and Crystal Mandate.
- Each option applies one small benefit and one tradeoff using existing resources.
- Choosing an option biases the next active program if that program is unfinished, while keeping manual plan buttons usable.
- Surface the selected commission in the existing command/advisor UI.

## Acceptance checks

- Passed: after the first crown, the game pauses into a clear Royal Commission choice.
- Passed: the choice is readable on desktop and mobile.
- Passed: choosing Crystal Mandate biased the next active program to Rite while leaving manual program buttons usable.
- Passed: existing program completion and final protocol remain intact in code path.
- Passed: `npm run build`.
- Passed: `npm test`.
- Captured: commission choice and post-choice screenshots.

## Implementation notes

- Added `commission` screen state, `commissionOffered`, and `activeCommission`.
- Added three one-time choices:
  - Farm Charter: workers/grain toward Grow, +Threat.
  - Sky-Road Contract: army/insight toward War, +enemyPower/+Threat.
  - Crystal Mandate: crystal/gold toward Rite, -Morale.
- The selected commission appears in the current plan hint and mini status.
- The commission overlay blocks normal play actions until a commission is selected, while restart/menu controls remain available.

Screenshots:

- `docs/night-runs/artifacts/wake-08-commission-desktop.png`
- `docs/night-runs/artifacts/wake-08-commission-mobile.png`
- `docs/night-runs/artifacts/wake-08-commission-post-choice.png`
