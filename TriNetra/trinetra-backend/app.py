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
        raise HTTPException(status_code=400, detail="Invalid Request Payload: Input prompt text required.")

    try:
        # Context-Aware Session Extraction Phase
        active_memory = access_context_memory(request.session_token)
        
        # Compute query optimizations
        standalone_q = request.query
        if active_memory:
            standalone_q = router_engine.rewrite_to_standalone(request.query, active_memory)

        # Classify Core Layer Intent Target
        intent_profile = router_engine.classify_intent(standalone_q)
        target_engine = intent_profile["engine"]

        answer_text = ""
        citations_array = []
        execution_detail = "Subsystem operations execution path standard clean log."

        # Branch Processing Operations Orchestrator Block
        if target_engine in ["factual_lookup", "predictive_analytics"]:
            generated_sql = nl2sql_engine.generate_sql(standalone_q)
            execution_result = nl2sql_engine.validate_and_execute(generated_sql, standalone_q)
            
            if "error" in execution_result:
                answer_text = f"I couldn't execute that analysis sequence: {execution_result['error']}"
                execution_detail = f"Failed SQL verification branch step context: {execution_result.get('executed_sql', generated_sql)}"
            else:
                rows_payload = execution_result.get("rows", [])
                # Pass data matrix fields securely to full natural summarizer
                answer_text = synthesize_structural_response(standalone_q, rows_payload)
                
                # Rigorous, verifiable cleaner citation map loop assembly
                extracted_citations = [r.get("crimeno") or r.get("CrimeNo") for r in rows_payload]
                citations_array = [str(c) for c in extracted_citations if c][:5]
                execution_detail = f"Executed SQL Statement: {execution_result.get('executed_sql', generated_sql)}"

        elif target_engine == "narrative_rag":
            rag_result = rag_engine.search_and_summarize(standalone_q)
            if "error" in rag_result:
                answer_text = "I ran into a processing limit searching the brief facts narrative indices. Please rephrase."
                execution_detail = f"RAG Subsystem failure details: {rag_result['error']}"
            else:
                answer_text = rag_result["answer"]
                citations_array = rag_result["citations"]
                execution_detail = "Executed 768-d vector semantic matching traversal across pgvector domain."

        else:
            answer_text = f"The query parameter requires separate relational entity graph configurations (Engine mapping tier: '{target_engine}')."
            execution_detail = f"Router Reasoning: {intent_profile['reasoning']}"

        # Context Memory Synchronization Update
        active_memory.append({"role": "user", "text": request.query})
        active_memory.append({"role": "assistant", "text": answer_text})

        return {
            "status": "success",
            "intent_detected": target_engine,
            "answer": answer_text,
            "citations": citations_array,
            "reasoning_trace": {
                "execution_steps": [
                    {"step": 1, "action": "Conversational Intent Refinement", "detail": f"Raw Input: '{request.query}' -> Self-Contained: '{standalone_q}'"},
                    {"step": 2, "action": "Intent Target Strategy Mapping", "detail": intent_profile["reasoning"]},
                    {"step": 3, "action": "Analytical Pipeline Execution Trace", "detail": execution_detail}
                ]
            }
        }

    except Exception as server_error:
        # High-Availability Graceful Degradation Layer Exception Catch
        raise HTTPException(
            status_code=500, 
            detail=f"An unexpected internal network error occurred at the orchestrator level: {str(server_error)}"
        )