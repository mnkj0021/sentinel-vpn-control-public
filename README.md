# Sentinel Control Center (Phase 1)
Owner-only VPN control plane: manual unlock approvals, device registry, server health, and audit log for a WireGuard host in Germany. No simulations—the backend manipulates real `wg` peers and expires sessions after TTL.

## Contents
- `backend/`: Fastify API that gates WireGuard peers, health, and logs.
- `scripts/wireguard-bootstrap.sh`: Real WireGuard bootstrap for a Debian/Ubuntu VPS.
- `docs/PHASE1.md`: Architecture + server/client instructions (start here).
- `docs/PHASE2.md`: Pairing, one-time unlock tokens, and TOTP unlock flow.
- `marketing/index.html`: Standalone promo page you can host on the root domain.
- React dashboard (this folder) pointed at the backend.

## Prerequisites
- Node.js 18+ on both frontend and backend hosts.
- A Linux VPS with a public IP (Germany) for the WireGuard server.
- WireGuard tools (`wg`, `wg-quick`) installed on the VPS.

## Run the backend (real)
```bash
cd backend
npm install
PORT=8787 STATE_PATH=./data/state.json npm run dev   # or npm run build && npm start
```
Endpoints are documented in `docs/PHASE1.md`. Replace `<FILL_ME>` public keys in `backend/data/state.json` with your device keys.

## Run the dashboard
```bash
npm install
npm run dev
```
Set `VITE_API_BASE` in `.env.local` to point at your backend (default is `http://localhost:8787`).

## Next steps
- Complete device pairing and TOTP in Phase 2.
- Harden firewall rules and add multi-server selection in later phases.
