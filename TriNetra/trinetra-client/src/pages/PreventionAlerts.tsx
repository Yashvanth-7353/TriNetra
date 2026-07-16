import { useEffect, useState } from 'react';
import { AlertTriangle, MapPin, Check, X, Loader2, Sparkles, AlertOctagon } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { fetchPreventionAlerts, type PreventionAlert } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function PreventionAlerts() {
  const { profile } = useAuth();
  const [alerts, setAlerts] = useState<PreventionAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAlerts = async () => {
    setIsLoading(true);
    setError('');
    try {
      // Fetch alerts using profile's district if logged in
      const res = await fetchPreventionAlerts(profile?.district_id);
      if (res.status === 'success') {
        setAlerts(res.alerts || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load prevention alerts.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, [profile?.district_id]);

  const handleDismiss = (id: number) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col gap-6 min-h-screen">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <AlertOctagon className="w-7 h-7 text-rose-600" />
            Prevention Alerts
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            AI-driven early warnings for emerging crime clusters in your jurisdiction.
          </p>
        </div>

        {/* Current Jurisdiction Badge */}
        {profile && (
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-primary-900 text-accent-500 border border-primary-800 shadow-xs">
            <MapPin className="w-3.5 h-3.5" />
            Jurisdiction: {profile.district_name || 'My District'}
          </span>
        )}
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Cards List */}
      <div className="flex flex-col gap-4">
        {isLoading ? (
          <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-primary-900 animate-spin" />
            <span className="text-sm font-semibold text-slate-500">Scanning database for anomalies...</span>
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200 shadow-xs">
            <Check className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-900">All Clear</h3>
            <p className="text-slate-500 text-sm mt-1">No active prevention alerts for your district at this time.</p>
          </div>
        ) : (
          alerts.map(alert => {
            const isHigh = alert.severity === 'high';
            return (
              <div
                key={alert.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col md:flex-row items-center gap-6 relative overflow-hidden group hover:border-slate-300 transition-all"
              >
                {/* Severity Indicator Ribbon */}
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${isHigh ? 'bg-red-500' : 'bg-amber-500'}`}></div>

                {/* Left Side: Content */}
                <div className="flex-1 w-full">
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isHigh ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                      {alert.severity} Priority
                    </span>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      {alert.category}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-2">
                    <Sparkles className={`w-5 h-5 ${isHigh ? 'text-rose-500' : 'text-amber-500'}`} />
                    {alert.reason}
                  </h3>

                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-3 font-semibold">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>Active in {alert.district}</span>
                  </div>
                </div>

                {/* Right Side: Sparkline & Actions */}
                <div className="w-full md:w-56 shrink-0 flex flex-row md:flex-col justify-between items-center md:items-stretch gap-4 border-t md:border-t-0 border-slate-100 pt-4 md:pt-0">
                  {/* Sparkline wrapper */}
                  <div className="h-11 w-28 md:w-full select-none">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={alert.data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                        <Area
                          type="monotone"
                          dataKey="v"
                          stroke={isHigh ? '#ef4444' : '#f59e0b'}
                          fill={isHigh ? '#fef2f2' : '#fffbeb'}
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleDismiss(alert.id)}
                      className="flex-1 px-4 py-2 bg-slate-50 text-slate-700 hover:bg-slate-100 font-bold text-xs rounded-lg border border-slate-200 transition cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> Acknowledge
                    </button>
                    <button
                      onClick={() => handleDismiss(alert.id)}
                      className="px-3 py-2 bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200 rounded-lg border border-slate-200 transition cursor-pointer flex items-center justify-center"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
