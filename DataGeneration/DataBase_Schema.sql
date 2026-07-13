-- ============================================================================
-- KARNATAKA POLICE FIR SYSTEM — COMPLETE UPDATED DATABASE SCHEMA
-- Base: original CaseMaster ER schema (26 tables, unchanged)
-- Added: 9 new tables for the Conversational AI & Crime Analytics Platform
-- Dialect: PostgreSQL 14+ / Neon serverless Postgres
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- PART A — MASTER / LOOKUP TABLES
-- ============================================================================

CREATE TABLE State (
    StateID         SERIAL PRIMARY KEY,
    StateName       VARCHAR(100) NOT NULL,
    NationalityID   INT,
    Active          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE District (
    DistrictID      SERIAL PRIMARY KEY,
    DistrictName    VARCHAR(100) NOT NULL,
    StateID         INT NOT NULL REFERENCES State(StateID),
    Active          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE UnitType (
    UnitTypeID      SERIAL PRIMARY KEY,
    UnitTypeName    VARCHAR(100) NOT NULL,
    CityDistState   VARCHAR(20),
    Hierarchy       INT,
    Active          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE Rank (
    RankID          SERIAL PRIMARY KEY,
    RankName        VARCHAR(100) NOT NULL,
    Hierarchy       INT,
    Active          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE Designation (
    DesignationID   SERIAL PRIMARY KEY,
    DesignationName VARCHAR(100) NOT NULL,
    Active          BOOLEAN NOT NULL DEFAULT TRUE,
    SortOrder       INT
);

CREATE TABLE CasteMaster (
    caste_master_id     SERIAL PRIMARY KEY,
    caste_master_name   VARCHAR(100) NOT NULL
);

CREATE TABLE ReligionMaster (
    ReligionID      SERIAL PRIMARY KEY,
    ReligionName    VARCHAR(100) NOT NULL
);

CREATE TABLE OccupationMaster (
    OccupationID    SERIAL PRIMARY KEY,
    OccupationName  VARCHAR(100) NOT NULL
);

CREATE TABLE CaseStatusMaster (
    CaseStatusID    SERIAL PRIMARY KEY,
    CaseStatusName  VARCHAR(100) NOT NULL
);

CREATE TABLE CaseCategory (
    CaseCategoryID  SERIAL PRIMARY KEY,
    LookupValue     VARCHAR(50) NOT NULL
);

CREATE TABLE GravityOffence (
    GravityOffenceID SERIAL PRIMARY KEY,
    LookupValue      VARCHAR(50) NOT NULL
);

CREATE TABLE CrimeHead (
    CrimeHeadID     SERIAL PRIMARY KEY,
    CrimeGroupName  VARCHAR(150) NOT NULL,
    Active          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE CrimeSubHead (
    CrimeSubHeadID  SERIAL PRIMARY KEY,
    CrimeHeadID     INT NOT NULL REFERENCES CrimeHead(CrimeHeadID),
    CrimeHeadName   VARCHAR(150) NOT NULL,
    SeqID           INT
);

CREATE TABLE Act (
    ActCode         VARCHAR(20) PRIMARY KEY,
    ActDescription  VARCHAR(255) NOT NULL,
    ShortName       VARCHAR(50),
    Active          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE Section (
    ActCode             VARCHAR(20) NOT NULL REFERENCES Act(ActCode),
    SectionCode         VARCHAR(20) NOT NULL,
    SectionDescription  VARCHAR(255),
    Active              BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (ActCode, SectionCode)
);

CREATE TABLE CrimeHeadActSection (
    CrimeHeadID     INT NOT NULL REFERENCES CrimeHead(CrimeHeadID),
    ActCode         VARCHAR(20) NOT NULL,
    SectionCode     VARCHAR(20) NOT NULL,
    PRIMARY KEY (CrimeHeadID, ActCode, SectionCode),
    FOREIGN KEY (ActCode, SectionCode) REFERENCES Section(ActCode, SectionCode)
);

CREATE TABLE Court (
    CourtID         SERIAL PRIMARY KEY,
    CourtName       VARCHAR(200) NOT NULL,
    DistrictID      INT NOT NULL REFERENCES District(DistrictID),
    StateID         INT NOT NULL REFERENCES State(StateID),
    Active          BOOLEAN NOT NULL DEFAULT TRUE
);

-- ============================================================================
-- PART B — ORGANIZATIONAL HIERARCHY
-- ============================================================================

CREATE TABLE Unit (
    UnitID          SERIAL PRIMARY KEY,
    UnitName        VARCHAR(150) NOT NULL,
    TypeID          INT REFERENCES UnitType(UnitTypeID),
    ParentUnit      INT REFERENCES Unit(UnitID),
    NationalityID   INT,
    StateID         INT REFERENCES State(StateID),
    DistrictID      INT REFERENCES District(DistrictID),
    Active          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE Employee (
    EmployeeID          SERIAL PRIMARY KEY,
    DistrictID          INT REFERENCES District(DistrictID),
    UnitID              INT REFERENCES Unit(UnitID),
    RankID              INT REFERENCES Rank(RankID),
    DesignationID       INT REFERENCES Designation(DesignationID),
    KGID                VARCHAR(30) UNIQUE,
    FirstName           VARCHAR(100) NOT NULL,
    EmployeeDOB         DATE,
    GenderID            INT,
    BloodGroupID        INT,
    PhysicallyChallenged BOOLEAN DEFAULT FALSE,
    AppointmentDate     DATE
);

-- ============================================================================
-- PART C — CORE FIR TABLES
-- ============================================================================

CREATE TABLE CaseMaster (
    CaseMasterID        SERIAL PRIMARY KEY,
    CrimeNo             VARCHAR(30) NOT NULL UNIQUE,
    CaseNo              VARCHAR(15) NOT NULL,
    CrimeRegisteredDate DATE NOT NULL,
    PolicePersonID      INT NOT NULL REFERENCES Employee(EmployeeID),
    PoliceStationID     INT NOT NULL REFERENCES Unit(UnitID),
    CaseCategoryID      INT NOT NULL REFERENCES CaseCategory(CaseCategoryID),
    GravityOffenceID    INT REFERENCES GravityOffence(GravityOffenceID),
    CrimeMajorHeadID    INT REFERENCES CrimeHead(CrimeHeadID),
    CrimeMinorHeadID    INT REFERENCES CrimeSubHead(CrimeSubHeadID),
    CaseStatusID        INT REFERENCES CaseStatusMaster(CaseStatusID),
    CourtID             INT REFERENCES Court(CourtID),
    IncidentFromDate    TIMESTAMP,
    IncidentToDate      TIMESTAMP,
    InfoReceivedPSDate  TIMESTAMP,
    latitude            DECIMAL(10,6),
    longitude           DECIMAL(10,6),
    BriefFacts          TEXT
);

CREATE TABLE ComplainantDetails (
    ComplainantID   SERIAL PRIMARY KEY,
    CaseMasterID    INT NOT NULL REFERENCES CaseMaster(CaseMasterID),
    ComplainantName VARCHAR(150) NOT NULL,
    AgeYear         INT,
    OccupationID    INT REFERENCES OccupationMaster(OccupationID),
    ReligionID      INT REFERENCES ReligionMaster(ReligionID),
    CasteID         INT REFERENCES CasteMaster(caste_master_id),
    GenderID        INT
);

CREATE TABLE ActSectionAssociation (
    CaseMasterID    INT NOT NULL REFERENCES CaseMaster(CaseMasterID),
    ActID           VARCHAR(20) NOT NULL,
    SectionID       VARCHAR(20) NOT NULL,
    ActOrderID      INT,
    SectionOrderID  INT,
    PRIMARY KEY (CaseMasterID, ActID, SectionID),
    FOREIGN KEY (ActID, SectionID) REFERENCES Section(ActCode, SectionCode)
);

CREATE TABLE Victim (
    VictimMasterID  SERIAL PRIMARY KEY,
    CaseMasterID    INT NOT NULL REFERENCES CaseMaster(CaseMasterID),
    VictimName      VARCHAR(150) NOT NULL,
    AgeYear         INT,
    GenderID        INT,
    VictimPolice    BOOLEAN DEFAULT FALSE
);

CREATE TABLE Accused (
    AccusedMasterID SERIAL PRIMARY KEY,
    CaseMasterID    INT NOT NULL REFERENCES CaseMaster(CaseMasterID),
    AccusedName     VARCHAR(150) NOT NULL,
    AgeYear         INT,
    GenderID        INT,
    PersonID        VARCHAR(10)
);

CREATE TABLE ArrestSurrender (
    ArrestSurrenderID          SERIAL PRIMARY KEY,
    CaseMasterID                INT NOT NULL REFERENCES CaseMaster(CaseMasterID),
    ArrestSurrenderTypeID       INT,
    ArrestSurrenderDate         DATE,
    ArrestSurrenderStateId      INT REFERENCES State(StateID),
    ArrestSurrenderDistrictId   INT REFERENCES District(DistrictID),
    PoliceStationID             INT REFERENCES Unit(UnitID),
    IOID                        INT REFERENCES Employee(EmployeeID),
    CourtID                     INT REFERENCES Court(CourtID),
    AccusedMasterID             INT REFERENCES Accused(AccusedMasterID),
    IsAccused                   BOOLEAN DEFAULT TRUE,
    IsComplainantAccused        BOOLEAN DEFAULT FALSE
);

CREATE TABLE ChargesheetDetails (
    CSID            SERIAL PRIMARY KEY,
    CaseMasterID    INT NOT NULL REFERENCES CaseMaster(CaseMasterID),
    csdate          TIMESTAMP,
    cstype          CHAR(1) CHECK (cstype IN ('A','B','C')),
    PolicePersonID  INT REFERENCES Employee(EmployeeID)
);

-- ============================================================================
-- PART E — NEW ANALYTICS & AI PLATFORM TABLES
-- ============================================================================

CREATE TABLE MOTagMaster (
    MOTagID         SERIAL PRIMARY KEY,
    MOTagName       VARCHAR(150) NOT NULL,
    MOCategory      VARCHAR(100)
);

CREATE TABLE ModusOperandi (
    MOID            SERIAL PRIMARY KEY,
    CaseMasterID    INT NOT NULL REFERENCES CaseMaster(CaseMasterID),
    MOTagID         INT NOT NULL REFERENCES MOTagMaster(MOTagID),
    Description     TEXT,
    Confidence      DECIMAL(4,3) CHECK (Confidence BETWEEN 0 AND 1)
);

CREATE TABLE SuspectAccount (
    AccountID       SERIAL PRIMARY KEY,
    AccusedMasterID INT NOT NULL REFERENCES Accused(AccusedMasterID),
    AccountNumber   VARCHAR(34) NOT NULL,
    BankName        VARCHAR(150),
    IFSC            VARCHAR(11)
);

CREATE TABLE FinancialTransaction (
    TxnID           SERIAL PRIMARY KEY,
    FromAccountID   INT REFERENCES SuspectAccount(AccountID),
    ToAccountID     INT REFERENCES SuspectAccount(AccountID),
    Amount          DECIMAL(14,2) NOT NULL,
    TxnDate         TIMESTAMP NOT NULL,
    CaseMasterID    INT REFERENCES CaseMaster(CaseMasterID),
    Flagged         BOOLEAN DEFAULT FALSE
);

CREATE TABLE CaseStatusHistory (
    HistoryID           SERIAL PRIMARY KEY,
    CaseMasterID         INT NOT NULL REFERENCES CaseMaster(CaseMasterID),
    CaseStatusID         INT NOT NULL REFERENCES CaseStatusMaster(CaseStatusID),
    ChangedByEmployeeID  INT REFERENCES Employee(EmployeeID),
    ChangeDate           TIMESTAMP NOT NULL DEFAULT now(),
    Remarks              TEXT
);

CREATE TABLE OffenderRiskScore (
    AccusedMasterID     INT PRIMARY KEY REFERENCES Accused(AccusedMasterID),
    RiskScore           DECIMAL(5,2) NOT NULL,
    RepeatOffenderFlag  BOOLEAN DEFAULT FALSE,
    TopFactors          JSONB,
    LastComputedDate    TIMESTAMP NOT NULL DEFAULT now(),
    ModelVersion        VARCHAR(30)
);

CREATE TABLE CrimeHotspotCell (
    CellID          SERIAL PRIMARY KEY,
    GridLat         DECIMAL(10,6) NOT NULL,
    GridLng         DECIMAL(10,6) NOT NULL,
    DistrictID      INT REFERENCES District(DistrictID),
    TimeWindow      VARCHAR(20) NOT NULL,
    CrimeCount      INT NOT NULL DEFAULT 0,
    TrendDirection  VARCHAR(10)
);

CREATE TABLE CaseNarrativeEmbedding (
    CaseMasterID    INT PRIMARY KEY REFERENCES CaseMaster(CaseMasterID),
    EmbeddingVector VECTOR(768),
    IndexedDate     TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE QueryAuditLog (
    AuditID         SERIAL PRIMARY KEY,
    EmployeeID      INT REFERENCES Employee(EmployeeID),
    RoleUsed        VARCHAR(30) NOT NULL,
    NLQueryText     TEXT NOT NULL,
    ResolvedEngine  VARCHAR(20),
    ResolvedQuery   TEXT,
    RowsReturned    INT,
    QueryTimestamp  TIMESTAMP NOT NULL DEFAULT now()
);

-- ============================================================================
-- PART F — INDEXES
-- ============================================================================

CREATE INDEX idx_casemaster_district   ON CaseMaster (PoliceStationID);
CREATE INDEX idx_casemaster_date       ON CaseMaster (CrimeRegisteredDate);
CREATE INDEX idx_casemaster_category   ON CaseMaster (CaseCategoryID, CrimeMinorHeadID);
CREATE INDEX idx_casemaster_geo        ON CaseMaster (latitude, longitude);
CREATE INDEX idx_accused_case          ON Accused (CaseMasterID);
CREATE INDEX idx_victim_case           ON Victim (CaseMasterID);
CREATE INDEX idx_arrestsurrender_case  ON ArrestSurrender (CaseMasterID);
CREATE INDEX idx_arrestsurrender_acc   ON ArrestSurrender (AccusedMasterID);
CREATE INDEX idx_financialtxn_case     ON FinancialTransaction (CaseMasterID);
CREATE INDEX idx_financialtxn_flagged  ON FinancialTransaction (Flagged) WHERE Flagged = TRUE;
CREATE INDEX idx_mo_case               ON ModusOperandi (CaseMasterID);
CREATE INDEX idx_mo_tag                ON ModusOperandi (MOTagID);
CREATE INDEX idx_hotspot_grid          ON CrimeHotspotCell (DistrictID, TimeWindow);
CREATE INDEX idx_statushistory_case    ON CaseStatusHistory (CaseMasterID, ChangeDate);
CREATE INDEX idx_auditlog_employee     ON QueryAuditLog (EmployeeID, QueryTimestamp);
-- Build after embeddings are populated:
-- CREATE INDEX idx_narrative_embedding ON CaseNarrativeEmbedding USING ivfflat (EmbeddingVector vector_cosine_ops);