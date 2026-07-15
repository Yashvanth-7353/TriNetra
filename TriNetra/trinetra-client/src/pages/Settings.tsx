import React, { useState } from 'react';
import { User, Shield, Globe, Database, Activity } from 'lucide-react';

const auditLogData = [
  { time: '2026-07-15 10:42', role: 'Investigator', question: 'Show me the network for accused 245', engine: 'Graph Analysis', rows: 12 },
  { time: '2026-07-15 10:15', role: 'Supervisor', question: 'What are this week\'s crime hotspots in Mysuru?', engine: 'Spatial Analytics', rows: 5 },
  { time: '2026-07-15 09:30', role: 'Analyst', question: 'List all fraud cases over 1 Lakh this month', engine: 'NL2SQL', rows: 45 },
];

export default function Settings() {
  const [role, setRole] = useState('supervisor'); // Default to supervisor for demo purposes to show audit log
  
  return (
    <div className="p-6 max-w-5xl mx-auto h-full overflow-y-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-primary-900">Settings & Governance</h1>
        <p className="text-slate-500 text-sm mt-1">Manage preferences and system auditing.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Left Column: Preferences */}
        <div className="space-y-6">
          <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
              <User className="w-4 h-4 text-primary-500" />
              Account Profile
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Current Role (Demo Toggle)</label>
                <select 
                  value={role} 
                  onChange={(e) => setRole(e.target.value)}
                  className="mt-1 w-full h-10 px-3 rounded-lg border border-slate-200 focus:outline-none focus:border-primary-400 text-sm bg-slate-50"
                >
                  <option value="investigator">Investigator</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="analyst">Analyst</option>
                  <option value="policymaker">Policymaker</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Department ID</label>
                <input type="text" disabled value="KSP-4921" className="mt-1 w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-slate-100 text-slate-500 cursor-not-allowed" />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
              <Globe className="w-4 h-4 text-primary-500" />
              Preferences
            </h3>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Default Language</label>
              <select className="mt-1 w-full h-10 px-3 rounded-lg border border-slate-200 focus:outline-none focus:border-primary-400 text-sm">
                <option>English</option>
                <option>Kannada (ಕನ್ನಡ)</option>
              </select>
            </div>
          </section>
        </div>

        {/* Right Column: Audit Log (Gated) */}
        <div className="md:col-span-2">
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm h-full flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Shield className="w-4 h-4 text-accent-500" />
                System Audit Log
              </h3>
              {role !== 'investigator' && (
                <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-1 rounded">Access Granted</span>
              )}
            </div>

            {role === 'investigator' ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-4">
                  <Shield className="w-8 h-8 opacity-50" />
                </div>
                <h4 className="text-lg font-bold text-slate-900 mb-2">Restricted Access</h4>
                <p className="text-slate-500 text-sm max-w-sm">
                  The system audit log is only visible to Supervisor, Analyst, and Policymaker roles for compliance and monitoring purposes.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-white border-b border-slate-200">
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Timestamp</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Role</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Query / Action</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Engine</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right">Rows</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {auditLogData.map((log, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{log.time}</td>
                        <td className="px-4 py-3 font-medium text-slate-700">{log.role}</td>
                        <td className="px-4 py-3 text-primary-900">{log.question}</td>
                        <td className="px-4 py-3">
                          <span className="bg-primary-50 text-primary-700 px-2 py-1 rounded text-xs font-medium">
                            {log.engine}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 font-mono">{log.rows}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

      </div>
    </div>
  );
}
