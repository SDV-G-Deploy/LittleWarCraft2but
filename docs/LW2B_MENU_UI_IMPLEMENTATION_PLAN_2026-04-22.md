# LW2B Menu UI Implementation Plan (2026-04-22)

## Purpose
This document turns the recent LW2B menu UI review into a careful engineering plan for the current canvas menu flow.

It is intentionally scoped to the menu layer only.
This plan does not touch gameplay simulation, networking, session flow, or match startup wiring.

Primary current code touchpoint:
- `src/menu.ts`

Target outcomes of this plan:
- improve screen fit on common desktop and laptop sizes
- make map selection reliably usable
- reduce layout fragility from hardcoded geometry
- prepare the menu code for later keyboard navigation and setup-flow improvements

---

## 1. Scope and non-goals

### In scope
- menu layout tokens and constants
- responsive map selection grid
- sticky map header with pinned difficulty controls
- responsive race select layout
- small i18n cleanup for menu hint text
- low-risk structure extraction from `src/menu.ts`

### Explicitly out of scope for this pass
- `handleAction` behavior changes
- network/session code changes
- `startGame()` wiring changes
- online host/join flow changes
- join-code input behavior changes
- gameplay HUD or in-match UI

This is a rendering and layout pass, not a flow rewrite.

---

## 2. Current menu code reality

### 2.1 Menu rendering is concentrated in one file
The current menu system is mostly implemented in:
- `src/menu.ts`

That is workable for a prototype, but it means layout math, rendering, hover/click behavior, and screen-specific geometry are interleaved.

### 2.2 Fixed geometry is the main fragility
The current menu uses hardcoded sizes in multiple places, for example:
- fixed card widths/heights
- fixed gaps
- fixed title and row offsets
- fixed assumptions about how many cards fit on screen

This causes the menu to look acceptable on some screen sizes and fragile on others.

### 2.3 Map select was the clearest user-facing failure
The first confirmed pain point was map selection in single player:
- some map cards did not fully fit vertically
- lower controls could become unreachable
- page scroll was unavailable because the menu is canvas-based

A first fix already introduced wheel scrolling.
That fixed the blocker, but the screen is still structurally too rigid.

### 2.4 Race select is less broken but still brittle
Race select appears more stable than map select, but it still depends on fixed card geometry.
On narrower or shorter screens, it risks feeling cramped or visually awkward.

---

## 3. Engineering goals for this pass

The next menu pass should achieve these goals:

1. Remove dependence on fixed one-size-fits-all map layout
2. Keep map controls readable while only the map list scrolls
3. Make race select usable on narrower screens without overlap or crowding
4. Centralize menu spacing, typography, and geometry values
5. Prepare `menu.ts` for future extraction instead of growing more ad hoc

This pass should improve usability immediately while preserving current flow behavior.

---

## 4. Recommended pass order

Do not do one giant rewrite.
Use narrow, reversible steps.

### Pass 1. Tokenization and constant cleanup
Scope:
- add menu tokens for spacing, typography, colors, breakpoints, card sizes
- replace repeated literals in `menu.ts` with token references

Primary files:
- `src/menu.tokens.ts`
- `src/menu.ts`

### Pass 2. Layout helper extraction without behavior change
Scope:
- move scroll/layout math into pure helpers
- keep current behavior first
- make later layout changes safer

Primary files:
- `src/menu.layout.ts`
- `src/menu.ts`

### Pass 3. Responsive map grid
Scope:
- replace fixed 3-column map layout with adaptive 1/2/3 column logic
- compute card width and positions from viewport width
- compute scroll range from actual content height

Primary files:
- `src/menu.layout.ts`
- `src/menu.ts`

### Pass 4. Sticky map header
Scope:
- pin title and difficulty controls
- scroll only the map card area
- keep current selection/start behavior unchanged

Primary files:
- `src/menu.layout.ts`
- `src/menu.ts`
- `src/i18n.ts` (optional hint text cleanup)

### Pass 5. Responsive race select
Scope:
- use 2-column layout on wide screens
- use 1-column stacked layout on narrow screens
- preserve the same race actions and selection behavior

Primary files:
- `src/menu.layout.ts`
- `src/menu.ts`

---

## 5. Proposed files and responsibilities

### 5.1 `src/menu.tokens.ts` (new)
Purpose:
- one source of truth for menu-specific constants

Recommended contents:
- breakpoints
- spacing scale
- font presets
- colors
- card geometry bounds
- button size minimums
- gaps and paddings

Suggested structure:

```ts
export interface MenuTokens {
  colors: {
    bgTop: string
    bgBot: string
    gold: string
    goldDim: string
    panelBg: string
    panelStroke: string
    btnFill: string
    btnFillHover: string
    btnStroke: string
    text: string
    textDim: string
  }
  spacing: {
    xxs: number
    xs: number
    sm: number
    md: number
    lg: number
    xl: number
    xxl: number
  }
  radius: {
    sm: number
    md: number
  }
  font: {
    h1: string
    h2: string
    body: string
    bodySm: string
    label: string
    button: string
  }
  layout: {
    headerTop: number
    headerH: number
    footerPad: number
    cardMinW: number
    cardMaxW: number
    mapThumbRatio: number
    minHitH: number
    gridGapX: number
    gridGapY: number
  }
}

export const MENU_BREAKPOINTS = {
  sm: 900,
  md: 1200,
  lg: 1440,
} as const

export const MENU_TOKENS: MenuTokens = { ... }
```

### 5.2 `src/menu.layout.ts` (new)
Purpose:
- pure layout calculators for map and race screens
- no rendering side effects
- reusable source for geometry and scroll range

Recommended exported types:

```ts
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface MapGridLayout {
  cols: number
  cardW: number
  cardH: number
  gapX: number
  gapY: number
  startX: number
  firstRowY: number
  headerTopY: number
  headerBottomY: number
  contentBottomY: number
}

export interface RaceLayout {
  cols: number
  cardW: number
  cardH: number
  gap: number
  startX: number
  cardY: number
  titleY: number
}
```

Recommended exported helpers:

```ts
export function getResponsiveMapGridLayout(
  viewW: number,
  viewH: number,
  mapCount: number,
  scrollY: number
): MapGridLayout

export function getMapScrollRange(
  viewW: number,
  viewH: number,
  mapCount: number
): { min: number; max: number }

export function clampMapScroll(
  v: number,
  range: { min: number; max: number }
): number

export function getStickyMapHeaderLayout(
  viewW: number,
  viewH: number
): {
  titleY: number
  subtitleY: number
  difficultyLabelY: number
  diffButtonsY: number
  pinnedTop: number
}

export function getResponsiveRaceLayout(
  viewW: number,
  viewH: number
): RaceLayout
```

### 5.3 `src/menu.ts` (edit, not rewrite)
Purpose in this pass:
- remain the rendering and interaction host
- consume tokens/layout helpers instead of keeping all geometry inline

Recommended local helper wrappers:

```ts
function drawMapHeaderSticky(
  layout: ReturnType<typeof getStickyMapHeaderLayout>,
  ...
): void

function drawMapCards(
  layout: MapGridLayout,
  ...
): void

function drawRaceCardsResponsive(
  layout: RaceLayout,
  ...
): void
```

These wrappers keep the actual drawing code local while moving layout math out.
That lowers regression risk.

---

## 6. File-by-file implementation notes

## 6.1 `src/menu.tokens.ts`

### Goal
Replace repeated literals with named menu tokens.

### What to move first
Start with values that repeat or clearly describe visual intent:
- color constants
- common font strings
- standard gaps
- min button height
- card width bounds
- grid gaps
- header heights/padding

### What not to over-engineer yet
Do not try to design a global app-wide token system in this pass.
This file should serve the menu only.

### Safe rollout method
1. create token file
2. import it into `menu.ts`
3. swap references without changing geometry yet
4. confirm no visible behavior change before layout work starts

---

## 6.2 `src/menu.layout.ts`

### Goal
Move geometry and scroll math into pure functions before changing layout behavior.

### First extraction step
Start by moving current map scroll helpers as-is:
- current `getMapScrollRange()` logic
- current `clampMapScroll()` logic

This preserves behavior while separating concerns.

### Second extraction step
Replace fixed map/race geometry with responsive calculators.

### Responsive map rules
Recommended first version:
- `< 860` width → 1 column
- `860-1279` width → 2 columns
- `>= 1280` width → 3 columns

Card width should be computed from available width and gap count.
Card height can remain mostly stable at first if the width becomes responsive.

### Sticky map header geometry
The header helper should define:
- title position
- subtitle position
- difficulty label and control row position
- pinned header bottom edge
- starting Y for the first map row below header

### Responsive race rules
Recommended first version:
- wide screens → 2 cards side by side
- narrow screens → 1 card per row, vertically stacked

This first version does not need to fully modularize race cards.
It only needs to stop assuming fixed side-by-side placement.

---

## 6.3 `src/menu.ts`

### Goal
Consume the new helpers without changing menu flow behavior.

### Replace token usage first
Examples:
- current color constants block → `MENU_TOKENS.colors.*`
- repeated font strings → `MENU_TOKENS.font.*`
- gaps/padding → `MENU_TOKENS.spacing.*`

### Replace map layout next
Current inline map geometry should stop owning:
- fixed `cols = 3`
- fixed `cardW`
- fixed `cardH`
- raw centering offsets
- direct scroll-range assumptions based on fixed rows

Instead:
- call `getResponsiveMapGridLayout()`
- call `getMapScrollRange()`
- clamp `mapScrollY` from returned range
- draw cards from layout output

### Sticky map header migration
Current issue:
- title, difficulty row, and map grid effectively belong to one scroll world

New behavior:
- title/subtitle/difficulty stay fixed
- only map cards use `mapScrollY`
- back button remains pinned

### Replace race layout after map is stable
Current inline race geometry should stop owning:
- fixed `cardW = 240`
- fixed `cardH = 280`
- fixed `gap = 40`
- left/right placement assumptions

Instead:
- call `getResponsiveRaceLayout()`
- route drawing through layout-driven positions

### Safety rule
Do not alter current action names, screen transitions, or startup logic in this pass.
No behavior rewiring.

---

## 6.4 `src/i18n.ts` (optional, recommended)

### Goal
Move the scroll hint out of hardcoded English text.

Current hardcoded text should become an i18n key, for example:
- `menu.scroll_more`

Prefer a more device-neutral phrase such as:
- `Scroll to view more`

This is a small cleanup, but worth doing while the screen is already being touched.

---

## 7. Concrete sequence for a safe delivery

### Step A. Token file only
Create:
- `src/menu.tokens.ts`

Edit:
- `src/menu.ts`

Actions:
1. add `MENU_TOKENS`
2. replace color/font/spacing literals with tokens
3. do not change geometry logic yet

Success criteria:
- no visible menu behavior change
- build stays green

### Step B. Layout file without changed behavior
Create:
- `src/menu.layout.ts`

Edit:
- `src/menu.ts`

Actions:
1. move map scroll helpers into `menu.layout.ts`
2. import and use them from `menu.ts`
3. preserve old math first

Success criteria:
- no layout regressions
- scrolling still behaves exactly as before this step

### Step C. Responsive map grid
Edit:
- `src/menu.layout.ts`
- `src/menu.ts`

Actions:
1. compute map column count from width
2. compute `cardW`, `startX`, `contentBottomY` from viewport
3. derive scroll range from actual content height
4. keep existing interaction behavior unchanged

Success criteria:
- narrow screens show 1 column
- medium screens show 2 columns
- wide screens show 3 columns
- no overlap, no unreachable cards

### Step D. Sticky map header
Edit:
- `src/menu.layout.ts`
- `src/menu.ts`
- optionally `src/i18n.ts`

Actions:
1. compute pinned header geometry
2. draw title/subtitle/difficulty in header space
3. scroll only the card grid
4. keep back button pinned

Success criteria:
- difficulty controls do not move when map list scrolls
- header remains visually stable
- cards scroll cleanly beneath it

### Step E. Responsive race select
Edit:
- `src/menu.layout.ts`
- `src/menu.ts`

Actions:
1. compute race layout from viewport width
2. use 2 columns when wide enough
3. switch to stacked layout when narrow
4. verify click/hit boxes still align after resize

Success criteria:
- race cards remain readable and clickable at narrower widths
- no overflow or visual collisions

### Step F. Hint text cleanup
Edit:
- `src/i18n.ts`
- `src/menu.ts`

Actions:
1. move scroll hint into translation key
2. replace desktop-specific wording with neutral wording

Success criteria:
- existing language switch still works
- hint remains understandable

---

## 8. Regression watchouts

### 8.1 Do not touch action routing in this slice
Current action names and flow wiring may be brittle.
This pass should not rename or reorganize them.

### 8.2 Scroll range must come from real layout
Once the map grid becomes responsive, old fixed-row scroll math will be wrong.
Scroll range must be based on actual row count and content height.

### 8.3 Keep draw rects and hit rects in sync
If card/button positions change responsively, click targets must be generated from the same geometry used for rendering.
Do not duplicate position math in separate places.

### 8.4 Resize behavior matters
After viewport resize:
- scroll must clamp to the new valid range
- cards must not keep stale hit regions
- hover detection must use new geometry

### 8.5 Do not accidentally affect online input flow
Global key and input handling for online join code should remain untouched in this pass.
The menu layout work must not bleed into input mode behavior.

### 8.6 Account for translation width
If strings vary by language, adaptive widths should not assume the English shortest case.
Buttons and labels need enough breathing room.

---

## 9. Validation checklist

### Core flow validation
- title → race → map → start game still works
- all available maps can be reached and selected
- all AI difficulty options still work
- language switch still works on all menu screens

### Map screen validation
- narrow width renders 1 column
- medium width renders 2 columns
- wide width renders 3 columns
- cards do not overlap
- lower cards remain reachable
- scroll does not overshoot into empty space
- sticky header does not move with card scroll
- back button remains easy to access

### Race screen validation
- cards remain readable on narrower widths
- stacked layout does not overlap title/back controls
- click hitboxes stay aligned with visuals

### Safety validation
- wheel scroll works only on map screen
- resize re-clamps layout and scroll correctly
- online host/join behavior remains unchanged
- build passes

---

## 10. Suggested commit order

### Commit 1
- add `menu.tokens.ts`
- replace literals with tokens

### Commit 2
- add `menu.layout.ts`
- move scroll/layout helpers without behavior changes

### Commit 3
- add responsive map grid

### Commit 4
- add sticky map header

### Commit 5
- add responsive race select

### Commit 6
- optional i18n hint cleanup

This commit order keeps the diff reviewable and makes rollback simpler if one layout step causes issues.

---

## 11. Next pass after this one

If this pass lands cleanly, the next reasonable menu work would be:
1. keyboard navigation foundation
2. explicit nav mode vs text-input mode separation
3. `single_setup` screen before race/map selection
4. spacing/type hierarchy polish pass

That next pass should start only after the current layout slice is stable.
