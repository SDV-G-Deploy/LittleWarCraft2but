# LW2B Iterative Fix Plan (2026-04-21)

## Purpose
This note captures the current bug-fix cleanup track for LW2B after the latest direct review.

The intent is to move through the remaining problems in **small `/new` iterations** instead of one broad mixed pass.
That keeps each change reviewable, lowers regression risk, and makes commit boundaries cleaner.

---

## Review summary
A direct review pass identified 6 concrete issues worth treating as real defects or cleanup targets:

1. Orc barracks and orc lumbermill shared the same visual identity
2. AI wood economy behavior lagged behind the new wood-cost model
3. Workers could misbehave after a wood tile depleted, including bad reroute/fallback behavior
4. Minimap presentation had duplicate/conflicting draw ownership
5. Worker `Stop` action could collide with `Wall` in the command grid
6. Lower UI text density could still become cramped/overlapping in some states

These should not be solved in one large change.
They are split below into narrow passes.

---

## Pass structure

### Pass A — UI / visual identity / low-risk cleanup
Status: **done**

Scope:
- minimap duplicate/conflicting draw cleanup
- worker `Wall` vs `Stop` command-slot collision
- orc barracks vs orc lumbermill visual/naming separation

What landed:
- minimap render ownership was cleaned so it now anchors cleanly to the bottom-right UI pane geometry
- duplicate minimap labeling/overlay behavior was reduced
- command slot allocation was hardened so `Stop` no longer displaces `Wall` in the moving-worker case
- orc barracks no longer shares the lumbermill/war-mill visual identity
- orc barracks label confusion was corrected

Code result:
- build green
- pushed to `main`
- commit: `882346e`

Notes:
- this solved the most obvious visual/UI defects first
- it intentionally did **not** touch wood reroute logic, AI wood planning, or broad text/layout redesign

---

### Pass B — wood gather reroute + AI wood harvesting + small UI text compaction
Status: **done**

Scope:
1. worker wood depletion reroute bug
2. AI wood harvesting update
3. small command-panel text compaction cleanup

#### B1. Worker wood depletion reroute
Primary target files:
- `src/sim/economy.ts`
- possibly small follow-through in `src/sim/commands.ts` or `src/sim/pathfinding.ts` only if strictly required

Problem shape:
- after a tree depletes, worker gather state can fall into a bad transition
- reported symptom: workers sometimes drift to the top-left area and stall
- most likely cause is a bad state transition around depleted-tree retarget vs returning/idle fallback

Goal:
- make worker state transitions explicit and safe when the source tree disappears
- never leave mixed old-target/new-phase state behind

Definition of done:
- on depletion, worker either:
  - retargets to a valid nearby tree cleanly, or
  - returns carried wood correctly, or
  - goes safely idle
- no drift toward invalid fallback coordinates

What landed:
- wood depletion reroute now re-evaluates from the worker's current position instead of clinging to the exhausted tree's old tile id
- gather state is explicitly reset on successful wood retarget so stale path / stale phase state does not leak through the return loop
- post-return guard was tightened so a worker does not resume toward a dead tree target after deposit
- AI now uses a narrow demand-based wood worker allocation policy instead of keeping nearly all workers gold-first
- AI wood demand considers near-term lumbermill, farm, doctrine, tower, and wood-cost production pressure
- lower command-panel labels were compacted by removing unnecessary bracket noise around cost lines

Code result:
- build green
- pushed to `main`
- commit: `bcb0628`

Notes:
- this stayed narrow to `src/sim/economy.ts`, `src/sim/ai.ts`, and `src/render/ui.ts`
- no broad pathfinding rewrite
- no balance retune, map redesign, netcode work, or large UI architecture changes

#### B2. AI wood harvesting
Primary target file:
- `src/sim/ai.ts`

Problem shape:
- wood costs now matter more, but AI still behaves too much like a gold-first economy script
- AI needs explicit wood allocation logic rather than relying on incidental behavior

Goal:
- add a small demand-based wood policy, not a broad economy rewrite
- when wood is needed for build/train/upgrade timing, allocate at least a minimal worker presence to trees

Definition of done:
- AI can reliably support lumbermill / tower / wall / doctrine / wood-cost production timing without obvious starvation
- the diff stays narrow and readable

#### B3. UI text compaction
Primary target file:
- `src/render/ui.ts`

Problem shape:
- some command labels are still too dense for the fixed panel height and cell geometry
- the issue is strongest in multi-line buttons and localized text-heavy states

Goal:
- reduce overcrowding without doing a full UI redesign
- prefer smaller label cleanup and compact rendering rules over layout expansion

Definition of done:
- no obvious text collisions in the main reviewed states:
  - worker
  - barracks
  - lumbermill
  - construction / demolish
  - doctrine buttons

---

### Pass C — validation pass
Status: **done**

Scope:
- quick focused validation after the logic/UI fixes landed
- this remained a validation pass, not a new feature pass

Checks performed:
1. worker chopping a tree that depletes on the final chop tick
2. worker carrying wood when source tree disappears
3. AI early wood timing audit for Human and Orc flow logic
4. command panel readability audit for Russian labels and moving-worker states

Result:
- Pass C completed clean
- no new in-scope defects were confirmed strongly enough to justify a code change in this pass
- no fixes were made
- build stayed green

Validation note:
- this pass confirmed the narrow reroute / AI harvesting / UI compaction work through targeted validation audit and build verification
- no broader pathfinding, balance, or UI architecture work was pulled into scope

---

## Why `/new` iterations are the right approach
This fix line touches three different risk classes:
- UI presentation
- simulation/economy state transitions
- AI economic behavior

Keeping each `/new` pass narrow gives these benefits:
- easier diff review
- lower regression probability
- cleaner commit history
- less chance of mixing a good UI cleanup with a risky sim bug

That is the recommended workflow for the remaining LW2B cleanup.

---

## Post-Pass-C narrow follow-up
Status: **done**

Scope:
- UI upgrade target summaries only
- remove the remaining hardcoded race-specific target hint paths in `src/render/ui.ts`
- move summary generation to resolved balance metadata via upgrade groups / applies-to data

What landed:
- upgrade target hints are now generated from data instead of hardcoded race-specific helper branches
- compact target summaries also derive from the resolved target set instead of a second manual rules list
- the pass stayed local to the summary layer in `src/render/ui.ts`

Code result:
- build green
- pushed to `main`
- commit: `4ddba60`

Notes:
- this was a narrow UI-truth-source cleanup, not a broader UI architecture change
- no balance, AI, renderer, pathfinding, network, or semantic-cleanup scope was mixed into this pass

## Multiplayer validator hardening follow-up
Status: **done**

Scope:
- narrow netcode hardening only
- reduce future drift risk between wire-command definitions and multiplayer validator coverage
- no transport rewrite, no gameplay/sim rewrite, no broad audit

Trigger:
- live multiplayer regression analysis identified validator/schema drift as a real recent failure class
- `59e843f` fixed the immediate drift for `lumbermill` / `rally.plan` / recent command surface sync
- one more narrow hardening pass was approved to make this class of mistake less likely to recur

What landed:
- `src/net/session.ts` manual `switch`-based net-command validator was replaced by a typed validator map
- validator coverage is now keyed by `NetCmd['k']`, making command-kind coverage much harder to forget when new wire commands are added
- explicit validator coverage remains in place for:
  - `build:lumbermill`
  - `rally.plan`
  - doctrine upgrades

Code result:
- build green
- pushed to `main`
- commit: `ceca959`

Notes:
- this was a narrow structural hardening pass, not a transport-layer change
- it lowers drift risk, but does not replace future acceptance/regression tests
- next multiplayer work should return to live smoke testing and symptom-driven follow-ups, not speculative net refactors

## Recommended next `/new`
The immediate upgrade-summary follow-up is now closed.

Best next `/new` instruction:
- start from the next concrete live-found defect or next approved narrow gameplay/UI issue
- prefer validation/testing over speculative cleanup by default
- keep the same small-pass discipline: one clearly bounded defect cluster only
- reproduce the issue, fix only that issue, build, self-review diff, then commit/push if clean

Still avoid:
- broad pathfinding changes
- larger UI architecture rewrites
- unrelated balance retunes
- mixed multi-problem cleanup passes
- additional cleanup passes without a real trigger

---

## Short operational summary
Current state:
- Pass A is done and pushed
- Pass B is done and pushed
- Pass C validation is done and clean
- narrow UI upgrade-summary follow-up is done and pushed
- repo should continue through small `/new` iterations, not one large cleanup branch
