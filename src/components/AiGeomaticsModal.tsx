import React, { useState, useEffect } from 'react';
import { describeAiFallback } from '../lib/aiServiceStatus';
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
  HelpCircle,
  Wifi,
  WifiOff,
  BookOpen,
  ShieldCheck,
  Cpu
} from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { executeGeomaticsAi } from '../lib/geoAiEngine';

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
  source?: string;
}

/** Carries the HTTP status through the catch so the reason can be reported. */
class HttpStatusError extends Error {
  constructor(public status: number) {
    super(`Assistant service returned ${status}`);
  }
}

export const AiGeomaticsModal: React.FC<AiGeomaticsModalProps> = ({
  isOpen,
  onClose,
  workingZone,
  activeTab
}) => {
  const isOnline = useOnlineStatus();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        'Hello! I am your **BhuNex Studio AI App Guide & Geomatics Assistant** (Powered by Geomatics Intelligence & Gemini).\n\nI can assist you across all BhuNex Studio workspaces:\n- **Home & Templates**: Selecting standard schemas, inspecting survey ZIP packages, and downloading data dictionaries.\n- **Coordinate Conversions**: Transforming between Lat/Long, UTM Zone ' + workingZone + ', and Indian Kalianpur LCC 1SP.\n- **Cadastral & Revenue Mapping**: Entering Khasra/Plot numbers, converting Bigha-Katha-Dhur to Sq. Meters & Hectares in BhuNaksha.\n- **Total Station & GPS Surveys**: Setting up backsight stations, balancing traverses with Bowditch rule, calculating Vincenty distance.\n- **Borehole Stratigraphy & Mines**: Generating 3D strip logs and checking IBM 2018 mineral cutoff thresholds.\n- **Boundaries & Geofences**: Drawing statutory 7.5m mining lease offsets, corridor buffers, and proximity alarms.\n\nAsk me any question about how to use any feature in BhuNex Studio!',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      source: 'OpenSource-GeoEngine'
    }
  ]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const handleGlobalEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      };
      window.addEventListener('keydown', handleGlobalEsc);
      return () => window.removeEventListener('keydown', handleGlobalEsc);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const quickPrompts = [
    'How do I convert coordinates between Lat/Long and UTM in BhuNex?',
    'How do I digitize and split cadastral plots in BhuNaksha?',
    'How do I calculate mine bench slope and stripping ratio in Survey Calculator?',
    'How do I balance a closed traverse using Bowditch Rule in Total Station?'
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

    let answerText = '';
    let usedSource = 'OpenSource-GeoEngine';

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

      if (res.ok) {
        const data = await res.json();
        answerText = data.answer;
        usedSource = data.model || 'Gemini/OpenSource';
      } else {
        throw new HttpStatusError(res.status);
      }
    } catch (fetchErr) {
      // Local open-source fallback. It answers, which is why this used to look
      // like nothing had gone wrong -- so say which engine answered and why.
      setErrorMsg(describeAiFallback(
        fetchErr instanceof HttpStatusError ? fetchErr.status : null,
        fetchErr
      ));
      const localResult = await executeGeomaticsAi(prompt, {
        workingZone,
        activeLayerName: activeTab
      });
      answerText = localResult.answer;
      usedSource = localResult.modelUsed;
    }

    const aiMsg: Message = {
      role: 'assistant',
      content: answerText || 'Completed geomatics query analysis.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      source: usedSource
    };
    setMessages(prev => [...prev, aiMsg]);
    setIsLoading(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 cursor-pointer"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-[#0f0f0f] rounded-2xl shadow-2xl border border-white/10 flex flex-col h-[85vh] max-h-[700px] overflow-hidden animate-in fade-in zoom-in-95 duration-150 cursor-default"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-[#0a0a0a]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl overflow-hidden border border-[#478bc7]/40 bg-[#0d2640] flex items-center justify-center p-0.5 shrink-0">
              <img
                src="/icon-192.svg"
                alt="BhuNex"
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="font-semibold text-sm text-white">
                  BhuNex Studio AI Assistant
                </h3>
                {isOnline ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <Wifi className="w-2.5 h-2.5" />
                    Online & Ready
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                    <WifiOff className="w-2.5 h-2.5" />
                    Offline Mode
                  </span>
                )}
              </div>
              <p className="text-[10px] text-white/40 font-mono mt-0.5">
                Active Tab: {activeTab.toUpperCase()} • Datum: UTM {workingZone}
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

        {/* Offline Notice Banner if disconnected */}
        {!isOnline && (
          <div className="px-5 py-2.5 bg-amber-950/40 border-b border-amber-500/20 text-amber-300 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <WifiOff className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                You are currently offline. Internet connection is required for live AI queries. All local calculators and surveying tools remain fully functional offline.
              </span>
            </div>
          </div>
        )}

        {/* Chat History */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4 custom-scrollbar">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-[#142d47] border border-[#377cb8]/40 text-[#8ecbf8] flex items-center justify-center shrink-0 text-xs mt-1 shadow-2xs">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-[#c9a063] text-black font-medium rounded-tr-none shadow-lg shadow-[#c9a063]/10'
                    : 'bg-[#141414] text-white/90 rounded-tl-none border border-white/5 font-normal'
                }`}
              >
                <div className="whitespace-pre-wrap font-sans space-y-2">
                  {m.content}
                </div>
                <div
                  className={`text-[9px] mt-2 font-mono ${
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
            <div className="flex gap-3 items-center text-xs text-white/70 p-3.5 bg-white/5 border border-white/5 rounded-xl max-w-sm">
              <Loader2 className="w-4 h-4 animate-spin text-[#8ecbf8]" />
              <span>Analyzing geomatics query...</span>
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
        <div className="px-5 py-2 bg-[#0a0a0a] border-t border-white/5 flex gap-2 overflow-x-auto text-[11px] custom-scrollbar">
          {quickPrompts.map((qp, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(qp)}
              disabled={isLoading || !isOnline}
              className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-[#8ecbf8]/60 hover:bg-white/10 disabled:opacity-40 shrink-0 transition-all font-normal text-left"
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
            placeholder={
              isOnline
                ? "Ask how to use any BhuNex surveying, coordinate, or cadastral feature..."
                : "AI assistant requires internet connection..."
            }
            rows={1}
            disabled={isLoading || !isOnline}
            className="flex-1 py-3 px-4 rounded-xl border border-white/10 bg-[#141414] text-white placeholder-white/30 text-xs focus:outline-none focus:border-[#8ecbf8]/50 disabled:opacity-50 resize-none font-sans transition-all"
          />

          <button
            onClick={() => handleSend()}
            disabled={!inputPrompt.trim() || isLoading || !isOnline}
            className="p-3 bg-[#c9a063] hover:bg-[#d6b074] disabled:opacity-30 text-black font-bold rounded-xl transition-all shadow-md shadow-[#c9a063]/10"
            title="Send query"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

