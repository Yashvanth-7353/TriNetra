import os
import json
from groq import Groq

class IntentRouter:
    def __init__(self):
        self.groq_client = Groq(api_key=os.getenv("GROQ_API_KEY")) if os.getenv("GROQ_API_KEY") else None

    def classify_intent(self, query: str, chat_history: str = "") -> dict:
        """
        Uses Groq Llama 3.3 to classify user intent based on the query and conversation history.
        """
        if not self.groq_client:
            # Fallback for local testing without API keys
            return {"engine": "factual_lookup", "reasoning": "API key missing, defaulting to factual."}

        prompt = f"""
        You are the Intent Classification Engine for a Police AI. 
        Classify the user's query into exactly one of these four categories:
        1. 'factual_lookup': Asking for specific numbers, statuses, or filtering records (e.g., "How many FIRs in Mysuru?", "List charge sheeted cases").
        2. 'criminal_network': Asking about associates, gangs, bank accounts, or financial links (e.g., "Who are his associates?", "Trace the money").
        3. 'predictive_analytics': Asking about trends, hotspots, risk scores, or forecasting (e.g., "Show me crime hotspots", "Is there a spike in thefts?").
        4. 'narrative_rag': Asking to summarize a story, facts, or descriptions (e.g., "Summarize the white Innova theft", "What are the brief facts?").

        Recent Conversation History for Context:
        {chat_history}
        
        Current Query: "{query}"

        Respond ONLY with a valid JSON object matching this exact schema:
        {{"engine": "category_name", "reasoning": "Brief explanation of why"}}
        """

        try:
            response = self.groq_client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.3-70b-versatile",
                temperature=0,
                response_format={"type": "json_object"}
            )
            
            result = json.loads(response.choices[0].message.content)
            # Normalize just in case the LLM outputs a slight variation
            valid_engines = ["factual_lookup", "criminal_network", "predictive_analytics", "narrative_rag"]
            if result.get("engine") not in valid_engines:
                result["engine"] = "factual_lookup"
                
            return result

        except Exception as e:
            return {
                "engine": "factual_lookup", 
                "reasoning": f"LLM Routing failed, defaulting to factual. Error: {str(e)}"
            }