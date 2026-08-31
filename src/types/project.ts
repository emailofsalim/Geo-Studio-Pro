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

export interface ProjectModuleStats {
  waypointsCount: number;
  layersCount: number;
  parcelsCount: number;
  boreholesCount: number;
  photosCount: number;
  geofencesCount: number;
  calculationsCount?: number;
}

export interface GeoProject {
  id: string; // Immutable unique identifier (e.g. 'bhnx_proj_8f3c19b2')
  userId: string; // User ID or 'guest' / 'local'
  name: string; // User-friendly visible project name (e.g. "Pakhar Mine FY 2026-27")
  description?: string;
  category: ProjectCategory;
  crs: string; // Coordinate Reference System (e.g. "WGS 84 / UTM Zone 45N (EPSG:32645)")
  workingZone: string; // e.g. "45N"
  createdAt: number; // Unix timestamp
  updatedAt: number; // Unix timestamp
  lastOpenedAt: number; // Unix timestamp
  status: ProjectStatus;
  isLocalOnly?: boolean; // Offline-first marker
  tags?: string[];
  stats?: Partial<ProjectModuleStats>;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  photoUrl?: string;
  isGuest: boolean;
  provider: 'google' | 'guest';
  createdAt: number;
  lastLoginAt: number;
}

export interface ProjectDataState {
  projectId: string; // Mandatory project scope binding
  waypoints: any[];
  layers: any[];
  parcels: any[];
  boreholes: any[];
  photos: any[];
  geofences: any[];
  tracks?: any[];
  calculations?: any[];
  qaReports?: any[];
  surveyCalc?: any;
  customInputs?: Record<string, any>;
  workingZone?: string;
  distanceUnit?: 'm' | 'ft';
  localLandPreset?: string;
  updatedAt?: number;
}
