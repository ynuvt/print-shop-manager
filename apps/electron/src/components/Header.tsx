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
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-white px-5 py-3 shadow-sm">
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
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
        <div className="leading-tight">
          <p className="text-sm font-semibold text-gray-900">
            Cloud Print Manager
          </p>
          <p className="text-[11px] text-gray-400">PrintOwl Desktop</p>
        </div>
      </div>

      {/* Tabs */}
      <nav
        className="flex rounded-lg bg-gray-100 p-0.5 ring-1 ring-gray-200"
        aria-label="Queue views"
      >
        <button
          type="button"
          onClick={() => onTabChange("queue")}
          className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-colors ${
            tab === "queue"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Active Queue
        </button>
        <button
          type="button"
          onClick={() => onTabChange("history")}
          className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-colors ${
            tab === "history"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          History
        </button>
      </nav>

      {/* Stats + printer selector */}
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
            Total
          </p>
          <p className="text-sm font-semibold tabular-nums text-gray-900">
            {totalJobs}
          </p>
        </div>

        <div className="h-5 w-px bg-gray-200" />

        <div className="text-right">
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
            Processing
          </p>
          <p className="text-sm font-semibold tabular-nums text-blue-600">
            {processingCount}
          </p>
        </div>

        <div className="h-5 w-px bg-gray-200" />

        <div className="flex items-center gap-2">
          <label
            htmlFor="header-printer"
            className="text-[10px] font-medium uppercase tracking-wider text-gray-400"
          >
            Printer
          </label>
          <select
            id="header-printer"
            value={selectedPrinter}
            onChange={(e) => onPrinterChange(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:ring-2 focus:ring-blue-500"
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
