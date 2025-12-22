import { Device, LogEntry, PairingSession, ServerHealth, UnlockRequest, UnlockToken } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8787';

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`API ${response.status}: ${message}`);
  }
  return (await response.json()) as T;
}

async function safeGet<T>(path: string, fallback: T): Promise<T> {
  try {
    return await api<T>(path);
  } catch (err) {
    console.error(`Failed to fetch ${path}`, err);
    return fallback;
  }
}

export const vpnService = {
  async fetchState(): Promise<{
    devices: Device[];
    requests: UnlockRequest[];
    logs: LogEntry[];
    health: ServerHealth | null;
    pairings: PairingSession[];
    tokens: UnlockToken[];
  }> {
    const [devicesRes, requestsRes, logsRes, healthRes, pairingsRes] = await Promise.all([
      safeGet<{ devices: Device[] }>('/api/devices', { devices: [] }),
      safeGet<{ requests: UnlockRequest[] }>('/api/unlock/pending', { requests: [] }),
      safeGet<{ logs: LogEntry[] }>('/api/logs', { logs: [] }),
      safeGet<ServerHealth | null>('/api/health', null),
      safeGet<{ pairings: PairingSession[] }>('/api/pair/pending', { pairings: [] })
    ]);

    return {
      devices: devicesRes.devices,
      requests: requestsRes.requests,
      logs: logsRes.logs,
      health: healthRes,
      pairings: pairingsRes.pairings,
      tokens: []
    };
  },

  async approveRequest(requestId: string, durationHours: number) {
    const durationMinutes = durationHours * 60;
    await api(`/api/unlock/${requestId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ durationMinutes })
    });
  },

  async denyRequest(requestId: string) {
    await api(`/api/unlock/${requestId}/deny`, { method: 'POST' });
  },

  async revokeDevice(deviceId: string) {
    await api(`/api/devices/${deviceId}/revoke`, { method: 'POST' });
  },

  async startPairing(payload: { deviceId: string; deviceName: string; deviceType: string; allowedIp: string; pairingTtlMinutes?: number }) {
    return api<{
      pairingCode: string;
      expiresAt: string;
      totpSecret: string;
      otpauthUrl: string;
      pairingString: string;
    }>('/api/pair/start', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async completePairing(payload: { deviceId: string; pairingCode: string; publicKey: string }) {
    return api<{ status: string; deviceId: string; totpSecret: string }>('/api/pair/complete', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async createUnlockToken(payload: { deviceId: string; ttlSeconds?: number }) {
    return api<{ token: string; expiresAt: string }>('/api/unlock/token/create', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async redeemUnlockToken(payload: { deviceId: string; token: string; durationMinutes?: number }) {
    return api<{ status: string; expiresAt: string }>('/api/unlock/token/redeem', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async totpUnlock(payload: { deviceId: string; code: string; durationMinutes?: number }) {
    return api<{ status: string; expiresAt: string }>('/api/unlock/totp', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
};
