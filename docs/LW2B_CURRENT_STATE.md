# LW2B current state (2026-04-25)

Short entrypoint for "where we are now" without re-reading all historical passes.

## One-line state

Core gameplay/movement recovery is stabilized, build is green, and online topology is currently split in practice: `w2.kislota.today` is the public frontend while realtime infra is being treated as a separately movable backend contour (currently `rts.kislota.today` in active diagnostics).

## What is currently true

- Movement/combat/worker recovery passes from 2026-04-24 are landed and documented.
- AI goal spread and worker return-retarget fixes are landed.
- MultiWebCore transport path has an end-to-end validation pass.
- Effective production reality is transitional split-topology: frontend reachability and realtime reachability are tracked separately.

## Public online topology decision note (2026-04-25)

Current diagnostic conclusion:
- `w2.kislota.today` and realtime backend reliability are not the same problem surface.
- We should treat static frontend delivery and realtime signaling/ICE/TURN as separate operational layers.

Viable canonicalization options:
1. Keep strict same-origin on `w2.kislota.today` (frontend + realtime together).
2. Keep split topology: `w2` as frontend, `rts` as canonical realtime backend.
3. Move to a neutral canonical backend hostname (for example `rtc.*`) while keeping frontend host independent.

Recommended safest path now:
- Use option 2 as the short-term production baseline, then migrate toward option 3 after stability evidence.
- Do not force a same-origin-only rollback until Russia-facing reachability and cross-origin behavior are consistently validated.

## Active focus

1. Validate and tune gameplay variety using the current map-pressure package.
2. Keep determinism-sensitive changes narrow and reviewable.
3. Advance simulation-mode design/implementation in small passes without disturbing online paths.

## Explicit non-focus (for now)

- No broad netcode rewrite.
- No rollback/reconciliation initiative.
- No large architecture churn without concrete blocker evidence.

## Canonical reading path

1. `../README.md`
2. `../ROADMAP.md`
3. `../NETWORK_ARCHITECTURE.md`
4. `README.md` (docs index)
5. `LW2B_GAMEPLAY_DOCTRINE_AND_CROSS_LAYER_INVARIANTS.md`
6. `LW2B_MOVEMENT_DOCTRINE_2026-04-23.md`

Then read the latest active pass docs as needed from `README.md`.
