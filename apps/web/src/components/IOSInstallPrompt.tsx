import { useEffect, useState } from "react";
import { X } from "lucide-react";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function IOSInstallPrompt() {
  const [showIOS, setShowIOS] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    if (isStandalone()) return;

    if (isIOS()) {
      setShowIOS(true);
      return;
    }

    // Android / Desktop — capture the native install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (isStandalone() || dismissed) return null;

  // Android / Desktop native install banner
  if (!isIOS()) {
    if (!deferredPrompt) return null;
    return (
      <div className="pwa-install-banner">
        <img src="/img/zopy.png" alt="Zopy" className="pwa-install-icon" />
        <div className="pwa-install-text">
          <span className="pwa-install-title">Install Zopy</span>
          <span className="pwa-install-sub">Add to home screen for the best experience</span>
        </div>
        <button
          className="pwa-install-btn"
          onClick={async () => {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === "accepted") setDismissed(true);
          }}
        >
          Install
        </button>
        <button className="pwa-install-close" onClick={() => setDismissed(true)} aria-label="Dismiss">
          <X size={14} />
        </button>
      </div>
    );
  }

  // iOS instructions sheet
  if (!showIOS) return null;
  return (
    <div className="ios-install-backdrop" onClick={() => setDismissed(true)}>
      <div className="ios-install-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="ios-install-close" onClick={() => setDismissed(true)} aria-label="Dismiss">
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
              <svg className="ios-share-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
              Tap <strong>Add to Home Screen</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
