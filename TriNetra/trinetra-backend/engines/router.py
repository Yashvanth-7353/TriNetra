import re

class IntentRouter:
    def __init__(self):
        # Keyword mappings for simple heuristic routing (can be upgraded to NLP later)
        self.network_keywords = ["connected", "network", "link", "gang", "associate", "accomplice", "relationship"]
        self.analytics_keywords = ["trend", "forecast", "hotspot", "heatmap", "risk", "score", "predict"]
        self.financial_keywords = ["bank", "account", "transaction", "money", "rupees", "transfer"]
        
    def classify_intent(self, query: str) -> dict:
        """
        Classifies the user query into a specific execution engine.
        Returns the intent type and a preliminary reasoning trace.
        """
        query_lower = query.lower()
        
        # 1. Check for Financial / Money Trail Queries
        if any(kw in query_lower for kw in self.financial_keywords):
            return {
                "engine": "financial_graph",
                "confidence": 0.85,
                "reasoning": "Detected financial keywords indicating a transaction trace."
            }
            
        # 2. Check for Network / Relational Queries
        if any(kw in query_lower for kw in self.network_keywords):
            return {
                "engine": "criminal_network",
                "confidence": 0.90,
                "reasoning": "Detected relationship keywords indicating a graph traversal requirement."
            }
            
        # 3. Check for Analytics / Forecasting Queries
        if any(kw in query_lower for kw in self.analytics_keywords):
            return {
                "engine": "predictive_analytics",
                "confidence": 0.88,
                "reasoning": "Detected analytical keywords indicating a hotspot or risk assessment requirement."
            }
            
        # 4. Default to Narrative RAG / Factual Lookup
        return {
            "engine": "factual_rag",
            "confidence": 0.70,
            "reasoning": "No specific analytical keywords detected. Defaulting to vector semantic search over FIR BriefFacts."
        }