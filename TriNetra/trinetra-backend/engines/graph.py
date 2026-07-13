import psycopg2
import os

class GraphEngine:
    def __init__(self):
        self.db_url = os.getenv("NEON_DATABASE_URL")

    def get_criminal_network(self, accused_id: int) -> dict:
        """
        Performs a 2-hop traversal:
        1. Find all Cases linked to the starting Accused.
        2. Find all Co-accused linked to those same Cases.
        """
        try:
            conn = psycopg2.connect(self.db_url)
            cursor = conn.cursor()

            # The 2-hop query: Start with Accused -> Find Cases -> Find all Accused in those cases
            sql = """
                SELECT DISTINCT a2.AccusedName, a2.AccusedMasterID, cm.CrimeNo
                FROM Accused a1
                JOIN CaseMaster cm ON a1.CaseMasterID = cm.CaseMasterID
                JOIN Accused a2 ON cm.CaseMasterID = a2.CaseMasterID
                WHERE a1.AccusedMasterID = %s;
            """
            cursor.execute(sql, (accused_id,))
            results = cursor.fetchall()
            
            cursor.close()
            conn.close()

            network = []
            for name, acc_id, crime_no in results:
                network.append({"name": name, "accused_id": acc_id, "linked_case": crime_no})
            
            return {"network": network}

        except Exception as e:
            return {"error": str(e)}