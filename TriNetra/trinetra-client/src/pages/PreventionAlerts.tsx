import React, { useState } from 'react';
import { AlertTriangle, MapPin, TrendingUp, Check, X } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

const dummyAlerts = [
  { id: 1, district: 'Mysuru South', category: 'Cyber Fraud', reason: '35 cases in 6 weeks, 3.5x baseline.', severity: 'high', data: [{v:5},{v:10},{v:15},{v:22},{v:35}] },
  { id: 2, district: 'Bengaluru Central', category: 'Vehicle Theft', reason: 'Spike in incidents near major transit hubs.', severity: 'medium', data: [{v:8},{v:12},{v:11},{v:18},{v:20}] },
  { id: 3, district: 'Hubballi', category: 'Organized Assault', reason: 'Detected communication cluster among known offenders.', severity: 'high', data: [{v:0},{v:1},{v:2},{v:5},{v:8}] },
];

export default function PreventionAlerts() {
  const [alerts, setAlerts] = useState(dummyAlerts);

  const handleDismiss = (id: number) => {
    setAlerts(alerts.filter(a => a.id !== id));
  };

  return (
    <div className="p-6 max-w-4xl mx-auto h-full overflow-y-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-bold text-primary-900">Prevention Alerts</h1>
          <p className="text-slate-500 text-sm mt-1">AI-driven early warnings for emerging crime clusters.</p>
        </div>
        <div className="bg-red-50 text-red-600 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {alerts.length} Active Alerts
        </div>
      </div>

      <div className="space-y-4">
        {alerts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
            <Check className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-900">All Clear</h3>
            <p className="text-slate-500">No active prevention alerts at this time.</p>
          </div>
        ) : (
          alerts.map(alert => (
            <div key={alert.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col md:flex-row gap-6 relative overflow-hidden group">
              {/* Severity Indicator Line */}
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${alert.severity === 'high' ? 'bg-red-500' : 'bg-amber-500'}`}></div>
              
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${alert.severity === 'high' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                    {alert.severity} Priority
                  </span>
                  <span className="text-sm font-semibold text-slate-900">{alert.category}</span>
                </div>
                
                <h3 className="text-lg font-bold text-primary-900 mb-1 flex items-center gap-2">
                  <AlertTriangle className={`w-5 h-5 ${alert.severity === 'high' ? 'text-red-500' : 'text-amber-500'}`} />
                  {alert.reason}
                </h3>
                
                <div className="flex items-center gap-2 text-sm text-slate-500 mt-3">
                  <MapPin className="w-4 h-4" /> {alert.district}
                </div>
              </div>

              {/* Sparkline & Actions */}
              <div className="w-full md:w-48 shrink-0 flex flex-col justify-between gap-4">
                <div className="h-12 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={alert.data}>
                      <Area type="monotone" dataKey="v" stroke={alert.severity === 'high' ? '#ef4444' : '#f59e0b'} fill={alert.severity === 'high' ? '#fef2f2' : '#fffbeb'} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                
                <div className="flex gap-2">
                  <button className="flex-1 bg-primary-50 text-primary-900 hover:bg-primary-100 font-medium py-1.5 rounded flex items-center justify-center gap-1 text-sm transition-colors">
                    <Check className="w-4 h-4" /> Acknowledge
                  </button>
                  <button onClick={() => handleDismiss(alert.id)} className="px-3 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 rounded flex items-center justify-center transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
