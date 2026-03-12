import { useCallback, useEffect, useState } from "react";
import { getUserPrintJobs } from "../api/api";
import type { UserPrintJob, UserPrintJobFile } from "../api/api";

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatPrice(amount: number) {
  return currencyFormatter.format(amount);
}

// ─── File option card ─────────────────────────────────────────────────────────

function formatOption(label: string, value: string) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xs font-medium text-zinc-800">{value}</span>
    </div>
  );
}

function FileOptionCard({ file }: { file: UserPrintJobFile }) {
  const opt = file.option;
  const colorLabel =
    opt?.colorMode === "COLOR" ? "Color (₹7/sheet)" : "B&W (₹2/sheet)";
  const duplexLabel = opt?.duplex === "BOTH" ? "Both Sides" : "One Side";
  const rangeLabel =
    opt?.pageRange === "CUSTOM" && opt?.customRange
      ? `Custom: ${opt.customRange}`
      : "All Pages";

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold text-zinc-900">
          📄 {file.name}
        </p>
        <a
          href={file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700"
        >
          View File
        </a>
      </div>
      <p className="mb-2 text-xs text-zinc-400">{file.pages} pages</p>
      {opt && (
        <div className="space-y-1 border-t border-zinc-200 pt-2">
          {formatOption("Color", colorLabel)}
          {formatOption("Sides", duplexLabel)}
          {formatOption("Page Range", rangeLabel)}
          {formatOption("Copies", String(opt.copies))}
        </div>
      )}
    </div>
  );
}

// ─── Job detail modal ─────────────────────────────────────────────────────────

function JobDetailModal({
  job,
  onClose,
}: {
  job: UserPrintJob;
  onClose: () => void;
}) {
  const statusColor =
    job.status.toLowerCase() === "completed"
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : "text-amber-700 bg-amber-50 border-amber-200";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Print Job
            </p>
            <h2 className="text-xl font-bold text-zinc-900">
              #{job.verificationCode}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              {new Date(job.createdAt).toLocaleString()}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            ✕
          </button>
        </div>

        {/* OTP / Verification Code */}
        <div className="mb-5 rounded-2xl border-2 border-indigo-500 bg-indigo-50 px-5 py-4 text-center">
          <p className="text-xs font-medium text-indigo-500 uppercase tracking-wide">
            Verification Code (OTP)
          </p>
          <p className="mt-1 font-mono text-4xl font-bold tracking-widest text-indigo-600">
            {job.verificationCode}
          </p>
          <p className="mt-1 text-xs text-indigo-400">
            Show this at the counter to collect your prints
          </p>
        </div>

        {/* Status + summary */}
        <div className="mb-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Total Price
              </p>
              <p className="mt-1 text-3xl font-bold text-zinc-950">
                {formatPrice(job.totalCost)}
              </p>
            </div>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${statusColor}`}
            >
              {job.status}
            </span>
          </div>
          <p className="mt-3 text-sm text-zinc-600">
            {job.files.length} file(s) · {job.totalPages} pages
          </p>
        </div>

        {/* Files */}
        <div className="max-h-72 overflow-y-auto space-y-3">
          {job.files.map((file) => (
            <FileOptionCard key={file.id} file={file} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── PrintJobsList ────────────────────────────────────────────────────────────

export default function PrintJobsList({
  userId,
  refreshTrigger,
}: {
  userId: string | null;
  refreshTrigger: number;
}) {
  const [jobs, setJobs] = useState<UserPrintJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<UserPrintJob | null>(null);

  const normalizeStatus = (status: string) => status.toLowerCase();

  const load = useCallback(
    async ({ notification = false }: { notification?: boolean }) => {
      if (!userId) return;
      setLoading(true);
      if (notification) console.log("some particular job is updated");
      try {
        const fetched = await getUserPrintJobs();
        const sorted = [...fetched].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        setJobs(sorted);
      } finally {
        setLoading(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    void load({ notification: false });
  }, [load, refreshTrigger]);

  // useEffect(() => {
  //   const socket = getSocket();
  //   socket.on("job-status-updated", () => {
  //     // If the updated job is currently selected, refresh details
  //       void load({ notification: true });
  //   });
  //   return () => {
  //     socket.off("job-status-updated");
  //   };
  // }, []);

  const nonCompleted = jobs.filter(
    (j) => normalizeStatus(j.status) !== "completed",
  );
  const completed = jobs.filter(
    (j) => normalizeStatus(j.status) === "completed",
  );

  return (
    <>
      <section className="mt-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-900">
            Your Print Jobs
          </h3>
          <button
            type="button"
            onClick={() => void load({ notification: false })}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500">Loading jobs...</p>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-zinc-500">No print jobs yet.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Non-completed
              </p>
              {nonCompleted.length === 0 ? (
                <p className="text-sm text-zinc-400">No pending/active jobs.</p>
              ) : (
                <div className="space-y-2">
                  {nonCompleted.map((job) => (
                    <div
                      key={job.id}
                      onClick={() => setSelectedJob(job)}
                      className="cursor-pointer rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 transition hover:bg-zinc-100 active:scale-[0.99]"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-zinc-900">
                          #{job.verificationCode}
                        </p>
                        <div className="text-right">
                          <p className="text-sm font-bold text-zinc-950">
                            {formatPrice(job.totalCost)}
                          </p>
                          <p className="text-xs font-medium text-amber-700 uppercase">
                            {normalizeStatus(job.status)}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-500">
                        {job.files.length} file(s) · {job.totalPages} pages
                      </p>
                      <p className="text-xs text-zinc-400">
                        {new Date(job.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Completed
              </p>
              {completed.length === 0 ? (
                <p className="text-sm text-zinc-400">No completed jobs yet.</p>
              ) : (
                <div className="space-y-2">
                  {completed.map((job) => (
                    <div
                      key={job.id}
                      onClick={() => setSelectedJob(job)}
                      className="cursor-pointer rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 transition hover:bg-emerald-100 active:scale-[0.99]"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-zinc-900">
                          #{job.verificationCode}
                        </p>
                        <div className="text-right">
                          <p className="text-sm font-bold text-zinc-950">
                            {formatPrice(job.totalCost)}
                          </p>
                          <p className="text-xs font-medium text-emerald-700 uppercase">
                            completed
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-500">
                        {job.files.length} file(s) · {job.totalPages} pages
                      </p>
                      <p className="text-xs text-zinc-400">
                        {new Date(job.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {selectedJob && (
        <JobDetailModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
        />
      )}
    </>
  );
}
