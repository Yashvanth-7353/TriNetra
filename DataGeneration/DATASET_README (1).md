# Karnataka Crime Intelligence Platform — Synthetic Dataset

Generated against `Crime_Platform_Complete_Schema.sql` (26 original FIR tables + 9 analytics
extensions). This is **entirely synthetic** — no real case, victim, or accused data — but it is
built to be statistically and structurally realistic enough to exercise every one of the ten
challenge pillars in a live demo.

## 1. Scale & coverage

| Metric | Value |
|---|---|
| Districts covered | All 31 Karnataka districts |
| Police station units | 126, distributed by district population/urbanity |
| Employees | 447, across 10 ranks and 6 designations |
| FIRs (`CaseMaster`) | 2,896 |
| Date range | Jan 2024 – Jul 2026 |
| Accused | 3,827 rows |
| Victims | 4,530 rows |
| Complainants | 2,896 rows |
| Arrests/surrenders | 3,673 rows |
| Chargesheets | 1,957 rows |
| MO tags applied | 1,827 rows |
| Financial transactions (flagged mule chains) | 48, across 10 suspect accounts |
| Crime hotspot cells (aggregated) | 2,859 |
| Offender risk scores | 3,827 (one per accused row, name-linked — see §3) |

Case volume is weighted by district: **Bengaluru Urban carries ~20% of statewide case volume**
(577 of 2,896), reflecting its real population and reporting density, tapering down to the
smallest rural districts (~45–50 cases each). This alone gives the hotspot map a genuine
urban-concentration pattern to detect rather than a flat random scatter.

## 2. Realistic structure, not just row counts

- **Crime mix** follows a realistic shape: property crime ~45%, economic offences ~15%,
  cyber crime ~10%, crimes against the person ~10%, crimes against women ~8%, narcotics ~5%,
  public order ~4%, missing person/UDR ~3%.
- **Seasonality is real, not decorative**: chain-snatching/theft/burglary/vehicle-theft cases
  are deliberately weighted toward October–December (festival/wedding season) — a trend
  analyst should be able to query "theft trend by month" and see the spike without it being
  hand-labeled.
- **Cyber crime grows year over year** (2024 → 2025 → 2026 weighting skews upward and toward
  Bengaluru Urban, Mysuru, Dakshina Kannada, Dharwad), simulating the real national trend of
  rising digital fraud.
- **Case status follows case age**: a FIR registered last month is never shown as "Closed –
  Convicted"; older cases progress through Under Investigation → Charge Sheeted → a closure
  status, with a matching `CaseStatusHistory` trail and, where relevant, a `ChargesheetDetails`
  row — so investigator-decision-support timeline queries return coherent, non-contradictory
  case histories.
- **Sensitive demographic fields are broad statutory categories** (`CasteMaster` holds
  General/OBC/SC/ST/Other, not individual caste names) — usable for the required cohort-level
  socio-demographic analysis without creating an individually re-identifying or needlessly
  granular sensitive dataset.

## 3. Deliberately seeded investigative storylines

These exist specifically so the network-analysis, offender-profiling, financial-crime, and
early-warning demos have something real to find — not just plausible-looking noise.

### a) Eight organized-crime clusters (pillar 2 — criminal network analysis)
Each gang's members appear as `Accused` rows across 6–10 separate `CaseMaster` records, so a
2–3 hop graph traversal genuinely surfaces the cluster. See `storyline_summary.md` for the full
table of gang names, districts, member names, and linked `CaseMasterID`s — for example, the
**"OTP/Cyber Fraud Call Ring"** spans 10 cases across Bengaluru Urban and Mysuru with 6 members
appearing in overlapping combinations.

### b) Layered money-mule chains (pillar 7 — financial crime linkage)
For the two fraud-themed gangs, `SuspectAccount` + `FinancialTransaction` rows form a genuine
multi-hop mule chain (victim funds → mule account 1 → mule account 2 → kingpin account), flagged
`Flagged = TRUE`, reused across multiple cases — a "trace the money" query has a real path to
walk instead of a single isolated transaction.

### c) ~70 repeat offenders (pillar 5 — offender profiling)
A pool of individuals reused by name/age-progression/home-district across 2–5 separate,
unrelated FIRs (see the sample table in `storyline_summary.md`). Note the schema has no global
offender-ID table, so re-identification depends on name + age + district — this is deliberate:
it mirrors the actual entity-resolution problem your platform's graph/NL2SQL layer has to solve
in a real FIR system with the same limitation.

### d) A 35-case digital-arrest-scam spike in Bengaluru Urban, March–April 2026
(pillar 8 — forecasting & early warning). Concentrated tightly in a 6-week window and one
district — a genuine emerging-cluster signal that a trend-alert query should be able to catch
before it's obvious in the raw numbers.

### e) `OffenderRiskScore` with explainable factors
Computed via an interpretable heuristic (not a black box): `10 + 14×prior_case_count +
10×heinous_case_count + recency_bonus`, capped at 100. Each row's `TopFactors` JSON lists the
exact contribution of each factor — directly usable for the explainability requirement (pillar 9)
without needing a real SHAP model at demo time.

## 4. Files in this delivery

- **`karnataka_crime_data.sql`** — PostgreSQL-compatible `INSERT` statements, ordered to respect
  foreign keys. Run after `Crime_Platform_Complete_Schema.sql`.
- **`karnataka_crime_csv.zip`** — every table as an individual CSV (for xlsx/pandas/BI-tool use,
  or for loading into a different database).
- **`karnataka_crime.db`** — the SQLite working copy used to generate everything, useful for
  quick local querying without standing up Postgres.
- **`storyline_summary.md`** — the gang/repeat-offender lookup tables referenced above, with
  exact `CaseMasterID`s and names to query live during a demo.

## 5. What's intentionally NOT populated

- **`CaseNarrativeEmbedding`** — left empty. Embeddings should be generated by your actual
  embedding model against the `BriefFacts` text at ingestion time, not faked here.
- **`QueryAuditLog`** — left empty by design; it's populated at runtime by the platform itself,
  not a seed table.

## 6. Loading it

```bash
psql -d your_db -f Crime_Platform_Complete_Schema.sql
psql -d your_db -f karnataka_crime_data.sql
```
