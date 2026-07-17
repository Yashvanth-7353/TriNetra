import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Search, Network, Loader2, AlertCircle, X, Users, Shield, FileText,
  MapPin, Calendar, ChevronRight, Crosshair, Eye, CreditCard,
  Target, UserX, User, Scale, Fingerprint, BarChart3, ExternalLink
} from 'lucide-react';
import {
  searchNetworkAPI,
  fetchNetworkGraph,
  fetchNodeDetail,
  type NetworkSearchResult,
  type NetworkGraphResponse,
  type NodeDetailResponse,
  type NetworkNode,
  type NetworkEdge,
} from '../services/api';
import NetworkGraph from '../components/NetworkGraph';

// ── Relation colors & labels ──
const RELATION_CONFIG: Record<string, { color: string; bg: string; label: string; icon: any }> = {
  co_accused: { color: 'text-red-600', bg: 'bg-red-50 border-red-200', label: 'Co-Accused', icon: Users },
  financial: { color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', label: 'Money Trail', icon: CreditCard },
  repeat_identity: { color: 'text-violet-600', bg: 'bg-violet-50 border-violet-200', label: 'Same Person', icon: Fingerprint },
  shared_mo: { color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', label: 'Same MO', icon: Target },
  victim_accused: { color: 'text-pink-600', bg: 'bg-pink-50 border-pink-200', label: 'Victim↔Accused', icon: Scale },
};

function genderLabel(g: number | null): string {
  if (g === 1) return 'Male';
  if (g === 2) return 'Female';
  if (g === 3) return 'Other';
  return 'Unknown';
}

export default function NetworkAnalysis() {
  // ── Search state ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NetworkSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Graph state ──
  const [graphData, setGraphData] = useState<NetworkGraphResponse | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState('');
  const [showCommunities, setShowCommunities] = useState(false);
  const [hops, setHops] = useState(2);

  // ── Node detail panel ──
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeDetail, setNodeDetail] = useState<NodeDetailResponse | null>(null);
  const [nodeLoading, setNodeLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  // ── Layer selection state ──
  const [selectedLayers, setSelectedLayers] = useState<string[]>([
    'co_accused', 'financial', 'repeat_identity', 'shared_mo', 'victim_accused'
  ]);

  // ── Close dropdown on outside click ──
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ── Debounced search ──
  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const resp = await searchNetworkAPI(value.trim());
        setSearchResults(resp.results);
        setShowDropdown(resp.results.length > 0);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  }, []);

  // ── Load network graph ──
  const loadNetwork = useCallback(async (accusedId: number) => {
    setGraphLoading(true);
    setGraphError('');
    setShowDropdown(false);
    setPanelOpen(false);
    setSelectedNodeId(null);
    setNodeDetail(null);

    try {
      const result = await fetchNetworkGraph(accusedId, hops, selectedLayers);
      setGraphData(result);
    } catch (err: any) {
      setGraphError(err.message || 'Failed to load network.');
      setGraphData(null);
    } finally {
      setGraphLoading(false);
    }
  }, [hops, selectedLayers]);

  // ── Select a node ──
  const handleNodeClick = useCallback(async (accusedId: number, nodeId: string) => {
    setSelectedNodeId(nodeId);
    setPanelOpen(true);
    setNodeLoading(true);
    setNodeDetail(null);

    try {
      const result = await fetchNodeDetail(accusedId, selectedLayers);
      setNodeDetail(result);
    } catch (err) {
      console.error('Failed to load node detail:', err);
    } finally {
      setNodeLoading(false);
    }
  }, [selectedLayers]);

  // ── Toggle layer filter ──
  const handleLayerToggle = (layer: string) => {
    setSelectedLayers(prev => {
      const next = prev.includes(layer)
        ? prev.filter(l => l !== layer)
        : [...prev, layer];
      // Do not allow empty layers
      return next.length > 0 ? next : prev;
    });
  };

  // ── Auto-reload graph when selected layers change if we have an active graph ──
  useEffect(() => {
    if (graphData && graphData.root_node) {
      const rootId = parseInt(graphData.root_node.slice(1));
      if (!isNaN(rootId)) {
        loadNetwork(rootId);
      }
    }
  }, [selectedLayers, hops]);

  // ── Pick from dropdown ──
  const selectResult = (r: NetworkSearchResult) => {
    setSearchQuery(`${r.name} (ID: ${r.accused_id})`);
    setShowDropdown(false);
    loadNetwork(r.accused_id);
  };

  const hasGraph = graphData && graphData.nodes.length > 0;

  return (
    <div className="flex h-full relative overflow-hidden">
      {/* ── Main Content ── */}
      <div className={`flex-1 flex flex-col p-6 h-full transition-all duration-300 ${panelOpen ? 'mr-[380px]' : ''}`}>
        {/* Header */}
        <div className="flex justify-between items-center mb-4 shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-primary-900 flex items-center gap-2">
              <Network className="w-7 h-7 text-accent-500" />
              Network Analysis
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Map criminal ecosystems through 5 layers of connections — direct and indirect.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Hop selector */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500 font-medium">Depth:</span>
              <div className="flex bg-slate-100 rounded-lg p-0.5">
                {[1, 2, 3].map((h) => (
                  <button
                    key={h}
                    onClick={() => setHops(h)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${hops === h
                      ? 'bg-primary-900 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                      }`}
                  >
                    {h}-hop
                  </button>
                ))}
              </div>
            </div>

            {/* Community toggle */}
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer select-none bg-white border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors">
              <div className={`w-8 h-4.5 rounded-full relative transition-colors ${showCommunities ? 'bg-accent-500' : 'bg-slate-300'}`}>
                <div className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${showCommunities ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <input
                type="checkbox"
                checked={showCommunities}
                onChange={(e) => setShowCommunities(e.target.checked)}
                className="sr-only"
              />
              Communities
            </label>
          </div>
        </div>

        {/* Search Bar */}
        <div ref={searchRef} className="relative mb-4 shrink-0 max-w-2xl z-20">
          <form onSubmit={(e) => {
            e.preventDefault();
            if (searchResults.length > 0) {
              selectResult(searchResults[0]);
            } else if (searchQuery.trim().match(/^\d+$/)) {
              loadNetwork(parseInt(searchQuery.trim()));
            }
          }}>
            <div className="relative">
              <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                placeholder="Search by accused ID (e.g. '3682' for OTP Ring, '3635' for MV Theft)..."
                className="w-full h-12 pl-11 pr-28 rounded-xl border border-slate-200 shadow-sm focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 text-sm bg-white transition-all"
                disabled={graphLoading}
              />
              <button
                type="submit"
                disabled={graphLoading || !searchQuery.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-primary-800 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm"
              >
                {graphLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}
                Analyze
              </button>
            </div>
          </form>

          {/* Connection Type Layer Selection Filters */}
          <div className="flex flex-wrap gap-2.5 mt-2.5 p-2 bg-slate-50 border border-slate-100 rounded-lg text-xs font-semibold text-slate-600">
            <span className="self-center font-medium text-slate-400 mr-1.5 uppercase tracking-wider text-[10px]">Filter Links:</span>
            {[
              { id: 'co_accused', label: 'Co-Accused', color: 'border-red-200 checked:bg-red-500 checked:border-red-500 text-red-600' },
              { id: 'financial', label: 'Money Trail', color: 'border-emerald-200 checked:bg-emerald-500 checked:border-emerald-500 text-emerald-600' },
              { id: 'repeat_identity', label: 'Same Person', color: 'border-violet-200 checked:bg-violet-50 checked:border-violet-500 text-violet-600' },
              { id: 'shared_mo', label: 'Same MO', color: 'border-amber-200 checked:bg-amber-500 checked:border-amber-500 text-amber-600' },
              { id: 'victim_accused', label: 'Victim↔Accused', color: 'border-pink-200 checked:bg-pink-500 checked:border-pink-500 text-pink-600' }
            ].map(layer => (
              <label key={layer.id} className="flex items-center gap-1.5 cursor-pointer hover:text-slate-800 select-none">
                <input
                  type="checkbox"
                  checked={selectedLayers.includes(layer.id)}
                  onChange={() => handleLayerToggle(layer.id)}
                  className={`rounded border text-xs focus:ring-0 w-3.5 h-3.5 transition-colors cursor-pointer ${layer.color}`}
                />
                {layer.label}
              </label>
            ))}
          </div>

          {/* Search dropdown */}
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50 max-h-[320px] overflow-y-auto">
              {searchLoading && (
                <div className="px-4 py-3 text-sm text-slate-400 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Searching...
                </div>
              )}
              {searchResults.map((r) => (
                <button
                  key={`${r.accused_id}-${r.crime_no}`}
                  onClick={() => selectResult(r)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-primary-50 transition-colors text-left border-b border-slate-50 last:border-0"
                >
                  <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center shrink-0">
                    <UserX className="w-4 h-4 text-primary-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{r.name}</div>
                    <div className="text-xs text-slate-400 flex items-center gap-2">
                      <span>ID: {r.accused_id}</span>
                      {r.district && <span>· <MapPin className="w-3 h-3 inline" /> {r.district}</span>}
                      {r.linked_cases > 1 && <span className="text-amber-600 font-medium">· {r.linked_cases} cases</span>}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Stats strip */}
        {hasGraph && !graphLoading && (
          <div className="flex items-center gap-4 mb-3 shrink-0">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
              <Users className="w-3.5 h-3.5" />
              {graphData.stats.node_count} entities
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
              <Network className="w-3.5 h-3.5" />
              {graphData.stats.edge_count} connections
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
              <Target className="w-3.5 h-3.5" />
              {graphData.stats.community_count} clusters
            </div>
            {/* Relation breakdown */}
            <div className="flex items-center gap-2 ml-auto">
              {Object.entries(graphData.stats.relation_breakdown).map(([rel, count]) => {
                const cfg = RELATION_CONFIG[rel];
                if (!cfg) return null;
                return (
                  <span key={rel} className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${cfg.bg} ${cfg.color}`}>
                    <cfg.icon className="w-3 h-3" />
                    {count}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Canvas ── */}
        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden relative">
          {graphLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/80 z-10">
              <Loader2 className="w-12 h-12 text-primary-900 animate-spin mb-4" />
              <p className="text-slate-700 font-semibold">Building criminal network graph...</p>
              <p className="text-sm text-slate-400 mt-1">Analyzing 5 connection layers with community detection</p>
            </div>
          ) : graphError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
              <AlertCircle className="w-12 h-12 text-red-400 mb-3" />
              <p className="text-slate-700 font-semibold">{graphError}</p>
              <p className="text-sm text-slate-400 mt-1">Try a different accused ID or name.</p>
            </div>
          ) : hasGraph ? (
            <>
              <NetworkGraph
                nodes={graphData.nodes}
                edges={graphData.edges}
                rootNode={graphData.root_node}
                showCommunities={showCommunities}
                selectedNodeId={selectedNodeId}
                onNodeClick={handleNodeClick}
              />

              {/* Legend */}
              <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl p-3 shadow-lg z-10">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Connection Types</div>
                <div className="space-y-1.5">
                  {Object.entries(RELATION_CONFIG).map(([key, cfg]) => (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      <div className={`w-6 h-0.5 rounded ${key === 'co_accused' ? 'bg-red-500' : key === 'financial' ? 'bg-emerald-500' : key === 'repeat_identity' ? 'bg-violet-500' : key === 'shared_mo' ? 'bg-amber-500' : 'bg-pink-500'}`}
                        style={{ borderTop: ['repeat_identity', 'shared_mo', 'victim_accused'].includes(key) ? '2px dashed currentColor' : undefined }}
                      />
                      <span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 text-xs border-t border-slate-100 pt-1.5 mt-1.5">
                    <div className="w-4 h-4 rounded bg-accent-500" />
                    <span className="text-slate-500">Root node</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* ── Empty State ── */
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-gradient-to-br from-slate-50 to-primary-50/30">
              <div className="w-24 h-24 bg-gradient-to-br from-primary-100 to-accent-100 rounded-3xl flex items-center justify-center text-primary-300 mb-6 shadow-inner">
                <Network className="w-12 h-12" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Map the Criminal Ecosystem</h2>
              <p className="text-slate-500 max-w-lg text-center mb-8 leading-relaxed">
                TriNetra's deep network engine analyzes <strong>5 layers</strong> of criminal connections —
                not just co-accused, but financial trails, repeat identities, shared modus operandi, and victim-accused crossovers
                to uncover even the most indirect syndicate links.
              </p>

              <div className="w-full max-w-md">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Try these searches</div>
                <div className="space-y-2">
                  {[
                    { id: 3682, label: 'Accused 62 (Shankar Sheikh)', desc: 'Rich network: co-accused + shared Victims + shared MO' },
                    { id: 3635, label: 'Accused 3635 (Radha Reddy)', desc: 'Interstate MV Theft Ring (co-accused + shared MO)' },
                    { id: 3559, label: 'Accused 82 (Ayesha Reddy)', desc: 'Isolated offender (tests empty state)' },
                  ].map((ex) => (
                    <button
                      key={ex.id}
                      onClick={() => {
                        setSearchQuery(ex.label);
                        loadNetwork(ex.id);
                      }}
                      className="w-full text-left px-4 py-3 rounded-xl border border-slate-200 bg-white hover:border-accent-400 hover:bg-accent-50/30 transition-all shadow-sm group"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-semibold text-primary-900 group-hover:text-accent-600 transition-colors">{ex.label}</span>
                          <p className="text-xs text-slate-400 mt-0.5">{ex.desc}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-accent-500 transition-colors" />
                      </div>
                    </button>
                  ))}
                </div>

                {/* Connection type explanations */}
                <div className="mt-6 grid grid-cols-5 gap-2">
                  {Object.entries(RELATION_CONFIG).map(([key, cfg]) => (
                    <div key={key} className={`rounded-lg border p-2 text-center ${cfg.bg}`}>
                      <cfg.icon className={`w-4 h-4 mx-auto mb-1 ${cfg.color}`} />
                      <div className={`text-[10px] font-semibold ${cfg.color}`}>{cfg.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════
           NODE DETAIL SIDE PANEL
         ══════════════════════════════════════════════ */}
      {panelOpen && (
        <div
          className="fixed right-0 top-0 bottom-0 w-[380px] bg-white shadow-2xl z-40 flex flex-col border-l border-slate-200"
          style={{ animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          {nodeLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-primary-900 animate-spin" />
              <p className="text-sm text-slate-500">Loading details...</p>
            </div>
          ) : nodeDetail ? (
            <>
              {/* Panel Header */}
              <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-primary-50 to-white shrink-0">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-primary-900 rounded-xl flex items-center justify-center shrink-0">
                      <UserX className="w-5 h-5 text-accent-500" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-primary-900">{nodeDetail.name}</h3>
                      <p className="text-xs text-slate-400">
                        ID: {nodeDetail.accused_id}
                        {nodeDetail.person_id && ` · PID: ${nodeDetail.person_id}`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setPanelOpen(false); setSelectedNodeId(null); }}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Quick stats */}
                <div className="flex gap-2 mt-3">
                  <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">
                    Age: {nodeDetail.age || '?'}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">
                    {genderLabel(nodeDetail.gender_id)}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-700 font-semibold border border-amber-200">
                    {nodeDetail.total_cases} case{nodeDetail.total_cases !== 1 ? 's' : ''}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-full bg-primary-50 text-primary-700 font-medium border border-primary-100">
                    {nodeDetail.total_neighbors} links
                  </span>
                </div>
              </div>

              {/* Panel Body */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {/* Risk Score */}
                {nodeDetail.risk && (
                  <div className={`rounded-xl border p-4 ${nodeDetail.risk.score >= 70 ? 'bg-red-50 border-red-200' :
                    nodeDetail.risk.score >= 40 ? 'bg-amber-50 border-amber-200' :
                      'bg-green-50 border-green-200'
                    }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <BarChart3 className="w-3.5 h-3.5" /> Risk Score
                      </span>
                      <span className={`text-2xl font-black ${nodeDetail.risk.score >= 70 ? 'text-red-600' :
                        nodeDetail.risk.score >= 40 ? 'text-amber-600' : 'text-green-600'
                        }`}>
                        {nodeDetail.risk.score}
                        <span className="text-xs font-medium text-slate-400">/100</span>
                      </span>
                    </div>
                    {nodeDetail.risk.repeat_offender && (
                      <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-semibold">
                        ⚠ Repeat Offender
                      </span>
                    )}
                  </div>
                )}

                {/* Modus Operandi */}
                {nodeDetail.modus_operandi.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5" /> Modus Operandi
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {nodeDetail.modus_operandi.map((mo, i) => (
                        <span key={i} className="text-xs px-2.5 py-1 bg-amber-50 text-amber-800 rounded-lg border border-amber-200 font-medium">
                          {mo.tag}
                          {mo.confidence && <span className="ml-1 text-amber-500">({Math.round(mo.confidence * 100)}%)</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cases */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Linked Cases ({nodeDetail.cases.length})
                  </h4>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {nodeDetail.cases.map((c) => (
                      <div key={`${c.accused_id}-${c.case_id}`} className="bg-slate-50 rounded-lg border border-slate-100 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono font-semibold text-primary-900">#{c.crime_no}</span>
                          <span className="text-[10px] text-slate-400">{c.date}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                          {c.district && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{c.district}</span>}
                          {c.crime_type && <span>· {c.crime_type}</span>}
                        </div>
                        {c.status && (
                          <span className="mt-1.5 inline-block text-[10px] px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600 font-medium">
                            {c.status}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Financial Accounts */}
                {nodeDetail.accounts.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5" /> Financial Accounts
                    </h4>
                    <div className="space-y-2">
                      {nodeDetail.accounts.map((acc, i) => (
                        <div key={i} className="bg-slate-50 rounded-lg border border-slate-100 p-3 flex items-center gap-3">
                          <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center shrink-0">
                            <CreditCard className="w-4 h-4 text-emerald-600" />
                          </div>
                          <div>
                            <p className="text-xs font-mono font-medium text-slate-700">{acc.account}</p>
                            <p className="text-[10px] text-slate-400">{acc.bank}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Connected Neighbors */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> Connected To ({nodeDetail.neighbors.length})
                  </h4>
                  <div className="space-y-2 max-h-[240px] overflow-y-auto">
                    {nodeDetail.neighbors.map((nb) => {
                      const cfg = RELATION_CONFIG[nb.relation] || RELATION_CONFIG.co_accused;
                      return (
                        <button
                          key={nb.id}
                          onClick={() => {
                            if (nb.accused_id) handleNodeClick(nb.accused_id, nb.id);
                          }}
                          className="w-full text-left bg-white rounded-lg border border-slate-200 p-3 hover:border-primary-300 hover:bg-primary-50/30 transition-all group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-slate-600">
                              {nb.name?.charAt(0) || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-slate-800 truncate group-hover:text-primary-700">{nb.name}</div>
                              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} mt-0.5`}>
                                <cfg.icon className="w-2.5 h-2.5" />
                                {cfg.label}
                              </span>
                            </div>
                            <Eye className="w-3.5 h-3.5 text-slate-300 group-hover:text-primary-500 shrink-0" />
                          </div>
                          {nb.details.length > 0 && (
                            <p className="text-[10px] text-slate-400 mt-1.5 line-clamp-2 pl-11">
                              {nb.details[0].detail}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-slate-400">Failed to load details.</p>
            </div>
          )}
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
