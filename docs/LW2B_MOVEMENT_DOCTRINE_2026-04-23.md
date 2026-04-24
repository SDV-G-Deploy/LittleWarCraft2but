# LW2B Movement Doctrine

Date: 2026-04-23
Status: active engineering doctrine

## Purpose

This document captures the movement-design conclusions reached after forensic analysis of LW2B movement history.

The goal is to avoid repeating the same architectural oscillation:
- from simple but robust gameplay movement,
- to over-unified and fragile movement abstractions,
- back to rollback and patch layering.

LW2B is an RTS, not a physics simulator. Movement should first protect gameplay readability, economy continuity, and deterministic stability.

---

## Core doctrine

### 1. Do not force one movement model onto all domains

LW2B has at least three distinct movement domains:

1. **Plain move**
2. **Combat chase / engagement movement**
3. **Worker economy/build movement**

These domains should not be aggressively unified under one “correct” movement engine.

Shared helpers are acceptable.
Shared architecture that erases domain differences is not.

---

### 2. Prefer gameplay robustness over movement realism

When tradeoffs appear, prefer:
- units reaching destinations,
- AI economy staying alive,
- deterministic resolution,
- readable group behavior,

over:
- realistic collision purity,
- symmetric traffic correctness,
- elegant but brittle abstraction.

Slightly fake movement is acceptable if it improves RTS play.

---

### 3. Workers are a special-case traffic class

Workers should be treated as a **forgiving movement domain**, not as full participants in strict combat-style congestion logic.

Accepted worker-specific behavior includes:
- worker-worker soft or full pass-through,
- worker sidestep bias,
- worker yield-through around allied stationary combat units,
- worker transparency through other units when needed to preserve economy flow,
- permissive reroute behavior.

Worker movement should optimize for:
- continuity,
- throughput,
- anti-deadlock behavior,
- low economic stall risk,
- low townhall/base-lane congestion sensitivity.

Do **not** optimize worker movement primarily for realism.

---

### 4. Combat movement is where sophistication belongs

Combat units benefit from smarter movement behavior, including:
- melee slot assignment,
- congestion smoothing,
- flow-field-first chase when appropriate,
- deterministic reservation and local conflict resolution.

Combat movement may be more sophisticated than worker movement.
This is intentional and desirable.

---

### 5. Plain move may be moderately intelligent, not over-engineered

For generic move orders, the preferred stack is:
- flow-field-first or A* pathing,
- deterministic tile reservation where useful,
- simple sidestep,
- bounded repath.

Avoid turning plain move into a large generalized crowd-simulation framework.

---

## Architectural guidance

### Recommended target shape

#### Plain move
- flow-field-first or A* fallback
- deterministic reservations
- local sidestep
- bounded repath loops

#### Combat chase
- separate combat-aware movement path
- preserve target/LOS/range semantics
- melee slotting and congestion-specific behavior allowed

#### Worker movement
- separate forgiving worker path
- soft traffic rules
- deadlock-breaking exceptions allowed
- avoid dependence on strict shared collision logic

---

## What not to do again

### Avoid these patterns

- Rebuilding a single universal movement core for move + chase + gather + build
- Treating workers and combat units as equivalent traffic actors
- Increasing abstraction by adding many policy flags instead of separating domains
- Optimizing for elegance at the cost of economy stability
- Adding local step complexity without clear gameplay metrics or deadlock tests

If a new movement abstraction requires many booleans and special-case policy switches to fit workers, that is a warning sign that the abstraction is too broad.

---

## Evaluation rules for future movement changes

Before merging a movement change, ask:

1. **Which domain is this for?**
   - plain move
   - combat chase
   - workers

2. **Does this improve gameplay, or only theoretical correctness?**

3. **Can this create a deadlock or repath loop?**

4. **Does it increase hidden state or policy branching?**

5. **Would a narrower domain-specific rule solve the same problem more safely?**

Default preference:
- narrow fix > broad abstraction
- robust heuristic > elegant fragile model
- gameplay continuity > simulation purity

---

## Practical acceptance principles

A movement change is usually good if it:
- reduces visible stuck behavior,
- preserves or improves determinism,
- keeps workers from stalling the economy,
- improves combat readability,
- avoids architecture-wide coupling,
- simplifies worker traffic policy instead of layering more fragile exceptions.

A movement change is suspicious if it:
- introduces new generalized movement state for all domains,
- requires multiple exception flags to preserve worker behavior,
- makes worker travel more “correct” but less reliable,
- reduces readability while chasing theoretical path quality.

---

## Current doctrine-compatible direction

As of 2026-04-23, the preferred direction is:

- keep **combat movement** as the main area for advanced pathing work,
- keep **plain move** deterministic and moderate,
- keep **workers** permissive, economy-first, and allowed to become fully transparent if that best preserves flow,
- avoid reintroducing a single universal movement core.

---

## One-sentence rule

**In LW2B, movement should serve RTS gameplay first: combat may be smart, plain move may be simple, and workers should be forgiving rather than realistic.**
