import psycopg2
import json
from collections import defaultdict
import datetime
import os

class PatternEngine:
    def __init__(self):
        self.db_url = os.getenv("NEON_DATABASE_URL")

    def get_emerging_patterns(self):
        """Generates dynamic clusters by finding MO tags with recent surges."""
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            
            # Find the top 15 surging MO tags in the last 90 days
            cur.execute("""
                SELECT 
                    mo.MOTagID, 
                    t.MOTagName, 
                    COUNT(mo.CaseMasterID) as case_count, 
                    MIN(cm.CrimeRegisteredDate) as start_date, 
                    MAX(cm.CrimeRegisteredDate) as end_date
                FROM ModusOperandi mo
                JOIN MOTagMaster t ON mo.MOTagID = t.MOTagID
                JOIN CaseMaster cm ON mo.CaseMasterID = cm.CaseMasterID
                WHERE cm.CrimeRegisteredDate >= NOW() - INTERVAL '90 days'
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
                cur.execute("""
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
                    WHERE mo.MOTagID = %s AND cm.CrimeRegisteredDate >= NOW() - INTERVAL '90 days'
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

    def find_similar_cases(self, case_id, k=10):
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            
            # 1. Target Case Details
            cur.execute("""
                SELECT latitude, longitude, CrimeRegisteredDate
                FROM CaseMaster
                WHERE CaseMasterID = %s
            """, (case_id,))
            target = cur.fetchone()
            if not target:
                return {"status": "error", "error": "Target case not found"}
            
            t_lat, t_lng, t_date = target
            
            # 2. MO Overlap Matches
            cur.execute("""
                SELECT mo2.CaseMasterID, COUNT(*) as shared_mo
                FROM ModusOperandi mo1
                JOIN ModusOperandi mo2 ON mo1.MOTagID = mo2.MOTagID
                WHERE mo1.CaseMasterID = %s AND mo2.CaseMasterID != %s
                GROUP BY mo2.CaseMasterID
                HAVING COUNT(*) > 0
            """, (case_id, case_id))
            mo_matches = {r[0]: r[1] for r in cur.fetchall()}
            
            # 3. Narrative Similarity matches (Try pgvector)
            narrative_matches = {}
            try:
                cur.execute("""
                    SELECT e2.CaseMasterID, 1 - (e1.EmbeddingVector <=> e2.EmbeddingVector) as sim
                    FROM CaseNarrativeEmbedding e1, CaseNarrativeEmbedding e2
                    WHERE e1.CaseMasterID = %s AND e2.CaseMasterID != %s
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
                
            # 4. Fetch details for all candidates to calculate Geo/Time proximity
            id_list = tuple(candidate_ids)
            cur.execute(f"""
                SELECT CaseMasterID, CrimeNo, BriefFacts, latitude, longitude, CrimeRegisteredDate
                FROM CaseMaster
                WHERE CaseMasterID IN %s
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
