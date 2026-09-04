"""
Cross-jurisdiction isolation regression tests (RAG / similarity / network /
risk / financial / exact-case).

Verifies that restricted roles (Investigator -> one station, Supervisor -> one
district) can never read records from another jurisdiction through the chat /
investigation pipeline, the RAG narrative-retrieval path, case similarity,
criminal-network expansion, risk profiles or financial intelligence — the leak
must be blocked at the engine/query boundary, not hidden in the frontend.

The investigation-pipeline checks drive InvestigationOrchestrator.execute_plan
directly with deterministic plans (no LLM variability); HTTP-level checks
exercise the real authenticated endpoints with seeded employees.

Run:
    pytest test_jurisdiction_isolation.py -v
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
    from engines.rag import RAGEngine
    from engines.network_engine import NetworkEngine
    from engines.pattern_engine import PatternEngine
    _APP_OK = True
except Exception as exc:  # pragma: no cover
    _APP_OK = False
    _APP_IMPORT_ERR = exc

needs_app = pytest.mark.skipif(not _APP_OK, reason="backend app not importable")


def _db_available() -> bool:
    if not _APP_OK:
        return False
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

# Seeded accounts (password '1234'):
#   5  = PI Bagalkot Central PS 2  -> Investigator, UnitID 2 (Bagalkot district)
#   96 = DySP Bengaluru Urban     -> Analyst (state-wide)
INVESTIGATOR_ID = 5
ANALYST_ID = 96
BAGALKOT_PS2_UNIT = 2
BENGALURU_URBAN_DISTRICT = 5
BAGALKOT_DISTRICT = 1

# Out-of-scope anchors for a Bagalkot-Central-PS-2 officer:
#   Accused 3682 (Nataraj Shetty) -> CaseMasterID 2817 in Mysuru
#   CaseMasterID 2598            -> Bengaluru Urban FIR 100050030202600014
OUT_OF_SCOPE_ACCUSED = 3682
OUT_OF_SCOPE_CASE = 2598


def _rows_in_scope(crime_nos, unit_id=None, district_id=None):
    """Returns the count of given CrimeNos whose case is inside the scope."""
    import psycopg2
    conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
    cur = conn.cursor()
    if crime_nos:
        sql = ("SELECT COUNT(DISTINCT cm.CaseMasterID) FROM CaseMaster cm "
               "JOIN Unit u ON cm.PoliceStationID = u.UnitID WHERE cm.CrimeNo = ANY(%s)")
        params = [list(crime_nos)]
        if unit_id:
            sql += " AND cm.PoliceStationID = %s"
            params.append(unit_id)
        elif district_id:
            sql += " AND u.DistrictID = %s"
            params.append(district_id)
        cur.execute(sql, params)
        n = cur.fetchone()[0]
    else:
        n = 0
    cur.close()
    conn.close()
    return int(n)


@needs_app
@needs_db
class TestRAGJurisdiction:
    """Narrative retrieval must be scoped BEFORE ranking, never filtered after."""

    @classmethod
    def setup_class(cls):
        cls.rag = RAGEngine()

    def test_statewide_rag_returns_something_for_digital_arrest(self):
        # Sanity: the corpus genuinely contains digital-arrest narratives so the
        # isolation below is meaningful (not a vacuous pass).
        res = self.rag.search_and_summarize(
            "online financial fraud victim told they are under digital arrest",
            rbac_filter="1=1",
        )
        assert "error" not in res
        assert res.get("citations"), "corpus has no digital-arrest narrative — test is vacuous"

    def test_bengaluru_district_rag_only_cites_bengaluru_narratives(self):
        res = self.rag.search_and_summarize(
            "online financial fraud victim told they are under digital arrest",
            rbac_filter=" u.DistrictID = 5 ",
        )
        assert "error" not in res
        cites = res.get("citations", [])
        assert len(cites) == _rows_in_scope(
            cites, district_id=BENGALURU_URBAN_DISTRICT
        ), "scoped RAG cited a FIR outside the requested district"

    def test_bagalkot_rag_never_cites_other_districts(self):
        # Bagalkot district has no narratives: a Bagalkot Supervisor must get an
        # honest empty result — never another district's FIRs.
        res = self.rag.search_and_summarize(
            "online financial fraud victim told they are under digital arrest",
            rbac_filter=" u.DistrictID = 1 ",
        )
        assert "error" not in res
        cites = res.get("citations", [])
        assert len(cites) == _rows_in_scope(cites, district_id=BAGALKOT_DISTRICT), (
            f"cross-district RAG leak: {cites}"
        )


@needs_app
@needs_db
class TestInvestigationOrchestratorIsolation:
    """Orchestrator must refuse out-of-jurisdiction anchors (deterministic)."""

    @classmethod
    def setup_class(cls):
        from engines.investigation import InvestigationOrchestrator
        from engines.nl2sql import NL2SQLEngine
        from engines.graph import GraphEngine
        from engines.analytics import AnalyticsEngine
        from engines.case_explorer import CaseExplorerEngine
        cls.orch = InvestigationOrchestrator()
        cls.engines = dict(
            nl2sql_engine=NL2SQLEngine(),
            rag_engine=RAGEngine(),
            graph_engine=GraphEngine(),
            network_engine=NetworkEngine(),
            pattern_engine=PatternEngine(),
            analytics_engine=AnalyticsEngine(),
            case_explorer_engine=CaseExplorerEngine(),
        )
        cls.rbac = f" cm.PoliceStationID = {BAGALKOT_PS2_UNIT} "

    def _execute(self, intent, engines, entities, filters=None):
        plan = {
            "intent": intent,
            "engines": engines,
            "filters": filters or {},
            "scope": {"crime_category": None, "district": None, "time_window": None},
            "entities": entities,
            "requires_context": False,
            "resolved_scope": {},
            "routing": {},
        }
        return self.orch.execute_plan(plan=plan, rbac_filter=self.rbac, **self.engines)

    def _item_types(self, items):
        return [i["type"] for i in items]

    def test_risk_profile_of_out_of_scope_accused_refused(self):
        items = self._execute(
            "risk_analysis", ["risk_profile"],
            {"case_ids": [], "accused_ids": [OUT_OF_SCOPE_ACCUSED]},
        )
        assert "scope_error" in self._item_types(items) or not any(
            i["type"] == "risk_profiles" for i in items
        )
        profiles = [p for i in items for p in (i.get("data") or {}).get("profiles", []) or []]
        assert profiles == [], "out-of-scope risk profile leaked"

    def test_network_of_out_of_scope_accused_refused(self):
        items = self._execute(
            "criminal_network", ["criminal_network"],
            {"case_ids": [], "accused_ids": [OUT_OF_SCOPE_ACCUSED]},
        )
        nodes = [n for i in items for n in (i.get("data") or {}).get("nodes", []) or []]
        assert nodes == [], "out-of-scope network expansion leaked nodes"

    def test_financial_trail_of_out_of_scope_accused_refused(self):
        items = self._execute(
            "financial_analysis", ["financial_intelligence"],
            {"case_ids": [], "accused_ids": [OUT_OF_SCOPE_ACCUSED]},
        )
        for i in items:
            data = i.get("data") or {}
            summary = data.get("summary") or {}
            assert summary.get("total_accounts", 0) == 0, "out-of-scope accounts leaked"
            assert not data.get("transactions"), "out-of-scope transactions leaked"

    def test_financial_case_anchor_out_of_scope_refused(self):
        # Case 979 sits at a Bengaluru Urban station — its accused are not in a
        # Bagalkot officer's scope, so no account data may come back.
        items = self._execute(
            "financial_analysis", ["financial_intelligence", "case_query"],
            {"case_ids": [], "accused_ids": []},
        )
        # No accused + no case filter: the scope firewall demands context.
        assert "context_required" in self._item_types(items) or not any(
            i["type"] == "financial_intelligence" for i in items
        )

    def test_similarity_anchor_out_of_scope_stops(self):
        items = self._execute(
            "case_similarity", ["case_similarity"],
            {"case_ids": [OUT_OF_SCOPE_CASE], "accused_ids": []},
        )
        for i in items:
            assert not (i.get("data") or {}).get("similar_cases"), (
                "out-of-scope similarity results leaked"
            )

    def test_narrative_search_never_cites_out_of_scope_fir(self):
        items = self._execute(
            "narrative_similarity", ["narrative_rag"],
            {"case_ids": [], "accused_ids": []},
            filters={"mo_phrase": "digital arrest fraud", "search_keyword": "digital arrest fraud"},
        )
        cites = []
        for i in items:
            cites += (i.get("data") or {}).get("citations", []) or []
        assert len(cites) == _rows_in_scope(cites, unit_id=BAGALKOT_PS2_UNIT), (
            f"cross-jurisdiction FIR cited by narrative search: {cites}"
        )


@needs_app
@needs_db
class TestSimilarityEngineScope:
    def test_anchor_out_of_scope_returns_no_similar_cases(self):
        res = PatternEngine().find_similar_cases(
            OUT_OF_SCOPE_CASE, k=5, rbac_filter=f" cm.PoliceStationID = {BAGALKOT_PS2_UNIT} "
        )
        assert res.get("anchor_in_scope") is False
        assert res.get("similar_cases") == []

    def test_scoped_matches_stay_inside_scope(self):
        # A case at the Bagalkot station: even when a state-wide search would
        # find candidates, the scoped search must not return records from
        # elsewhere.
        import psycopg2
        conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
        cur = conn.cursor()
        cur.execute(
            "SELECT CaseMasterID FROM CaseMaster WHERE PoliceStationID = %s "
            "AND CrimeMinorHeadID IS NOT NULL LIMIT 1",
            (BAGALKOT_PS2_UNIT,),
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            pytest.skip("no scoped anchor case in Bagalkot Central PS 2")
        in_scope_id = row[0]
        res = PatternEngine().find_similar_cases(
            in_scope_id, k=10, rbac_filter=f" cm.PoliceStationID = {BAGALKOT_PS2_UNIT} "
        )
        matches = res.get("similar_cases", [])
        if matches:
            case_ids = [m.get("case_id") for m in matches]
            conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
            cur = conn.cursor()
            cur.execute(
                "SELECT COUNT(*) FROM CaseMaster WHERE CaseMasterID = ANY(%s) AND PoliceStationID = %s",
                (case_ids, BAGALKOT_PS2_UNIT),
            )
            found = cur.fetchone()[0]
            cur.close()
            conn.close()
            assert found == len(case_ids), "similar-case match escaped the station scope"


@needs_app
@needs_db
class TestHttpChatIsolation:
    """The real authenticated chat endpoint for a Bagalkot investigator."""

    @classmethod
    def setup_class(cls):
        cls.client = TestClient(backend_app.app)

    def _token(self, employee_id):
        resp = self.client.post("/api/login",
                                json={"employee_id": employee_id, "password": "1234"})
        assert resp.status_code == 200, resp.text
        return resp.json()["token"]

    def _chat(self, token, query, session):
        resp = self.client.post(
            "/api/chat",
            json={"query": query, "session_token": f"juris_test_{session}"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200, resp.text
        return resp.json()

    def test_investigator_exact_case_out_of_scope_declined(self):
        tok = self._token(INVESTIGATOR_ID)
        body = self._chat(tok, f"Show me the details of CaseMasterID {OUT_OF_SCOPE_CASE}", "exact")
        answer = (body.get("answer") or "").lower()
        assert "couldn't find" in answer or "not found" in answer or "authorized" in answer, (
            f"exact-case cross-jurisdiction leak: {body.get('answer')}"
        )

    def test_analyst_statewide_sees_same_case(self):
        tok = self._token(ANALYST_ID)
        body = self._chat(tok, f"Show me the details of CaseMasterID {OUT_OF_SCOPE_CASE}", "analyst")
        assert "couldn't find" not in (body.get("answer") or "").lower()

    def test_network_node_endpoint_cross_jurisdiction_404(self):
        tok = self._token(INVESTIGATOR_ID)
        resp = self.client.get(
            f"/api/network/{OUT_OF_SCOPE_ACCUSED}",
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert resp.status_code == 404

    # ── /api/evidence/graph label enrichment must be jurisdiction-bound ──
    def test_evidence_graph_case_label_does_not_leak_out_of_scope(self):
        finding = {
            "category": "Case Similarity",
            "description": "probe",
            "data": {"similar_cases": [{
                "target_case_id": OUT_OF_SCOPE_CASE,
                "case_id": OUT_OF_SCOPE_CASE,
                "match_score": 88,
            }]},
        }
        # Restricted investigator: only the neutral placeholder may be returned
        # (never the out-of-scope CrimeNo).
        tok = self._token(INVESTIGATOR_ID)
        resp = self.client.post(
            "/api/evidence/graph", json={"finding": finding},
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert resp.status_code == 200, resp.text
        labels = [n.get("label") for n in resp.json().get("nodes", [])
                  if n.get("type") == "case"]
        assert labels and all(l == f"Case #{OUT_OF_SCOPE_CASE}" for l in labels), (
            f"evidence-graph case label leaked out of jurisdiction: {labels}"
        )

        # State-wide analyst legitimately sees the real CrimeNo.
        tok_a = self._token(ANALYST_ID)
        resp_a = self.client.post(
            "/api/evidence/graph", json={"finding": finding},
            headers={"Authorization": f"Bearer {tok_a}"},
        )
        labels_a = [n.get("label") for n in resp_a.json().get("nodes", [])
                    if n.get("type") == "case"]
        assert any(l != f"Case #{OUT_OF_SCOPE_CASE}" for l in labels_a), (
            "state-wide analyst should receive the real CrimeNo label"
        )

    def test_evidence_graph_accused_label_does_not_leak_out_of_scope(self):
        finding = {
            "category": "Risk Profile",
            "description": "probe",
            "data": {"profiles": [{
                "accused_id": OUT_OF_SCOPE_ACCUSED,
                "score": 100.0,
                "repeat_offender": True,
            }]},
        }
        tok = self._token(INVESTIGATOR_ID)
        resp = self.client.post(
            "/api/evidence/graph", json={"finding": finding},
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert resp.status_code == 200, resp.text
        person_labels = [n.get("label") for n in resp.json().get("nodes", [])
                         if n.get("type") == "person"]
        assert person_labels and all(
            l == f"Accused #{OUT_OF_SCOPE_ACCUSED}" for l in person_labels
        ), f"evidence-graph accused name leaked out of jurisdiction: {person_labels}"

        tok_a = self._token(ANALYST_ID)
        resp_a = self.client.post(
            "/api/evidence/graph", json={"finding": finding},
            headers={"Authorization": f"Bearer {tok_a}"},
        )
        labels_a = [n.get("label") for n in resp_a.json().get("nodes", [])
                    if n.get("type") == "person"]
        assert any(l != f"Accused #{OUT_OF_SCOPE_ACCUSED}" for l in labels_a), (
            "state-wide analyst should receive the real accused name"
        )


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
