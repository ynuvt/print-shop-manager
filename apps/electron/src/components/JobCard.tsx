import type { PrintJobSummary, JobStatus } from "../types";
import StatusBadge from "./StatusBadge";

const ACCENT: Record<JobStatus, string> = {
  PENDING: "border-l-amber-400",
  PROCESSING: "border-l-blue-500",
  COMPLETED: "border-l-emerald-500",
  REJECTED: "border-l-red-400",
  FAILED: "border-l-red-400",
  CANCELED: "border-l-gray-300",
};

interface JobCardProps {
  job: PrintJobSummary;
  selected: boolean;
  onSelect: () => void;
}

export default function JobCard({ job, selected, onSelect }: JobCardProps) {
  const accentClass = ACCENT[job.status] ?? "border-l-gray-300";
  const time = new Date(job.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const date = new Date(job.createdAt).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });

  return (
    <li
      role="button"
      tabIndex={0}
      aria-selected={selected}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      className={[
        "job-card",
        "cursor-pointer",
        "select-none",
        "list-none",
        "border",
        "border-l-[3px]",
        "p-3.5",
        "outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-[var(--brand)]/30",
        accentClass,
        selected ? "selected" : "",
      ].join(" ")}
    >
      {/* Top row: code + badge */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--panel-muted)] font-mono text-[10px] font-bold text-[var(--text-muted)]">
            #
          </span>
          <p className="font-mono text-sm font-bold text-[var(--text)] leading-none tracking-tight">
            {job.verificationCode}
          </p>
        </div>
        <StatusBadge status={job.status} />
      </div>

      {/* Bottom row: details + cost */}
      <div className="flex items-end justify-between gap-2">
        <div className="space-y-0.5">
          <p className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            {job.totalPages} page{job.totalPages !== 1 ? "s" : ""}
          </p>
          <p className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            {date} · {time}
          </p>
        </div>
        <p className="font-mono text-base font-bold text-[var(--text)]">
          ₹{job.totalCost.toFixed(2)}
        </p>
      </div>
    </li>
  );
}
