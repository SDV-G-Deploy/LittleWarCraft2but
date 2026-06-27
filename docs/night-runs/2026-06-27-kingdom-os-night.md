# Kingdom OS 2000 night autonomous run

Date: 2026-06-27  
Repo: `/root/.openclaw/workspace/LittleWarCraft2but`  
Live URL: `https://sdv-g-deploy.github.io/LittleWarCraft2but/`  
Session target: `session:lw2b-night-2026-06-27`  
Model: `openai/gpt-5.5`, thinking `high`  
Cadence: 15 wakes, 25 minutes apart, 20 minute timeout each  

## Objective

Improve Kingdom OS 2000 overnight from a playable proof into a more compelling, clearer, prettier online game.

Use five packs of three passes:

1. Research of game improvement
2. Game improvement
3. Review and fixes if needed

Repeat this pattern five times, stopping if verification/deploy breaks or the repo state becomes unsafe.

## Current baseline

- Main branch is deployed to GitHub Pages.
- Latest baseline commit before the night run: `40eacc9 Improve Kingdom OS gameplay clarity`
- Pass 2 added Focus, royal programs, crowns, clearer objectives, and mobile layout improvements.
- User feedback before Pass 2: AFK was unclear, Active was button spam, mobile hid the map, the gameplay hook was weak.

## Stop rules

Stop the series and record the blocker if any of these happen:

- unexpected dirty tree or unrelated user changes
- merge conflict or push rejection
- build/test failure that is not fixed within the current pass
- GitHub Pages deploy failure that is not understood
- no clear next small step remains
- repeated passes do not produce visible improvement
- lock is fresh from another pass
- broad redesign is needed before safe implementation

## Verification gates

Every implementation or fix pass should run the smallest meaningful gates:

- `npm run build`
- `npm test` when code behavior changed
- headless Chromium mobile screenshot for visual changes
- GitHub Pages deploy verification after pushing to `main`

## Ledger

Append one entry per wake with:

- wake number, cycle, phase
- starting HEAD and dirty-tree status
- what was attempted
- files changed
- verification
- commit hash, if any
- deploy/run id, if any
- next recommendation

## Scheduled wakes

Pending scheduling from OpenClaw cron.

## Wake 01 - Cycle 1 - Research

Start: 2026-06-27 00:15 UTC  
End: 2026-06-27 00:20 UTC  
Starting HEAD: `7f41598`  
Dirty-tree status: clean except this wake's lock/temp files

Attempted:
- Acquired the night-run lock with `mkdir`.
- Inspected git status, current HEAD, ledger, Kingdom OS 2000 source, prior playable-proof note, and pass 2 screenshots.
- Started the local Vite dev server and inspected Active mode through headless Chromium.
- Wrote research artifact `docs/night-runs/artifacts/wake-01-research.md`.

Observation:
- Pass 2 made the HUD and objectives clearer, but the board still reads more like decorative background plus colored pips than a stateful kingdom.
- The next high-leverage pass should make the active program and completed crowns visible directly on the map.

Files changed:
- `docs/night-runs/artifacts/wake-01-research.md`
- `docs/night-runs/2026-06-27-kingdom-os-night.md`

Verification:
- Docs-only research wake; no build required.
- Local inspection used Vite dev server and headless Chromium.

Commit:
- `356e39b` (`docs: record kingdom os wake 01 research`) pushed to `main`.

Next recommendation:
- Implement a narrow program spotlight and crown ceremony layer: target-node metadata per program, pulsing current target marker, 2-3 second completion burst, and persistent crown badges on completed nodes.

## Wake 02 - Cycle 1 - Implementation

Start: 2026-06-27 00:40 UTC  
End: 2026-06-27 00:49 UTC  
Starting HEAD: `4afb74b`  
Dirty-tree status: clean except this wake's lock/temp files

Attempted:
- Implemented the Wake 01 recommendation as one bounded pass.
- Added program target metadata for Grow, War, and Rite.
- Added a pulsing route/node spotlight for the active royal program.
- Added a short crown ceremony and persistent crown badges for completed program nodes.
- Captured desktop, mobile, and first-crown screenshots with headless Chromium.

Files changed:
- `src/revival/kingdom2000.ts`
- `docs/night-runs/artifacts/wake-02-implementation.md`
- `docs/night-runs/artifacts/wake-02-desktop-spotlight.png`
- `docs/night-runs/artifacts/wake-02-mobile-spotlight.png`
- `docs/night-runs/artifacts/wake-02-first-crown.png`
- `docs/night-runs/2026-06-27-kingdom-os-night.md`

Verification:
- `npm run build` passed.
- `npm test` passed.
- Headless Chromium screenshots confirmed the spotlight is visible on desktop and mobile.
- Forced first-program completion reached `1/3` crowns and showed a persistent completed crown badge while the War target lit up.

Commit:
- `9e94d6c` (`Add Kingdom OS program spotlight`)

Deploy:
- GitHub Pages deploy succeeded for pushed HEAD `d07e840`; run `28273384860`.

Next recommendation:
- Review pass should check whether the spotlight is too large/bright during real play and whether the War target color competes with Shade units.

## Wake 03 - Cycle 1 - Review/Fix

Start: 2026-06-27 01:05 UTC  
End: 2026-06-27 01:13 UTC  
Starting HEAD: `55fbdbc`  
Dirty-tree status: clean except this wake's lock/temp files

Attempted:
- Reviewed the Wake 02 program spotlight in local play and screenshots.
- Confirmed the spotlight was useful but too visually heavy at desktop scale.
- Reduced spotlight route opacity/width, target fill/ring size, and flag size.
- Changed the War target tone from magenta to aqua so it no longer competes with Shade units.
- Captured post-fix Grow and War target screenshots with headless Chromium.

Files changed:
- `src/revival/kingdom2000.ts`
- `docs/night-runs/artifacts/wake-03-review-fix.md`
- `docs/night-runs/artifacts/wake-03-spotlight-review.png`
- `docs/night-runs/artifacts/wake-03-war-target-review.png`
- `docs/night-runs/2026-06-27-kingdom-os-night.md`

Verification:
- `npm run build` passed.
- `npm test` passed.
- Headless Chromium screenshots confirmed the target beacon remains clear without overpowering the board, and War target color is distinct from Shade units.

Commit:
- `6d8b7d1` (`Tune Kingdom OS program spotlight`)

Deploy:
- GitHub Pages deploy succeeded for pushed HEAD `38b7d49`; run `28274052060`.

Next recommendation:
- Next research pass should look for a stronger short-session arc after the map is readable: a memorable final surge, event chain, or second-mode modifier.

## Wake 04 - Cycle 2 - Research

Start: 2026-06-27 01:30 UTC  
End: 2026-06-27 01:34 UTC  
Starting HEAD: `002849b`  
Dirty-tree status: clean except this wake's lock/temp files

Attempted:
- Inspected git status, current HEAD, recent commits, and the prior night-run ledger.
- Reviewed current Wake 03 screenshots for Grow and War target readability.
- Inspected the current Kingdom OS program/event/endgame code path.
- Checked the live GitHub Pages URL returned HTTP 200.
- Wrote research artifact `docs/night-runs/artifacts/wake-04-research.md`.

Observation:
- Cycle 1 solved board readability, but the session still ends as three similar checklist completions.
- The run needs a clearer final act after the player reaches `2/3` crowns.

Files changed:
- `docs/night-runs/artifacts/wake-04-research.md`
- `docs/night-runs/2026-06-27-kingdom-os-night.md`

Verification:
- Docs-only research wake; no build required.
- Live Pages returned HTTP 200.

Commit:
- `88de51c` (`docs: research kingdom os final act`)

Deploy:
- GitHub Pages deploy succeeded for pushed HEAD `bfab9e9`; run `28274613876`.

Next recommendation:
- Implement a bounded `Final Crown Protocol`: once `crowns === 2`, call out the final crown in HUD/advisor, give a small Focus/resource push, add a controlled Threat response, and trigger a visible surge around the remaining target.

## Wake 05 - Cycle 2 - Implementation

Start: 2026-06-27 01:55 UTC  
End: 2026-06-27 02:03 UTC  
Starting HEAD: `0119a57`  
Dirty-tree status: clean except this wake's lock/temp files

Attempted:
- Implemented the Wake 04 recommendation as a bounded `Final Crown Protocol`.
- Added a one-shot final-act state that triggers after the second crown and the remaining program is selected.
- Updated HUD/advisor copy so the current panel and crown chip clearly say `Final Crown` / `Final 2/3`.
- Added a modest Focus/resource push, morale support, controlled Threat/enemy response, and a visible target/route surge around the final program.
- Captured a headless Chromium screenshot of a real automated run reaching `Final 2/3`.

Files changed:
- `src/revival/kingdom2000.ts`
- `src/revival/kingdom2000.css`
- `docs/night-runs/artifacts/wake-05-implementation.md`
- `docs/night-runs/artifacts/wake-05-final-protocol.png`
- `docs/night-runs/2026-06-27-kingdom-os-night.md`

Verification:
- `npm run build` passed.
- `npm test` passed.
- Headless Chromium automated a normal active run to `Final 2/3` and captured `wake-05-final-protocol.png`.
- Screenshot state: Focus `100`, Threat `46`, crown chip `Final 2/3`, current program `Final crown protocol` on the Crystal Rite.

Commit:
- `ab4ff28` (`Add Kingdom OS final crown protocol`)

Deploy:
- GitHub Pages deploy succeeded for pushed HEAD `ab4ff28`; run `28275267888`.
- Ledger commit `c1e073d` also deployed successfully; run `28275302792`.

Next recommendation:
- Review pass should check whether the final target surge is too large on mobile and whether the Focus/resource boost can accidentally complete the Rite too quietly after the protocol starts.

## Wake 06 - Cycle 2 - Review/Fix

Start: 2026-06-27 02:20 UTC  
End: 2026-06-27 02:29 UTC  
Starting HEAD: `95b5068`  
Dirty-tree status: clean except this wake's lock/temp files

Attempted:
- Reviewed the Wake 05 `Final Crown Protocol` in local desktop and mobile play with headless Chromium.
- Confirmed the final target surge and `Final 2/3` chip are readable on desktop and mobile.
- Found a narrow balance risk: the protocol's resource assist could push Grow or Rite objective resources over their thresholds and make the final crown complete too quietly.
- Capped protocol-created objective resources below final thresholds while preserving already-earned resources.
- Captured post-fix desktop and mobile screenshots.

Files changed:
- `src/revival/kingdom2000.ts`
- `docs/night-runs/artifacts/wake-06-review-fix.md`
- `docs/night-runs/artifacts/wake-06-final-desktop-fixed.png`
- `docs/night-runs/artifacts/wake-06-final-mobile-fixed.png`
- `docs/night-runs/2026-06-27-kingdom-os-night.md`

Verification:
- `npm run build` passed.
- `npm test` passed.
- Headless Chromium desktop/mobile runs reached `Final 2/3` and stayed in `playing`.
- Post-fix desktop state: Rite `68%`, Crystal `51`, Morale `51`.
- Post-fix mobile state: Rite `88%`, Crystal `57`, Morale `77`.

Commit:
- `e5409df` (`Tune Kingdom OS final crown assist`)

Deploy:
- GitHub Pages deploy succeeded for pushed HEAD `e5409df`; run `28275900667`.
- Ledger commit `c1acdee` also deployed successfully; run `28275927728`.

Next recommendation:
- Next research pass should look beyond the final-act balance and study whether the game needs a stronger second-cycle choice: alternate program order incentives, more meaningful mode contrast, or one new event-chain twist.

## Wake 07 - Cycle 3 - Research

Start: 2026-06-27 02:45 UTC  
End: 2026-06-27 02:48 UTC  
Starting HEAD: `4905336`  
Dirty-tree status: clean except this wake's lock/temp files

Attempted:
- Inspected git status, current HEAD, recent commits, and the prior night-run ledger.
- Reviewed Wake 06 desktop/mobile screenshots for the final protocol state.
- Inspected current Kingdom OS program order, mode selection, plan rendering, and event code.
- Checked the live GitHub Pages URL, which returned HTTP 200.
- Wrote research artifact `docs/night-runs/artifacts/wake-07-research.md`.

Observation:
- Cycle 2 stabilized the final act, but early/mid-run replay still defaults toward a known checklist: Grow, then War, then Rite.
- The mode picker changes pacing but not strategic direction.
- Mobile has room for a temporary choice, but not a fourth permanent panel.

Files changed:
- `docs/night-runs/artifacts/wake-07-research.md`
- `docs/night-runs/2026-06-27-kingdom-os-night.md`

Verification:
- Docs-only research wake; no build required.
- Live Pages returned HTTP 200.
- GitHub Pages deploy succeeded for pushed artifact commit `2dec45c`; run `28276333932`.

Commit:
- `2dec45c` (`docs: research kingdom os commission choice`)

Deploy:
- GitHub Pages deploy succeeded for pushed HEAD `2dec45c`; run `28276333932`.
- Ledger commit `4aa554b` also deployed successfully; run `28276362803`.

Next recommendation:
- Implement a bounded one-time royal commission choice after the first crown: Farm Charter, Sky-Road Contract, or Crystal Mandate. Each option should apply one small benefit, one clear tradeoff, bias the next active program, then collapse into existing plan/advisor UI.

## Wake 08 - Cycle 3 - Implementation

Start: 2026-06-27 03:10 UTC  
End: 2026-06-27 03:19 UTC  
Starting HEAD: `9db7744`  
Dirty-tree status: clean except this wake's lock/temp files

Attempted:
- Implemented the Wake 07 recommendation as a bounded one-time Royal Commission choice after the first crown.
- Added a temporary `commission` overlay state with Farm Charter, Sky-Road Contract, and Crystal Mandate.
- Each commission applies one small benefit and one tradeoff using existing game resources.
- Choosing a commission biases the next active program if that program is unfinished, then returns the player to normal play.
- Surfaced the selected commission in the current program hint and mini status.
- Captured desktop, mobile, and post-choice screenshots with headless Chromium.

Files changed:
- `src/revival/kingdom2000.ts`
- `src/revival/kingdom2000.css`
- `docs/night-runs/artifacts/wake-08-implementation.md`
- `docs/night-runs/artifacts/wake-08-commission-desktop.png`
- `docs/night-runs/artifacts/wake-08-commission-mobile.png`
- `docs/night-runs/artifacts/wake-08-commission-post-choice.png`
- `docs/night-runs/2026-06-27-kingdom-os-night.md`

Verification:
- `npm run build` passed.
- `npm test` passed.
- Headless Chromium reached the commission overlay at `1/3` crowns on desktop and mobile.
- Choosing Crystal Mandate returned to `playing`, showed `Commission Crystal`, and set the current program to Rite.

Commit:
- `d1d498f` (`Add Kingdom OS royal commission choice`)

Deploy:
- GitHub Pages deploy succeeded for pushed HEAD `d1d498f`; run `28277027812`.
- Ledger commit `e34ad24` also deployed successfully; run `28277060551`.

Next recommendation:
- Review pass should check whether the commission overlay is too large on mobile, whether players can accidentally ignore it via background clicks, and whether Crystal Mandate makes Rite too attractive compared with Sky-Road Contract.

## Wake 09 - Cycle 3 - Review/Fix

Start: 2026-06-27 03:35 UTC  
End: 2026-06-27 03:43 UTC  
Starting HEAD: `7b41914`  
Dirty-tree status: clean except this wake's lock/temp files

Attempted:
- Played the local Kingdom OS 2000 build to the first crown with headless Chromium.
- Captured the Wake 08 commission overlay on desktop and mobile.
- Confirmed background play actions are blocked during the commission choice.
- Fixed mobile/desktop modal readability by hiding command/advisor panels while the commission overlay is active and making the commission card more opaque.
- Tuned Crystal Mandate into a clearer bargain: less gold, stronger morale cost, and a small Threat increase.
- Verified choosing Crystal Mandate returns to `playing`, selects Rite, and surfaces `Commission Crystal`.

Files changed:
- `src/revival/kingdom2000.ts`
- `src/revival/kingdom2000.css`
- `docs/night-runs/artifacts/wake-09-review-fix.md`
- `docs/night-runs/artifacts/wake-09-commission-desktop-fixed.png`
- `docs/night-runs/artifacts/wake-09-commission-mobile-fixed.png`
- `docs/night-runs/artifacts/wake-09-commission-crystal-post-choice-fixed.png`
- `docs/night-runs/2026-06-27-kingdom-os-night.md`

Verification:
- `npm run build` passed.
- `npm test` passed.
- Headless Chromium desktop/mobile screenshots captured after the fix.
- Commission command panel opacity was `0` during the modal and returned to `1` after choosing.
- Post-choice state: screen `playing`, current program `Light the Crystal Rite`, commission `Crystal`.

Commit:
- `ff37d8d` (`Tune Kingdom OS commission modal`)

Deploy:
- GitHub Pages deploy succeeded for pushed HEAD `ff37d8d`; run `28277575949`.
- Ledger commit `ddb5ada` also deployed successfully; run `28277606270`.

Next recommendation:
- Next research pass should study the late-game information layer: whether the final crown needs a clearer countdown/pressure readout, or whether the advisor feed should call out one best recovery action when Threat and Morale diverge.

## Wake 10 - Cycle 4 - Research

Start: 2026-06-27 04:00 UTC  
End: 2026-06-27 04:04 UTC  
Starting HEAD: `05e20be`  
Dirty-tree status: clean except this wake's lock/temp files

Attempted:
- Inspected git status, current HEAD, recent commits, and the prior night-run ledger.
- Reviewed Wake 09 commission desktop/mobile screenshots and the current HUD/advisor rendering code.
- Checked current CSS/mobile behavior for the advisor and command panels.
- Checked the live GitHub Pages URL, which returned HTTP 200.
- Wrote research artifact `docs/night-runs/artifacts/wake-10-research.md`.

Observation:
- The game now has readable map targets, a final act, and a mid-run commission choice.
- The late-game gap is not more spectacle; it is actionable guidance. During the final crown, the player sees raw Threat/Morale/Focus values but not one clear recovery order.

Files changed:
- `docs/night-runs/artifacts/wake-10-research.md`
- `docs/night-runs/2026-06-27-kingdom-os-night.md`

Verification:
- Docs-only research wake; no build required.
- Live Pages returned HTTP 200.

Commit:
- `ea26a15` (`docs: research kingdom os council orders`)

Deploy:
- GitHub Pages deploy succeeded for pushed HEAD `ea26a15`; run `28278028486`.

Next recommendation:
- Implement a bounded council-order readout: derive one urgent order from existing Threat, Morale, Focus, resources, cooldowns, and active program state; show it at the top of the advisor feed on desktop and inside the current-program card on mobile.

## Wake 11 - Cycle 4 - Implementation

Start: 2026-06-27 04:25 UTC
End: 2026-06-27 04:36 UTC
Starting HEAD: `3fb6bb6`
Dirty-tree status: clean except this wake's lock/temp files

Attempted:
- Implemented the Wake 10 recommendation as one bounded player-visible improvement.
- Added a state-derived Council order helper that chooses one current command from existing Threat, Morale, Focus, edict availability, and active program state.
- Rendered the Council order at the top of the desktop advisor feed.
- Rendered the same Council order inside the current-program card so mobile still has guidance while the advisor panel is hidden.
- Styled stable, warning, and critical order states inside the existing glass UI direction.
- Captured desktop and mobile final-protocol screenshots through a real headless Chromium UI playthrough.

Files changed:
- `src/revival/kingdom2000.ts`
- `src/revival/kingdom2000.css`
- `docs/night-runs/artifacts/wake-11-implementation.md`
- `docs/night-runs/artifacts/wake-11-council-desktop.png`
- `docs/night-runs/artifacts/wake-11-council-mobile.png`
- `docs/night-runs/2026-06-27-kingdom-os-night.md`

Verification:
- `npm run build` passed.
- `npm test` passed.
- Headless Chromium reached `Final 2/3` through the Sky-Road commission path.
- Desktop screenshot shows the Council order in the advisor feed.
- Mobile screenshot shows the Council order in the current-program card.
- Final screenshot state: program `Light the Crystal Rite`, order `Finish Rite - Cast Crystal Foundry now`, Threat `41`, Focus `100`, Morale `78`.

Commit:
- `e96f5b3` (`Add Kingdom OS council orders`)

Deploy:
- GitHub Pages deploy succeeded for pushed HEAD `e96f5b3`; run `28278803649`.

Next recommendation:
- Review pass should test the Council order under high-Threat and low-Morale states, and check whether the added order card makes the mobile command panel too tall during normal play.

## Wake 12 - Cycle 4 - Review/Fix

Start: 2026-06-27 04:50 UTC
End: 2026-06-27 04:54 UTC
Starting HEAD: `f922239`
Dirty-tree status: clean except this wake's lock/temp files

Attempted:
- Reviewed the Wake 11 Council order implementation and screenshots.
- Found the desktop command panel duplicated the same Council order already shown in the advisor feed.
- Kept the command-panel Council order as the mobile fallback because the advisor panel is hidden on small screens.
- Captured fresh desktop and mobile final-protocol screenshots with headless Chromium.

Files changed:
- `src/revival/kingdom2000.css`
- `docs/night-runs/artifacts/wake-12-review-fix.md`
- `docs/night-runs/artifacts/wake-12-council-desktop-fixed.png`
- `docs/night-runs/artifacts/wake-12-council-mobile-fixed.png`
- `docs/night-runs/2026-06-27-kingdom-os-night.md`

Verification:
- `npm run build` passed.
- `npm test` skipped because the fix is CSS-only.
- Headless Chromium reached `Final 2/3` through the Sky-Road commission path.
- Desktop screenshot shows one Council order in the advisor feed and none in the left current-program card.
- Mobile screenshot shows the Council order in the current-program card.
- Final screenshot state: program `Light the Crystal Rite`, order `Steady Citizens - Cast Market Festival now`, Threat `47`, Focus `100`, Morale `46`.

Commit:
- `a3e4ca8` (`Tune Kingdom OS council order layout`)

Deploy:
- GitHub Pages deploy succeeded for pushed HEAD `a3e4ca8`; run `28279191920`.

Next recommendation:
- Next research pass should study the opening five minutes: whether the first crown needs a stronger onboarding prompt, a clearer first-click highlight, or a small early win animation before the mid-run commission appears.

## Wake 13 - Cycle 5 - Research

Start: 2026-06-27 05:15 UTC
End: 2026-06-27 05:18 UTC
Starting HEAD: `7ee0351`
Dirty-tree status: clean except this wake's lock/temp files

Attempted:
- Inspected git status, current HEAD, recent commits, and the latest ledger entries.
- Reviewed Wake 12 desktop/mobile screenshots and current opening/program render code.
- Checked the live GitHub Pages URL, which returned HTTP 200.
- Captured a fresh live opening screenshot at `docs/night-runs/artifacts/wake-13-opening-live.png`.
- Wrote research artifact `docs/night-runs/artifacts/wake-13-research.md`.

Observation:
- The mid and late game now have clear guidance, choice, and final pressure.
- The first playable minute still asks the player to infer the intended first command from multiple panels.
- Harvest Boom is the intended opener, but the button is not specially staged and its initial cooldown makes it read inactive rather than guided.

Files changed:
- `docs/night-runs/artifacts/wake-13-research.md`
- `docs/night-runs/artifacts/wake-13-opening-live.png`
- `docs/night-runs/2026-06-27-kingdom-os-night.md`

Verification:
- Docs-only research wake; no build required.
- Live Pages returned HTTP 200.
- Headless Chromium captured the opening live screenshot.

Commit:
- `b6c9e4a` (`docs: research kingdom os opening decree`)

Deploy:
- GitHub Pages deploy succeeded for pushed HEAD `b6c9e4a`; run `28279712265`.

Next recommendation:
- Implement a bounded opening decree: highlight Harvest Boom as the first command on fresh runs, show a compact `First decree` hint in the current-program card, and clear the hint immediately after the first edict is cast.

## Wake 14 - Cycle 5 - Implementation

Start: 2026-06-27 05:40 UTC
End: 2026-06-27 05:51 UTC
Starting HEAD: `7c5dafe`
Dirty-tree status: clean except this wake's lock/temp files

Attempted:
- Implemented the Wake 13 recommendation as one bounded player-visible improvement.
- Added a first-edict state flag that resets every run and clears immediately after any edict is cast.
- Added a compact `First decree` prompt in the current-program card while the fresh Growth opener is active.
- Made Harvest Boom immediately ready on fresh runs and highlighted it as the first command.
- Removed the duplicate mobile Council order during the opening decree so the highlighted Harvest Boom button remains visible above the fold.
- Added a first-decree confirmation log line after the first Harvest Boom cast.
- Captured desktop opening, mobile opening, and post-first-decree screenshots with headless Chromium.

Files changed:
- `src/revival/kingdom2000.ts`
- `src/revival/kingdom2000.css`
- `docs/night-runs/artifacts/wake-14-implementation.md`
- `docs/night-runs/artifacts/wake-14-opening-desktop.png`
- `docs/night-runs/artifacts/wake-14-opening-mobile.png`
- `docs/night-runs/artifacts/wake-14-after-first-decree.png`
- `docs/night-runs/2026-06-27-kingdom-os-night.md`

Verification:
- `npm run build` passed.
- `npm test` passed.
- Headless Chromium state checks passed: desktop and mobile both show `First decree` and highlighted, enabled Harvest Boom.
- Post-edict state check passed: the hint is gone and Harvest Boom no longer has the opening-decree highlight.
- Mobile screenshot confirmed Harvest Boom remains visible at `743-811px` in an `844px` viewport.
- Live Pages returned HTTP 200 after deploy.

Commit:
- `53761fb` (`Add Kingdom OS opening decree`)

Deploy:
- GitHub Pages deploy succeeded for pushed HEAD `53761fb`; run `28280383098`.

Next recommendation:
- Wake 15 review should verify the opening decree in both AFK and Active starts, then check the live mobile command panel for cramped first-row edicts before finalizing the overnight report.

## Wake 15 - Cycle 5 - Review/Fix + Closeout

Start: 2026-06-27 06:05 UTC
End: 2026-06-27 06:13 UTC
Starting HEAD: `a281e8c`
Dirty-tree status: clean except this wake's lock/temp files

Attempted:
- Reviewed the Wake 14 opening decree locally with headless Chromium.
- Verified the first-decree flow through Active Steward, Quick AFK Run, and post-Harvest-Boom states.
- Captured desktop, AFK, post-edict, and mobile opening screenshots.
- Checked the live GitHub Pages URL, which returned HTTP 200.
- Collected commits since baseline `7f41598`.

Files changed:
- `docs/night-runs/artifacts/wake-15-review-fix.md`
- `docs/night-runs/artifacts/wake-15-cdp-report.json`
- `docs/night-runs/artifacts/wake-15-active-opening.png`
- `docs/night-runs/artifacts/wake-15-after-first-decree.png`
- `docs/night-runs/artifacts/wake-15-afk-opening.png`
- `docs/night-runs/artifacts/wake-15-mobile-opening.png`
- `docs/night-runs/2026-06-27-kingdom-os-night.md`

Verification:
- `npm run build` passed.
- `npm test` skipped because this wake changed only docs/screenshots and did not change source behavior.
- Active opening passed: `First decree` appears, `Harvest Boom` is highlighted, and the command is enabled.
- AFK opening passed with the same first-decree guidance.
- Post-edict state passed: the prompt and highlight clear immediately after `Harvest Boom`.
- Mobile opening passed at `390x844`: the first command row is readable and `Harvest Boom` remains inside the viewport at `743-811px`.
- Live Pages returned HTTP 200 before final push.

Commit:
- `e2b8acf` (`docs: review kingdom os wake 15`)

Deploy:
- Pending final ledger push.

Morning summary:
- Baseline: `7f41598` (`Add Kingdom OS night run ledger`)
- Final gameplay HEAD before closeout docs: `53761fb` (`Add Kingdom OS opening decree`)
- The night added visible program targets and crown payoff, tuned target readability, added the final crown protocol, tuned its assist pacing, added royal commission choices, cleaned up the commission modal, added council orders, removed desktop order duplication, and staged the first click with the opening decree.
- The playable proof is now clearer from first minute to final crown: the player sees what to do first, what program is active, what council command matters, when a mid-run bargain appears, and when the final push begins.
- Remaining risks: the mobile command panel still scrolls below the first row by design, and the broader game balance still needs longer human play sessions beyond headless happy-path checks.

Commits since baseline:
- `356e39b` docs: record kingdom os wake 01 research
- `9e94d6c` Add Kingdom OS program spotlight
- `6d8b7d1` Tune Kingdom OS program spotlight
- `88de51c` docs: research kingdom os final act
- `ab4ff28` Add Kingdom OS final crown protocol
- `e5409df` Tune Kingdom OS final crown assist
- `2dec45c` docs: research kingdom os commission choice
- `d1d498f` Add Kingdom OS royal commission choice
- `ff37d8d` Tune Kingdom OS commission modal
- `ea26a15` docs: research kingdom os council orders
- `e96f5b3` Add Kingdom OS council orders
- `a3e4ca8` Tune Kingdom OS council order layout
- `b6c9e4a` docs: research kingdom os opening decree
- `53761fb` Add Kingdom OS opening decree
- `e2b8acf` docs: review kingdom os wake 15

Next recommendation:
- Run one manual mobile playthrough on the live URL and decide whether to make the command panel a two-stage mobile drawer for longer sessions.
