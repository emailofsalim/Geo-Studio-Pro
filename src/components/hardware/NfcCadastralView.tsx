import React, { useState, useRef } from 'react';
import {
  Cpu,
  Smartphone,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Download,
  Share2,
  Copy,
  Check
} from 'lucide-react';
import {
  isNfcSupported,
  NfcSurveyMonument,
  formatNfcMonumentRecord,
  parseNfcMonumentRecord
} from '../../lib/hardwareComms';
import { lonLatToUtm } from '../../lib/geodesy';
import { triggerHaptic } from '../../lib/haptics';
import { useIsDarkMode } from '../../hooks/useIsDarkMode';

interface NfcCadastralViewProps {
  workingZone?: string;
  currentGps?: { lat: number; lon: number; alt: number | null } | null;
  onSendToGis?: (monument: NfcSurveyMonument) => void;
}

export const NfcCadastralView: React.FC<NfcCadastralViewProps> = ({
  workingZone = '45N',
  currentGps,
  onSendToGis
}) => {
  const isDark = useIsDarkMode();
  const [nfcScanning, setNfcScanning] = useState<boolean>(false);
  const [nfcStatus, setNfcStatus] = useState<string>('Ready to tap physical NFC survey marker or RFID boundary tag');
  const [nfcLastRead, setNfcLastRead] = useState<NfcSurveyMonument | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const [nfcWriteForm, setNfcWriteForm] = useState<{
    pointId: string;
    surveyType: 'Control Point' | 'Cadastral Boundary' | 'Benchmark (TBM)' | 'Borehole Collar' | 'Mining Monument';
    altitudeM: string;
    surveyor: string;
    notes: string;
  }>({
    pointId: 'CP-01',
    surveyType: 'Control Point',
    altitudeM: currentGps?.alt ? currentGps.alt.toFixed(2) : '124.50',
    surveyor: 'Senior Geomatics Surveyor',
    notes: 'Primary Brass Geodetic Monument'
  });

  const nfcReaderRef = useRef<any>(null);

  const handleStartNfcScan = async () => {
    if (!isNfcSupported()) {
      setNfcStatus('Web NFC (NDEFReader) requires Chrome on Android with NFC hardware enabled.');
      return;
    }

    try {
      const NDEFReaderClass = (window as any).NDEFReader;
      const ndef = new NDEFReaderClass();
      nfcReaderRef.current = ndef;
      await ndef.scan();
      setNfcScanning(true);
      setNfcStatus('NFC Antenna Active: Tap phone against a survey boundary stone or RFID tag...');
      triggerHaptic([30, 20]);

      ndef.onreading = (event: any) => {
        const decoder = new TextDecoder();
        let payloadText = '';
        for (const record of event.message.records) {
          if (record.recordType === 'text') {
            payloadText += decoder.decode(record.data);
          } else if (record.recordType === 'mime' && record.mediaType === 'application/json') {
            payloadText += decoder.decode(record.data);
          }
        }

        const parsed = parseNfcMonumentRecord(payloadText);
        if (parsed) {
          setNfcLastRead(parsed);
          setNfcStatus(`Successfully read survey monument: ${parsed.pointId}`);
        } else {
          setNfcStatus(`Read raw NFC payload: ${payloadText.slice(0, 50)}...`);
        }
        triggerHaptic([50, 40, 70]);
      };

      ndef.onreadingerror = () => {
        setNfcStatus('NFC Read Error. Re-align phone antenna with the tag.');
      };
    } catch (err: any) {
      setNfcStatus(`NFC Activation error: ${err.message}`);
      setNfcScanning(false);
    }
  };

  const handleWriteNfcMonument = async () => {
    if (!isNfcSupported()) {
      setNfcStatus('Web NFC is not supported on this browser (Chrome for Android required).');
      return;
    }

    try {
      const zNum = parseInt(workingZone, 10) || 45;
      const isSouth = workingZone.endsWith('S');
      const lat = currentGps?.lat || 28.6139;
      const lon = currentGps?.lon || 77.2090;
      const utm = lonLatToUtm(lon, lat, zNum, isSouth);

      const monumentData: NfcSurveyMonument = {
        pointId: nfcWriteForm.pointId,
        surveyType: nfcWriteForm.surveyType,
        latitude: lat,
        longitude: lon,
        altitudeM: parseFloat(nfcWriteForm.altitudeM) || 0,
        utmEasting: utm.E,
        utmNorthing: utm.N,
        utmZone: workingZone,
        datum: 'WGS84',
        surveyor: nfcWriteForm.surveyor,
        timestamp: new Date().toISOString(),
        notes: nfcWriteForm.notes
      };

      const payload = formatNfcMonumentRecord(monumentData);
      setNfcStatus(`Hold phone against NFC tag to write monument "${monumentData.pointId}"...`);

      const NDEFReaderClass = (window as any).NDEFReader;
      const ndef = new NDEFReaderClass();
      await ndef.write({
        records: [
          { recordType: 'text', data: payload },
          { recordType: 'mime', mediaType: 'application/json', data: new TextEncoder().encode(payload) }
        ]
      });

      setNfcStatus(`Successfully wrote georeferenced survey tag for ${monumentData.pointId}!`);
      setNfcLastRead(monumentData);
      triggerHaptic([40, 20, 60, 20, 80]);
    } catch (err: any) {
      setNfcStatus(`NFC write failed: ${err.message}`);
    }
  };

  const handleSimulateNfcRead = () => {
    const lat = currentGps?.lat || 28.613939;
    const lon = currentGps?.lon || 77.209021;
    const utm = lonLatToUtm(lon, lat, 45, false);
    const mockMonument: NfcSurveyMonument = {
      pointId: 'CP-TBM-408',
      surveyType: 'Benchmark (TBM)',
      latitude: lat,
      longitude: lon,
      altitudeM: 218.45,
      utmEasting: utm.E,
      utmNorthing: utm.N,
      utmZone: '45N',
      datum: 'WGS84',
      surveyor: 'Senior Geomatics Surveyor',
      timestamp: new Date().toISOString(),
      notes: 'Brass disk embedded in concrete bridge abutment. Order 1 Leveling.'
    };
    setNfcLastRead(mockMonument);
    setNfcStatus(`Simulated NFC tap: Read ${mockMonument.pointId}`);
    triggerHaptic([40, 30, 60]);
  };

  const cardBg = isDark ? 'bg-[#111111] border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm';
  const subCardBg = isDark ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-slate-50 border-slate-200/80';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textSecondary = isDark ? 'text-white/50' : 'text-slate-500';
  const textMuted = isDark ? 'text-white/40' : 'text-slate-400';
  const btnSecondary = isDark ? 'bg-white/[0.04] hover:bg-white/[0.08] text-white/80 hover:text-white border-white/[0.08]' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200';
  const inputBg = isDark ? 'bg-white/[0.04] border-white/[0.08] text-white' : 'bg-slate-50 border-slate-200 text-slate-900';

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className={`p-5 ${cardBg} rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors`}>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[#c9a063]" />
            <h3 className={`text-sm font-semibold ${textPrimary}`}>NFC Cadastral Survey Monument Interface</h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#c9a063]/10 text-[#c9a063] border border-[#c9a063]/25">
              NDEF RFID / NFC
            </span>
          </div>
          <p className={`text-xs ${textSecondary}`}>{nfcStatus}</p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={handleStartNfcScan}
            className="px-4 py-2 rounded-lg bg-[#c9a063] hover:bg-[#b88f55] text-black text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Smartphone className="w-3.5 h-3.5" /> Tap / Scan NFC Monument
          </button>
          <button
            onClick={handleSimulateNfcRead}
            className={`px-3 py-2 rounded-lg ${btnSecondary} text-xs font-medium transition-colors border flex items-center gap-1.5`}
          >
            <Radio className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" /> Simulate Tag Tap
          </button>
        </div>
      </div>

      {/* Grid: Last Read Monument Record & Programmer Form */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* Read Monument Card */}
        <div className={`md:col-span-6 ${cardBg} p-5 rounded-2xl border space-y-4 font-mono transition-colors`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold ${textPrimary} font-sans`}>Decoded Tag Information</span>
            {nfcLastRead && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(nfcLastRead, null, 2));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className={`text-[11px] ${textSecondary} hover:${textPrimary} flex items-center gap-1`}
              >
                {copied ? <Check className="w-3 h-3 text-emerald-500 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied JSON' : 'Copy JSON'}</span>
              </button>
            )}
          </div>

          {nfcLastRead ? (
            <div className="space-y-3">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{nfcLastRead.pointId}</div>
                  <div className="text-[10px] text-emerald-700/80 dark:text-emerald-200/70">{nfcLastRead.surveyType}</div>
                </div>
                <div className={`text-right text-[11px] ${textSecondary}`}>
                  <div>Datum: {nfcLastRead.datum}</div>
                  <div>Zone: {nfcLastRead.utmZone}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className={`p-2.5 ${subCardBg} border rounded-lg`}>
                  <div className={`text-[10px] ${textMuted}`}>UTM Easting</div>
                  <div className={`text-xs font-bold ${textPrimary} mt-0.5`}>{nfcLastRead.utmEasting.toFixed(3)} mE</div>
                </div>
                <div className={`p-2.5 ${subCardBg} border rounded-lg`}>
                  <div className={`text-[10px] ${textMuted}`}>UTM Northing</div>
                  <div className={`text-xs font-bold ${textPrimary} mt-0.5`}>{nfcLastRead.utmNorthing.toFixed(3)} mN</div>
                </div>
                <div className={`p-2.5 ${subCardBg} border rounded-lg`}>
                  <div className={`text-[10px] ${textMuted}`}>Elevation (RL)</div>
                  <div className="text-xs font-bold text-[#c9a063] mt-0.5">{nfcLastRead.altitudeM.toFixed(3)} m</div>
                </div>
                <div className={`p-2.5 ${subCardBg} border rounded-lg`}>
                  <div className={`text-[10px] ${textMuted}`}>Surveyor</div>
                  <div className={`text-xs font-bold ${textPrimary} mt-0.5 truncate`}>{nfcLastRead.surveyor}</div>
                </div>
              </div>

              <div className={`p-2.5 ${subCardBg} border rounded-lg text-xs`}>
                <div className={`text-[10px] ${textMuted}`}>Field Notes / Monography</div>
                <div className={`text-xs ${textPrimary} mt-1`}>{nfcLastRead.notes || 'No notes attached.'}</div>
              </div>

              {onSendToGis && (
                <button
                  onClick={() => onSendToGis(nfcLastRead)}
                  className={`w-full py-2 rounded-lg ${btnSecondary} text-xs font-medium transition-colors flex items-center justify-center gap-1.5 border`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" /> Send to GIS Map Layer
                </button>
              )}
            </div>
          ) : (
            <div className={`p-8 text-center border border-dashed ${isDark ? 'border-white/10' : 'border-slate-300'} rounded-xl space-y-2`}>
              <Cpu className={`w-8 h-8 ${textMuted} mx-auto`} />
              <div className={`text-xs ${textMuted}`}>No NFC Survey Marker scanned yet.</div>
            </div>
          )}
        </div>

        {/* Program / Write Tag Form */}
        <div className={`md:col-span-6 ${cardBg} p-5 rounded-2xl border space-y-3 font-mono transition-colors`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold ${textPrimary} font-sans`}>Program On-Site NFC Monument</span>
            <Upload className="w-4 h-4 text-[#c9a063]" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={`text-[10px] ${textMuted} block mb-1`}>Monument ID</label>
              <input
                type="text"
                value={nfcWriteForm.pointId}
                onChange={e => setNfcWriteForm({ ...nfcWriteForm, pointId: e.target.value })}
                className={`w-full px-2.5 py-1.5 rounded-lg ${inputBg} border text-xs focus:outline-none focus:border-[#c9a063]`}
              />
            </div>
            <div>
              <label className={`text-[10px] ${textMuted} block mb-1`}>Survey Type</label>
              <select
                value={nfcWriteForm.surveyType}
                onChange={e => setNfcWriteForm({ ...nfcWriteForm, surveyType: e.target.value as any })}
                className={`w-full px-2.5 py-1.5 rounded-lg ${
                  isDark ? 'bg-[#161616] border-white/[0.08] text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                } border text-xs focus:outline-none focus:border-[#c9a063]`}
              >
                <option value="Control Point">Control Point</option>
                <option value="Cadastral Boundary">Cadastral Boundary</option>
                <option value="Benchmark (TBM)">Benchmark (TBM)</option>
                <option value="Borehole Collar">Borehole Collar</option>
                <option value="Mining Monument">Mining Monument</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={`text-[10px] ${textMuted} block mb-1`}>Elevation / RL (m)</label>
              <input
                type="text"
                value={nfcWriteForm.altitudeM}
                onChange={e => setNfcWriteForm({ ...nfcWriteForm, altitudeM: e.target.value })}
                className={`w-full px-2.5 py-1.5 rounded-lg ${inputBg} border text-xs focus:outline-none focus:border-[#c9a063]`}
              />
            </div>
            <div>
              <label className={`text-[10px] ${textMuted} block mb-1`}>Surveyor Name / ID</label>
              <input
                type="text"
                value={nfcWriteForm.surveyor}
                onChange={e => setNfcWriteForm({ ...nfcWriteForm, surveyor: e.target.value })}
                className={`w-full px-2.5 py-1.5 rounded-lg ${inputBg} border text-xs focus:outline-none focus:border-[#c9a063]`}
              />
            </div>
          </div>

          <div>
            <label className={`text-[10px] ${textMuted} block mb-1`}>Field Description / Monument Reference</label>
            <input
              type="text"
              value={nfcWriteForm.notes}
              onChange={e => setNfcWriteForm({ ...nfcWriteForm, notes: e.target.value })}
              className={`w-full px-2.5 py-1.5 rounded-lg ${inputBg} border text-xs focus:outline-none focus:border-[#c9a063]`}
            />
          </div>

          <button
            onClick={handleWriteNfcMonument}
            className="w-full py-2.5 rounded-lg bg-[#c9a063] hover:bg-[#b88f55] text-black text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 mt-2 shadow-sm"
          >
            <Upload className="w-3.5 h-3.5" /> Write & Burn to NFC Monument Tag
          </button>
        </div>
      </div>
    </div>
  );
};
