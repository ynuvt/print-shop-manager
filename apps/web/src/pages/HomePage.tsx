import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, CSSProperties } from "react";
import type { PrintFileOption as PrintOptions } from "@printowl/types";
import { Link } from "react-router-dom";
import {
  FileText,
  MessageCircle,
  Moon,
  Plus,
  SlidersHorizontal,
  Sun,
  Upload,
  X,
} from "lucide-react";
import Turnstile from "react-turnstile";
import {
  submitWhatsappJobReview,
  getWebDraftJob,
  addFilesToWebDraft,
  updateUserFilePrintOptions,
  getUserSession,
  markOnboardingCompleted,
  registerUser,
  requestPresignedUploads,
  uploadFileToR2,
  deleteUserFile,
} from "../api/api";
// import ReviewPage from "./ReviewPage";
import PrintJobsList from "../components/PrintJobsList";
import {
  buildJobTotals,
  calculateFileCost,
  validateCustomPageRange,
} from "../printing/costCalculator";
import { defaultPrintOptions } from "../printing/types";
import type { PrintFileState } from "../printing/types";
import { getSocket } from "../services/getSocket";
import type { ThemeMode } from "../App";

const MAX_JOB_UPLOAD_MB = 50;
const MAX_JOB_UPLOAD_BYTES = MAX_JOB_UPLOAD_MB * 1024 * 1024;

type WalkthroughStep =
  | "upload"
  | "print-type"
  | "customize"
  | "add-more"
  | "file-select"
  | "summary"
  | "submit";

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

function FileCard({
  pf,
  expanded,
  onToggle,
  isWalkthroughTarget,
  walkthroughRef,
  titleRef,
  isTitleWalkthroughTarget,
  onUpdate,
  onRemove,
}: {
  pf: PrintFileState;
  expanded: boolean;
  onToggle: () => void;
  isWalkthroughTarget?: boolean;
  walkthroughRef?: (node: HTMLDivElement | null) => void;
  titleRef?: (node: HTMLButtonElement | null) => void;
  isTitleWalkthroughTarget?: boolean;
  onUpdate: (patch: Partial<PrintOptions>) => void;
  onRemove: () => void;
}) {
  const cost = calculateFileCost(pf.detectedPages, pf.options);

  return (
    <article className="upload-file-card review-file-card">
      <div className="upload-file-head">
        <button
          ref={titleRef}
          type="button"
          className={
            isTitleWalkthroughTarget
              ? "upload-file-title walkthrough-target"
              : "upload-file-title"
          }
          onClick={onToggle}
        >
          <div className="file-icon" aria-hidden="true">
            <FileText size={18} />
          </div>
          <div>
            <p>{pf.name}</p>
            <span>
              {pf.detectedPages} pages • Rs {cost}
            </span>
          </div>
        </button>
        <div className="review-file-actions">
          <button
            type="button"
            className="file-edit-hint file-edit-hint--action"
            onClick={onToggle}
          >
            <SlidersHorizontal size={12} />
            Edit details
          </button>
          {pf.url && (
            <a href={pf.url} target="_blank" rel="noreferrer">
              View File
            </a>
          )}
          <button
            type="button"
            className="icon-btn remove-file-btn"
            onClick={onRemove}
            aria-label="Remove file"
          >
            <X size={16} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
      </div>

      {expanded && (
        <div
          ref={walkthroughRef}
          className={
            isWalkthroughTarget
              ? "upload-file-body walkthrough-target"
              : "upload-file-body"
          }
        >
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
  const [showSteps, setShowSteps] = useState(false);
  const [userId, setUserId] = useState<string | null>(() =>
    localStorage.getItem("userId"),
  );
  const [walkthroughStep, setWalkthroughStep] =
    useState<WalkthroughStep | null>(null);
  const [onboardingEligible, setOnboardingEligible] = useState(false);
  const [calloutStyle, setCalloutStyle] = useState<CSSProperties>({});
  const [walkthroughFileIndex, setWalkthroughFileIndex] = useState<number>(0);
  const [walkthroughAddedExtra, setWalkthroughAddedExtra] = useState(false);
  const [globalColorMode, setGlobalColorMode] =
    useState<PrintOptions["colorMode"]>("BW");
  const [printFiles, setPrintFiles] = useState<PrintFileState[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verificationCode, setVerificationCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWhatsappSynced, setIsWhatsappSynced] = useState(false);
  const [showSyncWhatsappModal, setShowSyncWhatsappModal] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isPreparingFiles, setIsPreparingFiles] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [uploadStage, setUploadStage] = useState<"uploading" | "converting" | "creating">(
    "uploading",
  );
  const [draftJobId, setDraftJobId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const totalBytes = printFiles.reduce((sum, file) => sum + (file.file?.size ?? 0), 0);
  const overallProgress = uploadProgress.length
    ? Math.round(
        uploadProgress.reduce((sum, value) => sum + value, 0) /
          uploadProgress.length,
      )
    : 0;

  const debounceSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistedOptionsRef = useRef<Record<string, PrintOptions>>({});
  const lastSaveErrorRef = useRef(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousFileCount = useRef(0);
  const uploadButtonRef = useRef<HTMLButtonElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const printModeRef = useRef<HTMLDivElement | null>(null);
  const fileOptionsRef = useRef<HTMLDivElement | null>(null);
  const fileTitleRef = useRef<HTMLButtonElement | null>(null);
  const summaryCardRef = useRef<HTMLDivElement | null>(null);
  const addMoreRef = useRef<HTMLButtonElement | null>(null);

  // useEffect(() => {
  //   setShowSteps(true);
  // }, []);

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
    if (!localStorage.getItem("token")) return;

    getUserSession()
      .then((session) => {
        setIsWhatsappSynced(!!session.whatsappSynced);
        if (session.onboardingCompleted) {
          setOnboardingEligible(false);
          setWalkthroughStep(null);
          return;
        }

        setOnboardingEligible(true);
      })
      .catch(() => {
        setIsWhatsappSynced(false);
        setOnboardingEligible(true);
      });
  }, [userId]);

  const handleForwardFromWhatsapp = useCallback(() => {
    const digits = "918369757906";
    if (isWhatsappSynced) {
      window.open(`https://wa.me/${digits}?text=hi`, "_blank", "noopener,noreferrer");
      return;
    }
    setShowSyncWhatsappModal(true);
  }, [isWhatsappSynced]);

  useEffect(() => {
    const stored = localStorage.getItem("lastReviewVerificationCode");
    if (stored) {
      setVerificationCode(stored);
      localStorage.removeItem("lastReviewVerificationCode");
    }
  }, []);

  useEffect(() => {
    if (showSteps || verificationCode) {
      setWalkthroughStep(null);
      return;
    }

    if (onboardingEligible) {
      setWalkthroughStep((current) => current ?? "upload");
    }
  }, [onboardingEligible, showSteps, verificationCode]);



  const getPendingFiles = useCallback(() =>
    printFiles.filter((file) => {
      if (!file.id) return false;
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
    }), [printFiles]);

  const persistCurrentOptionsNow = useCallback(async (useKeepAlive: boolean) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const pendingFiles = getPendingFiles();
    if (!pendingFiles.length) return;

    await Promise.all(
      pendingFiles.map(async (file) => {
        if (!file.id) return;
        try {
          if (useKeepAlive) {
            await fetch(`${import.meta.env.VITE_API_ORIGIN ?? "https://zopy.devlocstudio.in"}/api/v1/files/printOptions/${file.id}`, {
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
            setError("Failed to save print options. Try again in a moment.");
          }
        }
      }),
    );
  }, [getPendingFiles]);

  useEffect(() => {
    return () => {
      if (debounceSaveRef.current) {
        clearTimeout(debounceSaveRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!printFiles.length || isPreparingFiles || isSubmitting) return;
    if (debounceSaveRef.current) {
      clearTimeout(debounceSaveRef.current);
    }
    debounceSaveRef.current = setTimeout(() => {
      void persistCurrentOptionsNow(false);
    }, 1500);
  }, [printFiles, isPreparingFiles, isSubmitting, persistCurrentOptionsNow]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      void persistCurrentOptionsNow(true);
      if (isSubmitting) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isSubmitting, persistCurrentOptionsNow]);

  const fetchWebDraft = useCallback(async () => {
    if (!userId) return;
    setIsRefreshing(true);
    try {
      const pending = getPendingFiles();
      if (pending.length > 0) {
        await persistCurrentOptionsNow(false);
      }
      
      const job = await getWebDraftJob();
      if (job) {
        setDraftJobId(job.id);
        setPrintFiles((prev) => {
          return job.files.map((f) => {
            const existing = prev.find((p) => p.id === f.id);
            const options = existing?.options || (f.option ? { ...f.option, customRange: f.option.customRange || "" } : defaultPrintOptions());
            lastPersistedOptionsRef.current[f.id] = options;
            return {
              id: f.id,
              url: f.url,
              name: f.name,
              detectedPages: f.pages,
              options,
              pageRangeError: existing?.pageRangeError || "",
            };
          });
        });
      } else {
        setDraftJobId(null);
        setPrintFiles([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  }, [userId, getPendingFiles, persistCurrentOptionsNow]);

  useEffect(() => {
    if (userId) {
      void fetchWebDraft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const socket = getSocket();
    
    // Join room when connected to receive events
    socket.emit("join-room", userId);
    
    const onConnect = () => {
      socket.emit("join-room", userId);
    };

    const handleJobFileAdded = () => {
      void fetchWebDraft();
    };
    
    const handleJobStatusUpdated = (uid: string, _jobId: string, msg: string) => {
      if (uid === userId) {
        setError(msg);
      }
    };

    socket.on("connect", onConnect);
    socket.on("job-file-added", handleJobFileAdded);
    socket.on("job-status-updated", handleJobStatusUpdated);

    return () => {
      socket.emit("leave-room", userId);
      socket.off("connect", onConnect);
      socket.off("job-file-added", handleJobFileAdded);
      socket.off("job-status-updated", handleJobStatusUpdated);
    };
  }, [userId, fetchWebDraft]);

  useEffect(() => {
    if (walkthroughStep === "upload" && printFiles.length > 0) {
      setWalkthroughFileIndex(0);
      setWalkthroughStep("print-type");
    }
  }, [printFiles.length, walkthroughStep]);

  useEffect(() => {
    if (!walkthroughStep) return;
    if (printFiles.length === 0 && walkthroughStep !== "upload") {
      setWalkthroughStep("upload");
    }
  }, [printFiles.length, walkthroughStep]);

  useEffect(() => {
    if (previousFileCount.current === 0 && printFiles.length > 0) {
      if (expandedIdx === null) {
        setExpandedIdx(0);
      }

      if (!walkthroughStep) {
        requestAnimationFrame(() => {
          const target = fileOptionsRef.current;
          if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        });
      }
    }

    if (expandedIdx !== null && expandedIdx >= printFiles.length) {
      setExpandedIdx(null);
    }

    if (
      walkthroughStep === "add-more" &&
      printFiles.length > previousFileCount.current
    ) {
      const newIndex = printFiles.length - 1;
      setWalkthroughFileIndex(newIndex);
      setWalkthroughAddedExtra(true);
      setExpandedIdx(null);
      setWalkthroughStep("file-select");
    }

    previousFileCount.current = printFiles.length;
  }, [expandedIdx, printFiles.length, walkthroughStep]);

  useEffect(() => {
    if (walkthroughStep !== "customize") return;
    setExpandedIdx((current) =>
      current === walkthroughFileIndex ? current : walkthroughFileIndex,
    );
  }, [walkthroughFileIndex, walkthroughStep]);

  useEffect(() => {
    if (!walkthroughStep) return;

    const resolveTarget = () => {
      switch (walkthroughStep) {
        case "upload":
          return uploadButtonRef.current;
        case "print-type":
          return printModeRef.current;
        case "customize":
          return fileOptionsRef.current;
        case "file-select":
          return fileTitleRef.current;
        case "add-more":
          return addMoreRef.current;
        case "summary":
          return summaryCardRef.current;
        case "submit":
          return submitButtonRef.current;
        default:
          return null;
      }
    };

    const updateCallout = () => {
      const target = resolveTarget();
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const top = Math.min(rect.bottom + 10, window.innerHeight - 20);
      const left = rect.left + rect.width / 2;
      setCalloutStyle({ top, left });
    };

    const target = resolveTarget();
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    updateCallout();
    window.addEventListener("resize", updateCallout);
    window.addEventListener("scroll", updateCallout, true);
    return () => {
      window.removeEventListener("resize", updateCallout);
      window.removeEventListener("scroll", updateCallout, true);
    };
  }, [walkthroughStep, printFiles.length]);

  const processFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;

      const incomingBytes = files.reduce((sum, file) => sum + file.size, 0);

      if (totalBytes + incomingBytes > MAX_JOB_UPLOAD_BYTES) {
        setError(
          `Total upload too large (max ${MAX_JOB_UPLOAD_MB} MB per job). Remove some files to continue.`,
        );
        return;
      }

      setError(null);
      setIsPreparingFiles(true);
      setUploadStage("uploading");
      setUploadProgress(files.map(() => 0));

      try {
        const uploads = await requestPresignedUploads(files);
        for (let index = 0; index < files.length; index += 1) {
          await uploadFileToR2(uploads[index]!.uploadUrl, files[index]!);
          setUploadProgress((prev) =>
            prev.map((value, i) => (i === index ? 100 : value)),
          );
        }

        // Check if any files need server-side conversion
        const hasOfficeFiles = files.some((f) =>
          /\.(docx?|pptx?)$/i.test(f.name),
        );
        setUploadStage(hasOfficeFiles ? "converting" : "creating");
        setUploadProgress((prev) => prev.map(() => 100));

        const urlFiles = files.map((file, index) => ({
          name: file.name,
          url: uploads[index]!.publicUrl,
        }));

        const { job } = await addFilesToWebDraft(urlFiles);
        setDraftJobId(job.id);
        
        setPrintFiles(
          job.files.map((f) => {
            const options = f.option ? { ...f.option, customRange: f.option.customRange || "" } : defaultPrintOptions();
            lastPersistedOptionsRef.current[f.id] = options;
            return {
              id: f.id,
              url: f.url,
              name: f.name,
              detectedPages: f.pages,
              options,
              pageRangeError: "",
            };
          })
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.",
        );
      } finally {
        setIsPreparingFiles(false);
        setUploadProgress([]);
      }
    },
    [totalBytes],
  );

  const applyGlobalColorMode = useCallback(
    (mode: PrintOptions["colorMode"]) => {
      setGlobalColorMode(mode);
      setPrintFiles((prev) =>
        prev.map((file) => ({
          ...file,
          options: { ...file.options, colorMode: mode },
        })),
      );
    },
    [],
  );

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

  const removeFile = useCallback(async (idx: number) => {
    const target = printFiles[idx];
    if (target?.id) {
      try {
        await deleteUserFile(target.id);
      } catch (err) {
        console.error("Failed to delete user file", err);
      }
    }
    setPrintFiles((prev) => prev.filter((_, i) => i !== idx));
    setExpandedIdx((prev) => (prev === idx ? null : prev));
  }, [printFiles]);

  const handleFileToggle = useCallback(
    (idx: number) => {
      if (walkthroughStep === "file-select" && idx === walkthroughFileIndex) {
        setExpandedIdx(idx);
        setWalkthroughStep("customize");
        return;
      }

      setExpandedIdx((prev) => (prev === idx ? null : idx));
    },
    [walkthroughFileIndex, walkthroughStep],
  );

  const onSubmit = async () => {
    if (!userId || !printFiles.length || isSubmitting || !draftJobId) return;

    if (walkthroughStep === "submit") {
      setWalkthroughStep(null);
      void markOnboardingCompleted();
    }

    if (!captchaToken) {
      setError("Please complete the CAPTCHA verification");
      return;
    }

    if (totalBytes > MAX_JOB_UPLOAD_BYTES) {
      setError(
        `Total upload too large (max ${MAX_JOB_UPLOAD_MB} MB per job). Remove some files to continue.`,
      );
      return;
    }

    setUploadStage("creating");
    setIsSubmitting(true);
    setError(null);
    setUploadProgress(printFiles.map(() => 0));

    try {
      const result = await submitWhatsappJobReview({
        jobId: draftJobId,
        files: printFiles.map((pf) => ({
          id: pf.id!,
          options: pf.options,
        })),
      });

      setVerificationCode(String(result.verificationCode));
      setPrintFiles([]);
      setDraftJobId(null);
      setExpandedIdx(null);
      setCaptchaToken(null);
      setRefreshTrigger((t) => t + 1);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
      if (
        err instanceof Error &&
        /captcha|turnstile|verification/i.test(err.message)
      ) {
        setCaptchaToken(null);
      }
    } finally {
      setIsSubmitting(false);
      setUploadProgress([]);
    }
  };

  const totals = buildJobTotals(printFiles);

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
    !!captchaToken &&
    totalBytes <= MAX_JOB_UPLOAD_BYTES;
  const successDigits = verificationCode ? verificationCode.split("") : [];
  const isWalkthroughActive = walkthroughStep !== null;
  const showCallout =
    walkthroughStep === "upload" ||
    walkthroughStep === "print-type" ||
    walkthroughStep === "customize" ||
    walkthroughStep === "add-more" ||
    walkthroughStep === "file-select" ||
    walkthroughStep === "submit";
  const showCalloutButton =
    walkthroughStep === "print-type" ||
    walkthroughStep === "customize" ||
    walkthroughStep === "add-more" ||
    walkthroughStep === "submit";
  const calloutText = (() => {
    switch (walkthroughStep) {
      case "upload":
        return "Start by uploading your PDF files here.";
      case "print-type":
        return "Choose Color or B/W for all files, then select Next.";
      case "customize":
        return "Choose your print options and select Next.";
      case "add-more":
        return "Use this to add more files, then select Next.";
      case "file-select":
        return "Click the file to change its print options.";
      case "submit":
        return "You're all set! Submit your job or press Done to finish.";
      default:
        return "";
    }
  })();
  const calloutButtonLabel = (() => {
    switch (walkthroughStep) {
      case "print-type":
      case "customize":
      case "add-more":
        return "Next";
      case "submit":
        return "Done";
      default:
        return "";
    }
  })();
  const handleCalloutAction = () => {
    switch (walkthroughStep) {
      case "print-type":
        setWalkthroughStep("customize");
        break;
      case "customize":
        if (walkthroughAddedExtra) {
          setWalkthroughAddedExtra(false);
          setWalkthroughStep("submit");
        } else {
          setWalkthroughStep("add-more");
        }
        break;
      case "add-more":
        setWalkthroughStep("submit");
        break;
      case "submit":
        setWalkthroughStep(null);
        void markOnboardingCompleted();
        break;
      default:
        break;
    }
  };

  return (
    <div className="app-shell">
      {showSteps && !isSubmitting && (
        <div
          className="modal-shell"
          role="dialog"
          aria-modal="true"
          aria-labelledby="how-it-works-title"
          onClick={() => setShowSteps(false)}
        >
          <div
            className="modal-card steps-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="steps-head">
              <div>
                <p className="modal-label">How it works</p>
                <h2 id="how-it-works-title">Print in four steps</h2>
                <p className="modal-helper">
                  Please read these steps before placing an order.
                </p>
              </div>
            </div>
            <ol className="steps-list">
              <li className="steps-item">
                <span className="steps-badge">1</span>
                <p>Save your PDFs to your device.</p>
              </li>
              <li className="steps-item">
                <span className="steps-badge">2</span>
                <p>Upload your PDFs.</p>
              </li>
              <li className="steps-item">
                <span className="steps-badge">3</span>
                <p>Customize your PDF prints.</p>
              </li>
              <li className="steps-item">
                <span className="steps-badge">4</span>
                <p>Collect your prints from the stationery.</p>
              </li>
            </ol>
            <div className="steps-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowSteps(false)}
              >
                I have read the steps
              </button>
            </div>
          </div>
        </div>
      )}
      {isWalkthroughActive && !isPreparingFiles && (
        <div className="walkthrough-layer" aria-hidden="true">
          <div className="walkthrough-dim" />
          {showCallout && calloutText && (
            <div
              className={
                walkthroughStep === "upload"
                  ? "walkthrough-callout walkthrough-callout--center"
                  : "walkthrough-callout"
              }
              style={calloutStyle}
            >
              <span>{calloutText}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {showCalloutButton && (
                  <button
                    type="button"
                    className="btn btn-primary walkthrough-callout-btn"
                    onClick={handleCalloutAction}
                  >
                    {calloutButtonLabel}
                  </button>
                )}
                <button
                  type="button"
                  className="walkthrough-skip-btn"
                  onClick={() => {
                    setWalkthroughStep(null);
                    void markOnboardingCompleted();
                  }}
                >
                  Skip
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {isSubmitting && (
        <div className="upload-overlay" role="status" aria-live="polite">
          <div className="upload-card">
            <div className="upload-spinner" aria-hidden="true" />
            <p className="upload-title">
              {uploadStage === "creating"
                ? "Generating OTP"
                : "Uploading files"}
            </p>
            <p className="upload-subtitle">
              {uploadStage === "creating"
                ? "Finalizing your print job and verifying files."
                : `Uploading ${printFiles.length} file(s) to the shopkeeper.`}
            </p>
            <div className="upload-progress-track" aria-hidden="true">
              <span
                className="upload-progress-fill"
                style={{
                  width: `${
                    uploadStage === "creating" ? 100 : overallProgress
                  }%`,
                }}
              />
            </div>
            <p className="upload-progress">
              {uploadStage === "creating"
                ? "Almost done..."
                : `${overallProgress}% complete`}
            </p>
          </div>
        </div>
      )}
      
      <header className="top-bar">
        <div className="brand-row" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div>
            <p className="brand-title" style={{ margin: 0, fontSize: "1.5rem", fontWeight: "bold" }}>ZOPY</p>
            <span className="brand-subtitle" style={{ fontSize: "0.85rem", opacity: 0.8 }}>
              PRINT FROM ANYWHERE
            </span>
          </div>
        </div>

        <div className="top-bar-actions">
          <Link to="/about" className="ghost-link">
            About Us
          </Link>
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
        </div>
      </header>

      <main className="main-wrap">
        {error && <div className="banner-error">{error}</div>}

          <>
            <section className="hero-panel">
              <div className="hero-header">
            <h1>Upload Documents</h1>
            <p>Choose Color or B/W once, then set options per file.</p>
          </div>

          {verificationCode ? (
            <div className="success-stack">
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
                <span className="highlight-text">
                  Show this to the shopkeeper and collect your prints.
                </span>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setVerificationCode(null)}
                >
                  Create More Jobs
                </button>
              </div>
              <div className="feedback-card">
                <div>
                  <p className="feedback-title">We are in beta</p>
                  <p className="feedback-note highlight-text">
                    We are also from TCET and would love to hear your feedback
                    and ideas.
                  </p>
                </div>
                <a
                  className="btn feedback-btn"
                  href="https://forms.gle/sMmC5ePS5RxP6ZLJ7"
                  target="_blank"
                  rel="noreferrer"
                >
                  Share Feedback
                </a>
              </div>
            </div>
          ) : (
            <>
              <div
                className={
                  isDragActive ? "upload-dropzone active" : "upload-dropzone"
                }
                aria-busy={isPreparingFiles}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragActive(true);
                }}
                onDragLeave={() => setIsDragActive(false)}
                onDrop={onDrop}
              >
                <button
                  type="button"
                  ref={uploadButtonRef}
                  className={
                    walkthroughStep === "upload"
                      ? "upload-circle walkthrough-target"
                      : "upload-circle"
                  }
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload
                    size={34}
                    strokeWidth={2.2}
                    className="upload-circle-icon"
                  />
                  <span className="upload-circle-label">Upload Files</span>
                </button>
                <p>
                  {isPreparingFiles
                    ? uploadStage === "converting"
                      ? "Converting documents. Please wait..."
                      : uploadStage === "creating"
                        ? "Processing files. Please wait..."
                        : "Uploading files. Please wait..."
                    : "PDF, Word, PowerPoint, or images."}
                </p>
                {isPreparingFiles && (
                  <div
                    className="upload-inline-loader"
                    role="status"
                    aria-live="polite"
                  >
                    <span
                      className="upload-inline-loader-dot"
                      aria-hidden="true"
                    />
                    {uploadStage === "converting"
                      ? "Converting to PDF..."
                      : uploadStage === "creating"
                        ? "Processing..."
                        : "Uploading file(s)..."}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }}>
                <button
                  type="button"
                  className="whatsapp-forward-btn"
                  onClick={handleForwardFromWhatsapp}
                  style={{ width: "100%" }}
                >
                  <MessageCircle size={20} />
                  Forward from WhatsApp (Beta)
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => fetchWebDraft()}
                  style={{ width: "100%", justifyContent: "center" }}
                  disabled={isRefreshing}
                >
                  {isRefreshing ? (
                    <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span className="upload-inline-loader-dot" aria-hidden="true" style={{ width: 12, height: 12, borderWidth: 2 }} />
                      Refreshing...
                    </span>
                  ) : (
                    "Refresh Files"
                  )}
                </button>
              </div>

              {printFiles.length > 0 && (
                <>
                  <div className="section-head">
                    <h2>File Options</h2>
                  </div>

                  <div
                    ref={printModeRef}
                    className={
                      walkthroughStep === "print-type"
                        ? "print-mode-top walkthrough-target"
                        : "print-mode-top"
                    }
                  >
                    <p className="field-label">
                      Print Type (applies to all files)
                    </p>
                    <ToggleGroup
                      options={[
                        { label: "Color Print", value: "COLOR" },
                        { label: "B/W Print", value: "BW" },
                      ]}
                      value={globalColorMode}
                      onChange={(v) => applyGlobalColorMode(v)}
                    />
                  </div>

                  <div className="upload-file-list">
                    {printFiles.map((pf, idx) => (
                      <FileCard
                        key={`${pf.name}-${idx}`}
                        pf={pf}
                        expanded={expandedIdx === idx}
                        onToggle={() => handleFileToggle(idx)}
                        isWalkthroughTarget={
                          walkthroughStep === "customize" &&
                          idx === walkthroughFileIndex
                        }
                        walkthroughRef={
                          idx === walkthroughFileIndex
                            ? (node) => {
                                fileOptionsRef.current = node;
                              }
                            : undefined
                        }
                        titleRef={
                          idx === walkthroughFileIndex
                            ? (node) => {
                                fileTitleRef.current = node;
                              }
                            : undefined
                        }
                        isTitleWalkthroughTarget={
                          walkthroughStep === "file-select" &&
                          idx === walkthroughFileIndex
                        }
                        onUpdate={(patch) => updateOptions(idx, patch)}
                        onRemove={() => removeFile(idx)}
                      />
                    ))}
                  </div>

                  <div className="section-foot">
                    <button
                      type="button"
                      ref={addMoreRef}
                      className={
                        walkthroughStep === "add-more"
                          ? "ghost-link add-more-btn walkthrough-target"
                          : "ghost-link add-more-btn"
                      }
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Plus size={16} aria-hidden="true" />
                      Add More
                    </button>
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

                  <div
                    ref={summaryCardRef}
                    className="summary-card"
                  >
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
                      theme={theme === "dark" ? "dark" : "light"}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={onSubmit}
                    disabled={!canSubmit}
                    ref={submitButtonRef}
                    className={`${
                      canSubmit
                        ? "btn btn-primary submit-btn"
                        : "btn btn-disabled submit-btn"
                    }${walkthroughStep === "submit" ? " walkthrough-target" : ""}`}
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
              accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.bmp,.tiff,.tif,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/jpeg,image/png,image/gif,image/bmp,image/tiff,image/webp"
              multiple
              className="hidden-input"
              onChange={onFilesSelected}
            />
          </>

        <PrintJobsList userId={userId} refreshTrigger={refreshTrigger} />
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
      {showSyncWhatsappModal && (
        <div className="modal-shell" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-head">
              <div>
                <h2>Sync WhatsApp</h2>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowSyncWhatsappModal(false)}
              >
                x
              </button>
            </div>
            <p className="modal-helper" style={{ marginTop: "16px", marginBottom: "24px" }}>
              You have to sync WhatsApp to access this feature.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setShowSyncWhatsappModal(false)}
              >
                Close
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
                  setShowSyncWhatsappModal(false);
                }}
              >
                Sync
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
