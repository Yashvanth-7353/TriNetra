# TriNetra Technical Implementation Architecture

This document provides a comprehensive technical breakdown of the TriNetra Case Intelligence Orchestrator. It details the implemented components, APIs, algorithms, AI integration logic, data models, and security workflows based strictly on the source code.

---

## 1. System Architecture Overview

TriNetra is built on a modern decoupled architecture:
- **Frontend Layer:** A React 19 Single Page Application (SPA) built with TypeScript and Vite. It leverages TailwindCSS for styling, React Flow for network graph visualization, Recharts for analytics, and Leaflet for geospatial mapping.
- **Backend API Layer:** A high-performance asynchronous API built on Python 3 using FastAPI.
- **Database Layer:** A PostgreSQL database (hosted on Neon) serving as the primary relational data store and vector database (using `pgvector`).
- **AI / LLM Layer:** 
  - **Orchestration & Text Generation:** Groq API using `llama-3.3-70b-versatile` for extremely fast zero-shot reasoning, NL2SQL generation, and RAG synthesis.
  - **Embeddings:** Google Generative AI (`gemini-embedding-001`) via the new `google-genai` SDK for generating 768-dimensional vector embeddings of case narratives.

---

## 2. Database Schema & Models

The PostgreSQL database follows a highly normalized structure designed to map law enforcement hierarchy and crime structures:

### Core Case & Geographic Models
- **Unit & District:** Maps hierarchical jurisdictions (`PoliceStationID` maps to `UnitID`, which maps to `DistrictID`).
- **CaseMaster:** The central entity storing `CrimeNo`, `CrimeRegisteredDate`, `BriefFacts`, geospatial coordinates (`Latitude`, `Longitude`), and foreign keys to status, category, unit, and court.
- **Lookup Tables:** `CaseStatusMaster`, `CaseCategory`, `CrimeHead`, `CrimeSubHead`, `GravityOffence`.

### Investigation Entities
- **Accused, Victim, ComplainantDetails:** Links individuals to specific `CaseMasterID`s.
- **ArrestSurrender, ChargeSheetDetails, CaseStatusHistory:** Temporal tracking of the case lifecycle.
- **OffenderRiskScore:** Precomputed risk scores, repeat offender flags, and top contributing factors (stored as JSON) for individuals.
- **FinancialTransaction & SuspectAccount:** Tracks money flows between entities.
- **ModusOperandi & MOTagMaster:** Maps behavioral tags to cases with confidence scores.

### AI & Security Models
- **CaseNarrativeEmbedding:** Stores the `CaseMasterID` and a 768-dimensional `EmbeddingVector` (pgvector).
- **Employee & EmployeeCredentials:** Stores personnel data, ranks, and bcrypt password hashes.
- **QueryAuditLog:** An append-only table storing the exact user, prompt, mapped engine, executed SQL, and row count for every LLM-generated query.

---

## 3. Backend Implementation (FastAPI)

The backend (`app.py`) exposes REST endpoints that delegate heavy processing to modular "engines".

### 3.1 Authentication & Security (`auth.py`, `security.py`)
TriNetra uses state-less JWT authentication with explicit Role-Based Access Control (RBAC).

- **Authentication Flow:** User submits `EmployeeID` and plaintext password. The backend queries `EmployeeCredentials`, verifies the bcrypt hash, and fetches the profile via a massive multi-table JOIN.
- **Rank-to-Role Mapping:** Ranks (e.g., DGP, SP, Inspector) are mapped to 4 core RBAC roles: `Policymaker`, `Analyst`, `Supervisor`, and `Investigator`.
- **JWT Issuance:** A PyJWT token is minted with an HS256 signature containing the user's role, district, and unit IDs.
- **SQL RBAC Injection:** `SecurityContext.build_rbac_filter()` dynamically generates a mandatory SQL `WHERE` clause string based on the user's role. For example, an Investigator gets `cm.PoliceStationID = {unit_id}`, ensuring row-level security before the database execution step.
- **Immutable Audit Logging:** `SecurityContext.log_audit()` logs the natural language query, resolved SQL, and metadata into the `QueryAuditLog` table.

### 3.2 Conversational AI Orchestrator (`router.py`)
The `IntentRouter` acts as the system's brain.
- **Query Rewriting:** Condenses recent conversation history and pronoun-heavy user input into a highly specific, standalone query using Groq (`rewrite_to_standalone`).
- **Intent Classification:** Forces the LLM to output a JSON object categorizing the query into one of 5 strict execution paths: `factual_lookup`, `criminal_network`, `trend_analysis`, `risk_profile`, or `narrative_rag`.
- **Parameter Extraction:** Extracts specific entities (e.g., Accused ID integers) via regex parsing over the LLM output.

### 3.3 Natural Language to SQL (NL2SQL) Engine (`nl2sql.py`)
Handles `factual_lookup` queries.
- **Prompt Engineering:** Passes a minimized `SCHEMA MAP` and `JOIN INSTRUCTIONS` with few-shot examples to the Groq LLM.
- **Mandatory Security Constraint:** Forcefully injects the `rbac_filter` into the prompt to ensure the LLM generates a secure `WHERE` clause.
- **4-Tier Execution Guardrails:** Before execution, the generated SQL passes through rigid regex checks:
  1. Multi-statement rejection (blocks injection).
  2. Read-operation enforcement (must start with `select`).
  3. Table Whitelist validation (must only hit `casemaster`, `district`, etc.).
  4. Automatic `LIMIT 200` enforcement to prevent memory exhaustion.
- **Self-Repair Loop:** If the database throws a SQL syntax error, the engine intercepts it, passes the error back to Groq, and attempts a single retry (`recompiled_sql`).

### 3.4 Retrieval-Augmented Generation (RAG) Engine (`rag.py`)
Handles `narrative_rag` queries focusing on unstructured `BriefFacts`.
- **Embedding Generation:** Uses `google.genai` SDK (`gemini-embedding-001`) to vectorize the standalone query into 768 dimensions.
- **Vector Search:** Connects directly to PostgreSQL using the `<=>` operator (cosine distance) to find the 3 nearest `CaseNarrativeEmbedding` vectors.
- **Synthesis:** Extracts the ground-truth FIR narratives, packages them into a strict prompt, and uses Groq (`llama-3.3-70b-versatile`) to generate a precise answer with citations.

### 3.5 Graph & Network Engine (`network_engine.py`, `graph.py`)
Builds complex visual representations of criminal syndicates.
- **Graph Construction (NetworkX):** Nodes are `Accused` entities. Edges are weighted and constructed from 5 specific data layers:
  1. `co_accused`: Shared `CaseMasterID`.
  2. `financial`: Money transfers between `SuspectAccount`s.
  3. `repeat_identity`: Nodes sharing the same explicit `PersonID` across different cases.
  4. `shared_mo`: Cases sharing rare `MOTagID`s with >0.7 confidence.
  5. `victim_accused`: Name string matches where a victim in one case is an accused in another.
- **Traversal & Clustering:** Extracts an N-hop subgraph around a target node (`nx.single_source_shortest_path_length`). Uses the `community_louvain` heuristic algorithm to detect distinct criminal clusters/gangs within the subgraph.

### 3.6 Analytics Engine (`analytics.py`)
Handles statistical querying (`trend_analysis` and `risk_profile` intents, plus standalone dashboards).
- **Direct SQL Aggregation:** Aggregates cases temporally (`TO_CHAR(CrimeRegisteredDate, 'YYYY-MM')`) and geospatially.
- **Alert Generation:** Implements logic for "Sudden Spike Analysis" (comparing the last 4 weeks to a 24-week baseline) and "Historical Seasonal Analysis" (comparing current month to historical averages of the same month) to generate prevention alerts.

### 3.7 Case Explorer Engine (`case_explorer.py`)
A highly optimized, non-LLM SQL engine backing the manual Case Explorer dashboard.
- Uses dynamic query builders for paginated (`LIMIT`/`OFFSET`), multi-filtered search.
- Aggregates massive hierarchical payloads (status history, victims, complainants, chargesheets, arrests) into a single nested JSON response for the detail drawer.

### 3.8 Chat Session Export (`app.py`)
The `/api/chat/export` endpoint compiles the chat history, detected intents, extracted graph sub-structures, analytics tables, and citations into a single, beautifully styled, self-contained HTML file (using Tailwind CDN) configured for PDF printing.

---

## 4. Frontend Implementation (React & Vite)

### 4.1 Routing & Layout
- Managed via `react-router-dom`. Public routes (`/`, `/login`) are separated from authenticated routes, which are wrapped in an `<AppShell>` component that provides the global sidebar/navigation.

### 4.2 Key Pages & State
- **Ask TriNetra (`AskTriNetra.tsx`):** The conversational interface. It maintains an active message thread. Based on the JSON payload returned by the backend (`intent_detected`, `graph_data`, `analytics_data`, `citations`), the UI conditionally renders React Flow graph components or Recharts trend charts directly inside the chat bubbles.
- **Network Analysis (`NetworkAnalysis.tsx`):** A dedicated fullscreen visualization utilizing `reactflow`. Nodes and edges fetched from `network_engine.py` are mapped to custom visual components. Louvain communities are color-coded.
- **Case Explorer (`CaseExplorer.tsx`):** Uses data tables and dropdown filters mapping directly to `case_explorer.py`.
- **Crime Analytics & Alerts:** Utilize `recharts` for bar/line graphs representing the statistical payloads from `analytics.py`.

---

## 5. Deployment & Setup

### Environment Variables
The system requires specific secrets defined in `trinetra-backend/.env`:
```env
NEON_DATABASE_URL="postgresql://user:pass@host/dbname"
GROQ_API_KEY="gsk_..."
GEMINI_API_KEY="AIza..."
JWT_SECRET="secure_random_string"
```

### Dependency Stack
- **Backend:** `uvicorn`, `fastapi`, `psycopg2-binary`, `groq`, `google-genai`, `networkx`, `python-louvain`, `bcrypt`, `PyJWT`.
- **Frontend:** `react`, `react-dom`, `vite`, `tailwindcss`, `reactflow`, `recharts`, `react-leaflet`, `axios`.

### Local Execution Workflow
1. **Backend:** Run within a virtual environment. `uvicorn app:app --port 9000 --reload`
2. **Frontend:** Run via Node.js/NPM. `npm run dev` (running on `http://localhost:5173`).
3. CORS boundaries explicitly restrict backend origin acceptance to `localhost:5173`.
