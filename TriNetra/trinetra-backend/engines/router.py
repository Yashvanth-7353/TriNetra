import os
import json
from groq import Groq
import re  # Make sure 're' is imported at the top of router.py

from engines.intent_classifier import DeterministicIntentClassifier


# Canonical engine names used by the /api/chat endpoint. The deterministic
# classifier may produce intent labels outside this list (e.g. exact_case_lookup,
# pattern_detection, financial_analysis) — those are translated to the closest
# chat-routable engine here, or left for the multi-engine investigation path.
CHAT_ENGINE_MAP = {
    "exact_case_lookup": "exact_case_lookup",
    "case_search": "factual_lookup",
    "case_similarity": "case_similarity",
    "narrative_similarity": "narrative_rag",
    "pattern_detection": "pattern_detection",
    "trend_analysis": "trend_analysis",
    "criminal_network": "criminal_network",
    "financial_analysis": "financial_intelligence",
    "behaviour_analysis": "pattern_detection",
    "risk_analysis": "risk_profile",
    "forecasting": "forecasting",
    "evidence_graph": "criminal_network",
    "next_best_action": "next_best_action",
    "general_investigation": "investigation",
}


class IntentRouter:
    def __init__(self):
        self.groq_client = Groq(api_key=os.getenv("GROQ_API_KEY")) if os.getenv("GROQ_API_KEY") else None
        self.classifier = DeterministicIntentClassifier()

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
                model="openai/gpt-oss-120b",
                temperature=0
            )
            return response.choices[0].message.content.strip()
        except Exception:
            return query

    def classify_intent(self, query: str, investigation_context: dict = None) -> dict:
        """
        Classifies a standalone query into an engine layer.

        The DETERMINISTIC central routing policy runs first — it cannot be
        overridden by the LLM. When no deterministic rule matches, the LLM
        classifies into one of the six classic chat engines.

        Returns {"engine": str, "reasoning": str, "intent": str|None,
                 "requires_context": bool, "deterministic": bool}
        """
        det = self.classifier.classify(query, investigation_context=investigation_context)
        if det.get("matched"):
            engine = CHAT_ENGINE_MAP.get(det["intent"], "factual_lookup")
            return {
                "engine": engine,
                "reasoning": det.get("reasoning", "deterministic routing"),
                "intent": det["intent"],
                "requires_context": det.get("requires_context", False),
                "deterministic": True,
            }
        if not self.groq_client:
            return {
                "engine": "factual_lookup",
                "reasoning": "Fallback mode active.",
                "intent": "case_search",
                "requires_context": False,
                "deterministic": False,
            }

        prompt = f"""
        Analyze the incoming standalone investigator query and categorize it into EXACTLY one engine layer:
        1. 'factual_lookup': Filtering records, exact counts, dates, specific statuses, or specific years (e.g., "How many cases in 2025?", "List cases in Mysuru").
        2. 'criminal_network': Exploring co-accused, syndicates, or money trails.
        3. 'trend_analysis': Asking for a chart, graph, or visual timeline of crime rates over time (e.g., "Show me the crime trend", "Spike in thefts this year").
        4. 'risk_profile': Asking for the danger level, risk score, or profile of a specific criminal (e.g., "What is the risk score for Accused 80?").
        5. 'case_similarity': Explicitly asking to find similar cases, pattern matches, or comparing a specific case ID against others (e.g., "Find cases similar to CaseMasterID 2817", "digital arrest scams recently").
        6. 'narrative_rag': Fuzzy semantic story searches over case summaries (e.g., "online transaction near Mysuru").

        Query: "{query}"

        Respond ONLY with a valid JSON object matching this schema:
        {{"engine": "category_name", "reasoning": "Brief justification"}}
        """
        try:
            response = self.groq_client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="openai/gpt-oss-120b",
                temperature=0,
                response_format={"type": "json_object"}
            )
            result = json.loads(response.choices[0].message.content)
            valid_engines = ["factual_lookup", "criminal_network", "trend_analysis",
                             "risk_profile", "narrative_rag", "case_similarity"]
            if result.get("engine") not in valid_engines:
                result["engine"] = "factual_lookup"
            result["intent"] = None
            result["requires_context"] = False
            result["deterministic"] = False
            return result
        except Exception as e:
            return {
                "engine": "factual_lookup",
                "reasoning": f"Default fallback. Error: {str(e)}",
                "intent": None,
                "requires_context": False,
                "deterministic": False,
            }

    def extract_accused_id(self, query: str) -> int:
        """Extracts the Accused ID from a query to use as a graph traversal starting point."""
        if not self.groq_client:
            return 0

        prompt = f"""
        Extract the Accused ID (an integer) from the following investigator query.
        If no explicit ID is found, return 0.
        Output ONLY the raw integer. Do not output anything else.
        Query: "{query}"
        """
        try:
            response = self.groq_client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="openai/gpt-oss-120b",
                temperature=0
            )
            # Safely parse the first number found in the response
            match = re.search(r'\d+', response.choices[0].message.content)
            return int(match.group()) if match else 0
        except Exception:
            return 0