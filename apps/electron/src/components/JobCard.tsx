import type { PrintJobSummary, JobStatus } from "../types";
import StatusBadge from "./StatusBadge";

const LEFT_ACCENT: Record<JobStatus, string> = {
  PENDING: "border-l-yellow-500",
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
  const accentClass = LEFT_ACCENT[job.status] ?? "border-l-zinc-700";
  const time = new Date(job.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
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
        "border-l-4",
        "p-3.5",
        "transition-colors",
        "outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-blue-500/50",
        accentClass,
        selected ? "selected" : "",
      ].join(" ")}
    >
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <p className="font-mono text-sm font-bold text-[var(--text)] leading-none">
          #{job.verificationCode}
        </p>
        <StatusBadge status={job.status} />
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-xs text-[var(--text-muted)]">
            {job.totalPages} pages
          </p>
          <p className="text-[10px] text-[var(--text-muted)]">{time}</p>
        </div>
        <p className="font-mono text-sm font-semibold text-[var(--text)]">
          ₹{job.totalCost.toFixed(2)}
        </p>
      </div>
    </li>
  );
}
