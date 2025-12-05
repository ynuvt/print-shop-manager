const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const isDev = require("electron-is-dev");
const fs = require("fs-extra");
const https = require("https");
const ptp = require("pdf-to-printer");
const os = require("os");

// --- TEST CONFIGURATION ---
console.log("⚠️ STARTING IN ISOLATED TEST MODE ⚠️");

// --- Global Variables ---
let mainWindow;

// --- Mock Data Store ---
let mockJobs = [
  {
    id: "test-job-001",
    jobCode: 1001,
    status: "pending",
    fileName: "W3C_Dummy_Sample.pdf",
    fileUrl:
      "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    cost: 10,
    createdAt: { _seconds: Date.now() / 1000 },
    printOptions: {
      copies: 1,
      colorMode: "bw",
      duplex: "one-sided",
      paperSize: "A4",
      pageRange: "all",
    },
    customerPhone: "+91 98765 43210",
  },
  {
    id: "test-job-002",
    jobCode: 1002,
    status: "ready",
    fileName: "Already_Printed.pdf",
    fileUrl:
      "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    cost: 25,
    createdAt: { _seconds: Date.now() / 1000 - 3600 },
    printOptions: {
      copies: 2,
      colorMode: "color",
      duplex: "two-sided",
      paperSize: "A4",
      pageRange: "all",
    },
    customerPhone: "+91 99999 88888",
  },
];

// DOWNLOAD LOCATION: Users/You/AppData/Local/Temp/cloudprint_test
const TEMP_DOWNLOAD_DIR = path.join(os.tmpdir(), "cloudprint_test");

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    title: "Cloud Print Shop Manager (TEST MODE)",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadURL(
    isDev
      ? "http://localhost:3001"
      : `file://${path.join(__dirname, "../build/index.html")}`
  );

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => (mainWindow = null));
}

// --- Cleanup Logic (Deletes files older than 24 hours) ---
function cleanupTempFiles() {
  try {
    if (!fs.existsSync(TEMP_DOWNLOAD_DIR)) return;

    const files = fs.readdirSync(TEMP_DOWNLOAD_DIR);
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    console.log(`[Cleanup] Checking ${files.length} files in temp...`);

    files.forEach((file) => {
      const filePath = path.join(TEMP_DOWNLOAD_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        // If file is older than 24 hours
        if (now - stats.mtimeMs > oneDay) {
          fs.unlinkSync(filePath);
          console.log(`[Cleanup] Deleted old file: ${file}`);
        }
      } catch (err) {
        // Ignore file access errors
      }
    });
  } catch (e) {
    console.error("[Cleanup] Error during cleanup:", e.message);
  }
}

app.on("ready", async () => {
  fs.ensureDirSync(TEMP_DOWNLOAD_DIR);

  // 1. Run Cleanup on Startup (Delete >24h old files)
  cleanupTempFiles();

  createWindow();

  mainWindow.webContents.once("did-finish-load", () => {
    mainWindow.webContents.executeJavaScript(`
      console.clear();
      console.log("%c⚠️ RUNNING IN TEST MODE ⚠️", "color: red; font-weight: bold; font-size: 20px;");
    `);

    setTimeout(() => {
      console.log("Sending mock jobs to UI...");
      mainWindow.webContents.send("jobs-update", mockJobs);
    }, 1500);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// --- IPC Handlers ---

ipcMain.handle("get-printers", async () => {
  try {
    const printers = await ptp.getPrinters();
    return printers;
  } catch (e) {
    return [{ name: "Microsoft Print to PDF", deviceId: "mock-p-1" }];
  }
});

// UPDATED: Now performs REAL printing
ipcMain.handle("process-job", async (event, { job, printerName }) => {
  const { id, fileUrl, fileName, printOptions } = job;
  // Unique filename so they don't overwrite each other
  const localPath = path.join(
    TEMP_DOWNLOAD_DIR,
    `TEST_${Date.now()}_${fileName}`
  );

  console.log(`[TEST] Starting process for Job ${id}`);

  try {
    // 1. Downloading
    updateMockStatus(id, "downloading");
    await downloadFile(fileUrl, localPath);
    console.log(`[TEST] File downloaded to: ${localPath}`);

    // Open the folder so you can see the file (Optional, useful for debugging)
    // shell.showItemInFolder(localPath);

    // 2. Printing
    updateMockStatus(id, "printing");

    console.log(`[TEST] Selected Printer: ${printerName}`);

    // CHECK: If "Microsoft Print to PDF" is selected, we skip the actual print command
    // to avoid the "Save As" dialog box. The file is already in the temp folder!
    if (printerName.includes("Microsoft Print to PDF")) {
      console.log("[TEST] PDF Printer detected. Skipping driver dialog.");
      console.log("[TEST] File saved to temp successfully.");
      // Simulate print delay
      await new Promise((r) => setTimeout(r, 2000));
    } else {
      // Real Print for other printers
      console.log(`[TEST] Sending to PHYSICAL printer...`);
      const options = {
        printer: printerName,
        copies: printOptions.copies || 1,
        sides: printOptions.duplex === "two-sided" ? "duplex" : "simplex",
      };
      await ptp.print(localPath, options);
    }

    // 3. Success
    updateMockStatus(id, "ready", {
      completedAt: { _seconds: Date.now() / 1000 },
    });

    // NOTE: Immediate file deletion is DISABLED.
    // Files are cleaned up on app startup if older than 24 hours.

    return { success: true };
  } catch (error) {
    console.error("[TEST] Error:", error);
    updateMockStatus(id, "error");
    return { success: false, error: error.message };
  }
});

ipcMain.handle("mark-completed", async (event, jobId) => {
  updateMockStatus(jobId, "completed", {
    handedOverAt: { _seconds: Date.now() / 1000 },
  });
  return true;
});

ipcMain.handle("reject-job", async (event, { jobId, reason }) => {
  updateMockStatus(jobId, "rejected", {
    rejectedAt: { _seconds: Date.now() / 1000 },
    rejectionReason: reason,
  });
  return true;
});

function updateMockStatus(jobId, status, extraFields = {}) {
  const index = mockJobs.findIndex((j) => j.id === jobId);
  if (index !== -1) {
    mockJobs[index] = { ...mockJobs[index], status, ...extraFields };
    if (mainWindow) {
      mainWindow.webContents.send("jobs-update", [...mockJobs]);
    }
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    fs.ensureDirSync(path.dirname(dest));
    const file = fs.createWriteStream(dest);
    https
      .get(url, (response) => {
        if (response.statusCode !== 200)
          return reject(new Error("Download failed"));
        response.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}
