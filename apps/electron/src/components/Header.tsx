import { useState, useEffect } from "react";

type Tab = "queue" | "history";

interface PrinterInfo {
  name: string;
  isDefault: boolean;
}

interface HeaderProps {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  printers: PrinterInfo[];
  selectedPrinter: string;
  onPrinterChange: (printer: string) => void;
  selectedColorPrinter: string;
  onColorPrinterChange: (printer: string) => void;
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

/** A compact labelled printer selector pill */
function PrinterSelect({
  id,
  label,
  icon,
  value,
  printers,
  onChange,
  accentColor,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  value: string;
  printers: PrinterInfo[];
  onChange: (v: string) => void;
  accentColor?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider shrink-0"
        style={{ color: accentColor ?? "var(--text-muted)" }}
      >
        {icon}
        {label}
      </div>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="select-input"
        style={
          accentColor
            ? { borderColor: `${accentColor}55`, color: accentColor }
            : {}
        }
      >
        <option value="">Select…</option>
        {printers.map((p) => (
          <option key={p.name} value={p.name}>
            {p.name}
            {p.isDefault ? " (Default)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function Header({
  tab,
  onTabChange,
  printers,
  selectedPrinter,
  onPrinterChange,
  selectedColorPrinter,
  onColorPrinterChange,
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

      {/* Printers + theme */}
      <div className="flex items-center gap-2">
        {/* B&W Printer */}
        <PrinterSelect
          id="header-printer-bw"
          label="B&W"
          value={selectedPrinter}
          printers={printers}
          onChange={onPrinterChange}
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
          }
        />

        <div className="stat-divider" />

        {/* Color Printer */}
        <PrinterSelect
          id="header-printer-color"
          label="Color"
          value={selectedColorPrinter}
          printers={printers}
          onChange={onColorPrinterChange}
          accentColor="#d97706"
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="13.5" cy="6.5" r="2.5" fill="#ef4444" stroke="none" />
              <circle cx="17.5" cy="10.5" r="2.5" fill="#22c55e" stroke="none" />
              <circle cx="8.5" cy="7.5" r="2.5" fill="#3b82f6" stroke="none" />
              <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" strokeWidth="1.5" />
            </svg>
          }
        />

        <div className="stat-divider" />

        <ThemeToggle />
      </div>
    </header>
  );
}
