import os
import json
from groq import Groq

class IntentRouter:
    def __init__(self):
        self.groq_client = Groq(api_key=os.getenv("GROQ_API_KEY")) if os.getenv("GROQ_API_KEY") else None

    def rewrite_to_standalone(self, query: str, history: list) -> str:
        """
        Condenses short chat history and a pronoun-heavy query into a 
        completely descriptive, self-contained question.
        """
        if not self.groq_client or not history:
            return query

        history_text = "\n".join([f"{h['role']}: {h['text']}" for h in history[-4:]])
        prompt = f"""
        You are a query-rewriting agent for a law enforcement dashboard.
        Given the short conversation history and a new message, rewrite the message into a 
        STANDALONE question containing all specific entities, names, or case parameters.
        Resolve pronouns (he, them, it, his, that case) using the history.

        CONVERSATION HISTORY:
        {history_text}
        
        NEW MESSAGE: 
        "{query}"

        Output ONLY the raw rewritten question. Do not provide notes or introductions.
        Standalone Question:
        """
        try:
            response = self.groq_client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.3-70b-versatile",
                temperature=0
            )
            return response.choices[0].message.content.strip()
        except Exception:
            return query

    def classify_intent(self, query: str) -> dict:
        """
        Classifies a standalone query into one of four core orchestration engines.
        """
        if not self.groq_client:
            return {"engine": "factual_lookup", "reasoning": "Fallback mode active."}

        prompt = f"""
        Analyze the incoming standalone investigator query and categorize it into EXACTLY one engine layer:
        1. 'factual_lookup': Filtering records, counting rows, dates, statuses (e.g., "List cases in Mysuru with status Closed").
        2. 'criminal_network': Exploring co-accused, syndicates, shared phone numbers, or money trails.
        3. 'predictive_analytics': Visualizing trends, hotspots, risk factor scores, or forecasting spikes.
        4. 'narrative_rag': Fuzzy semantic story searches over case summaries (e.g., "cases involving a stolen gold watch or breaking a rear window").

        Query: "{query}"

        Respond ONLY with a valid JSON object matching this schema:
        {{"engine": "category_name", "reasoning": "Brief justification"}}
        """
        try:
            response = self.groq_client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.3-70b-versatile",
                temperature=0,
                response_format={"type": "json_object"}
            )
            result = json.loads(response.choices[0].message.content)
            valid_engines = ["factual_lookup", "criminal_network", "predictive_analytics", "narrative_rag"]
            if result.get("engine") not in valid_engines:
                result["engine"] = "factual_lookup"
            return result
        except Exception as e:
            return {"engine": "factual_lookup", "reasoning": f"Default fallback. Error: {str(e)}"}