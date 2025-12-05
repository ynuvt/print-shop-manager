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

  // Cleanup on close
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

    if (snapshot.empty) {
      console.log("--- No old records to delete ---");
      return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    console.log(
      `--- Successfully deleted ${snapshot.size} records older than 30 days ---`
    );
  } catch (error) {
    console.error("--- Auto-deletion failed ---", error);
  }
}

// --- 24-Hour File Cleanup Logic ---
// This runs on Startup AND every day at 8 PM
function performFileCleanup() {
  console.log("--- Executing File Cleanup (Deleting files > 24h old) ---");
  try {
    if (!fs.existsSync(TEMP_DOWNLOAD_DIR)) return;

    const files = fs.readdirSync(TEMP_DOWNLOAD_DIR);
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000; // 24 hours

    let deletedCount = 0;

    files.forEach((file) => {
      const filePath = path.join(TEMP_DOWNLOAD_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > oneDay) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      } catch (err) {
        // Ignore locked files
      }
    });

    console.log(`--- Cleanup Complete. Deleted ${deletedCount} old files. ---`);
  } catch (error) {
    console.error("--- File cleanup failed ---", error);
  }
}

// Scheduler for 8 PM
function setupDailyCleanup() {
  const now = new Date();
  let target = new Date();
  target.setHours(20, 0, 0, 0); // 8:00 PM

  if (now > target) {
    target.setDate(target.getDate() + 1);
  }

  const msToWait = target - now;
  console.log(
    `--- Next file cleanup scheduled in ${(msToWait / 1000 / 60).toFixed(
      1
    )} minutes (at 8:00 PM) ---`
  );

  setTimeout(() => {
    performFileCleanup();
    setInterval(performFileCleanup, 24 * 60 * 60 * 1000);
  }, msToWait);
}

// --- Application Lifecycle ---
app.on("ready", async () => {
  console.log("\n========================================");
  console.log("--- Cloud Print Manager Starting ---");
  console.log("========================================\n");

  // 1. Ensure Temp Dir Exists
  fs.ensureDirSync(TEMP_DOWNLOAD_DIR);

  // 2. Run Cleanup (Delete old files from yesterday)
  performFileCleanup();

  // 3. Create Window
  createWindow();
  console.log("--- Main window created ---");

  // Wait for window to be ready
  await new Promise((resolve) => {
    mainWindow.webContents.once("did-finish-load", resolve);
  });

  // Send initial status to renderer
  mainWindow.webContents.executeJavaScript(`
    console.log("%c--- Electron Main Process Connected ---", "color: #00ff00; font-weight: bold; font-size: 14px;");
  `);

  // 4. Init Firebase & Schedulers
  console.log("\n--- Initializing Firebase ---");
  const isAuth = initializeFirebase();

  if (isAuth) {
    console.log("--- Firebase authentication successful ---\n");

    mainWindow.webContents.executeJavaScript(`
      console.log("%c--- Firebase Initialized Successfully ---", "color: #00ff00; font-weight: bold; font-size: 14px;");
    `);

    console.log("--- Running database cleanup ---");
    await cleanupOldRecords();

    console.log("--- Setting up realtime listener ---");
    setupRealtimeListener();

    console.log("--- Scheduling daily cleanup ---");
    setupDailyCleanup();

    console.log("\n========================================");
    console.log("--- All systems operational ---");
    console.log("========================================\n");
  } else {
    console.error("\n--- Firebase initialization FAILED ---\n");

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

// --- Real-time Listener (Admin SDK) ---
function setupRealtimeListener() {
  if (!db) return;

  jobListener = db
    .collection("jobs")
    .orderBy("createdAt", "desc")
    .limit(200)
    .onSnapshot(
      (snapshot) => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoMs = thirtyDaysAgo.getTime();

        const jobs = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          const createdAtMs = data.createdAt?._seconds
            ? data.createdAt._seconds * 1000
            : Date.now();

          if (createdAtMs > thirtyDaysAgoMs) {
            jobs.push({ id: doc.id, ...data });
          }
        });

        console.log(`--- Fetched ${jobs.length} jobs from Firebase ---`);

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

// --- PROCESS JOB (UPDATED LOGIC) ---
ipcMain.handle("process-job", async (event, { job, printerName }) => {
  const { id, fileUrl, fileName, printOptions } = job;
  // Unique filename prevents overwrites
  const safeFileName = fileName.replace(/[^a-z0-9.]/gi, "_");
  const localPath = path.join(TEMP_DOWNLOAD_DIR, `${id}_${safeFileName}`);

  try {
    await updateJobStatus(id, "downloading");
    await downloadFile(fileUrl, localPath);

    await updateJobStatus(id, "printing");

    console.log(`--- Processing Job ${id} on ${printerName} ---`);

    // CHECK: If "Microsoft Print to PDF" is selected, SKIP actual printing
    if (printerName.includes("Microsoft Print to PDF")) {
      console.log("--- PDF Printer detected. Skipping driver dialog. ---");
      console.log("--- File saved to temp successfully. ---");
      // Short delay to simulate print time
      await new Promise((r) => setTimeout(r, 1500));
    } else {
      // Real Print for other printers
      const options = {
        printer: printerName,
        copies: printOptions.copies || 1,
        pages:
          printOptions.pageRange === "all" ? undefined : printOptions.pageRange,
        sides: printOptions.duplex === "two-sided" ? "duplex" : "simplex",
        monochrome: printOptions.colorMode === "bw",
        paperSize: printOptions.paperSize || "A4",
      };
      await ptp.print(localPath, options);
    }

    // IMPORTANT: Status goes to 'ready'
    await updateJobStatus(id, "ready", {
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // NOTE: File deletion is DISABLED so it stays in Temp
    // It will be cleaned up after 24 hours by performFileCleanup()

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
