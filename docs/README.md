# LW2B docs index

This index describes the archived LW2B documentation set.

## Read first

Read these in order:
1. `../PROJECT_STATUS.md`
2. `LW2B_CURRENT_STATE.md`
3. `FINAL_ASSESSMENT.md`
4. `../README.md`
5. `../ROADMAP.md`
6. `../NETWORK_ARCHITECTURE.md`

Important reading rule:
- docs are project context, architecture notes, and implementation history
- docs are not automatic proof that the current branch is healthy
- current truth still requires build/test/runtime verification when it matters

## Final entry docs

These are the canonical final-state entry docs:
- `../PROJECT_STATUS.md`
- `LW2B_CURRENT_STATE.md`
- `FINAL_ASSESSMENT.md`
- `../README.md`
- `../ROADMAP.md`
- `../NETWORK_ARCHITECTURE.md`

## Core doctrine docs

These remain useful as cross-cutting design and implementation doctrine:
- `LW2B_GAMEPLAY_DOCTRINE_AND_CROSS_LAYER_INVARIANTS.md`
- `LW2B_MOVEMENT_DOCTRINE_2026-04-23.md`
- `LW2B_BALANCE_EDITING_GUIDE_2026-04-26.md`
- `LW2B_UI_DESIGN_GUIDELINES.md`

## Architecture, validation, and systems docs

Useful when you need implementation detail, rationale, or operational context:
- AI audit and late-pass docs
- movement/pathing/match-flow pass docs
- network validation and transport docs
- retained planning/reference notes under `planning/`

Examples:
- `LW2B_AI_OPPONENT_DEEP_AUDIT_2026-04-25.md`
- `LW2B_MULTIWEBCORE_TRANSPORT_SPIKE_2026-04-24.md`
- `LW2B_MWC_E2E_VALIDATION_2026-04-24.md`
- `planning/LW2B_PROVIDER_MIGRATION_PREP_2026-04-25.md`
- `planning/LW2B_MWC_PROVIDER_MIGRATION_ANALYSIS_2026-04-25.md`
- `planning/NEXT_MULTIPLAYER_TESTS.md`

## Historical pass docs

Most dated pass documents should now be read as implementation history rather than active work items.

That includes:
- AI pass docs
- movement/pathing passes
- balance and map passes
- transport spike and validation notes
- archived reference material under `archive/`

## Planning and archived reference material

Planning notes that remain in the repo are archival/reference material unless a later research task specifically revives them.

Secondary or superseded material may also appear under:
- `planning/reference/`
- `archive/`

## Docs structure note

For the corpus structure and placement rules used during the documentation cleanup, see:
- `DOCS_STRUCTURE_NOTE_2026-04-29.md`

## Reading rule for later implementation sessions

If this repository is revisited later:
- do not treat wording like "landed", "current state", or "build green" as proof that HEAD is healthy
- verify with `npm run build`, `npm test`, or the most relevant targeted checks when a task depends on that truth
- treat most pass docs as historical rationale unless a fresh scoped task says otherwise
