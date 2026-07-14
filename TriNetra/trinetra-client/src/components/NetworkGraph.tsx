import { useMemo } from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import type { Edge, Node } from 'reactflow'; // <--- THIS FIXES THE VITE ERROR
import 'reactflow/dist/style.css';

interface GraphProps {
  data: {
    nodes: { id: string; label: string }[];
    edges: { from: string; to: string; relation: string; case: string }[];
  };
}

export default function NetworkGraph({ data }: GraphProps) {
  // Map Python nodes to React Flow nodes with a simple circular layout
  const nodes: Node[] = useMemo(() => {
    const radius = 180;
    const centerX = 300;
    const centerY = 200;

    return data.nodes.map((n, index) => {
      const angle = (index / data.nodes.length) * 2 * Math.PI;
      return {
        id: n.id,
        position: {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        },
        data: { label: n.label },
        style: {
          background: '#1e293b', 
          color: 'white',
          border: '1px solid #475569',
          borderRadius: '8px',
          padding: '12px',
          fontWeight: 'bold',
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.3)',
          textAlign: 'center' as const,
        },
      };
    });
  }, [data.nodes]);

  // Map Python edges to React Flow edges
  const edges: Edge[] = useMemo(() => {
    return data.edges.map((e, index) => ({
      id: `e${index}-${e.from}-${e.to}`,
      source: e.from,
      target: e.to,
      label: e.relation === 'financial_link' ? '💸 Money Trail' : '🤝 Co-Accused',
      animated: e.relation === 'financial_link', 
      style: {
        stroke: e.relation === 'financial_link' ? '#10b981' : '#ef4444', 
        strokeWidth: 2,
      },
      labelStyle: { fill: '#475569', fontWeight: 600, fontSize: 11 },
      labelBgStyle: { fill: '#f8fafc', fillOpacity: 0.9, rx: 4, ry: 4 },
    }));
  }, [data.edges]);

  return (
    <div style={{ 
      height: '450px', 
      width: '100%', 
      marginTop: '1.5rem', 
      marginBottom: '1rem',
      border: '1px solid #e2e8f0', 
      borderRadius: '12px', 
      overflow: 'hidden',
      backgroundColor: '#f1f5f9'
    }}>
      <ReactFlow nodes={nodes} edges={edges} fitView attributionPosition="bottom-right">
        <Background color="#94a3b8" gap={20} size={1} />
        <Controls />
      </ReactFlow>
    </div>
  );
}