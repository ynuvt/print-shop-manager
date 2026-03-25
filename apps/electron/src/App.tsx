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
import {
  adminLogin,
  fetchAllJobs,
  fetchJobByCode,
  getAuthToken,
  logout,
  updateJobStatus,
} from "./api/api";
import { PrintJob, PrintJobSummary, JobStatus } from "./types";
import { getSocket } from "./services/getSocket";

type Tab = "queue" | "history";
type QueueFilter = "ALL" | "PENDING" | "PROCESSING";
type HistoryFilter = "ALL" | "COMPLETED" | "REJECTED";
type UpdatableJobStatus = "PROCESSING" | "COMPLETED" | "REJECTED" | "FAILED";

function sortJobsNewestFirst(items: PrintJobSummary[]): PrintJobSummary[] {
  return [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

// async function fetchAllJobs(): Promise<PrintJobSummary[]> {
//   const res = await fetch(`${API_BASE}/jobs/all`, { headers: buildHeaders() });
//   if (!res.ok) throw new Error(`Failed to load jobs (HTTP ${res.status}).`);
//   return res.json() as Promise<PrintJobSummary[]>;
// }

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
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-bold text-gray-900">Admin Login</h1>
        <p className="mt-1 text-sm text-gray-500">
          Sign in to open print queue.
        </p>

        <div className="mt-5 space-y-3">
          <div>
            <label
              className="mb-1 block text-xs font-medium text-gray-600"
              htmlFor="email"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
              required
            />
          </div>

          <div>
            <label
              className="mb-1 block text-xs font-medium text-gray-600"
              htmlFor="password"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
              required
            />
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </main>
  );
}

export default function App() {
  const [jobs, setJobs] = useState<PrintJobSummary[]>([]);
  const [selectedJob, setSelectedJob] = useState<PrintJob | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [tab, setTab] = useState<Tab>("queue");
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("ALL");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("ALL");
  const [search, setSearch] = useState("");
  const [jobModalOpen, setJobModalOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(() => getAuthToken());

  const [printers, setPrinters] = useState<
    { name: string; isDefault: boolean }[]
  >([{ name: "Default Printer", isDefault: true }]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>("");

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
        setPrinters(printerList);

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

    // if (token) {
    //   void loadPrinters();
    // }
  }, [token]);

  useEffect(() => {
    void refreshJobs();
  }, [refreshJobs]);

  const handlePrinterChange = useCallback((printer: string) => {
    setSelectedPrinter(printer);
    localStorage.setItem("printowl_selected_printer", printer);
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
      // Fallback: still open from list data so Enter/click always opens a modal.
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
        tab === "queue"
          ? queueFilter === "ALL"
            ? j.status === "PENDING" || j.status === "PROCESSING"
            : j.status === queueFilter
          : historyFilter === "ALL"
            ? j.status === "COMPLETED" ||
              j.status === "REJECTED" ||
              j.status === "FAILED"
            : j.status === historyFilter,
      );

      const matches = tabMatches.filter((j) =>
        String(j.verificationCode).includes(code),
      );

      if (matches.length === 0) {
        setToast("No job found");
        return;
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

      if (selectedJob?.id === jobId) {
        setSelectedJob({ ...selectedJob, status: newStatus });
      }
    },
    [selectedJob],
  );

  const filtered = useMemo(() => {
    return jobs.filter((j) =>
      tab === "queue"
        ? queueFilter === "ALL"
          ? j.status === "PENDING" || j.status === "PROCESSING"
          : j.status === queueFilter
        : historyFilter === "ALL"
          ? j.status === "COMPLETED" ||
            j.status === "REJECTED" ||
            j.status === "FAILED"
          : j.status === historyFilter,
    );
  }, [jobs, tab, queueFilter, historyFilter]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  const processingCount = useMemo(
    () => jobs.filter((j) => j.status === "PROCESSING").length,
    [jobs],
  );

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
    <main className="flex h-screen flex-col bg-gray-100 text-gray-900">
      <Header
        tab={tab}
        onTabChange={setTab}
        totalJobs={jobs.length}
        processingCount={processingCount}
        printers={printers}
        selectedPrinter={selectedPrinter}
        onPrinterChange={handlePrinterChange}
      />

      {loadError && (
        <div className="shrink-0 border-b border-yellow-200 bg-yellow-50 px-5 py-2.5 text-xs text-yellow-700">
          {loadError}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <form
          onSubmit={(e) => void handleSearchSubmit(e)}
          className="shrink-0 border-b border-gray-200 bg-white px-5 py-3"
        >
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code and press Enter..."
            className="w-full max-w-xs rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/30 transition"
          />

          {tab === "queue" && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setQueueFilter("ALL")}
                className={`rounded-lg border px-3 py-1 text-xs font-semibold transition ${
                  queueFilter === "ALL"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setQueueFilter("PENDING")}
                className={`rounded-lg border px-3 py-1 text-xs font-semibold transition ${
                  queueFilter === "PENDING"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                }`}
              >
                Pending
              </button>
              <button
                type="button"
                onClick={() => setQueueFilter("PROCESSING")}
                className={`rounded-lg border px-3 py-1 text-xs font-semibold transition ${
                  queueFilter === "PROCESSING"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                }`}
              >
                Processing
              </button>
            </div>
          )}

          {tab === "history" && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setHistoryFilter("ALL")}
                className={`rounded-lg border px-3 py-1 text-xs font-semibold transition ${
                  historyFilter === "ALL"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setHistoryFilter("COMPLETED")}
                className={`rounded-lg border px-3 py-1 text-xs font-semibold transition ${
                  historyFilter === "COMPLETED"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                }`}
              >
                Completed
              </button>
              <button
                type="button"
                onClick={() => setHistoryFilter("REJECTED")}
                className={`rounded-lg border px-3 py-1 text-xs font-semibold transition ${
                  historyFilter === "REJECTED"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                }`}
              >
                Rejected
              </button>
            </div>
          )}
        </form>

        <div className="flex-1 overflow-y-auto p-4">
          {loadingJobs ? (
            <p className="py-10 text-center text-sm text-gray-500">
              Loading jobs...
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">
              No jobs in this view.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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

      {jobModalOpen && selectedJob && (
        <JobModal
          job={selectedJob}
          onClose={handleModalClose}
          onStatusUpdate={handleStatusUpdate}
          printers={printers}
          selectedPrinter={selectedPrinter}
          onPrinterChange={handlePrinterChange}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed right-5 top-5 z-50 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}
