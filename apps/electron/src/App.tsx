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
  adminLogin,
  fetchAllJobs,
  fetchJobByCode,
  getAuthToken,
  NotFoundError,
  logout,
  updateJobStatus,
} from "./api/api";
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

/** Cap total indicators to 3 with a sliding window (FIFO).
 *  When a 4th job arrives, the oldest drops: [1,2,3] → add 4 → [2,3,4] */
function capPrintJobs(jobs: ActivePrintJobState[]): ActivePrintJobState[] {
  if (jobs.length <= 3) return jobs;
  return jobs.slice(-3);
}

function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const token = await adminLogin(email, password);
      onLogin(token);
    } catch {
      setError("Invalid credentials or server error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
      <div className="w-full max-w-sm">
        {/* Logo + branding */}
        <div className="mb-8 flex flex-col items-center">
          <img src="/zopy.png" alt="Zopy" className="h-14 w-14 rounded-2xl shadow-lg mb-4" />
          <h1 className="text-2xl font-bold text-[var(--text)] tracking-tight">Zopy Print Manager</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Sign in to your admin console</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6 shadow-[var(--shadow-lg)]"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider" htmlFor="login-email">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/10"
                placeholder="admin@zopy.in"
                required
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

    // Note: print-progress IPC events are NOT listened to here.
    // The print phase state is managed directly by executePrintJob()
    // to avoid temp filenames (printowl_17768...) flashing in the UI.

    return () => {
      offDownload?.();
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
        setToken(null);
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

        // Set color printer (COLOUR A/4 is our color printer)
        const colorPrinterName = "COLOUR   A/4";
        setSelectedColorPrinter(colorPrinterName);
        console.log("Color printer set to:", colorPrinterName);

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
      await handleSelectJob(matches[0]);
    },
    [search, jobs, tab, queueFilter, historyFilter, handleSelectJob],
  );

  const handleStatusUpdate = useCallback(
    async (jobId: string, userId: string, newStatus: UpdatableJobStatus) => {
      await updateJobStatus(jobId, userId, newStatus);

      setJobs((prev) =>
        sortJobsNewestFirst(
          prev.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j)),
        ),
      );

      setSelectedJob((prev) =>
        prev && prev.id === jobId ? { ...prev, status: newStatus } : prev,
      );
    },
    [],
  );

  // ── Background print pipeline ───────────────────────────
  const executePrintJob = useCallback(
    async (job: PrintJob, printerName: string) => {
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

      // Remove old runs of the same job, add new, cap to 3 total
      setActivePrintJobs((prev) => {
        const withoutOld = prev.filter((j) => j.jobId !== job.id);
        return capPrintJobs([...withoutOld, newEntry]);
      });

      const downloadedFiles: {
        path: string;
        fileIndex: number;
        options: any;
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

          const customPages =
            fileOption.pageRange === "CUSTOM"
              ? fileOption.customRange?.trim()
              : undefined;
          const isDuplex = fileOption.duplex === "BOTH";

          const options = {
            copies: Math.max(1, Number(fileOption.copies) || 1),
            paperSize: "A4",
            side: isDuplex ? "duplexlong" : "simplex",
            duplex: isDuplex ? "Duplex" : "Simplex",
            monochrome: fileOption.colorMode !== "COLOR",
            orientation:
              fileOption.orientation === "LANDSCAPE" ? "landscape" : "portrait",
            scale:
              fileOption.scaleMode === "NOSCALE"
                ? "noscale"
                : fileOption.scaleMode === "SHRINK"
                  ? "shrink"
                  : "fit",
            ...(customPages ? { pages: customPages } : {}),
          };

          return { path: filePath, fileIndex: i, options };
        });

        const results = await Promise.all(downloadPromises);
        for (const r of results) {
          if (r) downloadedFiles.push(r);
        }

        // Phase 2: Print all files at once
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

        const printPromises = downloadedFiles.map(
          ({ path, fileIndex, options }) =>
            window.electronAPI.printPDF(path, printerName, options, {
              fileIndex,
              totalFiles: job.files.length,
              printRunId,
            }),
        );

        await Promise.all(printPromises);

        // Phase 3: Cleanup + status update
        await window.electronAPI.deleteFiles(
          downloadedFiles.map((f) => f.path),
        );
        await handleStatusUpdate(job.id, job.userId, "COMPLETED");

        // Mark completed — cap to 3 total
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
    (job: PrintJob, printerName: string) => {
      void executePrintJob(job, printerName);
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
    return matches.length > 0 ? matches[matches.length - 1] : null;
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
        onLogin={(newToken: string) => {
          setToken(newToken);
        }}
      />
    );
  }

  return (
    <main className="flex h-screen flex-col bg-[var(--bg)] text-[var(--text)]">
      <Header
        tab={tab}
        onTabChange={setTab}
        totalJobs={jobs.length}
        printers={printers}
        selectedPrinter={selectedPrinter}
        onPrinterChange={handlePrinterChange}
      />

      {loadError && (
        <div className="shrink-0 flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          <span className="text-xs font-medium text-amber-800">{loadError}</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {/* Search + filters */}
        <form
          onSubmit={(e) => void handleSearchSubmit(e)}
          className="shrink-0 border-b border-[var(--border)] bg-[var(--panel)] px-5 py-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-xs">
              <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by job code…"
                className="search-input pl-9"
              />
            </div>
            <button
              type="button"
              onClick={() => void refreshJobs()}
              disabled={loadingJobs}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-xs font-semibold text-[var(--text-muted)] transition hover:border-[var(--brand)] hover:text-[var(--text)] disabled:opacity-50"
            >
              {loadingJobs ? (
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeDasharray="31.416" strokeDashoffset="10" strokeLinecap="round" /></svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
              )}
              {loadingJobs ? "Loading" : "Refresh"}
            </button>
          </div>

          {tab === "history" && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setHistoryFilter("COMPLETED")}
                className={`filter-pill ${historyFilter === "COMPLETED" ? "active" : ""}`}
              >
                ✓ Completed
              </button>
              <button
                type="button"
                onClick={() => setHistoryFilter("REJECTED")}
                className={`filter-pill ${historyFilter === "REJECTED" ? "active" : ""}`}
              >
                ✕ Rejected
              </button>
            </div>
          )}
        </form>

        {/* Job grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loadingJobs ? (
            <div className="flex flex-col items-center justify-center py-16 animate-[fadeIn_0.3s_ease]">
              <div className="loader-dots mb-3"><span /><span /><span /></div>
              <p className="text-sm text-[var(--text-muted)]">Loading jobs…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 animate-[fadeIn_0.3s_ease]">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--panel-muted)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
              </div>
              <p className="text-sm font-medium text-[var(--text-muted)]">No jobs in this view</p>
              <p className="mt-1 text-xs text-[var(--text-muted)] opacity-70">Jobs will appear here when they arrive</p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 animate-[fadeIn_0.2s_ease]">
              {filtered.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  selected={selectedJob?.id === job.id && jobModalOpen}
                  onSelect={() => void handleSelectJob(job)}
                />
              ))}
            </ul>
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
