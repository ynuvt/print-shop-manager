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
async function printPdfViaWebContents(filePath, printerName) {
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
        await new Promise((resolve, reject) => {
            win.webContents.print({ silent: true, deviceName: printerName, printBackground: true }, (success, failureReason) => {
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
electron_1.ipcMain.handle("download-files", async (event, files) => {
    const tempDir = node_os_1.default.tmpdir();
    const downloadedPaths = [];
    for (const [idx, file] of files.entries()) {
        const fileName = `printowl_${Date.now()}_${file.name}`;
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
    const fileName = `printowl_${Date.now()}_${file.name}`;
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
        else {
            let resolvedPrinter = printer;
            try {
                resolvedPrinter = await resolvePdfToPrinterName(printer);
            }
            catch (e) {
                console.warn("Failed to resolve printer name via pdf-to-printer:", e);
            }
            try {
                await (0, pdf_to_printer_1.print)(filePath, { printer: resolvedPrinter, ...normalizedOptions });
            }
            catch (error) {
                console.error(`pdf-to-printer print failed for "${resolvedPrinter}". Falling back to webContents.print...`, error);
                // Fallback: use Electron printing directly (survives name mismatches in pdf-to-printer).
                await printPdfViaWebContents(filePath, printer);
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
