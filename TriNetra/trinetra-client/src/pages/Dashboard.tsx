import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquareText, AlertTriangle, Network, ShieldCheck, Map as MapIcon, ArrowUpRight, Loader2 } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { sendChatQuery, fetchCrimeTrend, type ChatResponse } from '../services/api';

interface DashboardData {
  activeCases: string;
  casesAnswer: string;
  trendData: { month: string; count: number }[];
  isLoaded: boolean;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData>({
    activeCases: '—',
    casesAnswer: '',
    trendData: [],
    isLoaded: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      setIsLoading(true);
      setError(null);
      try {
        // Fire both requests in parallel
        const [statsResult, trendResult] = await Promise.allSettled([
          sendChatQuery('How many active cases are currently under investigation?'),
          fetchCrimeTrend(),
        ]);

        const newData: DashboardData = {
          activeCases: '—',
          casesAnswer: '',
          trendData: [],
          isLoaded: true,
        };

        if (statsResult.status === 'fulfilled') {
          newData.casesAnswer = statsResult.value.answer;
          // Try to extract number from the answer
          const numMatch = statsResult.value.answer.match(/[\d,]+/);
          if (numMatch) newData.activeCases = numMatch[0];
        }

        if (trendResult.status === 'fulfilled' && trendResult.value.analytics_data) {
          const ad = trendResult.value.analytics_data;
          if (ad.type === 'trend' && Array.isArray(ad.data)) {
            newData.trendData = ad.data;
          }
        }

        setData(newData);
      } catch (err: any) {
        setError(err.message || 'Failed to load dashboard data');
      } finally {
        setIsLoading(false);
      }
    }

    loadDashboard();
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      
      {/* Ask TriNetra Highlight Card */}
      <section className="bg-primary-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6 border border-primary-800">
        <div className="absolute -right-20 -top-20 w-64 h-64 bg-accent-500/10 rounded-full blur-3xl"></div>
        <div className="relative z-10 max-w-2xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-accent-500 rounded-lg flex items-center justify-center text-primary-900 shadow-sm">
              <MessageSquareText className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold">Ask TriNetra</h2>
          </div>
          <p className="text-primary-100 text-lg">
            Your conversational intelligence copilot. Query cases, map networks, and extract insights using natural language.
          </p>
        </div>
        <Link 
          to="/ask" 
          className="relative z-10 shrink-0 bg-accent-500 hover:bg-accent-400 text-primary-900 font-bold px-8 py-4 rounded-xl shadow-lg shadow-accent-500/20 transition-all flex items-center gap-2 hover:-translate-y-1"
        >
          Start New Query
          <ArrowUpRight className="w-5 h-5" />
        </Link>
      </section>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Backend connection issue: {error}. Showing cached data.
        </div>
      )}

      {/* Key Stats Row */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active Cases", value: data.activeCases, icon: ShieldCheck, color: "text-blue-500" },
          { label: "Trend Data Points", value: data.trendData.length > 0 ? `${data.trendData.length} months` : '—', icon: AlertTriangle, color: "text-amber-500" },
          { label: "Backend Status", value: data.isLoaded ? 'Connected' : isLoading ? 'Loading...' : 'Offline', icon: Network, color: data.isLoaded ? "text-emerald-500" : "text-slate-400" },
          { label: "Intelligence Engine", value: 'Live', icon: MessageSquareText, color: "text-accent-500" },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-2 rounded-lg bg-slate-50 ${stat.color}`}>
                <stat.icon className="w-5 h-5" />
              </div>
              {isLoading && (
                <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
              )}
            </div>
            <div className="text-3xl font-bold text-slate-900 mb-1">{stat.value}</div>
            <div className="text-sm text-slate-500 font-medium">{stat.label}</div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Crime Trend (Live from Backend) */}
        <section className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
              <MapIcon className="w-5 h-5 text-primary-500" />
              Crime Trend (Live Data)
            </h3>
            <Link to="/analytics" className="text-sm font-semibold text-primary-600 hover:text-primary-800 transition-colors">
              Full Analytics &rarr;
            </Link>
          </div>
          
          <div className="flex-1 min-h-[300px]">
            {isLoading ? (
              <div className="h-full flex items-center justify-center text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : data.trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.trendData}>
                  <defs>
                    <linearGradient id="dashTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0a1f44" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#0a1f44" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="count" stroke="#0a1f44" strokeWidth={2} fillOpacity={1} fill="url(#dashTrend)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <MapIcon className="w-8 h-8 mb-2" />
                <p className="text-sm">No trend data available. Ask TriNetra to "Show me the crime trend".</p>
              </div>
            )}
          </div>
        </section>

        {/* Intelligence Summary */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col">
          <h3 className="font-bold text-lg text-slate-900 mb-6">Intelligence Summary</h3>
          
          <div className="flex-1">
            {data.casesAnswer ? (
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 text-sm text-slate-700 leading-relaxed">
                <div className="text-xs font-bold text-accent-500 uppercase tracking-wider mb-2">Latest Query Result</div>
                {data.casesAnswer}
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center h-full text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : (
              <div className="text-sm text-slate-400 text-center">No data loaded yet.</div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <Link to="/ask" className="w-full bg-primary-900 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-primary-800 transition-colors flex items-center justify-center gap-2">
              <MessageSquareText className="w-4 h-4" />
              Ask a Question
            </Link>
          </div>
        </section>
      </div>

    </div>
  );
}
