# Wake 10 research: pressure and recovery readout

Date: 2026-06-27
Wake: 10/15
Cycle: 4/5
Phase: research
Starting HEAD: `05e20be`

## Observed problem

The first three cycles made the game more legible:

- Cycle 1 put the active program directly on the map with target beacons and crown badges.
- Cycle 2 gave the run a recognizable final act with the `Final Crown Protocol`.
- Cycle 3 added a one-time Royal Commission choice so the middle game is less scripted.

The remaining player-facing weakness is the late-game decision layer. When the final crown starts, the UI says `Final 2/3` and highlights the last route, but the player still has to infer the best emergency action from raw meters, edict cooldowns, and the scrolling advisor log. The advisor feed is mostly historical; it does not yet act like a useful command aide.

Evidence reviewed:

- Wake 09 desktop/mobile commission screenshots: the new choice is readable, and hiding command/advisor panels during the modal fixed visual competition.
- Current code: `renderHud()` already knows current plan, final protocol state, Threat, Morale, Focus, resources, and cooldowns, but the advisor priority line only repeats the current objective.
- Mobile CSS hides `.k2k-advisor-panel`, so any late-game guidance must also fit inside the command panel or current-program card.
- Current failure pressure comes from `threat >= 100` or `morale <= 0`, but the HUD never translates that into a plain next move.

## Player-facing hypothesis

If the final act shows one explicit recovery order, the game will feel more like a command desk and less like a meter watch. A short "Council order" should answer: what is most dangerous right now, which edict should I press next, and why?

This should make losing states feel fairer and wins feel more intentional without adding another large system.

## Implementation scope to investigate

Recommended next implementation: add a bounded council-order readout driven by existing state.

- Add a small pure helper such as `councilOrder()` that returns:
  - severity: `stable`, `warning`, or `critical`
  - label: one short command, for example `Hold Threat`, `Restore Morale`, `Spend Focus`, or `Finish Rite`
  - body: one sentence naming the reason and the best available edict/resource target
- Render the order at the top of the advisor feed on desktop.
- Render the same order inside `.k2k-plan-current` on mobile, because the advisor feed is hidden there.
- During `Final Crown Protocol`, bias the order toward the immediate losing pressure first:
  - high Threat: prefer Ward Matrix or Battle Push depending on Focus/resources
  - low Morale: prefer Market Festival or Rite progress if Morale is already safe enough
  - full Focus with no emergency: push the active plan objective
- Use only existing state, edicts, and copy; do not add a new resource, panel, or modal.

## Acceptance checks for next implementation

- During normal play, the player sees one concise command order without losing the current program objective.
- During the final protocol, high Threat or low Morale produces a visibly urgent order.
- On mobile, the order remains visible even though the advisor panel is hidden.
- The order changes when the relevant danger changes, without flickering every frame.
- Existing Royal Commission, program selection, and final protocol behavior remain intact.
- `npm run build` passes.
- `npm test` passes if state/render behavior changes.
- Capture at least one desktop and one mobile final-protocol screenshot showing the order.

## Rejected alternatives

- A separate countdown timer: final pressure is currently Threat/Morale based, not a literal timer, so a timer would misrepresent the game.
- Another modal/event chain: the commission already added a deliberate choice; the next improvement should reduce confusion during live play.
- More map spectacle: the final target is already visually loud enough after Wake 06.
