"""
Shared test scaffolding for the authenticated FastAPI app.

Every server-side test needs the same three things:
  1. NEON_DATABASE_URL loaded from trinetra-backend/.env BEFORE `import app`
     (engine singletons capture the DB URL at import time);
  2. the backend directory on sys.path so `import app` resolves;
  3. a JWT obtained through the real /api/login endpoint.

`_test_auth_helpers` is deliberately not collected by pytest (leading
underscore). Import it from test modules with:

    from _test_auth_helpers import _load_env, login_token, needs_app, needs_db, API_CLIENT
"""
import os
import sys

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


def _load_env():
    if not os.getenv("NEON_DATABASE_URL"):
        env_path = os.path.join(BACKEND_DIR, ".env")
        if os.path.exists(env_path):
            for line in open(env_path, encoding="utf-8-sig"):
                line = line.strip()
                if "=" in line:
                    k, _, v = line.partition("=")
                    os.environ.setdefault(k.strip(), v.strip().strip('"'))


_load_env()

import pytest  # noqa: E402

try:
    from fastapi.testclient import TestClient  # noqa: E402
    import app as backend_app  # noqa: E402

    _APP_OK = True
except Exception as exc:  # pragma: no cover
    _APP_OK = False
    _APP_IMPORT_ERR = exc

needs_app = pytest.mark.skipif(not _APP_OK, reason="backend app not importable")

API_CLIENT = TestClient(backend_app.app) if _APP_OK else None

# Analyst seed account -> state-wide access (used by default in benchmarks).
ANALYST_ID = 96


def _db_available() -> bool:
    if not _APP_OK or not os.getenv("NEON_DATABASE_URL"):
        return False
    try:
        import psycopg2
        conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM District LIMIT 1")
        cur.fetchone()
        cur.close()
        conn.close()
        return True
    except Exception:
        return False


needs_db = pytest.mark.skipif(not _db_available(), reason="NEON_DATABASE_URL not reachable")


def login_token(employee_id=ANALYST_ID, password="1234"):
    """Returns a fresh JWT via the real /api/login flow, or None on failure."""
    if API_CLIENT is None:
        return None
    resp = API_CLIENT.post(
        "/api/login", json={"employee_id": employee_id, "password": password}
    )
    if resp.status_code != 200:
        return None
    return resp.json().get("token")
