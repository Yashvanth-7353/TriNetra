"""
Sarvam AI Integration Engine
- Speech-to-Text (STT) using saaras:v2 model
- Kannada <-> English Translation using mayura:v1 model
"""
import os
import requests

SARVAM_API_BASE = "https://api.sarvam.ai"

class SarvamEngine:
    def __init__(self):
        self.api_key = os.getenv("SARVAM_API_KEY", "")
        self.headers = {
            "api-subscription-key": self.api_key
        }

    def speech_to_text(self, audio_bytes: bytes, language_code: str = "kn-IN") -> dict:
        """
        Transcribe audio bytes to text using Sarvam STT API.
        Supports: kn-IN (Kannada), en-IN (English), hi-IN (Hindi), etc.
        """
        if not self.api_key:
            return {"error": "Sarvam API key not configured."}

        try:
            files = {
                "file": ("audio.wav", audio_bytes, "audio/wav"),
            }
            data = {
                "model": "saaras:v3",
                "language_code": language_code,
            }
            
            response = requests.post(
                f"{SARVAM_API_BASE}/speech-to-text",
                headers=self.headers,
                files=files,
                data=data,
                timeout=30
            )
            
            if response.status_code != 200:
                return {"error": f"Sarvam STT API error: {response.status_code} - {response.text}"}
            
            result = response.json()
            transcript = result.get("transcript", "")
            
            return {
                "status": "success",
                "transcript": transcript,
                "language_code": language_code
            }
        except Exception as e:
            return {"error": f"Sarvam STT failed: {str(e)}"}

    def text_to_speech(self, text: str, language_code: str = "en-IN") -> dict:
        """
        Converts text to speech using Sarvam TTS API (bulbul:v2).
        Returns base64-encoded WAV audio in the ``audios`` list.
        Supports: en-IN (English), kn-IN (Kannada), etc.
        """
        if not self.api_key:
            return {"error": "Sarvam API key not configured."}
        if not text or not text.strip():
            return {"error": "Empty text provided for speech synthesis."}
        if len(text) > 1500:
            text = text[:1500].rsplit(" ", 1)[0]

        try:
            payload = {
                "text": text,
                "language_code": language_code,
                "model": "bulbul:v3",
                "speaker": "shubh",
            }
            response = requests.post(
                f"{SARVAM_API_BASE}/text-to-speech",
                headers={**self.headers, "Content-Type": "application/json"},
                json=payload,
                timeout=30
            )
            if response.status_code != 200:
                return {"error": f"Sarvam TTS API error: {response.status_code} - {response.text}"}
            result = response.json()
            audios = result.get("audios") or []
            if not audios:
                return {"error": "Sarvam TTS returned no audio."}
            return {
                "status": "success",
                "audio_base64": "".join(audios),
                "audio_format": "wav",
                "language_code": language_code,
            }
        except Exception as e:
            return {"error": f"Sarvam TTS failed: {str(e)}"}

    def translate(self, text: str, source_lang: str, target_lang: str) -> dict:
        """
        Translate text between languages using Sarvam Translate API.
        Common codes: kn-IN (Kannada), en-IN (English), hi-IN (Hindi)
        """
        if not self.api_key:
            return {"error": "Sarvam API key not configured."}
        
        if not text.strip():
            return {"error": "Empty text provided for translation."}

        try:
            payload = {
                "input": text,
                "source_language_code": source_lang,
                "target_language_code": target_lang,
                "model": "sarvam-translate:v1",
                "enable_preprocessing": True
            }
            
            response = requests.post(
                f"{SARVAM_API_BASE}/translate",
                headers={**self.headers, "Content-Type": "application/json"},
                json=payload,
                timeout=15
            )
            
            if response.status_code != 200:
                return {"error": f"Sarvam Translation API error: {response.status_code} - {response.text}"}
            
            result = response.json()
            translated = result.get("translated_text", "")
            
            return {
                "status": "success",
                "translated_text": translated,
                "source_language": source_lang,
                "target_language": target_lang
            }
        except Exception as e:
            return {"error": f"Sarvam Translation failed: {str(e)}"}

sarvam_engine = SarvamEngine()
