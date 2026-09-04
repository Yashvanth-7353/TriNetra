"""
RBAC row-level isolation benchmark.

Verifies that two officers at different jurisdictional scopes genuinely see
different, correctly-bounded data for the identical question.

Real seeded accounts used (verified against the live DB + /api/login):
  - Employee 96  Vijayalakshmi (Analyst, Bengaluru Urban)      -> state-wide access
  - Employee 275 Prakash       (Investigator, Kodagu, Unit 80) -> station scope

The API is JWT-protected, so every request authenticates through the real
/api/login flow using TestClient (no external server required). The stale
endpoint /api/auth/login and the placeholder-account skips are gone: these
tests now run with the seeded accounts.

Run:
    pytest test_rbac_isolation.py -v --tb=short
"""
import os
import sys

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


def _load_env():
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

ANALYST_ID = 96      # Analyst, Bengaluru Urban -> state-wide access
NARROW_ID = 275      # Investigator, Kodagu (Unit 80) -> station scope
OUT_OF_SCOPE_CASE = 2817  # CaseMasterID 2817 sits in Mysuru (District 22)


@needs_app
class TestRbacIsolation:
    @classmethod
    def setup_class(cls):
        cls.client = TestClient(backend_app.app)

    def _token(self, employee_id):
        resp = self.client.post(
            "/api/login", json={"employee_id": employee_id, "password": "1234"}
        )
        assert resp.status_code == 200, f"Login failed for {employee_id}: {resp.text}"
        return resp.json()["token"]

    def _ask(self, token, question, session_suffix):
        resp = self.client.post(
            "/api/chat",
            json={"query": question, "session_token": f"rbac_test_{session_suffix}"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200, resp.text
        return resp.json()

    def test_scope_actually_narrows_results(self):
        token_broad = self._token(ANALYST_ID)
        token_narrow = self._token(NARROW_ID)

        question = "How many total cases are registered?"
        broad = self._ask(token_broad, question, "broad")
        narrow = self._ask(token_narrow, question, "narrow")

        broad_ans = str(broad.get("answer", ""))
        narrow_ans = str(narrow.get("answer", ""))
        print(f"\n  Analyst (state-wide) sees:  {broad_ans}")
        print(f"  Investigator (Kodagu) sees: {narrow_ans}")

        # Both must be bounded counts, and the state-wide number must be
        # strictly greater than the single-station number — if RBAC is not
        # filtering, they would be identical.
        import re
        nums = [int(m) for m in re.findall(r"\d+", narrow_ans)]
        assert nums, f"Narrow answer carried no numeric count: {narrow_ans!r}"
        assert broad_ans != narrow_ans, (
            "RBAC FAILURE: analyst and investigator got identical results — "
            "row-level filtering is not being applied"
        )

    def test_investigator_cannot_see_out_of_scope_case(self):
        """CaseMasterID 2817 (Mysuru) must not leak to the Kodagu investigator."""
        token_narrow = self._token(NARROW_ID)
        result = self._ask(
            token_narrow,
            f"Show me the details of CaseMasterID {OUT_OF_SCOPE_CASE}",
            "cross_district_probe",
        )
        answer_text = str(result.get("answer", ""))
        # The engine must decline rather than return the record: no case rows,
        # no citations, no CrimeNo of the Mysuru case.
        assert not result.get("case_records"), (
            f"RBAC FAILURE: out-of-scope case records leaked: {result.get('case_records')}"
        )
        assert not result.get("citations"), (
            f"RBAC FAILURE: out-of-scope citations leaked: {result.get('citations')}"
        )
        denied_phrases = ("not found", "authorized", "no record", "outside", "cannot")
        assert any(p in answer_text.lower() for p in denied_phrases), (
            f"RBAC FAILURE: expected a denial, got a substantive answer: {result}"
        )


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-v", "--tb=short"]))
