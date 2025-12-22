import React from 'react';
import { LogEntry } from '../types';
import { Terminal, RefreshCw } from 'lucide-react';

interface Props {
  logs: LogEntry[];
}

const LogViewer: React.FC<Props> = ({ logs }) => {
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden flex flex-col h-96">
      <div className="bg-slate-800 px-4 py-2 border-b border-slate-700 flex justify-between items-center">
        <div className="flex items-center gap-2 text-slate-300">
          <Terminal className="w-4 h-4" />
          <span className="font-mono text-sm font-bold">System Logs</span>
        </div>
        <div className="flex gap-2">
          <div className="h-2 w-2 rounded-full bg-red-500"></div>
          <div className="h-2 w-2 rounded-full bg-amber-500"></div>
          <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1">
        {logs.length === 0 && (
            <div className="text-slate-600 text-center mt-10">No logs available</div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="flex gap-3 hover:bg-slate-800/50 p-0.5 rounded">
            <span className="text-slate-500 shrink-0 w-20">{log.timestamp.split('T')[1].split('.')[0]}</span>
            <span className={`shrink-0 w-16 font-bold ${
              log.level === 'INFO' ? 'text-blue-400' :
              log.level === 'WARN' ? 'text-amber-400' :
              log.level === 'ERROR' ? 'text-red-400' :
              'text-emerald-400'
            }`}>[{log.level}]</span>
            <span className="text-slate-400 shrink-0 w-16">[{log.category}]</span>
            <span className="text-slate-300 break-all">
              {log.message} 
              {log.details && <span className="text-slate-500 ml-2">// {log.details}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LogViewer;