import psycopg2
import json
from collections import defaultdict
import datetime
import os

class PatternEngine:
    def __init__(self):
        self.db_url = os.getenv("NEON_DATABASE_URL")

    def get_emerging_patterns(self, rbac_filter: str = None):
        """Generates dynamic clusters by finding MO tags with recent surges.

        rbac_filter: optional server-generated row-level security condition
            (e.g. Investigator -> one station, Supervisor -> one district). When
            present it is ANDed into BOTH the cluster aggregation and the
            per-cluster case listing, so restricted roles only ever see clusters
            and supporting FIRs inside their own jurisdiction.
        """
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()

            scope_cond = ""
            if rbac_filter and rbac_filter.strip() not in ("", "1=1") \
                    and ";" not in rbac_filter and "--" not in rbac_filter:
                scope_cond = f" AND ({rbac_filter})"

            # Find the top 15 surging MO tags in the last 90 days
            cur.execute(f"""
                SELECT 
                    mo.MOTagID, 
                    t.MOTagName, 
                    COUNT(mo.CaseMasterID) as case_count, 
                    MIN(cm.CrimeRegisteredDate) as start_date, 
                    MAX(cm.CrimeRegisteredDate) as end_date
                FROM ModusOperandi mo
                JOIN MOTagMaster t ON mo.MOTagID = t.MOTagID
                JOIN CaseMaster cm ON mo.CaseMasterID = cm.CaseMasterID
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                WHERE cm.CrimeRegisteredDate >= NOW() - INTERVAL '90 days'{scope_cond}
                GROUP BY mo.MOTagID, t.MOTagName
                HAVING COUNT(mo.CaseMasterID) >= 2
                ORDER BY case_count DESC
                LIMIT 15
            """)
            clusters_raw = cur.fetchall()
            
            patterns = []
            for r in clusters_raw:
                mo_tag_id = r[0]
                tag_name = r[1]
                count = r[2]
                start_date = r[3]
                end_date = r[4]
                
                # Get the actual cases for this cluster
                cur.execute(f"""
                    SELECT 
                        cm.CaseMasterID, 
                        cm.CrimeNo, 
                        cm.BriefFacts, 
                        cm.CrimeRegisteredDate, 
                        cm.latitude, 
                        cm.longitude, 
                        u.DistrictID, 
                        d.DistrictName
                    FROM CaseMaster cm
                    JOIN ModusOperandi mo ON cm.CaseMasterID = mo.CaseMasterID
                    JOIN Unit u ON cm.PoliceStationID = u.UnitID
                    JOIN District d ON u.DistrictID = d.DistrictID
                    WHERE mo.MOTagID = %s AND cm.CrimeRegisteredDate >= NOW() - INTERVAL '90 days'{scope_cond}
                    ORDER BY cm.CrimeRegisteredDate DESC
                """, (mo_tag_id,))
                cases_raw = cur.fetchall()
                
                cases = []
                districts = set()
                sparkline_map = defaultdict(int)
                
                for cr in cases_raw:
                    dt = cr[3]
                    if dt:
                        sparkline_map[dt.strftime("%Y-%W")] += 1
                        
                    districts.add(cr[7])
                    cases.append({
                        "case_id": cr[0],
                        "crime_no": cr[1],
                        "brief_facts": cr[2],
                        "date": dt.strftime('%Y-%m-%d') if dt else None,
                        "lat": float(cr[4]) if cr[4] else None,
                        "lng": float(cr[5]) if cr[5] else None,
                        "district": cr[7]
                    })
                
                # Sort sparkline chronologically
                sparkline = [{"time": k, "count": sparkline_map[k]} for k in sorted(sparkline_map.keys())]
                
                days_span = max((end_date - start_date).days, 1) if end_date and start_date else 1
                trigger_reason = f"{count} cases in {days_span} days sharing the '{tag_name}' Modus Operandi."
                
                patterns.append({
                    "cluster_id": f"PAT-MO-{mo_tag_id}",
                    "theme": f"\"{tag_name}\" Cluster",
                    "case_count": count,
                    "date_range": f"{start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}" if start_date and end_date else "Recent",
                    "districts": list(districts),
                    "trigger_reason": trigger_reason,
                    "sparkline": sparkline,
                    "cases": cases,
                    "mo_tags": [{"name": tag_name, "strength": "Primary"}]
                })
                
            cur.close()
            conn.close()
            return {"status": "success", "patterns": patterns}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    def get_scoped_patterns(self, crime_head_id=None, district_id=None, time_window=None,
                            rbac_filter: str = None):
        """
        Returns emerging MO-based patterns filtered by investigation scope.
        Unlike get_emerging_patterns() which returns ALL patterns,
        this method respects crime category, district, and time constraints.
        
        Args:
            crime_head_id: CrimeHeadID to filter by (e.g. 2 for Property Crimes, or a CrimeSubHeadID for specific type)
            district_id: DistrictID to filter by
            time_window: '3m', '6m', '12m', or None for default 90 days
            rbac_filter: optional server-generated row-level security condition
                (Investigator -> station, Supervisor -> district). ANDed into
                both the cluster aggregation and the case listing so supporting
                FIRs never escape the caller's jurisdiction.
        """
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()

            # Determine time interval
            interval = "90 days"
            if time_window == "3m":
                interval = "90 days"
            elif time_window == "6m":
                interval = "180 days"
            elif time_window == "12m":
                interval = "365 days"

            # Build WHERE conditions
            conditions = [f"cm.CrimeRegisteredDate >= NOW() - INTERVAL '{interval}'"]
            params = []

            if crime_head_id:
                # Support both CrimeHeadID (broad) and CrimeSubHeadID (specific)
                # CrimeSubHeadID 11 = Motor Vehicle Theft, CrimeHeadID 2 = Property Crimes
                # We check both to support broad and specific matching
                conditions.append("(cm.CrimeMajorHeadID = %s OR cm.CrimeMinorHeadID = %s)")
                params.extend([crime_head_id, crime_head_id])

            if district_id:
                conditions.append("u.DistrictID = %s")
                params.append(district_id)

            if rbac_filter and rbac_filter.strip() not in ("", "1=1") \
                    and ";" not in rbac_filter and "--" not in rbac_filter:
                conditions.append(f"({rbac_filter})")

            where_clause = " AND ".join(conditions)

            # Find MO tags matching the scoped criteria
            cur.execute(f"""
                SELECT 
                    mo.MOTagID, 
                    t.MOTagName, 
                    COUNT(mo.CaseMasterID) as case_count, 
                    MIN(cm.CrimeRegisteredDate) as start_date, 
                    MAX(cm.CrimeRegisteredDate) as end_date,
                    ch.CrimeGroupName,
                    csh.CrimeHeadName
                FROM ModusOperandi mo
                JOIN MOTagMaster t ON mo.MOTagID = t.MOTagID
                JOIN CaseMaster cm ON mo.CaseMasterID = cm.CaseMasterID
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
                LEFT JOIN CrimeSubHead csh ON cm.CrimeMinorHeadID = csh.CrimeSubHeadID
                WHERE {where_clause}
                GROUP BY mo.MOTagID, t.MOTagName, ch.CrimeGroupName, csh.CrimeHeadName
                HAVING COUNT(mo.CaseMasterID) >= 2
                ORDER BY case_count DESC
                LIMIT 15
            """, params)
            clusters_raw = cur.fetchall()

            patterns = []
            for r in clusters_raw:
                mo_tag_id = r[0]
                tag_name = r[1]
                count = r[2]
                start_date = r[3]
                end_date = r[4]
                crime_group = r[5]
                crime_sub = r[6]

                # Get the actual cases for this cluster
                case_conditions = [f"mo.MOTagID = %s", f"cm.CrimeRegisteredDate >= NOW() - INTERVAL '{interval}'"]
                case_params = [mo_tag_id]

                if district_id:
                    case_conditions.append("u.DistrictID = %s")
                    case_params.append(district_id)
                if crime_head_id:
                    case_conditions.append("(cm.CrimeMajorHeadID = %s OR cm.CrimeMinorHeadID = %s)")
                    case_params.extend([crime_head_id, crime_head_id])
                if rbac_filter and rbac_filter.strip() not in ("", "1=1") \
                        and ";" not in rbac_filter and "--" not in rbac_filter:
                    # Server-generated inline condition (hygiene-checked above);
                    # NOT a bind parameter.
                    case_conditions.append(f"({rbac_filter})")

                case_where = " AND ".join(case_conditions)
                cur.execute(f"""
                    SELECT 
                        cm.CaseMasterID, 
                        cm.CrimeNo, 
                        cm.BriefFacts, 
                        cm.CrimeRegisteredDate, 
                        cm.latitude, 
                        cm.longitude, 
                        u.DistrictID, 
                        d.DistrictName
                    FROM CaseMaster cm
                    JOIN ModusOperandi mo ON cm.CaseMasterID = mo.CaseMasterID
                    JOIN Unit u ON cm.PoliceStationID = u.UnitID
                    JOIN District d ON u.DistrictID = d.DistrictID
                    WHERE {case_where}
                    ORDER BY cm.CrimeRegisteredDate DESC
                """, case_params)
                cases_raw = cur.fetchall()

                cases = []
                districts = set()
                sparkline_map = defaultdict(int)

                for cr in cases_raw:
                    dt = cr[3]
                    if dt:
                        sparkline_map[dt.strftime("%Y-%W")] += 1
                    districts.add(cr[7])
                    cases.append({
                        "case_id": cr[0],
                        "crime_no": cr[1],
                        "brief_facts": cr[2],
                        "date": dt.strftime('%Y-%m-%d') if dt else None,
                        "lat": float(cr[4]) if cr[4] else None,
                        "lng": float(cr[5]) if cr[5] else None,
                        "district": cr[7]
                    })

                sparkline = [{"time": k, "count": sparkline_map[k]} for k in sorted(sparkline_map.keys())]
                days_span = max((end_date - start_date).days, 1) if end_date and start_date else 1

                # Build scope-aware theme
                scope_parts = []
                if crime_sub:
                    scope_parts.append(crime_sub)
                elif crime_group:
                    scope_parts.append(crime_group)
                theme = f"\"{tag_name}\" Cluster"
                if scope_parts:
                    theme = f"\"{tag_name}\" {scope_parts[0]} Cluster"

                trigger_reason = f"{count} cases in {days_span} days sharing the '{tag_name}' Modus Operandi."
                if crime_sub:
                    trigger_reason = f"{count} {crime_sub.lower()} cases in {days_span} days sharing the '{tag_name}' Modus Operandi."

                patterns.append({
                    "cluster_id": f"PAT-MO-{mo_tag_id}",
                    "theme": theme,
                    "case_count": count,
                    "date_range": f"{start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}" if start_date and end_date else "Recent",
                    "districts": list(districts),
                    "trigger_reason": trigger_reason,
                    "sparkline": sparkline,
                    "cases": cases,
                    "mo_tags": [{"name": tag_name, "strength": "Primary"}],
                    "crime_head": crime_group,
                    "crime_sub_head": crime_sub,
                })

            cur.close()
            conn.close()
            return {"status": "success", "patterns": patterns}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    def find_similar_cases(self, case_id, k=10, rbac_filter: str = None):
        """
        Similar-case search anchored on one case.

        rbac_filter: optional server-generated row-level security condition.
        When present (restricted role) it is applied to the anchor lookup AND
        to every candidate source (MO overlap, narrative similarity, detail
        fetch), so a caller can only ever see similar records that also sit
        inside their own jurisdiction -- similarity search can never become a
        cross-jurisdiction side channel.
        """
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()

            scope_cond = ""
            if rbac_filter and rbac_filter.strip() not in ("", "1=1") \
                    and ";" not in rbac_filter and "--" not in rbac_filter:
                scope_cond = f" AND ({rbac_filter})"
            # 1. Target Case Details (RBAC-scoped: out-of-jurisdiction anchors
            # resolve as "not found" so no similarity result is ever produced)
            cur.execute(f"""
                SELECT cm.latitude, cm.longitude, cm.CrimeRegisteredDate
                FROM CaseMaster cm
                WHERE cm.CaseMasterID = %s{scope_cond}
            """, (case_id,))
            target = cur.fetchone()
            if not target:
                return {"status": "success", "similar_cases": [], "anchor_in_scope": False}
            
            t_lat, t_lng, t_date = target
            
            # 2. MO Overlap Matches (candidate restricted to caller jurisdiction)
            cur.execute(f"""
                SELECT mo2.CaseMasterID, COUNT(*) as shared_mo
                FROM ModusOperandi mo1
                JOIN ModusOperandi mo2 ON mo1.MOTagID = mo2.MOTagID
                JOIN CaseMaster cm ON mo2.CaseMasterID = cm.CaseMasterID
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                WHERE mo1.CaseMasterID = %s AND mo2.CaseMasterID != %s{scope_cond}
                GROUP BY mo2.CaseMasterID
                HAVING COUNT(*) > 0
            """, (case_id, case_id))
            mo_matches = {r[0]: r[1] for r in cur.fetchall()}
            
            # 3. Narrative Similarity matches (Try pgvector) -- candidate
            # embeddings restricted to the caller's jurisdiction as well.
            narrative_matches = {}
            try:
                cur.execute(f"""
                SELECT e2.CaseMasterID, 1 - (e1.EmbeddingVector <=> e2.EmbeddingVector) as sim
                FROM CaseNarrativeEmbedding e1, CaseNarrativeEmbedding e2
                JOIN CaseMaster cm ON e2.CaseMasterID = cm.CaseMasterID
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                WHERE e1.CaseMasterID = %s AND e2.CaseMasterID != %s{scope_cond}
                    ORDER BY e1.EmbeddingVector <=> e2.EmbeddingVector LIMIT 50
                """, (case_id, case_id))
                narrative_matches = {r[0]: float(r[1]) for r in cur.fetchall()}
            except Exception as pg_err:
                conn.rollback() # Ignore if pgvector is missing
                print(f"pgvector skipped: {pg_err}")
                
            # Combine all candidate cases
            candidate_ids = set(mo_matches.keys()).union(set(narrative_matches.keys()))
            if not candidate_ids:
                return {"status": "success", "similar_cases": []}
                
            # 4. Fetch details for all candidates (jurisdiction-scoped)
            id_list = tuple(candidate_ids)
            cur.execute(f"""
                SELECT cm.CaseMasterID, cm.CrimeNo, cm.BriefFacts, cm.latitude,
                       cm.longitude, cm.CrimeRegisteredDate
                FROM CaseMaster cm
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                WHERE cm.CaseMasterID IN %s{scope_cond}
            """, (id_list,))
            
            results = []
            for cr in cur.fetchall():
                cid = cr[0]
                c_no = cr[1]
                c_facts = cr[2]
                c_lat = cr[3]
                c_lng = cr[4]
                c_date = cr[5]
                
                shared_mo = mo_matches.get(cid, 0)
                sim_score = narrative_matches.get(cid, 0)
                
                geo_dist = None
                if t_lat and t_lng and c_lat and c_lng:
                    # Simple Euclidean degree distance roughly converted to KM (1 deg ~ 111km)
                    geo_dist = ((float(t_lat) - float(c_lat))**2 + (float(t_lng) - float(c_lng))**2)**0.5 * 111.0
                    
                time_days = None
                if t_date and c_date:
                    time_days = abs((t_date - c_date).days)
                    
                # Calculate composite match score (0-100)
                score = 0
                explanations = []
                
                if sim_score > 0.6:
                    score += (sim_score * 40)
                    explanations.append(f"High narrative similarity ({int(sim_score*100)}%)")
                if shared_mo > 0:
                    score += min(shared_mo * 15, 30)
                    explanations.append(f"Shares {shared_mo} MO tags")
                if geo_dist is not None and geo_dist < 20:
                    score += 20 * (1 - geo_dist/20)
                    explanations.append(f"Occurred {geo_dist:.1f}km away")
                if time_days is not None and time_days < 30:
                    score += 10 * (1 - time_days/30)
                    explanations.append(f"Registered within {time_days} days")
                    
                if score > 0:
                    results.append({
                        "case_id": cid,
                        "crime_no": c_no,
                        "brief_facts": c_facts,
                        "match_score": min(score, 99),
                        "explanations": explanations
                    })
                    
            # Sort by highest score
            results.sort(key=lambda x: x["match_score"], reverse=True)
            
            cur.close()
            conn.close()
            return {"status": "success", "similar_cases": results[:k]}
            
        except Exception as e:
            return {"status": "error", "error": str(e)}

pattern_engine = PatternEngine()
