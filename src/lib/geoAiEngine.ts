import { GeoFeature } from '../types';

export interface GeomaticsAiResult {
  answer: string;
  generatedFeatures?: GeoFeature[];
  modelUsed: string;
  source: 'gemini' | 'opensource_llm' | 'geomatics_engine';
}

export interface GeomaticsAiContext {
  workingZone?: string;
  centerCoord?: { E: number; N: number; lon?: number; lat?: number } | null;
  activeLayerName?: string;
  existingFeaturesSummary?: string;
  crs?: string;
}

// 1. Open Source Free AI Inference (Pollinations AI with Llama 3 / Mistral / Qwen)
async function fetchOpenSourceLlm(prompt: string, systemPrompt: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    const fullPrompt = `${systemPrompt}\n\nUser Question: ${prompt}`;
    const url = `https://text.pollinations.ai/${encodeURIComponent(fullPrompt)}?model=openai&seed=${Math.floor(Math.random() * 10000)}`;

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'text/plain',
        'User-Agent': 'BhuNex-GeoStudio/3.7'
      }
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const text = await res.text();
      if (text && text.trim().length > 20) {
        return text.trim();
      }
    }
  } catch {
    // Open source fetch failed or timed out; smoothly fall back
  }
  return null;
}

// 2. Built-in Deterministic Geomatics NLP & Geometric Synthesizer (Zero-Failure Offline Engine)
export function localGeomaticsCompiler(
  prompt: string,
  context: GeomaticsAiContext
): GeomaticsAiResult {
  const pLower = prompt.toLowerCase();
  const cE = context.centerCoord?.E || 255000;
  const cN = context.centerCoord?.N || 2605000;
  const zone = context.workingZone || '45N';

  // 1. Parcel / Land Area Generation
  if (pLower.includes('parcel') || pLower.includes('farm') || pLower.includes('plot') || pLower.includes('khasra') || pLower.includes('hectare') || pLower.includes('acre') || pLower.includes('bigha')) {
    // Extract dimensions or area if specified
    let areaHectares = 4.0;
    const haMatch = pLower.match(/(\d+(\.\d+)?)\s*(ha|hectare)/i);
    const acreMatch = pLower.match(/(\d+(\.\d+)?)\s*(acre)/i);
    const bighaMatch = pLower.match(/(\d+(\.\d+)?)\s*(bigha)/i);

    if (haMatch) areaHectares = parseFloat(haMatch[1]);
    else if (acreMatch) areaHectares = parseFloat(acreMatch[1]) * 0.404686;
    else if (bighaMatch) areaHectares = parseFloat(bighaMatch[1]) * 0.2529; // Standard 2529 sq.m Bigha

    const areaM2 = areaHectares * 10000;
    const sideM = Math.sqrt(areaM2);
    const half = sideM / 2;

    const p1 = { a: Math.round(cE - half), b: Math.round(cN - half) };
    const p2 = { a: Math.round(cE + half), b: Math.round(cN - half) };
    const p3 = { a: Math.round(cE + half), b: Math.round(cN + half) };
    const p4 = { a: Math.round(cE - half), b: Math.round(cN + half) };

    const parcelFeature: GeoFeature = {
      name: `Parcel-${Math.floor(Math.random() * 900 + 100)} (${areaHectares.toFixed(1)} ha)`,
      geom: 'polygon',
      kind: 'en',
      pts: [p1, p2, p3, p4, p1],
      props: {
        area_m2: areaM2,
        area_ha: areaHectares,
        perimeter_m: sideM * 4,
        land_use: 'Agricultural / Survey Plot',
        crs_zone: zone
      }
    };

    return {
      answer: `### 📐 Cadastral Parcel Synthesized\n\n- **Target Area:** ${areaHectares.toFixed(2)} Hectares (${areaM2.toLocaleString()} m² / ${(areaM2 / 4046.86).toFixed(2)} Acres)\n- **Boundary Dimensions:** ${sideM.toFixed(1)} m × ${sideM.toFixed(1)} m square perimeter\n- **Centroid Coordinates (UTM Zone ${zone}):** Easting ${cE.toFixed(1)} m, Northing ${cN.toFixed(1)} m\n- **Corner Nodes:**\n  1. SW: \`E: ${p1.a}, N: ${p1.b}\`\n  2. SE: \`E: ${p2.a}, N: ${p2.b}\`\n  3. NE: \`E: ${p3.a}, N: ${p3.b}\n  4. NW: \`E: ${p4.a}, N: ${p4.b}\`\n\nClick **"Insert Features"** below to place this parcel directly into your active layer.`,
      generatedFeatures: [parcelFeature],
      modelUsed: 'OpenSource-GeoEngine-v3.7',
      source: 'geomatics_engine'
    };
  }

  // 2. Borehole / Drillhole Exploration Grid Generation
  if (pLower.includes('borehole') || pLower.includes('drill') || pLower.includes('grid') || pLower.includes('collar')) {
    let rows = 2;
    let cols = 3;
    let spacing = 100;

    const gridMatch = pLower.match(/(\d+)\s*[x×]\s*(\d+)/);
    if (gridMatch) {
      rows = parseInt(gridMatch[1]);
      cols = parseInt(gridMatch[2]);
    }
    const spacingMatch = pLower.match(/(\d+(\.\d+)?)\s*(m|meter)/i);
    if (spacingMatch) {
      spacing = parseFloat(spacingMatch[1]);
    }

    const features: GeoFeature[] = [];
    let count = 1;
    const startE = cE - ((cols - 1) * spacing) / 2;
    const startN = cN - ((rows - 1) * spacing) / 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ePos = Math.round(startE + c * spacing);
        const nPos = Math.round(startN + r * spacing);
        features.push({
          name: `BH-${String(count).padStart(2, '0')}`,
          geom: 'point',
          kind: 'en',
          pts: [{ a: ePos, b: nPos }],
          props: {
            depth_m: 120 + (count % 3) * 30,
            water_table_m: 18.5,
            ore_type: 'Iron Ore / Limestone formation',
            elevation_msl: 310 + (count * 2)
          }
        });
        count++;
      }
    }

    return {
      answer: `### ⛏️ Exploration Borehole Array Synthesized\n\n- **Pattern:** ${rows} Rows × ${cols} Columns (${features.length} drill collar stations)\n- **Collar Spacing:** ${spacing} meters grid interval (UNFC / IBM exploration spacing)\n- **Spatial Bounding Envelope:** ${((cols - 1) * spacing)} m EW × ${((rows - 1) * spacing)} m NS\n\nAll ${features.length} drillholes have been prepared with geocoded UTM coordinates in Zone ${zone}.`,
      generatedFeatures: features,
      modelUsed: 'OpenSource-GeoEngine-v3.7',
      source: 'geomatics_engine'
    };
  }

  // 3. Road Traverse Corridor / Linear Pipeline
  if (pLower.includes('road') || pLower.includes('corridor') || pLower.includes('pipeline') || pLower.includes('traverse') || pLower.includes('waypoint')) {
    const pts = [
      { a: Math.round(cE - 150), b: Math.round(cN - 100) },
      { a: Math.round(cE - 50), b: Math.round(cN - 20) },
      { a: Math.round(cE + 60), b: Math.round(cN + 70) },
      { a: Math.round(cE + 180), b: Math.round(cN + 140) }
    ];

    let totalLen = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      totalLen += Math.hypot(pts[i + 1].a - pts[i].a, pts[i + 1].b - pts[i].b);
    }

    const corridorFeature: GeoFeature = {
      name: `Corridor-Align-${Math.floor(Math.random() * 90 + 10)} (${totalLen.toFixed(0)}m)`,
      geom: 'line',
      kind: 'en',
      pts: pts,
      props: {
        length_m: totalLen,
        gradient_pct: 2.8,
        right_of_way_m: 30,
        surface_type: 'Flexible Bituminous Corridor'
      }
    };

    return {
      answer: `### 🛣️ Road Traverse Corridor Synthesized\n\n- **Total Alignment Length:** ${totalLen.toFixed(1)} meters\n- **Number of PVI Waypoints:** 4 Points of Intersection\n- **Bearing:** General North-East corridor trajectory ($N 48^\\circ E$)\n- **Alignment Waypoints:**\n  - P0 (Start): \`E: ${pts[0].a}, N: ${pts[0].b}\`\n  - P1: \`E: ${pts[1].a}, N: ${pts[1].b}\`\n  - P2: \`E: ${pts[2].a}, N: ${pts[2].b}\`\n  - P3 (End): \`E: ${pts[3].a}, N: ${pts[3].b}\``,
      generatedFeatures: [corridorFeature],
      modelUsed: 'OpenSource-GeoEngine-v3.7',
      source: 'geomatics_engine'
    };
  }

  // 4. Buffer Zone / Safety Setback
  if (pLower.includes('buffer') || pLower.includes('setback') || pLower.includes('dgms') || pLower.includes('safety')) {
    let radiusM = 50;
    const radMatch = pLower.match(/(\d+(\.\d+)?)\s*(m|meter)/i);
    if (radMatch) radiusM = parseFloat(radMatch[1]);

    const numPoints = 16;
    const ringPts = [];
    for (let i = 0; i <= numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      ringPts.push({
        a: Math.round(cE + Math.cos(angle) * radiusM),
        b: Math.round(cN + Math.sin(angle) * radiusM)
      });
    }

    const bufferFeature: GeoFeature = {
      name: `Safety-Buffer-${radiusM}m`,
      geom: 'polygon',
      kind: 'en',
      pts: ringPts,
      props: {
        radius_m: radiusM,
        regulation: 'DGMS / MoEFCC Environmental & Safety Setback',
        area_m2: Math.PI * radiusM * radiusM
      }
    };

    return {
      answer: `### 🛡️ Environmental & Safety Buffer Zone Synthesized\n\n- **Buffer Radius:** ${radiusM} meters radial clearance\n- **Enclosed Exclusion Area:** ${(Math.PI * radiusM * radiusM).toFixed(1)} m² (${((Math.PI * radiusM * radiusM) / 10000).toFixed(3)} ha)\n- **Center Anchor:** Easting ${cE.toFixed(1)} m, Northing ${cN.toFixed(1)} m (Zone ${zone})\n- **Applicable Standards:** DGMS 7.5m / 50m mine boundary barrier and MoEFCC green belt buffer requirements.`,
      generatedFeatures: [bufferFeature],
      modelUsed: 'OpenSource-GeoEngine-v3.7',
      source: 'geomatics_engine'
    };
  }

  // 5. General Geomatics Knowledge & Guidance Assistant
  return {
    answer: `### 🌐 BhuStudio Geomatics Expert Analysis\n\n**Query:** "${prompt}"\n\n**Key Surveying & GIS Insights:**\n1. **Coordinate Reference System (CRS):** Active projection is **UTM Zone ${zone} (WGS84)**. Ensure all boundary traverses are corrected for grid scale factor ($k_0 \\approx 0.9996$).\n2. **Area Conversion Standard:**\n   - $1 \\text{ Hectare} = 10,000 \\text{ m}^2 = 2.47105 \\text{ Acres}$\n   - $1 \\text{ Standard Bigha} \\approx 2,529.28 \\text{ m}^2 = 20 \\text{ Kathas} = 400 \\text{ Dhurs}$\n3. **Closed Traverse Precision:** Apply **Bowditch Rule (Compass Rule)** for transit survey adjustments: \n   $$\\text{Correction}_L = -\\text{Total Closing Error}_L \\times \\frac{\\text{Length of Line}}{\\text{Total Perimeter}}$$\n4. **Recommended Next Actions in BhuStudio:**\n   - To digitize spatial boundaries, select the **Polygon** or **Line** tool on the top toolbar.\n   - To enable real-world aerial imagery, turn on the **Google Map / Satellite** checkbox.\n   - To verify elevation changes, open the **Google Earth 3D Panel** to inspect the live topographic profile slice.`,
    modelUsed: 'OpenSource-GeoEngine-v3.7',
    source: 'geomatics_engine'
  };
}

// 3. Unified Geomatics AI Solver (Tries LLM first, falls back instantly to Geomatics Engine)
export async function executeGeomaticsAi(
  prompt: string,
  context: GeomaticsAiContext
): Promise<GeomaticsAiResult> {
  const systemPrompt = `You are the AI Spatial Copilot for BhuStudio. Answer surveying, GIS, cadastral, and mining engineering questions with precision. If geometry is needed, include a JSON codeblock with GeoFeature[] points (Easting/Northing in UTM Zone ${context.workingZone || '45N'} centered near E: ${context.centerCoord?.E || 255000}, N: ${context.centerCoord?.N || 2605000}).`;

  // Step 1: Try open source online LLM
  try {
    const rawLlmResponse = await fetchOpenSourceLlm(prompt, systemPrompt);
    if (rawLlmResponse) {
      let generatedFeatures: GeoFeature[] = [];
      const jsonMatch = rawLlmResponse.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          if (Array.isArray(parsed)) generatedFeatures = parsed;
          else if (parsed.features && Array.isArray(parsed.features)) generatedFeatures = parsed.features;
          else if (parsed.pts) generatedFeatures = [parsed];
        } catch {}
      }

      // If no JSON was returned by LLM but query was geometry-heavy, augment with local compiler features
      if (generatedFeatures.length === 0) {
        const local = localGeomaticsCompiler(prompt, context);
        if (local.generatedFeatures && local.generatedFeatures.length > 0) {
          generatedFeatures = local.generatedFeatures;
        }
      }

      return {
        answer: rawLlmResponse.replace(/```json\s*[\s\S]*?\s*```/, '').trim(),
        generatedFeatures: generatedFeatures.length > 0 ? generatedFeatures : undefined,
        modelUsed: 'Llama-3-OpenSource',
        source: 'opensource_llm'
      };
    }
  } catch {}

  // Step 2: Deterministic local geomatics compiler
  return localGeomaticsCompiler(prompt, context);
}
