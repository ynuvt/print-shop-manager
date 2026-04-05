import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FileText, SlidersHorizontal, X } from "lucide-react";
import type { PrintFileOption } from "@printowl/types";
import {
  getPrintJobByIdPublic,
  registerUser,
  submitWhatsappJobReview,
} from "../api/api";
import {
  calculateFileCost,
  validateCustomPageRange,
} from "../printing/costCalculator";
import { defaultPrintOptions } from "../printing/types";
import { calculateEstimatedTime } from "@printowl/shared-utils";
import { useNotifications } from "../components/NotificationCenter";

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
          data-value={opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

type ReviewFileState = {
  id: string;
  name: string;
  pages: number;
  url: string;
  options: PrintFileOption;
  pageRangeError: string;
};

function normalizeOptions(
  options: PrintFileOption | null | undefined,
): PrintFileOption {
  if (!options) return defaultPrintOptions();
  return {
    ...defaultPrintOptions(),
    ...options,
    customRange: options.customRange ?? "",
  };
}

export default function ReviewPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [jobTitle, setJobTitle] = useState<string>("");
  const [files, setFiles] = useState<ReviewFileState[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verificationCode, setVerificationCode] = useState<string | null>(null);
  const { notify } = useNotifications();
  const [userId, setUserId] = useState<string | null>(() =>
    localStorage.getItem("userId"),
  );

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
    if (!jobId) {
      setError("Missing job ID in the review link.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    getPrintJobByIdPublic(jobId)
      .then((job) => {
        setJobTitle(
          job.verificationCode ? `Job #${job.verificationCode}` : "Review Job",
        );
        setFiles(
          job.files.map((file) => ({
            id: file.id,
            name: file.name,
            pages: file.pages,
            url: file.url,
            options: normalizeOptions(file.option),
            pageRangeError: "",
          })),
        );
        setExpandedIdx(0);
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Unable to load this job.",
        );
      })
      .finally(() => setIsLoading(false));
  }, [jobId]);

  const jobColorMode = useMemo<"BW" | "COLOR">(() => {
    return files[0]?.options.colorMode ?? "BW";
  }, [files]);

  const totals = useMemo(() => {
    const totalPages = files.reduce((sum, file) => sum + file.pages, 0);
    const totalCost = files.reduce(
      (sum, file) => sum + calculateFileCost(file.pages, file.options),
      0,
    );
    const estimatedTime = calculateEstimatedTime(totalPages);
    return { totalPages, totalCost, estimatedTime };
  }, [files]);

  const hasErrors = files.some(
    (file) =>
      file.pageRangeError ||
      (file.options.pageRange === "CUSTOM" && !file.options.customRange.trim()),
  );

  const updateFileOptions = (idx: number, patch: Partial<PrintFileOption>) => {
    setFiles((prev) =>
      prev.map((file, i) => {
        if (i !== idx) return file;
        const nextOptions = { ...file.options, ...patch };
        const rangeError =
          nextOptions.pageRange === "CUSTOM"
            ? (validateCustomPageRange(
                nextOptions.customRange ?? "",
                file.pages,
              ) ?? "")
            : "";
        return { ...file, options: nextOptions, pageRangeError: rangeError };
      }),
    );
  };

  const updateColorMode = (mode: "BW" | "COLOR") => {
    setFiles((prev) =>
      prev.map((file) => {
        const nextOptions = { ...file.options, colorMode: mode };
        return { ...file, options: nextOptions };
      }),
    );
  };

  const removeFile = async (idx: number) => {
    const confirmed = window.confirm(
      "Remove this file? This action cannot be undone. You will need to create a new job to add it back.",
    );
    if (!confirmed) return;
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setExpandedIdx((prev) => (prev === idx ? null : prev));
  };

  const onSubmit = async () => {
    if (isSubmitting || !files.length || hasErrors) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const payload = {
        jobId: jobId ?? "",
        files: files.map((file) => ({
          id: file.id,
          options: {
            ...file.options,
            customRange: file.options.customRange ?? "",
          },
        })),
      };
      const result = await submitWhatsappJobReview(payload);
      setVerificationCode(String(result.verificationCode));
      notify("Job updated successfully.", { variant: "success" });
      localStorage.setItem(
        "lastReviewVerificationCode",
        String(result.verificationCode),
      );
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit job.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="app-shell">
        <main className="main-wrap">
          <div className="hero-panel">
            <p className="modal-helper">Loading review details...</p>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-shell">
        <main className="main-wrap">
          <div className="hero-panel review-error-card">
            <div className="review-error-head">
              <span className="review-error-badge">!</span>
              <div>
                <p className="review-error-title">Unable to load this job</p>
                <p className="review-error-subtitle">
                  The review link might be expired or already submitted.
                </p>
              </div>
            </div>
            <div className="review-error-meta">
              <span className="review-error-label">Details</span>
              <span className="review-error-message">{error}</span>
            </div>
            <div className="review-error-actions">
              <Link to="/" className="btn btn-primary">
                Go back
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <Link to="/" className="brand-row">
          <div className="brand-mark" aria-hidden="true">
            <img
              className="brand-icon brand-icon--light"
              src="/img/IconBlack.png"
              alt=""
            />
            <img
              className="brand-icon brand-icon--dark"
              src="/img/iconWhite.png"
              alt=""
            />
          </div>
          <div>
            <p className="brand-title">ZOPY</p>
            <span className="brand-subtitle">REVIEW & CONFIRM</span>
          </div>
        </Link>
        <Link to="/" className="ghost-link">
          Back to Upload
        </Link>
      </header>

      <main className="main-wrap review-grid">
        <section className="hero-panel">
          <div className="hero-header">
            <h1>{jobTitle || "Review Job"}</h1>
            <p>Confirm your print options, remove files, and submit.</p>
          </div>

          <div className="print-mode-top">
            <p className="field-label">Print Type</p>
            <ToggleGroup
              options={[
                { label: "Color Print", value: "COLOR" },
                { label: "B/W Print", value: "BW" },
              ]}
              value={jobColorMode}
              onChange={updateColorMode}
            />
            <p className="color-mode-note">
              Color mode applies to all files in this job.
            </p>
          </div>

          <div className="section-head">
            <h2>Files in this job</h2>
          </div>

          <div className="upload-file-list">
            {files.map((file, idx) => (
              <article className="upload-file-card" key={file.id}>
                <div className="upload-file-head">
                  <button
                    type="button"
                    className="upload-file-title"
                    onClick={() =>
                      setExpandedIdx((prev) => (prev === idx ? null : idx))
                    }
                  >
                    <div className="file-icon" aria-hidden="true">
                      <FileText size={18} />
                    </div>
                    <div>
                      <p>{file.name}</p>
                      <span>
                        {file.pages} pages • Rs{" "}
                        {calculateFileCost(file.pages, file.options)}
                      </span>
                    </div>
                  </button>
                  <div className="review-file-actions">
                    <a href={file.url} target="_blank" rel="noreferrer">
                      View File
                    </a>
                    <button
                      type="button"
                      className="icon-btn remove-file-btn"
                      onClick={() => void removeFile(idx)}
                      aria-label="Remove file"
                    >
                      <X size={16} strokeWidth={2.4} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div className="review-file-footer">
                  <span className="file-edit-hint">
                    <SlidersHorizontal size={12} />
                    Tap file to edit details
                  </span>
                </div>

                {expandedIdx === idx && (
                  <div className="upload-file-body">
                    <div>
                      <p className="field-label">Print Sides</p>
                      <ToggleGroup
                        options={[
                          { label: "One Side", value: "ONE" },
                          { label: "Both Sides", value: "BOTH" },
                        ]}
                        value={file.options.duplex}
                        onChange={(v) => updateFileOptions(idx, { duplex: v })}
                      />
                    </div>

                    <div>
                      <p className="field-label">Orientation</p>
                      <ToggleGroup
                        options={[
                          { label: "Vertical", value: "PORTRAIT" },
                          { label: "Horizontal", value: "LANDSCAPE" },
                        ]}
                        value={file.options.orientation}
                        onChange={(v) =>
                          updateFileOptions(idx, { orientation: v })
                        }
                      />
                    </div>

                    <div>
                      <p className="field-label">Scale</p>
                      <ToggleGroup
                        options={[
                          { label: "Fit to paper", value: "FIT" },
                          { label: "Original size", value: "NOSCALE" },
                        ]}
                        value={file.options.scaleMode}
                        onChange={(v) =>
                          updateFileOptions(idx, { scaleMode: v })
                        }
                      />
                    </div>

                    <div>
                      <p className="field-label">Page Range</p>
                      <ToggleGroup
                        options={[
                          { label: "All Pages", value: "ALL" },
                          { label: "Custom", value: "CUSTOM" },
                        ]}
                        value={file.options.pageRange}
                        onChange={(v) =>
                          updateFileOptions(idx, {
                            pageRange: v,
                            customRange: "",
                          })
                        }
                      />

                      {file.options.pageRange === "CUSTOM" && (
                        <div className="field-spacing">
                          <input
                            type="text"
                            value={file.options.customRange}
                            onChange={(e) =>
                              updateFileOptions(idx, {
                                customRange: e.target.value,
                              })
                            }
                            placeholder={`1-5, 8, 10-12 (total ${file.pages} pages)`}
                            className={
                              file.pageRangeError
                                ? "text-input invalid"
                                : "text-input"
                            }
                          />
                          {file.pageRangeError && (
                            <p className="field-error">{file.pageRangeError}</p>
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
                            updateFileOptions(idx, {
                              copies: Math.max(1, file.options.copies - 1),
                            })
                          }
                        >
                          -
                        </button>
                        <span>{file.options.copies}</span>
                        <button
                          type="button"
                          onClick={() =>
                            updateFileOptions(idx, {
                              copies: file.options.copies + 1,
                            })
                          }
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>

          <div className="summary-card">
            <p>Total</p>
            <strong>Rs {totals.totalCost}</strong>
            <span>
              {files.length} file(s) • {totals.totalPages} pages •{" "}
              {totals.estimatedTime} min
            </span>
          </div>

          {verificationCode ? (
            <div className="success-card">
              <p>Job submitted successfully</p>
              <div
                className="otp-digits"
                aria-label={`Verification code ${verificationCode}`}
              >
                {verificationCode.split("").map((digit, idx) => (
                  <div key={`${digit}-${idx}`} className="otp-digit">
                    {digit}
                  </div>
                ))}
              </div>
              <span className="highlight-text">
                Share this with the shopkeeper to collect prints.
              </span>
            </div>
          ) : (
            <button
              type="button"
              className={
                !isSubmitting && !hasErrors && files.length > 0
                  ? "btn btn-primary submit-btn"
                  : "btn btn-disabled submit-btn"
              }
              onClick={() => void onSubmit()}
              disabled={isSubmitting || hasErrors || files.length === 0}
            >
              {isSubmitting ? "Submitting..." : "Confirm and Print"}
            </button>
          )}

          {hasErrors && (
            <p className="field-error">
              Fix the highlighted file options before submitting.
            </p>
          )}
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <Link to="/terms" className="footer-link">
            Terms & Conditions
          </Link>
          <Link to="/about" className="footer-link">
            About Us
          </Link>
        </div>
      </footer>
    </div>
  );
}
