import type { JobStatus } from "../types";

const CONFIG: Record<JobStatus, { label: string; className: string }> = {
  PENDING: {
    label: "Pending",
    className: "text-yellow-700 bg-yellow-50 ring-yellow-200",
  },
  PROCESSING: {
    label: "Processing",
    className: "text-blue-700 bg-blue-50 ring-blue-200",
  },
  COMPLETED: {
    label: "Completed",
    className: "text-emerald-700 bg-emerald-50 ring-emerald-200",
  },
  REJECTED: {
    label: "Rejected",
    className: "text-red-700 bg-red-50 ring-red-200",
  },
  FAILED: {
    label: "Failed",
    className: "text-red-700 bg-red-50 ring-red-200",
  },
  CANCELED: {
    label: "Canceled",
    className: "text-gray-600 bg-gray-100 ring-gray-300",
  },
};

export default function StatusBadge({ status }: { status: JobStatus }) {
  const { label, className } = CONFIG[status] ?? CONFIG.FAILED;
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ring-1 ${className}`}
    >
      {label}
    </span>
  );
}
