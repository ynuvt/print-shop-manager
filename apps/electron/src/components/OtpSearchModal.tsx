import { Job } from "@printowl/types";
import { useState } from "react";

interface OtpSearchModalProps {
  onFound: (job: Job) => void;
  findJobByCode: (code: string) => Promise<Job>;
  onClose: () => void;
}

export default function OtpSearchModal({
  onFound,
  findJobByCode,
  onClose,
}: OtpSearchModalProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Enter a verification code.");
      return;
    }
    if (!/^\d{1,6}$/.test(trimmed)) {
      setError("Code must be numeric.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const job = await findJobByCode(trimmed);
      onFound(job);
    } catch (e) {
      if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Something went wrong. Check your connection and try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") void handleSearch();
    if (e.key === "Escape") onClose();
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="otp-modal-title"
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2
              id="otp-modal-title"
              className="text-base font-semibold"
              style={{ color: "var(--text)" }}
            >
              Find Job by Code
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              Enter the verification code shown to the customer.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 transition-colors hover:opacity-80"
            style={{ color: "var(--text-muted)" }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-4">
          <label
            htmlFor="otp-input"
            className="mb-1.5 block text-xs font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            Verification Code
          </label>
          <input
            id="otp-input"
            type="text"
            inputMode="numeric"
            autoFocus
            maxLength={6}
            value={code}
            onChange={(e) => {
              setError(null);
              setCode(e.target.value.replace(/\D/g, ""));
            }}
            onKeyDown={handleKeyDown}
            placeholder="2041"
            className="w-full rounded-xl px-4 py-3 text-center font-mono text-2xl tracking-[0.35em] outline-none transition"
            style={{
              background: "var(--panel-muted)",
              color: "var(--text)",
              border: "1px solid var(--border)",
            }}
          />
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 shrink-0 text-red-500"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-colors hover:opacity-80"
            style={{
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
              background: "var(--panel)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSearch()}
            disabled={loading}
            className="flex-1 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 active:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--brand)" }}
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
      </div>
    </div>
  );
}
