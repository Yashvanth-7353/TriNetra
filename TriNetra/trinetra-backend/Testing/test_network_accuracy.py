"""
Network Analysis accuracy benchmark — precision/recall against known ground-truth gangs.

Methodology: standard information-retrieval precision/recall, applied to graph output.
For each seeded gang, query the network engine starting from ONE known member, and check
whether the returned subgraph recovers the other real members' cases.

  precision = (returned cases that are actually in the gang) / (total cases returned)
  recall    = (gang cases found) / (total real gang cases)
  F1        = harmonic mean of the two

Run:
    pip install pytest requests
    pytest test_network_accuracy.py -v --tb=short
"""
import json
import requests
import pytest

API_BASE = "http://localhost:9000"
NETWORK_ENDPOINT = f"{API_BASE}/api/network"  # adjust to your actual route
AUTH_TOKEN = None

with open("ground_truth_networks.json") as f:
    GROUND_TRUTH = json.load(f)

# One verified anchor AccusedMasterID per gang (from the actual seeded data) —
# fill these in from your own DB if AccusedMasterIDs differ from what's listed here;
# these are the ones confirmed against the reference dataset build.
GANG_ANCHORS = {
    "OTP/Cyber Fraud Call Ring": 3682,  # Nataraj Shetty, CaseMasterID 2817
}


@pytest.mark.parametrize("gang_name,anchor_id", GANG_ANCHORS.items())
def test_network_precision_recall(gang_name, anchor_id):
    gang = next(g for g in GROUND_TRUTH["gangs"] if g["name"] == gang_name)
    expected_cases = set(gang["case_ids"])

    headers = {"Authorization": f"Bearer {AUTH_TOKEN}"} if AUTH_TOKEN else {}
    resp = requests.get(f"{NETWORK_ENDPOINT}/{anchor_id}", headers=headers, timeout=30)
    assert resp.status_code == 200, f"HTTP {resp.status_code}: {resp.text}"
    graph = resp.json()

    returned_cases = set()
    for edge in graph.get("edges", []):
        if edge.get("case"):
            returned_cases.add(int(edge["case"]))

    true_positives = returned_cases & expected_cases
    precision = len(true_positives) / len(returned_cases) if returned_cases else 0
    recall = len(true_positives) / len(expected_cases) if expected_cases else 0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0

    print(f"\n  {gang_name}: precision={precision:.2f} recall={recall:.2f} f1={f1:.2f}")
    print(f"  Expected {len(expected_cases)} cases, found {len(true_positives)}, "
          f"returned {len(returned_cases)} total (extra beyond ground truth: "
          f"{returned_cases - expected_cases})")

    # Report-only by default — flip to a hard assertion once you've tuned the traversal:
    # assert recall >= 0.8, f"{gang_name}: recall too low ({recall:.2f})"


def test_isolated_accused_returns_empty_or_small_network():
    """
    Negative test: an accused with no real connections should NOT be reported as
    part of a large network. This catches false positives from the repeat_identity
    name-matching edge type, which is the noisiest signal in this dataset (see
    ground_truth_networks.json's known_data_limitation note).
    """
    # Replace with a genuinely isolated AccusedMasterID from your own DB
    isolated_id = 3559
    headers = {"Authorization": f"Bearer {AUTH_TOKEN}"} if AUTH_TOKEN else {}
    resp = requests.get(f"{NETWORK_ENDPOINT}/{isolated_id}", headers=headers, timeout=30)
    assert resp.status_code == 200
    graph = resp.json()
    node_count = len(graph.get("nodes", []))
    print(f"\n  Isolated accused {isolated_id}: returned {node_count} nodes")
    assert node_count <= 3, (
        f"Expected an isolated accused to return a small/empty network, got {node_count} nodes "
        f"— likely a false-positive name-collision edge, see known_data_limitation"
    )


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-v", "-s"]))
