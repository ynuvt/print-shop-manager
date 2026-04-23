import { useState, useEffect } from "react";

type Tab = "queue" | "history";

interface PrinterInfo {
  name: string;
  isDefault: boolean;
}

interface HeaderProps {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  totalJobs: number;
  printers: PrinterInfo[];
  selectedPrinter: string;
  onPrinterChange: (printer: string) => void;
}

function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    return localStorage.getItem("zopy_theme") === "dark";
  });

  useEffect(() => {
    if (dark) {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    localStorage.setItem("zopy_theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setDark((d) => !d)}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light mode" : "Dark mode"}
    >
      <div className="theme-toggle-knob">
        {dark ? (
          /* Moon icon */
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0f0f0f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          /* Sun icon */
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        )}
      </div>
    </button>
  );
}

export default function Header({
  tab,
  onTabChange,
  totalJobs,
  printers,
  selectedPrinter,
  onPrinterChange,
}: HeaderProps) {
  return (
    <header className="top-bar">
      {/* Brand */}
      <div className="brand-row">
        <div className="brand-mark">
          <img src="./zopy.png" alt="Zopy" />
        </div>
        <div>
          <p className="brand-title">Zopy Print Manager</p>
          <span className="brand-subtitle">Desktop Console</span>
        </div>
      </div>

      {/* Tabs */}
      <nav className="tab-group" aria-label="Queue views">
        <button
          type="button"
          onClick={() => onTabChange("queue")}
          className={`tab-item ${tab === "queue" ? "active" : ""}`}
        >
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
            </svg>
            Queue
          </span>
        </button>
        <button
          type="button"
          onClick={() => onTabChange("history")}
          className={`tab-item ${tab === "history" ? "active" : ""}`}
        >
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            History
          </span>
        </button>
      </nav>

      {/* Stats + theme + printer */}
      <div className="flex items-center gap-3">
        <div className="stat-block">
          <p className="stat-label">Jobs</p>
          <p className="stat-value tabular-nums">{totalJobs}</p>
        </div>

        <div className="stat-divider" />

        <ThemeToggle />

        <div className="stat-divider" />

        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          <select
            id="header-printer"
            value={selectedPrinter}
            onChange={(e) => onPrinterChange(e.target.value)}
            className="select-input"
          >
            <option value="">Select printer</option>
            {printers.map((printer) => (
              <option key={printer.name} value={printer.name}>
                {printer.name} {printer.isDefault ? "(Default)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
}
