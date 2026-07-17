import React, { useState, useRef, useEffect } from 'react';
import { Send, FileDown, Mic, ChevronDown, ChevronUp, Bot, User, Globe, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { sendChatQuery, exportChat, type ChatResponse } from '../services/api';
import NetworkGraph from '../components/NetworkGraph';
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
}

const examplePrompts = [
  "How many cases were registered in Bengaluru Urban in 2025?",
  "Show me chain snatching cases in Bengaluru Urban from October to December 2025.",
  "Are there any cases involving a fraudulent online transaction near Mysuru?",
  "Who is connected to accused 3682?",
  "How has cyber crime changed in Bengaluru Urban over the last two years?",
  "Is there anything unusual happening with digital arrest scams recently?",
  "Find cases similar to CaseMasterID 2817.",
  "What is the risk profile for accused 3682?",
  "Find cases similar to CaseMasterID 9",
  "Summarize the most recent one."
];

export default function AskTriNetra() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lang, setLang] = useState<'EN' | 'KN'>('EN');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
      const data: ChatResponse = await sendChatQuery(text);

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        text: data.answer || "I'm sorry, I couldn't process that.",
        intent_detected: data.intent_detected,
        citations: data.citations,
        reasoning_trace: data.reasoning_trace,
        graph_data: data.graph_data,
        analytics_data: data.analytics_data,
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error: any) {
      console.error('Error fetching chat response:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'bot',
          text: `Connection error: ${error.message || 'Could not reach TriNetra Core. Ensure the backend is running on port 9000.'}`,
          intent_detected: 'error',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      
      {/* Top Bar */}
      <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 shadow-sm">
        <h1 className="font-bold text-lg text-primary-900 flex items-center gap-2">
          <Bot className="w-5 h-5 text-accent-500" />
          Intelligence Copilot
        </h1>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setLang(lang === 'EN' ? 'KN' : 'EN')}
            className="flex items-center gap-1 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-md transition-colors"
          >
            <Globe className="w-4 h-4" />
            {lang === 'EN' ? 'English' : 'ಕನ್ನಡ'}
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
                    onClick={() => handleSendMessage(prompt)}
                    className="text-left p-4 rounded-xl border border-slate-200 bg-white hover:border-accent-500 hover:shadow-md transition-all text-sm font-medium text-slate-700"
                  >
                    {prompt}
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
        <div className="max-w-4xl mx-auto relative flex items-end gap-2 bg-slate-50 rounded-xl border border-slate-200 p-2 shadow-sm focus-within:border-primary-400 focus-within:ring-1 focus-within:ring-primary-400 transition-all">
          <button className="p-2.5 text-slate-400 hover:text-primary-900 transition-colors rounded-lg">
            <Mic className="w-5 h-5" />
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
            placeholder="Query the database, search narratives, or map criminal networks..."
            className="flex-1 max-h-32 min-h-[44px] bg-transparent resize-none py-2.5 px-2 focus:outline-none text-slate-900 placeholder:text-slate-400"
            rows={1}
            disabled={isLoading}
          />

          <button 
            onClick={() => handleSendMessage(inputValue)}
            disabled={isLoading || !inputValue.trim()}
            className="p-2.5 bg-primary-900 text-accent-500 hover:bg-primary-800 disabled:opacity-50 disabled:hover:bg-primary-900 transition-colors rounded-lg flex items-center justify-center"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <div className="max-w-4xl mx-auto text-center mt-2">
          <p className="text-[10px] text-slate-400">TriNetra may produce inaccurate results. Verify critical information against official records.</p>
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
