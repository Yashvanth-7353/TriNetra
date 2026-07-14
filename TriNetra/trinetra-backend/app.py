import os
import time
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

from engines.router import IntentRouter
from engines.nl2sql import NL2SQLEngine
from engines.rag import RAGEngine
from engines.security import SecurityContext
security_context = SecurityContext()

app = FastAPI(title="TriNetra Intelligence Orchestrator Core Node")
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY")) if os.getenv("GROQ_API_KEY") else None

router_engine = IntentRouter()
nl2sql_engine = NL2SQLEngine()
rag_engine = RAGEngine()

# Hardened Browser CORS Boundary Profile Configurations
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "[http://127.0.0.1:5173](http://127.0.0.1:5173)"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    query: str
    session_token: str = "local_node_dev_session"

# Update the ChatRequest model to accept user context
class ChatRequest(BaseModel):
    query: str
    session_token: str = "local_node_dev_session"
    # Mocking JWT/Auth data for the demo
    role: str = "Investigator" 
    employee_id: int = 101
    unit_id: int = 5          # e.g., Mysuru Central PS
    district_id: int = 2      # e.g., Mysuru District

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

        if target_engine in ["factual_lookup", "predictive_analytics"]:
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
        else:
            answer_text = "Routed to external entity graph."

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