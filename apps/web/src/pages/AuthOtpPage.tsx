import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
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

  const source = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("source")?.trim() ?? "";
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
          if (source === "web") {
            navigate("/");
          } else {
            window.location.href = "https://wa.me/918369757906?text=hi";
          }
        }, 1000);
      })
      .catch((err) => {
        setStatus("error");
        // Extract the actual server error message from Axios 400/500 responses
        let errorMsg = "Failed to sync WhatsApp. Please try again.";
        if (axios.isAxiosError(err)) {
          const serverError = err.response?.data?.error;
          if (typeof serverError === "string" && serverError.trim()) {
            errorMsg = serverError;
          }
        } else if (err instanceof Error) {
          errorMsg = err.message;
        }
        setMessage(errorMsg);
      });
  }, [code, source, navigate, notify]);

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
                  : "Something went wrong"}
            </p>
          </div>

          <div className="upload-card" role="status" aria-live="polite">
            {status === "loading" && (
              <div className="upload-spinner" aria-hidden="true" />
            )}
            <p className="upload-title">{message}</p>
            {status === "error" && (
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center", marginTop: "12px" }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => navigate("/")}
                >
                  Back to Home
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    window.location.href = "https://wa.me/918369757906?text=sync";
                  }}
                >
                  Try Again on WhatsApp
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
