import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ArchitecturePage from './ArchitecturePage';
import {
  Shield, Brain, Network, Map, UserCheck, Bell, Mic, ChevronRight, Lock,
  MessageSquare, Database, FolderSearch, Code, Briefcase, Globe, Server,
  Search, Eye, Link2, ArrowRight, Layers,
  AlertTriangle, FileText, CreditCard, Target, Cpu, KeyRound,
  CheckCircle2, Zap, Users, GitBranch, DollarSign, Sparkles
} from 'lucide-react';

/* ══════════════════════════════════════════════
   SCROLL REVEAL HOOK
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
  const delayCls = delay > 0 ? `delay-${delay}` : '';
  return <div ref={ref} className={`${cls} ${delayCls} ${className}`} {...props}>{children}</div>;
}

/* ══════════════════════════════════════════════
   HERO NETWORK ANIMATION (Pure CSS/SVG)
   ══════════════════════════════════════════════ */
function HeroNetwork() {
  // Primary nodes (more prominent)
  const primary = [
    { x: 375, y: 185, r: 5 },  // center
    { x: 280, y: 120, r: 4 },
    { x: 470, y: 130, r: 4 },
    { x: 340, y: 260, r: 4 },
    { x: 180, y: 200, r: 4 },
    { x: 560, y: 210, r: 4 },
  ];
  // Secondary nodes (background depth)
  const secondary = [
    { x: 120, y: 80, r: 2.5 }, { x: 600, y: 60, r: 2.5 },
    { x: 100, y: 300, r: 2.5 }, { x: 650, y: 300, r: 2.5 },
    { x: 200, y: 50, r: 2 }, { x: 520, y: 40, r: 2 },
    { x: 300, y: 340, r: 2 }, { x: 450, y: 340, r: 2 },
    { x: 70, y: 170, r: 2 }, { x: 680, y: 170, r: 2 },
  ];
  const allNodes = [...primary, ...secondary];

  // Edges connecting primary nodes to each other and to secondary nodes
  const edges: [number, number, number][] = [
    // Primary–primary connections (stronger)
    [0,1, 1.2], [0,2, 1.2], [0,3, 1.2], [1,4, 1.0], [2,5, 1.0], [1,2, 0.8], [3,4, 0.8], [3,5, 0.8],
    // Primary–secondary connections (thinner)
    [1,8, 0.5], [1,10, 0.5], [2,9, 0.5], [2,11, 0.5],
    [4,6, 0.5], [4,12, 0.5], [5,7, 0.5], [5,13, 0.5],
    [3,14, 0.4], [3,15, 0.4], [0,8, 0.3], [0,9, 0.3],
  ];

  return (
    <svg viewBox="0 0 750 370" className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
      {/* Edges — muted navy-blue, not gold, to avoid warm tint */}
      {edges.map(([a, b, w], i) => (
        <line key={i}
          x1={allNodes[a].x} y1={allNodes[a].y}
          x2={allNodes[b].x} y2={allNodes[b].y}
          stroke="#5b7da1" strokeWidth={w} opacity={i < 8 ? 0.18 : 0.09}
          className="hero-network-edge"
          style={{ strokeDasharray: '4 6', animation: `dashFlow ${4 + (i % 4)}s linear infinite` }} />
      ))}
      {/* Secondary nodes — faint background depth */}
      {secondary.map((n, i) => (
        <circle key={`s${i}`} cx={n.x} cy={n.y} r={n.r}
          fill="#7b9bbd" opacity={0.2}
          className="hero-network-node"
          style={{ animation: `nodeFloat ${6 + (i % 3)}s ease-in-out ${i * 0.5}s infinite` }} />
      ))}
      {/* Primary nodes — slightly brighter, varied sizes */}
      {primary.map((n, i) => (
        <circle key={`p${i}`} cx={n.x} cy={n.y} r={n.r}
          fill="#93a8c1" opacity={i === 0 ? 0.35 : 0.25}
          className="hero-network-node"
          style={{ animation: `nodeFloat ${5 + (i % 3)}s ease-in-out ${i * 0.4}s infinite` }} />
      ))}
      {/* Subtle pulse on center node */}
      <circle cx={primary[0].x} cy={primary[0].y} r="14" fill="none" stroke="#93a8c1" strokeWidth="0.5" opacity="0.15"
        className="hero-pulse" style={{ animation: 'heroPulse 6s ease-in-out infinite' }} />
    </svg>
  );
}

/* ══════════════════════════════════════════════
   INVESTIGATION FLOW ANIMATION
   ══════════════════════════════════════════════ */
function InvestigationFlow() {
  const steps = [
    { icon: Search, label: 'Query', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    { icon: Brain, label: 'Understand', color: 'text-primary-400', bg: 'bg-primary-500/10', border: 'border-primary-500/20' },
    { icon: Layers, label: 'Discover', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    { icon: Network, label: 'Connect', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    { icon: Eye, label: 'Explain', color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
    { icon: Zap, label: 'Act', color: 'text-accent-400', bg: 'bg-accent-500/10', border: 'border-accent-500/20' },
  ];
  return (
    <div className="flex flex-col md:flex-row items-center gap-3 md:gap-0">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className={`flex flex-col items-center gap-2 ${s.bg} ${s.border} border rounded-xl p-4 min-w-[90px] transition-all hover:scale-105 duration-300`}>
            <s.icon className={`w-6 h-6 ${s.color}`} />
            <span className="text-xs font-bold text-white uppercase tracking-wider">{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <ArrowRight className="w-5 h-5 text-slate-600 hidden md:block shrink-0 -mx-1" />
          )}
          {i < steps.length - 1 && (
            <div className="w-px h-4 bg-slate-600 md:hidden" />
          )}
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════
   ILLUSTRATIVE GRAPH (presentation only)
   ══════════════════════════════════════════════ */
function IllustrativeGraph() {
  return (
    <div className="relative w-full h-[320px] md:h-[400px] rounded-xl border border-slate-700/50 bg-slate-900/50 overflow-hidden" role="img" aria-label="Illustrative evidence graph visualization">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(201,162,39,0.06)_0%,transparent_70%)]" />
      <svg viewBox="0 0 600 380" className="w-full h-full" aria-hidden="true">
        {/* Edges */}
        <line x1="100" y1="60" x2="250" y2="140" stroke="#c9a227" strokeWidth="1" opacity="0.4" strokeDasharray="4 4" />
        <line x1="250" y1="140" x2="400" y2="60" stroke="#3b82f6" strokeWidth="1" opacity="0.4" strokeDasharray="4 4" />
        <line x1="250" y1="140" x2="250" y2="240" stroke="#10b981" strokeWidth="1" opacity="0.4" strokeDasharray="4 4" />
        <line x1="400" y1="60" x2="500" y2="180" stroke="#f59e0b" strokeWidth="1" opacity="0.4" strokeDasharray="4 4" />
        <line x1="250" y1="240" x2="100" y2="320" stroke="#ef4444" strokeWidth="1" opacity="0.4" strokeDasharray="4 4" />
        <line x1="250" y1="240" x2="450" y2="320" stroke="#c9a227" strokeWidth="1" opacity="0.3" strokeDasharray="4 4" />
        <line x1="100" y1="60" x2="50" y2="180" stroke="#5b7da1" strokeWidth="1" opacity="0.3" strokeDasharray="4 4" />
        <line x1="500" y1="180" x2="450" y2="320" stroke="#3b82f6" strokeWidth="1" opacity="0.3" strokeDasharray="4 4" />

        {/* Nodes — Person */}
        <circle cx="100" cy="60" r="20" fill="#102a54" stroke="#3b82f6" strokeWidth="2" />
        <text x="100" y="64" textAnchor="middle" fill="#93c5fd" fontSize="14" aria-label="Person node">👤</text>
        <text x="100" y="90" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="600">Accused</text>

        {/* Node — Case */}
        <circle cx="250" cy="140" r="20" fill="#102a54" stroke="#c9a227" strokeWidth="2" />
        <text x="250" y="144" textAnchor="middle" fill="#fbbf24" fontSize="14" aria-label="Case node">📋</text>
        <text x="250" y="170" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="600">FIR</text>

        {/* Node — Person 2 */}
        <circle cx="400" cy="60" r="20" fill="#102a54" stroke="#3b82f6" strokeWidth="2" />
        <text x="400" y="64" textAnchor="middle" fill="#93c5fd" fontSize="14" aria-label="Person node">👤</text>
        <text x="400" y="90" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="600">Co-Accused</text>

        {/* Node — Location */}
        <circle cx="50" cy="180" r="16" fill="#102a54" stroke="#06b6d4" strokeWidth="2" />
        <text x="50" y="184" textAnchor="middle" fill="#67e8f9" fontSize="12" aria-label="Location node">📍</text>

        {/* Node — MO */}
        <circle cx="250" cy="240" r="20" fill="#102a54" stroke="#10b981" strokeWidth="2" />
        <text x="250" y="244" textAnchor="middle" fill="#6ee7b7" fontSize="14" aria-label="Modus Operandi node">🔍</text>
        <text x="250" y="270" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="600">Modus Operandi</text>

        {/* Node — Account */}
        <circle cx="500" cy="180" r="20" fill="#102a54" stroke="#f59e0b" strokeWidth="2" />
        <text x="500" y="184" textAnchor="middle" fill="#fcd34d" fontSize="14" aria-label="Account node">💰</text>
        <text x="500" y="210" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="600">Account</text>

        {/* Node — Victim */}
        <circle cx="100" cy="320" r="16" fill="#102a54" stroke="#ef4444" strokeWidth="2" />
        <text x="100" y="324" textAnchor="middle" fill="#fca5a5" fontSize="12" aria-label="Victim node">👤</text>

        {/* Node — Transaction */}
        <circle cx="450" cy="320" r="16" fill="#102a54" stroke="#c9a227" strokeWidth="2" />
        <text x="450" y="324" textAnchor="middle" fill="#dac083" fontSize="12" aria-label="Transaction node">💸</text>

        {/* Labels */}
        <text x="175" y="95" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="600" transform="rotate(-25, 175, 95)">linked to</text>
        <text x="325" y="95" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="600" transform="rotate(25, 325, 95)">linked to</text>
        <text x="265" y="190" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="600">uses</text>
        <text x="460" y="115" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="600" transform="rotate(40, 460, 115)">financial</text>
        <text x="170" y="280" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="600" transform="rotate(30, 170, 280)">victim of</text>
        <text x="360" y="280" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="600" transform="rotate(-30, 360, 280)">transferred</text>
      </svg>
      <div className="absolute bottom-3 left-3 text-[10px] text-slate-500 italic bg-slate-900/80 px-2 py-1 rounded">Illustrative visualization</div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   CAPABILITY GROUP CARD
   ══════════════════════════════════════════════ */
function CapGroup({ title, icon: Icon, color, items, delay }: {
  title: string; icon: any; color: string; items: string[]; delay: number;
}) {
  return (
    <RevealDiv delay={delay} className="group p-6 rounded-xl border border-slate-200 hover:border-accent-400 hover:shadow-lg hover:shadow-accent-500/5 transition-all duration-300 bg-white">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${color} transition-transform duration-300 group-hover:scale-110`}>
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="text-base font-bold text-primary-900 mb-3">{title}</h3>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-accent-500" />
            {item}
          </li>
        ))}
      </ul>
    </RevealDiv>
  );
}

/* ══════════════════════════════════════════════
   MAIN LANDING PAGE
   ══════════════════════════════════════════════ */
export default function LandingPage() {
  const [showArchitecture, setShowArchitecture] = useState(false);

  // Smooth scroll-driven navbar resize
  useEffect(() => {
    const pill = document.getElementById('landing-nav-pill');
    if (!pill) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = Math.min(window.scrollY, 250);
        const p = reducedMotion ? (y > 100 ? 1 : 0) : y / 250;
        pill.style.setProperty('--nw', `${800 - 180 * p}px`);
        pill.style.setProperty('--np', `${28 - 14 * p}px`);
        pill.style.setProperty('--nh', `${10 - 2 * p}px`);
        pill.style.setProperty('--ng', `${16 - 8 * p}px`);
        pill.style.setProperty('--nr', `${28 - 8 * p}px`);
        pill.style.setProperty('--ns', `0 ${4 + 4 * p}px ${12 + 8 * p}px rgba(0,0,0,${0.06 + 0.04 * p})`);
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-accent-200 selection:text-primary-900 flex flex-col">

      {/* ── Floating Navigation Pill ── */}
      <nav className="fixed left-1/2 -translate-x-1/2 z-50" style={{ top: '12px' }}>
        <div id="landing-nav-pill"
          className="bg-white/90 backdrop-blur-xl border border-slate-200/60 flex items-center"
          style={{
            '--nw': '800px', '--np': '28px', '--nh': '10px', '--ng': '16px', '--nr': '28px',
            '--ns': '0 4px 12px rgba(0,0,0,0.06)',
            width: 'var(--nw)',
            paddingLeft: 'var(--np)', paddingRight: 'var(--np)',
            paddingTop: 'var(--nh)', paddingBottom: 'var(--nh)',
            gap: 'var(--ng)', borderRadius: 'var(--nr)',
            boxShadow: 'var(--ns)',
            maxWidth: 'calc(100vw - 24px)',
          } as React.CSSProperties}
        >
          <Link to="/" className="flex items-center gap-2.5 group shrink-0">
            <div className="w-9 h-9 rounded-lg overflow-hidden bg-white shadow-sm flex items-center justify-center p-0.5 border border-slate-100 group-hover:shadow-md transition-shadow">
              <img src="/logo.png" alt="TriNetra Logo" className="w-full h-full object-contain" />
            </div>
            <span className="font-bold text-[15px] tracking-tight text-primary-900">TRINETRA</span>
          </Link>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <button onClick={() => setShowArchitecture(true)}
              className="hidden sm:inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-600 hover:text-primary-900 transition-colors px-3 py-2 rounded-full hover:bg-slate-100/60">
              <Server className="w-4 h-4" /> Architecture
            </button>
            <Link to="/login"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full font-medium text-[13px] text-white bg-primary-900 hover:bg-primary-800 transition-all duration-200 shadow-sm hover:shadow-md active:scale-[0.98]">
              <Lock className="w-3.5 h-3.5" /> Log In
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-grow">

        {/* ═══════════════════════════════════════
           SECTION 1 — HERO
           ═══════════════════════════════════════ */}
        <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-primary-950 via-primary-900 to-primary-950" />
          {/* Network animation */}
          <HeroNetwork />
          {/* Radial glow — subtle navy depth, no purple */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-3xl hero-pulse" style={{ background: 'radial-gradient(circle, rgba(201,162,39,0.04) 0%, rgba(10,31,68,0.0) 70%)' }} />

          <div className="relative z-10 max-w-5xl mx-auto px-6 text-center pt-28 pb-20">
            {/* Logo */}
            <div className="w-20 h-20 mx-auto mb-8 rounded-2xl border-2 border-accent-500/30 bg-white/10 backdrop-blur-sm p-2.5 flex items-center justify-center" style={{ animation: 'fadeInUp 0.8s cubic-bezier(0.16,1,0.3,1) forwards' }}>
              <img src="/logo.png" alt="TriNetra" className="w-full h-full object-contain" />
            </div>

            <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold text-white tracking-tight mb-4"
              style={{ animation: 'fadeInUp 0.8s 0.15s cubic-bezier(0.16,1,0.3,1) both' }}>
              TRINETRA
            </h1>

            <p className="text-sm md:text-base text-accent-400 font-bold tracking-[0.25em] uppercase mb-6"
              style={{ animation: 'fadeInUp 0.8s 0.3s cubic-bezier(0.16,1,0.3,1) both' }}>
              Evidence-Driven Crime Intelligence
            </p>

            <p className="text-lg md:text-xl text-primary-200 max-w-2xl mx-auto leading-relaxed mb-10"
              style={{ animation: 'fadeInUp 0.8s 0.45s cubic-bezier(0.16,1,0.3,1) both' }}>
              Connect fragmented crime records, uncover hidden relationships, and turn evidence into explainable investigative intelligence.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4"
              style={{ animation: 'fadeInUp 0.8s 0.6s cubic-bezier(0.16,1,0.3,1) both' }}>
              <Link to="/login"
                className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-lg font-semibold text-base text-primary-900 bg-accent-500 hover:bg-accent-400 transition-all duration-300 shadow-lg shadow-accent-500/20 hover:shadow-accent-500/40 hover:-translate-y-0.5 active:scale-[0.98]">
                Access the Intelligence Core
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <button onClick={() => setShowArchitecture(true)}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg font-semibold text-base text-white border border-white/20 hover:bg-white/10 transition-all duration-300 hover:-translate-y-0.5">
                <Server className="w-4 h-4" /> Explore Architecture
              </button>
            </div>

            {/* Scroll indicator */}
            <div className="mt-16 flex flex-col items-center gap-2 opacity-60" style={{ animation: 'fadeIn 1s 1.2s both' }}>
              <span className="text-xs text-primary-300 tracking-widest uppercase">Scroll to explore</span>
              <div className="w-5 h-8 rounded-full border-2 border-primary-400/30 flex items-start justify-center p-1">
                <div className="w-1 h-2 rounded-full bg-accent-400" style={{ animation: 'nodeFloat 2s ease-in-out infinite' }} />
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════
           SECTION 2 — THE CHALLENGE
           ═══════════════════════════════════════ */}
        <section className="px-6 py-24 bg-white">
          <div className="max-w-5xl mx-auto">
            <RevealDiv className="text-center mb-16">
              <p className="text-xs font-bold text-accent-600 tracking-[0.3em] uppercase mb-3">The Problem</p>
              <h2 className="text-3xl md:text-4xl font-extrabold text-primary-900 mb-4">
                Crime data is connected.<br />Investigations shouldn't be fragmented.
              </h2>
              <p className="text-slate-600 max-w-2xl mx-auto text-lg leading-relaxed">
                Every FIR, accused, victim, location, modus operandi, and transaction is part of a larger web of intelligence.
                Without the right tools, investigators see isolated records — not the hidden relationships between them.
              </p>
            </RevealDiv>

            {/* Disconnected → Connected transition */}
            <RevealDiv className="relative">
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-8">
                {[
                  { icon: FileText, label: 'FIRs', color: 'text-blue-500 bg-blue-50 border-blue-200' },
                  { icon: FolderSearch, label: 'Cases', color: 'text-indigo-500 bg-indigo-50 border-indigo-200' },
                  { icon: Users, label: 'Accused', color: 'text-red-500 bg-red-50 border-red-200' },
                  { icon: UserCheck, label: 'Victims', color: 'text-pink-500 bg-pink-50 border-pink-200' },
                  { icon: Map, label: 'Locations', color: 'text-emerald-500 bg-emerald-50 border-emerald-200' },
                  { icon: Target, label: 'MO', color: 'text-amber-500 bg-amber-50 border-amber-200' },
                  { icon: CreditCard, label: 'Accounts', color: 'text-violet-500 bg-violet-50 border-violet-200' },
                ].map((item, i) => (
                  <div key={i} className={`flex flex-col items-center gap-2 p-4 rounded-xl border ${item.color} transition-all hover:scale-105 duration-300`}>
                    <item.icon className="w-5 h-5" />
                    <span className="text-xs font-bold">{item.label}</span>
                  </div>
                ))}
              </div>

              <div className="text-center py-4">
                <div className="inline-flex items-center gap-3 text-primary-900">
                  <div className="h-px w-12 bg-gradient-to-r from-transparent to-accent-500" />
                  <span className="text-lg font-bold">TriNetra connects the evidence</span>
                  <div className="h-px w-12 bg-gradient-to-l from-transparent to-accent-500" />
                </div>
                <ArrowRight className="w-6 h-6 text-accent-500 mx-auto mt-3 rotate-90 md:rotate-0" />
              </div>

              {/* Connected state */}
              <div className="mt-8 p-6 rounded-xl border border-accent-200 bg-accent-50/30 flex flex-wrap items-center justify-center gap-3">
                {['FIRs', 'Cases', 'Accused', 'Victims', 'Locations', 'MO', 'Accounts'].map((label, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-primary-900 text-accent-400 border border-primary-800">
                    <Link2 className="w-3 h-3" /> {label}
                  </span>
                ))}
              </div>
            </RevealDiv>
          </div>
        </section>

        {/* ═══════════════════════════════════════
           SECTION 3 — THREE PILLARS
           ═══════════════════════════════════════ */}
        <section className="px-6 py-24 bg-slate-50">
          <div className="max-w-6xl mx-auto">
            <RevealDiv className="text-center mb-16">
              <p className="text-xs font-bold text-accent-600 tracking-[0.3em] uppercase mb-3">The TriNetra Approach</p>
              <h2 className="text-3xl md:text-4xl font-extrabold text-primary-900 mb-4">Three Eyes on the Evidence</h2>
              <p className="text-slate-600 max-w-xl mx-auto">TriNetra — meaning "three eyes" — sees crime intelligence from three complementary perspectives.</p>
            </RevealDiv>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { title: 'DISCOVER', icon: Search, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20', desc: 'Surface hidden patterns, emerging trends, and semantic connections across thousands of records that no human could find manually.', capabilities: ['Natural language querying', 'Crime pattern detection', 'Narrative semantic search', 'Geographic hotspot analysis'] },
                { title: 'CONNECT', icon: Network, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', desc: 'Map criminal networks, financial trails, and cross-case relationships into an interactive intelligence graph.', capabilities: ['Criminal network mapping', 'Financial trail analysis', 'Evidence graph visualization', 'Cross-case linking'] },
                { title: 'ACT', icon: Zap, color: 'text-accent-500', bg: 'bg-accent-500/10', border: 'border-accent-500/20', desc: 'Transform insights into evidence-backed investigative actions with explainable reasoning and next-best-action guidance.', capabilities: ['Next Best Action', 'Evidence-backed reasoning', 'Explainable risk profiling', 'Investigation decision support'] },
              ].map((pillar, i) => (
                <RevealDiv key={i} delay={i + 1} className={`relative p-8 rounded-xl border ${pillar.border} ${pillar.bg} transition-all duration-300 hover:shadow-lg group`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${pillar.bg} border ${pillar.border} group-hover:scale-110 transition-transform duration-300`}>
                      <pillar.icon className={`w-6 h-6 ${pillar.color}`} />
                    </div>
                    <h3 className="text-xl font-extrabold text-primary-900 tracking-wide">{pillar.title}</h3>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed mb-5">{pillar.desc}</p>
                  <ul className="space-y-2">
                    {pillar.capabilities.map((cap, j) => (
                      <li key={j} className="flex items-center gap-2 text-sm text-slate-700">
                        <CheckCircle2 className={`w-3.5 h-3.5 ${pillar.color} shrink-0`} />
                        {cap}
                      </li>
                    ))}
                  </ul>
                </RevealDiv>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════
           SECTION 4 — INTELLIGENCE PIPELINE
           ═══════════════════════════════════════ */}
        <section className="px-6 py-24 bg-white">
          <div className="max-w-6xl mx-auto">
            <RevealDiv className="text-center mb-16">
              <p className="text-xs font-bold text-accent-600 tracking-[0.3em] uppercase mb-3">How It Works</p>
              <h2 className="text-3xl md:text-4xl font-extrabold text-primary-900 mb-4">The Intelligence Pipeline</h2>
              <p className="text-slate-600 max-w-xl mx-auto">Every query is routed through specialized engines — not a generic AI — to produce evidence-grounded intelligence.</p>
            </RevealDiv>

            <RevealDiv className="flex justify-center mb-12">
              <InvestigationFlow />
            </RevealDiv>

            {/* Engine cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { title: 'NL2SQL', desc: 'Natural language to database queries with SQL safety guardrails', icon: Database, color: 'text-blue-500 bg-blue-50 border-blue-200' },
                { title: 'RAG Engine', desc: 'Semantic search across FIR narratives with source citations', icon: Search, color: 'text-emerald-500 bg-emerald-50 border-emerald-200' },
                { title: 'Graph Analytics', desc: 'Criminal network traversal and relationship mapping', icon: Network, color: 'text-purple-500 bg-purple-50 border-purple-200' },
                { title: 'Pattern Engine', desc: 'Tri-signal pattern detection across MO, space, and time', icon: Layers, color: 'text-amber-500 bg-amber-50 border-amber-200' },
              ].map((engine, i) => (
                <RevealDiv key={i} delay={i + 1} className="p-5 rounded-xl border border-slate-200 bg-white hover:shadow-md transition-all duration-300 group">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${engine.color} border group-hover:scale-110 transition-transform duration-300`}>
                    <engine.icon className="w-4 h-4" />
                  </div>
                  <h4 className="font-bold text-sm text-primary-900 mb-1">{engine.title}</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">{engine.desc}</p>
                </RevealDiv>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════
           SECTION 5 — ASK TRINETRA
           ═══════════════════════════════════════ */}
        <section className="px-6 py-24 bg-slate-50">
          <div className="max-w-5xl mx-auto">
            <RevealDiv className="text-center mb-16">
              <p className="text-xs font-bold text-accent-600 tracking-[0.3em] uppercase mb-3">Conversational Intelligence</p>
              <h2 className="text-3xl md:text-4xl font-extrabold text-primary-900 mb-4">Ask TriNetra</h2>
              <p className="text-slate-600 max-w-xl mx-auto">Query the crime database using plain English or Kannada. TriNetra understands intent and routes to the right engine.</p>
            </RevealDiv>

            <RevealDiv variant="scale">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
                {/* Chat header */}
                <div className="bg-primary-900 px-6 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 bg-accent-500 rounded-lg flex items-center justify-center">
                    <MessageSquare className="w-4 h-4 text-primary-900" />
                  </div>
                  <span className="text-white font-bold text-sm">Intelligence Copilot</span>
                  <span className="ml-auto text-xs text-primary-300">EN | KN</span>
                </div>

                {/* Chat body */}
                <div className="p-6 space-y-5 bg-slate-50/50">
                  {/* User query */}
                  <div className="flex justify-end">
                    <div className="max-w-[80%] bg-primary-900 text-white rounded-2xl rounded-tr-sm px-5 py-3 text-sm">
                      Show recent vehicle theft patterns in Bengaluru and find repeat offenders.
                    </div>
                  </div>

                  {/* Bot response — investigation result */}
                  <div className="flex gap-3">
                    <div className="w-8 h-8 bg-primary-900 rounded-lg flex items-center justify-center shrink-0">
                      <Brain className="w-4 h-4 text-accent-500" />
                    </div>
                    <div className="max-w-[85%] space-y-3">
                      <div className="bg-white rounded-2xl rounded-tl-sm px-5 py-4 border border-slate-200 shadow-sm">
                        <p className="text-sm text-slate-700 leading-relaxed mb-3">
                          <span className="font-bold text-primary-900">Investigation Complete.</span> Identified <span className="font-semibold text-primary-900">2 emerging patterns</span> in motor vehicle theft across Bengaluru Urban in the last 3 months. Found <span className="font-semibold text-primary-900">5 connected cases</span> sharing the "Vehicle lifted from parking" modus operandi.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {['NL2SQL', 'Pattern Engine', 'Network Engine'].map((eng, i) => (
                            <span key={i} className="text-[10px] font-bold bg-primary-50 text-primary-700 px-2 py-0.5 rounded border border-primary-100">{eng}</span>
                          ))}
                        </div>
                      </div>

                      {/* Evidence cards */}
                      <div className="space-y-2">
                        <div className="bg-white rounded-lg px-4 py-3 border border-slate-200 shadow-sm flex items-start gap-3">
                          <div className="w-6 h-6 rounded bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
                            <Layers className="w-3.5 h-3.5 text-amber-600" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-primary-900">Vehicle lifted from parking — Motor Vehicle Theft Cluster</p>
                            <p className="text-[11px] text-slate-500">5 cases · Bengaluru Urban · Last 3 months</p>
                          </div>
                        </div>
                        <div className="bg-white rounded-lg px-4 py-3 border border-slate-200 shadow-sm flex items-start gap-3">
                          <div className="w-6 h-6 rounded bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
                            <Network className="w-3.5 h-3.5 text-emerald-600" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-primary-900">Interstate vehicle theft ring detected</p>
                            <p className="text-[11px] text-slate-500">2 cases · Connected accounts · Cross-district</p>
                          </div>
                        </div>
                      </div>

                      {/* WHY button mockup */}
                      <button className="text-[11px] font-bold px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200 hover:bg-emerald-100 transition-colors inline-flex items-center gap-1">
                        <Eye className="w-3 h-3" /> WHY? — View Evidence Graph
                      </button>
                    </div>
                  </div>

                  {/* Typing indicator */}
                  <div className="flex gap-3 opacity-40">
                    <div className="w-8 h-8 bg-primary-900 rounded-lg flex items-center justify-center shrink-0">
                      <Brain className="w-4 h-4 text-accent-500" />
                    </div>
                    <div className="bg-white rounded-2xl rounded-tl-sm px-5 py-3 border border-slate-200 shadow-sm flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-slate-400" style={{ animation: 'typingDot 1.4s infinite 0s' }} />
                      <div className="w-2 h-2 rounded-full bg-slate-400" style={{ animation: 'typingDot 1.4s infinite 0.2s' }} />
                      <div className="w-2 h-2 rounded-full bg-slate-400" style={{ animation: 'typingDot 1.4s infinite 0.4s' }} />
                    </div>
                  </div>
                </div>

                {/* Input bar */}
                <div className="border-t border-slate-200 px-6 py-3 bg-white flex items-center gap-3">
                  <Mic className="w-4 h-4 text-slate-400" />
                  <div className="flex-1 h-10 bg-slate-100 rounded-lg px-4 flex items-center text-sm text-slate-400">
                    Query database, search narratives, or speak voice queries...
                  </div>
                  <div className="w-9 h-9 bg-primary-900 rounded-lg flex items-center justify-center">
                    <ArrowRight className="w-4 h-4 text-accent-500" />
                  </div>
                </div>
              </div>
              <p className="text-center text-[11px] text-slate-400 mt-3 italic">Illustrative UI — not live investigation data</p>
            </RevealDiv>
          </div>
        </section>

        {/* ═══════════════════════════════════════
           SECTION 6 — EVIDENCE GRAPH
           ═══════════════════════════════════════ */}
        <section className="px-6 py-24 bg-primary-950 overflow-hidden">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <RevealDiv variant="left">
                <p className="text-xs font-bold text-accent-400 tracking-[0.3em] uppercase mb-3">Visual Intelligence</p>
                <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">Evidence Graph</h2>
                <p className="text-primary-200 text-lg leading-relaxed mb-6">
                  Hidden relationships become visible. Explore the interconnected web of persons, cases, locations, modus operandi, financial accounts, and transactions — all grounded in real evidence.
                </p>
                <ul className="space-y-3 mb-8">
                  {[
                    'Real entities and relationships from the case database',
                    'Interactive zoom, pan, and node exploration',
                    'Evidence-backed WHY explanations for every recommendation',
                    'Financial trail visualization across accounts and cases',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-primary-100">
                      <CheckCircle2 className="w-4 h-4 text-accent-400 mt-0.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link to="/login"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm text-primary-900 bg-accent-500 hover:bg-accent-400 transition-all duration-200 shadow-sm hover:shadow-md">
                  Explore the Graph <ChevronRight className="w-4 h-4" />
                </Link>
              </RevealDiv>

              <RevealDiv variant="right" delay={2}>
                <IllustrativeGraph />
              </RevealDiv>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════
           SECTION 7 — FOUR LAYERS
           ═══════════════════════════════════════ */}
        <section className="px-6 py-24 bg-white">
          <div className="max-w-6xl mx-auto">
            <RevealDiv className="text-center mb-16">
              <p className="text-xs font-bold text-accent-600 tracking-[0.3em] uppercase mb-3">Architecture</p>
              <h2 className="text-3xl md:text-4xl font-extrabold text-primary-900 mb-4">Four Layers of Intelligence</h2>
              <p className="text-slate-600 max-w-xl mx-auto">A robust architecture engineered for security, speed, and accuracy.</p>
            </RevealDiv>

            <div className="space-y-6">
              {[
                { num: '01', title: 'Conversational Layer', desc: 'Natural language interface for instant, secure access to complex database queries. English and Kannada voice support.', icon: MessageSquare, color: 'text-blue-500', bg: 'bg-blue-500/5', border: 'border-blue-500/10' },
                { num: '02', title: 'Intelligence Layer', desc: 'Multi-engine reasoning using NL2SQL, RAG, graph analytics, pattern detection, and financial analysis.', icon: Brain, color: 'text-purple-500', bg: 'bg-purple-500/5', border: 'border-purple-500/10' },
                { num: '03', title: 'Data Layer', desc: 'High-performance vector and relational storage — PostgreSQL with pgvector embeddings for semantic search.', icon: Database, color: 'text-emerald-500', bg: 'bg-emerald-500/5', border: 'border-emerald-500/10' },
                { num: '04', title: 'Governance Layer', desc: 'Strict role-based access controls, jurisdiction-aware authorization, immutable audit logging, and SQL safety guardrails.', icon: Shield, color: 'text-accent-500', bg: 'bg-accent-500/5', border: 'border-accent-500/10' },
              ].map((layer, i) => (
                <RevealDiv key={i} delay={i + 1}>
                  <div className={`flex items-center gap-6 p-6 rounded-xl border ${layer.border} ${layer.bg} transition-all duration-300 hover:shadow-md group`}>
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center bg-white border ${layer.border} group-hover:scale-110 transition-transform duration-300 shrink-0`}>
                      <layer.icon className={`w-6 h-6 ${layer.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-xs font-bold text-slate-400 tracking-wider">{layer.num}</span>
                        <h3 className="text-lg font-bold text-primary-900">{layer.title}</h3>
                      </div>
                      <p className="text-sm text-slate-600 leading-relaxed">{layer.desc}</p>
                    </div>
                  </div>
                </RevealDiv>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════
           SECTION 8 — CAPABILITIES
           ═══════════════════════════════════════ */}
        <section className="px-6 py-24 bg-slate-50">
          <div className="max-w-6xl mx-auto">
            <RevealDiv className="text-center mb-16">
              <p className="text-xs font-bold text-accent-600 tracking-[0.3em] uppercase mb-3">Platform Capabilities</p>
              <h2 className="text-3xl md:text-4xl font-extrabold text-primary-900 mb-4">Built for Investigation</h2>
              <p className="text-slate-600 max-w-xl mx-auto">Every capability is grounded in real data, real algorithms, and real evidence.</p>
            </RevealDiv>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <CapGroup title="CONVERSE" icon={MessageSquare} color="bg-blue-50 text-blue-600 border border-blue-200"
                items={['Natural language investigation', 'English + Kannada interaction', 'Voice queries via Sarvam AI', 'Context-aware conversations']} delay={1} />
              <CapGroup title="CONNECT" icon={Network} color="bg-emerald-50 text-emerald-600 border border-emerald-200"
                items={['Criminal network analysis', 'Financial trail mapping', 'Evidence Graph visualization', 'Cross-case relationships']} delay={2} />
              <CapGroup title="DISCOVER" icon={Search} color="bg-amber-50 text-amber-600 border border-amber-200"
                items={['Crime pattern detection', 'Case similarity engine', 'Narrative RAG search', 'Geographic hotspot analysis']} delay={3} />
              <CapGroup title="ASSESS" icon={UserCheck} color="bg-purple-50 text-purple-600 border border-purple-200"
                items={['Explainable risk profiling', 'Behavioral factor analysis', 'Repeat offender detection', 'Prevention early warning']} delay={4} />
              <CapGroup title="ACT" icon={Zap} color="bg-accent-50 text-accent-600 border border-accent-200"
                items={['Next Best Action engine', 'Evidence-backed leads', 'WHY explanations with graph', 'PDF investigation reports']} delay={5} />
              <CapGroup title="GOVERN" icon={Shield} color="bg-red-50 text-red-600 border border-red-200"
                items={['JWT authentication', 'Role-based access control', 'Jurisdiction-aware queries', 'Immutable audit logging']} delay={6} />
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════
           SECTION 9 — FINANCIAL INTELLIGENCE
           ═══════════════════════════════════════ */}
        <section className="px-6 py-24 bg-white">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <RevealDiv variant="right">
                <p className="text-xs font-bold text-accent-600 tracking-[0.3em] uppercase mb-3">Financial Intelligence</p>
                <h2 className="text-3xl md:text-4xl font-extrabold text-primary-900 mb-4">Follow the Money</h2>
                <p className="text-slate-600 text-lg leading-relaxed mb-6">
                  Trace financial relationships connecting accused persons, bank accounts, and transactions across cases. Discover cross-case financial links, transaction chains, and deterministic anomalies.
                </p>
                <div className="grid grid-cols-2 gap-3 mb-8">
                  {[
                    { icon: Link2, label: 'Cross-Case Links', color: 'text-blue-500' },
                    { icon: GitBranch, label: 'Transaction Chains', color: 'text-emerald-500' },
                    { icon: AlertTriangle, label: 'Anomaly Detection', color: 'text-amber-500' },
                    { icon: DollarSign, label: 'Money Flow Graph', color: 'text-violet-500' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2.5 p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <item.icon className={`w-4 h-4 ${item.color}`} />
                      <span className="text-sm font-semibold text-slate-700">{item.label}</span>
                    </div>
                  ))}
                </div>
                <Link to="/login"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm text-white bg-primary-900 hover:bg-primary-800 transition-all duration-200 shadow-sm">
                  Explore Financial Trail <ChevronRight className="w-4 h-4" />
                </Link>
              </RevealDiv>

              <RevealDiv variant="left" delay={2}>
                {/* Illustrative financial flow */}
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-red-100 border-2 border-red-300 flex items-center justify-center text-sm">👤</div>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 border-2 border-emerald-300 flex items-center justify-center text-sm">💰</div>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                    <div className="w-10 h-10 rounded-lg bg-amber-100 border-2 border-amber-300 flex items-center justify-center text-sm">💸</div>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 border-2 border-emerald-300 flex items-center justify-center text-sm">💰</div>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                    <div className="w-10 h-10 rounded-full bg-blue-100 border-2 border-blue-300 flex items-center justify-center text-sm">👤</div>
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-4 pt-2 border-t border-slate-200">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Account</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> Transaction</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> Person</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="bg-white rounded-lg p-3 border border-slate-200">
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Cross-Case Links</p>
                      <p className="text-lg font-bold text-primary-900">9 financial connections</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-slate-200">
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Anomalies</p>
                      <p className="text-lg font-bold text-primary-900">20 detected</p>
                    </div>
                  </div>
                </div>
                <p className="text-center text-[11px] text-slate-400 mt-3 italic">Illustrative — uses actual database schema structure</p>
              </RevealDiv>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════
           SECTION 10 — INVESTIGATOR JOURNEY
           ═══════════════════════════════════════ */}
        <section className="px-6 py-24 bg-primary-950 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(201,162,39,0.04)_0%,transparent_70%)]" />
          <div className="max-w-4xl mx-auto relative z-10">
            <RevealDiv className="text-center mb-16">
              <p className="text-xs font-bold text-accent-400 tracking-[0.3em] uppercase mb-3">End to End</p>
              <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">The Investigator Journey</h2>
              <p className="text-primary-200 max-w-xl mx-auto">From raw records to explainable investigative intelligence — in six steps.</p>
            </RevealDiv>

            <div className="space-y-0">
              {[
                { num: '01', title: 'ASK', desc: '"Show recent vehicle theft patterns in Bengaluru."', detail: 'The investigator types or speaks a natural-language query in English or Kannada.', color: 'border-blue-500', dot: 'bg-blue-500' },
                { num: '02', title: 'UNDERSTAND', desc: 'Intent Router identifies the required intelligence path.', detail: 'The system classifies intent and selects the optimal engine — NL2SQL, RAG, Graph, or Pattern.', color: 'border-purple-500', dot: 'bg-purple-500' },
                { num: '03', title: 'DISCOVER', desc: 'Relevant cases, patterns, and entities are identified.', detail: 'Scoped database queries, vector search, and pattern detection find relevant evidence.', color: 'border-amber-500', dot: 'bg-amber-500' },
                { num: '04', title: 'CONNECT', desc: 'Networks, financial trails, and case relationships emerge.', detail: 'Criminal network traversal, financial link analysis, and cross-case connections are mapped.', color: 'border-emerald-500', dot: 'bg-emerald-500' },
                { num: '05', title: 'EXPLAIN', desc: 'Evidence and source references support every finding.', detail: 'Citations, evidence graphs, and WHY explanations ensure every conclusion is traceable.', color: 'border-cyan-500', dot: 'bg-cyan-500' },
                { num: '06', title: 'ACT', desc: 'Next Best Action provides an investigative direction.', detail: 'Scope-aware, evidence-backed leads tell the investigator exactly what to review next.', color: 'border-accent-500', dot: 'bg-accent-500' },
              ].map((step, i) => (
                <RevealDiv key={i} delay={Math.min(i + 1, 4)}>
                  <div className={`flex gap-6 ${i < 5 ? 'pb-8' : ''}`}>
                    {/* Timeline */}
                    <div className="flex flex-col items-center">
                      <div className={`w-10 h-10 rounded-full border-2 ${step.color} bg-primary-950 flex items-center justify-center shrink-0`}>
                        <span className="text-xs font-bold text-white">{step.num}</span>
                      </div>
                      {i < 5 && <div className={`w-px flex-1 bg-gradient-to-b ${step.color.replace('border-', 'from-')} to-transparent opacity-30 mt-2`} />}
                    </div>
                    {/* Content */}
                    <div className="pb-2">
                      <h3 className="text-sm font-bold text-accent-400 tracking-widest uppercase mb-1">{step.title}</h3>
                      <p className="text-lg font-bold text-white mb-1">{step.desc}</p>
                      <p className="text-sm text-primary-300">{step.detail}</p>
                    </div>
                  </div>
                </RevealDiv>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════
           SECTION 11 — EXPLAINABILITY
           ═══════════════════════════════════════ */}
        <section className="px-6 py-24 bg-white">
          <div className="max-w-5xl mx-auto">
            <RevealDiv className="text-center mb-16">
              <p className="text-xs font-bold text-accent-600 tracking-[0.3em] uppercase mb-3">Trust & Transparency</p>
              <h2 className="text-3xl md:text-4xl font-extrabold text-primary-900 mb-4">Evidence-Backed Intelligence</h2>
              <p className="text-slate-600 max-w-xl mx-auto">Every analytical conclusion is grounded in real data. The investigator can trace any finding back to its source.</p>
            </RevealDiv>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { icon: FileText, title: 'Source Citations', desc: 'Every narrative search result includes direct FIR references and brief facts.', color: 'text-blue-500 bg-blue-50 border-blue-200' },
                { icon: GitBranch, title: 'Evidence Graph', desc: 'Visual proof of relationships between entities — persons, cases, accounts, and transactions.', color: 'text-emerald-500 bg-emerald-50 border-emerald-200' },
                { icon: Eye, title: 'WHY Explanations', desc: 'Every investigative lead includes an explainer showing the underlying evidence.', color: 'text-amber-500 bg-amber-50 border-amber-200' },
              ].map((item, i) => (
                <RevealDiv key={i} delay={i + 1} className="p-6 rounded-xl border border-slate-200 bg-white hover:shadow-md transition-all duration-300 text-center group">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 ${item.color} group-hover:scale-110 transition-transform duration-300`}>
                    <item.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-primary-900 mb-2">{item.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
                </RevealDiv>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════
           SECTION 12 — SECURITY
           ═══════════════════════════════════════ */}
        <section className="px-6 py-20 bg-slate-50">
          <div className="max-w-4xl mx-auto">
            <RevealDiv className="text-center mb-12">
              <p className="text-xs font-bold text-accent-600 tracking-[0.3em] uppercase mb-3">Governance</p>
              <h2 className="text-2xl md:text-3xl font-extrabold text-primary-900 mb-3">Built for Law Enforcement Security</h2>
            </RevealDiv>

            <RevealDiv className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { icon: KeyRound, label: 'JWT Auth' },
                { icon: Shield, label: 'RBAC' },
                { icon: Map, label: 'Jurisdiction' },
                { icon: Database, label: 'SQL Guardrails' },
                { icon: FileText, label: 'Audit Logs' },
                { icon: Lock, label: 'Account Masking' },
              ].map((item, i) => (
                <div key={i} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white border border-slate-200 hover:shadow-sm transition-all duration-200">
                  <item.icon className="w-5 h-5 text-primary-900" />
                  <span className="text-xs font-bold text-slate-700 text-center">{item.label}</span>
                </div>
              ))}
            </RevealDiv>
          </div>
        </section>

        {/* ═══════════════════════════════════════
           SECTION 13 — WHY TRINETRA
           ═══════════════════════════════════════ */}
        <section className="px-6 py-24 bg-white">
          <div className="max-w-5xl mx-auto">
            <RevealDiv className="text-center mb-16">
              <p className="text-xs font-bold text-accent-600 tracking-[0.3em] uppercase mb-3">Why TriNetra</p>
              <h2 className="text-3xl md:text-4xl font-extrabold text-primary-900 mb-4">Intelligence, Not Just Data</h2>
            </RevealDiv>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {[
                { title: 'Specialized Engines', desc: 'Every query routes to the optimal engine — not a generic AI model. NL2SQL for facts, RAG for narratives, Graph for relationships, Patterns for clusters.', icon: Cpu },
                { title: 'Evidence-First', desc: 'Every conclusion is backed by source records. Citations, evidence graphs, and WHY explanations ensure traceability.', icon: Eye },
                { title: 'Multi-Dimensional', desc: 'Criminal networks, financial trails, case similarity, geographic patterns, temporal trends, and risk profiling — in one platform.', icon: Layers },
                { title: 'Multilingual', desc: 'Interact in English or Kannada. Voice queries powered by Sarvam AI neural speech models for natural interaction.', icon: Globe },
                { title: 'Proactive Intelligence', desc: 'Early-warning pattern detection and prevention alerts computed automatically for each officer\'s jurisdiction.', icon: Bell },
                { title: 'Decision Support', desc: 'Next Best Action engine provides evidence-backed investigative leads — telling officers what to review next.', icon: Sparkles },
              ].map((item, i) => (
                <RevealDiv key={i} delay={Math.min(i + 1, 3)} className="flex gap-4 p-5 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-accent-200 hover:shadow-sm transition-all duration-300 group">
                  <div className="w-10 h-10 rounded-lg bg-primary-50 border border-primary-100 flex items-center justify-center shrink-0 group-hover:bg-primary-900 group-hover:border-primary-900 transition-colors duration-300">
                    <item.icon className="w-5 h-5 text-primary-900 group-hover:text-accent-500 transition-colors duration-300" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-primary-900 mb-1">{item.title}</h3>
                    <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
                  </div>
                </RevealDiv>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════
           SECTION 14 — FINAL CTA
           ═══════════════════════════════════════ */}
        <section className="px-6 py-24 bg-primary-950 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(201,162,39,0.08)_0%,transparent_60%)]" />
          <div className="max-w-3xl mx-auto text-center relative z-10">
            <RevealDiv>
              <p className="text-lg md:text-xl text-primary-200 leading-relaxed mb-3">
                From records to relationships.
              </p>
              <p className="text-lg md:text-xl text-primary-200 leading-relaxed mb-8">
                From relationships to intelligence.
              </p>
              <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-10 leading-tight">
                From intelligence to <span className="text-accent-400">action</span>.
              </h2>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link to="/login"
                  className="group inline-flex items-center gap-2 px-8 py-4 rounded-lg font-semibold text-base text-primary-900 bg-accent-500 hover:bg-accent-400 transition-all duration-300 shadow-lg shadow-accent-500/20 hover:shadow-accent-500/40 hover:-translate-y-0.5 active:scale-[0.98]">
                  Access the Intelligence Core
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <button onClick={() => setShowArchitecture(true)}
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-lg font-semibold text-base text-white border border-white/20 hover:bg-white/10 transition-all duration-300 hover:-translate-y-0.5">
                  <Server className="w-4 h-4" /> Explore Architecture
                </button>
              </div>
            </RevealDiv>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="bg-slate-950 text-slate-300 pt-16 pb-8 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-12">
            <div className="md:col-span-4">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-md overflow-hidden bg-white flex items-center justify-center p-0.5 text-sm">
                  <img src="/logo.png" alt="TriNetra Logo" className="w-full h-full object-contain" />
                </div>
                <span className="font-bold text-lg tracking-tight text-white">TRINETRA</span>
              </div>
              <p className="text-sm leading-relaxed text-slate-400 mb-6 pr-4">
                Empowering law enforcement with conversational AI, predictive analytics, and deep relational intelligence to ensure safer communities.
              </p>
            </div>

            <div className="md:col-span-2 md:col-start-6">
              <h4 className="text-white font-semibold mb-5 uppercase tracking-wider text-xs">Platform</h4>
              <ul className="space-y-3 text-sm">
                <li><Link to="/login" className="hover:text-accent-500 transition-colors">Ask TriNetra AI</Link></li>
                <li><Link to="/login" className="hover:text-accent-500 transition-colors">Network Analysis</Link></li>
                <li><Link to="/login" className="hover:text-accent-500 transition-colors">Crime Analytics</Link></li>
                <li><Link to="/login" className="hover:text-accent-500 transition-colors">Financial Trail</Link></li>
                <li><Link to="/login" className="hover:text-accent-500 transition-colors">System Architecture</Link></li>
              </ul>
            </div>

            <div className="md:col-span-5">
              <h4 className="text-white font-semibold mb-5 uppercase tracking-wider text-xs">Development Team</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
                  <h5 className="text-white font-bold text-sm mb-1">Yashvanth M U</h5>
                  <p className="text-xs text-accent-500 font-medium mb-1">ISE Student</p>
                  <p className="text-xs text-slate-500 mb-4">RV College of Engineering</p>
                  <div className="flex gap-2">
                    <a href="https://github.com/Yashvanth-7353" target="_blank" rel="noreferrer" className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center hover:bg-accent-500 hover:text-primary-900 transition-all text-slate-400"><Code size={14} /></a>
                    <a href="https://www.linkedin.com/in/yashvanth-m-u-720598282/" target="_blank" rel="noreferrer" className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center hover:bg-accent-500 hover:text-primary-900 transition-all text-slate-400"><Briefcase size={14} /></a>
                    <a href="https://yashvanth.pages.dev/" target="_blank" rel="noreferrer" className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center hover:bg-accent-500 hover:text-primary-900 transition-all text-slate-400"><Globe size={14} /></a>
                  </div>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
                  <h5 className="text-white font-bold text-sm mb-1">Swamy B S</h5>
                  <p className="text-xs text-accent-500 font-medium mb-1">ISE Student</p>
                  <p className="text-xs text-slate-500 mb-4">RV College of Engineering</p>
                  <div className="flex gap-2">
                    <a href="https://github.com/SwamyBS-codes" target="_blank" rel="noreferrer" className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center hover:bg-accent-500 hover:text-primary-900 transition-all text-slate-400"><Code size={14} /></a>
                    <a href="https://www.linkedin.com/in/swamy-b-s-86613628b/" target="_blank" rel="noreferrer" className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center hover:bg-accent-500 hover:text-primary-900 transition-all text-slate-400"><Briefcase size={14} /></a>
                    <a href="https://swamybs-dev.vercel.app/" target="_blank" rel="noreferrer" className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center hover:bg-accent-500 hover:text-primary-900 transition-all text-slate-400"><Globe size={14} /></a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <p>&copy; {new Date().getFullYear()} TriNetra Intelligence Core. All rights reserved.</p>
            <div className="flex gap-6">
              <span className="hover:text-slate-300 cursor-pointer transition-colors">Privacy Policy</span>
              <span className="hover:text-slate-300 cursor-pointer transition-colors">Terms of Service</span>
            </div>
          </div>
        </div>
      </footer>

      {/* ── Architecture Overlay ── */}
      {showArchitecture && (
        <div className="fixed top-0 left-0 right-0 bottom-0 z-[100] bg-white overflow-hidden flex flex-col" style={{ animation: 'fadeIn 0.3s ease-out' }}>
          <ArchitecturePage onClose={() => setShowArchitecture(false)} />
        </div>
      )}
    </div>
  );
}
