import React from 'react';
import { UnlockRequest, DeviceType } from '../types';
import { Smartphone, Laptop, CheckCircle, XCircle, ShieldAlert } from 'lucide-react';

interface Props {
  request: UnlockRequest;
  onApprove: (id: string, duration: number) => void;
  onDeny: (id: string) => void;
}

const UnlockRequestCard: React.FC<Props> = ({ request, onApprove, onDeny }) => {
  const [duration, setDuration] = React.useState(8);

  const getIcon = (type: DeviceType) => {
    switch (type) {
      case DeviceType.Android: return <Smartphone className="w-5 h-5 text-emerald-400" />;
      case DeviceType.Windows: return <Laptop className="w-5 h-5 text-blue-400" />;
      default: return <ShieldAlert className="w-5 h-5 text-gray-400" />;
    }
  };

  return (
    <div className="bg-slate-850 border border-amber-500/30 rounded-lg p-4 shadow-[0_0_15px_rgba(245,158,11,0.1)] relative overflow-hidden animate-pulse-slow">
      <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
      
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-800 rounded-md border border-slate-700">
            {getIcon(request.deviceType)}
          </div>
          <div>
            <h3 className="text-lg font-bold text-white font-mono tracking-tight">{request.deviceName}</h3>
            <p className="text-xs text-slate-400 font-mono">IP: {request.requestSourceIp}</p>
          </div>
        </div>
        <div className="text-right">
            <span className="inline-flex items-center px-2 py-1 rounded bg-amber-500/10 text-amber-500 text-xs font-bold border border-amber-500/20 uppercase tracking-wider">
              Pending
            </span>
            <p className="text-xs text-slate-500 mt-1">{new Date(request.timestamp).toLocaleTimeString()}</p>
        </div>
      </div>

      <div className="bg-slate-900/50 p-3 rounded border border-slate-800 mb-4 font-mono text-sm text-slate-300">
        <p><span className="text-slate-500">Reason:</span> {request.reason}</p>
        <p><span className="text-slate-500">Device ID:</span> {request.deviceId}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between border-t border-slate-800 pt-3">
        <div className="flex items-center gap-2 text-sm text-slate-400 w-full sm:w-auto">
           <span>Duration:</span>
           <select 
             value={duration}
             onChange={(e) => setDuration(Number(e.target.value))}
             className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white focus:border-emerald-500 focus:outline-none"
           >
             <option value={1}>1 Hour</option>
             <option value={8}>8 Hours</option>
             <option value={24}>24 Hours</option>
             <option value={720}>30 Days</option>
           </select>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <button 
            onClick={() => onDeny(request.id)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors"
          >
            <XCircle className="w-4 h-4" />
            Deny
          </button>
          <button 
            onClick={() => onApprove(request.id, duration)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded bg-emerald-500 text-slate-900 font-bold hover:bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)] transition-all"
          >
            <CheckCircle className="w-4 h-4" />
            Approve
          </button>
        </div>
      </div>
    </div>
  );
};

export default UnlockRequestCard;