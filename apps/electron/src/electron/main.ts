import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import https from "node:https";
import { getPrinters, print } from "pdf-to-printer";

function createWindow() {
  const window = new BrowserWindow({
    width: 960,
    height: 640,
    backgroundColor: "#f3f4f6",
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

  window.loadFile(path.join(__dirname, "../dist/index.html"));
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

    for (let idx = 0; idx < files.length; idx++) {
      const file = files[idx];
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
    meta?: { fileIndex: number; totalFiles: number },
  ) => {
    try {
      event.sender.send("print-progress", {
        fileIndex: meta?.fileIndex ?? 0,
        totalFiles: meta?.totalFiles ?? 1,
        percent: 0,
        fileName: path.basename(filePath),
      });

      await print(filePath, { printer, ...options });

      event.sender.send("print-progress", {
        fileIndex: meta?.fileIndex ?? 0,
        totalFiles: meta?.totalFiles ?? 1,
        percent: 100,
        fileName: path.basename(filePath),
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
        fs.unlink(filePath, () => {}); // Delete the file on error
        reject(err);
      });
  });
}
