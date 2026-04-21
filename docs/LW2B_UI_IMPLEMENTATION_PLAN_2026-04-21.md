# LW2B UI Implementation Plan (2026-04-21)

## Purpose
This document turns the approved UI guideline system into an engineering plan tied to the current LW2B codebase.

Primary source of visual direction:
- `docs/LW2B_UI_DESIGN_GUIDELINES.md`

Primary code touchpoints:
- `src/render/ui.ts`
- `src/render/renderer.ts`
- `src/game.ts`

This plan is intentionally pragmatic.
It is designed to improve the current HUD in controlled passes without breaking RTS usability or input behavior.

---

## 1. Current code reality

### 1.1 Split HUD responsibility
Right now HUD responsibilities are split across two render paths:

- `src/render/renderer.ts`
  - draws an old top-left HUD via `drawHUD()`
  - draws the minimap via `drawMinimap()`

- `src/render/ui.ts`
  - draws the newer top HUD via `drawTopHud()`
  - draws the bottom panel via `drawUi()`
  - draws selection info, production info, and action buttons

This means player-facing macro UI is currently fragmented across files and layers.
That is the root cause of several duplication and composition problems.

### 1.2 Bottom dock is not yet a real dock
`drawUi()` draws a wide bottom strip, but internal layout still behaves like separate hand-placed modules:
- portrait and selection info at left
- buttons aligned from right using `btnStartX`
- minimap drawn outside this system in `renderer.ts`
- online strip partly overlays the dock

This is workable for a prototype, but it is not yet a container-based layout.

### 1.3 Input uses hardcoded minimap placement
`src/game.ts` computes minimap clicks from `MINI_W`, `MINI_H`, `MINI_PAD` and assumes the minimap lives at bottom-right inside the gameplay view.
That coupling must be preserved carefully during any visual move.

### 1.4 A height mismatch already exists
`src/game.ts` says:
- `const UI_HEIGHT = 96; // must match render/ui.ts PANEL_H`

But `src/render/ui.ts` currently has:
- `const PANEL_H = 132;`

This should be fixed early.
It is a concrete sign that the layout needs one source of truth.

---

## 2. Main engineering goals

The next UI pass should achieve these structural goals:

1. Remove player-visible HUD duplication
2. Make the bottom area a true three-container dock
3. Convert commands to a stable grid-based command surface
4. Give the minimap an anchored dock card
5. Keep current RTS camera philosophy unchanged
6. Keep input behavior reliable while refactoring rendering

---

## 3. Recommended pass order

Do not attempt one giant rewrite.
Use narrow passes in this order.

### Pass 1. HUD unification and cleanup
Scope:
- hide default debug-like top-left HUD in `renderer.ts`
- keep only the new top HUD in `ui.ts`
- preserve any useful debug info behind an optional dev-only overlay path

Primary files:
- `src/render/renderer.ts`
- `src/render/ui.ts`

### Pass 2. Bottom dock containerization
Scope:
- define left / center / right dock containers in `drawUi()`
- make the dock layout explicit
- stop placing action buttons as a loose right-aligned strip

Primary file:
- `src/render/ui.ts`

### Pass 3. Command grid system
Scope:
- replace linear `addButton()` flow with slot-based command layout
- preserve existing actions and hotkeys
- make action family placement stable

Primary file:
- `src/render/ui.ts`

### Pass 4. Minimap integration pass
Scope:
- visually integrate minimap into the right dock container
- keep click math correct
- optionally move minimap frame drawing ownership into `ui.ts` while preserving terrain/entity rendering in `renderer.ts`, or keep draw ownership in `renderer.ts` but conform to dock geometry from a shared layout source

Primary files:
- `src/render/renderer.ts`
- `src/render/ui.ts`
- `src/game.ts`

### Pass 5. Selection panel hierarchy pass
Scope:
- reorganize selected panel into identity / core state / details
- reduce same-weight text density
- limit badge noise

Primary file:
- `src/render/ui.ts`

### Pass 6. Style token cleanup
Scope:
- unify panel fills, strokes, text colors, button states, section cards
- establish a small internal token set instead of repeating raw rgba/color literals everywhere

Primary file:
- `src/render/ui.ts`

---

## 4. File-by-file implementation notes

## 4.1 `src/render/renderer.ts`

### Current responsibilities relevant to this pass
- world render
- old top-left `drawHUD()`
- minimap render and frame

### Recommended changes

#### A. Retire old player HUD from default render path
Current issue:
- `drawHUD()` still renders old resource + tick + pressure text
- this duplicates macro information already present in `ui.ts`

Recommendation:
- stop calling `drawHUD()` in the default player render path
- keep the function only if needed for debug mode or delete after confirming no dependency

Expected result:
- removes duplicate resources
- removes debug/proto flavor from player-facing top area

#### B. Keep minimap rendering but prepare shared bounds
Current issue:
- minimap owns its own placement math
- bottom dock does not own the minimap geometrically

Recommendation:
- introduce a small shared layout description for minimap bounds
- `drawMinimap()` should receive exact x/y/w/h or a minimap rect instead of inferring from `MINI_*` globals alone

Why:
- this allows the minimap to visually belong to the right dock card
- avoids hidden coupling between `game.ts`, `renderer.ts`, and `ui.ts`

#### C. Preserve camera click correctness during transition
Do not change minimap world logic yet.
Only change geometry ownership and framing.

---

## 4.2 `src/render/ui.ts`

This file is the main implementation surface for the next pass.

### A. Introduce layout structs first
Before visual changes, add small layout helpers.

Recommended types:
- `Rect { x, y, w, h }`
- `DockLayout`
- `TopHudLayout`
- `SelectionLayout`
- `CommandLayout`
- `MinimapLayout`

Recommended helpers:
- `getTopHudLayout(viewW)`
- `getBottomDockLayout(viewW, viewH)`
- `getSelectionPaneRect(dock)`
- `getCommandPaneRect(dock)`
- `getMinimapPaneRect(dock)`

This is the key step toward container-first UI.

### B. Centralize panel constants
Current top-level constants are too local and partly outdated.

Recommended action:
- replace scattered geometry assumptions with a compact token block
- examples: dock height, outer margin, section gap, card padding, command cell size

Important:
- sync dock height with `game.ts` via a shared exported constant or shared layout source

### C. Rebuild `drawUi()` around explicit containers
Target sequence:
1. compute dock rect
2. draw dock background
3. compute left / center / right pane rects
4. draw pane cards
5. render selection into left pane
6. render command surface into center pane
7. render minimap card frame or minimap host into right pane
8. render overlays like online strip only inside owned containers

Current issue:
- `drawUi()` still treats the bottom area mostly as one strip with ad-hoc internals

### D. Split selection rendering into clearer subfunctions
Current `drawEntityInfo()` is too monolithic.
It contains identity, production, stats, mine info, opening-plan info, rally info, command state text, and hints.

Recommendation:
break it into sub-painters such as:
- `drawSelectionIdentity()`
- `drawSelectionCoreStats()`
- `drawSelectionProduction()`
- `drawSelectionContextDetails()`
- `drawSelectionHints()`

Benefits:
- easier hierarchy control
- easier collapse/expand behavior
- easier visual cleanup

### E. Reduce badge overflow
Current behavior can stack many badges horizontally from a fixed start position.

Recommendation:
- define a badge priority list
- cap simultaneous visible badges
- if needed, collapse overflow into one lower-priority summary state

Suggested cap for now:
- 2 badges max

### F. Convert `collectButtons()` into a slot-based command model
Current issue:
- buttons are added linearly from right to left area via a growing column index
- this produces drifting command positions and inconsistent panel feel

Recommendation:
introduce a command slot model such as:
- `CommandButtonSpec { slot, label, action, disabled, danger }`

Then:
1. gather specs by selected entity type
2. map specs into a fixed grid
3. draw cells from slot positions

Suggested near-term grid:
- 3 columns x 2 rows for simple pass, or
- 3 columns x 3 rows if you want future headroom immediately

Suggested slot stability:
- top-left area: primary train/build actions
- center area: secondary/train variants/upgrades
- bottom row edge: stop/cancel/demolish

### G. Separate production queue from command action if needed, but keep same pane
The production queue should visually live in the command pane system.
Do not let it read like a separate random block.

Practical option:
- left pane = selection info
- center pane upper band = production queue/status
- center pane lower band = command grid

This would fit the guideline very well.

### H. Promote style tokens
Current file repeats many raw colors.
Create named tokens such as:
- panelBg
- panelStroke
- sectionBg
- sectionTitle
- textPrimary
- textSecondary
- accentGold
- accentWood
- accentSupply
- accentDanger
- buttonEnabled
- buttonDisabled

This can be lightweight at first, but it will make the cozy-warcraft pass coherent.

---

## 4.3 `src/game.ts`

### A. Fix shared UI height ownership
Current mismatch between `UI_HEIGHT` and `PANEL_H` should be corrected.

Recommendation:
- export a shared constant from `src/render/ui.ts` or a tiny shared `ui-layout.ts`
- import it into `game.ts`

This prevents future drift.

### B. Decouple minimap input from hardcoded global placement
Current issue:
- `game.ts` computes minimap click region from `MINI_W`, `MINI_H`, `MINI_PAD`

Recommendation:
- use a shared minimap rect helper, ideally based on the same layout function used by render
- minimap click test should follow the actual rendered minimap bounds

This becomes important as soon as the minimap gets a proper dock card.

### C. Keep camera start behavior unchanged
Do not change:
- initial camera anchoring near the player base
- fog-driven unexplored composition

This is an explicit project decision.

---

## 5. Proposed target dock geometry

This is a design-engineering target, not a mandatory exact pixel spec.

### Bottom dock
Contains 3 panes:

#### Left pane, selection/info
Rough role:
- portrait
- identity
- HP
- top-priority state
- context details

Width target:
- medium fixed or semi-fixed

#### Center pane, commands/production
Rough role:
- production queue/status band
- stable command grid below or beside it

Width target:
- largest flexible pane

#### Right pane, minimap/awareness
Rough role:
- minimap card
- possible future awareness details

Width target:
- fixed or near-fixed

This should replace the current feeling of “left info + drifting buttons + separately rendered minimap”.

---

## 6. Concrete engineering tasks

## Task group A. Cleanup and source-of-truth

1. Create shared UI layout constants
2. Fix `UI_HEIGHT` vs `PANEL_H` mismatch
3. Remove old top-left player HUD from default render path
4. Decide whether old HUD survives only as debug mode

## Task group B. Layout scaffolding

1. Add `Rect` and dock layout helpers
2. Refactor `drawUi()` to use explicit pane rects
3. Draw dock card backgrounds from pane rects
4. Ensure online strip is assigned a real owner region

## Task group C. Selection panel restructuring

1. Split portrait from info card cleanly
2. Re-tier text hierarchy
3. Cap badges to 2 visible max
4. Move secondary hints lower in priority
5. Keep special-context info, but visually subordinate it

## Task group D. Command grid

1. Replace linear `addButton()` flow with slot-based specs
2. Define slot map for townhall
3. Define slot map for barracks
4. Define slot map for worker build menu
5. Define slot map for lumbermill upgrades
6. Reserve consistent destructive slot for demolish/cancel
7. Preserve hotkey labels in buttons

## Task group E. Minimap docking

1. Define minimap pane rect in shared layout
2. Render minimap inside that rect
3. Update minimap click hitbox to use same rect
4. Keep world-to-minimap mapping unchanged
5. Improve frame so minimap feels anchored, not leftover

## Task group F. Visual coherence

1. Introduce a lightweight theme token object
2. Normalize section-card styling
3. Normalize button fill/stroke/text states
4. Normalize title and secondary text colors
5. Remove visibly debug-like panel treatments from player HUD

---

## 7. Risks and cautions

### 7.1 Input drift risk
If minimap render bounds and minimap click bounds diverge, the feature will feel broken immediately.
This is the highest-risk regression in the pass.

### 7.2 Over-refactor risk
Do not redesign all gameplay text at once.
Keep the semantic information but improve its structure.

### 7.3 Production/readability risk
The current production panel contains useful information.
Do not remove it just to simplify composition.
Instead, re-home it inside the command pane.

### 7.4 Selection-detail overflow risk
`drawEntityInfo()` currently surfaces many gameplay-specific hints.
Some are useful. The problem is hierarchy, not their existence alone.
Collapse or de-emphasize before deleting.

---

## 8. Recommended first coding move

If starting implementation now, the best first code move is:

1. create shared layout constants and dock rect helpers
2. remove default call to old `drawHUD()`
3. make `drawUi()` compute explicit left/center/right pane rects
4. keep existing internals temporarily inside those panes

Why this first:
- it creates structural ownership without forcing a full rewrite in one shot
- it reduces duplication immediately
- it prepares the command-grid and minimap docking passes cleanly

---

## 9. Definition of done for engineering pass 1

Pass 1 should be considered done when:
- old duplicated top-left HUD is gone from normal play
- bottom dock has explicit left / center / right ownership
- minimap has a deliberate dock home
- command buttons no longer feel like loose floating controls
- `game.ts` and render code share a single truth for dock/minimap geometry

At that point, the project will have moved from prototype overlay behavior to real UI architecture.
