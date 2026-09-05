import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, X, Languages, Loader2, Square, Radar } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useVoiceAssistant, type AssistantStatus } from './useVoiceAssistant';

const ORB_SIZE = 56;
const PANEL_HEIGHT = 360;
const MARGIN = 12;
const POSITION_KEY = 'trinetra_voice_assistant_pos_v1';

interface Position {
  x: number;
  y: number;
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
  const assistant = useVoiceAssistant();
  const { status, isOpen, lang, isRecording, lastQuery, lastAnswer, lastActions, errorMessage } = assistant;

  const [position, setPosition] = useState<Position>(() => clamp(loadPosition(), false));
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const movedRef = useRef(false);
  const latestPosRef = useRef(position);
  const orbRef = useRef<HTMLButtonElement | null>(null);

  // Keep the assistant inside the viewport after resize / panel state changes.
  useEffect(() => {
    const onResize = () => setPosition((pos) => clamp(pos, isOpen));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isOpen]);

  useEffect(() => {
    setPosition((pos) => clamp(pos, isOpen));
  }, [isOpen]);

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
                  onClick={assistant.begin}
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