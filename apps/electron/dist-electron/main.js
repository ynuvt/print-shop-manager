"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_https_1 = __importDefault(require("node:https"));
const pdf_to_printer_1 = require("pdf-to-printer");
// Dry-run mode: auto-enabled on non-Windows platforms (Mac/Linux) for testing.
// On Windows, real printing is used.
const DRY_RUN = process.platform !== "win32";
function normalizePrinterName(name) {
    return name
        .normalize("NFKC")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
}
function normalizePrinterList(list) {
    const map = new Map();
    for (const p of Array.isArray(list) ? list : []) {
        const name = typeof p?.name === "string"
            ? p.name
            : typeof p?.displayName === "string"
                ? p.displayName
                : null;
        if (!name)
            continue;
        const isDefault = Boolean(p?.isDefault);
        const existing = map.get(name);
        if (!existing)
            map.set(name, { name, isDefault });
        else if (isDefault && !existing.isDefault)
            map.set(name, { name, isDefault });
    }
    return [...map.values()];
}
async function resolvePdfToPrinterName(requestedName) {
    const requestedNorm = normalizePrinterName(requestedName);
    const pdfPrinters = normalizePrinterList(await (0, pdf_to_printer_1.getPrinters)());
    // Exact match
    const exact = pdfPrinters.find((p) => normalizePrinterName(p.name) === requestedNorm);
    if (exact)
        return exact.name;
    // Looser match (substring both ways) to survive odd spacing/casing.
    const loose = pdfPrinters.find((p) => {
        const n = normalizePrinterName(p.name);
        return n.includes(requestedNorm) || requestedNorm.includes(n);
    });
    if (loose)
        return loose.name;
    // If we can't resolve, return the original; caller may fallback.
    return requestedName;
}
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif", ".webp", ".gif"]);
function isImageFile(filePath) {
    const ext = node_path_1.default.extname(filePath).toLowerCase();
    return IMAGE_EXTENSIONS.has(ext);
}
/** Print an image file by wrapping it in HTML so it fills the page properly. */
async function printImageViaWebContents(filePath, printerName, normalizedOptions) {
    const win = new electron_1.BrowserWindow({
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
        const electronPrintOpts = {
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
            }
            else if (side === "duplexshort") {
                electronPrintOpts.duplexMode = "shortEdge";
            }
            else {
                electronPrintOpts.duplexMode = "simplex";
            }
        }
        console.log(`[IMAGE PRINT] webContents.print → ${printerName}`, electronPrintOpts);
        await new Promise((resolve, reject) => {
            win.webContents.print(electronPrintOpts, (success, failureReason) => {
                if (success)
                    resolve();
                else
                    reject(new Error(failureReason || "Image print failed"));
            });
        });
    }
    finally {
        win.destroy();
    }
}
async function printPdfViaWebContents(filePath, printerName, normalizedOptions) {
    const win = new electron_1.BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    try {
        // Electron can render PDFs via its built-in PDF viewer.
        await win.loadURL(`file://${filePath}`);
        // Map our normalizedOptions to Electron's webContents.print() format
        const electronPrintOpts = {
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
            // Map side/duplex to Electron's duplexMode
            const side = normalizedOptions.side?.toLowerCase();
            if (side === "duplexlong") {
                electronPrintOpts.duplexMode = "longEdge";
            }
            else if (side === "duplexshort") {
                electronPrintOpts.duplexMode = "shortEdge";
            }
            else {
                electronPrintOpts.duplexMode = "simplex";
            }
            // Page ranges (e.g. "1-3,5")
            if (normalizedOptions.pages) {
                electronPrintOpts.pageRanges = normalizedOptions.pages;
            }
        }
        console.log(`[FALLBACK] webContents.print → ${printerName}`, electronPrintOpts);
        await new Promise((resolve, reject) => {
            win.webContents.print(electronPrintOpts, (success, failureReason) => {
                if (success)
                    resolve();
                else
                    reject(new Error(failureReason || "webContents.print failed"));
            });
        });
    }
    finally {
        win.destroy();
    }
}
async function listPrintersViaWebContents() {
    // Prefer an existing window (no flicker, no extra lifecycle).
    const existing = electron_1.BrowserWindow.getAllWindows()[0];
    if (existing?.webContents?.getPrintersAsync) {
        try {
            const list = await existing.webContents.getPrintersAsync();
            return normalizePrinterList(list);
        }
        catch {
            // fall through
        }
    }
    // Fallback: create a tiny hidden window for printer enumeration.
    const win = new electron_1.BrowserWindow({
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
    }
    finally {
        win.destroy();
    }
}
function createWindow() {
    const iconPath = node_path_1.default.join(__dirname, "..", "resources", "icon.png");
    const window = new electron_1.BrowserWindow({
        title: "Zopy Print Manager",
        width: 960,
        height: 640,
        backgroundColor: "#f8f9fb",
        icon: iconPath,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: node_path_1.default.join(__dirname, "preload.js"),
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
        const appPath = electron_1.app.getAppPath();
        const distPath = node_path_1.default.join(appPath, "dist", "index.html");
        if (node_fs_1.default.existsSync(distPath)) {
            window.loadFile(distPath);
        }
        else {
            // Fallback: check if we're in dev-like structure
            const fallbackPath = node_path_1.default.join(__dirname, "..", "dist", "index.html");
            if (node_fs_1.default.existsSync(fallbackPath)) {
                window.loadFile(fallbackPath);
            }
            else {
                console.error(`Could not find index.html at ${distPath} or ${fallbackPath}`);
                // Last resort: load a blank page with error message
                window.webContents.loadURL(`data:text/html,<h1>Failed to load application</h1><p>Could not find required files.</p>`);
            }
        }
    }
    catch (error) {
        console.error("Error loading app:", error);
        window.webContents.loadURL(`data:text/html,<h1>Error Loading Application</h1><p>${String(error)}</p>`);
    }
}
electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.app.on("activate", () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        electron_1.app.quit();
    }
});
// IPC handlers for file operations
/** Sanitize temp filenames to prevent SumatraPDF command-line failures from overly long names. */
function sanitizeTempFileName(name) {
    const ext = node_path_1.default.extname(name);
    let base = node_path_1.default.basename(name, ext);
    // Replace spaces and special chars with underscores
    base = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
    // Truncate to max 80 chars
    if (base.length > 80)
        base = base.substring(0, 80);
    return `${base}${ext}`;
}
electron_1.ipcMain.handle("download-files", async (event, files) => {
    const tempDir = node_os_1.default.tmpdir();
    const downloadedPaths = [];
    for (const [idx, file] of files.entries()) {
        const safeName = sanitizeTempFileName(file.name);
        const fileName = `printowl_${Date.now()}_${safeName}`;
        const filePath = node_path_1.default.join(tempDir, fileName);
        try {
            await downloadFile(event, file.url, filePath, idx, files.length, file.name);
            downloadedPaths.push(filePath);
        }
        catch (error) {
            console.error(`Failed to download ${file.url}:`, error);
            // Continue with other files
        }
    }
    return downloadedPaths;
});
electron_1.ipcMain.handle("download-file", async (event, file, meta) => {
    const tempDir = node_os_1.default.tmpdir();
    const safeName = sanitizeTempFileName(file.name);
    const fileName = `printowl_${Date.now()}_${safeName}`;
    const filePath = node_path_1.default.join(tempDir, fileName);
    await downloadFile(event, file.url, filePath, meta?.fileIndex ?? 0, meta?.totalFiles ?? 1, file.name, meta?.printRunId);
    return filePath;
});
electron_1.ipcMain.handle("delete-files", async (event, paths) => {
    for (const filePath of paths) {
        try {
            if (node_fs_1.default.existsSync(filePath)) {
                node_fs_1.default.unlinkSync(filePath);
            }
        }
        catch (error) {
            console.error(`Failed to delete ${filePath}:`, error);
        }
    }
});
electron_1.ipcMain.handle("list-printers", async () => {
    if (DRY_RUN) {
        console.log("[DRY RUN] Returning fake printer list");
        return [
            { name: "Test Printer (Dry Run)", isDefault: true },
            { name: "Color Printer (Dry Run)", isDefault: false },
        ];
    }
    try {
        const printers = normalizePrinterList(await (0, pdf_to_printer_1.getPrinters)());
        if (printers.length > 0)
            return printers;
        console.warn("pdf-to-printer returned no printers; falling back to Electron enumeration");
    }
    catch (error) {
        console.error("Failed to list printers via pdf-to-printer; falling back to Electron enumeration:", error);
    }
    try {
        return await listPrintersViaWebContents();
    }
    catch (error) {
        console.error("Failed to list printers via Electron webContents:", error);
        return [];
    }
});
electron_1.ipcMain.handle("print-pdf", async (event, filePath, printer, options, meta) => {
    try {
        const requestedSide = typeof options?.side === "string" ? options.side.toLowerCase() : null;
        const requestedDuplex = typeof options?.duplex === "string"
            ? options.duplex.toLowerCase()
            : null;
        const requestedOrientation = typeof options?.orientation === "string"
            ? options.orientation.toLowerCase()
            : null;
        const requestedScale = typeof options?.scale === "string" ? options.scale.toLowerCase() : null;
        const side = requestedSide === "duplexlong" ||
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
            orientation: requestedOrientation === "landscape" ? "landscape" : "portrait",
            scale: requestedScale === "noscale"
                ? "noscale"
                : requestedScale === "shrink"
                    ? "shrink"
                    : "fit",
        };
        event.sender.send("print-progress", {
            fileIndex: meta?.fileIndex ?? 0,
            totalFiles: meta?.totalFiles ?? 1,
            percent: 0,
            fileName: node_path_1.default.basename(filePath),
            printRunId: meta?.printRunId,
        });
        if (DRY_RUN) {
            console.log(`[DRY RUN] Would print: ${node_path_1.default.basename(filePath)} → ${printer}`, normalizedOptions);
            await new Promise((r) => setTimeout(r, 500)); // simulate spooler delay
        }
        else if (isImageFile(filePath)) {
            // Images: pdf-to-printer can't handle them (prints blank pages).
            // Route directly to webContents with HTML wrapper.
            console.log(`[IMAGE] Detected image file: ${node_path_1.default.basename(filePath)} — using webContents.print directly`);
            await printImageViaWebContents(filePath, printer, normalizedOptions);
            console.log(`[IMAGE] webContents.print succeeded for ${node_path_1.default.basename(filePath)}`);
        }
        else {
            let resolvedPrinter = printer;
            try {
                resolvedPrinter = await resolvePdfToPrinterName(printer);
            }
            catch (e) {
                console.warn("Failed to resolve printer name via pdf-to-printer:", e);
            }
            // PRIMARY: pdf-to-printer — always first priority for PDFs
            try {
                console.log(`[PRIMARY] pdf-to-printer: ${node_path_1.default.basename(filePath)} → ${resolvedPrinter}`, normalizedOptions);
                await (0, pdf_to_printer_1.print)(filePath, { printer: resolvedPrinter, ...normalizedOptions });
                console.log(`[PRIMARY] pdf-to-printer succeeded for ${node_path_1.default.basename(filePath)}`);
            }
            catch (error) {
                console.error(`[PRIMARY] pdf-to-printer FAILED for "${resolvedPrinter}". Falling back to webContents.print (loadContent)...`, error);
                // FALLBACK: use Electron webContents.print (loadContent) — only when pdf-to-printer fails
                await printPdfViaWebContents(filePath, printer, normalizedOptions);
                console.log(`[FALLBACK] webContents.print succeeded for ${node_path_1.default.basename(filePath)}`);
            }
        }
        event.sender.send("print-progress", {
            fileIndex: meta?.fileIndex ?? 0,
            totalFiles: meta?.totalFiles ?? 1,
            percent: 100,
            fileName: node_path_1.default.basename(filePath),
            printRunId: meta?.printRunId,
        });
    }
    catch (error) {
        console.error(`Failed to print ${filePath}:`, error);
        throw error;
    }
});
function downloadFile(event, url, filePath, fileIndex, totalFiles, fileName, printRunId) {
    return new Promise((resolve, reject) => {
        const file = node_fs_1.default.createWriteStream(filePath);
        node_https_1.default
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
            node_fs_1.default.unlink(filePath, () => { });
            reject(err);
        });
    });
}
