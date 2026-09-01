import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Ruler,
  Download,
  Trash2,
  Type,
  MapPin,
  Undo2,
  Redo2,
  RefreshCw,
  Layers,
  Check,
  Globe,
  Wifi,
  WifiOff,
  Lock,
  Unlock,
  Navigation
} from 'lucide-react';
import { GeoFeature, LatLon } from '../types';
import { lonLatToUtm, utmToLonLat, pointInPoly } from '../lib/geodesy';
import { downloadBlob } from '../lib/zip';
import { useIsDarkMode } from '../hooks/useIsDarkMode';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  getTileUrl,
  lonLatToTile,
  tileToBBox,
  globalTileCache,
  getOptimalZoomLevel,
  safeWorldToLonLat,
  ImageryProvider
} from '../lib/tileManager';
import { sensorManager } from '../lib/sensorResourceManager';

interface VectorRadarMapProps {
  features: GeoFeature[];
  zone?: number;
  south?: boolean;
  onFeaturesChange?: (updated: GeoFeature[]) => void;
  title?: string;
  isMapLocked?: boolean;
  onToggleMapLock?: () => void;
}

export const VectorRadarMap: React.FC<VectorRadarMapProps> = ({
  features: initialFeatures,
  zone = 45,
  south = false,
  onFeaturesChange,
  title = 'Interactive Vector Map',
  isMapLocked: externalMapLocked,
  onToggleMapLock
}) => {
  const isDark = useIsDarkMode();
  const isOnline = useOnlineStatus();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [features, setFeatures] = useState<GeoFeature[]>(initialFeatures);
  const [history, setHistory] = useState<GeoFeature[][]>([]);
  const [redoStack, setRedoStack] = useState<GeoFeature[][]>([]);

  const [scale, setScale] = useState<number>(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Map Lock state
  const [internalLocked, setInternalLocked] = useState(false);
  const isLocked = externalMapLocked !== undefined ? externalMapLocked : internalLocked;
  const toggleLock = () => {
    if (onToggleMapLock) onToggleMapLock();
    else setInternalLocked(l => !l);
  };

  // Live GPS Tracking State
  const [liveGps, setLiveGps] = useState<{ E: number; N: number; lon: number; lat: number; accuracy?: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const handleLocateMe = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    // Routed through the resource manager so the fix is recorded in the privacy
    // audit log and is covered by the master kill switch.
    sensorManager
      .requestOneTimeLocation('vector_radar_locate', 'Vector Radar Map \u2014 Locate me', {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      })
      .then(pos => {
        const lon = pos.coords.longitude;
        const lat = pos.coords.latitude;
        const u = lonLatToUtm(lon, lat, zone, south);
        setLiveGps({ E: u.E, N: u.N, lon, lat, accuracy: pos.coords.accuracy });
        setIsLocating(false);
        const cv = canvasRef.current;
        if (cv) {
          setScale(s => Math.max(0.5, s));
          setOffset({
            x: cv.width / 2 - u.E * scale,
            y: cv.height / 2 - u.N * scale
          });
        }
      })
      .catch(() => setIsLocating(false));
  };

  // Map Imagery State
  const [showBasemap, setShowBasemap] = useState<boolean>(false);
  const [basemapProvider, setBasemapProvider] = useState<ImageryProvider>('google_satellite');
  const [basemapOpacity, setBasemapOpacity] = useState<number>(0.85);
  const [, setRenderTick] = useState(0);

  const [hoveredIdx, setHoveredIdx] = useState<number>(-1);
  const [selectedIdx, setSelectedIdx] = useState<number>(-1);
  const [hoverTooltip, setHoverTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  const [editMode, setEditMode] = useState<'none' | 'select' | 'text' | 'marker'>('none');
  const [isRulerActive, setIsRulerActive] = useState(false);
  const [rulerPoints, setRulerPoints] = useState<{ E: number; N: number }[]>([]);
  const [colorBy, setColorBy] = useState<string>('none');

  // Touch Gesture Ref for Mobile Phones (no page zoom)
  const touchStateRef = useRef<{
    isPinching: boolean;
    startDist: number;
    startScale: number;
    startMid: { x: number; y: number };
    startOffset: { x: number; y: number };
    startTouch: { x: number; y: number };
    startTime: number;
    hasMoved: boolean;
  }>({
    isPinching: false,
    startDist: 0,
    startScale: 1,
    startMid: { x: 0, y: 0 },
    startOffset: { x: 0, y: 0 },
    startTouch: { x: 0, y: 0 },
    startTime: 0,
    hasMoved: false
  });

  // Sync with prop updates
  useEffect(() => {
    setFeatures(initialFeatures);
    setHistory([]);
    setRedoStack([]);
  }, [initialFeatures]);

  // Convert features to UTM Easting/Northing coordinates
  const enFeatures = React.useMemo(() => {
    return features.map(f => {
      const pts = f.pts.map(p => {
        if (f.kind === 'en') return { E: p.a, N: p.b };
        const u = lonLatToUtm(p.a, p.b, zone, south);
        return { E: u.E, N: u.N };
      });
      return { ...f, enPts: pts };
    });
  }, [features, zone, south]);

  // Calculate bounding box
  const bbox = React.useMemo(() => {
    let minE = Infinity, minN = Infinity, maxE = -Infinity, maxN = -Infinity;
    enFeatures.forEach(f => {
      f.enPts.forEach(p => {
        if (p.E < minE) minE = p.E;
        if (p.E > maxE) maxE = p.E;
        if (p.N < minN) minN = p.N;
        if (p.N > maxN) maxN = p.N;
      });
    });
    if (!isFinite(minE)) return null;
    return { minE, minN, maxE, maxN };
  }, [enFeatures]);

  // Auto-Fit map view
  const fitBounds = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv || !bbox) return;
    const pad = 30;
    const dx = bbox.maxE - bbox.minE || 100;
    const dy = bbox.maxN - bbox.minN || 100;
    const sc = Math.min((cv.width - 2 * pad) / dx, (cv.height - 2 * pad) / dy);
    setScale(sc);
    setOffset({
      x: (cv.width - dx * sc) / 2 - bbox.minE * sc,
      y: (cv.height - dy * sc) / 2 - bbox.minN * sc
    });
  }, [bbox]);

  useEffect(() => {
    fitBounds();
  }, [fitBounds]);

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

  // Draw canvas frame
  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, cv.width, cv.height);

    // Dynamic background for dark vs light mode
    ctx.fillStyle = isDark ? '#0f172a' : '#f8fafc';
    ctx.fillRect(0, 0, cv.width, cv.height);

    // 1. Satellite / Street Imagery Layer Background
    if (showBasemap && isOnline) {
      const tl = screenToWorld(0, 0, cv.height);
      const br = screenToWorld(cv.width, cv.height, cv.height);
      const minE = Math.min(tl.E, br.E);
      const maxE = Math.max(tl.E, br.E);
      const minN = Math.min(tl.N, br.N);
      const maxN = Math.max(tl.N, br.N);

      const swLL = safeWorldToLonLat(minE, minN, zone, south);
      const neLL = safeWorldToLonLat(maxE, maxN, zone, south);

      const centerLat = (swLL.lat + neLL.lat) / 2;
      const zoom = getOptimalZoomLevel(scale, centerLat);

      const minTile = lonLatToTile(Math.min(swLL.lon, neLL.lon), Math.max(swLL.lat, neLL.lat), zoom);
      const maxTile = lonLatToTile(Math.max(swLL.lon, neLL.lon), Math.min(swLL.lat, neLL.lat), zoom);

      ctx.save();
      ctx.globalAlpha = basemapOpacity;

      const minX = Math.max(0, Math.min(minTile.x, maxTile.x) - 1);
      const maxX = Math.min(Math.pow(2, zoom) - 1, Math.max(minTile.x, maxTile.x) + 1);
      const minY = Math.max(0, Math.min(minTile.y, maxTile.y) - 1);
      const maxY = Math.min(Math.pow(2, zoom) - 1, Math.max(minTile.y, maxTile.y) + 1);

      if ((maxX - minX + 1) * (maxY - minY + 1) <= 80) {
        for (let tx = minX; tx <= maxX; tx++) {
          for (let ty = minY; ty <= maxY; ty++) {
            const tileBBox = tileToBBox(tx, ty, zoom);
            const tileSW_utm = lonLatToUtm(tileBBox.minLon, tileBBox.minLat, zone, south);
            const tileNE_utm = lonLatToUtm(tileBBox.maxLon, tileBBox.maxLat, zone, south);

            const pTL = worldToScreen(tileSW_utm.E, tileNE_utm.N, cv.height);
            const pBR = worldToScreen(tileNE_utm.E, tileSW_utm.N, cv.height);

            const drawX = Math.min(pTL.x, pBR.x);
            const drawY = Math.min(pTL.y, pBR.y);
            const drawW = Math.abs(pBR.x - pTL.x);
            const drawH = Math.abs(pBR.y - pTL.y);

            if (
              drawX + drawW >= 0 &&
              drawX <= cv.width &&
              drawY + drawH >= 0 &&
              drawY <= cv.height &&
              drawW > 0 &&
              drawH > 0
            ) {
              const url = getTileUrl(basemapProvider, tx, ty, zoom);
              const cachedImg = globalTileCache.get(url, () => {
                setRenderTick(t => t + 1);
              });

              if (cachedImg) {
                try {
                  ctx.drawImage(cachedImg, drawX, drawY, drawW, drawH);
                } catch {}
              }
            }
          }
        }
      }
      ctx.restore();
    }

    if (!bbox) {
      ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No vector geometry loaded to display.', cv.width / 2, cv.height / 2);
      return;
    }

    // Grid lines (every 50m, 100m, 200m based on zoom)
    const worldPerPx = 1 / scale;
    const rawStep = worldPerPx * 80;
    const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / pow;
    const gridStep = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * pow;

    const tl = screenToWorld(0, 0, cv.height);
    const br = screenToWorld(cv.width, cv.height, cv.height);

    const e0 = Math.floor(Math.min(tl.E, br.E) / gridStep) * gridStep;
    const e1 = Math.ceil(Math.max(tl.E, br.E) / gridStep) * gridStep;
    const n0 = Math.floor(Math.min(tl.N, br.N) / gridStep) * gridStep;
    const n1 = Math.ceil(Math.max(tl.N, br.N) / gridStep) * gridStep;

    ctx.lineWidth = 1;
    ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.15)' : 'rgba(100, 116, 139, 0.22)';
    ctx.fillStyle = isDark ? 'rgba(148, 163, 184, 0.6)' : 'rgba(71, 85, 105, 0.75)';
    ctx.font = '10px Consolas, monospace';

    for (let e = e0; e <= e1; e += gridStep) {
      const scr = worldToScreen(e, 0, cv.height);
      ctx.beginPath();
      ctx.moveTo(scr.x, 0);
      ctx.lineTo(scr.x, cv.height);
      ctx.stroke();
      ctx.fillText(`E ${Math.round(e)}`, scr.x + 4, cv.height - 6);
    }

    for (let n = n0; n <= n1; n += gridStep) {
      const scr = worldToScreen(0, n, cv.height);
      ctx.beginPath();
      ctx.moveTo(0, scr.y);
      ctx.lineTo(cv.width, scr.y);
      ctx.stroke();
      ctx.fillText(`N ${Math.round(n)}`, 4, scr.y - 4);
    }

    // Draw features
    enFeatures.forEach((f, idx) => {
      const isHovered = idx === hoveredIdx;
      const isSelected = idx === selectedIdx;

      let strokeColor = isDark ? '#0e7c86' : '#0284c7';
      if (colorBy === 'geom') {
        strokeColor = f.geom === 'polygon' ? (isDark ? '#38bdf8' : '#0284c7') : f.geom === 'line' ? '#a855f7' : '#f59e0b';
      } else if (colorBy === 'status' && f.props?.status) {
        strokeColor = f.props.status === 'POSITIVE' ? '#22c55e' : '#ef4444';
      }

      if (isHovered || isSelected) strokeColor = '#f59e0b';

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isHovered || isSelected ? 3 : 1.8;

      if (f.geom === 'point') {
        f.enPts.forEach(p => {
          const scr = worldToScreen(p.E, p.N, cv.height);
          ctx.beginPath();
          ctx.arc(scr.x, scr.y, isHovered || isSelected ? 6 : 4, 0, Math.PI * 2);
          ctx.fillStyle = strokeColor;
          ctx.fill();
          ctx.strokeStyle = isDark ? '#ffffff' : '#0f172a';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Label
          if (f.name) {
            ctx.font = 'bold 11px Consolas, monospace';
            ctx.fillStyle = isDark ? '#ffffff' : '#0f172a';
            ctx.textAlign = 'center';
            ctx.fillText(f.name, scr.x, scr.y - 8);
          }
        });
      } else {
        ctx.beginPath();
        f.enPts.forEach((p, i) => {
          const scr = worldToScreen(p.E, p.N, cv.height);
          if (i === 0) ctx.moveTo(scr.x, scr.y);
          else ctx.lineTo(scr.x, scr.y);
        });

        if (f.geom === 'polygon') {
          ctx.closePath();
          ctx.fillStyle = isHovered || isSelected
            ? 'rgba(245, 158, 11, 0.25)'
            : (isDark ? 'rgba(14, 124, 134, 0.25)' : 'rgba(2, 132, 199, 0.15)');
          ctx.fill();
        }
        ctx.stroke();

        // Polygon Name Centroid
        if (f.name && f.geom === 'polygon') {
          let cx = 0, cy = 0;
          f.enPts.forEach(p => { cx += p.E; cy += p.N; });
          const scr = worldToScreen(cx / f.enPts.length, cy / f.enPts.length, cv.height);
          ctx.font = 'bold 11px sans-serif';
          ctx.fillStyle = isDark ? '#ffffff' : '#0f172a';
          ctx.textAlign = 'center';
          ctx.fillText(f.name, scr.x, scr.y);
        }
      }
    });

    // Draw Live GPS Pinpoint if available
    if (liveGps) {
      const p = worldToScreen(liveGps.E, liveGps.N, cv.height);
      const accPx = (liveGps.accuracy || 5) * scale;

      // Accuracy circle
      ctx.save();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(8, Math.min(200, accPx)), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Pinpoint dot
      ctx.fillStyle = '#38bdf8';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Label
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('LIVE GPS', p.x + 10, p.y - 4);
      ctx.restore();
    }

    // Draw Measurement Ruler
    if (rulerPoints.length > 0) {
      ctx.strokeStyle = '#ea580c';
      ctx.fillStyle = '#ea580c';
      ctx.lineWidth = 2;

      rulerPoints.forEach(pt => {
        const scr = worldToScreen(pt.E, pt.N, cv.height);
        ctx.beginPath();
        ctx.arc(scr.x, scr.y, 5, 0, Math.PI * 2);
        ctx.fill();
      });

      if (rulerPoints.length === 2) {
        const p1 = worldToScreen(rulerPoints[0].E, rulerPoints[0].N, cv.height);
        const p2 = worldToScreen(rulerPoints[1].E, rulerPoints[1].N, cv.height);

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        const dist = Math.hypot(rulerPoints[1].E - rulerPoints[0].E, rulerPoints[1].N - rulerPoints[0].N);
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const distStr = dist < 1000 ? `${dist.toFixed(2)} m` : `${(dist / 1000).toFixed(3)} km`;

        ctx.font = 'bold 12px sans-serif';
        const txtWidth = ctx.measureText(distStr).width + 12;
        ctx.fillStyle = isDark ? '#0f172a' : '#ffffff';
        ctx.fillRect(midX - txtWidth / 2, midY - 18, txtWidth, 20);
        ctx.strokeStyle = '#ea580c';
        ctx.strokeRect(midX - txtWidth / 2, midY - 18, txtWidth, 20);

        ctx.fillStyle = isDark ? '#ffffff' : '#0f172a';
        ctx.textAlign = 'center';
        ctx.fillText(distStr, midX, midY - 4);
      }
    }
  }, [bbox, scale, offset, enFeatures, hoveredIdx, selectedIdx, colorBy, rulerPoints, screenToWorld, worldToScreen, isDark]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Mouse / Touch handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (isRulerActive) {
      const w = screenToWorld(sx, sy, cv.height);
      if (rulerPoints.length >= 2) setRulerPoints([w]);
      else setRulerPoints(prev => [...prev, w]);
      return;
    }

    if (editMode === 'text') {
      const text = window.prompt('Enter label text to place on map:');
      if (text && text.trim()) {
        const w = screenToWorld(sx, sy, cv.height);
        pushHistory();
        const updated: GeoFeature[] = [
          ...features,
          { name: text.trim(), geom: 'point', kind: 'en', pts: [{ a: w.E, b: w.N }], props: { type: 'text' } }
        ];
        setFeatures(updated);
        onFeaturesChange?.(updated);
        setEditMode('none');
      }
      return;
    }

    if (editMode === 'marker') {
      const w = screenToWorld(sx, sy, cv.height);
      pushHistory();
      const updated: GeoFeature[] = [
        ...features,
        { name: `Point ${features.length + 1}`, geom: 'point', kind: 'en', pts: [{ a: w.E, b: w.N }], props: { type: 'marker' } }
      ];
      setFeatures(updated);
      onFeaturesChange?.(updated);
      setEditMode('none');
      return;
    }

    if (!isLocked) {
      setIsDragging(true);
      setLastMouse({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (!cv) return;

    if (isDragging && !isLocked) {
      const dx = e.clientX - lastMouse.x;
      const dy = e.clientY - lastMouse.y;
      setOffset(prev => ({ x: prev.x + dx, y: prev.y - dy }));
      setLastMouse({ x: e.clientX, y: e.clientY });
      return;
    }

    // Hover inspection
    const rect = cv.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    let hit = -1;
    for (let i = 0; i < enFeatures.length; i++) {
      const f = enFeatures[i];
      if (f.geom === 'point') {
        for (const p of f.enPts) {
          const scr = worldToScreen(p.E, p.N, cv.height);
          if (Math.hypot(sx - scr.x, sy - scr.y) < 10) {
            hit = i;
            break;
          }
        }
      } else if (f.geom === 'polygon') {
        const scrPts = f.enPts.map(p => {
          const s = worldToScreen(p.E, p.N, cv.height);
          return { x: s.x, y: s.y };
        });
        if (pointInPoly(sx, sy, scrPts)) {
          hit = i;
          break;
        }
      }
    }

    setHoveredIdx(hit);
    if (hit >= 0) {
      const feat = features[hit];
      setHoverTooltip({
        text: `${feat.name || '(unnamed)'} (${feat.geom.toUpperCase()})`,
        x: sx + 12,
        y: sy + 12
      });
    } else {
      setHoverTooltip(null);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (isLocked) return;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setScale(prev => Math.max(0.0001, prev * factor));
  };

  const pushHistory = () => {
    setHistory(prev => [...prev, features]);
    setRedoStack([]);
  };

  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setRedoStack(r => [features, ...r]);
    setHistory(h => h.slice(0, -1));
    setFeatures(prev);
    onFeaturesChange?.(prev);
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[0];
    setHistory(h => [...h, features]);
    setRedoStack(r => r.slice(1));
    setFeatures(next);
    onFeaturesChange?.(next);
  };

  const deleteSelected = () => {
    if (hoveredIdx >= 0) {
      pushHistory();
      const updated = features.filter((_, i) => i !== hoveredIdx);
      setFeatures(updated);
      onFeaturesChange?.(updated);
      setHoveredIdx(-1);
      setSelectedIdx(-1);
    }
  };

  const exportPNG = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dataUrl = cv.toDataURL('image/png');
    const bin = atob(dataUrl.split(',')[1]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    downloadBlob(arr, 'vector_map_snapshot.png', 'image/png');
  };

  // Touch Event Handlers for Mobile Phones
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();

      if (e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
        const midY = (t1.clientY + t2.clientY) / 2 - rect.top;

        touchStateRef.current = {
          isPinching: true,
          startDist: Math.max(10, dist),
          startScale: scale,
          startMid: { x: midX, y: midY },
          startOffset: { ...offset },
          startTouch: { x: midX, y: midY },
          startTime: Date.now(),
          hasMoved: false
        };
        setIsDragging(false);
        return;
      }

      if (e.touches.length === 1) {
        const t = e.touches[0];
        const sx = t.clientX - rect.left;
        const sy = t.clientY - rect.top;

        touchStateRef.current = {
          isPinching: false,
          startDist: 0,
          startScale: scale,
          startMid: { x: sx, y: sy },
          startOffset: { ...offset },
          startTouch: { x: sx, y: sy },
          startTime: Date.now(),
          hasMoved: false
        };
        setIsDragging(true);
        setLastMouse({ x: t.clientX, y: t.clientY });
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();

      if (e.touches.length === 2 && touchStateRef.current.isPinching) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const curMidX = (t1.clientX + t2.clientX) / 2 - rect.left;
        const curMidY = (t1.clientY + t2.clientY) / 2 - rect.top;

        const zoomRatio = dist / touchStateRef.current.startDist;
        const newScale = Math.max(0.0001, Math.min(100, touchStateRef.current.startScale * zoomRatio));

        const newOffsetX = curMidX - (touchStateRef.current.startMid.x - touchStateRef.current.startOffset.x) * (newScale / touchStateRef.current.startScale);
        const newOffsetY = curMidY - (touchStateRef.current.startMid.y - touchStateRef.current.startOffset.y) * (newScale / touchStateRef.current.startScale);

        setScale(newScale);
        setOffset({ x: newOffsetX, y: newOffsetY });
        touchStateRef.current.hasMoved = true;
        return;
      }

      if (e.touches.length === 1) {
        const t = e.touches[0];
        const sx = t.clientX - rect.left;
        const sy = t.clientY - rect.top;

        const distTouch = Math.hypot(sx - touchStateRef.current.startTouch.x, sy - touchStateRef.current.startTouch.y);
        if (distTouch > 5) {
          touchStateRef.current.hasMoved = true;
        }

        const dx = sx - touchStateRef.current.startTouch.x;
        const dy = sy - touchStateRef.current.startTouch.y;
        setOffset({
          x: touchStateRef.current.startOffset.x + dx,
          y: touchStateRef.current.startOffset.y - dy
        });
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      const duration = Date.now() - touchStateRef.current.startTime;

      if (!touchStateRef.current.hasMoved && duration < 300) {
        const rect = cv.getBoundingClientRect();
        const sx = touchStateRef.current.startTouch.x;
        const sy = touchStateRef.current.startTouch.y;
        const w = screenToWorld(sx, sy, cv.height);

        if (isRulerActive) {
          if (rulerPoints.length >= 2) setRulerPoints([w]);
          else setRulerPoints(prev => [...prev, w]);
        }
      }

      setIsDragging(false);
      touchStateRef.current.isPinching = false;
    };

    const onTouchCancel = (e: TouchEvent) => {
      e.preventDefault();
      setIsDragging(false);
      touchStateRef.current.isPinching = false;
    };

    cv.addEventListener('touchstart', onTouchStart, { passive: false });
    cv.addEventListener('touchmove', onTouchMove, { passive: false });
    cv.addEventListener('touchend', onTouchEnd, { passive: false });
    cv.addEventListener('touchcancel', onTouchCancel, { passive: false });

    return () => {
      cv.removeEventListener('touchstart', onTouchStart);
      cv.removeEventListener('touchmove', onTouchMove);
      cv.removeEventListener('touchend', onTouchEnd);
      cv.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [scale, offset, isRulerActive, rulerPoints, screenToWorld]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2 px-1">
        <div className="flex items-center gap-2">
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#c9a063]">
            {title} ({features.length} Features)
          </h4>
          {/* Map Imagery Toggle Checkbox */}
          <label className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-white/80 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showBasemap}
              onChange={e => setShowBasemap(e.target.checked)}
              className="rounded border-white/30 text-amber-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 bg-black/40"
            />
            <Globe className="w-3 h-3 text-cyan-400" />
            <span className="font-medium">Map Background</span>
          </label>

          {showBasemap && (
            <select
              value={basemapProvider}
              onChange={e => setBasemapProvider(e.target.value as ImageryProvider)}
              className="bg-black/60 text-white/90 border border-white/10 rounded px-1.5 py-0.5 text-[10px] font-mono"
            >
              <option value="google_satellite">Google Satellite</option>
              <option value="google_hybrid">Google Hybrid</option>
              <option value="google_streets">Google Streets</option>
              <option value="osm_standard">OpenStreetMap</option>
              <option value="opentopo">OpenTopoMap</option>
            </select>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setScale(s => s * 1.25)}
            className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-white/70 hover:text-white border border-white/5 text-xs transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setScale(s => s * 0.8)}
            className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-white/70 hover:text-white border border-white/5 text-xs transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={fitBounds}
            className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-white/70 hover:text-white border border-white/5 text-xs transition-colors"
            title="Fit Geometry"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setIsRulerActive(!isRulerActive);
              setRulerPoints([]);
            }}
            className={`p-1.5 rounded-lg text-xs flex items-center gap-1 font-semibold transition-all ${
              isRulerActive
                ? 'bg-[#c9a063] text-black font-bold'
                : 'bg-white/5 text-white/70 hover:text-white border border-white/5'
            }`}
            title="2-Click Distance Measurement Ruler"
          >
            <Ruler className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setEditMode(editMode === 'text' ? 'none' : 'text')}
            className={`p-1.5 rounded-lg text-xs transition-all ${
              editMode === 'text' ? 'bg-[#c9a063] text-black font-bold' : 'bg-white/5 text-white/70 hover:text-white border border-white/5'
            }`}
            title="Add text label on click"
          >
            <Type className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setEditMode(editMode === 'marker' ? 'none' : 'marker')}
            className={`p-1.5 rounded-lg text-xs transition-all ${
              editMode === 'marker' ? 'bg-[#c9a063] text-black font-bold' : 'bg-white/5 text-white/70 hover:text-white border border-white/5'
            }`}
            title="Add point marker on click"
          >
            <MapPin className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={deleteSelected}
            disabled={hoveredIdx < 0}
            className="p-1.5 bg-white/5 hover:bg-rose-950/50 text-white/70 hover:text-rose-300 disabled:opacity-30 rounded-lg text-xs border border-white/5 transition-colors"
            title="Delete hovered feature"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleLock}
            className={`p-1.5 rounded-lg text-xs flex items-center gap-1 font-semibold transition-all border ${
              isLocked
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                : 'bg-white/5 text-white/70 hover:text-white border-white/5'
            }`}
            title={isLocked ? 'Map Locked (Pan & Zoom frozen)' : 'Lock Map Position'}
          >
            {isLocked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleLocateMe}
            disabled={isLocating}
            className={`p-1.5 rounded-lg text-xs flex items-center gap-1 font-semibold transition-all border ${
              liveGps
                ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                : 'bg-white/5 text-white/70 hover:text-white border-white/5'
            }`}
            title="Live GPS Location Fix"
          >
            <Navigation className={`w-3.5 h-3.5 text-sky-400 ${isLocating ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={undo}
            disabled={history.length === 0}
            className="p-1.5 bg-white/5 text-white/70 hover:text-white disabled:opacity-30 rounded-lg text-xs border border-white/5 transition-colors"
            title="Undo"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={redo}
            disabled={redoStack.length === 0}
            className="p-1.5 bg-white/5 text-white/70 hover:text-white disabled:opacity-30 rounded-lg text-xs border border-white/5 transition-colors"
            title="Redo"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={exportPNG}
            className="p-1.5 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-lg text-xs flex items-center gap-1 font-medium border border-white/5 transition-colors"
            title="Export PNG snapshot"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 shadow-2xl bg-slate-100 dark:bg-[#0a0a0a] touch-none select-none overscroll-none">
        <canvas
          ref={canvasRef}
          width={720}
          height={380}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          style={{ touchAction: 'none' }}
          className="w-full h-80 bg-slate-50 dark:bg-[#0a0a0a] cursor-crosshair block touch-none select-none"
        />

        {/* Floating Touch Zoom Buttons */}
        <div className="absolute bottom-3 left-3 flex flex-col gap-1 z-20">
          <button
            onClick={() => setScale(s => s * 1.25)}
            className="w-7 h-7 rounded-lg bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/20 text-white flex items-center justify-center text-xs shadow-md active:scale-95 transition-transform"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setScale(s => s * 0.8)}
            className="w-7 h-7 rounded-lg bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/20 text-white flex items-center justify-center text-xs shadow-md active:scale-95 transition-transform"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Hover Tooltip */}
        {hoverTooltip && (
          <div
            className="absolute z-20 px-3 py-1.5 bg-[#0f0f0f]/95 border border-white/10 text-white rounded-lg text-xs font-mono shadow-2xl pointer-events-none"
            style={{ left: hoverTooltip.x, top: hoverTooltip.y }}
          >
            {hoverTooltip.text}
          </div>
        )}
      </div>
    </div>
  );
};
