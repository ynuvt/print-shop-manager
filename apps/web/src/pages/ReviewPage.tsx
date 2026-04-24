import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FileText, SlidersHorizontal, X, ChevronDown, FolderOpen, Upload } from "lucide-react";
import type { PrintFileOption } from "@printowl/types";
import {
  addFilesToJobFromUrls,
  getPrintJobByIdPublic,
  getUserSession,
  registerUser,
  confirmReviewJob,
  requestPresignedUploads,
  submitWhatsappJobReview,
  uploadFileToR2,
  updateUserFilePrintOptions,
  deleteUserFile,
  type UserPrintJob,
} from "../api/api";
import {
  calculateFileCost,
  validateCustomPageRange,
} from "../printing/costCalculator";
import { defaultPrintOptions } from "../printing/types";
import { calculateEstimatedTime } from "@printowl/shared-utils";
import { useNotifications } from "../components/NotificationCenter";
import { getSocket } from "../services/getSocket";

const API_ORIGIN =
  import.meta.env.VITE_API_ORIGIN ?? "https://zopy.devlocstudio.in";
const BASE_URL = `${API_ORIGIN}/api/v1`;

function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="toggle-group" role="radiogroup" style={{ opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? "none" : "auto" }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={value === opt.value ? "toggle-item active" : "toggle-item"}
          data-value={opt.value}
          onClick={() => { if (!disabled) onChange(opt.value); }}
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
  uploadedByDisplayName?: string | null;
  uploadedByRole?: "OWNER" | "COLLABORATOR";
  uploaderDone?: boolean;
};

type GlobalColorMode = "BW" | "COLOR" | "MIXED";

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

type StoredOptionMap = Record<string, PrintFileOption>;

function getStoredOptions(jobId: string): StoredOptionMap {
  const storageKey = `review-options:${jobId}`;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredOptionMap;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function saveStoredOptions(jobId: string, files: ReviewFileState[]): void {
  const storageKey = `review-options:${jobId}`;
  const payload = files.reduce<StoredOptionMap>((acc, file) => {
    acc[file.id] = file.options;
    return acc;
  }, {});
  localStorage.setItem(storageKey, JSON.stringify(payload));
}

function clearStoredOptions(jobId: string): void {
  const storageKey = `review-options:${jobId}`;
  localStorage.removeItem(storageKey);
}

function buildReviewFiles(
  job: UserPrintJob,
  storedOptions: StoredOptionMap,
): ReviewFileState[] {
  return job.files.map((file) => {
    const baseOptions = normalizeOptions(file.option);
    const mergedOptions = normalizeOptions({
      ...baseOptions,
      ...storedOptions[file.id],
    });
    const pageRangeError =
      mergedOptions.pageRange === "CUSTOM"
        ? (validateCustomPageRange(
            mergedOptions.customRange ?? "",
            file.pages,
          ) ?? "")
        : "";

    return {
      id: file.id,
      name: file.name,
      pages: file.pages,
      url: file.url,
      options: mergedOptions,
      pageRangeError,
      uploadedByDisplayName: file.uploadedByDisplayName ?? null,
      uploadedByRole: file.uploadedByRole,
      uploaderDone: file.uploaderDone,
    };
  });
}

function FileCard({
  file,
  idx,
  expandedIdx,
  toggleFileExpanded,
  handleCardClick,
  updateFileOptions,
  removeFile,
  isReadonly = false,
}: {
  file: ReviewFileState;
  idx: number;
  expandedIdx: number | null;
  toggleFileExpanded: (idx: number) => void;
  handleCardClick: (idx: number, event: MouseEvent) => void;
  updateFileOptions: (idx: number, patch: Partial<PrintFileOption>) => void;
  removeFile: (idx: number) => Promise<void>;
  isReadonly?: boolean;
}) {
  return (
    <article
      className="upload-file-card review-file-card"
      role="button"
      tabIndex={0}
      onClick={(event) => {
        handleCardClick(idx, event);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleFileExpanded(idx);
        }
      }}
      style={{ cursor: "pointer" }}
    >
      <div className="upload-file-head">
        <button
          type="button"
          className="upload-file-title"
          onClick={(event) => {
            event.stopPropagation();
            toggleFileExpanded(idx);
          }}
          style={{ cursor: "pointer" }}
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
          <button
            type="button"
            className="file-edit-hint file-edit-hint--action"
            onClick={(event) => {
              event.stopPropagation();
              toggleFileExpanded(idx);
            }}
          >
            <SlidersHorizontal size={12} />
            {isReadonly ? "View details" : "Edit details"}
          </button>
          <a href={file.url} target="_blank" rel="noreferrer">
            View File
          </a>
          <button
            type="button"
            className="icon-btn remove-file-btn"
            onClick={(event) => {
              event.stopPropagation();
              void removeFile(idx);
            }}
            aria-label="Remove file"
          >
            <X size={16} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
      </div>

      {expandedIdx === idx && (
        <div className="upload-file-body">
          {isReadonly && (
            <div style={{ padding: "8px 12px", background: "var(--bg-card)", color: "var(--text-muted)", fontSize: 13, borderTop: "1px solid var(--border-color)", marginBottom: "16px", borderRadius: 8 }}>
              Options locked. Contact owner if you need to make changes.
            </div>
          )}
          <div>
            <p className="field-label">Print Sides</p>
            <ToggleGroup
              options={[
                { label: "One Side", value: "ONE" },
                { label: "Both Sides", value: "BOTH" },
              ]}
              value={file.options.duplex}
              onChange={(v) => updateFileOptions(idx, { duplex: v })}
              disabled={isReadonly}
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
              onChange={(v) => updateFileOptions(idx, { orientation: v })}
              disabled={isReadonly}
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
              onChange={(v) => updateFileOptions(idx, { scaleMode: v })}
              disabled={isReadonly}
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
              disabled={isReadonly}
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
                  disabled={isReadonly}
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
                disabled={isReadonly}
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
                disabled={isReadonly}
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

function FileGroupFolder({
  label,
  cost,
  pages,
  fileCount,
  defaultOpen,
  canRemove,
  onRemoveGroup,
  children,
}: {
  label: string;
  cost: number;
  pages: number;
  fileCount: number;
  defaultOpen: boolean;
  canRemove?: boolean;
  onRemoveGroup?: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`file-group-folder ${open ? "file-group-folder--open" : ""}`}>
      <button
        type="button"
        className="file-group-header"
        onClick={() => setOpen((prev) => !prev)}
      >
        <div className="file-group-header-left">
          <FolderOpen size={18} className="file-group-icon" />
          <div>
            <p className="file-group-label">{label}</p>
            <span className="file-group-meta">
              {fileCount} file{fileCount !== 1 ? "s" : ""} • {pages} pages
            </span>
          </div>
        </div>
        <div className="file-group-header-right">
          <span className="file-group-cost">Rs {cost}</span>
          <ChevronDown
            size={18}
            className={`file-group-chevron ${open ? "file-group-chevron--open" : ""}`}
          />
          {canRemove && (
            <div
              className="icon-btn remove-file-btn"
              onClick={(e) => {
                e.stopPropagation();
                if (onRemoveGroup) onRemoveGroup();
              }}
              style={{ marginLeft: 8 }}
              aria-label="Remove folder"
            >
              <X size={16} strokeWidth={2.4} aria-hidden="true" />
            </div>
          )}
        </div>
      </button>
      {open && <div className="file-group-body">{children}</div>}
    </div>
  );
}


export default function ReviewPage({ draftJobId, onExit }: { draftJobId?: string, onExit?: () => void } = {}) {
  const params = useParams<{ jobId: string }>();
  const jobId = draftJobId || params.jobId;
  const navigate = useNavigate();
  const [jobTitle, setJobTitle] = useState<string>("");
  const [files, setFiles] = useState<ReviewFileState[]>([]);
  const [viewerRole, setViewerRole] = useState<"OWNER" | "COLLABORATOR" | null>(
    null,
  );
  const [costBreakdown, setCostBreakdown] = useState<
    UserPrintJob["costBreakdown"] | null
  >(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAddingFiles, setIsAddingFiles] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [whatsappSynced, setWhatsappSynced] = useState<boolean>(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showCollabConfirmModal, setShowCollabConfirmModal] = useState(false);
  const [isCollabDone, setIsCollabDone] = useState(false);
  const [jobStatus, setJobStatus] = useState<string>("DRAFT");
  const [verificationCode, setVerificationCode] = useState<string | null>(null);
  const { notify } = useNotifications();
  const [userId, setUserId] = useState<string | null>(() =>
    localStorage.getItem("userId"),
  );
  const debounceSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaveErrorRef = useRef(0);
  const lastPersistedOptionsRef = useRef<Record<string, PrintFileOption>>({});
  const hasClaimedOwnerRef = useRef(false);
  const addMoreInputRef = useRef<HTMLInputElement | null>(null);

  const getPendingFiles = () =>
    files.filter((file) => {
      if (file.pageRangeError) return false;
      if (
        file.options.pageRange === "CUSTOM" &&
        !file.options.customRange?.trim()
      ) {
        return false;
      }
      const lastSaved = lastPersistedOptionsRef.current[file.id];
      if (!lastSaved) return true;
      return JSON.stringify(lastSaved) !== JSON.stringify(file.options);
    });

  const persistCurrentOptionsNow = async (useKeepAlive: boolean) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const pendingFiles = getPendingFiles();

    await Promise.all(
      pendingFiles.map(async (file) => {
        try {
          if (useKeepAlive) {
            await fetch(`${BASE_URL}/files/printOptions/${file.id}`, {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                ...file.options,
                customRange: file.options.customRange ?? "",
              }),
              keepalive: true,
            });
          } else {
            await updateUserFilePrintOptions(file.id, {
              ...file.options,
              customRange: file.options.customRange ?? "",
            });
          }

          lastPersistedOptionsRef.current[file.id] = file.options;
        } catch (error) {
          console.error("Failed to persist print options.", error);
          if (Date.now() - lastSaveErrorRef.current > 5000) {
            lastSaveErrorRef.current = Date.now();
            notify("Failed to save print options. Try again in a moment.", {
              variant: "error",
            });
          }
        }
      }),
    );
  };

  useEffect(() => {
    if (userId && jobId && !error) {
      console.log("Joining job updates room for user:", userId);
      getSocket().emit("join-job-updates", jobId);
      return () => {
        getSocket().emit("leave-job-updates", jobId);
      };
    }
  }, [userId, jobId, error]);

  useEffect(() => {
    return () => {
      if (debounceSaveRef.current) {
        clearTimeout(debounceSaveRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      void persistCurrentOptionsNow(true);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [files]);

  const refreshJob = async (mode: "initial" | "manual" | "socket") => {
    if (!jobId) return;
    if (mode === "initial") {
      setIsLoading(true);
    }
    if (mode === "manual") {
      setIsRefreshing(true);
    }

    try {
      const session = await getUserSession();
      setWhatsappSynced(!!session.whatsappSynced);
      const job = await getPrintJobByIdPublic(jobId);
      const role = (job as UserPrintJob).viewerRole ?? null;
      setViewerRole(role);
      
      if (!draftJobId && role === "OWNER") {
        navigate("/");
        return;
      }
      
      setJobStatus((job as UserPrintJob).status);
      setCostBreakdown((job as UserPrintJob).costBreakdown ?? null);
      const whatsAppLabel = job.userMetadata?.name?.trim()
        ? `${job.userMetadata.name}`
        : (job.userMetadata?.phoneNumber ?? "");
      setJobTitle(whatsAppLabel ? `WhatsApp: ${whatsAppLabel}` : "Review Job");
      setIsCollabDone((job as UserPrintJob).isCollabDone ?? false);
      const storedOptions = getStoredOptions(jobId);
      const nextFiles = buildReviewFiles(job, storedOptions);
      setFiles(nextFiles);
      lastPersistedOptionsRef.current = nextFiles.reduce(
        (acc, file) => {
          acc[file.id] = file.options;
          return acc;
        },
        {} as Record<string, PrintFileOption>,
      );
      if (mode === "initial") {
        setExpandedIdx(0);
      }
    } catch (err) {
      const isSyncGateError =
        err instanceof Error &&
        /sync your whatsapp|authentication required/i.test(err.message);
      if (
        isSyncGateError
      ) {
        setShowSyncModal(true);
        if (mode === "initial") {
          setError(null);
        }
      }
      if (mode === "initial" && !isSyncGateError) {
        setError(
          err instanceof Error ? err.message : "Unable to load this job.",
        );
      } else if (!isSyncGateError) {
        notify("Failed to refresh job details.", { variant: "error" });
      }
    } finally {
      if (mode === "initial") {
        setIsLoading(false);
      }
      if (mode === "manual") {
        setIsRefreshing(false);
      }
    }
  };

  useEffect(() => {
    if (!userId || !jobId) return;

    const handleJobFileAdded = (updatedJobId: string) => {
      console.log("Received job-file-added event for job:", updatedJobId);
      if (updatedJobId !== jobId) return;
      if (debounceSaveRef.current) {
        clearTimeout(debounceSaveRef.current);
      }
      void persistCurrentOptionsNow(false).then(() => refreshJob("socket"));
    };

    const handleCollaboratorConfirmed = (
      updatedJobId: string,
      _payload: unknown,
    ) => {
      if (updatedJobId !== jobId) return;
      // Owner refreshes to get updated cost breakdown / confirmations.
      void refreshJob("socket");
    };

    getSocket().on("job-file-added", handleJobFileAdded);
    getSocket().on("job-collaborator-confirmed", handleCollaboratorConfirmed);

    return () => {
      getSocket().off("job-file-added", handleJobFileAdded);
      getSocket().off("job-collaborator-confirmed", handleCollaboratorConfirmed);
    };
  }, [userId, jobId]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (userId && token) return;

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
    if (hasClaimedOwnerRef.current) return;
    if (!jobId || !userId) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    hasClaimedOwnerRef.current = true;
    void refreshJob("manual");
  }, [jobId, userId]);

  useEffect(() => {
    if (!jobId) {
      setError("Missing job ID in the review link.");
      setIsLoading(false);
      return;
    }

    void refreshJob("initial");
  }, [jobId]);

  useEffect(() => {
    if (!jobId || isLoading || error) return;
    saveStoredOptions(jobId, files);
  }, [jobId, files, isLoading, error]);

  useEffect(() => {
    if (!files.length || isLoading) return;
    if (debounceSaveRef.current) {
      clearTimeout(debounceSaveRef.current);
    }
    debounceSaveRef.current = setTimeout(() => {
      void persistCurrentOptionsNow(false);
    }, 1500);
  }, [files, isLoading]);

  const totals = useMemo(() => {
    const totalPages = files.reduce((sum, file) => sum + file.pages, 0);
    const totalCost = files.reduce(
      (sum, file) => sum + calculateFileCost(file.pages, file.options),
      0,
    );
    const estimatedTime = calculateEstimatedTime(totalPages);
    return { totalPages, totalCost, estimatedTime };
  }, [files]);

  const globalColorMode: GlobalColorMode = useMemo(() => {
    if (!files.length) return "BW";
    const allColor = files.every((file) => file.options.colorMode === "COLOR");
    if (allColor) return "COLOR";
    const allBw = files.every((file) => file.options.colorMode === "BW");
    if (allBw) return "BW";
    return "MIXED";
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

  const applyGlobalColorMode = (mode: Exclude<GlobalColorMode, "MIXED">) => {
    setFiles((prev) =>
      prev.map((file) => ({
        ...file,
        options: { ...file.options, colorMode: mode },
      })),
    );
  };

  const removeFile = async (idx: number) => {
    if (jobStatus !== "DRAFT") {
      notify("This job has already been submitted and files cannot be removed.", { variant: "error" });
      return;
    }

    const confirmed = window.confirm(
      "Remove this file? This action cannot be undone.",
    );
    if (!confirmed) return;
    const target = files[idx];
    if (!target) return;

    try {
      await deleteUserFile(target.id);
      setFiles((prev) => prev.filter((_, i) => i !== idx));
      setExpandedIdx((prev) => (prev === idx ? null : prev));
      if (jobId) {
        void refreshJob("manual");
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to remove file.", {
        variant: "error",
      });
    }
  };

  const removeFileGroup = async (label: string, fileIds: string[]) => {
    if (jobStatus !== "DRAFT") {
      notify("This job has already been submitted and files cannot be removed.", { variant: "error" });
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to remove all files from ${label}?`,
    );
    if (!confirmed) return;
    try {
      await Promise.all(fileIds.map((id) => deleteUserFile(id)));
      setFiles((prev) => prev.filter((f) => !fileIds.includes(f.id)));
      if (jobId) {
        void refreshJob("manual");
      }
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Failed to remove folder.",
        { variant: "error" },
      );
    }
  };

  const handleShowConfirm = async () => {
    if (isSubmitting || !files.length || hasErrors) return;

    if (viewerRole === "COLLABORATOR") {
      setShowCollabConfirmModal(true);
      return;
    }

    setShowConfirmModal(true);
  };

  const confirmCollabDone = async () => {
    setShowCollabConfirmModal(false);
    setIsSubmitting(true);
    setError(null);
    try {
      await persistCurrentOptionsNow(false);
      const result = await confirmReviewJob(jobId ?? "");
      notify(`Confirmed! Your files total: ₹${result.userCost}`, {
        variant: "success",
      });
      setIsCollabDone(true);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to confirm.", { variant: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmAndSubmit = async () => {
    setShowConfirmModal(false);
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
      // Refresh to get cost breakdown
      await refreshJob("socket");
      notify("Job submitted successfully!", { variant: "success" });
      localStorage.setItem(
        "lastReviewVerificationCode",
        String(result.verificationCode),
      );
      if (jobId) {
        clearStoredOptions(jobId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit job.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const addMoreDocumentsFromDevice = async (selected: File[]) => {
    if (!jobId) return;
    if (!selected.length) return;
    if (isAddingFiles) return;

    setIsAddingFiles(true);
    try {
      const pdfs = selected.filter((file) =>
        file.name.toLowerCase().endsWith(".pdf"),
      );
      if (!pdfs.length) {
        notify("Please select a PDF file.", { variant: "error" });
        return;
      }

      const uploads = await requestPresignedUploads(pdfs);

      await Promise.all(
        uploads.map((upload, idx) =>
          uploadFileToR2(upload.uploadUrl, pdfs[idx]),
        ),
      );

      await addFilesToJobFromUrls(
        jobId,
        uploads.map((upload) => ({
          name: upload.name,
          url: upload.publicUrl,
        })),
      );

      await refreshJob("manual");
      notify("Added file(s) to this job.", { variant: "success" });
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to add documents.", {
        variant: "error",
      });
    } finally {
      setIsAddingFiles(false);
    }
  };

  const toggleFileExpanded = (idx: number) => {
    setExpandedIdx((prev) => (prev === idx ? null : idx));
  };

  const handleCardClick = (idx: number, event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target) {
      toggleFileExpanded(idx);
      return;
    }
    const interactive = target.closest("a,button,input,select,textarea,label");
    if (interactive) return;
    toggleFileExpanded(idx);
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

  const content = (
    <>
      <main className="main-wrap review-grid">
        <section className="hero-panel">
          <div className="hero-header">
            <h1>Upload Documents</h1>
            <p>Choose Color or B/W once, then set options per file.</p>
            {jobTitle && jobTitle !== "Review Job" && (
              <div style={{ marginTop: 10, color: "var(--primary)", fontWeight: 600 }}>{jobTitle}</div>
            )}
          </div>

          {!isCollabDone && (
            <div
              className={isDragActive ? "upload-dropzone active" : "upload-dropzone"}
              onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
              onDragLeave={() => setIsDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragActive(false);
                const files = Array.from(e.dataTransfer.files).filter((f) =>
                  f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
                );
                if (files.length) {
                  void addMoreDocumentsFromDevice(files).finally(() => {
                    if (addMoreInputRef.current) addMoreInputRef.current.value = "";
                  });
                } else {
                  notify("Please drop only PDF files.", { variant: "error" });
                }
              }}
            >
              <button
                type="button"
                className="upload-circle"
                onClick={() => addMoreInputRef.current?.click()}
                disabled={isAddingFiles || isSubmitting}
              >
                <Upload size={34} strokeWidth={2.2} className="upload-circle-icon" />
                <span className="upload-circle-label">Upload PDF</span>
              </button>
              <p>
                {isAddingFiles
                  ? "Uploading files. Please wait..."
                  : "Drag and drop or tap to browse."}
              </p>
            </div>
          )}

          <div className="section-head" style={{ marginTop: 24 }}>
            <h2>Files in this job</h2>
            <div className="review-actions">
              <button
                type="button"
                className="btn review-action-btn review-action-btn--subtle"
                onClick={() => void refreshJob("manual")}
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh Files"}
              </button>
            </div>
          </div>

          {viewerRole !== "COLLABORATOR" && !isCollabDone && (
            <div className="print-mode-top">
              <p className="field-label">Print Type (applies to all files)</p>
              <ToggleGroup<GlobalColorMode>
                options={[
                  { label: "Color Print", value: "COLOR" },
                  { label: "B/W Print", value: "BW" },
                ]}
                value={globalColorMode}
                onChange={(v) => {
                  if (v === "MIXED") return;
                  applyGlobalColorMode(v);
                }}
              />
              {globalColorMode === "MIXED" && (
                <p className="color-mode-note">
                  This job has mixed print types. Pick one to apply it to all
                  files.
                </p>
              )}
            </div>
          )}

          {(() => {
            // Group files by uploader
            type FileGroup = {
              label: string;
              role: "OWNER" | "COLLABORATOR";
              files: { file: ReviewFileState; globalIdx: number }[];
            };

            const groups: FileGroup[] = [];
            const ownerGroup: FileGroup = { label: "My Documents", role: "OWNER", files: [] };
            const collabMap = new Map<string, FileGroup>();

            files.forEach((file, idx) => {
              if (file.uploadedByRole === "COLLABORATOR" && file.uploadedByDisplayName) {
                const key = file.uploadedByDisplayName;
                if (!collabMap.has(key)) {
                  collabMap.set(key, {
                    label: `${key}'s Documents`,
                    role: "COLLABORATOR",
                    files: [],
                  });
                }
                collabMap.get(key)!.files.push({ file, globalIdx: idx });
              } else {
                ownerGroup.files.push({ file, globalIdx: idx });
              }
            });

            if (ownerGroup.files.length) groups.push(ownerGroup);
            collabMap.forEach((g) => groups.push(g));

            const hasCollaborators = collabMap.size > 0;

            // Only show folders if there are collaborators AND the viewer is the owner
            if (viewerRole === "COLLABORATOR" || !hasCollaborators) {
              return (
                <div className="upload-file-list">
                  {files.map((file, idx) => (
                    <FileCard
                      key={file.id}
                      file={file}
                      idx={idx}
                      expandedIdx={expandedIdx}
                      toggleFileExpanded={toggleFileExpanded}
                      handleCardClick={handleCardClick}
                      updateFileOptions={updateFileOptions}
                      removeFile={removeFile}
                      isReadonly={isCollabDone}
                    />
                  ))}
                </div>
              );
            }

            return (
              <div className="upload-file-list grouped-file-list">
                {ownerGroup.files.length > 0 && (
                  <div className="owner-flat-list" style={{ marginBottom: 24 }}>
                    <h3 style={{ fontSize: 16, marginBottom: 12, fontWeight: 600 }}>My Documents</h3>
                    <div className="upload-file-list">
                      {ownerGroup.files.map(({ file, globalIdx }) => (
                        <FileCard
                          key={file.id}
                          file={file}
                          idx={globalIdx}
                          expandedIdx={expandedIdx}
                          toggleFileExpanded={toggleFileExpanded}
                          handleCardClick={handleCardClick}
                          updateFileOptions={updateFileOptions}
                          removeFile={removeFile}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {Array.from(collabMap.values()).map((group) => {
                  const groupCost = group.files.reduce(
                    (sum, { file }) => sum + calculateFileCost(file.pages, file.options),
                    0,
                  );
                  const groupPages = group.files.reduce(
                    (sum, { file }) => sum + file.pages,
                    0,
                  );
                  const canRemove = true; // Owner can remove any collaborator folder
                  const fileIds = group.files.map((f) => f.file.id);

                  return (
                    <FileGroupFolder
                      key={group.label}
                      label={group.label}
                      cost={groupCost}
                      pages={groupPages}
                      fileCount={group.files.length}
                      defaultOpen={false}
                      canRemove={canRemove}
                      onRemoveGroup={() => removeFileGroup(group.label, fileIds)}
                    >
                      {group.files.map(({ file, globalIdx }) => {
                        const isUploaderDone = file.uploaderDone ?? false;
                        return (
                          <FileCard
                            key={file.id}
                            file={file}
                            idx={globalIdx}
                            expandedIdx={expandedIdx}
                            toggleFileExpanded={toggleFileExpanded}
                            handleCardClick={handleCardClick}
                            updateFileOptions={updateFileOptions}
                            removeFile={removeFile}
                            isReadonly={!isUploaderDone}
                          />
                        );
                      })}
                      {group.files.length > 0 && !(group.files[0].file.uploaderDone) && (
                        <div style={{ padding: "8px 12px", background: "var(--bg-card)", color: "var(--text-muted)", fontSize: 13, borderTop: "1px solid var(--border-color)", borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }}>
                          The person hasn't confirmed their print and options. You cannot edit it yet.
                        </div>
                      )}
                    </FileGroupFolder>
                  );
                })}
              </div>
            );
          })()}

          {!isCollabDone && (
            <div className="summary-card">
            <p>Total</p>
            <strong>Rs {totals.totalCost}</strong>
            <span>
              {files.length} file(s) • {totals.totalPages} pages •{" "}
              {totals.estimatedTime} min
            </span>
            {viewerRole === "OWNER" && costBreakdown?.perUser?.length ? (
              <div className="cost-split-table">
                <div className="cost-split-header">Cost Breakdown</div>
                {costBreakdown.perUser.map((u) => (
                  <div key={u.key} className="cost-split-row">
                    <span>{u.displayName}</span>
                    <span>Rs {u.cost}</span>
                  </div>
                ))}
                <div className="cost-split-row cost-split-total-row">
                  <span>Total</span>
                  <span>Rs {costBreakdown.totalCost}</span>
                </div>
              </div>
            ) : null}
            </div>
          )}

          {verificationCode ? (
            <div className="success-card">
              <p>Job submitted successfully!</p>
              {costBreakdown?.perUser?.length ? (
                <div className="cost-split-table">
                  <div className="cost-split-header">Cost Breakdown</div>
                  {costBreakdown.perUser.map((u) => (
                    <div key={u.key} className="cost-split-row">
                      <span>{u.displayName}</span>
                      <span>Rs {u.cost}</span>
                    </div>
                  ))}
                  <div className="cost-split-row cost-split-total-row">
                    <span>Total</span>
                    <span>Rs {costBreakdown.totalCost}</span>
                  </div>
                </div>
              ) : null}
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
                Share this code with the shopkeeper to collect your prints.
              </span>
              <button
                type="button"
                className="btn"
                style={{ marginTop: 16 }}
                onClick={() => onExit ? onExit() : navigate("/")}
              >
                Go Home
              </button>
            </div>
          ) : isCollabDone ? (
            <div className="success-card">
              <p>You're all set!</p>
              <span className="highlight-text" style={{ marginTop: 12 }}>
                Your files have been saved. The owner will review and submit the final print job.
              </span>
              <button
                type="button"
                className="btn"
                style={{ marginTop: 16 }}
                onClick={() => onExit ? onExit() : navigate("/")}
              >
                Go Home
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={
                !isSubmitting && !hasErrors && files.length > 0
                  ? "btn btn-primary submit-btn"
                  : "btn btn-disabled submit-btn"
              }
              onClick={() => void handleShowConfirm()}
              disabled={isSubmitting || hasErrors || files.length === 0}
            >
              {isSubmitting
                ? "Submitting..."
                : viewerRole === "COLLABORATOR"
                  ? "I'm Done"
                  : "Confirm and Print"}
            </button>
          )}

          {hasErrors && !isCollabDone && (
            <p className="field-error">
              Fix the highlighted file options before submitting.
            </p>
          )}
        </section>

        <input
          ref={addMoreInputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden-input"
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? []);
            void addMoreDocumentsFromDevice(selected).finally(() => {
              if (addMoreInputRef.current) addMoreInputRef.current.value = "";
            });
          }}
        />
      </main>

      {showSyncModal && !whatsappSynced && (
        <div className="modal-shell" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-head">
              <h2>Sync WhatsApp</h2>
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  setShowSyncModal(false);
                  navigate("/");
                }}
              >
                x
              </button>
            </div>
            <p className="modal-helper" style={{ marginTop: "16px" }}>
              You need to sync WhatsApp before accessing collaborator review links.
            </p>
            <div className="modal-actions" style={{ marginTop: "20px" }}>
              <button
                type="button"
                className="btn"
                onClick={() => onExit ? onExit() : navigate("/")}
              >
                Go Home
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const digits = "918369757906";
                  window.open(
                    `https://wa.me/${digits}?text=sync`,
                    "_blank",
                    "noopener,noreferrer",
                  );
                }}
              >
                Sync on WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div className="modal-overlay">
          <div className="modal-content review-confirm-modal">
            <h2>Confirm Submission</h2>
            <p>Review the job details before submitting.</p>

            <div className="confirm-summary">
              {(() => {
                const groupsMap = new Map<string, { label: string; cost: number; files: ReviewFileState[] }>();
                
                files.forEach((file) => {
                  const key = file.uploadedByDisplayName || "My Documents";
                  const label = key === "My Documents" ? key : `${key}'s Documents`;
                  if (!groupsMap.has(key)) {
                    groupsMap.set(key, { label, cost: 0, files: [] });
                  }
                  const group = groupsMap.get(key)!;
                  group.files.push(file);
                  group.cost += calculateFileCost(file.pages, file.options);
                });

                return Array.from(groupsMap.values()).map((group) => (
                  <div key={group.label} className="confirm-summary-group">
                    <div className="confirm-group-label">{group.label} (Rs {group.cost})</div>
                    {group.files.map((file) => (
                      <div key={file.id} className="confirm-file-item">
                        <span className="confirm-file-item-name">{file.name}</span>
                        <span className="confirm-file-item-cost">Rs {calculateFileCost(file.pages, file.options)}</span>
                      </div>
                    ))}
                  </div>
                ));
              })()}
            </div>
            
            <div className="cost-split-table" style={{ marginTop: 0, marginBottom: 20 }}>
              <div className="cost-split-row cost-split-total-row">
                <span>Total Amount</span>
                <span>Rs {files.reduce((sum, file) => sum + calculateFileCost(file.pages, file.options), 0)}</span>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn review-action-btn"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void confirmAndSubmit()}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Submitting..." : "Submit Job"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCollabConfirmModal && (
        <div className="modal-overlay">
          <div className="modal-content review-confirm-modal">
            <h2>Confirm Submission</h2>
            <p>
              Are you sure you're done? Once submitted, you cannot change anything. 
              You'll need to contact the owner if you want to make further changes.
            </p>
            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button
                type="button"
                className="btn review-action-btn"
                onClick={() => setShowCollabConfirmModal(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void confirmCollabDone()}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Confirming..." : "Yes, I'm Done"}
              </button>
            </div>
          </div>
        </div>
      )}

      {!draftJobId && (
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
      )}
    </>
  );

  if (draftJobId) {
    return content;
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
      {content}
    </div>
  );
}
