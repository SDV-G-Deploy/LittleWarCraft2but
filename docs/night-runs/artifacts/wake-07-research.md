# Wake 07 research: second-cycle choice

Date: 2026-06-27
Wake: 07/15
Cycle: 3/5
Phase: research
Starting HEAD: `4905336`

## Observed problem

Cycle 2 gave the run a clearer climax: reaching `2/3` crowns now starts the `Final Crown Protocol`, highlights the last target, restores Focus, and creates a controlled Shade response.

The next likely weakness is earlier replay structure. The three royal programs have different requirements, but the run still tends to follow a best/default order: Grow first, War second, Rite last. That means the middle of a run can feel like executing a known checklist rather than making a strategic choice.

Evidence reviewed:

- Wake 06 desktop/mobile screenshots: final protocol is readable and stable after the assist cap.
- Current code: `resetGame()` always starts on `growth`; `checkPlanCompletion()` always chooses the first unfinished plan after a crown; mode selection only changes pacing/resource starts.
- Live Pages: returned HTTP 200 with fresh deployed content.

The UI has enough command-panel space for a short, temporary choice, but mobile does not have enough room for a fourth permanent panel. A mid-run choice should therefore appear as a compact overlay/card or plan-panel insert, then collapse into a short status line/chip after selection.

## Player-facing hypothesis

If the game adds a small, visible "royal commission" choice early in the run, the first half will feel less scripted without adding a new broad system. The player should see a short-term bargain such as "choose which program gets patronage now," then receive a bonus and a tradeoff that nudges a different program order.

## Implementation scope to investigate

- Keep the existing three programs and crown requirements.
- Add one bounded choice layer that appears once after the first crown, before the final protocol.
- Offer three commission options tied to existing systems:
  - Farm Charter: grain/workers help, but extra Threat from overwork.
  - Sky-Road Contract: army/insight help, but higher enemyPower.
  - Crystal Mandate: crystal help, but morale drag.
- Surface the active commission in the current program panel or advisor feed.
- Make the choice alter incentives rather than forcing a new win condition.

Recommended next implementation:

- Add `activeCommission` and `commissionOffered` state.
- When the first crown completes, set a `commission` overlay/shell state or render an inline choice in the command panel.
- Choosing a commission should:
  - apply a small immediate benefit and one clear tradeoff,
  - log the choice in the advisor feed,
  - mildly bias the next program choice by setting `activePlan` to the commission's program if unfinished,
  - leave manual program buttons usable afterward.
- On mobile, show only title, one-line tradeoff, and three buttons; avoid adding more persistent vertical content.

## Acceptance checks for next implementation

- The player sees one clear mid-run choice before the final protocol.
- The choice is readable on desktop and mobile.
- Each option has one benefit and one tradeoff using existing resources.
- Existing program completion and final protocol remain intact.
- After the first crown, the next active program can differ from the default order based on the selected commission.
- `npm run build` passes.
- `npm test` passes if behavior/state code changes.

## Rejected alternatives

- A new permanent "policy" panel: too much UI weight on mobile and competes with edicts.
- More random events only: adds motion, but not a deliberate player decision.
- Changing program requirements: higher risk than needed and could destabilize the final protocol work.
