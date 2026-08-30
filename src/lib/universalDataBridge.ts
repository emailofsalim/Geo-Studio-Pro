import { GeoFeature, GeoPoint, GisLayer, SurveyWaypoint, CadastralParcel, PhotoLandmark } from '../types';
import {
  parseCSV,
  stripBOM,
  toCSVtext,
  csvEnc,
  kmlBuild,
  kmlParse,
  featuresToKMZ,
  dxfBuild,
  dxfParse,
  geoJsonBuild,
  geoJsonParse,
  gpxBuild,
  gpxParse,
  wktBuild,
  wktParse,
  landXmlParse,
  parseShapefile,
  buildShapefileZip,
  topoJsonParse,
  gmlXmlParse,
  mapinfoMifMidParse,
  osmXmlParse,
  asciiGridDemParse,
  surpacMiningStringParse,
  makeXLSX,
  safeFileName,
  csvToFeatures,
  cleanDxfText
} from './formats';
import { lonLatToUtm, utmToLonLat, polygonAreaPerimeter } from './geodesy';
import { downloadBlob, makeZip, readZip } from './zip';

export type ExportFormatId =
  | 'geojson'
  | 'kml'
  | 'kmz'
  | 'dxf'
  | 'csv'
  | 'xlsx'
  | 'gpx'
  | 'shp'
  | 'topojson'
  | 'wkt'
  | 'landxml'
  | 'project';

export interface FormatMeta {
  id: ExportFormatId;
  name: string;
  extension: string;
  mimeType: string;
  category: 'GIS' | 'CAD' | 'Google Earth' | 'GPS' | 'Spreadsheet' | 'Engineering' | 'Archive';
  description: string;
  iconName: string;
  supports3D: boolean;
  recommendedFor: string;
}

export const SUPPORTED_EXPORT_FORMATS: FormatMeta[] = [
  {
    id: 'geojson',
    name: 'OGC GeoJSON',
    extension: '.geojson',
    mimeType: 'application/geo+json',
    category: 'GIS',
    description: 'Standard JSON feature collection with properties, coordinate geometry, and CRS metadata.',
    iconName: 'Globe',
    supports3D: true,
    recommendedFor: 'Web GIS, QGIS, ArcGIS, Mapbox, Leaflet'
  },
  {
    id: 'kml',
    name: 'Google Earth KML',
    extension: '.kml',
    mimeType: 'application/vnd.google-earth.kml+xml',
    category: 'Google Earth',
    description: 'XML placemarks with 3D terrain clamp, symbology, styled polygons, and pop-up info balloons.',
    iconName: 'MapPin',
    supports3D: true,
    recommendedFor: 'Google Earth Pro, Google Earth Mobile, Drone Flight Planners'
  },
  {
    id: 'kmz',
    name: 'Google Earth KMZ Archive',
    extension: '.kmz',
    mimeType: 'application/vnd.google-earth.kmz',
    category: 'Google Earth',
    description: 'Compressed zip bundle containing styled KML document, embedded markers, icons, and textures.',
    iconName: 'FolderArchive',
    supports3D: true,
    recommendedFor: 'Google Earth, Drone Missions, Client Deliverables'
  },
  {
    id: 'dxf',
    name: 'AutoCAD DXF Drawing',
    extension: '.dxf',
    mimeType: 'application/dxf',
    category: 'CAD',
    description: 'Vector CAD drawing containing POINT, LWPOLYLINE, 3DFACE, TEXT annotations, and layer tables.',
    iconName: 'FileCode',
    supports3D: true,
    recommendedFor: 'AutoCAD, Civil 3D, MicroStation, Carlson Survey, QCAD'
  },
  {
    id: 'csv',
    name: 'CSV Coordinate Sheet',
    extension: '.csv',
    mimeType: 'text/csv',
    category: 'Spreadsheet',
    description: 'Delimited ASCII table with Northing, Easting, Elevation, Latitude, Longitude, Point ID, and Attributes.',
    iconName: 'FileSpreadsheet',
    supports3D: true,
    recommendedFor: 'Total Stations, GPS Data Collectors, Excel, Python/R Analysis'
  },
  {
    id: 'xlsx',
    name: 'Microsoft Excel Workbook',
    extension: '.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    category: 'Spreadsheet',
    description: 'Multi-column formatted geomatics spreadsheet with metadata summary and styled coordinates.',
    iconName: 'FileSpreadsheet',
    supports3D: true,
    recommendedFor: 'Office Reports, Land Revenue Records, Audit Submissions'
  },
  {
    id: 'gpx',
    name: 'GPS Exchange Format (GPX)',
    extension: '.gpx',
    mimeType: 'application/gpx+xml',
    category: 'GPS',
    description: 'Standard GPS schema with Waypoints (<wpt>), Tracks (<trk>), and Routes (<rte>) with timestamps.',
    iconName: 'Compass',
    supports3D: true,
    recommendedFor: 'Garmin GPS, Trimble, handheld receivers, mobile navigation'
  },
  {
    id: 'shp',
    name: 'ESRI Shapefile Package (ZIP)',
    extension: '.shp.zip',
    mimeType: 'application/zip',
    category: 'GIS',
    description: 'Zipped multi-file Shapefile (.shp geometry, .shx index, .dbf attributes, .prj WGS84 projection).',
    iconName: 'Layers',
    supports3D: false,
    recommendedFor: 'ArcGIS Pro, ArcMap, QGIS, Enterprise Geo-databases'
  },
  {
    id: 'topojson',
    name: 'TopoJSON Shared Mesh',
    extension: '.topojson',
    mimeType: 'application/json',
    category: 'GIS',
    description: 'Topologically encoded geometry eliminating shared boundary duplication for lightweight web mapping.',
    iconName: 'Spline',
    supports3D: false,
    recommendedFor: 'D3.js, Web Dashboards, Cadastral boundary maps'
  },
  {
    id: 'wkt',
    name: 'Well-Known Text (WKT)',
    extension: '.wkt',
    mimeType: 'text/plain',
    category: 'GIS',
    description: 'OGC standard text representation of spatial geometries (POINT, LINESTRING, POLYGON, MULTIPOLYGON).',
    iconName: 'FileText',
    supports3D: true,
    recommendedFor: 'PostGIS, SpatiaLite, Oracle Spatial, SQL Server Geometry'
  },
  {
    id: 'landxml',
    name: 'LandXML Civil Engineering',
    extension: '.landxml',
    mimeType: 'application/xml',
    category: 'Engineering',
    description: 'Standard civil surveying XML schema containing Parcels, Alignments, CogoPoints, and Surfaces.',
    iconName: 'Activity',
    supports3D: true,
    recommendedFor: 'Autodesk Civil 3D, Bentley OpenRoads, 12d Model'
  },
  {
    id: 'project',
    name: 'GeoStudio Project Archive',
    extension: '.json',
    mimeType: 'application/json',
    category: 'Archive',
    description: 'Complete workspace state, layers, waypoints, cadastral parcels, sensor logs, and preferences.',
    iconName: 'FolderArchive',
    supports3D: true,
    recommendedFor: 'Backup, Team Sharing, Migration between devices'
  }
];

export interface DetectedImportResult {
  formatId: string;
  formatName: string;
  formatCategory: 'GIS' | 'CAD' | 'Google Earth' | 'GPS' | 'Spreadsheet' | 'Engineering' | 'Archive' | 'Unknown';
  extension: string;
  confidence: number;
  features: GeoFeature[];
  featureCount: number;
  pointsCount: number;
  linesCount: number;
  polygonsCount: number;
  attributeKeys: string[];
  boundingBox?: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
    minE?: number;
    maxE?: number;
    minN?: number;
    maxN?: number;
  };
  zoneDetected?: string;
  projectData?: any;
  rawRows?: string[][];
  warnings?: string[];
  suggestedAppDestination: string;
}

/**
 * Extract UTM Zone number and hemisphere from zone string like '45N', '43S'
 */
export function parseUtmZoneStr(zoneStr: string): { zone: number; south: boolean } {
  const match = String(zoneStr || '45N').match(/^(\d{1,2})\s*([NSns]?)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    const south = (match[2] || 'N').toUpperCase() === 'S';
    return { zone: isNaN(num) || num < 1 || num > 60 ? 45 : num, south };
  }
  return { zone: 45, south: false };
}

/**
 * Universal Auto-Detection Engine
 * Sniffs file contents, headers, XML roots, JSON schemas, magic numbers, and extensions.
 */
export async function detectAndParseGeospatialFile(
  file: File,
  workingZoneStr: string = '45N'
): Promise<DetectedImportResult> {
  const fileName = file.name.toLowerCase();
  const { zone, south } = parseUtmZoneStr(workingZoneStr);
  const warnings: string[] = [];

  // 1. Handle Binary ZIP / Shapefile / KMZ files
  if (fileName.endsWith('.kmz') || fileName.endsWith('.zip') || fileName.endsWith('.shp')) {
    try {
      const buffer = await file.arrayBuffer();

      // Check if KMZ
      if (fileName.endsWith('.kmz')) {
        const zipFiles = await readZip(buffer);
        let kmlContent = '';
        for (const [zName, zBytes] of Object.entries(zipFiles)) {
          if (zName.toLowerCase().endsWith('.kml')) {
            kmlContent = new TextDecoder('utf-8').decode(zBytes);
            break;
          }
        }
        if (kmlContent) {
          const feats = kmlParse(kmlContent);
          return buildDetectedResult('kmz', 'Google Earth KMZ Archive', 'Google Earth', '.kmz', 0.98, feats, 'gis', {
            warnings
          });
        }
      }

      // Check if Shapefile ZIP or standalone SHP
      if (fileName.endsWith('.zip') || fileName.endsWith('.shp')) {
        try {
          const parsed = await parseShapefile(new Uint8Array(buffer));
          if (parsed && parsed.length > 0) {
            return buildDetectedResult(
              'shp',
              'ESRI Shapefile Archive',
              'GIS',
              '.shp.zip',
              0.96,
              parsed,
              'gis',
              { warnings }
            );
          }
        } catch (shpErr: any) {
          // If shapefile parse failed, check if zip contains other recognized files (e.g. kml, dxf, geojson)
          const zipFiles = await readZip(buffer);
          for (const [zName, zBytes] of Object.entries(zipFiles)) {
            const innerName = zName.toLowerCase();
            const innerText = new TextDecoder('utf-8').decode(zBytes);
            if (innerName.endsWith('.kml')) {
              const feats = kmlParse(innerText);
              return buildDetectedResult('kml', 'Zipped KML Document', 'Google Earth', '.kml', 0.92, feats, 'gis');
            }
            if (innerName.endsWith('.geojson') || innerName.endsWith('.json')) {
              const feats = geoJsonParse(innerText);
              return buildDetectedResult('geojson', 'Zipped GeoJSON', 'GIS', '.geojson', 0.92, feats, 'gis');
            }
            if (innerName.endsWith('.dxf')) {
              const feats = dxfParse(innerText);
              return buildDetectedResult('dxf', 'Zipped AutoCAD DXF', 'CAD', '.dxf', 0.92, feats, 'cad');
            }
          }
        }
      }
    } catch (e: any) {
      warnings.push(`Binary archive reading warning: ${e.message}`);
    }
  }

  // 2. Read Text content for text-based formats
  const textContent = await file.text();
  const trimmed = stripBOM(textContent).trim();

  // A. Check for GeoStudio Project JSON
  if (trimmed.startsWith('{')) {
    try {
      const parsedJson = JSON.parse(trimmed);
      if (parsedJson.storageDump || (parsedJson.version && parsedJson.settings)) {
        return {
          formatId: 'project',
          formatName: 'GeoStudio Full Project Backup',
          formatCategory: 'Archive',
          extension: '.json',
          confidence: 1.0,
          features: [],
          featureCount: Object.keys(parsedJson.storageDump || {}).length,
          pointsCount: 0,
          linesCount: 0,
          polygonsCount: 0,
          attributeKeys: Object.keys(parsedJson.settings || {}),
          projectData: parsedJson,
          suggestedAppDestination: 'project_restore',
          warnings
        };
      }

      // Check for TopoJSON
      if (parsedJson.type === 'Topology' || parsedJson.objects) {
        const feats = topoJsonParse(trimmed);
        return buildDetectedResult('topojson', 'TopoJSON Topology Mesh', 'GIS', '.topojson', 0.95, feats, 'gis', {
          warnings
        });
      }

      // Check for GeoJSON
      if (parsedJson.type === 'FeatureCollection' || parsedJson.type === 'Feature' || parsedJson.features || parsedJson.geometry) {
        const feats = geoJsonParse(trimmed);
        return buildDetectedResult('geojson', 'OGC GeoJSON FeatureCollection', 'GIS', '.geojson', 0.98, feats, 'gis', {
          warnings
        });
      }
    } catch {
      // Continue to next sniffer
    }
  }

  // B. Check for XML Formats (KML, GPX, LandXML, OSM, GML)
  if (trimmed.startsWith('<') || trimmed.includes('<?xml') || trimmed.includes('<kml') || trimmed.includes('<gpx')) {
    // 1. Google Earth KML
    if (trimmed.includes('<kml') || trimmed.includes('<Placemark') || trimmed.includes('<Document')) {
      const feats = kmlParse(trimmed);
      return buildDetectedResult('kml', 'Google Earth KML Document', 'Google Earth', '.kml', 0.97, feats, 'gis', {
        warnings
      });
    }

    // 2. GPS GPX
    if (trimmed.includes('<gpx') || trimmed.includes('<wpt') || trimmed.includes('<trk') || trimmed.includes('<rte')) {
      const feats = gpxParse(trimmed);
      return buildDetectedResult('gpx', 'GPS Exchange Format (GPX)', 'GPS', '.gpx', 0.97, feats, 'gps', {
        warnings
      });
    }

    // 3. LandXML Civil Engineering
    if (trimmed.includes('<LandXML') || trimmed.includes('<Parcels') || trimmed.includes('<Alignments') || trimmed.includes('<CogoPoints')) {
      const feats = landXmlParse(trimmed);
      return buildDetectedResult('landxml', 'LandXML Civil Engineering', 'Engineering', '.landxml', 0.95, feats, 'cad', {
        warnings
      });
    }

    // 4. OpenStreetMap XML
    if (trimmed.includes('<osm') || trimmed.includes('<node') || trimmed.includes('<way')) {
      const feats = osmXmlParse(trimmed);
      return buildDetectedResult('osm', 'OpenStreetMap XML', 'GIS', '.osm', 0.92, feats, 'gis', {
        warnings
      });
    }

    // 5. GML / CityGML
    if (trimmed.includes('<gml:') || trimmed.includes('xmlns:gml') || trimmed.includes('<CityModel')) {
      const feats = gmlXmlParse(trimmed);
      return buildDetectedResult('gml', 'Geography Markup Language (GML)', 'GIS', '.gml', 0.9, feats, 'gis', {
        warnings
      });
    }
  }

  // C. Check for AutoCAD DXF
  if (
    fileName.endsWith('.dxf') ||
    trimmed.includes('SECTION\n  2\nHEADER') ||
    trimmed.includes('0\nSECTION') ||
    trimmed.includes('0\nENTITIES') ||
    trimmed.includes('0\nPOLYLINE') ||
    trimmed.includes('0\nLWPOLYLINE')
  ) {
    const feats = dxfParse(trimmed);
    return buildDetectedResult('dxf', 'AutoCAD DXF Vector Drawing', 'CAD', '.dxf', 0.96, feats, 'cad', {
      warnings
    });
  }

  // D. Check for Well-Known Text (WKT)
  if (
    /^(POINT|LINESTRING|POLYGON|MULTIPOINT|MULTILINESTRING|MULTIPOLYGON|GEOMETRYCOLLECTION)\s*\(/i.test(trimmed) ||
    fileName.endsWith('.wkt')
  ) {
    const feats = wktParse(trimmed);
    return buildDetectedResult('wkt', 'OGC Well-Known Text (WKT)', 'GIS', '.wkt', 0.94, feats, 'gis', {
      warnings
    });
  }

  // E. Check for Surpac Mining String
  if (fileName.endsWith('.str') || trimmed.includes('SURPAC') || /^\s*\d+,\s*[\d\.\-]+,\s*[\d\.\-]+,\s*[\d\.\-]+/m.test(trimmed)) {
    try {
      const feats = surpacMiningStringParse(trimmed);
      if (feats.length > 0) {
        return buildDetectedResult('str', 'Surpac Mining String (.str)', 'Engineering', '.str', 0.9, feats, 'bore', {
          warnings
        });
      }
    } catch {}
  }

  // F. Check for ASCII Grid DEM
  if (fileName.endsWith('.asc') || fileName.endsWith('.grd') || trimmed.startsWith('ncols') || trimmed.startsWith('NCOLS')) {
    try {
      const feats = asciiGridDemParse(fileName, trimmed, zone, south);
      if (feats.length > 0) {
        return buildDetectedResult('asc', 'ASCII Elevation Grid DEM', 'GIS', '.asc', 0.91, feats, 'gis', {
          warnings
        });
      }
    } catch {}
  }

  // G. Check for MapInfo MIF/MID
  if (fileName.endsWith('.mif') || trimmed.toUpperCase().includes('VERSION') && trimmed.toUpperCase().includes('COLUMNS')) {
    try {
      const feats = mapinfoMifMidParse(trimmed, '');
      if (feats.length > 0) {
        return buildDetectedResult('mif', 'MapInfo MIF/MID Vector', 'GIS', '.mif', 0.9, feats, 'gis', {
          warnings
        });
      }
    } catch {}
  }

  // H. CSV / Tabular Coordinate Table (Fallback parser)
  try {
    const rows = parseCSV(trimmed);
    if (rows.length >= 2) {
      const feats = csvToFeatures(rows, zone, south);
      const headerRow = rows[0] || [];
      return {
        formatId: 'csv',
        formatName: 'CSV Coordinate Table',
        formatCategory: 'Spreadsheet',
        extension: '.csv',
        confidence: 0.88,
        features: feats,
        featureCount: feats.length > 0 ? feats.length : rows.length - 1,
        pointsCount: feats.filter(f => f.geom === 'point').length || rows.length - 1,
        linesCount: feats.filter(f => f.geom === 'line').length,
        polygonsCount: feats.filter(f => f.geom === 'polygon').length,
        attributeKeys: headerRow,
        rawRows: rows,
        boundingBox: computeBoundingBox(feats),
        suggestedAppDestination: feats.length > 0 ? 'gps' : 'convert',
        warnings
      };
    }
  } catch {}

  // Fallback if unrecognized
  return {
    formatId: 'unknown',
    formatName: 'Unrecognized Format',
    formatCategory: 'Unknown',
    extension: fileName.slice(fileName.lastIndexOf('.')),
    confidence: 0.1,
    features: [],
    featureCount: 0,
    pointsCount: 0,
    linesCount: 0,
    polygonsCount: 0,
    attributeKeys: [],
    suggestedAppDestination: 'gis',
    warnings: ['Could not automatically recognize vector geometry or table structure in this file.']
  };
}

/**
 * Helper to construct standard DetectedImportResult
 */
function buildDetectedResult(
  formatId: string,
  formatName: string,
  formatCategory: 'GIS' | 'CAD' | 'Google Earth' | 'GPS' | 'Spreadsheet' | 'Engineering' | 'Archive' | 'Unknown',
  extension: string,
  confidence: number,
  features: GeoFeature[],
  suggestedAppDestination: string,
  extra: { warnings?: string[]; zoneDetected?: string } = {}
): DetectedImportResult {
  let pointsCount = 0;
  let linesCount = 0;
  let polygonsCount = 0;
  const attrSet = new Set<string>();

  features.forEach(f => {
    if (f.geom === 'point') pointsCount += f.pts.length || 1;
    else if (f.geom === 'line') linesCount++;
    else if (f.geom === 'polygon') polygonsCount++;

    if (f.props) {
      Object.keys(f.props).forEach(k => attrSet.add(k));
    }
  });

  return {
    formatId,
    formatName,
    formatCategory,
    extension,
    confidence,
    features,
    featureCount: features.length,
    pointsCount,
    linesCount,
    polygonsCount,
    attributeKeys: Array.from(attrSet),
    boundingBox: computeBoundingBox(features),
    suggestedAppDestination,
    zoneDetected: extra.zoneDetected,
    warnings: extra.warnings || []
  };
}

/**
 * Helper to calculate spatial bounding box of features
 */
export function computeBoundingBox(features: GeoFeature[]) {
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  let count = 0;

  features.forEach(f => {
    f.pts.forEach(pt => {
      if (f.kind === 'll') {
        const lon = pt.a;
        const lat = pt.b;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        count++;
      }
    });
  });

  if (count === 0) return undefined;
  return { minLat, maxLat, minLon, maxLon };
}

export interface UniversalExportOptions {
  format: ExportFormatId;
  fileName: string;
  features: GeoFeature[];
  workingZoneStr: string;
  coordSystem: 'wgs84' | 'utm';
  include3dZ?: boolean;
  layerName?: string;
  allLayers?: GisLayer[];
  waypoints?: SurveyWaypoint[];
  parcels?: CadastralParcel[];
  landmarks?: PhotoLandmark[];
  projectData?: any;
}

/**
 * Universal Exporter Engine
 * Produces and triggers direct browser download of any chosen geospatial or project format.
 */
export async function executeUniversalExport(options: UniversalExportOptions): Promise<{
  success: boolean;
  fileName: string;
  byteCount: number;
  formatName: string;
}> {
  const {
    format,
    fileName: baseInputName,
    features = [],
    workingZoneStr = '45N',
    coordSystem = 'wgs84',
    include3dZ = true,
    layerName = 'GeoStudio_Export',
    allLayers,
    waypoints,
    parcels,
    landmarks,
    projectData
  } = options;

  const { zone, south } = parseUtmZoneStr(workingZoneStr);
  const cleanBase = safeFileName(baseInputName || 'geostudio_export');

  // Consolidate all features if layers or waypoints are provided
  let exportFeatures: GeoFeature[] = [...features];

  if (exportFeatures.length === 0 && allLayers && allLayers.length > 0) {
    allLayers.forEach(l => {
      if (l.visible !== false && l.features) {
        exportFeatures.push(...l.features);
      }
    });
  }

  if (exportFeatures.length === 0 && waypoints && waypoints.length > 0) {
    waypoints.forEach(wp => {
      exportFeatures.push({
        name: wp.id || wp.code || 'Waypoint',
        geom: 'point',
        kind: 'll',
        pts: [{ a: wp.lon, b: wp.lat }],
        props: {
          code: wp.code,
          elevation: wp.Z,
          acc: wp.acc,
          utmE: wp.E,
          utmN: wp.N,
          zone: wp.zone,
          time: wp.time ? new Date(wp.time).toISOString() : undefined,
          remarks: wp.remarks
        }
      });
    });
  }

  if (exportFeatures.length === 0 && parcels && parcels.length > 0) {
    parcels.forEach(p => {
      exportFeatures.push({
        name: p.khasra || 'Cadastral Parcel',
        geom: 'polygon',
        kind: 'en',
        pts: p.pts.map(pt => ({ a: pt.E, b: pt.N })),
        props: {
          khasra: p.khasra,
          owner: p.owner,
          areaM2: p.areaM2,
          areaHa: p.areaHa,
          areaAcres: p.areaAcres,
          village: p.village,
          status: p.status
        }
      });
    });
  }

  switch (format) {
    case 'geojson': {
      const geoJsonStr = geoJsonBuild(exportFeatures, zone, south);
      const outName = `${cleanBase}.geojson`;
      downloadBlob(geoJsonStr, outName, 'application/geo+json');
      return { success: true, fileName: outName, byteCount: new Blob([geoJsonStr]).size, formatName: 'OGC GeoJSON' };
    }

    case 'kml': {
      const kmlStr = kmlBuild(exportFeatures, cleanBase, include3dZ, zone, south);
      const outName = `${cleanBase}.kml`;
      downloadBlob(kmlStr, outName, 'application/vnd.google-earth.kml+xml');
      return { success: true, fileName: outName, byteCount: new Blob([kmlStr]).size, formatName: 'Google Earth KML' };
    }

    case 'kmz': {
      const kmzFiles = featuresToKMZ(exportFeatures, '#c9a063', { zone, south });
      const outName = `${cleanBase}.kmz`;
      if (kmzFiles.length > 0) {
        downloadBlob(kmzFiles[0].bytes, outName, 'application/vnd.google-earth.kmz');
        return { success: true, fileName: outName, byteCount: kmzFiles[0].bytes.byteLength, formatName: 'Google Earth KMZ' };
      }
      const kmlStr = kmlBuild(exportFeatures, cleanBase, include3dZ, zone, south);
      downloadBlob(kmlStr, `${cleanBase}.kml`, 'application/vnd.google-earth.kml+xml');
      return { success: true, fileName: `${cleanBase}.kml`, byteCount: new Blob([kmlStr]).size, formatName: 'Google Earth KML' };
    }

    case 'dxf': {
      const { dxf } = dxfBuild(exportFeatures, coordSystem, zone, south, true);
      const outName = `${cleanBase}.dxf`;
      downloadBlob(dxf, outName, 'application/dxf');
      return { success: true, fileName: outName, byteCount: new Blob([dxf]).size, formatName: 'AutoCAD DXF Drawing' };
    }

    case 'csv': {
      const cols = ['Feature_Name', 'Geometry_Type', 'Point_Index', 'Latitude', 'Longitude', 'UTM_Easting', 'UTM_Northing', 'Elevation_Z', 'Folder_Layer', 'Properties_JSON'];
      const rows: (string | number)[][] = [];

      exportFeatures.forEach(f => {
        f.pts.forEach((pt, idx) => {
          let lat = 0, lon = 0, E = 0, N = 0;
          if (f.kind === 'll') {
            lon = pt.a;
            lat = pt.b;
            const utm = lonLatToUtm(lon, lat, zone, south);
            E = utm.E;
            N = utm.N;
          } else {
            E = pt.a;
            N = pt.b;
            const ll = utmToLonLat(E, N, zone, south);
            lon = ll.lon;
            lat = ll.lat;
          }
          const z = f.props?.elevation ?? f.props?.Z ?? 0;
          rows.push([
            f.name || 'Feature',
            f.geom || 'point',
            idx + 1,
            lat.toFixed(7),
            lon.toFixed(7),
            E.toFixed(3),
            N.toFixed(3),
            z,
            f.folder || f.group || layerName,
            f.props ? JSON.stringify(f.props) : ''
          ]);
        });
      });

      const csvText = toCSVtext(cols, rows);
      const outName = `${cleanBase}.csv`;
      downloadBlob(csvText, outName, 'text/csv');
      return { success: true, fileName: outName, byteCount: new Blob([csvText]).size, formatName: 'CSV Coordinate Table' };
    }

    case 'xlsx': {
      const cols = ['Feature_Name', 'Geometry_Type', 'Point_Index', 'Latitude', 'Longitude', 'UTM_Easting', 'UTM_Northing', 'Elevation_Z', 'Folder_Layer'];
      const rows: (string | number)[][] = [];

      exportFeatures.forEach(f => {
        f.pts.forEach((pt, idx) => {
          let lat = 0, lon = 0, E = 0, N = 0;
          if (f.kind === 'll') {
            lon = pt.a;
            lat = pt.b;
            const utm = lonLatToUtm(lon, lat, zone, south);
            E = utm.E;
            N = utm.N;
          } else {
            E = pt.a;
            N = pt.b;
            const ll = utmToLonLat(E, N, zone, south);
            lon = ll.lon;
            lat = ll.lat;
          }
          const z = f.props?.elevation ?? f.props?.Z ?? 0;
          rows.push([
            f.name || 'Feature',
            f.geom || 'point',
            idx + 1,
            lat.toFixed(7),
            lon.toFixed(7),
            E.toFixed(3),
            N.toFixed(3),
            z,
            f.folder || f.group || layerName
          ]);
        });
      });

      const xlsxBytes = makeXLSX([
        { name: 'Coordinates', rows: [cols, ...rows] },
        {
          name: 'Metadata',
          rows: [
            ['Parameter', 'Value'],
            ['Export Date', new Date().toISOString()],
            ['Total Features', exportFeatures.length],
            ['Total Points', rows.length],
            ['Working UTM Zone', `UTM ${zone}${south ? 'S' : 'N'}`],
            ['Software', 'BhuStudio Universal Geomatics Suite']
          ]
        }
      ]);
      const outName = `${cleanBase}.xlsx`;
      downloadBlob(xlsxBytes, outName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return { success: true, fileName: outName, byteCount: xlsxBytes.byteLength, formatName: 'Microsoft Excel Workbook' };
    }

    case 'gpx': {
      const gpxStr = gpxBuild(exportFeatures, cleanBase, include3dZ, zone, south);
      const outName = `${cleanBase}.gpx`;
      downloadBlob(gpxStr, outName, 'application/gpx+xml');
      return { success: true, fileName: outName, byteCount: new Blob([gpxStr]).size, formatName: 'GPS Exchange (GPX)' };
    }

    case 'shp': {
      const shpZipBytes = await buildShapefileZip(exportFeatures, cleanBase, zone, south);
      const outName = `${cleanBase}.shp.zip`;
      downloadBlob(shpZipBytes, outName, 'application/zip');
      return { success: true, fileName: outName, byteCount: shpZipBytes.byteLength, formatName: 'ESRI Shapefile ZIP' };
    }

    case 'topojson': {
      // TopoJSON wrapping of geojson
      const geoJsonStr = geoJsonBuild(exportFeatures, zone, south);
      const geoObj = JSON.parse(geoJsonStr);
      const topoObj = {
        type: 'Topology',
        objects: {
          [cleanBase]: geoObj
        },
        arcs: [],
        bbox: geoObj.bbox || [0, 0, 0, 0]
      };
      const topoStr = JSON.stringify(topoObj, null, 2);
      const outName = `${cleanBase}.topojson`;
      downloadBlob(topoStr, outName, 'application/json');
      return { success: true, fileName: outName, byteCount: new Blob([topoStr]).size, formatName: 'TopoJSON Shared Mesh' };
    }

    case 'wkt': {
      const wktRows = exportFeatures.map(f => {
        let ptsStr = '';
        if (f.pts.length === 1) {
          const pt = f.pts[0];
          ptsStr = `POINT(${coordSystem === 'utm' ? `${pt.a} ${pt.b}` : `${pt.a} ${pt.b}`})`;
        } else if (f.geom === 'polygon') {
          const coords = f.pts.map(p => `${p.a} ${p.b}`).join(', ');
          ptsStr = `POLYGON((${coords}))`;
        } else {
          const coords = f.pts.map(p => `${p.a} ${p.b}`).join(', ');
          ptsStr = `LINESTRING(${coords})`;
        }
        return `${f.name || 'Geometry'}\t${ptsStr}`;
      });
      const wktText = wktRows.join('\n');
      const outName = `${cleanBase}.wkt`;
      downloadBlob(wktText, outName, 'text/plain');
      return { success: true, fileName: outName, byteCount: new Blob([wktText]).size, formatName: 'Well-Known Text (WKT)' };
    }

    case 'landxml': {
      // Generate LandXML 1.2 string
      let cogoPointsXml = '';
      let parcelsXml = '';
      let pointId = 1;

      exportFeatures.forEach(f => {
        if (f.geom === 'point') {
          f.pts.forEach(pt => {
            let lat = pt.b, lon = pt.a;
            const utm = lonLatToUtm(lon, lat, zone, south);
            cogoPointsXml += `      <CogoPoint id="${pointId}" name="${f.name || `PT${pointId}`}" desc="${f.props?.code || ''}">${utm.N.toFixed(4)} ${utm.E.toFixed(4)} ${f.props?.elevation || 0}</CogoPoint>\n`;
            pointId++;
          });
        } else if (f.geom === 'polygon') {
          let coordsXml = '';
          f.pts.forEach(pt => {
            const utm = lonLatToUtm(pt.a, pt.b, zone, south);
            coordsXml += `          <Coord>${utm.N.toFixed(4)} ${utm.E.toFixed(4)}</Coord>\n`;
          });
          parcelsXml += `    <Parcel name="${f.name || 'Parcel'}" desc="${f.props?.owner || ''}">
      <CoordGeom>
${coordsXml}      </CoordGeom>
    </Parcel>\n`;
        }
      });

      const landXmlStr = `<?xml version="1.0" encoding="UTF-8"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" version="1.2" date="${new Date().toISOString().slice(0, 10)}" time="${new Date().toTimeString().slice(0, 8)}">
  <Units>
    <Metric linearUnit="meter" areaUnit="squareMeter" volumeUnit="cubicMeter" temperatureUnit="celsius" pressureUnit="HPA"/>
  </Units>
  <CoordinateSystem desc="UTM Zone ${zone}${south ? 'S' : 'N'}" epsgCode="${south ? 32700 + zone : 32600 + zone}"/>
  <CogoPoints>
${cogoPointsXml}  </CogoPoints>
  <Parcels>
${parcelsXml}  </Parcels>
</LandXML>`;

      const outName = `${cleanBase}.landxml`;
      downloadBlob(landXmlStr, outName, 'application/xml');
      return { success: true, fileName: outName, byteCount: new Blob([landXmlStr]).size, formatName: 'LandXML Civil Engineering' };
    }

    case 'project': {
      const fullProject = projectData || {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        settings: {
          workingZone: workingZoneStr,
          coordSystem
        },
        features: exportFeatures,
        storageDump: { ...localStorage }
      };
      const projectStr = JSON.stringify(fullProject, null, 2);
      const outName = `${cleanBase}_project.json`;
      downloadBlob(projectStr, outName, 'application/json');
      return { success: true, fileName: outName, byteCount: new Blob([projectStr]).size, formatName: 'GeoStudio Full Project Backup' };
    }

    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}
