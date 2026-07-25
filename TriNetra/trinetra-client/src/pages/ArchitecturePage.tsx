import { useMemo } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap,
  MarkerType,
  Handle,
  Position,
  Panel
} from 'reactflow';
import 'reactflow/dist/style.css';
import { 
  Server, ShieldCheck, Database, Bot, User, LayoutDashboard, BrainCircuit, Activity, Network, FileSearch, ShieldAlert,
  Cloud, Lock, Code, Cpu, ListTree, Link as LinkIcon, Mic, FolderSearch, Settings
} from 'lucide-react';

// Custom Node Components
const CustomNode = ({ data }: any) => {
  const Icon = data.icon;
  return (
    <div className={`px-4 py-3 shadow-lg rounded-xl border-2 bg-slate-900 min-w-[160px] ${data.borderColor}`}>
      {data.targetHandle && <Handle type="target" position={data.targetPosition || Position.Top} className="!bg-slate-500 w-3 h-3" />}
      
      <div className="flex flex-col items-center justify-center gap-2">
        {Icon && <Icon className={`w-8 h-8 ${data.iconColor}`} />}
        <div className="font-bold text-sm text-white text-center">{data.label}</div>
        {data.sublabel && <div className="text-xs text-slate-400 text-center max-w-[140px] leading-tight">{data.sublabel}</div>}
      </div>

      {data.sourceHandle && <Handle type="source" position={data.sourcePosition || Position.Bottom} className="!bg-slate-500 w-3 h-3" />}
      {data.leftHandle && <Handle id="left" type="source" position={Position.Left} className="!bg-slate-500 w-3 h-3" />}
      {data.rightHandle && <Handle id="right" type="source" position={Position.Right} className="!bg-slate-500 w-3 h-3" />}
    </div>
  );
};

const GroupNode = ({ data }: any) => {
  return (
    <div className={`w-full h-full rounded-2xl border-2 border-dashed ${data.borderColor} ${data.bgColor || 'bg-slate-900/30'} relative p-4`}>
      <div className={`absolute -top-3 left-4 px-2 bg-slate-950 font-bold text-sm ${data.textColor}`}>
        {data.label}
      </div>
    </div>
  );
};

const DetailNode = ({ data }: any) => {
  return (
    <div className="px-3 py-2 bg-slate-800 rounded-lg border border-slate-700 min-w-[120px] shadow-sm flex flex-col justify-center items-center">
      {data.targetHandle && <Handle type="target" position={data.targetPosition || Position.Top} className="!bg-slate-600 w-2 h-2" />}
      <div className="text-xs font-semibold text-slate-200 text-center">{data.label}</div>
      {data.sourceHandle && <Handle type="source" position={data.sourcePosition || Position.Bottom} className="!bg-slate-600 w-2 h-2" />}
    </div>
  );
}

const nodeTypes = {
  customNode: CustomNode,
  groupNode: GroupNode,
  detailNode: DetailNode
};

export default function ArchitecturePage({ onClose }: { onClose?: () => void }) {
  const nodes = useMemo(() => [
    // ==========================================
    // LAYER 1: USERS (Blue)
    // ==========================================
    {
      id: 'user',
      type: 'customNode',
      position: { x: 750, y: 0 },
      data: { label: 'Law Enforcement', sublabel: 'Officer', icon: User, iconColor: 'text-blue-400', borderColor: 'border-blue-500/50', sourceHandle: true, rightHandle: true },
    },
    {
      id: 'voice-input',
      type: 'customNode',
      position: { x: 1050, y: 0 },
      data: { label: 'Voice Input', sublabel: 'Web Audio API', icon: Mic, iconColor: 'text-blue-400', borderColor: 'border-blue-500/50', targetHandle: true, sourceHandle: true, leftHandle: true },
    },

    // ==========================================
    // LAYER 2: FRONTEND (Blue)
    // ==========================================
    {
      id: 'frontend-group',
      type: 'groupNode',
      position: { x: 450, y: 150 },
      style: { width: 750, height: 320 },
      data: { label: 'Frontend Layer (React 19 + Vite)', borderColor: 'border-blue-700', textColor: 'text-blue-400', bgColor: 'bg-blue-900/10' }
    },
    {
      id: 'fe-dashboard',
      type: 'customNode',
      position: { x: 300, y: 30 },
      parentNode: 'frontend-group',
      extent: 'parent',
      data: { label: 'TriNetra Dashboard', sublabel: 'SPA Entry Point', icon: LayoutDashboard, iconColor: 'text-blue-400', borderColor: 'border-blue-500/50', targetHandle: true, sourceHandle: true },
    },
    
    // Pages
    { id: 'fe-pages-group', type: 'groupNode', position: { x: 20, y: 150 }, style: { width: 330, height: 150 }, parentNode: 'frontend-group', data: { label: 'Pages', borderColor: 'border-blue-800', textColor: 'text-blue-400' } },
    { id: 'fe-p1', type: 'detailNode', position: { x: 20, y: 30 }, parentNode: 'fe-pages-group', data: { label: 'Ask TriNetra' } },
    { id: 'fe-p2', type: 'detailNode', position: { x: 180, y: 30 }, parentNode: 'fe-pages-group', data: { label: 'Case Explorer' } },
    { id: 'fe-p3', type: 'detailNode', position: { x: 20, y: 70 }, parentNode: 'fe-pages-group', data: { label: 'Pattern Analytics' } },
    { id: 'fe-p4', type: 'detailNode', position: { x: 180, y: 70 }, parentNode: 'fe-pages-group', data: { label: 'Network Analysis' } },
    { id: 'fe-p5', type: 'detailNode', position: { x: 20, y: 110 }, parentNode: 'fe-pages-group', data: { label: 'Dashboard Stats' } },

    // Libraries
    { id: 'fe-libs-group', type: 'groupNode', position: { x: 380, y: 150 }, style: { width: 170, height: 150 }, parentNode: 'frontend-group', data: { label: 'Libraries', borderColor: 'border-blue-800', textColor: 'text-blue-400' } },
    { id: 'fe-l1', type: 'detailNode', position: { x: 25, y: 30 }, parentNode: 'fe-libs-group', data: { label: 'React Flow' } },
    { id: 'fe-l2', type: 'detailNode', position: { x: 25, y: 70 }, parentNode: 'fe-libs-group', data: { label: 'Recharts & Leaflet' } },
    { id: 'fe-l3', type: 'detailNode', position: { x: 25, y: 110 }, parentNode: 'fe-libs-group', data: { label: 'TailwindCSS' } },

    {
      id: 'fe-api-gateway',
      type: 'customNode',
      position: { x: 570, y: 220 },
      parentNode: 'frontend-group',
      data: { label: 'REST API Layer', sublabel: 'Axios', icon: LinkIcon, iconColor: 'text-blue-400', borderColor: 'border-blue-500/50', targetHandle: true, sourceHandle: true, leftHandle: true },
    },

    // ==========================================
    // LAYER 3: AUTH & ROUTING (Green)
    // ==========================================
    { id: 'auth-pipeline', type: 'groupNode', position: { x: 250, y: 550 }, style: { width: 1150, height: 160 }, data: { label: 'FastAPI Request Pipeline', borderColor: 'border-green-700', textColor: 'text-green-400', bgColor: 'bg-green-900/10' } },
    {
      id: 'auth',
      type: 'customNode',
      position: { x: 40, y: 40 },
      parentNode: 'auth-pipeline',
      data: { label: 'Authentication', sublabel: 'bcrypt & JWT Gen', icon: Lock, iconColor: 'text-green-400', borderColor: 'border-green-500/50', targetHandle: true, sourceHandle: true, rightHandle: true },
    },
    {
      id: 'rbac',
      type: 'customNode',
      position: { x: 240, y: 40 },
      parentNode: 'auth-pipeline',
      data: { label: 'RBAC Security', sublabel: 'Role & Jurisdiction', icon: ShieldAlert, iconColor: 'text-green-400', borderColor: 'border-green-500/50', targetHandle: true, sourceHandle: true, leftHandle: true, rightHandle: true },
    },
    {
      id: 'query-rewriter',
      type: 'customNode',
      position: { x: 480, y: 15 },
      parentNode: 'auth-pipeline',
      data: { label: 'Query Rewriter', sublabel: 'Context & Pronouns', icon: Code, iconColor: 'text-green-400', borderColor: 'border-green-500/50', targetHandle: true, sourceHandle: true, leftHandle: true, rightHandle: true, targetPosition: Position.Top },
    },
    { id: 'det-qw1', type: 'detailNode', position: { x: 495, y: 95 }, parentNode: 'auth-pipeline', data: { label: 'Conversation Context' } },
    { id: 'det-qw2', type: 'detailNode', position: { x: 495, y: 130 }, parentNode: 'auth-pipeline', data: { label: 'Query Rewrite' } },

    {
      id: 'router',
      type: 'customNode',
      position: { x: 800, y: 40 },
      parentNode: 'auth-pipeline',
      data: { label: 'Intent Router', sublabel: 'Exactly ONE Engine', icon: BrainCircuit, iconColor: 'text-green-400', borderColor: 'border-green-500/50', targetHandle: true, sourceHandle: true, leftHandle: true, rightHandle: true, sourcePosition: Position.Bottom },
    },

    // ==========================================
    // LAYER 4: ENGINES (Orange)
    // ==========================================
    { id: 'engines-group', type: 'groupNode', position: { x: 100, y: 800 }, style: { width: 1450, height: 420 }, data: { label: 'Processing Engines', borderColor: 'border-orange-700', textColor: 'text-orange-400', bgColor: 'bg-orange-900/10' } },
    
    // Query Engines Subgroup
    { id: 'query-engines', type: 'groupNode', position: { x: 20, y: 40 }, style: { width: 550, height: 360 }, parentNode: 'engines-group', data: { label: 'Query Engines', borderColor: 'border-orange-800', textColor: 'text-orange-500' } },
    
    // Case Explorer
    { id: 'engine-ce', type: 'customNode', position: { x: 20, y: 40 }, parentNode: 'query-engines', data: { label: 'Case Explorer', sublabel: 'Faceted Search', icon: FolderSearch, iconColor: 'text-orange-400', borderColor: 'border-orange-500/50', targetHandle: true, sourceHandle: true } },
    { id: 'det-ce1', type: 'detailNode', position: { x: 20, y: 150 }, parentNode: 'query-engines', data: { label: 'Search & Filters' } },
    { id: 'det-ce2', type: 'detailNode', position: { x: 20, y: 190 }, parentNode: 'query-engines', data: { label: 'Timeline & People' } },
    { id: 'det-ce3', type: 'detailNode', position: { x: 20, y: 230 }, parentNode: 'query-engines', data: { label: 'Case Details' } },

    // NL2SQL
    { id: 'engine-nl2sql', type: 'customNode', position: { x: 200, y: 40 }, parentNode: 'query-engines', data: { label: 'NL2SQL', sublabel: 'Database Analytics', icon: Database, iconColor: 'text-orange-400', borderColor: 'border-orange-500/50', targetHandle: true, sourceHandle: true } },
    { id: 'det-nl1', type: 'detailNode', position: { x: 200, y: 150 }, parentNode: 'query-engines', data: { label: 'Prompt Builder' } },
    { id: 'det-nl2', type: 'detailNode', position: { x: 200, y: 190 }, parentNode: 'query-engines', data: { label: 'SQL Generation' } },
    { id: 'det-nl3', type: 'detailNode', position: { x: 200, y: 230 }, parentNode: 'query-engines', data: { label: 'Validation' } },
    { id: 'det-nl4', type: 'detailNode', position: { x: 200, y: 270 }, parentNode: 'query-engines', data: { label: 'RBAC (SQL Guardrails)' } },
    { id: 'det-nl5', type: 'detailNode', position: { x: 200, y: 310 }, parentNode: 'query-engines', data: { label: 'Execute' } },
    
    // RAG
    { id: 'engine-rag', type: 'customNode', position: { x: 380, y: 40 }, parentNode: 'query-engines', data: { label: 'RAG Engine', sublabel: 'Semantic Match', icon: FileSearch, iconColor: 'text-orange-400', borderColor: 'border-orange-500/50', targetHandle: true, sourceHandle: true } },
    { id: 'det-rag1', type: 'detailNode', position: { x: 380, y: 150 }, parentNode: 'query-engines', data: { label: 'Query Embedding' } },
    { id: 'det-rag2', type: 'detailNode', position: { x: 380, y: 190 }, parentNode: 'query-engines', data: { label: 'Vector Search' } },
    { id: 'det-rag3', type: 'detailNode', position: { x: 380, y: 230 }, parentNode: 'query-engines', data: { label: 'Top-k Retrieval' } },
    { id: 'det-rag4', type: 'detailNode', position: { x: 380, y: 270 }, parentNode: 'query-engines', data: { label: 'Groq Synthesis' } },
    { id: 'det-rag5', type: 'detailNode', position: { x: 380, y: 310 }, parentNode: 'query-engines', data: { label: 'Citation' } },

    // Analysis Engines Subgroup
    { id: 'analysis-engines', type: 'groupNode', position: { x: 650, y: 40 }, style: { width: 750, height: 360 }, parentNode: 'engines-group', data: { label: 'Analysis Engines', borderColor: 'border-orange-800', textColor: 'text-orange-500' } },
    
    // Pattern
    { id: 'engine-pattern', type: 'customNode', position: { x: 50, y: 40 }, parentNode: 'analysis-engines', data: { label: 'Pattern Engine', sublabel: 'Tri-Signal Score', icon: ListTree, iconColor: 'text-orange-400', borderColor: 'border-orange-500/50', targetHandle: true, sourceHandle: true } },
    { id: 'det-pat1', type: 'detailNode', position: { x: 50, y: 150 }, parentNode: 'analysis-engines', data: { label: 'MO Similarity' } },
    { id: 'det-pat2', type: 'detailNode', position: { x: 50, y: 190 }, parentNode: 'analysis-engines', data: { label: 'Spatial Matching' } },
    { id: 'det-pat3', type: 'detailNode', position: { x: 50, y: 230 }, parentNode: 'analysis-engines', data: { label: 'Temporal Matching' } },
    { id: 'det-pat4', type: 'detailNode', position: { x: 50, y: 270 }, parentNode: 'analysis-engines', data: { label: 'Composite Score' } },
    { id: 'det-pat5', type: 'detailNode', position: { x: 50, y: 310 }, parentNode: 'analysis-engines', data: { label: 'Explainability' } },

    // Network
    { id: 'engine-network', type: 'customNode', position: { x: 280, y: 40 }, parentNode: 'analysis-engines', data: { label: 'Network Engine', sublabel: 'Syndicate Maps', icon: Network, iconColor: 'text-orange-400', borderColor: 'border-orange-500/50', targetHandle: true, sourceHandle: true } },
    { id: 'det-net1', type: 'detailNode', position: { x: 280, y: 150 }, parentNode: 'analysis-engines', data: { label: 'SQL Retrieval' } },
    { id: 'det-net2', type: 'detailNode', position: { x: 280, y: 190 }, parentNode: 'analysis-engines', data: { label: 'Merge Relations' } },
    { id: 'det-net3', type: 'detailNode', position: { x: 280, y: 230 }, parentNode: 'analysis-engines', data: { label: 'NetworkX Graph' } },
    { id: 'det-net4', type: 'detailNode', position: { x: 280, y: 270 }, parentNode: 'analysis-engines', data: { label: 'Community Detection' } },
    { id: 'det-net5', type: 'detailNode', position: { x: 280, y: 310 }, parentNode: 'analysis-engines', data: { label: 'React Flow Data' } },

    // Analytics
    { id: 'engine-analytics', type: 'customNode', position: { x: 510, y: 40 }, parentNode: 'analysis-engines', data: { label: 'Analytics', sublabel: 'Aggregations', icon: Activity, iconColor: 'text-orange-400', borderColor: 'border-orange-500/50', targetHandle: true, sourceHandle: true } },
    { id: 'det-ana1', type: 'detailNode', position: { x: 510, y: 150 }, parentNode: 'analysis-engines', data: { label: 'KPIs' } },
    { id: 'det-ana2', type: 'detailNode', position: { x: 510, y: 190 }, parentNode: 'analysis-engines', data: { label: 'Charts' } },
    { id: 'det-ana3', type: 'detailNode', position: { x: 510, y: 230 }, parentNode: 'analysis-engines', data: { label: 'Maps' } },
    { id: 'det-ana4', type: 'detailNode', position: { x: 510, y: 270 }, parentNode: 'analysis-engines', data: { label: 'Statistics' } },

    // ==========================================
    // LAYER 5: DB & AI SERVICES (Side-by-side)
    // ==========================================
    {
      id: 'db-group',
      type: 'groupNode',
      position: { x: 200, y: 1300 },
      style: { width: 600, height: 350 },
      data: { label: 'Database (Neon PostgreSQL)', borderColor: 'border-amber-700', textColor: 'text-amber-400', bgColor: 'bg-amber-900/10' }
    },
    { id: 'db-op', type: 'customNode', position: { x: 40, y: 60 }, parentNode: 'db-group', data: { label: 'Operational Tables', sublabel: 'CaseMaster, Accused...', icon: Database, iconColor: 'text-amber-400', borderColor: 'border-amber-500/50', targetHandle: true } },
    { id: 'db-ref', type: 'customNode', position: { x: 230, y: 60 }, parentNode: 'db-group', data: { label: 'Reference Tables', sublabel: 'Crime Head, Status...', icon: Database, iconColor: 'text-amber-400', borderColor: 'border-amber-500/50', targetHandle: true } },
    { id: 'db-vec', type: 'customNode', position: { x: 420, y: 60 }, parentNode: 'db-group', data: { label: 'Vector Store', sublabel: 'pgvector Embeddings', icon: Cpu, iconColor: 'text-amber-400', borderColor: 'border-amber-500/50', targetHandle: true, rightHandle: true } },

    {
      id: 'ai-group',
      type: 'groupNode',
      position: { x: 900, y: 1300 },
      style: { width: 600, height: 350 },
      data: { label: 'External AI Services', borderColor: 'border-purple-700', textColor: 'text-purple-400', bgColor: 'bg-purple-900/10' }
    },
    { id: 'ai-groq', type: 'customNode', position: { x: 40, y: 60 }, parentNode: 'ai-group', data: { label: 'Groq LLM', icon: Bot, iconColor: 'text-purple-400', borderColor: 'border-purple-500/50', targetHandle: true, leftHandle: true } },
    { id: 'ai-g1', type: 'detailNode', position: { x: 60, y: 160 }, parentNode: 'ai-group', data: { label: 'Intent Classify' } },
    { id: 'ai-g2', type: 'detailNode', position: { x: 60, y: 200 }, parentNode: 'ai-group', data: { label: 'SQL Gen' } },
    { id: 'ai-g3', type: 'detailNode', position: { x: 60, y: 240 }, parentNode: 'ai-group', data: { label: 'Answer Gen' } },

    { id: 'ai-gemini', type: 'customNode', position: { x: 230, y: 60 }, parentNode: 'ai-group', data: { label: 'Google Gemini', icon: Bot, iconColor: 'text-purple-400', borderColor: 'border-purple-500/50', targetHandle: true, leftHandle: true } },
    { id: 'ai-ge1', type: 'detailNode', position: { x: 250, y: 160 }, parentNode: 'ai-group', data: { label: 'Embeddings Gen' } },

    { id: 'ai-sarvam', type: 'customNode', position: { x: 420, y: 60 }, parentNode: 'ai-group', data: { label: 'Sarvam AI', icon: Bot, iconColor: 'text-purple-400', borderColor: 'border-purple-500/50', targetHandle: true, sourceHandle: true, rightHandle: true } },
    { id: 'ai-sa1', type: 'detailNode', position: { x: 440, y: 160 }, parentNode: 'ai-group', data: { label: 'Voice STT' } },
    { id: 'ai-sa2', type: 'detailNode', position: { x: 440, y: 200 }, parentNode: 'ai-group', data: { label: 'Translation' } },

    // ==========================================
    // LAYER 6: DEPLOYMENT (Emerald)
    // ==========================================
    {
      id: 'deployment-group',
      type: 'groupNode',
      position: { x: 550, y: 1750 },
      style: { width: 550, height: 200 },
      data: { label: 'Deployment (Zoho Catalyst)', borderColor: 'border-emerald-700', textColor: 'text-emerald-400', bgColor: 'bg-emerald-900/10' }
    },
    { id: 'dep-web', type: 'customNode', position: { x: 30, y: 60 }, parentNode: 'deployment-group', data: { label: 'Web Hosting', icon: Cloud, iconColor: 'text-emerald-400', borderColor: 'border-emerald-500/50', targetHandle: true } },
    { id: 'dep-appsail', type: 'customNode', position: { x: 200, y: 60 }, parentNode: 'deployment-group', data: { label: 'AppSail (Docker)', icon: Server, iconColor: 'text-emerald-400', borderColor: 'border-emerald-500/50', targetHandle: true } },
    { id: 'dep-env', type: 'customNode', position: { x: 370, y: 60 }, parentNode: 'deployment-group', data: { label: 'Environment Config', icon: Settings, iconColor: 'text-emerald-400', borderColor: 'border-emerald-500/50', targetHandle: true } },
  ], []);

  const edges = useMemo(() => {
    const defaultEdge = { type: 'smoothstep', animated: true, style: { stroke: '#475569', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#475569' } };
    const internalEdge = { type: 'straight', style: { stroke: '#334155', strokeWidth: 1.5 } };
    const returnEdge = { type: 'smoothstep', animated: true, style: { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '5,5' }, markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' } };

    return [
      // Users -> Frontend
      { id: 'e-user-text', source: 'user', target: 'fe-dashboard', ...defaultEdge, label: 'Request', labelStyle: { fill: '#94a3b8', fontSize: 12 }, labelBgStyle: { fill: '#020617' } },
      
      // Voice Path
      { id: 'e-user-voice', source: 'user', target: 'voice-input', ...defaultEdge, style: { stroke: '#f472b6', strokeWidth: 2 } },
      { id: 'e-voice-sarvam', source: 'voice-input', target: 'ai-sarvam', type: 'smoothstep', style: { stroke: '#f472b6', strokeWidth: 2 }, label: 'Audio Stream', labelStyle: { fill: '#f472b6', fontSize: 12 }, labelBgStyle: { fill: '#020617' } },
      { id: 'e-sarvam-rewriter', source: 'ai-sarvam', target: 'query-rewriter', type: 'smoothstep', style: { stroke: '#f472b6', strokeWidth: 2 }, label: 'Text Query', labelStyle: { fill: '#f472b6', fontSize: 12 }, labelBgStyle: { fill: '#020617' } },

      // Frontend -> Auth Pipeline
      { id: 'e-fe-gateway', source: 'fe-dashboard', target: 'fe-api-gateway', targetHandle: 'left', ...defaultEdge },
      { id: 'e-fe-auth', source: 'fe-api-gateway', target: 'auth', ...defaultEdge, label: 'REST API', labelStyle: { fill: '#94a3b8', fontSize: 12 }, labelBgStyle: { fill: '#020617' } },

      // Auth Pipeline (Security Layer)
      { id: 'e-auth-rbac', source: 'auth', sourceHandle: 'right', target: 'rbac', targetHandle: 'left', ...defaultEdge },
      { id: 'e-rbac-rw', source: 'rbac', sourceHandle: 'right', target: 'query-rewriter', targetHandle: 'left', ...defaultEdge },
      { id: 'e-rw-rt', source: 'query-rewriter', sourceHandle: 'right', target: 'router', targetHandle: 'left', ...defaultEdge },

      // Rewriter Internals
      { id: 'e-qw-1', source: 'query-rewriter', target: 'det-qw1', ...internalEdge },
      { id: 'e-qw-2', source: 'det-qw1', target: 'det-qw2', ...internalEdge },

      // Router -> Engines
      { id: 'e-rt-ce', source: 'router', target: 'engine-ce', ...defaultEdge },
      { id: 'e-rt-nl2', source: 'router', target: 'engine-nl2sql', ...defaultEdge },
      { id: 'e-rt-rag', source: 'router', target: 'engine-rag', ...defaultEdge },
      { id: 'e-rt-pat', source: 'router', target: 'engine-pattern', ...defaultEdge },
      { id: 'e-rt-net', source: 'router', target: 'engine-network', ...defaultEdge },
      { id: 'e-rt-ana', source: 'router', target: 'engine-analytics', ...defaultEdge },

      // Engine Internals (Case Explorer)
      { id: 'e-ce1', source: 'engine-ce', target: 'det-ce1', ...internalEdge },
      { id: 'e-ce2', source: 'det-ce1', target: 'det-ce2', ...internalEdge },
      { id: 'e-ce3', source: 'det-ce2', target: 'det-ce3', ...internalEdge },

      // Engine Internals (NL2SQL)
      { id: 'e-nl1', source: 'engine-nl2sql', target: 'det-nl1', ...internalEdge },
      { id: 'e-nl2', source: 'det-nl1', target: 'det-nl2', ...internalEdge },
      { id: 'e-nl3', source: 'det-nl2', target: 'det-nl3', ...internalEdge },
      { id: 'e-nl4', source: 'det-nl3', target: 'det-nl4', ...internalEdge },
      { id: 'e-nl5', source: 'det-nl4', target: 'det-nl5', ...internalEdge },

      // Engine Internals (RAG)
      { id: 'e-rag1', source: 'engine-rag', target: 'det-rag1', ...internalEdge },
      { id: 'e-rag2', source: 'det-rag1', target: 'det-rag2', ...internalEdge },
      { id: 'e-rag3', source: 'det-rag2', target: 'det-rag3', ...internalEdge },
      { id: 'e-rag4', source: 'det-rag3', target: 'det-rag4', ...internalEdge },
      { id: 'e-rag5', source: 'det-rag4', target: 'det-rag5', ...internalEdge },

      // Engine Internals (Pattern)
      { id: 'e-pat1', source: 'engine-pattern', target: 'det-pat1', ...internalEdge },
      { id: 'e-pat2', source: 'det-pat1', target: 'det-pat2', ...internalEdge },
      { id: 'e-pat3', source: 'det-pat2', target: 'det-pat3', ...internalEdge },
      { id: 'e-pat4', source: 'det-pat3', target: 'det-pat4', ...internalEdge },
      { id: 'e-pat5', source: 'det-pat4', target: 'det-pat5', ...internalEdge },

      // Engine Internals (Network)
      { id: 'e-net1', source: 'engine-network', target: 'det-net1', ...internalEdge },
      { id: 'e-net2', source: 'det-net1', target: 'det-net2', ...internalEdge },
      { id: 'e-net3', source: 'det-net2', target: 'det-net3', ...internalEdge },
      { id: 'e-net4', source: 'det-net3', target: 'det-net4', ...internalEdge },
      { id: 'e-net5', source: 'det-net4', target: 'det-net5', ...internalEdge },

      // Engine Internals (Analytics)
      { id: 'e-ana1', source: 'engine-analytics', target: 'det-ana1', ...internalEdge },
      { id: 'e-ana2', source: 'det-ana1', target: 'det-ana2', ...internalEdge },
      { id: 'e-ana3', source: 'det-ana2', target: 'det-ana3', ...internalEdge },
      { id: 'e-ana4', source: 'det-ana3', target: 'det-ana4', ...internalEdge },

      // Engines -> Database
      { id: 'e-db-nl', source: 'det-nl5', target: 'db-op', ...defaultEdge },
      { id: 'e-db-rag', source: 'det-rag3', target: 'db-vec', ...defaultEdge },
      { id: 'e-db-ce', source: 'det-ce3', target: 'db-op', ...defaultEdge },
      { id: 'e-db-pat', source: 'det-pat4', target: 'db-op', ...defaultEdge },
      { id: 'e-db-net', source: 'det-net2', target: 'db-op', ...defaultEdge },
      { id: 'e-db-ana', source: 'det-ana2', target: 'db-op', ...defaultEdge },

      // Engines -> AI Dependencies
      { id: 'e-ai-groq1', source: 'router', target: 'ai-groq', targetHandle: 'left', ...defaultEdge, style: { stroke: '#a855f7', strokeDasharray: '5,5' } },
      { id: 'e-ai-groq2', source: 'det-nl2', target: 'ai-groq', targetHandle: 'left', ...defaultEdge, style: { stroke: '#a855f7', strokeDasharray: '5,5' } },
      { id: 'e-ai-groq3', source: 'det-rag4', target: 'ai-groq', targetHandle: 'left', ...defaultEdge, style: { stroke: '#a855f7', strokeDasharray: '5,5' } },
      { id: 'e-ai-gem', source: 'det-rag1', target: 'ai-gemini', targetHandle: 'left', ...defaultEdge, style: { stroke: '#a855f7', strokeDasharray: '5,5' } },

      // AI Internals
      { id: 'e-aig1', source: 'ai-groq', target: 'ai-g1', ...internalEdge },
      { id: 'e-aig2', source: 'ai-g1', target: 'ai-g2', ...internalEdge },
      { id: 'e-aig3', source: 'ai-g2', target: 'ai-g3', ...internalEdge },
      { id: 'e-aige1', source: 'ai-gemini', target: 'ai-ge1', ...internalEdge },
      { id: 'e-aisa1', source: 'ai-sarvam', target: 'ai-sa1', ...internalEdge },
      { id: 'e-aisa2', source: 'ai-sa1', target: 'ai-sa2', ...internalEdge },

      // Response Flow (Return path)
      { id: 'e-ret-ce', source: 'det-ce3', target: 'fe-dashboard', targetHandle: 'bottom', ...returnEdge },
      { id: 'e-ret-nl', source: 'det-nl5', target: 'fe-dashboard', targetHandle: 'bottom', ...returnEdge },
      { id: 'e-ret-rag', source: 'det-rag5', target: 'fe-dashboard', targetHandle: 'bottom', ...returnEdge },
      { id: 'e-ret-pat', source: 'det-pat5', target: 'fe-dashboard', targetHandle: 'bottom', ...returnEdge },
      { id: 'e-ret-net', source: 'det-net5', target: 'fe-dashboard', targetHandle: 'bottom', ...returnEdge, label: 'JSON Response', labelStyle: { fill: '#3b82f6', fontSize: 12 }, labelBgStyle: { fill: '#020617' } },
      { id: 'e-ret-ana', source: 'det-ana4', target: 'fe-dashboard', targetHandle: 'bottom', ...returnEdge },
      { id: 'e-ret-user', source: 'fe-dashboard', target: 'user', targetHandle: 'bottom', ...returnEdge, label: 'UI View', labelStyle: { fill: '#3b82f6', fontSize: 12 }, labelBgStyle: { fill: '#020617' } },

      // Deployment Links (just indicative)
      { id: 'e-dep-web', source: 'dep-web', target: 'frontend-group', targetHandle: 'bottom', type: 'straight', style: { stroke: '#10b981', strokeWidth: 1, strokeDasharray: '10,10' } },
      { id: 'e-dep-api', source: 'dep-appsail', target: 'auth-pipeline', targetHandle: 'bottom', type: 'straight', style: { stroke: '#10b981', strokeWidth: 1, strokeDasharray: '10,10' } },
      { id: 'e-dep-db', source: 'dep-env', target: 'db-group', targetHandle: 'bottom', type: 'straight', style: { stroke: '#10b981', strokeWidth: 1, strokeDasharray: '10,10' } },

    ];
  }, []);

  return (
    <div className="w-full flex flex-col h-full overflow-hidden bg-slate-950">
      <div className="flex items-center justify-between shrink-0 p-4 border-b border-slate-800 bg-slate-950">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-900/50 text-primary-400 rounded-lg border border-primary-800/50">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Enterprise System Architecture</h1>
            <p className="text-slate-400">Exhaustive Interactive Topology of the TriNetra Orchestrator</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-medium transition-colors shadow-sm text-sm">
            Close Canvas
          </button>
        )}
      </div>

      <div className="flex-1 w-full overflow-hidden relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.1 }}
          minZoom={0.1}
          maxZoom={1.5}
          className="bg-slate-950"
        >
          <Panel position="top-right" className="bg-slate-900/80 p-4 rounded-xl border border-slate-700 shadow-xl backdrop-blur-sm mr-4 mt-4">
            <h3 className="text-white font-bold mb-2 text-sm border-b border-slate-700 pb-1">Color Hierarchy</h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div><span className="text-slate-300">Users & Frontend</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500"></div><span className="text-slate-300">Auth & Security</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-orange-500"></div><span className="text-slate-300">Processing Engines</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-500"></div><span className="text-slate-300">Database</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-purple-500"></div><span className="text-slate-300">External AI Services</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500"></div><span className="text-slate-300">Deployment</span></div>
            </div>
          </Panel>
          <Background color="#334155" gap={20} size={2} />
          <Controls className="!bg-slate-900 !border-slate-700 !fill-slate-300" />
          <MiniMap 
            nodeColor={(node) => {
              switch (node.type) {
                case 'groupNode': return '#0f172a';
                case 'detailNode': return '#1e293b';
                default: return '#334155';
              }
            }}
            maskColor="rgba(2, 6, 23, 0.8)"
            className="!bg-slate-900 !border-slate-800"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
