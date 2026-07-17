# TriNetra Technical Implementation Architecture

This document provides an exhaustive technical breakdown of the TriNetra Case Intelligence Orchestrator. It details the implemented components, REST APIs, algorithms, AI integration logic, vector mathematics, data models, and the strict security workflows utilized across the system.

---

## 1. System Architecture Overview

TriNetra is built on a highly modular, modern decoupled architecture designed for rapid asynchronous processing and complex mathematical querying:
- **Frontend Layer (Vite + React 19):** A high-fidelity Single Page Application (SPA) written in TypeScript. It leverages `TailwindCSS` for styling (glassmorphism, CSS grids, micro-animations), `React Flow` for node-edge graph visualization, `Recharts` for statistical analytics, and `react-leaflet` for geospatial plotting.
- **Backend API Layer (FastAPI):** An asynchronous Python 3 REST API framework. It handles dependency injection for database sessions and uses modular "engines" (e.g., `pattern_engine.py`, `network_engine.py`) to isolate business logic.
- **Database Layer (Neon PostgreSQL):** The central repository. It acts as both a standard relational database and a dedicated vector database leveraging the `pgvector` extension for semantic embedding storage and fast vector distance calculations.
- **AI & ML Layer:**
  - **Orchestrator & NL2SQL (Groq API):** Uses `llama-3.3-70b-versatile` for blazing-fast zero-shot reasoning, strict intent routing, and prompt-injected SQL generation.
  - **Embedding Generation (Google GenAI):** Uses `gemini-embedding-001` to generate dense 768-dimensional float arrays representing unstructured FIR text (`BriefFacts`).

---

## 2. Relational & Vector Data Models

The PostgreSQL schema (`DataGeneration/DataBase_Schema.sql`) maps the hierarchical structure of law enforcement:

### 2.1 Core Jurisdictional & Case Mapping
- **Unit & District:** Hierarchical mapping. A `PoliceStationID` maps to a `UnitID`, which maps upward to a `DistrictID`.
- **CaseMaster:** The central nexus table storing `CrimeNo`, `CrimeRegisteredDate`, `BriefFacts`, geospatial floating points (`Latitude`, `Longitude`), and multiple foreign keys to reference lookup tables (`CaseStatusMaster`, `CaseCategory`).

### 2.2 Entity & Temporal Tracking
- **Entity Tables:** `Accused`, `Victim`, and `ComplainantDetails` store identity information (Name, Age, Gender, Address) mapping directly to a `CaseMasterID`.
- **ModusOperandi & MOTagMaster:** Links behavioral crime signatures (e.g., "Chain Snatching", "OTP Fraud") to specific cases.
- **OffenderRiskScore:** Pre-calculated analytics. Stores integer `RiskScore`, boolean flags for recidivism (`RepeatOffenderFlag`), and a JSONB column (`TopFactors`) mapping the mathematical reasoning behind the score.

### 2.3 The pgvector Integration (`CaseNarrativeEmbedding`)
Unlike standard relational data, the `CaseNarrativeEmbedding` table utilizes the `vector` data type provided by the `pgvector` extension.
- **Structure:** `(CaseMasterID int, EmbeddingVector vector(768))`
- **Purpose:** Stores the 768-dimensional semantic meaning of the `BriefFacts` text. It enables the system to execute mathematical Cosine Similarity (`<=>`) searches directly within standard SQL queries, bypassing the need for external vector databases like Pinecone.

---

## 3. Backend Implementation (FastAPI Engines)

The backend (`app.py`) exposes modular REST endpoints, delegating processing to distinct "engines".

### 3.1 Role-Based Access Control (RBAC) & Security
Authentication is stateless and JWT-based.
- **JWT Payload:** Upon providing a valid `EmployeeID` and verified `bcrypt` password, the server issues a PyJWT token signed with `HS256`. The payload explicitly encodes the user's `role`, `station_id` (Unit), and `district_id`.
- **SQL Injection Guardrails (RBAC):** In endpoints like `/api/analytics/offenders`, the system intercepts the JWT payload and dynamically injects `EXISTS` subqueries into the SQL string. 
  - *Example:* An Inspector attempting to view Offender Profiles will have an injected SQL clause forcing `u.DistrictID = {user_district}` OR `cm.PoliceStationID = {user_station}`, making data leakage mathematically impossible at the database row-level.

### 3.2 Pattern Analytics & Similarity Engine (`pattern_engine.py`) **[NEW]**
The newest analytical module focuses on dynamic clustering and Explainable AI case matching.

- **Dynamic MO Clustering (`get_emerging_patterns`):**
  - Scans `ModusOperandi` and `CaseMaster` for the trailing 90 days.
  - Aggregates and groups cases by `MOTagID`, triggering an alert cluster if `COUNT(CaseMasterID) >= 2`.
  - Generates chronological Recharts-compatible sparkline datasets in Python by bucketing cases into `YYYY-WW` temporal windows.
- **Explainable Case Similarity Engine (`find_similar_cases`):**
  - A Tri-Signal multidimensional ranking algorithm. When a target `CaseMasterID` is queried, it computes a composite score (0-100%) against historical cases using three disparate methods:
    1. **Narrative Semantic Math:** Executes `1 - (e1.EmbeddingVector <=> e2.EmbeddingVector)` in Postgres to calculate cosine distance. High correlations (>0.6) heavily boost the score.
    2. **MO Overlap:** Executes self-JOINs on `ModusOperandi` to find identical tags shared between the two cases.
    3. **Spatio-Temporal Decay:** Calculates raw Euclidean distance between coordinates (`(lat1-lat2)^2 + (lng1-lng2)^2`) and absolute time difference (`days`).
  - **Explainability:** Generates a plain-English array (`explanations`) for the frontend, explicitly stating *why* the AI grouped them together (e.g., "Occurred 4.5km away").

### 3.3 Graph & Network Engine (`network_engine.py`)
Computes complex criminal syndicates visually.
- **NetworkX Extraction:** Extracts an N-hop subgraph around a target Accused node.
- **Multi-layer Edge Construction:** Edges are mathematically weighted by merging 5 connection types: `co_accused`, `financial` transfers, `repeat_identity`, `shared_mo`, and `victim_accused` loops.
- **Community Detection:** Runs the `community_louvain` heuristic to parse the graph into distinct modular clusters/gangs, assigning group IDs for frontend color-coding.

### 3.4 Conversational AI Orchestrator (`router.py` & `nl2sql.py`)
- **Intent Routing:** Groq LLM evaluates the chat string and outputs a JSON object locking the query into 1 of 5 strict execution paths (`factual_lookup`, `narrative_rag`, `trend_analysis`, etc.).
- **NL2SQL Engine:** If `factual_lookup` is triggered, Groq generates raw PostgreSQL. The backend executes a 4-Tier Security Check on the string (Must start with `SELECT`, block `;` multi-statements, Table Whitelist, Force `LIMIT 200`).
- **RAG Engine (`rag.py`):** If `narrative_rag` is triggered, it vectorizes the query using Google GenAI, queries Postgres using `<=>`, extracts the top 3 FIR narratives, and uses Groq to synthesize an answer.

---

## 4. Frontend Architecture (React + Vite)

### 4.1 UI/UX & Dynamic Routing
- **AppShell:** Authenticated routes are wrapped in an `AppShell.tsx` layout that provides a persistent sidebar and auth-context injection.
- **Search Parameter Handoffs:** Deep-linking between modules is handled cleanly via React Router's `useSearchParams`. For example, navigating from Pattern Analytics to Case Explorer passes `?search=Cr.No`. A `useEffect` hook intercepts this, immediately invokes the SQL search query, and natively `setSearchParams(newParams, { replace: true })` to delete the URL variable, unlocking the UI state.

### 4.2 Data Visualization Components
- **React Flow (`NetworkAnalysis.tsx`):** Renders the nodes/edges payload from NetworkX. Implements custom nodes with embedded icons, dragging physics, and click-to-focus zooming.
- **Recharts (`CrimeAnalytics.tsx` / Pattern Analytics):** Responsive SVGs mapped to the backend's temporal aggregation arrays. Features custom tooltips and gradient SVG fills for premium aesthetics.
- **React-Leaflet:** Integrated directly into React for mapping `Latitude` / `Longitude` datasets with `CircleMarker` clusters. 
- **Graceful Async Handling:** Components utilize highly polished `ChartLoader` and `KPISkeleton` wrappers (shimmering Tailwind animations) to prevent layout shifts while the FastAPI backend completes heavy queries.

---

## 5. Deployment Specs
- **Database:** Neon Serverless Postgres (`psycopg2-binary` driver).
- **Backend Environment:** `uvicorn` running `app:app` on port 9000.
- **Frontend Environment:** `vite` dev server running on port 5173 (Node.js 18+).
- **CORS:** FastAPI `CORSMiddleware` strictly whitelists `http://localhost:5173`.
