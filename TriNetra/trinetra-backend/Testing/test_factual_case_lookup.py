"""
Regression tests for deterministic factual case lookup.

Targets the reported failure:

    "details about the last cases registered in Bengaluru Urban central"
    → previously NL2SQL returned zero records and the chatbot answered
      "I couldn't locate any matching records..." with an artificial
      "Filter applied: 1–1" trace.

These tests verify:
  - correct intent classification (case lookup, NOT pattern/financial/RAG)
  - location resolution from real District/Unit values (aliases, compound
    phrases like "Bengaluru Urban central")
  - NO artificial 1–1 / ID-range restriction
  - registration-date ordering and LIMIT behavior
  - RBAC is still applied as a mandatory condition
  - real database records are returned when they exist
  - evidence is generated from those records (no LLM hallucination)
  - unrelated engines never execute
  - new queries never inherit the previous investigation scope

Run:
    pip install pytest
    pytest test_factual_case_lookup.py -v
"""

import os
import sys

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

try:
    from engines.location_resolver import LocationResolver
    from engines.factual_lookup import FactualCaseLookup
    from engines.investigation import InvestigationPlanner
    _IMPORTS_OK = True
except Exception:  # pragma: no cover
    _IMPORTS_OK = False


def _db_available() -> bool:
    if not _IMPORTS_OK:
        return False
    # The module-level .env is loaded when the backend runs; for tests, read it
    # the same way uvicorn would (dotenv not guaranteed on PYTHONPATH here).
    if not os.getenv("NEON_DATABASE_URL"):
        env_path = os.path.join(BACKEND_DIR, ".env")
        if os.path.exists(env_path):
            for line in open(env_path, encoding="utf-8"):
                line = line.strip()
                if line.startswith("NEON_DATABASE_URL="):
                    os.environ["NEON_DATABASE_URL"] = line.split("=", 1)[1].strip().strip('"')
                    break
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

THE_FAILING_QUERY = "details about the last cases registered in Bengaluru Urban central"


# ──────────────────────────────────────────────────────────────
#  1. Intent classification
# ──────────────────────────────────────────────────────────────

@needs_db
def test_failing_query_classified_as_case_lookup():
    fl = FactualCaseLookup()
    spec = fl.analyze(THE_FAILING_QUERY)
    assert spec["is_case_lookup"] is True
    assert spec["count_only"] is False
    assert spec["recency"] == "latest"
    assert spec["limit"] is None  # reasonable default applies at execution
    assert spec["location_phrase"].lower() in ("bengaluru urban central",)


@needs_db
def test_analysis_queries_never_fall_into_factual_path():
    fl = FactualCaseLookup()
    for q in [
        "Which of these cases involve the same accused?",
        "Show the vehicle theft pattern in Bengaluru",
        "Are these suspects financially connected?",
        "Who is connected to this suspect?",
    ]:
        spec = fl.analyze(q)
        assert spec["is_case_lookup"] is False, f"should NOT be factual: {q}"


# ──────────────────────────────────────────────────────────────
#  2. Location resolution (real DB values)
# ──────────────────────────────────────────────────────────────

@needs_db
def test_location_resolution_bengaluru_variants():
    lr = LocationResolver()
    # All of these must resolve to Bengaluru Urban (DistrictID 5), never Rural
    for phrase in ["Bengaluru", "Bangalore", "Bengaluru Urban", "Bangalore Urban"]:
        r = lr.resolve(phrase)
        assert r["matched"] is True, phrase
        assert r["district_id"] == 5, f"{phrase} → {r}"
        assert r["district_name"] == "Bengaluru Urban"


@needs_db
def test_location_resolution_central_station_compound():
    lr = LocationResolver()
    r = lr.resolve("Bengaluru Urban central")
    assert r["matched"] is True
    assert r["district_id"] == 5
    # "central" must map to the Central police stations, not the whole district
    assert set(r["unit_ids"]) <= {19, 28}, r
    assert any("Central PS" in n for n in r["unit_names"]), r

    r2 = lr.resolve("Bangalore Urban Central")
    assert r2["matched"] is True and r2["district_id"] == 5
    assert set(r2["unit_ids"]) <= {19, 28}


@needs_db
def test_location_resolution_unknown_place_fails():
    r = LocationResolver().resolve("Somewhere Not Real")
    assert r["matched"] is False


# ──────────────────────────────────────────────────────────────
#  3. The actual failure — deterministic retrieval
# ──────────────────────────────────────────────────────────────

@needs_db
def test_failing_query_returns_real_records_no_artificial_filter():
    fl = FactualCaseLookup()
    res = fl.try_lookup(THE_FAILING_QUERY, rbac_filter="1=1")

    assert res["handled"] is True
    assert res["error_kind"] is None, res["answer"]
    assert res["total_count"] > 0, "must return actual records when they exist"
    assert len(res["cases"]) > 0

    # Scope is verified and the location is the real Central station area
    scope = res["scope"]
    assert scope["status"] == "verified"
    assert "Bengaluru Urban" in scope["location_resolved"]

    # No artificial single-record restriction: default limit is > 1 and the
    # answer must list records, not the NL2SQL zero-row failure text
    assert "couldn't locate any matching records" not in res["answer"]
    assert "I couldn't locate" not in res["answer"]
    assert "FIR/Case:" in res["answer"] or len(res["cases"]) > 0

    # Ordering: newest registration date first
    dates = [str(c["crimeregistereddate"]) for c in res["cases"]]
    assert dates == sorted(dates, reverse=True), "must be ordered newest-first"


@needs_db
def test_explicit_count_respects_limit():
    fl = FactualCaseLookup()
    res = fl.try_lookup("Show the latest 5 cases in Bengaluru.", rbac_filter="1=1")
    assert res["handled"] is True
    assert res["total_count"] > 0
    assert len(res["cases"]) <= 5


@needs_db
def test_unknown_location_stops_instead_of_broadening():
    fl = FactualCaseLookup()
    res = fl.try_lookup("Show cases in Somewhere Not Real", rbac_filter="1=1")
    assert res["handled"] is True
    assert res["error_kind"] == "location_unresolved"
    assert res["total_count"] == 0
    assert "couldn't resolve" in res["answer"].lower() or "resolve" in res["answer"].lower()


# ──────────────────────────────────────────────────────────────
#  4. RBAC still applies
# ──────────────────────────────────────────────────────────────

@needs_db
def test_rbac_station_filter_is_enforced():
    fl = FactualCaseLookup()
    # Station-scoped officer (Bengaluru Urban Central PS 1 = Unit 19) asks a
    # state-wide question — every returned row must belong to Unit 19.
    res = fl.try_lookup(
        "Show the recent cases.",
        rbac_filter="cm.PoliceStationID = 19",
    )
    assert res["handled"] is True
    assert len(res["cases"]) > 0, "station 19 has records; RBAC must not wipe the query"
    for c in res["cases"]:
        assert "Central PS 1" in str(c.get("police_station") or ""), c

    # Cross-station question must return nothing rather than leaking data
    res2 = fl.try_lookup(
        "Show recent cases in Mysuru.",
        rbac_filter="cm.PoliceStationID = 19",
    )
    assert res2["handled"] is True
    assert res2["total_count"] == 0


# ──────────────────────────────────────────────────────────────
#  5. Planner correction + context isolation
# ──────────────────────────────────────────────────────────────

def _planner():
    return InvestigationPlanner()


def test_planner_correction_forces_case_lookup():
    planner = _planner()
    plan = {
        "intent": "pattern_analysis",  # what a misbehaving LLM might return
        "engines": ["pattern_detection", "case_query"],
        "filters": {},
        "scope": {},
    }
    planner._deterministic_case_lookup_correction(THE_FAILING_QUERY, plan)
    assert plan["intent"] == "case_lookup"
    assert plan["engines"] == ["case_query"], "only the case query engine may run"
    assert plan["filters"]["sort"] == "crimeregistereddate_desc"
    assert plan["filters"]["time_window"] == "latest"
    assert "limit" in plan["filters"]


def test_new_query_never_inherits_previous_scope():
    planner = _planner()
    previous = {
        "plan": {"filters": {
            "crime_category": "Motor Vehicle Theft",
            "crime_sub_head_id": 11,
            "district_name": "Bengaluru",
            "district_id": 5,
            "time_window": "6m",
        }},
        "discovered_cases": [1001, 1002, 1003],
        "discovered_accused": [50, 51],
        "resolved_scope": {"status": "verified"},
    }
    new_plan = {
        "intent": "case_lookup",
        "engines": ["case_query"],
        "filters": {},
        "scope": {},
        "entities": {"case_ids": [], "accused_ids": []},
    }
    planner._merge_investigation_context(new_plan, previous, "Show the latest burglary cases in Mysuru.")
    # Nothing from the Bengaluru vehicle-theft investigation may leak through
    assert new_plan["filters"].get("crime_category") is None
    assert new_plan["filters"].get("district_name") is None
    assert new_plan["entities"]["case_ids"] == []
    assert new_plan["entities"]["accused_ids"] == []


def test_followup_does_inherit_previous_entities():
    planner = _planner()
    previous = {
        "plan": {"filters": {"district_name": "Bengaluru", "crime_category": "Vehicle Theft"}},
        "discovered_cases": [1001, 1002],
        "discovered_accused": [50],
        "resolved_scope": {"status": "verified"},
    }
    follow_plan = {
        "intent": "investigate",
        "engines": ["case_query"],
        "filters": {},
        "scope": {},
        "entities": {"case_ids": [], "accused_ids": []},
    }
    planner._merge_investigation_context(follow_plan, previous, "Which ones are connected?")
    assert follow_plan["entities"]["case_ids"] == [1001, 1002]
    assert follow_plan["entities"]["accused_ids"] == [50]
    assert follow_plan["filters"]["district_name"] == "Bengaluru"


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
