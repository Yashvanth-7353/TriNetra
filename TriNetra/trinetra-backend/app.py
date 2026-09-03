import os
import time
import json
import re
from fastapi import FastAPI, HTTPException, Header, Query, UploadFile, File, Form, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

from engines.router import IntentRouter
from engines.nl2sql import NL2SQLEngine
from engines.rag import RAGEngine
from engines.security import SecurityContext
security_context = SecurityContext()
from engines.graph import GraphEngine
graph_engine = GraphEngine()
from engines.analytics import AnalyticsEngine
analytics_engine = AnalyticsEngine()
from engines.case_explorer import CaseExplorerEngine
from engines.pattern_engine import PatternEngine
pattern_engine = PatternEngine()
case_explorer_engine = CaseExplorerEngine()
from engines.network_engine import NetworkEngine
network_engine = NetworkEngine()
from engines.sarvam_engine import sarvam_engine
from engines.investigation import InvestigationEngine
from engines.factual_lookup import FactualCaseLookup
from engines.exact_case import ExactCaseResolver
from engines.evidence_graph import EvidenceGraphBuilder
from engines.forecasting import CrimeForecastingEngine
from engines.predictive_hotspots import PredictiveHotspotEngine
from engines.next_best_action import NextBestActionEngine
from engines.financial_intelligence import FinancialIntelligenceEngine, FinancialLeadGenerator
from engines.auth import authenticate_employee, create_jwt_token, verify_jwt_token, get_employee_profile

investigation_engine = InvestigationEngine()
evidence_graph_builder = EvidenceGraphBuilder()
forecasting_engine = CrimeForecastingEngine()
predictive_hotspot_engine = PredictiveHotspotEngine()
next_best_action_engine = NextBestActionEngine()
financial_intelligence_engine = FinancialIntelligenceEngine()
financial_lead_generator = FinancialLeadGenerator()

app = FastAPI(title="TriNetra Intelligence Orchestrator Core Node")
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY")) if os.getenv("GROQ_API_KEY") else None

router_engine = IntentRouter()
nl2sql_engine = NL2SQLEngine()
rag_engine = RAGEngine()

# Hardened Browser CORS Boundary Profile Configurations
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class LoginRequest(BaseModel):
    employee_id: int
    password: str

class ChatRequest(BaseModel):
    query: str
    session_token: str = "local_node_dev_session"


def _extract_auth_context(authorization: Optional[str]) -> dict:
    """Extracts authenticated user context from JWT. Raises 401 if invalid."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing.")
    try:
        payload = verify_jwt_token(authorization)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    profile = get_employee_profile(payload["employee_id"])
    if "error" in profile:
        raise HTTPException(status_code=401, detail="Employee profile not found.")
    return {
        "employee_id": profile["employee_id"],
        "role": profile["role"],
        "unit_id": profile.get("unit_id"),
        "district_id": profile.get("district_id"),
        "name": profile.get("name", "Unknown"),
        "district_name": profile.get("district_name", ""),
        "unit_name": profile.get("unit_name", ""),
    }


@app.post("/api/login")
async def login(request: LoginRequest):
    """Authenticates employee and returns JWT token + profile."""
    profile = authenticate_employee(request.employee_id, request.password)
    token = create_jwt_token(profile)
    return {
        "status": "success",
        "token": token,
        "profile": profile
    }


@app.get("/api/profile")
async def get_profile(authorization: Optional[str] = Header(None)):
    """Returns the full profile of the currently authenticated employee."""
    payload = verify_jwt_token(authorization)
    profile = get_employee_profile(payload["employee_id"])
    if "error" in profile:
        raise HTTPException(status_code=404, detail=profile["error"])
    return {"status": "success", "profile": profile}


# ──────────────────────────────────────────────
#  Case Explorer REST Endpoints
# ──────────────────────────────────────────────

@app.get("/api/cases/filters")
async def get_case_filters():
    """Returns dropdown options for district, status, category, and crime head filters."""
    result = case_explorer_engine.get_filter_options()
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return {"status": "success", **result}


@app.get("/api/cases")
async def search_cases(
    district_id: Optional[int] = Query(None),
    status_id: Optional[int] = Query(None),
    category_id: Optional[int] = Query(None),
    crime_head_id: Optional[int] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """Paginated, filterable case search."""
    result = case_explorer_engine.search_cases(
        district_id=district_id,
        status_id=status_id,
        category_id=category_id,
        crime_head_id=crime_head_id,
        date_from=date_from,
        date_to=date_to,
        search_term=search,
        page=page,
        page_size=page_size,
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return {"status": "success", **result}


@app.get("/api/cases/{case_id}")
async def get_case_detail(case_id: int):
    """Returns full case detail including timeline, people, and chargesheet."""
    result = case_explorer_engine.get_case_detail(case_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return {"status": "success", **result}

# ──────────────────────────────────────────────
#  Crime Analytics REST Endpoints
# ──────────────────────────────────────────────

@app.get("/api/analytics/summary")
async def get_analytics_summary(
    district_id: Optional[int] = Query(None),
    time_window: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None)
):
    """Returns analytics dashboard KPI summary stats."""
    result = analytics_engine.get_analytics_summary(
        district_id=district_id,
        time_window=time_window,
        category_id=category_id
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return {"status": "success", **result}


@app.get("/api/analytics/hotspots")
async def get_analytics_hotspots(
    district_id: Optional[int] = Query(None),
    time_window: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None)
):
    """Returns coordinate list for Leaflet map hotspot visualization."""
    result = analytics_engine.get_analytics_hotspots(
        district_id=district_id,
        time_window=time_window,
        category_id=category_id
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return {"status": "success", **result}


@app.get("/api/analytics/trends")
async def get_analytics_trends(
    district_id: Optional[int] = Query(None),
    time_window: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None)
):
    """Returns historical crime count trend and category breakdowns."""
    result = analytics_engine.get_analytics_trends(
        district_id=district_id,
        time_window=time_window,
        category_id=category_id
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return {"status": "success", **result}


@app.get("/api/analytics/offenders")
async def get_analytics_offenders(
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_key: Optional[str] = Query("score"),
    sort_order: Optional[str] = Query("desc"),
    authorization: Optional[str] = Header(None)
):
    """Returns paginated, searchable list of offender profiles and risk scores."""
    try:
        payload = verify_jwt_token(authorization)
        profile = get_employee_profile(payload["employee_id"])
        unit_id = profile.get("station_id")
        district_id = profile.get("district_id")
    except Exception:
        unit_id = None
        district_id = None

    offset = (page - 1) * page_size
    result = analytics_engine.get_offenders(
        search=search, limit=page_size, offset=offset,
        unit_id=unit_id, district_id=district_id,
        sort_key=sort_key, sort_order=sort_order
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return {"status": "success", **result}

# ──────────────────────────────────────────────
#  Pattern Analytics Endpoints
# ──────────────────────────────────────────────

@app.get("/api/patterns")
async def get_emerging_patterns(
    authorization: Optional[str] = Header(None)
):
    """Returns the dynamic feed of emerging case clusters and patterns."""
    result = pattern_engine.get_emerging_patterns()
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return {"status": "success", **result}


@app.get("/api/patterns/similar/{case_id}")
async def get_similar_cases(
    case_id: int,
    k: int = Query(10, ge=1, le=50),
    authorization: Optional[str] = Header(None)
):
    """Returns ranked list of similar cases using pgvector, MO overlap, and geo-proximity."""
    result = pattern_engine.find_similar_cases(case_id=case_id, k=k)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return {"status": "success", **result}

@app.get("/api/analytics/alerts")
async def get_analytics_alerts(
    district_id: Optional[int] = Query(None),
    authorization: Optional[str] = Header(None)
):
    """Returns prevention alerts computed for the logged in employee jurisdiction only."""
    if authorization:
        try:
            auth_ctx = _extract_auth_context(authorization)
            district_id = auth_ctx["district_id"]
        except Exception:
            pass
            
    if not district_id:
        district_id = 2
        
    result = analytics_engine.get_prevention_alerts(district_id=district_id)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return {"status": "success", **result}


@app.get("/api/analytics/geographic")
async def get_analytics_geographic(
    district_id: Optional[int] = Query(None),
    time_window: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None)
):
    """Returns grid hotspots and district rankings."""
    result = analytics_engine.get_analytics_geographic(
        district_id=district_id, time_window=time_window, category_id=category_id
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return {"status": "success", **result}


@app.get("/api/analytics/trends-advanced")
async def get_analytics_trends_advanced(
    district_id: Optional[int] = Query(None),
    category_id: Optional[int] = Query(None)
):
    """Returns YoY category comparisons and anomaly callout trends."""
    result = analytics_engine.get_analytics_trends_advanced(
        district_id=district_id, category_id=category_id
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return {"status": "success", **result}


@app.get("/api/analytics/categorical")
async def get_analytics_categorical(
    district_id: Optional[int] = Query(None),
    time_window: Optional[str] = Query(None)
):
    """Returns crime head distributions, gravity splits, and top MO tags."""
    result = analytics_engine.get_analytics_categorical(
        district_id=district_id, time_window=time_window
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return {"status": "success", **result}


@app.get("/api/analytics/lifecycle")
async def get_analytics_lifecycle(
    district_id: Optional[int] = Query(None),
    time_window: Optional[str] = Query(None)
):
    """Returns status funnel and chargesheet outcomes."""
    result = analytics_engine.get_analytics_lifecycle(
        district_id=district_id, time_window=time_window
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return {"status": "success", **result}


@app.get("/api/analytics/reporting-lag")
async def get_analytics_reporting_lag(
    district_id: Optional[int] = Query(None),
    time_window: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None)
):
    """Returns FIR reporting lag distribution."""
    result = analytics_engine.get_analytics_reporting_lag(
        district_id=district_id, time_window=time_window, category_id=category_id
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return {"status": "success", **result}


@app.get("/api/analytics/demographics")
async def get_analytics_demographics(
    district_id: Optional[int] = Query(None),
    time_window: Optional[str] = Query(None)
):
    """Returns victim/complainant socio-demographics enforcing n>=10 privacy threshold."""
    result = analytics_engine.get_analytics_demographics(
        district_id=district_id, time_window=time_window
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return {"status": "success", **result}



# ──────────────────────────────────────────────
#  Network Analysis REST Endpoints
# ──────────────────────────────────────────────

@app.get("/api/network/search")
async def network_search(q: str = Query(..., min_length=1), limit: int = Query(15, ge=1, le=50)):
    """Search accused by name or ID for the network search box."""
    results = network_engine.search_accused(q, limit=limit)
    return {"status": "success", "results": results}


@app.get("/api/network/node/{accused_id}")
async def get_network_node_detail(accused_id: int, layers: Optional[str] = Query(None)):
    """Returns detailed info about a specific node for the side panel."""
    active_layers = layers.split(",") if layers else None
    result = network_engine.get_node_detail(accused_id, active_layers=active_layers)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return {"status": "success", **result}


@app.get("/api/network/{accused_id}")
async def get_network(accused_id: int, hops: int = Query(2, ge=1, le=3), layers: Optional[str] = Query(None)):
    """Returns the N-hop criminal network graph with community detection."""
    active_layers = layers.split(",") if layers else None
    result = network_engine.get_network(accused_id, max_hops=hops, active_layers=active_layers)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return {"status": "success", **result}



# State Isolation Context Memory Manager
session_store = {}
SESSION_TTL_SECONDS = 1800 

def access_context_memory(session_id: str) -> list:
    """Safely extracts session data arrays and evicts expired records automatically."""
    current_time = time.time()
    session_profile = session_store.get(session_id)
    
    if session_profile and (current_time - session_profile["last_active"] < SESSION_TTL_SECONDS):
        session_profile["last_active"] = current_time
        return session_profile["turns"]
    
    session_store[session_id] = {"turns": [], "last_active": current_time, "investigation": None}
    return session_store[session_id]["turns"]

def get_investigation_context(session_id: str) -> dict:
    """Returns the last investigation result for multi-turn context."""
    current_time = time.time()
    session_profile = session_store.get(session_id)
    if session_profile and (current_time - session_profile["last_active"] < SESSION_TTL_SECONDS):
        return session_profile.get("investigation")
    return None

def set_investigation_context(session_id: str, investigation_result: dict):
    """Stores the investigation result for multi-turn follow-up queries."""
    current_time = time.time()
    if session_id not in session_store:
        session_store[session_id] = {"turns": [], "last_active": current_time, "investigation": None}
    session_store[session_id]["investigation"] = {
        "plan": investigation_result.get("investigation", {}).get("plan", {}),
        "resolved_scope": investigation_result.get("investigation", {}).get("plan", {}).get("resolved_scope"),
        "discovered_cases": [],
        "discovered_accused": [],
        "timestamp": current_time,
    }
    # Extract discovered entities from findings
    for finding in investigation_result.get("investigation", {}).get("findings", []):
        data = finding.get("data", {})
        for case in data.get("cases", []):
            cid = case.get("casemasterid") or case.get("CaseMasterID")
            if cid:
                session_store[session_id]["investigation"]["discovered_cases"].append(int(cid))
        for match in data.get("similar_cases", []):
            cid = match.get("case_id")
            if cid:
                session_store[session_id]["investigation"]["discovered_cases"].append(int(cid))
        for profile in data.get("profiles", []):
            aid = profile.get("accused_id")
            if aid:
                session_store[session_id]["investigation"]["discovered_accused"].append(int(aid))
        for node in data.get("nodes", []):
            aid = node.get("accused_id")
            if aid:
                session_store[session_id]["investigation"]["discovered_accused"].append(int(aid))
    # Also capture plan entities (e.g. the exact-case entity and its accused),
    # so follow-ups like "show the financial trail" reuse them.
    plan = investigation_result.get("investigation", {}).get("plan", {}) or {}
    for cid in (plan.get("entities", {}) or {}).get("case_ids", []) or []:
        if cid:
            session_store[session_id]["investigation"]["discovered_cases"].append(int(cid))
    for aid in (plan.get("entities", {}) or {}).get("accused_ids", []) or []:
        if aid:
            session_store[session_id]["investigation"]["discovered_accused"].append(int(aid))
    for aid in (plan.get("exact_case") or {}).get("accused_ids", []) or []:
        if aid:
            session_store[session_id]["investigation"]["discovered_accused"].append(int(aid))
    # Deduplicate
    session_store[session_id]["investigation"]["discovered_cases"] = list(set(session_store[session_id]["investigation"]["discovered_cases"]))
    session_store[session_id]["investigation"]["discovered_accused"] = list(set(session_store[session_id]["investigation"]["discovered_accused"]))


def store_exact_case_context(session_id: str, exact_result: dict):
    """
    Stores an exact-case answer as investigation context so a follow-up like
    "who is connected to it?" retains the exact FIR instead of resetting to a
    state-wide search. The stored scope deliberately carries NO crime/location
    filters — the discovered case ID is the context, never a broad filter.
    """
    current_time = time.time()
    if session_id not in session_store:
        session_store[session_id] = {"turns": [], "last_active": current_time, "investigation": None}
    record = (exact_result.get("cases") or [None])[0]
    discovered_cases = []
    discovered_accused = []
    if record and record.get("casemasterid"):
        discovered_cases.append(int(record["casemasterid"]))
    for a in exact_result.get("accused") or []:
        if a.get("accused_id"):
            discovered_accused.append(int(a["accused_id"]))
    session_store[session_id]["investigation"] = {
        "plan": {
            "filters": {
                "crime_category": None,
                "district_name": None,
                "time_window": None,
                "limit": None,
            },
            "engines": ["case_query"],
        },
        "resolved_scope": exact_result.get("scope") or {},
        "discovered_cases": discovered_cases,
        "discovered_accused": discovered_accused,
        "timestamp": current_time,
    }


def _rbac_scope_label(rbac_filter: str, role: str) -> str:
    """Human-readable label for the server-generated RBAC condition."""
    f = (rbac_filter or "").strip()
    if f == "1=1":
        return f"RBAC enforced ({role}) — state-wide access"
    if "PoliceStationID" in f:
        return f"RBAC enforced ({role}) — station-scoped access"
    if "DistrictID" in f:
        return f"RBAC enforced ({role}) — district-scoped access"
    return f"RBAC enforced ({role})"


def synthesize_structural_response(user_query: str, records: list) -> str:
    """Synthesizes database record blocks into highly pristine natural intelligence summaries."""
    if not records:
        return "I couldn't locate any matching records within the database repository matching those specific criteria."
    if not groq_client:
        return f"Query extraction complete. Isolated matches count: {len(records)} details metrics."

    prompt = f"""
    You are a strict, enterprise-grade law enforcement data synthesizer.
    Your ONLY job is to take the raw JSON database rows below and convert them into a clean, professional, conversational summary (2-3 sentences max).
    
    CRITICAL RULES:
    1. NEVER hallucinate or invent data. If a detail is not in the JSON array, do not mention it.
    2. Cite CrimeNo values inline exactly as they appear in the data.
    3. Do NOT provide an introduction like "Here is the data" or "Based on the records". Just state the facts directly.
    4. If the data array is empty, simply state that no records match the criteria.

    INVESTIGATOR QUERY: {user_query}
    EXTRACTED DATA: {json.dumps(records[:15], default=str)}
    """
    response = groq_client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model="openai/gpt-oss-120b",
        temperature=0.0,
        seed=42
    )
    return response.choices[0].message.content.strip()


@app.post("/api/chat")
async def handle_chat(request: ChatRequest, authorization: Optional[str] = Header(None)):
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Invalid Request Payload.")

    # 1. Extract authenticated user context from JWT (never trust client-supplied role/district)
    auth_ctx = _extract_auth_context(authorization)
    user_role = auth_ctx["role"]
    user_employee_id = auth_ctx["employee_id"]
    user_unit_id = auth_ctx["unit_id"]
    user_district_id = auth_ctx["district_id"]

    rbac_sql_filter = security_context.build_rbac_filter(
        role=user_role,
        employee_district_id=user_district_id,
        employee_unit_id=user_unit_id
    )

    try:
        active_memory = access_context_memory(request.session_token)
        standalone_q = request.query
        if active_memory:
            standalone_q = router_engine.rewrite_to_standalone(request.query, active_memory)

        # Pass the previous investigation context so follow-ups like
        # "show the financial trail" are classified as context-requiring
        # intents (never a broad case search).
        inv_ctx = get_investigation_context(request.session_token)
        intent_profile = router_engine.classify_intent(standalone_q, investigation_context=inv_ctx)
        target_engine = intent_profile["engine"]

        answer_text = ""
        citations_array = []
        execution_detail = ""
        resolved_query_log = ""
        row_count_log = 0
        graph_payload = None  # ADD THIS LINE
        analytics_payload = None
        case_records = []
        lookup_scope = None

        # ── ENTITY-FIRST: exact case/FIR detection overrides everything ──
        # A question that names a specific FIR/case must resolve THAT record.
        # Crime/location words in such questions are verification, never broad
        # filters. This runs before engine dispatch so a classifier mistake can
        # never send an exact-ID question to RAG/pattern/broad case search.
        exact_result = ExactCaseResolver().try_handle(
            standalone_q, rbac_filter=rbac_sql_filter, auth_ctx=auth_ctx
        )
        if exact_result.get("handled"):
            answer_text = exact_result["answer"]
            citations_array = exact_result.get("citations", [])
            row_count_log = exact_result.get("total_count", 0)
            resolved_query_log = exact_result.get("resolved_query", "")
            execution_detail = exact_result.get("execution_detail", "")
            case_records = exact_result.get("cases", [])
            lookup_scope = exact_result.get("scope")
            target_engine = "exact_case_lookup"
            # Keep the exact FIR as investigation context for follow-ups
            store_exact_case_context(request.session_token, exact_result)

        # ── Multi-engine analysis intents ──
        # Pattern / MO-similarity / financial / network / trend / forecasting /
        # next-best-action questions run through the investigation pipeline so
        # they get deterministic scope resolution, the entity firewall (never a
        # broad case list), evidence fusion and the structured response. The
        # session's investigation context is passed so follow-ups ("show the
        # financial trail", "who is connected to it?") keep their entities.
        delegated_result = None
        if not exact_result.get("handled") and target_engine in (
            "pattern_detection", "narrative_rag", "financial_intelligence",
            "criminal_network", "case_similarity", "forecasting",
            "next_best_action", "trend_analysis", "investigation",
        ):
            delegated_result = investigation_engine.run_investigation(
                request_text=standalone_q,
                rbac_filter=rbac_sql_filter,
                conversation_history=active_memory,
                investigation_context=inv_ctx,
                nl2sql_engine=nl2sql_engine,
                rag_engine=rag_engine,
                graph_engine=graph_engine,
                network_engine=network_engine,
                pattern_engine=pattern_engine,
                analytics_engine=analytics_engine,
                case_explorer_engine=case_explorer_engine,
            )
            set_investigation_context(request.session_token, delegated_result)
            target_engine = delegated_result.get("intent_detected") or target_engine
            answer_text = delegated_result.get("answer", "")
            citations_array = delegated_result.get("citations", [])
            row_count_log = len(citations_array)
            resolved_query_log = "MULTI_ENGINE_DELEGATED"
            execution_detail = (
                "Delegated to multi-engine investigation pipeline: "
                + ", ".join(
                    delegated_result.get("investigation", {}).get("plan", {}).get("engines", []) or []
                )
            )
            case_records = delegated_result.get("case_records") or []
            graph_payload = delegated_result.get("graph_data")
            analytics_payload = delegated_result.get("analytics_data")

        # ── General dispatch (only reached when no exact case identifier and
        #    no delegation to the investigation pipeline) ──
        if delegated_result is None and target_engine in ["factual_lookup", "trend_analysis"]:
            trend_instruction = ""
            if target_engine == "trend_analysis":
                trend_instruction = " FORCE TREND FORMAT: Group by month. Select exactly two columns: 'month' (e.g. TO_CHAR(cm.CrimeRegisteredDate, 'YYYY-MM')) and 'count'."

            # ── Deterministic factual case lookup ──
            # Simple database questions ("details about the last cases registered
            # in Bengaluru Urban central") are handled WITHOUT the LLM: location
            # and recency are resolved against real tables, RBAC is enforced as
            # a mandatory condition, and the case query engine returns the actual
            # records. NL2SQL remains the fallback for queries this path does not
            # recognize (e.g. complex aggregations).
            if target_engine == "factual_lookup":
                lookup_result = FactualCaseLookup().try_lookup(
                    standalone_q, rbac_filter=rbac_sql_filter, auth_ctx=auth_ctx
                )
                if lookup_result.get("handled"):
                    answer_text = lookup_result["answer"]
                    citations_array = lookup_result["citations"]
                    row_count_log = lookup_result["total_count"]
                    resolved_query_log = lookup_result["resolved_query"]
                    execution_detail = lookup_result["execution_detail"]
                    case_records = lookup_result.get("cases", [])
                    lookup_scope = lookup_result.get("scope")
                    target_engine = "case_lookup"  # UI label

            # ── Fallback: LLM-to-SQL (unrecognized factual queries + all trend
            #    queries) ──
            if target_engine in ("factual_lookup", "trend_analysis"):
                # Inject the security filter into the SQL generation
                generated_sql = nl2sql_engine.generate_sql(standalone_q + trend_instruction, rbac_filter=rbac_sql_filter)
                resolved_query_log = generated_sql
                execution_result = nl2sql_engine.validate_and_execute(generated_sql, standalone_q)
                
                if "error" in execution_result:
                    answer_text = f"I couldn't execute that analysis: {execution_result['error']}"
                else:
                    rows_payload = execution_result.get("rows", [])
                    row_count_log = len(rows_payload)
                    
                    if target_engine == "trend_analysis":
                        trend_data = []
                        for row in rows_payload:
                            keys = list(row.keys())
                            if len(keys) >= 2:
                                trend_data.append({"month": str(row[keys[0]]), "count": int(row[keys[1]])})
                        
                        data_points = len(trend_data)
                        answer_text = f"I have generated a custom trend visualization spanning {data_points} data points based on your specific criteria."
                        execution_detail = "Executed temporal NLP-to-SQL aggregation query."
                        analytics_payload = {"type": "trend", "data": trend_data}
                    else:
                        answer_text = synthesize_structural_response(standalone_q, rows_payload)
                        extracted_citations = [r.get("crimeno") or r.get("CrimeNo") for r in rows_payload]
                        citations_array = [str(c) for c in extracted_citations if c][:5]
                        execution_detail = f"RBAC applied ({user_role}). Executed Query."

        elif delegated_result is None and target_engine == "narrative_rag":
            # For Milestone 2/3, we pass standard RAG. 
            # Note: You can apply the same RBAC logic to the RAG vector search in the future!
            rag_result = rag_engine.search_and_summarize(standalone_q)
            resolved_query_log = "VECTOR_SEARCH"
            if "error" not in rag_result:
                answer_text = rag_result["answer"]
                citations_array = rag_result["citations"]
                row_count_log = len(citations_array)
                
        elif delegated_result is None and target_engine == "risk_profile":
            accused_id = router_engine.extract_accused_id(standalone_q)
            if accused_id == 0:
                answer_text = "Please specify an Accused ID to retrieve their risk profile."
                execution_detail = "Failed to extract Accused ID."
            else:
                risk_result = analytics_engine.get_risk_profile(accused_id)
                if "error" in risk_result:
                    answer_text = f"Risk profiling failed: {risk_result['error']}"
                else:
                    score = risk_result["score"]
                    answer_text = f"Risk Profile for Accused {accused_id}: Score is {score}/100. Repeat Offender: {risk_result['repeat_offender']}."
                    execution_detail = f"Queried OffenderRiskScore table for ID {accused_id}."
                    
                    # ADD THIS LINE:
                    analytics_payload = {"type": "risk", "data": risk_result}


        # ... (Inside the branching logic) ...
        elif delegated_result is None and target_engine == "criminal_network":
            # 1. Extract the ID from the query
            accused_id = router_engine.extract_accused_id(standalone_q)

            if accused_id == 0:
                answer_text = "I need a specific Accused ID to map a network. For example: 'Show me the network for Accused 104'."
                execution_detail = "Failed to extract integer Accused ID from prompt."
            else:
                # 2. Run the NetworkX Traversal
                graph_result = graph_engine.network_for_accused(accused_id)
                resolved_query_log = f"GRAPH_TRAVERSAL: AccusedID {accused_id}"

                if "error" in graph_result:
                    answer_text = f"Graph engine response: {graph_result['error']}"
                    execution_detail = "Target node not found in precomputed graph bounds."
                else:
                    node_count = len(graph_result["nodes"])
                    edge_count = len(graph_result["edges"])
                    row_count_log = node_count

                    answer_text = f"Successfully mapped the criminal syndicate. Found {node_count} linked entities and {edge_count} direct connections (co-accused and financial)."

                    # Extract the case numbers from the edges to use as citations
                    extracted_citations = [str(e["case"]) for e in graph_result["edges"] if str(e["case"]) != "None"]
                    citations_array = list(set(extracted_citations))[:5] # Deduplicate and cap at 5
                    execution_detail = f"Executed 2-hop Louvain network map. Displaying {node_count} nodes."

                    graph_payload = graph_result  # ADD THIS LINE

        elif delegated_result is None and target_engine == "case_similarity":
            # 1. Extract the CaseMasterID from the query. Let's reuse extract_accused_id logic or regex it.
            match = re.search(r'\d+', standalone_q)
            target_case_id = int(match.group()) if match else 0
            
            if target_case_id == 0:
                answer_text = "I need a specific Case ID to find similarities. For example: 'Find cases similar to CaseMasterID 2817'."
                execution_detail = "Failed to extract integer Case ID from prompt."
            else:
                from engines.pattern_engine import pattern_engine
                similarity_result = pattern_engine.find_similar_cases(target_case_id)
                if "error" in similarity_result:
                    answer_text = f"Similarity engine failed: {similarity_result['error']}"
                else:
                    matches = similarity_result.get("similar_cases", [])
                    row_count_log = len(matches)
                    if not matches:
                        answer_text = f"No similar cases found for CaseMasterID {target_case_id}."
                    else:
                        answer_text = f"I found {len(matches)} highly similar cases based on narrative semantics, Modus Operandi overlaps, and spatial-temporal proximity. The strongest matches are:\n\n"
                        for m in matches[:3]:
                            answer_text += f"- **Crime No {m.get('crime_no', 'Unknown')}**: {int(m.get('match_score', 0))}% match. (Why: {', '.join(m.get('explanations', []))})\n"
                        
                        extracted_citations = [m.get("crime_no") for m in matches if m.get("crime_no")]
                        citations_array = [str(c) for c in extracted_citations][:5]
                        
                    execution_detail = f"Executed Tri-Signal pgvector similarity search for Case ID {target_case_id}."

        elif delegated_result is None and target_engine not in ("exact_case_lookup",):
            answer_text = "Routed to Analytics endpoint (Milestone 4)."
            execution_detail = "Routing placeholder."

        # MANDATORY: Log every interaction to the Audit Table (using authenticated identity)
        security_context.log_audit(
            employee_id=user_employee_id,
            role=user_role,
            raw_query=request.query,
            engine=target_engine,
            resolved_sql=resolved_query_log,
            row_count=row_count_log
        )

        active_memory.append({"role": "user", "text": request.query})
        active_memory.append({"role": "assistant", "text": answer_text})

        if delegated_result is not None:
            # Multi-engine delegation returns the full investigation payload
            # (plan, findings, evidence inventory, routing log, graph/analytics).
            delegated_result["intent_detected"] = target_engine
            delegated_result["reasoning_trace"] = {
                "execution_steps": [
                    {"step": 1, "action": "Security Check", "detail": _rbac_scope_label(rbac_sql_filter, user_role)},
                    {"step": 2, "action": "Intent Target", "detail": f"{target_engine} ({intent_profile.get('reasoning', 'classified')})"},
                    {"step": 3, "action": "Execution", "detail": execution_detail}
                ]
            }
            return delegated_result

        return {
            "status": "success",
            "intent_detected": target_engine,
            "answer": answer_text,
            "citations": citations_array,
            "graph_data": graph_payload, # ADD THIS LINE
            "analytics_data": analytics_payload, # ADD THIS LINE
            "case_records": case_records,
            "lookup_scope": lookup_scope,
            "reasoning_trace": {
                "execution_steps": [
                    {"step": 1, "action": "Security Check", "detail": _rbac_scope_label(rbac_sql_filter, user_role)},
                    {"step": 2, "action": "Intent Target", "detail": f"{target_engine} ({intent_profile.get('reasoning', 'classified')})"},
                    {"step": 3, "action": "Execution", "detail": execution_detail}
                ]
            }
        }
    except Exception as server_error:
        raise HTTPException(status_code=500, detail=str(server_error))

# ──────────────────────────────────────────────
#  Investigation Planner Endpoint
# ──────────────────────────────────────────────

class InvestigateRequest(BaseModel):
    query: str
    session_token: str = "local_node_dev_session"

@app.post("/api/investigate")
async def handle_investigate(request: InvestigateRequest, authorization: Optional[str] = Header(None)):
    """
    Multi-engine investigation planner.
    Generates a structured plan, executes multiple engines, fuses evidence,
    and returns an explainable investigation result.
    """
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Invalid Request Payload.")

    # 1. Extract authenticated user context from JWT
    auth_ctx = _extract_auth_context(authorization)
    user_role = auth_ctx["role"]
    user_employee_id = auth_ctx["employee_id"]
    user_unit_id = auth_ctx["unit_id"]
    user_district_id = auth_ctx["district_id"]

    rbac_sql_filter = security_context.build_rbac_filter(
        role=user_role,
        employee_district_id=user_district_id,
        employee_unit_id=user_unit_id
    )

    try:
        # 2. Get conversation context for multi-turn investigations
        conversation_history = access_context_memory(request.session_token)
        investigation_context = get_investigation_context(request.session_token)

        # Build extended history including investigation context
        extended_history = list(conversation_history)
        if investigation_context:
            # Add investigation context to history so planner can reference previous results
            prev_plan = investigation_context.get("plan", {})
            discovered_cases = investigation_context.get("discovered_cases", [])
            discovered_accused = investigation_context.get("discovered_accused", [])
            if discovered_cases or discovered_accused:
                context_note = "Previous investigation discovered: "
                if discovered_cases:
                    context_note += f"Cases {discovered_cases[:10]}"
                if discovered_accused:
                    context_note += f", Accused IDs {discovered_accused[:10]}"
                extended_history.append({"role": "system", "text": context_note})

        # 3. Run investigation pipeline
        result = investigation_engine.run_investigation(
            request_text=request.query,
            rbac_filter=rbac_sql_filter,
            conversation_history=extended_history,
            investigation_context=investigation_context,
            nl2sql_engine=nl2sql_engine,
            rag_engine=rag_engine,
            graph_engine=graph_engine,
            network_engine=network_engine,
            pattern_engine=pattern_engine,
            analytics_engine=analytics_engine,
            case_explorer_engine=case_explorer_engine,
        )

        # 4. Store investigation context for multi-turn follow-up
        set_investigation_context(request.session_token, result)

        # 5. Log to conversation history and audit
        active_memory = access_context_memory(request.session_token)
        active_memory.append({"role": "user", "text": request.query})
        active_memory.append({"role": "assistant", "text": result.get("answer", "")})

        engines_used = result.get("investigation", {}).get("summary_stats", {}).get("engines_executed", 0)
        security_context.log_audit(
            employee_id=user_employee_id,
            role=user_role,
            raw_query=request.query,
            engine="investigation",
            resolved_sql=f"MULTI_ENGINE: {engines_used} engines",
            row_count=len(result.get("citations", []))
        )

        return result

    except Exception as server_error:
        raise HTTPException(status_code=500, detail=str(server_error))


# ──────────────────────────────────────────────
#  Evidence Graph Endpoint
# ──────────────────────────────────────────────

class EvidenceGraphRequest(BaseModel):
    finding: dict

@app.post("/api/evidence/graph")
async def get_evidence_graph(request: EvidenceGraphRequest, authorization: Optional[str] = Header(None)):
    """
    Builds a structured evidence graph from a finding.
    Returns nodes (real entities) and edges (real relationships with provenance).
    """
    # Verify authentication
    _extract_auth_context(authorization)

    finding = request.finding
    if not finding:
        raise HTTPException(status_code=400, detail="No finding data provided.")

    try:
        result = evidence_graph_builder.build_from_finding(finding)
        return {"status": "success", **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Evidence graph generation failed: {str(e)}")


# ──────────────────────────────────────────────
#  Next Best Investigative Action Endpoint
# ──────────────────────────────────────────────

class NextActionsRequest(BaseModel):
    investigation_result: dict

@app.post("/api/investigation/next-actions")
async def get_next_actions(request: NextActionsRequest, authorization: Optional[str] = Header(None)):
    """
    Generates evidence-grounded investigative leads from an investigation result.
    Every lead is traceable to real database records or engine outputs.
    """
    _extract_auth_context(authorization)  # Verify auth

    try:
        result = next_best_action_engine.generate_next_actions(request.investigation_result)
        return {"status": "success", **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Next actions generation failed: {str(e)}")


# ──────────────────────────────────────────────
#  Crime Forecasting Endpoints
# ──────────────────────────────────────────────

@app.get("/api/forecast")
async def get_forecast(
    category_id: Optional[int] = Query(None),
    district_id: Optional[int] = Query(None),
    horizon: int = Query(3, ge=1, le=6),
    authorization: Optional[str] = Header(None),
):
    """Generates a monthly crime forecast using Holt-Winters exponential smoothing."""
    auth_ctx = _extract_auth_context(authorization)
    rbac_filter = security_context.build_rbac_filter(
        role=auth_ctx["role"],
        employee_district_id=auth_ctx["district_id"],
        employee_unit_id=auth_ctx["unit_id"]
    )
    # Override district_id with authorized scope if non-admin
    if auth_ctx["role"] in ["Investigator", "Supervisor"]:
        district_id = auth_ctx["district_id"]

    result = forecasting_engine.forecast_category(
        category_id=category_id,
        district_id=district_id,
        horizon=horizon,
        rbac_filter=rbac_filter,
    )
    security_context.log_audit(
        employee_id=auth_ctx["employee_id"],
        role=auth_ctx["role"],
        raw_query=f"Forecast cat={category_id} dist={district_id} hor={horizon}",
        engine="forecasting",
        resolved_sql="STATISTICAL_MODEL",
        row_count=0
    )
    return result


@app.get("/api/forecast/summary")
async def get_forecast_summary(
    district_id: Optional[int] = Query(None),
    horizon: int = Query(3, ge=1, le=6),
    authorization: Optional[str] = Header(None),
):
    """Returns forecast summaries for all crime categories."""
    auth_ctx = _extract_auth_context(authorization)
    rbac_filter = security_context.build_rbac_filter(
        role=auth_ctx["role"],
        employee_district_id=auth_ctx["district_id"],
        employee_unit_id=auth_ctx["unit_id"]
    )
    if auth_ctx["role"] in ["Investigator", "Supervisor"]:
        district_id = auth_ctx["district_id"]

    result = forecasting_engine.forecast_all_categories(
        district_id=district_id,
        horizon=horizon,
        rbac_filter=rbac_filter,
    )
    return result


@app.get("/api/forecast/hotspots")
async def get_predictive_hotspots(
    district_id: Optional[int] = Query(None),
    category_id: Optional[int] = Query(None),
    horizon: int = Query(3, ge=1, le=6),
    authorization: Optional[str] = Header(None),
):
    """Classifies geographic areas as historical, emerging, or predicted hotspots."""
    auth_ctx = _extract_auth_context(authorization)
    rbac_filter = security_context.build_rbac_filter(
        role=auth_ctx["role"],
        employee_district_id=auth_ctx["district_id"],
        employee_unit_id=auth_ctx["unit_id"]
    )
    if auth_ctx["role"] in ["Investigator", "Supervisor"]:
        district_id = auth_ctx["district_id"]

    result = predictive_hotspot_engine.classify_hotspots(
        district_id=district_id,
        category_id=category_id,
        horizon=horizon,
        rbac_filter=rbac_filter,
    )
    security_context.log_audit(
        employee_id=auth_ctx["employee_id"],
        role=auth_ctx["role"],
        raw_query=f"Predictive hotspots cat={category_id} dist={district_id}",
        engine="predictive_hotspots",
        resolved_sql="GEOGRAPHIC_CLASSIFICATION",
        row_count=0
    )
    return result


class ExportRequest(BaseModel):
    messages: list

@app.post("/api/chat/export")
async def export_chat(request: ExportRequest, authorization: Optional[str] = Header(None)):
    """Generates a premium, beautifully styled HTML report of the session transcript for export."""
    try:
        officer_name = "Investigator"
        role = "Analyst"
        district = "State Database"
        unit = "HQ"
        
        if authorization:
            try:
                payload = verify_jwt_token(authorization)
                profile = get_employee_profile(payload["employee_id"])
                if "error" not in profile:
                    officer_name = profile.get("name", officer_name)
                    role = profile.get("role", role)
                    district = profile.get("district_name", district)
                    unit = profile.get("unit_name", unit)
            except Exception:
                pass

        # Build the HTML template
        html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>TriNetra Case Intelligence Report</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body {{
            font-family: 'Outfit', sans-serif;
        }}
        @media print {{
            .no-print {{ display: none; }}
            body {{ background-color: white; }}
        }}
    </style>
</head>
<body class="bg-slate-50 text-slate-900 p-8 min-h-screen">
    <div class="max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        <!-- Header Banner -->
        <div class="bg-slate-950 text-white p-8 relative">
            <div class="absolute right-8 top-8 opacity-10">
                <svg class="w-24 h-24" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
            </div>
            <div class="text-xs font-bold text-amber-500 uppercase tracking-widest mb-2">Internal Security Core Document</div>
            <h1 class="text-3xl font-extrabold tracking-tight">TRINETRA CASE INTELLIGENCE REPORT</h1>
            <p class="text-slate-400 text-sm mt-1">Conversational AI Orchestrator Session Export</p>
            
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 pt-6 border-t border-slate-800 text-xs text-slate-300">
                <div>
                    <span class="block text-slate-500 uppercase font-semibold">Generated By</span>
                    <span class="font-bold text-white mt-0.5 block">{officer_name} ({role})</span>
                </div>
                <div>
                    <span class="block text-slate-500 uppercase font-semibold">Jurisdiction</span>
                    <span class="font-bold text-white mt-0.5 block">{district}</span>
                </div>
                <div>
                    <span class="block text-slate-500 uppercase font-semibold">Unit Node</span>
                    <span class="font-bold text-white mt-0.5 block">{unit}</span>
                </div>
                <div>
                    <span class="block text-slate-500 uppercase font-semibold">Timestamp</span>
                    <span class="font-bold text-white mt-0.5 block">{time.strftime('%Y-%m-%d %H:%M:%S UTC')}</span>
                </div>
            </div>
        </div>

        <!-- Toolbar / Action Bar (Non-Printable) -->
        <div class="no-print bg-slate-100 px-8 py-3 border-b border-slate-200 flex justify-between items-center text-xs">
            <span class="text-slate-500 font-medium">Use Ctrl+P or the button to save as PDF.</span>
            <button onclick="window.print()" class="bg-primary-900 text-white hover:bg-slate-800 font-bold px-4 py-2 rounded shadow transition-colors bg-slate-900">
                Print Report
            </button>
        </div>

        <!-- Chat Session Log -->
        <div class="p-8 space-y-8">
            <h2 class="text-lg font-bold text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2">
                Session Transcript History
            </h2>
            
            <div class="space-y-6">"""

        for msg in request.messages:
            sender = "OFFICER" if msg.get("sender") == "user" else "TRINETRA AI"
            bg_color = "bg-slate-50 border border-slate-100" if msg.get("sender") == "user" else "bg-white border border-slate-200"
            header_color = "text-primary-900" if msg.get("sender") == "user" else "text-amber-600"
            
            html_content += f"""
                    <div class="rounded-xl p-5 {bg_color}">
                        <div class="flex items-center justify-between mb-3">
                            <span class="text-xs font-bold uppercase tracking-wider {header_color}">{sender}</span>
                        </div>
                        <div class="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap mb-4">{msg.get("text")}</div>
            """

            # Reasoning details
            if msg.get("intent_detected"):
                html_content += f"""
                        <div class="mt-4 pt-3 border-t border-slate-100">
                            <span class="inline-block text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">Engine: {msg.get("intent_detected")}</span>
                        </div>
                """

            # Graph Data details
            if msg.get("graph_data"):
                gd = msg.get("graph_data")
                nodes = gd.get("nodes", [])
                edges = gd.get("edges", [])
                html_content += f"""
                        <div class="mt-4 bg-slate-50 p-4 rounded-lg border border-slate-150 text-xs">
                            <h4 class="font-bold text-slate-700 mb-2">Extracted Graph Structure</h4>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <span class="block font-semibold text-slate-500 mb-1">Nodes ({len(nodes)}):</span>
                                    <ul class="list-disc pl-4 space-y-1 text-slate-600">
                """
                for node in nodes[:15]:
                    html_content += f"<li>{node.get('label')} ({node.get('type')})</li>"
                if len(nodes) > 15:
                    html_content += f"<li>+ {len(nodes) - 15} more nodes...</li>"
                html_content += """
                                    </ul>
                                </div>
                                <div>
                                    <span class="block font-semibold text-slate-500 mb-1">Connections ({len(edges)}):</span>
                                    <ul class="list-disc pl-4 space-y-1 text-slate-600">
                """
                for edge in edges[:15]:
                    html_content += f"<li>ID {edge.get('source')} linked to ID {edge.get('target')} (Case: {edge.get('case')})</li>"
                if len(edges) > 15:
                    html_content += f"<li>+ {len(edges) - 15} more connections...</li>"
                html_content += """
                                    </ul>
                                </div>
                            </div>
                        </div>
                """

            # Analytics/Trend details
            if msg.get("analytics_data"):
                ad = msg.get("analytics_data")
                if ad.get("type") == "trend" and isinstance(ad.get("data"), list):
                    html_content += """
                        <div class="mt-4 bg-slate-50 p-4 rounded-lg border border-slate-150 text-xs">
                            <h4 class="font-bold text-slate-700 mb-2">Trend Registry</h4>
                            <table class="w-full text-left border-collapse">
                                <thead>
                                    <tr class="border-b border-slate-200 text-slate-500">
                                        <th class="py-1">Month</th>
                                        <th class="py-1">Registered Cases</th>
                                    </tr>
                                </thead>
                                <tbody>
                    """
                    for row in ad.get("data"):
                        html_content += f"""
                                    <tr class="border-b border-slate-100 text-slate-600">
                                        <td class="py-1">{row.get("month")}</td>
                                        <td class="py-1 font-bold">{row.get("count")}</td>
                                    </tr>
                        """
                    html_content += """
                                </tbody>
                            </table>
                        </div>
                    """

            # Investigation Findings
            if msg.get("investigation") and msg["investigation"].get("findings"):
                inv = msg["investigation"]
                stats = inv.get("summary_stats", {})
                html_content += f"""
                        <div class="mt-4 bg-indigo-50 p-4 rounded-lg border border-indigo-200 text-xs">
                            <h4 class="font-bold text-indigo-800 mb-2">🔍 Investigation Results</h4>
                            <div class="text-[10px] text-indigo-600 mb-2">
                                Engines: {stats.get('engines_succeeded', 0)}/{stats.get('engines_executed', 0)} succeeded | Evidence strength: {stats.get('overall_strength', 'unknown').upper()}
                            </div>
                """
                for finding in inv["findings"]:
                    if finding.get("category") in ("Investigation Overview", "Engine Failures"):
                        continue
                    html_content += f"""
                            <div class="bg-white p-3 rounded border border-indigo-100 mb-2">
                                <div class="flex justify-between items-center mb-1">
                                    <span class="font-bold text-slate-800">{finding.get('category', '')}</span>
                                    <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{finding.get('strength', '').upper()}</span>
                                </div>
                                <p class="text-slate-600">{finding.get('description', '')}</p>
                            </div>
                    """
                html_content += "</div>"

            # Next Best Investigative Actions
            if msg.get("nextActions") and msg["nextActions"].get("leads"):
                leads = msg["nextActions"]["leads"]
                html_content += f"""
                        <div class="mt-4 bg-emerald-50 p-4 rounded-lg border border-emerald-200 text-xs">
                            <h4 class="font-bold text-emerald-800 mb-2">🎯 Next Best Investigative Actions</h4>
                            <div class="text-[10px] text-emerald-600 mb-2">
                                {len(leads)} evidence-backed lead{'s' if len(leads) != 1 else ''} identified
                            </div>
                """
                for lead in leads[:10]:
                    priority_colors = {'high': 'border-l-red-500', 'medium': 'border-l-amber-500', 'low': 'border-l-slate-300'}
                    border_cls = priority_colors.get(lead.get('priority', ''), 'border-l-slate-200')
                    html_content += f"""
                            <div class="bg-white p-3 rounded border border-emerald-100 mb-2 border-l-4 {border_cls}">
                                <div class="flex justify-between items-center mb-1">
                                    <span class="font-bold text-slate-800">{lead.get('target', {}).get('entity_label', '')}</span>
                                    <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{lead.get('priority', '').upper()}</span>
                                </div>
                                <p class="text-slate-600 mb-1">{lead.get('reason', '')}</p>
                                <div class="text-[9px] text-slate-400">
                                    Sources: {', '.join(lead.get('source_engines', []))}
                                </div>
                            </div>
                    """
                html_content += "</div>"

            # Citations
            if msg.get("citations"):
                citations = msg.get("citations", [])
                html_content += f"""
                        <div class="mt-4 pt-3 border-t border-slate-100 text-xs flex gap-1.5 items-center">
                            <span class="font-bold text-slate-500">References:</span>
                            {" ".join([f"<span class='bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono font-medium'>{c}</span>" for c in citations])}
                        </div>
                """

            html_content += "</div>"

        html_content += """
                </div>
            </div>
            
            <div class="bg-slate-50 border-t border-slate-150 p-6 text-center text-[10px] text-slate-400">
                CONFIDENTIALITY NOTICE: This document contains sensitive investigative intelligence. Unauthorized reproduction or distribution is strictly prohibited.
            </div>
        </div>
    </body>
    </html>"""

        from fastapi.responses import Response
        return Response(content=html_content, media_type="text/html", headers={"Content-Disposition": "attachment; filename=trinetra_chat_export.html"})

    except Exception as server_error:
        raise HTTPException(status_code=500, detail=str(server_error))

# ──────────────────────────────────────────────
# Sarvam AI Endpoints (Speech-to-Text & Translation)
# ──────────────────────────────────────────────

class SarvamTranslateRequest(BaseModel):
    text: str
    source_language: str = "kn-IN"
    target_language: str = "en-IN"

@app.post("/api/sarvam/stt")
async def sarvam_speech_to_text(
    file: UploadFile = File(...),
    language_code: str = Form("kn-IN")
):
    """Converts uploaded audio file to text using Sarvam AI STT."""
    try:
        audio_bytes = await file.read()
        res = sarvam_engine.speech_to_text(audio_bytes=audio_bytes, language_code=language_code)
        if "error" in res:
            raise HTTPException(status_code=500, detail=res["error"])
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sarvam STT failed: {str(e)}")

@app.post("/api/sarvam/translate")
async def sarvam_translate(req: SarvamTranslateRequest):
    """Translates text between Kannada and English (or other Indian languages)."""
    try:
        res = sarvam_engine.translate(
            text=req.text,
            source_lang=req.source_language,
            target_lang=req.target_language
        )
        if "error" in res:
            raise HTTPException(status_code=500, detail=res["error"])
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sarvam Translate failed: {str(e)}")

# ================================================================
#  Financial Intelligence Endpoints
# ================================================================

class FinancialAnalysisRequest(BaseModel):
    accused_ids: Optional[list[int]] = None
    case_ids: Optional[list[int]] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    include_leads: bool = True

@app.post("/api/financial/analyze")
async def analyze_financial(
    request: FinancialAnalysisRequest,
    token_data: dict = Depends(verify_jwt_token)
):
    """Analyzes financial relationships between accused persons, accounts, and transactions."""
    auth_context = get_employee_profile(token_data)
    try:
        result = financial_intelligence_engine.analyze_financial_relationships(
            accused_ids=request.accused_ids,
            case_ids=request.case_ids,
            date_from=request.date_from,
            date_to=request.date_to,
        )

        # Generate financial leads
        if request.include_leads:
            leads = financial_lead_generator.generate_leads(result)
            result["leads"] = leads
        else:
            result["leads"] = []

        # Audit logging
        try:
            from engines.audit import AuditLogger
            logger = AuditLogger()
            logger.log(
                user_id=auth_context.get("employee_id"),
                action="financial_analysis",
                details={
                    "accused_ids": request.accused_ids,
                    "case_ids": request.case_ids,
                    "total_accounts": result["summary"]["total_accounts"],
                    "total_transactions": result["summary"]["total_transactions"],
                    "leads_generated": len(result["leads"]),
                }
            )
        except Exception:
            pass

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Financial analysis failed: {str(e)}")

@app.get("/api/financial/account/{account_id}")
async def get_account_detail(
    account_id: int,
    token_data: dict = Depends(verify_jwt_token)
):
    """Returns detailed information about a specific suspect account."""
    try:
        import psycopg2
        conn = psycopg2.connect(os.getenv('NEON_DATABASE_URL'))
        cur = conn.cursor()
        cur.execute("""
            SELECT sa.AccountID, sa.AccountNumber, sa.BankName, sa.IFSC,
                   a.AccusedMasterID, a.AccusedName,
                   cm.CaseMasterID, cm.CrimeNo, cm.CrimeRegisteredDate
            FROM SuspectAccount sa
            LEFT JOIN Accused a ON sa.AccusedMasterID = a.AccusedMasterID
            LEFT JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
            WHERE sa.AccountID = %s
        """, (account_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Account not found")

        # Get transactions
        cur.execute("""
            SELECT ft.TxnID, ft.Amount, ft.TxnDate, ft.Flagged,
                   sa2.AccountNumber, sa2.BankName, a2.AccusedName,
                   cm.CrimeNo, 'outgoing' as direction
            FROM FinancialTransaction ft
            JOIN SuspectAccount sa2 ON ft.ToAccountID = sa2.AccountID
            LEFT JOIN Accused a2 ON sa2.AccusedMasterID = a2.AccusedMasterID
            LEFT JOIN CaseMaster cm ON ft.CaseMasterID = cm.CaseMasterID
            WHERE ft.FromAccountID = %s
            UNION ALL
            SELECT ft.TxnID, ft.Amount, ft.TxnDate, ft.Flagged,
                   sa2.AccountNumber, sa2.BankName, a2.AccusedName,
                   cm.CrimeNo, 'incoming' as direction
            FROM FinancialTransaction ft
            JOIN SuspectAccount sa2 ON ft.FromAccountID = sa2.AccountID
            LEFT JOIN Accused a2 ON sa2.AccusedMasterID = a2.AccusedMasterID
            LEFT JOIN CaseMaster cm ON ft.CaseMasterID = cm.CaseMasterID
            WHERE ft.ToAccountID = %s
            ORDER BY 3
        """, (account_id, account_id))
        txns = []
        for t in cur.fetchall():
            acct_masked = f"XXXX-{t[4][-4:]}" if t[4] and len(t[4]) >= 4 else t[4]
            txns.append({
                "txn_id": t[0], "amount": float(t[1]), "txn_date": str(t[2]) if t[2] else None,
                "flagged": bool(t[3]), "counterparty_account": acct_masked,
                "counterparty_bank": t[5], "counterparty_person": t[6],
                "crime_no": t[7], "direction": t[8],
            })

        conn.close()
        acct_masked = f"XXXX-{row[1][-4:]}" if row[1] and len(row[1]) >= 4 else row[1]
        return {
            "account_id": row[0], "account_number_masked": acct_masked,
            "bank_name": row[2], "ifsc": row[3],
            "accused_master_id": row[4], "accused_name": row[5],
            "case_master_id": row[6], "crime_no": row[7],
            "crime_registered_date": str(row[8]) if row[8] else None,
            "transactions": txns,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Account lookup failed: {str(e)}")

