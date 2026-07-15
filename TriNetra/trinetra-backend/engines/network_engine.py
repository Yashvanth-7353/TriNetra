import os
import psycopg2
import networkx as nx
import community as community_louvain
from collections import defaultdict


class NetworkEngine:
    """
    Deep Criminal Network Analysis Engine.
    
    Builds a multi-layered graph with 5 types of connections:
      1. Co-Accused (shared case)
      2. Financial Transactions (money flow between suspect accounts)
      3. Repeat Identity (same PersonID across different cases)
      4. Shared Modus Operandi (same MO tag across cases = indirect pattern link)
      5. Victim-Accused Crossover (victim in one case, accused in another)
    
    Uses NetworkX for traversal and community_louvain for cluster detection.
    """

    RELATION_LABELS = {
        "co_accused": "Co-Accused",
        "financial": "Money Trail",
        "repeat_identity": "Same Person",
        "shared_mo": "Same MO Pattern",
        "victim_accused": "Victim↔Accused",
    }

    def __init__(self):
        self.db_url = os.getenv("NEON_DATABASE_URL")
        self._graph_cache = None
        self._node_metadata = {}       # id -> {name, age, gender, cases:[]}
        self._edge_case_map = {}       # (n1,n2) -> [{case_id, relation, detail}]

    def _get_conn(self):
        return psycopg2.connect(self.db_url)

    # ══════════════════════════════════════════════
    #  GRAPH CONSTRUCTION
    # ══════════════════════════════════════════════

    def build_graph(self, force_refresh=False, active_layers=None):
        """Builds the full multi-layer criminal network graph, filtered by active layers."""
        if active_layers is None:
            active_layers = ["co_accused", "financial", "repeat_identity", "shared_mo", "victim_accused"]

        # Cache key based on active layers
        cache_key = tuple(sorted(active_layers))
        if self._graph_cache and self._graph_cache.get("key") == cache_key and not force_refresh:
            return self._graph_cache["graph"]

        conn = self._get_conn()
        cur = conn.cursor()
        G = nx.Graph()
        self._node_metadata = {}
        self._edge_case_map = defaultdict(list)

        # ── Load all accused into metadata ──
        cur.execute("""
            SELECT a.AccusedMasterID, a.AccusedName, a.AgeYear, a.GenderID,
                   a.PersonID, a.CaseMasterID
            FROM Accused a
        """)
        accused_by_id = {}
        for row in cur.fetchall():
            aid, name, age, gender, pid, case_id = row
            nid = f"A{aid}"
            accused_by_id[aid] = row
            if nid not in self._node_metadata:
                self._node_metadata[nid] = {
                    "accused_id": aid,
                    "name": name,
                    "age": age,
                    "gender_id": gender,
                    "person_id": pid,
                    "cases": [],
                }
            self._node_metadata[nid]["cases"].append(case_id)

        # ── Layer 1: Co-Accused Links ──
        if "co_accused" in active_layers:
            cur.execute("""
                SELECT a1.AccusedMasterID, a2.AccusedMasterID, a1.CaseMasterID,
                       a1.AccusedName, a2.AccusedName
                FROM Accused a1
                JOIN Accused a2 ON a1.CaseMasterID = a2.CaseMasterID
                WHERE a1.AccusedMasterID < a2.AccusedMasterID
            """)
            for a1, a2, cid, name1, name2 in cur.fetchall():
                n1, n2 = f"A{a1}", f"A{a2}"
                if n1 not in G:
                    G.add_node(n1, label=name1, type="accused")
                if n2 not in G:
                    G.add_node(n2, label=name2, type="accused")
                edge_key = tuple(sorted([n1, n2]))
                if not G.has_edge(n1, n2):
                    G.add_edge(n1, n2, relation="co_accused", case=cid, weight=1)
                else:
                    G[n1][n2]["weight"] = G[n1][n2].get("weight", 1) + 1
                self._edge_case_map[edge_key].append({
                    "case_id": cid, "relation": "co_accused",
                    "detail": f"Co-accused in Case #{cid}"
                })

        # ── Layer 2: Financial Links ──
        if "financial" in active_layers:
            cur.execute("""
                SELECT sa1.AccusedMasterID, sa2.AccusedMasterID,
                       ft.CaseMasterID, ft.Amount, ft.Flagged
                FROM FinancialTransaction ft
                JOIN SuspectAccount sa1 ON ft.FromAccountID = sa1.AccountID
                JOIN SuspectAccount sa2 ON ft.ToAccountID = sa2.AccountID
                WHERE sa1.AccusedMasterID IS NOT NULL
                  AND sa2.AccusedMasterID IS NOT NULL
                  AND sa1.AccusedMasterID != sa2.AccusedMasterID
            """)
            for a1, a2, cid, amount, flagged in cur.fetchall():
                n1, n2 = f"A{a1}", f"A{a2}"
                if n1 not in G:
                    G.add_node(n1, label=accused_by_id.get(a1, [None, f"Accused {a1}"])[1], type="accused")
                if n2 not in G:
                    G.add_node(n2, label=accused_by_id.get(a2, [None, f"Accused {a2}"])[1], type="accused")
                edge_key = tuple(sorted([n1, n2]))
                if not G.has_edge(n1, n2):
                    G.add_edge(n1, n2, relation="financial", case=cid, weight=2)
                else:
                    G[n1][n2]["weight"] = G[n1][n2].get("weight", 1) + 2
                flag_str = " [FLAGGED]" if flagged else ""
                self._edge_case_map[edge_key].append({
                    "case_id": cid, "relation": "financial",
                    "detail": f"₹{amount:,.0f} transfer in Case #{cid}{flag_str}"
                })

        # ── Layer 3: Repeat Identity (same PersonID across cases) ──
        if "repeat_identity" in active_layers:
            # Exclude top high-frequency generic/placeholder PersonIDs (like 'A1', 'A2', 'A3', 'A4')
            # only match real IDs to avoid giant false hubs.
            cur.execute("""
                SELECT a1.AccusedMasterID, a2.AccusedMasterID,
                       a1.CaseMasterID, a2.CaseMasterID,
                       a1.AccusedName, a1.PersonID
                FROM Accused a1
                JOIN Accused a2 ON a1.PersonID = a2.PersonID
                WHERE a1.PersonID IS NOT NULL
                  AND a1.PersonID NOT IN ('A1', 'A2', 'A3', 'A4', 'A5')
                  AND a1.AccusedMasterID < a2.AccusedMasterID
                  AND a1.CaseMasterID != a2.CaseMasterID
            """)
            seen_repeat = set()
            for a1, a2, c1, c2, name, pid in cur.fetchall():
                n1, n2 = f"A{a1}", f"A{a2}"
                pair = tuple(sorted([n1, n2]))
                if pair in seen_repeat:
                    continue
                seen_repeat.add(pair)
                if n1 not in G:
                    G.add_node(n1, label=name, type="accused")
                if n2 not in G:
                    G.add_node(n2, label=name, type="accused")
                if not G.has_edge(n1, n2):
                    G.add_edge(n1, n2, relation="repeat_identity", case=c1, weight=3)
                self._edge_case_map[pair].append({
                    "case_id": c1, "relation": "repeat_identity",
                    "detail": f"Same person ({pid}) in Cases #{c1} and #{c2}"
                })

        # ── Layer 4: Shared Modus Operandi (indirect MO pattern link) ──
        if "shared_mo" in active_layers:
            # Only pick rare MO tags (shared by fewer cases) to avoid explosion
            cur.execute("""
                SELECT m1.CaseMasterID, m2.CaseMasterID, m1.MOTagID,
                       mt.MOTagName, mt.MOCategory
                FROM ModusOperandi m1
                JOIN ModusOperandi m2 ON m1.MOTagID = m2.MOTagID
                JOIN MOTagMaster mt ON m1.MOTagID = mt.MOTagID
                WHERE m1.CaseMasterID < m2.CaseMasterID
                  AND m1.Confidence >= 0.7
                  AND m2.Confidence >= 0.7
                  AND m1.MOTagID IN (
                      SELECT MOTagID FROM ModusOperandi
                      GROUP BY MOTagID HAVING COUNT(DISTINCT CaseMasterID) <= 15
                  )
                LIMIT 1000
            """)
            mo_case_pairs = defaultdict(list)
            for c1, c2, mo_id, mo_name, mo_cat in cur.fetchall():
                mo_case_pairs[(c1, c2)].append({"mo_id": mo_id, "mo_name": mo_name, "mo_cat": mo_cat})

            case_to_accused = defaultdict(list)
            for aid, row in accused_by_id.items():
                case_to_accused[row[5]].append(aid)

            mo_edge_count = 0
            for (c1, c2), mo_list in mo_case_pairs.items():
                accused_c1 = case_to_accused.get(c1, [])
                accused_c2 = case_to_accused.get(c2, [])
                if not accused_c1 or not accused_c2:
                    continue
                a1 = accused_c1[0]
                a2 = accused_c2[0]
                if a1 == a2:
                    continue
                n1, n2 = f"A{a1}", f"A{a2}"
                edge_key = tuple(sorted([n1, n2]))
                if n1 not in G:
                    G.add_node(n1, label=accused_by_id.get(a1, [None, f"Accused {a1}"])[1], type="accused")
                if n2 not in G:
                    G.add_node(n2, label=accused_by_id.get(a2, [None, f"Accused {a2}"])[1], type="accused")
                if not G.has_edge(n1, n2):
                    G.add_edge(n1, n2, relation="shared_mo", case=c1, weight=1)
                    mo_edge_count += 1
                mo_names = ", ".join(set(m["mo_name"] for m in mo_list))
                self._edge_case_map[edge_key].append({
                    "case_id": c1, "relation": "shared_mo",
                    "detail": f"Shared MO: {mo_names} (Cases #{c1}, #{c2})"
                })
                if mo_edge_count > 1000:
                    break

        # ── Layer 5: Victim-Accused Crossover ──
        if "victim_accused" in active_layers:
            cur.execute("""
                SELECT DISTINCT v.VictimName, v.CaseMasterID AS victim_case,
                       a.AccusedMasterID, a.CaseMasterID AS accused_case,
                       a.AccusedName
                FROM Victim v
                JOIN Accused a ON LOWER(TRIM(v.VictimName)) = LOWER(TRIM(a.AccusedName))
                WHERE v.CaseMasterID != a.CaseMasterID
                LIMIT 500
            """)
            case_to_accused = defaultdict(list)
            for aid, row in accused_by_id.items():
                case_to_accused[row[5]].append(aid)

            for vname, v_case, a_id, a_case, aname in cur.fetchall():
                victim_case_accused = case_to_accused.get(v_case, [])
                if not victim_case_accused:
                    continue
                for vc_aid in victim_case_accused[:1]:
                    if vc_aid == a_id:
                        continue
                    n1, n2 = f"A{vc_aid}", f"A{a_id}"
                    edge_key = tuple(sorted([n1, n2]))
                    if n1 not in G:
                        G.add_node(n1, label=accused_by_id.get(vc_aid, [None, f"Accused {vc_aid}"])[1], type="accused")
                    if n2 not in G:
                        G.add_node(n2, label=aname, type="accused")
                    if not G.has_edge(n1, n2):
                        G.add_edge(n1, n2, relation="victim_accused", case=v_case, weight=2)
                    self._edge_case_map[edge_key].append({
                        "case_id": v_case, "relation": "victim_accused",
                        "detail": f"{vname}: victim in Case #{v_case}, accused in Case #{a_case}"
                    })

        cur.close()
        conn.close()
        self._graph_cache = {
            "key": cache_key,
            "graph": G
        }
        print(f"[NetworkEngine] Graph built: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges for layers {active_layers}")
        return G

    # ══════════════════════════════════════════════
    #  SEARCH (by name or ID)
    # ══════════════════════════════════════════════

    def search_accused(self, query: str, limit: int = 15) -> list:
        """Searches accused by name or ID. Returns candidate list for the search box."""
        conn = self._get_conn()
        cur = conn.cursor()

        results = []

        # Try numeric ID first
        if query.strip().isdigit():
            accused_id = int(query.strip())
            cur.execute("""
                SELECT a.AccusedMasterID, a.AccusedName, a.AgeYear, a.GenderID,
                       d.DistrictName, cm.CrimeNo,
                       (SELECT COUNT(*) FROM Accused a2 WHERE a2.PersonID = a.PersonID AND a.PersonID IS NOT NULL) as case_count
                FROM Accused a
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                LEFT JOIN District d ON u.DistrictID = d.DistrictID
                WHERE a.AccusedMasterID = %s
            """, (accused_id,))
        else:
            # Name search
            cur.execute("""
                SELECT a.AccusedMasterID, a.AccusedName, a.AgeYear, a.GenderID,
                       d.DistrictName, cm.CrimeNo,
                       (SELECT COUNT(*) FROM Accused a2 WHERE a2.PersonID = a.PersonID AND a.PersonID IS NOT NULL) as case_count
                FROM Accused a
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                LEFT JOIN District d ON u.DistrictID = d.DistrictID
                WHERE a.AccusedName ILIKE %s
                ORDER BY case_count DESC, a.AccusedMasterID
                LIMIT %s
            """, (f"%{query.strip()}%", limit))

        for row in cur.fetchall():
            results.append({
                "accused_id": row[0],
                "name": row[1],
                "age": row[2],
                "gender_id": row[3],
                "district": row[4],
                "crime_no": row[5],
                "linked_cases": row[6] or 1,
            })

        cur.close()
        conn.close()
        return results

    # ══════════════════════════════════════════════
    #  NETWORK TRAVERSAL
    # ══════════════════════════════════════════════

    def get_network(self, accused_id: int, max_hops: int = 2, active_layers=None) -> dict:
        """
        Returns the N-hop neighborhood graph for a specific accused,
        with community detection and full edge metadata.
        """
        G = self.build_graph(active_layers=active_layers)
        start_node = f"A{accused_id}"

        if start_node not in G:
            return {"error": f"Accused ID {accused_id} not found in network graph."}

        # N-hop subgraph extraction
        subgraph_nodes = list(
            nx.single_source_shortest_path_length(G, start_node, cutoff=max_hops).keys()
        )
        sub = G.subgraph(subgraph_nodes).copy()

        # Community detection on the subgraph
        communities = {}
        if sub.number_of_nodes() > 1:
            try:
                communities = community_louvain.best_partition(sub, random_state=42)
            except Exception:
                communities = {n: 0 for n in sub.nodes()}
        else:
            communities = {n: 0 for n in sub.nodes()}

        # Distance from start node
        distances = nx.single_source_shortest_path_length(G, start_node, cutoff=max_hops)

        # Build node payload
        nodes = []
        for n in sub.nodes():
            meta = self._node_metadata.get(n, {})
            nodes.append({
                "id": n,
                "label": sub.nodes[n].get("label", meta.get("name", n)),
                "type": sub.nodes[n].get("type", "accused"),
                "community": communities.get(n, 0),
                "distance": distances.get(n, 99),
                "accused_id": meta.get("accused_id"),
                "age": meta.get("age"),
                "gender_id": meta.get("gender_id"),
                "case_count": len(set(meta.get("cases", []))),
                "is_root": n == start_node,
            })

        # Build edge payload with case details
        edges = []
        for u, v, d in sub.edges(data=True):
            edge_key = tuple(sorted([u, v]))
            case_details = self._edge_case_map.get(edge_key, [])
            # Deduplicate by relation
            seen_relations = set()
            unique_details = []
            for cd in case_details:
                rel_key = (cd["relation"], cd.get("case_id"))
                if rel_key not in seen_relations:
                    seen_relations.add(rel_key)
                    unique_details.append(cd)

            edges.append({
                "from": u,
                "to": v,
                "relation": d.get("relation", "unknown"),
                "relation_label": self.RELATION_LABELS.get(d.get("relation", ""), d.get("relation", "")),
                "weight": d.get("weight", 1),
                "case_id": d.get("case", None),
                "details": unique_details[:10],  # Cap detail list
            })

        # Stats
        relation_counts = defaultdict(int)
        for e in edges:
            relation_counts[e["relation"]] += 1

        num_communities = len(set(communities.values())) if communities else 0

        return {
            "nodes": nodes,
            "edges": edges,
            "root_node": start_node,
            "stats": {
                "node_count": len(nodes),
                "edge_count": len(edges),
                "community_count": num_communities,
                "relation_breakdown": dict(relation_counts),
            },
        }

    # ══════════════════════════════════════════════
    #  NODE DETAIL (for side panel)
    # ══════════════════════════════════════════════

    def get_node_detail(self, accused_id: int, active_layers=None) -> dict:
        """Returns detailed info about a specific accused for the side panel."""
        conn = self._get_conn()
        cur = conn.cursor()

        # Basic info
        cur.execute("""
            SELECT a.AccusedMasterID, a.AccusedName, a.AgeYear, a.GenderID, a.PersonID,
                   cm.CaseMasterID, cm.CrimeNo, cm.CrimeRegisteredDate,
                   d.DistrictName, u.UnitName,
                   csm.CaseStatusName, ch.CrimeGroupName, csh.CrimeHeadName
            FROM Accused a
            JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
            JOIN Unit u ON cm.PoliceStationID = u.UnitID
            LEFT JOIN District d ON u.DistrictID = d.DistrictID
            LEFT JOIN CaseStatusMaster csm ON cm.CaseStatusID = csm.CaseStatusID
            LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
            LEFT JOIN CrimeSubHead csh ON cm.CrimeMinorHeadID = csh.CrimeSubHeadID
            WHERE a.AccusedMasterID = %s
        """, (accused_id,))
        row = cur.fetchone()

        if not row:
            cur.close()
            conn.close()
            return {"error": f"Accused ID {accused_id} not found."}

        person_id = row[4]
        main_case_id = row[5]

        # All cases for this person (via PersonID)
        cases = []
        if person_id:
            cur.execute("""
                SELECT DISTINCT a.AccusedMasterID, cm.CaseMasterID, cm.CrimeNo,
                       cm.CrimeRegisteredDate, d.DistrictName,
                       csm.CaseStatusName, ch.CrimeGroupName
                FROM Accused a
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                LEFT JOIN District d ON u.DistrictID = d.DistrictID
                LEFT JOIN CaseStatusMaster csm ON cm.CaseStatusID = csm.CaseStatusID
                LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
                WHERE a.PersonID = %s
                ORDER BY cm.CrimeRegisteredDate DESC
            """, (person_id,))
        else:
            cur.execute("""
                SELECT a.AccusedMasterID, cm.CaseMasterID, cm.CrimeNo,
                       cm.CrimeRegisteredDate, d.DistrictName,
                       csm.CaseStatusName, ch.CrimeGroupName
                FROM Accused a
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                LEFT JOIN District d ON u.DistrictID = d.DistrictID
                LEFT JOIN CaseStatusMaster csm ON cm.CaseStatusID = csm.CaseStatusID
                LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
                WHERE a.AccusedMasterID = %s
            """, (accused_id,))

        for r in cur.fetchall():
            cases.append({
                "accused_id": r[0],
                "case_id": r[1],
                "crime_no": r[2],
                "date": str(r[3]) if r[3] else None,
                "district": r[4],
                "status": r[5],
                "crime_type": r[6],
            })

        # Financial accounts
        cur.execute("""
            SELECT sa.AccountNumber, sa.BankName
            FROM SuspectAccount sa
            WHERE sa.AccusedMasterID = %s
        """, (accused_id,))
        accounts = [{"account": r[0], "bank": r[1]} for r in cur.fetchall()]

        # Modus Operandi
        cur.execute("""
            SELECT DISTINCT mt.MOTagName, mt.MOCategory, mo.Confidence
            FROM ModusOperandi mo
            JOIN MOTagMaster mt ON mo.MOTagID = mt.MOTagID
            JOIN Accused a ON mo.CaseMasterID = a.CaseMasterID
            WHERE a.AccusedMasterID = %s
            ORDER BY mo.Confidence DESC
        """, (accused_id,))
        modus_operandi = [{"tag": r[0], "category": r[1], "confidence": float(r[2]) if r[2] else None} for r in cur.fetchall()]

        # Risk score
        cur.execute("""
            SELECT RiskScore, RepeatOffenderFlag, TopFactors
            FROM OffenderRiskScore
            WHERE AccusedMasterID = %s
        """, (accused_id,))
        risk_row = cur.fetchone()
        risk = None
        if risk_row:
            risk = {
                "score": float(risk_row[0]),
                "repeat_offender": bool(risk_row[1]),
                "factors": risk_row[2],
            }

        # Connected neighbors from graph
        G = self.build_graph(active_layers=active_layers)
        node_id = f"A{accused_id}"
        neighbors = []
        if node_id in G:
            for neighbor in G.neighbors(node_id):
                n_meta = self._node_metadata.get(neighbor, {})
                edge_data = G[node_id][neighbor]
                edge_key = tuple(sorted([node_id, neighbor]))
                edge_details = self._edge_case_map.get(edge_key, [])
                neighbors.append({
                    "id": neighbor,
                    "accused_id": n_meta.get("accused_id"),
                    "name": n_meta.get("name", G.nodes[neighbor].get("label", neighbor)),
                    "relation": edge_data.get("relation"),
                    "relation_label": self.RELATION_LABELS.get(edge_data.get("relation", ""), ""),
                    "details": edge_details[:5],
                })

        cur.close()
        conn.close()

        return {
            "accused_id": row[0],
            "name": row[1],
            "age": row[2],
            "gender_id": row[3],
            "person_id": person_id,
            "cases": cases,
            "accounts": accounts,
            "modus_operandi": modus_operandi,
            "risk": risk,
            "neighbors": neighbors[:20],
            "total_cases": len(cases),
            "total_neighbors": len(neighbors),
        }
