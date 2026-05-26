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
import { PrintJobStatus } from "../../../../packages/db/dist/generated/prisma/enums.js";
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

const BATCH_WINDOW_MS = 5000;

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
  
  // Cross-process synchronization: only send one message per 4s window
  if (now - lastSentAt < 4000) {
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
  let fileList: { name: string; pages: number }[] = [];
  
  if (batch.jobId) {
    try {
      const dbFiles = await prisma.file.findMany({
        where: { printJobId: batch.jobId },
        orderBy: { createdAt: "asc" },
        select: { name: true, pages: true },
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
    return `${i + 1}. ${friendlyFileName(f.name)} \u2022 ${f.pages} pg`;
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

              // Send sticker IMMEDIATELY — coordinate via DB
                const waUserForSticker = await prisma.whatsAppUser.findUnique({
                  where: { phoneNumber: userData.displayPhoneNumber },
                  select: { lastUploadStickerSentAt: true },
                });
                const lastStickerSentAt = waUserForSticker?.lastUploadStickerSentAt?.getTime() || 0;

                if (phoneNumberId && userData.displayPhoneNumber && (Date.now() - lastStickerSentAt > 15000)) {
                  await prisma.whatsAppUser.update({
                    where: { phoneNumber: userData.displayPhoneNumber },
                    data: { lastUploadStickerSentAt: new Date() },
                  }).catch(() => {});

                  sendWhatsAppStickerFromFile({
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    filePath: UPLOAD_STICKER_FILE_PATH,
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

                const response = await fetch(incomingMessage.document.url, {
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                  },
                });

                if (!response.ok) {
                  console.log(
                    "Failed to download WhatsApp document:",
                    response.status,
                  );
                  if (phoneNumberId && userData.displayPhoneNumber) {
                    await sendWhatsAppTextMessage({
                      to: userData.displayPhoneNumber,
                      message: `${waBold("Upload failed")}
Couldn't download ${waBold(rawFileName)}.
Please try sending the file again.`,
                      phoneNumberId,
                    });
                  }
                  continue;
                }

                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                // NEW: Handle Word files
                /*
                if (isWordFile) {
                  console.log(`Converting Word file: ${rawFileName}`);
                  try {
                    const converted = await convertToPdfFromBuffer(
                      buffer,
                      rawFileName,
                    );
                    // Use the same name as input file but with .pdf extension.
                    // WhatsApp sometimes repeats extensions like: file.docx.doc.docx
                    let baseName = (rawFileName || "document").trim();
                    if (!baseName) baseName = "document";
                  while (/\.(docx|doc)$/i.test(baseName)) {
                      baseName = baseName.replace(/\.(docx|doc)$/i, "");
                    }
                    if (!baseName.trim()) baseName = "document";
                    const pdfFileName = `${baseName}.pdf`;

                    if (phoneNumberId && userData.displayPhoneNumber) {
                      await sendWhatsAppPdfDocument({
                        to: userData.displayPhoneNumber,
                        phoneNumberId,
                        buffer: converted.pdfBuffer,
                        fileName: pdfFileName,
                      });
                      console.log(`Sent converted PDF to user: ${pdfFileName}`);
                    }
                  } catch (conversionError) {
                    console.error("Word to PDF conversion failed:", conversionError);
                    if (phoneNumberId && userData.displayPhoneNumber) {
                      await sendWhatsAppTextMessage({
                        to: userData.displayPhoneNumber,
                        message: `${waBold("Conversion failed")}
Couldn't convert ${waBold(rawFileName)} to PDF.
Please try again or send a different file.`,
                        phoneNumberId,
                      });
                    }
                  }
                  continue;
                }
                */

                let pdfBuffer: Buffer = buffer;
                let pdfFileName = rawFileName.toLowerCase().endsWith(".pdf")
                  ? rawFileName
                  : `${rawFileName}.pdf`;

                if (!isPdf) {
                  const converted = await convertToPdfFromBuffer(
                    buffer,
                    rawFileName,
                  );
                  pdfBuffer = converted.pdfBuffer;
                  pdfFileName = converted.pdfFileName;
                }

                const pages = await getPdfPageCountFromBuffer(pdfBuffer);

                const key = buildR2ObjectKey(
                  userData.displayPhoneNumber || "whatsapp",
                  pdfFileName,
                );
                const uploaded = await uploadBufferToR2({
                  key,
                  buffer: pdfBuffer,
                  contentType: "application/pdf",
                });

                const defaultOptions: PrintOptions = {
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
                const cost = calculateFileCost(pages, defaultOptions);

                // Look up the WhatsApp user to check if they're synced (have a userId)
                const waUser = await prisma.whatsAppUser.findUnique({
                  where: { phoneNumber: userData.displayPhoneNumber },
                  select: { phoneNumber: true, userId: true },
                });

                if (!waUser) {
                  throw new Error("WhatsApp user record not found.");
                }

                // Find existing draft: prefer userId-based lookup (unified), fall back to userMetadataId
                let existingJob: {
                  id: string;
                  totalCost: number;
                  totalPages: number;
                  userId: string | null;
                  files: { createdAt: Date }[];
                  _count?: { files: number };
                } | null = null;

                if (waUser.userId) {
                  existingJob = await prisma.printJob.findFirst({
                    where: {
                      userId: waUser.userId,
                      status: PrintJobStatus.DRAFT,
                      expired: false,
                    },
                    select: {
                      id: true,
                      totalCost: true,
                      totalPages: true,
                      userId: true,
                      _count: { select: { files: true } },
                      files: {
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        select: { createdAt: true },
                      },
                    },
                  });
                }

                if (!existingJob) {
                  existingJob = await prisma.printJob.findFirst({
                    where: {
                      userMetadata: {
                        phoneNumber: userData.displayPhoneNumber,
                      },
                      status: PrintJobStatus.DRAFT,
                      expired: false,
                    },
                    select: {
                      id: true,
                      totalCost: true,
                      totalPages: true,
                      userId: true,
                      _count: { select: { files: true } },
                      files: {
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        select: { createdAt: true },
                      },
                    },
                  });
                }

                if (
                  existingJob &&
                  existingJob._count &&
                  existingJob._count.files >= 30
                ) {
                  // Only send the limit message once per 30 seconds to avoid rate limits
                  const lastSent = limitReachedSent.get(userData.displayPhoneNumber || "") ?? 0;
                  const now = Date.now();
                  if (phoneNumberId && userData.displayPhoneNumber && now - lastSent > 30000) {
                    limitReachedSent.set(userData.displayPhoneNumber, now);
                    sendWhatsAppButtonMessage({
                      to: userData.displayPhoneNumber,
                      phoneNumberId,
                      body: [
                        `${waBold("Limit reached")}`,
                        `You already have ${existingJob._count.files} files in your draft (max 30).`,
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
                      existingJob.id,
                      "Limit reached: Maximum 30 files allowed per job.",
                    );
                  }
                  continue;
                }

                let printJobId: string;

                if (!existingJob) {
                  // Create a new unified draft
                  const createData: any = {
                    totalCost: cost,
                    totalPages: pages,
                    estimatedTime: 0,
                    source: "WHATSAPP",
                    status: PrintJobStatus.DRAFT,
                    userMetadata: {
                      connect: { phoneNumber: waUser.phoneNumber },
                    },
                  };
                  if (waUser.userId) {
                    createData.user = { connect: { id: waUser.userId } };
                  }

                  const newJob = await prisma.printJob.create({
                    data: createData,
                  });
                  printJobId = newJob.id;
                } else {
                  printJobId = existingJob.id;

                  // If draft exists but doesn't have userId yet, attach it now
                  if (waUser.userId && !existingJob.userId) {
                    await prisma.printJob.update({
                      where: { id: existingJob.id },
                      data: { userId: waUser.userId },
                    });
                  }

                  const nextTotalPages = (existingJob.totalPages ?? 0) + pages;
                  const nextTotalCost = (existingJob.totalCost ?? 0) + cost;
                  await prisma.printJob.update({
                    where: {
                      id: existingJob.id,
                    },
                    data: {
                      totalPages: nextTotalPages,
                      totalCost: nextTotalCost,
                      estimatedTime: 0,
                    },
                  });
                }

                await prisma.file.create({
                  data: {
                    name: pdfFileName,
                    mimeType: "application/pdf",
                    messageId: incomingMessage.id,
                    pages,
                    url: uploaded.url,
                    printJobId: printJobId,
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
                    pages,
                    isSynced: !!waUser.userId,
                    jobId: printJobId,
                    userId: waUser.userId ?? null,
                  });
                }
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

              // Send sticker IMMEDIATELY — coordinate via DB
                const waUserForSticker = await prisma.whatsAppUser.findUnique({
                  where: { phoneNumber: userData.displayPhoneNumber },
                  select: { lastUploadStickerSentAt: true },
                });
                const lastStickerSentAt = waUserForSticker?.lastUploadStickerSentAt?.getTime() || 0;

                if (phoneNumberId && userData.displayPhoneNumber && (Date.now() - lastStickerSentAt > 15000)) {
                  await prisma.whatsAppUser.update({
                    where: { phoneNumber: userData.displayPhoneNumber },
                    data: { lastUploadStickerSentAt: new Date() },
                  }).catch(() => {});

                  sendWhatsAppStickerFromFile({
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    filePath: UPLOAD_STICKER_FILE_PATH,
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
                // Step 1: Get the media URL from the image ID
                const mediaUrlRes = await fetch(
                  `https://graph.facebook.com/v21.0/${imageData.id}`,
                  { headers: { Authorization: `Bearer ${accessToken}` } },
                );
                if (!mediaUrlRes.ok) {
                  console.log(
                    "Failed to get media URL for image:",
                    mediaUrlRes.status,
                  );
                  continue;
                }
                const mediaUrlData = (await mediaUrlRes.json()) as {
                  url?: string;
                };
                const imageUrl = mediaUrlData.url;
                if (!imageUrl) {
                  console.log("No URL in media response for image.");
                  continue;
                }

                // Step 2: Download the image binary
                const imageResponse = await fetch(imageUrl, {
                  headers: { Authorization: `Bearer ${accessToken}` },
                });
                if (!imageResponse.ok) {
                  console.log(
                    "Failed to download WhatsApp image:",
                    imageResponse.status,
                  );
                  if (phoneNumberId && userData.displayPhoneNumber) {
                    await sendWhatsAppTextMessage({
                      to: userData.displayPhoneNumber,
                      message: `${waBold("Upload failed")}\nCouldn't download the image. Please try sending it again.`,
                      phoneNumberId,
                    });
                  }
                  continue;
                }

                const imageArrayBuffer = await imageResponse.arrayBuffer();
                const imageBuffer = Buffer.from(imageArrayBuffer);

                // Step 3: Generate a filename based on mime type
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

                // Step 4: Convert image to PDF
                const converted = await convertToPdfFromBuffer(
                  imageBuffer,
                  rawFileName,
                );
                const pdfBuffer = converted.pdfBuffer;
                const pdfFileName = converted.pdfFileName;

                console.log(
                  `Image converted to PDF: ${rawFileName} → ${pdfFileName}`,
                );

                // Images always produce exactly 1 page; skip pdf-parse
                const pages = 1;

                const startedProcessingAt = new Date();
                if (userData.displayPhoneNumber) {
                  // Instant: update file-backed tracking cache (no DB round-trip)
                  trackFileProcessingStarted(userData.displayPhoneNumber);

                  // Fire-and-forget: persist to DB in background
                  prisma.whatsAppUser.upsert({
                    where: { phoneNumber: userData.displayPhoneNumber },
                    create: {
                      phoneNumber: userData.displayPhoneNumber,
                      name: userData.displayName || null,
                      lastFileStartedProcessingAt: startedProcessingAt,
                    },
                    update: {
                      name: userData.displayName || null,
                      lastFileStartedProcessingAt: startedProcessingAt,
                    },
                    select: { phoneNumber: true },
                  }).catch(() => { /* non-critical */ });
                }

                const key = buildR2ObjectKey(
                  userData.displayPhoneNumber || "whatsapp",
                  pdfFileName,
                );
                const uploaded = await uploadBufferToR2({
                  key,
                  buffer: pdfBuffer,
                  contentType: "application/pdf",
                });

                const defaultOptions: PrintOptions = {
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
                const cost = calculateFileCost(pages, defaultOptions);

                const waUser = await prisma.whatsAppUser.findUnique({
                  where: { phoneNumber: userData.displayPhoneNumber },
                  select: { phoneNumber: true, userId: true },
                });

                if (!waUser) {
                  throw new Error("WhatsApp user record not found.");
                }

                let existingJob: {
                  id: string;
                  totalCost: number;
                  totalPages: number;
                  userId: string | null;
                  files: { createdAt: Date }[];
                  _count?: { files: number };
                } | null = null;

                if (waUser.userId) {
                  existingJob = await prisma.printJob.findFirst({
                    where: {
                      userId: waUser.userId,
                      status: PrintJobStatus.DRAFT,
                      expired: false,
                    },
                    select: {
                      id: true,
                      totalCost: true,
                      totalPages: true,
                      userId: true,
                      _count: { select: { files: true } },
                      files: {
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        select: { createdAt: true },
                      },
                    },
                  });
                }

                if (
                  existingJob &&
                  existingJob._count &&
                  existingJob._count.files >= 30
                ) {
                  if (phoneNumberId && userData.displayPhoneNumber) {
                    await sendWhatsAppButtonMessage({
                      to: userData.displayPhoneNumber,
                      phoneNumberId,
                      body: [
                        `${waBold("Limit reached")}`,
                        `You already have ${existingJob._count.files} files in your draft (max 30).`,
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

                if (existingJob) {
                  // Update existing draft totals
                  await prisma.printJob.update({
                    where: { id: existingJob.id },
                    data: {
                      totalCost: existingJob.totalCost + cost,
                      totalPages: existingJob.totalPages + pages,
                    },
                  });

                  // Create the file separately
                  await prisma.file.create({
                    data: {
                      name: pdfFileName,
                      url: uploaded.url,
                      pages,
                      fileCost: cost,
                      printJobId: existingJob.id,
                      uploadedByPhoneNumber:
                        userData.displayPhoneNumber || null,
                      uploadedByDisplayName:
                        userData.displayName ||
                        userData.displayPhoneNumber ||
                        null,
                      uploadedByUserId: waUser.userId ?? null,
                      uploadedByRole: "OWNER",
                      option: { create: defaultOptions },
                    },
                  });
                } else if (waUser.userId) {
                  // No verificationCode for drafts — OTP is generated on submission from the web.
                  const newJob = await prisma.printJob.create({
                    data: {
                      userId: waUser.userId,
                      totalCost: cost,
                      totalPages: pages,
                      estimatedTime: 1,
                      source: "WHATSAPP",
                      status: PrintJobStatus.DRAFT,
                    },
                  });

                  await prisma.file.create({
                    data: {
                      name: pdfFileName,
                      url: uploaded.url,
                      pages,
                      fileCost: cost,
                      printJobId: newJob.id,
                      uploadedByPhoneNumber:
                        userData.displayPhoneNumber || null,
                      uploadedByDisplayName:
                        userData.displayName ||
                        userData.displayPhoneNumber ||
                        null,
                      uploadedByUserId: waUser.userId ?? null,
                      uploadedByRole: "OWNER",
                      option: { create: defaultOptions },
                    },
                  });

                  existingJob = { ...newJob, files: [], _count: { files: 0 } };
                }

                // Queue confirmation — batched with other files arriving within 3s
                if (phoneNumberId && userData.displayPhoneNumber && existingJob) {
                  queueFileConfirmation({
                    phoneNumber: userData.displayPhoneNumber,
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    fileName: pdfFileName,
                    pages,
                    isSynced: !!waUser?.userId,
                    jobId: existingJob.id,
                    userId: waUser.userId ?? null,
                  });
                }
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
                        `✅ *Coupon Valid!*`,
                        ``,
                        `🏪 Brand: *${result.coupon.brandName}*`,
                        `💰 Discount: *${discountText}*`,
                        `${result.coupon.description ? `📝 ${result.coupon.description}` : ""}`,
                        `📅 Valid until: ${result.coupon.validUntil.toLocaleDateString("en-IN")}`,
                        ``,
                        `Tap below to redeem this coupon.`,
                      ].join("\n"),
                      buttons: [
                        { type: "reply", reply: { id: `redeem:${code}`, title: "🎉 Redeem Coupon" } },
                      ],
                    });
                  } else {
                    await sendWhatsAppTextMessage({
                      to: userData.displayPhoneNumber,
                      phoneNumberId,
                      message: result.message,
                    });
                  }
                } else if (redeemMatch) {
                  const code = (redeemMatch[1] || "").trim();
                  const result = await redeemCoupon(code, userData.displayPhoneNumber);

                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    message: result.message,
                  });
                }
              } catch (err) {
                console.error("[coupon-webhook] Error:", err);
                await sendWhatsAppTextMessage({
                  to: userData.displayPhoneNumber,
                  phoneNumberId,
                  message: "❌ Something went wrong processing the coupon. Please try again.",
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
                    `${waBold("Sync to edit your draft")} 🔗`,
                    `Your files are saved! To set print options & submit, sync first:`,
                    "",
                    syncLink ?? "https://zopy.co.in",
                    "",
                    `_Open this link in your browser to sync, then you'll be redirected to edit your draft._`,
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

            // ── For unsynced users: show welcome for unknown messages ──
            if (
              !isAuthenticated &&
              messageText !== "sync" &&
              messageText !== "sync web" &&
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
                    `▸ ${waBold("Sync")} › Connect to web to edit & print`,
                    `▸ ${waBold("Steps")} › See how it works`,
                    `▸ ${waBold("Help")} › View all commands`,
                  ].join("\n"),
                  buttons: [
                    { type: "reply", reply: { id: "sync", title: "Sync" } },
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
                    `▸ ${waBold("Sync")} › Connect to web to edit & print`,
                    `▸ ${waBold("Steps")} › See how it works`,
                    `▸ ${waBold("Help")} › View all commands`,
                  ].join("\n"),
                  buttons: [
                    { type: "reply", reply: { id: "sync", title: "Sync" } },
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
                    `▸ ${waBold("Sync")} › connect WhatsApp to web`,
                    `▸ ${waBold("Clear")} › delete your draft`,
                    "",
                    `_Send files, then tap ${waBold("Edit")} when done._`,
                    ...(!isAuthenticated
                      ? [
                          "",
                          `\ud83d\udd17 *Sync your WhatsApp:*`,
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
                            `*Sync to edit on the web:*`,
                            (await getOrCreateWhatsAppSyncLink(userData.displayPhoneNumber)) ??
                              `${FRONTEND_BASE_URL}/`,
                          ]
                        : []),
                    ].join("\n"),
                    buttons: [
                      { type: "reply", reply: { id: "help", title: "Help" } },
                      { type: "reply", reply: { id: "steps", title: "Steps" } },
                      { type: "reply", reply: { id: "sync", title: "Sync" } },
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
                            `*Sync to edit on the web:*`,
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
            } else if (messageText === "sync" || messageText === "sync web") {
              const isFromWeb = messageText === "sync web";
              if (!FRONTEND_BASE_URL) {
                if (phoneNumberId && userData.displayPhoneNumber) {
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    message:
                      "*Sync link unavailable* \u26a0\ufe0f\n\nPlease try again later.",
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
                      `${waBold("Tap the link below to sync:")}`,
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
                    `▸ ${waBold("Sync")} › Connect to web to edit & print`,
                    `▸ ${waBold("Steps")} › See how it works`,
                    `▸ ${waBold("Help")} › View all commands`,
                  ].join("\n"),
                  buttons: [
                    { type: "reply", reply: { id: "sync", title: "Sync" } },
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
