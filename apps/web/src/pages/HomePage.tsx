import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, CSSProperties } from "react";
import type { PrintFileOption as PrintOptions } from "@printowl/types";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  ChevronDown,
  Copy,
  FileText,
  MessageCircle,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
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
  deleteUserPrintJob,
  storage,
} from "../api/api";
import { useNotifications } from "../components/NotificationCenter";
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
import Navbar from "../components/Navbar";

const MAX_JOB_UPLOAD_MB = 50;
const MAX_JOB_UPLOAD_BYTES = MAX_JOB_UPLOAD_MB * 1024 * 1024;

type WalkthroughStep =
  | "upload"
  | "customize"
  | "add-more"
  | "file-select"
  | "summary"
  | "submit";



function ToggleGroup<T extends string | number>({
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
    <motion.article 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="upload-file-card review-file-card"
    >
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
            className="remove-file-btn"
            onClick={onRemove}
            aria-label="Remove file"
          >
            <X size={14} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            ref={walkthroughRef}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
            className={
              isWalkthroughTarget
                ? "upload-file-body walkthrough-target"
                : "upload-file-body"
            }
          >
            <div>
            <p className="field-label">Color Mode</p>
            <ToggleGroup
              options={[
                { label: "B/W", value: "BW" },
                { label: "Color", value: "COLOR" },
              ]}
              value={pf.options.colorMode}
              onChange={(v) => onUpdate({ colorMode: v })}
            />
          </div>

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
                  value={pf.options.customRange ?? ""}
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
            <p className="field-label">Pages per Sheet</p>
            <ToggleGroup
              options={[
                { label: "1", value: 1 },
                { label: "2", value: 2 },
                { label: "4", value: 4 },
              ]}
              value={pf.options.pagesPerSheet}
              onChange={(v) => onUpdate({ pagesPerSheet: v })}
            />
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
        </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
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
    storage.get("userId"),
  );
  const [walkthroughStep, setWalkthroughStep] =
    useState<WalkthroughStep | null>(null);
  const [onboardingEligible, setOnboardingEligible] = useState(false);
  const [calloutStyle, setCalloutStyle] = useState<CSSProperties>({});
  const [walkthroughFileIndex, setWalkthroughFileIndex] = useState<number>(0);
  const [walkthroughAddedExtra, setWalkthroughAddedExtra] = useState(false);
  const [printFiles, setPrintFiles] = useState<PrintFileState[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verificationCode, setVerificationCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { notify } = useNotifications();
  const [isWhatsappSynced, setIsWhatsappSynced] = useState(false);
  const [showSyncWhatsappModal, setShowSyncWhatsappModal] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isPreparingFiles, setIsPreparingFiles] = useState(false);

  // ── Global print options panel state ──
  const [showGlobalOptions, setShowGlobalOptions] = useState(false);
  const [globalSelectedFiles, setGlobalSelectedFiles] = useState<Set<number>>(new Set());
  const [globalOptions, setGlobalOptions] = useState({
    duplex: "ONE" as PrintOptions["duplex"],
    orientation: "PORTRAIT" as PrintOptions["orientation"],
    scaleMode: "FIT" as PrintOptions["scaleMode"],
    copies: 1,
    pagesPerSheet: 1,
  });

  const [uploadStage, setUploadStage] = useState<"uploading" | "converting" | "creating">(
    "uploading",
  );
  const [draftJobId, setDraftJobId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const totalBytes = printFiles.reduce((sum, file) => sum + ((file.file as any)?.size ?? 0), 0);
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
  const fileOptionsRef = useRef<HTMLDivElement | null>(null);
  const fileTitleRef = useRef<HTMLButtonElement | null>(null);
  const summaryCardRef = useRef<HTMLDivElement | null>(null);
  const addMoreRef = useRef<HTMLButtonElement | null>(null);

  // useEffect(() => {
  //   setShowSteps(true);
  // }, []);

  useEffect(() => {
    // If we already have a userId in state, we're good.
    if (userId) return;

    // Double check storage in case it was just set (e.g. during redirect)
    const storedUserId = storage.get("userId");
    const storedToken = storage.get("token");
    if (storedUserId && storedToken) {
      setUserId(storedUserId);
      return;
    }

    // Only register if we truly have no session
    registerUser()
      .then(({ token, userId }) => {
        storage.set("userId", userId);
        storage.set("token", token);
        setUserId(userId);
      })
      .catch(() => {
        setError("Failed to initialize session. Please verify API is running.");
      });
  }, [userId]);


  useEffect(() => {
    if (!userId) return;
    if (!storage.get("token")) return;

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
      window.open(`https://wa.me/${digits}`, "_blank", "noopener,noreferrer");
      return;
    }
    setShowSyncWhatsappModal(true);
  }, [isWhatsappSynced]);

  useEffect(() => {
    const stored = storage.get("lastReviewVerificationCode");
    if (stored) {
      setVerificationCode(stored);
      storage.remove("lastReviewVerificationCode");
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
    const token = storage.get("token");
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
      if (isSubmitting || isPreparingFiles) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isSubmitting, isPreparingFiles, persistCurrentOptionsNow]);

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
        notify(msg, { variant: "success" });
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
      setWalkthroughStep("customize");
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

      // ── Enforce 30-file limit BEFORE any upload ──
      const MAX_FILES = 30;
      const existingCount = printFiles.length;
      const availableSlots = MAX_FILES - existingCount;

      if (availableSlots <= 0) {
        const msg = `You already have ${MAX_FILES} files. Remove some before adding more.`;
        notify(msg, { variant: "error" });
        setError(msg);
        return;
      }

      if (files.length > availableSlots) {
        const msg = `Cannot upload more than ${MAX_FILES} documents. You can add ${availableSlots} more file(s). Please reselect and upload again.`;
        notify(msg, { variant: "error" },);
        setError(msg);
        return;
      }

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
        const hasConvertibleFiles = files.some((f) =>
          /\.(docx?|pptx?|png|jpe?g|bmp|tiff?|webp|gif)$/i.test(f.name),
        );
        setUploadStage(hasConvertibleFiles ? "converting" : "creating");
        setUploadProgress((prev) => prev.map(() => 100));

        const urlFiles = files.map((file, index) => ({
          name: file.name,
          url: uploads[index]!.publicUrl,
        }));

        const { job } = await addFilesToWebDraft(
          urlFiles
        );
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
    [totalBytes, printFiles.length],
  );

  const toggleGlobalFileSelection = useCallback((idx: number) => {
    setGlobalSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }, []);

  const toggleAllGlobalFiles = useCallback(() => {
    setGlobalSelectedFiles((prev) => {
      if (prev.size === printFiles.length) {
        return new Set();
      }
      return new Set(printFiles.map((_, i) => i));
    });
  }, [printFiles.length]);

  const applyGlobalOptions = useCallback(() => {
    if (globalSelectedFiles.size === 0) return;
    setPrintFiles((prev) =>
      prev.map((file, idx) => {
        if (!globalSelectedFiles.has(idx)) return file;
        return {
          ...file,
          options: {
            ...file.options,
            duplex: globalOptions.duplex,
            orientation: globalOptions.orientation,
            scaleMode: globalOptions.scaleMode,
            copies: globalOptions.copies,
            pagesPerSheet: globalOptions.pagesPerSheet,
          },
        };
      }),
    );
    notify(`Applied global options to ${globalSelectedFiles.size} file(s)`, {
      variant: "success",
    });
  }, [globalSelectedFiles, globalOptions, notify]);

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

      const dropped = Array.from(event.dataTransfer.files).filter((file) => {
        const name = file.name.toLowerCase();
        return (
          name.endsWith(".pdf") ||
          name.endsWith(".doc") || name.endsWith(".docx") ||
          name.endsWith(".ppt") || name.endsWith(".pptx") ||
          name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") ||
          name.endsWith(".bmp") || name.endsWith(".tiff") || name.endsWith(".tif") ||
          name.endsWith(".webp") || name.endsWith(".gif")
        );
      });
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

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const clearDraft = useCallback(async () => {
    setIsClearing(true);
    try {
      if (draftJobId) {
        await deleteUserPrintJob(draftJobId);
      }
      setPrintFiles([]);
      setDraftJobId(null);
      setExpandedIdx(null);
      setError(null);
      setShowClearConfirm(false);
    } catch (err) {
      console.error("Failed to clear draft", err);
      setError("Failed to clear draft. Please try again.");
    } finally {
      setIsClearing(false);
    }
  }, [draftJobId]);

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

      setRefreshTrigger((t) => t + 1);
    } catch (err) {
      const errMsg =
        err instanceof Error
          ? err.message
          : "Something went wrong.";
      notify(`${errMsg} Please try again now.`, { variant: "error" });

    } finally {
      setIsSubmitting(false);
      setUploadProgress([]);
    }
  };

  const totals = buildJobTotals(printFiles);

  const hasErrors = printFiles.some(
    (f) =>
      f.pageRangeError ||
      (f.options.pageRange === "CUSTOM" && !f.options.customRange?.trim()),
  );

  const canSubmit =
    !!userId &&
    printFiles.length > 0 &&
    !hasErrors &&
    !isSubmitting &&
    totalBytes <= MAX_JOB_UPLOAD_BYTES;
  const successDigits = verificationCode ? verificationCode.split("") : [];
  const isWalkthroughActive = walkthroughStep !== null;
  const showCallout =
    walkthroughStep === "upload" ||
    walkthroughStep === "customize" ||
    walkthroughStep === "add-more" ||
    walkthroughStep === "file-select" ||
    walkthroughStep === "submit";
  const showCalloutButton =
    walkthroughStep === "customize" ||
    walkthroughStep === "add-more" ||
    walkthroughStep === "submit";
  const calloutText = (() => {
    switch (walkthroughStep) {
      case "upload":
        return "Start by uploading your PDF files here.";
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
      
      <Navbar 
        theme={theme} 
        onToggleTheme={onToggleTheme} 
      />

      <main className="main-wrap">
        {error && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="banner-error">{error}</motion.div>}

          <>
            <motion.section 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="hero-panel"
            >
              <div className="hero-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", marginBottom: "20px" }}>
                <div>
                  <h1 style={{ margin: 0 }}>Upload Documents</h1>
                  <p style={{ margin: "4px 0 0", opacity: 0.8 }}>Set your print options for each file individually.</p>
                </div>
                {!isWhatsappSynced && (
                  <button
                    type="button"
                    className="btn btn-sync-nav"
                    style={{ 
                      borderRadius: "10px",
                    }}
                    onClick={handleForwardFromWhatsapp}
                  >
                    <MessageCircle size={15} />
                    SYNC
                  </button>
                )}
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
                    : "PDF, Word, PowerPoint, or Images."}
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

              <button
                type="button"
                className="whatsapp-cta-btn"
                onClick={handleForwardFromWhatsapp}
              >
                <MessageCircle size={18} />
                Forward from WhatsApp
              </button>

              <div className="draft-actions-row">
                <button
                  type="button"
                  className="draft-action-btn"
                  onClick={() => fetchWebDraft()}
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "Refreshing..." : <><RefreshCw size={12} /> Refresh Files</>}
                </button>
                {printFiles.length > 0 && (
                  <button
                    type="button"
                    className="draft-action-btn draft-action-btn--danger"
                    onClick={() => setShowClearConfirm(true)}
                  >
                    <Trash2 size={12} /> Clear Draft
                  </button>
                )}
              </div>

              {printFiles.length > 0 && (
                <>
                  <div className="section-head">
                    <h2>File Options</h2>
                  </div>



                  {/* ── Global Print Options Panel ── */}
                  <div className="global-options-panel">
                    <button
                      type="button"
                      className="global-options-toggle"
                      onClick={() => {
                        const willOpen = !showGlobalOptions;
                        setShowGlobalOptions(willOpen);
                        if (willOpen && globalSelectedFiles.size === 0) {
                          setGlobalSelectedFiles(new Set(printFiles.map((_, i) => i)));
                        }
                      }}
                    >
                      <div className="global-options-toggle-left">
                        <Copy size={14} />
                        <span>Apply Options to Multiple Files</span>
                      </div>
                      <ChevronDown
                        size={16}
                        className={showGlobalOptions ? "global-chevron global-chevron--open" : "global-chevron"}
                      />
                    </button>

                    {showGlobalOptions && (
                      <div className="global-options-body">
                        <div className="global-options-fields">
                          <div>
                            <p className="field-label">Print Sides</p>
                            <ToggleGroup
                              options={[
                                { label: "One Side", value: "ONE" },
                                { label: "Both Sides", value: "BOTH" },
                              ]}
                              value={globalOptions.duplex}
                              onChange={(v) => setGlobalOptions((p) => ({ ...p, duplex: v }))}
                            />
                          </div>

                          <div>
                            <p className="field-label">Orientation</p>
                            <ToggleGroup
                              options={[
                                { label: "Vertical", value: "PORTRAIT" },
                                { label: "Horizontal", value: "LANDSCAPE" },
                              ]}
                              value={globalOptions.orientation}
                              onChange={(v) => setGlobalOptions((p) => ({ ...p, orientation: v }))}
                            />
                          </div>

                          <div>
                            <p className="field-label">Scale</p>
                            <ToggleGroup
                              options={[
                                { label: "Fit to paper", value: "FIT" },
                                { label: "Original size", value: "NOSCALE" },
                              ]}
                              value={globalOptions.scaleMode}
                              onChange={(v) => setGlobalOptions((p) => ({ ...p, scaleMode: v }))}
                            />
                          </div>

                          <div>
                            <p className="field-label">Pages per Sheet</p>
                            <ToggleGroup
                              options={[
                                { label: "1", value: 1 },
                                { label: "2", value: 2 },
                                { label: "4", value: 4 },
                              ]}
                              value={globalOptions.pagesPerSheet}
                              onChange={(v) => setGlobalOptions((p) => ({ ...p, pagesPerSheet: v }))}
                            />
                          </div>

                          <div>
                            <p className="field-label">Copies</p>
                            <div className="counter">
                              <button
                                type="button"
                                onClick={() =>
                                  setGlobalOptions((p) => ({ ...p, copies: Math.max(1, p.copies - 1) }))
                                }
                              >
                                -
                              </button>
                              <span>{globalOptions.copies}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setGlobalOptions((p) => ({ ...p, copies: p.copies + 1 }))
                                }
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="global-file-select">
                          <div className="global-file-select-header">
                            <p className="field-label">Apply to files:</p>
                            <button
                              type="button"
                              className="global-select-all-btn"
                              onClick={toggleAllGlobalFiles}
                            >
                              {globalSelectedFiles.size === printFiles.length
                                ? "Deselect All"
                                : "Select All"}
                            </button>
                          </div>

                          <div className="global-file-checklist">
                            {printFiles.map((pf, idx) => (
                              <label
                                key={`global-${pf.name}-${idx}`}
                                className={`global-file-check-item${
                                  globalSelectedFiles.has(idx) ? " selected" : ""
                                }`}
                              >
                                <span
                                  className={`global-checkbox${
                                    globalSelectedFiles.has(idx) ? " checked" : ""
                                  }`}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    toggleGlobalFileSelection(idx);
                                  }}
                                >
                                  {globalSelectedFiles.has(idx) && <Check size={12} />}
                                </span>
                                <span className="global-file-name">{pf.name}</span>
                                <span className="global-file-pages">{pf.detectedPages}p</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn btn-primary global-apply-btn"
                          disabled={globalSelectedFiles.size === 0}
                          onClick={applyGlobalOptions}
                        >
                          <Copy size={14} />
                          Apply to {globalSelectedFiles.size} file{globalSelectedFiles.size !== 1 ? "s" : ""}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="upload-file-list">
                    <AnimatePresence>
                    {printFiles.map((pf, idx) => (
                      <FileCard
                        key={pf.id || `${pf.name}-${idx}`}
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
                    </AnimatePresence>
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
        </motion.section>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.bmp,.tiff,.tif,.webp,.gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/png,image/jpeg,image/bmp,image/tiff,image/webp,image/gif"
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
        <div className="modal-shell" role="dialog" aria-modal="true" onClick={() => setShowSyncWhatsappModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "420px" }}>
            <div className="modal-head">
              <div>
                <h2>Sync WhatsApp</h2>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowSyncWhatsappModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: "16px 0 20px" }}>
              <p style={{ color: "var(--text-muted)", fontSize: "14px", lineHeight: "1.5", margin: "0 0 16px" }}>
                Connect your WhatsApp to send documents directly from your phone.
              </p>
              <ol className="sync-steps">
                <li>Tap <strong>Sync on WhatsApp</strong> below</li>
                <li>It opens WhatsApp — just send the message</li>
                <li>You'll receive a link — tap it to connect</li>
              </ol>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setShowSyncWhatsappModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
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
                <MessageCircle size={16} />
                Sync on WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
      {showClearConfirm && (
        <div className="modal-shell" role="dialog" aria-modal="true" onClick={() => setShowClearConfirm(false)}>
          <div className="modal-card" style={{ maxWidth: "400px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2 style={{ fontSize: "18px" }}>Clear Draft?</h2>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowClearConfirm(false)}
              >
                x
              </button>
            </div>
            <p className="modal-helper" style={{ marginTop: "12px", marginBottom: "20px" }}>
              This will permanently delete all {printFiles.length} file{printFiles.length !== 1 ? "s" : ""} from your current draft. This action cannot be undone.
            </p>
            <div className="modal-actions" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn"
                onClick={() => setShowClearConfirm(false)}
                disabled={isClearing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={clearDraft}
                disabled={isClearing}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <Trash2 size={14} />
                {isClearing ? "Clearing..." : "Delete All"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
