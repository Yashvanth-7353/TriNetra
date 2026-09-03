"""
Central Deterministic Intent Classifier — the routing policy for TriNetra.

Every investigator query is first passed through this rule engine. It decides
WHAT the question is asking (intent), WHICH intelligence engines may answer it
(engines), and WHETHER the question needs a previously resolved investigation
entity (requires_context). The LLM planner still extracts scope details
(district, crime, time) and entity IDs, but it can never override the intent /
engine policy encoded here — it can only fill in parameters.

Intent catalogue (canonical names, also used by the UI / audit log):
    exact_case_lookup      — one identifier, one authoritative record
    case_search            — record retrieval by filters (latest burglary in X)
    case_similarity        — find cases similar to a specific FIR/case
    narrative_similarity   — find cases with a similar MO/narrative description
    pattern_detection      — recurring patterns / common MO / clusters
    trend_analysis         — time-series / increase-decrease / monthly-yearly trend
    criminal_network       — who is connected / co-accused / syndicate
    financial_analysis     — money trails / transactions / accounts / links
    behaviour_analysis     — repeated behaviour / offender behaviour patterns
    risk_analysis          — risk profile / re-offending likelihood
    forecasting            — future hotspots / crime prediction
    evidence_graph         — evidence relationships / cross-case links
    next_best_action       — recommended next investigative step
    general_investigation  — broad investigation fallback

Central engine policy (intent -> allowed engines). An intent NEVER silently
falls back to a different engine: if its engines cannot run (no entity, no
scope), the pipeline returns "context required" / "scope unresolved" instead
of substituting a broad case list.
"""

import re

# ─────────────────────────────────────────────────────────────────────
#  Central engine routing policy
# ─────────────────────────────────────────────────────────────────────

INTENT_ENGINES = {
    "exact_case_lookup": ["exact_case_lookup"],
    "case_search": ["case_query"],
    # Similarity to a specific case: similar engine + the reference record.
    "case_similarity": ["case_similarity", "case_query"],
    # MO / narrative similarity without a specific case: narrative search +
    # pattern detection on the described method + case retrieval by keyword.
    "narrative_similarity": ["narrative_rag", "case_similarity", "pattern_detection", "case_query"],
    "pattern_detection": ["pattern_detection", "case_query"],
    "trend_analysis": ["trend_analysis"],
    "criminal_network": ["criminal_network"],
    "financial_analysis": ["financial_intelligence", "case_query"],
    "behaviour_analysis": ["pattern_detection", "case_query", "risk_profile"],
    "risk_analysis": ["risk_profile"],
    "forecasting": ["forecasting"],
    "evidence_graph": ["case_query", "criminal_network", "financial_intelligence"],
    "next_best_action": ["next_best_action"],
    "general_investigation": ["case_query", "pattern_detection"],
}

# Intents that are ENTITY-CENTRIC: they must never run a broad, unfiltered
# case list. They require either an explicit entity (case ID, accused ID,
# person, account) or a previously resolved investigation context — or a
# scoped case set established by explicit crime/location/time filters.
ENTITY_CENTRIC_INTENTS = {
    "financial_analysis",
    "criminal_network",
    "risk_analysis",
    "case_similarity",
}

# ─────────────────────────────────────────────────────────────────────
#  Deterministic rule set (order matters — most specific first)
# ─────────────────────────────────────────────────────────────────────

# --- Exact identifier (FIR / CaseMasterID / CaseNo). The ExactCaseResolver
# runs with higher precedence in the pipeline; this rule exists so the plan
# is labelled correctly even before the resolver fires.
_BARE_ID = re.compile(r"(?<!\d)(\d{12,})(?!\d)")
_PREFIXED_ID = re.compile(
    r"\b(?:fir|crime|case|casemaster)\s*(?:no\.?|number|id|#)?\s*[:#-]?\s*(\d{6,})\b",
    re.IGNORECASE,
)

# --- Financial requests (strong, request-like phrasing only — a bare mention
# of "transaction" inside a crime narrative like "online transaction fraud"
# must NOT trigger an entity-centric financial investigation).
_FINANCIAL_STRONG = re.compile(
    r"\b(financial (trail|link|links|connection|connections|relationship|relationships|"
    r"intelligence|analysis|ties|network)|money trail|money movement|follow the money|"
    r"trace (the )?money|financially (connected|linked)|bank accounts?|accounts? associated|"
    r"show (the )?(financial )?(transactions?|accounts?|money)|"
    r"transactions? (between|across|among|involving|linked to|associated with)|"
    r"money (transfer|transfers|flow|flows)|funded by|funding (from|for)|"
    r"financial links? (between|across|among)|cash (flow|flows|trail)|"
    r"how is (this|that|the) .{0,30}(funded|financed))\b",
    re.IGNORECASE,
)
_FINANCIAL_WEAK = re.compile(
    r"\b(financ|money|accounts?|transactions?|banking|payments?|transfers?)\b",
    re.IGNORECASE,
)
_FINANCIAL_REQUEST_VERB = re.compile(
    r"\b(show|trace|find|follow|list|display|identify|look at|get|give me|investigate|"
    r"analy[sz]e|map|are|is|do we have|have we)\b",
    re.IGNORECASE,
)

# --- Network / connection requests
_NETWORK = re.compile(
    r"\b(who is connected|who (else|all) is (connected|linked|involved)|"
    r"criminal network|connections? between|connection to|connections? of|"
    r"co[- ]accused|syndicate|organized crime|crime ring|gang|ringleader|mastermind|"
    r"associated suspects?|associated offenders?|linked (suspects?|accused|offenders|people)|"
    r"connected (to (it|him|her|them|this|that|the)|suspects?|accused|offenders|people|cases)|"
    r"are (they|any of them|these people|these suspects?) (connected|linked|associated)|"
    r"which ones? (are|is) (connected|linked|related|involved)|"
    r"who else (is|are) (connected|linked|involved)|linked to other cases|"
    r"relationship(s)? between (suspects?|accused|offenders|people|them))\b",
    re.IGNORECASE,
)

# --- Pattern requests (recurring / common MO / clusters)
_PATTERN = re.compile(
    r"\b(recurring (pattern|incidents?|crimes?|offences?|mo|modus operandi)|"
    r"common (modus operandi|mo|method|pattern)|"
    r"repeated (method|pattern|offence|offense|behaviour|behavior)|"
    r"repeat(ed|ing)? (pattern|method)|"
    r"crime pattern|patterns? (of|in|for)|"
    r"emerging pattern|cluster(ing)?|clusters? of|"
    r"following a pattern|follow(ing|s)? a pattern|"
    r"connected by (method|modus operandi|mo)|"
    r"linked by (method|modus operandi|mo)|"
    r"is there a pattern|what patterns?|similar offence behaviour|similar offense behavior|"
    r"modus operandi pattern|mo pattern|"
    r"repeated incidents?|recurring modus operandi|trending modus operandi|"
    r"recurring[\w\s]{0,35}?patterns?|patterns?[\w\s]{0,35}?recurring|"
    r"repeated[\w\s]{0,35}?patterns?|identify recurring|"
    r"common[\w\s]{0,30}?modus operandi)\b",
    re.IGNORECASE,
)

# --- Similarity requests (case-level vs narrative/MO-level)
_SIMILAR_CASE = re.compile(
    r"\b(similar (cases?|firs?|crimes?|records?|incidents?)|"
    r"cases? (similar|like) (to )?(this|that|the)|"
    r"comparable cases?|related (cases?|firs?)|same kind of (cases?|incidents?)|"
    r"like (this|that) (case|fir|incident)|similar to (fir|case)|"
    r"find cases? (like|similar to))\b",
    re.IGNORECASE,
)
_SIMILAR_NARRATIVE = re.compile(
    r"\bsimilar (modus operandi|mo|method|pattern|narrative|incidents?|offence behaviour|"
    r"offense behavior|technique|approach)|"
    r"cases? with (the )?same (method|modus operandi|mo|pattern|technique)|"
    r"same (method|modus operandi|mo|technique) (as|of|used)|"
    r"modus operandi to|similar modus[- ]operandi|sharing (the )?same (mo|method)|"
    r"how (were|are|do) (these|those|the) (cases?|crimes?) (committed|done|carried out)|"
    r"narrative(ly)? similar|similar narrative",
    re.IGNORECASE,
)

# --- Trend requests (time-series language; never a bare "pattern" mention)
_TREND = re.compile(
    r"\b(trend|trends|monthly (trend|pattern|change)|yearly (trend|pattern|change)|"
    r"over the last \d+ months?|over the past \d+ months?|last \d+ months? (trend|change)|"
    r"increas(ing|ed|es)? (in )?(crime|theft|burglary|cases|incidents)|"
    r"decreas(ing|ed|es)? (in )?(crime|theft|burglary|cases|incidents)|"
    r"(crime|theft|burglary|cases|incidents|crimes|thefts|burglaries)[\w\s]{0,25}(increas(ing|ed|es)?|decreas(ing|ed|es)?|rising|falling|declining)|"
    r"rise in|spike in|drop in|surge in|growth (in|of)|decline in|"
    r"frequency (by|over|of)|rate of (crime|theft|burglary)|"
    r"changed over|how has .{0,40} changed|time[- ]series|"
    r"month over month|year over year|quarterly (trend|change)|"
    r"trend (visuali[sz]ation|graph|chart)|over time)\b",
    re.IGNORECASE,
)

# --- Risk requests
_RISK = re.compile(
    r"\b(risk (profile|score|assessment|level)|high[- ]risk (suspect|offender|accused)|"
    r"re[- ]?offend|reoffend(er|ing)?|repeat offender|dangerous (offender|suspect)|"
    r"how dangerous|likelihood of (re[- ]?offending|reoffending)|risk of (re[- ]?offending|reoffending))\b",
    re.IGNORECASE,
)

# --- Forecasting requests
_FORECAST = re.compile(
    r"\b(forecast|forecasting|predict(ed|ing)? (crime|crimes|cases|hotspots)|"
    r"future hotspots?|where (might|will|is|are) (crime|crimes|cases|thefts|burglaries)|"
    r"what (will|might) (happen|happening).{0,20}(next month|next year|future)|"
    r"projected|projection of (crime|cases))\b",
    re.IGNORECASE,
)

# --- Next best action requests
_NEXT_ACTION = re.compile(
    r"\b(what should (investigators?|we|i|they) (do|focus on|prioritize)|"
    r"recommended (action|actions|next step|next steps|investigative step)|"
    r"next (investigative |investigation )?steps?|next best action|"
    r"where should (investigators?|we|they) (look|focus|start)|"
    r"what (is|are) (the )?(next|best) (steps?|actions?))\b",
    re.IGNORECASE,
)

# --- Evidence graph requests
_EVIDENCE_GRAPH = re.compile(
    r"\b(evidence graph|evidence (map|mapping|relationships?|links?)|"
    r"relationship(s)? between (cases?|evidence|suspects?|accused)|"
    r"how (are|is) (these|those|the) (cases?|suspects?|accused) (related|connected|linked))\b",
    re.IGNORECASE,
)

# --- Case search (record retrieval)
_CASE_SEARCH = re.compile(
    r"\b(cases?|firs?|records?|registered|complaints?|dockets?)\b",
    re.IGNORECASE,
)
_CASE_SEARCH_VERB = re.compile(
    r"\b(show|list|find|get|give me|display|fetch|pull|search|tell me|"
    r"what are|details? (of|about)|information (on|about)|how many|count)\b",
    re.IGNORECASE,
)

# --- General investigation
_INVESTIGATE = re.compile(
    r"\binvestigat(e|ion|ing)\b|\bdeep dive\b|\bthorough (analysis|review|look)\b|\b"
    r"full (analysis|investigation|picture)\b",
    re.IGNORECASE,
)

# Phrases that make a query a follow-up reference to the previous investigation.
_FOLLOWUP_REF = re.compile(
    r"\b(this investigation|this case|that case|these cases?|those cases?|"
    r"these suspects?|those suspects?|these accused|those accused|these offenders?|"
    r"those offenders?|these people|those people|these individuals?|those individuals?|"
    r"any of (them|these|those)|which ones?|the suspects?|the accused|the offenders?|"
    r"connected to (it|him|her|them|this|that)|linked to (it|him|her|them|this|that)|"
    r"are they|do they|is it|does it|show (the )?(financial )?(trail|transactions?|accounts?|money))\b",
    re.IGNORECASE,
)

# Words that establish a NEW scope — presence means "do not inherit previous scope".
_NEW_SCOPE_TERMS = re.compile(
    r"\b(case|fir|crime|district|station|theft|burglary|robbery|murder|assault|fraud|scam|"
    r"drug|bengaluru|bangalore|mysuru|mysore|hubli|dharwad|belagavi|ballari|bagalkot|"
    r"month|year|week|today|yesterday|area|city|state)\b",
    re.IGNORECASE,
)

# Generic stop words / question tails to strip from extracted MO phrases.
_MO_STRIP = re.compile(
    r"^(please\s+)?(find|show|search|look|identify|get|give me|find me|are there|"
    r"do we have|have we|any|is there|what about)?[\s,]*(cases?|incidents?|firs?|records?)?[\s,]*"
    r"(involving|with|having|sharing|using|similar to)?[\s,]*"
    r"^[a-z]+|\.$",
    re.IGNORECASE,
)
_MO_TAIL = re.compile(r"(\.|\?|please|\bin\s+[a-z ]{2,40}|,?\s+involving\s+.*)$", re.IGNORECASE)


class DeterministicIntentClassifier:
    """Pure rule-based intent/entity/scope classification. No LLM, no DB."""

    def __init__(self):
        self.exact_id_re = _BARE_ID
        self.prefixed_id_re = _PREFIXED_ID

    # ──────────────────────────────────────────────────────────────
    #  Public API
    # ──────────────────────────────────────────────────────────────

    def has_exact_identifier(self, query: str) -> bool:
        return bool(self.exact_id_re.search(query) or self.prefixed_id_re.search(query))

    def is_followup_reference(self, query: str) -> bool:
        """True when the query refers back to a previous investigation."""
        ql = query.lower()
        return bool(_FOLLOWUP_REF.search(ql))

    def defines_new_scope(self, query: str) -> bool:
        """True when the query names a new crime/district/time — it must NOT
        inherit the previous investigation scope."""
        ql = query.lower()
        has_case = bool(re.search(r"\b(cases?|firs?|records?|registered)\b", ql))
        return has_case and bool(_NEW_SCOPE_TERMS.search(ql))

    def classify(self, query: str, investigation_context: dict = None) -> dict:
        """
        Returns:
            {
              "matched": bool,
              "intent": str|None,
              "engines": [str],
              "requires_context": bool,
              "entity_type": "case"|"accused"|None,
              "entity_ids": [],
              "mo_phrase": str|None,   # narrative/MO description for RAG
              "reasoning": str,
            }
        """
        ql = query.lower()
        has_context = bool(investigation_context) and bool(
            investigation_context.get("discovered_cases")
            or investigation_context.get("discovered_accused")
        )

        intents = []          # ordered by priority
        reasons = []

        # ── 1. Financial (strong phrasing) ──
        if _FINANCIAL_STRONG.search(ql):
            intents.append("financial_analysis")
            reasons.append("financial request phrasing detected")
        elif _FINANCIAL_WEAK.search(ql) and _FINANCIAL_REQUEST_VERB.search(ql):
            # "show transactions", "find accounts", "trace money" without a
            # strong marker — still a financial request when phrased as a verb.
            intents.append("financial_analysis")
            reasons.append("financial keyword with request verb detected")

        # ── 2. Pattern (recurring / common MO / cluster) — BEFORE network and
        #    trend so "recurring pattern ... and connected suspects" labels as
        #    pattern and "recurring pattern over time" never routes to trend. ──
        if _PATTERN.search(ql):
            intents.append("pattern_detection")
            reasons.append("pattern phrasing detected")

        # ── 3. Network / connections ──
        if _NETWORK.search(ql):
            intents.append("criminal_network")
            reasons.append("connection/network phrasing detected")

        # ── 4. Trend (explicit time-series language) ──
        if _TREND.search(ql):
            intents.append("trend_analysis")
            reasons.append("trend/time-series phrasing detected")

        # ── 5. Similarity — case-level vs narrative/MO-level ──
        sim_case = _SIMILAR_CASE.search(ql)
        sim_narrative = _SIMILAR_NARRATIVE.search(ql)
        if sim_case or sim_narrative:
            # Case-level similarity ONLY when a specific case/FIR identifier is
            # named ("find cases similar to FIR X"). Everything else — "similar
            # modus operandi", "similar method", "similar incidents", "cases
            # like this", "comparable cases involving <method>" — is MO /
            # narrative similarity answered by RAG + pattern detection.
            if sim_case and self.has_exact_identifier(query):
                intents.append("case_similarity")
                reasons.append("case-similarity phrasing detected with exact case identifier")
                if sim_narrative:
                    intents.append("narrative_similarity")
                    reasons.append("MO/narrative similarity phrasing also detected")
            elif sim_narrative or sim_case:
                intents.append("narrative_similarity")
                reasons.append("MO/narrative similarity phrasing detected")

        # ── 6. Risk ──
        if _RISK.search(ql):
            intents.append("risk_analysis")
            reasons.append("risk phrasing detected")

        # ── 7. Forecasting ──
        if _FORECAST.search(ql):
            intents.append("forecasting")
            reasons.append("forecasting phrasing detected")

        # ── 8. Next best action ──
        if _NEXT_ACTION.search(ql):
            intents.append("next_best_action")
            reasons.append("next-best-action phrasing detected")

        # ── 9. Evidence graph ──
        if _EVIDENCE_GRAPH.search(ql):
            intents.append("evidence_graph")
            reasons.append("evidence-relationship phrasing detected")

        # ── 10. Behaviour analysis (repeated offender behaviour) ──
        if re.search(r"\b(repeat(ed|ing)? (offender|offending|behaviour|behavior)|"
                     r"behaviour(al)? pattern|behavior(al)? pattern)\b", ql):
            intents.append("behaviour_analysis")
            reasons.append("behaviour-pattern phrasing detected")

        # ── 11. Case search (plain record retrieval) ──
        if not intents and _CASE_SEARCH.search(ql) and _CASE_SEARCH_VERB.search(ql):
            intents.append("case_search")
            reasons.append("case record-retrieval phrasing detected")

        # ── 12. General investigation fallback ──
        if not intents and _INVESTIGATE.search(ql):
            intents.append("general_investigation")
            reasons.append("general investigation phrasing detected")

        # A question that names an exact FIR/case identifier and only asks for
        # record retrieval ("show details of FIR X") is owned by the exact
        # resolver — never the broad case-search engine.
        if intents == ["case_search"] and self.has_exact_identifier(query):
            return {
                "matched": False,
                "intent": None,
                "engines": [],
                "requires_context": False,
                "entity_type": None,
                "entity_ids": [],
                "mo_phrase": None,
                "reasoning": "exact FIR identifier present — exact_case_lookup owns it",
            }

        if not intents:
            return {
                "matched": False,
                "intent": None,
                "engines": [],
                "requires_context": False,
                "entity_type": None,
                "entity_ids": [],
                "mo_phrase": None,
                "reasoning": "no deterministic rule matched",
            }

        # Primary intent = highest-priority match; engines = union of all
        # matched intents (multi-engine questions are allowed).
        primary = intents[0]
        engines = []
        for it in intents:
            for e in INTENT_ENGINES.get(it, []):
                if e not in engines:
                    engines.append(e)

        # Deduplicate/order engines with a canonical preference order
        order = ["exact_case_lookup", "case_query", "case_similarity", "narrative_rag",
                 "pattern_detection", "trend_analysis", "criminal_network",
                 "financial_intelligence", "risk_profile", "forecasting",
                 "next_best_action", "evidence_graph"]
        engines = [e for e in order if e in engines]

        # ── Entity requirement ──
        # Entity-centric intents need an entity (from the query or previous
        # context) OR an explicit crime/location scope that can establish the
        # investigation set ("financial trail for burglary cases in Mysuru").
        entity_centric = any(it in ENTITY_CENTRIC_INTENTS for it in intents)
        explicit_entity = self._explicit_entity(query)
        has_scope_terms = bool(re.search(
            r"\b(burglary|theft|robbery|fraud|scam|murder|assault|drug|bengaluru|"
            r"bangalore|mysuru|mysore|belagavi|ballari|bagalkot|hubli|dharwad|"
            r"in (the )?(last|past|recent))\b", ql))
        if entity_centric and not explicit_entity:
            requires_context = not (has_scope_terms or has_context)
        else:
            requires_context = False

        # Extract the narrative/MO phrase for narrative similarity
        mo_phrase = self.extract_mo_phrase(query) if "narrative_similarity" in intents else None

        return {
            "matched": True,
            "intent": primary,
            "intents": intents,
            "engines": engines,
            "requires_context": requires_context,
            "entity_type": explicit_entity.get("type") if explicit_entity else None,
            "entity_ids": [explicit_entity["id"]] if explicit_entity else [],
            "mo_phrase": mo_phrase,
            "reasoning": "; ".join(reasons),
        }

    # ──────────────────────────────────────────────────────────────
    #  Helpers
    # ──────────────────────────────────────────────────────────────

    def _explicit_entity(self, query: str) -> dict:
        """Returns {'type': 'case'|'accused', 'id': str} when the query names a
        specific case/FIR or accused ID; otherwise {}."""
        m = self.prefixed_id_re.search(query)
        if m:
            return {"type": "case", "id": m.group(1)}
        m = self.exact_id_re.search(query)
        if m:
            return {"type": "case", "id": m.group(1)}
        m = re.search(r"\baccused\s*(?:id|no\.?|number)?\s*[:#-]?\s*(\d{1,9})\b", query, re.IGNORECASE)
        if m:
            return {"type": "accused", "id": m.group(1)}
        return {}

    def extract_mo_phrase(self, query: str) -> str:
        """
        Extracts the narrative/MO description from a similarity question, e.g.
            "Find cases involving similar modus operandi to a break-in using
             forced entry."  ->  "break-in using forced entry"
        Falls back to the cleaned whole query when no anchor is found.
        """
        q = query.strip()
        anchor = re.search(
            r"\bsimilar\s+(modus operandi|mo|method|pattern|narrative|offence behaviour|"
            r"offense behavior|technique|approach)\s*(?:to|as|of)?\s*(.*)$",
            q,
            re.IGNORECASE,
        )
        phrase = anchor.group(2) if anchor else None
        if not phrase:
            anchor = re.search(
                r"\b(same method|same modus operandi|same mo|same technique)\s*(?:as|of|used)?\s*(.*)$",
                q,
                re.IGNORECASE,
            )
            phrase = anchor.group(2) if anchor else None
        if not phrase:
            anchor = re.search(r"\b(cases? like this|like this (case|fir|incident))\s*[:,-]?\s*(.*)$", q, re.IGNORECASE)
            phrase = anchor.group(2) if anchor else None
        if not phrase:
            # Whole-query fallback: strip the leading find/verb/case words
            phrase = q
        # Clean: leading articles/conjunctions, trailing punctuation, clause tails
        phrase = re.sub(r"^(a|an|the|some|any|that|this|of|to)\s+", "", phrase.strip(), flags=re.IGNORECASE)
        phrase = _MO_TAIL.sub("", phrase)
        phrase = phrase.strip().strip(".,;:!?")
        phrase = re.sub(r"\s+", " ", phrase)
        return phrase[:200]

    def describe(self, intent: str) -> str:
        """Short human label for the routing log."""
        labels = {
            "exact_case_lookup": "Exact case/FIR lookup",
            "case_search": "Case record search",
            "case_similarity": "Similar-case analysis",
            "narrative_similarity": "MO/narrative similarity",
            "pattern_detection": "Pattern detection",
            "trend_analysis": "Trend analysis",
            "criminal_network": "Criminal network",
            "financial_analysis": "Financial intelligence",
            "behaviour_analysis": "Behaviour analysis",
            "risk_analysis": "Risk profiling",
            "forecasting": "Forecasting",
            "evidence_graph": "Evidence graph",
            "next_best_action": "Next best action",
            "general_investigation": "General investigation",
        }
        return labels.get(intent, intent or "unclassified")