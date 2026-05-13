import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import https from "node:https";
import { getPrinters } from "pdf-to-printer";
import { spawn } from "node:child_process";

const getZopyPrinterPath = (): string => {
  const isDev = process.env.NODE_ENV !== "production" && !app.isPackaged;
  if (isDev) {
    const devPaths = [
      // Published path
      path.join(__dirname, "..", "native", "ZopyPrinter", "bin", "Release", "net8.0-windows", "win-x64", "publish", "ZopyPrinter.exe"),
      // Standard build path
      path.join(__dirname, "..", "native", "ZopyPrinter", "bin", "Release", "net8.0-windows", "win-x64", "ZopyPrinter.exe"),
      // Fallback to resources during dev
      path.join(__dirname, "..", "resources", "ZopyPrinter", "ZopyPrinter.exe"),
    ];
    for (const p of devPaths) {
      if (fs.existsSync(p)) return p;
    }
    // Final dev fallback (just in case)
    return devPaths[0]!;
  }
  return path.join(process.resourcesPath, "ZopyPrinter", "ZopyPrinter.exe");
};

// Dry-run mode: auto-enabled on non-Windows platforms (Mac/Linux) for testing.
// On Windows, real printing is used.
const DRY_RUN = process.platform !== "win32";

type PrinterInfo = { name: string; isDefault: boolean };

function normalizePrinterName(name: string): string {
  return name
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizePrinterList(list: any[]): PrinterInfo[] {
  const map = new Map<string, PrinterInfo>();
  for (const p of Array.isArray(list) ? list : []) {
    const name =
      typeof p?.name === "string"
        ? p.name
        : typeof p?.displayName === "string"
          ? p.displayName
          : null;
    if (!name) continue;
    const isDefault = Boolean(p?.isDefault);
    const existing = map.get(name);
    if (!existing) map.set(name, { name, isDefault });
    else if (isDefault && !existing.isDefault) map.set(name, { name, isDefault });
  }
  return [...map.values()];
}

async function resolvePdfToPrinterName(requestedName: string): Promise<string> {
  const requestedNorm = normalizePrinterName(requestedName);
  const pdfPrinters = normalizePrinterList(await getPrinters());

  // Exact match
  const exact = pdfPrinters.find(
    (p) => normalizePrinterName(p.name) === requestedNorm,
  );
  if (exact) return exact.name;

  // Looser match (substring both ways) to survive odd spacing/casing.
  const loose = pdfPrinters.find((p) => {
    const n = normalizePrinterName(p.name);
    return n.includes(requestedNorm) || requestedNorm.includes(n);
  });
  if (loose) return loose.name;

  // If we can't resolve, return the original; caller may fallback.
  return requestedName;
}

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif", ".webp", ".gif"]);

function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

/** Print an image file by wrapping it in HTML so it fills the page properly. */
async function printImageViaWebContents(
  filePath: string,
  printerName: string,
  normalizedOptions?: any,
): Promise<void> {
  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    // Wrap image in HTML that fills the printed page
    const imageUrl = `file://${filePath}`;
    const html = `
      <html>
        <head>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            @page { margin: 0; }
            html, body { width: 100%; height: 100%; }
            body {
              display: flex;
              align-items: center;
              justify-content: center;
              background: #fff;
            }
            img {
              max-width: 100%;
              max-height: 100%;
              object-fit: contain;
            }
          </style>
        </head>
        <body>
          <img src="${imageUrl}" />
        </body>
      </html>
    `;
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    // Wait for the image to finish loading
    await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const img = document.querySelector('img');
        if (img.complete) return resolve();
        img.onload = resolve;
        img.onerror = resolve;
      });
    `);

    const electronPrintOpts: Record<string, any> = {
      silent: true,
      deviceName: printerName,
      printBackground: true,
    };

    if (normalizedOptions) {
      if (normalizedOptions.copies) {
        electronPrintOpts.copies = Math.max(1, Number(normalizedOptions.copies) || 1);
      }
      if (normalizedOptions.orientation === "landscape") {
        electronPrintOpts.landscape = true;
      }
      const side = normalizedOptions.side?.toLowerCase();
      if (side === "duplexlong") {
        electronPrintOpts.duplexMode = "longEdge";
      } else if (side === "duplexshort") {
        electronPrintOpts.duplexMode = "shortEdge";
      } else {
        electronPrintOpts.duplexMode = "simplex";
      }
    }

    console.log(`[IMAGE PRINT] webContents.print → ${printerName}`, electronPrintOpts);

    await new Promise<void>((resolve, reject) => {
      win.webContents.print(
        electronPrintOpts,
        (success, failureReason) => {
          if (success) resolve();
          else reject(new Error(failureReason || "Image print failed"));
        },
      );
    });
  } finally {
    win.destroy();
  }
}

async function printPdfViaWebContents(
  filePath: string,
  printerName: string,
  normalizedOptions?: any,
): Promise<void> {
  const win = new BrowserWindow({
    show: false,
    width: 1200,  // wider for better PDF rendering quality
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      plugins: true, // ensure Chromium PDF plugin is active
    },
  });

  try {
    // Event-driven wait to guarantee the Chromium PDF plugin has fully 
    // parsed and initialized before we issue the print command.
    // 'did-stop-loading' fires when the document and the PDF plugin have completely finished loading.
    await new Promise<void>((resolve, reject) => {
      let isResolved = false;
      const finish = () => {
        if (!isResolved) {
          isResolved = true;
          resolve();
        }
      };

      win.webContents.once("did-stop-loading", () => {
        console.log(`[PDF] 'did-stop-loading' fired for ${path.basename(filePath)}`);
        // The PDF is fully parsed by Chromium. Proceed to print immediately without any artificial delay.
        finish();
      });

      win.webContents.once("did-fail-load", (_, errorCode, errorDescription) => {
        reject(new Error(`Failed to load PDF: ${errorDescription} (${errorCode})`));
      });

      win.loadURL(`file://${filePath}`).catch(reject);
    });

    // printBackground: false — PDF page content is foreground (not CSS
    // backgrounds), so this is correct. Setting it true was printing the
    // PDF viewer's dark chrome/overlay as solid black.
    const electronPrintOpts: Record<string, any> = {
      silent: true,
      deviceName: printerName,
      printBackground: false,
    };

    if (normalizedOptions) {
      if (normalizedOptions.copies) {
        electronPrintOpts.copies = Math.max(1, Number(normalizedOptions.copies) || 1);
      }
      if (normalizedOptions.orientation === "landscape") {
        electronPrintOpts.landscape = true;
      }
      // Map side/duplex to Electron's duplexMode
      const side = normalizedOptions.side?.toLowerCase();
      if (side === "duplexlong") {
        electronPrintOpts.duplexMode = "longEdge";
      } else if (side === "duplexshort") {
        electronPrintOpts.duplexMode = "shortEdge";
      } else {
        electronPrintOpts.duplexMode = "simplex";
      }
      // Page ranges (e.g. "1-3,5")
      if (normalizedOptions.pages) {
        electronPrintOpts.pageRanges = normalizedOptions.pages;
      }
      // N-up pages per sheet (only supported via loadWebContent)
      const pps = Number(normalizedOptions.pagesPerSheet);
      if (pps && pps > 1) {
        electronPrintOpts.pagesPerSheet = pps;
      }
    }

    console.log(`[PDF] webContents.print → ${printerName}`, electronPrintOpts);

    await new Promise<void>((resolve, reject) => {
      win.webContents.print(
        electronPrintOpts,
        (success, failureReason) => {
          if (success) resolve();
          else reject(new Error(failureReason || "webContents.print failed"));
        },
      );
    });
  } finally {
    win.destroy();
  }
}

async function listPrintersViaWebContents(): Promise<PrinterInfo[]> {
  // Prefer an existing window (no flicker, no extra lifecycle).
  const existing = BrowserWindow.getAllWindows()[0];
  if (existing?.webContents?.getPrintersAsync) {
    try {
      const list = await existing.webContents.getPrintersAsync();
      return normalizePrinterList(list);
    } catch {
      // fall through
    }
  }

  // Fallback: create a tiny hidden window for printer enumeration.
  const win = new BrowserWindow({
    show: false,
    width: 1,
    height: 1,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    await win.loadURL("about:blank");
    const list = await win.webContents.getPrintersAsync();
    return normalizePrinterList(list);
  } finally {
    win.destroy();
  }
}

function createWindow() {
  const iconPath = path.join(__dirname, "..", "resources", "icon.png");
  const window = new BrowserWindow({
    title: "Zopy Print Manager",
    width: 960,
    height: 640,
    backgroundColor: "#f8f9fb",
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;

  if (rendererUrl) {
    void window.loadURL(rendererUrl);
    window.webContents.openDevTools({ mode: "detach" });
    return;
  }

  // In production, load from the bundled HTML file with absolute path
  try {
    // Try loading from app's resources
    const appPath = app.getAppPath();
    const distPath = path.join(appPath, "dist", "index.html");

    if (fs.existsSync(distPath)) {
      window.loadFile(distPath);
    } else {
      // Fallback: check if we're in dev-like structure
      const fallbackPath = path.join(__dirname, "..", "dist", "index.html");
      if (fs.existsSync(fallbackPath)) {
        window.loadFile(fallbackPath);
      } else {
        console.error(
          `Could not find index.html at ${distPath} or ${fallbackPath}`,
        );
        // Last resort: load a blank page with error message
        window.webContents.loadURL(
          `data:text/html,<h1>Failed to load application</h1><p>Could not find required files.</p>`,
        );
      }
    }
  } catch (error) {
    console.error("Error loading app:", error);
    window.webContents.loadURL(
      `data:text/html,<h1>Error Loading Application</h1><p>${String(error)}</p>`,
    );
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  if (process.platform === "win32") {
    const exePath = getZopyPrinterPath();
    if (fs.existsSync(exePath)) {
      console.log("[ZopyPrinter] Warming up EXE...");
      spawn(exePath, ["--warmup"], {
        cwd: path.dirname(exePath),
      });
    }
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

/** Sanitize temp filenames to prevent overly long names from causing issues. */
function sanitizeTempFileName(name: string): string {
  const ext = path.extname(name);
  let base = path.basename(name, ext);
  // Replace spaces and special chars with underscores
  base = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  // Truncate to max 80 chars
  if (base.length > 80) base = base.substring(0, 80);
  return `${base}${ext}`;
}

ipcMain.handle(
  "download-files",
  async (event, files: { url: string; name: string }[]) => {
    const tempDir = os.tmpdir();
    const downloadedPaths: string[] = [];

    for (const [idx, file] of files.entries()) {
      const safeName = sanitizeTempFileName(file.name);
      const fileName = `printowl_${Date.now()}_${safeName}`;
      const filePath = path.join(tempDir, fileName);

      try {
        await downloadFile(
          event,
          file.url,
          filePath,
          idx,
          files.length,
          file.name,
        );
        downloadedPaths.push(filePath);
      } catch (error) {
        console.error(`Failed to download ${file.url}:`, error);
        // Continue with other files
      }
    }

    return downloadedPaths;
  },
);

ipcMain.handle(
  "download-file",
  async (
    event,
    file: { url: string; name: string },
    meta?: { fileIndex?: number; totalFiles?: number; printRunId?: string },
  ) => {
    const tempDir = os.tmpdir();
    const safeName = sanitizeTempFileName(file.name);
    const fileName = `printowl_${Date.now()}_${safeName}`;
    const filePath = path.join(tempDir, fileName);

    await downloadFile(
      event,
      file.url,
      filePath,
      meta?.fileIndex ?? 0,
      meta?.totalFiles ?? 1,
      file.name,
      meta?.printRunId,
    );

    return filePath;
  },
);

ipcMain.handle("delete-files", async (event, paths: string[]) => {
  for (const filePath of paths) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`Failed to delete ${filePath}:`, error);
    }
  }
});

ipcMain.handle("list-printers", async () => {
  if (DRY_RUN) {
    console.log("[DRY RUN] Returning fake printer list");
    return [
      { name: "Test Printer (Dry Run)", isDefault: true },
      { name: "Color Printer (Dry Run)", isDefault: false },
    ];
  }

  if (process.platform === "win32") {
    const exePath = getZopyPrinterPath();
    if (fs.existsSync(exePath)) {
      console.log("[list-printers] Spawning ZopyPrinter for listing...");
      const printers = await new Promise<PrinterInfo[]>((resolve) => {
        const child = spawn(exePath, ["--list-printers"], {
          cwd: path.dirname(exePath),
        }) as any;
        let output = "";
        child.stdout.on("data", (data: Buffer) => {
          output += data.toString();
        });
        child.stderr.on("data", (data: Buffer) => {
          console.error("[ZopyPrinter stderr]", data.toString());
        });
        child.on("close", (code: number | null) => {
          console.log(`[list-printers] ZopyPrinter exited with code ${code}`);
          try {
            const lines = output.split("\n");
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith("{")) {
                const msg = JSON.parse(trimmed);
                if (msg.type === "printers" && Array.isArray(msg.printers)) {
                  console.log(`[list-printers] Found ${msg.printers.length} printers via C#`);
                  resolve(msg.printers);
                  return;
                } else if (msg.type === "error") {
                   console.error("[list-printers] C# Error:", msg.message);
                }
              }
            }
          } catch (e) {
            console.error("[ZopyPrinter] Failed to parse printer list:", e);
          }
          resolve([]);
        });
      });

      if (printers.length > 0) {
        return printers;
      }
      console.warn("[list-printers] ZopyPrinter returned no printers, trying fallback...");
    } else {
      console.warn("[list-printers] ZopyPrinter.exe NOT FOUND at path:", exePath);
    }
  }

  try {
    const printers = normalizePrinterList(await getPrinters());
    if (printers.length > 0) return printers;
    console.warn(
      "pdf-to-printer returned no printers; falling back to Electron enumeration",
    );
  } catch (error) {
    console.error(
      "Failed to list printers via pdf-to-printer; falling back to Electron enumeration:",
      error,
    );
  }

  try {
    return await listPrintersViaWebContents();
  } catch (error) {
    console.error("Failed to list printers via Electron webContents:", error);
    return [];
  }
});

ipcMain.handle(
  "print-pdf",
  async (
    event,
    filePath: string,
    printer: string,
    options: any,
    meta?: { fileIndex: number; totalFiles: number; printRunId?: string },
  ) => {
    try {
      const requestedSide =
        typeof options?.side === "string" ? options.side.toLowerCase() : null;
      const requestedDuplex =
        typeof options?.duplex === "string"
          ? options.duplex.toLowerCase()
          : null;
      const requestedOrientation =
        typeof options?.orientation === "string"
          ? options.orientation.toLowerCase()
          : null;
      const requestedScale =
        typeof options?.scale === "string" ? options.scale.toLowerCase() : null;

      const side =
        requestedSide === "duplexlong" ||
        requestedSide === "duplexshort" ||
        requestedSide === "simplex"
          ? requestedSide
          : requestedDuplex === "duplex"
            ? "duplexlong"
            : "simplex";

      const normalizedOptions = {
        ...options,
        copies: Math.max(1, Number(options?.copies) || 1),
        paperSize: "A4",
        side,
        orientation:
          requestedOrientation === "landscape" ? "landscape" : "portrait",
        scale:
          requestedScale === "noscale"
            ? "noscale"
            : requestedScale === "shrink"
              ? "shrink"
              : "fit",
      };

      event.sender.send("print-progress", {
        fileIndex: meta?.fileIndex ?? 0,
        totalFiles: meta?.totalFiles ?? 1,
        percent: 0,
        fileName: path.basename(filePath),
        printRunId: meta?.printRunId,
      });

      if (DRY_RUN) {
        console.log(
          `[DRY RUN] Would print: ${path.basename(filePath)} → ${printer}`,
          normalizedOptions,
        );
        await new Promise((r) => setTimeout(r, 500)); // simulate spooler delay
      } else if (isImageFile(filePath)) {
        // Images: route directly to webContents with HTML wrapper.
        console.log(`[IMAGE] Detected image file: ${path.basename(filePath)} — using webContents.print directly`);
        await printImageViaWebContents(filePath, printer, normalizedOptions);
        console.log(`[IMAGE] webContents.print succeeded for ${path.basename(filePath)}`);
      } else if (process.platform === "win32") {
        // Windows PDF: use ZopyPrinter (C#)
        console.log(`[PDF] ZopyPrinter (C#) → ${printer}`, normalizedOptions);
        await runZopyPrinter(event, printer, [{ ...normalizedOptions, path: filePath }], meta);
        console.log(`[PDF] ZopyPrinter succeeded for ${path.basename(filePath)}`);
      } else {
        // Mac/Linux PDF: use Electron webContents.print
        console.log(`[PDF] webContents.print → ${printer}`, normalizedOptions);
        await printPdfViaWebContents(filePath, printer, normalizedOptions);
        console.log(`[PDF] webContents.print succeeded for ${path.basename(filePath)}`);
      }

      event.sender.send("print-progress", {
        fileIndex: meta?.fileIndex ?? 0,
        totalFiles: meta?.totalFiles ?? 1,
        percent: 100,
        fileName: path.basename(filePath),
        printRunId: meta?.printRunId,
      });
    } catch (error) {
      console.error(`Failed to print ${filePath}:`, error);
      throw error;
    }
  },
);

function downloadFile(
  event: Electron.IpcMainInvokeEvent,
  url: string,
  filePath: string,
  fileIndex: number,
  totalFiles: number,
  fileName: string,
  printRunId?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const totalBytes = Number(response.headers["content-length"] || 0);
        let downloadedBytes = 0;

        response.on("data", (chunk) => {
          downloadedBytes += chunk.length;
          const percent = totalBytes
            ? Math.floor((downloadedBytes / totalBytes) * 100)
            : 0;

          event.sender.send("download-progress", {
            fileIndex,
            totalFiles,
            percent,
            fileName,
            fileId: `${fileIndex}-${fileName}`,
            printRunId,
          });
        });

        response.pipe(file);
        file.on("finish", () => {
          file.close();
          event.sender.send("download-progress", {
            fileIndex,
            totalFiles,
            percent: 100,
            fileName,
            fileId: `${fileIndex}-${fileName}`,
            printRunId,
          });
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(filePath, () => {});
        reject(err);
      });
  });
}

async function runZopyPrinter(
  event: Electron.IpcMainInvokeEvent,
  printer: string,
  files: any[],
  meta?: { printRunId?: string },
) {
  const exePath = getZopyPrinterPath();
  const configPath = path.join(os.tmpdir(), `zopy_config_${Date.now()}.json`);

  fs.writeFileSync(
    configPath,
    JSON.stringify({
      PrinterName: printer,
      Files: files.map((f) => ({
        Path: f.path || f.filePath,
        Copies: f.copies || 1,
        PaperSize: f.paperSize || "A4",
        ColorMode: f.colorMode || (f.monochrome ? "BW" : "COLOR") || "BW",
        Duplex: f.duplex || f.side || "ONE",
        Orientation: f.orientation || "PORTRAIT",
        PagesPerSheet: Number(f.pagesPerSheet) || 1,
        Pages: f.pages || "",
        Scale: f.scale || "fit",
        Id: f.id || path.basename(f.path || f.filePath),
      })),
      PrintRunId: meta?.printRunId || "",
    }),
  );

  return new Promise<void>((resolve, reject) => {
    console.log(`[ZopyPrinter] Spawning EXE at ${exePath}`);
    const child = spawn(exePath, [configPath], {
      cwd: path.dirname(exePath),
    }) as any;

    let lastErrorMessage = "";

    child.stdout.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === "progress") {
            event.sender.send("batch-print-progress", {
              fileId: msg.fileId,
              percent: msg.percent,
              printRunId: meta?.printRunId,
            });
            event.sender.send("print-progress", {
              percent: msg.percent,
              fileName: msg.fileId,
              printRunId: meta?.printRunId,
            });
          } else if (msg.type === "error") {
            lastErrorMessage = msg.message;
            console.error("[ZopyPrinter] Error:", msg.message);
          }
        } catch (e) {
          console.log("[ZopyPrinter stdout]", line);
        }
      }
    });

    child.stderr.on("data", (data: Buffer) => {
      const err = data.toString();
      console.error("[ZopyPrinter stderr]", err);
      if (err.trim()) lastErrorMessage = err.trim();
    });

    child.on("close", (code: number | null) => {
      fs.unlink(configPath, () => {});
      if (code === 0) resolve();
      else {
        const errorDetail = lastErrorMessage ? `: ${lastErrorMessage}` : "";
        reject(new Error(`ZopyPrinter failed (code ${code})${errorDetail}`));
      }
    });
  });
}

ipcMain.handle(
  "print-batch",
  async (
    event,
    printer: string,
    files: any[],
    meta?: { printRunId?: string },
  ) => {
    if (process.platform === "win32") {
      const exePath = getZopyPrinterPath();
      if (fs.existsSync(exePath)) {
        await runZopyPrinter(event, printer, files, meta);
        return;
      }
      throw new Error(`ZopyPrinter.exe not found at ${exePath}`);
    }

    // Fallback logic for Mac/Linux (or dry run)
    console.log("[ZopyPrinter] Using webContents (non-Windows)...");
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const options = {
        copies: file.copies,
        side: file.duplex,
        orientation: file.orientation,
        pagesPerSheet: file.pagesPerSheet
      };
      
      event.sender.send("batch-print-progress", {
        fileId: file.id,
        percent: 0,
        printRunId: meta?.printRunId
      });
      
      if (DRY_RUN) {
         await new Promise((r) => setTimeout(r, 500));
      } else if (isImageFile(file.path)) {
         await printImageViaWebContents(file.path, printer, options);
      } else {
         await printPdfViaWebContents(file.path, printer, options);
      }
      
      event.sender.send("batch-print-progress", {
        fileId: file.id,
        percent: 100,
        printRunId: meta?.printRunId
      });
    }
  }
);
