"""
Prevention Alerts Engine — deterministic, evidence-first early-warning analysis.

The engine answers one question per request:

    "What emerging crime risks should this jurisdiction be aware of right now?"

Everything is derived from the SAME authoritative CaseMaster records the rest of
TriNetra consumes. Alerts are only produced when the underlying records support
them:

    Database records
        -> deterministic aggregation (SQL, parameterised, jurisdiction-scoped)
        -> trend / geographic / modus-operandi / forecast evidence
        -> alert scoring + validation
        -> structured alerts  (no LLM in the decision path)

Jurisdiction is resolved SERVER-SIDE from the authenticated employee profile:
    - Investigator   -> single police station (unit)
    - Supervisor     -> own district
    - Analyst / Policymaker -> state-wide (or a district they explicitly pick)

Time windows are anchored dynamically on the newest record present in the
jurisdiction (never hard-coded), so the analysis remains meaningful even when
the dataset's date range differs from today's date.

When the evidence does not clear the deterministic floors the engine returns an
honest empty result ("no active alerts") together with what it reviewed —
it never invents alerts to make the UI look populated.
"""

import os
from datetime import date, timedelta

import psycopg2

# ── Deterministic evidence floors ──────────────────────────────────────────
# Every alert must clear these before it is emitted. Tune conservatively:
# a false negative (no alert) is preferred over a fabricated alert.
RECENT_WINDOW_DAYS = 30          # "last 30 days of data"
BASELINE_WINDOW_DAYS = 30        # each comparison window is also 30 days
MO_LOOKBACK_DAYS = 90            # recurring-modus-operandi look-back

RISE_MIN_RECENT = 4              # recent cases required (district / state scope)
RISE_RATIO_MIN = 1.8             # recent vs average 30-day baseline ratio
STATION_RISE_MIN_RECENT = 3      # recent cases required for a station scope
CLUSTER_MIN_RECENT = 3           # cases at one station / one crime sub-head
MO_MIN_CASES = 3                 # cases sharing one MO tag (90-day window)
MO_MIN_CASES_STATE = 5           # MO floor when the scope is the whole state
FORECAST_MIN_MONTHS = 12         # months needed before a forecast signal is used
MAX_ALERTS = 8                   # feed cap — keeps the response bounded
SUPPORTING_CASE_CAP = 15         # per-alert FIR list cap

# Severity bands for the transparent prevention-risk score.
HIGH_BAND = 45
MEDIUM_BAND = 24


class PreventionAlertsEngine:
    """Computes jurisdiction-scoped, evidence-grounded prevention alerts."""

    def __init__(self):
        self.db_url = os.getenv("NEON_DATABASE_URL")

    # ────────────────────────────────────────────────────────────
    #  Public entry point
    # ────────────────────────────────────────────────────────────
    def generate_alerts(
        self,
        role: str,
        employee_district_id=None,
        employee_unit_id=None,
        requested_district_id=None,
    ) -> dict:
        """
        Generates prevention alerts for the authenticated employee's scope.

        Args:
            role: 'Analyst' | 'Policymaker' | 'Supervisor' | 'Investigator'
            employee_district_id: from the JWT profile (never client-supplied)
            employee_unit_id: from the JWT profile (never client-supplied)
            requested_district_id: optional district the caller may *request*;
                honoured ONLY for state-wide roles.

        Returns a structured response with jurisdiction meta, the analysis
        performed and the validated alerts (possibly an honest empty list).
        """
        scope = self._resolve_scope(
            role=role,
            employee_district_id=employee_district_id,
            employee_unit_id=employee_unit_id,
            requested_district_id=requested_district_id,
        )
        if scope.get("status") != "ok":
            return scope  # {"status": "denied"|"error", "error": ...}

        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
        except Exception as exc:  # pragma: no cover - DB down path
            return {"status": "error", "error": f"Database connection failed: {exc}"}

        try:
            as_of = self._scope_as_of(cur, scope)
            if as_of is None:
                return self._empty_result(
                    scope,
                    message=(
                        "No crime records are registered in your jurisdiction, "
                        "so no prevention alerts can be derived yet."
                    ),
                    cases_reviewed=0,
                    categories_reviewed=0,
                    stations_reviewed=0,
                    insufficient_history=True,
                )

            windows = self._build_windows(as_of)
            overview = self._scope_overview(cur, scope, windows)
            if overview["cases_reviewed"] == 0:
                return self._empty_result(
                    scope,
                    message=(
                        "No crime records were registered in your jurisdiction "
                        "inside the analysed period."
                    ),
                    cases_reviewed=0,
                    categories_reviewed=overview["categories_reviewed"],
                    stations_reviewed=overview["stations_reviewed"],
                    insufficient_history=overview["insufficient_history"],
                    windows=windows,
                )

            # ── Analysis inputs (bounded aggregate queries) ──
            subhead_stats = self._subhead_window_stats(cur, scope, windows)
            station_stats = self._station_window_stats(cur, scope, windows)
            mo_tag_totals, mo_by_category = self._mo_tag_stats(cur, scope, windows)

            # ── Candidate alerts (deterministic rules only) ──
            rising = self._detect_rising_activity(
                cur, scope, windows, subhead_stats, station_stats, mo_by_category
            )
            clusters = self._detect_geo_clusters(
                cur, scope, windows, station_stats, subhead_stats,
                {a["crime_category"] for a in rising}, mo_by_category,
            )
            mo_alerts = self._detect_mo_alerts(
                cur, scope, windows, mo_tag_totals, mo_by_category,
                {a["crime_category"] for a in rising + clusters},
            )
            forecast_alert = self._detect_forecast_signal(scope, windows)
            forecast_note = None
            if forecast_alert and forecast_alert.get("skipped"):
                forecast_note = "Forecast-based alert skipped: " + forecast_alert["skipped"]
            elif forecast_alert:
                mo_alerts.append(forecast_alert)

            # ── Score, dedupe, order and cap ──
            alerts = self._dedupe(rising + clusters + mo_alerts)
            alerts.sort(key=lambda a: a["score"]["total"], reverse=True)
            alerts = alerts[:MAX_ALERTS]
            for i, alert in enumerate(alerts, start=1):
                alert["alert_id"] = "PA-{}-{:03d}".format(as_of.strftime("%Y%m%d"), i)

            message = None
            if not alerts:
                message = (
                    "No active prevention alerts. Current crime data does not "
                    "show a sufficiently strong emerging pattern within your "
                    "jurisdiction."
                )

            return {
                "status": "success",
                "jurisdiction": scope["jurisdiction"],
                "analysis": {
                    "as_of_date": as_of.isoformat(),
                    "data_recency_note": (
                        f"Newest crime record in the analysed scope is dated "
                        f"{as_of.isoformat()}. All windows are anchored to that "
                        "record so comparisons reflect the available data."
                    ),
                    "recent_window": windows["recent"]["label"],
                    "comparison_window": windows["prev"]["label"],
                    "mo_lookback_window": windows["mo"]["label"],
                    "cases_reviewed": overview["cases_reviewed"],
                    "recent_cases": overview["recent_cases"],
                    "comparison_cases": overview["comparison_cases"],
                    "crime_categories_reviewed": overview["categories_reviewed"],
                    "stations_reviewed": overview["stations_reviewed"],                "insufficient_history": overview["insufficient_history"],
                "history_note": (
                    "Insufficient historical data for a reliable comparison."
                    if overview["insufficient_history"]
                    else "Sufficient historical depth for comparison."
                ),
                "forecast_note": forecast_note,
            },
                "alerts": alerts,
                "message": message,
            }
        except Exception as exc:  # pragma: no cover - unexpected engine failure
            return {"status": "error", "error": f"Prevention alerts engine error: {exc}"}
        finally:
            try:
                cur.close()
                conn.close()
            except Exception:
                pass

    # ────────────────────────────────────────────────────────────
    #  Scope resolution (server-side only)
    # ────────────────────────────────────────────────────────────
    def _resolve_scope(self, role, employee_district_id, employee_unit_id,
                       requested_district_id) -> dict:
        role = (role or "").strip()

        if role in ("Analyst", "Policymaker"):
            if requested_district_id:
                district_name = self._district_name(requested_district_id)
                if not district_name:
                    return {"status": "error",
                            "error": "Requested district does not exist."}
                return {
                    "status": "ok", "scope_type": "district",
                    "district_id": requested_district_id, "unit_id": None,
                    "jurisdiction": {
                        "role": role, "scope": "district",
                        "district_id": requested_district_id,
                        "district_name": district_name,
                        "label": f"{district_name} district",
                        "scope_note": (
                            "State-wide role viewing a single district "
                            "(Analyst/Policymaker policy)."
                        ),
                    },
                }
            return {
                "status": "ok", "scope_type": "state",
                "district_id": None, "unit_id": None,
                "jurisdiction": {
                    "role": role, "scope": "state",
                    "district_id": None, "district_name": "Karnataka",
                    "unit_id": None, "unit_name": None,
                    "label": "All Karnataka (state-wide)",
                    "scope_note": "State-wide role with no district restriction.",
                },
            }

        if role == "Supervisor":
            if not employee_district_id:
                return {
                    "status": "denied",
                    "error": "Supervisor profile has no district assigned; cannot scope prevention alerts.",
                }
            district_name = (
                self._district_name(employee_district_id)
                or f"District {employee_district_id}"
            )
            return {
                "status": "ok", "scope_type": "district",
                "district_id": employee_district_id, "unit_id": None,
                "jurisdiction": {
                    "role": role, "scope": "district",
                    "district_id": employee_district_id,
                    "district_name": district_name,
                    "label": f"{district_name} district",
                    "scope_note": (
                        "Supervisor policy — district-scoped access enforced "
                        "server-side; a district parameter cannot widen this scope."
                    ),
                },
            }

        if role == "Investigator":
            if not employee_unit_id:
                return {
                    "status": "denied",
                    "error": "Investigator profile has no station (unit) assigned; cannot scope prevention alerts.",
                }
            unit_info = self._unit_info(employee_unit_id)
            if not unit_info:
                return {
                    "status": "denied",
                    "error": "Assigned station could not be resolved.",
                }
            return {
                "status": "ok", "scope_type": "station",
                "district_id": unit_info["district_id"],
                "unit_id": employee_unit_id,
                "jurisdiction": {
                    "role": role, "scope": "station",
                    "district_id": unit_info["district_id"],
                    "district_name": unit_info["district_name"],
                    "unit_id": employee_unit_id,
                    "unit_name": unit_info["unit_name"],
                    "label": f"{unit_info['unit_name']} station",
                    "scope_note": (
                        "Investigator policy — station-scoped access enforced "
                        "server-side; a district parameter cannot widen this scope."
                    ),
                },
            }

        # Unknown role -> deny rather than widen (fail-safe).
        return {
            "status": "denied",
            "error": f"Role '{role}' is not authorised for prevention alerts.",
        }

    def _district_name(self, district_id) -> str:
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            cur.execute("SELECT DistrictName FROM District WHERE DistrictID = %s",
                        (district_id,))
            row = cur.fetchone()
            cur.close()
            conn.close()
            return row[0] if row else None
        except Exception:
            return None

    def _unit_info(self, unit_id) -> dict:
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            cur.execute(
                """SELECT u.UnitName, u.DistrictID, d.DistrictName
                   FROM Unit u
                   LEFT JOIN District d ON u.DistrictID = d.DistrictID
                   WHERE u.UnitID = %s""",
                (unit_id,),
            )
            row = cur.fetchone()
            cur.close()
            conn.close()
            if not row:
                return None
            return {"unit_name": row[0], "district_id": row[1],
                    "district_name": row[2] or f"District {row[1]}"}
        except Exception:
            return None

    # ────────────────────────────────────────────────────────────
    #  Windows / helpers
    # ────────────────────────────────────────────────────────────
    def _scope_where(self, scope: dict) -> str:
        """SQL scope predicate using the cm/u aliases used across the engine."""
        if scope.get("scope_type") == "station":
            return "cm.PoliceStationID = %(scope_ref)s"
        if scope.get("scope_type") == "district":
            return "u.DistrictID = %(scope_ref)s"
        return None  # state-wide -> no restriction

    def _scope_params(self, scope: dict) -> dict:
        if scope.get("scope_type") == "station":
            return {"scope_ref": scope.get("unit_id")}
        if scope.get("scope_type") == "district":
            return {"scope_ref": scope.get("district_id")}
        return {}

    def _scope_as_of(self, cur, scope: dict):
        """Newest record date inside the scope (dataset-anchored windows)."""
        where = self._scope_where(scope)
        params = self._scope_params(scope)
        if where:
            cur.execute(
                """SELECT MAX(cm.CrimeRegisteredDate)::date
                   FROM CaseMaster cm
                   JOIN Unit u ON cm.PoliceStationID = u.UnitID
                   WHERE {where}""".format(where=where),
                params,
            )
        else:
            cur.execute("SELECT MAX(CrimeRegisteredDate)::date FROM CaseMaster")
        row = cur.fetchone()
        return row[0] if row else None

    def _build_windows(self, as_of: date) -> dict:
        recent_start = as_of - timedelta(days=RECENT_WINDOW_DAYS)
        prev_end = recent_start
        prev_start = prev_end - timedelta(days=BASELINE_WINDOW_DAYS)
        prev2_end = prev_start
        prev2_start = prev2_end - timedelta(days=BASELINE_WINDOW_DAYS)
        mo_start = as_of - timedelta(days=MO_LOOKBACK_DAYS)

        def fmt(d):
            return d.isoformat()

        return {
            "as_of": as_of,
            "recent": {
                "start": recent_start, "end": as_of,
                "start_str": fmt(recent_start), "end_str": fmt(as_of),
                "count": 0,
                "label": f"last {RECENT_WINDOW_DAYS} days of data ({fmt(recent_start)} to {fmt(as_of)})",
            },
            "prev": {
                "start": prev_start, "end": prev_end,
                "start_str": fmt(prev_start), "end_str": fmt(prev_end),
                "count": 0,
                "label": f"previous {BASELINE_WINDOW_DAYS} days of data ({fmt(prev_start)} to {fmt(prev_end)})",
            },
            "prev2": {
                "start": prev2_start, "end": prev2_end,
                "start_str": fmt(prev2_start), "end_str": fmt(prev2_end),
                "count": 0,
                "label": f"prior {BASELINE_WINDOW_DAYS} days of data ({fmt(prev2_start)} to {fmt(prev2_end)})",
            },
            "mo": {
                "start": mo_start, "end": as_of,
                "start_str": fmt(mo_start), "end_str": fmt(as_of),
                "label": f"last {MO_LOOKBACK_DAYS} days of data ({fmt(mo_start)} to {fmt(as_of)})",
            },
        }

    def _scope_overview(self, cur, scope: dict, windows: dict) -> dict:
        """Reviewed totals inside the 90-day horizon + recent/comparison counts."""
        where = self._scope_where(scope)
        params = dict(self._scope_params(scope))
        params.update(start=windows["mo"]["start"], end=windows["as_of"])
        sql = """
            SELECT COUNT(*), COUNT(DISTINCT cm.CrimeMinorHeadID),
                   COUNT(DISTINCT u.UnitID)
            FROM CaseMaster cm
            JOIN Unit u ON cm.PoliceStationID = u.UnitID
            WHERE cm.CrimeRegisteredDate > %(start)s
              AND cm.CrimeRegisteredDate <= %(end)s
        """
        if where:
            sql += " AND " + where
        cur.execute(sql, params)
        row = cur.fetchone()

        def window_count(window):
            p = dict(self._scope_params(scope))
            p.update(start=window["start"], end=window["end"])
            sql = """
                SELECT COUNT(*)
                FROM CaseMaster cm
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                WHERE cm.CrimeRegisteredDate > %(start)s
                  AND cm.CrimeRegisteredDate <= %(end)s
            """
            if where:
                sql += " AND " + where
            cur.execute(sql, p)
            return cur.fetchone()[0]

        recent_count = window_count(windows["recent"])
        prev_count = window_count(windows["prev"])
        windows["recent"]["count"] = recent_count
        windows["prev"]["count"] = prev_count

        span_days = (windows["as_of"] - windows["mo"]["start"]).days
        return {
            "cases_reviewed": int(row[0] or 0) if row else 0,
            "categories_reviewed": int(row[1] or 0) if row else 0,
            "stations_reviewed": int(row[2] or 0) if row else 0,
            "recent_cases": int(recent_count or 0),
            "comparison_cases": int(prev_count or 0),
            "insufficient_history": span_days < 60,
        }

    def _subhead_window_stats(self, cur, scope: dict, windows: dict) -> list:
        """Per crime sub-head counts: recent / prev / prev2 windows."""
        where = self._scope_where(scope)
        params = dict(self._scope_params(scope))
        params.update(
            r_start=windows["recent"]["start"], r_end=windows["recent"]["end"],
            p_start=windows["prev"]["start"], p_end=windows["prev"]["end"],
            p2_start=windows["prev2"]["start"], p2_end=windows["prev2"]["end"],
        )
        sql = """
            SELECT
                cm.CrimeMinorHeadID,
                csh.CrimeHeadName AS sub_head,
                ch.CrimeGroupName AS crime_group,
                COUNT(*) FILTER (WHERE cm.CrimeRegisteredDate > %(r_start)s
                                 AND cm.CrimeRegisteredDate <= %(r_end)s) AS recent,
                COUNT(*) FILTER (WHERE cm.CrimeRegisteredDate > %(p_start)s
                                 AND cm.CrimeRegisteredDate <= %(p_end)s) AS prev,
                COUNT(*) FILTER (WHERE cm.CrimeRegisteredDate > %(p2_start)s
                                 AND cm.CrimeRegisteredDate <= %(p2_end)s) AS prev2
            FROM CaseMaster cm
            JOIN Unit u ON cm.PoliceStationID = u.UnitID
            JOIN CrimeSubHead csh ON cm.CrimeMinorHeadID = csh.CrimeSubHeadID
            LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
        """
        if where:
            sql += " WHERE " + where
        sql += """
            GROUP BY cm.CrimeMinorHeadID, csh.CrimeHeadName, ch.CrimeGroupName
            ORDER BY recent DESC
        """
        cur.execute(sql, params)
        stats = []
        for r in cur.fetchall():
            stats.append({
                "sub_head_id": r[0],
                "category": r[1],
                "crime_group": r[2] or "Other",
                "recent": int(r[3]),
                "prev": int(r[4]),
                "prev2": int(r[5]),
            })
        return stats

    def _station_window_stats(self, cur, scope: dict, windows: dict) -> list:
        """Per station × crime sub-head counts inside the recent window."""
        where = self._scope_where(scope)
        params = dict(self._scope_params(scope))
        params.update(start=windows["recent"]["start"], end=windows["recent"]["end"])
        sql = """
            SELECT
                u.UnitID, u.UnitName,
                cm.CrimeMinorHeadID,
                csh.CrimeHeadName AS sub_head,
                COUNT(*) AS cnt
            FROM CaseMaster cm
            JOIN Unit u ON cm.PoliceStationID = u.UnitID
            JOIN CrimeSubHead csh ON cm.CrimeMinorHeadID = csh.CrimeSubHeadID
            WHERE cm.CrimeRegisteredDate > %(start)s
              AND cm.CrimeRegisteredDate <= %(end)s
        """
        if where:
            sql += " AND " + where
        sql += """
            GROUP BY u.UnitID, u.UnitName, cm.CrimeMinorHeadID, csh.CrimeHeadName
            ORDER BY cnt DESC
        """
        cur.execute(sql, params)
        return [
            {
                "unit_id": r[0],
                "unit_name": r[1],
                "sub_head_id": r[2],
                "category": r[3],
                "count": int(r[4]),
            }
            for r in cur.fetchall()
        ]

    def _mo_tag_stats(self, cur, scope: dict, windows: dict):
        """MO-tag clusters inside the 90-day look-back (mirrors PatternEngine).

        Returns (totals, by_category):
          - totals: per-tag case totals across all crime sub-heads
          - by_category: per (tag, crime sub-head) rows for evidence mapping
        """
        where = self._scope_where(scope)
        params = dict(self._scope_params(scope))
        params.update(start=windows["mo"]["start"], end=windows["mo"]["end"])
        sql = """
            SELECT
                t.MOTagID, t.MOTagName,
                cm.CrimeMinorHeadID,
                csh.CrimeHeadName AS sub_head,
                COUNT(DISTINCT cm.CaseMasterID) AS cnt
            FROM ModusOperandi mo
            JOIN MOTagMaster t ON mo.MOTagID = t.MOTagID
            JOIN CaseMaster cm ON mo.CaseMasterID = cm.CaseMasterID
            JOIN Unit u ON cm.PoliceStationID = u.UnitID
            LEFT JOIN CrimeSubHead csh ON cm.CrimeMinorHeadID = csh.CrimeSubHeadID
            WHERE cm.CrimeRegisteredDate > %(start)s
              AND cm.CrimeRegisteredDate <= %(end)s
        """
        if where:
            sql += " AND " + where
        sql += """
            GROUP BY t.MOTagID, t.MOTagName, cm.CrimeMinorHeadID, csh.CrimeHeadName
            HAVING COUNT(DISTINCT cm.CaseMasterID) >= 2
            ORDER BY cnt DESC
        """
        cur.execute(sql, params)
        rows = cur.fetchall()

        totals = {}
        by_category = {}
        for r in rows:
            tag_id, tag_name, sub_id, sub_name, cnt = r
            totals[tag_id] = {
                "mo_tag_id": tag_id, "mo_tag": tag_name,
                "count": totals.get(tag_id, {"count": 0})["count"] + int(cnt),
            }
            key = (tag_id, sub_id)
            by_category[key] = {
                "mo_tag_id": tag_id, "mo_tag": tag_name,
                "sub_head_id": sub_id, "category": sub_name,
                "count": int(cnt),
            }
        totals_list = sorted(totals.values(), key=lambda m: m["count"], reverse=True)
        by_category_list = sorted(by_category.values(),
                                  key=lambda m: m["count"], reverse=True)
        return totals_list, by_category_list

    # ────────────────────────────────────────────────────────────
    #  Detection rules
    # ────────────────────────────────────────────────────────────
    def _detect_rising_activity(self, cur, scope, windows, subhead_stats,
                                station_stats, mo_by_category) -> list:
        """Crime sub-heads whose recent window exceeds the baseline windows."""
        alerts = []
        station_scope = scope.get("scope_type") == "station"
        min_recent = STATION_RISE_MIN_RECENT if station_scope else RISE_MIN_RECENT

        for s in subhead_stats:
            recent = s["recent"]
            if recent < min_recent or not s["category"]:
                continue
            base = (s["prev"] + s["prev2"]) / 2.0
            if base > 0 and recent < RISE_RATIO_MIN * base:
                continue

            cases = self._recent_cases(cur, scope, windows,
                                       sub_head_id=s["sub_head_id"])
            if not cases:
                continue

            all_station_rows = [
                c for c in station_stats if c["sub_head_id"] == s["sub_head_id"]
            ]
            stations_affected = list({c["unit_name"] for c in all_station_rows})
            strong_rows = [c for c in all_station_rows if c["count"] >= 2]
            strong_rows.sort(key=lambda x: x["count"], reverse=True)
            top_station = strong_rows[0] if strong_rows else None

            category_mo = [m for m in mo_by_category
                           if m.get("category") == s["category"]]

            alerts.append(self._assemble_alert(
                alert_type="rising_activity",
                title=f"{s['category']} — Rising Activity",
                crime_category=s["category"],
                crime_group=s["crime_group"],
                location=scope["jurisdiction"]["label"],
                windows=windows,
                recent=s["recent"],
                prev=s["prev"],
                prev2=s["prev2"],
                supporting_cases=cases,
                stations_affected=stations_affected,
                top_station=top_station,
                mo_evidence=category_mo,
            ))
        return alerts

    def _detect_geo_clusters(self, cur, scope, windows, station_stats,
                             subhead_stats, alert_categories, mo_by_category) -> list:
        """
        Station-level concentration that is NOT already covered by a scope-wide
        rising alert (those carry the concentration inside their evidence).
        """
        if scope.get("scope_type") == "station":
            return []  # station scope is fully handled by rising detection

        subhead_map = {s["category"]: s for s in subhead_stats}
        alerts = []
        seen = set()
        for c in station_stats:
            if c["count"] < CLUSTER_MIN_RECENT:
                continue
            key = (c["unit_id"], c["sub_head_id"])
            if key in seen:
                continue
            seen.add(key)
            category = c["category"]
            if category in alert_categories:
                continue  # already reported as scope-wide rising activity
            stat = subhead_map.get(category)
            if stat and stat["recent"] < 2:
                continue  # district total too weak to be meaningful

            cases = self._recent_cases(cur, scope, windows,
                                       sub_head_id=c["sub_head_id"],
                                       unit_id=c["unit_id"])
            if len(cases) < CLUSTER_MIN_RECENT:
                continue

            category_mo = [m for m in mo_by_category
                           if m.get("category") == category]
            cluster = dict(c)
            alerts.append(self._assemble_alert(
                alert_type="geographic_cluster",
                title=f"{category} — Concentration Near {c['unit_name']}",
                crime_category=category,
                crime_group=stat["crime_group"] if stat else None,
                location=f"{c['unit_name']}",
                windows=windows,
                recent=cluster["count"],
                prev=0,
                prev2=0,
                supporting_cases=cases,
                stations_affected=[c["unit_name"]],
                top_station=cluster,
                mo_evidence=category_mo,
            ))
        return alerts

    def _detect_mo_alerts(self, cur, scope, windows, mo_tag_totals,
                          mo_by_category, alert_categories) -> list:
        """
        Recurring MO clusters whose dominant crime type does NOT already have
        an alert (those are folded into the alert's evidence instead).
        """
        alerts = []
        state_scope = scope.get("scope_type") == "state"
        floor = MO_MIN_CASES_STATE if state_scope else MO_MIN_CASES

        covered_tags = {
            m["mo_tag_id"] for m in mo_by_category
            if m.get("category") in alert_categories
        }
        for m in mo_tag_totals:
            if m["count"] < floor or m["mo_tag_id"] in covered_tags:
                continue
            cases = self._mo_recent_cases(cur, scope, windows, m["mo_tag_id"])
            if not cases:
                continue
            dominant = [
                mc for mc in mo_by_category if mc["mo_tag_id"] == m["mo_tag_id"]
            ]
            dominant.sort(key=lambda x: x["count"], reverse=True)
            cat = dominant[0]["category"] if dominant else None
            alerts.append(self._assemble_alert(
                alert_type="repeated_modus_operandi",
                title=f"\"{m['mo_tag']}\" Modus Operandi Repeating",
                crime_category=cat,
                crime_group=None,
                location=scope["jurisdiction"]["label"],
                windows=windows,
                recent=m["count"],
                prev=0,
                prev2=0,
                supporting_cases=cases,
                stations_affected=list({c["police_station"] for c in cases}),
                top_station=None,
                mo_evidence=[
                    mc for mc in mo_by_category if mc["mo_tag_id"] == m["mo_tag_id"]
                ],
                mo_window=True,
            ))
        return alerts

    def _detect_forecast_signal(self, scope, windows) -> dict:
        """Optional forecast-based warning from the existing Forecasting engine.

        Returns an alert dict, None (no forecast signal), or a skip note
        {"skipped": reason} so the caller can surface why no forecast alert
        was produced (honest reporting).
        """
        if scope.get("scope_type") == "station":
            return {"skipped": "single-station scope does not carry a reliable monthly series"}
        as_of = windows["as_of"]
        # A trailing partial month understates the most recent monthly bucket
        # and makes the engine's increase-vs-last-month comparison unreliable.
        if as_of.day < 25:
            return {"skipped": (
                f"trailing data month is partial (newest record {as_of.isoformat()}); "
                "a monthly forecast comparison would be unreliable"
            )}
        try:
            from engines.forecasting import CrimeForecastingEngine
        except Exception:
            return {"skipped": "forecasting engine unavailable"}
        try:
            result = CrimeForecastingEngine().forecast_category(
                category_id=1,  # FIR registrations
                category_name="FIR",
                district_id=scope.get("district_id"),
                horizon=3,
                rbac_filter="1=1",
            )
        except Exception:
            return {"skipped": "forecasting engine error"}
        if result.get("status") != "success":
            return {"skipped": result.get("reason") or "insufficient monthly data"}
        sufficiency = result.get("data_sufficiency", {})
        if not sufficiency.get("sufficient") or sufficiency.get("total_months", 0) < FORECAST_MIN_MONTHS:
            return {"skipped": "fewer than 12 complete months available for forecasting"}
        signals = {s.get("signal"): s for s in result.get("signals", [])}
        forecast_signal = signals.get("forecast_increase")
        if not forecast_signal:
            return None
        historical = result.get("historical", [])
        last_observed = historical[-1]["count"] if historical else 0
        forecast_series = result.get("forecast", [])
        avg_forecast = round(
            sum(f["forecast"] for f in forecast_series) / max(len(forecast_series), 1), 1
        )
        # Scale floor: a jurisdiction registering only a handful of FIRs per
        # month cannot meaningfully be called "elevated" by a projection.
        floor = 60 if scope.get("scope_type") == "state" else 12
        if last_observed < floor:
            return {"skipped": (
                f"monthly volume too low for a meaningful forecast claim "
                f"({last_observed} FIRs in the latest observed month)"
            )}
        if avg_forecast <= last_observed:
            return None

        evidence = [{
            "signal": "forecast_model",
            "label": "Holt-Winters forecast (next 3 months)",
            "description": forecast_signal.get("description", ""),
            "value": (
                f"average {avg_forecast} cases/month vs {last_observed} in the "
                "most recent observed month"
            ),
        }]
        recent_trend = signals.get("recent_trend")
        if recent_trend:
            evidence.append({
                "signal": "recent_trend",
                "label": "Recent trend",
                "description": recent_trend.get("description", ""),
                "value": recent_trend.get("description", ""),
            })
        evidence.append({
            "signal": "months_analysed",
            "label": "Historical depth",
            "description": "Monthly FIR series used by the forecasting engine",
            "value": f"{sufficiency.get('total_months', 0)} months",
        })

        ratio = avg_forecast / last_observed
        magnitude = 16 if ratio >= 1.4 else (10 if ratio >= 1.2 else 6)
        components = {
            "forecast_direction": {"rule": "forecasting engine projects an increase", "points": 8},
            "forecast_magnitude": {
                "rule": f"projected average {ratio:.2f}x the latest observed month",
                "points": magnitude,
            },
            "volume": {"rule": "latest observed monthly volume", "points": min(last_observed, 12)},
            "forecast_support": {"rule": ">=12 months of history used by the model", "points": 5},
        }
        total = min(8 + magnitude + min(last_observed, 12) + 5, 100)
        if total >= HIGH_BAND:
            level, confidence = "HIGH", "high"
        elif total >= MEDIUM_BAND:
            level, confidence = "MEDIUM", "medium"
        else:
            level, confidence = "LOW", "low"

        return {
            "alert_type": "forecast_elevation",
            "title": f"Elevated FIR Volume Forecast — {scope['jurisdiction']['label']}",
            "severity": level,
            "crime_category": "FIR volume (all categories)",
            "crime_group": None,
            "location": scope["jurisdiction"]["label"],
            "time_window": {
                "recent": windows["recent"]["label"],
                "forecast": "next 3 months (model horizon)",
            },
            "summary": (
                f"The forecasting engine projects an average of {avg_forecast} FIR "
                f"registrations per month over the next 3 months for "
                f"{scope['jurisdiction']['label']}, compared with {last_observed} "
                "in the most recent observed month. Elevated volumes should be "
                "anticipated."
            ),
            "evidence": evidence,
            "supporting_case_count": 0,
            "supporting_cases": [],
            "trend_change": {
                "label": "forecast increase",
                "recent": last_observed,
                "comparison": avg_forecast,
                "pct": round(((avg_forecast - last_observed) / last_observed) * 100, 1),
            },
            "source_engines": ["forecasting"],
            "confidence": confidence,
            "mo_tags": [],
            "stations_affected": [],
            "score": {
                "total": int(total),
                "level": level,
                "confidence": confidence,
                "components": components,
            },
            "recommended_actions": [
                "Prepare for elevated FIR volume over the next 3 months.",
                "Monitor the crime categories that drove the recent upward trend.",
                "Re-run this analysis after the next data refresh to confirm direction.",
            ],
        }

    # ────────────────────────────────────────────────────────────
    #  Supporting FIR retrieval (evidence-first)
    # ────────────────────────────────────────────────────────────
    def _recent_cases(self, cur, scope, windows, sub_head_id=None,
                      unit_id=None, limit=SUPPORTING_CASE_CAP) -> list:
        where = self._scope_where(scope)
        params = dict(self._scope_params(scope))
        params.update(start=windows["recent"]["start"], end=windows["recent"]["end"])
        sql = """
            SELECT
                cm.CaseMasterID, cm.CrimeNo, cm.CrimeRegisteredDate,
                u.UnitName, d.DistrictName,
                LEFT(COALESCE(cm.BriefFacts, ''), 200) AS brief_facts
            FROM CaseMaster cm
            JOIN Unit u ON cm.PoliceStationID = u.UnitID
            LEFT JOIN District d ON u.DistrictID = d.DistrictID
            WHERE cm.CrimeRegisteredDate > %(start)s
              AND cm.CrimeRegisteredDate <= %(end)s
        """
        if where:
            sql += " AND " + where
        if sub_head_id is not None:
            sql += " AND cm.CrimeMinorHeadID = %(sub_head_id)s"
            params["sub_head_id"] = sub_head_id
        if unit_id is not None:
            sql += " AND cm.PoliceStationID = %(unit_id)s"
            params["unit_id"] = unit_id
        sql += " ORDER BY cm.CrimeRegisteredDate DESC, cm.CaseMasterID DESC LIMIT %(cap)s"
        params["cap"] = limit
        cur.execute(sql, params)
        return [self._serialize_case(r) for r in cur.fetchall()]

    def _mo_recent_cases(self, cur, scope, windows, mo_tag_id,
                         limit=SUPPORTING_CASE_CAP) -> list:
        where = self._scope_where(scope)
        params = dict(self._scope_params(scope))
        params.update(start=windows["mo"]["start"], end=windows["mo"]["end"],
                      mo_tag_id=mo_tag_id)
        sql = """
            SELECT
                cm.CaseMasterID, cm.CrimeNo, cm.CrimeRegisteredDate,
                u.UnitName, d.DistrictName,
                LEFT(COALESCE(cm.BriefFacts, ''), 200) AS brief_facts
            FROM ModusOperandi mo
            JOIN CaseMaster cm ON mo.CaseMasterID = cm.CaseMasterID
            JOIN Unit u ON cm.PoliceStationID = u.UnitID
            LEFT JOIN District d ON u.DistrictID = d.DistrictID
            WHERE mo.MOTagID = %(mo_tag_id)s
              AND cm.CrimeRegisteredDate > %(start)s
              AND cm.CrimeRegisteredDate <= %(end)s
        """
        if where:
            sql += " AND " + where
        sql += " ORDER BY cm.CrimeRegisteredDate DESC LIMIT %(cap)s"
        params["cap"] = limit
        cur.execute(sql, params)
        return [self._serialize_case(r) for r in cur.fetchall()]

    def _serialize_case(self, r) -> dict:
        return {
            "case_id": r[0],
            "crime_no": r[1],
            "crime_registered_date": r[2].isoformat() if r[2] else None,
            "police_station": r[3],
            "district": r[4],
            "brief_facts": r[5],
        }

    # ────────────────────────────────────────────────────────────
    #  Alert assembly / scoring
    # ────────────────────────────────────────────────────────────
    def _assemble_alert(self, alert_type, title, crime_category, crime_group,
                        location, windows, recent, prev, prev2, supporting_cases,
                        stations_affected, top_station, mo_evidence,
                        mo_window=False) -> dict:
        pct = None
        if prev > 0:
            pct = round(((recent - prev) / prev) * 100, 1)
        # When prev == 0 we never invent a percentage (emergence instead).

        window_label = windows["mo"]["label"] if mo_window else windows["recent"]["label"]

        evidence = [
            {
                "signal": "recent_volume",
                "label": "Recent cases",
                "description": "Supporting FIRs found in the analysed window",
                "value": f"{recent} cases ({window_label})",
            },
        ]
        if not mo_window:
            if prev > 0:
                evidence.append({
                    "signal": "baseline_comparison",
                    "label": "Previous 30 days of data",
                    "description": "FIRs registered in the comparison window",
                    "value": f"{prev} cases",
                })
            else:
                evidence.append({
                    "signal": "emerging_cluster",
                    "label": "Emerging cluster",
                    "description": "No cases of this type in the two prior 30-day windows",
                    "value": f"{recent} cases with no prior baseline",
                })
        if pct is not None:
            evidence.append({
                "signal": "trend_change",
                "label": "Trend change vs previous window",
                "description": "Relative change between the two 30-day windows",
                "value": f"{pct:+.1f}% ({recent} vs {prev})",
            })
        if stations_affected:
            evidence.append({
                "signal": "station_spread",
                "label": "Stations affected",
                "description": "Police stations registering this pattern in the window",
                "value": f"{len(stations_affected)}: {', '.join(stations_affected[:4])}",
            })
        if top_station and top_station.get("count", 0) >= 2:
            evidence.append({
                "signal": "geo_concentration",
                "label": "Strongest station concentration",
                "description": "Station accounting for the largest share of recent cases",
                "value": f"{top_station['unit_name']} ({top_station['count']} recent cases)",
            })
        mo_tags = []
        if alert_type == "repeated_modus_operandi" and mo_evidence:
            # A single compact category breakdown instead of repeated rows.
            breakdown = ", ".join(
                f"{m.get('category') or 'Unclassified'} ({m['count']})"
                for m in mo_evidence
            )
            for m in mo_evidence:
                if m["mo_tag"] not in mo_tags:
                    mo_tags.append(m["mo_tag"])
            evidence.append({
                "signal": "shared_modus_operandi",
                "label": "Shared modus operandi",
                "description": "Cases sharing this MO tag inside the analysed window",
                "value": f"\"{mo_tags[0]}\" across: {breakdown}",
            })
        else:
            for m in mo_evidence:
                if m["mo_tag"] not in mo_tags:
                    mo_tags.append(m["mo_tag"])
                evidence.append({
                    "signal": "shared_modus_operandi",
                    "label": "Shared modus operandi",
                    "description": "MO tag recurring across the supporting records",
                    "value": f"\"{m['mo_tag']}\" ({m['count']} cases in window)",
                })

        if alert_type == "geographic_cluster":
            source_engines = ["pattern_detection", "trend_analysis"]
        elif alert_type == "repeated_modus_operandi":
            source_engines = ["pattern_detection"]
        else:
            source_engines = ["trend_analysis"] + (["pattern_detection"] if mo_evidence else [])

        metrics = {
            "recent": recent,
            "prev": prev,
            "prev2": prev2,
            "stations": len(stations_affected),
            "top_station_count": top_station.get("count", 0) if top_station else 0,
            "mo_support": len(mo_tags),
        }
        score = self._score_alert(metrics)

        summary = self._summary_text(
            alert_type, crime_category, location, window_label, recent, prev,
            top_station,
        )
        recommendations = self._recommended_actions(
            alert_type, crime_category, stations_affected, top_station, mo_tags
        )

        return {
            "alert_type": alert_type,
            "title": title,
            "severity": score["level"],
            "crime_category": crime_category,
            "crime_group": crime_group,
            "location": location,
            "time_window": {
                "recent": windows["recent"]["label"],
                "comparison": windows["prev"]["label"],
            },
            "summary": summary,
            "evidence": evidence,
            "supporting_case_count": recent,
            "supporting_cases": supporting_cases,
            "trend_change": {
                "label": "increase" if (pct or 0) >= 0 else "decrease",
                "recent": recent,
                "comparison": prev,
                "pct": pct,
            },
            "source_engines": source_engines,
            "confidence": score["confidence"],
            "mo_tags": mo_tags,
            "stations_affected": stations_affected,
            "score": score,
            "recommended_actions": recommendations,
        }

    def _summary_text(self, alert_type, crime_category, location, window_label,
                      recent, prev, top_station) -> str:
        cat = (crime_category or "crime").lower()
        if alert_type == "rising_activity":
            if prev and prev > 0:
                return (
                    f"{recent} {cat} case(s) were registered in {location} during "
                    f"the {window_label}, compared with {prev} in the previous "
                    "30 days of data."
                )
            return (
                f"{recent} {cat} case(s) were registered in {location} during the "
                f"{window_label}, with no {cat} cases in the previous 60 days of "
                "data (emerging cluster)."
            )
        if alert_type == "geographic_cluster":
            station = top_station["unit_name"] if top_station else location
            return (
                f"{recent} {cat} case(s) were registered at {station} during the "
                f"{window_label}, concentrating a repeated crime type in a single "
                "station area."
            )
        if alert_type == "repeated_modus_operandi":
            return (
                f"{recent} case(s) sharing a recurring modus operandi were recorded "
                f"in {location} during the {window_label}."
            )
        return f"{recent} supporting records in {location} during the {window_label}."

    def _score_alert(self, metrics: dict) -> dict:
        """Transparent prevention-risk score from real evidence components.

        Documented, deterministic rules:
          - growth: 30 pts for >=3x baseline (or a >=5-case emergence from zero),
            22 for >=2x, 15 for >=1.5x, 8 otherwise
          - volume: up to 12 pts (min(recent, 12))
          - spread: +6 pts when >=3 stations affected, +3 when 2
          - concentration: +10 pts when >=3 cases at one station, +5 when 2
          - MO support: +8 pts when a recurring MO tag is present
        """
        recent = metrics.get("recent", 0)
        prev = metrics.get("prev", 0)
        prev2 = metrics.get("prev2", 0)
        base = (prev + prev2) / 2.0

        components = {}
        if base <= 0:
            growth = 30 if recent >= 5 else 18
            components["growth"] = {
                "rule": "emerging from zero baseline", "points": growth}
        else:
            ratio = recent / base
            if ratio >= 3:
                growth = 30
            elif ratio >= 2:
                growth = 22
            elif ratio >= 1.5:
                growth = 15
            else:
                growth = 8
            components["growth"] = {
                "rule": f"ratio {ratio:.2f}x vs 30-day baseline", "points": growth}

        volume = min(recent, 12)
        components["volume"] = {"rule": "recent case volume", "points": volume}
        total = growth + volume

        stations = metrics.get("stations", 0)
        if stations >= 3:
            components["spread"] = {"rule": ">=3 stations affected", "points": 6}
            total += 6
        elif stations == 2:
            components["spread"] = {"rule": "2 stations affected", "points": 3}
            total += 3

        top_count = metrics.get("top_station_count", 0)
        if top_count >= 3:
            components["concentration"] = {
                "rule": ">=3 cases at one station", "points": 10}
            total += 10
        elif top_count == 2:
            components["concentration"] = {
                "rule": "2 cases at one station", "points": 5}
            total += 5

        if metrics.get("mo_support"):
            components["mo_support"] = {
                "rule": "recurring MO tag(s) present", "points": 8}
            total += 8

        total = min(total, 100)
        if total >= HIGH_BAND:
            level, confidence = "HIGH", "high"
        elif total >= MEDIUM_BAND:
            level, confidence = "MEDIUM", "medium"
        else:
            level, confidence = "LOW", "low"
        # Honest label: never call a tiny sample HIGH regardless of the ratio.
        if recent <= 3 and level == "HIGH":
            level, confidence = "MEDIUM", "medium"
        return {
            "total": int(total),
            "level": level,
            "confidence": confidence,
            "components": components,
        }

    def _recommended_actions(self, alert_type, crime_category, stations_affected,
                             top_station, mo_tags) -> list:
        actions = []
        if alert_type == "rising_activity":
            if stations_affected:
                actions.append(
                    f"Increase patrol attention in the areas reporting "
                    f"{crime_category} cases: {', '.join(stations_affected[:4])}."
                )
            actions.append(
                "Review the recent FIRs for a shared modus operandi."
            )
            actions.append(
                "Examine connected persons and cases through the Evidence Graph."
            )
            actions.append(
                f"Monitor {crime_category} registrations over the next 30 days."
            )
        elif alert_type == "geographic_cluster":
            if top_station:
                actions.append(
                    f"Focus beat deployment around {top_station['unit_name']}, "
                    f"where {top_station['count']} {crime_category} cases were "
                    "recorded in the recent period."
                )
            actions.append(
                "Review the recent FIRs from this station for linked offenders."
            )
            actions.append(
                "Compare incidents with nearby stations to check for a spreading pattern."
            )
        elif alert_type == "repeated_modus_operandi":
            if mo_tags:
                actions.append(
                    f"Compare recent cases sharing the \"{mo_tags[0]}\" modus operandi."
                )
            actions.append(
                "Review suspect and vehicle registrations linked to the matching cases."
            )
            actions.append(
                "Alert nearby jurisdictions if the same modus operandi appears elsewhere."
            )
        return actions

    # ────────────────────────────────────────────────────────────
    #  Response helpers
    # ────────────────────────────────────────────────────────────
    def _dedupe(self, alerts) -> list:
        seen = set()
        result = []
        for a in alerts:
            key = (a["alert_type"], a.get("crime_category"), a.get("location"))
            if key in seen:
                continue
            seen.add(key)
            result.append(a)
        return result

    def _empty_result(self, scope, message, cases_reviewed, categories_reviewed,
                      stations_reviewed, insufficient_history, windows=None) -> dict:
        analysis = {
            "cases_reviewed": cases_reviewed,
            "recent_cases": windows["recent"]["count"] if windows else 0,
            "comparison_cases": windows["prev"]["count"] if windows else 0,
            "crime_categories_reviewed": categories_reviewed,
            "stations_reviewed": stations_reviewed,
            "insufficient_history": insufficient_history,
            "history_note": (
                "Insufficient historical data for a reliable comparison."
                if insufficient_history
                else "Sufficient historical depth for comparison."
            ),
        }
        if windows:
            analysis["as_of_date"] = windows["as_of"].isoformat()
            analysis["recent_window"] = windows["recent"]["label"]
            analysis["comparison_window"] = windows["prev"]["label"]
        return {
            "status": "success",
            "jurisdiction": scope["jurisdiction"],
            "analysis": analysis,
            "alerts": [],
            "message": message,
        }
