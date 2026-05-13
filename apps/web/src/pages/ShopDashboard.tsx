import type { ThemeMode } from "../App";
import { 
  BarChart3, 
  Users, 
  MessageSquare, 
  TrendingUp, 
  Target,
  Award,
} from "lucide-react";
import { useState } from "react";

const PLANS = [
  { id: 'standard', name: 'Standard', price: '499', features: ['Website Ads', 'Coupon Placement', 'Dashboard/Analytics'] },
  { id: 'pro', name: 'Pro', price: '999', features: ['Website Ads', 'Coupon Placement', 'WhatsApp Coupon Texts', 'Targeted Ads', 'Dashboard/Analytics'] },
  { id: 'pro_plus', name: 'Pro+', price: '1299', features: ['Website Ads', 'Coupon Placement', 'WhatsApp Template Coupons', 'WhatsApp Reminders', 'Targeted Ads', 'Custom Campaigns', 'Priority Visibility'] }
];

export default function ShopDashboard({
  theme,
  onToggleTheme,
}: {
  theme: ThemeMode;
  onToggleTheme: () => void;
}) {
  const [selectedPlan, setSelectedPlan] = useState(PLANS[2]);
  const [dateRange] = useState("Oct 12 - Oct 19, 2023");
  
  const hasAccess = (feature: string) => {
    return selectedPlan.features.includes(feature) || selectedPlan.id === 'pro_plus';
  };

  return (
    <div className="app-shell" style={{ background: theme === 'dark' ? '#070708' : '#f4f4f7', minHeight: "100vh", padding: "0 0 80px" }}>
      {/* Premium Dashboard Header */}
      <nav style={{ 
        padding: "16px 40px", 
        background: "rgba(0,0,0,0.8)", 
        borderBottom: "1px solid rgba(255,255,255,0.1)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        position: "sticky",
        top: 0,
        zIndex: 100,
        backdropFilter: "blur(20px)",
        color: "#fff"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ width: "36px", height: "36px", background: "var(--brand)", borderRadius: "10px", display: "grid", placeItems: "center", fontWeight: "950", color: "#000" }}>Z</div>
          <div>
            <div style={{ fontWeight: "900", letterSpacing: "-0.01em", fontSize: "16px" }}>ZOPY BUSINESS</div>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", fontWeight: "700" }}>OUTLET PORTAL • v2.4</div>
          </div>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: "12px", padding: "4px" }}>
             <button style={{ padding: "8px 16px", background: "transparent", border: "none", color: "#fff", fontSize: "13px", fontWeight: "700", cursor: "pointer", opacity: 0.5 }}>Analytics</button>
             <button style={{ padding: "8px 16px", background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", fontSize: "13px", fontWeight: "700", cursor: "pointer", borderRadius: "8px" }}>Campaigns</button>
             <button style={{ padding: "8px 16px", background: "transparent", border: "none", color: "#fff", fontSize: "13px", fontWeight: "700", cursor: "pointer", opacity: 0.5 }}>billing</button>
          </div>
          <button onClick={onToggleTheme} style={{ background: "rgba(255,255,255,0.05)", border: "none", width: "40px", height: "40px", borderRadius: "12px", cursor: "pointer", display: "grid", placeItems: "center" }}>
            {theme === 'dark' ? "🌙" : "☀️"}
          </button>
        </div>
      </nav>

      <main className="dashboard-content" style={{ maxWidth: "1600px", margin: "0 auto", padding: "40px" }}>
        
        {/* Plan Selection Row */}
        <section style={{ marginBottom: "48px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "24px" }}>
            <div>
              <h2 style={{ fontSize: "24px", fontWeight: "900", margin: "0 0 4px" }}>Membership Plans</h2>
              <p style={{ color: "var(--text-muted)", margin: 0, fontSize: "14px", fontWeight: "600" }}>Select a plan to unlock advanced analytics and marketing tools</p>
            </div>
            <div style={{ color: "var(--brand)", fontWeight: "900", fontSize: "14px" }}>ACTIVE: {selectedPlan.name.toUpperCase()}</div>
          </div>
          
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px" }}>
            {PLANS.map(plan => (
              <div 
                key={plan.id}
                onClick={() => setSelectedPlan(plan)}
                style={{
                  background: selectedPlan.id === plan.id ? "var(--brand)" : "var(--panel)",
                  padding: "24px",
                  borderRadius: "24px",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                  border: "2px solid",
                  borderColor: selectedPlan.id === plan.id ? "var(--brand)" : "var(--border)",
                  color: selectedPlan.id === plan.id ? "#000" : "var(--text)",
                  transform: selectedPlan.id === plan.id ? "scale(1.02)" : "scale(1)",
                  boxShadow: selectedPlan.id === plan.id ? "0 20px 40px rgba(250, 204, 21, 0.2)" : "none"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                  <div style={{ fontSize: "20px", fontWeight: "950" }}>{plan.name}</div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "18px", fontWeight: "950" }}>₹{plan.price}</div>
                    <div style={{ fontSize: "10px", fontWeight: "800", opacity: 0.7 }}>/ MONTH</div>
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {plan.features.slice(0, 3).map((f, i) => (
                    <div key={i} style={{ fontSize: "11px", fontWeight: "800", padding: "4px 8px", background: "rgba(0,0,0,0.1)", borderRadius: "6px" }}>{f}</div>
                  ))}
                  {plan.features.length > 3 && <div style={{ fontSize: "11px", fontWeight: "800", padding: "4px 8px", background: "rgba(0,0,0,0.1)", borderRadius: "6px" }}>+{plan.features.length - 3} more</div>}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Dynamic Analytics Section */}
        <header style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontSize: "36px", fontWeight: "950", margin: 0, letterSpacing: "-0.04em" }}>Madrasi Kaapi House Dashboard</h1>
          <div style={{ display: "flex", background: "var(--panel)", padding: "8px 16px", borderRadius: "14px", border: "1px solid var(--border)", alignItems: "center", gap: "10px" }}>
            <BarChart3 size={18} color="var(--brand)" />
            <span style={{ fontWeight: "800", fontSize: "14px" }}>{dateRange}</span>
          </div>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "24px", marginBottom: "40px" }}>
          <StatCard icon={<Users size={20} />} label="Total Reach" value="4,821" trend="+12%" color="#3b82f6" sub="Total impressions" />
          
          <div style={{ position: "relative", opacity: hasAccess('WhatsApp Coupon Texts') ? 1 : 0.4, filter: hasAccess('WhatsApp Coupon Texts') ? 'none' : 'grayscale(1)' }}>
             <StatCard icon={<MessageSquare size={20} />} label="WhatsApp Sent" value="1,284" trend="+12%" color="#22c55e" sub="Pro Membership" />
             {!hasAccess('WhatsApp Coupon Texts') && <LockOverlay plan="Pro" />}
          </div>

          <div style={{ position: "relative", opacity: hasAccess('Targeted Ads') ? 1 : 0.4, filter: hasAccess('Targeted Ads') ? 'none' : 'grayscale(1)' }}>
             <StatCard icon={<Target size={20} />} label="Targeted Leads" value="482" trend="+15%" color="#FACC15" sub="Frequent Users" />
             {!hasAccess('Targeted Ads') && <LockOverlay plan="Pro" />}
          </div>

          <div style={{ position: "relative", opacity: hasAccess('Priority Visibility') ? 1 : 0.4, filter: hasAccess('Priority Visibility') ? 'none' : 'grayscale(1)' }}>
             <StatCard icon={<Award size={20} />} label="Priority Score" value="98/100" trend="TOP 1%" color="#ef4444" sub="Max Exposure" />
             {!hasAccess('Priority Visibility') && <LockOverlay plan="Pro+" />}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "32px", marginBottom: "40px" }}>
          <section className="hero-panel" style={{ padding: "32px", borderRadius: "32px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
              <h2 style={{ fontSize: "22px", fontWeight: "900", margin: 0 }}>Engagement Performance</h2>
              <div style={{ display: "flex", gap: "16px" }}>
                 <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: "800" }}>
                   <div style={{ width: "12px", height: "12px", background: "var(--brand)", borderRadius: "4px" }} /> Impressions
                 </div>
                 <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: "800" }}>
                   <div style={{ width: "12px", height: "12px", background: "#3b82f6", borderRadius: "4px" }} /> Conversions
                 </div>
              </div>
            </div>
            <svg width="100%" height="300px" viewBox="0 0 1000 300" preserveAspectRatio="none">
              <path d="M0,250 Q100,220 200,180 Q300,100 400,150 Q500,200 600,180 Q700,150 800,80 Q900,100 1000,50 L1000,300 L0,300 Z" fill="rgba(250, 204, 21, 0.1)" />
              <path d="M0,250 Q100,220 200,180 Q300,100 400,150 Q500,200 600,180 Q700,150 800,80 Q900,100 1000,50" fill="none" stroke="var(--brand)" strokeWidth="5" strokeLinecap="round" />
              <path d="M0,280 Q200,270 400,260 Q600,220 800,200 L1000,180" fill="none" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round" strokeDasharray="10 10" />
            </svg>
          </section>

          <section className="hero-panel" style={{ padding: "32px", borderRadius: "32px" }}>
            <h2 style={{ fontSize: "22px", fontWeight: "900", margin: "0 0 24px" }}>Funnel Analytics</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <ProgressBar label="Ad CTR" value={72} sub="Click-through rate on banner" color="var(--brand)" />
              <ProgressBar label="Redemption Rate" value={45} sub="Coupon claims to shop visits" color="#3b82f6" />
              <div style={{ position: "relative", opacity: hasAccess('Custom Campaigns') ? 1 : 0.4 }}>
                 <ProgressBar label="Campaign Retention" value={88} sub="Repeat customers from WhatsApp" color="#22c55e" />
                 {!hasAccess('Custom Campaigns') && <LockOverlay plan="Pro+" />}
              </div>
            </div>
          </section>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "32px" }}>
           <section className="hero-panel" style={{ gridColumn: "span 2", padding: "32px", borderRadius: "32px" }}>
             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
               <h2 style={{ fontSize: "22px", fontWeight: "900", margin: 0 }}>Ad Configuration</h2>
               <button className="theme-btn" style={{ padding: "8px 20px", background: "var(--brand)", border: "none", color: "#000" }}>Publish Changes</button>
             </div>
             <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
               <div style={{ background: "var(--panel-muted)", padding: "20px", borderRadius: "20px" }}>
                 <div style={{ fontWeight: "800", marginBottom: "12px", color: "var(--text-muted)" }}>LIVE BANNER</div>
                 <div style={{ width: "100%", height: "160px", background: "url('/banner/banner1.jpeg') center/cover", borderRadius: "16px" }} />
                 <button className="theme-btn" style={{ width: "100%", marginTop: "12px" }}>Change Artwork</button>
               </div>
               <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                 <div style={{ background: "var(--panel-muted)", padding: "20px", borderRadius: "20px" }}>
                   <div style={{ fontWeight: "800", marginBottom: "8px", color: "var(--text-muted)" }}>BRAND ICON</div>
                   <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                     <img src="/banner/logo/madrasi_kapi_loo.png" style={{ width: "48px", height: "48px", background: "#fff", padding: "4px", borderRadius: "50%" }} />
                     <button className="theme-btn" style={{ flex: 1 }}>Update Icon</button>
                   </div>
                 </div>
                 <div style={{ background: "var(--panel-muted)", padding: "20px", borderRadius: "20px" }}>
                   <div style={{ fontWeight: "800", marginBottom: "8px", color: "var(--text-muted)" }}>HEADLINE</div>
                   <input defaultValue="Flat 15% OFF at Madrasi Kaapi House!" style={{ width: "100%", background: "transparent", border: "none", color: "var(--text)", fontWeight: "700", fontSize: "14px" }} />
                 </div>
               </div>
             </div>
           </section>

           <section className="hero-panel" style={{ padding: "32px", borderRadius: "32px", background: "linear-gradient(135deg, var(--panel) 0%, rgba(250, 204, 21, 0.05) 100%)" }}>
             <h2 style={{ fontSize: "22px", fontWeight: "900", margin: "0 0 16px" }}>Campaign Health</h2>
             <div style={{ textAlign: "center", padding: "20px 0" }}>
               <div style={{ fontSize: "48px", fontWeight: "950", color: "#22c55e" }}>A+</div>
               <div style={{ fontSize: "14px", fontWeight: "800", color: "var(--text-muted)", marginTop: "8px" }}>EXCELLENT REACH</div>
             </div>
             <div style={{ borderTop: "1px solid var(--border)", paddingTop: "20px", marginTop: "20px" }}>
               <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px", fontWeight: "700" }}>Active Features:</div>
               <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                 {selectedPlan.features.map((f, i) => (
                   <div key={i} style={{ fontSize: "10px", fontWeight: "900", background: "var(--panel-muted)", padding: "6px 12px", borderRadius: "8px" }}>{f}</div>
                 ))}
               </div>
             </div>
           </section>
        </div>
      </main>

      <style>{`
        .hero-panel {
          background: var(--panel);
          border: 1px solid var(--border);
          box-shadow: 0 15px 50px rgba(0,0,0,0.15);
        }
        .theme-btn {
          background: var(--panel-muted);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 12px;
          font-weight: 800;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          padding: 10px;
        }
        .theme-btn:hover {
          background: var(--border);
          transform: translateY(-2px);
        }
      `}</style>
    </div>
  );
}

function LockOverlay({ plan }: { plan: string }) {
  return (
    <div style={{
      position: "absolute",
      inset: 0,
      background: "rgba(0,0,0,0.4)",
      backdropFilter: "blur(4px)",
      borderRadius: "24px",
      display: "grid",
      placeItems: "center",
      zIndex: 10
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ background: "#000", padding: "8px 16px", borderRadius: "10px", color: "var(--brand)", fontWeight: "900", fontSize: "11px", letterSpacing: "0.1em" }}>
          UNLOCK {plan}
        </div>
      </div>
    </div>
  );
}


function StatCard({ icon, label, value, trend, color, sub }: any) {
  return (
    <div className="hero-panel" style={{ padding: "24px", borderRadius: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        <div style={{ padding: "10px", background: `${color}20`, borderRadius: "14px", color }}>
          {icon}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "#22c55e", fontSize: "12px", fontWeight: "900" }}>
          <TrendingUp size={14} />
          {trend}
        </div>
      </div>
      <div style={{ fontSize: "28px", fontWeight: "950", color: "var(--text)", marginBottom: "4px" }}>{value}</div>
      <div style={{ fontSize: "12px", fontWeight: "800", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "8px", opacity: 0.6 }}>{sub}</div>
    </div>
  );
}

function ProgressBar({ label, value, sub, color }: any) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "8px" }}>
        <div>
          <div style={{ fontSize: "14px", fontWeight: "800", color: "var(--text)" }}>{label}</div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{sub}</div>
        </div>
        <div style={{ fontSize: "18px", fontWeight: "900", color }}>{value}%</div>
      </div>
      <div style={{ height: "10px", background: "var(--panel-muted)", borderRadius: "99px", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${value}%`, background: color, borderRadius: "99px", boxShadow: `0 0 15px ${color}40` }} />
      </div>
    </div>
  );
}
