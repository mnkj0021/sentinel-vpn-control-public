import { execa } from 'execa';
import { Device } from './types.js';

const WG_INTERFACE = process.env.WG_INTERFACE || 'wg0';

export async function ensureWireGuardAvailable() {
  await execa('wg', ['--version']);
}

export async function addPeer(device: Device) {
  await execa('wg', [
    'set',
    WG_INTERFACE,
    'peer',
    device.publicKey,
    'allowed-ips',
    device.allowedIp,
    'persistent-keepalive',
    '25'
  ]);
}

export async function removePeer(publicKey: string) {
  await execa('wg', ['set', WG_INTERFACE, 'peer', publicKey, 'remove']);
}

export async function getActivePeerCount(now: Date): Promise<number> {
  try {
    const { stdout } = await execa('wg', ['show', WG_INTERFACE, 'latest-handshakes']);
    const lines = stdout.split('\n').filter(Boolean);
    const activeWindowSeconds = 180;
    const epochNow = Math.floor(now.getTime() / 1000);

    const activePeers = lines.filter((line) => {
      const [pubKey, handshakeRaw] = line.trim().split(/\s+/);
      if (!pubKey || !handshakeRaw) return false;
      const handshake = Number(handshakeRaw);
      if (Number.isNaN(handshake) || handshake === 0) return false;
      return epochNow - handshake <= activeWindowSeconds;
    });
    return activePeers.length;
  } catch (err) {
    // If wg is not available, surface zero rather than crashing the API.
    return 0;
  }
}
