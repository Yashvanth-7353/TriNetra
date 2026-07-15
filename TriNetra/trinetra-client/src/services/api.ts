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