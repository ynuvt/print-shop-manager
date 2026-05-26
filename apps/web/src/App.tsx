import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import TermsPage from "./pages/TermsPage";
import AboutPage from "./pages/AboutPage";
import RewardsPage from "./pages/RewardsPage";
import AuthOtpPage from "./pages/AuthOtpPage";
import BrandLoginPage from "./pages/BrandLoginPage";
import BrandLayout from "./components/BrandLayout";
import BrandDashboardPage from "./pages/BrandDashboardPage";
import BrandOffersPage from "./pages/BrandOffersPage";
import BrandOutletsPage from "./pages/BrandOutletsPage";
import BrandWorkersPage from "./pages/BrandWorkersPage";
import BrandCouponsPage from "./pages/BrandCouponsPage";
import { NotificationProvider } from "./components/NotificationCenter";
import { Toaster } from "react-hot-toast";

export type ThemeMode = "dark" | "light";

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem("themeMode");
    return saved === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("themeMode", theme);
  }, [theme]);

  return (
    <NotificationProvider>
      <Toaster position="top-right" toastOptions={{ style: { background: '#18181b', color: '#fafafa', border: '1px solid #3f3f46', borderRadius: '12px' } }} />
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <HomePage
                theme={theme}
                onToggleTheme={() =>
                  setTheme((prev) => (prev === "dark" ? "light" : "dark"))
                }
              />
            }
          />
          <Route
            path="/terms"
            element={
              <TermsPage
                theme={theme}
                onToggleTheme={() =>
                  setTheme((prev) => (prev === "dark" ? "light" : "dark"))
                }
              />
            }
          />
          <Route
            path="/about"
            element={
              <AboutPage
                theme={theme}
                onToggleTheme={() =>
                  setTheme((prev) => (prev === "dark" ? "light" : "dark"))
                }
              />
            }
          />
          <Route
            path="/rewards"
            element={
              <RewardsPage
                theme={theme}
                onToggleTheme={() =>
                  setTheme((prev) => (prev === "dark" ? "light" : "dark"))
                }
              />
            }
          />
          {/* <Route
            path="/shop"
            element={
              <ShopDashboard
                theme={theme}
                onToggleTheme={() =>
                  setTheme((prev) => (prev === "dark" ? "light" : "dark"))
                }
              />
            }
          /> */}
          <Route path="/auth/otp" element={<AuthOtpPage />} />

          {/* ── Brand Dashboard ── */}
          <Route path="/brand/login" element={<BrandLoginPage />} />
          <Route path="/brand" element={<BrandLayout />}>
            <Route path="dashboard" element={<BrandDashboardPage />} />
            <Route path="offers" element={<BrandOffersPage />} />
            <Route path="outlets" element={<BrandOutletsPage />} />
            <Route path="outlets/:outletId/workers" element={<BrandWorkersPage />} />
            <Route path="coupons" element={<BrandCouponsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </NotificationProvider>
  );
}

