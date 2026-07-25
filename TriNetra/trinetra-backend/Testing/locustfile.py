"""
Load/latency benchmark using Locust — the standard open-source load-testing tool used in
production (same category as JMeter/k6; Locust is Python-native, which fits this stack).

This is what produces defensible p50/p95/p99 latency and throughput numbers instead of a
single anecdotal "<40ms" measurement from one manual test.

Install:
    pip install locust

Run (headless, 20 concurrent users ramping up over 30s, for 3 minutes):
    locust -f locustfile.py --headless -u 20 -r 2 -t 3m --host http://localhost:9000 \
        --csv=benchmark_results

Or run with the web UI for a live view:
    locust -f locustfile.py --host http://localhost:9000
    # then open http://localhost:8089

Produces: benchmark_results_stats.csv with p50/p66/p75/p80/p90/p95/p98/p99/p100 latency
per endpoint, plus requests/sec — these are the numbers that belong on the benchmarking slide,
not a single hand-timed request.
"""
from locust import HttpUser, task, between
import random

FACTUAL_QUESTIONS = [
    "How many FIRs are there in Bengaluru Urban?",
    "How many cases in Mysuru are Under Investigation?",
    "Show me murder cases registered in 2025.",
    "How many chain snatching cases occurred in Kolar?",
    "List cases with status Charge Sheeted in Dakshina Kannada.",
]

NARRATIVE_QUESTIONS = [
    "Are there any cases involving a stolen white vehicle?",
    "Is there a case involving a fraudulent bank call?",
    "Was there an incident involving forced entry through a window?",
]

NETWORK_QUERIES = [
    "Who is connected to accused 3682?",
    "Show me the network for accused 3680.",
]


class TriNetraUser(HttpUser):
    """
    Simulates a realistic mixed usage pattern: mostly factual lookups (cheapest, most
    frequent in real use), some narrative/RAG questions (more expensive), occasional
    network queries (most expensive — graph build + traversal).
    """
    wait_time = between(2, 8)  # realistic gap between an investigator's questions

    def on_start(self):
        # Replace with a real login call if your endpoint requires a token
        self.token = None
        self.session_id = f"loadtest_{random.randint(1, 100000)}"

    def _headers(self):
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    @task(6)
    def factual_lookup(self):
        q = random.choice(FACTUAL_QUESTIONS)
        self.client.post(
            "/api/chat",
            json={"query": q, "session_token": self.session_id},
            headers=self._headers(),
            name="/api/chat [factual_lookup]",
        )

    @task(3)
    def narrative_rag(self):
        q = random.choice(NARRATIVE_QUESTIONS)
        self.client.post(
            "/api/chat",
            json={"query": q, "session_token": self.session_id},
            headers=self._headers(),
            name="/api/chat [narrative_rag]",
        )

    @task(1)
    def network_query(self):
        q = random.choice(NETWORK_QUERIES)
        self.client.post(
            "/api/chat",
            json={"query": q, "session_token": self.session_id},
            headers=self._headers(),
            name="/api/chat [network_analysis]",
        )
