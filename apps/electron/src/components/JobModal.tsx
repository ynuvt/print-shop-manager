import { useEffect, useMemo, useState } from "react";
import StatusBadge from "./StatusBadge";
import type { PrintJob, JobStatus, File } from "../types";
import type { PrintFileOption } from "@printowl/types";

interface JobModalProps {
  job: PrintJob;
  onClose: () => void;
  onStatusUpdate: (
    jobId: string,
    userId: string,
    newStatus: "PROCESSING" | "COMPLETED" | "REJECTED" | "FAILED",
  ) => Promise<void>;
  printers: { name: string; isDefault: boolean }[];
  selectedPrinter: string;
  onPrinterChange: (printer: string) => void;
  selectedColorPrinter: string;
  onColorPrinterChange: (printer: string) => void;
}

const OPTION_LABELS = {
  colorMode: { BW: "B&W", COLOR: "Color" },
  duplex: { ONE: "Single-sided", BOTH: "Duplex" },
  pageRange: { ALL: "All pages", CUSTOM: "Custom range" },
  orientation: { PORTRAIT: "Vertical", LANDSCAPE: "Horizontal" },
  scaleMode: {
    FIT: "Fit to paper",
    NOSCALE: "Original size",
  },
};

export default function JobModal({
  job,
  onClose,
  onStatusUpdate,
  printers,
  selectedPrinter,
  onPrinterChange,
  selectedColorPrinter,
  onColorPrinterChange,
}: JobModalProps) {
  const [currentStatus, setCurrentStatus] = useState<JobStatus>(job.status);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadedFiles, setDownloadedFiles] = useState<string[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<{
    fileIndex: number;
    totalFiles: number;
    percent: number;
    fileName?: string;
  } | null>(null);
  const [printProgress, setPrintProgress] = useState<{
    fileIndex: number;
    totalFiles: number;
    percent: number;
    fileName?: string;
  } | null>(null);
  // Local printer selection for THIS job only (doesn't affect global state)
  const [localPrinterSelection, setLocalPrinterSelection] =
    useState<string>(selectedPrinter);

  useEffect(() => {
    setCurrentStatus(job.status);

    // Reset progress state when a new job is loaded
    setDownloadProgress(null);
    setPrintProgress(null);
    setError(null);

    // Auto-select color printer LOCALLY for COLOR jobs only (doesn't affect global state)
    const hasColorFiles = job.files.some(
      (f) => (f.option.colorMode || "BW").toUpperCase() === "COLOR",
    );

    if (hasColorFiles && selectedColorPrinter) {
      console.log(
        "Color job detected, auto-selecting color printer (LOCAL):",
        selectedColorPrinter,
      );
      setLocalPrinterSelection(selectedColorPrinter);
    } else {
      // For B&W jobs, use the global printer selection
      console.log("B&W job detected, using global printer:", selectedPrinter);
      setLocalPrinterSelection(selectedPrinter);
    }
  }, [job.id, job.files, selectedColorPrinter, selectedPrinter]);

  useEffect(() => {
    const offDownload = window.electronAPI?.onDownloadProgress?.((payload) => {
      setDownloadProgress(payload);
    });

    const offPrint = window.electronAPI?.onPrintProgress?.((payload) => {
      setPrintProgress(payload);
    });

    return () => {
      offDownload?.();
      offPrint?.();
    };
  }, []);

  const printTypeLabel = useMemo(() => {
    const modes = job.files
      .map((f) => (f.option.colorMode || "BW").toUpperCase())
      .filter((mode) => mode === "BW" || mode === "COLOR");

    if (modes.length === 0) return "B/W";
    if (modes.every((mode) => mode === "BW")) return "B/W";
    if (modes.every((mode) => mode === "COLOR")) return "Color";
    return "Mixed";
  }, [job.files]);

  const isPending = currentStatus === "PENDING";
  const isProcessing = currentStatus === "PROCESSING";
  const isCompleted = currentStatus === "COMPLETED";

  const created = new Date(job.createdAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  async function handleReject() {
    const confirmed = window.confirm(
      `Are you sure you want to reject job #${job.verificationCode}?`,
    );
    if (!confirmed) return;

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
    if (!localPrinterSelection) {
      setError("Please select a printer first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onStatusUpdate(job.id, job.userId, "PROCESSING");
      setCurrentStatus("PROCESSING");

      // Download files to temp folder
      setDownloadProgress({
        fileIndex: 0,
        totalFiles: job.files.length,
        percent: 0,
      });
      const files = job.files.map((f: File) => ({ url: f.url, name: f.name }));
      const paths = await window.electronAPI.downloadFiles(files);
      setDownloadedFiles(paths);

      // Print each file with its options
      for (let i = 0; i < paths.length; i++) {
        const filePath = paths[i];
        const file = job.files[i];
        if (!filePath || !file) continue;

        setPrintProgress({
          fileIndex: i,
          totalFiles: paths.length,
          percent: 0,
          fileName: file.name,
        });

        const fileOption: PrintFileOption = file.option ?? {
          paperSize: "A4",
          colorMode: "BW",
          orientation: "PORTRAIT",
          scaleMode: "FIT",
          pageRange: "ALL",
          duplex: "ONE",
          copies: 1,
        };

        const customPages =
          fileOption.pageRange === "CUSTOM"
            ? fileOption.customRange?.trim()
            : undefined;

        const isDuplex = fileOption.duplex === "BOTH";

        const options = {
          // Ensure printer receives normalized values for all configurable settings.
          copies: Math.max(1, Number(fileOption.copies) || 1),
          paperSize: "A4",
          // pdf-to-printer uses `side`; keep `duplex` too for adapter compatibility.
          side: isDuplex ? "duplexlong" : "simplex",
          duplex: isDuplex ? "Duplex" : "Simplex",
          monochrome: fileOption.colorMode !== "COLOR",
          orientation:
            fileOption.orientation === "LANDSCAPE" ? "landscape" : "portrait",
          scale:
            fileOption.scaleMode === "NOSCALE"
              ? "noscale"
              : fileOption.scaleMode === "SHRINK"
                ? "shrink"
                : "fit",
          ...(customPages ? { pages: customPages } : {}),
        };

        await window.electronAPI.printPDF(
          filePath,
          localPrinterSelection,
          options,
          {
            fileIndex: i,
            totalFiles: paths.length,
          },
        );
      }
    } catch (err) {
      setError("Failed to start printing. Please try again.");
      console.error("Print error:", err);
    } finally {
      setLoading(false);
      setDownloadProgress(null);
      setPrintProgress(null);
    }
  }

  async function handleHandover() {
    setLoading(true);
    setError(null);
    try {
      await onStatusUpdate(job.id, job.userId, "COMPLETED");

      // Delete downloaded files from temp folder
      if (downloadedFiles.length > 0) {
        await window.electronAPI.deleteFiles(downloadedFiles);
        setDownloadedFiles([]);
      }

      onClose();
    } catch (err) {
      setError("Failed to update status. Please try again.");
      console.error("Handover error:", err);
    } finally {
      setLoading(false);
      setDownloadProgress(null);
      setPrintProgress(null);
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
          {(downloadProgress || printProgress) && (
            <div className="mb-4 rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="text-sm font-medium text-gray-700">
                {downloadProgress
                  ? `Downloading ${downloadProgress.fileName ?? ""} (${downloadProgress.fileIndex + 1}/${downloadProgress.totalFiles}) — ${downloadProgress.percent}%`
                  : `Printing ${printProgress?.fileName ?? ""} (${printProgress?.fileIndex! + 1}/${printProgress?.totalFiles}) — ${printProgress?.percent}%`}
              </p>
              <div className="mt-2 h-2 w-full rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{
                    width: `${(downloadProgress ?? printProgress)?.percent ?? 0}%`,
                  }}
                />
              </div>
            </div>
          )}

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
                Print Type
              </p>
              <p className="mt-1 text-lg font-bold text-gray-900">
                {printTypeLabel}
              </p>
            </div>
          </div>

          {/* Files */}
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              Files ({job.files.length})
            </p>
            <ul className="flex flex-col gap-3">
              {job.files.map((file) => (
                <li
                  key={file.url}
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
                    {(() => {
                      const option: PrintFileOption = file.option ?? {
                        paperSize: "A4",
                        colorMode: "BW",
                        orientation: "PORTRAIT",
                        scaleMode: "FIT",
                        pageRange: "ALL",
                        duplex: "ONE",
                        copies: 1,
                      };
                      const colorModeLabel =
                        option.colorMode === "COLOR" ? "Color" : "B&W";
                      const duplexLabel =
                        option.duplex === "BOTH" ? "Duplex" : "Single-sided";
                      const orientationLabel =
                        option.orientation === "LANDSCAPE"
                          ? OPTION_LABELS.orientation.LANDSCAPE
                          : OPTION_LABELS.orientation.PORTRAIT;
                      const scaleLabel =
                        option.scaleMode === "NOSCALE"
                          ? OPTION_LABELS.scaleMode.NOSCALE
                          : option.scaleMode === "SHRINK"
                            ? OPTION_LABELS.scaleMode.SHRINK
                            : OPTION_LABELS.scaleMode.FIT;
                      const pageRangeLabel =
                        option.pageRange === "CUSTOM"
                          ? `Custom range${option.customRange ? ` (${option.customRange})` : ""}`
                          : "All pages";

                      return (
                        <>
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-600">
                            {option.paperSize}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-600">
                            {colorModeLabel}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-600">
                            {duplexLabel}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-600">
                            {orientationLabel}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-600">
                            {scaleLabel}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-600">
                            {pageRangeLabel}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
                            {option.copies}× copies
                          </span>
                        </>
                      );
                    })()}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Fixed footer ────────────────────────────── */}
        <div className="shrink-0 rounded-b-2xl border-t border-gray-200 bg-gray-50 px-6 py-4">
          {error && <p className="mb-3 text-xs text-red-500">{error}</p>}

          {/* Printer Selection */}
          {(isPending || isProcessing || isCompleted) && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="printer-select"
                  className="block text-sm font-medium text-gray-700"
                >
                  Select Printer
                </label>
                {printTypeLabel === "Color" && (
                  <span className="text-xs text-green-600 font-medium">
                    ✓ Color printer auto-selected
                  </span>
                )}
              </div>
              <select
                id="printer-select"
                value={localPrinterSelection}
                onChange={(e) => setLocalPrinterSelection(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Choose a printer...</option>
                {printers.map((printer) => (
                  <option key={printer.name} value={printer.name}>
                    {printer.name}
                    {printer.isDefault ? " (Default)" : ""}
                    {printer.name === selectedColorPrinter ? " 🎨 Color" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

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
                onClick={() => void handlePrint()}
                disabled={loading}
                className="flex-1 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 active:bg-violet-700 disabled:opacity-50"
              >
                {loading ? "Updating..." : "Print Again"}
              </button>
              <button
                type="button"
                onClick={() => void handleHandover()}
                disabled={loading}
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50"
              >
                {loading ? "Updating..." : "Handover Done"}
              </button>
            </div>
          )}

          {isCompleted && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => void handlePrint()}
                disabled={loading}
                className="flex-1 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 active:bg-violet-700 disabled:opacity-50"
              >
                {loading ? "Updating..." : "Print Again"}
              </button>
            </div>
          )}

          {!isPending && !isProcessing && !isCompleted && (
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
