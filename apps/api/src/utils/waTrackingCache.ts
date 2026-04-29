/**
 * File-backed in-memory cache for WhatsApp *tracking/timing* metadata ONLY.
 *
 * What IS stored here (non-critical, perf-optimization data):
 *   • lastMessageAt          — tracks when a user last messaged us (20h window)
 *   • lastFileProcessingAt   — tracks when we started processing their last file
 *                               (used to gate the "EDIT" command for 7 seconds)
 *   • lastUploadStickerSentAt — tracks when we last sent an "upload" sticker
 *   • lastFileBatchSentAt    — tracks when we last sent a batched confirmation
 *
 * What is NOT stored here (critical data — stays in the DB):
 *   • phone → userId mapping
 *   • WhatsApp user records
 *   • OTPs, print jobs, files, etc.
 *
 * The JSON file acts as a shared persistence layer so all server cores
 * (on a single vertically-scaled machine) can read/write the same data.
 *
 * Write strategy:
 *   • In-memory Map is the source-of-truth for the current process.
 *   • Every mutation coalesces writes and flushes to disk asynchronously.
 *   • On startup the file is loaded into memory.
 *   • A periodic reload (every 500ms) picks up writes from sibling processes.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Types ────────────────────────────────────────────────────────────────────

export interface WaTrackingEntry {
  /** ISO timestamp: when the user last sent us any message */
  lastMessageAt: string | null;
  /** ISO timestamp: when we started processing the user's last file */
  lastFileProcessingAt: string | null;
  /** ISO timestamp: when we last sent an "uploading" sticker to this user */
  lastUploadStickerSentAt?: string | null;
  /** ISO timestamp: when we last flushed a file batch message for this user */
  lastFileBatchSentAt?: string | null;
}

type CacheData = Record<string, WaTrackingEntry>; // keyed by phoneNumber

// ── File path ────────────────────────────────────────────────────────────────

const __filename_local = fileURLToPath(import.meta.url);
const __dirname_local = path.dirname(__filename_local);

// Store in the API project root's `data/` directory — shared between processes
const DATA_DIR = path.resolve(__dirname_local, "../../data");
const CACHE_FILE = path.join(DATA_DIR, "wa-tracking-cache.json");

// ── In-memory store ──────────────────────────────────────────────────────────

const cache = new Map<string, WaTrackingEntry>();

// ── Flush management ─────────────────────────────────────────────────────────

let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_DELAY_MS = 200; // coalesce writes within 200 ms

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function flushToDisk(): void {
  try {
    ensureDataDir();
    const obj: CacheData = {};
    for (const [k, v] of cache.entries()) {
      obj[k] = v;
    }
    // Atomic-ish write: write to tmp then rename
    const tmpFile = CACHE_FILE + ".tmp";
    fs.writeFileSync(tmpFile, JSON.stringify(obj), "utf-8");
    fs.renameSync(tmpFile, CACHE_FILE);
  } catch (err) {
    console.error("[waTrackingCache] flush error:", err);
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushToDisk();
  }, FLUSH_DELAY_MS);
}

// ── Load from disk ───────────────────────────────────────────────────────────

function loadFromDisk(): void {
  try {
    if (!fs.existsSync(CACHE_FILE)) return;
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    const data: CacheData = JSON.parse(raw);
    for (const [phone, entry] of Object.entries(data)) {
      const existing = cache.get(phone);
      if (!existing) {
        cache.set(phone, {
          lastMessageAt: entry.lastMessageAt || null,
          lastFileProcessingAt: entry.lastFileProcessingAt || null,
          lastUploadStickerSentAt: entry.lastUploadStickerSentAt || null,
          lastFileBatchSentAt: entry.lastFileBatchSentAt || null,
        });
      } else {
        // Keep the more-recent timestamp for each field
        if (
          entry.lastMessageAt &&
          (!existing.lastMessageAt ||
            entry.lastMessageAt > existing.lastMessageAt)
        ) {
          existing.lastMessageAt = entry.lastMessageAt;
        }
        if (
          entry.lastFileProcessingAt &&
          (!existing.lastFileProcessingAt ||
            entry.lastFileProcessingAt > existing.lastFileProcessingAt)
        ) {
          existing.lastFileProcessingAt = entry.lastFileProcessingAt;
        }
        if (
          entry.lastUploadStickerSentAt &&
          (!existing.lastUploadStickerSentAt ||
            entry.lastUploadStickerSentAt > existing.lastUploadStickerSentAt)
        ) {
          existing.lastUploadStickerSentAt = entry.lastUploadStickerSentAt;
        }
        if (
          entry.lastFileBatchSentAt &&
          (!existing.lastFileBatchSentAt ||
            entry.lastFileBatchSentAt > existing.lastFileBatchSentAt)
        ) {
          existing.lastFileBatchSentAt = entry.lastFileBatchSentAt;
        }
      }
    }
  } catch (err) {
    console.error("[waTrackingCache] load error:", err);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Record that a user sent us a message right now.
 * This replaces the DB upsert for `lastMessageAt` in the webhook hot-path.
 */
export function trackMessageReceived(phoneNumber: string): void {
  const now = new Date().toISOString();
  const existing = cache.get(phoneNumber);
  if (existing) {
    existing.lastMessageAt = now;
  } else {
    cache.set(phoneNumber, {
      lastMessageAt: now,
      lastFileProcessingAt: null,
      lastUploadStickerSentAt: null,
      lastFileBatchSentAt: null,
    });
  }
  scheduleFlush();
}

/**
 * Record that we started processing a file for this user.
 * This replaces the DB upsert for `lastFileStartedProcessingAt`.
 */
export function trackFileProcessingStarted(phoneNumber: string): void {
  const now = new Date().toISOString();
  const existing = cache.get(phoneNumber);
  if (existing) {
    existing.lastFileProcessingAt = now;
  } else {
    cache.set(phoneNumber, {
      lastMessageAt: null,
      lastFileProcessingAt: now,
      lastUploadStickerSentAt: null,
      lastFileBatchSentAt: null,
    });
  }
  scheduleFlush();
}

/**
 * Check if a file is currently being processed (started < 7 seconds ago).
 * Used by the "EDIT" command to prevent premature editing.
 */
export function isFileStillProcessing(phoneNumber: string): boolean {
  const entry = cache.get(phoneNumber);
  if (!entry?.lastFileProcessingAt) return false;
  const elapsed = Date.now() - new Date(entry.lastFileProcessingAt).getTime();
  return elapsed < 7_000;
}

/**
 * Check if we should send an "upload" sticker.
 * Returns true if no sticker was sent in the last 15 seconds.
 */
export function shouldSendUploadSticker(phoneNumber: string): boolean {
  const entry = cache.get(phoneNumber);
  if (!entry?.lastUploadStickerSentAt) return true;
  const elapsed = Date.now() - new Date(entry.lastUploadStickerSentAt).getTime();
  return elapsed > 15_000; // Only one sticker per 15s batch
}

export function recordUploadStickerSent(phoneNumber: string): void {
  const now = new Date().toISOString();
  const existing = cache.get(phoneNumber);
  if (existing) {
    existing.lastUploadStickerSentAt = now;
  } else {
    cache.set(phoneNumber, {
      lastMessageAt: null,
      lastFileProcessingAt: null,
      lastUploadStickerSentAt: now,
      lastFileBatchSentAt: null,
    });
  }
  scheduleFlush();
}

/**
 * Check if we should send a file batch confirmation message.
 * Returns true if no batch message was sent in the last 4 seconds.
 */
export function shouldSendFileBatch(phoneNumber: string): boolean {
  const entry = cache.get(phoneNumber);
  if (!entry?.lastFileBatchSentAt) return true;
  const elapsed = Date.now() - new Date(entry.lastFileBatchSentAt).getTime();
  return elapsed > 4_000; // Small buffer to prevent double-flushes across processes
}

export function recordFileBatchSent(phoneNumber: string): void {
  const now = new Date().toISOString();
  const existing = cache.get(phoneNumber);
  if (existing) {
    existing.lastFileBatchSentAt = now;
  } else {
    cache.set(phoneNumber, {
      lastMessageAt: null,
      lastFileProcessingAt: null,
      lastUploadStickerSentAt: null,
      lastFileBatchSentAt: now,
    });
  }
  scheduleFlush();
}

/**
 * Get the lastFileProcessingAt timestamp for a phone number.
 * Returns null if not tracked.
 */
export function getLastFileProcessingAt(
  phoneNumber: string,
): Date | null {
  const entry = cache.get(phoneNumber);
  if (!entry?.lastFileProcessingAt) return null;
  return new Date(entry.lastFileProcessingAt);
}

/**
 * Get the lastMessageAt timestamp for a phone number.
 * Returns null if not tracked.
 */
export function getLastMessageAt(phoneNumber: string): Date | null {
  const entry = cache.get(phoneNumber);
  if (!entry?.lastMessageAt) return null;
  return new Date(entry.lastMessageAt);
}

// ── Initialization ───────────────────────────────────────────────────────────

/**
 * Bootstrap the cache: load from disk and start the periodic reload interval.
 * Call once at server startup.
 */
export function initWaTrackingCache(): void {
  loadFromDisk();
  console.log(
    `[waTrackingCache] Loaded ${cache.size} entries from disk`,
  );

  // Periodically reload from disk to pick up writes from sibling processes
  // 500ms interval for more responsive cross-process batching
  setInterval(() => {
    loadFromDisk();
  }, 500);
}
