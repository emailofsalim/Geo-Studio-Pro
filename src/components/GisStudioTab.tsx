import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useIsDarkMode } from '../hooks/useIsDarkMode';
import {
  Layers,
  MapPin,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Upload,
  Download,
  Search,
  Sliders,
  Sparkles,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Ruler,
  FileSpreadsheet,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  Compass,
  Printer,
  ChevronDown,
  ChevronUp,
  Settings2,
  Table as TableIcon,
  ShieldCheck,
  Spline,
  Activity,
  Layers2,
  Crosshair,
  BarChart2,
  Share2,
  RefreshCw,
  FolderArchive,
  FileDown,
  Image as ImageIcon,
  Check
} from 'lucide-react';
import jsPDF from 'jspdf';
import { GeoFeature, GeoPoint, GisLayer, TopologyIssue } from '../types';
import { lonLatToUtm, utmToLonLat, polygonAreaPerimeter, pointInPoly, vincentyCore, toDMSstr, formatAreaAllUnits } from '../lib/geodesy';
import {
  parseCSV,
  stripBOM,
  toCSVtext,
  csvEnc,
  kmlBuild,
  dxfBuild,
  geoJsonBuild,
  buildExcelZip,
  csvToFeatures,
  kmlParse,
  geoJsonParse,
  dxfParse,
  parseShapefile,
  buildShapefileZip,
  extractAllFeaturesFromZip
} from '../lib/formats';
import { downloadBlob, makeZip } from '../lib/zip';
import {
  Point2D,
  computeConvexHull,
  computePolygonCentroid,
  generatePointBuffer,
  generateLineBuffer,
  generatePolygonBuffer,
  clipPolygon,
  auditLayerTopology,
  generateVoronoiCells,
  computeFieldStatistics
} from '../lib/spatialAnalysis';
import { deduplicateFeatures } from '../lib/deduplication';
import { useToast } from '../context/ToastContext';
import { globalTileCache } from '../lib/tileManager';

// Subcomponents
import { GisToolbar } from './gis/GisToolbar';
import { GisMapCanvas } from './gis/GisMapCanvas';
import { GisFeatureInspector } from './gis/GisFeatureInspector';
import { GisAiCopilotDrawer } from './gis/GisAiCopilotDrawer';
import { GoogleEarthPanel } from './gis/GoogleEarthPanel';
import { GisTool, SelectedFeatureRef } from './gis/gisTypes';
import {
  ImageryLayerConfig,
  ImageryProvider,
  computeSolarPosition,
  computeElevationProfile,
  sampleElevation
} from '../lib/tileManager';

interface GisStudioTabProps {
  workingZone: string;
  localLandUnitPreset: string;
  customBighaM2: number;
  customKathaPerBigha: number;
}

const DEFAULT_LAYERS: GisLayer[] = [
  {
    id: 'layer_lease',
    name: 'Mining Lease Boundary (ML-04)',
    visible: true,
    color: '#f59e0b',
    fillColor: '#f59e0b',
    fillOpacity: 0.15,
    strokeWidth: 2.5,
    geomType: 'polygon',
    features: [
      {
        name: 'ML Boundary Pillar Block',
        geom: 'polygon',
        kind: 'en',
        pts: [
          { a: 254500, b: 2604800 },
          { a: 255400, b: 2604850 },
          { a: 255500, b: 2605500 },
          { a: 254900, b: 2605650 },
          { a: 254400, b: 2605200 }
        ],
        props: {
          Lease_ID: 'ML/2024/089',
          Mineral: 'Bauxite Ore',
          Grantee: 'Apex Mining Corporation Ltd.',
          Status: 'Active Mining Grant',
          Area_Ha: 68.42
        }
      }
    ]
  },
  {
    id: 'layer_khasra',
    name: 'Cadastral Khasra Parcels',
    visible: true,
    color: '#38bdf8',
    fillColor: '#38bdf8',
    fillOpacity: 0.2,
    strokeWidth: 1.5,
    geomType: 'polygon',
    features: [
      {
        name: 'Plot 104/1',
        geom: 'polygon',
        kind: 'en',
        pts: [
          { a: 254800, b: 2605200 },
          { a: 255000, b: 2605250 },
          { a: 255050, b: 2605050 },
          { a: 254850, b: 2605000 }
        ],
        props: {
          Khasra_No: '104/1',
          Raiyat_Owner: 'Rameshwar Mahato',
          Land_Class: 'Dhani 1 (Agricultural)',
          Area_M2: 44375,
          Area_Ha: 4.4375
        }
      },
      {
        name: 'Plot 104/2',
        geom: 'polygon',
        kind: 'en',
        pts: [
          { a: 255000, b: 2605250 },
          { a: 255250, b: 2605300 },
          { a: 255300, b: 2605100 },
          { a: 255050, b: 2605050 }
        ],
        props: {
          Khasra_No: '104/2',
          Raiyat_Owner: 'Sukhram Oraon',
          Land_Class: 'Tar / Tanr (Upland)',
          Area_M2: 50625,
          Area_Ha: 5.0625
        }
      },
      {
        name: 'Plot 105 (Pond)',
        geom: 'polygon',
        kind: 'en',
        pts: [
          { a: 254850, b: 2605000 },
          { a: 255050, b: 2605050 },
          { a: 255020, b: 2604850 },
          { a: 254820, b: 2604820 }
        ],
        props: {
          Khasra_No: '105',
          Raiyat_Owner: 'Gram Panchayat Gair Mazarua Aam',
          Land_Class: 'Waterbody Reservoir',
          Area_M2: 43200,
          Area_Ha: 4.32
        }
      }
    ]
  },
  {
    id: 'layer_boreholes',
    name: 'Exploration Drillholes (Collars)',
    visible: true,
    color: '#10b981',
    fillColor: '#10b981',
    fillOpacity: 0.9,
    strokeWidth: 2,
    geomType: 'point',
    features: [
      {
        name: 'BH-01',
        geom: 'point',
        kind: 'en',
        pts: [{ a: 254920, b: 2605150 }],
        props: { BH_ID: 'BH-01', Collar_RL: 542.5, Max_Depth: 18.5, Ore_Thickness: 8.2, Al2O3_Avg: 48.2, Status: 'Positive Ore' }
      },
      {
        name: 'BH-02',
        geom: 'point',
        kind: 'en',
        pts: [{ a: 255150, b: 2605200 }],
        props: { BH_ID: 'BH-02', Collar_RL: 546.1, Max_Depth: 22.0, Ore_Thickness: 11.4, Al2O3_Avg: 51.0, Status: 'High Grade' }
      },
      {
        name: 'BH-03',
        geom: 'point',
        kind: 'en',
        pts: [{ a: 254700, b: 2605000 }],
        props: { BH_ID: 'BH-03', Collar_RL: 538.0, Max_Depth: 15.0, Ore_Thickness: 4.5, Al2O3_Avg: 42.1, Status: 'Barren/Low' }
      }
    ]
  }
];

export const GisStudioTab: React.FC<GisStudioTabProps> = ({
  workingZone,
  localLandUnitPreset,
  customBighaM2,
  customKathaPerBigha
}) => {
  const toast = useToast();
  const isDark = useIsDarkMode();
  const zNum = parseInt(workingZone, 10) || 45;
  const isSouth = workingZone.endsWith('S');

  // Map Lock State (controls pan/zoom and throttles background map refresh)
  const [isMapLocked, setIsMapLocked] = useState<boolean>(false);
  // Live GPS tracking state
  const [liveGps, setLiveGps] = useState<{ E: number; N: number; lon: number; lat: number; accuracy?: number } | null>(null);
  const [isLocatingGps, setIsLocatingGps] = useState<boolean>(false);

  // Layer Inline Editing State
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingLayerName, setEditingLayerName] = useState<string>('');

  const handleLiveGpsLocate = () => {
    if (!navigator.geolocation) {
      toast.showError('Geolocation is not supported by your browser');
      return;
    }
    setIsLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lon = pos.coords.longitude;
        const lat = pos.coords.latitude;
        const acc = pos.coords.accuracy;
        const utm = lonLatToUtm(lon, lat, zNum, isSouth);
        setLiveGps({ E: utm.E, N: utm.N, lon, lat, accuracy: acc });
        setIsLocatingGps(false);
        // Center canvas on location
        const cv = document.querySelector('canvas');
        const cvW = cv?.width || 800;
        const cvH = cv?.height || 600;
        setOffset({
          x: cvW / 2 - utm.E * scale,
          y: cvH / 2 - utm.N * scale
        });
        toast.showSuccess(`Centered on Live GPS fix (±${acc.toFixed(1)}m)`);
      },
      err => {
        setIsLocatingGps(false);
        toast.showError(`GPS fix error: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  };

  const handleStartRenameLayer = (layer: GisLayer, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingLayerId(layer.id);
    setEditingLayerName(layer.name);
  };

  const handleSaveRenameLayer = (layerId: string) => {
    const trimmed = editingLayerName.trim();
    if (!trimmed) {
      setEditingLayerId(null);
      return;
    }
    const nextLayers = layers.map(l =>
      l.id === layerId ? { ...l, name: trimmed } : l
    );
    pushHistory(nextLayers, `Renamed Layer to "${trimmed}"`);
    setEditingLayerId(null);
    toast.showSuccess(`Renamed layer to "${trimmed}"`);
  };

  // Layers State & History Stack
  const [layers, setLayers] = useState<GisLayer[]>(() => {
    try {
      const stored = localStorage.getItem('gis_studio_layers');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_LAYERS;
  });

  const [activeLayerId, setActiveLayerId] = useState<string>(layers[0]?.id || '');
  const activeLayer: GisLayer = useMemo(() => layers.find(l => l.id === activeLayerId) || layers[0] || {
    id: 'default',
    name: 'Default Layer',
    visible: true,
    color: '#38bdf8',
    fillColor: '#38bdf8',
    fillOpacity: 0.2,
    strokeWidth: 2,
    geomType: 'polygon' as const,
    features: []
  }, [layers, activeLayerId]);

  // History Stack (Undo/Redo)
  const [history, setHistory] = useState<GisLayer[][]>([layers]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  const pushHistory = useCallback((newLayers: GisLayer[], desc?: string) => {
    setHistory(prev => {
      const sliced = prev.slice(0, historyIndex + 1);
      const updated = [...sliced, JSON.parse(JSON.stringify(newLayers))];
      return updated.slice(-30); // keep up to 30 snapshots
    });
    setHistoryIndex(prev => Math.min(prev + 1, 29));
    setLayers(newLayers);
    try {
      localStorage.setItem('gis_studio_layers', JSON.stringify(newLayers));
    } catch {}
  }, [historyIndex]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const nextIdx = historyIndex - 1;
      const targetState = history[nextIdx];
      setHistoryIndex(nextIdx);
      setLayers(JSON.parse(JSON.stringify(targetState)));
      toast.showInfo('Undo executed');
    }
  }, [historyIndex, history, toast]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      const targetState = history[nextIdx];
      setHistoryIndex(nextIdx);
      setLayers(JSON.parse(JSON.stringify(targetState)));
      toast.showInfo('Redo executed');
    }
  }, [historyIndex, history, toast]);

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is inside an input, textarea or contenteditable
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedFeature) {
          e.preventDefault();
          handleDeleteSelectedFeature();
        }
      } else if (e.key === 'Escape') {
        setSelectedFeature(null);
        setDrawnPts([]);
        setMeasurePts([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Viewport State
  const [scale, setScale] = useState<number>(0.2);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 200, y: 150 });
  const [cursorCoord, setCursorCoord] = useState<{ E: number; N: number; lon: number; lat: number } | null>(null);

  // Tools & Display Modes
  const [activeTool, setActiveTool] = useState<GisTool>('pan');
  const [basemapTheme, setBasemapTheme] = useState<'dark_obsidian' | 'blueprint' | 'parchment' | 'light_topo'>('dark_obsidian');
  const [showGrid, setShowGrid] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapGrid, setSnapGrid] = useState(false);

  // Selected Feature
  const [selectedFeature, setSelectedFeature] = useState<SelectedFeatureRef | null>(null);

  // Active Digitizing & Measurement State
  const [measurePts, setMeasurePts] = useState<{ E: number; N: number }[]>([]);
  const [drawnPts, setDrawnPts] = useState<{ E: number; N: number }[]>([]);

  // Google Maps / Satellite Aerial Background & Google Earth 3D State
  const [imageryConfig, setImageryConfig] = useState<ImageryLayerConfig>({
    enabled: true,
    provider: 'google_satellite',
    opacity: 0.95,
    brightness: 1.0,
    contrast: 1.0
  });
  const [pitchDeg, setPitchDeg] = useState<number>(0);
  const [headingDeg, setHeadingDeg] = useState<number>(0);
  const [solarHour, setSolarHour] = useState<number>(14.5);
  const [solarDayOfYear, setSolarDayOfYear] = useState<number>(172);
  const [solarEnabled, setSolarEnabled] = useState<boolean>(false);
  const [isGoogleEarthOpen, setIsGoogleEarthOpen] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const centerLat = useMemo(() => {
    if (cursorCoord) return cursorCoord.lat;
    const centerW = { E: (400 - offset.x) / scale, N: (250 - offset.y) / scale };
    const ll = utmToLonLat(centerW.E, centerW.N, zNum, isSouth);
    return ll.lat;
  }, [cursorCoord, offset, scale, zNum, isSouth]);

  const solarPos = useMemo(() => {
    return computeSolarPosition(solarHour, centerLat);
  }, [solarHour, centerLat]);

  const elevationProfile = useMemo(() => {
    if (measurePts.length >= 2) {
      return computeElevationProfile(measurePts, zNum, isSouth, 20);
    }
    if (selectedFeature && selectedFeature.feature.pts.length >= 2) {
      const f = selectedFeature.feature;
      const pts = f.pts.map(p => {
        if (f.kind === 'en') return { E: p.a, N: p.b };
        const u = lonLatToUtm(p.a, p.b, zNum, isSouth);
        return { E: u.E, N: u.N };
      });
      return computeElevationProfile(pts, zNum, isSouth, 20);
    }
    const leftW = { E: (100 - offset.x) / scale, N: (250 - offset.y) / scale };
    const rightW = { E: (700 - offset.x) / scale, N: (250 - offset.y) / scale };
    return computeElevationProfile([leftW, rightW], zNum, isSouth, 25);
  }, [measurePts, selectedFeature, offset, scale, zNum, isSouth]);

  // Workspace Tabs
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'table' | 'analysis' | 'topology'>('table');
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [topologyIssues, setTopologyIssues] = useState<TopologyIssue[]>([]);

  // AI Spatial Copilot Drawer
  const [isAiCopilotOpen, setIsAiCopilotOpen] = useState(false);

  // Map Composer Export Modal
  const [showMapComposerModal, setShowMapComposerModal] = useState(false);
  const [composerTitle, setComposerTitle] = useState('GEOMATICS CADASTRAL & MINING PLAN');
  const [composerSubTitle, setComposerSubTitle] = useState('Apex Mining Corporation - Lease ML/2024/089');
  const [pdfSurveyorName, setPdfSurveyorName] = useState('Er. Amit Kumar, Certified Surveyor');
  const [pdfProjectRef, setPdfProjectRef] = useState('BNX-GIS-2025/09');
  const [pdfOrientation, setPdfOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [pdfPageFormat, setPdfPageFormat] = useState<'a4' | 'a3' | 'letter'>('a4');
  const [exportIncludeGrid, setExportIncludeGrid] = useState(true);
  const [exportIncludeLegend, setExportIncludeLegend] = useState(true);
  const [exportIncludeNorth, setExportIncludeNorth] = useState(true);
  const [exportIncludeScale, setExportIncludeScale] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState('');

  // Spatial Analysis Parameters
  const [bufferDistance, setBufferDistance] = useState(15.0);
  const [bufferUnit, setBufferUnit] = useState<'m' | 'ft'>('m');

  // Fit Viewport to features
  const fitView = useCallback(() => {
    let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
    let count = 0;

    layers.forEach(layer => {
      if (!layer.visible) return;
      layer.features.forEach(f => {
        f.pts.forEach(p => {
          let e = p.a;
          let n = p.b;
          if (f.kind === 'll') {
            const u = lonLatToUtm(p.a, p.b, zNum, isSouth);
            e = u.E;
            n = u.N;
          }
          if (e < minE) minE = e;
          if (e > maxE) maxE = e;
          if (n < minN) minN = n;
          if (n > maxN) maxN = n;
          count++;
        });
      });
    });

    if (count === 0 || minE === Infinity) {
      setScale(0.2);
      setOffset({ x: 200, y: 150 });
      return;
    }

    const spanE = Math.max(100, maxE - minE);
    const spanN = Math.max(100, maxN - minN);
    const centerE = (minE + maxE) / 2;
    const centerN = (minN + maxN) / 2;

    const cvW = 800;
    const cvH = 500;
    const padding = 100;
    const newScale = Math.min((cvW - padding * 2) / spanE, (cvH - padding * 2) / spanN, 1.5);
    const clampedScale = Math.max(0.005, Math.min(50, newScale));

    const newOffX = cvW / 2 - centerE * clampedScale;
    const newOffY = cvH / 2 - centerN * clampedScale;

    setScale(clampedScale);
    setOffset({ x: newOffX, y: newOffY });
  }, [layers, zNum, isSouth]);

  // Initial fit on mount
  useEffect(() => {
    fitView();
  }, []);

  // Measurement Tape Math
  const measureDistance = useMemo(() => {
    if (measurePts.length < 2) return 0;
    let d = 0;
    for (let i = 0; i < measurePts.length - 1; i++) {
      d += Math.hypot(measurePts[i + 1].E - measurePts[i].E, measurePts[i + 1].N - measurePts[i].N);
    }
    return d;
  }, [measurePts]);

  const measureArea = useMemo(() => {
    if (measurePts.length < 3) return 0;
    return polygonAreaPerimeter(measurePts).areaM2;
  }, [measurePts]);

  // Add Point Feature
  const handleAddPointFeature = (pt: { E: number; N: number }) => {
    const newFeat: GeoFeature = {
      name: `Point-${activeLayer.features.length + 1}`,
      geom: 'point',
      kind: 'en',
      pts: [{ a: pt.E, b: pt.N }],
      props: { Easting: pt.E.toFixed(2), Northing: pt.N.toFixed(2), Layer: activeLayer.name }
    };

    const nextLayers = layers.map(l =>
      l.id === activeLayer.id ? { ...l, features: [...l.features, newFeat] } : l
    );
    pushHistory(nextLayers, 'Added Point Feature');
    toast.showSuccess(`Added Point Feature "${newFeat.name}"`);
  };

  // Finish Digitizing Line or Polygon
  const handleFinishDrawing = () => {
    if (drawnPts.length < (activeTool === 'draw_poly' ? 3 : 2)) {
      toast.showWarning(`Need at least ${activeTool === 'draw_poly' ? '3' : '2'} points to finish.`);
      return;
    }

    const isPoly = activeTool === 'draw_poly';
    const newFeat: GeoFeature = {
      name: `${isPoly ? 'Parcel' : 'Corridor'}-${activeLayer.features.length + 1}`,
      geom: isPoly ? 'polygon' : 'line',
      kind: 'en',
      pts: drawnPts.map(p => ({ a: p.E, b: p.N })),
      props: {
        Layer: activeLayer.name,
        Vertex_Count: drawnPts.length,
        Created_At: new Date().toLocaleTimeString()
      }
    };

    const nextLayers = layers.map(l =>
      l.id === activeLayer.id ? { ...l, features: [...l.features, newFeat] } : l
    );
    pushHistory(nextLayers, `Digitized ${isPoly ? 'Polygon' : 'Line'}`);
    setDrawnPts([]);
    toast.showSuccess(`Saved digitized ${isPoly ? 'Polygon Parcel' : 'Line Corridor'} to "${activeLayer.name}".`);
  };

  // Modify Feature Vertices (via vertex drag, midpoint split, or delete vertex)
  const handleModifyFeatureVertices = (
    layerId: string,
    featureIdx: number,
    newPts: { a: number; b: number }[],
    description: string
  ) => {
    const nextLayers = layers.map(l => {
      if (l.id !== layerId) return l;
      const nextFeats = l.features.map((f, fIdx) => {
        if (fIdx !== featureIdx) return f;
        return { ...f, pts: newPts };
      });
      return { ...l, features: nextFeats };
    });
    pushHistory(nextLayers, description);

    // Update selected feature ref if active
    if (selectedFeature && selectedFeature.layerId === layerId && selectedFeature.featureIdx === featureIdx) {
      setSelectedFeature({
        ...selectedFeature,
        feature: { ...selectedFeature.feature, pts: newPts }
      });
    }
  };

  // Delete Selected Feature
  const handleDeleteSelectedFeature = () => {
    if (!selectedFeature) return;
    const { layerId, featureIdx } = selectedFeature;
    const nextLayers = layers.map(l => {
      if (l.id !== layerId) return l;
      return {
        ...l,
        features: l.features.filter((_, idx) => idx !== featureIdx)
      };
    });
    pushHistory(nextLayers, 'Deleted Feature');
    setSelectedFeature(null);
    toast.showSuccess('Deleted feature.');
  };

  // Duplicate Feature
  const handleDuplicateSelectedFeature = () => {
    if (!selectedFeature) return;
    const { layerId, feature } = selectedFeature;
    const duplicated: GeoFeature = {
      ...feature,
      name: `${feature.name} (Copy)`,
      pts: feature.pts.map(p => ({ a: p.a + 20, b: p.b + 20 })) // slight offset
    };
    const nextLayers = layers.map(l =>
      l.id === layerId ? { ...l, features: [...l.features, duplicated] } : l
    );
    pushHistory(nextLayers, 'Duplicated Feature');
    toast.showSuccess(`Duplicated "${feature.name}".`);
  };

  // Update Feature attributes or metadata
  const handleUpdateFeature = (updated: GeoFeature) => {
    if (!selectedFeature) return;
    const { layerId, featureIdx } = selectedFeature;
    const nextLayers = layers.map(l => {
      if (l.id !== layerId) return l;
      const nextFeats = l.features.map((f, idx) => (idx === featureIdx ? updated : f));
      return { ...l, features: nextFeats };
    });
    pushHistory(nextLayers, 'Updated Feature Attributes');
    setSelectedFeature({ ...selectedFeature, feature: updated });
  };

  // Insert AI-generated features from Copilot
  const handleInsertAiFeatures = (newFeatures: GeoFeature[]) => {
    const nextLayers = layers.map(l =>
      l.id === activeLayer.id ? { ...l, features: [...l.features, ...newFeatures] } : l
    );
    pushHistory(nextLayers, 'Inserted AI Generated Features');
    fitView();
  };

  // ---------------- Spatial Analysis Handlers ----------------
  // 1. Buffer Generation
  const handleRunBuffer = () => {
    const distM = bufferUnit === 'ft' ? bufferDistance * 0.3048 : bufferDistance;
    const bufferedFeatures: GeoFeature[] = [];

    activeLayer.features.forEach(f => {
      const pts: Point2D[] = f.pts.map(p => {
        if (f.kind === 'en') return { x: p.a, y: p.b };
        const u = lonLatToUtm(p.a, p.b, zNum, isSouth);
        return { x: u.E, y: u.N };
      });

      let bufPts: Point2D[] = [];
      if (f.geom === 'point' && pts[0]) {
        bufPts = generatePointBuffer(pts[0], distM);
      } else if (f.geom === 'line') {
        bufPts = generateLineBuffer(pts, distM);
      } else if (f.geom === 'polygon') {
        bufPts = generatePolygonBuffer(pts, distM);
      }

      if (bufPts.length >= 3) {
        bufferedFeatures.push({
          name: `Buffer (${distM}m) - ${f.name}`,
          geom: 'polygon',
          kind: 'en',
          pts: bufPts.map(p => ({ a: p.x, b: p.y })),
          props: { Source_Feature: f.name, Buffer_Dist_M: distM }
        });
      }
    });

    if (bufferedFeatures.length > 0) {
      const newLayer: GisLayer = {
        id: `buf_${Date.now()}`,
        name: `Buffer Zone (${distM}m) - ${activeLayer.name}`,
        visible: true,
        color: '#e11d48',
        fillColor: '#e11d48',
        fillOpacity: 0.2,
        strokeWidth: 2,
        geomType: 'polygon',
        features: bufferedFeatures
      };
      pushHistory([newLayer, ...layers], 'Generated Buffer Layer');
      setActiveLayerId(newLayer.id);
      toast.showSuccess(`Generated buffer zone with ${bufferedFeatures.length} features.`);
    }
  };

  // 2. Convex Hull
  const handleRunConvexHull = () => {
    const allPts: Point2D[] = [];
    activeLayer.features.forEach(f => {
      f.pts.forEach(p => {
        if (f.kind === 'en') allPts.push({ x: p.a, y: p.b });
        else {
          const u = lonLatToUtm(p.a, p.b, zNum, isSouth);
          allPts.push({ x: u.E, y: u.N });
        }
      });
    });

    if (allPts.length < 3) {
      toast.showWarning('Need at least 3 points in active layer to compute Convex Hull.');
      return;
    }

    const hull = computeConvexHull(allPts);
    const polyCalc = polygonAreaPerimeter(hull.map(p => ({ E: p.x, N: p.y })));

    const hullFeature: GeoFeature = {
      name: `Convex Hull - ${activeLayer.name}`,
      geom: 'polygon',
      kind: 'en',
      pts: hull.map(p => ({ a: p.x, b: p.y })),
      props: {
        Source_Layer: activeLayer.name,
        Enclosed_Points: allPts.length,
        Area_Ha: polyCalc.areaHa.toFixed(4),
        Perimeter_M: polyCalc.perimM.toFixed(2)
      }
    };

    const newLayer: GisLayer = {
      id: `hull_${Date.now()}`,
      name: `Convex Hull - ${activeLayer.name}`,
      visible: true,
      color: '#f97316',
      fillColor: '#f97316',
      fillOpacity: 0.25,
      strokeWidth: 2.5,
      geomType: 'polygon',
      features: [hullFeature]
    };

    pushHistory([newLayer, ...layers], 'Computed Convex Hull');
    setActiveLayerId(newLayer.id);
    toast.showSuccess(`Computed Convex Hull (${polyCalc.areaHa.toFixed(2)} Ha enclosed).`);
  };

  // 3. Centroids
  const handleRunCentroids = () => {
    const centroidFeatures: GeoFeature[] = [];
    activeLayer.features.forEach(f => {
      const pts: Point2D[] = f.pts.map(p => {
        if (f.kind === 'en') return { x: p.a, y: p.b };
        const u = lonLatToUtm(p.a, p.b, zNum, isSouth);
        return { x: u.E, y: u.N };
      });
      const cent = computePolygonCentroid(pts);
      centroidFeatures.push({
        name: `Centroid (${f.name})`,
        geom: 'point',
        kind: 'en',
        pts: [{ a: cent.x, b: cent.y }],
        props: { Parent_Feature: f.name, Easting: cent.x.toFixed(2), Northing: cent.y.toFixed(2) }
      });
    });

    const newLayer: GisLayer = {
      id: `cent_${Date.now()}`,
      name: `Centroids - ${activeLayer.name}`,
      visible: true,
      color: '#06b6d4',
      fillColor: '#06b6d4',
      fillOpacity: 0.9,
      strokeWidth: 2,
      geomType: 'point',
      features: centroidFeatures
    };

    pushHistory([newLayer, ...layers], 'Extracted Centroids');
    setActiveLayerId(newLayer.id);
    toast.showSuccess(`Extracted ${centroidFeatures.length} feature centroids.`);
  };

  // 4. Voronoi Cells
  const handleRunVoronoi = () => {
    const pointFeatures = activeLayer.features.filter(f => f.geom === 'point');
    if (pointFeatures.length < 3) {
      toast.showWarning('Need at least 3 point features in active layer to compute Voronoi cells.');
      return;
    }

    const points = pointFeatures.map((f, i) => {
      const p = f.pts[0];
      let x = p.a;
      let y = p.b;
      if (f.kind === 'll') {
        const u = lonLatToUtm(p.a, p.b, zNum, isSouth);
        x = u.E;
        y = u.N;
      }
      return { id: f.name || `PT-${i + 1}`, x, y, props: f.props };
    });

    const cells = generateVoronoiCells(points, 300);
    const newLayer: GisLayer = {
      id: `voro_${Date.now()}`,
      name: `Voronoi Influence Cells - ${activeLayer.name}`,
      visible: true,
      color: '#8b5cf6',
      fillColor: '#8b5cf6',
      fillOpacity: 0.2,
      strokeWidth: 1.5,
      geomType: 'polygon',
      features: cells
    };

    pushHistory([newLayer, ...layers], 'Computed Voronoi Cells');
    setActiveLayerId(newLayer.id);
    toast.showSuccess(`Generated ${cells.length} Voronoi influence polygons.`);
  };

  // 5. Topology QA Audit
  const handleRunTopologyAudit = () => {
    const issues = auditLayerTopology(activeLayer, zNum, isSouth);
    setTopologyIssues(issues);
    setActiveWorkspaceTab('topology');
    toast.showInfo(`Topology audit complete: Found ${issues.length} item(s) to review.`);
  };

  // 6. Deduplicate & Clean Layer
  const handleDeduplicateActiveLayer = () => {
    if (!activeLayer.features.length) {
      toast.showWarning('Active layer contains no features to deduplicate.');
      return;
    }
    const { cleanFeatures, summary } = deduplicateFeatures(activeLayer.features, {
      distanceToleranceMeters: 0.05
    });

    const nextLayers = layers.map(l =>
      l.id === activeLayer.id ? { ...l, features: cleanFeatures } : l
    );
    pushHistory(nextLayers, 'Deduplicated Active Layer');

    if (summary.removedCount > 0) {
      toast.showSuccess(`Removed ${summary.removedCount} duplicate geometry/features.`);
    } else {
      toast.showInfo('No duplicate features found.');
    }
  };

  const handleDeduplicateAllLayers = () => {
    let totalRemoved = 0;
    const cleaned = layers.map(l => {
      const { cleanFeatures, summary } = deduplicateFeatures(l.features, {
        distanceToleranceMeters: 0.05
      });
      totalRemoved += summary.removedCount;
      return { ...l, features: cleanFeatures };
    });

    pushHistory(cleaned, 'Deduplicated All Layers');
    toast.showSuccess(`Batch deduplication complete: Removed ${totalRemoved} duplicates across all layers.`);
  };

  // ---------------- Export & Format Handlers ----------------
  const handleExportShapefile = async () => {
    try {
      const zipBlob = await buildShapefileZip(activeLayer.features, activeLayer.name, zNum, isSouth);
      downloadBlob(zipBlob, `${activeLayer.name.replace(/\s+/g, '_')}_Shapefile.zip`);
      toast.showSuccess(`Exported Shapefile for layer "${activeLayer.name}".`);
    } catch (e: any) {
      toast.showError(e.message || 'Failed to export Shapefile bundle.');
    }
  };

  const handleExportGeoJSON = () => {
    const gjStr = geoJsonBuild(activeLayer.features, zNum, isSouth);
    const blob = new Blob([gjStr], { type: 'application/json' });
    downloadBlob(blob, `${activeLayer.name.replace(/\s+/g, '_')}.geojson`);
    toast.showSuccess(`Exported GeoJSON for "${activeLayer.name}".`);
  };

  const handleExportKML = () => {
    const kml = kmlBuild(activeLayer.features, activeLayer.name, true, zNum, isSouth);
    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    downloadBlob(blob, `${activeLayer.name.replace(/\s+/g, '_')}.kml`);
    toast.showSuccess(`Exported KML for "${activeLayer.name}".`);
  };

  const handleExportDXF = () => {
    const dxfObj = dxfBuild(activeLayer.features, 'utm', zNum, isSouth);
    const blob = new Blob([dxfObj.dxf], { type: 'application/dxf' });
    downloadBlob(blob, `${activeLayer.name.replace(/\s+/g, '_')}.dxf`);
    toast.showSuccess(`Exported DXF CAD for "${activeLayer.name}".`);
  };

  const handleExportAllLayersZip = async () => {
    try {
      const enc = new TextEncoder();
      const files: { name: string; data: Uint8Array }[] = [];
      for (const layer of layers) {
        const baseName = layer.name.replace(/\s+/g, '_');
        files.push({
          name: `${baseName}.geojson`,
          data: enc.encode(geoJsonBuild(layer.features, zNum, isSouth))
        });
        files.push({
          name: `${baseName}.kml`,
          data: enc.encode(kmlBuild(layer.features, layer.name, true, zNum, isSouth))
        });
        files.push({
          name: `${baseName}.dxf`,
          data: enc.encode(dxfBuild(layer.features, 'utm', zNum, isSouth).dxf)
        });
      }
      const zipBlob = await makeZip(files);
      downloadBlob(zipBlob, `GeoStudio_All_GIS_Layers_${Date.now()}.zip`);
      toast.showSuccess('Packaged and downloaded all GIS layers in a single ZIP.');
    } catch (err: any) {
      toast.showError('Failed to package all layers.');
    }
  };

  // High-Resolution Export
  const handleExportHighResPNG = (multiplier: number = 2) => {
    setIsExporting(true);
    setTimeout(() => {
      try {
        const offCv = document.createElement('canvas');
        offCv.width = 1200 * multiplier;
        offCv.height = 700 * multiplier;
        const ctx = offCv.getContext('2d');
        if (!ctx) return;

        ctx.scale(multiplier, multiplier);
        ctx.fillStyle = basemapTheme === 'light_topo' ? '#f8fafc' : '#0a0d14';
        ctx.fillRect(0, 0, 1200, 700);

        // Render features
        layers.forEach(layer => {
          if (!layer.visible) return;
          layer.features.forEach(feat => {
            const pts = feat.pts.map(p => {
              if (feat.kind === 'en') return { E: p.a, N: p.b };
              const u = lonLatToUtm(p.a, p.b, zNum, isSouth);
              return { E: u.E, N: u.N };
            });
            if (pts.length === 0) return;

            if (feat.geom === 'polygon' && pts.length >= 3) {
              ctx.beginPath();
              pts.forEach((p, i) => {
                const scX = p.E * scale + offset.x;
                const scY = 700 - (p.N * scale + offset.y);
                if (i === 0) ctx.moveTo(scX, scY);
                else ctx.lineTo(scX, scY);
              });
              ctx.closePath();
              ctx.fillStyle = layer.fillColor || layer.color;
              ctx.globalAlpha = 0.25;
              ctx.fill();
              ctx.globalAlpha = 1.0;
              ctx.strokeStyle = layer.color;
              ctx.lineWidth = layer.strokeWidth || 2;
              ctx.stroke();
            } else if (feat.geom === 'line') {
              ctx.beginPath();
              pts.forEach((p, i) => {
                const scX = p.E * scale + offset.x;
                const scY = 700 - (p.N * scale + offset.y);
                if (i === 0) ctx.moveTo(scX, scY);
                else ctx.lineTo(scX, scY);
              });
              ctx.strokeStyle = layer.color;
              ctx.lineWidth = layer.strokeWidth || 2;
              ctx.stroke();
            } else if (feat.geom === 'point') {
              pts.forEach(p => {
                const scX = p.E * scale + offset.x;
                const scY = 700 - (p.N * scale + offset.y);
                ctx.beginPath();
                ctx.arc(scX, scY, 5, 0, Math.PI * 2);
                ctx.fillStyle = layer.color;
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
              });
            }
          });
        });

        offCv.toBlob(blob => {
          if (blob) {
            downloadBlob(blob, `GeoStudio_Map_${multiplier}x_${Date.now()}.png`);
            toast.showSuccess(`Exported ${multiplier}x High-Resolution Map PNG.`);
          }
        }, 'image/png');
      } finally {
        setIsExporting(false);
      }
    }, 100);
  };

  const handleExportMapPDF = async () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF({
        orientation: pdfOrientation,
        unit: 'mm',
        format: pdfPageFormat
      });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text(composerTitle, 15, 18);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`${composerSubTitle} | UTM Zone ${workingZone}`, 15, 25);
      doc.text(`Surveyor: ${pdfSurveyorName} | Ref: ${pdfProjectRef} | Date: ${new Date().toLocaleDateString()}`, 15, 31);

      doc.setLineWidth(0.4);
      doc.rect(15, 36, pdfOrientation === 'landscape' ? 267 : 180, pdfOrientation === 'landscape' ? 140 : 210);

      doc.setFontSize(9);
      doc.text('Map canvas sheet generated with BhuNex GIS Map Studio', 15, pdfOrientation === 'landscape' ? 185 : 260);

      doc.save(`GeoStudio_Plan_${Date.now()}.pdf`);
      toast.showSuccess('Generated official Map PDF document.');
    } catch (e: any) {
      toast.showError('Failed to generate PDF map.');
    } finally {
      setIsExporting(false);
    }
  };

  // Drag-and-drop / file upload parser
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        if (file.name.endsWith('.zip')) {
          const ab = await file.arrayBuffer();
          const datasets = await extractAllFeaturesFromZip(ab, zNum, isSouth);
          datasets.forEach((ds, dsIdx) => {
            if (ds.features.length > 0) {
              const newLayer: GisLayer = {
                id: `layer_${Date.now()}_${i}_${dsIdx}`,
                name: ds.layerName || file.name.replace(/\.zip$/i, ''),
                visible: true,
                color: '#38bdf8',
                fillColor: '#38bdf8',
                fillOpacity: 0.2,
                strokeWidth: 2,
                geomType: ds.geomType,
                features: ds.features
              };
              pushHistory([newLayer, ...layers], `Imported ${ds.layerName}`);
              setActiveLayerId(newLayer.id);
            }
          });
          toast.showSuccess(`Imported archive ${file.name}`);
        } else if (file.name.endsWith('.geojson') || file.name.endsWith('.json')) {
          const text = await file.text();
          const feats = geoJsonParse(text);
          if (feats.length > 0) {
            const newLayer: GisLayer = {
              id: `layer_${Date.now()}_${i}`,
              name: file.name.replace(/\.(geo)?json$/i, ''),
              visible: true,
              color: '#10b981',
              fillColor: '#10b981',
              fillOpacity: 0.2,
              strokeWidth: 2,
              geomType: feats[0].geom,
              features: feats
            };
            pushHistory([newLayer, ...layers], `Imported ${file.name}`);
            setActiveLayerId(newLayer.id);
            toast.showSuccess(`Imported ${feats.length} features from ${file.name}`);
          }
        } else if (file.name.endsWith('.kml')) {
          const text = await file.text();
          const feats = kmlParse(text);
          if (feats.length > 0) {
            const newLayer: GisLayer = {
              id: `layer_${Date.now()}_${i}`,
              name: file.name.replace(/\.kml$/i, ''),
              visible: true,
              color: '#f59e0b',
              fillColor: '#f59e0b',
              fillOpacity: 0.2,
              strokeWidth: 2,
              geomType: feats[0].geom,
              features: feats
            };
            pushHistory([newLayer, ...layers], `Imported ${file.name}`);
            setActiveLayerId(newLayer.id);
            toast.showSuccess(`Imported ${feats.length} features from ${file.name}`);
          }
        } else if (file.name.endsWith('.dxf')) {
          const text = await file.text();
          const feats = dxfParse(text);
          if (feats.length > 0) {
            const newLayer: GisLayer = {
              id: `layer_${Date.now()}_${i}`,
              name: file.name.replace(/\.dxf$/i, ''),
              visible: true,
              color: '#ec4899',
              fillColor: '#ec4899',
              fillOpacity: 0.2,
              strokeWidth: 2,
              geomType: feats[0].geom,
              features: feats
            };
            pushHistory([newLayer, ...layers], `Imported ${file.name}`);
            setActiveLayerId(newLayer.id);
            toast.showSuccess(`Imported ${feats.length} features from ${file.name}`);
          }
        } else if (file.name.endsWith('.csv')) {
          const text = await file.text();
          const rows = parseCSV(text);
          const feats = csvToFeatures(rows, zNum, isSouth);
          if (feats.length > 0) {
            const newLayer: GisLayer = {
              id: `layer_${Date.now()}_${i}`,
              name: file.name.replace(/\.csv$/i, ''),
              visible: true,
              color: '#a855f7',
              fillColor: '#a855f7',
              fillOpacity: 0.9,
              strokeWidth: 2,
              geomType: 'point',
              features: feats
            };
            pushHistory([newLayer, ...layers], `Imported ${file.name}`);
            setActiveLayerId(newLayer.id);
            toast.showSuccess(`Imported ${feats.length} point coordinates from ${file.name}`);
          }
        }
      } catch (err: any) {
        toast.showError(`Failed to import ${file.name}: ${err.message}`);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Main Viewport & Layer Control Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left 4 Columns: Smart Layer Panel & Styling Manager */}
        <div className="lg:col-span-4 bg-white dark:bg-[#0f0f0f] rounded-2xl p-4 border border-slate-200 dark:border-white/5 space-y-4 shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            {/* Header & Add Layer */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-800 dark:text-white uppercase font-mono tracking-wider">
                    Layers ({layers.length})
                  </h3>
                  <span className="text-[10px] text-slate-500 dark:text-white/40">UTM Zone {workingZone}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    const newL: GisLayer = {
                      id: `layer_${Date.now()}`,
                      name: `New Layer ${layers.length + 1}`,
                      visible: true,
                      color: '#06b6d4',
                      fillColor: '#06b6d4',
                      fillOpacity: 0.2,
                      strokeWidth: 2,
                      geomType: 'polygon',
                      features: []
                    };
                    pushHistory([...layers, newL], 'Created New Layer');
                    setActiveLayerId(newL.id);
                  }}
                  className="p-1.5 rounded-xl bg-amber-500 text-black font-bold hover:bg-amber-400 transition-all text-xs shadow-sm flex items-center gap-1"
                  title="Add New Empty Vector Layer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Layer</span>
                </button>
              </div>
            </div>

            {/* Layer List */}
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
              {layers.map(layer => {
                const isActive = layer.id === activeLayer.id;
                return (
                  <div
                    key={layer.id}
                    onClick={() => setActiveLayerId(layer.id)}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      isActive
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-900 dark:text-amber-200'
                        : 'bg-slate-50 dark:bg-[#141414] border-slate-200 dark:border-white/5 text-slate-700 dark:text-white/70 hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          const nextLayers = layers.map(l =>
                            l.id === layer.id ? { ...l, visible: !l.visible } : l
                          );
                          pushHistory(nextLayers, 'Toggled Layer Visibility');
                        }}
                        className="text-slate-400 dark:text-white/40 hover:text-slate-900 dark:hover:text-white"
                        title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                      >
                        {layer.visible ? <Eye className="w-3.5 h-3.5 text-emerald-500" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>

                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: layer.color }} />

                      <div className="min-w-0 flex-1">
                        {editingLayerId === layer.id ? (
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <input
                              type="text"
                              value={editingLayerName}
                              onChange={e => setEditingLayerName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSaveRenameLayer(layer.id);
                                if (e.key === 'Escape') setEditingLayerId(null);
                              }}
                              autoFocus
                              className="w-full text-xs font-semibold px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-amber-500 text-slate-900 dark:text-white focus:outline-none"
                            />
                            <button
                              onClick={() => handleSaveRenameLayer(layer.id)}
                              className="p-1 text-emerald-500 hover:text-emerald-400 rounded hover:bg-emerald-500/10"
                              title="Save Layer Name"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between group/title">
                            <div
                              onDoubleClick={e => handleStartRenameLayer(layer, e)}
                              className="font-semibold text-xs truncate max-w-[140px] select-text"
                              title="Double click to rename"
                            >
                              {layer.name}
                            </div>
                            <button
                              onClick={e => handleStartRenameLayer(layer, e)}
                              className="opacity-0 group-hover/title:opacity-100 p-0.5 text-slate-400 hover:text-amber-500 rounded transition-opacity"
                              title="Rename Layer"
                            >
                              <Settings2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        <div className="text-[10px] opacity-60 font-mono">
                          {layer.features.length} {layer.geomType}s
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <input
                        type="color"
                        value={layer.color}
                        onChange={e => {
                          const nextLayers = layers.map(l =>
                            l.id === layer.id ? { ...l, color: e.target.value, fillColor: e.target.value } : l
                          );
                          pushHistory(nextLayers, 'Updated Layer Color');
                        }}
                        className="w-5 h-5 rounded border-0 cursor-pointer bg-transparent"
                        title="Change Symbology Color"
                      />
                      {layers.length > 1 && (
                        <button
                          onClick={() => {
                            const nextLayers = layers.filter(l => l.id !== layer.id);
                            pushHistory(nextLayers, 'Deleted Layer');
                            if (activeLayerId === layer.id) {
                              setActiveLayerId(nextLayers[0]?.id || '');
                            }
                          }}
                          className="text-slate-400 hover:text-rose-500 p-1"
                          title="Delete Layer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Preset Generators */}
          <div className="pt-3 border-t border-slate-200 dark:border-white/10 space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/40 font-mono">
              Quick Smart Geometry Actions
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <button
                onClick={handleRunBuffer}
                className="p-2 bg-slate-100 dark:bg-[#141414] hover:bg-slate-200 dark:hover:bg-[#1c1c1c] border border-slate-200 dark:border-white/10 rounded-xl font-medium flex items-center justify-center gap-1.5 transition-all text-slate-800 dark:text-white"
              >
                <Spline className="w-3.5 h-3.5 text-rose-400" /> Buffer ({bufferDistance}m)
              </button>
              <button
                onClick={handleRunConvexHull}
                className="p-2 bg-slate-100 dark:bg-[#141414] hover:bg-slate-200 dark:hover:bg-[#1c1c1c] border border-slate-200 dark:border-white/10 rounded-xl font-medium flex items-center justify-center gap-1.5 transition-all text-slate-800 dark:text-white"
              >
                <Maximize2 className="w-3.5 h-3.5 text-amber-400" /> Convex Hull
              </button>
              <button
                onClick={handleRunCentroids}
                className="p-2 bg-slate-100 dark:bg-[#141414] hover:bg-slate-200 dark:hover:bg-[#1c1c1c] border border-slate-200 dark:border-white/10 rounded-xl font-medium flex items-center justify-center gap-1.5 transition-all text-slate-800 dark:text-white"
              >
                <Crosshair className="w-3.5 h-3.5 text-cyan-400" /> Centroids
              </button>
              <button
                onClick={handleRunVoronoi}
                className="p-2 bg-slate-100 dark:bg-[#141414] hover:bg-slate-200 dark:hover:bg-[#1c1c1c] border border-slate-200 dark:border-white/10 rounded-xl font-medium flex items-center justify-center gap-1.5 transition-all text-slate-800 dark:text-white"
              >
                <Layers className="w-3.5 h-3.5 text-purple-400" /> Voronoi Cells
              </button>
            </div>
          </div>
        </div>

        {/* Right 8 Columns: Vector Viewport & Canvas Controls */}
        <div className="lg:col-span-8 bg-white dark:bg-[#0f0f0f] rounded-2xl p-4 border border-slate-200 dark:border-white/5 space-y-3 flex flex-col shadow-sm">
          {/* Top Toolbar */}
          <GisToolbar
            activeTool={activeTool}
            onSelectTool={t => {
              setActiveTool(t);
              if (t !== 'measure') setMeasurePts([]);
              if (t !== 'draw_poly' && t !== 'draw_line') setDrawnPts([]);
            }}
            canUndo={historyIndex > 0}
            canRedo={historyIndex < history.length - 1}
            onUndo={handleUndo}
            onRedo={handleRedo}
            hasSelectedFeature={!!selectedFeature}
            onDeleteSelected={handleDeleteSelectedFeature}
            snapEnabled={snapEnabled}
            onToggleSnap={() => setSnapEnabled(!snapEnabled)}
            snapGrid={snapGrid}
            onToggleSnapGrid={() => setSnapGrid(!snapGrid)}
            showGrid={showGrid}
            onToggleGrid={() => setShowGrid(!showGrid)}
            showLabels={showLabels}
            onToggleLabels={() => setShowLabels(!showLabels)}
            basemapTheme={basemapTheme}
            onChangeBasemap={t => setBasemapTheme(t)}
            onFitView={fitView}
            onOpenAiCopilot={() => setIsAiCopilotOpen(true)}
            onExportMap={() => setShowMapComposerModal(true)}
            imageryConfig={imageryConfig}
            onToggleImagery={() => setImageryConfig(c => ({ ...c, enabled: !c.enabled }))}
            onChangeImageryProvider={p => setImageryConfig(c => ({ ...c, provider: p }))}
            onOpenGoogleEarth={() => setIsGoogleEarthOpen(o => !o)}
            pitchDeg={pitchDeg}
            isOnline={isOnline}
            isMapLocked={isMapLocked}
            onToggleMapLock={() => {
              setIsMapLocked(l => !l);
              toast.showSuccess(isMapLocked ? 'Map Unlocked: Pan and Zoom enabled' : 'Map Locked: Viewport & Tile refresh frozen');
            }}
            onRefreshMapTiles={() => {
              globalTileCache.clear();
              setImageryConfig(c => ({ ...c }));
              toast.showSuccess('Refreshed imagery satellite tiles');
            }}
            onLiveGpsLocate={handleLiveGpsLocate}
            isLocatingGps={isLocatingGps}
          />

          {/* Interactive Map Canvas */}
          <div className="relative flex-1">
            <GisMapCanvas
              layers={layers}
              activeLayer={activeLayer}
              activeTool={activeTool}
              scale={scale}
              offset={offset}
              onUpdateScaleOffset={(s, off) => {
                if (!isMapLocked) {
                  setScale(s);
                  setOffset(off);
                }
              }}
              selectedFeature={selectedFeature}
              onSelectFeature={setSelectedFeature}
              snapEnabled={snapEnabled}
              snapGrid={snapGrid}
              showGrid={showGrid}
              showLabels={showLabels}
              basemapTheme={basemapTheme}
              zNum={zNum}
              isSouth={isSouth}
              measurePts={measurePts}
              onUpdateMeasurePts={setMeasurePts}
              drawnPts={drawnPts}
              onUpdateDrawnPts={setDrawnPts}
              onAddPointFeature={handleAddPointFeature}
              onModifyFeatureVertices={handleModifyFeatureVertices}
              onCursorChange={setCursorCoord}
              imageryConfig={imageryConfig}
              isOnline={isOnline}
              pitchDeg={pitchDeg}
              onUpdatePitchDeg={setPitchDeg}
              headingDeg={headingDeg}
              onUpdateHeadingDeg={setHeadingDeg}
              solarPos={solarPos}
              solarEnabled={solarEnabled}
              isMapLocked={isMapLocked}
              liveGps={liveGps}
            />

            {/* Measurement Floating HUD */}
            {activeTool === 'measure' && measurePts.length > 0 && (
              <div className="absolute bottom-4 left-4 p-3 bg-black/85 backdrop-blur-md rounded-2xl border border-pink-500/40 text-xs text-white space-y-1 font-mono shadow-xl z-20">
                <div className="text-pink-400 font-bold flex items-center justify-between gap-4">
                  <span>Geodesic Measurement Tape</span>
                  <button onClick={() => setMeasurePts([])} className="text-white/40 hover:text-white text-[10px]">
                    Clear
                  </button>
                </div>
                <div>Distance: {measureDistance >= 1000 ? `${(measureDistance / 1000).toFixed(3)} km` : `${measureDistance.toFixed(2)} m`}</div>
                {measureArea > 0 && <div>Enclosed Area: {(measureArea / 10000).toFixed(4)} Ha ({measureArea.toFixed(1)} m²)</div>}
              </div>
            )}

            {/* Digitizing Floating HUD */}
            {drawnPts.length > 0 && (
              <div className="absolute bottom-4 left-4 p-3 bg-black/85 backdrop-blur-md rounded-2xl border border-emerald-500/40 text-xs text-white space-y-2 font-mono shadow-xl z-20">
                <div className="text-emerald-400 font-bold">
                  Digitizing {activeTool === 'draw_poly' ? 'Polygon Parcel' : 'Polyline Corridor'}
                </div>
                <div>Vertices placed: {drawnPts.length} points</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleFinishDrawing}
                    className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg text-xs transition-all shadow-sm"
                  >
                    Finish & Save
                  </button>
                  <button
                    onClick={() => setDrawnPts([])}
                    className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {/* Floating Feature Inspector */}
            <GisFeatureInspector
              selectedFeature={selectedFeature}
              activeLayer={activeLayer}
              zNum={zNum}
              isSouth={isSouth}
              customBighaM2={customBighaM2}
              onClose={() => setSelectedFeature(null)}
              onUpdateFeature={handleUpdateFeature}
              onDeleteFeature={handleDeleteSelectedFeature}
              onDuplicateFeature={handleDuplicateSelectedFeature}
            />
          </div>

          {/* Google Earth 3D Studio & Elevation Profile Panel */}
          <GoogleEarthPanel
            isOpen={isGoogleEarthOpen}
            onClose={() => setIsGoogleEarthOpen(false)}
            imageryConfig={imageryConfig}
            onUpdateImageryConfig={setImageryConfig}
            isOnline={isOnline}
            pitchDeg={pitchDeg}
            onUpdatePitchDeg={setPitchDeg}
            headingDeg={headingDeg}
            onUpdateHeadingDeg={setHeadingDeg}
            onReset3DView={() => {
              setPitchDeg(0);
              setHeadingDeg(0);
            }}
            elevationProfile={elevationProfile}
            selectedFeatureName={selectedFeature?.feature.name}
            solarHour={solarHour}
            onUpdateSolarHour={setSolarHour}
            solarPos={solarPos}
            solarEnabled={solarEnabled}
            onToggleSolar={() => setSolarEnabled(s => !s)}
            onFlyToCoord={(lon, lat) => {
              const u = lonLatToUtm(lon, lat, zNum, isSouth);
              const newOffX = 400 - u.E * scale;
              const newOffY = 250 - u.N * scale;
              setOffset({ x: newOffX, y: newOffY });
              toast.showSuccess(`Flew camera to ${lat.toFixed(5)}°N, ${lon.toFixed(5)}°E`);
            }}
          />
        </div>
      </div>

      {/* 2. Deep Analysis & Attribute Data Grid Workspace Tabs */}
      <div className="bg-white dark:bg-[#0f0f0f] rounded-2xl p-6 border border-slate-200 dark:border-white/5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/5 pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveWorkspaceTab('table')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeWorkspaceTab === 'table'
                  ? 'bg-amber-500 text-black font-bold shadow-sm'
                  : 'text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-[#141414]'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" /> Attribute Table ({activeLayer.features.length})
            </button>
            <button
              onClick={() => setActiveWorkspaceTab('analysis')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeWorkspaceTab === 'analysis'
                  ? 'bg-amber-500 text-black font-bold shadow-sm'
                  : 'text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-[#141414]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" /> Deep Spatial Analysis
            </button>
            <button
              onClick={() => setActiveWorkspaceTab('topology')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeWorkspaceTab === 'topology'
                  ? 'bg-amber-500 text-black font-bold shadow-sm'
                  : 'text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-[#141414]'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Topology QA ({topologyIssues.length})
            </button>
          </div>
        </div>

        {/* Tab 1: Attribute Table */}
        {activeWorkspaceTab === 'table' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1 max-w-md">
                <Search className="w-3.5 h-3.5 text-slate-400 dark:text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={tableSearchQuery}
                  onChange={e => setTableSearchQuery(e.target.value)}
                  placeholder={`Search features in ${activeLayer.name}...`}
                  className="w-full py-1.5 pl-8 pr-3 bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-800 dark:text-white"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDeduplicateActiveLayer}
                  className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
                  title="Detect and remove duplicate geometry/features in this layer"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Clean Duplicates
                </button>
                <span className="text-xs text-slate-400 dark:text-white/40 font-mono hidden sm:inline">
                  Active: <strong className="text-amber-500">{activeLayer.name}</strong>
                </span>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141414]">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-200 dark:bg-[#1c1c1c] text-slate-700 dark:text-white/70 font-semibold sticky top-0 border-b border-slate-200 dark:border-white/10 font-mono">
                  <tr>
                    <th className="p-2.5">Feature Name</th>
                    <th className="p-2.5">Geometry</th>
                    <th className="p-2.5">Coordinates / Area</th>
                    <th className="p-2.5">Properties</th>
                    <th className="p-2.5">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/5 font-mono text-slate-700 dark:text-white/80">
                  {activeLayer.features
                    .filter(f => !tableSearchQuery.trim() || f.name.toLowerCase().includes(tableSearchQuery.toLowerCase()))
                    .map((f, i) => (
                      <tr key={i} className="hover:bg-slate-100 dark:hover:bg-white/5">
                        <td className="p-2.5 font-bold text-slate-900 dark:text-white">{f.name}</td>
                        <td className="p-2.5">
                          <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-white/5 text-[10px] uppercase font-bold text-sky-500">
                            {f.geom}
                          </span>
                        </td>
                        <td className="p-2.5 text-xs text-emerald-600 dark:text-emerald-400">
                          {f.geom === 'polygon'
                            ? `${(polygonAreaPerimeter(f.pts.map(p => ({ E: p.a, N: p.b }))).areaHa).toFixed(4)} Ha`
                            : `${f.pts.length} pts`}
                        </td>
                        <td className="p-2.5 text-[11px] text-slate-500 dark:text-white/60 truncate max-w-xs">
                          {Object.entries(f.props || {})
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(' | ')}
                        </td>
                        <td className="p-2.5">
                          <button
                            onClick={() => {
                              const nextFeats = activeLayer.features.filter((_, idx) => idx !== i);
                              const nextLayers = layers.map(l => (l.id === activeLayer.id ? { ...l, features: nextFeats } : l));
                              pushHistory(nextLayers, 'Deleted Feature from Table');
                            }}
                            className="text-rose-500 hover:text-rose-600 font-bold"
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
        )}

        {/* Tab 2: Deep Spatial Analysis */}
        {activeWorkspaceTab === 'analysis' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            {/* 1. Buffer Configuration */}
            <div className="p-4 bg-slate-50 dark:bg-[#141414] rounded-xl border border-slate-200 dark:border-white/5 space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <h5 className="text-xs font-bold text-slate-800 dark:text-white uppercase font-mono flex items-center gap-1.5">
                  <Spline className="w-4 h-4 text-rose-400" /> Buffer Zone Generator
                </h5>
                <p className="text-xs text-slate-500 dark:text-white/50">
                  Generate statutory safety corridors, DGMS 7.5m barrier zones, or 500m eco-sensitive rings.
                </p>
                <div>
                  <label className="text-[10px] text-slate-400 dark:text-white/40 block mb-1">Buffer Radius (Distance)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={bufferDistance}
                      onChange={e => setBufferDistance(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 bg-white dark:bg-[#181818] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-800 dark:text-white font-mono"
                    />
                    <select
                      value={bufferUnit}
                      onChange={e => setBufferUnit(e.target.value as any)}
                      className="px-3 py-1.5 bg-white dark:bg-[#181818] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-800 dark:text-white"
                    >
                      <option value="m">Meters</option>
                      <option value="ft">Feet</option>
                    </select>
                  </div>
                </div>
              </div>
              <button
                onClick={handleRunBuffer}
                className="w-full py-2 bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs rounded-xl transition-all shadow-sm"
              >
                Execute Buffer Generation
              </button>
            </div>

            {/* 2. Boundary Enclosures & Geometry */}
            <div className="p-4 bg-slate-50 dark:bg-[#141414] rounded-xl border border-slate-200 dark:border-white/5 space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <h5 className="text-xs font-bold text-slate-800 dark:text-white uppercase font-mono flex items-center gap-1.5">
                  <Maximize2 className="w-4 h-4 text-amber-400" /> Convex Hull & Enclosures
                </h5>
                <p className="text-xs text-slate-500 dark:text-white/50">
                  Compute the minimum bounding polygon encompassing all vertices in the active layer.
                </p>
              </div>
              <div className="space-y-2">
                <button
                  onClick={handleRunConvexHull}
                  className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs rounded-xl transition-all shadow-sm"
                >
                  Extract Convex Hull
                </button>
                <button
                  onClick={handleRunCentroids}
                  className="w-full py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm"
                >
                  Extract Feature Centroids
                </button>
              </div>
            </div>

            {/* 3. Voronoi Influence Cells */}
            <div className="p-4 bg-slate-50 dark:bg-[#141414] rounded-xl border border-slate-200 dark:border-white/5 space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <h5 className="text-xs font-bold text-slate-800 dark:text-white uppercase font-mono flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-purple-400" /> Voronoi / Thiessen
                </h5>
                <p className="text-xs text-slate-500 dark:text-white/50">
                  Construct area-of-influence tessellations around borehole collars or sample survey points.
                </p>
              </div>
              <div className="space-y-2">
                <button
                  onClick={handleRunVoronoi}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm"
                >
                  Compute Voronoi Cells
                </button>
                <button
                  onClick={handleRunTopologyAudit}
                  className="w-full py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm"
                >
                  Run Topology QA Audit
                </button>
              </div>
            </div>

            {/* 4. Deduplication & Geometry Sanitizer */}
            <div className="p-4 bg-slate-50 dark:bg-[#141414] rounded-xl border border-slate-200 dark:border-white/5 space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <h5 className="text-xs font-bold text-slate-800 dark:text-white uppercase font-mono flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-400" /> Deduplication & Cleansing
                </h5>
                <p className="text-xs text-slate-500 dark:text-white/50">
                  Detect and eliminate duplicate features, redundant co-linear nodes, and zero-area spikes.
                </p>
              </div>
              <div className="space-y-2">
                <button
                  onClick={handleDeduplicateActiveLayer}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm"
                >
                  Clean Active Layer
                </button>
                <button
                  onClick={handleDeduplicateAllLayers}
                  className="w-full py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 font-bold text-xs rounded-xl transition-all"
                >
                  Clean All Layers ({layers.length})
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Topology QA Issues */}
        {activeWorkspaceTab === 'topology' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-bold text-slate-800 dark:text-white font-mono flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Topology Validation Report for "{activeLayer.name}"
              </h5>
              <button
                onClick={handleRunTopologyAudit}
                className="px-3 py-1 bg-slate-100 dark:bg-[#141414] hover:bg-slate-200 dark:hover:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-800 dark:text-white"
              >
                Re-Scan Layer
              </button>
            </div>

            {topologyIssues.length === 0 ? (
              <div className="p-6 bg-slate-50 dark:bg-[#141414] rounded-xl border border-slate-200 dark:border-white/5 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="text-xs text-slate-800 dark:text-white font-bold">No Topology Defects Detected</p>
                <p className="text-[11px] text-slate-500 dark:text-white/40">
                  All polygon rings are strictly closed, free of self-intersections, slivers, and duplicate vertices.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {topologyIssues.map((issue, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 dark:bg-[#141414] rounded-xl border border-slate-200 dark:border-white/10 flex items-start justify-between gap-4 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                            issue.severity === 'error' ? 'bg-rose-500/20 text-rose-500' : 'bg-amber-500/20 text-amber-500'
                          }`}
                        >
                          {issue.type.replace('_', ' ')}
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white">{issue.featureName}</span>
                      </div>
                      <p className="text-slate-600 dark:text-white/60">{issue.description}</p>
                    </div>

                    {issue.location && (
                      <span className="text-[10px] font-mono text-slate-400 dark:text-white/40 shrink-0">
                        E: {issue.location.E.toFixed(1)}, N: {issue.location.N.toFixed(1)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. AI Spatial Copilot Drawer */}
      <GisAiCopilotDrawer
        isOpen={isAiCopilotOpen}
        onClose={() => setIsAiCopilotOpen(false)}
        workingZone={workingZone}
        activeLayer={activeLayer}
        centerCoord={cursorCoord ? { E: cursorCoord.E, N: cursorCoord.N } : null}
        onInsertFeatures={handleInsertAiFeatures}
      />

      {/* 4. Cartographic Map Composer Modal */}
      {showMapComposerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#141414] border border-slate-200 dark:border-white/15 rounded-2xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50 dark:bg-[#181818]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <FileDown className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="font-serif italic text-slate-900 dark:text-white text-base font-semibold">
                    Cartographic Map Composer & High-Resolution Export
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-white/50">
                    Generate publication-grade PDF field sheets & ultra-HD static raster imagery
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportMapPDF}
                  disabled={isExporting}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold text-xs rounded-xl shadow-lg transition-all"
                >
                  <FileDown className="w-4 h-4" /> {isExporting ? 'Generating PDF...' : 'Download Map PDF'}
                </button>
                <button
                  onClick={() => setShowMapComposerModal(false)}
                  className="px-3 py-1.5 bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-800 dark:text-white text-xs rounded-xl transition-all"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 bg-slate-100 dark:bg-[#0f0f0f] text-slate-800 dark:text-white">
              {/* Configuration Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white dark:bg-[#141414] p-4 rounded-xl border border-slate-200 dark:border-white/5">
                {/* Metadata */}
                <div className="space-y-3">
                  <h4 className="text-xs font-mono uppercase font-bold text-amber-500 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5" /> Cartographic Metadata
                  </h4>
                  <div>
                    <label className="text-[11px] text-slate-500 dark:text-white/60 block mb-1">Map Sheet Title</label>
                    <input
                      type="text"
                      value={composerTitle}
                      onChange={e => setComposerTitle(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-800 dark:text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 dark:text-white/60 block mb-1">Subtitle / Lease / Location</label>
                    <input
                      type="text"
                      value={composerSubTitle}
                      onChange={e => setComposerSubTitle(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-800 dark:text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-500 dark:text-white/60 block mb-1">Project Ref ID</label>
                      <input
                        type="text"
                        value={pdfProjectRef}
                        onChange={e => setPdfProjectRef(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-800 dark:text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 dark:text-white/60 block mb-1">Lead Surveyor Name</label>
                      <input
                        type="text"
                        value={pdfSurveyorName}
                        onChange={e => setPdfSurveyorName(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-800 dark:text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Output Format & Overlays */}
                <div className="space-y-3">
                  <h4 className="text-xs font-mono uppercase font-bold text-amber-500 flex items-center gap-1.5">
                    <Settings2 className="w-3.5 h-3.5" /> Output Format & Overlays
                  </h4>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-500 dark:text-white/60 block mb-1">PDF Page Size</label>
                      <select
                        value={pdfPageFormat}
                        onChange={e => setPdfPageFormat(e.target.value as any)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-800 dark:text-white"
                      >
                        <option value="a4">A4 Standard Sheet</option>
                        <option value="a3">A3 Engineering Plan</option>
                        <option value="letter">US Letter Sheet</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 dark:text-white/60 block mb-1">Orientation</label>
                      <select
                        value={pdfOrientation}
                        onChange={e => setPdfOrientation(e.target.value as any)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-800 dark:text-white"
                      >
                        <option value="landscape">Landscape (Recommended)</option>
                        <option value="portrait">Portrait</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-white/80 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exportIncludeGrid}
                        onChange={e => setExportIncludeGrid(e.target.checked)}
                        className="accent-amber-500 rounded"
                      />
                      UTM Graticule Grid
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-white/80 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exportIncludeLegend}
                        onChange={e => setExportIncludeLegend(e.target.checked)}
                        className="accent-amber-500 rounded"
                      />
                      Symbology Legend
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-white/80 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exportIncludeNorth}
                        onChange={e => setExportIncludeNorth(e.target.checked)}
                        className="accent-amber-500 rounded"
                      />
                      True North Arrow
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-white/80 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exportIncludeScale}
                        onChange={e => setExportIncludeScale(e.target.checked)}
                        className="accent-amber-500 rounded"
                      />
                      Geodetic Scale Bar
                    </label>
                  </div>
                </div>
              </div>

              {/* Direct PNG Export Options */}
              <div className="p-4 bg-white dark:bg-[#141414] rounded-xl border border-slate-200 dark:border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="space-y-1 text-left">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-sky-400" />
                    <span className="text-xs font-bold text-slate-800 dark:text-white font-mono uppercase">
                      Direct High-Resolution PNG Export
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-white/50">
                    Export pixel-perfect georeferenced raster viewports ready for AutoCAD, GIS layers, or field logs.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => handleExportHighResPNG(1)}
                    disabled={isExporting}
                    className="px-3 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-white text-xs rounded-xl"
                  >
                    1x (Standard)
                  </button>
                  <button
                    onClick={() => handleExportHighResPNG(2)}
                    disabled={isExporting}
                    className="px-3 py-1.5 bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 text-sky-600 dark:text-sky-300 font-bold text-xs rounded-xl"
                  >
                    2x (HD)
                  </button>
                  <button
                    onClick={() => handleExportHighResPNG(3)}
                    disabled={isExporting}
                    className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-600 dark:text-amber-300 font-bold text-xs rounded-xl"
                  >
                    3x (Print)
                  </button>
                  <button
                    onClick={() => handleExportHighResPNG(4)}
                    disabled={isExporting}
                    className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-600 dark:text-purple-300 font-bold text-xs rounded-xl"
                  >
                    4x (Ultra HD)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
