import React, { useState } from 'react';
import { BookOpen, CheckCircle, ArrowRight, Play, Layers, Compass, MapPin } from 'lucide-react';
import { AppTabId } from './Navigation';

interface TutorialTabProps {
  setActiveTab: (tab: AppTabId) => void;
}

export const TutorialTab: React.FC<TutorialTabProps> = ({ setActiveTab }) => {
  const [activeCourse, setActiveCourse] = useState<number>(0);

  const courses = [
    {
      title: 'Field GPS Survey to AutoCAD DXF Production Flow',
      level: 'Essential',
      time: '6 mins',
      steps: [
        {
          title: '1. Establish Working UTM Zone',
          desc: 'Open Settings and ensure your working zone is set (e.g. UTM 45N for Eastern India / Jharkhand / Odisha).',
          targetTab: 'convert' as AppTabId
        },
        {
          title: '2. Capture GNSS Waypoints with Centroid Averaging',
          desc: 'Switch to GPS Field Surveyor, connect to satellite fix, tap "Average 10 Epochs" on boundary pillars to lock sub-metre repeatability, and save with feature codes.',
          targetTab: 'gps' as AppTabId
        },
        {
          title: '3. Export 3D AutoCAD DXF & Vector Check',
          desc: 'Click "Export DXF" to download an instant AutoCAD drawing file containing categorized survey layers and point elevations.',
          targetTab: 'gps' as AppTabId
        }
      ]
    },
    {
      title: 'Exploration Borehole Composite Resource Evaluation',
      level: 'Advanced',
      time: '8 mins',
      steps: [
        {
          title: '1. Download Verified Borehole Template',
          desc: 'Go to Home & Templates and download the verified Borehole Template CSV.',
          targetTab: 'templates' as AppTabId
        },
        {
          title: '2. Select IBM Cutoff Profile',
          desc: 'Navigate to Borehole Mapper, pick your commodity (e.g. Bauxite, Iron Ore, Coal, Limestone), and verify cutoff thresholds.',
          targetTab: 'bore' as AppTabId
        },
        {
          title: '3. Generate 3D Core Logs & Stripping Ratio',
          desc: 'View real-time ore vs waste intervals, stripping ratio (W:O), and export 3D KML cylinders for Google Earth exploration visualization.',
          targetTab: 'bore' as AppTabId
        }
      ]
    },
    {
      title: 'Khasra Revenue Land Parcel Acquisition',
      level: 'Intermediate',
      time: '5 mins',
      steps: [
        {
          title: '1. Configure Regional Land Units',
          desc: 'Select your state preset (Bihar/Jharkhand, West Bengal, Assam, UP, or Custom Bigha/Katha).',
          targetTab: 'templates' as AppTabId
        },
        {
          title: '2. Map Revenue Parcels',
          desc: 'In Cadastral Mapper, enter plot vertices or upload CSV to compute exact parcel boundaries and revenue areas.',
          targetTab: 'cad' as AppTabId
        },
        {
          title: '3. Export Revenue Land Schedule Workbook',
          desc: 'Generate ready-to-sign Excel Land Schedule with owner records, khasra numbers, and state-specific bigha/katha breakdowns.',
          targetTab: 'cad' as AppTabId
        }
      ]
    }
  ];

  const current = courses[activeCourse];

  return (
    <div className="space-y-6">
      {/* Tutorial Header */}
      <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 shadow-2xl space-y-6">
        <div>
          <span className="text-[10px] uppercase tracking-[0.2em] text-[#c9a063] font-mono">Curriculum</span>
          <h3 className="font-serif italic text-2xl text-white mt-1">
            Field Engineering Tutorials & Walkthroughs
          </h3>
          <p className="text-xs text-white/50 max-w-2xl mt-1 font-light leading-relaxed">
            Step-by-step masterclasses for high-precision mining geodesy, cadastral acquisition, and borehole resource evaluation.
          </p>
        </div>

        {/* Course Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {courses.map((c, idx) => (
            <button
              key={idx}
              onClick={() => setActiveCourse(idx)}
              className={`p-5 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                activeCourse === idx
                  ? 'border-[#c9a063] bg-[#141414] shadow-lg shadow-[#c9a063]/5'
                  : 'border-white/5 hover:border-white/15 bg-[#0a0a0a]'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider">
                  <span className="px-2.5 py-0.5 rounded-full font-mono font-medium bg-[#c9a063]/10 text-[#c9a063] border border-[#c9a063]/30">
                    {c.level}
                  </span>
                  <span className="text-white/40 font-mono">{c.time}</span>
                </div>
                <h4 className="font-serif italic text-base text-white leading-snug">
                  {c.title}
                </h4>
              </div>

              <span className="text-xs font-semibold text-[#c9a063] mt-6 flex items-center gap-1.5 uppercase tracking-wider">
                View Steps <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Selected Course Steps */}
      <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 shadow-2xl space-y-6">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div>
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#c9a063] font-mono">Module Content</span>
            <h4 className="font-serif italic text-xl text-white mt-1">
              {current.title}
            </h4>
          </div>
          <span className="text-xs font-mono text-white/40">{current.steps.length} Steps</span>
        </div>

        <div className="space-y-4">
          {current.steps.map((st, idx) => (
            <div
              key={idx}
              className="p-5 rounded-xl bg-[#141414] border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all hover:border-white/10"
            >
              <div className="space-y-1.5 max-w-xl">
                <h5 className="font-serif italic text-base text-white">{st.title}</h5>
                <p className="text-xs text-white/50 leading-relaxed font-light font-sans">{st.desc}</p>
              </div>

              <button
                onClick={() => setActiveTab(st.targetTab)}
                className="px-5 py-2.5 bg-[#c9a063] hover:bg-[#d6b074] text-black rounded-full text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-[#c9a063]/10 shrink-0 flex items-center gap-1.5"
              >
                Launch Tool <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
