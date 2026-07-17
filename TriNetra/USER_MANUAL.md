# TriNetra Functional Specification & User Guide

This document provides a comprehensive breakdown of every page, feature, and interactive element within the TriNetra dashboard. It serves as a detailed functional map for how law enforcement officers and analysts interact with the system.

---

## 1. Authentication & Login

**Purpose:** Secure access to the TriNetra system, enforcing Role-Based Access Control (RBAC) based on the user's jurisdictional rank.
- **Fields:** Employee ID, Password.
- **Actions:** 
  - Submitting credentials verifies identity against the backend.
  - Upon success, the system stores a secure token. This token automatically filters all subsequent dashboards and data tables so the officer only sees data relevant to their District or Police Station.

---

## 2. Dashboard (Home)

**Purpose:** A high-level entry point providing a quick glance at the system's capabilities.
- **Features:** 
  - Welcomes the user with their name and rank (e.g., "Welcome back, Inspector Rao").
  - Provides quick-launch cards to instantly navigate to key modules like Ask TriNetra, Case Explorer, and Network Analysis.

---

## 3. Ask TriNetra (Conversational AI Orchestrator)

**Purpose:** An intelligent, ChatGPT-like interface designed to answer natural language questions about crimes, suspects, and statistics without requiring the officer to manually build SQL queries.
- **Input Field:** A free-text chat bar at the bottom.
- **Functionality:** 
  - **Factual Lookup:** If you ask "Show me murders in Mysore last month," the AI converts this to a database query and returns a formatted table within the chat.
  - **Narrative RAG:** If you ask "Are there any cases involving a red getaway car?", the AI reads through thousands of unstructured FIR narratives (`BriefFacts`) and synthesizes an answer with specific case citations.
  - **Graph Triggers:** If you ask "Who is connected to Ramesh?", the chat bubble will natively embed and render an interactive criminal network graph.
- **Actions:** 
  - **Print / Export Report Button:** Located at the top right, this button compiles the entire chat history (including tables, graphs, and citations) into a beautifully formatted, printable HTML/PDF official report.

---

## 4. Case Explorer

**Purpose:** The central repository for manual, deep-dive investigations into historical FIRs. It is designed to filter thousands of records down to a highly specific subset.

### 4.1 Search & Filter Bar
- **Search Box:** A free-text input field. Typing here (e.g., "Cr.No.145-2023" or "stolen jewelry") filters cases where the string exists in either the Crime Number or the Brief Facts.
- **Filters Dropdowns:**
  - **District:** Narrows down cases to a specific district.
  - **Status:** Filters by current case lifecycle (e.g., "Under Investigation", "Charge Sheeted").
  - **Category / Crime Head:** Filters by the legal categorization of the crime (e.g., "Theft", "Cyber Crime").
  - **Date Range:** "From" and "To" date pickers to isolate crimes registered within a specific temporal window.
- **Actions:** The system automatically re-fetches and updates the table the moment any filter or search text is changed (no "Submit" button required).

### 4.2 Results Table
- **Columns:** Date, Crime No., District, Crime Head, Status Badge.
- **Status Badges:** Color-coded pill indicators (e.g., Blue for FIR Registered, Green for Convicted) for rapid visual parsing.
- **Actions:** Clicking the "Eye" icon or anywhere on a row slides open the **Case Detail Drawer**.

### 4.3 Case Detail Drawer (Deep Dive)
Slides in from the right, providing an exhaustive look at the selected case without leaving the page.
- **Overview Tab:** Displays the FIR text (`BriefFacts`), exact GPS coordinates plotted on a mini-map, and categorization metadata.
- **Timeline Tab:** A vertical, chronological progression of the case lifecycle (from FIR registration -> Arrests -> Charge Sheets -> Court outcomes).
- **People Tab:** Lists every individual involved, split into Accused, Victims, and Complainants, detailing demographics and addresses.
- **Actions:** 
  - **External Links:** Clicking an Accused ID natively redirects to the Network Analysis page, automatically seeding the graph with that suspect's ID to find their accomplices.
  - **Close Button (X):** Dismisses the drawer to return to the search results.

---

## 5. Pattern Analytics

**Purpose:** An advanced module for discovering hidden clusters of organized crime and finding mathematically similar cases across different jurisdictions.

### 5.1 Tab 1: Emerging Patterns (Automated Feed)
- **Automated Clusters List (Left Panel):** A feed of cards representing Modus Operandi (MO) tags that have seen an unusual surge in the last 90 days. Each card displays a sparkline chart showing the spike.
- **Map & Timeline (Right Panel):** Clicking a cluster card populates a state-wide map plotting the exact GPS locations of those crimes. Below the map, a chronological list of those specific cases is displayed.
- **Actions:** Clicking the "Arrow" icon on any case instantly redirects to the Case Explorer to read the full FIR.

### 5.2 Tab 2: Case Similarity Engine (Explainable AI)
- **Search Bar:** Accepts a `CaseMasterID` (which can be auto-populated if redirected from another page).
- **Functionality:** Clicking **"Analyze"** triggers a statewide database scan. The engine compares your case against history using a Tri-Signal approach (Narrative similarity, MO overlap, and GPS/Time proximity).
- **Result Cards:** Displays the top matched cases with a giant percentage match score (e.g., "84%"). 
- **Explainability Badges:** Crucially, each card explicitly lists *why* it matched (e.g., "High narrative similarity", "Occurred 4.5km away"). Clicking the Crime Number deep-links back to the Case Explorer.

---

## 6. Network Analysis

**Purpose:** A visual tool for mapping organized crime syndicates, gangs, and financial money-laundering rings.

- **Search Bar:** Accepts an `AccusedMasterID`.
- **Visualization Canvas:** Renders a sprawling, interactive node-edge graph.
  - **Nodes:** Represent Criminals. Nodes are color-coded based on the automated AI community detection (gang affiliation).
  - **Edges (Lines):** Represent relationships (e.g., Co-Accused in a previous case, Financial Transfers, Shared MO).
- **Interactions:**
  - **Drag & Zoom:** Pan around the canvas or scroll to zoom in on complex clusters.
  - **Click Node:** Clicking a suspect opens a side-panel displaying their risk score, photo placeholder, age, and a button to view their full profile.

---

## 7. Crime Analytics

**Purpose:** The macro-level statistical dashboard for Policymakers and Supervisors to track state-wide crime trends.

- **Key Performance Indicators (KPIs):** Top cards showing Total Cases, Arrest Rates, and Conviction Rates compared against baseline averages.
- **Time-Series Charts (Recharts):** Interactive line and bar charts showing crime volume over the last 12 months, filterable by Crime Category. Hovering over data points reveals exact numbers.
- **Geospatial Heatmap (Leaflet):** A dynamic map plotting crime densities.
- **Loaders:** Features elegant skeleton-loading animations (`ChartLoader`) while calculating heavy macro-statistics.

---

## 8. Offender Profiles

**Purpose:** A catalog of known criminals within the officer's jurisdiction, ranked by threat level.

- **Functionality:** Displays a grid of suspect cards.
- **Recidivism Risk Score:** The core feature is a prominently displayed integer score (e.g., 88). This score is pre-calculated based on their criminal history, severity of past crimes, and frequency of arrests.
- **Sorting & Filtering:** A dropdown allows officers to sort the grid by "Highest Risk Score" or "Most Recent Arrest" to prioritize tracking.

---

## 9. Prevention Alerts

**Purpose:** A proactive notification center that flags anomalies before they become widespread epidemics.

- **Alert Cards:** Automated triggers that appear when statistical anomalies are detected (e.g., "Sudden Spike in Cyber Crime in Mysore").
- **Metrics:** Shows exactly how the current 4-week window compares to the historical 24-week baseline.
- **Actionability:** Allows supervisors to quickly identify hotspots and reallocate patrol resources or issue public warnings.
