# LW2B realtime backend, Option A

## Purpose

This document defines the recommended near-term infrastructure path for improving LW2B online reliability across Serbia, Russia, and nearby regions without rewriting the multiplayer stack.

Option A means:
- keep the static frontend separate
- keep the current Hetzner workspace as the primary development and operations base
- add one extra VPS dedicated to the realtime multiplayer backend

This is the preferred first move before any full networking rewrite.

---

## 1. Why Option A is the preferred path

Current live evidence suggests two different availability layers:

1. Static frontend reachability
   - `w2.kislota.today` can fail from some Russia networks with a black screen before menu load
   - GitHub Pages can still load and run single player from Russia

2. Realtime multiplayer reachability
   - some Serbia and at least one earlier Serbia <-> Russia path worked
   - some Russia users still fail in `DIRECT`
   - some Russia users also fail in `SERVER` with PeerJS errors

This points away from an immediate gameplay lockstep regression and toward regional access quality for the realtime stack, especially WebRTC signaling and relay paths.

A full technology rewrite is too expensive as the first response.
A cosmetic domain rename alone is too weak.
A dedicated realtime VPS is the strongest low-cost validation move.

---

## 2. Target architecture

### Keep as-is
- OpenClaw workspace and operations base remain on the current Hetzner host
- repository, docs, build work, and orchestration remain there
- frontend may stay on GitHub Pages or another static host/CDN

### Add one new VPS for realtime only
Run only these services on the new VPS:
- `peerjs` signaling server
- `coturn` TURN server
- `ice-api` that returns runtime ICE config
- `nginx` reverse proxy + TLS

Recommended naming:
- frontend: `https://sdv-g-deploy.github.io/LittleWarCraft2but/` or later a clean static site domain
- realtime backend: `https://rtc.<project-domain>`

Examples:
- `rtc.lw2b.net`
- `rtc.game3game.net`
- `net.littlewarcraft2but.com`

The important part is not the exact name.
The important part is that realtime services live behind one explicit canonical backend endpoint.

---

## 3. Operating model

The assistant does not need to move to the new VPS.

Recommended ops model:
- keep the current Hetzner box as the main working environment
- add SSH access from Hetzner to the new realtime VPS
- deploy and maintain the realtime node remotely from the main workspace host

This preserves convenience:
- docs stay local to the existing repo
- builds stay in the current environment
- one additional node is only an operational target, not a new home base

---

## 4. Technical goals of Option A

1. Decouple static availability from realtime availability
2. Reduce dependence on the current Hetzner route profile for WebRTC/TURN traffic
3. Keep the current WebRTC/PeerJS architecture intact for now
4. Make backend migration testable without a major client rewrite
5. Prepare a clean path for future fallback or multi-region backends

---

## 5. Required client-side cleanup

Current weak point:
- runtime ICE config currently relies on relative `./api/ice`

For split frontend/backend architecture, the client should move to explicit runtime endpoints.

Recommended env model:
- `VITE_PEER_HOST=rtc.example.net`
- `VITE_PEER_PORT=443`
- `VITE_PEER_PATH=/`
- `VITE_PEER_SECURE=true`
- `VITE_ICE_API_URL=https://rtc.example.net/api/ice`

Recommended behavior:
- frontend origin can be GitHub Pages or another static host
- realtime backend URL is explicit and independent from page origin
- the online stack does not depend on whether the page was loaded from `w2.kislota.today`, GitHub Pages, or a future CDN

---

## 6. Minimum service set on the new VPS

### Nginx
Responsibilities:
- TLS termination
- reverse proxy for `/peerjs`
- reverse proxy for `/api/ice`
- optional static health endpoints

### PeerJS
Responsibilities:
- signaling only
- websocket upgrade support
- stable public HTTPS/WSS path through nginx

### Coturn
Responsibilities:
- TURN relay for difficult NAT / blocked direct paths
- support both UDP and TCP
- expose relay port range cleanly

### ICE API
Responsibilities:
- return short-lived TURN credentials
- allow only the approved frontend origins
- keep credentials out of the static bundle

### Important cross-origin note
Once frontend and realtime backend are split, CORS/origin policy becomes part of the critical path.

That means:
- `/api/ice` must explicitly allow the real frontend origin
- `/peerjs` websocket/http paths must also tolerate the real frontend origin
- old same-origin assumptions from `w2.kislota.today` must not be silently carried into the new backend

This is a likely hidden failure mode because single-player can still work while `SERVER` mode fails only during cross-origin online setup.

---

## 7. Why changing only the public domain is not enough

Changing only the domain name is unlikely to be the primary fix if:
- the backend remains on the same Hetzner route / IP profile
- the TURN traffic still leaves through the same network path
- the problematic provider-specific reachability is unchanged

A new domain can still be useful for cleanliness and future portability, but it should not be mistaken for the core fix.

Priority of likely impact:
1. new backend host / provider / route
2. explicit backend architecture
3. better logging and diagnostics
4. only then branding or domain cosmetics

---

## 8. Why Option A is better than a full rewrite right now

### Compared to a full network rewrite
Option A is better first because it:
- is much cheaper
- is much faster to test
- preserves the existing multiplayer implementation
- directly tests the infrastructure hypothesis

If Option A fixes reachability for Russia-side users, a full rewrite becomes unnecessary.
If Option A fails, then the evidence for a technology-level redesign becomes much stronger.

---

## 9. What to look for in the new VPS/provider

Hard requirements:
- Linux VPS
- root or full sudo access
- stable public IPv4
- TCP and UDP allowed without hidden restrictions
- easy TLS / Let's Encrypt support
- reasonable Europe + Russia reachability
- acceptable price for a small dedicated realtime node

Strong preferences:
- crypto payment supported
- no unusual anti-VoIP / anti-UDP restrictions
- simple panel and rebuild flow
- decent reputation for network stability
- not overly exotic or risky as a provider

Practical sizing for first deployment:
- 1 to 2 vCPU
- 1 to 2 GB RAM
- 20+ GB SSD/NVMe
- good outbound connectivity matters more than raw CPU

---

## 10. Current candidate shortlist

This shortlist is for the first trial node, not a final forever commitment.

### Candidate 1, VDSina Netherlands
Why it is interesting:
- inexpensive
- crypto payment support is widely reported
- Netherlands location is operationally convenient
- specifically suggested as a practical budget option

Relevant currently visible standard plans:
- `1 vCPU / 1 GB RAM / 10 GB NVMe`, about `$2.10 / month` or `$0.07 / day`
- `1 vCPU / 2 GB RAM / 40 GB NVMe`, about `$15.00 / month` or `$0.50 / day`
- `2 vCPU / 4 GB RAM / 80 GB NVMe`, about `$20.10 / month` or `$0.67 / day`
- `4 vCPU / 8 GB RAM / 160 GB NVMe`, about `$40.20 / month` or `$1.34 / day`

Why it may fit:
- low-cost first experiment for moving PeerJS/TURN away from Hetzner
- likely sufficient for a small realtime stack
- daily billing makes the first trial cheap and low-risk

Recommended purchase choice for LW2B first trial:
- prefer `2 vCPU / 4 GB RAM / 80 GB NVMe` as the clean default
- acceptable budget-minimum fallback is `1 vCPU / 2 GB RAM / 40 GB NVMe`
- the tiny `1 GB RAM` plan is too bare for comfortable nginx + peerjs + coturn + ice-api operations and logs

Main caution:
- it is still a Netherlands route, so this is not guaranteed to solve every Russia reachability problem by itself
- should be treated as a testable candidate, not an automatic win

Current verdict:
- yes, it is a valid candidate for Option A
- good as a budget-first experiment
- not guaranteed, but worth trying

### Candidate 2, BitLaunch Amsterdam or nearby EU location
Why it is interesting:
- crypto-friendly by design
- easier privacy-oriented billing flow
- decent reputation for uptime and simple provisioning
- can be a convenient way to rent EU VPS with crypto payment

Why it may fit:
- fast test deployment
- good for a clean isolated realtime node

Main caution:
- pricing may be less attractive than pure budget VPS providers
- depends on the underlying region/provider you choose inside the platform

Current verdict:
- strong second choice if crypto convenience matters and price is acceptable

### Candidate 3, BuyVM Luxembourg
Why it is interesting:
- long-running reputation in budget VPS circles
- crypto payment support is widely reported
- Luxembourg is a viable alternate Europe location

Why it may fit:
- useful as a non-Hetzner, non-identical route profile test
- often considered solid for low-cost infrastructure

Main caution:
- stock can be limited
- Luxembourg routing may still not be ideal for every Russia-side network

Current verdict:
- good candidate if available, especially as a route-profile experiment

---

## 11. Decision guidance on VDSina

Question: does `vdsina.com` in the Netherlands fit Option A?

Answer:
- yes, it is a reasonable first candidate
- especially if low price and crypto payment matter
- but it should be treated as a measured experiment, not as certainty

Best interpretation:
- VDSina is suitable for phase 1 validation
- if Russia-side results improve, keep it
- if not, the next step is to try a different provider / route profile, not to immediately conclude that Option A failed as a concept

---

## 12. Rollout plan

### Phase 1, validate cheaply
1. Acquire one small VPS from the shortlisted provider
2. Assign one dedicated realtime domain or subdomain
3. Deploy nginx + peerjs + coturn + ice-api
4. Point the LW2B client at explicit realtime backend URLs
5. Verify cross-origin policy before live user tests:
   - `GET /api/ice` from the real frontend origin
   - `/peerjs` path and websocket upgrade from the real frontend origin
   - TLS, DNS, and route correctness for the chosen realtime domain
6. Test from:
   - Serbia
   - one or more Russia networks
7. Compare:
   - frontend load success
   - `SERVER` mode success
   - `DIRECT` mode behavior
   - exact PeerJS / ICE failure details if any remain

### Phase 2, decide based on evidence
If results improve enough:
- keep Option A as the production baseline

If results remain poor:
- try a second provider / route profile
- only after that consider deeper architecture changes

---

## 13. Exit criteria for success

Option A should be considered successful if it achieves most of the following:
- GitHub Pages frontend remains usable from Russia
- `SERVER` mode succeeds for more Russia users than before
- `DIRECT` may still fail in hard NAT cases, but `SERVER` should improve materially
- PeerJS errors become rarer and more diagnosable
- no major gameplay/network regression is introduced

---

## 14. Final recommendation

Recommended immediate path:
- proceed with Option A
- test first with a low-cost dedicated realtime VPS
- VDSina Netherlands is acceptable as a first budget trial
- do not treat domain rename alone as the solution
- do not jump into a full networking rewrite before this infrastructure test is run

## 15. Current Helsinki follow-up note

The current LW2B follow-up introduced:
- a Helsinki realtime backend endpoint at `rts.kislota.today`
- explicit `VITE_ICE_API_URL`
- removal of runtime dependence on relative `./api/ice`
- runtime ICE preference shifted away from public Google STUN toward project-controlled TURN endpoints

Current caution:
- TURN TLS hardening is still an active follow-up area
- cross-origin CORS/origin policy must be explicitly verified against the real frontend origin before drawing conclusions from user-facing live tests
