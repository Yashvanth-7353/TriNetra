"""
Regression tests for ENTITY-FIRST exact case/FIR resolution.

Targets: exact FIR questions that were previously answered with a broad,
state-wide case list:

    "100050030202600014 what is this case details"        → must return ONLY that case
    "is 100050030202600014 a vehicle theft case?"          → NO, it is Burglary (verification
                                                              must never become a filter)
    "999999999999999999 what is this case?"                → exact not-found, no broad fallback

Known record (verified against the seeded database):
    CrimeNo 100050030202600014 → CaseMasterID 2598, Burglary, Bengaluru Urban,
    Bengaluru Urban Station Road PS 12, registered 2026-07-10, Under Investigation.

Run:
    pip install pytest
    pytest test_exact_case_lookup.py -v
"""

import os
import sys

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

try:
    from engines.exact_case import ExactCaseResolver
    _IMPORTS_OK = True
except Exception:  # pragma: no cover
    _IMPORTS_OK = False


def _db_available() -> bool:
    if not _IMPORTS_OK:
        return False
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

CRIME_NO = "100050030202600014"
INVALID_ID = "999999999999999999"


def _single(res):
    assert res["handled"] is True
    assert res["total_count"] == 1, res["answer"]
    assert len(res["cases"]) == 1
    return res["cases"][0]


# ──────────────────────────────────────────────────────────────
#  1. Exact details resolve to exactly one record
# ──────────────────────────────────────────────────────────────

@needs_db
def test_exact_case_details():
    res = ExactCaseResolver().try_handle(f"{CRIME_NO} what is this case details", rbac_filter="1=1")
    rec = _single(res)
    assert rec["crimeno"] == CRIME_NO
    assert rec["crimeno"] == CRIME_NO
    assert rec["crime_sub_head"] == "Burglary"
    assert rec["casestatusname"] == "Under Investigation"
    assert rec["districtname"] == "Bengaluru Urban"
    assert str(rec["crimeregistereddate"]).startswith("2026-07-10")
    assert res["scope"]["status"] == "verified"
    assert res["scope"]["records_found"] == 1
    # Scope must show the case — never State-wide / All time
    assert res["scope"].get("case_id") == CRIME_NO


@needs_db
def test_tell_me_about_exact_case():
    res = ExactCaseResolver().try_handle(f"tell me about {CRIME_NO}", rbac_filter="1=1")
    _single(res)
    assert CRIME_NO in res["answer"]
    assert "Burglary" in res["answer"]


# ──────────────────────────────────────────────────────────────
#  2. Verification never becomes a filter
# ──────────────────────────────────────────────────────────────

@needs_db
def test_vehicle_theft_verification_is_no():
    res = ExactCaseResolver().try_handle(
        f"is {CRIME_NO} this ID belongs to vehicle theft case or what?", rbac_filter="1=1"
    )
    rec = _single(res)
    assert rec["crime_sub_head"] == "Burglary"
    assert res["answer"].lower().startswith("no")
    assert "motor vehicle theft" in res["answer"].lower()
    assert "burglary" in res["answer"].lower()
    # Never a list of Motor Vehicle Theft cases
    assert len(res["cases"]) == 1


@needs_db
def test_burglary_verification_is_yes():
    res = ExactCaseResolver().try_handle(f"is {CRIME_NO} a burglary case?", rbac_filter="1=1")
    _single(res)
    assert res["answer"].lower().startswith("yes")


@needs_db
def test_crime_question():
    res = ExactCaseResolver().try_handle(f"what crime is {CRIME_NO}?", rbac_filter="1=1")
    _single(res)
    assert "Burglary" in res["answer"]
    assert res.get("intent") == "crime_question"


# ──────────────────────────────────────────────────────────────
#  3. Attribute questions answer from the exact record
# ──────────────────────────────────────────────────────────────

@needs_db
def test_when_question():
    res = ExactCaseResolver().try_handle(f"when was {CRIME_NO} registered?", rbac_filter="1=1")
    _single(res)
    assert "2026-07-10" in res["answer"]


@needs_db
def test_where_question():
    res = ExactCaseResolver().try_handle(f"where was {CRIME_NO} registered?", rbac_filter="1=1")
    _single(res)
    assert "Bengaluru Urban" in res["answer"]
    assert "Station Road PS 12" in res["answer"]


@needs_db
def test_status_question():
    res = ExactCaseResolver().try_handle(f"what is the status of {CRIME_NO}?", rbac_filter="1=1")
    _single(res)
    assert "Under Investigation" in res["answer"]


@needs_db
def test_location_verification_yes_and_no():
    yes = ExactCaseResolver().try_handle(f"Was {CRIME_NO} registered in Bengaluru?", rbac_filter="1=1")
    _single(yes)
    assert yes["answer"].lower().startswith("yes")
    no = ExactCaseResolver().try_handle(f"was {CRIME_NO} registered in Mysuru?", rbac_filter="1=1")
    _single(no)
    assert no["answer"].lower().startswith("no")


# ──────────────────────────────────────────────────────────────
#  4. Invalid identifier → exact not-found, no broad fallback
# ──────────────────────────────────────────────────────────────

@needs_db
def test_invalid_id_exact_not_found():
    res = ExactCaseResolver().try_handle(f"{INVALID_ID} what is this case?", rbac_filter="1=1")
    assert res["handled"] is True
    assert res["total_count"] == 0
    assert res["cases"] == []
    assert res["scope"]["status"] == "failed"
    assert "couldn't find" in res["answer"].lower()
    assert "couldn't find" in res["answer"].lower()
    assert INVALID_ID in res["answer"]


# ──────────────────────────────────────────────────────────────
#  5. Detection patterns
# ──────────────────────────────────────────────────────────────

@needs_db
def test_identifier_detection_variants():
    resolver = ExactCaseResolver()
    # Bare 18-digit CrimeNo
    d = resolver.detect_identifier(f"what is {CRIME_NO}?")
    assert d["found"] and d["value"] == CRIME_NO
    # FIR prefix + number
    d = resolver.detect_identifier("show evidence for FIR " + CRIME_NO)
    assert d["found"] and d["value"] == CRIME_NO
    # casemaster id prefix
    d = resolver.detect_identifier("details of CaseMasterID 2598")
    assert d["found"] and d["value"] == "2598" and d["hint"] == "casemaster_id"
    # CaseNo prefix resolves through the database
    d = resolver.detect_identifier("what is case no 202600014?")
    assert d["found"] and d["value"] == "202600014"
    # A short generic query must NOT be treated as an exact case
    d = resolver.detect_identifier("show latest cases in Bengaluru")
    assert not d["found"]


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
