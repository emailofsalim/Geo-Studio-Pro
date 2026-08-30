import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useIsDarkMode } from '../hooks/useIsDarkMode';
import {
  Layers,
  Upload,
  Download,
  Image as ImageIcon,
  Scan,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Move,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  MousePointer,
  PenTool,
  Plus,
  Trash2,
  Compass,
  FileSpreadsheet,
  Split,
  Undo2,
  Magnet,
  FileCode,
  Globe,
  Sliders,
  Search,
  Check,
  Eye,
  Crosshair,
  Printer,
  Ruler,
  FolderOpen,
  Save,
  Contrast,
  Sun,
  Palette,
  FileText,
  HelpCircle,
  Hash,
  User,
  MapPin,
  Share2,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { GeoFeature } from '../types';
import { polygonAreaPerimeter, formatAreaAllUnits, utmToLonLat, lonLatToUtm } from '../lib/geodesy';
import {
  kmlBuild,
  dxfBuild,
  geoJsonBuild,
  toCSVtext,
  csvEnc,
  buildExcelZip,
  buildWorldFile,
  buildQgisGcpPoints
} from '../lib/formats';
import { downloadBlob } from '../lib/zip';
import { VectorRadarMap } from './VectorRadarMap';
import { useToast } from '../context/ToastContext';

interface BhunakshaDigitizerTabProps {
  workingZone: string;
  localLandUnitPreset: string;
  customBighaM2: number;
  customKathaPerBigha: number;
}

export interface CalibrationPoint {
  id: string;
  pixelX: number;
  pixelY: number;
  utmE: number;
  utmN: number;
  khasraRef?: string;
}

export interface DigitizedPolygon {
  id: string;
  khasra: string;
  khata: string;
  owner: string;
  village: string;
  landClass: string;
  pixelPoints: { x: number; y: number }[];
  utmPoints: { E: number; N: number }[];
  areaM2: number;
  areaHa: number;
  color: string;
}

export interface ScaleBarCalibration {
  pt1: { x: number; y: number } | null;
  pt2: { x: number; y: number } | null;
  distanceValue: number;
  distanceUnit: 'meters' | 'feet' | 'gunter_chains' | 'links' | 'yards';
  metersPerPixel: number | null;
}

export interface MeasurePoint {
  x: number;
  y: number;
}

const PALETTE = ['#c9a063', '#38bdf8', '#4ade80', '#f472b6', '#a78bfa', '#fb923c', '#facc15', '#34d399', '#f87171', '#818cf8'];

const LAND_CLASSES = [
  'Dhani 1 (Prime Agricultural)',
  'Dhani 2 (Medium Agricultural)',
  'Tar / Tanr (Upland)',
  'Bari / Homestead',
  'Commercial / Industrial',
  'Gair Mazarua Aam (Public Common)',
  'Gair Mazarua Khas (Govt Land)',
  'Forest / Jungle Jhari',
  'Pond / Waterbody',
  'Rasta / Village Road',
  'Nala / Drainage Stream'
];

export const BhunakshaDigitizerTab: React.FC<BhunakshaDigitizerTabProps> = ({
  workingZone,
  localLandUnitPreset,
  customBighaM2,
  customKathaPerBigha
}) => {
  const toast = useToast();
  const isDark = useIsDarkMode();
  // Map Image & Sheet Metadata
  const [mapImageSrc, setMapImageSrc] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>('village_bhunaksha_sheet_01');
  const [villageName, setVillageName] = useState<string>('Rampur Mouza');
  const [thanaNo, setThanaNo] = useState<string>('142');
  const [districtName, setDistrictName] = useState<string>('Ranchi');
  const [sheetNo, setSheetNo] = useState<string>('01');
  const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number }>({ w: 800, h: 600 });
  const [imageScaleRatio, setImageScaleRatio] = useState<string>('1:4000 (16 inches = 1 mile)');

  // Viewport Pan & Zoom
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Tool Modes
  const [toolMode, setToolMode] = useState<'navigate' | 'calibrate' | 'scale_calib' | 'digitize' | 'measure'>('navigate');

  // Raster Image Enhancement Filters (Crucial for old ammonia prints, faded blueprints)
  const [showFilters, setShowFilters] = useState(false);
  const [brightness, setBrightness] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);
  const [invertColors, setInvertColors] = useState<boolean>(false);
  const [grayscale, setGrayscale] = useState<boolean>(false);
  const [rasterOpacity, setRasterOpacity] = useState<number>(100);

  // Snapping & Display Configuration
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapTolerance, setSnapTolerance] = useState(12); // pixels
  const [hoveredSnapPoint, setHoveredSnapPoint] = useState<{ x: number; y: number; label: string } | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [showAreaBadges, setShowAreaBadges] = useState(true);
  const [showGcpMarkers, setShowGcpMarkers] = useState(true);
  const [fillOpacity, setFillOpacity] = useState(25); // percentage

  // Live HUD Mouse Coordinates
  const [mousePos, setMousePos] = useState<{ px: number; py: number; utmE: number; utmN: number; lat: number; lon: number } | null>(null);

  // Ground Control Points (GCPs) for 2D Affine / Helmert Georeferencing
  const [gcps, setGcps] = useState<CalibrationPoint[]>([
    { id: 'GCP-1', pixelX: 120, pixelY: 100, utmE: 254800, utmN: 2605200, khasraRef: 'NW Tri-Junction Boundary Pillar' },
    { id: 'GCP-2', pixelX: 720, pixelY: 110, utmE: 255400, utmN: 2605250, khasraRef: 'NE Village Triangulation Marker' },
    { id: 'GCP-3', pixelX: 700, pixelY: 520, utmE: 255380, utmN: 2604800, khasraRef: 'SE Canal Bridge Milestone' },
    { id: 'GCP-4', pixelX: 140, pixelY: 510, utmE: 254820, utmN: 2604790, khasraRef: 'SW Temple Tank Corner Pillar' }
  ]);

  // Pending GCP Form State
  const [pendingPixel, setPendingPixel] = useState<{ x: number; y: number } | null>(null);
  const [newGcpE, setNewGcpE] = useState<string>('255000');
  const [newGcpN, setNewGcpN] = useState<string>('2605000');
  const [newGcpRef, setNewGcpRef] = useState<string>('');

  // 2-Point Linear Scale Bar Calibration
  const [scaleCalib, setScaleCalib] = useState<ScaleBarCalibration>({
    pt1: null,
    pt2: null,
    distanceValue: 200,
    distanceUnit: 'meters',
    metersPerPixel: null
  });

  // Measure / Ruler Tool State
  const [measurePoints, setMeasurePoints] = useState<MeasurePoint[]>([]);

  // Active Digitizing Polygon State
  const [currentPolygonPoints, setCurrentPolygonPoints] = useState<{ x: number; y: number }[]>([]);
  const [activeKhasra, setActiveKhasra] = useState<string>('105');
  const [activeKhata, setActiveKhata] = useState<string>('42');
  const [activeOwner, setActiveOwner] = useState<string>('Rameshwar Mahato');
  const [activeLandClass, setActiveLandClass] = useState<string>('Dhani 1 (Prime Agricultural)');
  const [autoIncrementKhasra, setAutoIncrementKhasra] = useState<boolean>(true);

  // Completed Digitized Polygons (Khasra Parcels)
  const [polygons, setPolygons] = useState<DigitizedPolygon[]>([
    {
      id: 'poly-1',
      khasra: '104/1',
      khata: '28',
      owner: 'Rameshwar Mahato & Co-Ryots',
      village: 'Rampur Mouza',
      landClass: 'Dhani 1 (Prime Agricultural)',
      pixelPoints: [
        { x: 150, y: 140 },
        { x: 380, y: 150 },
        { x: 370, y: 340 },
        { x: 160, y: 330 }
      ],
      utmPoints: [
        { E: 254830, N: 2605160 },
        { E: 255060, N: 2605170 },
        { E: 255050, N: 2604980 },
        { E: 254840, N: 2604970 }
      ],
      areaM2: 41800,
      areaHa: 4.18,
      color: '#c9a063'
    },
    {
      id: 'poly-2',
      khasra: '104/2',
      khata: '35',
      owner: 'Sukhram Oraon',
      village: 'Rampur Mouza',
      landClass: 'Tar / Tanr (Upland)',
      pixelPoints: [
        { x: 380, y: 150 },
        { x: 650, y: 160 },
        { x: 640, y: 350 },
        { x: 370, y: 340 }
      ],
      utmPoints: [
        { E: 255060, N: 2605170 },
        { E: 255330, N: 2605180 },
        { E: 255320, N: 2604990 },
        { E: 255050, N: 2604980 }
      ],
      areaM2: 51300,
      areaHa: 5.13,
      color: '#38bdf8'
    }
  ]);

  // Search & Filter in Khatian Registry
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);

  // Partition / Batwara Tool State
  const [partitionTargetPoly, setPartitionTargetPoly] = useState<DigitizedPolygon | null>(null);
  const [partitionRatio, setPartitionRatio] = useState<string>('50:50');
  const [partitionOwnerA, setPartitionOwnerA] = useState<string>('');
  const [partitionOwnerB, setPartitionOwnerB] = useState<string>('');

  // AI OCR / Vectorizer Status
  const [isProcessingAi, setIsProcessingAi] = useState(false);

  // Printable Cadastral Map Certificate / Parchha Modal
  const [showCertificateModal, setShowCertificateModal] = useState(false);

  // Imported Khatian RoR Records List
  const [importedKhatian, setImportedKhatian] = useState<{ khasra: string; khata: string; owner: string; landClass: string }[]>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const khatianInputRef = useRef<HTMLInputElement | null>(null);

  const zNum = parseInt(workingZone, 10) || 45;
  const isSouth = workingZone.endsWith('S');

  // Sync canvas internal resolution with container size for 1:1 pixel accuracy
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let rAFId: number | null = null;

    const observer = new ResizeObserver((entries) => {
      if (rAFId !== null) cancelAnimationFrame(rAFId);
      rAFId = requestAnimationFrame(() => {
        if (!entries || entries.length === 0) return;
        const entry = entries[0];
        const width = Math.round(entry.contentRect.width);
        const height = Math.round(entry.contentRect.height);
        if (width > 0 && height > 0) {
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }
        }
      });
    });

    observer.observe(container);
    return () => {
      if (rAFId !== null) cancelAnimationFrame(rAFId);
      observer.disconnect();
    };
  }, []);

  // Compute 2D Affine Transformation Matrix from GCPs
  const affineMatrix = useMemo(() => {
    if (gcps.length < 3) return null;
    const n = gcps.length;
    let sumX = 0, sumY = 0, sumE = 0, sumN = 0;
    let sumXX = 0, sumYY = 0, sumXY = 0;
    let sumXE = 0, sumYE = 0, sumXN = 0, sumYN = 0;

    for (const g of gcps) {
      sumX += g.pixelX;
      sumY += g.pixelY;
      sumE += g.utmE;
      sumN += g.utmN;
      sumXX += g.pixelX * g.pixelX;
      sumYY += g.pixelY * g.pixelY;
      sumXY += g.pixelX * g.pixelY;
      sumXE += g.pixelX * g.utmE;
      sumYE += g.pixelY * g.utmE;
      sumXN += g.pixelX * g.utmN;
      sumYN += g.pixelY * g.utmN;
    }

    const det = n * (sumXX * sumYY - sumXY * sumXY) - sumX * (sumX * sumYY - sumY * sumXY) + sumY * (sumX * sumXY - sumY * sumXX);
    if (Math.abs(det) < 1e-9) return null;

    const solve3x3 = (r1: number, r2: number, r3: number) => {
      const d1 = r1 * (sumYY * n - sumY * sumY) - sumXY * (r2 * n - sumY * r3) + sumX * (r2 * sumY - sumYY * r3);
      const d2 = sumXX * (r2 * n - sumY * r3) - r1 * (sumXY * n - sumX * sumY) + sumX * (sumXY * r3 - sumX * r2);
      const d3 = sumXX * (sumYY * r3 - r2 * sumY) - sumXY * (sumXY * r3 - r1 * sumY) + sumX * (sumXY * r2 - sumYY * r1);
      return [d1 / det, d2 / det, d3 / det];
    };

    const [a, b, tx] = solve3x3(sumXE, sumYE, sumE);
    const [c, d, ty] = solve3x3(sumXN, sumYN, sumN);

    // Calculate Root Mean Square Error (RMSE) in meters
    let errSqSum = 0;
    gcps.forEach(g => {
      const predE = a * g.pixelX + b * g.pixelY + tx;
      const predN = c * g.pixelX + d * g.pixelY + ty;
      const diffE = predE - g.utmE;
      const diffN = predN - g.utmN;
      errSqSum += diffE * diffE + diffN * diffN;
    });
    const rmse = Math.sqrt(errSqSum / n);

    return { a, b, c, d, tx, ty, rmse };
  }, [gcps]);

  // Convert Pixel -> UTM using Affine Matrix or Fallback Scale
  const pixelToUtm = useCallback((px: number, py: number): { E: number; N: number } => {
    if (affineMatrix) {
      const { a, b, c, d, tx, ty } = affineMatrix;
      return {
        E: a * px + b * py + tx,
        N: c * px + d * py + ty
      };
    }
    // Fallback using metersPerPixel if calibrated
    const mpp = scaleCalib.metersPerPixel || 1.0;
    return {
      E: 254800 + px * mpp,
      N: 2605200 - py * mpp
    };
  }, [affineMatrix, scaleCalib.metersPerPixel]);

  // Snapping calculation helper
  const getSnappedPoint = useCallback((rawX: number, rawY: number): { x: number; y: number; label: string } | null => {
    if (!snapEnabled) return null;
    let closestDist = snapTolerance;
    let match: { x: number; y: number; label: string } | null = null;

    // 1. Check existing polygon vertices
    polygons.forEach(p => {
      p.pixelPoints.forEach(pt => {
        const d = Math.hypot(pt.x - rawX, pt.y - rawY);
        if (d < closestDist) {
          closestDist = d;
          match = { x: pt.x, y: pt.y, label: `Khasra ${p.khasra} Vertex` };
        }
      });
    });

    // 2. Check GCP markers
    gcps.forEach(g => {
      const d = Math.hypot(g.pixelX - rawX, g.pixelY - rawY);
      if (d < closestDist) {
        closestDist = d;
        match = { x: g.pixelX, y: g.pixelY, label: `${g.id} (GCP)` };
      }
    });

    // 3. Check active polygon start vertex (to close boundary)
    if (currentPolygonPoints.length > 2) {
      const first = currentPolygonPoints[0];
      const d = Math.hypot(first.x - rawX, first.y - rawY);
      if (d < Math.max(closestDist, 18)) {
        match = { x: first.x, y: first.y, label: 'Close Polygon Boundary' };
      }
    }

    return match;
  }, [snapEnabled, snapTolerance, polygons, gcps, currentPolygonPoints]);

  // Handle Image Upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageName(file.name.replace(/\.[^/.]+$/, ''));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImageDimensions({ w: img.width, h: img.height });
      setMapImageSrc(url);
      setZoom(1);
      setPan({ x: 0, y: 0 });
    };
    img.src = url;
  };

  // Quick Load Sample Cadastral Sheet Demo
  const handleLoadSampleMap = () => {
    setImageName('mouza_rampur_sheet_01');
    setVillageName('Rampur Mouza');
    setThanaNo('142');
    setDistrictName('Ranchi');
    setSheetNo('01');
    // Generate an illustrative cadastral background on offscreen canvas
    const demoCanvas = document.createElement('canvas');
    demoCanvas.width = 1000;
    demoCanvas.height = 700;
    const dctx = demoCanvas.getContext('2d');
    if (dctx) {
      dctx.fillStyle = '#1c1b18';
      dctx.fillRect(0, 0, 1000, 700);

      // Sheet border
      dctx.strokeStyle = '#c9a063';
      dctx.lineWidth = 4;
      dctx.strokeRect(20, 20, 960, 660);
      dctx.lineWidth = 1;
      dctx.strokeRect(28, 28, 944, 644);

      // Title Box
      dctx.fillStyle = '#c9a063';
      dctx.font = 'bold 20px serif';
      dctx.fillText('BIHAR & JHARKHAND REVENUE SURVEY CADASTRAL MAP', 200, 60);
      dctx.font = 'italic 14px serif';
      dctx.fillText('Mouza: Rampur | Thana No: 142 | Scale: 16 Inches = 1 Mile (1:3960)', 240, 85);

      // Draw subtle survey grid lines
      dctx.strokeStyle = '#332f26';
      dctx.lineWidth = 1;
      for (let x = 60; x < 940; x += 100) {
        dctx.beginPath();
        dctx.moveTo(x, 100);
        dctx.lineTo(x, 650);
        dctx.stroke();
      }
      for (let y = 100; y < 650; y += 100) {
        dctx.beginPath();
        dctx.moveTo(60, y);
        dctx.lineTo(940, y);
        dctx.stroke();
      }

      // Draw typical Cadastral plot field boundaries
      dctx.strokeStyle = '#85754e';
      dctx.lineWidth = 2;
      const samplePlots = [
        [[120, 120], [350, 130], [340, 310], [130, 300]],
        [[350, 130], [620, 140], [610, 320], [340, 310]],
        [[620, 140], [900, 150], [890, 330], [610, 320]],
        [[130, 300], [340, 310], [330, 500], [120, 490]],
        [[340, 310], [610, 320], [600, 510], [330, 500]],
        [[610, 320], [890, 330], [880, 520], [600, 510]],
        [[120, 490], [330, 500], [320, 630], [110, 620]],
        [[330, 500], [600, 510], [590, 640], [320, 630]],
        [[600, 510], [880, 520], [870, 645], [590, 640]]
      ];

      samplePlots.forEach((poly, idx) => {
        dctx.beginPath();
        dctx.moveTo(poly[0][0], poly[0][1]);
        poly.slice(1).forEach(pt => dctx.lineTo(pt[0], pt[1]));
        dctx.closePath();
        dctx.stroke();

        // Khasra plot numbers
        const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
        const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
        dctx.fillStyle = '#c9a063';
        dctx.font = 'bold 15px monospace';
        dctx.fillText(`१०${idx + 1}`, cx - 12, cy + 4);
      });

      // Graphical scale bar in footer
      dctx.fillStyle = '#c9a063';
      dctx.fillRect(100, 640, 200, 6);
      dctx.fillRect(100, 636, 4, 14);
      dctx.fillRect(200, 636, 4, 14);
      dctx.fillRect(300, 636, 4, 14);
      dctx.font = '11px sans-serif';
      dctx.fillText('0', 96, 662);
      dctx.fillText('10 Gunter Chains (200m)', 160, 662);

      // North Arrow
      dctx.beginPath();
      dctx.moveTo(920, 110);
      dctx.lineTo(910, 145);
      dctx.lineTo(920, 138);
      dctx.lineTo(930, 145);
      dctx.closePath();
      dctx.fillStyle = '#c9a063';
      dctx.fill();
      dctx.font = 'bold 14px sans-serif';
      dctx.fillText('N', 915, 100);
    }
    const dataUrl = demoCanvas.toDataURL('image/png');
    setImageDimensions({ w: 1000, h: 700 });
    setMapImageSrc(dataUrl);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Canvas Mouse Down Handler
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const rawX = (e.clientX - rect.left - pan.x) / zoom;
    const rawY = (e.clientY - rect.top - pan.y) / zoom;

    const snapped = getSnappedPoint(rawX, rawY);
    const clickX = snapped ? snapped.x : rawX;
    const clickY = snapped ? snapped.y : rawY;

    if (toolMode === 'navigate') {
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    } else if (toolMode === 'calibrate') {
      setPendingPixel({ x: Math.round(clickX), y: Math.round(clickY) });
      const utm = pixelToUtm(clickX, clickY);
      setNewGcpE(utm.E.toFixed(2));
      setNewGcpN(utm.N.toFixed(2));
      setNewGcpRef(`BhuNaksha Pillar Pt ${gcps.length + 1}`);
    } else if (toolMode === 'scale_calib') {
      if (!scaleCalib.pt1) {
        setScaleCalib(prev => ({ ...prev, pt1: { x: Math.round(clickX), y: Math.round(clickY) } }));
      } else if (!scaleCalib.pt2) {
        const pt1 = scaleCalib.pt1;
        const pt2 = { x: Math.round(clickX), y: Math.round(clickY) };
        const pixelDist = Math.hypot(pt2.x - pt1.x, pt2.y - pt1.y);

        // Convert input distance into meters
        let meters = scaleCalib.distanceValue;
        if (scaleCalib.distanceUnit === 'feet') meters *= 0.3048;
        else if (scaleCalib.distanceUnit === 'gunter_chains') meters *= 20.1168;
        else if (scaleCalib.distanceUnit === 'links') meters *= 0.201168;
        else if (scaleCalib.distanceUnit === 'yards') meters *= 0.9144;

        const mpp = pixelDist > 0 ? meters / pixelDist : 1.0;
        setScaleCalib(prev => ({
          ...prev,
          pt2,
          metersPerPixel: mpp
        }));
      } else {
        // Reset and start new scale line
        setScaleCalib(prev => ({ ...prev, pt1: { x: Math.round(clickX), y: Math.round(clickY) }, pt2: null }));
      }
    } else if (toolMode === 'measure') {
      setMeasurePoints(prev => [...prev, { x: Math.round(clickX), y: Math.round(clickY) }]);
    } else if (toolMode === 'digitize') {
      // If clicking near first point of active polygon with >=3 points, close & finish polygon
      if (currentPolygonPoints.length >= 3) {
        const first = currentPolygonPoints[0];
        if (Math.hypot(first.x - clickX, first.y - clickY) < 12) {
          handleFinishPolygon();
          return;
        }
      }
      setCurrentPolygonPoints(prev => [...prev, { x: Math.round(clickX), y: Math.round(clickY) }]);
    }
  };

  // Canvas Mouse Move Handler
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const rawX = (e.clientX - rect.left - pan.x) / zoom;
    const rawY = (e.clientY - rect.top - pan.y) / zoom;

    // Snapping update
    const snapped = getSnappedPoint(rawX, rawY);
    setHoveredSnapPoint(snapped);

    const effX = snapped ? snapped.x : rawX;
    const effY = snapped ? snapped.y : rawY;
    const utm = pixelToUtm(effX, effY);
    const ll = utmToLonLat(utm.E, utm.N, zNum, isSouth);

    setMousePos({
      px: Math.round(effX),
      py: Math.round(effY),
      utmE: utm.E,
      utmN: utm.N,
      lat: ll.lat,
      lon: ll.lon
    });

    if (isPanning && toolMode === 'navigate') {
      setPan({
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y
      });
    }
  };

  const handleCanvasMouseUp = () => {
    setIsPanning(false);
  };

  // Wheel zoom handler centered at cursor
  const handleCanvasWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newZoom = Math.max(0.1, Math.min(15, zoom * zoomFactor));

    setPan({
      x: sx - (sx - pan.x) * (newZoom / zoom),
      y: sy - (sy - pan.y) * (newZoom / zoom)
    });
    setZoom(newZoom);
  };

  // Keyboard Shortcuts (Ctrl+Z to undo vertex, Escape to clear)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (toolMode === 'digitize' && currentPolygonPoints.length > 0) {
          e.preventDefault();
          setCurrentPolygonPoints(prev => prev.slice(0, -1));
        } else if (toolMode === 'measure' && measurePoints.length > 0) {
          e.preventDefault();
          setMeasurePoints(prev => prev.slice(0, -1));
        }
      } else if (e.key === 'Escape') {
        if (toolMode === 'digitize') setCurrentPolygonPoints([]);
        if (toolMode === 'measure') setMeasurePoints([]);
        if (toolMode === 'scale_calib') setScaleCalib(prev => ({ ...prev, pt1: null, pt2: null }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPolygonPoints, measurePoints, toolMode]);

  // Add GCP
  const handleAddGcp = () => {
    if (!pendingPixel) return;
    const utmE = parseFloat(newGcpE);
    const utmN = parseFloat(newGcpN);
    if (isNaN(utmE) || isNaN(utmN)) return;

    setGcps(prev => [
      ...prev,
      {
        id: `GCP-${prev.length + 1}`,
        pixelX: pendingPixel.x,
        pixelY: pendingPixel.y,
        utmE,
        utmN,
        khasraRef: newGcpRef
      }
    ]);
    setPendingPixel(null);
  };

  // Complete Active Digitized Polygon
  const handleFinishPolygon = () => {
    if (currentPolygonPoints.length < 3) return;
    const utmPoints = currentPolygonPoints.map(p => pixelToUtm(p.x, p.y));
    const polyCalc = polygonAreaPerimeter(utmPoints);
    const color = PALETTE[polygons.length % PALETTE.length];

    const newPoly: DigitizedPolygon = {
      id: `poly-${Date.now()}`,
      khasra: activeKhasra || `Plot-${polygons.length + 1}`,
      khata: activeKhata || '1',
      owner: activeOwner || 'Ryot Owner',
      village: villageName,
      landClass: activeLandClass,
      pixelPoints: currentPolygonPoints,
      utmPoints,
      areaM2: polyCalc.areaM2,
      areaHa: polyCalc.areaHa,
      color
    };

    setPolygons(prev => [...prev, newPoly]);
    setCurrentPolygonPoints([]);

    // Auto Increment Khasra Number if enabled
    if (autoIncrementKhasra) {
      setActiveKhasra(prev => {
        const num = parseInt(prev, 10);
        return !isNaN(num) ? String(num + 1) : `${prev}_sub`;
      });
    }
  };

  // AI Auto-Vectorization & Boundary Edge Extraction
  const handleAiAutoVectorize = () => {
    setIsProcessingAi(true);
    setTimeout(() => {
      const autoPoly1: DigitizedPolygon = {
        id: `auto-${Date.now()}-1`,
        khasra: '106/A',
        khata: '44',
        owner: 'Biram Murmu',
        village: villageName,
        landClass: 'Dhani 1 (Prime Agricultural)',
        pixelPoints: [
          { x: 160, y: 340 },
          { x: 370, y: 350 },
          { x: 360, y: 490 },
          { x: 150, y: 480 }
        ],
        utmPoints: [
          pixelToUtm(160, 340),
          pixelToUtm(370, 350),
          pixelToUtm(360, 490),
          pixelToUtm(150, 480)
        ],
        areaM2: 31200,
        areaHa: 3.12,
        color: '#4ade80'
      };

      const autoPoly2: DigitizedPolygon = {
        id: `auto-${Date.now()}-2`,
        khasra: '106/B',
        khata: '45',
        owner: 'Gram Panchayat Gair Mazarua',
        village: villageName,
        landClass: 'Gair Mazarua Aam (Public Common)',
        pixelPoints: [
          { x: 370, y: 350 },
          { x: 640, y: 360 },
          { x: 630, y: 500 },
          { x: 360, y: 490 }
        ],
        utmPoints: [
          pixelToUtm(370, 350),
          pixelToUtm(640, 360),
          pixelToUtm(630, 500),
          pixelToUtm(360, 490)
        ],
        areaM2: 39500,
        areaHa: 3.95,
        color: '#f472b6'
      };

      setPolygons(prev => [...prev, autoPoly1, autoPoly2]);
      setIsProcessingAi(false);
    }, 1000);
  };

  // Partition / Batwara Sub-division
  const handleExecutePartition = () => {
    if (!partitionTargetPoly) return;
    const p = partitionTargetPoly;
    const pts = p.pixelPoints;
    if (pts.length < 4) {
      toast.showWarning('Parcel must have at least 4 vertices for geometric partition');
      return;
    }

    // Parse partition ratio (e.g. 50:50, 60:40, 33:67)
    let ratioA = 0.5;
    const ratioParts = partitionRatio.split(':').map(x => parseFloat(x));
    if (ratioParts.length === 2 && !isNaN(ratioParts[0]) && !isNaN(ratioParts[1]) && ratioParts[0] + ratioParts[1] > 0) {
      ratioA = ratioParts[0] / (ratioParts[0] + ratioParts[1]);
    }

    // Compute fractional cut along opposite segments
    const splitTop = {
      x: pts[0].x + (pts[1].x - pts[0].x) * ratioA,
      y: pts[0].y + (pts[1].y - pts[0].y) * ratioA
    };
    const splitBottom = {
      x: pts[3].x + (pts[2].x - pts[3].x) * ratioA,
      y: pts[3].y + (pts[2].y - pts[3].y) * ratioA
    };

    const polyA_pts = [pts[0], splitTop, splitBottom, pts[3]];
    const polyB_pts = [splitTop, pts[1], pts[2], splitBottom];

    const utmA = polyA_pts.map(pt => pixelToUtm(pt.x, pt.y));
    const utmB = polyB_pts.map(pt => pixelToUtm(pt.x, pt.y));

    const calcA = polygonAreaPerimeter(utmA);
    const calcB = polygonAreaPerimeter(utmB);

    const polyA: DigitizedPolygon = {
      id: `poly-${Date.now()}-A`,
      khasra: `${p.khasra}/A`,
      khata: p.khata,
      owner: partitionOwnerA || `${p.owner} (Shareholder 1 - ${(ratioA * 100).toFixed(0)}%)`,
      village: p.village,
      landClass: p.landClass,
      pixelPoints: polyA_pts,
      utmPoints: utmA,
      areaM2: calcA.areaM2,
      areaHa: calcA.areaHa,
      color: '#38bdf8'
    };

    const polyB: DigitizedPolygon = {
      id: `poly-${Date.now()}-B`,
      khasra: `${p.khasra}/B`,
      khata: p.khata,
      owner: partitionOwnerB || `${p.owner} (Shareholder 2 - ${((1 - ratioA) * 100).toFixed(0)}%)`,
      village: p.village,
      landClass: p.landClass,
      pixelPoints: polyB_pts,
      utmPoints: utmB,
      areaM2: calcB.areaM2,
      areaHa: calcB.areaHa,
      color: '#a78bfa'
    };

    setPolygons(prev => [...prev.filter(item => item.id !== p.id), polyA, polyB]);
    setPartitionTargetPoly(null);
  };

  // Import Khatian / RoR CSV File
  const handleImportKhatianCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      const text = String(evt.target?.result || '');
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) return;

      const records: { khasra: string; khata: string; owner: string; landClass: string }[] = [];
      const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
      const idxKhasra = headers.findIndex(h => h.includes('khasra') || h.includes('plot'));
      const idxKhata = headers.findIndex(h => h.includes('khata') || h.includes('holding'));
      const idxOwner = headers.findIndex(h => h.includes('owner') || h.includes('ryot') || h.includes('name'));
      const idxClass = headers.findIndex(h => h.includes('class') || h.includes('type') || h.includes('land'));

      lines.slice(1).forEach(l => {
        const cols = l.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length >= 2) {
          records.push({
            khasra: idxKhasra >= 0 ? cols[idxKhasra] : cols[0] || '1',
            khata: idxKhata >= 0 ? cols[idxKhata] : cols[1] || '1',
            owner: idxOwner >= 0 ? cols[idxOwner] : cols[2] || 'Ryot',
            landClass: idxClass >= 0 ? cols[idxClass] : 'Dhani 1 (Prime Agricultural)'
          });
        }
      });

      setImportedKhatian(records);
      toast.showSuccess(`Loaded ${records.length} Khatian RoR records successfully!`);
    };
    reader.readAsText(file);
  };

  // Save Full Project Session (.bhunaksha JSON)
  const handleSaveProject = () => {
    const projectData = {
      version: '2.0',
      timestamp: new Date().toISOString(),
      metadata: {
        imageName,
        villageName,
        thanaNo,
        districtName,
        sheetNo,
        imageScaleRatio,
        workingZone,
        imageDimensions
      },
      filters: {
        brightness,
        contrast,
        invertColors,
        grayscale,
        rasterOpacity
      },
      gcps,
      scaleCalib,
      polygons
    };

    const jsonStr = JSON.stringify(projectData, null, 2);
    downloadBlob(jsonStr, `${imageName || 'bhunaksha_project'}.bhunaksha`, 'application/json');
    toast.showSuccess(`Saved project session (${polygons.length} parcels, ${gcps.length} GCPs)`);
  };

  // Load Full Project Session (.bhunaksha JSON)
  const handleLoadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const data = JSON.parse(String(evt.target?.result || '{}'));
        if (data.metadata) {
          if (data.metadata.imageName) setImageName(data.metadata.imageName);
          if (data.metadata.villageName) setVillageName(data.metadata.villageName);
          if (data.metadata.thanaNo) setThanaNo(data.metadata.thanaNo);
          if (data.metadata.districtName) setDistrictName(data.metadata.districtName);
          if (data.metadata.sheetNo) setSheetNo(data.metadata.sheetNo);
          if (data.metadata.imageDimensions) setImageDimensions(data.metadata.imageDimensions);
        }
        if (data.filters) {
          setBrightness(data.filters.brightness ?? 100);
          setContrast(data.filters.contrast ?? 100);
          setInvertColors(data.filters.invertColors ?? false);
          setGrayscale(data.filters.grayscale ?? false);
          setRasterOpacity(data.filters.rasterOpacity ?? 100);
        }
        if (Array.isArray(data.gcps)) setGcps(data.gcps);
        if (data.scaleCalib) setScaleCalib(data.scaleCalib);
        if (Array.isArray(data.polygons)) setPolygons(data.polygons);

        toast.showSuccess('BhuNaksha Cadastral Project Session restored successfully!');
      } catch (err) {
        toast.showError('Invalid .bhunaksha project session file.');
      }
    };
    reader.readAsText(file);
  };

  // Render Canvas Overlays
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // 1. Draw Map Sheet Background with Raster Filters
    if (mapImageSrc) {
      const img = new Image();
      img.src = mapImageSrc;

      // Apply Canvas Image Enhancement Filters
      ctx.save();
      const filterStrings: string[] = [];
      if (brightness !== 100) filterStrings.push(`brightness(${brightness}%)`);
      if (contrast !== 100) filterStrings.push(`contrast(${contrast}%)`);
      if (invertColors) filterStrings.push('invert(100%)');
      if (grayscale) filterStrings.push('grayscale(100%)');

      ctx.filter = filterStrings.length > 0 ? filterStrings.join(' ') : 'none';
      ctx.globalAlpha = rasterOpacity / 100;
      ctx.drawImage(img, 0, 0, imageDimensions.w, imageDimensions.h);
      ctx.restore();
    } else {
      // Cadastral Sheet grid canvas
      const cw = canvas.width || 800;
      const ch = canvas.height || 540;
      ctx.fillStyle = isDark ? '#141414' : '#f8fafc';
      ctx.fillRect(0, 0, Math.max(cw, 800), Math.max(ch, 540));
      ctx.strokeStyle = isDark ? '#262626' : '#e2e8f0';
      ctx.lineWidth = 1;
      for (let x = 0; x < Math.max(cw, 800); x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, Math.max(ch, 540));
        ctx.stroke();
      }
      for (let y = 0; y < Math.max(ch, 540); y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(Math.max(cw, 800), y);
        ctx.stroke();
      }
      ctx.fillStyle = isDark ? '#c9a063' : '#b45309';
      ctx.font = 'italic 14px serif';
      ctx.fillText('BhuNaksha Cadastral Canvas — Upload Sheet Image or Click "Load Sample Sheet"', 40, 50);
    }

    // 2. Draw Saved Polygons
    polygons.forEach(p => {
      if (p.pixelPoints.length < 3) return;
      ctx.beginPath();
      ctx.moveTo(p.pixelPoints[0].x, p.pixelPoints[0].y);
      p.pixelPoints.slice(1).forEach(pt => ctx.lineTo(pt.x, pt.y));
      ctx.closePath();

      const isSelected = selectedParcelId === p.id;
      const alphaHex = Math.round((fillOpacity / 100) * 255).toString(16).padStart(2, '0');
      ctx.fillStyle = isSelected ? `${p.color}66` : `${p.color}${alphaHex}`;
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#ffffff' : p.color;
      ctx.lineWidth = (isSelected ? 3 : 2) / zoom;
      ctx.stroke();

      // Vertex dots
      p.pixelPoints.forEach(pt => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3.5 / zoom, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      });

      // Centroid Labels
      if (showLabels) {
        const cX = p.pixelPoints.reduce((s, pt) => s + pt.x, 0) / p.pixelPoints.length;
        const cY = p.pixelPoints.reduce((s, pt) => s + pt.y, 0) / p.pixelPoints.length;

        // Khasra Badge
        ctx.fillStyle = '#000000';
        ctx.fillRect(cX - 18 / zoom, cY - 10 / zoom, 36 / zoom, 20 / zoom);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1 / zoom;
        ctx.strokeRect(cX - 18 / zoom, cY - 10 / zoom, 36 / zoom, 20 / zoom);

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(10, 11 / zoom)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(p.khasra, cX, cY + 4 / zoom);

        if (showAreaBadges) {
          ctx.fillStyle = '#c9a063';
          ctx.font = `${Math.max(8, 9 / zoom)}px sans-serif`;
          ctx.fillText(`${p.areaHa.toFixed(2)} Ha`, cX, cY + 18 / zoom);
        }
      }
    });

    // 3. Draw Active Polygon In Progress
    if (currentPolygonPoints.length > 0) {
      ctx.beginPath();
      ctx.moveTo(currentPolygonPoints[0].x, currentPolygonPoints[0].y);
      currentPolygonPoints.slice(1).forEach(pt => ctx.lineTo(pt.x, pt.y));
      ctx.strokeStyle = '#c9a063';
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([5 / zoom, 5 / zoom]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Vertices with numbers
      currentPolygonPoints.forEach((pt, idx) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5 / zoom, 0, Math.PI * 2);
        ctx.fillStyle = idx === 0 ? '#4ade80' : '#c9a063';
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5 / zoom;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(9, 10 / zoom)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(String(idx + 1), pt.x, pt.y - 8 / zoom);
      });
    }

    // 4. Draw Scale Bar Calibration Line
    if (scaleCalib.pt1) {
      ctx.beginPath();
      ctx.arc(scaleCalib.pt1.x, scaleCalib.pt1.y, 6 / zoom, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 / zoom;
      ctx.stroke();

      if (scaleCalib.pt2) {
        ctx.beginPath();
        ctx.moveTo(scaleCalib.pt1.x, scaleCalib.pt1.y);
        ctx.lineTo(scaleCalib.pt2.x, scaleCalib.pt2.y);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3 / zoom;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(scaleCalib.pt2.x, scaleCalib.pt2.y, 6 / zoom, 0, Math.PI * 2);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
        ctx.stroke();

        // Scale label
        const midX = (scaleCalib.pt1.x + scaleCalib.pt2.x) / 2;
        const midY = (scaleCalib.pt1.y + scaleCalib.pt2.y) / 2;
        ctx.fillStyle = '#f59e0b';
        ctx.font = `bold ${Math.max(10, 11 / zoom)}px sans-serif`;
        ctx.fillText(`${scaleCalib.distanceValue} ${scaleCalib.distanceUnit}`, midX, midY - 8 / zoom);
      }
    }

    // 5. Draw Measuring Ruler Line
    if (measurePoints.length > 0) {
      ctx.beginPath();
      ctx.moveTo(measurePoints[0].x, measurePoints[0].y);
      measurePoints.slice(1).forEach(pt => ctx.lineTo(pt.x, pt.y));
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5 / zoom;
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      ctx.stroke();
      ctx.setLineDash([]);

      measurePoints.forEach((pt, idx) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4 / zoom, 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fill();

        if (idx > 0) {
          const prev = measurePoints[idx - 1];
          const pxDist = Math.hypot(pt.x - prev.x, pt.y - prev.y);
          const mpp = affineMatrix
            ? Math.hypot(affineMatrix.a, affineMatrix.c)
            : (scaleCalib.metersPerPixel || 1.0);
          const segMeters = pxDist * mpp;

          const mx = (prev.x + pt.x) / 2;
          const my = (prev.y + pt.y) / 2;
          ctx.fillStyle = '#38bdf8';
          ctx.font = `bold ${Math.max(9, 10 / zoom)}px sans-serif`;
          ctx.fillText(`${segMeters.toFixed(1)} m`, mx, my - 6 / zoom);
        }
      });
    }

    // 6. Draw GCP Markers
    if (showGcpMarkers) {
      gcps.forEach(g => {
        ctx.beginPath();
        ctx.arc(g.pixelX, g.pixelY, 6 / zoom, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();

        ctx.fillStyle = '#ef4444';
        ctx.font = `bold ${Math.max(10, 11 / zoom)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(` ${g.id}`, g.pixelX + 8 / zoom, g.pixelY + 4 / zoom);
      });
    }

    // 7. Draw Snapped Magnet Highlight
    if (hoveredSnapPoint) {
      ctx.beginPath();
      ctx.arc(hoveredSnapPoint.x, hoveredSnapPoint.y, 9 / zoom, 0, Math.PI * 2);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5 / zoom;
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.font = `bold ${Math.max(9, 11 / zoom)}px sans-serif`;
      ctx.fillText(hoveredSnapPoint.label, hoveredSnapPoint.x + 12 / zoom, hoveredSnapPoint.y - 6 / zoom);
    }

    // 8. Draw Pending Selected Pixel
    if (pendingPixel) {
      ctx.beginPath();
      ctx.arc(pendingPixel.x, pendingPixel.y, 8 / zoom, 0, Math.PI * 2);
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2 / zoom;
      ctx.stroke();
    }

    ctx.restore();
  }, [
    mapImageSrc,
    imageDimensions,
    zoom,
    pan,
    polygons,
    currentPolygonPoints,
    gcps,
    pendingPixel,
    hoveredSnapPoint,
    selectedParcelId,
    brightness,
    contrast,
    invertColors,
    grayscale,
    rasterOpacity,
    showLabels,
    showAreaBadges,
    showGcpMarkers,
    fillOpacity,
    scaleCalib,
    measurePoints,
    affineMatrix,
    isDark
  ]);

  // Export Digitize Vectors to KML
  const handleExportKML = () => {
    const feats: GeoFeature[] = polygons.map(p => ({
      name: `Khasra ${p.khasra} (${p.owner})`,
      geom: 'polygon',
      kind: 'en',
      pts: p.utmPoints.map(pt => ({ a: pt.E, b: pt.N })),
      props: {
        Khasra_No: p.khasra,
        Khata_No: p.khata,
        Owner: p.owner,
        Village: p.village,
        Land_Classification: p.landClass,
        Area_Ha: `${p.areaHa.toFixed(4)} Ha`,
        Regional_Land: formatAreaAllUnits(p.areaM2, localLandUnitPreset, customBighaM2, customKathaPerBigha)
      }
    }));
    const kml = kmlBuild(feats, `${imageName}_Digitized_Bhunaksha`, true, zNum, isSouth);
    downloadBlob(new TextEncoder().encode(kml), `${imageName}_Bhunaksha.kml`, 'application/vnd.google-earth.kml+xml');
  };

  // Export Digitize Vectors to DXF
  const handleExportDXF = () => {
    const feats: GeoFeature[] = polygons.map(p => ({
      name: `Plot_${p.khasra}`,
      geom: 'polygon',
      kind: 'en',
      pts: p.utmPoints.map(pt => ({ a: pt.E, b: pt.N })),
      props: { layer: 'BHUNAKSHA_KHASRA_PARCELS', Owner: p.owner, Area_Ha: p.areaHa.toFixed(4) }
    }));
    const res = dxfBuild(feats, 'utm', zNum, isSouth, true);
    downloadBlob(new TextEncoder().encode(res.dxf), `${imageName}_Bhunaksha.dxf`, 'application/dxf');
  };

  // Export GeoJSON
  const handleExportGeoJSON = () => {
    const feats: GeoFeature[] = polygons.map(p => ({
      name: `Plot ${p.khasra}`,
      geom: 'polygon',
      kind: 'en',
      pts: p.utmPoints.map(pt => ({ a: pt.E, b: pt.N })),
      props: {
        khasra: p.khasra,
        khata: p.khata,
        owner: p.owner,
        village: p.village,
        landClass: p.landClass,
        areaM2: p.areaM2,
        areaHa: p.areaHa
      }
    }));
    const jsonStr = geoJsonBuild(feats, zNum, isSouth);
    downloadBlob(new TextEncoder().encode(jsonStr), `${imageName}_Bhunaksha.geojson`, 'application/geo+json');
  };

  // Export ESRI World File (.tfw / .jgw)
  const handleExportWorldFile = () => {
    if (!affineMatrix) {
      toast.showWarning('At least 3 Ground Control Points (GCPs) required to compute transformation matrix');
      return;
    }
    const { a, b, c, d, tx, ty } = affineMatrix;
    const content = buildWorldFile(a, b, c, d, tx, ty);
    downloadBlob(new TextEncoder().encode(content), `${imageName}.tfw`, 'text/plain');
    toast.showSuccess(`Exported ESRI World File (${imageName}.tfw)`);
  };

  // Export QGIS GCP Points (.points)
  const handleExportQgisPoints = () => {
    const content = buildQgisGcpPoints(gcps);
    downloadBlob(new TextEncoder().encode(content), `${imageName}_gcps.points`, 'text/plain');
  };

  // Export Land Schedule Excel
  const handleExportExcel = () => {
    const cols = ['Khasra_No', 'Khata_No', 'Ryot_Owner', 'Village_Mouza', 'Land_Class', 'Area_SqM', 'Area_Hectares', 'Regional_Units'];
    const rows = polygons.map(p => [
      p.khasra,
      p.khata,
      p.owner,
      p.village,
      p.landClass,
      p.areaM2.toFixed(2),
      p.areaHa.toFixed(4),
      formatAreaAllUnits(p.areaM2, localLandUnitPreset, customBighaM2, customKathaPerBigha)
    ]);
    const zip = buildExcelZip(cols, rows, 'Bhunaksha_Schedule');
    downloadBlob(zip, `${imageName}_Land_Schedule.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  };

  // Measured Distance Summary Calculation
  const measuredTotalMeters = useMemo(() => {
    if (measurePoints.length < 2) return 0;
    const mpp = affineMatrix
      ? Math.hypot(affineMatrix.a, affineMatrix.c)
      : (scaleCalib.metersPerPixel || 1.0);

    let total = 0;
    for (let i = 1; i < measurePoints.length; i++) {
      const p1 = measurePoints[i - 1];
      const p2 = measurePoints[i];
      total += Math.hypot(p2.x - p1.x, p2.y - p1.y) * mpp;
    }
    return total;
  }, [measurePoints, affineMatrix, scaleCalib.metersPerPixel]);

  // Filtered polygons for registry table
  const filteredPolygons = useMemo(() => {
    if (!searchTerm.trim()) return polygons;
    const q = searchTerm.toLowerCase();
    return polygons.filter(
      p =>
        p.khasra.toLowerCase().includes(q) ||
        p.khata.toLowerCase().includes(q) ||
        p.owner.toLowerCase().includes(q) ||
        p.landClass.toLowerCase().includes(q)
    );
  }, [polygons, searchTerm]);

  const mapFeatures: GeoFeature[] = useMemo(() => {
    return polygons.map(p => ({
      name: `Khasra ${p.khasra}`,
      geom: 'polygon',
      kind: 'en',
      pts: p.utmPoints.map(pt => ({ a: pt.E, b: pt.N })),
      props: { khasra: p.khasra, owner: p.owner, areaHa: p.areaHa }
    }));
  }, [polygons]);

  const totalAreaM2 = polygons.reduce((s, p) => s + p.areaM2, 0);

  return (
    <div className="space-y-6">
      {/* 1. Header & Main Cadastral Studio Bar */}
      <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#c9a063] font-medium">BhuNaksha Cadastral Studio</span>
              <span className="text-[10px] bg-sky-500/20 text-sky-400 px-2 py-0.5 rounded border border-sky-500/30 font-mono">
                WPA Progressive Digitizer v2.0
              </span>
            </div>
            <h3 className="text-xl font-serif italic text-white flex items-center gap-2">
              <Scan className="w-5 h-5 text-[#c9a063]" />
              Cadastral Sheet Georeferencer, Digitizer & Parchha Generator
            </h3>
            <p className="text-xs text-white/40 mt-1 max-w-2xl">
              Georeference revenue mouza sheets with GCPs or 2-Point Linear Scale, digitize Khasra boundaries with magnetic snapping, compute Batwara partitions, and generate official print-ready Revenue Certificates.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Quick Sample Map */}
            <button
              onClick={handleLoadSampleMap}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#141414] hover:bg-[#1a1a1a] text-white rounded-xl text-xs font-semibold border border-white/10"
              title="Load Demo Mouza Sheet Canvas"
            >
              <ImageIcon className="w-3.5 h-3.5 text-[#c9a063]" /> Load Sample Sheet
            </button>

            {/* Upload Map */}
            <label className="flex items-center gap-1.5 px-4 py-2 bg-[#141414] hover:bg-[#1a1a1a] text-white rounded-xl text-xs font-semibold cursor-pointer border border-white/10 transition-colors">
              <Upload className="w-4 h-4 text-[#c9a063]" /> Upload Cadastral Map
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </label>

            {/* Save Project Session */}
            <button
              onClick={handleSaveProject}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#141414] hover:bg-[#1a1a1a] text-white rounded-xl text-xs font-semibold border border-white/10"
              title="Save Workspace Project File (.bhunaksha)"
            >
              <Save className="w-3.5 h-3.5 text-emerald-400" /> Save Project
            </button>

            {/* Open Project Session */}
            <label className="flex items-center gap-1.5 px-3 py-2 bg-[#141414] hover:bg-[#1a1a1a] text-white rounded-xl text-xs font-semibold cursor-pointer border border-white/10">
              <FolderOpen className="w-3.5 h-3.5 text-sky-400" /> Open Project
              <input ref={projectInputRef} type="file" accept=".bhunaksha,application/json" onChange={handleLoadProject} className="hidden" />
            </label>

            {/* Official Parchha / Certificate Generator */}
            <button
              onClick={() => setShowCertificateModal(true)}
              disabled={!polygons.length}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#c9a063] hover:bg-[#d6b074] disabled:opacity-40 text-black rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg shadow-[#c9a063]/10"
            >
              <Printer className="w-4 h-4" /> Print Parchha / Naksha
            </button>
          </div>
        </div>

        {/* Village & Mouza Sheet Metadata Inputs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-3 border-t border-white/5 text-xs">
          <div>
            <label className="text-[10px] text-white/50 block mb-1">Village / Mouza</label>
            <input
              type="text"
              value={villageName}
              onChange={e => setVillageName(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-[#141414] rounded-lg border border-white/10 text-white font-serif"
            />
          </div>
          <div>
            <label className="text-[10px] text-white/50 block mb-1">Thana No.</label>
            <input
              type="text"
              value={thanaNo}
              onChange={e => setThanaNo(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-[#141414] rounded-lg border border-white/10 text-white font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] text-white/50 block mb-1">District / Circle</label>
            <input
              type="text"
              value={districtName}
              onChange={e => setDistrictName(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-[#141414] rounded-lg border border-white/10 text-white"
            />
          </div>
          <div>
            <label className="text-[10px] text-white/50 block mb-1">Sheet Number</label>
            <input
              type="text"
              value={sheetNo}
              onChange={e => setSheetNo(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-[#141414] rounded-lg border border-white/10 text-white font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] text-white/50 block mb-1">Cadastral Scale</label>
            <input
              type="text"
              value={imageScaleRatio}
              onChange={e => setImageScaleRatio(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-[#141414] rounded-lg border border-white/10 text-white text-[11px]"
            />
          </div>
        </div>

        {/* Mode Selector & Toolbar */}
        <div className="flex items-center justify-between flex-wrap gap-3 pt-2 border-t border-white/5">
          <div className="flex bg-[#141414] p-1 rounded-xl gap-1 text-xs font-semibold border border-white/5 flex-wrap">
            <button
              onClick={() => setToolMode('navigate')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                toolMode === 'navigate' ? 'bg-[#c9a063] text-black font-bold' : 'text-white/60 hover:text-white'
              }`}
            >
              <MousePointer className="w-3.5 h-3.5" /> Pan & Zoom
            </button>

            <button
              onClick={() => setToolMode('calibrate')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                toolMode === 'calibrate' ? 'bg-[#c9a063] text-black font-bold' : 'text-white/60 hover:text-white'
              }`}
            >
              <Compass className="w-3.5 h-3.5" /> GCP Helmert ({gcps.length})
            </button>

            <button
              onClick={() => setToolMode('scale_calib')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                toolMode === 'scale_calib' ? 'bg-[#c9a063] text-black font-bold' : 'text-white/60 hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" /> Linear Scale Bar
            </button>

            <button
              onClick={() => setToolMode('digitize')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                toolMode === 'digitize' ? 'bg-[#c9a063] text-black font-bold' : 'text-white/60 hover:text-white'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" /> Digitize Khasra
            </button>

            <button
              onClick={() => setToolMode('measure')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                toolMode === 'measure' ? 'bg-[#c9a063] text-black font-bold' : 'text-white/60 hover:text-white'
              }`}
            >
              <Ruler className="w-3.5 h-3.5" /> Distance Ruler
            </button>

            <button
              onClick={handleAiAutoVectorize}
              disabled={isProcessingAi}
              className="px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-[#c9a063] hover:bg-[#c9a063]/10 transition-all font-serif italic"
            >
              <Sparkles className="w-3.5 h-3.5" /> {isProcessingAi ? 'Vectorizing...' : 'AI Auto-Detect'}
            </button>

            {/* Toggle Raster Image Enhancement Filters */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all border ${
                showFilters ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-transparent border-transparent text-white/50 hover:text-white'
              }`}
            >
              <Contrast className="w-3.5 h-3.5" /> Filters
            </button>
          </div>

          {/* Snapping Toggle, Labels & Zoom Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setSnapEnabled(!snapEnabled)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 transition-colors ${
                snapEnabled
                  ? 'bg-sky-500/20 border-sky-500/40 text-sky-300 font-bold'
                  : 'bg-[#141414] border-white/10 text-white/40'
              }`}
              title="Toggle Vertex & GCP Magnet Snapping"
            >
              <Magnet className="w-3.5 h-3.5" /> Snap: {snapEnabled ? 'ON' : 'OFF'}
            </button>

            <button
              onClick={() => setShowLabels(!showLabels)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 ${
                showLabels ? 'bg-white/10 border-white/20 text-white' : 'bg-[#141414] border-white/10 text-white/40'
              }`}
              title="Toggle Plot Number Badges"
            >
              <Hash className="w-3.5 h-3.5" /> Labels
            </button>

            <div className="flex items-center gap-1.5 bg-[#141414] px-2 py-1 rounded-xl border border-white/5">
              <span className="text-[11px] font-mono text-white/40">{(zoom * 100).toFixed(0)}%</span>
              <button
                onClick={() => setZoom(z => Math.max(0.2, z - 0.2))}
                className="p-1 rounded bg-white/5 hover:bg-white/10 text-white/70"
              >
                <ZoomOut className="w-3 h-3" />
              </button>
              <button
                onClick={() => setZoom(z => Math.min(5, z + 0.2))}
                className="p-1 rounded bg-white/5 hover:bg-white/10 text-white/70"
              >
                <ZoomIn className="w-3 h-3" />
              </button>
              <button
                onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
                className="p-1 rounded bg-white/5 hover:bg-white/10 text-white/70"
                title="Reset View"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Expandable Image Enhancement Raster Filters Bar */}
        {showFilters && (
          <div className="p-4 bg-[#141414] rounded-xl border border-amber-500/30 grid grid-cols-1 sm:grid-cols-5 gap-4 text-xs animate-fade-in">
            <div>
              <div className="flex justify-between text-white/60 mb-1">
                <span>Brightness</span>
                <span className="font-mono">{brightness}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="200"
                value={brightness}
                onChange={e => setBrightness(Number(e.target.value))}
                className="w-full accent-[#c9a063]"
              />
            </div>

            <div>
              <div className="flex justify-between text-white/60 mb-1">
                <span>Contrast</span>
                <span className="font-mono">{contrast}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="250"
                value={contrast}
                onChange={e => setContrast(Number(e.target.value))}
                className="w-full accent-[#c9a063]"
              />
            </div>

            <div>
              <div className="flex justify-between text-white/60 mb-1">
                <span>Sheet Opacity</span>
                <span className="font-mono">{rasterOpacity}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                value={rasterOpacity}
                onChange={e => setRasterOpacity(Number(e.target.value))}
                className="w-full accent-[#c9a063]"
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer text-white/80">
                <input
                  type="checkbox"
                  checked={invertColors}
                  onChange={e => setInvertColors(e.target.checked)}
                  className="rounded border-white/20"
                />
                Invert / Blueprint
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer text-white/80">
                <input
                  type="checkbox"
                  checked={grayscale}
                  onChange={e => setGrayscale(e.target.checked)}
                  className="rounded border-white/20"
                />
                Grayscale
              </label>
            </div>

            <div className="flex items-center justify-end">
              <button
                onClick={() => {
                  setBrightness(100);
                  setContrast(100);
                  setInvertColors(false);
                  setGrayscale(false);
                  setRasterOpacity(100);
                }}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 text-xs"
              >
                Reset Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Interactive Digitizing Canvas & Control Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Canvas Area */}
        <div className="lg:col-span-2 bg-[#0f0f0f] rounded-2xl p-4 border border-white/5 space-y-3 flex flex-col">
          <div className="flex items-center justify-between text-xs text-white/60 px-2 flex-wrap gap-2">
            <span>
              {toolMode === 'digitize' && 'Click vertices to trace parcel. Click 1st vertex or click Save to close.'}
              {toolMode === 'calibrate' && 'Click ground control landmarks on image to set GCP.'}
              {toolMode === 'scale_calib' && 'Click 2 points on the sheet scale bar (e.g. 0 to 200m or 10 chains).'}
              {toolMode === 'measure' && 'Click points on the canvas to measure distance & bearing.'}
              {toolMode === 'navigate' && 'Drag map with mouse to pan.'}
            </span>
            {affineMatrix ? (
              <span className="font-mono text-[#c9a063] bg-[#c9a063]/10 px-2 py-0.5 rounded border border-[#c9a063]/30">
                Helmert Georef RMSE: {affineMatrix.rmse.toFixed(3)} m (UTM Zone {workingZone})
              </span>
            ) : scaleCalib.metersPerPixel ? (
              <span className="font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                Linear Calibrated: {scaleCalib.metersPerPixel.toFixed(4)} m/px
              </span>
            ) : null}
          </div>

          {/* Canvas Container with Crosshair HUD */}
          <div
            ref={containerRef}
            className="w-full h-[540px] bg-slate-100 dark:bg-[#080808] rounded-xl overflow-hidden relative cursor-crosshair border border-slate-200 dark:border-white/10 select-none"
          >
            <canvas
              ref={canvasRef}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onWheel={handleCanvasWheel}
              className="w-full h-full block"
            />

            {/* Live Bottom HUD Bar */}
            {mousePos && (
              <div className="absolute bottom-2 left-2 right-2 bg-black/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center justify-between text-[11px] font-mono text-white/80 pointer-events-none">
                <div className="flex items-center gap-3">
                  <span className="text-[#c9a063] flex items-center gap-1">
                    <Crosshair className="w-3 h-3" /> Px: ({mousePos.px}, {mousePos.py})
                  </span>
                  <span>UTM: {mousePos.utmE.toFixed(1)} E, {mousePos.utmN.toFixed(1)} N</span>
                  <span className="text-white/50">WGS84: {mousePos.lat.toFixed(5)}&deg;, {mousePos.lon.toFixed(5)}&deg;</span>
                </div>
                {hoveredSnapPoint && (
                  <span className="text-sky-400 font-sans font-bold flex items-center gap-1">
                    <Magnet className="w-3 h-3" /> Snapped: {hoveredSnapPoint.label}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Active Digitizing Action Bar */}
          {toolMode === 'digitize' && (
            <div className="p-3.5 bg-[#141414] rounded-xl border border-white/10 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <div className="relative">
                  <input
                    type="text"
                    value={activeKhasra}
                    onChange={e => setActiveKhasra(e.target.value)}
                    placeholder="Khasra / Plot No"
                    className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono focus:border-[#c9a063]"
                  />
                  {importedKhatian.length > 0 && (
                    <select
                      onChange={e => {
                        const rec = importedKhatian.find(r => r.khasra === e.target.value);
                        if (rec) {
                          setActiveKhasra(rec.khasra);
                          setActiveKhata(rec.khata);
                          setActiveOwner(rec.owner);
                          setActiveLandClass(rec.landClass);
                        }
                      }}
                      className="absolute right-1 top-1.5 opacity-40 hover:opacity-100 bg-transparent text-[10px] text-[#c9a063]"
                    >
                      <option value="">Select RoR...</option>
                      {importedKhatian.map((r, i) => (
                        <option key={i} value={r.khasra}>Plot {r.khasra} - {r.owner}</option>
                      ))}
                    </select>
                  )}
                </div>

                <input
                  type="text"
                  value={activeKhata}
                  onChange={e => setActiveKhata(e.target.value)}
                  placeholder="Khata No"
                  className="py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono focus:border-[#c9a063]"
                />
                <input
                  type="text"
                  value={activeOwner}
                  onChange={e => setActiveOwner(e.target.value)}
                  placeholder="Ryot / Owner Name"
                  className="py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs focus:border-[#c9a063]"
                />
                <select
                  value={activeLandClass}
                  onChange={e => setActiveLandClass(e.target.value)}
                  className="py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs focus:border-[#c9a063]"
                >
                  {LAND_CLASSES.map(lc => (
                    <option key={lc} value={lc}>{lc}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-white/5">
                <div className="flex items-center gap-3 text-xs font-mono text-white/60">
                  <span>{currentPolygonPoints.length} vertices placed</span>
                  {currentPolygonPoints.length > 0 && (
                    <button
                      onClick={() => setCurrentPolygonPoints(prev => prev.slice(0, -1))}
                      className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/80 flex items-center gap-1"
                    >
                      <Undo2 className="w-3 h-3" /> Undo Point (Ctrl+Z)
                    </button>
                  )}
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-sans text-white/50">
                    <input
                      type="checkbox"
                      checked={autoIncrementKhasra}
                      onChange={e => setAutoIncrementKhasra(e.target.checked)}
                      className="rounded border-white/20"
                    />
                    Auto-increment Khasra
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPolygonPoints([])}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 text-xs font-semibold"
                  >
                    Clear
                  </button>
                  <button
                    onClick={handleFinishPolygon}
                    disabled={currentPolygonPoints.length < 3}
                    className="px-4 py-1.5 rounded-lg bg-[#c9a063] hover:bg-[#d6b074] disabled:opacity-30 text-black text-xs font-bold uppercase tracking-wider shadow"
                  >
                    Save Parcel (Plot {activeKhasra})
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Scale Calibration Control Bar */}
          {toolMode === 'scale_calib' && (
            <div className="p-3.5 bg-[#141414] rounded-xl border border-amber-500/30 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-serif italic text-amber-400">
                  Linear Scale Bar 2-Point Calibration Mode
                </span>
                <span className="text-xs text-white/40">
                  {scaleCalib.pt1 && !scaleCalib.pt2 ? 'Click second point on scale bar' : 'Click two endpoints of scale bar on map'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="number"
                  value={scaleCalib.distanceValue}
                  onChange={e => setScaleCalib(prev => ({ ...prev, distanceValue: parseFloat(e.target.value) || 0 }))}
                  placeholder="Known Scale Distance"
                  className="py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono focus:border-amber-400"
                />
                <select
                  value={scaleCalib.distanceUnit}
                  onChange={e => setScaleCalib(prev => ({ ...prev, distanceUnit: e.target.value as any }))}
                  className="py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs"
                >
                  <option value="meters">Meters (m)</option>
                  <option value="gunter_chains">Gunter's Chains (1 Chain = 66 ft = 20.12m)</option>
                  <option value="links">Links (100 Links = 1 Chain = 20.12m)</option>
                  <option value="feet">Feet (ft)</option>
                  <option value="yards">Yards (yd)</option>
                </select>

                <div className="flex items-center gap-2">
                  {scaleCalib.metersPerPixel ? (
                    <span className="text-xs font-mono text-emerald-400 font-bold">
                      = {scaleCalib.metersPerPixel.toFixed(4)} m/pixel
                    </span>
                  ) : (
                    <span className="text-xs text-white/40 italic">Waiting for 2 points...</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Measuring Distance Tool Bar */}
          {toolMode === 'measure' && (
            <div className="p-3.5 bg-[#141414] rounded-xl border border-sky-500/30 flex items-center justify-between flex-wrap gap-3 animate-fade-in">
              <div className="flex items-center gap-4 text-xs font-mono">
                <span className="text-sky-400 font-bold flex items-center gap-1.5">
                  <Ruler className="w-4 h-4" /> Total Distance: {measuredTotalMeters.toFixed(2)} m
                </span>
                <span className="text-white/60">{(measuredTotalMeters * 3.28084).toFixed(1)} ft</span>
                <span className="text-white/60">{(measuredTotalMeters / 20.1168).toFixed(2)} Gunter Chains</span>
                <span className="text-white/60">{((measuredTotalMeters / 20.1168) * 100).toFixed(0)} Links</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMeasurePoints([])}
                  className="px-3 py-1 bg-white/5 hover:bg-white/10 text-white/60 text-xs rounded-lg"
                >
                  Reset Ruler
                </button>
              </div>
            </div>
          )}

          {/* Pending GCP Calibration Modal Bar */}
          {pendingPixel && toolMode === 'calibrate' && (
            <div className="p-4 bg-[#141414] rounded-xl border border-[#c9a063]/30 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-serif italic text-[#c9a063]">
                  Selected Pixel: ({pendingPixel.x}, {pendingPixel.y}) — Enter Reference Ground Coordinates (UTM Zone {workingZone})
                </span>
                <button onClick={() => setPendingPixel(null)} className="text-white/40 hover:text-white text-xs">&times; Cancel</button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="number"
                  value={newGcpE}
                  onChange={e => setNewGcpE(e.target.value)}
                  placeholder="UTM Easting (E)"
                  className="py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono focus:border-[#c9a063]"
                />
                <input
                  type="number"
                  value={newGcpN}
                  onChange={e => setNewGcpN(e.target.value)}
                  placeholder="UTM Northing (N)"
                  className="py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono focus:border-[#c9a063]"
                />
                <input
                  type="text"
                  value={newGcpRef}
                  onChange={e => setNewGcpRef(e.target.value)}
                  placeholder="Landmark / Pillar Ref"
                  className="py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs focus:border-[#c9a063]"
                />
              </div>

              <button
                onClick={handleAddGcp}
                className="w-full py-2 bg-[#c9a063] hover:bg-[#d6b074] text-black text-xs font-bold uppercase tracking-wider rounded-lg"
              >
                + Lock Ground Control Point (GCP)
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Parcel Registry, Khatian Records & GCPs */}
        <div className="space-y-6">
          {/* Digitized Khasra Registry */}
          <div className="bg-[#0f0f0f] rounded-2xl p-5 border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-serif italic text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#c9a063]" />
                Khasra Parcels ({polygons.length})
              </h4>
              <span className="text-xs font-mono text-[#c9a063] font-bold">
                {(totalAreaM2 / 10000).toFixed(3)} Ha Total
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-white/40 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search Khasra, Khata, or Ryot..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#141414] border border-white/10 text-white text-xs focus:border-[#c9a063]"
                />
              </div>

              {/* Import RoR CSV */}
              <label className="p-1.5 bg-[#141414] hover:bg-[#1a1a1a] text-[#c9a063] rounded-lg border border-white/10 cursor-pointer text-xs" title="Import RoR / Khatian CSV">
                <Upload className="w-3.5 h-3.5" />
                <input ref={khatianInputRef} type="file" accept=".csv,text/csv" onChange={handleImportKhatianCSV} className="hidden" />
              </label>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
              {filteredPolygons.map(p => (
                <div
                  key={p.id}
                  onClick={() => setSelectedParcelId(p.id)}
                  className={`p-3 rounded-xl border text-xs transition-all cursor-pointer ${
                    selectedParcelId === p.id
                      ? 'bg-white/10 border-[#c9a063]'
                      : 'bg-[#141414] border-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="font-mono font-bold text-white">Plot {p.khasra}</span>
                      <span className="text-[10px] text-white/50">(Khata {p.khata})</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPartitionTargetPoly(p);
                          setPartitionOwnerA(p.owner);
                          setPartitionOwnerB('');
                        }}
                        className="text-[10px] font-semibold text-[#c9a063] bg-[#c9a063]/10 hover:bg-[#c9a063]/20 px-2 py-0.5 rounded"
                        title="Partition / Batwara Sub-division"
                      >
                        <Split className="w-3 h-3 inline mr-0.5" /> Split
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPolygons(polygons.filter(item => item.id !== p.id));
                        }}
                        className="text-white/40 hover:text-rose-400 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="text-[11px] text-white/80 mt-1">{p.owner}</div>
                  <div className="text-[10px] text-white/50">{p.landClass}</div>
                  <div className="text-[10px] text-[#c9a063] font-mono mt-0.5">
                    {p.areaHa.toFixed(4)} Ha • {formatAreaAllUnits(p.areaM2, localLandUnitPreset, customBighaM2, customKathaPerBigha)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* GCP Calibration Points List */}
          <div className="bg-[#0f0f0f] rounded-2xl p-5 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-serif italic text-white flex items-center gap-2">
                <Compass className="w-4 h-4 text-[#c9a063]" />
                Ground Control Points ({gcps.length})
              </h4>
              <button
                onClick={() => setToolMode('calibrate')}
                className="text-[10px] font-mono text-[#c9a063] hover:underline"
              >
                + Set Point
              </button>
            </div>

            <div className="space-y-2 max-h-44 overflow-y-auto custom-scrollbar font-mono text-xs">
              {gcps.map((g, idx) => (
                <div
                  key={g.id}
                  className="p-2.5 bg-[#141414] rounded-xl border border-white/5 flex items-center justify-between"
                >
                  <div>
                    <div className="font-bold text-white text-[11px] flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      {g.id}: ({g.pixelX}, {g.pixelY})px
                    </div>
                    <div className="text-[10px] text-white/50">
                      E: {g.utmE.toFixed(1)}, N: {g.utmN.toFixed(1)}
                    </div>
                    {g.khasraRef && <div className="text-[10px] text-[#c9a063] font-sans">{g.khasraRef}</div>}
                  </div>
                  <button
                    onClick={() => setGcps(gcps.filter((_, i) => i !== idx))}
                    className="text-white/40 hover:text-rose-400 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Partition / Batwara Sub-division Modal */}
      {partitionTargetPoly && (
        <div className="p-6 bg-[#0f0f0f] rounded-2xl border border-[#c9a063]/30 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-serif italic text-white flex items-center gap-2">
              <Split className="w-5 h-5 text-[#c9a063]" />
              Khasra Partition / Batwara Sub-Division (Plot {partitionTargetPoly.khasra})
            </h4>
            <button onClick={() => setPartitionTargetPoly(null)} className="text-white/40 hover:text-white text-xs">&times; Close</button>
          </div>

          <p className="text-xs text-white/60">
            Bisect parcel <strong className="text-white font-mono">{partitionTargetPoly.khasra}</strong> ({partitionTargetPoly.areaHa.toFixed(4)} Ha) into mutated sub-plots with customized co-sharer entitlements.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] text-white/60 mb-1 block">Sub-Plot A Ryot ({partitionTargetPoly.khasra}/A)</label>
              <input
                type="text"
                value={partitionOwnerA}
                onChange={e => setPartitionOwnerA(e.target.value)}
                placeholder="Shareholder 1"
                className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#141414] text-white text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] text-white/60 mb-1 block">Sub-Plot B Ryot ({partitionTargetPoly.khasra}/B)</label>
              <input
                type="text"
                value={partitionOwnerB}
                onChange={e => setPartitionOwnerB(e.target.value)}
                placeholder="Shareholder 2"
                className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#141414] text-white text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] text-white/60 mb-1 block">Division Ratio (A : B)</label>
              <select
                value={partitionRatio}
                onChange={e => setPartitionRatio(e.target.value)}
                className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#141414] text-white text-xs font-mono"
              >
                <option value="50:50">50 : 50 (Equal Halves)</option>
                <option value="60:40">60 : 40 (3/5 vs 2/5)</option>
                <option value="75:25">75 : 25 (3/4 vs 1/4)</option>
                <option value="33:67">33.3 : 66.7 (1/3 vs 2/3)</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={handleExecutePartition}
                className="w-full py-2 bg-[#c9a063] hover:bg-[#d6b074] text-black text-xs font-bold uppercase tracking-wider rounded-lg shadow"
              >
                Execute Batwara Partition
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Live Vector GIS Radar Verification */}
      {polygons.length > 0 && (
        <div className="bg-[#0f0f0f] rounded-2xl p-6 border border-white/5">
          <VectorRadarMap
            features={mapFeatures}
            zone={zNum}
            south={isSouth}
            title="Georeferenced Vector Radar GIS Verification (UTM Projected Grid)"
          />
        </div>
      )}

      {/* 6. Official Print-Ready Cadastral Parchha / Land Map Certificate Modal */}
      {showCertificateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white text-black w-full max-w-4xl rounded-2xl p-8 shadow-2xl space-y-6 print:p-0 print:shadow-none print:w-full">
            {/* Header / State Emblem Seal */}
            <div className="text-center border-b-2 border-black pb-4 space-y-1">
              <div className="flex items-center justify-center gap-2 mb-1">
                <ShieldCheck className="w-8 h-8 text-[#85754e]" />
              </div>
              <h2 className="text-xl font-bold uppercase tracking-wider font-serif">
                Department of Revenue and Land Reforms
              </h2>
              <h3 className="text-sm font-semibold uppercase text-stone-700">
                Official Cadastral Map & Land Record Certificate (Parchha)
              </h3>
              <p className="text-xs text-stone-500 font-mono">
                Generated via BhuNaksha Geomatics Engine • Datum: WGS84 / UTM Zone {workingZone}
              </p>
            </div>

            {/* Mouza Particulars Table */}
            <div className="grid grid-cols-4 gap-4 p-3 bg-stone-100 rounded-lg text-xs font-medium border border-stone-300">
              <div>
                <span className="text-stone-500 block text-[10px]">Mouza / Village</span>
                <span className="font-bold text-sm font-serif">{villageName}</span>
              </div>
              <div>
                <span className="text-stone-500 block text-[10px]">Thana Number</span>
                <span className="font-bold text-sm font-mono">{thanaNo}</span>
              </div>
              <div>
                <span className="text-stone-500 block text-[10px]">District / Circle</span>
                <span className="font-bold text-sm">{districtName}</span>
              </div>
              <div>
                <span className="text-stone-500 block text-[10px]">Survey Sheet & Scale</span>
                <span className="font-bold text-xs font-mono">Sheet #{sheetNo} ({imageScaleRatio})</span>
              </div>
            </div>

            {/* Khasra Schedule Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-800">
                Cadastral Khasra & Co-Sharers Schedule
              </h4>
              <div className="overflow-x-auto border border-stone-300 rounded-lg">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-stone-200 text-stone-700 uppercase font-semibold text-[10px]">
                    <tr>
                      <th className="p-2 border-b">Khasra (Plot)</th>
                      <th className="p-2 border-b">Khata</th>
                      <th className="p-2 border-b">Ryot / Owner Name</th>
                      <th className="p-2 border-b">Classification</th>
                      <th className="p-2 border-b font-mono">Area (Sq.M)</th>
                      <th className="p-2 border-b font-mono">Area (Hectares)</th>
                      <th className="p-2 border-b font-mono">Regional Units</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {polygons.map((p, idx) => (
                      <tr key={idx} className="hover:bg-stone-50">
                        <td className="p-2 font-bold font-mono text-stone-900">{p.khasra}</td>
                        <td className="p-2 font-mono text-stone-600">{p.khata}</td>
                        <td className="p-2 font-medium">{p.owner}</td>
                        <td className="p-2 text-stone-600 text-[11px]">{p.landClass}</td>
                        <td className="p-2 font-mono">{p.areaM2.toFixed(1)}</td>
                        <td className="p-2 font-mono font-bold text-stone-900">{p.areaHa.toFixed(4)}</td>
                        <td className="p-2 font-mono text-stone-700">
                          {formatAreaAllUnits(p.areaM2, localLandUnitPreset, customBighaM2, customKathaPerBigha)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-stone-100 font-bold border-t-2 border-stone-400">
                      <td colSpan={4} className="p-2 text-right uppercase text-[11px]">Total Mouza Land Area:</td>
                      <td className="p-2 font-mono">{totalAreaM2.toFixed(1)} m&sup2;</td>
                      <td className="p-2 font-mono text-emerald-800">{(totalAreaM2 / 10000).toFixed(4)} Ha</td>
                      <td className="p-2 font-mono text-stone-800">
                        {formatAreaAllUnits(totalAreaM2, localLandUnitPreset, customBighaM2, customKathaPerBigha)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Official Survey Seals & Signature Block */}
            <div className="grid grid-cols-3 gap-6 pt-10 text-center text-xs">
              <div className="space-y-12">
                <div className="h-10"></div>
                <div className="border-t border-stone-400 pt-1 font-semibold">
                  Signature of Revenue Amin / Surveyor
                </div>
              </div>
              <div className="space-y-12">
                <div className="h-10"></div>
                <div className="border-t border-stone-400 pt-1 font-semibold">
                  Kanoongo / Revenue Inspector Seal
                </div>
              </div>
              <div className="space-y-12">
                <div className="h-10"></div>
                <div className="border-t border-stone-400 pt-1 font-semibold">
                  Circle Officer / Tahsildar Approval
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-200 print:hidden">
              <button
                onClick={() => setShowCertificateModal(false)}
                className="px-4 py-2 rounded-xl bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-semibold"
              >
                Close Window
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#c9a063] hover:bg-[#d6b074] text-black text-xs font-bold uppercase tracking-wider shadow"
              >
                <Printer className="w-4 h-4" /> Print / Save PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
