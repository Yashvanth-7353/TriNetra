"""
Next Best Investigative Action — Evidence-Grounded Lead Recommendation Engine

Extracts actionable investigative leads from investigation planner findings.
Every lead is grounded in REAL evidence from the database or existing engines.

Architecture:
    Investigation Findings (from InvestigationEngine)
        → CandidateLeadExtractor (findings → raw leads)
        → LeadDeduplicator (merge duplicate targets)
        → LeadRanker (score and sort)
        → NextBestActionEngine (orchestrate → structured response)

No LLM is used for lead generation.
All leads are deterministic and traceable to evidence.
"""

import os
import re


# ════════════════════════════════════════════════════════════════
#  CANDIDATE LEAD EXTRACTOR
# ════════════════════════════════════════════════════════════════

class CandidateLeadExtractor:
    """
    Extracts candidate leads from investigation findings.
    Each finding type produces specific lead types.
    """

    def extract(self, findings: list) -> list:
        """
        Extracts all candidate leads from investigation findings.
        Returns a list of raw lead dicts (may contain duplicates).
        """
        raw_leads = []

        for finding in findings:
            category = finding.get("category", "")
            data = finding.get("data", {})
            strength = finding.get("strength", "none")
            sources = finding.get("evidence_sources", [])

            # ── Similarity-based leads ──
            if "Similarity" in category:
                raw_leads.extend(
                    self._extract_similarity_leads(data, strength, sources)
                )

            # ── Case list leads (lower priority) ──
            elif category == "Cases Identified":
                raw_leads.extend(
                    self._extract_case_list_leads(data, strength, sources)
                )

            # ── Pattern-based leads ──
            elif "Pattern" in category:
                raw_leads.extend(
                    self._extract_pattern_leads(data, strength, sources)
                )

            # ── Network-based leads ──
            elif "Network" in category:
                raw_leads.extend(
                    self._extract_network_leads(data, strength, sources)
                )

            # ── Risk-based leads ──
            elif "Risk" in category:
                raw_leads.extend(
                    self._extract_risk_leads(data, strength, sources)
                )

        return raw_leads

    def _extract_similarity_leads(self, data: dict, strength: str, sources: list) -> list:
        """
        Extracts leads from case similarity findings.

        Each high-scoring similar case becomes a lead:
            "Review Case X" — Y% similarity with N evidence signals.
        """
        leads = []
        similar_cases = data.get("similar_cases", [])

        for match in similar_cases:
            case_id = match.get("case_id")
            crime_no = match.get("crime_no", "")
            match_score = match.get("match_score", 0)
            explanations = match.get("explanations", [])
            target_case_id = match.get("target_case_id")

            if not case_id:
                continue

            # Determine lead strength from score
            if match_score >= 70:
                lead_strength = "strong"
            elif match_score >= 40:
                lead_strength = "moderate"
            else:
                lead_strength = "limited"

            # Build evidence signals from explanations
            evidence_signals = []
            for explanation in explanations:
                evidence_signals.append({
                    "signal": self._classify_explanation(explanation),
                    "description": explanation,
                })

            # Build reason text
            reason_parts = [f"{match_score:.0f}% similarity"]
            if explanations:
                reason_parts.append(f"({', '.join(explanations[:3])})")
            reason = " — ".join(reason_parts) if len(reason_parts) > 1 else reason_parts[0]

            leads.append({
                "lead_id": f"sim_case_{case_id}",
                "type": "related_case",
                "priority_score": match_score,
                "target": {
                    "entity_type": "case",
                    "entity_id": case_id,
                    "entity_label": crime_no or f"Case #{case_id}",
                },
                "reason": reason,
                "evidence": evidence_signals,
                "source_engines": sources,
                "strength": lead_strength,
                "evidence_count": len(evidence_signals),
                "action_type": "view_case",
                "action_label": "View Case",
                "metadata": {
                    "match_score": match_score,
                    "target_case_id": target_case_id,
                    "crime_no": crime_no,
                },
            })

        return leads

    def _extract_case_list_leads(self, data: dict, strength: str, sources: list) -> list:
        """
        Extracts leads from case query results.
        Lower priority — these are "relevant cases" rather than "leads".
        """
        leads = []
        cases = data.get("cases", [])

        for case in cases[:20]:  # Limit
            case_id = case.get("casemasterid") or case.get("CaseMasterID")
            crime_no = case.get("crimeno") or case.get("CrimeNo")
            district = case.get("districtname") or case.get("DistrictName")
            status = case.get("casestatusname") or case.get("CaseStatusName")

            if not case_id:
                continue

            leads.append({
                "lead_id": f"query_case_{case_id}",
                "type": "related_case",
                "priority_score": 15,  # Low priority — these are context, not strong leads
                "target": {
                    "entity_type": "case",
                    "entity_id": case_id,
                    "entity_label": crime_no or f"Case #{case_id}",
                },
                "reason": f"Relevant case in investigation scope ({district or 'Unknown district'})",
                "evidence": [{
                    "signal": "case_query_match",
                    "description": f"Case matches investigation criteria (status: {status or 'Unknown'})",
                }],
                "source_engines": sources,
                "strength": strength,
                "evidence_count": 1,
                "action_type": "view_case",
                "action_label": "View Case",
                "metadata": {
                    "crime_no": crime_no,
                    "district": district,
                    "status": status,
                },
            })

        return leads

    def _extract_pattern_leads(self, data: dict, strength: str, sources: list) -> list:
        """
        Extracts leads from pattern detection findings.
        Converts pattern findings into ACTION-ORIENTED investigative leads.
        """
        leads = []
        patterns = data.get("patterns", [])

        for pattern in patterns:
            cluster_id = pattern.get("cluster_id", "")
            theme = pattern.get("theme", "Unknown Pattern")
            case_count = pattern.get("case_count", 0)
            mo_tags = pattern.get("mo_tags", [])
            member_cases = pattern.get("cases", [])
            date_range = pattern.get("date_range", "")
            crime_head = pattern.get("crime_head", "")
            crime_sub_head = pattern.get("crime_sub_head", "")

            mo_names = [mo.get("name", "") for mo in mo_tags if mo.get("name")]

            # Build action-oriented label
            crime_context = crime_sub_head or crime_head or "crime"
            mo_text = f" sharing '{mo_names[0]}' MO" if mo_names else ""
            action_label = f"Review {crime_context.lower()} cases{mo_text}"
            if case_count:
                action_label = f"Review {case_count} {crime_context.lower()} cases{mo_text}"

            # Build reason with scope context
            reason = f"{case_count} {crime_context.lower()} cases form an emerging cluster"
            if mo_names:
                reason += f" via '{mo_names[0]}' modus operandi"
            if date_range:
                reason += f" ({date_range})"

            # Pattern strength from case count
            if case_count >= 5:
                pattern_strength = "strong"
            elif case_count >= 3:
                pattern_strength = "moderate"
            else:
                pattern_strength = "limited"

            # Evidence signals
            evidence_signals = []
            for mo_tag in mo_tags:
                tag_name = mo_tag.get("name", "")
                if tag_name:
                    evidence_signals.append({
                        "signal": "shared_mo_tag",
                        "description": f"Shared MO: {tag_name}",
                        "metadata": {"mo_tag": tag_name},
                    })
            if crime_sub_head:
                evidence_signals.append({
                    "signal": "crime_type_match",
                    "description": f"Crime type: {crime_sub_head}",
                })
            if date_range:
                evidence_signals.append({
                    "signal": "temporal_cluster",
                    "description": f"Active during {date_range}",
                })
            evidence_signals.append({
                "signal": "pattern_membership",
                "description": f"{case_count} cases share this pattern",
            })

            leads.append({
                "lead_id": f"pattern_{cluster_id}",
                "type": "pattern_cluster",
                "priority_score": min(case_count * 8, 60),  # Reduced weight — scope matters more than count
                "target": {
                    "entity_type": "pattern",
                    "entity_id": cluster_id,
                    "entity_label": action_label,
                },
                "reason": reason,
                "evidence": evidence_signals,
                "source_engines": sources,
                "strength": pattern_strength,
                "evidence_count": len(evidence_signals),
                "action_type": "view_patterns",
                "action_label": "View Cases",
                "metadata": {
                    "case_count": case_count,
                    "date_range": date_range,
                    "mo_tags": mo_names,
                    "crime_head": crime_head,
                    "crime_sub_head": crime_sub_head,
                    "member_case_ids": [c.get("case_id") for c in member_cases if c.get("case_id")][:10],
                    "districts": pattern.get("districts", []),
                },
            })

        return leads

    def _extract_network_leads(self, data: dict, strength: str, sources: list) -> list:
        """
        Extracts leads from criminal network analysis.

        Key relationships become leads:
            - High-degree persons (connected to many others)
            - Strong co-accused relationships
            - Financial connections
            - Repeat identity connections
        """
        leads = []
        nodes = data.get("nodes", [])
        edges = data.get("edges", [])

        if not nodes or not edges:
            return leads

        # Build adjacency for degree calculation
        degree_count = {}
        for edge in edges:
            src = edge.get("from", "")
            tgt = edge.get("to", "")
            degree_count[src] = degree_count.get(src, 0) + 1
            degree_count[tgt] = degree_count.get(tgt, 0) + 1

        # Build node lookup
        node_lookup = {n.get("id", ""): n for n in nodes}

        # ── Lead 1: Highly connected persons (degree > 1) ──
        for node_id, degree in degree_count.items():
            if degree < 2:
                continue

            node = node_lookup.get(node_id, {})
            accused_id = node.get("accused_id")
            name = node.get("label", node_id)
            case_count = node.get("case_count", 0)

            if not accused_id:
                continue

            # Find all edges involving this node
            connected_edges = [
                e for e in edges
                if e.get("from") == node_id or e.get("to") == node_id
            ]

            # Build evidence from relationships
            evidence_signals = []
            relation_types = set()
            for edge in connected_edges:
                relation = edge.get("relation", "")
                relation_label = edge.get("relation_label", relation)
                relation_types.add(relation)

                # Get the connected person
                other_id = edge.get("to") if edge.get("from") == node_id else edge.get("from")
                other_node = node_lookup.get(other_id, {})
                other_name = other_node.get("label", other_id)

                details = edge.get("details", [])
                for detail in details[:3]:
                    evidence_signals.append({
                        "signal": relation,
                        "description": detail.get("detail", f"{relation_label}: {other_name}"),
                        "metadata": {
                            "connected_to": other_name,
                            "relation": relation_label,
                        },
                    })

            if not evidence_signals:
                continue

            # Priority based on degree and case count
            priority = min(degree * 15 + case_count * 5, 95)

            # Strength from degree
            if degree >= 3:
                net_strength = "strong"
            elif degree >= 2:
                net_strength = "moderate"
            else:
                net_strength = "limited"

            # Build reason
            rel_text = ", ".join(sorted(relation_types))
            reason = f"Connected to {degree} other entities via {rel_text}"

            leads.append({
                "lead_id": f"network_person_{accused_id}",
                "type": "network_connection",
                "priority_score": priority,
                "target": {
                    "entity_type": "person",
                    "entity_id": accused_id,
                    "entity_label": name,
                },
                "reason": reason,
                "evidence": evidence_signals[:10],  # Cap for readability
                "source_engines": sources,
                "strength": net_strength,
                "evidence_count": len(evidence_signals),
                "action_type": "view_network",
                "action_label": "View Network",
                "metadata": {
                    "accused_id": accused_id,
                    "name": name,
                    "degree": degree,
                    "case_count": case_count,
                    "relation_types": list(relation_types),
                },
            })

        # ── Lead 2: Key edge relationships ──
        # Highlight strong individual connections (weight >= 2)
        for edge in edges:
            weight = edge.get("weight", 1)
            if weight < 2:
                continue

            src_id = edge.get("from", "")
            tgt_id = edge.get("to", "")
            relation = edge.get("relation", "")
            relation_label = edge.get("relation_label", relation)

            src_node = node_lookup.get(src_id, {})
            tgt_node = node_lookup.get(tgt_id, {})
            src_accused = src_node.get("accused_id")
            tgt_accused = tgt_node.get("accused_id")

            if not src_accused or not tgt_accused:
                continue

            # Find the primary accused (higher risk or more connections)
            primary_id = src_accused
            primary_name = src_node.get("label", src_id)
            secondary_name = tgt_node.get("label", tgt_id)

            evidence_signals = []
            details = edge.get("details", [])
            for detail in details[:5]:
                evidence_signals.append({
                    "signal": relation,
                    "description": detail.get("detail", ""),
                    "metadata": {"relationship": relation_label},
                })

            leads.append({
                "lead_id": f"network_edge_{src_accused}_{tgt_accused}",
                "type": "network_connection",
                "priority_score": min(weight * 25, 85),
                "target": {
                    "entity_type": "person",
                    "entity_id": primary_id,
                    "entity_label": f"{primary_name} ↔ {secondary_name}",
                },
                "reason": f"{relation_label} relationship ({len(details)} case connections)",
                "evidence": evidence_signals,
                "source_engines": sources,
                "strength": "strong" if weight >= 3 else "moderate",
                "evidence_count": len(evidence_signals),
                "action_type": "view_network",
                "action_label": "View Network",
                "metadata": {
                    "accused_id": primary_id,
                    "connected_accused_id": tgt_accused,
                    "name": primary_name,
                    "connected_name": secondary_name,
                    "relation": relation,
                    "weight": weight,
                },
            })

        return leads

    def _extract_risk_leads(self, data: dict, strength: str, sources: list) -> list:
        """
        Extracts leads from risk profile findings.

        High-risk individuals become leads:
            "Review Accused X" — Risk score Y/100, repeat offender: Z.
        """
        leads = []
        profiles = data.get("profiles", [])

        for profile in profiles:
            accused_id = profile.get("accused_id")
            score = profile.get("score", 0)
            repeat_offender = profile.get("repeat_offender", False)

            if not accused_id:
                continue

            # Only create leads for elevated risk
            if score < 30:
                continue

            # Build evidence from risk factors
            evidence_signals = []
            evidence_signals.append({
                "signal": "risk_score",
                "description": f"Risk score: {score:.0f}/100",
                "metadata": {"score": score},
            })

            if repeat_offender:
                evidence_signals.append({
                    "signal": "repeat_offender",
                    "description": "Registered across multiple criminal cases",
                })

            # Parse factors
            factors = profile.get("factors", "")
            if isinstance(factors, str) and factors:
                try:
                    import json
                    factors_list = json.loads(factors) if isinstance(factors, str) else factors
                    if isinstance(factors_list, list):
                        for factor in factors_list[:3]:
                            if isinstance(factor, str):
                                evidence_signals.append({
                                    "signal": "contributing_factor",
                                    "description": factor,
                                })
                except (ValueError, TypeError):
                    pass

            # Build reason
            reason_parts = [f"Risk score {score:.0f}/100"]
            if repeat_offender:
                reason_parts.append("repeat offender")
            reason = "; ".join(reason_parts)

            leads.append({
                "lead_id": f"risk_person_{accused_id}",
                "type": "high_risk_offender",
                "priority_score": score,  # Risk score IS the priority
                "target": {
                    "entity_type": "person",
                    "entity_id": accused_id,
                    "entity_label": f"Accused #{accused_id}",
                },
                "reason": reason,
                "evidence": evidence_signals,
                "source_engines": sources,
                "strength": "strong" if score >= 70 else "moderate" if score >= 50 else "limited",
                "evidence_count": len(evidence_signals),
                "action_type": "view_profile",
                "action_label": "View Profile",
                "metadata": {
                    "accused_id": accused_id,
                    "score": score,
                    "repeat_offender": repeat_offender,
                },
            })

        return leads

    def _classify_explanation(self, explanation: str) -> str:
        """Classifies a similarity explanation into a signal type."""
        lower = explanation.lower()
        if "narrative" in lower:
            return "narrative_similarity"
        if "mo" in lower or "modus" in lower:
            return "shared_mo"
        if "km" in lower or "proximity" in lower or "away" in lower:
            return "geo_proximity"
        if "day" in lower or "temporal" in lower or "registered" in lower:
            return "temporal_proximity"
        return "other"


# ════════════════════════════════════════════════════════════════
#  LEAD DEDUPLICATOR
# ════════════════════════════════════════════════════════════════

class LeadDeduplicator:
    """
    Deduplicates leads by target entity.
    When multiple leads target the same entity, merges their evidence.
    """

    def deduplicate(self, leads: list) -> list:
        """
        Deduplicates leads by (entity_type, entity_id).
        Merges evidence signals and takes the highest priority score.
        """
        dedup_map = {}

        for lead in leads:
            target = lead.get("target", {})
            entity_type = target.get("entity_type", "")
            entity_id = target.get("entity_id", "")

            # Special handling for pattern leads — use lead_id
            if lead.get("type") == "pattern_cluster":
                key = f"pattern_{lead.get('lead_id', '')}"
            else:
                key = f"{entity_type}_{entity_id}"

            if key not in dedup_map:
                dedup_map[key] = {
                    "lead": lead.copy(),
                    "all_evidence": list(lead.get("evidence", [])),
                    "all_engines": set(lead.get("source_engines", [])),
                    "all_strengths": [lead.get("strength", "none")],
                }
            else:
                existing = dedup_map[key]
                # Merge evidence
                existing["all_evidence"].extend(lead.get("evidence", []))
                # Merge engines
                existing["all_engines"].update(lead.get("source_engines", []))
                # Track strengths
                existing["all_strengths"].append(lead.get("strength", "none"))
                # Take highest priority
                if lead.get("priority_score", 0) > existing["lead"].get("priority_score", 0):
                    existing["lead"]["priority_score"] = lead["priority_score"]
                # Update reason with additional context
                existing_reason = existing["lead"].get("reason", "")
                new_reason = lead.get("reason", "")
                if new_reason and new_reason not in existing_reason:
                    existing["lead"]["reason"] = f"{existing_reason}; also: {new_reason}"

        # Rebuild deduplicated leads
        result = []
        for key, entry in dedup_map.items():
            lead = entry["lead"]
            # Deduplicate evidence by signal type
            seen_signals = set()
            unique_evidence = []
            for ev in entry["all_evidence"]:
                signal_key = ev.get("signal", "")
                if signal_key not in seen_signals:
                    seen_signals.add(signal_key)
                    unique_evidence.append(ev)
            # Use all evidence if signals are duplicated
            if len(unique_evidence) < len(entry["all_evidence"]):
                unique_evidence = entry["all_evidence"]

            lead["evidence"] = unique_evidence[:15]  # Cap for readability
            lead["evidence_count"] = len(unique_evidence)
            lead["source_engines"] = list(entry["all_engines"])

            # Determine aggregate strength
            strength_order = {"strong": 3, "moderate": 2, "limited": 1, "none": 0}
            max_strength = max(
                (strength_order.get(s, 0) for s in entry["all_strengths"]),
                default=0
            )
            for s_name, s_val in strength_order.items():
                if s_val == max_strength:
                    lead["strength"] = s_name
                    break

            result.append(lead)

        return result


# ════════════════════════════════════════════════════════════════
#  LEAD RANKER
# ════════════════════════════════════════════════════════════════

class LeadRanker:
    """
    Ranks leads using a transparent, evidence-based methodology.

    Ranking formula:
        base_score = lead's priority_score (from extraction)
        evidence_bonus = evidence_count * 5
        engine_bonus = len(source_engines) * 8
        strength_multiplier = {strong: 1.3, moderate: 1.0, limited: 0.7}

    Final score = (base_score + evidence_bonus + engine_bonus) * strength_multiplier

    This is NOT arbitrary — it rewards:
        - High raw scores from similarity/risk engines
        - Multiple independent evidence signals
        - Multiple source engines
        - Strong evidence classification
    """

    STRENGTH_MULTIPLIERS = {
        "strong": 1.3,
        "moderate": 1.0,
        "limited": 0.7,
        "none": 0.3,
    }

    def rank(self, leads: list, scope: dict = None) -> list:
        """Ranks leads by composite evidence score with objective-aware adjustments."""
        for lead in leads:
            base = lead.get("priority_score", 0)
            ev_bonus = lead.get("evidence_count", 0) * 5
            eng_bonus = len(lead.get("source_engines", [])) * 8
            strength = lead.get("strength", "none")
            multiplier = self.STRENGTH_MULTIPLIERS.get(strength, 0.5)

            # Objective-aware bonus: boost leads that match investigation objectives
            objective_bonus = 0
            if scope:
                lead_type = lead.get("type", "")
                # Boost repeat offender leads if investigator asked for them
                if scope.get("wants_repeat_offenders") and lead_type in ("repeat_offender", "high_risk_offender"):
                    objective_bonus += 25
                # Boost network leads if investigator asked for connections
                if scope.get("wants_repeat_offenders") and lead_type == "network_connection":
                    objective_bonus += 15
                # Boost similar case leads — always relevant
                if lead_type == "related_case" and lead.get("priority_score", 0) >= 50:
                    objective_bonus += 10

            lead["rank_score"] = round((base + ev_bonus + eng_bonus + objective_bonus) * multiplier, 1)

        # Sort by rank_score descending
        leads.sort(key=lambda x: x.get("rank_score", 0), reverse=True)

        # Assign priority labels
        for i, lead in enumerate(leads):
            score = lead.get("rank_score", 0)
            if score >= 50:
                lead["priority"] = "high"
            elif score >= 25:
                lead["priority"] = "medium"
            else:
                lead["priority"] = "low"

        return leads


# ════════════════════════════════════════════════════════════════
#  MAIN ORCHESTRATOR
# ════════════════════════════════════════════════════════════════

class NextBestActionEngine:
    """
    Orchestrates the full pipeline:
        Findings → Extract → Deduplicate → Rank → Response

    This is the public entry point.
    """

    def __init__(self):
        self.extractor = CandidateLeadExtractor()
        self.deduplicator = LeadDeduplicator()
        self.ranker = LeadRanker()

    def generate_next_actions(self, investigation_result: dict) -> dict:
        """
        Generates ranked, deduplicated investigative leads from an investigation result.
        
        Pipeline: Extract → Validate Relevance → Deduplicate → Rank → Limit

        Args:
            investigation_result: Full output from InvestigationEngine.run_investigation()

        Returns:
            {
                "leads": [...],          # Ranked leads
                "total_candidates": int,  # Before dedup
                "total_leads": int,       # After dedup
                "lead_types": dict,       # Count by type
                "engines_used": list,     # Engines that produced leads
                "methodology": str,       # How ranking works
                "limitations": list,      # What this feature does NOT do
            }
        """
        findings = investigation_result.get("investigation", {}).get("findings", [])
        plan = investigation_result.get("investigation", {}).get("plan", {})

        if not findings:
            return {
                "leads": [],
                "total_candidates": 0,
                "total_leads": 0,
                "lead_types": {},
                "engines_used": [],
                "methodology": self._methodology_text(),
                "limitations": self._limitations_text(),
            }

        # Extract investigation scope from the plan
        scope = self._extract_scope(plan, findings)

        # Step 1: Extract candidate leads
        raw_leads = self.extractor.extract(findings)
        total_candidates = len(raw_leads)

        # Step 2: Validate relevance against investigation scope
        relevant_leads = self._validate_relevance(raw_leads, scope)

        # Step 3: Deduplicate
        deduped = self.deduplicator.deduplicate(relevant_leads)

        # Step 4: Rank with objective-aware scoring
        ranked = self.ranker.rank(deduped, scope)

        # Step 5: Limit to top N
        max_leads = 10
        top_leads = ranked[:max_leads]

        # Compute statistics
        lead_types = {}
        for lead in top_leads:
            lt = lead.get("type", "unknown")
            lead_types[lt] = lead_types.get(lt, 0) + 1

        all_engines = set()
        for lead in top_leads:
            all_engines.update(lead.get("source_engines", []))

        return {
            "leads": top_leads,
            "total_candidates": total_candidates,
            "total_leads": len(top_leads),
            "lead_types": lead_types,
            "engines_used": list(all_engines),
            "methodology": self._methodology_text(),
            "limitations": self._limitations_text(),
        }

    def _extract_scope(self, plan: dict, findings: list) -> dict:
        """
        Extracts investigation scope from the plan and findings.
        Used to validate lead relevance.
        """
        scope = {
            "crime_category": None,
            "crime_head_id": None,
            "district_name": None,
            "district_id": None,
            "time_window": None,
            "objectives": [],
            "investigation_type": plan.get("investigation_type", ""),
            "keywords": [],
        }

        filters = plan.get("filters", {})
        if filters.get("crime_category"):
            scope["crime_category"] = filters["crime_category"].lower()
            scope["keywords"].extend(filters["crime_category"].lower().split())
        if filters.get("crime_head_id"):
            scope["crime_head_id"] = filters["crime_head_id"]
        if filters.get("district_name"):
            scope["district_name"] = filters["district_name"].lower()
            scope["keywords"].extend(filters["district_name"].lower().split())
        if filters.get("district_id"):
            scope["district_id"] = filters["district_id"]
        if filters.get("time_window"):
            scope["time_window"] = filters["time_window"]
        if filters.get("search_keyword"):
            scope["keywords"].extend(filters["search_keyword"].lower().split())

        # Extract objectives from the plan
        scope["objectives"] = [o.lower() for o in plan.get("objectives", [])]

        # Check for repeat offender objective
        objectives_text = " ".join(scope["objectives"]).lower()
        if "repeat" in objectives_text or "offender" in objectives_text:
            scope["wants_repeat_offenders"] = True
        else:
            scope["wants_repeat_offenders"] = False

        return scope

    def _validate_relevance(self, leads: list, scope: dict) -> list:
        """
        Filters leads to only those relevant to the investigation scope.
        Removes leads that don't match the investigation's crime category,
        geographic scope, or stated objectives.
        """
        if not scope.get("keywords") and not scope.get("crime_category"):
            # No scope constraints — all leads are relevant
            return leads

        relevant = []
        for lead in leads:
            if self._is_lead_relevant(lead, scope):
                relevant.append(lead)

        return relevant

    def _is_lead_relevant(self, lead: dict, scope: dict) -> bool:
        """
        Checks if a single lead is relevant to the investigation scope.
        
        Relevance rules:
        1. Case leads: must have matching district or crime info
        2. Pattern leads: must match crime category scope
        3. Network leads: always relevant if discovered in investigation
        4. Risk leads: always relevant if discovered in investigation
        5. All leads: must not contradict scope
        """
        lead_type = lead.get("type", "")
        target = lead.get("target", {})
        metadata = lead.get("metadata", {})
        evidence = lead.get("evidence", [])

        # Network and risk leads are always relevant if they came from the investigation
        if lead_type in ("network_connection", "high_risk_offender"):
            return True

        # Case leads: check if they match the scope
        if lead_type == "related_case":
            # Check if the case's district matches
            district = (metadata.get("district") or "").lower()
            if scope.get("district_name") and district:
                if scope["district_name"] not in district and district not in scope["district_name"]:
                    # District doesn't match — check if case came from similarity (still relevant)
                    if not any(e.get("signal") in ("narrative_similarity", "mo_overlap", "geo_proximity", "temporal_proximity")
                              for e in evidence):
                        return False
            return True

        # Pattern leads: must match crime category
        if lead_type == "pattern_cluster":
            # Check if the pattern's crime type matches the investigation scope
            pattern_crime = (metadata.get("crime_sub_head") or metadata.get("crime_head") or "").lower()
            pattern_mo_tags = [t.lower() for t in metadata.get("mo_tags", [])]

            if scope.get("crime_category"):
                scope_cat = scope["crime_category"].lower()
                # Check if pattern crime type matches scope
                if pattern_crime and scope_cat not in pattern_crime and pattern_crime not in scope_cat:
                    return False
                # Check if any keyword from the scope matches the pattern
                scope_words = set(scope.get("keywords", []))
                pattern_words = set(pattern_crime.split() + pattern_mo_tags)
                if scope_words and not scope_words.intersection(pattern_words):
                    # No keyword overlap — check if the pattern's crime head matches
                    pattern_head = (metadata.get("crime_head") or "").lower()
                    if scope_cat not in pattern_head and pattern_head not in scope_cat:
                        return False

            # Check district if specified
            if scope.get("district_name"):
                pattern_districts = [d.lower() for d in metadata.get("districts", [])]
                if pattern_districts and not any(scope["district_name"] in d or d in scope["district_name"]
                                                  for d in pattern_districts):
                    return False

            return True

        # Default: relevant
        return True

    def _methodology_text(self) -> str:
        return (
            "Lead ranking uses a transparent evidence-based formula: "
            "composite_score = (base_priority + evidence_bonus + engine_bonus) × strength_multiplier. "
            "Base priority comes from the source engine (e.g., similarity score, risk score, network degree). "
            "Evidence bonus adds 5 points per independent evidence signal. "
            "Engine bonus adds 8 points per additional source engine. "
            "Strength multiplier: strong × 1.3, moderate × 1.0, limited × 0.7."
        )

    def _limitations_text(self) -> list:
        return [
            "This system provides decision-support leads, not enforcement decisions.",
            "Each lead is grounded in real database evidence — no fabricated recommendations.",
            "Lead scope is limited to the current investigation's authorized data.",
            "External data sources are not considered.",
            "The system does not make autonomous law enforcement decisions.",
        ]
