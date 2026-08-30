import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Search, Loader2, AlertCircle, X, Users, CreditCard,
  Calendar, ChevronRight, ChevronDown, ChevronUp,
  Filter, ArrowRight, DollarSign, Link2, AlertTriangle, TrendingUp,
  Activity, RefreshCw, Layers, Banknote,
  GitBranch, Zap, Shield, Target, Workflow, Network,
  User, CircleDollarSign, FileText, AlertOctagon, Share2,
  ArrowUpRight, Eye,
} from 'lucide-react';
import ReactFlow, { Background, Controls, MarkerType } from 'reactflow';
import type { Node, Edge, NodeMouseHandler } from 'reactflow';
import 'reactflow/dist/style.css';
import {
  fetchFinancialAnalysis,
  type FinancialAnalysisResponse,
  type FinancialAccount,
  type FinancialTransaction,
  type FinancialCrossCaseLink,
  type FinancialAnomaly,
  type FinancialLead,
  type FinancialGraph,
} from '../services/api';
import { cn } from '../lib/utils';

// ════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════

const GRAPH_NODE_COLORS: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  person: { bg: '#991b1b', border: '#ef4444', text: '#ffffff', icon: '👤' },
  account: { bg: '#065f46', border: '#10b981', text: '#ffffff', icon: '💰' },
  case: { bg: '#1e40af', border: '#3b82f6', text: '#ffffff', icon: '📋' },
};
const GRAPH_EDGE_COLORS: Record<string, { color: string; label: string }> = {
  owns: { color: '#10b981', label: 'owns' },
  transferred: { color: '#f59e0b', label: 'transfer' },
};
const ANOMALY_LUCIDE: Record<string, any> = {
  high_volume_account: Activity, high_value_transaction: DollarSign, rapid_movement: Zap,
  bidirectional_transfers: ArrowUpRight, cross_case_link: Share2,
};
const ANOMALY_WHY: Record<string, string> = {
  high_volume_account: 'This account has an unusually high number of transactions compared to the dataset average.',
  high_value_transaction: 'This transaction exceeds the typical value range for similar transactions in the system.',
  rapid_movement: 'Multiple transactions occurred within a short time window, suggesting coordinated transfer activity.',
  bidirectional_transfers: 'Funds flow in both directions between accounts, which may indicate a reciprocal financial relationship.',
  cross_case_link: 'A single account or person connects multiple unrelated cases, suggesting a shared financial network.',
};
const LEAD_LUCIDE: Record<string, any> = {
  financial_cross_case: Link2, financial_bidirectional: ArrowUpRight, financial_high_volume: Activity,
  financial_chain: Network, financial_shared_bank: CreditCard,
};

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'moneyflow', label: 'Money Flow' },
  { id: 'suspicious', label: 'Suspicious' },
  { id: 'crosscase', label: 'Cross-Case' },
  { id: 'nextactions', label: 'Next Steps' },
  { id: 'evidence', label: 'Evidence' },
];

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════

function maskAccount(num: string): string {
  if (!num || num.length < 4) return num || 'Unknown';
  return `XXXX-${num.slice(-4)}`;
}
function formatCurrency(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  return `₹${amount.toLocaleString('en-IN')}`;
}
function formatDate(d: string | null): string {
  if (!d) return 'N/A';
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

// ════════════════════════════════════════════════════════════════
// GRAPH HOOKS (reused exactly from original)
// ════════════════════════════════════════════════════════════════

function useFinancialGraphNodes(
  graph: FinancialGraph | null, selectedId: string | null,
  onSelect: (id: string, type: string) => void, compact = false,
) {
  return useMemo(() => {
    if (!graph || !graph.nodes.length) return [];
    const positions: Record<string, { x: number; y: number }> = {};
    const typeGroups: Record<string, typeof graph.nodes> = {};
    graph.nodes.forEach(n => { if (!typeGroups[n.type]) typeGroups[n.type] = []; typeGroups[n.type].push(n); });
    const typeOrder = ['person', 'account', 'case'];
    let yOff = 50;
    typeOrder.forEach(type => {
      const nodes = typeGroups[type] || [];
      nodes.forEach((n, i) => { positions[n.id] = { x: 80 + i * (compact ? 160 : 180), y: yOff }; });
      if (nodes.length > 0) yOff += (compact ? 140 : 160);
    });
    const allNodes = graph.nodes;
    for (let iter = 0; iter < 40; iter++) {
      const forces: Record<string, { fx: number; fy: number }> = {};
      allNodes.forEach(n => { forces[n.id] = { fx: 0, fy: 0 }; });
      for (let i = 0; i < allNodes.length; i++) {
        for (let j = i + 1; j < allNodes.length; j++) {
          const a = allNodes[i].id, b = allNodes[j].id;
          const dx = positions[a].x - positions[b].x, dy = positions[a].y - positions[b].y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
          const repulse = 6000 / (dist * dist);
          forces[a].fx += (dx / dist) * repulse; forces[a].fy += (dy / dist) * repulse;
          forces[b].fx -= (dx / dist) * repulse; forces[b].fy -= (dy / dist) * repulse;
        }
      }
      graph.edges.forEach(e => {
        if (!positions[e.source] || !positions[e.target]) return;
        const dx = positions[e.target].x - positions[e.source].x, dy = positions[e.target].y - positions[e.source].y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
        const attract = (dist - 140) * 0.02;
        forces[e.source].fx += (dx / dist) * attract; forces[e.source].fy += (dy / dist) * attract;
        forces[e.target].fx -= (dx / dist) * attract; forces[e.target].fy -= (dy / dist) * attract;
      });
      const cooling = 1 - iter / 45;
      allNodes.forEach(n => { const f = forces[n.id]; const maxF = 12 * cooling; positions[n.id].x += Math.max(-maxF, Math.min(maxF, f.fx)); positions[n.id].y += Math.max(-maxF, Math.min(maxF, f.fy)); });
    }
    return allNodes.map(n => {
      const pos = positions[n.id] || { x: 300, y: 200 };
      const cfg = GRAPH_NODE_COLORS[n.type] || GRAPH_NODE_COLORS.person;
      const isSelected = selectedId === n.id;
      const label = (n.label || '').replace(/\n/g, ' ');
      return {
        id: n.id, position: pos,
        data: { label: (<div style={{ textAlign: 'center', lineHeight: 1.3, cursor: 'pointer' }}><div style={{ fontSize: compact ? 14 : 16 }}>{cfg.icon}</div><div style={{ fontWeight: 700, fontSize: compact ? 9 : 10, wordBreak: 'break-word', color: cfg.text }}>{label.length > 28 ? label.slice(0, 25) + '...' : label}</div>{!compact && <div style={{ fontSize: 8, opacity: 0.8, marginTop: 2, color: cfg.text }}>{n.type.toUpperCase()}</div>}</div>) },
        style: { background: cfg.bg, color: cfg.text, border: `2px solid ${isSelected ? '#fbbf24' : cfg.border}`, borderRadius: n.type === 'person' ? '50%' : '12px', padding: compact ? '6px 8px' : '8px 12px', fontWeight: '600', fontSize: '10px', boxShadow: isSelected ? `0 0 0 3px #fbbf24, 0 4px 16px rgba(0,0,0,0.25)` : '0 2px 10px rgba(0,0,0,0.18)', width: compact ? 110 : 130, minWidth: compact ? 110 : 130, minHeight: compact ? 55 : 70, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'box-shadow 0.2s, border-color 0.2s' },
      };
    });
  }, [graph, selectedId, compact]);
}

function useFinancialGraphEdges(graph: FinancialGraph | null, selectedId: string | null) {
  return useMemo(() => {
    if (!graph || !graph.edges.length) return [];
    return graph.edges.map(e => {
      const cfg = GRAPH_EDGE_COLORS[e.type] || { color: '#94a3b8', label: e.type };
      const isSelected = selectedId === e.id;
      return { id: e.id, source: e.source, target: e.target, label: e.label || cfg.label, animated: e.type === 'transferred', style: { stroke: isSelected ? '#fbbf24' : cfg.color, strokeWidth: isSelected ? 3 : 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: isSelected ? '#fbbf24' : cfg.color, width: 16, height: 16 }, labelStyle: { fill: '#334155', fontWeight: 600, fontSize: 9 }, labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95, rx: 4, ry: 4, stroke: cfg.color, strokeWidth: 1 }, labelBgPadding: [4, 2] as [number, number] };
    });
  }, [graph, selectedId]);
}

function useFocusedGraphData(data: FinancialAnalysisResponse) {
  return useMemo(() => {
    if (!data?.graph) return { nodes: [], edges: [] };
    const crossCaseAccountIds = new Set(data.cross_case_links.map(l => `account_${l.account_id}`));
    const flaggedNodeIds = new Set<string>();
    data.transactions.filter(t => t.flagged).forEach(t => { flaggedNodeIds.add(`account_${t.from_account_id}`); flaggedNodeIds.add(`account_${t.to_account_id}`); });
    const priorityNodeIds = new Set<string>();
    crossCaseAccountIds.forEach(id => priorityNodeIds.add(id));
    flaggedNodeIds.forEach(id => priorityNodeIds.add(id));
    const priorityPersons = new Set<string>();
    data.graph.nodes.forEach(n => { if (n.type === 'person' && priorityNodeIds.has(n.id)) priorityPersons.add(n.id); });
    data.graph.edges.forEach(e => { if (e.type === 'owns' && priorityNodeIds.has(e.target)) priorityPersons.add(e.source); if (e.type === 'owns' && priorityNodeIds.has(e.source)) priorityPersons.add(e.target); });
    const focusedNodeIds = new Set<string>();
    priorityNodeIds.forEach(id => focusedNodeIds.add(id));
    priorityPersons.forEach(id => focusedNodeIds.add(id));
    if (focusedNodeIds.size < 6) { data.graph.nodes.filter(n => n.type === 'person').slice(0, 5).forEach(n => focusedNodeIds.add(n.id)); data.graph.nodes.filter(n => n.type === 'account').slice(0, 5).forEach(n => focusedNodeIds.add(n.id)); }
    const focusedNodes = data.graph.nodes.filter(n => focusedNodeIds.has(n.id));
    const focusedEdges = data.graph.edges.filter(e => focusedNodeIds.has(e.source) && focusedNodeIds.has(e.target));
    return { nodes: focusedNodes, edges: focusedEdges };
  }, [data]);
}

// ════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════

export default function FinancialTrailPage() {
  const [data, setData] = useState<FinancialAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [filterAccusedIds, setFilterAccusedIds] = useState<number[]>([]);
  const [filterCaseIds, setFilterCaseIds] = useState<number[]>([]);
  const [filterMinAmount, setFilterMinAmount] = useState('');
  const [filterMaxAmount, setFilterMaxAmount] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [expandAccused, setExpandAccused] = useState(true);
  const [expandCases, setExpandCases] = useState(false);
  const [expandAmount, setExpandAmount] = useState(false);
  const [accusedSearch, setAccusedSearch] = useState('');
  const [caseSearch, setCaseSearch] = useState('');

  // Graph
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [showFullNetwork, setShowFullNetwork] = useState(false);

  // Detail drawer
  const [detailOpen, setDetailOpen] = useState(false);

  // Scroll-spy
  const [activeSection, setActiveSection] = useState('overview');
  const sectionRefs: Record<string, React.RefObject<HTMLDivElement>> = {
    overview: useRef<HTMLDivElement>(null),
    relationships: useRef<HTMLDivElement>(null),
    moneyflow: useRef<HTMLDivElement>(null),
    suspicious: useRef<HTMLDivElement>(null),
    crosscase: useRef<HTMLDivElement>(null),
    nextactions: useRef<HTMLDivElement>(null),
    evidence: useRef<HTMLDivElement>(null),
  };

  // Scroll spy
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActiveSection(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 }
    );
    Object.values(sectionRefs).forEach(ref => { if (ref.current) observer.observe(ref.current); });
    return () => observer.disconnect();
  }, [data]);

  // Data loading
  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await fetchFinancialAnalysis(
        filterAccusedIds.length > 0 ? filterAccusedIds : undefined,
        filterCaseIds.length > 0 ? filterCaseIds : undefined,
      );
      setData(result);
    } catch (err: any) { setError(err.message || 'Failed to load financial data'); }
    finally { setLoading(false); }
  }, [filterAccusedIds, filterCaseIds]);
  useEffect(() => { loadData(); }, [loadData]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    if (!data) return [];
    let txns = data.transactions;
    if (filterMinAmount) txns = txns.filter(t => t.amount >= Number(filterMinAmount));
    if (filterMaxAmount) txns = txns.filter(t => t.amount <= Number(filterMaxAmount));
    if (searchTerm) { const q = searchTerm.toLowerCase(); txns = txns.filter(t => t.from_person?.toLowerCase().includes(q) || t.to_person?.toLowerCase().includes(q) || t.crime_no?.toLowerCase().includes(q) || String(t.txn_id).includes(q)); }
    return txns;
  }, [data, filterMinAmount, filterMaxAmount, searchTerm]);

  // Graph data
  const focusedGraphData = useFocusedGraphData(data!);
  const fullGraphNodes = useFinancialGraphNodes(data?.graph || null, selectedNodeId, (id) => { setSelectedNodeId(id); setSelectedEdgeId(null); setDetailOpen(true); });
  const fullGraphEdges = useFinancialGraphEdges(data?.graph || null, selectedEdgeId);
  const focusedNodes = useFinancialGraphNodes(focusedGraphData.nodes.length > 0 ? { nodes: focusedGraphData.nodes, edges: focusedGraphData.edges } : null, selectedNodeId, (id) => { setSelectedNodeId(id); setSelectedEdgeId(null); setDetailOpen(true); }, true);
  const focusedEdges = useFinancialGraphEdges(focusedGraphData.nodes.length > 0 ? { nodes: focusedGraphData.nodes, edges: focusedGraphData.edges } : null, selectedEdgeId);
  const activeGraphNodes = showFullNetwork ? fullGraphNodes : focusedNodes;
  const activeGraphEdges = showFullNetwork ? fullGraphEdges : focusedEdges;

  // Selected entities
  const selectedAccount = useMemo(() => { if (!selectedNodeId || !data || !selectedNodeId.startsWith('account_')) return null; const accountId = Number(selectedNodeId.replace('account_', '')); return data.accounts.find(a => a.account_id === accountId) || data.counterparty_accounts.find(a => a.account_id === accountId) || null; }, [selectedNodeId, data]);
  const selectedPerson = useMemo(() => { if (!selectedNodeId || !data || !selectedNodeId.startsWith('person_')) return null; const personId = Number(selectedNodeId.replace('person_', '')); const acct = data.accounts.find(a => a.accused_master_id === personId); return acct ? { accused_master_id: personId, name: acct.accused_name } : null; }, [selectedNodeId, data]);
  const selectedEdge = useMemo(() => { if (!selectedEdgeId || !data) return null; return data.graph.edges.find(e => e.id === selectedEdgeId) || null; }, [selectedEdgeId, data]);
  const selectedTransaction = useMemo(() => { if (!selectedEdge || !data || selectedEdge.type !== 'transferred') return null; const txnId = selectedEdge.data?.txn_id; if (!txnId) return null; return data.transactions.find(t => t.txn_id === txnId) || null; }, [selectedEdge, data]);

  // Filter helpers
  const uniqueAccused = useMemo(() => { if (!data) return []; const map = new Map<number, string>(); data.accounts.forEach(a => { if (a.accused_master_id && a.accused_name) map.set(a.accused_master_id, a.accused_name); }); return Array.from(map.entries()).map(([id, name]) => ({ id, name })); }, [data]);
  const uniqueCases = useMemo(() => { if (!data) return []; const map = new Map<number, string>(); data.accounts.forEach(a => { if (a.case_master_id && a.crime_no) map.set(a.case_master_id, a.crime_no); }); return Array.from(map.entries()).map(([id, crimeNo]) => ({ id, crimeNo })); }, [data]);
  const filteredAccused = useMemo(() => { if (!accusedSearch) return uniqueAccused; const q = accusedSearch.toLowerCase(); return uniqueAccused.filter(a => a.name.toLowerCase().includes(q)); }, [uniqueAccused, accusedSearch]);
  const filteredCases = useMemo(() => { if (!caseSearch) return uniqueCases; const q = caseSearch.toLowerCase(); return uniqueCases.filter(c => c.crimeNo.toLowerCase().includes(q)); }, [uniqueCases, caseSearch]);
  const activeFilterCount = filterAccusedIds.length + filterCaseIds.length + (filterMinAmount ? 1 : 0) + (filterMaxAmount ? 1 : 0);
  const clearAllFilters = () => { setFilterAccusedIds([]); setFilterCaseIds([]); setFilterMinAmount(''); setFilterMaxAmount(''); setSearchTerm(''); setAccusedSearch(''); setCaseSearch(''); };

  // Graph handlers
  const onGraphNodeClick: NodeMouseHandler = useCallback((_, node) => { setSelectedNodeId(node.id); setSelectedEdgeId(null); setDetailOpen(true); }, []);
  const onGraphEdgeClick = useCallback((_: any, edge: Edge) => { setSelectedEdgeId(edge.id); setSelectedNodeId(null); setDetailOpen(true); }, []);
  const clearSelection = () => { setSelectedNodeId(null); setSelectedEdgeId(null); setDetailOpen(false); };

  const scrollTo = (id: string) => { sectionRefs[id]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const timelineTransactions = useMemo(() => { if (!data) return []; return [...filteredTransactions].filter(t => t.txn_date).sort((a, b) => (a.txn_date || '').localeCompare(b.txn_date || '')); }, [data, filteredTransactions]);
  const highValueAmount = useMemo(() => { if (!data || data.transactions.length === 0) return 0; const amounts = data.transactions.map(t => t.amount).sort((a, b) => b - a); return amounts[Math.min(4, amounts.length - 1)] || 0; }, [data]);

  // ════════════════════════════════════════════════════════════════
  // LOADING / ERROR / EMPTY
  // ════════════════════════════════════════════════════════════════

  if (loading) return (
    <div className="flex items-center justify-center h-full bg-slate-50">
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
        <span className="block mt-3 text-sm text-slate-500 font-medium">Analysing financial relationships...</span>
        <span className="block mt-1 text-xs text-slate-400">Tracing transaction flows and cross-case connections</span>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center h-full gap-4 bg-slate-50">
      <AlertCircle className="w-12 h-12 text-red-400" />
      <div className="text-center">
        <h3 className="text-lg font-bold text-slate-800">Unable to Load Financial Intelligence</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-md">{error}</p>
      </div>
      <button onClick={loadData} className="flex items-center gap-2 text-sm font-medium text-emerald-600 hover:text-emerald-800 transition-colors"><RefreshCw className="w-4 h-4" /> Retry</button>
    </div>
  );

  if (!data || data.summary.total_transactions === 0) return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-1"><CreditCard className="w-6 h-6 text-emerald-600" /> Financial Trail Analysis</h1>
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center mt-6">
        <Banknote className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-700">No Financial Data Available</h3>
        <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">No relevant financial relationships were found. Suspect accounts and transaction data must be present in the database for financial trail analysis.</p>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ════════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col h-full bg-slate-50">

      {/* ══════ STICKY HEADER ══════ */}
      <div className="bg-white border-b border-slate-200 shrink-0 sticky top-0 z-30">
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary-900 flex items-center gap-2">
              <CreditCard className="w-7 h-7 text-accent-500" />
              Financial Trail Analysis
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Trace financial relationships, identify suspicious activity, and discover connections across cases.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" placeholder="Search person, account, case..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 transition-all w-56" />
            </div>
            <button onClick={() => setFilterOpen(!filterOpen)}
              className={cn("flex items-center gap-1.5 px-4 py-2 text-sm bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg shadow-sm transition disabled:opacity-50",
                activeFilterCount > 0 && "border-primary-400 text-primary-700")}>
              <Filter className="w-4 h-4" /> Filters
              {activeFilterCount > 0 && <span className="text-[10px] font-bold bg-primary-900 text-white w-5 h-5 rounded-full flex items-center justify-center">{activeFilterCount}</span>}
            </button>
            <button onClick={loadData} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg shadow-sm transition">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ══════ ANCHOR NAV ══════ */}
        <div className="px-6 pb-0 flex items-center gap-0.5 overflow-x-auto scrollbar-none">
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => scrollTo(s.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-all whitespace-nowrap",
                activeSection === s.id
                  ? "border-primary-900 text-primary-900 bg-slate-50/60"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              )}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ══════ FILTER DRAWER ══════ */}
      {filterOpen && (
        <div className="bg-white p-4 rounded-b-xl border-b border-slate-200 shadow-sm shrink-0 z-20">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500" /> Filter Financial Data
            </h3>
            <div className="flex items-center gap-3">
              {activeFilterCount > 0 && <button onClick={clearAllFilters} className="text-xs font-medium text-slate-500 hover:text-slate-700">Clear all</button>}
              <button onClick={() => setFilterOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <button onClick={() => setExpandAccused(!expandAccused)} className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Accused {filterAccusedIds.length > 0 && <span className="text-primary-600">({filterAccusedIds.length})</span>}
                <ChevronDown className={cn("w-3 h-3 transition-transform", expandAccused && "rotate-180")} />
              </button>
              {expandAccused && (<div className="space-y-1.5">
                <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input type="text" placeholder="Search accused..." value={accusedSearch} onChange={e => setAccusedSearch(e.target.value)} className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 transition-all" /></div>
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {filteredAccused.map(a => (<label key={a.id} className="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-800 cursor-pointer py-0.5">
                    <input type="checkbox" checked={filterAccusedIds.includes(a.id)} onChange={e => setFilterAccusedIds(prev => e.target.checked ? [...prev, a.id] : prev.filter(id => id !== a.id))} className="rounded border-slate-300 text-primary-600 focus:ring-primary-500" />{a.name}</label>))}
                </div>
              </div>)}
            </div>
            <div>
              <button onClick={() => setExpandCases(!expandCases)} className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Case / FIR {filterCaseIds.length > 0 && <span className="text-primary-600">({filterCaseIds.length})</span>}
                <ChevronDown className={cn("w-3 h-3 transition-transform", expandCases && "rotate-180")} />
              </button>
              {expandCases && (<div className="space-y-1.5">
                <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input type="text" placeholder="Search case/FIR..." value={caseSearch} onChange={e => setCaseSearch(e.target.value)} className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 transition-all" /></div>
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {filteredCases.map(c => (<label key={c.id} className="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-800 cursor-pointer py-0.5">
                    <input type="checkbox" checked={filterCaseIds.includes(c.id)} onChange={e => setFilterCaseIds(prev => e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id))} className="rounded border-slate-300 text-primary-600 focus:ring-primary-500" />{c.crimeNo}</label>))}
                </div>
              </div>)}
            </div>
            <div>
              <button onClick={() => setExpandAmount(!expandAmount)} className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Amount Range {(filterMinAmount || filterMaxAmount) && <span className="text-primary-600">(active)</span>}
                <ChevronDown className={cn("w-3 h-3 transition-transform", expandAmount && "rotate-180")} />
              </button>
              {expandAmount && (<div className="flex gap-2">
                <input type="number" placeholder="Min" value={filterMinAmount} onChange={e => setFilterMinAmount(e.target.value)} className="w-1/2 h-9 text-sm border border-slate-200 rounded-lg px-3 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 transition-all" />
                <input type="number" placeholder="Max" value={filterMaxAmount} onChange={e => setFilterMaxAmount(e.target.value)} className="w-1/2 h-9 text-sm border border-slate-200 rounded-lg px-3 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 transition-all" />
              </div>)}
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Search</label>
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" placeholder="Person, FIR, Txn ID..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 transition-all" /></div>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MAIN SCROLLABLE CONTENT ══════ */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-6 py-6 space-y-10">

          {/* ─────────── SECTION 01: OVERVIEW ─────────── */}
          <section id="overview" ref={sectionRefs.overview}>
            <SectionHeader title="What's Happening?" subtitle="The financial overview at a glance." />
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              <strong>{data.summary.unique_persons}</strong> persons are connected to{' '}
              <strong>{data.summary.total_accounts}</strong> accounts across{' '}
              <strong>{data.summary.total_transactions}</strong> transactions totaling{' '}
              <strong>{formatCurrency(data.summary.total_amount)}</strong>.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SignalCard icon={Share2} label="Cross-Case Connections" value={data.summary.cross_case_links} suffix="link(s) connecting multiple cases" color="text-purple-600" bg="bg-purple-50" onClick={() => scrollTo('crosscase')} />
              <SignalCard icon={AlertTriangle} label="Suspicious Activity" value={data.summary.anomalies_detected} suffix="anomaly signal(s) detected" color="text-amber-600" bg="bg-amber-50" onClick={() => scrollTo('suspicious')} />
              <SignalCard icon={Workflow} label="Transaction Chains" value={data.transaction_chains.length} suffix="money movement chain(s) identified" color="text-blue-600" bg="bg-blue-50" onClick={() => scrollTo('moneyflow')} />
            </div>
          </section>

          {/* ─────────── SECTION 02: WHAT'S IMPORTANT ─────────── */}
          <section id="relationships" ref={sectionRefs.relationships}>
            <SectionHeader title="Who Is Connected?" subtitle="People, accounts and transactions linked to the investigation." />
            <p className="text-xs text-slate-500 mb-3">
              Key relationships — cross-case links and flagged transactions. Click "Explore Full Network" to see all.
            </p>
            {/* Mini flow diagram */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <MiniFlowChip icon={User} label="Person" color="text-red-700" bg="bg-red-50" border="border-red-200" />
              <ArrowRight className="w-3 h-3 text-slate-300" />
              <MiniFlowChip icon={CreditCard} label="Account" color="text-emerald-700" bg="bg-emerald-50" border="border-emerald-200" />
              <ArrowRight className="w-3 h-3 text-slate-300" />
              <MiniFlowChip icon={CircleDollarSign} label="Transaction" color="text-amber-700" bg="bg-amber-50" border="border-amber-200" />
              <ArrowRight className="w-3 h-3 text-slate-300" />
              <MiniFlowChip icon={CreditCard} label="Account" color="text-emerald-700" bg="bg-emerald-50" border="border-emerald-200" />
              <ArrowRight className="w-3 h-3 text-slate-300" />
              <MiniFlowChip icon={User} label="Person / Case" color="text-red-700" bg="bg-red-50" border="border-red-200" />
            </div>
            {/* Graph toggle */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <LegendItem color="bg-red-500" label="Person" />
                <LegendItem color="bg-emerald-500" label="Account" />
                <LegendItem color="bg-blue-500" label="Case" />
                <span className="text-[9px] text-slate-300">|</span>
                <div className="flex items-center gap-1 text-[10px] text-slate-500"><div className="w-4 h-0.5 bg-emerald-500 rounded" /> owns</div>
                <div className="flex items-center gap-1 text-[10px] text-slate-500"><div className="w-4 h-0.5 bg-amber-500 rounded" /> transfer</div>
              </div>
              <button onClick={() => setShowFullNetwork(!showFullNetwork)}
                className="text-sm font-medium text-primary-600 hover:text-primary-800 px-3 py-1.5 rounded-lg bg-primary-50 border border-primary-200 hover:bg-primary-100 transition-colors">
                {showFullNetwork ? 'Show Key Only' : `Explore Full Network (${data.graph.nodes.length})`}
              </button>
            </div>
            {/* Graph */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden" style={{ height: showFullNetwork ? 520 : 400 }}>
              {activeGraphNodes.length > 0 ? (
                <ReactFlow nodes={activeGraphNodes} edges={activeGraphEdges} onNodeClick={onGraphNodeClick} onEdgeClick={onGraphEdgeClick}
                  fitView fitViewOptions={{ padding: 0.3 }} minZoom={0.2} maxZoom={3} proOptions={{ hideAttribution: true }}>
                  <Background color="#e2e8f0" gap={20} size={1} />
                  <Controls showInteractive={false} style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                </ReactFlow>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400 text-sm">No graph data available</div>
              )}
            </div>
          </section>

          {/* ─────────── SECTION 03: MONEY FLOW ─────────── */}
          <section id="moneyflow" ref={sectionRefs.moneyflow}>
            <SectionHeader title="How Did the Money Move?" subtitle="Follow how money flowed between accounts." />
            {filteredTransactions.length === 0 ? (
              <EmptyState icon={Activity} title="No Transactions" description="No transactions match the current investigation scope." />
            ) : (
              <div className="space-y-2">
                {filteredTransactions.slice(0, 20).map(txn => (
                  <div key={txn.txn_id} className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 cursor-pointer"
                    onClick={() => { setSelectedEdgeId(`txn_${txn.txn_id}`); setSelectedNodeId(null); setDetailOpen(true); }}>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-slate-800 truncate">{txn.from_person}</div>
                        <div className="text-[10px] text-slate-400 truncate">{txn.from_account_masked} · {txn.from_bank}</div>
                      </div>
                      <div className="flex flex-col items-center shrink-0">
                        <div className="text-sm font-bold text-slate-800">{formatCurrency(txn.amount)}</div>
                        <ArrowRight className="w-4 h-4 text-slate-300" />
                      </div>
                      <div className="flex-1 min-w-0 text-right">
                        <div className="text-sm font-bold text-slate-800 truncate">{txn.to_person}</div>
                        <div className="text-[10px] text-slate-400 truncate">{txn.to_account_masked} · {txn.to_bank}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                        <span className="text-[10px] text-slate-400">{formatDate(txn.txn_date)}</span>
                        <div className="flex gap-1">
                          {txn.flagged && <span className="text-[8px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">FLAGGED</span>}
                          {txn.amount >= highValueAmount && highValueAmount > 0 && <span className="text-[8px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">HIGH VALUE</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-[9px] text-slate-400">
                      <span>Txn #{txn.txn_id}</span><span>·</span><span>FIR {txn.crime_no}</span>
                    </div>
                  </div>
                ))}
                {filteredTransactions.length > 20 && <div className="text-center text-xs text-slate-400 py-2">Showing 20 of {filteredTransactions.length} transactions.</div>}
              </div>
            )}
          </section>

          {/* ─────────── SECTION 04: SUSPICIOUS ACTIVITY ─────────── */}
          <section id="suspicious" ref={sectionRefs.suspicious}>
            <SectionHeader title="Why Is It Suspicious?" subtitle="Deterministic signals detected from transaction behaviour." />
            {data.anomalies.length === 0 ? (
              <EmptyState icon={AlertOctagon} title="No Anomalies Detected" description="No financial anomalies were identified using the current analysis." />
            ) : (
              <div className="space-y-3">
                {data.anomalies.map((anomaly, idx) => (
                  <div key={idx} className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">{(() => { const AnomalyIcon = ANOMALY_LUCIDE[anomaly.type] || AlertTriangle; return <AnomalyIcon className="w-5 h-5 text-amber-600" />; })()}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-slate-800">{anomaly.title}</span>
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200 uppercase">{anomaly.type.replace(/_/g, ' ')}</span>
                        </div>
                        <div className="mt-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">What</div>
                          <p className="text-[11px] text-slate-700">{anomaly.reason}</p>
                        </div>
                        {ANOMALY_WHY[anomaly.type] && (
                          <div className="mt-2 p-2.5 bg-amber-50 rounded-lg border border-amber-100">
                            <div className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-0.5">Why It Matters</div>
                            <p className="text-[11px] text-amber-800">{ANOMALY_WHY[anomaly.type]}</p>
                          </div>
                        )}
                        {anomaly.evidence && Object.keys(anomaly.evidence).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {Object.entries(anomaly.evidence).map(([key, val]) => (
                              <span key={key} className="text-[9px] font-medium bg-white text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full">{key.replace(/_/g, ' ')}: {typeof val === 'number' ? val.toLocaleString() : String(val)}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ─────────── SECTION 05: CROSS-CASE ─────────── */}
          <section id="crosscase" ref={sectionRefs.crosscase}>
            <SectionHeader title="Which Cases Are Connected?" subtitle="Financial relationships linking otherwise separate cases." />
            {data.cross_case_links.length === 0 ? (
              <EmptyState icon={Link2} title="No Cross-Case Connections" description="No cross-case financial connections were identified in the current dataset." />
            ) : (
              <div className="space-y-3">
                {data.cross_case_links.map((link, idx) => (
                  <div key={idx} className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center shrink-0"><Link2 className="w-5 h-5 text-purple-600" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-slate-800">{link.accused_name}</span>
                          <span className="text-[9px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">CROSS-CASE CONNECTION</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mb-3">{link.bank_name} · {link.account_masked}</div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-slate-50 rounded-lg p-2.5 text-center"><div className="text-lg font-black text-slate-900">{link.case_count}</div><div className="text-[10px] text-slate-500 font-medium">Cases Connected</div></div>
                          <div className="bg-slate-50 rounded-lg p-2.5 text-center"><div className="text-lg font-black text-slate-900">{link.transaction_count}</div><div className="text-[10px] text-slate-500 font-medium">Transactions</div></div>
                          <div className="bg-slate-50 rounded-lg p-2.5 text-center"><div className="text-lg font-black text-slate-900">{link.connected_cases.length}</div><div className="text-[10px] text-slate-500 font-medium">Distinct Cases</div></div>
                        </div>
                        {link.connected_cases.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1">
                            {link.connected_cases.map((caseId, i) => { const caseAcct = data.accounts.find(a => a.case_master_id === caseId); const firLabel = caseAcct?.crime_no || `#${caseId}`; return <span key={i} className="text-[9px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded">FIR {firLabel}</span>; })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ─────────── SECTION 06: NEXT ACTIONS ─────────── */}
          <section id="nextactions" ref={sectionRefs.nextactions}>
            <SectionHeader title="What Should I Investigate Next?" subtitle="Evidence-backed areas that may require further investigation." />
            {data.leads.length === 0 ? (
              <EmptyState icon={Target} title="No Investigative Leads" description="No additional financial investigative leads were generated for the current dataset." />
            ) : (
              <>
                <p className="text-[11px] text-slate-500 mb-3">{data.leads.length} evidence-backed lead{data.leads.length !== 1 ? 's' : ''} for your next investigative step.</p>
                <div className="space-y-3">
                  {data.leads.map((lead, idx) => (
                    <div key={idx} className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">{(() => { const LeadIcon = LEAD_LUCIDE[lead.lead_type] || FileText; return <LeadIcon className="w-5 h-5 text-emerald-600" />; })()}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold text-slate-800">{lead.title}</span>
                            {lead.source_engines.length > 0 && <span className="text-[9px] font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded">{lead.source_engines[0].replace(/_/g, ' ')}</span>}
                          </div>
                          <p className="text-[11px] text-slate-600 mb-2">{lead.reason}</p>
                          {lead.evidence_signals.length > 0 && (
                            <div className="space-y-1">{lead.evidence_signals.slice(0, 3).map((signal, i) => (
                              <div key={i} className="flex items-center gap-1.5 text-[10px] text-slate-500"><span className="w-1 h-1 bg-emerald-500 rounded-full shrink-0" />{signal}</div>
                            ))}</div>
                          )}
                          {lead.action && <div className="mt-2 text-[10px] text-emerald-600 font-medium">→ {lead.action}</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* ─────────── SECTION 07: ALL EVIDENCE ─────────── */}
          <section id="evidence" ref={sectionRefs.evidence}>
            <SectionHeader title="All Financial Evidence" subtitle="Organized access to every piece of financial intelligence." />

            {/* Summary grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <EvidenceStat icon={<Users className="w-4 h-4" />} label="Accounts" value={data.summary.total_accounts} color="emerald" />
              <EvidenceStat icon={<Activity className="w-4 h-4" />} label="Transactions" value={data.summary.total_transactions} sub={data.summary.flagged_transactions > 0 ? `${data.summary.flagged_transactions} flagged` : undefined} color="blue" />
              <EvidenceStat icon={<DollarSign className="w-4 h-4" />} label="Total Value" value={formatCurrency(data.summary.total_amount)} color="amber" />
              <EvidenceStat icon={<TrendingUp className="w-4 h-4" />} label="Persons" value={data.summary.unique_persons} color="slate" />
            </div>

            {/* Timeline */}
            {timelineTransactions.length > 0 && (
              <div className="mb-8">
                <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-slate-500" /> Transaction Timeline</h3>
                <div className="relative pl-6 border-l-2 border-emerald-200 space-y-3">
                  {timelineTransactions.slice(0, 15).map((txn) => (
                    <div key={txn.txn_id} className="relative">
                      <div className={cn("absolute -left-[25px] top-1.5 w-3 h-3 rounded-full border-2 border-white", txn.flagged ? "bg-red-500" : "bg-emerald-500")} />
                      <div className="bg-white border border-slate-100 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => { setSelectedEdgeId(`txn_${txn.txn_id}`); setSelectedNodeId(null); setDetailOpen(true); }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold text-slate-400">{formatDate(txn.txn_date)}</span>
                          <span className="text-xs font-bold text-slate-800">{formatCurrency(txn.amount)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-emerald-700">{txn.from_person}</span>
                          <ArrowRight className="w-3 h-3 text-slate-400" />
                          <span className="font-medium text-blue-700">{txn.to_person}</span>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-slate-400">{txn.from_account_masked} → {txn.to_account_masked}</span>
                          <span className="text-[10px] text-slate-400">FIR {txn.crime_no}</span>
                        </div>
                        {txn.flagged && <span className="inline-block mt-1 text-[9px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">FLAGGED</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Full transaction table */}
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-slate-500" /> All Transactions ({filteredTransactions.length})</h3>
              {filteredTransactions.length === 0 ? (
                <EmptyState icon={Activity} title="No Transactions" description="No transactions match the current filters." />
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left py-2.5 px-3 font-bold text-slate-500">Txn ID</th>
                        <th className="text-left py-2.5 px-3 font-bold text-slate-500">Date</th>
                        <th className="text-left py-2.5 px-3 font-bold text-slate-500">From</th>
                        <th className="text-left py-2.5 px-3 font-bold text-slate-500">To</th>
                        <th className="text-right py-2.5 px-3 font-bold text-slate-500">Amount</th>
                        <th className="text-left py-2.5 px-3 font-bold text-slate-500">Case</th>
                        <th className="text-center py-2.5 px-3 font-bold text-slate-500">Status</th>
                      </tr></thead>
                      <tbody>
                        {filteredTransactions.map(txn => (
                          <tr key={txn.txn_id} className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors"
                            onClick={() => { setSelectedEdgeId(`txn_${txn.txn_id}`); setSelectedNodeId(null); setDetailOpen(true); }}>
                            <td className="py-2 px-3 font-mono text-slate-600">#{txn.txn_id}</td>
                            <td className="py-2 px-3 text-slate-600">{formatDate(txn.txn_date)}</td>
                            <td className="py-2 px-3"><div className="font-medium text-slate-800">{txn.from_person}</div><div className="text-[10px] text-slate-400">{txn.from_account_masked}</div></td>
                            <td className="py-2 px-3"><div className="font-medium text-slate-800">{txn.to_person}</div><div className="text-[10px] text-slate-400">{txn.to_account_masked}</div></td>
                            <td className="py-2 px-3 text-right font-bold text-slate-800">{formatCurrency(txn.amount)}</td>
                            <td className="py-2 px-3 text-slate-600">{txn.crime_no}</td>
                            <td className="py-2 px-3 text-center">
                              {txn.flagged ? <span className="text-[9px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full border border-red-200">FLAGGED</span> : <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Normal</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </section>

          <div className="h-16" /> {/* bottom spacer */}
        </div>
      </div>

      {/* ══════ DETAIL DRAWER ══════ */}
      {detailOpen && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40 lg:hidden" onClick={clearSelection} />
          <div className="fixed inset-y-0 right-0 w-80 lg:w-96 bg-white border-l border-slate-200 shadow-xl z-50 flex flex-col" style={{ animation: 'slideInRight 0.2s ease-out' }}>
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between shrink-0">
              <span className="text-xs font-bold text-slate-700">Details</span>
              <button onClick={clearSelection} className="text-slate-400 hover:text-slate-600 transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {selectedPerson && (<DetailPersonView person={selectedPerson} data={data} formatCurrency={formatCurrency} formatDate={formatDate} maskAccount={maskAccount} />)}
              {selectedAccount && !selectedPerson && (<DetailAccountView account={selectedAccount} data={data} formatCurrency={formatCurrency} formatDate={formatDate} maskAccount={maskAccount} />)}
              {selectedTransaction && (<DetailTransactionView transaction={selectedTransaction} formatCurrency={formatCurrency} formatDate={formatDate} />)}
              {selectedEdge && !selectedTransaction && (<DetailEdgeView edge={selectedEdge} />)}
              {!selectedPerson && !selectedAccount && !selectedEdge && (
                <div className="text-center py-12 text-xs text-slate-400"><Layers className="w-8 h-8 mx-auto mb-2 text-slate-200" />Select a node or edge to view details</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════════════════════════════════

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">{title}</h2>
      <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
    </div>
  );
}

function SignalCard({ icon: Icon, label, value, suffix, color, bg, onClick }: { icon: any; label: string; value: number; suffix: string; color: string; bg: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 hover:shadow-md transition-all duration-200 flex flex-col cursor-pointer group text-left">
      <div className="flex justify-between items-start mb-3">
        <div className={`p-2 rounded-lg ${bg} ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
      </div>
      <div className="text-2xl font-black text-slate-900 mb-0.5">{value}</div>
      <div className="text-sm text-slate-500 font-medium">{label}</div>
      <div className="text-xs text-slate-400 mt-0.5">{suffix}</div>
    </button>
  );
}

function MiniFlowChip({ icon: Icon, label, color, bg, border }: { icon: any; label: string; color: string; bg: string; border: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border ${border} ${bg} ${color}`}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </span>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
      <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
      {label}
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="text-center py-10 bg-white border border-slate-200 rounded-xl">
      <Icon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
      <h3 className="text-sm font-bold text-slate-600">{title}</h3>
      <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">{description}</p>
    </div>
  );
}

function EvidenceStat({ icon, label, value, sub, color, bg }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string; bg: string }) {
  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
      <div className={`w-12 h-12 ${bg} ${color} rounded-xl flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div>
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</div>
        <div className="text-xl font-black text-slate-900 mt-0.5 truncate max-w-[140px]">{value}</div>
        {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={cn("font-semibold text-right text-xs", highlight ? "text-emerald-700 text-sm" : "text-slate-800")}>{value}</span>
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-3 mb-1.5">{text}</div>;
}

function DetailPersonView({ person, data, formatCurrency, formatDate, maskAccount }: { person: { accused_master_id: number; name: string }; data: FinancialAnalysisResponse; formatCurrency: (n: number) => string; formatDate: (s: string | null) => string; maskAccount: (s: string) => string }) {
  const linkedAccounts = data.accounts.filter(a => a.accused_master_id === person.accused_master_id);
  const relatedTxns = data.transactions.filter(t => t.from_person === person.name || t.to_person === person.name).slice(0, 8);
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-3"><div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center"><User className="w-5 h-5 text-red-600" /></div><div><div className="text-sm font-bold text-slate-800">{person.name}</div><div className="text-[10px] text-slate-500">Accused #{person.accused_master_id}</div></div></div>
      <SectionLabel text="Linked Accounts" />
      {linkedAccounts.length === 0 ? <p className="text-[10px] text-slate-400">No accounts linked</p> : linkedAccounts.map(a => (
        <div key={a.account_id} className="bg-slate-50 rounded-lg p-2.5 border border-slate-100 text-xs mb-1.5"><div className="font-bold text-emerald-700">{maskAccount(a.account_number)}</div><div className="text-[10px] text-slate-500 mt-0.5">{a.bank_name} · FIR {a.crime_no}</div></div>
      ))}
      <SectionLabel text="Recent Transactions" />
      {relatedTxns.length === 0 ? <p className="text-[10px] text-slate-400">No transactions found</p> : relatedTxns.map(t => (
        <div key={t.txn_id} className="bg-slate-50 rounded-lg p-2.5 border border-slate-100 text-xs mb-1.5">
          <div className="flex justify-between"><span className="font-medium text-slate-700">#{t.txn_id}</span><span className="font-bold text-slate-800">{formatCurrency(t.amount)}</span></div>
          <div className="text-[10px] text-slate-500 mt-0.5">{t.from_person} → {t.to_person} · {formatDate(t.txn_date)}</div>
          {t.flagged && <span className="inline-block mt-0.5 text-[8px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded">FLAGGED</span>}
        </div>
      ))}
    </div>
  );
}

function DetailAccountView({ account, data, formatCurrency, formatDate, maskAccount }: { account: FinancialAccount; data: FinancialAnalysisResponse; formatCurrency: (n: number) => string; formatDate: (s: string | null) => string; maskAccount: (s: string) => string }) {
  const relatedTxns = data.transactions.filter(t => t.from_account_id === account.account_id || t.to_account_id === account.account_id).slice(0, 8);
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-3"><div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center"><CreditCard className="w-5 h-5 text-emerald-600" /></div><div><div className="text-sm font-bold text-slate-800">{maskAccount(account.account_number)}</div><div className="text-[10px] text-slate-500">{account.bank_name} · Account #{account.account_id}</div></div></div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-slate-50 rounded-lg p-2.5 text-center"><div className="text-xs font-bold text-slate-800">{account.accused_name}</div><div className="text-[9px] text-slate-500">Owner</div></div>
        <div className="bg-slate-50 rounded-lg p-2.5 text-center"><div className="text-xs font-bold text-slate-800">FIR {account.crime_no}</div><div className="text-[9px] text-slate-500">Case</div></div>
      </div>
      <SectionLabel text="Transactions" />
      {relatedTxns.length === 0 ? <p className="text-[10px] text-slate-400">No transactions found</p> : relatedTxns.map(t => (
        <div key={t.txn_id} className="bg-slate-50 rounded-lg p-2.5 border border-slate-100 text-xs mb-1.5">
          <div className="flex justify-between"><span className="text-[10px] text-slate-400">{formatDate(t.txn_date)}</span><span className="font-bold text-slate-800">{formatCurrency(t.amount)}</span></div>
          <div className="text-[10px] text-slate-600 mt-0.5">{t.from_person}({t.from_account_masked}) → {t.to_person}({t.to_account_masked})</div>
          {t.flagged && <span className="inline-block mt-0.5 text-[8px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded">FLAGGED</span>}
        </div>
      ))}
    </div>
  );
}

function DetailTransactionView({ transaction, formatCurrency, formatDate }: { transaction: FinancialTransaction; formatCurrency: (n: number) => string; formatDate: (s: string | null) => string }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-3"><div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center"><DollarSign className="w-5 h-5 text-amber-600" /></div><div><div className="text-sm font-bold text-slate-800">Transaction #{transaction.txn_id}</div><div className="text-[10px] text-slate-500">{formatDate(transaction.txn_date)}</div></div></div>
      <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100 space-y-2.5">
        <DetailRow label="Amount" value={formatCurrency(transaction.amount)} highlight />
        <DetailRow label="From" value={`${transaction.from_person} (${transaction.from_account_masked})`} />
        <DetailRow label="From Bank" value={transaction.from_bank} />
        <DetailRow label="To" value={`${transaction.to_person} (${transaction.to_account_masked})`} />
        <DetailRow label="To Bank" value={transaction.to_bank} />
        <DetailRow label="Case" value={`FIR ${transaction.crime_no}`} />
        <DetailRow label="Date" value={formatDate(transaction.txn_date)} />
        <DetailRow label="Status" value={transaction.flagged ? 'Flagged' : 'Normal'} />
      </div>
    </div>
  );
}

function DetailEdgeView({ edge }: { edge: any }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-3"><div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center"><Link2 className="w-5 h-5 text-blue-600" /></div><div><div className="text-sm font-bold text-slate-800">Relationship</div><div className="text-[10px] text-slate-500">{edge.type}</div></div></div>
      <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100 text-xs space-y-2.5">
        <DetailRow label="Type" value={edge.type} />
        <DetailRow label="Label" value={edge.label} />
        <DetailRow label="Source" value={edge.source} />
        <DetailRow label="Target" value={edge.target} />
      </div>
    </div>
  );
}
