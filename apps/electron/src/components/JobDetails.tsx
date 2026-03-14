import type { PrintJob } from "../types";
import StatusBadge from "./StatusBadge";

interface JobDetailsProps {
  job: PrintJob | null;
  loading: boolean;
}

export default function JobDetails({ job, loading }: JobDetailsProps) {
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-zinc-500">Loading job…</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 py-10 text-center">
        <div className="text-zinc-700">
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </div>
        <p className="text-sm font-medium text-zinc-500">No job selected</p>
        <p className="text-xs leading-relaxed text-zinc-700">
          Click a job card to view details, or use{" "}
          <span className="text-zinc-500">Find by Code</span> to look up by OTP.
        </p>
      </div>
    );
  }

  const created = new Date(job.createdAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const isActive = job.status === "PROCESSING";
  const isClosed = ["COMPLETED", "REJECTED", "FAILED", "CANCELED"].includes(
    job.status,
  );

  return (
    <div className="flex flex-col divide-y divide-zinc-800">
      {/* Header */}
      <div className="px-5 py-4">
        <div className="mb-1 flex items-start justify-between gap-2">
          <p className="font-mono text-xl font-bold text-zinc-100 leading-none">
            #{job.verificationCode}
          </p>
          <StatusBadge status={job.status} />
        </div>
        <p className="mt-1.5 text-xs text-zinc-600">{created}</p>
      </div>

      {/* Summary */}
      <div className="px-5 py-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
          Summary
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <dt className="text-[11px] text-zinc-600">Total cost</dt>
            <dd className="mt-0.5 font-mono text-sm font-semibold text-zinc-100">
              ₹{job.totalCost.toFixed(2)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-zinc-600">Pages</dt>
            <dd className="mt-0.5 text-sm font-semibold text-zinc-100">
              {job.totalPages}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-zinc-600">Est. time</dt>
            <dd className="mt-0.5 text-sm font-semibold text-zinc-100">
              {job.estimatedTime} min
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-zinc-600">Files</dt>
            <dd className="mt-0.5 text-sm font-semibold text-zinc-100">
              {job.files.length}
            </dd>
          </div>
        </dl>
      </div>

      {/* Files */}
      <div className="px-5 py-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
          Files
        </p>
        <ul className="flex flex-col gap-2">
          {job.files.map((file) => (
            <li
              key={file.url}
              className="rounded-md border border-zinc-800 bg-zinc-950 p-3"
            >
              <p className="truncate text-xs font-medium text-zinc-200">
                {file.name}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-zinc-600">
                <span>{file.pages}p</span>
                <span>·</span>
                <span>{file.option.copies}×</span>
                <span>·</span>
                <span>
                  {file.option.colorMode === "COLOR" ? "Color" : "B/W"}
                </span>
                <span>·</span>
                <span>
                  {file.option.duplex === "BOTH" ? "Duplex" : "Single-sided"}
                </span>
                <span>·</span>
                <span>{file.option.paperSize}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Actions */}
      <div className="px-5 py-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
          Actions
        </p>
        <div className="flex flex-col gap-2">
          {isActive && (
            <>
              <button
                type="button"
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 active:bg-blue-700"
              >
                Approve &amp; Print
              </button>
              <button
                type="button"
                className="rounded-md bg-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:bg-zinc-700"
              >
                Mark Completed
              </button>
              <button
                type="button"
                className="rounded-md border border-zinc-700 px-3 py-2 text-sm font-semibold text-red-400 transition-colors hover:border-red-900/60 hover:bg-red-950/30"
              >
                Reject
              </button>
            </>
          )}
          {isClosed && (
            <p className="text-center text-xs text-zinc-600">
              This job is closed ({job.status.toLowerCase()}).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
