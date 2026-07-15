import React, { useEffect, useState } from 'react';
import { MapPin, TrendingUp, AlertTriangle, Loader2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchCrimeTrend, sendChatQuery, type TrendDataPoint, type ChatResponse } from '../services/api';

export default function CrimeAnalytics() {
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [summaryAnswer, setSummaryAnswer] = useState('');

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError('');
      try {
        const result: ChatResponse = await fetchCrimeTrend();
        setSummaryAnswer(result.answer);

        if (result.analytics_data && result.analytics_data.type === 'trend' && Array.isArray(result.analytics_data.data)) {
          setTrendData(result.analytics_data.data as TrendDataPoint[]);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load analytics.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  // Compute summary stats from live data
  const totalCases = trendData.reduce((sum, d) => sum + d.count, 0);
  const peakMonth = trendData.length > 0 ? trendData.reduce((a, b) => a.count > b.count ? a : b) : null;

  return (
    <div className="p-6 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary-900">Crime Analytics</h1>
          <p className="text-slate-500 text-sm mt-1">Live temporal crime trends from the database.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Summary Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-primary-50 text-primary-900 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase">Total Cases (Period)</div>
            <div className="font-bold text-slate-900">{isLoading ? '...' : totalCases.toLocaleString()}</div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-lg flex items-center justify-center">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase">Peak Month</div>
            <div className="font-bold text-slate-900">{isLoading ? '...' : peakMonth ? `${peakMonth.month} (${peakMonth.count})` : 'N/A'}</div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-lg flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase">Data Source</div>
            <div className="font-bold text-slate-900">{isLoading ? '...' : 'Live (CaseMaster)'}</div>
          </div>
        </div>
      </div>

      {/* AI Summary */}
      {summaryAnswer && (
        <div className="mb-6 bg-primary-50 border border-primary-200 rounded-xl p-4 text-sm text-primary-900">
          <span className="font-bold">TriNetra Summary: </span>{summaryAnswer}
        </div>
      )}

      {/* Charts */}
      <div className="flex-1 grid grid-cols-1 gap-6 min-h-[400px]">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col">
          <h3 className="font-bold text-slate-900 mb-4">Monthly Crime Volume</h3>
          <div className="flex-1 min-h-[300px]">
            {isLoading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary-900 animate-spin" />
              </div>
            ) : trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTrendLive" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0a1f44" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#0a1f44" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Area type="monotone" dataKey="count" stroke="#0a1f44" strokeWidth={2} fillOpacity={1} fill="url(#colorTrendLive)" name="Cases" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400">
                <p>No trend data available from the backend.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
