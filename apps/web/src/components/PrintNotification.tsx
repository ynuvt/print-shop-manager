import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import type { Toast } from "react-hot-toast";

interface PrintNotificationProps {
  toastData: Toast;
  message: string;
}

export default function PrintNotification({
  toastData,
  message,
}: PrintNotificationProps) {
  const DURATION = 19000;
  const [progress, setProgress] = useState(100);
  const [visible, setVisible] = useState(false);
  const isDark =
    document.documentElement.getAttribute("data-theme") === "dark";

  useEffect(() => {
    const frameRate = 30;
    const decrement = 100 / (DURATION / (1000 / frameRate));
    const interval = setInterval(() => {
      setProgress((p) => Math.max(0, p - decrement));
    }, 1000 / frameRate);
    const timeout = window.setTimeout(
      () => toast.dismiss(toastData.id),
      DURATION,
    );

    requestAnimationFrame(() => setVisible(true));

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [toastData.id]);

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(() => toast.dismiss(toastData.id), 300);
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
          ? "0 16px 44px rgba(0,0,0,0.45)"
          : "0 16px 44px rgba(15, 23, 42, 0.16)",
        background: isDark ? "#11151d" : "#ffffff",
        border: isDark
          ? "1px solid rgba(151,163,182,0.2)"
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
                ? "linear-gradient(140deg, #2f9bff, #1a7af8)"
                : "linear-gradient(140deg, #2f9bff, #1a7af8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 8px 20px rgba(26,122,248,0.35)",
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
                color: isDark ? "#eaf0f8" : "#111827",
                lineHeight: 1.35,
              }}
            >
              {message}
            </p>
            <p
              style={{
                margin: "3px 0 0",
                fontSize: 12,
                color: isDark ? "#97a3b6" : "#6b7280",
              }}
            >
              Dismisses automatically
            </p>
          </div>

          <button
            onClick={handleDismiss}
            style={{
              flexShrink: 0,
              background: isDark ? "#1b2432" : "#eef3fb",
              border: isDark
                ? "1px solid rgba(151,163,182,0.28)"
                : "1px solid rgba(15,23,42,0.12)",
              borderRadius: 10,
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: isDark ? "#eaf0f8" : "#253347",
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
              ? "rgba(151,163,182,0.24)"
              : "rgba(15,23,42,0.08)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              borderRadius: 99,
              background: "linear-gradient(90deg, #1a7af8, #2f9bff)",
              transition: "width 0.05s linear",
            }}
          />
        </div>
      </div>
    </div>
  );
}
