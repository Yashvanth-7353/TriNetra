/**
 * TriNetra API Service
 * 
 * All intelligence interactions go through POST /api/chat.
 * Auth goes through POST /api/login and GET /api/profile.
 */

const API_BASE = 'http://127.0.0.1:9000';

// ── Auth helpers ──

function getStoredToken(): string | null {
  return localStorage.getItem('trinetra_token');
}

function getStoredProfile(): any | null {
  const p = localStorage.getItem('trinetra_profile');
  return p ? JSON.parse(p) : null;
}

function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// ── Types ──

export interface ChatRequest {
  query: string;
  session_token?: string;
  role?: string;
  employee_id?: number;
  unit_id?: number;
  district_id?: number;
}

export interface ReasoningStep {
  step: number;
  action: string;
  detail: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  relation: string;
  case: string | number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface TrendDataPoint {
  month: string;
  count: number;
}

export interface RiskProfileData {
  score: number;
  repeat_offender: boolean;
  factors: string;
  computed_date: string;
}

export interface AnalyticsPayload {
  type: 'trend' | 'risk';
  data: TrendDataPoint[] | RiskProfileData;
}

export interface ChatResponse {
  status: string;
  intent_detected: string;
  answer: string;
  citations: string[];
  graph_data: GraphData | null;
  analytics_data: AnalyticsPayload | null;
  reasoning_trace: {
    execution_steps: ReasoningStep[];
  };
}

export interface LoginResponse {
  status: string;
  token: string;
  profile: {
    employee_id: number;
    name: string;
    kgid: string;
    dob: string | null;
    appointment_date: string | null;
    physically_challenged: boolean;
    gender_id: number | null;
    district_id: number;
    unit_id: number;
    rank_id: number | null;
    designation_id: number | null;
    district_name: string;
    unit_name: string;
    rank_name: string;
    designation_name: string;
    role: string;
  };
}

// ── Auth API ──

export async function loginApi(employeeId: number, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employee_id: employeeId, password }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Login failed' }));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function fetchProfile(): Promise<any> {
  const response = await fetch(`${API_BASE}/api/profile`, {
    method: 'GET',
    headers: authHeaders(),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Profile fetch failed' }));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

// ── Chat API ──

/**
 * Core function: send any query to /api/chat.
 * Automatically attaches user context from JWT profile.
 */
export async function sendChatQuery(
  query: string,
  overrides?: Partial<ChatRequest>
): Promise<ChatResponse> {
  const profile = getStoredProfile();

  const body: ChatRequest = {
    query,
    session_token: `session_${profile?.employee_id || 'anon'}`,
    role: profile?.role || 'Investigator',
    employee_id: profile?.employee_id || 101,
    unit_id: profile?.unit_id || 5,
    district_id: profile?.district_id || 2,
    ...overrides,
  };

  const response = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Unknown server error' }));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

// ── Convenience wrappers ──

export async function fetchDashboardStats() {
  return sendChatQuery('How many active cases are there?');
}

export async function fetchNetworkForAccused(accusedIdOrQuery: string) {
  const query = /^\d+$/.test(accusedIdOrQuery)
    ? `Show me the criminal network for Accused ${accusedIdOrQuery}`
    : accusedIdOrQuery;
  return sendChatQuery(query);
}

export async function fetchCrimeTrend() {
  return sendChatQuery('Show me the crime trend over time');
}

export async function fetchRiskProfile(accusedId: number) {
  return sendChatQuery(`What is the risk score for Accused ${accusedId}?`);
}

export async function fetchCases(district?: string, category?: string, status?: string) {
  let query = 'List all cases';
  const filters: string[] = [];
  if (district) filters.push(`in ${district}`);
  if (category) filters.push(`with category ${category}`);
  if (status) filters.push(`with status ${status}`);
  if (filters.length > 0) query += ' ' + filters.join(' ');
  return sendChatQuery(query);
}

// ── Case Explorer API (direct SQL, no NL2SQL) ──

export interface FilterOption {
  id: number;
  name: string;
}

export interface CaseFilterOptions {
  status: string;
  districts: FilterOption[];
  statuses: FilterOption[];
  categories: FilterOption[];
  crime_heads: FilterOption[];
}

export interface CaseSearchResult {
  casemasterid: number;
  crimeno: string;
  caseno: string;
  crimeregistereddate: string;
  districtname: string;
  police_station: string;
  casestatusname: string;
  casestatusid: number;
  category: string;
  crime_head: string;
  crime_sub_head: string;
  gravity: string;
}

export interface CaseSearchResponse {
  status: string;
  cases: CaseSearchResult[];
  pagination: {
    page: number;
    page_size: number;
    total_count: number;
    total_pages: number;
  };
}

export interface StatusHistoryEntry {
  id: number;
  status: string;
  date: string | null;
  remarks: string;
  changed_by: string;
}

export interface PersonEntry {
  id: number;
  name: string;
  age: number | null;
  gender_id: number | null;
  person_id?: string;
  is_police?: boolean;
  occupation?: string;
}

export interface ChargeSheetEntry {
  id: number;
  date: string | null;
  type: string;
  filed_by: string;
}

export interface ArrestEntry {
  id: number;
  date: string | null;
  type: string;
  accused_name: string;
  district: string;
  station: string;
}

export interface CaseDetailResponse {
  status: string;
  case: {
    casemasterid: number;
    crimeno: string;
    caseno: string;
    crimeregistereddate: string;
    incidentfromdate: string | null;
    incidenttodate: string | null;
    inforeceivedpsdate: string | null;
    latitude: string | null;
    longitude: string | null;
    brieffacts: string | null;
    districtname: string;
    police_station: string;
    casestatusname: string;
    casestatusid: number;
    category: string;
    crime_head: string;
    crime_sub_head: string;
    gravity: string;
    courtname: string | null;
  };
  status_history: StatusHistoryEntry[];
  accused: PersonEntry[];
  victims: PersonEntry[];
  complainants: PersonEntry[];
  chargesheets: ChargeSheetEntry[];
  arrests: ArrestEntry[];
}

export interface CaseSearchParams {
  district_id?: number;
  status_id?: number;
  category_id?: number;
  crime_head_id?: number;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export async function fetchCaseFilters(): Promise<CaseFilterOptions> {
  const response = await fetch(`${API_BASE}/api/cases/filters`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Failed to load filters' }));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function searchCasesAPI(params: CaseSearchParams): Promise<CaseSearchResponse> {
  const queryParts: string[] = [];
  if (params.district_id) queryParts.push(`district_id=${params.district_id}`);
  if (params.status_id) queryParts.push(`status_id=${params.status_id}`);
  if (params.category_id) queryParts.push(`category_id=${params.category_id}`);
  if (params.crime_head_id) queryParts.push(`crime_head_id=${params.crime_head_id}`);
  if (params.date_from) queryParts.push(`date_from=${params.date_from}`);
  if (params.date_to) queryParts.push(`date_to=${params.date_to}`);
  if (params.search) queryParts.push(`search=${encodeURIComponent(params.search)}`);
  if (params.page) queryParts.push(`page=${params.page}`);
  if (params.page_size) queryParts.push(`page_size=${params.page_size}`);

  const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const response = await fetch(`${API_BASE}/api/cases${qs}`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Search failed' }));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function fetchCaseDetailAPI(caseId: number): Promise<CaseDetailResponse> {
  const response = await fetch(`${API_BASE}/api/cases/${caseId}`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Case not found' }));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

// ── Network Analysis API (direct SQL, deep graph engine) ──

export interface NetworkSearchResult {
  accused_id: number;
  name: string;
  age: number | null;
  gender_id: number | null;
  district: string | null;
  crime_no: string;
  linked_cases: number;
}

export interface NetworkNode {
  id: string;
  label: string;
  type: string;
  community: number;
  distance: number;
  accused_id: number | null;
  age: number | null;
  gender_id: number | null;
  case_count: number;
  is_root: boolean;
}

export interface EdgeDetail {
  case_id: number;
  relation: string;
  detail: string;
}

export interface NetworkEdge {
  from: string;
  to: string;
  relation: string;
  relation_label: string;
  weight: number;
  case_id: number | null;
  details: EdgeDetail[];
}

export interface NetworkStats {
  node_count: number;
  edge_count: number;
  community_count: number;
  relation_breakdown: Record<string, number>;
}

export interface NetworkGraphResponse {
  status: string;
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  root_node: string;
  stats: NetworkStats;
}

export interface NodeNeighbor {
  id: string;
  accused_id: number | null;
  name: string;
  relation: string;
  relation_label: string;
  details: EdgeDetail[];
}

export interface NodeDetailResponse {
  status: string;
  accused_id: number;
  name: string;
  age: number | null;
  gender_id: number | null;
  person_id: string | null;
  cases: {
    accused_id: number;
    case_id: number;
    crime_no: string;
    date: string | null;
    district: string;
    status: string;
    crime_type: string;
  }[];
  accounts: { account: string; bank: string }[];
  modus_operandi: { tag: string; category: string; confidence: number | null }[];
  risk: { score: number; repeat_offender: boolean; factors: any } | null;
  neighbors: NodeNeighbor[];
  total_cases: number;
  total_neighbors: number;
}

export async function searchNetworkAPI(query: string): Promise<{ status: string; results: NetworkSearchResult[] }> {
  const response = await fetch(`${API_BASE}/api/network/search?q=${encodeURIComponent(query)}`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Search failed' }));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function fetchNetworkGraph(accusedId: number, hops: number = 2, layers?: string[]): Promise<NetworkGraphResponse> {
  const url = new URL(`${API_BASE}/api/network/${accusedId}`);
  url.searchParams.set('hops', hops.toString());
  if (layers && layers.length > 0) {
    url.searchParams.set('layers', layers.join(','));
  }
  const response = await fetch(url.toString(), {
    headers: authHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Network not found' }));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function fetchNodeDetail(accusedId: number, layers?: string[]): Promise<NodeDetailResponse> {
  const url = new URL(`${API_BASE}/api/network/node/${accusedId}`);
  if (layers && layers.length > 0) {
    url.searchParams.set('layers', layers.join(','));
  }
  const response = await fetch(url.toString(), {
    headers: authHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Node not found' }));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }
  return response.json();
}