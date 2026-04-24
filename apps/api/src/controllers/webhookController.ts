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

                if (existingJob && existingJob._count && existingJob._count.files >= 15) {
                  // Fetch the files to list them
                  const jobFiles = await prisma.file.findMany({
                    where: { printJobId: existingJob.id },
                    select: { name: true, pages: true },
                    orderBy: { createdAt: "asc" },
                  });

                  if (phoneNumberId && userData.displayPhoneNumber) {
                    const fileListStr = jobFiles.map((f, i) => `${i + 1}. ${f.name}`).join("\n");
                    await sendWhatsAppTextMessage({
                      to: userData.displayPhoneNumber,
                      message: `${waBold("Limit reached")}
You cannot add more than 15 files to a single job.

*Current files in your job:*
${fileListStr}

Please type ${waBold('"EDIT"')} to submit your current job or ${waBold('"CLEAR"')} to start a new one.`,
                      phoneNumberId,
                    });
                  }
                  
                  // Also emit socket event to show toast on web
                  if (waUser.userId) {
                    socket.emit("job-status-updated", waUser.userId, existingJob.id, "Limit reached: Maximum 15 files allowed per job.");
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

                  // Always send the file received confirmation first
                  await sendWhatsAppButtonMessage({
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    body: [
                      `${waBold("File received!")}`,
                      `${pdfFileName} \u2022 ${pages} page(s)`,
                      "What would you like to do next?",
                    ].join("\n"),
                    buttons: [
                      { type: "reply", reply: { id: "edit", title: "EDIT" } },
                      { type: "reply", reply: { id: "current", title: "STATUS" } },
                    ],
                  });

                  // Additionally send the stale warning as a follow-up
                  if (isStale) {
                    // Fetch old files (added more than 30 min ago) to list them
                    const oldFiles = await prisma.file.findMany({
                      where: {
                        printJobId: printJobId,
                        createdAt: { lt: new Date(Date.now() - 30 * 60 * 1000) },
                      },
                      select: { name: true },
                      orderBy: { createdAt: "asc" },
                    });
                    const oldFileList = oldFiles.map((f, i) => `${i + 1}. ${f.name}`).join("\n");

                    await sendWhatsAppButtonMessage({
                      to: userData.displayPhoneNumber,
                      phoneNumberId,
                      body: [
                        `${waBold("Existing Files Found")} \u26a0\ufe0f`,
                        "Your draft contains old files (30+ min ago):",
                        oldFileList,
                        "",
                        `Type ${waBold('"EDIT"')} to visit the website and remove unwanted files using the ${waBold("✕ button")}.`,
                      ].join("\n"),
                      buttons: [
                        { type: "reply", reply: { id: "edit", title: "EDIT" } },
                      ],
                    });
                  }
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
              const mimeType = imageData?.mime_type || "image/jpeg";
              const mediaId = imageData?.id;
              const caption = imageData?.caption || "";
              console.log("Received image:", { mediaId, mimeType, caption });

              const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
              if (!accessToken || !mediaId) {
                console.log("Missing WhatsApp access token or image media ID.");
                continue;
              }

              try {
                if (userData.displayPhoneNumber) {
                  const timestampSeconds = Number(incomingMessage.timestamp);
                  const startedProcessingAt = Number.isFinite(timestampSeconds)
                    ? new Date(timestampSeconds * 1000)
                    : new Date();

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

                // Step 1: Get media URL from Graph API
                const mediaResponse = await fetch(
                  `https://graph.facebook.com/v21.0/${mediaId}`,
                  { headers: { Authorization: `Bearer ${accessToken}` } },
                );
                if (!mediaResponse.ok) {
                  console.log("Failed to get image media URL:", mediaResponse.status);
                  if (phoneNumberId && userData.displayPhoneNumber) {
                    await sendWhatsAppTextMessage({
                      to: userData.displayPhoneNumber,
                      message: `${waBold("Upload failed")}\nCouldn't process the image. Please try again.`,
                      phoneNumberId,
                    });
                  }
                  continue;
                }
                const mediaJson = (await mediaResponse.json()) as { url?: string };
                const mediaUrl = mediaJson.url;
                if (!mediaUrl) {
                  console.log("No URL in media response.");
                  continue;
                }

                // Step 2: Download the image
                const imageResponse = await fetch(mediaUrl, {
                  headers: { Authorization: `Bearer ${accessToken}` },
                });
                if (!imageResponse.ok) {
                  console.log("Failed to download image:", imageResponse.status);
                  if (phoneNumberId && userData.displayPhoneNumber) {
                    await sendWhatsAppTextMessage({
                      to: userData.displayPhoneNumber,
                      message: `${waBold("Upload failed")}\nCouldn't download the image. Please try again.`,
                      phoneNumberId,
                    });
                  }
                  continue;
                }

                const imageArrayBuffer = await imageResponse.arrayBuffer();
                const imageBuffer = Buffer.from(imageArrayBuffer);

                // Determine file extension from mime type
                const extMap: Record<string, string> = {
                  "image/jpeg": ".jpg",
                  "image/png": ".png",
                  "image/gif": ".gif",
                  "image/bmp": ".bmp",
                  "image/tiff": ".tiff",
                  "image/webp": ".webp",
                };
                const ext = extMap[mimeType] || ".jpg";
                const imageFileName = `whatsapp-image-${Date.now()}${ext}`;

                // Upload to R2 as image (SumatraPDF prints images natively)
                const key = buildR2ObjectKey(
                  userData.displayPhoneNumber || "whatsapp",
                  imageFileName,
                );
                const uploaded = await uploadBufferToR2({
                  key,
                  buffer: imageBuffer,
                  contentType: mimeType,
                });

                const pages = 1; // Images are always 1 page
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

                // Find or create draft job (same logic as document handler)
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
                      userMetadataId: userData.displayPhoneNumber,
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

                if (existingJob && existingJob._count && existingJob._count.files >= 15) {
                  const jobFiles = await prisma.file.findMany({
                    where: { printJobId: existingJob.id },
                    select: { name: true, pages: true },
                    orderBy: { createdAt: "asc" },
                  });

                  if (phoneNumberId && userData.displayPhoneNumber) {
                    const fileListStr = jobFiles.map((f, i) => `${i + 1}. ${f.name}`).join("\n");
                    await sendWhatsAppTextMessage({
                      to: userData.displayPhoneNumber,
                      message: `${waBold("Limit reached")}
You cannot add more than 15 files to a single job.

*Current files in your job:*
${fileListStr}

Please type ${waBold('"EDIT"')} to submit your current job or ${waBold('"CLEAR"')} to start a new one.`,
                      phoneNumberId,
                    });
                  }
                  
                  if (waUser.userId) {
                    socket.emit("job-status-updated", waUser.userId, existingJob.id, "Limit reached: Maximum 15 files allowed per job.");
                  }
                  continue;
                }

                // Check for stale files
                let isStale = false;
                if (existingJob && existingJob.files.length > 0) {
                  const latestFile = existingJob.files[0]!;
                  const ageMs = Date.now() - latestFile.createdAt.getTime();
                  isStale = ageMs > 30 * 60 * 1000;
                }

                if (existingJob) {
                  const newTotalPages = existingJob.totalPages + pages;
                  const newTotalCost = existingJob.totalCost + cost;

                  await prisma.file.create({
                    data: {
                      printJobId: existingJob.id,
                      name: imageFileName,
                      pages,
                      url: uploaded.url,
                      fileCost: cost,
                      uploadedByPhoneNumber: userData.displayPhoneNumber,
                      uploadedByDisplayName: userData.displayName || null,
                      uploadedByRole: "OWNER",
                      option: {
                        create: {
                          paperSize: "A4",
                          colorMode: "BW",
                          orientation: "PORTRAIT",
                          scaleMode: "FIT",
                          pageRange: "ALL",
                          customRange: "",
                          duplex: "ONE",
                          copies: 1,
                        },
                      },
                    },
                  });

                  await prisma.printJob.update({
                    where: { id: existingJob.id },
                    data: {
                      totalPages: newTotalPages,
                      totalCost: newTotalCost,
                      estimatedTime: calculateEstimatedTime(newTotalPages),
                    },
                  });
                } else {
                  const newJob = await prisma.printJob.create({
                    data: {
                      userId: waUser.userId || undefined,
                      userMetadataId: userData.displayPhoneNumber,
                      source: "WHATSAPP",
                      status: PrintJobStatus.DRAFT,
                      totalPages: pages,
                      totalCost: cost,
                      estimatedTime: calculateEstimatedTime(pages),
                      files: {
                        create: {
                          name: imageFileName,
                          pages,
                          url: uploaded.url,
                          fileCost: cost,
                          uploadedByPhoneNumber: userData.displayPhoneNumber,
                          uploadedByDisplayName: userData.displayName || null,
                          uploadedByRole: "OWNER",
                          option: {
                            create: {
                              paperSize: "A4",
                              colorMode: "BW",
                              orientation: "PORTRAIT",
                              scaleMode: "FIT",
                              pageRange: "ALL",
                              customRange: "",
                              duplex: "ONE",
                              copies: 1,
                            },
                          },
                        },
                      },
                    },
                  });
                  existingJob = {
                    id: newJob.id,
                    totalCost: newJob.totalCost,
                    totalPages: newJob.totalPages,
                    userId: newJob.userId,
                    files: [],
                  };
                }

                if (phoneNumberId && userData.displayPhoneNumber) {
                  socket.emit("job-file-added", existingJob.id);
                  if (waUser.userId) {
                    socket.emit("job-file-added", waUser.userId);
                  }
                  await sendWhatsAppButtonMessage({
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    body: [
                      `${waBold("Image received!")}`,
                      `${imageFileName} \u2022 1 page`,
                      "What would you like to do next?",
                    ].join("\n"),
                    buttons: [
                      { type: "reply", reply: { id: "edit", title: "EDIT" } },
                      { type: "reply", reply: { id: "current", title: "STATUS" } },
                    ],
                  });

                  if (isStale) {
                    // Fetch old files (added more than 30 min ago) to list them
                    const oldFiles = await prisma.file.findMany({
                      where: {
                        printJobId: existingJob.id,
                        createdAt: { lt: new Date(Date.now() - 30 * 60 * 1000) },
                      },
                      select: { name: true },
                      orderBy: { createdAt: "asc" },
                    });
                    const oldFileList = oldFiles.map((f, i) => `${i + 1}. ${f.name}`).join("\n");

                    await sendWhatsAppButtonMessage({
                      to: userData.displayPhoneNumber,
                      phoneNumberId,
                      body: [
                        `${waBold("Existing Files Found")} \u26a0\ufe0f`,
                        "Your draft contains old files (30+ min ago):",
                        oldFileList,
                        "",
                        `Type ${waBold('"EDIT"')} to visit the website and remove unwanted files using the ${waBold("✕ button")}.`,
                      ].join("\n"),
                      buttons: [
                        { type: "reply", reply: { id: "edit", title: "EDIT" } },
                      ],
                    });
                  }
                }
              } catch (error) {
                console.log("Failed to process image:", error);
                if (phoneNumberId && userData.displayPhoneNumber) {
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    message: `${waBold("Error")}\nFailed to process the image.\nPlease try again.`,
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
