import { useEffect, useState } from "react";
import StatusBadge from "./StatusBadge";
import { File, Job, JobStatus } from "@printowl/types";

interface JobModalProps {
  job: Job;
  onClose: () => void;
  onStatusUpdate: (
    jobId: string,
    userId: string,
    newStatus: JobStatus,
  ) => Promise<void>;
}

const OPTION_LABELS = {
  colorMode: { BW: "B&W", COLOR: "Color" },
  duplex: { ONE: "Single-sided", BOTH: "Duplex" },
  pageRange: { ALL: "All pages", CUSTOM: "Custom range" },
};

export default function JobModal({
  job,
  onClose,
  onStatusUpdate,
}: JobModalProps) {
  const [currentStatus, setCurrentStatus] = useState<JobStatus>(job.status);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentStatus(job.status);
  }, [job.status]);

  const isPending = currentStatus === "PENDING";
  const isProcessing = currentStatus === "PROCESSING";

  const created = new Date(job.createdAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  async function handleReject() {
    setLoading(true);
    setError(null);
    try {
      await onStatusUpdate(job.id, job.userId, "REJECTED");
      onClose();
    } catch {
      setError("Failed to reject job. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePrint() {
    setLoading(true);
    setError(null);
    try {
      await onStatusUpdate(job.id, job.userId, "PROCESSING");
      setCurrentStatus("PROCESSING");
    } catch {
      setError("Failed to start printing. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleHandover() {
    setLoading(true);
    setError(null);
    try {
      await onStatusUpdate(job.id, job.userId, "COMPLETED");
      onClose();
    } catch {
      setError("Failed to update status. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={handleBackdropClick}
    >
      <div className="flex w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl max-h-[88vh]">
        {/* ── Modal header ────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between gap-4 rounded-t-2xl border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-2xl font-bold text-gray-900">
              #{job.verificationCode}
            </span>
            <StatusBadge status={currentStatus} />
            {isProcessing && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                </span>
                Printing...
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <p className="text-xs text-gray-400">{created}</p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Scrollable body ─────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Summary row */}
          <div className="mb-6 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                Total Cost
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-gray-900">
                ₹{job.totalCost.toFixed(2)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                Pages
              </p>
              <p className="mt-1 text-lg font-bold text-gray-900">
                {job.totalPages}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                Est. Time
              </p>
              <p className="mt-1 text-lg font-bold text-gray-900">
                {isPending ? "-" : `${job.estimatedTime} min`}
              </p>
            </div>
          </div>

          {/* Files */}
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              Files ({job.files.length})
            </p>
            <ul className="flex flex-col gap-3">
              {job.files.map((file: File) => (
                <li
                  key={file.id}
                  className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-gray-500"
                          aria-hidden="true"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {file.name}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {file.pages} page{file.pages !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50"
                    >
                      View File
                    </a>
                  </div>

                  {/* Print options */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-600">
                      {file.option.paperSize}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-600">
                      {OPTION_LABELS.colorMode[file.option.colorMode]}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-600">
                      {OPTION_LABELS.duplex[file.option.duplex]}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-600">
                      {OPTION_LABELS.pageRange[file.option.pageRange]}
                      {file.option.customRange
                        ? ` (${file.option.customRange})`
                        : ""}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
                      {file.option.copies}× copies
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Fixed footer ────────────────────────────── */}
        <div className="shrink-0 rounded-b-2xl border-t border-gray-200 bg-gray-50 px-6 py-4">
          {error && <p className="mb-3 text-xs text-red-500">{error}</p>}

          {isPending && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleReject()}
                disabled={loading}
                className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:border-red-200 hover:bg-red-50 disabled:opacity-50"
              >
                Reject Job
              </button>
              <button
                type="button"
                onClick={() => void handlePrint()}
                disabled={loading}
                className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "Updating..." : "Print Job"}
              </button>
            </div>
          )}

          {isProcessing && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleReject()}
                disabled={loading}
                className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:border-red-200 hover:bg-red-50 disabled:opacity-50"
              >
                Cancel Job
              </button>
              <button
                type="button"
                onClick={() => void handleHandover()}
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50"
              >
                {loading ? "Updating..." : "Handover Done"}
              </button>
            </div>
          )}

          {!isPending && !isProcessing && (
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
