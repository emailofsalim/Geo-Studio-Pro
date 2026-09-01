// ============================================================================
// BhuNex Studio — PDF page rasteriser
// ----------------------------------------------------------------------------
// Renders a page of a PDF to a raster image the digitizer can trace over.
//
// Cadastral sheets, mouza maps and lease plans are very often distributed as
// PDFs rather than images. The PWA lineage of the digitizer
// (bhunaksha-digitizer-wpav3) handled them; the React digitizer accepted only
// `image/*`, so those sheets had to be converted outside the application
// first. This module closes that gap.
//
// A PDF page has no inherent pixel size - it is vector geometry in points - so
// the caller chooses a render scale. Higher scale gives more detail to digitise
// against at the cost of memory, and the cap below keeps a large sheet from
// exhausting the canvas limits on a mobile device.
// ============================================================================

import * as pdfjsLib from 'pdfjs-dist';
// Vite resolves this to a hashed asset URL and ships the worker alongside the
// bundle, so rendering stays off the main thread without a CDN dependency.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/** Largest edge, in pixels, that a rendered page may have. */
export const MAX_RENDER_EDGE = 4096;

export interface PdfDocumentHandle {
  pageCount: number;
  /** Renders a 1-based page number to a PNG blob URL. */
  renderPage: (pageNumber: number, scale?: number) => Promise<RenderedPage>;
  /** Releases the document's resources. */
  destroy: () => Promise<void>;
}

export interface RenderedPage {
  /** Object URL of the rendered PNG. The caller owns it and must revoke it. */
  url: string;
  width: number;
  height: number;
  pageNumber: number;
  /** Scale actually used, after clamping to MAX_RENDER_EDGE. */
  appliedScale: number;
  /** True when the requested scale was reduced to stay within the size cap. */
  scaleReduced: boolean;
}

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

/**
 * Opens a PDF and returns a handle for rendering its pages.
 *
 * Throws with a readable message on an encrypted or malformed file, so the
 * caller can show the user something actionable rather than a stack trace.
 */
export async function openPdf(file: File): Promise<PdfDocumentHandle> {
  const data = new Uint8Array(await file.arrayBuffer());

  let doc: pdfjsLib.PDFDocumentProxy;
  try {
    doc = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
  } catch (err: any) {
    if (err?.name === 'PasswordException') {
      throw new Error('This PDF is password protected. Remove the password and try again.');
    }
    throw new Error(`This file could not be read as a PDF: ${err?.message || 'unknown error'}`);
  }

  if (doc.numPages < 1) {
    await doc.destroy();
    throw new Error('This PDF contains no pages.');
  }

  const renderPage = async (pageNumber: number, scale = 2): Promise<RenderedPage> => {
    const n = Math.max(1, Math.min(doc.numPages, Math.floor(pageNumber) || 1));
    const page = await doc.getPage(n);

    const base = page.getViewport({ scale: 1 });
    // Clamp so a large-format sheet cannot blow past the canvas size limit.
    const maxScale = MAX_RENDER_EDGE / Math.max(base.width, base.height);
    const appliedScale = Math.min(scale, maxScale);
    const scaleReduced = appliedScale < scale;

    const viewport = page.getViewport({ scale: appliedScale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('The browser could not provide a canvas to render the page onto.');

    // Cadastral sheets are line drawings on white; painting the ground first
    // keeps transparent regions from rendering black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;
    page.cleanup();

    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not encode the rendered page.'))), 'image/png')
    );

    return {
      url: URL.createObjectURL(blob),
      width: canvas.width,
      height: canvas.height,
      pageNumber: n,
      appliedScale,
      scaleReduced
    };
  };

  return {
    pageCount: doc.numPages,
    renderPage,
    destroy: () => doc.destroy()
  };
}
