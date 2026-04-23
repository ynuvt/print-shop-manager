import type { JobStatus } from "../types";

const CONFIG: Record<JobStatus, { label: string; dot: string; bg: string; text: string; border: string }> = {
  PENDING: {
    label: "Pending",
    dot: "#f59e0b",
    bg: "rgba(245, 158, 11, 0.1)",
    text: "#d97706",
    border: "rgba(245, 158, 11, 0.25)",
  },
  PROCESSING: {
    label: "Processing",
    dot: "#3b82f6",
    bg: "rgba(59, 130, 246, 0.1)",
    text: "#2563eb",
    border: "rgba(59, 130, 246, 0.25)",
  },
  COMPLETED: {
    label: "Completed",
    dot: "#10b981",
    bg: "rgba(16, 185, 129, 0.1)",
    text: "#059669",
    border: "rgba(16, 185, 129, 0.25)",
  },
  REJECTED: {
    label: "Rejected",
    dot: "#ef4444",
    bg: "rgba(239, 68, 68, 0.1)",
    text: "#dc2626",
    border: "rgba(239, 68, 68, 0.25)",
  },
  FAILED: {
    label: "Failed",
    dot: "#ef4444",
    bg: "rgba(239, 68, 68, 0.1)",
    text: "#dc2626",
    border: "rgba(239, 68, 68, 0.25)",
  },
  CANCELED: {
    label: "Canceled",
    dot: "#9ca3af",
    bg: "rgba(156, 163, 175, 0.1)",
    text: "#6b7280",
    border: "rgba(156, 163, 175, 0.25)",
  },
};

export default function StatusBadge({ status }: { status: JobStatus }) {
  const { label, dot, bg, text, border } = CONFIG[status] ?? CONFIG.FAILED;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{
        backgroundColor: bg,
        color: text,
        border: `1px solid ${border}`,
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor: dot,
          ...(status === "PROCESSING" ? { animation: "pulse-soft 1.4s ease-in-out infinite" } : {}),
        }}
      />
      {label}
    </span>
  );
}
