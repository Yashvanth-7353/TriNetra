import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, Loader2, AlertCircle, X, Users, CreditCard, FileText,
  Calendar, ChevronRight, ChevronDown, ChevronUp, ExternalLink,
  Filter, ArrowRight, DollarSign, Link2, AlertTriangle, TrendingUp,
  Activity, RefreshCw, Download, Layers, Eye, Banknote, CircleDollarSign,
  GitBranch, Shuffle, Fingerprint
} from 'lucide-react';
import ReactFlow, { Background, Controls, useNodesState, useEdgesState, MarkerType } from 'reactflow';
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

// ── Graph Styling ──
const GRAPH_NODE_COLORS: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  person: { bg: '#991b1b', border: '#ef4444', text: '#ffffff', icon: '👤' },
  account: { bg: '#065f46', border: '#10b981', text: '#ffffff', icon: '💰' },
  case: { bg: '#1e40af', border: '#3b82f6', text: '#ffffff', icon: '📋' },
};

const GRAPH_EDGE_COLORS: Record<string, { color: string; label: string }> = {
  owns: { color: '#10b981', label: 'owns' },
  transferred: { color: '#f59e0b', label: 'transfer' },
};

const ANOMALY_ICONS: Record<string, string> = {
  high_volume_account: '📊',
  high_value_transaction: '💎',
  rapid_movement: '⚡',
  bidirectional_transfers: '↔️',
  cross_case_link: '🔗',
};

const LEAD_TYPE_ICONS: Record<string, string> = {
  financial_cross_case: '🔗',
  financial_bidirectional: '↔️',
  financial_high_volume: '📊',
  financial_chain: '⛓️',
  financial_shared_bank: '🏦',
};

// ── Helpers ──
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
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return d; }
}

// ── Graph Adapter: Financial graph → ReactFlow ──
function useFinancialGraphNodes(
  graph: FinancialGraph | null,
  selectedId: string | null,
  onSelect: (id: string, type: string) => void
) {
  return useMemo(() => {
    if (!graph || !graph.nodes.length) return [];
    // Position nodes: group by type
    const positions: Record<string, { x: number; y: number }> = {};
    const typeGroups: Record<string, typeof graph.nodes> = {};
    graph.nodes.forEach(n => {
      if (!typeGroups[n.type]) typeGroups[n.type] = [];
      typeGroups[n.type].push(n);
    });

    const typeOrder = ['person', 'account', 'case'];
    let yOff = 50;
    typeOrder.forEach(type => {
      const nodes = typeGroups[type] || [];
      nodes.forEach((n, i) => {
        positions[n.id] = { x: 80 + i * 180, y: yOff };
      });
      if (nodes.length > 0) yOff += 160;
    });

    // Force-directed refinement
    const allNodes = graph.nodes;
    for (let iter = 0; iter < 40; iter++) {
      const forces: Record<string, { fx: number; fy: number }> = {};
      allNodes.forEach(n => { forces[n.id] = { fx: 0, fy: 0 }; });

      for (let i = 0; i < allNodes.length; i++) {
        for (let j = i + 1; j < allNodes.length; j++) {
          const a = allNodes[i].id, b = allNodes[j].id;
          const dx = positions[a].x - positions[b].x;
          const dy = positions[a].y - positions[b].y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
          const repulse = 6000 / (dist * dist);
          forces[a].fx += (dx / dist) * repulse;
          forces[a].fy += (dy / dist) * repulse;
          forces[b].fx -= (dx / dist) * repulse;
          forces[b].fy -= (dy / dist) * repulse;
        }
      }

      graph.edges.forEach(e => {
        if (!positions[e.source] || !positions[e.target]) return;
        const dx = positions[e.target].x - positions[e.source].x;
        const dy = positions[e.target].y - positions[e.source].y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
        const attract = (dist - 140) * 0.02;
        forces[e.source].fx += (dx / dist) * attract;
        forces[e.source].fy += (dy / dist) * attract;
        forces[e.target].fx -= (dx / dist) * attract;
        forces[e.target].fy -= (dy / dist) * attract;
      });

      const cooling = 1 - iter / 45;
      allNodes.forEach(n => {
        const f = forces[n.id];
        const maxF = 12 * cooling;
        positions[n.id].x += Math.max(-maxF, Math.min(maxF, f.fx));
        positions[n.id].y += Math.max(-maxF, Math.min(maxF, f.fy));
      });
    }

    return allNodes.map(n => {
      const pos = positions[n.id] || { x: 300, y: 200 };
      const cfg = GRAPH_NODE_COLORS[n.type] || GRAPH_NODE_COLORS.person;
      const isSelected = selectedId === n.id;
      const label = (n.label || '').replace(/\n/g, ' ');
      return {
        id: n.id,
        position: pos,
        data: {
          label: (
            <div style={{ textAlign: 'center', lineHeight: 1.3, cursor: 'pointer' }}>
              <div style={{ fontSize: 16 }}>{cfg.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 10, wordBreak: 'break-word', color: cfg.text }}>
                {label.length > 28 ? label.slice(0, 25) + '...' : label}
              </div>
              <div style={{ fontSize: 8, opacity: 0.8, marginTop: 2, color: cfg.text }}>
                {n.type.toUpperCase()}
              </div>
            </div>
          ),
        },
        style: {
          background: cfg.bg,
          color: cfg.text,
          border: `2px solid ${isSelected ? '#fbbf24' : cfg.border}`,
          borderRadius: n.type === 'person' ? '50%' : '12px',
          padding: '8px 12px',
          fontWeight: '600',
          fontSize: '10px',
          boxShadow: isSelected
            ? `0 0 0 3px #fbbf24, 0 4px 16px rgba(0,0,0,0.25)`
            : '0 2px 10px rgba(0,0,0,0.18)',
          width: 130,
          minWidth: 130,
          minHeight: 70,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'box-shadow 0.2s, border-color 0.2s',
        },
      };
    });
  }, [graph, selectedId]);
}

function useFinancialGraphEdges(graph: FinancialGraph | null, selectedId: string | null) {
  return useMemo(() => {
    if (!graph || !graph.edges.length) return [];
    return graph.edges.map(e => {
      const cfg = GRAPH_EDGE_COLORS[e.type] || { color: '#94a3b8', label: e.type };
      const isSelected = selectedId === e.id;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label || cfg.label,
        animated: e.type === 'transferred',
        style: {
          stroke: isSelected ? '#fbbf24' : cfg.color,
          strokeWidth: isSelected ? 3 : 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isSelected ? '#fbbf24' : cfg.color,
          width: 16,
          height: 16,
        },
        labelStyle: {
          fill: '#334155',
          fontWeight: 600,
          fontSize: 9,
        },
        labelBgStyle: {
          fill: '#ffffff',
          fillOpacity: 0.95,
          rx: 4,
          ry: 4,
          stroke: cfg.color,
          strokeWidth: 1,
        },
        labelBgPadding: [4, 2] as [number, number],
      };
    });
  }, [graph, selectedId]);
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════

export default function FinancialTrailPage() {
  // ── Data state ──
  const [data, setData] = useState<FinancialAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ── Filter state ──
  const [filterAccusedIds, setFilterAccusedIds] = useState<number[]>([]);
  const [filterCaseIds, setFilterCaseIds] = useState<number[]>([]);
  const [filterMinAmount, setFilterMinAmount] = useState<string>('');
  const [filterMaxAmount, setFilterMaxAmount] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  // ── Graph selection ──
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // ── Active tab ──
  const [activeTab, setActiveTab] = useState<'graph' | 'transactions' | 'crosscase' | 'anomalies' | 'leads' | 'timeline'>('graph');

  // ── Detail panel ──
  const [detailOpen, setDetailOpen] = useState(false);

  // ── Load data ──
  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchFinancialAnalysis(
        filterAccusedIds.length > 0 ? filterAccusedIds : undefined,
        filterCaseIds.length > 0 ? filterCaseIds : undefined
      );
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Failed to load financial data');
    } finally {
      setLoading(false);
    }
  }, [filterAccusedIds, filterCaseIds]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Filtered transactions ──
  const filteredTransactions = useMemo(() => {
    if (!data) return [];
    let txns = data.transactions;
    if (filterMinAmount) txns = txns.filter(t => t.amount >= Number(filterMinAmount));
    if (filterMaxAmount) txns = txns.filter(t => t.amount <= Number(filterMaxAmount));
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      txns = txns.filter(t =>
        t.from_person?.toLowerCase().includes(q) ||
        t.to_person?.toLowerCase().includes(q) ||
        t.crime_no?.toLowerCase().includes(q) ||
        String(t.txn_id).includes(q)
      );
    }
    return txns;
  }, [data, filterMinAmount, filterMaxAmount, searchTerm]);

  // ── Graph nodes/edges ──
  const graphNodes = useFinancialGraphNodes(data?.graph || null, selectedNodeId, (id) => {
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
    setDetailOpen(true);
  });
  const graphEdges = useFinancialGraphEdges(data?.graph || null, selectedEdgeId);

  // ── Selected entity ──
  const selectedAccount = useMemo(() => {
    if (!selectedNodeId || !data) return null;
    if (!selectedNodeId.startsWith('account_')) return null;
    const accountId = Number(selectedNodeId.replace('account_', ''));
    return data.accounts.find(a => a.account_id === accountId) ||
           data.counterparty_accounts.find(a => a.account_id === accountId) || null;
  }, [selectedNodeId, data]);

  const selectedPerson = useMemo(() => {
    if (!selectedNodeId || !data) return null;
    if (!selectedNodeId.startsWith('person_')) return null;
    const personId = Number(selectedNodeId.replace('person_', ''));
    const acct = data.accounts.find(a => a.accused_master_id === personId);
    return acct ? { accused_master_id: personId, name: acct.accused_name } : null;
  }, [selectedNodeId, data]);

  const selectedEdge = useMemo(() => {
    if (!selectedEdgeId || !data) return null;
    return data.graph.edges.find(e => e.id === selectedEdgeId) || null;
  }, [selectedEdgeId, data]);

  const selectedTransaction = useMemo(() => {
    if (!selectedEdge || !data) return null;
    if (selectedEdge.type !== 'transferred') return null;
    const txnId = selectedEdge.data?.txn_id;
    if (!txnId) return null;
    return data.transactions.find(t => t.txn_id === txnId) || null;
  }, [selectedEdge, data]);

  // ── Clear selection ──
  const clearSelection = () => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setDetailOpen(false);
  };

  // ── Handle graph node click ──
  const onGraphNodeClick: NodeMouseHandler = useCallback((_, node) => {
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    setDetailOpen(true);
  }, []);

  // ── Handle graph edge click ──
  const onGraphEdgeClick = useCallback((_: any, edge: Edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
    setDetailOpen(true);
  }, []);

  // ── Sorted transactions for timeline ──
  const timelineTransactions = useMemo(() => {
    if (!data) return [];
    return [...data.transactions]
      .filter(t => t.txn_date)
      .sort((a, b) => (a.txn_date || '').localeCompare(b.txn_date || ''));
  }, [data]);

  // ── Unique accused for filter ──
  const uniqueAccused = useMemo(() => {
    if (!data) return [];
    const map = new Map<number, string>();
    data.accounts.forEach(a => {
      if (a.accused_master_id && a.accused_name) map.set(a.accused_master_id, a.accused_name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [data]);

  // ── Unique cases for filter ──
  const uniqueCases = useMemo(() => {
    if (!data) return [];
    const map = new Map<number, string>();
    data.accounts.forEach(a => {
      if (a.case_master_id && a.crime_no) map.set(a.case_master_id, a.crime_no);
    });
    return Array.from(map.entries()).map(([id, crimeNo]) => ({ id, crimeNo }));
  }, [data]);

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
        <span className="ml-3 text-slate-500">Loading financial intelligence...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <div className="text-center">
          <h3 className="text-lg font-bold text-slate-800">Failed to Load Financial Data</h3>
          <p className="text-sm text-slate-500 mt-1">{error}</p>
        </div>
        <button onClick={loadData} className="flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-800">
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    );
  }

  if (!data || data.summary.total_transactions === 0) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <CreditCard className="w-7 h-7 text-emerald-600" />
            Financial Trail Analysis
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Explore financial relationships, transaction flows, and cross-case connections.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <Banknote className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-700">No Financial Data Available</h3>
          <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
            No relevant financial relationships were found. Suspect accounts and transaction data
            must be present in the database for financial trail analysis.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── HEADER ── */}
      <div className="px-6 py-4 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <CreditCard className="w-6 h-6 text-emerald-600" />
              Financial Trail Analysis
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Explore financial relationships, transaction flows, and cross-case connections.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-primary-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
        </div>

        {/* ── SUMMARY METRICS ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
          <SummaryCard icon={<Users className="w-4 h-4" />} label="Accounts" value={String(data.summary.total_accounts)} color="emerald" />
          <SummaryCard icon={<Activity className="w-4 h-4" />} label="Transactions" value={String(data.summary.total_transactions)} color="blue" />
          <SummaryCard icon={<DollarSign className="w-4 h-4" />} label="Total Value" value={formatCurrency(data.summary.total_amount)} color="amber" />
          <SummaryCard icon={<Link2 className="w-4 h-4" />} label="Cross-Case" value={String(data.summary.cross_case_links)} color="purple" />
          <SummaryCard icon={<AlertTriangle className="w-4 h-4" />} label="Anomalies" value={String(data.summary.anomalies_detected)} color="red" />
          <SummaryCard icon={<TrendingUp className="w-4 h-4" />} label="Persons" value={String(data.summary.unique_persons)} color="slate" />
        </div>
      </div>

      {/* ── MAIN WORKSPACE ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── LEFT: Filters ── */}
        <div className="w-64 bg-white border-r border-slate-200 overflow-y-auto shrink-0 p-4 space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Filter className="w-4 h-4" /> Filters
          </div>

          {/* Accused filter */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Accused</label>
            <div className="mt-1 space-y-1 max-h-36 overflow-y-auto">
              {uniqueAccused.map(a => (
                <label key={a.id} className="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterAccusedIds.includes(a.id)}
                    onChange={e => {
                      setFilterAccusedIds(prev =>
                        e.target.checked ? [...prev, a.id] : prev.filter(id => id !== a.id)
                      );
                    }}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  {a.name}
                </label>
              ))}
            </div>
          </div>

          {/* Case filter */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Case / FIR</label>
            <div className="mt-1 space-y-1 max-h-36 overflow-y-auto">
              {uniqueCases.map(c => (
                <label key={c.id} className="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterCaseIds.includes(c.id)}
                    onChange={e => {
                      setFilterCaseIds(prev =>
                        e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id)
                      );
                    }}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  {c.crimeNo}
                </label>
              ))}
            </div>
          </div>

          {/* Amount range */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Amount Range</label>
            <div className="mt-1 flex gap-2">
              <input
                type="number"
                placeholder="Min"
                value={filterMinAmount}
                onChange={e => setFilterMinAmount(e.target.value)}
                className="w-1/2 text-xs border border-slate-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
              />
              <input
                type="number"
                placeholder="Max"
                value={filterMaxAmount}
                onChange={e => setFilterMaxAmount(e.target.value)}
                className="w-1/2 text-xs border border-slate-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Search */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Search</label>
            <div className="mt-1 relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Person, FIR, Txn ID..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded pl-7 pr-2 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Graph Legend */}
          <div className="pt-2 border-t border-slate-100">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Legend</div>
            <div className="space-y-1.5">
              <LegendItem color="#991b1b" icon="👤" label="Person" />
              <LegendItem color="#065f46" icon="💰" label="Account" />
              <LegendItem color="#1e40af" icon="📋" label="Case" />
              <div className="flex items-center gap-2 text-[10px] text-slate-600">
                <div className="w-6 h-0.5 bg-emerald-500 rounded" /> owns account
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-600">
                <div className="w-6 h-0.5 bg-amber-500 rounded" style={{ borderStyle: 'dashed' }} /> transfer
              </div>
            </div>
          </div>
        </div>

        {/* ── CENTER: Main content ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-center gap-1 px-4 pt-3 pb-0 bg-white border-b border-slate-200 overflow-x-auto shrink-0">
            {([
              { key: 'graph', label: 'Network Graph', icon: <Layers className="w-3.5 h-3.5" /> },
              { key: 'transactions', label: 'Transactions', icon: <Activity className="w-3.5 h-3.5" /> },
              { key: 'timeline', label: 'Timeline', icon: <Calendar className="w-3.5 h-3.5" /> },
              { key: 'crosscase', label: 'Cross-Case', icon: <Link2 className="w-3.5 h-3.5" /> },
              { key: 'anomalies', label: 'Anomalies', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
              { key: 'leads', label: 'Leads', icon: <Eye className="w-3.5 h-3.5" /> },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
                  activeTab === tab.key
                    ? "border-emerald-600 text-emerald-700 bg-emerald-50/50"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                )}
              >
                {tab.icon} {tab.label}
                {tab.key === 'crosscase' && data.cross_case_links.length > 0 && (
                  <span className="ml-1 text-[9px] font-bold bg-purple-100 text-purple-700 px-1.5 rounded-full">
                    {data.cross_case_links.length}
                  </span>
                )}
                {tab.key === 'anomalies' && data.anomalies.length > 0 && (
                  <span className="ml-1 text-[9px] font-bold bg-red-100 text-red-700 px-1.5 rounded-full">
                    {data.anomalies.length}
                  </span>
                )}
                {tab.key === 'leads' && data.leads.length > 0 && (
                  <span className="ml-1 text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 rounded-full">
                    {data.leads.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-auto">
            {/* ── GRAPH TAB ── */}
            {activeTab === 'graph' && (
              <div className="h-full relative">
                {graphNodes.length > 0 ? (
                  <ReactFlow
                    nodes={graphNodes}
                    edges={graphEdges}
                    onNodeClick={onGraphNodeClick}
                    onEdgeClick={onGraphEdgeClick}
                    fitView
                    fitViewOptions={{ padding: 0.3 }}
                    minZoom={0.2}
                    maxZoom={3}
                    proOptions={{ hideAttribution: true }}
                  >
                    <Background color="#e2e8f0" gap={20} size={1} />
                    <Controls
                      showInteractive={false}
                      style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}
                    />
                  </ReactFlow>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                    No graph data available
                  </div>
                )}
              </div>
            )}

            {/* ── TRANSACTIONS TAB ── */}
            {activeTab === 'transactions' && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-600">
                    {filteredTransactions.length} transactions
                    {filteredTransactions.length !== data.transactions.length && (
                      <span className="text-slate-400 ml-1">(filtered from {data.transactions.length})</span>
                    )}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 px-3 font-bold text-slate-500">Txn ID</th>
                        <th className="text-left py-2 px-3 font-bold text-slate-500">Date</th>
                        <th className="text-left py-2 px-3 font-bold text-slate-500">From</th>
                        <th className="text-left py-2 px-3 font-bold text-slate-500">To</th>
                        <th className="text-right py-2 px-3 font-bold text-slate-500">Amount</th>
                        <th className="text-left py-2 px-3 font-bold text-slate-500">Case</th>
                        <th className="text-center py-2 px-3 font-bold text-slate-500">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions.map(txn => (
                        <tr
                          key={txn.txn_id}
                          className="border-b border-slate-50 hover:bg-emerald-50/50 cursor-pointer transition-colors"
                          onClick={() => {
                            const edgeId = `txn_${txn.txn_id}`;
                            setSelectedEdgeId(edgeId);
                            setSelectedNodeId(null);
                            setDetailOpen(true);
                            setActiveTab('graph');
                          }}
                        >
                          <td className="py-2 px-3 font-mono text-slate-600">#{txn.txn_id}</td>
                          <td className="py-2 px-3 text-slate-600">{formatDate(txn.txn_date)}</td>
                          <td className="py-2 px-3">
                            <div className="font-medium text-slate-800">{txn.from_person}</div>
                            <div className="text-[10px] text-slate-400">{txn.from_account_masked} · {txn.from_bank}</div>
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-medium text-slate-800">{txn.to_person}</div>
                            <div className="text-[10px] text-slate-400">{txn.to_account_masked} · {txn.to_bank}</div>
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-slate-800">
                            {formatCurrency(txn.amount)}
                          </td>
                          <td className="py-2 px-3 text-slate-600">{txn.crime_no}</td>
                          <td className="py-2 px-3 text-center">
                            {txn.flagged ? (
                              <span className="text-[9px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full border border-red-200">
                                FLAGGED
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                                Normal
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TIMELINE TAB ── */}
            {activeTab === 'timeline' && (
              <div className="p-4">
                <div className="text-xs font-bold text-slate-600 mb-3">
                  {timelineTransactions.length} transactions in chronological order
                </div>
                <div className="relative pl-6 border-l-2 border-emerald-200 space-y-4">
                  {timelineTransactions.map((txn, idx) => (
                    <div key={txn.txn_id} className="relative">
                      <div className={cn(
                        "absolute -left-[25px] top-1 w-3 h-3 rounded-full border-2 border-white",
                        txn.flagged ? "bg-red-500" : "bg-emerald-500"
                      )} />
                      <div className="bg-white border border-slate-100 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => {
                          setSelectedEdgeId(`txn_${txn.txn_id}`);
                          setSelectedNodeId(null);
                          setDetailOpen(true);
                          setActiveTab('graph');
                        }}
                      >
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
                        {txn.flagged && (
                          <span className="inline-block mt-1 text-[9px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                            FLAGGED
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── CROSS-CASE TAB ── */}
            {activeTab === 'crosscase' && (
              <div className="p-4 space-y-3">
                <div className="text-xs font-bold text-slate-600 mb-2">
                  {data.cross_case_links.length} cross-case financial links detected
                </div>
                {data.cross_case_links.length === 0 ? (
                  <div className="text-center py-8 text-sm text-slate-400">
                    No cross-case financial links found
                  </div>
                ) : (
                  data.cross_case_links.map((link, idx) => (
                    <div key={idx} className="bg-white border border-purple-100 rounded-lg p-4 shadow-sm">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                          <Link2 className="w-4 h-4 text-purple-600" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-800">{link.accused_name}</div>
                          <div className="text-[10px] text-slate-500">
                            {link.bank_name} · {link.account_masked}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-purple-50 rounded p-2">
                          <div className="text-sm font-bold text-purple-700">{link.case_count}</div>
                          <div className="text-[9px] text-slate-500">Cases Connected</div>
                        </div>
                        <div className="bg-emerald-50 rounded p-2">
                          <div className="text-sm font-bold text-emerald-700">{link.transaction_count}</div>
                          <div className="text-[9px] text-slate-500">Transactions</div>
                        </div>
                        <div className="bg-blue-50 rounded p-2">
                          <div className="text-sm font-bold text-blue-700">{link.connected_cases.length}</div>
                          <div className="text-[9px] text-slate-500">Distinct Cases</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── ANOMALIES TAB ── */}
            {activeTab === 'anomalies' && (
              <div className="p-4 space-y-3">
                <div className="text-xs font-bold text-slate-600 mb-2">
                  {data.anomalies.length} deterministic anomalies detected
                </div>
                {data.anomalies.length === 0 ? (
                  <div className="text-center py-8 text-sm text-slate-400">
                    No financial anomalies identified using the current analysis
                  </div>
                ) : (
                  data.anomalies.map((anomaly, idx) => (
                    <div key={idx} className="bg-white border border-amber-100 rounded-lg p-4 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className="text-xl">{ANOMALY_ICONS[anomaly.type] || '⚠️'}</div>
                        <div className="flex-1">
                          <div className="text-sm font-bold text-slate-800">{anomaly.title}</div>
                          <div className="text-xs text-slate-600 mt-1">{anomaly.reason}</div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {Object.entries(anomaly.evidence || {}).map(([key, val]) => (
                              <span key={key} className="text-[9px] font-medium bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                                {key.replace(/_/g, ' ')}: {typeof val === 'number' ? val.toLocaleString() : String(val)}
                              </span>
                            ))}
                          </div>
                          <div className="mt-1 text-[10px] text-slate-400">
                            Type: {anomaly.type.replace(/_/g, ' ')}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── LEADS TAB ── */}
            {activeTab === 'leads' && (
              <div className="p-4 space-y-3">
                <div className="text-xs font-bold text-slate-600 mb-2">
                  {data.leads.length} evidence-backed investigative leads
                </div>
                {data.leads.length === 0 ? (
                  <div className="text-center py-8 text-sm text-slate-400">
                    No financial investigative leads generated
                  </div>
                ) : (
                  data.leads.map((lead, idx) => (
                    <div key={idx} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-start gap-3">
                        <div className="text-xl">{LEAD_TYPE_ICONS[lead.lead_type] || '📋'}</div>
                        <div className="flex-1">
                          <div className="text-sm font-bold text-slate-800">{lead.title}</div>
                          <div className="text-xs text-slate-600 mt-1">{lead.reason}</div>
                          <div className="mt-2 space-y-1">
                            {lead.evidence_signals.map((signal, i) => (
                              <div key={i} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                                <span className="w-1 h-1 bg-emerald-500 rounded-full shrink-0" />
                                {signal}
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-[9px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                              {lead.source_engines.join(', ')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Detail Panel ── */}
        {detailOpen && (
          <div className="w-80 bg-white border-l border-slate-200 overflow-y-auto shrink-0">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <span className="text-xs font-bold text-slate-700">Details</span>
              <button onClick={clearSelection} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* ── Selected Person ── */}
              {selectedPerson && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-sm">👤</div>
                    <div>
                      <div className="text-sm font-bold text-slate-800">{selectedPerson.name}</div>
                      <div className="text-[10px] text-slate-500">Accused #{selectedPerson.accused_master_id}</div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Linked Accounts</div>
                    {data.accounts
                      .filter(a => a.accused_master_id === selectedPerson.accused_master_id)
                      .map(a => (
                        <div key={a.account_id} className="bg-slate-50 rounded-lg p-2.5 border border-slate-100 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-emerald-700">{maskAccount(a.account_number)}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">{a.bank_name} · FIR {a.crime_no}</div>
                        </div>
                      ))
                    }
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pt-2">Related Transactions</div>
                    {data.transactions
                      .filter(t => t.from_person === selectedPerson.name || t.to_person === selectedPerson.name)
                      .slice(0, 5)
                      .map(t => (
                        <div key={t.txn_id} className="bg-slate-50 rounded-lg p-2.5 border border-slate-100 text-xs">
                          <div className="flex justify-between">
                            <span className="font-medium text-slate-700">#{t.txn_id}</span>
                            <span className="font-bold text-slate-800">{formatCurrency(t.amount)}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {t.from_person} → {t.to_person} · {formatDate(t.txn_date)}
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}

              {/* ── Selected Account ── */}
              {selectedAccount && !selectedPerson && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-sm">💰</div>
                    <div>
                      <div className="text-sm font-bold text-slate-800">{maskAccount(selectedAccount.account_number)}</div>
                      <div className="text-[10px] text-slate-500">{selectedAccount.bank_name} · Account #{selectedAccount.account_id}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-slate-50 rounded p-2 text-center">
                      <div className="text-sm font-bold text-slate-800">{selectedAccount.accused_name}</div>
                      <div className="text-[9px] text-slate-500">Owner</div>
                    </div>
                    <div className="bg-slate-50 rounded p-2 text-center">
                      <div className="text-sm font-bold text-slate-800">FIR {selectedAccount.crime_no}</div>
                      <div className="text-[9px] text-slate-500">Case</div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Transactions Involving This Account</div>
                    {data.transactions
                      .filter(t => t.from_account_id === selectedAccount.account_id || t.to_account_id === selectedAccount.account_id)
                      .slice(0, 8)
                      .map(t => (
                        <div key={t.txn_id} className="bg-slate-50 rounded-lg p-2.5 border border-slate-100 text-xs">
                          <div className="flex justify-between">
                            <span className="text-[10px] text-slate-400">{formatDate(t.txn_date)}</span>
                            <span className="font-bold text-slate-800">{formatCurrency(t.amount)}</span>
                          </div>
                          <div className="text-[10px] text-slate-600 mt-0.5">
                            {t.from_person}({t.from_account_masked}) → {t.to_person}({t.to_account_masked})
                          </div>
                          {t.flagged && (
                            <span className="inline-block mt-1 text-[9px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                              FLAGGED
                            </span>
                          )}
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}

              {/* ── Selected Transaction Edge ── */}
              {selectedTransaction && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center text-sm">💸</div>
                    <div>
                      <div className="text-sm font-bold text-slate-800">Transaction #{selectedTransaction.txn_id}</div>
                      <div className="text-[10px] text-slate-500">{formatDate(selectedTransaction.txn_date)}</div>
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-2 text-xs">
                    <DetailRow label="Amount" value={formatCurrency(selectedTransaction.amount)} highlight />
                    <DetailRow label="From" value={`${selectedTransaction.from_person} (${selectedTransaction.from_account_masked})`} />
                    <DetailRow label="From Bank" value={selectedTransaction.from_bank} />
                    <DetailRow label="To" value={`${selectedTransaction.to_person} (${selectedTransaction.to_account_masked})`} />
                    <DetailRow label="To Bank" value={selectedTransaction.to_bank} />
                    <DetailRow label="Case" value={`FIR ${selectedTransaction.crime_no}`} />
                    <DetailRow label="Date" value={formatDate(selectedTransaction.txn_date)} />
                    <DetailRow label="Status" value={selectedTransaction.flagged ? '⚠️ FLAGGED' : 'Normal'} />
                  </div>
                </div>
              )}

              {/* ── Selected Edge (non-transaction) ── */}
              {selectedEdge && !selectedTransaction && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm">🔗</div>
                    <div>
                      <div className="text-sm font-bold text-slate-800">Relationship</div>
                      <div className="text-[10px] text-slate-500">{selectedEdge.type}</div>
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 text-xs space-y-2">
                    <DetailRow label="Type" value={selectedEdge.type} />
                    <DetailRow label="Label" value={selectedEdge.label} />
                    <DetailRow label="Source" value={selectedEdge.source} />
                    <DetailRow label="Target" value={selectedEdge.target} />
                  </div>
                </div>
              )}

              {!selectedPerson && !selectedAccount && !selectedEdge && (
                <div className="text-center py-8 text-xs text-slate-400">
                  Select a node or edge in the graph to view details
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

function SummaryCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string; color: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    purple: 'bg-purple-50 text-purple-700 border-purple-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
  };
  return (
    <div className={cn("rounded-lg p-3 border", colorMap[color] || colorMap.slate)}>
      <div className="flex items-center gap-1.5 mb-1 opacity-70">{icon}</div>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[10px] opacity-80 font-medium">{label}</div>
    </div>
  );
}

function LegendItem({ color, icon, label }: { color: string; icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[10px] text-slate-600">
      <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px]" style={{ background: color, color: '#fff' }}>
        {icon}
      </div>
      {label}
    </div>
  );
}

function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={cn("font-semibold text-right", highlight ? "text-emerald-700 text-sm" : "text-slate-800")}>
        {value}
      </span>
    </div>
  );
}
