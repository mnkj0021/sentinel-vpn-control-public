import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ServerHealth } from '../types';

interface Props {
  data: ServerHealth['latency'];
}

const ServerHealthChart: React.FC<Props> = ({ data }) => {
  return (
    <div className="h-48 w-full mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis 
            dataKey="timestamp" 
            tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
            stroke="#334155"
            interval={4}
          />
          <YAxis 
            tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
            stroke="#334155"
            width={30}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#e2e8f0', fontFamily: 'monospace' }}
            itemStyle={{ fontSize: 12 }}
          />
          <Line 
            type="monotone" 
            dataKey="ping" 
            stroke="#10b981" 
            strokeWidth={2} 
            dot={false}
            animationDuration={300}
            name="Latency (ms)"
          />
          <Line 
            type="monotone" 
            dataKey="jitter" 
            stroke="#f59e0b" 
            strokeWidth={2} 
            dot={false} 
            strokeDasharray="4 4"
            animationDuration={300}
            name="Jitter (ms)"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ServerHealthChart;