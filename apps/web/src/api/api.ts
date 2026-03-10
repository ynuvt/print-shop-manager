import type { Job } from "@printowl/types";
import axios from "axios";
// src/api/api.ts
const BASE_URL = "http://localhost:4000/api/v1";

export type UserPrintJob = {
  id: string;
  totalCost: number;
  totalPages: number;
  estimatedTime: number;
  status: string;
  verificationCode: string;
  createdAt: string;
  files: Array<{
    id: string;
    name: string;
    pages: number;
    url: string;
  }>;
};

// Helper to get token from localStorage
function getToken() {
  return localStorage.getItem("token");
}

// POST /register - gets a unique token
export async function registerUser(): Promise<{ token: string }> {
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

// Create a new print job
export async function createPrintJob(
  job: Job,
): Promise<{ verificationCode: number }> {
  const token = getToken();
  const res = await axios.post(`${BASE_URL}/jobs/create`, job, {
    headers: {
      authorization: `Bearer ${token}`,
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
