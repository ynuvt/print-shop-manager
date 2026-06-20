import { useEffect, useState } from "react";
import { X, ChevronUp, ChevronDown } from "lucide-react";

const DISMISSED_KEY = "zopy_pwa_dismissed";

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
  const [show, setShow] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    // Already in PWA — never show
    if (isStandalone()) return;
    // User previously dismissed — never show again
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const path = window.location.pathname;
    const iosDevice = isIOS();
    setIos(iosDevice);

    if (iosDevice) {
      setShow(true);
      return;
    }

    // Android/Desktop: only on portal pages, not home
    if (!path.startsWith("/shop") && !path.startsWith("/brand")) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setShow(false);
    setExpanded(false);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") dismiss();
  };

  // Double-check: never render if already running as PWA
  if (!show || isStandalone()) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        background: "var(--panel, #111113)",
        borderTop: "1px solid var(--border, rgba(255,255,255,0.08))",
        borderRadius: "20px 20px 0 0",
        boxShadow: "0 -6px 36px rgba(0,0,0,0.28)",
      }}
    >
      {/* Drag pill */}
      <div style={{
        width: "36px",
        height: "4px",
        borderRadius: "99px",
        background: "var(--border, rgba(255,255,255,0.15))",
        margin: "10px auto 0",
      }} />

      {/* Header row — tappable area + dismiss */}
      <div style={{ display: "flex", alignItems: "center", padding: "10px 16px 12px", gap: "10px", position: "relative" }}>
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            textAlign: "left",
            minWidth: 0,
          }}
        >
          <img
            src="/img/zopy.png"
            alt="Zopy"
            style={{ width: "30px", height: "30px", borderRadius: "8px", flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--text, #f4f4f5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Add Zopy to Home Screen
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted, #71717a)", marginTop: "1px" }}>
              {expanded ? "Follow the steps below" : "Tap to see how"}
            </div>
          </div>
          {expanded
            ? <ChevronDown size={16} color="var(--text-muted, #71717a)" style={{ flexShrink: 0 }} />
            : <ChevronUp   size={16} color="var(--text-muted, #71717a)" style={{ flexShrink: 0 }} />
          }
        </button>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted, #71717a)",
            padding: "4px",
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: "0 16px 28px" }}>
          {ios ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: "12px",
                padding: "12px 14px",
                background: "var(--panel-muted, rgba(255,255,255,0.04))",
                borderRadius: "12px",
              }}>
                <div style={{
                  width: "26px", height: "26px", borderRadius: "50%",
                  background: "var(--brand, #eab308)", color: "#000",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: "800", fontSize: "12px", flexShrink: 0,
                }}>1</div>
                <span style={{ fontSize: "13px", color: "var(--text, #f4f4f5)", lineHeight: 1.5 }}>
                  Tap the{" "}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle" }}>
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                    <polyline points="16 6 12 2 8 6" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>{" "}
                  <strong>Share</strong> button in Safari
                </span>
              </div>
              <div style={{
                display: "flex", alignItems: "center", gap: "12px",
                padding: "12px 14px",
                background: "var(--panel-muted, rgba(255,255,255,0.04))",
                borderRadius: "12px",
              }}>
                <div style={{
                  width: "26px", height: "26px", borderRadius: "50%",
                  background: "var(--brand, #eab308)", color: "#000",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: "800", fontSize: "12px", flexShrink: 0,
                }}>2</div>
                <span style={{ fontSize: "13px", color: "var(--text, #f4f4f5)", lineHeight: 1.5 }}>
                  Scroll and tap <strong>Add to Home Screen</strong>
                </span>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleInstall}
              style={{
                width: "100%",
                padding: "13px",
                background: "var(--brand, #eab308)",
                border: "none",
                borderRadius: "12px",
                fontSize: "14px",
                fontWeight: "800",
                color: "#000",
                cursor: "pointer",
              }}
            >
              Install App
            </button>
          )}
        </div>
      )}
    </div>
  );
}
