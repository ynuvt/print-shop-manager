// api/brandApi.ts
// API client for brand dashboard endpoints.

import axios from "axios";

const API_BASE = import.meta.env.VITE_API_ORIGIN ?? "https://zopy.devlocstudio.in";

const brandAxios = axios.create({ baseURL: `${API_BASE}/api/v1` });

// Attach brand token to every request
brandAxios.interceptors.request.use((config) => {
  const token = localStorage.getItem("brandToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── AUTH ────────────────────────────────────────────────────────────────────

export async function brandLogin(email: string, password: string) {
  const { data } = await brandAxios.post("/brand-auth/login", { email, password });
  return data;
}

// ─── PROFILE ─────────────────────────────────────────────────────────────────

export async function getBrandProfile() {
  const { data } = await brandAxios.get("/brand/profile");
  return data;
}

export async function updateBrandProfile(body: { name?: string; logo?: string }) {
  const { data } = await brandAxios.put("/brand/profile", body);
  return data;
}

// ─── OUTLETS ─────────────────────────────────────────────────────────────────

export async function getOutlets() {
  const { data } = await brandAxios.get("/brand/outlets");
  return data;
}

export async function createOutlet(body: {
  name: string;
  address?: string;
  outletCode: string;
  latitude?: number;
  longitude?: number;
  mapLink?: string;
}) {
  const { data } = await brandAxios.post("/brand/outlets", body);
  return data;
}

export async function updateOutlet(id: string, body: Record<string, unknown>) {
  const { data } = await brandAxios.put(`/brand/outlets/${id}`, body);
  return data;
}

export async function deleteOutlet(id: string) {
  const { data } = await brandAxios.delete(`/brand/outlets/${id}`);
  return data;
}

// ─── WORKERS ─────────────────────────────────────────────────────────────────

export async function getWorkers(outletId: string) {
  const { data } = await brandAxios.get(`/brand/outlets/${outletId}/workers`);
  return data;
}

export async function createWorker(outletId: string, body: { phoneNumber: string; name: string }) {
  const { data } = await brandAxios.post(`/brand/outlets/${outletId}/workers`, body);
  return data;
}

export async function updateWorker(id: string, body: Record<string, unknown>) {
  const { data } = await brandAxios.put(`/brand/workers/${id}`, body);
  return data;
}

export async function deleteWorker(id: string) {
  const { data } = await brandAxios.delete(`/brand/workers/${id}`);
  return data;
}

// ─── OFFERS ──────────────────────────────────────────────────────────────────

export async function getOffers() {
  const { data } = await brandAxios.get("/brand/offers");
  return data;
}

export async function updateFirstTimeOffer(body: {
  name: string;
  description?: string;
  discountType: string;
  discountValue: number;
  isActive?: boolean;
  imageUrl?: string;
  campaignType?: string;
}) {
  const { data } = await brandAxios.put("/brand/offers/first-time", body);
  return data;
}

export async function updateReturningOffer(body: {
  name: string;
  description?: string;
  discountType: string;
  discountValue: number;
  isActive?: boolean;
  imageUrl?: string;
  campaignType?: string;
}) {
  const { data } = await brandAxios.put("/brand/offers/returning", body);
  return data;
}



// ─── COUPONS ─────────────────────────────────────────────────────────────────

export async function getCoupons(params?: {
  offerType?: string;
  status?: string;
  search?: string;
  skip?: number;
  take?: number;
}) {
  const { data } = await brandAxios.get("/brand/coupons", { params });
  return data;
}

export async function revokeCoupon(id: string) {
  const { data } = await brandAxios.put(`/brand/coupons/${id}/revoke`);
  return data;
}



// ─── DASHBOARD ───────────────────────────────────────────────────────────────

export async function getDashboardSummary() {
  const { data } = await brandAxios.get("/brand/dashboard/summary");
  return data;
}

export async function getDashboardOutlets() {
  const { data } = await brandAxios.get("/brand/dashboard/outlets");
  return data;
}

export async function getDashboardRedemptions(params?: { skip?: number; take?: number }) {
  const { data } = await brandAxios.get("/brand/dashboard/redemptions", { params });
  return data;
}

export async function getDashboardTimeline() {
  const { data } = await brandAxios.get("/brand/dashboard/timeline");
  return data;
}

// ─── UPLOADS ─────────────────────────────────────────────────────────────────

export async function getPresignedBrandUploadUrl(fileName: string, contentType: string) {
  const { data } = await brandAxios.post("/brand/presign-upload", { fileName, contentType });
  return data; // returns { uploadUrl, publicUrl, key }
}

export async function uploadBrandFile(file: File): Promise<string> {
  const { uploadUrl, publicUrl } = await getPresignedBrandUploadUrl(file.name, file.type);
  await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });
  return publicUrl;
}
