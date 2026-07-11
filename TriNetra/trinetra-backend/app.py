import os
import uvicorn
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="TriNetra Core API")

# Allow your local React frontend to talk to this server seamlessly
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"status": "online", "system": "TriNetra Local Engine"}

@app.post("/api/chat")
async def handle_chat(request: Request):
    body = await request.json()
    query = body.get("query", "")
    return {
        "status": "success",
        "reply": f"Local TriNetra Backend received: '{query}'"
    }

if __name__ == "__main__":
    # Natively run on port 9000 for local development
    uvicorn.run("app:app", host="127.0.0.1", port=9000, reload=True)