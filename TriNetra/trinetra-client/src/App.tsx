import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import NetworkGraph from './components/NetworkGraph';

// Extended message interface to handle graph payloads
export interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  intent_detected?: string;
  citations?: string[];
  reasoning_trace?: any;
  graph_data?: { 
    nodes: any[]; 
    edges: any[] 
  } | null;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when messages update
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: inputValue,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Make sure your backend runs on port 9000
      const response = await fetch('http://127.0.0.1:9000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: userMessage.text,
          session_token: 'local_dev_session',
          role: 'Investigator', // Mock RBAC Role
          employee_id: 101,
          unit_id: 5,
          district_id: 2
        }),
      });

      const data = await response.json();

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        text: data.answer || "I'm sorry, I couldn't process that.",
        intent_detected: data.intent_detected,
        citations: data.citations,
        reasoning_trace: data.reasoning_trace,
        graph_data: data.graph_data // Attach the graph payload from the API!
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error('Error fetching chat response:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'bot',
          text: 'Network error communicating with the TriNetra Core.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-logo">
          <h1>TriNetra <span>Intelligence Core</span></h1>
        </div>
        <div className="header-status">
          <span className="status-indicator online"></span>
          Connected: Investigator Role
        </div>
      </header>

      <main className="chat-interface">
        <div className="messages-container">
          {messages.length === 0 && (
            <div className="welcome-message">
              <h2>Welcome to TriNetra Analytics</h2>
              <p>Try asking: "Show me the criminal network for Accused 80" or "How many cases are in Mysuru?"</p>
            </div>
          )}
          
          {messages.map((msg) => (
            <div key={msg.id} className={`message-wrapper ${msg.sender}`}>
              <div className="message-bubble">
                {/* Intent Tag */}
                {msg.sender === 'bot' && msg.intent_detected && (
                  <div className="intent-badge">Engine: {msg.intent_detected}</div>
                )}
                
                {/* Main Text */}
                <div className="message-text">{msg.text}</div>

                {/* GRAPH VISUALIZATION TIER */}
                {msg.graph_data && msg.graph_data.nodes && msg.graph_data.nodes.length > 0 && (
                  <NetworkGraph data={msg.graph_data} />
                )}

                {/* Citations Tier */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="citations-block">
                    <strong>Sources:</strong>
                    {msg.citations.map((cite, i) => (
                      <span key={i} className="citation-pill">FIR #{cite}</span>
                    ))}
                  </div>
                )}

                {/* Reasoning Trace Tier (Collapsible) */}
                {msg.reasoning_trace && msg.reasoning_trace.execution_steps && (
                  <details className="reasoning-trace">
                    <summary>View Execution Trace</summary>
                    <ul>
                      {msg.reasoning_trace.execution_steps.map((step: any, i: number) => (
                        <li key={i}>
                          <strong>{step.action}:</strong> {step.detail}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="message-wrapper bot">
              <div className="message-bubble loading">TriNetra is analyzing...</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-area">
          <form onSubmit={handleSendMessage}>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Query the database, search narratives, or map criminal networks..."
              disabled={isLoading}
            />
            <button type="submit" disabled={isLoading || !inputValue.trim()}>
              Send Query
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default App;