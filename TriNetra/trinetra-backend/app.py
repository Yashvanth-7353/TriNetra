import os
import uvicorn
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Import our engines
from engines.router import IntentRouter
from engines.database import HybridDataEngine

app = FastAPI(title="TriNetra Core API")
router_engine = IntentRouter()
db_engine = HybridDataEngine()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    query: str
    session_token: str = "local_dev_session"

@app.post("/api/chat")
async def handle_chat(request: ChatRequest):
    if not request.query:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    # 1. Classify the Intent
    classification = router_engine.classify_intent(request.query)
    
    answer_text = ""
    citations = []
    
    # 2. Execute Logic Based on Intent
    if classification["engine"] == "factual_rag":
        # Extract a simple keyword to search (In a real RAG, the LLM does this)
        # For now, we'll just search for the word "burglary" or default to "theft"
        search_term = "burglary" if "burglary" in request.query.lower() else "unknown"
        
        # Pull from our Data Engine
        records = db_engine.search_factual_records(search_term)
        
        if records:
            answer_text = f"I found {len(records)} relevant records regarding your query. Here is a summary of the latest incident: {records[0]['BriefFacts']}"
            citations = [f"{rec['CrimeNo']} ({rec['District']})" for rec in records]
        else:
            answer_text = "I searched the database but could not find any records matching those parameters."
            
    else:
        # Fallback for the other intents we haven't built data functions for yet
        answer_text = f"Simulated response for a {classification['engine']} query."

    # 3. Construct Final Payload
    response_payload = {
        "status": "success",
        "intent_detected": classification["engine"],
        "reasoning_trace": {
            "execution_steps": [
                {"step": 1, "action": "Intent Classification", "detail": classification["reasoning"]},
                {"step": 2, "action": "Database Execution", "detail": f"Queried CaseMaster for keyword '{request.query}'"}
            ]
        },
        "answer": answer_text,
        "citations": citations
    }
    
    return response_payload

if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=9000, reload=True)