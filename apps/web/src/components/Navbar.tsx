import { Link, useLocation } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import type { ThemeMode } from "../App";

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

  return (
    <header className="top-bar">
      <Link to="/" className="brand-row" style={{ textDecoration: "none" }}>
        <span style={{ 
          fontSize: "20px", 
          fontWeight: "900", 
          color: "#fff", 
          WebkitTextStroke: "1px var(--brand)",
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
    </header>
  );
}
