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
from groq import Groq
from typing import Optional


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

    def create_plan(self, request_text: str, conversation_history: list = None) -> dict:
        """
        Generates a structured investigation plan from natural language.

        Returns a dict with:
            investigation_type: str
            objectives: list[str]
            engines: list[str]  (subset of VALID_ENGINES)
            filters: dict
            entities: dict (case_ids, accused_ids, etc.)
            summary: str (brief description of what the plan will do)
        """
        if not self.groq_client:
            return self._fallback_plan(request_text)

        history_context = ""
        if conversation_history:
            recent = conversation_history[-6:]
            history_context = "\n".join([f"{h['role']}: {h['text']}" for h in recent])

        prompt = f"""You are an investigation planning agent for a law enforcement AI system.

Given an investigator's natural-language request, produce a strict JSON plan that determines
which intelligence engines to execute. You have access to these engines:

ENGINES AVAILABLE:
1. "case_query" — SQL-based search for FIRs. Use when: the investigator wants to find cases by district, date range, crime type, status, or keyword. Extracts filter params.
2. "case_similarity" — Finds cases similar to a specific CaseMasterID. Use when: the investigator mentions a specific case and wants to find related/similar cases.
3. "criminal_network" — Graph traversal starting from an AccusedMasterID. Use when: the investigator wants to see connections between criminals, co-accused, money trails, syndicates.
4. "risk_profile" — Fetches precomputed risk score for a specific AccusedMasterID. Use when: the investigator wants to assess a specific offender's danger level.
5. "pattern_detection" — Finds emerging MO-based crime clusters. Use when: the investigator wants to see if there are suspicious patterns or clusters of similar crimes.
6. "narrative_rag" — Semantic search over FIR narratives. Use when: the investigator describes a scenario or method and wants to find matching cases by narrative similarity.
7. "trend_analysis" — Temporal aggregation of cases. Use when: the investigator wants to see how crime volume changes over time.
8. "financial_intelligence" — Financial relationship analysis. Use when: the investigator wants to trace money trails, examine suspect bank accounts, find cross-case financial links, or analyze financial connections between accused persons.

FILTERS that can be extracted:
- district_name: string (e.g. "Bengaluru Urban")
- district_id: integer
- crime_category: string (e.g. "Theft", "Cyber Crime")
- time_window: "3m" | "6m" | "12m" | null (for "recent", "last 3 months", etc.)
- search_keyword: string (for BriefFacts text search)

ENTITIES that can be extracted:
- case_ids: list of CaseMasterID integers
- accused_ids: list of AccusedMasterID integers

{f'''CONVERSATION HISTORY (for resolving references like "these cases", "those offenders"):
{history_context}''' if history_context else ""}

INVESTIGATOR REQUEST:
"{request_text}"

Respond ONLY with a valid JSON object matching this exact schema:
{{
  "investigation_type": "crime_pattern_investigation" | "specific_case_analysis" | "offender_network_mapping" | "narrative_search" | "trend_investigation",
  "objectives": ["brief_english_description_of_each_step"],
  "engines": ["engine_name", ...],
  "filters": {{
    "district_name": "string or null",
    "district_id": integer or null,
    "crime_category": "string or null",
    "time_window": "string or null",
    "search_keyword": "string or null"
  }},
  "entities": {{
    "case_ids": [integers],
    "accused_ids": [integers]
  }},
  "summary": "One sentence describing what this investigation will do."
}}

RULES:
- Always include at least one engine.
- If the request mentions a specific case (CaseMasterID or CrimeNo), include "case_similarity".
- If the request mentions a specific person/accused, include "criminal_network" and/or "risk_profile".
- If the request asks about patterns, trends, or clusters, include "pattern_detection" or "trend_analysis".
- If the request asks about financial connections, money trails, bank accounts, or financial relationships, include "financial_intelligence".
- If the request is about finding cases matching a description, include "case_query" or "narrative_rag".
- For most investigations, include "case_query" and "financial_intelligence" together to get both case and financial evidence.
- For follow-up questions that reference previous results, use the conversation history to resolve references.
- Do NOT include engines that have no data to work with.
- Extract real district names, case IDs, and accused IDs from the text when present.
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
            plan.setdefault("investigation_type", "crime_pattern_investigation")
            plan.setdefault("objectives", [])
            plan.setdefault("filters", {})
            plan.setdefault("entities", {"case_ids": [], "accused_ids": []})
            plan.setdefault("summary", "Investigation plan generated.")

            # Sanitize filters
            for key in ["district_id"]:
                if key in plan["filters"] and plan["filters"][key] is not None:
                    try:
                        plan["filters"][key] = int(plan["filters"][key])
                    except (ValueError, TypeError):
                        plan["filters"][key] = None

            for key in ["case_ids", "accused_ids"]:
                if key in plan["entities"]:
                    plan["entities"][key] = [int(x) for x in plan["entities"][key] if x]

            return plan

        except Exception as e:
            return self._fallback_plan(request_text, error=str(e))

    def _fallback_plan(self, request_text: str, error: str = None) -> dict:
        """Deterministic fallback when LLM is unavailable."""
        return {
            "investigation_type": "crime_pattern_investigation",
            "objectives": ["Search for cases matching the request"],
            "engines": ["case_query"],
            "filters": {"search_keyword": request_text[:200]},
            "entities": {"case_ids": [], "accused_ids": []},
            "summary": f"Fallback plan: text search for '{request_text[:80]}...'"
        }


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

            # Resolve district_name -> district_id
            district_name = filters.get("district_name")
            if district_name and not filters.get("district_id"):
                dist_lower = district_name.lower().strip()
                # Try exact match first, then partial
                cur.execute("""
                    SELECT DistrictID, DistrictName 
                    FROM District 
                    WHERE LOWER(DistrictName) = %s OR LOWER(DistrictName) LIKE %s
                    ORDER BY 
                        CASE WHEN LOWER(DistrictName) LIKE '%%urban%%' THEN 0 ELSE 1 END,
                        LENGTH(DistrictName) DESC
                    LIMIT 1
                """, (dist_lower, f"%{dist_lower}%"))
                row = cur.fetchone()
                if row:
                    filters["district_id"] = row[0]
                    filters["district_name_resolved"] = row[1]

            # Resolve time_window -> date_from/date_to
            time_window = filters.get("time_window")
            if time_window and not filters.get("date_from"):
                if time_window == "3m":
                    filters["date_from"] = "NOW() - INTERVAL '3 months'"
                elif time_window == "6m":
                    filters["date_from"] = "NOW() - INTERVAL '6 months'"
                elif time_window == "12m":
                    filters["date_from"] = "NOW() - INTERVAL '12 months'"

            cur.close()
            conn.close()
        except Exception as e:
            # Scope resolution failed — continue with original filters
            pass
        return filters

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

        entities = plan.get("entities", {})
        engines_to_run = plan.get("engines", [])

        # Track discovered entities for chaining
        discovered_cases = set(entities.get("case_ids", []))
        discovered_accused = set(entities.get("accused_ids", []))

        # Phase 1: Case query (feeds into subsequent engines)
        if "case_query" in engines_to_run:
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
            items = self._run_pattern_detection(filters, pattern_engine)
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

        return evidence_items

    def _run_case_query(self, filters: dict, rbac_filter: str,
                        case_explorer_engine, nl2sql_engine) -> list:
        """Execute SQL-based case search with investigation scope. Returns evidence items."""
        items = []
        try:
            # Build case explorer params from investigation filters
            params = {
                "page": 1,
                "page_size": 50,
            }
            if filters.get("district_id"):
                params["district_id"] = filters["district_id"]
            if filters.get("crime_head_id"):
                params["crime_head_id"] = filters["crime_head_id"]
            if filters.get("date_from"):
                params["date_from"] = filters["date_from"]
            if filters.get("date_to"):
                params["date_to"] = filters["date_to"]
            if filters.get("search_keyword"):
                params["search"] = filters["search_keyword"]

            result = case_explorer_engine.search_cases(**params)

            if "error" not in result and result.get("cases"):
                cases = result["cases"]

                # Post-filter by CrimeSubHeadID if specific category was resolved
                # The case_explorer filters by CrimeMajorHeadID (broad),
                # but we may need the specific CrimeSubHeadID (e.g., Motor Vehicle Theft)
                crime_sub_head_id = filters.get("crime_sub_head_id")
                if crime_sub_head_id and cases:
                    # Fetch the crime_sub_head names for filtering
                    sub_head_name = filters.get("crime_sub_head_name", "")
                    if sub_head_name:
                        cases = [c for c in cases
                                 if (c.get("crime_sub_head") or "").lower() == sub_head_name.lower()]

                items.append({
                    "engine": "case_query",
                    "type": "case_list",
                    "data": {
                        "cases": cases,
                        "total_count": len(cases),
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
            keyword = filters.get("search_keyword")
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

    def _run_pattern_detection(self, filters: dict, pattern_engine) -> list:
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

            if "error" not in result and result.get("patterns"):
                patterns = result["patterns"]

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
        except Exception as e:
            items.append({
                "engine": "pattern_detection",
                "type": "error",
                "data": {"error": str(e)},
                "signal": f"Pattern detection failed: {str(e)[:100]}",
                "strength": "none",
            })
        return items

    def _run_trend_analysis(self, filters: dict, rbac_filter: str, nl2sql_engine) -> list:
        """Execute temporal trend analysis via NL2SQL. Returns evidence items."""
        items = []
        try:
            trend_instruction = " FORCE TREND FORMAT: Group by month. Select exactly two columns: 'month' (e.g. TO_CHAR(cm.CrimeRegisteredDate, 'YYYY-MM')) and 'count'."
            district_name = filters.get("district_name")
            crime_category = filters.get("crime_category")

            query_text = "Show the crime registration trend over the last 12 months"
            if district_name:
                query_text += f" in {district_name}"
            if crime_category:
                query_text += f" for {crime_category}"

            generated_sql = nl2sql_engine.generate_sql(
                query_text + trend_instruction, rbac_filter=rbac_filter
            )
            exec_result = nl2sql_engine.validate_and_execute(generated_sql, query_text)

            if "error" not in exec_result and exec_result.get("rows"):
                trend_data = []
                for row in exec_result["rows"]:
                    keys = list(row.keys())
                    if len(keys) >= 2:
                        trend_data.append({"month": str(row[keys[0]]), "count": int(row[keys[1]])})

                items.append({
                    "engine": "trend_analysis",
                    "type": "trend",
                    "data": {"trend_data": trend_data},
                    "signal": f"Analyzed {len(trend_data)} months of crime trend data",
                    "strength": "strong" if len(trend_data) >= 6 else "moderate",
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

        # Separate successful items from errors
        successful = [e for e in evidence_items if e["type"] != "error"]
        errors = [e for e in evidence_items if e["type"] == "error"]

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
                "strength": self._aggregate_strength([item["strength"] for item in case_items]),
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
                "strength": self._aggregate_strength([item["strength"] for item in pattern_items]),
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
                "strength": self._aggregate_strength([item["strength"] for item in similarity_items]),
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
                    "errors": len(errors),
                },
                "strength": self._aggregate_strength([e["strength"] for e in successful]),
            })

        summary_stats = {
            "total_findings": len(findings),
            "engines_executed": len(set(e["engine"] for e in evidence_items)),
            "engines_succeeded": len(set(e["engine"] for e in successful)),
            "engines_failed": len(set(e["engine"] for e in errors)),
            "overall_strength": self._aggregate_strength([e["strength"] for e in successful]) if successful else "none",
        }

        return {
            "findings": findings,
            "summary_stats": summary_stats,
            "evidence_graph": evidence_items,
        }

    def _aggregate_strength(self, strengths: list) -> str:
        """Deterministic strength aggregation based on actual evidence quality.
        
        A finding is 'strong' only if multiple independent engines provide
        strong evidence with actionable identifiers (case IDs, accused IDs).
        A single 'strong' engine result (like case count) is not sufficient.
        """
        if not strengths:
            return "none"
        strong_count = strengths.count("strong")
        moderate_count = strengths.count("moderate")
        limited_count = strengths.count("limited")
        none_count = strengths.count("none")
        total = len(strengths)

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

        # Build NL summary from evidence (inventory-aware)
        summary_text = self._synthesize_summary(plan, findings, stats, inventory)

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
                "combined_evidence_graph": combined_evidence_graph,
            },
            "reasoning_trace": {
                "execution_steps": [
                    {"step": 1, "action": "Investigation Planner",
                     "detail": f"Plan type: {plan.get('investigation_type')}. Engines: {', '.join(plan.get('engines', []))}"},
                    {"step": 2, "action": "Engine Execution",
                     "detail": f"Executed {stats.get('engines_succeeded', 0)}/{stats.get('engines_executed', 0)} engines successfully"},
                    {"step": 3, "action": "Evidence Fusion",
                     "detail": f"Produced {stats.get('total_findings', 0)} findings. Overall strength: {stats.get('overall_strength', 'unknown')}"},
                ]
            }
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
        for f in findings:
            if f["category"] in ("Investigation Overview", "Engine Failures"):
                continue
            evidence_sections.append(f"- {f['category']}: {f['description']} (strength: {f['strength']})")

        evidence_text = "\n".join(evidence_sections) if evidence_sections else "No evidence found."

        # Build entity-level detail from inventory
        entity_details = []
        if inventory["has_case_evidence"]:
            cn_sample = ", ".join(inventory["crime_nos"][:5])
            entity_details.append(
                f"CASE-LEVEL EVIDENCE EXISTS: {inventory['total_cases']} case records found."
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

Write a concise investigation summary (3-5 sentences maximum). STRICT RULES:
1. State what was investigated.
2. If CASE-LEVEL EVIDENCE EXISTS, acknowledge it and cite specific CrimeNo values from the inventory.
3. If PATTERN-LEVEL EVIDENCE EXISTS, name the actual patterns and MO tags found.
4. If ACCUSED-LEVEL EVIDENCE does NOT exist, say that accused-level attribution is not established — but do NOT claim that case or pattern evidence is also missing.
5. NEVER claim "no specific CrimeNo values" if the inventory shows case evidence exists.
6. NEVER claim a confirmed repeat offender unless ACCUSED-LEVEL EVIDENCE actually supports it.
7. Do NOT invent any facts. Only reference what is listed above.
8. Be direct and professional. No preamble like "Based on the analysis..."

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
            msg = f"Identified {inventory['total_cases']} relevant case records"
            if cn_sample:
                msg += f" (including CrimeNo {cn_sample})"
            msg += "."
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
            *engines: Existing engine instances

        Returns:
            Complete investigation response dict
        """
        # Step 1: Generate investigation plan
        plan = self.planner.create_plan(request_text, conversation_history)

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

        return response
