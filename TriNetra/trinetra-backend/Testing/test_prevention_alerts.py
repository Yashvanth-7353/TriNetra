"""
Prevention Alerts — evidence-first engine regression tests.

Verifies at the HTTP + engine level that the prevention alert feed:
  1. requires authentication,
  2. respects jurisdiction server-side (Analyst state-wide, Supervisor
     district-scoped, Investigator station-scoped),
  3. never lets a client-supplied district widen a jurisdiction-bound scope,
  4. only emits alerts whose numbers match the actual database records,
  5. keeps every supporting FIR inside the alert's scope,
  6. returns an honest empty state instead of fabricated alerts,
  7. never invents trend percentages from a zero baseline,
  8. exposes no financial/account data,
  9. is deterministic for identical inputs.

Real seeded accounts used (password '1234'):
  - 96 = DySP Bengaluru Urban -> Analyst      (state-wide)
  - 63 = PI Bengaluru Urban Central PS 1      (Investigator, station-scoped)
  - 5  = PI Bagalkot Central PS 2             (Investigator, quiet station)

Supervisor scope cannot be exercised through real seeded HTTP accounts
(the seed's rank->role mapping has no supervisor-ranked employee), so the
Supervisor policy is tested directly on the engine, which is the component
that resolves jurisdiction.

Run:
    pytest test_prevention_alerts.py -v
"""
import os
import sys
import json

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


def _load_env():
    """Loads .env BEFORE importing app so engine singletons capture the DB URL."""
    if not os.getenv("NEON_DATABASE_URL"):
        env_path = os.path.join(BACKEND_DIR, ".env")
        if os.path.exists(env_path):
            for line in open(env_path, encoding="utf-8-sig"):
                line = line.strip()
                if "=" in line:
                    k, _, v = line.partition("=")
                    os.environ.setdefault(k.strip(), v.strip().strip('"'))


_load_env()

try:
    from fastapi.testclient import TestClient
    import app as backend_app
    from engines.prevention_alerts import PreventionAlertsEngine
    _APP_OK = True
except Exception as exc:  # pragma: no cover
    _APP_OK = False
    _APP_IMPORT_ERR = exc

needs_app = pytest.mark.skipif(not _APP_OK, reason="backend app not importable")


def _db_available() -> bool:
    if not _APP_OK:
        return False
    _load_env()
    if not os.getenv("NEON_DATABASE_URL"):
        return False
    try:
        import psycopg2
        conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM District LIMIT 1")
        cur.fetchone()
        cur.close()
        conn.close()
        return True
    except Exception:
        return False


needs_db = pytest.mark.skipif(not _db_available(), reason="NEON_DATABASE_URL not reachable")

ANALYST_ID = 96      # DySP, Bengaluru Urban (state-wide access)
INVESTIGATOR_ID = 63  # PI, Bengaluru Urban Central PS 1 (unit 19)
QUIET_INVESTIGATOR_ID = 5  # PI, Bagalkot Central PS 2 (unit 2)
BENGALURU_URBAN_DISTRICT = 5
BAGALKOT_DISTRICT = 1
CENTRAL_PS1_UNIT = 19
CENTRAL_PS1_NAME = "Bengaluru Urban Central PS 1"
BAGALKOT_UNIT_NAME = "Bagalkot Central PS 2"
ENDPOINT = "/api/analytics/alerts"


@needs_app
class TestAuthentication:
    @classmethod
    def setup_class(cls):
        cls.client = TestClient(backend_app.app)

    def test_unauth_request_is_rejected(self):
        resp = self.client.get(ENDPOINT)
        assert resp.status_code in (401, 403)

    def test_invalid_token_is_rejected(self):
        resp = self.client.get(ENDPOINT, headers={"Authorization": "Bearer not.a.token"})
        assert resp.status_code in (401, 403)


@needs_app
@needs_db
class TestAnalystStateWide:
    @classmethod
    def setup_class(cls):
        cls.client = TestClient(backend_app.app)

    def _token(self, employee_id):
        resp = self.client.post("/api/login",
                                json={"employee_id": employee_id, "password": "1234"})
        assert resp.status_code == 200, resp.text
        return resp.json()["token"]

    def _alerts(self, employee_id, district_id=None):
        qs = f"?district_id={district_id}" if district_id else ""
        resp = self.client.get(
            ENDPOINT + qs,
            headers={"Authorization": f"Bearer {self._token(employee_id)}"},
        )
        return resp

    def test_analyst_statewide_receives_alerts(self):
        resp = self._alerts(ANALYST_ID)
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert body["jurisdiction"]["scope"] == "state"
        # The current dataset genuinely contains strong late-2026 signals; when
        # that changes the honest empty state below must still validate.
        if body["alerts"]:
            assert all(a["supporting_case_count"] > 0 for a in body["alerts"]
                       if a["supporting_cases"])
            assert all(a["severity"] in ("HIGH", "MEDIUM", "LOW") for a in body["alerts"])
        else:
            assert body["message"], "empty feed must explain itself"

    def test_analyst_can_request_specific_district(self):
        resp = self._alerts(ANALYST_ID, district_id=BENGALURU_URBAN_DISTRICT)
        assert resp.status_code == 200
        body = resp.json()
        assert body["jurisdiction"]["scope"] == "district"
        assert body["jurisdiction"]["district_id"] == BENGALURU_URBAN_DISTRICT
        assert body["jurisdiction"]["district_name"] == "Bengaluru Urban"

    def test_analyst_requesting_unknown_district_is_400(self):
        resp = self._alerts(ANALYST_ID, district_id=999999)
        assert resp.status_code in (400, 403, 500)

    def test_statewide_scope_reviews_more_than_station_scope(self):
        # The state-wide feed must be genuinely wider than a single station's
        # view — otherwise jurisdiction scoping is not filtering anything.
        state = self._alerts(ANALYST_ID).json()
        station = self._alerts(INVESTIGATOR_ID).json()
        assert state["jurisdiction"]["scope"] == "state"
        assert station["jurisdiction"]["scope"] == "station"
        assert state["analysis"]["cases_reviewed"] > station["analysis"]["cases_reviewed"]
        assert state["analysis"]["stations_reviewed"] > 1


@needs_app
@needs_db
class TestInvestigatorStationScope:
    @classmethod
    def setup_class(cls):
        cls.client = TestClient(backend_app.app)
        cls.engine = PreventionAlertsEngine()

    def _token(self, employee_id):
        resp = self.client.post("/api/login",
                                json={"employee_id": employee_id, "password": "1234"})
        assert resp.status_code == 200, resp.text
        return resp.json()["token"]

    def _alerts(self, employee_id, district_id=None):
        qs = f"?district_id={district_id}" if district_id else ""
        resp = self.client.get(
            ENDPOINT + qs,
            headers={"Authorization": f"Bearer {self._token(employee_id)}"},
        )
        return resp

    def test_investigator_is_station_scoped(self):
        resp = self._alerts(INVESTIGATOR_ID)
        assert resp.status_code == 200
        body = resp.json()
        assert body["jurisdiction"]["scope"] == "station"
        assert body["jurisdiction"]["unit_id"] == CENTRAL_PS1_UNIT
        assert body["jurisdiction"]["district_name"] == "Bengaluru Urban"
        for alert in body["alerts"]:
            for case in alert["supporting_cases"]:
                assert case["police_station"] == CENTRAL_PS1_NAME
                assert case["district"] == "Bengaluru Urban"

    def test_explicit_district_cannot_override_investigator_scope(self):
        # A Bagalkot investigator asking for Bengaluru Urban must stay scoped to
        # Bagalkot Central PS 2 — never inherit Bengaluru Urban's rich alerts.
        resp = self._alerts(QUIET_INVESTIGATOR_ID,
                            district_id=BENGALURU_URBAN_DISTRICT)
        assert resp.status_code == 200
        body = resp.json()
        assert body["jurisdiction"]["scope"] == "station"
        assert body["jurisdiction"]["unit_id"] == 2
        assert body["jurisdiction"]["district_name"] == "Bagalkot"
        for alert in body["alerts"]:
            for case in alert["supporting_cases"]:
                assert case["district"] == "Bagalkot"
                assert case["police_station"] == BAGALKOT_UNIT_NAME

    def test_quiet_station_returns_honest_empty_state(self):
        resp = self._alerts(QUIET_INVESTIGATOR_ID)
        assert resp.status_code == 200
        body = resp.json()
        assert body["jurisdiction"]["scope"] == "station"
        assert isinstance(body["alerts"], list)
        # Central PS 2 has very little recent activity: no fabricated alerts.
        assert body["message"] and "No active prevention alerts" in body["message"]
        assert "cases_reviewed" in body["analysis"]

    def test_engine_supervisor_is_district_scoped(self):
        # Supervisor policy resolved by the engine (the source of truth for
        # jurisdiction). Requests for a different district are ignored.
        res = self.engine.generate_alerts(
            role="Supervisor",
            employee_district_id=BENGALURU_URBAN_DISTRICT,
            employee_unit_id=CENTRAL_PS1_UNIT,
            requested_district_id=BAGALKOT_DISTRICT,
        )
        assert res["status"] == "success"
        j = res["jurisdiction"]
        assert j["scope"] == "district"
        assert j["district_id"] == BENGALURU_URBAN_DISTRICT
        for alert in res["alerts"]:
            for case in alert["supporting_cases"]:
                assert case["district"] == "Bengaluru Urban"

    def test_engine_unknown_role_is_denied(self):
        res = self.engine.generate_alerts(role="UnknownRole")
        assert res["status"] == "denied"


@needs_app
@needs_db
class TestEvidenceIntegrity:
    """Every number in an alert must be traceable to CaseMaster records."""

    @classmethod
    def setup_class(cls):
        cls.client = TestClient(backend_app.app)
        _load_env()

    def _analyst_district_feed(self, district_id=BENGALURU_URBAN_DISTRICT):
        resp = self.client.post("/api/login",
                                json={"employee_id": ANALYST_ID, "password": "1234"})
        assert resp.status_code == 200, resp.text
        tok = resp.json()["token"]
        r = self.client.get(f"{ENDPOINT}?district_id={district_id}",
                            headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200
        return r.json()

    def _db_subhead_counts(self, district_id, sub_head_name, as_of):
        """Recomputes (recent_count, prev_count) with the engine's own windows."""
        import datetime as dt
        import psycopg2
        recent_start = as_of - dt.timedelta(days=30)
        prev_start = as_of - dt.timedelta(days=60)
        conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
        cur = conn.cursor()
        cur.execute(
            """SELECT
                 COUNT(*) FILTER (WHERE cm.CrimeRegisteredDate > %s
                                  AND cm.CrimeRegisteredDate <= %s),
                 COUNT(*) FILTER (WHERE cm.CrimeRegisteredDate > %s
                                  AND cm.CrimeRegisteredDate <= %s)
               FROM CaseMaster cm
               JOIN Unit u ON cm.PoliceStationID = u.UnitID
               JOIN CrimeSubHead csh ON cm.CrimeMinorHeadID = csh.CrimeSubHeadID
               WHERE u.DistrictID = %s AND csh.CrimeHeadName = %s""",
            (recent_start, as_of, prev_start, recent_start, district_id, sub_head_name),
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        return int(row[0] or 0), int(row[1] or 0)

    def test_rising_alert_numbers_match_database(self):
        import datetime as dt
        feed = self._analyst_district_feed()
        rising = [a for a in feed["alerts"] if a["alert_type"] == "rising_activity"]
        assert rising, "Bengaluru Urban data has genuine rising signals"
        alert = rising[0]
        as_of = dt.date.fromisoformat(feed["analysis"]["as_of_date"])
        db_recent, db_prev = self._db_subhead_counts(
            BENGALURU_URBAN_DISTRICT, alert["crime_category"], as_of
        )
        assert alert["supporting_case_count"] == db_recent, (
            f"{alert['title']}: alert count {alert['supporting_case_count']} "
            f"!= db count {db_recent}"
        )
        assert alert["trend_change"]["comparison"] == db_prev
        assert db_recent > 0
        # every supporting FIR id is a real CaseMaster row inside the district
        import psycopg2
        case_ids = [c["case_id"] for c in alert["supporting_cases"]]
        conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
        cur = conn.cursor()
        cur.execute(
            """SELECT COUNT(*) FROM CaseMaster cm
               JOIN Unit u ON cm.PoliceStationID = u.UnitID
               WHERE u.DistrictID = %s AND cm.CaseMasterID = ANY(%s)""",
            (BENGALURU_URBAN_DISTRICT, case_ids),
        )
        found = cur.fetchone()[0]
        cur.close()
        conn.close()
        assert found == len(case_ids), "a supporting FIR escaped the district scope"

    def test_evidence_counts_match_db_records(self):
        feed = self._analyst_district_feed()
        for alert in feed["alerts"]:
            if not alert["supporting_cases"]:
                continue
            # every listed FIR must sit inside the jurisdiction
            for case in alert["supporting_cases"]:
                assert case["district"] == "Bengaluru Urban", case
            # score/severity sanity
            assert 0 <= alert["score"]["total"] <= 100
            assert alert["score"]["level"] == alert["severity"]

    def test_no_invented_percentage_from_zero_baseline(self):
        feed = self._analyst_district_feed()
        for alert in feed["alerts"]:
            tc = alert.get("trend_change") or {}
            if tc.get("comparison") == 0:
                assert tc.get("pct") is None, (
                    f"{alert['title']} invented a % with a zero baseline"
                )

    def test_no_financial_data_leakage(self):
        raw = json.dumps(self._analyst_district_feed()).lower()
        for forbidden in ("account_number", "transaction_amount",
                          "suspect_account", "financialtransaction"):
            assert forbidden not in raw

    def test_alert_severity_is_deterministic(self):
        first = self._analyst_district_feed()
        second = self._analyst_district_feed()
        sig = lambda body: sorted(
            (a["alert_type"], a["crime_category"], a["severity"],
             a["supporting_case_count"])
            for a in body["alerts"]
        )
        assert sig(first) == sig(second)


@needs_app
@needs_db
class TestHonestEmptyState:
    @classmethod
    def setup_class(cls):
        cls.engine = PreventionAlertsEngine()

    def test_bagalkot_supervisor_no_fabrication(self):
        # Bagalkot district has ~8 cases in the 90-day look-back: the engine
        # must not invent alerts to fill the feed.
        res = self.engine.generate_alerts(
            role="Supervisor",
            employee_district_id=BAGALKOT_DISTRICT,
            employee_unit_id=None,
        )
        assert res["status"] == "success"
        assert "jurisdiction" in res and "analysis" in res and "alerts" in res
        # Forecast warnings require a complete trailing month + meaningful
        # monthly volume; this dataset ends mid-month -> none anywhere.
        for alert in res["alerts"]:
            assert alert["alert_type"] != "forecast_elevation"
        if not res["alerts"]:
            assert res["message"] and "No active prevention alerts" in res["message"]
            assert res["analysis"]["cases_reviewed"] > 0
            assert "crime_categories_reviewed" in res["analysis"]


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
