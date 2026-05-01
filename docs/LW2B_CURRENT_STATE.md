# LW2B final state (2026-05-01)

Canonical final-state entrypoint for where the project ended.

## One-line state

LW2B is a finished small RTS demo with deterministic client-hosted simulation, a functional gameplay/AI/runtime stack, and an archived status after reaching the natural ceiling of its current compact scope.

## Final status

- Project status: **Archived**
- Delivery state: **Demo complete**
- Active development status: **closed**

## What is true in the final codebase

- Core RTS gameplay loop is in place, including gold + wood economy, building, production, combat, and map play.
- Opening-plan selection (`Eco`, `Tempo`, `Pressure`) exists and is tied to real gameplay incentives.
- Movement/combat/worker recovery passes from late April are landed.
- Offline simulation mode exists as an observer-mode AI-vs-AI runtime.
- Online runtime supports three transport paths in code:
  - `peerjs`
  - `ws-relay`
  - `mwc`
- MultiWebCore transport has its own integration-test path.
- AI behavior is materially beyond a placeholder sparring bot and includes shipped or covered work for:
  - posture
  - goal spread
  - initiative identity
  - role split
  - mine intent
  - econ-collapse recovery
  - assault watchdog behavior
  - endgame / terminal-pressure behavior
- The test surface is broad enough that the repository should be read as a meaningful simulation/gameplay prototype rather than as a toy sketch.

## Final project strengths

1. Deterministic RTS core with readable economy/combat/map interaction.
2. Practical movement and worker-flow improvements backed by tests and doctrine notes.
3. Credible AI behavior work across pressure, recovery, and endgame states.
4. Useful online/runtime experimentation without requiring an authoritative-server redesign.
5. Strong documentation value as a research and implementation archive.

## Final limitations

- Content density remains intentionally limited.
- Army and tech vocabulary are sufficient for a demo, but not for a much broader long-form expansion through tuning alone.
- Map diversity improves match flow, but does not by itself create enough distinct long-term match archetypes to justify a major continuation without a larger content phase.
- The next meaningful increase in gameplay variety would require broader design/content expansion, not another narrow pass.

## Final operational reality

- LW2B uses client-hosted deterministic simulation.
- Frontend/public delivery and realtime/backend reachability should be treated as separate operational concerns.
- The online model should be understood through transport/bootstrap verification, not through assumptions that the project is becoming a server-authoritative game.

## Final interpretation

LW2B should now be read as:
- a completed experimental/demo RTS project
- a compact but real playable system
- a source of reusable technical and design lessons
- an archive, not an active roadmap

## Verification truth

Docs are not build truth.

If verification is needed later, confidence should still come from:
- `npm run build`
- `npm test`
- targeted transport or runtime checks when relevant

## Canonical reading order

1. `../PROJECT_STATUS.md`
2. `../README.md`
3. `../ROADMAP.md`
4. `../NETWORK_ARCHITECTURE.md`
5. `FINAL_ASSESSMENT.md`
6. `README.md` (docs index)
