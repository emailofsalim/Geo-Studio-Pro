import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GisLayer, GeoFeature } from '../../types';
import { GisTool, SelectedFeatureRef, SnapTarget, VertexDragState, FeatureMoveState, MidpointHandle } from './gisTypes';
import { findSnapTarget } from './gisHelpers';
import { lonLatToUtm, utmToLonLat, polygonAreaPerimeter, pointInPoly } from '../../lib/geodesy';
import { computePolygonCentroid } from '../../lib/spatialAnalysis';
import {
  ImageryLayerConfig,
  getOptimalZoomLevel,
  lonLatToTile,
  tileToBBox,
  getTileUrl,
  globalTileCache,
  SolarPosition,
  sampleElevation
} from '../../lib/tileManager';
import { Compass, Wifi, WifiOff, RotateCcw, ZoomIn, ZoomOut, Maximize2, Lock, Unlock } from 'lucide-react';

interface GisMapCanvasProps {
  layers: GisLayer[];
  activeLayer: GisLayer;
  activeTool: GisTool;
  scale: number;
  offset: { x: number; y: number };
  onUpdateScaleOffset: (scale: number, offset: { x: number; y: number }) => void;
  selectedFeature: SelectedFeatureRef | null;
  onSelectFeature: (sel: SelectedFeatureRef | null) => void;
  snapEnabled: boolean;
  snapGrid: boolean;
  showGrid: boolean;
  showLabels: boolean;
  basemapTheme: string;
  zNum: number;
  isSouth: boolean;
  measurePts: { E: number; N: number }[];
  onUpdateMeasurePts: (pts: { E: number; N: number }[]) => void;
  drawnPts: { E: number; N: number }[];
  onUpdateDrawnPts: (pts: { E: number; N: number }[]) => void;
  onAddPointFeature: (pt: { E: number; N: number }) => void;
  onModifyFeatureVertices: (layerId: string, featureIdx: number, newPts: { a: number; b: number }[], description: string) => void;
  onCursorChange: (coord: { E: number; N: number; lon: number; lat: number } | null) => void;
  // Satellite Imagery & Google Earth Props
  imageryConfig: ImageryLayerConfig;
  isOnline: boolean;
  pitchDeg: number;
  onUpdatePitchDeg: (pitch: number) => void;
  headingDeg: number;
  onUpdateHeadingDeg: (heading: number) => void;
  solarPos: SolarPosition;
  solarEnabled: boolean;
  // Map Lock & Live Location Marker
  isMapLocked?: boolean;
  liveGps?: { E: number; N: number; lon: number; lat: number; accuracy?: number } | null;
}

export const GisMapCanvas: React.FC<GisMapCanvasProps> = ({
  layers,
  activeLayer,
  activeTool,
  scale,
  offset,
  onUpdateScaleOffset,
  selectedFeature,
  onSelectFeature,
  snapEnabled,
  snapGrid,
  showGrid,
  showLabels,
  basemapTheme,
  zNum,
  isSouth,
  measurePts,
  onUpdateMeasurePts,
  drawnPts,
  onUpdateDrawnPts,
  onAddPointFeature,
  onModifyFeatureVertices,
  onCursorChange,
  imageryConfig,
  isOnline,
  pitchDeg,
  onUpdatePitchDeg,
  headingDeg,
  onUpdateHeadingDeg,
  solarPos,
  solarEnabled,
  isMapLocked = false,
  liveGps = null
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Interaction State
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Touch Gesture Ref for Mobile (prevents whole app page zoom)
  const touchStateRef = useRef<{
    isPinching: boolean;
    startDist: number;
    startScale: number;
    startMid: { x: number; y: number };
    startOffset: { x: number; y: number };
    startTouch: { x: number; y: number };
    startTime: number;
    hasMoved: boolean;
    vertexDrag: VertexDragState | null;
    isPanning: boolean;
  }>({
    isPinching: false,
    startDist: 0,
    startScale: 1,
    startMid: { x: 0, y: 0 },
    startOffset: { x: 0, y: 0 },
    startTouch: { x: 0, y: 0 },
    startTime: 0,
    hasMoved: false,
    vertexDrag: null,
    isPanning: false
  });

  // Vertex Grip Drag State
  const [vertexDrag, setVertexDrag] = useState<VertexDragState | null>(null);
  // Feature Translation Drag State
  const [featureMove, setFeatureMove] = useState<FeatureMoveState | null>(null);
  // Hovered vertex / midpoint info for cursor cues
  const [hoveredVertex, setHoveredVertex] = useState<{ layerId: string; featureIdx: number; vertexIdx: number } | null>(null);
  const [hoveredMidpoint, setHoveredMidpoint] = useState<MidpointHandle | null>(null);
  // Active Snap Target
  const [activeSnap, setActiveSnap] = useState<SnapTarget | null>(null);

  // Async Tile Render Trigger
  const [, setRenderTick] = useState(0);

  // Current Hovered World Coords for HUD
  const [liveCoord, setLiveCoord] = useState<{ E: number; N: number; lon: number; lat: number; elev: number } | null>(null);

  // Coordinate Conversion Helpers (With 3D Perspective & Azimuth Heading Transformation)
  const worldToScreen = useCallback(
    (E: number, N: number, cvHeight: number, cvWidth: number = 800): { x: number; y: number; visible: boolean } => {
      // 2D Orthographic mode
      if (pitchDeg === 0 && headingDeg === 0) {
        const x = E * scale + offset.x;
        const y = cvHeight - (N * scale + offset.y);
        return { x, y, visible: true };
      }

      // 3D Perspective Camera Projection
      const centerE = (cvWidth / 2 - offset.x) / scale;
      const centerN = (cvHeight / 2 - offset.y) / scale;

      const dE = E - centerE;
      const dN = N - centerN;

      const headRad = (-headingDeg * Math.PI) / 180;
      const pitchRad = (pitchDeg * Math.PI) / 180;

      // Rotate around center
      const rotE = dE * Math.cos(headRad) - dN * Math.sin(headRad);
      const rotN = dE * Math.sin(headRad) + dN * Math.cos(headRad);

      // Pitch foreshortening & perspective depth
      const focalDist = 800;
      const zCam = rotN * Math.sin(pitchRad) * scale + focalDist;

      if (zCam <= 80) {
        return { x: -9999, y: -9999, visible: false };
      }

      const factor = focalDist / zCam;
      const sx = cvWidth / 2 + (rotE * scale) * factor;
      const sy = cvHeight / 2 - (rotN * Math.cos(pitchRad) * scale) * factor;

      return { x: sx, y: sy, visible: true };
    },
    [offset, scale, pitchDeg, headingDeg]
  );

  const screenToWorld = useCallback(
    (sx: number, sy: number, cvHeight: number, cvWidth: number = 800): { E: number; N: number } => {
      if (pitchDeg === 0 && headingDeg === 0) {
        const E = (sx - offset.x) / scale;
        const N = (cvHeight - sy - offset.y) / scale;
        return { E, N };
      }

      // Inverse 3D Camera Projection (Plane Raycast to ground)
      const centerE = (cvWidth / 2 - offset.x) / scale;
      const centerN = (cvHeight / 2 - offset.y) / scale;

      const headRad = (headingDeg * Math.PI) / 180;
      const pitchRad = (pitchDeg * Math.PI) / 180;

      const focalDist = 800;
      const dy = cvHeight / 2 - sy;
      const dx = sx - cvWidth / 2;

      const cosP = Math.cos(pitchRad);
      const sinP = Math.sin(pitchRad);

      const denom = (cosP * focalDist + dy * sinP);
      if (Math.abs(denom) < 0.001) return { E: centerE, N: centerN };

      const rotN = (dy * focalDist) / (scale * denom);
      const factor = focalDist / (rotN * sinP * scale + focalDist);
      const rotE = dx / (scale * factor);

      const E = centerE + (rotE * Math.cos(headRad) - rotN * Math.sin(headRad));
      const N = centerN + (rotE * Math.sin(headRad) + rotN * Math.cos(headRad));

      return { E, N };
    },
    [offset, scale, pitchDeg, headingDeg]
  );

  // Synchronize internal canvas width/height with container bounding box
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let rAFId: number | null = null;
    const observer = new ResizeObserver(entries => {
      if (rAFId !== null) cancelAnimationFrame(rAFId);
      rAFId = requestAnimationFrame(() => {
        if (!entries || entries.length === 0) return;
        const entry = entries[0];
        const w = Math.round(entry.contentRect.width);
        const h = Math.round(entry.contentRect.height);
        if (w > 0 && h > 0) {
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
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

  // Main Canvas Render Engine
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, cv.width, cv.height);

    // 1. Basemap Background Fill
    if (!imageryConfig.enabled) {
      if (basemapTheme === 'dark_obsidian') {
        ctx.fillStyle = '#0a0d14';
      } else if (basemapTheme === 'blueprint') {
        ctx.fillStyle = '#0f172a';
      } else if (basemapTheme === 'parchment') {
        ctx.fillStyle = '#1c1917';
      } else {
        ctx.fillStyle = '#f8fafc';
      }
      ctx.fillRect(0, 0, cv.width, cv.height);
    } else {
      // Dark base under satellite tiles
      ctx.fillStyle = '#05070a';
      ctx.fillRect(0, 0, cv.width, cv.height);
    }

    // ---------------- SATELLITE / GOOGLE MAPS TILE ENGINE ----------------
    if (imageryConfig.enabled && isOnline) {
      const centerW = screenToWorld(cv.width / 2, cv.height / 2, cv.height, cv.width);
      const centerLL = utmToLonLat(centerW.E, centerW.N, zNum, isSouth);
      const zoom = getOptimalZoomLevel(scale, centerLL.lat);

      // Compute bounding corners in UTM
      const c1 = screenToWorld(0, 0, cv.height, cv.width);
      const c2 = screenToWorld(cv.width, 0, cv.height, cv.width);
      const c3 = screenToWorld(0, cv.height, cv.height, cv.width);
      const c4 = screenToWorld(cv.width, cv.height, cv.height, cv.width);

      const allE = [c1.E, c2.E, c3.E, c4.E];
      const allN = [c1.N, c2.N, c3.N, c4.N];
      const minE = Math.min(...allE);
      const maxE = Math.max(...allE);
      const minN = Math.min(...allN);
      const maxN = Math.max(...allN);

      const llMin = utmToLonLat(minE, minN, zNum, isSouth);
      const llMax = utmToLonLat(maxE, maxN, zNum, isSouth);

      const tMin = lonLatToTile(Math.min(llMin.lon, llMax.lon), Math.max(llMin.lat, llMax.lat), zoom);
      const tMax = lonLatToTile(Math.max(llMin.lon, llMax.lon), Math.min(llMin.lat, llMax.lat), zoom);

      // Limit tile span to max 36 tiles for performance
      const minX = Math.max(0, Math.min(tMin.x, tMax.x) - 1);
      const maxX = Math.min(Math.pow(2, zoom) - 1, Math.max(tMin.x, tMax.x) + 1);
      const minY = Math.max(0, Math.min(tMin.y, tMax.y) - 1);
      const maxY = Math.min(Math.pow(2, zoom) - 1, Math.max(tMin.y, tMax.y) + 1);

      const totalTiles = (maxX - minX + 1) * (maxY - minY + 1);

      if (totalTiles <= 49) {
        ctx.save();
        ctx.globalAlpha = imageryConfig.opacity;
        ctx.filter = `brightness(${imageryConfig.brightness}) contrast(${imageryConfig.contrast})`;

        for (let tx = minX; tx <= maxX; tx++) {
          for (let ty = minY; ty <= maxY; ty++) {
            const url = getTileUrl(imageryConfig.provider, tx, ty, zoom);
            const img = globalTileCache.get(url, () => {
              setRenderTick(t => t + 1);
            });

            if (img) {
              const bbox = tileToBBox(tx, ty, zoom);
              const utmTopLeft = lonLatToUtm(bbox.minLon, bbox.maxLat, zNum, isSouth);
              const utmBottomRight = lonLatToUtm(bbox.maxLon, bbox.minLat, zNum, isSouth);

              const pTL = worldToScreen(utmTopLeft.E, utmTopLeft.N, cv.height, cv.width);
              const pBR = worldToScreen(utmBottomRight.E, utmBottomRight.N, cv.height, cv.width);

              if (pTL.visible && pBR.visible) {
                const w = pBR.x - pTL.x;
                const h = pBR.y - pTL.y;
                if (w > 0 && h > 0) {
                  try {
                    ctx.drawImage(img, pTL.x, pTL.y, w, h);
                  } catch {}
                }
              }
            }
          }
        }
        ctx.restore();
      }
    }

    // 2. Graticule / UTM Grid
    if (showGrid) {
      ctx.strokeStyle = imageryConfig.enabled
        ? 'rgba(255, 255, 255, 0.2)'
        : basemapTheme === 'blueprint'
        ? 'rgba(56, 189, 248, 0.12)'
        : basemapTheme === 'light_topo'
        ? 'rgba(0, 0, 0, 0.08)'
        : 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 1;

      const stepM = Math.max(20, Math.pow(10, Math.floor(Math.log10(150 / scale))));
      const leftW = screenToWorld(0, 0, cv.height, cv.width);
      const rightW = screenToWorld(cv.width, cv.height, cv.height, cv.width);
      const startE = Math.floor(Math.min(leftW.E, rightW.E) / stepM) * stepM;
      const endE = Math.ceil(Math.max(leftW.E, rightW.E) / stepM) * stepM;
      const startN = Math.floor(Math.min(leftW.N, rightW.N) / stepM) * stepM;
      const endN = Math.ceil(Math.max(leftW.N, rightW.N) / stepM) * stepM;

      ctx.beginPath();
      for (let e = startE; e <= endE; e += stepM) {
        const p1 = worldToScreen(e, startN, cv.height, cv.width);
        const p2 = worldToScreen(e, endN, cv.height, cv.width);
        if (p1.visible && p2.visible) {
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
        }
      }
      for (let n = startN; n <= endN; n += stepM) {
        const p1 = worldToScreen(startE, n, cv.height, cv.width);
        const p2 = worldToScreen(endE, n, cv.height, cv.width);
        if (p1.visible && p2.visible) {
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
        }
      }
      ctx.stroke();

      // Coordinates text along borders
      ctx.fillStyle = imageryConfig.enabled
        ? 'rgba(255, 255, 255, 0.7)'
        : basemapTheme === 'light_topo'
        ? 'rgba(0, 0, 0, 0.45)'
        : 'rgba(255, 255, 255, 0.35)';
      ctx.font = '9px monospace';
      for (let e = startE; e <= endE; e += stepM) {
        const scP = worldToScreen(e, startN, cv.height, cv.width);
        if (scP.visible && scP.x >= 20 && scP.x <= cv.width - 60) {
          ctx.fillText(`${(e / 1000).toFixed(1)}k E`, scP.x + 3, cv.height - 6);
        }
      }
    }

    // 3. Render Vector Features (Polygons, Lines, Points)
    layers.forEach(layer => {
      if (!layer.visible) return;

      layer.features.forEach((feat, fIdx) => {
        const isSelected =
          selectedFeature &&
          selectedFeature.layerId === layer.id &&
          selectedFeature.featureIdx === fIdx;

        let pts = feat.pts.map(p => {
          if (feat.kind === 'en') return { E: p.a, N: p.b };
          const u = lonLatToUtm(p.a, p.b, zNum, isSouth);
          return { E: u.E, N: u.N };
        });

        if (pts.length === 0) return;

        // Solar Shadow simulation under polygon features
        if (solarEnabled && feat.geom === 'polygon') {
          ctx.save();
          const shOffX = solarPos.shadowVector.x * solarPos.shadowLengthRatio * 4;
          const shOffY = solarPos.shadowVector.y * solarPos.shadowLengthRatio * 4;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.beginPath();
          pts.forEach((p, i) => {
            const sc = worldToScreen(p.E, p.N, cv.height, cv.width);
            if (i === 0) ctx.moveTo(sc.x + shOffX, sc.y + shOffY);
            else ctx.lineTo(sc.x + shOffX, sc.y + shOffY);
          });
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        // Render Geometry
        if (feat.geom === 'polygon' && pts.length >= 3) {
          // Fill
          ctx.save();
          ctx.beginPath();
          pts.forEach((p, i) => {
            const scPos = worldToScreen(p.E, p.N, cv.height, cv.width);
            if (i === 0) ctx.moveTo(scPos.x, scPos.y);
            else ctx.lineTo(scPos.x, scPos.y);
          });
          ctx.closePath();

          ctx.fillStyle = layer.fillColor || layer.color;
          ctx.globalAlpha = isSelected ? 0.45 : layer.fillOpacity || 0.25;
          ctx.fill();
          ctx.restore();

          // Stroke
          ctx.beginPath();
          pts.forEach((p, i) => {
            const scPos = worldToScreen(p.E, p.N, cv.height, cv.width);
            if (i === 0) ctx.moveTo(scPos.x, scPos.y);
            else ctx.lineTo(scPos.x, scPos.y);
          });
          ctx.closePath();
          ctx.strokeStyle = isSelected ? '#fbbf24' : layer.color;
          ctx.lineWidth = isSelected ? (layer.strokeWidth || 2) + 1.5 : layer.strokeWidth || 2;
          ctx.stroke();

          // Centroid Label
          if (showLabels && feat.name) {
            const cent = computePolygonCentroid(pts.map(p => ({ x: p.E, y: p.N })));
            const scCent = worldToScreen(cent.x, cent.y, cv.height, cv.width);
            if (scCent.visible) {
              ctx.save();
              ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
              ctx.font = 'bold 10px sans-serif';
              ctx.textAlign = 'center';
              const textW = ctx.measureText(feat.name).width;
              ctx.fillRect(scCent.x - textW / 2 - 4, scCent.y - 12, textW + 8, 16);

              ctx.fillStyle = isSelected ? '#fbbf24' : '#ffffff';
              ctx.fillText(feat.name, scCent.x, scCent.y);
              ctx.restore();
            }
          }
        } else if (feat.geom === 'line') {
          ctx.beginPath();
          pts.forEach((p, i) => {
            const scPos = worldToScreen(p.E, p.N, cv.height, cv.width);
            if (i === 0) ctx.moveTo(scPos.x, scPos.y);
            else ctx.lineTo(scPos.x, scPos.y);
          });
          ctx.strokeStyle = isSelected ? '#fbbf24' : layer.color;
          ctx.lineWidth = isSelected ? (layer.strokeWidth || 2) + 1.5 : layer.strokeWidth || 2;
          ctx.stroke();

          if (showLabels && feat.name) {
            const midP = pts[Math.floor(pts.length / 2)];
            const scMid = worldToScreen(midP.E, midP.N, cv.height, cv.width);
            if (scMid.visible) {
              ctx.save();
              ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
              ctx.font = '9px sans-serif';
              const textW = ctx.measureText(feat.name).width;
              ctx.fillRect(scMid.x + 4, scMid.y - 14, textW + 6, 14);

              ctx.fillStyle = isSelected ? '#fbbf24' : '#ffffff';
              ctx.fillText(feat.name, scMid.x + 7, scMid.y - 4);
              ctx.restore();
            }
          }
        } else if (feat.geom === 'point') {
          pts.forEach(p => {
            const scPos = worldToScreen(p.E, p.N, cv.height, cv.width);
            if (scPos.visible) {
              ctx.beginPath();
              ctx.arc(scPos.x, scPos.y, isSelected ? 7 : 5, 0, Math.PI * 2);
              ctx.fillStyle = isSelected ? '#fbbf24' : layer.color;
              ctx.fill();
              ctx.lineWidth = 1.5;
              ctx.strokeStyle = '#ffffff';
              ctx.stroke();

              if (showLabels && feat.name) {
                ctx.save();
                ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
                ctx.font = 'bold 9px monospace';
                const textW = ctx.measureText(feat.name).width;
                ctx.fillRect(scPos.x + 6, scPos.y - 8, textW + 6, 14);

                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'left';
                ctx.fillText(feat.name, scPos.x + 9, scPos.y + 2);
                ctx.restore();
              }
            }
          });
        }

        // 4. Render Interactive Vertex Grips if selected or in edit_vertex mode
        if (isSelected || activeTool === 'edit_vertex') {
          pts.forEach((p, vIdx) => {
            const scPos = worldToScreen(p.E, p.N, cv.height, cv.width);
            if (scPos.visible) {
              const isHovered =
                hoveredVertex &&
                hoveredVertex.layerId === layer.id &&
                hoveredVertex.featureIdx === fIdx &&
                hoveredVertex.vertexIdx === vIdx;

              ctx.beginPath();
              ctx.arc(scPos.x, scPos.y, isHovered ? 6.5 : 4.5, 0, Math.PI * 2);
              ctx.fillStyle = isHovered ? '#f59e0b' : '#ffffff';
              ctx.fill();
              ctx.strokeStyle = '#000000';
              ctx.lineWidth = 1.5;
              ctx.stroke();

              // Vertex index badge on hover
              if (isHovered) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
                ctx.fillRect(scPos.x + 8, scPos.y - 18, 50, 16);
                ctx.fillStyle = '#f59e0b';
                ctx.font = 'bold 9px monospace';
                ctx.fillText(`Node #${vIdx + 1}`, scPos.x + 12, scPos.y - 6);
              }
            }
          });

          // Render Midpoint '+' handles for inserting vertices
          if (activeTool === 'edit_vertex' && (feat.geom === 'line' || feat.geom === 'polygon')) {
            const numSegments = feat.geom === 'polygon' ? pts.length : pts.length - 1;
            for (let i = 0; i < numSegments; i++) {
              const p1 = pts[i];
              const p2 = pts[(i + 1) % pts.length];
              const midE = (p1.E + p2.E) / 2;
              const midN = (p1.N + p2.N) / 2;
              const scMid = worldToScreen(midE, midN, cv.height, cv.width);

              if (scMid.visible) {
                const isHoveredMid =
                  hoveredMidpoint &&
                  hoveredMidpoint.layerId === layer.id &&
                  hoveredMidpoint.featureIdx === fIdx &&
                  hoveredMidpoint.insertAfterIdx === i;

                ctx.beginPath();
                ctx.arc(scMid.x, scMid.y, isHoveredMid ? 5 : 3.5, 0, Math.PI * 2);
                ctx.fillStyle = isHoveredMid ? '#10b981' : 'rgba(16, 185, 129, 0.6)';
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.stroke();
              }
            }
          }
        }
      });
    });

    // 5. Render Active Measure Polyline
    if (measurePts.length > 0) {
      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      measurePts.forEach((p, i) => {
        const scPos = worldToScreen(p.E, p.N, cv.height, cv.width);
        if (i === 0) ctx.moveTo(scPos.x, scPos.y);
        else ctx.lineTo(scPos.x, scPos.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      measurePts.forEach((p, idx) => {
        const scPos = worldToScreen(p.E, p.N, cv.height, cv.width);
        if (scPos.visible) {
          ctx.beginPath();
          ctx.arc(scPos.x, scPos.y, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = '#ec4899';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();

          if (idx > 0) {
            const prev = measurePts[idx - 1];
            const dist = Math.hypot(p.E - prev.E, p.N - prev.N);
            const midSc = worldToScreen((p.E + prev.E) / 2, (p.N + prev.N) / 2, cv.height, cv.width);
            if (midSc.visible) {
              ctx.save();
              ctx.fillStyle = 'rgba(0,0,0,0.8)';
              ctx.fillRect(midSc.x + 2, midSc.y - 14, 50, 14);
              ctx.fillStyle = '#ec4899';
              ctx.font = 'bold 9px monospace';
              ctx.fillText(`${dist.toFixed(1)}m`, midSc.x + 5, midSc.y - 3);
              ctx.restore();
            }
          }
        }
      });
    }

    // 6. Render Active Digitizing Points
    if (drawnPts.length > 0) {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      drawnPts.forEach((p, i) => {
        const scPos = worldToScreen(p.E, p.N, cv.height, cv.width);
        if (i === 0) ctx.moveTo(scPos.x, scPos.y);
        else ctx.lineTo(scPos.x, scPos.y);
      });
      if (activeTool === 'draw_poly' && drawnPts.length > 2) {
        ctx.closePath();
      }
      ctx.stroke();

      drawnPts.forEach(p => {
        const scPos = worldToScreen(p.E, p.N, cv.height, cv.width);
        if (scPos.visible) {
          ctx.beginPath();
          ctx.arc(scPos.x, scPos.y, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = '#10b981';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });
    }

    // 7. Render Magnetic Snap Halo
    if (activeSnap) {
      const snapSc = worldToScreen(activeSnap.E, activeSnap.N, cv.height, cv.width);
      if (snapSc.visible) {
        ctx.beginPath();
        ctx.arc(snapSc.x, snapSc.y, 9, 0, Math.PI * 2);
        ctx.strokeStyle = activeSnap.type === 'vertex' ? '#06b6d4' : activeSnap.type === 'midpoint' ? '#10b981' : '#f59e0b';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(snapSc.x, snapSc.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
    }

    // 8. Render Live GPS Real-Time Location Marker
    if (liveGps) {
      const gpsSc = worldToScreen(liveGps.E, liveGps.N, cv.height, cv.width);
      if (gpsSc.visible) {
        // Draw accuracy circle in meters if available
        if (liveGps.accuracy && liveGps.accuracy > 0) {
          const accRadiusPx = Math.max(12, liveGps.accuracy * scale);
          ctx.beginPath();
          ctx.arc(gpsSc.x, gpsSc.y, accRadiusPx, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Pulsing radar ripple halo
        ctx.beginPath();
        ctx.arc(gpsSc.x, gpsSc.y, 16, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
        ctx.fill();

        // Main Pinpoint Circle
        ctx.beginPath();
        ctx.arc(gpsSc.x, gpsSc.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#10b981';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Inner glowing core
        ctx.beginPath();
        ctx.arc(gpsSc.x, gpsSc.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Pinpoint Label Pill
        ctx.save();
        ctx.fillStyle = 'rgba(6, 78, 59, 0.9)';
        ctx.strokeStyle = 'rgba(52, 211, 153, 0.8)';
        ctx.lineWidth = 1;
        const lbl = `LIVE GPS (±${(liveGps.accuracy || 3).toFixed(1)}m)`;
        ctx.font = 'bold 9px monospace';
        const tW = ctx.measureText(lbl).width;
        ctx.fillRect(gpsSc.x - tW / 2 - 4, gpsSc.y - 24, tW + 8, 14);
        ctx.strokeRect(gpsSc.x - tW / 2 - 4, gpsSc.y - 24, tW + 8, 14);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(lbl, gpsSc.x, gpsSc.y - 14);
        ctx.restore();
      }
    }

    // 9. North Arrow & Scale Bar HUD
    ctx.save();
    const naX = 32, naY = 38;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.arc(naX, naY, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.translate(naX, naY);
    ctx.rotate((-headingDeg * Math.PI) / 180);

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.lineTo(-4.5, 0);
    ctx.lineTo(0, -3);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.lineTo(4.5, 0);
    ctx.lineTo(0, -3);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', 0, -17);
    ctx.restore();

    // Scale Bar
    const sbX = 66, sbY = 38;
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
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      groundMeters >= 1000 ? `${(groundMeters / 1000).toFixed(2)} km` : `${groundMeters.toFixed(0)} m`,
      sbX + barWidthPx / 2,
      sbY - 6
    );
    ctx.restore();
  }, [
    layers,
    activeLayer,
    activeTool,
    scale,
    offset,
    selectedFeature,
    hoveredVertex,
    hoveredMidpoint,
    activeSnap,
    measurePts,
    drawnPts,
    showGrid,
    showLabels,
    basemapTheme,
    zNum,
    isSouth,
    imageryConfig,
    isOnline,
    pitchDeg,
    headingDeg,
    solarPos,
    solarEnabled,
    screenToWorld,
    worldToScreen
  ]);

  // Mouse Down Handling
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    let world = screenToWorld(sx, sy, cv.height, cv.width);

    // Apply snap target if available
    if (snapEnabled && activeSnap) {
      world = { E: activeSnap.E, N: activeSnap.N };
    }

    if (activeTool === 'pan' || e.button === 1 || e.buttons === 4) {
      if (isMapLocked) return;
      setIsPanning(true);
      setPanStart({ x: sx - offset.x, y: sy - offset.y });
      return;
    }

    // 1. Edit Vertex Mode
    if (activeTool === 'edit_vertex') {
      if (hoveredVertex) {
        const feat = layers.find(l => l.id === hoveredVertex.layerId)?.features[hoveredVertex.featureIdx];
        if (feat) {
          if (e.button === 2 || e.altKey) {
            e.preventDefault();
            if (feat.pts.length > (feat.geom === 'polygon' ? 3 : 2)) {
              const newPts = feat.pts.filter((_, idx) => idx !== hoveredVertex.vertexIdx);
              onModifyFeatureVertices(hoveredVertex.layerId, hoveredVertex.featureIdx, newPts, 'Deleted vertex node');
            }
            return;
          }

          const p = feat.pts[hoveredVertex.vertexIdx];
          setVertexDrag({
            layerId: hoveredVertex.layerId,
            featureIdx: hoveredVertex.featureIdx,
            vertexIdx: hoveredVertex.vertexIdx,
            startE: p.a,
            startN: p.b,
            currE: p.a,
            currN: p.b
          });
          return;
        }
      }

      if (hoveredMidpoint) {
        const feat = layers.find(l => l.id === hoveredMidpoint.layerId)?.features[hoveredMidpoint.featureIdx];
        if (feat) {
          const newPts = [...feat.pts];
          newPts.splice(hoveredMidpoint.insertAfterIdx + 1, 0, {
            a: hoveredMidpoint.E,
            b: hoveredMidpoint.N
          });
          onModifyFeatureVertices(
            hoveredMidpoint.layerId,
            hoveredMidpoint.featureIdx,
            newPts,
            'Inserted vertex node at segment midpoint'
          );
          return;
        }
      }
    }

    // 2. Select Tool
    if (activeTool === 'select') {
      let found: SelectedFeatureRef | null = null;
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
          } else if (f.geom === 'line') {
            for (let j = 0; j < pts.length - 1; j++) {
              const p1 = pts[j];
              const p2 = pts[j + 1];
              const distM = Math.hypot(p2.E - p1.E, p2.N - p1.N);
              if (distM > 0) {
                const perp = Math.abs((p2.N - p1.N) * world.E - (p2.E - p1.E) * world.N + p2.E * p1.N - p2.N * p1.E) / distM;
                if (perp < 15 / scale) {
                  found = { layerId: ly.id, featureIdx: i, feature: f };
                  break;
                }
              }
            }
          } else if (f.geom === 'point' && pts[0]) {
            const dist = Math.hypot(pts[0].E - world.E, pts[0].N - world.N);
            if (dist < 12 / scale) {
              found = { layerId: ly.id, featureIdx: i, feature: f };
              break;
            }
          }
        }
        if (found) break;
      }

      onSelectFeature(found);

      if (found) {
        setFeatureMove({
          layerId: found.layerId,
          featureIdx: found.featureIdx,
          startMouseE: world.E,
          startMouseN: world.N,
          originalPts: found.feature.pts.map(p => ({ ...p }))
        });
      }
      return;
    }

    // 3. Draw Tools
    if (activeTool === 'draw_point') {
      onAddPointFeature({ E: world.E, N: world.N });
    } else if (activeTool === 'draw_line' || activeTool === 'draw_poly') {
      onUpdateDrawnPts([...drawnPts, { E: world.E, N: world.N }]);
    } else if (activeTool === 'measure') {
      onUpdateMeasurePts([...measurePts, { E: world.E, N: world.N }]);
    }
  };

  // Mouse Move Handling
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy, cv.height, cv.width);
    const ll = utmToLonLat(world.E, world.N, zNum, isSouth);
    const elev = sampleElevation(ll.lon, ll.lat);

    setLiveCoord({ E: world.E, N: world.N, lon: ll.lon, lat: ll.lat, elev });
    onCursorChange({ E: world.E, N: world.N, lon: ll.lon, lat: ll.lat });

    if (isPanning) {
      onUpdateScaleOffset(scale, { x: sx - panStart.x, y: sy - panStart.y });
      return;
    }

    if (snapEnabled) {
      const snap = findSnapTarget(world.E, world.N, layers, scale, zNum, isSouth, 14, snapGrid, 50);
      setActiveSnap(snap);
    } else {
      setActiveSnap(null);
    }

    if (vertexDrag) {
      const targetE = activeSnap ? activeSnap.E : world.E;
      const targetN = activeSnap ? activeSnap.N : world.N;

      const layer = layers.find(l => l.id === vertexDrag.layerId);
      if (layer) {
        const feat = layer.features[vertexDrag.featureIdx];
        if (feat) {
          const newPts = feat.pts.map((p, idx) =>
            idx === vertexDrag.vertexIdx ? { a: targetE, b: targetN } : p
          );
          onModifyFeatureVertices(vertexDrag.layerId, vertexDrag.featureIdx, newPts, 'Drag adjusted vertex node');
        }
      }
      return;
    }

    if (featureMove) {
      const dE = world.E - featureMove.startMouseE;
      const dN = world.N - featureMove.startMouseN;
      const layer = layers.find(l => l.id === featureMove.layerId);
      if (layer) {
        const newPts = featureMove.originalPts.map(p => ({
          a: p.a + dE,
          b: p.b + dN
        }));
        onModifyFeatureVertices(featureMove.layerId, featureMove.featureIdx, newPts, 'Moved spatial feature');
      }
      return;
    }

    // Hover detection for vertices/midpoints
    let foundV: { layerId: string; featureIdx: number; vertexIdx: number } | null = null;
    let foundM: MidpointHandle | null = null;

    if (activeTool === 'edit_vertex' || activeTool === 'select') {
      for (const ly of layers) {
        if (!ly.visible) continue;
        for (let fIdx = 0; fIdx < ly.features.length; fIdx++) {
          const feat = ly.features[fIdx];
          for (let vIdx = 0; vIdx < feat.pts.length; vIdx++) {
            const p = feat.pts[vIdx];
            const distPx = Math.hypot(p.a - world.E, p.b - world.N) * scale;
            if (distPx < 8) {
              foundV = { layerId: ly.id, featureIdx: fIdx, vertexIdx: vIdx };
              break;
            }
          }
          if (foundV) break;

          if (activeTool === 'edit_vertex' && (feat.geom === 'line' || feat.geom === 'polygon')) {
            const numEdges = feat.geom === 'polygon' ? feat.pts.length : feat.pts.length - 1;
            for (let i = 0; i < numEdges; i++) {
              const p1 = feat.pts[i];
              const p2 = feat.pts[(i + 1) % feat.pts.length];
              const midE = (p1.a + p2.a) / 2;
              const midN = (p1.b + p2.b) / 2;
              const distPx = Math.hypot(midE - world.E, midN - world.N) * scale;
              if (distPx < 6) {
                foundM = { layerId: ly.id, featureIdx: fIdx, insertAfterIdx: i, E: midE, N: midN };
                break;
              }
            }
          }
          if (foundM) break;
        }
        if (foundV || foundM) break;
      }
    }

    setHoveredVertex(foundV);
    setHoveredMidpoint(foundM);
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setVertexDrag(null);
    setFeatureMove(null);
  };

  // Touch Event Handlers for Mobile with strict prevention of whole-app page zoom
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();

      if (e.touches.length === 2) {
        if (isMapLocked) return;
        // 2-Finger Pinch-to-Zoom
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
          hasMoved: false,
          vertexDrag: null,
          isPanning: false
        };
        setIsPanning(false);
        setVertexDrag(null);
        return;
      }

      if (e.touches.length === 1) {
        // 1-Finger Touch (Drag, Vertex Edit, Draw, Pan)
        const t = e.touches[0];
        const sx = t.clientX - rect.left;
        const sy = t.clientY - rect.top;
        const world = screenToWorld(sx, sy, cv.height, cv.width);

        // Check if touching near a vertex for vertex editing or feature selection
        let hitVertex: VertexDragState | null = null;
        if (activeTool === 'edit_vertex' || activeTool === 'select') {
          for (const ly of layers) {
            if (!ly.visible) continue;
            for (let fIdx = 0; fIdx < ly.features.length; fIdx++) {
              const feat = ly.features[fIdx];
              for (let vIdx = 0; vIdx < feat.pts.length; vIdx++) {
                const p = feat.pts[vIdx];
                const distPx = Math.hypot(p.a - world.E, p.b - world.N) * scale;
                // Generous 24px touch radius on mobile screens
                if (distPx < 24) {
                  hitVertex = {
                    layerId: ly.id,
                    featureIdx: fIdx,
                    vertexIdx: vIdx,
                    startE: p.a,
                    startN: p.b,
                    currE: p.a,
                    currN: p.b
                  };
                  break;
                }
              }
              if (hitVertex) break;
            }
            if (hitVertex) break;
          }
        }

        touchStateRef.current = {
          isPinching: false,
          startDist: 0,
          startScale: scale,
          startMid: { x: sx, y: sy },
          startOffset: { ...offset },
          startTouch: { x: sx, y: sy },
          startTime: Date.now(),
          hasMoved: false,
          vertexDrag: hitVertex,
          isPanning: !hitVertex && !isMapLocked
        };

        if (hitVertex) {
          setVertexDrag(hitVertex);
        } else if (!isMapLocked) {
          setIsPanning(true);
          setPanStart({ x: sx - offset.x, y: sy - offset.y });
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();

      if (e.touches.length === 2 && touchStateRef.current.isPinching) {
        // Pinch Zoom & Pan Math
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const curMidX = (t1.clientX + t2.clientX) / 2 - rect.left;
        const curMidY = (t1.clientY + t2.clientY) / 2 - rect.top;

        const zoomRatio = dist / touchStateRef.current.startDist;
        const newScale = Math.max(0.0001, Math.min(100, touchStateRef.current.startScale * zoomRatio));

        const newOffsetX = curMidX - (touchStateRef.current.startMid.x - touchStateRef.current.startOffset.x) * (newScale / touchStateRef.current.startScale);
        const newOffsetY = curMidY - (touchStateRef.current.startMid.y - touchStateRef.current.startOffset.y) * (newScale / touchStateRef.current.startScale);

        onUpdateScaleOffset(newScale, { x: newOffsetX, y: newOffsetY });
        touchStateRef.current.hasMoved = true;
        return;
      }

      if (e.touches.length === 1) {
        const t = e.touches[0];
        const sx = t.clientX - rect.left;
        const sy = t.clientY - rect.top;
        const world = screenToWorld(sx, sy, cv.height, cv.width);

        const distTouch = Math.hypot(sx - touchStateRef.current.startTouch.x, sy - touchStateRef.current.startTouch.y);
        if (distTouch > 5) {
          touchStateRef.current.hasMoved = true;
        }

        // Live Coordinate Readout for Mobile Touch
        const ll = utmToLonLat(world.E, world.N, zNum, isSouth);
        const elev = sampleElevation(ll.lon, ll.lat);
        setLiveCoord({ E: world.E, N: world.N, lon: ll.lon, lat: ll.lat, elev });
        onCursorChange({ E: world.E, N: world.N, lon: ll.lon, lat: ll.lat });

        if (touchStateRef.current.vertexDrag) {
          const vd = touchStateRef.current.vertexDrag;
          const targetE = world.E;
          const targetN = world.N;

          const layer = layers.find(l => l.id === vd.layerId);
          if (layer) {
            const feat = layer.features[vd.featureIdx];
            if (feat) {
              const newPts = feat.pts.map((p, idx) =>
                idx === vd.vertexIdx ? { a: targetE, b: targetN } : p
              );
              onModifyFeatureVertices(vd.layerId, vd.featureIdx, newPts, 'Drag adjusted vertex node');
            }
          }
          return;
        }

        // 1-Finger Smooth Panning
        if (touchStateRef.current.isPanning) {
          const dx = sx - touchStateRef.current.startTouch.x;
          const dy = sy - touchStateRef.current.startTouch.y;
          onUpdateScaleOffset(scale, {
            x: touchStateRef.current.startOffset.x + dx,
            y: touchStateRef.current.startOffset.y + dy
          });
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();
      const duration = Date.now() - touchStateRef.current.startTime;

      // Handle Tap Action (if finger was released without significant drag)
      if (!touchStateRef.current.hasMoved && duration < 350 && !touchStateRef.current.isPinching) {
        const sx = touchStateRef.current.startTouch.x;
        const sy = touchStateRef.current.startTouch.y;
        const world = screenToWorld(sx, sy, cv.height, cv.width);

        if (activeTool === 'draw_point') {
          onAddPointFeature({ E: world.E, N: world.N });
        } else if (activeTool === 'draw_line' || activeTool === 'draw_poly') {
          onUpdateDrawnPts([...drawnPts, { E: world.E, N: world.N }]);
        } else if (activeTool === 'measure') {
          onUpdateMeasurePts([...measurePts, { E: world.E, N: world.N }]);
        } else if (activeTool === 'select') {
          let found: SelectedFeatureRef | null = null;
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
              } else if (f.geom === 'line') {
                for (let j = 0; j < pts.length - 1; j++) {
                  const p1 = pts[j];
                  const p2 = pts[j + 1];
                  const distM = Math.hypot(p2.E - p1.E, p2.N - p1.N);
                  if (distM > 0) {
                    const perp = Math.abs((p2.N - p1.N) * world.E - (p2.E - p1.E) * world.N + p2.E * p1.N - p2.N * p1.E) / distM;
                    if (perp < 24 / scale) {
                      found = { layerId: ly.id, featureIdx: i, feature: f };
                      break;
                    }
                  }
                }
              } else if (f.geom === 'point' && pts[0]) {
                const dist = Math.hypot(pts[0].E - world.E, pts[0].N - world.N);
                if (dist < 20 / scale) {
                  found = { layerId: ly.id, featureIdx: i, feature: f };
                  break;
                }
              }
            }
            if (found) break;
          }
          onSelectFeature(found);
        }
      }

      setIsPanning(false);
      setVertexDrag(null);
      setFeatureMove(null);
      touchStateRef.current.isPinching = false;
      touchStateRef.current.vertexDrag = null;
      touchStateRef.current.isPanning = false;
    };

    const onTouchCancel = (e: TouchEvent) => {
      e.preventDefault();
      setIsPanning(false);
      setVertexDrag(null);
      setFeatureMove(null);
      touchStateRef.current.isPinching = false;
    };

    // Attach non-passive listeners directly to canvas
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
  }, [layers, scale, offset, activeTool, drawnPts, measurePts, zNum, isSouth, screenToWorld, onUpdateScaleOffset, onModifyFeatureVertices, onAddPointFeature, onUpdateDrawnPts, onUpdateMeasurePts, onSelectFeature, onCursorChange]);

  // Zoom Handling
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (isMapLocked) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newScale = Math.max(0.0001, Math.min(100, scale * zoomFactor));

    onUpdateScaleOffset(newScale, {
      x: sx - (sx - offset.x) * (newScale / scale),
      y: sy - (sy - offset.y) * (newScale / scale)
    });
  };

  // On-Screen Touch Zoom Helpers for Mobile
  const handleTouchZoom = (zoomIn: boolean) => {
    if (isMapLocked) return;
    const cv = canvasRef.current;
    const centerX = cv ? cv.width / 2 : 400;
    const centerY = cv ? cv.height / 2 : 250;
    const factor = zoomIn ? 1.3 : 0.77;
    const newScale = Math.max(0.0001, Math.min(100, scale * factor));
    onUpdateScaleOffset(newScale, {
      x: centerX - (centerX - offset.x) * (newScale / scale),
      y: centerY - (centerY - offset.y) * (newScale / scale)
    });
  };

  // Calculate Eye Altitude (Google Earth Camera altitude)
  const eyeAltKm = (1 / Math.max(0.00001, scale)) * 0.8;

  return (
    <div ref={containerRef} className="relative flex-1 min-h-[460px] rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#0a0d14] touch-none select-none overscroll-none">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={e => e.preventDefault()}
        style={{ touchAction: 'none' }}
        className={`w-full h-full block touch-none select-none ${
          isPanning
            ? 'cursor-grabbing'
            : activeTool === 'pan'
            ? 'cursor-grab'
            : hoveredVertex
            ? 'cursor-pointer'
            : hoveredMidpoint
            ? 'cursor-copy'
            : 'cursor-crosshair'
        }`}
      />

      {/* Snap Target HUD Alert */}
      {activeSnap && (
        <div className="absolute top-3 left-3 px-2.5 py-1 bg-cyan-950/85 backdrop-blur-md rounded-lg border border-cyan-500/40 text-[11px] font-mono text-cyan-300 flex items-center gap-1.5 shadow-md">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span>Snapped to {activeSnap.type.toUpperCase()}: E {activeSnap.E.toFixed(1)}, N {activeSnap.N.toFixed(1)}</span>
        </div>
      )}

      {/* Touch Zoom Floating Floating Controls (Mobile Optimized) */}
      <div className="absolute bottom-12 left-3 flex flex-col gap-1.5 z-20">
        <button
          onClick={() => handleTouchZoom(true)}
          className="w-9 h-9 rounded-xl bg-slate-900/85 hover:bg-slate-800 backdrop-blur-md border border-white/20 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
          title="Zoom In"
          aria-label="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleTouchZoom(false)}
          className="w-9 h-9 rounded-xl bg-slate-900/85 hover:bg-slate-800 backdrop-blur-md border border-white/20 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
          title="Zoom Out"
          aria-label="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
      </div>

      {/* Satellite Imagery Active Badge */}
      {imageryConfig.enabled && (
        <div className="absolute top-3 right-3 px-3 py-1.5 bg-slate-950/80 backdrop-blur-md rounded-xl border border-white/15 text-xs text-white flex items-center gap-2 shadow-lg">
          {isOnline ? (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold font-mono">
              <Wifi className="w-3 h-3" />
              <span>{imageryConfig.provider.replace('_', ' ').toUpperCase()}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-amber-400 font-semibold font-mono">
              <WifiOff className="w-3 h-3" />
              <span>OFFLINE FALLBACK</span>
            </span>
          )}
          <span className="text-white/40">|</span>
          <span className="text-[10px] text-white/70 font-mono">{Math.round(imageryConfig.opacity * 100)}% Opacity</span>
        </div>
      )}

      {/* 3D Perspective Controls Quick Floating Pill */}
      {pitchDeg > 0 && (
        <div className="absolute top-12 right-3 px-3 py-1 bg-sky-950/80 backdrop-blur-md rounded-lg border border-sky-500/40 text-xs text-sky-300 flex items-center gap-2 shadow-md">
          <span className="font-bold font-mono">3D Pitch: {pitchDeg}°</span>
          <button
            onClick={() => {
              onUpdatePitchDeg(0);
              onUpdateHeadingDeg(0);
            }}
            className="text-[10px] px-1.5 py-0.5 bg-sky-500/20 hover:bg-sky-500/30 rounded text-sky-200 flex items-center gap-1"
            title="Reset to 2D Top-Down"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            2D
          </button>
        </div>
      )}

      {/* Google Earth Geodetic Real-Time Readout HUD (Bottom-Right) */}
      <div className="absolute bottom-2 right-2 px-3 py-1.5 bg-slate-950/85 backdrop-blur-md rounded-xl border border-white/10 text-[11px] font-mono text-white/80 flex items-center gap-3 shadow-lg select-none max-w-[90%] sm:max-w-none overflow-hidden">
        {liveCoord ? (
          <>
            <div className="truncate">
              <span className="text-white/40 text-[10px]">UTM </span>
              <span className="text-cyan-400 font-bold">{liveCoord.E.toFixed(1)} E</span>,{' '}
              <span className="text-cyan-400 font-bold">{liveCoord.N.toFixed(1)} N</span>
            </div>
            <div className="hidden sm:block text-white/30">|</div>
            <div className="hidden sm:block">
              <span className="text-white/40 text-[10px]">WGS84 </span>
              <span className="text-amber-300">{liveCoord.lat.toFixed(6)}°</span>,{' '}
              <span className="text-amber-300">{liveCoord.lon.toFixed(6)}°</span>
            </div>
            <div className="hidden md:block text-white/30">|</div>
            <div className="hidden md:block">
              <span className="text-white/40 text-[10px]">ELEV </span>
              <span className="text-emerald-400 font-bold">{liveCoord.elev.toFixed(1)}m</span>
            </div>
          </>
        ) : (
          <span className="text-white/40">Move or touch map canvas...</span>
        )}
        <div className="hidden sm:block text-white/30">|</div>
        <div className="hidden sm:block">
          <span className="text-white/40 text-[10px]">EYE ALT </span>
          <span className="text-sky-300 font-bold">
            {eyeAltKm >= 1 ? `${eyeAltKm.toFixed(1)} km` : `${(eyeAltKm * 1000).toFixed(0)} m`}
          </span>
        </div>
      </div>
    </div>
  );
};
