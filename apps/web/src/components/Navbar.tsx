import { Link } from "react-router-dom";
import { MessageCircle, Moon, Sun } from "lucide-react";
import type { ThemeMode } from "../App";

interface NavbarProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  isWhatsappSynced?: boolean;
  onSyncClick?: () => void;
}

export default function Navbar({
  theme,
  onToggleTheme,
  isWhatsappSynced = true,
  onSyncClick,
}: NavbarProps) {
  return (
    <header className="top-bar">
      <Link to="/" className="brand-row" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "14px" }}>
        <img 
          src="/img/zopy.png" 
          alt="Zopy Logo" 
          style={{ width: "48px", height: "48px", objectFit: "contain", borderRadius: "12%" }} 
        />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <span className="brand-subtitle" style={{ fontSize: "0.9rem", fontWeight: "600", opacity: 0.9, color: "var(--text)", letterSpacing: "0.02em" }}>
            PRINT FROM ANYWHERE
          </span>
        </div>
      </Link>

      <div className="top-bar-actions">
        {!isWhatsappSynced && onSyncClick && (
          <button
            type="button"
            className="btn btn-sync-nav"
            onClick={onSyncClick}
            title="Connect your WhatsApp"
          >
            <MessageCircle size={16} />
            Sync
          </button>
        )}
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
