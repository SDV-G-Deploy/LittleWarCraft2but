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
Status: **next planned pass**

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
Status: **planned after Pass B**

Scope:
- quick focused live verification after the logic/UI fixes land
- this is not a new feature pass

Recommended checks:
1. worker chopping a tree that depletes on the final chop tick
2. worker carrying wood when source tree disappears
3. AI early wood timing on at least one human and one orc match flow
4. command panel readability in Russian labels and moving-worker states

Goal:
- confirm that Pass B fixed behavior rather than only looking correct in code

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

## Recommended next `/new`
Best next `/new` instruction:
- do **Pass B only**
- keep reroute, AI wood policy, and compact text cleanup narrow
- build
- self-review diff
- commit/push only if clean

Avoid in that pass:
- broad pathfinding changes
- larger UI architecture rewrites
- unrelated balance retunes
- new feature work

---

## Short operational summary
Current state:
- Pass A is done and pushed
- next highest-value work is Pass B
- remaining work should continue through small `/new` iterations, not one large cleanup branch
