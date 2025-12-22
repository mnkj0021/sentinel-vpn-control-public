# Phase 1 — Real WireGuard + Manual Unlock

This phase stands up a real WireGuard server, a minimal REST API to gate sessions, and clear client flows for Windows and Android. There are no simulations; the API manipulates real `wg` peers and expires sessions after the configured TTL.

## Architecture (Phase 1)
- **WireGuard host (UK VPS)**: Single `wg0` interface, NAT enabled, dedicated IP.
- **Sentinel backend (`backend/`)**: Fastify API that:
  - Tracks paired devices and pending unlock requests in `backend/data/state.json`.
  - On approval, calls `wg set wg0 peer ...` to add the device for a short-lived session, then reaps it on expiry.
  - Exposes health telemetry (ping/jitter/packet loss, CPU, RAM, active tunnels) without inspecting traffic.
- **Dashboard**: React app (this repo) calling the backend to approve/deny unlocks and view health/logs.

## 1) Bootstrap the WireGuard server (real)
```bash
scp scripts/wireguard-bootstrap.sh root@your-vps:/root/
ssh root@your-vps
chmod +x /root/wireguard-bootstrap.sh
SERVER_NETWORK=10.10.0.1/24 SERVER_PORT=51820 /root/wireguard-bootstrap.sh
```
- Save the printed **server public key**; you need it in your client configs.
- The interface comes up as `wg0`. Change `SERVER_WG_INTERFACE` if you prefer another name.

## 2) Run the Sentinel backend API on the VPS
```bash
ssh root@your-vps
cd /opt && git clone <this-repo> sentinel && cd sentinel/sentinel-vpn-control/backend
npm install
PORT=8787 STATE_PATH=/opt/sentinel-state.json HEALTH_TARGET=1.1.1.1 npm run dev   # or npm run start after npm run build
```
Key endpoints (all JSON):
- `GET /api/devices` — current paired devices/status.
- `GET /api/unlock/pending` — pending unlock requests.
- `POST /api/unlock/request` — body `{ "deviceId": "dev-main-win11", "reason": "connect", "requestSourceIp": "203.0.113.10" }`.
- `POST /api/unlock/:id/approve` — body `{ "durationMinutes": 60 }`, adds peer to `wg0`.
- `POST /api/unlock/:id/deny` — decline request.
- `GET /api/health` — live ping/jitter/packet-loss + host CPU/RAM and active tunnel count.
- `GET /api/logs` — audit trail (connect/approve/deny/expiry).

### Data file
`backend/data/state.json` seeds two devices; replace `<FILL_ME>` with your real WireGuard public keys and adjust `allowedIp` allocations inside your /24.

### Session expiry
Approved sessions are removed after `durationMinutes` (default 60). The reaper runs every 15s: it calls `wg set wg0 peer <pubkey> remove`, marks the device `LOCKED`, and logs the expiry.

## 3) Windows client (real flow)
1. Install the official WireGuard client for Windows.
2. Generate a keypair in the client and copy the **public key** into `backend/data/state.json` for `dev-main-win11` (restart the backend to reload state).
3. Create a new tunnel in WireGuard with this config (replace placeholders):
   ```ini
   [Interface]
   PrivateKey = <CLIENT_PRIVATE_KEY>
   Address = 10.10.0.2/32
   DNS = 1.1.1.1

   [Peer]
   PublicKey = <SERVER_PUBLIC_KEY>
   AllowedIPs = 0.0.0.0/0, ::/0
   Endpoint = <SERVER_IP>:51820
   PersistentKeepalive = 25
   ```
4. Attempting to connect before approval will fail (no peer on the server). From the device, request unlock:
   ```bash
   curl -X POST http://<SERVER_IP>:8787/api/unlock/request \
     -H "Content-Type: application/json" \
     -d '{"deviceId":"dev-main-win11","requestSourceIp":"<WAN_IP_OF_LAPTOP>","reason":"connect"}'
   ```
5. Approve in the dashboard (or via CLI): `curl -X POST http://<SERVER_IP>:8787/api/unlock/<REQUEST_ID>/approve -H "Content-Type: application/json" -d '{"durationMinutes":60}'`.
6. Flip **Activate** in WireGuard. Handshake succeeds and traffic flows. After TTL, the backend removes the peer; reconnecting requires a new approval.

## 4) Android client (overview)
- Install the official WireGuard app.
- Generate a keypair; update `backend/data/state.json` entry `dev-pixel8` with the public key and an unused `allowedIp` (e.g., `10.10.0.3/32`).
- Import a tunnel with the same structure as Windows (use your Android private key, same server pubkey/endpoint, `AllowedIPs=0.0.0.0/0`).
- Request unlock from the phone (or trigger from another device), approve in the dashboard, then toggle the tunnel on. The session will drop after TTL and must be re-approved.

## 5) Observability and safety
- `GET /api/health` returns real ping/jitter/packet-loss to `HEALTH_TARGET`, plus host CPU/RAM and active peer count (via `wg show wg0 latest-handshakes`).
- Logs exclude user traffic and URLs; only control-plane events are stored.
- Peers are only added on approval; revocation removes them from `wg0` immediately.
