import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  deleteUserPrintJob,
  getUserPrintJobById,
  getUserPrintJobs,
  resubmitCompletedPrintJob,
} from "../api/api";
import type { UserPrintJob, UserPrintJobFile } from "../api/api";
import { getSocket } from "../services/getSocket";
import { useNotifications } from "./NotificationCenter";

type JobsTab = "ACTIVE" | "COMPLETED" | "HISTORY";

const ACTIVE_STATUSES = ["PENDING", "PROCESSING"];
const COMPLETED_STATUSES = ["COMPLETED"];
const REJECTED_STATUSES = ["REJECTED", "FAILED"];
const CANCELED_STATUSES = ["CANCELED"];
const JOBS_PER_PAGE = 4;

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatPrice(amount: number) {
  return currencyFormatter.format(amount);
}

function getStatusBadgeClass(status: string, expired?: boolean) {
  if (expired) return "status-pill status-pill-expired";
  if (ACTIVE_STATUSES.includes(status)) return "status-pill status-pill-active";
  if (COMPLETED_STATUSES.includes(status)) {
    return "status-pill status-pill-completed";
  }
  if (CANCELED_STATUSES.includes(status)) {
    return "status-pill status-pill-canceled";
  }
  if (REJECTED_STATUSES.includes(status))
    return "status-pill status-pill-rejected";
  return "status-pill";
}

function getStatusDisplayText(status: string, expired?: boolean) {
  if (expired && status === "COMPLETED") return "COMPLETED · EXPIRED";
  if (expired) return `${status} · EXPIRED`;
  return status;
}

function FileOptionCard({
  file,
  canViewFile,
}: {
  file: UserPrintJobFile;
  canViewFile: boolean;
}) {
  const opt = file.option;
  const colorLabel =
    opt?.colorMode === "COLOR" ? "Color" : "B\u0026W";
  const duplexLabel = opt?.duplex === "BOTH" ? "Both Sides" : "One Side";
  const paperLabel = opt?.paperSize ?? "A4";

  return (
    <div className="job-file-card">
      <div className="job-file-top">
        <div className="job-file-title-wrap">
          <span className="job-file-icon" aria-hidden="true">
            <FileText size={16} />
          </span>
          <p>{file.name}</p>
        </div>
        {canViewFile && (
          <a href={file.url} target="_blank" rel="noopener noreferrer">
            View File
          </a>
        )}
      </div>
      <p className="job-file-pages">{file.pages} pages</p>
      {opt && (
        <div className="job-file-chips">
          <span className={`job-chip ${opt.colorMode === "COLOR" ? "job-chip--color" : "job-chip--bw"}`}>
            {colorLabel}
          </span>
          <span className="job-chip">{duplexLabel}</span>
          <span className="job-chip">{paperLabel}</span>
          {opt.pageRange === "CUSTOM" && opt.customRange && (
            <span className="job-chip">Pages: {opt.customRange}</span>
          )}
          {opt.pagesPerSheet && opt.pagesPerSheet > 1 && (
            <span className="job-chip">{opt.pagesPerSheet}-up</span>
          )}
          {(opt.copies ?? 1) > 1 && (
            <span className="job-chip job-chip--copies">{opt.copies}x copies</span>
          )}
        </div>
      )}
    </div>
  );
}

function JobDetailModal({
  jobId,
  onClose,
  onJobUpdated,
  onJobDeleted,
}: {
  jobId: string;
  onClose: () => void;
  onJobUpdated: (job: UserPrintJob) => void;
  onJobDeleted: (jobId: string) => void;
}) {
  const { notify } = useNotifications();
  const [job, setJob] = useState<UserPrintJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResubmitting, setIsResubmitting] = useState(false);

  const loadJob = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const fetched = await getUserPrintJobById(jobId);
      setJob(fetched);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load job details",
      );
      setJob(null);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void loadJob();
  }, [loadJob]);

  useEffect(() => {
    const socket = getSocket();

    const handler = (_userId: string, updatedJobId: string) => {
      if (updatedJobId === jobId) {
        console.log(`Job ${jobId} updated, reloading details...`);
        void loadJob();
      }
    };

    socket.on("job-status-updated", handler);
    return () => {
      socket.off("job-status-updated", handler);
    };
  }, [jobId, loadJob]);

  const displayOtp = job?.verificationCode ?? job?.oldOtp;
  const otpDigits = displayOtp ? String(displayOtp).split("") : [];
  const isExpired = !!job?.expired;
  const canDelete = job ? (ACTIVE_STATUSES.includes(job.status) && !isExpired) : false;
  const canResubmit = job ? (COMPLETED_STATUSES.includes(job.status) && !isExpired) : false;
  const canViewFiles = job ? (!["REJECTED", "CANCELED"].includes(job.status) && !isExpired) : false;

  const handleRefreshStatus = async () => {
    await loadJob();
  };

  const handleDeleteJob = async () => {
    if (!job || !canDelete || isDeleting) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this print job? This will permanently remove the job and its files from cloud storage.",
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await deleteUserPrintJob(job.id);
      notify("Job deleted successfully", { variant: "success" });
      onJobDeleted(job.id);
      onClose();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete this job";
      notify(msg, { variant: "error" });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmitAgain = async () => {
    if (!job || !canResubmit || isResubmitting) return;

    setIsResubmitting(true);
    try {
      await resubmitCompletedPrintJob(job.id);
      const refreshed = await getUserPrintJobById(job.id);
      setJob(refreshed);
      onJobUpdated(refreshed);
      notify("Job submitted again", { variant: "success" });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to submit job again";
      notify(msg, { variant: "error" });
    } finally {
      setIsResubmitting(false);
    }
  };

  return (
    <div
      className="modal-shell"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="modal-label">Print Job</p>
            <h2>Job Details</h2>
            {job && (
              <p className="modal-helper">
                {new Date(job.createdAt).toLocaleString()}
              </p>
            )}
            {loading && <div className="skeleton skeleton-title" style={{ marginTop: "8px" }}></div>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            x
          </button>
        </div>

        {error && (
          <div style={{ padding: "20px 0" }}>
            <p className="modal-error">{error}</p>
            <button type="button" className="btn btn-primary" style={{ marginTop: "12px" }} onClick={onClose}>
              Close
            </button>
          </div>
        )}

        {!error && (
          <>
            <div className="otp-card">
              {loading ? (
                <div className="skeleton skeleton-modal-otp" style={{ margin: 0 }}></div>
              ) : job ? (
                <>
                  <p className="otp-title">
                    {job.verificationCode
                      ? "Verification Code"
                      : isExpired
                        ? "Previous Verification Code"
                        : "Verification Code"}
                  </p>
                  {otpDigits.length > 0 ? (
                    <>
                      <div
                        className="otp-digits"
                        aria-label={`Verification code ${displayOtp}`}
                      >
                        {otpDigits.map((digit, idx) => (
                          <div key={`${digit}-${idx}`} className="otp-digit">
                            {digit}
                          </div>
                        ))}
                      </div>
                      <span className="otp-helper">
                        {isExpired
                          ? "This job has expired. Files have been removed."
                          : "Show this to the shopkeeper and collect your prints."}
                      </span>
                    </>
                  ) : (
                    <span className="otp-helper">OTP no longer available</span>
                  )}
                </>
              ) : null}
            </div>

            <div className="modal-summary">
              {loading ? (
                <div className="skeleton skeleton-text" style={{ height: "40px", margin: 0 }}></div>
              ) : job ? (
                <>
                  <div>
                    <p className="modal-label">Total Price</p>
                    <h3>{formatPrice(job.totalCost ?? 0)}</h3>
                  </div>
                  <span className={getStatusBadgeClass(job.status, isExpired)}>
                    {getStatusDisplayText(job.status, isExpired)}
                  </span>
                </>
              ) : null}
            </div>

            <div style={{ marginTop: "12px" }}>
              {loading ? (
                <div className="skeleton skeleton-text" style={{ width: "30%" }}></div>
              ) : job ? (
                <p className="modal-helper summary-meta">
                  {job.files.length} file(s) • {(job.totalPages ?? 0)} pages
                </p>
              ) : null}
            </div>

            <div className="modal-actions">
              {loading ? (
                <>
                  <div className="skeleton" style={{ height: "42px", flex: 1, borderRadius: "10px" }}></div>
                  <div className="skeleton" style={{ height: "42px", flex: 1, borderRadius: "10px" }}></div>
                </>
              ) : job ? (
                <>
                  {!isExpired && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void handleRefreshStatus()}
                    >
                      Refresh Status
                    </button>
                  )}
                  {canResubmit && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => void handleSubmitAgain()}
                      disabled={isResubmitting}
                    >
                      {isResubmitting ? "Submitting..." : "Submit For Print Again"}
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => void handleDeleteJob()}
                      disabled={isDeleting}
                    >
                      {isDeleting ? "Deleting..." : "Delete Job"}
                    </button>
                  )}
                </>
              ) : null}
            </div>

            <div className="modal-files-list">
              {loading ? (
                <>
                  <div className="skeleton skeleton-file-card"></div>
                  <div className="skeleton skeleton-file-card"></div>
                </>
              ) : job ? (
                job.files.map((file) => (
                  <FileOptionCard
                    key={file.id}
                    file={file}
                    canViewFile={canViewFiles}
                  />
                ))
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PrintJobsList({
  userId,
  refreshTrigger,
}: {
  userId: string | null;
  refreshTrigger: number;
}) {
  const [jobs, setJobs] = useState<UserPrintJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showLinkWhatsappModal, setShowLinkWhatsappModal] = useState(false);
  const [activeTab, setActiveTab] = useState<JobsTab>("ACTIVE");
  const [currentPage, setCurrentPage] = useState(1);
  const navigate = useNavigate();

  const handleJobUpdated = useCallback((updatedJob: UserPrintJob) => {
    setJobs((prev) =>
      prev.map((job) => (job.id === updatedJob.id ? updatedJob : job)),
    );
  }, []);

  const handleJobDeleted = useCallback((jobId: string) => {
    setJobs((prev) => prev.filter((job) => job.id !== jobId));
    setSelectedJobId((prev) => (prev === jobId ? null : prev));
  }, []);

  const load = useCallback(
    async () => {
      if (!userId) return;
      setLoading(true);
      try {
        const fetched = await getUserPrintJobs();
        const sorted = [...fetched].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        setJobs(sorted);

      } finally {
        setLoading(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    void load();
  }, [load, refreshTrigger]);

  useEffect(() => {
    const socket = getSocket();

    const handler = (_userId: string, updatedJobId: string) => {
      void load();

      if (selectedJobId !== updatedJobId) {
        setSelectedJobId(updatedJobId);
      }
    };

    socket.on("job-status-updated", handler);
    return () => {
      socket.off("job-status-updated", handler);
    };
  }, [load, selectedJobId]);

  const filteredJobs = useMemo(() => {
    const nonDraftJobs = jobs.filter((job) => job.status !== "DRAFT");

    if (activeTab === "ACTIVE") {
      return nonDraftJobs.filter((job) => ACTIVE_STATUSES.includes(job.status) && !job.expired);
    }
    
    if (activeTab === "COMPLETED") {
      const completed = nonDraftJobs.filter((job) => COMPLETED_STATUSES.includes(job.status));
      // Sort: Not expired first, then by date desc
      return completed.sort((a, b) => {
        if (!!a.expired === !!b.expired) {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        return a.expired ? 1 : -1;
      });
    }

    if (activeTab === "HISTORY") {
      return nonDraftJobs.filter((job) => 
        REJECTED_STATUSES.includes(job.status) || 
        CANCELED_STATUSES.includes(job.status) || 
        (job.expired && !COMPLETED_STATUSES.includes(job.status))
      );
    }

    return [];
  }, [activeTab, jobs]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredJobs.length / JOBS_PER_PAGE),
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * JOBS_PER_PAGE;
    return filteredJobs.slice(start, start + JOBS_PER_PAGE);
  }, [currentPage, filteredJobs]);

  const activeCount = jobs.filter((job) =>
    ACTIVE_STATUSES.includes(job.status) && !job.expired && job.status !== "DRAFT"
  ).length;
  const completedCount = jobs.filter((job) =>
    COMPLETED_STATUSES.includes(job.status) && job.status !== "DRAFT"
  ).length;
  const historyCount = jobs.filter((job) =>
    job.status !== "DRAFT" && (
      REJECTED_STATUSES.includes(job.status) || 
      CANCELED_STATUSES.includes(job.status) || 
      (job.expired && !COMPLETED_STATUSES.includes(job.status))
    )
  ).length;

  return (
    <>
      <section className="jobs-panel">
        <div className="jobs-panel-head">
          <h3>Recent Jobs</h3>
          <div className="jobs-panel-actions">
            {/* <button
              type="button"
              className="ghost-link"
              onClick={async () => {
                if (isResyncing) return;
                setIsResyncing(true);
                try {
                  const result = await resyncWhatsappJobs();
                  await load({ notification: false });
                  if (result.updatedCount > 0) {
                    notify(`Synced ${result.updatedCount} WhatsApp job(s).`, {
                      variant: "success",
                    });
                  } else {
                    notify(`WhatsApp jobs are up to date.`, {
                      variant: "info",
                    });
                  }
                } catch (err) {
                  const errorMsg =
                    err instanceof Error
                      ? err.message
                      : "Failed to sync WhatsApp jobs.";
                  if (
                    errorMsg ===
                    "Please sync your WhatsApp account before syncing jobs."
                  ) {
                    setShowLinkWhatsappModal(true);
                  } else {
                    notify(errorMsg, { variant: "error" });
                  }
                } finally {
                  setIsResyncing(false);
                }
              }}
              disabled={isResyncing}
            >
              {isResyncing ? "Syncing..." : "Sync WhatsApp"}
            </button> */}
            <button
              type="button"
              className="ghost-link"
              onClick={() => void load()}
            >
              Refresh
            </button>
          </div>
        </div>

        <div
          className="jobs-tabs"
          role="tablist"
          aria-label="Filter jobs by status"
        >
          <button
            type="button"
            className={`jobs-tab ${activeTab === "ACTIVE" ? "active" : ""}`}
            onClick={() => setActiveTab("ACTIVE")}
            role="tab"
            aria-selected={activeTab === "ACTIVE"}
          >
            Active ({activeCount})
          </button>
          <button
            type="button"
            className={`jobs-tab ${activeTab === "COMPLETED" ? "active" : ""}`}
            onClick={() => setActiveTab("COMPLETED")}
            role="tab"
            aria-selected={activeTab === "COMPLETED"}
          >
            Completed ({completedCount})
          </button>
          <button
            type="button"
            className={`jobs-tab ${activeTab === "HISTORY" ? "active" : ""}`}
            onClick={() => setActiveTab("HISTORY")}
            role="tab"
            aria-selected={activeTab === "HISTORY"}
          >
            History ({historyCount})
          </button>
        </div>

        {loading ? (
          <div className="jobs-list">
            <div className="skeleton skeleton-job-card"></div>
            <div className="skeleton skeleton-job-card"></div>
            <div className="skeleton skeleton-job-card"></div>
          </div>
        ) : filteredJobs.length === 0 ? (
          <p className="jobs-empty">No jobs found for this view.</p>
        ) : (
          <>
            <div className="jobs-list">
              {paginatedJobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  className="job-row"
                  onClick={() => {
                    if (job.status === "DRAFT") {
                      navigate(`/review/${job.id}`);
                    } else {
                      setSelectedJobId(job.id);
                    }
                  }}
                >
                  <div className="job-row-top">
                    <span className="job-file-icon" aria-hidden="true">
                      <FileText size={20} />
                    </span>
                    <div className="job-row-details">
                      <p className="job-row-code">
                        {job.status === "DRAFT"
                          ? "Draft Job"
                          : `OTP: ${job.verificationCode ?? job.oldOtp ?? "N/A"}`}
                      </p>
                      <p className="job-row-meta">
                        {job.files.length} file(s) • {(job.totalPages ?? 0)} pages
                      </p>
                      <p className="job-row-time">
                        {new Date(job.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="job-row-footer">
                    <div>
                      <p className="job-row-price-label">Total Price</p>
                      <p className="job-row-price">
                        {formatPrice(job.totalCost ?? 0)}
                      </p>
                    </div>
                    <span className={getStatusBadgeClass(job.status, job.expired)}>
                      {getStatusDisplayText(job.status, job.expired)}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="jobs-pagination">
                <button
                  type="button"
                  className="jobs-page-btn"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Prev
                </button>
                <span className="jobs-page-info">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  className="jobs-page-btn"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {selectedJobId && (
        <JobDetailModal
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
          onJobUpdated={handleJobUpdated}
          onJobDeleted={handleJobDeleted}
        />
      )}

      {showLinkWhatsappModal && (
        <div className="modal-shell" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-head">
              <div>
                <h2>Sync WhatsApp</h2>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowLinkWhatsappModal(false)}
              >
                x
              </button>
            </div>
            <p className="modal-helper" style={{ marginTop: "16px", marginBottom: "24px" }}>
              You are not synced with WhatsApp. Click sync below and send "sync" on WhatsApp to continue.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setShowLinkWhatsappModal(false)}
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
                    "noopener,noreferrer"
                  );
                  setShowLinkWhatsappModal(false);
                }}
              >
                Sync
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
