export interface LatLon {
  lon: number;
  lat: number;
}

export interface UTMCoords {
  E: number;
  N: number;
  zone: number;
  south: boolean;
}

export interface GeoPoint {
  a: number; // lon or Easting
  b: number; // lat or Northing
}

export interface GeoFeature {
  name: string;
  geom: 'point' | 'line' | 'polygon';
  kind: 'll' | 'en';
  pts: GeoPoint[];
  props?: Record<string, any>;
  folder?: string;
  group?: string;
}

export interface SurveyWaypoint {
  id: string;
  code: string;
  E: number;
  N: number;
  Z: number;
  lat: number;
  lon: number;
  acc: number;
  zone: string;
  time: number;
  remarks?: string;
}

export interface TrackPoint {
  E: number;
  N: number;
  Z: number;
  lat: number;
  lon: number;
  speed: number;
  time: number;
}

export interface SurveyTrack {
  name: string;
  interval: string;
  pts: TrackPoint[];
  dist: number;
  startTime: number;
  lastE?: number | null;
  lastN?: number | null;
  lastTime?: number | null;
  maxSpeed: number;
}

export interface MineParam {
  key: string;
  label: string;
  unit: string;
}

export type CutoffOp = 'ge' | 'le' | 'gt' | 'lt' | 'eq' | 'ne' | 'between' | 'nz' | 'blank';

export interface CutoffCondition {
  param: string;
  op: CutoffOp;
  v?: number | null;
  v2?: number | null;
}

export interface MineRule {
  logic: 'AND' | 'OR';
  minThick: number;
  conds: CutoffCondition[];
}

export interface MineProfile {
  name: string;
  pos: string;
  neg: string;
  params: MineParam[];
  rule: MineRule;
}

export interface BoreInterval {
  from: number;
  to: number;
  lith?: string;
  vals: Record<string, number | null>;
  isOre: boolean;
  logic: string;
}

export interface BoreholeHole {
  id: string;
  project?: string;
  lon: number;
  lat: number;
  rl?: number | null;
  eoh?: number | null;
  zone: number;
  south: boolean;
  intervals: BoreInterval[];
}

export interface CadastralField {
  key: string;
  label: string;
}

export interface CadastralProfile {
  name: string;
  accent: string;
  areaUnit: 'ha' | 'acre';
  fields: CadastralField[];
}

export interface QAProblem {
  sev: 'err' | 'warn' | 'info';
  type: string;
  detail: string;
  fix: string;
}

export interface QAResult {
  issues: QAProblem[];
  nErr: number;
  nWarn: number;
}

export type QAReport = QAResult;


export interface LocalLandUnit {
  label: string;
  sqft?: number;
  m2?: number;
}

export interface CadastralParcel {
  khasra: string;
  village: string;
  mouza?: string;
  sheet?: string;
  owner: string;
  tenant?: string;
  status?: string;
  pts: { E: number; N: number }[];
  areaM2: number;
  areaHa: number;
  areaAcres: number;
}

export interface BoreRow {
  bh: string;
  lon: number;
  lat: number;
  from: number;
  to: number;
  lith?: string;
  g1?: number;
  g2?: number;
}

export interface LandUnitPreset {
  label: string;
  note: string;
  hier: LocalLandUnit[];
  also: LocalLandUnit[];
}

export interface GisLayer {
  id: string;
  name: string;
  visible: boolean;
  color: string;
  fillColor: string;
  fillOpacity: number;
  strokeWidth: number;
  geomType: 'point' | 'line' | 'polygon' | 'mixed';
  features: GeoFeature[];
  attributesSchema?: { key: string; label: string; type: 'string' | 'number' | 'date' }[];
}

export interface SpatialAnalysisResult {
  title: string;
  type: string;
  timestamp: string;
  summary: string;
  metrics: Record<string, string | number>;
  generatedFeatures?: GeoFeature[];
}

export interface TopologyIssue {
  type: 'self_intersection' | 'duplicate_vertex' | 'sliver_polygon' | 'non_closed' | 'overlap';
  severity: 'error' | 'warning' | 'info';
  featureName: string;
  description: string;
  location?: { E: number; N: number };
}

export interface LandmarkMeasurement {
  id: string;
  type: 'distance' | 'height' | 'angle' | 'offset';
  p1: { x: number; y: number }; // normalized [0..1]
  p2: { x: number; y: number };
  valueLabel: string;
  realWorldValue?: number;
  unit: string;
  color?: string;
}

export interface PhotoLandmark {
  id: string;
  name: string;
  timestamp: number;
  dataUrl: string;
  lon: number;
  lat: number;
  altitude?: number;
  accuracy?: number;
  azimuth?: number;
  cardinal?: string;
  pitch?: number;
  roll?: number;
  slopePercent?: number;
  targetDistanceMeters?: number;
  targetHeightMeters?: number;
  deviceHeightMeters?: number;
  notes?: string;
  measurements: LandmarkMeasurement[];
  zone?: number;
  south?: boolean;
  utmE?: number;
  utmN?: number;
  project?: string;
  surveyor?: string;
  client?: string;
  inspectionId?: string;
  hashtags?: string;
  plusCode?: string;
  mgrs?: string;
  weatherCondition?: string;
  temperatureC?: number;
  humidityPct?: number;
  windKmh?: number;
  pressureHpa?: number;
  magneticDeclination?: number;
  integrityHash?: string;
  brandLogoUrl?: string;
}

export type GeofenceType = 'polygon' | 'circle' | 'corridor';
export type GeofenceRule = 'keep_in' | 'keep_out' | 'speed_limit' | 'dwell_limit' | 'corridor_tracking';
export type GeofenceSeverity = 'critical' | 'high' | 'warning' | 'info';

export interface GeofenceZone {
  id: string;
  name: string;
  type: GeofenceType;
  rule: GeofenceRule;
  severity: GeofenceSeverity;
  enabled: boolean;
  color: string;
  fillOpacity: number;
  coordinates: GeoPoint[]; // polygon vertices or circle center (1 pt) or corridor polyline
  radiusMeters?: number; // for circular geofence
  corridorWidthMeters?: number; // for corridor buffer width
  bufferWarningMeters?: number; // pre-breach warning buffer in meters
  speedLimitKmh?: number; // max allowable speed in km/h
  maxDwellSeconds?: number; // max dwell time allowed in seconds
  description?: string;
  category?: string;
  kind: 'll' | 'en';
}

export interface GeofenceBreachEvent {
  id: string;
  timestamp: number;
  fenceId: string;
  fenceName: string;
  eventType: 'ENTER' | 'EXIT' | 'SPEED_BREACH' | 'DWELL_BREACH' | 'CORRIDOR_DEVIATION' | 'BUFFER_WARNING';
  severity: GeofenceSeverity;
  lat: number;
  lon: number;
  utmE?: number;
  utmN?: number;
  speedKmh: number;
  heading?: number;
  distanceToBoundaryMeters: number;
  message: string;
}


