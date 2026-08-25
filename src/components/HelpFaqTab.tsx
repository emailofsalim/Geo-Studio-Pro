import React, { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp, BookOpen, ShieldCheck, Globe, Cpu } from 'lucide-react';

export const HelpFaqTab: React.FC = () => {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const faqs = [
    {
      q: 'Does Geo Studio require an active internet connection to work in remote field sites?',
      a: 'No. Geo Studio is architected with a 100% offline-first engine. All coordinate conversions (UTM, Indian Grid, Bursa-Wolf 7-parameter), CAD DXF generation, KML rendering, borehole core log composite calculations, and GPS radar rendering run entirely in your local browser memory with zero server telemetry.'
    },
    {
      q: 'How do I determine the correct UTM zone for my project in India?',
      a: 'India spans UTM zones 42N (Western Gujarat) to 46N (Arunachal Pradesh / Eastern Assam). Central and Eastern mining hubs (Jharkhand, Odisha, West Bengal, Bihar, Chhattisgarh) primarily reside in UTM Zone 45N (central meridian 87°E) or Zone 44N (central meridian 81°E). You can also click the "Auto Zone" button on the Coordinate Converter.'
    },
    {
      q: 'How does the 10-Epoch GNSS Averaging feature improve GPS accuracy?',
      a: 'Consumer smartphone and tablet GPS chips experience atmospheric ionospheric jitter and multipath interference. By capturing 10 distinct timestamped epochs and computing their coordinate centroid alongside 2D standard deviation (σ2D), random error is substantially filtered out, delivering much tighter waypoint repeatability in open field conditions.'
    },
    {
      q: 'What is the Indian Grid (Kalianpur 1975) LCC system?',
      a: 'The Survey of India employs Lambert Conformal Conic (LCC 1SP) projections referenced to the Everest 1830 ellipsoid with central origin at Kalianpur. Geo Studio includes verified mathematical parameters for Indian Zones 0, I, IIa, IIb, IIIa, IIIb, IVa, and IVb (EPSG:24375 to 24383), enabling seamless cross-conversion with modern WGS84 GPS measurements.'
    },
    {
      q: 'How does the Borehole Compositor calculate ore vs. waste intercepts?',
      a: 'The engine evaluates downhole intervals against mineral-specific thresholds (e.g. IBM 2018 bauxite cutoffs: Al2O3 ≥ 40.0% and SiO2 ≤ 5.0%). Intervals satisfying the cutoff are classified as Ore, while failing intervals become Waste/Overburden. The engine computes cumulative thickness, stripping ratio (Waste:Ore), and length-weighted composite assay averages.'
    },
    {
      q: 'How do Regional Land Units work (Bigha, Katha, Dhur, Dismil)?',
      a: 'In India, traditional revenue records express parcel areas in local units. In Bihar and Jharkhand, 1 Bigha equals 20 Katha (27,225 sq ft = 2,529.29 m²), and 1 Dismil equals 435.6 sq ft. In West Bengal and Assam, 1 Bigha equals 14,400 sq ft (1,337.80 m²). Geo Studio supports automatic conversion into these regional units simultaneously with standard Hectares and Acres.'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 shadow-2xl space-y-6">
        <div>
          <span className="text-[10px] uppercase tracking-[0.2em] text-[#c9a063] font-mono">Documentation</span>
          <h3 className="font-serif italic text-2xl text-white mt-1">
            Frequently Asked Questions & Field Engineering Guide
          </h3>
          <p className="text-xs text-white/50 max-w-2xl mt-1 font-light leading-relaxed">
            Authoritative technical explanations for geodesy, GNSS accuracy, cadastral revenue mapping, and borehole exploration.
          </p>
        </div>

        <div className="divide-y divide-white/5">
          {faqs.map((f, idx) => (
            <div key={idx} className="py-4.5">
              <button
                onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
                className="w-full flex items-center justify-between text-left gap-4 group"
              >
                <span className="font-serif italic text-base text-white/90 group-hover:text-[#c9a063] transition-colors">
                  {f.q}
                </span>
                {openIdx === idx ? (
                  <ChevronUp className="w-4 h-4 text-[#c9a063] shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-white/40 shrink-0" />
                )}
              </button>
              {openIdx === idx && (
                <p className="mt-3 text-xs text-white/60 leading-relaxed font-light font-sans max-w-3xl">
                  {f.a}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Geodetic Reference Card */}
      <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 shadow-2xl space-y-4">
        <div>
          <span className="text-[10px] uppercase tracking-[0.2em] text-[#c9a063] font-mono">Geodesy Reference</span>
          <h4 className="font-serif italic text-lg text-white mt-1">
            Standard Reference Ellipsoids & Transformation Constants
          </h4>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#141414] text-white/60 font-medium border-b border-white/5 text-[10px] uppercase tracking-wider">
              <tr>
                <th className="p-3">Ellipsoid</th>
                <th className="p-3">Semi-Major Axis (a)</th>
                <th className="p-3">Flattening (1/f)</th>
                <th className="p-3">Primary Application</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono text-white/80">
              <tr>
                <td className="p-3 font-medium font-serif italic text-sm text-white">WGS 84 (EPSG:4326)</td>
                <td className="p-3 text-[#c9a063]">6,378,137.0 m</td>
                <td className="p-3">298.257223563</td>
                <td className="p-3 font-sans text-white/50 text-xs">Global GNSS, Google Earth, UTM Projections</td>
              </tr>
              <tr>
                <td className="p-3 font-medium font-serif italic text-sm text-white">GRS 80</td>
                <td className="p-3 text-[#c9a063]">6,378,137.0 m</td>
                <td className="p-3">298.257222101</td>
                <td className="p-3 font-sans text-white/50 text-xs">Modern Geodetic Reference System</td>
              </tr>
              <tr>
                <td className="p-3 font-medium font-serif italic text-sm text-white">Everest 1830 (India)</td>
                <td className="p-3 text-[#c9a063]">6,377,276.345 m</td>
                <td className="p-3">300.8017</td>
                <td className="p-3 font-sans text-white/50 text-xs">Survey of India Toposheets & Revenue Khasra Maps</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
