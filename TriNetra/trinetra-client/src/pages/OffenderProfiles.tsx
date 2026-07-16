import React, { useState, useEffect } from 'react';
import { ShieldAlert, Info, User, Search, ChevronDown, ChevronUp, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { fetchOffendersList, type OffenderProfile } from '../services/api';
import { cn } from '../lib/utils';

type SortKey = 'name' | 'prior_case_count' | 'score' | 'repeat_offender';
type SortOrder = 'asc' | 'desc';

export default function OffenderProfiles() {
  // List states
  const [offenders, setOffenders] = useState<OffenderProfile[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Interactive UI states
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  
  // Loading & error states
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Load offender profiles
  const loadOffenders = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetchOffendersList(searchTerm || undefined, page, pageSize);
      if (response.status === 'success') {
        setOffenders(response.offenders || []);
        setTotalCount(response.total || 0);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch offender profiles.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOffenders();
  }, [page, searchTerm]);

  // Handle local sorting of the loaded chunk (for instantaneous response)
  const sortedOffenders = [...offenders].sort((a, b) => {
    if (sortKey === 'prior_case_count') {
      const aVal = a.factors?.prior_case_count || 0;
      const bVal = b.factors?.prior_case_count || 0;
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    }

    const aVal = a[sortKey as keyof OffenderProfile] ?? '';
    const bVal = b[sortKey as keyof OffenderProfile] ?? '';

    if (typeof aVal === 'string') {
      return sortOrder === 'asc' 
        ? (aVal as string).localeCompare(bVal as string) 
        : (bVal as string).localeCompare(aVal as string);
    }

    return sortOrder === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  };

  // Plain-English translations of factors for explainable AI
  const translateFactors = (factors: OffenderProfile['factors']) => {
    const list: string[] = [];
    if (factors.prior_case_count !== undefined) {
      list.push(
        `Frequency Factor: The offender has been registered in ${factors.prior_case_count} prior criminal cases, contributing ${factors.contribution_prior_cases || 0} points to the risk level.`
      );
    }
    if (factors.heinous_case_count && factors.heinous_case_count > 0) {
      list.push(
        `Severity Factor: Involved in ${factors.heinous_case_count} heinous/violent offense classifications, which adds a heavy severity weight of ${factors.contribution_heinous || 0} points.`
      );
    } else {
      list.push(`Severity Factor: No severe or heinous physical crime records found in historical context.`);
    }
    if (factors.most_recent_case_days_ago !== undefined) {
      list.push(
        `Recency & Recidivism Factor: The last offense was committed ${factors.most_recent_case_days_ago} days ago, reflecting an active recidivism risk addition of ${factors.contribution_recency || 0} points.`
      );
    }
    return list;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto flex flex-col gap-6 min-h-screen">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ShieldAlert className="w-7 h-7 text-primary-900" />
          Offender Profiles & Recidivism Risk
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Explainable AI (XAI) risk scores and safety factor summaries for active suspects.
        </p>
      </div>

      {/* Search and Metadata strip */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-center gap-4">
        {/* Search */}
        <div className="relative w-full md:max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            placeholder="Search offender by name or ID..."
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-900"
          />
        </div>

        {/* Counter */}
        <div className="text-sm font-semibold text-slate-500 shrink-0">
          Showing <span className="text-primary-900">{sortedOffenders.length}</span> of{' '}
          <span className="text-primary-900">{totalCount.toLocaleString()}</span> registered profiles
        </div>
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Results Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {/* Profile Header */}
              <th
                onClick={() => handleSort('name')}
                className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/70 select-none"
              >
                Profile Name {sortKey === 'name' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
              </th>
              {/* Prior Case Count Header */}
              <th
                onClick={() => handleSort('prior_case_count')}
                className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/70 select-none"
              >
                Priors Count {sortKey === 'prior_case_count' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
              </th>
              {/* Risk Score Header */}
              <th
                onClick={() => handleSort('score')}
                className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/70 select-none"
              >
                Risk Score {sortKey === 'score' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
              </th>
              {/* Repeat Offender Flag Header */}
              <th
                onClick={() => handleSort('repeat_offender')}
                className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/70 select-none"
              >
                Repeat Flag {sortKey === 'repeat_offender' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right select-none">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="p-12 text-center">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-8 h-8 text-primary-900 animate-spin" />
                    <span className="text-sm font-semibold text-slate-500">Querying Risk Engine...</span>
                  </div>
                </td>
              </tr>
            ) : sortedOffenders.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-12 text-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mx-auto mb-4">
                    <User className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">No profiles found</h3>
                  <p className="text-slate-500 text-sm max-w-sm mx-auto">
                    Try adjusting your search criteria or type another offender name.
                  </p>
                </td>
              </tr>
            ) : (
              sortedOffenders.map((offender) => {
                const isExpanded = expandedRow === offender.accused_id;
                const scoreColorClass =
                  offender.score >= 80 
                    ? 'text-rose-600' 
                    : offender.score >= 55 
                    ? 'text-amber-600' 
                    : 'text-emerald-600';
                
                const barColorClass =
                  offender.score >= 80 
                    ? 'bg-rose-500' 
                    : offender.score >= 55 
                    ? 'bg-amber-500' 
                    : 'bg-emerald-500';

                return (
                  <React.Fragment key={offender.accused_id}>
                    {/* Main Row */}
                    <tr
                      onClick={() => setExpandedRow(isExpanded ? null : offender.accused_id)}
                      className={cn(
                        "hover:bg-slate-50 cursor-pointer transition-colors border-l-4",
                        isExpanded ? "bg-slate-50/50 border-l-primary-900" : "border-l-transparent"
                      )}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                            <User className="w-4.5 h-4.5" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">
                              {offender.name}
                            </div>
                            <div className="text-xs text-slate-400">ID: #{offender.accused_id}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className="text-sm font-semibold text-slate-700">
                          {offender.factors?.prior_case_count ?? 0}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className={cn("text-sm font-bold", scoreColorClass)}>
                            {offender.score.toFixed(0)}/100
                          </span>
                          <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                            <div
                              className={cn("h-full rounded-full", barColorClass)}
                              style={{ width: `${offender.score}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-sm">
                        <span
                          className={cn(
                            "px-2.5 py-0.5 rounded-full text-xs font-semibold",
                            offender.repeat_offender
                              ? 'bg-red-50 text-red-600 border border-red-100'
                              : 'bg-slate-50 text-slate-500 border border-slate-200'
                          )}
                        >
                          {offender.repeat_offender ? 'Repeat Offender' : 'First Offense'}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <button className="text-slate-400 hover:text-primary-900 transition-colors">
                          {isExpanded ? <ChevronUp className="w-5 h-5 inline" /> : <ChevronDown className="w-5 h-5 inline" />}
                        </button>
                      </td>
                    </tr>

                    {/* Explanatory Dropdown Row */}
                    {isExpanded && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={5} className="px-8 py-5 border-l-4 border-l-primary-900">
                          <div className="flex flex-col gap-4 max-w-4xl">
                            {/* AI Summary and Explanatory factors */}
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col gap-4">
                              <div className="flex items-center gap-2 text-primary-950 font-bold text-sm">
                                <Sparkles className="w-4 h-4 text-accent-500 animate-pulse" />
                                TriNetra Explainable AI (XAI) Insight
                              </div>

                              <div className="text-sm text-slate-600 leading-relaxed">
                                The computed recidivism risk score of{' '}
                                <strong className={scoreColorClass}>{offender.score.toFixed(0)}/100</strong>{' '}
                                is generated by aggregating prior frequency, criminal history severity, and recency of
                                offending behavior:
                              </div>

                              <div className="border-t border-slate-100 pt-3 flex flex-col gap-2.5">
                                {translateFactors(offender.factors).map((factorText, idx) => (
                                  <div key={idx} className="flex items-start gap-2.5 text-sm text-slate-700">
                                    <span className="w-1.5 h-1.5 rounded-full bg-accent-500 mt-2 shrink-0"></span>
                                    <span>{factorText}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Metadata */}
                            <div className="text-[11px] text-slate-400 flex items-center gap-1.5 justify-end">
                              <Info className="w-3.5 h-3.5 text-slate-400" />
                              Last recalculated: {new Date(offender.computed_date).toLocaleString()}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination Controls */}
        {!isLoading && totalCount > pageSize && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center gap-4">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3.5 py-1.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg shadow-xs hover:bg-slate-50 disabled:opacity-50 transition cursor-pointer"
            >
              Previous
            </button>
            <span className="text-xs font-semibold text-slate-500">
              Page {page} of {Math.ceil(totalCount / pageSize)}
            </span>
            <button
              onClick={() => setPage(p => (page * pageSize < totalCount ? p + 1 : p))}
              disabled={page * pageSize >= totalCount}
              className="px-3.5 py-1.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg shadow-xs hover:bg-slate-50 disabled:opacity-50 transition cursor-pointer"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
