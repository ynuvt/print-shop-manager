type Tab = "queue" | "history";

interface PrinterInfo {
  name: string;
  isDefault: boolean;
}

interface HeaderProps {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  totalJobs: number;
  processingCount: number;
  printers: PrinterInfo[];
  selectedPrinter: string;
  onPrinterChange: (printer: string) => void;
}

export default function Header({
  tab,
  onTabChange,
  totalJobs,
  processingCount,
  printers,
  selectedPrinter,
  onPrinterChange,
}: HeaderProps) {
  return (
    <header className="top-bar">
      {/* Brand */}
      <div className="brand-row">
        <div className="brand-mark">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9V2h12v7" />
            <rect x="6" y="17" width="12" height="5" />
            <path d="M6 14H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" />
          </svg>
        </div>
        <div>
          <p className="brand-title">Zopy Print Manager</p>
          <span className="brand-subtitle">Zopy Desktop</span>
        </div>
      </div>

      {/* Tabs */}
      <nav className="tab-group" aria-label="Queue views">
        <button
          type="button"
          onClick={() => onTabChange("queue")}
          className={`tab-item ${tab === "queue" ? "active" : ""}`}
        >
          Active Queue
        </button>
        <button
          type="button"
          onClick={() => onTabChange("history")}
          className={`tab-item ${tab === "history" ? "active" : ""}`}
        >
          History
        </button>
      </nav>

      {/* Stats + printer selector */}
      <div className="flex items-center gap-4">
        <div className="stat-block">
          <p className="stat-label">Total</p>
          <p className="stat-value tabular-nums">{totalJobs}</p>
        </div>

        <div className="stat-divider" />

        <div className="stat-block">
          <p className="stat-label">Processing</p>
          <p
            className="stat-value tabular-nums"
            style={{ color: "var(--brand)" }}
          >
            {processingCount}
          </p>
        </div>

        <div className="stat-divider" />

        <div className="flex items-center gap-2">
          <label
            htmlFor="header-printer"
            className="stat-label"
            style={{ margin: 0 }}
          >
            Printer
          </label>
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
