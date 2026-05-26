import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useState, useEffect } from "react";
import type { ThemeMode } from "../App";
import { storage } from "../api/api";
import axios from "axios";
import { getSocket } from "../services/getSocket";

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "https://zopy.devlocstudio.in";
const BASE_URL = `${API_ORIGIN}/api/v1`;

interface NavbarProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export default function Navbar({
  theme,
  onToggleTheme,
}: NavbarProps) {
  const location = useLocation();
  const isHome = location.pathname === "/";
  const isRewards = location.pathname === "/rewards";

  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [hasActiveRewards, setHasActiveRewards] = useState(false);

  useEffect(() => {
    const hasAnimated = sessionStorage.getItem("navbar_animated");
    if (!hasAnimated) {
      setShouldAnimate(true);
      sessionStorage.setItem("navbar_animated", "true");
    }
  }, []);

  useEffect(() => {
    const token = storage.get("token");
    if (!token) {
      setHasActiveRewards(false);
      return;
    }

    axios
      .get(`${BASE_URL}/coupons/my-coupons`, {
        headers: { authorization: `Bearer ${token}` },
      })
      .then((res) => {
        const coupons = res.data?.coupons ?? [];
        const hasActive = coupons.some((c: any) => c.status === "ACTIVE");
        setHasActiveRewards(hasActive);
      })
      .catch((err) => {
        console.error("[navbar] Failed to fetch coupons:", err);
        setHasActiveRewards(false);
      });

    const socket = getSocket();
    const handleCouponEarned = (uid: string) => {
      const userId = storage.get("userId");
      if (uid === userId) {
        setHasActiveRewards(true);
      }
    };

    socket.on("coupon-earned", handleCouponEarned);

    return () => {
      socket.off("coupon-earned", handleCouponEarned);
    };
  }, [location.pathname]);

  return (
    <motion.header 
      initial={shouldAnimate ? { y: -30, opacity: 0 } : false}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="top-bar"
    >
      <Link to="/" className="brand-row" style={{ textDecoration: "none" }}>
        <span style={{ 
          fontSize: "20px", 
          fontWeight: "900", 
          color: theme === "dark" ? "#fff" : "#111",
          WebkitTextStroke: "1px var(--brand)",
          textShadow: theme === "dark" ? "0 0 6px color-mix(in srgb, var(--brand) 40%, transparent)" : "none",
          fontFamily: '"Sora", sans-serif', 
          letterSpacing: "0.05em"
        }}>
          ZOPY
        </span>
      </Link>

      <div className="top-bar-center">
        <nav className="nav-tabs">
          <Link to="/" className={`nav-tab ${isHome ? "active" : ""}`}>
            Home
          </Link>
          <Link to="/rewards" className={`nav-tab ${isRewards ? "active" : ""}`} style={{ position: "relative" }}>
            Rewards
            {hasActiveRewards && (
              <span style={{ 
                position: "absolute", 
                top: "4px", 
                right: "8px", 
                width: "10px", 
                height: "10px", 
                background: "#ff4757", 
                borderRadius: "50%",
                border: "2px solid var(--panel)",
                boxShadow: "0 0 10px rgba(255, 71, 87, 0.5)"
              }} />
            )}
          </Link>
        </nav>
      </div>

      <div className="top-bar-actions">
        <button
          type="button"
          className="theme-btn icon-theme-btn"
          onClick={onToggleTheme}
          aria-label={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
          title={theme === "dark" ? "Light mode" : "Dark mode"}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </motion.header>
  );
}
