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

                let pdfBuffer = buffer;
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
                    files: {
                      orderBy: { createdAt: "desc" },
                      take: 1,
                      select: { createdAt: true },
                    },
                  },
                });

                let printJobId = existingJob?.id;
                let isStale = false;

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
                  if (existingJob.files.length > 0) {
                    const latestFile = existingJob.files[0];
                    if (latestFile) {
                      const ageMs = Date.now() - latestFile.createdAt.getTime();
                      if (ageMs > 30 * 60 * 1000) { // 30 minutes
                        isStale = true;
                      }
                    }
                  }
                  
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

                  // Always send the file received confirmation first
                  await sendWhatsAppButtonMessage({
                    to: userData.displayPhoneNumber,
                    phoneNumberId,
                    body: [
                      `${waBold("File received!")} \u2705`,
                      "",
                      `${pdfFileName} \u2022 ${pages} page(s)`,
                      "",
                      "What would you like to do next?",
                    ].join("\n"),
                    buttons: [
                      { type: "reply", reply: { id: "edit", title: "EDIT" } },
                      { type: "reply", reply: { id: "current", title: "STATUS" } },
                    ],
                  });

                  // Additionally send the stale warning as a follow-up
                  if (isStale) {
                    await sendWhatsAppButtonMessage({
                      to: userData.displayPhoneNumber,
                      phoneNumberId,
                      body: [
                        `${waBold("Existing Files Found")} \u26a0\ufe0f`,
                        "",
                        "Your draft also contains files added more than 30 minutes ago.",
                        "",
                        "Options:",
                        `\u2022 Type ${waBold('"EDIT"')} to visit the website and individually delete files if you want — you can also continue adding more files to this draft.`,
                        `\u2022 Type ${waBold('"NEW"')} to remove all old files and keep only the file you just sent.`,
                      ].join("\n"),
                      buttons: [
                        { type: "reply", reply: { id: "edit", title: "EDIT" } },
                        { type: "reply", reply: { id: "new", title: "NEW" } },
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
                    `\u2022 ${waBold("LOGIN")} \u2014 Link to web`,
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
                if (elapsedMs < 15_000) {
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
                      "You can share this link with friends to add files and submit together.",
                      "",
                      `Type ${waBold('"CURRENT"')} to view your documents.`,
                      "",
                      `_Note: You can delete files from the link._`,
                    ].join("\n"),
                    buttons: [
                      { type: "reply", reply: { id: "current", title: "CURRENT" } },
                    ],
                  });
                }
              }
            } else if (messageText === "login") {
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
                    phoneNumberId,
                    message: [
                      `${waBold("Login using the link below:")}`,
                      loginUrl,
                      "",
                      "You can sync your WhatsApp files and manage them on https://zopy.co.in.",
                      "",
                      `Type ${waBold('"HELP"')} to view options.`,
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
