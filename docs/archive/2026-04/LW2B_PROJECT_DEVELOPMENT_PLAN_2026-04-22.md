# LW2B project development plan (2026-04-22)

## Why this document exists

LW2B already looks bigger internally than it appears from the outside.

It still presents as a compact RTS-like project, but the actual system now spans:
- economy rules
- unit roles and combat readability
- race asymmetry
- upgrades and doctrines
- AI behavior differences
- offline and online simulation consistency
- UI/state synchronization
- map and expansion incentives

That is enough complexity that the project should now be guided by explicit development priorities rather than only local feature passes.

This note captures a practical development direction for the next stage.

## Core principle

The next major goal is **predictability**.

Not predictability in the sense of being boring.
Predictability in the sense that:
- AI behaves consistently
- online games do not break on edge cases
- UI does not promise actions the simulation rejects
- the same rules are enforced in UI, sim, and net paths
- race identity remains understandable under pressure

This is the point where a prototype starts becoming a game.

## Project pillars

New work should ideally strengthen at least one of these pillars.

### 1. Economy
- mining / wood gathering loop
- expansion timing and value
- resource pressure and pacing
- buildup into military and tech

### 2. Positional play and maps
- meaningful territory control
- expansion decisions
- defensible vs contestable map zones
- terrain that creates choices rather than confusion

### 3. Race asymmetry
- Human and Orc should feel different to play and fight against
- asymmetry should produce style, not hidden unfairness
- upgrades, doctrines, and unit mixes should reinforce race identity

### 4. Reliable multiplayer
- host/guest symmetry
- deterministic command application
- fewer runtime-only desync-like failures
- UI and online state should feel trustworthy

If a proposed change does not reinforce one of these pillars, it should be questioned before implementation.

## Current high-level reading of the project

### What is already strong
- the project has a real gameplay loop, not just a shell
- difficulty is moving toward behavior-driven design instead of cheats
- upgrades and doctrines create room for identity and scaling
- maps already matter to gameplay
- the online path is active enough that robustness now matters

### What is currently risky
- the game can look simpler than it is, which hides architectural risk
- many systems now interact across UI, simulation, and network layers
- AI improvements can accidentally expose deeper balance issues
- local fixes may drift without a written doctrine or invariant set

## Five main technical risks

### 1. UI / sim / net rule drift
The biggest structural risk is that one layer allows or suggests behavior that another layer rejects or interprets differently.

Examples:
- build prerequisites mismatch
- owner-scope mismatch
- upgrade availability mismatch
- placement validation differences

This class of issue is costly because it damages player trust quickly.

### 2. Runtime-specific online failures
Some bugs are not obvious in offline tests and only appear in live or near-live multiplayer contexts.

Risk areas:
- host/guest asymmetry
- input timing differences
- entity identity assumptions
- hidden frame/timing effects

### 3. AI complexity outrunning gameplay clarity
Smarter AI is good, but if combat readability, unit role clarity, or macro balance are still unstable, stronger AI will reveal and amplify those weaknesses.

### 4. Local optimizations without shared invariants
Point fixes can accumulate into a system that works locally but becomes hard to reason about globally.

Without explicit invariant documentation, maintenance cost rises fast.

### 5. Balance snowball hidden inside macro systems
Economy, upgrades, expansions, and tower safety may combine into one dominant game flow without it being obvious immediately.

This is especially dangerous in a project where the game still feels "small" on the surface.

## Five best next improvements by impact / cost

### 1. Formalize gameplay doctrine in one document
Create a durable design note describing:
- Human identity
- Orc identity
- intended early / mid / late game feel
- what easy / medium / hard should feel like
- acceptable and unacceptable dominant patterns

**Why this is high value:**
It reduces future drift and makes balance / AI work much easier to judge.

### 2. Define and enforce core cross-layer invariants
Create a short checklist or doc for rules that must stay identical across UI, sim, and net.

Examples:
- build prerequisites
- upgrade gating
- ownership rules
- placement legality
- resource costs

**Why this is high value:**
This prevents an especially painful class of regressions.

### 3. Expand deterministic coverage for multiplayer-sensitive rules
Add more focused tests around:
- owner symmetry
- build/apply flows
- upgrades
- construction placement
- early-game command legality

**Why this is high value:**
Cheap protection against bugs that are hard to reason about manually.

### 4. Continue AI improvements, but only where they reveal design intent
Recommended AI priorities:
- upgrade priorities by phase
- attack/retreat pacing
- better reaction to pressure
- composition by role and map situation

**Why this is high value:**
AI should be used as a gameplay lens, not as a complexity sink.

### 5. Improve player-facing clarity in the UI
Especially around:
- why something cannot be built
- what upgrades do
- what each difficulty means
- what doctrine choice changes

**Why this is high value:**
Clarity reduces false bug reports and makes balance easier to feel.

## Suggested work order

### Track A. Reliability first
1. Sync critical UI/sim/net rules
2. Add targeted tests for sensitive game actions
3. Keep online build / command paths under active verification

### Track B. Gameplay doctrine second
1. Write race identity goals
2. Write difficulty identity goals
3. Define expected early / mid / late pacing
4. Define obvious anti-goals (dominant degenerate patterns)

### Track C. AI after doctrine
1. maintain no-cheat philosophy
2. improve phase-aware upgrades
3. improve response to pressure
4. improve composition and tactical intent
5. avoid huge AI rewrites until doctrine is explicit

### Track D. UX polish after rule confidence rises
1. stronger action feedback
2. clearer error states
3. clearer explanation of progression and upgrades
4. better communication of difficulty differences

## Guidance for future feature decisions

Before starting a new feature, ask:
1. Which pillar does this strengthen?
2. Does it introduce rule drift risk across UI / sim / net?
3. Will this improve gameplay clarity, or only local cleverness?
4. Does this belong before or after doctrine/invariant documentation?
5. Is there a small test or doc that should land with it?

If those questions do not have good answers, the feature is probably not urgent.

## Practical near-term recommendation

The best immediate combination for LW2B is:
- keep current AI work focused and incremental
- write doctrine / invariants docs now
- keep pushing multiplayer consistency checks
- prefer small reliable passes over broad speculative rewrites

That path should create the best ratio of progress to breakage risk.

## Summary

LW2B is no longer just a simple prototype with isolated mechanics.
It is becoming a real game system.

That means the project now benefits most from:
- architectural discipline
- explicit design doctrine
- cross-layer consistency
- small focused gameplay passes
- reliability work that preserves player trust

The project is in a good place, but it has reached the stage where clear priorities matter as much as implementation speed.
