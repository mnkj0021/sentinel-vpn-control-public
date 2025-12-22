# Phase 2 — Pairing, One-Time Tokens, and TOTP Unlock

This phase adds real device pairing, code-based unlock tokens, and a TOTP fallback while keeping WireGuard as the only data plane. No traffic inspection or fake features.

## What changed
- **Pairing flow:** Dashboard issues a 6-digit pairing code and a TOTP secret; device completes pairing by submitting its WireGuard public key with the code. Devices are stored with `totpSecret` for later unlocks.
- **One-time unlock tokens (30–60s):** Owner can issue a short-lived token to unlock a device without a pending request.
- **TOTP unlock fallback:** Device/owner can unlock with a TOTP code tied to the device secret.
- **State:** `backend/data/state.json` now holds pairing sessions, tokens, and TOTP secrets per device.

## API endpoints (Phase 2)
- `POST /api/pair/start` — body `{ deviceId, deviceName, deviceType, allowedIp, pairingTtlMinutes? }` → returns `{ pairingCode, expiresAt, totpSecret, otpauthUrl, pairingString }`.
- `POST /api/pair/complete` — body `{ deviceId, pairingCode, publicKey }` → stores device, sets status LOCKED, persists TOTP secret.
- `GET /api/pair/pending` — list active pairing sessions.
- `POST /api/unlock/token/create` — body `{ deviceId, ttlSeconds? }` → returns `{ token, expiresAt }` (default 60s).
- `POST /api/unlock/token/redeem` — body `{ deviceId, token, durationMinutes? }` → unlocks and starts a session if token valid.
- `POST /api/unlock/totp` — body `{ deviceId, code, durationMinutes? }` → unlock via TOTP.
- Existing manual approval endpoints remain: `/api/unlock/request`, `/api/unlock/:id/approve`, `/api/unlock/:id/deny`, `/api/devices/:id/revoke`.

## Pairing flow (owner + device)
1) Owner (dashboard/CLI) starts pairing:
   ```bash
   curl -X POST http://<SERVER_IP>:8787/api/pair/start \
     -H "Content-Type: application/json" \
     -d '{"deviceId":"dev-main-win11","deviceName":"Main_Laptop_Win11","deviceType":"WINDOWS","allowedIp":"10.10.0.2/32"}'
   ```
   Response includes `pairingCode`, `totpSecret`, and `otpauthUrl` to scan in an authenticator app.
2) On the device, generate a WireGuard keypair. Complete pairing:
   ```bash
   curl -X POST http://<SERVER_IP>:8787/api/pair/complete \
     -H "Content-Type: application/json" \
     -d '{"deviceId":"dev-main-win11","pairingCode":"123456","publicKey":"<CLIENT_PUBLIC_KEY>"}'
   ```
3) WireGuard client config stays the same as Phase 1, but the device is now registered with TOTP.

## Unlock methods
- **Manual approval (Phase 1):** `/api/unlock/request` → approve via dashboard or `/api/unlock/:id/approve`.
- **One-time code (Phase 2):**
  1. Owner issues: `curl -X POST .../api/unlock/token/create -d '{"deviceId":"dev-main-win11","ttlSeconds":60}'`
  2. Device redeems: `curl -X POST .../api/unlock/token/redeem -d '{"deviceId":"dev-main-win11","token":"<token>","durationMinutes":60}'`
- **TOTP fallback:**
  ```bash
  curl -X POST http://<SERVER_IP>:8787/api/unlock/totp \
    -H "Content-Type: application/json" \
    -d '{"deviceId":"dev-main-win11","code":"123456","durationMinutes":60}'
  ```

## Operational notes
- Tokens and pairing sessions expire automatically; session reaper also removes expired WireGuard peers.
- `totpSecret` lives server-side; do not expose it publicly.
- Keep `allowedIp` unique per device inside your WireGuard /24.
- WireGuard must be installed on the VPS for unlock actions to apply; the API will log a warning otherwise.
