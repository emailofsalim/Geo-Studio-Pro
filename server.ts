import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { executeGeomaticsAi } from './src/lib/geoAiEngine';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Lazy GenAI client
  let aiClient: GoogleGenAI | null = null;
  function getGenAI(): GoogleGenAI {
    if (!aiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is missing.');
      }
      aiClient = new GoogleGenAI({ apiKey });
    }
    return aiClient;
  }

  // Multi-tier Gemini Generation Helper with automatic fallback for transient 503/demand spikes
  async function generateWithGeminiFallback(
    contents: string,
    systemInstruction: string
  ): Promise<{ text: string; model: string } | null> {
    if (!process.env.GEMINI_API_KEY) return null;
    
    // Ordered candidate models: try primary then stable backup
    const candidateModels = ['gemini-2.5-flash', 'gemini-3.7-flash', 'gemini-flash-latest'];
    
    const ai = getGenAI();
    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents,
          config: { systemInstruction }
        });
        if (response.text) {
          return { text: response.text, model: modelName };
        }
      } catch (err: any) {
        // Quietly try next model if 503/429/overloaded
        const isTemporary = err?.message?.includes('503') || err?.message?.includes('high demand') || err?.status === 'UNAVAILABLE' || err?.code === 503;
        if (isTemporary) {
          continue;
        }
        // Non-503 error, try backup model anyway
      }
    }
    return null;
  }

  // 1. Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', serverTime: new Date().toISOString() });
  });

  // 2. AI Assistant Availability Status Check
  app.get('/api/ai/status', (req, res) => {
    const hasKey = !!process.env.GEMINI_API_KEY;
    res.json({
      available: true,
      model: hasKey ? 'gemini-2.5-flash / gemini-3.7-flash' : 'opensource-geoai-v3.7',
      status: 'ready',
      provider: hasKey ? 'gemini' : 'opensource'
    });
  });

  // 3. AI Geomatics & App Usage Assistant
  app.post('/api/ai/geomatics-assistant', async (req, res) => {
    try {
      const { prompt, context } = req.body;
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Prompt is required.' });
      }

      const systemInstruction = `You are the built-in AI User Guide & Geomatics Specialist for "BhuNex GeoStudio".
Help the user learn and use BhuNex's surveying, GIS, and cadastral tools directly in the application interface.`;

      const contents = context
        ? `[CURRENT USER TAB / WORKSPACE CONTEXT]:\n${JSON.stringify(context, null, 2)}\n\n[USER QUERY]:\n${prompt}`
        : prompt;

      // Try Gemini multi-model fallback first
      const geminiResult = await generateWithGeminiFallback(contents, systemInstruction);
      if (geminiResult && geminiResult.text) {
        return res.json({
          answer: geminiResult.text,
          model: geminiResult.model,
          source: 'gemini'
        });
      }

      // Open-source / local intelligent geomatics solver fallback
      const result = await executeGeomaticsAi(prompt, {
        workingZone: context?.workingZone || '45N',
        existingFeaturesSummary: JSON.stringify(context || {})
      });

      return res.json({
        answer: result.answer,
        model: result.modelUsed,
        source: result.source
      });
    } catch (err: any) {
      const fallback = await executeGeomaticsAi(req.body?.prompt || 'Geomatics guidance', {});
      return res.json({
        answer: fallback.answer,
        model: 'OpenSource-GeoAI-Fallback',
        source: 'geomatics_engine'
      });
    }
  });

  // 4. Smart AI GIS Copilot & Spatial Geometry Generator
  app.post('/api/ai/gis-copilot', async (req, res) => {
    try {
      const { prompt, workingZone, centerCoord, activeLayerName, existingFeaturesSummary } = req.body;
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Prompt is required.' });
      }

      const systemInstruction = `You are the Smart AI GIS Spatial Copilot for GeoStudio GIS Map Studio.
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

      // Try Gemini multi-model fallback first
      const geminiResult = await generateWithGeminiFallback(userMessage, systemInstruction);
      if (geminiResult && geminiResult.text) {
        const responseText = geminiResult.text;
        let generatedFeatures: any[] = [];
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[1]);
            if (Array.isArray(parsed)) generatedFeatures = parsed;
            else if (parsed && Array.isArray(parsed.features)) generatedFeatures = parsed.features;
            else if (parsed && typeof parsed === 'object' && parsed.pts) generatedFeatures = [parsed];
          } catch (pe) {
            // ignore JSON parse error
          }
        }

        return res.json({
          answer: responseText.replace(/```json\s*[\s\S]*?\s*```/, '').trim(),
          generatedFeatures,
          model: geminiResult.model,
          source: 'gemini'
        });
      }

      // Open-source / local intelligent Geomatics Spatial Synthesis Fallback
      const geoResult = await executeGeomaticsAi(prompt, {
        workingZone,
        centerCoord,
        activeLayerName,
        existingFeaturesSummary
      });

      return res.json({
        answer: geoResult.answer,
        generatedFeatures: geoResult.generatedFeatures || [],
        model: geoResult.modelUsed,
        source: geoResult.source
      });
    } catch (err: any) {
      const fallback = await executeGeomaticsAi(req.body?.prompt || 'parcel', {
        workingZone: req.body?.workingZone,
        centerCoord: req.body?.centerCoord
      });
      return res.json({
        answer: fallback.answer,
        generatedFeatures: fallback.generatedFeatures || [],
        model: 'OpenSource-GeoEngine',
        source: 'geomatics_engine'
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Geo Studio server active on port ${PORT}`);
  });
}

startServer();
