"""
Deterministic factual case lookup.

Handles simple, structured database questions that a general-purpose
LLM-to-SQL pipeline too often gets wrong:

    "details about the last cases registered in Bengaluru Urban central"
    "Show the latest 5 cases in Bengaluru."
    "How many cases were registered this month in Mysuru?"
    "Give me details of FIR 12345"

The flow is fully deterministic after parsing:

    User Question
        → intent classification (case lookup vs fallback)
        → location resolution      (real District / Unit IDs)
        → crime / status resolution (real lookup IDs)
        → recency / limit parsing  (latest, last N, this month, …)
        → RBAC authorization       (appended as a SQL condition)
        → case query               (CaseExplorerEngine.search_cases)
        → structured response

If the query is not a factual case lookup, `try_lookup` returns
`{"handled": False}` so the caller can fall back to NL2SQL — this
module never invents data and never fabricates records.
"""

import os
import re
from datetime import datetime, timedelta

from engines.case_explorer import CaseExplorerEngine
from engines.location_resolver import LocationResolver

# Phrases that signal the user wants case *records* (not analysis)
_CASE_KEYWORDS = re.compile(
    r"\b(cases?|fir|first information report|registered|records?|complaints?|dockets?)\b",
    re.IGNORECASE,
)
_COUNT_KEYWORDS = re.compile(
    r"\b(how many|count of|total (number of )?|number of)\b",
    re.IGNORECASE,
)
_RECENCY = re.compile(
    r"\b(last|latest|recent|newest|top|new|recently)\b",
    re.IGNORECASE,
)
_LIMIT = re.compile(
    r"\b(?:last|latest|recent|top|newest|first|new)\s+(\d{1,2})\s+(?:cases?|firs?|records?)\b",
    re.IGNORECASE,
)
_FIR_NUMBER = re.compile(
    r"\b(?:fir|crime|case)\s*(?:no\.?|number|#)?\s*[:#]?\s*(\d{2,})\b",
    re.IGNORECASE,
)
_THIS_MONTH = re.compile(r"\bthis (month|year)\b", re.IGNORECASE)
_LAST_PERIOD = re.compile(
    r"\blast\s+(\d{1,2})\s+(day|week|month|year)s?\b", re.IGNORECASE
)
_YESTERDAY = re.compile(r"\byesterday\b", re.IGNORECASE)
_TODAY = re.compile(r"\btoday\b", re.IGNORECASE)

# Words that indicate the query is asking for analysis or refers to people /
# previous results, not a plain record list — these block the deterministic
# path so it can never hijack an investigation-style question or a follow-up
# (e.g. "which of these cases involve the same accused?"). Such queries route
# to the multi-engine investigation pipeline instead.
_ANALYSIS_BLOCKERS = re.compile(
    r"\b(pattern|patterns|cluster|network|syndicate|ring|connected|linked|"
    r"relationship|similar|repeat offender|risk|trend|forecast|anomaly|"
    r"mastermind|associates?|financial link|money trail|modus operandi|"
    r"accused|suspects?|offenders?|involv|them|these|those|same)\b",
    re.IGNORECASE,
)

_LEADING_VERBS = re.compile(
    r"^(?:please\s+)?(?:show|list|find|get|give|give me|display|fetch|pull|"
    r"search|tell me|i want|i need|can you|could you|would you|details? about|"
    r"details? of|information on|information about|what are|what is)\s+",
    re.IGNORECASE,
)


class FactualCaseLookup:
    """Deterministic, DB-grounded factual case retrieval."""

    DEFAULT_LIMIT = 10
    MAX_LIMIT = 50

    def __init__(self, db_url: str = None):
        self.db_url = db_url or os.getenv("NEON_DATABASE_URL")
        self.resolver = LocationResolver(self.db_url)
        self.case_explorer = CaseExplorerEngine()

    # ──────────────────────────────────────────────────────────
    #  Query parsing
    # ──────────────────────────────────────────────────────────

    def analyze(self, query: str) -> dict:
        """
        Deterministically parses a query into a lookup spec.

        Returns:
            {
              "is_case_lookup": bool,
              "count_only": bool,
              "location_phrase": str | None,   # raw phrase to resolve
              "crime_phrase": str | None,
              "status_phrase": str | None,
              "keyword": str | None,           # e.g. FIR number
              "recency": "latest" | "recent" | None,
              "limit": int | None,
              "date_from": str | None,
              "date_to": str | None,
              "period_label": str | None,
              "raw": str,
            }
        """
        q = query.strip()
        ql = q.lower()

        spec = {
            "is_case_lookup": False,
            "count_only": False,
            "location_phrase": None,
            "crime_phrase": None,
            "status_phrase": None,
            "keyword": None,
            "recency": None,
            "limit": None,
            "date_from": None,
            "date_to": None,
            "period_label": None,
            "raw": q,
        }

        # Investigation-style questions never go through the factual path
        if _ANALYSIS_BLOCKERS.search(ql):
            return spec

        # FIR number lookup is always a case lookup
        fir_match = _FIR_NUMBER.search(q)
        if fir_match:
            spec["keyword"] = fir_match.group(1)
            spec["is_case_lookup"] = True

        # Detect explicit case keywords
        has_case_kw = bool(_CASE_KEYWORDS.search(ql))

        # Location phrase: the resolver works on the raw phrase, so grab the
        # most likely location substring — after a preposition, or the tail.
        loc = self._extract_location_phrase(q)
        if loc:
            spec["location_phrase"] = loc

        # Crime phrase — matched against the real CrimeSubHead / CrimeHead
        # names (token-aware, so "vehicle theft" → Motor Vehicle Theft)
        crime = self.resolver.best_crime_match(q)
        if crime.get("matched"):
            spec["crime_phrase"] = crime["phrase"]

        # Status phrase — matched against the real CaseStatusMaster names
        status = self.resolver.best_status_match(q)
        if status.get("matched"):
            spec["status_phrase"] = status["status_name"]

        # Recency / limit / date range
        if _COUNT_KEYWORDS.search(ql):
            spec["count_only"] = True

        limit_m = _LIMIT.search(q)
        if limit_m:
            spec["limit"] = min(int(limit_m.group(1)), self.MAX_LIMIT)
        if _RECENCY.search(ql):
            spec["recency"] = "recent" if re.search(r"\brecent(ly)?\b", ql) else "latest"

        today = datetime.now()
        if _THIS_MONTH.search(ql):
            spec["date_from"] = today.replace(day=1).strftime("%Y-%m-%d")
            spec["period_label"] = "This month"
        else:
            period_m = _LAST_PERIOD.search(ql)
            if period_m:
                n = int(period_m.group(1))
                unit = period_m.group(2).lower()
                if unit == "day":
                    days = n
                elif unit == "week":
                    days = n * 7
                elif unit == "year":
                    days = n * 365
                else:
                    days = n * 30
                spec["date_from"] = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
                spec["period_label"] = f"Last {n} {unit}{'s' if n != 1 else ''}"
            elif _YESTERDAY.search(ql):
                y = datetime.now()
                spec["date_from"] = y.strftime("%Y-%m-%d")
                spec["date_to"] = y.strftime("%Y-%m-%d")
                spec["period_label"] = "Yesterday"
            elif _TODAY.search(ql):
                t = datetime.now()
                spec["date_from"] = t.strftime("%Y-%m-%d")
                spec["date_to"] = t.strftime("%Y-%m-%d")
                spec["period_label"] = "Today"

        # A query is a case lookup when it names case records, OR when it
        # combines a location with recency/count (e.g. "latest in Bengaluru").
        recency_or_count = bool(spec["recency"]) or spec["count_only"]
        if spec["keyword"] or has_case_kw or (loc and recency_or_count):
            spec["is_case_lookup"] = True

        return spec

    def _extract_location_phrase(self, q: str) -> str:
        """
        Best-effort location substring extraction.

        Prefers the tail after a preposition ("registered in Bengaluru Urban
        central"). If no preposition tail exists, the whole query is treated
        as a location ONLY when a real district/station name is actually
        contained in it — otherwise None (no location scope), so queries like
        "Show recent burglary cases." never fail on location resolution.
        """
        m = re.search(
            r"\b(?:registered in|registered at|in|at|within|near|of)\s+"
            r"([a-zA-Z][a-zA-Z0-9 .'\-]{2,60})\s*[.,;!?]?$",
            q,
            re.IGNORECASE,
        )
        if m:
            tail = m.group(1).strip().rstrip(". ,;!?").strip()
            # Reject clause-like tails ("of these cases involve the same
            # accused") — they are references, not locations.
            if not re.search(
                r"\b(cases?|firs?|accused|suspect|offender|involve|involved|"
                r"registered|crime|pattern|network|connected|linked)\b",
                tail,
                re.IGNORECASE,
            ):
                return tail
        res = self.resolver.resolve(q)
        if res.get("matched"):
            return q.strip()
        return None



    # ──────────────────────────────────────────────────────────
    #  Execution
    # ──────────────────────────────────────────────────────────

    def try_lookup(self, query: str, rbac_filter: str = "1=1",
                   auth_ctx: dict = None) -> dict:
        """
        Attempts a deterministic factual case lookup for the query.

        Returns:
            {
              "handled": bool,
              "answer": str,
              "citations": [str],
              "cases": [dict],          # raw case rows for the frontend
              "total_count": int,
              "resolved_query": str,    # human-readable query summary (audit)
              "execution_detail": str,
              "scope": dict,            # for the Investigation Scope UI
              "error_kind": None | "location_unresolved" | "no_records",
            }
        """
        spec = self.analyze(query)
        if not spec["is_case_lookup"]:
            return {"handled": False}

        scope = self._build_scope(spec)

        # ── Resolve location deterministically ──
        location = {"matched": False}
        if spec["location_phrase"]:
            location = self.resolver.resolve(spec["location_phrase"])

        # Location explicitly mentioned but unresolvable → stop, never broaden
        if spec["location_phrase"] and not location["matched"]:
            scope.update({
                "status": "failed",
                "location_requested": spec["location_phrase"],
                "location_resolved": None,
            })
            return {
                "handled": True,
                "answer": (
                    f"I couldn't resolve \u201c{spec['location_phrase']}\u201d to an "
                    "authorized database location. Please specify the district or "
                    "police station (for example \u201cBengaluru Urban\u201d or "
                    "\u201cMysuru\u201d)."
                ),
                "citations": [],
                "cases": [],
                "total_count": 0,
                "resolved_query": f"LOCATION_UNRESOLVED: {spec['location_phrase']}",
                "execution_detail": "Stopped: location scope could not be resolved.",
                "scope": scope,
                "error_kind": "location_unresolved",
            }

        # ── Resolve crime / status ──
        crime = self.resolver.resolve_crime(spec["crime_phrase"]) if spec["crime_phrase"] else {"matched": False}
        status = self.resolver.resolve_status(spec["status_phrase"]) if spec["status_phrase"] else {"matched": False}

        # ── Build query params ──
        params = {
            "page": 1,
            "page_size": min(spec["limit"] or self.DEFAULT_LIMIT, self.MAX_LIMIT),
            "rbac_filter": rbac_filter,
        }
        if location.get("district_id"):
            params["district_id"] = location["district_id"]
        if location.get("unit_ids"):
            params["unit_ids"] = location["unit_ids"]
        if crime.get("crime_sub_head_id"):
            params["crime_sub_head_id"] = crime["crime_sub_head_id"]
            params["crime_head_id"] = crime.get("crime_head_id")
        elif crime.get("crime_head_id"):
            params["crime_head_id"] = crime["crime_head_id"]
        if status.get("status_ids"):
            params["status_ids"] = status["status_ids"]
        if spec["date_from"]:
            params["date_from"] = spec["date_from"]
        if spec["date_to"]:
            params["date_to"] = spec["date_to"]
        if spec["keyword"]:
            params["search_term"] = spec["keyword"]

        result = self.case_explorer.search_cases(**params)
        if "error" in result:
            return {
                "handled": True,
                "answer": f"The case query could not be executed: {result['error']}",
                "citations": [],
                "cases": [],
                "total_count": 0,
                "resolved_query": "CASE_QUERY_ERROR",
                "execution_detail": "Database error during deterministic case query.",
                "scope": scope,
                "error_kind": "query_error",
            }

        cases = result.get("cases", [])
        total_count = result.get("pagination", {}).get("total_count", len(cases))

        # ── Scope summary for the UI ──
        location_label = " · ".join(
            [n for n in [location.get("district_name"), (location.get("unit_names") or [None])[0]] if n]
        ) or (spec.get("location_phrase") or "State-wide")
        scope.update({
            "status": "verified" if (location.get("matched") or not spec["location_phrase"]) else "partial",
            "location_requested": spec["location_phrase"],
            "location_resolved": location_label,
            "period": spec["period_label"] or (
                f"Latest {params['page_size']}" if spec["recency"] else "All time"
            ),
            "crime": crime.get("crime_sub_head_name") or crime.get("crime_head_name") or spec["crime_phrase"],
            "case_status": status.get("status_name") or spec["status_phrase"],
            "records_found": total_count,
            "access": "authorized",
        })

        # ── Build the answer ──
        if spec["count_only"]:
            answer = f"{total_count} case record{'s' if total_count != 1 else ''} found" \
                     f"{' for ' + location_label if location_label != 'State-wide' else ''}" \
                     f"{' (' + (spec['period_label'] or '') + ')' if spec.get('period_label') else ''}."
        elif not cases:
            if spec["keyword"]:
                answer = (
                    f"No case record matches FIR/Crime number {spec['keyword']} "
                    "in the database."
                )
            else:
                answer = (
                    f"No cases were found for {location_label}"
                    + (f" ({spec['period_label']})" if spec.get("period_label") else "")
                    + " within the requested criteria."
                )
        else:
            answer = self._format_case_list(cases, location_label, spec)

        citations = [str(c.get("crimeno")) for c in cases if c.get("crimeno")][:10]

        # Human-readable query summary for audit/trace
        parts = []
        if location.get("district_id"):
            parts.append(f"district={location['district_id']}")
        if location.get("unit_ids"):
            parts.append(f"units={location['unit_ids']}")
        if crime.get("crime_sub_head_id"):
            parts.append(f"crime_sub_head={crime['crime_sub_head_id']}")
        if status.get("status_ids"):
            parts.append(f"status={status['status_ids']}")
        if spec["date_from"]:
            parts.append(f"from={spec['date_from']}")
        if spec["keyword"]:
            parts.append(f"search={spec['keyword']}")
        parts.append(f"sort=crimeregistereddate_desc limit={params['page_size']}")
        resolved_query = "DETERMINISTIC_CASE_LOOKUP " + " ".join(parts)

        return {
            "handled": True,
            "answer": answer,
            "citations": citations,
            "cases": cases,
            "total_count": total_count,
            "resolved_query": resolved_query,
            "execution_detail": (
                f"Deterministic case lookup: {total_count} record(s) "
                f"ordered by registration date (newest first)."
            ),
            "scope": scope,
            "error_kind": None if cases else "no_records",
        }

    def _build_scope(self, spec: dict) -> dict:
        return {
            "type": "factual_case_lookup",
            "status": "not_specified",
            "location_requested": spec["location_phrase"],
            "location_resolved": None,
            "period": spec["period_label"],
            "crime": spec["crime_phrase"],
            "case_status": spec["status_phrase"],
            "records_found": 0,
            "access": "authorized",
        }

    def _format_case_list(self, cases: list, location_label: str, spec: dict) -> str:
        """Deterministic, record-grounded list answer."""
        heading = "Latest Cases" if spec["recency"] else "Cases"
        if location_label != "State-wide":
            heading += f" — {location_label}"
        if spec["period_label"]:
            heading += f" ({spec['period_label']})"

        lines = [heading, ""]
        for i, c in enumerate(cases[:10], 1):
            parts = []
            cn = c.get("crimeno") or c.get("CrimeNo")
            if cn:
                parts.append(f"FIR/Case: {cn}")
            d = c.get("crimeregistereddate") or c.get("CrimeRegisteredDate")
            if d:
                parts.append(f"Registered: {str(d)[:10]}")
            sub = c.get("crime_sub_head") or c.get("crime_sub_head_name")
            if sub:
                parts.append(f"Crime: {sub}")
            st = c.get("casestatusname")
            if st:
                parts.append(f"Status: {st}")
            ps = c.get("police_station")
            if ps:
                parts.append(f"Station: {ps}")
            lines.append(f"{i}. " + " — ".join(parts))

        n = len(cases)
        lines.append("")
        lines.append(f"Evidence: {n} case record{'s' if n != 1 else ''} matched the requested "
                     f"location and recency criteria.")
        lines.append("Why this matters: These are the records currently available within "
                     "your authorized investigation scope, ordered by registration date.")
        return "\n".join(lines)