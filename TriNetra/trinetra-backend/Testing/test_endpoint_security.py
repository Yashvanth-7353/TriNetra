"""
Endpoint authentication + RBAC jurisdiction regression tests.

Verifies, at the HTTP layer, that the previously-open data endpoints now require
a valid JWT and that jurisdiction-bound roles (Investigator → station,
Supervisor → district) cannot read cases/accounts outside their scope while
state-wide roles (Analyst/Policymaker) keep their access.

Requires the same NEON_DATABASE_URL used by the backend (seeded Employee IDs
below have the documented test password '1234').

Run:
    pytest test_endpoint_security.py -v
"""
import os
import sys

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

# Seed employees (password '1234'):
#   1  = SP Bagalkot            -> Analyst      (state-wide)
#   5  = PI Bagalkot Central PS2 -> Investigator (station-scoped, UnitID 2)
#   8  = CPI Bagalkot           -> Supervisor   (district-scoped, DistrictID 1)
ANALYST_ID = 1
INVESTIGATOR_ID = 5  # Bagalkot Central PS 2
SUPERVISOR_ID = 8    # Bagalkot district
# A Bengaluru Urban case (FIR 100050030202600014) — outside every test user's scope
OUT_OF_SCOPE_CASE = 2598


@needs_app
class TestAuthRequired:
    @classmethod
    def setup_class(cls):
        cls.client = TestClient(backend_app.app)

    @pytest.mark.parametrize(
        "method,path,body",
        [
            ("GET", "/api/cases?page_size=1", None),
            ("GET", "/api/cases/2598", None),
            ("GET", "/api/cases/filters", None),
            ("GET", "/api/analytics/summary", None),
            ("GET", "/api/analytics/offenders", None),
            ("GET", "/api/patterns", None),
            ("GET", "/api/network/search?q=krishna", None),
            ("GET", "/api/network/node/1", None),
            ("GET", "/api/network/1", None),
            ("GET", "/api/analytics/alerts", None),
            ("POST", "/api/financial/analyze", {}),
            ("GET", "/api/financial/account/1", None),
            ("POST", "/api/sarvam/translate", {"text": "hi"}),
            ("POST", "/api/chat/export", {"messages": []}),
        ],
    )
    def test_no_token_is_rejected(self, method, path, body):
        resp = self.client.request(method, path, json=body)
        assert resp.status_code in (401, 403), f"{method} {path} -> {resp.status_code}"


@needs_app
@needs_db
class TestRbacJurisdiction:
    @classmethod
    def setup_class(cls):
        cls.client = TestClient(backend_app.app)

    def _token(self, employee_id):
        resp = self.client.post("/api/login", json={"employee_id": employee_id, "password": "1234"})
        assert resp.status_code == 200, resp.text
        return resp.json()["token"]

    def _auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def test_analyst_reads_out_of_district_case(self):
        tok = self._token(ANALYST_ID)
        resp = self.client.get(f"/api/cases/{OUT_OF_SCOPE_CASE}", headers=self._auth(tok))
        assert resp.status_code == 200
        assert resp.json()["case"]["crimeno"] == "100050030202600014"

    def test_investigator_cannot_read_out_of_station_case(self):
        tok = self._token(INVESTIGATOR_ID)
        resp = self.client.get(f"/api/cases/{OUT_OF_SCOPE_CASE}", headers=self._auth(tok))
        assert resp.status_code == 404  # same response as an unknown case

    def test_supervisor_cannot_read_out_of_district_case(self):
        tok = self._token(SUPERVISOR_ID)
        resp = self.client.get(f"/api/cases/{OUT_OF_SCOPE_CASE}", headers=self._auth(tok))
        assert resp.status_code == 404

    def test_investigator_case_search_only_own_station(self):
        tok = self._token(INVESTIGATOR_ID)
        resp = self.client.get("/api/cases?page_size=50", headers=self._auth(tok))
        assert resp.status_code == 200
        cases = resp.json().get("cases", [])
        assert cases, "expected scoped case rows for Bagalkot Central PS 2"
        assert all("Bagalkot Central PS 2" == c.get("police_station") for c in cases)

    def test_financial_analyze_bounded_for_investigator(self):
        tok = self._token(INVESTIGATOR_ID)
        # Requesting another district's case must yield zero accounts, not data
        resp = self.client.post(
            "/api/financial/analyze",
            json={"case_ids": [OUT_OF_SCOPE_CASE]},
            headers=self._auth(tok),
        )
        assert resp.status_code == 200
        assert resp.json()["summary"]["total_accounts"] == 0

    def test_financial_account_out_of_scope_404(self):
        # Account 1 belongs to an accused linked to a Bagalkot case (case 979),
        # outside the Bagalkot PI's station scope
        tok = self._token(INVESTIGATOR_ID)
        resp = self.client.get("/api/financial/account/1", headers=self._auth(tok))
        assert resp.status_code == 404

    def test_analyst_unscoped_financial_ok(self):
        tok = self._token(ANALYST_ID)
        resp = self.client.post("/api/financial/analyze", json={}, headers=self._auth(tok))
        assert resp.status_code == 200
        assert resp.json()["summary"]["total_accounts"] > 0

    def test_network_search_scoped_to_station(self):
        tok = self._token(INVESTIGATOR_ID)
        resp = self.client.get("/api/network/search?q=k", headers=self._auth(tok))
        assert resp.status_code == 200
        results = resp.json().get("results", [])
        # If any result comes back it must belong to Bagalkot (the PI's district)
        for r in results:
            assert r.get("district") == "Bagalkot", r

    def test_patterns_scoped_to_own_district(self):
        tok = self._token(INVESTIGATOR_ID)
        resp = self.client.get("/api/patterns", headers=self._auth(tok))
        assert resp.status_code == 200
        for p in resp.json().get("patterns", []):
            assert set(p.get("districts", [])) <= {"Bagalkot"}, p.get("districts")


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
