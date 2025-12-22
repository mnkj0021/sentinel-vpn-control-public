import os from 'os';
import { execa } from 'execa';
import { HealthSnapshot, LatencyPoint } from './types.js';

interface PingStats {
  averageMs: number;
  jitterMs: number;
  packetLoss: number;
}

async function runPing(target: string): Promise<PingStats> {
  try {
    const { stdout } = await execa('ping', ['-c', '3', target]);
    const timeMatches = Array.from(stdout.matchAll(/time=([\d.]+)/g)).map((m) => Number(m[1]));
    const packetLossMatch = stdout.match(/(\d+(?:\.\d+)?)%\s+packet loss/);
    const packetLoss = packetLossMatch ? Number(packetLossMatch[1]) : 0;

    if (timeMatches.length === 0) {
      return { averageMs: 0, jitterMs: 0, packetLoss };
    }

    const avg = timeMatches.reduce((sum, t) => sum + t, 0) / timeMatches.length;
    const variance =
      timeMatches.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / Math.max(timeMatches.length - 1, 1);
    const jitter = Math.sqrt(variance);

    return { averageMs: Number(avg.toFixed(1)), jitterMs: Number(jitter.toFixed(1)), packetLoss };
  } catch (err) {
    return { averageMs: 0, jitterMs: 0, packetLoss: 100 };
  }
}

export class HealthMonitor {
  private readonly target: string;
  private latencyHistory: LatencyPoint[] = [];

  constructor(target = '1.1.1.1') {
    this.target = target;
    this.poll();
    setInterval(() => this.poll(), 5000);
  }

  private async poll() {
    const ping = await runPing(this.target);
    const point: LatencyPoint = {
      timestamp: new Date().toISOString(),
      ping: ping.averageMs,
      jitter: ping.jitterMs,
      packetLoss: ping.packetLoss
    };
    this.latencyHistory.push(point);
    if (this.latencyHistory.length > 50) {
      this.latencyHistory.shift();
    }
  }

  snapshot(activeTunnels: number): HealthSnapshot {
    const load = os.loadavg()[0];
    const cpuUsage = Math.min(100, (load / os.cpus().length) * 100);
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const ramUsage = ((totalMem - freeMem) / totalMem) * 100;
    const uptimeSeconds = os.uptime();
    const uptime = `${Math.floor(uptimeSeconds / 86400)}d ${Math.floor((uptimeSeconds % 86400) / 3600)}h`;

    return {
      cpuUsage: Number(cpuUsage.toFixed(1)),
      ramUsage: Number(ramUsage.toFixed(1)),
      uptime,
      activeTunnels,
      latency: [...this.latencyHistory],
      packetLoss: this.latencyHistory.at(-1)?.packetLoss
    };
  }
}
