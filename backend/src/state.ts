import fs from 'fs-extra';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { ActiveSession, Device, DeviceStatus, LogEntry, PairingSession, StateSnapshot, UnlockRequest, UnlockToken } from './types.js';

const DEFAULT_STATE: StateSnapshot = {
  devices: [
    {
      id: 'dev-main-win11',
      name: 'Main_Laptop_Win11',
      type: 'WINDOWS',
      publicKey: '<FILL_ME>',
      allowedIp: '10.10.0.2/32',
      status: 'LOCKED',
      lastSeen: null,
      totpSecret: undefined,
      pairedAt: null
    },
    {
      id: 'dev-pixel8',
      name: 'Pixel_8',
      type: 'ANDROID',
      publicKey: '<FILL_ME>',
      allowedIp: '10.10.0.3/32',
      status: 'OFFLINE',
      lastSeen: null,
      totpSecret: undefined,
      pairedAt: null
    }
  ],
  requests: [],
  sessions: [],
  logs: [],
  pairings: [],
  tokens: []
};

export class StateStore {
  private state: StateSnapshot;
  private readonly statePath: string;

  constructor(statePath: string) {
    this.statePath = statePath;
    this.state = DEFAULT_STATE;
    this.loadFromDisk();
  }

  private loadFromDisk() {
    if (fs.existsSync(this.statePath)) {
      this.state = fs.readJsonSync(this.statePath) as StateSnapshot;
    } else {
      fs.ensureDirSync(path.dirname(this.statePath));
      this.persist();
    }
  }

  private persist() {
    fs.writeJsonSync(this.statePath, this.state, { spaces: 2 });
  }

  listDevices(): Device[] {
    return [...this.state.devices];
  }

  upsertDeviceFromPairing(deviceId: string, publicKey: string, totpSecret: string, allowedIp: string, name: string, type: Device['type']) {
    const existing = this.state.devices.find((d) => d.id === deviceId);
    const nowIso = new Date().toISOString();
    if (existing) {
      const updated: Device = {
        ...existing,
        name,
        type,
        publicKey,
        allowedIp,
        totpSecret,
        status: 'LOCKED',
        pairedAt: nowIso
      };
      this.state.devices = this.state.devices.map((d) => (d.id === deviceId ? updated : d));
    } else {
      const newDevice: Device = {
        id: deviceId,
        name,
        type,
        publicKey,
        allowedIp,
        status: 'LOCKED',
        lastSeen: null,
        totpSecret,
        pairedAt: nowIso
      };
      this.state.devices.push(newDevice);
    }
    this.persist();
  }

  getDevice(deviceId: string): Device | undefined {
    return this.state.devices.find((d) => d.id === deviceId);
  }

  setDeviceStatus(deviceId: string, status: DeviceStatus, lastSeen: string | null = null) {
    this.state.devices = this.state.devices.map((device) =>
      device.id === deviceId ? { ...device, status, lastSeen: lastSeen ?? device.lastSeen } : device
    );
    this.persist();
  }

  listRequests(): UnlockRequest[] {
    return [...this.state.requests];
  }

  addRequest(device: Device, requestSourceIp: string, reason: string): UnlockRequest {
    const request: UnlockRequest = {
      id: uuid(),
      deviceId: device.id,
      deviceName: device.name,
      deviceType: device.type,
      requestSourceIp,
      reason,
      timestamp: new Date().toISOString()
    };
    this.state.requests.push(request);
    this.addLog('AUTH', 'INFO', `Unlock requested by ${device.id}`, `Source ${requestSourceIp} | ${reason}`);
    this.persist();
    return request;
  }

  removeRequest(requestId: string): UnlockRequest | undefined {
    const req = this.state.requests.find((r) => r.id === requestId);
    this.state.requests = this.state.requests.filter((r) => r.id !== requestId);
    if (req) {
      this.persist();
    }
    return req;
  }

  removeRequestsForDevice(deviceId: string): UnlockRequest[] {
    const removed: UnlockRequest[] = [];
    this.state.requests = this.state.requests.filter((req) => {
      const keep = req.deviceId !== deviceId;
      if (!keep) removed.push(req);
      return keep;
    });
    if (removed.length > 0) {
      this.persist();
    }
    return removed;
  }

  listSessions(): ActiveSession[] {
    return [...this.state.sessions];
  }

  addSession(session: ActiveSession) {
    this.state.sessions.push(session);
    this.persist();
  }

  clearSessionsForDevice(deviceId: string): ActiveSession[] {
    const removed: ActiveSession[] = [];
    this.state.sessions = this.state.sessions.filter((session) => {
      const keep = session.deviceId !== deviceId;
      if (!keep) removed.push(session);
      return keep;
    });
    if (removed.length > 0) {
      this.persist();
    }
    return removed;
  }

  expireSessions(now: Date): ActiveSession[] {
    const expired: ActiveSession[] = [];
    this.state.sessions = this.state.sessions.filter((session) => {
      const isExpired = new Date(session.expiresAt).getTime() <= now.getTime();
      if (isExpired) {
        expired.push(session);
      }
      return !isExpired;
    });
    if (expired.length > 0) {
      this.persist();
    }
    return expired;
  }

  addLog(category: LogEntry['category'], level: LogEntry['level'], message: string, details?: string) {
    const entry: LogEntry = {
      id: uuid(),
      timestamp: new Date().toISOString(),
      category,
      level,
      message,
      details
    };
    this.state.logs.push(entry);
    if (this.state.logs.length > 500) {
      this.state.logs.shift();
    }
    this.persist();
  }

  getLogs(limit = 200): LogEntry[] {
    return [...this.state.logs].slice(-limit).reverse();
  }

  // Pairing sessions
  startPairing(session: PairingSession) {
    this.state.pairings = this.state.pairings.filter((p) => p.deviceId !== session.deviceId);
    this.state.pairings.push(session);
    this.addLog('AUTH', 'INFO', `Pairing started for ${session.deviceName}`, `Code ${session.pairingCode}`);
    this.persist();
  }

  consumePairing(deviceId: string, pairingCode: string): PairingSession | undefined {
    const match = this.state.pairings.find((p) => p.deviceId === deviceId && p.pairingCode === pairingCode);
    if (match) {
      this.state.pairings = this.state.pairings.filter((p) => !(p.deviceId === deviceId && p.pairingCode === pairingCode));
      this.persist();
    }
    return match;
  }

  expirePairings(now: Date): PairingSession[] {
    const expired: PairingSession[] = [];
    this.state.pairings = this.state.pairings.filter((p) => {
      const isExpired = new Date(p.expiresAt).getTime() <= now.getTime();
      if (isExpired) expired.push(p);
      return !isExpired;
    });
    if (expired.length > 0) this.persist();
    return expired;
  }

  listPairings(): PairingSession[] {
    return [...this.state.pairings];
  }

  // One-time unlock tokens
  addToken(token: UnlockToken) {
    this.state.tokens.push(token);
    this.persist();
  }

  consumeToken(deviceId: string, tokenValue: string, now: Date): UnlockToken | null {
    let found: UnlockToken | null = null;
    this.state.tokens = this.state.tokens.filter((t) => {
      const expired = new Date(t.expiresAt).getTime() <= now.getTime();
      const matches = t.deviceId === deviceId && t.token === tokenValue;
      if (matches && !expired) {
        found = t;
        return false;
      }
      return !matches;
    });
    if (found) this.persist();
    return found;
  }

  expireTokens(now: Date): UnlockToken[] {
    const expired: UnlockToken[] = [];
    this.state.tokens = this.state.tokens.filter((t) => {
      const isExpired = new Date(t.expiresAt).getTime() <= now.getTime();
      if (isExpired) expired.push(t);
      return !isExpired;
    });
    if (expired.length > 0) this.persist();
    return expired;
  }

  listTokens(): UnlockToken[] {
    return [...this.state.tokens];
  }
}
