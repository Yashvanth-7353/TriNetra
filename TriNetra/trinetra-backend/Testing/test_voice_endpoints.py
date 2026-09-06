"""
Voice Copilot backend tests (Sarvam TTS endpoint).

The Voice Copilot reuses the existing authenticated Sarvam STT and translate
endpoints plus this JWT-protected TTS endpoint. These tests verify the
deterministic auth/validation boundary only — live synthesis needs the Sarvam
API key and is an external service, exactly like the existing STT/translate
endpoints which are not network-tested either.

Run:
    pytest test_voice_endpoints.py -v --tb=short
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
    _APP_OK = True
except Exception as exc:  # pragma: no cover
    _APP_OK = False
    _APP_IMPORT_ERR = exc

needs_app = pytest.mark.skipif(not _APP_OK, reason="backend app not importable")

ANALYST_ID = 96


@needs_app
class TestVoiceEndpoints:
    @classmethod
    def setup_class(cls):
        cls.client = TestClient(backend_app.app, raise_server_exceptions=False)

    def _login(self, employee_id=ANALYST_ID):
        resp = self.client.post(
            "/api/login", json={"employee_id": employee_id, "password": "1234"}
        )
        assert resp.status_code == 200, resp.text
        return {"Authorization": f"Bearer {resp.json()['token']}"}

    def test_tts_requires_auth(self):
        resp = self.client.post(
            "/api/sarvam/tts", json={"text": "Welcome to TriNetra."}
        )
        assert resp.status_code == 401, resp.text

    def test_tts_rejects_empty_text(self):
        headers = self._login()
        resp = self.client.post(
            "/api/sarvam/tts", headers=headers, json={"text": "   "}
        )
        assert resp.status_code == 400, resp.text

    def test_tts_rejects_missing_text_field(self):
        headers = self._login()
        resp = self.client.post("/api/sarvam/tts", headers=headers, json={})
        assert resp.status_code == 422, resp.text  # pydantic validation

    def test_tts_endpoint_exists_for_authenticated_use(self):
        headers = self._login()
        # With no Sarvam key configured the engine fails cleanly with a 500
        # (never an unauthenticated fallback). With a key it returns audio.
        resp = self.client.post(
            "/api/sarvam/tts",
            headers=headers,
            json={"text": "I found ten cases.", "language_code": "en-IN"},
        )
        assert resp.status_code in (200, 500), resp.text
        if resp.status_code == 200:
            body = resp.json()
            assert body.get("audio_base64"), "expected base64 audio"
            assert body.get("audio_format") == "wav"

    def test_stt_and_translate_still_require_auth(self):
        # Regression: existing voice endpoints keep their auth boundary.
        # (FastAPI validates the multipart `file` field before the handler, so
        # an actual upload is required to reach the auth check.)
        resp = self.client.post(
            "/api/sarvam/stt",
            files={"file": ("speech.wav", b"RIFF\x00\x00\x00\x00WAVE", "audio/wav")},
            data={"language_code": "en-IN"},
        )
        assert resp.status_code == 401, resp.text
        assert self.client.post(
            "/api/sarvam/translate", json={"text": "hi"}
        ).status_code == 401