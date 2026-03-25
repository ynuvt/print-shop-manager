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
function createWindow() {
    const window = new electron_1.BrowserWindow({
        width: 960,
        height: 640,
        backgroundColor: "#f3f4f6",
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
    try {
        const printers = await (0, pdf_to_printer_1.getPrinters)();
        return printers;
    }
    catch (error) {
        console.error("Failed to list printers:", error);
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
        });
        await (0, pdf_to_printer_1.print)(filePath, { printer, ...normalizedOptions });
        event.sender.send("print-progress", {
            fileIndex: meta?.fileIndex ?? 0,
            totalFiles: meta?.totalFiles ?? 1,
            percent: 100,
            fileName: node_path_1.default.basename(filePath),
        });
    }
    catch (error) {
        console.error(`Failed to print ${filePath}:`, error);
        throw error;
    }
});
function downloadFile(event, url, filePath, fileIndex, totalFiles, fileName) {
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
                });
            });
            response.pipe(file);
            file.on("finish", () => {
                file.close();
                // ensure we report 100% for this file
                event.sender.send("download-progress", {
                    fileIndex,
                    totalFiles,
                    percent: 100,
                    fileName,
                });
                resolve();
            });
        })
            .on("error", (err) => {
            node_fs_1.default.unlink(filePath, () => { }); // Delete the file on error
            reject(err);
        });
    });
}
