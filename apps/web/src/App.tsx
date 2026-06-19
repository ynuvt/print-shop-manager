import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { NotificationProvider } from "./components/NotificationCenter";
import { Toaster } from "react-hot-toast";
import IOSInstallPrompt from "./components/IOSInstallPrompt";

// Route-level code splitting — each page gets its own JS chunk.
// Brand pages (which include Recharts) are never downloaded unless the user navigates there.
const HomePage = lazy(() => import("./pages/HomePage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const RewardsPage = lazy(() => import("./pages/RewardsPage"));
const AuthOtpPage = lazy(() => import("./pages/AuthOtpPage"));
const BrandLoginPage = lazy(() => import("./pages/BrandLoginPage"));
const BrandLayout = lazy(() => import("./components/BrandLayout"));
const BrandDashboardPage = lazy(() => import("./pages/BrandDashboardPage"));
const BrandOffersPage = lazy(() => import("./pages/BrandOffersPage"));
const BrandOutletsPage = lazy(() => import("./pages/BrandOutletsPage"));
const BrandWorkersPage = lazy(() => import("./pages/BrandWorkersPage"));
const BrandCouponsPage = lazy(() => import("./pages/BrandCouponsPage"));

export type ThemeMode = "dark" | "light";

function PageLoader() {
  return <div style={{ minHeight: "100dvh", background: "var(--bg)" }} />;
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem("themeMode");
    return saved === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("themeMode", theme);
  }, [theme]);

  const toggleTheme = useCallback(
    () => setTheme((prev) => (prev === "dark" ? "light" : "dark")),
    [],
  );

  return (
    <NotificationProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#18181b",
            color: "#fafafa",
            border: "1px solid #3f3f46",
            borderRadius: "12px",
          },
        }}
      />
      <IOSInstallPrompt />
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<HomePage theme={theme} onToggleTheme={toggleTheme} />} />
            <Route path="/terms" element={<TermsPage theme={theme} onToggleTheme={toggleTheme} />} />
            <Route path="/about" element={<AboutPage theme={theme} onToggleTheme={toggleTheme} />} />
            <Route path="/rewards" element={<RewardsPage theme={theme} onToggleTheme={toggleTheme} />} />
            <Route path="/auth/otp" element={<AuthOtpPage />} />
            <Route path="/brand/login" element={<BrandLoginPage />} />
            <Route path="/brand" element={<BrandLayout />}>
              <Route path="dashboard" element={<BrandDashboardPage />} />
              <Route path="offers" element={<BrandOffersPage />} />
              <Route path="outlets" element={<BrandOutletsPage />} />
              <Route path="outlets/:outletId/workers" element={<BrandWorkersPage />} />
              <Route path="coupons" element={<BrandCouponsPage />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </NotificationProvider>
  );
}

