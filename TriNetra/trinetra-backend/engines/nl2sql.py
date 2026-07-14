import os
import re
import psycopg2
from groq import Groq

class NL2SQLEngine:
    def __init__(self):
        self.allowed_tables = {
            "casemaster", "district", "casestatusmaster", 
            "casecategory", "gravityoffence", "court", "unit"
        }
        self.db_url = os.getenv("NEON_DATABASE_URL")
        # Initialize Groq Client
        self.groq_client = Groq(api_key=os.getenv("GROQ_API_KEY")) if os.getenv("GROQ_API_KEY") else None

    def _get_schema_context(self) -> str:
        return """
        SCHEMA:
        - CaseMaster: CaseMasterID (PK), CrimeNo, PoliceStationID (FK to Unit), CaseStatusID (FK to CaseStatusMaster)
        - Unit: UnitID (PK), UnitName, DistrictID (FK to District)
        - District: DistrictID (PK), DistrictName
        - CaseStatusMaster: CaseStatusID (PK), CaseStatusName
        
        JOIN PATHS:
        - To filter by District: Join CaseMaster -> Unit -> District
        - To filter by Status: Join CaseMaster -> CaseStatusMaster
        """

    def generate_sql(self, user_query: str) -> str:
        if not self.groq_client:
            return "SELECT 'API_KEY_MISSING' AS error;"

        prompt = f"""
        You are a highly secure database analyst for the Karnataka Police FIR system.
        Convert the user's question into a standard PostgreSQL query based ONLY on this schema:

        {self._get_schema_context()}

        Rules:
        1. Respond ONLY with raw executable PostgreSQL code.
        2. Do NOT wrap code in markdown code blocks like ```sql.
        3. Only generate SELECT statements.
        4. Use ILIKE for text matching.

        User Question: {user_query}
        """
        
        try:
            # Updated to the current, active Llama 3.3 model
            chat_completion = self.groq_client.chat.completions.create(
                messages=[
                    {"role": "system", "content": "You output only raw SQL code."},
                    {"role": "user", "content": prompt}
                ],
                model="llama-3.3-70b-versatile", 
                temperature=0, 
            )
            
            sql = chat_completion.choices[0].message.content.strip()
            sql = sql.replace("```sql", "").replace("```", "").strip()
            return sql
            
        except Exception as e:
            # Safely escape single quotes in the error message so it doesn't break SQL syntax
            safe_error = str(e).replace("'", "''")
            return f"SELECT 'LLM_ERROR' AS error_code, '{safe_error}' AS message;"

    def validate_and_execute(self, sql_query: str) -> dict:
        # 1. Enforcement Guardrails
        clean_query = sql_query.lower()
        if not clean_query.strip().startswith("select"):
            return {"error": "Security Blocked: Only SELECT queries are permitted."}

        table_tokens = re.findall(r'from\s+([a-zA-Z_0-9]+)|join\s+([a-zA-Z_0-9]+)', clean_query)
        extracted_tables = {t for tup in table_tokens for t in tup if t}

        for table in extracted_tables:
            if table not in self.allowed_tables:
                return {"error": f"Security Blocked: Execution unauthorized on target table '{table}'."}

        # 2. Execution Tier
        if not self.db_url:
            return {"error": "Database configuration error: NEON_DATABASE_URL missing."}

        try:
            conn = psycopg2.connect(self.db_url)
            cursor = conn.cursor()
            cursor.execute(sql_query)
            
            columns = [desc[0] for desc in cursor.description]
            rows = cursor.fetchall()
            
            cursor.close()
            conn.close()
            
            return {
                "columns": columns,
                "rows": [dict(zip(columns, row)) for row in rows]
            }
        except Exception as e:
            return {"error": f"Database Execution Failure: {str(e)}"}