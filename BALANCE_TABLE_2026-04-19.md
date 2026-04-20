# LittleWarCraft2but Balance Table

Date: 2026-04-19
Purpose: working balance sheet for future tuning passes

---

## Design goals

### Human
- positional faction
- stronger line holding
- safer backline support
- better fortified / structured play
- less explosive in first contact, stronger when formation matters

### Orc
- shock / pressure faction
- stronger early contact
- better punish on exposed targets
- more brute-force local advantage
- less comfortable in prolonged structured fights into fortified lines

---

## Current stats snapshot

| Unit / Building | Race | HP | DMG | Armor | Range | Speed | Cost | Attack Speed | Role |
|---|---|---:|---:|---:|---:|---:|---:|---|---|
| Worker | Human | 30 | 3 | 0 | 1 | 4 | 55 | 1.0s | eco / build |
| Footman | Human | 72 | 8 | 4 | 1 | 4 | 85 | 1.0s | frontline core |
| Archer | Human | 34 | 8 | 0 | 6 | 4 | 95 | 1.4s | backline support |
| Knight | Human | 125 | 14 | 6 | 1 | 4 | 165 | 1.5s | elite anchor |
| Peon | Orc | 30 | 3 | 0 | 1 | 4 | 55 | 1.0s | eco / build |
| Grunt | Orc | 92 | 10 | 4 | 1 | 3 | 105 | 1.2s | shock frontline |
| Troll | Orc | 36 | 10 | 0 | 4 | 4 | 95 | 1.4s | ranged pressure |
| Ogre Fighter | Orc | 150 | 16 | 4 | 1 | 3 | 180 | 1.8s | elite bruiser |
| Town Hall | Shared | 1200 | 0 | 5 | 0 | 0 | 0 | - | main base |
| Barracks | Shared | 800 | 0 | 3 | 0 | 0 | 360 | - | production |
| Farm | Shared | 400 | 0 | 1 | 0 | 0 | 180 | - | supply |
| Farm supply | Human | - | - | - | - | - | - | +5 pop | infrastructure edge |
| Farm supply | Orc | - | - | - | - | - | - | +4 pop | baseline supply |
| Wall (Human) | Human | 260 | 0 | 5 | 0 | 0 | 50 | - | fortified hold |
| Wall (Orc) | Orc | 200 | 0 | 5 | 0 | 0 | 50 | - | rough delay tool |

---

## Current matchup read

| Matchup | Current read | Notes |
|---|---|---|
| Footman vs Grunt | Orc favored | Grunt still stronger in raw early brawl, Footman now survives longer |
| Archer vs Troll | Context dependent, still Orc-favored in raw duel | Archer has longer reach, Troll has stronger short-range pressure |
| Knight vs Ogre | Near parity | Good current state, distinct but fair |
| Human wall play | Human favored structurally | Good faction identity lever |
| Early open-field fight | Orc favored | Intended to a point, but should not become auto-best line |
| Fortified / layered fight | Human favored | Intended and now more visible |

---

## Problem map

| Piece | Current problem level | Why it matters |
|---|---|---|
| Footman | Medium | Still loses too hard to Grunt in direct early exchanges if unsupported |
| Archer | Low-Medium | Strong positional identity now, but could become too oppressive behind walls |
| Knight | Low | In a good place after armor buff |
| Grunt | Medium | Risks being too universal, good in too many situations |
| Troll | Medium | Efficient ranged pressure, can overshadow Archer if position does not matter enough |
| Ogre Fighter | Low | Strong but not obviously broken |
| Human Wall | Low | Good identity tool, but must not create pure turtling meta |
| Orc Wall | Low | Fine as weaker improvised barrier |

---

## Balance principles for future edits

1. Do not mirror Human and Orc unit lines.
2. Prefer role clarity over flat numeric equality.
3. If Orc wins first contact, Human should win more often from prepared position.
4. If Human gains more range/hold tools, avoid also giving raw DPS spikes at the same time.
5. Prefer one small lever per pass, then playtest.

---

## Suggested tuning levers

### Human levers

| Lever | Safe small change | Style effect | Risk |
|---|---|---|---|
| Footman armor | +1 | better line holding | can flatten Grunt identity if overdone |
| Footman HP | +4 to +8 | better staying power | less flavorful than armor |
| Archer range | +1 | better positional play | can become oppressive with walls |
| Archer attack speed | slightly faster | smoother support DPS | may compress ranged balance too much |
| Knight armor | +1 | stronger elite anchor | can make Ogre too weak if stacked further |
| Human wall HP | +40 to +60 | better fortified identity | can encourage passive turtling |

### Orc levers

| Lever | Safe small change | Style effect | Risk |
|---|---|---|---|
| Grunt speed | + / - 1 step breakpoint | stronger or weaker engage control | very sensitive |
| Grunt cost | +5 to +10 | keeps power but reduces spam efficiency | can feel blunt |
| Grunt armor | -1 | weakens universal efficiency | may overnerf front line |
| Troll range | keep shorter than Archer | preserves asymmetry | if increased, roles blur |
| Troll damage | -1 | reduces poke brutality | may make Orc ranged too soft |
| Ogre speed | keep slower than Knight | preserves chase asymmetry | if buffed, Human heavy identity blurs |

---

## Recommended current direction

### Keep as-is for now
- Knight
- Ogre Fighter
- Human Wall
- Orc Wall

### Active live-test change
- Human Farm supply: 4 -> 5
- Goal: reduce Human supply friction and let structured armies reach critical mass earlier without directly buffing early duel stats

### Watch closely in playtests
- Archer behind Human walls
- Grunt dominance in unsupported open-field early fights
- Troll ability to still outtrade Archer despite shorter range

### Most likely next small follow-up, only if needed
1. tiny Grunt adjustment, or
2. tiny Human infrastructure / supply expression buff

Not both in the same pass.

---

## Candidate future changes menu

| Candidate | Type | Expected effect | Recommendation |
|---|---|---|---|
| Footman HP 72 -> 76 | small stat tweak | softer early Orc snowball | maybe later |
| Grunt cost 105 -> 110 | cost tuning | reduces Orc early mass efficiency | good fallback option |
| Troll damage 10 -> 9 | stat tuning | lowers ranged pressure burst | only if Archer still feels bad |
| Archer range 6 -> 5 and faster shot | style rework | less static zoning, more active skirmish | only after playtest evidence |
| Human wall HP 260 -> 240 | structure tuning | weaker turtling | only if wall lines become oppressive |
| Opening-specific bonuses by plan | system tuning | stronger faction style through strategy, not raw stats | high-value later pass |

---

## Working verdict

Current direction is promising:
- Human is becoming the better structured-position faction
- Orc remains the better shock-pressure faction
- Opening branches now diverge more for Human playtests:
  - Eco: early committed home-defense damage edge
  - Tempo: early committed contested-mine timing damage edge
  - Pressure: unchanged forward commit identity

What still needs validation through playtest:
- whether Orc is still too strong in default early engagements
- whether Human range + wall synergy becomes too safe
- whether opening styles now diverge enough in actual matches

---

## Update rule

When balance changes land, update:
- this file
- any major conclusions in README / ROADMAP if they change faction identity materially
