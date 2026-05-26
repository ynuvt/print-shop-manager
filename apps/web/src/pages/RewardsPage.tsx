import Navbar from "../components/Navbar";
import type { ThemeMode } from "../App";
import { Link } from "react-router-dom";
import { Star, ArrowRight, MapPin, Ticket, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { storage } from "../api/api";
import axios from "axios";
import { QRCodeSVG } from "qrcode.react";

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "https://zopy.devlocstudio.in";
const BASE_URL = `${API_ORIGIN}/api/v1`;

interface CouponData {
  id: string;
  code: string;
  brand: { id: string; name: string; slug: string; logo: string | null };
  discountType: string;
  discountValue: number;
  description: string | null;
  offerType: string;
  status: string;
  validUntil: string;
  createdAt: string;
  nearestOutlet: { id: string; name: string; address: string | null; mapLink: string | null } | null;
  redeemedAt: string | null;
  qrData: string | null;
}

async function fetchMyCoupons(): Promise<CouponData[]> {
  const token = storage.get("token");
  if (!token) return [];
  try {
    const res = await axios.get(`${BASE_URL}/coupons/my-coupons`, {
      headers: { authorization: `Bearer ${token}` },
    });
    return res.data?.coupons ?? [];
  } catch {
    return [];
  }
}

function CouponCard({ coupon }: { coupon: CouponData }) {
  const [revealed, setRevealed] = useState(false);
  const isActive = coupon.status === "ACTIVE";
  const discountLabel = coupon.discountType === "PERCENTAGE"
    ? `${coupon.discountValue}% OFF`
    : `₹${coupon.discountValue} OFF`;

  return (
    <div
      className="reward-card-premium"
      onClick={() => isActive && setRevealed(!revealed)}
      style={{
        position: "relative", borderRadius: "24px", overflow: "hidden",
        cursor: isActive ? "pointer" : "default",
        background: "#111", boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
        transition: "transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        opacity: isActive ? 1 : 0.6,
      }}
    >
      {/* ── FRONT FACE ── */}
      {!revealed && (
        <div style={{ position: "relative", minHeight: "200px" }}>
          {/* Gradient bg */}
          <div style={{
            position: "absolute", inset: 0,
            background: `linear-gradient(135deg, rgba(250,204,21,0.15) 0%, rgba(0,0,0,0.95) 60%)`,
          }} />

          <div style={{
            position: "relative", zIndex: 1, minHeight: "200px", padding: "20px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap",
          }}>
            {/* Left: brand info */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: "1 1 200px", minWidth: 0 }}>
              <div style={{
                width: "64px", height: "64px", flexShrink: 0,
                background: "#FACC15", borderRadius: "50%", padding: "4px",
                boxShadow: "0 8px 24px rgba(250,204,21,0.3)",
                display: "grid", placeItems: "center",
                border: "3px solid rgba(255,255,255,0.9)", overflow: "hidden",
              }}>
                {coupon.brand.logo ? (
                  <img src={coupon.brand.logo} alt={coupon.brand.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: "24px", fontWeight: 900, color: "#000" }}>{coupon.brand.name.charAt(0)}</span>
                )}
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <h3 style={{
                  fontSize: "clamp(16px, 4vw, 24px)", fontWeight: 900,
                  color: "#fff", margin: 0, fontFamily: '"Sora", sans-serif',
                  textShadow: "0 4px 16px rgba(0,0,0,0.8)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {coupon.brand.name}
                </h3>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
                  {coupon.nearestOutlet && (
                    <div style={{
                      background: "#22c55e", color: "#fff",
                      padding: "3px 10px", borderRadius: "99px", fontSize: "10px", fontWeight: 900,
                      display: "flex", alignItems: "center", gap: "4px",
                      boxShadow: "0 4px 12px rgba(34,197,94,0.3)", whiteSpace: "nowrap",
                    }}>
                      <MapPin size={10} fill="#fff" />
                      {coupon.nearestOutlet.name}
                    </div>
                  )}
                  <div style={{
                    background: "rgba(255,255,255,0.1)", padding: "3px 10px", borderRadius: "99px",
                    border: "1px solid rgba(255,255,255,0.2)",
                  }}>
                    <span style={{ color: "#FACC15", fontSize: "10px", fontWeight: 900, letterSpacing: "0.05em" }}>{discountLabel}</span>
                  </div>
                  {coupon.offerType === "FIRST_TIME" && (
                    <div style={{
                      background: "rgba(139,92,246,0.15)", padding: "3px 10px", borderRadius: "99px",
                      border: "1px solid rgba(139,92,246,0.3)",
                    }}>
                      <span style={{ color: "#a78bfa", fontSize: "10px", fontWeight: 900 }}>NEW</span>
                    </div>
                  )}
                  {!isActive && (
                    <div style={{
                      background: "rgba(239,68,68,0.15)", padding: "3px 10px", borderRadius: "99px",
                      border: "1px solid rgba(239,68,68,0.3)",
                    }}>
                      <span style={{ color: "#f87171", fontSize: "10px", fontWeight: 900 }}>{coupon.status}</span>
                    </div>
                  )}
                </div>

                {coupon.nearestOutlet?.mapLink && isActive && (
                  <div style={{ marginTop: "12px" }}>
                    <a
                      href={coupon.nearestOutlet.mapLink}
                      target="_blank" rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        background: "#000", color: "#FACC15", textDecoration: "none",
                        padding: "8px 14px", borderRadius: "12px", fontWeight: 900, fontSize: "11px",
                        display: "inline-flex", alignItems: "center", gap: "6px",
                        border: "1px solid rgba(250,204,21,0.3)", transition: "all 0.2s ease",
                      }}
                    >
                      <MapPin size={12} />
                      REDEEM AT OUTLET
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Right: reveal CTA */}
            {isActive && (
              <div style={{ textAlign: "center", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                <div style={{ color: "#fff", fontSize: "9px", fontWeight: 900, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.2em" }}>
                  Reveal Code
                </div>
                <div style={{
                  width: "48px", height: "48px", borderRadius: "50%",
                  background: "var(--brand)", display: "grid", placeItems: "center",
                  boxShadow: "0 10px 24px rgba(250,204,21,0.5)",
                }}>
                  <ArrowRight size={22} color="#000" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── REVEALED: TICKET ── */}
      {revealed && (
        <div style={{
          background: "#FACC15",
          animation: "revealIn 0.5s cubic-bezier(0.19,1,0.22,1)",
          padding: "0 0 20px",
          display: "flex", flexDirection: "column", alignItems: "center",
        }}>
          {/* Top perforated edge */}
          <div style={{ display: "flex", gap: "6px", width: "100%", justifyContent: "center", marginTop: "-1px" }}>
            {[...Array(18)].map((_, i) => (
              <div key={i} style={{ width: "10px", height: "10px", background: "var(--panel, #0a0a0a)", borderRadius: "50%", marginTop: "-5px", flexShrink: 0 }} />
            ))}
          </div>

          {/* Logo */}
          <div className="animate-pop delay-1" style={{
            width: "56px", height: "56px", background: "#fff", borderRadius: "50%",
            padding: "4px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            marginTop: "20px", marginBottom: "8px", overflow: "hidden",
          }}>
            {coupon.brand.logo ? (
              <img src={coupon.brand.logo} alt={coupon.brand.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", fontWeight: 900, fontSize: "20px" }}>
                {coupon.brand.name.charAt(0)}
              </div>
            )}
          </div>

          <h3 className="animate-pop delay-1" style={{
            fontSize: "16px", fontWeight: 900, color: "#000",
            margin: "0 0 12px", fontFamily: '"Sora", sans-serif', textAlign: "center",
          }}>
            {coupon.brand.name}
          </h3>

          {/* Dashed divider */}
          <div className="animate-pop delay-2" style={{ width: "calc(100% - 32px)", borderTop: "2px dashed rgba(0,0,0,0.15)", marginBottom: "14px" }} />

          {/* Code block */}
          <div className="animate-pop delay-3" style={{ textAlign: "center", padding: "0 20px" }}>
            <div style={{
              background: "#000", color: "#FACC15",
              padding: "6px 18px", borderRadius: "12px",
              display: "inline-flex", alignItems: "center", gap: "8px",
              marginBottom: "20px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
            }}>
              <span style={{ fontSize: "14px", fontWeight: 900 }}>{discountLabel}</span>
            </div>
            {coupon.qrData && (
              <div className="animate-pop delay-3" style={{ display: "flex", justifyContent: "center" }}>
                <div style={{
                  background: "#fff",
                  padding: "16px",
                  borderRadius: "24px",
                  display: "inline-block",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
                  border: "2px solid rgba(0,0,0,0.05)"
                }}>
                  <QRCodeSVG
                    value={coupon.qrData}
                    size={180}
                    bgColor={"#ffffff"}
                    fgColor={"#000000"}
                    level={"H"}
                    includeMargin={false}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Dashed divider */}
          <div className="animate-pop delay-3" style={{ width: "calc(100% - 32px)", borderTop: "2px dashed rgba(0,0,0,0.15)", margin: "16px 0 0" }} />

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "10px", padding: "14px 20px 0", width: "100%", boxSizing: "border-box" }}>
            <button
              onClick={(e) => { e.stopPropagation(); setRevealed(false); }}
              className="animate-pop delay-4"
              style={{
                flex: 1, background: "rgba(0,0,0,0.1)", color: "#000",
                border: "2px solid rgba(0,0,0,0.3)", padding: "10px 0",
                borderRadius: "14px", fontWeight: 900, fontSize: "12px", cursor: "pointer",
              }}
            >
              DONE
            </button>
            {coupon.nearestOutlet?.mapLink && (
              <a
                href={coupon.nearestOutlet.mapLink}
                target="_blank" rel="noopener noreferrer"
                className="animate-pop delay-4"
                onClick={(e) => e.stopPropagation()}
                style={{
                  flex: 2, background: "#000", color: "#fff", textDecoration: "none",
                  padding: "10px 0", borderRadius: "14px", fontWeight: 900, fontSize: "12px",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                }}
              >
                <Star size={14} fill="#FACC15" color="#FACC15" />
                REDEEM AT OUTLET
              </a>
            )}
          </div>

          {/* Bottom perforated edge */}
          <div style={{ display: "flex", gap: "6px", width: "100%", justifyContent: "center", marginTop: "16px" }}>
            {[...Array(18)].map((_, i) => (
              <div key={i} style={{ width: "10px", height: "10px", background: "var(--panel, #0a0a0a)", borderRadius: "50%", marginBottom: "-5px", flexShrink: 0 }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RewardsPage({
  theme,
  onToggleTheme,
}: {
  theme: ThemeMode;
  onToggleTheme: () => void;
}) {
  const [coupons, setCoupons] = useState<CouponData[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    setLoading(true);
    fetchMyCoupons()
      .then((couponsData) => {
        setCoupons(couponsData);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeCoupons = coupons.filter((c) => c.status === "ACTIVE");
  const usedCoupons = coupons.filter((c) => c.status !== "ACTIVE");

  return (
    <div className="app-shell">
      <Navbar theme={theme} onToggleTheme={onToggleTheme} />
      <main className="main-wrap">

        {/* Active Rewards Section */}
        <section style={{ marginBottom: "24px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
            <img src={`${import.meta.env.BASE_URL || "/"}img/rewardicon.png`} alt="Rewards" style={{ width: "24px", height: "24px", objectFit: "contain" }} />
            My Active Rewards
          </h2>

          {loading && (
            <div style={{ display: "grid", gap: "16px" }}>
              {[...Array(2)].map((_, i) => (
                <div key={i} style={{ height: "200px", borderRadius: "24px", background: "var(--panel-muted)", animation: "pulse 2s ease-in-out infinite" }} />
              ))}
            </div>
          )}

          {!loading && activeCoupons.length === 0 && (
            <div style={{
              textAlign: "center", padding: "48px 16px",
              background: "var(--panel-muted)", borderRadius: "20px",
              border: "1px solid var(--border)",
            }}>
              <Ticket size={40} color="var(--text-muted)" style={{ marginBottom: "12px" }} />
              <p style={{ fontWeight: 700, fontSize: "16px", margin: "0 0 4px" }}>No active rewards</p>
              <p style={{ color: "var(--text-muted)", fontSize: "13px", margin: 0 }}>
                Complete a print job or claim a promo to unlock exclusive cafe discounts!
              </p>
            </div>
          )}

          <div style={{ display: "grid", gap: "16px" }}>
            {activeCoupons.map((c) => (
              <CouponCard key={c.id} coupon={c} />
            ))}
          </div>
        </section>

        {/* Used/Expired Rewards */}
        {usedCoupons.length > 0 && (
          <section style={{ marginBottom: "24px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px", color: "var(--text-muted)" }}>
              <Clock size={18} />
              Past Rewards
            </h2>
            <div style={{ display: "grid", gap: "12px" }}>
              {usedCoupons.map((c) => (
                <CouponCard key={c.id} coupon={c} />
              ))}
            </div>
          </section>
        )}

        {/* CSS Animations */}
        <style>{`
          @keyframes cardShine {
            0% { left: -150%; }
            100% { left: 150%; }
          }
          .reward-card-premium {
            transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .reward-card-premium:hover {
            transform: translateY(-2px);
            border-color: rgba(250, 204, 21, 0.3) !important;
          }
          .reward-card-premium:active {
            transform: translateY(0);
          }
          @keyframes revealIn {
            from { opacity: 0; transform: scale(0.98); }
            to { opacity: 1; transform: scale(1); }
          }
          @keyframes staggeredPop {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes codeShine {
            0% { left: -100%; }
            100% { left: 100%; }
          }
          .animate-pop {
            animation: staggeredPop 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
          }
          .delay-1 { animation-delay: 0.1s; opacity: 0; }
          .delay-2 { animation-delay: 0.2s; opacity: 0; }
          .delay-3 { animation-delay: 0.3s; opacity: 0; }
          .delay-4 { animation-delay: 0.4s; opacity: 0; }
        `}</style>
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <Link to="/terms" className="footer-link">
            Terms & Conditions
          </Link>
          <Link to="/about" className="footer-link">
            About Us
          </Link>
        </div>
      </footer>
    </div>
  );
}