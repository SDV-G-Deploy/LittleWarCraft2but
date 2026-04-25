# LW2B + MultiWebCore provider migration analysis (2026-04-25)

Purpose: make the migration frame explicit now that MultiWebCore is no longer just an exploratory side path for LW2B, but part of the validated realtime backend contour.

## 1. Executive conclusion

**Yes, MultiWebCore should be treated as part of the VDSina NL Phase A migration scope.**

Not because the platform itself is permanently tied to VDSina, but because the current LW2B realtime contour now includes a working `mwc` path that must be tested on the same provider/route profile as the rest of the multiplayer edge.

Operationally:
- **LW2B migration scope** should include `peerjs + ice-api + coturn + ws-relay + mwc`.
- **MultiWebCore platform scope** should stay provider-neutral, but its runtime should participate in the same pilot so route-quality and ingress behavior are measured honestly.

## 2. Why this changed

Earlier, `mwc` could be treated as a transport spike or optional future direction.
That is no longer the right framing.

Current reality:
- LW2B already has a validated end-to-end `mwc` transport pass.
- `mwc` sits on the same public realtime contour shape as the other online services.
- migration success criteria that ignore `mwc` would under-test the future browser-game backend path we are actively building.

So the important distinction is:
- **provider choice for the next pilot** is an LW2B operations decision,
- **platform design of MultiWebCore** remains reusable and provider-agnostic.

## 3. What exactly should move in Phase A

Treat the following as one movable realtime contour for the pilot:
- `nginx` public edge on `80/443`
- `peerjs`
- `ice-api`
- `coturn`
- `ws-relay`
- `mwc`

What does **not** need to move together as part of this specific contour decision:
- gameplay code
- deterministic sim logic
- product-level frontend identity as such
- long-term platform portability decisions

## 4. Why MWC must be included in the provider test

### 4.1 Honest reachability picture
If the target provider is chosen because of Russia-facing reachability, then `mwc` must be validated there too.
Otherwise we only prove that one subset of the stack improved.

### 4.2 Future-game relevance
MultiWebCore is intended as reusable browser-game networking infrastructure.
If it is excluded from the first serious provider migration pass, the pilot tells us less about the future stack than it should.

### 4.3 Shared ingress/ops behavior
Even if protocol behavior differs from PeerJS/WebRTC paths, `mwc` still depends on:
- public 443 reachability,
- websocket upgrade behavior,
- reverse proxy correctness,
- operator observability,
- logging and failure classification on the same operational contour.

That makes it part of the same migration truth, not a separate thought experiment.

## 5. What not to overstate

This conclusion does **not** mean:
- MultiWebCore is now “a VDSina-only platform”,
- same-origin `w2.kislota.today/mwc` is a forever rule,
- LW2B must fully switch product logic to MWC immediately,
- reconnect/resume becomes a Phase A migration blocker.

Those would be category errors.

Correct framing instead:
- VDSina NL is the **current Phase A pilot baseline**,
- `mwc` is part of the **realtime contour under test**,
- provider-neutral platform architecture stays intact,
- reconnect/resume remains **platform maturity work**, not current LW2B migration gating.

## 6. Recommended acceptance frame for the pilot

Phase A should prove, on the target contour:
- frontend can talk to the migrated backend stack,
- room create/join works for the existing online paths,
- `mwc` can complete real room create/join/start traffic,
- operator can classify failures by layer (`frontend`, `signaling`, `ICE`, `relay`, `mwc`),
- no meaningful regression appears for non-RU users.

This is enough to answer the provider question honestly without pretending the whole platform is fully mature.

## 7. Documentation implications

The docs should consistently reflect these rules:

### In LW2B docs
State that:
- `mwc` is part of the movable realtime contour,
- migration acceptance includes `mwc` validation,
- VDSina NL is the current baseline target for Phase A provider testing.

### In MultiWebCore docs
State that:
- the platform is provider-neutral,
- current LW2B operations are using VDSina NL as the next pilot baseline,
- current LW2B wiring is transitional, not a permanent platform law.

## 8. Recommended next documentation work

After this note, the clean next docs pass is:
1. keep `LW2B_PROVIDER_MIGRATION_PREP_2026-04-25.md` as the operator checklist,
2. use this note as the reasoning/decision companion,
3. gradually retire or annotate older Helsinki-only migration thinking where it still reads like the canonical future.

## 9. Short final verdict

**For LW2B operations: yes, MultiWebCore should migrate with the Phase A VDSina NL backend contour.**

**For MultiWebCore as a platform: no provider lock-in should be implied, only participation in the current pilot.**
