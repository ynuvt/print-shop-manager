import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { LogIn, Eye, EyeOff, AlertCircle } from "lucide-react";
import { brandLogin } from "../api/brandApi";
import "../brand.css";

export default function BrandLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await brandLogin(email, password);
      localStorage.setItem("brandToken", data.token);
      navigate("/brand/dashboard", { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="brand-login-wrap">
      <div className="brand-login-glow-1" />
      <div className="brand-login-glow-2" />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        style={{ width: "100%", maxWidth: 448, position: "relative" }}
      >
        <div className="brand-login-card">
          {/* Header */}
          <div className="brand-login-icon">
            <LogIn size={28} color="white" />
          </div>
          <h1 className="brand-login-title">Brand Dashboard</h1>
          <p className="brand-login-desc">Sign in to manage your campaigns</p>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="brand-login-error"
              style={{ marginTop: 24 }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              {error}
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="brand-login-form">
            <div className="brand-form-group">
              <label className="brand-label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="brand@example.com"
                required
                className="brand-input"
              />
            </div>

            <div className="brand-form-group">
              <label className="brand-label">Password</label>
              <div className="brand-password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="brand-input"
                  style={{ paddingRight: 48 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="brand-password-toggle"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="brand-btn-primary" style={{ width: "100%", justifyContent: "center", padding: "12px 16px" }}>
              {loading ? (
                <div className="brand-spinner-sm" />
              ) : (
                <>
                  <LogIn size={16} />
                  Sign In
                </>
              )}
            </button>
          </form>
        </div>

        <p className="brand-login-footer"></p>
      </motion.div>
    </div>
  );
}
