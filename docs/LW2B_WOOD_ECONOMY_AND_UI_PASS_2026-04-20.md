# LW2B Wood Economy and UI Pass (2026-04-20)

## Purpose
This note records the gameplay, economy, art, and UI changes made in the late-April 2026 wood-economy follow-up pass.

It exists so live verification can check the actual shipped behavior instead of relying on chat memory.

## What changed

### 1. Worker wood retargeting
Workers gathering wood now try to continue onto a nearby valid tree when the originally targeted tree is depleted.

Current implementation shape:
- local-first retargeting
- expanding search radii: `8 -> 14 -> 22`
- path-aware choice among reachable nearby trees

Practical result:
- less manual reissuing after a tree is exhausted
- workers feel less brittle during wood gathering

Important note:
- this is still not a full global retarget across the whole map
- it is a deliberately bounded QoL behavior

### 2. Start-economy softening
Starting wood was raised from:
- `0 -> 40`

Reason:
- the new wood economy was entering too early as a hard opening brake
- first farm + first lumbermill flow felt too rigid

Expected effect:
- smoother first-minute pacing
- easier onboarding into the new wood layer
- less "stuck on first tech" feeling

### 3. Farm cost tuning
Farm costs are now:
- Human farm: `180 gold / 40 wood`
- Orc farm: `180 gold / 30 wood`

Supply was intentionally left unchanged:
- Human farm: `+5 supply`
- Orc farm: `+4 supply`

Reason:
- preserve the existing race supply balance while making wood-entry pacing less harsh

### 4. Lumber mill cost tuning
Lumber mill cost is now:
- Human lumber mill: `160 gold / 60 wood`
- Orc war mill: `160 gold / 60 wood`

Reason:
- soften the first wood-tech step without broadly cheapening the whole military branch

Expected effect:
- cleaner early access to wood upgrades / wood dropoff
- less punishing transition into build paths that require wood infrastructure

## Art / readability changes

### Human lumber mill
Human lumber mill now has a dedicated sprite instead of reusing the barracks look.

Readability intent:
- visibly wooden structure
- saw / wheel identity
- stockpiled processed wood feel
- easy silhouette separation from barracks

### Orc war mill / lumber mill
The orc wood-tech building was also reshaped to read more clearly as an orc lumber-processing building, not just a generic orc military structure.

Readability intent:
- heavier wood silhouette
- visible wheel / mechanism
- timber stock look
- spiked orc roofline / banner language

## UI changes shipped in this pass

### Economy HUD
Resources and supply were moved into a larger top HUD.

Current HUD properties:
- separate chips for gold, wood, and supply
- larger numbers
- simple embedded icons
- explicit supply-warning chip when near cap / full
- less dependence on tiny lower-corner numbers

### Selection panel readability
The lower selection UI was made friendlier through:
- larger type
- stronger contrast
- clearer selected-unit card framing
- improved portrait presentation
- nicer button styling
- production card styling
- visible status badges

Current badges include:
- `IDLE`
- `UNDER ATTACK`
- `RETURNING WOOD`
- `CHOPPING`

### Follow-up cleanup already applied
After review, the following cleanup was also included:
- top HUD layout no longer relies on one hardcoded absolute placement chain
- normal units no longer duplicate both `UNDER ATTACK` badge and plain under-attack text in the same way
- worker tree retargeting now expands beyond the smallest local radius

## What to verify in live tests

### Economy feel
- Does the first farm timing feel smoother?
- Does the first lumber mill timing feel less punishing?
- Does starting with 40 wood reduce opening friction without making wood irrelevant?
- Do Human and Orc both still have distinct but fair early pacing?

### Worker QoL
- When one tree depletes, does the worker continue onto a nearby useful tree often enough?
- Does the retarget ever look confusing or pick obviously bad nearby wood?
- Does the worker still stop too often once a local patch is exhausted?

### UI feel
- Are gold / wood / supply readable at a glance during actual play?
- Do status badges help more than they distract?
- Does the selected-unit card feel clearer than the old debug-like panel?
- Does multi-select now feel visually weaker than single-select by comparison?

### Building readability
- Can players instantly tell Human barracks vs Human lumber mill apart?
- Can players instantly read Orc war mill as wood-tech / lumber infrastructure rather than generic military tech?
- Do these buildings remain readable at normal game zoom and match pace?

## Current assessment
This pass should be treated as:
- a real improvement to pacing and usability
- not the final word on wood economy balance
- not the final word on UI polish

The most important outcome to validate now is whether the wood resource feels like a meaningful strategic layer instead of an early-game tax.
