import os
import psycopg2
from google import genai
from google.genai import types
from groq import Groq

class RAGEngine:
    def __init__(self):
        self.db_url = os.getenv("NEON_DATABASE_URL")
        self.groq_client = Groq(api_key=os.getenv("GROQ_API_KEY")) if os.getenv("GROQ_API_KEY") else None
        self.gemini_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY")) if os.getenv("GEMINI_API_KEY") else None

    def search_and_summarize(self, standalone_query: str) -> dict:
        if not self.gemini_client or not self.groq_client:
            return {"answer": "RAG engine offline: Missing API credentials.", "citations": []}

        try:
            # 1. Compute 768-d Vector Embedding using correct new SDK properties
            embed_response = self.gemini_client.models.embed_content(
                model="gemini-embedding-001",
                contents=standalone_query,
                config=types.EmbedContentConfig(output_dimensionality=768)
            )
            query_vector = embed_response.embeddings[0].values

            # 2. Query Neon Database via Cosine Distance matching
            conn = psycopg2.connect(self.db_url)
            cursor = conn.cursor()
            
            sql = """
                SELECT cm.CrimeNo, d.DistrictName, cm.BriefFacts
                FROM CaseNarrativeEmbedding cne
                JOIN CaseMaster cm ON cne.CaseMasterID = cm.CaseMasterID
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                JOIN District d ON u.DistrictID = d.DistrictID
                ORDER BY cne.EmbeddingVector <=> %s::vector
                LIMIT 3;
            """
            cursor.execute(sql, (query_vector,))
            results = cursor.fetchall()
            cursor.close()
            conn.close()

            if not results:
                return {"answer": "No relevant crime patterns match that exact narrative description.", "citations": []}

            # 3. Format Context Records for RAG Synthesis
            context_blocks = []
            citations = []
            for row in results:
                crime_no, district, facts = row
                context_blocks.append(f"FIR [{crime_no}] (District: {district}): {facts}")
                citations.append(crime_no)
            
            full_context = "\n\n".join(context_blocks)

            # 4. Generate Structured Answer using Groq
            prompt = f"""
            You are a Police Intelligence Copilot analyzing criminal case narratives.
            Using ONLY the ground-truth FIR context records below, answer the user question.
            Be objective, precise, and state clearly if the facts are missing.

            GROUND-TRUTH CONTEXT NARRATIVES:
            {full_context}

            INVESTIGATOR QUESTION: 
            {standalone_query}
            """

            chat_completion = self.groq_client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.3-70b-versatile",
                temperature=0.0,
                seed=42
            )
            
            return {
                "answer": chat_completion.choices[0].message.content.strip(),
                "citations": citations
            }

        except Exception as e:
            return {"error": f"RAG System Runtime Error: {str(e)}"}