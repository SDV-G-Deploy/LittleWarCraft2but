# TURN migration notes

## Current state in repo

- coturn uses shared-secret auth (`TURN_STATIC_AUTH_SECRET`)
- `ice-api` returns short-lived TURN HMAC credentials via `GET /api/ice`
- nginx fronts `/api/ice` and `/peerjs` on the same public origin
- TURN/TLS plumbing is added:
  - coturn listens on `TURN_TLS_PORT` (default `5349`)
  - coturn reads cert/key from `./certbot/conf/live/${TURN_REALM}`
  - ICE API can emit `turns:` and prefer it first

## Important limitation

`443` is already used by nginx HTTPS in this stack.

So `turns:...:443` is **not automatic** in the default single-IP compose shape. To run TURN/TLS on 443, host-side networking must provide one of:
- a dedicated public IP for coturn:443
- or a separate TURN edge/LB that terminates or passes TCP 443 to coturn safely

Until then, TURN/TLS works on `5349` (or custom `TURN_TLS_PORT`).

## Env knobs

In `infra/.env`:

- `TURN_TLS_PORT` (default `5349`)
- `TURN_ENABLE_TLS` (`true|false`)
- `TURN_PREFER_TLS` (`true|false`)

Behavior of `/api/ice`:
- always returns STUN
- always returns `turn:...:3478?transport=tcp` and `...udp`
- includes `turns:...:${TURN_TLS_PORT}?transport=tcp` when `TURN_ENABLE_TLS=true`
- places `turns:` first when `TURN_PREFER_TLS=true`

## Minimal rollout checklist

1. Put real certs under `infra/certbot/conf/live/${TURN_REALM}/fullchain.pem` and `privkey.pem`
2. Set strong `TURN_STATIC_AUTH_SECRET`
3. `docker compose --env-file .env -f infra/compose.yaml up -d`
4. Verify:
   - `curl -fsS https://<domain>/api/ice | jq .`
   - response contains `turns:` URL (if enabled)
5. Test multiplayer from a difficult network (mobile/enterprise NAT)

## For true TURN/TLS on 443

After host-side 443 plumbing is prepared, set:
- `TURN_TLS_PORT=443`

and redeploy coturn + ICE API.
