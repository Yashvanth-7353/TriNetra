# TriNetra Benchmark Suite

Five test harnesses, each using a standard/production tool rather than a bespoke script —
this is what makes the numbers defensible if a judge asks "how did you measure that."

| Benchmark | Tool | What it proves |
|---|---|---|
| `test_nl2sql_accuracy.py` | pytest, execution-accuracy methodology (same approach as the Spider/WikiSQL academic NL2SQL benchmarks) | NL2SQL correctness against verified real answers |
| `test_network_accuracy.py` | pytest, precision/recall (standard IR metric) | Graph engine correctly recovers known gang clusters |
| `test_rag_ragas.py` | [Ragas](https://github.com/explodinggradients/ragas) — the standard open-source RAG evaluation framework | Faithfulness, relevancy, retrieval quality |
| `test_security_guardrails.py` | pytest + standard SQLi test payloads; optional `sqlmap` pass | SQL injection defenses actually hold |
| `test_rbac_isolation.py` | pytest | Role-based scoping genuinely filters data, not just cosmetically |
| `locustfile.py` | [Locust](https://locust.io/) — production load-testing tool | p50/p95/p99 latency and throughput under concurrent load |

## Setup

```bash
pip install pytest requests ragas datasets locust psycopg2-binary
```

Start your backend (`uvicorn app:app --port 9000`), then from this directory:

```bash
# 1. NL2SQL accuracy — the most important one to run first
pytest test_nl2sql_accuracy.py -v --tb=short | tee nl2sql_results.txt

# 2. Network analysis precision/recall
pytest test_network_accuracy.py -v -s | tee network_results.txt

# 3. RAG quality (needs an LLM judge — set up langchain-openai or langchain-anthropic first)
python test_rag_ragas.py

# 4. Security guardrails
pytest test_security_guardrails.py -v | tee security_results.txt

# 5. RBAC isolation (fill in real test-account passwords first, remove the @pytest.mark.skip)
pytest test_rbac_isolation.py -v -s

# 6. Load/latency
locust -f locustfile.py --headless -u 20 -r 2 -t 3m --host http://localhost:9000 --csv=load_results
```

## What to actually put on the Benchmarking slide

Don't put "we ran tests" — put the actual numbers pytest and Locust print out:

- **NL2SQL accuracy**: `X/10 golden questions passed` (pytest's summary line gives you this
  directly — e.g. "8 passed, 2 failed"). State the percentage.
- **Network analysis**: precision/recall/F1 per gang from the test output — pick your best
  and be honest about your worst; a 0.85 F1 with a stated limitation reads better than an
  unverifiable "high accuracy" claim.
- **RAG quality**: the four Ragas scores (0-1 scale) — report as a small table, they're
  designed to be presented exactly that way.
- **Security**: "X/6 injection attempts blocked" from the guardrail suite.
- **Latency**: p50 and p95 from the Locust CSV, per endpoint type (factual lookup vs. RAG vs.
  network — these should show meaningfully different latencies, which itself is a credible
  signal that the engines are actually doing different amounts of work rather than routing
  to one generic path).

## Before you run these

1. **Fill in real employee passwords** in `test_rbac_isolation.py` — they're placeholders.
2. **Adjust `extract_numeric_answer()`** in `test_nl2sql_accuracy.py` and the endpoint paths
   throughout to match your actual API response shapes — I built these against the contract
   described in your docs, but field names may differ slightly in the real implementation.
3. **Known dataset limitation, read before trusting network benchmark results below ~0.85
   recall**: `ground_truth_networks.json` documents that the synthetic name pool causes
   incidental collisions beyond the 8 designed gangs. If your network engine's
   `repeat_identity` edge type matches by name, it will pull in some extra, coincidentally
   named accused that aren't really part of the gang — this will show up as lower precision
   in the benchmark. That's a real, worth-mentioning finding about the synthetic data, not
   necessarily a bug in your graph engine — say so explicitly if it comes up, rather than
   quietly tuning the test until it passes.
4. **Run the security suite against a dev/staging instance only** — not production, not a
   shared demo URL, even though these are defensive tests against your own system.
