import { useEffect, useMemo, useState } from "react";

interface PrintNotificationProps {
  message: string;
  variant?: "success" | "error" | "info";
  duration?: number;
  onDismiss: () => void;
}

export default function PrintNotification({
  message,
  variant = "info",
  duration = 14000,
  onDismiss,
}: PrintNotificationProps) {
  const [progress, setProgress] = useState(100);
  const [visible, setVisible] = useState(false);
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";

  const accent = useMemo(() => {
    if (variant === "success") return isDark ? "#4ade80" : "#1f9d57";
    if (variant === "error") return isDark ? "#ef4444" : "#c43636";
    return isDark ? "#FACC15" : "#1a7af8";
  }, [variant, isDark]);

  useEffect(() => {
    const frameRate = 30;
    const decrement = 100 / (duration / (1000 / frameRate));
    const interval = setInterval(() => {
      setProgress((p) => Math.max(0, p - decrement));
    }, 1000 / frameRate);
    const timeout = window.setTimeout(() => onDismiss(), duration);

    requestAnimationFrame(() => setVisible(true));

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [duration, onDismiss]);

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(() => onDismiss(), 300);
  };

  return (
    <div
      style={{
        fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
        transform: visible
          ? "translateY(0) scale(1)"
          : "translateY(12px) scale(0.96)",
        opacity: visible ? 1 : 0,
        transition:
          "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease",
        width: "min(92vw, 380px)",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: isDark
          ? "0 16px 44px rgba(0,0,0,0.55)"
          : "0 16px 44px rgba(15, 23, 42, 0.16)",
        background: isDark ? "#1a1a1a" : "#ffffff",
        border: isDark
          ? "1px solid #2a2a2a"
          : "1px solid rgba(15,23,42,0.12)",
        position: "relative",
      }}
    >
      <div style={{ padding: "14px 14px 0" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: isDark
                ? `linear-gradient(140deg, ${accent}, #EAB308)`
                : `linear-gradient(140deg, ${accent}, #2f9bff)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: `0 8px 20px ${accent}55`,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 9V3h12v6M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M9 21h6v-6H9v6z"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 600,
                color: isDark ? "#fafafa" : "#111827",
                lineHeight: 1.35,
              }}
            >
              {message}
            </p>
            <p
              style={{
                margin: "3px 0 0",
                fontSize: 12,
                color: isDark ? "#9ca3af" : "#6b7280",
              }}
            >
              Dismisses automatically
            </p>
          </div>

          <button
            onClick={handleDismiss}
            style={{
              flexShrink: 0,
              background: isDark ? "#141414" : "#eef3fb",
              border: isDark
                ? "1px solid #2a2a2a"
                : "1px solid rgba(15,23,42,0.12)",
              borderRadius: 10,
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: isDark ? "#fafafa" : "#253347",
              transition: "transform 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform =
                "scale(1.05)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform =
                "scale(1)";
            }}
            aria-label="Dismiss notification"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <div style={{ padding: "12px 14px 14px" }}>
        <div
          style={{
            height: 4,
            borderRadius: 99,
            background: isDark
              ? "rgba(250,204,21,0.15)"
              : "rgba(15,23,42,0.08)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              borderRadius: 99,
              background: isDark
                ? `linear-gradient(90deg, ${accent}, #EAB308)`
                : `linear-gradient(90deg, ${accent}, #2f9bff)`,
              transition: "width 0.05s linear",
            }}
          />
        </div>
      </div>
    </div>
  );
}
