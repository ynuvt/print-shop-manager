import Navbar from "../components/Navbar";
import type { ThemeMode } from "../App";
import { Star, Gift, ArrowRight, MapPin } from "lucide-react";
import { useState } from "react";

export default function RewardsPage({
  theme,
  onToggleTheme,
}: {
  theme: ThemeMode;
  onToggleTheme: () => void;
}) {
  const [isRevealed, setIsRevealed] = useState(false);

  return (
    <div className="app-shell">
      <Navbar theme={theme} onToggleTheme={onToggleTheme} />
      
      <main className="main-wrap" style={{ padding: "12px", maxWidth: "1000px", margin: "0 auto" }}>
        {/* Active Rewards Section */}
        <section style={{ marginBottom: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: "800", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
            <Gift size={22} color="var(--brand)" />
            My Active Rewards
          </h2>

          <div
            className="reward-card-premium"
            onClick={() => setIsRevealed(!isRevealed)}
            style={{
              position: "relative",
              borderRadius: "24px",
              overflow: "hidden",
              cursor: "pointer",
              background: "#111",
              boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
              transition: "transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
            }}
          >

            {/* ── FRONT FACE ── */}
            {!isRevealed && (
              <div style={{ position: "relative", minHeight: "220px" }}>
                {/* Banner bg */}
                <div style={{
                  position: "absolute", inset: 0,
                  backgroundImage: "url('/banner/banner1.jpeg')",
                  backgroundSize: "cover", backgroundPosition: "center",
                  opacity: 0.6, filter: "brightness(0.7) contrast(1.1)"
                }} />
                {/* Gradient overlay */}
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(to right, rgba(0,0,0,0.9) 30%, transparent 100%)"
                }} />
                {/* Card shine sweep */}
                <div style={{
                  position: "absolute", top: 0, left: "-150%",
                  width: "100%", height: "100%",
                  background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)",
                  transform: "skewX(-20deg)",
                  animation: "cardShine 4s infinite linear",
                  pointerEvents: "none"
                }} />

                {/* Content row */}
                <div style={{
                  position: "relative", zIndex: 1,
                  minHeight: "220px", padding: "20px 16px",
                  display: "flex", alignItems: "center",
                  justifyContent: "space-between", gap: "12px", flexWrap: "wrap"
                }}>
                  {/* Left: logo + info */}
                  <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: "1 1 200px", minWidth: 0 }}>
                    <div className="logo-container" style={{
                      width: "72px", height: "72px", flexShrink: 0,
                      background: "#FACC15", borderRadius: "50%", padding: "5px",
                      boxShadow: "0 12px 32px rgba(250,204,21,0.3)",
                      display: "grid", placeItems: "center",
                      animation: "pulse 3s infinite ease-in-out",
                      border: "4px solid rgba(255,255,255,0.9)", overflow: "hidden"
                    }}>
                      <img
                        src="/banner/logo/madrasi_kapi_loo.png"
                        alt="Madrasi Kaapi House"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <h3 className="outlet-name" style={{
                        fontSize: "clamp(18px, 5vw, 30px)", fontWeight: "900",
                        color: "#fff", margin: 0, fontFamily: '"Sora", sans-serif',
                        textShadow: "0 4px 16px rgba(0,0,0,0.8)",
                        letterSpacing: "-0.03em", lineHeight: "1.1",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                      }}>
                        Madrasi kaapi house
                      </h3>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
                        <div style={{
                          background: "#22c55e", color: "#fff",
                          padding: "4px 10px", borderRadius: "99px", fontSize: "11px", fontWeight: "900",
                          display: "flex", alignItems: "center", gap: "5px",
                          boxShadow: "0 4px 12px rgba(34,197,94,0.3)", whiteSpace: "nowrap"
                        }}>
                          <MapPin size={11} fill="#fff" />
                          4 MINS AWAY
                        </div>
                        <div style={{
                          background: "rgba(255,255,255,0.1)", padding: "4px 10px", borderRadius: "99px",
                          display: "flex", alignItems: "center",
                          border: "1px solid rgba(255,255,255,0.2)", backdropFilter: "blur(12px)", whiteSpace: "nowrap"
                        }}>
                          <span style={{ color: "#FACC15", fontSize: "11px", fontWeight: "900", letterSpacing: "0.05em" }}>15% OFF</span>
                        </div>
                      </div>

                      <div style={{ marginTop: "16px" }}>
                        <a
                          href="https://share.google/nwapgnQHGT7C2EQgM"
                          target="_blank" rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            background: "#000", color: "#FACC15", textDecoration: "none",
                            padding: "9px 16px", borderRadius: "14px", fontWeight: "900", fontSize: "12px",
                            display: "inline-flex", alignItems: "center", gap: "6px",
                            border: "1px solid rgba(250,204,21,0.3)", transition: "all 0.2s ease", whiteSpace: "nowrap"
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "#FACC15"; e.currentTarget.style.color = "#000"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "#000"; e.currentTarget.style.color = "#FACC15"; }}
                        >
                          <MapPin size={13} />
                          REDEEM AT OUTLET
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Right: reveal CTA */}
                  <div className="reveal-cta" style={{
                    textAlign: "center", flexShrink: 0,
                    display: "flex", flexDirection: "column", alignItems: "center", gap: "8px"
                  }}>
                    <div style={{
                      color: "#fff", fontSize: "9px", fontWeight: "900", opacity: 0.5,
                      textTransform: "uppercase", letterSpacing: "0.2em", whiteSpace: "nowrap"
                    }}>
                      Reveal Code
                    </div>
                    <div className="action-circle" style={{
                      width: "52px", height: "52px", borderRadius: "50%",
                      background: "var(--brand)", display: "grid", placeItems: "center",
                      boxShadow: "0 10px 24px rgba(250,204,21,0.5)",
                      transition: "all 0.4s cubic-bezier(0.175,0.885,0.32,1.275)"
                    }}>
                      <ArrowRight size={24} color="#000" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── REVEALED: TICKET ── */}
            {isRevealed && (
              <div
                style={{
                  background: "#FACC15",
                  animation: "revealIn 0.5s cubic-bezier(0.19,1,0.22,1)",
                  padding: "0 0 20px",
                  display: "flex", flexDirection: "column", alignItems: "center"
                }}
              >
                {/* Top perforated edge */}
                <div style={{ display: "flex", gap: "6px", paddingTop: "0", width: "100%", justifyContent: "center", marginTop: "-1px" }}>
                  {[...Array(18)].map((_, i) => (
                    <div key={i} style={{ width: "10px", height: "10px", background: "var(--panel, #0a0a0a)", borderRadius: "50%", marginTop: "-5px", flexShrink: 0 }} />
                  ))}
                </div>

                {/* Logo */}
                <div className="animate-pop delay-1" style={{
                  width: "64px", height: "64px", background: "#fff", borderRadius: "50%",
                  padding: "4px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  marginTop: "20px", marginBottom: "10px", overflow: "hidden"
                }}>
                  <img
                    src="/banner/logo/madrasi_kapi_loo.png"
                    alt="Logo"
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                </div>

                <h3 className="animate-pop delay-1" style={{
                  fontSize: "18px", fontWeight: "900", color: "#000",
                  margin: "0 0 14px", fontFamily: '"Sora", sans-serif', textAlign: "center"
                }}>
                  Madrasi kaapi house
                </h3>

                {/* Dashed divider */}
                <div className="animate-pop delay-2" style={{
                  width: "calc(100% - 32px)", borderTop: "2px dashed rgba(0,0,0,0.15)", marginBottom: "16px"
                }} />

                {/* Code block */}
                <div className="animate-pop delay-3" style={{ textAlign: "center", padding: "0 20px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "800", color: "rgba(0,0,0,0.5)", letterSpacing: "0.2em", textTransform: "uppercase" }}>
                    Redeem Code
                  </span>
                  <div style={{
                    fontSize: "clamp(36px, 10vw, 52px)", fontWeight: "950", color: "#000",
                    margin: "8px 0", fontFamily: '"Sora", sans-serif', letterSpacing: "3px",
                    position: "relative", overflow: "hidden"
                  }}>
                    ZOPY-921
                    <div style={{
                      position: "absolute", top: 0, width: "100%", height: "100%",
                      background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
                      animation: "codeShine 2s infinite linear"
                    }} />
                  </div>
                  <div style={{
                    background: "#000", color: "#FACC15",
                    padding: "6px 20px", borderRadius: "8px",
                    display: "inline-flex", alignItems: "center", gap: "8px"
                  }}>
                    <span style={{ fontSize: "13px", fontWeight: "800" }}>FLAT 15% OFF</span>
                  </div>
                </div>

                {/* Dashed divider */}
                <div className="animate-pop delay-3" style={{
                  width: "calc(100% - 32px)", borderTop: "2px dashed rgba(0,0,0,0.15)", margin: "20px 0 0"
                }} />

                {/* Action buttons */}
                <div style={{ display: "flex", gap: "10px", padding: "16px 20px 0", width: "100%", boxSizing: "border-box" }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsRevealed(false); }}
                    className="animate-pop delay-4"
                    style={{
                      flex: 1, background: "rgba(0,0,0,0.1)", color: "#000",
                      border: "2px solid rgba(0,0,0,0.3)", padding: "12px 0",
                      borderRadius: "14px", fontWeight: "900", fontSize: "13px", cursor: "pointer"
                    }}
                  >
                    DONE
                  </button>
                  <a
                    href="https://share.google/nwapgnQHGT7C2EQgM"
                    target="_blank" rel="noopener noreferrer"
                    className="animate-pop delay-4"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      flex: 2, background: "#000", color: "#fff", textDecoration: "none",
                      padding: "12px 0", borderRadius: "14px", fontWeight: "900", fontSize: "13px",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.15)"
                    }}
                  >
                    <Star size={15} fill="#FACC15" color="#FACC15" />
                    REDEEM AT OUTLET
                  </a>
                </div>

                {/* Bottom perforated edge */}
                <div style={{ display: "flex", gap: "6px", width: "100%", justifyContent: "center", marginTop: "20px" }}>
                  {[...Array(18)].map((_, i) => (
                    <div key={i} style={{ width: "10px", height: "10px", background: "var(--panel, #0a0a0a)", borderRadius: "50%", marginBottom: "-5px", flexShrink: 0 }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* CSS Animations */}
        <style>{`
          @keyframes pulse {
            0% { transform: scale(1); box-shadow: 0 8px 16px rgba(0,0,0,0.4); }
            50% { transform: scale(1.05); box-shadow: 0 12px 24px rgba(0,0,0,0.6); }
            100% { transform: scale(1); box-shadow: 0 8px 16px rgba(0,0,0,0.4); }
          }
          @keyframes cardShine {
            0% { left: -150%; }
            100% { left: 150%; }
          }
          .reward-card-premium:hover {
            transform: scale(1.02) translateY(-4px);
          }
          .reward-card-premium:active {
            transform: scale(0.98);
          }
          .outlet-name {
            animation: revealText 0.8s cubic-bezier(0.77, 0, 0.175, 1);
          }
          @keyframes revealText {
            0% { opacity: 0; transform: translateX(-20px); }
            100% { opacity: 1; transform: translateX(0); }
          }
          @keyframes revealIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
          }
          @keyframes staggeredPop {
            from { opacity: 0; transform: translateY(20px) scale(0.9); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes codeShine {
            0% { left: -100%; }
            100% { left: 100%; }
          }
          .animate-pop {
            animation: staggeredPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          }
          .delay-1 { animation-delay: 0.1s; opacity: 0; }
          .delay-2 { animation-delay: 0.2s; opacity: 0; }
          .delay-3 { animation-delay: 0.3s; opacity: 0; }
          .delay-4 { animation-delay: 0.4s; opacity: 0; }
          .action-circle {
            transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          }

          @media (max-width: 480px) {
            .logo-container {
              width: 60px !important;
              height: 60px !important;
            }
          }
        `}</style>
      </main>
    </div>
  );
}