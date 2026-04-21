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

## Latest netcode status

Since the earlier validator drift fix, one additional narrow hardening pass also landed:
- `ceca959` , typed multiplayer command validator map in `src/net/session.ts`

Meaning:
- the specific recent validator/schema drift class is now better contained
- if a fresh live issue still appears, suspicion should shift earlier toward sim/determinism, command application edge cases, or mode-specific runtime behavior, not the exact same validator omission by default

## Current recommendation

The current build looks healthy enough to move back toward:
- live gameplay validation
- map pressure validation
- faction / opening testing

Netcode should stay in watch mode, not become the main workstream again, unless fresh evidence appears.

## April 2026 follow-up, regional accessibility and hosting direction

New live evidence changed the interpretation of current online reliability.

Observed:
- `https://w2.kislota.today/` can fail for users in Russia with a black screen before the main menu finishes loading
- `https://sdv-g-deploy.github.io/LittleWarCraft2but/` loads and runs single player from Russia
- at least one earlier Russia test succeeded in `SERVER` mode from the GitHub Pages frontend
- a Serbia user can currently use both frontends and both online modes successfully
- at least one Russia user currently fails in both `DIRECT` and `SERVER` with PeerJS errors, while single player still works from GitHub Pages

Interpretation:
- this is not strong evidence of a fresh gameplay lockstep bug
- there appear to be two separate network-access layers to treat independently:
  1. frontend accessibility to `w2.kislota.today`
  2. realtime online accessibility from some Russia networks to the self-hosted PeerJS / TURN / ICE backend on Hetzner
- because `SERVER` mode already worked at least once from GitHub Pages, the split-origin setup is not by itself disproven by current evidence
- the stronger suspicion is regional/provider-specific transport reachability, NAT behavior, WebRTC relay quality, or route quality to the Hetzner-hosted realtime stack

Recommended product/infra direction:
1. Treat the static frontend and the realtime backend as separate concerns
2. Keep the game client on a broadly reachable static host or CDN, for example GitHub Pages
3. Move the realtime backend (`PeerJS` signaling, ICE API, TURN) to a separately managed host and preferably a separate domain/subdomain
4. Prefer an explicit online backend URL model in the client instead of relying on the page origin or relative `./api/ice`
5. If Russia reachability remains important, prioritize testing or migrating the realtime backend to a provider/path with better Russia accessibility before spending effort on cosmetic domain renaming

Practical conclusion:
- changing only the public domain name is unlikely to be the main fix if the backend stays on the same Hetzner route/IP profile
- if migration effort is spent, it should target the realtime backend host/provider first
- the clean long-term architecture is:
  - static frontend on CDN / static hosting
  - dedicated realtime backend on its own host and subdomain

Next validation steps for this topic:
- continue using GitHub Pages as the safer frontend test surface for Russia-facing checks
- treat `w2.kislota.today` frontend black-screen reports as a separate accessibility issue from multiplayer protocol correctness
- when possible, collect exact PeerJS/browser console error text from Russia users to distinguish signaling failure from TURN/WebRTC establishment failure
