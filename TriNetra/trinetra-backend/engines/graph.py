import os
import psycopg2
import networkx as nx
import community as community_louvain

class GraphEngine:
    def __init__(self):
        self.db_url = os.getenv("NEON_DATABASE_URL")
        self._graph_cache = None

    def build_graph(self, force_refresh=False):
        """Builds a NetworkX graph connecting Accused entities via Cases and Finances."""
        if self._graph_cache and not force_refresh:
            return self._graph_cache
            
        conn = psycopg2.connect(self.db_url)
        cur = conn.cursor()
        G = nx.Graph()
        
        # 1. Co-Accused Links (Individuals sharing the same FIR)
        cur.execute("""
            SELECT a1.AccusedMasterID, a2.AccusedMasterID, a1.CaseMasterID, a1.AccusedName, a2.AccusedName
            FROM Accused a1 
            JOIN Accused a2 ON a1.CaseMasterID = a2.CaseMasterID 
            WHERE a1.AccusedMasterID < a2.AccusedMasterID
        """)
        for a1, a2, cid, name1, name2 in cur.fetchall():
            n1, n2 = f"A{a1}", f"A{a2}"
            if n1 not in G: G.add_node(n1, label=name1, type="accused")
            if n2 not in G: G.add_node(n2, label=name2, type="accused")
            G.add_edge(n1, n2, relation="co_accused", case=cid)
            
        # 2. Financial Links (Individuals transferring money)
        cur.execute("""
            SELECT sa1.AccusedMasterID, sa2.AccusedMasterID, ft.CaseMasterID
            FROM FinancialTransaction ft
            JOIN SuspectAccount sa1 ON ft.FromAccountID = sa1.AccountID
            JOIN SuspectAccount sa2 ON ft.ToAccountID = sa2.AccountID
            WHERE sa1.AccusedMasterID IS NOT NULL AND sa2.AccusedMasterID IS NOT NULL
        """)
        for a1, a2, cid in cur.fetchall():
            if a1 == a2: continue
            n1, n2 = f"A{a1}", f"A{a2}"
            if n1 not in G: G.add_node(n1, label=f"Accused {a1}", type="accused")
            if n2 not in G: G.add_node(n2, label=f"Accused {a2}", type="accused")
            G.add_edge(n1, n2, relation="financial_link", case=cid)
            
        cur.close()
        conn.close()
        self._graph_cache = G
        return G

    def network_for_accused(self, accused_id: int, max_hops=2) -> dict:
        """Executes a 2-hop neighborhood traversal around a specific criminal."""
        G = self.build_graph()
        start_node = f"A{accused_id}"
        
        if start_node not in G:
            return {"nodes": [], "edges": [], "error": f"No network data available for Accused ID {accused_id}."}
            
        # Find all nodes within 2 hops
        subgraph_nodes = list(nx.single_source_shortest_path_length(G, start_node, cutoff=max_hops).keys())
        sub = G.subgraph(subgraph_nodes)
        
        # Format payload for frontend mapping (React Flow compatible)
        nodes = [{"id": n, "label": sub.nodes[n].get("label", n)} for n in sub.nodes()]
        edges = [{"from": u, "to": v, "relation": d["relation"], "case": d.get("case", "N/A")} for u, v, d in sub.edges(data=True)]
        
        return {"nodes": nodes, "edges": edges}