#!/usr/bin/env bash
set -euo pipefail

# This script boots a real WireGuard server on a fresh Debian/Ubuntu VPS.
# Fill in the environment variables below or export them before running.

SERVER_WG_INTERFACE="${SERVER_WG_INTERFACE:-wg0}"
SERVER_PORT="${SERVER_PORT:-51820}"
SERVER_NETWORK="${SERVER_NETWORK:-10.10.0.1/24}"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (sudo) so we can configure networking."
  exit 1
fi

echo "[+] Installing WireGuard and dependencies"
apt-get update
apt-get install -y wireguard iptables-persistent qrencode

echo "[+] Generating server keys (stored in /etc/wireguard)"
umask 077
SERVER_KEY="/etc/wireguard/${SERVER_WG_INTERFACE}.key"
SERVER_PUB="/etc/wireguard/${SERVER_WG_INTERFACE}.key.pub"
if [[ ! -f "${SERVER_KEY}" ]]; then
  wg genkey > "${SERVER_KEY}"
  wg pubkey < "${SERVER_KEY}" > "${SERVER_PUB}"
fi

WAN_IFACE=$(ip route get 1.1.1.1 | awk '{print $5; exit}')

echo "[+] Writing /etc/wireguard/${SERVER_WG_INTERFACE}.conf"
cat > "/etc/wireguard/${SERVER_WG_INTERFACE}.conf" <<EOF
[Interface]
Address = ${SERVER_NETWORK}
ListenPort = ${SERVER_PORT}
PrivateKey = $(cat ${SERVER_KEY})
SaveConfig = false

PostUp = iptables -A FORWARD -i ${SERVER_WG_INTERFACE} -j ACCEPT; iptables -A FORWARD -o ${SERVER_WG_INTERFACE} -j ACCEPT; iptables -t nat -A POSTROUTING -o ${WAN_IFACE} -j MASQUERADE
PostDown = iptables -D FORWARD -i ${SERVER_WG_INTERFACE} -j ACCEPT; iptables -D FORWARD -o ${SERVER_WG_INTERFACE} -j ACCEPT; iptables -t nat -D POSTROUTING -o ${WAN_IFACE} -j MASQUERADE
EOF

echo "[+] Enabling IP forwarding"
sysctl -w net.ipv4.ip_forward=1
echo "net.ipv4.ip_forward=1" > /etc/sysctl.d/99-wireguard-sentinel.conf

echo "[+] Starting WireGuard interface ${SERVER_WG_INTERFACE}"
systemctl enable wg-quick@${SERVER_WG_INTERFACE}
systemctl restart wg-quick@${SERVER_WG_INTERFACE}

echo "[+] Server public key:"
cat "${SERVER_PUB}"

echo "[+] Bootstrap complete. Add peers via the Sentinel API or wg set commands."
