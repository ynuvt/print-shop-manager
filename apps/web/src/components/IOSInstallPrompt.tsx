import { useEffect, useState } from "react";
import { X } from "lucide-react";

const DISMISSED_KEY = "pwa_ios_prompt_dismissed";
const SHOWN_KEY = "pwa_ios_prompt_shown";

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
    // Never show anything on Android or when already running as installed PWA
    if (isAndroid() || isStandalone() || !isIOS()) return;

    const shown = localStorage.getItem(SHOWN_KEY);
    const dismissed = localStorage.getItem(DISMISSED_KEY);

    if (dismissed) {
      // User explicitly closed the install prompt before — show a small
      // "Open in App" reminder that slides in briefly then stays dismissable.
      // This handles the case where someone opens a WhatsApp link in Safari
      // but already has the app installed on their home screen.
      const t = setTimeout(() => setMode("banner"), 1200);
      return () => clearTimeout(t);
    }

    if (!shown) {
      // First visit — show full install instructions
      const t = setTimeout(() => {
        localStorage.setItem(SHOWN_KEY, "1");
        setMode("prompt");
      }, 2500);
      return () => clearTimeout(t);
    }
  }, []);

  if (!mode) return null;

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
          Open Zopy from your <strong>Home Screen</strong> for the best experience
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
            <div className="ios-install-title">Add Zopy to Home Screen</div>
            <div className="ios-install-sub">Get the full app experience</div>
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
