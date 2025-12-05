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

// --- 30-Day Auto-Deletion Logic ---
async function cleanupOldRecords() {
  if (!db) return;

  // Calculate date 30 days ago
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  try {
    console.log("--- Running 30-day database cleanup ---");
    // UPDATED: Collection is 'jobs'
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

    // Batch delete (max 500 per batch)
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

// --- 8 PM Daily File Cleanup Logic ---
function setupDailyCleanup() {
  const now = new Date();
  let target = new Date();

  // Set target to today 8:00 PM (20:00)
  target.setHours(20, 0, 0, 0);

  // If it's already past 8 PM, schedule for tomorrow
  if (now > target) {
    target.setDate(target.getDate() + 1);
  }

  const msToWait = target - now;
  console.log(
    `--- Next file cleanup scheduled in ${(msToWait / 1000 / 60).toFixed(
      1
    )} minutes (at 8:00 PM) ---`
  );

  // First run
  setTimeout(() => {
    performFileCleanup();
    // Then repeat every 24 hours
    setInterval(performFileCleanup, 24 * 60 * 60 * 1000);
  }, msToWait);
}

function performFileCleanup() {
  console.log("--- Executing 8 PM Daily File Cleanup ---");
  try {
    fs.emptyDirSync(TEMP_DOWNLOAD_DIR);
    console.log("--- Temp directory wiped successfully ---");
  } catch (error) {
    console.error("--- File cleanup failed ---", error);
  }
}

// --- Application Lifecycle ---
app.on("ready", async () => {
  console.log("\n========================================");
  console.log("--- Cloud Print Manager Starting ---");
  console.log("========================================\n");

  // 1. Initial Temp Clean (On Boot)
  fs.ensureDirSync(TEMP_DOWNLOAD_DIR);
  fs.emptyDirSync(TEMP_DOWNLOAD_DIR);
  console.log("--- Temp directory cleaned ---");

  // 2. Create Window
  createWindow();
  console.log("--- Main window created ---");

  // Wait for window to be ready before sending messages
  await new Promise((resolve) => {
    mainWindow.webContents.once("did-finish-load", resolve);
  });

  // Send initial status to renderer
  mainWindow.webContents.executeJavaScript(`
    console.log("%c--- Electron Main Process Connected ---", "color: #00ff00; font-weight: bold; font-size: 14px;");
    console.log("--- Node version:", "${process.version}", "---");
    console.log("--- Electron version:", "${process.versions.electron}", "---");
    console.log("--- Chrome version:", "${process.versions.chrome}", "---");
  `);

  // 3. Init Firebase & Schedulers
  console.log("\n--- Initializing Firebase ---");
  const isAuth = initializeFirebase();

  if (isAuth) {
    console.log("--- Firebase authentication successful ---\n");

    // Send success message to renderer console
    mainWindow.webContents.executeJavaScript(`
      console.log("%c--- Firebase Initialized Successfully ---", "color: #00ff00; font-weight: bold; font-size: 14px;");
      console.log("%c--- Project: printowlbackend ---", "color: #00aaff;");
      console.log("%c--- Database: Firestore ---", "color: #00aaff;");
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

    mainWindow.webContents.executeJavaScript(`
      console.error("%c--- Firebase Initialization Failed ---", "color: #ff0000; font-weight: bold; font-size: 14px;");
      console.error("%c--- Check if serviceAccountKey.json exists and is valid ---", "color: #ff6600;");
      console.error("%c--- Path: ${CREDENTIALS_PATH} ---", "color: #ff6600;");
    `);

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
  if (!db) {
    console.error("--- Cannot setup listener: Database not initialized ---");
    return;
  }

  console.log("--- Setting up Firebase realtime listener ---");
  console.log("--- Collection: jobs ---"); // UPDATED: Log correct collection
  console.log("--- Order: createdAt (desc) ---");
  console.log("--- Limit: 200 documents ---\n");

  // Send status to renderer
  if (mainWindow) {
    mainWindow.webContents.executeJavaScript(`
      console.log("%c--- Firestore Listener Starting ---", "color: #00aaff; font-weight: bold;");
      console.log("--- Subscribing to 'jobs' collection ---");
    `);
  }

  // UPDATED: Collection is 'jobs'
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
          // Filter out jobs older than 30 days in-memory
          const createdAtMs = data.createdAt?._seconds
            ? data.createdAt._seconds * 1000
            : Date.now();

          if (createdAtMs > thirtyDaysAgoMs) {
            jobs.push({ id: doc.id, ...data });
          }
        });

        console.log(
          `--- Fetched ${jobs.length} jobs from Firebase (${snapshot.size} total, filtered to last 30 days) ---`
        );

        if (mainWindow) {
          mainWindow.webContents.executeJavaScript(`
            console.log("%c--- Jobs Update Received ---", "color: #00ff00; font-weight: bold;");
            console.log("--- Total jobs:", ${jobs.length}, "---");
            console.log("--- Pending:", ${
              jobs.filter((j) => j.status === "pending").length
            }, "---");
            console.log("--- Ready:", ${
              jobs.filter((j) => j.status === "ready").length
            }, "---");
            console.log("--- Completed:", ${
              jobs.filter((j) => j.status === "completed").length
            }, "---");
            console.log("--- Jobs data ---", ${JSON.stringify(
              jobs.slice(0, 3)
            )});
          `);
          mainWindow.webContents.send("jobs-update", jobs);
        }
      },
      (error) => {
        console.error("\n--- LISTENER ERROR ---");
        console.error("--- Error code:", error.code, "---");
        console.error("--- Error message:", error.message, "---");
        console.error("--- Full error:", error, "---");
        console.error("--- END LISTENER ERROR ---\n");

        if (mainWindow) {
          mainWindow.webContents.executeJavaScript(`
            console.error("%c--- Firebase Listener Error ---", "color: #ff0000; font-weight: bold; font-size: 14px;");
            console.error("--- Code:", "${error.code}", "---");
            console.error("--- Message:", "${error.message}", "---");
            console.error("%c--- This usually means ---", "color: #ff6600;");
            console.error("--- 1. Missing Firestore index (check Firebase console) ---");
            console.error("--- 2. Invalid service account permissions ---");
            console.error("--- 3. Network connectivity issues ---");
          `);
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

ipcMain.handle("process-job", async (event, { job, printerName }) => {
  const { id, fileUrl, fileName, printOptions } = job;
  const safeFileName = fileName.replace(/[^a-z0-9.]/gi, "_");
  const localPath = path.join(TEMP_DOWNLOAD_DIR, `${id}_${safeFileName}`);

  try {
    await updateJobStatus(id, "downloading");
    await downloadFile(fileUrl, localPath);

    await updateJobStatus(id, "printing");

    const options = {
      printer: printerName,
      copies: printOptions.copies || 1,
      pages:
        printOptions.pageRange === "all" ? undefined : printOptions.pageRange,
      sides: printOptions.duplex === "two-sided" ? "duplex" : "simplex",
      monochrome: printOptions.colorMode === "bw",
      paperSize: printOptions.paperSize || "A4",
    };

    console.log(`--- Printing ${id} to ${printerName} ---`);
    await ptp.print(localPath, options);

    // IMPORTANT: Status goes to 'ready' (Ready for pickup)
    await updateJobStatus(id, "ready", {
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Immediate cleanup of this specific file to keep disk light
    fs.unlink(localPath, (err) => {
      if (err) console.error("Immediate cleanup warning", err);
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
    // Moves to 'completed' status, which puts it in History tab
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
  // UPDATED: Collection is 'jobs'
  await db
    .collection("jobs")
    .doc(jobId)
    .update({
      status: status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...extraFields,
    });
}
