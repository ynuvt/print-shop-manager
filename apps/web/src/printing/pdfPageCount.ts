/**
 * PDF page count detection via PDF.js loaded from CDN.
 *
 * PDF.js is loaded lazily from the Cloudflare CDN on the first call.
 * Subsequent calls reuse the already-loaded library.
 * Returns 1 as a safe fallback if detection fails.
 */

interface PdfJsLib {
  getDocument(src: { data: ArrayBuffer }): {
    promise: Promise<{ numPages: number }>;
  };
  GlobalWorkerOptions: { workerSrc: string };
}

declare global {
  interface Window {
    pdfjsLib?: PdfJsLib;
  }
}

const PDF_JS_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDF_JS_WORKER_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

function injectPdfJsScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PDF_JS_CDN;
    script.async = true;
    script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_CDN;
      }
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load PDF.js from CDN."));
    document.head.appendChild(script);
  });
}

// Shared promise so concurrent calls don't inject the script multiple times.
let pdfJsReady: Promise<void> | null = null;

async function ensurePdfJs(): Promise<PdfJsLib> {
  if (!window.pdfjsLib) {
    pdfJsReady ??= injectPdfJsScript();
    await pdfJsReady;
  }
  // After the script loads, pdfjsLib is guaranteed to exist.
  return window.pdfjsLib as PdfJsLib;
}

/**
 * Returns the number of pages in a PDF file.
 * Automatically loads PDF.js from CDN on the first call.
 * Falls back to 1 if the file is not a valid PDF or detection fails.
 */
export async function getPdfPageCount(file: File): Promise<number> {
  try {
    const pdfjs = await ensurePdfJs();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    return pdf.numPages;
  } catch {
    return 1;
  }
}
