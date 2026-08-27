import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useIsDarkMode } from '../hooks/useIsDarkMode';
import {
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Globe,
  Wifi,
  WifiOff,
  Navigation,
  Compass,
  X
} from 'lucide-react';
import { lonLatToUtm } from '../lib/geodesy';

export type MapTileProvider = 'satellite' | 'street' | 'topo';

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

// Convert Lat/Lon to Slippy Map Tile Coordinates
function latLonToTile(lat: number, lon: number, zoom: number) {
  const latRad = (lat * Math.PI) / 180;
  const n = Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y, tileX: Math.floor(x), tileY: Math.floor(y) };
}

function getTileUrl(provider: MapTileProvider, x: number, y: number, z: number): string {
  const maxCoord = Math.pow(2, z);
  const wrapX = ((x % maxCoord) + maxCoord) % maxCoord;
  const clampY = Math.max(0, Math.min(y, maxCoord - 1));

  if (provider === 'satellite') {
    // Esri World Imagery (High-Resolution Satellite - Free Public Service)
    return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${clampY}/${wrapX}`;
  } else if (provider === 'topo') {
    // OpenTopoMap
    const subdomains = ['a', 'b', 'c'];
    const s = subdomains[(wrapX + clampY) % subdomains.length];
    return `https://${s}.tile.opentopomap.org/${z}/${wrapX}/${clampY}.png`;
  } else {
    // CartoDB Voyager / OpenStreetMap (Fast, Clean Streets)
    const subdomains = ['a', 'b', 'c', 'd'];
    const s = subdomains[(wrapX + clampY) % subdomains.length];
    return `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${wrapX}/${clampY}.png`;
  }
}

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
  const [zoom, setZoom] = useState<number>(16);
  const [provider, setProvider] = useState<MapTileProvider>('satellite');
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [tileLoadError, setTileLoadError] = useState<boolean>(false);

  const zNum = parseInt(workingZone, 10) || 45;
  const isSouth = workingZone.endsWith('S');
  const utm = lonLatToUtm(lon, lat, zNum, isSouth);

  // Render Map Canvas (Tiles + Radar + Geodetic Overlays)
  const renderMap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const { x, y, tileX, tileY } = latLonToTile(lat, lon, zoom);
    const subX = (x - tileX) * 256;
    const subY = (y - tileY) * 256;
    const cx = w / 2;
    const cy = h / 2;

    if (isOnline && !tileLoadError) {
      // Draw 3x3 Tile Grid
      const tileOffsets = [
        { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
        { dx: -1, dy: 0 },  { dx: 0, dy: 0 },  { dx: 1, dy: 0 },
        { dx: -1, dy: 1 },  { dx: 0, dy: 1 },  { dx: 1, dy: 1 }
      ];

      tileOffsets.forEach(({ dx, dy }) => {
        const tx = tileX + dx;
        const ty = tileY + dy;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = getTileUrl(provider, tx, ty, zoom);

        img.onload = () => {
          const drawX = cx - subX + dx * 256;
          const drawY = cy - subY + dy * 256;
          ctx.drawImage(img, drawX, drawY, 256, 256);
          drawOverlays(ctx, w, h, cx, cy);
        };

        img.onerror = () => {
          // If satellite service throttled or offline, draw fallback grid
          drawFallbackGrid(ctx, w, h, cx, cy);
          drawOverlays(ctx, w, h, cx, cy);
        };
      });
    } else {
      // Offline Mode: Render Tactical Geodetic Radar Grid
      drawFallbackGrid(ctx, w, h, cx, cy);
      drawOverlays(ctx, w, h, cx, cy);
    }
  }, [lat, lon, zoom, provider, isOnline, tileLoadError, azimuth, accuracy, isDark]);

  const drawFallbackGrid = (ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number) => {
    // Geodetic radar backdrop adapted to dark / light mode
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
    ctx.strokeStyle = isDark ? 'rgba(201, 160, 99, 0.2)' : 'rgba(148, 163, 184, 0.35)';
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
    [40, 80, 120].forEach(r => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    });
  };

  const drawOverlays = (ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number) => {
    ctx.save();

    // 1. GNSS Accuracy Halo
    const pxAccuracy = Math.min(60, Math.max(12, accuracy * 4));
    ctx.fillStyle = 'rgba(59, 130, 246, 0.18)';
    ctx.beginPath();
    ctx.arc(cx, cy, pxAccuracy, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Heading FOV Cone & Compass Direction Line
    const rad = ((azimuth - 90) * Math.PI) / 180;
    const fovHalf = (35 * Math.PI) / 180; // 70-deg field of view
    const coneLen = isExpanded ? 55 : 38;

    ctx.fillStyle = 'rgba(201, 160, 99, 0.28)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, coneLen, rad - fovHalf, rad + fovHalf);
    ctx.closePath();
    ctx.fill();

    // Compass heading arrow
    ctx.strokeStyle = '#c9a063';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(rad) * coneLen, cy + Math.sin(rad) * coneLen);
    ctx.stroke();

    // 3. Center Surveyor Beacon Dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();

    // 4. North Pointer Badge (Top Right)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(w - 36, 6, 30, 20);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.strokeRect(w - 36, 6, 30, 20);

    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N ▲', w - 21, 20);

    // 5. Bottom Scale & Telemetry HUD
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, h - 22, w, 22);

    ctx.fillStyle = '#c9a063';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`UTM: ${utm.E.toFixed(0)}m E, ${utm.N.toFixed(0)}m N`, 6, h - 8);

    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'right';
    ctx.fillText(`Z${zoom} • ${provider.toUpperCase()}`, w - 6, h - 8);

    ctx.restore();

    if (onCanvasReady && canvasRef.current) {
      onCanvasReady(canvasRef.current);
    }
  };

  useEffect(() => {
    renderMap();
  }, [renderMap]);

  return (
    <div
      className={`relative rounded-2xl overflow-hidden shadow-2xl border border-white/20 backdrop-blur-md transition-all duration-300 ${
        isExpanded
          ? 'w-[320px] sm:w-[380px] h-[280px] sm:h-[320px]'
          : 'w-[220px] sm:w-[260px] h-[160px] sm:h-[180px]'
      } ${className}`}
    >
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={isExpanded ? 380 : 260}
        height={isExpanded ? 320 : 180}
        className="w-full h-full object-cover block bg-slate-100 dark:bg-slate-950 cursor-crosshair"
      />

      {/* Top Floating Control Bar */}
      <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between pointer-events-auto">
        {/* Network & Source Badge */}
        <div className="flex items-center gap-1">
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-mono font-semibold backdrop-blur-md shadow ${
              isOnline && !tileLoadError
                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                : 'bg-amber-950/80 text-amber-300 border border-amber-500/30'
            }`}
          >
            {isOnline && !tileLoadError ? (
              <>
                <Wifi className="w-2.5 h-2.5 text-emerald-400" />
                PiP Map
              </>
            ) : (
              <>
                <WifiOff className="w-2.5 h-2.5 text-amber-400" />
                Offline
              </>
            )}
          </span>

          {/* Layer Selector */}
          <select
            value={provider}
            onChange={e => setProvider(e.target.value as MapTileProvider)}
            className="appearance-none bg-black/80 hover:bg-black text-[9px] text-white/90 font-mono py-0.5 px-1.5 rounded border border-white/20 outline-none cursor-pointer"
          >
            <option value="satellite">Sat</option>
            <option value="street">Street</option>
            <option value="topo">Topo</option>
          </select>
        </div>

        {/* Map Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom(prev => Math.min(prev + 1, 19))}
            className="w-5 h-5 bg-black/80 hover:bg-black text-white/90 hover:text-white rounded border border-white/20 flex items-center justify-center text-[10px] transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
          <button
            onClick={() => setZoom(prev => Math.max(prev - 1, 10))}
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
