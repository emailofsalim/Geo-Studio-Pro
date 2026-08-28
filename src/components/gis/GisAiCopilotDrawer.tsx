import React, { useState } from 'react';
import {
  Sparkles,
  Send,
  Loader2,
  X,
  PlusCircle,
  Check,
  Bot,
  MapPin,
  Maximize2,
  Layers,
  HelpCircle,
  Cpu
} from 'lucide-react';
import { GeoFeature, GisLayer } from '../../types';
import { useToast } from '../../context/ToastContext';
import { executeGeomaticsAi } from '../../lib/geoAiEngine';

interface GisAiCopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  workingZone: string;
  activeLayer: GisLayer;
  centerCoord: { E: number; N: number } | null;
  onInsertFeatures: (features: GeoFeature[]) => void;
}

export const GisAiCopilotDrawer: React.FC<GisAiCopilotDrawerProps> = ({
  isOpen,
  onClose,
  workingZone,
  activeLayer,
  centerCoord,
  onInsertFeatures
}) => {
  const toast = useToast();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [modelBadge, setModelBadge] = useState('OpenSource / GeoAI');
  const [conversation, setConversation] = useState<{
    role: 'user' | 'assistant';
    text: string;
    model?: string;
    features?: GeoFeature[];
  }[]>([
    {
      role: 'assistant',
      text: `👋 **Hello! I am your AI Spatial Copilot (Powered by Open-Source AI & Geomatics Engine).**\n\nI can help you with:\n- Generating cadastral parcel boundaries & farm grids\n- Synthesizing exploration drillhole borehole arrays\n- Designing road traverse corridors & pipeline routes\n- Calculating DGMS safety buffers and environmental setbacks\n- Answering geodesy, coordinate transformations, and surveying questions\n\nAsk any question or pick a quick prompt below!`,
      model: 'OpenSource-GeoEngine'
    }
  ]);

  const quickPrompts = [
    'Create a 4-hectare rectangular farm parcel at the center',
    'Generate 6 borehole exploration drill points in a 2x3 grid (spaced 100m)',
    'Create a 300m road corridor with 4 waypoints heading Northeast',
    'Create a standard 50m environmental buffer polygon zone'
  ];

  const handleSend = async (queryText?: string) => {
    const textToSend = queryText || prompt;
    if (!textToSend.trim() || loading) return;

    const userMessage = { role: 'user' as const, text: textToSend };
    setConversation(prev => [...prev, userMessage]);
    setPrompt('');
    setLoading(true);

    try {
      const summary = `Layer "${activeLayer.name}" has ${activeLayer.features.length} features (${activeLayer.geomType})`;
      
      let answerText = '';
      let genFeatures: GeoFeature[] | undefined = undefined;
      let usedModel = 'OpenSource-GeoEngine';

      try {
        const res = await fetch('/api/ai/gis-copilot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: textToSend,
            workingZone,
            centerCoord: centerCoord || { E: 255000, N: 2605000 },
            activeLayerName: activeLayer.name,
            existingFeaturesSummary: summary
          })
        });

        if (res.ok) {
          const data = await res.json();
          answerText = data.answer;
          genFeatures = data.generatedFeatures && data.generatedFeatures.length > 0 ? data.generatedFeatures : undefined;
          usedModel = data.model || 'OpenSource-AI';
        } else {
          throw new Error('Server returned non-200');
        }
      } catch (srvErr) {
        // Direct client-side open-source inference fallback
        const localRes = await executeGeomaticsAi(textToSend, {
          workingZone,
          centerCoord: centerCoord || { E: 255000, N: 2605000 },
          activeLayerName: activeLayer.name,
          existingFeaturesSummary: summary
        });
        answerText = localRes.answer;
        genFeatures = localRes.generatedFeatures && localRes.generatedFeatures.length > 0 ? localRes.generatedFeatures : undefined;
        usedModel = localRes.modelUsed;
      }

      setModelBadge(usedModel);
      setConversation(prev => [
        ...prev,
        {
          role: 'assistant',
          text: answerText || 'Completed spatial request.',
          model: usedModel,
          features: genFeatures
        }
      ]);
    } catch (err: any) {
      // Local zero-failure fallback
      const fallback = await executeGeomaticsAi(textToSend, {
        workingZone,
        centerCoord: centerCoord || { E: 255000, N: 2605000 }
      });
      setConversation(prev => [
        ...prev,
        {
          role: 'assistant',
          text: fallback.answer,
          model: fallback.modelUsed,
          features: fallback.generatedFeatures
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleInsert = (features: GeoFeature[]) => {
    if (!features || features.length === 0) return;
    onInsertFeatures(features);
    toast.showSuccess(`Added ${features.length} AI-generated feature(s) to layer "${activeLayer.name}".`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[460px] bg-slate-900/95 dark:bg-[#0c1017]/95 backdrop-blur-xl border-l border-slate-700/50 dark:border-white/10 z-50 flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-950/40">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-gradient-to-tr from-amber-500/20 to-yellow-400/20 border border-amber-500/30 rounded-xl">
            <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              AI Spatial Copilot <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono">v3.7</span>
            </h3>
            <p className="text-[11px] text-white/50">Smart Geomatics & Geometry Engine</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Quick Prompts */}
      <div className="p-3 border-b border-white/5 bg-slate-950/20 overflow-x-auto flex gap-1.5 no-scrollbar">
        {quickPrompts.map((qp, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(qp)}
            disabled={loading}
            className="text-[11px] whitespace-nowrap px-2.5 py-1 bg-white/5 hover:bg-amber-500/10 hover:border-amber-500/30 border border-white/10 rounded-lg text-white/80 transition-all text-left flex-shrink-0"
          >
            {qp}
          </button>
        ))}
      </div>

      {/* Chat Messages */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {conversation.map((msg, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[90%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-amber-500 text-black font-medium rounded-tr-none'
                  : 'bg-white/5 text-white/90 border border-white/10 rounded-tl-none space-y-2'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.text}</div>

              {msg.features && msg.features.length > 0 && (
                <div className="mt-3 p-3 bg-black/40 border border-amber-500/30 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-amber-400">
                    <span>✨ {msg.features.length} Feature(s) Generated</span>
                    <span className="text-[10px] text-white/40">Ready to Map</span>
                  </div>
                  <div className="text-[11px] font-mono text-white/70 space-y-1 max-h-24 overflow-y-auto">
                    {msg.features.map((f, fi) => (
                      <div key={fi} className="truncate">
                        • {f.name} ({f.geom.toUpperCase()}, {f.pts.length} pts)
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => handleInsert(msg.features!)}
                    className="w-full mt-2 py-1.5 px-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 shadow-md transition-all"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Insert into "{activeLayer.name}"
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 p-3 bg-white/5 border border-white/10 rounded-2xl text-xs text-amber-400 w-fit">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>AI Spatial Engine calculating geometries...</span>
          </div>
        )}
      </div>

      {/* Input Form */}
      <div className="p-3 border-t border-white/10 bg-slate-950/40">
        <form
          onSubmit={e => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Ask AI Copilot to generate parcels, grids, buffer..."
            disabled={loading}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-white/40 focus:outline-none focus:border-amber-500/50"
          />
          <button
            type="submit"
            disabled={!prompt.trim() || loading}
            className="p-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold rounded-xl transition-all shadow-md"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
