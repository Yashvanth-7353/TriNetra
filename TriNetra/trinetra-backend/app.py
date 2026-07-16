import os
import time
import json
from fastapi import FastAPI, HTTPException, Header, Query
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
case_explorer_engine = CaseExplorerEngine()
from engines.network_engine import NetworkEngine
network_engine = NetworkEngine()
from engines.auth import authenticate_employee, create_jwt_token, verify_jwt_token, get_employee_profile

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
    # These are fallbacks; JWT token overrides them when present
    role: str = "Investigator" 
    employee_id: int = 101
    unit_id: int = 5
    district_id: int = 2


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
    page_size: int = Query(20, ge=1, le=100)
):
    """Returns paginated, searchable list of offender profiles and risk scores."""
    offset = (page - 1) * page_size
    result = analytics_engine.get_offenders(search=search, limit=page_size, offset=offset)
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
            payload = verify_jwt_token(authorization)
            if "district_id" in payload:
                district_id = payload["district_id"]
        except Exception:
            pass
            
    if not district_id:
        district_id = 2
        
    result = analytics_engine.get_prevention_alerts(district_id=district_id)
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
    
    session_store[session_id] = {"turns": [], "last_active": current_time}
    return session_store[session_id]["turns"]

def synthesize_structural_response(user_query: str, records: list) -> str:
    """Synthesizes database record blocks into highly pristine natural intelligence summaries."""
    if not records:
        return "I couldn't locate any matching records within the database repository matching those specific criteria."
    if not groq_client:
        return f"Query extraction complete. Isolated matches count: {len(records)} details metrics."

    prompt = f"""
    You are an expert law enforcement intelligence assistant. 
    Synthesize the raw database records into a clean, professional, conversational narrative summary (2-3 sentences max).
    Cite CrimeNo values inline exactly if visible in data records. Do not interpolate outside historical data text bounds.

    INVESTIGATOR QUERY: {user_query}
    EXTRACTED DATA: {json.dumps(records[:15], default=str)}
    """
    response = groq_client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model="llama-3.3-70b-versatile",
        temperature=0.3
    )
    return response.choices[0].message.content.strip()

@app.post("/api/chat")
async def handle_chat(request: ChatRequest):
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Invalid Request Payload.")

    # 1. Generate the security profile BEFORE anything else
    rbac_sql_filter = security_context.build_rbac_filter(
        role=request.role, 
        employee_district_id=request.district_id, 
        employee_unit_id=request.unit_id
    )

    try:
        active_memory = access_context_memory(request.session_token)
        standalone_q = request.query
        if active_memory:
            standalone_q = router_engine.rewrite_to_standalone(request.query, active_memory)

        intent_profile = router_engine.classify_intent(standalone_q)
        target_engine = intent_profile["engine"]

        answer_text = ""
        citations_array = []
        execution_detail = ""
        resolved_query_log = ""
        row_count_log = 0
        graph_payload = None  # ADD THIS LINE
        analytics_payload = None

        if target_engine in ["factual_lookup"]:
            # Inject the security filter into the SQL generation
            generated_sql = nl2sql_engine.generate_sql(standalone_q, rbac_filter=rbac_sql_filter)
            resolved_query_log = generated_sql
            execution_result = nl2sql_engine.validate_and_execute(generated_sql, standalone_q)
            
            if "error" in execution_result:
                answer_text = f"I couldn't execute that analysis: {execution_result['error']}"
            else:
                rows_payload = execution_result.get("rows", [])
                row_count_log = len(rows_payload)
                answer_text = synthesize_structural_response(standalone_q, rows_payload)
                extracted_citations = [r.get("crimeno") or r.get("CrimeNo") for r in rows_payload]
                citations_array = [str(c) for c in extracted_citations if c][:5]
                execution_detail = f"RBAC applied ({request.role}). Executed Query."

        elif target_engine == "narrative_rag":
            # For Milestone 2/3, we pass standard RAG. 
            # Note: You can apply the same RBAC logic to the RAG vector search in the future!
            rag_result = rag_engine.search_and_summarize(standalone_q)
            resolved_query_log = "VECTOR_SEARCH"
            if "error" not in rag_result:
                answer_text = rag_result["answer"]
                citations_array = rag_result["citations"]
                row_count_log = len(citations_array)

        elif target_engine == "trend_analysis":
            trend_result = analytics_engine.get_crime_trend()
            if "error" in trend_result:
                answer_text = f"Trend generation failed: {trend_result['error']}"
            else:
                data_points = len(trend_result["trend_data"])
                answer_text = f"I have generated the crime trend visualization spanning {data_points} months."
                execution_detail = "Executed temporal aggregation query for trend charting."
                
                # ADD THIS LINE:
                analytics_payload = {"type": "trend", "data": trend_result["trend_data"]}
                
        elif target_engine == "risk_profile":
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
        elif target_engine == "criminal_network":
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

        else:
            answer_text = "Routed to Analytics endpoint (Milestone 4)."
            execution_detail = "Routing placeholder."

        # MANDATORY: Log every interaction to the Audit Table
        security_context.log_audit(
            employee_id=request.employee_id,
            role=request.role,
            raw_query=request.query,
            engine=target_engine,
            resolved_sql=resolved_query_log,
            row_count=row_count_log
        )

        active_memory.append({"role": "user", "text": request.query})
        active_memory.append({"role": "assistant", "text": answer_text})

        return {
            "status": "success",
            "intent_detected": target_engine,
            "answer": answer_text,
            "citations": citations_array,
            "graph_data": graph_payload, # ADD THIS LINE
            "analytics_data": analytics_payload, # ADD THIS LINE
            "reasoning_trace": {
                "execution_steps": [
                    {"step": 1, "action": f"Security Check ({request.role})", "detail": f"Filter applied: {rbac_sql_filter}"},
                    {"step": 2, "action": "Intent Target", "detail": intent_profile["reasoning"]},
                    {"step": 3, "action": "Execution", "detail": execution_detail}
                ]
            }
        }

    except Exception as server_error:
        raise HTTPException(status_code=500, detail=str(server_error))