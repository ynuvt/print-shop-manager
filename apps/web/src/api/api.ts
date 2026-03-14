import type { PrintFileOption } from "@printowl/types";
import axios from "axios";
// src/api/api.ts
const BASE_URL = "http://localhost:4000/api/v1";

export type UserPrintFileOption = {
  paperSize: string;
  colorMode: string;
  pageRange: string;
  customRange: string | null;
  duplex: string;
  copies: number;
};

export type UserPrintJobFile = {
  id: string;
  name: string;
  pages: number;
  url: string;
  option: UserPrintFileOption | null;
};

export type UserPrintJob = {
  id: string;
  totalCost: number;
  totalPages: number;
  estimatedTime: number;
  status: string;
  verificationCode: string;
  createdAt: string;
  files: UserPrintJobFile[];
};

// Helper to get token from localStorage
function getToken() {
  return localStorage.getItem("token");
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

export async function createPrintJobFromFiles(
  files: File[],
  fileOptions: PrintFileOption[],
  onUploadProgress?: (percent: number) => void,
): Promise<{ verificationCode: number }> {
  const token = getToken();
  const formData = new FormData();

  files.forEach((file) => {
    formData.append("files", file);
  });
  formData.append("fileOptions", JSON.stringify(fileOptions));

  const res = await axios.post(`${BASE_URL}/jobs/create-with-files`, formData, {
    headers: {
      authorization: `Bearer ${token}`,
    },
    onUploadProgress: (evt) => {
      if (!onUploadProgress) return;
      if (!evt.total || evt.total <= 0) return;
      onUploadProgress(Math.round((evt.loaded / evt.total) * 100));
    },
  });

  if (!res.data) throw new Error("Failed to create print job");
  return res.data;
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

export async function getUserPrintJobById(id: string): Promise<UserPrintJob> {
  const jobs = await getUserPrintJobs();
  const job = jobs.find((j) => j.id === id);
  if (!job) {
    throw new Error("Print job not found");
  }
  return job;
}
