import React, { useState } from 'react';
import { Search, Info, Users, Maximize, AlertCircle, Network, Loader2 } from 'lucide-react';
import { fetchNetworkForAccused, type ChatResponse, type GraphData } from '../services/api';
import NetworkGraph from '../components/NetworkGraph';

export default function NetworkAnalysis() {
  const [searchQuery, setSearchQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showCommunities, setShowCommunities] = useState(false);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [errorText, setErrorText] = useState('');
  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const [reasoning, setReasoning] = useState<any[]>([]);

  const handleSearch = async (query: string) => {
    if (!query.trim()) return;
    setIsLoading(true);
    setErrorText('');
    setHasSearched(true);
    setGraphData(null);
    setSelectedNode(null);

    try {
      const result: ChatResponse = await fetchNetworkForAccused(query);
      setAnswerText(result.answer);
      setReasoning(result.reasoning_trace?.execution_steps || []);

      if (result.graph_data && result.graph_data.nodes.length > 0) {
        setGraphData(result.graph_data);
      } else {
        setErrorText(result.answer || 'No network data found for this entity.');
      }
    } catch (err: any) {
      setErrorText(err.message || 'Failed to reach TriNetra backend.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full bg-slate-50 relative overflow-hidden">
      
      <div className="flex-1 flex flex-col p-6 h-full">
        <div className="flex justify-between items-center mb-6 shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-primary-900">Network Analysis</h1>
            <p className="text-slate-500 text-sm mt-1">Discover hidden relationships and financial trails via the live graph engine.</p>
          </div>
          
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
              <input 
                type="checkbox" 
                checked={showCommunities}
                onChange={(e) => setShowCommunities(e.target.checked)}
                className="rounded border-slate-300 text-accent-500 focus:ring-accent-500" 
              />
              Highlight Communities
            </label>
            <button className="p-2 border border-slate-200 rounded-lg hover:bg-white text-slate-500 transition-colors">
              <Maximize className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-6 shrink-0 max-w-2xl">
          <form onSubmit={(e) => { e.preventDefault(); handleSearch(searchQuery); }} className="relative flex items-center">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter Accused ID (e.g. 80, 104) or describe a network query..." 
              className="w-full h-12 pl-10 pr-24 rounded-xl border border-slate-200 shadow-sm focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 text-sm bg-white"
              disabled={isLoading}
            />
            <button 
              type="submit" 
              disabled={isLoading || !searchQuery.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary-900 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-primary-800 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Analyze
            </button>
          </form>
        </div>

        {/* Answer Strip */}
        {answerText && !isLoading && (
          <div className="mb-4 bg-white border border-slate-200 rounded-lg p-3 text-sm text-slate-700 shadow-sm shrink-0">
            <span className="font-semibold text-primary-900">TriNetra: </span>
            {answerText}
          </div>
        )}

        {/* Canvas Area */}
        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden relative">
          {isLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/80 z-10">
              <Loader2 className="w-10 h-10 text-primary-900 animate-spin mb-4" />
              <p className="text-slate-600 font-medium">Building network graph...</p>
              <p className="text-sm text-slate-400 mt-1">Executing 2-hop traversal via NetworkX engine</p>
            </div>
          ) : !hasSearched ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-slate-50/50">
              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-primary-300 mb-6 shadow-sm border border-slate-100">
                <Network className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">Map the Criminal Ecosystem</h2>
              <p className="text-slate-500 max-w-md text-center mb-8">
                Enter an Accused ID to dynamically build their network of co-accused and shared financial accounts from the live database.
              </p>
              <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Quick Searches</div>
                <div className="space-y-2">
                  {['80', '104', '245'].map((id) => (
                    <button 
                      key={id}
                      onClick={() => { setSearchQuery(id); handleSearch(id); }}
                      className="w-full text-left px-3 py-2 rounded border border-slate-100 hover:border-accent-500 hover:bg-accent-50/50 text-sm font-medium text-slate-700 transition-colors"
                    >
                      Accused ID: {id}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : graphData && graphData.nodes.length > 0 ? (
            <div className="w-full h-full">
              <NetworkGraph data={graphData} />
              
              {/* Legend */}
              <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur border border-slate-200 rounded-lg p-3 shadow-sm flex flex-col gap-2 text-xs font-medium text-slate-600">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#0a1f44]"></div> Accused (Co-accused link)</div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#c9a227]"></div> Financial link</div>
                <div className="text-slate-400 mt-1">Nodes: {graphData.nodes.length} | Edges: {graphData.edges.length}</div>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
              <AlertCircle className="w-10 h-10 text-slate-300 mb-3" />
              <p className="text-slate-600 font-medium">{errorText || 'No network data found.'}</p>
              <p className="text-sm text-slate-400 mt-1">Try a different Accused ID.</p>
            </div>
          )}
        </div>

        {/* Reasoning Trace */}
        {reasoning.length > 0 && !isLoading && (
          <div className="mt-4 bg-white border border-slate-200 rounded-lg p-3 shadow-sm shrink-0">
            <details>
              <summary className="text-xs font-semibold text-slate-500 cursor-pointer">Execution Trace ({reasoning.length} steps)</summary>
              <div className="mt-2 space-y-1">
                {reasoning.map((step, i) => (
                  <div key={i} className="text-xs text-slate-600 flex gap-2">
                    <span className="font-mono text-slate-400">{String(step.step || i+1).padStart(2,'0')}</span>
                    <span><strong>{step.action}:</strong> {step.detail}</span>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}
      </div>
      
    </div>
  );
}
