import os
import psycopg2
from google import genai
from google.genai import types # Add this import
from dotenv import load_dotenv

load_dotenv()

# Initialize the NEW Google GenAI client
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

def seed_database():
    print("Connecting to Neon Database...")
    conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
    cursor = conn.cursor()

    print("Initializing pgvector extension...")
    cursor.execute("CREATE EXTENSION IF NOT EXISTS vector;")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS CaseNarrativeEmbedding (
            CaseMasterID INT PRIMARY KEY,
            EmbeddingVector vector(768)
        );
    """)
    conn.commit()

    print("Fetching FIRs...")
    cursor.execute("""
        SELECT cm.CaseMasterID, cm.BriefFacts 
        FROM CaseMaster cm
        LEFT JOIN CaseNarrativeEmbedding cne ON cm.CaseMasterID = cne.CaseMasterID
        WHERE cne.CaseMasterID IS NULL AND cm.BriefFacts IS NOT NULL
        LIMIT 100;
    """)
    cases = cursor.fetchall()

    if not cases:
        print("All cases are already embedded!")
        return

    print(f"Embedding {len(cases)} cases using the new Gemini SDK...")
    for case_id, facts in cases:
        try:
            # New SDK syntax for embeddings
            # Use the new unified model and force it to 768 dimensions
            response = client.models.embed_content(
                model="gemini-embedding-001",
                contents=facts,
                config=types.EmbedContentConfig(output_dimensionality=768)
            )
            # Extract the actual float array
            embedding = response.embeddings[0].values

            cursor.execute(
                "INSERT INTO CaseNarrativeEmbedding (CaseMasterID, EmbeddingVector) VALUES (%s, %s)",
                (case_id, embedding)
            )
        except Exception as e:
            print(f"Error on Case {case_id}: {e}")

    conn.commit()
    cursor.close()
    conn.close()
    print("Vector seeding complete! Ready for Semantic Search.")

if __name__ == "__main__":
    seed_database()