import React, { useState } from 'react';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Bot,
  User,
  Compass,
  CheckCircle2,
  AlertCircle,
  HelpCircle
} from 'lucide-react';

interface AiGeomaticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workingZone: string;
  activeTab: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export const AiGeomaticsModal: React.FC<AiGeomaticsModalProps> = ({
  isOpen,
  onClose,
  workingZone,
  activeTab
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        'Hello! I am your **AI Geomatics & Mining Consultant**, powered by **Gemini 3.1 Pro with High Thinking Mode**.\n\nAsk me anything regarding:\n- Complex Datum Transformations (Everest 1830 to WGS84, Bursa-Wolf 7-param, 2D Helmert)\n- Indian Grid LCC 1SP parameters & Survey of India Toposheet grids\n- IBM 2018 Mineral Cutoff specifications (Bauxite, Iron Ore, Coal, Limestone)\n- Cadastral Revenue parcel law & Bigha-Katha-Dhur-Dismil calculations\n- Bowditch traverse balancing & Vincenty geodesic math',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const quickPrompts = [
    'How do I calculate 2D Helmert transformation parameters between local mine grid and UTM?',
    'What are the IBM 2018 cutoff thresholds for metallurgical bauxite vs refractory grade?',
    'Explain the mathematical difference between Bowditch Rule and Transit Rule in traverse balancing.',
    'How do I convert Bihar/Jharkhand Revenue Bigha into Hectares and Acres?'
  ];

  const handleSend = async (textToSend?: string) => {
    const prompt = (textToSend || inputPrompt).trim();
    if (!prompt || isLoading) return;

    const userMsg: Message = {
      role: 'user',
      content: prompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInputPrompt('');
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/ai/geomatics-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          context: {
            workingZone,
            activeTab
          }
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to get consultation response.');
      }

      const aiMsg: Message = {
        role: 'assistant',
        content: data.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error reaching AI service.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-3xl bg-[#0f0f0f] rounded-2xl shadow-2xl border border-white/10 flex flex-col h-[85vh] max-h-[700px] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-[#0a0a0a]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#1a1a1a] border border-white/10 text-[#c9a063] flex items-center justify-center font-serif italic text-sm">
              AI
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="font-serif italic text-base text-white">
                  AI Geomatics & Mining Consultant
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider bg-[#c9a063]/10 text-[#c9a063] border border-[#c9a063]/30">
                  Gemini 3.1 Pro • High Thinking
                </span>
              </div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                Active Context: Zone {workingZone} | Tool: {activeTab.toUpperCase()}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chat History */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4 custom-scrollbar">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-[#1a1a1a] border border-white/10 text-[#c9a063] flex items-center justify-center shrink-0 font-serif italic text-xs mt-1">
                  AI
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-[#c9a063] text-black font-medium rounded-tr-none shadow-lg shadow-[#c9a063]/10'
                    : 'bg-[#141414] text-white/90 rounded-tl-none border border-white/5 font-light'
                }`}
              >
                <div className="whitespace-pre-wrap font-sans space-y-2">
                  {m.content}
                </div>
                <div
                  className={`text-[9px] mt-2 font-mono uppercase tracking-wider ${
                    m.role === 'user' ? 'text-black/60' : 'text-white/30'
                  }`}
                >
                  {m.timestamp}
                </div>
              </div>

              {m.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-white/10 text-white flex items-center justify-center shrink-0 font-sans text-xs mt-1">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 items-center text-xs text-white/60 font-light p-3.5 bg-white/5 border border-white/5 rounded-xl max-w-sm">
              <Loader2 className="w-4 h-4 animate-spin text-[#c9a063]" />
              <span>Gemini 3.1 Pro is performing deep reasoning...</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-950/30 border border-rose-900/50 text-rose-300 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Quick Suggestions */}
        <div className="px-6 py-2.5 bg-[#0a0a0a] border-t border-white/5 flex gap-2 overflow-x-auto text-[11px] custom-scrollbar">
          {quickPrompts.map((qp, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(qp)}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-white hover:border-[#c9a063] hover:bg-white/10 shrink-0 transition-all font-light"
            >
              {qp}
            </button>
          ))}
        </div>

        {/* Input Footer */}
        <div className="p-4 border-t border-white/5 bg-[#0a0a0a] flex items-center gap-2">
          <textarea
            value={inputPrompt}
            onChange={e => setInputPrompt(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask a technical geomatics, geodesy, or mining question..."
            rows={1}
            disabled={isLoading}
            className="flex-1 py-3 px-4 rounded-xl border border-white/10 bg-[#141414] text-white placeholder-white/30 text-xs focus:outline-none focus:border-[#c9a063] resize-none font-sans transition-all"
          />

          <button
            onClick={() => handleSend()}
            disabled={!inputPrompt.trim() || isLoading}
            className="p-3 bg-[#c9a063] hover:bg-[#d6b074] disabled:opacity-30 text-black font-bold rounded-xl transition-all shadow-md shadow-[#c9a063]/10"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
