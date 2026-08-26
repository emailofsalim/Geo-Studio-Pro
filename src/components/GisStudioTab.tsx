import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  FolderArchive
} from 'lucide-react';
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

interface GisStudioTabProps {
  workingZone: string;
  localLandUnitPreset: string;
  customBighaM2: number;
  customKathaPerBigha: number;
}

export const GisStudioTab: React.FC<GisStudioTabProps> = ({
  workingZone,
  localLandUnitPreset,
  customBighaM2,
  customKathaPerBigha
}) => {
  const zNum = parseInt(workingZone, 10) || 45;
  const isSouth = workingZone.endsWith('S');

  // Canvas Refs & Viewport State
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState<number>(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [cursorCoord, setCursorCoord] = useState<{ E: number; N: number; lon: number; lat: number } | null>(null);

  // Active Tool & Mode
  const [activeTool, setActiveTool] = useState<'pan' | 'select' | 'measure' | 'draw_point' | 'draw_line' | 'draw_poly' | 'transect'>('pan');
  const [basemapTheme, setBasemapTheme] = useState<'dark_obsidian' | 'blueprint' | 'parchment' | 'light_topo'>('dark_obsidian');
  const [showGrid, setShowGrid] = useState(true);
  const [showLabels, setShowLabels] = useState(true);

  // Measurement State
  const [measurePts, setMeasurePts] = useState<{ E: number; N: number }[]>([]);
  const [measureDistance, setMeasureDistance] = useState<number>(0);
  const [measureArea, setMeasureArea] = useState<number>(0);

  // Drawing Feature State
  const [drawnPts, setDrawnPts] = useState<{ E: number; N: number }[]>([]);

  // Selected Feature
  const [selectedFeature, setSelectedFeature] = useState<{ layerId: string; featureIdx: number; feature: GeoFeature } | null>(null);

  // Layer State
  const [layers, setLayers] = useState<GisLayer[]>(() => {
    try {
      const stored = localStorage.getItem('gis_studio_layers');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [
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
            props: { BH_ID: 'BH-02', Collar_RL: 548.0, Max_Depth: 22.0, Ore_Thickness: 6.4, Al2O3_Avg: 45.1, Status: 'Positive Ore' }
          },
          {
            name: 'BH-03',
            geom: 'point',
            kind: 'en',
            pts: [{ a: 255280, b: 2604950 }],
            props: { BH_ID: 'BH-03', Collar_RL: 535.0, Max_Depth: 15.0, Ore_Thickness: 9.1, Al2O3_Avg: 50.4, Status: 'Positive Ore' }
          },
          {
            name: 'BH-04',
            geom: 'point',
            kind: 'en',
            pts: [{ a: 254700, b: 2605400 }],
            props: { BH_ID: 'BH-04', Collar_RL: 550.2, Max_Depth: 25.0, Ore_Thickness: 0.0, Al2O3_Avg: 18.0, Status: 'Barren Waste' }
          }
        ]
      },
      {
        id: 'layer_roads',
        name: 'Haulage & Access Roads',
        visible: true,
        color: '#c084fc',
        fillColor: '#c084fc',
        fillOpacity: 0.5,
        strokeWidth: 3,
        geomType: 'line',
        features: [
          {
            name: 'Main Haul Road North',
            geom: 'line',
            kind: 'en',
            pts: [
              { a: 254450, b: 2604900 },
              { a: 254750, b: 2605150 },
              { a: 255100, b: 2605350 },
              { a: 255450, b: 2605550 }
            ],
            props: { Route_Name: 'North-East Corridor', Width_M: 12.0, Surface: 'Heavy Bitumen Haul' }
          }
        ]
      }
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem('gis_studio_layers', JSON.stringify(layers));
    } catch {}
  }, [layers]);

  const [activeLayerId, setActiveLayerId] = useState<string>('layer_lease');
  const activeLayer = useMemo(() => layers.find(l => l.id === activeLayerId) || layers[0], [layers, activeLayerId]);

  // Bottom / Side Tab Navigation
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'table' | 'analysis' | 'topology' | 'stats' | 'composer'>('table');
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Analysis State
  const [bufferDistance, setBufferDistance] = useState<number>(50);
  const [bufferUnit, setBufferUnit] = useState<'m' | 'ft'>('m');
  const [topologyIssues, setTopologyIssues] = useState<TopologyIssue[]>([]);
  const [analysisLogs, setAnalysisLogs] = useState<string[]>([]);
  const [showMapComposerModal, setShowMapComposerModal] = useState(false);
  const [composerTitle, setComposerTitle] = useState('EXPLORATION & CADASTRAL GIS GEOPORTAL');
  const [composerSubTitle, setComposerSubTitle] = useState(`Apex Mining Lease ML-04 • Datum: WGS84 / UTM Zone ${workingZone}`);

  // Calculate Global Bounding Box across all visible layers
  const globalBBox = useMemo(() => {
    let minE = Infinity, minN = Infinity, maxE = -Infinity, maxN = -Infinity;
    layers.forEach(ly => {
      if (!ly.visible) return;
      ly.features.forEach(f => {
        f.pts.forEach(p => {
          let E = p.a;
          let N = p.b;
          if (f.kind === 'll') {
            const u = lonLatToUtm(p.a, p.b, zNum, isSouth);
            E = u.E;
            N = u.N;
          }
          if (E < minE) minE = E;
          if (E > maxE) maxE = E;
          if (N < minN) minN = N;
          if (N > maxN) maxN = N;
        });
      });
    });

    if (!isFinite(minE)) return null;
    return { minE, minN, maxE, maxN, width: maxE - minE, height: maxN - minN };
  }, [layers, zNum, isSouth]);

  // Fit view to all layers or active layer
  const fitView = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv || !globalBBox) return;
    const padding = 50;
    const dx = globalBBox.width || 200;
    const dy = globalBBox.height || 200;
    const sc = Math.min((cv.width - 2 * padding) / dx, (cv.height - 2 * padding) / dy);
    setScale(sc);
    setOffset({
      x: (cv.width - dx * sc) / 2 - globalBBox.minE * sc,
      y: (cv.height - dy * sc) / 2 - globalBBox.minN * sc
    });
  }, [globalBBox]);

  useEffect(() => {
    fitView();
  }, []);

  // Coordinate Conversion Helpers for Canvas
  const worldToScreen = useCallback((E: number, N: number, cvHeight: number) => {
    return {
      x: E * scale + offset.x,
      y: cvHeight - (N * scale + offset.y)
    };
  }, [scale, offset]);

  const screenToWorld = useCallback((sx: number, sy: number, cvHeight: number) => {
    return {
      E: (sx - offset.x) / scale,
      N: (cvHeight - sy - offset.y) / scale
    };
  }, [scale, offset]);

  // Main Canvas Render Loop
  const renderCanvas = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, cv.width, cv.height);

    // 1. Basemap Background & Graticule
    if (basemapTheme === 'dark_obsidian') {
      ctx.fillStyle = '#0a0d14';
      ctx.fillRect(0, 0, cv.width, cv.height);
    } else if (basemapTheme === 'blueprint') {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, cv.width, cv.height);
    } else if (basemapTheme === 'parchment') {
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(0, 0, cv.width, cv.height);
    } else {
      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, 0, cv.width, cv.height);
    }

    // Draw Grid Lines
    if (showGrid) {
      ctx.strokeStyle = basemapTheme === 'blueprint' ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      const step = 100; // 100m grid
      const minW = screenToWorld(0, cv.height, cv.height);
      const maxW = screenToWorld(cv.width, 0, cv.height);

      const startE = Math.floor(minW.E / step) * step;
      const endE = Math.ceil(maxW.E / step) * step;
      const startN = Math.floor(minW.N / step) * step;
      const endN = Math.ceil(maxW.N / step) * step;

      ctx.beginPath();
      for (let e = startE; e <= endE; e += step) {
        const s = worldToScreen(e, startN, cv.height);
        const sEnd = worldToScreen(e, endN, cv.height);
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(sEnd.x, sEnd.y);
      }
      for (let n = startN; n <= endN; n += step) {
        const s = worldToScreen(startE, n, cv.height);
        const sEnd = worldToScreen(endE, n, cv.height);
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(sEnd.x, sEnd.y);
      }
      ctx.stroke();

      // Grid Coordinate labels
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.font = '9px monospace';
      for (let e = startE; e <= endE; e += step * 2) {
        const s = worldToScreen(e, minW.N, cv.height);
        if (s.x > 30 && s.x < cv.width - 30) {
          ctx.fillText(`${e}m E`, s.x + 2, cv.height - 8);
        }
      }
      for (let n = startN; n <= endN; n += step * 2) {
        const s = worldToScreen(minW.E, n, cv.height);
        if (s.y > 30 && s.y < cv.height - 30) {
          ctx.fillText(`${n}m N`, 8, s.y - 2);
        }
      }
    }

    // 2. Render GIS Layers in Reverse Order (Bottom to Top)
    [...layers].reverse().forEach(layer => {
      if (!layer.visible) return;

      layer.features.forEach((feat, fIdx) => {
        const pts = feat.pts.map(p => {
          if (feat.kind === 'en') return { E: p.a, N: p.b };
          const u = lonLatToUtm(p.a, p.b, zNum, isSouth);
          return { E: u.E, N: u.N };
        });

        if (pts.length === 0) return;

        const isSelected = selectedFeature?.layerId === layer.id && selectedFeature?.featureIdx === fIdx;

        ctx.strokeStyle = isSelected ? '#fbbf24' : layer.color;
        ctx.lineWidth = isSelected ? layer.strokeWidth + 2 : layer.strokeWidth;
        ctx.fillStyle = layer.fillColor;

        if (feat.geom === 'polygon') {
          ctx.save();
          ctx.globalAlpha = layer.fillOpacity;
          ctx.beginPath();
          pts.forEach((p, idx) => {
            const scPos = worldToScreen(p.E, p.N, cv.height);
            if (idx === 0) ctx.moveTo(scPos.x, scPos.y);
            else ctx.lineTo(scPos.x, scPos.y);
          });
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          // Stroke
          ctx.beginPath();
          pts.forEach((p, idx) => {
            const scPos = worldToScreen(p.E, p.N, cv.height);
            if (idx === 0) ctx.moveTo(scPos.x, scPos.y);
            else ctx.lineTo(scPos.x, scPos.y);
          });
          ctx.closePath();
          ctx.stroke();

          // Centroid Label
          if (showLabels && feat.name) {
            const cent = computePolygonCentroid(pts.map(p => ({ x: p.E, y: p.N })));
            const scCent = worldToScreen(cent.x, cent.y, cv.height);
            ctx.fillStyle = isSelected ? '#fbbf24' : '#ffffff';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(feat.name, scCent.x, scCent.y);
          }
        } else if (feat.geom === 'line') {
          ctx.beginPath();
          pts.forEach((p, idx) => {
            const scPos = worldToScreen(p.E, p.N, cv.height);
            if (idx === 0) ctx.moveTo(scPos.x, scPos.y);
            else ctx.lineTo(scPos.x, scPos.y);
          });
          ctx.stroke();

          if (showLabels && feat.name) {
            const midP = pts[Math.floor(pts.length / 2)];
            const scMid = worldToScreen(midP.E, midP.N, cv.height);
            ctx.fillStyle = isSelected ? '#fbbf24' : '#ffffff';
            ctx.font = '9px sans-serif';
            ctx.fillText(feat.name, scMid.x + 6, scMid.y - 4);
          }
        } else if (feat.geom === 'point') {
          pts.forEach(p => {
            const scPos = worldToScreen(p.E, p.N, cv.height);
            ctx.beginPath();
            ctx.arc(scPos.x, scPos.y, isSelected ? 7 : 5, 0, Math.PI * 2);
            ctx.fillStyle = isSelected ? '#fbbf24' : layer.color;
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();

            if (showLabels && feat.name) {
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 9px monospace';
              ctx.textAlign = 'left';
              ctx.fillText(feat.name, scPos.x + 8, scPos.y + 3);
            }
          });
        }
      });
    });

    // 3. Render Active Measurement Tape / Polyline
    if (measurePts.length > 0) {
      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      measurePts.forEach((p, i) => {
        const scPos = worldToScreen(p.E, p.N, cv.height);
        if (i === 0) ctx.moveTo(scPos.x, scPos.y);
        else ctx.lineTo(scPos.x, scPos.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      measurePts.forEach(p => {
        const scPos = worldToScreen(p.E, p.N, cv.height);
        ctx.beginPath();
        ctx.arc(scPos.x, scPos.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ec4899';
        ctx.fill();
      });
    }

    // 4. Render Active Drawn Vertices
    if (drawnPts.length > 0) {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      drawnPts.forEach((p, i) => {
        const scPos = worldToScreen(p.E, p.N, cv.height);
        if (i === 0) ctx.moveTo(scPos.x, scPos.y);
        else ctx.lineTo(scPos.x, scPos.y);
      });
      if (activeTool === 'draw_poly' && drawnPts.length > 2) {
        ctx.closePath();
      }
      ctx.stroke();

      drawnPts.forEach(p => {
        const scPos = worldToScreen(p.E, p.N, cv.height);
        ctx.beginPath();
        ctx.arc(scPos.x, scPos.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#10b981';
        ctx.fill();
      });
    }

    // 5. Draw North Arrow & Scale Bar HUD on Top-Left
    ctx.save();
    // North Arrow
    const naX = 30, naY = 35;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.arc(naX, naY, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(naX, naY - 14);
    ctx.lineTo(naX - 4, naY);
    ctx.lineTo(naX, naY - 3);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(naX, naY - 14);
    ctx.lineTo(naX + 4, naY);
    ctx.lineTo(naX, naY - 3);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', naX, naY - 16);

    // Scale Bar
    const sbX = 60, sbY = 35;
    const barWidthPx = 80;
    const groundMeters = barWidthPx / scale;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sbX, sbY);
    ctx.lineTo(sbX + barWidthPx, sbY);
    ctx.moveTo(sbX, sbY - 4);
    ctx.lineTo(sbX, sbY + 4);
    ctx.moveTo(sbX + barWidthPx, sbY - 4);
    ctx.lineTo(sbX + barWidthPx, sbY + 4);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${groundMeters >= 1000 ? `${(groundMeters / 1000).toFixed(2)} km` : `${groundMeters.toFixed(0)} m`}`, sbX + barWidthPx / 2, sbY + 14);
    ctx.restore();
  }, [layers, scale, offset, selectedFeature, measurePts, drawnPts, basemapTheme, showGrid, showLabels, activeTool, zNum, isSouth]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Handle Canvas Mouse Interactions
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy, cv.height);

    if (activeTool === 'pan') {
      setIsDragging(true);
      setDragStart({ x: sx - offset.x, y: sy - offset.y });
    } else if (activeTool === 'select') {
      // Find clicked feature
      let found: { layerId: string; featureIdx: number; feature: GeoFeature } | null = null;
      for (const ly of layers) {
        if (!ly.visible) continue;
        for (let i = 0; i < ly.features.length; i++) {
          const f = ly.features[i];
          const pts = f.pts.map(p => {
            if (f.kind === 'en') return { E: p.a, N: p.b };
            const u = lonLatToUtm(p.a, p.b, zNum, isSouth);
            return { E: u.E, N: u.N };
          });

          if (f.geom === 'polygon' && pointInPoly(world.E, world.N, pts.map(p => ({ x: p.E, y: p.N })))) {
            found = { layerId: ly.id, featureIdx: i, feature: f };
            break;
          } else if (f.geom === 'point') {
            const p = pts[0];
            const dist = Math.hypot(p.E - world.E, p.N - world.N);
            if (dist < 10 / scale) {
              found = { layerId: ly.id, featureIdx: i, feature: f };
              break;
            }
          }
        }
        if (found) break;
      }
      setSelectedFeature(found);
    } else if (activeTool === 'measure') {
      const next = [...measurePts, { E: world.E, N: world.N }];
      setMeasurePts(next);
      if (next.length >= 2) {
        let totalD = 0;
        for (let i = 0; i < next.length - 1; i++) {
          totalD += Math.hypot(next[i + 1].E - next[i].E, next[i + 1].N - next[i].N);
        }
        setMeasureDistance(totalD);
        if (next.length >= 3) {
          const polyRes = polygonAreaPerimeter(next);
          setMeasureArea(polyRes.areaM2);
        }
      }
    } else if (activeTool === 'draw_point') {
      const newFeat: GeoFeature = {
        name: `Point #${activeLayer.features.length + 1}`,
        geom: 'point',
        kind: 'en',
        pts: [{ a: world.E, b: world.N }],
        props: { Easting: world.E.toFixed(2), Northing: world.N.toFixed(2), Created_At: new Date().toLocaleTimeString() }
      };
      setLayers(prev =>
        prev.map(l => (l.id === activeLayer.id ? { ...l, features: [...l.features, newFeat] } : l))
      );
      setStatusBanner(`Added point to layer "${activeLayer.name}"`);
    } else if (activeTool === 'draw_line' || activeTool === 'draw_poly') {
      setDrawnPts([...drawnPts, { E: world.E, N: world.N }]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy, cv.height);
    const ll = utmToLonLat(world.E, world.N, zNum, isSouth);

    setCursorCoord({ E: world.E, N: world.N, lon: ll.lon, lat: ll.lat });

    if (isDragging && activeTool === 'pan') {
      setOffset({ x: sx - dragStart.x, y: sy - dragStart.y });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newScale = Math.max(0.0001, Math.min(100, scale * zoomFactor));

    setOffset({
      x: sx - (sx - offset.x) * (newScale / scale),
      y: sy - (sy - offset.y) * (newScale / scale)
    });
    setScale(newScale);
  };

  // Finalize Drawing Line or Polygon
  const handleFinishDrawing = () => {
    if (drawnPts.length < (activeTool === 'draw_poly' ? 3 : 2)) {
      setStatusBanner('Need at least 2 points for a line, 3 points for a polygon.');
      return;
    }
    const newFeat: GeoFeature = {
      name: `${activeTool === 'draw_poly' ? 'Polygon' : 'Polyline'} #${activeLayer.features.length + 1}`,
      geom: activeTool === 'draw_poly' ? 'polygon' : 'line',
      kind: 'en',
      pts: drawnPts.map(p => ({ a: p.E, b: p.N })),
      props: {
        Vertices: drawnPts.length,
        Length_M: drawnPts.reduce((acc, p, i) => (i === 0 ? 0 : acc + Math.hypot(p.E - drawnPts[i - 1].E, p.N - drawnPts[i - 1].N)), 0).toFixed(2),
        Created_At: new Date().toLocaleTimeString()
      }
    };

    setLayers(prev =>
      prev.map(l => (l.id === activeLayer.id ? { ...l, features: [...l.features, newFeat] } : l))
    );
    setDrawnPts([]);
    setStatusBanner(`Successfully added new ${newFeat.geom} feature to layer "${activeLayer.name}"`);
  };

  // ---------------- Deep Spatial Analysis Operations ----------------
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
      if (f.geom === 'point' && pts.length > 0) {
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
      setLayers([newLayer, ...layers]);
      setActiveLayerId(newLayer.id);
      setStatusBanner(`Created new buffer layer with ${bufferedFeatures.length} zones.`);
    }
  };

  // 2. Convex Hull Extraction
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
      setStatusBanner('Need at least 3 points in active layer to compute Convex Hull.');
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

    setLayers([newLayer, ...layers]);
    setActiveLayerId(newLayer.id);
    setStatusBanner(`Computed Convex Hull (${polyCalc.areaHa.toFixed(2)} Ha enclosed).`);
  };

  // 3. Centroids Extraction
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

    setLayers([newLayer, ...layers]);
    setActiveLayerId(newLayer.id);
    setStatusBanner(`Extracted ${centroidFeatures.length} feature centroids.`);
  };

  // 4. Voronoi Cells Generation
  const handleRunVoronoi = () => {
    const pointFeatures = activeLayer.features.filter(f => f.geom === 'point');
    if (pointFeatures.length < 3) {
      setStatusBanner('Need at least 3 point features in active layer to compute Voronoi cells.');
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

    setLayers([newLayer, ...layers]);
    setActiveLayerId(newLayer.id);
    setStatusBanner(`Generated ${cells.length} Voronoi influence polygons.`);
  };

  // 5. Topology QA Audit
  const handleRunTopologyAudit = () => {
    const issues = auditLayerTopology(activeLayer, zNum, isSouth);
    setTopologyIssues(issues);
    setActiveWorkspaceTab('topology');
    setStatusBanner(`Topology QA Audit complete: Found ${issues.length} item(s) to review.`);
  };

  // Layer File Upload (GeoJSON, KML, KMZ, Shapefile, DXF, CSV, ZIP)
  const handleImportLayerFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const colorPalette = ['#38bdf8', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316', '#e11d48'];

      if (ext === 'zip' || ext === 'kmz') {
        const buf = await file.arrayBuffer();
        const extractedDatasets = await extractAllFeaturesFromZip(buf, zNum, isSouth);

        if (extractedDatasets.length === 0) {
          setStatusBanner(`No parseable geospatial features found in archive ${file.name}`);
          return;
        }

        const newLayers: GisLayer[] = extractedDatasets.map((ds, idx) => {
          const color = colorPalette[idx % colorPalette.length];
          return {
            id: `imp_${Date.now()}_${idx}`,
            name: ds.layerName,
            visible: true,
            color,
            fillColor: color,
            fillOpacity: ds.geomType === 'polygon' ? 0.25 : 0.4,
            strokeWidth: 2,
            geomType: ds.geomType,
            features: ds.features
          };
        });

        setLayers(prev => [...newLayers, ...prev]);
        setActiveLayerId(newLayers[0].id);

        const totalFeats = newLayers.reduce((s, l) => s + l.features.length, 0);
        setStatusBanner(`Extracted ${newLayers.length} layer(s) and ${totalFeats} feature(s) from "${file.name}"`);
        fitView();
        return;
      }

      if (ext === 'shp') {
        const buf = await file.arrayBuffer();
        const feats = parseShapefile(new Uint8Array(buf), undefined, undefined, zNum, isSouth);
        if (feats.length > 0) {
          const firstGeom = feats[0].geom;
          const newLayer: GisLayer = {
            id: `imp_${Date.now()}`,
            name: file.name.replace(/\.[^/.]+$/, ''),
            visible: true,
            color: firstGeom === 'polygon' ? '#38bdf8' : firstGeom === 'line' ? '#a855f7' : '#10b981',
            fillColor: firstGeom === 'polygon' ? '#38bdf8' : '#10b981',
            fillOpacity: 0.25,
            strokeWidth: 2,
            geomType: firstGeom,
            features: feats
          };
          setLayers(prev => [newLayer, ...prev]);
          setActiveLayerId(newLayer.id);
          setStatusBanner(`Imported Shapefile "${newLayer.name}" with ${feats.length} features.`);
          fitView();
        }
        return;
      }

      const text = stripBOM(await file.text());
      let feats: GeoFeature[] = [];

      if (ext === 'geojson' || ext === 'json') {
        feats = geoJsonParse(text);
      } else if (ext === 'kml') {
        feats = kmlParse(text);
      } else if (ext === 'dxf') {
        feats = dxfParse(text);
      } else {
        feats = csvToFeatures(parseCSV(text), zNum, isSouth);
      }

      if (feats.length > 0) {
        const firstGeom = feats[0].geom;
        const newLayer: GisLayer = {
          id: `imp_${Date.now()}`,
          name: file.name.replace(/\.[^/.]+$/, ''),
          visible: true,
          color: firstGeom === 'polygon' ? '#38bdf8' : firstGeom === 'line' ? '#a855f7' : '#10b981',
          fillColor: firstGeom === 'polygon' ? '#38bdf8' : '#10b981',
          fillOpacity: 0.2,
          strokeWidth: 2,
          geomType: firstGeom,
          features: feats
        };
        setLayers(prev => [newLayer, ...prev]);
        setActiveLayerId(newLayer.id);
        setStatusBanner(`Imported layer "${newLayer.name}" with ${feats.length} features.`);
        fitView();
      }
    } catch (err: any) {
      setStatusBanner(`Error importing layer: ${err.message}`);
    }
  };

  // Export Active Layer to ESRI Shapefile Bundle (.zip)
  const handleExportShapefile = () => {
    if (!activeLayer.features.length) return;
    const zipBytes = buildShapefileZip(activeLayer.features, activeLayer.name, zNum, isSouth);
    downloadBlob(zipBytes, `${activeLayer.name.toLowerCase().replace(/\s+/g, '_')}_shp.zip`, 'application/zip');
    setStatusBanner(`Exported ESRI Shapefile bundle for "${activeLayer.name}"`);
  };

  // Export All Layers as Complete Multi-Layer Zip Archive
  const handleExportAllLayersZip = () => {
    const enc = new TextEncoder();
    const filesToZip: { name: string; data: Uint8Array }[] = [];

    layers.forEach(l => {
      const sName = l.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      // 1. GeoJSON
      const geojsonStr = geoJsonBuild(l.features, zNum, isSouth);
      filesToZip.push({ name: `geojson/${sName}.geojson`, data: enc.encode(geojsonStr) });
      // 2. KML
      const kmlStr = kmlBuild(l.features, l.name, true, zNum, isSouth);
      filesToZip.push({ name: `kml/${sName}.kml`, data: enc.encode(kmlStr) });
      // 3. DXF
      const dxfRes = dxfBuild(l.features, 'utm', zNum, isSouth, true);
      filesToZip.push({ name: `dxf/${sName}.dxf`, data: enc.encode(dxfRes.dxf) });
      // 4. CSV Table
      const headers = ['ID', 'Name', 'Geometry', 'Coords_Count', 'Easting', 'Northing', 'Longitude', 'Latitude'];
      const rows: string[][] = [];
      l.features.forEach((f, idx) => {
        const p = f.pts[0] || { a: 0, b: 0 };
        const isLL = f.kind === 'll';
        const utm = isLL ? lonLatToUtm(p.a, p.b, zNum, isSouth) : { E: p.a, N: p.b };
        const ll = isLL ? { lon: p.a, lat: p.b } : utmToLonLat(p.a, p.b, zNum, isSouth);
        rows.push([
          String(idx + 1),
          f.name || `Feat_${idx + 1}`,
          f.geom,
          String(f.pts.length),
          utm.E.toFixed(3),
          utm.N.toFixed(3),
          ll.lon.toFixed(7),
          ll.lat.toFixed(7)
        ]);
      });
      filesToZip.push({ name: `csv/${sName}.csv`, data: enc.encode(toCSVtext(headers, rows)) });
    });

    const fullZip = makeZip(filesToZip);
    downloadBlob(fullZip, `GIS_Studio_All_Layers_${new Date().toISOString().slice(0, 10)}.zip`, 'application/zip');
    setStatusBanner(`Exported multi-layer package with all ${layers.length} layers in Shapefile, GeoJSON, KML, DXF, and CSV!`);
  };

  // Export Active Layer to GeoJSON
  const handleExportGeoJSON = () => {
    const jsonStr = geoJsonBuild(activeLayer.features, zNum, isSouth);
    downloadBlob(new TextEncoder().encode(jsonStr), `${activeLayer.name.toLowerCase().replace(/\s+/g, '_')}.geojson`, 'application/geo+json');
  };

  // Export Active Layer to KML
  const handleExportKML = () => {
    const kmlStr = kmlBuild(activeLayer.features, activeLayer.name, true, zNum, isSouth);
    downloadBlob(new TextEncoder().encode(kmlStr), `${activeLayer.name.toLowerCase().replace(/\s+/g, '_')}.kml`, 'application/vnd.google-earth.kml+xml');
  };

  // Export Active Layer to DXF
  const handleExportDXF = () => {
    const res = dxfBuild(activeLayer.features, 'utm', zNum, isSouth, true);
    downloadBlob(new TextEncoder().encode(res.dxf), `${activeLayer.name.toLowerCase().replace(/\s+/g, '_')}.dxf`, 'application/dxf');
  };

  // Export Map Canvas Image (PNG)
  const handleExportMapImage = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    const url = cv.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `GIS_Map_Export_${new Date().toISOString().slice(0, 10)}.png`;
    link.href = url;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* 1. Top GIS Cockpit Banner */}
      <div className="bg-[#0f0f0f] rounded-2xl p-6 border border-white/5 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#c9a063] font-medium">Web GIS & Spatial Studio</span>
              <span className="text-[10px] bg-sky-500/20 text-sky-400 px-2 py-0.5 rounded border border-sky-500/30 font-mono">
                Multi-Layer TOC &bull; Deep Geoprocessing &bull; WGS84 UTM Zone {workingZone}
              </span>
            </div>
            <h3 className="text-xl font-serif italic text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#c9a063]" />
              GIS Map Studio & Deep Spatial Analysis Engine
            </h3>
            <p className="text-xs text-white/40 mt-1 max-w-2xl">
              Professional geoprocessing hub for overlay analysis, variable buffer extraction, convex hull computation, topology validation, and cartographic map composition.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 px-3 py-1.5 bg-[#141414] hover:bg-[#1a1a1a] text-white rounded-xl text-xs font-semibold border border-white/10 cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-sky-400" /> Import Layer
              <input type="file" accept=".geojson,.json,.kml,.dxf,.csv" onChange={handleImportLayerFile} className="hidden" />
            </label>
            <button
              onClick={() => setShowMapComposerModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#141414] hover:bg-[#1a1a1a] text-white rounded-xl text-xs font-semibold border border-white/10"
            >
              <Printer className="w-3.5 h-3.5 text-[#c9a063]" /> Map Composer
            </button>
            <button
              onClick={handleExportMapImage}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#c9a063] hover:bg-[#d6b074] text-black font-bold text-xs rounded-xl"
            >
              <Download className="w-3.5 h-3.5" /> Export Map (PNG)
            </button>
          </div>
        </div>

        {statusBanner && (
          <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-xs text-[#c9a063] font-mono flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{statusBanner}</span>
            </div>
            <button onClick={() => setStatusBanner(null)} className="text-white/40 hover:text-white text-xs">
              ✕
            </button>
          </div>
        )}
      </div>

      {/* 2. Main GIS Studio Workspace (Split Grid: Left TOC, Right Interactive Canvas) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left TOC: Layer Management & Hierarchy (4 Columns) */}
        <div className="lg:col-span-4 bg-[#0f0f0f] rounded-2xl p-5 border border-white/5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <h4 className="text-xs uppercase font-mono tracking-wider text-white/70 flex items-center gap-1.5">
              <Layers2 className="w-4 h-4 text-[#c9a063]" /> Table of Contents ({layers.length})
            </h4>
            <button
              onClick={() => {
                const newLayer: GisLayer = {
                  id: `usr_${Date.now()}`,
                  name: `New Vector Layer #${layers.length + 1}`,
                  visible: true,
                  color: '#eab308',
                  fillColor: '#eab308',
                  fillOpacity: 0.2,
                  strokeWidth: 2,
                  geomType: 'polygon',
                  features: []
                };
                setLayers([newLayer, ...layers]);
                setActiveLayerId(newLayer.id);
              }}
              className="p-1 hover:bg-white/10 rounded text-[#c9a063]"
              title="Add Empty Vector Layer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Layer List */}
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
            {layers.map(layer => {
              const isActive = layer.id === activeLayer.id;
              return (
                <div
                  key={layer.id}
                  onClick={() => setActiveLayerId(layer.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer space-y-2 ${
                    isActive ? 'bg-[#181818] border-[#c9a063]/50 shadow-md' : 'bg-[#141414] border-white/5 hover:border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setLayers(layers.map(l => (l.id === layer.id ? { ...l, visible: !l.visible } : l)));
                        }}
                        className="text-white/60 hover:text-white"
                      >
                        {layer.visible ? <Eye className="w-4 h-4 text-emerald-400" /> : <EyeOff className="w-4 h-4 text-white/30" />}
                      </button>

                      <div className="w-3.5 h-3.5 rounded-full border border-white/20" style={{ backgroundColor: layer.color }} />

                      <span className={`text-xs font-semibold truncate max-w-[160px] ${isActive ? 'text-white' : 'text-white/70'}`}>
                        {layer.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/50">
                        {layer.features.length} {layer.geomType}s
                      </span>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setLayers(layers.filter(l => l.id !== layer.id));
                        }}
                        className="text-rose-400/60 hover:text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Active Layer Styling HUD */}
                  {isActive && (
                    <div className="pt-2 border-t border-white/5 grid grid-cols-2 gap-2 text-[10px] text-white/60">
                      <div>
                        <span>Color:</span>
                        <input
                          type="color"
                          value={layer.color}
                          onChange={e => {
                            const col = e.target.value;
                            setLayers(layers.map(l => (l.id === layer.id ? { ...l, color: col, fillColor: col } : l)));
                          }}
                          className="w-full h-5 bg-transparent cursor-pointer rounded border border-white/10 mt-0.5"
                        />
                      </div>
                      <div>
                        <span>Opacity ({(layer.fillOpacity * 100).toFixed(0)}%):</span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={layer.fillOpacity}
                          onChange={e => {
                            const op = parseFloat(e.target.value);
                            setLayers(layers.map(l => (l.id === layer.id ? { ...l, fillOpacity: op } : l)));
                          }}
                          className="w-full accent-[#c9a063] mt-1"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quick Geoprocessing Action Buttons */}
          <div className="pt-2 border-t border-white/5 space-y-2">
            <span className="text-[10px] uppercase font-mono text-white/40 block">Spatial Extractors</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleRunBuffer}
                className="px-2.5 py-2 bg-[#141414] hover:bg-[#1c1c1c] border border-white/10 rounded-xl text-xs text-white font-medium flex items-center justify-center gap-1.5"
              >
                <Spline className="w-3.5 h-3.5 text-rose-400" /> Buffer ({bufferDistance}m)
              </button>
              <button
                onClick={handleRunConvexHull}
                className="px-2.5 py-2 bg-[#141414] hover:bg-[#1c1c1c] border border-white/10 rounded-xl text-xs text-white font-medium flex items-center justify-center gap-1.5"
              >
                <Maximize2 className="w-3.5 h-3.5 text-amber-400" /> Convex Hull
              </button>
              <button
                onClick={handleRunCentroids}
                className="px-2.5 py-2 bg-[#141414] hover:bg-[#1c1c1c] border border-white/10 rounded-xl text-xs text-white font-medium flex items-center justify-center gap-1.5"
              >
                <Crosshair className="w-3.5 h-3.5 text-cyan-400" /> Centroids
              </button>
              <button
                onClick={handleRunVoronoi}
                className="px-2.5 py-2 bg-[#141414] hover:bg-[#1c1c1c] border border-white/10 rounded-xl text-xs text-white font-medium flex items-center justify-center gap-1.5"
              >
                <Layers className="w-3.5 h-3.5 text-purple-400" /> Voronoi Cells
              </button>
            </div>
          </div>
        </div>

        {/* Right Canvas: Vector Viewport (8 Columns) */}
        <div className="lg:col-span-8 bg-[#0f0f0f] rounded-2xl p-5 border border-white/5 space-y-3 flex flex-col">
          {/* Map Toolbar */}
          <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-white/5">
            <div className="flex items-center gap-1 bg-[#141414] p-1 rounded-xl border border-white/10">
              <button
                onClick={() => setActiveTool('pan')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTool === 'pan' ? 'bg-[#c9a063] text-black' : 'text-white/60 hover:text-white'
                }`}
                title="Pan & Drag View"
              >
                Pan
              </button>
              <button
                onClick={() => setActiveTool('select')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTool === 'select' ? 'bg-[#c9a063] text-black' : 'text-white/60 hover:text-white'
                }`}
                title="Select & Inspect Feature"
              >
                Select
              </button>
              <button
                onClick={() => {
                  setActiveTool('measure');
                  setMeasurePts([]);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTool === 'measure' ? 'bg-[#c9a063] text-black' : 'text-white/60 hover:text-white'
                }`}
                title="Measure Distance & Area"
              >
                <Ruler className="w-3.5 h-3.5 inline mr-1" /> Measure
              </button>
              <button
                onClick={() => {
                  setActiveTool('draw_point');
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTool === 'draw_point' ? 'bg-[#c9a063] text-black' : 'text-white/60 hover:text-white'
                }`}
                title="Digitize Point"
              >
                + Point
              </button>
              <button
                onClick={() => {
                  setActiveTool('draw_poly');
                  setDrawnPts([]);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTool === 'draw_poly' ? 'bg-[#c9a063] text-black' : 'text-white/60 hover:text-white'
                }`}
                title="Digitize Polygon"
              >
                + Polygon
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <select
                value={basemapTheme}
                onChange={e => setBasemapTheme(e.target.value as any)}
                className="px-2.5 py-1.5 bg-[#141414] border border-white/10 rounded-xl text-xs text-white"
              >
                <option value="dark_obsidian">Dark Obsidian Grid</option>
                <option value="blueprint">Blueprint CAD</option>
                <option value="parchment">Cadastral Parchment</option>
                <option value="light_topo">Light Topo Grid</option>
              </select>

              <button
                onClick={() => setShowGrid(!showGrid)}
                className={`p-1.5 rounded-xl border text-xs ${
                  showGrid ? 'bg-white/10 text-[#c9a063] border-white/20' : 'bg-[#141414] text-white/40 border-white/5'
                }`}
                title="Toggle UTM Coordinate Grid"
              >
                Grid
              </button>

              <button
                onClick={() => setShowLabels(!showLabels)}
                className={`p-1.5 rounded-xl border text-xs ${
                  showLabels ? 'bg-white/10 text-sky-400 border-white/20' : 'bg-[#141414] text-white/40 border-white/5'
                }`}
                title="Toggle Feature Labels"
              >
                Labels
              </button>

              <button
                onClick={fitView}
                className="p-1.5 bg-[#141414] hover:bg-[#1a1a1a] border border-white/10 rounded-xl text-white"
                title="Fit to Extent"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Canvas Viewport */}
          <div className="relative flex-1 min-h-[420px] rounded-xl overflow-hidden border border-white/10 bg-[#0a0d14]">
            <canvas
              ref={canvasRef}
              width={800}
              height={450}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onWheel={handleWheel}
              className="w-full h-full cursor-crosshair block"
            />

            {/* Drawing / Measuring Floating HUD */}
            {activeTool === 'measure' && measurePts.length > 0 && (
              <div className="absolute bottom-4 left-4 p-3 bg-black/80 backdrop-blur-md rounded-xl border border-pink-500/30 text-xs text-white space-y-1 font-mono">
                <div className="text-pink-400 font-bold flex items-center justify-between">
                  <span>Measurement Tape</span>
                  <button onClick={() => setMeasurePts([])} className="text-white/40 hover:text-white text-[10px]">
                    Clear
                  </button>
                </div>
                <div>Distance: {measureDistance >= 1000 ? `${(measureDistance / 1000).toFixed(3)} km` : `${measureDistance.toFixed(2)} m`}</div>
                {measureArea > 0 && <div>Enclosed Area: {(measureArea / 10000).toFixed(4)} Ha ({measureArea.toFixed(1)} m²)</div>}
              </div>
            )}

            {drawnPts.length > 0 && (
              <div className="absolute bottom-4 left-4 p-3 bg-black/80 backdrop-blur-md rounded-xl border border-emerald-500/30 text-xs text-white space-y-2 font-mono">
                <div className="text-emerald-400 font-bold">Digitizing {activeTool === 'draw_poly' ? 'Polygon' : 'Polyline'}</div>
                <div>Vertices: {drawnPts.length} points</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleFinishDrawing}
                    className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-black font-bold rounded-lg text-xs"
                  >
                    Finish & Save
                  </button>
                  <button onClick={() => setDrawnPts([])} className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Selected Feature Card */}
            {selectedFeature && (
              <div className="absolute top-4 right-4 p-3 bg-black/90 backdrop-blur-md rounded-xl border border-[#c9a063]/40 text-xs text-white space-y-2 max-w-xs shadow-xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                  <span className="font-bold text-[#c9a063] truncate">{selectedFeature.feature.name}</span>
                  <button onClick={() => setSelectedFeature(null)} className="text-white/40 hover:text-white">
                    ✕
                  </button>
                </div>
                <div className="space-y-1 font-mono text-[11px] text-white/80 max-h-36 overflow-y-auto">
                  <div>Type: {selectedFeature.feature.geom.toUpperCase()}</div>
                  {Object.entries(selectedFeature.feature.props || {}).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2">
                      <span className="text-white/40 truncate">{k}:</span>
                      <span className="text-emerald-400 font-bold truncate">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bottom Status Bar */}
            <div className="absolute bottom-2 right-2 px-3 py-1 bg-black/70 backdrop-blur-sm rounded-lg text-[10px] font-mono text-white/60 border border-white/5">
              {cursorCoord ? (
                <span>
                  E: {cursorCoord.E.toFixed(1)} | N: {cursorCoord.N.toFixed(1)} (Lon: {cursorCoord.lon.toFixed(6)}°, Lat: {cursorCoord.lat.toFixed(6)}°)
                </span>
              ) : (
                <span>Hover over map</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Deep Analysis & Attribute Data Grid Workspace Tabs */}
      <div className="bg-[#0f0f0f] rounded-2xl p-6 border border-white/5 space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveWorkspaceTab('table')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeWorkspaceTab === 'table' ? 'bg-[#c9a063] text-black font-bold' : 'text-white/60 hover:text-white bg-[#141414]'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" /> Attribute Table ({activeLayer.features.length})
            </button>
            <button
              onClick={() => setActiveWorkspaceTab('analysis')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeWorkspaceTab === 'analysis' ? 'bg-[#c9a063] text-black font-bold' : 'text-white/60 hover:text-white bg-[#141414]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" /> Deep Spatial Analysis
            </button>
            <button
              onClick={() => setActiveWorkspaceTab('topology')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeWorkspaceTab === 'topology' ? 'bg-[#c9a063] text-black font-bold' : 'text-white/60 hover:text-white bg-[#141414]'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Topology QA ({topologyIssues.length})
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={handleExportShapefile}
              className="px-2.5 py-1 bg-[#141414] hover:bg-[#1a1a1a] text-[#c9a063] hover:text-[#d6b074] rounded-lg text-xs border border-[#c9a063]/30 font-semibold flex items-center gap-1"
              title="Export active layer as ESRI Shapefile Bundle (.zip)"
            >
              <FolderArchive className="w-3.5 h-3.5 text-[#c9a063]" /> Shapefile (.zip)
            </button>
            <button
              onClick={handleExportAllLayersZip}
              className="px-2.5 py-1 bg-[#c9a063] hover:bg-[#d6b074] text-black font-bold rounded-lg text-xs flex items-center gap-1 shadow-sm"
              title="Export all layers in all GIS formats packaged into a single ZIP archive"
            >
              <Download className="w-3.5 h-3.5" /> All Layers (.zip)
            </button>
            <button
              onClick={handleExportGeoJSON}
              className="px-2.5 py-1 bg-[#141414] hover:bg-[#1a1a1a] text-white rounded-lg text-xs border border-white/10 font-mono"
            >
              GeoJSON
            </button>
            <button
              onClick={handleExportKML}
              className="px-2.5 py-1 bg-[#141414] hover:bg-[#1a1a1a] text-white rounded-lg text-xs border border-white/10 font-mono"
            >
              KML
            </button>
            <button
              onClick={handleExportDXF}
              className="px-2.5 py-1 bg-[#141414] hover:bg-[#1a1a1a] text-white rounded-lg text-xs border border-white/10 font-mono"
            >
              DXF CAD
            </button>
          </div>
        </div>

        {/* Tab 1: Attribute Table */}
        {activeWorkspaceTab === 'table' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1 max-w-md">
                <Search className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={tableSearchQuery}
                  onChange={e => setTableSearchQuery(e.target.value)}
                  placeholder={`Search features in ${activeLayer.name}...`}
                  className="w-full py-1.5 pl-8 pr-3 bg-[#141414] border border-white/10 rounded-xl text-xs text-white"
                />
              </div>

              <span className="text-xs text-white/40 font-mono">
                Active Layer: <strong className="text-[#c9a063]">{activeLayer.name}</strong>
              </span>
            </div>

            <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-[#141414]">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#1c1c1c] text-white/70 font-semibold sticky top-0 border-b border-white/10 font-mono">
                  <tr>
                    <th className="p-2.5">Feature Name</th>
                    <th className="p-2.5">Geometry</th>
                    <th className="p-2.5">Coordinates / Area</th>
                    <th className="p-2.5">Properties</th>
                    <th className="p-2.5">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-white/80">
                  {activeLayer.features
                    .filter(f => !tableSearchQuery.trim() || f.name.toLowerCase().includes(tableSearchQuery.toLowerCase()))
                    .map((f, i) => (
                      <tr key={i} className="hover:bg-white/5">
                        <td className="p-2.5 font-bold text-white">{f.name}</td>
                        <td className="p-2.5">
                          <span className="px-2 py-0.5 rounded bg-white/5 text-[10px] uppercase font-bold text-sky-400">
                            {f.geom}
                          </span>
                        </td>
                        <td className="p-2.5 text-xs text-emerald-400">
                          {f.geom === 'polygon'
                            ? `${(polygonAreaPerimeter(f.pts.map(p => ({ E: p.a, N: p.b }))).areaHa).toFixed(4)} Ha`
                            : `${f.pts.length} pts`}
                        </td>
                        <td className="p-2.5 text-[11px] text-white/60 truncate max-w-xs">
                          {Object.entries(f.props || {})
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(' | ')}
                        </td>
                        <td className="p-2.5">
                          <button
                            onClick={() => {
                              const nextFeats = activeLayer.features.filter((_, idx) => idx !== i);
                              setLayers(layers.map(l => (l.id === activeLayer.id ? { ...l, features: nextFeats } : l)));
                            }}
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
        )}

        {/* Tab 2: Deep Spatial Analysis & Buffer Settings */}
        {activeWorkspaceTab === 'analysis' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            {/* 1. Buffer Configuration */}
            <div className="p-4 bg-[#141414] rounded-xl border border-white/5 space-y-3">
              <h5 className="text-xs font-bold text-white uppercase font-mono flex items-center gap-1.5">
                <Spline className="w-4 h-4 text-rose-400" /> Buffer Zone Generator
              </h5>
              <p className="text-xs text-white/50">
                Generate statutory safety corridors, DGMS 7.5m barrier zones, or 500m eco-sensitive rings.
              </p>
              <div>
                <label className="text-[10px] text-white/40 block mb-1">Buffer Radius (Distance)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={bufferDistance}
                    onChange={e => setBufferDistance(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 bg-[#181818] border border-white/10 rounded-xl text-xs text-white font-mono"
                  />
                  <select
                    value={bufferUnit}
                    onChange={e => setBufferUnit(e.target.value as any)}
                    className="px-3 py-1.5 bg-[#181818] border border-white/10 rounded-xl text-xs text-white"
                  >
                    <option value="m">Meters</option>
                    <option value="ft">Feet</option>
                  </select>
                </div>
              </div>
              <button
                onClick={handleRunBuffer}
                className="w-full py-2 bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs rounded-xl"
              >
                Execute Buffer Generation
              </button>
            </div>

            {/* 2. Boundary Enclosures & Geometry */}
            <div className="p-4 bg-[#141414] rounded-xl border border-white/5 space-y-3">
              <h5 className="text-xs font-bold text-white uppercase font-mono flex items-center gap-1.5">
                <Maximize2 className="w-4 h-4 text-amber-400" /> Convex Hull & Enclosures
              </h5>
              <p className="text-xs text-white/50">
                Compute the minimum bounding polygon encompassing all vertices in the active layer.
              </p>
              <button
                onClick={handleRunConvexHull}
                className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs rounded-xl"
              >
                Extract Minimum Convex Hull
              </button>
              <button
                onClick={handleRunCentroids}
                className="w-full py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs rounded-xl"
              >
                Extract All Feature Centroids
              </button>
            </div>

            {/* 3. Voronoi Influence Cells */}
            <div className="p-4 bg-[#141414] rounded-xl border border-white/5 space-y-3">
              <h5 className="text-xs font-bold text-white uppercase font-mono flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-purple-400" /> Voronoi / Thiessen Polygons
              </h5>
              <p className="text-xs text-white/50">
                Construct area-of-influence tessellations around borehole collars or sample survey points.
              </p>
              <button
                onClick={handleRunVoronoi}
                className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl"
              >
                Compute Voronoi Influence Cells
              </button>
              <button
                onClick={handleRunTopologyAudit}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl"
              >
                Run Topology QA Audit
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Topology QA Issues */}
        {activeWorkspaceTab === 'topology' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-bold text-white font-mono flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Topology Validation Report for "{activeLayer.name}"
              </h5>
              <button
                onClick={handleRunTopologyAudit}
                className="px-3 py-1 bg-[#141414] hover:bg-[#1a1a1a] border border-white/10 rounded-xl text-xs text-white"
              >
                Re-Scan Layer
              </button>
            </div>

            {topologyIssues.length === 0 ? (
              <div className="p-6 bg-[#141414] rounded-xl border border-white/5 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="text-xs text-white font-bold">No Topology Defects Detected</p>
                <p className="text-[11px] text-white/40">
                  All polygon rings are strictly closed, free of self-intersections, slivers, and duplicate vertices.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {topologyIssues.map((issue, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-[#141414] rounded-xl border border-white/10 flex items-start justify-between gap-4 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                            issue.severity === 'error' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'
                          }`}
                        >
                          {issue.type.replace('_', ' ')}
                        </span>
                        <span className="font-bold text-white">{issue.featureName}</span>
                      </div>
                      <p className="text-white/60">{issue.description}</p>
                    </div>

                    {issue.location && (
                      <span className="text-[10px] font-mono text-white/40 shrink-0">
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

      {/* 4. Official Cartographic Map Composer Modal */}
      {showMapComposerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#141414] border border-white/10 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#181818]">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-[#c9a063]" />
                <h3 className="font-serif italic text-white text-base">
                  Cartographic GIS Map Layout & Print Composer
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
                  onClick={() => setShowMapComposerModal(false)}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs rounded-xl"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 bg-[#0f0f0f] text-white">
              {/* Map Title Block */}
              <div className="text-center border-b border-white/10 pb-4 space-y-1">
                <input
                  type="text"
                  value={composerTitle}
                  onChange={e => setComposerTitle(e.target.value)}
                  className="text-xl font-serif font-bold text-white bg-transparent text-center border-b border-dashed border-white/20 w-full focus:outline-none"
                />
                <input
                  type="text"
                  value={composerSubTitle}
                  onChange={e => setComposerSubTitle(e.target.value)}
                  className="text-xs text-white/50 italic bg-transparent text-center border-b border-dashed border-white/20 w-full focus:outline-none"
                />
              </div>

              {/* Layer Summary Table in Map Composer */}
              <div className="border border-white/10 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-[#181818] border-b border-white/10 text-white/70 font-semibold font-mono">
                    <tr>
                      <th className="p-2.5">Layer Name</th>
                      <th className="p-2.5">Type</th>
                      <th className="p-2.5">Feature Count</th>
                      <th className="p-2.5">Symbology Color</th>
                      <th className="p-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono text-white/80">
                    {layers.map(l => (
                      <tr key={l.id}>
                        <td className="p-2.5 font-bold text-white">{l.name}</td>
                        <td className="p-2.5 uppercase text-sky-400">{l.geomType}</td>
                        <td className="p-2.5">{l.features.length} features</td>
                        <td className="p-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-3.5 h-3.5 rounded" style={{ backgroundColor: l.color }} />
                            <span>{l.color}</span>
                          </div>
                        </td>
                        <td className="p-2.5 text-emerald-400 font-bold">{l.visible ? 'VISIBLE' : 'HIDDEN'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Signatures & Certification Block */}
              <div className="pt-8 grid grid-cols-3 gap-6 text-center text-xs text-white/60 border-t border-white/10">
                <div className="border-t border-dashed border-white/20 pt-2">
                  <p className="font-bold text-white">Senior Geomatics Engineer</p>
                  <p className="text-[10px] opacity-50">Map Datum & Projection Verified</p>
                </div>
                <div className="border-t border-dashed border-white/20 pt-2">
                  <p className="font-bold text-white">Chief Exploration Geologist</p>
                  <p className="text-[10px] opacity-50">Stratigraphy & Mineral Boundaries</p>
                </div>
                <div className="border-t border-dashed border-white/20 pt-2">
                  <p className="font-bold text-white">Mines Manager / Director</p>
                  <p className="text-[10px] opacity-50">Statutory DGMS Compliance Seal</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
