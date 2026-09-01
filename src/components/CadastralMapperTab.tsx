import React, { useState, useMemo } from 'react';
import {
  Layers2,
  Upload,
  Download,
  FileSpreadsheet,
  Plus,
  Trash2,
  CheckCircle2,
  Eye,
  FileText,
  Printer,
  Sparkles,
  Sliders,
  Check,
  Search,
  ShieldCheck,
  User,
  Hash,
  MapPin
} from 'lucide-react';
import { CadastralParcel, CadastralProfile, GeoFeature } from '../types';
import { polygonAreaPerimeter, formatAreaAllUnits, lonLatToUtm } from '../lib/geodesy';
import {
  parseCSV,
  stripBOM,
  toCSVtext,
  csvEnc,
  kmlBuild,
  dxfBuild,
  buildExcelZip,
  geoJsonBuild,
  buildShapefileZip,
  extractAllFeaturesFromZip
} from '../lib/formats';
import { downloadBlob } from '../lib/zip';
import { VectorRadarMap } from './VectorRadarMap';
import { deduplicateCadastralParcels } from '../lib/deduplication';
import { useToast } from '../context/ToastContext';
import { parseImportFile } from '../lib/parseClient';

export const CAD_PRESETS: Record<string, CadastralProfile> = {
  jharkhand: {
    name: 'Jharkhand (CLR / Revenue)',
    accent: '#c9a063',
    areaUnit: 'ha',
    fields: [
      { key: 'Village', label: 'Village / Mouza' },
      { key: 'Thana', label: 'Thana' },
      { key: 'ThanaNo', label: 'Thana No' },
      { key: 'District', label: 'District' },
      { key: 'State', label: 'State' },
      { key: 'Khata', label: 'Khata No' },
      { key: 'Part_Whole', label: 'Part / Whole' },
      { key: 'Land_Class', label: 'Land Classification' },
      { key: 'Owner', label: 'Owner / Raiyat Name' },
      { key: 'Ownership', label: 'Ownership Type' },
      { key: 'Lease', label: 'Lease / Project' },
      { key: 'Remarks', label: 'Remarks / Jamabandi' }
    ]
  },
  bihar: {
    name: 'Bihar Revenue Land Records',
    accent: '#38bdf8',
    areaUnit: 'ha',
    fields: [
      { key: 'Village', label: 'Mauza Name' },
      { key: 'Thana', label: 'Anchal' },
      { key: 'ThanaNo', label: 'Thana Number' },
      { key: 'District', label: 'District' },
      { key: 'Khata', label: 'Khata Khesra' },
      { key: 'Land_Class', label: 'Kisamad / Land Class' },
      { key: 'Owner', label: 'Raiyat / Jamabandi Holder' },
      { key: 'Ownership', label: 'Lagaan Status' },
      { key: 'Lease', label: 'Acquisition Project' },
      { key: 'Remarks', label: 'Remarks' }
    ]
  },
  revenue: {
    name: 'Survey & Settlement (Sub-division)',
    accent: '#4ade80',
    areaUnit: 'acre',
    fields: [
      { key: 'SurveyNo', label: 'Survey Number' },
      { key: 'SubDiv', label: 'Sub-division Number' },
      { key: 'Owner', label: 'Pattadar / Holder' },
      { key: 'Village', label: 'Village / Revenue Ward' },
      { key: 'Mandal', label: 'Mandal / Taluk' },
      { key: 'District', label: 'District' },
      { key: 'Land_Class', label: 'Classification' },
      { key: 'Lease', label: 'Acquisition Scheme' },
      { key: 'Remarks', label: 'Field Remarks' }
    ]
  },
  generic: {
    name: 'Generic Cadastre & GIS Parcels',
    accent: '#a78bfa',
    areaUnit: 'ha',
    fields: [
      { key: 'Owner', label: 'Owner / Entity' },
      { key: 'Khata', label: 'Khata / Title ID' },
      { key: 'Land_Class', label: 'Zoning / Land Use' },
      { key: 'Village', label: 'Locality' },
      { key: 'District', label: 'District' },
      { key: 'State', label: 'State / Region' },
      { key: 'Lease', label: 'Project / Scheme' },
      { key: 'Remarks', label: 'Notes' }
    ]
  }
};

interface CadastralMapperTabProps {
  workingZone: string;
  localLandUnitPreset: string;
  customBighaM2: number;
  customKathaPerBigha: number;
}

export const CadastralMapperTab: React.FC<CadastralMapperTabProps> = ({
  workingZone,
  localLandUnitPreset,
  customBighaM2,
  customKathaPerBigha
}) => {
  const [selectedProfileKey, setSelectedProfileKey] = useState<string>('jharkhand');
  const [profile, setProfile] = useState<CadastralProfile>(CAD_PRESETS.jharkhand);

  // Loaded Geometry Polygons State
  const [geometryLoadedName, setGeometryLoadedName] = useState<string | null>(null);
  const [landRecordsLoadedName, setLandRecordsLoadedName] = useState<string | null>(null);

  const [parcels, setParcels] = useState<CadastralParcel[]>([
    {
      khasra: '104/1',
      village: 'Rampur Mouza',
      mouza: 'Thana No. 142',
      sheet: 'Sheet-01',
      owner: 'Rameshwar Mahato & Co-Ryots',
      tenant: 'Self Cultivation',
      status: 'Dhani 1 (Prime Agricultural)',
      pts: [
        { E: 254800, N: 2605200 },
        { E: 255000, N: 2605250 },
        { E: 255050, N: 2605050 },
        { E: 254850, N: 2605000 }
      ],
      areaM2: 44375,
      areaHa: 4.4375,
      areaAcres: 10.965
    },
    {
      khasra: '104/2',
      village: 'Rampur Mouza',
      mouza: 'Thana No. 142',
      sheet: 'Sheet-01',
      owner: 'Sukhram Oraon',
      tenant: 'Self Cultivation',
      status: 'Tar / Tanr (Upland)',
      pts: [
        { E: 255000, N: 2605250 },
        { E: 255250, N: 2605300 },
        { E: 255300, N: 2605100 },
        { E: 255050, N: 2605050 }
      ],
      areaM2: 50625,
      areaHa: 5.0625,
      areaAcres: 12.509
    },
    {
      khasra: '105',
      village: 'Rampur Mouza',
      mouza: 'Thana No. 142',
      sheet: 'Sheet-01',
      owner: 'Gram Panchayat Gair Mazarua Aam',
      tenant: 'Public Common Pond',
      status: 'Pond / Waterbody',
      pts: [
        { E: 254850, N: 2605000 },
        { E: 255050, N: 2605050 },
        { E: 255020, N: 2604850 },
        { E: 254820, N: 2604820 }
      ],
      areaM2: 43200,
      areaHa: 4.32,
      areaAcres: 10.675
    }
  ]);

  const [landRecords, setLandRecords] = useState<Record<string, any>>({
    '104/1': {
      Village: 'Rampur Mouza',
      Thana: 'Kisko',
      ThanaNo: '142',
      District: 'Lohardaga',
      State: 'Jharkhand',
      Khata: '28',
      Part_Whole: 'Part',
      Land_Class: 'Dhani 1 (Prime Agricultural)',
      Owner: 'Rameshwar Mahato & Co-Ryots',
      Ownership: 'Raiyati Private',
      Lease: 'Pakhar Bauxite Mines',
      Remarks: 'Jamabandi verified'
    },
    '104/2': {
      Village: 'Rampur Mouza',
      Thana: 'Kisko',
      ThanaNo: '142',
      District: 'Lohardaga',
      State: 'Jharkhand',
      Khata: '35',
      Part_Whole: 'Part',
      Land_Class: 'Tar / Tanr (Upland)',
      Owner: 'Sukhram Oraon',
      Ownership: 'Raiyati Private',
      Lease: 'Pakhar Bauxite Mines',
      Remarks: 'Regular title'
    },
    '105': {
      Village: 'Rampur Mouza',
      Thana: 'Kisko',
      ThanaNo: '142',
      District: 'Lohardaga',
      State: 'Jharkhand',
      Khata: '01',
      Part_Whole: 'Whole',
      Land_Class: 'Gair Mazarua Aam (Public Common)',
      Owner: 'State Govt / Gram Panchayat',
      Ownership: 'Public Waterbody',
      Lease: 'Non-Acquisition Zone',
      Remarks: 'Water reservoir protection'
    }
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [showParchhaModal, setShowParchhaModal] = useState(false);
  const toast = useToast();

  const zNum = parseInt(workingZone, 10) || 45;
  const isSouth = workingZone.endsWith('S');

  const handleProfileChange = (k: string) => {
    setSelectedProfileKey(k);
    if (CAD_PRESETS[k]) {
      setProfile(CAD_PRESETS[k]);
    }
  };

  // Filtered parcels
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return parcels;
    const q = searchQuery.toLowerCase();
    return parcels.filter(
      p =>
        p.khasra.toLowerCase().includes(q) ||
        p.owner.toLowerCase().includes(q) ||
        p.village.toLowerCase().includes(q) ||
        (p.status ?? '').toLowerCase().includes(q)
    );
  }, [parcels, searchQuery]);

  // Total Area
  const totalM2 = parcels.reduce((s, p) => s + p.areaM2, 0);
  const totalHa = totalM2 / 10000;
  const totalAc = totalM2 / 4046.8564224;

  // Handle Geometry CSV / KML / GeoJSON / Shapefile / ZIP Upload
  const handleUploadGeometry = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      let feats: GeoFeature[] = [];

      if (ext === 'zip' || ext === 'kmz') {
        const buf = await file.arrayBuffer();
        const datasets = await extractAllFeaturesFromZip(buf, zNum, isSouth);
        datasets.forEach(ds => {
          feats.push(...ds.features);
        });
      } else if (ext === 'shp' || ext === 'geojson' || ext === 'json' || ext === 'kml' || ext === 'dxf') {
        // Generic geospatial formats go to the central parser. The CSV branch
        // below stays local: grouping rows into parcels by khasra, village and
        // owner is cadastral domain logic, not format detection.
        const { result } = await parseImportFile(file, workingZone);
        feats = result.features || [];
      } else {
        const text = stripBOM(await file.text());
        const rows = parseCSV(text);
        if (rows.length >= 2) {
          const hdr = rows[0].map(h => h.trim().toLowerCase());
          const khIdx = hdr.findIndex(h => h.includes('khasra') || h.includes('plot') || h.includes('id') || h === 'name');
          const vilIdx = hdr.findIndex(h => h.includes('vil') || h.includes('mouza'));
          const ownIdx = hdr.findIndex(h => h.includes('own') || h.includes('name'));
          const eIdx = hdr.findIndex(h => h.includes('east') || h === 'e' || h === 'x');
          const nIdx = hdr.findIndex(h => h.includes('north') || h === 'n' || h === 'y');

          const groups: Record<string, { khasra: string; village: string; owner: string; pts: { E: number; N: number }[] }> = {};

          rows.slice(1).forEach((r, idx) => {
            const kh = khIdx >= 0 ? r[khIdx] : `Parcel-${idx + 1}`;
            const vil = vilIdx >= 0 ? r[vilIdx] : 'Mouza Rampur';
            const own = ownIdx >= 0 ? r[ownIdx] : 'Unknown';
            const E = parseFloat(r[eIdx]);
            const N = parseFloat(r[nIdx]);

            if (!isNaN(E) && !isNaN(N)) {
              if (!groups[kh]) groups[kh] = { khasra: kh, village: vil, owner: own, pts: [] };
              groups[kh].pts.push({ E, N });
            }
          });

          const parsed: CadastralParcel[] = [];
          Object.keys(groups).forEach(kh => {
            const g = groups[kh];
            if (g.pts.length >= 3) {
              const poly = polygonAreaPerimeter(g.pts);
              const rec = landRecords[kh];
              parsed.push({
                khasra: g.khasra,
                village: rec?.Village || g.village,
                owner: rec?.Owner || g.owner,
                mouza: rec?.ThanaNo ? `Thana ${rec.ThanaNo}` : 'Mouza',
                sheet: 'Sheet 01',
                status: rec?.Land_Class || 'Agricultural',
                pts: g.pts,
                areaM2: poly.areaM2,
                areaHa: poly.areaHa,
                areaAcres: poly.areaAcres
              });
            }
          });

          if (parsed.length > 0) {
            setParcels(parsed);
            setGeometryLoadedName(file.name);
            setStatusMsg(`Successfully loaded ${parsed.length} cadastral polygon plots from ${file.name}`);
            return;
          }
        }
      }

      if (feats.length > 0) {
        const parsed: CadastralParcel[] = [];
        feats.forEach((f, idx) => {
          const ptsUtm = f.pts.map(p => {
            if (f.kind === 'll') {
              const u = lonLatToUtm(p.a, p.b, zNum, isSouth);
              return { E: u.E, N: u.N };
            }
            return { E: p.a, N: p.b };
          });

          if (ptsUtm.length >= 3) {
            const poly = polygonAreaPerimeter(ptsUtm);
            const plotKey = String(f.props?.plot || f.props?.khasra || f.props?.Plot_No || f.name || `Parcel_${idx + 1}`);
            const rec = landRecords[plotKey];
            parsed.push({
              khasra: plotKey,
              village: String(rec?.Village || f.props?.village || f.props?.Village || 'Mouza Rampur'),
              owner: String(rec?.Owner || f.props?.owner || f.props?.Owner || 'Government / Raiyat'),
              mouza: rec?.ThanaNo ? `Thana ${rec.ThanaNo}` : 'Mouza',
              sheet: 'Sheet 01',
              status: String(rec?.Land_Class || f.props?.Land_Class || f.props?.class || 'Agricultural'),
              pts: ptsUtm,
              areaM2: poly.areaM2,
              areaHa: poly.areaHa,
              areaAcres: poly.areaAcres
            });
          }
        });

        if (parsed.length > 0) {
          setParcels(parsed);
          setGeometryLoadedName(file.name);
          setStatusMsg(`Successfully extracted ${parsed.length} cadastral plots from ${file.name}`);
        }
      }
    } catch (err: any) {
      setStatusMsg(`Error reading Geometry file: ${err.message}`);
    }
  };

  // Handle Land Records (RoR) CSV Upload
  const handleUploadLandRecords = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = stripBOM(await file.text());
      const rows = parseCSV(text);
      if (rows.length < 2) return;

      const headers = rows[0].map(h => h.trim());
      const khIdx = headers.findIndex(h => h.toLowerCase().includes('plot') || h.toLowerCase().includes('khasra'));
      const recs: Record<string, any> = {};

      rows.slice(1).forEach(r => {
        const plotNo = khIdx >= 0 ? r[khIdx] : r[0];
        if (plotNo) {
          const item: Record<string, any> = {};
          headers.forEach((h, i) => {
            item[h] = r[i] || '';
          });
          recs[plotNo] = item;
        }
      });

      setLandRecords(recs);
      setLandRecordsLoadedName(file.name);

      // Mutate existing parcels with updated RoR attributes
      setParcels(prev =>
        prev.map(p => {
          const matched = recs[p.khasra];
          if (!matched) return p;
          return {
            ...p,
            owner: matched.Owner || matched.Pattadar || p.owner,
            village: matched.Village || p.village,
            status: matched.Land_Class || matched.Classification || p.status
          };
        })
      );

      setStatusMsg(`Loaded ${Object.keys(recs).length} land records from ${file.name} and synced with plot geometry.`);
    } catch (err: any) {
      setStatusMsg(`Error reading Land Records CSV: ${err.message}`);
    }
  };

  // Download Matching Template
  const handleDownloadTemplate = () => {
    const cols = ['Plot', 'Village', 'Thana', 'ThanaNo', 'District', 'State', 'Khata', 'Part_Whole', 'Land_Class', 'Owner', 'Ownership', 'Lease', 'Remarks'];
    const sampleRows = [
      ['104/1', 'Rampur Mouza', 'Kisko', '142', 'Lohardaga', 'Jharkhand', '28', 'Part', 'Dhani 1 (Prime Agricultural)', 'Rameshwar Mahato', 'Raiyati Private', 'Pakhar Bauxite Mines', 'Verified'],
      ['104/2', 'Rampur Mouza', 'Kisko', '142', 'Lohardaga', 'Jharkhand', '35', 'Part', 'Tar / Tanr (Upland)', 'Sukhram Oraon', 'Raiyati Private', 'Pakhar Bauxite Mines', 'Regular title']
    ];
    const csv = toCSVtext(cols, sampleRows);
    downloadBlob(csvEnc(csv), `template_cadastral_${profile.name.toLowerCase().replace(/\s+/g, '_')}.csv`, 'text/csv');
  };

  // Export Plot Register CSV
  const handleExportPlotRegister = () => {
    const cols = ['Plot_No', 'Village', 'Owner_Name', 'Land_Classification', 'Area_SqM', 'Area_Hectares', 'Area_Acres', 'Regional_Units'];
    const rows = parcels.map(p => [
      p.khasra,
      p.village,
      p.owner,
      p.status ?? '',
      p.areaM2.toFixed(2),
      p.areaHa.toFixed(4),
      p.areaAcres.toFixed(4),
      formatAreaAllUnits(p.areaM2, localLandUnitPreset, customBighaM2, customKathaPerBigha)
    ]);
    const csv = toCSVtext(cols, rows);
    downloadBlob(csvEnc(csv), 'Cadastral_Plot_Register.csv', 'text/csv');
  };

  // Export Land Schedule Excel
  const handleExportExcel = () => {
    const cols = ['Khasra_Plot_No', 'Village_Name', 'Owner_Ryot_Name', 'Land_Classification', 'Area_SqMetres', 'Area_Hectares', 'Area_Acres', 'Regional_Area_Breakdown'];
    const rows = parcels.map(p => [
      p.khasra,
      p.village,
      p.owner,
      p.status ?? '',
      p.areaM2.toFixed(2),
      p.areaHa.toFixed(4),
      p.areaAcres.toFixed(4),
      formatAreaAllUnits(p.areaM2, localLandUnitPreset, customBighaM2, customKathaPerBigha)
    ]);

    const zip = buildExcelZip(cols, rows, 'Revenue_Land_Schedule');
    downloadBlob(zip, 'Revenue_Cadastral_Land_Schedule.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  };

  // Export KML
  const handleExportKML = () => {
    const feats: GeoFeature[] = parcels.map(p => ({
      name: `Khasra ${p.khasra} (${p.owner})`,
      geom: 'polygon',
      kind: 'en',
      pts: p.pts.map(pt => ({ a: pt.E, b: pt.N })),
      props: {
        Khasra_No: p.khasra,
        Village: p.village,
        Owner: p.owner,
        Classification: p.status,
        Area_Ha: `${p.areaHa.toFixed(4)} Ha`,
        Regional_Land: formatAreaAllUnits(p.areaM2, localLandUnitPreset, customBighaM2, customKathaPerBigha)
      }
    }));

    const kml = kmlBuild(feats, 'Cadastral_Revenue_Map', true, zNum, isSouth);
    downloadBlob(new TextEncoder().encode(kml), 'Cadastral_Revenue_Map.kml', 'application/vnd.google-earth.kml+xml');
  };

  // Export DXF
  const handleExportDXF = () => {
    const feats: GeoFeature[] = parcels.map(p => ({
      name: `Plot_${p.khasra}`,
      geom: 'polygon',
      kind: 'en',
      pts: p.pts.map(pt => ({ a: pt.E, b: pt.N })),
      props: { layer: 'CAD_PARCELS', Owner: p.owner, Class: p.status }
    }));

    const res = dxfBuild(feats, 'utm', zNum, isSouth, true);
    downloadBlob(new TextEncoder().encode(res.dxf), 'Cadastral_Plots.dxf', 'application/dxf');
  };

  // Deduplicate Cadastral Parcels
  const handleDeduplicateParcels = () => {
    if (parcels.length === 0) {
      toast.showWarning('No cadastral parcels to deduplicate.');
      return;
    }
    const { cleanParcels, summary } = deduplicateCadastralParcels(parcels, 0.2);

    setParcels(cleanParcels);
    if (summary.removedCount > 0) {
      toast.showSuccess(`Deduplication complete: Removed ${summary.removedCount} duplicate parcel polygon(s).`);
      setStatusMsg(`Removed ${summary.removedCount} duplicate parcel polygon(s). (${cleanParcels.length} active plots)`);
    } else {
      toast.showInfo('Cadastral dataset is clean. Zero duplicate parcels found.');
      setStatusMsg('Zero duplicate parcels found in current dataset.');
    }
  };

  // Export GeoJSON
  const handleExportGeoJSON = () => {
    if (parcels.length === 0) {
      toast.showWarning('No cadastral parcels to export.');
      return;
    }
    const feats: GeoFeature[] = parcels.map(p => ({
      name: `Plot ${p.khasra}`,
      geom: 'polygon',
      kind: 'en',
      pts: p.pts.map(pt => ({ a: pt.E, b: pt.N })),
      props: {
        plot_number: p.khasra,
        village: p.village,
        owner: p.owner,
        land_class: p.status,
        area_ha: p.areaHa
      }
    }));
    const jsonStr = geoJsonBuild(feats, zNum, isSouth);
    downloadBlob(new TextEncoder().encode(jsonStr), 'Cadastral_Parcels.geojson', 'application/geo+json');
    toast.showSuccess(`Exported ${parcels.length} parcels to GeoJSON`);
  };

  // Export ESRI Shapefile Bundle (.zip)
  const handleExportShapefile = () => {
    if (parcels.length === 0) {
      toast.showWarning('No cadastral parcels to export.');
      return;
    }
    const feats: GeoFeature[] = parcels.map(p => ({
      name: `Plot_${p.khasra}`,
      geom: 'polygon',
      kind: 'en',
      pts: p.pts.map(pt => ({ a: pt.E, b: pt.N })),
      props: {
        Plot_No: p.khasra,
        Village: p.village,
        Owner: p.owner,
        Class: p.status,
        Area_Ha: Number(p.areaHa.toFixed(4)),
        Area_M2: Number(p.areaM2.toFixed(2))
      }
    }));
    const zipBytes = buildShapefileZip(feats, 'Cadastral_Parcels', zNum, isSouth);
    downloadBlob(zipBytes, 'Cadastral_Parcels_shp.zip', 'application/zip');
    toast.showSuccess(`Exported ESRI Shapefile bundle with ${parcels.length} parcel polygons!`);
    setStatusMsg(`Exported ESRI Shapefile bundle with ${parcels.length} parcel polygons!`);
  };

  // Convert parcels to GeoFeatures for VectorRadarMap
  const mapFeatures: GeoFeature[] = useMemo(() => {
    return parcels.map(p => ({
      name: `Plot ${p.khasra}`,
      geom: 'polygon',
      kind: 'en',
      pts: p.pts.map(pt => ({ a: pt.E, b: pt.N })),
      props: { owner: p.owner, khasra: p.khasra, status: p.status }
    }));
  }, [parcels]);

  return (
    <div className="space-y-6">
      {/* 1. Cadastral Land Schedule Cockpit */}
      <div className="bg-[#0f0f0f] rounded-2xl p-6 border border-white/5 shadow-sm space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#c9a063] font-medium">Cadastral Revenue Hub</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30 font-mono">
                2-File RoR Matcher
              </span>
            </div>
            <h3 className="text-xl font-serif italic text-white flex items-center gap-2">
              <Layers2 className="w-5 h-5 text-[#c9a063]" />
              Cadastral Geometry & Land-Record Matcher
            </h3>
            <p className="text-xs text-white/40 mt-1 max-w-2xl">
              Match boundary plot polygons with revenue Record-of-Rights (RoR) records, generate formatted Khatiyani parchment deeds, and compute regional land schedules.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#141414] hover:bg-[#1a1a1a] text-white rounded-xl text-xs font-semibold border border-white/10"
              title="Download clean CSV template for current profile"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#c9a063]" /> Download Template
            </button>
            <button
              onClick={() => setShowParchhaModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#c9a063] hover:bg-[#d6b074] text-black rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg shadow-[#c9a063]/10"
            >
              <Printer className="w-3.5 h-3.5" /> Print Parchha / Record
            </button>
          </div>
        </div>

        {/* Profile Selector & 2-File Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-white/5">
          <div>
            <label className="text-[10px] text-white/50 block mb-1 uppercase font-mono">Cadastral Profile</label>
            <select
              value={selectedProfileKey}
              onChange={e => handleProfileChange(e.target.value)}
              className="w-full px-3 py-2 bg-[#141414] border border-white/10 rounded-xl text-xs text-white"
            >
              {Object.keys(CAD_PRESETS).map(k => (
                <option key={k} value={k}>
                  {CAD_PRESETS[k].name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-white/50 block mb-1 uppercase font-mono">1. Plot Geometry (CSV / KML)</label>
            <label className="flex items-center justify-center gap-2 px-3 py-2 bg-[#141414] hover:bg-[#1a1a1a] border border-white/10 rounded-xl text-xs text-white cursor-pointer truncate">
              <Upload className="w-3.5 h-3.5 text-sky-400" />
              <span className="truncate">{geometryLoadedName || 'Upload Plot Geometry CSV'}</span>
              <input type="file" accept=".csv,.kml,.kmz,.geojson" onChange={handleUploadGeometry} className="hidden" />
            </label>
          </div>

          <div>
            <label className="text-[10px] text-white/50 block mb-1 uppercase font-mono">2. Land Records RoR (CSV)</label>
            <label className="flex items-center justify-center gap-2 px-3 py-2 bg-[#141414] hover:bg-[#1a1a1a] border border-white/10 rounded-xl text-xs text-white cursor-pointer truncate">
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              <span className="truncate">{landRecordsLoadedName || 'Upload Land Records CSV'}</span>
              <input type="file" accept=".csv" onChange={handleUploadLandRecords} className="hidden" />
            </label>
          </div>
        </div>

        {statusMsg && (
          <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-xs text-[#c9a063] font-mono flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}

        {/* Total Summary HUD */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-[#141414] rounded-xl border border-white/5">
            <span className="text-[10px] text-white/40 block uppercase font-mono">Total Parcels</span>
            <span className="text-base font-mono font-bold text-[#c9a063]">{parcels.length} Plots</span>
          </div>
          <div className="p-3 bg-[#141414] rounded-xl border border-white/5">
            <span className="text-[10px] text-white/40 block uppercase font-mono">Total Hectares</span>
            <span className="text-base font-mono font-bold text-white">{totalHa.toFixed(4)} Ha</span>
          </div>
          <div className="p-3 bg-[#141414] rounded-xl border border-white/5">
            <span className="text-[10px] text-white/40 block uppercase font-mono">Total Acres</span>
            <span className="text-base font-mono font-bold text-white">{totalAc.toFixed(4)} Ac</span>
          </div>
          <div className="p-3 bg-[#141414] rounded-xl border border-white/5">
            <span className="text-[10px] text-white/40 block uppercase font-mono">Regional Units</span>
            <span className="text-xs font-mono font-bold text-emerald-400 truncate block">
              {formatAreaAllUnits(totalM2, localLandUnitPreset, customBighaM2, customKathaPerBigha)}
            </span>
          </div>
        </div>

        {/* Search & Action Bar */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filter by Khasra No, Owner / Raiyat Name, or Land Class..."
              className="w-full py-2 pl-9 pr-3 rounded-xl border border-white/10 bg-[#141414] text-xs text-white focus:outline-none focus:border-[#c9a063]"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={handleDeduplicateParcels}
              disabled={parcels.length === 0}
              className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold border border-emerald-500/30 flex items-center gap-1.5 disabled:opacity-40 transition-all"
              title="Remove duplicate cadastral parcel polygons and overlapping Khasra plots"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Clean Duplicates
            </button>
          </div>
        </div>

        {/* Parcels Table */}
        <div className="max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-[#141414]">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#1c1c1c] text-white/70 font-semibold sticky top-0 border-b border-white/10">
              <tr>
                <th className="p-2.5">Khasra / Plot</th>
                <th className="p-2.5">Mouza / Village</th>
                <th className="p-2.5">Owner / Raiyat</th>
                <th className="p-2.5">Land Class</th>
                <th className="p-2.5">Area (m²)</th>
                <th className="p-2.5">Hectares</th>
                <th className="p-2.5">Regional Land Units</th>
                <th className="p-2.5">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono text-white/80">
              {filtered.map((p, idx) => (
                <tr key={idx} className="hover:bg-white/5">
                  <td className="p-2.5 font-bold text-[#c9a063]">{p.khasra}</td>
                  <td className="p-2.5 font-serif">{p.village}</td>
                  <td className="p-2.5 font-serif text-white">{p.owner}</td>
                  <td className="p-2.5 text-xs text-white/60 font-sans">{p.status}</td>
                  <td className="p-2.5">{p.areaM2.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="p-2.5 text-sky-400 font-bold">{p.areaHa.toFixed(4)}</td>
                  <td className="p-2.5 text-emerald-400 font-sans text-xs">
                    {formatAreaAllUnits(p.areaM2, localLandUnitPreset, customBighaM2, customKathaPerBigha)}
                  </td>
                  <td className="p-2.5">
                    <button
                      onClick={() => setParcels(parcels.filter((_, i) => i !== idx))}
                      className="text-rose-400 hover:text-rose-300 font-bold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Interactive Cadastral Map */}
      <div className="bg-[#0f0f0f] rounded-2xl p-6 border border-white/5 shadow-sm">
        <VectorRadarMap
          features={mapFeatures}
          zone={zNum}
          south={isSouth}
          title="Cadastral Revenue Parcels Map"
        />
      </div>

      {/* 3. Official Cadastral Parchha / Land Certificate Modal */}
      {showParchhaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#141414] border border-white/10 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#181818]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#c9a063]" />
                <h3 className="font-serif italic text-white text-base">
                  Official Revenue Survey & Land Settlement Parchha
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#c9a063] hover:bg-[#d6b074] text-black font-bold text-xs rounded-xl"
                >
                  <Printer className="w-3.5 h-3.5" /> Print / Save PDF
                </button>
                <button
                  onClick={() => setShowParchhaModal(false)}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs rounded-xl"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-8 overflow-y-auto space-y-6 bg-[#0f0f0f] text-white">
              {/* Parchha Header */}
              <div className="text-center border-b border-white/10 pb-4 space-y-1">
                <span className="text-[11px] uppercase tracking-[0.25em] text-[#c9a063] font-bold">
                  Government Directorate of Land Records & Surveys
                </span>
                <h2 className="text-2xl font-serif font-bold italic tracking-wide text-white">
                  Khatiyan / Jamabandi & Cadastral Area Parchha
                </h2>
                <p className="text-xs text-white/50 italic">
                  State Land Acquisition & Mining Cadastral Schedule &bull; Reference Datum: WGS84 / UTM Zone {workingZone}
                </p>
              </div>

              {/* Village Particulars Box */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl border border-white/10 bg-[#141414] text-xs">
                <div>
                  <span className="text-[10px] text-white/40 block">Village / Mouza</span>
                  <span className="font-bold text-white font-serif">{parcels[0]?.village || 'Rampur Mouza'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-white/40 block">Thana No / Anchal</span>
                  <span className="font-bold text-white font-mono">{parcels[0]?.mouza || '142'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-white/40 block">Total Plots</span>
                  <span className="font-bold text-[#c9a063] font-mono">{parcels.length} Khasras</span>
                </div>
                <div>
                  <span className="text-[10px] text-white/40 block">Total Area</span>
                  <span className="font-bold text-emerald-400 font-mono">{totalHa.toFixed(4)} Ha</span>
                </div>
              </div>

              {/* Schedule Table */}
              <div className="border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#181818] border-b border-white/10 text-white/70 font-semibold">
                    <tr>
                      <th className="p-2.5">Khasra Plot No</th>
                      <th className="p-2.5">Ryot / Owner Name</th>
                      <th className="p-2.5">Land Class</th>
                      <th className="p-2.5">Metric Area</th>
                      <th className="p-2.5">Regional Land Schedule</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono text-white/80">
                    {parcels.map((p, i) => (
                      <tr key={i}>
                        <td className="p-2.5 font-bold text-[#c9a063]">{p.khasra}</td>
                        <td className="p-2.5 font-serif text-white">{p.owner}</td>
                        <td className="p-2.5 font-sans text-xs text-white/60">{p.status}</td>
                        <td className="p-2.5">{p.areaHa.toFixed(4)} Ha ({p.areaM2.toFixed(1)} m²)</td>
                        <td className="p-2.5 font-sans text-emerald-400 text-xs font-semibold">
                          {formatAreaAllUnits(p.areaM2, localLandUnitPreset, customBighaM2, customKathaPerBigha)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Amin & Kanungo Signatures Block */}
              <div className="pt-12 grid grid-cols-3 gap-6 text-center text-xs text-white/60 border-t border-white/10">
                <div className="border-t border-dashed border-white/20 pt-2">
                  <p className="font-bold text-white">Revenue Amin / Surveyor</p>
                  <p className="text-[10px] opacity-50">Field Measurement & Area Verified</p>
                </div>
                <div className="border-t border-dashed border-white/20 pt-2">
                  <p className="font-bold text-white">Kanungo / Circle Inspector</p>
                  <p className="text-[10px] opacity-50">Record of Rights (RoR) Checked</p>
                </div>
                <div className="border-t border-dashed border-white/20 pt-2">
                  <p className="font-bold text-white">Circle Officer / Land Officer</p>
                  <p className="text-[10px] opacity-50">Competent Authority Seal</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
