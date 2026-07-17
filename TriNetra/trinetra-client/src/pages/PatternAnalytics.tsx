import React, { useState, useEffect } from 'react';
import { Layers, Search, Calendar, ShieldAlert, ChevronRight, Activity, MapPin, Hash, CheckCircle2 } from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { fetchEmergingPatterns, fetchSimilarCases } from '../services/api';
import type { Pattern, SimilarCase } from '../services/api';
import { cn } from '../lib/utils';
import { Link } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';

const KARNATAKA_CENTER: [number, number] = [15.3173, 75.7139];

export default function PatternAnalytics() {
  const [activeTab, setActiveTab] = useState<'feed' | 'similarity'>('feed');
  
  // Tab 1 State
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(null);
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);
  
  // Tab 2 State
  const [targetCaseId, setTargetCaseId] = useState('');
  const [similarCases, setSimilarCases] = useState<SimilarCase[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  useEffect(() => {
    if (activeTab === 'feed' && patterns.length === 0) {
      loadPatterns();
    }
  }, [activeTab]);

  const loadPatterns = async () => {
    setIsLoadingFeed(true);
    try {
      const res = await fetchEmergingPatterns();
      if (res.patterns) {
        setPatterns(res.patterns);
        if (res.patterns.length > 0) setSelectedPattern(res.patterns[0]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingFeed(false);
    }
  };

  const handleSearchSimilar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCaseId) return;
    
    setIsSearching(true);
    try {
      const res = await fetchSimilarCases(parseInt(targetCaseId));
      if (res.similar_cases) {
        setSimilarCases(res.similar_cases);
      } else {
        setSimilarCases([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0 flex items-center justify-between z-10 shadow-sm relative">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Layers className="w-5 h-5 text-indigo-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Pattern Analytics</h1>
            <p className="text-sm text-slate-500">Discover hidden clusters and deep-search connected crimes.</p>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            onClick={() => setActiveTab('feed')}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-semibold transition-all duration-200 flex items-center gap-2",
              activeTab === 'feed' ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            )}
          >
            <Activity className="w-4 h-4" />
            Emerging Patterns
          </button>
          <button
            onClick={() => setActiveTab('similarity')}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-semibold transition-all duration-200 flex items-center gap-2",
              activeTab === 'similarity' ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            )}
          >
            <Search className="w-4 h-4" />
            Find Similar Cases
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'feed' && (
          <div className="h-full flex">
            {/* Left Feed List */}
            <div className="w-96 bg-white border-r border-slate-200 flex flex-col shrink-0 z-10 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] relative">
              <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Automated Clusters</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {isLoadingFeed ? (
                  Array.from({length: 4}).map((_, i) => (
                    <div key={i} className="h-32 bg-slate-100 rounded-xl animate-pulse" />
                  ))
                ) : patterns.length === 0 ? (
                  <div className="text-center py-10 text-slate-500 text-sm">No patterns detected.</div>
                ) : (
                  patterns.map(p => (
                    <div 
                      key={p.cluster_id}
                      onClick={() => setSelectedPattern(p)}
                      className={cn(
                        "p-4 rounded-xl border transition-all duration-200 cursor-pointer group",
                        selectedPattern?.cluster_id === p.cluster_id 
                          ? "bg-indigo-50 border-indigo-200 shadow-sm ring-1 ring-indigo-500/10" 
                          : "bg-white border-slate-200 hover:border-indigo-300 hover:shadow-md"
                      )}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-slate-800 group-hover:text-indigo-700 transition-colors">{p.theme}</h3>
                        <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1">
                          <ShieldAlert className="w-3 h-3" />
                          {p.case_count} Cases
                        </span>
                      </div>
                      
                      <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                        {p.trigger_reason}
                      </p>
                      
                      {/* Sparkline */}
                      <div className="h-8 w-full mt-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={p.sparkline}>
                            <defs>
                              <linearGradient id={`color-${p.cluster_id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <Area type="monotone" dataKey="count" stroke="#4f46e5" strokeWidth={1.5} fillOpacity={1} fill={`url(#color-${p.cluster_id})`} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right Detail View */}
            <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden relative">
              {selectedPattern ? (
                <>
                  {/* Top Map Section */}
                  <div className="h-2/5 border-b border-slate-200 relative bg-slate-200">
                    <MapContainer center={KARNATAKA_CENTER} zoom={6} className="w-full h-full absolute inset-0 z-0">
                      <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                      {selectedPattern.cases.map(c => c.lat && c.lng && (
                        <CircleMarker 
                          key={c.case_id}
                          center={[c.lat, c.lng]}
                          radius={6}
                          pathOptions={{ color: '#e11d48', fillColor: '#f43f5e', fillOpacity: 0.7, weight: 2 }}
                        >
                          <Popup>
                            <div className="font-semibold">{c.crime_no}</div>
                            <div className="text-xs text-slate-500">{c.date}</div>
                          </Popup>
                        </CircleMarker>
                      ))}
                    </MapContainer>
                    {/* Floating Info Box on Map */}
                    <div className="absolute top-4 left-4 z-[400] bg-white/90 backdrop-blur px-4 py-3 rounded-xl border border-slate-200 shadow-lg max-w-sm pointer-events-none">
                      <h3 className="font-bold text-slate-800 mb-1">{selectedPattern.theme} Signature</h3>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {selectedPattern.mo_tags.map(tag => (
                          <span key={tag.name} className="px-2 py-1 bg-slate-800 text-slate-100 text-xs rounded-md font-medium">
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Cases List Section */}
                  <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50">
                    <div className="flex items-center gap-2 mb-4">
                      <Calendar className="w-5 h-5 text-slate-400" />
                      <h3 className="font-bold text-slate-700 text-lg">Timeline & Cases</h3>
                    </div>
                    
                    <div className="space-y-4">
                      {selectedPattern.cases.map(c => (
                        <div key={c.case_id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4 group hover:border-indigo-300 transition-colors">
                          <div className="w-16 h-16 bg-slate-50 rounded-lg flex flex-col items-center justify-center shrink-0 border border-slate-100">
                            <span className="text-xs font-bold text-slate-500 uppercase">{new Date(c.date).toLocaleString('default', { month: 'short' })}</span>
                            <span className="text-xl font-black text-slate-800">{new Date(c.date).getDate()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-indigo-700">{c.crime_no}</span>
                              <span className="text-xs text-slate-400 flex items-center gap-1"><MapPin className="w-3 h-3"/> Dist #{c.district}</span>
                            </div>
                            <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
                              {c.brief_facts}
                            </p>
                          </div>
                          <Link to={`/cases?search=${encodeURIComponent(c.crime_no)}`} className="mt-2 text-indigo-600 hover:text-indigo-800 p-2 rounded-full hover:bg-indigo-50 transition-colors shrink-0">
                            <ChevronRight className="w-5 h-5" />
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400">
                  Select a pattern to view details
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================= TAB 2: FIND SIMILAR CASES ======================= */}
        {activeTab === 'similarity' && (
          <div className="h-full overflow-y-auto p-6 bg-slate-50/50 custom-scrollbar relative">
            <div className="max-w-4xl mx-auto">
              
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4 rotate-3">
                  <Search className="w-8 h-8 text-indigo-600" />
                </div>
                <h2 className="text-3xl font-black text-slate-900 mb-3">Case Similarity Engine</h2>
                <p className="text-slate-500 max-w-xl mx-auto">
                  Powered by <span className="font-semibold text-slate-700">pgvector cosine similarity</span> and multidimensional clustering. Enter a Case ID to discover hidden connections across the state.
                </p>
              </div>

              <form onSubmit={handleSearchSimilar} className="flex gap-3 mb-10 max-w-2xl mx-auto">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Hash className="w-5 h-5 text-slate-400" />
                  </div>
                  <input
                    type="number"
                    value={targetCaseId}
                    onChange={(e) => setTargetCaseId(e.target.value)}
                    placeholder="Enter CaseMasterID (e.g., 1001)"
                    className="w-full pl-11 pr-4 py-4 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm text-lg"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSearching}
                  className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md shadow-indigo-200 transition-all active:scale-95 disabled:opacity-70 disabled:active:scale-100 flex items-center gap-2"
                >
                  {isSearching ? 'Scanning...' : 'Analyze'}
                </button>
              </form>

              {/* Results */}
              <div className="space-y-4 max-w-3xl mx-auto pb-10">
                {isSearching && (
                  Array.from({length: 3}).map((_, i) => (
                    <div key={i} className="h-32 bg-white rounded-xl border border-slate-100 shadow-sm animate-pulse" />
                  ))
                )}
                
                {!isSearching && similarCases.length > 0 && (
                  <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-2">
                    <h3 className="font-bold text-slate-700">Top Matches ({similarCases.length})</h3>
                    <span className="text-xs text-slate-400">Sorted by Composite Score</span>
                  </div>
                )}
                
                {!isSearching && similarCases.map(sc => (
                  <div key={sc.case_id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4">
                      <div className="flex flex-col items-center">
                        <span className={cn(
                          "text-2xl font-black",
                          sc.match_score >= 80 ? "text-rose-600" : 
                          sc.match_score >= 50 ? "text-amber-500" : "text-emerald-500"
                        )}>
                          {sc.match_score}%
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Match Score</span>
                      </div>
                    </div>

                    <div className="pr-24">
                      <div className="flex items-center gap-2 mb-2">
                        <Link to={`/cases?search=${encodeURIComponent(sc.crime_no)}`} className="font-bold text-indigo-700 hover:underline text-lg">
                          {sc.crime_no}
                        </Link>
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">ID: {sc.case_id}</span>
                      </div>
                      
                      <p className="text-sm text-slate-600 line-clamp-2 mb-4 leading-relaxed">
                        {sc.brief_facts}
                      </p>
                      
                      {/* Explainability Signals */}
                      <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Match Signals Detected</div>
                        <div className="flex flex-wrap gap-2">
                          {sc.explanations.map((exp, idx) => (
                            <div key={idx} className="flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1 rounded-md shadow-sm text-xs text-slate-700 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              {exp}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
