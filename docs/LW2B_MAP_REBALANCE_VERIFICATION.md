# LW2B Map Rebalance Verification

## Purpose
This note bridges the completed map rebalance / map-variety pass into live testing.

It is not a new design plan. It is a practical verification sheet for checking whether the recent map changes produced the intended gameplay effects without introducing new hard biases or scripted play.

## Context
Recent map work established or reinforced three approved gameplay-variety directions:
1. Narrow routes plus longer flank routes
2. Contested external mines with different risk profiles
3. Neutral watch points for local vision leverage

These are already reflected in the current map pool.
Destructible blockers remain a separate later engine pass.

Recent related commits:
- `e14d6ef` , Map variety pass v1
- `acda439` , tighten route symmetry and neutral-center leverage
- `28577cc` , trim map05 watchpost asymmetry and map06 center-mine bias
- `cc2b5ce` , retune map04 side-mine risk rewards

## What to verify in live tests
For every map, check the following:
- Does the map create at least two real movement choices, not one fake route and one dead route?
- Do contested / risky mines create meaningful greed-vs-safety decisions?
- Are watch posts locally useful without becoming passive snowball tools?
- Does either spawn gain a noticeably easier first-contact, safer expansion, or cleaner center access?
- Does any map collapse into one obvious script after a few games?
- Do multiple strong features stack too cleanly for the same side, for example center control plus safest expansion plus best route leverage?

## Global validation checklist
Use this after each live session:

### 1. Spawn fairness
- First movement to key routes feels comparable from both spawns
- No spawn gets a cleaner uncontested opening lane by default
- No spawn gets systematically easier defender posture around the first expansion

### 2. Mine fairness
- Nearest safe mine is not dramatically easier for one side
- Contested mine is truly contestable, not secretly belonging to one spawn
- Riskier mine has enough reward to justify greed, but not so much that it becomes auto-pick

### 3. Route quality
- Main route is readable
- Flank route is slower or riskier, but still genuinely usable
- Chokes do not hard-lock the game too early
- Route geometry still allows counterplay after initial contact

### 4. Watch-post leverage
- Watch post creates local information fights
- It does not give free deep defensive value near a home side
- Holding it should help, but not decide the game by itself

### 5. Macro safety
- There is enough room for base growth and worker movement
- Expanding does not feel either trivial everywhere or suicidal everywhere
- Defensive play remains possible without turning into permanent turtling

### 6. Script risk
- No single mine order or route order should clearly dominate every game
- No map should reduce to one obviously correct center timing
- If a feature is strong, it should still be contestable and punishable
- Avoid maps where watch posts, rich center, and route geometry combine into one repeated authored script

### 7. Combined-system stacking risk
- Rich center, watch-post leverage, route blockers, and mine safety should be judged together, not one at a time
- A map is risky if winning one early objective also grants the cleanest follow-up on every other objective
- Strong map identity is good; stacked positional inevitability is not

## Map-by-map verification

## map01 , Verdant Hills
### Intent
- Create a clearer difference between a tighter direct path and a wider flank around the central forest spine
- Keep the map readable while making center traversal less tactically flat

### What changed
- Small route asymmetry around the central forest spine was introduced through local terrain edits
- Center remains important, but not as a single flat collision line

### Expected gameplay effect
- Early contact should offer a choice between a tighter line and a wider wrap
- Units should have more positional decisions before the fight fully commits

### Live-test risks to check
- One route becoming obviously fake or too slow to matter
- Center choke becoming too dominant despite intended flank option
- One spawn reaching the more practical approach first

## map02 , River Crossing
### Intent
- Strengthen ford identity and add longer flank shelves
- Make mine choices around the river less uniform by introducing safer and riskier profiles

### What changed
- Contested side mines near the fords were placed inward for reachable shared access
- Flank grass shelves were added to create longer wrap paths behind ford pressure
- Mine reserves differentiate safer and riskier options

### Expected gameplay effect
- Ford fights remain central, but players should have more than one sensible crossing pattern
- Rich contested side mines should invite greed and counter-pressure instead of pure passive macro

### Live-test risks to check
- One ford still becoming the only real crossing in practice
- Flank shelves being too weak to matter
- Rich contested side mines paying off too reliably and collapsing the map into greed races

## map03 , Open Steppe
### Intent
- Preserve an open-feeling map while adding enough structure for scouting and local control to matter
- Use watch posts and mine-risk shaping to avoid pure flat-center brawling

### What changed
- Light center clutter was added
- Gentle route structure was introduced in the center
- Watch posts now create local contest points
- Center mine remains high-value and highly contestable
- Side mine reserve profiles distinguish safer from riskier expansion value

### Expected gameplay effect
- Map should still feel open, but decisions about pathing and information should matter more
- Center control should be desirable without becoming fully mandatory every game

### Live-test risks to check
- Watch posts becoming too centralizing on an otherwise open map
- Center mine becoming so efficient that side play becomes bait
- Route structure accidentally making the map feel cramped instead of open

## map04 , Stone Fords
### Intent
- Keep the river-ford identity, but reduce hard-lock choke abuse
- Make side-mine choices more meaningful through unequal safety with adjusted rewards
- Place watch posts around the true contested midline instead of biased leverage spots

### What changed
- Middle crossing was widened to reduce binary choke abuse
- Midline watch posts sit around the central contested area
- Side mines have differentiated reserve values so slower / more exposed options pay more
- Map description and reward structure now explicitly support timing around uneven mine safety

### Expected gameplay effect
- Mid control should still matter, but less as a hard gate and more as a repeated timing fight
- Lower-safety mine routes should create legitimate strategic alternatives instead of being trap choices

### Live-test risks to check
- Central ford still being too mandatory
- Safer top-side mines still dominating despite reserve retune
- Watch posts creating too much snowball once one player establishes river control

## map05 , Timber Lanes
### Intent
- Lean into corridor play, but prevent one lane geometry from owning the whole map
- Improve route-choice variety across staggered lane openings
- Reduce residual watch-post asymmetry and sharpen center control without a strong spawn bias

### What changed
- Staggered lane openings were widened in a rotation-mirrored way to improve route choice
- Watch-post placement was adjusted in later passes to reduce asymmetry
- Side mine reserve profiles distinguish slightly safer and riskier mining routes
- Center remains a high-value focal point

### Expected gameplay effect
- Matches should include more meaningful corridor pivots instead of one scripted lane collision
- Watch-post control should support lane reads, not decide them alone

### Live-test risks to check
- A single corridor becoming the default best line every game
- Remaining watch-post leverage still favoring one spawn in practice
- Bottom-right or equivalent mine route pressure still feeling cleaner for one side

## map06 , Crown Pit
### Intent
- Make center-ring control valuable, but not purely spawn-biased
- Use watch posts, gate entries, and multiple rich objectives to create layered center decisions
- Trim residual bias on rich center access without flattening the whole map

### What changed
- Ring entries were slightly widened for less binary hold/lock gameplay
- Watch-post placement was moved toward more neutral leverage
- One rich center mine position was retuned in later balance passes to reduce access bias
- Outer mine reserves support different risk profiles around the center-race structure

### Expected gameplay effect
- Center should feel like a strong objective cluster rather than a single all-or-nothing point
- Players should make timing decisions around gate entry, watch control, and rich-mine access

### Live-test risks to check
- Rich center still being noticeably closer or easier for one spawn
- Ring entries still producing hard-lock defense patterns
- Watch posts over-amplifying the side that already has center occupancy

## Suggested live-test feedback format
For fast iteration, capture notes in this compact form:

- Map:
- Winner race / spawn:
- Opening shape:
- Which route was actually used:
- Which mine choices mattered:
- Did watch posts matter, yes/no:
- Did any route or expansion feel obviously best:
- Did anything feel unfair or scripted:
- What should be changed next:

## Current interpretation rule
Do not overreact to one match.
A map change should be reconsidered when it repeatedly produces the same dominant route, the same dominant expansion, the same leverage bias, or the same objective-stacking snowball across multiple live games.
