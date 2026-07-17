import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { MapPin, TrendingUp, AlertTriangle, Calendar, Shield, RefreshCw, BarChart2, Clock, Users, DollarSign, Activity } from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  BarChart, Bar, Legend, PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import {
  fetchCaseFilters,
  fetchAnalyticsSummary,
  fetchAnalyticsGeographic,
  fetchAnalyticsTrendsAdvanced,
  fetchAnalyticsCategorical,
  fetchAnalyticsLifecycle,
  fetchAnalyticsReportingLag,
  fetchAnalyticsDemographics,
  type FilterOption
} from '../services/api';

const KARNATAKA_CENTER: [number, number] = [15.317277, 75.71389];
const COLORS = ['#2563eb', '#16a34a', '#e11d48', '#ca8a04', '#9333ea', '#0891b2', '#ea580c'];

export default function CrimeAnalytics() {
  // Filter states
  const [districts, setDistricts] = useState<FilterOption[]>([]);
  const [categories, setCategories] = useState<FilterOption[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedTimeWindow, setSelectedTimeWindow] = useState<string>('12m');

  // Data states
  const [summary, setSummary] = useState<any>(null);
  const [geoData, setGeoData] = useState<any>(null);
  const [trendsData, setTrendsData] = useState<any>(null);
  const [categoricalData, setCategoricalData] = useState<any>(null);
  const [lifecycleData, setLifecycleData] = useState<any>(null);
  const [lagData, setLagData] = useState<any>(null);
  const [demographicsData, setDemographicsData] = useState<any>(null);

  const [isLoading, setIsLoading] = useState(true);
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
      }
    }
    loadFilters();
  }, []);

  // Fetch all metrics
  const loadAnalyticsData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const params = {
        district_id: selectedDistrict ? parseInt(selectedDistrict) : undefined,
        category_id: selectedCategory ? parseInt(selectedCategory) : undefined,
        time_window: selectedTimeWindow || undefined,
      };

      const [
        sumRes, geoRes, trendRes, catRes, lifeRes, finRes, demRes
      ] = await Promise.all([
        fetchAnalyticsSummary(params).catch(() => null),
        fetchAnalyticsGeographic(params).catch(() => null),
        fetchAnalyticsTrendsAdvanced(params).catch(() => null),
        fetchAnalyticsCategorical(params).catch(() => null),
        fetchAnalyticsLifecycle(params).catch(() => null),
        fetchAnalyticsReportingLag(params).catch(() => null),
        fetchAnalyticsDemographics(params).catch(() => null)
      ]);

      if (sumRes) setSummary(sumRes);
      if (geoRes) setGeoData(geoRes);
      if (trendRes) setTrendsData(trendRes);
      if (catRes) setCategoricalData(catRes);
      if (lifeRes) setLifecycleData(lifeRes);
      if (finRes) setLagData(finRes);
      if (demRes) setDemographicsData(demRes);

    } catch (err: any) {
      setError('Failed to fetch crime analytics data entirely.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAnalyticsData();
  }, [selectedDistrict, selectedCategory, selectedTimeWindow]);

  const yoyTransformed = useMemo(() => {
    if (!trendsData?.yoy) return { data: [], years: [] };
    const map: Record<string, any> = {};
    const yearSet = new Set<string>();
    trendsData.yoy.forEach((item: any) => {
      if (!map[item.category]) map[item.category] = { category: item.category };
      map[item.category][item.year.toString()] = item.count;
      yearSet.add(item.year.toString());
    });
    return { data: Object.values(map), years: Array.from(yearSet).sort() };
  }, [trendsData]);

  const demoTransformed = useMemo(() => {
    if (!demographicsData?.victims) return { data: [], genders: [] };
    const map: Record<string, any> = {};
    const genderSet = new Set<string>();
    demographicsData.victims.forEach((item: any) => {
      if (!map[item.age_band]) map[item.age_band] = { age_band: item.age_band };
      map[item.age_band][item.gender] = item.count;
      genderSet.add(item.gender);
    });
    return { data: Object.values(map), genders: Array.from(genderSet).sort() };
  }, [demographicsData]);


  return (
    <div className="p-6 max-w-[1400px] mx-auto flex flex-col gap-8 min-h-screen">
      {/* Header Row */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart2 className="w-7 h-7 text-primary-900" />
            Crime Analytics Control Board
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Full-spectrum multi-dimensional intelligence dashboard.
          </p>
        </div>
        <button
          onClick={loadAnalyticsData}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg shadow-sm transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Live
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-4">
        <div className="flex flex-col gap-1 min-w-[200px] flex-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">District</label>
          <select
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          >
            <option value="">All Districts (Statewide)</option>
            {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1 min-w-[200px] flex-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Category</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          >
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1 min-w-[150px] flex-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Time Window</label>
          <select
            value={selectedTimeWindow}
            onChange={(e) => setSelectedTimeWindow(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          >
            <option value="3m">Last 3 Months</option>
            <option value="6m">Last 6 Months</option>
            <option value="12m">Last 12 Months</option>
            <option value="">All Time</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {isLoading ? Array.from({length: 5}).map((_, i) => <KPISkeleton key={i} />) : (
          <>
            <KPICard title="Total Active Cases" value={summary?.total_cases?.toLocaleString()} icon={TrendingUp} color="text-primary-600" bg="bg-primary-50" />
            <KPICard title="MoM Case Vol." value={summary?.biggest_mom_change} icon={Calendar} color="text-rose-600" bg="bg-rose-50" />
            <KPICard title="Arrest Rate" value={`${summary?.arrest_rate || 0}%`} icon={Shield} color="text-emerald-600" bg="bg-emerald-50" />
            <KPICard title="Avg Days to CS" value={summary?.avg_days_to_chargesheet || 0} icon={Clock} color="text-amber-600" bg="bg-amber-50" />
            <KPICard title="Highest Activity" value={summary?.highest_activity_district || 'N/A'} icon={MapPin} color="text-violet-600" bg="bg-violet-50" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Geographic Section */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col min-h-[450px]">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-slate-500" /> Statewide Hotspot Density
          </h2>
          <div className="flex-1 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 relative">
            <ChartLoader isLoading={isLoading}><MapContainer center={KARNATAKA_CENTER} zoom={6} className="w-full h-full absolute inset-0 z-0">
              <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
              {geoData?.grid?.map((pt: any, i: number) => (
                <CircleMarker
                  key={i}
                  center={[pt.lat, pt.lng]}
                  radius={6}
                  fillColor={pt.trend === 'up' ? '#e11d48' : '#ca8a04'}
                  fillOpacity={0.6}
                  stroke={true}
                  color="#ffffff"
                  weight={1}
                >
                  <Popup>
                    <div className="text-xs">
                      <div className="font-bold text-slate-800">{pt.crime_no}</div>
                      <div className="text-slate-600 mt-1 max-w-[200px] whitespace-normal line-clamp-3">
                        {pt.brief_facts}
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer></ChartLoader>
          </div>
        </div>

        {/* District Rankings */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col max-h-[450px]">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-slate-500" /> District Rankings
          </h2>
          <div className="overflow-y-auto flex-1 pr-2 space-y-3 custom-scrollbar">
            {isLoading ? Array.from({length: 4}).map((_, i) => <div key={i} className="h-16 bg-slate-100 animate-pulse rounded-lg" />) : 
              geoData?.rankings?.map((d: any, idx: number) => (
              <div key={d.id} className="bg-slate-50 rounded-lg p-3 border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-slate-800">{idx + 1}. {d.name}</div>
                  <div className="text-xs text-slate-500">{d.total.toLocaleString()} total</div>
                </div>
                <div className="w-24 h-10">
                  <ChartLoader isLoading={isLoading}><ResponsiveContainer width="100%" height="100%">
                    <LineChart data={d.sparkline}>
                      <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer></ChartLoader>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Temporal YoY Trends */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-lg font-bold text-slate-800 mb-4">YoY Category Comparison</h2>
          <div className="h-[300px]">
            <ChartLoader isLoading={isLoading}><ResponsiveContainer width="100%" height="100%">
              <BarChart data={yoyTransformed.data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="category" tick={{fontSize: 12}} />
                <YAxis tick={{fontSize: 12}} />
                <RechartsTooltip />
                <Legend />
                {yoyTransformed.years.map((year, i) => (
                  <Bar key={year} dataKey={year} fill={COLORS[i % COLORS.length]} radius={[4,4,0,0]} />
                ))}
              </BarChart>
            </ResponsiveContainer></ChartLoader>
          </div>
        </div>

        {/* Monthly Volume Trend */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-lg font-bold text-slate-800 mb-4 text-blue-600 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" /> Statewide Monthly Registration Trend
          </h2>
          <div className="h-[300px]">
            <ChartLoader isLoading={isLoading}><ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendsData?.monthly_trend || []}>
                <defs>
                  <linearGradient id="colorAna" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{fontSize: 12}} />
                <YAxis tick={{fontSize: 12}} />
                <RechartsTooltip />
                <Area type="monotone" dataKey="count" stroke="#2563eb" fillOpacity={1} fill="url(#colorAna)" />
              </AreaChart>
            </ResponsiveContainer></ChartLoader>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Categorical Donuts */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Crime Head Distribution</h2>
          <div className="h-[250px]">
            <ChartLoader isLoading={isLoading}><ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoricalData?.heads || []} innerRadius={40} outerRadius={70} dataKey="value" nameKey="name" cx="50%" cy="50%">
                  {(categoricalData?.heads || []).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <RechartsTooltip />
                <Legend layout="horizontal" verticalAlign="bottom" wrapperStyle={{ fontSize: '10px' }} />
              </PieChart>
            </ResponsiveContainer></ChartLoader>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Gravity Split</h2>
          <div className="h-[250px]">
            <ChartLoader isLoading={isLoading}><ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoricalData?.gravity || []} innerRadius={0} outerRadius={80} dataKey="value" nameKey="name" cx="50%" cy="50%">
                  {(categoricalData?.gravity || []).map((_: any, i: number) => <Cell key={i} fill={['#ef4444', '#f59e0b', '#3b82f6'][i%3]} />)}
                </Pie>
                <RechartsTooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer></ChartLoader>
          </div>
        </div>

        {/* Top MO Tags */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Top Modus Operandi</h2>
          <div className="h-[250px]">
            <ChartLoader isLoading={isLoading}><ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoricalData?.mo_tags || []} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 11}} />
                <RechartsTooltip />
                <Bar dataKey="count" fill="#8b5cf6" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer></ChartLoader>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lifecycle Funnel (Using BarChart as proxy) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Case Lifecycle Status</h2>
          <div className="h-[250px]">
            <ChartLoader isLoading={isLoading}><ResponsiveContainer width="100%" height="100%">
              <BarChart data={lifecycleData?.funnel ? [...lifecycleData.funnel].sort((a:any, b:any)=>b.value-a.value) : []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{fontSize: 11}} />
                <YAxis />
                <RechartsTooltip />
                <Bar dataKey="value" fill="#0f766e" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer></ChartLoader>
          </div>
        </div>

        {/* Reporting Lag */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-600" /> FIR Reporting Lag (Incident to Reg)
          </h2>
          <div className="h-[250px]">
            <ChartLoader isLoading={isLoading}><ResponsiveContainer width="100%" height="100%">
              <BarChart data={lagData?.lag || []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="bucket" tick={{fontSize: 11}} />
                <YAxis />
                <RechartsTooltip />
                <Bar dataKey="count" fill="#d97706" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer></ChartLoader>
          </div>
        </div>
      </div>

      {/* Demographics Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-slate-500" /> Victim Socio-Demographics
          </h2>
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
            Privacy Filter: Groups with n &lt; 10 are redacted.
          </span>
        </div>
        <div className="h-[300px]">
          <ChartLoader isLoading={isLoading}><ResponsiveContainer width="100%" height="100%">
            <BarChart data={demoTransformed.data} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" />
              <YAxis dataKey="age_band" type="category" width={80} tick={{fontSize: 12}} />
              <RechartsTooltip />
              <Legend />
              {demoTransformed.genders.map((gender, i) => (
                <Bar key={gender} dataKey={gender} stackId="a" fill={COLORS[i % COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer></ChartLoader>
        </div>
      </div>

    </div>
  );
}

function KPICard({ title, value, icon: Icon, color, bg }: any) {
  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
      <div className={`w-12 h-12 ${bg} ${color} rounded-xl flex items-center justify-center shrink-0`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</div>
        <div className="text-xl font-black text-slate-900 mt-0.5 truncate max-w-[120px]">
          {value || '...'}
        </div>
      </div>
    </div>
  );
}


function KPISkeleton() {
  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 animate-pulse">
      <div className="w-12 h-12 bg-slate-200 rounded-xl shrink-0" />
      <div className="flex flex-col gap-2 flex-1">
        <div className="h-3 bg-slate-200 rounded w-24" />
        <div className="h-5 bg-slate-200 rounded w-16" />
      </div>
    </div>
  );
}

function ChartLoader({ isLoading, children, className = "h-full" }: { isLoading: boolean, children: React.ReactNode, className?: string }) {
  if (isLoading) return <div className={`w-full ${className} bg-slate-100 animate-pulse rounded-lg`} />;
  return <>{children}</>;
}
