import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  deleteUserPrintJob,
  getUserPrintJobById,
  getUserPrintJobs,
  resyncWhatsappJobs,
  resubmitCompletedPrintJob,
} from "../api/api";
import type { UserPrintJob, UserPrintJobFile } from "../api/api";
import { getSocket } from "../services/getSocket";
import { useNotifications } from "./NotificationCenter";

type JobsTab = "ALL" | "ACTIVE" | "DRAFT" | "COMPLETED" | "REJECTED" | "CANCELED";

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

function getStatusBadgeClass(status: string) {
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

function formatOption(label: string, value: string) {
  return (
    <div className="job-option-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
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
    opt?.colorMode === "COLOR" ? "Color (Rs 7/sheet)" : "B&W (Rs 2/sheet)";
  const duplexLabel = opt?.duplex === "BOTH" ? "Both Sides" : "One Side";
  const rangeLabel =
    opt?.pageRange === "CUSTOM" && opt?.customRange
      ? `Custom: ${opt.customRange}`
      : "All Pages";

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
        <div className="job-file-options">
          {formatOption("Color", colorLabel)}
          {formatOption("Sides", duplexLabel)}
          {formatOption("Page Range", rangeLabel)}
          {formatOption("Copies", String(opt.copies))}
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

  if (loading) {
    return (
      <div className="modal-shell" role="dialog" aria-modal="true">
        <div className="modal-card">
          <p className="modal-helper">Loading job details...</p>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="modal-shell" role="dialog" aria-modal="true">
        <div className="modal-card">
          <p className="modal-error">{error ?? "Job not found."}</p>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  const otpDigits = String(job.verificationCode).split("");
  const canDelete = ACTIVE_STATUSES.includes(job.status);
  const canResubmit = COMPLETED_STATUSES.includes(job.status);
  const canViewFiles = !["REJECTED", "CANCELED"].includes(job.status);

  const handleRefreshStatus = async () => {
    await loadJob();
    notify("Status refreshed", { variant: "success" });
  };

  const handleDeleteJob = async () => {
    if (!canDelete || isDeleting) return;

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
    if (!canResubmit || isResubmitting) return;

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
            <p className="modal-helper">
              {new Date(job.createdAt).toLocaleString()}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            x
          </button>
        </div>

        <div className="otp-card">
          <p className="otp-title">Verification Code</p>
          <div
            className="otp-digits"
            aria-label={`Verification code ${job.verificationCode}`}
          >
            {otpDigits.map((digit, idx) => (
              <div key={`${digit}-${idx}`} className="otp-digit">
                {digit}
              </div>
            ))}
          </div>
          <span className="otp-helper">
            Show this to the shopkeeper and collect your prints.
          </span>
        </div>

        <div className="modal-summary">
          <div>
            <p className="modal-label">Total Price</p>
            <h3>{formatPrice(job.totalCost)}</h3>
          </div>
          <span className={getStatusBadgeClass(job.status)}>{job.status}</span>
        </div>

        <p className="modal-helper summary-meta">
          {job.files.length} file(s) • {job.totalPages} pages
        </p>

        <div className="modal-actions">
          <button
            type="button"
            className="btn"
            onClick={() => void handleRefreshStatus()}
          >
            Refresh Status
          </button>
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
        </div>

        <div className="modal-files-list">
          {job.files.map((file) => (
            <FileOptionCard
              key={file.id}
              file={file}
              canViewFile={canViewFiles}
            />
          ))}
        </div>
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
  const [isResyncing, setIsResyncing] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showLinkWhatsappModal, setShowLinkWhatsappModal] = useState(false);
  const [activeTab, setActiveTab] = useState<JobsTab>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const { notify } = useNotifications();
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
    async ({
      notification = false,
      msg,
    }: {
      notification?: boolean;
      msg?: string;
    }) => {
      if (!userId) return;
      setLoading(true);
      try {
        const fetched = await getUserPrintJobs();
        const sorted = [...fetched].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        setJobs(sorted);

        if (notification && msg) {
          notify(msg, { variant: "info" });
        }
      } finally {
        setLoading(false);
      }
    },
    [notify, userId],
  );

  useEffect(() => {
    void load({ notification: false });
  }, [load, refreshTrigger]);

  useEffect(() => {
    const socket = getSocket();

    const handler = (_userId: string, updatedJobId: string, msg: string) => {
      void load({ notification: true, msg });

      if (selectedJobId !== updatedJobId) {
        setSelectedJobId(updatedJobId);
      }
    };

    socket.on("job-status-updated", handler);
    return () => {
      socket.off("job-status-updated", handler);
    };
  }, [load, selectedJobId]);

  const draftJobs = useMemo(() => 
    jobs.filter((job) => job.status === "DRAFT" && (job.source === "WHATSAPP" || !!job.userMetadataId || !!job.userMetadata?.phoneNumber)),
  [jobs]);
  const allJobs = useMemo(() => jobs.filter(job => job.status !== "DRAFT"), [jobs]);

  const filteredJobs = useMemo(() => {
    if (activeTab === "ALL") return allJobs;

    if (activeTab === "ACTIVE") {
      return jobs.filter((job) => ACTIVE_STATUSES.includes(job.status));
    }

    if (activeTab === "DRAFT") return draftJobs;

    if (activeTab === "COMPLETED") {
      return jobs.filter((job) => COMPLETED_STATUSES.includes(job.status));
    }

    if (activeTab === "REJECTED") {
      return jobs.filter((job) => REJECTED_STATUSES.includes(job.status));
    }

    return jobs.filter((job) => CANCELED_STATUSES.includes(job.status));
  }, [activeTab, jobs, allJobs, draftJobs]);

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

  const allCount = allJobs.length;
  const activeCount = jobs.filter((job) =>
    ACTIVE_STATUSES.includes(job.status),
  ).length;
  const draftCount = draftJobs.length;
  const completedCount = jobs.filter((job) =>
    COMPLETED_STATUSES.includes(job.status),
  ).length;
  const rejectedCount = jobs.filter((job) =>
    REJECTED_STATUSES.includes(job.status),
  ).length;
  const canceledCount = jobs.filter((job) =>
    CANCELED_STATUSES.includes(job.status),
  ).length;

  return (
    <>
      <section className="jobs-panel">
        <div className="jobs-panel-head">
          <h3>Recent Jobs</h3>
          <div className="jobs-panel-actions">
            <button
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
                    "Please link your WhatsApp account before syncing jobs."
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
            </button>
            <button
              type="button"
              className="ghost-link"
              onClick={() => void load({ notification: false })}
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
            className={`jobs-tab ${activeTab === "ALL" ? "active" : ""}`}
            onClick={() => setActiveTab("ALL")}
            role="tab"
            aria-selected={activeTab === "ALL"}
          >
            All ({allCount})
          </button>
          <button
            type="button"
            className={`jobs-tab ${activeTab === "ACTIVE" ? "active" : ""}`}
            onClick={() => setActiveTab("ACTIVE")}
            role="tab"
            aria-selected={activeTab === "ACTIVE"}
          >
            Active ({activeCount})
          </button>
          {draftCount > 0 && (
            <button
              type="button"
              className={`jobs-tab ${activeTab === "DRAFT" ? "active" : ""}`}
              onClick={() => setActiveTab("DRAFT")}
              role="tab"
              aria-selected={activeTab === "DRAFT"}
            >
              Draft ({draftCount})
            </button>
          )}
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
            className={`jobs-tab ${activeTab === "REJECTED" ? "active" : ""}`}
            onClick={() => setActiveTab("REJECTED")}
            role="tab"
            aria-selected={activeTab === "REJECTED"}
          >
            Rejected ({rejectedCount})
          </button>
          <button
            type="button"
            className={`jobs-tab ${activeTab === "CANCELED" ? "active" : ""}`}
            onClick={() => setActiveTab("CANCELED")}
            role="tab"
            aria-selected={activeTab === "CANCELED"}
          >
            Canceled ({canceledCount})
          </button>
        </div>

        {loading ? (
          <p className="jobs-empty">Loading jobs...</p>
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
                      <p className="job-row-code">#{job.verificationCode}</p>
                      <p className="job-row-meta">
                        {job.files.length} file(s) • {job.totalPages} pages
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
                        {formatPrice(job.totalCost)}
                      </p>
                    </div>
                    <span className={getStatusBadgeClass(job.status)}>
                      {job.status}
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
                <h2>Link WhatsApp</h2>
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
              You are not synced with WhatsApp. Click the login button below, then send the "login" text to us and click on the link to login.
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
                    `https://wa.me/${digits}?text=login`,
                    "_blank",
                    "noopener,noreferrer"
                  );
                  setShowLinkWhatsappModal(false);
                }}
              >
                Login
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
