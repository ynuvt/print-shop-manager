import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { createPrintJob, registerUser } from "../api/api";
import PrintJobsList from "../components/PrintJobsList";
import {
  calculateFileCost,
  buildJobTotals,
  validateCustomPageRange,
} from "../printing/costCalculator";
import { buildPrintJob } from "../printing/jobBuilder";
import { getPdfPageCount } from "../printing/pdfPageCount";
import { defaultPrintOptions } from "../printing/types";
import type {
  PrintFileState,
  PrintOptions,
  UploadedPrintFile,
} from "../printing/types";
import { uploadToR2 } from "../upload/r2Uploader";
import { getSocket } from "../services/getSocket";

// ─── Option toggle helper ────────────────────────────────────────────────────

function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-lg py-2 text-sm font-medium transition ${
            value === opt.value
              ? "bg-indigo-600 text-white"
              : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Per-file options card ───────────────────────────────────────────────────

function FileCard({
  pf,
  expanded,
  onToggle,
  onUpdate,
  onRemove,
  globalColorMode,
}: {
  pf: PrintFileState;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<PrintOptions>) => void;
  onRemove: () => void;
  globalColorMode: "bw" | "color";
}) {
  const cost = calculateFileCost(pf.detectedPages, {
    ...pf.options,
    colorMode: globalColorMode,
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      {/* Header row */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50"
      >
        <span className="text-xl">📄</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-zinc-900">
            {pf.name}
          </p>
          <p className="text-xs text-zinc-500">
            {pf.detectedPages} pages · ₹{cost}
          </p>
        </div>
        <span className="text-zinc-400">{expanded ? "▾" : "▸"}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 rounded-full p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500"
        >
          ✕
        </button>
      </button>

      {/* Expanded options */}
      {expanded && (
        <div className="space-y-4 border-t border-zinc-100 px-4 py-4">
          <div>
            <p className="mb-2 text-xs font-medium text-zinc-600 uppercase tracking-wide">
              Print Sides
            </p>
            <ToggleGroup
              options={[
                { label: "One Side", value: "one" },
                { label: "Both Sides", value: "both" },
              ]}
              value={pf.options.duplex}
              onChange={(v) => onUpdate({ duplex: v })}
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-zinc-600 uppercase tracking-wide">
              Page Range
            </p>
            <ToggleGroup
              options={[
                { label: "All Pages", value: "all" },
                { label: "Custom", value: "custom" },
              ]}
              value={pf.options.pageRange}
              onChange={(v) => onUpdate({ pageRange: v, customRange: "" })}
            />
            {pf.options.pageRange === "custom" && (
              <div className="mt-2">
                <input
                  type="text"
                  placeholder={`e.g. 1-5, 8, 10-12  (total: ${pf.detectedPages} pages)`}
                  value={pf.options.customRange}
                  onChange={(e) => onUpdate({ customRange: e.target.value })}
                  className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
                    pf.pageRangeError
                      ? "border-red-400 focus:ring-red-300"
                      : "border-zinc-300 focus:ring-indigo-300"
                  }`}
                />
                {pf.pageRangeError && (
                  <p className="mt-1 text-xs text-red-600">
                    {pf.pageRangeError}
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-zinc-600 uppercase tracking-wide">
              Copies
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  onUpdate({ copies: Math.max(1, pf.options.copies - 1) })
                }
                className="h-9 w-9 rounded-lg bg-zinc-100 text-lg font-bold text-zinc-700 hover:bg-zinc-200"
              >
                −
              </button>
              <span className="w-8 text-center text-lg font-semibold text-zinc-900">
                {pf.options.copies}
              </span>
              <button
                type="button"
                onClick={() => onUpdate({ copies: pf.options.copies + 1 })}
                className="h-9 w-9 rounded-lg bg-zinc-100 text-lg font-bold text-zinc-700 hover:bg-zinc-200"
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function HomePage() {
  const [userId, setUserId] = useState<string | null>(() =>
    localStorage.getItem("userId"),
  );
  const [printFiles, setPrintFiles] = useState<PrintFileState[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verificationCode, setVerificationCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [globalColorMode, setGlobalColorMode] = useState<"bw" | "color">("bw");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-register on first visit to obtain a stable userId / token.
  useEffect(() => {
    if (userId) return;
    registerUser()
      .then(({ token }) => {
        localStorage.setItem("userId", token);
        localStorage.setItem("token", token);
        setUserId(token);
      })
      .catch(() =>
        setError("Failed to initialize session. Is the backend running?"),
      );
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    getSocket().emit("join-room", userId);

    return () => {
      getSocket().emit("leave-room", userId);
    };
  }, [userId]);

  // File picker handler: detect PDF pages for every selected file.
  const onFilesSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (!files.length) return;

      const newEntries: PrintFileState[] = await Promise.all(
        files.map(async (file) => ({
          file,
          name: file.name,
          detectedPages: await getPdfPageCount(file),
          options: defaultPrintOptions(),
          pageRangeError: "",
        })),
      );

      setPrintFiles((prev) => [...prev, ...newEntries]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [],
  );

  // Patch options for a specific file, re-running page range validation when relevant.
  const updateOptions = useCallback(
    (
      idx: number,
      patch: Partial<PrintOptions> & { customRangeError?: string },
    ) => {
      setPrintFiles((prev) =>
        prev.map((f, i) => {
          if (i !== idx) return f;
          const merged = { ...f, options: { ...f.options, ...patch } };
          if (
            patch.customRange !== undefined ||
            patch.pageRange !== undefined
          ) {
            const rangeError =
              merged.options.pageRange === "custom"
                ? (validateCustomPageRange(
                    merged.options.customRange,
                    merged.detectedPages,
                  ) ?? "")
                : "";
            return { ...merged, pageRangeError: rangeError };
          }
          return merged;
        }),
      );
    },
    [],
  );

  const removeFile = useCallback((idx: number) => {
    setPrintFiles((prev) => prev.filter((_, i) => i !== idx));
    setExpandedIdx((prev) => (prev === idx ? null : prev));
  }, []);

  // Submit: upload each file to R2, build the job, post to API.
  const onSubmit = async () => {
    if (!userId || !printFiles.length || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    setUploadProgress(printFiles.map(() => 0));

    try {
      const uploadedFiles: UploadedPrintFile[] = [];

      for (let i = 0; i < printFiles.length; i++) {
        const pf = printFiles[i]!;

        const { key, url } = await uploadToR2(pf.file, (pct) => {
          setUploadProgress((prev) => prev.map((v, j) => (j === i ? pct : v)));
        });

        uploadedFiles.push({
          name: pf.name,
          pages: pf.detectedPages,
          url,
          key,
          options: { ...pf.options, colorMode: globalColorMode },
          cost: calculateFileCost(pf.detectedPages, {
            ...pf.options,
            colorMode: globalColorMode,
          }),
        });
      }

      const job = buildPrintJob({ userId, uploadedFiles });
      const result = await createPrintJob(job);

      setVerificationCode(String(result.verificationCode));
      setPrintFiles([]);
      setRefreshTrigger((t) => t + 1);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
      setUploadProgress([]);
    }
  };

  const totals = buildJobTotals(
    printFiles.map((f) => ({
      ...f,
      options: { ...f.options, colorMode: globalColorMode },
    })),
  );
  const hasErrors = printFiles.some(
    (f) =>
      f.pageRangeError ||
      (f.options.pageRange === "custom" && !f.options.customRange.trim()),
  );
  const canSubmit =
    !!userId && printFiles.length > 0 && !hasErrors && !isSubmitting;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 text-zinc-900">
      {/* Navbar */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white font-bold text-lg">
              P
            </div>
            <span className="font-semibold text-zinc-900">PrintOwl</span>
          </div>
          <p className="text-xs text-zinc-500">
            {userId ? "Session active" : "Initializing…"}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        {/* ── Global error ── */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── Success screen ── */}
        {verificationCode ? (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-500 text-4xl text-white">
              ✓
            </div>
            <h2 className="text-2xl font-bold text-zinc-900">
              Print Job Submitted!
            </h2>
            <p className="mt-2 text-zinc-600">
              Show this code at the counter to collect your prints.
            </p>
            <div className="mt-8 rounded-2xl border-2 border-indigo-600 bg-indigo-50 px-10 py-6">
              <p className="text-sm text-zinc-600">Verification Code</p>
              <p className="mt-1 font-mono text-5xl font-bold tracking-widest text-indigo-600">
                {verificationCode}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setVerificationCode(null)}
              className="mt-8 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Print More
            </button>
          </div>
        ) : printFiles.length === 0 ? (
          /* ── Landing / select ── */
          <div className="flex flex-col items-center py-20 text-center">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-44 w-44 flex-col items-center justify-center rounded-full bg-indigo-600 text-white shadow-2xl shadow-indigo-300 transition hover:scale-105 hover:bg-indigo-700 active:scale-95"
            >
              <span className="text-5xl">📄</span>
              <span className="mt-2 text-base font-semibold">Upload PDF</span>
            </button>
            <p className="mt-6 max-w-xs text-sm text-zinc-500">
              Select one or more PDF files. Duplex, copies, and page range can
              be set per file.
            </p>
          </div>
        ) : (
          /* ── Configure + submit ── */
          <>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900">
                Configure Files
              </h2>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                + Add more
              </button>
            </div>

            {/* Global Color Mode */}
            <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-600">
                Color Mode (applies to all files)
              </p>
              <ToggleGroup
                options={[
                  { label: "B&W  ₹2/sheet", value: "bw" },
                  { label: "Color  ₹7/sheet", value: "color" },
                ]}
                value={globalColorMode}
                onChange={setGlobalColorMode}
              />
            </div>

            {/* File cards */}
            <div className="space-y-3">
              {printFiles.map((pf, idx) => (
                <FileCard
                  key={`${pf.name}-${idx}`}
                  pf={pf}
                  expanded={expandedIdx === idx}
                  onToggle={() =>
                    setExpandedIdx((prev) => (prev === idx ? null : idx))
                  }
                  onUpdate={(patch) => updateOptions(idx, patch)}
                  onRemove={() => removeFile(idx)}
                  globalColorMode={globalColorMode}
                />
              ))}
            </div>

            {/* Upload progress bars (shown while submitting) */}
            {isSubmitting && uploadProgress.length > 0 && (
              <div className="mt-4 space-y-2">
                {uploadProgress.map((pct, i) => (
                  <div key={i}>
                    <p className="mb-1 text-xs text-zinc-500 truncate">
                      Uploading {printFiles[i]?.name ?? "file"}… {pct}%
                    </p>
                    <div className="h-1.5 w-full rounded-full bg-zinc-200">
                      <div
                        className="h-1.5 rounded-full bg-indigo-600 transition-all duration-150"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Cost summary */}
            <div className="mt-6 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-700 px-6 py-5 text-white shadow-xl shadow-indigo-200">
              <p className="text-sm text-indigo-200">Total Cost</p>
              <p className="mt-1 text-5xl font-bold">₹{totals.totalCost}</p>
              <p className="mt-2 text-sm text-indigo-200">
                {printFiles.length} {printFiles.length === 1 ? "file" : "files"}{" "}
                · {totals.totalPages} pages · ~{totals.estimatedTime} min
              </p>
            </div>

            {/* Submit */}
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit}
              className={`mt-4 w-full rounded-xl py-4 text-base font-semibold transition ${
                canSubmit
                  ? "bg-green-500 text-white shadow-lg shadow-green-200 hover:bg-green-600"
                  : "cursor-not-allowed bg-zinc-300 text-zinc-500"
              }`}
            >
              {isSubmitting ? "Uploading & Submitting…" : "Confirm & Print"}
            </button>
          </>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          className="sr-only"
          onChange={onFilesSelected}
        />

        {/* ── Print Jobs (below upload section) ── */}
        <PrintJobsList userId={userId} refreshTrigger={refreshTrigger} />
      </main>
    </div>
  );
}
