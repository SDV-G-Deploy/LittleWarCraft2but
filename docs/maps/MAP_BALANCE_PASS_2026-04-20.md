# Map balance pass, 2026-04-20

Purpose: correct material fairness problems in the shipped 1v1 map pool with small explicit terrain/resource edits, not system rewrites.

## Audit checklist used

- spawn fairness and starting macro pocket safety
- nearest-mine and contested-mine parity
- choke asymmetry and route symmetry
- watch-post leverage
- mine reachability
- start building clearance, especially around the 3x3 Town Hall footprint
- richer gold on the more exposed / farther central mines

## Findings and fixes by map

### Map 01, Verdant Hills
- Kept terrain layout unchanged.
- Reason: starts were already clear, nearest mines were mirrored, center mine travel was near-parity.
- Fix: center mine now has a larger reserve than the safer base-side mines.

### Map 02, River Crossing
- Problem: both contested ford mines were effectively dead content because they were pushed against the side border and could not be mined.
- Fix: moved the west/east contested mines inward from the border so both are reachable from both spawns.
- Fix: ford-adjacent contested mines now carry more gold than base-side mines.

### Map 03, Open Steppe
- Problem: both diagonal start Town Halls were partially pressed into corner forest, which reduced safe macro space and risked blocked early placement around the main.
- Fix: trimmed only the two spawn-side corner forest chunks, preserving the open-center identity.
- Fix: center mine now has a larger reserve than the safe side mines.

### Map 04, Stone Fords
- Problem: watch posts sat too deep on each home-side approach, giving too much free defensive leverage before the ford fight was really contested.
- Fix: moved both watch posts closer to the middle crossing line while keeping left-right symmetry.
- Fix: middle ford mine now has a larger reserve than side mines.
- Follow-up: side-mine risk/reward retuned so the safer top pair pays less than the slower/exposed lower pair (1500 top, 1750 bottom).

### Map 05, Timber Lanes
- Problem: decorative side brush overlapped both start locations, which materially broke starting space and made multiple mines/routes effectively unreachable.
- Fix: moved the two start-side brush blocks off the Town Hall footprints, restoring safe macro room and lane access.
- Fix: center mine now has a larger reserve than side mines.

### Map 06, Crown Pit
- Kept terrain layout unchanged.
- Reason: spawn paths, center access, and watch-post leverage were already acceptably mirrored for this map's high-contest identity.
- Fix: both center pit mines now have larger reserves than the outer corner mines.

## Resulting map-pool expectations

- no start Town Hall is pressed into impassable terrain
- every mine is reachable
- River Crossing contested mines are now live objectives instead of fake map decorations
- Timber Lanes starts now have usable macro space and functional lane access
- center / farther objectives pay more than safe home-side mines

## Recommended next verification

- quick live check on `w2.kislota.today`
- specifically validate:
  - first worker route to the nearest mine on each map
  - building placement around the starting Town Hall on Open Steppe and Timber Lanes
  - whether Stone Fords watch posts still feel useful without being free holds
