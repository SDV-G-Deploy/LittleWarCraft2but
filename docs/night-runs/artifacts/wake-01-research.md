# Wake 01 research: Kingdom OS 2000

Date: 2026-06-27  
Wake: 01/15  
Cycle: 1/5  
Phase: research  
Starting HEAD: `7f41598`

## Observed problem

Pass 2 made the game legible as a small management loop: Focus limits button spam, royal programs explain the objective, and mobile keeps the map visible. The next weakness is that the visible kingdom does not yet carry enough of the run state.

In local active-mode inspection, the player can read what to do from the left panel, but the board itself still mostly reads as a decorative generated background with bright route lines and colored node pips. Completing or pursuing a program is represented mostly in text/progress bars. The moment-to-moment story is therefore clearer than before, but not yet memorable.

## Player-facing hypothesis

If the active royal program visibly marks the target part of the kingdom, and each completed program triggers a short crown ceremony on the board, players will understand "what I am doing" faster and feel more payoff from a 90-second run.

This should make the proof feel more like an online game loop rather than a pretty control panel over an idle simulation.

## Recommended implementation scope

Next implementation pass should add one tight "program spotlight and crown ceremony" layer:

- Add metadata to each royal program for its target node, accent color, and one-line ceremony copy.
- Highlight the current program's target node and route area on the canvas with a pulsing ring/beacon.
- When a program completes, run a 2-3 second ceremony: bigger floater, crown burst, short screen shimmer, and a distinct advisor log line.
- Mark completed target nodes with small crown badges or gold halos so the board tells the run history.
- Keep the change local to `src/revival/kingdom2000.ts` and `src/revival/kingdom2000.css`; avoid balance changes unless a tiny timing tweak is required.

## Acceptance checks

- Desktop screenshot after starting Active mode shows the current program target clearly without covering resource text or edict buttons.
- Mobile screenshot keeps the target marker visible in the map window and does not overlap the bottom command panel.
- Completing the first program creates a visible crown moment on the board, not only a text log update.
- Completed program state remains visible after the ceremony fades.
- `npm run build` passes.
