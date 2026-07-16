import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquareText, AlertTriangle, ShieldCheck, ArrowUpRight, Loader2, BarChart2, BellRing, MapPin } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { fetchCrimeTrend, fetchAnalyticsSummary, fetchPreventionAlerts, type TrendDataPoint } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface DashboardStats {
  totalCases: number;
  solvedPercentage: number;
  highestDistrict: string;
  activeAlertsCount: number;
}

export default function Dashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalCases: 0,
    solvedPercentage: 0,
    highestDistrict: 'N/A',
    activeAlertsCount: 0,
  });
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [latestAlerts, setLatestAlerts] = useState<any[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      setIsLoading(true);
      setError(null);
      try {
        const districtId = profile?.district_id;

        // Fetch stats, alerts and trends in parallel
        const [summaryRes, alertsRes, trendsRes] = await Promise.all([
          fetchAnalyticsSummary({ district_id: districtId }),
          fetchPreventionAlerts(districtId),
          fetchCrimeTrend()
        ]);

        setStats({
          totalCases: summaryRes.total_cases,
          solvedPercentage: summaryRes.solved_percentage,
          highestDistrict: summaryRes.highest_activity_district,
          activeAlertsCount: alertsRes.alerts?.length || 0
        });

        if (alertsRes.alerts) {
          setLatestAlerts(alertsRes.alerts.slice(0, 3)); // show top 3 on dashboard
        }

        if (trendsRes.analytics_data && trendsRes.analytics_data.type === 'trend' && Array.isArray(trendsRes.analytics_data.data)) {
          setTrendData(trendsRes.analytics_data.data);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load dashboard data');
      } finally {
        setIsLoading(false);
      }
    }

    loadDashboard();
  }, [profile?.district_id]);

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
            <h2 className="text-2xl font-bold">Ask TriNetra AI Copilot</h2>
          </div>
          <p className="text-primary-100 text-lg">
            Your conversational intelligence copilot. Query cases, map co-accused syndicates, and investigate criminal risk in plain English.
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
          Data connection issue: {error}. Please refresh or check database status.
        </div>
      )}

      {/* Key Stats Row */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Crimes (District)", value: stats.totalCases.toLocaleString(), icon: BarChart2, color: "text-blue-500" },
          { label: "Solved Rate", value: `${stats.solvedPercentage}%`, icon: ShieldCheck, color: "text-emerald-500" },
          { label: "Active Alerts", value: stats.activeAlertsCount, icon: BellRing, color: "text-rose-500", link: "/alerts" },
          { label: "District", value: stats.highestDistrict, icon: MapPin, color: "text-amber-500" },
        ].map((stat, i) => {
          const CardContent = (
            <>
              <div className="flex justify-between items-start mb-4">
                <div className={`p-2 rounded-lg bg-slate-50 ${stat.color}`}>
                  <stat.icon className="w-5 h-5" />
                </div>
                {isLoading && (
                  <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                )}
              </div>
              <div className="text-3xl font-bold text-slate-900 mb-1 truncate">{isLoading ? '...' : stat.value}</div>
              <div className="text-sm text-slate-500 font-medium">{stat.label}</div>
            </>
          );

          return stat.link ? (
            <Link key={i} to={stat.link} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 transition-all flex flex-col cursor-pointer">
              {CardContent}
            </Link>
          ) : (
            <div key={i} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
              {CardContent}
            </div>
          );
        })}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Crime Trend Chart */}
        <section className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col min-h-[380px]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-primary-900" />
              Organizational Crime Trend (Live)
            </h3>
            <Link to="/analytics" className="text-sm font-semibold text-primary-600 hover:text-primary-800 transition-colors">
              Full Analytics &rarr;
            </Link>
          </div>

          <div className="h-[280px] w-full">
            {isLoading ? (
              <div className="h-full flex items-center justify-center text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-primary-900" />
              </div>
            ) : trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0a1f44" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#0a1f44" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                  <Area type="monotone" dataKey="count" stroke="#0a1f44" strokeWidth={2} fillOpacity={1} fill="url(#dashTrend)" name="Cases Registered" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <BarChart2 className="w-8 h-8 mb-2" />
                <p className="text-sm">No trend data available.</p>
              </div>
            )}
          </div>
        </section>

        {/* Actionable Prevention Alerts Panel */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col min-h-[380px]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
              <BellRing className="w-5 h-5 text-rose-500" />
              Active Early Warnings
            </h3>
            <Link to="/alerts" className="text-xs font-bold text-rose-500 hover:text-rose-600">
              View All
            </Link>
          </div>

          <div className="flex-1 flex flex-col gap-3">
            {isLoading ? (
              <div className="flex-1 flex items-center justify-center text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin text-primary-900" />
              </div>
            ) : latestAlerts.length > 0 ? (
              latestAlerts.map((alert) => (
                <Link
                  key={alert.id}
                  to="/alerts"
                  className="p-3.5 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg flex gap-3 transition-colors text-left"
                >
                  <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center ${alert.severity === 'high' ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'}`}>
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{alert.category}</div>
                    <div className="text-xs font-bold text-slate-800 truncate mt-0.5">{alert.reason}</div>
                    <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 font-semibold">
                      <MapPin className="w-3 h-3" /> {alert.district}
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-center p-6 border-2 border-dashed border-slate-100 rounded-xl">
                <ShieldCheck className="w-8 h-8 text-emerald-500 mb-2" />
                <h4 className="font-bold text-slate-900 text-sm">All Clear</h4>
                <p className="text-xs mt-1">No active warnings for your district.</p>
              </div>
            )}
          </div>
        </section>
      </div>

    </div>
  );
}
