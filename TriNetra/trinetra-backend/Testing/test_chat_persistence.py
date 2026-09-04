"""
Persistent chat history (Catalyst Data Store backed) regression tests.

The Catalyst Data Store tables exist only in the Catalyst console, so these
tests run against the deterministic in-memory implementation of the SAME
store interface that the production CatalystChatStore implements. The
orchestration layer under test (app.py routes + investigation pipeline) is
exercised exactly as it would be in production, including:

  * conversation CRUD + JWT ownership checks (cross-user isolation),
  * user/assistant message persistence (final answer stored verbatim),
  * investigation-context persistence + restoration across "reloads",
  * follow-up resolution after a reload (persisted context anchors entities),
  * new-scope replacement of persisted context,
  * Catalyst-failure mode (investigation must survive persistence failure),
  * malformed persisted-row parsing.

Run:
    pytest test_chat_persistence.py -v --tb=short
"""
import os
import sys

import pytest

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
os.environ.setdefault("CHAT_STORE_BACKEND", "memory")

try:
    from fastapi.testclient import TestClient
    import app as backend_app
    from engines import catalyst_chat_store as chat_persistence
    from engines.catalyst_chat_store import (
        ChatStoreError, InMemoryChatStore,
    )
    _APP_OK = True
except Exception as exc:  # pragma: no cover
    _APP_OK = False
    _APP_IMPORT_ERR = exc

needs_app = pytest.mark.skipif(not _APP_OK, reason="backend app not importable")

ANALYST_ID = 96    # Analyst, Bengaluru Urban -> state-wide access
NARROW_ID = 275    # Investigator, Kodagu (Unit 80) -> station scope
EXACT_FIR = "100050030202600014"


class _FailingSaveStore(InMemoryChatStore):
    """Simulates a Catalyst outage AFTER ownership is verifiable: reads work,
    writes raise, so the investigation result must still reach the user."""

    def __init__(self, fail_save=True, fail_context=False):
        super().__init__()
        self._fail_save = fail_save
        self._fail_context = fail_context

    def save_message(self, *args, **kwargs):
        if self._fail_save:
            raise ChatStoreError("simulated Catalyst Data Store outage (write)")
        return super().save_message(*args, **kwargs)

    def upsert_investigation_context(self, *args, **kwargs):
        if self._fail_context:
            raise ChatStoreError("simulated Catalyst Data Store outage (context)")
        return super().upsert_investigation_context(*args, **kwargs)

    def update_conversation(self, *args, **kwargs):
        raise ChatStoreError("simulated Catalyst Data Store outage (update)")


class _AllDownStore(InMemoryChatStore):
    """Simulates a full Catalyst outage: every store call fails."""

    def __getattribute__(self, name):
        if name in (
            "create_conversation", "get_conversations_for_employee",
            "get_conversation", "claim_or_get", "save_message",
            "get_messages", "get_investigation_context",
            "upsert_investigation_context", "update_conversation",
            "delete_conversation",
        ):
            def _raise(*a, **k):
                raise ChatStoreError("simulated total Catalyst outage")
            return _raise
        return super().__getattribute__(name)


@needs_app
class TestChatPersistence:
    @classmethod
    def setup_class(cls):
        cls._original_store = backend_app.chat_store
        cls.client = TestClient(backend_app.app, raise_server_exceptions=False)

    def setup_method(self):
        backend_app.chat_store = InMemoryChatStore()
        backend_app.session_store.clear()

    def teardown_method(self):
        backend_app.chat_store = self._original_store

    # ── helpers ──────────────────────────────────────────────────────────

    def _login(self, employee_id=ANALYST_ID):
        resp = self.client.post(
            "/api/login", json={"employee_id": employee_id, "password": "1234"}
        )
        assert resp.status_code == 200, resp.text
        return {"Authorization": f"Bearer {resp.json()['token']}"}

    def _create_conversation(self, headers):
        resp = self.client.post("/api/chat/conversations", headers=headers)
        assert resp.status_code == 200, resp.text
        return resp.json()["conversation"]["conversation_id"]

    # ── auth boundaries ─────────────────────────────────────────────────

    def test_conversation_endpoints_require_auth(self):
        assert self.client.get("/api/chat/conversations").status_code == 401
        assert self.client.post("/api/chat/conversations").status_code == 401
        assert self.client.get(
            "/api/chat/conversations/11111111-2222-3333-4444-555555555555"
        ).status_code == 401
        assert self.client.delete(
            "/api/chat/conversations/11111111-2222-3333-4444-555555555555"
        ).status_code == 401

    # ── lifecycle ───────────────────────────────────────────────────────

    def test_create_and_list_conversation(self):
        headers = self._login()
        cid = self._create_conversation(headers)
        assert len(cid) == 36  # UUID
        # A conversation appears in the owner's list once it holds messages
        # (ownership is carried by chat_messages.employee_id).
        empty = self.client.get("/api/chat/conversations", headers=headers)
        assert empty.status_code == 200
        assert empty.json()["conversations"] == []
        resp = self.client.post("/api/chat", headers=headers, json={
            "query": f"What is FIR {EXACT_FIR}?",
            "conversation_id": cid,
        })
        assert resp.status_code == 200, resp.text[:300]
        convs = self.client.get("/api/chat/conversations", headers=headers)
        assert convs.status_code == 200
        data = convs.json()["conversations"]
        assert data and data[0]["conversation_id"] == cid
        assert data[0]["status"] == "active"
        assert data[0]["title"].startswith("FIR")

    def test_invalid_and_unknown_conversation_ids(self):
        headers = self._login()
        assert self.client.get(
            "/api/chat/conversations/not-a-uuid", headers=headers
        ).status_code == 400
        assert self.client.get(
            "/api/chat/conversations/11111111-2222-3333-4444-555555555555",
            headers=headers,
        ).status_code == 404

    # ── message persistence ─────────────────────────────────────────────

    def test_message_persistence_and_verbatim_final_answer(self):
        headers = self._login()
        cid = self._create_conversation(headers)
        resp = self.client.post("/api/chat", headers=headers, json={
            "query": f"What is FIR {EXACT_FIR}?",
            "conversation_id": cid,
        })
        assert resp.status_code == 200, resp.text[:400]
        answer = resp.json().get("answer", "")
        assert EXACT_FIR in answer  # deterministic exact-case facts
        assert resp.json().get("intent_detected") == "exact_case_lookup"

        detail = self.client.get(
            f"/api/chat/conversations/{cid}", headers=headers
        ).json()
        messages = detail["messages"]
        assert [m["role"] for m in messages] == ["user", "assistant"]
        assert messages[0]["content"] == f"What is FIR {EXACT_FIR}?"
        # The final deterministic answer is stored verbatim (never
        # regenerated/paraphrased when the history is loaded).
        assert messages[1]["content"] == answer
        assert messages[1]["intent"] == "exact_case_lookup"
        # Persisted context carries the resolved FIR's case id.
        ctx = detail["investigation_context"]
        assert ctx and ctx["case_ids"], "expected persisted case context"

    def test_conversation_title_is_derived_deterministically(self):
        headers = self._login()
        cid = self._create_conversation(headers)
        self.client.post("/api/chat", headers=headers, json={
            "query": f"Show me the details of FIR {EXACT_FIR}",
            "conversation_id": cid,
        })
        convs = self.client.get("/api/chat/conversations", headers=headers)
        title = convs.json()["conversations"][0]["title"]
        assert title.startswith("FIR"), title

    # ── reload / context restoration ────────────────────────────────────

    def test_followup_after_reload_uses_persisted_context(self):
        headers = self._login()
        cid = self._create_conversation(headers)
        first = self.client.post("/api/chat", headers=headers, json={
            "query": f"What is FIR {EXACT_FIR}?",
            "conversation_id": cid,
        })
        assert first.status_code == 200, first.text[:300]
        persisted_case = self.client.get(
            f"/api/chat/conversations/{cid}", headers=headers
        ).json()["investigation_context"]["case_ids"]
        assert persisted_case

        # Simulate a page refresh: drop every in-memory session profile so the
        # ONLY surviving state is the persisted conversation.
        backend_app.session_store.clear()

        follow = self.client.post("/api/chat", headers=headers, json={
            "query": "Who is connected to it?",
            "conversation_id": cid,
        })
        assert follow.status_code == 200, follow.text[:300]
        assert follow.json().get("intent_detected") == "criminal_network"

        detail = self.client.get(
            f"/api/chat/conversations/{cid}", headers=headers
        ).json()
        assert [m["role"] for m in detail["messages"]] == [
            "user", "assistant", "user", "assistant",
        ]
        # Context was extended by the network turn (entities preserved).
        assert detail["investigation_context"]["case_ids"]

    # ── new scope must not inherit old entities ─────────────────────────

    def test_new_scope_replaces_persisted_context(self):
        headers = self._login()
        cid = self._create_conversation(headers)
        first = self.client.post("/api/chat", headers=headers, json={
            "query": f"Who is connected to FIR {EXACT_FIR}?",
            "conversation_id": cid,
        })
        assert first.status_code == 200, first.text[:300]
        old_case = self.client.get(
            f"/api/chat/conversations/{cid}", headers=headers
        ).json()["investigation_context"]["case_ids"]
        assert old_case

        backend_app.session_store.clear()

        second = self.client.post("/api/chat", headers=headers, json={
            "query": "Now find recurring burglary patterns in Mysuru",
            "conversation_id": cid,
        })
        assert second.status_code == 200, second.text[:300]
        new_ctx = self.client.get(
            f"/api/chat/conversations/{cid}", headers=headers
        ).json()["investigation_context"]
        # New-scope questions deliberately replace old context: the FIR from
        # the previous conversation must not survive into the Mysuru scope.
        remaining = set(new_ctx["case_ids"]) & set(old_case)
        assert not remaining, f"old FIR context leaked: {remaining}"

    # ── cross-user isolation ────────────────────────────────────────────

    def test_cross_user_isolation(self):
        owner = self._login(ANALYST_ID)
        other = self._login(NARROW_ID)
        cid = self._create_conversation(owner)
        resp = self.client.post("/api/chat", headers=owner, json={
            "query": f"What is FIR {EXACT_FIR}?",
            "conversation_id": cid,
        })
        assert resp.status_code == 200, resp.text[:300]

        # Employee B cannot read, write, list or delete A's conversation.
        assert self.client.get(
            f"/api/chat/conversations/{cid}", headers=other
        ).status_code == 404
        assert self.client.delete(
            f"/api/chat/conversations/{cid}", headers=other
        ).status_code == 404
        assert self.client.post("/api/chat", headers=other, json={
            "query": "test", "conversation_id": cid,
        }).status_code == 404
        other_list = self.client.get(
            "/api/chat/conversations", headers=other
        ).json()["conversations"]
        assert other_list == []

        # Owner can delete.
        assert self.client.delete(
            f"/api/chat/conversations/{cid}", headers=owner
        ).status_code == 200
        assert self.client.get(
            f"/api/chat/conversations/{cid}", headers=owner
        ).status_code == 404

    # ── separate conversations never share context ──────────────────────

    def test_two_conversations_do_not_leak_context(self):
        headers = self._login()
        a = self._create_conversation(headers)
        b = self._create_conversation(headers)
        resp_a = self.client.post("/api/chat", headers=headers, json={
            "query": f"Who is connected to FIR {EXACT_FIR}?",
            "conversation_id": a,
        })
        assert resp_a.status_code == 200, resp_a.text[:300]
        ctx_a = self.client.get(
            f"/api/chat/conversations/{a}", headers=headers
        ).json()["investigation_context"]["case_ids"]
        assert ctx_a, "conversation A should anchor to its own FIR"

        # Conversation B is fresh: an entity-first follow-up with NO anchor of
        # its own must never silently inherit A's resolved FIR. The pipeline
        # must answer with an explicit context-required/scope response instead.
        backend_app.session_store.clear()
        resp_b = self.client.post("/api/chat", headers=headers, json={
            "query": "Who is connected to it?",
            "conversation_id": b,
        })
        assert resp_b.status_code == 200, resp_b.text[:300]
        answer_b = resp_b.json().get("answer", "")
        assert EXACT_FIR not in answer_b, "conversation B cited A's FIR"
        ctx_b = self.client.get(
            f"/api/chat/conversations/{b}", headers=headers
        ).json()["investigation_context"] or {}
        # B's persisted context carries none of A's entities.
        assert set(ctx_b.get("case_ids") or []) & set(ctx_a) == set(), (
            f"conversation B inherited A's case context: {ctx_b}"
        )
        self.client.delete(f"/api/chat/conversations/{a}", headers=headers)
        # After deleting A, B still resolves independently.
        assert self.client.get(
            f"/api/chat/conversations/{b}", headers=headers
        ).status_code == 200

    # ── investigation planner endpoint ──────────────────────────────────

    def test_investigate_endpoint_persists_conversation(self):
        headers = self._login()
        cid = self._create_conversation(headers)
        resp = self.client.post("/api/investigate", headers=headers, json={
            "query": "Investigate the criminal network for Accused 3682",
            "conversation_id": cid,
        })
        assert resp.status_code == 200, resp.text[:400]
        detail = self.client.get(
            f"/api/chat/conversations/{cid}", headers=headers
        ).json()
        roles = [m["role"] for m in detail["messages"]]
        assert roles == ["user", "assistant"], roles
        assert "3682" in detail["messages"][0]["content"]

    # ── failure handling ────────────────────────────────────────────────

    def test_catalyst_outage_keeps_stateless_chat_working(self):
        headers = self._login()
        backend_app.chat_store = _AllDownStore()
        # Without a conversation_id the existing stateless flow is unaffected.
        resp = self.client.post("/api/chat", headers=headers, json={
            "query": f"What is FIR {EXACT_FIR}?",
        })
        assert resp.status_code == 200, resp.text[:300]
        assert resp.json().get("intent_detected") == "exact_case_lookup"

    def test_conversation_scoped_request_refuses_when_store_down(self):
        headers = self._login()
        backend_app.chat_store = _AllDownStore()
        resp = self.client.post("/api/chat", headers=headers, json={
            "query": f"What is FIR {EXACT_FIR}?",
            "conversation_id": "11111111-2222-3333-4444-555555555555",
        })
        # Ownership cannot be proven -> honest 503, never an unowned run.
        assert resp.status_code == 503, resp.text

    def test_write_failure_still_returns_investigation_answer(self):
        headers = self._login()
        # Reads/ownership work; writes fail mid-turn (message/context/update).
        store = _FailingSaveStore()
        store.create_conversation(
            "11111111-2222-3333-4444-555555555555", ANALYST_ID, "New Investigation"
        )
        # Seed ownership through the BASE implementation so only the app's
        # mid-turn writes hit the simulated outage.
        InMemoryChatStore.save_message(
            store, "11111111-2222-3333-4444-555555555555", ANALYST_ID,
            "user", "seed message",
        )
        backend_app.chat_store = store
        resp = self.client.post("/api/chat", headers=headers, json={
            "query": f"What is FIR {EXACT_FIR}?",
            "conversation_id": "11111111-2222-3333-4444-555555555555",
        })
        # Persistence failed but the investigation itself must still succeed.
        assert resp.status_code == 200, resp.text[:300]
        assert EXACT_FIR in resp.json().get("answer", "")

    # ── serialization robustness ────────────────────────────────────────

    def test_malformed_persisted_context_parses_safely(self):
        # Old/malformed rows (non-JSON, repr-style) must degrade to empty
        # structured values rather than crashing the restore path.
        raw = chat_persistence._parse_json_list("['2598', '2817']")
        assert raw == ["2598", "2817"], raw
        assert chat_persistence._parse_json_list("garbage") == []
        assert chat_persistence._parse_json_list(None) == []
        assert chat_persistence._parse_json_list('["1","2"]') == ["1", "2"]
        assert chat_persistence._parse_json_dict("not json") == {}
        assert chat_persistence._to_json_list([2598, "1273", "x"]) == '["2598","1273"]'

    def test_message_ordering_is_chronological(self):
        headers = self._login()
        cid = self._create_conversation(headers)
        for query in (
            f"What is FIR {EXACT_FIR}?",
            "Who is connected to it?",
            "Show their transaction trail",
        ):
            resp = self.client.post("/api/chat", headers=headers, json={
                "query": query, "conversation_id": cid,
            })
            assert resp.status_code == 200, resp.text[:300]
            backend_app.session_store.clear()
        messages = self.client.get(
            f"/api/chat/conversations/{cid}", headers=headers
        ).json()["messages"]
        contents = [m["content"] for m in messages]
        assert contents[0].startswith(f"What is FIR {EXACT_FIR}?")
        # Every user message was followed by its persisted assistant answer.
        assert all(messages[i]["role"] == "user" for i in range(0, len(messages), 2))
        assert all(messages[i]["role"] == "assistant" for i in range(1, len(messages), 2))
