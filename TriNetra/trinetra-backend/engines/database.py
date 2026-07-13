import pandas as pd
import os

class HybridDataEngine:
    def __init__(self):
        # We point to the local CSVs we generated earlier for lightning-fast local development
        # In production, this class will use: catalyst_app.zcql().execute_query()
        
        # Go up one directory from 'engines' to find the CSVs
        base_dir = os.path.dirname(os.path.dirname(__file__)) 
        self.case_master_path = os.path.join(base_dir, "..", "Catalyst_Schema_CSVs", "CaseMaster.csv")
        
        # Load the data into memory if the file exists
        if os.path.exists(self.case_master_path):
            self.cases_df = pd.read_csv(self.case_master_path)
        else:
            self.cases_df = None

    def search_factual_records(self, keyword: str) -> list:
        """
        Searches the BriefFacts column for a specific keyword.
        Returns the top 3 matching cases.
        """
        if self.cases_df is None or self.cases_df.empty:
            return [{"error": "Data file not found or empty."}]

        # Simple text search (simulating a SQL LIKE query or vector search)
        # Drop NA values and find matches (case-insensitive)
        matches = self.cases_df[self.cases_df['BriefFacts'].fillna('').str.contains(keyword, case=False)]
        
        if matches.empty:
            return []

        # Convert the top 3 results into a clean dictionary list
        results = matches.head(3)[['CrimeNo', 'District', 'BriefFacts']].to_dict(orient='records')
        return results