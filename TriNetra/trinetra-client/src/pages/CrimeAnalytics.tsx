import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Circle, Popup } from 'react-leaflet';
import { MapPin, TrendingUp, AlertTriangle, Loader2, Calendar, Shield, RefreshCw, BarChart2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import {
  fetchCaseFilters,
  fetchAnalyticsSummary,
  fetchAnalyticsHotspots,
  fetchAnalyticsTrends,
  type FilterOption,
  type HotspotPoint,
  type TrendDataPoint
} from '../services/api';

// Karnataka coordinates center
const KARNATAKA_CENTER: [number, number] = [15.317277, 75.71389];

export default function CrimeAnalytics() {
  // Filter states
  const [districts, setDistricts] = useState<FilterOption[]>([]);
  const [categories, setCategories] = useState<FilterOption[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedTimeWindow, setSelectedTimeWindow] = useState<string>('12m');

  // Data states
  const [summary, setSummary] = useState({
    total_cases: 0,
    solved_percentage: 0,
    highest_activity_district: 'N/A',
    biggest_mom_change: '0.0%'
  });
  const [hotspots, setHotspots] = useState<HotspotPoint[]>([]);
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<Record<string, Record<string, number>>>({});

  // Loading & error states
  const [isFiltersLoading, setIsFiltersLoading] = useState(true);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [error, setError] = useState('');

  // Load dropdown filters on mount
  useEffect(() => {
    async function loadFilters() {
      try {
        const filters = await fetchCaseFilters();
        setDistricts(filters.districts || []);
        setCategories(filters.categories || []);
      } catch (err: any) {
        console.error('Failed to load filters:', err);
      } finally {
        setIsFiltersLoading(false);
      }
    }
    loadFilters();
  }, []);

  // Fetch metrics when filters change
  const loadAnalyticsData = async () => {
    setIsDataLoading(true);
    setError('');
    try {
      const params = {
        district_id: selectedDistrict ? parseInt(selectedDistrict) : undefined,
        category_id: selectedCategory ? parseInt(selectedCategory) : undefined,
        time_window: selectedTimeWindow || undefined,
      };

      const [summaryRes, hotspotsRes, trendsRes] = await Promise.all([
        fetchAnalyticsSummary(params),
        fetchAnalyticsHotspots(params),
        fetchAnalyticsTrends(params)
      ]);

      if (summaryRes.status === 'success') {
        setSummary({
          total_cases: summaryRes.total_cases,
          solved_percentage: summaryRes.solved_percentage,
          highest_activity_district: summaryRes.highest_activity_district,
          biggest_mom_change: summaryRes.biggest_mom_change
        });
      }

      if (hotspotsRes.status === 'success') {
        setHotspots(hotspotsRes.hotspots || []);
      }

      if (trendsRes.status === 'success') {
        setTrendData(trendsRes.trend_data || []);
        setCategoryBreakdown(trendsRes.category_breakdown || {});
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch crime analytics data.');
    } finally {
      setIsDataLoading(false);
    }
  };

  useEffect(() => {
    loadAnalyticsData();
  }, [selectedDistrict, selectedCategory, selectedTimeWindow]);

  // Transform trend data to merge category breakdown values
  const transformedTrendData = trendData.map((d) => {
    const breakdown = categoryBreakdown[d.month] || {};
    return {
      month: d.month,
      Total: d.count,
      ...breakdown
    };
  });

  // Calculate unique categories from breakdown to feed Recharts dynamically
  const activeCategories = Array.from(
    new Set(
      Object.values(categoryBreakdown).flatMap((b) => Object.keys(b))
    )
  ).slice(0, 5); // Limit to top 5 for cleaner display

  const categoryColors = ['#0a1f44', '#c9a227', '#e11d48', '#2563eb', '#16a34a'];

  return (
    <div className="p-6 max-w-7xl mx-auto flex flex-col gap-6 min-h-screen">
      {/* Header Row */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart2 className="w-7 h-7 text-primary-900" />
            Crime Analytics Control Board
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Interactive multi-dimensional hotspot analytics dashboard.
          </p>
        </div>

        {/* Global Controls / Reset */}
        <button
          onClick={loadAnalyticsData}
          disabled={isDataLoading}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg shadow-xs transition cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isDataLoading ? 'animate-spin' : ''}`} />
          Refresh Live
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-4">
        <div className="flex flex-col gap-1.5 min-w-[200px] flex-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">District</label>
          <select
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            disabled={isFiltersLoading}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-900"
          >
            <option value="">All Districts</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 min-w-[200px] flex-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Crime Category</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            disabled={isFiltersLoading}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-900"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 min-w-[150px] flex-1 md:flex-initial">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Time Window</label>
          <select
            value={selectedTimeWindow}
            onChange={(e) => setSelectedTimeWindow(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-900"
          >
            <option value="3m">Last 3 Months</option>
            <option value="6m">Last 6 Months</option>
            <option value="12m">Last 12 Months</option>
            <option value="">All Time</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* KPI Cards Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Crimes */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 bg-primary-50 text-primary-900 rounded-xl flex items-center justify-center shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Crimes</div>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">
              {isDataLoading ? '...' : summary.total_cases.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Solved Rate */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Solved Rate</div>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">
              {isDataLoading ? '...' : `${summary.solved_percentage}%`}
            </div>
          </div>
        </div>

        {/* Highest Activity District */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Peak District</div>
            <div className="text-base font-bold text-slate-900 mt-0.5 truncate max-w-[160px]">
              {isDataLoading ? '...' : summary.highest_activity_district}
            </div>
          </div>
        </div>

        {/* Biggest MoM Change */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center shrink-0">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">MoM Change</div>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">
              {isDataLoading ? '...' : summary.biggest_mom_change}
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Leaflet Map (Primary) & Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hotspot Map Panel */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 lg:col-span-2 flex flex-col h-[520px]">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-bold text-slate-900">Crime Hotspot Map</h3>
              <p className="text-xs text-slate-400 mt-0.5">Spatial concentration of crime instances.</p>
            </div>
            <span className="text-xs px-2.5 py-1 bg-red-50 text-red-600 border border-red-100 rounded-full font-medium">
              {hotspots.length} Density Nodes
            </span>
          </div>

          <div className="flex-1 rounded-lg overflow-hidden border border-slate-100 relative z-0">
            {isDataLoading && (
              <div className="absolute inset-0 bg-slate-50/70 z-50 flex items-center justify-center backdrop-blur-xs">
                <Loader2 className="w-8 h-8 text-primary-900 animate-spin" />
              </div>
            )}
            <MapContainer
              center={KARNATAKA_CENTER}
              zoom={7.2}
              className="h-full w-full"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {hotspots.map((point, index) => (
                <Circle
                  key={index}
                  center={[point.lat, point.lng]}
                  pathOptions={{
                    color: '#e11d48',
                    fillColor: '#ef4444',
                    fillOpacity: 0.55,
                    weight: 1
                  }}
                  radius={1200}
                >
                  <Popup>
                    <div className="p-1 max-w-[240px]">
                      <div className="font-bold text-xs text-slate-900">{point.crime_no}</div>
                      <div className="text-[10px] font-semibold text-rose-600 uppercase tracking-wider mt-0.5">{point.category}</div>
                      <p className="text-[11px] text-slate-500 mt-1 leading-normal line-clamp-3">
                        {point.brief_facts}
                      </p>
                    </div>
                  </Popup>
                </Circle>
              ))}
            </MapContainer>
          </div>
        </div>

        {/* Category Breakdown list & Bar Chart */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col h-[520px]">
          <div>
            <h3 className="font-bold text-slate-900">Crime Volume Breakdown</h3>
            <p className="text-xs text-slate-400 mt-0.5">Top case categories registered during this period.</p>
          </div>

          <div className="flex-1 mt-6 flex flex-col justify-between">
            {isDataLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary-900 animate-spin" />
              </div>
            ) : transformedTrendData.length > 0 ? (
              <div className="h-full flex flex-col gap-6">
                {/* Horizontal simple bars */}
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={transformedTrendData.slice(-6)}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <Tooltip
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                      />
                      <Bar dataKey="Total" fill="#0a1f44" radius={[4, 4, 0, 0]} name="Cases Count" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                
                <div className="text-center text-xs text-slate-400 italic">
                  Showing historical total crime volume trend (last 6 reporting periods).
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                No breakdown data available.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Temporal Trend Chart Panel */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 min-h-[380px] flex flex-col">
        <div className="mb-4">
          <h3 className="font-bold text-slate-900">Historical Trend Analytics</h3>
          <p className="text-xs text-slate-400 mt-0.5">Temporal patterns comparing multiple active crime types.</p>
        </div>

        <div className="h-[280px] w-full">
          {isDataLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-primary-900 animate-spin" />
            </div>
          ) : transformedTrendData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={transformedTrendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  {categoryColors.map((color, idx) => (
                    <linearGradient key={idx} id={`colorGrad_${idx}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.25}/>
                      <stop offset="95%" stopColor={color} stopOpacity={0}/>
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                
                {activeCategories.length > 0 ? (
                  activeCategories.map((cat, idx) => (
                    <Area
                      key={cat}
                      type="monotone"
                      dataKey={cat}
                      stackId="1"
                      stroke={categoryColors[idx % categoryColors.length]}
                      fill={`url(#colorGrad_${idx % categoryColors.length})`}
                      strokeWidth={2}
                      name={cat}
                    />
                  ))
                ) : (
                  <Area
                    type="monotone"
                    dataKey="Total"
                    stroke="#0a1f44"
                    fill="url(#colorGrad_0)"
                    strokeWidth={2}
                    name="Total Cases"
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
              No trend data available for current query.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
