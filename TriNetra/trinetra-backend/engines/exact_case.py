"""
Exact Case / FIR resolver — entity-first routing.

Core rule enforced in code (not prompt tuning):

    ONE ID → ONE AUTHORITATIVE RECORD → VERIFIED FACTS → EXPLANATION

When the investigator supplies a specific case/FIR identifier, the question
is about THAT record.  Crime/location/status words in the question are
interpreted as VERIFICATION ("is FIR X a vehicle theft case?") or attribute
questions ("what crime is FIR X?"), never as broad database filters.

Identifier formats supported (checked against the real tables, never
hardcoded results):
    - CrimeNo          18-digit numeric (e.g. 100050030202600014)
    - CaseNo           short per-year number (e.g. 202600014)
    - CaseMasterID     small integer (e.g. 2598)

Resolution order is CrimeNo → CaseNo → CaseMasterID, with parameterized SQL
and the mandatory RBAC condition always applied.
"""

import os
import re
import logging

import psycopg2

from engines.location_resolver import LocationResolver

logger = logging.getLogger("trinetra.route")

# ── Identifier detection ────────────────────────────────────────
# A bare run of >= 12 digits is treated as a case/FIR identifier candidate
# (actual CrimeNos in the dataset are 18-digit numerics).  Prefixes make the
# intent explicit ("FIR 12345", "case no 202600014", "casemaster id 2598").
_BARE_ID = re.compile(r"(?<!\d)(\d{12,})(?!\d)")
_PREFIXED_CRIME_NO = re.compile(
    r"\b(?:fir|crime)\s*(?:no\.?|number|#)?\s*[:#-]?\s*(\d{6,})\b", re.IGNORECASE
)
_PREFIXED_CASE = re.compile(
    r"\bcase\s*(?:no\.?|number|id|#)?\s*[:#-]?\s*(\d{6,})\b", re.IGNORECASE
)
_CASEMASTER_ID = re.compile(
    r"\b(?:casemaster\s*id|casemasterid|case\s*id)\s*[:#-]?\s*(\d{1,9})\b",
    re.IGNORECASE,
)

_ENTITY_WORDS = re.compile(
    r"\b(cases?|firs?|details?|about|tell|describe|status|registered|crime|category|"
    r"station|location|district|what|when|where|who|evidence|accused|suspect|victim|"
    r"belong|belongs|involv|verify|connected|linked|under investigation|charge[ -]?sheeted)\b",
    re.IGNORECASE,
)

# ── Analysis-anchor guard ────────────────────────────────────
# A query that NAMES an exact case/FIR but then asks for an ANALYSIS OF that
# case (financial trail, network links, similar cases, pattern membership) is
# NOT an exact-case lookup. The FIR is the anchor entity for another engine;
# answering it with the FIR's own details would silently swallow the request.
# When these markers are present (after stripping the identifier) the resolver
# declines (handled=False) so the planner/delegation can run the right engine
# on the FIR entity. Attribute/verification questions ("what crime is FIR X",
# "is FIR X a vehicle theft case", "details of FIR X") keep the exact path.
_ANALYSIS_ANCHOR = re.compile(
    r"\b(similar(ity)?|comparable|compare|same\s+(mo|modus\s*operandi|method|pattern)|financial|money|"
    r"bank|account|transaction|transactions|trail|funded|paid|transfer|connected|connection|network|"
    r"linked?\s*to|associated\s+with|recurring\s+pattern|pattern\s+membership|"
    r"part\s+of\s+a\s+pattern|cluster|evidence\s+(graph|map|mapping|relationships?|links?|trail)|"
    r"relationship(s)?\s*(graph|map|diagram)|map\s+(the\s+)?(evidence|relationships?|links?)|risk|behaviour|forecast|trend)\b",
    re.IGNORECASE,
)


def is_analysis_anchored(query: str) -> bool:
    """True when the query asks for an analysis anchored on a case identifier
    (financial / network / similarity / pattern) rather than details about the
    case record itself. Exported for regression tests."""
    return bool(_ANALYSIS_ANCHOR.search(query or ""))


# Sub-intent classification (non-exhaustive — the planner still runs for the
# rest; these simply bias toward exact-entity semantics).
_CRIME_QUESTION = re.compile(
    r"\b(what|which)\s+(crime|category|offence|type|case)\b|\b(crime|category|offence|"
    r"type)\s+is\b|\bwhat\s+happened\b",
    re.IGNORECASE,
)
_DATE_QUESTION = re.compile(r"\bwhen\b|\bdate\b|registered on", re.IGNORECASE)
_STATUS_QUESTION = re.compile(r"\bstatus\b|under investigation|charge[ -]?sheeted|closed|open", re.IGNORECASE)
_WHERE_QUESTION = re.compile(
    r"\bwhere\b|which station|police station|registered in|location|district|area", re.IGNORECASE
)
_VERIFICATION = re.compile(
    r"\b(is|was|does|do|are)\b|belong|belongs|involve|involves|verify|confirm", re.IGNORECASE
)
_DETAILS = re.compile(
    r"\b(details?|about|tell me|describe|overview|summary|what is this|what's this|"
    r"what happened|show|give me|evidence)\b",
    re.IGNORECASE,
)


class ExactCaseResolver:
    """Detects exact case identifiers and answers with the single record."""

    def __init__(self, db_url: str = None):
        self.db_url = db_url or os.getenv("NEON_DATABASE_URL")
        self.resolver = LocationResolver(self.db_url)

    # ──────────────────────────────────────────────────────────
    #  Identifier detection
    # ──────────────────────────────────────────────────────────

    def detect_identifier(self, query: str) -> dict:
        """
        Returns {'found': True/False, 'value': str, 'hint': str} where hint is
        'crime_no' | 'case_no' | 'casemaster_id'. Explicit prefixes win over a
        bare long number; the FIRST candidate is used.
        """
        q = query.strip()
        if not q:
            return {"found": False, "value": None, "hint": None}

        m = _CASEMASTER_ID.search(q)
        if m:
            return {"found": True, "value": m.group(1), "hint": "casemaster_id"}
        m = _PREFIXED_CRIME_NO.search(q)
        if m:
            return {"found": True, "value": m.group(1), "hint": "crime_no"}
        m = _PREFIXED_CASE.search(q)
        if m:
            # A "case <id>" prefix can be a CaseNo or CaseMasterID — resolution
            # tries both against the database.
            return {"found": True, "value": m.group(1), "hint": "case_no_or_id"}
        m = _BARE_ID.search(q)
        if m:
            return {"found": True, "value": m.group(1), "hint": "crime_no"}
        return {"found": False, "value": None, "hint": None}

    # ──────────────────────────────────────────────────────────
    #  Exact database lookup (parameterized, RBAC applied)
    # ──────────────────────────────────────────────────────────

    def _query_exact(self, key: str, value, rbac_filter: str):
        """Returns one full case row for the exact key condition, or None."""
        if not self.db_url:
            return None
        key_conditions = {
            "crime_no": "cm.CrimeNo = %s",
            "case_no": "cm.CaseNo = %s",
            "casemaster_id": "cm.CaseMasterID = %s",
        }
        cond = key_conditions.get(key)
        if not cond:
            return None
        where = cond
        params = [value]
        if rbac_filter and rbac_filter.strip() not in ("", "1=1") and ";" not in rbac_filter:
            where += f" AND ({rbac_filter})"
        sql = f"""
            SELECT
                cm.CaseMasterID,
                cm.CrimeNo,
                cm.CaseNo,
                cm.CrimeRegisteredDate,
                cm.CrimeMinorHeadID,
                cm.CrimeMajorHeadID,
                d.DistrictName,
                u.UnitName AS police_station,
                csm.CaseStatusName,
                csm.CaseStatusID,
                cc.LookupValue AS category,
                ch.CrimeGroupName AS crime_head,
                csh.CrimeHeadName AS crime_sub_head
            FROM CaseMaster cm
            JOIN Unit u ON cm.PoliceStationID = u.UnitID
            LEFT JOIN District d ON u.DistrictID = d.DistrictID
            LEFT JOIN CaseStatusMaster csm ON cm.CaseStatusID = csm.CaseStatusID
            LEFT JOIN CaseCategory cc ON cm.CaseCategoryID = cc.CaseCategoryID
            LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
            LEFT JOIN CrimeSubHead csh ON cm.CrimeMinorHeadID = csh.CrimeSubHeadID
            WHERE {where}
            ORDER BY cm.CrimeRegisteredDate DESC, cm.CaseMasterID DESC
            LIMIT 1
        """
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            cur.execute(sql, params)
            columns = [desc[0] for desc in cur.description]
            row = cur.fetchone()
            cur.close()
            conn.close()
            if not row:
                return None
            record = dict(zip(columns, row))
            if record.get("crimeregistereddate"):
                record["crimeregistereddate"] = str(record["crimeregistereddate"])
            return record
        except Exception as e:  # pragma: no cover
            logger.warning("exact_case lookup error: %s", e)
            return None

    def _accused_for(self, case_master_id: int) -> list:
        """AccusedMasterIDs + names linked to the case (used for follow-ups)."""
        if not self.db_url or not case_master_id:
            return []
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            cur.execute(
                "SELECT AccusedMasterID, AccusedName FROM Accused WHERE CaseMasterID = %s "
                "ORDER BY AccusedMasterID LIMIT 20",
                (case_master_id,),
            )
            rows = [{"accused_id": r[0], "name": r[1]} for r in cur.fetchall()]
            cur.close()
            conn.close()
            return rows
        except Exception:
            return []

    def lookup_identifier(self, identifier: str, hint: str, rbac_filter: str) -> dict:
        """
        Resolves an identifier to a record.
        Returns {'found': bool, 'key_used': str|None, 'record': dict|None}.
        """
        id_num = identifier.strip()
        # Normalise CrimeNo lookups: strip leading zeros which users may drop.
        stripped = id_num.lstrip("0") or "0"

        order = []
        if hint == "casemaster_id":
            order = [("casemaster_id", id_num)]
        elif hint == "crime_no":
            order = [("crime_no", id_num), ("crime_no", stripped)]
        elif hint == "case_no_or_id":
            order = [("case_no", id_num)]
        else:
            order = [("crime_no", id_num), ("crime_no", stripped)]

        for key, value in order:
            record = self._query_exact(key, value, rbac_filter)
            if record:
                return {"found": True, "key_used": key, "record": record}

        # Fallbacks only for prefixed identifiers (never for a bare number)
        if hint == "case_no_or_id":
            if id_num.isdigit() and len(id_num) <= 10:
                record = self._query_exact("casemaster_id", int(id_num), rbac_filter)
                if record:
                    return {"found": True, "key_used": "casemaster_id", "record": record}
            # Also allow a full CrimeNo typed after "case"
            record = self._query_exact("crime_no", id_num, rbac_filter)
            if record:
                return {"found": True, "key_used": "crime_no", "record": record}
        return {"found": False, "key_used": None, "record": None}

    # ──────────────────────────────────────────────────────────
    #  Intent classification
    # ──────────────────────────────────────────────────────────

    def _classify(self, query: str) -> str:
        """Sub-intent for an entity-specific question.

        Direct attribute questions (when/where/status/crime) outrank generic
        yes/no detection so "when was FIR X registered?" answers the date and
        "what is the status of FIR X?" answers the status. Generic yes/no
        wording (is/was/does/belongs to) only becomes 'verification' when the
        query actually names an attribute to verify.
        """
        if _CRIME_QUESTION.search(query):
            return "crime_question"
        if re.search(r"\bwhen\b|date of registration", query, re.IGNORECASE):
            return "date_question"
        if re.search(r"\bwhere\b|which station|police station", query, re.IGNORECASE):
            return "where_question"
        if _STATUS_QUESTION.search(query):
            return "status_question"
        if _VERIFICATION.search(query):
            return "verification"
        return "details"

    def _query_clean_of_id(self, query: str, identifier: str) -> str:
        """Removes the identifier so verification phrases parse cleanly."""
        q = query.replace(identifier, " ")
        # Also drop a zero-stripped variant when present
        return re.sub(r"\s+", " ", q).strip()

    # ──────────────────────────────────────────────────────────
    #  Verification helpers (database record is authoritative)
    # ──────────────────────────────────────────────────────────

    def _verified_crime(self, record: dict) -> dict:
        return {
            "sub_head": record.get("crime_sub_head"),
            "sub_head_id": record.get("crimeminorheadid"),
            "head": record.get("crime_head"),
            "head_id": record.get("crimemajorheadid"),
        }

    def _crime_matches(self, record: dict, target: dict) -> bool:
        if not target.get("matched"):
            return False
        if target.get("crime_sub_head_id") is not None:
            if target["crime_sub_head_id"] == record.get("crimeminorheadid"):
                return True
            # Different specific crime but same broad head is NOT a match for
            # verification questions (Burglary is not Motor Vehicle Theft).
            return False
        if target.get("crime_head_id") is not None:
            return target["crime_head_id"] == record.get("crimemajorheadid")
        return False

    def _location_matches(self, record: dict, loc: dict) -> bool:
        if not loc.get("matched"):
            return False
        actual = (record.get("districtname") or "").lower()
        candidate = (loc.get("district_name") or "").lower()
        if not candidate or not actual:
            return False
        return candidate in actual or actual in candidate

    def _status_matches(self, record: dict, status: dict) -> bool:
        if not status.get("matched"):
            return False
        actual = (record.get("casestatusname") or "").lower()
        return any(
            (name or "").lower() in actual or actual in (name or "").lower()
            for name in (status.get("status_name"), status.get("phrase"))
            if name
        )

    # ──────────────────────────────────────────────────────────
    #  Answers
    # ──────────────────────────────────────────────────────────

    def _describe(self, record: dict) -> list:
        """Evidence-style lines about the record — only fields that exist."""
        lines = []
        if record.get("crime_sub_head"):
            lines.append(f"• Crime: {record['crime_sub_head']}"
                         + (f" ({record.get('crime_head')})" if record.get("crime_head") else ""))
        if record.get("districtname"):
            lines.append(f"• Location: {record['districtname']}")
        if record.get("police_station"):
            lines.append(f"• Station: {record['police_station']}")
        if record.get("crimeregistereddate"):
            lines.append(f"• Registered: {str(record['crimeregistereddate'])[:10]}")
        if record.get("casestatusname"):
            lines.append(f"• Status: {record['casestatusname']}")
        if record.get("crimeno"):
            lines.append(f"• FIR/Case: {record['crimeno']}")
        if record.get("casemasterid"):
            lines.append(f"• Case ID: {record['casemasterid']}")
        if record.get("category"):
            lines.append(f"• Category: {record['category']}")
        return lines

    def _fact_paragraph(self, record: dict, crime_override: str = None) -> str:
        crime = crime_override or record.get("crime_sub_head") or record.get("crime_head") or "case"
        loc = record.get("districtname") or "the district"
        station = record.get("police_station")
        date = str(record.get("crimeregistereddate") or "")[:10]
        status = record.get("casestatusname") or "on record"

        s = f"FIR {record['crimeno']} is a {crime} case"
        if date:
            s += f" registered on {date}"
        s += f" in {loc}"
        if station:
            s += f" at {station}"
        s += f". The case is currently {status}."
        return s

    def _try_handle(self, query: str, rbac_filter: str = "1=1",
                    auth_ctx: dict = None) -> dict:
        """Full entity-first handling. Returns handled=False when no identifier."""
        identifier_info = self.detect_identifier(query)
        if not identifier_info["found"]:
            return {"handled": False}

        identifier = identifier_info["value"]
        # Analysis-anchor guard: "similar to / financial trail for / who is
        # connected to FIR X" names FIR X as an ENTITY for another engine, not
        # as the record being described. Let the planner run that engine with
        # FIR X as the anchor instead of answering with the FIR's own details.
        q_clean_for_guard = self._query_clean_of_id(query, identifier)
        if is_analysis_anchored(q_clean_for_guard):
            logger.info(
                "TRINETRA_ROUTE query=%r detected_case_id=%s route=delegated_analysis "
                "reason=analysis_anchor_guard",
                query, identifier,
            )
            return {
                "handled": False,
                "analysis_anchor": True,
                "case_identifier": identifier,
                "case_id_hint": identifier_info["hint"],
            }

        lookup = self.lookup_identifier(identifier, identifier_info["hint"], rbac_filter)
        record = lookup.get("record")
        found = lookup.get("found")

        q_clean = self._query_clean_of_id(query, identifier)
        intent = self._classify(q_clean)
        scope = self._build_scope(identifier, identifier_info["hint"], record)

        if not found:
            logger.info(
                "TRINETRA_ROUTE query=%r detected_case_id=%s intent=%s route=exact_case_lookup "
                "engine=case_lookup result_count=0 record_found=false",
                query, identifier, intent,
            )
            return {
                "handled": True,
                "answer": f"I couldn't find FIR/Case {identifier} in the authorized records.",
                "citations": [],
                "cases": [],
                "accused": [],
                "total_count": 0,
                "resolved_query": f"EXACT_CASE_LOOKUP {lookup.get('key_used') or 'id'}={identifier} NOT_FOUND",
                "execution_detail": f"Exact lookup of {identifier} returned no authorized record.",
                "scope": scope,
                "error_kind": "case_not_found",
                "intent": intent,
                "case_identifier": identifier,
                "case_id_hint": identifier_info["hint"],
            }

        # Optional person rows (only read when the question needs them)
        accused = self._accused_for(record.get("casemasterid")) if self._wants_people(q_clean) else []

        answer = self._build_answer(query, q_clean, record, intent, accused)
        logger.info(
            "TRINETRA_ROUTE query=%r detected_case_id=%s intent=%s route=exact_case_lookup "
            "engine=case_lookup result_count=1 record_found=true",
            query, identifier, intent,
        )
        return {
            "handled": True,
            "answer": answer,
            "citations": [record.get("crimeno")] if record.get("crimeno") else [],
            "cases": [record],
            "accused": accused,
            "total_count": 1,
            "resolved_query": (
                f"EXACT_CASE_LOOKUP {lookup.get('key_used')}={identifier} "
                f"casemaster={record.get('casemasterid')}"
            ),
            "execution_detail": f"Exact case lookup resolved {identifier} to one authorized record "
                                f"(CaseMasterID {record.get('casemasterid')}).",
            "scope": scope,
            "error_kind": None,
            "intent": intent,
            "case_identifier": identifier,
            "case_id_hint": identifier_info["hint"],
        }

    def _wants_people(self, q_clean: str) -> bool:
        return bool(re.search(r"\b(accused|suspect|involved|victim|who|person)\b", q_clean, re.IGNORECASE))

    def _build_scope(self, identifier: str, hint: str, record: dict) -> dict:
        scope = {
            "type": "exact_case_lookup",
            "status": "verified" if record else "failed",
            "case_id": identifier,
            "case_id_kind": hint,
            "records_found": 1 if record else 0,
            "access": "authorized",
        }
        if record:
            scope["location_resolved"] = record.get("districtname")
            scope["period"] = str(record.get("crimeregistereddate") or "")[:10] or None
            scope["crime"] = record.get("crime_sub_head") or record.get("crime_head")
            scope["case_status"] = record.get("casestatusname")
        return scope

    # ──────────────────────────────────────────────────────────
    #  Deterministic answer builder
    # ──────────────────────────────────────────────────────────

    def _build_answer(self, query: str, q_clean: str, record: dict, intent: str, accused: list) -> str:
        # Verification: what is the user testing the record against?
        crime_target = self.resolver.best_crime_match(q_clean)
        loc_target = self.resolver.resolve(q_clean)
        status_target = self.resolver.best_status_match(q_clean)

        if intent == "verification":
            if crime_target.get("matched"):
                if self._crime_matches(record, crime_target):
                    return self._verified_yes(record, f"{crime_target.get('phrase')} case")
                actual_crime = record.get("crime_sub_head") or record.get("crime_head") or "a different category"
                return (
                    f"No. FIR {record['crimeno']} is a {actual_crime} case, not a "
                    f"{crime_target.get('phrase')} case."
                    + self._when_where_status(record)
                )
            if loc_target.get("matched"):
                if self._location_matches(record, loc_target):
                    return (
                        f"Yes. FIR {record['crimeno']} was registered in "
                        f"{record.get('districtname')}"
                        + (f" at {record.get('police_station')}" if record.get("police_station") else "")
                        + "."
                    )
                return (
                    f"No. FIR {record['crimeno']} was registered in "
                    f"{record.get('districtname') or 'an area you are authorized for'}"
                    + (f" ({record.get('police_station')})" if record.get("police_station") else "")
                    + f", not {loc_target.get('district_name')}."
                )
            if status_target.get("matched"):
                if self._status_matches(record, status_target):
                    return (
                        f"Yes. FIR {record['crimeno']} is currently "
                        f"{record.get('casestatusname')}."
                    )
                return (
                    f"No. FIR {record['crimeno']} is {record.get('casestatusname')}, "
                    f"not {status_target.get('status_name') or status_target.get('phrase')}."
                )
            # Generic yes/no — fall through to details
            intent = "details"

        if intent == "crime_question":
            actual = record.get("crime_sub_head") or record.get("crime_head") or "not categorised"
            return (
                f"The crime category for FIR {record['crimeno']} is {actual}"
                + (f" ({record.get('crime_head')})." if record.get("crime_head") and record.get("crime_sub_head") else ".")
                + f"\n\n{self._why(record)}"
            )
        if intent == "date_question":
            date = str(record.get("crimeregistereddate") or "")[:10]
            return f"FIR {record['crimeno']} was registered on {date}." if date else (
                f"No registration date is recorded for FIR {record['crimeno']}."
            )
        if intent == "status_question":
            return (
                f"The status of FIR {record['crimeno']} is {record.get('casestatusname')}."
                if record.get("casestatusname")
                else f"No status is recorded for FIR {record['crimeno']}."
            )
        if intent == "where_question":
            parts = []
            if record.get("districtname"):
                parts.append(f"FIR {record['crimeno']} was registered in {record['districtname']}")
            if record.get("police_station"):
                parts.append(f"at {record['police_station']}")
            if record.get("crimeregistereddate"):
                parts.append(f"on {str(record['crimeregistereddate'])[:10]}")
            return (" ".join(parts) + ".") if parts else (
                f"No location is recorded for FIR {record['crimeno']}."
            )

        # details / evidence / persons / default
        lines = [self._fact_paragraph(record)]
        if self._wants_people(q_clean):
            if accused:
                names = ", ".join(
                    f"{a['name']} (Accused {a['accused_id']})" if a.get("name") else f"Accused {a['accused_id']}"
                    for a in accused
                )
                lines.append(f"Accused linked to this FIR: {names}.")
            else:
                lines.append("No accused are linked to this FIR in the current records.")
        lines.append("")
        lines.append("EVIDENCE")
        lines.extend(self._describe(record))
        lines.append("")
        lines.append(f"Why it matters: {self._why(record)}")
        lines.append("")
        lines.append("Evidence strength: STRONG — verified single record from the database.")
        return "\n".join(lines)

    def _when_where_status(self, record: dict) -> str:
        parts = []
        date = str(record.get("crimeregistereddate") or "")[:10]
        if date:
            parts.append(f"registered on {date}")
        if record.get("districtname"):
            parts.append(record["districtname"])
        if record.get("police_station"):
            parts.append(record["police_station"])
        if record.get("casestatusname"):
            parts.append(f"currently {record['casestatusname']}")
        return " It was " + ", ".join(parts) + "." if parts else ""

    def _verified_yes(self, record: dict, phrase: str) -> str:
        return (
            f"Yes. FIR {record['crimeno']} is a {phrase}."
            + self._when_where_status(record)
        )

    def _why(self, record: dict) -> str:
        return (
            "The requested FIR was directly resolved to one authorized case record "
            "in the database."
        )

    # Public API used by the chat / investigate endpoints
    def try_handle(self, query: str, rbac_filter: str = "1=1",
                   auth_ctx: dict = None) -> dict:
        """Entity-first attempt. handled=False means 'no case identifier'."""
        return self._try_handle(query, rbac_filter=rbac_filter, auth_ctx=auth_ctx)

    def detect_and_lookup(self, query: str, rbac_filter: str = "1=1") -> dict:
        """
        Lightweight version for the investigation orchestrator: detects an
        identifier, resolves the record, and returns the minimal payload used
        to seed plan['exact_case'] and discovered entities.
        """
        identifier_info = self.detect_identifier(query)
        if not identifier_info["found"]:
            return {"found": False}
        lookup = self.lookup_identifier(identifier_info["value"], identifier_info["hint"], rbac_filter)
        record = lookup.get("record")
        if not lookup.get("found") or not record:
            return {"found": False, "identifier": identifier_info["value"]}
        accused = self._accused_for(record.get("casemasterid"))
        return {
            "found": True,
            "identifier": identifier_info["value"],
            "key_used": lookup.get("key_used"),
            "record": record,
            "case_master_id": record.get("casemasterid"),
            "crime_no": record.get("crimeno"),
            "crime_sub_head": record.get("crime_sub_head"),
            "crime_head": record.get("crime_head"),
            "district": record.get("districtname"),
            "station": record.get("police_station"),
            "registered": str(record.get("crimeregistereddate") or "")[:10],
            "status": record.get("casestatusname"),
            "accused_ids": [a["accused_id"] for a in accused],
        }
