import React, { useState, useRef, useEffect } from 'react';
import { Send, FileDown, Mic, Square, Loader2, ChevronDown, ChevronUp, Bot, User, Globe, AlertCircle, Languages } from 'lucide-react';
import { cn } from '../lib/utils';
import { sendChatQuery, sendInvestigationQuery, isInvestigationRequest, sendEvidenceGraph, fetchNextBestActions, exportChat, transcribeAudio, translateText, type EvidenceEdge, type EvidenceNode, type NextBestActionLead } from '../services/api';
import NetworkGraph from '../components/NetworkGraph';
import EvidenceGraph from '../components/EvidenceGraph';
import EvidencePanel from '../components/EvidencePanel';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

export interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  intent_detected?: string;
  citations?: string[];
  reasoning_trace?: any;
  graph_data?: { 
    nodes: any[]; 
    edges: any[];
    root_node?: string;
  } | null;
  analytics_data?: {
    type: 'trend' | 'risk';
    data: any;
  } | null;
  investigation?: {
    plan: any;
    findings: any[];
    summary_stats: any;
    evidence_graph: any[];
  } | null;
  nextActions?: {
    leads: NextBestActionLead[];
    total_candidates: number;
    total_leads: number;
    lead_types: Record<string, number>;
    engines_used: string[];
    methodology: string;
    limitations: string[];
  } | null;
}

const examplePrompts = [
  { q: "Investigate the recent vehicle theft pattern in Bengaluru and find repeat offenders.", desc: "proves multi-engine investigation planner" },
  { q: "How many cases were registered in Bengaluru Urban in 2025?", desc: "proves tier-4 factual sql generation" },
  { q: "Are there any cases involving a fraudulent online transaction near Mysuru?", desc: "proves narrative rag" },
  { q: "Who is connected to accused 3682?", desc: "proves graph triggering & inline canvas embedding" },
  { q: "How has cyber crime changed in Bengaluru Urban over the last two years?", desc: "proves dynamic trend analysis engine" },
  { q: "Is there anything unusual happening with digital arrest scams recently?", desc: "proves early warning/pattern search" },
  { q: "Find cases similar to CaseMasterID 2817.", desc: "proves tri-signal pgvector case similarity engine" },
  { q: "What is the risk profile for accused 3682?", desc: "proves risk scoring" },
];

export default function AskTriNetra() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lang, setLang] = useState<'EN' | 'KN'>('EN');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Sarvam AI Audio STT State
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleExport = async () => {
    if (messages.length === 0) return;
    setIsExporting(true);
    try {
      const blob = await exportChat(messages);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trinetra_intelligence_report_${Date.now()}.html`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('Failed to export chat:', err);
      alert('Failed to export chat: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  // Sarvam AI Speech-to-Text Recording Handler
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        setIsTranscribing(true);
        setStatusMessage(lang === 'KN' ? 'Sarvam AI: Transcribing Kannada audio...' : 'Transcribing English audio...');
        try {
          const langCode = lang === 'KN' ? 'kn-IN' : 'en-IN';
          const res = await transcribeAudio(audioBlob, langCode);
          if (res.transcript) {
            setInputValue(res.transcript);
            setStatusMessage('Voice transcribed successfully!');
            setTimeout(() => setStatusMessage(null), 3500);
          } else {
            setStatusMessage('No speech recognized.');
            setTimeout(() => setStatusMessage(null), 3000);
          }
        } catch (err: any) {
          console.error('STT error:', err);
          alert('Speech-to-Text failed: ' + err.message);
          setStatusMessage(null);
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setStatusMessage('Recording voice... Click mic to stop.');
    } catch (err: any) {
      console.error('Microphone error:', err);
      alert('Microphone access denied or not supported by browser.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      let queryForBackend = text;
      
      // ONLY use Sarvam AI Translation when in Kannada (KN) mode
      if (lang === 'KN') {
        setStatusMessage('Sarvam AI: Translating Kannada query to English...');
        try {
          const tr = await translateText(text, 'kn-IN', 'en-IN');
          if (tr.translated_text) {
            queryForBackend = tr.translated_text;
          }
        } catch (trErr) {
          console.warn('Sarvam Translation to EN failed, passing raw query:', trErr);
        }
      }

      // Detect investigation request vs normal query
      const isInvestigation = isInvestigationRequest(text);
      
      let data: any;
      if (isInvestigation) {
        setStatusMessage('TriNetra: Running multi-engine investigation...');
        data = await sendInvestigationQuery(queryForBackend);
      } else {
        setStatusMessage('TriNetra Engine: Processing query...');
        data = await sendChatQuery(queryForBackend);
      }

      let answerText = data.answer || "I'm sorry, I couldn't process that.";

      // ONLY translate response to Kannada when in Kannada (KN) mode
      if (lang === 'KN') {
        setStatusMessage('Sarvam AI: Translating response to Kannada...');
        try {
          const trAns = await translateText(answerText, 'en-IN', 'kn-IN');
          if (trAns.translated_text) {
            answerText = trAns.translated_text;
          }
        } catch (trAnsErr) {
          console.warn('Sarvam Translation to KN failed:', trAnsErr);
        }
      }

      // Fetch next best investigative actions if investigation succeeded
      let nextActionsData: any = null;
      if (data.investigation && data.investigation.findings && data.investigation.findings.length > 0) {
        try {
          nextActionsData = await fetchNextBestActions(data);
        } catch (naErr) {
          console.warn('Next best actions generation failed:', naErr);
        }
      }

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        text: answerText,
        intent_detected: data.intent_detected,
        citations: data.citations,
        reasoning_trace: data.reasoning_trace,
        graph_data: data.graph_data,
        analytics_data: data.analytics_data,
        investigation: data.investigation || null,
        nextActions: nextActionsData ? {
          leads: nextActionsData.leads || [],
          total_candidates: nextActionsData.total_candidates || 0,
          total_leads: nextActionsData.total_leads || 0,
          lead_types: nextActionsData.lead_types || {},
          engines_used: nextActionsData.engines_used || [],
          methodology: nextActionsData.methodology || '',
          limitations: nextActionsData.limitations || [],
        } : null,
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error: any) {
      console.error('Error fetching chat response:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'bot',
          text: `Connection error: ${error.message || 'Could not reach TriNetra Core. Ensure backend is running.'}`,
          intent_detected: 'error',
        },
      ]);
    } finally {
      setIsLoading(false);
      setStatusMessage(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      
      {/* Top Bar */}
      <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="font-bold text-lg text-primary-900 flex items-center gap-2">
            <Bot className="w-5 h-5 text-accent-500" />
            Intelligence Copilot
          </h1>
          {lang === 'KN' ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Languages className="w-3 h-3 text-emerald-600" />
              Sarvam AI Active (KN)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              <Globe className="w-3 h-3 text-blue-600" />
              Direct LLM Mode (EN)
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setLang(lang === 'EN' ? 'KN' : 'EN')}
            className={cn(
              "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border transition-all shadow-sm",
              lang === 'KN' 
                ? "bg-primary-900 text-white border-primary-900 shadow-md" 
                : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
            )}
            title="Toggle between English and Kannada (Sarvam AI translation)"
          >
            <Globe className="w-3.5 h-3.5" />
            {lang === 'EN' ? 'Switch to ಕನ್ನಡ' : 'Switch to English'}
          </button>
          <button 
            onClick={handleExport}
            disabled={isExporting || messages.length === 0}
            className={cn(
              "flex items-center gap-2 text-sm font-medium border px-3 py-1.5 rounded-md transition-colors",
              messages.length === 0 
                ? "text-slate-400 bg-slate-50 border-slate-200 cursor-not-allowed" 
                : "text-primary-900 bg-primary-50 hover:bg-primary-100 border-primary-200"
            )}
          >
            {isExporting ? (
              <>
                <Bot className="w-4 h-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <FileDown className="w-4 h-4" />
                Export Report
              </>
            )}
          </button>
        </div>
      </div>

      {/* Chat Thread */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 flex justify-center">
        <div className="w-full max-w-4xl space-y-6">
          
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full max-h-[60vh]">
              <div className="w-16 h-16 bg-primary-900 rounded-2xl flex items-center justify-center text-accent-500 mb-6 shadow-lg shadow-primary-900/20">
                <Bot className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-primary-900 mb-2">How can I assist your investigation?</h2>
              <p className="text-slate-500 mb-8 max-w-md text-center">
                Ask questions about cases, search for patterns, or visualize criminal networks using natural language.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl">
                {examplePrompts.map((prompt, i) => (
                  <button 
                    key={i}
                    onClick={() => handleSendMessage(prompt.q)}
                    className="text-left p-4 rounded-xl border border-slate-200 bg-white hover:border-accent-500 hover:shadow-md transition-all group"
                  >
                    <div className="text-sm font-medium text-slate-700 group-hover:text-primary-900">{prompt.q}</div>
                    <div className="text-[10px] text-slate-400 mt-2 uppercase tracking-wide">({prompt.desc})</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={cn(
              "flex gap-4 w-full",
              msg.sender === 'user' ? "flex-row-reverse" : "flex-row"
            )}>
              {/* Avatar */}
              <div className="shrink-0 mt-1">
                {msg.sender === 'user' ? (
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600">
                    <User className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary-900 flex items-center justify-center text-accent-500 shadow-sm">
                    <Bot className="w-5 h-5" />
                  </div>
                )}
              </div>
              
              {/* Message Bubble */}
              <div className={cn(
                "max-w-[85%] rounded-2xl p-5 shadow-sm",
                msg.sender === 'user' 
                  ? "bg-primary-900 text-white rounded-tr-sm" 
                  : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm"
              )}>
                {/* Intent Badge */}
                {msg.sender === 'bot' && msg.intent_detected && (
                  <div className="flex items-center gap-1.5 mb-3 text-xs font-semibold text-primary-600 bg-primary-50 w-fit px-2 py-1 rounded-md">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Engine: {msg.intent_detected}
                  </div>
                )}

                {/* Text content */}
                <div className="prose prose-sm md:prose-base max-w-none prose-p:leading-relaxed whitespace-pre-wrap" style={{ color: 'inherit' }}>
                  {msg.text}
                </div>

                {/* Graph visualization from backend graph_data */}
                {msg.graph_data && msg.graph_data.nodes && msg.graph_data.nodes.length > 0 && (
                  <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden h-[400px] bg-slate-50">
                    <NetworkGraph
                      nodes={msg.graph_data.nodes}
                      edges={msg.graph_data.edges}
                      rootNode={msg.graph_data.root_node || ''}
                      showCommunities={false}
                      selectedNodeId={null}
                      onNodeClick={() => {}}
                    />
                  </div>
                )}

                {/* Analytics visualization from backend analytics_data */}
                {msg.analytics_data && msg.analytics_data.type === 'trend' && Array.isArray(msg.analytics_data.data) && (
                  <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden bg-white p-4">
                    <h4 className="text-sm font-bold text-slate-700 mb-3">Crime Trend Visualization</h4>
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={msg.analytics_data.data}>
                          <defs>
                            <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#0a1f44" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#0a1f44" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <Tooltip />
                          <Area type="monotone" dataKey="count" stroke="#0a1f44" fillOpacity={1} fill="url(#trendGrad)" name="Cases" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Risk Profile visualization */}
                {msg.analytics_data && msg.analytics_data.type === 'risk' && (
                  <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden bg-white p-4">
                    <h4 className="text-sm font-bold text-slate-700 mb-3">Offender Risk Profile</h4>
                    <RiskCard data={msg.analytics_data.data} />
                  </div>
                )}

                {/* Investigation Findings */}
                {msg.investigation && msg.investigation.findings && (
                  <InvestigationFindings findings={msg.investigation.findings} stats={msg.investigation.summary_stats} plan={msg.investigation.plan} />
                )}

                {/* Next Best Investigative Actions */}
                {msg.nextActions && msg.nextActions.leads && msg.nextActions.leads.length > 0 && (
                  <NextBestActions leads={msg.nextActions.leads} methodology={msg.nextActions.methodology} limitations={msg.nextActions.limitations} />
                )}

                {/* Citations */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap gap-2 items-center">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">Sources:</span>
                    {msg.citations.map((cite, i) => (
                      <button key={i} className="text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded transition-colors">
                        FIR #{cite}
                      </button>
                    ))}
                  </div>
                )}

                {/* Reasoning Trace */}
                {msg.reasoning_trace && msg.reasoning_trace.execution_steps && (
                  <div className="mt-4">
                    <ReasoningTrace steps={msg.reasoning_trace.execution_steps} />
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-4 w-full">
              <div className="shrink-0 mt-1">
                <div className="w-8 h-8 rounded-full bg-primary-900 flex items-center justify-center text-accent-500 shadow-sm animate-pulse">
                  <Bot className="w-5 h-5" />
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-5 shadow-sm flex items-center gap-2 text-sm text-slate-500 font-medium h-[60px]">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce"></div>
                </div>
                <span className="ml-2">TriNetra is analyzing...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-white border-t border-slate-200 p-4 shrink-0">
        {statusMessage && (
          <div className="max-w-4xl mx-auto mb-2 flex items-center justify-between bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-800 animate-fadeIn">
            <span className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
              {statusMessage}
            </span>
            <span className="text-[10px] uppercase tracking-wider bg-emerald-200/60 px-1.5 py-0.5 rounded text-emerald-900 font-bold">Sarvam AI Engine</span>
          </div>
        )}
        <div className="max-w-4xl mx-auto relative flex items-end gap-2 bg-slate-50 rounded-xl border border-slate-200 p-2 shadow-sm focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-400/20 transition-all duration-200">
          <button 
            type="button"
            onClick={toggleRecording}
            disabled={isTranscribing || isLoading}
            title={isRecording ? "Click to stop recording" : "Click to record voice query using Sarvam AI STT"}
            className={cn(
              "p-2.5 transition-all rounded-lg flex items-center justify-center shrink-0",
              isRecording 
                ? "bg-red-500 text-white shadow-md animate-pulse hover:bg-red-600" 
                : isTranscribing 
                  ? "bg-slate-200 text-slate-600 cursor-wait"
                  : "text-slate-500 hover:text-primary-900 hover:bg-slate-200/60"
            )}
          >
            {isTranscribing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isRecording ? (
              <Square className="w-5 h-5 fill-white" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </button>
          
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(inputValue);
              }
            }}
            placeholder={
              lang === 'KN' 
                ? "ಕನ್ನಡದಲ್ಲಿ ಪ್ರಶ್ನೆಯನ್ನು ಬರೆಯಿರಿ (ಉದಾ: 2025 ರಲ್ಲಿ ಬೆಂಗಳೂರಿನಲ್ಲಿ ಎಷ್ಟು ಪ್ರಕರಣಗಳು ಸಲ್ಲಿಕೆಯಾಗಿವೆ?)..." 
                : "Query database, search narratives, or speak voice queries in English/Kannada..."
            }
            className="flex-1 max-h-32 min-h-[44px] bg-transparent resize-none py-2.5 px-2 focus:outline-none text-slate-900 placeholder:text-slate-400"
            rows={1}
            disabled={isLoading || isTranscribing}
          />

          <button 
            onClick={() => handleSendMessage(inputValue)}
            disabled={isLoading || isTranscribing || !inputValue.trim()}
            className="p-2.5 bg-primary-900 text-accent-500 hover:bg-primary-800 disabled:opacity-50 disabled:hover:bg-primary-900 transition-colors rounded-lg flex items-center justify-center shrink-0"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
        <div className="max-w-4xl mx-auto text-center mt-2 flex items-center justify-center gap-2">
          <p className="text-[10px] text-slate-400">Powered by Sarvam AI Speech-to-Text & Kannada Neural Translation | TriNetra Core Node</p>
        </div>
      </div>

    </div>
  );
}

function RiskCard({ data }: { data: any }) {
  const score = data?.score ?? 0;
  const factors = typeof data?.factors === 'string' ? JSON.parse(data.factors || '[]') : (data?.factors || []);
  
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className={cn(
          "text-3xl font-bold",
          score >= 80 ? "text-red-600" : score >= 50 ? "text-amber-600" : "text-emerald-600"
        )}>
          {score}/100
        </div>
        <div className="flex-1">
          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
            <div className={cn(
              "h-full rounded-full transition-all",
              score >= 80 ? "bg-red-500" : score >= 50 ? "bg-amber-500" : "bg-emerald-500"
            )} style={{ width: `${score}%` }}></div>
          </div>
        </div>
      </div>
      <div className="flex gap-4 text-sm">
        <span className="text-slate-600">Repeat Offender: <strong>{data?.repeat_offender ? 'Yes' : 'No'}</strong></span>
        {data?.computed_date && <span className="text-slate-400">Computed: {data.computed_date}</span>}
      </div>
      {Array.isArray(factors) && factors.length > 0 && (
        <div>
          <h5 className="text-xs font-bold text-slate-500 uppercase mb-2">Contributing Factors</h5>
          <ul className="space-y-1">
            {factors.map((f: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-500 mt-1.5 shrink-0"></span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ReasoningTrace({ steps }: { steps: any[] }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
      >
        <span>How I got this answer</span>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {isOpen && (
        <div className="px-3 py-2 border-t border-slate-200 text-xs text-slate-600 bg-white space-y-2">
          {steps.map((step: any, i: number) => (
            <div key={i} className="flex gap-2">
              <span className="font-mono text-slate-400 select-none">{String(step.step || i + 1).padStart(2, '0')}</span>
              <div>
                <span className="font-semibold text-slate-700">{step.action}: </span>
                <span>{step.detail}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InvestigationFindings({ findings, stats, plan }: { findings: any[]; stats: any; plan: any }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeFindingIdx, setActiveFindingIdx] = useState<number | null>(null);
  const [evidenceGraph, setEvidenceGraph] = useState<{ nodes: EvidenceNode[]; edges: EvidenceEdge[] } | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<EvidenceEdge | null>(null);
  const [selectedNode, setSelectedNode] = useState<EvidenceNode | null>(null);
  const [isLoadingGraph, setIsLoadingGraph] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);

  if (!findings || findings.length === 0) return null;

  const strengthColor = (s: string) => {
    switch (s) {
      case 'strong': return 'text-emerald-600 bg-emerald-50 border-emerald-200';
      case 'moderate': return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'limited': return 'text-slate-600 bg-slate-50 border-slate-200';
      default: return 'text-slate-400 bg-slate-50 border-slate-100';
    }
  };

  const engineIcon = (engine: string) => {
    switch (engine) {
      case 'case_query': return '🔍';
      case 'case_similarity': return '🔗';
      case 'criminal_network': return '🕸️';
      case 'risk_profile': return '⚠️';
      case 'pattern_detection': return '📊';
      case 'narrative_rag': return '📝';
      case 'trend_analysis': return '📈';
      case 'financial_intelligence': return '💰';
      default: return '⚙️';
    }
  };

  // Findings that support WHY (have data with entities)
  const whyCapableCategories = [
    'Related Cases (Similarity Analysis)',
    'Crime Patterns Detected',
    'Criminal Network Analysis',
    'Offender Risk Assessment',
    'Cases Identified',
    'Financial Intelligence',
  ];

  const displayFindings = findings.filter(f => 
    f.category !== 'Investigation Overview' && f.category !== 'Engine Failures'
  );
  const errors = findings.find(f => f.category === 'Engine Failures');

  const handleWhyClick = async (finding: any, idx: number) => {
    // Toggle if same finding
    if (activeFindingIdx === idx) {
      setActiveFindingIdx(null);
      setEvidenceGraph(null);
      setSelectedEdge(null);
      setSelectedNode(null);
      return;
    }

    setActiveFindingIdx(idx);
    setEvidenceGraph(null);
    setSelectedEdge(null);
    setSelectedNode(null);
    setIsLoadingGraph(true);
    setGraphError(null);

    try {
      const result = await sendEvidenceGraph(finding);
      setEvidenceGraph({ nodes: result.nodes, edges: result.edges });
    } catch (err: any) {
      setGraphError(err.message || 'Failed to load evidence graph');
    } finally {
      setIsLoadingGraph(false);
    }
  };

  const handleViewRecord = (table: string, recordId: any) => {
    if (table === 'CaseMaster' && recordId) {
      window.open(`/cases?search=${recordId}`, '_blank');
    }
  };

  return (
    <div className="mt-4 border border-indigo-200 rounded-xl overflow-hidden bg-indigo-50/30">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-indigo-100/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">🔍</span>
          <span className="text-sm font-bold text-indigo-800">Investigation Results</span>
          <span className={cn(
            "text-[10px] font-bold px-2 py-0.5 rounded-full border",
            strengthColor(stats?.overall_strength || 'none')
          )}>
            {stats?.overall_strength?.toUpperCase() || 'UNKNOWN'} EVIDENCE
          </span>
        </div>
        {isExpanded ? <ChevronUp className="w-4 h-4 text-indigo-600" /> : <ChevronDown className="w-4 h-4 text-indigo-600" />}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-indigo-100">
          {plan && (
            <div className="mt-3 p-3 bg-white rounded-lg border border-indigo-100">
              <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Investigation Plan</div>
              <div className="text-xs text-slate-600">{plan.summary}</div>
              <div className="flex flex-wrap gap-1 mt-2">
                {(plan.engines || []).map((e: string, i: number) => (
                  <span key={i} className="text-[10px] font-medium bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                    {engineIcon(e)} {e.replace('_', ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {stats && (
            <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-500">
              <span>✅ {stats.engines_succeeded}/{stats.engines_executed} engines</span>
              {stats.engines_failed > 0 && <span className="text-amber-600">⚠️ {stats.engines_failed} failed</span>}
              <span>{stats.total_findings} findings</span>
            </div>
          )}

          {displayFindings.map((finding, idx) => {
            const hasWhy = whyCapableCategories.some(cat => finding.category.includes(cat.replace('Related Cases (Similarity Analysis)', 'Similarity')));
            const isWhyActive = activeFindingIdx === idx;

            return (
              <div key={idx} className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-800">{finding.category}</span>
                  <div className="flex items-center gap-2">
                    {hasWhy && (
                      <button
                        onClick={() => handleWhyClick(finding, idx)}
                        className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded border transition-all",
                          isWhyActive
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                        )}
                      >
                        WHY?
                      </button>
                    )}
                    <span className={cn(
                      "text-[9px] font-bold px-1.5 py-0.5 rounded border",
                      strengthColor(finding.strength)
                    )}>
                      {finding.strength.toUpperCase()}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{finding.description}</p>
                <div className="flex items-center gap-1 mt-1.5">
                  <span className="text-[9px] text-slate-400">Sources:</span>
                  {(finding.evidence_sources || []).map((src: string, i: number) => (
                    <span key={i} className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                      {src}
                    </span>
                  ))}
                </div>

                {/* Inline Similar Cases */}
                {finding.category.includes('Similarity') && finding.data?.similar_cases?.length > 0 && !isWhyActive && (
                  <div className="mt-2 space-y-1">
                    {finding.data.similar_cases.slice(0, 3).map((sc: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-[10px] bg-slate-50 p-2 rounded border border-slate-100">
                        <span className="font-bold text-indigo-700">{sc.crime_no}</span>
                        <span className={cn(
                          "font-bold",
                          sc.match_score >= 80 ? "text-red-600" : sc.match_score >= 50 ? "text-amber-600" : "text-emerald-600"
                        )}>{sc.match_score}%</span>
                        <span className="text-slate-500 truncate flex-1">{(sc.explanations || []).join('; ')}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Inline Risk Profiles */}
                {finding.category.includes('Risk') && finding.data?.profiles?.length > 0 && !isWhyActive && (
                  <div className="mt-2 space-y-1">
                    {finding.data.profiles.slice(0, 5).map((p: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-[10px] bg-slate-50 p-2 rounded border border-slate-100">
                        <span className="font-bold text-slate-800">Accused #{p.accused_id}</span>
                        <span className={cn(
                          "font-bold",
                          p.score >= 80 ? "text-red-600" : p.score >= 50 ? "text-amber-600" : "text-emerald-600"
                        )}>{p.score}/100</span>
                        {p.repeat_offender && <span className="text-red-500 font-bold">REPEAT</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Inline Financial Intelligence */}
                {finding.category === 'Financial Intelligence' && !isWhyActive && (
                  <div className="mt-2 space-y-2">
                    {finding.data?.summary && (
                      <div className="grid grid-cols-3 gap-2">
                        <div className="text-center p-2 bg-white rounded border border-indigo-100">
                          <div className="text-sm font-bold text-indigo-700">{finding.data.summary.total_transactions}</div>
                          <div className="text-[9px] text-slate-500">Transactions</div>
                        </div>
                        <div className="text-center p-2 bg-white rounded border border-indigo-100">
                          <div className="text-sm font-bold text-indigo-700">{finding.data.summary.cross_case_links}</div>
                          <div className="text-[9px] text-slate-500">Cross-Case Links</div>
                        </div>
                        <div className="text-center p-2 bg-white rounded border border-indigo-100">
                          <div className="text-sm font-bold text-indigo-700">{finding.data.summary.anomalies_detected}</div>
                          <div className="text-[9px] text-slate-500">Anomalies</div>
                        </div>
                      </div>
                    )}
                    {finding.data?.cross_case_links?.slice(0, 3).map((link: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-[10px] bg-amber-50 p-2 rounded border border-amber-100">
                        <span className="font-bold text-amber-700">🔗</span>
                        <span className="font-bold text-slate-800">{link.accused_name}</span>
                        <span className="text-slate-500">— {link.bank_name} ({link.account_masked})</span>
                        <span className="text-amber-600 font-bold">{link.case_count} cases</span>
                      </div>
                    ))}
                    {finding.data?.anomalies?.slice(0, 3).map((a: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-[10px] bg-red-50 p-2 rounded border border-red-100">
                        <span className="font-bold text-red-600">⚠</span>
                        <span className="font-bold text-slate-800">{a.title}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* WHY? Evidence Graph Expansion */}
                {isWhyActive && (
                  <div className="mt-3 border-t border-indigo-100 pt-3">
                    {isLoadingGraph && (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="w-5 h-5 text-indigo-500 animate-spin mr-2" />
                        <span className="text-xs text-slate-500">Building evidence graph...</span>
                      </div>
                    )}
                    {graphError && (
                      <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                        {graphError}
                      </div>
                    )}
                    {evidenceGraph && !isLoadingGraph && (
                      <div className="space-y-3">
                        {evidenceGraph.nodes.length > 0 ? (
                          <>
                            <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                              Evidence Graph ({evidenceGraph.nodes.length} entities, {evidenceGraph.edges.length} relationships)
                            </div>
                            <EvidenceGraph
                              nodes={evidenceGraph.nodes}
                              edges={evidenceGraph.edges}
                              compact={true}
                              selectedEdgeId={selectedEdge?.id}
                              onEdgeClick={(edge) => { setSelectedEdge(edge); setSelectedNode(null); }}
                              onNodeClick={(node) => { setSelectedNode(node); setSelectedEdge(null); }}
                            />
                            <EvidencePanel
                              edge={selectedEdge}
                              node={selectedNode}
                              allNodes={evidenceGraph.nodes}
                              allEdges={evidenceGraph.edges}
                              onClose={() => { setSelectedEdge(null); setSelectedNode(null); }}
                              onViewRecord={handleViewRecord}
                            />
                          </>
                        ) : (
                          <div className="text-xs text-slate-500 text-center py-4">
                            No detailed evidence graph available for this finding type.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {errors && errors.data?.errors?.length > 0 && (
            <div className="p-2 bg-amber-50 rounded-lg border border-amber-200">
              <div className="text-[10px] font-bold text-amber-700 mb-1">Engine Errors</div>
              {errors.data.errors.map((err: any, i: number) => (
                <div key={i} className="text-[10px] text-amber-600">• {err.engine}: {err.message}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  NEXT BEST INVESTIGATIVE ACTIONS COMPONENT
// ════════════════════════════════════════════════════════════════

function NextBestActions({ leads, methodology, limitations }: {
  leads: NextBestActionLead[];
  methodology: string;
  limitations: string[];
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeLeadIdx, setActiveLeadIdx] = useState<number | null>(null);
  const [evidenceGraph, setEvidenceGraph] = useState<{ nodes: EvidenceNode[]; edges: EvidenceEdge[] } | null>(null);
  const [isLoadingGraph, setIsLoadingGraph] = useState(false);

  if (!leads || leads.length === 0) return null;

  const priorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'border-l-red-500 bg-red-50/50';
      case 'medium': return 'border-l-amber-500 bg-amber-50/30';
      case 'low': return 'border-l-slate-300 bg-slate-50/30';
      default: return 'border-l-slate-200';
    }
  };

  const priorityBadge = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-700 border-red-200';
      case 'medium': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'low': return 'bg-slate-100 text-slate-600 border-slate-200';
      default: return 'bg-slate-50 text-slate-400';
    }
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'related_case': return '📋';
      case 'repeat_offender': return '👤';
      case 'network_connection': return '🕸️';
      case 'pattern_cluster': return '📊';
      case 'high_risk_offender': return '⚠️';
      default: return '🔍';
    }
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case 'related_case': return 'Related Case';
      case 'repeat_offender': return 'Repeat Offender';
      case 'network_connection': return 'Network Connection';
      case 'pattern_cluster': return 'Pattern Cluster';
      case 'high_risk_offender': return 'High-Risk Offender';
      default: return type;
    }
  };

  const handleAction = (lead: NextBestActionLead) => {
    const meta = lead.metadata || {};
    switch (lead.action_type) {
      case 'view_case':
        window.open(`/cases?search=${meta.crime_no || lead.target.entity_id}`, '_blank');
        break;
      case 'view_network':
        window.open(`/network?search=${meta.accused_id || lead.target.entity_id}`, '_blank');
        break;
      case 'view_profile':
        window.open(`/offenders?search=${meta.accused_id || lead.target.entity_id}`, '_blank');
        break;
      case 'view_patterns':
        window.open('/pattern-analytics', '_blank');
        break;
    }
  };

  const handleWhy = async (lead: NextBestActionLead, idx: number) => {
    if (activeLeadIdx === idx) {
      setActiveLeadIdx(null);
      setEvidenceGraph(null);
      return;
    }
    setActiveLeadIdx(idx);
    setIsLoadingGraph(true);
    try {
      const finding = {
        category: typeLabel(lead.type),
        description: lead.reason,
        evidence_sources: lead.source_engines,
        data: {
          similar_cases: lead.type === 'related_case' ? [{
            target_case_id: lead.metadata?.target_case_id,
            case_id: lead.target.entity_id,
            crime_no: lead.metadata?.crime_no || '',
            match_score: lead.metadata?.match_score || 0,
            explanations: lead.evidence.map(e => e.description),
          }] : [],
          profiles: lead.type === 'high_risk_offender' ? [{
            accused_id: lead.target.entity_id,
            score: lead.metadata?.score || 0,
            repeat_offender: lead.metadata?.repeat_offender || false,
          }] : [],
          cases: lead.type === 'related_case' ? [{
            casemasterid: lead.target.entity_id,
            crimeno: lead.metadata?.crime_no || '',
          }] : [],
        },
        strength: lead.strength,
      };
      const result = await sendEvidenceGraph(finding);
      setEvidenceGraph({ nodes: result.nodes, edges: result.edges });
    } catch (err) {
      console.warn('Evidence graph failed for lead:', err);
    } finally {
      setIsLoadingGraph(false);
    }
  };

  return (
    <div className="mt-4 border border-emerald-200 rounded-xl overflow-hidden bg-emerald-50/30">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-emerald-100/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">🎯</span>
          <span className="text-sm font-bold text-emerald-800">Next Best Investigative Actions</span>
          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
            {leads.length} lead{leads.length !== 1 ? 's' : ''}
          </span>
        </div>
        {isExpanded ? <ChevronUp className="w-4 h-4 text-emerald-600" /> : <ChevronDown className="w-4 h-4 text-emerald-600" />}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-emerald-100">
          <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-500 mt-2">
            <span>{leads.filter(l => l.priority === 'high').length} high priority</span>
            <span>{leads.filter(l => l.priority === 'medium').length} medium</span>
            <span>{leads.filter(l => l.priority === 'low').length} low</span>
          </div>

          {leads.map((lead, idx) => (
            <div
              key={lead.lead_id}
              className={`bg-white p-3 rounded-lg border border-slate-100 shadow-sm border-l-4 ${priorityColor(lead.priority)}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm">{typeIcon(lead.type)}</span>
                    <span className="text-xs font-bold text-slate-800">{lead.target.entity_label}</span>
                    <span className={cn(
                      "text-[9px] font-bold px-1.5 py-0.5 rounded border",
                      priorityBadge(lead.priority)
                    )}>
                      {lead.priority.toUpperCase()}
                    </span>
                    <span className="text-[9px] font-medium text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
                      {typeLabel(lead.type)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mb-2">{lead.reason}</p>
                  {lead.evidence.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {lead.evidence.slice(0, 5).map((ev, i) => (
                        <span key={i} className="text-[9px] bg-slate-50 text-slate-600 px-1.5 py-0.5 rounded border border-slate-100">
                          {ev.description.length > 50 ? ev.description.substring(0, 50) + '...' : ev.description}
                        </span>
                      ))}
                      {lead.evidence.length > 5 && (
                        <span className="text-[9px] text-slate-400">+{lead.evidence.length - 5} more</span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-slate-400">Sources:</span>
                    {lead.source_engines.map((eng, i) => (
                      <span key={i} className="text-[9px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium">
                        {eng.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    onClick={() => handleAction(lead)}
                    className="text-[10px] font-bold px-2 py-1 bg-primary-900 text-white rounded hover:bg-primary-800 transition-colors"
                  >
                    {lead.action_label}
                  </button>
                  <button
                    onClick={() => handleWhy(lead, idx)}
                    className={cn(
                      "text-[10px] font-bold px-2 py-1 rounded border transition-all",
                      activeLeadIdx === idx
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                    )}
                  >
                    WHY?
                  </button>
                </div>
              </div>
              {activeLeadIdx === idx && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  {isLoadingGraph ? (
                    <div className="h-32 bg-slate-100 animate-pulse rounded-lg" />
                  ) : evidenceGraph && evidenceGraph.nodes.length > 0 ? (
                    <div>
                      <div className="text-[10px] font-bold text-emerald-700 mb-2">
                        Evidence Graph ({evidenceGraph.nodes.length} entities, {evidenceGraph.edges.length} relationships)
                      </div>
                      <div className="h-[280px] bg-white rounded-lg border border-slate-200 overflow-hidden">
                        <EvidenceGraph
                          nodes={evidenceGraph.nodes}
                          edges={evidenceGraph.edges}
                          compact={true}
                        />
                      </div>
                      {/* Edge evidence details */}
                      {evidenceGraph.edges.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {evidenceGraph.edges.slice(0, 5).map((edge, i) => (
                            <div key={i} className="text-[10px] bg-emerald-50 p-2 rounded border border-emerald-100">
                              <span className="font-semibold text-emerald-800">{edge.relationship_label}</span>
                              <span className="text-slate-500 mx-1">—</span>
                              <span>{edge.evidence?.[0]?.description || edge.relationship}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : evidenceGraph ? (
                    <div className="text-[10px] text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <div className="font-semibold mb-1">Evidence Details</div>
                      {evidenceGraph.edges.length > 0 ? (
                        <div className="space-y-1">
                          {evidenceGraph.edges.map((edge, i) => (
                            <div key={i} className="text-[10px] bg-white p-2 rounded border border-slate-100">
                              <span className="font-semibold text-slate-700">{edge.relationship_label}</span>
                              <span className="text-slate-400 mx-1">—</span>
                              <span>{edge.evidence?.[0]?.description || edge.relationship}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p>No graph relationships available for this lead. Evidence: {leads[idx]?.evidence?.map(e => e.description).join('; ') || 'None'}</p>
                      )}
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-400">No evidence graph available.</div>
                  )}
                </div>
              )}
            </div>
          ))}

          <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 mt-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Methodology</div>
            <div className="text-[10px] text-slate-600 leading-relaxed">{methodology}</div>
          </div>
        </div>
      )}
    </div>
  );
}
