import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { FileText } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import { useNotify } from "../context/NotificationContext";
import {
  deleteUserPrintJob,
  getUserPrintJobById,
  getUserPrintJobs,
  resyncWhatsappJobs,
  resubmitCompletedPrintJob,
} from "../api/api";
import type { UserPrintJob, UserPrintJobFile } from "../api/api";
import { getSocket } from "../services/getSocket";
import { WHATSAPP_NUMBER } from "../config";
import * as Linking from "expo-linking";

type JobsTab = "ALL" | "ACTIVE" | "COMPLETED" | "REJECTED" | "CANCELED";

const ACTIVE_STATUSES = ["PENDING", "PROCESSING"];
const COMPLETED_STATUSES = ["COMPLETED"];
const REJECTED_STATUSES = ["REJECTED", "FAILED"];
const CANCELED_STATUSES = ["CANCELED"];
const JOBS_PER_PAGE = 4;

function formatPrice(amount: number) {
  return `₹${amount}`;
}

function FileChip({ label, accent }: { label: string; accent?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        chipStyles.chip,
        {
          backgroundColor: accent ? `${colors.brand}18` : colors.panelMuted,
          borderColor: accent ? `${colors.brand}40` : colors.border,
        },
      ]}
    >
      <Text style={[chipStyles.text, { color: accent ? colors.brand : colors.textMuted }]}>
        {label}
      </Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  text: { fontSize: 10, fontWeight: "600" },
});

function FileOptionCard({ file }: { file: UserPrintJobFile }) {
  const { colors } = useTheme();
  const opt = file.option;
  const colorLabel = opt?.colorMode === "COLOR" ? "Color" : "B&W";
  const duplexLabel = opt?.duplex === "BOTH" ? "Both Sides" : "One Side";
  const rangeLabel =
    opt?.pageRange === "CUSTOM" && opt?.customRange ? opt.customRange : "All Pages";
  const orientLabel = opt?.orientation === "LANDSCAPE" ? "Landscape" : "Portrait";
  const scaleLabel =
    opt?.scaleMode === "NOSCALE" ? "No Scale" : opt?.scaleMode === "SHRINK" ? "Shrink" : "Fit";

  return (
    <View style={[styles.fileCard, { borderColor: colors.border, backgroundColor: colors.panelMuted }]}>
      <View style={styles.fileCardTop}>
        <View style={styles.fileCardTitle}>
          <FileText size={14} color={colors.brand} />
          <Text style={[styles.fileCardName, { color: colors.text }]} numberOfLines={1}>
            {file.name}
          </Text>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>{file.pages} pages</Text>
      </View>
      {opt && (
        <View style={styles.chipRow}>
          <FileChip label={colorLabel} accent={opt.colorMode === "COLOR"} />
          <FileChip label={duplexLabel} />
          <FileChip label={orientLabel} />
          <FileChip label={scaleLabel} />
          <FileChip label={`Pages: ${rangeLabel}`} />
          {(opt.copies ?? 1) > 1 && <FileChip label={`${opt.copies}x`} accent />}
        </View>
      )}
    </View>
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
  onJobDeleted: (id: string) => void;
}) {
  const { colors } = useTheme();
  const { notify } = useNotify();
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
      setError(err instanceof Error ? err.message : "Failed to load job");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void loadJob();
  }, [loadJob]);

  useEffect(() => {
    const socket = getSocket();
    const handler = (_uid: string, updatedJobId: string) => {
      if (updatedJobId === jobId) void loadJob();
    };
    socket.on("job-status-updated", handler);
    return () => { socket.off("job-status-updated", handler); };
  }, [jobId, loadJob]);

  const handleDelete = async () => {
    if (isDeleting || !job) return;
    setIsDeleting(true);
    try {
      await deleteUserPrintJob(job.id);
      notify("Job deleted", { variant: "success" });
      onJobDeleted(job.id);
      onClose();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to delete", { variant: "error" });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleResubmit = async () => {
    if (isResubmitting || !job) return;
    setIsResubmitting(true);
    try {
      await resubmitCompletedPrintJob(job.id);
      const refreshed = await getUserPrintJobById(job.id);
      setJob(refreshed);
      onJobUpdated(refreshed);
      notify("Job submitted again", { variant: "success" });
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to resubmit", { variant: "error" });
    } finally {
      setIsResubmitting(false);
    }
  };

  const canDelete = job ? ACTIVE_STATUSES.includes(job.status) : false;
  const canResubmit = job ? COMPLETED_STATUSES.includes(job.status) : false;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.modalBg]}>
        <View style={[styles.modalCard, { backgroundColor: colors.panel, borderColor: colors.border }]}>
          {loading ? (
            <ActivityIndicator color={colors.brand} style={{ margin: 40 }} />
          ) : error || !job ? (
            <View style={{ padding: 20, alignItems: "center", gap: 12 }}>
              <Text style={{ color: colors.error }}>{error ?? "Job not found"}</Text>
              <TouchableOpacity style={[styles.btn, { borderColor: colors.border }]} onPress={onClose}>
                <Text style={{ color: colors.text, fontWeight: "600" }}>Close</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHead}>
                <View>
                  <Text style={[styles.modalLabel, { color: colors.textMuted }]}>Print Job</Text>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>Job Details</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                    {new Date(job.createdAt).toLocaleString()}
                  </Text>
                </View>
                <TouchableOpacity onPress={onClose} hitSlop={12}>
                  <Text style={{ color: colors.textMuted, fontSize: 22 }}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* OTP */}
              <View style={[styles.otpCard, { borderColor: colors.border }]}>
                <Text style={[styles.otpLabel, { color: colors.textMuted }]}>Verification Code</Text>
                <View style={styles.otpRow}>
                  {String(job.verificationCode ?? "").split("").map((d, i) => (
                    <View
                      key={`${d}-${i}`}
                      style={[styles.otpDigit, { backgroundColor: `${colors.brand}18`, borderColor: `${colors.brand}40` }]}
                    >
                      <Text style={[styles.otpDigitText, { color: colors.brand }]}>{d}</Text>
                    </View>
                  ))}
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: "center", marginTop: 6 }}>
                  Show this to the shopkeeper
                </Text>
              </View>

              {/* Summary */}
              <View style={[styles.summaryRow, { borderColor: colors.border }]}>
                <View>
                  <Text style={[styles.modalLabel, { color: colors.textMuted }]}>Total Price</Text>
                  <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>
                    {formatPrice(job.totalCost ?? 0)}
                  </Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: getStatusColor(job.status, colors) + "20", borderColor: getStatusColor(job.status, colors) + "50" }]}>
                  <Text style={{ color: getStatusColor(job.status, colors), fontSize: 10, fontWeight: "700", textTransform: "uppercase" }}>
                    {job.status}
                  </Text>
                </View>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                {job.files.length} file(s) • {job.totalPages ?? 0} pages
              </Text>

              {/* Actions */}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.btn, { borderColor: colors.border }]}
                  onPress={() => void loadJob()}
                >
                  <Text style={{ color: colors.text, fontWeight: "600", fontSize: 13 }}>Refresh</Text>
                </TouchableOpacity>
                {canResubmit && (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.brand }]}
                    onPress={() => void handleResubmit()}
                    disabled={isResubmitting}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
                      {isResubmitting ? "Submitting..." : "Print Again"}
                    </Text>
                  </TouchableOpacity>
                )}
                {canDelete && (
                  <TouchableOpacity
                    style={[styles.btn, { borderColor: colors.error }]}
                    onPress={() => void handleDelete()}
                    disabled={isDeleting}
                  >
                    <Text style={{ color: colors.error, fontWeight: "600", fontSize: 13 }}>
                      {isDeleting ? "Deleting..." : "Delete"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Files */}
              <View style={{ gap: 8, marginTop: 12, paddingBottom: 20 }}>
                {job.files.map((f) => (
                  <FileOptionCard key={f.id} file={f} />
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function getStatusColor(status: string, colors: { brand: string; success: string; error: string; textMuted: string }) {
  if (ACTIVE_STATUSES.includes(status)) return colors.brand;
  if (COMPLETED_STATUSES.includes(status)) return colors.success;
  if (REJECTED_STATUSES.includes(status)) return colors.error;
  return colors.textMuted;
}

// ── Main Component ──

export default function PrintJobsList({
  userId,
  refreshTrigger,
}: {
  userId: string | null;
  refreshTrigger: number;
}) {
  const { colors, isDark } = useTheme();
  const { notify } = useNotify();
  const [jobs, setJobs] = useState<UserPrintJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [activeTab, setActiveTab] = useState<JobsTab>("ALL");
  const [currentPage, setCurrentPage] = useState(1);

  const load = useCallback(async (showNotif = false, msg?: string) => {
    if (!userId) return;
    setLoading(true);
    try {
      const fetched = await getUserPrintJobs();
      const sorted = [...fetched].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setJobs(sorted);
      if (showNotif && msg) notify(msg, { variant: "info" });
    } finally {
      setLoading(false);
    }
  }, [notify, userId]);

  useEffect(() => { void load(); }, [load, refreshTrigger]);

  useEffect(() => {
    const socket = getSocket();
    const handler = (_uid: string, _jobId: string, msg: string) => {
      void load(true, msg);
    };
    socket.on("job-status-updated", handler);
    return () => { socket.off("job-status-updated", handler); };
  }, [load]);

  const allJobs = useMemo(() => jobs.filter((j) => j.status !== "DRAFT"), [jobs]);

  const filteredJobs = useMemo(() => {
    if (activeTab === "ALL") return allJobs;
    if (activeTab === "ACTIVE") return jobs.filter((j) => ACTIVE_STATUSES.includes(j.status));
    if (activeTab === "COMPLETED") return jobs.filter((j) => COMPLETED_STATUSES.includes(j.status));
    if (activeTab === "REJECTED") return jobs.filter((j) => REJECTED_STATUSES.includes(j.status));
    return jobs.filter((j) => CANCELED_STATUSES.includes(j.status));
  }, [activeTab, jobs, allJobs]);

  useEffect(() => { setCurrentPage(1); }, [activeTab]);
  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / JOBS_PER_PAGE));
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * JOBS_PER_PAGE;
    return filteredJobs.slice(start, start + JOBS_PER_PAGE);
  }, [currentPage, filteredJobs]);

  const counts = useMemo(() => ({
    all: allJobs.length,
    active: jobs.filter((j) => ACTIVE_STATUSES.includes(j.status)).length,
    completed: jobs.filter((j) => COMPLETED_STATUSES.includes(j.status)).length,
    rejected: jobs.filter((j) => REJECTED_STATUSES.includes(j.status)).length,
    canceled: jobs.filter((j) => CANCELED_STATUSES.includes(j.status)).length,
  }), [jobs, allJobs]);

  const handleSync = async () => {
    if (isResyncing) return;
    setIsResyncing(true);
    try {
      const result = await resyncWhatsappJobs();
      await load();
      notify(
        result.updatedCount > 0
          ? `Synced ${result.updatedCount} WhatsApp job(s).`
          : "WhatsApp jobs are up to date.",
        { variant: result.updatedCount > 0 ? "success" : "info" },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to sync";
      if (msg.includes("sync your WhatsApp")) {
        setShowSyncModal(true);
      } else {
        notify(msg, { variant: "error" });
      }
    } finally {
      setIsResyncing(false);
    }
  };

  const tabs: { key: JobsTab; label: string; count: number }[] = [
    { key: "ALL", label: "All", count: counts.all },
    { key: "ACTIVE", label: "Active", count: counts.active },
    { key: "COMPLETED", label: "Done", count: counts.completed },
    { key: "REJECTED", label: "Rejected", count: counts.rejected },
    { key: "CANCELED", label: "Canceled", count: counts.canceled },
  ];

  return (
    <>
      <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.panel }]}>
        {/* Header */}
        <View style={styles.panelHead}>
          <Text style={[styles.panelTitle, { color: colors.text }]}>Recent Jobs</Text>
          <View style={styles.panelActions}>
            <TouchableOpacity onPress={() => void handleSync()} disabled={isResyncing}>
              <Text style={[styles.ghostLink, { color: isResyncing ? colors.textMuted : colors.brand }]}>
                {isResyncing ? "Syncing..." : "Sync WhatsApp"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void load()}>
              <Text style={[styles.ghostLink, { color: colors.textMuted }]}>Refresh</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[
                styles.tab,
                activeTab === tab.key && { borderBottomColor: colors.brand, borderBottomWidth: 2 },
              ]}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: activeTab === tab.key ? colors.brand : colors.textMuted,
                }}
              >
                {tab.label} ({tab.count})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Job List */}
        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginVertical: 24 }} />
        ) : filteredJobs.length === 0 ? (
          <Text style={{ color: colors.textMuted, textAlign: "center", paddingVertical: 24, fontSize: 13 }}>
            No jobs found.
          </Text>
        ) : (
          <View style={{ gap: 8, marginTop: 8 }}>
            {paginatedJobs.map((job) => (
              <TouchableOpacity
                key={job.id}
                style={[styles.jobRow, { borderColor: colors.border, backgroundColor: colors.panelMuted }]}
                activeOpacity={0.7}
                onPress={() => setSelectedJobId(job.id)}
              >
                <View style={styles.jobRowTop}>
                  <View style={[styles.jobIcon, { backgroundColor: `${colors.brand}18` }]}>
                    <FileText size={18} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.jobCode, { color: colors.text }]}>
                      OTP: {job.verificationCode ?? "N/A"}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                      {job.files.length} file(s) • {job.totalPages ?? 0} pages
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>
                      {new Date(job.createdAt).toLocaleString()}
                    </Text>
                  </View>
                </View>
                <View style={styles.jobRowFooter}>
                  <View>
                    <Text style={{ color: colors.textMuted, fontSize: 10 }}>Total</Text>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>
                      {formatPrice(job.totalCost ?? 0)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor: getStatusColor(job.status, colors) + "20",
                        borderColor: getStatusColor(job.status, colors) + "50",
                      },
                    ]}
                  >
                    <Text style={{ color: getStatusColor(job.status, colors), fontSize: 10, fontWeight: "700", textTransform: "uppercase" }}>
                      {job.status}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <View style={styles.pagination}>
                <TouchableOpacity
                  onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <Text style={{ color: currentPage === 1 ? colors.textMuted : colors.brand, fontWeight: "600", fontSize: 13 }}>Prev</Text>
                </TouchableOpacity>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {currentPage} of {totalPages}
                </Text>
                <TouchableOpacity
                  onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <Text style={{ color: currentPage === totalPages ? colors.textMuted : colors.brand, fontWeight: "600", fontSize: 13 }}>Next</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Job Detail Modal */}
      {selectedJobId && (
        <JobDetailModal
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
          onJobUpdated={(updated) => setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)))}
          onJobDeleted={(id) => {
            setJobs((prev) => prev.filter((j) => j.id !== id));
            setSelectedJobId(null);
          }}
        />
      )}

      {/* Sync WhatsApp Modal */}
      <Modal visible={showSyncModal} transparent animationType="fade" onRequestClose={() => setShowSyncModal(false)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { backgroundColor: colors.panel, borderColor: colors.border, maxWidth: 360 }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Sync WhatsApp</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginVertical: 16 }}>
              You are not synced with WhatsApp. Tap Sync below and send "sync" on WhatsApp.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.btn, { borderColor: colors.border }]} onPress={() => setShowSyncModal(false)}>
                <Text style={{ color: colors.text, fontWeight: "600" }}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.brand }]}
                onPress={() => {
                  Linking.openURL(`https://wa.me/${WHATSAPP_NUMBER}?text=sync`);
                  setShowSyncModal(false);
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>Sync</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 4,
  },
  panelHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  panelTitle: { fontSize: 16, fontWeight: "700" },
  panelActions: { flexDirection: "row", gap: 12 },
  ghostLink: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  tabScroll: { marginTop: 10, marginBottom: 4 },
  tab: { paddingVertical: 8, paddingHorizontal: 12, marginRight: 4 },
  jobRow: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  jobRowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  jobIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  jobCode: { fontSize: 14, fontWeight: "700" },
  jobRowFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  statusPill: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  pagination: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 16, paddingVertical: 8 },
  fileCard: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 6 },
  fileCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fileCardTitle: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  fileCardName: { fontSize: 13, fontWeight: "600", flex: 1 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 16 },
  modalCard: { borderWidth: 1, borderRadius: 16, padding: 20, maxHeight: "85%" },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  modalLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  modalTitle: { fontSize: 18, fontWeight: "700", marginTop: 2 },
  otpCard: { borderWidth: 1, borderRadius: 12, padding: 14, alignItems: "center", marginTop: 16 },
  otpLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  otpRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  otpDigit: { width: 40, height: 48, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  otpDigitText: { fontSize: 22, fontWeight: "800" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 12, borderTopWidth: 1 },
  modalActions: { flexDirection: "row", gap: 8, marginTop: 16 },
  btn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  btnPrimary: { borderWidth: 0 },
});
