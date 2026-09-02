/**
 * The AI endpoints' logic, with no transport in it.
 *
 * The same two operations are served by the express server used for local
 * development and self-hosting, and by the serverless functions the deployed
 * application calls. Keeping the logic here means there is one implementation
 * to fix rather than two that drift -- the trap this codebase has already been
 * caught by, where a fix landed in a copy nothing could reach.
 */
import { GoogleGenAI } from '@google/genai';
import { executeGeomaticsAi } from '../lib/geoAiEngine';

export interface AiEnv {
  GEMINI_API_KEY?: string;
}

let cachedClient: GoogleGenAI | null = null;
let cachedKey: string | null = null;

function client(apiKey: string): GoogleGenAI {
  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new GoogleGenAI({ apiKey });
    cachedKey = apiKey;
  }
  return cachedClient;
}

/** Ordered candidates: try the primary, fall back on transient unavailability. */
const CANDIDATE_MODELS = ['gemini-2.5-flash', 'gemini-3.7-flash', 'gemini-flash-latest'];

async function generateWithFallback(
  env: AiEnv,
  contents: string,
  systemInstruction: string
): Promise<{ text: string; model: string } | null> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const ai = client(apiKey);
  for (const model of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({ model, contents, config: { systemInstruction } });
      if (response.text) return { text: response.text, model };
    } catch {
      // Try the next candidate. A model being busy is not a reason to fail the
      // request when the local engine can still answer it.
    }
  }
  return null;
}

export interface AiResult {
  status: number;
  body: Record<string, unknown>;
}

const badPrompt: AiResult = { status: 400, body: { error: 'Prompt is required.' } };

/** The in-application guide and geomatics assistant. */
export async function geomaticsAssistant(body: any, env: AiEnv): Promise<AiResult> {
  const prompt = body?.prompt;
  if (!prompt || typeof prompt !== 'string') return badPrompt;
  const context = body?.context;

  const systemInstruction = `You are the built-in AI User Guide & Geomatics Specialist for "BhuNex Studio".
Help the user learn and use BhuNex's surveying, GIS, and cadastral tools directly in the application interface.`;

  const contents = context
    ? `[CURRENT USER TAB / WORKSPACE CONTEXT]:\n${JSON.stringify(context, null, 2)}\n\n[USER QUERY]:\n${prompt}`
    : prompt;

  try {
    const gemini = await generateWithFallback(env, contents, systemInstruction);
    if (gemini?.text) {
      return { status: 200, body: { answer: gemini.text, model: gemini.model, source: 'gemini' } };
    }
    const result = await executeGeomaticsAi(prompt, {
      workingZone: context?.workingZone || '45N',
      existingFeaturesSummary: JSON.stringify(context || {})
    });
    return { status: 200, body: { answer: result.answer, model: result.modelUsed, source: result.source } };
  } catch {
    const fallback = await executeGeomaticsAi(prompt, {});
    return {
      status: 200,
      body: { answer: fallback.answer, model: 'OpenSource-GeoAI-Fallback', source: 'geomatics_engine' }
    };
  }
}

/** The GIS copilot, which may also return features to place on the map. */
export async function gisCopilot(body: any, env: AiEnv): Promise<AiResult> {
  const prompt = body?.prompt;
  if (!prompt || typeof prompt !== 'string') return badPrompt;
  const { workingZone, centerCoord, activeLayerName, existingFeaturesSummary } = body || {};

  const systemInstruction = `You are the Smart AI GIS Spatial Copilot for BhuNex Studio GIS Map Studio.
Your role is to assist GIS cartographers, cadastral surveyors, and mining engineers by generating geometry, analyzing spatial layouts, and providing clear expert advice.

When the user asks to generate, modify, or layout spatial features (like parcels, drillholes, pipelines, buffer zones, mining lease pillars, solar array grids, traverse corridors):
1. Provide a concise, professional explanation.
2. If spatial features should be generated or added to the map, include a clean JSON block fenced with \`\`\`json containing an array of GeoFeatures matching this TypeScript interface:
interface GeoFeature {
  name: string;
  geom: 'point' | 'line' | 'polygon';
  kind: 'en' | 'll'; // 'en' for Easting/Northing (UTM meters), 'll' for Lon/Lat degrees
  pts: { a: number; b: number }[]; // 'en': a=Easting, b=Northing; 'll': a=Longitude, b=Latitude
  props?: Record<string, any>;
}

Always ensure realistic UTM Easting (e.g. 200000 - 800000) and Northing coordinates in Zone ${workingZone || '45N'} or near the user's reference point (${centerCoord ? `E: ${centerCoord.E}, N: ${centerCoord.N}` : 'UTM standard'}). Ensure polygons have at least 3 points and are properly closed.`;

  const userMessage = `Reference Info:
- UTM Zone: ${workingZone || '45N'}
- Reference Center: ${centerCoord ? `Easting: ${centerCoord.E}, Northing: ${centerCoord.N}` : 'Approx 255000, 2605000'}
- Active Layer: ${activeLayerName || 'Default'}
- Context Summary: ${existingFeaturesSummary || 'Standard GIS workspace'}

User Request: ${prompt}`;

  try {
    const gemini = await generateWithFallback(env, userMessage, systemInstruction);
    if (gemini?.text) {
      return {
        status: 200,
        body: {
          answer: gemini.text.replace(/```json\s*[\s\S]*?\s*```/, '').trim(),
          generatedFeatures: extractFeatures(gemini.text),
          model: gemini.model,
          source: 'gemini'
        }
      };
    }
    const geo = await executeGeomaticsAi(prompt, {
      workingZone, centerCoord, activeLayerName, existingFeaturesSummary
    });
    return {
      status: 200,
      body: {
        answer: geo.answer,
        generatedFeatures: geo.generatedFeatures || [],
        model: geo.modelUsed,
        source: geo.source
      }
    };
  } catch {
    const fallback = await executeGeomaticsAi(prompt, { workingZone, centerCoord });
    return {
      status: 200,
      body: {
        answer: fallback.answer,
        generatedFeatures: fallback.generatedFeatures || [],
        model: 'OpenSource-GeoEngine',
        source: 'geomatics_engine'
      }
    };
  }
}

/**
 * Pulls the fenced JSON block of features out of a model reply.
 *
 * Anything that is not an array of features comes back as an empty list rather
 * than a guess: placing geometry the model did not actually describe would put
 * invented survey features on a map.
 */
export function extractFeatures(responseText: string): any[] {
  const match = responseText.match(/```json\s*([\s\S]*?)\s*```/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.features)) return parsed.features;
    if (parsed && typeof parsed === 'object' && parsed.pts) return [parsed];
    return [];
  } catch {
    return [];
  }
}

/** What /api/ai/status reports. */
export function aiStatus(env: AiEnv): Record<string, unknown> {
  const hasKey = !!env.GEMINI_API_KEY;
  return {
    available: true,
    model: hasKey ? 'gemini-2.5-flash / gemini-3.7-flash' : 'opensource-geoai-v3.7',
    status: 'ready',
    provider: hasKey ? 'gemini' : 'opensource'
  };
}
