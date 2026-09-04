import { useMemo, useState, useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  Handle,
  Position,
  Panel,
} from 'reactflow';
import type { Node, Edge, NodeMouseHandler } from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Server, ShieldCheck, Database, Bot, User,
  BrainCircuit, Activity, Network, FileSearch, ShieldAlert,
  Cloud, Lock, Code, Cpu, ListTree, Link as LinkIcon,
  Mic, FolderSearch, X, ChevronRight,
  Zap, Globe, Cog, Target, Search, BarChart3, GitBranch,
  Banknote, AlertTriangle, FileText, Eye, Brain,
  MessagesSquare, Layers,
} from 'lucide-react';

// ════════════════════════════════════════════════════════════════
// COMPONENT DETAIL DATA
// ════════════════════════════════════════════════════════════════

interface ComponentDetail {
  name: string;
  purpose: string;
  responsibilities: string[];
  inputs: string;
  outputs: string;
  technologies: string;
  backendModule: string;
  status: 'implemented' | 'in-progress' | 'planned';
}

const COMPONENT_DETAILS: Record<string, ComponentDetail> = {
  'investigator': {
    name: 'Investigator / Analyst',
    purpose: 'Law enforcement officer using natural language to conduct crime investigations.',
    responsibilities: [
      'Submit natural language investigation queries',
      'Voice input in English or Kannada',
      'Review investigation findings and evidence',
      'Follow up on next best investigative actions',
    ],
    inputs: 'Natural language text, voice audio',
    outputs: 'Investigation intelligence, evidence graphs, next actions',
    technologies: 'React 19, Web Audio API, Vite',
    backendModule: 'Auth → Investigation Engine',
    status: 'implemented',
  },
  'frontend-group': {
    name: 'TriNetra Frontend',
    purpose: 'React single-page application providing all user-facing investigation interfaces.',
    responsibilities: [
      'Dashboard with KPI overview and jurisdiction statistics',
      'Natural language investigation chat interface',
      'Case Explorer with faceted search and case detail',
      'Network Analysis with interactive graph visualization',
      'Crime Analytics with hotspot maps and trends',
      'Pattern Analytics with MO-based cluster detection',
      'Offender Profiles with risk score ranking',
      'Prevention Alerts for jurisdiction monitoring',
      'Crime Forecasting with predictive hotspots',
      'Financial Trail Analysis with transaction graph',
      'Voice input via Sarvam AI STT',
      'Kannada ↔ English translation',
    ],
    inputs: 'User interactions, API responses',
    outputs: 'Visualizations, investigation results, evidence graphs',
    technologies: 'React 19, Vite, TailwindCSS, ReactFlow, Recharts, Leaflet, Axios',
    backendModule: 'src/pages/*, src/services/api.ts',
    status: 'implemented',
  },
  'auth-pipeline': {
    name: 'Security & Governance Pipeline',
    purpose: 'Mandatory security layer applied to every authenticated API request.',
    responsibilities: [
      'JWT token verification on every endpoint',
      'Role-Based Access Control (Investigator, Supervisor, Analyst, Policymaker)',
      'District/jurisdiction-level data filtering',
      'Audit logging of all query executions',
      'Query rewriting for multi-turn context resolution',
      'Intent classification to route to correct engine',
    ],
    inputs: 'HTTP requests with JWT Authorization header',
    outputs: 'Authenticated, authorized, routed request with RBAC SQL filter',
    technologies: 'bcrypt, PyJWT, FastAPI Dependencies',
    backendModule: 'engines/auth.py, engines/security.py, engines/router.py',
    status: 'implemented',
  },
  'orchestrator': {
    name: 'Investigation Orchestrator',
    purpose: 'Multi-engine investigation pipeline that plans, executes, fuses, and synthesizes intelligence from multiple engines.',
    responsibilities: [
      'Convert natural language to structured investigation plan via LLM',
      'Determine which intelligence engines to activate',
      'Resolve investigation scope (district, crime category, entities)',
      'Execute selected engines in parallel',
      'Fuse evidence from multiple engine outputs',
      'Calculate evidence strength and provenance',
      'Generate explainable NL summary grounded in evidence',
      'Multi-turn investigation context preservation',
    ],
    inputs: 'Natural language investigation query + RBAC filter + conversation history',
    outputs: 'Fused investigation findings, evidence graph, citations, next best actions',
    technologies: 'Groq LLM (gpt-oss-120b), custom planner, evidence fusion',
    backendModule: 'engines/investigation.py → InvestigationPlanner + InvestigationOrchestrator + EvidenceFusion + ResponseBuilder',
    status: 'implemented',
  },
  'engine-nl2sql': {
    name: 'NL2SQL Engine',
    purpose: 'Converts natural language crime queries into optimized PostgreSQL SQL with RBAC guardrails.',
    responsibilities: [
      'Build database schema-aware prompt for SQL generation',
      'Generate PostgreSQL query via Groq LLM',
      'Validate SQL against schema whitelist',
      'Inject RBAC WHERE conditions for jurisdiction filtering',
      'Execute and return structured results',
      'Support temporal trend aggregations',
    ],
    inputs: 'Natural language query + RBAC SQL filter',
    outputs: 'SQL query, validated execution results, structured data',
    technologies: 'Groq LLM, psycopg2, PostgreSQL + pgvector',
    backendModule: 'engines/nl2sql.py → NL2SQLEngine',
    status: 'implemented',
  },
  'engine-ce': {
    name: 'Case Explorer Engine',
    purpose: 'Faceted case search, detail retrieval, and case lifecycle management.',
    responsibilities: [
      'Paginated case search with district/status/category filters',
      'Full case detail with timeline, people, chargesheets',
      'Filter option generation for dropdowns',
      'Direct SQL queries for fast retrieval',
    ],
    inputs: 'District, status, crime category, search keywords, pagination',
    outputs: 'Case lists, case details with status history and people',
    technologies: 'psycopg2, PostgreSQL',
    backendModule: 'engines/case_explorer.py → CaseExplorerEngine',
    status: 'implemented',
  },
  'engine-rag': {
    name: 'RAG Engine',
    purpose: 'Semantic search over FIR narratives using pgvector embeddings for case similarity by story.',
    responsibilities: [
      'Embed user query using Google Gemini embeddings',
      'Vector similarity search via pgvector cosine distance',
      'Top-k narrative retrieval from CaseNarrativeEmbedding table',
      'LLM-synthesized answer with crime number citations',
    ],
    inputs: 'Natural language query describing a scenario',
    outputs: 'Narrative intelligence with citations, matched case list',
    technologies: 'Google Gemini embeddings, pgvector, Groq LLM',
    backendModule: 'engines/rag.py → RAGEngine',
    status: 'implemented',
  },
  'engine-pattern': {
    name: 'Pattern Detection Engine',
    purpose: 'Crime pattern analysis using MO similarity, spatial proximity, and temporal correlation.',
    responsibilities: [
      'Emerging MO-based cluster detection (last 90 days)',
      'Scoped pattern search by crime category and district',
      'Tri-signal case similarity: narrative + MO + geo-temporal',
      'Composite match scoring with explainability',
      'Sparkline generation for temporal patterns',
    ],
    inputs: 'Crime categories, districts, time windows, case IDs',
    outputs: 'Pattern clusters, similar case rankings with explanations',
    technologies: 'pgvector, PostgreSQL, NetworkX (for graph)',
    backendModule: 'engines/pattern_engine.py → PatternEngine',
    status: 'implemented',
  },
  'engine-network': {
    name: 'Criminal Network Engine',
    purpose: 'Social network analysis of criminal relationships using graph traversal and community detection.',
    responsibilities: [
      'Multi-hop network traversal (1–3 hops)',
      'SQL-based relationship retrieval (co-accused, financial, shared MO)',
      'NetworkX graph construction and community detection (Louvain)',
      'Node/edge metadata with case provenance',
      'ReactFlow-compatible graph data generation',
    ],
    inputs: 'Accused ID, hop count, active relationship layers',
    outputs: 'Network graph (nodes + edges + communities + stats)',
    technologies: 'NetworkX, Louvain community detection, psycopg2',
    backendModule: 'engines/network_engine.py → NetworkEngine',
    status: 'implemented',
  },
  'engine-analytics': {
    name: 'Crime Analytics Engine',
    purpose: 'Statistical analytics, hotspot detection, offender risk profiling, and jurisdiction KPIs.',
    responsibilities: [
      'KPI summary statistics (case counts, arrest rates, chargesheet times)',
      'Geographic hotspot visualization coordinates',
      'Historical crime trends and YoY comparisons',
      'Crime category distributions and MO tag analysis',
      'Offender risk scoring with repeat offender detection',
      'Prevention alert generation from trend anomalies',
      'Demographic analysis with privacy thresholds (n≥10)',
      'Reporting lag analysis and lifecycle funnel tracking',
    ],
    inputs: 'District, time window, category filters',
    outputs: 'KPI dashboards, hotspot maps, trend charts, risk profiles, alerts',
    technologies: 'PostgreSQL, Recharts, Leaflet',
    backendModule: 'engines/analytics.py → AnalyticsEngine',
    status: 'implemented',
  },
  'engine-financial': {
    name: 'Financial Intelligence Engine',
    purpose: 'Evidence-grounded money trail analysis connecting accused persons through bank accounts and transactions.',
    responsibilities: [
      'Suspect account discovery from accused/case entities',
      'Transaction chain detection (A → B → C multi-hop paths)',
      'Cross-case financial link detection',
      'Shared bank account identification',
      'Deterministic anomaly detection (high-volume, high-value, rapid movement, bidirectional)',
      'Financial lead generation with evidence grounding',
      'ReactFlow financial graph visualization',
    ],
    inputs: 'Accused IDs, Case IDs, date range filters',
    outputs: 'Financial graph, transaction chains, anomalies, cross-case links, financial leads',
    technologies: 'PostgreSQL, DFS graph traversal, deterministic anomaly scoring',
    backendModule: 'engines/financial_intelligence.py → FinancialIntelligenceEngine + FinancialLeadGenerator',
    status: 'implemented',
  },
  'engine-evidence-graph': {
    name: 'Evidence Graph Builder',
    purpose: 'Constructs provenance-tracked evidence graphs linking real entities across investigation findings.',
    responsibilities: [
      'Build entity-relationship graphs from each finding type',
      'Case→Accused, Accused→Account, Pattern→Case links',
      'Evidence strength aggregation across independent sources',
      'Source provenance tracking (which engine produced each edge)',
      'Combined evidence graph merging with deduplication',
    ],
    inputs: 'Investigation findings (from EvidenceFusion)',
    outputs: 'Evidence graph (nodes + edges + strength + provenance)',
    technologies: 'Custom graph builder, psycopg2',
    backendModule: 'engines/evidence_graph.py → EvidenceGraphBuilder',
    status: 'implemented',
  },
  'engine-nba': {
    name: 'Next Best Action Engine',
    purpose: 'Evidence-grounded investigative lead generation for prioritizing follow-up actions.',
    responsibilities: [
      'Extract candidate leads from investigation findings',
      'Classify leads by type (related_case, repeat_offender, network_connection, pattern_cluster)',
      'Priority scoring based on evidence strength and recency',
      'Lead deduplication and ranking',
      'Actionable recommendations with navigation actions',
    ],
    inputs: 'Investigation findings with evidence data',
    outputs: 'Ranked next-best-action leads with evidence traces',
    technologies: 'Deterministic scoring (no LLM for lead generation)',
    backendModule: 'engines/next_best_action.py → NextBestActionEngine',
    status: 'implemented',
  },
  'engine-forecasting': {
    name: 'Crime Forecasting Engine',
    purpose: 'Statistical crime trend forecasting using Holt-Winters exponential smoothing.',
    responsibilities: [
      'Monthly crime volume forecasting per category',
      'Time-series model parameter estimation (alpha, beta, gamma)',
      'Forecast evaluation (MAE, RMSE, MAPE)',
      'Baseline comparison for model validation',
      'Data sufficiency checks',
    ],
    inputs: 'Category, district, forecast horizon (1–6 months)',
    outputs: 'Forecast points, confidence intervals, evaluation metrics',
    technologies: 'Holt-Winters exponential smoothing, psycopg2',
    backendModule: 'engines/forecasting.py → CrimeForecastingEngine',
    status: 'implemented',
  },
  'engine-predictive': {
    name: 'Predictive Hotspot Engine',
    purpose: 'Geographic hotspot classification using historical data and forecast signals.',
    responsibilities: [
      'Classify districts as predicted, emerging, historical, or stable',
      'Emergence ratio calculation (recent vs historical)',
      'Predicted ratio from forecast signals',
      'Sparkline generation for geographic trends',
      'RBAC-scoped district filtering',
    ],
    inputs: 'District, category, forecast horizon',
    outputs: 'Predictive hotspot classifications with signals',
    technologies: 'Statistical classification, PostgreSQL',
    backendModule: 'engines/predictive_hotspots.py → PredictiveHotspotEngine',
    status: 'implemented',
  },
  'engine-voice': {
    name: 'Voice & Language Engine',
    purpose: 'Speech-to-text transcription and Kannada ↔ English translation.',
    responsibilities: [
      'Web Audio API recording capture in browser',
      'Sarvam AI saaras:v3 speech-to-text transcription',
      'Sarvam AI sarvam-translate:v1 bilingual translation',
      'Language-gated pipeline (bypass translation for English)',
    ],
    inputs: 'Audio blob (WAV), language code',
    outputs: 'Transcribed text, translated text',
    technologies: 'Sarvam AI API, Web Audio API',
    backendModule: 'engines/sarvam_engine.py → SarvamEngine',
    status: 'implemented',
  },
  'data-group': {
    name: 'Data Foundation',
    purpose: 'PostgreSQL database with pgvector extension serving as the core operational and analytical data store.',
    responsibilities: [
      'CaseMaster, Accused, Victim, Complainant records',
      'FinancialTransaction, SuspectAccount relationships',
      'CrimeHead, CrimeSubHead, MOTagMaster reference data',
      'District, Unit, Employee organizational hierarchy',
      'OffenderRiskScore computed risk profiles',
      'CaseNarrativeEmbedding pgvector embeddings',
      'QueryAuditLog immutable audit trail',
      'EmployeeCredentials bcrypt-hashed passwords',
    ],
    inputs: 'All engine SQL queries',
    outputs: 'Structured data, vector embeddings, audit records',
    technologies: 'PostgreSQL (Neon), pgvector extension, 26+ core tables',
    backendModule: 'engines/database.py, all engine SQL queries',
    status: 'implemented',
  },
  'ai-group': {
    name: 'AI Services',
    purpose: 'External AI providers for LLM reasoning, embeddings, speech recognition, and translation.',
    responsibilities: [
      'Groq: LLM for intent classification, SQL generation, investigation planning, response synthesis',
      'Google Gemini: Embedding generation for RAG vector search',
      'Sarvam AI: Speech-to-text (saaras:v3) and translation (sarvam-translate:v1)',
    ],
    inputs: 'Prompts, audio, text for translation',
    outputs: 'Classified intents, generated SQL, embeddings, transcripts, translations',
    technologies: 'Groq (gpt-oss-120b), Google Gemini, Sarvam AI',
    backendModule: 'engines/router.py, engines/rag.py, engines/sarvam_engine.py',
    status: 'implemented',
  },
  'catalyst-group': {
    name: 'Zoho Catalyst — In Progress',
    purpose: 'Cloud platform services planned to replace standalone dev server deployment.',
    responsibilities: [
      'AppSail: Docker-based Python 3.11 backend deployment',
      'AppSail: Static Vite frontend hosting',
      'Data Store: Persistent data (replacing Neon PostgreSQL)',
      'Cache: Session caching and fast lookups',
      'Signals: Event-driven workflow triggers',
      'Functions: Serverless processing endpoints',
    ],
    inputs: 'Application requests, deployment configs',
    outputs: 'Hosted application, managed data, event triggers',
    technologies: 'Zoho Catalyst CLI, AppSail, Data Store, Cache, Signals, Functions',
    backendModule: 'catalyst.json, .catalyst/ deployment metadata',
    status: 'in-progress',
  },
};

// ════════════════════════════════════════════════════════════════
// CUSTOM NODE COMPONENTS (Light Theme)
// ════════════════════════════════════════════════════════════════

const CustomNode = ({ data }: any) => {
  const Icon = data.icon;
  return (
    <div
      className={`px-4 py-3 rounded-xl border-2 bg-white min-w-[160px] shadow-sm transition-shadow hover:shadow-md ${data.borderColor}`}
      style={{ cursor: 'pointer' }}
    >
      {data.targetHandle && (
        <Handle type="target" position={data.targetPosition || Position.Top} className="!bg-slate-400 !w-2.5 !h-2.5 !border-2 !border-white" />
      )}

      <div className="flex flex-col items-center justify-center gap-1.5">
        {Icon && <Icon className={`w-7 h-7 ${data.iconColor}`} />}
        <div className="font-bold text-xs text-slate-800 text-center leading-tight">{data.label}</div>
        {data.sublabel && (
          <div className="text-[10px] text-slate-500 text-center leading-tight max-w-[140px]">{data.sublabel}</div>
        )}
        {data.statusBadge && (
          <div className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 ${
            data.statusBadge === 'IMPLEMENTED' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
            data.statusBadge === 'IN PROGRESS' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
            'bg-blue-100 text-blue-700 border border-blue-200'
          }`}>{data.statusBadge}</div>
        )}
      </div>

      {data.sourceHandle && (
        <Handle type="source" position={data.sourcePosition || Position.Bottom} className="!bg-slate-400 !w-2.5 !h-2.5 !border-2 !border-white" />
      )}
      {data.leftHandle && (
        <Handle id="left" type="source" position={Position.Left} className="!bg-slate-400 !w-2.5 !h-2.5 !border-2 !border-white" />
      )}
      {data.rightHandle && (
        <Handle id="right" type="source" position={Position.Right} className="!bg-slate-400 !w-2.5 !h-2.5 !border-2 !border-white" />
      )}
    </div>
  );
};

const GroupNode = ({ data }: any) => {
  return (
    <div
      className={`w-full h-full rounded-2xl border-2 border-dashed ${data.borderColor} ${data.bgColor || 'bg-slate-50'} relative p-4`}
    >
      <div className={`absolute -top-3 left-4 px-2 bg-white font-bold text-[11px] tracking-wide uppercase ${data.textColor} flex items-center gap-1.5`}>
        {data.icon && <data.icon className="w-3.5 h-3.5" />}
        {data.label}
        {data.statusBadge && (
          <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded-full ml-1 ${
            data.statusBadge === 'IN PROGRESS' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
          }`}>{data.statusBadge}</span>
        )}
      </div>
    </div>
  );
};

const DetailNode = ({ data }: any) => {
  return (
    <div className="px-2.5 py-1.5 bg-slate-50 rounded-md border border-slate-200 min-w-[100px] shadow-sm flex flex-col justify-center items-center hover:bg-slate-100 transition-colors">
      {data.targetHandle && (
        <Handle type="target" position={data.targetPosition || Position.Top} className="!bg-slate-300 !w-1.5 !h-1.5" />
      )}
      <div className="text-[9px] font-semibold text-slate-600 text-center leading-tight">{data.label}</div>
      {data.sourceHandle && (
        <Handle type="source" position={data.sourcePosition || Position.Bottom} className="!bg-slate-300 !w-1.5 !h-1.5" />
      )}
    </div>
  );
};

const nodeTypes = {
  customNode: CustomNode,
  groupNode: GroupNode,
  detailNode: DetailNode,
};

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════

export default function ArchitecturePage({ onClose }: { onClose?: () => void }) {
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    const id = node.id;
    if (COMPONENT_DETAILS[id]) {
      setSelectedComponent(id);
    }
  }, []);

  const nodes: Node[] = useMemo(() => [
    // ════════════════════════════════════════════════
    // LAYER 1: USERS
    // ════════════════════════════════════════════════
    {
      id: 'investigator',
      type: 'customNode',
      position: { x: 425, y: 0 },
      data: {
        label: 'Investigator / Analyst',
        sublabel: 'Natural Language & Voice',
        icon: User,
        iconColor: 'text-sky-600',
        borderColor: 'border-sky-300',
        sourceHandle: true,
        rightHandle: true,
      },
    },
    {
      id: 'voice-input',
      type: 'customNode',
      position: { x: 725, y: 0 },
      data: {
        label: 'Voice Input',
        sublabel: 'English / Kannada',
        icon: Mic,
        iconColor: 'text-rose-500',
        borderColor: 'border-rose-200',
        targetHandle: true,
        sourceHandle: true,
        leftHandle: true,
      },
    },

    // ════════════════════════════════════════════════
    // LAYER 2: FRONTEND
    // ════════════════════════════════════════════════
    {
      id: 'frontend-group',
      type: 'groupNode',
      position: { x: 25, y: 130 },
      style: { width: 1300, height: 320 },
      data: {
        label: 'TriNetra Frontend',
        icon: Globe,
        borderColor: 'border-sky-300',
        textColor: 'text-sky-600',
        bgColor: 'bg-sky-50/50',
      },
    },
    {
      id: 'fe-pages-group',
      type: 'groupNode',
      position: { x: 20, y: 30 },
      style: { width: 840, height: 130 },
      parentNode: 'frontend-group',
      extent: 'parent',
      data: { label: 'Interface Pages', borderColor: 'border-sky-200', textColor: 'text-sky-500' },
    },
    { id: 'fe-p1', type: 'detailNode', position: { x: 15, y: 30 }, parentNode: 'fe-pages-group', extent: 'parent', data: { label: 'Dashboard' } },
    { id: 'fe-p2', type: 'detailNode', position: { x: 120, y: 30 }, parentNode: 'fe-pages-group', extent: 'parent', data: { label: 'Ask TriNetra' } },
    { id: 'fe-p3', type: 'detailNode', position: { x: 225, y: 30 }, parentNode: 'fe-pages-group', extent: 'parent', data: { label: 'Case Explorer' } },
    { id: 'fe-p4', type: 'detailNode', position: { x: 330, y: 30 }, parentNode: 'fe-pages-group', extent: 'parent', data: { label: 'Network Analysis' } },
    { id: 'fe-p5', type: 'detailNode', position: { x: 435, y: 30 }, parentNode: 'fe-pages-group', extent: 'parent', data: { label: 'Crime Analytics' } },
    { id: 'fe-p6', type: 'detailNode', position: { x: 540, y: 30 }, parentNode: 'fe-pages-group', extent: 'parent', data: { label: 'Pattern Analytics' } },
    { id: 'fe-p7', type: 'detailNode', position: { x: 645, y: 30 }, parentNode: 'fe-pages-group', extent: 'parent', data: { label: 'Offender Profiles' } },
    { id: 'fe-p8', type: 'detailNode', position: { x: 15, y: 80 }, parentNode: 'fe-pages-group', extent: 'parent', data: { label: 'Prevention Alerts' } },
    { id: 'fe-p9', type: 'detailNode', position: { x: 120, y: 80 }, parentNode: 'fe-pages-group', extent: 'parent', data: { label: 'Crime Forecasting' } },
    { id: 'fe-p10', type: 'detailNode', position: { x: 225, y: 80 }, parentNode: 'fe-pages-group', extent: 'parent', data: { label: 'Financial Trail' } },
    { id: 'fe-p11', type: 'detailNode', position: { x: 330, y: 80 }, parentNode: 'fe-pages-group', extent: 'parent', data: { label: 'Architecture' } },

    {
      id: 'fe-voice',
      type: 'customNode',
      position: { x: 890, y: 30 },
      parentNode: 'frontend-group',
      extent: 'parent',
      data: {
        label: 'Voice & Translation',
        sublabel: 'Sarvam AI STT',
        icon: Mic,
        iconColor: 'text-rose-500',
        borderColor: 'border-rose-200',
        targetHandle: true,
        sourceHandle: true,
      },
    },
    {
      id: 'fe-api',
      type: 'customNode',
      position: { x: 890, y: 130 },
      parentNode: 'frontend-group',
      extent: 'parent',
      data: {
        label: 'REST API Client',
        sublabel: 'Axios + JWT Headers',
        icon: LinkIcon,
        iconColor: 'text-sky-600',
        borderColor: 'border-sky-300',
        targetHandle: true,
        sourceHandle: true,
      },
    },
    {
      id: 'fe-libs-group',
      type: 'groupNode',
      position: { x: 890, y: 220 },
      style: { width: 380, height: 80 },
      parentNode: 'frontend-group',
      extent: 'parent',
      data: { label: 'Libraries', borderColor: 'border-sky-200', textColor: 'text-sky-500' },
    },
    { id: 'fe-l1', type: 'detailNode', position: { x: 10, y: 30 }, parentNode: 'fe-libs-group', extent: 'parent', data: { label: 'ReactFlow' } },
    { id: 'fe-l2', type: 'detailNode', position: { x: 100, y: 30 }, parentNode: 'fe-libs-group', extent: 'parent', data: { label: 'Recharts' } },
    { id: 'fe-l3', type: 'detailNode', position: { x: 190, y: 30 }, parentNode: 'fe-libs-group', extent: 'parent', data: { label: 'Leaflet' } },
    { id: 'fe-l4', type: 'detailNode', position: { x: 280, y: 30 }, parentNode: 'fe-libs-group', extent: 'parent', data: { label: 'TailwindCSS' } },

    // ════════════════════════════════════════════════
    // LAYER 3: API / REQUEST LAYER
    // ════════════════════════════════════════════════
    {
      id: 'api-group',
      type: 'groupNode',
      position: { x: 25, y: 490 },
      style: { width: 1300, height: 200 },
      data: {
        label: 'Backend API Layer (FastAPI)',
        icon: Server,
        borderColor: 'border-indigo-300',
        textColor: 'text-indigo-600',
        bgColor: 'bg-indigo-50/30',
      },
    },
    { id: 'api-auth', type: 'detailNode', position: { x: 20, y: 35 }, parentNode: 'api-group', extent: 'parent', data: { label: 'POST /api/login' } },
    { id: 'api-profile', type: 'detailNode', position: { x: 20, y: 85 }, parentNode: 'api-group', extent: 'parent', data: { label: 'GET /api/profile' } },
    { id: 'api-chat', type: 'detailNode', position: { x: 170, y: 35 }, parentNode: 'api-group', extent: 'parent', data: { label: 'POST /api/chat' } },
    { id: 'api-investigate', type: 'detailNode', position: { x: 170, y: 85 }, parentNode: 'api-group', extent: 'parent', data: { label: 'POST /api/investigate' } },
    { id: 'api-cases', type: 'detailNode', position: { x: 320, y: 35 }, parentNode: 'api-group', extent: 'parent', data: { label: 'GET /api/cases/*' } },
    { id: 'api-casedetail', type: 'detailNode', position: { x: 320, y: 85 }, parentNode: 'api-group', extent: 'parent', data: { label: 'GET /api/cases/{id}' } },
    { id: 'api-network', type: 'detailNode', position: { x: 470, y: 35 }, parentNode: 'api-group', extent: 'parent', data: { label: 'GET /api/network/*' } },
    { id: 'api-patterns', type: 'detailNode', position: { x: 470, y: 85 }, parentNode: 'api-group', extent: 'parent', data: { label: 'GET /api/patterns*' } },
    { id: 'api-analytics', type: 'detailNode', position: { x: 620, y: 35 }, parentNode: 'api-group', extent: 'parent', data: { label: 'GET /api/analytics/*' } },
    { id: 'api-evidence', type: 'detailNode', position: { x: 620, y: 85 }, parentNode: 'api-group', extent: 'parent', data: { label: 'POST /api/evidence/graph' } },
    { id: 'api-nba', type: 'detailNode', position: { x: 770, y: 35 }, parentNode: 'api-group', extent: 'parent', data: { label: 'POST /api/investigation/next-actions' } },
    { id: 'api-forecast', type: 'detailNode', position: { x: 770, y: 85 }, parentNode: 'api-group', extent: 'parent', data: { label: 'GET /api/forecast*' } },
    { id: 'api-financial', type: 'detailNode', position: { x: 920, y: 35 }, parentNode: 'api-group', extent: 'parent', data: { label: 'POST /api/financial/analyze' } },
    { id: 'api-sarvam', type: 'detailNode', position: { x: 920, y: 85 }, parentNode: 'api-group', extent: 'parent', data: { label: 'POST /api/sarvam/*' } },
    { id: 'api-export', type: 'detailNode', position: { x: 1070, y: 35 }, parentNode: 'api-group', extent: 'parent', data: { label: 'POST /api/chat/export' } },

    // ════════════════════════════════════════════════
    // LAYER 4: SECURITY & GOVERNANCE
    // ════════════════════════════════════════════════
    {
      id: 'auth-pipeline',
      type: 'groupNode',
      position: { x: 175, y: 740 },
      style: { width: 1000, height: 180 },
      data: {
        label: 'Security & Governance',
        icon: ShieldCheck,
        borderColor: 'border-emerald-300',
        textColor: 'text-emerald-600',
        bgColor: 'bg-emerald-50/30',
      },
    },
    {
      id: 'auth',
      type: 'customNode',
      position: { x: 40, y: 40 },
      parentNode: 'auth-pipeline',
      extent: 'parent',
      data: {
        label: 'JWT Authentication',
        sublabel: 'bcrypt + PyJWT',
        icon: Lock,
        iconColor: 'text-emerald-600',
        borderColor: 'border-emerald-300',
        targetHandle: true,
        sourceHandle: true,
        rightHandle: true,
      },
    },
    {
      id: 'rbac',
      type: 'customNode',
      position: { x: 290, y: 40 },
      parentNode: 'auth-pipeline',
      extent: 'parent',
      data: {
        label: 'RBAC Security',
        sublabel: '4 Roles × District Scope',
        icon: ShieldAlert,
        iconColor: 'text-emerald-600',
        borderColor: 'border-emerald-300',
        targetHandle: true,
        sourceHandle: true,
        leftHandle: true,
        rightHandle: true,
      },
    },
    { id: 'rbac-1', type: 'detailNode', position: { x: 300, y: 115 }, parentNode: 'auth-pipeline', extent: 'parent', data: { label: 'Investigator → Station' } },
    { id: 'rbac-2', type: 'detailNode', position: { x: 300, y: 145 }, parentNode: 'auth-pipeline', extent: 'parent', data: { label: 'Supervisor → District' } },
    { id: 'rbac-3', type: 'detailNode', position: { x: 510, y: 115 }, parentNode: 'auth-pipeline', extent: 'parent', data: { label: 'Analyst → State-wide' } },
    { id: 'rbac-4', type: 'detailNode', position: { x: 510, y: 145 }, parentNode: 'auth-pipeline', extent: 'parent', data: { label: 'Policymaker → State-wide' } },
    {
      id: 'audit',
      type: 'customNode',
      position: { x: 540, y: 40 },
      parentNode: 'auth-pipeline',
      extent: 'parent',
      data: {
        label: 'Audit Logging',
        sublabel: 'Immutable QueryLog',
        icon: FileText,
        iconColor: 'text-emerald-600',
        borderColor: 'border-emerald-300',
        targetHandle: true,
        sourceHandle: true,
        leftHandle: true,
        rightHandle: true,
      },
    },
    {
      id: 'query-rewriter',
      type: 'customNode',
      position: { x: 790, y: 40 },
      parentNode: 'auth-pipeline',
      extent: 'parent',
      data: {
        label: 'Query Rewriter',
        sublabel: 'Context & Pronouns',
        icon: Code,
        iconColor: 'text-emerald-600',
        borderColor: 'border-emerald-300',
        targetHandle: true,
        sourceHandle: true,
        leftHandle: true,
      },
    },

    // ════════════════════════════════════════════════
    // LAYER 5: INVESTIGATION ORCHESTRATOR
    // ════════════════════════════════════════════════
    {
      id: 'orchestrator',
      type: 'groupNode',
      position: { x: 25, y: 980 },
      style: { width: 1300, height: 220 },
      data: {
        label: 'Investigation Orchestrator',
        icon: BrainCircuit,
        borderColor: 'border-violet-400',
        textColor: 'text-violet-700',
        bgColor: 'bg-violet-50/40',
      },
    },
    {
      id: 'orch-plan',
      type: 'customNode',
      position: { x: 20, y: 35 },
      parentNode: 'orchestrator',
      extent: 'parent',
      data: {
        label: 'NL Understanding',
        sublabel: 'LLM Plan Generation',
        icon: Brain,
        iconColor: 'text-violet-600',
        borderColor: 'border-violet-300',
        targetHandle: true,
        sourceHandle: true,
      },
    },
    {
      id: 'orch-scope',
      type: 'customNode',
      position: { x: 200, y: 35 },
      parentNode: 'orchestrator',
      extent: 'parent',
      data: {
        label: 'Scope Resolution',
        sublabel: 'DB-ID Mapping',
        icon: Search,
        iconColor: 'text-violet-600',
        borderColor: 'border-violet-300',
        targetHandle: true,
        sourceHandle: true,
      },
    },
    {
      id: 'orch-select',
      type: 'customNode',
      position: { x: 380, y: 35 },
      parentNode: 'orchestrator',
      extent: 'parent',
      data: {
        label: 'Engine Selection',
        sublabel: '8 Valid Engines',
        icon: Cog,
        iconColor: 'text-violet-600',
        borderColor: 'border-violet-300',
        targetHandle: true,
        sourceHandle: true,
      },
    },
    {
      id: 'orch-parallel',
      type: 'customNode',
      position: { x: 560, y: 35 },
      parentNode: 'orchestrator',
      extent: 'parent',
      data: {
        label: 'Parallel Execution',
        sublabel: 'Multi-Engine Pipeline',
        icon: Zap,
        iconColor: 'text-violet-600',
        borderColor: 'border-violet-300',
        targetHandle: true,
        sourceHandle: true,
      },
    },
    {
      id: 'orch-fusion',
      type: 'customNode',
      position: { x: 740, y: 35 },
      parentNode: 'orchestrator',
      extent: 'parent',
      data: {
        label: 'Evidence Fusion',
        sublabel: 'Cross-Engine Synthesis',
        icon: Layers,
        iconColor: 'text-violet-600',
        borderColor: 'border-violet-300',
        targetHandle: true,
        sourceHandle: true,
      },
    },
    {
      id: 'orch-response',
      type: 'customNode',
      position: { x: 920, y: 35 },
      parentNode: 'orchestrator',
      extent: 'parent',
      data: {
        label: 'NL Response',
        sublabel: 'LLM Summary',
        icon: MessagesSquare,
        iconColor: 'text-violet-600',
        borderColor: 'border-violet-300',
        targetHandle: true,
        sourceHandle: true,
      },
    },
    {
      id: 'orch-nba',
      type: 'customNode',
      position: { x: 1100, y: 35 },
      parentNode: 'orchestrator',
      extent: 'parent',
      data: {
        label: 'Next Best Action',
        sublabel: 'Lead Generation',
        icon: Target,
        iconColor: 'text-violet-600',
        borderColor: 'border-violet-300',
        targetHandle: true,
        sourceHandle: true,
      },
    },
    // Sub-label row
    { id: 'orch-l1', type: 'detailNode', position: { x: 50, y: 140 }, parentNode: 'orchestrator', extent: 'parent', data: { label: 'Conversation History' } },
    { id: 'orch-l2', type: 'detailNode', position: { x: 230, y: 140 }, parentNode: 'orchestrator', extent: 'parent', data: { label: 'CrimeHead/District Mapping' } },
    { id: 'orch-l3', type: 'detailNode', position: { x: 410, y: 140 }, parentNode: 'orchestrator', extent: 'parent', data: { label: 'case_query, rag, network, ...' } },
    { id: 'orch-l4', type: 'detailNode', position: { x: 590, y: 140 }, parentNode: 'orchestrator', extent: 'parent', data: { label: 'Engines run independently' } },
    { id: 'orch-l5', type: 'detailNode', position: { x: 770, y: 140 }, parentNode: 'orchestrator', extent: 'parent', data: { label: 'Strength scoring, deduplication' } },
    { id: 'orch-l6', type: 'detailNode', position: { x: 950, y: 140 }, parentNode: 'orchestrator', extent: 'parent', data: { label: 'Evidence-grounded text' } },

    // ════════════════════════════════════════════════
    // LAYER 6: INTELLIGENCE ENGINES
    // ════════════════════════════════════════════════
    {
      id: 'engines-group',
      type: 'groupNode',
      position: { x: 25, y: 1250 },
      style: { width: 1300, height: 520 },
      data: {
        label: 'Intelligence & Analytics Engines',
        icon: BrainCircuit,
        borderColor: 'border-amber-400',
        textColor: 'text-amber-700',
        bgColor: 'bg-amber-50/30',
      },
    },

    // --- Query Intelligence ---
    {
      id: 'query-engines',
      type: 'groupNode',
      position: { x: 20, y: 30 },
      style: { width: 620, height: 300 },
      parentNode: 'engines-group',
      extent: 'parent',
      data: { label: 'Query Intelligence', borderColor: 'border-amber-200', textColor: 'text-amber-600' },
    },
    {
      id: 'engine-nl2sql',
      type: 'customNode',
      position: { x: 15, y: 30 },
      parentNode: 'query-engines',
      extent: 'parent',
      data: {
        label: 'NL2SQL Engine',
        sublabel: 'Natural Language → SQL',
        icon: Database,
        iconColor: 'text-amber-600',
        borderColor: 'border-amber-300',
        targetHandle: true,
        sourceHandle: true,
      },
    },
    { id: 'det-nl1', type: 'detailNode', position: { x: 15, y: 130 }, parentNode: 'query-engines', extent: 'parent', data: { label: 'Schema-aware Prompt' } },
    { id: 'det-nl2', type: 'detailNode', position: { x: 15, y: 160 }, parentNode: 'query-engines', extent: 'parent', data: { label: 'SQL Generation (LLM)' } },
    { id: 'det-nl3', type: 'detailNode', position: { x: 15, y: 190 }, parentNode: 'query-engines', extent: 'parent', data: { label: 'RBAC WHERE Injection' } },
    { id: 'det-nl4', type: 'detailNode', position: { x: 15, y: 220 }, parentNode: 'query-engines', extent: 'parent', data: { label: 'Validate & Execute' } },

    {
      id: 'engine-ce',
      type: 'customNode',
      position: { x: 210, y: 30 },
      parentNode: 'query-engines',
      extent: 'parent',
      data: {
        label: 'Case Explorer',
        sublabel: 'Faceted Case Search',
        icon: FolderSearch,
        iconColor: 'text-amber-600',
        borderColor: 'border-amber-300',
        targetHandle: true,
        sourceHandle: true,
      },
    },
    { id: 'det-ce1', type: 'detailNode', position: { x: 210, y: 130 }, parentNode: 'query-engines', extent: 'parent', data: { label: 'Paginated Search + Filters' } },
    { id: 'det-ce2', type: 'detailNode', position: { x: 210, y: 160 }, parentNode: 'query-engines', extent: 'parent', data: { label: 'Case Detail + Timeline' } },
    { id: 'det-ce3', type: 'detailNode', position: { x: 210, y: 190 }, parentNode: 'query-engines', extent: 'parent', data: { label: 'Accused / Victims / Chargesheet' } },

    {
      id: 'engine-rag',
      type: 'customNode',
      position: { x: 410, y: 30 },
      parentNode: 'query-engines',
      extent: 'parent',
      data: {
        label: 'RAG Engine',
        sublabel: 'Semantic Narrative Search',
        icon: FileSearch,
        iconColor: 'text-amber-600',
        borderColor: 'border-amber-300',
        targetHandle: true,
        sourceHandle: true,
      },
    },
    { id: 'det-rag1', type: 'detailNode', position: { x: 410, y: 130 }, parentNode: 'query-engines', extent: 'parent', data: { label: 'Query Embedding (Gemini)' } },
    { id: 'det-rag2', type: 'detailNode', position: { x: 410, y: 160 }, parentNode: 'query-engines', extent: 'parent', data: { label: 'pgvector Cosine Search' } },
    { id: 'det-rag3', type: 'detailNode', position: { x: 410, y: 190 }, parentNode: 'query-engines', extent: 'parent', data: { label: 'Top-k Narrative Retrieval' } },
    { id: 'det-rag4', type: 'detailNode', position: { x: 410, y: 220 }, parentNode: 'query-engines', extent: 'parent', data: { label: 'LLM Answer + Citations' } },

    // --- Pattern & Case Intelligence ---
    {
      id: 'pattern-engines',
      type: 'groupNode',
      position: { x: 660, y: 30 },
      style: { width: 310, height: 240 },
      parentNode: 'engines-group',
      extent: 'parent',
      data: { label: 'Pattern & Case Intelligence', borderColor: 'border-amber-200', textColor: 'text-amber-600' },
    },
    {
      id: 'engine-pattern',
      type: 'customNode',
      position: { x: 15, y: 30 },
      parentNode: 'pattern-engines',
      extent: 'parent',
      data: {
        label: 'Pattern Detection',
        sublabel: 'MO-based Clustering',
        icon: ListTree,
        iconColor: 'text-amber-600',
        borderColor: 'border-amber-300',
        targetHandle: true,
        sourceHandle: true,
      },
    },
    { id: 'det-pat1', type: 'detailNode', position: { x: 15, y: 130 }, parentNode: 'pattern-engines', extent: 'parent', data: { label: 'Emerging MO Clusters (90d)' } },
    { id: 'det-pat2', type: 'detailNode', position: { x: 15, y: 160 }, parentNode: 'pattern-engines', extent: 'parent', data: { label: 'Case Similarity (pgvector + MO)' } },
    { id: 'det-pat3', type: 'detailNode', position: { x: 15, y: 190 }, parentNode: 'pattern-engines', extent: 'parent', data: { label: 'Geo-Temporal Composite Score' } },

    // --- Network & Relationship Intelligence ---
    {
      id: 'network-engines',
      type: 'groupNode',
      position: { x: 990, y: 30 },
      style: { width: 290, height: 240 },
      parentNode: 'engines-group',
      extent: 'parent',
      data: { label: 'Network Intelligence', borderColor: 'border-amber-200', textColor: 'text-amber-600' },
    },
    {
      id: 'engine-network',
      type: 'customNode',
      position: { x: 15, y: 30 },
      parentNode: 'network-engines',
      extent: 'parent',
      data: {
        label: 'Criminal Network',
        sublabel: 'Graph Traversal',
        icon: Network,
        iconColor: 'text-amber-600',
        borderColor: 'border-amber-300',
        targetHandle: true,
        sourceHandle: true,
      },
    },
    { id: 'det-net1', type: 'detailNode', position: { x: 15, y: 130 }, parentNode: 'network-engines', extent: 'parent', data: { label: 'Multi-hop Traversal (1–3)' } },
    { id: 'det-net2', type: 'detailNode', position: { x: 15, y: 160 }, parentNode: 'network-engines', extent: 'parent', data: { label: 'Louvain Community Detection' } },
    { id: 'det-net3', type: 'detailNode', position: { x: 15, y: 190 }, parentNode: 'network-engines', extent: 'parent', data: { label: 'ReactFlow Graph Output' } },

    // --- Analytics & Risk Intelligence ---
    {
      id: 'analytics-engines',
      type: 'groupNode',
      position: { x: 20, y: 340 },
      style: { width: 420, height: 160 },
      parentNode: 'engines-group',
      extent: 'parent',
      data: { label: 'Analytics & Risk', borderColor: 'border-amber-200', textColor: 'text-amber-600' },
    },
    {
      id: 'engine-analytics',
      type: 'customNode',
      position: { x: 15, y: 30 },
      parentNode: 'analytics-engines',
      extent: 'parent',
      data: {
        label: 'Crime Analytics',
        sublabel: 'KPIs, Hotspots, Trends',
        icon: BarChart3,
        iconColor: 'text-amber-600',
        borderColor: 'border-amber-300',
        targetHandle: true,
        sourceHandle: true,
      },
    },
    { id: 'det-ana1', type: 'detailNode', position: { x: 15, y: 110 }, parentNode: 'analytics-engines', extent: 'parent', data: { label: 'KPIs / Hotspots / Trends' } },
    { id: 'det-ana2', type: 'detailNode', position: { x: 15, y: 135 }, parentNode: 'analytics-engines', extent: 'parent', data: { label: 'Demographics / Reporting Lag' } },
    {
      id: 'engine-risk',
      type: 'customNode',
      position: { x: 210, y: 30 },
      parentNode: 'analytics-engines',
      extent: 'parent',
      data: {
        label: 'Risk Profiling',
        sublabel: 'Offender Risk Score',
        icon: AlertTriangle,
        iconColor: 'text-amber-600',
        borderColor: 'border-amber-300',
        targetHandle: true,
        sourceHandle: true,
      },
    },
    { id: 'det-risk1', type: 'detailNode', position: { x: 210, y: 110 }, parentNode: 'analytics-engines', extent: 'parent', data: { label: 'Prior / Heinous / Recency' } },
    { id: 'det-risk2', type: 'detailNode', position: { x: 210, y: 135 }, parentNode: 'analytics-engines', extent: 'parent', data: { label: 'Repeat Offender Detection' } },

    // --- Financial Intelligence ---
    {
      id: 'financial-engines',
      type: 'groupNode',
      position: { x: 460, y: 340 },
      style: { width: 420, height: 160 },
      parentNode: 'engines-group',
      extent: 'parent',
      data: { label: 'Financial Intelligence', borderColor: 'border-amber-200', textColor: 'text-amber-600' },
    },
    {
      id: 'engine-financial',
      type: 'customNode',
      position: { x: 15, y: 30 },
      parentNode: 'financial-engines',
      extent: 'parent',
      data: {
        label: 'Financial Analysis',
        sublabel: 'Money Trail Engine',
        icon: Banknote,
        iconColor: 'text-amber-600',
        borderColor: 'border-amber-300',
        targetHandle: true,
        sourceHandle: true,
      },
    },
    { id: 'det-fin1', type: 'detailNode', position: { x: 15, y: 110 }, parentNode: 'financial-engines', extent: 'parent', data: { label: 'Transaction Chain Detection' } },
    { id: 'det-fin2', type: 'detailNode', position: { x: 15, y: 135 }, parentNode: 'financial-engines', extent: 'parent', data: { label: 'Cross-Case Financial Links' } },
    {
      id: 'engine-finleads',
      type: 'customNode',
      position: { x: 210, y: 30 },
      parentNode: 'financial-engines',
      extent: 'parent',
      data: {
        label: 'Anomaly Detection',
        sublabel: 'Deterministic Signals',
        icon: Zap,
        iconColor: 'text-amber-600',
        borderColor: 'border-amber-300',
        targetHandle: true,
        sourceHandle: true,
      },
    },
    { id: 'det-fin3', type: 'detailNode', position: { x: 210, y: 110 }, parentNode: 'financial-engines', extent: 'parent', data: { label: 'High-Volume / High-Value' } },
    { id: 'det-fin4', type: 'detailNode', position: { x: 210, y: 135 }, parentNode: 'financial-engines', extent: 'parent', data: { label: 'Bidirectional / Rapid Movement' } },

    // --- Investigation Support ---
    {
      id: 'support-engines',
      type: 'groupNode',
      position: { x: 900, y: 340 },
      style: { width: 380, height: 160 },
      parentNode: 'engines-group',
      extent: 'parent',
      data: { label: 'Investigation Support', borderColor: 'border-amber-200', textColor: 'text-amber-600' },
    },
    {
      id: 'engine-evidence-graph',
      type: 'customNode',
      position: { x: 15, y: 30 },
      parentNode: 'support-engines',
      extent: 'parent',
      data: {
        label: 'Evidence Graph',
        sublabel: 'Provenance Tracking',
        icon: GitBranch,
        iconColor: 'text-amber-600',
        borderColor: 'border-amber-300',
        targetHandle: true,
        sourceHandle: true,
      },
    },
    { id: 'det-eg1', type: 'detailNode', position: { x: 15, y: 110 }, parentNode: 'support-engines', extent: 'parent', data: { label: 'Entity-Relationship Graphs' } },
    {
      id: 'engine-nba',
      type: 'customNode',
      position: { x: 195, y: 30 },
      parentNode: 'support-engines',
      extent: 'parent',
      data: {
        label: 'Next Best Action',
        sublabel: 'Lead Recommendation',
        icon: Target,
        iconColor: 'text-amber-600',
        borderColor: 'border-amber-300',
        targetHandle: true,
        sourceHandle: true,
      },
    },
    { id: 'det-nba1', type: 'detailNode', position: { x: 195, y: 110 }, parentNode: 'support-engines', extent: 'parent', data: { label: 'Deterministic Lead Ranking' } },

    // ════════════════════════════════════════════════
    // LAYER 7: EVIDENCE & EXPLAINABILITY
    // ════════════════════════════════════════════════
    {
      id: 'evidence-group',
      type: 'groupNode',
      position: { x: 25, y: 1830 },
      style: { width: 1300, height: 140 },
      data: {
        label: 'Evidence & Explainability',
        icon: Eye,
        borderColor: 'border-teal-400',
        textColor: 'text-teal-700',
        bgColor: 'bg-teal-50/30',
      },
    },
    { id: 'ev-fusion', type: 'detailNode', position: { x: 20, y: 35 }, parentNode: 'evidence-group', extent: 'parent', data: { label: 'Evidence Fusion' } },
    { id: 'ev-strength', type: 'detailNode', position: { x: 160, y: 35 }, parentNode: 'evidence-group', extent: 'parent', data: { label: 'Evidence Strength Scoring' } },
    { id: 'ev-graph', type: 'detailNode', position: { x: 300, y: 35 }, parentNode: 'evidence-group', extent: 'parent', data: { label: 'Evidence Graph' } },
    { id: 'ev-provenance', type: 'detailNode', position: { x: 440, y: 35 }, parentNode: 'evidence-group', extent: 'parent', data: { label: 'Source Provenance' } },
    { id: 'ev-leads', type: 'detailNode', position: { x: 580, y: 35 }, parentNode: 'evidence-group', extent: 'parent', data: { label: 'Investigation Leads' } },
    { id: 'ev-nba', type: 'detailNode', position: { x: 720, y: 35 }, parentNode: 'evidence-group', extent: 'parent', data: { label: 'Next Best Actions' } },
    { id: 'ev-citations', type: 'detailNode', position: { x: 860, y: 35 }, parentNode: 'evidence-group', extent: 'parent', data: { label: 'Crime No Citations' } },
    { id: 'ev-nl', type: 'detailNode', position: { x: 1000, y: 35 }, parentNode: 'evidence-group', extent: 'parent', data: { label: 'NL Explanation' } },

    // ════════════════════════════════════════════════
    // LAYER 8: DATA FOUNDATION + AI SERVICES (side by side)
    // ════════════════════════════════════════════════
    {
      id: 'data-group',
      type: 'groupNode',
      position: { x: 25, y: 2020 },
      style: { width: 720, height: 300 },
      data: {
        label: 'Data Foundation',
        icon: Database,
        borderColor: 'border-slate-400',
        textColor: 'text-slate-700',
        bgColor: 'bg-slate-50/50',
      },
    },
    {
      id: 'db-pg',
      type: 'customNode',
      position: { x: 20, y: 35 },
      parentNode: 'data-group',
      extent: 'parent',
      data: {
        label: 'PostgreSQL',
        sublabel: 'Neon Serverless',
        icon: Database,
        iconColor: 'text-slate-600',
        borderColor: 'border-slate-300',
        targetHandle: true,
      },
    },
    {
      id: 'db-pgvec',
      type: 'customNode',
      position: { x: 210, y: 35 },
      parentNode: 'data-group',
      extent: 'parent',
      data: {
        label: 'pgvector',
        sublabel: 'Embedding Store',
        icon: Cpu,
        iconColor: 'text-slate-600',
        borderColor: 'border-slate-300',
        targetHandle: true,
      },
    },
    // Data domains
    { id: 'dd-1', type: 'detailNode', position: { x: 20, y: 130 }, parentNode: 'data-group', extent: 'parent', data: { label: 'CaseMaster / CrimeHead / CrimeSubHead' } },
    { id: 'dd-2', type: 'detailNode', position: { x: 20, y: 160 }, parentNode: 'data-group', extent: 'parent', data: { label: 'Accused / Victim / Complainant' } },
    { id: 'dd-3', type: 'detailNode', position: { x: 20, y: 190 }, parentNode: 'data-group', extent: 'parent', data: { label: 'District / Unit / Employee / Rank' } },
    { id: 'dd-4', type: 'detailNode', position: { x: 20, y: 220 }, parentNode: 'data-group', extent: 'parent', data: { label: 'ModusOperandi / MOTagMaster' } },
    { id: 'dd-5', type: 'detailNode', position: { x: 380, y: 130 }, parentNode: 'data-group', extent: 'parent', data: { label: 'SuspectAccount / FinancialTransaction' } },
    { id: 'dd-6', type: 'detailNode', position: { x: 380, y: 160 }, parentNode: 'data-group', extent: 'parent', data: { label: 'OffenderRiskScore / ArrestSurrender' } },
    { id: 'dd-7', type: 'detailNode', position: { x: 380, y: 190 }, parentNode: 'data-group', extent: 'parent', data: { label: 'CaseNarrativeEmbedding (pgvector)' } },
    { id: 'dd-8', type: 'detailNode', position: { x: 380, y: 220 }, parentNode: 'data-group', extent: 'parent', data: { label: 'QueryAuditLog / EmployeeCredentials' } },
    { id: 'dd-9', type: 'detailNode', position: { x: 20, y: 255 }, parentNode: 'data-group', extent: 'parent', data: { label: 'Court / Act / Section / CaseStatusMaster' } },

    {
      id: 'ai-group',
      type: 'groupNode',
      position: { x: 775, y: 2020 },
      style: { width: 550, height: 300 },
      data: {
        label: 'AI Services',
        icon: Bot,
        borderColor: 'border-purple-300',
        textColor: 'text-purple-700',
        bgColor: 'bg-purple-50/30',
      },
    },
    {
      id: 'ai-groq',
      type: 'customNode',
      position: { x: 20, y: 35 },
      parentNode: 'ai-group',
      extent: 'parent',
      data: {
        label: 'Groq LLM',
        sublabel: 'gpt-oss-120b',
        icon: Bot,
        iconColor: 'text-purple-600',
        borderColor: 'border-purple-300',
        targetHandle: true,
      },
    },
    { id: 'ai-g1', type: 'detailNode', position: { x: 20, y: 130 }, parentNode: 'ai-group', extent: 'parent', data: { label: 'Intent Classification' } },
    { id: 'ai-g2', type: 'detailNode', position: { x: 20, y: 160 }, parentNode: 'ai-group', extent: 'parent', data: { label: 'NL2SQL Generation' } },
    { id: 'ai-g3', type: 'detailNode', position: { x: 20, y: 190 }, parentNode: 'ai-group', extent: 'parent', data: { label: 'Investigation Planning' } },
    { id: 'ai-g4', type: 'detailNode', position: { x: 20, y: 220 }, parentNode: 'ai-group', extent: 'parent', data: { label: 'Response Synthesis' } },

    {
      id: 'ai-gemini',
      type: 'customNode',
      position: { x: 190, y: 35 },
      parentNode: 'ai-group',
      extent: 'parent',
      data: {
        label: 'Google Gemini',
        sublabel: 'Embeddings',
        icon: Bot,
        iconColor: 'text-purple-600',
        borderColor: 'border-purple-300',
        targetHandle: true,
      },
    },
    { id: 'ai-ge1', type: 'detailNode', position: { x: 190, y: 130 }, parentNode: 'ai-group', extent: 'parent', data: { label: 'Query Embedding Gen' } },
    { id: 'ai-ge2', type: 'detailNode', position: { x: 190, y: 160 }, parentNode: 'ai-group', extent: 'parent', data: { label: 'Case Similarity Vectors' } },

    {
      id: 'ai-sarvam',
      type: 'customNode',
      position: { x: 360, y: 35 },
      parentNode: 'ai-group',
      extent: 'parent',
      data: {
        label: 'Sarvam AI',
        sublabel: 'STT + Translation',
        icon: Mic,
        iconColor: 'text-purple-600',
        borderColor: 'border-purple-300',
        targetHandle: true,
      },
    },
    { id: 'ai-sa1', type: 'detailNode', position: { x: 360, y: 130 }, parentNode: 'ai-group', extent: 'parent', data: { label: 'saaras:v3 Speech-to-Text' } },
    { id: 'ai-sa2', type: 'detailNode', position: { x: 360, y: 160 }, parentNode: 'ai-group', extent: 'parent', data: { label: 'sarvam-translate:v1' } },
    { id: 'ai-sa3', type: 'detailNode', position: { x: 360, y: 190 }, parentNode: 'ai-group', extent: 'parent', data: { label: 'Kannada ↔ English' } },

    // ════════════════════════════════════════════════
    // LAYER 9: CATALYST — IN PROGRESS
    // ════════════════════════════════════════════════
    {
      id: 'catalyst-group',
      type: 'groupNode',
      position: { x: 25, y: 2380 },
      style: { width: 1300, height: 190 },
      data: {
        label: 'Zoho Catalyst',
        icon: Cloud,
        borderColor: 'border-orange-300',
        textColor: 'text-orange-700',
        bgColor: 'bg-orange-50/30',
        statusBadge: 'IN PROGRESS',
      },
    },
    // Catalyst sub-groups
    {
      id: 'cat-stratus',
      type: 'customNode',
      position: { x: 20, y: 35 },
      parentNode: 'catalyst-group',
      extent: 'parent',
      data: {
        label: 'AppSail',
        sublabel: 'Backend + Frontend Deployment',
        icon: Cloud,
        iconColor: 'text-orange-600',
        borderColor: 'border-orange-200',
        targetHandle: true,
        statusBadge: 'NEXT IMPLEMENTATION',
      },
    },
    {
      id: 'cat-datastore',
      type: 'customNode',
      position: { x: 220, y: 35 },
      parentNode: 'catalyst-group',
      extent: 'parent',
      data: {
        label: 'Data Store',
        sublabel: 'Audit Logs + Persistence',
        icon: Database,
        iconColor: 'text-orange-600',
        borderColor: 'border-orange-200',
        targetHandle: true,
        statusBadge: 'PLANNED',
      },
    },
    {
      id: 'cat-cache',
      type: 'customNode',
      position: { x: 420, y: 35 },
      parentNode: 'catalyst-group',
      extent: 'parent',
      data: {
        label: 'Cache',
        sublabel: 'Session / Fast Lookups',
        icon: Zap,
        iconColor: 'text-orange-600',
        borderColor: 'border-orange-200',
        targetHandle: true,
        statusBadge: 'PLANNED',
      },
    },
    {
      id: 'cat-signals',
      type: 'customNode',
      position: { x: 620, y: 35 },
      parentNode: 'catalyst-group',
      extent: 'parent',
      data: {
        label: 'Signals',
        sublabel: 'Event-driven Triggers',
        icon: Activity,
        iconColor: 'text-orange-600',
        borderColor: 'border-orange-200',
        targetHandle: true,
        statusBadge: 'PLANNED',
      },
    },
    {
      id: 'cat-functions',
      type: 'customNode',
      position: { x: 820, y: 35 },
      parentNode: 'catalyst-group',
      extent: 'parent',
      data: {
        label: 'Functions',
        sublabel: 'Serverless Processing',
        icon: Cog,
        iconColor: 'text-orange-600',
        borderColor: 'border-orange-200',
        targetHandle: true,
        statusBadge: 'PLANNED',
      },
    },
    {
      id: 'cat-llm',
      type: 'customNode',
      position: { x: 1020, y: 35 },
      parentNode: 'catalyst-group',
      extent: 'parent',
      data: {
        label: 'Catalyst LLM',
        sublabel: 'LLM Service',
        icon: Bot,
        iconColor: 'text-orange-600',
        borderColor: 'border-orange-200',
        targetHandle: true,
        statusBadge: 'PLANNED',
      },
    },
    // Catalyst detail row
    { id: 'cat-d1', type: 'detailNode', position: { x: 30, y: 135 }, parentNode: 'catalyst-group', extent: 'parent', data: { label: 'python_3_11 runtime' } },
    { id: 'cat-d2', type: 'detailNode', position: { x: 230, y: 135 }, parentNode: 'catalyst-group', extent: 'parent', data: { label: 'Catalyst Data Store SDK' } },
    { id: 'cat-d3', type: 'detailNode', position: { x: 430, y: 135 }, parentNode: 'catalyst-group', extent: 'parent', data: { label: 'Session State Cache' } },
    { id: 'cat-d4', type: 'detailNode', position: { x: 630, y: 135 }, parentNode: 'catalyst-group', extent: 'parent', data: { label: 'Workflow Triggers' } },
    { id: 'cat-d5', type: 'detailNode', position: { x: 830, y: 135 }, parentNode: 'catalyst-group', extent: 'parent', data: { label: 'Event-driven Compute' } },
    { id: 'cat-d6', type: 'detailNode', position: { x: 1030, y: 135 }, parentNode: 'catalyst-group', extent: 'parent', data: { label: 'LLM Processing' } },
  ], []);

  // ════════════════════════════════════════════════════════════════
  // EDGES
  // ════════════════════════════════════════════════════════════════

  const edges: Edge[] = useMemo(() => {
    // Shared edge fragments (deliberately NOT annotated as Edge: they carry no
    // id/source/target of their own — they are spread INTO edge literals that
    // do, so annotating them as Edge would flag every spread as an overwrite).
    const mainFlow = {
      type: 'smoothstep' as const,
      animated: true,
      style: { stroke: '#64748b', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b', width: 14, height: 14 },
    };
    const internalEdge = { type: 'straight' as const, style: { stroke: '#cbd5e1', strokeWidth: 1.5 } };
    const dataEdge = {
      type: 'smoothstep' as const,
      animated: false,
      style: { stroke: '#94a3b8', strokeWidth: 1.5, strokeDasharray: '6,3' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8', width: 12, height: 12 },
    };

    return [
      // ── Users → Frontend ──
      { id: 'e-u-fe', source: 'investigator', target: 'frontend-group', ...mainFlow,
        label: 'Natural Language Query', labelStyle: { fill: '#475569', fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95 }, labelBgPadding: [6, 3] as [number, number], labelBgBorderRadius: 4 },
      { id: 'e-voice', source: 'investigator', target: 'voice-input', style: { stroke: '#f472b6', strokeWidth: 2, strokeDasharray: '5,3' } },
      { id: 'e-voice-fe', source: 'voice-input', target: 'fe-voice', type: 'smoothstep', style: { stroke: '#f472b6', strokeWidth: 2, strokeDasharray: '5,3' },
        label: 'Audio', labelStyle: { fill: '#f472b6', fontSize: 9 }, labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 } },

      // ── Frontend internal ──
      { id: 'e-fe-voice', source: 'fe-voice', sourceHandle: 'bottom', target: 'fe-api', targetHandle: 'top', ...internalEdge },
      { id: 'e-fe-api', source: 'fe-api', sourceHandle: 'bottom', target: 'auth-pipeline', targetHandle: 'top', ...mainFlow,
        label: 'REST API + JWT', labelStyle: { fill: '#475569', fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95 }, labelBgPadding: [6, 3] as [number, number], labelBgBorderRadius: 4 },

      // ── Security Pipeline ──
      { id: 'e-auth-rbac', source: 'auth', sourceHandle: 'right', target: 'rbac', targetHandle: 'left', ...mainFlow },
      { id: 'e-rbac-audit', source: 'rbac', sourceHandle: 'right', target: 'audit', targetHandle: 'left', ...mainFlow },
      { id: 'e-audit-rw', source: 'audit', sourceHandle: 'right', target: 'query-rewriter', targetHandle: 'left', ...mainFlow },

      // RBAC internals
      { id: 'e-rbac-1', source: 'rbac', target: 'rbac-1', ...internalEdge },
      { id: 'e-rbac-2', source: 'rbac', target: 'rbac-2', ...internalEdge },
      { id: 'e-rbac-3', source: 'rbac', target: 'rbac-3', ...internalEdge },
      { id: 'e-rbac-4', source: 'rbac', target: 'rbac-4', ...internalEdge },

      // ── Security → Orchestrator ──
      { id: 'e-rw-orch', source: 'query-rewriter', sourceHandle: 'bottom', target: 'orchestrator', ...mainFlow,
        label: 'Authenticated Request + RBAC Filter', labelStyle: { fill: '#475569', fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95 }, labelBgPadding: [6, 3] as [number, number], labelBgBorderRadius: 4 },

      // ── Orchestrator Internals ──
      { id: 'e-o1', source: 'orch-plan', sourceHandle: 'right', target: 'orch-scope', targetHandle: 'left', ...mainFlow },
      { id: 'e-o2', source: 'orch-scope', sourceHandle: 'right', target: 'orch-select', targetHandle: 'left', ...mainFlow },
      { id: 'e-o3', source: 'orch-select', sourceHandle: 'right', target: 'orch-parallel', targetHandle: 'left', ...mainFlow },
      { id: 'e-o4', source: 'orch-parallel', sourceHandle: 'right', target: 'orch-fusion', targetHandle: 'left', ...mainFlow },
      { id: 'e-o5', source: 'orch-fusion', sourceHandle: 'right', target: 'orch-response', targetHandle: 'left', ...mainFlow },
      { id: 'e-o6', source: 'orch-response', sourceHandle: 'right', target: 'orch-nba', targetHandle: 'left', ...mainFlow },
      // Orchestrator sublabels
      { id: 'e-ol1', source: 'orch-plan', target: 'orch-l1', ...internalEdge },
      { id: 'e-ol2', source: 'orch-scope', target: 'orch-l2', ...internalEdge },
      { id: 'e-ol3', source: 'orch-select', target: 'orch-l3', ...internalEdge },
      { id: 'e-ol4', source: 'orch-parallel', target: 'orch-l4', ...internalEdge },
      { id: 'e-ol5', source: 'orch-fusion', target: 'orch-l5', ...internalEdge },
      { id: 'e-ol6', source: 'orch-response', target: 'orch-l6', ...internalEdge },

      // ── Orchestrator → Intelligence Engines ──
      { id: 'e-o-nl2sql', source: 'orch-parallel', sourceHandle: 'bottom', target: 'engine-nl2sql', ...mainFlow },
      { id: 'e-o-ce', source: 'orch-parallel', sourceHandle: 'bottom', target: 'engine-ce', ...mainFlow },
      { id: 'e-o-rag', source: 'orch-parallel', sourceHandle: 'bottom', target: 'engine-rag', ...mainFlow },
      { id: 'e-o-pattern', source: 'orch-parallel', sourceHandle: 'bottom', target: 'engine-pattern', ...mainFlow },
      { id: 'e-o-network', source: 'orch-parallel', sourceHandle: 'bottom', target: 'engine-network', ...mainFlow },
      { id: 'e-o-analytics', source: 'orch-parallel', sourceHandle: 'bottom', target: 'engine-analytics', ...mainFlow },
      { id: 'e-o-risk', source: 'orch-parallel', sourceHandle: 'bottom', target: 'engine-risk', ...mainFlow },
      { id: 'e-o-financial', source: 'orch-parallel', sourceHandle: 'bottom', target: 'engine-financial', ...mainFlow },
      { id: 'e-o-finleads', source: 'orch-parallel', sourceHandle: 'bottom', target: 'engine-finleads', ...mainFlow },
      { id: 'e-o-eg', source: 'orch-parallel', sourceHandle: 'bottom', target: 'engine-evidence-graph', ...mainFlow },
      { id: 'e-o-nba', source: 'orch-nba', sourceHandle: 'bottom', target: 'engine-nba', ...mainFlow },

      // ── Engine → Evidence ──
      { id: 'e-nl-eg', source: 'engine-nl2sql', sourceHandle: 'bottom', target: 'evidence-group', ...dataEdge },
      { id: 'e-ce-eg', source: 'engine-ce', sourceHandle: 'bottom', target: 'evidence-group', ...dataEdge },
      { id: 'e-rag-eg', source: 'engine-rag', sourceHandle: 'bottom', target: 'evidence-group', ...dataEdge },
      { id: 'e-pat-eg', source: 'engine-pattern', sourceHandle: 'bottom', target: 'evidence-group', ...dataEdge },
      { id: 'e-net-eg', source: 'engine-network', sourceHandle: 'bottom', target: 'evidence-group', ...dataEdge },
      { id: 'e-ana-eg', source: 'engine-analytics', sourceHandle: 'bottom', target: 'evidence-group', ...dataEdge },
      { id: 'e-risk-eg', source: 'engine-risk', sourceHandle: 'bottom', target: 'evidence-group', ...dataEdge },
      { id: 'e-fin-eg', source: 'engine-financial', sourceHandle: 'bottom', target: 'evidence-group', ...dataEdge },
      { id: 'e-finl-eg', source: 'engine-finleads', sourceHandle: 'bottom', target: 'evidence-group', ...dataEdge },
      { id: 'e-evg-eg', source: 'engine-evidence-graph', sourceHandle: 'bottom', target: 'evidence-group', ...dataEdge },
      { id: 'e-nba-eg', source: 'engine-nba', sourceHandle: 'bottom', target: 'evidence-group', ...dataEdge },

      // ── Engines → Database ──
      { id: 'e-db-nl', source: 'det-nl4', sourceHandle: 'bottom', target: 'db-pg', ...dataEdge },
      { id: 'e-db-ce', source: 'det-ce3', sourceHandle: 'bottom', target: 'db-pg', ...dataEdge },
      { id: 'e-db-rag', source: 'det-rag2', sourceHandle: 'bottom', target: 'db-pgvec', ...dataEdge },
      { id: 'e-db-pat', source: 'det-pat2', sourceHandle: 'bottom', target: 'db-pg', ...dataEdge },
      { id: 'e-db-net', source: 'det-net1', sourceHandle: 'bottom', target: 'db-pg', ...dataEdge },
      { id: 'e-db-ana', source: 'det-ana1', sourceHandle: 'bottom', target: 'db-pg', ...dataEdge },
      { id: 'e-db-fin', source: 'det-fin2', sourceHandle: 'bottom', target: 'db-pg', ...dataEdge },

      // ── Engines → AI Services (dashed) ──
      { id: 'e-ai-groq', source: 'orch-plan', sourceHandle: 'bottom', target: 'ai-groq', targetHandle: 'left',
        style: { stroke: '#a78bfa', strokeWidth: 1.5, strokeDasharray: '5,3' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#a78bfa', width: 12, height: 12 }, type: 'smoothstep' },
      { id: 'e-ai-gemini', source: 'det-rag1', sourceHandle: 'bottom', target: 'ai-gemini', targetHandle: 'left',
        style: { stroke: '#a78bfa', strokeWidth: 1.5, strokeDasharray: '5,3' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#a78bfa', width: 12, height: 12 }, type: 'smoothstep' },
      { id: 'e-ai-sarvam', source: 'fe-voice', sourceHandle: 'left', target: 'ai-sarvam', targetHandle: 'top',
        style: { stroke: '#a78bfa', strokeWidth: 1.5, strokeDasharray: '5,3' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#a78bfa', width: 12, height: 12 }, type: 'smoothstep',
        label: 'Voice', labelStyle: { fill: '#a78bfa', fontSize: 9 }, labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 } },

      // ── AI internals ──
      { id: 'e-aig1', source: 'ai-groq', target: 'ai-g1', ...internalEdge },
      { id: 'e-aig2', source: 'ai-g1', target: 'ai-g2', ...internalEdge },
      { id: 'e-aig3', source: 'ai-g2', target: 'ai-g3', ...internalEdge },
      { id: 'e-aig4', source: 'ai-g3', target: 'ai-g4', ...internalEdge },
      { id: 'e-ige1', source: 'ai-gemini', target: 'ai-ge1', ...internalEdge },
      { id: 'e-ige2', source: 'ai-ge1', target: 'ai-ge2', ...internalEdge },
      { id: 'e-isa1', source: 'ai-sarvam', target: 'ai-sa1', ...internalEdge },
      { id: 'e-isa2', source: 'ai-sa1', target: 'ai-sa2', ...internalEdge },
      { id: 'e-isa3', source: 'ai-sa2', target: 'ai-sa3', ...internalEdge },

      // ── Evidence → Catalyst (planned, dashed orange) ──
      { id: 'e-catalyst-1', source: 'orch-nba', sourceHandle: 'bottom', target: 'catalyst-group', targetHandle: 'top',
        style: { stroke: '#fb923c', strokeWidth: 1.5, strokeDasharray: '8,4' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#fb923c', width: 12, height: 12 }, type: 'smoothstep',
        label: 'PLANNED', labelStyle: { fill: '#fb923c', fontSize: 9, fontWeight: 700 },
        labelBgStyle: { fill: '#fff7ed', fillOpacity: 0.95 }, labelBgPadding: [4, 2] as [number, number], labelBgBorderRadius: 3 },
    ];
  }, []);

  // ════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════

  const detail = selectedComponent ? COMPONENT_DETAILS[selectedComponent] : null;

  return (
    <div className="w-full flex flex-col h-full overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0 p-4 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-100 text-slate-700 rounded-lg border border-slate-200">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Enterprise System Architecture</h1>
            <p className="text-slate-500 text-sm">Interactive topology of the TriNetra Intelligence Orchestrator</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">IMPLEMENTED</span>
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">IN PROGRESS</span>
          {onClose && (
            <button onClick={onClose} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors text-sm ml-2">
              Close
            </button>
          )}
        </div>
      </div>

      {/* ReactFlow Canvas */}
      <div className="flex-1 w-full overflow-hidden relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.08 }}
          minZoom={0.08}
          maxZoom={2}
          className="bg-white"
          defaultEdgeOptions={{
            type: 'smoothstep',
            animated: true,
          }}
        >
          <Panel position="top-right" className="bg-white/90 p-3 rounded-xl border border-slate-200 shadow-lg backdrop-blur-sm mr-2 mt-2">
            <h3 className="text-slate-800 font-bold mb-2 text-xs border-b border-slate-100 pb-1">Color Legend</h3>
            <div className="space-y-1.5 text-[10px]">
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-sky-400"></div><span className="text-slate-600">Users & Frontend</span></div>
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-indigo-400"></div><span className="text-slate-600">API Layer</span></div>
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div><span className="text-slate-600">Security & Governance</span></div>
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-violet-500"></div><span className="text-slate-600">Orchestrator</span></div>
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div><span className="text-slate-600">Intelligence Engines</span></div>
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-teal-400"></div><span className="text-slate-600">Evidence & Explainability</span></div>
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-slate-400"></div><span className="text-slate-600">Data Foundation</span></div>
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-purple-400"></div><span className="text-slate-600">AI Services</span></div>
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-orange-400"></div><span className="text-slate-600">Catalyst (In Progress)</span></div>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 text-[9px] text-slate-400">
              Click any major component for details
            </div>
          </Panel>
          <Background color="#e2e8f0" gap={24} size={1} />
          <Controls className="!bg-white !border-slate-200 !shadow-md !rounded-lg" />
          <MiniMap
            nodeColor={(node: any) => {
              const id = node.id || '';
              if (node.type === 'groupNode') {
                if (id.includes('catalyst')) return '#fed7aa';
                if (id.includes('ai')) return '#e9d5ff';
                if (id.includes('evidence')) return '#ccfbf1';
                if (id.includes('data')) return '#f1f5f9';
                if (id.includes('orch')) return '#ede9fe';
                if (id.includes('auth') || id.includes('pipeline')) return '#d1fae5';
                if (id.includes('api')) return '#e0e7ff';
                if (id.includes('frontend')) return '#e0f2fe';
                return '#f8fafc';
              }
              if (node.type === 'detailNode') return '#f8fafc';
              return '#f1f5f9';
            }}
            maskColor="rgba(255, 255, 255, 0.7)"
            className="!bg-white !border-slate-200 !shadow-md"
          />
        </ReactFlow>
      </div>

      {/* Component Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setSelectedComponent(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-bold text-slate-900">{detail.name}</h2>
                <button onClick={() => setSelectedComponent(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-slate-600">{detail.purpose}</p>
              <div className="mt-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  detail.status === 'implemented' ? 'bg-emerald-100 text-emerald-700' :
                  detail.status === 'in-progress' ? 'bg-amber-100 text-amber-700' :
                  'bg-blue-100 text-blue-700'
                }`}>
                  {detail.status === 'implemented' ? '● IMPLEMENTED' :
                   detail.status === 'in-progress' ? '◐ IN PROGRESS' : '○ PLANNED'}
                </span>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Responsibilities</h3>
                <ul className="space-y-1">
                  {detail.responsibilities.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <ChevronRight className="w-3.5 h-3.5 mt-1 text-slate-400 shrink-0" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Inputs</h3>
                  <p className="text-sm text-slate-700">{detail.inputs}</p>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Outputs</h3>
                  <p className="text-sm text-slate-700">{detail.outputs}</p>
                </div>
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Technologies</h3>
                <p className="text-sm text-slate-700">{detail.technologies}</p>
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Backend Module</h3>
                <p className="text-xs text-slate-500 font-mono bg-slate-50 px-2 py-1 rounded">{detail.backendModule}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
