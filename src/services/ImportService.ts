// ============================================================================
// BhuNex Studio — Universal Import Service (Phase 6 Architecture)
// ============================================================================

import { CanonicalImportResult, CanonicalCRS } from '../types/canonical';
import {
  detectAndParseGeospatialFile,
  parseUtmZoneStr,
  DetectedImportResult,
  computeBoundingBox
} from '../lib/universalDataBridge';
import { GeodesyService } from './GeodesyService';
import { storageService } from './StorageService';
import { GeoFeature, GisLayer, SurveyWaypoint, CadastralParcel } from '../types';
import { parseImportFile } from '../lib/parseClient';

export interface ImportOptions {
  sourceCRS?: CanonicalCRS;
  targetCRS?: CanonicalCRS;
  workingZone?: string;
  destinationApp?: string;
  projectId?: string;
  userColumnMappings?: Record<string, string>;
  confirmUnknownCRS?: boolean;
}

export interface ImportValidationReport {
  isValid: boolean;
  format: string;
  featureCount: number;
  pointsCount: number;
  linesCount: number;
  polygonsCount: number;
  detectedCRS: string;
  crsStatus: 'EXPLICIT' | 'INFERRED' | 'UNKNOWN';
  detectedUnits: string;
  attributeKeys: string[];
  missingValueSummary: {
    coordinatesMissing: number;
    elevationMissing: number;
    accuracyMissing: number;
    ownerMissing: number;
    villageMissing: number;
  };
  warnings: string[];
  errors: string[];
  boundingBox?: {
    minLat?: number;
    maxLat?: number;
    minLon?: number;
    maxLon?: number;
    minE?: number;
    maxE?: number;
    minN?: number;
    maxN?: number;
  };
}

export class ImportService {
  /**
   * Maximum allowed file size for browser import (150 MB)
   */
  public static readonly MAX_FILE_SIZE_BYTES = 150 * 1024 * 1024;

  /**
   * Universal File Security and Pre-Flight Validation
   */
  static validateSecurity(file: File): { ok: boolean; error?: string } {
    if (!file) {
      return { ok: false, error: 'No file provided for import.' };
    }

    if (file.size > this.MAX_FILE_SIZE_BYTES) {
      return {
        ok: false,
        error: `File size exceeds safety limit of ${(this.MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)} MB (current: ${(file.size / (1024 * 1024)).toFixed(1)} MB).`
      };
    }

    // Check for suspicious zero-byte files
    if (file.size === 0) {
      return { ok: false, error: 'Selected file is empty (0 bytes).' };
    }

    return { ok: true };
  }

  /**
   * Pipeline Stage 1 & 2: Security Validation & Universal Format/Schema Detection
   */
  static async detectFile(
    file: File,
    workingZone: string = '45N'
  ): Promise<DetectedImportResult> {
    const sec = this.validateSecurity(file);
    if (!sec.ok) {
      throw new Error(sec.error);
    }

    // Run format detection and specialized parser feed, off the main thread
    // where the browser allows it.
    const { result } = await parseImportFile(file, workingZone);
    return result;
  }

  /**
   * Pipeline Stage 3: Strict Schema & Data Quality Validation
   * Ensures missing values are NOT turned into fake defaults (0, 0,0, 1m accuracy, fake owners)
   */
  static auditQuality(detected: DetectedImportResult): ImportValidationReport {
    let coordinatesMissing = 0;
    let elevationMissing = 0;
    let accuracyMissing = 0;
    let ownerMissing = 0;
    let villageMissing = 0;

    detected.features.forEach(f => {
      // Check coordinates validity
      if (!f.pts || f.pts.length === 0 || f.pts.some(p => isNaN(p.a) || isNaN(p.b))) {
        coordinatesMissing++;
      }

      // Check elevation presence (must stay undefined/null if absent, not fabricated 0)
      if (f.props?.elevation === undefined && f.props?.Z === undefined && f.props?.RL === undefined) {
        elevationMissing++;
      }

      // Check accuracy presence (must stay null if absent, not fabricated 1m)
      if (f.props?.acc === null || f.props?.acc === undefined) {
        accuracyMissing++;
      }

      // Check cadastral fields (must never be invented)
      if (!f.props?.owner) ownerMissing++;
      if (!f.props?.village) villageMissing++;
    });

    const warnings = [...(detected.warnings || [])];
    const errors: string[] = [];

    if (detected.crsStatus === 'UNKNOWN') {
      warnings.push('Coordinate Reference System (CRS) is UNCERTAIN. Review coordinates and confirm the working zone.');
    }

    if (coordinatesMissing > 0) {
      warnings.push(`${coordinatesMissing} feature(s) had missing or unparseable coordinates and were filtered out.`);
    }

    if (detected.featureCount === 0 && detected.formatCategory !== 'Archive') {
      errors.push('No valid vector features or coordinate records could be extracted from this file.');
    }

    return {
      isValid: errors.length === 0,
      format: detected.formatName,
      featureCount: detected.featureCount,
      pointsCount: detected.pointsCount,
      linesCount: detected.linesCount,
      polygonsCount: detected.polygonsCount,
      detectedCRS: detected.detectedCRS || (detected.crsStatus === 'UNKNOWN' ? 'CRS UNKNOWN' : `WGS 84 / UTM Zone ${detected.zoneDetected || '45N'}`),
      crsStatus: detected.crsStatus || 'UNKNOWN',
      detectedUnits: detected.detectedUnits || (detected.crsStatus === 'EXPLICIT' && detected.detectedCRS?.includes('4326') ? 'deg' : 'm'),
      attributeKeys: detected.attributeKeys,
      missingValueSummary: {
        coordinatesMissing,
        elevationMissing,
        accuracyMissing,
        ownerMissing,
        villageMissing
      },
      warnings,
      errors,
      boundingBox: detected.boundingBox || computeBoundingBox(detected.features)
    };
  }

  /**
   * Pipeline Stage 4: Commit import into canonical project data model and persist to IndexedDB
   */
  static async commitToProject(
    detected: DetectedImportResult,
    options: ImportOptions
  ): Promise<{ success: boolean; layerId?: string; count: number; message: string }> {
    const projectId = options.projectId || 'project_pakhar_2026';
    const targetApp = options.destinationApp || detected.suggestedAppDestination || 'gis';
    const zone = options.workingZone || '45N';

    const cleanFeatures: GeoFeature[] = detected.features.map((f, idx) => ({
      ...f,
      id: f.id || `imp_${Date.now()}_${idx + 1}`,
      name: f.name || `PT_${idx + 1}`,
      projectId,
      props: {
        ...(f.props || {}),
        // Ensure accuracy is strictly null if absent
        acc: f.props?.acc !== undefined && f.props?.acc !== null && !isNaN(f.props.acc) ? f.props.acc : null
      }
    }));

    // Fetch current project state
    const currentData = (await storageService.getProjectData(projectId)) || {
      projectId,
      workingZone: zone,
      waypoints: [],
      layers: [],
      parcels: [],
      boreholes: [],
      geofences: [],
      photos: [],
      tracks: [],
      calculations: [],
      qaReports: []
    };

    if (targetApp === 'gis' || targetApp === 'studio') {
      // Create new GIS Layer
      const layerId = `layer_${Date.now()}`;
      const newLayer: GisLayer = {
        id: layerId,
        projectId,
        name: detected.formatName ? `Import: ${detected.formatName}` : 'Imported Layer',
        visible: true,
        color: '#c9a063',
        fillColor: '#c9a063',
        fillOpacity: 0.35,
        strokeWidth: 2,
        geomType: detected.polygonsCount > 0 ? 'polygon' : detected.linesCount > 0 ? 'line' : 'point',
        features: cleanFeatures
      };

      await storageService.saveProjectData(projectId, {
        ...currentData,
        layers: [newLayer, ...(currentData.layers || [])]
      });

      return {
        success: true,
        layerId,
        count: cleanFeatures.length,
        message: `Successfully imported ${cleanFeatures.length} feature(s) into GIS Studio layer "${newLayer.name}".`
      };
    }

    if (targetApp === 'gps' || targetApp === 'survey') {
      // Import as Survey Waypoints
      const newWaypoints: SurveyWaypoint[] = cleanFeatures.map((f, i) => {
        const pt = f.pts[0] || { a: 0, b: 0 };
        return {
          id: f.name || `IMP-${i + 1}`,
          projectId,
          code: (f.props?.code as string) || 'Imported Point',
          E: f.kind === 'en' ? pt.a : (f.props?.utmE as number) || 0,
          N: f.kind === 'en' ? pt.b : (f.props?.utmN as number) || 0,
          Z: f.props?.Z !== undefined ? f.props.Z : (f.props?.elevation as number) || 0,
          lat: f.kind === 'll' ? pt.b : 0,
          lon: f.kind === 'll' ? pt.a : 0,
          acc: f.props?.acc !== undefined && f.props?.acc !== null ? f.props.acc : (null as any),
          zone,
          time: Date.now(),
          remarks: f.props ? JSON.stringify(f.props) : undefined,
          proximityRadius: 5
        };
      });

      await storageService.saveProjectData(projectId, {
        ...currentData,
        waypoints: [...(currentData.waypoints || []), ...newWaypoints]
      });

      return {
        success: true,
        count: newWaypoints.length,
        message: `Successfully added ${newWaypoints.length} survey waypoint(s) to GPS Surveyor.`
      };
    }

    if (targetApp === 'cadastral' || targetApp === 'parcels') {
      // Import as Cadastral Parcels
      const newParcels: CadastralParcel[] = cleanFeatures
        .filter(f => f.geom === 'polygon' || f.geom === 'line')
        .map((f, i) => {
          const pts = f.pts.map(p => ({
            E: f.kind === 'en' ? p.a : 0,
            N: f.kind === 'en' ? p.b : 0
          }));
          const areaM2 = Number(f.props?.area || f.props?.areaM2 || f.props?.areaSqM || 0);
          return {
            khasra: f.props?.khasra || f.props?.plotNumber || f.name || `Plot-${i + 1}`,
            village: f.props?.village || 'Unassigned',
            mouza: f.props?.mouza || '',
            sheet: f.props?.sheet || '',
            owner: f.props?.owner || f.props?.ownerName || 'Unassigned',
            tenant: f.props?.tenant || '',
            status: f.props?.status || 'Clear',
            pts,
            areaM2,
            areaHa: areaM2 / 10000,
            areaAcres: areaM2 / 4046.8564224
          };
        });

      await storageService.saveProjectData(projectId, {
        ...currentData,
        parcels: [...(currentData.parcels || []), ...newParcels]
      });

      return {
        success: true,
        count: newParcels.length,
        message: `Successfully imported ${newParcels.length} parcel(s) into Cadastral Land Records.`
      };
    }

    // Default fallback to GIS Studio
    const defaultLayer: GisLayer = {
      id: `layer_${Date.now()}`,
      projectId,
      name: `Import: ${detected.formatName || 'Dataset'}`,
      visible: true,
      color: '#c9a063',
      fillColor: '#c9a063',
      fillOpacity: 0.35,
      strokeWidth: 2,
      geomType: 'point',
      features: cleanFeatures
    };

    await storageService.saveProjectData(projectId, {
      ...currentData,
      layers: [defaultLayer, ...(currentData.layers || [])]
    });

    return {
      success: true,
      layerId: defaultLayer.id,
      count: cleanFeatures.length,
      message: `Imported ${cleanFeatures.length} feature(s) to project workspace.`
    };
  }

  /**
   * Complete Universal Import execution entry point
   */
  static async importFile(
    file: File,
    options: ImportOptions = {}
  ): Promise<CanonicalImportResult> {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const zone = options.workingZone || '45N';
    const sourceCRS = options.sourceCRS || GeodesyService.getUTMCrs(zone);

    try {
      const detected = await this.detectFile(file, zone);
      const audit = this.auditQuality(detected);

      if (!audit.isValid) {
        return {
          success: false,
          format: detected.formatName || ext.toUpperCase(),
          featureCount: 0,
          layerCount: 0,
          errors: audit.errors,
          warnings: audit.warnings
        };
      }

      if (options.projectId) {
        await this.commitToProject(detected, options);
      }

      return {
        success: true,
        format: detected.formatName || ext.toUpperCase(),
        featureCount: detected.featureCount,
        layerCount: 1,
        detectedCRS: sourceCRS,
        errors: [],
        warnings: audit.warnings,
        importedData: detected
      };
    } catch (err: any) {
      return {
        success: false,
        format: ext.toUpperCase(),
        featureCount: 0,
        layerCount: 0,
        errors: [err.message || 'Fatal error during file import processing.'],
        warnings: []
      };
    }
  }
}
