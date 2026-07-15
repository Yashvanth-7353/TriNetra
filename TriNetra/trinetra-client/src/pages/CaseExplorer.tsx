import React, { useState } from 'react';
import { Filter, Search, Eye, FileText, Calendar, MapPin, X, Loader2, AlertCircle } from 'lucide-react';
import { sendChatQuery, type ChatResponse } from '../services/api';

export default function CaseExplorer() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cases, setCases] = useState<any[]>([]);
  const [answerText, setAnswerText] = useState('');
  const [citations, setCitations] = useState<string[]>([]);
  const [selectedCase, setSelectedCase] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  // Filters
  const [district, setDistrict] = useState('');
  const [status, setStatus] = useState('');

  const handleSearch = async (query?: string) => {
    const q = query || searchQuery;
    if (!q.trim()) return;

    setIsLoading(true);
    setError('');
    setHasSearched(true);
    setCases([]);
    setSelectedCase(null);

    try {
      const result: ChatResponse = await sendChatQuery(q);
      setAnswerText(result.answer);
      setCitations(result.citations || []);

      // The factual_lookup engine won't return structured rows in the response directly,
      // but citations give us FIR numbers. Display the answer from the AI.
    } catch (err: any) {
      setError(err.message || 'Failed to query cases.');
    } finally {
      setIsLoading(false);
    }
  };

  const buildQuery = () => {
    let q = 'List cases';
    if (district) q += ` in ${district}`;
    if (status) q += ` with status ${status}`;
    if (searchQuery.trim()) q = searchQuery;
    return q;
  };

  return (
    <div className="flex h-full bg-slate-50 relative overflow-hidden">
      
      <div className="flex-1 flex flex-col p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-primary-900">Case Explorer</h1>
            <p className="text-slate-500 text-sm mt-1">Query the FIR database using natural language via the NL2SQL engine.</p>
          </div>
        </div>

        {/* Search / Query Bar */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 space-y-4">
          <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='Ask about cases (e.g. "List all fraud cases in Mysuru", "How many cases are under investigation?")' 
                className="w-full h-11 pl-9 pr-4 rounded-lg border border-slate-200 focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 text-sm"
                disabled={isLoading}
              />
            </div>
            <button 
              type="submit"
              disabled={isLoading || !searchQuery.trim()}
              className="bg-primary-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-primary-800 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Query
            </button>
          </form>

          {/* Quick filter buttons */}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-slate-400 leading-7">Quick queries:</span>
            {[
              "List all cases in Mysuru",
              "How many cases are charge sheeted?",
              "Show recent cases under investigation",
              "Count cases by district",
            ].map((q, i) => (
              <button 
                key={i}
                onClick={() => { setSearchQuery(q); handleSearch(q); }}
                className="px-3 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors font-medium"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Results Area */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 overflow-hidden flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <Loader2 className="w-10 h-10 text-primary-900 animate-spin mb-4" />
              <p className="text-slate-600 font-medium">Generating SQL and querying database...</p>
              <p className="text-sm text-slate-400 mt-1">NL2SQL engine with RBAC enforcement</p>
            </div>
          ) : !hasSearched ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-4">
                <Search className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Search the Case Database</h3>
              <p className="text-slate-500 max-w-sm mb-4">Type a natural language question above. TriNetra will convert it to SQL, apply your role-based security filters, and return results.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-6">
              {/* AI Answer */}
              <div className="mb-6 bg-primary-50 border border-primary-200 rounded-xl p-5">
                <div className="text-xs font-bold text-accent-600 uppercase tracking-wider mb-2">TriNetra Response (NL2SQL)</div>
                <div className="text-slate-800 leading-relaxed whitespace-pre-wrap">{answerText}</div>
              </div>

              {/* Citations */}
              {citations.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Referenced Cases</h4>
                  <div className="flex flex-wrap gap-2">
                    {citations.map((cite, i) => (
                      <button 
                        key={i}
                        className="px-3 py-1.5 bg-white border border-slate-200 hover:border-accent-500 rounded-lg text-sm font-medium text-primary-900 transition-colors shadow-sm"
                      >
                        <FileText className="w-3.5 h-3.5 inline mr-1.5" />
                        FIR #{cite}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty Results */}
              {!answerText && (
                <div className="text-center py-8">
                  <p className="text-slate-500">No results returned. Try rephrasing your query.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
