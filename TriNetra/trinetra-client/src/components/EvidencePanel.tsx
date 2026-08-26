import { ArrowRight, ExternalLink, Database, Cpu, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import type { EvidenceEdge, EvidenceNode, EvidenceSignal } from '../services/api';

const STRENGTH_STYLES: Record<string, string> = {
  strong: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  moderate: 'text-amber-700 bg-amber-50 border-amber-200',
  limited: 'text-slate-600 bg-slate-50 border-slate-200',
  none: 'text-slate-400 bg-slate-50 border-slate-100',
};

const ENGINE_LABELS: Record<string, string> = {
  pattern_engine: 'Pattern Similarity Engine',
  network_engine: 'Criminal Network Engine',
  analytics_engine: 'Risk Analytics Engine',
  case_explorer_engine: 'Case Explorer',
  nl2sql_engine: 'NL2SQL Engine',
  rag_engine: 'RAG Semantic Engine',
  case_similarity: 'Case Similarity Engine',
};

interface EvidencePanelProps {
  edge: EvidenceEdge | null;
  node: EvidenceNode | null;
  allNodes: EvidenceNode[];
  allEdges: EvidenceEdge[];
  onClose: () => void;
  onViewRecord?: (table: string, recordId: any) => void;
}

export default function EvidencePanel({
  edge,
  node,
  allNodes,
  allEdges,
  onClose,
  onViewRecord,
}: EvidencePanelProps) {
  // Determine what to show
  const selectedEdge = edge;
  const selectedNode = node;

  if (!selectedEdge && !selectedNode) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden flex flex-col max-h-[500px]">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm">🔍</span>
          <h3 className="text-sm font-bold text-slate-800">
            {selectedEdge ? 'Why This Relationship?' : 'Entity Details'}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 text-xs font-medium"
        >
          Close
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {selectedEdge && (
          <EdgeDetails edge={selectedEdge} allNodes={allNodes} onViewRecord={onViewRecord} />
        )}
        {selectedNode && !selectedEdge && (
          <NodeDetails node={selectedNode} allEdges={allEdges} onViewRecord={onViewRecord} />
        )}
      </div>
    </div>
  );
}

function EdgeDetails({ edge, allNodes, onViewRecord }: { edge: EvidenceEdge; allNodes: EvidenceNode[]; onViewRecord?: (table: string, recordId: any) => void }) {
  const sourceNode = allNodes.find(n => n.id === edge.source);
  const targetNode = allNodes.find(n => n.id === edge.target);

  return (
    <div className="space-y-4">
      {/* Relationship Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded">
            {sourceNode?.label || edge.source}
          </span>
          <ArrowRight className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded">
            {targetNode?.label || edge.target}
          </span>
        </div>
        <div className="text-sm font-bold text-indigo-700">{edge.relationship_label}</div>
        <div className={cn(
          "inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border mt-1",
          STRENGTH_STYLES[edge.strength] || STRENGTH_STYLES.limited
        )}>
          Evidence Strength: {edge.strength.toUpperCase()}
        </div>
      </div>

      {/* Evidence Signals */}
      {edge.evidence && edge.evidence.length > 0 && (
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Evidence ({edge.evidence.length} signals)
          </div>
          <div className="space-y-2">
            {edge.evidence.map((signal, idx) => (
              <SignalCard key={idx} signal={signal} onViewRecord={onViewRecord} />
            ))}
          </div>
        </div>
      )}

      {/* Source Engine */}
      <div className="pt-2 border-t border-slate-100">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <Cpu className="w-3 h-3" />
          <span className="font-semibold">Source:</span>
          <span>{ENGINE_LABELS[edge.source_engine] || edge.source_engine}</span>
        </div>
      </div>
    </div>
  );
}

function NodeDetails({ node, allEdges, onViewRecord }: { node: EvidenceNode; allEdges: EvidenceEdge[]; onViewRecord?: (table: string, recordId: any) => void }) {
  const relatedEdges = allEdges.filter(e => e.source === node.id || e.target === node.id);

  return (
    <div className="space-y-4">
      {/* Entity Header */}
      <div className="text-center">
        <div className="text-lg font-bold text-slate-800">{node.label}</div>
        <div className="text-xs text-slate-500 mt-1">
          {node.type.replace('_', ' ').toUpperCase()} • {node.source.table}
        </div>
      </div>

      {/* Metadata */}
      {node.metadata && Object.keys(node.metadata).length > 0 && (
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Metadata</div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(node.metadata).map(([key, value]) => (
              <div key={key} className="text-xs">
                <span className="text-slate-500">{key.replace(/_/g, ' ')}: </span>
                <span className="font-semibold text-slate-700">
                  {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value ?? 'N/A')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Related Edges */}
      {relatedEdges.length > 0 && (
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Connected Relationships ({relatedEdges.length})
          </div>
          <div className="space-y-1">
            {relatedEdges.slice(0, 8).map((e, idx) => (
              <div key={idx} className="flex items-center gap-2 text-[10px] bg-slate-50 p-2 rounded border border-slate-100">
                <span className="font-medium text-slate-700">{e.relationship_label}</span>
                <span className={cn(
                  "px-1.5 py-0.5 rounded text-[9px] font-bold",
                  STRENGTH_STYLES[e.strength]
                )}>
                  {e.strength}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Source Record Link */}
      <button
        onClick={() => onViewRecord?.(node.source.table, node.source.record_id)}
        className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 py-2 rounded-lg border border-indigo-200 transition-colors"
      >
        <ExternalLink className="w-3 h-3" />
        View Source Record ({node.source.table} #{node.source.record_id})
      </button>
    </div>
  );
}

function SignalCard({ signal, onViewRecord }: { signal: EvidenceSignal; onViewRecord?: (table: string, recordId: any) => void }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-slate-700">{signal.label}</span>
        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
          {signal.value}
        </span>
      </div>
      <p className="text-[11px] text-slate-600 leading-relaxed">{signal.description}</p>

      {/* Source Records */}
      {signal.source_records && signal.source_records.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {signal.source_records.map((sr, idx) => (
            <button
              key={idx}
              onClick={() => onViewRecord?.(sr.table, sr.record_id)}
              className="flex items-center gap-1 text-[9px] font-medium text-slate-500 bg-white hover:bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 transition-colors"
            >
              <Database className="w-2.5 h-2.5" />
              {sr.table} #{String(sr.record_id)}
              <ChevronRight className="w-2.5 h-2.5" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
