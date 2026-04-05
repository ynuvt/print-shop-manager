import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import ReviewPage from "./pages/ReviewPage";
import TermsPage from "./pages/TermsPage";
import AboutPage from "./pages/AboutPage";
import { NotificationProvider } from "./components/NotificationCenter";

export type ThemeMode = "dark" | "light";

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem("themeMode");
    return saved === "light" ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("themeMode", theme);
  }, [theme]);

  return (
    <NotificationProvider>
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
          <Route path="/review/:jobId" element={<ReviewPage />} />
        </Routes>
      </BrowserRouter>
    </NotificationProvider>
  );
}
