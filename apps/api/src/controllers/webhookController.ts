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
  sendWhatsAppPdfDocument,
} from "../modules/whatsappServices.js";
import { getPdfPageCountFromBuffer } from "../utils/pdfPageCount.js";
import {
  buildR2ObjectKey,
  deleteObjectFromR2ByUrl,
  uploadBufferToR2,
} from "../utils/r2Storage.js";
import { convertToPdfFromBuffer } from "../utils/convertToPdf.js";
import { PrintJobStatus } from "../../../../packages/db/dist/generated/prisma/enums.js";
import socket from "../config/socket.js";

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
      where: { userId: waUser.userId, status: PrintJobStatus.DRAFT },
      select: { id: true },
    });
    if (byUser) {
      return { userId: waUser.userId, status: PrintJobStatus.DRAFT };
    }
  }

  // Fall back to phone-number-based lookup
  return {
    userMetadata: { phoneNumber },
    status: PrintJobStatus.DRAFT,
  };
}

async function generateWhatsAppSyncLink(phoneNumber: string): Promise<string | null> {
  if (!FRONTEND_BASE_URL) {
    return null;
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 2 * 60_000);
  await prisma.whatsAppLoginOtp.deleteMany({ where: { phoneNumber } });
  await prisma.whatsAppLoginOtp.create({
    data: { code, phoneNumber, expiresAt },
  });
  return `${FRONTEND_BASE_URL}/auth/otp?code=${code}`;
}

async function getOrCreateWhatsAppSyncLink(
  phoneNumber: string,
): Promise<string | null> {
  if (!FRONTEND_BASE_URL) {
    return null;
  }
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
    return `${FRONTEND_BASE_URL}/auth/otp?code=${active.code}`;
  }
  return generateWhatsAppSyncLink(phoneNumber);
}

const STICKER_FILE_PATH = fileURLToPath(
  new URL("../resource/stickerzopy.webp", import.meta.url),
);

// ─── WhatsApp Message Rate Limiter & File Confirmation Batcher ──────────────
// Prevents hitting WhatsApp API rate limits when users send many files at once.

interface PendingFileConfirmation {
  fileName: string;
  pages: number;
}

interface PendingFileBatch {
  files: PendingFileConfirmation[];
  timer: ReturnType<typeof setTimeout>;
  phoneNumberId: string;
  isStale: boolean;
  jobId: string | null;
  userId: string | null;
}

const FILE_BATCH_DELAY_MS = 3000; // Wait 3s for more files before sending
const LIMIT_REACHED_MAX = 2; // Max 2 "limit reached" messages per draft per window
const LIMIT_REACHED_WINDOW_MS = 60_000; // 1-minute window for limit-reached reset
const COMMAND_WINDOW_MS = 60_000; // 60-second sliding window for command tracking
const COMMAND_SPAM_THRESHOLD = 15; // Send spam warning at this count

// Per-phone pending file batches
const pendingFileBatches = new Map<string, PendingFileBatch>();

// Per-DRAFT-JOB "limit reached" tracking (time-bound)
const limitReachedPerDraft = new Map<string, { count: number; windowStart: number }>();

// Per-phone command frequency tracking within a sliding window
// Tracks how many times EACH command appeared in the current window
interface CommandWindowEntry {
  counts: Map<string, number>; // command → count in this window
  windowStart: number;
  warningSent: boolean; // only send 1 spam warning per window total
}
const commandFrequencyTracker = new Map<string, CommandWindowEntry>();

/** Queue a file confirmation. After FILE_BATCH_DELAY_MS of inactivity, flush the batch. */
function queueFileConfirmation(
  phone: string,
  phoneNumberId: string,
  file: PendingFileConfirmation,
  isStale: boolean,
  jobId: string | null,
  userId: string | null,
) {
  const existing = pendingFileBatches.get(phone);

  if (existing) {
    existing.files.push(file);
    existing.isStale = existing.isStale || isStale;
    existing.jobId = jobId ?? existing.jobId;
    existing.userId = userId ?? existing.userId;
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => flushFileConfirmation(phone), FILE_BATCH_DELAY_MS);
  } else {
    const timer = setTimeout(() => flushFileConfirmation(phone), FILE_BATCH_DELAY_MS);
    pendingFileBatches.set(phone, {
      files: [file],
      timer,
      phoneNumberId,
      isStale,
      jobId,
      userId,
    });
  }
}

/** Send the batched file confirmation message. */
async function flushFileConfirmation(phone: string) {
  const batch = pendingFileBatches.get(phone);
  if (!batch || batch.files.length === 0) {
    pendingFileBatches.delete(phone);
    return;
  }
  pendingFileBatches.delete(phone);

  try {
    let bodyText: string;
    if (batch.files.length === 1) {
      const f = batch.files[0]!;
      bodyText = [
        `${waBold("File received!")}`,
        `${f.fileName} \u2022 ${f.pages} page(s)`,
        "What would you like to do next?",
      ].join("\n");
    } else {
      const fileList = batch.files
        .map((f, i) => `${i + 1}. ${f.fileName} (${f.pages}p)`)
        .join("\n");
      bodyText = [
        `${waBold(`${batch.files.length} files received!`)}`,
        fileList,
        "",
        "What would you like to do next?",
      ].join("\n");
    }

    await sendWhatsAppButtonMessage({
      to: phone,
      phoneNumberId: batch.phoneNumberId,
      body: bodyText,
      buttons: [
        { type: "reply", reply: { id: "edit", title: "EDIT" } },
        { type: "reply", reply: { id: "current", title: "STATUS" } },
      ],
    });

    // Send stale warning once (not per file)
    if (batch.isStale && batch.jobId) {
      const oldFiles = await prisma.file.findMany({
        where: {
          printJobId: batch.jobId,
          createdAt: { lt: new Date(Date.now() - 30 * 60 * 1000) },
        },
        select: { name: true },
        orderBy: { createdAt: "asc" },
      });
      if (oldFiles.length > 0) {
        const oldFileList = oldFiles.map((f, i) => `${i + 1}. ${f.name}`).join("\n");
        await sendWhatsAppButtonMessage({
          to: phone,
          phoneNumberId: batch.phoneNumberId,
          body: [
            `${waBold("Existing Files Found")} \u26a0\ufe0f`,
            "Your draft contains old files (30+ min ago):",
            oldFileList,
            "",
            `Type ${waBold('"EDIT"')} to visit the website and remove unwanted files using the ${waBold("\u2715 button")}.`,
          ].join("\n"),
          buttons: [
            { type: "reply", reply: { id: "edit", title: "EDIT" } },
          ],
        });
      }
    }
  } catch (err) {
    console.error("Failed to send batched file confirmation:", err);
  }
}

/**
 * Returns true if a "limit reached" message should be sent for this draft.
 * Time-bound: resets after 1 minute, max 2 per window.
 */
function shouldSendLimitReached(draftJobId: string): boolean {
  const now = Date.now();
  const entry = limitReachedPerDraft.get(draftJobId);

  if (!entry || now - entry.windowStart > LIMIT_REACHED_WINDOW_MS) {
    // New or expired window
    limitReachedPerDraft.set(draftJobId, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count < LIMIT_REACHED_MAX) {
    entry.count++;
    return true;
  }

  return false; // Already told them twice in this minute
}

/**
 * Per-command frequency-aware rate limiter for text/interactive replies.
 *
 * Tracks how many times EACH command appeared in a 60-second window:
 *   - 1st occurrence of any command → "reply" (normal)
 *   - 2nd–14th of the SAME command → "skip" (silent, no message sent)
 *   - 15th of ANY command → "warn" (spam warning, only once per window)
 *   - 16th+ → "skip"
 *
 * Example with user spamming "hi" + "help" + "steps" simultaneously:
 *   hi(1st)→reply, help(1st)→reply, steps(1st)→reply,
 *   hi(2nd)→skip, help(2nd)→skip, hi(3rd)→skip, ...
 *   hi(15th)→warn, hi(16th)→skip, help(15th)→skip (warning already sent)
 */
function checkTextRateLimit(
  phone: string,
  messageText: string,
): "reply" | "warn" | "skip" {
  const now = Date.now();
  let entry = commandFrequencyTracker.get(phone);

  // Reset window if expired
  if (!entry || now - entry.windowStart > COMMAND_WINDOW_MS) {
    entry = { counts: new Map(), windowStart: now, warningSent: false };
    commandFrequencyTracker.set(phone, entry);
  }

  const currentCount = (entry.counts.get(messageText) ?? 0) + 1;
  entry.counts.set(messageText, currentCount);

  // 1st occurrence of this specific command → reply normally
  if (currentCount === 1) {
    return "reply";
  }

  // At spam threshold → send warning (only once per window across all commands)
  if (currentCount >= COMMAND_SPAM_THRESHOLD && !entry.warningSent) {
    entry.warningSent = true;
    return "warn";
  }

  // 2nd to 14th, or 15th+ after warning already sent → skip silently
  return "skip";
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
  console.log(JSON.stringify(req.body, null, 2));
  if (!req.body || !req.body.entry) {
    console.error("Invalid webhook payload");
    return res.sendStatus(400);
  }

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

            // ─── DOCUMENT HANDLER ────────────────────────────────────────────
            if (incomingMessage.type === "document") {
              const mimeType = incomingMessage.document?.mime_type || "";
              console.log("Received document:", incomingMessage.document);

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

              try {
                if (userData.displayPhoneNumber) {
                  const timestampSeconds = Number(incomingMessage.timestamp);
                  const startedProcessingAt = Number.isFinite(timestampSeconds)
                    ? new Date(timestampSeconds * 1000)
                    : new Date();

                  await prisma.whatsAppUser.upsert({
                    where: {
                      phoneNumber: userData.displayPhoneNumber,
                    },
                    create: {
                      phoneNumber: userData.displayPhoneNumber,
                      name: userData.displayName || null,
                      lastFileStartedProcessingAt: startedProcessingAt,
                    },
                    update: {
                      name: userData.displayName || null,
                      lastFileStartedProcessingAt: startedProcessingAt,
                    },
                    select: {
                      phoneNumber: true,
                    },
                  });
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
                      userMetadata: { phoneNumber: userData.displayPhoneNumber },
                      status: PrintJobStatus.DRAFT,
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

                if (existingJob && existingJob._count && existingJob._count.files >= 30) {
                  // Rate-limit "limit reached" per draft (max 2 per draft lifetime)
                  if (phoneNumberId && userData.displayPhoneNumber && shouldSendLimitReached(existingJob.id)) {
                    await sendWhatsAppTextMessage({
                      to: userData.displayPhoneNumber,
                      message: `${waBold("Limit reached")}\nYou cannot add more than 30 files to a single job.\n\nPlease type ${waBold('"EDIT"')} to submit your current job or ${waBold('"CLEAR"')} to start a new one.`,
                      phoneNumberId,
                    });
                  }
                  if (waUser.userId) {
                    socket.emit("job-status-updated", waUser.userId, existingJob.id, "Limit reached: Maximum 30 files allowed per job.");
                  }
                  continue;
                }

                let printJobId: string;
                let isStale = false;

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

                  const newJob = await prisma.printJob.create({ data: createData });
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

                  if (existingJob.files.length > 0) {
                    const latestFile = existingJob.files[0];
                    if (latestFile) {
                      const ageMs = Date.now() - latestFile.createdAt.getTime();
                      if (ageMs > 30 * 60 * 1000) { // 30 minutes
                        isStale = true;
                      }
                    }
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
                    uploadedByDisplayName: userData.displayName || userData.displayPhoneNumber || null,
                    uploadedByUserId: waUser.userId ?? null,
                    uploadedByRole: "OWNER",
                    option: {
                      create: {
                        copies: 1,
                      },
                    },
                  },
                });

                if (phoneNumberId && userData.displayPhoneNumber) {
                  socket.emit("job-file-added", printJobId);
                  if (waUser.userId) {
                    socket.emit("job-file-added", waUser.userId);
                  }

                  // Queue confirmation — will be batched with other files arriving within 3s
                  queueFileConfirmation(
                    userData.displayPhoneNumber,
                    phoneNumberId,
                    { fileName: pdfFileName, pages },
                    isStale,
                    printJobId,
                    waUser.userId ?? null,
                  );
                }
              } catch (error) {
                console.log("Failed to process document:", error);
                if (phoneNumberId && userData.displayPhoneNumber) {
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    message: `${waBold("Error")}
Failed to process ${waBold(rawFileName)}.
Please try again.`,
                    phoneNumberId,
                  });
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

              try {
                // Step 1: Get the media URL from the image ID
                const mediaUrlRes = await fetch(
                  `https://graph.facebook.com/v21.0/${imageData.id}`,
                  { headers: { Authorization: `Bearer ${accessToken}` } },
                );
                if (!mediaUrlRes.ok) {
                  console.log("Failed to get media URL for image:", mediaUrlRes.status);
                  continue;
                }
                const mediaUrlData = await mediaUrlRes.json() as { url?: string };
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
                  console.log("Failed to download WhatsApp image:", imageResponse.status);
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
                const converted = await convertToPdfFromBuffer(imageBuffer, rawFileName);
                const pdfBuffer = converted.pdfBuffer;
                const pdfFileName = converted.pdfFileName;

                console.log(`Image converted to PDF: ${rawFileName} → ${pdfFileName}`);

                // Images always produce exactly 1 page; skip pdf-parse
                const pages = 1;

                const startedProcessingAt = new Date();
                if (userData.displayPhoneNumber) {
                  await prisma.whatsAppUser.upsert({
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
                  });
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

                if (existingJob && existingJob._count && existingJob._count.files >= 30) {
                  // Rate-limit "limit reached" per draft (max 2 per draft lifetime)
                  if (phoneNumberId && userData.displayPhoneNumber && shouldSendLimitReached(existingJob.id)) {
                    await sendWhatsAppTextMessage({
                      to: userData.displayPhoneNumber,
                      message: `${waBold("Limit reached")}\nYou cannot add more than 30 files to a single job.\n\nPlease type ${waBold('"EDIT"')} to submit or ${waBold('"CLEAR"')} to start fresh.`,
                      phoneNumberId,
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
                      uploadedByPhoneNumber: userData.displayPhoneNumber || null,
                      uploadedByDisplayName: userData.displayName || userData.displayPhoneNumber || null,
                      uploadedByUserId: waUser.userId ?? null,
                      uploadedByRole: "OWNER",
                      option: { create: defaultOptions },
                    },
                  });

                  if (waUser.userId) {
                    socket.emit("files-added", waUser.userId, existingJob.id);
                  }
                } else if (waUser.userId) {
                  const verificationCode = Math.floor(
                    1000 + Math.random() * 9000,
                  );
                  const newJob = await prisma.printJob.create({
                    data: {
                      userId: waUser.userId,
                      verificationCode,
                      totalCost: cost,
                      totalPages: pages,
                      estimatedTime: 1,
                      source: "WHATSAPP",
                      status: PrintJobStatus.DRAFT,
                    },
                  });
                  existingJob = { ...newJob, files: [], _count: { files: 0 } };

                  await prisma.file.create({
                    data: {
                      name: pdfFileName,
                      url: uploaded.url,
                      pages,
                      fileCost: cost,
                      printJobId: newJob.id,
                      uploadedByPhoneNumber: userData.displayPhoneNumber || null,
                      uploadedByDisplayName: userData.displayName || userData.displayPhoneNumber || null,
                      uploadedByUserId: waUser.userId ?? null,
                      uploadedByRole: "OWNER",
                      option: { create: defaultOptions },
                    },
                  });

                  socket.emit("files-added", waUser.userId, newJob.id);
                }

                // Queue confirmation — batched with other files arriving within 3s
                if (phoneNumberId && userData.displayPhoneNumber) {
                  const imageIsStale = !!(existingJob && existingJob.files.length > 0 && existingJob.files[0] && (Date.now() - existingJob.files[0].createdAt.getTime()) > 30 * 60 * 1000);
                  queueFileConfirmation(
                    userData.displayPhoneNumber,
                    phoneNumberId,
                    { fileName: pdfFileName, pages },
                    imageIsStale,
                    existingJob?.id ?? null,
                    waUser.userId ?? null,
                  );
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

            // Duplicate-aware rate limiting for text/interactive replies
            if (userData.displayPhoneNumber) {
              const rateResult = checkTextRateLimit(userData.displayPhoneNumber, messageText);
              if (rateResult === "skip") {
                console.log(`Rate-limited (skip) text reply to ${userData.displayPhoneNumber}: "${messageText}"`);
                continue;
              }
              if (rateResult === "warn") {
                console.log(`Rate-limited (warn) text reply to ${userData.displayPhoneNumber}: "${messageText}"`);
                if (phoneNumberId) {
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    message: `${waBold("Please don't spam")} \u26a0\ufe0f\nSending the same message repeatedly won't help. Continued abuse may result in your number being blocked.`,
                    phoneNumberId,
                  });
                }
                continue;
              }
              // rateResult === "reply" → proceed normally
            }

            if (userData.displayPhoneNumber) {
              await prisma.whatsAppUser.upsert({
                where: { phoneNumber: userData.displayPhoneNumber },
                create: {
                  phoneNumber: userData.displayPhoneNumber,
                  name: userData.displayName || null,
                },
                update: {
                  name: userData.displayName || null,
                },
                select: { phoneNumber: true },
              });
            }

            const waUser = userData.displayPhoneNumber
              ? await prisma.whatsAppUser.findUnique({
                  where: { phoneNumber: userData.displayPhoneNumber },
                  select: { userId: true },
                })
              : null;
            const isAuthenticated = !!waUser?.userId;

            if (!isAuthenticated && messageText !== "sync") {
              if (phoneNumberId && userData.displayPhoneNumber) {
                const syncLink = await getOrCreateWhatsAppSyncLink(
                  userData.displayPhoneNumber,
                );
                if (
                  messageText === "help" ||
                  messageText === "menu" ||
                  messageText === "command" ||
                  messageText === "commands"
                ) {
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    message: [
                      `${waBold("To use this, sync first:")}`,
                      syncLink ?? "Link unavailable",
                      "",
                      "_Link valid for 2 minutes._",
                    ].join("\n"),
                  });
                } else {
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    message: [
                      `${waBold("Welcome to Zopy!")} 🚀`,
                      "",
                      `Send your ${waBold("PDF, Word, or other files")} here.`,
                      "",
                      `${waBold("To use this, click the link below and sync first:")}`,
                      syncLink ?? "Link unavailable",
                      "",
                      "_Link valid for 2 minutes._",
                    ].join("\n"),
                  });
                }
              }
              continue;
            }

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
                    "",
                    `Send your ${waBold("PDF, Word, or other files")} here.`,
                    "",
                    `When you're done, type ${waBold('"EDIT"')} to review and submit.`,
                    "",
                    `Type ${waBold('"HELP"')} to see all options.`,
                  ].join("\n"),
                  buttons: [
                    { type: "reply", reply: { id: "help", title: "HELP" } },
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
                    "",
                    `1) Send documents`,
                    `2) Wait for confirmation`,
                    `3) Type ${waBold('"EDIT"')}`,
                    `4) Submit`,
                    "",
                    `You can send more files anytime before submitting.`,
                  ].join("\n"),
                  buttons: [
                    { type: "reply", reply: { id: "current", title: "CURRENT" } },
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
                    "",
                    `\u2022 ${waBold("STEPS")} \u2014 How it works`,
                    `\u2022 ${waBold("CURRENT")} \u2014 View documents`,
                    `\u2022 ${waBold("EDIT")} \u2014 Review & customize`,
                    `\u2022 ${waBold("SYNC")} \u2014 Sync WhatsApp with web`,
                    `\u2022 ${waBold("CLEAR")} \u2014 Delete draft`,
                    "",
                    `Start sending files, then type ${waBold('"EDIT"')} when done.`,
                  ].join("\n"),
                  buttons: [
                    { type: "reply", reply: { id: "steps", title: "STEPS" } },
                    { type: "reply", reply: { id: "current", title: "CURRENT" } },
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
                    message:
                      "*No jobs found yet.*\n\nSend a *document* to create your first job. \ud83d\udcc4",
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
            } else if (messageText === "current" || messageText === "status" || messageText === "merge") {
              const draftWhere = await getUnifiedDraftWhere(userData.displayPhoneNumber);
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
                      "",
                      `Send your documents and type ${waBold('"EDIT"')} when done.`,
                    ].join("\n"),
                    buttons: [
                      { type: "reply", reply: { id: "steps", title: "STEPS" } },
                    ],
                  });
                } else {
                  const fileLines = draftJob.files.map(
                    (file, index) => `${index + 1}. ${file.name}`
                  );
                  
                  await sendWhatsAppButtonMessage({
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    body: [
                      `${waBold("Your current documents:")}`,
                      "",
                      ...fileLines,
                      "",
                      `Send more files anytime.`,
                      "",
                      `Type ${waBold('"EDIT"')} to continue.`,
                    ].join("\n"),
                    buttons: [
                      { type: "reply", reply: { id: "edit", title: "EDIT" } },
                      { type: "reply", reply: { id: "clear", title: "CLEAR" } },
                    ],
                  });
                }
              }
            } else if (messageText === "clear" || messageText === "discard") {
              const clearWhere = await getUnifiedDraftWhere(userData.displayPhoneNumber);
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
                      `${waBold("Your draft has been cleared.")}`,
                      "",
                      "Send files to start a new printout.",
                      "",
                      `Type ${waBold('"HELP"')} if needed.`,
                    ].join("\n"),
                    phoneNumberId,
                  });
                }
                continue;
              }

              await prisma.printJob.delete({
                where: {
                  id: existingJob.id,
                },
              });

              await Promise.all(
                existingJob.files.map((file) =>
                  deleteObjectFromR2ByUrl(file.url),
                ),
              );

              if (phoneNumberId && userData.displayPhoneNumber) {
                await sendWhatsAppTextMessage({
                  to: userData.displayPhoneNumber,
                  message: [
                    `${waBold("Your draft has been cleared.")}`,
                    "",
                    "Send files to start a new printout.",
                    "",
                    `Type ${waBold('"HELP"')} if needed.`,
                  ].join("\n"),
                  phoneNumberId,
                });
              }
            } else if (messageText === "edit") {
              console.log(
                userData.displayPhoneNumber,
                "is trying to edit their job.",
              );
              const userRecord = await prisma.whatsAppUser.findUnique({
                where: {
                  phoneNumber: userData.displayPhoneNumber.toString(),
                },
                select: {
                  lastFileStartedProcessingAt: true,
                },
              });

              if (userRecord?.lastFileStartedProcessingAt) {
                const elapsedMs =
                  Date.now() - userRecord.lastFileStartedProcessingAt.getTime();
                if (elapsedMs < 7_000) {
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
              }

              const editWhere = await getUnifiedDraftWhere(userData.displayPhoneNumber.toString());
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
                      "",
                      `Send files first, then type ${waBold('"EDIT"')}.`,
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
                  await sendWhatsAppButtonMessage({
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    body: [
                      `${waBold("Customize your printout:")}`,
                      reviewUrl,
                      "",
                      "Edit your options, confirm, and print your job.",
                      `Type ${waBold('"CURRENT"')} to view your documents.`,
                      `_You can also delete files from the link._`,
                    ].join("\n"),
                    buttons: [
                      { type: "reply", reply: { id: "current", title: "CURRENT" } },
                    ],
                  });
                }
              }
            } else if (messageText === "sync") {
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
                const loginUrl = await getOrCreateWhatsAppSyncLink(
                  userData.displayPhoneNumber,
                );
                if (phoneNumberId) {
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    message: [
                      `${waBold("Sync using the link below:")}`,
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
                    "",
                    `Send your ${waBold("PDF, Word, or other files")} here.`,
                    "",
                    `When you're done, type ${waBold('"EDIT"')} to review and submit.`,
                    "",
                    `Type ${waBold('"HELP"')} to see all options.`,
                  ].join("\n"),
                  buttons: [
                    { type: "reply", reply: { id: "help", title: "HELP" } },
                  ],
                });
              }
            }
          }
        }
      }
    }
  }

  res.sendStatus(200);
};
