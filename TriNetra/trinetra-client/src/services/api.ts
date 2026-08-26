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
  root_node?: string;
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
 * Authentication is via JWT header only — role/district derived server-side.
 */
export async function sendChatQuery(
  query: string,
  overrides?: Partial<ChatRequest>
): Promise<ChatResponse> {
  const profile = getStoredProfile();

  const body: ChatRequest = {
    query,
    session_token: `session_${profile?.employee_id || 'anon'}`,
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

export interface AnalyticsSearchParams {
  district_id?: number;
  time_window?: string;
  category_id?: number;
}

export interface AnalyticsSummaryResponse {
  status: string;
  total_cases: number;
  solved_percentage: number;
  highest_activity_district: string;
  biggest_mom_change: string;
  arrest_rate: number;
  avg_days_to_chargesheet: number;
}

export interface HotspotPoint {
  lat: number;
  lng: number;
  category: string;
  crime_no: string;
  brief_facts: string;
}

export interface AnalyticsHotspotsResponse {
  status: string;
  hotspots: HotspotPoint[];
}

export interface AnalyticsTrendsResponse {
  status: string;
  trend_data: TrendDataPoint[];
  category_breakdown: Record<string, Record<string, number>>;
}

export async function fetchAnalyticsSummary(params: AnalyticsSearchParams): Promise<AnalyticsSummaryResponse> {
  const queryParts: string[] = [];
  if (params.district_id) queryParts.push(`district_id=${params.district_id}`);
  if (params.time_window) queryParts.push(`time_window=${encodeURIComponent(params.time_window)}`);
  if (params.category_id) queryParts.push(`category_id=${params.category_id}`);
  const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

  const response = await fetch(`${API_BASE}/api/analytics/summary${qs}`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Failed to load summary' }));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function fetchAnalyticsHotspots(params: AnalyticsSearchParams): Promise<AnalyticsHotspotsResponse> {
  const queryParts: string[] = [];
  if (params.district_id) queryParts.push(`district_id=${params.district_id}`);
  if (params.time_window) queryParts.push(`time_window=${encodeURIComponent(params.time_window)}`);
  if (params.category_id) queryParts.push(`category_id=${params.category_id}`);
  const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

  const response = await fetch(`${API_BASE}/api/analytics/hotspots${qs}`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Failed to load hotspots' }));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function fetchAnalyticsTrends(params: AnalyticsSearchParams): Promise<AnalyticsTrendsResponse> {
  const queryParts: string[] = [];
  if (params.district_id) queryParts.push(`district_id=${params.district_id}`);
  if (params.time_window) queryParts.push(`time_window=${encodeURIComponent(params.time_window)}`);
  if (params.category_id) queryParts.push(`category_id=${params.category_id}`);
  const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

  const response = await fetch(`${API_BASE}/api/analytics/trends${qs}`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Failed to load trends' }));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

// --- New Full Suite Endpoints ---

export interface AnalyticsGeographicResponse {
  status: string;
  grid: { lat: number; lng: number; count: number; trend: string }[];
  rankings: {
    id: number;
    name: string;
    total: number;
    sparkline: { month: string; count: number }[];
  }[];
}

export async function fetchAnalyticsGeographic(params: AnalyticsSearchParams): Promise<AnalyticsGeographicResponse> {
  const queryParts: string[] = [];
  if (params.district_id) queryParts.push(`district_id=${params.district_id}`);
  if (params.time_window) queryParts.push(`time_window=${encodeURIComponent(params.time_window)}`);
  if (params.category_id) queryParts.push(`category_id=${params.category_id}`);
  const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const response = await fetch(`${API_BASE}/api/analytics/geographic${qs}`, { headers: authHeaders() });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export interface AnalyticsTrendsResponse {
  status: string;
  yoy: {
    year: number;
    category: string;
    count: number;
  }[];
  monthly_trend: {
    month: string;
    count: number;
  }[];
}

export async function fetchAnalyticsTrendsAdvanced(params: AnalyticsSearchParams): Promise<AnalyticsTrendsResponse> {
  const queryParts: string[] = [];
  if (params.district_id) queryParts.push(`district_id=${params.district_id}`);
  if (params.category_id) queryParts.push(`category_id=${params.category_id}`);
  const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const response = await fetch(`${API_BASE}/api/analytics/trends-advanced${qs}`, { headers: authHeaders() });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export interface AnalyticsCategoricalResponse {
  status: string;
  heads: { name: string; value: number }[];
  gravity: { name: string; value: number }[];
  mo_tags: { name: string; count: number }[];
}

export async function fetchAnalyticsCategorical(params: AnalyticsSearchParams): Promise<AnalyticsCategoricalResponse> {
  const queryParts: string[] = [];
  if (params.district_id) queryParts.push(`district_id=${params.district_id}`);
  if (params.time_window) queryParts.push(`time_window=${encodeURIComponent(params.time_window)}`);
  const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const response = await fetch(`${API_BASE}/api/analytics/categorical${qs}`, { headers: authHeaders() });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export interface AnalyticsLifecycleResponse {
  status: string;
  funnel: { name: string; value: number }[];
  chargesheets: { name: string; value: number }[];
}

export async function fetchAnalyticsLifecycle(params: AnalyticsSearchParams): Promise<AnalyticsLifecycleResponse> {
  const queryParts: string[] = [];
  if (params.district_id) queryParts.push(`district_id=${params.district_id}`);
  if (params.time_window) queryParts.push(`time_window=${encodeURIComponent(params.time_window)}`);
  const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const response = await fetch(`${API_BASE}/api/analytics/lifecycle${qs}`, { headers: authHeaders() });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export interface AnalyticsReportingLagResponse {
  status: string;
  lag: {
    bucket: string;
    count: number;
  }[];
}

export async function fetchAnalyticsReportingLag(params: AnalyticsSearchParams): Promise<AnalyticsReportingLagResponse> {
  const queryParts: string[] = [];
  if (params.district_id) queryParts.push(`district_id=${params.district_id}`);
  if (params.time_window) queryParts.push(`time_window=${encodeURIComponent(params.time_window)}`);
  if (params.category_id) queryParts.push(`category_id=${params.category_id}`);
  const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const response = await fetch(`${API_BASE}/api/analytics/reporting-lag${qs}`, { headers: authHeaders() });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export interface AnalyticsFinancialResponse {
  status: string;
  transactions: { month: string; amount: number; count: number }[];
  banks: { name: string; accounts: number }[];
}

export async function fetchAnalyticsFinancial(params: AnalyticsSearchParams): Promise<AnalyticsFinancialResponse> {
  const queryParts: string[] = [];
  if (params.district_id) queryParts.push(`district_id=${params.district_id}`);
  if (params.time_window) queryParts.push(`time_window=${encodeURIComponent(params.time_window)}`);
  const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const response = await fetch(`${API_BASE}/api/analytics/financial${qs}`, { headers: authHeaders() });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export interface AnalyticsDemographicsResponse {
  status: string;
  victims: { age_band: string; gender: string; count: number }[];
}

export async function fetchAnalyticsDemographics(params: AnalyticsSearchParams): Promise<AnalyticsDemographicsResponse> {
  const queryParts: string[] = [];
  if (params.district_id) queryParts.push(`district_id=${params.district_id}`);
  if (params.time_window) queryParts.push(`time_window=${encodeURIComponent(params.time_window)}`);
  const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const response = await fetch(`${API_BASE}/api/analytics/demographics${qs}`, { headers: authHeaders() });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export interface OffenderProfile {
  accused_id: number;
  name: string;
  score: number;
  repeat_offender: boolean;
  factors: {
    prior_case_count?: number;
    heinous_case_count?: number;
    contribution_heinous?: number;
    contribution_recency?: number;
    contribution_prior_cases?: number;
    most_recent_case_days_ago?: number;
  };
  computed_date: string;
}

export interface OffendersResponse {
  status: string;
  offenders: OffenderProfile[];
  total: number;
}

export async function fetchOffendersList(
  search?: string, 
  page: number = 1, 
  pageSize: number = 20,
  sortKey: string = 'score',
  sortOrder: string = 'desc'
): Promise<OffendersResponse> {
  const queryParts: string[] = [];
  if (search) queryParts.push(`search=${encodeURIComponent(search)}`);
  queryParts.push(`page=${page}`);
  queryParts.push(`page_size=${pageSize}`);
  queryParts.push(`sort_key=${sortKey}`);
  queryParts.push(`sort_order=${sortOrder}`);
  const qs = `?${queryParts.join('&')}`;

  const response = await fetch(`${API_BASE}/api/analytics/offenders${qs}`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Failed to load offender list' }));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export interface PreventionAlert {
  id: number;
  district: string;
  category: string;
  reason: string;
  severity: 'high' | 'medium';
  data: { v: number }[];
}

export interface PreventionAlertsResponse {
  status: string;
  alerts: PreventionAlert[];
}

export async function fetchPreventionAlerts(districtId?: number): Promise<PreventionAlertsResponse> {
  const qs = districtId ? `?district_id=${districtId}` : '';
  const response = await fetch(`${API_BASE}/api/analytics/alerts${qs}`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Failed to load prevention alerts' }));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function exportChat(messages: any[]): Promise<Blob> {
  const response = await fetch(`${API_BASE}/api/chat/export`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Failed to export chat session' }));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }
  return response.blob();
}

// ──────────────────────────────────────────────
//  Pattern Analytics Interfaces
// ──────────────────────────────────────────────

export interface PatternCase {
  case_id: number;
  crime_no: string;
  brief_facts: string;
  date: string;
  lat: number | null;
  lng: number | null;
  district: number;
}

export interface Pattern {
  cluster_id: string;
  theme: string;
  case_count: number;
  date_range: string;
  districts: number[];
  trigger_reason: string;
  sparkline: { time: string; count: number }[];
  cases: PatternCase[];
  mo_tags: { name: string; strength: string }[];
}

export interface PatternFeedResponse {
  status: string;
  patterns?: Pattern[];
}

export interface SimilarCase {
  case_id: number;
  crime_no: string;
  brief_facts: string;
  match_score: number;
  explanations: string[];
}

export interface SimilarCasesResponse {
  status: string;
  similar_cases?: SimilarCase[];
}

export async function fetchEmergingPatterns(): Promise<PatternFeedResponse> {
  const response = await fetch(`${API_BASE}/api/patterns`, {
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error('Failed to load patterns');
  return response.json();
}

export async function fetchSimilarCases(caseId: number, k: number = 10): Promise<SimilarCasesResponse> {
  const response = await fetch(`${API_BASE}/api/patterns/similar/${caseId}?k=${k}`, {
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error('Failed to load similar cases');
  return response.json();
}

// ── Investigation Planner API ──

export interface InvestigationFinding {
  category: string;
  description: string;
  evidence_sources: string[];
  data: any;
  strength: 'strong' | 'moderate' | 'limited' | 'none';
}

export interface InvestigationPlan {
  investigation_type: string;
  objectives: string[];
  engines: string[];
  filters: Record<string, any>;
  entities: { case_ids: number[]; accused_ids: number[] };
  summary: string;
}

export interface InvestigationResponse {
  status: string;
  intent_detected: string;
  answer: string;
  citations: string[];
  graph_data: GraphData | null;
  analytics_data: AnalyticsPayload | null;
  investigation: {
    plan: InvestigationPlan;
    findings: InvestigationFinding[];
    summary_stats: {
      total_findings: number;
      engines_executed: number;
      engines_succeeded: number;
      engines_failed: number;
      overall_strength: string;
    };
    evidence_graph: any[];
  };
  reasoning_trace: {
    execution_steps: ReasoningStep[];
  };
}

/**
 * Sends an investigation request to the multi-engine investigation planner.
 * The planner generates a structured plan, executes multiple engines,
 * fuses evidence, and returns an explainable investigation result.
 */
export async function sendInvestigationQuery(
  query: string,
  sessionToken?: string
): Promise<InvestigationResponse> {
  const profile = getStoredProfile();

  const body = {
    query,
    session_token: sessionToken || `session_${profile?.employee_id || 'anon'}`,
  };

  const response = await fetch(`${API_BASE}/api/investigate`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Investigation failed' }));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Detects whether a query is an investigation request (multi-engine)
 * versus a simple query (single engine).
 * This detection is done client-side for UX routing; the backend
 * always validates and executes accordingly.
 */
export function isInvestigationRequest(query: string): boolean {
  const lower = query.toLowerCase();
  const investigationPatterns = [
    /\binvestigat/i,
    /\banaly[sz]e.*case/i,
    /\bfind.*pattern/i,
    /\bfind.*repeat.*offend/i,
    /\bfind.*connect/i,
    /\bfind.*related/i,
    /\bare.*these.*connect/i,
    /\bhow.*these.*case/i,
    /\bcriminal.*network/i,
    /\bconnected.*offend/i,
    /\bconnected.*accus/i,
    /\bmap.*network/i,
    /\bmap.*syndicat/i,
    /\bcrime.*ring/i,
    /\bcriminal.*ring/i,
    /\bwho.*connected/i,
    /\btrace.*money/i,
    /\bfinancial.*trail/i,
    /\bmoney.*trail/i,
    /\b关联/i,
  ];
  return investigationPatterns.some(p => p.test(lower));
}

// ── Evidence Graph API ──

export interface EvidenceNode {
  id: string;
  type: 'case' | 'person' | 'mo_tag' | 'pattern' | 'risk_score' | 'account' | 'location';
  label: string;
  source: { table: string; record_id: any };
  is_primary: boolean;
  metadata?: Record<string, any>;
}

export interface EvidenceSignal {
  signal: string;
  label: string;
  description: string;
  value: string;
  source_records: { table: string; record_id: any; field?: string }[];
}

export interface EvidenceEdge {
  id: string;
  source: string;
  target: string;
  relationship: string;
  relationship_label: string;
  strength: 'strong' | 'moderate' | 'limited';
  source_engine: string;
  evidence: EvidenceSignal[];
}

export interface EvidenceGraphResponse {
  status: string;
  nodes: EvidenceNode[];
  edges: EvidenceEdge[];
  finding_summary: string;
  evidence_strength: string;
  sources: string[];
}

export async function sendEvidenceGraph(finding: any): Promise<EvidenceGraphResponse> {
  const response = await fetch(`${API_BASE}/api/evidence/graph`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ finding }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Evidence graph failed' }));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

// ── Crime Forecasting API ──

export interface ForecastSignal {
  signal: string;
  label?: string;
  description: string;
  value?: number | string | Record<string, string>;
}

export interface ForecastPoint {
  month: string;
  forecast?: number;
  lower?: number;
  upper?: number;
  count?: number;
  type: 'observed' | 'forecast' | 'baseline';
}

export interface ForecastEvaluation {
  model_mae?: number;
  model_rmse?: number;
  model_mape?: number;
  baseline_mae?: number;
  baseline_rmse?: number;
  baseline_mape?: number;
  improvement_mae?: number;
  train_months?: number;
  test_months?: number;
}

export interface ForecastResponse {
  status: string;
  category?: string;
  category_id?: number;
  district_id?: number;
  horizon_months?: number;
  model?: string;
  model_params?: Record<string, number>;
  historical?: ForecastPoint[];
  forecast?: ForecastPoint[];
  baseline?: ForecastPoint[];
  evaluation?: ForecastEvaluation;
  signals?: ForecastSignal[];
  data_sufficiency?: {
    total_months: number;
    sufficient: boolean;
    min_required: number;
    note: string;
  };
  limitations?: string[];
  reason?: string;
}

export interface ForecastSummaryCategory {
  category_id: number;
  category: string;
  current_monthly_avg: number;
  forecast_avg: number;
  direction: 'increasing' | 'decreasing' | 'stable';
  model_mape: number | null;
}

export interface ForecastSummaryResponse {
  status: string;
  categories: ForecastSummaryCategory[];
  horizon_months: number;
}

export interface PredictiveHotspot {
  district_id: number;
  district_name: string;
  hotspot_type: 'predicted' | 'emerging' | 'historical' | 'stable';
  score: number;
  total_cases: number;
  avg_monthly: number;
  recent_3mo_avg: number;
  baseline_avg: number;
  forecast_avg: number;
  emerging_ratio: number;
  predicted_ratio: number;
  avg_lat: number | null;
  avg_lng: number | null;
  sparkline: { month: string; count: number }[];
  signals: { signal: string; description: string }[];
}

export interface PredictiveHotspotsResponse {
  status: string;
  hotspots: PredictiveHotspot[];
  summary: {
    total_areas: number;
    by_type: Record<string, number>;
    horizon_months: number;
  };
  methodology: Record<string, string>;
}

export async function fetchForecast(
  params: {
    category_id?: number;
    district_id?: number;
    horizon?: number;
  } = {}
): Promise<ForecastResponse> {
  const queryParts: string[] = [];
  if (params.category_id) queryParts.push(`category_id=${params.category_id}`);
  if (params.district_id) queryParts.push(`district_id=${params.district_id}`);
  if (params.horizon) queryParts.push(`horizon=${params.horizon}`);
  const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

  const response = await fetch(`${API_BASE}/api/forecast${qs}`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Forecast failed' }));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function fetchForecastSummary(
  params: { district_id?: number; horizon?: number } = {}
): Promise<ForecastSummaryResponse> {
  const queryParts: string[] = [];
  if (params.district_id) queryParts.push(`district_id=${params.district_id}`);
  if (params.horizon) queryParts.push(`horizon=${params.horizon}`);
  const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

  const response = await fetch(`${API_BASE}/api/forecast/summary${qs}`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Forecast summary failed' }));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function fetchPredictiveHotspots(
  params: {
    district_id?: number;
    category_id?: number;
    horizon?: number;
  } = {}
): Promise<PredictiveHotspotsResponse> {
  const queryParts: string[] = [];
  if (params.district_id) queryParts.push(`district_id=${params.district_id}`);
  if (params.category_id) queryParts.push(`category_id=${params.category_id}`);
  if (params.horizon) queryParts.push(`horizon=${params.horizon}`);
  const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

  const response = await fetch(`${API_BASE}/api/forecast/hotspots${qs}`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Predictive hotspots failed' }));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

// ── Next Best Investigative Action API ──

export interface NextActionEvidence {
  signal: string;
  description: string;
  metadata?: Record<string, any>;
}

export interface NextActionTarget {
  entity_type: 'case' | 'person' | 'pattern';
  entity_id: number | string;
  entity_label: string;
}

export interface NextBestActionLead {
  lead_id: string;
  type: 'related_case' | 'repeat_offender' | 'network_connection' | 'pattern_cluster' | 'high_risk_offender';
  priority_score: number;
  rank_score: number;
  priority: 'high' | 'medium' | 'low';
  target: NextActionTarget;
  reason: string;
  evidence: NextActionEvidence[];
  source_engines: string[];
  strength: 'strong' | 'moderate' | 'limited' | 'none';
  evidence_count: number;
  action_type: 'view_case' | 'view_network' | 'view_profile' | 'view_patterns';
  action_label: string;
  metadata?: Record<string, any>;
}

export interface NextBestActionsResponse {
  status: string;
  leads: NextBestActionLead[];
  total_candidates: number;
  total_leads: number;
  lead_types: Record<string, number>;
  engines_used: string[];
  methodology: string;
  limitations: string[];
}

/**
 * Generates evidence-grounded investigative leads from an investigation result.
 * Every lead is traceable to real database records or engine outputs.
 */
export async function fetchNextBestActions(
  investigationResult: any
): Promise<NextBestActionsResponse> {
  const response = await fetch(`${API_BASE}/api/investigation/next-actions`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ investigation_result: investigationResult }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Failed to generate next actions' }));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function transcribeAudio(audioBlob: Blob, languageCode: string = 'kn-IN'): Promise<{ transcript: string }> {
  const formData = new FormData();
  formData.append('file', audioBlob, 'speech.wav');
  formData.append('language_code', languageCode);

  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}/api/sarvam/stt`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'STT failed' }));
    const errorMsg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail || 'STT transcription failed');
    throw new Error(errorMsg);
  }

  return response.json();
}

export async function translateText(text: string, sourceLang: string = 'kn-IN', targetLang: string = 'en-IN'): Promise<{ translated_text: string }> {
  const response = await fetch(`${API_BASE}/api/sarvam/translate`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      source_language: sourceLang,
      target_language: targetLang,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Translation failed' }));
    const errorMsg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail || 'Translation failed');
    throw new Error(errorMsg);
  }

  return response.json();
}