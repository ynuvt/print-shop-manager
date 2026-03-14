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
        fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
        transform: visible
          ? "translateY(0) scale(1)"
          : "translateY(12px) scale(0.96)",
        opacity: visible ? 1 : 0,
        transition:
          "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease",
        width: 380,
        borderRadius: 20,
        overflow: "hidden",
        boxShadow: "0 20px 50px rgba(0,0,0,0.14)",
        background: "#ffffff",
        border: "1px solid rgba(0,0,0,0.08)",
        position: "relative",
      }}
    >
      {/* Subtle top glow */}

      <div style={{ padding: "16px 18px 0" }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          {/* Icon */}
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: "linear-gradient(135deg, #4f46e5, #9333ea)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 10px 25px rgba(79,70,229,0.25)",
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

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 600,
                color: "#111827",
                lineHeight: 1.4,
                letterSpacing: "-0.01em",
              }}
            >
              {message}
            </p>
            <p
              style={{
                margin: "3px 0 0",
                fontSize: 11.5,
                color: "#6b7280",
                letterSpacing: "0.01em",
              }}
            >
              Dismisses automatically
            </p>
          </div>

          {/* Dismiss button */}
          <button
            onClick={handleDismiss}
            style={{
              flexShrink: 0,
              background: "#4f46e5",
              border: "none",
              borderRadius: 10,
              width: 40,
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#ffffff",
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
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ padding: "14px 18px 16px" }}>
        <div
          style={{
            height: 4,
            borderRadius: 99,
            background: "rgba(15,23,42,0.08)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              borderRadius: 99,
              background: "linear-gradient(90deg, #4f46e5, #9333ea)",
              transition: "width 0.05s linear",
            }}
          />
        </div>
      </div>
    </div>
  );
}
