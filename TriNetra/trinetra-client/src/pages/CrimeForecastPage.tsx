import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import {
  TrendingUp, TrendingDown, Minus, Radar, MapPin, AlertTriangle,
  RefreshCw, ChevronDown, Info, Activity, Calendar, Target,
  CheckCircle2
} from 'lucide-react';
import {
  Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend, Line, ReferenceLine,
  ComposedChart
} from 'recharts';
import {
  fetchCaseFilters, fetchForecast, fetchForecastSummary, fetchPredictiveHotspots,
  type FilterOption, type ForecastResponse, type ForecastSummaryCategory,
  type PredictiveHotspot
} from '../services/api';

const KARNATAKA_CENTER: [number, number] = [15.317277, 75.71389];

const HOTSPOT_COLORS: Record<string, string> = {
  predicted: '#dc2626',
  emerging: '#f59e0b',
  historical: '#2563eb',
  stable: '#6b7280',
};

const DIRECTION_ICONS: Record<string, any> = {
  increasing: TrendingUp,
  decreasing: TrendingDown,
  stable: Minus,
};

export default function CrimeForecastPage() {
  const [districts, setDistricts] = useState<FilterOption[]>([]);
  const [categories, setCategories] = useState<FilterOption[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [horizon, setHorizon] = useState<number>(3);

  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [summary, setSummary] = useState<ForecastSummaryCategory[]>([]);
  const [hotspots, setHotspots] = useState<PredictiveHotspot[]>([]);
  const [methodology, setMethodology] = useState<Record<string, string>>({});

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedSignal, setExpandedSignal] = useState<number | null>(null);

  useEffect(() => {
    async function loadFilters() {
      try {
        const filters = await fetchCaseFilters();
        setDistricts(filters.districts || []);
        setCategories(filters.categories || []);
      } catch (err) {
        console.error('Failed to load filters:', err);
      }
    }
    loadFilters();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const distId = selectedDistrict ? parseInt(selectedDistrict) : undefined;
      const catId = selectedCategory ? parseInt(selectedCategory) : undefined;

      const [forecastRes, summaryRes, hotspotRes] = await Promise.all([
        fetchForecast({ category_id: catId, district_id: distId, horizon }).catch(() => null),
        fetchForecastSummary({ district_id: distId, horizon }).catch(() => null),
        fetchPredictiveHotspots({ district_id: distId, category_id: catId, horizon }).catch(() => null),
      ]);

      if (forecastRes) setForecast(forecastRes);
      if (summaryRes?.categories) setSummary(summaryRes.categories);        if (hotspotRes) {
        setHotspots(hotspotRes.hotspots || []);
        setMethodology(hotspotRes.methodology || {});
      }
    } catch (err: any) {
      setError('Failed to load forecast data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDistrict, selectedCategory, horizon]);

  // Merge historical + forecast + baseline into a single chart dataset
  const chartData = useMemo(() => {
    if (!forecast?.historical) return [];
    const merged: Record<string, any> = {};

    for (const pt of forecast.historical) {
      merged[pt.month] = { month: pt.month, observed: pt.count };
    }
    for (const pt of forecast.forecast || []) {
      if (!merged[pt.month]) merged[pt.month] = { month: pt.month };
      merged[pt.month].forecast = pt.forecast;
      merged[pt.month].lower = pt.lower;
      merged[pt.month].upper = pt.upper;
    }
    for (const pt of forecast.baseline || []) {
      if (!merged[pt.month]) merged[pt.month] = { month: pt.month };
      merged[pt.month].baseline = pt.count;
    }
    return Object.values(merged);
  }, [forecast]);

  // Find the split point for reference line
  const splitMonth = useMemo(() => {
    if (!forecast?.historical?.length) return '';
    return forecast.historical[forecast.historical.length - 1].month;
  }, [forecast]);

  // Hotspot counts for the legend
  const hotspotTypeCounts = useMemo(() => {
    const counts: Record<string, number> = { predicted: 0, emerging: 0, historical: 0, stable: 0 };
    for (const h of hotspots) {
      counts[h.hotspot_type] = (counts[h.hotspot_type] || 0) + 1;
    }
    return counts;
  }, [hotspots]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto flex flex-col gap-8 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Radar className="w-7 h-7 text-primary-900" />
            Predictive Crime Radar
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Data-driven crime forecasting using historical temporal patterns · Holt-Winters exponential smoothing
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg shadow-sm transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-4">
        <div className="flex flex-col gap-1 min-w-[200px] flex-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">District</label>
          <select
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-400/20 focus:border-primary-400 outline-none transition-all"
          >
            <option value="">All Districts (Statewide)</option>
            {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1 min-w-[200px] flex-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Crime Category</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-400/20 focus:border-primary-400 outline-none transition-all"
          >
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1 min-w-[150px] flex-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Forecast Horizon</label>
          <select
            value={horizon}
            onChange={(e) => setHorizon(parseInt(e.target.value))}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-400/20 focus:border-primary-400 outline-none transition-all"
          >
            <option value={1}>1 Month</option>
            <option value={3}>3 Months</option>
            <option value={6}>6 Months</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Data Unavailable Banner */}
      {forecast?.status === 'unavailable' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0" />
          <span>
            <strong>Forecast unavailable:</strong> {forecast.reason || 'Insufficient historical data for this category/district.'}
          </span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <KPISkeleton key={i} />)
        ) : (
          <>
            <KPICard
              title="Model"
              value={forecast?.model?.split(' ').slice(0, 2).join(' ') || 'N/A'}
              icon={Activity}
              color="text-primary-600"
              bg="bg-primary-50"
            />
            <KPICard
              title="Forecast Horizon"
              value={`${horizon} month${horizon > 1 ? 's' : ''}`}
              icon={Calendar}
              color="text-blue-600"
              bg="bg-blue-50"
            />
            <KPICard
              title="Data Points"
              value={forecast?.data_sufficiency?.total_months?.toString() || '0'}
              subtitle={forecast?.data_sufficiency?.sufficient ? 'Sufficient' : 'Limited'}
              icon={CheckCircle2}
              color={forecast?.data_sufficiency?.sufficient ? 'text-emerald-600' : 'text-amber-600'}
              bg={forecast?.data_sufficiency?.sufficient ? 'bg-emerald-50' : 'bg-amber-50'}
            />
            <KPICard
              title="Model MAPE"
              value={forecast?.evaluation?.model_mape != null ? `${forecast.evaluation.model_mape}%` : 'N/A'}
              subtitle={
                forecast?.evaluation?.improvement_mae != null
                  ? `${forecast.evaluation.improvement_mae > 0 ? '+' : ''}${forecast.evaluation.improvement_mae}% vs baseline`
                  : undefined
              }
              icon={Target}
              color="text-violet-600"
              bg="bg-violet-50"
            />
          </>
        )}
      </div>

      {/* Main Forecast Chart */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          Crime Volume Forecast — {forecast?.category || 'All Categories'}
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Observed historical data with Holt-Winters forecast and seasonal naive baseline comparison
        </p>
        <div className="h-[350px]">
          <ChartLoader isLoading={isLoading}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorObserved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#dc2626" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RechartsTooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(value: any, name: any) => {
                    if (name === 'lower' || name === 'upper') return ['—', ''];
                    const labels: Record<string, string> = {
                      observed: 'Observed',
                      forecast: 'Forecast',
                      baseline: 'Seasonal Naive',
                    };
                    return [Math.round(Number(value)), labels[name] || name];
                  }}
                />
                <Legend />
                {splitMonth && (
                  <ReferenceLine
                    x={splitMonth}
                    stroke="#94a3b8"
                    strokeDasharray="4 4"
                    label={{ value: 'Now', position: 'top', fontSize: 10, fill: '#94a3b8' }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="observed"
                  stroke="#2563eb"
                  fillOpacity={1}
                  fill="url(#colorObserved)"
                  strokeWidth={2}
                  dot={false}
                  name="Observed"
                />
                <Area
                  type="monotone"
                  dataKey="forecast"
                  stroke="#dc2626"
                  fillOpacity={1}
                  fill="url(#colorForecast)"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  name="Forecast"
                />
                <Line
                  type="monotone"
                  dataKey="baseline"
                  stroke="#9ca3af"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  name="Seasonal Naive"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartLoader>
        </div>
      </div>

      {/* Signals + Evaluation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Forecast Signals */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-500" />
            Forecast Signals
          </h2>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 bg-slate-100 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : forecast?.signals && forecast.signals.length > 0 ? (
            <div className="space-y-3">
              {forecast.signals.map((sig, i) => (
                <div
                  key={i}
                  className="bg-slate-50 rounded-lg p-3 border border-slate-100 cursor-pointer hover:bg-slate-100 transition"
                  onClick={() => setExpandedSignal(expandedSignal === i ? null : i)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-800">{sig.label || sig.signal}</span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedSignal === i ? 'rotate-180' : ''}`} />
                  </div>
                  {expandedSignal === i && (
                    <p className="text-xs text-slate-600 mt-2 leading-relaxed">{sig.description}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No signals extracted.</p>
          )}
        </div>

        {/* Model Evaluation */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-violet-500" />
            Model Evaluation
          </h2>
          {isLoading ? (
            <div className="h-40 bg-slate-100 animate-pulse rounded-lg" />
          ) : forecast?.evaluation && Object.keys(forecast.evaluation).length > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <EvalCard label="Model MAE" value={forecast.evaluation.model_mae} />
                <EvalCard label="Baseline MAE" value={forecast.evaluation.baseline_mae} />
                <EvalCard label="Model MAPE" value={forecast.evaluation.model_mape} suffix="%" />
                <EvalCard label="Baseline MAPE" value={forecast.evaluation.baseline_mape} suffix="%" />
                <EvalCard label="Model RMSE" value={forecast.evaluation.model_rmse} />
                <EvalCard label="Baseline RMSE" value={forecast.evaluation.baseline_rmse} />
              </div>
              {forecast.evaluation.improvement_mae != null && (
                <div className={`text-center py-2 rounded-lg text-sm font-semibold ${
                  forecast.evaluation.improvement_mae > 0
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  {forecast.evaluation.improvement_mae > 0 ? '▲' : '▼'}{' '}
                  {Math.abs(forecast.evaluation.improvement_mae)}% MAE improvement over baseline
                </div>
              )}
              <div className="text-xs text-slate-500 text-center">
                Training: {forecast.evaluation.train_months} months · Test: {forecast.evaluation.test_months} months (chronological split)
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Evaluation not available for this configuration.</p>
          )}
        </div>
      </div>

      {/* Category Summary Table */}
      {!selectedCategory && summary.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-slate-500" />
            Category Forecast Summary ({horizon}-month horizon)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-left">
                  <th className="py-2 px-3 font-semibold">Category</th>
                  <th className="py-2 px-3 font-semibold text-right">Current Avg/mo</th>
                  <th className="py-2 px-3 font-semibold text-right">Forecast Avg/mo</th>
                  <th className="py-2 px-3 font-semibold text-center">Direction</th>
                  <th className="py-2 px-3 font-semibold text-right">MAPE</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((cat) => {
                  const DirIcon = DIRECTION_ICONS[cat.direction] || Minus;
                  return (
                    <tr key={cat.category_id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                      <td className="py-2.5 px-3 font-medium text-slate-800">{cat.category}</td>
                      <td className="py-2.5 px-3 text-right text-slate-600">{cat.current_monthly_avg}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{cat.forecast_avg}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                          cat.direction === 'increasing' ? 'bg-red-50 text-red-600' :
                          cat.direction === 'decreasing' ? 'bg-emerald-50 text-emerald-600' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          <DirIcon className="w-3 h-3" />
                          {cat.direction}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-500 text-xs">
                        {cat.model_mape != null ? `${cat.model_mape}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Predictive Hotspot Map */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col min-h-[450px]">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-red-500" />
            Predictive Hotspot Map
          </h2>
          <div className="flex-1 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 relative">
            <ChartLoader isLoading={isLoading}>
              <MapContainer center={KARNATAKA_CENTER} zoom={6} className="w-full h-full absolute inset-0 z-0">
                <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                {hotspots.filter(h => h.avg_lat && h.avg_lng).map((h) => (
                  <CircleMarker
                    key={h.district_id}
                    center={[h.avg_lat!, h.avg_lng!]}
                    radius={Math.max(6, Math.min(18, h.score / 5))}
                    fillColor={HOTSPOT_COLORS[h.hotspot_type] || '#6b7280'}
                    fillOpacity={0.65}
                    stroke={true}
                    color="#ffffff"
                    weight={2}
                  >
                    <Popup>
                      <div className="text-xs min-w-[180px]">
                        <div className="font-bold text-slate-800 text-sm mb-1">{h.district_name}</div>
                        <div className="flex items-center gap-1 mb-2">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: HOTSPOT_COLORS[h.hotspot_type] }}
                          />
                          <span className="font-semibold capitalize">{h.hotspot_type} Hotspot</span>
                          <span className="text-slate-400">· Score {h.score}</span>
                        </div>
                        <div className="space-y-1 text-slate-600">
                          <div>Total: {h.total_cases} cases</div>
                          <div>Recent 3mo avg: {h.recent_3mo_avg}/mo</div>
                          <div>Baseline avg: {h.baseline_avg}/mo</div>
                          <div>Forecast avg: {h.forecast_avg}/mo</div>
                        </div>
                        {h.signals?.[0] && (
                          <div className="mt-2 pt-2 border-t border-slate-200 text-slate-500">
                            {h.signals[0].description}
                          </div>
                        )}
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </ChartLoader>
          </div>
        </div>

        {/* Hotspot Legend & List */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col max-h-[450px]">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-slate-500" />
            Hotspot Classification
          </h2>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mb-4">
            {Object.entries(HOTSPOT_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                <span className="capitalize font-medium">{type}</span>
                <span className="text-slate-400">({hotspotTypeCounts[type] || 0})</span>
              </div>
            ))}
          </div>

          {/* Methodology */}
          {methodology && Object.keys(methodology).length > 0 && (
            <div className="bg-slate-50 rounded-lg p-3 mb-4 border border-slate-100">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Methodology</div>
              <div className="space-y-1.5 text-xs text-slate-600">
                {Object.entries(methodology).map(([key, desc]) => (
                  <div key={key}>
                    <span className="font-semibold text-slate-700 capitalize">{key.replace(/_/g, ' ')}:</span>{' '}
                    {desc}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hotspot list */}
          <div className="overflow-y-auto flex-1 space-y-2">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 bg-slate-100 animate-pulse rounded-lg" />
              ))
            ) : hotspots.length > 0 ? (
              hotspots.slice(0, 15).map((h) => (
                <div
                  key={h.district_id}
                  className="bg-slate-50 rounded-lg p-3 border border-slate-100 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: HOTSPOT_COLORS[h.hotspot_type] }}
                    />
                    <div>
                      <div className="text-sm font-medium text-slate-800">{h.district_name}</div>
                      <div className="text-xs text-slate-500 capitalize">{h.hotspot_type}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-slate-700">Score {h.score}</div>
                    <div className="text-[10px] text-slate-400">×{h.predicted_ratio} forecast</div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500 text-center py-4">No hotspot data available.</p>
            )}
          </div>
        </div>
      </div>

      {/* Limitations */}
      {forecast?.limitations && forecast.limitations.length > 0 && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Data Limitations & Caveats
          </h2>
          <ul className="text-xs text-slate-600 space-y-1">
            {forecast.limitations.map((lim, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-slate-400 mt-0.5">•</span>
                {lim}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function KPICard({ title, value, subtitle, icon: Icon, color, bg }: any) {
  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
      <div className={`w-12 h-12 ${bg} ${color} rounded-xl flex items-center justify-center shrink-0`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</div>
        <div className="text-xl font-black text-slate-900 mt-0.5 truncate max-w-[140px]">
          {value || '...'}
        </div>
        {subtitle && (
          <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>
        )}
      </div>
    </div>
  );
}

function EvalCard({ label, value, suffix = '' }: { label: string; value?: number; suffix?: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
      <div className="text-[10px] font-bold text-slate-400 uppercase">{label}</div>
      <div className="text-lg font-bold text-slate-800 mt-0.5">
        {value != null ? `${value}${suffix}` : '—'}
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

function ChartLoader({ isLoading, children, className = 'h-full' }: { isLoading: boolean; children: React.ReactNode; className?: string }) {
  if (isLoading) return <div className={`w-full ${className} bg-slate-100 animate-pulse rounded-lg`} />;
  return <>{children}</>;
}


