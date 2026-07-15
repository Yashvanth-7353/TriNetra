import os
import jwt
import bcrypt
import psycopg2
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Header

JWT_SECRET = os.getenv("JWT_SECRET", "fallback_secret_key")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24


def authenticate_employee(employee_id: int, password: str) -> dict:
    """
    Validates credentials against the EmployeeCredentials table.
    Returns the full employee profile on success.
    """
    db_url = os.getenv("NEON_DATABASE_URL")
    if not db_url:
        raise HTTPException(status_code=500, detail="Database configuration missing.")

    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()

        # Fetch password hash
        cur.execute(
            "SELECT password_hash FROM EmployeeCredentials WHERE employeeid = %s",
            (employee_id,)
        )
        cred_row = cur.fetchone()

        if not cred_row:
            cur.close()
            conn.close()
            raise HTTPException(status_code=401, detail="Employee ID not found.")

        stored_hash = cred_row[0]

        # Verify bcrypt password
        if not bcrypt.checkpw(password.encode('utf-8'), stored_hash.encode('utf-8')):
            cur.close()
            conn.close()
            raise HTTPException(status_code=401, detail="Invalid password.")

        # Fetch full employee profile with JOINs for readable names
        cur.execute("""
            SELECT 
                e.EmployeeID,
                e.FirstName,
                e.KGID,
                e.EmployeeDOB,
                e.AppointmentDate,
                e.PhysicallyChallenged,
                e.GenderID,
                e.DistrictID,
                e.UnitID,
                e.RankID,
                e.DesignationID,
                d.DistrictName,
                u.UnitName,
                r.RankName,
                des.DesignationName
            FROM Employee e
            LEFT JOIN District d ON e.DistrictID = d.DistrictID
            LEFT JOIN Unit u ON e.UnitID = u.UnitID
            LEFT JOIN Rank r ON e.RankID = r.RankID
            LEFT JOIN Designation des ON e.DesignationID = des.DesignationID
            WHERE e.EmployeeID = %s
        """, (employee_id,))
        emp_row = cur.fetchone()
        cur.close()
        conn.close()

        if not emp_row:
            raise HTTPException(status_code=404, detail="Employee record not found.")

        # Map rank to role for RBAC
        rank_name = emp_row[13] or ""
        role = _map_rank_to_role(rank_name)

        profile = {
            "employee_id": emp_row[0],
            "name": emp_row[1] or "Unknown",
            "kgid": emp_row[2] or "",
            "dob": str(emp_row[3]) if emp_row[3] else None,
            "appointment_date": str(emp_row[4]) if emp_row[4] else None,
            "physically_challenged": bool(emp_row[5]) if emp_row[5] is not None else False,
            "gender_id": emp_row[6],
            "district_id": emp_row[7],
            "unit_id": emp_row[8],
            "rank_id": emp_row[9],
            "designation_id": emp_row[10],
            "district_name": emp_row[11] or "",
            "unit_name": emp_row[12] or "",
            "rank_name": rank_name,
            "designation_name": emp_row[14] or "",
            "role": role,
        }

        return profile

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Authentication error: {str(e)}")


def _map_rank_to_role(rank_name: str) -> str:
    """Maps police rank hierarchy to RBAC roles."""
    rank_lower = rank_name.lower()
    
    # Policymaker-level ranks
    if any(kw in rank_lower for kw in ["dgp", "adgp", "igp", "director"]):
        return "Policymaker"
    
    # Analyst-level ranks
    if any(kw in rank_lower for kw in ["sp", "superintendent", "dysp", "deputy superintendent"]):
        return "Analyst"
    
    # Supervisor-level ranks
    if any(kw in rank_lower for kw in ["inspector", "ci", "circle"]):
        return "Supervisor"
    
    # Default: Investigator
    return "Investigator"


def create_jwt_token(profile: dict) -> str:
    """Creates a signed JWT token containing employee profile data."""
    payload = {
        "employee_id": profile["employee_id"],
        "name": profile["name"],
        "role": profile["role"],
        "district_id": profile["district_id"],
        "unit_id": profile["unit_id"],
        "district_name": profile["district_name"],
        "unit_name": profile["unit_name"],
        "rank_name": profile["rank_name"],
        "designation_name": profile["designation_name"],
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_jwt_token(authorization: str = Header(None)) -> dict:
    """
    FastAPI dependency that extracts and verifies the JWT from the Authorization header.
    Returns the decoded payload.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing.")

    # Support "Bearer <token>" format
    token = authorization
    if authorization.startswith("Bearer "):
        token = authorization[7:]

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token.")


def get_employee_profile(employee_id: int) -> dict:
    """Fetches the full employee profile for the profile page."""
    db_url = os.getenv("NEON_DATABASE_URL")
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        cur.execute("""
            SELECT 
                e.EmployeeID, e.FirstName, e.KGID, e.EmployeeDOB,
                e.AppointmentDate, e.PhysicallyChallenged, e.GenderID,
                e.DistrictID, e.UnitID, e.RankID, e.DesignationID,
                d.DistrictName, u.UnitName, r.RankName, des.DesignationName
            FROM Employee e
            LEFT JOIN District d ON e.DistrictID = d.DistrictID
            LEFT JOIN Unit u ON e.UnitID = u.UnitID
            LEFT JOIN Rank r ON e.RankID = r.RankID
            LEFT JOIN Designation des ON e.DesignationID = des.DesignationID
            WHERE e.EmployeeID = %s
        """, (employee_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()

        if not row:
            return {"error": "Employee not found."}

        rank_name = row[13] or ""
        return {
            "employee_id": row[0],
            "name": row[1] or "Unknown",
            "kgid": row[2] or "",
            "dob": str(row[3]) if row[3] else None,
            "appointment_date": str(row[4]) if row[4] else None,
            "physically_challenged": bool(row[5]) if row[5] is not None else False,
            "gender_id": row[6],
            "district_id": row[7],
            "unit_id": row[8],
            "rank_id": row[9],
            "designation_id": row[10],
            "district_name": row[11] or "",
            "unit_name": row[12] or "",
            "rank_name": rank_name,
            "designation_name": row[14] or "",
            "role": _map_rank_to_role(rank_name),
        }
    except Exception as e:
        return {"error": str(e)}
