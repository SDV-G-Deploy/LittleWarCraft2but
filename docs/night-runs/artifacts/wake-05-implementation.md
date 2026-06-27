# Wake 05 implementation: Final Crown Protocol

Date: 2026-06-27
Wake: 05/15
Cycle: 2/5
Phase: implementation
Starting HEAD: `0119a57`

## Scope

Implement one bounded player-visible final-act layer from Wake 04 research: when the run reaches `2/3` crowns and a final program remains, the game should clearly say this is the last push and make the map feel more urgent.

## Planned changes

- Add one-shot `Final Crown Protocol` state in `src/revival/kingdom2000.ts`.
- Trigger it after the second completed program assigns the remaining active program.
- Add advisor/HUD copy, a modest Focus/resource assist, a controlled Threat response, and target/route surge effects.
- Keep the existing three program requirements and victory condition unchanged.

## Acceptance checks

- Passed: `2/3` crowns shows `Final crown protocol` in the current program panel and `Final Crown` in the advisor feed.
- Passed: the remaining target visibly surges without hiding existing crowns or units.
- Passed: the run receives immediate Focus/resource help while Threat rises to create the final push.
- Passed: `npm run build`.
- Passed: `npm test`.
- Captured: `docs/night-runs/artifacts/wake-05-final-protocol.png`.

## Implementation notes

- Added one-shot state: `finalProtocolStarted` and `finalProtocolAge`.
- Triggered the protocol after the second crown assigns the remaining active program.
- Added plan-specific resource help, restored Focus, modest morale support, and a controlled Shade response.
- Reused the existing spotlight route and target ring to add a stronger final-crown surge.
