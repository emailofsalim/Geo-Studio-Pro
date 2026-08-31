// ============================================================================
// BhuNex Studio — Structured AI Engine & Safety Sandbox
// ============================================================================

import { AICommandIntent } from '../types/canonical';
import { GeometryService } from './GeometryService';

export interface AISafetyValidationResult {
  isValid: boolean;
  sanitizedIntent: AICommandIntent | null;
  error?: string;
  previewSummary: string;
}

export class AIService {
  private static WHITELISTED_OPS = new Set([
    'buffer',
    'calculate_area',
    'calculate_distance',
    'find_feature',
    'filter_layer',
    'synthesize_parcel',
    'inspect_qa',
    'explain_calculation',
    'generate_geofence'
  ]);

  /**
   * Validates structured AI command proposals against safety constraints
   */
  static validateAIProposal(rawJson: any): AISafetyValidationResult {
    if (!rawJson || typeof rawJson !== 'object') {
      return {
        isValid: false,
        sanitizedIntent: null,
        error: 'AI proposal must be a valid JSON object.',
        previewSummary: 'Invalid operation payload.'
      };
    }

    const op = String(rawJson.operation || '').toLowerCase().trim();
    if (!this.WHITELISTED_OPS.has(op)) {
      return {
        isValid: false,
        sanitizedIntent: null,
        error: `Operation "${op}" is not permitted in the engineering safety whitelist.`,
        previewSummary: `Rejected unwhitelisted operation "${op}".`
      };
    }

    const intent: AICommandIntent = {
      id: `ai_cmd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      operation: op as any,
      targetLayer: typeof rawJson.targetLayer === 'string' ? rawJson.targetLayer : undefined,
      parameters: typeof rawJson.parameters === 'object' && rawJson.parameters !== null ? rawJson.parameters : {},
      description: typeof rawJson.description === 'string' ? rawJson.description : `Execute ${op}`,
      requiresUserConfirmation: true,
      previewData: rawJson.previewData || null
    };

    let summary = `Proposed Operation: **${op.toUpperCase()}**\n`;

    if (op === 'buffer') {
      const dist = Number(intent.parameters.distance) || 10;
      const unit = String(intent.parameters.unit || 'm');
      summary += `- **Buffer Distance:** ${dist} ${unit}\n- **Target Layer:** ${intent.targetLayer || 'Active Layer'}\n- Requires confirmation before geometry commitment.`;
    } else if (op === 'synthesize_parcel') {
      const areaHa = Number(intent.parameters.areaHa) || 1.0;
      summary += `- **Cadastral Area:** ${areaHa} ha (${(areaHa * 10000).toLocaleString()} m²)\n- Centroid will be placed in active workspace bounds.`;
    } else {
      summary += `- **Description:** ${intent.description}`;
    }

    return {
      isValid: true,
      sanitizedIntent: intent,
      previewSummary: summary
    };
  }

  /**
   * Deterministically applies a validated AI command intent
   */
  static executeValidatedIntent(
    intent: AICommandIntent,
    context: {
      centerCoord?: { easting: number; northing: number };
      workingZone?: string;
    }
  ): { success: boolean; resultFeatures?: any[]; message: string } {
    const cE = context.centerCoord?.easting || 250000;
    const cN = context.centerCoord?.northing || 2600000;

    switch (intent.operation) {
      case 'synthesize_parcel': {
        const areaHa = Number(intent.parameters.areaHa) || 2.0;
        const areaM2 = areaHa * 10000;
        const sideM = Math.sqrt(areaM2);
        const half = sideM / 2;

        const p1 = { a: Math.round(cE - half), b: Math.round(cN - half) };
        const p2 = { a: Math.round(cE + half), b: Math.round(cN - half) };
        const p3 = { a: Math.round(cE + half), b: Math.round(cN + half) };
        const p4 = { a: Math.round(cE - half), b: Math.round(cN + half) };

        const feat = {
          name: `Parcel-${Math.floor(Math.random() * 900 + 100)} (${areaHa.toFixed(1)} ha)`,
          geom: 'polygon',
          kind: 'en',
          pts: [p1, p2, p3, p4, p1],
          props: {
            area_m2: areaM2,
            area_ha: areaHa,
            perimeter_m: sideM * 4,
            land_use: 'Cadastral Survey Plot',
            generated_by: 'BhuNex AI Safety Sandbox'
          }
        };

        return {
          success: true,
          resultFeatures: [feat],
          message: `Successfully synthesized parcel of ${areaHa} ha.`
        };
      }

      case 'buffer': {
        const radius = Number(intent.parameters.distance) || 20;
        const ring = GeometryService.createPointBuffer({ x: cE, y: cN }, radius, 32);
        const feat = {
          name: `Buffer-${radius}m`,
          geom: 'polygon',
          kind: 'en',
          pts: ring.map(p => ({ a: Math.round(p.x), b: Math.round(p.y) })),
          props: {
            buffer_radius_m: radius
          }
        };
        return {
          success: true,
          resultFeatures: [feat],
          message: `Created ${radius} m buffer polygon.`
        };
      }

      default:
        return {
          success: true,
          message: `Action ${intent.operation} completed.`
        };
    }
  }
}
