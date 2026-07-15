import { useMemo, useCallback } from 'react';
import ReactFlow, { Background, Controls, MiniMap, useNodesState, useEdgesState } from 'reactflow';
import type { Edge, Node, NodeMouseHandler } from 'reactflow';
import 'reactflow/dist/style.css';
import type { NetworkNode, NetworkEdge } from '../services/api';

// ── Community color palette ──
const COMMUNITY_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#e11d48', // rose
  '#84cc16', // lime
];

// ── Edge relation colors ──
const RELATION_COLORS: Record<string, string> = {
  co_accused: '#ef4444',
  financial: '#10b981',
  repeat_identity: '#8b5cf6',
  shared_mo: '#f59e0b',
  victim_accused: '#ec4899',
};

const RELATION_EMOJIS: Record<string, string> = {
  co_accused: '🤝',
  financial: '💰',
  repeat_identity: '👤',
  shared_mo: '🎯',
  victim_accused: '⚖️',
};

interface GraphProps {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  rootNode: string;
  showCommunities: boolean;
  selectedNodeId: string | null;
  onNodeClick: (accusedId: number, nodeId: string) => void;
}

export default function NetworkGraph({
  nodes: graphNodes,
  edges: graphEdges,
  rootNode,
  showCommunities,
  selectedNodeId,
  onNodeClick,
}: GraphProps) {
  // ── Force-directed layout calculation ──
  const layoutNodes = useMemo(() => {
    if (graphNodes.length === 0) return [];

    // Use a seeded force-directed algorithm simulation
    const positions: Record<string, { x: number; y: number }> = {};
    const centerX = 400;
    const centerY = 300;

    // Initialize positions using circular + distance-based layout
    const distanceGroups: Record<number, NetworkNode[]> = {};
    graphNodes.forEach((n) => {
      const d = n.distance ?? 99;
      if (!distanceGroups[d]) distanceGroups[d] = [];
      distanceGroups[d].push(n);
    });

    Object.entries(distanceGroups).forEach(([dist, group]) => {
      const d = Number(dist);
      const radius = d === 0 ? 0 : 150 + d * 120;
      group.forEach((n, i) => {
        const angle = (i / group.length) * 2 * Math.PI + (d * 0.7);
        positions[n.id] = {
          x: centerX + radius * Math.cos(angle) + (Math.random() - 0.5) * 40,
          y: centerY + radius * Math.sin(angle) + (Math.random() - 0.5) * 40,
        };
      });
    });

    // Simple repulsion/attraction passes
    const adjacency: Record<string, Set<string>> = {};
    graphEdges.forEach((e) => {
      if (!adjacency[e.from]) adjacency[e.from] = new Set();
      if (!adjacency[e.to]) adjacency[e.to] = new Set();
      adjacency[e.from].add(e.to);
      adjacency[e.to].add(e.from);
    });

    for (let iter = 0; iter < 50; iter++) {
      const forces: Record<string, { fx: number; fy: number }> = {};
      graphNodes.forEach((n) => {
        forces[n.id] = { fx: 0, fy: 0 };
      });

      // Repulsion between all nodes
      for (let i = 0; i < graphNodes.length; i++) {
        for (let j = i + 1; j < graphNodes.length; j++) {
          const a = graphNodes[i].id;
          const b = graphNodes[j].id;
          const dx = positions[a].x - positions[b].x;
          const dy = positions[a].y - positions[b].y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
          const repulse = 8000 / (dist * dist);
          const fx = (dx / dist) * repulse;
          const fy = (dy / dist) * repulse;
          forces[a].fx += fx;
          forces[a].fy += fy;
          forces[b].fx -= fx;
          forces[b].fy -= fy;
        }
      }

      // Attraction along edges
      graphEdges.forEach((e) => {
        if (!positions[e.from] || !positions[e.to]) return;
        const dx = positions[e.to].x - positions[e.from].x;
        const dy = positions[e.to].y - positions[e.from].y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
        const idealLen = 180;
        const attract = (dist - idealLen) * 0.02;
        const fx = (dx / dist) * attract;
        const fy = (dy / dist) * attract;
        forces[e.from].fx += fx;
        forces[e.from].fy += fy;
        forces[e.to].fx -= fx;
        forces[e.to].fy -= fy;
      });

      // Apply forces
      const cooling = 1 - iter / 60;
      graphNodes.forEach((n) => {
        if (n.is_root) return; // Keep root fixed
        const f = forces[n.id];
        const maxF = 15 * cooling;
        positions[n.id].x += Math.max(-maxF, Math.min(maxF, f.fx));
        positions[n.id].y += Math.max(-maxF, Math.min(maxF, f.fy));
      });
    }

    return positions;
  }, [graphNodes, graphEdges]);

  // ── Convert to ReactFlow nodes ──
  const rfNodes: Node[] = useMemo(() => {
    return graphNodes.map((n) => {
      const pos = layoutNodes[n.id] || { x: 400, y: 300 };
      const isSelected = selectedNodeId === n.id;
      const communityColor = COMMUNITY_COLORS[n.community % COMMUNITY_COLORS.length];

      let bgColor = '#1e293b';
      let borderColor = '#475569';
      let textColor = '#ffffff';

      if (n.is_root) {
        bgColor = '#c9a227';
        borderColor = '#a77c1d';
        textColor = '#0a1f44';
      } else if (showCommunities) {
        bgColor = communityColor;
        borderColor = communityColor;
      }

      if (isSelected) {
        borderColor = '#c9a227';
      }

      // Node size based on case count
      const size = n.is_root ? 160 : Math.max(120, Math.min(160, 100 + (n.case_count || 1) * 10));

      return {
        id: n.id,
        position: pos,
        data: {
          label: (
            <div style={{ textAlign: 'center', lineHeight: 1.3 }}>
              <div style={{ fontWeight: 700, fontSize: n.is_root ? 13 : 11 }}>
                {n.label}
              </div>
              <div style={{ fontSize: 9, opacity: 0.8, marginTop: 2 }}>
                {n.case_count > 1 ? `${n.case_count} cases` : 'ID: ' + n.id.slice(1)}
              </div>
            </div>
          ),
        },
        style: {
          background: bgColor,
          color: textColor,
          border: isSelected ? `3px solid ${borderColor}` : `2px solid ${borderColor}`,
          borderRadius: n.is_root ? '12px' : '50%',
          padding: n.is_root ? '14px 16px' : '10px',
          fontWeight: '600',
          fontSize: '11px',
          boxShadow: isSelected
            ? `0 0 0 4px ${borderColor}44, 0 8px 24px -4px rgba(0,0,0,0.3)`
            : n.is_root
            ? '0 4px 16px rgba(201, 162, 39, 0.4)'
            : '0 2px 8px rgba(0,0,0,0.2)',
          width: size,
          minWidth: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'box-shadow 0.2s, border 0.2s',
        },
      };
    });
  }, [graphNodes, layoutNodes, showCommunities, selectedNodeId]);

  // ── Convert to ReactFlow edges ──
  const rfEdges: Edge[] = useMemo(() => {
    return graphEdges.map((e, index) => {
      const color = RELATION_COLORS[e.relation] || '#94a3b8';
      const emoji = RELATION_EMOJIS[e.relation] || '';
      const isFinancial = e.relation === 'financial';
      const isIndirect = ['repeat_identity', 'shared_mo', 'victim_accused'].includes(e.relation);

      return {
        id: `e${index}-${e.from}-${e.to}`,
        source: e.from,
        target: e.to,
        label: `${emoji} ${e.relation_label}`,
        animated: isFinancial,
        style: {
          stroke: color,
          strokeWidth: Math.min(4, 1 + e.weight),
          strokeDasharray: isIndirect ? '6 3' : undefined,
          opacity: 0.8,
        },
        labelStyle: {
          fill: '#475569',
          fontWeight: 600,
          fontSize: 10,
        },
        labelBgStyle: {
          fill: '#ffffff',
          fillOpacity: 0.95,
          rx: 6,
          ry: 6,
          stroke: color,
          strokeWidth: 1,
        },
        labelBgPadding: [6, 4] as [number, number],
      };
    });
  }, [graphEdges]);

  const [flowNodes, , onNodesChange] = useNodesState(rfNodes);
  const [flowEdges, , onEdgesChange] = useEdgesState(rfEdges);

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      const graphNode = graphNodes.find((n) => n.id === node.id);
      if (graphNode?.accused_id) {
        onNodeClick(graphNode.accused_id, node.id);
      }
    },
    [graphNodes, onNodeClick]
  );

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={3}
        attributionPosition="bottom-right"
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#cbd5e1" gap={24} size={1} />
        <Controls
          showInteractive={false}
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}
        />
        <MiniMap
          nodeStrokeWidth={3}
          nodeColor={(n) => {
            if (n.id === rootNode) return '#c9a227';
            if (showCommunities) {
              const gn = graphNodes.find((gn) => gn.id === n.id);
              return COMMUNITY_COLORS[(gn?.community || 0) % COMMUNITY_COLORS.length];
            }
            return '#1e293b';
          }}
          maskColor="rgba(0,0,0,0.08)"
          style={{
            background: '#f8fafc',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
          }}
        />
      </ReactFlow>
    </div>
  );
}