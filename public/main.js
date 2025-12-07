const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const isDev = require("electron-is-dev");
const fs = require("fs-extra");
const https = require("https");
const ptp = require("pdf-to-printer");
const admin = require("firebase-admin");
const os = require("os");

// --- Global Variables ---
let mainWindow;
let db;
let jobListener;

// --- Config Paths ---
const CREDENTIALS_PATH = isDev
  ? path.join(__dirname, "../serviceAccountKey.json")
  : path.join(app.getPath("userData"), "serviceAccountKey.json");

const TEMP_DOWNLOAD_DIR = path.join(os.tmpdir(), "cloudprint");

// --- Firebase Initialization ---
function initializeFirebase() {
  try {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      console.error("Credentials not found at:", CREDENTIALS_PATH);
      return false;
    }

    const serviceAccount = require(CREDENTIALS_PATH);

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("--- Firebase Admin SDK initialized successfully ---");
    }

    db = admin.firestore();
    console.log("--- Firestore database connected ---");
    return true;
  } catch (error) {
    console.error("--- Firebase Init Error ---", error);
    console.error("--- Error details ---", error.message);
    return false;
  }
}

// --- Window Creation ---
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    title: "Cloud Print Shop Manager",
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

// --- 30-Day Database Auto-Deletion ---
async function cleanupOldRecords() {
  if (!db) return;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  try {
    console.log("--- Running 30-day database cleanup ---");
    const snapshot = await db
      .collection("jobs")
      .where(
        "createdAt",
        "<",
        admin.firestore.Timestamp.fromDate(thirtyDaysAgo)
      )
      .get();

    if (snapshot.empty) return;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    console.log(`--- Deleted ${snapshot.size} old records from DB ---`);
  } catch (error) {
    console.error("--- Auto-deletion failed ---", error);
  }
}

// --- 24-Hour File Cleanup Logic ---
function performFileCleanup() {
  console.log("--- Executing File Cleanup (Deleting files > 24h old) ---");
  try {
    if (!fs.existsSync(TEMP_DOWNLOAD_DIR)) return;

    const files = fs.readdirSync(TEMP_DOWNLOAD_DIR);
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    let deletedCount = 0;

    files.forEach((file) => {
      const filePath = path.join(TEMP_DOWNLOAD_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > oneDay) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      } catch (err) {}
    });

    console.log(`--- Cleanup Complete. Deleted ${deletedCount} old files. ---`);
  } catch (error) {
    console.error("--- File cleanup failed ---", error);
  }
}

function setupDailyCleanup() {
  const now = new Date();
  let target = new Date();
  target.setHours(20, 0, 0, 0);

  if (now > target) {
    target.setDate(target.getDate() + 1);
  }
  const msToWait = target - now;
  setTimeout(() => {
    performFileCleanup();
    setInterval(performFileCleanup, 24 * 60 * 60 * 1000);
  }, msToWait);
}

// --- Application Lifecycle ---
app.on("ready", async () => {
  console.log("--- Cloud Print Manager Starting ---");

  fs.ensureDirSync(TEMP_DOWNLOAD_DIR);
  performFileCleanup();
  createWindow();

  await new Promise((resolve) => {
    mainWindow.webContents.once("did-finish-load", resolve);
  });

  console.log("\n--- Initializing Firebase ---");
  const isAuth = initializeFirebase();

  if (isAuth) {
    console.log("--- Firebase authentication successful ---\n");
    await cleanupOldRecords();
    setupRealtimeListener();
    setupDailyCleanup();
  } else {
    setTimeout(() => {
      mainWindow.webContents.send(
        "auth-error",
        "Service Account Key missing. Check settings."
      );
    }, 2000);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// --- Real-time Listener ---
function setupRealtimeListener() {
  if (!db) return;

  if (mainWindow) {
    mainWindow.webContents.executeJavaScript(
      `console.log("%c--- 📡 Listening for jobs created in the last 2 MINUTES... ---", "color: #00aaff;");`
    );
  }

  jobListener = db
    .collection("jobs")
    .orderBy("createdAt", "desc")
    .limit(50)
    .onSnapshot(
      (snapshot) => {
        const now = Date.now();
        const twoMinutesAgo = now - 2 * 60 * 1000;

        const jobs = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          const createdAtMs = data.createdAt?._seconds
            ? data.createdAt._seconds * 1000
            : 0;

          if (createdAtMs > twoMinutesAgo) {
            jobs.push({ id: doc.id, ...data });
          }
        });

        console.log(
          `--- Filtered: ${jobs.length} new jobs found (Last 2 mins) ---`
        );

        if (mainWindow) {
          mainWindow.webContents.send("jobs-update", jobs);
        }
      },
      (error) => {
        console.error("\n--- LISTENER ERROR ---", error);
        if (mainWindow) {
          mainWindow.webContents.send(
            "connection-error",
            `Firebase Error: ${error.message}`
          );
        }
      }
    );
}

// --- IPC Handlers ---

ipcMain.handle("get-printers", async () => {
  try {
    return await ptp.getPrinters();
  } catch (e) {
    return [];
  }
});

// --- PROCESS JOB ---
ipcMain.handle("process-job", async (event, { job, printerName }) => {
  console.log("--- Processing Request Received ---");
  console.log("Full Job Object:", JSON.stringify(job, null, 2));

  const { id } = job;

  // 1. DATA EXTRACTION LOGIC
  // Your database has a 'files' array. We grab the first file.
  let targetFile = {};
  if (job.files && Array.isArray(job.files) && job.files.length > 0) {
    targetFile = job.files[0];
  } else {
    // Fallback if structure is different
    targetFile = job;
  }

  // Extract Name & URL
  const rawFileName = targetFile.name || targetFile.fileName || "document.pdf";
  const validFileName = String(rawFileName);
  const validFileUrl =
    targetFile.url || targetFile.fileUrl || targetFile.downloadUrl;

  // Extract Print Options (your DB uses 'options', old code used 'printOptions')
  const printOptions = job.options || job.printOptions || {};

  const safeFileName = validFileName.replace(/[^a-z0-9.]/gi, "_");
  const localPath = path.join(TEMP_DOWNLOAD_DIR, `${id}_${safeFileName}`);

  console.log(`Determined Filename: ${validFileName}`);
  console.log(`Determined File URL: ${validFileUrl ? "Found" : "MISSING"}`);
  console.log(`Print Options:`, printOptions);

  try {
    await updateJobStatus(id, "downloading");

    if (!validFileUrl) {
      throw new Error(
        `File URL is missing. Job structure: ${JSON.stringify(job)}`
      );
    }

    await downloadFile(validFileUrl, localPath);

    await updateJobStatus(id, "printing");

    console.log(`--- Printing on ${printerName} ---`);

    // 2. PRINTER OPTIONS MAPPING
    // Handle 'one'/'two' from your database to standard printer flags
    let sideSetting = "simplex";
    if (printOptions.duplex === "two" || printOptions.duplex === "two-sided") {
      sideSetting = "duplex";
    }

    // Handle Page Range
    let pagesSetting = undefined;
    if (printOptions.pageRange && printOptions.pageRange !== "all") {
      if (printOptions.pageRange === "custom" && printOptions.customRange) {
        pagesSetting = printOptions.customRange;
      } else {
        pagesSetting = printOptions.pageRange;
      }
    }

    if (printerName.includes("Microsoft Print to PDF")) {
      console.log("--- PDF Printer detected. Skipping driver dialog. ---");
      await new Promise((r) => setTimeout(r, 1500));
    } else {
      const options = {
        printer: printerName,
        copies: parseInt(printOptions.copies) || 1,
        pages: pagesSetting,
        sides: sideSetting,
        monochrome: printOptions.colorMode === "bw",
        paperSize: printOptions.paperSize || "A4",
      };
      await ptp.print(localPath, options);
    }

    await updateJobStatus(id, "ready", {
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (error) {
    console.error(`--- Job ${id} Failed ---`, error);
    await updateJobStatus(id, "error", { errorMsg: error.message });
    return { success: false, error: error.message };
  }
});

ipcMain.handle("mark-completed", async (event, jobId) => {
  try {
    await updateJobStatus(jobId, "completed", {
      handedOverAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.handle("reject-job", async (event, { jobId, reason }) => {
  try {
    await updateJobStatus(jobId, "rejected", {
      rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
      rejectionReason: reason,
    });
    return true;
  } catch (e) {
    return false;
  }
});

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    fs.ensureDirSync(path.dirname(dest));
    const file = fs.createWriteStream(dest);
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          return reject(
            new Error(
              `Download failed with status code: ${response.statusCode}`
            )
          );
        }
        response.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

async function updateJobStatus(jobId, status, extraFields = {}) {
  if (!db) throw new Error("Database not connected");
  await db
    .collection("jobs")
    .doc(jobId)
    .update({
      status: status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...extraFields,
    });
}
