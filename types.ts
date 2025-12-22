export enum DeviceStatus {
  Offline = 'OFFLINE',
  Connected = 'CONNECTED',
  Locked = 'LOCKED', // Connected but no valid session
}

export enum DeviceType {
  Windows = 'WINDOWS',
  Android = 'ANDROID',
  Linux = 'LINUX',
  MacOS = 'MACOS',
  Unknown = 'UNKNOWN'
}

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  publicKey: string; // WireGuard Public Key
  lastSeen: string;
  status: DeviceStatus;
  ipAllocation: string; // e.g., 10.100.0.2/32
}

export interface UnlockRequest {
  id: string;
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  timestamp: string;
  requestSourceIp: string; // The physical IP requesting access
  reason: string; // e.g., "Session Expired" or "Initial Connect"
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  category: 'AUTH' | 'VPN' | 'SYSTEM';
  message: string;
  details?: string;
}

export interface ServerHealth {
  cpuUsage: number;
  ramUsage: number;
  uptime: string;
  activeTunnels: number;
  latency: {
    timestamp: string;
    ping: number; // ms
    jitter: number; // ms
  }[];
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
  otpauthUrl?: string;
}

export interface UnlockToken {
  id?: string;
  deviceId: string;
  token: string;
  createdAt?: string;
  expiresAt: string;
}
