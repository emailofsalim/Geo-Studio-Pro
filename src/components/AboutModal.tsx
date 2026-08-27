import React, { useEffect } from 'react';
import { X, Mail, User, ShieldCheck, Globe, Compass, ExternalLink, Code2, Heart, Sparkles } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
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

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#0f0f0f] rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col max-h-[90vh] cursor-default"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between bg-[#0a0a0a]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden border border-[#478bc7]/40 bg-[#0d2640] shadow-sm flex items-center justify-center p-0.5">
              <img
                src="/icon-192.svg"
                alt="BhuNex Logo"
                className="w-full h-full object-contain rounded-lg"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <h3 className="font-serif italic text-lg text-white">About BhuNex</h3>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#8ecbf8] font-mono">Geomatics & Cadastral Suite</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          {/* Main Hero Summary */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-[#141414] to-[#181818] border border-white/5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white font-serif italic">BhuNex Pro</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#c9a063]/20 text-[#c9a063] border border-[#c9a063]/30">v2.4 Production</span>
            </div>
            <p className="text-xs text-white/70 leading-relaxed font-light">
              High-precision, 100% offline geomatics, geodesy, cadastral mapping, borehole logging, and coordinate transformation workstation suite for surveyors and GIS professionals.
            </p>
          </div>

          {/* Developer & Feedback Information */}
          <div className="space-y-3">
            <div className="text-[10px] font-semibold text-white/40 uppercase tracking-widest font-mono">
              Engineering & Support
            </div>

            {/* Developer Card */}
            <div className="p-4 rounded-xl bg-[#141414] border border-white/5 flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-[#1e1e1e] border border-white/10 flex items-center justify-center text-[#c9a063] shrink-0">
                <User className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="text-[11px] text-white/40 uppercase font-mono tracking-wider">Lead Developer</div>
                <div className="text-sm font-semibold text-white font-serif">Md Salim Ansari</div>
                <div className="text-[11px] text-[#c9a063]/80 font-mono mt-0.5">Geomatics & Spatial Software Engineering</div>
              </div>
            </div>

            {/* Feedback & Contact Card */}
            <div className="p-4 rounded-xl bg-[#141414] border border-white/5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-full bg-[#1e1e1e] border border-white/10 flex items-center justify-center text-[#c9a063] shrink-0">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] text-white/40 uppercase font-mono tracking-wider">Feedback & Queries</div>
                  <a
                    href="mailto:emailofsalim@gmail.com?subject=BhuNex%20Feedback"
                    className="text-xs sm:text-sm font-mono text-[#c9a063] hover:underline flex items-center gap-1.5"
                  >
                    <span>emailofsalim@gmail.com</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
              <a
                href="mailto:emailofsalim@gmail.com?subject=BhuNex%20Feedback"
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-medium transition-colors shrink-0"
              >
                Send Email
              </a>
            </div>
          </div>

          {/* Key Architectural Highlights */}
          <div className="space-y-2.5">
            <div className="text-[10px] font-semibold text-white/40 uppercase tracking-widest font-mono">
              Architecture & Security
            </div>
            <div className="p-4 bg-white/[0.02] rounded-xl border border-white/5 space-y-2 text-xs text-white/60 font-light leading-relaxed">
              <div className="flex items-center gap-2 text-white font-medium">
                <ShieldCheck className="w-4 h-4 text-[#c9a063]" />
                <span>100% Client-Side In-Browser Computation</span>
              </div>
              <p>
                All coordinate reprojections, Cadastral BhuNaksha georeferencing, borehole compositing, and survey measurements run entirely in your local browser sandbox. No field data is sent to external servers.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/5 bg-[#0a0a0a] flex items-center justify-between">
          <span className="text-[11px] text-white/40 font-mono">
            Developed by Md Salim Ansari
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-[#c9a063] hover:bg-[#d6b074] text-black text-xs font-semibold uppercase tracking-wider transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
