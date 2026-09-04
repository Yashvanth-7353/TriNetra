import os
import re

import psycopg2


def parse_rbac_scope(rbac_filter: str):
    """Parses a server-generated RBAC SQL fragment into structured jurisdiction.

    Mirrors build_rbac_filter: an Investigator filter pins one police station
    (``cm.PoliceStationID = <unit_id>``), a Supervisor filter pins one district
    (``u.DistrictID = <district_id>``), and Analyst/Policymaker filters are the
    literal ``1=1`` (no restriction). Used by engines that need a structured
    scope (e.g. accused-in-scope checks) instead of a raw SQL condition.

    Returns (unit_id, district_id): exactly one may be set for restricted
    roles; both None for state-wide access.
    """
    f = re.sub(r"\s+", " ", (rbac_filter or "")).strip()
    if not f or f == "1=1":
        return None, None
    m = re.search(r"cm\.PoliceStationID\s*=\s*(\d+)", f, re.IGNORECASE)
    if m:
        return int(m.group(1)), None
    m = re.search(r"u\.DistrictID\s*=\s*(\d+)", f, re.IGNORECASE)
    if m:
        return None, int(m.group(1))
    return None, None


class SecurityContext:
    def __init__(self):
        self.db_url = os.getenv("NEON_DATABASE_URL")

    def build_rbac_filter(self, role: str, employee_district_id: int, employee_unit_id: int) -> str:
        """Generates the mandatory SQL WHERE conditions based on police hierarchy."""
        if role == "Investigator":
            return f" cm.PoliceStationID = {employee_unit_id} "
        if role == "Supervisor":
            return f" u.DistrictID = {employee_district_id} "
        if role in ["Analyst", "Policymaker"]:
            return " 1=1 " # State-wide access
        
        return " 1=0 " # Fail-safe: block access if role is unrecognized

    def log_audit(self, employee_id: int, role: str, raw_query: str, engine: str, resolved_sql: str, row_count: int):
        """Fires an immutable record of the query execution to the database."""
        if not self.db_url:
            return
            
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO QueryAuditLog (EmployeeID, RoleUsed, NLQueryText, ResolvedEngine, ResolvedQuery, RowsReturned, QueryTimestamp)
                VALUES (%s, %s, %s, %s, %s, %s, now())
            """, (employee_id, role, raw_query, engine, resolved_sql, row_count))
            conn.commit()
            cur.close()
            conn.close()
        except Exception as e:
            print(f"CRITICAL WARNING: Audit Log Failure - {e}")