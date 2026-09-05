import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, X, Languages, Loader2, Square, Radar, ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { useVoiceAssistant, type AssistantStatus } from './useVoiceAssistant';

const ORB_SIZE = 56;
const PANEL_HEIGHT = 360;
const MARGIN = 12;
const POSITION_KEY = 'trinetra_voice_assistant_pos_v1';
const INTRO_TRANSITION_MS = 450;

/**
 * Presentation modes for the copilot:
 * - 'floating': the normal small draggable orb + panel (saved position).
 * - 'intro': the one-time centered, enlarged onboarding presentation.
 */
type AssistantPresentationMode = 'floating' | 'intro';

interface Position {
  x: number;
  y: number;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function loadPosition(): Position {
  const fallback = { x: window.innerWidth - ORB_SIZE - MARGIN, y: window.innerHeight - ORB_SIZE - MARGIN };
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Position;
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

function clamp(position: Position, isOpen: boolean): Position {
  // The panel is right-aligned to the orb and opens upward; clamp so the
  // whole block (panel + orb) always stays inside the viewport.
  const panelWidth = isOpen ? Math.min(330, window.innerWidth - 2 * MARGIN) : 0;
  const panelHeight = isOpen ? Math.min(PANEL_HEIGHT, window.innerHeight - ORB_SIZE - 2 * MARGIN) : 0;
  const minX = isOpen ? Math.max(MARGIN, panelWidth - ORB_SIZE + MARGIN) : MARGIN;
  const maxX = Math.max(minX, window.innerWidth - ORB_SIZE - MARGIN);
  const minY = MARGIN + panelHeight;
  const maxY = Math.max(minY, window.innerHeight - ORB_SIZE - MARGIN);
  return {
    x: Math.min(Math.max(position.x, minX), maxX),
    y: Math.min(Math.max(position.y, minY), maxY),
  };
}

const STATUS_LABEL: Record<AssistantStatus, string> = {
  idle: 'Voice Copilot ready',
  activating: 'Opening voice assistant...',
  greeting: 'Welcome to TriNetra. How can I help you?',
  listening: 'Listening... tap stop when done',
  processing: 'Investigating...',
  speaking: 'Responding...',
  error: 'Voice assistant error',
};

export default function VoiceAssistant() {
  const navigate = useNavigate();
  const { profile, introEligible, consumeIntro } = useAuth();
  const assistant = useVoiceAssistant();
  const { status, isOpen, lang, isRecording, lastQuery, lastAnswer, lastActions, errorMessage } = assistant;

  const [mode, setMode] = useState<AssistantPresentationMode>('floating');
  const [introOpen, setIntroOpen] = useState(false);
  // When returning from intro, fade the orb back in at its saved position.
  const [returning, setReturning] = useState(false);

  const [position, setPosition] = useState<Position>(() => clamp(loadPosition(), false));
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const movedRef = useRef(false);
  const latestPosRef = useRef(position);
  const orbRef = useRef<HTMLButtonElement | null>(null);
  const introCardRef = useRef<HTMLDivElement | null>(null);
  const introAskRef = useRef<HTMLButtonElement | null>(null);
  const introHandledRef = useRef(false);
  const introTimerRef = useRef<number | null>(null);

  // Keep the assistant inside the viewport after resize / panel state changes.
  useEffect(() => {
    const onResize = () => setPosition((pos) => clamp(pos, isOpen));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isOpen]);

  useEffect(() => {
    setPosition((pos) => clamp(pos, isOpen));
  }, [isOpen]);

  // Session-scoped intro: AuthContext arms introEligible on EVERY successful
  // login and disarms it on logout, so the introduction shows exactly once per
  // authenticated session — not once per employee/browser. It is consumed
  // immediately, so a refresh, route change or AppShell re-render can never
  // re-trigger it. A ref guards the StrictMode double-invoke so the intro
  // (and its speech) can never start twice.
  useEffect(() => {
    if (!profile || !introEligible || introHandledRef.current) return;
    introHandledRef.current = true;
    consumeIntro(); // consume now — this session's intro is spent
    setMode('intro');
    // Trigger the CSS transition (opacity/scale) on the next frame. The frame
    // is intentionally NOT cancelled on cleanup: in dev, StrictMode runs
    // setup -> cleanup -> setup, and cancelling here would leave the card
    // stuck at opacity-0 after the ref guard skips the second setup.
    requestAnimationFrame(() => setIntroOpen(true));
    void assistant.speakIntro();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, introEligible, consumeIntro]);

  const clearIntroTimer = useCallback(() => {
    if (introTimerRef.current !== null) {
      window.clearTimeout(introTimerRef.current);
      introTimerRef.current = null;
    }
  }, []);

  /** Dismiss the intro and smoothly return the orb to floating mode. */
  const dismissIntro = useCallback(() => {
    setIntroOpen(false);
    setReturning(true);
    assistant.cancel(); // stops any intro audio still playing
    clearIntroTimer();
    if (prefersReducedMotion()) {
      setMode('floating');
      requestAnimationFrame(() => setReturning(false));
      return;
    }
    introTimerRef.current = window.setTimeout(() => {
      setMode('floating');
      // Fade the orb in at its saved position.
      requestAnimationFrame(() => setReturning(false));
    }, INTRO_TRANSITION_MS);
  }, [assistant, clearIntroTimer]);

  /** CTA: start the existing interaction, skipping the redundant welcome and
   *  opening the floating panel so the listening UI is immediately visible. */
  const handleIntroAsk = useCallback(() => {
    dismissIntro();
    assistant.begin({ skipGreeting: true, open: true });
  }, [assistant, dismissIntro]);

  /** Secondary: just dismiss; the normal orb remains available. */
  const handleIntroLater = useCallback(() => {
    dismissIntro();
  }, [dismissIntro]);

  // Escape dismisses the intro (keyboard accessibility).
  useEffect(() => {
    if (mode !== 'intro') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissIntro();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, dismissIntro]);

  // Focus the primary CTA when the intro appears; restore focus on close.
  useEffect(() => {
    if (mode === 'intro') {
      const t = window.setTimeout(() => introAskRef.current?.focus(), 120);
      return () => window.clearTimeout(t);
    }
    if (mode === 'floating' && introCardRef.current) {
      orbRef.current?.focus();
    }
  }, [mode]);

  // Unmount cleanup for the intro timer.
  useEffect(() => clearIntroTimer, [clearIntroTimer]);

  const persist = useCallback((pos: Position) => {
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(pos));
    } catch {
      /* storage unavailable — position simply won't persist */
    }
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: position.x,
      baseY: position.y,
    };
    movedRef.current = false;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer capture unsupported (some touch/synthetic environments) */
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedRef.current = true;
    const next = clamp({ x: drag.baseX + dx, y: drag.baseY + dy }, isOpen);
    latestPosRef.current = next;
    setPosition(next);
  };

  const handlePointerUp = () => {
    dragRef.current = null;
    if (movedRef.current) {
      persist(latestPosRef.current);
    }
  };

  const handleOrbClick = () => {
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    assistant.toggleOpen();
  };

  // ── INTRO MODE: centered, enlarged, one-time onboarding ──
  if (mode === 'intro') {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="presentation"
      >
        {/* Subtle dim — the dashboard stays visibly alive behind the intro. */}
        <div
          className="absolute inset-0 bg-primary-900/25"
          onClick={handleIntroLater}
          aria-hidden="true"
        />
        <div
          ref={introCardRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby="voice-intro-title"
          aria-describedby="voice-intro-desc"
          className={cn(
            'relative z-10 w-full max-w-[440px] rounded-2xl bg-white border border-slate-200 shadow-2xl shadow-primary-900/20 p-6 md:p-8 text-center transition-all duration-500 ease-out motion-reduce:transition-none',
            introOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-90 translate-y-3'
          )}
        >
          {/* The assistant itself is the centerpiece: enlarged orb, no cartoon. */}
          <div className="mx-auto mb-5 flex h-[120px] w-[120px] md:h-[140px] md:w-[140px] items-center justify-center rounded-full bg-primary-900 shadow-xl shadow-primary-900/30 ring-8 ring-primary-900/5">
            <Radar className="h-12 w-12 text-accent-500 md:h-14 md:w-14" aria-hidden="true" />
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-500/20 bg-accent-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-600">
            Voice AI
          </span>

          <h2 id="voice-intro-title" className="mt-3 text-2xl font-bold text-primary-900 md:text-3xl">
            I&apos;m TriNetra AI
          </h2>
          <p id="voice-intro-desc" className="mt-3 text-sm leading-relaxed text-slate-600 md:text-base">
            I help you combine fragmented evidence, discover connections,
            and investigate cases faster.
          </p>
          <p className="mt-2 text-xs text-slate-400 md:text-sm">
            Ask me about cases, networks, financial trails, and more.
          </p>

          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              ref={introAskRef}
              onClick={handleIntroAsk}
              className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-6 py-3 text-sm font-bold text-primary-900 shadow-lg shadow-accent-500/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent-400 focus-visible:outline-2 focus-visible:outline-accent-500 focus-visible:outline-offset-2"
            >
              Ask TriNetra
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              onClick={handleIntroLater}
              className="rounded-lg px-4 py-3 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-primary-900 focus-visible:outline-2 focus-visible:outline-accent-500 focus-visible:outline-offset-2"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── FLOATING MODE: the existing compact assistant ──
  const statusLabel = errorMessage || STATUS_LABEL[status];
  const listening = status === 'listening' && isRecording;
  const busy = status !== 'idle';

  return (
    <div
      className={cn(
        'fixed z-50 select-none transition-opacity duration-300 motion-reduce:transition-none',
        returning ? 'opacity-0' : 'opacity-100'
      )}
      style={{ left: position.x, top: position.y }}
      aria-label="TriNetra Voice Copilot"
    >
      {/* Panel (opens above the orb) */}
      {isOpen && (
        <div
          className="absolute bottom-[calc(100%+10px)] right-0 w-[min(330px,calc(100vw-24px))] max-h-[calc(100vh-130px)] overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-2xl shadow-primary-900/15"
          role="dialog"
          aria-label="TriNetra Voice Copilot"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-primary-900 text-white">
            <div className="flex items-center gap-2">
              <Radar className="w-4 h-4 text-accent-500" />
              <span className="text-sm font-semibold tracking-wide">Voice Copilot</span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold',
                  listening
                    ? 'bg-red-500/20 text-red-300'
                    : busy
                      ? 'bg-accent-500/20 text-accent-500'
                      : 'bg-white/10 text-primary-200'
                )}
              >
                {listening && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse motion-reduce:animate-none" />}
                {listening ? 'LISTENING' : status.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={assistant.toggleLang}
                className="p-1.5 rounded-lg text-primary-200 hover:text-white hover:bg-white/10 transition-colors"
                title="Toggle English / Kannada"
                aria-label={`Language: ${lang === 'EN' ? 'English' : 'Kannada'}`}
              >
                <Languages className="w-4 h-4" />
                <span className="sr-only">{lang === 'EN' ? 'Switch to Kannada' : 'Switch to English'}</span>
              </button>
              <button
                onClick={assistant.closePanel}
                className="p-1.5 rounded-lg text-primary-200 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Close voice assistant"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Status + transcript */}
          <div className="px-4 py-3 space-y-3" aria-live="polite">
            <div className="flex items-center gap-2 text-sm text-slate-700">
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin text-accent-500 motion-reduce:animate-none shrink-0" />
              ) : (
                <Mic className="w-4 h-4 text-primary-700 shrink-0" />
              )}
              <span className="font-medium">{statusLabel}</span>
            </div>

            {lastQuery && (
              <div className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                <span className="font-semibold text-slate-400 uppercase tracking-wide">You said</span>
                <div className="mt-0.5">{lastQuery}</div>
              </div>
            )}

            {lastAnswer && (
              <div className="text-sm text-slate-800 bg-primary-50 border border-primary-100 rounded-lg px-3 py-2">
                <span className="font-semibold text-primary-600 uppercase tracking-wide text-[10px]">TriNetra</span>
                <div className="mt-0.5 leading-relaxed">{lastAnswer}</div>
              </div>
            )}

            {/* Whitelisted screen actions */}
            {lastActions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {lastActions.map((action) => (
                  <button
                    key={action.action}
                    onClick={() => navigate(action.route)}
                    className="text-[11px] font-semibold text-primary-900 bg-accent-500 hover:bg-accent-400 border border-accent-600/30 rounded-md px-2.5 py-1.5 transition-colors"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center gap-2 pt-1">
              {listening ? (
                <button
                  onClick={assistant.stopRecording}
                  className="flex-1 flex items-center justify-center gap-2 text-xs font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 rounded-lg py-2 transition-colors"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  Stop
                </button>
              ) : busy ? (
                <button
                  onClick={assistant.cancel}
                  className="flex-1 text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 rounded-lg py-2 transition-colors"
                >
                  Cancel
                </button>
              ) : (
                <button
                  onClick={() => assistant.begin()}
                  className="flex-1 flex items-center justify-center gap-2 text-xs font-semibold bg-primary-900 text-white hover:bg-primary-800 rounded-lg py-2 transition-colors"
                >
                  <Mic className="w-3.5 h-3.5" />
                  Ask by Voice
                </button>
              )}
              <span className="text-[10px] text-slate-400 px-1">
                {lang === 'EN' ? 'English' : 'ಕನ್ನಡ'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Draggable orb */}
      <button
        ref={orbRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={handleOrbClick}
        aria-label={isOpen ? 'Close TriNetra Voice Assistant' : 'Open TriNetra Voice Assistant'}
        aria-expanded={isOpen}
        title="Ask TriNetra"
        className={cn(
          'group relative flex items-center justify-center rounded-full shadow-lg shadow-primary-900/25 transition-shadow hover:shadow-xl focus-visible:outline-2 focus-visible:outline-accent-500 focus-visible:outline-offset-2 cursor-grab active:cursor-grabbing touch-none',
          busy ? 'bg-primary-800' : 'bg-primary-900',
          listening && 'ring-4 ring-red-400/30'
        )}
        style={{ width: ORB_SIZE, height: ORB_SIZE }}
      >
        {listening ? (
          <>
            <span className="absolute inset-0 rounded-full animate-ping bg-red-400/20 motion-reduce:animate-none" />
            <Mic className="w-5 h-5 text-red-300" />
          </>
        ) : busy ? (
          <Loader2 className="w-5 h-5 text-accent-500 animate-spin motion-reduce:animate-none" />
        ) : (
          <Radar className="w-5 h-5 text-accent-500" />
        )}
        {/* Hover tooltip */}
        <span className="pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-md bg-slate-900 text-white text-[11px] px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
          Ask TriNetra
        </span>
      </button>
    </div>
  );
}