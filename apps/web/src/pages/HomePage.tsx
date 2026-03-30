import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import type { PrintFileOption as PrintOptions } from "@printowl/types";
import {
  FileText,
  Moon,
  SlidersHorizontal,
  Sun,
  Upload,
  X,
} from "lucide-react";
import Turnstile from "react-turnstile";
import { createPrintJobFromFiles, registerUser } from "../api/api";
import PrintJobsList from "../components/PrintJobsList";
import {
  buildJobTotals,
  calculateFileCost,
  validateCustomPageRange,
} from "../printing/costCalculator";
import { getPdfPageCount } from "../printing/pdfPageCount";
import { defaultPrintOptions } from "../printing/types";
import type { PrintFileState } from "../printing/types";
import { getSocket } from "../services/getSocket";
import type { ThemeMode } from "../App";

const MAX_UPLOAD_MB = 50;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

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
    <div className="toggle-group" role="radiogroup">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={value === opt.value ? "toggle-item active" : "toggle-item"}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

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
  globalColorMode: "BW" | "COLOR";
}) {
  const cost = calculateFileCost(pf.detectedPages, {
    ...pf.options,
    colorMode: globalColorMode,
  });

  return (
    <article className="upload-file-card">
      <div className="upload-file-head">
        <button type="button" className="upload-file-title" onClick={onToggle}>
          <div className="file-icon" aria-hidden="true">
            <FileText size={18} />
          </div>
          <div>
            <p>{pf.name}</p>
            <span>
              {pf.detectedPages} pages • Rs {cost}
            </span>
            <span className="file-edit-hint">
              <SlidersHorizontal size={12} />
              Tap file to edit details
            </span>
          </div>
        </button>
        <button
          type="button"
          className="icon-btn remove-file-btn"
          onClick={onRemove}
          aria-label="Remove file"
        >
          <X size={16} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>

      {expanded && (
        <div className="upload-file-body">
          <div>
            <p className="field-label">Print Sides</p>
            <ToggleGroup
              options={[
                { label: "One Side", value: "ONE" },
                { label: "Both Sides", value: "BOTH" },
              ]}
              value={pf.options.duplex}
              onChange={(v) => onUpdate({ duplex: v })}
            />
          </div>

          <div>
            <p className="field-label">Orientation</p>
            <ToggleGroup
              options={[
                { label: "Vertical", value: "PORTRAIT" },
                { label: "Horizontal", value: "LANDSCAPE" },
              ]}
              value={pf.options.orientation}
              onChange={(v) => onUpdate({ orientation: v })}
            />
          </div>

          <div>
            <p className="field-label">Scale</p>
            <ToggleGroup
              options={[
                { label: "Fit to paper", value: "FIT" },
                { label: "Shrink", value: "SHRINK" },
                { label: "Original size", value: "NOSCALE" },
              ]}
              value={pf.options.scaleMode}
              onChange={(v) => onUpdate({ scaleMode: v })}
            />
          </div>

          <div>
            <p className="field-label">Page Range</p>
            <ToggleGroup
              options={[
                { label: "All Pages", value: "ALL" },
                { label: "Custom", value: "CUSTOM" },
              ]}
              value={pf.options.pageRange}
              onChange={(v) => onUpdate({ pageRange: v, customRange: "" })}
            />

            {pf.options.pageRange === "CUSTOM" && (
              <div className="field-spacing">
                <input
                  type="text"
                  value={pf.options.customRange}
                  onChange={(e) => onUpdate({ customRange: e.target.value })}
                  placeholder={`1-5, 8, 10-12 (total ${pf.detectedPages} pages)`}
                  className={
                    pf.pageRangeError ? "text-input invalid" : "text-input"
                  }
                />
                {pf.pageRangeError && (
                  <p className="field-error">{pf.pageRangeError}</p>
                )}
              </div>
            )}
          </div>

          <div>
            <p className="field-label">Copies</p>
            <div className="counter">
              <button
                type="button"
                onClick={() =>
                  onUpdate({ copies: Math.max(1, pf.options.copies - 1) })
                }
              >
                -
              </button>
              <span>{pf.options.copies}</span>
              <button
                type="button"
                onClick={() => onUpdate({ copies: pf.options.copies + 1 })}
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

export default function HomePage({
  theme,
  onToggleTheme,
}: {
  theme: ThemeMode;
  onToggleTheme: () => void;
}) {
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
  const [globalColorMode, setGlobalColorMode] = useState<"BW" | "COLOR">("BW");
  const [isDragActive, setIsDragActive] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (userId) return;

    registerUser()
      .then(({ token, userId }) => {
        localStorage.setItem("userId", userId);
        localStorage.setItem("token", token);
        setUserId(userId);
      })
      .catch(() => {
        setError("Failed to initialize session. Please verify API is running.");
      });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    getSocket().emit("join-room", userId);
    return () => {
      getSocket().emit("leave-room", userId);
    };
  }, [userId]);

  const processFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;

    const oversizedFiles = files.filter((file) => file.size > MAX_UPLOAD_BYTES);
    if (oversizedFiles.length > 0) {
      const names = oversizedFiles.map((file) => file.name).join(", ");
      setError(
        `File too large (max ${MAX_UPLOAD_MB} MB each): ${names}.`,
      );
      return;
    }

    setError(null);

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
  }, []);

  const onFilesSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      await processFiles(files);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [processFiles],
  );

  const onDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragActive(false);

      const dropped = Array.from(event.dataTransfer.files).filter((file) =>
        file.name.toLowerCase().endsWith(".pdf"),
      );
      await processFiles(dropped);
    },
    [processFiles],
  );

  const updateOptions = useCallback(
    (idx: number, patch: Partial<PrintOptions>) => {
      setPrintFiles((prev) =>
        prev.map((f, i) => {
          if (i !== idx) return f;

          const merged = { ...f, options: { ...f.options, ...patch } };
          if (
            patch.customRange !== undefined ||
            patch.pageRange !== undefined
          ) {
            const rangeError =
              merged.options.pageRange === "CUSTOM"
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

  const onSubmit = async () => {
    if (!userId || !printFiles.length || isSubmitting) return;

    if (!captchaToken) {
      setError("Please complete the CAPTCHA verification");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setUploadProgress(printFiles.map(() => 0));

    try {
      const files = printFiles.map((pf) => pf.file);
      const fileOptions = printFiles.map((pf) => ({
        ...pf.options,
        colorMode: globalColorMode,
      }));

      const result = await createPrintJobFromFiles(
        files,
        fileOptions,
        (pct) => {
          setUploadProgress((prev) => prev.map(() => pct));
        },
        captchaToken,
      );

      setVerificationCode(String(result.verificationCode));
      setPrintFiles([]);
      setExpandedIdx(null);
      setCaptchaToken(null);
      setRefreshTrigger((t) => t + 1);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
      // Reset CAPTCHA token on error so user must complete challenge again
      setCaptchaToken(null);
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
      (f.options.pageRange === "CUSTOM" && !f.options.customRange.trim()),
  );

  const canSubmit =
    !!userId &&
    printFiles.length > 0 &&
    !hasErrors &&
    !isSubmitting &&
    !!captchaToken;
  const successDigits = verificationCode ? verificationCode.split("") : [];

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand-row">
          <img
            src="/img/PrintLogoHourglass (1).webp"
            alt="XOPY logo"
            className="brand-mark"
          />
          <div>
            <p className="brand-title">XOPY</p>
            <span className="brand-subtitle">
              {userId ? "Session active" : "Preparing session..."}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="theme-btn icon-theme-btn"
          onClick={onToggleTheme}
          aria-label={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
          title={theme === "dark" ? "Light mode" : "Dark mode"}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>

      <main className="main-wrap">
        {error && <div className="banner-error">{error}</div>}

        <section className="hero-panel">
          <div className="print-mode-top">
            <p className="field-label">Print Type</p>
            <ToggleGroup
              options={[
                { label: "Color Print", value: "COLOR" },
                { label: "B/W Print", value: "BW" },
              ]}
              value={globalColorMode}
              onChange={setGlobalColorMode}
            />
            <p className="color-mode-note">
              Note: All files in this job will be printed as
              {" "}
              {globalColorMode === "COLOR" ? "Color" : "B/W"}
              {" "}
              based on this top selection.
            </p>
          </div>

          <div className="hero-header">
            <h1>Upload Documents</h1>
            <p>Color or B/W printing with per-file settings.</p>
          </div>

          {verificationCode ? (
            <div className="success-card">
              <p>Job submitted successfully</p>
              <div
                className="otp-digits"
                aria-label={`Verification code ${verificationCode}`}
              >
                {successDigits.map((digit, idx) => (
                  <div key={`${digit}-${idx}`} className="otp-digit">
                    {digit}
                  </div>
                ))}
              </div>
              <span>Show this verification code at the counter.</span>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setVerificationCode(null)}
              >
                Create More Jobs
              </button>
            </div>
          ) : (
            <>
              <div
                className={
                  isDragActive ? "upload-dropzone active" : "upload-dropzone"
                }
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragActive(true);
                }}
                onDragLeave={() => setIsDragActive(false)}
                onDrop={onDrop}
              >
                <button
                  type="button"
                  className="upload-circle"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload
                    size={34}
                    strokeWidth={2.2}
                    className="upload-circle-icon"
                  />
                  <span className="upload-circle-label">Upload PDF</span>
                </button>
                <p>Drag and drop or tap to browse.</p>
              </div>

              {printFiles.length > 0 && (
                <>
                  <div className="section-head">
                    <h2>File Options</h2>
                    <button
                      type="button"
                      className="ghost-link"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Add More
                    </button>
                  </div>

                  <div className="upload-file-list">
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

                  {isSubmitting && uploadProgress.length > 0 && (
                    <div className="progress-wrap">
                      {uploadProgress.map((pct, i) => (
                        <div key={i} className="progress-row">
                          <p>
                            Uploading {printFiles[i]?.name ?? "file"}... {pct}%
                          </p>
                          <div className="progress-track">
                            <span style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="summary-card">
                    <p>Total</p>
                    <strong>Rs {totals.totalCost}</strong>
                    <span>
                      {printFiles.length} file(s) • {totals.totalPages} pages •{" "}
                      {totals.estimatedTime} min
                    </span>
                  </div>

                  <div
                    className="cf-turnstile-wrapper"
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      marginBottom: "0.2rem",
                      marginTop: "1.2rem",
                    }}
                  >
                    <Turnstile
                      sitekey={
                        import.meta.env.VITE_TURNSTILE_SITE_KEY ||
                        "0x4AAAAAACuh4ffhEY5SnUoU"
                      }
                      onSuccess={(token) => setCaptchaToken(token)}
                      onError={() => {
                        setCaptchaToken(null);
                        setError(
                          "CAPTCHA verification failed. Please try again.",
                        );
                      }}
                      theme="light"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={onSubmit}
                    disabled={!canSubmit}
                    className={
                      canSubmit
                        ? "btn btn-primary submit-btn"
                        : "btn btn-disabled submit-btn"
                    }
                  >
                    {isSubmitting
                      ? "Uploading and Submitting..."
                      : "Confirm and Print"}
                  </button>
                </>
              )}
            </>
          )}
        </section>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden-input"
          onChange={onFilesSelected}
        />

        <PrintJobsList userId={userId} refreshTrigger={refreshTrigger} />
      </main>
    </div>
  );
}
