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
  const [chatText, setChatText] = useState<string>('');

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    onSendMessage('chat', chatText.trim());
    setChatText('');
  };

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className="p-5 bg-[#111111] rounded-2xl border border-white/[0.08] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Wi-Fi Direct & Hotspot Field P2P Mesh</h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              LOCAL MESH ACTIVE
            </span>
          </div>
          <p className="text-xs text-white/50">
            Direct peer-to-peer data sync between field surveyor rovers, party chiefs, and rodmen without requiring cellular internet.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2 text-xs font-mono">
          <div className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/70">
            Node ID: <span className="text-[#c9a063] font-bold">{meshPeerId}</span>
          </div>
          <button
            onClick={onShareGpsPoint}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors flex items-center gap-1.5 font-sans shadow-lg shadow-emerald-900/30"
          >
            <MapPin className="w-3.5 h-3.5" /> Broadcast Live Point
          </button>
        </div>
      </div>

      {/* Grid: Peers on Local Network & Live Mesh Feed */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* Active Local Peers Card */}
        <div className="md:col-span-4 bg-[#111111] p-5 rounded-2xl border border-white/[0.08] space-y-4 font-mono">
          <div className="flex items-center justify-between font-sans">
            <span className="text-xs font-semibold text-white">Crew Nodes in Hotspot Range</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>

          <div className="space-y-2">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-300 font-bold">{meshPeerId} (This Device)</span>
              </div>
              <span className="text-[10px] text-emerald-200/60 font-sans">Leader</span>
            </div>

            {activePeers.map((peer, idx) => (
              <div key={idx} className="p-2.5 bg-white/[0.02] border border-white/[0.06] rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-400" />
                  <span className="text-white/80">{peer}</span>
                </div>
                <span className="text-[10px] text-white/40">Connected</span>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-white/[0.06] text-[11px] text-white/50 space-y-1 font-sans">
            <div>Connection Mode: <span className="text-white capitalize">{networkInfo.type}</span></div>
            {networkInfo.downlinkMbps && (
              <div>Bandwidth: <span className="text-[#c9a063]">{networkInfo.downlinkMbps} Mbps</span></div>
            )}
            {networkInfo.rttMs && (
              <div>Latency: <span className="text-white">{networkInfo.rttMs} ms</span></div>
            )}
          </div>
        </div>

        {/* Live Mesh Feed & Comms Log */}
        <div className="md:col-span-8 bg-[#111111] p-5 rounded-2xl border border-white/[0.08] flex flex-col space-y-3 font-mono">
          <div className="flex items-center justify-between font-sans">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#c9a063]" />
              <span className="text-xs font-semibold text-white">Live Mesh Stream & Stakeout Feed</span>
            </div>
            <span className="text-[11px] text-white/40 font-mono">{meshMessages.length} packets received</span>
          </div>

          {/* Feed Container */}
          <div className="flex-1 bg-black/60 rounded-xl p-3 border border-white/[0.06] overflow-y-auto max-h-64 min-h-48 space-y-2 text-xs">
            {meshMessages.length > 0 ? (
              meshMessages.map((msg, idx) => (
                <div key={idx} className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-white/40 font-sans">
                    <span className="text-[#c9a063] font-bold">{msg.sender}</span>
                    <span>{msg.time}</span>
                  </div>
                  {msg.type === 'point' ? (
                    <div className="text-emerald-400 text-xs">
                      [BROADCAST POINT] {msg.payload.pointId} | E: {msg.payload.easting?.toFixed(2)} m, N: {msg.payload.northing?.toFixed(2)} m, Elev: {msg.payload.alt} m
                    </div>
                  ) : (
                    <div className="text-white/80">{msg.payload}</div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-white/30 italic text-center py-10">
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
              className="flex-1 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-[#c9a063]"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-[#c9a063] hover:bg-[#d6b074] text-black text-xs font-semibold transition-colors flex items-center gap-1 font-sans"
            >
              <Send className="w-3 h-3" /> Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
