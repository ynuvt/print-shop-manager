import type { PrintFileOption } from "@printowl/types";
import axios from "axios";
// src/api/api.ts
const API_ORIGIN =
  import.meta.env.VITE_API_ORIGIN ?? "https://zopy.devlocstudio.in";
const BASE_URL = `${API_ORIGIN}/api/v1`;
const MAX_JOB_UPLOAD_BYTES = 50 * 1024 * 1024;

export type UserPrintJobFile = {
  id: string;
  name: string;
  pages: number;
  url: string;
  option: PrintFileOption | null;
  uploadedByUserId?: string | null;
  uploadedByPhoneNumber?: string | null;
  uploadedByDisplayName?: string | null;
  uploadedByRole?: "OWNER" | "COLLABORATOR";
  fileCost?: number;
  uploaderDone?: boolean;
};

export type UserPrintJob = {
  id: string;
  totalCost?: number;
  totalPages?: number;
  estimatedTime?: number;
  status: string;
  verificationCode: string | null;
  oldOtp?: number | null;
  expired?: boolean;
  createdAt: string;
  source?: string;
  userMetadataId?: string | null;
  files: UserPrintJobFile[];
  viewerRole?: "OWNER" | "COLLABORATOR";
  permissions?: {
    canViewAllFiles: boolean;
    canEditAllFiles: boolean;
    canDeleteAllFiles: boolean;
    canAddFiles: boolean;
    canSubmit: boolean;
  };
  viewerCost?: number;
  isCollabDone?: boolean;
  costBreakdown?: {
    perUser: Array<{
      key: string;
      displayName: string;
      role: string;
      cost: number;
    }>;
    totalCost: number;
  };
  userMetadata?: {
    phoneNumber: string;
    name?: string | null;
  } | null;
};

export type UserSession = {
  userId: string;
  onboardingCompleted: boolean;
  onboardingSkipped: boolean;
  whatsappSynced?: boolean;
};

/**
 * Robust storage helpers that use both localStorage and Cookies.
 * This fixes session loss on some iPhones/Browsers (like WhatsApp IAB) 
 * where localStorage might not persist correctly or be blocked.
 */
export const storage = {
  get(key: string): string | null {
    try {
      const val = localStorage.getItem(key);
      if (val) return val;
    } catch (e) {}

    // Fallback to cookie
    try {
      const name = key + "=";
      const ca = document.cookie.split(";");
      for (let i = 0; i < ca.length; i++) {
        let c = ca[i].trim();
        if (c.indexOf(name) === 0) return c.substring(name.length, c.length);
      }
    } catch (e) {}
    
    return null;
  },

  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (e) {}

    // Always set cookie as backup (1 year expiry)
    try {
      const expires = new Date();
      expires.setTime(expires.getTime() + 365 * 24 * 60 * 60 * 1000);
      document.cookie = `${key}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
    } catch (e) {}
  },

  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
    try {
      document.cookie = `${key}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
    } catch (e) {}
  }
};

// Helper to get token
function getToken() {
  return storage.get("token");
}


// POST /register - gets a unique token
export async function registerUser(): Promise<{
  token: string;
  userId: string;
}> {
  const res = await axios.get(`${BASE_URL}/auth/register`);
  if (!res.data) throw new Error("Failed to register user");
  return res.data;
}

export async function loginWithWhatsappOtp(code: string): Promise<{
  token?: string;
  userId?: string;
  alreadyVerified?: boolean;
}> {
  const token = getToken();
  const res = await axios.post(`${BASE_URL}/auth/whatsapp-login`, { code }, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });

  if (!res.data) throw new Error("Failed to sync with WhatsApp.");
  return res.data as { token?: string; userId?: string; alreadyVerified?: boolean };
}

export async function getUserSession(): Promise<UserSession> {
  const token = getToken();
  const res = await axios.get(`${BASE_URL}/users/session`, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  if (!res.data) throw new Error("Failed to fetch session");
  return res.data as UserSession;
}

export async function markOnboardingCompleted(): Promise<void> {
  const token = getToken();
  const res = await axios.post(
    `${BASE_URL}/users/onboarding/completed`,
    {},
    {
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  if (!res.data) throw new Error("Failed to mark onboarding completed");
}

// Fetch print job status
export async function getPrintStatus(verificationCode: string) {
  const token = getToken();
  const res = await axios.get(`${BASE_URL}/jobs/${verificationCode}`, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  if (!res.data) throw new Error("Failed to get print status");
  return res.data;
}

/*
 * Legacy upload flow (multipart upload to backend).
 * Disabled in favor of presigned client uploads + create-with-urls.
 */
// export async function createPrintJobFromFiles(
//   files: File[],
//   fileOptions: PrintFileOption[],
//   onUploadProgress?: (percent: number) => void,
//   captchaToken?: string,
// ): Promise<{ verificationCode: number }> {
//   const token = getToken();
//   const formData = new FormData();
//
//   files.forEach((file) => {
//     formData.append("files", file);
//   });
//   formData.append("fileOptions", JSON.stringify(fileOptions));
//   if (captchaToken) {
//     formData.append("captchaToken", captchaToken);
//   }
//
//   let res;
//   try {
//     res = await axios.post(`${BASE_URL}/jobs/create-with-files`, formData, {
//       headers: {
//         authorization: `Bearer ${token}`,
//       },
//       onUploadProgress: (evt) => {
//         if (!onUploadProgress) return;
//         if (!evt.total || evt.total <= 0) return;
//         onUploadProgress(Math.round((evt.loaded / evt.total) * 100));
//       },
//     });
//   } catch (error) {
//     if (axios.isAxiosError(error)) {
//       const status = error.response?.status;
//       const serverError = error.response?.data?.error;
//
//       if (status === 413) {
//         throw new Error(
//           "Upload too large. Max file size is 50 MB. If this file is under 50 MB, increase reverse-proxy/CDN body size limit to at least 55 MB.",
//         );
//       }
//
//       if (typeof serverError === "string" && serverError.trim()) {
//         throw new Error(serverError);
//       }
//     }
//
//     throw error;
//   }
//
//   if (!res.data) throw new Error("Failed to create print job");
//   return res.data;
// }

type PresignedUpload = {
  name: string;
  key: string;
  uploadUrl: string;
  publicUrl: string;
};

export async function requestPresignedUploads(
  files: File[],
): Promise<PresignedUpload[]> {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_JOB_UPLOAD_BYTES) {
    throw new Error(
      "Total upload too large (max 50 MB per job). Remove some files to continue.",
    );
  }

  const token = getToken();
  const payload = {
    files: files.map((file) => ({
      name: file.name,
      contentType: file.type || "application/octet-stream",
    })),
  };

  const res = await axios.post(`${BASE_URL}/jobs/presign-uploads`, payload, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  if (!res.data?.uploads) {
    throw new Error("Failed to prepare uploads");
  }

  return res.data.uploads as PresignedUpload[];
}

export async function uploadFileToR2(
  uploadUrl: string,
  file: File,
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload ${file.name}.`);
  }
}

export async function createPrintJobFromUrls(
  files: Array<{ name: string; url: string; options: PrintFileOption }>,
  captchaToken?: string,
): Promise<{ verificationCode: number }> {
  const token = getToken();
  const res = await axios.post(
    `${BASE_URL}/jobs/create-with-urls`,
    { files, captchaToken },
    {
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  if (!res.data) throw new Error("Failed to create print job");
  return res.data;
}

export async function getWebDraftJob(): Promise<UserPrintJob | null> {
  const token = getToken();
  const res = await axios.get(`${BASE_URL}/jobs/web-draft?t=${Date.now()}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return res.data ? (res.data as UserPrintJob) : null;
}

export async function addFilesToWebDraft(
  files: Array<{ name: string; url: string }>,
  colorMode?: "BW" | "COLOR",
): Promise<{ job: UserPrintJob }> {
  const token = getToken();
  const res = await axios.post(
    `${BASE_URL}/jobs/web-draft/add-files`,
    { files, colorMode },
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.data) throw new Error("Failed to append files");
  return res.data as { job: UserPrintJob };
}

export async function submitWhatsappJobReview(input: {
  jobId: string;
  files: Array<{ id: string; options: PrintFileOption }>;
  globalColorMode?: "BW" | "COLOR";
}): Promise<{ verificationCode: number }> {
  const token = getToken();
  let res;
  try {
    res = await axios.post(`${BASE_URL}/jobs/submit-whatsapp-job`, input, {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const serverError = error.response?.data?.error;
      if (typeof serverError === "string" && serverError.trim()) {
        throw new Error(serverError);
      }
    }
    throw error;
  }

  if (!res.data) throw new Error("Failed to update job");
  return res.data as { verificationCode: number };
}

export async function deleteUserFile(fileId: string): Promise<void> {
  const token = getToken();
  const res = await axios.delete(`${BASE_URL}/files`, {
    data: { id: fileId },
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  if (!res.data) throw new Error("Failed to remove file");
}

export async function resyncWhatsappJobs(): Promise<{ updatedCount: number }> {
  const token = getToken();
  try {
    const res = await axios.post(
      `${BASE_URL}/jobs/resync-whatsapp`,
      {},
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    if (!res.data) throw new Error("Failed to resync WhatsApp jobs");
    return res.data as { updatedCount: number };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const serverError = error.response?.data?.error;
      if (typeof serverError === "string" && serverError.trim()) {
        throw new Error(serverError);
      }
    }
    throw error;
  }
}

export async function updateUserFilePrintOptions(
  fileId: string,
  options: PrintFileOption,
): Promise<void> {
  const token = getToken();
  const res = await axios.put(
    `${BASE_URL}/files/printOptions/${fileId}`,
    options,
    {
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  if (!res.data) throw new Error("Failed to update print options");
}

// Fetch all print jobs for the currently logged-in user.
export async function getUserPrintJobs(): Promise<UserPrintJob[]> {
  const token = getToken();
  const res = await axios.get(`${BASE_URL}/jobs/user-jobs`, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  if (!res.data) throw new Error("Failed to fetch user print jobs");
  return res.data;
}

export async function getPrintJobByIdPublic(id: string): Promise<UserPrintJob> {
  const token = getToken();
  let res;
  try {
    res = await axios.get(`${BASE_URL}/jobs/review/${id}`, {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const serverError = error.response?.data?.error;
      if (typeof serverError === "string" && serverError.trim()) {
        throw new Error(serverError);
      }
    }
    throw error;
  }

  if (!res.data) throw new Error("Failed to fetch job");
  return res.data as UserPrintJob;
}

export async function confirmReviewJob(jobId: string): Promise<{ userCost: number }> {
  const token = getToken();
  if (!token) {
    throw new Error("Missing session token. Please open the link again.");
  }
  const res = await axios.post(
    `${BASE_URL}/jobs/review/${jobId}/confirm`,
    {},
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.data) throw new Error("Failed to confirm files");
  return res.data as { userCost: number };
}

export async function addFilesToJobFromUrls(
  jobId: string,
  files: Array<{ name: string; url: string }>,
  colorMode?: "BW" | "COLOR",
): Promise<{
  addedFilesCount: number;
  addedPages: number;
  addedCost: number;
}> {
  const token = getToken();
  if (!token) {
    throw new Error("Missing session token. Please open the link again.");
  }

  const res = await axios.post(
    `${BASE_URL}/jobs/${jobId}/add-files-from-urls`,
    { files, colorMode },
    {
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  if (!res.data) throw new Error("Failed to add files");
  return res.data as {
    addedFilesCount: number;
    addedPages: number;
    addedCost: number;
  };
}

export async function getUserPrintJobById(id: string): Promise<UserPrintJob> {
  const jobs = await getUserPrintJobs();
  const job = jobs.find((j) => j.id === id);
  if (!job) {
    throw new Error("Print job not found");
  }
  return job;
}

export async function deleteUserPrintJob(id: string): Promise<void> {
  const token = getToken();

  const res = await axios.delete(`${BASE_URL}/jobs/delete/${id}`, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  if (!res.data) throw new Error("Failed to delete print job");
}

export async function resubmitCompletedPrintJob(id: string): Promise<void> {
  const token = getToken();

  const res = await axios.put(
    `${BASE_URL}/jobs/resubmit/${id}`,
    {},
    {
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  if (!res.data) throw new Error("Failed to submit job again");
}

export async function updateGlobalColorMode(
  jobId: string,
  colorMode: "BW" | "COLOR",
): Promise<void> {
  const token = getToken();
  const res = await axios.put(
    `${BASE_URL}/jobs/${jobId}/global-color-mode`,
    { colorMode },
    {
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  if (!res.data) throw new Error("Failed to update global color mode");
}
