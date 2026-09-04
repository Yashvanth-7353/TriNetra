"""
Catalyst Data Store chat persistence service.

Persistent chat history lives in three manually-created Catalyst Data Store
tables (schemas were provided and are NOT created/modified by this code):

    chat_conversations     (table id 4600600000055002)
    chat_messages          (table id 4600600000055373)
    investigation_context  (table id 4600600000055748)

OWNERSHIP MODEL
---------------
``chat_conversations`` has no application-level ``employee_id`` column and
``CREATORID`` is the Catalyst user (in AppSail the service/request principal,
not a TriNetra employee), so neither can represent "this conversation belongs
to employee X". Ownership is therefore carried by ``chat_messages.employee_id``
(MANDATORY, application-owned): every message written to a conversation is
written with the *authenticated* employee id, and a conversation belongs to
the employee whose messages it contains. All reads/writes filter on that
column server-side, so knowing another user's ``conversation_id`` yields
nothing (queries return empty -> neutral 404).

SCOPE / SECURITY
----------------
- Employee identity is always derived from the JWT by the caller; this module
  never accepts an identity as authoritative — it only filters by the identity
  the caller passes in.
- Values interpolated into ZCQL are restricted to UUID-validated conversation
  ids and integer employee ids, so query string building cannot be injected
  into. Writes go through the SDK Table component (JSON bodies).
- No secrets are ever persisted: only chat content, resolved intent/engines
  and structured context IDs.

FAILURE MODE
------------
The investigation pipeline must never die because chat persistence failed.
Every public method raises ``ChatStoreError`` on failure; the orchestration
layer (app.py) catches it, logs, and still returns the investigation result.

BACKENDS
--------
- ``CatalystChatStore``  — official ``zcatalyst_sdk`` against Catalyst Data
  Store. Requires ``CATALYST_AUTH`` (JSON credential string) +
  ``CATALYST_OPTIONS`` (JSON project config) for non-AppSail runs; inside
  AppSail the SDK initializes from the request context.
- ``InMemoryChatStore``  — deterministic in-memory implementation of the same
  interface. Used when Catalyst is not configured (dev/demo) and by tests.
  Persistence does NOT survive a restart in this mode (logged at startup).
"""

import json
import logging
import os
import threading
import time
import uuid as uuid_lib
from datetime import datetime, timezone

logger = logging.getLogger("trinetra.chat_persistence")

# ── Catalyst Data Store table identifiers (manually created, do not change) ──
CONVERSATIONS_TABLE_ID = 4600600000055002
MESSAGES_TABLE_ID = 4600600000055373
CONTEXT_TABLE_ID = 4600600000055748

CONVERSATIONS_TABLE = "chat_conversations"
MESSAGES_TABLE = "chat_messages"
CONTEXT_TABLE = "investigation_context"

_CONVERSATION_COLUMNS = (
    "ROWID", "conversation_id", "title", "status",
    "last_case_id", "last_intent", "last_activity_at",
)
_MESSAGE_COLUMNS = (
    "ROWID", "message_id", "conversation_id", "employee_id", "role",
    "content", "intent", "engine", "created_at",
)
_CONTEXT_COLUMNS = (
    "ROWID", "conversation_id", "employee_id", "resolved_scope",
    "case_ids", "accused_ids", "transaction_ids",
    "last_intent", "last_engines", "updated_at",
)

_UUID_RE = r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
import re
_UUID_PATTERN = re.compile(_UUID_RE)


class ChatStoreError(Exception):
    """Raised when chat persistence fails. Callers must treat this as
    non-fatal for the investigation pipeline."""


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _to_json_list(ids) -> str:
    """Deterministic JSON array of string ids (never Python repr)."""
    items = []
    for value in ids or []:
        try:
            items.append(str(int(value)))
        except (TypeError, ValueError):
            continue
    return json.dumps(items, separators=(",", ":"))


def _parse_json_list(raw) -> list:
    """Safely parse a persisted ID list with fallback for old/malformed rows."""
    if not raw:
        return []
    if isinstance(raw, list):
        return [str(v) for v in raw]
    text = str(raw).strip()
    if not text:
        return []
    if text.startswith("["):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return [str(v) for v in parsed]
        except (ValueError, TypeError):
            pass
        try:
            import ast
            parsed = ast.literal_eval(text)  # tolerate legacy repr-style rows
            if isinstance(parsed, list):
                return [str(v) for v in parsed]
        except (ValueError, SyntaxError, TypeError):
            pass
    # Fallback: comma-separated plain list from an older write. A bare word
    # with no separators is not a list and must not be treated as one.
    if "," in text:
        out = []
        for part in text.split(","):
            cleaned = part.strip().strip("[]'\" ")
            if cleaned:
                out.append(cleaned)
        return out
    return []


def _parse_json_dict(raw) -> dict:
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        parsed = json.loads(str(raw))
        return parsed if isinstance(parsed, dict) else {}
    except (ValueError, TypeError):
        return {}


def _valid_uuid(value) -> bool:
    return isinstance(value, str) and bool(_UUID_PATTERN.match(value))


class ChatStore:
    """Interface for persistent chat storage.

    All methods are conversation-scoped AND employee-scoped: a caller that
    does not own the conversation observes the same result as a caller that
    asks for a nonexistent conversation.
    """

    def create_conversation(self, conversation_id: str, employee_id, title: str) -> dict:
        raise NotImplementedError

    def get_conversations_for_employee(self, employee_id, limit: int = 100) -> list:
        raise NotImplementedError

    def get_conversation(self, conversation_id: str, employee_id) -> dict:
        raise NotImplementedError

    def claim_or_get(self, conversation_id: str, employee_id) -> dict:
        """Like get_conversation, but also returns an EMPTY conversation so its
        first message can establish ownership.

        ``chat_conversations`` has no employee column, so ownership exists only
        once the first message (written with the authenticated employee id)
        exists. An empty conversation contains no data, so letting the first
        writer claim it cannot expose anything; after that, ownership is
        enforced exactly like get_conversation."""
        raise NotImplementedError

    def save_message(self, conversation_id: str, employee_id, role: str,
                     content: str, intent: str = None, engine: str = None) -> dict:
        raise NotImplementedError

    def get_messages(self, conversation_id: str, employee_id,
                     limit: int = 100) -> list:
        raise NotImplementedError

    def get_investigation_context(self, conversation_id: str, employee_id) -> dict:
        raise NotImplementedError

    def upsert_investigation_context(self, conversation_id: str, employee_id,
                                     context_row: dict) -> None:
        raise NotImplementedError

    def update_conversation(self, conversation_id: str, employee_id,
                            updates: dict) -> None:
        raise NotImplementedError

    def delete_conversation(self, conversation_id: str, employee_id) -> bool:
        raise NotImplementedError


class InMemoryChatStore(ChatStore):
    """Deterministic in-memory backend (dev/demo/tests).

    Implements the exact same interface and serialization as the Catalyst
    backend so tests exercise the real orchestration path. Data does not
    survive a process restart — that is the documented difference.
    """

    def __init__(self):
        self._conversations = {}
        self._messages = {}
        self._context = {}
        self._lock = threading.Lock()

    def create_conversation(self, conversation_id: str, employee_id, title: str) -> dict:
        now = utc_now_iso()
        with self._lock:
            self._conversations[conversation_id] = {
                "conversation_id": conversation_id,
                "title": title,
                "status": "active",
                "last_case_id": None,
                "last_intent": None,
                "last_activity_at": now,
                "_employee_id": str(employee_id),
                "_created_at": now,
            }
            return dict(self._conversations[conversation_id])

    def get_conversations_for_employee(self, employee_id, limit: int = 100) -> list:
        me = str(employee_id)
        owned = []
        with self._lock:
            for conv in self._conversations.values():
                if conv.get("_employee_id") == me and self._messages.get(conv["conversation_id"]):
                    owned.append(dict(conv))
        owned.sort(key=lambda c: c.get("last_activity_at") or "", reverse=True)
        return owned[:limit]

    def get_conversation(self, conversation_id: str, employee_id) -> dict:
        me = str(employee_id)
        with self._lock:
            conv = self._conversations.get(conversation_id)
            if not conv or conv.get("_employee_id") != me:
                return None
            if not self._messages.get(conversation_id):
                return None
            return dict(conv)

    def claim_or_get(self, conversation_id: str, employee_id) -> dict:
        # In-memory rows record the owner at creation, so an empty conversation
        # is returned only to its own creator (no claim race in this backend).
        me = str(employee_id)
        with self._lock:
            conv = self._conversations.get(conversation_id)
            if not conv or conv.get("_employee_id") != me:
                return None
            return dict(conv)

    def save_message(self, conversation_id: str, employee_id, role: str,
                     content: str, intent: str = None, engine: str = None) -> dict:
        me = str(employee_id)
        message = {
            "message_id": str(uuid_lib.uuid4()),
            "conversation_id": conversation_id,
            "employee_id": me,
            "role": role,
            "content": content,
            "intent": intent,
            "engine": engine,
            "created_at": utc_now_iso(),
        }
        with self._lock:
            self._messages.setdefault(conversation_id, []).append(message)
            conv = self._conversations.get(conversation_id)
            if conv and conv.get("_employee_id") == me:
                conv["last_activity_at"] = message["created_at"]
        return message

    def get_messages(self, conversation_id: str, employee_id, limit: int = 100) -> list:
        me = str(employee_id)
        with self._lock:
            rows = [dict(m) for m in self._messages.get(conversation_id, [])
                    if m.get("employee_id") == me]
        rows.sort(key=lambda m: m.get("created_at") or "")
        return rows[-limit:]

    def get_investigation_context(self, conversation_id: str, employee_id) -> dict:
        me = str(employee_id)
        with self._lock:
            row = self._context.get((conversation_id, me))
            if not row:
                return None
            # Same normalized shape as the Catalyst backend (structured fields
            # parsed from their persisted JSON form).
            return {
                "conversation_id": row.get("conversation_id"),
                "employee_id": row.get("employee_id"),
                "resolved_scope": _parse_json_dict(row.get("resolved_scope")),
                "case_ids": _parse_json_list(row.get("case_ids")),
                "accused_ids": _parse_json_list(row.get("accused_ids")),
                "transaction_ids": _parse_json_list(row.get("transaction_ids")),
                "last_intent": row.get("last_intent"),
                "last_engines": row.get("last_engines"),
                "updated_at": row.get("updated_at"),
            }

    def upsert_investigation_context(self, conversation_id: str, employee_id,
                                     context_row: dict) -> None:
        me = str(employee_id)
        row = {
            "conversation_id": conversation_id,
            "employee_id": me,
            "resolved_scope": _to_json_list([]) if not context_row.get("resolved_scope")
            else json.dumps(context_row.get("resolved_scope"), default=str),
            "case_ids": _to_json_list(context_row.get("discovered_cases", [])),
            "accused_ids": _to_json_list(context_row.get("discovered_accused", [])),
            "transaction_ids": _to_json_list(context_row.get("discovered_transactions", [])),
            "last_intent": context_row.get("last_intent"),
            "last_engines": context_row.get("last_engines"),
            "updated_at": utc_now_iso(),
        }
        with self._lock:
            self._context[(conversation_id, me)] = row

    def update_conversation(self, conversation_id: str, employee_id, updates: dict) -> None:
        me = str(employee_id)
        allowed = {"title", "status", "last_case_id", "last_intent", "last_activity_at"}
        with self._lock:
            conv = self._conversations.get(conversation_id)
            if not conv or conv.get("_employee_id") != me:
                return
            for key, value in updates.items():
                if key in allowed:
                    conv[key] = value

    def delete_conversation(self, conversation_id: str, employee_id) -> bool:
        me = str(employee_id)
        with self._lock:
            conv = self._conversations.get(conversation_id)
            if not conv or conv.get("_employee_id") != me:
                return False
            del self._conversations[conversation_id]
            self._messages.pop(conversation_id, None)
            self._context.pop((conversation_id, me), None)
        return True


class CatalystChatStore(ChatStore):
    """Official zcatalyst_sdk backed store (Catalyst Data Store)."""

    @staticmethod
    def is_configured() -> bool:
        """True when the SDK can be initialized from the environment.

        Two supported configurations:
          * ``CATALYST_AUTH`` (JSON credential string) + ``CATALYST_OPTIONS``
            (JSON with project_id/project_key/project_domain) — local/CI runs
            and any non-AppSail deployment;
          * the AppSail runtime, where the SDK picks up the request context
            via ``zcatalyst_sdk.initialize()``.
        """
        if os.getenv("CATALYST_AUTH") and os.getenv("CATALYST_OPTIONS"):
            return True
        return bool(os.getenv("CATALYST_APPSAIL") or os.getenv("APPSAIL_APP_ID"))

    def __init__(self):
        self._app = None
        self._init_lock = threading.Lock()
        self._init_error = None

    def _get_app(self):
        """Lazily initializes the Catalyst app (once per process)."""
        if self._app is not None:
            return self._app
        with self._init_lock:
            if self._app is not None:
                return self._app
            if self._init_error:
                raise ChatStoreError(self._init_error)
            try:
                self._app = self._initialize_sdk()
            except ChatStoreError:
                raise
            except Exception as exc:  # pragma: no cover - SDK surface
                self._init_error = (
                    "Catalyst SDK initialization failed: %s. "
                    "Set CATALYST_AUTH + CATALYST_OPTIONS (see README) or run inside AppSail."
                    % exc
                )
                logger.error("chat_persistence catalyst init failed: %s", exc)
                raise ChatStoreError(self._init_error)
        return self._app

    def _initialize_sdk(self):
        import zcatalyst_sdk

        auth = os.getenv("CATALYST_AUTH")
        options_raw = os.getenv("CATALYST_OPTIONS")
        if auth and options_raw:
            try:
                options = json.loads(options_raw)
                if not isinstance(options, dict):
                    raise ValueError("CATALYST_OPTIONS must be a JSON object")
            except (ValueError, TypeError) as exc:
                raise ChatStoreError(
                    "CATALYST_OPTIONS is not a valid JSON object: %s" % exc
                )
            from zcatalyst_sdk.credentials import ApplicationDefaultCredential
            return zcatalyst_sdk.initialize_app(
                credential=ApplicationDefaultCredential(), options=options
            )
        # AppSail runtime path: headers injected into the request context.
        try:
            return zcatalyst_sdk.initialize()
        except Exception as exc:  # pragma: no cover - AppSail-only
            raise ChatStoreError(
                "Catalyst is not configured in this environment (no CATALYST_AUTH/"
                "CATALYST_OPTIONS and not running inside AppSail): %s" % exc
            )

    # ── low-level helpers ────────────────────────────────────────────────

    def _zcql(self, query: str):
        """Executes a read query. Values are already sanitized by callers
        (UUID-validated ids / integer employee ids only)."""
        try:
            return self._get_app().zcql().execute_query(query)
        except ChatStoreError:
            raise
        except Exception as exc:
            raise ChatStoreError("Catalyst ZCQL query failed: %s" % exc)

    @staticmethod
    def _table_rows(query_result):
        """ZCQL results arrive as [{table_name: [rows...]}]; flatten them."""
        rows = []
        for entry in query_result or []:
            if isinstance(entry, dict):
                for value in entry.values():
                    if isinstance(value, list):
                        rows.extend(value)
        return rows

    def _table(self, table_id):
        try:
            return self._get_app().datastore().table(table_id)
        except ChatStoreError:
            raise
        except Exception as exc:  # pragma: no cover
            raise ChatStoreError("Catalyst Data Store access failed: %s" % exc)

    def _ownership_ok(self, conversation_id: str, employee_id) -> bool:
        rows = self._zcql(
            "SELECT conversation_id FROM %s WHERE conversation_id = '%s' AND employee_id = '%s' LIMIT 1"
            % (MESSAGES_TABLE, conversation_id, int(employee_id))
        )
        return bool(self._table_rows(rows))

    def _conversation_row(self, conversation_id: str) -> dict:
        rows = self._zcql(
            "SELECT %s FROM %s WHERE conversation_id = '%s' LIMIT 1"
            % (", ".join(_CONVERSATION_COLUMNS), CONVERSATIONS_TABLE, conversation_id)
        )
        rows = self._table_rows(rows)
        return rows[0] if rows else None

    # ── public API ───────────────────────────────────────────────────────

    def create_conversation(self, conversation_id: str, employee_id, title: str) -> dict:
        now = utc_now_iso()
        row = {
            "conversation_id": conversation_id,
            "title": title,
            "status": "active",
            "last_case_id": None,
            "last_intent": None,
            "last_activity_at": now,
        }
        try:
            self._table(CONVERSATIONS_TABLE_ID).insert_row(row)
        except ChatStoreError:
            raise
        except Exception as exc:
            raise ChatStoreError("Failed to create conversation: %s" % exc)
        return dict(row)

    def get_conversations_for_employee(self, employee_id, limit: int = 100) -> list:
        try:
            rows = self._zcql(
                "SELECT conversation_id FROM %s WHERE employee_id = '%s' "
                "ORDER BY CREATEDTIME DESC LIMIT 300"
                % (MESSAGES_TABLE, int(employee_id))
            )
        except ChatStoreError:
            raise
        conv_ids = []
        for row in self._table_rows(rows):
            cid = row.get("conversation_id")
            if cid and cid not in conv_ids:
                conv_ids.append(cid)
        if not conv_ids:
            return []
        conv_ids = conv_ids[:limit]
        in_clause = ", ".join("'%s'" % cid for cid in conv_ids)
        conv_rows = self._table_rows(self._zcql(
            "SELECT %s FROM %s WHERE conversation_id IN (%s)"
            % (", ".join(_CONVERSATION_COLUMNS), CONVERSATIONS_TABLE, in_clause)
        ))
        # ZCQL results are not guaranteed ordered; sort by last activity.
        conv_rows.sort(key=lambda r: str(r.get("last_activity_at") or ""), reverse=True)
        return conv_rows[:limit]

    def get_conversation(self, conversation_id: str, employee_id) -> dict:
        if not self._ownership_ok(conversation_id, employee_id):
            return None
        return self._conversation_row(conversation_id)

    def claim_or_get(self, conversation_id: str, employee_id) -> dict:
        if self._ownership_ok(conversation_id, employee_id):
            return self._conversation_row(conversation_id)
        # Empty (ownerless) conversation: the row exists but has no messages,
        # so the first message establishes ownership. It contains no data, so
        # this cannot expose another employee's content.
        if not self._conversation_row(conversation_id):
            return None
        rows = self._table_rows(self._zcql(
            "SELECT ROWID FROM %s WHERE conversation_id = '%s' LIMIT 1"
            % (MESSAGES_TABLE, conversation_id)
        ))
        return self._conversation_row(conversation_id) if not rows else None

    def save_message(self, conversation_id: str, employee_id, role: str,
                     content: str, intent: str = None, engine: str = None) -> dict:
        row = {
            "message_id": str(uuid_lib.uuid4()),
            "conversation_id": conversation_id,
            "employee_id": str(int(employee_id)),
            "role": role,
            "content": content,
            "intent": intent,
            "engine": engine,
            "created_at": utc_now_iso(),
        }
        try:
            self._table(MESSAGES_TABLE_ID).insert_row(row)
        except ChatStoreError:
            raise
        except Exception as exc:
            raise ChatStoreError("Failed to persist message: %s" % exc)
        return row

    def get_messages(self, conversation_id: str, employee_id, limit: int = 100) -> list:
        limit = max(1, min(int(limit), 500))
        rows = self._table_rows(self._zcql(
            "SELECT %s FROM %s WHERE conversation_id = '%s' AND employee_id = '%s' "
            "ORDER BY CREATEDTIME ASC LIMIT %d"
            % (", ".join(_MESSAGE_COLUMNS), MESSAGES_TABLE,
               conversation_id, int(employee_id), limit)
        ))
        out = []
        for row in rows:
            out.append({
                "message_id": row.get("message_id"),
                "conversation_id": row.get("conversation_id"),
                "employee_id": row.get("employee_id"),
                "role": row.get("role"),
                "content": row.get("content"),
                "intent": row.get("intent"),
                "engine": row.get("engine"),
                "created_at": row.get("created_at"),
            })
        return out

    def get_investigation_context(self, conversation_id: str, employee_id) -> dict:
        rows = self._table_rows(self._zcql(
            "SELECT %s FROM %s WHERE conversation_id = '%s' AND employee_id = '%s' LIMIT 1"
            % (", ".join(_CONTEXT_COLUMNS), CONTEXT_TABLE,
               conversation_id, int(employee_id))
        ))
        if not rows:
            return None
        row = rows[0]
        return {
            "conversation_id": row.get("conversation_id"),
            "employee_id": row.get("employee_id"),
            "resolved_scope": _parse_json_dict(row.get("resolved_scope")),
            "case_ids": _parse_json_list(row.get("case_ids")),
            "accused_ids": _parse_json_list(row.get("accused_ids")),
            "transaction_ids": _parse_json_list(row.get("transaction_ids")),
            "last_intent": row.get("last_intent"),
            "last_engines": row.get("last_engines"),
            "updated_at": row.get("updated_at"),
        }

    def upsert_investigation_context(self, conversation_id: str, employee_id,
                                     context_row: dict) -> None:
        me = str(int(employee_id))
        columns = {
            "conversation_id": conversation_id,
            "employee_id": me,
            "resolved_scope": json.dumps(context_row.get("resolved_scope") or {}, default=str),
            "case_ids": _to_json_list(context_row.get("discovered_cases", [])),
            "accused_ids": _to_json_list(context_row.get("discovered_accused", [])),
            "transaction_ids": _to_json_list(context_row.get("discovered_transactions", [])),
            "last_intent": context_row.get("last_intent"),
            "last_engines": context_row.get("last_engines"),
            "updated_at": utc_now_iso(),
        }
        try:
            existing = self._table_rows(self._zcql(
                "SELECT ROWID FROM %s WHERE conversation_id = '%s' AND employee_id = '%s' LIMIT 1"
                % (CONTEXT_TABLE, conversation_id, me)
            ))
            if existing:
                self._table(CONTEXT_TABLE_ID).update_row(
                    {"ROWID": existing[0]["ROWID"], **columns}
                )
            else:
                self._table(CONTEXT_TABLE_ID).insert_row(columns)
        except ChatStoreError:
            raise
        except Exception as exc:
            raise ChatStoreError("Failed to persist investigation context: %s" % exc)

    def update_conversation(self, conversation_id: str, employee_id, updates: dict) -> None:
        if not self._ownership_ok(conversation_id, employee_id):
            return
        allowed = {"title", "status", "last_case_id", "last_intent", "last_activity_at"}
        clean = {k: v for k, v in updates.items() if k in allowed}
        if not clean:
            return
        row = self._conversation_row(conversation_id)
        if not row or "ROWID" not in row:
            return
        try:
            self._table(CONVERSATIONS_TABLE_ID).update_row(
                {"ROWID": row["ROWID"], **clean}
            )
        except ChatStoreError:
            raise
        except Exception as exc:
            raise ChatStoreError("Failed to update conversation: %s" % exc)

    def delete_conversation(self, conversation_id: str, employee_id) -> bool:
        if not self._ownership_ok(conversation_id, employee_id):
            return False
        try:
            msg_rows = self._table_rows(self._zcql(
                "SELECT ROWID FROM %s WHERE conversation_id = '%s' LIMIT 1000"
                % (MESSAGES_TABLE, conversation_id)
            ))
            messages_table = self._table(MESSAGES_TABLE_ID)
            for msg in msg_rows:
                messages_table.delete_row(msg["ROWID"])
            ctx_rows = self._table_rows(self._zcql(
                "SELECT ROWID FROM %s WHERE conversation_id = '%s' LIMIT 1"
                % (CONTEXT_TABLE, conversation_id)
            ))
            for ctx in ctx_rows:
                self._table(CONTEXT_TABLE_ID).delete_row(ctx["ROWID"])
            conv = self._conversation_row(conversation_id)
            if conv and "ROWID" in conv:
                self._table(CONVERSATIONS_TABLE_ID).delete_row(conv["ROWID"])
        except ChatStoreError:
            raise
        except Exception as exc:
            raise ChatStoreError("Failed to delete conversation: %s" % exc)
        return True


# ── Factory ──────────────────────────────────────────────────────────────

_store_instance = None
_store_backend = None


def get_chat_store() -> ChatStore:
    """Returns the configured chat store singleton.

    ``CHAT_STORE_BACKEND`` env: ``catalyst`` (fail loudly if not configured),
    ``memory`` (in-memory), ``auto`` (default: Catalyst when configured,
    otherwise in-memory with a logged warning).
    """
    global _store_instance, _store_backend
    backend = os.getenv("CHAT_STORE_BACKEND", "auto").strip().lower()
    if _store_instance is None or backend != _store_backend:
        _store_backend = backend
        if backend == "catalyst":
            if not CatalystChatStore.is_configured():
                raise ChatStoreError(
                    "CHAT_STORE_BACKEND=catalyst but Catalyst is not configured: "
                    "set CATALYST_AUTH + CATALYST_OPTIONS (or run inside AppSail)."
                )
            _store_instance = CatalystChatStore()
        elif backend == "memory":
            _store_instance = InMemoryChatStore()
        else:
            if CatalystChatStore.is_configured():
                _store_instance = CatalystChatStore()
            else:
                logger.warning(
                    "chat_persistence Catalyst not configured (CATALYST_AUTH/CATALYST_OPTIONS "
                    "missing) - falling back to in-memory chat store. History will not "
                    "survive a restart; set CHAT_STORE_BACKEND and Catalyst credentials "
                    "for persistent storage."
                )
                _store_instance = InMemoryChatStore()
    return _store_instance


def reset_chat_store() -> None:
    """Forces the next get_chat_store() call to rebuild (tests)."""
    global _store_instance, _store_backend
    _store_instance = None
    _store_backend = None