import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from dotenv import load_dotenv
load_dotenv()

from engines.router import IntentRouter
from engines.nl2sql import NL2SQLEngine

app = FastAPI(title="TriNetra Analytical Engine Node")
router_engine = IntentRouter()
nl2sql_engine = NL2SQLEngine()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    query: str
    session_token: str = "dev_session"

@app.post("/api/chat")
async def handle_chat(request: ChatRequest):
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query validation error: Payload text missing.")

    # 1. Route Intent
    intent_profile = router_engine.classify_intent(request.query)
    
    # 2. Compute Target Responses via NL2SQL for Analytics/Lookups
    if intent_profile["engine"] in ["factual_rag", "predictive_analytics"]:
        generated_sql = nl2sql_engine.generate_sql(request.query)
        execution_result = nl2sql_engine.validate_and_execute(generated_sql)
        
        if "error" in execution_result:
            answer = f"I encountered an analytical constraint processing that request: {execution_result['error']}"
            rows_impacted = 0
        else:
            rows_impacted = len(execution_result["rows"])
            answer = f"Query executed successfully. Extracted {rows_impacted} matching record fields matching your criteria."
            if rows_impacted > 0:
                answer += f" Sample context: {str(execution_result['rows'][0])}"

        return {
            "status": "success",
            "intent_detected": intent_profile["engine"],
            "answer": answer,
            "citations": [res.get("crimeno", res.get("CrimeNo", "System Index")) for res in execution_result.get("rows", []) if isinstance(res, dict)],
            "reasoning_trace": {
                "execution_steps": [
                    {"step": 1, "action": "Intent Categorization", "detail": intent_profile["reasoning"]},
                    {"step": 2, "action": "SQL Structural Compile", "detail": generated_sql},
                    {"step": 3, "action": "Security Whitelist Audit", "detail": f"Evaluated safely. Returned row constraints match: count={rows_impacted}"}
                ]
            }
        }

    # Fallback placeholder route profile path
    return {
        "status": "success",
        "intent_detected": intent_profile["engine"],
        "answer": f"Routed successfully to target engine subsystem context profile: {intent_profile['engine']}",
        "citations": [],
        "reasoning_trace": {
            "execution_steps": [{"step": 1, "action": "Intent Isolation", "detail": intent_profile["reasoning"]}]
        }
    }