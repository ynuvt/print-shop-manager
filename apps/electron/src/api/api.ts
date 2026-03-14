import type { PrintJob, PrintJobSummary } from "../types";

const API_BASE = "http://localhost:4000/api/v1";
const TOKEN_KEY = "printowl_admin_token";

function readToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function buildHeaders(): HeadersInit {
  const token = readToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export function getAuthToken(): string | null {
  return readToken();
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function adminLogin(
  email: string,
  password: string,
): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/admin-login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error(`Login failed (HTTP ${res.status}).`);
  }

  const data = (await res.json()) as { token?: string };
  if (!data.token) {
    throw new Error("Token missing in login response.");
  }

  localStorage.setItem(TOKEN_KEY, data.token);
  return data.token;
}

export class NotFoundError extends Error {
  constructor(public readonly code: string) {
    super(`No job found for code ${code}.`);
  }
}

export async function fetchAllJobs(): Promise<PrintJobSummary[]> {
  const res = await fetch(`${API_BASE}/jobs/all`, {
    headers: buildHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Failed to load jobs (HTTP ${res.status}).`);
  }

  return res.json() as Promise<PrintJobSummary[]>;
}

export async function fetchJobByCode(code: string): Promise<PrintJob> {
  const res = await fetch(`${API_BASE}/jobs/${code}`, {
    headers: buildHeaders(),
  });

  if (res.status === 404) throw new NotFoundError(code);
  if (!res.ok) {
    throw new Error(`Failed to load job (HTTP ${res.status}).`);
  }

  return res.json() as Promise<PrintJob>;
}

export async function updateJobStatus(
  id: string,
  userId: string,
  status: "PROCESSING" | "COMPLETED" | "REJECTED" | "FAILED",
): Promise<void> {
  const res = await fetch(`${API_BASE}/jobs/update-status/${id}`, {
    method: "PUT",
    headers: buildHeaders(),
    body: JSON.stringify({ status, userId }),
  });

  if (!res.ok) {
    throw new Error(`Failed to update status (HTTP ${res.status}).`);
  }
}
