"""
Network Analysis accuracy/integrity benchmark (authenticated API).

Methodology:
  - precision against the seeded OTP/Cyber-Fraud ground-truth gang: every case
    id reachable from a known gang anchor must belong to the gang's case set.
  - structural integrity: every returned node must correspond to a real
    Accused row and every edge must connect returned nodes and reference a real
    CaseMaster record.
  - negative test: an accused with no co-accused / shared identity / shared MO /
    victim-name crossover / suspect account must NOT be reported as part of a
    large network (catches false-positive edges).

The API is JWT-protected, so each request authenticates as the state-wide
Analyst seed account (EmployeeID 96) against the real FastAPI app via
TestClient — no external server required.

Run:
    pytest test_network_accuracy.py -v --tb=short
"""
import os
import sys

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

GROUND_TRUTH_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                 "ground_truth_networks.json")

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
    import json
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

ANALYST_ID = 96  # DySP Bengaluru Urban -> state-wide access
GANG_ANCHORS = {"OTP/Cyber Fraud Call Ring": 3682}  # Nataraj Shetty, CaseMasterID 2817


@needs_app
@needs_db
class TestNetworkAccuracy:
    @classmethod
    def setup_class(cls):
        cls.client = TestClient(backend_app.app)
        with open(GROUND_TRUTH_PATH, encoding="utf-8") as f:
            cls.ground_truth = json.load(f)

    def _token(self, employee_id=ANALYST_ID):
        resp = self.client.post("/api/login",
                                json={"employee_id": employee_id, "password": "1234"})
        assert resp.status_code == 200, resp.text
        return resp.json()["token"]

    def _headers(self):
        return {"Authorization": f"Bearer {self._token()}"}

    def test_otp_ring_precision_and_integrity(self):
        gang_name, anchor_id = next(iter(GANG_ANCHORS.items()))
        gang = next(g for g in self.ground_truth["gangs"] if g["name"] == gang_name)
        gang_case_ids = set(gang["case_ids"])

        resp = self.client.get(f"/api/network/{anchor_id}?hops=2", headers=self._headers())
        assert resp.status_code == 200, resp.text
        graph = resp.json()

        nodes = graph.get("nodes", [])
        edges = graph.get("edges", [])
        assert graph.get("root_node") == f"A{anchor_id}"

        # Structural integrity: nodes reference real accused rows and edges
        # reference real cases and only connect returned nodes.
        import psycopg2
        conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
        cur = conn.cursor()
        node_ids = {n["id"] for n in nodes}
        node_accused = [int(n["id"][1:]) for n in nodes if n.get("id", "").startswith("A")]
        cur.execute("SELECT COUNT(*) FROM Accused WHERE AccusedMasterID = ANY(%s)",
                    (node_accused,))
        assert cur.fetchone()[0] == len(node_accused), "a graph node has no Accused row"
        edge_case_ids = {int(e["case_id"]) for e in edges if e.get("case_id")}
        if edge_case_ids:
            cur.execute("SELECT COUNT(*) FROM CaseMaster WHERE CaseMasterID = ANY(%s)",
                        (list(edge_case_ids),))
            assert cur.fetchone()[0] == len(edge_case_ids), "an edge references a missing case"
        cur.close()
        conn.close()
        for e in edges:
            assert e["from"] in node_ids and e["to"] in node_ids, (
                "edge connects to a node outside the returned graph"
            )

        # Precision: any case referenced from the anchor's expansion belongs to
        # the ground-truth gang (no cross-gang contamination from this anchor).
        returned_cases = {int(e["case_id"]) for e in edges if e.get("case_id")}
        outside = returned_cases - gang_case_ids
        assert not outside, f"anchor {anchor_id} reached non-gang cases {outside}"
        print(f"\n  {gang_name}: reached cases {sorted(returned_cases)} "
              f"(all inside the {len(gang_case_ids)}-case ground truth)")

    def test_isolated_accused_returns_no_large_network(self):
        """
        An accused with no co-accused, no shared identity, no shared MO tag, no
        victim-name crossover and no suspect account must not be reported inside
        a large network (this is the false-positive guard for name/MO edges).
        The isolated anchor is derived from the database at run time.
        """
        import psycopg2
        conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
        cur = conn.cursor()
        cur.execute("""
            SELECT a.AccusedMasterID
            FROM Accused a
            WHERE NOT EXISTS (
                SELECT 1 FROM Accused b
                WHERE b.CaseMasterID = a.CaseMasterID AND b.AccusedMasterID != a.AccusedMasterID)
              AND NOT EXISTS (
                SELECT 1 FROM SuspectAccount sa WHERE sa.AccusedMasterID = a.AccusedMasterID)
              AND NOT EXISTS (
                SELECT 1 FROM Victim v
                WHERE LOWER(TRIM(v.VictimName)) = LOWER(TRIM(a.AccusedName)))
              AND NOT EXISTS (
                SELECT 1 FROM ModusOperandi mo1
                JOIN ModusOperandi mo2 ON mo1.MOTagID = mo2.MOTagID
                WHERE mo1.CaseMasterID = a.CaseMasterID AND mo2.CaseMasterID != a.CaseMasterID)
            ORDER BY a.AccusedMasterID
            LIMIT 10
        """)
        isolated = [r[0] for r in cur.fetchall()]
        cur.close()
        conn.close()
        if not isolated:
            pytest.skip("no genuinely isolated accused found in the dataset")

        for accused_id in isolated[:3]:
            resp = self.client.get(f"/api/network/{accused_id}?hops=2",
                                   headers=self._headers())
            # The accused exists but has NO connections: the graph traversal
            # must either answer 200 with an empty/small subgraph or 404 with
            # "not found in network graph" — never a large fabricated network.
            if resp.status_code == 404:
                assert "not found in network graph" in resp.json().get("detail", "").lower(), resp.text
                continue
            assert resp.status_code == 200, resp.text
            node_count = len(resp.json().get("nodes", []))
            assert node_count <= 2, (
                f"isolated accused {accused_id} reported inside a {node_count}-node "
                "network — likely a false-positive edge"
            )


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v", "-s"]))
