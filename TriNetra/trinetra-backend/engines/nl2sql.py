import os
import re
import json
import psycopg2
from groq import Groq


def _norm_sql(text: str) -> str:
    """Whitespace/case-insensitive comparison form for SQL fragments."""
    return re.sub(r"\s+", "", (text or "").lower())

class NL2SQLEngine:
    def __init__(self):
        # Explicit whitelist configuration parameters
        self.allowed_tables = {
            "casemaster", "district", "casestatusmaster",
            "casecategory", "gravityoffence", "court", "unit",
            "accused", "crimesubhead", "crimehead", "offenderriskscore",
        }
        self.db_url = os.getenv("NEON_DATABASE_URL")
        self.groq_client = Groq(api_key=os.getenv("GROQ_API_KEY")) if os.getenv("GROQ_API_KEY") else None

    def _get_schema_context(self) -> str:
        return """
        SCHEMA MAP:
        - CaseMaster: CaseMasterID (INT PK), CrimeNo (VARCHAR), PoliceStationID (INT FK to Unit), CaseStatusID (INT FK to CaseStatusMaster), CrimeRegisteredDate (DATE), BriefFacts (TEXT), CrimeMajorHeadID (INT FK to CrimeHead), CrimeMinorHeadID (INT FK to CrimeSubHead)
        - Unit: UnitID (INT PK), UnitName (VARCHAR), DistrictID (INT FK to District)
        - District: DistrictID (INT PK), DistrictName (VARCHAR)
        - CaseStatusMaster: CaseStatusID (INT PK), CaseStatusName (VARCHAR) -> e.g., 'Under Investigation', 'Charge Sheeted', 'Closed'
        - Accused: AccusedMasterID (INT PK), CaseMasterID (INT FK to CaseMaster), AccusedName (VARCHAR), AgeYear (INT)
        - OffenderRiskScore: AccusedMasterID (INT PK, FK to Accused), RiskScore (NUMERIC 0-100), RepeatOffenderFlag (BOOLEAN)
        - CrimeSubHead: CrimeSubHeadID (INT PK), CrimeHeadID (INT FK to CrimeHead), CrimeHeadName (VARCHAR) -> e.g., 'Murder', 'Robbery', 'Burglary', 'Motor Vehicle Theft'
        - CrimeHead: CrimeHeadID (INT PK), CrimeGroupName (VARCHAR)
        
        JOIN INSTRUCTIONS:
        - To filter by District name, query path requires: CaseMaster -> Unit -> District
        - To filter by Case Status value, query path requires: CaseMaster -> CaseStatusMaster
        - To filter by Crime Sub-Head name, query path requires: CaseMaster -> CrimeSubHead (cm.CrimeMinorHeadID = h.CrimeSubHeadID)
        - To find the case an accused belongs to: SELECT cm.CaseMasterID, cm.CrimeNo FROM Accused a JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID WHERE a.AccusedMasterID = <id>
        - To find an accused risk score: SELECT a.AccusedMasterID, a.AccusedName, ors.RiskScore FROM Accused a JOIN OffenderRiskScore ors ON a.AccusedMasterID = ors.AccusedMasterID WHERE a.AccusedMasterID = <id>
        """

    def _get_few_shot_examples(self) -> str:
        return """
        EXAMPLES:
        Q: "How many cases are there in Mysuru?"
        SQL: SELECT COUNT(cm.CaseMasterID) FROM CaseMaster cm JOIN Unit u ON cm.PoliceStationID = u.UnitID JOIN District d ON u.DistrictID = d.DistrictID WHERE d.DistrictName ILIKE 'Mysuru';

        Q: "List cases in Bengaluru Urban with status Charge Sheeted"
        SQL: SELECT cm.CaseMasterID, cm.CrimeNo, cm.CrimeRegisteredDate FROM CaseMaster cm JOIN Unit u ON cm.PoliceStationID = u.UnitID JOIN District d ON u.DistrictID = d.DistrictID JOIN CaseStatusMaster csm ON cm.CaseStatusID = csm.CaseStatusID WHERE d.DistrictName ILIKE 'Bengaluru Urban' AND csm.CaseStatusName ILIKE 'Charge Sheeted';
        """

    # Update the signature to accept the rbac_filter
    def generate_sql(self, user_query: str, rbac_filter: str = "1=1", error_context: str = None) -> str:
        if not self.groq_client:
            return "SELECT 'CONFIG_ERROR';"

        repair_prompt = f"\nPREVIOUS ERROR: {error_context}\nFix the query architecture." if error_context else ""

        prompt = f"""
        You are a senior database engineer generating secure PostgreSQL SELECT queries.
        Target System Context:
        {self._get_schema_context()}
        
        MANDATORY SECURITY POLICY:
        You MUST include the following condition in your WHERE clause to enforce Row-Level Security:
        AND ({rbac_filter})
        
        Rules:
        1. Output ONLY a single, valid, raw executable PostgreSQL statement.
        2. Never modify records.
        3. Ensure the tables referenced in the security policy (cm, u, etc.) are properly JOINed.

        User Question: {user_query}
        SQL Query:
        """
        # ... rest of the generate_sql execution remains the same
        response = self.groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="openai/gpt-oss-120b",
            temperature=0
        )
        sql = response.choices[0].message.content.strip()
        return sql.replace("```sql", "").replace("```", "").strip()

    def validate_and_execute(self, sql_query: str, user_query: str,
                             rbac_filter: str = "1=1", retry_count: int = 0) -> dict:
        clean_query = sql_query.strip().lower()
        
        # Guardrail Tier 1: Multi-Statement Detection Block
        stripped_end = sql_query.strip().rstrip(';')
        if ';' in stripped_end or clean_query.count("select") > 1:
            return {"error": "Security Constraint Violation: Multi-statement execution sequences are rejected."}

        # Guardrail Tier 2: Read Operations Enforcement Check
        if not clean_query.startswith("select"):
            return {"error": "Security Constraint Violation: Only data read (SELECT) sequences are permitted."}

        # Guardrail Tier 3.5: Row-Level Security presence enforcement.
        # A restricted scope (Investigator/Supervisor) is only safe if the
        # generated query literally carries the server-side RBAC condition.
        # An LLM that omits it must never be executed against the whole state:
        # regenerate once, then refuse rather than widen.
        if (rbac_filter or "").strip() not in ("", "1=1"):
            if _norm_sql(rbac_filter) not in _norm_sql(sql_query):
                if retry_count < 1:
                    recompiled_sql = self.generate_sql(
                        user_query,
                        rbac_filter=rbac_filter,
                        error_context=(
                            "MISSING MANDATORY ROW-LEVEL SECURITY CONDITION "
                            f"({rbac_filter.strip()}). Include it verbatim in the WHERE clause."
                        ),
                    )
                    return self.validate_and_execute(
                        recompiled_sql, user_query,
                        rbac_filter=rbac_filter, retry_count=retry_count + 1,
                    )
                return {
                    "error": (
                        "Security Constraint Violation: Row-level security condition "
                        "missing from the generated query."
                    )
                }

        # Guardrail Tier 4: Enforce Cap Limits Safeguard
        # Strip EXTRACT(...) functions to prevent 'from cm.date' being parsed as a table 'cm'
        query_for_parsing = re.sub(r'extract\s*\([^)]+from[^)]+\)', '', clean_query)
        table_tokens = re.findall(r'\bfrom\s+([a-zA-Z_0-9]+)|\bjoin\s+([a-zA-Z_0-9]+)', query_for_parsing)
        extracted_tables = {t for tup in table_tokens for t in tup if t}

        for table in extracted_tables:
            if table not in self.allowed_tables:
                return {"error": f"Security Constraint Violation: Target table domain target '{table}' outside access control boundaries."}

        # Guardrail Tier 4: Enforce Cap Limits Safeguard
        if "limit" not in clean_query:
            sql_query = sql_query.rstrip(';') + " LIMIT 200;"

        if not self.db_url:
            return {"error": "Database Configuration Failure: Access token mismatch parameters."}

        # Execution Engine with Automatic Self-Repair Loop Loop Trace
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
                "rows": [dict(zip(columns, row)) for row in rows],
                "executed_sql": sql_query
            }
        except Exception as db_exception:
            # Self-Correction Step Trigger Logic Condition Check.
            # The RBAC filter is carried into the retry so a scoped query can
            # never be regenerated as a state-wide fallback.
            if retry_count < 1:
                recompiled_sql = self.generate_sql(
                    user_query, rbac_filter=rbac_filter,
                    error_context=str(db_exception),
                )
                return self.validate_and_execute(
                    recompiled_sql, user_query,
                    rbac_filter=rbac_filter, retry_count=retry_count + 1,
                )

            return {"error": f"Database Runtime Exception: {str(db_exception)}", "executed_sql": sql_query}