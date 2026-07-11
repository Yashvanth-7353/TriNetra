# TriNetra: Intelligent Conversational AI & Crime Analytics Platform

An enterprise-grade, conversational intelligence and predictive analytics platform built on top of the Karnataka Police CaseMaster FIR database. The platform empowers investigators, analysts, supervisors, and policymakers to interact with crime records using natural language queries (English/Kannada, voice/text) while discovering hidden relationships, network structures, socio-demographic trends, and behavioral profiles.

Deployed fully within the mandatory **Zoho Catalyst** cloud ecosystem using a **React frontend** and a **FastAPI backend orchestrator**.

---

## 1. Core Vision & Design Philosophy

* **Zero Schema Disruption:** Read-only access to the core 25-table `CaseMaster` production schema. All analytical properties are managed via 7 optimized additive extension tables.
* **Multi-Engine Intent Routing:** Avoids the fragility of generic LLM wrappers. User intent is classified upfront to delegate workloads to optimal computing engines (NL2SQL, Graph-Relational traversing, Vector RAG, or Tabular ML).
* **Structural Explainability:** Every insight, risk score, or natural language assertion is bound to explicit row citations (`CaseMasterID`, `CrimeNo`), ensuring absolute compliance with judicial and internal accountability standards.

---

## 2. System Architecture & Zoho Catalyst Component Mapping

The entire application runs inside the Zoho Catalyst environment.

| Platform Component | Technical Stack | Catalyst Service Used | Role & Execution Strategy |
| --- | --- | --- | --- |
| **Frontend UI** | React.js, Tailwind CSS | **Web Client Hosting** | Serves the Single Page Application (SPA) providing the chat UI, real-time map controls, and network visualizations. |
| **API Layer** | Reverse Proxy / Security | **API Gateway** | Manages rate limiting, request throttling, and public routing safely to the backend logic. |
| **Backend Orchestrator** | **FastAPI (Python)** | **AppSail (Managed Runtime)** | Houses the intent classifier, conversational state manager, transaction tracker, and response assembler. |
| **Data Store** | Relational Core System | **Data Store** | Replicates the `CaseMaster` database and hosts the new additive analytics tables with strict indexing. |
| **Conversational & RAG** | Text LLM & Vectors | **QuickML (LLM & RAG)** | Manages high-dimensional embeddings for case narratives (`BriefFacts`) and acts as the text synthesizer. |
| **Predictive Analytics** | Dynamic Tabular ML | **Zia AutoML** | Automates training pipelines on historical factors to generate offender risk evaluations and crime trend indicators. |
| **Perceptual Processing** | Voice and Translation | **Zia Services** | Dual-language pipeline (Kannada ↔ English translation, Speech-to-Text, and Text-to-Speech synthesis). |
| **Asynchronous Pipelines** | Automated Document Processing | **Signals + Event Functions** | Triggers automated background workers on table insert actions to parse entities out of text fields. |
| **Document Generation** | Headless PDF Engine | **SmartBrowz** | Renders runtime chat sessions, network layouts, and analytics into hardcopy PDFs for investigators. |
| **Identity & Access** | Authentication Broker | **Authentication** | Manages police credentials and enforces role clearances at the application layer. |

---

## 3. Minimum Database Schema Extensions

These 7 tables are added alongside the existing 25 tables to support advanced capabilities without breaking legacy report configurations.

```sql
-- Modus Operandi mapping for pattern discovery
ModusOperandi (MOID PK, CaseMasterID FK, MOTagID FK, Description, Confidence);
MOTagMaster (MOTagID PK, MOTagName, MOCategory);

-- Financial tracking and link networks
SuspectAccount (AccountID PK, AccusedMasterID FK, AccountNumber, BankName, IFSC);
FinancialTransaction (TxnID PK, FromAccountID FK, ToAccountID FK, Amount, TxnDate, CaseMasterID FK, Flagged BIT);

-- Offender risk assessments (Refreshed asynchronously via Zia AutoML outputs)
OffenderRiskScore (AccusedMasterID PK FK, RiskScore DECIMAL, RepeatOffenderFlag BIT, TopContributingFactors VARCHAR, LastComputedDate);

-- Fine-grained grid blocks for hotspot rendering
CrimeHotspotCell (CellID PK, GridLat, GridLng, DistrictID FK, TimeWindow, CrimeCount, TrendDirection);

-- Entity Resolution mapping table to capture multi-district spelling variations
EntityAlias (AliasID PK, PrimaryMasterID FK, EntityType, AliasString, PhoneticHash);
```

---

## 4. Advanced Engine Workflows

### 4.1 The Multilingual Voice & Intent Route

1. **Audio Input:** The user speaks a query in Kannada into the React client.
2. **Translation Pipeline:** The audio is processed by **Catalyst Zia Services**, converting Kannada audio directly into English text. This step ensures clean input for downstream code/query generators trained heavily on English parameters.
3. **Intent Classification:** The **FastAPI** application inside **AppSail** scans the text and classifies it into one of four distinct technical execution categories:
   * *Factual Query:* Dispatched to the Schema-Aware NL2SQL module.
   * *Relationship Query:* Dispatched to the Relational Graph Traverser.
   * *Statistical/Predictive Query:* Dispatched to the Zia AutoML extraction interface.
   * *Narrative Query:* Dispatched to the QuickML RAG engine.

### 4.2 Graph-Relational Network Traversing

To maintain 100% Catalyst compliance without external Graph databases, the platform implements a relationship crawler directly inside **FastAPI** over indexed relational lookups:

* Relationships between entities (Accused, Co-Accused, Victims, Phone Numbers, Locations, and Bank Accounts) are traversed using optimized sub-queries.
* The **FastAPI** backend converts these multi-hop records into a Node-Edge JSON structure.
* The React frontend reads this JSON to draw interactively styleable relationship network graphs directly on screen.

### 4.3 Narrative RAG Pipeline

* The `BriefFacts` column from the database is sent to **Catalyst QuickML**.
* Semantic search maps abstract queries (e.g., "stolen gold items hidden inside scooters") to underlying cases that match the tactical concept, even if the phrasing differs entirely.
* Synthesized responses explicitly embed case references, ensuring no hallucinatory statements can pass unchecked.

---

## 5. Security, Governance & Role-Based Access Control (RBAC)

* **Strict Application-Tier Isolation:** High-sensitivity fields (`ReligionMaster`, `CasteMaster`) are architecturally restricted. They cannot be used as primary filters for individual criminal profiling. They can only be executed in macro cohort queries where the population output group size \(n \ge 10\).
* **Immutable Operational Audit Trail:** Every single request via the conversational model is recorded. The framework logs the query string, user ID, the generated SQL script executed, rows read, and the final output response text.
* **Role Classifications:**
  * *Investigator:* Access to assigned cases, local jurisdictional lookups, network graphs, and MO tracking.
  * *Analyst:* Access to anonymized crime patterns, geo-spatial hotspots, and aggregate network maps (No structural PII visibility by default).
  * *Supervisor:* Access to full district wide parameters, operational case assignment summaries, and early warning trend lines.
  * *Policymaker:* State-wide strategic dashboards, socio-economic correlation tools, and future volume forecasts (Completely stripped of PII).

---

## 6. Project Phasing & Implementation Roadmap

```text
[ Phase 1: Hackathon MVP ] ──► [ Phase 2: System Expansion ] ──► [ Phase 3: Hardened Release ]
   • Translation-First Logic        • Automatic MO Text Parser         • Deep Data Privacy Audit
   • AppSail FastAPI Router         • Full Tabular Zia AutoML          • Real-Time Data Sync (CDC)
   • Data Store Extension Schema    • SmartBrowz PDF Generation        • Statewide Alert Matrix
```

---

## 7. Setup & Deployment Instructions

### Prerequisites

* Python 3.10 or above installed locally.
* Zoho CLI initialized with active Catalyst account credentials.

### Installation Steps

1. Clone the repository and enter the directory:

```bash
git clone https://github.com/organization/sahayak-ai.git
cd sahayak-ai
```

2. Install dependencies for both the project frontend and the backend components:

```bash
# Install frontend dependencies
cd client && npm install && cd ..

# Install backend dependencies
cd backend
pip install -r requirements.txt
cd ..
```

3. Initialize your Zoho Catalyst environment variables and provision services:

```bash
catalyst init
```

*Select your active project space, link the Data Store configuration, and map AppSail to the FastAPI project directory.*

4. Deploy the full stack directly to the Catalyst cloud environment:

```bash
catalyst deploy
```

Once execution completes, the Catalyst CLI will provide the unique public live endpoint URLs for both the **API Gateway** and the hosted **Web Client** web portal application interface.