import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Gift,
  MapPin,
  Ticket,
  LogOut,
  Menu,
  X,
  Crown,
} from "lucide-react";
import { getBrandProfile } from "../api/brandApi";
import "../brand.css";

interface BrandProfile {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  email: string;
  plan: string;
}

const NAV_ITEMS = [
  { path: "/brand/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/brand/offers", label: "Offers", icon: Gift }, 
  { path: "/brand/outlets", label: "Outlets", icon: MapPin },
  { path: "/brand/coupons", label: "Coupons", icon: Ticket },
];

const PLAN_LABELS: Record<string, string> = {
  STANDARD: "Standard",
  PRO: "Pro",
  PRO_PLUS: "Pro+",
};

const PLAN_CLASSES: Record<string, string> = {
  STANDARD: "standard",
  PRO: "pro",
  PRO_PLUS: "pro-plus",
};

export default function BrandLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [brand, setBrand] = useState<BrandProfile | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("brandToken");
    if (!token) {
      navigate("/brand/login", { replace: true });
      return;
    }

    getBrandProfile()
      .then((data) => {
        setBrand(data);
        setLoading(false);
      })
      .catch(() => {
        localStorage.removeItem("brandToken");
        navigate("/brand/login", { replace: true });
      });
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("brandToken");
    navigate("/brand/login", { replace: true });
  };

  if (loading) {
    return (
      <div className="brand-loading-screen">
        <div className="brand-spinner" />
      </div>
    );
  }

  return (
    <div className="brand-shell">
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="brand-overlay"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`brand-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand-sidebar-header">
          <div className="brand-sidebar-brand">
            {brand?.logo ? (
              <img src={brand.logo} alt={brand.name} className="brand-sidebar-avatar" />
            ) : (
              <div className="brand-sidebar-avatar-placeholder">
                {brand?.name?.charAt(0) || "B"}
              </div>
            )}
            <div className="brand-sidebar-info">
              <p className="brand-sidebar-name">{brand?.name}</p>
              <span className={`brand-plan-badge ${PLAN_CLASSES[brand?.plan || "STANDARD"]}`}>
                <Crown size={10} />
                {PLAN_LABELS[brand?.plan || "STANDARD"]}
              </span>
            </div>
          </div>
        </div>

        <nav className="brand-nav">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`brand-nav-item ${isActive ? "active" : ""}`}
              >
                <item.icon size={18} />
                {item.label}
                <span className="brand-nav-dot" />
              </Link>
            );
          })}
        </nav>

        <div className="brand-sidebar-footer">
          <button onClick={handleLogout} className="brand-logout-btn">
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="brand-main">
        {/* Mobile header */}
        <div className="brand-mobile-header">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="brand-mobile-menu-btn">
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{brand?.name}</span>
          <span className={`brand-plan-badge ${PLAN_CLASSES[brand?.plan || "STANDARD"]}`}>
            {PLAN_LABELS[brand?.plan || "STANDARD"]}
          </span>
        </div>

        {/* Page content */}
        <div className="brand-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
            >
              <Outlet context={{ brand }} />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
