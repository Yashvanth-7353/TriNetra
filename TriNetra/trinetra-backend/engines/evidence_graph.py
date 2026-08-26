"""
Evidence Graph Builder — Deterministic Explainability Engine

Converts investigation findings into structured evidence graphs where:
- Every node = a real entity (case, person, MO tag, etc.)
- Every edge = a real relationship with traceable provenance
- Every signal = an actual computed value from an existing engine

This module NEVER invents evidence. It only extracts and structures
evidence that already exists in the database or was computed by
existing intelligence engines.

Architecture:
    Finding Data (from Investigation Planner)
        → EvidenceGraphBuilder.build_from_finding()
        → nodes[] + edges[] with provenance
        → Frontend renders interactive evidence graph
        → Investigator can click WHY? to see exact supporting evidence
"""

import os
import math
import psycopg2
from typing import Optional


# ════════════════════════════════════════════════════════════════
#  EVIDENCE GRAPH BUILDER
# ════════════════════════════════════════════════════════════════

class EvidenceGraphBuilder:
    """
    Builds structured evidence graphs from investigation findings.
    Each finding type has a dedicated builder that extracts real
    evidence relationships from the actual engine output data.
    """

    def __init__(self):
        self.db_url = os.getenv("NEON_DATABASE_URL")

    def build_from_finding(self, finding: dict) -> dict:
        """
        Main entry point. Routes to the appropriate builder based
        on finding category.

        Returns:
            {
                "nodes": [...],     # Evidence nodes (real entities)
                "edges": [...],     # Evidence edges with provenance
                "finding_summary": str,
                "evidence_strength": str,
                "sources": list     # Engine names that contributed
            }
        """
        category = finding.get("category", "")
        data = finding.get("data", {})

        if "Similarity" in category:
            return self._build_similarity_graph(data, finding)
        elif "Pattern" in category:
            return self._build_pattern_graph(data, finding)
        elif "Network" in category:
            return self._build_network_graph(data, finding)
        elif "Risk" in category:
            return self._build_risk_graph(data, finding)
        elif "Cases Identified" in category:
            return self._build_case_list_graph(data, finding)
        else:
            return self._build_generic_graph(data, finding)

    # ──────────────────────────────────────────────────────────
    #  CASE SIMILARITY EVIDENCE GRAPH
    # ──────────────────────────────────────────────────────────

    def _build_similarity_graph(self, data: dict, finding: dict) -> dict:
        """
        Builds evidence graph for case similarity findings.

        Shows: Target Case → Similarity Signals → Matched Cases
        Each edge has provenance: which signals produced the similarity.
        """
        nodes = []
        edges = []
        similar_cases = data.get("similar_cases", [])

        # Group by target case
        target_cases = {}
        for sc in similar_cases:
            target_id = sc.get("target_case_id")
            if target_id not in target_cases:
                target_cases[target_id] = []
            target_cases[target_id].append(sc)

        for target_id, matches in target_cases.items():
            # Add target case node
            target_node_id = f"case_{target_id}"
            target_label = self._get_case_label(target_id)
            nodes.append({
                "id": target_node_id,
                "type": "case",
                "label": target_label,
                "source": {"table": "CaseMaster", "record_id": target_id},
                "is_primary": True,
            })

            for match in matches:
                match_case_id = match.get("case_id")
                if not match_case_id:
                    continue

                # Add matched case node
                match_node_id = f"case_{match_case_id}"
                match_label = self._get_case_label(match_case_id)
                nodes.append({
                    "id": match_node_id,
                    "type": "case",
                    "label": match_label,
                    "source": {"table": "CaseMaster", "record_id": match_case_id},
                    "is_primary": False,
                })

                # Build evidence signals from the match's explanations
                signals = self._parse_similarity_signals(match, target_id, match_case_id)

                # Add edge with full provenance
                edges.append({
                    "id": f"sim_{target_id}_{match_case_id}",
                    "source": target_node_id,
                    "target": match_node_id,
                    "relationship": "case_similarity",
                    "relationship_label": f"{match.get('match_score', 0):.0f}% match",
                    "strength": self._score_to_strength(match.get("match_score", 0)),
                    "source_engine": "pattern_engine",
                    "evidence": signals,
                })

        return {
            "nodes": self._deduplicate_nodes(nodes),
            "edges": edges,
            "finding_summary": finding.get("description", ""),
            "evidence_strength": finding.get("strength", "unknown"),
            "sources": finding.get("evidence_sources", ["case_similarity"]),
        }

    def _parse_similarity_signals(self, match: dict, target_id: int, match_id: int) -> list:
        """Extracts structured evidence signals from a similarity match."""
        signals = []
        explanations = match.get("explanations", [])

        for explanation in explanations:
            explanation_lower = explanation.lower()

            if "narrative" in explanation_lower:
                # Extract percentage from explanation
                pct = self._extract_number(explanation)
                signals.append({
                    "signal": "narrative_similarity",
                    "label": "Narrative Similarity",
                    "description": explanation,
                    "value": f"{pct:.0f}%" if pct else explanation,
                    "source_records": [
                        {"table": "CaseMaster", "record_id": target_id, "field": "BriefFacts"},
                        {"table": "CaseMaster", "record_id": match_id, "field": "BriefFacts"},
                    ],
                })
            elif "mo" in explanation_lower or "modus" in explanation_lower:
                count = self._extract_number(explanation)
                signals.append({
                    "signal": "mo_overlap",
                    "label": "Modus Operandi Overlap",
                    "description": explanation,
                    "value": f"{int(count)} shared tags" if count else explanation,
                    "source_records": [
                        {"table": "ModusOperandi", "record_id": target_id, "field": "CaseMasterID"},
                        {"table": "ModusOperandi", "record_id": match_id, "field": "CaseMasterID"},
                    ],
                })
            elif "km" in explanation_lower or "proximity" in explanation_lower or "away" in explanation_lower:
                km = self._extract_number(explanation)
                signals.append({
                    "signal": "geo_proximity",
                    "label": "Geographic Proximity",
                    "description": explanation,
                    "value": f"{km:.1f} km" if km else explanation,
                    "source_records": [
                        {"table": "CaseMaster", "record_id": target_id, "field": "latitude,longitude"},
                        {"table": "CaseMaster", "record_id": match_id, "field": "latitude,longitude"},
                    ],
                })
            elif "day" in explanation_lower or "temporal" in explanation_lower or "registered" in explanation_lower:
                days = self._extract_number(explanation)
                signals.append({
                    "signal": "temporal_proximity",
                    "label": "Temporal Proximity",
                    "description": explanation,
                    "value": f"{int(days)} days" if days else explanation,
                    "source_records": [
                        {"table": "CaseMaster", "record_id": target_id, "field": "CrimeRegisteredDate"},
                        {"table": "CaseMaster", "record_id": match_id, "field": "CrimeRegisteredDate"},
                    ],
                })
            else:
                signals.append({
                    "signal": "other",
                    "label": "Analytical Signal",
                    "description": explanation,
                    "value": explanation,
                    "source_records": [],
                })

        # Add the composite score as a summary signal
        score = match.get("match_score", 0)
        signals.insert(0, {
            "signal": "composite_score",
            "label": "Composite Match Score",
            "description": f"Overall similarity: {score:.0f}%",
            "value": f"{score:.0f}%",
            "source_records": [],
        })

        return signals

    # ──────────────────────────────────────────────────────────
    #  PATTERN DETECTION EVIDENCE GRAPH
    # ──────────────────────────────────────────────────────────

    def _build_pattern_graph(self, data: dict, finding: dict) -> dict:
        """
        Builds evidence graph for pattern detection findings.

        Shows: Pattern Cluster → MO Tags → Cases in Cluster
        """
        nodes = []
        edges = []
        patterns = data.get("patterns", [])

        for pattern in patterns:
            cluster_id = pattern.get("cluster_id", "")
            theme = pattern.get("theme", "Unknown Pattern")

            # Add pattern cluster node
            pattern_node_id = f"pattern_{cluster_id}"
            nodes.append({
                "id": pattern_node_id,
                "type": "pattern",
                "label": theme,
                "source": {"table": "ModusOperandi", "record_id": cluster_id},
                "is_primary": True,
                "metadata": {
                    "case_count": pattern.get("case_count", 0),
                    "date_range": pattern.get("date_range", ""),
                },
            })

            # Add MO tag nodes and edges
            for mo_tag in pattern.get("mo_tags", []):
                mo_name = mo_tag.get("name", "")
                if not mo_name:
                    continue
                mo_node_id = f"mo_{mo_name.replace(' ', '_').lower()}"
                nodes.append({
                    "id": mo_node_id,
                    "type": "mo_tag",
                    "label": mo_name,
                    "source": {"table": "MOTagMaster", "record_id": mo_name},
                    "is_primary": False,
                })
                edges.append({
                    "id": f"pattern_mo_{cluster_id}_{mo_name}",
                    "source": pattern_node_id,
                    "target": mo_node_id,
                    "relationship": "uses_modus_operandi",
                    "relationship_label": "Uses MO",
                    "strength": "strong",
                    "source_engine": "pattern_engine",
                    "evidence": [{
                        "signal": "mo_tag_membership",
                        "label": "MO Tag",
                        "description": f"Pattern uses MO tag: {mo_name}",
                        "value": mo_name,
                        "source_records": [{"table": "MOTagMaster", "record_id": mo_name}],
                    }],
                })

            # Add case nodes and edges
            for case in pattern.get("cases", []):
                case_id = case.get("case_id")
                if not case_id:
                    continue
                case_node_id = f"case_{case_id}"
                case_label = case.get("crime_no", f"Case #{case_id}")
                nodes.append({
                    "id": case_node_id,
                    "type": "case",
                    "label": case_label,
                    "source": {"table": "CaseMaster", "record_id": case_id},
                    "is_primary": False,
                    "metadata": {
                        "date": case.get("date", ""),
                        "district": case.get("district", ""),
                    },
                })
                edges.append({
                    "id": f"pattern_case_{cluster_id}_{case_id}",
                    "source": pattern_node_id,
                    "target": case_node_id,
                    "relationship": "pattern_member",
                    "relationship_label": "In Pattern",
                    "strength": "strong",
                    "source_engine": "pattern_engine",
                    "evidence": [{
                        "signal": "mo_membership",
                        "label": "Pattern Membership",
                        "description": f"Case #{case_id} matches pattern '{theme}' via shared MO tags",
                        "value": f"Case #{case_id}",
                        "source_records": [
                            {"table": "CaseMaster", "record_id": case_id},
                            {"table": "ModusOperandi", "record_id": case_id},
                        ],
                    }],
                })

        return {
            "nodes": self._deduplicate_nodes(nodes),
            "edges": edges,
            "finding_summary": finding.get("description", ""),
            "evidence_strength": finding.get("strength", "unknown"),
            "sources": finding.get("evidence_sources", ["pattern_detection"]),
        }

    # ──────────────────────────────────────────────────────────
    #  CRIMINAL NETWORK EVIDENCE GRAPH
    # ──────────────────────────────────────────────────────────

    def _build_network_graph(self, data: dict, finding: dict) -> dict:
        """
        Builds evidence graph from criminal network engine output.

        Converts the existing NetworkX graph output into evidence
        graph format with provenance for each relationship.
        """
        nodes = []
        edges = []

        # Convert existing network nodes
        for node in data.get("nodes", []):
            node_id = node.get("id", "")
            accused_id = node.get("accused_id")
            nodes.append({
                "id": node_id,
                "type": "person",
                "label": node.get("label", node_id),
                "source": {"table": "Accused", "record_id": accused_id} if accused_id else {"table": "Accused", "record_id": node_id},
                "is_primary": node.get("is_root", False),
                "metadata": {
                    "age": node.get("age"),
                    "gender_id": node.get("gender_id"),
                    "case_count": node.get("case_count", 0),
                    "community": node.get("community", 0),
                },
            })

        # Convert existing network edges with provenance
        for edge in data.get("edges", []):
            edge_details = edge.get("details", [])
            evidence_items = []

            for detail in edge_details[:10]:  # Cap for performance
                evidence_items.append({
                    "signal": detail.get("relation", "unknown"),
                    "label": self._relation_to_label(detail.get("relation", "")),
                    "description": detail.get("detail", ""),
                    "value": detail.get("detail", ""),
                    "source_records": [
                        {"table": "Accused", "record_id": edge.get("from", "")},
                        {"table": "Accused", "record_id": edge.get("to", "")},
                    ],
                })

            edges.append({
                "id": f"net_{edge.get('from', '')}_{edge.get('to', '')}_{edge.get('relation', '')}",
                "source": edge.get("from", ""),
                "target": edge.get("to", ""),
                "relationship": edge.get("relation", "unknown"),
                "relationship_label": edge.get("relation_label", edge.get("relation", "")),
                "strength": self._weight_to_strength(edge.get("weight", 1)),
                "source_engine": "network_engine",
                "evidence": evidence_items if evidence_items else [{
                    "signal": edge.get("relation", "unknown"),
                    "label": self._relation_to_label(edge.get("relation", "")),
                    "description": f"Relationship: {edge.get('relation', 'unknown')}",
                    "value": edge.get("relation", "unknown"),
                    "source_records": [],
                }],
            })

        return {
            "nodes": self._deduplicate_nodes(nodes),
            "edges": edges,
            "finding_summary": finding.get("description", ""),
            "evidence_strength": finding.get("strength", "unknown"),
            "sources": finding.get("evidence_sources", ["criminal_network"]),
        }

    # ──────────────────────────────────────────────────────────
    #  RISK PROFILE EVIDENCE GRAPH
    # ──────────────────────────────────────────────────────────

    def _build_risk_graph(self, data: dict, finding: dict) -> dict:
        """
        Builds evidence graph for risk profile findings.

        Shows: Person → Risk Score → Contributing Factors
        """
        nodes = []
        edges = []
        profiles = data.get("profiles", [])

        for profile in profiles:
            accused_id = profile.get("accused_id")
            if not accused_id:
                continue

            # Person node
            person_node_id = f"person_{accused_id}"
            person_label = self._get_accused_label(accused_id)
            nodes.append({
                "id": person_node_id,
                "type": "person",
                "label": person_label,
                "source": {"table": "Accused", "record_id": accused_id},
                "is_primary": True,
                "metadata": {
                    "risk_score": profile.get("score", 0),
                    "repeat_offender": profile.get("repeat_offender", False),
                },
            })

            # Risk score node
            score = profile.get("score", 0)
            risk_node_id = f"risk_{accused_id}"
            nodes.append({
                "id": risk_node_id,
                "type": "risk_score",
                "label": f"Risk: {score:.0f}/100",
                "source": {"table": "OffenderRiskScore", "record_id": accused_id},
                "is_primary": False,
                "metadata": {"score": score},
            })

            # Edge: Person → Risk Score
            evidence = [{
                "signal": "risk_score",
                "label": "Risk Score",
                "description": f"Computed risk score: {score:.0f}/100",
                "value": f"{score:.0f}/100",
                "source_records": [{"table": "OffenderRiskScore", "record_id": accused_id}],
            }]

            if profile.get("repeat_offender"):
                evidence.append({
                    "signal": "repeat_offender",
                    "label": "Repeat Offender",
                    "description": "This individual has been registered in multiple criminal cases",
                    "value": "Yes",
                    "source_records": [{"table": "OffenderRiskScore", "record_id": accused_id}],
                })

            # Parse contributing factors
            factors = profile.get("factors", "")
            if isinstance(factors, str) and factors:
                try:
                    import json
                    factors_list = json.loads(factors) if isinstance(factors, str) else factors
                    if isinstance(factors_list, list):
                        for factor in factors_list:
                            if isinstance(factor, str):
                                evidence.append({
                                    "signal": "contributing_factor",
                                    "label": "Contributing Factor",
                                    "description": factor,
                                    "value": factor,
                                    "source_records": [{"table": "OffenderRiskScore", "record_id": accused_id}],
                                })
                except (json.JSONDecodeError, TypeError):
                    pass
            elif isinstance(factors, dict):
                for key, value in factors.items():
                    evidence.append({
                        "signal": f"factor_{key}",
                        "label": key.replace("_", " ").title(),
                        "description": f"{key}: {value}",
                        "value": str(value),
                        "source_records": [{"table": "OffenderRiskScore", "record_id": accused_id}],
                    })

            edges.append({
                "id": f"risk_edge_{accused_id}",
                "source": person_node_id,
                "target": risk_node_id,
                "relationship": "has_risk_score",
                "relationship_label": f"Risk {score:.0f}/100",
                "strength": self._score_to_strength(score),
                "source_engine": "analytics_engine",
                "evidence": evidence,
            })

        return {
            "nodes": self._deduplicate_nodes(nodes),
            "edges": edges,
            "finding_summary": finding.get("description", ""),
            "evidence_strength": finding.get("strength", "unknown"),
            "sources": finding.get("evidence_sources", ["risk_profile"]),
        }

    # ──────────────────────────────────────────────────────────
    #  CASE LIST EVIDENCE GRAPH
    # ──────────────────────────────────────────────────────────

    def _build_case_list_graph(self, data: dict, finding: dict) -> dict:
        """Builds a simple case list evidence graph."""
        nodes = []
        edges = []
        cases = data.get("cases", [])

        for case in cases[:30]:  # Cap for performance
            case_id = case.get("casemasterid") or case.get("CaseMasterID")
            if not case_id:
                continue
            case_node_id = f"case_{case_id}"
            crime_no = case.get("crimeno") or case.get("CrimeNo") or f"Case #{case_id}"
            district = case.get("districtname") or case.get("DistrictName") or ""
            status = case.get("casestatusname") or case.get("CaseStatusName") or ""

            nodes.append({
                "id": case_node_id,
                "type": "case",
                "label": crime_no,
                "source": {"table": "CaseMaster", "record_id": case_id},
                "is_primary": False,
                "metadata": {
                    "district": district,
                    "status": status,
                },
            })

        return {
            "nodes": nodes,
            "edges": edges,
            "finding_summary": finding.get("description", ""),
            "evidence_strength": finding.get("strength", "unknown"),
            "sources": finding.get("evidence_sources", ["case_query"]),
        }

    # ──────────────────────────────────────────────────────────
    #  GENERIC / FALLBACK EVIDENCE GRAPH
    # ──────────────────────────────────────────────────────────

    def _build_generic_graph(self, data: dict, finding: dict) -> dict:
        """Generic fallback for finding types without dedicated builders."""
        return {
            "nodes": [],
            "edges": [],
            "finding_summary": finding.get("description", "No detailed evidence graph available for this finding type."),
            "evidence_strength": finding.get("strength", "none"),
            "sources": finding.get("evidence_sources", []),
        }

    # ──────────────────────────────────────────────────────────
    #  HELPERS
    # ──────────────────────────────────────────────────────────

    def _get_case_label(self, case_id: int) -> str:
        """Fetches CrimeNo for a case from the database."""
        if not self.db_url:
            return f"Case #{case_id}"
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            cur.execute("SELECT CrimeNo FROM CaseMaster WHERE CaseMasterID = %s", (case_id,))
            row = cur.fetchone()
            cur.close()
            conn.close()
            return row[0] if row else f"Case #{case_id}"
        except Exception:
            return f"Case #{case_id}"

    def _get_accused_label(self, accused_id: int) -> str:
        """Fetches AccusedName for an accused from the database."""
        if not self.db_url:
            return f"Accused #{accused_id}"
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            cur.execute("SELECT AccusedName FROM Accused WHERE AccusedMasterID = %s", (accused_id,))
            row = cur.fetchone()
            cur.close()
            conn.close()
            return row[0] if row else f"Accused #{accused_id}"
        except Exception:
            return f"Accused #{accused_id}"

    def _deduplicate_nodes(self, nodes: list) -> list:
        """Removes duplicate nodes by ID, keeping the first occurrence."""
        seen = set()
        result = []
        for node in nodes:
            if node["id"] not in seen:
                seen.add(node["id"])
                result.append(node)
        return result

    def _extract_number(self, text: str) -> Optional[float]:
        """Extracts the first number from a string."""
        import re
        match = re.search(r'(\d+\.?\d*)', text)
        return float(match.group(1)) if match else None

    def _score_to_strength(self, score: float) -> str:
        """Deterministic strength classification from a 0-100 score."""
        if score >= 70:
            return "strong"
        elif score >= 40:
            return "moderate"
        else:
            return "limited"

    def _weight_to_strength(self, weight: int) -> str:
        """Deterministic strength from network edge weight."""
        if weight >= 3:
            return "strong"
        elif weight >= 2:
            return "moderate"
        else:
            return "limited"

    def _relation_to_label(self, relation: str) -> str:
        """Converts relation type to human-readable label."""
        labels = {
            "co_accused": "Co-Accused in Same Case",
            "financial": "Financial Transaction Link",
            "repeat_identity": "Same Person Across Cases",
            "shared_mo": "Shared Modus Operandi Pattern",
            "victim_accused": "Victim-Accused Crossover",
        }
        return labels.get(relation, relation.replace("_", " ").title())
