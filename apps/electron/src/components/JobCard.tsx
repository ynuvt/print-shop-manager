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
      className={`
        cursor-pointer select-none list-none rounded-lg border border-l-4 p-3.5
        transition-colors outline-none
        focus-visible:ring-2 focus-visible:ring-blue-500/50
        ${accentClass}
        ${
          selected
            ? "border-gray-300 bg-blue-50 ring-1 ring-blue-400/40 shadow-sm"
            : "border-gray-200 bg-white shadow-sm hover:border-gray-300 hover:shadow"
        }
      `}
    >
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <p className="font-mono text-sm font-bold text-gray-900 leading-none">
          #{job.verificationCode}
        </p>
        <StatusBadge status={job.status} />
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-xs text-gray-500">{job.totalPages} pages</p>
          <p className="text-[10px] text-gray-400">{time}</p>
        </div>
        <p className="font-mono text-sm font-semibold text-gray-900">
          ₹{job.totalCost.toFixed(2)}
        </p>
      </div>
    </li>
  );
}
