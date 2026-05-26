import type { PrintJob, PrintJobSummary } from "../types";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ?? "https://zopy.devlocstudio.in/api/v1"
).replace(/\/$/, "");
const TOKEN_KEY = "printowl_admin_token";

type LoginResponse = {
  token?: string | { token?: string };
};

function normalizeToken(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "token" in value &&
    typeof (value as { token?: unknown }).token === "string"
  ) {
    const nested = (value as { token: string }).token;
    return nested.trim() ? nested : null;
  }

  return null;
}

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

  const data = (await res.json()) as LoginResponse;
  const token = normalizeToken(data.token);

  if (!token) {
    throw new Error("Token missing in login response.");
  }

  localStorage.setItem(TOKEN_KEY, token);
  return token;
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
  status: "PROCESSING" | "COMPLETED" | "REJECTED" | "FAILED" | "CANCELED",
  shopId?: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/jobs/update-status/${id}`, {
    method: "PUT",
    headers: buildHeaders(),
    body: JSON.stringify({ status, userId, shopId }),
  });

  if (!res.ok) {
    throw new Error(`Failed to update status (HTTP ${res.status}).`);
  }
}

export interface PrintShopInfo {
  id: string;
  username: string;
  shopId: string;
}

export async function fetchActiveShops(): Promise<PrintShopInfo[]> {
  const res = await fetch(`${API_BASE}/jobs/shops`, {
    headers: buildHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Failed to load shops (HTTP ${res.status}).`);
  }

  const data = await res.json();
  return data.shops as PrintShopInfo[];
}

export async function shopLogin(
  username: string,
  password: string,
): Promise<{ token: string; shop: PrintShopInfo }> {
  const res = await fetch(`${API_BASE}/auth/shop-login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || "Login failed");
  }

  const data = await res.json();
  const tokenString = typeof data.token === "object" && data.token !== null && "token" in data.token
    ? (data.token as any).token
    : data.token;

  return { token: tokenString, shop: data.shop };
}

