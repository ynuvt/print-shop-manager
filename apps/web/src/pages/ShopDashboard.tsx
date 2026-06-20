import { useEffect, useState, useCallback } from "react";
import type { ThemeMode } from "../App";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ??
  (window.location.origin.includes("localhost")
    ? "http://localhost:4000"
    : window.location.origin)
).replace(/\/$/, "") + "/api/v1";

const TOKEN_KEY = "zopy_shop_token";

interface ShopInfo {
  shopId: string;
  name: string;
  username: string;
  landmark?: string;
  imageUrl?: string;
  priceBW: number;
  priceColor: number;
  platformChargeEnabled: boolean;
}

interface DashboardStats {
  completedJobsCount: number;
  totalRevenue: number;
  totalPages: number;
  peakHours: number[];
}

interface ChargeTier {
  minAmount: number;
  charge: number;
  label: string;
}

interface PlatformCharge {
  enabled: boolean;
  unpaidAmount: number;
  tiers: ChargeTier[];
  lastPayment: {
    id: string;
    amount: number;
    note: string | null;
    createdAt: string;
  } | null;
}

interface RecentJob {
  id: string;
  totalCost: number;
  totalPages: number;
  colorMode: string;
  createdAt: string;
  verificationCode: number | null;
  source: string;
  platformCharge: number;
}

interface DashboardData {
  shop: ShopInfo;
  stats: DashboardStats;
  platformCharge: PlatformCharge;
  recentJobs: RecentJob[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

type FilterRange = "all" | "today" | "thisMonth" | "lastMonth" | "custom";

function getDateParams(range: FilterRange, customStart: string, customEnd: string): { startDate?: string; endDate?: string } {
  const IST_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(Date.now() + IST_MS);
  const dd = (d: Date) => d.toISOString().slice(0, 10);
  switch (range) {
    case "today": { const t = dd(ist); return { startDate: t, endDate: t }; }
    case "thisMonth": {
      const yr = ist.getUTCFullYear();
      const mo = String(ist.getUTCMonth() + 1).padStart(2, "0");
      return { startDate: `${yr}-${mo}-01`, endDate: dd(ist) };
    }
    case "lastMonth": {
      const last  = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 0));
      const first = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1));
      return { startDate: dd(first), endDate: dd(last) };
    }
    case "custom":
      return customStart && customEnd ? { startDate: customStart, endDate: customEnd } : {};
    default:
      return {};
  }
}

function getFilterLabel(range: FilterRange, customStart: string, customEnd: string): string {
  if (range === "today") return "Today";
  if (range === "thisMonth") return "This month";
  if (range === "lastMonth") return "Last month";
  if (range === "custom" && customStart && customEnd) return `${customStart} – ${customEnd}`;
  return "All time";
}

export default function ShopDashboard({
  theme,
  onToggleTheme,
}: {
  theme: ThemeMode;
  onToggleTheme: () => void;
}) {
  const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_KEY));
  const [shopId, setShopId] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [activeTab, setActiveTab] = useState<"overview" | "jobs" | "billing">("overview");

  // Jobs tab — paginated with search + date
  const [jobsData, setJobsData] = useState<{ jobs: RecentJob[]; total: number; totalPages: number } | null>(null);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState("");
  const [jobsPage, setJobsPage] = useState(1);
  const [jobsSearch, setJobsSearch] = useState("");
  const [jobsDate, setJobsDate] = useState("");
  const [jobsSearchInput, setJobsSearchInput] = useState("");
  const [confirmLogout, setConfirmLogout] = useState(false);

  const [filterRange, setFilterRange] = useState<FilterRange>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setShopId(null);
    setData(null);
  }, []);

  const fetchDashboard = useCallback(
    async (tok: string, sid: string, dateParams?: { startDate?: string; endDate?: string }) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (dateParams?.startDate) params.set("startDate", dateParams.startDate);
        if (dateParams?.endDate) params.set("endDate", dateParams.endDate);
        const qs = params.toString() ? `?${params}` : "";
        const res = await fetch(`${API_BASE}/analysis/shops/${sid}/dashboard${qs}`, {
          headers: { Authorization: `Bearer ${tok}` },
        });
        if (res.status === 401) { logout(); return; }
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error((d as any).error || "Failed to load dashboard.");
        }
        setData(await res.json() as DashboardData);
      } catch (err: any) {
        setError(err.message || "Something went wrong.");
      } finally {
        setLoading(false);
      }
    },
    [logout]
  );

  const fetchJobs = useCallback(
    async (tok: string, sid: string, page: number, search: string, date: string) => {
      setJobsLoading(true);
      setJobsError("");
      try {
        const params = new URLSearchParams({ page: String(page), limit: "20" });
        if (search) params.set("search", search);
        if (date)   params.set("date", date);
        const res = await fetch(`${API_BASE}/analysis/shops/${sid}/jobs?${params}`, {
          headers: { Authorization: `Bearer ${tok}` },
        });
        if (res.status === 401) { logout(); return; }
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error((d as any).error || "Failed to load jobs.");
        }
        const data = await res.json();
        setJobsData({ jobs: data.jobs, total: data.total, totalPages: data.totalPages });
      } catch (err: any) {
        setJobsError(err.message || "Something went wrong.");
      } finally {
        setJobsLoading(false);
      }
    },
    [logout]
  );

  const applyFilter = useCallback(
    (range: FilterRange) => {
      setFilterRange(range);
      setSelectedHour(null);
      if (!token || !shopId) return;
      if (range === "custom") return;
      fetchDashboard(token, shopId, getDateParams(range, customStart, customEnd));
    },
    [token, shopId, customStart, customEnd, fetchDashboard],
  );

  const applyCustomFilter = useCallback(() => {
    if (!token || !shopId || !customStart || !customEnd) return;
    setSelectedHour(null);
    fetchDashboard(token, shopId, getDateParams("custom", customStart, customEnd));
  }, [token, shopId, customStart, customEnd, fetchDashboard]);

  useEffect(() => {
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]!));
      const sid: string | undefined = payload.shopId;
      if (!sid) { logout(); return; }
      setShopId(sid);
      fetchDashboard(token, sid);
    } catch {
      logout();
    }
  }, [token, logout, fetchDashboard]);

  // Fetch jobs when the jobs tab is active or filters change
  useEffect(() => {
    if (activeTab === "jobs" && token && shopId) {
      fetchJobs(token, shopId, jobsPage, jobsSearch, jobsDate);
    }
  }, [activeTab, token, shopId, jobsPage, jobsSearch, jobsDate, fetchJobs]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    try {
      const res = await fetch(`${API_BASE}/auth/shop-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim().toLowerCase(), password }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error((d as any).error || "Invalid credentials.");
      localStorage.setItem(TOKEN_KEY, d.token);
      setToken(d.token);
    } catch (err: any) {
      setLoginError(err.message || "Login failed.");
    } finally {
      setLoginLoading(false);
    }
  };

  const isDark = theme === "dark";
  const bg = isDark ? "#09090b" : "#f4f4f7";
  const card = isDark ? "#111113" : "#ffffff";
  const border = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.09)";
  const textColor = isDark ? "#f4f4f5" : "#18181b";
  const muted = isDark ? "#71717a" : "#888";

  if (!token || !shopId) {
    return (
      <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
        <div style={{ width: "100%", maxWidth: "380px", background: card, border: `1px solid ${border}`, borderRadius: "24px", padding: "32px", boxShadow: "0 8px 40px rgba(0,0,0,0.3)" }}>
          <div style={{ textAlign: "center", marginBottom: "28px" }}>
            <div style={{ width: "48px", height: "48px", background: "var(--brand)", borderRadius: "14px", display: "grid", placeItems: "center", fontWeight: "950", fontSize: "20px", color: "#000", margin: "0 auto 16px" }}>Z</div>
            <h1 style={{ fontSize: "22px", fontWeight: "900", margin: "0 0 6px", color: textColor }}>Shop Portal</h1>
            <p style={{ fontSize: "13px", color: muted, margin: 0 }}>Sign in with your shop credentials</p>
          </div>

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: muted, marginBottom: "6px" }}>Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your shop username"
                style={{ width: "100%", background: isDark ? "#0a0a0b" : "#f7f7f8", border: `1px solid ${border}`, borderRadius: "12px", padding: "12px 14px", fontSize: "14px", color: textColor, outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: muted, marginBottom: "6px" }}>Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ width: "100%", background: isDark ? "#0a0a0b" : "#f7f7f8", border: `1px solid ${border}`, borderRadius: "12px", padding: "12px 14px", fontSize: "14px", color: textColor, outline: "none", boxSizing: "border-box" }}
              />
            </div>
            {loginError && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "10px 12px", fontSize: "12px", color: "#ef4444" }}>
                {loginError}
              </div>
            )}
            <button
              type="submit"
              disabled={loginLoading}
              style={{ background: "var(--brand)", color: "#000", border: "none", borderRadius: "12px", padding: "13px", fontSize: "14px", fontWeight: "800", cursor: loginLoading ? "not-allowed" : "pointer", opacity: loginLoading ? 0.6 : 1, marginTop: "4px" }}
            >
              {loginLoading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <button onClick={onToggleTheme} style={{ display: "block", margin: "20px auto 0", background: "none", border: "none", cursor: "pointer", fontSize: "18px", opacity: 0.4 }}>
            {isDark ? "🌙" : "☀️"}
          </button>
        </div>
      </div>
    );
  }

  const shop = data?.shop;
  const stats = data?.stats;
  const charge = data?.platformCharge;
  const jobs = data?.recentJobs ?? [];

  const peakHour = stats
    ? stats.peakHours.indexOf(Math.max(...stats.peakHours))
    : null;

  const formatHour = (h: number) =>
    h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;

  const tabStyle = (tab: typeof activeTab): React.CSSProperties => ({
    padding: "8px 0",
    fontSize: "13px",
    fontWeight: "700",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: activeTab === tab ? "var(--brand)" : muted,
    borderBottom: `2px solid ${activeTab === tab ? "var(--brand)" : "transparent"}`,
    transition: "all 0.15s",
  });

  const statCard = (label: string, value: string | number, sub?: string, accent?: string) => (
    <div style={{ background: card, border: `1px solid ${border}`, borderRadius: "20px", padding: "20px 22px" }}>
      <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: muted, marginBottom: "6px" }}>{label}</div>
      <div style={{ fontSize: "28px", fontWeight: "900", letterSpacing: "-0.02em", color: accent ?? textColor }}>{value}</div>
      {sub && <div style={{ fontSize: "11px", color: muted, marginTop: "4px" }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: bg, paddingBottom: "60px" }}>
      <nav style={{ position: "sticky", top: 0, zIndex: 100, background: isDark ? "rgba(9,9,11,0.9)" : "rgba(255,255,255,0.9)", backdropFilter: "blur(20px)", borderBottom: `1px solid ${border}`, padding: "0 20px" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", height: "56px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "34px", height: "34px", background: "var(--brand)", borderRadius: "10px", display: "grid", placeItems: "center", fontWeight: "950", fontSize: "16px", color: "#000" }}>Z</div>
            <div>
              <div style={{ fontWeight: "900", fontSize: "15px", color: textColor }}>{shop?.name || shop?.username || "Shop"}</div>
              <div style={{ fontSize: "10px", color: muted, fontWeight: "700" }}>ZOPY PORTAL · {shopId}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button onClick={onToggleTheme} style={{ background: "none", border: `1px solid ${border}`, borderRadius: "10px", width: "36px", height: "36px", cursor: "pointer", fontSize: "16px" }}>
              {isDark ? "🌙" : "☀️"}
            </button>
            <button onClick={() => setConfirmLogout(true)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: "10px", padding: "6px 14px", fontSize: "12px", fontWeight: "700", color: muted, cursor: "pointer" }}>
              Logout
            </button>
          </div>
        </div>
      </nav>

      {confirmLogout && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "var(--panel)", border: `1px solid ${border}`, borderRadius: "16px", padding: "28px 24px", maxWidth: "320px", width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: "22px", marginBottom: "10px" }}>🚪</div>
            <div style={{ fontWeight: "800", fontSize: "16px", color: textColor, marginBottom: "8px" }}>Log out?</div>
            <div style={{ fontSize: "13px", color: muted, marginBottom: "24px" }}>You'll need to log in again to access the shop portal.</div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setConfirmLogout(false)} style={{ flex: 1, background: "none", border: `1px solid ${border}`, borderRadius: "10px", padding: "10px", fontSize: "14px", fontWeight: "700", color: muted, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={() => { setConfirmLogout(false); logout(); }} style={{ flex: 1, background: "#ef4444", border: "none", borderRadius: "10px", padding: "10px", fontSize: "14px", fontWeight: "700", color: "#fff", cursor: "pointer" }}>
                Log out
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "28px 20px" }}>
        <div style={{ display: "flex", gap: "24px", borderBottom: `1px solid ${border}`, marginBottom: "28px" }}>
          <button style={tabStyle("overview")} onClick={() => setActiveTab("overview")}>Overview</button>
          <button style={tabStyle("jobs")} onClick={() => setActiveTab("jobs")}>Recent Jobs</button>
          {charge?.enabled && (
            <button style={tabStyle("billing")} onClick={() => setActiveTab("billing")}>Billing</button>
          )}
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: "60px 0", color: muted, fontSize: "14px" }}>Loading...</div>
        )}
        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "16px", padding: "16px 20px", fontSize: "13px", color: "#ef4444", marginBottom: "24px" }}>
            {error}
          </div>
        )}

        {!loading && data && activeTab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

            {/* Date range filter */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {(["all", "today", "thisMonth", "lastMonth", "custom"] as FilterRange[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => applyFilter(r)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "99px",
                      border: `1px solid ${filterRange === r ? "var(--brand)" : border}`,
                      background: filterRange === r ? (isDark ? "rgba(234,179,8,0.14)" : "rgba(234,179,8,0.12)") : "transparent",
                      color: filterRange === r ? "var(--brand)" : muted,
                      fontSize: "12px",
                      fontWeight: "700",
                      cursor: "pointer",
                      transition: "all 0.15s",
                      flexShrink: 0,
                    }}
                  >
                    {r === "all" ? "All time" : r === "today" ? "Today" : r === "thisMonth" ? "This month" : r === "lastMonth" ? "Last month" : "Custom"}
                  </button>
                ))}
              </div>
              {filterRange === "custom" && (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    style={{ flex: "1 1 130px", minWidth: 0, background: card, border: `1px solid ${border}`, borderRadius: "10px", padding: "8px 12px", fontSize: "13px", color: customStart ? textColor : muted, outline: "none" }}
                  />
                  <span style={{ color: muted }}>–</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    style={{ flex: "1 1 130px", minWidth: 0, background: card, border: `1px solid ${border}`, borderRadius: "10px", padding: "8px 12px", fontSize: "13px", color: customEnd ? textColor : muted, outline: "none" }}
                  />
                  <button
                    onClick={applyCustomFilter}
                    disabled={!customStart || !customEnd}
                    style={{ padding: "8px 16px", background: "var(--brand)", border: "none", borderRadius: "10px", fontSize: "13px", fontWeight: "700", color: "#000", cursor: !customStart || !customEnd ? "not-allowed" : "pointer", opacity: !customStart || !customEnd ? 0.5 : 1, flexShrink: 0 }}
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>

            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "14px" }}>
              {statCard("Completed Jobs", stats!.completedJobsCount, getFilterLabel(filterRange, customStart, customEnd))}
              {statCard("Total Revenue", `₹${stats!.totalRevenue.toFixed(0)}`, getFilterLabel(filterRange, customStart, customEnd), "var(--brand)")}
              {statCard("Pages Printed", stats!.totalPages.toLocaleString(), getFilterLabel(filterRange, customStart, customEnd))}
            </div>

            {charge?.enabled && (charge.unpaidAmount ?? 0) > 0 && (
              <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: "20px", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "#a78bfa" }}>Zopy Platform Fee Due</div>
                  <div style={{ fontSize: "13px", color: muted, marginTop: "4px" }}>Amount owed to Zopy · tap Billing tab for details</div>
                </div>
                <div style={{ fontSize: "32px", fontWeight: "900", color: "#a78bfa" }}>₹{charge.unpaidAmount}</div>
              </div>
            )}

            <div style={{ background: card, border: `1px solid ${border}`, borderRadius: "20px", padding: "20px 22px" }}>
              <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: muted, marginBottom: "14px" }}>Shop Details</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px 20px" }}>
                {([
                  ["Shop ID", shopId],
                  ["B&W Price", `₹${shop?.priceBW ?? 2}/page`],
                  ["Color Price", `₹${shop?.priceColor ?? 7}/page`],
                  ...(shop?.landmark ? [["Landmark", shop.landmark]] : []),
                ] as [string, string][]).map(([label, val]) => (
                  <div key={label}>
                    <div style={{ fontSize: "11px", color: muted, marginBottom: "2px" }}>{label}</div>
                    <div style={{ fontSize: "14px", fontWeight: "700", color: textColor }}>{val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Peak Hours — interactive chart */}
            {stats && (() => {
              const totalInPeriod = stats.peakHours.reduce((a, b) => a + b, 0);
              const maxVal = Math.max(...stats.peakHours, 1);
              const top4 = [...stats.peakHours.map((c, h) => ({ c, h }))]
                .sort((a, b) => b.c - a.c)
                .slice(0, 4)
                .filter((x) => x.c > 0);

              return (
                <div style={{ background: card, border: `1px solid ${border}`, borderRadius: "20px", padding: "20px 22px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: muted }}>
                      Peak Hours (IST)
                    </div>
                    {selectedHour !== null && (
                      <button onClick={() => setSelectedHour(null)} style={{ background: "none", border: "none", cursor: "pointer", color: muted, fontSize: "11px", fontWeight: "700", padding: "2px 6px" }}>
                        Clear ×
                      </button>
                    )}
                  </div>

                  {/* Dynamic info line */}
                  <div style={{ fontSize: "15px", fontWeight: "800", color: textColor, margin: "10px 0 18px", minHeight: "22px" }}>
                    {selectedHour !== null ? (
                      <>
                        <span style={{ color: "var(--brand)" }}>{formatHour(selectedHour)}</span>
                        <span style={{ color: muted, fontWeight: "400" }}> · </span>
                        <span style={{ color: "var(--brand)" }}>{stats.peakHours[selectedHour]} jobs</span>
                        <span style={{ fontSize: "11px", color: muted, fontWeight: "500", marginLeft: "8px" }}>selected</span>
                      </>
                    ) : totalInPeriod === 0 ? (
                      <span style={{ fontSize: "13px", color: muted, fontWeight: "500" }}>No jobs in this period</span>
                    ) : peakHour !== null ? (
                      <>
                        {"Busiest at "}
                        <span style={{ color: "var(--brand)" }}>{formatHour(peakHour)}</span>
                        <span style={{ color: muted, fontWeight: "400" }}> · </span>
                        <span style={{ color: "var(--brand)" }}>{stats.peakHours[peakHour]} jobs</span>
                      </>
                    ) : (
                      <span style={{ fontSize: "13px", color: muted, fontWeight: "500" }}>Tap a bar for details</span>
                    )}
                  </div>

                  {/* Bar chart */}
                  <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "80px", position: "relative" }}>
                    {stats.peakHours.map((count, h) => {
                      const pct = count > 0 ? Math.max(6, (count / maxVal) * 100) : 3;
                      const isSelected = h === selectedHour;
                      const isPeak = h === peakHour && selectedHour === null && count > 0;
                      return (
                        <div
                          key={h}
                          onClick={() => count > 0 && setSelectedHour(isSelected ? null : h)}
                          title={`${formatHour(h)}: ${count} jobs`}
                          style={{
                            flex: 1,
                            height: `${pct}%`,
                            background: isSelected ? "#ffffff" : isPeak ? "var(--brand)" : isDark ? "#27272a" : "#e4e4e7",
                            borderRadius: "3px 3px 0 0",
                            transition: "height 0.3s ease, background 0.15s",
                            cursor: count > 0 ? "pointer" : "default",
                            position: "relative",
                          }}
                        >
                          {(isSelected || isPeak) && count > 0 && (
                            <div style={{
                              position: "absolute",
                              bottom: "calc(100% + 3px)",
                              left: "50%",
                              transform: "translateX(-50%)",
                              background: isSelected ? "#fff" : "var(--brand)",
                              color: "#000",
                              fontSize: "9px",
                              fontWeight: "800",
                              padding: "2px 5px",
                              borderRadius: "4px",
                              whiteSpace: "nowrap",
                              pointerEvents: "none",
                              zIndex: 1,
                            }}>
                              {count}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Time axis */}
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "9px", color: muted }}>
                    <span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>11 PM</span>
                  </div>

                  {/* Top busy hours as tappable chips — the main way to see numbers on mobile */}
                  {top4.length > 0 && (
                    <div style={{ marginTop: "16px", display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontSize: "10px", color: muted, fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>Top hours:</span>
                      {top4.map((item, i) => (
                        <button
                          key={item.h}
                          onClick={() => setSelectedHour(item.h === selectedHour ? null : item.h)}
                          style={{
                            padding: "5px 11px",
                            borderRadius: "99px",
                            border: `1px solid ${item.h === selectedHour ? "var(--brand)" : border}`,
                            background: item.h === selectedHour ? (isDark ? "rgba(234,179,8,0.14)" : "rgba(234,179,8,0.12)") : "transparent",
                            color: item.h === selectedHour ? "var(--brand)" : muted,
                            fontSize: "11px",
                            fontWeight: "700",
                            cursor: "pointer",
                            transition: "all 0.15s",
                          }}
                        >
                          #{i + 1} {formatHour(item.h)} · {item.c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {activeTab === "jobs" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Search + date filters */}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", flex: "1 1 160px", minWidth: 0, background: card, border: `1px solid ${border}`, borderRadius: "12px", overflow: "hidden", alignItems: "center", padding: "0 12px", gap: "8px" }}>
                <input
                  type="text"
                  placeholder="Search by code…"
                  value={jobsSearchInput}
                  onChange={(e) => setJobsSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setJobsSearch(jobsSearchInput.trim());
                      setJobsPage(1);
                    }
                  }}
                  style={{ flex: 1, minWidth: 0, background: "none", border: "none", outline: "none", fontSize: "13px", color: textColor, padding: "10px 0" }}
                />
                {jobsSearchInput && (
                  <button onClick={() => { setJobsSearchInput(""); setJobsSearch(""); setJobsPage(1); }} style={{ background: "none", border: "none", cursor: "pointer", color: muted, fontSize: "16px", padding: 0, flexShrink: 0 }}>×</button>
                )}
              </div>
              <input
                type="date"
                value={jobsDate}
                onChange={(e) => { setJobsDate(e.target.value); setJobsPage(1); }}
                style={{ flex: "1 1 120px", minWidth: 0, background: card, border: `1px solid ${border}`, borderRadius: "12px", padding: "10px 12px", fontSize: "13px", color: jobsDate ? textColor : muted, outline: "none" }}
              />
              {(jobsDate || jobsSearch) && (
                <button onClick={() => { setJobsDate(""); setJobsSearch(""); setJobsSearchInput(""); setJobsPage(1); }} style={{ background: "none", border: `1px solid ${border}`, borderRadius: "12px", padding: "10px 14px", fontSize: "12px", fontWeight: "700", color: muted, cursor: "pointer", flexShrink: 0 }}>
                  Clear
                </button>
              )}
            </div>

            {/* Job cards — mobile-first */}
            {jobsLoading ? (
              <div style={{ textAlign: "center", padding: "48px 20px", color: muted, fontSize: "14px" }}>Loading…</div>
            ) : jobsError ? (
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "16px", padding: "16px 20px", fontSize: "13px", color: "#ef4444" }}>{jobsError}</div>
            ) : !jobsData || jobsData.jobs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 20px", color: muted, fontSize: "14px", background: card, borderRadius: "20px", border: `1px solid ${border}` }}>No jobs found.</div>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {jobsData.jobs.map((job) => (
                    <div
                      key={job.id}
                      style={{ background: card, border: `1px solid ${border}`, borderRadius: "16px", padding: "14px 16px" }}
                    >
                      {/* Top row: code + source badge + date */}
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                        <span style={{ fontFamily: "monospace", fontWeight: "900", fontSize: "18px", color: textColor, letterSpacing: "-0.02em" }}>
                          {job.verificationCode ?? "—"}
                        </span>
                        <span style={{ fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "99px", background: job.source === "WHATSAPP" ? "rgba(34,197,94,0.12)" : "rgba(59,130,246,0.12)", color: job.source === "WHATSAPP" ? "#22c55e" : "#3b82f6", flexShrink: 0 }}>
                          {job.source === "WHATSAPP" ? "WA" : "WEB"}
                        </span>
                        <span style={{ fontSize: "12px", color: muted, marginLeft: "auto", whiteSpace: "nowrap" }}>
                          {formatShortDate(job.createdAt)}
                        </span>
                      </div>

                      {/* Bottom row: pages + amount + fee */}
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ fontSize: "12px", color: muted }}>
                          {job.totalPages} page{job.totalPages !== 1 ? "s" : ""}
                        </span>
                        <span style={{ fontSize: "12px", color: muted }}>·</span>
                        <span style={{ fontSize: "12px", color: muted, textTransform: "capitalize" }}>
                          {job.colorMode?.toLowerCase() ?? "b&w"}
                        </span>
                        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ fontSize: "15px", fontWeight: "800", color: "var(--brand)" }}>₹{job.totalCost}</span>
                          {charge?.enabled && (
                            <span style={{ fontSize: "12px", fontWeight: "700", color: job.platformCharge > 0 ? "#a78bfa" : muted }}>
                              {job.platformCharge > 0 ? `+₹${job.platformCharge} fee` : "no fee"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                  <span style={{ fontSize: "12px", color: muted }}>
                    {((jobsPage - 1) * 20) + 1}–{Math.min(jobsPage * 20, jobsData.total)} of {jobsData.total} jobs
                  </span>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      disabled={jobsPage <= 1}
                      onClick={() => setJobsPage((p) => p - 1)}
                      style={{ padding: "8px 14px", borderRadius: "10px", border: `1px solid ${border}`, background: card, color: jobsPage <= 1 ? muted : textColor, cursor: jobsPage <= 1 ? "not-allowed" : "pointer", fontSize: "12px", fontWeight: "700" }}
                    >← Prev</button>
                    <button
                      disabled={jobsPage >= jobsData.totalPages}
                      onClick={() => setJobsPage((p) => p + 1)}
                      style={{ padding: "8px 14px", borderRadius: "10px", border: `1px solid ${border}`, background: card, color: jobsPage >= jobsData.totalPages ? muted : textColor, cursor: jobsPage >= jobsData.totalPages ? "not-allowed" : "pointer", fontSize: "12px", fontWeight: "700" }}
                    >Next →</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {!loading && data && activeTab === "billing" && charge?.enabled && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ background: card, border: "1px solid rgba(139,92,246,0.3)", borderRadius: "20px", padding: "24px" }}>
              <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "#a78bfa", marginBottom: "8px" }}>Total Platform Fees to Pay Zopy</div>
              <div style={{ fontSize: "40px", fontWeight: "900", letterSpacing: "-0.02em", color: "#a78bfa" }}>₹{charge.unpaidAmount}</div>
              <div style={{ fontSize: "12px", color: muted, marginTop: "6px" }}>
                Sum of ₹2/₹4 platform fees collected from customers since fees were enabled, minus payments already settled with Zopy.
              </div>
              {charge.tiers && charge.tiers.length > 0 && (
                <div style={{ marginTop: "16px", padding: "14px", background: isDark ? "#18181b" : "#f4f4f7", borderRadius: "12px", fontSize: "12px", color: muted }}>
                  <div style={{ fontWeight: "700", marginBottom: "6px", color: textColor }}>Charge breakdown:</div>
                  {charge.tiers.map((tier) => (
                    <div key={tier.minAmount}>
                      • {tier.label}: <strong style={{ color: tier.charge > 0 ? textColor : muted }}>
                        {tier.charge > 0 ? `₹${tier.charge} per job` : "₹0 (no charge)"}
                      </strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {charge.lastPayment ? (
              <div style={{ background: card, border: `1px solid ${border}`, borderRadius: "20px", padding: "24px" }}>
                <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: muted, marginBottom: "16px" }}>Last Payment Received</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                  <div>
                    <div style={{ fontSize: "28px", fontWeight: "900", color: "#22c55e" }}>₹{charge.lastPayment.amount}</div>
                    <div style={{ fontSize: "12px", color: muted, marginTop: "4px" }}>{formatDate(charge.lastPayment.createdAt)}</div>
                    {charge.lastPayment.note && (
                      <div style={{ fontSize: "12px", color: muted, marginTop: "2px" }}>Note: {charge.lastPayment.note}</div>
                    )}
                  </div>
                  <div style={{ padding: "8px 14px", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "99px", fontSize: "12px", fontWeight: "700", color: "#22c55e" }}>
                    Confirmed by Zopy
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ background: card, border: `1px solid ${border}`, borderRadius: "20px", padding: "24px", textAlign: "center", color: muted, fontSize: "13px" }}>
                No payments recorded yet.
              </div>
            )}

            {jobs.some((j) => j.platformCharge > 0) && (
              <div style={{ background: card, border: `1px solid ${border}`, borderRadius: "20px", overflow: "hidden" }}>
                <div style={{ padding: "20px 22px 0", fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: muted }}>Fee Breakdown by Job</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", marginTop: "12px" }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${border}` }}>
                        {["Code", "Date", "Job Amount", "Platform Fee"].map((h) => (
                          <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: muted }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.filter((j) => j.platformCharge > 0).map((job, i, arr) => (
                        <tr key={job.id} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${border}` : "none" }}>
                          <td style={{ padding: "11px 16px", fontFamily: "monospace", fontWeight: "700", color: textColor }}>{job.verificationCode ?? "—"}</td>
                          <td style={{ padding: "11px 16px", color: muted, whiteSpace: "nowrap" }}>{formatShortDate(job.createdAt)}</td>
                          <td style={{ padding: "11px 16px", fontWeight: "700", color: "var(--brand)" }}>₹{job.totalCost}</td>
                          <td style={{ padding: "11px 16px", fontWeight: "800", color: "#a78bfa" }}>₹{job.platformCharge}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
