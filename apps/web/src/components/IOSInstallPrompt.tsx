import { useEffect, useState } from "react";
import { X } from "lucide-react";

// Separate dismiss/shown keys per portal so each user segment gets their own prompt
function getStorageKeys(): { shown: string; dismissed: string } {
  const path = window.location.pathname;
  if (path.startsWith("/shop")) return { shown: "pwa_shop_prompt_shown", dismissed: "pwa_shop_prompt_dismissed" };
  if (path.startsWith("/brand")) return { shown: "pwa_brand_prompt_shown", dismissed: "pwa_brand_prompt_dismissed" };
  return { shown: "pwa_ios_prompt_shown", dismissed: "pwa_ios_prompt_dismissed" };
}

function getInstallLabel(): { title: string; sub: string; banner: string } {
  const path = window.location.pathname;
  if (path.startsWith("/shop")) return { title: "Add Shop Portal to Home Screen", sub: "Quick access to your shop dashboard", banner: "Open Shop Portal from your Home Screen" };
  if (path.startsWith("/brand")) return { title: "Add Brand Dashboard to Home Screen", sub: "Quick access to your brand analytics", banner: "Open Brand Dashboard from your Home Screen" };
  return { title: "Add Zopy to Home Screen", sub: "Get the full app experience", banner: "Open Zopy from your Home Screen for the best experience" };
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

type Mode = "prompt" | "banner" | null;

export default function IOSInstallPrompt() {
  const [mode, setMode] = useState<Mode>(null);

  useEffect(() => {
    if (isStandalone()) return; // Already running as PWA — nothing to do

    const { shown: SHOWN_KEY, dismissed: DISMISSED_KEY } = getStorageKeys();
    const shown = localStorage.getItem(SHOWN_KEY);
    const dismissed = localStorage.getItem(DISMISSED_KEY);

    if (isAndroid() || !isIOS()) return; // Android redirect handled separately; skip desktop

    if (dismissed) {
      const t = setTimeout(() => setMode("banner"), 1200);
      return () => clearTimeout(t);
    }

    if (!shown) {
      const t = setTimeout(() => {
        localStorage.setItem(SHOWN_KEY, "1");
        setMode("prompt");
      }, 2500);
      return () => clearTimeout(t);
    }
  }, []);

  if (!mode) return null;

  const { dismissed: DISMISSED_KEY } = getStorageKeys();
  const labels = getInstallLabel();

  function dismissPrompt() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setMode(null);
  }

  function dismissBanner() {
    setMode(null);
  }

  if (mode === "banner") {
    return (
      <div className="ios-open-banner">
        <img src="/img/zopy.png" alt="" className="ios-open-banner-icon" />
        <span className="ios-open-banner-text">
          {labels.banner}
        </span>
        <button className="ios-open-banner-close" onClick={dismissBanner} aria-label="Dismiss">
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="ios-install-backdrop" onClick={dismissPrompt}>
      <div className="ios-install-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="ios-install-close" onClick={dismissPrompt} aria-label="Dismiss">
          <X size={18} />
        </button>

        <div className="ios-install-header">
          <img src="/img/zopy.png" alt="Zopy" className="ios-install-icon" />
          <div>
            <div className="ios-install-title">{labels.title}</div>
            <div className="ios-install-sub">{labels.sub}</div>
          </div>
        </div>

        <div className="ios-install-steps">
          <div className="ios-install-step">
            <span className="ios-install-step-num">1</span>
            <span className="ios-install-step-text">
              Tap the{" "}
              <svg
                className="ios-share-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>{" "}
              <strong>Share</strong> button in Safari
            </span>
          </div>
          <div className="ios-install-step">
            <span className="ios-install-step-num">2</span>
            <span className="ios-install-step-text">
              Scroll down and tap <strong>Add to Home Screen</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
