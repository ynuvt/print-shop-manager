import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import { Toaster } from "react-hot-toast";

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
    <>
      <Toaster />

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
        </Routes>
      </BrowserRouter>
    </>
  );
}
