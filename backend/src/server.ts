import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { authenticator } from 'otplib';
import { StateStore } from './state.js';
import { HealthMonitor } from './health.js';
import { addPeer, ensureWireGuardAvailable, getActivePeerCount, removePeer } from './wireguard.js';
import { StateSnapshot, DeviceType } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 8787);
const STATE_PATH = process.env.STATE_PATH || path.join(__dirname, '../data/state.json');

const app = Fastify({ logger: true });
const API_KEY = process.env.SENTINEL_API_KEY || '';
const store = new StateStore(STATE_PATH);
const health = new HealthMonitor(process.env.HEALTH_TARGET || '1.1.1.1');

const allowedOrigins = (process.env.SENTINEL_ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
await app.register(cors, {
  origin: allowedOrigins.length ? allowedOrigins : true
});

await app.register(rateLimit, {
  max: Number(process.env.SENTINEL_RATE_MAX || 60),
  timeWindow: process.env.SENTINEL_RATE_WINDOW || '1 minute',
  allowList: (req) => {
    const ip = req.ip;
    const allowList = (process.env.SENTINEL_RATE_ALLOWLIST || '').split(',').map((s) => s.trim());
    return allowList.includes(ip);
  }
});

app.addHook('onRequest', async (req, reply) => {
  if (!API_KEY) return; // no key set, open access (not recommended)
  const headerKey = req.headers['x-sentinel-key'] || req.headers['x-api-key'];
  if (headerKey !== API_KEY) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
});

async function openSession(deviceId: string, durationMinutes: number, context: string, requestId?: string) {
  const device = store.getDevice(deviceId);
  if (!device) {
    throw new Error('Device not found');
  }
  const approvedAt = new Date();
  const expiresAt = new Date(approvedAt.getTime() + durationMinutes * 60 * 1000);
  await addPeer(device);
  store.setDeviceStatus(device.id, 'CONNECTED', approvedAt.toISOString());
  store.addSession({
    deviceId: device.id,
    requestId: requestId ?? 'manual',
    expiresAt: expiresAt.toISOString(),
    approvedAt: approvedAt.toISOString()
  });
  store.addLog('AUTH', 'SUCCESS', `Session opened for ${device.name}`, `${context} | Duration ${durationMinutes}m`);
  return expiresAt;
}

try {
  await ensureWireGuardAvailable();
  app.log.info('WireGuard binary detected');
} catch (err) {
  app.log.warn('WireGuard binary not detected on this host. API will run but peer actions will fail until wg is installed.');
}

app.get('/api/devices', async (_req, reply) => {
  reply.send({ devices: store.listDevices() });
});

// Pairing: start (dashboard initiated)
interface PairStartBody {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  allowedIp: string;
  pairingTtlMinutes?: number;
}

app.post('/api/pair/start', async (req: FastifyRequest<{ Body: PairStartBody }>, reply: FastifyReply) => {
  const { deviceId, deviceName, deviceType, allowedIp, pairingTtlMinutes = 10 } = req.body;
  if (!deviceId || !deviceName || !deviceType || !allowedIp) {
    reply.code(400).send({ error: 'deviceId, deviceName, deviceType, and allowedIp are required' });
    return;
  }
  const pairingCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit
  const expiresAt = new Date(Date.now() + pairingTtlMinutes * 60 * 1000).toISOString();
  const totpSecret = authenticator.generateSecret();
  const session = {
    deviceId,
    deviceName,
    deviceType: deviceType.toUpperCase() as DeviceType,
    allowedIp,
    pairingCode,
    expiresAt,
    totpSecret
  };
  store.startPairing(session);
  const otpauthUrl = authenticator.keyuri(deviceName, 'Sentinel', totpSecret);
  reply.send({
    pairingCode,
    expiresAt,
    totpSecret,
    otpauthUrl,
    pairingString: `sentinel://pair?deviceId=${encodeURIComponent(deviceId)}&code=${pairingCode}`
  });
});

// Pairing: complete from device (supplies public key + code)
interface PairCompleteBody {
  deviceId: string;
  pairingCode: string;
  publicKey: string;
}

app.post('/api/pair/complete', async (req: FastifyRequest<{ Body: PairCompleteBody }>, reply: FastifyReply) => {
  const { deviceId, pairingCode, publicKey } = req.body;
  if (!deviceId || !pairingCode || !publicKey) {
    reply.code(400).send({ error: 'deviceId, pairingCode, and publicKey are required' });
    return;
  }
  const pairing = store.consumePairing(deviceId, pairingCode);
  if (!pairing) {
    reply.code(404).send({ error: 'Pairing not found or already used' });
    return;
  }
  if (new Date(pairing.expiresAt).getTime() <= Date.now()) {
    reply.code(410).send({ error: 'Pairing expired' });
    return;
  }
  store.upsertDeviceFromPairing(deviceId, publicKey, pairing.totpSecret, pairing.allowedIp, pairing.deviceName, pairing.deviceType);
  store.addLog('AUTH', 'SUCCESS', `Paired ${pairing.deviceName}`, `IP ${pairing.allowedIp}`);
  reply.send({ status: 'paired', deviceId, totpSecret: pairing.totpSecret });
});

app.get('/api/pair/pending', async (_req, reply) => {
  reply.send({ pairings: store.listPairings() });
});

app.get('/api/logs', async (_req, reply) => {
  reply.send({ logs: store.getLogs() });
});

app.get('/api/unlock/pending', async (_req, reply) => {
  reply.send({ requests: store.listRequests() });
});

interface UnlockRequestBody {
  deviceId: string;
  reason?: string;
  requestSourceIp?: string;
}

app.post('/api/unlock/request', async (req: FastifyRequest<{ Body: UnlockRequestBody }>, reply: FastifyReply) => {
  const { deviceId, reason = 'Manual unlock', requestSourceIp = req.ip } = req.body;
  const device = store.getDevice(deviceId);
  if (!device) {
    reply.code(404).send({ error: 'Unknown device' });
    return;
  }

  const request = store.addRequest(device, requestSourceIp, reason);
  reply.send({ request });
});

interface ApproveBody {
  durationMinutes?: number;
}

app.post(
  '/api/unlock/:id/approve',
  async (req: FastifyRequest<{ Params: { id: string }; Body: ApproveBody }>, reply: FastifyReply) => {
    const request = store.removeRequest(req.params.id);
    if (!request) {
      reply.code(404).send({ error: 'Request not found' });
      return;
    }

    const durationMinutes = Number(req.body?.durationMinutes || 60);
    try {
      const expiresAt = await openSession(request.deviceId, durationMinutes, 'Manual approval', request.id);
      reply.send({ expiresAt, deviceId: request.deviceId });
    } catch (err) {
      store.addLog('AUTH', 'ERROR', `Failed to add peer for ${request.deviceId}`, String(err));
      reply.code(500).send({ error: 'Failed to add WireGuard peer', details: String(err) });
    }
  }
);

app.post('/api/unlock/:id/deny', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  const request = store.removeRequest(req.params.id);
  if (!request) {
    reply.code(404).send({ error: 'Request not found' });
    return;
  }
  store.addLog('AUTH', 'WARN', `Denied unlock for ${request.deviceId}`);
  reply.send({ status: 'denied' });
});

// One-time unlock token creation (owner)
interface TokenCreateBody {
  deviceId: string;
  ttlSeconds?: number;
}
app.post('/api/unlock/token/create', async (req: FastifyRequest<{ Body: TokenCreateBody }>, reply: FastifyReply) => {
  const { deviceId, ttlSeconds = 60 } = req.body;
  const device = store.getDevice(deviceId);
  if (!device) {
    reply.code(404).send({ error: 'Device not found' });
    return;
  }
  const token = crypto.randomBytes(4).toString('hex');
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  store.addToken({
    id: crypto.randomUUID(),
    deviceId,
    token,
    createdAt: new Date().toISOString(),
    expiresAt
  });
  store.addLog('AUTH', 'INFO', `One-time token issued for ${device.name}`, `TTL ${ttlSeconds}s`);
  reply.send({ token, expiresAt });
});

// Redeem one-time token (client/device)
interface TokenRedeemBody {
  deviceId: string;
  token: string;
  durationMinutes?: number;
}
app.post('/api/unlock/token/redeem', async (req: FastifyRequest<{ Body: TokenRedeemBody }>, reply: FastifyReply) => {
  const { deviceId, token, durationMinutes = 60 } = req.body;
  const now = new Date();
  const matched = store.consumeToken(deviceId, token, now);
  if (!matched) {
    reply.code(400).send({ error: 'Invalid or expired token' });
    return;
  }
  try {
    const expiresAt = await openSession(deviceId, durationMinutes, 'Token redeem', matched.id);
    reply.send({ status: 'unlocked', expiresAt });
  } catch (err) {
    reply.code(500).send({ error: 'Failed to open session', details: String(err) });
  }
});

// TOTP fallback unlock
interface TotpBody {
  deviceId: string;
  code: string;
  durationMinutes?: number;
}
app.post('/api/unlock/totp', async (req: FastifyRequest<{ Body: TotpBody }>, reply: FastifyReply) => {
  const { deviceId, code, durationMinutes = 60 } = req.body;
  const device = store.getDevice(deviceId);
  if (!device || !device.totpSecret) {
    reply.code(404).send({ error: 'Device not found or TOTP not configured' });
    return;
  }
  const isValid = authenticator.check(code, device.totpSecret);
  if (!isValid) {
    store.addLog('AUTH', 'WARN', `Invalid TOTP for ${device.name}`);
    reply.code(401).send({ error: 'Invalid TOTP code' });
    return;
  }
  try {
    const expiresAt = await openSession(deviceId, durationMinutes, 'TOTP unlock', 'totp');
    reply.send({ status: 'unlocked', expiresAt });
  } catch (err) {
    reply.code(500).send({ error: 'Failed to open session', details: String(err) });
  }
});

app.post('/api/devices/:id/status', async (req: FastifyRequest<{ Params: { id: string }; Body: { status: 'OFFLINE' | 'LOCKED' } }>, reply: FastifyReply) => {
  const device = store.getDevice(req.params.id);
  if (!device) {
    reply.code(404).send({ error: 'Device not found' });
    return;
  }
  const status = req.body?.status;
  if (status !== 'OFFLINE' && status !== 'LOCKED') {
    reply.code(400).send({ error: 'Invalid status update' });
    return;
  }
  store.setDeviceStatus(device.id, status, new Date().toISOString());
  store.addLog('VPN', 'INFO', `Updated ${device.name} status to ${status}`);
  reply.send({ status });
});

app.post('/api/devices/:id/revoke', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  const device = store.getDevice(req.params.id);
  if (!device) {
    reply.code(404).send({ error: 'Device not found' });
    return;
  }
  const removedSessions = store.clearSessionsForDevice(device.id);
  const removedRequests = store.removeRequestsForDevice(device.id);
  try {
    await removePeer(device.publicKey);
  } catch (err) {
    app.log.warn(`Peer removal failed for ${device.name}: ${String(err)}`);
  }
  store.setDeviceStatus(device.id, 'OFFLINE', new Date().toISOString());
  store.addLog(
    'VPN',
    'WARN',
    `Revoked device ${device.name}`,
    `Sessions removed: ${removedSessions.length}, pending requests cleared: ${removedRequests.length}`
  );
  reply.send({ status: 'revoked' });
});

app.get('/api/health', async (_req, reply) => {
  const activeTunnels = await getActivePeerCount(new Date());
  reply.send(health.snapshot(activeTunnels));
});

// Session + token + pairing reaper
setInterval(async () => {
  const now = new Date();
  const expiredPairings = store.expirePairings(now);
  expiredPairings.forEach((p) => store.addLog('AUTH', 'WARN', `Pairing expired for ${p.deviceName}`, `Code ${p.pairingCode}`));

  const expiredTokens = store.expireTokens(now);
  expiredTokens.forEach((t) => store.addLog('AUTH', 'WARN', `Token expired for ${t.deviceId}`, `Token ${t.token}`));

  const expired = store.expireSessions(new Date());
  for (const session of expired) {
    const device = store.getDevice(session.deviceId);
    if (!device) continue;
    try {
      await removePeer(device.publicKey);
      store.setDeviceStatus(device.id, 'LOCKED', new Date().toISOString());
      store.addLog('AUTH', 'WARN', `Session expired for ${device.name}`, `Request ${session.requestId}`);
    } catch (err) {
      store.addLog('SYSTEM', 'ERROR', `Failed to remove peer for ${device.name}`, String(err));
    }
  }
}, 15000);

app.get('/api/state', async (_req, reply) => {
  const snapshot: StateSnapshot = {
    devices: store.listDevices(),
    requests: store.listRequests(),
    sessions: store.listSessions(),
    logs: store.getLogs(),
    pairings: store.listPairings(),
    tokens: store.listTokens()
  };
  reply.send(snapshot);
});

app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Sentinel backend listening on ${address}`);
});
