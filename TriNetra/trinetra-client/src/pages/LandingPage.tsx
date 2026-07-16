import { Link } from 'react-router-dom';
import {
  Shield,
  Brain,
  Network,
  Map,
  UserCheck,
  Bell,
  ChevronRight,
  Lock,
  MessageSquare,
  Database,
  FolderSearch,
  Code,
  Briefcase,
  Globe
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-accent-200 selection:text-primary-900 flex flex-col">
      {/* Header/Nav */}
      <nav className="fixed top-0 w-full bg-white/85 backdrop-blur-lg border-b border-slate-200 z-50 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo Image in Navigation */}
            <div className="w-9 h-9 rounded-md overflow-hidden bg-white shadow-sm flex items-center justify-center p-0.5 border border-slate-100">
              <img src="/logo.png" alt="TriNetra Logo" className="w-full h-full object-contain" />
            </div>
            <span className="font-bold text-lg tracking-tight text-primary-900">
              TRINETRA
            </span>
          </div>
          <div>
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-md font-medium text-sm text-white bg-primary-900 hover:bg-primary-800 transition-all duration-200 shadow-sm hover:shadow-md hover:-translate-y-0.5"
            >
              <Lock className="w-3.5 h-3.5" />
              Log In to Portal
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-grow pt-16">
        {/* Hero Section */}
        <section className="relative px-6 pt-20 pb-24 overflow-hidden flex flex-col items-center text-center">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-100 via-white to-white -z-10"></div>

          <div className="w-28 h-28 mb-8 rounded-full border-4 border-accent-500 shadow-xl overflow-hidden bg-white p-2 flex items-center justify-center transform transition hover:scale-105 duration-500">
            <img src="/logo.png" alt="TriNetra Logo" className="w-full h-full object-contain" />
          </div>

          <h1 className="text-5xl md:text-6xl font-extrabold text-primary-900 tracking-tight max-w-4xl mb-3">
            TRINETRA
          </h1>

          <p className="text-sm md:text-base text-accent-600 font-bold tracking-widest uppercase mb-8">
            The Three Eyes: Data • Intelligence • Action
          </p>

          {/* The Perspective of TriNetra */}
          <div className="max-w-3xl mb-8 px-5 py-3 bg-primary-50 border-l-4 border-accent-500 rounded-r-lg inline-block text-left">
            <p className="text-base font-medium text-primary-900 italic">
              "The Third Eye of Law Enforcement — seeing beyond raw data to uncover hidden patterns, anticipate threats, and empower officers with decisive, actionable truth."
            </p>
          </div>

          <p className="text-lg text-slate-600 max-w-2xl mb-10 leading-relaxed">
            The next-generation conversational AI and crime analytics platform built for modern law enforcement.
          </p>

          <Link
            to="/login"
            className="group inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-base text-primary-900 bg-accent-500 hover:bg-accent-400 transition-all duration-300 shadow-lg shadow-accent-500/20 hover:shadow-accent-500/40 hover:-translate-y-1"
          >
            Access the Intelligence Core
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </section>

        {/* The Challenge Section */}
        <section className="px-6 py-20 bg-white border-y border-slate-200">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
              <div className="h-px bg-gradient-to-r from-transparent to-accent-500 flex-1"></div>
              <h2 className="text-2xl font-bold text-primary-900 uppercase tracking-widest text-center">
                The Challenge
              </h2>
              <div className="h-px bg-gradient-to-l from-transparent to-accent-500 flex-1"></div>
            </div>

            <div className="prose prose-base max-w-none text-slate-700 space-y-5 bg-slate-50 p-8 rounded-2xl shadow-inner border border-slate-100">
              <p className="font-medium text-lg leading-relaxed text-primary-900">
                Design and develop an Intelligent Conversational AI and Crime Analytics Platform that enables investigators, analysts, and policymakers to interact with the state crime database using natural language queries, while also providing advanced analytical capabilities.
              </p>
              <p className="leading-relaxed">
                The proposed solution should enable users to discover hidden relationships between crimes, offenders, victims, and locations, support investigative decision making, and provide predictive and preventive insights to strengthen proactive law enforcement.
              </p>
              <div className="pt-3">
                <p className="font-medium text-primary-900 mb-3">The platform goes beyond simple data retrieval to enable:</p>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 list-none pl-0">
                  {[
                    'Natural Language queries and intelligent reasoning',
                    'Crime spatial and temporal hotspot analysis',
                    'Explainable AI risk scoring for repeat offenders',
                    'Proactive prevention alerts filtered by jurisdiction',
                    'Criminal syndicate co-accused relationship graphs'
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm text-sm">
                      <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent-500 shrink-0"></div>
                      <span className="font-medium text-slate-800">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Our Solution (Four-Layer Approach) */}
        <section className="px-6 py-20 bg-slate-50">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-primary-900 mb-3">Architecture of Intelligence</h2>
              <p className="text-base text-slate-600 max-w-2xl mx-auto">A robust four-layer approach engineered for security, speed, and accuracy.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { title: "Conversational Layer", desc: "Natural language interface for instant, secure access to complex database queries.", icon: MessageSquare },
                { title: "Intelligence Layer", desc: "Multi-engine reasoning using NL2SQL, RAG, and Graph analytics.", icon: Brain },
                { title: "Data Layer", desc: "High-performance vector and relational storage handling active database records.", icon: Database },
                { title: "Governance Layer", desc: "Strict role-based access controls and immutable audit logging.", icon: Shield }
              ].map((layer, i) => (
                <div key={i} className="group p-6 rounded-2xl border border-slate-200 hover:border-accent-500 hover:shadow-xl hover:shadow-accent-500/10 transition-all duration-300 bg-white text-center flex flex-col items-center transform hover:-translate-y-1">
                  <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-primary-900 mb-5 group-hover:bg-primary-900 group-hover:text-accent-500 transition-colors duration-300 shadow-sm border border-slate-100 group-hover:border-transparent">
                    <layer.icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-primary-900 mb-2">{layer.title}</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">{layer.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Key Capabilities */}
        <section className="px-6 py-20 bg-primary-900 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-5 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent bg-[length:20px_20px]"></div>

          <div className="max-w-6xl mx-auto relative z-10">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-3">Core Capabilities</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { title: "Ask TriNetra AI", icon: MessageSquare, desc: "Ask queries in natural language and get conversational summaries back with direct SQL and reasoning traces." },
                { title: "Case Explorer", icon: FolderSearch, desc: "Search and navigate detailed case registries, history, arrest logs, and court details." },
                { title: "Criminal Network Analysis", icon: Network, desc: "Traverse multi-hop relationships between co-accused, financial accounts, and transaction layers." },
                { title: "Crime Analytics Maps", icon: Map, desc: "Visualize spatial density hotspots on Leaflet maps and review category-wise Recharts trend charts." },
                { title: "Offender Risk Scoring", icon: UserCheck, desc: "Assess recidivism risk and explain contributing weights in plain language (Explainable AI)." },
                { title: "Prevention Alerts", icon: Bell, desc: "Dynamic early warning alerts computed automatically for the logged-in officer's jurisdiction." }
              ].map((feature, i) => (
                <div key={i} className="p-6 bg-primary-800/50 backdrop-blur-sm rounded-2xl border border-primary-700/50 hover:border-accent-500/50 hover:bg-primary-800 transition-all duration-300 group">
                  <feature.icon className="w-6 h-6 text-accent-500 mb-4 group-hover:scale-110 transition-transform duration-300" />
                  <h3 className="text-base font-bold mb-2 text-white">{feature.title}</h3>
                  <p className="text-primary-200 text-sm leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Modern Footer */}
      <footer className="bg-slate-950 text-slate-300 pt-16 pb-8 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-12">

            {/* Brand Section */}
            <div className="md:col-span-4">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-md overflow-hidden bg-white flex items-center justify-center p-0.5 text-sm">
                  <img src="/logo.png" alt="TriNetra Logo" className="w-full h-full object-contain" />
                </div>
                <span className="font-bold text-lg tracking-tight text-white">
                  TRINETRA
                </span>
              </div>
              <p className="text-sm leading-relaxed text-slate-400 mb-6 pr-4">
                Empowering law enforcement with conversational AI, predictive analytics, and deep relational intelligence to ensure safer communities.
              </p>
            </div>

            {/* Quick Links */}
            <div className="md:col-span-2 md:col-start-6">
              <h4 className="text-white font-semibold mb-5 uppercase tracking-wider text-xs">Platform</h4>
              <ul className="space-y-3 text-sm">
                <li><Link to="/login" className="hover:text-accent-500 transition-colors">Ask TriNetra AI</Link></li>
                <li><Link to="/login" className="hover:text-accent-500 transition-colors">Network Analysis</Link></li>
                <li><Link to="/login" className="hover:text-accent-500 transition-colors">Crime Analytics</Link></li>
                <li><Link to="/login" className="hover:text-accent-500 transition-colors">Prevention Alerts</Link></li>
              </ul>
            </div>

            {/* Developer Team Section */}
            <div className="md:col-span-5">
              <h4 className="text-white font-semibold mb-5 uppercase tracking-wider text-xs">Development Team</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* Dev 1 */}
                <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
                  <h5 className="text-white font-bold text-sm mb-1">Yashvanth M U</h5>
                  <p className="text-xs text-accent-500 font-medium mb-1">Software Engineer</p>
                  <p className="text-xs text-slate-500 mb-4">RV College of Engineering</p>
                  <div className="flex gap-2">
                    <a href="https://github.com" target="_blank" rel="noreferrer" className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center hover:bg-accent-500 hover:text-primary-900 transition-all text-slate-400">
                      <Code size={14} />
                    </a>
                    <a href="https://linkedin.com" target="_blank" rel="noreferrer" className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center hover:bg-accent-500 hover:text-primary-900 transition-all text-slate-400">
                      <Briefcase size={14} />
                    </a>
                    <a href="https://portfolio.com" target="_blank" rel="noreferrer" className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center hover:bg-accent-500 hover:text-primary-900 transition-all text-slate-400">
                      <Globe size={14} />
                    </a>
                  </div>
                </div>

                {/* Dev 2 */}
                <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
                  <h5 className="text-white font-bold text-sm mb-1">Swamy B S</h5>
                  <p className="text-xs text-accent-500 font-medium mb-1">Software Engineer</p>
                  <p className="text-xs text-slate-500 mb-4">RV College of Engineering</p>
                  <div className="flex gap-2">
                    <a href="https://github.com" target="_blank" rel="noreferrer" className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center hover:bg-accent-500 hover:text-primary-900 transition-all text-slate-400">
                      <Code size={14} />
                    </a>
                    <a href="https://linkedin.com" target="_blank" rel="noreferrer" className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center hover:bg-accent-500 hover:text-primary-900 transition-all text-slate-400">
                      <Briefcase size={14} />
                    </a>
                    <a href="https://portfolio.com" target="_blank" rel="noreferrer" className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center hover:bg-accent-500 hover:text-primary-900 transition-all text-slate-400">
                      <Globe size={14} />
                    </a>
                  </div>
                </div>

              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <p>© {new Date().getFullYear()} TriNetra Intelligence Core. All rights reserved.</p>
            <div className="flex gap-6">
              <span className="hover:text-slate-300 cursor-pointer transition-colors">Privacy Policy</span>
              <span className="hover:text-slate-300 cursor-pointer transition-colors">Terms of Service</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}