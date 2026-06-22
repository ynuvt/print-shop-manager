import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { loginWithWhatsappOtp, storage } from "../api/api";
import { useNotifications } from "../components/NotificationCenter";

export default function AuthOtpPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useNotifications();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [message, setMessage] = useState<string>("Logging you in...");

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
      setMessage("Missing login code. Please request a new link.");
      return;
    }

    loginWithWhatsappOtp(code)
      .then((data) => {
        // Handle already-verified OTP: redirect back to WhatsApp gracefully
        if (data.alreadyVerified) {
          setStatus("success");
          setMessage("Already logged in! Redirecting you to WhatsApp...");
          notify("Your WhatsApp is already logged in.", { variant: "success" });
          setTimeout(() => {
            window.location.href = "https://wa.me/918369757906";
          }, 1500);
          return;
        }

        // Write token + userId to robust storage
        const newToken = data.token || "";
        const newUserId = data.userId || "";
        
        storage.set("token", newToken);
        storage.set("userId", newUserId);



        setStatus("success");
        setMessage("Logged in! Redirecting you now...");
        notify("WhatsApp login successful.", { variant: "success" });

        setTimeout(() => {
          if (source === "web") {
            navigate("/");
          } else {
            window.location.href = "https://wa.me/918369757906";
          }
        }, 2000);
      })
      .catch((err) => {
        setStatus("error");
        let errorMsg = "Failed to login with WhatsApp. Please try again.";
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
            <h1>WhatsApp Login</h1>
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
                    window.location.href = "https://wa.me/918369757906?text=login";
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
