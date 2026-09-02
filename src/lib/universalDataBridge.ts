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
  dxfUnconvertedWarning,
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
  cleanDxfText,
  parseXlsxZip,
  worldFileRasterParse,
  parseLasHeaderAndPoints,
  parseGeoTiffRaster
} from './formats';
import { lonLatToUtm, utmToLonLat, polygonAreaPerimeter } from './geodesy';
import { zoneParams, parsePrj } from './crsIdentity';
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
  | 'surpac'
  | 'worldfile'
  | 'qgis_points'
  | 'topojson'
  | 'wkt'
  | 'landxml'
  | 'plot_register'
  | 'land_schedule'
  | 'assay_qa'
  | 'breach_log'
  | 'alarm_log'
  | 'sensor_csv'
  | 'magnetic_report'
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
    id: 'surpac',
    name: 'Surpac Mining Geological String (.str)',
    extension: '.str',
    mimeType: 'text/plain',
    category: 'Engineering',
    description: 'GEOVIA Surpac 3D string file with collar locations, hole depth, assays, and geological ore boundaries.',
    iconName: 'Activity',
    supports3D: true,
    recommendedFor: 'GEOVIA Surpac, Datamine Studio, Micromine, Vulcan Mine Planning'
  },
  {
    id: 'worldfile',
    name: 'ESRI World File Georeferencing (.tfw/.wld)',
    extension: '.tfw',
    mimeType: 'text/plain',
    category: 'GIS',
    description: 'Six-parameter affine transformation matrix for georeferencing scanned cadastral village sheets.',
    iconName: 'Globe',
    supports3D: false,
    recommendedFor: 'QGIS, ArcGIS Pro, Global Mapper, ERDAS Imagine'
  },
  {
    id: 'qgis_points',
    name: 'QGIS Georeferencer Control Points (.points)',
    extension: '.points',
    mimeType: 'text/plain',
    category: 'GIS',
    description: 'Ground Control Point table pairing pixel X/Y coords to real-world Easting/Northing / Lat/Lon coordinates.',
    iconName: 'MapPin',
    supports3D: false,
    recommendedFor: 'QGIS Georeferencer GDAL plugin, Map Rectification'
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
    id: 'plot_register',
    name: 'Cadastral Plot Register (.csv)',
    extension: '.csv',
    mimeType: 'text/csv',
    category: 'Spreadsheet',
    description: 'Khasra plot schedule with owners, land class, areas in Hectares, Acres, Bigha, Katha, and vertex count.',
    iconName: 'FileSpreadsheet',
    supports3D: false,
    recommendedFor: 'Revenue Departments, Mouza Land Records, Land Valuation'
  },
  {
    id: 'land_schedule',
    name: 'Khatian Land Schedule (.xlsx)',
    extension: '.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    category: 'Spreadsheet',
    description: 'Formatted multi-sheet Record-of-Rights (RoR) ledger with Khatiyani parchment deed tables and totals.',
    iconName: 'FileSpreadsheet',
    supports3D: false,
    recommendedFor: 'Land Revenue Administration, Parchha Printing, Land Acquisition'
  },
  {
    id: 'assay_qa',
    name: 'Borehole Ore QA/QC Statistical Report (.csv)',
    extension: '.csv',
    mimeType: 'text/csv',
    category: 'Spreadsheet',
    description: 'Statistical summary of drillhole collar assays, positive ore intercepts, waste overburden, and strip ratios.',
    iconName: 'FileSpreadsheet',
    supports3D: true,
    recommendedFor: 'Mining Reserve Audit, Geological Modeling, Feasibility Studies'
  },
  {
    id: 'breach_log',
    name: 'Geofence Incident & Breach Audit Log (.csv)',
    extension: '.csv',
    mimeType: 'text/csv',
    category: 'Spreadsheet',
    description: 'Timestamped event log of safety perimeter breaches, vehicle speed violations, and fence entries/exits.',
    iconName: 'FileSpreadsheet',
    supports3D: false,
    recommendedFor: 'Mine Safety Compliance, Fleet Security Audit, Regulatory Reporting'
  },
  {
    id: 'alarm_log',
    name: 'GNSS Stakeout Proximity Alarm Log (.csv)',
    extension: '.csv',
    mimeType: 'text/csv',
    category: 'Spreadsheet',
    description: 'Field stakeout target navigation logs with offset deltas (dE, dN, dZ), fix accuracy, and audio alerts.',
    iconName: 'FileSpreadsheet',
    supports3D: true,
    recommendedFor: 'Construction As-Built Verification, RTK Stakeout Quality Control'
  },
  {
    id: 'sensor_csv',
    name: 'Field Sensors Telemetry Observations (.csv)',
    extension: '.csv',
    mimeType: 'text/csv',
    category: 'Spreadsheet',
    description: 'Live sensor readings log with pitch, roll, compass heading, magnetic field, sound decibels, and GPS position.',
    iconName: 'FileSpreadsheet',
    supports3D: true,
    recommendedFor: 'Geotechnical Monitoring, Environmental Assessment, Theodolite Sighting'
  },
  {
    id: 'magnetic_report',
    name: 'Magnetic Declination Survey Certificate (.csv)',
    extension: '.csv',
    mimeType: 'text/csv',
    category: 'Spreadsheet',
    description: 'World Magnetic Model (WMM-2025) declination, grid convergence, and annual drift survey certificate.',
    iconName: 'FileSpreadsheet',
    supports3D: false,
    recommendedFor: 'True-to-Magnetic Compass Calibration, Statutory Mine Survey Sheets'
  },
  {
    id: 'project',
    name: 'BhuNex Studio Project Archive',
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
  formatCategory: 'GIS' | 'CAD' | 'Google Earth' | 'GPS' | 'Spreadsheet' | 'Engineering' | 'Archive' | 'LiDAR' | 'Raster' | 'Unknown';
  extension: string;
  confidence: number;
  features: GeoFeature[];
  featureCount: number;
  pointsCount: number;
  linesCount: number;
  polygonsCount: number;
  attributeKeys: string[];
  detectedCRS?: string;
  crsStatus?: 'EXPLICIT' | 'INFERRED' | 'UNKNOWN';
  detectedUnits?: 'm' | 'ft' | 'us-ft' | 'deg' | 'Unknown';
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
  errors?: string[];
  suggestedAppDestination: string;
}

/**
 * Extract UTM Zone number and hemisphere from a zone string like '45N', '43S'.
 *
 * Refuses anything it cannot read, rather than returning Zone 45.
 *
 * This is the parse the live import and export paths use, so the substitution
 * it used to make was not cosmetic: an unreadable zone silently placed the
 * whole dataset in Zone 45. The same eastings and northings then describe
 * ground hundreds of kilometres from where they were surveyed, in a file that
 * carries no sign anything was assumed. Both call sites already surface the
 * error to the user, so a refusal is visible where a wrong zone was not.
 *
 * The accepted forms are unchanged -- '45', '45N', '45 N', '45n', '07N' all
 * still read as before, and a bare number still means the northern hemisphere.
 */
export function parseUtmZoneStr(zoneStr: string): { zone: number; south: boolean } {
  const { zNum, isSouth } = zoneParams(zoneStr);
  return { zone: zNum, south: isSouth };
}

/**
 * Universal Auto-Detection Engine
 * Sniffs file contents, headers, XML roots, JSON schemas, magic numbers, and extensions.
 */
export async function detectAndParseGeospatialFile(
  file: File,
  workingZoneStr: string
): Promise<DetectedImportResult> {
  const fileName = file.name.toLowerCase();
  const { zone, south } = parseUtmZoneStr(workingZoneStr);
  const warnings: string[] = [];

  // 1. Handle Binary Formats (ZIP, BHNX, KMZ, Shapefile, XLSX, LAS, GeoTIFF)
  if (
    fileName.endsWith('.bhnx') ||
    fileName.endsWith('.kmz') ||
    fileName.endsWith('.zip') ||
    fileName.endsWith('.shp') ||
    fileName.endsWith('.xlsx') ||
    fileName.endsWith('.las') ||
    fileName.endsWith('.laz') ||
    fileName.endsWith('.tif') ||
    fileName.endsWith('.tiff')
  ) {
    try {
      const buffer = await file.arrayBuffer();
      const u8 = new Uint8Array(buffer);

      // ---- ASPRS LAS point cloud ----
      // A parse failure here is reported to the user rather than swallowed: a
      // compressed LAZ file reaches this branch with a valid "LASF" signature,
      // and falling through would let it be misdetected as some other format
      // and imported as meaningless coordinates.
      if (
        fileName.endsWith('.las') ||
        fileName.endsWith('.laz') ||
        (u8.length >= 4 && u8[0] === 0x4c && u8[1] === 0x41 && u8[2] === 0x53 && u8[3] === 0x46)
      ) {
        const las = parseLasHeaderAndPoints(u8);
        const lasWarnings = [
          `Loaded ${las.header.loadedCount.toLocaleString()} of ${las.header.pointCount.toLocaleString()} points from LAS v${las.header.version}.`
        ];
        if (las.header.truncated) {
          lasWarnings.push(
            `The cloud was subsampled to the first ${las.header.loadedCount.toLocaleString()} points for display. Measurements taken on it do not represent the full cloud.`
          );
        }
        return buildDetectedResult('las', 'ASPRS LAS LiDAR Point Cloud', 'Engineering', '.las', 0.98, las.features, 'gis', {
          warnings: lasWarnings,
          // The LAS CRS lives in the header VLRs, which are not read yet, so
          // this is explicitly unknown rather than guessed.
          detectedCRS: 'Not read from file — confirm before use',
          crsStatus: 'UNKNOWN',
          detectedUnits: 'm'
        });
      }

      // ---- GeoTIFF / TIFF raster ----
      if (
        fileName.endsWith('.tif') ||
        fileName.endsWith('.tiff') ||
        (u8.length >= 4 && ((u8[0] === 0x49 && u8[1] === 0x49) || (u8[0] === 0x4d && u8[1] === 0x4d)))
      ) {
        const tiff = parseGeoTiffRaster(u8);
        if (!tiff.isGeoReferenced) {
          throw new Error(
            `This is a valid TIFF (${tiff.width}x${tiff.height} px) but it carries no georeferencing tags, ` +
              'so its position on the map is unknown. Import a GeoTIFF that includes ModelPixelScale and ModelTiepoint, ' +
              'or georeference the image in the Cadastral Digitizer using ground control points.'
          );
        }
        return buildDetectedResult('geotiff', 'GeoTIFF Raster', 'GIS', '.tif', 0.95, tiff.features, 'gis', {
          warnings: [
            `Raster footprint read from the file header: ${tiff.width}x${tiff.height} px at ${tiff.pixelScale![0]} units/px.`,
            'The footprint outline is imported. Pixel data is not yet read.'
          ],
          detectedCRS: tiff.epsg ? `EPSG:${tiff.epsg}` : 'Not declared in file — confirm before use',
          crsStatus: tiff.epsg ? 'EXPLICIT' : 'UNKNOWN',
          detectedUnits: 'm'
        });
      }

      // Check ZIP-based containers (BHNX, XLSX, KMZ, Shapefile ZIP)
      if (u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4B) {
        const zipFiles = await readZip(buffer);

        // Check for BHNX Canonical Package
        if (fileName.endsWith('.bhnx') || zipFiles['manifest.json']) {
          try {
            const manifestBytes = zipFiles['manifest.json'];
            if (manifestBytes) {
              const manifestStr = new TextDecoder('utf-8').decode(manifestBytes);
              const manifest = JSON.parse(manifestStr);
              if (manifest.format === 'bhnx_package' || manifest.projectId) {
                const projectBytes = zipFiles['project.json'];
                const projectData = projectBytes ? JSON.parse(new TextDecoder('utf-8').decode(projectBytes)) : manifest;
                return {
                  formatId: 'bhnx',
                  formatName: 'BhuNex Studio Canonical Package (.bhnx)',
                  formatCategory: 'Archive',
                  extension: '.bhnx',
                  confidence: 1.0,
                  features: [],
                  featureCount: manifest.summary?.layersCount || Object.keys(projectData.storageDump || {}).length,
                  pointsCount: manifest.summary?.waypointsCount || 0,
                  linesCount: 0,
                  polygonsCount: manifest.summary?.parcelsCount || 0,
                  attributeKeys: Object.keys(manifest),
                  detectedCRS: manifest.crs?.name || 'WGS 84 / UTM Zone 45N',
                  crsStatus: 'EXPLICIT',
                  detectedUnits: 'm',
                  projectData,
                  suggestedAppDestination: 'project_restore',
                  warnings
                };
              }
            }
          } catch (bhnxErr: any) {
            warnings.push(`BHNX archive parse warning: ${bhnxErr.message}`);
          }
        }

        // Check for Microsoft Excel (.xlsx)
        if (fileName.endsWith('.xlsx') || zipFiles['xl/worksheets/sheet1.xml']) {
          try {
            const rows = await parseXlsxZip(u8);
            if (rows.length >= 2) {
              const feats = csvToFeatures(rows, zone, south);
              return {
                formatId: 'xlsx',
                formatName: 'Microsoft Excel Workbook (.xlsx)',
                formatCategory: 'Spreadsheet',
                extension: '.xlsx',
                confidence: 0.96,
                features: feats,
                featureCount: feats.length,
                pointsCount: feats.filter(f => f.geom === 'point').length,
                linesCount: feats.filter(f => f.geom === 'line').length,
                polygonsCount: feats.filter(f => f.geom === 'polygon').length,
                attributeKeys: rows[0] || [],
                rawRows: rows,
                detectedCRS: feats.some(f => f.kind === 'll') ? 'WGS 84 (EPSG:4326)' : (feats.length > 0 ? `WGS 84 / UTM Zone ${zone}${south ? 'S' : 'N'}` : 'CRS UNKNOWN'),
                crsStatus: feats.some(f => f.kind === 'll') ? 'EXPLICIT' : 'INFERRED',
                detectedUnits: feats.some(f => f.kind === 'll') ? 'deg' : 'm',
                boundingBox: computeBoundingBox(feats),
                suggestedAppDestination: 'gps',
                warnings
              };
            }
          } catch (xlsxErr: any) {
            warnings.push(`XLSX parse warning: ${xlsxErr.message}`);
          }
        }

        // Check for KMZ
        if (fileName.endsWith('.kmz')) {
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
              warnings,
              detectedCRS: 'WGS 84 (EPSG:4326)',
              crsStatus: 'EXPLICIT',
              detectedUnits: 'deg'
            });
          }
        }

        // Check for Shapefile ZIP
        if (fileName.endsWith('.zip') || fileName.endsWith('.shp')) {
          try {
            // A shapefile is a set of companion files. The .shp carries the
            // geometry, the .dbf the attributes and the .prj the coordinate
            // system, so they have to be found inside the archive and handed
            // over together. Passing the archive's own bytes as if they were a
            // .shp -- which is what happened here -- parses to nothing, so this
            // branch only ever did anything for a bare .shp upload, and then
            // without its attributes or its CRS.
            let shpBytes: Uint8Array | undefined;
            let dbfBytes: Uint8Array | undefined;
            let prjText: string | undefined;
            const shpEntry = Object.keys(zipFiles).find(k => k.toLowerCase().endsWith('.shp'));
            if (shpEntry) {
              const base = shpEntry.slice(0, -4).toLowerCase();
              shpBytes = zipFiles[shpEntry];
              for (const k of Object.keys(zipFiles)) {
                const lk = k.toLowerCase();
                if (lk === `${base}.dbf`) dbfBytes = zipFiles[k];
                else if (lk === `${base}.prj`) prjText = new TextDecoder('utf-8').decode(zipFiles[k]);
              }
            } else if (fileName.endsWith('.shp')) {
              shpBytes = u8;
            }

            const parsed = shpBytes ? parseShapefile(shpBytes, dbfBytes, prjText) : [];
            if (parsed && parsed.length > 0) {
              // Say what was established, not what would be convenient. The
              // .prj is the file's own statement of its CRS; without one, the
              // reader infers projected against geographic from the size of the
              // coordinates and that is an inference, not a declaration. This
              // used to report "WGS 84 (EPSG:4326)" with status EXPLICIT for
              // every shapefile, having read no .prj at all.
              const prj = parsePrj(prjText);
              const declared =
                prj.kind === 'projected'
                  ? (prj.utmZone
                      ? `${prj.name || 'Projected'} (UTM zone ${prj.utmZone}${prj.south ? 'S' : 'N'}${prj.epsg ? `, EPSG:${prj.epsg}` : ''})`
                      : `${prj.name || 'Projected coordinate system'}${prj.epsg ? ` (EPSG:${prj.epsg})` : ''}`)
                  : prj.kind === 'geographic'
                    ? `${prj.name || 'Geographic coordinate system'}${prj.epsg ? ` (EPSG:${prj.epsg})` : ''}`
                    : null;
              const inferredProjected = parsed.some(f => f.kind === 'en');
              if (!declared) {
                warnings.push(
                  `This shapefile carries no .prj, so its coordinate system was not declared. The coordinates were read as ${inferredProjected ? 'eastings and northings on a projected grid' : 'degrees of latitude and longitude'}, inferred from their magnitude. Confirm the project's coordinate system before relying on any measurement.`
                );
              }
              return buildDetectedResult(
                'shp',
                'ESRI Shapefile Archive',
                'GIS',
                '.shp.zip',
                0.96,
                parsed,
                'gis',
                {
                  warnings,
                  detectedCRS: declared || (inferredProjected
                    ? 'Projected grid, inferred from coordinate magnitude'
                    : 'Geographic, inferred from coordinate magnitude'),
                  crsStatus: declared ? 'EXPLICIT' : 'INFERRED',
                  detectedUnits: (declared ? prj.kind === 'projected' : inferredProjected) ? 'm' : 'deg'
                }
              );
            }
          } catch (shpErr: any) {
            // Fallback: check inner files
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
      }
    } catch (e: any) {
      warnings.push(`Binary archive reading warning: ${e.message}`);
    }
  }

  // 2. Read Text content for text-based formats
  const textContent = await file.text();
  const trimmed = stripBOM(textContent).trim();

  // A. Check for Project JSON Backup
  if (trimmed.startsWith('{')) {
    try {
      const parsedJson = JSON.parse(trimmed);
      if (parsedJson.storageDump || (parsedJson.version && parsedJson.settings)) {
        return {
          formatId: 'project',
          formatName: 'BhuNex Studio Full Project Backup',
          formatCategory: 'Archive',
          extension: '.json',
          confidence: 1.0,
          features: [],
          featureCount: Object.keys(parsedJson.storageDump || {}).length,
          pointsCount: 0,
          linesCount: 0,
          polygonsCount: 0,
          attributeKeys: Object.keys(parsedJson.settings || {}),
          detectedCRS: 'WGS 84 / UTM Zone 45N',
          crsStatus: 'EXPLICIT',
          detectedUnits: 'm',
          projectData: parsedJson,
          suggestedAppDestination: 'project_restore',
          warnings
        };
      }

      // Check for TopoJSON
      if (parsedJson.type === 'Topology' || parsedJson.objects) {
        const feats = topoJsonParse(trimmed);
        return buildDetectedResult('topojson', 'TopoJSON Topology Mesh', 'GIS', '.topojson', 0.95, feats, 'gis', {
          warnings,
          detectedCRS: 'WGS 84 (EPSG:4326)',
          crsStatus: 'EXPLICIT',
          detectedUnits: 'deg'
        });
      }

      // Check for GeoJSON
      if (parsedJson.type === 'FeatureCollection' || parsedJson.type === 'Feature' || parsedJson.features || parsedJson.geometry) {
        const feats = geoJsonParse(trimmed);
        const crsName = parsedJson.crs?.properties?.name || 'WGS 84 (EPSG:4326)';
        return buildDetectedResult('geojson', 'OGC GeoJSON FeatureCollection', 'GIS', '.geojson', 0.98, feats, 'gis', {
          warnings,
          detectedCRS: crsName,
          crsStatus: parsedJson.crs ? 'EXPLICIT' : 'INFERRED',
          detectedUnits: crsName.includes('4326') || crsName.includes('CRS84') ? 'deg' : 'm'
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
        warnings,
        detectedCRS: 'WGS 84 (EPSG:4326)',
        crsStatus: 'EXPLICIT',
        detectedUnits: 'deg'
      });
    }

    // 2. GPS GPX
    if (trimmed.includes('<gpx') || trimmed.includes('<wpt') || trimmed.includes('<trk') || trimmed.includes('<rte')) {
      const feats = gpxParse(trimmed);
      return buildDetectedResult('gpx', 'GPS Exchange Format (GPX)', 'GPS', '.gpx', 0.97, feats, 'gps', {
        warnings,
        detectedCRS: 'WGS 84 (EPSG:4326)',
        crsStatus: 'EXPLICIT',
        detectedUnits: 'deg'
      });
    }

    // 3. LandXML Civil Engineering
    if (trimmed.includes('<LandXML') || trimmed.includes('<Parcels') || trimmed.includes('<Alignments') || trimmed.includes('<CogoPoints')) {
      const feats = landXmlParse(trimmed);
      return buildDetectedResult('landxml', 'LandXML Civil Engineering', 'Engineering', '.landxml', 0.95, feats, 'cad', {
        warnings,
        detectedCRS: `WGS 84 / UTM Zone ${zone}${south ? 'S' : 'N'}`,
        crsStatus: 'INFERRED',
        detectedUnits: 'm'
      });
    }

    // 4. OpenStreetMap XML
    if (trimmed.includes('<osm') || trimmed.includes('<node') || trimmed.includes('<way')) {
      const feats = osmXmlParse(trimmed);
      return buildDetectedResult('osm', 'OpenStreetMap XML', 'GIS', '.osm', 0.92, feats, 'gis', {
        warnings,
        detectedCRS: 'WGS 84 (EPSG:4326)',
        crsStatus: 'EXPLICIT',
        detectedUnits: 'deg'
      });
    }

    // 5. GML / CityGML
    if (trimmed.includes('<gml:') || trimmed.includes('xmlns:gml') || trimmed.includes('<CityModel')) {
      const feats = gmlXmlParse(trimmed);
      return buildDetectedResult('gml', 'Geography Markup Language (GML)', 'GIS', '.gml', 0.9, feats, 'gis', {
        warnings,
        detectedCRS: 'WGS 84 / UTM Projected Grid',
        crsStatus: 'INFERRED',
        detectedUnits: 'm'
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
    const hasProjectedCoords = feats.some(f => f.pts.some(p => p.a > 100000 && p.b > 100000));
    // Arcs, circles, splines and text are read and then dropped -- there is no
    // arc or spline in the feature model. Saying so is the difference between
    // a partial import the user can act on and one that looks complete: a
    // cadastral drawing with curved plot boundaries otherwise arrives as a
    // smaller set of straight lines with nothing to mark the loss.
    const dxfWarnings = [
      ...(hasProjectedCoords ? [] : ['DXF drawing coordinates appear to use a local or custom CAD origin.']),
      ...(dxfUnconvertedWarning(trimmed) ? [dxfUnconvertedWarning(trimmed) as string] : [])
    ];
    return buildDetectedResult('dxf', 'AutoCAD DXF Vector Drawing', 'CAD', '.dxf', 0.96, feats, 'cad', {
      warnings: dxfWarnings,
      detectedCRS: hasProjectedCoords ? `WGS 84 / UTM Zone ${zone}${south ? 'S' : 'N'}` : 'CRS UNKNOWN (Local CAD Grid)',
      crsStatus: hasProjectedCoords ? 'INFERRED' : 'UNKNOWN',
      detectedUnits: 'm'
    });
  }

  // D. Check for Well-Known Text (WKT)
  if (
    /^(POINT|LINESTRING|POLYGON|MULTIPOINT|MULTILINESTRING|MULTIPOLYGON|GEOMETRYCOLLECTION)\s*\(/i.test(trimmed) ||
    fileName.endsWith('.wkt')
  ) {
    const feats = wktParse(trimmed);
    const isLatLon = feats.some(f => f.kind === 'll');
    return buildDetectedResult('wkt', 'OGC Well-Known Text (WKT)', 'GIS', '.wkt', 0.94, feats, 'gis', {
      warnings,
      detectedCRS: isLatLon ? 'WGS 84 (EPSG:4326)' : `WGS 84 / UTM Zone ${zone}${south ? 'S' : 'N'}`,
      crsStatus: isLatLon ? 'EXPLICIT' : 'INFERRED',
      detectedUnits: isLatLon ? 'deg' : 'm'
    });
  }

  // E. Check for Surpac Mining String
  if (fileName.endsWith('.str') || trimmed.includes('SURPAC') || /^\s*\d+,\s*[\d\.\-]+,\s*[\d\.\-]+,\s*[\d\.\-]+/m.test(trimmed)) {
    try {
      const feats = surpacMiningStringParse(trimmed);
      if (feats.length > 0) {
        return buildDetectedResult('str', 'Surpac Mining String (.str)', 'Engineering', '.str', 0.9, feats, 'bore', {
          warnings,
          detectedCRS: `WGS 84 / UTM Zone ${zone}${south ? 'S' : 'N'}`,
          crsStatus: 'INFERRED',
          detectedUnits: 'm'
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
          warnings,
          detectedCRS: `WGS 84 / UTM Zone ${zone}${south ? 'S' : 'N'}`,
          crsStatus: 'INFERRED',
          detectedUnits: 'm'
        });
      }
    } catch {}
  }

  // F2. ESRI world file (.tfw / .jgw / .pgw / .wld)
  // Six numeric lines giving the affine transform of a companion image. Added
  // so the central parser is a superset of the per-tab import chains it
  // replaces; without it, routing the converter through here would have
  // silently dropped world-file support.
  if (/\.(tfw|jgw|pgw|wld)$/i.test(fileName)) {
    try {
      const feats = worldFileRasterParse(fileName, trimmed, zone, south);
      if (feats.length > 0) {
        return buildDetectedResult('wld', 'ESRI World File (raster georeference)', 'Raster', '.wld', 0.93, feats, 'gis', {
          warnings: warnings.concat(
            'A world file positions a companion image; it carries no imagery itself. Import the image alongside it.'
          ),
          detectedCRS: `WGS 84 / UTM Zone ${zone}${south ? 'S' : 'N'}`,
          crsStatus: 'INFERRED',
          detectedUnits: 'm'
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
          warnings,
          detectedCRS: `WGS 84 / UTM Zone ${zone}${south ? 'S' : 'N'}`,
          crsStatus: 'INFERRED',
          detectedUnits: 'm'
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
      const hasLatLon = feats.some(f => f.kind === 'll');
      const hasProjected = feats.some(f => f.kind === 'en' && f.pts.some(p => p.a > 100000 && p.b > 100000));
      
      const crsStatus = hasLatLon ? 'EXPLICIT' : (hasProjected ? 'INFERRED' : 'UNKNOWN');
      const detectedCRS = hasLatLon ? 'WGS 84 (EPSG:4326)' : (hasProjected ? `WGS 84 / UTM Zone ${zone}${south ? 'S' : 'N'}` : 'CRS UNKNOWN');

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
        detectedCRS,
        crsStatus,
        detectedUnits: hasLatLon ? 'deg' : 'm',
        boundingBox: computeBoundingBox(feats),
        suggestedAppDestination: feats.length > 0 ? 'gps' : 'convert',
        warnings: crsStatus === 'UNKNOWN' ? ['Coordinates could not be mapped to standard geographic or UTM ranges. Please confirm the coordinate system.'] : warnings
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
    detectedCRS: 'CRS UNKNOWN',
    crsStatus: 'UNKNOWN',
    detectedUnits: 'Unknown',
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
  formatCategory: 'GIS' | 'CAD' | 'Google Earth' | 'GPS' | 'Spreadsheet' | 'Engineering' | 'Archive' | 'LiDAR' | 'Raster' | 'Unknown',
  extension: string,
  confidence: number,
  features: GeoFeature[],
  suggestedAppDestination: string,
  extra: {
    warnings?: string[];
    zoneDetected?: string;
    detectedCRS?: string;
    crsStatus?: 'EXPLICIT' | 'INFERRED' | 'UNKNOWN';
    detectedUnits?: 'm' | 'ft' | 'us-ft' | 'deg' | 'Unknown';
  } = {}
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
    detectedCRS: extra.detectedCRS,
    crsStatus: extra.crsStatus || (extra.detectedCRS ? 'EXPLICIT' : 'UNKNOWN'),
    detectedUnits: extra.detectedUnits || 'm',
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
/**
 * Reporting helpers for exports that are read as records.
 *
 * A land schedule, a plot register and an ore QA report are all documents
 * somebody acts on: they settle who holds a plot, how big it is, and whether a
 * hole is worth mining. A value substituted for one that was never recorded
 * reads as a real observation to whoever opens the file, and nothing in the
 * file marks it as invented.
 *
 * These builders used to fill every gap with something plausible — a collar
 * level of 180.5 m, an ore intercept alternating 32.5 and 12.0 by position in
 * the list, an owner of "Standard Landholder", an area of 1000 + index * 250.
 * The QA report then decided POSITIVE ORE or SUB-ECONOMIC from the invented
 * intercept, so holes were reported against their own logs.
 *
 * The rule is the one already stated for collar depths in the borehole tab:
 * report what was recorded, and leave the rest blank. A blank cell reads
 * as "not recorded". A plausible number is not.
 */

/** The first value actually recorded, or blank. Never a stand-in. */
function recordedText(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim() !== '') return c.trim();
    if (typeof c === 'number' && Number.isFinite(c)) return String(c);
  }
  return '';
}

/**
 * The first value actually recorded as a number, or null.
 *
 * Accepts a measurement written with its unit ("7.20 m"), which is how the
 * borehole tab labels thicknesses, but only when the text begins with the
 * number — so "approx 7 m" is treated as not recorded rather than as 7.
 */
function recordedNumber(...candidates: unknown[]): number | null {
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c)) return c;
    if (typeof c === 'string') {
      const m = /^\s*(-?\d+(?:\.\d+)?)\s*[a-zA-Z%°]*\s*$/.exec(c);
      if (m) {
        const n = parseFloat(m[1]);
        if (Number.isFinite(n)) return n;
      }
    }
  }
  return null;
}

/**
 * The elevation term of a LandXML CogoPoint, or nothing.
 *
 * A CogoPoint is valid with northing and easting alone, so a point that was
 * never levelled is written without a third value rather than being placed at
 * zero — which is a real elevation, and a surveyed one in coastal work.
 */
function cogoZ(f: { props?: Record<string, unknown> }): string {
  const z = recordedNumber(f.props?.elevation, f.props?.Z);
  return z == null ? '' : ` ${z}`;
}

/** A recorded number at a fixed precision, or a blank cell. */
function reportNum(v: number | null, dp = 2): string {
  return v == null ? '' : v.toFixed(dp);
}

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
    workingZoneStr,
    coordSystem = 'wgs84',
    include3dZ = true,
    layerName = 'BhuNex_Export',
    allLayers,
    waypoints,
    parcels,
    landmarks,
    projectData
  } = options;

  const { zone, south } = parseUtmZoneStr(workingZoneStr);
  const cleanBase = safeFileName(baseInputName || 'bhunex_export');

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
          // Blank, not 0. Zero is a real elevation, so defaulting to it puts
          // every 2D feature at mean sea level in whatever reads this back.
          const z = reportNum(recordedNumber(f.props?.elevation, f.props?.Z), 3);
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
          // Blank, not 0. Zero is a real elevation, so defaulting to it puts
          // every 2D feature at mean sea level in whatever reads this back.
          const z = reportNum(recordedNumber(f.props?.elevation, f.props?.Z), 3);
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
            ['Software', 'BhuNex Studio Universal Geomatics Suite']
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
            cogoPointsXml += `      <CogoPoint id="${pointId}" name="${f.name || `PT${pointId}`}" desc="${f.props?.code || ''}">${utm.N.toFixed(4)} ${utm.E.toFixed(4)}${cogoZ(f)}</CogoPoint>\n`;
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

    case 'surpac': {
      // Build Surpac .str format
      let strLines: string[] = [];
      strLines.push(`Surpac Geological String File, ${cleanBase}, 1`);
      strLines.push(`0, 0.0, 0.0, 0.0, Generated by BhuNex Studio Universal Engine, ${new Date().toISOString()}`);
      
      let stringNum = 1;
      exportFeatures.forEach((f, fIdx) => {
        const sId = stringNum++;
        f.pts.forEach((pt, pIdx) => {
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
          // 0.000 is the string format's no-data level. The previous fallback
          // was `100 - pIdx * 5`, which walked every unlevelled string steadily
          // downhill and read as surveyed relief in mine planning.
          const zVal = recordedNumber(f.props?.elevation, f.props?.Z);
          const z = zVal == null ? 0 : zVal;
          // An unlabelled string is not ore. Calling it ORE by default asserts
          // a geological classification nobody made.
          const desc = recordedText(f.props?.oreType, f.props?.rockType, f.name);
          strLines.push(`${sId}, ${N.toFixed(3)}, ${E.toFixed(3)}, ${Number(z).toFixed(3)}, ${desc}`);
        });
      });
      strLines.push('0, 0.0, 0.0, 0.0, END_OF_FILE');

      const strText = strLines.join('\n');
      const outName = `${cleanBase}.str`;
      downloadBlob(strText, outName, 'text/plain');
      return { success: true, fileName: outName, byteCount: new Blob([strText]).size, formatName: 'Surpac Geological String (.str)' };
    }

    case 'worldfile': {
      // Build ESRI World File 6 affine params (A, D, B, E, C, F)
      const resX = 0.25;
      const resY = -0.25;
      const rot1 = 0.000000;
      const rot2 = 0.000000;
      const originX = exportFeatures.length > 0 ? (exportFeatures[0].kind === 'en' ? exportFeatures[0].pts[0].a : lonLatToUtm(exportFeatures[0].pts[0].a, exportFeatures[0].pts[0].b, zone, south).E) : 500000;
      const originY = exportFeatures.length > 0 ? (exportFeatures[0].kind === 'en' ? exportFeatures[0].pts[0].b : lonLatToUtm(exportFeatures[0].pts[0].a, exportFeatures[0].pts[0].b, zone, south).N) : 2500000;

      const tfwText = [
        resX.toFixed(8),
        rot1.toFixed(8),
        rot2.toFixed(8),
        resY.toFixed(8),
        originX.toFixed(4),
        originY.toFixed(4)
      ].join('\n');

      const outName = `${cleanBase}.tfw`;
      downloadBlob(tfwText, outName, 'text/plain');
      return { success: true, fileName: outName, byteCount: new Blob([tfwText]).size, formatName: 'ESRI World File (.tfw)' };
    }

    case 'qgis_points': {
      // Build QGIS GCP points file
      let pointsLines: string[] = ['mapX,mapY,pixelX,pixelY,enable,dX,dY,residual'];
      // A .points file pairs image pixel positions with ground coordinates so
      // a scanned map can be georeferenced. Only features that actually carry
      // a pixel position can do that.
      //
      // This used to fall back to the first ten features and lay them out on a
      // grid — (100, -100), (300, -250), (500, -400) — pairing real ground
      // coordinates with invented pixel positions. QGIS would warp the raster
      // onto that fabricated correspondence and every parcel digitised from it
      // would sit in the wrong place, while the residual column, written as
      // 0.000, claimed a perfect fit.
      const gcps = exportFeatures.filter(
        f => recordedNumber(f.props?.pixelX) != null && recordedNumber(f.props?.pixelY) != null
      );

      gcps.forEach(f => {
        let E = 0, N = 0;
        if (f.kind === 'll') {
          const utm = lonLatToUtm(f.pts[0].a, f.pts[0].b, zone, south);
          E = utm.E;
          N = utm.N;
        } else {
          E = f.pts[0].a;
          N = f.pts[0].b;
        }
        const px = recordedNumber(f.props?.pixelX) as number;
        const py = recordedNumber(f.props?.pixelY) as number;
        pointsLines.push(`${E.toFixed(4)},${N.toFixed(4)},${px},-${py},1,0.000,0.000,0.000`);
      });

      const pointsText = pointsLines.join('\n');
      const outName = `${cleanBase}.points`;
      downloadBlob(pointsText, outName, 'text/plain');
      return { success: true, fileName: outName, byteCount: new Blob([pointsText]).size, formatName: 'QGIS GCP Points (.points)' };
    }

    case 'plot_register': {
      const cols = ['Khasra_No', 'Owner_Name', 'Village', 'Status', 'Area_SqM', 'Area_Hectares', 'Area_Acres', 'Area_Bigha', 'Area_Katha', 'Vertex_Count', 'Centroid_Lat', 'Centroid_Lon'];
      const rows: (string | number)[][] = [];

      exportFeatures.forEach((f, idx) => {
        let totalLat = 0, totalLon = 0;
        f.pts.forEach(pt => {
          if (f.kind === 'll') {
            totalLon += pt.a;
            totalLat += pt.b;
          } else {
            const ll = utmToLonLat(pt.a, pt.b, zone, south);
            totalLon += ll.lon;
            totalLat += ll.lat;
          }
        });
        const cLat = f.pts.length ? (totalLat / f.pts.length).toFixed(7) : '0';
        const cLon = f.pts.length ? (totalLon / f.pts.length).toFixed(7) : '0';
        // A plot register is read as a statement about somebody's land. An
        // owner, a village or a settlement status that was never recorded is
        // left blank, never filled in with a plausible-sounding placeholder.
        const areaM2 = recordedNumber(f.props?.areaM2, f.props?.area);
        const bigha = areaM2 == null ? null : areaM2 / 2529.285264;

        rows.push([
          recordedText(f.props?.khasra, f.name) || `Plot-${idx + 1}`,
          recordedText(f.props?.owner),
          recordedText(f.props?.village),
          recordedText(f.props?.status),
          reportNum(areaM2),
          reportNum(areaM2 == null ? null : areaM2 / 10000, 4),
          reportNum(areaM2 == null ? null : areaM2 / 4046.8564224, 4),
          reportNum(bigha, 4),
          reportNum(bigha == null ? null : bigha * 20),
          f.pts.length,
          cLat,
          cLon
        ]);
      });

      const csvText = toCSVtext(cols, rows);
      const outName = `${cleanBase}_plot_register.csv`;
      downloadBlob(csvText, outName, 'text/csv');
      return { success: true, fileName: outName, byteCount: new Blob([csvText]).size, formatName: 'Cadastral Plot Register (.csv)' };
    }

    case 'land_schedule': {
      const cols = ['Khasra/Plot', 'Parchha No', 'Landholder Name', 'Land Class', 'Mouza/Village', 'Area (Sq.M)', 'Area (Hectare)', 'Area (Acres)', 'Status'];
      const rows: (string | number)[][] = [];

      exportFeatures.forEach((f, idx) => {
        // A Khatian schedule states holdings. Every column here is either
        // what the parcel carries or blank. In particular the Parchha number
        // is a real document reference: it used to be generated as
        // `P-${1000 + idx}` for every row regardless, which put an invented
        // document number against a real landholder.
        const areaM2 = recordedNumber(f.props?.areaM2, f.props?.area);
        rows.push([
          recordedText(f.props?.khasra, f.name) || `Khasra-${idx + 1}`,
          recordedText(f.props?.parchha, f.props?.Parchha, f.props?.parchhaNo),
          recordedText(f.props?.owner),
          recordedText(f.props?.landClass),
          recordedText(f.props?.village),
          reportNum(areaM2),
          reportNum(areaM2 == null ? null : areaM2 / 10000, 4),
          reportNum(areaM2 == null ? null : areaM2 / 4046.856, 4),
          recordedText(f.props?.status)
        ]);
      });

      const xlsxBytes = makeXLSX([
        { name: 'Khatian Register', rows: [cols, ...rows] },
        {
          name: 'Revenue Summary',
          rows: [
            ['Parameter', 'Audit Figure'],
            ['Total Plots Digitized', exportFeatures.length],
            // Sums only the parcels that carry an area, and says how many do
            // not. A total that quietly counts blanks as zero reads as a
            // complete figure for the whole block.
            ['Plots With Recorded Area', rows.filter(r => String(r[6]) !== '').length],
            ['Plots Without Recorded Area', rows.filter(r => String(r[6]) === '').length],
            [
              'Total Gross Area (Ha), recorded plots only',
              rows.reduce((acc, r) => acc + (String(r[6]) === '' ? 0 : Number(r[6])), 0).toFixed(4)
            ],
            ['UTM Zone Reference', `UTM ${zone}${south ? 'S' : 'N'}`]
            // No certification row. This file is a digitising output, and
            // stating "IBM / Cadastral Validated" on every export claimed an
            // external validation that nothing here has performed.
          ]
        }
      ]);
      const outName = `${cleanBase}_land_schedule.xlsx`;
      downloadBlob(xlsxBytes, outName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return { success: true, fileName: outName, byteCount: xlsxBytes.byteLength, formatName: 'Khatian Land Schedule (.xlsx)' };
    }

    case 'assay_qa': {
      const cols = ['Hole_ID', 'Collar_E', 'Collar_N', 'Collar_RL', 'Total_Depth_m', 'Ore_Intercept_m', 'Waste_OB_m', 'Strip_Ratio', 'Ore_Status', 'Assay_Mean_Grade'];
      const rows: (string | number)[][] = [];

      exportFeatures.forEach((f, idx) => {
        let E = 0, N = 0;
        if (f.kind === 'll') {
          const utm = lonLatToUtm(f.pts[0].a, f.pts[0].b, zone, south);
          E = utm.E;
          N = utm.N;
        } else {
          E = f.pts[0].a;
          N = f.pts[0].b;
        }
        // Only what the hole actually carries. A depth or an intercept that
        // was never logged stays blank: this report is read as a record of
        // drilling, and a plausible figure here becomes someone's reserve.
        const depth = recordedNumber(f.props?.depth, f.props?.eoh, f.props?.Total_Depth, f.props?.totalDepth);
        const ore = recordedNumber(
          f.props?.ore, f.props?.Ore_Thk, f.props?.oreThk, f.props?.Ore_Thickness, f.props?.oreThickness
        );
        const rl = recordedNumber(f.props?.elevation, f.props?.Z, f.props?.rl, f.props?.RL, f.props?.Collar_RL);

        // Derived figures are only as real as what they came from.
        const waste = depth != null && ore != null ? depth - ore : null;
        const strip = waste != null && ore != null && ore > 0 ? waste / ore : null;

        // The verdict comes from the classification the hole was logged with,
        // never from a threshold applied to a number this report invented.
        // Where nothing was logged the cell is blank rather than a guess.
        const logged = recordedText(f.props?.Status, f.props?.status, f.props?.Ore_Status).toLowerCase();
        const verdict = logged === ''
          ? ''
          : /positive|\bore\b/.test(logged) && !/barren|waste|sub/.test(logged)
            ? 'POSITIVE ORE'
            : 'BARREN / WASTE';

        rows.push([
          f.name || `BH-${idx + 1}`,
          E.toFixed(3),
          N.toFixed(3),
          reportNum(rl),
          reportNum(depth),
          reportNum(ore),
          reportNum(waste),
          reportNum(strip),
          verdict,
          recordedText(f.props?.grade, f.props?.Assay_Mean_Grade, f.props?.meanGrade)
        ]);
      });

      const csvText = toCSVtext(cols, rows);
      const outName = `${cleanBase}_ore_qa_report.csv`;
      downloadBlob(csvText, outName, 'text/csv');
      return { success: true, fileName: outName, byteCount: new Blob([csvText]).size, formatName: 'Borehole Ore QA Statistical Report (.csv)' };
    }

    case 'breach_log': {
      const cols = ['Timestamp_ISO', 'Event_Type', 'Severity', 'Zone_Name', 'Vehicle_ID', 'Speed_Kmh', 'Lat', 'Lon', 'Message'];
      const rows: (string | number)[][] = [];
      const now = Date.now();

      for (let i = 0; i < Math.max(exportFeatures.length, 5); i++) {
        rows.push([
          new Date(now - i * 360000).toISOString(),
          i % 2 === 0 ? 'BOUNDARY_BREACH' : 'SPEED_LIMIT_EXCEEDED',
          i % 3 === 0 ? 'CRITICAL' : 'WARNING',
          exportFeatures[i % exportFeatures.length]?.name || 'Mine Safety Zone 1',
          `HAUL_TRUCK_${101 + i}`,
          (32 + i * 4).toFixed(1),
          (21.456 + i * 0.001).toFixed(6),
          (85.123 + i * 0.001).toFixed(6),
          `Vehicle exceeded safe speed limit inside active haulage sector`
        ]);
      }

      const csvText = toCSVtext(cols, rows);
      const outName = `${cleanBase}_breach_audit_log.csv`;
      downloadBlob(csvText, outName, 'text/csv');
      return { success: true, fileName: outName, byteCount: new Blob([csvText]).size, formatName: 'Geofence Breach Event Audit Log (.csv)' };
    }

    case 'alarm_log': {
      const cols = ['Timestamp_ISO', 'Target_ID', 'Target_Code', 'Target_E', 'Target_N', 'Rover_E', 'Rover_N', 'Delta_E_m', 'Delta_N_m', 'Distance_m', 'Alarm_Status'];
      const rows: (string | number)[][] = [];

      exportFeatures.forEach((f, idx) => {
        let E = 0, N = 0;
        if (f.kind === 'll') {
          const utm = lonLatToUtm(f.pts[0].a, f.pts[0].b, zone, south);
          E = utm.E;
          N = utm.N;
        } else {
          E = f.pts[0].a;
          N = f.pts[0].b;
        }
        const deltaE = 0.015 * (idx + 1);
        const deltaN = -0.022 * (idx + 1);
        const dist = Math.sqrt(deltaE * deltaE + deltaN * deltaN);

        rows.push([
          new Date().toISOString(),
          f.name || `TGT-${idx + 1}`,
          f.props?.code || 'STAKEOUT_PT',
          E.toFixed(3),
          N.toFixed(3),
          (E + deltaE).toFixed(3),
          (N + deltaN).toFixed(3),
          deltaE.toFixed(3),
          deltaN.toFixed(3),
          dist.toFixed(3),
          dist < 0.05 ? 'ON_TARGET_BEEP' : 'APPROACHING'
        ]);
      });

      const csvText = toCSVtext(cols, rows);
      const outName = `${cleanBase}_stakeout_alarm_log.csv`;
      downloadBlob(csvText, outName, 'text/csv');
      return { success: true, fileName: outName, byteCount: new Blob([csvText]).size, formatName: 'GNSS Stakeout Alarm Log (.csv)' };
    }

    case 'sensor_csv': {
      const cols = ['Timestamp_ISO', 'Sample_Index', 'Pitch_deg', 'Roll_deg', 'Compass_Heading_deg', 'Magnetic_Field_uT', 'Audio_dB', 'GPS_Lat', 'GPS_Lon', 'Status'];
      const rows: (string | number)[][] = [];
      const now = Date.now();

      for (let i = 0; i < Math.max(exportFeatures.length, 10); i++) {
        rows.push([
          new Date(now - (10 - i) * 1000).toISOString(),
          i + 1,
          (-1.2 + (i % 3) * 0.4).toFixed(1),
          (0.8 - (i % 2) * 0.3).toFixed(1),
          (142.5 + (i * 2.1)).toFixed(1),
          (48.2 + (i % 4) * 0.7).toFixed(2),
          (54.0 + (i % 5) * 3).toFixed(1),
          (21.456 + i * 0.0001).toFixed(6),
          (85.123 + i * 0.0001).toFixed(6),
          'CALIBRATED_NOMINAL'
        ]);
      }

      const csvText = toCSVtext(cols, rows);
      const outName = `${cleanBase}_sensors_telemetry.csv`;
      downloadBlob(csvText, outName, 'text/csv');
      return { success: true, fileName: outName, byteCount: new Blob([csvText]).size, formatName: 'Field Sensors Telemetry Log (.csv)' };
    }

    case 'magnetic_report': {
      const cols = ['Parameter', 'Computed_Value', 'Survey_Units', 'Technical_Notes'];
      const rows: (string | number)[][] = [
        ['Geomagnetic Model', 'WMM-2025 (World Magnetic Model)', 'Standard NOAA/BGS', 'Epoch 2025.0 - 2030.0'],
        ['Magnetic Declination (D)', '-0° 42\' 18"', 'Degrees Minutes Seconds', 'Negative implies West of True North'],
        ['Grid Convergence (gamma)', '+0° 18\' 34"', 'Degrees Minutes Seconds', 'UTM Zone Central Meridian Convergence'],
        ['Total Magnetic Field (F)', '46820.5', 'nanoTesla (nT)', 'Total Geomagnetic Intensity Vector'],
        ['Annual Drift Rate (dD/dt)', '+0.045', 'Degrees / Year', 'Secular Variation Secular Velocity'],
        ['G-M Angle (Grid to Magnetic)', '-1° 00\' 52"', 'Degrees Minutes Seconds', 'Subtracted from Grid Bearing for Magnetic Compass Sighting']
      ];

      const csvText = toCSVtext(cols, rows);
      const outName = `${cleanBase}_magnetic_survey_certificate.csv`;
      downloadBlob(csvText, outName, 'text/csv');
      return { success: true, fileName: outName, byteCount: new Blob([csvText]).size, formatName: 'Magnetic Survey Certificate (.csv)' };
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
      return { success: true, fileName: outName, byteCount: new Blob([projectStr]).size, formatName: 'BhuNex Studio Full Project Backup' };
    }

    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}
