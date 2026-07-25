"""
RBAC row-level isolation benchmark.

Verifies that two officers at different jurisdictional scopes genuinely see different,
correctly-bounded data for the identical question — this is the core claim of your
security architecture and it's cheap to verify automatically.

Uses two real Employee IDs from the seeded dataset, verified to sit at different scopes:
  - EmployeeID 96  (Roopa/Vijayalakshmi, DySP, Bengaluru Urban Central PS 10 — busiest station)
  - EmployeeID 275 (Prakash, PI, Kodagu West PS 2 — small rural station)

Run:
    pip install pytest requests
    pytest test_rbac_isolation.py -v -s
"""
import requests
import pytest

API_BASE = "http://localhost:9000"
LOGIN_ENDPOINT = f"{API_BASE}/api/auth/login"
CHAT_ENDPOINT = f"{API_BASE}/api/chat"

# Set real passwords for these test accounts in your dev/staging environment before running.
TEST_ACCOUNTS = {
    "broad_scope_supervisor": {"employee_id": 96, "password": "CHANGE_ME"},
    "narrow_scope_investigator": {"employee_id": 275, "password": "CHANGE_ME"},
}


def login(employee_id, password):
    resp = requests.post(LOGIN_ENDPOINT, json={"employee_id": employee_id, "password": password})
    assert resp.status_code == 200, f"Login failed for {employee_id}: {resp.text}"
    return resp.json()["token"]


def ask(token, question, session_suffix):
    resp = requests.post(
        CHAT_ENDPOINT,
        json={"query": question, "session_token": f"rbac_test_{session_suffix}"},
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    assert resp.status_code == 200
    return resp.json()


@pytest.mark.skip(reason="Set real passwords in TEST_ACCOUNTS before enabling")
def test_scope_actually_narrows_results():
    token_broad = login(**TEST_ACCOUNTS["broad_scope_supervisor"])
    token_narrow = login(**TEST_ACCOUNTS["narrow_scope_investigator"])

    question = "How many total cases can you see?"

    broad_result = ask(token_broad, question, "broad")
    narrow_result = ask(token_narrow, question, "narrow")

    print(f"\n  Supervisor (station 28, Bengaluru Urban Central) sees: {broad_result.get('answer')}")
    print(f"  Investigator (station, Kodagu West) sees: {narrow_result.get('answer')}")

    # The two answers must differ — if RBAC isn't actually filtering, they'll be identical
    assert broad_result.get("answer") != narrow_result.get("answer"), (
        "RBAC FAILURE: supervisor and investigator got identical results for a scope-bound "
        "question — row-level filtering is not being applied"
    )


@pytest.mark.skip(reason="Set real passwords in TEST_ACCOUNTS before enabling")
def test_investigator_cannot_see_other_district_case():
    """
    A stronger check than the count comparison above: try to directly ask the narrow-scope
    investigator about a specific case known to belong to a DIFFERENT district, and confirm
    the system declines/returns nothing rather than leaking it.
    """
    token_narrow = login(**TEST_ACCOUNTS["narrow_scope_investigator"])
    # CaseMasterID 2817 belongs to the OTP ring in Bengaluru Urban / Mysuru, not Kodagu
    result = ask(token_narrow, "Show me the details of CaseMasterID 2817", "cross_district_probe")
    answer_text = str(result.get("answer", "")).lower()
    assert "access" in answer_text or "not found" in answer_text or "no data" in answer_text, (
        f"RBAC FAILURE: investigator outside the case's district got a substantive answer: {result}"
    )


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-v", "-s"]))
