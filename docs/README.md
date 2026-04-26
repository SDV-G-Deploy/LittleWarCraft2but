# LW2B docs index

This index keeps the docs set usable after many passes.

## Current source of truth (read first, in order)
- `LW2B_CURRENT_STATE.md` (short where-we-are-now entrypoint)
- `../README.md` (project status + run/deploy notes)
- `../ROADMAP.md` (current work plan)
- `../NETWORK_ARCHITECTURE.md` (canonical multiplayer architecture/deploy shape)
- `LW2B_GAMEPLAY_DOCTRINE_AND_CROSS_LAYER_INVARIANTS.md` (cross-layer gameplay guardrails)
- `LW2B_MOVEMENT_DOCTRINE_2026-04-23.md` (active movement doctrine)

Important reading rule:
- docs are narrative/project context, not a guarantee that the current HEAD still builds
- CI truth lives in GitHub Actions and local verification (`npm run build`, relevant tests)
- when docs mention a pass as landed, read that as "landed in code/doc history", not automatically "current branch is green"

## Canonical reading path
1. `LW2B_CURRENT_STATE.md`
2. `../README.md`
3. `../ROADMAP.md`
4. `../NETWORK_ARCHITECTURE.md`
5. doctrine docs and then active pass docs

## Agent guardrail for implementation passes
When working as a coding agent or `codex_alt` on LW2B:
- never treat doc wording like "build green", "landed", or "current state" as proof that HEAD is healthy
- before or immediately after a code-changing pass, verify with `npm run build`
- if command/state types changed, also run the most relevant targeted tests, and prefer `npm test` before pushing when the surface is wider
- if a docs-only commit describes a recent code pass, do not assume that commit preserved CI; check actual build/test truth separately
- prefer narrow code claims in docs: "landed in code at commit X" over branch-wide health claims

## Active implementation/design docs
- `LW2B_CHANGELOG_2026-04-24_MOVEMENT_RECOVERY.md`
- `LW2B_COMBAT_STABILIZATION_PASS_2026-04-24.md`
- `LW2B_WORKER_MOVEMENT_PASS_2026-04-24.md`
- `LW2B_WORKER_RETURN_RETARGET_PASS_2026-04-24.md`
- `LW2B_AI_GOAL_SPREAD_PASS_2026-04-24.md`
- `LW2B_MWC_E2E_VALIDATION_2026-04-24.md`
- `LW2B_MULTIWEBCORE_TRANSPORT_SPIKE_2026-04-24.md`
- `LW2B_SIMULATION_MODE_DESIGN_2026-04-23.md`
- `LW2B_DESTRUCTIBLE_BLOCKERS_PLAN.md`
- `LW2B_MAP_REBALANCE_VERIFICATION.md`

## Planning/support docs (still useful)
- `planning/NEXT_MULTIPLAYER_TESTS.md`
- `planning/NEUTRAL_OWNERSHIP_PASS.md`
- `planning/LW2B_REALTIME_BACKEND_OPTION_A.md`
- `planning/LW2B_PROVIDER_MIGRATION_PREP_2026-04-25.md`
- `LW2B_UI_DESIGN_GUIDELINES.md`
- `LW2B_MENU_UI_IMPLEMENTATION_PLAN_2026-04-22.md`

## Historical/archive
- `archive/2026-04/` contains earlier status snapshots, narrowed debug checklists, and superseded transport drafts kept for traceability.
- `planning/archive/` contains earlier balance-system drafts.

## Doc hygiene rule (lightweight)
When a doc is superseded but worth keeping, move it to `docs/archive/<YYYY-MM>/` and add a short note in that month’s archive README.
