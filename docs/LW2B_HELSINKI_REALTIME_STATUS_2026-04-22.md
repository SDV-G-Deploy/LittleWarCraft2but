# LW2B Helsinki realtime status (2026-04-22)

## Purpose

This note captures the currently verified state of the new **Hetzner Helsinki realtime backend** used for LW2B multiplayer accessibility work.

This document must stay safe to share inside the repo.
Do **not** put private SSH key material here.

## Verified host identity

- Host label: `lw2b-rt-hel1`
- Provider/region: Hetzner Cloud, Helsinki
- Main server IPv4: `204.168.242.157`
- Floating IPv4: `95.216.182.141`
- Verified public domain currently routed there: `rts.kislota.today`

## Verified access model

- Root SSH access to this host already exists from the assistant workspace via a pre-existing local keypair.
- The exact private key material is intentionally not repeated in repo docs.
- For future recovery, the operational fact that matters is simple: **direct SSH access to the Helsinki realtime host is already available**.

## Verified live services

At time of verification, the server was reachable and running:
- `nginx`
- `peerjs`
- `coturn`
- `ice-api`

Docker containers observed:
- `lw2b-realtime-peerjs-1`
- `lw2b-realtime-coturn-1`
- `lw2b-realtime-ice-api-1`

## Verified public routing

### HTTPS / nginx

- `http://rts.kislota.today` redirects to HTTPS
- `https://rts.kislota.today/` responds successfully
- nginx config is valid and active

### Reverse-proxied local services

- `/api/ice` -> `127.0.0.1:8081`
- `/peerjs` -> `127.0.0.1:9000`

### TURN exposure

`coturn` is exposed publicly on:
- `3478/tcp`
- `3478/udp`
- `5349/tcp`
- `443/tcp` on floating IPv4 `95.216.182.141`
- relay range `49160-49200/tcp+udp`

## Verified current ICE behavior

The currently live `ice-server.js` on the Helsinki host returns TURN credentials and TURN endpoints in this shape:
- `turns:rts.kislota.today:443?transport=tcp`
- `turn:rts.kislota.today:3478?transport=tcp`
- `turn:rts.kislota.today:3478?transport=udp`

Important observation:
- the currently live production `ice-server.js` does **not** include Google STUN entries
- an older backup file on the host still shows the earlier Google STUN setup
- this means the stack has already been partially migrated toward a stricter TURN-first configuration

## Verified current host-side limitations

### 1. Floating IPv4 is now configured on-host

Verified on 2026-04-22:
- floating IPv4 `95.216.182.141/32` is attached on `eth0`
- persistent config added via netplan file:
  - `/etc/netplan/60-floating-ip.yaml`
- after `netplan apply`, the host keeps both IPv4 addresses:
  - `204.168.242.157/32`
  - `95.216.182.141/32`
- HTTPS currently answers on both public IPv4 addresses

This means the host-side part of the floating IP setup is now complete.

### 2. True `turns:443` is now live on the floating IP

Current live shape:
- nginx serves HTTPS on main IP `204.168.242.157:443`
- coturn serves TURN/TLS on floating IP `95.216.182.141:443`
- ICE output already points clients to `turns:rts.kislota.today:443?transport=tcp`

Important implementation note:
- a clean `systemctl restart nginx` was required after config narrowing because simple reload left stale wildcard sockets open
- coturn currently uses dedicated copied cert files under `/opt/lw2b-realtime/certs/` to avoid certbot mount permission/symlink issues

## What is already operationally true

- The new Helsinki realtime host is real, reachable, and usable.
- `rts.kislota.today` is already pointed at it.
- nginx + PeerJS + TURN + ICE API are already up there.
- TURN/TLS on floating `443` is now live and presents the correct Let's Encrypt certificate.
- The stack is no longer hypothetical; it is an active LW2B infra contour and should be treated as such.

## Remaining verification / next steps

### Priority 1
- Test reachability from Russia for:
  - `443/tcp` on the floating TURN edge
  - `3478/tcp`
  - `3478/udp`
  - `5349/tcp` if kept as fallback
- Verify real browser/client TURN usage, not only OpenSSL-level TLS success

### Priority 2
- Decide whether `5349` should remain as explicit fallback
- Decide whether cert-copy refresh should later be automated on renewal
- Verify repo/docs sync after infra stabilization

### Priority 3
- Reassess whether production ICE should remain TURN-only / TURN-first
- Decide whether STUN fallback should be restored for broader compatibility or kept disabled intentionally

## Implemented migration shape

Current confirmed bind shape:
- nginx listens on main IP `204.168.242.157:443`
- coturn listens on floating IP `95.216.182.141:443`
- `3478` and `5349` still remain available as fallback listeners

Applied migration order:
1. configure floating IP on-host and persist via netplan
2. narrow nginx HTTPS to main IP
3. fully restart nginx to clear stale wildcard sockets left by reload
4. bind coturn TLS to floating `95.216.182.141:443`
5. switch ICE output to prefer `turns:...:443`
6. verify TLS handshake on floating `443`

Why this order worked:
- kept existing HTTPS/API availability on main IP
- isolated TURN/TLS onto the floating IP cleanly
- preserved rollback options through the saved snapshot

## Rollback / snapshot

Current rollback snapshot:
- `/root/lw2b-net-snapshots/20260422T093107Z`

If needed, restore from that snapshot before this migration pass.

## Gameplay/runtime debugging update after newer live tests

Newer live tests changed the interpretation of the runtime problem.

What is now established:
- the new UI and server flow complete successfully
- connection can stabilize after some time
- the match can begin
- on one laptop with two browser windows, fullscreen / background-window behavior can distort the result because only the foreground game may remain truly active
- when both windows remain effectively active and visible, online play progresses much further
- host gameplay works
- remote guest gameplay path, including building, is now considered fixed in project reality

This is important because it removes the previously narrowed guest-build bug from the active blocker list.
The runtime path is no longer best described as either a total SERVER-mode startup failure or a remaining guest-build acceptance failure.
The strongest remaining online/product issue is now:
- **accessibility and reachability from Russia-facing networks**

## Updated engineering interpretation

What now looks proven enough:
- Helsinki realtime infra is operational enough for real match start
- TURN/TLS on floating `443` is not the main blocker anymore
- at least part of the earlier "dead controls" diagnosis was polluted by browser visibility / scheduling artifacts from one-laptop testing
- the previously narrowed guest-build bug has since been fixed in live project state

What now looks most relevant:
- the broad gameplay/runtime path is healthier than earlier tests suggested
- the highest-value remaining problem is no longer an in-match command acceptance bug
- the main open risk has shifted outward to regional accessibility, signaling reachability, WebRTC/TURN path reliability, and product fallback strategy for Russia-facing users

## Best current next engineering step

Do not spend the next cycle re-debugging the already-fixed guest-build path.

The best next step is now:
1. treat Russia-facing accessibility as the primary open product problem
2. separate frontend reachability, signaling reachability, TURN/WebRTC establishment, and transport fallback as distinct layers
3. validate the new ws-relay path as a practical fallback for hard networks
4. keep collecting exact failure wording from Russia-side tests before changing infra again

Related companion notes:
- `docs/LW2B_WS_RELAY_FALLBACK_MINI_DESIGN_2026-04-22.md`
- `docs/LW2B_WS_RELAY_FALLBACK_IMPLEMENTATION_DRAFT_2026-04-22.md`

## Remaining recommended checks after this milestone

- verify end-to-end TURN usage from a real browser client, not only OpenSSL
- test difficult-network behavior from Russia specifically
- decide whether old `5349` should remain as fallback or be retired later
- decide whether cert-copy refresh should be documented/manual or later automated on certificate renewal
- after infra stabilizes, verify repo local-vs-push sync so operational docs stay aligned with reality
- continue online-access debugging with focus on Russia-facing frontend reachability, signaling/TURN/WebRTC reliability, and fallback transport validation rather than the already-fixed guest build issue

## New network accessibility hypothesis after Russia reachability signal

New outside signal from real user testing changed the working interpretation again:
- `w2.kislota.today` did not open for a tester in Russia
- the GitHub Pages build did open for the same tester
- on the GitHub Pages build, attempting online join still resulted in a PeerJS-side failure

This strongly suggests the online-access problem is not a single bug.
It is more likely a layered reachability problem with at least two independent failure surfaces:

1. **frontend reachability risk**
   - custom domain `w2.kislota.today` may be less reachable from some Russia networks than GitHub Pages
   - this can be caused by DNS interference, custom-domain filtering, HTTPS issues on the route, or simply worse regional routing behavior

2. **realtime path reachability risk**
   - even when the frontend loads, PeerJS signaling and/or WebRTC ICE traversal can still fail
   - likely causes include strict NAT, CGNAT, blocked UDP, unstable websocket reachability, or protocol-level degradation affecting STUN/TURN/WebRTC behavior

3. **Russia-specific protocol interference is now plausible enough to plan around**
   - public discussions and best-practice references indicate that in some Russia networks, WebRTC-related traffic may be unstable or partially degraded
   - this should be treated as an environmental risk factor, not as proven universal censorship and not as a reason to assume one exact blocking mechanism

## Updated strategic interpretation

For LW2B, network accessibility should now be treated as a multi-layer resilience problem:
- **Layer A:** can the user load the game frontend at all?
- **Layer B:** can the client reach the signaling endpoint reliably?
- **Layer C:** can ICE establish a usable path?
- **Layer D:** if direct path fails, can TURN relay over TCP/TLS 443 still rescue the session?
- **Layer E:** if some Russia networks degrade WebRTC patterns themselves, can the product still offer an acceptable fallback path?

This changes the practical strategy.
A second server in Helsinki helps, but server geography alone is not enough.
If the user sits behind CGNAT, symmetric NAT, blocked UDP, or protocol-aware interference, a different host region by itself may not solve the problem.

## Recommended strategy going forward

### 1. Separate frontend availability from realtime availability

Do not rely on a single custom domain as the only user entrypoint.
Recommended shape:
- keep a highly reachable static frontend path available, such as GitHub Pages
- treat the custom domain as a nice primary entrypoint, not the only survivable one
- if needed, add a second neutral fallback frontend hostname outside the main project domain family

### 2. Treat TURN relay as a core compatibility path, not a rare fallback

For difficult networks, assume direct peer-to-peer may fail.
Production ICE policy should preserve a strong relay path:
- `turn:...:3478?transport=udp`
- `turn:...:3478?transport=tcp`
- `turns:...:443?transport=tcp`

Meaning:
- prefer lower-latency paths when available
- but ensure a real relay escape hatch exists for blocked UDP, strict NAT, and degraded networks

### 3. Do not bind all critical realtime traffic to one potentially fragile hostname strategy

If `kislota.today` shows Russia reachability weakness, signaling and TURN should be reviewed from a naming/routing perspective.
Recommended direction:
- keep the Helsinki realtime stack
- consider a more neutral fallback hostname for signaling/realtime access if additional evidence continues to point at domain-level fragility
- avoid coupling frontend trust, websocket signaling, and TURN identity too tightly to one externally fragile entrypoint

### 4. Accept that some networks may remain hostile to browser P2P even after good TURN setup

The goal should be to **improve success rate materially**, not assume universal success.
If Russia reachability becomes a product-critical requirement, long-term architecture may need a less pure-P2P fallback model.
That does not need to be built now, but it should be recognized early as a possible future requirement.

## Short execution plan

### Immediate
- keep GitHub Pages as a known-good frontend fallback
- preserve and verify TURN/TLS on `443`
- verify actual browser TURN usage where possible, not only TLS handshake success
- avoid removing `3478/tcp`, `3478/udp`, or `5349/tcp` until real difficult-network evidence is stronger

### Next
- review whether production frontend should expose a fallback entrypoint separate from `w2.kislota.today`
- review whether signaling/TURN should keep current hostname strategy or gain a more neutral fallback hostname
- keep ICE output broad enough to support hard networks instead of over-optimizing too early for one preferred path

### Later, if Russia accessibility becomes priority
- consider explicit “hard-network mode” policy
- consider a more server-assisted realtime fallback if WebRTC reliability remains too low on target networks

## Practical hypothesis to test in future field runs

The most useful current working hypothesis is:
- GitHub Pages or another neutral static host can improve **frontend reachability**
- Helsinki TURN/TLS on `443` can improve **transport survivability**
- but **PeerJS/WebRTC success in Russia may still remain probabilistic** on some networks due to CGNAT, blocked UDP, signaling fragility, or protocol-level interference

So the best short-term product strategy is:
- stabilize frontend fallback
- keep strong TURN coverage
- avoid premature narrowing of ICE/network options
- gather more hard-network evidence before making aggressive simplifications

## Server-assisted fallback options without full netcode rewrite

A new strategy review was done specifically for the question:
- how to add a more server-centric fallback **without rewriting the whole LW2B networking model**

Current conclusion:
- a full authoritative dedicated server is **not** the first recommended move
- the most realistic next layer is a **transport fallback**, not a gameplay-model rewrite

### Option A, recommended first: WebSocket relay fallback for lockstep commands

Shape:
- keep the current deterministic simulation on both clients
- keep the current lockstep/tick/command model
- add a server relay path where clients send command packets to a central room server over WebSocket
- the room server rebroadcasts or fan-outs those commands to both players in the canonical tick order

What stays the same:
- game simulation remains client-side on both peers
- command schema mostly stays the same
- tick model mostly stays the same
- deterministic assumptions stay the same

What changes:
- transport abstraction must support at least two backends:
  - WebRTC / PeerJS data path
  - WebSocket relay path
- join/session logic must be able to choose or fall back to relay mode
- the relay server must manage room membership, ordering, fan-out, and disconnect handling

Why this is the best first fallback:
- much simpler than a full authoritative server
- avoids the weakest assumption that peers can always establish viable browser-to-browser transport
- can work over plain HTTPS/WSS, which is often easier to route than WebRTC on hostile networks
- keeps the current gameplay model largely intact

Primary downside:
- WebSocket is TCP-based, so head-of-line blocking and jitter sensitivity are worse than a good UDP-like WebRTC path
- but for a 1v1 deterministic RTS command stream, this tradeoff is often acceptable as a fallback mode

### Option B, second step if needed: authoritative relay for command ordering and validation

Shape:
- still do not move full simulation to the server
- but the relay server becomes the canonical sequencer for match commands
- it validates basic command legality / timing / player ownership before forwarding

What this adds beyond Option A:
- cleaner ordering guarantees
- easier cheat-resistance for obvious invalid command injection
- simpler replay / match log capture
- better place to enforce lockstep timing policy centrally

What this still avoids:
- no need for full server-side simulation
- no need to stream world state continuously
- no need to rewrite the game into classic server-authoritative action netcode

When to choose it:
- after a plain relay fallback works
- if command-ordering, desync debugging, or anti-abuse benefits become worth the extra complexity

### Option C, not recommended as first rescue: full authoritative dedicated server

Shape:
- server runs the real game simulation
- clients become presentation/input terminals

Why not first:
- this is the largest rewrite
- it changes authority, state sync, recovery, simulation hosting, and likely large parts of session lifecycle
- it solves more than the current immediate problem needs

## Recommended architectural direction now

For LW2B the best evolutionary path currently looks like:

1. keep improving the current WebRTC path
   - frontend fallback
   - strong TURN/TLS 443
   - broad ICE coverage

2. add a **transport abstraction layer** if not already present
   - same command/tick protocol
   - swappable transport backend

3. implement **WebSocket relay mode** as the first true hard-network fallback
   - selected manually, automatically, or after WebRTC failure

4. only later evaluate whether relay mode should become:
   - always-available fallback
   - Russia/hard-network preferred mode
   - or base for a more authoritative relay design

## Practical coding implication

The most promising low-pain move is **not** “rewrite multiplayer”.
It is:
- keep deterministic lockstep
- keep command packets
- keep most of match logic
- replace only the delivery path when P2P transport is unreliable

In other words:
- the likely future refactor target is the **transport layer**, not the full gameplay netcode layer

## Candidate implementation shape for LW2B

A practical minimal design would look like:

- `transport.sendCommand(cmd)`
- `transport.onCommand(cb)`
- `transport.onDisconnect(cb)`
- `transport.getMode()` -> `webrtc` | `ws-relay`

Then two implementations:
- `PeerJsTransport`
- `WsRelayTransport`

And one small room service on the server side:
- create/join room
- assign player slots
- receive command for tick N from player P
- fan out canonical packet to both peers
- emit disconnect / timeout / readiness events

This preserves maximum reuse while opening the door to a more survivable networking mode.

## Current recommendation

If future field tests keep showing Russia reachability pain, the next engineering move should be:
- **build a WebSocket relay fallback first**
- not a full authoritative dedicated server rewrite

That is currently the best balance of:
- implementation cost
- clarity
- compatibility improvement
- reuse of existing deterministic RTS logic

## Safe recall note for future `/new`

When resuming `ПРОЕКТ LW2B`, remember:
- there is a separate active gameplay track
- and there is an active Helsinki realtime infra track
- a rollback snapshot exists at:
  - `/root/lw2b-net-snapshots/20260422T093107Z`
- broad network bring-up is much healthier than the earlier failing tests implied
- current active gameplay/runtime bug is narrowed to remote guest build behavior after successful online match start
- if the user mentions Hetzner Helsinki, `rts.kislota.today`, floating IP, TURN, PeerJS, nginx, Russia accessibility, or ws-relay fallback, this document is one of the first places to resume from
