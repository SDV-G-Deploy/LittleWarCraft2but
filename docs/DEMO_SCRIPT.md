# LW2B demo script

How to run the playable demo and a 3-minute walkthrough for showing it to someone.

## Run it

Hosted: the GitHub Pages build of `main` serves the RTS at the site root
(`index.html`). The Kingdom OS 2000 idle experiment is at `kingdom.html`,
linked from the bottom of the main menu.

Local:

```bash
npm ci
npm run dev        # http://localhost:5173 (dev server)
# or a production build:
npm run build && npm run preview   # http://localhost:4173
```

Checks:

```bash
npm test           # determinism, movement, AI, offline sim, demo-polish tests
npm run build      # tsc + vite (both pages)
```

Best on a desktop browser with mouse and keyboard. Tablets and phones in
landscape work with touch: tap to select, tap the ground, an enemy or a mine
to give an order, and drag to scroll. Phones in portrait are asked to rotate.

## 3-minute walkthrough

**0:00 Main menu.** Point out the pitch line, then click **QUICK START**.
That starts Humans against the Orc AI on Verdant Hills, at Easy (the default).
**NEW GAME** lets you pick race, map and difficulty, **SIMULATION** runs AI
against AI, and **ONLINE 1v1** is the peer-to-peer mode (not part of this
script).

**0:10 Controls card.** On the first match a "How to play" card opens and the
game is paused. Any key or click closes it, and F1, `?` or the **? Help**
button opens it again.

**0:15 Opening choice.** Pick **Eco**. If you pick nothing, Eco is chosen
after 10 seconds.

**0:20 Economy.** Follow the **Objectives** checklist in the top-left:
1. Select the worker and right-click the gold mine next to the Town Hall.
2. Select the Town Hall and press **V** two or three times.
3. Send one new worker to a tree with a right-click, because Barracks need
   wood.
4. Select a worker and press **F** to place a Farm (more supply). Then press
   **B** to place a Barracks.

Each step gets a check mark as it is done. If a mine runs dry, the
**Idle workers** chip appears. Click it, or press `.`, to select those workers.

**1:30 Army.** Select the Barracks and press **T** for frontline units and
**A** for ranged units. Right-click the ground to set a rally point. The
checklist counts up to 4 soldiers and then switches to "Destroy every enemy
building". It also says which direction the enemy base is.

**2:15 Attack.** Box-select the army, hold **A** and right-click near the
enemy base (north-east on Verdant Hills) to attack-move. Units that are
hitting buildings turn on enemy units that attack them. Press **P** at any
point to pause.

**2:45 End screen.** When the last enemy building falls, the summary shows
the match time, map, difficulty and side-by-side stats: gold, wood, units
trained, peak army, losses and buildings. **Play again** (Enter) restarts the
same setup and **Main menu** (R) goes back.

If you need a full win inside a short slot, use Easy on Verdant Hills. A group
of about 10 or more soldiers sent in one wave breaks the Easy base.

## Difficulty notes

- **Easy** (default) is tuned for a first match. It never attacks, builds no
  towers, does no Lumber Mill research and keeps at most 6 soldiers.
- **Medium / Hard** are the original AI. It upgrades armor and attack and
  builds towers, so an army without upgrades does very little damage. Build a
  Lumber Mill (**L**) and research before you push.

## Known limits

- Gold is finite: about 8,200 across the 5 mines on Verdant Hills. If neither
  side wins before the mines run dry, the match can stall. This happens most
  often in AI-vs-AI Simulation, where the AIs rarely commit to a final push.
- Online play needs the self-hosted signaling/relay infra (`infra/`). It is
  not part of the offline demo.
- `src/sim/ai-role-split.test.ts` is not part of `npm test` and already
  failed before the demo-polish changes.
