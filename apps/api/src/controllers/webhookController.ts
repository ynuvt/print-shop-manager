import { prisma } from "@printowl/db";
import { Request, Response } from "express";
import { fileURLToPath } from "url";
import {
  calculateEstimatedTime,
  calculateFileCost,
  type PrintOptions,
} from "@printowl/shared-utils";
import {
  sendWhatsAppStickerFromFile,
  sendWhatsAppTextMessage,
  sendWhatsAppButtonMessage,
  sendWhatsAppCtaUrlMessage,
  sendWhatsAppPdfDocument,
  sendWhatsAppReaction,
} from "../modules/whatsappServices.js";
import { getPdfPageCountFromBuffer } from "../utils/pdfPageCount.js";
import {
  buildR2ObjectKey,
  deleteObjectFromR2ByUrl,
  uploadBufferToR2,
} from "../utils/r2Storage.js";
import { convertToPdfFromBuffer } from "../utils/convertToPdf.js";
import { generateTokenForUser, generateUserToken } from "../utils/token.js";
import {
  PrintJobStatus,
  FileConversionStatus,
} from "../../../../packages/db/dist/generated/prisma/enums.js";
import socket from "../config/socket.js";
import {
  initWaTrackingCache,
  trackFileProcessingStarted,
  trackMessageReceived,
  isFileStillProcessing,
} from "../utils/waTrackingCache.js";

const FRONTEND_BASE_URL = (process.env.FRONTEND_BASE_URL ?? "").replace(
  /\/$/,
  "",
);

function waBold(text: string): string {
  return `*${text}*`;
}

function buildReviewUrl(jobId: string): string | null {
  if (!FRONTEND_BASE_URL) {
    return null;
  }
  // Review page is commented out for now – redirect to home page
  return `${FRONTEND_BASE_URL}/`;
}

/**
 * Build a unified draft "where" clause: by userId first (if synced), fall back to phone number.
 * Returns the where clause to use in prisma.printJob.findFirst.
 */
async function getUnifiedDraftWhere(phoneNumber: string) {
  const waUser = await prisma.whatsAppUser.findUnique({
    where: { phoneNumber },
    select: { userId: true },
  });

  if (waUser?.userId) {
    // Check if a draft exists for this userId
    const byUser = await prisma.printJob.findFirst({
      where: { userId: waUser.userId, status: PrintJobStatus.DRAFT, expired: false },
      select: { id: true },
    });
    if (byUser) {
      return { userId: waUser.userId, status: PrintJobStatus.DRAFT, expired: false };
    }
  }

  // Fall back to phone-number-based lookup
  return {
    userMetadata: { phoneNumber },
    status: PrintJobStatus.DRAFT,
    expired: false,
  };
}

async function generateWhatsAppSyncLink(
  phoneNumber: string,
): Promise<string | null> {
  if (!FRONTEND_BASE_URL) {
    return null;
  }

  // Ensure the WhatsAppUser record exists BEFORE creating the OTP —
  // the OTP has a foreign key on phoneNumber, so the user must exist first.
  // This eliminates the race condition with the fire-and-forget upsert in the
  // main message handler.
  try {
    await prisma.whatsAppUser.upsert({
      where: { phoneNumber },
      create: { phoneNumber, lastMessageAt: new Date() },
      update: {},
      select: { phoneNumber: true },
    });
  } catch (err) {
    console.error("Failed to ensure WhatsAppUser before OTP creation:", err);
    return null;
  }

  // Sync links stay active for 30 days — they only expire when the user
  // actually clicks and completes the sync. This avoids regenerating codes
  // on every message from an unsynced user.
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000);

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    try {
      await prisma.whatsAppLoginOtp.create({
        data: { code, phoneNumber, expiresAt },
      });
      const link = `${FRONTEND_BASE_URL}/auth/otp?code=${code}`;
      // Cache the link so subsequent messages don't hit the DB
      syncLinkCache.set(phoneNumber, link);
      return link;
    } catch (err) {
      const prismaCode = (err as { code?: string } | null)?.code;
      if (prismaCode === "P2002" && attempt < 2) {
        continue;
      }
      console.error("Failed to create WhatsApp sync OTP:", err);
      return null;
    }
  }

  return null;
}

// In-memory cache for sync links — avoids hitting DB on every message
// from an unsynced user. Cleared when the user syncs.
const syncLinkCache = new Map<string, string>();

async function getOrCreateWhatsAppSyncLink(
  phoneNumber: string,
  source?: string,
): Promise<string | null> {
  if (!FRONTEND_BASE_URL) {
    return null;
  }

  const suffix = source ? `&source=${source}` : "";

  // 1) Check in-memory cache first (instant, zero DB cost)
  const cached = syncLinkCache.get(phoneNumber);
  if (cached) {
    return cached + suffix;
  }

  try {
    // 2) Check DB for an existing active (unused, not expired) OTP
    const active = await prisma.whatsAppLoginOtp.findFirst({
      where: {
        phoneNumber,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: { code: true },
    });
    if (active?.code) {
      const link = `${FRONTEND_BASE_URL}/auth/otp?code=${active.code}`;
      syncLinkCache.set(phoneNumber, link);
      return link + suffix;
    }
    // 3) No active OTP — create a new one
    const baseLink = await generateWhatsAppSyncLink(phoneNumber);
    return baseLink ? baseLink + suffix : null;
  } catch (err) {
    console.error("Failed to get/create WhatsApp sync link:", err);
    return null;
  }
}

export const STICKER_FILE_PATH = fileURLToPath(
  new URL("../resource/stickerzopy.webp", import.meta.url),
);
export const UPLOAD_STICKER_FILE_PATH = fileURLToPath(
  new URL("../resource/upload.webp", import.meta.url),
);
// ── Batched file-received confirmations ──────────────────────────────────────
// Collects files received within a 3-second window per phone number,
// then sends ONE consolidated WhatsApp message listing all of them.

interface QueuedFile {
  name: string;
  pages: number;
}

interface PendingBatch {
  to: string;
  phoneNumberId: string;
  files: QueuedFile[];
  timer: ReturnType<typeof setTimeout>;
  isSynced: boolean;
  jobId: string;
  userId: string | null;
}

const fileBatchQueue = new Map<string, PendingBatch>();
const limitReachedSent = new Map<string, number>(); // phone → timestamp

// Wait only briefly after the last file before sending the consolidated
// "files received" reply. Long enough to group a multi-file send (WhatsApp
// delivers them within ~1s of each other), short enough to feel instant.
const BATCH_WINDOW_MS = 1800;

function friendlyFileName(rawName: string): string {
  // Image-converted files: show "Photo" instead of "whatsapp-image-173849384.pdf"
  if (/^whatsapp-image-\d+/i.test(rawName)) {
    return "Photo";
  }
  // Strip long extensions for display, keep it readable
  return rawName.replace(/\.pdf$/i, "");
}

async function flushFileBatch(phoneNumber: string): Promise<void> {
  const batch = fileBatchQueue.get(phoneNumber);
  if (!batch) return;

  // 1) Fetch the current WhatsApp user to check last batch timing
  const waUser = await prisma.whatsAppUser.findUnique({
    where: { phoneNumber },
    select: { lastFileBatchSentAt: true },
  });

  const now = Date.now();
  const lastSentAt = waUser?.lastFileBatchSentAt?.getTime() || 0;

  // Cross-process de-duplication: if another instance just sent the batch
  // message, skip this one. Kept just under the batch window so genuinely
  // later bursts still get their own confirmation.
  if (now - lastSentAt < 1500) {
    console.log(`[file-batch] Skipping redundant flush for ${phoneNumber} (DB-synced)`);
    fileBatchQueue.delete(phoneNumber);
    return;
  }

  // 2) Update DB immediately to "lock" this batch for this user
  await prisma.whatsAppUser.update({
    where: { phoneNumber },
    data: { lastFileBatchSentAt: new Date() },
  });

  // 3) Fetch ALL files for this job from DB (ensures we see files from ALL cores)
  let totalFiles = 0;
  let fileList: {
    name: string;
    pages: number;
    conversionStatus?: FileConversionStatus;
  }[] = [];

  if (batch.jobId) {
    try {
      const dbFiles = await prisma.file.findMany({
        where: { printJobId: batch.jobId },
        orderBy: { createdAt: "asc" },
        select: { name: true, pages: true, conversionStatus: true },
      });
      totalFiles = dbFiles.length;
      fileList = dbFiles;
    } catch (err) {
      console.error("[file-batch] DB fetch error:", err);
      totalFiles = batch.files.length;
      fileList = batch.files;
    }
  }

  if (totalFiles === 0) {
    fileBatchQueue.delete(phoneNumber);
    return;
  }

  // 4) Build file list for the message
  const MAX_LISTED = 15;
  const listedFiles = fileList.slice(0, MAX_LISTED);
  const fileLines = listedFiles.map((f, i) => {
    // Pages aren't known until background conversion finishes; show a
    // "processing" hint instead of "0 pg" for files still converting.
    let detail: string;
    if (f.conversionStatus === FileConversionStatus.FAILED) {
      detail = "couldn't process";
    } else if (f.pages > 0) {
      detail = `${f.pages} pg`;
    } else {
      detail = "processing\u2026";
    }
    return `${i + 1}. ${friendlyFileName(f.name)} \u2022 ${detail}`;
  });
  if (totalFiles > MAX_LISTED) {
    fileLines.push(`... and ${totalFiles - MAX_LISTED} more`);
  }

  const bodyParts = [
    waBold(`${totalFiles} file${totalFiles > 1 ? "s" : ""} received`),
    fileLines.join("\n"),
    "",
  ];

  if (batch.isSynced) {
    bodyParts.push(`_Send more files or tap Edit to set print options & submit._`);
  } else {
    const syncLink = await getOrCreateWhatsAppSyncLink(phoneNumber);
    bodyParts.push(
      `_Send more files or tap Edit to connect & set print options._`,
      "",
      `*Sync to edit on the web:*`,
      syncLink ?? `${FRONTEND_BASE_URL}/`,
    );
  }

  const body = bodyParts.join("\n");

  await sendWhatsAppButtonMessage({
    to: batch.to,
    phoneNumberId: batch.phoneNumberId,
    body,
    buttons: [
      { type: "reply", reply: { id: "edit", title: "Edit" } },
      { type: "reply", reply: { id: "status", title: "Current" } },
      { type: "reply", reply: { id: "steps", title: "Steps" } },
    ],
  }).catch((err) => console.error("[file-batch] send error:", err));

  if (batch.jobId) {
    socket.emit("job-file-added", batch.jobId);
  }
  if (batch.userId) {
    socket.emit("job-file-added", batch.userId);
  }

  fileBatchQueue.delete(phoneNumber);
}

function queueFileConfirmation(args: {
  phoneNumber: string;
  to: string;
  phoneNumberId: string;
  fileName: string;
  pages: number;
  isSynced: boolean;
  jobId: string;
  userId: string | null;
}): void {
  const existing = fileBatchQueue.get(args.phoneNumber);
  const displayName = friendlyFileName(args.fileName);

  if (existing) {
    // Add to the existing batch and reset the timer
    existing.files.push({ name: displayName, pages: args.pages });
    existing.isSynced = args.isSynced;
    existing.jobId = args.jobId;
    existing.userId = args.userId;
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => flushFileBatch(args.phoneNumber), BATCH_WINDOW_MS);
  } else {
    // Start a new batch
    const timer = setTimeout(() => flushFileBatch(args.phoneNumber), BATCH_WINDOW_MS);
    fileBatchQueue.set(args.phoneNumber, {
      to: args.to,
      phoneNumberId: args.phoneNumberId,
      files: [{ name: displayName, pages: args.pages }],
      timer,
      isSynced: args.isSynced,
      jobId: args.jobId,
      userId: args.userId,
    });
  }
}

// ── Async conversion helpers ─────────────────────────────────────────────────
// Files are acknowledged instantly with a PENDING row, then converted, uploaded
// and page-counted in the background. The row flips to READY (or FAILED) once
// done, and connected web clients refetch via the "job-file-added" socket event.

const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  paperSize: "A4",
  colorMode: "BW",
  orientation: "PORTRAIT",
  scaleMode: "FIT",
  pageRange: "ALL",
  customRange: "",
  duplex: "ONE",
  copies: 1,
  pagesPerSheet: 1,
};

// Notify both the job room (collaborators) and the user room (their own web app).
function emitJobFileEvent(jobId: string, userId: string | null): void {
  socket.emit("job-file-added", jobId);
  if (userId) {
    socket.emit("job-file-added", userId);
  }
}

// Recompute job totals from the file rows currently in the DB. Pending files
// have pages/cost 0, so totals fill in as files become READY.
async function recomputeJobTotalsFromDb(jobId: string): Promise<void> {
  const job = await prisma.printJob.findUnique({
    where: { id: jobId },
    select: { id: true, files: { select: { pages: true, fileCost: true } } },
  });
  if (!job) return;
  const totalPages = job.files.reduce((sum, f) => sum + (f.pages ?? 0), 0);
  const totalCost = job.files.reduce((sum, f) => sum + (f.fileCost ?? 0), 0);
  await prisma.printJob.update({
    where: { id: jobId },
    data: {
      totalPages,
      totalCost,
      estimatedTime: calculateEstimatedTime(totalPages),
    },
  });
}

/**
 * Find the unified DRAFT job for a WhatsApp user (userId-based, falling back to
 * phone number), creating one if needed. Enforces the 30-file limit.
 */
async function findOrCreateDraftForWaUser(waUser: {
  phoneNumber: string;
  userId: string | null;
}): Promise<
  | { ok: true; jobId: string }
  | { ok: false; atLimit: true; jobId: string; fileCount: number }
> {
  const draftSelect = {
    id: true,
    userId: true,
    _count: { select: { files: true } },
  } as const;

  let existingJob:
    | { id: string; userId: string | null; _count: { files: number } }
    | null = null;

  if (waUser.userId) {
    existingJob = await prisma.printJob.findFirst({
      where: {
        userId: waUser.userId,
        status: PrintJobStatus.DRAFT,
        expired: false,
      },
      select: draftSelect,
    });
  }

  if (!existingJob) {
    existingJob = await prisma.printJob.findFirst({
      where: {
        userMetadata: { phoneNumber: waUser.phoneNumber },
        status: PrintJobStatus.DRAFT,
        expired: false,
      },
      select: draftSelect,
    });
  }

  if (existingJob && existingJob._count.files >= 30) {
    return {
      ok: false,
      atLimit: true,
      jobId: existingJob.id,
      fileCount: existingJob._count.files,
    };
  }

  if (!existingJob) {
    const createData: any = {
      totalCost: 0,
      totalPages: 0,
      estimatedTime: 0,
      source: "WHATSAPP",
      status: PrintJobStatus.DRAFT,
      userMetadata: { connect: { phoneNumber: waUser.phoneNumber } },
    };
    if (waUser.userId) {
      createData.user = { connect: { id: waUser.userId } };
    }
    const newJob = await prisma.printJob.create({ data: createData });
    return { ok: true, jobId: newJob.id };
  }

  // Attach userId to a phone-only draft once the user syncs.
  if (waUser.userId && !existingJob.userId) {
    await prisma.printJob.update({
      where: { id: existingJob.id },
      data: { userId: waUser.userId },
    });
  }

  return { ok: true, jobId: existingJob.id };
}

/**
 * Background phase: download the media, convert to PDF if needed, count pages,
 * upload to R2, flip the row to READY and recompute job totals — then kick off
 * preview generation. On any failure the row is marked FAILED and the user is
 * told to resend. Never awaited by the webhook handler.
 */
async function finalizeFileInBackground(args: {
  fileId: string;
  jobId: string;
  userId: string | null;
  phoneNumber: string;
  phoneNumberId: string | undefined;
  rawFileName: string;
  isPdf: boolean;
  isImage: boolean;
  download: () => Promise<Buffer>;
}): Promise<void> {
  try {
    const buffer = await args.download();

    let pdfBuffer: Buffer = buffer;
    let pdfFileName = args.rawFileName.toLowerCase().endsWith(".pdf")
      ? args.rawFileName
      : `${args.rawFileName}.pdf`;
    let pages: number;
    let previewSource: Buffer = buffer;
    let previewKind: "image" | "pdf" = "pdf";

    if (args.isImage) {
      const converted = await convertToPdfFromBuffer(buffer, args.rawFileName);
      pdfBuffer = converted.pdfBuffer;
      pdfFileName = converted.pdfFileName;
      pages = 1; // images always produce exactly one page
      previewSource = buffer; // preview from the original image (fast, no LO)
      previewKind = "image";
    } else if (!args.isPdf) {
      const converted = await convertToPdfFromBuffer(buffer, args.rawFileName);
      pdfBuffer = converted.pdfBuffer;
      pdfFileName = converted.pdfFileName;
      pages = await getPdfPageCountFromBuffer(pdfBuffer);
      previewSource = pdfBuffer;
      previewKind = "pdf";
    } else {
      pages = await getPdfPageCountFromBuffer(pdfBuffer);
      previewSource = pdfBuffer;
      previewKind = "pdf";
    }

    const key = buildR2ObjectKey(args.phoneNumber || "whatsapp", pdfFileName);
    const uploaded = await uploadBufferToR2({
      key,
      buffer: pdfBuffer,
      contentType: "application/pdf",
    });

    const cost = calculateFileCost(pages, DEFAULT_PRINT_OPTIONS);

    // updateMany (not update) so a file removed mid-conversion just updates 0
    // rows instead of throwing P2025.
    const updated = await prisma.file.updateMany({
      where: { id: args.fileId },
      data: {
        url: uploaded.url,
        name: pdfFileName,
        pages,
        fileCost: cost,
        conversionStatus: FileConversionStatus.READY,
      },
    });

    if (updated.count === 0) {
      // The file was removed while converting — clean up the uploaded object.
      await deleteObjectFromR2ByUrl(uploaded.url).catch(() => {});
      return;
    }

    await recomputeJobTotalsFromDb(args.jobId);
    emitJobFileEvent(args.jobId, args.userId);

    // Previews are rendered on demand client-side from the PDF (pdf.js); no
    // server-side image is generated or stored.
  } catch (error) {
    console.error("[finalize] conversion failed:", error);
    await prisma.file
      .updateMany({
        where: { id: args.fileId },
        data: { conversionStatus: FileConversionStatus.FAILED },
      })
      .catch(() => {});
    emitJobFileEvent(args.jobId, args.userId);
    if (args.phoneNumberId && args.phoneNumber) {
      sendWhatsAppTextMessage({
        to: args.phoneNumber,
        phoneNumberId: args.phoneNumberId,
        message: `${waBold(`Couldn't process ${friendlyFileName(args.rawFileName)}`)}\nPlease try sending the file again.`,
      }).catch((err) =>
        console.error("[finalize-error-notify] send error:", err),
      );
    }
  }
}

export const verifyWhatsAppWebhook = (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  ) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

interface UserMetadata {
  displayPhoneNumber: string;
  displayName: string;
}

export const handleWhatsAppWebhook = async (req: Request, res: Response) => {
  // Logging full webhook payload is expensive and can delay replies.
  // Keep it behind an explicit flag for production performance.
  if (process.env.DEBUG_WHATSAPP_WEBHOOK === "true") {
    console.log(JSON.stringify(req.body, null, 2));
  }
  if (!req.body || !req.body.entry) {
    console.error("Invalid webhook payload");
    return res.sendStatus(400);
  }

  // ⚡ Respond 200 IMMEDIATELY so WhatsApp doesn't retry.
  // All processing happens asynchronously after this point.
  res.sendStatus(200);

  // Process the webhook payload in the background — errors are caught and logged.
  (async () => {
    try {

  if (req.body.object === "whatsapp_business_account") {
    for (const entry of req.body.entry) {
      if (entry.changes) {
        for (const change of entry.changes) {
          if (
            change.field === "messages" &&
            change.value &&
            change.value.messages
          ) {
            const incomingMessage = change.value.messages?.[0];
            if (!incomingMessage) {
              continue;
            }

            const userData: UserMetadata = {
              displayPhoneNumber:
                change.value.contacts?.[0]?.wa_id || incomingMessage.from || "",
              displayName: change.value.contacts?.[0]?.profile?.name || "",
            };
            const phoneNumberId = change.value.metadata?.phone_number_id;

            // Cache minimal WA user data for this message to avoid redundant DB reads.
            // NOTE: OTPs are still stored in DB (no in-memory OTP storage).
            let waUserMeta: {
              phoneNumber: string;
              userId: string | null;
            } | null = null;

            // Track the timestamp of every incoming message for 24h window checks.
            // Write to file cache INSTANTLY (no DB round-trip), then fire-and-forget the DB update.
            if (userData.displayPhoneNumber) {
              // 1) Instant: update the file-backed tracking cache
              trackMessageReceived(userData.displayPhoneNumber);

              // 2) Fire-and-forget: update the DB in the background (non-blocking).
              //    We do NOT await this here — for document/image handlers the userId
              //    is fetched separately. For text messages, we do a dedicated read below.
              prisma.whatsAppUser.upsert({
                where: { phoneNumber: userData.displayPhoneNumber },
                create: {
                  phoneNumber: userData.displayPhoneNumber,
                  name: userData.displayName || null,
                  lastMessageAt: new Date(),
                },
                update: {
                  lastMessageAt: new Date(),
                  ...(userData.displayName
                    ? { name: userData.displayName }
                    : {}),
                },
                select: { phoneNumber: true },
              }).catch(() => {
                // Non-critical — don't block message processing
              });
            }

            // ─── DOCUMENT HANDLER ────────────────────────────────────────────
            if (incomingMessage.type === "document") {
              const mimeType = incomingMessage.document?.mime_type || "";
              console.log("Received document:", incomingMessage.document);

              // Send the instant acknowledgement ASAP — don't block on DB writes.
                const waUserForSticker = await prisma.whatsAppUser.findUnique({
                  where: { phoneNumber: userData.displayPhoneNumber },
                  select: { lastUploadStickerSentAt: true },
                });
                const lastStickerSentAt = waUserForSticker?.lastUploadStickerSentAt?.getTime() || 0;

                if (phoneNumberId && userData.displayPhoneNumber && (Date.now() - lastStickerSentAt > 15000)) {
                  // Fire-and-forget both the throttle write and the message.
                  prisma.whatsAppUser.update({
                    where: { phoneNumber: userData.displayPhoneNumber },
                    data: { lastUploadStickerSentAt: new Date() },
                  }).catch(() => {});

                  sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    message: "_Receiving file(s)..._",
                  }).catch((err) => console.error("[upload-sticker] send error:", err));
                }

              const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
              const rawFileName =
                incomingMessage.document?.filename || "whatsapp-file";

              if (!accessToken || !incomingMessage.document?.url) {
                console.log("Missing WhatsApp access token or document URL.");
                continue;
              }

              const isPdf = mimeType === "application/pdf";
              // NEW: Check if Word file
              const isWordFile =
                mimeType ===
                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                mimeType === "application/msword" ||
                rawFileName.toLowerCase().endsWith(".docx") ||
                rawFileName.toLowerCase().endsWith(".doc");

              // ── Ensure WhatsApp user record exists (auto-create for unsynced users) ──
              if (userData.displayPhoneNumber) {
                await prisma.whatsAppUser.upsert({
                  where: { phoneNumber: userData.displayPhoneNumber },
                  create: {
                    phoneNumber: userData.displayPhoneNumber,
                    name: userData.displayName || null,
                  },
                  update: {},
                  select: { phoneNumber: true },
                }).catch(() => { /* non-critical */ });
              }

              try {
                if (userData.displayPhoneNumber) {
                  // Instant: update file-backed tracking cache (no DB round-trip)
                  trackFileProcessingStarted(userData.displayPhoneNumber);

                  // Fire-and-forget: persist to DB in background
                  const timestampSeconds = Number(incomingMessage.timestamp);
                  const startedProcessingAt = Number.isFinite(timestampSeconds)
                    ? new Date(timestampSeconds * 1000)
                    : new Date();

                  prisma.whatsAppUser.upsert({
                    where: {
                      phoneNumber: userData.displayPhoneNumber,
                    },
                    create: {
                      phoneNumber: userData.displayPhoneNumber,
                      name: userData.displayName || null,
                      lastFileStartedProcessingAt: startedProcessingAt,
                      lastMessageAt: new Date(),
                    },
                    update: {
                      name: userData.displayName || null,
                      lastFileStartedProcessingAt: startedProcessingAt,
                      lastMessageAt: new Date(),
                    },
                    select: {
                      phoneNumber: true,
                    },
                  }).catch(() => { /* non-critical */ });
                }

                // Display name for the (still-converting) file row.
                const pdfFileName = rawFileName.toLowerCase().endsWith(".pdf")
                  ? rawFileName
                  : `${rawFileName}.pdf`;

                // Look up the WhatsApp user to check if they're synced (have a userId)
                const waUser = await prisma.whatsAppUser.findUnique({
                  where: { phoneNumber: userData.displayPhoneNumber },
                  select: { phoneNumber: true, userId: true },
                });

                if (!waUser) {
                  throw new Error("WhatsApp user record not found.");
                }

                const draft = await findOrCreateDraftForWaUser(waUser);

                if (!draft.ok) {
                  // Limit reached — notify at most once per 30s to avoid rate limits.
                  const lastSent = limitReachedSent.get(userData.displayPhoneNumber || "") ?? 0;
                  const now = Date.now();
                  if (phoneNumberId && userData.displayPhoneNumber && now - lastSent > 30000) {
                    limitReachedSent.set(userData.displayPhoneNumber, now);
                    sendWhatsAppButtonMessage({
                      to: userData.displayPhoneNumber,
                      phoneNumberId,
                      body: [
                        `${waBold("Limit reached")}`,
                        `You already have ${draft.fileCount} files in your draft (max 30).`,
                        "",
                        `_Tap Edit to set print options & submit, or Clear to start a new one._`,
                      ].join("\n"),
                      buttons: [
                        { type: "reply", reply: { id: "edit", title: "Edit" } },
                        { type: "reply", reply: { id: "status", title: "Current" } },
                        { type: "reply", reply: { id: "help", title: "Help" } },
                      ],
                    }).catch((err) => console.error("[limit-reached] send error:", err));
                  }
                  if (waUser.userId) {
                    socket.emit(
                      "job-status-updated",
                      waUser.userId,
                      draft.jobId,
                      "Limit reached: Maximum 30 files allowed per job.",
                    );
                  }
                  continue;
                }

                const printJobId = draft.jobId;

                // ── Phase 1 (instant): create a PENDING row and acknowledge ──
                const createdFile = await prisma.file.create({
                  data: {
                    name: pdfFileName,
                    mimeType: "application/pdf",
                    messageId: incomingMessage.id,
                    pages: 0,
                    url: "",
                    conversionStatus: FileConversionStatus.PENDING,
                    printJobId,
                    uploadedByPhoneNumber: userData.displayPhoneNumber || null,
                    uploadedByDisplayName:
                      userData.displayName ||
                      userData.displayPhoneNumber ||
                      null,
                    uploadedByUserId: waUser.userId ?? null,
                    uploadedByRole: "OWNER",
                    option: {
                      create: {
                        copies: 1,
                        pagesPerSheet: 1,
                      },
                    },
                  },
                });

                if (phoneNumberId && userData.displayPhoneNumber) {
                  queueFileConfirmation({
                    phoneNumber: userData.displayPhoneNumber,
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    fileName: pdfFileName,
                    pages: 0,
                    isSynced: !!waUser.userId,
                    jobId: printJobId,
                    userId: waUser.userId ?? null,
                  });
                }
                emitJobFileEvent(printJobId, waUser.userId ?? null);

                // ── Phase 2 (background): download, convert, upload, count ──
                const documentUrl = incomingMessage.document!.url;
                void finalizeFileInBackground({
                  fileId: createdFile.id,
                  jobId: printJobId,
                  userId: waUser.userId ?? null,
                  phoneNumber: userData.displayPhoneNumber,
                  phoneNumberId,
                  rawFileName,
                  isPdf,
                  isImage: false,
                  download: async () => {
                    const response = await fetch(documentUrl, {
                      headers: { Authorization: `Bearer ${accessToken}` },
                    });
                    if (!response.ok) {
                      throw new Error(
                        `Failed to download WhatsApp document: ${response.status}`,
                      );
                    }
                    return Buffer.from(await response.arrayBuffer());
                  },
                });
              } catch (error) {
                console.log("Failed to process document:", error);
                if (phoneNumberId && userData.displayPhoneNumber) {
                  sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    message: `${waBold("Error")}
Failed to process ${waBold(rawFileName)}.
Please try again.`,
                    phoneNumberId,
                  }).catch((err) => console.error("[doc-error-notify] send error:", err));
                }
              }

              // Document handled — skip text/interactive logic below
              continue;
            }

            // ─── IMAGE HANDLER ──────────────────────────────────────────────
            if (incomingMessage.type === "image") {
              const imageData = incomingMessage.image;
              if (!imageData?.id) {
                console.log("Received image without ID, skipping.");
                continue;
              }

              const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
              if (!accessToken) {
                console.log("Missing WhatsApp access token for image.");
                continue;
              }

              console.log("Received image:", imageData);

              // Send the instant acknowledgement ASAP — don't block on DB writes.
                const waUserForSticker = await prisma.whatsAppUser.findUnique({
                  where: { phoneNumber: userData.displayPhoneNumber },
                  select: { lastUploadStickerSentAt: true },
                });
                const lastStickerSentAt = waUserForSticker?.lastUploadStickerSentAt?.getTime() || 0;

                if (phoneNumberId && userData.displayPhoneNumber && (Date.now() - lastStickerSentAt > 15000)) {
                  // Fire-and-forget both the throttle write and the message.
                  prisma.whatsAppUser.update({
                    where: { phoneNumber: userData.displayPhoneNumber },
                    data: { lastUploadStickerSentAt: new Date() },
                  }).catch(() => {});

                  sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    message: "_Receiving file(s)..._",
                  }).catch((err) => console.error("[upload-sticker] send error:", err));
                }

              // ── Ensure WhatsApp user record exists (auto-create for unsynced users) ──
              if (userData.displayPhoneNumber) {
                await prisma.whatsAppUser.upsert({
                  where: { phoneNumber: userData.displayPhoneNumber },
                  create: {
                    phoneNumber: userData.displayPhoneNumber,
                    name: userData.displayName || null,
                  },
                  update: {},
                  select: { phoneNumber: true },
                }).catch(() => { /* non-critical */ });
              }

              try {
                if (userData.displayPhoneNumber) {
                  // Instant: update file-backed tracking cache (no DB round-trip)
                  trackFileProcessingStarted(userData.displayPhoneNumber);

                  // Fire-and-forget: persist to DB in background
                  prisma.whatsAppUser.upsert({
                    where: { phoneNumber: userData.displayPhoneNumber },
                    create: {
                      phoneNumber: userData.displayPhoneNumber,
                      name: userData.displayName || null,
                      lastFileStartedProcessingAt: new Date(),
                    },
                    update: {
                      name: userData.displayName || null,
                      lastFileStartedProcessingAt: new Date(),
                    },
                    select: { phoneNumber: true },
                  }).catch(() => { /* non-critical */ });
                }

                // Generate a filename based on mime type (the original file we
                // download in the background uses this name to drive conversion).
                const mimeToExt: Record<string, string> = {
                  "image/png": ".png",
                  "image/jpeg": ".jpg",
                  "image/jpg": ".jpg",
                  "image/bmp": ".bmp",
                  "image/tiff": ".tiff",
                  "image/webp": ".webp",
                  "image/gif": ".gif",
                };
                const ext = mimeToExt[imageData.mime_type || ""] || ".jpg";
                const rawFileName = `whatsapp-image-${Date.now()}${ext}`;
                const pdfFileName = rawFileName.replace(/\.[^.]+$/, ".pdf");

                const waUser = await prisma.whatsAppUser.findUnique({
                  where: { phoneNumber: userData.displayPhoneNumber },
                  select: { phoneNumber: true, userId: true },
                });

                if (!waUser) {
                  throw new Error("WhatsApp user record not found.");
                }

                const draft = await findOrCreateDraftForWaUser(waUser);

                if (!draft.ok) {
                  if (phoneNumberId && userData.displayPhoneNumber) {
                    await sendWhatsAppButtonMessage({
                      to: userData.displayPhoneNumber,
                      phoneNumberId,
                      body: [
                        `${waBold("Limit reached")}`,
                        `You already have ${draft.fileCount} files in your draft (max 30).`,
                        "",
                        `_Tap Edit to set print options & submit, or Clear to start a new one._`,
                      ].join("\n"),
                      buttons: [
                        { type: "reply", reply: { id: "edit", title: "Edit" } },
                        { type: "reply", reply: { id: "status", title: "Current" } },
                        { type: "reply", reply: { id: "help", title: "Help" } },
                      ],
                    });
                  }
                  continue;
                }

                const printJobId = draft.jobId;

                // ── Phase 1 (instant): create a PENDING row (images are 1 page) ──
                const createdFile = await prisma.file.create({
                  data: {
                    name: pdfFileName,
                    mimeType: "application/pdf",
                    messageId: incomingMessage.id,
                    pages: 1,
                    url: "",
                    conversionStatus: FileConversionStatus.PENDING,
                    printJobId,
                    uploadedByPhoneNumber: userData.displayPhoneNumber || null,
                    uploadedByDisplayName:
                      userData.displayName ||
                      userData.displayPhoneNumber ||
                      null,
                    uploadedByUserId: waUser.userId ?? null,
                    uploadedByRole: "OWNER",
                    option: { create: { copies: 1, pagesPerSheet: 1 } },
                  },
                });

                if (phoneNumberId && userData.displayPhoneNumber) {
                  queueFileConfirmation({
                    phoneNumber: userData.displayPhoneNumber,
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    fileName: pdfFileName,
                    pages: 1,
                    isSynced: !!waUser.userId,
                    jobId: printJobId,
                    userId: waUser.userId ?? null,
                  });
                }
                emitJobFileEvent(printJobId, waUser.userId ?? null);

                // ── Phase 2 (background): fetch media URL, download, convert ──
                const imageId = imageData.id;
                void finalizeFileInBackground({
                  fileId: createdFile.id,
                  jobId: printJobId,
                  userId: waUser.userId ?? null,
                  phoneNumber: userData.displayPhoneNumber,
                  phoneNumberId,
                  rawFileName,
                  isPdf: false,
                  isImage: true,
                  download: async () => {
                    const mediaUrlRes = await fetch(
                      `https://graph.facebook.com/v21.0/${imageId}`,
                      { headers: { Authorization: `Bearer ${accessToken}` } },
                    );
                    if (!mediaUrlRes.ok) {
                      throw new Error(
                        `Failed to get media URL for image: ${mediaUrlRes.status}`,
                      );
                    }
                    const mediaUrlData = (await mediaUrlRes.json()) as {
                      url?: string;
                    };
                    if (!mediaUrlData.url) {
                      throw new Error("No URL in media response for image.");
                    }
                    const imageResponse = await fetch(mediaUrlData.url, {
                      headers: { Authorization: `Bearer ${accessToken}` },
                    });
                    if (!imageResponse.ok) {
                      throw new Error(
                        `Failed to download WhatsApp image: ${imageResponse.status}`,
                      );
                    }
                    return Buffer.from(await imageResponse.arrayBuffer());
                  },
                });
              } catch (imageError) {
                console.error("Image processing failed:", imageError);
                if (phoneNumberId && userData.displayPhoneNumber) {
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    message: `${waBold("Image processing failed")}\nCouldn't convert the image. Please try again or send as a PDF.`,
                    phoneNumberId,
                  });
                }
              }
              continue;
            }

            // ─── TEXT / INTERACTIVE HANDLER ──────────────────────────────────
            let messageText: string | null = null;

            if (incomingMessage.type === "text") {
              console.log("-------------------------------");
              console.log("Extracted User Metadata:", userData);
              console.log("Received text message:", incomingMessage.text.body);
              messageText = incomingMessage.text.body.toLowerCase().trim();
            } else if (
              incomingMessage.type === "interactive" &&
              incomingMessage.interactive?.type === "button_reply"
            ) {
              console.log("-------------------------------");
              console.log("Extracted User Metadata:", userData);
              console.log(
                "Received button reply:",
                incomingMessage.interactive.button_reply.id,
              );
              messageText = incomingMessage.interactive.button_reply.id
                .toLowerCase()
                .trim();
            }

            if (messageText === null) {
              continue;
            }

            // ─── COUPON / REDEEM HANDLER ─────────────────────────────────────
            // Detect coupon:CODE and redeem:CODE messages from outlet workers.
            // These are processed BEFORE regular user commands since workers
            // may not be synced Zopy users.
            const couponMatch = incomingMessage.text?.body?.trim().match(/^coupon:(.+)$/i)
              || (messageText.startsWith("coupon:") ? [null, messageText.slice(7)] : null);
            const redeemMatch = incomingMessage.text?.body?.trim().match(/^redeem:(.+)$/i)
              || (messageText.startsWith("redeem:") ? [null, messageText.slice(7)] : null);

            if ((couponMatch || redeemMatch) && phoneNumberId && userData.displayPhoneNumber) {
              try {
                const { validateCoupon, redeemCoupon } = await import("../modules/couponService.js");
                const { sendWhatsAppButtonMessage: sendBtn } = await import("../modules/whatsappServices.js");

                // Check worker eligibility first so we ignore customer messages without any reply
                const worker = await prisma.outletWorker.findUnique({
                  where: { phoneNumber: userData.displayPhoneNumber, isActive: true },
                  include: { outlet: { include: { brand: true } } },
                });

                if (!worker) {
                  console.log(`[coupon-webhook] Non-worker ${userData.displayPhoneNumber} sent coupon command. Replying.`);
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    message: "This coupon can only be claimed at the outlet by the worker who works there.",
                  });
                  continue;
                }

                if (couponMatch) {
                  const code = (couponMatch[1] || "").trim();
                  const result = await validateCoupon(code, userData.displayPhoneNumber);

                  if (result.valid && result.coupon) {
                    const discountText = result.coupon.discountType === "PERCENTAGE"
                      ? `${result.coupon.discountValue}% OFF`
                      : `₹${result.coupon.discountValue} OFF`;

                    await sendBtn({
                      to: userData.displayPhoneNumber,
                      phoneNumberId,
                      body: [
                        `*Coupon Valid*`,
                        ``,
                        `Brand: *${result.coupon.brandName}*`,
                        `Discount: *${discountText}*`,
                        `${result.coupon.description ? `Description: _${result.coupon.description}_` : ""}`,
                        `Valid until: ${result.coupon.validUntil.toLocaleDateString("en-IN")}`,
                        ``,
                        `Tap below to redeem this coupon.`,
                      ].join("\n"),
                      buttons: [
                        { type: "reply", reply: { id: `redeem:${code}`, title: "Redeem Coupon" } },
                      ],
                    });
                  } else {
                    // Clean text (no emojis)
                    const cleanMsg = result.message.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g, "").trim();
                    await sendWhatsAppTextMessage({
                      to: userData.displayPhoneNumber,
                      phoneNumberId,
                      message: cleanMsg,
                    });
                  }
                } else if (redeemMatch) {
                  const code = (redeemMatch[1] || "").trim();
                  const result = await redeemCoupon(code, userData.displayPhoneNumber);

                  const cleanMsg = result.message.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g, "").trim();
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    message: cleanMsg,
                  });
                }
              } catch (err) {
                console.error("[coupon-webhook] Error:", err);
                await sendWhatsAppTextMessage({
                  to: userData.displayPhoneNumber,
                  phoneNumberId,
                  message: "Something went wrong processing the coupon. Please try again.",
                });
              }
              continue;
            }

            // ── Fast auth check ──────────────────────────────────────────────
            // We need to know if the user is synced (has a userId) to decide
            // whether to show the sync link or process commands.
            // Start this DB read ASAP — it's the only blocking call needed.
            if (userData.displayPhoneNumber) {
              try {
                waUserMeta = await prisma.whatsAppUser.findUnique({
                  where: { phoneNumber: userData.displayPhoneNumber },
                  select: { phoneNumber: true, userId: true },
                });
              } catch {
                // Ignore — handled below
              }
            }
            const isAuthenticated = !!waUserMeta?.userId;

            // Ensure WhatsApp user record exists for unsynced users too
            if (!waUserMeta && userData.displayPhoneNumber) {
              await prisma.whatsAppUser.upsert({
                where: { phoneNumber: userData.displayPhoneNumber },
                create: {
                  phoneNumber: userData.displayPhoneNumber,
                  name: userData.displayName || null,
                },
                update: {},
                select: { phoneNumber: true },
              }).catch(() => { /* non-critical */ });
            }

            if (messageText === "edit" && phoneNumberId && userData.displayPhoneNumber) {
              if (!isAuthenticated) {
                const syncLink = await getOrCreateWhatsAppSyncLink(
                  userData.displayPhoneNumber,
                  "web", // source=web so OTP page redirects to web dashboard
                );
                sendWhatsAppTextMessage({
                  to: userData.displayPhoneNumber,
                  phoneNumberId,
                  message: [
                    `${waBold("Login to edit your draft")} 🔗`,
                    `Your files are saved! To set print options & submit, login first:`,
                    "",
                    syncLink ?? "https://zopy.co.in",
                    "",
                    `_Open this link in your browser to login, then you'll be redirected to edit your draft._`,
                  ].join("\n"),
                }).catch((err) => console.error("[sync-edit] send error:", err));
              } else {
                sendWhatsAppTextMessage({
                  to: userData.displayPhoneNumber,
                  phoneNumberId,
                  message: [
                    `${waBold("Edit your draft")} 🔗`,
                    "Tap the link below to set print options and submit your job:",
                    "",
                    "https://zopy.co.in",
                  ].join("\n"),
                }).catch((err) => console.error("[authenticated-edit] send error:", err));
              }
              continue;
            }

            // ─── SHOP QR SELECTION (SID:X) ──────────────────────────────────
            // Matches "SID:TCET", "SID:1", or "PLEASE SEND THIS MESSAGE SID:1".
            const sidMatch = incomingMessage.text?.body
              ?.trim()
              .match(/\bSID:([A-Z0-9]+)/i);
            if (sidMatch && userData.displayPhoneNumber) {
              const shopIdCandidate = sidMatch[1]!.toUpperCase().replace(/[^A-Z0-9]/g, "");
              try {
                const shopRecord = await prisma.printShop.findUnique({
                  where: { shopId: shopIdCandidate },
                  select: { shopId: true, name: true, username: true, isActive: true },
                });
                if (shopRecord?.isActive) {
                  const waUser = await prisma.whatsAppUser.upsert({
                    where: { phoneNumber: userData.displayPhoneNumber },
                    create: {
                      phoneNumber: userData.displayPhoneNumber,
                      name: userData.displayName || null,
                      defaultShopId: shopRecord.shopId,
                    },
                    update: { defaultShopId: shopRecord.shopId },
                    select: { phoneNumber: true, userId: true },
                  });

                  // Push real-time shop change to the web app if user is synced
                  if (waUser.userId) {
                    socket.emit("sid-shop-changed", waUser.userId, shopRecord.shopId);
                  }

                  const shopName = shopRecord.name || shopRecord.username;
                  await sendWhatsAppButtonMessage({
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    body: [
                      `Your shop is selected as *${shopName}*`,
                      ``,
                      `${waBold("Welcome to Zopy!")} 🚀`,
                      `Send your ${waBold("PDF, Word, or image files")} here.`,
                      ``,
                      `▸ ${waBold("Login")} › Connect to web to edit & print`,
                      `▸ ${waBold("Steps")} › See how it works`,
                      `▸ ${waBold("Help")} › View all commands`,
                    ].join("\n"),
                    buttons: [
                      { type: "reply", reply: { id: "login", title: "Login" } },
                      { type: "reply", reply: { id: "steps", title: "Steps" } },
                      { type: "reply", reply: { id: "help", title: "Help" } },
                    ],
                  });
                } else {
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    message: `Shop not found. Please make sure you scanned the correct QR code.`,
                    phoneNumberId,
                  });
                }
              } catch (err) {
                console.error("[SID] shop selection error:", err);
              }
              continue;
            }

            // ── For unsynced users: show welcome for unknown messages ──
            if (
              !isAuthenticated &&
              messageText !== "sync" &&
              messageText !== "sync web" &&
              messageText !== "login" &&
              messageText !== "login web" &&
              messageText !== "status" &&
              messageText !== "help" &&
              messageText !== "menu" &&
              messageText !== "command" &&
              messageText !== "commands" &&
              messageText !== "clear" &&
              messageText !== "edit" &&
              !incomingMessage.text?.body?.trim().match(/^ZOPY-\d{6}$/i)
            ) {
              if (phoneNumberId && userData.displayPhoneNumber) {
                const syncLink = await getOrCreateWhatsAppSyncLink(
                  userData.displayPhoneNumber,
                );
                sendWhatsAppButtonMessage({
                  to: userData.displayPhoneNumber,
                  phoneNumberId,
                  body: [
                    `${waBold("Welcome to Zopy!")} 🚀`,
                    `Send your ${waBold("PDF, Word, or image files")} here.`,
                    "",
                    `▸ ${waBold("Login")} › Connect to web to edit & print`,
                    `▸ ${waBold("Steps")} › See how it works`,
                    `▸ ${waBold("Help")} › View all commands`,
                  ].join("\n"),
                  buttons: [
                    { type: "reply", reply: { id: "login", title: "Login" } },
                    { type: "reply", reply: { id: "steps", title: "Steps" } },
                    { type: "reply", reply: { id: "help", title: "Help" } },
                  ],
                }).catch((err) => console.error("[welcome] send error:", err));
              }
              continue;
            }

            // No in-memory rate limiting here: backend runs on multiple instances.

            // ─── MOBILE APP SYNC (ZOPY-XXXXXX) ──────────────────────────────
            const mobileSyncMatch = incomingMessage.text?.body
              ?.trim()
              .match(/^ZOPY-(\d{6})$/i);
            if (
              mobileSyncMatch &&
              userData.displayPhoneNumber &&
              phoneNumberId
            ) {
              const otpCode = mobileSyncMatch[1]!;
              try {
                const syncRecord = await prisma.mobileSyncOtp.findUnique({
                  where: { otp: otpCode },
                });

                if (
                  !syncRecord ||
                  syncRecord.usedAt ||
                  syncRecord.expiresAt.getTime() < Date.now()
                ) {
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    message: `${waBold("Code expired")} ⏳\nPlease try again from the Zopy app.`,
                  });
                  continue;
                }

                // Create/find user for this phone
                let waUser = await prisma.whatsAppUser.findUnique({
                  where: { phoneNumber: userData.displayPhoneNumber },
                  select: { userId: true, phoneNumber: true },
                });

                let resolvedUserId: string;
                let token: string;

                if (waUser?.userId) {
                  // Already has a linked user — reuse
                  const generated = generateTokenForUser(
                    waUser.userId,
                    "customer",
                  );
                  resolvedUserId = generated.userId;
                  token = generated.token;
                } else {
                  // Create new user
                  const generated = generateUserToken();
                  resolvedUserId = generated.userId;
                  token = generated.token;

                  await prisma.user.upsert({
                    where: { id: resolvedUserId },
                    create: { id: resolvedUserId },
                    update: {},
                  });

                  // Link WhatsApp to user
                  await prisma.whatsAppUser.update({
                    where: { phoneNumber: userData.displayPhoneNumber },
                    data: { userId: resolvedUserId },
                  });

                  // Migrate any existing jobs
                  await prisma.printJob.updateMany({
                    where: { userMetadataId: userData.displayPhoneNumber },
                    data: { userId: resolvedUserId },
                  });
                }

                // Mark OTP as used and store credentials
                await prisma.mobileSyncOtp.update({
                  where: { id: syncRecord.id },
                  data: {
                    usedAt: new Date(),
                    phoneNumber: userData.displayPhoneNumber,
                    userId: resolvedUserId,
                    token,
                  },
                });

                // Send success with deep link to open the app
                const API_BASE = (
                  process.env.API_BASE_URL ??
                  process.env.FRONTEND_BASE_URL ??
                  "https://zopy.co.in"
                ).replace(/\/$/, "");
                const openAppUrl = `${API_BASE}/api/v1/auth/open-app?syncId=${syncRecord.syncId}`;

                await sendWhatsAppTextMessage({
                  to: userData.displayPhoneNumber,
                  phoneNumberId,
                  message: `${waBold("Synced successfully")} ✅\nYour Zopy app is now connected!\n\n👉 ${openAppUrl}`,
                });
              } catch (err) {
                console.error("[mobile-sync-otp] Error:", err);
                await sendWhatsAppTextMessage({
                  to: userData.displayPhoneNumber,
                  phoneNumberId,
                  message: `${waBold("Sync failed")} ❌\nPlease try again from the app.`,
                });
              }
              continue;
            }

            // (unauthenticated early-return handled above)

            if (
              messageText === "hi" ||
              messageText === "hello" ||
              messageText === "hey" ||
              messageText === "start"
            ) {
              if (phoneNumberId && userData.displayPhoneNumber) {
                await sendWhatsAppButtonMessage({
                  to: userData.displayPhoneNumber,
                  phoneNumberId,
                  body: [
                    `${waBold("Welcome to Zopy!")} 🚀`,
                    `Send your ${waBold("PDF, Word, or image files")} here.`,
                    "",
                    `▸ ${waBold("Login")} › Connect to web to edit & print`,
                    `▸ ${waBold("Steps")} › See how it works`,
                    `▸ ${waBold("Help")} › View all commands`,
                  ].join("\n"),
                  buttons: [
                    { type: "reply", reply: { id: "login", title: "Login" } },
                    { type: "reply", reply: { id: "steps", title: "Steps" } },
                    { type: "reply", reply: { id: "help", title: "Help" } },
                  ],
                });
              }
            } else if (messageText === "steps" || messageText === "guide") {
              if (phoneNumberId && userData.displayPhoneNumber) {
                await sendWhatsAppButtonMessage({
                  to: userData.displayPhoneNumber,
                  phoneNumberId,
                  body: [
                    `${waBold("How it works:")}`,
                    `1) Send documents`,
                    `2) Wait for confirmation`,
                    `3) Tap ${waBold("Edit")} to set print options & submit`,
                    "",
                    `_Send more files anytime before submitting._`,
                  ].join("\n"),
                  buttons: [
                    { type: "reply", reply: { id: "edit", title: "Edit" } },
                    { type: "reply", reply: { id: "status", title: "Current" } },
                    { type: "reply", reply: { id: "help", title: "Help" } },
                  ],
                });
              }
            } else if (
              messageText === "commands" ||
              messageText === "command" ||
              messageText === "help" ||
              messageText === "menu"
            ) {
              if (phoneNumberId && userData.displayPhoneNumber) {
                await sendWhatsAppButtonMessage({
                  to: userData.displayPhoneNumber,
                  phoneNumberId,
                  body: [
                    `${waBold("Here\u2019s what you can do:")}`,
                    `▸ ${waBold("Edit")} › set print options & submit`,
                    `▸ ${waBold("Current")} › check your print job`,
                    `▸ ${waBold("Steps")} › how it works`,
                    `▸ ${waBold("Login")} › connect WhatsApp to web`,
                    `▸ ${waBold("Clear")} › delete your draft`,
                    "",
                    `_Send files, then tap ${waBold("Edit")} when done._`,
                    ...(!isAuthenticated
                      ? [
                          "",
                          `🔗 *Login your WhatsApp:*`,
                          (await getOrCreateWhatsAppSyncLink(userData.displayPhoneNumber)) ??
                            `${FRONTEND_BASE_URL}/`,
                        ]
                      : []),
                  ].join("\n"),
                  buttons: [
                    { type: "reply", reply: { id: "edit", title: "Edit" } },
                    { type: "reply", reply: { id: "status", title: "Current" } },
                    { type: "reply", reply: { id: "steps", title: "Steps" } },
                  ],
                });
              }
            } else if (messageText === "history" || messageText === "histoy") {
              const jobs = await prisma.printJob.findMany({
                where: {
                  userMetadata: {
                    phoneNumber: userData.displayPhoneNumber,
                  },
                },
                select: {
                  id: true,
                  status: true,
                  createdAt: true,
                  verificationCode: true,
                },
                orderBy: {
                  createdAt: "desc",
                },
                take: 5,
              });
              console.log("Fetched user jobs for history command:", jobs);

              if (phoneNumberId && userData.displayPhoneNumber) {
                if (!jobs.length) {
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    message: `${waBold("No jobs found yet.")}\n_Send a document to create your first job._ \ud83d\udcc4`,
                    phoneNumberId,
                  });
                } else {
                  const lines = jobs.reverse().map((job, index) => {
                    const reviewUrl = buildReviewUrl(job.id);
                    const link = reviewUrl ?? "Link unavailable";
                    if (job.status === PrintJobStatus.DRAFT) {
                      return `${index + 1}) Draft \u2022 ${link}`;
                    }
                    const shortId = job.verificationCode ?? "Job";
                    return `${index + 1}) ${shortId} \u2022 ${job.status} \u2022 ${link}`;
                  });
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    message: `${waBold("Recent jobs")}\n\n${lines.join("\n")}`,
                    phoneNumberId,
                  });
                }
              }
            } else if (
              messageText === "current" ||
              messageText === "status" ||
              messageText === "merge"
            ) {
              const draftWhere = await getUnifiedDraftWhere(
                userData.displayPhoneNumber,
              );
              const draftJob = await prisma.printJob.findFirst({
                where: draftWhere,
                include: {
                  files: {
                    select: {
                      name: true,
                      pages: true,
                      option: true,
                    },
                  },
                },
              });

              if (phoneNumberId && userData.displayPhoneNumber) {
                if (!draftJob || draftJob.files.length === 0) {
                  await sendWhatsAppButtonMessage({
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    body: [
                      `${waBold("No files added yet.")}`,
                      `_Send your documents and type ${waBold('"EDIT"')} when done._`,
                      ...(!isAuthenticated
                        ? [
                            "",
                            `*Login to edit on the web:*`,
                            (await getOrCreateWhatsAppSyncLink(userData.displayPhoneNumber)) ??
                              `${FRONTEND_BASE_URL}/`,
                          ]
                        : []),
                    ].join("\n"),
                    buttons: [
                      { type: "reply", reply: { id: "help", title: "Help" } },
                      { type: "reply", reply: { id: "steps", title: "Steps" } },
                      { type: "reply", reply: { id: "login", title: "Login" } },
                    ],
                  });
                } else {
                  const fileLines = draftJob.files.map(
                    (file, index) => `${index + 1}. ${file.name}`,
                  );

                  await sendWhatsAppButtonMessage({
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    body: [
                      `${waBold("Your current documents:")}`,
                      ...fileLines,
                      `_Send more · Type ${waBold('"EDIT"')} to continue_`,
                      ...(!isAuthenticated
                        ? [
                            "",
                            `*Login to edit on the web:*`,
                            (await getOrCreateWhatsAppSyncLink(userData.displayPhoneNumber)) ??
                              `${FRONTEND_BASE_URL}/`,
                          ]
                        : []),
                    ].join("\n"),
                    buttons: [
                      { type: "reply", reply: { id: "edit", title: "Edit" } },
                      { type: "reply", reply: { id: "help", title: "Help" } },
                    ],
                  });
                }
              }
            } else if (messageText === "clear" || messageText === "discard") {
              const clearWhere = await getUnifiedDraftWhere(
                userData.displayPhoneNumber,
              );
              const existingJob = await prisma.printJob.findFirst({
                where: clearWhere,
                include: {
                  files: {
                    select: {
                      id: true,
                      url: true,
                    },
                  },
                },
              });

              if (!existingJob) {
                console.log("No print job found to discard.");
                if (phoneNumberId && userData.displayPhoneNumber) {
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    message: [
                      `${waBold("Draft cleared.")} \u2713`,
                      `_Send files to start a new printout._`,
                    ].join("\n"),
                    phoneNumberId,
                  });
                }
                continue;
              }

              await prisma.printJob.update({
                where: {
                  id: existingJob.id,
                },
                data: {
                  expired: true,
                },
              });

              const fileIds = existingJob.files.map((f: any) => f.id);
              if (fileIds.length > 0) {
                await prisma.file.updateMany({
                  where: { id: { in: fileIds } },
                  data: { url: "" },
                });
              }

              await Promise.all(
                existingJob.files.map((file) =>
                  deleteObjectFromR2ByUrl(file.url),
                ),
              );

              if (phoneNumberId && userData.displayPhoneNumber) {
                await sendWhatsAppButtonMessage({
                  to: userData.displayPhoneNumber,
                  phoneNumberId,
                  body: [
                    `${waBold("Draft cleared.")} \u2713`,
                    `_Send files to start a new printout._`,
                  ].join("\n"),
                  buttons: [
                    { type: "reply", reply: { id: "status", title: "Current" } },
                    { type: "reply", reply: { id: "help", title: "Help" } },
                  ],
                });
              }
            } else if (messageText === "edit") {
              console.log(
                userData.displayPhoneNumber,
                "is trying to edit their job.",
              );
              // Read from file cache instead of DB — instant, no round-trip
              if (isFileStillProcessing(userData.displayPhoneNumber)) {
                if (phoneNumberId && userData.displayPhoneNumber) {
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    message: `${waBold("Still receiving your file")}
  Please wait a few seconds, then tap \"Edit job\" again.`,
                    phoneNumberId,
                  });
                }
                continue;
              }

              const editWhere = await getUnifiedDraftWhere(
                userData.displayPhoneNumber.toString(),
              );
              const existingJob = await prisma.printJob.findFirst({
                where: editWhere,
                select: {
                  id: true,
                },
              });
              console.log(
                "Fetched existing draft job for edit command:",
                existingJob,
              );
              if (!existingJob) {
                if (phoneNumberId && userData.displayPhoneNumber) {
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    message: [
                      `${waBold("No documents found.")}`,
                      `_Send files first, then type ${waBold('"EDIT"')}._`,
                    ].join("\n"),
                    phoneNumberId,
                  });
                }
                continue;
              }

              const reviewUrl = buildReviewUrl(existingJob.id);
              if (phoneNumberId && userData.displayPhoneNumber) {
                if (!reviewUrl) {
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    message: `${waBold("Review link unavailable")}\nPlease try again later.`,
                    phoneNumberId,
                  });
                } else {
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    message: [
                      `${waBold("Customize your printout:")}`,
                      reviewUrl,
                      `_Edit options, confirm, and submit._`,
                    ].join("\n"),
                    });
                }
              }
            } else if (messageText === "login" || messageText === "login web" || messageText === "sync" || messageText === "sync web") {
              const isFromWeb = messageText === "login web" || messageText === "sync web";
              if (!FRONTEND_BASE_URL) {
                if (phoneNumberId && userData.displayPhoneNumber) {
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    message:
                      "*Login link unavailable* \u26a0\ufe0f\n\nPlease try again later.",
                    phoneNumberId,
                  });
                }
                continue;
              }

              if (userData.displayPhoneNumber) {
                // Ensure WhatsAppUser exists BEFORE creating the OTP
                // (the earlier upsert is fire-and-forget and may not have completed yet)
                await prisma.whatsAppUser.upsert({
                  where: { phoneNumber: userData.displayPhoneNumber },
                  create: {
                    phoneNumber: userData.displayPhoneNumber,
                    name: userData.displayName || null,
                    lastMessageAt: new Date(),
                  },
                  update: {},
                  select: { phoneNumber: true },
                });

                let loginUrl = await getOrCreateWhatsAppSyncLink(
                  userData.displayPhoneNumber,
                );
                // If sync was initiated from the website, append source=web
                // so the OTP page redirects back to home instead of WhatsApp
                if (loginUrl && isFromWeb) {
                  const separator = loginUrl.includes("?") ? "&" : "?";
                  loginUrl = `${loginUrl}${separator}source=web`;
                }
                if (phoneNumberId) {
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    message: [
                      `${waBold("Tap the link below to login:")}`,
                      loginUrl ?? "Link unavailable",
                    ].join("\n"),
                  });
                }
              }
            } else {
              if (phoneNumberId && userData.displayPhoneNumber) {
                await sendWhatsAppButtonMessage({
                  to: userData.displayPhoneNumber,
                  phoneNumberId,
                  body: [
                    `${waBold("Welcome to Zopy!")} 🚀`,
                    `Send your ${waBold("PDF, Word, or image files")} here.`,
                    "",
                    `▸ ${waBold("Login")} › Connect to web to edit & print`,
                    `▸ ${waBold("Steps")} › See how it works`,
                    `▸ ${waBold("Help")} › View all commands`,
                  ].join("\n"),
                  buttons: [
                    { type: "reply", reply: { id: "login", title: "Login" } },
                    { type: "reply", reply: { id: "steps", title: "Steps" } },
                    { type: "reply", reply: { id: "help", title: "Help" } },
                  ],
                });
              }
            }
          }
        }
      }
    }
  }

  } catch (err) {
    console.error("[webhook] Unhandled error in async processing:", err);
  }
  })();
};
