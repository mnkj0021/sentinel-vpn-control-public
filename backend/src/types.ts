export type DeviceStatus = 'OFFLINE' | 'CONNECTED' | 'LOCKED';

export type DeviceType = 'WINDOWS' | 'ANDROID' | 'LINUX' | 'MACOS' | 'UNKNOWN';

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  publicKey: string;
  allowedIp: string;
  status: DeviceStatus;
  lastSeen: string | null;
  totpSecret?: string;
  pairedAt?: string | null;
}

export interface UnlockRequest {
  id: string;
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  requestSourceIp: string;
  reason: string;
  timestamp: string;
}

export interface ActiveSession {
  deviceId: string;
  requestId: string;
  expiresAt: string;
  approvedAt: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  category: 'AUTH' | 'VPN' | 'SYSTEM';
  message: string;
  details?: string;
}

export interface StateSnapshot {
  devices: Device[];
  requests: UnlockRequest[];
  sessions: ActiveSession[];
  logs: LogEntry[];
  pairings: PairingSession[];
  tokens: UnlockToken[];
}

export interface LatencyPoint {
  timestamp: string;
  ping: number;
  jitter: number;
  packetLoss?: number;
}

export interface HealthSnapshot {
  cpuUsage: number;
  ramUsage: number;
  uptime: string;
  activeTunnels: number;
  latency: LatencyPoint[];
  packetLoss?: number;
}

export interface PairingSession {
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  allowedIp: string;
  pairingCode: string;
  expiresAt: string;
  totpSecret: string;
}

export interface UnlockToken {
  id: string;
  deviceId: string;
  token: string;
  createdAt: string;
  expiresAt: string;
}
