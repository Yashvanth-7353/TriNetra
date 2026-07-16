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

    def _build_filters(self, district_id=None, time_window=None, category_id=None):
        conditions = []
        params = []
        if district_id:
            conditions.append("u.DistrictID = %s")
            params.append(district_id)
        if category_id:
            conditions.append("cm.CaseCategoryID = %s")
            params.append(category_id)
        if time_window:
            if len(time_window) == 7 and "-" in time_window:
                conditions.append("TO_CHAR(cm.CrimeRegisteredDate, 'YYYY-MM') = %s")
                params.append(time_window)
            elif time_window == "3m":
                conditions.append("cm.CrimeRegisteredDate >= NOW() - INTERVAL '3 months'")
            elif time_window == "6m":
                conditions.append("cm.CrimeRegisteredDate >= NOW() - INTERVAL '6 months'")
            elif time_window == "12m":
                conditions.append("cm.CrimeRegisteredDate >= NOW() - INTERVAL '12 months'")
        return conditions, params

    def get_analytics_summary(self, district_id=None, time_window=None, category_id=None) -> dict:
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            
            conditions, params = self._build_filters(district_id, time_window, category_id)
            where_clause = " AND ".join(conditions) if conditions else "1=1"
            
            # 1. Total cases
            cur.execute(f"""
                SELECT COUNT(*) 
                FROM CaseMaster cm 
                JOIN Unit u ON cm.PoliceStationID = u.UnitID 
                WHERE {where_clause}
            """, params)
            total_cases = cur.fetchone()[0]
            
            # 2. Solved cases (status IN (3,4,5,6,7,8))
            solved_conditions = list(conditions) + ["cm.CaseStatusID IN (3,4,5,6,7,8)"]
            solved_where = " AND ".join(solved_conditions)
            cur.execute(f"""
                SELECT COUNT(*) 
                FROM CaseMaster cm 
                JOIN Unit u ON cm.PoliceStationID = u.UnitID 
                WHERE {solved_where}
            """, params)
            solved_cases = cur.fetchone()[0]
            solved_pct = round((solved_cases / total_cases * 100), 1) if total_cases > 0 else 0.0
            
            # 3. Highest Activity District
            cur.execute(f"""
                SELECT d.DistrictName, COUNT(*) as c
                FROM CaseMaster cm
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                JOIN District d ON u.DistrictID = d.DistrictID
                WHERE {where_clause}
                GROUP BY d.DistrictName
                ORDER BY c DESC
                LIMIT 1
            """, params)
            act_row = cur.fetchone()
            highest_district = f"{act_row[0]} ({act_row[1]})" if act_row else "N/A"
            
            # 4. Biggest MoM Change (or latest MoM change)
            cur.execute(f"""
                SELECT TO_CHAR(cm.CrimeRegisteredDate, 'YYYY-MM') as month, COUNT(*) as c
                FROM CaseMaster cm
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                WHERE {where_clause} AND cm.CrimeRegisteredDate IS NOT NULL
                GROUP BY month
                ORDER BY month DESC
                LIMIT 2
            """, params)
            mom_rows = cur.fetchall()
            mom_change = "0.0%"
            if len(mom_rows) == 2:
                latest_count = mom_rows[0][1]
                prev_count = mom_rows[1][1]
                if prev_count > 0:
                    change = ((latest_count - prev_count) / prev_count) * 100
                    prefix = "+" if change >= 0 else ""
                    mom_change = f"{prefix}{round(change, 1)}%"
            
            cur.close()
            conn.close()
            
            return {
                "total_cases": total_cases,
                "solved_percentage": solved_pct,
                "highest_activity_district": highest_district,
                "biggest_mom_change": mom_change
            }
        except Exception as e:
            return {"error": str(e)}

    def get_analytics_hotspots(self, district_id=None, time_window=None, category_id=None) -> dict:
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            
            conditions, params = self._build_filters(district_id, time_window, category_id)
            conditions.append("cm.latitude IS NOT NULL AND cm.longitude IS NOT NULL")
            where_clause = " AND ".join(conditions)
            
            cur.execute(f"""
                SELECT cm.latitude, cm.longitude, ch.CrimeGroupName as category, cm.CrimeNo, cm.BriefFacts
                FROM CaseMaster cm
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
                WHERE {where_clause}
                LIMIT 500
            """, params)
            rows = cur.fetchall()
            
            hotspots = []
            for r in rows:
                hotspots.append({
                    "lat": float(r[0]),
                    "lng": float(r[1]),
                    "category": r[2] or "Unknown",
                    "crime_no": r[3],
                    "brief_facts": r[4][:120] + "..." if r[4] else ""
                })
                
            cur.close()
            conn.close()
            return {"hotspots": hotspots}
        except Exception as e:
            return {"error": str(e)}

    def get_analytics_trends(self, district_id=None, time_window=None, category_id=None) -> dict:
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            
            conditions, params = self._build_filters(district_id, time_window, category_id)
            where_clause = " AND ".join(conditions) if conditions else "1=1"
            
            cur.execute(f"""
                SELECT TO_CHAR(cm.CrimeRegisteredDate, 'YYYY-MM') as month, COUNT(*) as case_count
                FROM CaseMaster cm
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                WHERE {where_clause} AND cm.CrimeRegisteredDate IS NOT NULL
                GROUP BY month
                ORDER BY month ASC
                LIMIT 18
            """, params)
            rows = cur.fetchall()
            
            cur.execute(f"""
                SELECT TO_CHAR(cm.CrimeRegisteredDate, 'YYYY-MM') as month, cc.LookupValue as category, COUNT(*) as c
                FROM CaseMaster cm
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                JOIN CaseCategory cc ON cm.CaseCategoryID = cc.CaseCategoryID
                WHERE {where_clause} AND cm.CrimeRegisteredDate IS NOT NULL
                GROUP BY month, category
                ORDER BY month ASC
            """, params)
            cat_rows = cur.fetchall()
            
            cur.close()
            conn.close()
            
            trend_data = [{"month": r[0], "count": r[1]} for r in rows]
            
            category_breakdown = {}
            for r in cat_rows:
                m, cat, cnt = r[0], r[1], r[2]
                if m not in category_breakdown:
                    category_breakdown[m] = {}
                category_breakdown[m][cat] = cnt
                
            return {
                "trend_data": trend_data,
                "category_breakdown": category_breakdown
            }
        except Exception as e:
            return {"error": str(e)}

    def get_offenders(self, search=None, limit=50, offset=0) -> dict:
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            
            conditions = []
            params = []
            if search:
                conditions.append("(a.AccusedName ILIKE %s OR CAST(ors.AccusedMasterID AS TEXT) ILIKE %s)")
                params.extend([f"%{search}%", f"%{search}%"])
            
            where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""
            
            count_sql = f"""
                SELECT COUNT(*)
                FROM OffenderRiskScore ors
                JOIN Accused a ON ors.AccusedMasterID = a.AccusedMasterID
                {where_clause}
            """
            cur.execute(count_sql, params)
            total = cur.fetchone()[0]
            
            data_sql = f"""
                SELECT 
                    ors.AccusedMasterID, 
                    a.AccusedName,
                    ors.RiskScore,
                    ors.RepeatOffenderFlag,
                    ors.TopFactors,
                    ors.LastComputedDate
                FROM OffenderRiskScore ors
                JOIN Accused a ON ors.AccusedMasterID = a.AccusedMasterID
                {where_clause}
                ORDER BY ors.RiskScore DESC, ors.AccusedMasterID ASC
                LIMIT %s OFFSET %s
            """
            cur.execute(data_sql, params + [limit, offset])
            rows = cur.fetchall()
            
            offenders = []
            for r in rows:
                factors = r[4]
                if isinstance(factors, str):
                    try:
                        factors = json.loads(factors)
                    except:
                        factors = {}
                
                offenders.append({
                    "accused_id": r[0],
                    "name": r[1],
                    "score": float(r[2]),
                    "repeat_offender": bool(r[3]),
                    "factors": factors,
                    "computed_date": str(r[5])
                })
                
            cur.close()
            conn.close()
            
            return {
                "offenders": offenders,
                "total": total
            }
        except Exception as e:
            return {"error": str(e)}