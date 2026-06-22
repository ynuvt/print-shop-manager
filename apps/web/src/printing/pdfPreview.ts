/**
 * Client-side PRINT preview via PDF.js.
 *
 * Renders the actual first printed sheet on a white page, matching how the
 * native ZopyPrinter (apps/electron/native/ZopyPrinter/Program.cs) lays pages
 * out: orientation-aware N-up grids (row-major), per-page auto-rotation to the
 * cell, and fit/shrink scaling — so the preview reflects the real output.
 *
 * No server-side image is stored; everything renders in the browser.
 */
import { ensurePdfJs } from "./pdfPageCount";

export interface SheetPreviewOptions {
  pagesPerSheet: number;
  orientation: "PORTRAIT" | "LANDSCAPE";
  scaleMode: "FIT" | "SHRINK" | "NOSCALE";
  pageRange: "ALL" | "CUSTOM";
  customRange?: string;
}

export interface SheetPreviewResult {
  dataUrl: string | null;
  pagesShown: number;
  totalSheets: number;
}

// Long edge of the rendered A4 sheet, in px. Short edge derived from A4 ratio.
const SHEET_LONG = 1000;
const SHEET_SHORT = Math.round(SHEET_LONG * (210 / 297));
const PAGE_RENDER_WIDTH = 700;

// Caches: the loaded document, individual rendered page canvases, and the final
// composited sheets (keyed by url + options) so option changes are cheap.
const docCache = new Map<string, Promise<PdfDoc>>();
const pageCanvasCache = new Map<string, HTMLCanvasElement>();
const sheetCache = new Map<string, SheetPreviewResult>();

interface PdfPageLike {
  getViewport(opts: { scale: number }): { width: number; height: number };
  render(opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }): { promise: Promise<void> };
}
interface PdfDoc {
  numPages: number;
  getPage(n: number): Promise<PdfPageLike>;
}

function loadDoc(url: string): Promise<PdfDoc> {
  let p = docCache.get(url);
  if (!p) {
    p = (async () => {
      const pdfjs = await ensurePdfJs();
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      const data = await res.arrayBuffer();
      return (await pdfjs.getDocument({ data }).promise) as unknown as PdfDoc;
    })();
    docCache.set(url, p);
  }
  return p;
}

async function getPageCanvas(
  url: string,
  doc: PdfDoc,
  pageNumber: number,
): Promise<HTMLCanvasElement | null> {
  const key = `${url}#${pageNumber}`;
  const cached = pageCanvasCache.get(key);
  if (cached) return cached;

  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2, PAGE_RENDER_WIDTH / base.width);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;

  pageCanvasCache.set(key, canvas);
  return canvas;
}

/** Parse a custom page range like "1-3, 5, 8-10" into 1-based page numbers. */
function parsePageList(range: string, total: number): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  const add = (p: number) => {
    if (p >= 1 && p <= total && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  };
  for (const part of range.split(",")) {
    const t = part.trim();
    if (!t) continue;
    const m = t.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      let a = parseInt(m[1]!, 10);
      let b = parseInt(m[2]!, 10);
      if (a > b) [a, b] = [b, a];
      for (let p = a; p <= b; p += 1) add(p);
    } else {
      const p = parseInt(t, 10);
      if (!Number.isNaN(p)) add(p);
    }
  }
  return out;
}

/** Grid layout for a given pages-per-sheet, mirroring ZopyPrinter's Program.cs. */
function gridForPps(
  pps: number,
  sheetLandscape: boolean,
): { rows: number; cols: number } {
  if (pps <= 1) return { rows: 1, cols: 1 };
  if (pps <= 2) return sheetLandscape ? { rows: 1, cols: 2 } : { rows: 2, cols: 1 };
  if (pps <= 4) return { rows: 2, cols: 2 };
  if (pps <= 6) return sheetLandscape ? { rows: 2, cols: 3 } : { rows: 3, cols: 2 };
  if (pps <= 9) return { rows: 3, cols: 3 };
  return sheetLandscape ? { rows: 3, cols: 4 } : { rows: 4, cols: 3 };
}

export async function renderSheetPreview(
  url: string,
  opts: SheetPreviewOptions,
): Promise<SheetPreviewResult> {
  if (!url) return { dataUrl: null, pagesShown: 0, totalSheets: 0 };

  const cacheKey = `${url}|${JSON.stringify(opts)}`;
  const cachedSheet = sheetCache.get(cacheKey);
  if (cachedSheet) return cachedSheet;

  try {
    const doc = await loadDoc(url);
    const total = doc.numPages;

    const effective =
      opts.pageRange === "CUSTOM" && opts.customRange
        ? parsePageList(opts.customRange, total)
        : Array.from({ length: total }, (_, i) => i + 1);

    if (effective.length === 0) {
      return { dataUrl: null, pagesShown: 0, totalSheets: 0 };
    }

    const pps = Math.max(1, opts.pagesPerSheet || 1);
    const sheetPages = effective.slice(0, pps); // first sheet only
    const totalSheets = Math.ceil(effective.length / pps);

    const sheetLandscape = opts.orientation === "LANDSCAPE";
    const { rows, cols } = gridForPps(pps, sheetLandscape);

    const sheetW = sheetLandscape ? SHEET_LONG : SHEET_SHORT;
    const sheetH = sheetLandscape ? SHEET_SHORT : SHEET_LONG;

    const sheet = document.createElement("canvas");
    sheet.width = sheetW;
    sheet.height = sheetH;
    const ctx = sheet.getContext("2d");
    if (!ctx) return { dataUrl: null, pagesShown: 0, totalSheets };
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sheetW, sheetH);

    const cellW = sheetW / cols;
    const cellH = sheetH / rows;
    const cellIsLandscape = cellW > cellH;
    const pad = 0.04;
    const availW = cellW * (1 - 2 * pad);
    const availH = cellH * (1 - 2 * pad);

    for (let p = 0; p < sheetPages.length; p += 1) {
      const pageCanvas = await getPageCanvas(url, doc, sheetPages[p]!);
      if (!pageCanvas) continue;

      const pw = pageCanvas.width;
      const ph = pageCanvas.height;
      const docIsLandscape = pw > ph;
      const rotate = docIsLandscape !== cellIsLandscape; // auto-rotate to cell

      const boundingW = rotate ? ph : pw;
      const boundingH = rotate ? pw : ph;
      let scale = Math.min(availW / boundingW, availH / boundingH);
      if (opts.scaleMode !== "FIT") scale = Math.min(1, scale);

      const dw = pw * scale;
      const dh = ph * scale;
      const r = Math.floor(p / cols);
      const c = p % cols;
      const cx = c * cellW + cellW / 2;
      const cy = r * cellH + cellH / 2;

      ctx.save();
      ctx.translate(cx, cy);
      if (rotate) ctx.rotate(Math.PI / 2);
      ctx.drawImage(pageCanvas, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }

    const result: SheetPreviewResult = {
      dataUrl: sheet.toDataURL("image/jpeg", 0.85),
      pagesShown: sheetPages.length,
      totalSheets,
    };
    sheetCache.set(cacheKey, result);
    return result;
  } catch {
    return { dataUrl: null, pagesShown: 0, totalSheets: 0 };
  }
}
