import os
import psycopg2
import google.generativeai as genai
from groq import Groq

class RAGEngine:
    def __init__(self):
        self.db_url = os.getenv("NEON_DATABASE_URL")
        self.groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

    def search_and_summarize(self, query: str, context_history: str = "") -> dict:
        try:
            # 1. Embed the search query
            combined_query = f"{context_history} \n {query}"
            query_vector = genai.embed_content(
                model="models/text-embedding-004",
                content=combined_query,
                task_type="retrieval_query"
            )['embedding']

            # 2. Perform Vector Similarity Search in Neon (Cosine Distance)
            conn = psycopg2.connect(self.db_url)
            cursor = conn.cursor()
            
            sql = """
                SELECT cm.CrimeNo, d.DistrictName, cm.BriefFacts, 
                       1 - (cne.EmbeddingVector <=> %s::vector) AS similarity
                FROM CaseNarrativeEmbedding cne
                JOIN CaseMaster cm ON cne.CaseMasterID = cm.CaseMasterID
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                JOIN District d ON u.DistrictID = d.DistrictID
                ORDER BY cne.EmbeddingVector <=> %s::vector
                LIMIT 3;
            """
            cursor.execute(sql, (query_vector, query_vector))
            results = cursor.fetchall()
            
            cursor.close()
            conn.close()

            if not results:
                return {"answer": "I couldn't find any relevant case narratives matching that description.", "citations": []}

            # 3. Format context for the LLM
            context_blocks = []
            citations = []
            for row in results:
                crime_no, district, facts, sim = row
                context_blocks.append(f"FIR {crime_no} ({district}): {facts}")
                citations.append(f"{crime_no}")
            
            full_context = "\n\n".join(context_blocks)

            # 4. Ask Groq to summarize the findings
            prompt = f"""
            You are a Police Intelligence Analyst. Based ONLY on the following FIR facts, answer the user's query.
            Be concise, objective, and professional. 

            Context FIRs:
            {full_context}

            User Query: {query}
            """

            chat_completion = self.groq_client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.3-70b-versatile",
                temperature=0.3,
            )
            
            return {
                "answer": chat_completion.choices[0].message.content.strip(),
                "citations": citations,
                "context_used": full_context
            }

        except Exception as e:
            return {"error": str(e)}