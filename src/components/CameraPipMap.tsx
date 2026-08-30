import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useIsDarkMode } from '../hooks/useIsDarkMode';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Wifi,
  WifiOff,
  Lock,
  Unlock,
  X
} from 'lucide-react';
import { lonLatToUtm } from '../lib/geodesy';

export type MapTileProvider = 'satellite' | 'google_sat' | 'google_hybrid' | 'street' | 'topo';

interface CameraPipMapProps {
  lat: number;
  lon: number;
  azimuth: number;
  accuracy?: number;
  isOnline: boolean;
  workingZone?: string;
  onClose?: () => void;
  className?: string;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

// Haversine distance in meters
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Convert Lat/Lon to Slippy Map Tile Coordinates
function latLonToTile(lat: number, lon: number, zoom: number) {
  const safeLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const safeLon = Math.max(-180, Math.min(180, lon));
  const latRad = (safeLat * Math.PI) / 180;
  const n = Math.pow(2, zoom);
  const x = ((safeLon + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y, tileX: Math.floor(x), tileY: Math.floor(y) };
}

function getTileUrl(provider: MapTileProvider, x: number, y: number, z: number): string {
  const maxCoord = Math.pow(2, z);
  const wrapX = ((x % maxCoord) + maxCoord) % maxCoord;
  const clampY = Math.max(0, Math.min(y, maxCoord - 1));

  if (provider === 'google_sat') {
    return `https://mt1.google.com/vt/lyrs=s&x=${wrapX}&y=${clampY}&z=${z}`;
  } else if (provider === 'google_hybrid') {
    return `https://mt1.google.com/vt/lyrs=y&x=${wrapX}&y=${clampY}&z=${z}`;
  } else if (provider === 'satellite') {
    // Esri World Imagery
    return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${clampY}/${wrapX}`;
  } else if (provider === 'topo') {
    // OpenTopoMap
    const subdomains = ['a', 'b', 'c'];
    const s = subdomains[(wrapX + clampY) % subdomains.length];
    return `https://${s}.tile.opentopomap.org/${z}/${wrapX}/${clampY}.png`;
  } else {
    // CartoDB Voyager
    const subdomains = ['a', 'b', 'c', 'd'];
    const s = subdomains[(wrapX + clampY) % subdomains.length];
    return `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${wrapX}/${clampY}.png`;
  }
}

// In-memory tile cache to eliminate tile fetch lag and memory thrash
const globalTileImageCache = new Map<string, HTMLImageElement>();

export const CameraPipMap: React.FC<CameraPipMapProps> = ({
  lat,
  lon,
  azimuth,
  accuracy = 2.5,
  isOnline,
  workingZone = '45N',
  onClose,
  className = '',
  onCanvasReady
}) => {
  const isDark = useIsDarkMode();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState<number>(17);
  const [provider, setProvider] = useState<MapTileProvider>('google_sat');
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isMapLocked, setIsMapLocked] = useState<boolean>(false);
  const [tileLoadError, setTileLoadError] = useState<boolean>(false);

  // 20-Meter Movement Hysteresis:
  // Lock map center coordinates until the user has moved >= 20.0 meters from the last center
  const centerCoordsRef = useRef<{ lat: number; lon: number }>({ lat, lon });

  // Snapshot coords if manual freeze toggle is pressed
  const frozenCoordsRef = useRef<{ lat: number; lon: number; zoom: number }>({ lat, lon, zoom });

  // Update center coords ONLY when user moves >= 20 meters from current center
  useEffect(() => {
    if (isMapLocked) return;
    const dist = haversineMeters(centerCoordsRef.current.lat, centerCoordsRef.current.lon, lat, lon);
    if (dist >= 20.0 || (centerCoordsRef.current.lat === 0 && centerCoordsRef.current.lon === 0)) {
      centerCoordsRef.current = { lat, lon };
    }
  }, [lat, lon, isMapLocked]);

  useEffect(() => {
    if (!isMapLocked) {
      frozenCoordsRef.current = { lat, lon, zoom };
    }
  }, [lat, lon, zoom, isMapLocked]);

  const zNum = parseInt(workingZone, 10) || 45;
  const isSouth = workingZone.endsWith('S');
  const utm = lonLatToUtm(lon, lat, zNum, isSouth);

  // Draw Fallback Grid when offline or loading
  const drawFallbackGrid = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number) => {
    if (isDark) {
      const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(w, h));
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.7, '#090d16');
      grad.addColorStop(1, '#030712');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, w, h);
    }

    // Coordinate grid lines
    ctx.strokeStyle = isDark ? 'rgba(201, 160, 99, 0.18)' : 'rgba(148, 163, 184, 0.3)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Range rings
    ctx.strokeStyle = isDark ? 'rgba(56, 189, 248, 0.25)' : 'rgba(2, 132, 199, 0.35)';
    [35, 70, 105].forEach(r => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    });
  }, [isDark]);

  // Draw overlays (beacon, 20m radius circle, compass cone, telemetry)
  const drawOverlays = useCallback((
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    beaconX: number,
    beaconY: number,
    activeZoom: number,
    activeLat: number
  ) => {
    ctx.save();

    // Calculate pixel radius for a statutory 20-meter circle at current zoom
    const metersPerPixel = (156543.03392 * Math.cos((activeLat * Math.PI) / 180)) / Math.pow(2, activeZoom);
    const px20m = Math.max(16, 20 / metersPerPixel);

    // 1. Statutory 20-Meter Radius Geodetic Lock Circle
    ctx.fillStyle = 'rgba(201, 160, 99, 0.12)';
    ctx.beginPath();
    ctx.arc(beaconX, beaconY, px20m, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(201, 160, 99, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(beaconX, beaconY, px20m, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 20m Radius Tag Badge
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(beaconX - 28, beaconY - px20m - 14, 56, 12);
    ctx.strokeStyle = 'rgba(201, 160, 99, 0.4)';
    ctx.strokeRect(beaconX - 28, beaconY - px20m - 14, 56, 12);
    ctx.fillStyle = '#c9a063';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('20m Radius', beaconX, beaconY - px20m - 8);

    // 2. GNSS Accuracy Halo
    const pxAccuracy = Math.min(px20m * 1.5, Math.max(8, (accuracy || 2) / metersPerPixel));
    ctx.fillStyle = 'rgba(59, 130, 246, 0.16)';
    ctx.beginPath();
    ctx.arc(beaconX, beaconY, pxAccuracy, 0, Math.PI * 2);
    ctx.fill();

    // 3. Heading FOV Cone & Direction Line
    const rad = ((azimuth - 90) * Math.PI) / 180;
    const fovHalf = (32 * Math.PI) / 180; // 64-deg camera field of view
    const coneLen = isExpanded ? 50 : 36;

    ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.beginPath();
    ctx.moveTo(beaconX, beaconY);
    ctx.arc(beaconX, beaconY, coneLen, rad - fovHalf, rad + fovHalf);
    ctx.closePath();
    ctx.fill();

    // Heading Arrow Vector
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(beaconX, beaconY);
    ctx.lineTo(beaconX + Math.cos(rad) * coneLen, beaconY + Math.sin(rad) * coneLen);
    ctx.stroke();

    // 4. Center Surveyor Beacon Point
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(beaconX, beaconY, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.arc(beaconX, beaconY, 3, 0, Math.PI * 2);
    ctx.fill();

    // 5. Compass True North Badge (Top Right)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(w - 38, 6, 32, 18);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.strokeRect(w - 38, 6, 32, 18);

    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N ▲', w - 22, 15);

    // 6. Bottom Scale & Telemetry HUD
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, h - 22, w, 22);

    ctx.fillStyle = '#c9a063';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`UTM: ${utm.E.toFixed(0)}m E, ${utm.N.toFixed(0)}m N`, 6, h - 11);

    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'right';
    ctx.fillText(`Z${activeZoom} • 20m Lock`, w - 6, h - 11);

    ctx.restore();

    if (onCanvasReady && canvasRef.current) {
      onCanvasReady(canvasRef.current);
    }
  }, [accuracy, azimuth, isExpanded, onCanvasReady, utm.E, utm.N]);

  // Main Render Map Function
  const renderMap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Map Center Origin: locked by the 20-meter threshold
    const mapCenterLat = isMapLocked ? frozenCoordsRef.current.lat : centerCoordsRef.current.lat;
    const mapCenterLon = isMapLocked ? frozenCoordsRef.current.lon : centerCoordsRef.current.lon;
    const activeZoom = isMapLocked ? frozenCoordsRef.current.zoom : zoom;

    const { x: cxTile, y: cyTile, tileX, tileY } = latLonToTile(mapCenterLat, mapCenterLon, activeZoom);
    const subX = (cxTile - tileX) * 256;
    const subY = (cyTile - tileY) * 256;
    const cx = w / 2;
    const cy = h / 2;

    // Actual user offset relative to current map center
    const { x: userTileX, y: userTileY } = latLonToTile(lat, lon, activeZoom);
    const beaconX = cx + (userTileX - cxTile) * 256;
    const beaconY = cy + (userTileY - cyTile) * 256;

    if (isOnline && !tileLoadError) {
      // 3x3 Tile Grid surrounding the 20-meter center
      const tileOffsets = [
        { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
        { dx: -1, dy: 0 },  { dx: 0, dy: 0 },  { dx: 1, dy: 0 },
        { dx: -1, dy: 1 },  { dx: 0, dy: 1 },  { dx: 1, dy: 1 }
      ];

      let loadedCount = 0;
      let hasDrawn = false;

      const finishRender = () => {
        if (!hasDrawn) {
          hasDrawn = true;
          drawOverlays(ctx, w, h, beaconX, beaconY, activeZoom, mapCenterLat);
        }
      };

      tileOffsets.forEach(({ dx, dy }) => {
        const tx = tileX + dx;
        const ty = tileY + dy;
        const tileKey = `${provider}_${activeZoom}_${tx}_${ty}`;

        let img = globalTileImageCache.get(tileKey);
        if (!img) {
          img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = getTileUrl(provider, tx, ty, activeZoom);
          globalTileImageCache.set(tileKey, img);
        }

        if (img.complete && img.naturalWidth > 0) {
          const drawX = cx - subX + dx * 256;
          const drawY = cy - subY + dy * 256;
          ctx.drawImage(img, drawX, drawY, 256, 256);
          loadedCount++;
          if (loadedCount === tileOffsets.length) {
            finishRender();
          }
        } else {
          img.onload = () => {
            const drawX = cx - subX + dx * 256;
            const drawY = cy - subY + dy * 256;
            ctx.drawImage(img!, drawX, drawY, 256, 256);
            loadedCount++;
            if (loadedCount === tileOffsets.length) {
              finishRender();
            }
          };
          img.onerror = () => {
            loadedCount++;
            if (loadedCount === tileOffsets.length) {
              finishRender();
            }
          };
        }
      });

      // Quick fallback overlay render if some tiles are still streaming
      setTimeout(finishRender, 40);
    } else {
      // Offline Mode: Render Tactical Geodetic Radar Grid
      drawFallbackGrid(ctx, w, h, cx, cy);
      drawOverlays(ctx, w, h, beaconX, beaconY, activeZoom, mapCenterLat);
    }
  }, [
    lat,
    lon,
    zoom,
    provider,
    isOnline,
    tileLoadError,
    isMapLocked,
    drawFallbackGrid,
    drawOverlays
  ]);

  useEffect(() => {
    renderMap();
  }, [renderMap]);

  return (
    <div
      className={`relative rounded-2xl overflow-hidden shadow-2xl border border-white/20 backdrop-blur-md transition-all duration-200 select-none ${
        isExpanded
          ? 'w-[320px] sm:w-[380px] h-[260px] sm:h-[300px]'
          : 'w-[220px] sm:w-[260px] h-[150px] sm:h-[170px]'
      } ${className}`}
    >
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={isExpanded ? 380 : 260}
        height={isExpanded ? 300 : 170}
        className="w-full h-full object-cover block bg-slate-900 cursor-crosshair"
      />

      {/* Top Floating Control Bar */}
      <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between pointer-events-auto">
        {/* Network & Source Badge */}
        <div className="flex items-center gap-1">
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-mono font-semibold backdrop-blur-md shadow ${
              isOnline && !tileLoadError
                ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/30'
                : 'bg-amber-950/90 text-amber-300 border border-amber-500/30'
            }`}
          >
            {isOnline && !tileLoadError ? (
              <>
                <Wifi className="w-2.5 h-2.5 text-emerald-400" />
                <span>20m PiP</span>
              </>
            ) : (
              <>
                <WifiOff className="w-2.5 h-2.5 text-amber-400" />
                <span>Offline</span>
              </>
            )}
          </span>

          {/* Layer Selector */}
          <select
            value={provider}
            onChange={e => setProvider(e.target.value as MapTileProvider)}
            className="appearance-none bg-black/85 hover:bg-black text-[9px] text-white/90 font-mono py-0.5 px-1.5 rounded border border-white/20 outline-none cursor-pointer"
          >
            <option value="google_sat">Google Sat</option>
            <option value="google_hybrid">Google Hybrid</option>
            <option value="satellite">Esri Sat</option>
            <option value="street">Street</option>
            <option value="topo">Topo</option>
          </select>
        </div>

        {/* Map Controls */}
        <div className="flex items-center gap-1">
          {/* Lock / Unlock Toggle */}
          <button
            onClick={() => {
              if (!isMapLocked) {
                frozenCoordsRef.current = { lat, lon, zoom };
              }
              setIsMapLocked(prev => !prev);
            }}
            className={`w-5 h-5 rounded border flex items-center justify-center text-[10px] transition-colors ${
              isMapLocked
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-black/80 hover:bg-black text-white/90 hover:text-white border-white/20'
            }`}
            title={isMapLocked ? 'Map Locked (Tap to Unlock 20m Live Tracking)' : 'Freeze Map Center'}
          >
            {isMapLocked ? <Lock className="w-2.5 h-2.5 text-amber-300" /> : <Unlock className="w-2.5 h-2.5" />}
          </button>

          <button
            onClick={() => {
              if (!isMapLocked) setZoom(prev => Math.min(prev + 1, 19));
              else {
                frozenCoordsRef.current.zoom = Math.min(frozenCoordsRef.current.zoom + 1, 19);
                setZoom(frozenCoordsRef.current.zoom);
              }
            }}
            className="w-5 h-5 bg-black/80 hover:bg-black text-white/90 hover:text-white rounded border border-white/20 flex items-center justify-center text-[10px] transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
          <button
            onClick={() => {
              if (!isMapLocked) setZoom(prev => Math.max(prev - 1, 10));
              else {
                frozenCoordsRef.current.zoom = Math.max(frozenCoordsRef.current.zoom - 1, 10);
                setZoom(frozenCoordsRef.current.zoom);
              }
            }}
            className="w-5 h-5 bg-black/80 hover:bg-black text-white/90 hover:text-white rounded border border-white/20 flex items-center justify-center text-[10px] transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3 h-3" />
          </button>
          <button
            onClick={() => setIsExpanded(prev => !prev)}
            className="w-5 h-5 bg-black/80 hover:bg-black text-white/90 hover:text-white rounded border border-white/20 flex items-center justify-center text-[10px] transition-colors"
            title={isExpanded ? 'Minimize PiP' : 'Expand PiP'}
          >
            {isExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="w-5 h-5 bg-red-950/80 hover:bg-red-900 text-red-200 rounded border border-red-500/30 flex items-center justify-center text-[10px] transition-colors"
              title="Close PiP Map"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
