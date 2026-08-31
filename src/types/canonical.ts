// ============================================================================
// BhuNex Studio — Canonical Spatial Data Model & Engineering Types (Phase 3)
// ============================================================================

export type LinearUnit = 'mm' | 'cm' | 'm' | 'km' | 'inch' | 'ft' | 'us-ft';
export type AreaUnit = 'm2' | 'ha' | 'acre' | 'sqft' | 'bigha' | 'guntha' | 'sqkm' | 'ft2';
export type VolumeUnit = 'm3' | 'cuyd' | 'cuft' | 'ft3';
export type AngularUnit = 'deg' | 'gon' | 'rad' | 'dms';

/**
 * First-Class Coordinate Reference System (CRS) Definition
 * Distinguishes: Project Default, Source, Confirmed, Target
 */
export interface CanonicalCRS {
  id?: string;
  name: string; // e.g. "WGS 84 / UTM Zone 45N"
  epsg: number | string; // e.g. 32645
  datum: string; // e.g. "WGS84", "Everest 1830", "Kalianpur 1975", "NAD83"
  projection: string; // e.g. "UTM", "LCC 1SP", "Transverse Mercator", "Geographic"
  zone: string; // e.g. "45N"
  linearUnit: LinearUnit;
  verticalReference?: string; // Optional - e.g. "MSL", "EGM96 Geoid", "Ellipsoidal"
  coordinateEpoch?: string; // Optional - e.g. "2026.0"
  isConfirmed?: boolean;
}

/**
 * 2D & 3D Canonical Coordinates
 */
export interface Coordinate {
  easting?: number;
  northing?: number;
  latitude?: number;
  longitude?: number;
  crs?: CanonicalCRS;
}

export interface Coordinate3D extends Coordinate {
  elevation?: number; // RL / Orthometric or Ellipsoidal Height
  heightAboveEllipsoid?: number;
  verticalDatum?: string;
}

/**
 * Central Unit and Precision Policy
 * Distinguishes: Calculation Precision, Stored Precision, Display Precision, Export Precision
 */
export interface PrecisionPolicy {
  calculationPrecision: number; // e.g. 12 (floating-point raw without premature rounding)
  storedPrecision: number;      // e.g. 6 decimal places in storage
  displayPrecision: number;     // e.g. 3 decimal places for UI meters, 4 for deg
  exportPrecision: number;      // e.g. 4 decimal places for CSV/CAD exports
}

export interface CanonicalUnitsConfig {
  linear: LinearUnit;
  area: AreaUnit;
  volume: VolumeUnit;
  angular: AngularUnit;
  precision: PrecisionPolicy;
  coordinatePrecision?: number; // Backwards compatible shortcut
  elevationPrecision?: number;  // Backwards compatible shortcut
  areaPrecision?: number;       // Backwards compatible shortcut
}

/**
 * Canonical Project Model
 */
export type ProjectCategory =
  | 'Mining Survey'
  | 'Cadastral Survey'
  | 'GIS'
  | 'Drone Survey'
  | 'Topographic Survey'
  | 'Land Survey'
  | 'Drill & Blast Planning'
  | 'General Survey'
  | 'Other';

export type ProjectStatus = 'Active' | 'Archived' | 'Completed';

export interface CanonicalProjectSettings {
  units: CanonicalUnitsConfig;
  sourceCRS?: CanonicalCRS;
  targetCRS?: CanonicalCRS;
  confirmedCRS?: CanonicalCRS;
  localLandPreset?: string;
  autoSaveIntervalSec?: number;
}

export interface CanonicalProject {
  projectId: string; // Mandatory standard property
  id: string; // Alias for backwards-compatibility
  projectName: string;
  name: string; // Alias
  projectType: ProjectCategory;
  category: ProjectCategory; // Alias
  description?: string;
  crs: CanonicalCRS; // First-class structured CRS
  crsString?: string; // Legacy string display
  workingZone: string; // e.g. "45N"
  units: CanonicalUnitsConfig;
  verticalReference?: string; // e.g. "MSL"
  coordinateEpoch?: string; // e.g. "2026.0"
  createdAt: number;
  updatedAt: number;
  schemaVersion: string; // e.g. "3.0.0"
  applicationVersion: string; // e.g. "3.7.0"
  userId?: string;
  status: ProjectStatus;
  isLocalOnly?: boolean;
  tags?: string[];
  settings?: CanonicalProjectSettings;
}

/**
 * Canonical Geometry & Vector Feature
 */
export type GeometryType = 'point' | 'multipoint' | 'linestring' | 'multilinestring' | 'polygon' | 'multipolygon' | 'geometrycollection';

export interface CanonicalGeometry {
  type: GeometryType;
  coordinates: number[] | number[][] | number[][][]; // GeoJSON standard
  crs?: CanonicalCRS;
}

export interface CanonicalFeature {
  id: string;
  name: string;
  geometryType: 'point' | 'line' | 'polygon';
  kind: 'll' | 'en'; // Lon/Lat or Easting/Northing
  points: Coordinate3D[];
  properties: Record<string, any>;
  layerId?: string;
  folder?: string;
  group?: string;
}

export interface CanonicalLayer {
  id: string;
  name: string;
  visible: boolean;
  color: string;
  fillColor?: string;
  fillOpacity?: number;
  strokeWidth?: number;
  geomType: 'point' | 'line' | 'polygon' | 'mixed';
  features: CanonicalFeature[];
  attributesSchema?: { key: string; label: string; type: 'string' | 'number' | 'date' }[];
}

/**
 * Canonical Survey Points, Observations & Traverses
 */
export interface CanonicalSurveyPoint {
  id: string;
  code: string;
  coordinate: Coordinate3D;
  accuracyHorizontal?: number;
  accuracyVertical?: number;
  time: number;
  remarks?: string;
  proximityRadius?: number;
  alarmDisabled?: boolean;
}

export interface CanonicalObservation {
  id: string;
  instrumentStationId: string;
  targetStationId: string;
  horizontalAngleDeg: number;
  verticalAngleDeg: number;
  slopeDistanceM: number;
  horizontalDistanceM: number;
  targetHeightM: number;
  instrumentHeightM: number;
  prismConstantMm?: number;
  timestamp: number;
}

export interface CanonicalGPSObservation {
  id: string;
  coordinate: Coordinate3D;
  speedKmh?: number;
  headingDeg?: number;
  hdop?: number;
  vdop?: number;
  pdop?: number;
  satellitesUsed?: number;
  fixType: 'none' | '2d' | '3d' | 'dgps' | 'rtk-float' | 'rtk-fixed' | 'simulated';
  timestamp: number;
}

export interface CanonicalTrack {
  id: string;
  name: string;
  intervalSec: number;
  points: CanonicalGPSObservation[];
  totalDistanceM: number;
  startTime: number;
  endTime?: number;
  maxSpeedKmh: number;
}

/**
 * Canonical Cadastral Parcel
 */
export interface CanonicalParcel {
  id: string;
  khasra: string;
  village: string;
  mouza?: string;
  sheet?: string;
  owner: string;
  tenant?: string;
  status?: string;
  boundary: Coordinate3D[];
  areaM2: number;
  areaHa: number;
  areaAcres: number;
  localAreaValue?: number;
  localAreaUnit?: string;
  remarks?: string;
}

/**
 * Canonical Borehole & Stratigraphy Interval
 */
export interface CanonicalBoreholeInterval {
  fromDepth: number;
  toDepth: number;
  lithology?: string;
  grades: Record<string, number | null>;
  isOre: boolean;
  cutoffRuleApplied?: string;
}

export interface CanonicalBorehole {
  id: string;
  projectId?: string;
  collar: Coordinate3D;
  endOfHoleDepth: number;
  azimuthDeg?: number;
  dipDeg?: number;
  waterTableDepth?: number;
  intervals: CanonicalBoreholeInterval[];
}

/**
 * Canonical Geofence Zone & Breach Events
 */
export type GeofenceType = 'polygon' | 'circle' | 'corridor';
export type GeofenceRule = 'keep_in' | 'keep_out' | 'speed_limit' | 'dwell_limit' | 'corridor_tracking';
export type GeofenceSeverity = 'critical' | 'high' | 'warning' | 'info';

export interface CanonicalGeofence {
  id: string;
  name: string;
  type: GeofenceType;
  rule: GeofenceRule;
  severity: GeofenceSeverity;
  enabled: boolean;
  color: string;
  fillOpacity: number;
  coordinates: Coordinate3D[];
  radiusMeters?: number;
  corridorWidthMeters?: number;
  bufferWarningMeters?: number;
  speedLimitKmh?: number;
  maxDwellSeconds?: number;
  description?: string;
}

/**
 * Canonical Photo Landmark & Attachments
 */
export interface LandmarkMeasurement {
  id: string;
  type: 'distance' | 'height' | 'angle' | 'offset';
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  valueLabel: string;
  realWorldValue?: number;
  unit: string;
  color?: string;
}

export interface CanonicalPhotoLandmark {
  id: string;
  name: string;
  timestamp: number;
  dataUrl: string;
  coordinate: Coordinate3D;
  azimuthDeg?: number;
  pitchDeg?: number;
  rollDeg?: number;
  targetDistanceM?: number;
  targetHeightM?: number;
  deviceHeightM?: number;
  notes?: string;
  measurements: LandmarkMeasurement[];
  surveyor?: string;
  client?: string;
  inspectionId?: string;
  integrityHash?: string;
}

export interface CanonicalAttachment {
  id: string;
  name: string;
  fileType: string;
  mimeType: string;
  sizeBytes: number;
  dataUrlOrPath: string;
  associatedFeatureId?: string;
  associatedModule: 'survey' | 'cadastral' | 'mining' | 'borehole' | 'gis' | 'photo';
  timestamp: number;
}

/**
 * Calculation, Import, Export, QA, Sensor, and AI Results
 */
export interface CanonicalCalculationResult<T = any> {
  id: string;
  timestamp: number;
  category: 'Traverse' | 'Intersection' | 'Resection' | 'Leveling' | 'Volume' | 'Area' | 'Transformation' | 'Geodesy';
  method: string;
  inputParameters: Record<string, any>;
  outputValues: T;
  units: {
    inputUnit: string;
    outputUnit: string;
  };
  precisionUsed: PrecisionPolicy;
  isPassed: boolean;
  notes?: string;
}

export interface CanonicalImportResult {
  success: boolean;
  format: string; // e.g. 'GeoJSON', 'KML', 'DXF', 'CSV', 'SHP', 'Surpac'
  featureCount: number;
  layerCount: number;
  detectedCRS?: CanonicalCRS;
  errors: string[];
  warnings: string[];
  importedData?: any;
}

export interface CanonicalExportResult {
  success: boolean;
  format: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  blob?: Blob;
  downloadUrl?: string;
  exportCRS: CanonicalCRS;
}

export interface CanonicalQAProblem {
  id: string;
  severity: 'error' | 'warning' | 'info';
  category: 'Geometry' | 'Coordinate' | 'Cadastral' | 'Borehole' | 'Survey' | 'Topology' | 'CRS';
  type: string;
  featureName?: string;
  detail: string;
  recommendation: string;
  location?: Coordinate3D;
}

export interface CanonicalQAResult {
  timestamp: number;
  overallScore: number; // 0 to 100%
  status: 'PASSED' | 'WARNINGS' | 'CRITICAL_ERRORS';
  errorCount: number;
  warningCount: number;
  infoCount: number;
  issues: CanonicalQAProblem[];
}

export interface CanonicalSensorStatus {
  gnss: {
    available: boolean;
    active: boolean;
    accuracyMeters?: number;
    latitude?: number;
    longitude?: number;
    altitudeMeters?: number;
    satellites?: number;
  };
  orientation: {
    available: boolean;
    active: boolean;
    headingDeg?: number;
    pitchDeg?: number;
    rollDeg?: number;
    magneticAccuracy?: number;
  };
  camera: {
    available: boolean;
    active: boolean;
  };
  barometer?: {
    available: boolean;
    pressureHpa?: number;
    relativeAltitudeM?: number;
  };
}

export interface CanonicalAICommand {
  id: string;
  operation: 'buffer' | 'calculate_area' | 'calculate_distance' | 'find_feature' | 'filter_layer' | 'synthesize_parcel' | 'inspect_qa' | 'explain_calculation' | 'generate_geofence';
  targetLayer?: string;
  parameters: Record<string, any>;
  description: string;
  requiresUserConfirmation: boolean;
  previewData?: any;
}

/**
 * Package Manifest for Native .bhnx Archival
 */
export interface BhnxManifest {
  format: 'bhnx_package';
  schemaVersion: '3.0.0';
  appVersion: string;
  generator: 'BhuNex Studio Professional Suite';
  createdAt: number;
  modifiedAt: number;
  projectId: string;
  projectName: string;
  projectCategory: string;
  crs: CanonicalCRS;
  units: CanonicalUnitsConfig;
  checksum?: string;
  recordCounts: {
    waypoints: number;
    layers: number;
    parcels: number;
    boreholes: number;
    photos: number;
    geofences: number;
    calculations: number;
  };
}

export interface BhnxProjectPackage {
  manifest: BhnxManifest;
  project: CanonicalProject;
  settings: CanonicalProjectSettings;
  data: {
    waypoints: any[];
    tracks: any[];
    layers: any[];
    parcels: any[];
    boreholes: any[];
    geofences: any[];
    photos: any[];
    calculations: any[];
    qaReports: any[];
    auditTrail: any[];
  };
}

// Backwards-compatible aliases
export type CalculationTraceRecord = CanonicalCalculationResult;
export type AICommandIntent = CanonicalAICommand;
export type PrecisionConfig = PrecisionPolicy;
