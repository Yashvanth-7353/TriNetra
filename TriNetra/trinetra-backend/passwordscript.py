import psycopg2
import bcrypt
import os
from dotenv import load_dotenv

load_dotenv()

def initialize_passwords():
    print("Attempting to connect to database...")
    try:
        conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
        cur = conn.cursor()
        
        # Test connection
        cur.execute("SELECT count(*) FROM Employee")
        count = cur.fetchone()[0]
        print(f"Connection successful. Found {count} employees in the Employee table.")
        
        if count == 0:
            print("ERROR: No employees found. Please check your database connection or verify the 'Employee' table is populated.")
            return

        password = b"1234"
        hashed = bcrypt.hashpw(password, bcrypt.gensalt()).decode('utf-8')
        
        cur.execute("SELECT employeeid FROM Employee")
        employees = cur.fetchall()
        
        for (emp_id,) in employees:
            cur.execute("""
                INSERT INTO EmployeeCredentials (employeeid, password_hash)
                VALUES (%s, %s)
                ON CONFLICT (employeeid) DO UPDATE SET password_hash = EXCLUDED.password_hash
            """, (emp_id, hashed))
        
        conn.commit()
        print(f"Success: Hashed '1234' assigned to {count} employees.")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"CRITICAL ERROR: {e}")

if __name__ == "__main__":
    initialize_passwords()