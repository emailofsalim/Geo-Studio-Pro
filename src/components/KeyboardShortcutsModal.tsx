import React, { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose }) => {
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

  const shortcuts = [
    { keys: ['Ctrl', 'K'], desc: 'Open Command Palette / Quick Search' },
    { keys: ['Ctrl', '1 – 9'], desc: 'Directly switch tools (Templates, GPS, Converter, Calculator...)' },
    { keys: ['Ctrl', 'Enter'], desc: 'Trigger primary Generate / Convert action on current active tool' },
    { keys: ['Ctrl', 'R'], desc: 'Reset current active tool view' },
    { keys: ['Ctrl', '?'], desc: 'Open this Keyboard Shortcuts cheat sheet' },
    { keys: ['Esc'], desc: 'Close any open modal, dialog, or search overlay' },
    { keys: ['Calculator Keys'], desc: 'Keyboard input supported in Calculator (Enter =, Esc Clear, Backspace Delete)' }
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#0f0f0f] rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col cursor-default"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between bg-[#0a0a0a]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#1a1a1a] border border-white/10 text-[#c9a063] flex items-center justify-center font-serif italic text-sm">
              ⌘
            </div>
            <div>
              <h3 className="font-serif italic text-lg text-white">Keyboard Shortcuts</h3>
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">Hotkeys & Productivity Acceleration</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 divide-y divide-white/5">
          {shortcuts.map((sc, idx) => (
            <div key={idx} className="py-3 flex items-center justify-between gap-4">
              <span className="text-xs text-white/70 font-light">
                {sc.desc}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {sc.keys.map((k, kIdx) => (
                  <kbd
                    key={kIdx}
                    className="px-2.5 py-1 bg-white/5 text-white/80 rounded-lg border border-white/10 font-mono text-[11px] font-medium shadow-xs"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-white/5 bg-[#0a0a0a] flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-full bg-[#c9a063] hover:bg-[#d6b074] text-black text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-[#c9a063]/10"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
