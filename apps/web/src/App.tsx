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
const ShopDashboard = lazy(() => import("./pages/ShopDashboard"));
const SidRedirectPage = lazy(() => import("./pages/SidRedirectPage"));

export type ThemeMode = "dark" | "light";

function PageLoader() {
  return <div style={{ minHeight: "100dvh", background: "var(--bg)" }} />;
}

// On Android, when the user opens the site in a browser tab but has the PWA installed,
// use getInstalledRelatedApps() to detect the installation and re-navigate so Chrome
// intercepts and opens the standalone PWA instead.
function usePWARedirect() {
  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    if (isStandalone) return; // already in PWA

    const isAndroid = /android/i.test(navigator.userAgent);
    if (!isAndroid) return;

    // Guard: only attempt once per session to avoid infinite loops
    if (sessionStorage.getItem("__pwa_redirect")) return;
    sessionStorage.setItem("__pwa_redirect", "1");

    if ("getInstalledRelatedApps" in navigator) {
      (navigator as any).getInstalledRelatedApps().then((apps: any[]) => {
        if (apps.length > 0) {
          // PWA is installed — re-navigate so Chrome intercepts and opens it
          window.location.href = window.location.href;
        }
      }).catch(() => {});
    }
  }, []);
}

export default function App() {
  usePWARedirect();
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
            <Route path="/shop" element={<ShopDashboard theme={theme} onToggleTheme={toggleTheme} />} />
            <Route path="/sid/:shopId" element={<SidRedirectPage />} />
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

