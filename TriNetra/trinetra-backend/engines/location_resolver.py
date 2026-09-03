"""
Deterministic location / crime / status resolution.

Turns free-text location phrases like "Bengaluru Urban Central",
"Bangalore", or "central ps 10" into real database IDs by matching
against the actual District and Unit (police station) tables —
never by hardcoding IDs and never by treating the phrase as a
literal database string.

Also resolves crime category phrases ("vehicle theft") against
CrimeSubHead / CrimeHead, and case status phrases ("charge sheeted")
against CaseStatusMaster, so downstream SQL uses real IDs.

The module is pure lookup logic; it performs no case retrieval.
"""

import os
import re
import time

import psycopg2

_ALIASES = {
    "bangalore": "bengaluru",
    "bangaluru": "bengaluru",
    "bengalooru": "bengaluru",
    "blore": "bengaluru",
    "blr": "bengaluru",
    "mysore": "mysuru",
    "mangalore": "mangaluru",
    "mangalooru": "mangaluru",
    "hubli": "hubballi",
    "bellary": "ballari",
    "gulbarga": "kalaburagi",
    "shimoga": "shivamogga",
    "tumkur": "tumakuru",
    "chikmagalur": "chikkamagaluru",
    "chikkamagalur": "chikkamagaluru",
    "bellary": "ballari",
    "bijapur": "vijayapura",
    "davanagere": "davanagere",
    "raichur": "raichur",
}

# Filler / structural words removed when matching names.  Directional
# station qualifiers like "central", "east", "west", "north", "south"
# are intentionally KEPT — they identify police stations.
_FILLER_WORDS = {
    "the", "of", "in", "at", "within", "near", "for", "and", "or",
    "police", "station", "policestation", "ps", "p.s", "dist", "district",
    "city", "town", "area", "region", "jurisdiction", "division", "zone",
    "range", "sub", "subdivision", "headquarters", "hq",
}


def _norm(text: str) -> str:
    """Normalize a phrase for matching: lowercase, alias, strip fillers."""
    if not text:
        return ""
    t = text.lower().strip()
    for alias, canonical in _ALIASES.items():
        t = re.sub(r"\b" + re.escape(alias) + r"\b", canonical, t)
    # Multi-word structural phrases first
    t = t.replace("police station", " ").replace("p s", " ")
    tokens = []
    for tok in re.split(r"[^a-z0-9]+", t):
        if not tok:
            continue
        if tok in _FILLER_WORDS:
            continue
        tokens.append(tok)
    return " ".join(tokens)


class LocationResolver:
    """Resolves free-text phrases against the real District / Unit tables."""

    # Class-level caches so repeated lookups within one process do not
    # hammer the database.  Refreshed after CACHE_TTL seconds.
    _districts = None
    _units = None
    _crime_subheads = None
    _crime_heads = None
    _statuses = None
    _cache_ts = 0.0
    CACHE_TTL = 60.0

    def __init__(self, db_url: str = None):
        self.db_url = db_url or os.getenv("NEON_DATABASE_URL")

    # ── cache helpers ────────────────────────────────────────────

    def _load_reference_data(self):
        now = time.time()
        if LocationResolver._districts is not None and now - LocationResolver._cache_ts < self.CACHE_TTL:
            return
        LocationResolver._districts = []
        LocationResolver._units = []
        LocationResolver._crime_subheads = []
        LocationResolver._crime_heads = []
        LocationResolver._statuses = []
        if not self.db_url:
            return
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            cur.execute("SELECT DistrictID, DistrictName FROM District WHERE Active = true ORDER BY DistrictName")
            LocationResolver._districts = [
                {"id": r[0], "name": r[1], "norm": _norm(r[1])} for r in cur.fetchall()
            ]
            cur.execute("""
                SELECT u.UnitID, u.UnitName, u.DistrictID
                FROM Unit u
                WHERE u.Active = true OR u.Active IS NULL
            """)
            LocationResolver._units = [
                {"id": r[0], "name": r[1], "district_id": r[2], "norm": _norm(r[1])} for r in cur.fetchall()
            ]
            cur.execute("SELECT CrimeSubHeadID, CrimeHeadName, CrimeHeadID FROM CrimeSubHead")
            LocationResolver._crime_subheads = [
                {"id": r[0], "name": r[1], "head_id": r[2], "norm": _norm(r[1])} for r in cur.fetchall()
            ]
            cur.execute("SELECT CrimeHeadID, CrimeGroupName FROM CrimeHead WHERE Active = true")
            LocationResolver._crime_heads = [
                {"id": r[0], "name": r[1], "norm": _norm(r[1])} for r in cur.fetchall()
            ]
            cur.execute("SELECT CaseStatusID, CaseStatusName FROM CaseStatusMaster")
            LocationResolver._statuses = [
                {"id": r[0], "name": r[1], "norm": _norm(r[1])} for r in cur.fetchall()
            ]
            cur.close()
            conn.close()
            LocationResolver._cache_ts = now
        except Exception:
            # Keep whatever was cached; a failed refresh is not fatal.
            pass

    # ── district / station resolution ────────────────────────────

    def resolve(self, phrase: str) -> dict:
        """
        Resolves a location phrase such as:
            "Bengaluru Urban Central"
            "Bangalore"            (alias → Bengaluru Urban)
            "Mysuru"
            "central ps 10"
            "Chitradurga Central PS 2"

        Returns:
            {
              "matched": bool,
              "district_id": int | None,
              "district_name": str | None,
              "unit_ids": [int],        # matching stations (may be empty)
              "unit_names": [str],
              "kind": "district" | "station" | "compound" | "none",
              "normalized_phrase": str,
              "unmatched_remainder": str,
            }
        """
        result = {
            "matched": False,
            "district_id": None,
            "district_name": None,
            "unit_ids": [],
            "unit_names": [],
            "kind": "none",
            "normalized_phrase": _norm(phrase),
            "unmatched_remainder": "",
        }
        self._load_reference_data()
        norm_phrase = result["normalized_phrase"]
        if not norm_phrase or not LocationResolver._districts:
            return result

        # 1) Exact normalized district match
        for d in LocationResolver._districts:
            if d["norm"] == norm_phrase:
                return self._finish_district(result, d, "", norm_phrase)

        # 2) Longest district name contained in the phrase
        #    (handles "Bengaluru Urban Central" → "Bengaluru Urban" + "Central")
        best = None
        for d in LocationResolver._districts:
            dn = d["norm"]
            if dn and (dn in norm_phrase):
                if best is None or len(dn) > len(best["norm"]):
                    best = d
        if best:
            remainder = norm_phrase.replace(best["norm"], "", 1).strip()
            return self._finish_district(result, best, remainder, norm_phrase)

        # 3) Phrase contained inside a district name — prefer the TIGHTEST fit.
        #    ("Bengaluru" is inside both "Bengaluru Rural" and "Bengaluru Urban";
        #    when the lengths tie, the city district (Urban) wins.)
        contained = [d for d in LocationResolver._districts if norm_phrase in d["norm"]]
        if contained:
            best3 = min(
                contained,
                key=lambda d: (len(d["norm"]) - len(norm_phrase),
                               0 if "urban" in d["norm"] else 1),
            )
            return self._finish_district(result, best3, "", norm_phrase)

        # 3b) A phrase TOKEN matches a district name token ("registered in
        #    bengaluru" has no "urban", but its "bengaluru" token identifies
        #    Bengaluru Urban). Prefer the tightest district; urban wins ties.
        phrase_tokens = {t for t in norm_phrase.split() if len(t) >= 4}
        token_matches = []
        for d in LocationResolver._districts:
            dn_tokens = set(d["norm"].split())
            for pt in phrase_tokens:
                if any(pt in dt or dt in pt for dt in dn_tokens):
                    token_matches.append(d)
                    break
        if token_matches:
            best3b = min(
                token_matches,
                key=lambda d: (len(d["norm"]),
                               0 if "urban" in d["norm"] else 1),
            )
            remainder = norm_phrase.replace(best3b["norm"], "", 1).strip()
            if not remainder and norm_phrase not in best3b["norm"]:
                remainder = ""
            return self._finish_district(result, best3b, remainder, norm_phrase)

        # 4) Direct police-station match (e.g. "central ps 10")
        phrase_tokens = set(norm_phrase.split())
        unit_matches = [
            u for u in LocationResolver._units
            if u["norm"] and phrase_tokens <= set(u["norm"].split())
        ]
        if unit_matches:
            districts = {u["district_id"] for u in unit_matches}
            d = next((d for d in LocationResolver._districts if d["id"] in districts), None)
            result["matched"] = True
            result["kind"] = "station"
            result["unit_ids"] = sorted({u["id"] for u in unit_matches})
            result["unit_names"] = sorted({u["name"] for u in unit_matches})
            if d:
                result["district_id"] = d["id"]
                result["district_name"] = d["name"]
            return result

        # 5) Token-subset district match as a last resort
        for d in sorted(LocationResolver._districts, key=lambda x: -len(x["norm"])):
            if set(d["norm"].split()) <= phrase_tokens:
                remainder = norm_phrase.replace(d["norm"], "", 1).strip()
                return self._finish_district(result, d, remainder, norm_phrase)

        return result

    def _finish_district(self, result: dict, district: dict, remainder: str, norm_phrase: str) -> dict:
        result["matched"] = True
        result["district_id"] = district["id"]
        result["district_name"] = district["name"]
        result["normalized_phrase"] = norm_phrase
        result["unmatched_remainder"] = remainder

        # Match station qualifiers within the district (e.g. "central")
        if remainder:
            rem_tokens = set(remainder.split())
            matches = [
                u for u in LocationResolver._units
                if u["district_id"] == district["id"]
                and u["norm"]
                and rem_tokens <= set(u["norm"].split())
            ]
            if matches:
                result["unit_ids"] = sorted({u["id"] for u in matches})
                result["unit_names"] = sorted({u["name"] for u in matches})
                result["kind"] = "compound"
                return result
            result["kind"] = "district"
            return result
        result["kind"] = "district"
        return result

    # ── crime category resolution ────────────────────────────────

    def resolve_crime(self, phrase: str) -> dict:
        """
        Resolves a crime category phrase ("vehicle theft", "burglary",
        "crimes against property") to CrimeSubHead / CrimeHead IDs.

        Matching: exact name first, then token-subset with the FEWEST extra
        tokens, so "vehicle theft" → "Motor Vehicle Theft" (one extra token)
        while a bare "theft" → "Theft" (zero extra tokens), not the more
        specific Motor Vehicle Theft.
        """
        result = {
            "matched": False,
            "crime_sub_head_id": None,
            "crime_sub_head_name": None,
            "crime_head_id": None,
            "crime_head_name": None,
            "normalized_phrase": _norm(phrase),
        }
        self._load_reference_data()
        norm_phrase = result["normalized_phrase"]
        if not norm_phrase:
            return result

        best = self._best_subhead_for(norm_phrase)
        if best:
            result.update({
                "matched": True,
                "crime_sub_head_id": best["id"],
                "crime_sub_head_name": best["name"],
                "crime_head_id": best["head_id"],
                "crime_head_name": next(
                    (h["name"] for h in LocationResolver._crime_heads if h["id"] == best["head_id"]),
                    None,
                ),
            })
            return result

        # Broad crime head match (exact, then containment with fewest extras)
        head = self._best_head_for(norm_phrase)
        if head:
            result.update({
                "matched": True,
                "crime_head_id": head["id"],
                "crime_head_name": head["name"],
            })
        return result

    # Tokens too generic to identify a crime by themselves ("attempt to
    # murder" must never match a query that merely contains the word "to").
    _WEAK_CRIME_TOKENS = {
        "to", "of", "in", "for", "against", "and", "or", "the", "a", "an",
        "with", "by", "on", "at", "case", "cases", "fir", "show", "list",
    }

    def best_crime_match(self, query: str) -> dict:
        """
        Finds the best crime phrase INSIDE a full query and resolves it.
        Returns the same shape as resolve_crime (plus the matched phrase), or
        matched=False when the query contains no recognizable crime name.
        """
        result = {
            "matched": False,
            "phrase": None,
            "crime_sub_head_id": None,
            "crime_sub_head_name": None,
            "crime_head_id": None,
            "crime_head_name": None,
        }
        self._load_reference_data()
        q_tokens = set(_norm(query).split())
        if not q_tokens:
            return result

        weak = LocationResolver._WEAK_CRIME_TOKENS

        def _distinctive(sh):
            return {t for t in sh["norm"].split() if t not in weak}

        # Score every sub-head by how many DISTINCTIVE name tokens appear in
        # the query, so "vehicle theft" (vehicle+theft) matches Motor Vehicle
        # Theft over generic Theft, while a query containing only a weak token
        # like "to" never matches "Attempt to Murder". Single-token names
        # ("Burglary") match when their token is present. Ties prefer the
        # least specific name so a bare "theft" resolves to Theft, not MVT.
        def _score(sh):
            d = _distinctive(sh)
            coverage = len(d & q_tokens)
            return (-coverage, len(d), len(sh["norm"]))

        candidates = [sh for sh in LocationResolver._crime_subheads if sh["norm"]]
        candidates.sort(key=_score)
        best = candidates[0] if candidates else None
        # No distinctive name token appears in the query → no crime match
        if best is None or not (_distinctive(best) & q_tokens):
            best = None

        if best is not None:
            result.update({
                "matched": True,
                "phrase": best["name"],
                "crime_sub_head_id": best["id"],
                "crime_sub_head_name": best["name"],
                "crime_head_id": best["head_id"],
                "crime_head_name": next(
                    (h["name"] for h in LocationResolver._crime_heads if h["id"] == best["head_id"]),
                    None,
                ),
            })
            return result

        # Broad crime head fallback (distinctive tokens only)
        heads = [h for h in LocationResolver._crime_heads if h["norm"]]
        heads.sort(key=lambda h: (-len(_distinctive(h) & q_tokens),
                                  len(h["norm"].split()), len(h["norm"])))
        if heads and (_distinctive(heads[0]) & q_tokens):
            h = heads[0]
            result.update({
                "matched": True,
                "phrase": h["name"],
                "crime_head_id": h["id"],
                "crime_head_name": h["name"],
            })
        return result

    def _best_subhead_for(self, norm_phrase: str):
        """Exact match first, then token-subset with fewest extra tokens."""
        phrase_tokens = set(norm_phrase.split())
        best = None
        best_score = None
        for sh in LocationResolver._crime_subheads:
            sn = sh["norm"]
            if not sn:
                continue
            if sn == norm_phrase:
                return sh
            sn_tokens = set(sn.split())
            if phrase_tokens and sn_tokens >= phrase_tokens:
                extra = len(sn_tokens - phrase_tokens)
                score = (extra, -len(sn))
                if best_score is None or score < best_score:
                    best, best_score = sh, score
        return best

    def _best_head_for(self, norm_phrase: str):
        phrase_tokens = set(norm_phrase.split())
        best = None
        best_score = None
        for h in LocationResolver._crime_heads:
            hn = h["norm"]
            if not hn:
                continue
            if hn == norm_phrase:
                return h
            h_tokens = set(hn.split())
            if phrase_tokens and h_tokens >= phrase_tokens:
                extra = len(h_tokens - phrase_tokens)
                score = (extra, -len(hn))
                if best_score is None or score < best_score:
                    best, best_score = h, score
        return best

    # ── case status resolution ───────────────────────────────────

    def resolve_status(self, phrase: str) -> dict:
        """
        Resolves a case status phrase ("charge sheeted", "closed") to one or
        more CaseStatusIDs. A prefix phrase like "closed" returns the whole
        "Closed - …" family (Closed - Convicted / Acquitted / False Case /
        Undetected), never a single arbitrary member.
        """
        result = {
            "matched": False,
            "status_ids": [],
            "status_name": None,
            "normalized_phrase": _norm(phrase),
        }
        self._load_reference_data()
        norm_phrase = result["normalized_phrase"]
        if not norm_phrase:
            return result

        # Exact match first
        for s in LocationResolver._statuses:
            if s["norm"] == norm_phrase:
                result.update({
                    "matched": True,
                    "status_ids": [s["id"]],
                    "status_name": s["name"],
                })
                return result

        # Prefix family: "closed" → every status whose name starts with it
        family = [s for s in LocationResolver._statuses
                  if s["norm"].startswith(norm_phrase)]
        if family:
            result.update({
                "matched": True,
                "status_ids": sorted({s["id"] for s in family}),
                "status_name": next(s["name"] for s in LocationResolver._statuses
                                     if s["norm"] == norm_phrase) if any(
                    s["norm"] == norm_phrase for s in LocationResolver._statuses
                ) else family[0]["name"],
            })
            return result

        # Containment fallback
        for s in LocationResolver._statuses:
            if norm_phrase in s["norm"]:
                result.update({
                    "matched": True,
                    "status_ids": [s["id"]],
                    "status_name": s["name"],
                })
                return result
        return result

    def best_status_match(self, query: str) -> dict:
        """
        Finds the best status phrase inside a full query and resolves it.

        Matches a full status name first ("under investigation", "charge
        sheeted"), then a family word ("closed" in "Closed - Convicted") so
        "show closed cases" resolves to the whole Closed-* family.
        """
        result = {"matched": False, "phrase": None, "status_ids": [], "status_name": None}
        self._load_reference_data()
        q_norm = _norm(query)
        q_tokens = set(q_norm.split())
        if not q_norm:
            return result
        # 1) Full status name contained in the query (longest wins)
        candidates = [s for s in LocationResolver._statuses
                      if s["norm"] and s["norm"] in q_norm]
        if candidates:
            best = max(candidates, key=lambda s: len(s["norm"]))
            resolved = self.resolve_status(best["name"])
            resolved["phrase"] = best["name"]
            return resolved
        # 2) Family word (part before " - ") present as a query token
        for s in sorted(LocationResolver._statuses, key=lambda x: -len(x["norm"])):
            if " - " in s["name"]:
                family = _norm(s["name"].split(" - ")[0])
                if family and family in q_tokens:
                    resolved = self.resolve_status(family)
                    resolved["phrase"] = family
                    return resolved
        return result