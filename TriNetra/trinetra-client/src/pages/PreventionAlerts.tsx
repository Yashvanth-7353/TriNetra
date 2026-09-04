import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertOctagon, MapPin, Loader2, ShieldCheck, AlertTriangle, Eye, EyeOff,
  FileSearch, Network, MessageSquareText, X, ChevronRight,
  Database, Clock, Tags, Building2, TrendingUp, ArrowUpRight, CheckCircle2,
} from 'lucide-react';
import {
  fetchPreventionAlerts,
  fetchCaseFilters,
  sendEvidenceGraph,
  type PreventionAlert,
  type PreventionAlertsResponse,
  type EvidenceGraphResponse,
} from '../services/api';
import EvidenceGraph from '../components/EvidenceGraph';
import { useAuth } from '../context/AuthContext';

const SEVERITY_STYLES: Record<string, { chip: string; bar: string; text: string; soft: string }> = {
  HIGH: {
    chip: 'bg-red-50 text-red-600 border border-red-100',
    bar: 'bg-red-500',
    text: 'text-rose-500',
    soft: 'bg-red-50/70',
  },
  MEDIUM: {
    chip: 'bg-amber-50 text-amber-600 border border-amber-100',
    bar: 'bg-amber-500',
    text: 'text-amber-500',
    soft: 'bg-amber-50/60',
  },
  LOW: {
    chip: 'bg-sky-50 text-sky-600 border border-sky-100',
    bar: 'bg-sky-500',
    text: 'text-sky-500',
    soft: 'bg-sky-50/60',
  },
};

function severityOf(alert: PreventionAlert): 'HIGH' | 'MEDIUM' | 'LOW' {
  return alert.severity || alert.score?.level || 'MEDIUM';
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function PreventionAlerts() {
  const { profile } = useAuth();
  const isStatewide = !!profile && (profile.role === 'Analyst' || profile.role === 'Policymaker');

  const [districts, setDistricts] = useState<{ id: number; name: string }[]>([]);
  const [districtId, setDistrictId] = useState<number | undefined>(undefined);

  const [data, setData] = useState<PreventionAlertsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Evidence Graph modal state
  const [graphFor, setGraphFor] = useState<PreventionAlert | null>(null);
  const [graphData, setGraphData] = useState<EvidenceGraphResponse | null>(null);
  const [isGraphLoading, setIsGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState('');

  const loadAlerts = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetchPreventionAlerts(districtId);
      setData(res);
      setDismissed([]);
    } catch (err: unknown) {
      setError(messageOf(err) || 'Failed to load prevention alerts.');
    } finally {
      setIsLoading(false);
    }
  }, [districtId]);

  useEffect(() => {
    if (isStatewide) {
      fetchCaseFilters()
        .then((f) => setDistricts(f.districts || []))
        .catch(() => { /* filter list is optional UX */ });
    }
  }, [isStatewide]);

  useEffect(() => {
    // Fetch-on-mount effect: loading state must reset whenever the selected
    // jurisdiction changes; dismissing old results is handled inside loadAlerts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAlerts();
  }, [loadAlerts]);

  const openEvidenceGraph = async (alert: PreventionAlert) => {
    if (!alert.supporting_cases.length) return;
    setGraphFor(alert);
    setGraphData(null);
    setGraphError('');
    setIsGraphLoading(true);
    try {
      // Reuse the existing evidence-graph endpoint with a Pattern finding
      // built purely from the alert's validated, jurisdiction-scoped records.
      const finding = {
        category: 'Pattern Cluster',
        title: alert.title,
        description: alert.summary,
        strength: alert.confidence || 'medium',
        evidence_sources: alert.source_engines,
        data: {
          patterns: [
            {
              cluster_id: alert.alert_id,
              theme: alert.title,
              case_count: alert.supporting_case_count,
              date_range: alert.time_window?.recent || '',
              mo_tags: (alert.mo_tags || []).map((name) => ({ name })),
              cases: alert.supporting_cases.map((c) => ({
                case_id: c.case_id,
                crime_no: c.crime_no,
                date: c.crime_registered_date,
                district: c.district,
              })),
            },
          ],
        },
      };
      const result = await sendEvidenceGraph(finding);
      setGraphData(result);
    } catch (err: unknown) {
      setGraphError(messageOf(err) || 'Failed to build evidence graph.');
    } finally {
      setIsGraphLoading(false);
    }
  };

  const closeEvidenceGraph = () => {
    setGraphFor(null);
    setGraphData(null);
    setIsGraphLoading(false);
    setGraphError('');
  };

  const alerts = (data?.alerts || []).filter((a) => !dismissed.includes(a.alert_id));
  const analysis = data?.analysis;
  const jurisdiction = data?.jurisdiction;
  const scopeLabel = jurisdiction?.label || (profile?.district_name ? `${profile.district_name} district` : 'My Jurisdiction');

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
            AI-driven early warnings for emerging crime patterns in your jurisdiction.
          </p>
        </div>

        {/* Jurisdiction + optional district filter */}
        <div className="flex flex-col items-end gap-2">
          {jurisdiction && (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-primary-900 text-accent-500 border border-primary-800 shadow-sm">
              <MapPin className="w-3.5 h-3.5" />
              {jurisdiction.scope === 'state' ? 'State-wide · ' : ''}{scopeLabel}
            </span>
          )}
          {isStatewide && districts.length > 0 && (
            <select
              value={districtId ?? ''}
              onChange={(e) => setDistrictId(e.target.value ? Number(e.target.value) : undefined)}
              className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-900/20 cursor-pointer"
              title="Analyst/Policymaker scope selector"
            >
              <option value="">All Karnataka (state-wide)</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* What was actually analysed (evidence transparency strip) */}
      {!isLoading && data && analysis && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-600 flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Database className="w-3.5 h-3.5 text-slate-400" />
            {analysis.cases_reviewed} records reviewed (90-day look-back)
          </span>
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Tags className="w-3.5 h-3.5 text-slate-400" />
            {analysis.crime_categories_reviewed ?? 0} crime categories
          </span>
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            {analysis.stations_reviewed ?? 0} stations
          </span>
          {analysis.recent_window && (
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Recent: {analysis.recent_window}
            </span>
          )}
          {analysis.insufficient_history && (
            <span className="font-semibold text-amber-600">⚠ {analysis.history_note}</span>
          )}
          {analysis.forecast_note && (
            <span className="font-semibold text-slate-400 w-full sm:w-auto">{analysis.forecast_note}</span>
          )}
        </div>
      )}

      {/* Cards List */}
      <div className="flex flex-col gap-4">
        {isLoading ? (
          <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-primary-900 animate-spin" />
            <span className="text-sm font-semibold text-slate-500">
              Analysing crime records for emerging patterns...
            </span>
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-14 bg-white rounded-xl border border-slate-200 shadow-sm px-6">
            <ShieldCheck className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-900">No active prevention alerts</h3>
            <p className="text-slate-500 text-sm mt-1 max-w-lg mx-auto">
              {data?.message || 'Current crime data does not show a sufficiently strong emerging pattern within your jurisdiction.'}
            </p>
            <div className="mt-5 inline-flex flex-col sm:flex-row items-center justify-center gap-x-6 gap-y-1 text-[11px] font-semibold text-slate-400 bg-slate-50 border border-slate-100 rounded-xl px-5 py-3">
              <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" /> Data reviewed: {analysis?.cases_reviewed ?? 0} cases
              </span>
              <span className="flex items-center gap-1.5">
                <Tags className="w-3.5 h-3.5" /> {analysis?.crime_categories_reviewed ?? 0} crime categories
              </span>
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" /> {analysis?.stations_reviewed ?? 0} stations
              </span>
              {analysis?.recent_window && (
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Period: {analysis.recent_window}
                </span>
              )}
            </div>
          </div>
        ) : (
          alerts.map((alert) => {
            const severity = severityOf(alert);
            const s = SEVERITY_STYLES[severity] || SEVERITY_STYLES.MEDIUM;
            const isExpanded = expandedId === alert.alert_id;
            const hasCases = alert.supporting_cases.length > 0;
            const firstCrimeNo = alert.supporting_cases[0]?.crime_no;
            const alertTypeLabel =
              alert.alert_type === 'rising_activity' ? 'Rising Activity'
              : alert.alert_type === 'geographic_cluster' ? 'Geographic Concentration'
              : alert.alert_type === 'repeated_modus_operandi' ? 'Recurring Modus Operandi'
              : 'Forecast Warning';

            return (
              <div
                key={alert.alert_id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden relative group hover:border-slate-300 transition-all"
              >
                {/* Severity Ribbon */}
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${s.bar}`}></div>

                <div className="p-5 pl-7">
                  {/* Header */}
                  <div className="flex flex-wrap items-center gap-2 mb-2 pr-8">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${s.chip}`}>
                      {severity} Priority
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200">
                      {alertTypeLabel}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-auto">
                      Risk score {alert.score?.total ?? '—'}/100 · {alert.confidence} confidence
                    </span>
                  </div>

                  {/* Title + category */}
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-1">
                    <TrendingUp className={`w-4 h-4 ${s.text} shrink-0`} />
                    {alert.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 font-medium mb-3">
                    {alert.crime_category && (
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {alert.crime_category}
                        {alert.crime_group ? ` · ${alert.crime_group}` : ''}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-500">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {alert.location}
                    </span>
                    {alert.stations_affected?.length > 0 && (
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-500">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        {alert.stations_affected.length} station{alert.stations_affected.length > 1 ? 's' : ''} affected
                      </span>
                    )}
                  </div>

                  {/* Why this alert */}
                  <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 border border-slate-100 rounded-lg px-3.5 py-2.5 mb-3">
                    <span className="font-bold text-slate-700">Why: </span>
                    {alert.summary}
                  </p>

                  {/* Evidence bullets */}
                  <div className="flex flex-col gap-1.5 mb-3">
                    {alert.evidence.slice(0, isExpanded ? undefined : 4).map((ev, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <CheckCircle2 className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${s.text}`} />
                        <span className="text-slate-600">
                          <span className="font-bold text-slate-700">{ev.label}: </span>
                          {ev.value}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Tags */}
                  {(alert.mo_tags?.length > 0 || alert.source_engines?.length > 0) && (
                    <div className="flex flex-wrap items-center gap-1.5 mb-4">
                      {alert.mo_tags.map((t) => (
                        <span key={t} className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                          MO · {t}
                        </span>
                      ))}
                      <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider ml-1">
                        Sources: {alert.source_engines.join(', ')}
                      </span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : alert.alert_id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                    >
                      {isExpanded ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      {isExpanded ? 'Hide Evidence' : 'View Evidence'}
                      <span className="text-slate-400 font-semibold">
                        ({alert.supporting_case_count} FIR{alert.supporting_case_count === 1 ? '' : 's'})
                      </span>
                    </button>

                    {hasCases ? (
                      <Link
                        to={`/cases?search=${encodeURIComponent(firstCrimeNo)}`}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition"
                      >
                        <FileSearch className="w-3.5 h-3.5" />
                        View Cases
                        <ArrowUpRight className="w-3 h-3 text-slate-400" />
                      </Link>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold border border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed"
                        title="This alert is based on aggregate records, not individual FIRs"
                      >
                        <FileSearch className="w-3.5 h-3.5" />
                        View Cases
                      </span>
                    )}

                    {hasCases ? (
                      <button
                        onClick={() => openEvidenceGraph(alert)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-primary-900 text-accent-500 hover:bg-primary-800 transition cursor-pointer"
                      >
                        <Network className="w-3.5 h-3.5" />
                        Evidence Graph
                      </button>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-300 cursor-not-allowed"
                        title="No individual FIRs to link into a graph for this aggregate alert"
                      >
                        <Network className="w-3.5 h-3.5" />
                        Evidence Graph
                      </span>
                    )}

                    <a
                      href="/ask"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold border border-primary-200 bg-primary-50 text-primary-900 hover:bg-primary-100 transition"
                    >
                      <MessageSquareText className="w-3.5 h-3.5" />
                      Investigate
                    </a>

                    <button
                      onClick={() => setDismissed((p) => [...p, alert.alert_id])}
                      className="ml-auto inline-flex items-center gap-1 px-3 py-2 rounded-lg text-[11px] font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                      title="Acknowledge / dismiss for this session"
                    >
                      <X className="w-3.5 h-3.5" />
                      Acknowledge
                    </button>
                  </div>

                  {/* Expanded evidence panel */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-4">
                      {/* Supporting FIRs */}
                      <div>
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                          <FileSearch className="w-3.5 h-3.5" />
                          Supporting case records ({alert.supporting_cases.length} shown of {alert.supporting_case_count})
                        </h4>
                        {alert.supporting_cases.length > 0 ? (
                          <div className="flex flex-col divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                            {alert.supporting_cases.map((c) => (
                              <Link
                                key={c.case_id}
                                to={`/cases?search=${encodeURIComponent(c.crime_no)}`}
                                className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-4 py-2.5 hover:bg-slate-50 transition group"
                              >
                                <span className="font-mono text-xs font-bold text-primary-700 group-hover:underline">
                                  {c.crime_no}
                                </span>
                                <span className="text-[11px] text-slate-500 font-semibold sm:w-44 shrink-0">
                                  {c.crime_registered_date} · {c.police_station}
                                </span>
                                <span className="text-[11px] text-slate-400 flex-1 truncate">
                                  {c.brief_facts || '—'}
                                </span>
                                <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">
                            This alert is derived from aggregate monthly records — no individual FIR list is attached.
                          </p>
                        )}
                      </div>

                      {/* Recommended actions */}
                      {alert.recommended_actions?.length > 0 && (
                        <div>
                          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Recommended preventive actions
                          </h4>
                          <ul className="flex flex-col gap-1.5">
                            {alert.recommended_actions.map((action, i) => (
                              <li key={i} className="text-xs text-slate-600 flex items-start gap-2">
                                <ChevronRight className="w-3.5 h-3.5 text-slate-300 mt-0.5 shrink-0" />
                                {action}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Score breakdown (transparent) */}
                      {alert.score?.components && (
                        <div>
                          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                            Risk score breakdown ({alert.score.total}/100 — {alert.score.level})
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(alert.score.components).map(([key, comp]) => (
                              <span
                                key={key}
                                className="inline-flex items-center gap-1.5 text-[10px] font-semibold bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-slate-600"
                                title={comp.rule}
                              >
                                {key}: +{comp.points}
                                <span className="text-slate-400 font-normal hidden md:inline">({comp.rule})</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Evidence Graph Modal */}
      {graphFor && (
        <div
          className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
          onClick={closeEvidenceGraph}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <Network className="w-5 h-5 text-primary-900" />
                  Evidence Graph
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 max-w-xl">{graphFor.title}</p>
              </div>
              <button
                onClick={closeEvidenceGraph}
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
                aria-label="Close evidence graph"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-3 border-b border-slate-100 text-xs text-slate-500 shrink-0">
              {graphFor.summary}
            </div>

            <div className="relative flex-1 min-h-[380px]">
              {isGraphLoading && (
                <div className="absolute inset-0 bg-white/80 z-10 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-7 h-7 text-primary-900 animate-spin" />
                  <span className="text-xs font-semibold text-slate-500">Linking supporting FIRs and entities...</span>
                </div>
              )}
              {graphError && !isGraphLoading && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-red-600 px-8 text-center">
                  {graphError}
                </div>
              )}
              {graphData && !isGraphLoading && graphData.nodes.length > 0 && (
                <div className="h-full w-full" style={{ minHeight: 460 }}>
                  <EvidenceGraph
                    nodes={graphData.nodes}
                    edges={graphData.edges}
                    compact={false}
                  />
                </div>
              )}
              {graphData && !isGraphLoading && graphData.nodes.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 px-8 text-center">
                  No entity relationships could be derived for this alert's supporting records.
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500 shrink-0">
              <span>
                Sources: {(graphData?.sources || graphFor.source_engines).join(', ')} · Evidence strength:{' '}
                <span className="font-bold uppercase">{graphData?.evidence_strength || graphFor.confidence}</span>
              </span>
              <span className="font-semibold text-slate-400">
                {graphData ? `${graphData.nodes.length} entities · ${graphData.edges.length} relationships` : 'Building...'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
