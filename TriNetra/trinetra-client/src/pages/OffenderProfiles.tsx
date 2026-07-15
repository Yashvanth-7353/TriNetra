import React, { useState } from 'react';
import { ShieldAlert, Info, User, Search, ChevronDown, ChevronUp, Loader2, AlertCircle } from 'lucide-react';
import { fetchRiskProfile, type ChatResponse, type RiskProfileData } from '../services/api';
import { cn } from '../lib/utils';

interface OffenderResult {
  accusedId: number;
  score: number;
  repeat_offender: boolean;
  factors: string[];
  computed_date: string;
  answer: string;
  reasoning: any[];
}

export default function OffenderProfiles() {
  const [searchId, setSearchId] = useState('');
  const [results, setResults] = useState<OffenderResult[]>([]);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (idStr: string) => {
    const id = parseInt(idStr);
    if (isNaN(id) || id <= 0) {
      setError('Please enter a valid numeric Accused ID.');
      return;
    }

    // Check if already fetched
    if (results.find(r => r.accusedId === id)) {
      setExpandedRow(id);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result: ChatResponse = await fetchRiskProfile(id);

      if (result.analytics_data && result.analytics_data.type === 'risk') {
        const riskData = result.analytics_data.data as RiskProfileData;
        let factors: string[] = [];
        try {
          factors = typeof riskData.factors === 'string' ? JSON.parse(riskData.factors) : (riskData.factors || []);
        } catch {
          factors = riskData.factors ? [String(riskData.factors)] : [];
        }

        const newResult: OffenderResult = {
          accusedId: id,
          score: riskData.score,
          repeat_offender: riskData.repeat_offender,
          factors,
          computed_date: riskData.computed_date,
          answer: result.answer,
          reasoning: result.reasoning_trace?.execution_steps || [],
        };

        setResults(prev => [newResult, ...prev].sort((a, b) => b.score - a.score));
        setExpandedRow(id);
      } else {
        // No analytics_data, but the backend still returned an answer
        setError(result.answer || `No risk profile found for Accused ${id}.`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch risk profile.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary-900">Offender Profiles</h1>
          <p className="text-slate-500 text-sm mt-1">Live risk scoring from the TriNetra analytics engine. Explainable AI.</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6 max-w-xl">
        <form onSubmit={(e) => { e.preventDefault(); handleSearch(searchId); }} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              placeholder="Enter Accused ID (e.g. 80, 104, 245)..."
              className="w-full h-11 pl-9 pr-4 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400"
              disabled={isLoading}
            />
          </div>
          <button 
            type="submit"
            disabled={isLoading || !searchId.trim()}
            className="bg-primary-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-primary-800 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Fetch Profile
          </button>
        </form>
        
        {/* Quick lookup buttons */}
        <div className="mt-3 flex gap-2 flex-wrap">
          <span className="text-xs text-slate-400 leading-7">Quick lookup:</span>
          {[80, 104, 245, 300, 50].map(id => (
            <button 
              key={id}
              onClick={() => { setSearchId(String(id)); handleSearch(String(id)); }}
              className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors font-medium"
            >
              ID {id}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Results Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {results.length === 0 && !isLoading ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mx-auto mb-4">
              <User className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">No profiles loaded</h3>
            <p className="text-slate-500 text-sm max-w-sm mx-auto">Search for an Accused ID above to fetch their live risk profile from the database.</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Profile</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Risk Score</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Repeat Offender</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Computed</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {results.map((offender) => (
                <React.Fragment key={offender.accusedId}>
                  <tr className="hover:bg-slate-50 cursor-pointer" onClick={() => setExpandedRow(expandedRow === offender.accusedId ? null : offender.accusedId)}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
                          <User className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-semibold text-primary-900 flex items-center gap-2">
                            Accused {offender.accusedId}
                            {offender.repeat_offender && <ShieldAlert className="w-4 h-4 text-red-500" />}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "text-sm font-bold",
                          offender.score >= 80 ? 'text-red-600' : offender.score >= 50 ? 'text-amber-600' : 'text-emerald-600'
                        )}>
                          {offender.score}/100
                        </div>
                        <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={cn(
                            "h-full rounded-full",
                            offender.score >= 80 ? 'bg-red-500' : offender.score >= 50 ? 'bg-amber-500' : 'bg-emerald-500'
                          )} style={{ width: `${offender.score}%` }}></div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-medium",
                        offender.repeat_offender ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600"
                      )}>
                        {offender.repeat_offender ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">{offender.computed_date}</td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-slate-400 hover:text-primary-900">
                        {expandedRow === offender.accusedId ? <ChevronUp className="w-5 h-5 inline" /> : <ChevronDown className="w-5 h-5 inline" />}
                      </button>
                    </td>
                  </tr>
                  {expandedRow === offender.accusedId && (
                    <tr className="bg-slate-50">
                      <td colSpan={5} className="px-6 py-4">
                        <div className="space-y-4">
                          {/* AI Answer */}
                          <div className="p-4 bg-primary-50 border border-primary-200 rounded-lg text-sm text-primary-900">
                            <strong>TriNetra Analysis: </strong>{offender.answer}
                          </div>

                          {/* Risk Factors */}
                          <div className="p-4 bg-white border border-slate-200 rounded-lg">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-3">
                              <Info className="w-4 h-4 text-accent-500" />
                              Risk Score Explanation (Contributing Factors)
                            </h4>
                            {offender.factors.length > 0 ? (
                              <ul className="space-y-2">
                                {offender.factors.map((reason, i) => (
                                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                                    <span className="w-1.5 h-1.5 rounded-full bg-accent-500 mt-1.5 shrink-0"></span>
                                    {reason}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-slate-400">No detailed factors available for this profile.</p>
                            )}
                          </div>

                          {/* Reasoning Trace */}
                          {offender.reasoning.length > 0 && (
                            <details className="text-xs text-slate-500">
                              <summary className="cursor-pointer font-semibold">Execution Trace</summary>
                              <div className="mt-2 space-y-1">
                                {offender.reasoning.map((step, i) => (
                                  <div key={i}><strong>{step.action}:</strong> {step.detail}</div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}

        {isLoading && (
          <div className="p-8 flex items-center justify-center gap-3 text-slate-500 border-t border-slate-100">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-medium">Querying OffenderRiskScore table...</span>
          </div>
        )}
      </div>
    </div>
  );
}
