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

  // 2. AI Geomatics & Mining Consultant (Thinking Mode HIGH, gemini-3.1-pro-preview)
  app.post('/api/ai/geomatics-assistant', async (req, res) => {
    try {
      const { prompt, context } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required.' });
      }

      const ai = getGenAI();
      const systemInstruction = `You are the Lead Geodesist, Cadastral Revenue Expert, and Chief Mine Surveyor of "Geo Studio".
You possess deep mathematical mastery in:
- Geodetic Datums (WGS84, Everest 1830, Indian Kalianpur 1975 LCC 1SP, GRS80, Bursa-Wolf 7-parameter and 2D Helmert transformations).
- Cadastral Revenue Mapping (Khasra, Mouza, Bigha-Katha-Dhur-Dismil conversions across Bihar, Jharkhand, West Bengal, Assam, UP, MP).
- Mine Surveying Regulations (IBM 2018 Mineral Cutoff specifications for Bauxite, Iron Ore, Coal, Limestone; DGMS safety barriers 7.5m/50m/500m; stripping ratios).
- GNSS RTK, Epoch centroid filtering, Traverse Bowditch balancing, and Vincenty geodesic distance formulas.

Provide precise, step-by-step mathematical breakdowns, verified formulas, and authoritative recommendations. Format your response cleanly with clear markdown headings and bullet points.`;

      const contents = context
        ? `[USER CONTEXT / ACTIVE TAB STATE]:\n${JSON.stringify(context, null, 2)}\n\n[USER QUERY]:\n${prompt}`
        : prompt;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents,
        config: {
          systemInstruction,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH
          }
        }
      });

      return res.json({
        answer: response.text || 'No response generated from model.',
        model: 'gemini-3.1-pro-preview'
      });
    } catch (err: any) {
      console.error('Gemini API Error:', err);
      return res.status(500).json({
        error: err.message || 'Failed to generate AI consultation response.'
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
