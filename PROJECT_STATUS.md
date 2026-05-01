# LW2B Project Status

Status: **Archived**  
Delivery state: **Demo complete**

## Summary

LittleWarCraft2but (LW2B) is a small RTS demo built around a deterministic client-hosted simulation model, readable economy/combat/map play, and practical multiplayer transport experimentation.

The project is now archived.

This is not a failure state. The demo and research phase reached a useful endpoint, produced real technical and design value, and no longer justifies continued active expansion in its current form.

## Why the project was archived

LW2B reached a natural design ceiling for its current scope.

By the end of the demo phase, the project already had:
- a working RTS core loop
- deterministic simulation foundations
- map-pressure and contested-resource gameplay
- opening-plan gameplay hooks
- race identity and basic doctrine structure
- a substantial AI behavior and regression surface
- multiple online transport paths in code

What it did not have was enough content density to justify a much larger continuation without entering a new project phase.

The next meaningful step would require materially broader content and design expansion, for example:
- more unit-role diversity
- a wider tech / strategic vocabulary
- deeper map-mechanical diversity
- a larger gameplay-content phase rather than incremental tuning

That is a different scope from finishing and documenting a strong demo.

## What this project accomplished

LW2B produced useful work in several areas:
- deterministic RTS simulation foundations
- economy, production, combat, and map-pressure gameplay loop
- worker pathing and movement recovery improvements
- AI pressure, posture, role split, recovery, and endgame behavior work
- multiplayer transport support across `peerjs`, `ws-relay`, and `mwc`
- practical documentation around RTS architecture and validation surfaces

## Final interpretation

LW2B should be read as:
- a finished experimental/demo RTS project
- a compact playable system with meaningful engineering and design lessons
- a reference base for future work, not an active roadmap

## What is not planned

The following are not currently planned:
- active gameplay expansion
- large new content phases
- broad architecture rewrites
- continued roadmap execution as if the project were still in active production

## If the project is ever revisited

A future revival should be treated as a new scoped phase, not as routine continuation.

Any revival would likely need a fresh design brief answering whether the goal is:
- preserving LW2B as a small polished RTS, or
- expanding it into a broader content-driven game with a different scope profile
