import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Header from "./components/Header";
import JobCard from "./components/JobCard";
import JobModal from "./components/JobModal";
import ActivePrintIndicator from "./components/ActivePrintIndicator";
import {
  shopLogin,
  fetchAllJobs,
  fetchJobByCode,
  getAuthToken,
  NotFoundError,
  logout,
  updateJobStatus,
  type PrintShopInfo,
} from "./api/api";
import { motion, AnimatePresence } from "framer-motion";
import { Search, RefreshCw, CheckCircle2, XCircle, AlertTriangle, FileText, ChevronRight, Check, X, Printer, Trash2, ExternalLink, FileCheck, Layers, Type, Palette } from "lucide-react";
import {
  PrintJob,
  PrintJobSummary,
  JobStatus,
  ActivePrintJobState,
  FileDownloadEntry,
} from "./types";
import type { PrintFileOption } from "@printowl/types";
import { getSocket } from "./services/getSocket";

type Tab = "queue" | "history";
type QueueFilter = "PENDING";
type HistoryFilter = "COMPLETED" | "REJECTED";
type UpdatableJobStatus = "COMPLETED" | "REJECTED" | "FAILED";

function sortJobsNewestFirst(items: PrintJobSummary[]): PrintJobSummary[] {
  return [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/** Cap total indicators to 5 with a sliding window (FIFO).
 *  When a 6th job arrives, the oldest drops: [1,2,3,4,5] → add 6 → [2,3,4,5,6] */
function capPrintJobs(jobs: ActivePrintJobState[]): ActivePrintJobState[] {
  if (jobs.length <= 5) return jobs;
  return jobs.slice(-5);
}

function LoginScreen({ onLogin }: { onLogin: (token: string, shop: PrintShopInfo) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await shopLogin(username.trim(), password);
      onLogin(response.token, response.shop);
    } catch (err: any) {
      setError(err.message || "Invalid username/password or server error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
      <div className="w-full max-w-sm">
        {/* Logo + branding */}
        <div className="mb-8 flex flex-col items-center">
          <img src="./zopy.png" alt="Zopy" className="h-14 w-14 rounded-2xl shadow-lg mb-4" />
          <h1 className="text-2xl font-bold text-[var(--text)] tracking-tight">Zopy Print Manager</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Sign in to your print console</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6 shadow-[var(--shadow-lg)]"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider" htmlFor="login-username">
                Username
              </label>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/10"
                placeholder="Enter shop username"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider" htmlFor="login-password">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/10"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--brand-strong)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeDasharray="31.416" strokeDashoffset="10" strokeLinecap="round" /></svg>
                Signing in…
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function App() {
  const [jobs, setJobs] = useState<PrintJobSummary[]>([]);
  const [selectedJob, setSelectedJob] = useState<PrintJob | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [tab, setTab] = useState<Tab>("queue");
  const [queueFilter] = useState<QueueFilter>("PENDING");
  const [historyFilter, setHistoryFilter] =
    useState<HistoryFilter>("COMPLETED");
  const [search, setSearch] = useState("");
  const [jobModalOpen, setJobModalOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(() => getAuthToken());

  const [printers, setPrinters] = useState<
    { name: string; isDefault: boolean }[]
  >([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>("");
  const [selectedColorPrinter, setSelectedColorPrinter] = useState<string>("");

  const [currentShop, setCurrentShop] = useState<{ id: string; username: string; shopId: string } | null>(() => {
    const saved = localStorage.getItem("zopy_current_shop");
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  });

  const selectedShopId = currentShop?.shopId || "";

  const handleLogout = useCallback(() => {
    logout();
    localStorage.removeItem("zopy_current_shop");
    setToken(null);
    setCurrentShop(null);
  }, []);

  // ── Restore saved theme on mount ──────────────────
  useEffect(() => {
    const saved = localStorage.getItem("zopy_theme");
    if (saved === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, []);

  // ── Background print jobs (supports multiple) ───────────
  const [activePrintJobs, setActivePrintJobs] = useState<
    ActivePrintJobState[]
  >([]);

  // Helper: update a specific job in the array by printRunId
  const updatePrintJob = useCallback(
    (
      printRunId: string,
      updater: (prev: ActivePrintJobState) => ActivePrintJobState,
    ) => {
      setActivePrintJobs((prev) =>
        prev.map((j) => (j.printRunId === printRunId ? updater(j) : j)),
      );
    },
    [],
  );

  // ── IPC progress listeners (set up once) ────────────────
  useEffect(() => {
    const offDownload = window.electronAPI?.onDownloadProgress?.((payload) => {
      if (!payload.fileId || !payload.printRunId) return;
      updatePrintJob(payload.printRunId, (prev) => {
        if (prev.phase !== "downloading") return prev;
        return {
          ...prev,
          fileProgressMap: {
            ...prev.fileProgressMap,
            [payload.fileId!]: {
              fileIndex: payload.fileIndex,
              fileName: payload.fileName ?? `File ${payload.fileIndex + 1}`,
              percent: payload.percent,
            },
          },
        };
      });
    });

    const offBatchPrint = window.electronAPI?.onBatchPrintProgress?.((payload) => {
      if (!payload.fileId || !payload.printRunId) return;
      const fileIndex = parseInt(payload.fileId, 10);
      updatePrintJob(payload.printRunId, (prev) => {
        if (prev.phase !== "printing") return prev;
        return {
          ...prev,
          printProgress: {
            fileIndex,
            totalFiles: prev.job.files.length,
            percent: payload.percent,
            fileName: `Printing file ${fileIndex + 1}…`,
          },
        };
      });
    });

    return () => {
      offDownload?.();
      offBatchPrint?.();
    };
  }, [updatePrintJob]);

  const refreshJobs = useCallback(async () => {
    if (!token) return;

    setLoadingJobs(true);
    setLoadError(null);
    try {
      const data = await fetchAllJobs();
      setJobs(sortJobsNewestFirst(data));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load jobs.";
      setLoadError(message);
      if (message.includes("HTTP 401") || message.includes("HTTP 403")) {
        logout();
        localStorage.removeItem("zopy_current_shop");
        setToken(null);
        setCurrentShop(null);
      }
    } finally {
      setLoadingJobs(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    getSocket().emit("join-room", "admin");

    return () => {
      getSocket().emit("leave-room", "admin");
    };
  }, [token]);

  useEffect(() => {
    getSocket().on("job-created", () => {
      console.log("Received job-created event, refreshing jobs...");
      refreshJobs();
    });
  }, [refreshJobs]);

  useEffect(() => {
    const loadPrinters = async () => {
      if (!window?.electronAPI?.listPrinters) {
        setToast("Printer list not available in this environment.");
        return;
      }

      try {
        const printerList = await window.electronAPI.listPrinters();
        console.log("=== PRINTER LIST LOADED ===");
        console.log(JSON.stringify(printerList, null, 2));
        console.log("=== END PRINTER LIST ===");
        setPrinters(printerList);

        // Set color printer — prefer persisted selection, fall back to the
        // default color printer name for first-time setup.
        const savedColorPrinter = localStorage.getItem("printowl_color_printer");
        if (savedColorPrinter) {
          setSelectedColorPrinter(savedColorPrinter);
          console.log("Color printer restored from storage:", savedColorPrinter);
        } else {
          const defaultColorPrinterName = "COLOUR   A/4";
          setSelectedColorPrinter(defaultColorPrinterName);
          console.log("Color printer defaulting to:", defaultColorPrinterName);
        }

        const savedPrinter = localStorage.getItem("printowl_selected_printer");
        if (savedPrinter) {
          setSelectedPrinter(savedPrinter);
          return;
        }

        const defaultPrinter = printerList.find((p) => p.isDefault);
        if (defaultPrinter) setSelectedPrinter(defaultPrinter.name);
      } catch (err) {
        console.error("Failed to load printers:", err);
        setToast("Failed to load printers. Printing will be disabled.");
      }
    };

    if (token) {
      void loadPrinters();
    }
  }, [token]);

  useEffect(() => {
    void refreshJobs();
  }, [refreshJobs]);

  const handlePrinterChange = useCallback((printer: string) => {
    setSelectedPrinter(printer);
    localStorage.setItem("printowl_selected_printer", printer);
  }, []);

  const handleColorPrinterChange = useCallback((printer: string) => {
    console.log("Setting color printer to:", printer);
    setSelectedColorPrinter(printer);
    localStorage.setItem("printowl_color_printer", printer);
  }, []);

  const handleSelectJob = useCallback(async (job: PrintJobSummary) => {
    setLoadError(null);
    try {
      const full = await fetchJobByCode(String(job.verificationCode));
      setSelectedJob(full);
      setJobModalOpen(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to open job.";
      setSelectedJob({ ...job, files: [] });
      setJobModalOpen(true);
      setLoadError(message);
      setToast("Opened job from list data");
    }
  }, []);

  const handleModalClose = useCallback(() => {
    setJobModalOpen(false);
    setSelectedJob(null);
  }, []);

  const handleSearchSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      const code = search.trim();
      if (!code) return;
      if (!/^\d+$/.test(code)) {
        setToast("Please enter numeric job code only");
        return;
      }

      const tabMatches = jobs.filter((j) =>
        tab === "queue" ? j.status === queueFilter : j.status === historyFilter,
      );

      const matches = tabMatches.filter((j) =>
        String(j.verificationCode).includes(code),
      );

      if (matches.length === 0) {
        try {
          const fetched = await fetchJobByCode(code);
          setSelectedJob(fetched);
          setJobModalOpen(true);

          setJobs((prev) => {
            const exists = prev.some((job) => job.id === fetched.id);
            if (exists) return prev;
            const { files: _files, ...summary } = fetched;
            return sortJobsNewestFirst([summary, ...prev]);
          });
          return;
        } catch (error) {
          if (error instanceof NotFoundError) {
            setToast("No job found");
            return;
          }

          const message =
            error instanceof Error ? error.message : "Failed to load job.";
          setLoadError(message);
          setToast("Unable to fetch job from server");
          return;
        }
      }

      setLoadError(null);
      if (matches[0]) {
        await handleSelectJob(matches[0]);
      }
    },
    [search, jobs, tab, queueFilter, historyFilter, handleSelectJob],
  );

  const handleStatusUpdate = useCallback(
    async (jobId: string, userId: string, newStatus: UpdatableJobStatus) => {
      await updateJobStatus(jobId, userId, newStatus, selectedShopId || undefined);

      setJobs((prev) =>
        sortJobsNewestFirst(
          prev.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j)),
        ),
      );

      setSelectedJob((prev) =>
        prev && prev.id === jobId ? { ...prev, status: newStatus } : prev,
      );
    },
    [selectedShopId],
  );

  // ── Background print pipeline ───────────────────────────
  const executePrintJob = useCallback(
    async (job: PrintJob, bwPrinterName: string, colorPrinterName: string) => {
      const printRunId = `run-${Date.now()}-${job.id}`;

      // Initialize per-file progress
      const initialMap: Record<string, FileDownloadEntry> = {};
      job.files.forEach((file, i) => {
        initialMap[`${i}-${file.name}`] = {
          fileIndex: i,
          fileName: file.name,
          percent: 0,
        };
      });

      const newEntry: ActivePrintJobState = {
        printRunId,
        jobId: job.id,
        verificationCode: job.verificationCode,
        job,
        phase: "downloading",
        fileProgressMap: initialMap,
        printProgress: null,
        error: null,
      };

      // Remove old runs of the same job, add new, cap to 5 total
      setActivePrintJobs((prev) => {
        const withoutOld = prev.filter((j) => j.jobId !== job.id);
        return capPrintJobs([...withoutOld, newEntry]);
      });

      const downloadedFiles: {
        path: string;
        fileIndex: number;
        options: any;
        isColor: boolean;
      }[] = [];

      try {
        // Phase 1: Download all files in parallel
        const downloadPromises = job.files.map(async (file, i) => {
          if (!file) return null;

          const filePath = await window.electronAPI.downloadFile(
            { url: file.url, name: file.name },
            { fileIndex: i, totalFiles: job.files.length, printRunId },
          );

          const fileOption: PrintFileOption = file.option ?? {
            paperSize: "A4",
            colorMode: "BW",
            orientation: "PORTRAIT",
            scaleMode: "FIT",
            pageRange: "ALL",
            duplex: "ONE",
            copies: 1,
          };

          const isColor = fileOption.colorMode === "COLOR";
          const customPages =
            fileOption.pageRange === "CUSTOM"
              ? fileOption.customRange?.trim()
              : undefined;
          const isDuplex = fileOption.duplex === "BOTH";

          const options = {
            copies: Math.max(1, Number(fileOption.copies) || 1),
            paperSize: fileOption.paperSize || "A4",
            side: isDuplex ? "duplexlong" : "simplex",
            duplex: isDuplex ? "Duplex" : "Simplex",
            monochrome: !isColor,
            orientation:
              fileOption.orientation === "LANDSCAPE" ? "landscape" : "portrait",
            scale:
              fileOption.scaleMode === "NOSCALE"
                ? "noscale"
                : fileOption.scaleMode === "SHRINK"
                  ? "shrink"
                  : "fit",
            pagesPerSheet: Math.max(1, Number(fileOption.pagesPerSheet) || 1),
            ...(customPages ? { pages: customPages } : {}),
          };

          return { path: filePath, fileIndex: i, options, isColor };
        });

        const results = await Promise.all(downloadPromises);
        for (const r of results) {
          if (r) downloadedFiles.push(r);
        }

        // Phase 2: Print all files — route by colorMode
        updatePrintJob(printRunId, (prev) => ({
          ...prev,
          phase: "printing",
          fileProgressMap: {},
          printProgress: {
            fileIndex: 0,
            totalFiles: job.files.length,
            percent: 0,
            fileName: "Sending all files to printer…",
          },
        }));

        const bwFiles: any[] = [];
        const colorFiles: any[] = [];
        downloadedFiles.forEach(f => {
           if (f.isColor && colorPrinterName && colorPrinterName !== bwPrinterName) {
             colorFiles.push(f);
           } else {
             bwFiles.push(f);
           }
        });

        const mapToFileConfig = (f: any) => ({
             path: f.path,
             copies: f.options.copies,
             paperSize: f.options.paperSize,
             colorMode: f.isColor ? "COLOR" : "BW",
             duplex: f.options.duplex === "Duplex" ? "BOTH" : "ONE",
             orientation: f.options.orientation,
             pagesPerSheet: f.options.pagesPerSheet || 1,
             pages: f.options.pages || "",
             scale: f.options.scale || "fit",
             id: `${f.fileIndex}`
        });

        if (bwFiles.length > 0) {
           await window.electronAPI.printBatch(bwPrinterName, bwFiles.map(mapToFileConfig), { printRunId });
        }
        
        if (colorFiles.length > 0) {
           await window.electronAPI.printBatch(colorPrinterName, colorFiles.map(mapToFileConfig), { printRunId });
        }

        // Phase 3: Cleanup + status update
        await window.electronAPI.deleteFiles(
          downloadedFiles.map((f) => f.path),
        );
        await handleStatusUpdate(job.id, job.userId, "COMPLETED");

        // Mark completed — cap to 5 total
        setActivePrintJobs((prev) =>
          capPrintJobs(
            prev.map((j) =>
              j.printRunId === printRunId
                ? {
                    ...j,
                    phase: "completed" as const,
                    printProgress: {
                      fileIndex: job.files.length - 1,
                      totalFiles: job.files.length,
                      percent: 100,
                      fileName: "All files sent to printer",
                    },
                  }
                : j,
            ),
          ),
        );
      } catch (err) {
        console.error("Print error:", err);

        if (downloadedFiles.length > 0) {
          await window.electronAPI
            .deleteFiles(downloadedFiles.map((f) => f.path))
            .catch(() => {});
        }

        setActivePrintJobs((prev) =>
          capPrintJobs(
            prev.map((j) =>
              j.printRunId === printRunId
                ? {
                    ...j,
                    phase: "failed" as const,
                    error:
                      err instanceof Error
                        ? err.message
                        : "Failed to print. Please try again.",
                  }
                : j,
            ),
          ),
        );
      }
    },
    [handleStatusUpdate, updatePrintJob],
  );

  const handleStartPrint = useCallback(
    (job: PrintJob, bwPrinterName: string, colorPrinterName: string) => {
      void executePrintJob(job, bwPrinterName, colorPrinterName);
    },
    [executePrintJob],
  );

  const handleRejectJob = useCallback(
    async (jobId: string, userId: string) => {
      await handleStatusUpdate(jobId, userId, "REJECTED");
    },
    [handleStatusUpdate],
  );

  const handleClearPrintJob = useCallback((printRunId: string) => {
    setActivePrintJobs((prev) =>
      prev.filter((j) => j.printRunId !== printRunId),
    );
  }, []);

  const handleIndicatorClick = useCallback(
    (printRunId: string) => {
      const found = activePrintJobs.find((j) => j.printRunId === printRunId);
      if (!found) return;
      setSelectedJob(found.job);
      setJobModalOpen(true);
    },
    [activePrintJobs],
  );

  // Find the active print state for the currently selected job (if any)
  const activePrintForSelectedJob = useMemo(() => {
    if (!selectedJob) return null;
    // Return the most recent run for this job
    const matches = activePrintJobs.filter((j) => j.jobId === selectedJob.id);
    return matches.length > 0 ? (matches[matches.length - 1] ?? null) : null;
  }, [activePrintJobs, selectedJob]);

  // Is any job actively downloading/printing?
  const isPrintBusy = activePrintJobs.some(
    (j) => j.phase === "downloading" || j.phase === "printing",
  );

  const filtered = useMemo(() => {
    return jobs.filter((j) =>
      tab === "queue" ? j.status === queueFilter : j.status === historyFilter,
    );
  }, [jobs, tab, queueFilter, historyFilter]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  if (!token) {
    return (
      <LoginScreen
        onLogin={(newToken: string, shop: PrintShopInfo) => {
          localStorage.setItem("printowl_admin_token", newToken);
          localStorage.setItem("zopy_current_shop", JSON.stringify(shop));
          setToken(newToken);
          setCurrentShop(shop);
        }}
      />
    );
  }

  return (
    <main className="flex h-screen flex-col bg-[var(--bg)] text-[var(--text)]">
      <Header
        tab={tab}
        onTabChange={setTab}
        printers={printers}
        selectedPrinter={selectedPrinter}
        onPrinterChange={handlePrinterChange}
        selectedColorPrinter={selectedColorPrinter}
        onColorPrinterChange={handleColorPrinterChange}
        shopName={currentShop?.username || ""}
        shopCode={currentShop?.shopId || ""}
      />

      {loadError && (
        <div className="shrink-0 flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          <span className="text-xs font-medium text-amber-800">{loadError}</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {/* Quick Search Area */}
        <form
          onSubmit={(e) => void handleSearchSubmit(e)}
          className="shrink-0 border-b border-[var(--border)] bg-[var(--panel)] px-5 py-6"
        >
          <div className="flex max-w-xl items-center gap-3">
            <div className="group relative flex-1">
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={search}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, "");
                  if (val.length <= 4) setSearch(val);
                }}
                placeholder="Enter Job Code"
                className="w-full h-11 rounded-xl border-2 border-[var(--border)] bg-[var(--panel-muted)] px-10 text-base font-black text-[var(--text)] outline-none transition-all placeholder:text-[var(--text-muted)] placeholder:font-bold placeholder:opacity-50 focus:border-[var(--brand)] focus:ring-[8px] focus:ring-[var(--brand)]/10 focus:bg-[var(--bg)]"
                autoFocus
              />
              <Search
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--brand)] transition-colors"
                size={18}
              />
            </div>
            
            <button
              type="submit"
              disabled={search.length !== 4}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-6 text-sm font-black text-white shadow-lg shadow-[var(--brand)]/15 transition-all hover:bg-[var(--brand-strong)] hover:translate-y-[-1px] active:scale-95 active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0 disabled:grayscale"
            >
              Search
            </button>

            <button
              type="button"
              onClick={() => void refreshJobs()}
              disabled={loadingJobs}
              className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-[var(--border)] bg-[var(--panel)] transition-all hover:border-[var(--brand)] hover:bg-[var(--panel-muted)] disabled:opacity-50"
              title="Refresh Queue"
            >
              <RefreshCw
                className={`h-5 w-5 text-[var(--text-muted)] ${
                  loadingJobs ? "animate-spin text-[var(--brand)]" : ""
                }`}
              />
            </button>
          </div>
        </form>

        {/* Job grid */}
        <div className="flex-1 overflow-y-auto p-4 bg-[var(--bg)]/30">
          <div className="mb-4 flex items-center justify-between px-2">
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] opacity-70">
              {tab === "queue" ? "Current Printing Queue" : "Print History"}
            </h3>
            
            {tab === "history" && (
              <div className="flex items-center gap-1.5 rounded-xl bg-[var(--panel-muted)] p-1 border border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setHistoryFilter("COMPLETED")}
                  className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-black uppercase tracking-widest transition-all ${
                    historyFilter === "COMPLETED" 
                      ? "bg-[var(--brand)] text-white shadow-lg" 
                      : "text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  <Check size={14} strokeWidth={3} />
                  Completed
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter("REJECTED")}
                  className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-black uppercase tracking-widest transition-all ${
                    historyFilter === "REJECTED" 
                      ? "bg-rose-500 text-white shadow-lg" 
                      : "text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  <X size={14} strokeWidth={3} />
                  Rejected
                </button>
              </div>
            )}
          </div>

          {loadingJobs ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="loader-dots mb-4"><span /><span /><span /></div>
              <p className="text-sm font-bold uppercase tracking-widest text-[var(--text-muted)]">Syncing Queue...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 opacity-40">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-[24px] bg-[var(--panel-muted)]">
                <FileText size={40} className="text-[var(--text-muted)]" />
              </div>
              <p className="text-xl font-black text-[var(--text-muted)]">No jobs found</p>
              <p className="mt-2 text-sm font-medium text-[var(--text-muted)]">Active print jobs will appear here</p>
            </div>
          ) : (
            <motion.ul 
              layout
              className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
            >
              <AnimatePresence mode="popLayout">
                {filtered.slice(0, 10).map((job) => (
                  <motion.li
                    key={job.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
                    whileHover={{ y: -6, transition: { duration: 0.2 } }}
                    transition={{ type: "spring", stiffness: 350, damping: 25 }}
                  >
                    <JobCard
                      job={job}
                      selected={selectedJob?.id === job.id && jobModalOpen}
                      onSelect={() => void handleSelectJob(job)}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ul>
          )}
        </div>
      </div>

      {/* Floating active print indicators */}
      <ActivePrintIndicator
        activePrintJobs={activePrintJobs}
        onClickJob={handleIndicatorClick}
        onClearJob={handleClearPrintJob}
      />

      {/* Job modal */}
      {jobModalOpen && selectedJob && (
        <JobModal
          job={selectedJob}
          onClose={handleModalClose}
          onReject={handleRejectJob}
          onStartPrint={handleStartPrint}
          activePrintState={activePrintForSelectedJob}
          isPrintBusy={isPrintBusy}
          printers={printers}
          selectedPrinter={selectedPrinter}
          selectedColorPrinter={selectedColorPrinter}
          hasActiveIndicators={activePrintJobs.length > 0}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-xs font-medium text-white shadow-xl animate-[slideIn_0.2s_ease-out]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          {toast}
        </div>
      )}
    </main>
  );
}
