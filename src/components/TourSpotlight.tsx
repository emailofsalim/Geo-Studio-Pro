import React, { useState, useEffect } from 'react';
import { X, ArrowRight, ArrowLeft, Check, Sparkles, Compass, MapPin, Layers, Globe } from 'lucide-react';
import { AppTabId } from './Navigation';

interface TourSpotlightProps {
  isOpen: boolean;
  onClose: () => void;
  setActiveTab: (tab: AppTabId) => void;
}

export const TourSpotlight: React.FC<TourSpotlightProps> = ({ isOpen, onClose, setActiveTab }) => {
  const [stepIdx, setStepIdx] = useState(0);

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

  const tourSteps = [
    {
      title: 'Welcome to BhuNex Pro',
      desc: 'An all-in-one 100% offline geomatics, GNSS field surveyor, and cadastral mapping suite developed by Md Salim Ansari.',
      tab: 'templates' as AppTabId,
      icon: Sparkles
    },
    {
      title: '1. Verified Templates & Builder',
      desc: 'Start by downloading verified survey templates or custom-tailoring CSV columns for your exploration or cadastral project.',
      tab: 'templates' as AppTabId,
      icon: Layers
    },
    {
      title: '2. Live GNSS Cockpit & Vector Radar',
      desc: 'Access device satellite coordinates with live compass radar, 10-epoch centroid averaging, and "Go to Point" field stakeout guidance.',
      tab: 'gps' as AppTabId,
      icon: Compass
    },
    {
      title: '3. Coordinate Geodesy Engine',
      desc: 'Transform coordinates across UTM, WGS84 DMS/MGRS, Indian Grid (Everest LCC 1SP), and 2D Helmert local-to-UTM similarity fit.',
      tab: 'convert' as AppTabId,
      icon: Globe
    },
    {
      title: '4. Exploration Borehole Mapper',
      desc: 'Evaluate composite ore vs waste core-logs using mineral cutoff criteria (IBM bauxite, iron ore, coal, limestone) and generate 3D DXF & KML.',
      tab: 'bore' as AppTabId,
      icon: MapPin
    },
    {
      title: '5. Universal Format Converter',
      desc: 'Convert seamlessly between CSV, KML, AutoCAD DXF, GeoJSON, GPX, WKT, and Excel with zero data loss.',
      tab: 'studio' as AppTabId,
      icon: Layers
    }
  ];

  const current = tourSteps[stepIdx];
  const Icon = current.icon;

  const handleNext = () => {
    if (stepIdx < tourSteps.length - 1) {
      const nextIdx = stepIdx + 1;
      setStepIdx(nextIdx);
      setActiveTab(tourSteps[nextIdx].tab);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (stepIdx > 0) {
      const prevIdx = stepIdx - 1;
      setStepIdx(prevIdx);
      setActiveTab(tourSteps[prevIdx].tab);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#0f0f0f] rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-[#0a0a0a]">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-[#1a1a1a] border border-white/10 text-[#c9a063] flex items-center justify-center font-serif italic text-xs">
              {stepIdx + 1}
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
              Interactive Tour ({stepIdx + 1} of {tourSteps.length})
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <h3 className="font-serif italic text-lg text-white">
            {current.title}
          </h3>
          <p className="text-xs text-white/60 leading-relaxed font-light">
            {current.desc}
          </p>

          <div className="flex items-center gap-1.5 pt-2">
            {tourSteps.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all ${
                  i === stepIdx ? 'w-6 bg-[#c9a063]' : 'w-2 bg-white/10'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/5 bg-[#0a0a0a] flex items-center justify-between">
          <button
            onClick={handlePrev}
            disabled={stepIdx === 0}
            className="px-4 py-1.5 rounded-full text-xs font-medium text-white/60 disabled:opacity-20 hover:bg-white/5 hover:text-white flex items-center gap-1.5 transition-colors uppercase tracking-wider"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>

          <button
            onClick={handleNext}
            className="px-5 py-2 bg-[#c9a063] hover:bg-[#d6b074] text-black rounded-full text-xs font-bold transition-all shadow-lg shadow-[#c9a063]/10 flex items-center gap-1.5 uppercase tracking-widest"
          >
            {stepIdx === tourSteps.length - 1 ? 'Finish Tour' : 'Next Step'}
            {stepIdx === tourSteps.length - 1 ? <Check className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
};
