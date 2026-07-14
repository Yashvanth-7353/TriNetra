This documentation summarizes the current architecture, implementation logic, and technical design of **TriNetra**. This file serves as the definitive technical reference for the current codebase state.

---

# TriNetra: Technical Implementation & Architecture Documentation

**Date:** July 14, 2026 | **Status:** Milestones 1, 2, 3, & 6 Complete

## 1. High-Level System Architecture

TriNetra is a decoupled **Orchestration Router Model** that delegates analytical tasks to specialized engines. It avoids "God-mode" LLM prompting by separating relational retrieval, semantic search, and relationship mapping.

---

## 2. Implementation Modules

### A. Intent Router (`engines/router.py`)

TriNetra utilizes a **Contextual Rewriter Pattern**. Instead of feeding raw chat logs to an engine, the `IntentRouter` first rewrites ambiguous queries (e.g., "Summarize *his* cases") into standalone, entity-rich queries ("Summarize the cases of Accused 104").

* **Mechanism:** Groq Llama-3.3-70b-versatile handles intent classification via JSON mode, ensuring the backend always routes to the correct engine (`factual_lookup`, `narrative_rag`, `criminal_network`, etc.).

### B. Security & RBAC (`engines/security.py`)

Security is implemented via **Defense-in-Depth**:

* **Database Level:** The backend connects using a `trinetra_readonly` role, which is physically incapable of `DROP`, `DELETE`, or `UPDATE` operations.
* **Middleware Level:** The `SecurityContext` engine dynamically injects mandatory `WHERE` clauses (e.g., `AND cm.PoliceStationID = X`) into the SQL generator based on the investigator's role, ensuring row-level multi-tenancy.
* **Audit Trail:** Every interaction is committed to the `QueryAuditLog` table, capturing the raw input, engine used, resolved SQL, and rows returned.

### C. NL2SQL Engine (`engines/nl2sql.py`)

This engine bridges natural language to PostgreSQL.

* **Self-Repair Loop:** If a generated query fails, the backend captures the database error, feeds it back into the LLM with the original prompt, and allows the model to "self-correct" the query architecture.
* **Guardrails:** It enforces `LIMIT 200` to prevent data dumps and regex-filters for multi-statement injection (`';'`) to prevent SQL injection.

### D. RAG Engine (`engines/rag.py`)

Provides semantic discovery over narrative text (`BriefFacts`).

* **Embeddings:** Uses `gemini-embedding-001` configured for **768 dimensions**, perfectly matching the `vector(768)` table definition in Neon.
* **Hybrid Search:** Performs cosine similarity matching (`<=>`) using `pgvector` to identify the top 3 crime narratives, which are then synthesized by Llama-3.3 into professional intelligence briefs.

### E. Graph Engine (`engines/graph.py`)

Maps complex criminal relationships using `networkx`.

* **Traversal:** Computes a 2-hop neighborhood starting from a specific `AccusedMasterID`.
* **Relationships:** Connects nodes based on `Co-Accused` (shared FIRs) and `Financial Links` (money transfers).
* **Visualization:** Outputs a JSON structure (Nodes/Edges) mapped 1:1 to React Flow for interactive mapping.

---

## 3. Technical Stack

| Tier | Technology | Purpose |
| --- | --- | --- |
| **Frontend** | React + TypeScript + React Flow | UI Shell + Interactive Network Mapping |
| **Backend** | FastAPI (Python) | Orchestration, Security, Audit Logging |
| **Database** | Neon PostgreSQL | Relational storage + `pgvector` index |
| **Intelligence** | Groq Llama-3.3-70b | Query rewriting, SQL generation, synthesis |
| **Embeddings** | Google GenAI `gemini-embedding-001` | Narrative vectorization |

---

## 4. Verification Benchmarks

| Milestone | Capability | Verification Metric |
| --- | --- | --- |
| **1: NL2SQL** | Multi-table joins | Verified: Bengaluru cases correctly join across 4 tables. |
| **2: RAG** | Fuzzy narrative search | Verified: "breaking a rear window" returns accurate narratives. |
| **3: Graph** | 2-hop traversal | Verified: Accused ID 104 maps its full syndicate cluster. |
| **6: Security** | RBAC Enforcement | Verified: Investigator/Supervisor receive filtered data outputs. |

---

## 5. Development Roadmap: Milestone 4 & 5

* **Milestone 4 (Analytics):** Implementation of Trend/Hotspot API endpoints using the `AnalyticsEngine`.
* **Milestone 5 (Polish):** Frontend PDF export (using `jsPDF`) and multilingual translation-first wrapper.

---

*Documentation maintained by TriNetra Core Engine.*