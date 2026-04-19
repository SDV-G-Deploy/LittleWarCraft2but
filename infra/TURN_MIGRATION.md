# TURN migration notes

## What changed

- coturn switched from static long-term user credentials to shared-secret auth
- nginx `/peerjs` is now rate-limited and restricted to `https://w2.kislota.today`
- client networking now prefers runtime ICE config from `./api/ice`, then falls back to build-time `VITE_ICE_SERVERS`

## What still needs to be wired

The browser cannot generate TURN HMAC credentials safely. A server-side endpoint must return short-lived ICE config.

Recommended endpoint:
- `GET /api/ice`
- response: `{ "iceServers": [...] }`
- cache: `no-store`
- credential lifetime: 5 to 15 minutes

## TURN credential format

For coturn shared-secret mode:
- username: `<unix-expiry-timestamp>:<opaque-session-id>`
- credential: `base64(hmac-sha1(username, TURN_STATIC_AUTH_SECRET))`

## Suggested rollout

1. Set a real `TURN_STATIC_AUTH_SECRET` in `infra/.env`
2. Add a tiny serverless/edge/backend handler for `/api/ice`
3. Return `iceServers` based on `infra/ice-config.template.json`
4. Redeploy nginx + coturn
5. Verify multiplayer over restricted NAT/mobile network
