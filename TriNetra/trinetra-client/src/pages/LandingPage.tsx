import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, Brain, Network, Map, UserCheck, Bell, ChevronRight, Lock } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-accent-200 selection:text-primary-900">
      {/* Header/Nav */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-slate-100 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-900 rounded-full flex items-center justify-center text-accent-500 font-bold">
              TN
            </div>
            <span className="font-bold text-xl tracking-tight text-primary-900">TRINETRA</span>
          </div>
          <div>
            <Link to="/login" className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-md font-medium text-white bg-primary-900 hover:bg-primary-800 transition-colors shadow-sm">
              <Lock className="w-4 h-4" />
              Log In to Portal
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-20">
        {/* Hero Section */}
        <section className="relative px-6 pt-24 pb-32 overflow-hidden flex flex-col items-center text-center">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-50 via-white to-white -z-10"></div>
          
          <div className="w-32 h-32 mb-8 rounded-full border-4 border-accent-500 shadow-xl overflow-hidden bg-white p-2">
             <img src="/logo.png" alt="TriNetra Logo" className="w-full h-full object-contain" />
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-primary-900 tracking-tight max-w-4xl mb-6">
            Data. Intelligence. Action.
          </h1>
          <p className="text-xl md:text-2xl text-slate-600 max-w-3xl mb-10 leading-relaxed">
            The next-generation conversational AI and crime analytics platform built for modern law enforcement.
          </p>
          
          <Link to="/login" className="inline-flex items-center gap-2 px-8 py-4 rounded-lg font-semibold text-lg text-primary-900 bg-accent-500 hover:bg-accent-400 transition-colors shadow-lg shadow-accent-500/20">
            Access the Intelligence Core
            <ChevronRight className="w-5 h-5" />
          </Link>
        </section>

        {/* The Challenge Section */}
        <section className="px-6 py-24 bg-slate-50 border-y border-slate-100">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
              <div className="h-px bg-accent-500 flex-1"></div>
              <h2 className="text-3xl font-bold text-primary-900 uppercase tracking-widest text-center">The Challenge</h2>
              <div className="h-px bg-accent-500 flex-1"></div>
            </div>
            
            <div className="prose prose-lg max-w-none text-slate-700 space-y-6 bg-white p-8 md:p-12 rounded-2xl shadow-sm border border-slate-200">
              <p className="font-medium text-xl leading-relaxed text-primary-900">
                Design and develop an Intelligent Conversational AI and Crime Analytics Platform that enables investigators, analysts, and policymakers to interact with the state crime database using natural language queries, while also providing advanced analytical capabilities grounded in criminology and sociological insights.
              </p>
              <p className="leading-relaxed">
                The proposed solution should enable users to discover hidden relationships between crimes, offenders, victims, locations, and socio-economic patterns, support investigative decision making, and provide predictive and preventive insights to strengthen proactive law enforcement.
              </p>
              <p className="leading-relaxed">
                The platform should go beyond simple data retrieval and enable:
              </p>
              <ul className="list-none space-y-3 pl-4">
                {[
                  'Crime pattern discovery',
                  'Criminal network analysis',
                  'Socio-demographic crime insights',
                  'Behavioral and criminological profiling',
                  'Proactive crime prevention intelligence'
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-500 shrink-0"></span>
                    <span className="font-medium">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Our Solution (Four-Layer Approach) */}
        <section className="px-6 py-24">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-primary-900 mb-12 text-center">Architecture of Intelligence</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                { title: "Conversational Layer", desc: "Natural language interface for instant, secure access to complex database queries.", icon: MessageSquare },
                { title: "Intelligence Layer", desc: "Multi-engine reasoning using NL2SQL, RAG, and Graph analytics.", icon: Brain },
                { title: "Data Layer", desc: "High-performance vector and relational storage handling million-row datasets.", icon: Database },
                { title: "Governance Layer", desc: "Strict role-based access controls and immutable audit logging.", icon: Shield }
              ].map((layer, i) => (
                <div key={i} className="group p-6 rounded-2xl border border-slate-200 hover:border-accent-500 hover:shadow-lg hover:shadow-accent-500/5 transition-all bg-white text-center flex flex-col items-center">
                  <div className="w-14 h-14 bg-primary-50 rounded-xl flex items-center justify-center text-primary-900 mb-6 group-hover:bg-primary-900 group-hover:text-accent-500 transition-colors">
                    {/* Placeholder for Icon */}
                    <div className="w-6 h-6 border-2 border-current rounded-sm"></div>
                  </div>
                  <h3 className="text-lg font-bold text-primary-900 mb-3">{layer.title}</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">{layer.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Key Capabilities */}
        <section className="px-6 py-24 bg-primary-900 text-white">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold mb-16 text-center">Core Capabilities</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                { title: "Pattern Discovery", icon: Brain, desc: "Identify emerging crime patterns across time, geography, and modus operandi." },
                { title: "Network Analysis", icon: Network, desc: "Visualize hidden connections between accused, victims, and financial transactions." },
                { title: "Socio-Demographics", icon: Map, desc: "Correlate crime with urbanization, economic stress, and demographic shifts." },
                { title: "Offender Profiling", icon: UserCheck, desc: "Behavioral analysis and risk scoring for repeat offenders." },
                { title: "Prevention Alerts", icon: Bell, desc: "AI-driven early warning systems for organized crime and hot-spots." },
                { title: "Explainable AI", icon: Shield, desc: "Transparent reasoning traces and verifiable citations for every answer." }
              ].map((feature, i) => (
                <div key={i} className="p-6 bg-primary-800 rounded-2xl border border-primary-700">
                  <feature.icon className="w-8 h-8 text-accent-500 mb-4" />
                  <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                  <p className="text-primary-200 text-sm leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* The Team */}
        <section className="px-6 py-24">
          <div className="max-w-5xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-primary-900 mb-12">Built By</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {/* Placeholders */}
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex flex-col items-center">
                  <div className="w-24 h-24 bg-slate-200 rounded-full mb-4"></div>
                  <h4 className="font-bold text-primary-900">Team Member {i}</h4>
                  <p className="text-sm text-slate-500">Role</p>
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>

      {/* Footer CTA */}
      <footer className="px-6 py-16 bg-slate-50 border-t border-slate-200 text-center">
        <h2 className="text-2xl font-bold text-primary-900 mb-6">Ready to deploy TriNetra?</h2>
        <Link to="/login" className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-lg font-bold text-white bg-primary-900 hover:bg-primary-800 transition-colors shadow-lg">
          <Lock className="w-5 h-5" />
          Log In to Portal
        </Link>
      </footer>
    </div>
  );
}

// Temporary icon placeholders for missing lucide-react imports above
function MessageSquare(props: any) { return <svg {...props}><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"/></svg>; }
function Database(props: any) { return <svg {...props}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>; }
