import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search, Eye, FileText, Calendar, MapPin, X, Loader2, AlertCircle,
  ChevronLeft, ChevronRight, Filter, SlidersHorizontal, Users, Clock,
  Scale, Shield, UserX, User, Crosshair, Building2, Gavel, ArrowUpDown,
  FolderSearch, XCircle, RefreshCw, ExternalLink, Info
} from 'lucide-react';
import {
  fetchCaseFilters,
  searchCasesAPI,
  fetchCaseDetailAPI,
  type CaseFilterOptions,
  type CaseSearchResult,
  type CaseSearchParams,
  type CaseDetailResponse,
  type FilterOption,
} from '../services/api';

// ─── Status Badge Color Map ───
const STATUS_COLORS: Record<number, { bg: string; text: string; dot: string }> = {
  1: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500' },           // FIR Registered
  2: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },       // Under Investigation
  3: { bg: 'bg-indigo-50 border-indigo-200', text: 'text-indigo-700', dot: 'bg-indigo-500' },    // Charge Sheeted
  4: { bg: 'bg-purple-50 border-purple-200', text: 'text-purple-700', dot: 'bg-purple-500' },    // Pending Trial
  5: { bg: 'bg-green-50 border-green-200', text: 'text-green-700', dot: 'bg-green-500' },        // Closed - Convicted
  6: { bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600', dot: 'bg-slate-400' },        // Closed - Acquitted
  7: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', dot: 'bg-red-500' },                // Closed - False Case
  8: { bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700', dot: 'bg-orange-500' },    // Closed - Undetected
};

function StatusBadge({ statusId, statusName }: { statusId: number; statusName: string }) {
  const colors = STATUS_COLORS[statusId] || { bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600', dot: 'bg-slate-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${colors.bg} ${colors.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`}></span>
      {statusName}
    </span>
  );
}

// ─── Gender Display ───
function genderLabel(genderId: number | null): string {
  if (genderId === 1) return 'Male';
  if (genderId === 2) return 'Female';
  if (genderId === 3) return 'Other';
  return 'Unknown';
}

// ─── Skeleton Row ───
function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {[...Array(7)].map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-4 bg-slate-200 rounded-md" style={{ width: `${50 + Math.random() * 50}%` }}></div>
        </td>
      ))}
    </tr>
  );
}

// ═══════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════
export default function CaseExplorer() {
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get('search');

  // ─── Filter State ───
  const [filters, setFilters] = useState<CaseFilterOptions | null>(null);
  const [districtId, setDistrictId] = useState<number | undefined>();
  const [statusId, setStatusId] = useState<number | undefined>();
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [crimeHeadId, setCrimeHeadId] = useState<number | undefined>();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // ─── Results State ───
  const [cases, setCases] = useState<CaseSearchResult[]>([]);
  const [pagination, setPagination] = useState({ page: 1, page_size: 20, total_count: 0, total_pages: 1 });
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState('');

  // ─── Detail Drawer ───
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [caseDetail, setCaseDetail] = useState<CaseDetailResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'people' | 'legal'>('overview');

  // ─── Load filter options on mount ───
  useEffect(() => {
    fetchCaseFilters()
      .then(setFilters)
      .catch((err) => console.error('Failed to load filters:', err));
  }, []);

  // ─── Auto-search whenever any filter changes ───
  useEffect(() => {
    doSearch(1);
  }, [districtId, statusId, categoryId, crimeHeadId, dateFrom, dateTo]);

  // ─── Search function ───
  const doSearch = useCallback(async (page: number = 1, overrideSearch?: string) => {
    setIsLoading(true);
    setError('');
    setHasSearched(true);

    const params: CaseSearchParams = {
      page,
      page_size: 20,
    };
    if (districtId) params.district_id = districtId;
    if (statusId) params.status_id = statusId;
    if (categoryId) params.category_id = categoryId;
    if (crimeHeadId) params.crime_head_id = crimeHeadId;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    
    const actualSearch = overrideSearch !== undefined ? overrideSearch : searchTerm;
    if (actualSearch.trim()) params.search = actualSearch.trim();

    try {
      const result = await searchCasesAPI(params);
      setCases(result.cases);
      setPagination(result.pagination);
    } catch (err: any) {
      setError(err.message || 'Search failed.');
      setCases([]);
    } finally {
      setIsLoading(false);
    }
  }, [districtId, statusId, categoryId, crimeHeadId, dateFrom, dateTo, searchTerm]);

  // ─── Auto-search from URL ───
  useEffect(() => {
    if (urlSearch) {
      setSearchTerm(urlSearch);
      doSearch(1, urlSearch);
    }
  }, [urlSearch, doSearch]);

  // ─── Open Detail Drawer ───
  const openDetail = async (caseId: number) => {
    setDrawerOpen(true);
    setDrawerLoading(true);
    setActiveTab('overview');
    setCaseDetail(null);

    try {
      const result = await fetchCaseDetailAPI(caseId);
      setCaseDetail(result);
    } catch (err: any) {
      console.error('Failed to load case detail:', err);
    } finally {
      setDrawerLoading(false);
    }
  };

  // ─── Clear all filters ───
  const clearFilters = () => {
    setDistrictId(undefined);
    setStatusId(undefined);
    setCategoryId(undefined);
    setCrimeHeadId(undefined);
    setDateFrom('');
    setDateTo('');
    setSearchTerm('');
  };

  // ─── Active filter count ───
  const activeFilterCount = [districtId, statusId, categoryId, crimeHeadId, dateFrom, dateTo, searchTerm.trim()].filter(Boolean).length;

  // ─── Active filter chips ───
  const getActiveFilterChips = () => {
    const chips: { label: string; onRemove: () => void }[] = [];
    if (districtId && filters) {
      const d = filters.districts.find((x) => x.id === districtId);
      chips.push({ label: `District: ${d?.name || districtId}`, onRemove: () => setDistrictId(undefined) });
    }
    if (statusId && filters) {
      const s = filters.statuses.find((x) => x.id === statusId);
      chips.push({ label: `Status: ${s?.name || statusId}`, onRemove: () => setStatusId(undefined) });
    }
    if (categoryId && filters) {
      const c = filters.categories.find((x) => x.id === categoryId);
      chips.push({ label: `Category: ${c?.name || categoryId}`, onRemove: () => setCategoryId(undefined) });
    }
    if (crimeHeadId && filters) {
      const ch = filters.crime_heads.find((x) => x.id === crimeHeadId);
      chips.push({ label: `Crime: ${ch?.name || crimeHeadId}`, onRemove: () => setCrimeHeadId(undefined) });
    }
    if (dateFrom) chips.push({ label: `From: ${dateFrom}`, onRemove: () => setDateFrom('') });
    if (dateTo) chips.push({ label: `To: ${dateTo}`, onRemove: () => setDateTo('') });
    if (searchTerm.trim()) chips.push({ label: `Search: "${searchTerm}"`, onRemove: () => setSearchTerm('') });
    return chips;
  };

  return (
    <div className="flex h-full relative overflow-hidden">
      {/* ── Main Content ── */}
      <div className={`flex-1 flex flex-col p-6 transition-all duration-300 ${drawerOpen ? 'mr-[52%]' : ''}`}>
        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <div>
            <h1 className="text-2xl font-bold text-primary-900 flex items-center gap-2">
              <FolderSearch className="w-7 h-7 text-accent-500" />
              Case Explorer
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Browse, filter, and inspect FIR records across all districts.
            </p>
          </div>
          {hasSearched && (
            <div className="text-sm text-slate-500">
              <span className="font-semibold text-primary-900">{pagination.total_count.toLocaleString()}</span> cases found
            </div>
          )}
        </div>

        {/* ══ Filter Bar ══ */}
        <div className="bg-white/80 backdrop-blur-sm p-4 rounded-xl border border-slate-200/80 shadow-sm mb-5">
          <form
            onSubmit={(e) => { e.preventDefault(); doSearch(1); }}
            className="space-y-3"
          >
            {/* Search input + button */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by FIR number or keywords in brief facts..."
                  className="w-full h-10 pl-9 pr-4 rounded-lg border border-slate-200 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 text-sm transition-all"
                  disabled={isLoading}
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="bg-primary-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-primary-800 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Search
              </button>
            </div>

            {/* Filter dropdowns row */}
            <div className="flex flex-wrap gap-2 items-center">
              <SlidersHorizontal className="w-4 h-4 text-slate-400 shrink-0" />

              {/* District */}
              <select
                value={districtId || ''}
                onChange={(e) => setDistrictId(e.target.value ? Number(e.target.value) : undefined)}
                className="h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 transition-all min-w-[140px]"
              >
                <option value="">All Districts</option>
                {filters?.districts.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>

              {/* Status */}
              <select
                value={statusId || ''}
                onChange={(e) => setStatusId(e.target.value ? Number(e.target.value) : undefined)}
                className="h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 transition-all min-w-[160px]"
              >
                <option value="">All Statuses</option>
                {filters?.statuses.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>

              {/* Category */}
              <select
                value={categoryId || ''}
                onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : undefined)}
                className="h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 transition-all min-w-[120px]"
              >
                <option value="">All Categories</option>
                {filters?.categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              {/* Crime Head */}
              <select
                value={crimeHeadId || ''}
                onChange={(e) => setCrimeHeadId(e.target.value ? Number(e.target.value) : undefined)}
                className="h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 transition-all min-w-[170px]"
              >
                <option value="">All Crime Types</option>
                {filters?.crime_heads.map((ch) => (
                  <option key={ch.id} value={ch.id}>{ch.name}</option>
                ))}
              </select>

              {/* Date From */}
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-9 px-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 transition-all"
                  placeholder="From"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-9 px-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 transition-all"
                  placeholder="To"
                />
              </div>

              {/* Clear filters */}
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => { clearFilters(); }}
                  className="h-9 px-3 text-xs text-red-600 hover:bg-red-50 rounded-lg border border-red-200 transition-colors flex items-center gap-1 font-medium"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Clear ({activeFilterCount})
                </button>
              )}
            </div>
          </form>

          {/* Active filter chips */}
          {getActiveFilterChips().length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-100">
              {getActiveFilterChips().map((chip, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-700 rounded-full text-xs font-medium border border-primary-100"
                >
                  {chip.label}
                  <button onClick={chip.onRemove} className="hover:text-red-600 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* ══ Results Table ══ */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 overflow-hidden flex flex-col">
          {isLoading ? (
            /* Skeleton loader */
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80 sticky top-0 z-[1]">
                  <tr className="border-b border-slate-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">FIR No.</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">District</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Crime Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {[...Array(8)].map((_, i) => <SkeletonRow key={i} />)}
                </tbody>
              </table>
            </div>
          ) : !hasSearched ? (
            /* Initial empty state */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-primary-100 to-accent-100 rounded-2xl flex items-center justify-center text-primary-400 mb-5 shadow-inner">
                <FolderSearch className="w-10 h-10" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Explore Case Records</h3>
              <p className="text-slate-500 max-w-md mb-5 text-sm leading-relaxed">
                Use the filters above to browse through FIR records. Filter by district, crime category, case status, or date range to find specific cases.
              </p>
            </div>
          ) : cases.length === 0 ? (
            /* No results */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl flex items-center justify-center text-orange-400 mb-5 shadow-inner">
                <Search className="w-10 h-10" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">No Cases Found</h3>
              <p className="text-slate-500 max-w-md mb-5 text-sm leading-relaxed">
                Your current filters didn't match any case records. Try adjusting your search criteria.
              </p>
              <div className="space-y-2 text-sm text-slate-600">
                {activeFilterCount > 0 && (
                  <div className="flex flex-col gap-2 items-center">
                    <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Suggestions</p>
                    {districtId && (
                      <button onClick={() => setDistrictId(undefined)} className="text-primary-600 hover:text-primary-800 underline underline-offset-2">
                        Remove district filter
                      </button>
                    )}
                    {statusId && (
                      <button onClick={() => setStatusId(undefined)} className="text-primary-600 hover:text-primary-800 underline underline-offset-2">
                        Remove status filter
                      </button>
                    )}
                    {(dateFrom || dateTo) && (
                      <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-primary-600 hover:text-primary-800 underline underline-offset-2">
                        Clear date range
                      </button>
                    )}
                    <button
                      onClick={() => { clearFilters(); doSearch(1); }}
                      className="mt-2 px-4 py-2 bg-primary-900 text-white rounded-lg text-sm font-medium hover:bg-primary-800 transition-colors flex items-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Clear all & reload
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Results */
            <>
              <div className="overflow-auto flex-1">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50/80 sticky top-0 z-[1]">
                    <tr className="border-b border-slate-200">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">FIR No.</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">District</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Crime Type</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cases.map((c) => (
                      <tr
                        key={c.casemasterid}
                        onClick={() => openDetail(c.casemasterid)}
                        className="hover:bg-primary-50/40 cursor-pointer transition-colors group"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-slate-400 group-hover:text-accent-500 transition-colors shrink-0" />
                            <span className="font-mono text-xs font-medium text-primary-900">{c.crimeno}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="text-slate-700">{c.districtname || '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-600">{c.category || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-700 font-medium">{c.crime_head || '—'}</span>
                          {c.crime_sub_head && (
                            <span className="block text-xs text-slate-400 mt-0.5">{c.crime_sub_head}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge statusId={c.casestatusid} statusName={c.casestatusname || '—'} />
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-600 text-xs">{c.crimeregistereddate || '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={(e) => { e.stopPropagation(); openDetail(c.casemasterid); }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-700 hover:bg-primary-100 rounded-lg transition-colors border border-primary-100"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/50">
                <p className="text-xs text-slate-500">
                  Showing <span className="font-semibold text-slate-700">{((pagination.page - 1) * pagination.page_size) + 1}</span>
                  –<span className="font-semibold text-slate-700">{Math.min(pagination.page * pagination.page_size, pagination.total_count)}</span>
                  {' '}of <span className="font-semibold text-slate-700">{pagination.total_count.toLocaleString()}</span>
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => doSearch(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {/* Page numbers */}
                  {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                    let pageNum: number;
                    if (pagination.total_pages <= 5) {
                      pageNum = i + 1;
                    } else if (pagination.page <= 3) {
                      pageNum = i + 1;
                    } else if (pagination.page >= pagination.total_pages - 2) {
                      pageNum = pagination.total_pages - 4 + i;
                    } else {
                      pageNum = pagination.page - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => doSearch(pageNum)}
                        className={`h-8 w-8 flex items-center justify-center rounded-lg text-xs font-medium transition-colors ${
                          pageNum === pagination.page
                            ? 'bg-primary-900 text-white shadow-sm'
                            : 'border border-slate-200 hover:bg-white text-slate-600'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => doSearch(pagination.page + 1)}
                    disabled={pagination.page >= pagination.total_pages}
                    className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════
           CASE DETAIL DRAWER (slide-over)
         ══════════════════════════════════════════════ */}
      {drawerOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 z-30 backdrop-blur-[2px]"
            onClick={() => setDrawerOpen(false)}
            style={{ animation: 'fadeIn 0.2s ease-out' }}
          />

          {/* Drawer panel */}
          <div
            className="fixed right-0 top-0 bottom-0 w-full max-w-[52%] bg-white shadow-2xl z-40 flex flex-col border-l border-slate-200"
            style={{ animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
          >
            {drawerLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-10 h-10 text-primary-900 animate-spin" />
                <p className="text-slate-500 font-medium">Loading case details...</p>
              </div>
            ) : caseDetail ? (
              <>
                {/* Drawer Header */}
                <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-primary-50 to-white shrink-0">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-primary-900 rounded-lg flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5 text-accent-500" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-lg font-bold text-primary-900 truncate">
                            FIR #{caseDetail.case.crimeno}
                          </h2>
                          <p className="text-xs text-slate-500">Case #{caseDetail.case.caseno}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <StatusBadge statusId={caseDetail.case.casestatusid} statusName={caseDetail.case.casestatusname} />
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {caseDetail.case.districtname} — {caseDetail.case.police_station}
                        </span>
                        {caseDetail.case.gravity && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            caseDetail.case.gravity === 'Heinous'
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : 'bg-slate-50 text-slate-600 border border-slate-200'
                          }`}>
                            {caseDetail.case.gravity}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setDrawerOpen(false)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors shrink-0 ml-4"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Tabs */}
                  <div className="flex gap-1 mt-4 -mb-4">
                    {([
                      { key: 'overview', label: 'Overview', icon: Info },
                      { key: 'timeline', label: 'Timeline', icon: Clock },
                      { key: 'people', label: 'People', icon: Users },
                      { key: 'legal', label: 'Legal', icon: Scale },
                    ] as const).map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                          activeTab === tab.key
                            ? 'bg-white text-primary-900 border border-slate-200 border-b-white shadow-sm -mb-px'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                        }`}
                      >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                        {tab.key === 'people' && (
                          <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                            {(caseDetail.accused?.length || 0) + (caseDetail.victims?.length || 0) + (caseDetail.complainants?.length || 0)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto p-6">
                  {/* ── OVERVIEW TAB ── */}
                  {activeTab === 'overview' && (
                    <div className="space-y-6">
                      {/* Key info grid */}
                      <div className="grid grid-cols-2 gap-4">
                        <InfoCard icon={Calendar} label="Registered Date" value={caseDetail.case.crimeregistereddate} />
                        <InfoCard icon={Calendar} label="Incident Date" value={caseDetail.case.incidentfromdate?.split(' ')[0] || '—'} />
                        <InfoCard icon={Building2} label="Category" value={caseDetail.case.category || '—'} />
                        <InfoCard icon={Shield} label="Crime Type" value={`${caseDetail.case.crime_head || ''} ${caseDetail.case.crime_sub_head ? '› ' + caseDetail.case.crime_sub_head : ''}`.trim() || '—'} />
                        <InfoCard icon={Gavel} label="Court" value={caseDetail.case.courtname || 'Not assigned'} />
                        <InfoCard icon={Building2} label="Police Station" value={caseDetail.case.police_station || '—'} />
                      </div>

                      {/* Brief Facts */}
                      {caseDetail.case.brieffacts && (
                        <div>
                          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Brief Facts</h4>
                          <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 leading-relaxed border border-slate-100">
                            {caseDetail.case.brieffacts}
                          </div>
                        </div>
                      )}

                      {/* Mini Map */}
                      {caseDetail.case.latitude && caseDetail.case.longitude && (
                        <div>
                          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Location</h4>
                          <div className="bg-slate-100 rounded-xl overflow-hidden border border-slate-200 relative group">
                            <img
                              src={`https://maps.googleapis.com/maps/api/staticmap?center=${caseDetail.case.latitude},${caseDetail.case.longitude}&zoom=14&size=600x200&maptype=roadmap&markers=color:red%7C${caseDetail.case.latitude},${caseDetail.case.longitude}&key=`}
                              alt="Case location"
                              className="w-full h-[160px] object-cover opacity-0"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                            <div className="flex items-center gap-3 p-4">
                              <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center shrink-0">
                                <Crosshair className="w-5 h-5 text-primary-600" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-slate-700">GPS Coordinates</p>
                                <p className="text-xs text-slate-500 font-mono">{caseDetail.case.latitude}, {caseDetail.case.longitude}</p>
                              </div>
                              <a
                                href={`https://www.google.com/maps?q=${caseDetail.case.latitude},${caseDetail.case.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-auto text-xs text-primary-600 hover:text-primary-800 flex items-center gap-1 font-medium"
                              >
                                Open Map <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── TIMELINE TAB ── */}
                  {activeTab === 'timeline' && (
                    <div>
                      {caseDetail.status_history.length === 0 ? (
                        <EmptySection icon={Clock} message="No status history available for this case." />
                      ) : (
                        <div className="relative pl-8">
                          {/* Timeline line */}
                          <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-gradient-to-b from-primary-300 via-primary-200 to-slate-200"></div>

                          <div className="space-y-6">
                            {caseDetail.status_history.map((entry, idx) => {
                              const isLast = idx === caseDetail.status_history.length - 1;
                              const statusColor = STATUS_COLORS[
                                caseDetail.status_history[idx]
                                  ? (filters?.statuses.find(s => s.name === entry.status)?.id || 1)
                                  : 1
                              ]?.dot || 'bg-primary-500';

                              return (
                                <div key={entry.id} className="relative">
                                  {/* Dot */}
                                  <div className={`absolute -left-5 top-1 w-3 h-3 rounded-full border-2 border-white shadow-sm ${isLast ? 'bg-primary-500 ring-4 ring-primary-100' : statusColor}`}></div>

                                  <div className={`bg-white rounded-xl border p-4 shadow-sm ${isLast ? 'border-primary-200 bg-primary-50/30' : 'border-slate-200'}`}>
                                    <div className="flex items-center justify-between mb-1">
                                      <span className={`font-semibold text-sm ${isLast ? 'text-primary-900' : 'text-slate-800'}`}>
                                        {entry.status}
                                      </span>
                                      <span className="text-xs text-slate-400 font-mono">
                                        {entry.date ? new Date(entry.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                                      </span>
                                    </div>
                                    {entry.remarks && (
                                      <p className="text-xs text-slate-500 mt-1">{entry.remarks}</p>
                                    )}
                                    {entry.changed_by && (
                                      <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                                        <User className="w-3 h-3" /> {entry.changed_by}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── PEOPLE TAB ── */}
                  {activeTab === 'people' && (
                    <div className="space-y-6">
                      {/* Accused */}
                      <PeopleSection
                        title="Accused"
                        icon={UserX}
                        iconColor="text-red-500"
                        bgColor="bg-red-50"
                        people={caseDetail.accused}
                        emptyMessage="No accused persons linked to this case."
                      />

                      {/* Victims */}
                      <PeopleSection
                        title="Victims"
                        icon={Shield}
                        iconColor="text-amber-600"
                        bgColor="bg-amber-50"
                        people={caseDetail.victims}
                        emptyMessage="No victim records linked to this case."
                        showPolice
                      />

                      {/* Complainants */}
                      <PeopleSection
                        title="Complainants"
                        icon={User}
                        iconColor="text-blue-600"
                        bgColor="bg-blue-50"
                        people={caseDetail.complainants}
                        emptyMessage="No complainant records linked to this case."
                        showOccupation
                      />
                    </div>
                  )}

                  {/* ── LEGAL TAB ── */}
                  {activeTab === 'legal' && (
                    <div className="space-y-6">
                      {/* Chargesheets */}
                      <div>
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                          <Gavel className="w-4 h-4" />
                          Charge Sheets
                        </h4>
                        {caseDetail.chargesheets.length === 0 ? (
                          <EmptySection icon={Gavel} message="No chargesheet filed for this case." />
                        ) : (
                          <div className="space-y-3">
                            {caseDetail.chargesheets.map((cs) => (
                              <div key={cs.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center">
                                      <FileText className="w-4 h-4 text-indigo-600" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium text-slate-800">Chargesheet #{cs.id}</p>
                                      <p className="text-xs text-slate-500">Type: {cs.type === 'A' ? 'Original' : cs.type === 'B' ? 'Supplementary' : cs.type}</p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-medium text-slate-700">
                                      {cs.date ? new Date(cs.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                                    </p>
                                    {cs.filed_by && (
                                      <p className="text-xs text-slate-400 mt-0.5">Filed by: {cs.filed_by}</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Arrests */}
                      <div>
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                          <Shield className="w-4 h-4" />
                          Arrests & Surrenders
                        </h4>
                        {caseDetail.arrests.length === 0 ? (
                          <EmptySection icon={Shield} message="No arrest or surrender records for this case." />
                        ) : (
                          <div className="space-y-3">
                            {caseDetail.arrests.map((arrest) => (
                              <div key={arrest.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                                      arrest.type === 'Arrest' ? 'bg-red-50' : 'bg-green-50'
                                    }`}>
                                      <Shield className={`w-4 h-4 ${arrest.type === 'Arrest' ? 'text-red-600' : 'text-green-600'}`} />
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium text-slate-800">{arrest.accused_name || 'Unknown'}</p>
                                      <p className="text-xs text-slate-500">{arrest.type} — {arrest.station || arrest.district || '—'}</p>
                                    </div>
                                  </div>
                                  <span className="text-xs text-slate-500 font-mono">
                                    {arrest.date ? new Date(arrest.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-slate-500">Failed to load case details.</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Animations */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════
//  SUB-COMPONENTS
// ═══════════════════════════════════════════════

function InfoCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="bg-slate-50/70 rounded-xl border border-slate-100 p-3.5 flex items-center gap-3">
      <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center shadow-sm border border-slate-100 shrink-0">
        <Icon className="w-4 h-4 text-primary-600" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-400 font-medium">{label}</p>
        <p className="text-sm text-slate-800 font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

function EmptySection({ icon: Icon, message }: { icon: any; message: string }) {
  return (
    <div className="bg-slate-50 rounded-xl p-6 text-center border border-slate-100">
      <Icon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  );
}

function PeopleSection({
  title,
  icon: Icon,
  iconColor,
  bgColor,
  people,
  emptyMessage,
  showPolice,
  showOccupation,
}: {
  title: string;
  icon: any;
  iconColor: string;
  bgColor: string;
  people: any[];
  emptyMessage: string;
  showPolice?: boolean;
  showOccupation?: boolean;
}) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        {title}
        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{people.length}</span>
      </h4>
      {people.length === 0 ? (
        <EmptySection icon={Icon} message={emptyMessage} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {people.map((person) => (
            <div key={person.id} className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full ${bgColor} flex items-center justify-center shrink-0`}>
                <span className="text-sm font-bold" style={{ color: 'inherit' }}>
                  {person.name?.charAt(0)?.toUpperCase() || '?'}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{person.name}</p>
                <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                  {person.age && <span>Age {person.age}</span>}
                  {person.gender_id && <span>· {genderLabel(person.gender_id)}</span>}
                  {showPolice && person.is_police && <span className="text-blue-600">· Police Personnel</span>}
                  {showOccupation && person.occupation && <span>· {person.occupation}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
