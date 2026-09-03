"""
Investigation Planner — Multi-Engine Evidence Fusion Pipeline

Converts natural-language investigation requests into structured plans,
executes the appropriate existing intelligence engines, fuses evidence
with full provenance, and synthesizes an explainable investigation result.

Architecture:
    User Request
        → InvestigationPlanner (LLM → structured plan)
        → InvestigationOrchestrator (plan → engine calls)
        → EvidenceFusion (engine results → fused evidence)
        → ResponseBuilder (evidence → NL summary via LLM)

All engine outputs are REAL database-backed results.
The LLM is used ONLY for plan generation and final text synthesis.
"""

import os
import json
import time
import re
import psycopg2
from datetime import datetime, timedelta
from groq import Groq
from typing import Optional

from engines.location_resolver import LocationResolver
from engines.exact_case import ExactCaseResolver
from engines.intent_classifier import DeterministicIntentClassifier


# ════════════════════════════════════════════════════════════════
#  STEP 1: INVESTIGATION PLANNER
# ════════════════════════════════════════════════════════════════

class InvestigationPlanner:
    """
    Uses Groq LLM to convert a natural-language investigation request
    into a strict structured plan. The plan determines which engines
    to run and with what parameters.
    """

    VALID_ENGINES = [
        "case_query",       # SQL-based case retrieval
        "case_similarity",  # pgvector + MO similarity
        "criminal_network", # NetworkX graph traversal
        "risk_profile",     # Offender risk scoring
        "pattern_detection",# MO-based pattern clustering
        "narrative_rag",    # Vector semantic search
        "trend_analysis",   # Temporal crime trends
        "financial_intelligence", # Financial relationship analysis
    ]

    def __init__(self):
        self.groq_client = Groq(api_key=os.getenv("GROQ_API_KEY")) if os.getenv("GROQ_API_KEY") else None

    # Follow-up reference keywords — used to detect questions that refer to
    # a previous investigation without restating its full scope.
    FOLLOWUP_PATTERNS = [
        r"\bthese\b", r"\bthose\b", r"\bthem\b", r"\bthey\b",
        r"\bwhich ones?\b", r"\bthe (suspects|accused|offenders|cases|firs)\b",
        r"\bconnected (cases|suspects|accused|people|offenders)\b",
        r"\blinked (cases|suspects|accused)\b", r"\bsame (suspects?|accused|group|gang|pattern)\b",
        r"\bany of (these|those|them)\b", r"\bmastermind\b", r"\bringleader\b",
        r"\bfinancial trail\b", r"\bthis investigation\b", r"\bthe investigation\b",
        r"\btrace (the )?money\b", r"\bfollow the money\b",
        r"\bconnected to (it|him|her|them|this|that)\b",
        r"\blinked to (it|him|her|them|this|that)\b",
        r"\bare (they|any of them|these|those) (connected|linked|related|involved)\b",
        r"\bshow (the )?(financial )?(trail|transactions?|accounts?|money)\b",
    ]

    def _is_followup(self, request_text: str) -> bool:
        """Detects whether a request refers back to a previous investigation.

        Uses both the keyword patterns and the deterministic classifier's
        follow-up-reference rules, but NEVER treats a question that defines a
        brand-new scope (new FIR, crime, district, or time window) as a
        follow-up — a new scope starts a new investigation.
        """
        lower = request_text.lower()
        if any(re.search(p, lower) for p in self.FOLLOWUP_PATTERNS):
            return True
        try:
            classifier = DeterministicIntentClassifier()
            if classifier.is_followup_reference(request_text):
                return not classifier.defines_new_scope(request_text)
        except Exception:
            pass
        return False

    def create_plan(self, request_text: str, conversation_history: list = None,
                    investigation_context: dict = None) -> dict:
        """
        Generates a structured investigation plan from natural language.

        Returns a dict with:
            intent: str (investigation intent, e.g. "investigate")
            scope: dict (crime_category, district, time_window)
            investigation_type: str
            objectives: list[str]
            engines: list[str]  (subset of VALID_ENGINES)
            filters: dict
            entities: dict (case_ids, accused_ids, etc.)
            summary: str (brief description of what the plan will do)
        """
        # ── Central deterministic routing policy ──
        # Runs FIRST. The rule engine decides intent + engines; the LLM below
        # only enriches scope/entities. Deterministic matches always override
        # LLM engine choices (applied after the LLM call), so the LLM can
        # never route "similar modus operandi" to factual lookup or "recurring
        # pattern" to trend analysis.
        det = DeterministicIntentClassifier().classify(
            request_text, investigation_context=investigation_context
        )

        if not self.groq_client:
            plan = self._fallback_plan(request_text, investigation_context=investigation_context)
            self._apply_deterministic_intent(plan, det, request_text)
            self._deterministic_case_lookup_correction(request_text, plan)
            self._merge_investigation_context(plan, investigation_context, request_text)
            return plan

        history_context = ""
        if conversation_history:
            recent = conversation_history[-6:]
            history_context = "\n".join([f"{h['role']}: {h['text']}" for h in recent])

        # Structured CURRENT INVESTIGATION block for follow-up resolution.
        # Follow-ups like "Which ones are connected?" rely on this context.
        context_block = ""
        if investigation_context:
            prev_plan = investigation_context.get("plan") or {}
            prev_filters = prev_plan.get("filters") or {}
            prev_scope = investigation_context.get("resolved_scope") or {}
            discovered_cases = investigation_context.get("discovered_cases", [])[:10]
            discovered_accused = investigation_context.get("discovered_accused", [])[:10]
            parts = ["CURRENT INVESTIGATION CONTEXT (use to resolve references like 'these cases', 'those offenders'):"]
            if prev_filters.get("crime_category"):
                parts.append(f"- crime_category: {prev_filters['crime_category']}")
            if prev_filters.get("crime_sub_head_name") or prev_filters.get("crime_head_name"):
                parts.append(f"- resolved crime: {prev_filters.get('crime_sub_head_name') or prev_filters.get('crime_head_name')}")
            if prev_filters.get("district_name"):
                parts.append(f"- district: {prev_filters.get('district_name')}")
            if prev_filters.get("district_name_resolved"):
                parts.append(f"- resolved district: {prev_filters['district_name_resolved']}")
            if prev_filters.get("time_window"):
                parts.append(f"- time_window: {prev_filters['time_window']}")
            if discovered_cases:
                parts.append(f"- discovered case_ids: {discovered_cases}")
            if discovered_accused:
                parts.append(f"- discovered accused_ids: {discovered_accused}")
            if prev_scope.get("status"):
                parts.append(f"- previous scope status: {prev_scope['status']}")
            context_block = "\n".join(parts)

        prompt = f"""You are an investigation planning agent for a law enforcement AI system.

Given an investigator's natural-language request, produce a strict JSON plan that determines
which intelligence engines to execute. You have access to these engines:

ENGINES AVAILABLE:
1. "case_query" — SQL-based search for FIRs by district, date range, crime type, status, or keyword.
2. "case_similarity" — Finds cases similar to a specific CaseMasterID (narrative, MO, spatio-temporal).
3. "criminal_network" — Graph traversal from AccusedMasterID(s): co-accused links, syndicates.
4. "risk_profile" — Precomputed risk score for a specific AccusedMasterID.
5. "pattern_detection" — MO-based crime clusters/emerging patterns within a scope.
6. "narrative_rag" — Semantic vector search over FIR narratives.
7. "trend_analysis" — Temporal aggregation of case volume.
8. "financial_intelligence" — Money trails, suspect accounts, cross-case financial links, transaction chains.

FILTERS that can be extracted:
- district_name: string (e.g. "Bengaluru Urban")
- district_id: integer
- crime_category: string (e.g. "Vehicle Theft", "Theft", "Cyber Crime")
- time_window: "3m" | "6m" | "12m" | null (for "recent", "last 3 months", etc.)
- search_keyword: string (for BriefFacts text search)

ENTITIES that can be extracted:
- case_ids: list of CaseMasterID integers
- accused_ids: list of AccusedMasterID integers

{f'''CONVERSATION HISTORY (for resolving references like "these cases", "those offenders"):
{history_context}''' if history_context else ""}

{f'''{context_block}''' if context_block else ""}

INVESTIGATOR REQUEST:
"{request_text}"

Respond ONLY with a valid JSON object matching this exact schema:
{{
  "intent": "investigate" | "case_lookup" | "pattern_analysis" | "network_mapping" | "financial_analysis" | "risk_assessment" | "similarity_search" | "narrative_search" | "trend_investigation",
  "scope": {{
    "crime_category": "string or null",
    "district": "string or null",
    "time_window": "string or null"
  }},
  "investigation_type": "crime_pattern_investigation" | "specific_case_analysis" | "offender_network_mapping" | "narrative_search" | "trend_investigation",
  "objectives": ["brief_english_description_of_each_step"],
  "engines": ["engine_name", ...],
  "filters": {{
    "district_name": "string or null",
    "district_id": integer or null,
    "crime_category": "string or null",
    "time_window": "string or null",
    "search_keyword": "string or null",
    "limit": integer or null,
    "sort": "crimeregistereddate_desc" or null
  }},
  "entities": {{
    "case_ids": [integers],
    "accused_ids": [integers]
  }},
  "summary": "One sentence describing what this investigation will do."
}}

INTENT-BASED ENGINE ROUTING (select ONLY the engines the request needs):
- case_lookup / case discovery → ["case_query"] — for requests like "last cases", "latest cases", "recent cases", "cases registered in <location>", set intent="case_lookup", filters.sort="crimeregistereddate_desc", filters.time_window="latest" (never a date cutoff), and filters.limit=10 (or the explicit count, e.g. "last 5 cases" → 5). These are record-retrieval questions, NOT pattern/network/financial analysis.
- pattern_analysis (patterns, clusters, MO, suspicious activity) → ["pattern_detection", "case_query"]
- network_mapping (connections, co-accused, syndicate, who is connected) → ["criminal_network", "case_query"]
- financial_analysis (money trail, bank, account, transaction, financial link, funded) → ["financial_intelligence", "case_query"] — add "criminal_network" only if the request explicitly asks about people relationships too.
- risk_assessment (risk score, dangerous, repeat offender) → ["risk_profile", "case_query"]
- similarity_search (similar cases, related FIRs) → ["case_similarity", "case_query"]
- narrative_search (scenario/method description) → ["narrative_rag"]
- trend_investigation (trends over time) → ["trend_analysis", "case_query"]
- investigate (broad/full investigation) → ["case_query", "pattern_detection", "financial_intelligence"] and add "criminal_network"/"risk_profile" only when people are in scope.

HARD RULES:
- DO NOT include "financial_intelligence" unless the request mentions money, banks, accounts, transactions, financial links, or an explicit full investigation.
- DO NOT include "pattern_detection" unless the request asks about patterns, clusters, MO, suspicious/similar activity, or an explicit full investigation.
- DO NOT include "criminal_network" or "risk_profile" unless a person/accused is in scope (by ID, name, or from previous context).
- Always include at least one engine; prefer the fewest engines that answer the question.
- If the request mentions a specific CaseMasterID or CrimeNo, include "case_similarity".
- If the request mentions a specific accused/person, include "criminal_network" and/or "risk_profile".
- For follow-up questions that reference previous results ("which ones", "these suspects", "them"), reuse the CURRENT INVESTIGATION CONTEXT: copy its case_ids/accused_ids into entities, inherit its scope into filters/scope, and select engines based on the follow-up's question.
- Extract real district names, case IDs, and accused IDs from the text when present. NEVER invent IDs.
- Never broaden a scope stated by the investigator.
"""

        try:
            response = self.groq_client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="openai/gpt-oss-120b",
                temperature=0.0,
                response_format={"type": "json_object"},
                seed=42
            )
            plan = json.loads(response.choices[0].message.content)

            # Validate engines
            plan["engines"] = [e for e in plan.get("engines", []) if e in self.VALID_ENGINES]
            if not plan["engines"]:
                plan["engines"] = ["case_query"]

            # Ensure required keys
            plan.setdefault("intent", "investigate")
            plan.setdefault("investigation_type", "crime_pattern_investigation")
            plan.setdefault("objectives", [])
            plan.setdefault("filters", {})
            plan.setdefault("scope", {})
            plan.setdefault("entities", {"case_ids": [], "accused_ids": []})
            plan.setdefault("summary", "Investigation plan generated.")

            # Normalize scope into filters (single source of truth for the orchestrator)
            scope = plan.get("scope") or {}
            filters = plan["filters"]
            if scope.get("crime_category") and not filters.get("crime_category"):
                filters["crime_category"] = scope["crime_category"]
            if scope.get("district") and not filters.get("district_name"):
                filters["district_name"] = scope["district"]
            if scope.get("time_window") and not filters.get("time_window"):
                filters["time_window"] = scope["time_window"]
            plan["scope"] = {
                "crime_category": filters.get("crime_category"),
                "district": filters.get("district_name"),
                "time_window": filters.get("time_window"),
            }

            # Sanitize filters
            for key in ["district_id"]:
                if key in filters and filters[key] is not None:
                    try:
                        filters[key] = int(filters[key])
                    except (ValueError, TypeError):
                        filters[key] = None

            for key in ["case_ids", "accused_ids"]:
                if key in plan["entities"]:
                    plan["entities"][key] = [int(x) for x in plan["entities"][key] if x]

            # ── Deterministic intent override (central routing policy) ──
            # The rule engine's intent/engine choice REPLACES whatever the LLM
            # picked. The LLM keeps its extracted scope filters and entities,
            # but never its engine selection for matched intents.
            self._apply_deterministic_intent(plan, det, request_text)

            # ── Deterministic factual-query correction ──
            # "last cases / latest cases / recent cases registered in <place>"
            # are record-retrieval questions. If the LLM mislabeled one (e.g.
            # pattern_analysis or a bare text search), correct it deterministically
            # so the query always returns the latest case records.
            self._deterministic_case_lookup_correction(request_text, plan)

            # ── Deterministic follow-up resolution ──
            # Even if the LLM misses a reference, seed entities and scope from the
            # previous investigation so follow-ups never start from an empty scope.
            self._merge_investigation_context(plan, investigation_context, request_text)

            return plan

        except Exception as e:
            plan = self._fallback_plan(request_text, error=str(e),
                                       investigation_context=investigation_context)
            self._apply_deterministic_intent(plan, det, request_text)
            self._merge_investigation_context(plan, investigation_context, request_text)
            return plan

    def _apply_deterministic_intent(self, plan: dict, det: dict, request_text: str) -> None:
        """
        Applies the central deterministic routing policy to a plan.

        When the rule engine matched an intent, its intent label and engine
        list REPLACE the LLM's choices (the LLM never picks engines for
        matched intents). The LLM-extracted filters/entities are kept.
        Entity requirements (requires_context, entity_type, entity_ids) are
        stamped so the orchestrator's scope firewall can enforce them.
        """
        if not det or not det.get("matched"):
            plan.setdefault("requires_context", False)
            plan.setdefault("entity_type", None)
            plan.setdefault("entity_ids", [])
            plan.setdefault("routing", {"deterministic": False})
            return

        plan["intent"] = det["intent"]
        plan["intents"] = det.get("intents", [det["intent"]])
        plan["engines"] = det["engines"]
        plan["requires_context"] = det.get("requires_context", False)
        plan["entity_type"] = det.get("entity_type")
        plan["entity_ids"] = det.get("entity_ids", [])
        plan["routing"] = {
            "deterministic": True,
            "reasoning": det.get("reasoning", ""),
            "intent_label": DeterministicIntentClassifier().describe(det["intent"]),
            "engines": det["engines"],
            "requires_context": det.get("requires_context", False),
        }

        filters = plan.setdefault("filters", {})

        # ── Deterministic scope extraction ──
        # Scope (crime / district) is resolved from the REQUEST TEXT itself, so
        # a misbehaving LLM can never drop the investigator's stated scope.
        # This runs for every matched intent: pattern/trend/case-search/similarity
        # questions carry their crime+location in the query text.
        #
        # SAFETY: entity-centric intents (financial/network/risk) NEVER get a
        # crime filter inferred from their own marker words — "show the financial
        # trail" must never gain an "Online Financial Fraud" filter, and a bare
        # financial/network follow-up must never invent any scope. A crime is
        # only extracted for these intents when the query ALSO names case
        # records AND the matched crime phrase is not derived solely from
        # intent-marker tokens (e.g. "financial trail for burglary cases").
        try:
            entity_centric_det = det.get("intent") in (
                "financial_analysis", "criminal_network", "risk_analysis", "case_similarity"
            )
            infer_scope = True
            if entity_centric_det:
                ql = request_text.lower()
                has_case_ref = bool(re.search(r"\b(cases?|firs?|records?|registered)\b", ql))
                infer_scope = has_case_ref
            if infer_scope:
                if not filters.get("crime_category") and not filters.get("crime_sub_head_id"):
                    crime = LocationResolver().best_crime_match(request_text)
                    if crime.get("matched") and crime.get("phrase") \
                            and self._scope_crime_phrase_ok(crime, request_text, entity_centric_det):
                        filters["crime_category"] = crime["phrase"]
                if not filters.get("district_name") and not filters.get("district_id"):
                    loc = LocationResolver().resolve(request_text)
                    if loc.get("matched") and loc.get("district_name"):
                        filters["district_name"] = loc["district_name"]
        except Exception:
            pass

        # Narrative / MO phrase: used by the RAG engine and by the keyword
        # case search so MO-similarity questions search the actual method
        # described ("break-in using forced entry"), never a broad list.
        mo_phrase = det.get("mo_phrase")
        if mo_phrase:
            if not filters.get("search_keyword"):
                filters["search_keyword"] = mo_phrase
            filters["mo_phrase"] = mo_phrase
            # Seed the crime scope when the MO phrase names a crime
            # ("break-in" → Burglary) so pattern detection runs scoped.
            if not filters.get("crime_category"):
                try:
                    crime = LocationResolver().best_crime_match(mo_phrase)
                except Exception:
                    crime = {}
                if crime.get("matched") and crime.get("phrase"):
                    filters["crime_category"] = crime["phrase"]

        # Stamp the discovered/required entities the orchestrator must use
        if det.get("entity_ids"):
            entities = plan.setdefault("entities", {"case_ids": [], "accused_ids": []})
            if det.get("entity_type") == "case":
                for eid in det["entity_ids"]:
                    if eid not in entities["case_ids"]:
                        entities["case_ids"].append(int(eid))
            elif det.get("entity_type") == "accused":
                for eid in det["entity_ids"]:
                    if eid not in entities["accused_ids"]:
                        entities["accused_ids"].append(int(eid))

    # Words that are intent MARKERS for entity-centric analysis — a crime match
    # derived ONLY from these tokens (e.g. "financial" → "Online Financial
    # Fraud") is an invented scope, not a stated crime.
    _ENTITY_MARKER_TOKENS = {
        "financial", "financially", "money", "monetary", "transaction", "transactions",
        "account", "accounts", "bank", "banking", "payment", "payments", "transfer",
        "transfers", "network", "connection", "connected", "link", "linked", "links",
        "relationship", "relationships", "risk", "offend", "offender", "reoffend",
        "suspect", "suspects", "accused", "trail", "trace", "follow", "show",
        "identify", "connected", "associated", "association", "fraud", "cyber", "online",
    }

    def _scope_crime_phrase_ok(self, crime: dict, request_text: str,
                               entity_centric: bool) -> bool:
        """
        Rejects crime matches that are merely intent-marker coincidences for
        entity-centric intents. For non-entity-centric intents (pattern, trend,
        case search, narrative similarity) any real crime phrase is accepted.
        """
        if not entity_centric:
            return True
        phrase = (crime.get("phrase") or "").lower()
        norm_phrase = re.sub(r"[^a-z0-9 ]", "", phrase)
        tokens = set(norm_phrase.split())
        q_tokens = set(re.sub(r"[^a-z0-9 ]", " ", request_text.lower()).split())
        overlap = tokens & q_tokens
        if not overlap:
            return False
        # If every overlapping token is an entity-intent marker, the match is a
        # coincidence ("financial" → "Online Financial Fraud"), not a stated
        # crime. A stated crime contributes at least one non-marker token
        # ("burglary", "theft", "vehicle", ...).
        return any(t not in self._ENTITY_MARKER_TOKENS for t in overlap)

    def _deterministic_case_lookup_correction(self, request_text: str, plan: dict) -> None:
        """
        Safe deterministic correction for obvious factual case queries.

        Fires only when the query is explicitly about retrieving case/FIR
        records with a recency marker ("last/latest/recent cases") or a
        listing verb ("show/list/details about cases"). It never fires for
        analysis questions (patterns, networks, finance, similarity, risk) or
        follow-ups, so it can never hijack a real investigation.
        """
        lower = request_text.lower()

        analysis_blockers = re.compile(
            r"\b(connected|linked|link|network|pattern|cluster|similar|risk|"
            r"financial|money|transaction|account|mastermind|involv|repeat offender|trend|forecast)\b"
        )
        if analysis_blockers.search(lower):
            return

        has_case_kw = bool(re.search(r"\b(cases?|firs?|registered|records?)\b", lower))
        recency = bool(re.search(r"\b(last|latest|recent|newest|top)\b", lower))
        listing = bool(re.search(r"\b(show|list|find|get|give|details?)\b", lower))
        if not has_case_kw or not (recency or listing):
            return

        # The deterministic classifier may already have labelled this as
        # case_search — both are record-retrieval; keep the deterministic label.
        if not (plan.get("routing") or {}).get("deterministic"):
            plan["intent"] = "case_lookup"
        plan["investigation_type"] = "specific_case_analysis"
        engines = plan.setdefault("engines", [])
        if "case_query" not in engines:
            engines.insert(0, "case_query")
        # Only the case query engine is relevant to a record retrieval
        plan["engines"] = [e for e in engines if e == "case_query"]

        filters = plan.setdefault("filters", {})
        filters["sort"] = "crimeregistereddate_desc"
        if recency:
            filters.setdefault("time_window", "latest")

        # Seed the location deterministically when the plan lacks one — the
        # resolver finds the real district name inside the request text.
        if not filters.get("district_name"):
            loc = LocationResolver().resolve(request_text)
            if loc.get("matched") and loc.get("district_name"):
                filters["district_name"] = loc["district_name"]
        limit_m = re.search(
            r"\b(?:last|latest|recent|top|newest|first|new)\s+(\d{1,2})\s+(?:cases?|firs?|records?)\b",
            lower,
        )
        if limit_m:
            filters["limit"] = min(int(limit_m.group(1)), 50)
        elif recency:
            filters.setdefault("limit", 10)

        plan["summary"] = (
            f"Retrieve the latest case records matching the requested location, "
            f"crime, and time criteria: '{request_text[:120]}'"
        )

    def _merge_investigation_context(self, plan: dict, investigation_context: dict,
                                     request_text: str = None) -> None:
        """
        Deterministically merges previous investigation entities and scope into a
        follow-up plan. This guarantees that "which ones are connected?" or
        "are these suspects linked?" operate on the previously discovered records
        even when the LLM planner fails to resolve the reference.

        Scope is carried over EXACTLY (never broadened): resolved IDs and names
        from the previous plan filters are inherited only when the follow-up
        does not supply its own.
        """
        if not investigation_context:
            return
        is_followup = self._is_followup(request_text or "")
        if not is_followup:
            # Conservative fallback: treat a very short question as a follow-up ONLY
            # when it clearly continues the previous thread (continuation keywords
            # + no new scope terms). A question that names a new crime, district,
            # or time window is a NEW investigation, never an inherited scope.
            text_hint = (request_text or "").lower()
            words = text_hint.split()
            scope_new_terms = (
                "case", "fir", "crime", "district", "station", "theft", "burglary",
                "robbery", "murder", "assault", "fraud", "scam", "drug", "bengaluru",
                "mysuru", "month", "year", "week", "today", "yesterday", "area", "city",
            )
            is_followup = (
                len(words) <= 6
                and "?" in text_hint
                and any(k in text_hint for k in ("connect", "link", "related", "similar",
                                                 "repeat", "network", "financial", "money", "involv"))
                and not any(k in text_hint for k in scope_new_terms)
            )
        if not is_followup:
            return

        prev_plan = investigation_context.get("plan") or {}
        prev_filters = prev_plan.get("filters") or {}
        discovered_cases = investigation_context.get("discovered_cases", [])[:10]
        discovered_accused = investigation_context.get("discovered_accused", [])[:10]

        # 1. Seed entities from the previous investigation
        entities = plan.setdefault("entities", {"case_ids": [], "accused_ids": []})
        for key, prev_ids in (("case_ids", discovered_cases), ("accused_ids", discovered_accused)):
            merged = list(entities.get(key, [])) + list(prev_ids)
            plan["entities"][key] = list(dict.fromkeys(int(x) for x in merged if x))[:15]

        # 2. Inherit exact previous scope when the follow-up specifies none
        filters = plan.setdefault("filters", {})
        for key in ("crime_category", "crime_sub_head_id", "crime_head_id",
                    "crime_sub_head_name", "crime_head_name",
                    "district_name", "district_id", "district_name_resolved",
                    "time_window", "date_from", "date_to", "time_window_label"):
            if not filters.get(key) and prev_filters.get(key):
                filters[key] = prev_filters[key]

        # 3. Keep scope display fields consistent
        plan["scope"] = {
            "crime_category": filters.get("crime_category"),
            "district": filters.get("district_name"),
            "time_window": filters.get("time_window"),
        }

        # 5. A follow-up that resolved to an entity-centric intent (financial /
        #    network / similarity) with discovered context entities is satisfied
        #    by that context — mark requires_context=False so the scope firewall
        #    knows the requirement was met.
        if discovered_cases or discovered_accused:
            if plan.get("requires_context"):
                plan["requires_context_satisfied_by_context"] = True
                plan["requires_context"] = False

        # 4. If the follow-up is about people/connections/finance, add the
        #    relevant engines deterministically (covers "which ones are connected?"
        #    when the LLM returns only case_query).
        #
        #    When the deterministic routing policy already picked the engines,
        #    that selection is authoritative — never append extra engines here.
        if (plan.get("routing") or {}).get("deterministic"):
            return
        summary = (plan.get("summary") or "").lower()
        engines = plan["engines"]
        intent = plan.get("intent", "")
        if any(k in summary for k in ("connect", "link", "network", "relationship", "money", "financ")) \
                or intent in ("criminal_network", "financial_analysis", "evidence_graph"):
            if discovered_accused and "criminal_network" not in engines:
                engines.append("criminal_network")
            if ("financial" in summary or intent == "financial_analysis") \
                    and "financial_intelligence" not in engines:
                engines.append("financial_intelligence")
        if any(k in summary for k in ("these cases", "those cases", "similar", "related", "repeat")) \
                or intent in ("case_similarity", "narrative_similarity", "pattern_detection"):
            if "case_similarity" not in engines and (discovered_cases or intent == "narrative_similarity"):
                engines.append("case_similarity")
            if ("pattern" in summary or intent in ("pattern_detection", "narrative_similarity")) \
                    and "pattern_detection" not in engines:
                engines.append("pattern_detection")
        plan["engines"] = [e for e in engines if e in self.VALID_ENGINES]

    def _fallback_plan(self, request_text: str, error: str = None,
                       investigation_context: dict = None) -> dict:
        """Deterministic fallback when LLM is unavailable."""
        # A full sentence never matches BriefFacts/CrimeNo as a keyword, so only
        # keep a search keyword when it is a real keyword (no spaces).
        keyword = None
        if " " not in request_text.strip() and len(request_text) <= 60:
            keyword = request_text.strip()
        plan = {
            "intent": "investigate",
            "investigation_type": "crime_pattern_investigation",
            "objectives": ["Search for cases matching the request"],
            "engines": ["case_query"],
            "filters": {},
            "scope": {"crime_category": None, "district": None, "time_window": None},
            "entities": {"case_ids": [], "accused_ids": []},
            "summary": f"Fallback plan: structured case search for '{request_text[:80]}'"
        }
        if keyword:
            plan["filters"]["search_keyword"] = keyword
        self._deterministic_case_lookup_correction(request_text, plan)
        self._merge_investigation_context(plan, investigation_context, request_text)
        return plan


# ════════════════════════════════════════════════════════════════
#  STEP 2: INVESTIGATION ORCHESTRATOR
# ════════════════════════════════════════════════════════════════

class InvestigationOrchestrator:
    """
    Executes the investigation plan by calling existing engines.
    Passes outputs between engines where dependencies exist.
    Each engine call is independent — failure in one does not block others.
    """

    def __init__(self):
        self.db_url = os.getenv("NEON_DATABASE_URL")

    def _resolve_scope(self, filters: dict) -> dict:
        """
        Deterministically resolves LLM-generated text filters into database IDs.
        
        The LLM planner produces text like:
            crime_category: "Vehicle Theft"
            district_name: "Bengaluru"
        
        This method resolves them to:
            crime_head_id: 11 (Motor Vehicle Theft CrimeSubHeadID)
            district_id: 5 (Bengaluru Urban DistrictID)
        
        Uses direct database lookups — no string matching hacks.
        """
        if not self.db_url:
            return filters
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()

            # Resolve crime_category -> crime_head_id (CrimeSubHeadID or CrimeHeadID)
            crime_category = filters.get("crime_category")
            if crime_category and not filters.get("crime_head_id"):
                cat_lower = crime_category.lower().strip()
                # First try CrimeSubHead (specific: Motor Vehicle Theft, Burglary, etc.)
                cur.execute("""
                    SELECT csh.CrimeSubHeadID, csh.CrimeHeadName, csh.CrimeHeadID
                    FROM CrimeSubHead csh
                    WHERE LOWER(csh.CrimeHeadName) LIKE %s
                    ORDER BY LENGTH(csh.CrimeHeadName) ASC
                    LIMIT 1
                """, (f"%{cat_lower}%",))
                row = cur.fetchone()
                if row:
                    filters["crime_sub_head_id"] = row[0]  # Specific: Motor Vehicle Theft = 11
                    filters["crime_head_id"] = row[2]       # Broad: Crimes Against Property = 2
                    filters["crime_sub_head_name"] = row[1]
                else:
                    # Try CrimeHead (broad: Crimes Against Property, etc.)
                    cur.execute("""
                        SELECT CrimeHeadID, CrimeGroupName 
                        FROM CrimeHead 
                        WHERE LOWER(CrimeGroupName) LIKE %s
                        LIMIT 1
                    """, (f"%{cat_lower}%",))
                    row = cur.fetchone()
                    if row:
                        filters["crime_head_id"] = row[0]
                        filters["crime_head_name"] = row[1]

            # Resolve district_name / station phrase -> district_id (+ unit_ids)
            # Uses the shared deterministic LocationResolver: handles aliases
            # ("Bangalore" → "Bengaluru Urban"), compound phrases
            # ("Bengaluru Urban Central" → district + Central stations), and
            # direct station names ("central ps 10"). Never hardcoded IDs.
            district_name = filters.get("district_name")
            if district_name and not filters.get("district_id") and not filters.get("unit_ids"):
                loc = LocationResolver(self.db_url).resolve(district_name)
                if loc.get("matched"):
                    filters["district_id"] = loc.get("district_id")
                    filters["district_name_resolved"] = loc.get("district_name")
                    if loc.get("unit_ids"):
                        filters["unit_ids"] = loc["unit_ids"]
                        filters["unit_names"] = loc["unit_names"]

            # Resolve time_window -> date_from (concrete ISO date, so it can be
            # used safely as a bound in parameterized SQL queries).
            # "latest"/"recent" is a SORT + LIMIT instruction, NOT a date filter:
            # the most recent records are returned without a time cutoff.
            time_window = filters.get("time_window")
            if time_window and not filters.get("date_from"):
                tw = str(time_window).lower().strip()
                if tw in ("latest", "recent", "newest"):
                    filters["time_window_label"] = "Latest registered records"
                elif tw == "this month":
                    filters["date_from"] = datetime.now().replace(day=1).strftime("%Y-%m-%d")
                    filters["time_window_label"] = "This month"
                else:
                    months = {"1m": 1, "3m": 3, "6m": 6, "12m": 12, "24m": 24}.get(tw)
                    if not months:
                        m = re.search(r"last\s+(\d{1,2})\s+months?", tw)
                        if m:
                            months = int(m.group(1))
                    if months:
                        cutoff = datetime.now() - timedelta(days=30 * months)
                        filters["date_from"] = cutoff.strftime("%Y-%m-%d")
                        filters["time_window_label"] = f"Last {months} months"
                    else:
                        filters["time_window_label"] = str(time_window)

            cur.close()
            conn.close()
        except Exception as e:
            # Scope resolution failed — continue with original filters
            pass
        return filters

    def _build_resolved_scope(self, filters: dict) -> dict:
        """
        Builds a structured, human-readable summary of the investigation scope
        after deterministic resolution. Used by the frontend to display the
        INVESTIGATION SCOPE indicator and by the response builder for honesty
        about what was (and was not) resolved.

        Status values:
            verified       — every explicitly requested scope resolved to a DB ID
            partial        — some requested scopes resolved, some did not
            failed         — an explicitly requested scope could not be resolved
            not_specified  — no explicit scope was requested
        """
        warnings = filters.get("_scope_warnings", []) or []

        crime = {
            "requested": filters.get("crime_category"),
            "resolved_name": filters.get("crime_sub_head_name") or filters.get("crime_head_name"),
            "resolved": bool(filters.get("crime_sub_head_id") or filters.get("crime_head_id")),
        }
        district = {
            "requested": filters.get("district_name"),
            "resolved_name": filters.get("district_name_resolved"),
            "resolved": bool(filters.get("district_id")),
        }
        station = {
            "requested": filters.get("station_name")
                         or (filters.get("district_name") if filters.get("unit_ids") else None),
            "resolved_names": filters.get("unit_names", []),
            "resolved": bool(filters.get("unit_ids")),
        }
        time_window = {
            "requested": filters.get("time_window"),
            "label": filters.get("time_window_label"),
            "resolved": bool(filters.get("date_from")) or bool(filters.get("time_window")),
        }

        requested_any = bool(crime["requested"] or district["requested"] or time_window["requested"])
        failed = [w for w in warnings if w["type"] in ("crime_category_unresolved", "district_unresolved")]

        if not requested_any:
            status = "not_specified"
        elif failed:
            resolved_ok = sum([crime["resolved"] if crime["requested"] else 1,
                               district["resolved"] if district["requested"] else 1,
                               time_window["resolved"] if time_window["requested"] else 1])
            requested_count = sum([1 if crime["requested"] else 0,
                                   1 if district["requested"] else 0,
                                   1 if time_window["requested"] else 0])
            status = "partial" if requested_count > len(failed) and resolved_ok > 0 else "failed"
        else:
            status = "verified"

        return {
            "status": status,
            "crime": crime,
            "district": district,
            "station": station,
            "time_window": time_window,
            "warnings": warnings,
            "engines": [],  # populated by execute_plan
        }

    def _validate_scope(self, filters: dict) -> list:
        """
        Detects when explicitly requested scopes failed to resolve.
        Returns a list of warnings. Engines should check these before
        broadening queries.
        """
        warnings = []
        # If user provided a crime category but it didn't resolve
        crime_cat = filters.get("crime_category")
        if crime_cat and not filters.get("crime_sub_head_id") and not filters.get("crime_head_id"):
            warnings.append({
                "type": "crime_category_unresolved",
                "requested": crime_cat,
                "message": f"Crime category '{crime_cat}' could not be resolved to a database ID.",
            })
        # If user provided a district but it didn't resolve
        dist_name = filters.get("district_name")
        if dist_name and not filters.get("district_id"):
            warnings.append({
                "type": "district_unresolved",
                "requested": dist_name,
                "message": f"District '{dist_name}' could not be resolved to a database ID.",
            })
        return warnings

    def execute_plan(self, plan: dict, rbac_filter: str,
                     nl2sql_engine, rag_engine, graph_engine,
                     network_engine, pattern_engine, analytics_engine,
                     case_explorer_engine) -> list:
        """
        Executes each engine in the plan and collects evidence items.
        Returns a list of evidence item dicts.
        """
        evidence_items = []
        filters = plan.get("filters", {})

        # Deterministically resolve LLM text filters to database IDs
        filters = self._resolve_scope(filters)

        # Validate scope resolution — detect when explicitly requested scopes failed
        scope_warnings = self._validate_scope(filters)
        filters["_scope_warnings"] = scope_warnings
        plan["filters"] = filters  # Update plan with resolved IDs
        plan["scope_warnings"] = scope_warnings

        # Build a human-readable scope summary for the frontend INVESTIGATION SCOPE UI
        resolved_scope = self._build_resolved_scope(filters)

        # ── Entity-first exact case scope ──
        # When the question resolved to a specific FIR/case, the scope display
        # must show THAT record (never "State-wide / All time / 2896 records").
        exact_case = plan.get("exact_case")
        if exact_case and exact_case.get("found"):
            ec = exact_case
            rs = plan.get("resolved_scope", resolved_scope)
            rs["status"] = "verified" if ec.get("record") else "failed"
            rs["crime"] = {
                "requested": None,
                "resolved_name": ec.get("crime_sub_head") or ec.get("crime_head"),
                "resolved": True,
            }
            rs["district"] = {
                "requested": None,
                "resolved_name": ec.get("district"),
                "resolved": bool(ec.get("district")),
            }
            rs["station"] = {
                "requested": None,
                "resolved_names": [ec["station"]] if ec.get("station") else [],
                "resolved": bool(ec.get("station")),
            }
            rs["time_window"] = {
                "requested": None,
                "label": ec.get("registered") or "Exact record",
                "resolved": True,
            }
            rs["exact_case"] = {
                "record_found": True,
                "identifier": ec.get("identifier"),
                "crime_no": ec.get("crime_no"),
                "case_master_id": ec.get("case_master_id"),
                "crime": ec.get("crime_sub_head") or ec.get("crime_head"),
                "location": ec.get("district"),
                "station": ec.get("station"),
                "registered": ec.get("registered"),
                "status": ec.get("status"),
            }
            plan["resolved_scope"] = rs
        elif exact_case and not exact_case.get("found") and exact_case.get("identifier"):
            rs = plan.get("resolved_scope", resolved_scope)
            rs["status"] = "failed"
            rs["exact_case"] = {
                "record_found": False,
                "identifier": exact_case.get("identifier"),
                "crime": None,
                "location": None,
                "station": None,
                "registered": None,
                "status": None,
            }
            plan["resolved_scope"] = rs
        else:
            plan["resolved_scope"] = resolved_scope

        entities = plan.get("entities", {})
        engines_to_run = plan.get("engines", [])
        intent = plan.get("intent", "")

        # Track discovered entities for chaining
        discovered_cases = set(entities.get("case_ids", []))
        discovered_accused = set(entities.get("accused_ids", []))

        # ── SCOPE FIREWALL (safety gate, runs before ANY engine) ──
        # Rule: no entity → no entity traversal; no scope → no scoped query.
        # An entity-centric intent (financial / network / risk / similarity)
        # that has NEITHER an explicit entity (query or previous context) NOR
        # an explicit scoped case set to establish must STOP — it never falls
        # back to "latest 50 records" or a state-wide search.
        has_scope_filters = bool(
            filters.get("crime_sub_head_id") or filters.get("crime_head_id")
            or filters.get("district_id") or filters.get("unit_ids")
            or filters.get("date_from") or filters.get("date_to")
        )
        has_entities = bool(discovered_cases or discovered_accused)
        entity_centric = intent in (
            "financial_analysis", "criminal_network", "risk_analysis", "case_similarity"
        )
        if entity_centric and not has_entities and not has_scope_filters:
            evidence_items.append(self._build_context_required_item(intent, filters))
            engines_to_run = []
        elif entity_centric and has_entities and not has_scope_filters:
            # Entities (from query or previous context) satisfy the request.
            # A case_query without any scope filter would return an unrelated
            # state-wide list — never allowed for entity-centric requests.
            engines_to_run = [e for e in engines_to_run if e != "case_query"]
        elif "case_query" in engines_to_run and not has_scope_filters \
                and not filters.get("search_keyword") and not has_entities \
                and intent not in ("case_search", "general_investigation", "exact_case_lookup"):
            # Analysis intents never run an implicit broad case list.
            engines_to_run = [e for e in engines_to_run if e != "case_query"]

        # ── Phase 1: Case retrieval ──
        if exact_case and exact_case.get("found") and exact_case.get("record"):
            # Entity-first: retrieve exactly the resolved case. General scope
            # filters never apply; crime words were verification, not filters.
            cid = exact_case.get("case_master_id")
            if cid:
                discovered_cases.add(int(cid))
            for aid in exact_case.get("accused_ids", []) or []:
                discovered_accused.add(int(aid))
            evidence_items.append(self._build_exact_case_item(exact_case))
            # Analysis engines keep their role off the discovered entity; broad
            # search engines that would re-run a filtered list are dropped.
            engines_to_run = [
                e for e in engines_to_run
                if e not in ("case_query", "pattern_detection", "trend_analysis", "narrative_rag")
            ]
        elif exact_case and not exact_case.get("found") and exact_case.get("identifier"):
            # Invalid exact identifier — NEVER fall back to a broad search.
            identifier = exact_case.get("identifier")
            evidence_items.append({
                "engine": "case_query",
                "type": "scope_error",
                "data": {"error": f"FIR/Case {identifier} not found"},
                "signal": f"I couldn't find FIR/Case {identifier} in the authorized records.",
                "strength": "none",
            })
            engines_to_run = []
        elif "case_query" in engines_to_run:
            items = self._run_case_query(
                filters, rbac_filter, case_explorer_engine, nl2sql_engine
            )
            evidence_items.extend(items)
            # Extract discovered entities from case query results
            for item in items:
                for case in item.get("data", {}).get("cases", []):
                    cid = case.get("casemasterid") or case.get("CaseMasterID")
                    if cid:
                        discovered_cases.add(int(cid))

        # Phase 2: Narrative RAG (independent)
        if "narrative_rag" in engines_to_run:
            items = self._run_narrative_rag(filters, rag_engine)
            evidence_items.extend(items)

        # Phase 3: Pattern detection (independent)
        if "pattern_detection" in engines_to_run:
            items = self._run_pattern_detection(filters, pattern_engine, rbac_filter)
            evidence_items.extend(items)

        # Phase 4: Trend analysis (independent)
        if "trend_analysis" in engines_to_run:
            items = self._run_trend_analysis(filters, rbac_filter, nl2sql_engine)
            evidence_items.extend(items)

        # Phase 5: Case similarity (depends on discovered_cases or explicit case_ids)
        if "case_similarity" in engines_to_run:
            similarity_targets = list(discovered_cases)[:5]  # Cap at 5 for performance
            items = self._run_case_similarity(similarity_targets, pattern_engine)
            evidence_items.extend(items)

        # Phase 6: Network analysis (depends on discovered_accused)
        # First, extract accused IDs from discovered cases
        if "criminal_network" in engines_to_run:
            if not discovered_accused and discovered_cases:
                discovered_accused = self._extract_accused_from_cases(
                    discovered_cases, rbac_filter
                )
            items = self._run_network_analysis(
                list(discovered_accused)[:10], network_engine
            )
            evidence_items.extend(items)

        # Phase 7: Risk profiles (depends on discovered_accused)
        if "risk_profile" in engines_to_run:
            if not discovered_accused and discovered_cases:
                discovered_accused = self._extract_accused_from_cases(
                    discovered_cases, rbac_filter
                )
            items = self._run_risk_profiles(
                list(discovered_accused)[:20], analytics_engine
            )
            evidence_items.extend(items)

        # Phase 8: Financial intelligence (depends on discovered_accused + discovered_cases)
        if "financial_intelligence" in engines_to_run or "financial" in engines_to_run:
            if not discovered_accused and discovered_cases:
                discovered_accused = self._extract_accused_from_cases(
                    discovered_cases, rbac_filter
                )
            items = self._run_financial_analysis(
                list(discovered_accused)[:20],
                list(discovered_cases)[:10],
                filters,
            )
            evidence_items.extend(items)

        # Record which engines actually ran and succeeded for the scope UI
        # (context_required / zero_result / errors are NOT "executed" findings)
        executed = sorted({
            item["engine"] for item in evidence_items
            if item["type"] not in ("error", "scope_error", "context_required", "zero_result")
        })
        if exact_case and exact_case.get("found"):
            # Label the route precisely for the UI / debugging
            executed = sorted(set(executed) | {"exact_case_lookup"})
        attempted = sorted(set(engines_to_run))
        resolved_scope = plan.get("resolved_scope", {})
        resolved_scope["engines"] = executed
        resolved_scope["engines_attempted"] = attempted
        plan["resolved_scope"] = resolved_scope

        return evidence_items

    def _build_exact_case_item(self, exact_case: dict) -> dict:
        """Evidence item containing exactly the resolved single case record."""
        record = exact_case.get("record") or {}
        case_row = {
            "casemasterid": record.get("casemasterid") or exact_case.get("case_master_id"),
            "crimeno": record.get("crimeno") or exact_case.get("crime_no"),
            "crimeregistereddate": record.get("crimeregistereddate") or exact_case.get("registered"),
            "districtname": record.get("districtname") or exact_case.get("district"),
            "police_station": record.get("police_station") or exact_case.get("station"),
            "casestatusname": record.get("casestatusname") or exact_case.get("status"),
            "crime_sub_head": record.get("crime_sub_head") or exact_case.get("crime_sub_head"),
            "crime_head": record.get("crime_head") or exact_case.get("crime_head"),
        }
        case_row = {k: v for k, v in case_row.items() if v is not None}
        identifier = case_row.get("crimeno") or exact_case.get("identifier") or ""
        return {
            "engine": "case_query",
            "type": "case_list",
            "data": {"cases": [case_row], "total_count": 1},
            "signal": f"Resolved FIR {identifier} to one authorized case record",
            "strength": "strong",
        }

    def _build_context_required_item(self, intent: str, filters: dict) -> dict:
        """
        Evidence item for entity-centric requests with NO resolvable entity and
        NO scoped case set. The response builder turns this into an explicit
        "Context Required" answer — no engine is run, no broad list is returned.
        """
        hints = []
        if intent in ("financial_analysis",):
            hints = ["Please provide a FIR/case number or refer to a specific investigation."]
        elif intent in ("criminal_network", "risk_analysis"):
            hints = ["Please provide a specific accused/person, FIR/case number, or investigation context."]
        elif intent == "case_similarity":
            hints = ["Please provide the specific FIR/case number to compare against."]
        hint_text = " " + " ".join(hints) if hints else ""
        message = (
            "No specific investigation, case, suspect, or account is currently available"
            f" to trace.{hint_text}"
        )
        return {
            "engine": "case_query",
            "type": "context_required",
            "data": {"intent": intent, "error": message},
            "signal": message,
            "strength": "none",
        }

    def _run_case_query(self, filters: dict, rbac_filter: str,
                        case_explorer_engine, nl2sql_engine) -> list:
        """Execute SQL-based case search with investigation scope. Returns evidence items."""
        items = []
        try:
            # NEVER silently broaden an explicitly requested scope.
            # If the investigator named a crime category or district that could
            # not be resolved, stop and explain instead of running an unfiltered
            # query that would return unrelated records.
            scope_warnings = filters.get("_scope_warnings", []) or []
            unresolved = [w for w in scope_warnings
                          if w["type"] in ("crime_category_unresolved", "district_unresolved")]
            if unresolved:
                message = "; ".join(w["message"] for w in unresolved)
                items.append({
                    "engine": "case_query",
                    "type": "scope_error",
                    "data": {"error": message},
                    "signal": f"Case query stopped: {message}",
                    "strength": "none",
                })
                return items

            # Build case explorer params from investigation filters.
            # RBAC is applied INSIDE the query (mandatory AND), and the
            # investigation scope (district / station / crime / date / limit)
            # is layered on top — never the other way around.
            params = {
                "page": 1,
                "page_size": int(filters.get("limit") or 50),
                "rbac_filter": rbac_filter,
            }
            if filters.get("district_id"):
                params["district_id"] = filters["district_id"]
            if filters.get("unit_ids"):
                params["unit_ids"] = filters["unit_ids"]
            if filters.get("crime_sub_head_id"):
                params["crime_sub_head_id"] = filters["crime_sub_head_id"]
                if filters.get("crime_head_id"):
                    params["crime_head_id"] = filters["crime_head_id"]
            elif filters.get("crime_head_id"):
                params["crime_head_id"] = filters["crime_head_id"]
            if filters.get("date_from"):
                params["date_from"] = filters["date_from"]
            if filters.get("date_to"):
                params["date_to"] = filters["date_to"]
            if filters.get("search_keyword"):
                params["search_term"] = filters["search_keyword"]

            result = case_explorer_engine.search_cases(**params)

            if "error" not in result and result.get("cases"):
                cases = result["cases"]

                items.append({
                    "engine": "case_query",
                    "type": "case_list",
                    "data": {
                        "cases": cases,
                        "total_count": result.get("pagination", {}).get("total_count", len(cases)),
                    },
                    "signal": f"Found {len(cases)} cases matching investigation criteria",
                    "strength": "strong" if len(cases) >= 5 else "moderate" if len(cases) >= 2 else "limited",
                })
            else:
                # Fallback: use NL2SQL for keyword search
                search_keyword = filters.get("search_keyword")
                if search_keyword:
                    district_name = filters.get("district_name")
                    query_text = f"Search for cases involving '{search_keyword}'"
                    if district_name:
                        query_text += f" in {district_name}"
                    generated_sql = nl2sql_engine.generate_sql(query_text, rbac_filter=rbac_filter)
                    exec_result = nl2sql_engine.validate_and_execute(generated_sql, query_text)
                    if "error" not in exec_result and exec_result.get("rows"):
                        items.append({
                            "engine": "case_query",
                            "type": "case_list",
                            "data": {"cases": exec_result["rows"]},
                            "signal": f"Found {len(exec_result['rows'])} cases via NL2SQL search",
                            "strength": "moderate",
                        })

        except Exception as e:
            items.append({
                "engine": "case_query",
                "type": "error",
                "data": {"error": str(e)},
                "signal": f"Case query failed: {str(e)[:100]}",
                "strength": "none",
            })
        return items

    def _run_narrative_rag(self, filters: dict, rag_engine) -> list:
        """Execute RAG semantic search. Returns evidence items."""
        items = []
        try:
            # Prefer the explicitly extracted MO/narrative phrase
            # ("break-in using forced entry"); fall back to the search keyword.
            keyword = filters.get("mo_phrase") or filters.get("search_keyword")
            if not keyword:
                return items

            result = rag_engine.search_and_summarize(keyword)
            if "error" not in result and result.get("citations"):
                items.append({
                    "engine": "narrative_rag",
                    "type": "narrative_matches",
                    "data": {
                        "answer": result.get("answer", ""),
                        "citations": result.get("citations", []),
                        "similarity_basis": keyword,
                    },
                    "signal": f"RAG found {len(result['citations'])} narratively similar FIRs",
                    "strength": "strong" if len(result["citations"]) >= 3 else "moderate",
                })
        except Exception as e:
            items.append({
                "engine": "narrative_rag",
                "type": "error",
                "data": {"error": str(e)},
                "signal": f"RAG search failed: {str(e)[:100]}",
                "strength": "none",
            })
        return items

    def _run_pattern_detection(self, filters: dict, pattern_engine, rbac_filter: str = "1=1") -> list:
        """Execute MO-based pattern detection with investigation scope. Returns evidence items."""
        items = []
        try:
            # Use scoped pattern detection that respects crime category and district
            # Use crime_sub_head_id (specific) if available, otherwise crime_head_id (broad)
            scoped_crime_id = filters.get("crime_sub_head_id") or filters.get("crime_head_id")
            district_id = filters.get("district_id")
            time_window = filters.get("time_window")

            # Check if user explicitly requested a scope that couldn't be resolved
            scope_warnings = filters.get("_scope_warnings", [])
            crime_cat_requested = filters.get("crime_category") and not scoped_crime_id
            district_requested = filters.get("district_name") and not district_id

            if crime_cat_requested:
                # User asked for specific crime category but it couldn't be resolved
                items.append({
                    "engine": "pattern_detection",
                    "type": "scope_error",
                    "data": {"error": f"Crime category '{filters.get('crime_category')}' could not be resolved."},
                    "signal": f"Pattern analysis skipped: scope '{filters.get('crime_category')}' not found in database.",
                    "strength": "none",
                })
                return items

            if district_requested:
                # User asked for specific district but it couldn't be resolved
                items.append({
                    "engine": "pattern_detection",
                    "type": "scope_error",
                    "data": {"error": f"District '{filters.get('district_name')}' could not be resolved."},
                    "signal": f"Pattern analysis skipped: district '{filters.get('district_name')}' not found.",
                    "strength": "none",
                })
                return items

            # If we have a scoped method, use it; otherwise fall back to unscoped
            # The unscoped fallback is only appropriate when NO specific scope was requested
            if hasattr(pattern_engine, 'get_scoped_patterns') and (scoped_crime_id or district_id):
                result = pattern_engine.get_scoped_patterns(
                    crime_head_id=scoped_crime_id,
                    district_id=district_id,
                    time_window=time_window,
                )
            else:
                # No specific scope requested — use general emerging patterns
                result = pattern_engine.get_emerging_patterns()

            if "error" in result:
                # Engine failed — a distinct outcome from "no pattern found".
                items.append({
                    "engine": "pattern_detection",
                    "type": "error",
                    "data": {"error": result["error"]},
                    "signal": f"Pattern detection engine error: {str(result['error'])[:100]}",
                    "strength": "none",
                })
                return items

            patterns = result.get("patterns") or []
            # Additional district filter if using unscoped method
            district_name = filters.get("district_name")
            if district_name and not district_id:
                patterns = [p for p in patterns
                            if district_name.lower() in
                            " ".join([str(d) for d in p.get("districts", [])]).lower()
                            or any(district_name.lower() in c.get("district", "").lower()
                                   for c in p.get("cases", []))]

            if patterns:
                items.append({
                    "engine": "pattern_detection",
                    "type": "patterns",
                    "data": {"patterns": patterns},
                    "signal": f"Detected {len(patterns)} emerging crime pattern clusters",
                    "strength": "strong" if len(patterns) >= 3 else "moderate" if len(patterns) >= 1 else "limited",
                })
            else:
                # Zero-result pattern analysis: report the scope that was
                # examined and the absence of patterns — never a fake
                # visualization and never a broad case list.
                items.append(self._build_zero_pattern_item(filters, rbac_filter))
        except Exception as e:
            items.append({
                "engine": "pattern_detection",
                "type": "error",
                "data": {"error": str(e)},
                "signal": f"Pattern detection failed: {str(e)[:100]}",
                "strength": "none",
            })
        return items

    def _build_zero_pattern_item(self, filters: dict, rbac_filter: str = "1=1") -> dict:
        """
        Zero-result pattern evidence: reports the scope actually examined and
        the number of cases reviewed, so the response can state "no recurring
        pattern was detected" with the honest scope — never "0 data points"
        and never a substituted case list.
        """
        scope_parts = []
        if filters.get("crime_sub_head_name") or filters.get("crime_head_name"):
            scope_parts.append(filters.get("crime_sub_head_name") or filters.get("crime_head_name"))
        if filters.get("district_name_resolved") or filters.get("district_name"):
            scope_parts.append(filters.get("district_name_resolved") or filters.get("district_name"))
        scope_text = ", ".join(scope_parts) or "the requested scope"
        time_label = filters.get("time_window_label") or "recent period"
        cases_examined = self._scope_case_count(filters, rbac_filter)
        return {
            "engine": "pattern_detection",
            "type": "zero_result",
            "data": {
                "zero_result": True,
                "category": filters.get("crime_sub_head_name") or filters.get("crime_head_name") or filters.get("crime_category"),
                "location": filters.get("district_name_resolved") or filters.get("district_name"),
                "time_label": time_label,
                "cases_examined": cases_examined,
            },
            "signal": f"No recurring pattern detected within {scope_text} ({time_label}).",
            "strength": "none",
        }

    def _scope_case_count(self, filters: dict, rbac_filter: str = "1=1"):
        """Counts the cases within the resolved scope (used by zero-result
        pattern reports). Returns an int or None when not computable."""
        if not self.db_url:
            return None
        conds = []
        params = []
        if filters.get("crime_sub_head_id"):
            conds.append("cm.CrimeMinorHeadID = %s")
            params.append(filters["crime_sub_head_id"])
        elif filters.get("crime_head_id"):
            conds.append("cm.CrimeMajorHeadID = %s")
            params.append(filters["crime_head_id"])
        if filters.get("district_id"):
            conds.append("u.DistrictID = %s")
            params.append(filters["district_id"])
        if filters.get("date_from"):
            conds.append("cm.CrimeRegisteredDate >= %s")
            params.append(filters["date_from"])
        if filters.get("date_to"):
            conds.append("cm.CrimeRegisteredDate <= %s")
            params.append(filters["date_to"])
        if rbac_filter and rbac_filter.strip() not in ("", "1=1") and ";" not in rbac_filter and "--" not in rbac_filter:
            conds.append(f"({rbac_filter})")
        if not conds:
            return None
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            sql = ("SELECT COUNT(*) FROM CaseMaster cm "
                   "JOIN Unit u ON cm.PoliceStationID = u.UnitID WHERE " + " AND ".join(conds))
            cur.execute(sql, params)
            count = cur.fetchone()[0]
            cur.close()
            conn.close()
            return int(count)
        except Exception:
            return None

    def _run_trend_analysis(self, filters: dict, rbac_filter: str, nl2sql_engine) -> list:
        """Execute temporal trend analysis via NL2SQL, with a deterministic SQL
        fallback so a trend question never returns "0 data points" when the
        NL2SQL layer fails. Returns evidence items."""
        items = []
        try:
            trend_instruction = " FORCE TREND FORMAT: Group by month. Select exactly two columns: 'month' (e.g. TO_CHAR(cm.CrimeRegisteredDate, 'YYYY-MM')) and 'count'."
            district_name = filters.get("district_name") or filters.get("district_name_resolved")
            crime_category = filters.get("crime_category")

            months = 12
            if filters.get("date_from"):
                try:
                    cutoff = datetime.strptime(filters["date_from"], "%Y-%m-%d")
                    days = (datetime.now() - cutoff).days
                    months = max(1, min(int(round(days / 30)), 60))
                except Exception:
                    months = 12

            query_text = f"Show the crime registration trend over the last {months} months"
            if district_name:
                query_text += f" in {district_name}"
            if crime_category:
                query_text += f" for {crime_category}"

            trend_data = None
            generated_sql = None
            try:
                generated_sql = nl2sql_engine.generate_sql(
                    query_text + trend_instruction, rbac_filter=rbac_filter
                )
                exec_result = nl2sql_engine.validate_and_execute(generated_sql, query_text)
                if "error" not in exec_result and exec_result.get("rows"):
                    rows = []
                    for row in exec_result["rows"]:
                        keys = list(row.keys())
                        if len(keys) >= 2:
                            rows.append({"month": str(row[keys[0]]), "count": int(row[keys[1]])})
                    if rows:
                        trend_data = rows
            except Exception:
                trend_data = None

            if trend_data is None:
                # Deterministic fallback: aggregate by month with the resolved
                # scope filters and the mandatory RBAC condition.
                trend_data = self._deterministic_trend(filters, rbac_filter, months)

            if trend_data:
                items.append({
                    "engine": "trend_analysis",
                    "type": "trend",
                    "data": {"trend_data": trend_data},
                    "signal": f"Analyzed {len(trend_data)} months of crime trend data",
                    "strength": "strong" if len(trend_data) >= 6 else "moderate",
                })
            else:
                items.append({
                    "engine": "trend_analysis",
                    "type": "zero_result",
                    "data": {
                        "zero_result": True,
                        "scope": {
                            "crime": filters.get("crime_category"),
                            "district": filters.get("district_name_resolved") or filters.get("district_name"),
                            "months": months,
                        },
                    },
                    "signal": "No trend data available for the requested scope.",
                    "strength": "none",
                })
        except Exception as e:
            items.append({
                "engine": "trend_analysis",
                "type": "error",
                "data": {"error": str(e)},
                "signal": f"Trend analysis failed: {str(e)[:100]}",
                "strength": "none",
            })
        return items

    def _deterministic_trend(self, filters: dict, rbac_filter: str, months: int = 12) -> list:
        """
        Deterministic month-by-month case count aggregation using the resolved
        scope filters. RBAC is always applied. Returns [{'month','count'}] or [].
        """
        if not self.db_url:
            return []
        conds = []
        params = []
        if filters.get("crime_sub_head_id"):
            conds.append("cm.CrimeMinorHeadID = %s")
            params.append(filters["crime_sub_head_id"])
        elif filters.get("crime_head_id"):
            conds.append("cm.CrimeMajorHeadID = %s")
            params.append(filters["crime_head_id"])
        if filters.get("district_id"):
            conds.append("u.DistrictID = %s")
            params.append(filters["district_id"])
        if filters.get("unit_ids"):
            conds.append("u.UnitID = ANY(%s)")
            params.append(list(filters["unit_ids"]))
        cutoff = (datetime.now() - timedelta(days=30 * months)).strftime("%Y-%m-%d")
        conds.append("cm.CrimeRegisteredDate >= %s")
        params.append(cutoff)
        if rbac_filter and rbac_filter.strip() not in ("", "1=1") and ";" not in rbac_filter and "--" not in rbac_filter:
            conds.append(f"({rbac_filter})")
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            sql = (
                "SELECT TO_CHAR(cm.CrimeRegisteredDate, 'YYYY-MM') AS month, COUNT(*) AS count "
                "FROM CaseMaster cm JOIN Unit u ON cm.PoliceStationID = u.UnitID "
                "WHERE " + " AND ".join(conds) +
                " GROUP BY TO_CHAR(cm.CrimeRegisteredDate, 'YYYY-MM') "
                "ORDER BY month ASC"
            )
            cur.execute(sql, params)
            rows = [{"month": r[0], "count": int(r[1])} for r in cur.fetchall()]
            cur.close()
            conn.close()
            return rows
        except Exception:
            return []

    def _run_case_similarity(self, case_ids: list, pattern_engine) -> list:
        """Run case similarity for each target case. Returns evidence items."""
        items = []
        for case_id in case_ids[:5]:
            try:
                result = pattern_engine.find_similar_cases(case_id=case_id, k=5)
                if "error" not in result and result.get("similar_cases"):
                    matches = result["similar_cases"]
                    items.append({
                        "engine": "case_similarity",
                        "type": "similar_cases",
                        "data": {
                            "target_case_id": case_id,
                            "reference_case_id": case_id,
                            "similar_cases": matches,
                        },
                        "signal": f"Case #{case_id}: {len(matches)} similar cases found (top score: {matches[0]['match_score']:.0f}%)" if matches else f"Case #{case_id}: no similar cases found",
                        "strength": "strong" if matches and matches[0]["match_score"] >= 60 else "moderate" if matches else "limited",
                    })
            except Exception as e:
                items.append({
                    "engine": "case_similarity",
                    "type": "error",
                    "data": {"target_case_id": case_id, "error": str(e)},
                    "signal": f"Similarity search failed for Case #{case_id}: {str(e)[:80]}",
                    "strength": "none",
                })
        return items

    def _run_network_analysis(self, accused_ids: list, network_engine) -> list:
        """Run network graph analysis for each accused. Returns evidence items."""
        items = []
        seen_nodes = set()
        combined_nodes = []
        combined_edges = []

        for accused_id in accused_ids[:5]:
            try:
                result = network_engine.get_network(accused_id, max_hops=2)
                if "error" not in result and result.get("nodes"):
                    nodes = result["nodes"]
                    edges = result["edges"]

                    # Deduplicate nodes across accused
                    for node in nodes:
                        if node["id"] not in seen_nodes:
                            seen_nodes.add(node["id"])
                            combined_nodes.append(node)
                    combined_edges.extend(edges)

            except Exception as e:
                items.append({
                    "engine": "criminal_network",
                    "type": "error",
                    "data": {"accused_id": accused_id, "error": str(e)},
                    "signal": f"Network analysis failed for Accused #{accused_id}: {str(e)[:80]}",
                    "strength": "none",
                })

        if combined_nodes:
            items.append({
                "engine": "criminal_network",
                "type": "network",
                "data": {
                    "nodes": combined_nodes,
                    "edges": combined_edges,
                    "root_node": f"A{accused_ids[0]}" if accused_ids else "",
                    "stats": {
                        "node_count": len(combined_nodes),
                        "edge_count": len(combined_edges),
                    }
                },
                "signal": f"Mapped network: {len(combined_nodes)} connected entities, {len(combined_edges)} relationships",
                "strength": "strong" if len(combined_nodes) >= 5 else "moderate" if len(combined_nodes) >= 2 else "limited",
            })
        return items

    def _run_risk_profiles(self, accused_ids: list, analytics_engine) -> list:
        """Fetch risk profiles for accused individuals. Returns evidence items."""
        items = []
        profiles = []
        for accused_id in accused_ids[:20]:
            try:
                result = analytics_engine.get_risk_profile(accused_id)
                if "error" not in result:
                    profiles.append({
                        "accused_id": accused_id,
                        "score": result["score"],
                        "repeat_offender": result["repeat_offender"],
                        "factors": result.get("factors", ""),
                        "computed_date": str(result.get("computed_date", "")),
                    })
            except Exception:
                pass

        if profiles:
            # Sort by risk score descending
            profiles.sort(key=lambda x: x["score"], reverse=True)
            high_risk = [p for p in profiles if p["score"] >= 70]
            items.append({
                "engine": "risk_profile",
                "type": "risk_profiles",
                "data": {"profiles": profiles},
                "signal": f"Risk-assessed {len(profiles)} offenders; {len(high_risk)} high-risk (score ≥ 70)",
                "strength": "strong" if high_risk else "moderate",
            })
        return items

    def _run_financial_analysis(self, accused_ids: list, case_ids: list, filters: dict) -> list:
        """Execute financial intelligence analysis for investigation entities."""
        items = []
        if not accused_ids and not case_ids:
            return items
        try:
            from engines.financial_intelligence import FinancialIntelligenceEngine, FinancialLeadGenerator
            fin_engine = FinancialIntelligenceEngine()
            fin_leads = FinancialLeadGenerator()

            date_from = filters.get("date_from")
            date_to = filters.get("date_to")

            result = fin_engine.analyze_financial_relationships(
                accused_ids=accused_ids if accused_ids else None,
                case_ids=case_ids if case_ids else None,
                date_from=date_from,
                date_to=date_to,
            )

            # Generate financial leads
            leads = fin_leads.generate_leads(result)

            if result["summary"]["total_transactions"] > 0:
                items.append({
                    "engine": "financial_intelligence",
                    "type": "financial_intelligence",
                    "data": {
                        "accounts": result["accounts"],
                        "counterparty_accounts": result.get("counterparty_accounts", []),
                        "transactions": result["transactions"],
                        "cross_case_links": result["cross_case_links"],
                        "shared_accounts": result["shared_accounts"],
                        "transaction_chains": result.get("transaction_chains", []),
                        "anomalies": result["anomalies"],
                        "graph": result["graph"],
                        "summary": result["summary"],
                        "leads": leads,
                    },
                    "signal": (
                        f"Financial analysis: {result['summary']['total_transactions']} transactions, "
                        f"{result['summary']['cross_case_links']} cross-case links, "
                        f"{len(leads)} financial leads"
                    ),
                    "strength": (
                        "strong" if result["summary"]["cross_case_links"] > 0
                        else "moderate" if result["summary"]["total_transactions"] > 0
                        else "limited"
                    ),
                })
            else:
                items.append({
                    "engine": "financial_intelligence",
                    "type": "financial_intelligence",
                    "data": {"summary": result["summary"], "leads": []},
                    "signal": "No financial transactions found for investigation entities",
                    "strength": "limited",
                })
        except Exception as e:
            items.append({
                "engine": "financial_intelligence",
                "type": "error",
                "data": {"error": str(e)},
                "signal": f"Financial analysis error: {str(e)[:100]}",
                "strength": "limited",
            })
        return items

    def _extract_accused_from_cases(self, case_ids: set, rbac_filter: str) -> set:
        """Extract AccusedMasterIDs from a set of CaseMasterIDs via direct SQL."""
        accused_ids = set()
        if not self.db_url or not case_ids:
            return accused_ids
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            id_list = tuple(case_ids)
            cur.execute(
                "SELECT DISTINCT AccusedMasterID FROM Accused WHERE CaseMasterID IN %s",
                (id_list,)
            )
            for row in cur.fetchall():
                accused_ids.add(row[0])
            cur.close()
            conn.close()
        except Exception:
            pass
        return accused_ids


# ════════════════════════════════════════════════════════════════
#  STEP 3: EVIDENCE FUSION
# ════════════════════════════════════════════════════════════════

class EvidenceFusion:
    """
    Combines evidence from multiple engines into unified findings.
    Groups by entity (case, person), identifies overlapping signals,
    and calculates evidence strength.
    """

    def fuse(self, evidence_items: list, investigation_type: str) -> dict:
        """
        Fuses evidence items into structured findings.

        Returns:
            findings: list of finding dicts
            summary_stats: dict with counts
            evidence_graph: list of all evidence items (for provenance)
        """
        findings = []

        # Separate successful items from errors and scope failures
        successful = [e for e in evidence_items if e["type"] not in ("error", "scope_error", "context_required")]
        errors = [e for e in evidence_items if e["type"] == "error"]
        scope_failures = [e for e in evidence_items if e["type"] == "scope_error"]
        context_required = [e for e in evidence_items if e["type"] == "context_required"]
        zero_results = [e for e in evidence_items if e["type"] == "zero_result"]

        # ── Context Required (entity-centric request with no resolvable
        #    entity and no scoped case set) ──
        # Surfaced as a first-class finding; the response builder turns it into
        # the explicit "Context Required" answer. No engine ran — no broad list.
        if context_required:
            messages = list(dict.fromkeys(e["signal"] for e in context_required))
            findings.append({
                "category": "Context Required",
                "description": "; ".join(messages) if messages else "No investigation context is available.",
                "evidence_sources": [e["engine"] for e in context_required],
                "data": {"context_errors": [{"engine": e["engine"], "message": e["signal"]} for e in context_required]},
                "strength": "none",
                "context_required": True,
            })

        # ── Zero-result findings ──
        # Engines that ran correctly but found nothing (no pattern, no trend
        # data) are reported as such with the scope they examined — never
        # converted into a generic case list.
        if zero_results:
            for zr in zero_results:
                data = zr.get("data", {}) or {}
                engine_label = {
                    "pattern_detection": "pattern",
                    "trend_analysis": "trend",
                }.get(zr.get("engine"), zr.get("engine"))
                scope_desc = data.get("scope_description") or "the requested scope"
                time_label = data.get("time_label") or ""
                examined = data.get("cases_examined")
                detail = zr.get("signal") or f"No {engine_label} detected in the requested scope."
                if examined is not None:
                    detail += f" Cases examined: {examined}."
                if time_label:
                    detail += f" Time period: {time_label}."
                if data.get("location"):
                    detail += f" Location: {data['location']}."
                findings.append({
                    "category": "No Matching Evidence",
                    "description": detail,
                    "evidence_sources": [zr.get("engine")],
                    "data": data,
                    "strength": "none",
                    "zero_result": True,
                })

        # ── Investigation Scope failure ──
        # An explicitly requested scope that could not be resolved is surfaced
        # as a first-class finding so the response never pretends the analysis
        # succeeded on a broadened scope.
        if scope_failures:
            scope_messages = list(dict.fromkeys(e["signal"] for e in scope_failures))
            findings.append({
                "category": "Investigation Scope",
                "description": "; ".join(scope_messages) if scope_messages else "The requested investigation scope could not be resolved.",
                "evidence_sources": [e["engine"] for e in scope_failures],
                "data": {"scope_errors": [{"engine": e["engine"], "message": e["signal"]} for e in scope_failures]},
                "strength": "none",
            })

        # ── Finding 1: Case Discovery ──
        case_items = [e for e in successful if e["type"] == "case_list"]
        if case_items:
            all_cases = []
            for item in case_items:
                all_cases.extend(item["data"].get("cases", []))
            findings.append({
                "category": "Cases Identified",
                "description": f"Found {len(all_cases)} relevant FIR records matching investigation criteria.",
                "evidence_sources": [item["engine"] for item in case_items],
                "data": {"cases": all_cases[:50]},  # Cap for display
                "strength": self._aggregate_strength(
                    [item["strength"] for item in case_items],
                    independent_engines=len({item["engine"] for item in case_items}),
                ),
            })

        # ── Finding 2: Narrative Matches ──
        rag_items = [e for e in successful if e["type"] == "narrative_matches"]
        if rag_items:
            for item in rag_items:
                findings.append({
                    "category": "Narrative Intelligence",
                    "description": item["signal"],
                    "evidence_sources": [item["engine"]],
                    "data": item["data"],
                    "strength": item["strength"],
                })

        # ── Finding 3: Pattern Clusters ──
        pattern_items = [e for e in successful if e["type"] == "patterns"]
        if pattern_items:
            all_patterns = []
            for item in pattern_items:
                all_patterns.extend(item["data"].get("patterns", []))
            findings.append({
                "category": "Crime Patterns Detected",
                "description": f"Identified {len(all_patterns)} emerging pattern clusters.",
                "evidence_sources": [item["engine"] for item in pattern_items],
                "data": {"patterns": all_patterns},
                "strength": self._aggregate_strength(
                    [item["strength"] for item in pattern_items],
                    independent_engines=len({item["engine"] for item in pattern_items}),
                ),
            })

        # ── Finding 4: Trend Analysis ──
        trend_items = [e for e in successful if e["type"] == "trend"]
        if trend_items:
            for item in trend_items:
                findings.append({
                    "category": "Temporal Trends",
                    "description": item["signal"],
                    "evidence_sources": [item["engine"]],
                    "data": item["data"],
                    "strength": item["strength"],
                })

        # ── Finding 5: Case Similarity ──
        similarity_items = [e for e in successful if e["type"] == "similar_cases"]
        if similarity_items:
            all_similar = []
            for item in similarity_items:
                target = item["data"].get("target_case_id")
                for match in item["data"].get("similar_cases", []):
                    all_similar.append({
                        "target_case_id": target,
                        **match,
                    })
            findings.append({
                "category": "Related Cases (Similarity Analysis)",
                "description": f"Found {len(all_similar)} cases related through narrative similarity, MO overlap, and spatio-temporal proximity.",
                "evidence_sources": [item["engine"] for item in similarity_items],
                "data": {"similar_cases": all_similar},
                "strength": self._aggregate_strength(
                    [item["strength"] for item in similarity_items],
                    independent_engines=len({item["engine"] for item in similarity_items}),
                ),
            })

        # ── Finding 6: Criminal Networks ──
        network_items = [e for e in successful if e["type"] == "network"]
        if network_items:
            for item in network_items:
                findings.append({
                    "category": "Criminal Network Analysis",
                    "description": item["signal"],
                    "evidence_sources": [item["engine"]],
                    "data": item["data"],
                    "strength": item["strength"],
                })

        # ── Finding 7: Risk Profiles ──
        risk_items = [e for e in successful if e["type"] == "risk_profiles"]
        if risk_items:
            for item in risk_items:
                findings.append({
                    "category": "Offender Risk Assessment",
                    "description": item["signal"],
                    "evidence_sources": [item["engine"]],
                    "data": item["data"],
                    "strength": item["strength"],
                })

        # ── Finding 8: Financial Intelligence ──
        financial_items = [e for e in successful if e["type"] == "financial_intelligence"]
        if financial_items:
            for item in financial_items:
                findings.append({
                    "category": "Financial Intelligence",
                    "description": item["signal"],
                    "evidence_sources": [item["engine"]],
                    "data": item["data"],
                    "strength": item["strength"],
                })

        # ── Error tracking ──
        if errors:
            findings.append({
                "category": "Engine Failures",
                "description": f"{len(errors)} engine(s) encountered errors during execution.",
                "evidence_sources": [e["engine"] for e in errors],
                "data": {"errors": [{"engine": e["engine"], "message": e["signal"]} for e in errors]},
                "strength": "none",
            })

        # ── Cross-correlation finding ──
        if len(successful) >= 2:
            evidence_engines = list(set(e["engine"] for e in successful))
            findings.insert(0, {
                "category": "Investigation Overview",
                "description": f"Multi-engine analysis completed using {len(evidence_engines)} intelligence engine(s): {', '.join(evidence_engines)}.",
                "evidence_sources": evidence_engines,
                "data": {
                    "engines_used": evidence_engines,
                    "total_evidence_items": len(successful),
                    "errors": len(errors) + len(scope_failures),
                },
                "strength": self._aggregate_strength(
                    [e["strength"] for e in successful],
                    independent_engines=len(evidence_engines),
                ),
            })

        summary_stats = {
            "total_findings": len(findings),
            "engines_executed": len(set(e["engine"] for e in evidence_items)),
            "engines_succeeded": len(set(e["engine"] for e in successful)),
            "engines_failed": len(set(e["engine"] for e in errors)),
            "overall_strength": self._aggregate_strength(
                [e["strength"] for e in successful],
                independent_engines=len(set(e["engine"] for e in successful)),
            ) if successful else "none",
        }

        return {
            "findings": findings,
            "summary_stats": summary_stats,
            "evidence_graph": evidence_items,
        }

    def _aggregate_strength(self, strengths: list, independent_engines: int = None) -> str:
        """Deterministic strength aggregation based on actual evidence quality.

        Cross-engine rule (several independent engines ran): a finding is only
        'strong' when multiple independent engines agree; a lone strong engine
        alone is not enough to claim a strong multi-engine conclusion.

        Single-engine rule (independent_engines <= 1, e.g. a plain case lookup):
        the engine's own strength stands — a case query that found 10 records
        reports STRONG, not 'none', because there is nothing to cross-check it
        against and the records are the ground truth.
        """
        if not strengths:
            return "none"
        if independent_engines is not None and independent_engines <= 1:
            order = {"strong": 3, "moderate": 2, "limited": 1, "none": 0}
            return max(strengths, key=lambda s: order.get(s, 0))

        strong_count = strengths.count("strong")
        moderate_count = strengths.count("moderate")
        limited_count = strengths.count("limited")

        # Strong: need at least 2 independent strong sources
        if strong_count >= 2:
            return "strong"
        # Moderate: at least 1 strong + some moderate, or 3+ moderate
        if strong_count >= 1 and moderate_count >= 1:
            return "moderate"
        if moderate_count >= 3:
            return "moderate"
        # Limited: any mix of moderate/limited
        if moderate_count >= 1:
            return "limited"
        if limited_count >= 1:
            return "limited"
        return "none"


# ════════════════════════════════════════════════════════════════
#  STEP 4: RESPONSE BUILDER
# ════════════════════════════════════════════════════════════════

class ResponseBuilder:
    """
    Synthesizes a natural-language investigation summary from
    structured evidence. The LLM summarizes real evidence —
    it does NOT generate evidence.

    The narrative is derived from a structured evidence inventory
    extracted from the same finding['data'] that populates the
    Evidence Graph, ensuring consistency.
    """

    def __init__(self):
        self.groq_client = Groq(api_key=os.getenv("GROQ_API_KEY")) if os.getenv("GROQ_API_KEY") else None

    def build_response(self, plan: dict, fused_result: dict) -> dict:
        """
        Builds the final investigation response combining structured
        evidence and NL summary.
        """
        findings = fused_result.get("findings", [])
        stats = fused_result.get("summary_stats", {})
        evidence_graph = fused_result.get("evidence_graph", [])

        # Extract structured evidence inventory from findings
        inventory = self._extract_evidence_inventory(findings)

        # ── Exact-case answers are deterministic, not LLM-synthesized ──
        # A question that named a specific FIR/case was answered verbatim from
        # the single database record (crime, status, station, registration date,
        # verification yes/no). Feeding those facts back through the LLM risks
        # dilution/loss, so the verified deterministic answer is used as-is.
        exact_answer = None
        exact_plan = plan.get("exact_case")
        if exact_plan and exact_plan.get("answer"):
            exact_answer = exact_plan["answer"]

        plan_intent = plan.get("intent", "")
        analysis_intents = {
            "case_similarity", "narrative_similarity", "financial_analysis",
            "criminal_network", "risk_analysis", "behaviour_analysis",
            "evidence_graph", "next_best_action", "forecasting",
            "pattern_detection", "trend_analysis",
        }

        if exact_answer and plan_intent not in analysis_intents:
            # Pure exact-case question: the verified deterministic answer is
            # used as-is — the LLM never re-derives these facts.
            summary_text = exact_answer
        else:
            # ── Context Required is deterministic, never LLM-synthesized ──
            # An entity-centric request (financial trail, network, risk) with
            # no resolvable entity must return the explicit context-required
            # message — and ZERO broad case queries already ran.
            context_findings = [f for f in findings if f.get("context_required")]
            if context_findings:
                detail = context_findings[0].get("description") or (
                    "No specific investigation, case, suspect, or account is currently "
                    "available to trace."
                )
                intent = plan.get("intent", "")
                label = DeterministicIntentClassifier().describe(intent)
                summary_text = (
                    f"{label}: Context Required\n\n"
                    f"Status: Context Required\n\n"
                    f"{detail}\n\n"
                    f"Please provide a FIR/case number or start an investigation first."
                )
            else:
                # Build NL summary from evidence (inventory-aware)
                summary_text = self._synthesize_summary(plan, findings, stats, inventory)
                # Analysis on top of an exact case ("find cases similar to FIR
                # X"): keep the deterministic reference line so the verified
                # record facts are never lost to synthesis.
                if exact_answer and plan_intent in analysis_intents:
                    reference_line = exact_answer.split("\n")[0]
                    summary_text = f"Reference case: {reference_line}\n\n{summary_text}"

        # Collect all citations
        citations = self._collect_citations(findings)

        # Build the graph payload (for frontend NetworkGraph)
        graph_payload = None
        for finding in findings:
            if finding["category"] == "Criminal Network Analysis" and finding.get("data", {}).get("nodes"):
                graph_payload = finding["data"]
                break

        # Build analytics payload (for trend charts)
        analytics_payload = None
        for finding in findings:
            if finding["category"] == "Temporal Trends" and finding.get("data", {}).get("trend_data"):
                analytics_payload = {"type": "trend", "data": finding["data"]["trend_data"]}
                break

        # Build combined evidence graph from all significant findings
        combined_evidence_graph = self._build_combined_evidence_graph(findings)

        # Normalize engine outputs into a structured internal evidence representation
        # (finding, source engine, supporting entities/IDs, strength, explanation).
        structured_evidence = self._build_structured_evidence(evidence_graph, plan)

        # Build the evidence-first FINDING / EVIDENCE / WHY IT MATTERS / STRENGTH card
        response_card = self._build_response_card(plan, findings, stats, inventory, structured_evidence)

        return {
            "status": "success",
            "intent_detected": "investigation",
            "answer": summary_text,
            "citations": citations,
            "graph_data": graph_payload,
            "analytics_data": analytics_payload,
            "investigation": {
                "plan": plan,
                "findings": findings,
                "summary_stats": stats,
                "evidence_graph": evidence_graph,
                "evidence_inventory": inventory,
                "structured_evidence": structured_evidence,
                "response_card": response_card,
                "combined_evidence_graph": combined_evidence_graph,
            },
            "reasoning_trace": {
                "execution_steps": [
                    {"step": 1, "action": "Investigation Planner",
                     "detail": f"Plan type: {plan.get('investigation_type')}. Intent: {plan.get('intent')}. Engines: {', '.join(plan.get('engines', []))}"},
                    {"step": 2, "action": "Scope Resolution",
                     "detail": self._scope_trace_detail(plan)},
                    {"step": 3, "action": "Engine Execution",
                     "detail": f"Executed {stats.get('engines_succeeded', 0)}/{stats.get('engines_executed', 0)} engines successfully"},
                    {"step": 4, "action": "Evidence Fusion",
                     "detail": f"Produced {stats.get('total_findings', 0)} findings. Overall strength: {stats.get('overall_strength', 'unknown')}"},
                ]
            }
        }

    def _scope_trace_detail(self, plan: dict) -> str:
        """Short human-readable line about how the investigation scope resolved."""
        scope = plan.get("resolved_scope") or {}
        parts = []
        crime = scope.get("crime") or {}
        district = scope.get("district") or {}
        tw = scope.get("time_window") or {}
        if crime.get("resolved_name"):
            parts.append(f"Crime: {crime['resolved_name']}")
        elif crime.get("requested"):
            parts.append(f"Crime: '{crime['requested']}' unresolved")
        if district.get("resolved_name"):
            parts.append(f"District: {district['resolved_name']}")
        elif district.get("requested"):
            parts.append(f"District: '{district['requested']}' unresolved")
        if tw.get("label"):
            parts.append(f"Period: {tw['label']}")
        if not parts:
            parts.append("No explicit scope requested")
        return " | ".join(parts)

    # ──────────────────────────────────────────────────────────
    #  STRUCTURED EVIDENCE — normalized, engine-grounded records
    #  Every record is derived from REAL engine output; the LLM
    #  never sees raw blobs, only these normalized facts.
    # ──────────────────────────────────────────────────────────

    def _build_structured_evidence(self, evidence_items: list, plan: dict) -> list:
        """
        Normalizes raw engine evidence items into compact, LLM-safe records:

            {
              "finding": str,
              "source_engine": str,
              "type": str,
              "supporting_count": int,
              "case_ids": [...], "accused_ids": [...], "transaction_ids": [...],
              "scope": {...},
              "evidence_strength": str,
              "explanation": str
            }
        """
        records = []
        scope = plan.get("resolved_scope") or {}
        for item in evidence_items:
            itype = item.get("type", "")
            if itype in ("error", "scope_error", "context_required", "zero_result"):
                continue
            engine = item.get("engine", "")
            data = item.get("data", {}) or {}
            case_ids, accused_ids, txn_ids = [], [], []
            supporting_count = 0

            if itype == "case_list":
                cases = data.get("cases", [])
                supporting_count = len(cases)
                for c in cases:
                    cid = c.get("casemasterid") or c.get("CaseMasterID") or c.get("case_id")
                    if cid:
                        case_ids.append(int(cid))
            elif itype == "patterns":
                patterns = data.get("patterns", [])
                supporting_count = sum(p.get("case_count", 0) or 0 for p in patterns)
                for p in patterns:
                    for c in p.get("cases", []):
                        if c.get("case_id"):
                            case_ids.append(int(c["case_id"]))
            elif itype == "similar_cases":
                matches = data.get("similar_cases", [])
                supporting_count = len(matches)
                for m in matches:
                    if m.get("case_id"):
                        case_ids.append(int(m["case_id"]))
            elif itype == "network":
                stats = data.get("stats") or {}
                supporting_count = stats.get("node_count", 0) or len(data.get("nodes", []))
                for n in data.get("nodes", []):
                    if n.get("accused_id"):
                        accused_ids.append(int(n["accused_id"]))
            elif itype == "risk_profiles":
                profiles = data.get("profiles", [])
                supporting_count = len(profiles)
                for p in profiles:
                    if p.get("accused_id"):
                        accused_ids.append(int(p["accused_id"]))
            elif itype == "financial_intelligence":
                summary = data.get("summary") or {}
                supporting_count = summary.get("total_transactions", 0) or 0
                for t in data.get("transactions", []):
                    if t.get("txn_id"):
                        txn_ids.append(int(t["txn_id"]))
            elif itype == "narrative_matches":
                supporting_count = len(data.get("citations", []))
            elif itype == "trend":
                supporting_count = len(data.get("trend_data", []))

            records.append({
                "finding": item.get("signal", ""),
                "source_engine": engine,
                "type": itype,
                "supporting_entities": supporting_count,
                "supporting_count": supporting_count,
                "case_ids": sorted(set(case_ids))[:25],
                "accused_ids": sorted(set(accused_ids))[:25],
                "transaction_ids": sorted(set(txn_ids))[:25],
                "scope": {
                    "crime": (scope.get("crime") or {}).get("resolved_name")
                             or (scope.get("crime") or {}).get("requested"),
                    "district": (scope.get("district") or {}).get("resolved_name")
                                 or (scope.get("district") or {}).get("requested"),
                    "time_window": (scope.get("time_window") or {}).get("label")
                                    or (scope.get("time_window") or {}).get("requested"),
                },
                "evidence_strength": item.get("strength", "none"),
                "explanation": item.get("signal", ""),
            })
        return records

    # ──────────────────────────────────────────────────────────
    #  RESPONSE CARD — evidence-first FINDING presentation
    #  Deterministic; the LLM is never asked to produce these facts.
    # ──────────────────────────────────────────────────────────

    def _build_response_card(self, plan: dict, findings: list, stats: dict,
                             inventory: dict, structured_evidence: list) -> dict:
        """
        Builds the structured FINDING / EVIDENCE / WHY IT MATTERS /
        EVIDENCE STRENGTH / NEXT BEST ACTION card shown at the top of an
        investigation response. All text is derived from real engine output.
        """
        strength = stats.get("overall_strength", "none") or "none"
        scope = plan.get("resolved_scope") or {}
        scope_failed = scope.get("status") in ("failed", "partial")
        exact_case = scope.get("exact_case")

        # ── Exact case entity — ONE record, verified facts ──
        if exact_case is not None:
            identifier = exact_case.get("identifier") or exact_case.get("crime_no") or ""
            if not exact_case.get("record_found"):
                return {
                    "finding": f"I couldn't find FIR/Case {identifier} in the authorized records.",
                    "evidence": [],
                    "why_it_matters": "No exact record matched the identifier within the authorized scope; no broader search was run.",
                    "evidence_strength": "none",
                    "has_sufficient_evidence": False,
                    "uncertainty_note": "The requested FIR/Case identifier does not exist in the authorized records, so no records were returned and no broader scope was searched.",
                    "scope_status": "failed",
                    "primary_engines": ["exact_case_lookup"],
                }
            evidence = []
            if exact_case.get("crime"):
                evidence.append(f"Crime: {exact_case['crime']}")
            if exact_case.get("location"):
                evidence.append(f"Location: {exact_case['location']}")
            if exact_case.get("station"):
                evidence.append(f"Station: {exact_case['station']}")
            if exact_case.get("registered"):
                evidence.append(f"Registered: {exact_case['registered']}")
            if exact_case.get("status"):
                evidence.append(f"Status: {exact_case['status']}")
            if exact_case.get("case_master_id"):
                evidence.append(f"Case ID: {exact_case['case_master_id']}")
            return {
                "finding": f"FIR {identifier} is a {exact_case.get('crime') or 'case'} case.",
                "evidence": evidence,
                "why_it_matters": "The requested FIR was directly resolved to one authorized case record.",
                "evidence_strength": "strong",
                "has_sufficient_evidence": True,
                "uncertainty_note": None,
                "scope_status": "verified",
                "primary_engines": ["exact_case_lookup"],
            }

        # Find the strongest substantive finding (skip overview/errors/scope)
        substantive = [f for f in findings if f["category"] not in (
            "Investigation Overview", "Engine Failures", "Investigation Scope",
            "Context Required", "No Matching Evidence")]
        context_required_findings = [f for f in findings if f.get("context_required")]
        zero_result_findings = [f for f in findings if f.get("zero_result")]
        primary = None
        for f in substantive:
            if f.get("strength") in ("strong", "moderate"):
                primary = f
                break
        if primary is None and substantive:
            primary = substantive[0]

        # ── FINDING headline ──
        finding_text = ""
        if scope_failed:
            finding_text = "The requested investigation scope could not be resolved."
        elif context_required_findings:
            finding_text = "Context Required — no investigation entity is available."
        elif zero_result_findings and not primary:
            finding_text = zero_result_findings[0].get("description") or "No matching evidence was found in the requested scope."
        elif primary:
            data = primary.get("data", {}) or {}
            cat = primary.get("category", "")
            if cat == "Crime Patterns Detected":
                patterns = data.get("patterns", [])
                n = len(patterns)
                theme = patterns[0].get("theme") if patterns else ""
                support = sum(p.get("case_count", 0) or 0 for p in patterns)
                finding_text = f"{n} crime pattern cluster{'s' if n != 1 else ''} detected"
                if theme:
                    finding_text += f": {theme}"
                if support:
                    finding_text += f" ({support} supporting case{'s' if support != 1 else ''})"
                finding_text += "."
            elif cat == "Cases Identified":
                n = len(data.get("cases", []))
                finding_text = f"{n} relevant FIR record{'s' if n != 1 else ''} found matching the investigation criteria."
            elif cat == "Financial Intelligence":
                summary = data.get("summary") or {}
                tx = summary.get("total_transactions", 0)
                xl = summary.get("cross_case_links", 0)
                if xl:
                    finding_text = f"{xl} cross-case financial link{'s' if xl != 1 else ''} identified across {tx} transactions."
                else:
                    finding_text = f"{tx} financial transaction{'s' if tx != 1 else ''} found for the investigation entities."
            elif cat == "Criminal Network Analysis":
                d = data.get("stats") or {}
                nodes = d.get("node_count", 0)
                edges = d.get("edge_count", 0)
                finding_text = f"Mapped a criminal network of {nodes} connected entities and {edges} relationships."
            elif cat == "Offender Risk Assessment":
                profiles = data.get("profiles", [])
                high = [p for p in profiles if p.get("score", 0) >= 70]
                if high:
                    finding_text = f"{len(high)} offender{'s' if len(high) != 1 else ''} in scope show{'s' if len(high) == 1 else ''} high-risk indicators (score >= 70)."
                else:
                    finding_text = f"{len(profiles)} offender profile{'s' if len(profiles) != 1 else ''} assessed; no high-risk scores."
            elif cat == "Related Cases (Similarity Analysis)":
                n = len(data.get("similar_cases", []))
                reference = data.get("reference_case_id")
                ref_text = f" to FIR {reference}" if reference else ""
                finding_text = f"{n} related case{'s' if n != 1 else ''} found through similarity analysis{ref_text}."
            elif cat == "Narrative Intelligence":
                basis = data.get("similarity_basis")
                basis_text = f" (basis: {basis})" if basis else ""
                finding_text = f"{len(data.get('citations', []))} narratively similar FIR{'s' if len(data.get('citations', [])) != 1 else ''} identified{basis_text}."
            else:
                finding_text = primary.get("description", "")
        else:
            finding_text = "No evidence was found for the requested investigation."

        # ── EVIDENCE bullets ──
        evidence_bullets = []
        if context_required_findings:
            detail = context_required_findings[0].get("description") or ""
            if detail:
                evidence_bullets.append(detail + ".")
            evidence_bullets.append("No broad case query was executed.")
        elif zero_result_findings and not primary:
            for zf in zero_result_findings[:2]:
                evidence_bullets.append(zf.get("description") or "")
        else:
            if inventory.get("has_case_evidence"):
                cn = " ".join(inventory.get("crime_nos", [])[:2])
                bullet = f"{inventory.get('total_cases', 0)} relevant case record{'s' if inventory.get('total_cases', 0) != 1 else ''}"
                if cn:
                    bullet += f" — FIR {cn}"
                if inventory.get("districts"):
                    bullet += f" · {', '.join(inventory['districts'][:2])}"
                evidence_bullets.append(bullet + ".")
            if inventory.get("has_pattern_evidence"):
                mos = ", ".join(f"'{m}'" for m in inventory.get("mo_tags", [])[:3])
                bullet = f"{inventory.get('total_patterns', 0)} pattern cluster{'s' if inventory.get('total_patterns', 0) != 1 else ''}"
                if mos:
                    bullet += f" sharing MO {mos}"
                # Supporting FIRs + location + time range from the real patterns
                for f in findings:
                    if f["category"] == "Crime Patterns Detected":
                        for p in f.get("data", {}).get("patterns", [])[:2]:
                            pcases = p.get("cases", [])
                            pn = p.get("case_count", 0) or len(pcases)
                            fir_sample = ", ".join(str(c.get("crime_no")) for c in pcases[:3] if c.get("crime_no"))
                            locs = ", ".join(sorted({str(c.get("district")) for c in pcases if c.get("district")})[:2])
                            extra = f" — {pn} supporting case{'s' if pn != 1 else ''}"
                            if fir_sample:
                                extra += f" (FIR {fir_sample})"
                            if locs:
                                extra += f" · {locs}"
                            if p.get("date_range"):
                                extra += f" · {p['date_range']}"
                            evidence_bullets.append((p.get("theme") or "Pattern") + extra + ".")
                        break
                evidence_bullets.append(bullet + ".")
            if inventory.get("has_accused_evidence"):
                aids = ", ".join(str(a) for a in inventory.get("accused_ids", [])[:5])
                evidence_bullets.append(f"{len(inventory.get('accused_ids', []))} accused identified (IDs: {aids}).")
            if inventory.get("has_financial_evidence"):
                bullet = f"{inventory.get('total_financial_transactions', 0)} transactions"
                if inventory.get("total_cross_case_links", 0):
                    bullet += f" · {inventory['total_cross_case_links']} cross-case link{'s' if inventory['total_cross_case_links'] != 1 else ''}"
                evidence_bullets.append(bullet + ".")
            if inventory.get("has_rag_evidence"):
                basis = ""
                for f in findings:
                    if f["category"] == "Narrative Intelligence" and f.get("data", {}).get("similarity_basis"):
                        basis = f" (basis: {f['data']['similarity_basis']})"
                        break
                evidence_bullets.append(f"{len(inventory.get('rag_citations', []))} narratively similar FIRs{basis}.")
            if primary and primary.get("evidence_sources"):
                engines_label = " + ".join(sorted(set(primary.get("evidence_sources", []))))
                evidence_bullets.append(f"Source: {engines_label}.")

        # ── WHY IT MATTERS ──
        why = ""
        if context_required_findings:
            why = ("An entity-centric request (financial trail, network, risk, similarity) "
                   "requires a specific case, suspect, account, or prior investigation. "
                   "Without one, no analysis can be grounded — the system does not guess.")
        elif scope_failed:
            why = ("The analysis was stopped because an explicitly requested scope "
                   "could not be matched to the database. Re-run with a valid crime "
                   "category or district name — the scope will never be silently broadened.")
        elif zero_result_findings and not primary:
            why = "The engines ran within the requested scope and found no matching pattern/evidence; results are reported as-is without substitution."
        elif inventory.get("has_case_evidence") and inventory.get("has_pattern_evidence"):
            why = "The same modus operandi appears repeatedly within the requested investigation scope; these connected cases may warrant coordinated review."
        elif inventory.get("has_financial_evidence") and inventory.get("total_cross_case_links", 0) > 0:
            why = "Cross-case financial links indicate possible coordinated activity between otherwise separate cases."
        elif inventory.get("has_accused_evidence") and inventory.get("has_case_evidence"):
            why = "The same individuals appear across multiple records in scope; their joint involvement is worth examining."
        elif inventory.get("has_case_evidence"):
            why = "These records match the requested criteria; reviewing them together may reveal connections not visible in any single file."
        elif inventory.get("has_pattern_evidence"):
            why = "Repeated MO activity within the scope may indicate an ongoing pattern rather than isolated incidents."
        else:
            why = "No evidence currently supports a conclusion; findings are reported as investigative leads only."

        # ── Sufficiency / uncertainty ──
        has_any = any([
            inventory.get("has_case_evidence"), inventory.get("has_pattern_evidence"),
            inventory.get("has_accused_evidence"), inventory.get("has_financial_evidence"),
            inventory.get("has_rag_evidence"),
        ])
        has_sufficient = has_any and not scope_failed and not context_required_findings
        uncertainty_note = None
        if context_required_findings:
            uncertainty_note = ("No investigation context is available. Provide a FIR/case number "
                                "or refer to a specific investigation to continue.")
        elif scope_failed:
            uncertainty_note = "Investigation scope could not be resolved. No engines were run on a broadened scope."
        elif zero_result_findings and not has_any:
            uncertainty_note = ("The engines completed but found no matching records for the requested "
                                "scope; no pattern or evidence is claimed and no broader search was run.")
        elif not has_any:
            uncertainty_note = ("Insufficient evidence to establish that conclusion. "
                                "The engines returned no matching records for the requested scope; "
                                "results are reported as-is without speculation.")
        elif strength == "limited":
            uncertainty_note = ("Limited evidence: the records found support an investigative lead, "
                                "but not yet a firm conclusion.")

        # ── Engines actually used ──
        primary_engines = scope.get("engines") or sorted(set(plan.get("engines", [])))

        return {
            "finding": finding_text,
            "evidence": evidence_bullets,
            "why_it_matters": why,
            "evidence_strength": strength,
            "has_sufficient_evidence": has_sufficient,
            "uncertainty_note": uncertainty_note,
            "scope_status": scope.get("status", "not_specified"),
            "primary_engines": primary_engines,
        }

    # ──────────────────────────────────────────────────────────
    #  EVIDENCE INVENTORY — extracts real entity identifiers
    #  from finding['data'], the same source the EvidenceGraph uses
    # ──────────────────────────────────────────────────────────

    def _extract_evidence_inventory(self, findings: list) -> dict:
        """
        Scans all findings and extracts a structured inventory of
        what evidence actually exists. This is used to:
        1. Generate an accurate LLM narrative
        2. Provide the frontend with entity-level summary stats

        The inventory is derived from finding['data'] — the exact
        same data that EvidenceGraphBuilder.build_from_finding() uses
        to create graph nodes, ensuring consistency.
        """
        crime_nos = set()
        case_ids = set()
        pattern_names = []
        mo_tags = set()
        accused_ids = set()
        risk_profiles = []
        financial_transactions = 0
        cross_case_links = 0
        rag_citations = []
        total_cases = 0
        total_patterns = 0
        districts = set()

        for finding in findings:
            category = finding.get("category", "")
            data = finding.get("data", {})

            if category in ("Investigation Overview", "Engine Failures"):
                continue

            # ── Case-level evidence ──
            cases = data.get("cases", [])
            if cases:
                total_cases += len(cases)
                for case in cases:
                    cn = case.get("crimeno") or case.get("CrimeNo") or case.get("crime_no")
                    if cn:
                        crime_nos.add(str(cn))
                    cid = case.get("casemasterid") or case.get("CaseMasterID")
                    if cid:
                        case_ids.add(int(cid))
                    dist = case.get("districtname") or case.get("district")
                    if dist:
                        districts.add(str(dist))

            # ── Pattern-level evidence ──
            patterns = data.get("patterns", [])
            if patterns:
                total_patterns += len(patterns)
                for pattern in patterns:
                    theme = pattern.get("theme")
                    if theme:
                        pattern_names.append(theme)
                    for mo in pattern.get("mo_tags", []):
                        mo_name = mo.get("name") if isinstance(mo, dict) else str(mo)
                        if mo_name:
                            mo_tags.add(mo_name)
                    # Cases within patterns
                    for pcase in pattern.get("cases", []):
                        pcn = pcase.get("crime_no")
                        if pcn:
                            crime_nos.add(str(pcn))
                        pcid = pcase.get("case_id")
                        if pcid:
                            case_ids.add(int(pcid))
                        pdist = pcase.get("district")
                        if pdist:
                            districts.add(str(pdist))

            # ── Accused/person-level evidence ──
            profiles = data.get("profiles", [])
            if profiles:
                for p in profiles:
                    aid = p.get("accused_id")
                    if aid:
                        accused_ids.add(int(aid))
                    risk_profiles.append(p)

            # From network data
            nodes = data.get("nodes", [])
            for node in nodes:
                ntype = node.get("type", "")
                if ntype == "accused":
                    nid = node.get("id", "")
                    # Extract numeric ID from "A3682" style IDs
                    nid_match = re.search(r'\d+', str(nid))
                    if nid_match:
                        accused_ids.add(int(nid_match.group()))

            # ── Similar cases ──
            similar = data.get("similar_cases", [])
            for match in similar:
                scn = match.get("crime_no")
                if scn:
                    crime_nos.add(str(scn))

            # ── RAG citations ──
            cites = data.get("citations", [])
            for c in cites:
                if c:
                    rag_citations.append(str(c))

            # ── Financial evidence ──
            summary = data.get("summary", {})
            if isinstance(summary, dict):
                financial_transactions += summary.get("total_transactions", 0)
                cross_case_links += summary.get("cross_case_links", 0)

        return {
            "crime_nos": sorted(list(crime_nos))[:10],
            "case_ids": sorted(list(case_ids))[:10],
            "pattern_names": pattern_names[:10],
            "mo_tags": sorted(list(mo_tags))[:10],
            "accused_ids": sorted(list(accused_ids))[:10],
            "districts": sorted(list(districts)),
            "rag_citations": rag_citations[:5],
            "risk_profiles": risk_profiles[:5],
            "has_case_evidence": len(crime_nos) > 0 or len(case_ids) > 0 or total_cases > 0,
            "has_pattern_evidence": total_patterns > 0,
            "has_accused_evidence": len(accused_ids) > 0,
            "has_financial_evidence": financial_transactions > 0,
            "has_rag_evidence": len(rag_citations) > 0,
            "total_cases": total_cases,
            "total_patterns": total_patterns,
            "total_financial_transactions": financial_transactions,
            "total_cross_case_links": cross_case_links,
        }

    # ──────────────────────────────────────────────────────────
    #  COMBINED EVIDENCE GRAPH — merges graphs from all findings
    # ──────────────────────────────────────────────────────────

    def _build_combined_evidence_graph(self, findings: list) -> dict:
        """
        Builds a single merged evidence graph from all significant findings.
        Uses EvidenceGraphBuilder per-finding and deduplicates nodes.
        Returns {"nodes": [...], "edges": [...]} or None if no graph data.
        """
        try:
            from engines.evidence_graph import EvidenceGraphBuilder
            builder = EvidenceGraphBuilder()
        except ImportError:
            return None

        combined_nodes = []
        combined_edges = []
        seen_node_ids = set()
        seen_edge_ids = set()

        # Build graph from significant findings (skip overview/errors)
        graph_worthy_categories = [
            "Crime Patterns Detected",
            "Cases Identified",
            "Criminal Network Analysis",
            "Related Cases (Similarity Analysis)",
            "Offender Risk Assessment",
            "Financial Intelligence",
        ]

        for finding in findings:
            if finding.get("category") not in graph_worthy_categories:
                continue
            try:
                result = builder.build_from_finding(finding)
                for node in result.get("nodes", []):
                    if node["id"] not in seen_node_ids:
                        seen_node_ids.add(node["id"])
                        combined_nodes.append(node)
                for edge in result.get("edges", []):
                    if edge["id"] not in seen_edge_ids:
                        seen_edge_ids.add(edge["id"])
                        combined_edges.append(edge)
            except Exception:
                continue  # Skip individual finding graph failures

        if combined_nodes:
            return {
                "nodes": combined_nodes,
                "edges": combined_edges,
            }
        return None

    # ──────────────────────────────────────────────────────────
    #  NARRATIVE SYNTHESIS — evidence-inventory-aware
    # ──────────────────────────────────────────────────────────

    def _synthesize_summary(self, plan: dict, findings: list, stats: dict, inventory: dict) -> str:
        """
        Generate NL summary using the structured evidence inventory.
        The inventory contains real entity identifiers extracted from
        the same finding['data'] that the Evidence Graph uses.
        """
        if not self.groq_client:
            return self._fallback_summary(plan, findings, stats, inventory)

        # Build detailed evidence description including actual identifiers
        evidence_sections = []
        zero_result_sections = []
        for f in findings:
            if f["category"] in ("Investigation Overview", "Engine Failures", "Context Required"):
                continue
            if f.get("zero_result"):
                zero_result_sections.append(f"- {f['description']}")
                continue
            evidence_sections.append(f"- {f['category']}: {f['description']} (strength: {f['strength']})")

        evidence_text = "\n".join(evidence_sections) if evidence_sections else "No evidence found."
        zero_text = "\n".join(zero_result_sections) if zero_result_sections else ""

        # Build entity-level detail from inventory
        entity_details = []
        if inventory["has_case_evidence"]:
            cn_sample = ", ".join(inventory["crime_nos"][:5])
            if inventory["total_cases"] > 0:
                case_msg = f"CASE-LEVEL EVIDENCE EXISTS: {inventory['total_cases']} case records found."
            else:
                case_msg = "CASE-LEVEL EVIDENCE EXISTS: supporting FIRs identified through pattern/similarity results."
            entity_details.append(
                case_msg
                + (f" Sample CrimeNo values: {cn_sample}." if cn_sample else "")
                + (f" Districts: {', '.join(inventory['districts'][:3])}." if inventory["districts"] else "")
            )
        else:
            entity_details.append("CASE-LEVEL EVIDENCE: No specific case records were returned by the engines.")

        if inventory["has_pattern_evidence"]:
            pn = ", ".join(f"'{p}'" for p in inventory["pattern_names"][:3])
            mo = ", ".join(f"'{m}'" for m in inventory["mo_tags"][:4])
            entity_details.append(
                f"PATTERN-LEVEL EVIDENCE EXISTS: {inventory['total_patterns']} pattern cluster(s) detected."
                + (f" Patterns: {pn}." if pn else "")
                + (f" MO tags: {mo}." if mo else "")
            )
        else:
            entity_details.append("PATTERN-LEVEL EVIDENCE: No crime patterns were detected.")

        if inventory["has_accused_evidence"]:
            aids = ", ".join(str(a) for a in inventory["accused_ids"][:5])
            entity_details.append(f"ACCUSED-LEVEL EVIDENCE EXISTS: Accused IDs found: {aids}.")
            high_risk = [p for p in inventory["risk_profiles"] if p.get("score", 0) >= 70]
            if high_risk:
                entity_details.append(f"  High-risk offenders: {len(high_risk)} (score >= 70).")
        else:
            entity_details.append("ACCUSED-LEVEL EVIDENCE: No specific accused individuals were identified in the returned data.")

        if inventory["has_financial_evidence"]:
            entity_details.append(
                f"FINANCIAL EVIDENCE EXISTS: {inventory['total_financial_transactions']} transactions, "
                f"{inventory['total_cross_case_links']} cross-case links."
            )

        entity_text = "\n".join(entity_details)

        prompt = f"""You are a law enforcement intelligence analyst generating a brief investigation summary.

The investigator asked: "{plan.get('summary', 'Investigation request')}"

EVIDENCE FROM INTELLIGENCE ENGINES:
{evidence_text}

ENTITY-LEVEL EVIDENCE INVENTORY:
{entity_text}

{f'''ZERO-RESULT FINDINGS (engines ran but found NOTHING in the requested scope):
{zero_text}
''' if zero_text else ""}
Write a concise investigation summary (3-5 sentences maximum). STRICT RULES:
1. State what was investigated.
2. If CASE-LEVEL EVIDENCE EXISTS, acknowledge it and cite specific CrimeNo values from the inventory.
3. If PATTERN-LEVEL EVIDENCE EXISTS, name the actual patterns and MO tags found.
4. If ACCUSED-LEVEL EVIDENCE does NOT exist, say that accused-level attribution is not established — but do NOT claim that case or pattern evidence is also missing.
5. NEVER claim "no specific CrimeNo values" if the inventory shows case evidence exists.
6. NEVER claim a confirmed repeat offender unless ACCUSED-LEVEL EVIDENCE actually supports it.
7. Do NOT invent any facts. Only reference what is listed above.
8. Be direct and professional. No preamble like "Based on the analysis..."
9. If NONE of case/pattern/accused/financial/RAG evidence exists, the ONLY conclusion allowed is: "Insufficient evidence to establish that conclusion." — briefly state what was searched and why no conclusion can be drawn. NEVER speculate, infer guilt, or invent records.
10. Never claim a person is a mastermind, ringleader, or guilty — only describe what the records show.
11. If the requested scope could not be resolved (scope warnings exist), say the investigation was stopped because the scope could not be resolved, and that no records were analyzed outside the requested scope.
12. If ZERO-RESULT FINDINGS exist, state plainly that no pattern/trend was detected in the requested scope and repeat the cases-examined / time-period / location detail — NEVER claim a pattern exists, NEVER return a fake visualization, and NEVER substitute an unrelated case list.

Investigation Summary:
"""

        try:
            response = self.groq_client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="openai/gpt-oss-120b",
                temperature=0.0,
                seed=42
            )
            return response.choices[0].message.content.strip()
        except Exception:
            return self._fallback_summary(plan, findings, stats, inventory)

    def _fallback_summary(self, plan: dict, findings: list, stats: dict, inventory: dict = None) -> str:
        """
        Deterministic fallback when LLM is unavailable.
        Uses the evidence inventory to generate an accurate summary.
        """
        if inventory is None:
            inventory = self._extract_evidence_inventory(findings)

        engines = plan.get("engines", [])
        success = stats.get("engines_succeeded", 0)
        total = stats.get("engines_executed", 0)

        parts = [
            f"Investigation completed using {success}/{total} intelligence engines ({', '.join(engines)})."
        ]

        # Case-level evidence
        if inventory["has_case_evidence"]:
            cn_sample = ", ".join(inventory["crime_nos"][:3])
            if inventory["total_cases"] > 0:
                msg = f"Identified {inventory['total_cases']} relevant case records"
                if cn_sample:
                    msg += f" (including CrimeNo {cn_sample})"
                msg += "."
            else:
                msg = "Supporting FIRs identified: " + (cn_sample or "none") + "."
            parts.append(msg)

        # Pattern-level evidence
        if inventory["has_pattern_evidence"]:
            pn = ", ".join(f"'{p}'" for p in inventory["pattern_names"][:2])
            msg = f"Detected {inventory['total_patterns']} crime pattern cluster(s)"
            if pn:
                msg += f": {pn}"
            if inventory["mo_tags"]:
                msg += f" with MO tags including '{list(inventory['mo_tags'])[0]}'"
            msg += "."
            parts.append(msg)

        # Accused-level evidence
        if inventory["has_accused_evidence"]:
            aids = ", ".join(str(a) for a in inventory["accused_ids"][:3])
            parts.append(f"Accused-level evidence identified for IDs: {aids}.")
        else:
            if inventory["has_case_evidence"] or inventory["has_pattern_evidence"]:
                parts.append("No accused-level identifiers were found; patterns should be treated as investigative leads.")

        # Financial evidence
        if inventory["has_financial_evidence"]:
            parts.append(
                f"Financial analysis found {inventory['total_financial_transactions']} transactions"
                f" and {inventory['total_cross_case_links']} cross-case links."
            )

        # Zero-result engines: state plainly that nothing was found in scope
        # (no pattern, no trend data) — never a substituted case list.
        zero_findings = [f for f in findings if f.get("zero_result")]
        for zf in zero_findings:
            parts.append(zf.get("description") or "No matching evidence was found in the requested scope.")

        # Scope failures must be stated explicitly — never pretend a broadened
        # analysis succeeded.
        scope = (plan.get("resolved_scope") or {})
        if scope.get("status") in ("failed", "partial"):
            parts.append(
                "The requested investigation scope could not be fully resolved "
                "(explicitly specified crime category/district was not matched in the database); "
                "the analysis was stopped rather than broadened."
            )
        elif not any([
            inventory["has_case_evidence"], inventory["has_pattern_evidence"],
            inventory["has_accused_evidence"], inventory["has_financial_evidence"],
            inventory["has_rag_evidence"],
        ]):
            parts.append(
                "Insufficient evidence to establish that conclusion — no matching records were "
                "returned for the requested scope, and no inference is made."
            )

        return " ".join(parts)

    def _collect_citations(self, findings: list) -> list:
        """Extract all CrimeNo citations from findings."""
        citations = set()

        for finding in findings:
            data = finding.get("data", {})
            # From case lists
            for case in data.get("cases", []):
                cn = case.get("crimeno") or case.get("CrimeNo") or case.get("crime_no")
                if cn:
                    citations.add(str(cn))
            # From similar cases
            for match in data.get("similar_cases", []):
                cn = match.get("crime_no")
                if cn:
                    citations.add(str(cn))
            # From RAG
            for cn in data.get("citations", []):
                if cn:
                    citations.add(str(cn))
            # From patterns
            for pattern in data.get("patterns", []):
                for case in pattern.get("cases", []):
                    cn = case.get("crime_no")
                    if cn:
                        citations.add(str(cn))

        return list(citations)[:30]  # Cap at 30



# ════════════════════════════════════════════════════════════════
#  MAIN ENTRY POINT
# ════════════════════════════════════════════════════════════════

class InvestigationEngine:
    """
    Top-level orchestrator for the Investigation Planner pipeline.
    Coordinates: Plan → Execute → Fuse → Build Response.
    """

    def __init__(self):
        self.planner = InvestigationPlanner()
        self.orchestrator = InvestigationOrchestrator()
        self.fusion = EvidenceFusion()
        self.builder = ResponseBuilder()

    def run_investigation(self, request_text: str, rbac_filter: str,
                          conversation_history: list = None,
                          investigation_context: dict = None,
                          nl2sql_engine=None, rag_engine=None,
                          graph_engine=None, network_engine=None,
                          pattern_engine=None, analytics_engine=None,
                          case_explorer_engine=None) -> dict:
        """
        Full investigation pipeline.

        Args:
            request_text: The investigator's natural language request
            rbac_filter: SQL WHERE clause for row-level security
            conversation_history: Previous conversation turns for context
            investigation_context: Structured state from the previous investigation
                turn (resolved scope, discovered cases/accused) used to resolve
                follow-up references without broadening scope.
            *engines: Existing engine instances

        Returns:
            Complete investigation response dict
        """
        # Step 1: Generate investigation plan
        plan = self.planner.create_plan(
            request_text, conversation_history, investigation_context
        )

        # ── Entity-first exact case override (code-enforced) ──
        # When the request names a specific FIR/case identifier, the plan must
        # resolve THAT record.  Words like "vehicle theft" in such questions are
        # verification, not filters — so any filter the planner extracted from
        # them is discarded here, before engines run.
        #
        # The FULL try_handle result is used (not just detect_and_lookup) so the
        # deterministic, record-verified answer text (crime, status, station,
        # registration date, verification yes/no) is carried into the response.
        # The LLM synthesizer never re-derives these facts.
        try:
            exact_result = ExactCaseResolver().try_handle(request_text, rbac_filter=rbac_filter)
        except Exception:
            exact_result = {}
        if exact_result.get("handled") and exact_result.get("case_identifier"):
            record = (exact_result.get("cases") or [None])[0] if exact_result.get("total_count", 0) > 0 else None
            exact_case = {
                "found": bool(record),
                "identifier": exact_result.get("case_identifier"),
                "case_id_hint": exact_result.get("case_id_hint"),
                "record": record,
                "case_master_id": (record or {}).get("casemasterid") if record else None,
                "crime_no": (record or {}).get("crimeno") if record else None,
                "crime_sub_head": (record or {}).get("crime_sub_head") if record else None,
                "crime_head": (record or {}).get("crime_head") if record else None,
                "district": (record or {}).get("districtname") if record else None,
                "station": (record or {}).get("police_station") if record else None,
                "registered": str((record or {}).get("crimeregistereddate") or "")[:10] or None if record else None,
                "status": (record or {}).get("casestatusname") if record else None,
                "accused_ids": [a.get("accused_id") for a in (exact_result.get("accused") or []) if a.get("accused_id")],
                # Deterministic, record-grounded answer — reused verbatim by the
                # ResponseBuilder so LLM synthesis cannot dilute verified facts.
                "answer": exact_result.get("answer"),
                "intent": exact_result.get("intent"),
            }
            plan["exact_case"] = exact_case
            # Never inherit/broaden scope for an exact-entity question
            plan["filters"] = {}
            plan["scope"] = {"crime_category": None, "district": None, "time_window": None}

            # Pure factual questions about the identifier ("what is FIR X?",
            # "is FIR X a vehicle theft case?") are exact_case_lookup. Analysis
            # intents on top of the entity ("find cases similar to FIR X",
            # "financial links of case X") keep their analysis intent — the
            # exact record is the entity they analyze, not the answer itself.
            analysis_intents = {
                "case_similarity", "narrative_similarity", "financial_analysis",
                "criminal_network", "risk_analysis", "behaviour_analysis",
                "evidence_graph", "next_best_action", "forecasting",
                "pattern_detection", "trend_analysis",
            }
            if plan.get("intent") not in analysis_intents:
                plan["intent"] = "exact_case_lookup"
                plan["engines"] = ["exact_case_lookup"]
                plan.setdefault("routing", {})
                plan["routing"]["intent_label"] = "Exact case/FIR lookup"
            elif exact_case.get("found"):
                plan["engines"] = list(dict.fromkeys(
                    (plan.get("engines") or ["case_query"]) + ["case_query"]
                ))
            if exact_case.get("found"):
                plan.setdefault("entities", {"case_ids": [], "accused_ids": []})
                plan["entities"]["case_ids"] = [exact_case["case_master_id"]]
            else:
                # Invalid identifier: no engines run on a broadened scope
                plan["engines"] = ["case_query"]
                plan["entities"] = {"case_ids": [], "accused_ids": []}

        # Step 2: Execute engines according to plan
        evidence_items = self.orchestrator.execute_plan(
            plan=plan,
            rbac_filter=rbac_filter,
            nl2sql_engine=nl2sql_engine,
            rag_engine=rag_engine,
            graph_engine=graph_engine,
            network_engine=network_engine,
            pattern_engine=pattern_engine,
            analytics_engine=analytics_engine,
            case_explorer_engine=case_explorer_engine,
        )

        # Step 3: Fuse evidence
        fused_result = self.fusion.fuse(evidence_items, plan.get("investigation_type", ""))

        # Step 4: Build response
        response = self.builder.build_response(plan, fused_result)

        # Step 5: Structured routing decision log (requirement: every routing
        # decision visible for debugging: query → intent → entities → scope →
        # engines → result counts → final response type).
        response["routing_log"] = self._build_routing_log(
            request_text, plan, evidence_items, fused_result, response
        )
        # Surface the actual intent (not a generic "investigation" label)
        response["intent_detected"] = plan.get("intent", "investigation")
        if plan.get("routing"):
            response["routing"] = plan["routing"]

        return response

    def _build_routing_log(self, query: str, plan: dict, evidence_items: list,
                           fused_result: dict, response: dict) -> dict:
        """
        Structured server-side routing decision for debugging:

            USER QUERY → DETECTED INTENT → RESOLVED ENTITIES → RESOLVED SCOPE
            → SELECTED ENGINES → ENGINE INPUT SCOPE → RESULT COUNTS
            → FINAL RESPONSE TYPE
        """
        resolved_scope = plan.get("resolved_scope") or {}
        result_counts = {}
        for item in evidence_items:
            engine = item.get("engine", "")
            itype = item.get("type", "")
            data = item.get("data", {}) or {}
            if itype == "case_list":
                result_counts[engine] = len(data.get("cases", []))
            elif itype == "patterns":
                result_counts[engine] = sum(p.get("case_count", 0) or 0 for p in data.get("patterns", []))
            elif itype == "similar_cases":
                result_counts[engine] = len(data.get("similar_cases", []))
            elif itype == "trend":
                result_counts[engine] = len(data.get("trend_data", []))
            elif itype == "financial_intelligence":
                result_counts[engine] = (data.get("summary") or {}).get("total_transactions", 0)
            elif itype == "network":
                result_counts[engine] = (data.get("stats") or {}).get("node_count", 0)
            elif itype == "risk_profiles":
                result_counts[engine] = len(data.get("profiles", []))
            elif itype == "narrative_matches":
                result_counts[engine] = len(data.get("citations", []))
            elif itype in ("context_required",):
                result_counts["context_required"] = 1
            elif itype == "zero_result":
                result_counts[f"{engine}_zero_result"] = 1
            elif itype == "error":
                result_counts[f"{engine}_error"] = 1

        # Which response type did the final answer take?
        findings = fused_result.get("findings", [])
        if any(f.get("context_required") for f in findings):
            response_type = "context_required"
        elif plan.get("intent") == "exact_case_lookup" and plan.get("exact_case") \
                and plan["exact_case"].get("answer"):
            response_type = "exact_case_deterministic"
        elif any(f.get("zero_result") for f in findings) and not any(
            f.get("strength") not in ("none",) for f in findings):
            response_type = "zero_result"
        else:
            response_type = "evidence_fused"

        return {
            "query": query,
            "detected_intent": plan.get("intent"),
            "intent_label": (plan.get("routing") or {}).get("intent_label")
                            or DeterministicIntentClassifier().describe(plan.get("intent")),
            "deterministic": bool((plan.get("routing") or {}).get("deterministic")),
            "routing_reasoning": (plan.get("routing") or {}).get("reasoning"),
            "resolved_entities": {
                "case_ids": sorted(int(x) for x in plan.get("entities", {}).get("case_ids", []) if x),
                "accused_ids": sorted(int(x) for x in plan.get("entities", {}).get("accused_ids", []) if x),
            },
            "resolved_scope": {
                "crime": (resolved_scope.get("crime") or {}).get("resolved_name")
                         or (resolved_scope.get("crime") or {}).get("requested"),
                "district": (resolved_scope.get("district") or {}).get("resolved_name")
                             or (resolved_scope.get("district") or {}).get("requested"),
                "time_window": (resolved_scope.get("time_window") or {}).get("label")
                                or (resolved_scope.get("time_window") or {}).get("requested"),
                "status": resolved_scope.get("status"),
            },
            "selected_engines": plan.get("engines", []),
            "engine_input_scope": {
                "crime": plan.get("filters", {}).get("crime_sub_head_name")
                         or plan.get("filters", {}).get("crime_head_name")
                         or plan.get("filters", {}).get("crime_category"),
                "district": plan.get("filters", {}).get("district_name_resolved")
                             or plan.get("filters", {}).get("district_name"),
                "date_from": plan.get("filters", {}).get("date_from"),
                "date_to": plan.get("filters", {}).get("date_to"),
                "time_window": plan.get("filters", {}).get("time_window"),
                "search_keyword": plan.get("filters", {}).get("search_keyword"),
                "requires_context": plan.get("requires_context", False),
            },
            "result_counts": result_counts,
            "final_response_type": response_type,
            "answer_preview": (response.get("answer") or "")[:200],
        }
