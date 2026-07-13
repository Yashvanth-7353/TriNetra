import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

from engines.router import IntentRouter
from engines.nl2sql import NL2SQLEngine
from engines.rag import RAGEngine

app = FastAPI(title="TriNetra Analytical Engine Node")
router_engine = IntentRouter()
nl2sql_engine = NL2SQLEngine()
rag_engine = RAGEngine()

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

# Simple in-memory context manager for Milestone 2
session_store = {}

@app.post("/api/chat")
async def handle_chat(request: ChatRequest):
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query validation error: Payload text missing.")

    session_id = request.session_token
    if session_id not in session_store:
        session_store[session_id] = []

    # Format the last 3 turns of conversation for the router's context
    chat_history = "\n".join(session_store[session_id][-3:])

    # 1. Route Intent using Context
    intent_profile = router_engine.classify_intent(request.query, chat_history)
    
    # Update NL2SQL engine targets based on new router names
    if intent_profile["engine"] in ["factual_lookup", "predictive_analytics"]:
        
        # When compiling SQL, we append the history so Gemini knows who "he" or "them" refers to
        contextual_query = f"Context: {chat_history}\nQuestion: {request.query}"
        generated_sql = nl2sql_engine.generate_sql(contextual_query)
        
        execution_result = nl2sql_engine.validate_and_execute(generated_sql)
        
        if "error" in execution_result:
            answer = f"I encountered an analytical constraint processing that request: {execution_result['error']}"
            rows_impacted = 0
        else:
            rows_impacted = len(execution_result["rows"])
            answer = f"Query executed successfully. Extracted {rows_impacted} matching records."
            if rows_impacted > 0:
                answer += f" Sample data: {str(execution_result['rows'][0])}"

        # Get citations safely
        citations = [res.get("crimeno", res.get("CrimeNo", "System Index")) for res in execution_result.get("rows", []) if isinstance(res, dict)]

        # Save to memory
        session_store[session_id].append(f"User: {request.query}")
        session_store[session_id].append(f"TriNetra: {answer}")

        return {
            "status": "success",
            "intent_detected": intent_profile["engine"],
            "answer": answer,
            "citations": citations[:5], # Cap at 5 citations to keep UI clean
            "reasoning_trace": {
                "execution_steps": [
                    {"step": 1, "action": "Intent Categorization", "detail": intent_profile["reasoning"]},
                    {"step": 2, "action": "SQL Structural Compile", "detail": generated_sql},
                    {"step": 3, "action": "Database Execution", "detail": f"Returned {rows_impacted} rows."}
                ]
            }
        }

    # Fallback for network and narrative intents
    answer = f"Routed to {intent_profile['engine']} engine (Under Construction for Milestone 3/4)."
    session_store[session_id].append(f"User: {request.query}")
    session_store[session_id].append(f"TriNetra: {answer}")

    return {
        "status": "success",
        "intent_detected": intent_profile["engine"],
        "answer": answer,
        "citations": [],
        "reasoning_trace": {
            "execution_steps": [{"step": 1, "action": "Intent Isolation", "detail": intent_profile["reasoning"]}]
        }
    }