import React, { useState } from 'react';
import {
  Wifi,
  Radio,
  Share2,
  Send,
  Users,
  CheckCircle2,
  MapPin,
  MessageSquare
} from 'lucide-react';
import { NetworkTelemetry } from '../../lib/hardwareComms';
import { triggerHaptic } from '../../lib/haptics';
import { useIsDarkMode } from '../../hooks/useIsDarkMode';

interface WifiMeshViewProps {
  networkInfo: NetworkTelemetry;
  meshPeerId: string;
  activePeers: string[];
  meshMessages: { sender: string; time: string; type: 'point' | 'chat' | 'beacon' | 'rtcm'; payload: any }[];
  onSendMessage: (type: 'chat' | 'point' | 'beacon', payload: any) => void;
  onShareGpsPoint: () => void;
}

export const WifiMeshView: React.FC<WifiMeshViewProps> = ({
  networkInfo,
  meshPeerId,
  activePeers,
  meshMessages,
  onSendMessage,
  onShareGpsPoint
}) => {
  const isDark = useIsDarkMode();
  const [chatText, setChatText] = useState<string>('');

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    onSendMessage('chat', chatText.trim());
    setChatText('');
  };

  const cardBg = isDark ? 'bg-[#111111] border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm';
  const subCardBg = isDark ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-slate-50 border-slate-200/80';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textSecondary = isDark ? 'text-white/50' : 'text-slate-500';
  const textMuted = isDark ? 'text-white/40' : 'text-slate-400';
  const borderSubtle = isDark ? 'border-white/[0.06]' : 'border-slate-200';
  const inputBg = isDark ? 'bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/30' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400';

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className={`p-5 ${cardBg} rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors`}>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
            <h3 className={`text-sm font-semibold ${textPrimary}`}>Wi-Fi Direct & Hotspot Field P2P Mesh</h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              LOCAL MESH ACTIVE
            </span>
          </div>
          <p className={`text-xs ${textSecondary}`}>
            Direct peer-to-peer data sync between field surveyor rovers, party chiefs, and rodmen without requiring cellular internet.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2 text-xs font-mono">
          <div className={`px-3 py-1.5 rounded-lg ${isDark ? 'bg-white/[0.04] border-white/[0.08] text-white/70' : 'bg-slate-100 border-slate-200 text-slate-700'} border`}>
            Node ID: <span className="text-[#c9a063] font-bold">{meshPeerId}</span>
          </div>
          <button
            onClick={onShareGpsPoint}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors flex items-center gap-1.5 font-sans shadow-sm"
          >
            <MapPin className="w-3.5 h-3.5" /> Broadcast Live Point
          </button>
        </div>
      </div>

      {/* Grid: Peers on Local Network & Live Mesh Feed */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* Active Local Peers Card */}
        <div className={`md:col-span-4 ${cardBg} p-5 rounded-2xl border space-y-4 font-mono transition-colors`}>
          <div className="flex items-center justify-between font-sans">
            <span className={`text-xs font-semibold ${textPrimary}`}>Crew Nodes in Hotspot Range</span>
            <Users className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
          </div>

          <div className="space-y-2">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                <span className="text-emerald-700 dark:text-emerald-300 font-bold">{meshPeerId} (This Device)</span>
              </div>
              <span className="text-[10px] text-emerald-700/70 dark:text-emerald-200/60 font-sans">Leader</span>
            </div>

            {activePeers.map((peer, idx) => (
              <div key={idx} className={`p-2.5 ${subCardBg} border rounded-xl flex items-center justify-between text-xs`}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500 dark:bg-blue-400" />
                  <span className={`${textPrimary} font-medium`}>{peer}</span>
                </div>
                <span className={`text-[10px] ${textMuted}`}>Connected</span>
              </div>
            ))}
          </div>

          <div className={`pt-2 border-t ${borderSubtle} text-[11px] ${textSecondary} space-y-1 font-sans`}>
            <div>Connection Mode: <span className={`${textPrimary} capitalize font-medium`}>{networkInfo.type}</span></div>
            {networkInfo.downlinkMbps && (
              <div>Bandwidth: <span className="text-[#c9a063] font-semibold">{networkInfo.downlinkMbps} Mbps</span></div>
            )}
            {networkInfo.rttMs && (
              <div>Latency: <span className={`${textPrimary} font-semibold`}>{networkInfo.rttMs} ms</span></div>
            )}
          </div>
        </div>

        {/* Live Mesh Feed & Comms Log */}
        <div className={`md:col-span-8 ${cardBg} p-5 rounded-2xl border flex flex-col space-y-3 font-mono transition-colors`}>
          <div className="flex items-center justify-between font-sans">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#c9a063]" />
              <span className={`text-xs font-semibold ${textPrimary}`}>Live Mesh Stream & Stakeout Feed</span>
            </div>
            <span className={`text-[11px] ${textMuted} font-mono`}>{meshMessages.length} packets received</span>
          </div>

          {/* Feed Container */}
          <div className={`flex-1 ${isDark ? 'bg-black/60 border-white/[0.06]' : 'bg-slate-50 border-slate-200'} rounded-xl p-3 border overflow-y-auto max-h-64 min-h-48 space-y-2 text-xs shadow-inner`}>
            {meshMessages.length > 0 ? (
              meshMessages.map((msg, idx) => (
                <div key={idx} className={`p-2.5 rounded-lg ${subCardBg} border space-y-1`}>
                  <div className="flex items-center justify-between text-[10px] font-sans">
                    <span className="text-[#c9a063] font-bold">{msg.sender}</span>
                    <span className={textMuted}>{msg.time}</span>
                  </div>
                  {msg.type === 'point' ? (
                    <div className="text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
                      [BROADCAST POINT] {msg.payload.pointId} | E: {msg.payload.easting?.toFixed(2)} m, N: {msg.payload.northing?.toFixed(2)} m, Elev: {msg.payload.alt} m
                    </div>
                  ) : (
                    <div className={textPrimary}>{msg.payload}</div>
                  )}
                </div>
              ))
            ) : (
              <div className={`${textMuted} italic text-center py-10`}>
                Mesh channel open. Broadcast coordinates or chat messages to crew on the same Wi-Fi / Hotspot.
              </div>
            )}
          </div>

          {/* Chat / Stakeout Input Bar */}
          <form onSubmit={handleSendChat} className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={chatText}
              onChange={e => setChatText(e.target.value)}
              placeholder="Send live instruction to party crew (e.g. Move prism 0.25m North)..."
              className={`flex-1 px-3 py-1.5 rounded-lg ${inputBg} border text-xs focus:outline-none focus:border-[#c9a063]`}
            />
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-lg bg-[#c9a063] hover:bg-[#b88f55] text-black text-xs font-semibold transition-colors flex items-center gap-1 font-sans shadow-sm"
            >
              <Send className="w-3 h-3" /> Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
