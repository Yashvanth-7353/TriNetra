The Sahayak-AI Implementation Plan
Phase 1: Environment & Base Schema Setup ◄ WE ARE HERE
Step 1.1: Create a new project in the Zoho Catalyst Console.

Step 1.2: Install the Catalyst CLI locally and authenticate your account.

Step 1.3: Initialize the project directory structure using catalyst init (selecting AppSail for Node.js, Web Client Hosting for React, and the Data Store).

Step 1.4: Provision the Catalyst Data Store by deploying the base 25 tables (CaseMaster, Accused, etc.) and creating the 5 new additive extension tables (ModusOperandi, SuspectAccount, FinancialTransaction, OffenderRiskScore, CrimeHotspotCell).

Phase 2: Core Backend Engine (AppSail Node.js)
Step 2.1: Set up the Node.js Express/NestJS server within the AppSail directory.

Step 2.2: Initialize the catalyst-node-sdk to establish seamless database communication.

Step 2.3: Build the Intent Classifier router logic that intercepts user prompts.

Step 2.4: Build the relational multi-hop network crawler inside Node.js to fetch co-accused and financial trails.

Phase 3: AI, Voice, & Analytics Provisioning
Step 3.1: Set up the RAG pipeline inside Catalyst QuickML and upload a synthetic dataset of BriefFacts to build the semantic search index.

Step 3.2: Configure Catalyst Zia Services for English-Kannada translation and voice synthesis.

Step 3.3: Configure Catalyst Zia AutoML with a tabular training dataset to establish the automated offender risk scoring rules.

Phase 4: Frontend Interface (React Web Client)
Step 4.1: Build the conversational chat shell with real-time text/voice toggles.

Step 4.2: Integrate a mapping library (like Leaflet) to consume coordinate data from the CrimeHotspotCell table.

Step 4.3: Build the dynamic Node-Edge relationship graphing component using the JSON data sent from the backend.

Phase 5: Hardening & Deployment
Step 5.1: Set up Catalyst Authentication and hook it into the AppSail middleware to enforce strict RBAC.

Step 5.2: Hook up Catalyst SmartBrowz to convert runtime chat logs into downloadable PDFs.

Step 5.3: Deploy the entire architecture globally via catalyst deploy.