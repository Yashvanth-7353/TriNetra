import { useMemo, useCallback } from 'react';
import ReactFlow, { Background, Controls, useNodesState, useEdgesState } from 'reactflow';
import type { Edge, Node, NodeMouseHandler } from 'reactflow';
import 'reactflow/dist/style.css';
import type { EvidenceNode, EvidenceEdge } from '../services/api';

const NODE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  case: { bg: '#1e40af', border: '#3b82f6', text: '#ffffff' },
  person: { bg: '#991b1b', border: '#ef4444', text: '#ffffff' },
  mo_tag: { bg: '#854d0e', border: '#eab308', text: '#ffffff' },
  pattern: { bg: '#581c87', border: '#a855f7', text: '#ffffff' },
  risk_score: { bg: '#9a3412', border: '#f97316', text: '#ffffff' },
  account: { bg: '#065f46', border: '#10b981', text: '#ffffff' },
  location: { bg: '#164e63', border: '#06b6d4', text: '#ffffff' },
};

const NODE_ICONS: Record<string, string> = {
  case: '📋',
  person: '👤',
  mo_tag: '🎯',
  pattern: '🔗',
  risk_score: '⚠️',
  account: '💰',
  location: '📍',
};

const EDGE_COLORS: Record<string, string> = {
  case_similarity: '#6366f1',
  uses_modus_operandi: '#eab308',
  pattern_member: '#a855f7',
  co_accused: '#ef4444',
  financial: '#10b981',
  repeat_identity: '#8b5cf6',
  shared_mo: '#f59e0b',
  victim_accused: '#ec4899',
  has_risk_score: '#f97316',
};

const STRENGTH_WIDTH: Record<string, number> = {
  strong: 3,
  moderate: 2,
  limited: 1,
};

interface EvidenceGraphProps {
  nodes: EvidenceNode[];
  edges: EvidenceEdge[];
  onNodeClick?: (node: EvidenceNode) => void;
  onEdgeClick?: (edge: EvidenceEdge) => void;
  selectedEdgeId?: string | null;
  compact?: boolean;
}

export default function EvidenceGraph({
  nodes: evidenceNodes,
  edges: evidenceEdges,
  onNodeClick,
  onEdgeClick,
  selectedEdgeId,
  compact = false,
}: EvidenceGraphProps) {
  const layoutNodes = useMemo(() => {
    if (evidenceNodes.length === 0) return {};
    const positions: Record<string, { x: number; y: number }> = {};
    const centerX = compact ? 300 : 500;
    const centerY = compact ? 200 : 350;

    // Separate primary and secondary nodes
    const primary = evidenceNodes.filter(n => n.is_primary);
    const secondary = evidenceNodes.filter(n => !n.is_primary);

    // Position primary nodes in center
    primary.forEach((n, i) => {
      const angle = (i / Math.max(primary.length, 1)) * 2 * Math.PI;
      positions[n.id] = {
        x: centerX + (compact ? 40 : 80) * Math.cos(angle),
        y: centerY + (compact ? 40 : 80) * Math.sin(angle),
      };
    });

    // Position secondary nodes in outer ring
    secondary.forEach((n, i) => {
      const angle = (i / Math.max(secondary.length, 1)) * 2 * Math.PI;
      const radius = compact ? 140 : 220;
      positions[n.id] = {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      };
    });

    // Simple force-directed refinement
    for (let iter = 0; iter < 30; iter++) {
      const forces: Record<string, { fx: number; fy: number }> = {};
      evidenceNodes.forEach(n => { forces[n.id] = { fx: 0, fy: 0 }; });

      // Repulsion between all nodes
      for (let i = 0; i < evidenceNodes.length; i++) {
        for (let j = i + 1; j < evidenceNodes.length; j++) {
          const a = evidenceNodes[i].id;
          const b = evidenceNodes[j].id;
          const dx = positions[a].x - positions[b].x;
          const dy = positions[a].y - positions[b].y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
          const repulse = 5000 / (dist * dist);
          forces[a].fx += (dx / dist) * repulse;
          forces[a].fy += (dy / dist) * repulse;
          forces[b].fx -= (dx / dist) * repulse;
          forces[b].fy -= (dy / dist) * repulse;
        }
      }

      // Attraction along edges
      evidenceEdges.forEach(e => {
        if (!positions[e.source] || !positions[e.target]) return;
        const dx = positions[e.target].x - positions[e.source].x;
        const dy = positions[e.target].y - positions[e.source].y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
        const attract = (dist - (compact ? 100 : 160)) * 0.02;
        forces[e.source].fx += (dx / dist) * attract;
        forces[e.source].fy += (dy / dist) * attract;
        forces[e.target].fx -= (dx / dist) * attract;
        forces[e.target].fy -= (dy / dist) * attract;
      });

      // Apply forces
      const cooling = 1 - iter / 35;
      evidenceNodes.forEach(n => {
        if (n.is_primary) return; // Keep primary fixed
        const f = forces[n.id];
        const maxF = 12 * cooling;
        positions[n.id].x += Math.max(-maxF, Math.min(maxF, f.fx));
        positions[n.id].y += Math.max(-maxF, Math.min(maxF, f.fy));
      });
    }

    return positions;
  }, [evidenceNodes, evidenceEdges, compact]);

  const rfNodes: Node[] = useMemo(() => {
    return evidenceNodes.map(n => {
      const pos = layoutNodes[n.id] || { x: 300, y: 200 };
      const colors = NODE_COLORS[n.type] || NODE_COLORS.case;
      const icon = NODE_ICONS[n.type] || '•';
      const size = compact ? 115 : 150;

      return {
        id: n.id,
        position: pos,
        data: {
          label: (
            <div style={{ textAlign: 'center', lineHeight: 1.3 }} title={n.label}>
              <div style={{ fontSize: compact ? 12 : 14 }}>{icon}</div>
              <div style={{
                fontWeight: 700,
                fontSize: compact ? 9 : 11,
                wordBreak: 'break-word',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical' as any,
              }}>
                {n.label.length > 42 ? n.label.slice(0, 39) + '...' : n.label}
              </div>
              <div style={{ fontSize: 8, opacity: 0.7, marginTop: 1 }}>
                {n.type.replace('_', ' ')}
              </div>
            </div>
          ),
        },
        style: {
          background: colors.bg,
          color: colors.text,
          border: `2px solid ${colors.border}`,
          borderRadius: n.type === 'case' ? '8px' : n.type === 'person' ? '50%' : '12px',
          padding: compact ? '6px 8px' : '8px 12px',
          fontWeight: '600',
          fontSize: '10px',
          boxShadow: n.is_primary ? `0 0 0 3px ${colors.border}44, 0 4px 12px rgba(0,0,0,0.2)` : '0 2px 8px rgba(0,0,0,0.15)',
          width: size,
          minWidth: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'box-shadow 0.2s',
        },
      };
    });
  }, [evidenceNodes, layoutNodes, compact]);

  const rfEdges: Edge[] = useMemo(() => {
    return evidenceEdges.map((e, index) => {
      const color = EDGE_COLORS[e.relationship] || '#94a3b8';
      const isSelected = selectedEdgeId === e.id;
      const width = STRENGTH_WIDTH[e.strength] || 1;

      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.relationship_label,
        style: {
          stroke: isSelected ? '#fbbf24' : color,
          strokeWidth: isSelected ? width + 2 : width,
          opacity: isSelected ? 1 : 0.7,
        },
        labelStyle: {
          fill: '#334155',
          fontWeight: 600,
          fontSize: compact ? 8 : 9,
        },
        labelBgStyle: {
          fill: '#ffffff',
          fillOpacity: 0.95,
          rx: 4,
          ry: 4,
          stroke: color,
          strokeWidth: 1,
        },
        labelBgPadding: [4, 2] as [number, number],
      };
    });
  }, [evidenceEdges, selectedEdgeId, compact]);

  const handleNodeClick: NodeMouseHandler = useCallback((_, node) => {
    const evidenceNode = evidenceNodes.find(n => n.id === node.id);
    if (evidenceNode && onNodeClick) {
      onNodeClick(evidenceNode);
    }
  }, [evidenceNodes, onNodeClick]);

  const handleEdgeClick = useCallback((_: any, edge: Edge) => {
    const evidenceEdge = evidenceEdges.find(e => e.id === edge.id);
    if (evidenceEdge && onEdgeClick) {
      onEdgeClick(evidenceEdge);
    }
  }, [evidenceEdges, onEdgeClick]);

  if (evidenceNodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-400 text-xs">
        No evidence nodes to display
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: compact ? '250px' : '400px' }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={3}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#e2e8f0" gap={20} size={1} />
        <Controls
          showInteractive={false}
          style={{
            background: '#ffffff',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
        />
      </ReactFlow>
    </div>
  );
}
