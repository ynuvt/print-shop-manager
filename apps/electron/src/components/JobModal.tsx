import { useEffect, useMemo, useState } from "react";
import StatusBadge from "./StatusBadge";
import type { PrintJob, JobStatus, ActivePrintJobState } from "../types";
import type { PrintFileOption } from "@printowl/types";

interface JobModalProps {
  job: PrintJob;
  onClose: () => void;
  onReject: (jobId: string, userId: string) => Promise<void>;
  onStartPrint: (job: PrintJob, printerName: string) => void;
  activePrintState: ActivePrintJobState | null;
  isPrintBusy: boolean;
  printers: { name: string; isDefault: boolean }[];
  selectedPrinter: string;
  selectedColorPrinter: string;
  hasActiveIndicators?: boolean;
}

export default function JobModal({
  job,
  onClose,
  onReject,
  onStartPrint,
  activePrintState,
  isPrintBusy,
  printers,
  selectedPrinter,
  selectedColorPrinter,
  hasActiveIndicators = false,
}: JobModalProps) {
  const [rejectLoading, setRejectLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localPrinter, setLocalPrinter] = useState<string>(selectedPrinter);
  const [showReprintConfirm, setShowReprintConfirm] = useState(false);

  // Is this the job currently printing?
  const isThisJobActive =
    activePrintState !== null && activePrintState.jobId === job.id;
  const printPhase = isThisJobActive ? activePrintState.phase : null;
  const fileProgressMap = isThisJobActive
    ? activePrintState.fileProgressMap
    : {};
  const printProgress = isThisJobActive
    ? activePrintState.printProgress
    : null;

  // Determine displayed status: use live phase if this job is active
  const displayStatus: JobStatus =
    printPhase === "completed" ? "COMPLETED" : job.status;

  useEffect(() => {
    setError(null);

    // Auto-select color printer for COLOR jobs
    const hasColor = job.files.some(
      (f) => (f.option.colorMode || "BW").toUpperCase() === "COLOR",
    );
    setLocalPrinter(hasColor && selectedColorPrinter ? selectedColorPrinter : selectedPrinter);
  }, [job.id, job.files, selectedColorPrinter, selectedPrinter]);

  const printTypeLabel = useMemo(() => {
    const modes = job.files
      .map((f) => (f.option.colorMode || "BW").toUpperCase())
      .filter((m) => m === "BW" || m === "COLOR");
    if (modes.length === 0) return "B/W";
    if (modes.every((m) => m === "BW")) return "B/W";
    if (modes.every((m) => m === "COLOR")) return "Color";
    return "B/W";
  }, [job.files]);

  // Download progress computations
  const entries = Object.values(fileProgressMap);
  const overallPercent =
    entries.length > 0
      ? Math.round(entries.reduce((s, e) => s + e.percent, 0) / job.files.length)
      : 0;
  const completedFileCount = entries.filter((e) => e.percent >= 100).length;

  const isPending = displayStatus === "PENDING";
  const isCompleted = displayStatus === "COMPLETED";
  const isActivePhase = printPhase === "downloading" || printPhase === "printing";

  const created = new Date(job.createdAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  async function handleReject() {
    if (!window.confirm(`Reject job #${job.verificationCode}?`)) return;
    setRejectLoading(true);
    setError(null);
    try {
      await onReject(job.id, job.userId);
      onClose();
    } catch {
      setError("Failed to reject job.");
    } finally {
      setRejectLoading(false);
    }
  }

  function handlePrint() {
    if (!localPrinter) {
      setError("Please select a printer first.");
      return;
    }
    onStartPrint(job, localPrinter);
  }

  // Can this job be printed? Only if no other job is busy, or this job itself is done/failed
  const canPrint =
    !isPrintBusy || (isThisJobActive && (printPhase === "completed" || printPhase === "failed"));

  /** Count how many pages a custom range string like "1,3,5-10" represents */
  function countPagesInRange(rangeStr: string, totalPages: number): number {
    if (!rangeStr.trim()) return totalPages;
    const pages = new Set<number>();
    for (const part of rangeStr.split(",")) {
      const trimmed = part.trim();
      const dashMatch = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
      if (dashMatch) {
        const start = Math.max(1, parseInt(dashMatch[1]!, 10));
        const end = Math.min(totalPages, parseInt(dashMatch[2]!, 10));
        for (let i = start; i <= end; i++) pages.add(i);
      } else {
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num >= 1 && num <= totalPages) pages.add(num);
      }
    }
    return pages.size || totalPages;
  }

  /** Calculate physical sheets for a file based on its print options */
  function getEffectiveSheets(pages: number, opt: PrintFileOption): number {
    // Start with actual pages being printed (custom range reduces this)
    let effectivePages = pages;
    if (opt.pageRange === "CUSTOM" && opt.customRange) {
      effectivePages = countPagesInRange(opt.customRange, pages);
    }
    // Duplex halves the sheet count
    if (opt.duplex === "BOTH") {
      effectivePages = Math.ceil(effectivePages / 2);
    }
    // Copies multiply sheets
    effectivePages *= (opt.copies || 1);
    return effectivePages;
  }

  /** Total effective sheets across all files */
  const totalEffectiveSheets = useMemo(() => {
    return job.files.reduce((sum, file) => {
      const opt: PrintFileOption = file.option ?? {
        paperSize: "A4", colorMode: "BW", orientation: "PORTRAIT",
        scaleMode: "FIT", pageRange: "ALL", duplex: "ONE", copies: 1,
      };
      return sum + getEffectiveSheets(file.pages, opt);
    }, 0);
  }, [job.files]);

  /** Does this job contain any color files? */
  const hasColorFiles = useMemo(() => {
    return job.files.some((f) => (f.option?.colorMode || "BW").toUpperCase() === "COLOR");
  }, [job.files]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ background: "rgba(0,0,0,0.5)" }}
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex w-full max-w-2xl max-h-[90vh] flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          ...(hasActiveIndicators ? { marginRight: "220px" } : {}),
        }}
      >
        {/* ─── Header ─────────────────────────────────── */}
        <div
          className="relative shrink-0 px-6 py-5"
          style={{
            borderBottom: "1px solid var(--border)",
            background: "var(--panel-muted)",
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl font-mono text-sm font-bold text-white shadow-sm"
                style={{ background: "var(--brand)" }}
              >
                <span style={{ color: "var(--panel)" }}>#</span>
              </div>
              <div>
                <h2
                  className="font-mono text-xl font-bold tracking-tight"
                  style={{ color: "var(--text)" }}
                >
                  {job.verificationCode}
                </h2>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{created}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={displayStatus} />
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg p-2 transition hover:opacity-70"
                style={{ color: "var(--text-muted)" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Active phase indicator bar */}
          {isActivePhase && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden" style={{ background: "var(--border)" }}>
              <div
                className="h-full w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full"
                style={{ background: "var(--brand)" }}
              />
            </div>
          )}
        </div>

        {/* ─── Body ───────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Download progress panel */}
          {printPhase === "downloading" && entries.length > 0 && (
            <div
              className="mb-5 rounded-xl p-4"
              style={{
                border: "1px solid rgba(59,130,246,0.3)",
                background: "rgba(59,130,246,0.06)",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex h-5 w-5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-40" />
                    <span className="relative inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-500">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-blue-500">Downloading files</span>
                </div>
                <span className="text-xs font-bold text-blue-400 tabular-nums">
                  {completedFileCount}/{job.files.length} · {overallPercent}%
                </span>
              </div>

              <div className="mb-3 h-1.5 w-full rounded-full overflow-hidden" style={{ background: "rgba(59,130,246,0.15)" }}>
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${overallPercent}%` }}
                />
              </div>

              <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                {Object.entries(fileProgressMap)
                  .sort(([, a], [, b]) => a.fileIndex - b.fileIndex)
                  .map(([fId, entry]) => {
                    const done = entry.percent >= 100;
                    return (
                      <div key={fId} className="flex items-center gap-2">
                        <div className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full ${done ? "bg-emerald-500" : ""}`} style={!done ? { border: "1px solid rgba(59,130,246,0.4)", background: "var(--panel)" } : {}}>
                          {done ? (
                            <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                          ) : (
                            <div className="h-1 w-1 rounded-full bg-blue-400 animate-pulse" />
                          )}
                        </div>
                        <span className="flex-1 truncate text-[11px]" style={{ color: done ? "var(--text-muted)" : "var(--text)", fontWeight: done ? 400 : 500 }}>{entry.fileName}</span>
                        <span className={`shrink-0 text-[10px] tabular-nums font-semibold ${done ? "text-emerald-500" : "text-blue-500"}`}>{entry.percent}%</span>
                        <div className="w-16 shrink-0 h-1 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                          <div className={`h-full rounded-full transition-all duration-200 ${done ? "bg-emerald-400" : "bg-blue-500"}`} style={{ width: `${entry.percent}%` }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Print progress panel */}
          {printPhase === "printing" && printProgress && (
            <div
              className="mb-5 rounded-xl p-4"
              style={{
                border: "1px solid rgba(139,92,246,0.3)",
                background: "rgba(139,92,246,0.06)",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="relative flex h-5 w-5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-40" />
                    <span className="relative inline-flex h-5 w-5 items-center justify-center rounded-full bg-violet-500">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 6 2 18 2 18 9" />
                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                        <rect x="6" y="14" width="12" height="8" />
                      </svg>
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-violet-500">{printProgress.fileName ?? "Sending to printer…"}</span>
                </div>
                <span className="text-xs font-bold text-violet-400 tabular-nums">{printProgress.percent}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "rgba(139,92,246,0.15)" }}>
                <div className="h-full rounded-full bg-violet-500 transition-all duration-300" style={{ width: `${printProgress.percent}%` }} />
              </div>
            </div>
          )}

          {/* Completed banner */}
          {printPhase === "completed" && (
            <div
              className="mb-5 flex items-center gap-3 rounded-xl p-4"
              style={{
                border: "1px solid rgba(16,185,129,0.3)",
                background: "rgba(16,185,129,0.06)",
              }}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-500">All files sent to printer</p>
                <p className="text-xs text-emerald-400 mt-0.5">Job #{job.verificationCode} completed successfully</p>
              </div>
            </div>
          )}

          {/* Failed banner */}
          {printPhase === "failed" && (
            <div
              className="mb-5 flex items-center gap-3 rounded-xl p-4"
              style={{
                border: "1px solid rgba(239,68,68,0.3)",
                background: "rgba(239,68,68,0.06)",
              }}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-red-500">Print failed</p>
                <p className="text-xs text-red-400 mt-0.5">{activePrintState?.error || "An error occurred"}</p>
              </div>
            </div>
          )}

          {/* Summary cards */}
          <div className="mb-5 grid grid-cols-3 gap-3">
            <div
              className="rounded-xl p-4 text-center"
              style={{ border: "1px solid var(--border)", background: "var(--panel-muted)" }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Total Cost</p>
              <p className="mt-1.5 font-mono text-xl font-bold" style={{ color: "var(--text)" }}>₹{job.totalCost.toFixed(2)}</p>
            </div>
            <div
              className="rounded-xl p-4 text-center"
              style={{ border: "1px solid var(--border)", background: "var(--panel-muted)" }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Sheets</p>
              <p className="mt-1.5 text-xl font-bold" style={{ color: "var(--text)" }}>{totalEffectiveSheets}</p>
              {totalEffectiveSheets !== job.totalPages && (
                <p className="mt-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>{job.totalPages} pages</p>
              )}
            </div>
            <div
              className="rounded-xl p-4 text-center"
              style={{
                border: hasColorFiles ? "1px solid rgba(245,158,11,0.4)" : "1px solid var(--border)",
                background: hasColorFiles ? "rgba(245,158,11,0.08)" : "var(--panel-muted)",
              }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: hasColorFiles ? "#d97706" : "var(--text-muted)" }}>Print Type</p>
              <p className="mt-1.5 text-xl font-bold" style={{ color: hasColorFiles ? "#d97706" : "var(--text)" }}>{printTypeLabel}</p>
            </div>
          </div>

          {/* Files list */}
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Files ({job.files.length})
            </p>
            <ul className="flex flex-col gap-3">
              {job.files.map((file) => {
                const opt: PrintFileOption = file.option ?? {
                  paperSize: "A4", colorMode: "BW", orientation: "PORTRAIT",
                  scaleMode: "FIT", pageRange: "ALL", duplex: "ONE", copies: 1,
                };
                const isColor = (opt.colorMode || "BW").toUpperCase() === "COLOR";
                const sheets = getEffectiveSheets(file.pages, opt);
                return (
                  <li
                    key={file.url}
                    className="rounded-xl p-4 transition"
                    style={{
                      border: isColor ? "1px solid rgba(245,158,11,0.4)" : "1px solid var(--border)",
                      background: isColor ? "rgba(245,158,11,0.05)" : "var(--panel)",
                      borderLeft: isColor ? "4px solid #f59e0b" : undefined,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                          style={{
                            border: isColor ? "1px solid rgba(245,158,11,0.3)" : "1px solid var(--border)",
                            background: isColor ? "rgba(245,158,11,0.12)" : "var(--panel-muted)",
                            color: isColor ? "#d97706" : "var(--text-muted)",
                          }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{file.name}</p>
                          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                            {sheets} sheet{sheets !== 1 ? "s" : ""}
                            {sheets !== file.pages && <span className="opacity-60"> ({file.pages} pages)</span>}
                          </p>
                        </div>
                      </div>
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition hover:opacity-80"
                        style={{ border: "1px solid var(--border)", color: "var(--brand)" }}
                      >
                        View File
                      </a>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {[
                        opt.paperSize,
                        opt.colorMode === "COLOR" ? "Color" : "B&W",
                        opt.duplex === "BOTH" ? "Duplex" : "Single",
                        opt.orientation === "LANDSCAPE" ? "Landscape" : "Portrait",
                        ...(opt.pageRange === "CUSTOM" ? [opt.customRange || "Custom"] : []),
                      ].map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            background: "var(--panel-muted)",
                            color: "var(--text-muted)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                      <span
                        className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          background: "var(--brand-light)",
                          color: "var(--brand)",
                          border: "1px solid var(--brand-light)",
                        }}
                      >
                        {opt.copies}× copies
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* ─── Footer ─────────────────────────────────── */}
        <div
          className="shrink-0 px-6 py-4"
          style={{
            borderTop: "1px solid var(--border)",
            background: "var(--panel-muted)",
          }}
        >
          {error && (
            <p className="mb-3 text-xs" style={{ color: "var(--error)" }}>{error}</p>
          )}

          {/* Printer selector — show when can print */}
          {(isPending || isCompleted) && !isActivePhase && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="printer-select"
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  Printer
                </label>
                {printTypeLabel === "Color" && (
                  <span className="text-[10px] font-medium" style={{ color: "var(--success)" }}>✓ Color auto-selected</span>
                )}
              </div>
              <select
                id="printer-select"
                value={localPrinter}
                onChange={(e) => setLocalPrinter(e.target.value)}
                className="select-input w-full rounded-xl px-3 py-2.5 text-sm font-medium outline-none"
              >
                <option value="">Choose a printer…</option>
                {printers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                    {p.isDefault ? " (Default)" : ""}
                    {p.name === selectedColorPrinter ? " 🎨" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Action buttons */}
          {isPending && !isActivePhase && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleReject()}
                disabled={rejectLoading || isPrintBusy}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition hover:opacity-80 disabled:opacity-50"
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--panel)",
                  color: "var(--error)",
                }}
              >
                Reject
              </button>
              <button
                type="button"
                onClick={handlePrint}
                disabled={!canPrint}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                style={{ background: "var(--brand)", color: "var(--panel)" }}
              >
                {isPrintBusy && !isThisJobActive ? "Printer Busy" : "Print Job"}
              </button>
            </div>
          )}

          {isActivePhase && (
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition hover:opacity-80"
              style={{
                border: "1px solid var(--border)",
                background: "var(--panel)",
                color: "var(--text-muted)",
              }}
            >
              Close — printing continues in background
            </button>
          )}

          {isCompleted && !isActivePhase && (
            <div className="flex flex-col gap-2">
              {!showReprintConfirm ? (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition hover:opacity-80"
                    style={{
                      border: "1px solid var(--border)",
                      background: "var(--panel)",
                      color: "var(--text-muted)",
                    }}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReprintConfirm(true)}
                    disabled={isPrintBusy && !isThisJobActive}
                    className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition hover:opacity-80 active:scale-[0.98] disabled:opacity-50"
                    style={{
                      border: "1.5px dashed var(--text-muted)",
                      background: "transparent",
                      color: "var(--text-muted)",
                    }}
                  >
                     Reprint
                  </button>
                </div>
              ) : (
                <div
                  className="rounded-xl p-3"
                  style={{ background: "var(--panel-muted)", border: "1px solid var(--border)" }}
                >
                  <p className="mb-3 text-center text-sm font-medium" style={{ color: "var(--text)" }}>
                    Are you sure you want to print this job again?
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowReprintConfirm(false)}
                      className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition hover:opacity-80"
                      style={{
                        border: "1px solid var(--border)",
                        background: "var(--panel)",
                        color: "var(--text-muted)",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowReprintConfirm(false);
                        handlePrint();
                      }}
                      className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 active:scale-[0.98]"
                      style={{ background: "var(--brand)" }}
                    >
                      Yes, Print Again
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!isPending && !isCompleted && !isActivePhase && (
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition hover:opacity-80"
              style={{
                border: "1px solid var(--border)",
                background: "var(--panel)",
                color: "var(--text-muted)",
              }}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
