import { useCallback, useEffect, useRef, useState } from 'react';
import {
  transcribeAudio,
  translateText,
  sendChatQuery,
  sendInvestigationQuery,
  isInvestigationRequest,
  synthesizeSpeech,
} from '../../services/api';
import { useConversation } from '../../context/ConversationContext';
import { buildVoiceAnswer, mapResponseToActions, type VoiceAction } from './voiceAnswer';

export type AssistantStatus =
  | 'idle'
  | 'activating'
  | 'greeting'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error';

export type AssistantLang = 'EN' | 'KN';

export interface VoiceAssistantState {
  status: AssistantStatus;
  isOpen: boolean;
  lang: AssistantLang;
  isRecording: boolean;
  lastQuery: string | null;
  lastAnswer: string | null;
  lastActions: VoiceAction[];
  errorMessage: string | null;
}

const WELCOME_EN = 'Welcome to TriNetra. How can I help you?';
const AUTO_STOP_MS = 30_000;
const DEV = import.meta.env.DEV;

/** Development-only pipeline tracing (Phase 1 instrumentation). */
const t0 = { v: 0 };
function trace(event: string, detail?: Record<string, unknown>) {
  if (!DEV) return;
  const now = performance.now();
  if (t0.v === 0) t0.v = now;
  const extra = detail ? ' ' + Object.entries(detail).map(([k, v]) => `${k}=${String(v)}`).join(' ') : '';
  console.info(`[VoiceCopilot] ${event} +${(now - t0.v).toFixed(0)}ms${extra}`);
}

/**
 * Static greeting audio cache. The welcome line never changes, so it is
 * synthesized once per language and replayed instantly on later activations.
 * NEVER used for investigation answers — those are always synthesized fresh
 * because they are user-specific data.
 */
const greetingAudioCache = new Map<string, string>();

/** MediaRecorder output MIME the current browser actually supports. */
function pickRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      /* keep probing */
    }
  }
  return '';
}

function mimeExtension(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return 'm4a';
  return 'wav';
}

function langCode(lang: AssistantLang): string {
  return lang === 'KN' ? 'kn-IN' : 'en-IN';
}

export function useVoiceAssistant() {
  const { conversationId, ensureConversation } = useConversation();

  const [status, setStatus] = useState<AssistantStatus>('idle');
  const [isOpen, setIsOpen] = useState(false);
  const [lang, setLang] = useState<AssistantLang>('EN');
  const [isRecording, setIsRecording] = useState(false);
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [lastAnswer, setLastAnswer] = useState<string | null>(null);
  const [lastActions, setLastActions] = useState<VoiceAction[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sequence guard: async steps from an older interaction are discarded.
  const seqRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recorderMimeRef = useRef('');
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoStopTimerRef = useRef<number | null>(null);
  // True only for a genuine cancel; a normal Stop must still transcribe.
  const cancelledRef = useRef(false);

  /** Stops tracks + clears recorder state. Never decides the transcript fate. */
  const teardownMic = useCallback(() => {
    if (autoStopTimerRef.current !== null) {
      window.clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        /* already stopped */
      }
    }
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsRecording(false);
  }, []);

  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      try {
        audio.pause();
      } catch {
        /* noop */
      }
      audio.src = '';
      audioRef.current = null;
    }
  }, []);

  /** Speaks text through the existing Sarvam TTS path. Resolves on completion.
   *  Only greeting audio is cached; investigation answers always synthesize
   *  fresh because they are user-specific data. */
  const speak = useCallback(
    (text: string, language: string, isGreeting = false): Promise<void> =>
      new Promise((resolve) => {
        stopAudio();
        const cacheKey = `${text}|${language}`;
        const cached = greetingAudioCache.get(cacheKey);

        const play = (base64: string) => {
          const audio = new Audio(`data:audio/wav;base64,${base64}`);
          audioRef.current = audio;
          const finish = () => {
            audio.onended = null;
            audio.onerror = null;
            audioRef.current = null;
            resolve();
          };
          audio.onended = finish;
          audio.onerror = () => {
            console.warn('Voice Copilot audio playback failed');
            finish();
          };
          audio.play().catch(() => {
            console.warn('Voice Copilot playback rejected');
            finish();
          });
        };

        if (cached) {
          play(cached);
          return;
        }
        trace('tts:start', { text: text.slice(0, 40) });
        synthesizeSpeech(text, language)
          .then((res) => {
            trace('tts:success', { bytes: res.audio_base64.length });
            if (isGreeting) {
              greetingAudioCache.set(cacheKey, res.audio_base64);
            }
            play(res.audio_base64);
          })
          .catch((err) => {
            // TTS failure: never blocks the investigation; answer stays on screen.
            console.warn('Voice Copilot TTS failed:', err);
            trace('tts:failed');
            resolve();
          });
      }),
    [stopAudio]
  );

  const fail = useCallback(
    async (message: string) => {
      setErrorMessage(message);
      setStatus('error');
      await speak(message, langCode(lang));
      setStatus('idle');
    },
    [lang, speak]
  );

  /** STT -> (translate if Kannada) -> existing investigation pipeline -> TTS. */
  const processTranscript = useCallback(
    async (transcript: string, seq: number) => {
      const displayText = transcript;
      let queryForBackend = transcript;

      if (lang === 'KN') {
        try {
          trace('translate:query:start');
          const tr = await translateText(transcript, 'kn-IN', 'en-IN');
          if (tr.translated_text) queryForBackend = tr.translated_text;
          trace('translate:query:success');
        } catch (trErr) {
          console.warn('Voice Copilot Kannada translation failed:', trErr);
        }
      }
      if (seqRef.current !== seq) return;

      setLastQuery(displayText);
      setStatus('processing');

      // Same conversation as AskTriNetra: reuse active id, create one only
      // when none exists (same existing persistence mechanism).
      let convId: string | null = conversationId;
      if (!convId) {
        convId = await ensureConversation();
      }
      if (seqRef.current !== seq) return;

      try {
        trace('investigation:start', { via: isInvestigationRequest(queryForBackend) ? 'investigate' : 'chat' });
        let data: any;
        if (isInvestigationRequest(queryForBackend)) {
          data = await sendInvestigationQuery(queryForBackend, undefined, convId || undefined);
        } else {
          data = await sendChatQuery(queryForBackend, {
            conversation_id: convId || undefined,
          });
        }
        if (seqRef.current !== seq) return;
        trace('investigation:success', { intent: data?.intent_detected || data?.investigation?.intent_detected });

        const voiceAnswer = buildVoiceAnswer(data);
        const actions = mapResponseToActions(data);
        setLastAnswer(voiceAnswer);
        setLastActions(actions);
        setErrorMessage(null);
        setStatus('speaking');

        // Kannada interaction speaks the translated answer through the
        // existing translation + TTS pipeline (never hardcoded).
        let spoken = voiceAnswer;
        let speechLang = 'en-IN';
        if (lang === 'KN') {
          try {
            trace('translate:answer:start');
            const tr = await translateText(voiceAnswer, 'en-IN', 'kn-IN');
            if (tr.translated_text) {
              spoken = tr.translated_text;
              speechLang = 'kn-IN';
            }
            trace('translate:answer:success');
          } catch (trErr) {
            console.warn('Voice Copilot answer translation failed:', trErr);
          }
        }
        if (seqRef.current !== seq) return;
        await speak(spoken, speechLang);
        if (seqRef.current !== seq) return;
        setStatus('idle');
        trace('done');
      } catch (err: any) {
        if (seqRef.current !== seq) return;
        const message = err?.message || '';
        if (/401|expired|invalid token|sign in|unauthorized/i.test(message)) {
          await fail('Your session has expired. Please sign in again.');
        } else {
          await fail("I couldn't complete that investigation. Please try again.");
        }
      }
    },
    [conversationId, ensureConversation, fail, lang, speak]
  );

  const transcribeAndRun = useCallback(
    async (blob: Blob, seq: number) => {
      if (seqRef.current !== seq) return;
      setStatus('processing');
      setIsRecording(false);
      trace('stt:start', { bytes: blob.size, type: blob.type });
      if (blob.size < 1024) {
        // Effectively empty capture (started + stopped immediately).
        await fail("I didn't catch that. Please try again.");
        return;
      }
      let transcript = '';
      try {
        const res = await transcribeAudio(blob, langCode(lang), `speech.${mimeExtension(recorderMimeRef.current)}`);
        transcript = res.transcript || '';
        trace('stt:success', { transcript: transcript.slice(0, 60) });
      } catch (sttErr) {
        console.warn('Voice Copilot STT failed:', sttErr);
        trace('stt:failed');
        if (seqRef.current === seq) {
          await fail("I couldn't understand the audio. Please try again.");
        }
        return;
      }
      if (seqRef.current !== seq) return;
      if (!transcript.trim()) {
        await fail("I didn't catch that. Please try again.");
        return;
      }
      await processTranscript(transcript, seq);
    },
    [fail, lang, processTranscript]
  );

  const startListening = useCallback(
    async (seq: number, micReady: Promise<MediaStream | null>) => {
      setStatus('greeting');
      if (seqRef.current !== seq) return;
      setLastAnswer(null);
      setErrorMessage(null);

      // Welcome message on activation (not on every mic event). The static
      // English greeting is audio-cached; Kannada still translates once.
      let greeting = WELCOME_EN;
      let speechLang = 'en-IN';
      if (lang === 'KN') {
        try {
          const tr = await translateText(WELCOME_EN, 'en-IN', 'kn-IN');
          if (tr.translated_text) {
            greeting = tr.translated_text;
            speechLang = 'kn-IN';
          }
        } catch {
          /* fall back to English greeting */
        }
      }
      if (seqRef.current !== seq) return;

      // Microphone permission is requested IN PARALLEL with the greeting so
      // the (first-time) permission prompt overlaps the spoken welcome.
      trace('greeting:start');

      const finishGreeting = async () => {
        if (seqRef.current !== seq) return;
        // Greeting done (spoken or failed) -> open the microphone.
        try {
          const stream = await micReady;
          if (seqRef.current !== seq) {
            stream?.getTracks().forEach((t) => t.stop());
            return;
          }
          if (!stream) throw new Error('microphone unavailable');
          trace('listening:start');
          streamRef.current = stream;
          audioChunksRef.current = [];
          const mime = pickRecorderMime();
          recorderMimeRef.current = mime;
          const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
          mediaRecorderRef.current = recorder;
          recorder.ondataavailable = (event) => {
            if (event.data.size > 0) audioChunksRef.current.push(event.data);
          };
          recorder.onstop = () => {
            // A cancel discards the capture; a normal Stop proceeds to STT.
            if (cancelledRef.current) return;
            const blob = new Blob(audioChunksRef.current, {
              type: recorderMimeRef.current || 'audio/webm',
            });
            streamRef.current?.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
            if (seqRef.current === seq) {
              void transcribeAndRun(blob, seq);
            }
          };
          recorder.start();
          setIsRecording(true);
          setStatus('listening');
          autoStopTimerRef.current = window.setTimeout(() => {
            // Auto-stop behaves like a normal Stop: transcribe what we have.
            if (seqRef.current === seq) stopRecording();
          }, AUTO_STOP_MS);
        } catch (micErr: any) {
          if (seqRef.current !== seq) return;
          const isDenied =
            micErr?.name === 'NotAllowedError' ||
            micErr?.name === 'PermissionDeniedError';
          await fail(
            isDenied
              ? 'Microphone access is required for voice investigation.'
              : "I couldn't access the microphone. Please try again."
          );
        }
      };

      await speak(greeting, speechLang, true);
      await finishGreeting();
    },
    [lang, speak, transcribeAndRun]
  );

  /** Normal Stop: ends capture but lets onstop run the STT pipeline. */
  const stopRecording = useCallback(() => {
    if (autoStopTimerRef.current !== null) {
      window.clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        /* already stopped */
      }
    }
    setIsRecording(false);
  }, []);

  const cancel = useCallback(() => {
    seqRef.current += 1;
    cancelledRef.current = true;
    teardownMic();
    stopAudio();
    setStatus('idle');
    setErrorMessage(null);
    setIsRecording(false);
  }, [stopAudio, teardownMic]);

  const startInteraction = useCallback(() => {
    const seq = ++seqRef.current;
    cancelledRef.current = false;
    setStatus('activating');
    setLastQuery(null);
    setLastAnswer(null);
    setLastActions([]);
    setErrorMessage(null);
    trace('activation');
    // Kick off mic permission immediately (parallel with the greeting);
    // resolves to null on failure — handled when greeting finishes.
    const micReady = navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .catch((err) => {
        trace('mic:permission-failed', { name: err?.name });
        return null;
      }) ?? Promise.resolve(null);
    // If the user cancels/closes while the permission request is still in
    // flight, release the stream the moment it arrives — never leak the mic.
    void micReady.then((stream) => {
      if (seqRef.current !== seq && stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    });
    // Let the UI paint the activating state first.
    window.setTimeout(() => {
      if (seqRef.current === seq) void startListening(seq, micReady);
    }, 40);
  }, [startListening]);

  /** Orb click: open + activate. Busy click: cancel and close safely. */
  const toggleOpen = useCallback(() => {
    if (status !== 'idle') {
      cancel();
      setIsOpen(false);
      return;
    }
    if (!isOpen) {
      // Side effects stay OUTSIDE the state updater: React StrictMode can
      // double-invoke updater functions, which would start the interaction
      // (and the mic permission request) twice.
      setIsOpen(true);
      startInteraction();
    } else {
      cancel();
      setIsOpen(false);
    }
  }, [cancel, isOpen, startInteraction, status]);

  const closePanel = useCallback(() => {
    cancel();
    setIsOpen(false);
  }, [cancel]);

  const toggleLang = useCallback(() => {
    setLang((prev) => (prev === 'EN' ? 'KN' : 'EN'));
  }, []);

  // Unmount cleanup: microphone, audio, timers, everything.
  useEffect(() => {
    return () => {
      seqRef.current += 1;
      cancelledRef.current = true;
      teardownMic();
      stopAudio();
    };
  }, [stopAudio, teardownMic]);

  return {
    status,
    isOpen,
    lang,
    isRecording,
    lastQuery,
    lastAnswer,
    lastActions,
    errorMessage,
    toggleOpen,
    closePanel,
    cancel,
    stopRecording,
    toggleLang,
    begin: startInteraction,
  };
}
