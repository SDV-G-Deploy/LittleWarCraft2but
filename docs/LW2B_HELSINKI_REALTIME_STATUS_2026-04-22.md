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

## Remaining recommended checks after this milestone

- verify end-to-end TURN usage from a real browser client, not only OpenSSL
- test difficult-network behavior from Russia specifically
- decide whether old `5349` should remain as fallback or be retired later
- decide whether cert-copy refresh should be documented/manual or later automated on certificate renewal
- after infra stabilizes, verify repo local-vs-push sync so operational docs stay aligned with reality

## Safe recall note for future `/new`

When resuming `ПРОЕКТ LW2B`, remember:
- there is a separate active gameplay track
- and there is an active Helsinki realtime infra track
- a rollback snapshot exists at:
  - `/root/lw2b-net-snapshots/20260422T093107Z`
- if the user mentions Hetzner Helsinki, `rts.kislota.today`, floating IP, TURN, PeerJS, nginx, or Russia accessibility, this document is one of the first places to resume from
  - `443/tcp` on the chosen TURN edge
  - `3478/tcp`
  - `3478/udp`
  - `5349/tcp` if kept as fallback
- Verify whether TURN/TLS on `443` materially improves difficult-network behavior

### Priority 3
- Reassess whether production ICE should remain TURN-only / TURN-first
- Decide whether STUN fallback should be restored for broader compatibility or kept disabled intentionally

## Planned safe migration shape

Current confirmed bind shape:
- nginx listens on `0.0.0.0:443`
- coturn listens on `3478` and `5349`, also on wildcard host bindings through docker proxy
- this means coturn cannot take `443` until nginx is narrowed to the main IP only

Recommended low-risk migration order:
1. bind nginx HTTPS only to main server IP `204.168.242.157:443`
2. keep existing website/API behavior unchanged on the main IP during transition
3. verify at runtime that nginx no longer owns floating `95.216.182.141:443`
4. move coturn TLS listener to `95.216.182.141:443`
5. set coturn `external-ip` / public edge semantics to the floating IP for TLS-facing clients if that matches final design
6. only then change ICE output to prefer `turns:...:443`
7. keep `3478` and possibly `5349` as fallback until real-world tests confirm the new path

Why this order is safer:
- avoids immediate outage on the existing HTTPS/API entrypoint
- lets TURN `443` be introduced incrementally
- keeps rollback simple: restore nginx wildcard bind and revert coturn TLS port mapping if needed

## Current migration blocker discovered during implementation

A live attempt to move coturn TLS to floating `95.216.182.141:443` initially failed with:
- `failed to bind host port 95.216.182.141:443/tcp: address already in use`

That blocker is now understood:
- nginx reload left old wildcard listener sockets open
- a full `systemctl restart nginx` released floating `443`
- after restart, nginx listens only on main IP `204.168.242.157:443`

Current implementation state after retry:
- coturn container now starts with intended ICE output using `turns:rts.kislota.today:443?transport=tcp`
- main HTTPS on `204.168.242.157` still works
- nginx no longer owns floating `95.216.182.141:443`
- floating `95.216.182.141:443` is now successfully bound by docker/coturn infrastructure
- coturn TLS on floating `443` is now confirmed with a successful OpenSSL handshake and the correct `rts.kislota.today` Let's Encrypt certificate
- current working fix uses dedicated copied cert files under:
  - `/opt/lw2b-realtime/certs/fullchain.pem`
  - `/opt/lw2b-realtime/certs/privkey.pem`
- this avoids permission/symlink issues from direct certbot mounts inside the coturn container
- current live state should be treated as a valid rollback-safe milestone

## Remaining recommended checks after this milestone

- verify end-to-end TURN usage from a real browser client, not only OpenSSL
- test difficult-network behavior from Russia specifically
- decide whether old `5349` should remain as fallback or be retired later
- decide whether cert-copy refresh should be documented/manual or later automated on certificate renewal
- after infra stabilizes, verify repo local-vs-push sync so operational docs stay aligned with reality

## Safe recall note for future `/new`

When resuming `ПРОЕКТ LW2B`, remember:
- there is a separate active gameplay track
- and there is an active Helsinki realtime infra track
- a rollback snapshot exists at:
  - `/root/lw2b-net-snapshots/20260422T093107Z`
- if the user mentions Hetzner Helsinki, `rts.kislota.today`, floating IP, TURN, PeerJS, nginx, or Russia accessibility, this document is one of the first places to resume from
