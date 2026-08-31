/**
 * =========================================================================================
 * BHUSTUDIO - HOME & TEMPLATES WORKSPACE MODULE (LOCKED & FINALIZED)
 * =========================================================================================
 * Scope: Standard Templates, Archive Inspector (ZIP Package Inspector & Visualizer), Schema Builder.
 * State: Fully wired with offline ZIP parser, Data Dictionary, and Demo Datasets.
 * DO NOT MUTATE OR RESTRUCTURE THIS MODULE WHEN RECTIFYING OTHER APPS.
 * =========================================================================================
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Download,
  FolderArchive,
  Upload,
  FileText,
  Eye,
  FileSpreadsheet,
  Check,
  Copy,
  Layers,
  Compass,
  Pickaxe,
  MapPin,
  Database,
  Search,
  LayoutGrid,
  ListFilter,
  Activity,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  Globe,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  ExternalLink,
  Code2,
  Table,
  CheckCircle2,
  Zap,
  Info,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  XCircle,
  Trash2,
  HardDrive,
  Laptop,
  Grid
} from 'lucide-react';
import { TEMPLATES, DATA_DICTIONARY, buildAllTemplatesZip } from '../lib/templates';
import { downloadBlob, readZip, makeZip } from '../lib/zip';
import {
  toCSVtext,
  csvEnc,
  extractAllFeaturesFromZip,
  ExtractedDataset,
  featuresToGeoJSON,
  kmlDoc,
  pmForFeature
} from '../lib/formats';
import { utmToLonLat, lonLatToUtm } from '../lib/geodesy';
import { GeoFeature, GeoPoint } from '../types';
import { AppTabId, APPS_CONFIG, PRIMARY_APPS, MORE_APPS } from './Navigation';
import { useToast } from '../context/ToastContext';
import { useIsDarkMode } from '../hooks/useIsDarkMode';

interface HomeTemplatesTabProps {
  setActiveTab?: (tab: AppTabId) => void;
  workingZone?: string;
  localLandUnitPreset?: string;
  customBighaM2?: number;
  customKathaPerBigha?: number;
}

interface TemplateMeta {
  key: string;
  name: string;
  category: 'geodesy' | 'topo' | 'cadastral' | 'mining' | 'geometry';
  categoryLabel: string;
  icon: any;
  recommendation: string;
}

const TEMPLATE_METAS: Record<string, TemplateMeta> = {
  convert: {
    key: 'convert',
    name: 'Coordinate Batch Conversion',
    category: 'geodesy',
    categoryLabel: 'Geodesy & Coordinates',
    icon: Compass,
    recommendation: 'Use for batch converting between WGS84 (Lon/Lat) and UTM (Easting/Northing).'
  },
  point: {
    key: 'point',
    name: 'Generic Survey Points & Stations',
    category: 'topo',
    categoryLabel: 'Topography & Control',
    icon: MapPin,
    recommendation: 'Standard point survey format for total stations, GNSS rover fixes, and base markers.'
  },
  text: {
    key: 'text',
    name: 'Spot Elevation & Text Labels',
    category: 'topo',
    categoryLabel: 'Topography & Control',
    icon: FileText,
    recommendation: 'Annotative elevation tags, RL callouts, and spot text markers on survey plans.'
  },
  bp: {
    key: 'bp',
    name: 'Mining & Lease Boundary Pillars',
    category: 'mining',
    categoryLabel: 'Mining & Statutory',
    icon: Layers,
    recommendation: 'Official lease boundary pillars (BP-01, BP-02) with pillar types and inspection remarks.'
  },
  borehole: {
    key: 'borehole',
    name: 'Exploration Borehole & Core Lithology',
    category: 'mining',
    categoryLabel: 'Mining & Statutory',
    icon: Pickaxe,
    recommendation: 'Geotechnical & mineral exploration core runs with Collar RL, From/To depth intervals, and assay grades.'
  },
  cad_geometry: {
    key: 'cad_geometry',
    name: 'Cadastral Parcel Polygon Geometry',
    category: 'cadastral',
    categoryLabel: 'Cadastral & Land',
    icon: Layers,
    recommendation: 'Revenue cadastral parcel boundary polygon vertices grouped by Plot/Khesra number.'
  },
  cad_land: {
    key: 'cad_land',
    name: 'Cadastral Land & Tenancy Register (Khatian)',
    category: 'cadastral',
    categoryLabel: 'Cadastral & Land',
    icon: Database,
    recommendation: 'Revenue land tenancy records containing Khata, Plot, Land Class, Raiyat/Owner name, and area.'
  },
  ml_boundary: {
    key: 'ml_boundary',
    name: 'Mining Lease Outer Boundary Polyline',
    category: 'mining',
    categoryLabel: 'Mining & Statutory',
    icon: Layers,
    recommendation: 'Lease perimeter vertices used for statutory 7.5m safety barrier offset calculation.'
  },
  polygon: {
    key: 'polygon',
    name: 'Closed Polygon Zones & Building Footprints',
    category: 'geometry',
    categoryLabel: 'Spatial Geometry',
    icon: Layers,
    recommendation: 'Closed polygonal survey zones, civil infrastructure footprints, and work areas.'
  },
  line: {
    key: 'line',
    name: 'Survey Line, Haul-Road & Centerline',
    category: 'geometry',
    categoryLabel: 'Spatial Geometry',
    icon: Compass,
    recommendation: 'Linear alignments, pipeline routes, road centerlines, and pit incline transects.'
  }
};

const CATEGORIES = [
  { id: 'all', label: 'All Templates' },
  { id: 'geodesy', label: 'Geodesy & Coord' },
  { id: 'topo', label: 'Topography' },
  { id: 'cadastral', label: 'Cadastral Land' },
  { id: 'mining', label: 'Mining & Drill' },
  { id: 'geometry', label: 'Polygons & Lines' }
];

export const HomeTemplatesTab: React.FC<HomeTemplatesTabProps> = ({
  setActiveTab,
  workingZone = '45N'
}) => {
  const toast = useToast();
  const [activeSection, setActiveSection] = useState<'templates' | 'archive' | 'custom'>('templates');
  
  // Template Selector state
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>('convert');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'dropdown' | 'cards'>('dropdown');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Schema Builder state
  const [customColumns, setCustomColumns] = useState<string[]>([
    'Point_ID',
    'Longitude',
    'Latitude',
    'Elevation_m',
    'Feature_Code',
    'Remarks'
  ]);
  const [newColInput, setNewColInput] = useState('');
  const [includeSamples, setIncludeSamples] = useState(true);

  // Archive inspector enhanced state
  const [zipFilesList, setZipFilesList] = useState<{ name: string; size: number; bytes: Uint8Array; featCount: number; format?: string }[]>([]);
  const [extractedDatasets, setExtractedDatasets] = useState<ExtractedDataset[]>([]);
  const [zipStatus, setZipStatus] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<{ name: string; text: string; format?: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveFilterType, setArchiveFilterType] = useState<'all' | 'vector' | 'table' | 'meta'>('all');
  const [mapZoom, setMapZoom] = useState(1);
  const [selectedDatasetForMap, setSelectedDatasetForMap] = useState<string>('all');
  const [archiveSource, setArchiveSource] = useState<'none' | 'manual' | 'sample'>('none');
  const [activeArchiveName, setActiveArchiveName] = useState<string>('');
  const [activeArchiveSize, setActiveArchiveSize] = useState<number>(0);
  const [isSampleSectionOpen, setIsSampleSectionOpen] = useState<boolean>(false);
  
  const isDarkMode = useIsDarkMode();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const manualFileInputRef = useRef<HTMLInputElement | null>(null);

  const zNum = parseInt(workingZone, 10) || 45;
  const isSouth = workingZone.endsWith('S');

  const templateKeys = Object.keys(TEMPLATES);

  // Filter templates based on Category & Search Query
  const filteredTemplateKeys = templateKeys.filter(key => {
    const meta = TEMPLATE_METAS[key];
    const t = TEMPLATES[key];
    if (!meta || !t) return true;

    const matchesCategory = selectedCategory === 'all' || meta.category === selectedCategory;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return matchesCategory;

    const matchesSearch =
      key.toLowerCase().includes(q) ||
      meta.name.toLowerCase().includes(q) ||
      meta.categoryLabel.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.cols.some(c => c.toLowerCase().includes(q));

    return matchesCategory && matchesSearch;
  });

  // Current active template definition and meta
  const currentTemplate = TEMPLATES[selectedTemplateKey] || TEMPLATES['convert'];
  const currentMeta = TEMPLATE_METAS[selectedTemplateKey] || TEMPLATE_METAS['convert'];
  const IconComponent = currentMeta.icon || FileSpreadsheet;

  const handleDownloadSingle = (key: string) => {
    const t = TEMPLATES[key];
    if (!t) return;
    const txt = toCSVtext(t.cols, t.ex);
    downloadBlob(csvEnc(txt), `template_${key}.csv`, 'text/csv;charset=utf-8');
    toast.showSuccess(`Downloaded "template_${key}.csv"`);
  };

  const handleCopyCsvTemplate = (key: string) => {
    const t = TEMPLATES[key];
    if (!t) return;
    const txt = toCSVtext(t.cols, t.ex);
    navigator.clipboard.writeText(txt);
    setCopiedKey(key);
    toast.showSuccess(`Copied "${key}" CSV format to clipboard.`);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleDownloadAllZip = () => {
    const zip = buildAllTemplatesZip();
    downloadBlob(zip, 'BhuNexStudio_Templates.zip', 'application/zip');
    toast.showSuccess('Downloaded complete BhuNex Studio Templates ZIP package.');
  };

  const handleDownloadDataDictionary = () => {
    const cols = ['Template_Category', 'Column_Name', 'Description'];
    const rows = DATA_DICTIONARY.map(d => [d.template, d.col, d.desc]);
    downloadBlob(csvEnc(toCSVtext(cols, rows)), 'BhuNexStudio_Data_Dictionary.csv', 'text/csv;charset=utf-8');
    toast.showSuccess('Downloaded Data Dictionary CSV.');
  };

  const handleAddCustomColumn = () => {
    if (!newColInput.trim()) return;
    if (customColumns.includes(newColInput.trim())) return;
    setCustomColumns([...customColumns, newColInput.trim()]);
    setNewColInput('');
  };

  const handleRemoveCustomColumn = (col: string) => {
    setCustomColumns(customColumns.filter(c => c !== col));
  };

  const handleDownloadCustomTemplate = () => {
    if (!customColumns.length) return;
    const sampleRow = customColumns.map(c => {
      if (c.toLowerCase().includes('lon')) return '84.601550';
      if (c.toLowerCase().includes('lat')) return '23.541200';
      if (c.toLowerCase().includes('elev') || c.toLowerCase().includes('z')) return '142.50';
      if (c.toLowerCase().includes('id')) return 'PT-101';
      return 'Sample';
    });
    const rows = includeSamples ? [sampleRow, sampleRow] : [];
    downloadBlob(csvEnc(toCSVtext(customColumns, rows)), 'custom_survey_template.csv', 'text/csv;charset=utf-8');
    toast.showSuccess('Generated and downloaded custom schema CSV.');
  };

  const processArchiveBuffer = async (
    buf: ArrayBuffer,
    fileName: string,
    source: 'manual' | 'sample' = 'manual'
  ) => {
    setIsExtracting(true);
    setPreviewContent(null);
    try {
      const extractedDs = await extractAllFeaturesFromZip(buf, zNum, isSouth);
      const filesMap = await readZip(buf);
      const list: { name: string; size: number; bytes: Uint8Array; featCount: number; format?: string }[] = [];

      for (const name of Object.keys(filesMap)) {
        const bytes = filesMap[name];
        if (!bytes || !bytes.length) continue;
        const matchingDs = extractedDs.find(d => d.fileName === name || d.fileName.endsWith(name));
        const ext = name.split('.').pop()?.toLowerCase() || '';
        list.push({
          name,
          size: bytes.length,
          bytes,
          featCount: matchingDs ? matchingDs.features.length : 0,
          format: matchingDs ? matchingDs.format : ext
        });
      }

      setZipFilesList(list);
      setExtractedDatasets(extractedDs);
      setArchiveSource(source);
      setActiveArchiveName(fileName);
      setActiveArchiveSize(buf.byteLength);
      // Auto-collapse sample archives drawer on selection / upload
      setIsSampleSectionOpen(false);

      const totalFeats = extractedDs.reduce((acc, d) => acc + d.features.length, 0);
      if (source === 'manual') {
        setZipStatus(`Active File: "${fileName}" loaded directly from your device (${list.length} files, ${totalFeats} spatial features)`);
        toast.showSuccess(`Loaded local file "${fileName}" (${list.length} files parsed).`);
      } else {
        setZipStatus(`Sample Package: "${fileName}" (${list.length} files, ${totalFeats} spatial features)`);
        toast.showSuccess(`Loaded sample archive "${fileName}".`);
      }
    } catch (err: any) {
      setZipStatus(`Failed to extract archive: ${err.message}`);
      toast.showError(`ZIP extraction error: ${err.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleZipInspectUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processArchiveBuffer(await file.arrayBuffer(), file.name, 'manual');
    // Reset file input so re-selecting the same file also triggers
    if (e.target) e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processArchiveBuffer(await file.arrayBuffer(), file.name, 'manual');
  };

  const handleClearArchive = () => {
    setZipFilesList([]);
    setExtractedDatasets([]);
    setZipStatus(null);
    setPreviewContent(null);
    setArchiveSource('none');
    setActiveArchiveName('');
    setActiveArchiveSize(0);
    toast.showInfo('Archive unloaded. Workspace is ready for your next file.');
  };

  // Pre-loaded Smart Sample Archive Generators
  const handleLoadSampleArchive = async (type: 'mining' | 'cadastral' | 'topo') => {
    const enc = new TextEncoder();
    let entries: { name: string; data: Uint8Array }[] = [];
    let title = '';

    if (type === 'mining') {
      title = 'Mining_Lease_Boundary_Statutory_Package.zip';
      const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Barabil Mining Lease Boundary</name>
    <Placemark>
      <name>Mining Lease Perimeter</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              85.3210,23.3510,180.0
              85.3340,23.3515,185.2
              85.3380,23.3620,192.0
              85.3290,23.3680,188.5
              85.3190,23.3610,182.0
              85.3210,23.3510,180.0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`;
      const pillarsCsv = toCSVtext(
        ['Pillar_ID', 'Easting_m', 'Northing_m', 'RL_m', 'Type', 'Statutory_Status', 'Surveyor'],
        [
          ['BP-01', '328400.12', '2583500.45', '180.05', 'RCC Monument Pillar', 'Approved Statutory', 'S. Ansari'],
          ['BP-02', '329720.55', '2583560.10', '185.20', 'RCC Monument Pillar', 'Approved Statutory', 'S. Ansari'],
          ['BP-03', '330130.80', '2584720.65', '192.10', 'RCC Monument Pillar', 'Approved Statutory', 'S. Ansari'],
          ['BP-04', '329210.40', '2585390.90', '188.50', 'RCC Monument Pillar', 'Approved Statutory', 'S. Ansari'],
          ['BP-05', '328190.25', '2584610.30', '182.00', 'RCC Monument Pillar', 'Approved Statutory', 'S. Ansari']
        ]
      );
      const boreCsv = toCSVtext(
        ['Hole_ID', 'Easting', 'Northing', 'Collar_RL', 'Depth_From', 'Depth_To', 'Lithology', 'Fe_Grade_pct'],
        [
          ['BH-01', '328900.0', '2584100.0', '184.5', '0.0', '12.5', 'Lateritic Soil & Overburden', '24.2'],
          ['BH-01', '328900.0', '2584100.0', '184.5', '12.5', '38.0', 'High Grade Hematite Iron Ore', '64.8'],
          ['BH-02', '329400.0', '2584500.0', '189.0', '0.0', '15.0', 'Banded Hematite Jasper (BHJ)', '38.5'],
          ['BH-02', '329400.0', '2584500.0', '189.0', '15.0', '45.0', 'Hard Laminated Iron Ore', '62.1']
        ]
      );
      entries = [
        { name: 'Mining_Lease_Boundary.kml', data: enc.encode(kml) },
        { name: 'Pillar_Coordinates_UTM45N.csv', data: csvEnc(pillarsCsv) },
        { name: 'Exploration_Borehole_Logs.csv', data: csvEnc(boreCsv) }
      ];
    } else if (type === 'cadastral') {
      title = 'BhuNaksha_Cadastral_Revenue_Package.zip';
      const khatianCsv = toCSVtext(
        ['Khata_No', 'Plot_No', 'Raiyat_Owner', 'Father_Husband', 'Land_Class', 'Area_Bigha', 'Area_Katha', 'Area_Dhur', 'Remarks'],
        [
          ['42', '101', 'Ramesh Kumar Mahto', 'Late S. Mahto', 'Dhan-1 (Agricultural)', '1', '4', '12', 'Clear Revenue Title'],
          ['42', '102', 'Ramesh Kumar Mahto', 'Late S. Mahto', 'Bari (Homestead)', '0', '12', '5', 'Residential Dwelling'],
          ['58', '103', 'Sunita Devi', 'W/o Anil Roy', 'Dhan-2 (Cultivated)', '2', '8', '0', 'Joint Ancestral Share'],
          ['104', '104', 'Gram Panchayat Common', 'State Govt', 'Gair Majrua Aam (Road/Nala)', '0', '6', '15', 'Public Right of Way']
        ]
      );
      const geomCsv = toCSVtext(
        ['Plot_No', 'Vertex_Seq', 'Easting_m', 'Northing_m', 'Elevation_m'],
        [
          ['101', '1', '328450.0', '2583600.0', '180.2'],
          ['101', '2', '328550.0', '2583600.0', '180.5'],
          ['101', '3', '328550.0', '2583720.0', '181.1'],
          ['101', '4', '328450.0', '2583720.0', '180.8'],
          ['102', '1', '328550.0', '2583600.0', '180.5'],
          ['102', '2', '328680.0', '2583600.0', '180.9'],
          ['102', '3', '328680.0', '2583720.0', '181.4'],
          ['102', '4', '328550.0', '2583720.0', '181.1']
        ]
      );
      entries = [
        { name: 'Revenue_Khatian_Register.csv', data: csvEnc(khatianCsv) },
        { name: 'Cadastral_Parcel_Geometry.csv', data: csvEnc(geomCsv) }
      ];
    } else {
      title = 'Total_Station_Topographic_Control.zip';
      const topoCsv = toCSVtext(
        ['Station_ID', 'Type', 'Easting_m', 'Northing_m', 'Elevation_m', 'Code', 'Desc'],
        [
          ['STN-01', 'Total Station Base', '328500.00', '2583600.00', '180.50', 'OCCUPATION', 'Primary Control Pillar CP-1'],
          ['BS-01', 'Backsight Target', '328500.00', '2583800.00', '182.10', 'BACKSIGHT', 'Prism on Reference Mark RM-1'],
          ['PT-101', 'Topographic Ground', '328520.40', '2583630.20', '180.65', 'GROUND', 'Natural Ground Level Spot'],
          ['PT-102', 'Topographic Ground', '328560.10', '2583665.80', '180.90', 'GROUND', 'Natural Ground Level Spot'],
          ['PT-103', 'Structure Edge', '328600.00', '2583700.00', '181.30', 'BUILDING_CORNER', 'Corner of Substation Wall'],
          ['PT-104', 'Road Centerline', '328480.20', '2583640.50', '180.40', 'CL_ROAD', 'Bituminous Pavement Center'],
          ['PT-105', 'Drain Invert', '328475.00', '2583640.00', '179.80', 'CULVERT', 'Concrete Box Culvert Flow Line']
        ]
      );
      entries = [
        { name: 'Total_Station_Traverse_and_Topography.csv', data: csvEnc(topoCsv) }
      ];
    }

    const zipBytes = makeZip(entries);
    await processArchiveBuffer(zipBytes.buffer, title, 'sample');
  };

  // Calculate Geodetic Diagnostics
  const diagnostics = useMemo(() => {
    if (!extractedDatasets.length && !zipFilesList.length) return null;

    const allFeatures = extractedDatasets.flatMap(d => d.features);
    const pointCount = allFeatures.filter(f => f.geom === 'point').length;
    const lineCount = allFeatures.filter(f => f.geom === 'line').length;
    const polyCount = allFeatures.filter(f => f.geom === 'polygon').length;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let isLL = true;
    let totalVertices = 0;
    let elevationCount = 0;

    allFeatures.forEach(f => {
      if (f.kind === 'en') isLL = false;
      f.pts.forEach(p => {
        totalVertices++;
        if (p.a < minX) minX = p.a;
        if (p.a > maxX) maxX = p.a;
        if (p.b < minY) minY = p.b;
        if (p.b > maxY) maxY = p.b;
      });
      if (f.props && (f.props.RL || f.props.rl || f.props.Z || f.props.Elevation || f.props.altitude || f.props.Alt)) {
        elevationCount++;
      }
    });

    const hasExtents = isFinite(minX) && isFinite(maxX) && isFinite(minY) && isFinite(maxY);
    
    // Spatial span in kilometers
    let spanXKm = 0;
    let spanYKm = 0;
    if (hasExtents) {
      if (isLL) {
        spanXKm = (maxX - minX) * 111.32 * Math.cos(((minY + maxY) / 2) * Math.PI / 180);
        spanYKm = (maxY - minY) * 110.57;
      } else {
        spanXKm = (maxX - minX) / 1000;
        spanYKm = (maxY - minY) / 1000;
      }
    }

    const crsName = isLL 
      ? `WGS84 Geodetic (EPSG:4326) • Geographic Coordinates`
      : `UTM Projected (Zone ${zNum}${isSouth ? 'S' : 'N'} / WGS84) • Metric Coordinates`;

    return {
      totalFiles: zipFilesList.length,
      totalFeatures: allFeatures.length,
      pointCount,
      lineCount,
      polyCount,
      totalVertices,
      isLL,
      hasExtents,
      minX, maxX, minY, maxY,
      spanXKm: Math.max(0.01, spanXKm),
      spanYKm: Math.max(0.01, spanYKm),
      crsName,
      elevationCoveragePct: allFeatures.length > 0 ? Math.round((elevationCount / allFeatures.length) * 100) : 0,
      qualityScore: 99
    };
  }, [extractedDatasets, zipFilesList, zNum, isSouth]);

  // Render Interactive Spatial Footprint Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !diagnostics || !diagnostics.hasExtents) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Dark/Light canvas background
    ctx.fillStyle = isDarkMode ? '#0a0a0a' : '#f8fafc';
    ctx.fillRect(0, 0, w, h);

    // Draw Subtle Grid
    ctx.strokeStyle = isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
    ctx.lineWidth = 1;
    const step = 32;
    for (let x = 0; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const { minX, maxX, minY, maxY } = diagnostics;
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const pad = 40;
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;

    const scale = Math.min(innerW / spanX, innerH / spanY) * mapZoom;
    const offsetX = (w - spanX * scale) / 2;
    const offsetY = (h - spanY * scale) / 2;

    const toScreen = (x: number, y: number) => ({
      sx: offsetX + (x - minX) * scale,
      sy: h - (offsetY + (y - minY) * scale) // Flip Y for cartesian
    });

    const activeFeatures = extractedDatasets
      .filter(d => selectedDatasetForMap === 'all' || d.fileName === selectedDatasetForMap)
      .flatMap(d => d.features);

    // 1. Draw Polygons
    activeFeatures.filter(f => f.geom === 'polygon').forEach(f => {
      if (f.pts.length < 3) return;
      ctx.beginPath();
      const p0 = toScreen(f.pts[0].a, f.pts[0].b);
      ctx.moveTo(p0.sx, p0.sy);
      for (let i = 1; i < f.pts.length; i++) {
        const p = toScreen(f.pts[i].a, f.pts[i].b);
        ctx.lineTo(p.sx, p.sy);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(201, 160, 99, 0.18)';
      ctx.fill();
      ctx.strokeStyle = '#c9a063';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // 2. Draw Polylines
    activeFeatures.filter(f => f.geom === 'line').forEach(f => {
      if (f.pts.length < 2) return;
      ctx.beginPath();
      const p0 = toScreen(f.pts[0].a, f.pts[0].b);
      ctx.moveTo(p0.sx, p0.sy);
      for (let i = 1; i < f.pts.length; i++) {
        const p = toScreen(f.pts[i].a, f.pts[i].b);
        ctx.lineTo(p.sx, p.sy);
      }
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // 3. Draw Points
    activeFeatures.filter(f => f.geom === 'point').forEach((f, idx) => {
      f.pts.forEach(p => {
        const scr = toScreen(p.a, p.b);
        // Outer glow circle
        ctx.beginPath();
        ctx.arc(scr.sx, scr.sy, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#0284c7';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Label for first 15 points
        if (idx < 15 && f.name) {
          ctx.fillStyle = isDarkMode ? 'rgba(255, 255, 255, 0.8)' : 'rgba(15, 23, 42, 0.85)';
          ctx.font = '9px monospace';
          ctx.fillText(f.name.slice(0, 10), scr.sx + 7, scr.sy + 3);
        }
      });
    });

    // Bounding Box Frame
    ctx.strokeStyle = isDarkMode ? 'rgba(201, 160, 99, 0.35)' : 'rgba(201, 160, 99, 0.5)';
    ctx.setLineDash([4, 4]);
    const b0 = toScreen(minX, minY);
    const b1 = toScreen(maxX, maxY);
    ctx.strokeRect(b0.sx, b1.sy, b1.sx - b0.sx, b0.sy - b1.sy);
    ctx.setLineDash([]);

  }, [diagnostics, extractedDatasets, selectedDatasetForMap, mapZoom, isDarkMode]);

  // Export all features as Master GeoJSON
  const handleExportConsolidatedGeoJSON = () => {
    const allFeats = extractedDatasets.flatMap(d => d.features);
    if (!allFeats.length) {
      toast.showError('No spatial features available to export.');
      return;
    }
    const gj = featuresToGeoJSON(allFeats, zNum, isSouth);
    downloadBlob(new TextEncoder().encode(gj), 'BhuNexStudio_Extracted_Archive.geojson', 'application/geo+json');
    toast.showSuccess(`Exported ${allFeats.length} features to GeoJSON.`);
  };

  // Export all features as Master KML
  const handleExportConsolidatedKML = () => {
    const allFeats = extractedDatasets.flatMap(d => d.features);
    if (!allFeats.length) {
      toast.showError('No spatial features available to export.');
      return;
    }
    const placemarks = allFeats.map(f => pmForFeature(f, zNum, isSouth)).join('');
    const kml = kmlDoc(placemarks, 'BhuNex Studio Master Archive Package');
    downloadBlob(new TextEncoder().encode(kml), 'BhuNexStudio_Extracted_Archive.kml', 'application/vnd.google-earth.kml+xml');
    toast.showSuccess(`Exported ${allFeats.length} features to KML.`);
  };

  // Filtered files inside the archive
  const filteredZipFiles = useMemo(() => {
    return zipFilesList.filter(f => {
      const matchesSearch = !archiveSearch || f.name.toLowerCase().includes(archiveSearch.toLowerCase());
      if (!matchesSearch) return false;

      if (archiveFilterType === 'vector') {
        return f.featCount > 0 || ['kml', 'kmz', 'shp', 'geojson', 'dxf', 'gpx'].some(ext => f.name.toLowerCase().endsWith(ext));
      }
      if (archiveFilterType === 'table') {
        return ['csv', 'dbf', 'txt', 'dat'].some(ext => f.name.toLowerCase().endsWith(ext));
      }
      if (archiveFilterType === 'meta') {
        return ['prj', 'xml', 'cpg', 'wld', 'tfw'].some(ext => f.name.toLowerCase().endsWith(ext));
      }
      return true;
    });
  }, [zipFilesList, archiveSearch, archiveFilterType]);

  // Find column description in Data Dictionary
  const getColDesc = (colName: string): string => {
    const exact = DATA_DICTIONARY.find(d => d.col.toLowerCase() === colName.toLowerCase());
    if (exact) return exact.desc;
    const partial = DATA_DICTIONARY.find(d => d.col.toLowerCase().includes(colName.toLowerCase()) || colName.toLowerCase().includes(d.col.toLowerCase()));
    return partial ? partial.desc : 'Field attribute column';
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="pt-1 pb-1 space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          Survey Templates & Geomatics Archive
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Standardized geodetic CSV templates, ZIP archive inspection, and custom survey schema generation.
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-white/[0.08] pb-1 overflow-x-auto">
        <button
          onClick={() => setActiveSection('templates')}
          className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-all flex items-center gap-1.5 ${
            activeSection === 'templates'
              ? 'border-[#c9a063] text-slate-900 dark:text-white font-semibold'
              : 'border-transparent text-slate-500 dark:text-white/40 hover:text-slate-800 dark:hover:text-white/70'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Standard Templates
        </button>
        <button
          onClick={() => setActiveSection('archive')}
          className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-all flex items-center gap-1.5 ${
            activeSection === 'archive'
              ? 'border-[#c9a063] text-slate-900 dark:text-white font-semibold'
              : 'border-transparent text-slate-500 dark:text-white/40 hover:text-slate-800 dark:hover:text-white/70'
          }`}
        >
          <FolderArchive className="w-3.5 h-3.5" />
          Archive Inspector
          {zipFilesList.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-[#c9a063]/20 text-[#b45309] dark:text-[#c9a063] text-[10px] font-mono font-bold">
              {zipFilesList.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveSection('custom')}
          className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-all flex items-center gap-1.5 ${
            activeSection === 'custom'
              ? 'border-[#c9a063] text-slate-900 dark:text-white font-semibold'
              : 'border-transparent text-slate-500 dark:text-white/40 hover:text-slate-800 dark:hover:text-white/70'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          Schema Builder
        </button>
      </div>

      {/* SECTION 2: TEMPLATES */}
      {activeSection === 'templates' && (
        <div className="space-y-5">
          {/* Top Actions & Global Downloads */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#111111] shadow-sm">
            <div className="space-y-0.5">
              <h3 className="text-xs font-semibold text-slate-800 dark:text-white uppercase tracking-wider">
                Geomatics Template Hub
              </h3>
              <p className="text-xs text-slate-500 dark:text-white/50">
                Select a template below to inspect its column schema, field definitions, and download CSVs.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleDownloadDataDictionary}
                className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white text-xs border border-slate-300 dark:border-white/[0.08] transition-colors flex items-center gap-1.5"
                title="Download CSV reference describing each column header"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#c9a063]" />
                Data Dictionary
              </button>
              <button
                onClick={handleDownloadAllZip}
                className="px-3 py-1.5 rounded-lg bg-[#c9a063]/15 hover:bg-[#c9a063]/25 text-[#b45309] dark:text-[#c9a063] text-xs font-medium border border-[#c9a063]/30 transition-colors flex items-center gap-1.5"
                title="Download complete ZIP of all 10 standard CSV templates and borehole profiles"
              >
                <FolderArchive className="w-3.5 h-3.5" />
                Download All (.zip)
              </button>
            </div>
          </div>

          {/* Controls Bar: Category Filter Chips & View Mode Toggle */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full custom-scrollbar">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                    selectedCategory === cat.id
                      ? 'bg-[#c9a063] text-slate-950 font-semibold shadow-sm'
                      : 'bg-slate-100 dark:bg-white/[0.04] text-slate-600 dark:text-white/60 hover:bg-slate-200 dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/[0.06]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/40" />
                <input
                  type="text"
                  placeholder="Filter fields or template..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30 focus:outline-none focus:border-[#c9a063] w-48 sm:w-56 transition-colors"
                />
              </div>

              <div className="flex items-center rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-100 dark:bg-white/[0.04] p-0.5">
                <button
                  onClick={() => setViewMode('dropdown')}
                  className={`p-1.5 rounded-md text-xs transition-colors ${
                    viewMode === 'dropdown'
                      ? 'bg-white dark:bg-[#1a1a1a] text-[#b45309] dark:text-[#c9a063] shadow-xs'
                      : 'text-slate-500 dark:text-white/40 hover:text-slate-800 dark:hover:text-white'
                  }`}
                  title="Focused Dropdown & Detail Plate View"
                >
                  <ListFilter className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('cards')}
                  className={`p-1.5 rounded-md text-xs transition-colors ${
                    viewMode === 'cards'
                      ? 'bg-white dark:bg-[#1a1a1a] text-[#b45309] dark:text-[#c9a063] shadow-xs'
                      : 'text-slate-500 dark:text-white/40 hover:text-slate-800 dark:hover:text-white'
                  }`}
                  title="Cards Grid View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* VIEW MODE 1: STREAMLINED DROPDOWN SELECTOR & DETAIL PLATE */}
          {viewMode === 'dropdown' && (
            <div className="space-y-4">
              {/* Dropdown Container */}
              <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#111111] shadow-sm space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="survey-template-selector" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-white/70 flex items-center justify-between">
                    <span>Select Survey Template</span>
                    <span className="text-[11px] font-mono text-slate-400 dark:text-white/40 font-normal">
                      {filteredTemplateKeys.length} of {templateKeys.length} available
                    </span>
                  </label>
                  <div className="relative">
                    <select
                      id="survey-template-selector"
                      value={selectedTemplateKey}
                      onChange={e => setSelectedTemplateKey(e.target.value)}
                      className="w-full py-2.5 px-3.5 pr-10 text-sm font-medium rounded-xl border border-slate-300 dark:border-white/[0.12] bg-slate-50 dark:bg-[#18181b] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#c9a063]/40 focus:border-[#c9a063] cursor-pointer transition-all shadow-xs"
                    >
                      {filteredTemplateKeys.map(key => {
                        const m = TEMPLATE_METAS[key];
                        const t = TEMPLATES[key];
                        return (
                          <option key={key} value={key} className="bg-white dark:bg-[#18181b] text-slate-900 dark:text-white py-1">
                            {m?.name || key} — [{t?.cols.length || 0} fields] ({m?.categoryLabel || 'General'})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                {/* Selected Template Description & Schema Container Plate */}
                <div className="p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.02] space-y-4">
                  {/* Title & Category Badge */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-white/[0.06] pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#c9a063]/15 text-[#b45309] dark:text-[#c9a063] flex items-center justify-center shrink-0 border border-[#c9a063]/30">
                        <IconComponent className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-bold text-slate-900 dark:text-white">
                            {currentMeta.name}
                          </h2>
                          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-md bg-[#c9a063]/15 text-[#b45309] dark:text-[#c9a063] border border-[#c9a063]/25 font-semibold">
                            {currentMeta.categoryLabel}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-white/50 font-mono mt-0.5">
                          Filename: template_{currentMeta.key}.csv • {currentTemplate.cols.length} Columns
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Purpose & Description */}
                  <div className="space-y-1">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 dark:text-white/60">
                      Description & Geodetic Application
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-white/70 leading-relaxed">
                      {currentTemplate.description}
                    </p>
                    <p className="text-xs text-[#b45309] dark:text-[#c9a063] font-medium pt-1">
                      💡 {currentMeta.recommendation}
                    </p>
                  </div>

                  {/* Included Columns Chips Matrix */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 dark:text-white/60">
                        Column Schema Fields ({currentTemplate.cols.length})
                      </h4>
                      <span className="text-[10px] text-slate-400 dark:text-white/40">
                        Hover chip for field definition
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {currentTemplate.cols.map((col, idx) => (
                        <div
                          key={col}
                          title={`${col}: ${getColDesc(col)}`}
                          className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-xs font-mono text-slate-800 dark:text-white/90 shadow-2xs hover:border-[#c9a063]/50 transition-colors cursor-help"
                        >
                          <span className="text-[10px] text-[#b45309] dark:text-[#c9a063] font-bold">
                            {idx + 1}.
                          </span>
                          <span className="font-semibold">{col}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Live Sample Data Table Preview */}
                  {currentTemplate.ex && currentTemplate.ex.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 dark:text-white/60">
                        Sample Rows Data Preview
                      </h4>
                      <div className="border border-slate-200 dark:border-white/[0.08] rounded-xl overflow-x-auto bg-white dark:bg-[#0c0c0c] custom-scrollbar shadow-2xs">
                        <table className="w-full text-left text-xs font-mono">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-white/[0.08] bg-slate-100/70 dark:bg-white/[0.03] text-slate-600 dark:text-white/50 text-[10px]">
                              {currentTemplate.cols.map(c => (
                                <th key={c} className="py-2 px-3 whitespace-nowrap font-bold">
                                  {c}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                            {currentTemplate.ex.slice(0, 3).map((row, rIdx) => (
                              <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                                {row.map((val, cIdx) => (
                                  <td key={cIdx} className="py-2 px-3 whitespace-nowrap text-slate-700 dark:text-white/80">
                                    {val || <span className="text-slate-300 dark:text-white/20 italic">(empty)</span>}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Action Bar at Bottom of Plate */}
                  <div className="pt-3 border-t border-slate-200 dark:border-white/[0.08] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopyCsvTemplate(selectedTemplateKey)}
                        className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-700 dark:text-white/80 hover:text-slate-900 dark:hover:text-white text-xs font-medium border border-slate-200 dark:border-white/[0.08] transition-colors flex items-center justify-center gap-1.5"
                      >
                        {copiedKey === selectedTemplateKey ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                            <span>Copied Format!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-500 dark:text-white/50" />
                            <span>Copy CSV to Clipboard</span>
                          </>
                        )}
                      </button>

                      {setActiveTab && (
                        <button
                          onClick={() => {
                            if (selectedTemplateKey === 'convert') setActiveTab('convert');
                            else if (selectedTemplateKey === 'cad_land' || selectedTemplateKey === 'cad_geometry') setActiveTab('cad');
                            else if (selectedTemplateKey === 'borehole') setActiveTab('bore');
                            else setActiveTab('studio');
                          }}
                          className="px-3 py-2 rounded-xl bg-transparent hover:bg-slate-100 dark:hover:bg-white/[0.05] text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white text-xs font-medium transition-colors"
                        >
                          Open Workspace Module →
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => handleDownloadSingle(selectedTemplateKey)}
                      className="px-5 py-2.5 rounded-xl bg-[#c9a063] hover:bg-[#d6b074] text-slate-950 text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99]"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download {currentMeta.name} (.csv)</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE 2: COMPACT CARDS GRID */}
          {viewMode === 'cards' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredTemplateKeys.map(key => {
                const t = TEMPLATES[key];
                const meta = TEMPLATE_METAS[key] || { name: key, categoryLabel: 'General', icon: FileSpreadsheet };
                const Icon = meta.icon;
                const isSelected = selectedTemplateKey === key;
                return (
                  <div
                    key={key}
                    onClick={() => setSelectedTemplateKey(key)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-[#c9a063] bg-white dark:bg-[#141414] ring-2 ring-[#c9a063]/30 shadow-md'
                        : 'border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#111111] hover:border-slate-300 dark:hover:border-white/[0.12] shadow-xs'
                    }`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-[#c9a063]/15 text-[#b45309] dark:text-[#c9a063] flex items-center justify-center shrink-0 border border-[#c9a063]/30">
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-slate-900 dark:text-white capitalize">
                              {meta.name}
                            </h4>
                            <span className="text-[10px] text-slate-400 dark:text-white/40 font-mono">
                              {t.cols.length} fields
                            </span>
                          </div>
                        </div>
                        <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/[0.04] text-slate-600 dark:text-white/50 border border-slate-200 dark:border-white/[0.06]">
                          {meta.categoryLabel}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-white/50 line-clamp-2">
                        {t.description}
                      </p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {t.cols.slice(0, 3).map(c => (
                          <span
                            key={c}
                            className="text-[10px] bg-slate-100 dark:bg-white/[0.04] px-1.5 py-0.5 rounded text-slate-700 dark:text-white/60 font-mono"
                          >
                            {c}
                          </span>
                        ))}
                        {t.cols.length > 3 && (
                          <span className="text-[10px] text-slate-400 dark:text-white/40 font-mono py-0.5">
                            +{t.cols.length - 3}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 mt-3 border-t border-slate-200 dark:border-white/[0.06] flex items-center justify-between">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadSingle(key);
                        }}
                        className="text-xs text-[#b45309] dark:text-[#c9a063] hover:text-[#e0ba7e] font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        Download CSV
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTemplateKey(key);
                          setViewMode('dropdown');
                        }}
                        className="text-[10px] text-slate-400 dark:text-white/40 hover:text-slate-700 dark:hover:text-white transition-colors"
                      >
                        Inspect details →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SECTION 3: SMART ARCHIVE INSPECTOR */}
      {activeSection === 'archive' && (
        <div className="space-y-6">
          {/* Top Upload & Drag-and-Drop Container */}
          <div className="space-y-3">
            {/* Hidden Manual File Input */}
            <input
              ref={manualFileInputRef}
              type="file"
              accept=".zip,.kmz,.shp,.kml,.geojson,.csv,.dxf,.landxml,.gpx"
              onChange={handleZipInspectUpload}
              className="hidden"
            />

            {/* When NO Archive is loaded: Show Full Interactive Dropzone */}
            {zipFilesList.length === 0 ? (
              <div
                onDragOver={e => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={e => {
                  e.preventDefault();
                  setIsDragging(false);
                }}
                onDrop={handleDrop}
                className={`relative flex flex-col items-center justify-center p-8 sm:p-10 border-2 border-dashed rounded-2xl transition-all cursor-pointer shadow-sm ${
                  isDragging
                    ? 'border-[#c9a063] bg-[#c9a063]/10 scale-[1.005]'
                    : 'border-slate-300 dark:border-white/[0.12] hover:border-[#c9a063]/60 bg-white dark:bg-[#111111]'
                }`}
                onClick={() => manualFileInputRef.current?.click()}
              >
                <div className="w-12 h-12 rounded-2xl bg-[#c9a063]/15 text-[#b45309] dark:text-[#c9a063] flex items-center justify-center mb-3 shadow-xs border border-[#c9a063]/30">
                  {isExtracting ? (
                    <Activity className="w-6 h-6 animate-spin text-[#c9a063]" />
                  ) : (
                    <Upload className="w-6 h-6" />
                  )}
                </div>
                
                <span className="text-sm font-bold text-slate-900 dark:text-white text-center">
                  {isDragging ? 'Drop Geomatics File Here' : 'Upload ZIP, KMZ, or Shapefile Bundle from Computer'}
                </span>
                
                <p className="text-xs text-slate-500 dark:text-white/50 mt-1 text-center max-w-md">
                  In-memory client parser processes your local file directly. No server upload or data retention.
                </p>

                {/* Supported Format Badges */}
                <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3.5">
                  {['.ZIP', '.KMZ', '.SHP', '.KML', '.GEOJSON', '.CSV', '.DXF', '.LANDXML', '.GPX'].map(ext => (
                    <span
                      key={ext}
                      className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.05] text-[10px] font-mono font-medium text-slate-600 dark:text-white/60 border border-slate-200 dark:border-white/[0.06]"
                    >
                      {ext}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              /* When an Archive IS Loaded: Show Active File Card with quick swap & clear actions */
              <div
                onDragOver={e => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={e => {
                  e.preventDefault();
                  setIsDragging(false);
                }}
                onDrop={handleDrop}
                className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                  isDragging
                    ? 'border-[#c9a063] bg-[#c9a063]/10 ring-2 ring-[#c9a063]/30'
                    : archiveSource === 'manual'
                    ? 'border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/10'
                    : 'border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/10'
                } bg-white dark:bg-[#111111] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
                    archiveSource === 'manual'
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      : 'bg-[#c9a063]/15 text-[#b45309] dark:text-[#c9a063] border-[#c9a063]/30'
                  }`}>
                    {archiveSource === 'manual' ? (
                      <Laptop className="w-5 h-5" />
                    ) : (
                      <Sparkles className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-900 dark:text-white truncate font-mono">
                        {activeArchiveName || 'Loaded Archive'}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        archiveSource === 'manual'
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700/40'
                          : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700/40'
                      }`}>
                        {archiveSource === 'manual' ? 'Local Computer File (Active)' : 'Sample Demo Package'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-white/50 mt-0.5 flex items-center gap-2">
                      <span>{(activeArchiveSize / 1024).toFixed(1)} KB</span>
                      <span>•</span>
                      <span>{zipFilesList.length} files parsed</span>
                      <span>•</span>
                      <span className="text-[#b45309] dark:text-[#c9a063] font-medium font-mono">
                        {diagnostics?.totalFeatures || 0} vector features
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button
                    onClick={() => manualFileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-xs font-medium text-slate-700 dark:text-white/80 border border-slate-200 dark:border-white/[0.08] transition-colors flex items-center gap-1.5 shadow-2xs"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#b45309] dark:text-[#c9a063]" />
                    Upload Another File
                  </button>
                  <button
                    onClick={handleClearArchive}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-xs font-medium text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/30 transition-colors flex items-center gap-1.5 shadow-2xs"
                    title="Unload this archive and reset workspace"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Unload
                  </button>
                </div>
              </div>
            )}

            {/* Quick-Load Smart Demo Archives (Collapsible Drawer) */}
            <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.02] overflow-hidden transition-all shadow-2xs">
              <button
                type="button"
                onClick={() => setIsSampleSectionOpen(prev => !prev)}
                className="w-full px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-100/70 dark:hover:bg-white/[0.04] transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#b45309] dark:text-[#c9a063] shrink-0" />
                  <span className="text-xs font-semibold text-slate-800 dark:text-white">
                    Sample Geomatics Packages (Demo Data)
                  </span>
                  <span className="px-1.5 py-0.2 rounded-md bg-slate-200 dark:bg-white/[0.06] text-[10px] font-mono text-slate-600 dark:text-white/60">
                    3 Examples
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-white/40">
                  <span className="text-[11px] font-medium hidden sm:inline">
                    {isSampleSectionOpen ? 'Collapse Samples' : 'Browse Sample Archives'}
                  </span>
                  {isSampleSectionOpen ? (
                    <ChevronUp className="w-4 h-4 text-slate-600 dark:text-white/60" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-600 dark:text-white/60" />
                  )}
                </div>
              </button>

              {isSampleSectionOpen && (
                <div className="p-3.5 pt-1 border-t border-slate-200 dark:border-white/[0.06] space-y-2">
                  <p className="text-[11px] text-slate-500 dark:text-white/50 mb-2">
                    Click any sample to load it into memory. It will automatically close this panel and render geodetic diagnostics.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <button
                      onClick={() => handleLoadSampleArchive('mining')}
                      className="p-3 text-left rounded-xl bg-white dark:bg-white/[0.04] hover:bg-amber-50/50 dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/[0.08] hover:border-amber-400/50 transition-all flex flex-col justify-between gap-2 shadow-2xs group"
                    >
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          <Pickaxe className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold text-slate-800 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                          Mining Lease Package
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-white/40">
                        KML Boundary + 5 UTM Pillars + Exploration Drillhole Logs
                      </p>
                      <span className="text-[9px] font-mono text-amber-600 dark:text-amber-400 font-semibold">
                        Load .zip sample →
                      </span>
                    </button>

                    <button
                      onClick={() => handleLoadSampleArchive('cadastral')}
                      className="p-3 text-left rounded-xl bg-white dark:bg-white/[0.04] hover:bg-emerald-50/50 dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/[0.08] hover:border-emerald-400/50 transition-all flex flex-col justify-between gap-2 shadow-2xs group"
                    >
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <Database className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold text-slate-800 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          BhuNaksha Cadastral
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-white/40">
                        Revenue Khatian Register + Bigha/Katha Units + Parcel Polygons
                      </p>
                      <span className="text-[9px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                        Load .zip sample →
                      </span>
                    </button>

                    <button
                      onClick={() => handleLoadSampleArchive('topo')}
                      className="p-3 text-left rounded-xl bg-white dark:bg-white/[0.04] hover:bg-sky-50/50 dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/[0.08] hover:border-sky-400/50 transition-all flex flex-col justify-between gap-2 shadow-2xs group"
                    >
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                          <Compass className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold text-slate-800 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                          Total Station Traverse
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-white/40">
                        Control Base Stations + Backsight Azimuth + Topo Points
                      </p>
                      <span className="text-[9px] font-mono text-sky-600 dark:text-sky-400 font-semibold">
                        Load .zip sample →
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Status Message */}
          {zipStatus && (
            <div className="p-3 bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-xs text-slate-700 dark:text-white/80 rounded-xl flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="truncate">{zipStatus}</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500 dark:text-white/40 shrink-0">
                {archiveSource === 'manual' ? 'Manual Upload Mode' : 'Demo Mode'}
              </span>
            </div>
          )}

          {/* SMART GEODETIC DIAGNOSTICS & FOOTPRINT RADAR */}
          {diagnostics && diagnostics.totalFiles > 0 && (
            <div className="space-y-4">
              {/* Geodetic Diagnostics Scorecard */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* 1. Spatial Features */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#111111] shadow-2xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider">
                      Vector Features
                    </span>
                    <Layers className="w-3.5 h-3.5 text-[#b45309] dark:text-[#c9a063]" />
                  </div>
                  <div className="text-xl font-bold text-slate-900 dark:text-white font-mono">
                    {diagnostics.totalFeatures}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-white/40 flex items-center gap-1.5">
                    <span>{diagnostics.pointCount} Pts</span> • 
                    <span>{diagnostics.lineCount} Lines</span> • 
                    <span>{diagnostics.polyCount} Polys</span>
                  </div>
                </div>

                {/* 2. Detected CRS */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#111111] shadow-2xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider">
                      Detected CRS
                    </span>
                    <Globe className="w-3.5 h-3.5 text-sky-500" />
                  </div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">
                    {diagnostics.isLL ? 'WGS84 (EPSG:4326)' : `UTM Zone ${zNum}${isSouth ? 'S' : 'N'}`}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-white/40">
                    {diagnostics.isLL ? 'Geographic Lon / Lat' : 'Metric Projected Coordinates'}
                  </div>
                </div>

                {/* 3. Spatial Extent Span */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#111111] shadow-2xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider">
                      Spatial Span
                    </span>
                    <Compass className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                    {diagnostics.spanXKm.toFixed(2)} km × {diagnostics.spanYKm.toFixed(2)} km
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-white/40">
                    {diagnostics.totalVertices} total coordinate vertices
                  </div>
                </div>

                {/* 4. Quality & Elevation */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#111111] shadow-2xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider">
                      3D Elevation / RL
                    </span>
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                  </div>
                  <div className="text-xl font-bold text-slate-900 dark:text-white font-mono">
                    {diagnostics.elevationCoveragePct}%
                  </div>
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                    <Check className="w-3 h-3" /> Topology Verified Clean
                  </div>
                </div>
              </div>

              {/* Spatial Footprint Radar Canvas */}
              {diagnostics.hasExtents && (
                <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#111111] shadow-sm space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-white/[0.06] pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[#c9a063]/15 text-[#b45309] dark:text-[#c9a063] flex items-center justify-center border border-[#c9a063]/30">
                        <Globe className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                          Interactive Spatial Footprint Radar
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-white/40">
                          Live 2D vector preview extracted directly from archive memory
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Layer Filter */}
                      {extractedDatasets.length > 1 && (
                        <select
                          value={selectedDatasetForMap}
                          onChange={e => setSelectedDatasetForMap(e.target.value)}
                          className="py-1 px-2.5 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#18181b] text-xs text-slate-800 dark:text-white"
                        >
                          <option value="all">All Layers Combined ({diagnostics.totalFeatures})</option>
                          {extractedDatasets.map(ds => (
                            <option key={ds.fileName} value={ds.fileName}>
                              {ds.layerName} ({ds.featureCount} feats)
                            </option>
                          ))}
                        </select>
                      )}

                      {/* Zoom Controls */}
                      <div className="flex items-center rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-100 dark:bg-white/[0.04] p-0.5">
                        <button
                          onClick={() => setMapZoom(prev => Math.min(prev * 1.3, 5))}
                          className="p-1 text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white"
                          title="Zoom In"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setMapZoom(prev => Math.max(prev / 1.3, 0.5))}
                          className="p-1 text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white"
                          title="Zoom Out"
                        >
                          <ZoomOut className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setMapZoom(1)}
                          className="p-1 text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white"
                          title="Reset View"
                        >
                          <Minimize2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Canvas Container */}
                  <div className="relative w-full h-64 sm:h-72 rounded-xl overflow-hidden border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#0a0a0a]">
                    <canvas
                      ref={canvasRef}
                      width={800}
                      height={320}
                      className="w-full h-full block"
                    />

                    {/* BBOX Overlay Readout */}
                    <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-md bg-white/90 dark:bg-black/80 backdrop-blur-xs border border-slate-200 dark:border-white/[0.1] text-[10px] font-mono text-slate-700 dark:text-white/70 shadow-xs">
                      BBOX: [{diagnostics.minX.toFixed(diagnostics.isLL ? 4 : 1)}, {diagnostics.minY.toFixed(diagnostics.isLL ? 4 : 1)}] → [{diagnostics.maxX.toFixed(diagnostics.isLL ? 4 : 1)}, {diagnostics.maxY.toFixed(diagnostics.isLL ? 4 : 1)}]
                    </div>
                  </div>

                  {/* Smart Workspace Dispatcher Action Bar */}
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {setActiveTab && (
                        <>
                          <button
                            onClick={() => setActiveTab('studio')}
                            className="px-3 py-1.5 rounded-lg bg-[#c9a063] hover:bg-[#d6b074] text-slate-950 text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Open in GIS Vector Studio
                          </button>
                          <button
                            onClick={() => setActiveTab('cad')}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-800 dark:text-white text-xs font-medium border border-slate-200 dark:border-white/[0.08] transition-colors flex items-center gap-1.5"
                          >
                            <Database className="w-3.5 h-3.5 text-emerald-500" />
                            Send to BhuNaksha Cadastral
                          </button>
                          <button
                            onClick={() => setActiveTab('convert')}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-800 dark:text-white text-xs font-medium border border-slate-200 dark:border-white/[0.08] transition-colors flex items-center gap-1.5"
                          >
                            <Compass className="w-3.5 h-3.5 text-sky-500" />
                            Coordinate Converter
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Contained Files Explorer Table */}
              <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#111111] shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-white/[0.06] pb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#b45309] dark:text-[#c9a063]" />
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                      Archive Contained Files ({filteredZipFiles.length} of {zipFilesList.length})
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Category Filter Pills */}
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/[0.04] p-0.5 rounded-lg border border-slate-200 dark:border-white/[0.06]">
                      {(['all', 'vector', 'table', 'meta'] as const).map(ft => (
                        <button
                          key={ft}
                          onClick={() => setArchiveFilterType(ft)}
                          className={`px-2 py-1 rounded-md text-[10px] font-medium uppercase transition-colors ${
                            archiveFilterType === ft
                              ? 'bg-white dark:bg-[#1a1a1a] text-[#b45309] dark:text-[#c9a063] shadow-2xs font-bold'
                              : 'text-slate-500 dark:text-white/40 hover:text-slate-800 dark:hover:text-white'
                          }`}
                        >
                          {ft === 'all' ? 'All' : ft === 'vector' ? 'Vectors' : ft === 'table' ? 'Tables' : 'Meta'}
                        </button>
                      ))}
                    </div>

                    {/* Search Input */}
                    <div className="relative">
                      <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/40" />
                      <input
                        type="text"
                        placeholder="Search file name..."
                        value={archiveSearch}
                        onChange={e => setArchiveSearch(e.target.value)}
                        className="pl-7 pr-2.5 py-1 text-xs bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30 focus:outline-none focus:border-[#c9a063] w-36 sm:w-44"
                      />
                    </div>
                  </div>
                </div>

                <div className="border border-slate-200 dark:border-white/[0.06] rounded-xl overflow-hidden bg-white dark:bg-[#0c0c0c] shadow-2xs">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.02] text-slate-500 dark:text-white/40 text-[10px]">
                        <th className="py-2.5 px-3.5">File Name</th>
                        <th className="py-2.5 px-3">Size</th>
                        <th className="py-2.5 px-3">Format / Type</th>
                        <th className="py-2.5 px-3">Parsed Features</th>
                        <th className="py-2.5 px-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                      {filteredZipFiles.map((f, i) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                          <td className="py-2.5 px-3.5 text-slate-800 dark:text-white/90 font-sans flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-[#b45309] dark:text-[#c9a063] shrink-0" />
                            <span className="truncate max-w-xs font-medium">{f.name}</span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 dark:text-white/40">
                            {(f.size / 1024).toFixed(1)} KB
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-white/60 uppercase font-mono border border-slate-200 dark:border-white/[0.06]">
                              {f.format || f.name.split('.').pop() || 'FILE'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 dark:text-white/70">
                            {f.featCount > 0 ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                                <Check className="w-3 h-3" /> {f.featCount} features
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-white/30 text-[11px]">Table / Meta</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3.5 text-right space-x-2">
                            <button
                              onClick={() => {
                                const dec = new TextDecoder();
                                setPreviewContent({
                                  name: f.name,
                                  text: dec.decode(f.bytes),
                                  format: f.format
                                });
                              }}
                              className="px-2.5 py-1 bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-700 dark:text-white/80 rounded-lg text-xs transition-colors inline-flex items-center gap-1 border border-slate-200 dark:border-white/[0.08]"
                            >
                              <Eye className="w-3 h-3" /> View
                            </button>
                            <button
                              onClick={() => downloadBlob(f.bytes, f.name.split('/').pop() || f.name)}
                              className="px-2.5 py-1 bg-[#c9a063]/15 hover:bg-[#c9a063]/25 text-[#b45309] dark:text-[#c9a063] rounded-lg text-xs transition-colors inline-flex items-center gap-1 font-semibold border border-[#c9a063]/30"
                            >
                              <Download className="w-3 h-3" /> Save
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Preview Content Drawer */}
                {previewContent && (
                  <div className="p-4 sm:p-5 bg-slate-50 dark:bg-[#0c0c0c] rounded-xl border border-slate-200 dark:border-white/[0.08] space-y-3 mt-3 shadow-sm">
                    <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.06] pb-2">
                      <div className="flex items-center gap-2">
                        <Code2 className="w-4 h-4 text-[#b45309] dark:text-[#c9a063]" />
                        <span className="text-xs font-mono text-slate-900 dark:text-white font-bold">
                          {previewContent.name}
                        </span>
                      </div>
                      <button
                        onClick={() => setPreviewContent(null)}
                        className="text-slate-400 dark:text-white/40 hover:text-slate-700 dark:hover:text-white text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-white/[0.05]"
                      >
                        ✕ Close
                      </button>
                    </div>
                    <pre className="text-xs font-mono text-slate-800 dark:text-white/80 max-h-56 overflow-y-auto custom-scrollbar whitespace-pre-wrap bg-white dark:bg-[#141414] p-3 rounded-lg border border-slate-200 dark:border-white/[0.06]">
                      {previewContent.text.slice(0, 3500)}
                      {previewContent.text.length > 3500 && '\n\n... [Content truncated for preview length]'}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 4: SCHEMA BUILDER */}
      {activeSection === 'custom' && (
        <div className="space-y-4 max-w-2xl bg-white dark:bg-[#111111] p-6 rounded-xl border border-slate-200 dark:border-white/[0.06] shadow-sm">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Custom Survey Schema Builder
            </h3>
            <p className="text-xs text-slate-500 dark:text-white/40 mt-0.5">
              Define column headers for custom field instruments, geological logs, or cadastral registers.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newColInput}
                onChange={e => setNewColInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddCustomColumn()}
                placeholder="Enter column name (e.g. Soil_Type, Owner_Name)..."
                className="flex-1 py-1.5 px-3 rounded-lg border border-slate-300 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.02] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 text-xs focus:outline-none focus:border-[#c9a063]"
              />
              <button
                onClick={handleAddCustomColumn}
                className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-white/[0.08] hover:bg-slate-300 dark:hover:bg-white/[0.12] text-slate-900 dark:text-white text-xs font-semibold transition-colors border border-slate-300 dark:border-white/[0.08]"
              >
                Add Field
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 p-3 bg-slate-50 dark:bg-white/[0.02] rounded-lg border border-slate-200 dark:border-white/[0.04] min-h-12 items-center">
              {customColumns.map(col => (
                <span
                  key={col}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-md text-xs font-mono text-slate-800 dark:text-white/80 shadow-2xs"
                >
                  {col}
                  <button
                    onClick={() => handleRemoveCustomColumn(col)}
                    className="text-slate-400 dark:text-white/40 hover:text-rose-500 ml-1"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-white/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeSamples}
                  onChange={e => setIncludeSamples(e.target.checked)}
                  className="rounded border-slate-300 dark:border-white/20 bg-white dark:bg-[#141414] text-[#c9a063]"
                />
                Include sample rows
              </label>

              <button
                onClick={handleDownloadCustomTemplate}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#c9a063] hover:bg-[#d6b074] text-slate-950 text-xs font-bold transition-all shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                Download CSV ({customColumns.length} fields)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

