// Shared shop-bookmark storage. Bookmarks are keyed by the human-facing
// shop.shopId so the same set is shared across the shop picker and anywhere
// else that lets the user save a shop.

const BOOKMARKS_KEY = "printowl_bookmarked_shops";

export function getBookmarks(): string[] {
  try {
    return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveBookmarks(ids: string[]): void {
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(ids));
}

export function isBookmarked(shopId: string): boolean {
  return getBookmarks().includes(shopId);
}

// Flips the bookmark state for a shop and returns the new state (true = saved).
export function toggleBookmark(shopId: string): boolean {
  const ids = getBookmarks();
  const next = ids.includes(shopId)
    ? ids.filter((id) => id !== shopId)
    : [...ids, shopId];
  saveBookmarks(next);
  return next.includes(shopId);
}
