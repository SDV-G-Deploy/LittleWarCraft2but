# Next Multiplayer Tests

This note exists to keep live LW2B multiplayer validation focused after the April 2026 desync fix sequence.

## What was just verified

Verified in a live `SERVER` mode test:
- Serbia <-> Russia path worked
- towers were built during the match
- the previous mid-game desync did not reproduce
- match stayed synchronized

## Why this checklist exists

The recent online issue was a real lockstep bug, not just a vague connectivity problem.
It is now fixed, but follow-up testing should stay deliberate so future issues are easier to classify.

## Priority next tests

### 0. Wood-economy and UI pass validation
Goal:
- verify that the new wood economy feels smoother and that the HUD is readable in real play, not just in screenshots

Suggested focus:
- first farm timing for Human and Orc
- first lumber mill timing after the cost reduction to `60 wood`
- start-economy feel with `40` starting wood
- worker behavior when a chopped tree depletes
- whether the new top HUD is readable during combat / macro multitasking
- whether Human lumber mill and Orc war mill are instantly distinguishable from other buildings

Watch for:
- wood becoming too trivial instead of merely less harsh
- workers still stalling too often after local tree depletion
- UI chips feeling too wide or too screen-dependent on smaller view widths

### 1. Longer same-path soak
Goal:
- confirm the fix holds in longer live matches, not only one successful run

Suggested focus:
- longer macro game
- multiple expansions
- repeated tower builds
- mixed fights across several map regions

### 2. Stress command variety
Goal:
- hit more command types in one match

Suggested focus:
- move
- attack
- attack-move
- gather / return
- build
- train
- cancel / stop / resume if available in live flow

### 3. Reconnect / stall-adjacent behavior
Goal:
- see whether brief network roughness now fails honestly instead of drifting silently

Suggested focus:
- brief tab backgrounding
- minor connection hiccups if they happen naturally
- verify whether session stalls clearly rather than entering hidden divergence

### 4. Compare `SERVER` vs `DIRECT`
Goal:
- separate transport/bootstrap problems from gameplay/lockstep problems

Suggested focus:
- if a later issue appears in `SERVER` only, compare against `DIRECT`
- if both fail the same way, suspect gameplay/lockstep first
- if only `SERVER` fails, suspect self-hosted net path first

## Use the diagnostics when needed

If a future desync or suspicious freeze happens:
- compare `[sync]` lines on both peers
- find the first tick where hash differs
- check nearby `[net:in]` lines for reject / malformed / missing-packet clues
- capture a small window, not the whole console spam

Minimum useful capture:
- 5 to 10 `[sync]` lines around the first mismatch on both peers
- any `[net:in]` reject lines near that point

## What not to do

- do not immediately rewrite more netcode after one ambiguous symptom
- do not mix big gameplay changes with net-debug sessions
- do not remove diagnostics yet; they are cheap insurance

## Current recommendation

The current build looks healthy enough to move back toward:
- live gameplay validation
- map pressure validation
- faction / opening testing

Netcode should stay in watch mode, not become the main workstream again, unless fresh evidence appears.