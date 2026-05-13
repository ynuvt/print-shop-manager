/**
 * API client – adapted from apps/web/src/api/api.ts.
 * Uses the same endpoints, swaps localStorage for the storage module.
 */

import axios from "axios";
import { BASE_URL, MAX_JOB_UPLOAD_BYTES } from "../config";
import { getToken } from "../storage";

// ── Types (shared between web & mobile) ──

export type UserPrintJobFile = {
  id: string;
  name: string;
  pages: number;
  url: string;
  option: {
    paperSize: string;
    colorMode: "BW" | "COLOR";
    orientation: "PORTRAIT" | "LANDSCAPE";
    scaleMode: "FIT" | "SHRINK" | "NOSCALE";
    pageRange: "ALL" | "CUSTOM";
    customRange?: string;
    duplex: "ONE" | "BOTH";
    copies: number;
    pagesPerSheet?: number;
  } | null;
};

export type UserPrintJob = {
  id: string;
  totalCost?: number;
  totalPages?: number;
  estimatedTime?: number;
  status: string;
  verificationCode: string | null;
  createdAt: string;
  source?: string;
  files: UserPrintJobFile[];
};

export type UserSession = {
  userId: string;
  onboardingCompleted: boolean;
  onboardingSkipped: boolean;
  whatsappSynced?: boolean;
};

type PresignedUpload = {
  name: string;
  key: string;
  uploadUrl: string;
  publicUrl: string;
};

// ── Helpers ──

function authHeaders() {
  const token = getToken();
  return token ? { authorization: `Bearer ${token}` } : undefined;
}

// ── Auth ──

export async function registerUser(): Promise<{ token: string; userId: string }> {
  const res = await axios.get(`${BASE_URL}/auth/register`);
  if (!res.data) throw new Error("Failed to register user");
  return res.data;
}

/** Request a mobile sync OTP from the server */
export async function requestMobileSync(): Promise<{ syncId: string; otp: string }> {
  const res = await axios.post(`${BASE_URL}/auth/mobile-sync`);
  if (!res.data?.syncId) throw new Error("Failed to generate sync code.");
  return res.data;
}

/** Poll to check if mobile sync OTP was used */
export async function checkMobileSyncStatus(
  syncId: string,
): Promise<{ status: "pending" | "linked" | "expired"; token?: string; userId?: string }> {
  const res = await axios.get(`${BASE_URL}/auth/mobile-sync/status`, {
    params: { syncId },
  });
  return res.data;
}

export async function loginWithWhatsappOtp(
  code: string,
): Promise<{ token: string; userId: string }> {
  const res = await axios.post(
    `${BASE_URL}/auth/whatsapp-login`,
    { code },
    { headers: authHeaders() },
  );
  if (!res.data) throw new Error("Failed to sync with WhatsApp.");
  return res.data as { token: string; userId: string };
}

// ── Session ──

export async function getUserSession(): Promise<UserSession> {
  const res = await axios.get(`${BASE_URL}/users/session`, {
    headers: authHeaders(),
  });
  if (!res.data) throw new Error("Failed to fetch session");
  return res.data as UserSession;
}

export async function markOnboardingCompleted(): Promise<void> {
  await axios.post(`${BASE_URL}/users/onboarding/completed`, {}, { headers: authHeaders() });
}

// ── Jobs ──

export async function getWebDraftJob(): Promise<UserPrintJob | null> {
  const res = await axios.get(`${BASE_URL}/jobs/web-draft?t=${Date.now()}`, {
    headers: authHeaders(),
  });
  return res.data ? (res.data as UserPrintJob) : null;
}

export async function addFilesToWebDraft(
  files: Array<{ name: string; url: string }>,
): Promise<{ job: UserPrintJob }> {
  const res = await axios.post(
    `${BASE_URL}/jobs/web-draft/add-files`,
    { files },
    { headers: authHeaders() },
  );
  if (!res.data) throw new Error("Failed to append files");
  return res.data as { job: UserPrintJob };
}

export async function submitWhatsappJobReview(input: {
  jobId: string;
  files: Array<{ id: string; options: Record<string, unknown> }>;
}): Promise<{ verificationCode: number }> {
  const res = await axios.post(`${BASE_URL}/jobs/submit-whatsapp-job`, input, {
    headers: authHeaders(),
  });
  if (!res.data) throw new Error("Failed to update job");
  return res.data as { verificationCode: number };
}

export async function getUserPrintJobs(): Promise<UserPrintJob[]> {
  const res = await axios.get(`${BASE_URL}/jobs/user-jobs`, {
    headers: authHeaders(),
  });
  if (!res.data) throw new Error("Failed to fetch user print jobs");
  console.log("[API] Fetched user print jobs count:", res.data.length);
  return res.data;
}

export async function getUserPrintJobById(id: string): Promise<UserPrintJob> {
  const jobs = await getUserPrintJobs();
  const job = jobs.find((j) => j.id === id);
  if (!job) throw new Error("Print job not found");
  console.log(`[API] Fetched job by ID (${id}):`, JSON.stringify(job, null, 2));
  return job;
}

export async function deleteUserPrintJob(id: string): Promise<void> {
  await axios.delete(`${BASE_URL}/jobs/delete/${id}`, { headers: authHeaders() });
}

export async function deleteUserFile(fileId: string): Promise<void> {
  await axios.delete(`${BASE_URL}/files`, {
    data: { id: fileId },
    headers: authHeaders(),
  });
}

export async function updateUserFilePrintOptions(
  fileId: string,
  options: Record<string, unknown>,
): Promise<void> {
  await axios.put(`${BASE_URL}/files/printOptions/${fileId}`, options, {
    headers: authHeaders(),
  });
}

export async function resyncWhatsappJobs(): Promise<{ updatedCount: number }> {
  try {
    const res = await axios.post(
      `${BASE_URL}/jobs/resync-whatsapp`,
      {},
      { headers: authHeaders() },
    );
    if (!res.data) throw new Error("Failed to resync WhatsApp jobs");
    return res.data as { updatedCount: number };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const serverError = error.response?.data?.error;
      if (typeof serverError === "string" && serverError.trim()) throw new Error(serverError);
    }
    throw error;
  }
}

export async function resubmitCompletedPrintJob(id: string): Promise<void> {
  await axios.put(`${BASE_URL}/jobs/resubmit/${id}`, {}, { headers: authHeaders() });
}

// ── Upload ──

export async function requestPresignedUploads(
  files: Array<{ name: string; mimeType: string; size: number }>,
): Promise<PresignedUpload[]> {
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  if (totalBytes > MAX_JOB_UPLOAD_BYTES) {
    throw new Error("Total upload too large (max 50 MB per job). Remove some files to continue.");
  }

  const payload = {
    files: files.map((f) => ({
      name: f.name,
      contentType: f.mimeType || "application/octet-stream",
    })),
  };

  const res = await axios.post(`${BASE_URL}/jobs/presign-uploads`, payload, {
    headers: authHeaders(),
  });
  if (!res.data?.uploads) throw new Error("Failed to prepare uploads");
  return res.data.uploads as PresignedUpload[];
}

/** Infer a valid MIME from file extension when the share intent gives us a wildcard */
function inferMime(name: string, fallback: string): string {
  if (fallback && !fallback.includes("*") && fallback !== "application/octet-stream") return fallback;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    tiff: "image/tiff",
    tif: "image/tiff",
  };
  return map[ext] || fallback || "application/octet-stream";
}

export async function uploadFileToR2(uploadUrl: string, fileUri: string, mimeType: string, fileName?: string): Promise<void> {
  const FileSystem = await import("expo-file-system");

  const actualMime = fileName ? inferMime(fileName, mimeType) : (mimeType || "application/octet-stream");
  console.log("[Upload] Start:", { fileName, mimeType: actualMime, uri: fileUri.substring(0, 80) });

  // For content:// URIs (from share intents), copy to a temp file first
  let uri = fileUri;
  if (fileUri.startsWith("content://")) {
    const ext = fileName?.split(".").pop() || "bin";
    const tempPath = FileSystem.cacheDirectory + "upload_" + Date.now() + "." + ext;
    try {
      await FileSystem.copyAsync({ from: fileUri, to: tempPath });
      const info = await FileSystem.getInfoAsync(tempPath);
      console.log("[Upload] Copied to temp:", tempPath, "exists:", info.exists, "size:", (info as any).size);
      uri = tempPath;
    } catch (copyErr) {
      console.error("[Upload] copyAsync failed:", copyErr);
      throw new Error(`Cannot read shared file: ${fileName || "unknown"}`);
    }
  }

  try {
    const result = await FileSystem.uploadAsync(uploadUrl, uri, {
      httpMethod: "PUT",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { "Content-Type": actualMime },
    });
    console.log("[Upload] Done:", { status: result.status, file: fileName });

    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Upload failed (status ${result.status}) for ${fileName}`);
    }
  } finally {
    // Clean up temp file
    if (uri !== fileUri) {
      try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
    }
  }
}
