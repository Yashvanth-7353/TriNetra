# TriNetra

**TriNetra** is an AI-powered Case Intelligence and Orchestrator system designed for law enforcement and investigative agencies. It provides a conversational interface backed by advanced natural language processing, graph-based network analysis, and data analytics to explore, understand, and visualize complex case data.

---

## 🌟 Key Features

1. **Conversational AI Orchestrator (`engines/router.py`)**
   - Natural language interface for querying case details, suspects, and crime trends.
   - Intelligent intent routing seamlessly transitions between factual lookup (NL2SQL), vector-based document retrieval (RAG), graph extraction, and statistical analytics.

2. **Graph & Network Analysis (`engines/network_engine.py`, `engines/graph.py`)**
   - Identifies and visualizes relationships between accused individuals, victims, locations, and cases.
   - Powered by `NetworkX` on the backend and rendered interactively via `React Flow` on the frontend.

3. **Case Explorer (`engines/case_explorer.py`)**
   - Advanced filtering mechanisms (by district, status, category, crime head, date ranges).
   - Geospatial and temporal case mapping.

4. **Analytics & Risk Profiling (`engines/analytics.py`)**
   - Extracts temporal crime trends and generates risk profiles for accused individuals based on historical data.
   - Visualized seamlessly via `Recharts` in the frontend dashboard.

5. **Robust Security & RBAC (`engines/auth.py`, `engines/security.py`)**
   - Secure login mechanism with JWT-based sessions.
   - Role-Based Access Control (RBAC) ensures investigators only see data within their authorized jurisdictions and clearance levels.

6. **Premium Session Export**
   - Generate beautifully styled HTML reports of your investigative sessions for official documentation and sharing.

---

## 🏗️ Architecture & Design

TriNetra follows a modern client-server architecture decoupled via REST APIs.

### Frontend (`trinetra-client/`)
- **Core:** React 19, TypeScript, Vite
- **Styling:** TailwindCSS
- **Visualizations:** 
  - `React Flow` for Interactive Criminal Network Graphs
  - `Recharts` for Analytics and Crime Trends
  - `React-Leaflet` for Geospatial Mapping
- **Routing:** React Router DOM

### Backend (`trinetra-backend/`)
- **Core:** Python 3, FastAPI (High-performance asynchronous API framework)
- **AI/LLM:** Groq API (`groq`), Google Generative AI (`google-genai`) for fast intent detection and RAG.
- **Database Connectivity:** PostgreSQL (`psycopg2-binary`)
- **Network Computation:** `NetworkX` for graph algorithms
- **Security:** `bcrypt` for password hashing, PyJWT (custom) for token-based auth.

---

## 📂 Project Structure

```text
TriNetra/
├── trinetra-backend/             # FastAPI Backend System
│   ├── app.py                    # Main FastAPI application entry point
│   ├── engines/                  # Core logic & AI modules
│   │   ├── router.py             # Query intent classification
│   │   ├── nl2sql.py             # Natural Language to SQL generation
│   │   ├── rag.py                # Retrieval-Augmented Generation
│   │   ├── network_engine.py     # Network analysis engine
│   │   ├── analytics.py          # Data analytics & trend generation
│   │   ├── case_explorer.py      # Case exploration & filtering logic
│   │   ├── auth.py               # Authentication & JWT issuance
│   │   ├── database.py           # Database connection & pooling
│   │   └── security.py           # Role-Based Access Control (RBAC) filtering
│   ├── requirements.txt          # Python dependencies
│   └── .env                      # Backend environment variables
│
└── trinetra-client/              # React + Vite Frontend Application
    ├── src/
    │   ├── pages/                # UI Views (CaseExplorer, NetworkAnalysis, LoginPage, etc.)
    │   ├── App.tsx               # Main React Application
    │   └── index.css             # Tailwind & Global Styles
    ├── package.json              # NPM dependencies & scripts
    └── vite.config.ts            # Vite bundler configuration
```

---

## 🚀 Setup & Installation

### Prerequisites
- Node.js (v18+)
- Python 3.10+
- PostgreSQL Database (with schema initialized)

### 1. Backend Setup

Navigate to the backend directory:
```bash
cd trinetra-backend
```

Create and activate a virtual environment:
```bash
# On Windows
python -m venv venv
.\venv\Scripts\activate

# On macOS/Linux
python3 -m venv venv
source venv/bin/activate
```

Install dependencies:
```bash
pip install -r requirements.txt
```

Environment Configuration:
Ensure you have a `.env` file in `trinetra-backend/` containing:
```env
GROQ_API_KEY=your_groq_api_key_here
# Add your database connection strings and other keys as required by your environment
```

Start the Development Server:
```bash
uvicorn app:app --port 9000 --reload
```
The backend will run on `http://localhost:9000`.

### 2. Frontend Setup

Open a new terminal and navigate to the client directory:
```bash
cd trinetra-client
```

Install NPM dependencies:
```bash
npm install
```

Start the Vite Development Server:
```bash
npm run dev
```
The frontend will run on `http://localhost:5173`.

---

## 🛠️ Usage Flow
1. Open your browser and navigate to the Frontend URL (`http://localhost:5173`).
2. Log in using your assigned Employee ID and Password.
3. Access the **Ask TriNetra** conversational interface to perform RAG and NL2SQL queries.
4. Open the **Case Explorer** to manually filter through the repository of historical cases.
5. Use **Network Analysis** to identify links between multiple entities involved in various FIRs.
