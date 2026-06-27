# Wake 04 research: final-act arc

Date: 2026-06-27  
Wake: 04/15  
Cycle: 2/5  
Phase: research  
Starting HEAD: `002849b`

## Observed problem

Cycle 1 made the core objective much clearer: programs now point to map targets, completed crowns persist on the board, and the spotlight is tuned enough not to overpower the toy kingdom.

The next weakness is pacing. A run still feels like completing three similar checklist cards. Program 1, Program 2, and Program 3 have different requirements, but the game does not yet change posture when the player reaches the last crown. The end screen can arrive after a quiet resource threshold rather than a memorable final beat.

This is especially visible after the first cycle's improvements: the map now tells "where to look," but the session arc still does not tell "this is the climax."

## Player-facing hypothesis

If the game enters a short "Final Crown Protocol" when the player reaches 2/3 crowns, the last 30-60 seconds will feel more like a finish than a third checklist item.

The final act should not add a new system. It should reframe existing systems:

- the last active program becomes visibly urgent,
- the advisor feed calls out the final crown,
- the map gets a brief desktop-wide surge,
- resources/focus get a small boost so the player can push,
- Shade Threat pushes back enough to create tension without invalidating the run.

## Recommended implementation scope

Next implementation pass should add one bounded final-act layer:

- Add `finalProtocolStarted` or equivalent state that triggers once when `crowns === 2` and a next program exists.
- On trigger:
  - log `Final Crown Protocol` in the advisor feed,
  - refill some Focus and morale or crystal depending on the last program,
  - add a controlled Threat bump or Shade raid signal,
  - launch a board-wide shimmer/particle burst near the remaining target,
  - make the crowns chip or current program panel say "Final Crown" while the last program is active.
- Keep existing win condition and program requirements intact.
- Keep changes local to `src/revival/kingdom2000.ts` and, only if needed, `src/revival/kingdom2000.css`.

## Acceptance checks

- After forcing or naturally reaching `2/3` crowns, the player sees a clear "Final Crown" state in the HUD/advisor.
- The remaining target has a visible but not overpowering surge on desktop and mobile.
- The player receives enough Focus/resource help to act immediately after the final protocol starts.
- Threat pressure increases enough to feel like a final push, but not so much that a healthy run randomly collapses.
- `npm run build` passes.
- `npm test` passes if behavior/state code changes.
- Headless Chromium screenshot captures the final protocol state.
