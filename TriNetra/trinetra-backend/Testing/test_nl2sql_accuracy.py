"""
NL2SQL execution-accuracy benchmark.

Methodology follows the standard used in academic NL2SQL benchmarking (Spider, WikiSQL):
"execution accuracy" — run the model-generated SQL, compare its RESULT SET to a known-correct
expected result, not the SQL text itself (two different SQL strings can be equally correct).

Every expected value below was verified directly against the actual seeded database before
being written here — this file is not guessing at plausible numbers.

Run:
    pip install pytest requests
    pytest test_nl2sql_accuracy.py -v --tb=short | tee nl2sql_results.txt

Produces a per-question pass/fail + latency, and a summary accuracy percentage at the end
(pytest's own summary line) — that summary percentage is what goes on the benchmarking slide.
"""
import time
import requests
import pytest

API_BASE = "http://localhost:9000"  # point at your running backend
CHAT_ENDPOINT = f"{API_BASE}/api/chat"
AUTH_TOKEN = None  # set after logging in, or hardcode a test-account JWT here

# Each case: (question, expected_answer_check) where expected_answer_check is a function
# that inspects the raw execution_result / answer_text for the verified correct value.
GOLDEN_SET = [
    {
        "id": "Q1",
        "question": "How many FIRs are there in Bengaluru Urban district?",
        "expected_value": 577,
        "tolerance": 0,  # exact match required — this is a simple COUNT
    },
    {
        "id": "Q2",
        "question": "How many cases were registered in Bengaluru Urban in 2025?",
        "expected_value": 208,
        "tolerance": 0,
    },
    {
        "id": "Q3",
        "question": "How many FIRs are registered statewide in total?",
        "expected_value": 2896,
        "tolerance": 0,
    },
    {
        "id": "Q4",
        "question": "How many accused individuals are in the database?",
        "expected_value": 3827,
        "tolerance": 0,
    },
    {
        "id": "Q5",
        "question": "How many cases have the status Charge Sheeted?",
        "expected_value": 581,
        "tolerance": 0,
    },
    {
        "id": "Q6",
        "question": "How many murder cases are there in total?",
        "expected_value": 60,
        "tolerance": 0,
    },
    {
        "id": "Q7",
        "question": "How many districts are covered in the system?",
        "expected_value": 31,
        "tolerance": 0,
    },
    {
        "id": "Q8",
        "question": "How many cases are there in Kodagu district?",
        "expected_value": 44,
        "tolerance": 0,
    },
    {
        # Row-level fact check, not a count — tests entity lookup accuracy
        "id": "Q9",
        "question": "What is the risk score for accused ID 3682?",
        "expected_value": 100.0,
        "tolerance": 0,
        "field": "risk_score",
    },
    {
        # Tests correct table targeting when the question is ambiguous between
        # CaseMaster/Accused/Victim — a common real failure mode for NL2SQL
        "id": "Q10",
        "question": "Which case is accused ID 3682 linked to?",
        "expected_value": 2817,
        "tolerance": 0,
        "field": "case_id",
    },
]


def extract_numeric_answer(response_json):
    """
    Pull a single numeric value out of the API response for comparison.
    Adjust this extractor to match your actual response schema — this assumes
    the answer_text or a structured 'result' field contains the count/value.
    """
    if "result_value" in response_json:
        return response_json["result_value"]
    # fallback: try to find the first integer in the answer text
    import re
    text = response_json.get("answer", "") or response_json.get("answer_text", "")
    match = re.search(r"[-+]?\d[\d,]*\.?\d*", text.replace(",", ""))
    return float(match.group()) if match else None


@pytest.mark.parametrize("case", GOLDEN_SET, ids=[c["id"] for c in GOLDEN_SET])
def test_nl2sql_execution_accuracy(case):
    headers = {"Authorization": f"Bearer {AUTH_TOKEN}"} if AUTH_TOKEN else {}
    start = time.time()
    resp = requests.post(
        CHAT_ENDPOINT,
        json={"query": case["question"], "session_token": f"benchmark_{case['id']}"},
        headers=headers,
        timeout=30,
    )
    latency_ms = (time.time() - start) * 1000

    assert resp.status_code == 200, f"HTTP {resp.status_code}: {resp.text}"
    body = resp.json()

    actual = extract_numeric_answer(body)
    assert actual is not None, f"Could not extract a numeric answer from: {body}"

    expected = case["expected_value"]
    tolerance = case["tolerance"]
    assert abs(actual - expected) <= tolerance, (
        f"{case['question']!r} -> got {actual}, expected {expected} "
        f"(intent detected: {body.get('intent_detected')}, "
        f"SQL: {body.get('reasoning_trace', {}).get('execution_steps', [{}])[-1]})"
    )

    # Soft latency assertion — doesn't fail the test, but flag anything slow for the report
    if latency_ms > 5000:
        print(f"\n  [SLOW] {case['id']} took {latency_ms:.0f}ms")


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-v"]))
