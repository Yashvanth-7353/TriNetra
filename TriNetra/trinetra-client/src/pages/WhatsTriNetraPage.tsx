import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ArchitecturePage from './ArchitecturePage';
import {
  ArrowRight, ArrowDown, Bell, BrainCircuit, Eye, GitBranch, Lock,
  Map, Mic, MessagesSquare, Network, Radar, Server, ShieldCheck,
  Sparkles, Target, UserCheck, Workflow, Cpu, Banknote, Globe,
  FileText, KeyRound, CheckCircle2,
} from 'lucide-react';

/* ══════════════════════════════════════════════
   SCROLL REVEAL HOOK (same as landing page)
   ══════════════════════════════════════════════ */
function RevealDiv({ children, className = '', variant = 'up', delay = 0, ...props }: {
  children: ReactNode; className?: string; variant?: 'up' | 'left' | 'right' | 'scale'; delay?: number;
} & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('visible'); observer.unobserve(el); } },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const cls = variant === 'left' ? 'reveal-left' : variant === 'right' ? 'reveal-right' : variant === 'scale' ? 'reveal-scale' : 'reveal';
  const delayCls = delay > 0 ? `delay-${Math.min(delay, 6)}` : '';
  return <div ref={ref} className={`${cls} ${delayCls} ${className}`} {...props}>{children}</div>;
}

/* Section label */
function Kicker({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-bold text-accent-600 tracking-[0.3em] uppercase mb-3">{children}</p>
  );
}

/* ── Flow chain (vertical list of chips with arrows) ── */
function FlowChain({ steps, color = 'primary' }: { steps: string[]; color?: 'primary' | 'accent' | 'emerald' }) {
  const colorMap: Record<string, { chip: string; arrow: string }> = {
    primary: { chip: 'border-primary-200 bg-primary-50/60 text-primary-800', arrow: 'text-slate-300' },
    accent: { chip: 'border-accent-200 bg-accent-50/70 text-accent-800', arrow: 'text-accent-300' },
    emerald: { chip: 'border-emerald-200 bg-emerald-50/70 text-emerald-800', arrow: 'text-emerald-200' },
  };
  const c = colorMap[color];
  return (
    <div className="flex flex-col items-center">
      {steps.map((s, i) => (
        <div key={i} className="flex flex-col items-center">
          <div className={`px-4 py-2 rounded-lg border text-sm font-semibold ${c.chip}`}>{s}</div>
          {i < steps.length - 1 && <ArrowDown className={`w-4 h-4 my-1 ${c.arrow}`} />}
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════
   REFINED PAGE
   ══════════════════════════════════════════════ */
export default function WhatsTriNetraPage() {
  const [showArchitecture, setShowArchitecture] = useState(false);

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans flex flex-col overflow-x-clip">

      {/* ── Top utility bar: brand + home + architecture ── */}
      <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-lg overflow-hidden bg-white flex items-center justify-center p-0.5 border border-slate-100 shadow-sm">
                <img src="/logo.png" alt="TriNetra Logo" className="w-full h-full object-contain" />
              </div>
              <span className="font-bold text-sm tracking-tight text-primary-900">TRINETRA</span>
            </Link>
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.2em] uppercase text-accent-600 bg-accent-50 border border-accent-200 px-2.5 py-1 rounded-full">
              <Sparkles className="w-3 h-3" /> What's TriNetra?
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-600 hover:text-primary-900 transition-colors px-3 py-2 rounded-full hover:bg-slate-100/70">
              Home
            </Link>
            <button onClick={() => setShowArchitecture(true)}
              className="hidden sm:inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-600 hover:text-primary-900 transition-colors px-3 py-2 rounded-full hover:bg-slate-100/70">
              <Server className="w-4 h-4" /> Architecture
            </button>
            <Link to="/login"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium text-[13px] text-white bg-primary-900 hover:bg-primary-800 transition-all duration-200 shadow-sm hover:shadow-md">
              <Lock className="w-3.5 h-3.5" /> Log In
            </Link>
          </div>
        </div>
      </div>

      {/* ═══════════════════ HERO ═══════════════════ */}
      <section className="relative bg-primary-950 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(201,162,39,0.10)_0%,transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(201,162,39,0.05)_0%,transparent_45%)]" />
        <div className="max-w-5xl mx-auto px-6 py-24 md:py-32 relative z-10 text-center">
          <RevealDiv>
            <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.3em] uppercase text-accent-400 border border-accent-500/30 bg-white/5 backdrop-blur px-4 py-1.5 rounded-full mb-8">
              <Radar className="w-3.5 h-3.5" /> What makes TriNetra different
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white tracking-tight leading-tight mb-5">
              What's TriNetra?
            </h1>
            <p className="text-xl md:text-2xl text-accent-400 font-semibold mb-4">
              From fragmented records to refined investigative intelligence.
            </p>
            <p className="text-base md:text-lg text-primary-200 max-w-2xl mx-auto leading-relaxed">
              TriNetra doesn't stop at finding data. It connects evidence, validates investigative context,
              and turns fragmented crime records into actionable intelligence — through specialized engines,
              secure access controls, and human-readable explanations.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
              <button onClick={() => setShowArchitecture(true)}
                className="group inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-base text-white border border-white/25 hover:bg-white/10 transition-all duration-300">
                Explore the Architecture
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
              <Link to="/login"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-base text-primary-900 bg-accent-500 hover:bg-accent-400 transition-all duration-300 shadow-lg shadow-accent-500/20 hover:shadow-accent-500/40">
                See It In Action <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </RevealDiv>
        </div>
      </section>

      {/* ═════════════ NOT JUST A DASHBOARD ═════════════ */}
      <section className="px-6 py-24 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <RevealDiv className="text-center mb-14">
            <Kicker>Positioning</Kicker>
            <h2 className="text-3xl md:text-4xl font-extrabold text-primary-900 mb-4">Not another crime dashboard.</h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-lg leading-relaxed">
              TriNetra turns a natural-language question into a structured investigation across specialized
              intelligence engines — then explains what it found and why.
            </p>
          </RevealDiv>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {/* Typical system */}
            <RevealDiv delay={1}>
              <div className="rounded-2xl border border-slate-200 bg-white p-8 h-full">
                <p className="text-[11px] font-bold tracking-[0.25em] uppercase text-slate-400 mb-6">A typical system</p>
                <FlowChain steps={['Search', 'Results', 'Dashboard']} color="primary" />
              </div>
            </RevealDiv>

            {/* TriNetra pipeline */}
            <RevealDiv delay={2}>
              <div className="rounded-2xl border-2 border-accent-300 bg-accent-50/40 p-8 h-full shadow-lg shadow-accent-500/5 relative overflow-hidden">
                <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-accent-500 via-accent-400 to-accent-500" />
                <p className="text-[11px] font-bold tracking-[0.25em] uppercase text-accent-700 mb-6">TriNetra</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {['Question', 'Understand', 'Resolve', 'Investigate'].map((s, i) => (
                    <div key={i} className="text-center px-2 py-3 rounded-lg border border-accent-200 bg-white text-[13px] font-bold text-primary-900">{s}</div>
                  ))}
                  {['Connect', 'Fuse Evidence', 'Explain', 'Act'].map((s, i) => (
                    <div key={i} className="text-center px-2 py-3 rounded-lg border border-accent-200 bg-white text-[13px] font-bold text-primary-900">{s}</div>
                  ))}
                </div>
                <div className="flex items-center justify-center gap-2 mt-6 text-xs font-semibold text-accent-700">
                  <ArrowDown className="w-4 h-4" />
                  <span>One question drives an entire investigation</span>
                </div>
              </div>
            </RevealDiv>
          </div>
        </div>
      </section>

      {/* ═════════════════ EVIDENCE FIRST ═════════════════ */}
      <section className="px-6 py-24 bg-white">
        <div className="max-w-5xl mx-auto">
          <RevealDiv className="text-center mb-14">
            <Kicker>Evidence first</Kicker>
            <h2 className="text-3xl md:text-4xl font-extrabold text-primary-900 mb-4">Grounded in the records, not the model.</h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-lg leading-relaxed">
              Every investigation is anchored to underlying case records, accused, transactions and relationships.
              TriNetra does not treat generated text as evidence.
            </p>
          </RevealDiv>

          <RevealDiv variant="scale">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 md:p-12">
              {/* Upstream evidence */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
                {['Crime Records', 'Accused', 'Cases', 'Transactions', 'Relationships'].map((e, i) => (
                  <div key={i} className="text-center text-[12px] font-semibold text-slate-600 px-2 py-3 rounded-lg border border-slate-200 bg-white">{e}</div>
                ))}
              </div>
              <div className="flex justify-center mb-6"><ArrowDown className="w-5 h-5 text-slate-400" /></div>
              <div className="mx-auto max-w-[560px] space-y-3">
                <div className="text-center text-sm font-bold text-primary-800 px-4 py-3 rounded-xl border-2 border-primary-200 bg-white">Evidence</div>
                <div className="flex justify-center"><ArrowDown className="w-5 h-5 text-slate-400" /></div>
                <div className="text-center text-sm font-bold text-primary-800 px-4 py-3 rounded-xl border-2 border-primary-200 bg-white">Investigation</div>
                <div className="flex justify-center"><ArrowDown className="w-5 h-5 text-slate-400" /></div>
                <div className="text-center text-sm font-bold text-white px-4 py-3 rounded-xl bg-primary-900">Evidence-backed Finding</div>
              </div>

              {/* LLM ≠ source of truth */}
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                <div className="rounded-xl border-2 border-red-200 bg-red-50/60 px-6 py-4 text-center">
                  <p className="text-xs font-bold text-red-500 tracking-widest uppercase mb-1">Not the source of truth</p>
                  <p className="text-sm font-bold text-red-700">The LLM interprets and communicates</p>
                </div>
                <ArrowRight className="w-6 h-6 text-slate-400 shrink-0 hidden sm:block" />
                <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/60 px-6 py-4 text-center">
                  <p className="text-xs font-bold text-emerald-600 tracking-widest uppercase mb-1">The foundation</p>
                  <p className="text-sm font-bold text-emerald-800">Evidence + deterministic investigation engines</p>
                </div>
              </div>
            </div>
          </RevealDiv>
        </div>
      </section>

      {/* ═══════════ MULTI-ENGINE INVESTIGATION ═══════════ */}
      <section className="px-6 py-24 bg-primary-950 overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(201,162,39,0.06)_0%,transparent_65%)]" />
        <div className="max-w-5xl mx-auto relative z-10">
          <RevealDiv className="text-center mb-16">
            <p className="text-xs font-bold text-accent-400 tracking-[0.3em] uppercase mb-3">Architecture</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">One question. Multiple investigation engines.</h2>
            <p className="text-primary-200 max-w-2xl mx-auto text-lg leading-relaxed">
              A single investigator question can trigger the specialized engines needed to answer it —
              instead of forcing every problem through one generic AI model.
            </p>
          </RevealDiv>

          <RevealDiv variant="scale">
            <div className="flex flex-col items-center">
              <div className="px-6 py-3 rounded-xl border border-accent-500/40 bg-white/5 text-white font-bold text-sm">Investigator Question</div>
              <ArrowDown className="w-5 h-5 text-accent-400 my-2" />
              <div className="px-6 py-3 rounded-xl border border-accent-300/60 bg-accent-500/10 text-accent-300 font-bold text-sm flex items-center gap-2">
                <Workflow className="w-4 h-4" /> Investigation Orchestrator
              </div>
              <ArrowDown className="w-5 h-5 text-accent-400 my-2" />
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 w-full max-w-3xl mb-2">
                {[
                  { icon: FileText, label: 'Case', color: 'text-blue-300 border-blue-400/30' },
                  { icon: Network, label: 'Network', color: 'text-emerald-300 border-emerald-400/30' },
                  { icon: Banknote, label: 'Financial', color: 'text-amber-300 border-amber-400/30' },
                  { icon: Target, label: 'Pattern', color: 'text-violet-300 border-violet-400/30' },
                  { icon: UserCheck, label: 'Risk', color: 'text-rose-300 border-rose-400/30' },
                ].map((e, i) => (
                  <div key={i} className={`flex flex-col items-center gap-1.5 px-3 py-4 rounded-xl border ${e.color} bg-white/5`}>
                    <e.icon className="w-5 h-5" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">{e.label}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-center mb-2"><ArrowDown className="w-5 h-5 text-slate-400" /></div>
              <div className="px-6 py-3 rounded-xl border border-emerald-400/40 bg-emerald-500/10 text-emerald-300 font-bold text-sm">Evidence Fusion</div>
              <div className="flex justify-center my-2"><ArrowDown className="w-5 h-5 text-slate-400" /></div>
              <div className="px-6 py-3 rounded-xl bg-white text-primary-900 font-bold text-sm">Investigative Finding — with citations</div>
            </div>
          </RevealDiv>
        </div>
      </section>

      {/* ═══════════ DETERMINISTIC + AI ═══════════ */}
      <section className="px-6 py-24 bg-white">
        <div className="max-w-5xl mx-auto">
          <RevealDiv className="text-center mb-14">
            <Kicker>Deterministic + AI</Kicker>
            <h2 className="text-3xl md:text-4xl font-extrabold text-primary-900 mb-4">AI where it helps. Determinism where it matters.</h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-lg leading-relaxed">
              AI expands investigation capability. Deterministic controls keep critical behavior predictable.
            </p>
          </RevealDiv>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <RevealDiv delay={1}>
              <div className="h-full rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 p-7">
                <div className="flex items-center gap-2 mb-5">
                  <Cpu className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-extrabold text-emerald-800">Deterministic Layer</h3>
                </div>
                <ul className="space-y-2.5">
                  {['Exact case resolution', 'Intent classification', 'RBAC / jurisdiction enforcement', 'SQL validation & scoping', 'Network & financial analysis rules', 'Risk and pattern scoring', 'Evidence strength calculations', 'Voice answers'].map((it, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" /> {it}
                    </li>
                  ))}
                </ul>
              </div>
            </RevealDiv>
            <RevealDiv delay={2}>
              <div className="h-full rounded-2xl border-2 border-violet-200 bg-violet-50/40 p-7">
                <div className="flex items-center gap-2 mb-5">
                  <BrainCircuit className="w-5 h-5 text-violet-600" />
                  <h3 className="font-extrabold text-violet-800">AI Layer</h3>
                </div>
                <ul className="space-y-2.5">
                  {['Natural-language understanding', 'Investigation planning', 'Response generation', 'Semantic similarity search', 'Embeddings for narrative retrieval', 'Evidence-grounded explanation'].map((it, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-violet-500" /> {it}
                    </li>
                  ))}
                </ul>
              </div>
            </RevealDiv>
          </div>
        </div>
      </section>

      {/* ═══════════ CONNECTED INTELLIGENCE ═══════════ */}
      <section className="px-6 py-24 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <RevealDiv className="text-center mb-14">
            <Kicker>Connected intelligence</Kicker>
            <h2 className="text-3xl md:text-4xl font-extrabold text-primary-900 mb-4">From records to relationships.</h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-lg leading-relaxed">
              TriNetra doesn't only show individual records — it exposes the relationships between cases,
              people, transactions and investigative entities, and lets you follow them.
            </p>
          </RevealDiv>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {/* Network */}
            <RevealDiv delay={1} className="rounded-2xl border border-slate-200 bg-white p-7">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-4">
                <Network className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="font-bold text-primary-900 mb-2">Investigate the network, not just the suspect</h3>
              <p className="text-sm text-slate-600 leading-relaxed mb-5">
                From an authorized case or person, TriNetra expands connected relationships — co-accused,
                related cases, shared locations and financial connections.
              </p>
              <FlowChain steps={['Person', 'Co-accused', 'Related Case', 'Financial Connection']} color="emerald" />
            </RevealDiv>

            {/* Financial */}
            <RevealDiv delay={2} className="rounded-2xl border border-slate-200 bg-white p-7">
              <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center mb-4">
                <Banknote className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="font-bold text-primary-900 mb-2">Follow the money</h3>
              <p className="text-sm text-slate-600 leading-relaxed mb-5">
                Financial analysis moves beyond isolated transactions to reveal transaction chains,
                cross-case links and deterministic anomaly signals.
              </p>
              <FlowChain steps={['Transactions', 'Accounts', 'Relationships', 'Cross-case links']} color="accent" />
            </RevealDiv>

            {/* Evidence graph */}
            <RevealDiv delay={3} className="rounded-2xl border border-slate-200 bg-white p-7">
              <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center mb-4">
                <GitBranch className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="font-bold text-primary-900 mb-2">The evidence graph</h3>
              <p className="text-sm text-slate-600 leading-relaxed mb-5">
                Relationships between cases, people, evidence, locations and transactions are assembled
                into one provenance-tracked graph.
              </p>
              {/* conceptual mini-graph */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" role="img" aria-label="Conceptual evidence graph: FIR connected to Person, Location, Evidence and Transaction">
                <div className="flex justify-center">
                  <div className="px-3 py-1.5 rounded-lg bg-primary-900 text-white text-[11px] font-bold">FIR</div>
                </div>
                <div className="flex justify-center my-2 text-slate-400 text-xs">│</div>
                <div className="grid grid-cols-2 gap-2 text-center text-[11px] font-semibold">
                  <div className="px-2 py-2 rounded-lg bg-white border border-blue-200 text-blue-700">Person</div>
                  <div className="px-2 py-2 rounded-lg bg-white border border-cyan-200 text-cyan-700">Location</div>
                  <div className="px-2 py-2 rounded-lg bg-white border border-violet-200 text-violet-700">Evidence</div>
                  <div className="px-2 py-2 rounded-lg bg-white border border-amber-200 text-amber-700">Transaction</div>
                </div>
                <div className="text-center text-[10px] text-slate-400 mt-3 italic">Conceptual — no live records shown</div>
              </div>
            </RevealDiv>
          </div>
        </div>
      </section>

      {/* ═════════════════ NATURAL LANGUAGE ═════════════════ */}
      <section className="px-6 py-24 bg-white">
        <div className="max-w-5xl mx-auto">
          <RevealDiv className="text-center mb-12">
            <Kicker>Natural language investigation</Kicker>
            <h2 className="text-3xl md:text-4xl font-extrabold text-primary-900 mb-4">Ask questions. Don't learn the database.</h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-lg">Investigator language goes in — a structured, scoped investigation comes out.</p>
          </RevealDiv>
          <RevealDiv className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              'What is FIR 100050030202600014?',
              'Who is connected to this case?',
              'Show the financial trail.',
              'What similar cases exist?',
              'What patterns are emerging?',
              'What should investigators examine next?',
            ].map((q, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700">
                <MessagesSquare className="w-4 h-4 mt-0.5 text-accent-500 shrink-0" />
                {q}
              </div>
            ))}
          </RevealDiv>
        </div>
      </section>

      {/* ═══════════════════ VOICE COPILOT ═══════════════════ */}
      <section className="px-6 py-24 bg-primary-950 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(201,162,39,0.07)_0%,transparent_60%)]" />
        <div className="max-w-6xl mx-auto relative z-10">
          <RevealDiv className="text-center mb-14">
            <p className="text-xs font-bold text-accent-400 tracking-[0.3em] uppercase mb-3">Voice Copilot</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">Investigation, hands free.</h2>
            <p className="text-primary-200 max-w-2xl mx-auto text-lg leading-relaxed">
              Ask naturally and receive a concise spoken answer — through the same investigation pipeline,
              never a disconnected demo feature.
            </p>
          </RevealDiv>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            {/* Voice pipeline */}
            <RevealDiv delay={1}>
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-8">
                <div className="flex items-center gap-2 mb-6">
                  <Mic className="w-5 h-5 text-accent-400" />
                  <h3 className="text-white font-bold text-sm">One voice pipeline → the same engines</h3>
                </div>
                <div className="flex flex-col items-center">
                  <div className="px-5 py-2 rounded-lg border border-accent-400/40 bg-accent-500/10 text-accent-300 text-sm font-bold flex items-center gap-2">
                    <Mic className="w-4 h-4" /> Voice · English + Kannada
                  </div>
                  <ArrowDown className="w-4 h-4 text-slate-400 my-1.5" />
                  <div className="px-5 py-2 rounded-lg border border-slate-400/30 bg-white/5 text-slate-200 text-sm font-semibold">Sarvam STT + translation</div>
                  <ArrowDown className="w-4 h-4 text-slate-400 my-1.5" />
                  <div className="px-5 py-2 rounded-lg border border-primary-400/40 bg-primary-500/10 text-primary-200 text-sm font-bold">Investigation pipeline</div>
                  <ArrowDown className="w-4 h-4 text-slate-400 my-1.5" />
                  <div className="px-5 py-2 rounded-lg border border-emerald-400/40 bg-emerald-500/10 text-emerald-300 text-sm font-semibold">Deterministic voice answer</div>
                  <ArrowDown className="w-4 h-4 text-slate-400 my-1.5" />
                  <div className="px-5 py-2 rounded-lg border border-slate-400/30 bg-white/5 text-slate-200 text-sm font-semibold">Sarvam TTS</div>
                </div>
              </div>
            </RevealDiv>

            {/* Handoff */}
            <RevealDiv delay={2}>
              <div className="rounded-2xl border-2 border-accent-400/30 bg-accent-500/5 p-8 h-full">
                <div className="flex items-center gap-2 mb-6">
                  <ArrowRight className="w-5 h-5 text-accent-400" />
                  <h3 className="text-white font-bold text-sm">Start with voice. Go deeper when needed.</h3>
                </div>
                <FlowChain
                  steps={['Voice question', 'Concise spoken answer', 'Continue in Ask TriNetra', 'Same conversation', 'Detailed investigation']}
                  color="accent"
                />
                <p className="text-sm text-primary-200 leading-relaxed mt-6">
                  Follow-up questions keep the active investigation context — voice and text share one
                  conversation instead of starting from zero each time.
                </p>
              </div>
            </RevealDiv>
          </div>
        </div>
      </section>

      {/* ═════════════ SECURITY AS ARCHITECTURE ═════════════ */}
      <section className="px-6 py-24 bg-white">
        <div className="max-w-5xl mx-auto">
          <RevealDiv className="text-center mb-14">
            <Kicker>Security by architecture</Kicker>
            <h2 className="text-3xl md:text-4xl font-extrabold text-primary-900 mb-4">Intelligence within jurisdiction.</h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-lg leading-relaxed">
              Access scope is enforced at the backend investigation layer — not merely hidden in the UI.
            </p>
          </RevealDiv>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <RevealDiv delay={1}>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8">
                <FlowChain steps={['JWT', 'Identity', 'Role', 'Jurisdiction', 'Authorized Evidence', 'Investigation']} />
              </div>
            </RevealDiv>
            <RevealDiv delay={2}>
              <div className="rounded-2xl border border-slate-200 bg-white p-8 space-y-3">
                {[
                  { role: 'Investigator', scope: 'Station / unit scope', icon: UserCheck, color: 'text-sky-600 bg-sky-50 border-sky-200' },
                  { role: 'Supervisor', scope: 'District scope', icon: Map, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
                  { role: 'Analyst', scope: 'Statewide scope', icon: Globe, color: 'text-violet-600 bg-violet-50 border-violet-200' },
                  { role: 'Policymaker', scope: 'Statewide scope', icon: KeyRound, color: 'text-amber-600 bg-amber-50 border-amber-200' },
                ].map((r, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/60">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${r.color}`}>
                      <r.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-primary-900">{r.role}</p>
                      <p className="text-xs text-slate-500">{r.scope}</p>
                    </div>
                  </div>
                ))}
                <div className="flex items-start gap-2.5 pt-2 text-xs text-slate-500 leading-relaxed">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                  JWT + RBAC + audit logging sit in front of every investigation query, including voice.
                </div>
              </div>
            </RevealDiv>
          </div>
        </div>
      </section>

      {/* ═══════════ FROM INVESTIGATION TO PREVENTION ═══════════ */}
      <section className="px-6 py-24 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <RevealDiv className="text-center mb-14">
            <Kicker>Prevention</Kicker>
            <h2 className="text-3xl md:text-4xl font-extrabold text-primary-900 mb-4">From investigation to prevention.</h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-lg leading-relaxed">
              TriNetra doesn't stop after analyzing past cases — evidence-driven patterns, signals and
              forecasting can surface emerging prevention opportunities.
            </p>
          </RevealDiv>

          <RevealDiv variant="scale">
            <div className="rounded-2xl border border-slate-200 bg-white p-8 md:p-10">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                {[
                  { icon: FileText, label: 'Historical Evidence', color: 'text-slate-500' },
                  { icon: Target, label: 'Patterns', color: 'text-blue-500' },
                  { icon: Bell, label: 'Signals', color: 'text-amber-500' },
                  { icon: Radar, label: 'Forecast', color: 'text-violet-500' },
                  { icon: ShieldCheck, label: 'Prevention Alert', color: 'text-emerald-500' },
                  { icon: Sparkles, label: 'Next Action', color: 'text-accent-500' },
                ].map((e, i) => (
                  <div key={i} className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-100 bg-slate-50/60">
                    <e.icon className={`w-5 h-5 ${e.color}`} />
                    <span className="text-[11px] font-bold text-slate-600 text-center leading-tight">{e.label}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-center gap-2 mt-6 text-xs text-slate-400 italic">
                Evidence-driven prevention intelligence — not speculative predictions presented as certainty
              </div>
            </div>
          </RevealDiv>
        </div>
      </section>

      {/* ═══════════════ WHY "REFINED" ═══════════════ */}
      <section className="px-6 py-24 bg-white">
        <div className="max-w-5xl mx-auto">
          <RevealDiv className="text-center mb-14">
            <Kicker>The core idea</Kicker>
            <h2 className="text-3xl md:text-4xl font-extrabold text-primary-900 mb-4">Raw records → refined intelligence.</h2>
          </RevealDiv>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <RevealDiv variant="left" delay={1}>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8">
                <FlowChain steps={['Fragmented records', 'Structured evidence', 'Connected relationships', 'Specialized investigation', 'Evidence fusion', 'Refined investigative intelligence']} color="accent" />
              </div>
            </RevealDiv>
            <RevealDiv variant="right" delay={2}>
              <p className="text-lg text-slate-700 leading-relaxed mb-6">
                TriNetra doesn't replace the investigator. It reduces the distance between fragmented
                evidence and the next informed decision — with AI assisting, never substituting for evidence.
              </p>
              <div className="space-y-3">
                {[
                  'Deterministic resolution for exact cases and entities',
                  'Specialized engines for network, financial, pattern and risk analysis',
                  'Evidence fusion with citations and provenance',
                  'Voice and text that share one investigation context',
                  'Jurisdiction-enforced at the backend, not hidden in the UI',
                ].map((pt, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-accent-600" /> {pt}
                  </div>
                ))}
              </div>
            </RevealDiv>
          </div>
        </div>
      </section>

      {/* ═══════════════ COMPETITIVE EDGE ═══════════════ */}
      <section className="px-6 py-24 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <RevealDiv className="text-center mb-14">
            <Kicker>Competitive edge</Kicker>
            <h2 className="text-3xl md:text-4xl font-extrabold text-primary-900 mb-4">What makes TriNetra different?</h2>
          </RevealDiv>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: Eye, title: 'Evidence first', desc: 'Generated language is never treated as evidence. Every finding traces to records and citations.' },
              { icon: Workflow, title: 'Multi-engine', desc: 'One question can orchestrate several specialized investigations — not one generic model.' },
              { icon: Network, title: 'Connected intelligence', desc: 'Cases, people, transactions and evidence are analyzed as relationships.' },
              { icon: Cpu, title: 'Deterministic safety', desc: 'Critical scope, resolution and action logic is controlled rather than left entirely to an LLM.' },
              { icon: Mic, title: 'Voice + text', desc: 'English and Kannada voice connects to the same investigation pipeline as text.' },
              { icon: MessagesSquare, title: 'Persistent context', desc: 'Follow-ups continue the investigation instead of starting from zero — across voice and text.' },
            ].map((e, i) => (
              <RevealDiv key={i} delay={Math.min(i + 1, 6)} className="rounded-2xl border border-slate-200 bg-white p-6 hover:shadow-md hover:border-accent-200 transition-all duration-300">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-primary-50 border border-primary-100 flex items-center justify-center">
                    <e.icon className="w-4.5 h-4.5 text-primary-900" style={{ width: 18, height: 18 }} />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 tracking-widest">0{i + 1}</span>
                </div>
                <h3 className="font-bold text-primary-900 mb-1.5">{e.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{e.desc}</p>
              </RevealDiv>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════ CTA ═══════════════════ */}
      <section className="px-6 py-24 bg-primary-950 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(201,162,39,0.10)_0%,transparent_60%)]" />
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <RevealDiv>
            <p className="text-lg md:text-xl text-primary-200 leading-relaxed mb-3">Built for investigators.</p>
            <p className="text-lg md:text-xl text-primary-200 leading-relaxed mb-3">Designed around evidence.</p>
            <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-10 leading-tight">
              From fragmented records to <span className="text-accent-400">refined intelligence</span>.
            </h2>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/login"
                className="group inline-flex items-center gap-2 px-8 py-4 rounded-lg font-semibold text-base text-primary-900 bg-accent-500 hover:bg-accent-400 transition-all duration-300 shadow-lg shadow-accent-500/20 hover:shadow-accent-500/40 hover:-translate-y-0.5">
                Explore TriNetra
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <button onClick={() => setShowArchitecture(true)}
                className="inline-flex items-center gap-2 px-8 py-4 rounded-lg font-semibold text-base text-white border border-white/20 hover:bg-white/10 transition-all duration-300 hover:-translate-y-0.5">
                <Server className="w-4 h-4" /> Explore the Architecture
              </button>
            </div>
            <p className="text-[11px] text-primary-300/70 mt-8 max-w-xl mx-auto leading-relaxed">
              Demonstration build over a fully synthetic dataset (2,896 FIRs · 31 districts · 3,827 accused) —
              no real police records. Capabilities shown are implemented in this repository.
            </p>
          </RevealDiv>
        </div>
      </section>

      {/* ── Architecture overlay ── */}
      {showArchitecture && (
        <div className="fixed top-0 left-0 right-0 bottom-0 z-[100] bg-white overflow-hidden flex flex-col" style={{ animation: 'fadeIn 0.3s ease-out' }}>
          <ArchitecturePage onClose={() => setShowArchitecture(false)} />
        </div>
      )}
    </div>
  );
}
