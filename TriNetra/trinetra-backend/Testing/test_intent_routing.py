"""
Regression tests for the intent → entity → scope → engine → evidence → response
pipeline (chatbot routing correctness).

Covers the acceptance scenarios:
    - MO/similar-case questions NEVER route to factual_lookup
    - pattern vs trend distinction (recurring pattern → pattern engine)
    - trend questions still use trend_analysis with real time-series data
    - financial-trail requests without context → Context Required, ZERO broad queries
    - financial with context → financial_intelligence on the previous FIR entities
    - network follow-ups reuse the exact FIR context
    - new scope replaces old scope (no leakage)
    - exact FIR ID overrides inferred crime filters
    - multi-engine questions use minimal relevant orchestration

Deterministic tests never call the LLM. DB-gated pipeline tests run the full
investigation pipeline with the LLM planner disabled (deterministic fallback),
so routing behaviour is fully reproducible.

Run:
    pytest test_intent_routing.py -v
"""

import os
import sys

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

try:
    from engines.intent_classifier import DeterministicIntentClassifier
    from engines.investigation import InvestigationPlanner, InvestigationOrchestrator, InvestigationEngine
    _IMPORTS_OK = True
except Exception:  # pragma: no cover
    _IMPORTS_OK = False

needs_imports = pytest.mark.skipif(not _IMPORTS_OK, reason="backend engines not importable")


def _db_available() -> bool:
    if not _IMPORTS_OK:
        return False
    if not os.getenv("NEON_DATABASE_URL"):
        env_path = os.path.join(BACKEND_DIR, ".env")
        if os.path.exists(env_path):
            for line in open(env_path, encoding="utf-8-sig"):
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

FIR = "100050030202600014"
CTX_FIR = {
    "plan": {"filters": {}},
    "resolved_scope": {},
    "discovered_cases": [2598],
    "discovered_accused": [1, 2, 3],
}


# ════════════════════════════════════════════════════════════════
#  0. Exact-case analysis-anchor guard (no LLM, no DB)
# ════════════════════════════════════════════════════════════════

@needs_imports
class TestExactCaseAnalysisAnchor:
    """
    A question that names a specific FIR but asks for an ANALYSIS of that FIR
    (similar cases / financial trail / network links) must NOT be swallowed by
    the exact-case resolver into a bare record description.
    """

    def _anchor(self, q):
        from engines.exact_case import is_analysis_anchored
        return is_analysis_anchored(q)

    @pytest.mark.parametrize(
        "q",
        [
            "Find cases similar to FIR 100050030202600014.",
            "Show the financial trail for FIR 100050030202600014.",
            "Show the transactions involving FIR 100050030202600014.",
            "Who is connected to FIR 100050030202600014?",
            "Find cases linked to FIR 100050030202600014.",
        ],
    )
    def test_analysis_anchored_queries_declined(self, q):
        assert self._anchor(q), q

    @pytest.mark.parametrize(
        "q",
        [
            "What is FIR 100050030202600014?",
            "Is FIR 100050030202600014 a vehicle theft case?",
            "What is the modus operandi in FIR 100050030202600014?",
            "Show details of FIR 100050030202600014",
            "What is the status of FIR 100050030202600014?",
            "When was FIR 100050030202600014 registered?",
        ],
    )
    def test_record_queries_keep_exact_path(self, q):
        assert not self._anchor(q), q

    def test_resolver_declines_analysis_anchor_without_db(self):
        """handled=False (no DB round-trip) when an analysis anchor is present."""
        from engines.exact_case import ExactCaseResolver
        res = ExactCaseResolver(db_url=None)._try_handle(
            "Find cases similar to FIR 100050030202600014.", rbac_filter="1=1"
        )
        assert res.get("handled") is False
        assert res.get("analysis_anchor") is True


# ════════════════════════════════════════════════════════════════
#  1. Deterministic intent classifier (no LLM, no DB)
# ════════════════════════════════════════════════════════════════

@needs_imports
class TestIntentClassifier:
    def _c(self):
        return DeterministicIntentClassifier()

    # ── MO / narrative similarity ─────────────────────────────
    def test_mo_similarity_not_factual(self):
        r = self._c().classify(
            "Find cases involving similar modus operandi to a break-in using forced entry."
        )
        assert r["matched"]
        assert r["intent"] == "narrative_similarity"
        assert "factual_lookup" not in r["engines"]
        assert "narrative_rag" in r["engines"]
        assert "pattern_detection" in r["engines"]
        assert "break-in" in (r.get("mo_phrase") or "").lower()

    def test_mo_similarity_variants(self):
        for q in [
            "similar MO to a chain snatching",
            "cases with the same method as a hotel burglary",
            "similar incidents in Bengaluru",
            "comparable cases involving credit card skimming",
            "similar narrative to a fake call centre scam",
            "cases like this forced entry break-in",
        ]:
            r = self._c().classify(q)
            assert r["matched"], q
            assert r["intent"] in ("narrative_similarity", "case_similarity"), q
            assert "factual_lookup" not in r["engines"], q

    def test_case_similarity_with_fir(self):
        r = self._c().classify(f"Find cases similar to FIR {FIR}")
        assert r["intent"] == "case_similarity"
        assert "case_similarity" in r["engines"]
        assert r["entity_ids"] == [FIR]

    def test_what_is_mo_of_fir_is_exact_case(self):
        # "What is the modus operandi in FIR X?" is an attribute question
        # about ONE record — the exact resolver owns it, not narrative search.
        r = self._c().classify(f"What is the modus operandi in FIR {FIR}?")
        assert not r["matched"]

    # ── pattern vs trend ───────────────────────────────────────
    def test_recurring_pattern_is_pattern_not_trend(self):
        for q in [
            "Do we have a recurring pattern of motor vehicle theft?",
            "Is forced entry a recurring burglary pattern?",
            "Is there a recurring MO in vehicle theft?",
            "Are vehicle theft cases clustering?",
            "What recurring crime patterns do we have?",
            "Is there a common modus operandi?",
            "Are these thefts connected by method?",
            "Is forced entry a recurring burglary pattern?",
        ]:
            r = self._c().classify(q)
            assert r["matched"], q
            assert r["intent"] == "pattern_detection", q
            assert "pattern_detection" in r["engines"], q
            assert "trend_analysis" not in r["engines"], q

    def test_trend_stays_trend(self):
        for q in [
            "How has motor vehicle theft changed over the last 6 months?",
            "Show me the monthly trend of thefts in Bengaluru",
            "Are burglaries increasing?",
            "Show the trend over the last 12 months",
            "What is the frequency of vehicle theft by month?",
        ]:
            r = self._c().classify(q)
            assert r["matched"], q
            assert "trend_analysis" in r["engines"], q

    def test_trend_plus_pattern_multi_engine(self):
        r = self._c().classify("Show the monthly trend of vehicle theft and identify recurring MOs.")
        assert "trend_analysis" in r["engines"]
        assert "pattern_detection" in r["engines"]

    # ── financial ──────────────────────────────────────────────
    def test_financial_requires_context_without_entity(self):
        r = self._c().classify("Show the financial trail associated with this investigation.")
        assert r["intent"] == "financial_analysis"
        assert r["requires_context"] is True
        assert "financial_intelligence" in r["engines"]

    def test_financial_with_context_is_satisfied(self):
        r = self._c().classify(
            "Show the financial trail associated with this investigation.", CTX_FIR
        )
        assert r["intent"] == "financial_analysis"
        assert "financial_intelligence" in r["engines"]

    def test_financial_with_explicit_scope(self):
        r = self._c().classify("Show the financial trail for burglary cases in Mysuru")
        assert r["intent"] == "financial_analysis"
        assert r["requires_context"] is False  # crime+location establish the set

    def test_crime_narrative_mention_is_not_financial(self):
        # "online transaction" inside a fraud narrative is NOT a money-trail request
        r = self._c().classify("online transaction near Mysuru")
        assert r["intent"] != "financial_analysis"

    def test_financial_followup_detected(self):
        assert self._c().is_followup_reference("Show the financial trail.")
        assert self._c().is_followup_reference("Who is connected to it?")

    def test_new_scope_is_not_followup(self):
        c = self._c()
        assert c.defines_new_scope("Now find recent burglary cases in Mysuru.")
        # new scope must not inherit previous context
        assert not c.is_followup_reference("Now find recent burglary cases in Mysuru.")

    # ── network / risk / forecast / next action ────────────────
    def test_network_followup(self):
        r = self._c().classify("Who is connected to it?", CTX_FIR)
        assert r["intent"] == "criminal_network"

    def test_network_without_context_requires_context(self):
        r = self._c().classify("Who is connected to it?")
        assert r["intent"] == "criminal_network"
        assert r["requires_context"] is True

    def test_possessive_followups_detected(self):
        for q in [
            "Show their transaction trail",
            "Show his financial links",
            "Trace their money",
            "Show its financial trail",
            "Map their network connections",
        ]:
            assert self._c().is_followup_reference(q), q
            # with the previous investigation context, they are satisfiable
            r = self._c().classify(q, CTX_FIR)
            assert r["intent"] == "financial_analysis" or "network" in q.lower(), q
            assert r["requires_context"] is False, q

    def test_possessive_followup_still_respects_new_scope(self):
        # "their" must not hijack a brand-new scope statement
        c = self._c()
        assert not c.is_followup_reference("Now show recent burglary cases in Mysuru")

    def test_risk_forecast_next_action(self):
        assert self._c().classify("What is the risk profile of Accused 80?")["intent"] == "risk_analysis"
        assert self._c().classify("Where might crime increase next month?")["intent"] == "forecasting"
        assert self._c().classify("What should investigators do next?")["intent"] == "next_best_action"

    # ── forecasting vs trend (future window must win over trend) ──
    def test_future_directional_phrasing_is_forecast_not_trend(self):
        for q in [
            "Predict which districts may see a spike in vehicle theft next year",
            "Which areas might see rising burglary next quarter?",
            "Where could burglary increase over the next 6 months?",
            "Is crime likely to rise in Bengaluru next month?",
        ]:
            r = self._c().classify(q)
            assert r["matched"], q
            assert r["intent"] == "forecasting", (q, r["intent"])
            assert "forecasting" in r["engines"], q

    def test_crime_outlook_is_forecast(self):
        for q in [
            "What is the crime outlook for the next 6 months?",
            "Forecast the vehicle theft outlook for next quarter",
        ]:
            r = self._c().classify(q)
            assert r["matched"], q
            assert r["intent"] == "forecasting", (q, r["intent"])

    def test_backward_trend_not_forecast(self):
        # No future reference → these stay trend / pattern, never forecasting.
        for q in [
            "How has motor vehicle theft changed over the last 6 months?",
            "Are burglaries increasing in Mysuru?",
            "Show the monthly trend of thefts",
        ]:
            r = self._c().classify(q)
            assert "forecasting" not in r["intent"], q
            assert "forecasting" not in (r.get("engines") or []), q

    # ── behaviour analysis vs generic pattern ──────────────────
    def test_offender_behaviour_pattern_is_behaviour_not_pattern(self):
        for q in [
            "Is there a pattern in the behaviour of repeat offenders?",
            "Are repeat offenders following a behavioural pattern?",
            "What patterns do we see in repeat offender behaviour?",
        ]:
            r = self._c().classify(q)
            assert r["matched"], q
            assert r["intent"] == "behaviour_analysis", (q, r["intent"])
            # pattern_detection in engines is the sanctioned engine for
            # behaviour_analysis — the PRIMARY intent is what must differ.
            assert "risk_analysis" not in r["intent"], q

    def test_crime_pattern_still_pattern_detection(self):
        # Unrelated offender-behaviour phrasing must not have disabled patterns.
        r = self._c().classify("Do we have a recurring pattern of motor vehicle theft?")
        assert r["intent"] == "pattern_detection"

    # ── bare "repeat offender" is not a risk request ──────────
    def test_bare_repeat_offender_not_risk(self):
        # A bare "repeat offenders" mention (entity description) must NOT be
        # classified as a probability/risk request.
        for q in [
            "Who are the repeat offenders in this case?",
            "List the repeat offenders among the accused",
        ]:
            r = self._c().classify(q)
            assert r["intent"] != "risk_analysis", q

    def test_likelihood_reoffending_is_risk(self):
        for q in [
            "Who is likely to reoffend?",
            "Which suspects may reoffend in the future?",
            "What is the likelihood of reoffending for these accused?",
        ]:
            r = self._c().classify(q)
            assert r["matched"], q
            assert r["intent"] == "risk_analysis", (q, r["intent"])

    def test_multi_engine_pattern_plus_network(self):
        r = self._c().classify(
            "Find recurring vehicle theft patterns in Bengaluru and identify connected suspects."
        )
        for e in ("pattern_detection", "case_query", "criminal_network"):
            assert e in r["engines"]

    def test_multi_engine_similarity_plus_financial(self):
        r = self._c().classify(f"Find cases similar to FIR {FIR} and show their financial links.")
        for e in ("case_similarity", "financial_intelligence"):
            assert e in r["engines"]
        assert r["entity_ids"] == [FIR]  # explicit entity → no context needed


# ════════════════════════════════════════════════════════════════
#  2. Planner — deterministic routing without the LLM
# ════════════════════════════════════════════════════════════════

@needs_imports
class TestPlannerDeterministicRouting:
    def _plan(self, q, ctx=None):
        planner = InvestigationPlanner()
        planner.groq_client = None  # force the deterministic fallback path
        return planner.create_plan(q, conversation_history=[], investigation_context=ctx)

    def test_mo_similarity_plan(self):
        plan = self._plan("Find cases involving similar modus operandi to a break-in using forced entry.")
        assert plan["intent"] == "narrative_similarity"
        assert "narrative_rag" in plan["engines"]
        assert "case_similarity" in plan["engines"]
        assert "break-in" in (plan.get("filters", {}).get("mo_phrase") or "")

    def test_pattern_plan_not_trend(self):
        plan = self._plan("Do we have a recurring pattern of motor vehicle theft?")
        assert plan["intent"] == "pattern_detection"
        assert "pattern_detection" in plan["engines"]
        assert "trend_analysis" not in plan["engines"]
        assert plan["filters"].get("crime_category")  # scoped

    def test_trend_plan(self):
        plan = self._plan("How has motor vehicle theft changed over the last 6 months?")
        assert plan["intent"] == "trend_analysis"
        assert "trend_analysis" in plan["engines"]

    def test_financial_plan_without_context(self):
        plan = self._plan("Show the financial trail associated with this investigation.")
        assert plan["intent"] == "financial_analysis"
        assert plan["requires_context"] is True

    def test_financial_followup_merges_entities(self):
        plan = self._plan("Show the financial trail.", ctx=CTX_FIR)
        assert plan["intent"] == "financial_analysis"
        assert 2598 in plan["entities"]["case_ids"]
        assert plan["requires_context"] is False  # satisfied by context

    def test_network_followup_merges_entities(self):
        plan = self._plan("Who is connected to it?", ctx=CTX_FIR)
        assert plan["intent"] == "criminal_network"
        assert 1 in plan["entities"]["accused_ids"]

    def test_new_scope_does_not_leak(self):
        plan = self._plan("Now find recent burglary cases in Mysuru.", ctx=CTX_FIR)
        assert plan["intent"] == "case_search"
        assert plan["filters"].get("district_name") == "Mysuru"
        # previous FIR context must NOT leak into the new investigation
        assert 2598 not in plan["entities"].get("case_ids", [])


# ════════════════════════════════════════════════════════════════
#  3. Orchestrator scope firewall (no DB required)
# ════════════════════════════════════════════════════════════════

@needs_imports
class TestScopeFirewall:
    def _execute(self, plan):
        orch = InvestigationOrchestrator()
        orch.db_url = None  # firewall logic is DB-free
        return orch.execute_plan(
            plan=plan,
            rbac_filter="1=1",
            nl2sql_engine=None,
            rag_engine=None,
            graph_engine=None,
            network_engine=None,
            pattern_engine=None,
            analytics_engine=None,
            case_explorer_engine=None,
        )

    def test_financial_without_entity_or_scope_stops(self):
        plan = {
            "intent": "financial_analysis",
            "engines": ["case_query", "financial_intelligence"],
            "filters": {},
            "scope": {"crime_category": None, "district": None, "time_window": None},
            "entities": {"case_ids": [], "accused_ids": []},
            "requires_context": True,
            "resolved_scope": {},
        }
        items = self._execute(plan)
        assert items and items[0]["type"] == "context_required"
        # ZERO broad case queries were executed
        assert not any(i["type"] == "case_list" for i in items)
        # No engine was attempted — the firewall cleared the run list
        attempted = (plan.get("resolved_scope") or {}).get("engines_attempted", [])
        assert attempted == []

    def test_network_without_entity_stops(self):
        plan = {
            "intent": "criminal_network",
            "engines": ["criminal_network", "case_query"],
            "filters": {},
            "scope": {"crime_category": None, "district": None, "time_window": None},
            "entities": {"case_ids": [], "accused_ids": []},
            "requires_context": True,
            "resolved_scope": {},
        }
        items = self._execute(plan)
        assert items[0]["type"] == "context_required"
        assert not any(i["type"] == "case_list" for i in items)

    def test_analysis_intent_never_implicit_broad_case_query(self):
        # pattern question with no scope: case_query must be dropped; the
        # unscoped pattern engine would run instead.
        plan = {
            "intent": "pattern_detection",
            "engines": ["case_query", "pattern_detection"],
            "filters": {},
            "scope": {"crime_category": None, "district": None, "time_window": None},
            "entities": {"case_ids": [], "accused_ids": []},
            "requires_context": False,
            "resolved_scope": {},
        }
        items = self._execute(plan)
        assert not any(i["type"] == "case_list" for i in items)


# ════════════════════════════════════════════════════════════════
#  4. Full pipeline (DB required, LLM disabled → deterministic)
# ════════════════════════════════════════════════════════════════

@needs_db
class TestInvestigationPipeline:
    @classmethod
    def setup_class(cls):
        from engines.nl2sql import NL2SQLEngine
        from engines.rag import RAGEngine
        from engines.graph import GraphEngine
        from engines.network_engine import NetworkEngine
        from engines.pattern_engine import PatternEngine
        from engines.analytics import AnalyticsEngine
        from engines.case_explorer import CaseExplorerEngine

        cls.engine = InvestigationEngine()
        cls.engine.planner.groq_client = None  # deterministic routing only
        cls.engine.builder.groq_client = None  # deterministic summaries only
        cls.nl2sql = NL2SQLEngine()
        cls.rag = RAGEngine()
        cls.graph = GraphEngine()
        cls.network = NetworkEngine()
        cls.pattern = PatternEngine()
        cls.analytics = AnalyticsEngine()
        cls.case_explorer = CaseExplorerEngine()

    def _run(self, q, ctx=None):
        return self.engine.run_investigation(
            request_text=q,
            rbac_filter="1=1",
            conversation_history=[],
            investigation_context=ctx,
            nl2sql_engine=self.nl2sql,
            rag_engine=self.rag,
            graph_engine=self.graph,
            network_engine=self.network,
            pattern_engine=self.pattern,
            analytics_engine=self.analytics,
            case_explorer_engine=self.case_explorer,
        )

    def test_exact_case_route(self):
        r = self._run(f"What is FIR {FIR}?")
        assert r["intent_detected"] == "exact_case_lookup"
        assert FIR in r.get("answer", "")
        findings = r["investigation"]["findings"]
        case_counts = [len(f["data"].get("cases", [])) for f in findings if f["category"] == "Cases Identified"]
        assert sum(case_counts) == 1  # exactly one FIR

    def test_exact_verification_not_filter(self):
        r = self._run(f"Is FIR {FIR} a vehicle theft case?")
        assert r["intent_detected"] == "exact_case_lookup"
        ans = r.get("answer", "").lower()
        assert ans.startswith("no")
        assert "burglary" in ans
        findings = r["investigation"]["findings"]
        case_counts = [len(f["data"].get("cases", [])) for f in findings if f["category"] == "Cases Identified"]
        assert sum(case_counts) == 1  # never an MVT list

    def test_mo_similarity_pipeline(self):
        r = self._run("Find cases involving similar modus operandi to a break-in using forced entry.")
        assert r["intent_detected"] == "narrative_similarity"
        engines = r["investigation"]["plan"]["engines"]
        assert "narrative_rag" in engines
        assert "factual_lookup" not in engines
        cats = {f["category"] for f in r["investigation"]["findings"]}
        assert "Narrative Intelligence" in cats or "Crime Patterns Detected" in cats

    def test_recurring_pattern_pipeline(self):
        r = self._run("Do we have a recurring pattern of motor vehicle theft?")
        assert r["intent_detected"] == "pattern_detection"
        plan = r["investigation"]["plan"]
        assert plan["filters"].get("crime_sub_head_name") == "Motor Vehicle Theft"
        cats = {f["category"] for f in r["investigation"]["findings"]}
        # The pattern engine ran on the scoped crime. Depending on the dataset
        # it either found pattern clusters (honest positive) or reports a
        # zero-result finding with the examined scope — NEVER an empty trend
        # visualization and NEVER an unrelated case list.
        assert "Crime Patterns Detected" in cats or "No Matching Evidence" in cats
        assert r.get("analytics_data") is None or r["analytics_data"].get("type") != "trend"
        # The pattern engine actually executed
        result_counts = r.get("routing_log", {}).get("result_counts", {})
        assert "pattern_detection" in result_counts or "pattern_detection_zero_result" in result_counts

    def test_trend_pipeline_has_real_data(self):
        r = self._run("How has motor vehicle theft changed over the last 6 months?")
        assert r["intent_detected"] == "trend_analysis"
        trend = (r.get("analytics_data") or {}).get("data") or []
        assert trend, "trend must contain real time-series data"
        assert all("month" in p and "count" in p for p in trend)

    def test_financial_without_context_is_context_required(self):
        r = self._run("Show the financial trail associated with this investigation.")
        assert r["intent_detected"] == "financial_analysis"
        assert "Context Required" in r.get("answer", "")
        findings = r["investigation"]["findings"]
        assert any(f.get("context_required") for f in findings)
        # ZERO broad case queries
        assert not any(f["category"] == "Cases Identified" for f in findings)

    def test_financial_with_context_uses_fir_entities(self):
        r = self._run("Show the financial trail associated with this investigation.", ctx=CTX_FIR)
        assert r["intent_detected"] == "financial_analysis"
        plan = r["investigation"]["plan"]
        assert 2598 in plan["entities"]["case_ids"]
        cats = {f["category"] for f in r["investigation"]["findings"]}
        assert "Financial Intelligence" in cats
        # No unrelated case lists
        assert not any(f["category"] == "Cases Identified" for f in r["investigation"]["findings"])

    def test_network_followup_uses_exact_fir(self):
        r = self._run("Who is connected to it?", ctx=CTX_FIR)
        assert r["intent_detected"] == "criminal_network"
        cats = {f["category"] for f in r["investigation"]["findings"]}
        assert "Criminal Network Analysis" in cats

    def test_possessive_transaction_followup_keeps_entities(self):
        # "Show their transaction trail" after a financial step must keep the
        # previously discovered cases/accused (regression: an LLM context
        # rewrite used to strip the possessive anchor and drop the entities).
        ctx = {
            "plan": {"filters": {}},
            "resolved_scope": {},
            "discovered_cases": [2804],
            "discovered_accused": [1273, 1274, 2778],
        }
        r = self._run("Show their transaction trail", ctx=ctx)
        assert r["intent_detected"] == "financial_analysis"
        plan_entities = r["investigation"]["plan"].get("entities") or {}
        assert 2804 in (plan_entities.get("case_ids") or [])

    def test_new_scope_replaces_old(self):
        r = self._run("Now find recent burglary cases in Mysuru.", ctx=CTX_FIR)
        plan = r["investigation"]["plan"]
        assert plan["intent"] in ("case_search", "case_lookup")
        assert plan["filters"].get("district_name_resolved") == "Mysuru"
        assert 2598 not in plan["entities"].get("case_ids", [])
        assert plan["filters"].get("crime_category") in ("Burglary", None) or plan["filters"].get("crime_sub_head_name") == "Burglary"

    def test_routing_log_present(self):
        r = self._run("Do we have a recurring pattern of motor vehicle theft?")
        log = r.get("routing_log") or {}
        assert log.get("detected_intent") == "pattern_detection"
        assert "result_counts" in log
        assert "final_response_type" in log


# ════════════════════════════════════════════════════════════════
#  6. Analysis anchored on an exact FIR (DB-gated pipeline)
# ════════════════════════════════════════════════════════════════

@needs_imports
@needs_db
class TestAnalysisAnchoredOnExactFir:
    """
    "Find cases similar to FIR X" / "financial trail for FIR X" / "who is
    connected to FIR X" must keep their ANALYSIS intent and anchor on the
    resolved CaseMasterID — never degrade to an exact-case description of FIR X.
    """

    @classmethod
    def setup_class(cls):
        from engines.nl2sql import NL2SQLEngine
        from engines.rag import RAGEngine
        from engines.graph import GraphEngine
        from engines.network_engine import NetworkEngine
        from engines.pattern_engine import PatternEngine
        from engines.analytics import AnalyticsEngine
        from engines.case_explorer import CaseExplorerEngine

        cls.engine = InvestigationEngine()
        cls.engine.planner.groq_client = None  # deterministic routing only
        cls.engine.builder.groq_client = None  # deterministic summaries only
        cls.nl2sql = NL2SQLEngine()
        cls.rag = RAGEngine()
        cls.graph = GraphEngine()
        cls.network = NetworkEngine()
        cls.pattern = PatternEngine()
        cls.analytics = AnalyticsEngine()
        cls.case_explorer = CaseExplorerEngine()

    def _run(self, q):
        return self.engine.run_investigation(
            request_text=q,
            rbac_filter="1=1",
            conversation_history=[],
            investigation_context=None,
            nl2sql_engine=self.nl2sql,
            rag_engine=self.rag,
            graph_engine=self.graph,
            network_engine=self.network,
            pattern_engine=self.pattern,
            analytics_engine=self.analytics,
            case_explorer_engine=self.case_explorer,
        )

    def test_case_similarity_anchors_on_case_master_id(self):
        r = self._run(f"Find cases similar to FIR {FIR}.")
        assert r["intent_detected"] == "case_similarity"
        ec = r["investigation"]["plan"].get("exact_case") or {}
        assert ec.get("found") is True
        assert ec.get("case_master_id") == 2598  # NOT the raw 18-digit FIR
        cats = {f["category"] for f in r["investigation"]["findings"]}
        assert "Related Cases (Similarity Analysis)" in cats

    def test_financial_analysis_anchors_on_case_master_id(self):
        r = self._run(f"Show the financial trail for FIR {FIR}.")
        assert r["intent_detected"] == "financial_analysis"
        plan = r["investigation"]["plan"]
        ec = plan.get("exact_case") or {}
        assert ec.get("case_master_id") == 2598
        assert 2598 in plan["entities"].get("case_ids", [])

    def test_criminal_network_anchors_on_case_master_id(self):
        r = self._run(f"Who is connected to FIR {FIR}?")
        assert r["intent_detected"] == "criminal_network"
        ec = r["investigation"]["plan"].get("exact_case") or {}
        assert ec.get("case_master_id") == 2598

    def test_mo_of_fir_remains_exact_lookup(self):
        r = self._run(f"What is the modus operandi in FIR {FIR}?")
        assert r["intent_detected"] == "exact_case_lookup"
        assert FIR in r.get("answer", "")

    def test_invalid_fir_analysis_never_broadens(self):
        r = self._run("Find cases similar to FIR 999999999999999999.")
        findings = r["investigation"]["findings"]
        cats = {f["category"] for f in findings}
        # No unrelated case list and no invented similar cases
        assert "Cases Identified" not in cats
        assert "Similar Cases Found" not in cats

    # ── derived engines (forecasting / next best action) ──────
    def test_forecasting_intent_runs_statistical_engine(self):
        r = self._run("What is the crime outlook for the next 6 months?")
        assert r["intent_detected"] == "forecasting"
        assert r.get("answer"), "derived forecast answer missing"
        assert "outlook" in (r.get("answer") or "").lower() or "forecast" in (r.get("answer") or "").lower()

    def test_forecast_with_future_window_not_trend(self):
        r = self._run("Predict which districts may see a spike in vehicle theft next year")
        assert r["intent_detected"] == "forecasting"
        assert "trend_analysis" not in (r["investigation"]["plan"].get("engines") or [])

    def test_next_best_action_runs_with_evidence(self):
        r = self._run("What should investigators do next?")
        assert r["intent_detected"] in ("next_best_action", "general_investigation")
        if r["intent_detected"] == "next_best_action":
            assert r.get("answer")

    def test_evidence_graph_question_not_hijacked(self):
        # Evidence/anchor wording must not collapse into an exact-case lookup
        r = self._run(f"Show the evidence relationships for FIR {FIR}")
        assert r["intent_detected"] != "exact_case_lookup"


# ════════════════════════════════════════════════════════════════
#  8. Unresolved explicit scope → structured failure, zero fallback
# ════════════════════════════════════════════════════════════════

@needs_db
class TestUnresolvedScopeNeverBroadens:
    def _lookup(self, q):
        from engines.factual_lookup import FactualCaseLookup
        return FactualCaseLookup().try_lookup(q)

    def test_unknown_crime_of_form_stops(self):
        r = self._lookup("Show me cases of quantum levitation in Bengaluru")
        assert r["error_kind"] == "crime_unresolved"
        assert r["cases"] == []
        assert "quantum levitation" in r["answer"].lower()

    def test_unknown_crime_registration_tail_stops(self):
        r = self._lookup("cases of quantum levitation registered in Belagavi")
        assert r["error_kind"] == "crime_unresolved"
        assert r["cases"] == []

    def test_known_crime_still_lists_records(self):
        r = self._lookup("Show me burglary cases in Bengaluru")
        assert r["error_kind"] is None
        assert r["cases"]

    def test_generic_case_request_not_false_positive(self):
        for q in [
            "Show me the latest cases in Bengaluru",
            "What are the recent cases in Bagalkot?",
            "cases registered yesterday",
            "Show me cases from the last 6 months in Bengaluru",
        ]:
            r = self._lookup(q)
            assert r["error_kind"] != "crime_unresolved", q
            assert "quantum" not in str(r.get("answer", "")).lower(), q

    def test_known_crime_of_form_not_blocked(self):
        r = self._lookup("show cases of attempted murder in Ballari")
        assert r["error_kind"] is None
        assert r["cases"]


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))