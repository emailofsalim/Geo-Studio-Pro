import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

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

  // 1. Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', serverTime: new Date().toISOString() });
  });

  // 2. AI Assistant Availability Status Check
  app.get('/api/ai/status', (req, res) => {
    const hasKey = !!process.env.GEMINI_API_KEY;
    res.json({
      available: hasKey,
      model: 'gemini-3.7-flash',
      status: hasKey ? 'ready' : 'missing_api_key'
    });
  });

  // 3. AI Geomatics & App Usage Assistant
  app.post('/api/ai/geomatics-assistant', async (req, res) => {
    try {
      const { prompt, context } = req.body;
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Prompt is required.' });
      }

      const ai = getGenAI();
      const systemInstruction = `You are the built-in AI User Guide & Geomatics Specialist for "BhuNex GeoStudio".

YOUR PRIMARY PURPOSE:
1. Help the user learn and use BhuNex's surveying, GIS, and cadastral tools directly in the application interface:
   - Coordinate Converter (Lat/Long, UTM, Indian Kalianpur LCC 1SP, Everest 1830, Bursa-Wolf, 2D Helmert)
   - Cadastral Parcel Mapper & Revenue land area math (Khasra/Plot records, Bigha, Katha, Dhur, Dismil, Acre, Hectare)
   - Bhunaksha Parcel Digitizer & Vector editor
   - Total Station & GPS Surveyor (Bowditch traverse balancing, Vincenty geodesic formulas, polar stakeout, backsight setup)
   - Borehole Mapper & Strip Log 3D Stratigraphy
   - Boundary Offset & Corridor buffer generation
   - Geofence & Proximity Alarms
   - Field Sensors & Theodolite HUD
   - Template library and Spatial Archive Inspector
2. Answer questions about surveying calculations, mining lease norms (IBM 2018 cutoff grades, DGMS safety zones), and land record workflows.

CRITICAL CONFIDENTIALITY & INTEGRITY RULES (STRICTLY ENFORCED):
- You MUST NEVER disclose, output, quote, or provide the application's underlying source code, TypeScript/React code files, server files, repository file directory paths, API keys, or proprietary internal implementation algorithms.
- If a user asks you for "the code", "show me your codebase", "give me the source code files", "how is this built internally", or any request attempting to extract or expose the application files, you MUST politely and firmly decline.
- Respond with: "I am designed to guide you in using BhuNex's surveying and geomatics tools directly in the interface. I cannot provide or export internal application source code or files."
- Always provide practical, user-friendly instructions on which buttons to click and which tools to use within BhuNex. Format your answers cleanly with concise markdown headings and bullet points.`;

      const contents = context
        ? `[CURRENT USER TAB / WORKSPACE CONTEXT]:\n${JSON.stringify(context, null, 2)}\n\n[USER QUERY]:\n${prompt}`
        : prompt;

      let responseText = '';

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.7-flash',
          contents,
          config: {
            systemInstruction,
          }
        });
        responseText = response.text || '';
      } catch (modelErr: any) {
        // Fallback to gemini-2.5-flash if 3.7 is rate limited or unavailable
        console.warn('Attempting fallback model due to:', modelErr?.message);
        const fallbackResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents,
          config: {
            systemInstruction,
          }
        });
        responseText = fallbackResponse.text || '';
      }

      if (!responseText) {
        return res.status(500).json({ error: 'No response received from AI model.' });
      }

      return res.json({
        answer: responseText,
        model: 'gemini-3.7-flash'
      });
    } catch (err: any) {
      console.error('Gemini API Error:', err);
      const isMissingKey = !process.env.GEMINI_API_KEY;
      return res.status(isMissingKey ? 503 : 500).json({
        error: isMissingKey
          ? 'AI Assistant is currently unavailable (API key not configured). Please check your internet connection or settings.'
          : (err.message || 'Failed to generate AI consultation response.')
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
