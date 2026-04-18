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
  return `${FRONTEND_BASE_URL}/review/${jobId}`;
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
                      message: `${waBold("Upload L")} 💀
Couldn't fetch ${waBold(rawFileName)}.
Resend it and we'll run it back. fr`,
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

                const existingJob = await prisma.printJob.findFirst({
                  where: {
                    userMetadata: {
                      phoneNumber: userData.displayPhoneNumber,
                    },
                    status: PrintJobStatus.DRAFT,
                  },
                  select: {
                    id: true,
                    totalCost: true,
                    totalPages: true,
                  },
                });

                let printJobId = existingJob?.id;

                if (!printJobId) {
                  const existingUser = await prisma.whatsAppUser.findUnique({
                    where: {
                      phoneNumber: userData.displayPhoneNumber,
                    },
                    select: {
                      phoneNumber: true,
                    },
                  });
                  if (!existingUser) {
                    throw new Error("WhatsApp user record not found.");
                  }

                  const newJob = await prisma.printJob.create({
                    data: {
                      totalCost: cost,
                      totalPages: pages,
                      estimatedTime: 0,
                      source: "WHATSAPP",
                      status: PrintJobStatus.DRAFT,
                      userMetadata: {
                        connect: {
                          phoneNumber: existingUser.phoneNumber,
                        },
                      },
                    },
                  });

                  printJobId = newJob.id;
                } else {
                  const nextTotalPages = (existingJob?.totalPages ?? 0) + pages;
                  const nextTotalCost = (existingJob?.totalCost ?? 0) + cost;
                  await prisma.printJob.update({
                    where: {
                      id: printJobId,
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
                    printJob: {
                      connect: {
                        id: printJobId,
                      },
                    },
                    option: {
                      create: {
                        copies: 1,
                      },
                    },
                  },
                });

                if (phoneNumberId && userData.displayPhoneNumber) {
                  socket.emit("job-file-added", printJobId);
                  await sendWhatsAppButtonMessage({
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    body: `${waBold("File received ✅")}
${waBold(pdfFileName)} • ${pages} page(s)

Next move? pick a button 👇`,
                    buttons: [
                      {
                        type: "reply",
                        reply: { id: "current", title: "Status check" },
                      },
                      {
                        type: "reply",
                        reply: { id: "edit", title: "Edit / Submit" },
                      },
                    ],
                  });
                }
              } catch (error) {
                console.log("Failed to process document:", error);
                if (phoneNumberId && userData.displayPhoneNumber) {
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    message: `${waBold("Processing L")} 🫠
Couldn't process ${waBold(rawFileName)}.
Resend it (or try a different file).`,
                    phoneNumberId,
                  });
                }
              }

              // Document handled — skip text/interactive logic below
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
                    waBold("yo 👋 welcome"),
                    "Send docs here — we'll auto-PDF + prep your print job. we cookin. fr",
                    "",
                    waBold("How it works (speedrun)"),
                    "1) Drop one or more files",
                    '2) Wait for "File received" on each',
                    '3) Tap "Edit job" → set options → submit',
                    "",
                    "Type *menu* anytime for commands.",
                  ].join("\n"),
                  buttons: [
                    { type: "reply", reply: { id: "help", title: "Menu" } },
                  ],
                });
              }
            } else if (messageText === "steps" || messageText === "guide") {
              if (phoneNumberId && userData.displayPhoneNumber) {
                await sendWhatsAppButtonMessage({
                  to: userData.displayPhoneNumber,
                  phoneNumberId,
                  body: [
                    waBold("How it works (speedrun)"),
                    "1) Send files here",
                    '2) Wait for "File received" on each file',
                    '3) Hit "Edit job" to tweak options',
                    "4) Submit = printing starts",
                    "",
                    "Tip: You can keep adding files before submit. no cap.",
                  ].join("\n"),
                  buttons: [
                    {
                      type: "reply",
                      reply: { id: "edit", title: "Edit / Submit" },
                    },
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
                    waBold("Menu (no cap)"),
                    "Type a command:",
                    "• steps — speedrun how it works",
                    "• current — draft status",
                    "• edit — get review link",
                    "• login — link WhatsApp ↔ web",
                    "• clear — wipe draft",
                    "• history — recent jobs",
                    "",
                    "Pro tip: start with *current*.",
                  ].join("\n"),
                  buttons: [
                    {
                      type: "reply",
                      reply: { id: "current", title: "Status check" },
                    },
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
                      "*No jobs yet.*\n\nSend a *document* and we'll cook up your first print run. fr",
                    phoneNumberId,
                  });
                } else {
                  const lines = jobs.reverse().map((job, index) => {
                    const reviewUrl = buildReviewUrl(job.id);
                    const link = reviewUrl ?? "Link unavailable";
                    if (job.status === PrintJobStatus.DRAFT) {
                      return `${index + 1}) Draft (still cooking) \u2022 ${link}`;
                    }
                    const shortId = job.verificationCode ?? "Job";
                    return `${index + 1}) ${shortId} \u2022 ${job.status} \u2022 ${link}`;
                  });
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    message: `${waBold("Recent jobs (recap)")}\n\n${lines.join("\n")}`,
                    phoneNumberId,
                  });
                }
              }
            } else if (messageText === "current" || messageText === "status") {
              const draftJob = await prisma.printJob.findFirst({
                where: {
                  userMetadata: {
                    phoneNumber: userData.displayPhoneNumber,
                  },
                  status: PrintJobStatus.DRAFT,
                },
                include: {
                  files: {
                    select: {
                      name: true,
                      pages: true,
                      option: true,
                    },
                  },
                },
                orderBy: {
                  createdAt: "desc",
                },
              });

              if (phoneNumberId && userData.displayPhoneNumber) {
                if (!draftJob) {
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    message:
                      "*No active draft rn.*\n\nSend a document to start one.",
                    phoneNumberId,
                  });
                } else {
                  const totalPages = draftJob.files.reduce(
                    (sum, file) => sum + file.pages,
                    0,
                  );
                  const totalCost = draftJob.files.reduce((sum, file) => {
                    if (!file.option) return sum;
                    return (
                      sum +
                      calculateFileCost(file.pages, {
                        paperSize: "A4",
                        colorMode: file.option.colorMode,
                        orientation: file.option.orientation,
                        scaleMode: file.option.scaleMode,
                        pageRange: file.option.pageRange,
                        customRange: file.option.customRange ?? "",
                        duplex: file.option.duplex,
                        copies: file.option.copies,
                      })
                    );
                  }, 0);
                  const fileLines = draftJob.files.length
                    ? draftJob.files.map(
                        (file, index) =>
                          `${index + 1}) ${file.name} \u2022 ${file.pages} pages`,
                      )
                    : ["No files yet. send one."];
                  const headerLine = draftJob.verificationCode
                    ? `${draftJob.verificationCode} \u2022 ${draftJob.status}`
                    : "Draft (still cooking)";
                  const lines = [
                    `*Draft check* \uD83E\uDDFE`,
                    headerLine,
                    `Total pages: ${totalPages}`,
                    `Estimated cost: ${totalCost}`,
                    "",
                    "*Files loaded:*",
                    ...fileLines,
                    "",
                  ];
                  const body = lines.join("\n");
                  await sendWhatsAppButtonMessage({
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    body:
                      body +
                      '\nNext: tap "Edit job" to tweak options + submit. bet.',
                    buttons: [
                      {
                        type: "reply",
                        reply: { id: "edit", title: "Edit / Submit" },
                      },
                    ],
                  });
                }
              }
            } else if (messageText === "clear" || messageText === "discard") {
              const existingJob = await prisma.printJob.findFirst({
                where: {
                  userMetadata: {
                    phoneNumber: userData.displayPhoneNumber,
                  },
                  status: PrintJobStatus.DRAFT,
                },
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
                    message: "*Nothing to clear rn.*\n\nSend a document first.",
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
                  message: `${waBold("Draft wiped ✅")}
Send a document anytime to start again. we go again.`,
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
                if (elapsedMs < 15_000) {
                  if (phoneNumberId && userData.displayPhoneNumber) {
                    await sendWhatsAppTextMessage({
                      to: userData.displayPhoneNumber,
                      message: `${waBold("Hold up")} 📥
Still receiving your file. Wait a few sec, then tap \"Edit job\" again.`,
                      phoneNumberId,
                    });
                  }
                  continue;
                }
              }

              const existingJob = await prisma.printJob.findFirst({
                where: {
                  userMetadata: {
                    phoneNumber: userData.displayPhoneNumber.toString(),
                  },
                  status: PrintJobStatus.DRAFT,
                },
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
                    message:
                      '*No draft to edit rn.*\n\nIf you just sent files, wait for the "File received" confirmations, then reply *edit*.\n\nTip: reply *history* to see recent jobs.',
                    phoneNumberId,
                  });
                }
                continue;
              }

              const reviewUrl = buildReviewUrl(existingJob.id);
              if (phoneNumberId && userData.displayPhoneNumber) {
                const message = reviewUrl
                  ? `*Edit your job options* \u270f\ufe0f\nUpdate print options and submit here:\n${reviewUrl}\n\n*Tip:* Reply with *history* to see past jobs.`
                  : "*Edit your job options* \u270f\ufe0f\nReply with *history* to see past jobs.";
                // sendWhatsAppStickerFromFile({
                //   to: userData.displayPhoneNumber,
                //   phoneNumberId,
                //   filePath: STICKER_FILE_PATH,
                //   mimeType: "image/webp",
                // });
                await sendWhatsAppTextMessage({
                  to: userData.displayPhoneNumber,
                  message: reviewUrl
                    ? [
                        waBold("Final boss: review 😤"),
                        "Open this link to tweak options + submit:",
                        reviewUrl,
                      ].join("\n")
                    : `${waBold("Review link is down rn")} ⚠️
Try again in a bit.`,
                  phoneNumberId,
                });
              }
            } else if (messageText === "login") {
              if (!FRONTEND_BASE_URL) {
                if (phoneNumberId && userData.displayPhoneNumber) {
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    message:
                      "*Login link is down rn* \u26a0\ufe0f\n\nTry again in a bit.",
                    phoneNumberId,
                  });
                }
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
                });

                const code = String(
                  Math.floor(100000 + Math.random() * 900000),
                );
                const expiresAt = new Date(Date.now() + 60_000);

                await prisma.whatsAppLoginOtp.deleteMany({
                  where: { phoneNumber: userData.displayPhoneNumber },
                });

                await prisma.whatsAppLoginOtp.create({
                  data: {
                    code,
                    phoneNumber: userData.displayPhoneNumber,
                    expiresAt,
                  },
                });

                const loginUrl = `${FRONTEND_BASE_URL}/auth/otp?code=${code}`;
                if (phoneNumberId) {
                  await sendWhatsAppTextMessage({
                    to: userData.displayPhoneNumber,
                    message: [
                      waBold("Link WhatsApp to web"),
                      "Open this within 60s (expires):",
                      loginUrl,
                    ].join("\n"),
                    phoneNumberId,
                  });
                }
              }
            } else {
              if (phoneNumberId && userData.displayPhoneNumber) {
                await sendWhatsAppButtonMessage({
                  to: userData.displayPhoneNumber,
                  phoneNumberId,
                  body: [
                    waBold("Zopy here 👋"),
                    "",
                    waBold("Start a print job"),
                    "Send your document files here — we'll auto-PDF + prep it.",
                    'When you\'re done, tap "Edit job" to tweak options + submit. bet.',
                  ].join("\n"),
                  buttons: [
                    { type: "reply", reply: { id: "help", title: "Menu" } },
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
