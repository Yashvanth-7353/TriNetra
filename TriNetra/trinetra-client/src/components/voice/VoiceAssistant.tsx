import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, X, Languages, Loader2, Square, Radar } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { useVoiceAssistant, type AssistantStatus } from './useVoiceAssistant';

const ORB_SIZE = 56;
const INTRO_ORB_SIZE = 132;
const PANEL_HEIGHT = 360;
const MARGIN = 12;
const POSITION_KEY = 'trinetra_voice_assistant_pos_v1';
const INTRO_TRAVEL_MS = 1150;
const INTRO_PULSE_MS = 800;
const INTRO_EXIT_MS = 500;
const INTRO_MIN_HOLD_MS = 5500;

/**
 * Presentation modes for the copilot:
 * - 'floating': the normal small draggable orb + panel (saved position).
 * - 'intro': the automatic, session-scoped onboarding presentation that
 *   centers the enlarged assistant, speaks, then physically travels the orb
 *   to its normal floating position. No buttons — fully automatic.
 */
type AssistantPresentationMode = 'floating' | 'intro';

/**
 * Intro lifecycle stages:
 * - 'travel-in': the orb glides from its saved corner position to the center
 *                while growing to enlarged size. The intro column is mounted
 *                but hidden during this stage so its orb can be measured for
 *                a pixel-perfect handoff when the glide ends.
 * - 'center':   enlarged orb + text centered on screen (staggered entrance).
 * - 'exiting':  text fades out while the orb stays centered.
 * - 'travel':   the orb glides from center to the saved corner position
 *               while shrinking to normal size.
 * - 'arrive':   subtle one-shot pulse ring at the corner before settling.
 */
type IntroStage = 'travel-in' | 'center' | 'exiting' | 'travel' | 'arrive';

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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
  const { status, isOpen, lang, isRecording, lastQuery, lastAnswer, lastActions, errorMessage, conversationId, prepareIntro } = assistant;

  const [mode, setMode] = useState<AssistantPresentationMode>('floating');
  const [introStage, setIntroStage] = useState<IntroStage>('center');
  const [introTextIn, setIntroTextIn] = useState(false);
  // Rect of the traveling orb during intro (left/top/width/height).
  const [orbRect, setOrbRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [traveling, setTraveling] = useState(false);

  const [position, setPosition] = useState<Position>(() => clamp(loadPosition(), false));
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const movedRef = useRef(false);
  const latestPosRef = useRef(position);
  const orbRef = useRef<HTMLButtonElement | null>(null);
  const introHandledRef = useRef(false);
  const introRunRef = useRef(false);
  const introCardRef = useRef<HTMLDivElement | null>(null);
  // Ref to the enlarged orb rendered as the first flex child of the centered
  // intro column. Its real rect is measured when the travel phase starts so
  // the absolutely-positioned traveling orb can take over pixel-perfect.
  const introOrbRef = useRef<HTMLDivElement | null>(null);

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
  // authenticated session — never on refresh/route change/AppShell re-render.
  // A ref guards the StrictMode double-invoke, so a dev remount can never
  // start the intro (or its speech/animation) twice.
  useEffect(() => {
    if (!profile || !introEligible || introHandledRef.current) return;
    introHandledRef.current = true;
    consumeIntro(); // consume now — this session's intro is spent
    void runIntro();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, introEligible, consumeIntro]);

  const persist = useCallback((pos: Position) => {
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(pos));
    } catch {
      /* storage unavailable — position simply won't persist */
    }
  }, []);

  /**
   * Automatic intro timeline. All timers are created inside this async flow
   * (not in effect cleanups), so React StrictMode's setup→cleanup→setup cycle
   * can neither double-start it nor cancel it mid-flight. The REAL Sarvam TTS
   * request starts while the assistant still sits normally in its saved
   * corner (dashboard fully visible); the center animation begins only when
   * the audio is genuinely ready to play (canplay) — never on a fixed timer.
   * The initial `sleep(0)` yields past StrictMode's synchronous cleanup cycle
   * so the generation guard in the audio preparation captures a stable
   * sequence and does NOT discard the intro audio as stale.
   */
  const runIntro = useCallback(async () => {
    if (introRunRef.current) return;
    introRunRef.current = true;

    const reduced = prefersReducedMotion();

    // Phase 0 — silent preparation while the orb stays normal in its corner.
    // Exactly one TTS request; resolves with the real audio only when it is
    // ready to play, or null on TTS failure (no intro — orb stays usable).
    await sleep(0);
    const prepared = await prepareIntro();
    if (!prepared || prepared.stale) {
      // TTS failed, or the user already started an interaction: skip the
      // intro entirely; the assistant remains the normal floating orb.
      prepared?.dispose();
      return;
    }

    // Phase 1 — audio ready: glide the orb from its saved corner to center.
    setMode('intro');
    setIntroTextIn(false);
    setTraveling(false);
    const corner = clamp(latestPosRef.current, false);
    setOrbRect({ left: corner.x, top: corner.y, width: ORB_SIZE, height: ORB_SIZE });

    if (reduced) {
      // Reduced motion: no travel — the presentation simply appears centered.
      setIntroStage('center');
      setOrbRect(null);
    } else {
      // The intro column mounts HIDDEN (visibility) so its enlarged orb can
      // be measured at exactly the rect the traveling orb must arrive at.
      setIntroStage('travel-in');
      await new Promise((r) => requestAnimationFrame(r));
      const orbNode = introOrbRef.current;
      if (!orbNode) {
        prepared.dispose();
        setMode('floating');
        setOrbRect(null);
        return;
      }
      const r = orbNode.getBoundingClientRect();
      await sleep(30); // let the corner orb paint before transitioning
      setTraveling(true);
      setOrbRect({ left: r.left, top: r.top, width: r.width, height: r.height });
      await sleep(INTRO_TRAVEL_MS);
      // Arrival: swap the traveling orb for the now-visible centered column
      // at the exact same rect (seamless — no jump, no double orb).
      setIntroStage('center');
      setOrbRect(null);
      setTraveling(false);
    }

    // Phase 2 — entrance: staggered text fade-in once centered.
    requestAnimationFrame(() => setIntroTextIn(true));
    await sleep(750);

    // Phase 3 — speak using the ALREADY-prepared audio (no second TTS
    // request). Resolves when playback ends; resolves early if it fails.
    await Promise.all([prepared.play(), sleep(INTRO_MIN_HOLD_MS)]);

    // Phase 4 — text fades out; orb stays centered for a beat.
    setIntroTextIn(false);
    await sleep(INTRO_EXIT_MS);

    // Phase 5 — travel the orb back to the saved corner while shrinking it.
    // Reduced motion skips the travel and drops into the normal floating orb.
    if (reduced) {
      prepared.dispose();
      setMode('floating');
      setOrbRect(null);
      return;
    }
    const target = clamp(latestPosRef.current, false);
    // Measure the enlarged flex-column orb so the traveling orb takes over at
    // exactly the same position/size (seamless swap, no jump or double orb).
    const orbNode = introOrbRef.current;
    if (orbNode) {
      const r = orbNode.getBoundingClientRect();
      setOrbRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    }
    setIntroStage('travel');
    await sleep(30); // let the current frame paint at center before transitioning
    setTraveling(true);
    setOrbRect({ left: target.x, top: target.y, width: ORB_SIZE, height: ORB_SIZE });
    await sleep(INTRO_TRAVEL_MS);

    // Phase 6 — subtle arrival pulse at the corner.
    setIntroStage('arrive');
    await sleep(INTRO_PULSE_MS);

    // Phase 7 — normal floating assistant at the saved position.
    prepared.dispose();
    setMode('floating');
    setOrbRect(null);
    setTraveling(false);
    setIntroStage('center');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepareIntro]);

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

  // ── INTRO MODE: automatic, centered, session-scoped onboarding ──
  if (mode === 'intro') {
    // Responsive enlarged orb size (120–140px on typical screens, capped on
    // small viewports) — the orb stays the focal point; text sits below it.
    const orbSize = Math.min(
      INTRO_ORB_SIZE,
      Math.round(window.innerWidth * 0.3),
      Math.round(window.innerHeight * 0.3)
    );
    // The flex column (orb + text card) is visible while centered; it is
    // mounted-but-hidden during the entry travel so its orb can be measured,
    // and unmounts exactly when the traveling orb takes over on the return.
    const columnVisible = introStage === 'center' || introStage === 'exiting';
    const columnHidden = introStage === 'travel-in';
    const showColumn = columnVisible || columnHidden;
    // The dim appears with the presentation (and stays through the return
    // travel); the entry glide happens over the fully visible dashboard.
    const dimVisible = introStage !== 'travel-in';

    return (
      <div className="fixed inset-0 z-50 pointer-events-none" role="presentation">
        {/* Subtle dim — the dashboard stays visibly alive behind the intro. */}
        {dimVisible && <div className="absolute inset-0 bg-primary-900/25" aria-hidden="true" />}

        {/* Centered column: enlarged orb, gap, then the readable text card. */}
        {showColumn && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center px-4"
            style={{ visibility: columnHidden ? 'hidden' : 'visible' }}
          >
            {/* Large orb — the assistant's identity, clearly separated from text. */}
            <div
              ref={introOrbRef}
              className="flex shrink-0 items-center justify-center rounded-full bg-primary-900 shadow-xl shadow-primary-900/30 ring-8 ring-primary-900/5"
              style={{ width: orbSize, height: orbSize }}
            >
              <Radar
                className="h-12 w-12 text-accent-500 md:h-14 md:w-14"
                aria-hidden="true"
              />
            </div>

            {/* Text card — white surface so the intro stays readable over the
                dashboard; fades together with the text before the orb travels. */}
            <div
              ref={introCardRef}
              role="dialog"
              aria-modal="false"
              aria-labelledby="voice-intro-title"
              aria-describedby="voice-intro-desc"
              className={cn(
                'mt-8 w-full max-w-[560px] rounded-2xl bg-white border border-slate-200 shadow-2xl shadow-primary-900/15 px-6 py-6 md:px-8 md:py-7 text-center transition-opacity duration-500 motion-reduce:transition-none md:mt-10',
                introTextIn ? 'opacity-100' : 'opacity-0'
              )}
            >
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border border-accent-500/20 bg-accent-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-600 transition-all duration-500 motion-reduce:transition-none',
                  introTextIn ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
                )}
                style={{ transitionDelay: introTextIn ? '150ms' : '0ms' }}
              >
                Voice AI
              </span>
              <h2
                id="voice-intro-title"
                className={cn(
                  'mt-3 text-2xl font-bold text-primary-900 transition-all duration-500 motion-reduce:transition-none md:text-3xl',
                  introTextIn ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
                )}
                style={{ transitionDelay: introTextIn ? '300ms' : '0ms' }}
              >
                I&apos;m TriNetra AI
              </h2>
              <p
                id="voice-intro-desc"
                className={cn(
                  'mt-3 max-w-md text-sm leading-relaxed text-slate-600 transition-all duration-500 motion-reduce:transition-none md:text-base',
                  introTextIn ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
                )}
                style={{ transitionDelay: introTextIn ? '450ms' : '0ms' }}
              >
                I help you combine fragmented evidence, discover connections,
                and investigate cases faster.
              </p>
              <p
                className={cn(
                  'mt-2 text-xs text-slate-400 transition-all duration-500 motion-reduce:transition-none md:text-sm',
                  introTextIn ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
                )}
                style={{ transitionDelay: introTextIn ? '600ms' : '0ms' }}
              >
                Ask me about cases, networks, financial trails, and more.
              </p>
            </div>
          </div>
        )}

        {/* Traveling orb: appears at the flex orb's exact rect, then glides to
            the corner. Only mounted during travel/arrive — the text card never
            follows the orb. */}
        {orbRect && !columnVisible && (
          <div
            className={cn(
              'absolute z-10 flex items-center justify-center rounded-full bg-primary-900 shadow-xl shadow-primary-900/30',
              introStage === 'arrive' ? 'ring-4 ring-accent-500/40' : 'ring-8 ring-primary-900/5'
            )}
            style={{
              left: orbRect.left,
              top: orbRect.top,
              width: orbRect.width,
              height: orbRect.height,
              transition: traveling
                ? `left ${INTRO_TRAVEL_MS}ms cubic-bezier(0.45, 0, 0.3, 1), top ${INTRO_TRAVEL_MS}ms cubic-bezier(0.45, 0, 0.3, 1), width ${INTRO_TRAVEL_MS}ms cubic-bezier(0.45, 0, 0.3, 1), height ${INTRO_TRAVEL_MS}ms cubic-bezier(0.45, 0, 0.3, 1)`
                : 'none',
            }}
          >
            <Radar
              className={cn(
                'text-accent-500 transition-all duration-300 motion-reduce:transition-none',
                orbRect.width > ORB_SIZE ? 'h-12 w-12 md:h-14 md:w-14' : 'h-5 w-5'
              )}
              aria-hidden="true"
            />
            {/* Arrival cue — subtle one-shot pulse ring. */}
            {introStage === 'arrive' && (
              <span
                className="absolute inset-0 rounded-full animate-ping bg-accent-500/30 motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
          </div>
        )}
      </div>
    );
  }

  // ── FLOATING MODE: the existing compact assistant ──
  const statusLabel = errorMessage || STATUS_LABEL[status];
  const listening = status === 'listening' && isRecording;
  const busy = status !== 'idle';

  return (
    <div
      className="fixed z-50 select-none"
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

            {/* Handoff to the detailed Ask TriNetra investigation — opens the
                SAME conversation (never creates a new one) via the URL param. */}
            {lastAnswer && conversationId && (
              <button
                onClick={() => navigate(`/ask?conversation_id=${encodeURIComponent(conversationId)}`)}
                className="w-full flex items-center justify-between gap-2 text-[11px] font-semibold text-primary-900 bg-white border border-primary-200 hover:bg-primary-50 rounded-lg px-3 py-2 transition-colors"
              >
                <span>Need a more detailed investigation?</span>
                <span className="flex items-center gap-1 text-accent-600">
                  Continue in Ask TriNetra
                  <span aria-hidden="true">→</span>
                </span>
              </button>
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