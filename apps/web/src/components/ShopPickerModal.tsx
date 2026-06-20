import { useEffect, useState, useCallback } from "react";
import { Bookmark, BookmarkCheck, ChevronRight, Navigation, Search, X, Image, ExternalLink } from "lucide-react";
import type { PrintShopInfo } from "../api/api";

const BOOKMARKS_KEY = "printowl_bookmarked_shops";
const RECENTS_KEY = "printowl_recent_shops";
const MAX_RECENTS = 5;

function getBookmarks(): string[] {
  try {
    return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveBookmarks(ids: string[]) {
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(ids));
}

function getRecents(): PrintShopInfo[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveRecentShop(shop: PrintShopInfo) {
  const recents = getRecents().filter((s) => s.shopId !== shop.shopId);
  recents.unshift(shop);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recents.slice(0, MAX_RECENTS)));
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

interface ShopPickerModalProps {
  shops: PrintShopInfo[];
  onSelect: (shop: PrintShopInfo) => void;
  onClose: () => void;
}

export default function ShopPickerModal({ shops, onSelect, onClose }: ShopPickerModalProps) {
  const [query, setQuery] = useState("");
  const [bookmarks, setBookmarks] = useState<string[]>(() => getBookmarks());
  const [recents] = useState<PrintShopInfo[]>(() => getRecents());
  const [userPos, setUserPos] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const toggleBookmark = useCallback((shopId: string) => {
    setBookmarks((prev) => {
      const next = prev.includes(shopId) ? prev.filter((id) => id !== shopId) : [...prev, shopId];
      saveBookmarks(next);
      return next;
    });
  }, []);

  const findNearest = useCallback(() => {
    if (!navigator.geolocation) {
      setLocError("Geolocation is not supported by your browser.");
      return;
    }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocError("Could not get your location. Please allow location access and try again.");
        setLocating(false);
      },
      { timeout: 8000 },
    );
  }, []);

  const withDistance = shops.map((s) => ({
    ...s,
    distance:
      userPos && s.latitude != null && s.longitude != null
        ? haversineKm(userPos.lat, userPos.lon, s.latitude, s.longitude)
        : null,
  }));

  const filtered = withDistance.filter((s) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.username.toLowerCase().includes(q) ||
      s.shopId.toLowerCase().includes(q) ||
      (s.landmark ?? "").toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    if (a.distance != null && b.distance != null) return a.distance - b.distance;
    if (a.distance != null) return -1;
    if (b.distance != null) return 1;
    return (a.name || a.username).localeCompare(b.name || b.username);
  });

  const bookmarkedShops = sorted.filter((s) => bookmarks.includes(s.shopId));
  const recentShops = recents
    .filter((r) => !bookmarks.includes(r.shopId))
    .map((r) => withDistance.find((s) => s.shopId === r.shopId))
    .filter((s): s is (typeof withDistance)[0] => !!s);
  const otherShops = sorted.filter(
    (s) => !bookmarks.includes(s.shopId) && !recents.find((r) => r.shopId === s.shopId),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lightboxUrl) {
          setLightboxUrl(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, lightboxUrl]);

  function ShopRow({ shop }: { shop: typeof withDistance[0] }) {
    const isBookmarked = bookmarks.includes(shop.shopId);
    const displayName = shop.name || shop.username;
    return (
      <div className="shop-row">
        <button
          type="button"
          className="shop-row-main"
          onClick={() => onSelect(shop)}
        >
          {/* Shop ID Avatar */}
          <div className="shop-row-id-badge">
            <span className="shop-row-id-value" style={{ fontSize: shop.shopId.length > 3 ? "11px" : shop.shopId.length > 2 ? "14px" : "18px" }}>
              {shop.shopId.slice(0, 4).toUpperCase()}
            </span>
          </div>

          <div className="shop-row-info">
            <span className="shop-row-name">{displayName}</span>

            <div className="shop-row-meta">
              {shop.landmark && (
                <span className="shop-row-landmark">
                  📍 {shop.landmark}
                </span>
              )}
              {shop.distance != null && (
                <span className="shop-row-distance-badge">
                  {formatDistance(shop.distance)}
                </span>
              )}
            </div>
          </div>

          <ChevronRight size={18} className="shop-row-chevron" />
        </button>

        {/* Actions: View Photo + Bookmark */}
        <div className="shop-row-actions">
          {shop.imageUrl && (
            <button
              type="button"
              className="shop-view-photo-btn"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxUrl(shop.imageUrl!);
              }}
              aria-label="View shop photo"
              title="View shop photo"
            >
              <Image size={13} />
              <span className="shop-view-photo-label">See Photo</span>
            </button>
          )}
          <button
            type="button"
            className={`shop-bookmark-btn${isBookmarked ? " active" : ""}`}
            onClick={() => toggleBookmark(shop.shopId)}
            aria-label={isBookmarked ? "Remove bookmark" : "Save shop"}
            title={isBookmarked ? "Remove from saved" : "Save for later"}
          >
            {isBookmarked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          </button>
        </div>
      </div>
    );
  }

  function Section({ title, items }: { title: string; items: typeof withDistance }) {
    if (!items.length) return null;
    return (
      <div className="shop-section">
        <p className="shop-section-label">{title}</p>
        {items.map((s) => (
          <ShopRow key={s.shopId} shop={s} />
        ))}
      </div>
    );
  }

  const showSections = !query.trim();

  return (
    <>
      <div
        className="modal-shell"
        role="dialog"
        aria-modal="true"
        aria-label="Select a print shop"
        onClick={onClose}
      >
        <div
          className="modal-card shop-picker-card"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-head">
            <div>
              <h2>Select Print Shop</h2>
              <p className="modal-helper">Choose where you want to collect your prints.</p>
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          <div className="shop-search-row">
            <div className="shop-search-wrap">
              <Search size={14} className="shop-search-icon" />
              <input
                type="text"
                className="shop-search-input"
                placeholder="Search by name, ID or landmark..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
            <button
              type="button"
              className={`shop-locate-btn${locating ? " loading" : ""}${userPos ? " active" : ""}`}
              onClick={findNearest}
              disabled={locating}
              title="Find nearest shop"
            >
              <Navigation size={14} />
              {locating ? "Locating..." : userPos ? "Nearest" : "Near Me"}
            </button>
          </div>

          {locError && (
            <p className="shop-loc-error">{locError}</p>
          )}

          <div className="shop-list">
            {showSections ? (
              <>
                <Section title="Saved Shops" items={bookmarkedShops} />
                <Section title="Recently Used" items={recentShops} />
                <Section
                  title={bookmarkedShops.length || recentShops.length ? "All Print Shops" : "Choose a Print Shop"}
                  items={otherShops}
                />
                {!shops.length && (
                  <p className="shop-empty">No shops available yet.</p>
                )}
              </>
            ) : (
              <>
                {sorted.length ? (
                  sorted.map((s) => <ShopRow key={s.shopId} shop={s} />)
                ) : (
                  <p className="shop-empty">No shops match your search.</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox overlay for shop photo */}
      {lightboxUrl && (
        <div
          className="shop-lightbox-overlay"
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Shop photo"
        >
          <div className="shop-lightbox-card" onClick={(e) => e.stopPropagation()}>
            <div className="shop-lightbox-header">
              <span className="shop-lightbox-title">Shop Photo</span>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <a
                  href={lightboxUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shop-lightbox-external"
                  title="Open in new tab"
                >
                  <ExternalLink size={14} />
                </a>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setLightboxUrl(null)}
                  aria-label="Close photo"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="shop-lightbox-img-wrap">
              <img
                src={lightboxUrl}
                alt="Shop photo"
                className="shop-lightbox-img"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
