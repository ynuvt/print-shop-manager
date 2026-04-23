import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import https from "node:https";
import { getPrinters, print } from "pdf-to-printer";

// Dry-run mode: auto-enabled on non-Windows platforms (Mac/Linux) for testing.
// On Windows, real printing is used.
const DRY_RUN = process.platform !== "win32";

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
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// IPC handlers for file operations
ipcMain.handle(
  "download-files",
  async (event, files: { url: string; name: string }[]) => {
    const tempDir = os.tmpdir();
    const downloadedPaths: string[] = [];

    for (const [idx, file] of files.entries()) {
      const fileName = `printowl_${Date.now()}_${file.name}`;
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
    const fileName = `printowl_${Date.now()}_${file.name}`;
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

  try {
    const printers = await getPrinters();
    return printers;
  } catch (error) {
    console.error("Failed to list printers:", error);
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
      } else {
        await print(filePath, { printer, ...normalizedOptions });
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
