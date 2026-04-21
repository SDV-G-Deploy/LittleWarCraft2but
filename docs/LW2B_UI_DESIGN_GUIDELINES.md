# LW2B UI Design Guidelines

## Status
Draft v1, approved direction for the next UI pass.

This document defines the target UI language for LittleWarCraft2but.
It exists to stop ad-hoc HUD growth and give every future UI change a single design grammar.

The goal is not to copy Warcraft 2 literally.
The goal is to build a cozy old-school RTS interface with modern layout discipline, clear hierarchy, and strong gameplay readability.

---

## 1. Design pillars

### 1.1 Cozy Warcraft 2, not imitation
Target feeling:
- warm
- readable
- crafted
- old-school
- compact
- not futuristic
- not debug-like

The interface should feel like it belongs to the same world as the map art.
It should suggest wood, iron, brass, canvas, parchment, and field-command practicality.

### 1.2 Gameplay first
UI exists to support fast RTS decision-making.
Readability, hierarchy, and stable action placement matter more than decorative richness.

### 1.3 One fact, one place
Critical information should have one primary home.
Avoid duplicate presentation of the same gameplay fact unless there is a very strong reason.

Examples:
- gold and wood should not compete in both a top economy HUD and a second equally prominent panel
- under-attack state should not appear as both a badge and a repeated plain-text warning in the same card

### 1.4 Containers before polish
Layout rules come before cosmetic polish.
The UI must be structurally sound before heavier style passes.

### 1.5 Stable muscle memory
Command placement should remain predictable.
The player should learn regions and slots, not hunt for drifting buttons.

---

## 2. Screen anatomy

The gameplay screen should resolve into four major blocks:

1. Top unified HUD
2. Bottom-left selection/info block
3. Bottom-center command/production block
4. Bottom-right minimap/awareness block

This is the primary screen grammar for live play.

### 2.1 Top unified HUD
Purpose:
- resources
- supply
- short critical warnings only

Rules:
- must read as one coherent HUD bar, not scattered chips floating independently
- compact vertical footprint
- centered or compositionally balanced
- no technical/debug text mixed into it

### 2.2 Bottom-left selection/info block
Purpose:
- selected unit/building identity
- current health/status
- relevant details for the current selection

Rules:
- selection identity first
- core stats second
- secondary details third
- avoid dense same-weight text walls

### 2.3 Bottom-center command/production block
Purpose:
- actions
- building production
- context-sensitive commands

Rules:
- command buttons must live in a stable grid system
- production and actions should feel like one command surface, not separate loose fragments
- empty slots are acceptable if they preserve positional consistency

### 2.4 Bottom-right minimap/awareness block
Purpose:
- map awareness
- camera orientation
- later alerts / pings if needed

Rules:
- minimap must feel anchored and intentional
- it needs its own container and visual weight
- it should not look like a tiny leftover widget placed into unused space

---

## 3. Layout system, container-first

### 3.1 No ad-hoc absolute composition as the long-term model
Hardcoded pixel chains are acceptable during prototyping, but the target system is container-based.

Future UI layout should be described in terms of:
- outer frame bounds
- major regions
- internal cards
- consistent padding
- consistent gaps
- minimum and preferred widths
- alignment rules

### 3.2 Container hierarchy
Recommended hierarchy:
- Root HUD frame
  - Top HUD container
  - Bottom dock container
    - Selection container
    - Command container
    - Minimap container

Each container should own its inner spacing and alignment.

### 3.3 Width distribution
Bottom dock should not behave like three random items glued to a strip.
It should behave like a deliberate layout with role-based width priorities.

Recommended priority:
- selection block: medium width
- command block: largest flexible width
- minimap block: fixed or near-fixed width with clear presence

### 3.4 Responsive behavior
On wider screens:
- command area may expand
- spacing may breathe slightly
- minimap and selection should not become visually tiny by comparison

On narrower screens:
- noncritical details should collapse first
- command grid should preserve usable button size
- minimap should preserve legibility

---

## 4. Information hierarchy

### 4.1 Hierarchy order for selection panel
Every selected-entity panel should be readable in this order:

1. What is selected?
2. Is it healthy / damaged / busy / threatened?
3. What can I do with it?
4. What secondary details matter now?

### 4.2 Primary vs secondary text
Primary:
- selected name
- resource values
- supply values
- HP and direct status
- command labels

Secondary:
- descriptive hints
- low-priority extra stats
- helper text
- flavor labels

Secondary text must be visually weaker than primary text.

### 4.3 Badge discipline
Badges are useful but easy to overuse.

Rules:
- badges must represent genuinely high-value state
- prefer 0 to 2 visible badges at once for a single selected unit
- if too many states exist, collapse them into a priority order

Suggested priority:
1. UNDER ATTACK
2. PRODUCING / TRAINING / BUILDING
3. RETURNING WOOD / CHOPPING / IDLE

---

## 5. Top HUD rules

### 5.1 Purpose
The top HUD is for macro facts that matter at a glance:
- gold
- wood
- supply
- short warning states

### 5.2 What does not belong there
Do not place in the top HUD:
- long debug strings
- simulation internals
- map editor information
- repeated status lines already visible elsewhere

### 5.3 Resource presentation
Resource info should appear once as the primary macro display.

Preferred structure:
- icon
- label or strong visual association
- large readable value

If resource labels are visible, keep them concise and consistent.

### 5.4 Warning states
Supply pressure can appear near supply because it is directly related.
Warnings should be short, high-contrast, and rare.
If everything is always highlighted, nothing is important.

---

## 6. Selection/info panel rules

### 6.1 Internal structure
Selection panel should be broken into clearly legible subregions:
- portrait / icon area
- identity header
- health bar and core stats
- status badges or state line
- optional detail section

### 6.2 Portrait role
Portrait area is not just decoration.
It anchors identity and helps the player parse selection quickly.

### 6.3 Health as the dominant state read
HP should be the first major state read after identity.
If a selected unit/building is damaged, this must stand out more than secondary stat text.

### 6.4 Do not overexplain stable facts
If the player already knows they selected a Town Hall, the panel should not waste space re-saying obvious facts in multiple forms.

---

## 7. Command and production panel rules

### 7.1 Command grid is mandatory
Commands should live in a stable grid, not as loose buttons placed wherever space remains.

Recommended near-term grid patterns:
- 2x3 for simple contexts
- 3x3 for richer contexts

### 7.2 Slot consistency
Whenever possible, action families should keep stable slots.

Examples:
- stop / cancel in consistent positions
- economy/build actions in a predictable region
- train-unit actions grouped together
- destructive actions isolated and clearly signaled

### 7.3 Production belongs to the same command language
Production queues and train buttons should feel like part of the same command surface.
Do not let production controls look like a separate mini-UI pasted nearby.

### 7.4 Empty slots are better than drifting actions
A partially empty but stable command grid is better than a full set of actions that constantly move around.

---

## 8. Minimap rules

### 8.1 The minimap is a first-class RTS control
It should not feel optional or decorative.

### 8.2 Dedicated card
Minimap should live inside a dedicated framed card with its own padding and clear silhouette.

### 8.3 Visual weight
Make it large enough to:
- read map shape
- see ownership/activity marks
- support reliable camera navigation

### 8.4 Future awareness space
The minimap block may later host:
- pings
- alerts
- small awareness indicators

These additions must remain subordinate to the minimap itself.

---

## 9. Spacing system

Use a small token set and apply it consistently.

Suggested token categories:
- outer margin
- panel padding
- card padding
- section gap
- button gap
- micro gap for labels and bars

Rules:
- avoid nearly-touching unrelated elements
- avoid giant accidental voids between related elements
- repeated structures should use repeated spacing

Good spacing makes the interface feel intentional even before polish.

---

## 10. Typography rules

### 10.1 Typography goals
Text must feel:
- sturdy
- legible
- game-like
- compact

### 10.2 Role tiers
Use a small number of text tiers:
- tier 1: major values and selected names
- tier 2: normal labels and commands
- tier 3: secondary/supporting text

### 10.3 Avoid text noise
Do not use too many all-caps labels, too many equal-weight lines, or too many tiny debug-style strings in player-facing HUD.

---

## 11. Color and contrast system

### 11.1 Target palette feeling
The palette should feel like:
- dark wood
- aged iron
- muted brass
- parchment light
- restrained military green
- ember red only when needed

### 11.2 Semantic color use
Use color by meaning, not decoration.

Suggested semantic anchors:
- gold: warm gold
- wood: muted green-brown or wood-aware green accent
- supply ok: living green
- supply warning: amber
- danger / damage / destroy: restrained red
- neutral frame text: parchment or soft grey

### 11.3 Contrast ladder
Every HUD region should follow a readable ladder:
- world background
- panel background
- inner card surface
- text/value layer
- accent/warning layer

If all text and surfaces are similarly dark, the player has to work too hard.

---

## 12. Style unification rules

### 12.1 Match the world
The HUD must not feel imported from a different game genre.
If the map art is cozy and pixel-driven, the HUD should not read as sterile sci-fi overlay.

### 12.2 Form language
Preferred form language:
- strong rectangles
- deliberate framing
- modest ornament only where needed
- weight through panel construction, not glossy effects

### 12.3 Decorative restraint
Do not try to make the interface feel rich through noise.
Make it feel rich through material suggestion, hierarchy, and rhythm.

---

## 13. Debug overlay rules

### 13.1 Debug is a separate layer
Debug information is allowed and useful.
It must not share visual priority with player HUD.

### 13.2 Default state
Debug overlays should be hidden by default in normal play.

### 13.3 Visual distinction
When shown, debug overlays should read as tools, not as in-world UI.
They should stay compact, optional, and clearly segregated.

---

## 14. Anti-patterns

Avoid these patterns in future UI work:

- duplicate resources in multiple equally prominent places
- scattered one-off chips with no parent block
- loose command buttons floating in empty space
- tiny minimap lost in a large dark footer
- dense same-weight text blocks in the selection panel
- debug strings mixed into player HUD
- style mismatch between game world and HUD
- adding more colors to solve hierarchy problems
- adding more text to solve layout problems
- solving missing structure with decorative frames alone

---

## 15. Camera and map composition note

Do not treat unexplored black space as a UI problem by default.
Fog of war and undiscovered territory are core RTS language and are valid.

For LW2B, keep the current start-camera philosophy.
Do not redesign around removing unexplored-space presence.
Instead, ensure the HUD remains compositionally balanced even when the visible world occupies an uneven portion of the screen.

---

## 16. Near-term implementation guidance

Recommended implementation order:

1. Remove or hide debug text from default player HUD
2. Unify top HUD into one coherent macro block
3. Rebuild bottom dock as three clear containers
4. Convert commands into a stable grid system
5. Give minimap a proper anchored card
6. Re-tier selection panel information
7. Only after that, do the polish pass

---

## 17. Definition of done for the next UI pass

The next UI pass should be considered successful if:
- the player can parse resources, supply, and selection state at a glance
- command buttons feel stable and teachable
- minimap feels anchored and important
- debug information no longer pollutes the default HUD
- the bottom dock reads as one coherent system with three clear roles
- the interface feels like LW2B rather than a temporary prototype overlay

---

## 18. Guideline summary

If a new UI element does not answer all of these well, it likely does not belong yet:
- What gameplay question does it answer?
- Why is it here and not elsewhere?
- Which container owns it?
- Is it primary or secondary?
- Does it match the LW2B cozy RTS style?
- Does it preserve stable player muscle memory?
