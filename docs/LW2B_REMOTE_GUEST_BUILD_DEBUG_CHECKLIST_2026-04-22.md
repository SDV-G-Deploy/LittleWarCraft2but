# LW2B remote guest build debug checklist (2026-04-22)

## Status update

This document is now primarily historical.

The previously narrowed bug where the remote guest could move and gather but could not build has since been fixed in live project state.
That means this checklist should no longer be treated as the current top-priority LW2B blocker.

What remains useful here:
- the earlier narrowing logic
- the command-path breakdown for future online command-specific regressions
- the reminder that one-laptop backgrounded-window testing can distort lockstep diagnosis

Current project-level priority has moved to **Russia-facing online accessibility / reachability**, not guest build acceptance.

## Historical narrowed problem

As of the earlier 2026-04-22 live-debug stage, the broad Helsinki realtime path looked substantially more alive than the first failing tests suggested.

Observed shape at that stage:
- the new UI and server flow completed
- connection could stabilize after some time
- the match started successfully
- on one laptop with two browsers, fullscreen / background-window behavior could distort the result because only the foreground window remained truly active
- when both browser windows remained visible instead of one effectively backgrounded, online play became functional enough for movement and harvesting
- host could play
- remote guest could move and gather
- remote guest could not build

At that time, this narrowed the active gameplay/runtime bug significantly.
It was no longer best described as a total online startup failure.
It looked like a more specific **remote non-host action-path bug**, with build commands the strongest current repro.

## What is already likely true

### 1. Infra is not the main blocker anymore

The Helsinki backend, PeerJS path, ICE API, and TURN/TLS on floating `443` are operational enough to allow a real match start.
That means the current highest-value debugging target should move away from infra and toward in-match command execution.

### 2. Earlier "dead controls" reports were at least partly polluted by browser visibility artifacts

Single-device testing with one browser effectively backgrounded can trigger timer throttling / reduced scheduling / visibility-side side effects.
That can make an online lockstep title look more broken than it really is.

### 3. The remaining bug is narrower

Since the guest can already:
- join
- enter the match
- move
- gather

but cannot:
- place or complete building actions

then the active fault is probably inside one of these narrower paths:
- build command emission from guest UI
- build command transport / scheduling for guest only
- build command application under owner `1`
- placement validity divergence between peers
- resource / ownership / worker-state validation mismatch on the guest path
- construction-site spawn / resume path divergence after command application

## Strongest current engineering hypothesis

The old startup-flow hypothesis should now be downgraded from "main diagnosis" to "possible contributing factor already partly mitigated".

The stronger active hypothesis is:
- the startup gate fixes likely helped enough to unfreeze general online play
- but **guest build actions** still fail on a more specific authority / validation / simulation-consistency path

In other words:
- broad transport readiness was probably one problem
- remote build execution is probably a second, narrower problem

## Best next repro shape

Do not use one laptop with one effectively backgrounded game window as the primary truth source.

Preferred repro order:
1. two separate devices
2. if not available, two visible side-by-side windows with neither effectively backgrounded
3. keep DevTools or runtime logs available on both peers if practical

## Debug checklist

### A. Confirm whether the guest actually emits `build`

On the guest side, verify that the UI path really reaches command emission when trying to build.

Target question:
- does the guest produce a `NetCmd { k: 'build', workerId, building, tx, ty }` at the moment of placement?

If no:
- the bug is UI/input-side
- possible causes: selection state, placement mode exit, worker filtering, hidden `onlineInputUnlocked` gate, focus/visibility side effects

If yes:
- continue downward into transport/application

### B. Confirm the command enters the network queue

Using the current diagnostics build, verify around the failed build attempt:
- whether outbound pending ticks increase as expected
- whether the packet containing the build command is announced and later becomes contiguous
- whether the remote side ever receives the tick carrying that build command

Target question:
- is the guest `build` command delivered to the host simulation timeline?

If no:
- inspect queueing / packet timing / delayed scheduling around the build click
- compare this with successful `move` and `gather` commands from the same client

If yes:
- continue to command application / validation

### C. Compare command-type-specific behavior

Because `move` and `gather` already work for the guest, compare the failing path against those working paths.

Useful question:
- what does `build` require that `move` and `gather` do not?

Likely differences:
- placement validation
- worker must remain valid and idle/interruptible
- resource checks
- construction-site creation on exact tiles
- footprint collision / blocking rules
- possible owner-specific or fog-specific placement disagreement

### D. Check owner-1 application specifically

The network apply path is owner-dependent.
A guest command is applied as owner `1`.

Verify that, when the host receives the guest build packet, the build apply path can actually resolve:
- the referenced `workerId`
- correct owner `1`
- valid worker kind
- valid placement tile
- sufficient resources for player 1

Target question:
- does `issueBuildCommand(state, worker, building, pos, tick)` return effectively successful for owner `1`, or does it silently fail because one guard rejects the request?

### E. Check for placement divergence between peers

A very plausible narrow failure is that the guest sees a tile as legal, but host-side validation rejects it.

Inspect whether the attempted build tile differs in legality because of:
- occupancy divergence
- construction footprint mismatch
- fog or stale local perception
- worker position drift between peers
- nearby blocker / entity mismatch

This is especially likely if:
- the guest sees the ghost as valid
- but the host simulation refuses to create a construction site

### F. Check resources and race/building-specific constraints for player 1

Since the host can build, but the guest cannot, verify parity for player 1:
- gold / wood counts on both peers
- race-specific building costs
- selected worker type
- whether player 1 worker is incorrectly busy or still marked with an incompatible cmd state

### G. Check whether construction site appears briefly then gets lost

It may not be a total rejection.
A site may spawn and then immediately diverge, be replaced, or get killed by mismatch.

Watch for:
- transient construction entity creation
- immediate rollback / disappearance
- command queue reset on the worker

## Practical instrument-first recommendation

The next best engineering step is **not** a broad rewrite.
It is a narrow instrument-first pass around guest build attempts.

Recommended temporary logs:
1. guest-side log at build emit
2. send-side packet summary when a tick includes `k: 'build'`
3. receive-side packet summary when that tick lands remotely
4. `applyNetCmds` log only for `k: 'build'`
5. `issueBuildCommand` success/failure reason log
6. placement-validation reason log on rejection

Keep these logs narrow and command-specific so they do not flood normal online play.

## Recommended next implementation step

If coding starts now, the best next patch should be:
- add **build-command-specific diagnostic logging** for remote guest attempts
- reproduce on two visible active peers
- determine exactly which stage fails:
  - emit
  - send
  - receive
  - apply
  - validate
  - construction spawn

Only after that should a fix be chosen.

## Current short status summary

- this checklist describes a bug that has already been fixed
- Helsinki realtime infra remains operational enough for real match start
- browser visibility on one laptop remains a useful diagnostic confounder to remember
- current top-level project blocker is now Russia-facing accessibility and online reachability, not guest build acceptance
