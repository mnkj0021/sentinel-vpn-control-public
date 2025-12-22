import React, { useCallback, useEffect, useState } from 'react';
import { 
  Shield, 
  Activity, 
  Users, 
  Settings, 
  Lock, 
  Unlock, 
  Power,
  Server,
  Wifi,
  Radio
} from 'lucide-react';
import { vpnService } from './services/vpnService';
import { Device, DeviceStatus, LogEntry, PairingSession, ServerHealth, UnlockRequest, DeviceType } from './types';
import UnlockRequestCard from './components/UnlockRequestCard';
import ServerHealthChart from './components/ServerHealthChart';
import LogViewer from './components/LogViewer';

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'devices' | 'settings'>('dashboard');
  
  // App State
  const [devices, setDevices] = useState<Device[]>([]);
  const [requests, setRequests] = useState<UnlockRequest[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [health, setHealth] = useState<ServerHealth | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [pairings, setPairings] = useState<PairingSession[]>([]);
  const [pairingResult, setPairingResult] = useState<string | null>(null);
  const [tokenResult, setTokenResult] = useState<string | null>(null);
  const [totpResult, setTotpResult] = useState<string | null>(null);
  const [quickUnlockResult, setQuickUnlockResult] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(false);

  // Sync with backend API
  const refreshData = useCallback(async () => {
    try {
      const data = await vpnService.fetchState();
      setDevices(data.devices);
      setRequests(data.requests);
      setLogs(data.logs);
      const normalizedHealth = data.health
        ? {
            ...data.health,
            latency: data.health.latency.map((point) => ({
              ...point,
              timestamp: new Date(point.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            }))
          }
        : null;
      setHealth(normalizedHealth);
      setPairings(data.pairings || []);
      setApiError(null);
    } catch (err) {
      console.error('Failed to refresh control plane', err);
      setApiError('Control plane unreachable');
    }
  }, []);

  useEffect(() => {
    refreshData();
    const interval = setInterval(() => {
      refreshData();
    }, 3000); // 3s refresh to stay live without flooding the API
    return () => clearInterval(interval);
  }, [refreshData]);

  // Handlers
  const handleApprove = async (id: string, durationHours: number) => {
    try {
      await vpnService.approveRequest(id, durationHours);
      refreshData();
      setTokenResult(null);
      setTotpResult(null);
    } catch (err) {
      console.error(err);
      setApiError('Failed to approve request');
    }
  };

  const handleDeny = async (id: string) => {
    try {
      await vpnService.denyRequest(id);
      refreshData();
    } catch (err) {
      console.error(err);
      setApiError('Failed to deny request');
    }
  };

  const handleRevoke = async (id: string) => {
    if (confirm('Are you sure you want to revoke this device? It will be disconnected immediately.')) {
      try {
        await vpnService.revokeDevice(id);
        refreshData();
        setTokenResult(null);
        setTotpResult(null);
      } catch (err) {
        console.error(err);
        setApiError('Failed to revoke device');
      }
    }
  };

  // Pairing + unlock flows
  const [pairForm, setPairForm] = useState({
    deviceId: '',
    deviceName: '',
    deviceType: DeviceType.Unknown,
    allowedIp: '10.10.0.X/32',
    pairingTtlMinutes: 10
  });
  const [pairCompleteForm, setPairCompleteForm] = useState({
    deviceId: '',
    pairingCode: '',
    publicKey: ''
  });
  const [tokenForm, setTokenForm] = useState({ deviceId: '', ttlSeconds: 60 });
  const [redeemForm, setRedeemForm] = useState({ deviceId: '', token: '', durationMinutes: 60 });
  const [totpForm, setTotpForm] = useState({ deviceId: '', code: '', durationMinutes: 60 });
  const [quickDeviceId, setQuickDeviceId] = useState<string>('');

  const startPairing = async () => {
    try {
      const res = await vpnService.startPairing({
        deviceId: pairForm.deviceId,
        deviceName: pairForm.deviceName,
        deviceType: pairForm.deviceType,
        allowedIp: pairForm.allowedIp,
        pairingTtlMinutes: pairForm.pairingTtlMinutes
      });
      setPairingResult(`Code: ${res.pairingCode} | Expires: ${new Date(res.expiresAt).toLocaleTimeString()} | TOTP: ${res.totpSecret}`);
      setApiError(null);
      refreshData();
    } catch (err) {
      console.error(err);
      setApiError('Failed to start pairing');
    }
  };

  const completePairing = async () => {
    try {
      await vpnService.completePairing(pairCompleteForm);
      setPairingResult('Pairing completed and device locked (ready for unlock).');
      refreshData();
    } catch (err) {
      console.error(err);
      setApiError('Failed to complete pairing');
    }
  };

  const issueToken = async () => {
    try {
      const res = await vpnService.createUnlockToken(tokenForm);
      setTokenResult(`Token: ${res.token} (expires ${new Date(res.expiresAt).toLocaleTimeString()})`);
      setApiError(null);
    } catch (err) {
      console.error(err);
      setApiError('Failed to create unlock token');
    }
  };

  const redeemToken = async () => {
    try {
      const res = await vpnService.redeemUnlockToken(redeemForm);
      setTokenResult(`Unlocked until ${new Date(res.expiresAt).toLocaleTimeString()}`);
      refreshData();
    } catch (err) {
      console.error(err);
      setApiError('Failed to redeem token');
    }
  };

  const totpUnlock = async () => {
    try {
      const res = await vpnService.totpUnlock(totpForm);
      setTotpResult(`Unlocked until ${new Date(res.expiresAt).toLocaleTimeString()}`);
      refreshData();
    } catch (err) {
      console.error(err);
      setApiError('Failed to unlock via TOTP');
    }
  };

  const quickUnlock = async () => {
    if (!quickDeviceId) {
      setApiError('Select a device to unlock');
      return;
    }
    try {
      // Issue short token (60s) then redeem for 60 minutes
      const tokenRes = await vpnService.createUnlockToken({ deviceId: quickDeviceId, ttlSeconds: 60 });
      const redeemRes = await vpnService.redeemUnlockToken({ deviceId: quickDeviceId, token: tokenRes.token, durationMinutes: 60 });
      setQuickUnlockResult(`Unlocked until ${new Date(redeemRes.expiresAt).toLocaleTimeString()}`);
      setApiError(null);
      refreshData();
    } catch (err) {
      console.error(err);
      setApiError('Quick unlock failed');
    }
  };

  // Render Helpers
  const renderStatusBadge = (status: DeviceStatus) => {
    const styles = {
      [DeviceStatus.Connected]: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      [DeviceStatus.Locked]: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      [DeviceStatus.Offline]: 'bg-slate-700/30 text-slate-400 border-slate-700',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs border font-mono uppercase ${styles[status] || styles[DeviceStatus.Offline]}`}>
        {status}
      </span>
    );
  };

  const avgPingMs = health && health.latency.length > 0
    ? (health.latency.reduce((sum, point) => sum + point.ping, 0) / health.latency.length).toFixed(1)
    : '—';

  const latestPacketLoss = health?.packetLoss !== undefined
    ? `${health.packetLoss.toFixed(1)}%`
    : '—';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col md:flex-row font-sans">
      {/* Sidebar / Navigation */}
      <aside className="w-full md:w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <Shield className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="font-bold text-white tracking-tight">SENTINEL</h1>
              <p className="text-xs text-slate-500 font-mono">VPN CONTROLLER</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'bg-slate-800 text-emerald-400 border border-slate-700' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
          >
            <Activity className="w-5 h-5" />
            <span className="font-medium">Dashboard</span>
            {requests.length > 0 && (
              <span className="ml-auto bg-amber-500 text-slate-900 text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                {requests.length}
              </span>
            )}
          </button>
          
          <button 
            onClick={() => setActiveTab('devices')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'devices' ? 'bg-slate-800 text-emerald-400 border border-slate-700' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
          >
            <Users className="w-5 h-5" />
            <span className="font-medium">Devices</span>
          </button>

          <button 
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-slate-800 text-emerald-400 border border-slate-700' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
          >
            <Settings className="w-5 h-5" />
            <span className="font-medium">Settings</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="bg-slate-950 rounded p-3 border border-slate-800">
            <div className="flex items-center gap-2 mb-2">
              <Server className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-mono text-slate-400">UK-LON-01</span>
            </div>
            <div className="flex items-center gap-2">
               <div className={`w-2 h-2 rounded-full ${health ? 'bg-emerald-500' : 'bg-red-500'} animate-pulse`}></div>
               <span className="text-xs text-emerald-500 font-mono">SYSTEM ONLINE</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white">
              {activeTab === 'dashboard' && 'Operations Center'}
              {activeTab === 'devices' && 'Device Registry'}
              {activeTab === 'settings' && 'System Configuration'}
            </h2>
            <p className="text-slate-400 font-mono text-sm mt-1">
              Phase 1: Manual Approval Mode
            </p>
          </div>

          <div className="flex gap-4 font-mono text-sm">
             <div className="bg-slate-900 border border-slate-700 px-4 py-2 rounded flex flex-col items-center min-w-[100px]">
                <span className="text-slate-500 text-xs uppercase">CPU Load</span>
                <span className="text-emerald-400 font-bold">{health ? `${health.cpuUsage.toFixed(1)}%` : '--'}</span>
             </div>
             <div className="bg-slate-900 border border-slate-700 px-4 py-2 rounded flex flex-col items-center min-w-[100px]">
                <span className="text-slate-500 text-xs uppercase">Tunnels</span>
                <span className="text-blue-400 font-bold">{health ? health.activeTunnels : 0} / {devices.length}</span>
             </div>
          </div>
        </header>

        {apiError && (
          <div className="mb-6 bg-red-900/40 border border-red-700 text-red-100 px-4 py-3 rounded">
            <p className="font-mono text-sm">Backend: {apiError}. Verify the Sentinel API is reachable and WireGuard is installed.</p>
          </div>
        )}

        {/* --- DASHBOARD VIEW --- */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            
            {/* Pending Requests - CRITICAL FEATURE */}
            {requests.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Lock className="w-5 h-5 text-amber-500" />
                  <h3 className="text-lg font-bold text-white">Access Requests Required</h3>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {requests.map(req => (
                    <UnlockRequestCard 
                      key={req.id} 
                      request={req} 
                      onApprove={handleApprove} 
                      onDeny={handleDeny} 
                    />
                  ))}
                </div>
              </section>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Server Health Chart */}
              <section className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-md font-bold text-slate-200 flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-emerald-400" />
                    Upstream Quality (UK-LON-01)
                  </h3>
                  <div className="text-xs font-mono text-slate-500">Live 2s Interval</div>
                </div>
                {health && <ServerHealthChart data={health.latency} />}
                    <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-800">
                    <div className="text-center">
                        <div className="text-xs text-slate-500 mb-1">Avg Ping</div>
                        <div className="text-lg font-mono text-white">{avgPingMs === '—' ? '—' : `${avgPingMs}ms`}</div>
                    </div>
                    <div className="text-center">
                        <div className="text-xs text-slate-500 mb-1">Packet Loss</div>
                        <div className="text-lg font-mono text-emerald-400">{latestPacketLoss}</div>
                    </div>
                    <div className="text-center">
                        <div className="text-xs text-slate-500 mb-1">Uptime</div>
                        <div className="text-lg font-mono text-white">{health?.uptime ?? '—'}</div>
                    </div>
                </div>
              </section>

              {/* Active Sessions Summary */}
              <section className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col">
                <h3 className="text-md font-bold text-slate-200 flex items-center gap-2 mb-4">
                  <Radio className="w-4 h-4 text-blue-400" />
                  Active Sessions
                </h3>
                <div className="flex-1 space-y-3">
                  {devices.filter(d => d.status === DeviceStatus.Connected).length === 0 && (
                    <div className="text-sm text-slate-600 font-mono text-center mt-10">No active sessions</div>
                  )}
                  {devices.filter(d => d.status === DeviceStatus.Connected).map(dev => (
                    <div key={dev.id} className="flex items-center justify-between bg-slate-950 p-3 rounded border border-slate-800/50">
                       <div className="flex items-center gap-3">
                          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                          <div>
                            <div className="text-sm font-bold text-slate-300">{dev.name}</div>
                            <div className="text-xs text-slate-500 font-mono">{dev.ipAllocation}</div>
                          </div>
                       </div>
                       <div className="text-xs text-slate-600 font-mono">1h 20m</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Logs */}
            <section>
              <h3 className="text-md font-bold text-slate-200 mb-4">System Event Log</h3>
              <LogViewer logs={logs} />
            </section>
          </div>
        )}

        {/* --- DEVICES VIEW --- */}
        {activeTab === 'devices' && (
          <div className="space-y-6">
             <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-950 text-slate-400 text-xs uppercase font-mono border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-4">Device Name</th>
                      <th className="px-6 py-4">Type</th>
                      <th className="px-6 py-4">Public Key</th>
                      <th className="px-6 py-4">Last Seen</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {devices.map(device => (
                      <tr key={device.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4 font-medium text-white">{device.name}</td>
                        <td className="px-6 py-4 text-sm text-slate-400">{device.type}</td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-500">{device.publicKey.substring(0, 12)}...</td>
                        <td className="px-6 py-4 text-sm text-slate-400">{new Date(device.lastSeen).toLocaleDateString()}</td>
                        <td className="px-6 py-4">{renderStatusBadge(device.status)}</td>
                        <td className="px-6 py-4">
                          <button 
                             onClick={() => handleRevoke(device.id)}
                             className="text-red-400 hover:text-red-300 text-xs font-bold flex items-center gap-1 border border-red-900/50 bg-red-900/20 px-2 py-1 rounded transition-colors"
                          >
                            <Power className="w-3 h-3" /> REVOKE
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
          </div>
        )}

        {/* --- SETTINGS VIEW (Placeholder for Phase 2/3) --- */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* Quick unlock (one-click) */}
            <section className="bg-slate-900 border border-slate-800 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <Unlock className="w-5 h-5 text-emerald-400" />
                <h3 className="text-md font-bold text-white">Quick Unlock (60m)</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <select className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-white" value={quickDeviceId} onChange={(e) => setQuickDeviceId(e.target.value)}>
                  <option value="">Select device</option>
                  {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button onClick={quickUnlock} className="bg-emerald-500 text-slate-900 font-bold px-4 py-2 rounded hover:bg-emerald-400 transition">Unlock now</button>
                {quickUnlockResult && <div className="text-xs text-emerald-300 font-mono">{quickUnlockResult}</div>}
              </div>
              <p className="text-xs text-slate-500 mt-2">Issues a 60s one-time token and redeems it immediately for a 60m session.</p>
            </section>

            {/* TOTP unlock (simple) */}
            <section className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-purple-400" />
                <h3 className="text-md font-bold text-white">TOTP Unlock</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <select className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-white" value={totpForm.deviceId} onChange={(e) => setTotpForm({ ...totpForm, deviceId: e.target.value })}>
                  <option value="">Select device</option>
                  {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <input className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-white" placeholder="TOTP Code" value={totpForm.code} onChange={(e) => setTotpForm({ ...totpForm, code: e.target.value })} />
                <input className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-white" type="number" placeholder="Duration minutes" value={totpForm.durationMinutes} onChange={(e) => setTotpForm({ ...totpForm, durationMinutes: Number(e.target.value) })} />
              </div>
              <div className="flex items-center gap-3">
                <button onClick={totpUnlock} className="bg-purple-500 text-slate-900 font-bold px-4 py-2 rounded hover:bg-purple-400 transition">Unlock with TOTP</button>
                <div className="text-xs text-emerald-300">{totpResult}</div>
              </div>
            </section>

            {/* Advanced accordion */}
            <section className="bg-slate-900 border border-slate-800 rounded-lg p-5">
              <button onClick={() => setAdvancedOpen(!advancedOpen)} className="w-full flex items-center justify-between text-left text-white font-bold">
                <span>Advanced Controls (pairing, manual tokens)</span>
                <span className="text-sm text-slate-400">{advancedOpen ? 'Hide' : 'Show'}</span>
              </button>
              {advancedOpen && (
                <div className="space-y-6 mt-4">
                  {/* Pairing start */}
                  <div className="bg-slate-950 border border-slate-800 rounded p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Settings className="w-5 h-5 text-emerald-400" />
                      <h4 className="font-bold text-white text-sm">Start Pairing</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-white" placeholder="Device ID" value={pairForm.deviceId} onChange={(e) => setPairForm({ ...pairForm, deviceId: e.target.value })} />
                      <input className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-white" placeholder="Device Name" value={pairForm.deviceName} onChange={(e) => setPairForm({ ...pairForm, deviceName: e.target.value })} />
                      <select className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-white" value={pairForm.deviceType} onChange={(e) => setPairForm({ ...pairForm, deviceType: e.target.value as DeviceType })}>
                        <option value={DeviceType.Windows}>Windows</option>
                        <option value={DeviceType.Android}>Android</option>
                        <option value={DeviceType.Linux}>Linux</option>
                        <option value={DeviceType.MacOS}>MacOS</option>
                        <option value={DeviceType.Unknown}>Unknown</option>
                      </select>
                      <input className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-white" placeholder="Allowed IP (10.10.0.X/32)" value={pairForm.allowedIp} onChange={(e) => setPairForm({ ...pairForm, allowedIp: e.target.value })} />
                      <input className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-white" placeholder="Pairing TTL (minutes)" type="number" value={pairForm.pairingTtlMinutes} onChange={(e) => setPairForm({ ...pairForm, pairingTtlMinutes: Number(e.target.value) })} />
                    </div>
                    <div className="flex gap-3">
                      <button onClick={startPairing} className="bg-emerald-500 text-slate-900 font-bold px-4 py-2 rounded hover:bg-emerald-400 transition">Issue Pairing Code</button>
                      {pairingResult && <span className="text-xs font-mono text-emerald-300">{pairingResult}</span>}
                    </div>
                  </div>

                  {/* Pairing complete */}
                  <div className="bg-slate-950 border border-slate-800 rounded p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Lock className="w-5 h-5 text-blue-400" />
                      <h4 className="font-bold text-white text-sm">Complete Pairing (device)</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <input className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-white" placeholder="Device ID" value={pairCompleteForm.deviceId} onChange={(e) => setPairCompleteForm({ ...pairCompleteForm, deviceId: e.target.value })} />
                      <input className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-white" placeholder="Pairing Code" value={pairCompleteForm.pairingCode} onChange={(e) => setPairCompleteForm({ ...pairCompleteForm, pairingCode: e.target.value })} />
                      <input className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-white" placeholder="Public Key" value={pairCompleteForm.publicKey} onChange={(e) => setPairCompleteForm({ ...pairCompleteForm, publicKey: e.target.value })} />
                    </div>
                    <button onClick={completePairing} className="bg-blue-500 text-slate-900 font-bold px-4 py-2 rounded hover:bg-blue-400 transition">Complete Pairing</button>
                  </div>

                  {/* Pending pairings */}
                  <div className="bg-slate-950 border border-slate-800 rounded p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-amber-400" />
                      <h4 className="font-bold text-white text-sm">Pending Pairings</h4>
                    </div>
                    {pairings.length === 0 ? (
                      <p className="text-sm text-slate-500">None</p>
                    ) : (
                      <div className="space-y-2">
                        {pairings.map((p) => (
                          <div key={`${p.deviceId}-${p.pairingCode}`} className="bg-slate-900 border border-slate-800 rounded p-3 text-sm flex flex-col gap-1">
                            <div className="flex justify-between">
                              <span className="font-bold text-white">{p.deviceName}</span>
                              <span className="text-xs text-slate-500">Expires {new Date(p.expiresAt).toLocaleTimeString()}</span>
                            </div>
                            <span className="text-slate-400 font-mono text-xs">Code: {p.pairingCode}</span>
                            <span className="text-slate-400 font-mono text-xs">TOTP: {p.totpSecret}</span>
                            <span className="text-slate-500 text-xs">IP: {p.allowedIp}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Token + TOTP unlock (manual) */}
                  <div className="bg-slate-950 border border-slate-800 rounded p-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <Unlock className="w-5 h-5 text-emerald-400" />
                      <h4 className="font-bold text-white text-sm">Manual Token Flow</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="text-sm text-slate-400 font-bold mb-1">Issue Token (owner)</div>
                        <select className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-white w-full" value={tokenForm.deviceId} onChange={(e) => setTokenForm({ ...tokenForm, deviceId: e.target.value })}>
                          <option value="">Select device</option>
                          {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                        <input className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-white w-full" type="number" placeholder="TTL seconds (e.g., 60)" value={tokenForm.ttlSeconds} onChange={(e) => setTokenForm({ ...tokenForm, ttlSeconds: Number(e.target.value) })} />
                        <button onClick={issueToken} className="bg-emerald-500 text-slate-900 font-bold px-3 py-2 rounded hover:bg-emerald-400 transition w-full">Create Token</button>
                      </div>

                      <div className="space-y-2">
                        <div className="text-sm text-slate-400 font-bold mb-1">Redeem Token (device)</div>
                        <input className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-white w-full" placeholder="Device ID" value={redeemForm.deviceId} onChange={(e) => setRedeemForm({ ...redeemForm, deviceId: e.target.value })} />
                        <input className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-white w-full" placeholder="Token" value={redeemForm.token} onChange={(e) => setRedeemForm({ ...redeemForm, token: e.target.value })} />
                        <input className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-white w-full" type="number" placeholder="Duration minutes" value={redeemForm.durationMinutes} onChange={(e) => setRedeemForm({ ...redeemForm, durationMinutes: Number(e.target.value) })} />
                        <button onClick={redeemToken} className="bg-blue-500 text-slate-900 font-bold px-3 py-2 rounded hover:bg-blue-400 transition w-full">Redeem Token</button>
                      </div>
                    </div>
                    <div className="text-xs text-emerald-300">{tokenResult}</div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

      </main>
    </div>
  );
}

export default App;
