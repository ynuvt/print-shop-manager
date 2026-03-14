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
import { fetchAllJobs, fetchJobByCode } from "./api/api";
import { Job, JobStatus } from "@printowl/types";
import { getSocket } from "./services/getSocket";

type Tab = "queue" | "history";
const API_BASE = "http://localhost:4000/api/v1";
const TOKEN_KEY = "printowl_admin_token";

function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function buildHeaders(): HeadersInit {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function adminLogin(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/admin-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) throw new Error(`Login failed (HTTP ${res.status}).`);

  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("Token missing in login response.");

  localStorage.setItem(TOKEN_KEY, data.token);
  return data.token;
}

// async function fetchAllJobs(): Promise<PrintJobSummary[]> {
//   const res = await fetch(`${API_BASE}/jobs/all`, { headers: buildHeaders() });
//   if (!res.ok) throw new Error(`Failed to load jobs (HTTP ${res.status}).`);
//   return res.json() as Promise<PrintJobSummary[]>;
// }

async function updateJobStatus(
  id: string,
  userId: string,
  status: JobStatus,
): Promise<void> {
  const res = await fetch(`${API_BASE}/jobs/update-status/${id}`, {
    method: "PUT",
    headers: buildHeaders(),
    body: JSON.stringify({ status, userId }),
  });
  if (!res.ok) throw new Error(`Failed to update status (HTTP ${res.status}).`);
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
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [tab, setTab] = useState<Tab>("queue");
  const [search, setSearch] = useState("");
  const [jobModalOpen, setJobModalOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(() => getAuthToken());

  const refreshJobs = useCallback(async () => {
    if (!token) return;

    setLoadingJobs(true);
    setLoadError(null);
    try {
      const data = await fetchAllJobs();
      setJobs(data);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load jobs.";
      setLoadError(message);
      if (message.includes("HTTP 401") || message.includes("HTTP 403")) {
        clearAuthToken();
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
  }, []);

  useEffect(() => {
    getSocket().on("job-created", () => {
      console.log("Received job-created event, refreshing jobs...");
      refreshJobs();
    });
  }, []);

  useEffect(() => {
    void refreshJobs();
  }, [refreshJobs]);

  const handleSelectJob = useCallback(async (job: Job) => {
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
          ? j.status === "PENDING" || j.status === "PROCESSING"
          : j.status === "COMPLETED" ||
            j.status === "REJECTED" ||
            j.status === "FAILED",
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
    [search, jobs, tab, handleSelectJob],
  );

  const handleStatusUpdate = useCallback(
    async (jobId: string, userId: string, newStatus: JobStatus) => {
      await updateJobStatus(jobId, userId, newStatus);

      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j)),
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
        ? j.status === "PENDING" || j.status === "PROCESSING"
        : j.status === "COMPLETED" ||
          j.status === "REJECTED" ||
          j.status === "FAILED",
    );
  }, [jobs, tab]);

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
