import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bookmark, BookmarkCheck, Check, Copy, ExternalLink, FileText, Image as ImageIcon, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  deleteUserPrintJob,
  getUserPrintJobById,
  getUserPrintJobs,
  resubmitCompletedPrintJob,
  getShops,
  changeJobShop,
} from "../api/api";
import type { UserPrintJob, UserPrintJobFile, PrintShopInfo } from "../api/api";
import { getSocket } from "../services/getSocket";
import { suppressJobToast } from "../services/suppressJobToast";
import { isBookmarked, toggleBookmark } from "../services/shopBookmarks";
import { useNotifications } from "./NotificationCenter";
import ShopPickerModal, { saveRecentShop } from "./ShopPickerModal";

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
    opt?.colorMode === "COLOR" ? "Color" : "B&W";
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

function computePlatformFee(printCost: number, enabled: boolean): number {
  if (!enabled || printCost <= 0) return 0;
  if (printCost > 100) return 4;
  if (printCost > 20) return 2;
  return 0;
}

function PayNowBlock({
  upiId,
  shopName,
  printCost,
  platformChargeEnabled,
}: {
  upiId: string;
  shopName: string;
  printCost: number;
  platformChargeEnabled: boolean;
}) {
  const [copied, setCopied] = useState<"upi" | "amount" | null>(null);

  const platformFee = computePlatformFee(printCost, platformChargeEnabled);
  const totalAmount = printCost + platformFee;

  const upiLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(shopName)}&tn=${encodeURIComponent("Print Job Payment")}&am=${totalAmount.toFixed(2)}&cu=INR`;

  const copy = (text: string, key: "upi" | "amount") => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="job-pay-block">
      <button
        type="button"
        className="btn btn-primary job-pay-btn"
        onClick={() => { window.location.href = upiLink; }}
      >
        Pay {formatPrice(totalAmount)}
      </button>

      <div className="job-pay-details">
        <div className="job-pay-detail-row">
          <span className="job-pay-detail-label">UPI ID</span>
          <span className="job-pay-detail-value">{upiId}</span>
          <button
            type="button"
            className="job-pay-copy-btn"
            onClick={() => copy(upiId, "upi")}
            title="Copy UPI ID"
          >
            {copied === "upi" ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>
        {platformFee > 0 && (
          <div className="job-pay-detail-row">
            <span className="job-pay-detail-label">Print cost</span>
            <span className="job-pay-detail-value">{formatPrice(printCost)}</span>
          </div>
        )}
        {platformFee > 0 && (
          <div className="job-pay-detail-row">
            <span className="job-pay-detail-label">Platform fee</span>
            <span className="job-pay-detail-value">+{formatPrice(platformFee)}</span>
          </div>
        )}
        <div className="job-pay-detail-row">
          <span className="job-pay-detail-label">Total</span>
          <span className="job-pay-detail-value">{formatPrice(totalAmount)}</span>
          <button
            type="button"
            className="job-pay-copy-btn"
            onClick={() => copy(totalAmount.toFixed(2), "amount")}
            title="Copy amount"
          >
            {copied === "amount" ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function JobDetailPanel({
  jobId,
  onClose,
  onJobUpdated,
  onJobDeleted,
  paymentStatus,
}: {
  jobId: string;
  onClose: () => void;
  onJobUpdated: (job: UserPrintJob) => void;
  onJobDeleted: (jobId: string) => void;
  paymentStatus?: "success" | "failure" | "submitted" | null;
}) {
  const { notify, dismiss } = useNotifications();
  const [job, setJob] = useState<UserPrintJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResubmitting, setIsResubmitting] = useState(false);
  const [shops, setShops] = useState<PrintShopInfo[]>([]);
  const [showShopPicker, setShowShopPicker] = useState(false);
  const [pendingShop, setPendingShop] = useState<PrintShopInfo | null>(null);
  const [isChangingShop, setIsChangingShop] = useState(false);
  const [shopLightboxUrl, setShopLightboxUrl] = useState<string | null>(null);
  const [shopBookmarked, setShopBookmarked] = useState(false);

  // Full details for the shop this job was submitted to (name/landmark/id/image).
  const shopInfo = useMemo(
    () => (job ? shops.find((s) => s.id === job.shopId) : undefined),
    [shops, job],
  );

  useEffect(() => {
    setShopBookmarked(shopInfo ? isBookmarked(shopInfo.shopId) : false);
  }, [shopInfo]);

  const handleToggleBookmark = () => {
    if (!shopInfo) return;
    setShopBookmarked(toggleBookmark(shopInfo.shopId));
  };

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
      if (updatedJobId === jobId) void loadJob();
    };
    socket.on("job-status-updated", handler);
    return () => { socket.off("job-status-updated", handler); };
  }, [jobId, loadJob]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const displayOtpString =
    job?.verificationCode !== null && job?.verificationCode !== undefined
      ? String(job.verificationCode).padStart(4, "0")
      : (job?.oldOtp ? String(job.oldOtp) : "");
  const otpDigits = displayOtpString ? displayOtpString.split("") : [];
  const isExpired = !!job?.expired;
  const canDelete = job ? (ACTIVE_STATUSES.includes(job.status) && !isExpired) : false;
  const canResubmit = job ? (COMPLETED_STATUSES.includes(job.status) && !isExpired) : false;
  const canViewFiles = job ? (!["REJECTED", "CANCELED"].includes(job.status) && !isExpired) : false;

  const handleRefreshStatus = async () => { await loadJob(); };

  // Load available shops for the Change Shop dropdown
  useEffect(() => {
    void getShops().then((list) => setShops(list)).catch(() => {});
  }, []);

  // Step 1: user picked a new shop from the picker panel -> stage it for confirmation
  const handleShopPicked = (newShop: PrintShopInfo) => {
    if (!job) return;
    setShowShopPicker(false);
    if (newShop.id === job.shopId) {
      notify("That's already the current shop for this job", { variant: "info" });
      return;
    }
    setPendingShop(newShop);
  };

  // Step 2: user confirmed -> delete the old job and resubmit to the new shop
  const handleConfirmChangeShop = async () => {
    if (!job || !pendingShop || isChangingShop) return;
    setIsChangingShop(true);
    try {
      const result = await changeJobShop(job.id, pendingShop.id);
      saveRecentShop(pendingShop);
      notify(`Job moved to ${pendingShop.name}`, { variant: "success" });
      // The old job is deleted by the backend; open the new one
      onJobDeleted(job.id);
      onJobUpdated({
        ...job,
        id: result.newJobId,
        shopId: pendingShop.id,
        shopName: pendingShop.name,
        verificationCode: String(result.verificationCode).padStart(4, "0"),
      });
      setPendingShop(null);
      onClose();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to change shop", { variant: "error" });
    } finally {
      setIsChangingShop(false);
    }
  };

  const handleDeleteJob = async () => {
    if (!job || !canDelete || isDeleting) return;
    const confirmed = window.confirm(
      "Are you sure you want to delete this print job? This will permanently remove the job and its files from cloud storage.",
    );
    if (!confirmed) return;
    setIsDeleting(true);
    try {
      const code = job.verificationCode !== null && job.verificationCode !== undefined
        ? String(job.verificationCode).padStart(4, "0")
        : (job.oldOtp ? String(job.oldOtp) : "");
      dismiss(`job-status-${code}`);
      dismiss(`job-status-${job.id}`);

      // We show our own toast below; suppress the backend's follow-up
      // job-status-updated toast for this same job so it isn't duplicated.
      suppressJobToast(job.id);
      await deleteUserPrintJob(job.id);
      notify("Job deleted successfully", { variant: "success" });
      onJobDeleted(job.id);
      onClose();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to delete this job", { variant: "error" });
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
      notify(err instanceof Error ? err.message : "Failed to submit job again", { variant: "error" });
    } finally {
      setIsResubmitting(false);
    }
  };

  return (
    <>
    <div
      className="job-detail-panel"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Job Details"
    >
      <div className="job-detail-panel-inner" onClick={(e) => e.stopPropagation()}>
        {/* Sticky header */}
        <div className="job-detail-panel-header">
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <div className="job-detail-panel-title">
            <p className="modal-label">Print Job</p>
            <h2>Job Details</h2>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="job-detail-panel-content">
          {/* Payment return banner */}
          {paymentStatus === "success" && (
            <div className="payment-status-banner payment-status-banner--success">
              Payment received — show the OTP below to collect your prints.
            </div>
          )}
          {paymentStatus === "failure" && (
            <div className="payment-status-banner payment-status-banner--failure">
              Payment failed or was cancelled. You can try again using Pay Now below.
            </div>
          )}
          {paymentStatus === "submitted" && (
            <div className="payment-status-banner payment-status-banner--pending">
              Payment submitted and is being processed. Please wait a moment.
            </div>
          )}

          {job && !loading && (
            <p className="job-detail-panel-time">
              {new Date(job.createdAt).toLocaleString()}
            </p>
          )}
          {loading && <div className="skeleton skeleton-title" style={{ width: "180px", height: "14px" }} />}

          {error && (
            <div>
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
                  <div className="skeleton skeleton-modal-otp" style={{ margin: 0 }} />
                ) : job ? (
                  <>
                    {/* Shop this job was submitted to */}
                    <div className="job-shop-card">
                      <div className="job-shop-card-main">
                        <div className="shop-row-id-badge">
                          <span
                            className="shop-row-id-value"
                            style={{ fontSize: (shopInfo?.shopId ?? "").length > 3 ? "11px" : (shopInfo?.shopId ?? "").length > 2 ? "14px" : "18px" }}
                          >
                            {(shopInfo?.shopId ?? "?").slice(0, 4).toUpperCase()}
                          </span>
                        </div>
                        <div className="shop-row-info">
                          <span className="otp-shop-label">Submitted to</span>
                          <span className="shop-row-name">{shopInfo?.name ?? job.shopName ?? "Unknown Shop"}</span>
                          <div className="shop-row-meta">
                            {shopInfo?.landmark && (
                              <span className="shop-row-landmark">📍 {shopInfo.landmark}</span>
                            )}
                            {shopInfo?.shopId && (
                              <span className="shop-row-distance-badge">ID: {shopInfo.shopId}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {shopInfo && (
                        <div className="shop-row-actions">
                          {shopInfo.imageUrl && (
                            <button
                              type="button"
                              className="shop-view-photo-btn"
                              onClick={() => setShopLightboxUrl(shopInfo.imageUrl!)}
                              aria-label="View shop photo"
                              title="View shop photo"
                            >
                              <ImageIcon size={13} />
                              <span className="shop-view-photo-label">See Photo</span>
                            </button>
                          )}
                          <button
                            type="button"
                            className={`shop-bookmark-btn${shopBookmarked ? " active" : ""}`}
                            onClick={handleToggleBookmark}
                            aria-label={shopBookmarked ? "Remove bookmark" : "Save shop"}
                            title={shopBookmarked ? "Remove from saved" : "Save for later"}
                          >
                            {shopBookmarked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                          </button>
                        </div>
                      )}

                      {/* TODO: Change Shop temporarily disabled — re-enable once the flow is finished.
                      {!isExpired && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => setShowShopPicker(true)}
                          disabled={isChangingShop}
                        >
                          {isChangingShop ? "Changing..." : "Change Shop"}
                        </button>
                      )}
                      */}
                    </div>

                    <p className="otp-title">
                      {isExpired ? "Previous Verification Code" : "Verification Code"}
                    </p>
                    {otpDigits.length > 0 ? (
                      <>
                        <div className="otp-digits" aria-label={`Verification code ${displayOtpString}`}>
                          {otpDigits.map((digit, idx) => (
                            <div key={`${digit}-${idx}`} className="otp-digit">{digit}</div>
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
                  <div className="skeleton skeleton-text" style={{ height: "40px", margin: 0 }} />
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

              <div>
                {loading ? (
                  <div className="skeleton skeleton-text" style={{ width: "30%" }} />
                ) : job ? (
                  <p className="modal-helper summary-meta">
                    {job.files.length} file(s) • {(job.totalPages ?? 0)} pages
                  </p>
                ) : null}
              </div>

              {/* Pay Now block */}
              {!loading && job && job.shopUpiId && !isExpired && (job.totalCost ?? 0) > 0 && (
                <PayNowBlock
                  upiId={job.shopUpiId}
                  shopName={job.shopName ?? "Print Shop"}
                  printCost={job.totalCost ?? 0}
                  platformChargeEnabled={job.shopPlatformChargeEnabled ?? false}
                />
              )}

              <div className="modal-actions">
                {loading ? (
                  <>
                    <div className="skeleton" style={{ height: "42px", flex: 1, borderRadius: "10px" }} />
                    <div className="skeleton" style={{ height: "42px", flex: 1, borderRadius: "10px" }} />
                  </>
                ) : job ? (
                  <>
                    {!isExpired && (
                      <button type="button" className="btn" onClick={() => void handleRefreshStatus()}>
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
                    <div className="skeleton skeleton-file-card" />
                    <div className="skeleton skeleton-file-card" />
                  </>
                ) : job ? (
                  job.files.map((file) => (
                    <FileOptionCard key={file.id} file={file} canViewFile={canViewFiles} />
                  ))
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>

    {/* Shop photo lightbox */}
    {shopLightboxUrl && (
      <div
        className="shop-lightbox-overlay"
        onClick={() => setShopLightboxUrl(null)}
        role="dialog"
        aria-modal="true"
        aria-label="Shop photo"
      >
        <div className="shop-lightbox-card" onClick={(e) => e.stopPropagation()}>
          <div className="shop-lightbox-header">
            <span className="shop-lightbox-title">Shop Photo</span>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <a
                href={shopLightboxUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shop-lightbox-external"
                title="Open in new tab"
              >
                <ExternalLink size={14} />
              </a>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShopLightboxUrl(null)}
                aria-label="Close photo"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="shop-lightbox-img-wrap">
            <img
              src={shopLightboxUrl}
              alt="Shop photo"
              className="shop-lightbox-img"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        </div>
      </div>
    )}

    {/* Change-shop flow: pick a new shop from the full shop selection panel */}
    {showShopPicker && (
      <ShopPickerModal
        shops={shops}
        onSelect={handleShopPicked}
        onClose={() => setShowShopPicker(false)}
      />
    )}

    {/* Change-shop flow: confirm before deleting the old job and resubmitting */}
    {pendingShop && job && (
      <div
        className="modal-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-shop-confirm-title"
        onClick={() => { if (!isChangingShop) setPendingShop(null); }}
      >
        <div className="modal-card confirm-submit-card" onClick={(e) => e.stopPropagation()}>
          <div className="confirm-modal-header">
            <h2 className="confirm-modal-title" id="change-shop-confirm-title">Change Shop</h2>
            <p className="confirm-modal-subtitle">
              Move this print job to a different shop
            </p>
          </div>

          <div className="change-shop-confirm-body">
            <div className="change-shop-confirm-row">
              <span className="change-shop-confirm-label">From</span>
              <span className="change-shop-confirm-value">{job.shopName ?? "Current shop"}</span>
            </div>
            <div className="change-shop-confirm-row">
              <span className="change-shop-confirm-label">To</span>
              <span className="change-shop-confirm-value">{pendingShop.name}</span>
            </div>
            <p className="change-shop-confirm-note">
              Your current job will be deleted and a new one created at{" "}
              <strong>{pendingShop.name}</strong> with a fresh verification code.
            </p>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn"
              onClick={() => setPendingShop(null)}
              disabled={isChangingShop}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleConfirmChangeShop()}
              disabled={isChangingShop}
            >
              {isChangingShop ? "Moving..." : "Confirm & Resubmit"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export default function PrintJobsList({
  userId,
  refreshTrigger,
  openJobId,
  onJobPanelClose,
}: {
  userId: string | null;
  refreshTrigger: number;
  openJobId?: string | null;
  onJobPanelClose?: () => void;
}) {
  const [jobs, setJobs] = useState<UserPrintJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"success" | "failure" | "submitted" | null>(null);
  const [showLinkWhatsappModal, setShowLinkWhatsappModal] = useState(false);
  const [activeTab, setActiveTab] = useState<JobsTab>("ACTIVE");
  const [currentPage, setCurrentPage] = useState(1);
  const navigate = useNavigate();
  const didCheckPaymentReturn = useRef(false);

  // Detect return from UPI payment app via callback URL params
  useEffect(() => {
    if (didCheckPaymentReturn.current) return;
    didCheckPaymentReturn.current = true;

    const params = new URLSearchParams(window.location.search);
    const pret = params.get("pret");
    const jid = params.get("jid");
    const status = (params.get("Status") ?? params.get("status") ?? "").toUpperCase();

    if (pret === "1" && jid) {
      // Clean the URL so refreshing doesn't re-trigger
      window.history.replaceState({}, "", window.location.pathname);

      const mapped =
        status === "SUCCESS" ? "success" :
        status === "FAILURE" || status === "FAILED" ? "failure" :
        status === "SUBMITTED" ? "submitted" : null;

      setSelectedJobId(jid);
      setPaymentStatus(mapped);
    }
  }, []);

  // Open panel when parent passes openJobId (e.g. right after submit)
  useEffect(() => {
    if (openJobId) setSelectedJobId(openJobId);
  }, [openJobId]);

  const handleJobUpdated = useCallback((updatedJob: UserPrintJob) => {
    setJobs((prev) => prev.map((job) => (job.id === updatedJob.id ? updatedJob : job)));
  }, []);

  const handleJobDeleted = useCallback((jobId: string) => {
    setJobs((prev) => prev.filter((job) => job.id !== jobId));
    setSelectedJobId((prev) => (prev === jobId ? null : prev));
  }, []);

  const handlePanelClose = useCallback(() => {
    setSelectedJobId(null);
    setPaymentStatus(null);
    onJobPanelClose?.();
  }, [onJobPanelClose]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const fetched = await getUserPrintJobs();
      const sorted = [...fetched].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setJobs(sorted);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load, refreshTrigger]);

  useEffect(() => {
    const socket = getSocket();
    const handler = (_userId: string, updatedJobId: string) => {
      void load();
      if (selectedJobId !== updatedJobId) setSelectedJobId(updatedJobId);
    };
    socket.on("job-status-updated", handler);
    return () => { socket.off("job-status-updated", handler); };
  }, [load, selectedJobId]);

  const filteredJobs = useMemo(() => {
    const nonDraftJobs = jobs.filter((job) => job.status !== "DRAFT");
    if (activeTab === "ACTIVE") {
      return nonDraftJobs.filter((job) => ACTIVE_STATUSES.includes(job.status) && !job.expired);
    }
    if (activeTab === "COMPLETED") {
      const completed = nonDraftJobs.filter((job) => COMPLETED_STATUSES.includes(job.status));
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

  useEffect(() => { setCurrentPage(1); }, [activeTab]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / JOBS_PER_PAGE));

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * JOBS_PER_PAGE;
    return filteredJobs.slice(start, start + JOBS_PER_PAGE);
  }, [currentPage, filteredJobs]);

  const [activeCount, completedCount, historyCount] = useMemo(() => [
    jobs.filter((job) => ACTIVE_STATUSES.includes(job.status) && !job.expired && job.status !== "DRAFT").length,
    jobs.filter((job) => COMPLETED_STATUSES.includes(job.status) && job.status !== "DRAFT").length,
    jobs.filter((job) =>
      job.status !== "DRAFT" && (
        REJECTED_STATUSES.includes(job.status) ||
        CANCELED_STATUSES.includes(job.status) ||
        (job.expired && !COMPLETED_STATUSES.includes(job.status))
      )
    ).length,
  ], [jobs]);

  return (
    <>
      <section className="jobs-panel">
        <div className="jobs-panel-head">
          <h3>Recent Jobs</h3>
          <div className="jobs-panel-actions">
            <button type="button" className="ghost-link" onClick={() => void load()}>
              Refresh
            </button>
          </div>
        </div>

        <div className="jobs-tabs" role="tablist" aria-label="Filter jobs by status">
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
            <div className="skeleton skeleton-job-card" />
            <div className="skeleton skeleton-job-card" />
            <div className="skeleton skeleton-job-card" />
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
                          : `OTP: ${job.verificationCode !== null && job.verificationCode !== undefined ? String(job.verificationCode).padStart(4, "0") : (job.oldOtp ?? "N/A")}`}
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
                      <p className="job-row-price">{formatPrice(job.totalCost ?? 0)}</p>
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
                <span className="jobs-page-info">Page {currentPage} of {totalPages}</span>
                <button
                  type="button"
                  className="jobs-page-btn"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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
        <JobDetailPanel
          jobId={selectedJobId}
          onClose={handlePanelClose}
          onJobUpdated={handleJobUpdated}
          onJobDeleted={handleJobDeleted}
          paymentStatus={paymentStatus}
        />
      )}

      {showLinkWhatsappModal && (
        <div className="modal-shell" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-head">
              <div><h2>Login with WhatsApp</h2></div>
              <button type="button" className="icon-btn" onClick={() => setShowLinkWhatsappModal(false)}>x</button>
            </div>
            <p className="modal-helper" style={{ marginTop: "16px", marginBottom: "24px" }}>
              You are not logged in with WhatsApp. Click Login below and send "login" on WhatsApp to continue.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setShowLinkWhatsappModal(false)}>Close</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  window.open(`https://wa.me/918369757906?text=login`, "_blank", "noopener,noreferrer");
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
