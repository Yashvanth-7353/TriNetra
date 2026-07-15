import os
import psycopg2
from psycopg2.extras import RealDictCursor


class CaseExplorerEngine:
    """Direct SQL engine for the Case Explorer — no LLM dependency, instant results."""

    def __init__(self):
        self.db_url = os.getenv("NEON_DATABASE_URL")

    def _get_conn(self):
        return psycopg2.connect(self.db_url)

    # ──────────────────────────────────────────────
    #  1. Filter Options (dropdowns)
    # ──────────────────────────────────────────────
    def get_filter_options(self) -> dict:
        """Returns all dropdown options for the filter bar."""
        try:
            conn = self._get_conn()
            cur = conn.cursor()

            cur.execute("SELECT DistrictID, DistrictName FROM District WHERE Active = true ORDER BY DistrictName;")
            districts = [{"id": r[0], "name": r[1]} for r in cur.fetchall()]

            cur.execute("SELECT CaseStatusID, CaseStatusName FROM CaseStatusMaster ORDER BY CaseStatusID;")
            statuses = [{"id": r[0], "name": r[1]} for r in cur.fetchall()]

            cur.execute("SELECT CaseCategoryID, LookupValue FROM CaseCategory ORDER BY CaseCategoryID;")
            categories = [{"id": r[0], "name": r[1]} for r in cur.fetchall()]

            cur.execute("SELECT CrimeHeadID, CrimeGroupName FROM CrimeHead WHERE Active = true ORDER BY CrimeHeadID;")
            crime_heads = [{"id": r[0], "name": r[1]} for r in cur.fetchall()]

            cur.close()
            conn.close()

            return {
                "districts": districts,
                "statuses": statuses,
                "categories": categories,
                "crime_heads": crime_heads,
            }
        except Exception as e:
            return {"error": str(e)}

    # ──────────────────────────────────────────────
    #  2. Paginated Case Search
    # ──────────────────────────────────────────────
    def search_cases(
        self,
        district_id: int = None,
        status_id: int = None,
        category_id: int = None,
        crime_head_id: int = None,
        date_from: str = None,
        date_to: str = None,
        search_term: str = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict:
        """Paginated, filterable case search with JOINed display names."""
        try:
            conn = self._get_conn()
            cur = conn.cursor()

            # ── Build WHERE clauses dynamically ──
            conditions = []
            params = []

            if district_id:
                conditions.append("u.DistrictID = %s")
                params.append(district_id)
            if status_id:
                conditions.append("cm.CaseStatusID = %s")
                params.append(status_id)
            if category_id:
                conditions.append("cm.CaseCategoryID = %s")
                params.append(category_id)
            if crime_head_id:
                conditions.append("cm.CrimeMajorHeadID = %s")
                params.append(crime_head_id)
            if date_from:
                conditions.append("cm.CrimeRegisteredDate >= %s")
                params.append(date_from)
            if date_to:
                conditions.append("cm.CrimeRegisteredDate <= %s")
                params.append(date_to)
            if search_term:
                conditions.append("(cm.CrimeNo ILIKE %s OR cm.BriefFacts ILIKE %s)")
                like_term = f"%{search_term}%"
                params.extend([like_term, like_term])

            where_clause = " AND ".join(conditions) if conditions else "1=1"

            # ── Count query (for pagination) ──
            count_sql = f"""
                SELECT COUNT(*)
                FROM CaseMaster cm
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                WHERE {where_clause}
            """
            cur.execute(count_sql, params)
            total_count = cur.fetchone()[0]

            # ── Data query with pagination ──
            offset = (page - 1) * page_size
            data_sql = f"""
                SELECT
                    cm.CaseMasterID,
                    cm.CrimeNo,
                    cm.CaseNo,
                    cm.CrimeRegisteredDate,
                    d.DistrictName,
                    u.UnitName AS police_station,
                    csm.CaseStatusName,
                    csm.CaseStatusID,
                    cc.LookupValue AS category,
                    ch.CrimeGroupName AS crime_head,
                    csh.CrimeHeadName AS crime_sub_head,
                    go.LookupValue AS gravity
                FROM CaseMaster cm
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                LEFT JOIN District d ON u.DistrictID = d.DistrictID
                LEFT JOIN CaseStatusMaster csm ON cm.CaseStatusID = csm.CaseStatusID
                LEFT JOIN CaseCategory cc ON cm.CaseCategoryID = cc.CaseCategoryID
                LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
                LEFT JOIN CrimeSubHead csh ON cm.CrimeMinorHeadID = csh.CrimeSubHeadID
                LEFT JOIN GravityOffence go ON cm.GravityOffenceID = go.GravityOffenceID
                WHERE {where_clause}
                ORDER BY cm.CrimeRegisteredDate DESC, cm.CaseMasterID DESC
                LIMIT %s OFFSET %s
            """
            cur.execute(data_sql, params + [page_size, offset])
            columns = [desc[0] for desc in cur.description]
            rows = [dict(zip(columns, row)) for row in cur.fetchall()]

            # Serialize dates
            for row in rows:
                if row.get("crimeregistereddate"):
                    row["crimeregistereddate"] = str(row["crimeregistereddate"])

            cur.close()
            conn.close()

            total_pages = max(1, (total_count + page_size - 1) // page_size)

            return {
                "cases": rows,
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total_count": total_count,
                    "total_pages": total_pages,
                },
            }
        except Exception as e:
            return {"error": str(e)}

    # ──────────────────────────────────────────────
    #  3. Full Case Detail
    # ──────────────────────────────────────────────
    def get_case_detail(self, case_master_id: int) -> dict:
        """Returns complete case information for the detail drawer."""
        try:
            conn = self._get_conn()
            cur = conn.cursor()

            # ── Core case info ──
            cur.execute("""
                SELECT
                    cm.CaseMasterID,
                    cm.CrimeNo,
                    cm.CaseNo,
                    cm.CrimeRegisteredDate,
                    cm.IncidentFromDate,
                    cm.IncidentToDate,
                    cm.InfoReceivedPSDate,
                    cm.Latitude,
                    cm.Longitude,
                    cm.BriefFacts,
                    d.DistrictName,
                    u.UnitName AS police_station,
                    csm.CaseStatusName,
                    csm.CaseStatusID,
                    cc.LookupValue AS category,
                    ch.CrimeGroupName AS crime_head,
                    csh.CrimeHeadName AS crime_sub_head,
                    go.LookupValue AS gravity,
                    ct.CourtName
                FROM CaseMaster cm
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                LEFT JOIN District d ON u.DistrictID = d.DistrictID
                LEFT JOIN CaseStatusMaster csm ON cm.CaseStatusID = csm.CaseStatusID
                LEFT JOIN CaseCategory cc ON cm.CaseCategoryID = cc.CaseCategoryID
                LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
                LEFT JOIN CrimeSubHead csh ON cm.CrimeMinorHeadID = csh.CrimeSubHeadID
                LEFT JOIN GravityOffence go ON cm.GravityOffenceID = go.GravityOffenceID
                LEFT JOIN Court ct ON cm.CourtID = ct.CourtID
                WHERE cm.CaseMasterID = %s
            """, (case_master_id,))

            row = cur.fetchone()
            if not row:
                cur.close()
                conn.close()
                return {"error": f"Case {case_master_id} not found."}

            columns = [desc[0] for desc in cur.description]
            case_info = dict(zip(columns, row))

            # Serialize dates/decimals
            for key in case_info:
                val = case_info[key]
                if val is not None and not isinstance(val, (str, int, float, bool)):
                    case_info[key] = str(val)

            # ── Status History Timeline ──
            cur.execute("""
                SELECT
                    csh.HistoryID,
                    csm.CaseStatusName,
                    csh.ChangeDate,
                    csh.Remarks,
                    e.FirstName AS changed_by
                FROM CaseStatusHistory csh
                LEFT JOIN CaseStatusMaster csm ON csh.CaseStatusID = csm.CaseStatusID
                LEFT JOIN Employee e ON csh.ChangedByEmployeeID = e.EmployeeID
                WHERE csh.CaseMasterID = %s
                ORDER BY csh.ChangeDate ASC
            """, (case_master_id,))
            status_history = []
            for r in cur.fetchall():
                status_history.append({
                    "id": r[0],
                    "status": r[1],
                    "date": str(r[2]) if r[2] else None,
                    "remarks": r[3],
                    "changed_by": r[4],
                })

            # ── Accused ──
            cur.execute("""
                SELECT AccusedMasterID, AccusedName, AgeYear, GenderID, PersonID
                FROM Accused
                WHERE CaseMasterID = %s
                ORDER BY AccusedMasterID
            """, (case_master_id,))
            accused = []
            for r in cur.fetchall():
                accused.append({
                    "id": r[0],
                    "name": r[1],
                    "age": r[2],
                    "gender_id": r[3],
                    "person_id": r[4],
                })

            # ── Victims ──
            cur.execute("""
                SELECT VictimMasterID, VictimName, AgeYear, GenderID, VictimPolice
                FROM Victim
                WHERE CaseMasterID = %s
                ORDER BY VictimMasterID
            """, (case_master_id,))
            victims = []
            for r in cur.fetchall():
                victims.append({
                    "id": r[0],
                    "name": r[1],
                    "age": r[2],
                    "gender_id": r[3],
                    "is_police": bool(r[4]) if r[4] is not None else False,
                })

            # ── Complainants ──
            cur.execute("""
                SELECT cd.ComplainantID, cd.ComplainantName, cd.AgeYear, cd.GenderID,
                       om.OccupationName AS occupation
                FROM ComplainantDetails cd
                LEFT JOIN OccupationMaster om ON cd.OccupationID = om.OccupationID
                WHERE cd.CaseMasterID = %s
                ORDER BY cd.ComplainantID
            """, (case_master_id,))
            complainants = []
            for r in cur.fetchall():
                complainants.append({
                    "id": r[0],
                    "name": r[1],
                    "age": r[2],
                    "gender_id": r[3],
                    "occupation": r[4],
                })

            # ── Chargesheet ──
            cur.execute("""
                SELECT cs.CSID, cs.CSDate, cs.CSType,
                       e.FirstName AS filed_by
                FROM ChargeSheetDetails cs
                LEFT JOIN Employee e ON cs.PolicePersonID = e.EmployeeID
                WHERE cs.CaseMasterID = %s
                ORDER BY cs.CSDate
            """, (case_master_id,))
            chargesheets = []
            for r in cur.fetchall():
                chargesheets.append({
                    "id": r[0],
                    "date": str(r[1]) if r[1] else None,
                    "type": r[2],
                    "filed_by": r[3],
                })

            # ── Arrests / Surrenders ──
            cur.execute("""
                SELECT
                    ars.ArrestSurrenderID,
                    ars.ArrestSurrenderDate,
                    ars.ArrestSurrenderTypeID,
                    a.AccusedName,
                    d.DistrictName AS arrest_district,
                    u.UnitName AS arrest_station
                FROM ArrestSurrender ars
                LEFT JOIN Accused a ON ars.AccusedMasterID = a.AccusedMasterID
                LEFT JOIN District d ON ars.ArrestSurrenderDistrictID = d.DistrictID
                LEFT JOIN Unit u ON ars.PoliceStationID = u.UnitID
                WHERE ars.CaseMasterID = %s
                ORDER BY ars.ArrestSurrenderDate
            """, (case_master_id,))
            arrests = []
            for r in cur.fetchall():
                arrests.append({
                    "id": r[0],
                    "date": str(r[1]) if r[1] else None,
                    "type": "Arrest" if r[2] == 1 else "Surrender",
                    "accused_name": r[3],
                    "district": r[4],
                    "station": r[5],
                })

            cur.close()
            conn.close()

            return {
                "case": case_info,
                "status_history": status_history,
                "accused": accused,
                "victims": victims,
                "complainants": complainants,
                "chargesheets": chargesheets,
                "arrests": arrests,
            }
        except Exception as e:
            return {"error": str(e)}
