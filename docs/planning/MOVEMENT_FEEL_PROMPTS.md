# Movement Feel Prompts

Use these prompts in a future `/new` session to resume the visual-improvement track quickly.

## Short resume prompt

Project LW2B. Resume the movement-feel / render-readability plan.
Current art direction stays pixel/retro.
Do not redesign graphics style.
Primary goal: make unit movement feel less jumpy and more intuitive without touching determinism-sensitive sim/network logic unless strictly necessary.
Start with render-only interpolation, then walk bob/facing, then tiny step FX.
Check ROADMAP.md phase `Movement feel and render readability`, inspect current render code, make the smallest safe implementation step, build, and summarize the result.

## PR1 prompt

Project LW2B.
Implement PR1 from the movement-feel plan.
Goal: render interpolation foundation only.
Compute alpha from simAccum / SIM_TICK_MS, pass it into renderer, add a client-only render cache for previous/current positions, and draw units at interpolated positions.
Do not modify synced sim/entity state.
Keep scope low-risk.
Build after changes and report exactly what changed.

## PR2 prompt

Project LW2B.
Implement PR2 from the movement-feel plan.
Goal: improve motion readability after interpolation is in place.
Add tiny walk bob and facing/directional readability in render only.
Keep offsets pixel-clean and subtle.
Do not add heavy new assets or touch net/sim logic.
Build after changes and report visual effect plus any readability tradeoffs.

## PR3 prompt

Project LW2B.
Implement PR3 from the movement-feel plan.
Goal: small local step FX only.
Add tiny step dust and/or landing puff with strict particle caps and minimal visual noise.
Render-only, no synced state changes.
Build after changes and report whether the effect helps or feels too busy.

## Review prompt

Project LW2B.
Review the current movement-feel implementation against ROADMAP.md.
Focus on: visual readability, pixel-style consistency, determinism safety, and whether the effect is strong enough to justify complexity.
If something is overbuilt, say so directly and suggest the smallest correction.
