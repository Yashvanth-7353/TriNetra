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
            
            # 5. Arrest Rate
            cur.execute(f"""
                SELECT COUNT(DISTINCT cm.CaseMasterID)
                FROM CaseMaster cm
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                JOIN ArrestSurrender a ON cm.CaseMasterID = a.CaseMasterID
                WHERE {where_clause}
            """, params)
            arrest_cases = cur.fetchone()[0]
            arrest_rate = round((arrest_cases / total_cases * 100), 1) if total_cases > 0 else 0.0

            # 6. Avg Days to Chargesheet
            cur.execute(f"""
                SELECT AVG(EXTRACT(EPOCH FROM (cd.csdate - cm.CrimeRegisteredDate))/86400.0)
                FROM CaseMaster cm
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                JOIN ChargesheetDetails cd ON cm.CaseMasterID = cd.CaseMasterID
                WHERE {where_clause} AND cd.csdate IS NOT NULL AND cm.CrimeRegisteredDate IS NOT NULL
            """, params)
            avg_days_row = cur.fetchone()
            avg_days = round(float(avg_days_row[0]), 1) if avg_days_row and avg_days_row[0] else 0.0
            
            cur.close()
            conn.close()
            
            return {
                "total_cases": total_cases,
                "solved_percentage": solved_pct,
                "highest_activity_district": highest_district,
                "biggest_mom_change": mom_change,
                "arrest_rate": arrest_rate,
                "avg_days_to_chargesheet": avg_days
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

    def get_prevention_alerts(self, district_id: int) -> dict:
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            
            # Get District Name
            cur.execute("SELECT DistrictName FROM District WHERE DistrictID = %s", (district_id,))
            dist_row = cur.fetchone()
            district_name = dist_row[0] if dist_row else f"District #{district_id}"
            
            alerts = []
            alert_id = 1
            
            # 1. Sudden Spike Analysis (Last 4 weeks vs previous 24 weeks baseline)
            cur.execute("""
                WITH recent_counts AS (
                    SELECT 
                        cm.CaseCategoryID,
                        cc.LookupValue AS category_name,
                        COUNT(*) AS recent_count
                    FROM CaseMaster cm
                    JOIN Unit u ON cm.PoliceStationID = u.UnitID
                    JOIN CaseCategory cc ON cm.CaseCategoryID = cc.CaseCategoryID
                    WHERE u.DistrictID = %s
                      AND cm.CrimeRegisteredDate >= NOW() - INTERVAL '4 weeks'
                    GROUP BY cm.CaseCategoryID, category_name
                ),
                baseline_counts AS (
                    SELECT 
                        cm.CaseCategoryID,
                        COUNT(*) AS baseline_total_count
                    FROM CaseMaster cm
                    JOIN Unit u ON cm.PoliceStationID = u.UnitID
                    WHERE u.DistrictID = %s
                      AND cm.CrimeRegisteredDate BETWEEN NOW() - INTERVAL '28 weeks' AND NOW() - INTERVAL '4 weeks'
                    GROUP BY cm.CaseCategoryID
                )
                SELECT 
                    rc.CaseCategoryID,
                    rc.category_name,
                    rc.recent_count,
                    COALESCE(bc.baseline_total_count, 0) as baseline_total
                FROM recent_counts rc
                LEFT JOIN baseline_counts bc ON rc.CaseCategoryID = bc.CaseCategoryID
                ORDER BY rc.recent_count DESC
            """, (district_id, district_id))
            
            spike_rows = cur.fetchall()
            
            for r in spike_rows:
                cat_id, cat_name, recent, baseline_total = r[0], r[1], r[2], r[3]
                baseline_avg = max(1.0, baseline_total / 6.0) # 24 weeks = 6 blocks of 4 weeks
                ratio = recent / baseline_avg
                
                if recent >= 2 and ratio >= 1.5:
                    # Fetch sparkline trend (last 6 months)
                    cur.execute("""
                        SELECT TO_CHAR(cm.CrimeRegisteredDate, 'YYYY-MM') as month, COUNT(*) as c
                        FROM CaseMaster cm
                        JOIN Unit u ON cm.PoliceStationID = u.UnitID
                        WHERE u.DistrictID = %s AND cm.CaseCategoryID = %s
                          AND cm.CrimeRegisteredDate >= NOW() - INTERVAL '6 months'
                        GROUP BY month
                        ORDER BY month ASC
                    """, (district_id, cat_id))
                    trend_rows = cur.fetchall()
                    spark_data = [{"v": tr[1]} for tr in trend_rows]
                    if not spark_data:
                        spark_data = [{"v": 1}, {"v": recent}]
                        
                    severity = "high" if ratio >= 2.5 else "medium"
                    
                    alerts.append({
                        "id": alert_id,
                        "district": district_name,
                        "category": cat_name,
                        "reason": f"Sudden Rise: {recent} cases in last 4 weeks, {ratio:.1f}x higher than baseline.",
                        "severity": severity,
                        "data": spark_data
                    })
                    alert_id += 1

            # 2. Historical Seasonal Analysis (Current month vs historical average for the same month)
            cur.execute("""
                WITH current_month_cases AS (
                    SELECT 
                        cm.CaseCategoryID,
                        cc.LookupValue AS category_name,
                        COUNT(*) AS curr_count
                    FROM CaseMaster cm
                    JOIN Unit u ON cm.PoliceStationID = u.UnitID
                    JOIN CaseCategory cc ON cm.CaseCategoryID = cc.CaseCategoryID
                    WHERE u.DistrictID = %s
                      AND EXTRACT(MONTH FROM cm.CrimeRegisteredDate) = EXTRACT(MONTH FROM NOW())
                      AND EXTRACT(YEAR FROM cm.CrimeRegisteredDate) = EXTRACT(YEAR FROM NOW())
                    GROUP BY cm.CaseCategoryID, category_name
                ),
                historical_month_cases AS (
                    SELECT 
                        cm.CaseCategoryID,
                        COUNT(*) AS hist_count,
                        COUNT(DISTINCT EXTRACT(YEAR FROM cm.CrimeRegisteredDate)) as years_count
                    FROM CaseMaster cm
                    JOIN Unit u ON cm.PoliceStationID = u.UnitID
                    WHERE u.DistrictID = %s
                      AND EXTRACT(MONTH FROM cm.CrimeRegisteredDate) = EXTRACT(MONTH FROM NOW())
                      AND EXTRACT(YEAR FROM cm.CrimeRegisteredDate) < EXTRACT(YEAR FROM NOW())
                    GROUP BY cm.CaseCategoryID
                )
                SELECT 
                    cmc.CaseCategoryID,
                    cmc.category_name,
                    cmc.curr_count,
                    COALESCE(hmc.hist_count, 0) as hist_count,
                    COALESCE(hmc.years_count, 1) as years_count
                FROM current_month_cases cmc
                LEFT JOIN historical_month_cases hmc ON cmc.CaseCategoryID = hmc.CaseCategoryID
                ORDER BY cmc.curr_count DESC
            """, (district_id, district_id))

            seasonal_rows = cur.fetchall()

            for r in seasonal_rows:
                cat_id, cat_name, curr_count, hist_count, years_count = r[0], r[1], r[2], r[3], max(1, r[4])
                hist_avg = hist_count / years_count
                
                # Only add if we don't already have a sudden spike alert for this category
                if not any(a["category"] == cat_name for a in alerts):
                    if curr_count >= 2 and hist_avg >= 1.0 and (curr_count / hist_avg) >= 1.3:
                        ratio = curr_count / hist_avg
                        # Generate sparkline
                        cur.execute("""
                            SELECT TO_CHAR(cm.CrimeRegisteredDate, 'YYYY-MM') as month, COUNT(*) as c
                            FROM CaseMaster cm
                            JOIN Unit u ON cm.PoliceStationID = u.UnitID
                            WHERE u.DistrictID = %s AND cm.CaseCategoryID = %s
                              AND cm.CrimeRegisteredDate >= NOW() - INTERVAL '6 months'
                            GROUP BY month
                            ORDER BY month ASC
                        """, (district_id, cat_id))
                        trend_rows = cur.fetchall()
                        spark_data = [{"v": tr[1]} for tr in trend_rows]
                        if not spark_data:
                            spark_data = [{"v": hist_avg}, {"v": curr_count}]
                            
                        alerts.append({
                            "id": alert_id,
                            "district": district_name,
                            "category": cat_name,
                            "reason": f"Historical Pattern: Matches trends from previous years ({ratio:.1f}x historical average for this month).",
                            "severity": "medium",
                            "data": spark_data
                        })
                        alert_id += 1

            # Fallback alerts if database yields none (to keep UI premium and match user expectations)
            if not alerts:
                # Calculate overall cases this month (last 30 days) vs last month (30 to 60 days ago)
                cur.execute("""
                    SELECT 
                        COUNT(CASE WHEN cm.CrimeRegisteredDate >= NOW() - INTERVAL '30 days' THEN 1 END) as this_month,
                        COUNT(CASE WHEN cm.CrimeRegisteredDate BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days' THEN 1 END) as last_month
                    FROM CaseMaster cm
                    JOIN Unit u ON cm.PoliceStationID = u.UnitID
                    WHERE u.DistrictID = %s
                """, (district_id,))
                overall_row = cur.fetchone()
                this_month_cnt = overall_row[0] if overall_row else 0
                last_month_cnt = overall_row[1] if overall_row else 0
                
                if this_month_cnt > last_month_cnt:
                    diff = this_month_cnt - last_month_cnt
                    pct = round((diff / max(1, last_month_cnt)) * 100, 1)
                    alerts.append({
                        "id": alert_id,
                        "district": district_name,
                        "category": "Overall Volume",
                        "reason": f"Overall crime volume increased by {diff} cases (+{pct}%) compared to last month.",
                        "severity": "medium",
                        "data": [{"v": last_month_cnt}, {"v": this_month_cnt}]
                    })
                else:
                    # If overall cases are less, find category-specific rises
                    cur.execute("""
                        WITH cat_this_month AS (
                            SELECT cm.CaseCategoryID, cc.LookupValue as category_name, COUNT(*) as cnt
                            FROM CaseMaster cm
                            JOIN Unit u ON cm.PoliceStationID = u.UnitID
                            JOIN CaseCategory cc ON cm.CaseCategoryID = cc.CaseCategoryID
                            WHERE u.DistrictID = %s AND cm.CrimeRegisteredDate >= NOW() - INTERVAL '30 days'
                            GROUP BY cm.CaseCategoryID, category_name
                        ),
                        cat_last_month AS (
                            SELECT cm.CaseCategoryID, COUNT(*) as cnt
                            FROM CaseMaster cm
                            JOIN Unit u ON cm.PoliceStationID = u.UnitID
                            WHERE u.DistrictID = %s AND cm.CrimeRegisteredDate BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days'
                            GROUP BY cm.CaseCategoryID
                        )
                        SELECT 
                            tm.category_name,
                            tm.cnt as this_cnt,
                            COALESCE(lm.cnt, 0) as last_cnt
                        FROM cat_this_month tm
                        LEFT JOIN cat_last_month lm ON tm.CaseCategoryID = lm.CaseCategoryID
                        WHERE tm.cnt > COALESCE(lm.cnt, 0)
                        ORDER BY (tm.cnt - COALESCE(lm.cnt, 0)) DESC
                    """, (district_id, district_id))
                    
                    category_rises = cur.fetchall()
                    for r in category_rises:
                        cat_name, this_cnt, last_cnt = r[0], r[1], r[2]
                        diff = this_cnt - last_cnt
                        pct = round((diff / max(1, last_cnt)) * 100, 1)
                        alerts.append({
                            "id": alert_id,
                            "district": district_name,
                            "category": cat_name,
                            "reason": f"Category Rise: Cases rose from {last_cnt} to {this_cnt} (+{pct}%) compared to last month.",
                            "severity": "medium",
                            "data": [{"v": last_cnt}, {"v": this_cnt}]
                        })
                        alert_id += 1
                
            cur.close()
            conn.close()
            return {"alerts": alerts}
        except Exception as e:
            return {"error": str(e)}

    def get_analytics_geographic(self, district_id=None, time_window=None, category_id=None) -> dict:
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            
            conditions, params = self._build_filters(district_id, time_window, category_id)
            where_clause = " AND ".join(conditions) if conditions else "1=1"
            
            # Hotspot Grid (Strict real coordinates only)
            cur.execute(f"""
                SELECT 
                    cm.latitude as lat, 
                    cm.longitude as lng, 
                    cm.CrimeNo, 
                    COALESCE(cm.BriefFacts, cc.LookupValue) as detail
                FROM CaseMaster cm
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                JOIN CaseCategory cc ON cm.CaseCategoryID = cc.CaseCategoryID
                WHERE {where_clause} AND cm.latitude IS NOT NULL AND cm.longitude IS NOT NULL
                LIMIT 150
            """, params)
            
            grid_rows = cur.fetchall()
            grid_data = [{"lat": float(r[0]), "lng": float(r[1]), "crime_no": r[2], "brief_facts": r[3], "count": 1, "trend": "stable"} for r in grid_rows]
            
            # District Ranking with MoM Sparkline
            cur.execute(f"""
                WITH district_cases AS (
                    SELECT u.DistrictID, d.DistrictName, COUNT(*) as total_cases
                    FROM CaseMaster cm
                    JOIN Unit u ON cm.PoliceStationID = u.UnitID
                    JOIN District d ON u.DistrictID = d.DistrictID
                    WHERE {where_clause}
                    GROUP BY u.DistrictID, d.DistrictName
                ),
                monthly_cases AS (
                    SELECT u.DistrictID, TO_CHAR(cm.CrimeRegisteredDate, 'YYYY-MM') as month, COUNT(*) as m_count
                    FROM CaseMaster cm
                    JOIN Unit u ON cm.PoliceStationID = u.UnitID
                    WHERE cm.CrimeRegisteredDate >= NOW() - INTERVAL '6 months'
                    GROUP BY u.DistrictID, month
                )
                SELECT dc.DistrictID, dc.DistrictName, dc.total_cases, mc.month, mc.m_count
                FROM district_cases dc
                LEFT JOIN monthly_cases mc ON dc.DistrictID = mc.DistrictID
                ORDER BY dc.total_cases DESC, mc.month ASC
            """)
            rank_rows = cur.fetchall()
            
            district_map = {}
            for r in rank_rows:
                did, dname, tot, m, mcnt = r[0], r[1], r[2], r[3], r[4]
                if did not in district_map:
                    district_map[did] = {"id": did, "name": dname, "total": tot, "sparkline": []}
                if m:
                    district_map[did]["sparkline"].append({"month": m, "count": mcnt})
            
            rankings = list(district_map.values())
            
            cur.close()
            conn.close()
            return {"grid": grid_data, "rankings": rankings}
        except Exception as e:
            return {"error": str(e)}

    def get_analytics_trends_advanced(self, district_id=None, category_id=None) -> dict:
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            
            conditions, params = self._build_filters(district_id, None, category_id)
            where_clause = " AND ".join(conditions) if conditions else "1=1"
            
            # YoY Comparison (Grouped by Year and Category)
            cur.execute(f"""
                SELECT EXTRACT(YEAR FROM cm.CrimeRegisteredDate) as yr, cc.LookupValue as category, COUNT(*) as c
                FROM CaseMaster cm
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                JOIN CaseCategory cc ON cm.CaseCategoryID = cc.CaseCategoryID
                WHERE {where_clause} AND cm.CrimeRegisteredDate IS NOT NULL 
                  AND EXTRACT(YEAR FROM cm.CrimeRegisteredDate) IN (2024, 2025, 2026)
                GROUP BY yr, category
                ORDER BY yr ASC
            """, params)
            yoy_rows = cur.fetchall()
            yoy_data = [{"year": int(r[0]), "category": r[1], "count": r[2]} for r in yoy_rows]
            
            # Overall Monthly Trend (Replacing Anomaly)
            cur.execute(f"""
                SELECT TO_CHAR(cm.CrimeRegisteredDate, 'YYYY-MM') as month, COUNT(*) as c
                FROM CaseMaster cm
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                WHERE {where_clause}
                GROUP BY month
                ORDER BY month ASC
                LIMIT 12
            """, params)
            trend_rows = cur.fetchall()
            monthly_trend = [{"month": r[0], "count": r[1]} for r in trend_rows]
            
            cur.close()
            conn.close()
            return {"yoy": yoy_data, "monthly_trend": monthly_trend}
        except Exception as e:
            return {"error": str(e)}

    def get_analytics_categorical(self, district_id=None, time_window=None) -> dict:
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            conditions, params = self._build_filters(district_id, time_window, None)
            where_clause = " AND ".join(conditions) if conditions else "1=1"
            
            # Crime Head (Donut)
            cur.execute(f"""
                SELECT ch.CrimeGroupName, COUNT(*) as c
                FROM CaseMaster cm
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
                WHERE {where_clause}
                GROUP BY ch.CrimeGroupName
                ORDER BY c DESC
            """, params)
            head_data = [{"name": r[0], "value": r[1]} for r in cur.fetchall()]
            
            # Gravity Split
            cur.execute(f"""
                SELECT g.LookupValue, COUNT(*) as c
                FROM CaseMaster cm
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                JOIN GravityOffence g ON cm.GravityOffenceID = g.GravityOffenceID
                WHERE {where_clause}
                GROUP BY g.LookupValue
            """, params)
            gravity_data = [{"name": r[0], "value": r[1]} for r in cur.fetchall()]
            
            # Top MO Tags
            cur.execute(f"""
                SELECT tm.MOTagName, COUNT(*) as c
                FROM ModusOperandi mo
                JOIN CaseMaster cm ON mo.CaseMasterID = cm.CaseMasterID
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                JOIN MOTagMaster tm ON mo.MOTagID = tm.MOTagID
                WHERE {where_clause}
                GROUP BY tm.MOTagName
                ORDER BY c DESC
                LIMIT 10
            """, params)
            mo_data = [{"name": r[0], "count": r[1]} for r in cur.fetchall()]
            
            cur.close()
            conn.close()
            return {"heads": head_data, "gravity": gravity_data, "mo_tags": mo_data}
        except Exception as e:
            return {"error": str(e)}

    def get_analytics_lifecycle(self, district_id=None, time_window=None) -> dict:
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            conditions, params = self._build_filters(district_id, time_window, None)
            where_clause = " AND ".join(conditions) if conditions else "1=1"
            
            # Status Funnel
            cur.execute(f"""
                SELECT cs.CaseStatusName, COUNT(*) as c
                FROM CaseMaster cm
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                JOIN CaseStatusMaster cs ON cm.CaseStatusID = cs.CaseStatusID
                WHERE {where_clause}
                GROUP BY cs.CaseStatusName
            """, params)
            funnel_data = [{"name": r[0], "value": r[1]} for r in cur.fetchall()]
            
            # Chargesheet Outcomes
            cur.execute(f"""
                SELECT cd.cstype, COUNT(*) as c
                FROM ChargesheetDetails cd
                JOIN CaseMaster cm ON cd.CaseMasterID = cm.CaseMasterID
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                WHERE {where_clause} AND cd.cstype IS NOT NULL
                GROUP BY cd.cstype
            """, params)
            cs_data = [{"name": f"Type {r[0]}", "value": r[1]} for r in cur.fetchall()]
            
            cur.close()
            conn.close()
            return {"funnel": funnel_data, "chargesheets": cs_data}
        except Exception as e:
            return {"error": str(e)}

    def get_analytics_reporting_lag(self, district_id=None, time_window=None, category_id=None) -> dict:
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            conditions, params = self._build_filters(district_id, time_window, category_id)
            where_clause = " AND ".join(conditions) if conditions else "1=1"
            
            cur.execute(f"""
                SELECT
                  CASE 
                    WHEN EXTRACT(DAY FROM (cm.CrimeRegisteredDate - cm.IncidentFromDate)) <= 1 THEN '0-24 Hours'
                    WHEN EXTRACT(DAY FROM (cm.CrimeRegisteredDate - cm.IncidentFromDate)) <= 7 THEN '1-7 Days'
                    WHEN EXTRACT(DAY FROM (cm.CrimeRegisteredDate - cm.IncidentFromDate)) <= 30 THEN '8-30 Days'
                    ELSE '30+ Days'
                  END as lag_bucket,
                  COUNT(*) as c
                FROM CaseMaster cm
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                WHERE cm.IncidentFromDate IS NOT NULL AND cm.CrimeRegisteredDate IS NOT NULL AND cm.CrimeRegisteredDate >= cm.IncidentFromDate AND {where_clause}
                GROUP BY lag_bucket
            """, params)
            lag_data = [{"bucket": r[0], "count": r[1]} for r in cur.fetchall()]
            
            # Sort buckets logically
            sort_order = {"0-24 Hours": 1, "1-7 Days": 2, "8-30 Days": 3, "30+ Days": 4}
            lag_data = sorted(lag_data, key=lambda x: sort_order.get(x["bucket"], 5))
            
            cur.close()
            conn.close()
            return {"lag": lag_data}
        except Exception as e:
            return {"error": str(e)}

    def get_analytics_demographics(self, district_id=None, time_window=None) -> dict:
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            conditions, params = self._build_filters(district_id, time_window, None)
            where_clause = " AND ".join(conditions) if conditions else "1=1"
            
            # Victims: Age Band & Gender
            cur.execute(f"""
                SELECT 
                    CASE 
                        WHEN v.AgeYear < 18 THEN '<18'
                        WHEN v.AgeYear BETWEEN 18 AND 30 THEN '18-30'
                        WHEN v.AgeYear BETWEEN 31 AND 50 THEN '31-50'
                        ELSE '50+' 
                    END as age_band,
                    v.GenderID,
                    COUNT(*) as c
                FROM Victim v
                JOIN CaseMaster cm ON v.CaseMasterID = cm.CaseMasterID
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                WHERE {where_clause} AND v.AgeYear IS NOT NULL
                GROUP BY age_band, v.GenderID
            """, params)
            victim_rows = cur.fetchall()
            
            # Apply n>=10 threshold logic
            victim_data = []
            for r in victim_rows:
                gender = "Male" if r[1] == 1 else "Female" if r[1] == 2 else "Other"
                count = r[2]
                if count < 10:
                    gender = "Redacted (n<10)"
                victim_data.append({"age_band": r[0], "gender": gender, "count": count})
                
            cur.close()
            conn.close()
            return {"victims": victim_data}
        except Exception as e:
            return {"error": str(e)}