# LW2B Network Architecture

This document describes the online model that surrounds LW2B gameplay simulation, the transport paths that exist in code, the operational framing used by the project, and the practical verification surfaces for multiplayer health.

LW2B is archived, but this document remains useful as a reference for how the demo handled multiplayer architecture and transport concerns.

## Architecture model

LW2B uses a client-hosted deterministic simulation model.

That means:
- gameplay simulation runs in the clients
- there is no dedicated authoritative game server in the current design
- online infrastructure exists to support bootstrap, session establishment, transport, and difficult-network traversal

In practice, the network layer is responsible for:
- signaling/session bootstrap
- runtime ICE configuration
- TURN relay for hard NAT / relay cases
- supported transport paths used by the game runtime

Main architectural consequence:
- online reliability problems can often be addressed by changing the networking contour without rewriting gameplay simulation

## Transports present in code

LW2B supports three transport paths in code:

1. `peerjs`
   - WebRTC data-channel path
   - signaling/bootstrap support around PeerJS

2. `ws-relay`
   - websocket relay transport path

3. `mwc`
   - MultiWebCore websocket transport path

Main code locations:
- `src/net/session.ts`
- `src/net/session-core.ts`
- `src/net/netcmd.ts`
- `src/net/transports/peerjs-transport.ts`
- `src/net/transports/ws-relay-transport.ts`
- `src/net/transports/mwc-transport.ts`

Related verification surface:
- `src/net/mwc-transport.integration.test.ts`

## Operational framing used by the project

Operationally, frontend delivery and realtime backend reachability should be treated as separate concerns.

Project reality at the end of active work:
- frontend/public entrypoint and realtime contour were not treated as a single simplistic same-origin story
- realtime concerns included signaling, ICE/TURN, and transport-specific connectivity behavior
- deployment naming could evolve without changing the core simulation model

This distinction matters because:
- frontend reachability and realtime reachability can fail independently
- hostname wording alone does not explain multiplayer health
- operational topology can change faster than architecture truth

So the correct reading is:
- architecture truth = client-hosted deterministic simulation with supporting online services
- operational truth = multiplayer health depends on bootstrap, transport, and reachability surfaces
- deployment truth = naming and hosting layout can change without redefining the gameplay model

## Verification surfaces

The online path should be evaluated through concrete surfaces, not only through architecture descriptions.

Primary verification surfaces:
1. room create / room join flow
2. transport startup behavior
3. packet flow / tick sync stability
4. ICE/TURN reachability for difficult network paths
5. transport-specific behavior across `peerjs`, `ws-relay`, and `mwc`

Useful verification methods:
- local build and targeted transport tests
- manual live room-flow validation
- focused checks around sync stability and error reporting

## Risks and cautions captured by the project

- Deterministic gameplay state is more important than transport cleverness.
- A transport being available in code does not mean all deployment paths are equally validated.
- Operational hostname or topology decisions should follow real connectivity evidence, not preference alone.
- Broad network-model churn is higher risk than narrow operational fixes unless evidence proves the model insufficient.
- Documentation should not flatten placeholder hostnames, current deployment reality, and future target naming into one layer.

## Final architectural direction taken

The project's direction remained conservative:
- keep the client-hosted simulation model
- keep transport support explicit and testable
- keep frontend and realtime concerns separable where that improves operational clarity
- validate runtime behavior before over-canonicalizing hostnames or deployment shape

In short:
- do not rewrite gameplay simulation to solve transport symptoms prematurely
- do not confuse deployment naming with architecture truth
- keep the bootstrap/transport contour movable while preserving the core simulation model

## Related files

Runtime/network code:
- `src/net/`

Operational/support files:
- `infra/compose.yaml`
- `infra/nginx.conf`
- `infra/ice-server.js`
