"""
Financial Intelligence Engine — Evidence-Grounded Money Trail Analysis

Discovers real financial relationships between:
- Accused persons → Bank accounts → Transactions → Other accounts → Other persons
- Cross-case financial links
- Shared account relationships
- Transaction chains
- Anomalous patterns (deterministic, data-driven)

All outputs are derived from actual SuspectAccount and FinancialTransaction data.
No fabricated relationships, no invented scores, no LLM-generated claims.
"""

import os
import psycopg2
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Optional


class FinancialIntelligenceEngine:
    """
    Discovers financial relationships connecting accused persons, accounts,
    transactions, and cases from the real database.

    Data model:
        Accused (AccusedMasterID, AccusedName, CaseMasterID)
            ↓ AccusedMasterID
        SuspectAccount (AccountID, AccountNumber, BankName, AccusedMasterID)
            ↓ AccountID
        FinancialTransaction (TxnID, FromAccountID, ToAccountID, Amount, TxnDate, CaseMasterID, Flagged)
            ↓ CaseMasterID
        CaseMaster (CaseMasterID, CrimeNo, CrimeRegisteredDate, ...)
    """

    def __init__(self):
        self.db_url = os.getenv("NEON_DATABASE_URL")

    def _get_conn(self):
        return psycopg2.connect(self.db_url)

    # ─────────────────────────────────────────────────────
    # PUBLIC: Full financial analysis for investigation context
    # ─────────────────────────────────────────────────────

    def analyze_financial_relationships(
        self,
        accused_ids: list = None,
        case_ids: list = None,
        date_from: str = None,
        date_to: str = None,
    ) -> dict:
        """
        Analyze financial relationships starting from investigation entities.

        Args:
            accused_ids: AccusedMasterIDs to start from
            case_ids: CaseMasterIDs to scope to
            date_from: ISO date string for time filter
            date_to: ISO date string for time filter

        Returns:
            {
                "accounts": [...],           # SuspectAccount records for accused
                "transactions": [...],        # FinancialTransaction records
                "person_account_map": {...},  # person -> accounts mapping
                "cross_case_links": [...],    # accounts connecting multiple cases
                "shared_accounts": [...],     # accounts linked to multiple accused
                "transaction_chains": [...],  # multi-hop transaction paths
                "anomalies": [...],           # deterministic anomaly signals
                "graph": {                    # graph visualization data
                    "nodes": [...],
                    "edges": [...]
                },
                "summary": {...},             # aggregate statistics
                "scope": {...},               # resolved scope
            }
        """
        conn = self._get_conn()
        cur = conn.cursor()

        try:
            # Step 1: Resolve investigation entities to accounts
            accounts = self._get_accounts_for_entities(cur, accused_ids, case_ids)

            if not accounts:
                return self._empty_result(
                    "No suspect accounts found for the investigation entities."
                )

            # Step 2: Get all transactions involving those accounts
            account_ids = list(set(a["account_id"] for a in accounts))
            transactions = self._get_transactions(
                cur, account_ids, case_ids, date_from, date_to
            )

            # Step 3: Expand to connected accounts (counterparties)
            expanded_account_ids = set(account_ids)
            for txn in transactions:
                if txn["from_account_id"] not in expanded_account_ids:
                    expanded_account_ids.add(txn["from_account_id"])
                if txn["to_account_id"] not in expanded_account_ids:
                    expanded_account_ids.add(txn["to_account_id"])

            # Get info on expanded (counterparty) accounts
            expanded_accounts = self._get_accounts_by_ids(
                cur, list(expanded_account_ids - set(account_ids))
            )

            all_accounts = accounts + expanded_accounts
            account_map = {a["account_id"]: a for a in all_accounts}

            # Step 4: Build person-account mapping
            person_account_map = self._build_person_account_map(all_accounts)

            # Step 5: Detect cross-case financial links
            cross_case_links = self._detect_cross_case_links(
                cur, transactions, account_map
            )

            # Step 6: Detect shared accounts
            shared_accounts = self._detect_shared_accounts(all_accounts)

            # Step 7: Detect transaction chains
            transaction_chains = self._detect_transaction_chains(
                transactions, account_map
            )

            # Step 8: Detect deterministic anomalies
            anomalies = self._detect_anomalies(transactions, account_map)

            # Step 9: Build graph
            graph = self._build_financial_graph(
                all_accounts, transactions, account_map, person_account_map
            )

            # Step 10: Summary
            summary = self._build_summary(
                accounts, transactions, cross_case_links, shared_accounts,
                anomalies, expanded_account_ids, account_map
            )

            return {
                "accounts": accounts,
                "counterparty_accounts": expanded_accounts,
                "transactions": transactions,
                "person_account_map": person_account_map,
                "cross_case_links": cross_case_links,
                "shared_accounts": shared_accounts,
                "transaction_chains": transaction_chains,
                "anomalies": anomalies,
                "graph": graph,
                "summary": summary,
                "scope": {
                    "accused_ids": accused_ids,
                    "case_ids": case_ids,
                    "date_from": date_from,
                    "date_to": date_to,
                    "total_accounts": len(all_accounts),
                    "total_transactions": len(transactions),
                },
            }
        finally:
            conn.close()

    # ─────────────────────────────────────────────────────
    # Step 1: Get accounts for investigation entities
    # ─────────────────────────────────────────────────────

    def _get_accounts_for_entities(self, cur, accused_ids, case_ids):
        """Get SuspectAccount records linked to accused or cases.
        If no filters provided, return all accounts."""
        results = []
        seen_ids = set()

        if accused_ids:
            placeholders = ",".join(["%s"] * len(accused_ids))
            cur.execute(f"""
                SELECT sa.AccountID, sa.AccusedMasterID, sa.AccountNumber, sa.BankName, sa.IFSC,
                       a.AccusedName, a.CaseMasterID, cm.CrimeNo, cm.CrimeRegisteredDate
                FROM SuspectAccount sa
                JOIN Accused a ON sa.AccusedMasterID = a.AccusedMasterID
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                WHERE sa.AccusedMasterID IN ({placeholders})
            """, accused_ids)
            for r in cur.fetchall():
                acct = self._row_to_account(r)
                results.append(acct)
                seen_ids.add(acct["account_id"])

        if case_ids:
            placeholders = ",".join(["%s"] * len(case_ids))
            cur.execute(f"""
                SELECT sa.AccountID, sa.AccusedMasterID, sa.AccountNumber, sa.BankName, sa.IFSC,
                       a.AccusedName, a.CaseMasterID, cm.CrimeNo, cm.CrimeRegisteredDate
                FROM SuspectAccount sa
                JOIN Accused a ON sa.AccusedMasterID = a.AccusedMasterID
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                WHERE a.CaseMasterID IN ({placeholders})
            """, case_ids)
            for r in cur.fetchall():
                acct = self._row_to_account(r)
                if acct["account_id"] not in seen_ids:
                    results.append(acct)
                    seen_ids.add(acct["account_id"])

        # If no specific scope, return all accounts
        if not accused_ids and not case_ids:
            cur.execute("""
                SELECT sa.AccountID, sa.AccusedMasterID, sa.AccountNumber, sa.BankName, sa.IFSC,
                       a.AccusedName, a.CaseMasterID, cm.CrimeNo, cm.CrimeRegisteredDate
                FROM SuspectAccount sa
                JOIN Accused a ON sa.AccusedMasterID = a.AccusedMasterID
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                ORDER BY sa.AccountID
            """)
            for r in cur.fetchall():
                results.append(self._row_to_account(r))

        return results

    def _row_to_account(self, r):
        return {
            "account_id": r[0],
            "accused_master_id": r[1],
            "account_number": r[2],
            "bank_name": r[3],
            "ifsc": r[4],
            "accused_name": r[5],
            "case_master_id": r[6],
            "crime_no": r[7],
            "crime_registered_date": str(r[8]) if r[8] else None,
            "is_counterparty": False,
        }

    def _get_accounts_by_ids(self, cur, account_ids):
        """Get account info for counterparty accounts."""
        if not account_ids:
            return []
        placeholders = ",".join(["%s"] * len(account_ids))
        cur.execute(f"""
            SELECT sa.AccountID, sa.AccusedMasterID, sa.AccountNumber, sa.BankName, sa.IFSC,
                   a.AccusedName, a.CaseMasterID, cm.CrimeNo, cm.CrimeRegisteredDate
            FROM SuspectAccount sa
            LEFT JOIN Accused a ON sa.AccusedMasterID = a.AccusedMasterID
            LEFT JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
            WHERE sa.AccountID IN ({placeholders})
        """, account_ids)
        results = []
        for r in cur.fetchall():
            acct = self._row_to_account(r)
            acct["is_counterparty"] = True
            results.append(acct)
        return results

    # ─────────────────────────────────────────────────────
    # Step 2: Get transactions
    # ─────────────────────────────────────────────────────

    def _get_transactions(self, cur, account_ids, case_ids, date_from, date_to):
        """Get FinancialTransaction records involving the given accounts."""
        if not account_ids:
            return []

        placeholders = ",".join(["%s"] * len(account_ids))
        conditions = [f"(ft.FromAccountID IN ({placeholders}) OR ft.ToAccountID IN ({placeholders}))"]
        params = account_ids + account_ids

        if case_ids:
            case_placeholders = ",".join(["%s"] * len(case_ids))
            conditions.append(f"ft.CaseMasterID IN ({case_placeholders})")
            params.extend(case_ids)

        if date_from:
            conditions.append("ft.TxnDate >= %s")
            params.append(date_from)
        if date_to:
            conditions.append("ft.TxnDate <= %s")
            params.append(date_to)

        where_clause = " AND ".join(conditions)

        cur.execute(f"""
            SELECT ft.TxnID, ft.FromAccountID, ft.ToAccountID, ft.Amount,
                   ft.TxnDate, ft.CaseMasterID, ft.Flagged,
                   sa1.AccountNumber as from_acct_num, sa1.BankName as from_bank,
                   sa2.AccountNumber as to_acct_num, sa2.BankName as to_bank,
                   a1.AccusedName as from_person, a2.AccusedName as to_person,
                   cm.CrimeNo
            FROM FinancialTransaction ft
            JOIN SuspectAccount sa1 ON ft.FromAccountID = sa1.AccountID
            JOIN SuspectAccount sa2 ON ft.ToAccountID = sa2.AccountID
            LEFT JOIN Accused a1 ON sa1.AccusedMasterID = a1.AccusedMasterID
            LEFT JOIN Accused a2 ON sa2.AccusedMasterID = a2.AccusedMasterID
            LEFT JOIN CaseMaster cm ON ft.CaseMasterID = cm.CaseMasterID
            WHERE {where_clause}
            ORDER BY ft.TxnDate
        """, params)

        results = []
        for r in cur.fetchall():
            # Mask account numbers: show last 4 digits only
            from_masked = f"XXXX-XXXX-{r[7][-4:]}" if r[7] and len(r[7]) >= 4 else r[7]
            to_masked = f"XXXX-XXXX-{r[9][-4:]}" if r[9] and len(r[9]) >= 4 else r[9]

            results.append({
                "txn_id": r[0],
                "from_account_id": r[1],
                "to_account_id": r[2],
                "amount": float(r[3]),
                "txn_date": str(r[4]) if r[4] else None,
                "case_master_id": r[5],
                "flagged": bool(r[6]),
                "from_account_masked": from_masked,
                "from_bank": r[8],
                "to_account_masked": to_masked,
                "to_bank": r[10],
                "from_person": r[11],
                "to_person": r[12],
                "crime_no": r[13],
            })
        return results

    # ─────────────────────────────────────────────────────
    # Step 5: Cross-case financial links
    # ─────────────────────────────────────────────────────

    def _detect_cross_case_links(self, cur, transactions, account_map):
        """
        Detect accounts that appear in transactions across multiple cases.
        These are direct financial evidence connecting different investigations.
        """
        # Group transactions by account
        account_cases = defaultdict(set)
        account_transactions = defaultdict(list)

        for txn in transactions:
            for acct_id in [txn["from_account_id"], txn["to_account_id"]]:
                case_id = txn["case_master_id"]
                account_cases[acct_id].add(case_id)
                account_transactions[acct_id].append(txn["txn_id"])

        cross_case = []
        for acct_id, cases in account_cases.items():
            if len(cases) > 1:
                acct_info = account_map.get(acct_id, {})
                cross_case.append({
                    "account_id": acct_id,
                    "account_masked": acct_info.get("account_number", "Unknown"),
                    "bank_name": acct_info.get("bank_name", "Unknown"),
                    "accused_name": acct_info.get("accused_name", "Unknown"),
                    "connected_cases": list(cases),
                    "case_count": len(cases),
                    "transaction_count": len(account_transactions[acct_id]),
                })

        # Sort by case count (most connected first)
        cross_case.sort(key=lambda x: x["case_count"], reverse=True)
        return cross_case

    # ─────────────────────────────────────────────────────
    # Step 6: Shared accounts
    # ─────────────────────────────────────────────────────

    def _detect_shared_accounts(self, all_accounts):
        """
        Detect cases where multiple accused persons have accounts at the same bank.
        This is a real relationship — shared banking infrastructure.
        """
        # Group accounts by bank
        bank_accounts = defaultdict(list)
        for acct in all_accounts:
            if acct.get("bank_name"):
                bank_accounts[acct["bank_name"]].append(acct)

        shared = []
        for bank, accts in bank_accounts.items():
            if len(accts) < 2:
                continue
            persons = set(a["accused_name"] for a in accts if a.get("accused_name"))
            cases = set(a["case_master_id"] for a in accts if a.get("case_master_id"))

            if len(persons) > 1:
                shared.append({
                    "bank_name": bank,
                    "accounts": [
                        {
                            "account_id": a["account_id"],
                            "account_masked": a.get("account_number", "Unknown"),
                            "accused_name": a.get("accused_name", "Unknown"),
                            "case_master_id": a.get("case_master_id"),
                        }
                        for a in accts
                    ],
                    "person_count": len(persons),
                    "persons": list(persons),
                    "case_count": len(cases),
                })

        shared.sort(key=lambda x: x["person_count"], reverse=True)
        return shared

    # ─────────────────────────────────────────────────────
    # Step 7: Transaction chains
    # ─────────────────────────────────────────────────────

    def _detect_transaction_chains(self, transactions, account_map):
        """
        Detect multi-hop transaction paths: A → B → C → ...
        These represent potential money flow chains.
        """
        if not transactions:
            return []

        # Build adjacency list from transactions
        # Directed: from_account -> [(to_account, txn)]
        adj = defaultdict(list)
        txn_by_ids = {}
        for txn in transactions:
            adj[txn["from_account_id"]].append((txn["to_account_id"], txn))
            txn_by_ids[txn["txn_id"]] = txn

        # Find paths of length >= 2 (at least 3 accounts)
        chains = []
        visited_chains = set()

        def dfs(account_id, path, visited_accts):
            if len(path) >= 2:  # At least 2 transactions
                chain_key = tuple(t["txn_id"] for t in path)
                if chain_key not in visited_chains:
                    visited_chains.add(chain_key)
                    chains.append({
                        "path_length": len(path),
                        "total_amount": sum(t["amount"] for t in path),
                        "transactions": path,
                        "accounts_involved": len(set(
                            [path[0]["from_account_id"]] +
                            [t["to_account_id"] for t in path]
                        )),
                    })

            if len(path) >= 3:  # Don't go too deep
                return

            for next_acct, next_txn in adj.get(account_id, []):
                if next_txn["txn_id"] not in {t["txn_id"] for t in path}:
                    if next_acct not in visited_accts or len(path) < 2:
                        path.append(next_txn)
                        visited_accts.add(next_acct)
                        dfs(next_acct, path, visited_accts)
                        path.pop()

        # Start DFS from each account that has outgoing transactions
        seen_starts = set()
        for txn in transactions:
            start = txn["from_account_id"]
            if start in seen_starts:
                continue
            seen_starts.add(start)
            dfs(start, [txn], {start, txn["to_account_id"]})

        # Deduplicate by the set of involved accounts
        unique_chains = []
        seen_account_sets = set()
        chains.sort(key=lambda x: x["total_amount"], reverse=True)
        for chain in chains:
            # Create a key from the set of all account IDs in the chain
            acct_set = frozenset(
                [chain["transactions"][0]["from_account_id"]] +
                [t["to_account_id"] for t in chain["transactions"]]
            )
            if acct_set not in seen_account_sets:
                seen_account_sets.add(acct_set)
                unique_chains.append(chain)

        return unique_chains[:5]  # Top 5 unique chains

    # ─────────────────────────────────────────────────────
    # Step 8: Deterministic anomaly detection
    # ─────────────────────────────────────────────────────

    def _detect_anomalies(self, transactions, account_map):
        """
        Detect data-driven anomalies. Each anomaly is deterministic and explainable.

        Signals (all from real data):
        1. High-volume account: account appears in many transactions
        2. High-value transaction: amount significantly above median
        3. Rapid movement: multiple transactions within short timeframe for same account
        4. Multi-directional: same pair of accounts with transfers in both directions
        5. Cross-case link: account involved in transactions across multiple cases
        """
        if not transactions:
            return []

        anomalies = []

        # --- Signal 1: High-volume accounts ---
        acct_txn_count = defaultdict(list)
        for txn in transactions:
            acct_txn_count[txn["from_account_id"]].append(txn)
            acct_txn_count[txn["to_account_id"]].append(txn)

        avg_volume = sum(len(v) for v in acct_txn_count.values()) / max(len(acct_txn_count), 1)
        for acct_id, txns in acct_txn_count.items():
            if len(txns) >= avg_volume * 2 and len(txns) >= 4:
                acct = account_map.get(acct_id, {})
                anomalies.append({
                    "type": "high_volume_account",
                    "title": f"High-volume account: {acct.get('accused_name', 'Unknown')}",
                    "reason": f"Account appears in {len(txns)} transactions (average: {avg_volume:.1f})",
                    "account_id": acct_id,
                    "accused_name": acct.get("accused_name"),
                    "transaction_count": len(txns),
                    "evidence": {
                        "signal": "high_volume",
                        "count": len(txns),
                        "threshold": f"{avg_volume:.1f}×2",
                    },
                })

        # --- Signal 2: High-value transactions ---
        amounts = [txn["amount"] for txn in transactions]
        median_amount = sorted(amounts)[len(amounts) // 2]
        for txn in transactions:
            if txn["amount"] > median_amount * 3 and txn["amount"] > 100000:
                anomalies.append({
                    "type": "high_value_transaction",
                    "title": f"High-value transfer: Rs. {txn['amount']:,.0f}",
                    "reason": f"Transaction #{txn['txn_id']} is {txn['amount']/median_amount:.1f}× the median amount (Rs. {median_amount:,.0f})",
                    "txn_id": txn["txn_id"],
                    "amount": txn["amount"],
                    "median": median_amount,
                    "evidence": {
                        "signal": "high_value",
                        "amount": txn["amount"],
                        "median": median_amount,
                        "ratio": round(txn["amount"] / median_amount, 1),
                    },
                })

        # --- Signal 3: Rapid movement ---
        acct_dates = defaultdict(list)
        for txn in transactions:
            if txn["txn_date"]:
                acct_dates[txn["from_account_id"]].append(txn)
                acct_dates[txn["to_account_id"]].append(txn)

        for acct_id, txns in acct_dates.items():
            dates = sorted([t["txn_date"] for t in txns if t["txn_date"]])
            if len(dates) >= 3:
                # Check if 3+ transactions within 7 days
                for i in range(len(dates) - 2):
                    d1 = datetime.strptime(dates[i][:10], "%Y-%m-%d")
                    d3 = datetime.strptime(dates[i + 2][:10], "%Y-%m-%d")
                    if (d3 - d1).days <= 7:
                        acct = account_map.get(acct_id, {})
                        anomalies.append({
                            "type": "rapid_movement",
                            "title": f"Rapid movement: {acct.get('accused_name', 'Unknown')}",
                            "reason": f"{len(txns)} transactions within a short timeframe for this account",
                            "account_id": acct_id,
                            "accused_name": acct.get("accused_name"),
                            "date_range": f"{dates[i]} to {dates[i+2]}",
                            "evidence": {
                                "signal": "rapid_movement",
                                "txn_count_in_window": len(txns),
                                "window_days": (d3 - d1).days,
                            },
                        })
                        break  # Only one anomaly per account

        # --- Signal 4: Bidirectional transfers ---
        pair_directions = defaultdict(set)
        for txn in transactions:
            pair = tuple(sorted([txn["from_account_id"], txn["to_account_id"]]))
            direction = (txn["from_account_id"], txn["to_account_id"])
            pair_directions[pair].add(direction)

        for pair, dirs in pair_directions.items():
            if len(dirs) > 1:
                acct1 = account_map.get(pair[0], {})
                acct2 = account_map.get(pair[1], {})
                total_amount = sum(
                    txn["amount"] for txn in transactions
                    if tuple(sorted([txn["from_account_id"], txn["to_account_id"]])) == pair
                )
                anomalies.append({
                    "type": "bidirectional_transfers",
                    "title": f"Bidirectional: {acct1.get('accused_name', '?')} <-> {acct2.get('accused_name', '?')}",
                    "reason": f"Money flowing in both directions between these accounts (total: Rs. {total_amount:,.0f})",
                    "accounts": list(pair),
                    "total_amount": total_amount,
                    "evidence": {
                        "signal": "bidirectional",
                        "directions": len(dirs),
                        "total_amount": total_amount,
                    },
                })

        return anomalies

    # ─────────────────────────────────────────────────────
    # Step 9: Build financial graph
    # ─────────────────────────────────────────────────────

    def _build_financial_graph(
        self, all_accounts, transactions, account_map, person_account_map
    ):
        """
        Build ReactFlow-compatible graph nodes and edges.
        Node types: person, account, transaction, case
        Edge types: owns, transferred, involved_in
        """
        nodes = []
        edges = []
        node_ids = set()

        # Add person nodes
        persons_added = set()
        for acct in all_accounts:
            person_id = f"person_{acct['accused_master_id']}"
            if person_id not in persons_added and acct.get("accused_master_id"):
                persons_added.add(person_id)
                nodes.append({
                    "id": person_id,
                    "type": "person",
                    "label": acct["accused_name"] or f"Accused #{acct['accused_master_id']}",
                    "data": {
                        "accused_master_id": acct["accused_master_id"],
                        "name": acct["accused_name"],
                    },
                })
                node_ids.add(person_id)

        # Add account nodes
        for acct in all_accounts:
            account_node_id = f"account_{acct['account_id']}"
            masked = acct.get("account_number", "Unknown")
            if masked and len(masked) >= 4:
                masked = f"XXXX-{masked[-4:]}"
            nodes.append({
                "id": account_node_id,
                "type": "account",
                "label": f"{acct['bank_name']}\n{masked}",
                "data": {
                    "account_id": acct["account_id"],
                    "bank_name": acct["bank_name"],
                    "account_masked": masked,
                    "is_counterparty": acct.get("is_counterparty", False),
                },
            })
            node_ids.add(account_node_id)

            # Edge: person → account (owns)
            if acct.get("accused_master_id"):
                person_id = f"person_{acct['accused_master_id']}"
                edge_id = f"owns_{person_id}_{account_node_id}"
                edges.append({
                    "id": edge_id,
                    "source": person_id,
                    "target": account_node_id,
                    "type": "owns",
                    "label": "owns account",
                    "data": {"type": "owns"},
                })

        # Add transaction edges (as edges between account nodes)
        for txn in transactions:
            from_id = f"account_{txn['from_account_id']}"
            to_id = f"account_{txn['to_account_id']}"

            if from_id in node_ids and to_id in node_ids:
                edge_id = f"txn_{txn['txn_id']}"
                flag_str = " [FLAGGED]" if txn["flagged"] else ""
                edges.append({
                    "id": edge_id,
                    "source": from_id,
                    "target": to_id,
                    "type": "transferred",
                    "label": f"Rs. {txn['amount']:,.0f}{flag_str}",
                    "data": {
                        "txn_id": txn["txn_id"],
                        "amount": txn["amount"],
                        "date": txn["txn_date"],
                        "flagged": txn["flagged"],
                        "case_master_id": txn["case_master_id"],
                        "crime_no": txn["crime_no"],
                        "from_person": txn["from_person"],
                        "to_person": txn["to_person"],
                    },
                })

        # Add case nodes for linked cases
        case_nodes = set()
        for txn in transactions:
            case_id = txn["case_master_id"]
            case_node_id = f"case_{case_id}"
            if case_node_id not in case_nodes:
                case_nodes.add(case_node_id)
                nodes.append({
                    "id": case_node_id,
                    "type": "case",
                    "label": f"FIR {txn['crime_no']}" if txn["crime_no"] else f"Case #{case_id}",
                    "data": {
                        "case_master_id": case_id,
                        "crime_no": txn["crime_no"],
                    },
                })

        return {"nodes": nodes, "edges": edges}

    # ─────────────────────────────────────────────────────
    # Step 10: Summary
    # ─────────────────────────────────────────────────────

    def _build_summary(
        self, accounts, transactions, cross_case_links, shared_accounts,
        anomalies, expanded_ids, account_map
    ):
        total_amount = sum(t["amount"] for t in transactions)
        flagged_count = sum(1 for t in transactions if t["flagged"])
        flagged_amount = sum(t["amount"] for t in transactions if t["flagged"])

        return {
            "total_accounts": len(accounts) + len([a for a in account_map.values() if a.get("is_counterparty")]),
            "investigation_accounts": len(accounts),
            "counterparty_accounts": len([a for a in account_map.values() if a.get("is_counterparty")]),
            "total_transactions": len(transactions),
            "total_amount": total_amount,
            "flagged_transactions": flagged_count,
            "flagged_amount": flagged_amount,
            "cross_case_links": len(cross_case_links),
            "shared_account_groups": len(shared_accounts),
            "anomalies_detected": len(anomalies),
            "unique_persons": len(set(
                a["accused_name"] for a in account_map.values()
                if a.get("accused_name")
            )),
            "unique_cases": len(set(
                txn["case_master_id"] for txn in transactions
            )),
        }

    def _empty_result(self, message):
        return {
            "accounts": [],
            "counterparty_accounts": [],
            "transactions": [],
            "person_account_map": {},
            "cross_case_links": [],
            "shared_accounts": [],
            "transaction_chains": [],
            "anomalies": [],
            "graph": {"nodes": [], "edges": []},
            "summary": {
                "total_accounts": 0,
                "total_transactions": 0,
                "total_amount": 0,
                "flagged_transactions": 0,
                "flagged_amount": 0,
                "cross_case_links": 0,
                "shared_account_groups": 0,
                "anomalies_detected": 0,
            },
            "scope": {},
            "message": message,
        }

    # ─────────────────────────────────────────────────────
    # Person-account mapping
    # ─────────────────────────────────────────────────────

    def _build_person_account_map(self, all_accounts):
        mapping = defaultdict(list)
        for acct in all_accounts:
            if acct.get("accused_master_id"):
                mapping[acct["accused_master_id"]].append({
                    "account_id": acct["account_id"],
                    "account_number_masked": acct.get("account_number", "Unknown"),
                    "bank_name": acct.get("bank_name", "Unknown"),
                })
        return dict(mapping)


# ─────────────────────────────────────────────────────────
# Financial Lead Generator
# ─────────────────────────────────────────────────────────

class FinancialLeadGenerator:
    """
    Generates evidence-backed financial investigative leads
    from FinancialIntelligenceEngine output.

    Each lead is traceable to actual financial records.
    """

    def generate_leads(self, financial_result: dict, investigation_context: dict = None) -> list:
        """
        Generate financial leads from the analysis result.

        Args:
            financial_result: Output from FinancialIntelligenceEngine.analyze_financial_relationships()
            investigation_context: Optional investigation scope for relevance filtering

        Returns:
            List of lead dicts, each with:
                lead_type, title, reason, evidence_signals, source_engines, action, target
        """
        leads = []

        # 1. Cross-case financial links
        for link in financial_result.get("cross_case_links", []):
            leads.append({
                "lead_type": "financial_cross_case",
                "title": f"Review financial link connecting {link['case_count']} cases via {link['accused_name']}'s account",
                "reason": f"Account {link['account_masked']} ({link['bank_name']}) appears in transactions across {link['case_count']} different cases",
                "evidence_signals": [
                    f"Account linked to {link['case_count']} cases",
                    f"{link['transaction_count']} transactions involving this account",
                    f"Account holder: {link['accused_name']}",
                ],
                "source_engines": ["financial_intelligence"],
                "action": "Review Financial Network",
                "action_type": "view_financial_network",
                "target": {
                    "entity_type": "account",
                    "entity_id": link["account_id"],
                },
                "priority_evidence_count": link["case_count"],
                "connected_cases": link["connected_cases"],
            })

        # 2. Bidirectional transfers
        for anomaly in financial_result.get("anomalies", []):
            if anomaly["type"] == "bidirectional_transfers":
                leads.append({
                    "lead_type": "financial_bidirectional",
                    "title": anomaly["title"],
                    "reason": anomaly["reason"],
                    "evidence_signals": [
                        f"Money flowing in both directions",
                        f"Total amount: Rs. {anomaly['total_amount']:,.0f}",
                    ],
                    "source_engines": ["financial_intelligence"],
                    "action": "Review Transaction Pattern",
                    "action_type": "view_financial_network",
                    "target": {
                        "entity_type": "account_pair",
                        "entity_id": anomaly["accounts"],
                    },
                    "priority_evidence_count": 2,
                })

        # 3. High-volume accounts
        for anomaly in financial_result.get("anomalies", []):
            if anomaly["type"] == "high_volume_account":
                leads.append({
                    "lead_type": "financial_high_volume",
                    "title": anomaly["title"],
                    "reason": anomaly["reason"],
                    "evidence_signals": [
                        f"{anomaly['transaction_count']} transactions",
                        f"Signal: high transaction volume",
                    ],
                    "source_engines": ["financial_intelligence"],
                    "action": "Review Account Activity",
                    "action_type": "view_financial_network",
                    "target": {
                        "entity_type": "account",
                        "entity_id": anomaly["account_id"],
                    },
                    "priority_evidence_count": 1,
                })

        # 4. Shared bank relationships between accused
        for shared in financial_result.get("shared_accounts", []):
            if shared["person_count"] > 1:
                leads.append({
                    "lead_type": "financial_shared_bank",
                    "title": f"Review {shared['bank_name']} accounts shared by {shared['person_count']} accused",
                    "reason": f"{shared['person_count']} accused persons maintain accounts at {shared['bank_name']}: {', '.join(shared['persons'])}",
                    "evidence_signals": [
                        f"{shared['person_count']} accused at same bank",
                        f"Persons: {', '.join(shared['persons'])}",
                    ],
                    "source_engines": ["financial_intelligence"],
                    "action": "Review Bank Relationship",
                    "action_type": "view_financial_network",
                    "target": {
                        "entity_type": "bank",
                        "entity_id": shared["bank_name"],
                    },
                    "priority_evidence_count": shared["person_count"],
                })

        # 5. Transaction chains
        for chain in financial_result.get("transaction_chains", []):
            if chain["path_length"] >= 2:
                accounts_involved = chain["accounts_involved"]
                leads.append({
                    "lead_type": "financial_chain",
                    "title": f"Review {chain['path_length']}-step transaction chain ({accounts_involved} accounts)",
                    "reason": f"Transaction chain involving {accounts_involved} accounts with total flow of Rs. {chain['total_amount']:,.0f}",
                    "evidence_signals": [
                        f"{chain['path_length']}-step chain",
                        f"{accounts_involved} accounts involved",
                        f"Total: Rs. {chain['total_amount']:,.0f}",
                    ],
                    "source_engines": ["financial_intelligence"],
                    "action": "Trace Money Flow",
                    "action_type": "view_financial_network",
                    "target": {
                        "entity_type": "chain",
                        "entity_id": [t["txn_id"] for t in chain["transactions"]],
                    },
                    "priority_evidence_count": chain["path_length"],
                })

        return leads
