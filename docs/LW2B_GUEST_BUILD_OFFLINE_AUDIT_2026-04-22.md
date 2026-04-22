# LW2B guest build offline audit (2026-04-22)

## Purpose

This note captures what can already be concluded about the narrowed **remote guest cannot build** bug without live multiplayer testing.

It covers:
- static code audit
- owner asymmetry review
- browser/runtime visibility review
- synthetic build-path tests

## Short conclusion

No obvious hardcoded host-only restriction was found in the worker build UI or in the network apply path.

The current offline evidence suggests:
- owner `1` build commands are *intended* to work symmetrically
- the menu/startup path maps guest clients to `myOwner = 1` correctly
- worker build buttons are rendered using `myOwner`, not hardwired to owner `0`
- `applyNetCmds(... build ...)` supports owner `1`
- offline synthetic tests confirm that owner `1` can create a construction site and spend resources correctly

This does **not** prove the live bug is gone.
It does mean the failure is more likely to be runtime-specific rather than a simple static owner asymmetry in the obvious build path.

## Static audit findings

### 1. Guest owner mapping looks correct

`menu.ts` starts online game with:
- host -> `myOwner = 0`
- guest -> `myOwner = 1`

This part looks correct and explicit.

### 2. Build UI path uses `myOwner` consistently

In `render/ui.ts`:
- worker build buttons are only shown for `e.owner === myOwner`
- costs and prerequisites are read from `state.gold[myOwner]`, `state.wood[myOwner]`, and owner-scoped building presence checks

This does not show a host-only hardcoding bug.

### 3. Gameplay input build path uses selected local workers only

In `game.ts` placement mode:
- selected ids are filtered by `isWorkerKind(e.kind) && e.owner === myOwner`
- emitted build command includes that worker's actual id

Again, this appears owner-symmetric.

### 4. Network build apply path also appears symmetric by design

In `netcmd.ts`:
- build commands resolve worker by id
- require `w.owner === owner`
- require worker type
- then call `issueBuildCommand(...)`

That is the correct intended shape for both owner `0` and owner `1`.

## Browser/runtime audit findings

### 1. No explicit visibility/focus hooks were found

A static search found no direct use of:
- `document.visibilityState`
- `document.hidden`
- focus/blur listeners controlling simulation

So there is no obvious explicit hidden-tab branch in code.

### 2. Simulation still depends on `requestAnimationFrame`

The game loop runs from `requestAnimationFrame` and accumulates sim ticks from frame deltas.

That means backgrounded or deprioritized tabs can still distort runtime behavior indirectly through browser scheduling.

So the earlier one-laptop fullscreen finding remains plausible even without an explicit visibility API branch.

### 3. Online command emission is gated by `onlineInputUnlocked`

`emit(cmd)` returns early if:
- online session exists
- and `onlineInputUnlocked === false`

Current unlock logic appears owner-symmetric, but live timing differences between peers may still matter.

## Synthetic test findings

A new synthetic test file was added:
- `src/sim/build-net-debug.test.ts`

Covered checks:
1. owner `0` and owner `1` both successfully apply a `build` command and create construction sites
2. owner `1` cannot incorrectly build using owner `0` worker id
3. owner `1` invalid occupied placement rejects cleanly without spending resources or assigning a build cmd

Result:
- offline synthetic tests pass

## What this narrows down

Because the obvious static paths look symmetric and offline owner-1 build succeeds, the live failure is now more likely to be inside one of these runtime-specific layers:
- guest emits a different worker id than expected during real online play
- remote peer receives/apply path with divergent entity id state
- placement validity diverges between peers during live session state
- guest worker state differs at build time during actual networked progression
- browser scheduling / timing changes the live local state enough to affect build acceptance

## Best next non-live step after this audit

If live testing still is not available, the next best analytical step would be:
- add one more narrow deterministic-style test around **entity id parity assumptions** for guest worker identity after synchronized spawn order
- optionally add a small state-checksum probe specifically around worker ids, owner ids, and early construction placement

## Current recommendation

Do not revert the current diagnosis back to "infra" or to a broad startup failure.

Current best framing remains:
- broad online path is much healthier than earlier tests implied
- owner-1 build is not statically broken in the obvious code paths
- the active issue is likely a runtime divergence affecting guest build acceptance in real multiplayer conditions
