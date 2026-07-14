import React, { useState } from 'react';
import { sendChatQuery } from './services/api';
import './App.css'; // We will add some basic styling next

// Type definitions for our Backend Response
interface ExecutionStep {
  step: number;
  action: string;
  detail: string;
}

interface Message {
  sender: 'user' | 'system';
  text: string;
  intent_detected?: string;
  trace?: ExecutionStep[];
}

function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTrace, setActiveTrace] = useState<ExecutionStep[] | null>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Add user message to screen
    const userMsg: Message = { sender: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      // Call FastAPI Backend
      const response = await sendChatQuery(userMsg.text);
      
      // Parse response and add to screen
      const systemMsg: Message = {
        sender: 'system',
        text: response.answer,
        intent_detected: response.intent_detected,
        trace: response.reasoning_trace?.execution_steps
      };
      
      setMessages(prev => [...prev, systemMsg]);
      
      // Update the Explainability Panel
      if (systemMsg.trace) {
        setActiveTrace(systemMsg.trace);
      }

    } catch (error) {
      setMessages(prev => [...prev, { sender: 'system', text: "Error connecting to TriNetra Core." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="trinetra-layout">
      {/* LEFT PANEL: Chat Interface */}
      <div className="chat-container">
        <header className="chat-header">
          <h2>TriNetra Copilot (नेत्र)</h2>
          <span className="badge">Secured Law Enforcement Node</span>
        </header>

        <div className="messages-area">
          {messages.length === 0 && (
            <div className="empty-state">Ask a question to begin investigation...</div>
          )}
          {messages.map((msg, idx) => (
            <div key={idx} className={`message ${msg.sender}`}>
              <div className="message-bubble">
                <p>{msg.text}</p>
                {msg.intent_detected && <span className="intent-tag">Engine: {msg.intent_detected}</span>}
              </div>
            </div>
          ))}
          {loading && <div className="loading">Processing query parameters...</div>}
        </div>

        <form className="input-area" onSubmit={handleSend}>
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your query in English or Kannada..." 
            autoFocus
          />
          <button type="submit" disabled={loading}>Send</button>
        </form>
      </div>

      {/* RIGHT PANEL: Explainable AI (Pillar 9) */}
      <div className="trace-container">
        <h3>Reasoning Trace</h3>
        <p className="trace-subtitle">Execution Pipeline & Evidence</p>
        
        {activeTrace ? (
          <div className="trace-steps">
            {activeTrace.map(step => (
              <div key={step.step} className="step-card">
                <div className="step-number">{step.step}</div>
                <div className="step-details">
                  <h4>{step.action}</h4>
                  <p>{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-trace">No active reasoning trace.</div>
        )}
      </div>
    </div>
  );
}

export default App;