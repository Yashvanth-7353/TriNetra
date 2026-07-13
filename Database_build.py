import pandas as pd
import os

# Create a folder for the schema CSVs
os.makedirs("Catalyst_Schema_CSVs", exist_ok=True)

# Define the tables and their columns (omitting explicit ID columns as Catalyst uses ROWID)
schema = {
    "State": ["StateName", "NationalityID", "Active"],
    "District": ["DistrictName", "StateID", "Active"],
    "UnitType": ["UnitTypeName", "CityDistState", "Hierarchy", "Active"],
    "Rank": ["RankName", "Hierarchy", "Active"],
    "Designation": ["DesignationName", "Active", "SortOrder"],
    "CasteMaster": ["CasteMasterName"],
    "ReligionMaster": ["ReligionName"],
    "OccupationMaster": ["OccupationName"],
    "CaseStatusMaster": ["CaseStatusName"],
    "CaseCategory": ["LookupValue"],
    "GravityOffence": ["LookupValue"],
    "CrimeHead": ["CrimeGroupName", "Active"],
    "CrimeSubHead": ["CrimeHeadID", "CrimeHeadName", "SeqID"],
    "Act": ["ActCode", "ActDescription", "ShortName", "Active"],
    "Section": ["ActCode", "SectionCode", "SectionDescription", "Active"],
    "CrimeHeadActSection": ["CrimeHeadID", "ActCode", "SectionCode"],
    "Court": ["CourtName", "DistrictID", "StateID", "Active"],
    "Unit": ["UnitName", "TypeID", "ParentUnit", "NationalityID", "StateID", "DistrictID", "Active"],
    "Employee": ["DistrictID", "UnitID", "RankID", "DesignationID", "KGID", "FirstName", "EmployeeDOB", "GenderID", "BloodGroupID", "PhysicallyChallenged", "AppointmentDate"],
    "CaseMaster": ["CrimeNo", "CaseNo", "CrimeRegisteredDate", "PolicePersonID", "PoliceStationID", "CaseCategoryID", "GravityOffenceID", "CrimeMajorHeadID", "CrimeMinorHeadID", "CaseStatusID", "CourtID", "IncidentFromDate", "IncidentToDate", "InfoReceivedPSDate", "latitude", "longitude", "BriefFacts"],
    "ComplainantDetails": ["CaseMasterID", "ComplainantName", "AgeYear", "OccupationID", "ReligionID", "CasteID", "GenderID"],
    "ActSectionAssociation": ["CaseMasterID", "ActID", "SectionID", "ActOrderID", "SectionOrderID"],
    "Victim": ["CaseMasterID", "VictimName", "AgeYear", "GenderID", "VictimPolice"],
    "Accused": ["CaseMasterID", "AccusedName", "AgeYear", "GenderID", "PersonID"],
    "ArrestSurrender": ["CaseMasterID", "ArrestSurrenderTypeID", "ArrestSurrenderDate", "ArrestSurrenderStateId", "ArrestSurrenderDistrictId", "PoliceStationID", "IOID", "CourtID", "AccusedMasterID", "IsAccused", "IsComplainantAccused"],
    "ChargesheetDetails": ["CaseMasterID", "csdate", "cstype", "PolicePersonID"],
    "MOTagMaster": ["MOTagName", "MOCategory"],
    "ModusOperandi": ["CaseMasterID", "MOTagID", "Description", "Confidence"],
    "SuspectAccount": ["AccusedMasterID", "AccountNumber", "BankName", "IFSC"],
    "FinancialTransaction": ["FromAccountID", "ToAccountID", "Amount", "TxnDate", "CaseMasterID", "Flagged"],
    "CaseStatusHistory": ["CaseMasterID", "CaseStatusID", "ChangedByEmployeeID", "ChangeDate", "Remarks"],
    "OffenderRiskScore": ["AccusedMasterID", "RiskScore", "RepeatOffenderFlag", "TopFactors", "LastComputedDate", "ModelVersion"],
    "CrimeHotspotCell": ["GridLat", "GridLng", "DistrictID", "TimeWindow", "CrimeCount", "TrendDirection"],
    "QueryAuditLog": ["EmployeeID", "RoleUsed", "NLQueryText", "ResolvedEngine", "ResolvedQuery", "RowsReturned", "QueryTimestamp"]
}

# Generate empty CSVs with headers
for table_name, columns in schema.items():
    df = pd.DataFrame(columns=columns)
    file_path = f"Catalyst_Schema_CSVs/{table_name}.csv"
    df.to_csv(file_path, index=False)
    print(f"Generated {file_path}")

print("\nSuccess! All 34 table templates generated.")