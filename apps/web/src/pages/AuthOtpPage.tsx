import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { loginWithWhatsappOtp } from "../api/api";
import { useNotifications } from "../components/NotificationCenter";

export default function AuthOtpPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useNotifications();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [message, setMessage] = useState<string>("Syncing your account...");

  const code = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("code")?.trim() ?? "";
  }, [location.search]);

  useEffect(() => {
    if (!code) {
      setStatus("error");
      setMessage("Missing sync code. Please request a new link.");
      return;
    }

    loginWithWhatsappOtp(code)
      .then(({ token, userId }) => {
        localStorage.setItem("token", token);
        localStorage.setItem("userId", userId);
        setStatus("success");
        setMessage("Synced! Redirecting you now...");
        notify("WhatsApp synced successfully.", { variant: "success" });
        setTimeout(() => {
          window.location.href = "https://wa.me/918369757906?text=hi";
        }, 1000);
      })
      .catch((err) => {
        setStatus("error");
        setMessage(
          err instanceof Error
            ? err.message
            : "Failed to sync WhatsApp. Please try again.",
        );
      });
  }, [code, navigate, notify]);

  return (
    <div className="app-shell">
      <main className="main-wrap">
        <section className="hero-panel">
          <div className="hero-header">
            <h1>WhatsApp Sync</h1>
            <p>
              {status === "loading"
                ? "Verifying your link"
                : status === "success"
                  ? "All set"
                  : "Link expired"}
            </p>
          </div>

          <div className="upload-card" role="status" aria-live="polite">
            {status === "loading" && (
              <div className="upload-spinner" aria-hidden="true" />
            )}
            <p className="upload-title">{message}</p>
            {status === "error" && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate("/")}
              >
                Back to Home
              </button>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
