import React, { useState } from 'react';
import {
  FileCode,
  Upload,
  Download,
  FolderArchive,
  Layers,
  Split,
  Plus,
  Trash2,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import {
  parseCSV,
  stripBOM,
  csvToFeatures,
  kmlParse,
  kmlBuild,
  featuresToKMZ,
  dxfParse,
  dxfBuild,
  geoJsonParse,
  geoJsonBuild,
  gpxParse,
  wktParse,
  toCSVtext,
  csvEnc,
  parseShapefile,
  buildShapefileZip,
  extractAllFeaturesFromZip
} from '../lib/formats';
import { zipFiles, downloadBlob, readZip, makeZip } from '../lib/zip';
import { GeoFeature } from '../types';

interface MergeSplitTabProps {
  workingZone: string;
}

export const MergeSplitTab: React.FC<MergeSplitTabProps> = ({ workingZone }) => {
  const [activeMode, setActiveMode] = useState<'merge' | 'split'>('merge');

  // Merge State
  const [mergeFiles, setMergeFiles] = useState<{ name: string; features: GeoFeature[] }[]>([]);
  const [mergeOutputFormat, setMergeOutputFormat] = useState<string>('kml');

  // Split State
  const [splitFeatures, setSplitFeatures] = useState<GeoFeature[]>([]);
  const [splitAttr, setSplitAttr] = useState<string>('layer');
  const [splitFormat, setSplitFormat] = useState<string>('kml');
  const [availableAttrs, setAvailableAttrs] = useState<string[]>(['layer', 'name', 'type', 'village', 'lithology']);

  const zNum = parseInt(workingZone, 10) || 45;
  const isSouth = workingZone.endsWith('S');

  // Handle Multi-file Upload for Merge (including .zip & .kmz & .shp)
  const handleMergeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !files.length) return;

    const newFiles: { name: string; features: GeoFeature[] }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop()?.toLowerCase();

      if (ext === 'zip' || ext === 'kmz') {
        const buf = await file.arrayBuffer();
        const datasets = await extractAllFeaturesFromZip(buf, zNum, isSouth);
        datasets.forEach(ds => {
          if (ds.features.length > 0) {
            newFiles.push({ name: `${file.name} ➔ ${ds.layerName}`, features: ds.features });
          }
        });
      } else if (ext === 'shp') {
        const buf = await file.arrayBuffer();
        const feats = parseShapefile(new Uint8Array(buf), undefined, undefined, zNum, isSouth);
        if (feats.length > 0) {
          newFiles.push({ name: file.name, features: feats });
        }
      } else {
        const text = stripBOM(await file.text());
        let feats: GeoFeature[] = [];

        if (ext === 'csv') {
          feats = csvToFeatures(parseCSV(text), zNum, isSouth);
        } else if (ext === 'kml') {
          feats = kmlParse(text);
        } else if (ext === 'dxf') {
          feats = dxfParse(text);
        } else if (ext === 'geojson' || ext === 'json') {
          feats = geoJsonParse(text);
        } else if (ext === 'gpx') {
          feats = gpxParse(text);
        } else if (ext === 'wkt') {
          feats = wktParse(text);
        }

        if (feats.length > 0) {
          newFiles.push({ name: file.name, features: feats });
        }
      }
    }

    setMergeFiles(prev => [...prev, ...newFiles]);
  };

  // Perform Merge
  const handleExecuteMerge = () => {
    if (!mergeFiles.length) return;
    const combinedFeats: GeoFeature[] = [];
    mergeFiles.forEach(f => {
      combinedFeats.push(...f.features);
    });

    if (mergeOutputFormat === 'shp') {
      const zipBytes = buildShapefileZip(combinedFeats, 'Merged_Dataset', zNum, isSouth);
      downloadBlob(zipBytes, 'Merged_Dataset_shp.zip', 'application/zip');
    } else if (mergeOutputFormat === 'kmz') {
      const kmzList = featuresToKMZ(combinedFeats, '#c9a063', { zone: zNum, south: isSouth });
      kmzList.forEach(kmz => {
        downloadBlob(kmz.bytes, 'Merged_Dataset.kmz', 'application/vnd.google-earth.kmz');
      });
    } else if (mergeOutputFormat === 'kml') {
      const kml = kmlBuild(combinedFeats, 'Merged_Dataset', true, zNum, isSouth);
      downloadBlob(new TextEncoder().encode(kml), 'Merged_Dataset.kml', 'application/vnd.google-earth.kml+xml');
    } else if (mergeOutputFormat === 'dxf') {
      const res = dxfBuild(combinedFeats, 'utm', zNum, isSouth, true);
      downloadBlob(new TextEncoder().encode(res.dxf), 'Merged_Dataset.dxf', 'application/dxf');
    } else if (mergeOutputFormat === 'geojson') {
      const gj = geoJsonBuild(combinedFeats, zNum, isSouth);
      downloadBlob(new TextEncoder().encode(gj), 'Merged_Dataset.geojson', 'application/geo+json');
    } else if (mergeOutputFormat === 'csv') {
      const cols = ['Feature_Name', 'Geometry_Type', 'Point_Index', 'Coord_A', 'Coord_B'];
      const rows: any[] = [];
      combinedFeats.forEach(f => {
        f.pts.forEach((p, idx) => {
          rows.push([f.name || 'Unnamed', f.geom, idx + 1, p.a, p.b]);
        });
      });
      downloadBlob(csvEnc(toCSVtext(cols, rows)), 'Merged_Dataset.csv', 'text/csv;charset=utf-8');
    }
  };

  // Handle Split Upload (including .zip, .kmz & .shp)
  const handleSplitUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    let feats: GeoFeature[] = [];

    if (ext === 'zip' || ext === 'kmz') {
      const buf = await file.arrayBuffer();
      const datasets = await extractAllFeaturesFromZip(buf, zNum, isSouth);
      datasets.forEach(ds => {
        feats.push(...ds.features);
      });
    } else if (ext === 'shp') {
      const buf = await file.arrayBuffer();
      feats = parseShapefile(new Uint8Array(buf), undefined, undefined, zNum, isSouth);
    } else {
      const text = stripBOM(await file.text());
      if (ext === 'csv') {
        feats = csvToFeatures(parseCSV(text), zNum, isSouth);
      } else if (ext === 'kml') {
        feats = kmlParse(text);
      } else if (ext === 'dxf') {
        feats = dxfParse(text);
      } else if (ext === 'geojson' || ext === 'json') {
        feats = geoJsonParse(text);
      } else if (ext === 'gpx') {
        feats = gpxParse(text);
      } else if (ext === 'wkt') {
        feats = wktParse(text);
      }
    }

    setSplitFeatures(feats);

    // Extract attributes
    const attrs = new Set<string>(['layer', 'name', 'type']);
    feats.forEach(f => {
      if (f.props) {
        Object.keys(f.props).forEach(k => attrs.add(k.toLowerCase()));
      }
    });
    setAvailableAttrs(Array.from(attrs));
  };

  // Execute Split & Zip Download
  const handleExecuteSplit = () => {
    if (!splitFeatures.length) return;

    const groups: Record<string, GeoFeature[]> = {};

    splitFeatures.forEach(f => {
      let key = 'Default';
      if (splitAttr === 'name' && f.name) key = f.name;
      else if (f.props?.[splitAttr]) key = String(f.props[splitAttr]);
      else if (f.props?.layer) key = String(f.props.layer);

      const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Group';
      if (!groups[safeKey]) groups[safeKey] = [];
      groups[safeKey].push(f);
    });

    const zipFilesList: { name: string; data: Uint8Array }[] = [];

    Object.keys(groups).forEach(groupName => {
      const gFeats = groups[groupName];
      if (splitFormat === 'shp') {
        const shpZip = buildShapefileZip(gFeats, groupName, zNum, isSouth);
        zipFilesList.push({ name: `${groupName}_shp.zip`, data: shpZip });
      } else if (splitFormat === 'kml') {
        const kml = kmlBuild(gFeats, groupName, true, zNum, isSouth);
        zipFilesList.push({ name: `${groupName}.kml`, data: new TextEncoder().encode(kml) });
      } else if (splitFormat === 'dxf') {
        const res = dxfBuild(gFeats, 'utm', zNum, isSouth, true);
        zipFilesList.push({ name: `${groupName}.dxf`, data: new TextEncoder().encode(res.dxf) });
      } else if (splitFormat === 'geojson') {
        const gj = geoJsonBuild(gFeats, zNum, isSouth);
        zipFilesList.push({ name: `${groupName}.geojson`, data: new TextEncoder().encode(gj) });
      }
    });

    const zip = zipFiles(zipFilesList);
    downloadBlob(zip, `Split_Datasets_${splitAttr}.zip`, 'application/zip');
  };

  return (
    <div className="space-y-6">
      {/* Mode Switcher */}
      <div className="flex bg-[#141414] p-1.5 rounded-2xl gap-2 max-w-sm text-xs font-semibold border border-white/5">
        <button
          onClick={() => setActiveMode('merge')}
          className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeMode === 'merge'
              ? 'bg-[#c9a063] text-black font-bold shadow-md'
              : 'text-white/60 hover:text-white'
          }`}
        >
          <Layers className="w-4 h-4" /> Merge Files
        </button>
        <button
          onClick={() => setActiveMode('split')}
          className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeMode === 'split'
              ? 'bg-[#c9a063] text-black font-bold shadow-md'
              : 'text-white/60 hover:text-white'
          }`}
        >
          <Split className="w-4 h-4" /> Split by Attribute
        </button>
      </div>

      {/* Merge View */}
      {activeMode === 'merge' && (
        <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#c9a063] mb-1 font-medium">Batch Synthesizer</p>
            <h3 className="text-xl font-serif italic text-white flex items-center gap-2">
              Merge Multiple GIS / CAD Files & Archives
            </h3>
            <p className="text-xs text-white/40 mt-1">
              Combine multiple CSV, KML, KMZ, DXF, GeoJSON files or ZIP packages into a unified master spatial dataset.
            </p>
          </div>

          <label className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-white/10 hover:border-[#c9a063]/50 rounded-2xl cursor-pointer bg-[#141414]/60 transition-colors">
            <Upload className="w-8 h-8 text-[#c9a063] mb-2" />
            <span className="text-sm font-semibold text-white">
              Click to select multiple files or ZIP/KMZ archives
            </span>
            <span className="text-xs text-white/40 mt-1">Supports CSV, KML, KMZ, DXF, GeoJSON, ZIP</span>
            <input
              type="file"
              multiple
              accept=".csv,.kml,.kmz,.dxf,.geojson,.json,.zip"
              onChange={handleMergeUpload}
              className="hidden"
            />
          </label>

          {/* Uploaded files list */}
          {mergeFiles.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-white/60">
                Loaded Files to Merge ({mergeFiles.length})
              </h4>
              <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
                {mergeFiles.map((f, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-[#141414] rounded-xl border border-white/5 flex items-center justify-between text-xs"
                  >
                    <span className="font-mono text-white/90 truncate">{f.name} ({f.features.length} features)</span>
                    <button
                      onClick={() => setMergeFiles(mergeFiles.filter((_, i) => i !== idx))}
                      className="text-white/40 hover:text-rose-400 ml-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 pt-3 flex-wrap">
                <select
                  value={mergeOutputFormat}
                  onChange={e => setMergeOutputFormat(e.target.value)}
                  className="py-2.5 px-3 rounded-xl border border-white/10 bg-[#141414] text-white text-xs font-medium focus:outline-none focus:border-[#c9a063]"
                >
                  <option value="shp">Output as ESRI Shapefile Bundle (.zip)</option>
                  <option value="kml">Output as KML (.kml)</option>
                  <option value="kmz">Output as KMZ Archive (.kmz)</option>
                  <option value="dxf">Output as AutoCAD DXF (.dxf)</option>
                  <option value="geojson">Output as GeoJSON (.geojson)</option>
                  <option value="csv">Output as Master CSV (.csv)</option>
                </select>

                <button
                  onClick={handleExecuteMerge}
                  className="px-6 py-2.5 bg-[#c9a063] hover:bg-[#d6b074] text-black rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-[#c9a063]/10"
                >
                  <Download className="w-4 h-4" /> Export Merged Dataset
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Split View */}
      {activeMode === 'split' && (
        <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#c9a063] mb-1 font-medium">Attribute Partitioner</p>
            <h3 className="text-xl font-serif italic text-white flex items-center gap-2">
              Split Dataset by Layer, Village or Attributes
            </h3>
            <p className="text-xs text-white/40 mt-1">
              Disaggregate a master file into separate thematic shape/CAD layers packaged inside a single ZIP archive.
            </p>
          </div>

          <label className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-white/10 hover:border-[#c9a063]/50 rounded-2xl cursor-pointer bg-[#141414]/60 transition-colors">
            <Upload className="w-8 h-8 text-[#c9a063] mb-2" />
            <span className="text-sm font-semibold text-white">
              Choose master file to partition
            </span>
            <span className="text-xs text-white/40 mt-1">Supports CSV, KML, KMZ, DXF, GeoJSON, ZIP</span>
            <input
              type="file"
              accept=".csv,.kml,.kmz,.dxf,.geojson,.json,.zip"
              onChange={handleSplitUpload}
              className="hidden"
            />
          </label>

          {splitFeatures.length > 0 && (
            <div className="p-5 bg-[#141414] rounded-xl border border-white/5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-white/80">
                  Loaded <strong className="text-[#c9a063] font-mono">{splitFeatures.length}</strong> features for splitting
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-white/60 mb-2 block">Split By Attribute Field</label>
                  <select
                    value={splitAttr}
                    onChange={e => setSplitAttr(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-white/10 bg-[#0f0f0f] text-white text-xs font-medium focus:outline-none focus:border-[#c9a063]"
                  >
                    {availableAttrs.map(attr => (
                      <option key={attr} value={attr}>
                        {attr.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-white/60 mb-2 block">Package Output Format</label>
                  <select
                    value={splitFormat}
                    onChange={e => setSplitFormat(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-white/10 bg-[#0f0f0f] text-white text-xs font-medium focus:outline-none focus:border-[#c9a063]"
                  >
                    <option value="shp">Multiple ESRI Shapefile Bundles (.zip)</option>
                    <option value="kml">Multiple KML Files (.zip)</option>
                    <option value="dxf">Multiple AutoCAD DXF Files (.zip)</option>
                    <option value="geojson">Multiple GeoJSON Files (.zip)</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleExecuteSplit}
                className="px-6 py-2.5 bg-[#c9a063] hover:bg-[#d6b074] text-black rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-[#c9a063]/10"
              >
                <FolderArchive className="w-4 h-4" /> Download Partitioned Files (.zip)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
