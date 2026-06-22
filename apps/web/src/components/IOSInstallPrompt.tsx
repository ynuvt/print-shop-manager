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

// Android/Desktop only ever shows on the operator portals, never on the
// home page used by normal customers.
function isPortalPath(): boolean {
  const path = window.location.pathname;
  return path.startsWith("/shop") || path.startsWith("/brand");
}

export default function IOSInstallPrompt() {
  const [show, setShow] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // Already running as an installed PWA — never show.
    if (isStandalone()) return;
    // Dismissed earlier this session — hide for now, but show again next
    // session as long as the app still isn't installed.
    if (sessionStorage.getItem(DISMISSED_KEY)) return;

    // iPhone/iPad: show on every page (no native install on iOS).
    if (isIOS()) {
      setPlatform("ios");
      setShow(true);
      return;
    }

    // Android/Desktop: only on the shop/brand portals, never the home page.
    if (!isPortalPath()) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setPlatform("android");
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setShow(false);
    setExpanded(false);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") dismiss();
  };

  // Double-check: never render once installed.
  if (!show || !platform || isStandalone()) return null;

  return (
    <div
      style={{
        position: "fixed",
        // Sits right below the sticky navbar (min-height 64px).
        top: "64px",
        left: 0,
        right: 0,
        zIndex: 19,
        background: "var(--panel, #111113)",
        borderBottom: "1px solid var(--border, rgba(255,255,255,0.08))",
        borderRadius: "0 0 18px 18px",
        boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
      }}
    >
      {/* Header row — tappable area + dismiss */}
      <div style={{ display: "flex", alignItems: "center", padding: "10px 16px", gap: "10px", position: "relative" }}>
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
            ? <ChevronUp size={16} color="var(--text-muted, #71717a)" style={{ flexShrink: 0 }} />
            : <ChevronDown size={16} color="var(--text-muted, #71717a)" style={{ flexShrink: 0 }} />
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
        <div style={{ padding: "0 16px 16px" }}>
          {platform === "ios" ? (
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
