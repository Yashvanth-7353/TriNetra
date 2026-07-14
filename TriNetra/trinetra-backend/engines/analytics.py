import os
import psycopg2
import json

class AnalyticsEngine:
    def __init__(self):
        self.db_url = os.getenv("NEON_DATABASE_URL")

    def get_risk_profile(self, accused_id: int) -> dict:
        """Fetches the precomputed Offender Risk Score and contributing factors."""
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            cur.execute("""
                SELECT RiskScore, RepeatOffenderFlag, TopFactors, LastComputedDate
                FROM OffenderRiskScore 
                WHERE AccusedMasterID = %s
            """, (accused_id,))
            row = cur.fetchone()
            cur.close()
            conn.close()
            
            if not row:
                return {"error": f"No risk profile computed for Accused ID {accused_id}."}
                
            return {
                "score": float(row[0]),
                "repeat_offender": bool(row[1]),
                "factors": row[2], # Stored as a JSON string in DB
                "computed_date": str(row[3])
            }
        except Exception as e:
            return {"error": f"Database exception: {str(e)}"}

    def get_crime_trend(self) -> dict:
        """Aggregates FIRs by month to show the organizational crime trend."""
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            cur.execute("""
                SELECT TO_CHAR(CrimeRegisteredDate, 'YYYY-MM') as month, COUNT(*) as case_count
                FROM CaseMaster
                WHERE CrimeRegisteredDate IS NOT NULL
                GROUP BY month
                ORDER BY month ASC
                LIMIT 12;
            """)
            rows = cur.fetchall()
            cur.close()
            conn.close()
            
            data = [{"month": r[0], "count": r[1]} for r in rows]
            return {"trend_data": data}
        except Exception as e:
            return {"error": str(e)}