import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Search, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { getCoupons, revokeCoupon } from "../api/brandApi";

interface CouponData {
  id: string; code: string; discountType: string; discountValue: number;
  offerType: string; status: string; createdAt: string; validUntil: string;
  user: { id: string; name: string | null } | null;
  nearestOutlet: { name: string; outletCode: string } | null;
  redemption: { redeemedAt: string; outlet: { name: string }; worker: { name: string } } | null;
}

export default function BrandCouponsPage() {
  const [coupons, setCoupons] = useState<CouponData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ offerType: "", status: "", search: "" });
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;

  const load = () => {
    setLoading(true);
    getCoupons({
      ...(filters.offerType && { offerType: filters.offerType }),
      ...(filters.status && { status: filters.status }),
      ...(filters.search && { search: filters.search }),
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
    }).then((d) => { setCoupons(d.coupons); setTotal(d.total); }).finally(() => setLoading(false));
  };
  useEffect(load, [filters, page]);

  const handleRevoke = async (id: string, code: string) => {
    if (!confirm(`Revoke coupon ${code}?`)) return;
    try { await revokeCoupon(id); toast.success("Coupon revoked"); load(); }
    catch { toast.error("Failed"); }
  };

  return (
    <div className="brand-gap-6">
      <div><h1 className="brand-page-title">Coupons</h1><p className="brand-page-subtitle">View and manage all distributed coupons</p></div>

      {/* Filters */}
      <div className="brand-coupons-filters">
        <div className="brand-search-wrap">
          <Search size={16} className="brand-search-icon" />
          <input value={filters.search} onChange={(e) => { setFilters({ ...filters, search: e.target.value }); setPage(0); }} placeholder="Search by code..." className="brand-search-input" />
        </div>
        <select value={filters.offerType} onChange={(e) => { setFilters({ ...filters, offerType: e.target.value }); setPage(0); }} className="brand-filter-select">
          <option value="">All Types</option>
          <option value="FIRST_TIME">First-time</option>
          <option value="RETURNING">Returning</option>
        </select>
        <select value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(0); }} className="brand-filter-select">
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="REDEEMED">Redeemed</option>
          <option value="EXPIRED">Expired</option>
          <option value="REVOKED">Revoked</option>
        </select>
      </div>

      {/* Table */}
      <div className="brand-card-flat">
        <div style={{ overflowX: "auto" }}>
          <table className="brand-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>User</th>
                <th className="center">Type</th>
                <th className="center">Discount</th>
                <th className="center">Status</th>
                <th>Outlet</th>
                <th>Created</th>
                <th className="center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c, i) => (
                <motion.tr key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: i * 0.03 } }}>
                  <td><span style={{ fontFamily: "monospace", color: "#e4e4e7", fontSize: 12 }}>{c.code}</span></td>
                  <td style={{ color: "#a1a1aa", fontSize: 12 }}>{c.user?.name || c.user?.id?.slice(0, 8) || "—"}</td>
                  <td className="center">
                    <span className={`brand-type-badge ${c.offerType === "FIRST_TIME" ? "first-time" : "returning"}`}>
                      {c.offerType === "FIRST_TIME" ? "NEW" : "RETURN"}
                    </span>
                  </td>
                  <td className="center" style={{ color: "#e4e4e7", fontWeight: 500, fontSize: 12 }}>{c.discountType === "PERCENTAGE" ? `${c.discountValue}%` : `₹${c.discountValue}`}</td>
                  <td className="center">
                    <span className={`brand-status-badge ${c.status.toLowerCase()}`}>{c.status}</span>
                    {c.status === "REDEEMED" && c.redemption && (
                      <div style={{ fontSize: "10px", color: "#a1a1aa", marginTop: "4px" }}>
                        by {c.redemption.worker.name}
                      </div>
                    )}
                  </td>
                  <td style={{ color: "#e4e4e7", fontSize: 12 }}>
                    {c.status === "REDEEMED" && c.redemption ? (
                      <div>
                        <span style={{ color: "#22c55e", fontWeight: 500 }}>{c.redemption.outlet.name}</span>
                        <div style={{ fontSize: "10px", color: "#71717a" }}>Redeemed</div>
                      </div>
                    ) : (
                      c.nearestOutlet?.name || "—"
                    )}
                  </td>
                  <td style={{ color: "#71717a", fontSize: 12 }}>
                    <div>{new Date(c.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
                    {c.status === "REDEEMED" && c.redemption && (
                      <div style={{ fontSize: "10px", color: "#a1a1aa", marginTop: "2px" }}>
                        Claimed: {new Date(c.redemption.redeemedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    )}
                  </td>
                  <td className="center">
                    {c.status === "ACTIVE" && (
                      <button onClick={() => handleRevoke(c.id, c.code)} className="brand-btn-icon danger" title="Revoke">
                        <XCircle size={16} />
                      </button>
                    )}
                  </td>
                </motion.tr>
              ))}
              {coupons.length === 0 && !loading && (
                <tr><td colSpan={8} className="brand-table-empty">No coupons found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {total > PAGE_SIZE && (
          <div className="brand-pagination">
            <span className="brand-pagination-info">Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
            <div className="brand-pagination-btns">
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="brand-pagination-btn">Prev</button>
              <button onClick={() => setPage(page + 1)} disabled={(page + 1) * PAGE_SIZE >= total} className="brand-pagination-btn">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
