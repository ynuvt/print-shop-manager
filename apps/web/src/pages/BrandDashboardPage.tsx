import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MapPin, ExternalLink } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { getDashboardSummary, getDashboardTimeline, getDashboardOutlets, getDashboardRedemptions } from "../api/brandApi";
import toast from "react-hot-toast";

interface SummaryCategory {
  total: number;
  active: number;
  redeemed: number;
  expired: number;
}

interface Summary {
  total: number;
  active: number;
  redeemed: number;
  expired: number;
  firstTime: SummaryCategory;
  returning: SummaryCategory;
}

interface TimelinePoint { date: string; count: number; }
interface OutletStat { id: string; name: string; outletCode: string; mapLink: string | null; workerCount: number; totalRedemptions: number; firstTimeRedemptions: number; returningRedemptions: number; }
interface Redemption { id: string; redeemedAt: string; coupon: { code: string; offerType: string; discountType: string; discountValue: number }; outlet: { name: string }; worker: { name: string }; }

export default function BrandDashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [outlets, setOutlets] = useState<OutletStat[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);

  const [brandProfile, setBrandProfile] = useState<any>(null);
  const [profileName, setProfileName] = useState("");
  const [profileLogo, setProfileLogo] = useState("");
  const [updatingProfile, setUpdatingProfile] = useState(false);

  const loadBrandProfileData = async () => {
    try {
      const { getBrandProfile } = await import("../api/brandApi");
      const profile = await getBrandProfile();
      setBrandProfile(profile);
      setProfileName(profile.name);
      setProfileLogo(profile.logo || "");
    } catch (err) {
      console.error("Failed to load profile", err);
    }
  };

  useEffect(() => {
    loadBrandProfileData();
  }, []);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingProfile(true);
    try {
      const { updateBrandProfile } = await import("../api/brandApi");
      const updated = await updateBrandProfile({ name: profileName, logo: profileLogo });
      setBrandProfile(updated);
      toast.success("Profile updated successfully! Refresh page to see new logo.");
    } catch {
      toast.error("Failed to update profile.");
    } finally {
      setUpdatingProfile(false);
    }
  };

  useEffect(() => {
    Promise.all([
      getDashboardSummary(),
      getDashboardTimeline(),
      getDashboardOutlets(),
      getDashboardRedemptions({ take: 10 }),
    ]).then(([s, t, o, r]) => {
      setSummary(s as any);
      setTimeline(t.timeline);
      setOutlets(o.outlets);
      setRedemptions(r.redemptions);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="brand-gap-8" style={{ animation: "pulse 2s ease-in-out infinite" }}>
        <div>
          <div className="brand-skeleton" style={{ height: 28, width: 160 }} />
          <div className="brand-skeleton" style={{ height: 16, width: 240, marginTop: 8 }} />
        </div>
        <div className="brand-skeleton" style={{ height: 180, borderRadius: 8 }} />
        <div className="brand-skeleton" style={{ height: 320, borderRadius: 8 }} />
      </div>
    );
  }

  return (
    <div className="brand-gap-8">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 className="brand-page-title">Dashboard</h1>
          <p className="brand-page-subtitle">Overview of your coupon performance</p>
        </div>
        
        {/* Brand Icon settings widget */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="brand-card"
          style={{ padding: 16, display: "flex", alignItems: "center", gap: 16, maxWidth: "420px", flex: "1 1 300px" }}
        >
          {brandProfile && (
            <form onSubmit={handleUpdateProfile} style={{ display: "flex", alignItems: "center", gap: 16, width: "100%" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="brand-input"
                  style={{ padding: "6px 10px", fontSize: "13px" }}
                  placeholder="Brand Name"
                  required
                />
                <input
                  type="text"
                  value={profileLogo}
                  onChange={(e) => setProfileLogo(e.target.value)}
                  className="brand-input"
                  style={{ padding: "6px 10px", fontSize: "11px", fontFamily: "monospace" }}
                  placeholder="Brand Icon URL"
                />
              </div>
              <button
                type="submit"
                disabled={updatingProfile}
                className="brand-btn-primary"
                style={{ padding: "8px 12px", fontSize: "12px", height: "fit-content" }}
              >
                {updatingProfile ? "..." : "Save Profile"}
              </button>
            </form>
          )}
        </motion.div>
      </div>

      {/* Coupon Performance Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="brand-card-flat"
      >
        <div style={{ padding: "20px 20px 12px" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#fafafa" }}>Coupon Performance</h2>
          <p style={{ fontSize: 12, color: "#71717a", marginTop: 4 }}>Compare Distributed, Active, Redeemed, and Expired coupons by customer type</p>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="brand-table">
            <thead>
              <tr>
                <th>Category</th>
                <th className="center">Distributed</th>
                <th className="center">Active</th>
                <th className="center">Redeemed</th>
                <th className="center">Expired</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 600, color: "#fafafa" }}>First-time Coupons</td>
                <td className="center" style={{ color: "#e4e4e7" }}>{summary?.firstTime?.total ?? 0}</td>
                <td className="center" style={{ color: "#e4e4e7" }}>{summary?.firstTime?.active ?? 0}</td>
                <td className="center" style={{ color: "#e4e4e7" }}>{summary?.firstTime?.redeemed ?? 0}</td>
                <td className="center" style={{ color: "#71717a" }}>{summary?.firstTime?.expired ?? 0}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600, color: "#fafafa" }}>Returning Coupons</td>
                <td className="center" style={{ color: "#e4e4e7" }}>{summary?.returning?.total ?? 0}</td>
                <td className="center" style={{ color: "#e4e4e7" }}>{summary?.returning?.active ?? 0}</td>
                <td className="center" style={{ color: "#e4e4e7" }}>{summary?.returning?.redeemed ?? 0}</td>
                <td className="center" style={{ color: "#71717a" }}>{summary?.returning?.expired ?? 0}</td>
              </tr>
              <tr style={{ borderTop: "2px solid rgba(63, 63, 70, 0.4)", background: "rgba(39, 39, 42, 0.2)" }}>
                <td style={{ fontWeight: 700, color: "#fafafa" }}>Total</td>
                <td className="center" style={{ fontWeight: 700, color: "#fafafa" }}>{summary?.total ?? 0}</td>
                <td className="center" style={{ fontWeight: 700, color: "#fafafa" }}>{summary?.active ?? 0}</td>
                <td className="center" style={{ fontWeight: 700, color: "#fafafa" }}>{summary?.redeemed ?? 0}</td>
                <td className="center" style={{ fontWeight: 700, color: "#a1a1aa" }}>{summary?.expired ?? 0}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Timeline Chart */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.48 } }} className="brand-card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 16 }}>Redemption Timeline</h2>
        <div className="brand-chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeline}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(v) => new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} />
              <YAxis tick={{ fill: "#71717a", fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 12, color: "#f5f5f5" }} />
              <Area type="monotone" dataKey="count" stroke="#f59e0b" strokeWidth={2} fill="url(#areaGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Outlets Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.56 } }} className="brand-card-flat">
        <div style={{ padding: "24px 24px 16px" }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7" }}>Outlet Performance</h2>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="brand-table">
            <thead>
              <tr>
                <th>Outlet</th>
                <th className="center">Workers</th>
                <th className="center">Redeemed</th>
                <th className="center">First-time</th>
                <th className="center">Returning</th>
                <th className="center">Map</th>
              </tr>
            </thead>
            <tbody>
              {outlets.map((o) => (
                <tr key={o.id}>
                  <td>
                    <p className="brand-table-name">{o.name}</p>
                    <p className="brand-table-code">{o.outletCode}</p>
                  </td>
                  <td className="center" style={{ color: "#a1a1aa" }}>{o.workerCount}</td>
                  <td className="center" style={{ color: "#e4e4e7", fontWeight: 500 }}>{o.totalRedemptions}</td>
                  <td className="center" style={{ color: "#fafafa" }}>{o.firstTimeRedemptions}</td>
                  <td className="center" style={{ color: "#fafafa" }}>{o.returningRedemptions}</td>
                  <td className="center">
                    {o.mapLink ? (
                      <a href={o.mapLink} target="_blank" rel="noopener noreferrer" className="brand-map-link">
                        <MapPin size={14} /><ExternalLink size={12} />
                      </a>
                    ) : <span style={{ color: "#52525b" }}>—</span>}
                  </td>
                </tr>
              ))}
              {outlets.length === 0 && <tr><td colSpan={6} className="brand-table-empty">No outlets yet</td></tr>}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Recent Redemptions */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.64 } }} className="brand-card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 16 }}>Recent Redemptions</h2>
        <div className="brand-gap-3">
          {redemptions.map((r) => (
            <div key={r.id} className="brand-redemption-item">
              <div className="brand-redemption-left">
                <span className={`brand-type-badge ${r.coupon.offerType === "FIRST_TIME" ? "first-time" : "returning"}`}>
                  {r.coupon.offerType === "FIRST_TIME" ? "NEW" : "RETURN"}
                </span>
                <div>
                  <span className="brand-code">{r.coupon.code}</span>
                  <p className="brand-meta">{r.outlet.name} · {r.worker.name}</p>
                </div>
              </div>
              <span className="brand-time">{new Date(r.redeemedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          ))}
          {redemptions.length === 0 && <p style={{ color: "#52525b", fontSize: 14, textAlign: "center", padding: "16px 0" }}>No redemptions yet</p>}
        </div>
      </motion.div>
    </div>
  );
}
