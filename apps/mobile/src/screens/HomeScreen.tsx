import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Modal,
  NativeModules,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { FolderOpen, MessageCircle, Moon, Plus, RefreshCw, Sun, Trash2 } from "lucide-react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Linking from "expo-linking";
import * as FileSystem from "expo-file-system";

import { useTheme } from "../context/ThemeContext";
import { useNotify } from "../context/NotificationContext";
import { getUserId } from "../storage";
import { getSocket } from "../services/getSocket";
import { MAX_FILES, MAX_JOB_UPLOAD_BYTES, MAX_JOB_UPLOAD_MB, WHATSAPP_NUMBER } from "../config";

import {
  addFilesToWebDraft,
  deleteUserFile,
  deleteUserPrintJob,
  getWebDraftJob,
  getUserSession,
  markOnboardingCompleted,
  registerUser,
  requestPresignedUploads,
  submitWhatsappJobReview,
  updateUserFilePrintOptions,
  uploadFileToR2,
} from "../api/api";
import type { UserPrintJob } from "../api/api";
import { setToken, setUserId as storeUserId } from "../storage";

import {
  buildJobTotals,
  calculateFileCost,
  defaultPrintOptions,
  validateCustomPageRange,
} from "@printowl/shared-utils";
import type { PrintFileState, PrintOptions } from "@printowl/shared-utils";

import ToggleGroup from "../components/ToggleGroup";
import FileCard from "../components/FileCard";
import UploadArea from "../components/UploadArea";
import SuccessCard from "../components/SuccessCard";
import PrintJobsList from "../components/PrintJobsList";
import { Share } from "lucide-react-native";

export default function HomeScreen() {
  const { colors, isDark, toggle: toggleTheme } = useTheme();
  const { notify } = useNotify();

  const [userId, setUserId] = useState<string | null>(getUserId());
  const [isWhatsappSynced, setIsWhatsappSynced] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [globalColorMode, setGlobalColorMode] = useState<PrintOptions["colorMode"]>("BW");
  const [printFiles, setPrintFiles] = useState<PrintFileState[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [isPreparingFiles, setIsPreparingFiles] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadStage, setUploadStage] = useState<"uploading" | "converting" | "creating">("uploading");
  const [verificationCode, setVerificationCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftJobId, setDraftJobId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const lastPersistedRef = useRef<Record<string, PrintOptions>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── userId is already set by SyncScreen before we get here ──
  useEffect(() => {
    console.log("[Home] userId:", userId);
  }, [userId]);

  // ── Session check ──
  useEffect(() => {
    if (!userId) return;
    console.log("[Session] Checking session for:", userId);
    getUserSession()
      .then((s) => {
        console.log("[Session] WhatsApp synced:", !!s.whatsappSynced);
        setIsWhatsappSynced(!!s.whatsappSynced);
      })
      .catch((err) => {
        console.error("[Session] Failed:", err?.message || err);
        setIsWhatsappSynced(false);
      });
  }, [userId]);

  // ── Fetch draft ──
  const fetchWebDraft = useCallback(async () => {
    if (!userId) return;
    setIsRefreshing(true);
    try {
      const job = await getWebDraftJob();
      if (job) {
        setDraftJobId(job.id);
        setPrintFiles(
          job.files.map((f) => {
            const opts = f.option
              ? { ...f.option, customRange: f.option.customRange || "" }
              : defaultPrintOptions();
            lastPersistedRef.current[f.id] = opts;
            return { id: f.id, url: f.url, name: f.name, detectedPages: f.pages, options: opts, pageRangeError: "" };
          }),
        );
      } else {
        setDraftJobId(null);
        setPrintFiles([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) void fetchWebDraft();
  }, [userId, fetchWebDraft]);

  // ── Socket: real-time file additions ──
  useEffect(() => {
    if (!userId) return;
    const socket = getSocket();
    socket.emit("join-room", userId);
    const onConnect = () => socket.emit("join-room", userId);
    const onFileAdded = () => void fetchWebDraft();
    socket.on("connect", onConnect);
    socket.on("job-file-added", onFileAdded);
    return () => {
      socket.emit("leave-room", userId);
      socket.off("connect", onConnect);
      socket.off("job-file-added", onFileAdded);
    };
  }, [userId, fetchWebDraft]);

  // ── Handle files shared TO the app (Android Share Intent) ──
  const uploadSharedFiles = useCallback(async (uris: { uri: string; name: string; mimeType: string }[]) => {
    if (!uris.length) return;
    const available = MAX_FILES - printFiles.length;
    if (available <= 0) {
      notify(`Max ${MAX_FILES} files. Remove some first.`, { variant: "error" });
      return;
    }
    const toUpload = uris.slice(0, available);
    setError(null);
    setIsPreparingFiles(true);
    setUploadStage("uploading");
    try {
      // Get file info for presigned uploads
      const fileInfos = await Promise.all(
        toUpload.map(async (f) => {
          const info = await FileSystem.getInfoAsync(f.uri);
          return { name: f.name, mimeType: f.mimeType, size: (info as any).size ?? 0 };
        })
      );
      const uploads = await requestPresignedUploads(fileInfos);
      for (let i = 0; i < toUpload.length; i++) {
        await uploadFileToR2(uploads[i]!.uploadUrl, toUpload[i]!.uri, toUpload[i]!.mimeType);
      }
      const hasConvertible = toUpload.some((f) => /\.(docx?|pptx?|png|jpe?g|bmp|tiff?|webp|gif)$/i.test(f.name));
      setUploadStage(hasConvertible ? "converting" : "creating");
      const urlFiles = toUpload.map((f, i) => ({ name: f.name, url: uploads[i]!.publicUrl }));
      const { job } = await addFilesToWebDraft(urlFiles);
      setDraftJobId(job.id);
      setPrintFiles(
        job.files.map((f) => {
          const opts = f.option ? { ...f.option, customRange: f.option.customRange || "" } : defaultPrintOptions();
          lastPersistedRef.current[f.id] = opts;
          return { id: f.id, url: f.url, name: f.name, detectedPages: f.pages, options: opts, pageRangeError: "" };
        }),
      );
      notify(`${toUpload.length} file(s) added from share!`, { variant: "success" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process shared files.");
    } finally {
      setIsPreparingFiles(false);
    }
  }, [printFiles.length, notify]);

  // Check for shared content on app launch via native ShareIntentModule
  useEffect(() => {
    let mounted = true;
    const checkShared = async () => {
      try {
        console.log("[ShareIntent] Checking for shared files...");
        const { ShareIntentModule: SIM } = NativeModules;
        if (!SIM?.getSharedFiles) {
          console.log("[ShareIntent] Native module not available");
          return;
        }
        const files: { uri: string; name: string; mimeType: string; size: number }[] = await SIM.getSharedFiles();
        console.log("[ShareIntent] Got files:", JSON.stringify(files));
        if (files.length > 0 && mounted) {
          console.log("[ShareIntent] Processing", files.length, "shared file(s)");
          await uploadSharedFiles(
            files.map((f) => ({ uri: f.uri, name: f.name, mimeType: f.mimeType }))
          );
        } else {
          console.log("[ShareIntent] No files to process");
        }
      } catch (err) {
        console.error("[ShareIntent] Error:", err);
      }
    };
    if (userId) void checkShared();
    return () => { mounted = false; };
  }, [userId, uploadSharedFiles]);

  // ── Auto-expand first file ──
  useEffect(() => {
    if (printFiles.length > 0 && expandedIdx === null) setExpandedIdx(0);
    if (expandedIdx !== null && expandedIdx >= printFiles.length) setExpandedIdx(null);
  }, [printFiles.length, expandedIdx]);

  // ── Debounced persist ──
  const persistOptions = useCallback(async () => {
    const pending = printFiles.filter((f) => {
      if (!f.id || f.pageRangeError) return false;
      if (f.options.pageRange === "CUSTOM" && !f.options.customRange?.trim()) return false;
      const last = lastPersistedRef.current[f.id];
      return !last || JSON.stringify(last) !== JSON.stringify(f.options);
    });
    await Promise.all(
      pending.map(async (f) => {
        if (!f.id) return;
        try {
          await updateUserFilePrintOptions(f.id, { ...f.options, customRange: f.options.customRange ?? "" });
          lastPersistedRef.current[f.id] = f.options;
        } catch { /* silent */ }
      }),
    );
  }, [printFiles]);

  useEffect(() => {
    if (!printFiles.length || isPreparingFiles || isSubmitting) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void persistOptions(), 1500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [printFiles, isPreparingFiles, isSubmitting, persistOptions]);

  // ── Pick & upload files ──
  const isPickerOpenRef = useRef(false);
  const pickAndUpload = useCallback(async () => {
    if (isPickerOpenRef.current) return;
    isPickerOpenRef.current = true;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-powerpoint",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "image/*",
        ],
        multiple: true,
      });

      if (result.canceled || !result.assets?.length) return;
      const assets = result.assets;

      const available = MAX_FILES - printFiles.length;
      if (available <= 0) {
        notify(`Max ${MAX_FILES} files. Remove some first.`, { variant: "error" });
        return;
      }
      if (assets.length > available) {
        notify(`Can only add ${available} more file(s).`, { variant: "error" });
        return;
      }

      setError(null);
      setIsPreparingFiles(true);
      setUploadStage("uploading");

      const uploads = await requestPresignedUploads(
        assets.map((a) => ({ name: a.name, mimeType: a.mimeType ?? "application/octet-stream", size: a.size ?? 0 })),
      );

      for (let i = 0; i < assets.length; i++) {
        await uploadFileToR2(uploads[i]!.uploadUrl, assets[i]!.uri, assets[i]!.mimeType ?? "application/octet-stream");
      }

      const hasConvertible = assets.some((a) => /\.(docx?|pptx?|png|jpe?g|bmp|tiff?|webp|gif)$/i.test(a.name));
      setUploadStage(hasConvertible ? "converting" : "creating");

      const urlFiles = assets.map((a, i) => ({ name: a.name, url: uploads[i]!.publicUrl }));
      const { job } = await addFilesToWebDraft(urlFiles);
      setDraftJobId(job.id);
      setPrintFiles(
        job.files.map((f) => {
          const opts = f.option ? { ...f.option, customRange: f.option.customRange || "" } : defaultPrintOptions();
          lastPersistedRef.current[f.id] = opts;
          return { id: f.id, url: f.url, name: f.name, detectedPages: f.pages, options: opts, pageRangeError: "" };
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setIsPreparingFiles(false);
      isPickerOpenRef.current = false;
    }
  }, [printFiles.length, notify]);

  // ── Update per-file options ──
  const updateOptions = useCallback((idx: number, patch: Partial<PrintOptions>) => {
    setPrintFiles((prev) =>
      prev.map((f, i) => {
        if (i !== idx) return f;
        const merged = { ...f, options: { ...f.options, ...patch } };
        if (patch.customRange !== undefined || patch.pageRange !== undefined) {
          merged.pageRangeError =
            merged.options.pageRange === "CUSTOM"
              ? (validateCustomPageRange(merged.options.customRange ?? "", merged.detectedPages) ?? "")
              : "";
        }
        return merged;
      }),
    );
  }, []);

  const removeFile = useCallback(async (idx: number) => {
    const target = printFiles[idx];
    if (target?.id) {
      try { await deleteUserFile(target.id); } catch { /* silent */ }
    }
    setPrintFiles((prev) => prev.filter((_, i) => i !== idx));
    setExpandedIdx((prev) => (prev === idx ? null : prev));
  }, [printFiles]);

  const clearDraft = useCallback(async () => {
    setIsClearing(true);
    try {
      if (draftJobId) await deleteUserPrintJob(draftJobId);
      setPrintFiles([]);
      setDraftJobId(null);
      setExpandedIdx(null);
      setShowClearConfirm(false);
    } catch {
      setError("Failed to clear draft.");
    } finally {
      setIsClearing(false);
    }
  }, [draftJobId]);

  const applyGlobalColor = useCallback((mode: PrintOptions["colorMode"]) => {
    setGlobalColorMode(mode);
    setPrintFiles((prev) => prev.map((f) => ({ ...f, options: { ...f.options, colorMode: mode } })));
  }, []);

  // ── Submit ──
  const onSubmit = async () => {
    if (!userId || !printFiles.length || isSubmitting || !draftJobId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await submitWhatsappJobReview({
        jobId: draftJobId,
        files: printFiles.map((pf) => ({ id: pf.id!, options: pf.options })),
      });
      setVerificationCode(String(result.verificationCode));
      setPrintFiles([]);
      setDraftJobId(null);
      setExpandedIdx(null);
      setRefreshTrigger((t) => t + 1);
      void markOnboardingCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const totals = buildJobTotals(printFiles);
  const hasErrors = printFiles.some((f) => f.pageRangeError || (f.options.pageRange === "CUSTOM" && !f.options.customRange?.trim()));
  const canSubmit = !!userId && printFiles.length > 0 && !hasErrors && !isSubmitting;

  return (
    <View style={[styles.shell, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: `${colors.panel}E0` }]}>
        <View>
          <Text style={[styles.brandTitle, { color: colors.text }]}>ZOPY</Text>
          <Text style={[styles.brandSub, { color: colors.textMuted }]}>PRINT FROM ANYWHERE</Text>
        </View>
        <TouchableOpacity onPress={toggleTheme} style={[styles.themeBtn, { borderColor: colors.border }]}>
          {isDark ? <Sun size={18} color={colors.text} /> : <Moon size={18} color={colors.text} />}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {error && (
          <View style={[styles.errorBanner, { backgroundColor: `${colors.error}18`, borderColor: `${colors.error}40` }]}>
            <Text style={{ color: colors.error, fontSize: 13, fontWeight: "600" }}>{error}</Text>
          </View>
        )}

        {/* Hero Panel */}
        <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.panel }]}>
          <Text style={[styles.h1, { color: colors.text }]}>Upload Documents</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14, marginBottom: 8 }}>
            Choose Color or B/W once, then set options per file.
          </Text>

          {verificationCode ? (
            <SuccessCard verificationCode={verificationCode} onCreateMore={() => setVerificationCode(null)} />
          ) : (
            <>
              <UploadArea isUploading={isPreparingFiles} uploadStage={uploadStage} onPickFiles={pickAndUpload} />

              {/* WhatsApp CTA */}
              <TouchableOpacity
                style={[styles.whatsappBtn, { backgroundColor: "#25D366" }]}
                activeOpacity={0.8}
                onPress={() => {
                  if (isWhatsappSynced) {
                    Linking.openURL(`https://wa.me/${WHATSAPP_NUMBER}?text=hi`);
                  } else {
                    setShowSyncModal(true);
                  }
                }}
              >
                <MessageCircle size={16} color="#fff" />
                <Text style={styles.whatsappText}>Forward from WhatsApp</Text>
              </TouchableOpacity>

              {/* Browse WhatsApp Files */}
              <TouchableOpacity
                style={[styles.waFolderBtn, { borderColor: colors.border, backgroundColor: colors.panelMuted }]}
                activeOpacity={0.8}
                onPress={pickAndUpload}
              >
                <FolderOpen size={16} color={colors.textMuted} />
                <Text style={[styles.waFolderText, { color: colors.textMuted }]}>Browse Files (WhatsApp / Downloads)</Text>
              </TouchableOpacity>

              {/* Draft actions */}
              <View style={styles.draftActions}>
                <TouchableOpacity onPress={() => void fetchWebDraft()} disabled={isRefreshing} style={styles.draftBtn}>
                  <RefreshCw size={12} color={colors.textMuted} />
                  <Text style={[styles.draftBtnText, { color: colors.textMuted }]}>
                    {isRefreshing ? "Refreshing..." : "Refresh"}
                  </Text>
                </TouchableOpacity>
                {printFiles.length > 0 && (
                  <TouchableOpacity onPress={() => setShowClearConfirm(true)} style={styles.draftBtn}>
                    <Trash2 size={12} color={colors.error} />
                    <Text style={[styles.draftBtnText, { color: colors.error }]}>Clear Draft</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* File Options */}
              {printFiles.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>File Options</Text>

                  <View style={{ marginBottom: 12 }}>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Print Type (all files)</Text>
                    <ToggleGroup
                      options={[
                        { label: "Color Print", value: "COLOR" },
                        { label: "B/W Print", value: "BW" },
                      ]}
                      value={globalColorMode}
                      onChange={applyGlobalColor}
                    />
                  </View>

                  <View style={{ gap: 8 }}>
                    {printFiles.map((pf, idx) => (
                      <FileCard
                        key={`${pf.name}-${idx}`}
                        pf={pf}
                        expanded={expandedIdx === idx}
                        onToggle={() => setExpandedIdx((prev) => (prev === idx ? null : idx))}
                        onUpdate={(patch) => updateOptions(idx, patch)}
                        onRemove={() => void removeFile(idx)}
                      />
                    ))}
                  </View>

                  {/* Add More */}
                  <TouchableOpacity
                    style={[styles.addMoreBtn, { borderColor: `${colors.brand}80` }]}
                    activeOpacity={0.7}
                    onPress={pickAndUpload}
                  >
                    <Plus size={14} color={colors.brand} />
                    <Text style={{ color: colors.brand, fontWeight: "700", fontSize: 13 }}>Add More</Text>
                  </TouchableOpacity>

                  {/* Summary */}
                  <View style={[styles.summaryCard, { borderColor: colors.border }]}>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>Total</Text>
                    <Text style={{ color: colors.text, fontSize: 24, fontWeight: "700" }}>Rs {totals.totalCost}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                      {printFiles.length} file(s) • {totals.totalPages} pages • {totals.estimatedTime} min
                    </Text>
                  </View>

                  {/* Submit */}
                  <TouchableOpacity
                    style={[
                      styles.submitBtn,
                      { backgroundColor: canSubmit ? colors.brand : colors.panelMuted },
                    ]}
                    activeOpacity={0.8}
                    onPress={() => void onSubmit()}
                    disabled={!canSubmit}
                  >
                    <Text style={{ color: canSubmit ? "#fff" : colors.textMuted, fontWeight: "700", fontSize: 15 }}>
                      {isSubmitting ? "Submitting..." : "Confirm and Print"}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}
        </View>

        {/* Jobs List */}
        <PrintJobsList userId={userId} refreshTrigger={refreshTrigger} />
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* WhatsApp Sync Modal */}
      <Modal visible={showSyncModal} transparent animationType="fade" onRequestClose={() => setShowSyncModal(false)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { backgroundColor: colors.panel, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Sync WhatsApp</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginVertical: 16 }}>
              Sync your WhatsApp to access this feature.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { borderColor: colors.border }]} onPress={() => setShowSyncModal(false)}>
                <Text style={{ color: colors.text, fontWeight: "600" }}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.brand, borderWidth: 0 }]}
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

      {/* Clear Draft Confirm */}
      <Modal visible={showClearConfirm} transparent animationType="fade" onRequestClose={() => setShowClearConfirm(false)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { backgroundColor: colors.panel, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Clear Draft?</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginVertical: 12 }}>
              This will delete all {printFiles.length} file(s) permanently.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: colors.border }]}
                onPress={() => setShowClearConfirm(false)}
                disabled={isClearing}
              >
                <Text style={{ color: colors.text, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.error, borderWidth: 0 }]}
                onPress={() => void clearDraft()}
                disabled={isClearing}
              >
                <Trash2 size={14} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "700" }}>{isClearing ? "Clearing..." : "Delete All"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 54,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  brandTitle: { fontSize: 22, fontWeight: "800", letterSpacing: 0.5 },
  brandSub: { fontSize: 10, letterSpacing: 1, marginTop: 1 },
  themeBtn: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1 },
  scrollContent: { padding: 8, gap: 12 },
  errorBanner: { borderWidth: 1, borderRadius: 10, padding: 12 },
  panel: { borderWidth: 1, borderRadius: 14, padding: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.06, shadowRadius: 20, elevation: 4 },
  h1: { fontSize: 20, fontWeight: "800", marginBottom: 4 },
  whatsappBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 13, marginTop: 12 },
  whatsappText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  waFolderBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 12, marginTop: 8, borderWidth: 1 },
  waFolderText: { fontWeight: "600", fontSize: 13 },
  draftActions: { flexDirection: "row", justifyContent: "center", gap: 16, marginTop: 10 },
  draftBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  draftBtnText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginTop: 16, marginBottom: 8 },
  fieldLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  addMoreBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 12, paddingVertical: 12, marginTop: 10 },
  summaryCard: { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 12 },
  submitBtn: { borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 12 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
  modalCard: { borderWidth: 1, borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  modalActions: { flexDirection: "row", gap: 8 },
  modalBtn: { flex: 1, flexDirection: "row", borderWidth: 1, borderRadius: 10, paddingVertical: 11, alignItems: "center", justifyContent: "center", gap: 6 },
});
